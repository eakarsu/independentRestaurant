import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  aiRateLimiter,
  callOpenRouter,
  parseAIJson,
  AiUnavailableError,
} from "@/lib/ai-helpers";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "anthropic/claude-3-5-sonnet-20241022";

/**
 * Persist the AI invocation to the AiResult JSONB audit log so a manager can
 * always replay/audit a recommendation without re-charging tokens.
 */
async function logAiResult(args: {
  feature: string;
  userId?: string | null;
  input: unknown;
  output?: unknown;
  rawText?: string;
  error?: string;
  durationMs: number;
  refType?: string;
  refId?: string;
}) {
  try {
    await prisma.aiResult.create({
      data: {
        feature: args.feature,
        userId: args.userId || null,
        model: OPENROUTER_MODEL,
        input: args.input as any,
        output: (args.output as any) ?? undefined,
        rawText: args.rawText,
        error: args.error,
        durationMs: args.durationMs,
        refType: args.refType,
        refId: args.refId,
      },
    });
  } catch (err) {
    console.error("Failed to persist AiResult", err);
  }
}

// ---------- one-shot AI runner used by every action below ----------
async function runAi<T = any>(
  feature: string,
  userId: string | null | undefined,
  systemPrompt: string,
  userPrompt: string,
  inputForLog: unknown,
): Promise<T> {
  const t0 = Date.now();
  let raw = "";
  try {
    raw = await callOpenRouter(systemPrompt, userPrompt, {
      jsonMode: true,
      maxTokens: 8000,
      temperature: 0.4,
    });
    const parsed = parseAIJson<T>(raw);
    await logAiResult({
      feature,
      userId,
      input: inputForLog,
      output: parsed as any,
      rawText: raw,
      durationMs: Date.now() - t0,
    });
    return parsed;
  } catch (err: any) {
    await logAiResult({
      feature,
      userId,
      input: inputForLog,
      rawText: raw,
      error: err?.message || String(err),
      durationMs: Date.now() - t0,
    });
    throw err;
  }
}

