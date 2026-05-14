/**
 * NEW FEATURE 2 — Waste-to-recipe recommender.
 *
 * Reads recent waste records + remaining inventory and asks the LLM to design
 * a daily "chef's special" that uses near-expiry / over-stocked ingredients.
 * The output is saved as a draft `MenuItem` (isAvailable=false, isSpecial=true)
 * so the manager can review/edit before publishing it.
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

  const where = { feature: "waste_to_recipe" };
  const [data, total] = await Promise.all([
    prisma.aiResult.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.aiResult.count({ where }),
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

  const limit = aiRateLimiter(userKey);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "AI rate limit exceeded", resetAt: new Date(limit.resetAt).toISOString() },
      { status: 429 },
    );
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const ingredients = await prisma.ingredient.findMany({
    include: {
      stockMovements: { where: { createdAt: { gte: since } } },
    },
  });

  // Score over-stocked or near-expiry ingredients first
  const candidates = ingredients
    .map((ing) => {
      const used = ing.stockMovements
        .filter((m) => m.type === "USED")
        .reduce((s, m) => s + Math.abs(m.quantity), 0);
      const dailyUsage = used / 14;
      const daysCover = dailyUsage > 0 ? ing.currentStock / dailyUsage : 999;
      const wasted = ing.stockMovements
        .filter((m) => m.type === "WASTED")
        .reduce((s, m) => s + Math.abs(m.quantity), 0);
      return {
        name: ing.name,
        unit: ing.unit,
        currentStock: ing.currentStock,
        wasted14d: wasted,
        daysCover: Math.round(daysCover),
      };
    })
    .filter((x) => x.daysCover < 8 || x.wasted14d > 0)
    .sort((a, b) => b.wasted14d - a.wasted14d || a.daysCover - b.daysCover)
    .slice(0, 25);

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No over-stocked or near-expiry ingredients detected.",
    });
  }

  // Find a category to attach the new MenuItem to
  const defaultCategory = await prisma.menuCategory.findFirst({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (!defaultCategory) {
    return NextResponse.json(
      { error: "No active menu category exists to attach the special to." },
      { status: 412 },
    );
  }

  const systemPrompt = `You are an executive chef AI. Design ONE daily "chef's special" that consumes the listed near-expiry or over-stocked ingredients. Reply STRICT JSON:
{"name":"...","description":"...","price":number,"cost":number,"ingredients":["...","..."],"reasoning":"..."}.
Constraints: price between $9 and $42, cost should be ≈ price * 0.30, ingredients drawn from the supplied list.`;

  let parsed: any = {};
  let raw = "";
  let errorMsg: string | undefined;
  const t0 = Date.now();
  try {
    raw = await callOpenRouter(systemPrompt, JSON.stringify(candidates), {
      jsonMode: true,
      maxTokens: 900,
      temperature: 0.7,
    });
    parsed = parseAIJson(raw);
  } catch (err: any) {
    errorMsg = err?.message || String(err);
  }

  let createdItem: any = null;
  if (!errorMsg && parsed?.name) {
    createdItem = await prisma.menuItem.create({
      data: {
        categoryId: defaultCategory.id,
        name: `[DRAFT] ${parsed.name}`,
        description: parsed.description || null,
        price: Number(parsed.price) || 14,
        cost: parsed.cost ? Number(parsed.cost) : null,
        isAvailable: false,
        isSpecial: true,
        specialStartDate: new Date(),
        specialEndDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  await prisma.aiResult.create({
    data: {
      feature: "waste_to_recipe",
      userId: userKey,
      model: OPENROUTER_MODEL,
      input: { candidates },
      output: parsed,
      rawText: raw,
      error: errorMsg,
      durationMs: Date.now() - t0,
      refType: "MenuItem",
      refId: createdItem?.id,
    },
  });

  if (errorMsg) {
    return NextResponse.json(
      { error: "Waste-to-recipe AI failed", detail: errorMsg },
      { status: errorMsg.includes("OPENROUTER_API_KEY") ? 503 : 500 },
    );
  }

  return NextResponse.json({ menuItem: createdItem, recommendation: parsed });
}
