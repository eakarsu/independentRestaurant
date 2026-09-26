/**
 * Surveys, dynamic context, campaigns, efficiency and partners.
 *
 * Closes the last four AmeritAI gaps plus the partner program:
 *   - Survey & Polling       (shareable surveys, structured responses)
 *   - Dynamic Data Context   (live rows injected into a conversation)
 *   - Campaign Wizard        (build and run a campaign from a goal)
 *   - Efficiency Score       (analytics metric beside sentiment)
 *   - Partner Program        (referral attribution and commission ledger)
 *
 * Rules: survey results are counts of recorded responses and never invented;
 * dynamic context lists the rows it injected; a campaign states its steps
 * rather than pretending to have sent anything; the efficiency score names
 * the four inputs it combines.
 */

/* -------------------------- survey & polling ------------------------ */

export interface SurveyQuestion {
  id: string;
  prompt: string;
  kind: 'single' | 'multi' | 'text' | 'rating';
  options?: string[];
  required?: boolean;
}

export interface SurveyDefinition {
  id: string;
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  shareSlug: string;
}

export function createSurvey(input: {
  id: string;
  title: string;
  description?: string;
  questions: SurveyQuestion[];
}): SurveyDefinition {
  if (!input.title?.trim()) throw new Error('title is required');
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    throw new Error('At least one question is required');
  }
  for (const q of input.questions) {
    if (!q.id || !q.prompt?.trim()) throw new Error('Every question needs an id and a prompt');
    if ((q.kind === 'single' || q.kind === 'multi') && (!q.options || q.options.length < 2)) {
      throw new Error(`Question "${q.id}" needs at least two options`);
    }
  }
  return {
    id: input.id,
    title: input.title.trim(),
    description: input.description,
    questions: input.questions,
    shareSlug: String(input.id).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  };
}

export interface SurveyResponse {
  questionId: string;
  value: string | string[] | number;
}

export interface SurveyTally {
  questionId: string;
  prompt: string;
  kind: string;
  responses: number;
  /** Option counts for single/multi; null for text/rating. */
  counts: Record<string, number> | null;
  average: number | null;
}

/**
 * Tally recorded responses. A question with no responses reports zero and a
 * null average — never a fabricated distribution.
 */
export function tallySurvey(def: SurveyDefinition, responses: SurveyResponse[][]): SurveyTally[] {
  return def.questions.map((q) => {
    let n = 0;
    const counts: Record<string, number> = {};
    let sum = 0;
    let rated = 0;

    for (const resp of responses) {
      const hit = resp.find((r) => r.questionId === q.id);
      if (!hit) continue;
      n++;
      if (q.kind === 'single' || q.kind === 'multi') {
        const vals = Array.isArray(hit.value) ? hit.value : [String(hit.value)];
        for (const v of vals) counts[v] = (counts[v] ?? 0) + 1;
      } else if (q.kind === 'rating') {
        const v = Number(hit.value);
        if (Number.isFinite(v)) { sum += v; rated++; }
      }
    }

    return {
      questionId: q.id,
      prompt: q.prompt,
      kind: q.kind,
      responses: n,
      counts: q.kind === 'single' || q.kind === 'multi' ? counts : null,
      average: q.kind === 'rating' && rated > 0 ? Number((sum / rated).toFixed(2)) : null,
    };
  });
}

/* ------------------------ dynamic data context ---------------------- */

export interface ContextRow {
  kind: string;
  id: string | number;
  label: string;
  value: string;
}

export interface ContextResult {
  injected: ContextRow[];
  sourceQueries: string[];
  note: string;
}

/**
 * Build the live data a turn should see. Only the rows supplied are used —
 * the response lists exactly what was injected so an operator can see what the
 * assistant was told.
 */
export function buildContext(
  sections: { kind: string; rows: { id: string | number; label: string; value: string }[] }[],
  limitPerSection = 5,
): ContextResult {
  const injected: ContextRow[] = [];
  const sourceQueries: string[] = [];
  for (const s of sections ?? []) {
    sourceQueries.push(s.kind);
    for (const r of (s.rows ?? []).slice(0, limitPerSection)) {
      injected.push({ kind: s.kind, id: r.id, label: r.label, value: r.value });
    }
  }
  return {
    injected,
    sourceQueries,
    note: `Injected ${injected.length} row(s) from ${sourceQueries.length} source(s). Nothing is inferred beyond these rows.`,
  };
}

/* --------------------------- campaign wizard ------------------------ */

export type CampaignGoal = 'recover_carts' | 'fill_slow_shifts' | 'launch_dish' | 'collect_reviews';

export interface CampaignStep {
  order: number;
  channel: string;
  action: string;
  scheduledAt: string | null;
}

export interface CampaignPlan {
  id: string;
  goal: CampaignGoal;
  audienceRule: string;
  steps: CampaignStep[];
  budgetCents: number | null;
  status: 'draft';
  note: string;
}

const GOAL_STEPS: Record<CampaignGoal, { channel: string; action: string }[]> = {
  recover_carts: [
    { channel: 'web', action: 'Bubble reminder with the open cart listed' },
    { channel: 'sms', action: '30-minute abandoned-cart message' },
    { channel: 'email', action: '24-hour recap with a re-order link' },
  ],
  fill_slow_shifts: [
    { channel: 'web', action: 'Targeted offer to nearby lapsed guests' },
    { channel: 'sms', action: 'Same-day availability message' },
    { channel: 'email', action: 'Week-ahead reminder with booking link' },
  ],
  launch_dish: [
    { channel: 'web', action: 'Proactive bubble on the menu page' },
    { channel: 'email', action: 'Announcement to opted-in guests' },
    { channel: 'social', action: 'Post the dish with a booking link' },
  ],
  collect_reviews: [
    { channel: 'web', action: 'Post-meal survey prompt' },
    { channel: 'sms', action: 'One-time review request' },
  ],
};

