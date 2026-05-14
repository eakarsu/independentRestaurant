/**
 * NEW FEATURE 1 — Live demand-driven dynamic pricing.
 *
 * Combines inventory urgency (days-until-empty) with the last-30-day demand
 * profile, asks the LLM for per-item suggested price changes, then writes the
 * suggestions to DynamicPriceSuggestion in `pending` state. A manager later
 * approves / rejects via the routes below — no price changes auto-apply.
 *
 * GET   ?status=pending    list paginated suggestions
 * POST                     compute a fresh batch of suggestions (one per item)
 * PATCH /:id               approve | reject | apply (manager-only)
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  aiRateLimiter,
  callOpenRouter,
  parseAIJson,
} from "@/lib/ai-helpers";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "anthropic/claude-3-5-sonnet-20241022";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20")));
  const status = sp.get("status") || undefined;

  const where = status ? { status } : {};
  const [data, total] = await Promise.all([
    prisma.dynamicPriceSuggestion.findMany({
      where,
      include: { menuItem: { select: { name: true, price: true, category: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.dynamicPriceSuggestion.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function POST(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userKey = (session.user as any).id || session.user.email || "anon";

  const role = (session.user as any).role;
  if (role && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Manager access required" }, { status: 403 });
  }

  const limit = aiRateLimiter(userKey);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "AI rate limit exceeded", resetAt: new Date(limit.resetAt).toISOString() },
      { status: 429 },
    );
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sinceInv = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const items = await prisma.menuItem.findMany({
    where: { isAvailable: true },
    include: {
      category: true,
      orderItems: { where: { createdAt: { gte: since } } },
      ingredients: {
        include: {
          ingredient: {
            include: {
              stockMovements: { where: { createdAt: { gte: sinceInv } } },
            },
          },
        },
      },
    },
  });

  // Build the signal vector per item
  const signals = items.map((item) => {
    const sales = item.orderItems.reduce((s, oi) => s + oi.quantity, 0);
    const revenue = item.orderItems.reduce((s, oi) => s + oi.totalPrice, 0);
    // Inventory urgency: minimum days-until-empty across required ingredients
    let minDaysLeft = 999;
    let scarceIngredient: string | null = null;
    for (const link of item.ingredients) {
      const ing = link.ingredient;
      if (!ing) continue;
      const used = ing.stockMovements
        .filter((m) => m.type === "USED")
        .reduce((s, m) => s + Math.abs(m.quantity), 0);
      const dailyUsage = used / 14;
      const daysLeft = dailyUsage > 0 ? ing.currentStock / dailyUsage : 999;
      if (daysLeft < minDaysLeft) {
        minDaysLeft = daysLeft;
        scarceIngredient = ing.name;
      }
    }
    return {
      menuItemId: item.id,
      name: item.name,
      currentPrice: item.price,
      cost: item.cost,
      salesLast30d: sales,
      revenueLast30d: revenue,
      minIngredientDaysLeft: Math.round(minDaysLeft),
      scarceIngredient,
    };
  });

  const systemPrompt = `You are a restaurant revenue-management AI. Given per-menu-item demand and ingredient scarcity, suggest a price change for items where action is warranted.
Rules:
- Recommend a higher price when an ingredient has < 5 days of stock AND the item is selling well (use scarcity pricing).
- Recommend a lower price (small discount) when sales < 3 in 30 days.
- Otherwise recommend "hold" (set newPrice = currentPrice).
- Cap price changes to ±20% of current price.
Reply STRICT JSON: {"suggestions":[{"menuItemId","newPrice","reason"}]}`;

  let parsed: { suggestions: Array<{ menuItemId: string; newPrice: number; reason: string }> } = {
    suggestions: [],
  };
  let errorMsg: string | undefined;
  let raw = "";
  const t0 = Date.now();
  try {
    raw = await callOpenRouter(systemPrompt, JSON.stringify(signals), {
      jsonMode: true,
      maxTokens: 2200,
      temperature: 0.3,
    });
    parsed = parseAIJson(raw);
  } catch (err: any) {
    errorMsg = err?.message || String(err);
  }

  // Persist run + suggestions
  await prisma.aiResult.create({
    data: {
      feature: "dynamic_pricing",
      userId: userKey,
      model: OPENROUTER_MODEL,
      input: { itemCount: signals.length },
      output: parsed as any,
      rawText: raw,
      error: errorMsg,
      durationMs: Date.now() - t0,
    },
  });

  if (errorMsg) {
    if (errorMsg.includes("OPENROUTER_API_KEY")) {
      return NextResponse.json(
        { error: "AI is not configured (missing OPENROUTER_API_KEY)" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Pricing AI failed", detail: errorMsg }, { status: 500 });
  }

  // Insert suggestions, skipping no-ops
  const created: any[] = [];
  for (const s of parsed.suggestions || []) {
    const item = signals.find((x) => x.menuItemId === s.menuItemId);
    if (!item) continue;
    if (Math.abs(s.newPrice - item.currentPrice) < 0.01) continue;
    const row = await prisma.dynamicPriceSuggestion.create({
      data: {
        menuItemId: s.menuItemId,
        oldPrice: item.currentPrice,
        suggestedPrice: s.newPrice,
        reason: s.reason,
        signals: item as any,
      },
    });
    created.push(row);
  }

  return NextResponse.json({ created: created.length, suggestions: created });
}
