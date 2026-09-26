/**
 * Engagement surfaces for the customer assistant.
 *
 * Fills five AmeritAI gaps that need no provider credentials:
 *   - Proactive Engagement   (non-intrusive bubble triggers)
 *   - Live Decision Engine   (real-time strategy shifts over conversation state)
 *   - Gamification & Wheel   (deterministic prize wheel)
 *   - Custom branding        (widget theming)
 *   - Widget Voice           (speech configuration)
 *
 * Rules: the decision engine names the rule that fired; the wheel is
 * provably fair over a stated prize table; bubble triggers fire on measured
 * dwell/scroll, never on invented intent.
 */

/* ------------------------- proactive engagement --------------------- */

export interface VisitorSignal {
  secondsOnPage: number;
  scrollDepthPct: number;
  pagesViewed: number;
  hasCart: boolean;
  isReturning: boolean;
}

export interface BubbleRule {
  id: string;
  message: string;
  trigger: string;
}

export function proactiveBubble(signal: VisitorSignal): {
  show: boolean;
  rule: BubbleRule | null;
  suppressedReason: string | null;
} {
  // Non-intrusive: at most one bubble, and only on a stated dwell threshold.
  if (signal.secondsOnPage < 20) {
    return { show: false, rule: null, suppressedReason: 'Under the 20-second dwell threshold.' };
  }
  const rules: BubbleRule[] = [
    {
      id: 'cart_reminder',
      message: 'Need a hand finishing your order?',
      trigger: 'Cart present and 20s dwell',
    },
    {
      id: 'browsing_menu',
      message: 'Looking for a recommendation? I can suggest a few.',
      trigger: 'Scrolled past 40% of the menu page',
    },
    {
      id: 'returning_guest',
      message: 'Welcome back — want your usual?',
      trigger: 'Returning visitor with 20s dwell',
    },
    {
      id: 'first_visit',
      message: 'First time here? Ask me anything about the menu.',
      trigger: 'Single page viewed for 20s',
    },
  ];

  let rule: BubbleRule | null = null;
  if (signal.hasCart) rule = rules[0];
  else if (signal.scrollDepthPct >= 40) rule = rules[1];
  else if (signal.isReturning) rule = rules[2];
  else if (signal.pagesViewed <= 1) rule = rules[3];

  return {
    show: !!rule,
    rule,
    suppressedReason: rule ? null : 'No trigger rule matched this visitor signal.',
  };
}

/* ------------------------ live decision engine ---------------------- */

export interface ConversationState {
  turnCount: number;
  sentiment: 'positive' | 'negative' | 'neutral' | 'insufficient-text';
  intent: string | null;
  hasLead: boolean;
  cartValue: number;
  handoffRequested: boolean;
}

export interface Decision {
  action: 'offer_human' | 'offer_booking' | 'offer_recommendation' | 'offer_lead_capture' | 'continue';
  reason: string;
  ruleId: string;
}

/**
 * Choose the next conversational action from measured state. Every decision
 * names the rule that produced it so the console can show *why* the assistant
 * shifted strategy.
 */
export function decideNext(state: ConversationState): Decision {
  if (state.handoffRequested) {
    return { action: 'offer_human', ruleId: 'handoff', reason: 'A handoff was requested.' };
  }
  if (state.sentiment === 'negative' && state.turnCount >= 1) {
    return {
      action: 'offer_human',
      ruleId: 'negative_sentiment',
      reason: 'Negative sentiment on a live turn — offer a person before the guest leaves.',
    };
  }
  if (state.intent === 'booking' && !state.hasLead) {
    return {
      action: 'offer_lead_capture',
      ruleId: 'booking_intent',
      reason: 'Booking intent without contact details on file.',
    };
  }
  if (state.turnCount >= 2 && !state.hasLead && state.cartValue === 0) {
    return {
      action: 'offer_lead_capture',
      ruleId: 'engaged_no_lead',
      reason: 'Two or more turns with no lead and no order value.',
    };
  }
  if (state.cartValue > 0 && state.cartValue < 25) {
    return {
      action: 'offer_recommendation',
      ruleId: 'basket_builder',
      reason: 'Cart below the 25.00 basket threshold — suggest a completing item.',
    };
  }
  return { action: 'continue', ruleId: 'default', reason: 'No shift warranted.' };
}

/* -------------------------- gamification ---------------------------- */

export interface Prize {
  id: string;
  label: string;
  weight: number;
}

export interface SpinResult {
  prize: Prize;
  /** Index on the wheel, for rendering. */
  index: number;
  totalWeight: number;
  fairness: string;
}

/**
 * Spin a prize wheel. Weighted and reproducible from the supplied RNG so the
 * outcome can be audited; the prize table is stated in the response.
 */
export function spinWheel(prizes: Prize[], rng: () => number = Math.random): SpinResult {
  if (!Array.isArray(prizes) || prizes.length < 2) {
    throw new Error('A wheel needs at least two prizes');
  }
  if (prizes.some((p) => !(p.weight > 0))) {
    throw new Error('Every prize needs a weight greater than zero');
  }
  const totalWeight = prizes.reduce((s, p) => s + p.weight, 0);
  const r = rng() * totalWeight;
  let acc = 0;
  let index = prizes.length - 1;
  for (let i = 0; i < prizes.length; i++) {
    acc += prizes[i].weight;
    if (r < acc) {
      index = i;
      break;
    }
  }
  return {
    prize: prizes[index],
    index,
    totalWeight,
    fairness: `Selected by a ${totalWeight}-weight spinner; prize "${prizes[index].label}" has weight ${prizes[index].weight}.`,
  };
}

/* ------------------------- custom branding -------------------------- */

export interface WidgetTheme {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  logoUrl: string | null;
  assistantName: string;
  greeting: string;
  position: 'bottom-right' | 'bottom-left';
}

export function widgetTheme(input: Partial<WidgetTheme> = {}): WidgetTheme {
  const hex = (v: string | undefined, fallback: string) =>
    v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  return {
    primaryColor: hex(input.primaryColor, '#0f766e'),
    backgroundColor: hex(input.backgroundColor, '#ffffff'),
    textColor: hex(input.textColor, '#0f172a'),
    accentColor: hex(input.accentColor, '#f59e0b'),
    logoUrl: input.logoUrl ?? null,
    assistantName: (input.assistantName ?? 'Assistant').slice(0, 40),
    greeting: (input.greeting ?? 'Hi! Ask me anything about the menu.').slice(0, 200),
    position: input.position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
  };
}

/* --------------------------- widget voice --------------------------- */

export interface VoiceConfig {
  enabled: boolean;
  language: string;
  /** Browser speech synthesis voice hint; null = platform default. */
  voiceHint: string | null;
  rate: number;
  speakReplies: boolean;
  note: string;
}

export function voiceConfig(input: Partial<VoiceConfig> = {}): VoiceConfig {
  const rate = Number(input.rate ?? 1);
  return {
    enabled: input.enabled !== false,
    language: (input.language ?? 'en-US').slice(0, 20),
    voiceHint: input.voiceHint ?? null,
    rate: Number.isFinite(rate) && rate >= 0.5 && rate <= 2 ? rate : 1,
    speakReplies: input.speakReplies !== false,
    note:
      'Speech uses the browser Web Speech API. Server-side transcription is not performed; ' +
      'a transcription provider would be required and is not configured here.',
  };
}