/**
 * Turn a goal into an ordered plan. Steps come from a stated table per goal;
 * nothing is sent and no audience is contacted here.
 */
export function planCampaign(input: {
  id: string;
  goal: CampaignGoal;
  audienceRule: string;
  budgetCents?: number | null;
}): CampaignPlan {
  const steps = GOAL_STEPS[input.goal];
  if (!steps) {
    throw new Error(`goal must be one of: ${Object.keys(GOAL_STEPS).join(', ')}`);
  }
  if (!input.audienceRule?.trim()) throw new Error('audienceRule is required');

  return {
    id: input.id,
    goal: input.goal,
    audienceRule: input.audienceRule.trim(),
    steps: steps.map((s, i) => ({
      order: i + 1,
      channel: s.channel,
      action: s.action,
      scheduledAt: null,
    })),
    budgetCents: input.budgetCents ?? null,
    status: 'draft',
    note: 'Plan only. No message is sent and no audience is contacted until the steps are scheduled and a channel is configured.',
  };
}

/* -------------------------- efficiency score ------------------------ */

export interface EfficiencyInputs {
  turns: number;
  resolvedWithoutHandoff: number;
  leadsCaptured: number;
  ordersPlaced: number;
  medianResponseMs: number;
}

export interface EfficiencyResult {
  score: number;
  components: {
    name: string;
    value: number;
    weight: number;
    contribution: number;
    basis: string;
  }[];
  assumptions: string[];
}

/**
 * Efficiency score as a stated weighted sum of four measured rates. Every
 * component and its weight is returned, so the number can be recomputed.
 */
export function efficiencyScore(input: EfficiencyInputs): EfficiencyResult {
  const turns = Number(input.turns) || 0;
  const rate = (n: number) => (turns > 0 ? Math.max(0, Math.min(1, Number(n) / turns)) : 0);
  const ms = Number(input.medianResponseMs) || 0;
  // Response speed: 1 at 0 ms, 0 at 5000 ms or worse.
  const speed = Math.max(0, Math.min(1, 1 - ms / 5000));

  const components = [
    {
      name: 'resolution_without_handoff',
      value: Number(rate(input.resolvedWithoutHandoff).toFixed(3)),
      weight: 0.35,
      basis: `${input.resolvedWithoutHandoff} of ${turns} turns ended without escalation`,
    },
    {
      name: 'lead_capture',
      value: Number(rate(input.leadsCaptured).toFixed(3)),
      weight: 0.25,
      basis: `${input.leadsCaptured} leads from ${turns} turns`,
    },
    {
      name: 'order_conversion',
      value: Number(rate(input.ordersPlaced).toFixed(3)),
      weight: 0.25,
      basis: `${input.ordersPlaced} orders from ${turns} turns`,
    },
    {
      name: 'response_speed',
      value: Number(speed.toFixed(3)),
      weight: 0.15,
      basis: `median response ${ms} ms against a 5000 ms ceiling`,
    },
  ].map((c) => ({ ...c, contribution: Number((c.value * c.weight).toFixed(4)) }));

  const score = Number((components.reduce((s, c) => s + c.contribution, 0) * 100).toFixed(1));

  return {
    score,
    components,
    assumptions: [
      'Score is the weighted sum of four measured rates: 0.35 resolution + 0.25 lead + 0.25 order + 0.15 speed.',
      'Each rate is clamped to 0..1 against the turn count supplied.',
      'Weights are stated here so the score can be recomputed; none are tuned by a model.',
    ],
  };
}

/* -------------------------- partner program ------------------------- */

export interface PartnerReferral {
  partnerCode: string;
  referredAccountId: string;
  planMonthlyCents: number;
}

export interface CommissionEntry {
  partnerCode: string;
  referredAccountId: string;
  month: string;
  amountCents: number;
  commissionCents: number;
  status: 'accrued';
}

export function accrueCommission(
  referrals: PartnerReferral[],
  opts: { ratePct: number; months?: number; startMonth?: string },
): { ratePct: number; entries: CommissionEntry[]; totalCommissionCents: number; assumptions: string[] } {
  const rate = Number(opts.ratePct);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error('ratePct must be between 0 and 100');
  }
  const months = Math.max(1, Math.min(36, Number(opts.months ?? 12)));

  const entries: CommissionEntry[] = [];
  for (const r of referrals) {
    if (!(r.planMonthlyCents > 0)) continue;
    for (let m = 0; m < months; m++) {
      const base = opts.startMonth ? new Date(`${opts.startMonth}-01T00:00:00Z`) : new Date();
      const d = new Date(base);
      d.setUTCMonth(d.getUTCMonth() + m);
      const month = d.toISOString().slice(0, 7);
      const commission = Math.round((r.planMonthlyCents * rate) / 100);
      entries.push({
        partnerCode: r.partnerCode,
        referredAccountId: r.referredAccountId,
        month,
        amountCents: r.planMonthlyCents,
        commissionCents: commission,
        status: 'accrued',
      });
    }
  }

  return {
    ratePct: rate,
    entries,
    totalCommissionCents: entries.reduce((s, e) => s + e.commissionCents, 0),
    assumptions: [
      `Commission is ${rate}% of the referred plan's monthly fee, accrued for ${months} month(s).`,
      'Amounts are accrued, not paid; payouts are a separate ledger.',
      'Only referrals with a positive monthly plan fee are accrued.',
    ],
  };
}