// AI endpoint for various features
export async function POST(request: NextRequest) {
  // Auth gate
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userKey = (session.user as any).id || session.user.email || "anon";

  // Per-user AI rate limit (20/hr)
  const limit = aiRateLimiter(userKey);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "AI rate limit exceeded — try again later.",
        resetAt: new Date(limit.resetAt).toISOString(),
      },
      { status: 429, headers: { "X-AI-RateLimit-Reset": String(limit.resetAt) } },
    );
  }

  try {
    const body = await request.json();
    const { action, data } = body;

    switch (action) {
      case "menu_optimization": {
        const items = await prisma.menuItem.findMany({
          include: {
            category: true,
            orderItems: {
              where: {
                createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
              },
            },
          },
        });

        const menuData = items
          .map((item) => {
            const salesCount = item.orderItems.reduce((sum, oi) => sum + oi.quantity, 0);
            const revenue = item.orderItems.reduce((sum, oi) => sum + oi.totalPrice, 0);
            const margin = item.cost ? ((item.price - item.cost) / item.price) * 100 : null;
            return {
              name: item.name,
              category: item.category?.name || "Uncategorized",
              price: item.price,
              cost: item.cost,
              salesCount,
              revenue,
              margin,
            };
          })
          // Top sellers first, capped so the AI response fits within the token limit.
          .sort((a, b) => b.salesCount - a.salesCount)
          .slice(0, 40);

        const systemPrompt = `You are a restaurant menu optimization expert. Reply STRICT JSON {"recommendations": [{"item","salesCount","revenue","margin","suggestion"}]}.`;
        const userPrompt = `Menu performance:\n${JSON.stringify(menuData)}`;
        const parsed = await runAi<any>(
          "menu_optimization",
          userKey,
          systemPrompt,
          userPrompt,
          { itemCount: menuData.length },
        );
        return NextResponse.json({ recommendations: parsed.recommendations || parsed });
      }

      case "demand_forecast": {
        const historicalOrders = await prisma.order.groupBy({
          by: ["createdAt"],
          where: {
            createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
            status: { not: "CANCELLED" },
          },
          _count: true,
        });

        const reservations = await prisma.reservation.findMany({
          where: {
            date: {
              gte: new Date(),
              lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            },
            status: { in: ["CONFIRMED", "PENDING"] },
          },
        });

        const orderSummary = historicalOrders.reduce((acc, day) => {
          const dow = new Date(day.createdAt).getDay();
          if (!acc[dow]) acc[dow] = [];
          acc[dow].push(day._count);
          return acc;
        }, {} as Record<number, number[]>);

        const systemPrompt = `Restaurant demand forecaster. Reply STRICT JSON {"forecast":[{"dayOfWeek","dayName","avgOrders","predictedCovers","confidence","notes"}]}.`;
        const userPrompt = `Historical (by DOW): ${JSON.stringify(orderSummary)}\nUpcoming reservations: ${JSON.stringify(reservations.map(r => ({ date: r.date, partySize: r.partySize })))}`;
        const parsed = await runAi<any>(
          "demand_forecast",
          userKey,
          systemPrompt,
          userPrompt,
          { reservations: reservations.length },
        );
        return NextResponse.json({ forecast: parsed.forecast || parsed });
      }

      case "inventory_prediction": {
        const ingredients = await prisma.ingredient.findMany({
          include: {
            vendor: true,
            stockMovements: {
              where: {
                createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
              },
            },
          },
        });

        const inventoryData = ingredients
          .map((ing) => {
            const usedMovements = ing.stockMovements.filter((m) => m.type === "USED");
            const totalUsed = usedMovements.reduce((sum, m) => sum + Math.abs(m.quantity), 0);
            return {
              name: ing.name,
              currentStock: ing.currentStock,
              unit: ing.unit,
              parLevel: ing.parLevel,
              totalUsed14Days: totalUsed,
              vendor: ing.vendor?.name,
            };
          })
          // Focus on the most depleted items so the response stays within token limits.
          .sort((a, b) => a.currentStock / (a.parLevel || 1) - b.currentStock / (b.parLevel || 1))
          .slice(0, 40);

        const systemPrompt = `Restaurant inventory expert. Reply STRICT JSON {"predictions":[{"ingredient","currentStock","unit","dailyUsage","daysUntilEmpty","suggestedOrder","urgent","notes"}]}.`;
        const parsed = await runAi<any>(
          "inventory_prediction",
          userKey,
          systemPrompt,
          `Inventory:\n${JSON.stringify(inventoryData)}`,
          { ingredients: inventoryData.length },
        );
        return NextResponse.json({ predictions: parsed.predictions || parsed });
      }

      case "review_response": {
        const { rating, comment, customerName } = data;
        const systemPrompt = `You write restaurant manager replies to customer reviews. Reply STRICT JSON {"response": "..."}.`;
        const userPrompt = `Review (${rating}-star) from ${customerName}: "${comment}"`;
        const parsed = await runAi<any>(
          "review_response",
          userKey,
          systemPrompt,
          userPrompt,
          { rating, customerName },
        );
        return NextResponse.json({ response: parsed.response || parsed });
      }

      case "marketing_generator": {
        const { type, occasion, restaurantName, specialItems } = data;
        const topItems = await prisma.menuItem.findMany({
          where: { isAvailable: true },
          take: 5,
          orderBy: { price: "desc" },
        });
        const systemPrompt = `Restaurant marketing copywriter. Reply STRICT JSON {"content":"..."}.`;
        const userPrompt = `Type:${type} Occasion:${occasion} Restaurant:${restaurantName || ""} Items:${topItems.map((i) => i.name).join(", ")} Special:${specialItems || ""}`;
        const parsed = await runAi<any>(
          "marketing_generator",
          userKey,
          systemPrompt,
          userPrompt,
          { type, occasion },
        );
        return NextResponse.json({ content: parsed.content || parsed });
      }

      case "staff_schedule": {
        const { date } = data;
        const targetDate = new Date(date);

        const staff = await prisma.staff.findMany({ where: { status: "ACTIVE" } });
        const reservations = await prisma.reservation.findMany({
          where: {
            date: {
              gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
              lt: new Date(new Date(date).setHours(23, 59, 59, 999)),
            },
            status: { in: ["CONFIRMED", "PENDING"] },
          },
        });
        const totalCovers = reservations.reduce((sum, r) => sum + r.partySize, 0);

        const systemPrompt = `Restaurant staffing planner. Reply STRICT JSON {"schedule":[{"role","recommended","shifts":[{"time","count"}]}]}.`;
        const userPrompt = `Date:${targetDate.toDateString()} Covers:${totalCovers} Roster:${JSON.stringify(
          staff.reduce((acc, s) => ({ ...acc, [s.position]: (acc[s.position] || 0) + 1 }), {} as Record<string, number>),
        )}`;
        const parsed = await runAi<any>(
          "staff_schedule",
          userKey,
          systemPrompt,
          userPrompt,
          { date, totalCovers },
        );
        return NextResponse.json({
          schedule: parsed.schedule || parsed,
          date: targetDate.toISOString(),
        });
      }

      case "cost_analysis": {
        const items = await prisma.menuItem.findMany({
          where: { cost: { not: null } },
          include: { category: true },
          // Cap so the JSON response stays within the token limit (264 menu items
          // would otherwise truncate the AI output).
          take: 40,
          orderBy: { price: "desc" },
        });
        const costData = items.map((item) => ({
          name: item.name,
          category: item.category?.name,
          price: item.price,
          cost: item.cost,
        }));
        const systemPrompt = `Restaurant cost analyst. Reply STRICT JSON {"analysis":[{"item","price","cost","costPercentage","profitMargin","recommendation"}]}.`;
        const parsed = await runAi<any>(
          "cost_analysis",
          userKey,
          systemPrompt,
          `Items:\n${JSON.stringify(costData)}`,
          { items: costData.length },
        );
        return NextResponse.json({ analysis: parsed.analysis || parsed });
      }

      case "customer_insights": {
        const customers = await prisma.customer.findMany({
          include: {
            orders: { include: { items: true }, take: 10 },
            reservations: { take: 5 },
            feedback: { take: 5 },
            loyaltyPoints: true,
          },
          take: 50,
        });
        const customerData = customers.map((c) => ({
          name: `${c.firstName} ${c.lastName}`,
          totalOrders: c.orders.length,
          totalSpent: c.orders.reduce((sum, o) => sum + o.total, 0),
          avgOrderValue:
            c.orders.length > 0
              ? c.orders.reduce((sum, o) => sum + o.total, 0) / c.orders.length
              : 0,
          loyaltyPoints: c.loyaltyPoints?.points || 0,
          reservations: c.reservations.length,
          feedbackCount: c.feedback.length,
        }));
        const systemPrompt = `Restaurant customer analyst. Reply STRICT JSON {"insights":[{"segment","customerCount","avgSpend","recommendations"}]}.`;
        const parsed = await runAi<any>(
          "customer_insights",
          userKey,
          systemPrompt,
          `Customers:\n${JSON.stringify(customerData)}`,
          { customers: customerData.length },
        );
        return NextResponse.json({ insights: parsed.insights || parsed });
      }

      case "voice_order": {
        const { transcript } = data;
        const menuItems = await prisma.menuItem.findMany({
          where: { isAvailable: true },
          include: { category: true },
        });
        const systemPrompt = `Voice ordering parser. Reply STRICT JSON {"items":[{"name","quantity","modifications"}],"clarifications":[],"total"}.\nMenu: ${menuItems.map((i) => `${i.name} ($${i.price})`).join(", ")}`;
        const parsed = await runAi<any>(
          "voice_order",
          userKey,
          systemPrompt,
          `Customer said: "${transcript}"`,
          { transcriptLength: transcript?.length },
        );
        return NextResponse.json(parsed);
      }

      default:
        return NextResponse.json({ error: "Unknown AI action" }, { status: 400 });
    }
  } catch (error: any) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "AI is not configured on this server (missing OPENROUTER_API_KEY)" },
        { status: 503 },
      );
    }
    console.error("AI error:", error);
    return NextResponse.json(
      { error: "AI processing failed", detail: error?.message || String(error) },
      { status: 500 },
    );
  }
}

// GET — list recent AI runs for inspection (paginated)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20")));
  const feature = sp.get("feature") || undefined;

  const where = feature ? { feature } : {};

  const [items, total] = await Promise.all([
    prisma.aiResult.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.aiResult.count({ where }),
  ]);

  return NextResponse.json({
    data: items,
    pagination: {
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
