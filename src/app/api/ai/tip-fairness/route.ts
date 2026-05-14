/**
 * NEW FEATURE 4 — Tip-fairness analyzer.
 *
 * Computes the actual share of pooled tips per staff member vs the "fair"
 * share (proportional to scheduled hours weighted by position). The Gini index
 * gives a single inequality number; the LLM produces an explanation and flags
 * staff who deviate from fair share by more than ±15 %.
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

// Position weights — front-of-house earns higher tip share.
const POSITION_WEIGHTS: Record<string, number> = {
  Server: 1.0,
  Bartender: 1.0,
  Host: 0.5,
  Busser: 0.7,
  Runner: 0.8,
  Chef: 0.4,
  "Sous Chef": 0.4,
  "Line Cook": 0.4,
};

function gini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * sorted[i];
  return (2 * cum) / (n * total) - (n + 1) / n;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20")));

  const [data, total] = await Promise.all([
    prisma.tipFairnessReport.findMany({
      orderBy: { periodEnd: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.tipFairnessReport.count(),
  ]);
  return NextResponse.json({
    data,
    pagination: { page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({}));
  const periodEnd = body.periodEnd ? new Date(body.periodEnd) : new Date();
  const periodStart = body.periodStart
    ? new Date(body.periodStart)
    : new Date(periodEnd.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Pull tips + schedules in window
  const [tips, schedules, staff] = await Promise.all([
    prisma.tipDistribution.findMany({
      where: { date: { gte: periodStart, lte: periodEnd } },
    }),
    prisma.schedule.findMany({
      where: { date: { gte: periodStart, lte: periodEnd } },
    }),
    prisma.staff.findMany({ where: { status: "ACTIVE" } }),
  ]);

  // Aggregate per-staff actual tips + scheduled weighted hours
  type Row = { staffId: string; name: string; position: string; actual: number; weightedHours: number };
  const byStaff = new Map<string, Row>();
  for (const s of staff) {
    byStaff.set(s.id, {
      staffId: s.id,
      name: `${s.firstName} ${s.lastName}`,
      position: s.position,
      actual: 0,
      weightedHours: 0,
    });
  }
  for (const t of tips) {
    const r = byStaff.get(t.staffId);
    if (r) r.actual += t.amount;
  }
  for (const sch of schedules) {
    const r = byStaff.get(sch.staffId);
    if (!r) continue;
    const hours =
      (new Date(sch.endTime).getTime() - new Date(sch.startTime).getTime()) / (60 * 60 * 1000);
    const w = POSITION_WEIGHTS[r.position] ?? 0.5;
    r.weightedHours += Math.max(0, hours) * w;
  }

  const totalTips = Array.from(byStaff.values()).reduce((s, r) => s + r.actual, 0);
  const totalWeighted = Array.from(byStaff.values()).reduce((s, r) => s + r.weightedHours, 0);

  const flagged: any[] = [];
  const distributionForGini: number[] = [];
  for (const r of byStaff.values()) {
    if (r.weightedHours === 0 && r.actual === 0) continue;
    const fairShare = totalWeighted > 0 ? (r.weightedHours / totalWeighted) * totalTips : 0;
    const delta = r.actual - fairShare;
    const deltaPct = fairShare > 0 ? (delta / fairShare) * 100 : null;
    distributionForGini.push(r.actual);
    if (deltaPct !== null && Math.abs(deltaPct) >= 15) {
      flagged.push({
        staffId: r.staffId,
        name: r.name,
        position: r.position,
        fairShare: +fairShare.toFixed(2),
        actual: +r.actual.toFixed(2),
        deltaPct: +deltaPct.toFixed(1),
      });
    }
  }

  const giniIndex = +gini(distributionForGini).toFixed(3);

  // Ask the LLM for a one-paragraph explanation
  const systemPrompt = `You are a hospitality compensation analyst. Given per-staff fair-share vs actual tip allocations, write a concise paragraph (≤120 words) explaining the inequality and the most likely operational cause. Reply STRICT JSON {"summary":"..."}.`;
  let summary = "";
  let raw = "";
  let errorMsg: string | undefined;
  const t0 = Date.now();
  try {
    raw = await callOpenRouter(
      systemPrompt,
      JSON.stringify({ giniIndex, flagged, totalTips, totalWeighted }),
      { jsonMode: true, maxTokens: 600, temperature: 0.4 },
    );
    summary = parseAIJson<any>(raw).summary || "";
  } catch (err: any) {
    errorMsg = err?.message || String(err);
    summary = `Gini ${giniIndex}; ${flagged.length} staff outside ±15% fair share. (LLM unavailable)`;
  }

  const report = await prisma.tipFairnessReport.create({
    data: {
      periodStart,
      periodEnd,
      giniIndex,
      flagged: flagged as any,
      summary,
    },
  });

  await prisma.aiResult.create({
    data: {
      feature: "tip_fairness",
      userId: userKey,
      model: OPENROUTER_MODEL,
      input: { periodStart, periodEnd, totalTips, totalWeighted, flaggedCount: flagged.length },
      output: { giniIndex, flagged, summary } as any,
      rawText: raw,
      error: errorMsg,
      durationMs: Date.now() - t0,
      refType: "TipFairnessReport",
      refId: report.id,
    },
  });

  return NextResponse.json(report);
}
