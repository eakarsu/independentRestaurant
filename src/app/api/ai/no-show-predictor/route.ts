/**
 * NEW FEATURE 3 — Reservation no-show predictor.
 *
 * For every customer with reservation history we compute a no-show probability
 * (heuristic baseline + LLM rationale) and persist a NoShowRiskScore row.
 * The host UI can then display a risk badge and suggest tolerated overbooking.
 *
 * GET                    list paginated current scores (newest first)
 * POST                   recompute scores for all customers with reservations
 * GET ?customerId=...    one customer's snapshot
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

function band(p: number): "low" | "medium" | "high" {
  if (p < 0.15) return "low";
  if (p < 0.4) return "medium";
  return "high";
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const customerId = sp.get("customerId");
  if (customerId) {
    const row = await prisma.noShowRiskScore.findFirst({
      where: { customerId },
      orderBy: { computedAt: "desc" },
    });
    return NextResponse.json(row);
  }
  const page = Math.max(1, parseInt(sp.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20")));
  const riskBand = sp.get("riskBand") || undefined;

  const where = riskBand ? { riskBand } : {};
  const [data, total] = await Promise.all([
    prisma.noShowRiskScore.findMany({
      where,
      orderBy: { computedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.noShowRiskScore.count({ where }),
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

  // Pull every reservation grouped by customerPhone (since some are guest reservations)
  const reservations = await prisma.reservation.findMany({
    select: {
      customerId: true,
      customerName: true,
      customerPhone: true,
      status: true,
      date: true,
      partySize: true,
    },
  });

  const buckets = new Map<
    string,
    {
      customerId: string | null;
      customerName: string;
      customerPhone: string | null;
      total: number;
      noShow: number;
      cancel: number;
      sumParty: number;
    }
  >();

  for (const r of reservations) {
    const key = r.customerId || r.customerPhone || r.customerName;
    if (!key) continue;
    const b =
      buckets.get(key) ||
      {
        customerId: r.customerId,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        total: 0,
        noShow: 0,
        cancel: 0,
        sumParty: 0,
      };
    b.total++;
    if (r.status === "NO_SHOW") b.noShow++;
    if (r.status === "CANCELLED") b.cancel++;
    b.sumParty += r.partySize;
    buckets.set(key, b);
  }

  const candidates = Array.from(buckets.values()).filter((b) => b.total >= 2);
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, written: 0, message: "No customers with ≥2 reservations." });
  }

  // Compact per-customer summary for the LLM
  const summary = candidates.map((c) => ({
    name: c.customerName,
    total: c.total,
    noShow: c.noShow,
    cancel: c.cancel,
    avgParty: +(c.sumParty / c.total).toFixed(1),
    baselineNoShow: +(c.noShow / c.total).toFixed(3),
  }));

  const systemPrompt = `You are a reservation risk analyst. For each customer return a no-show probability (0..1) and a one-line rationale. Reply STRICT JSON: {"scores":[{"name","probability","rationale"}]}.`;

  let parsed: any = { scores: [] };
  let raw = "";
  let errorMsg: string | undefined;
  const t0 = Date.now();
  try {
    raw = await callOpenRouter(systemPrompt, JSON.stringify(summary), {
      jsonMode: true,
      maxTokens: 2200,
      temperature: 0.2,
    });
    parsed = parseAIJson(raw);
  } catch (err: any) {
    errorMsg = err?.message || String(err);
  }

  // Map LLM rationales by name; fall back to baseline probability if missing
  const rationaleByName = new Map<string, { p: number; rationale: string }>();
  for (const s of parsed.scores || []) {
    rationaleByName.set(String(s.name), { p: Number(s.probability), rationale: String(s.rationale || "") });
  }

  let written = 0;
  for (const c of candidates) {
    const fromLlm = rationaleByName.get(c.customerName);
    const baseline = c.noShow / c.total;
    const p = fromLlm?.p ?? baseline;
    const rationale =
      fromLlm?.rationale ||
      `Baseline ${(baseline * 100).toFixed(0)}% no-show across ${c.total} reservations.`;
    await prisma.noShowRiskScore.create({
      data: {
        customerId: c.customerId,
        customerName: c.customerName,
        customerPhone: c.customerPhone,
        totalReservations: c.total,
        noShowCount: c.noShow,
        cancellationCount: c.cancel,
        riskScore: Math.max(0, Math.min(1, p)),
        riskBand: band(p),
        rationale,
      },
    });
    written++;
  }

  await prisma.aiResult.create({
    data: {
      feature: "no_show_predictor",
      userId: userKey,
      model: OPENROUTER_MODEL,
      input: { candidateCount: candidates.length },
      output: parsed,
      rawText: raw,
      error: errorMsg,
      durationMs: Date.now() - t0,
    },
  });

  return NextResponse.json({ ok: true, written });
}
