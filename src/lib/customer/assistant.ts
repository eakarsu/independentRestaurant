/**
 * Customer-facing AI assistant.
 *
 * Fills the gap against AmeritAI's core product — a 24/7 assistant that greets
 * visitors, answers questions, captures leads and hands off to a human — which
 * `independentRestaurant` did not have (its only AI endpoint was internal
 * manager advice).
 *
 * What this adds:
 *   - consent gate before a conversation starts (KVKK/GDPR-style)
 *   - a conversation with deterministic context (menu, hours, location)
 *   - guided next-step suggestions the customer can tap
 *   - lead capture from the conversation
 *   - human handoff with a callback request
 *   - sentiment + topic classification over the transcript (lexicon, not a model)
 *
 * Rules that keep it trustworthy in a restaurant:
 *   - no allergy or ingredient claims are invented; menu facts come from rows
 *   - consent is enforced before any turn is answered
 *   - handoff states its reason, so a manager can see why a table escalated
 */

export type ConsentState = 'none' | 'granted' | 'withdrawn';

export interface AssistantContext {
  restaurantName: string;
  hours?: string;
  address?: string;
  phone?: string;
  menuItems: { id: string | number; name: string; description?: string | null; price?: number | null; category?: string | null }[];
}

export interface ChatTurn {
  role: 'customer' | 'assistant';
  text: string;
  at: string;
}

/* ------------------------------ consent ------------------------------ */

export function evaluateConsent(state: ConsentState, now = new Date()): {
  allowed: boolean;
  reason: string;
} {
  if (state === 'withdrawn') {
    return { allowed: false, reason: 'Consent was withdrawn; no further messages are processed.' };
  }
  if (state !== 'granted') {
    return {
      allowed: false,
      reason: 'Data privacy consent is required before the assistant can process messages.',
    };
  }
  void now;
  return { allowed: true, reason: 'Consent recorded.' };
}

/* ------------------------------- menu -------------------------------- */

/** Match menu items to a question by name/category terms. Never invents. */
export function matchMenu(question: string, items: AssistantContext['menuItems'], limit = 3) {
  const q = question.toLowerCase();
  const scored = items
    .map((it) => {
      const hay = `${it.name} ${it.description ?? ''} ${it.category ?? ''}`.toLowerCase();
      let score = 0;
      for (const term of q.split(/[^a-z0-9]+/).filter((t) => t.length > 2)) {
        if (hay.includes(term)) score += term.length;
      }
      return { item: it, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    matches: scored.map((s) => ({
      id: s.item.id,
      name: s.item.name,
      description: s.item.description ?? null,
      price: s.item.price ?? null,
      category: s.item.category ?? null,
      score: s.score,
    })),
    matched: scored.length > 0,
  };
}

/* --------------------------- guided options -------------------------- */

const GUIDED: { intent: string; terms: string[]; options: string[] }[] = [
  { intent: 'menu', terms: ['menu', 'food', 'eat', 'dish', 'pizza', 'pasta', 'special'], options: ['Show me the menu', 'What do you recommend?', 'Any vegetarian options?'] },
  { intent: 'hours', terms: ['hour', 'open', 'close', 'when'], options: ['What are your hours?', 'Are you open now?'] },
  { intent: 'booking', terms: ['book', 'reserve', 'table', 'seat', 'party'], options: ['Book a table', 'Reserve for tonight'] },
  { intent: 'location', terms: ['where', 'address', 'location', 'directions', 'parking'], options: ['Where are you located?', 'Is there parking?'] },
  { intent: 'order', terms: ['order', 'takeout', 'delivery', 'pickup'], options: ['Order online', 'Delivery or pickup?'] },
  { intent: 'allergy', terms: ['allergy', 'gluten', 'nut', 'dairy', 'vegan', 'vegetarian'], options: ['Allergy information', 'Speak to a human'] },
];

export function guidedOptions(text: string, limit = 3): { intent: string; options: string[] }[] {
  const q = text.toLowerCase();
  const hits = GUIDED.filter((g) => g.terms.some((t) => q.includes(t)));
  return hits.slice(0, limit).map((g) => ({ intent: g.intent, options: g.options }));
}

/* --------------------------- sentiment/topics ------------------------ */

const POSITIVE = ['great', 'good', 'love', 'excellent', 'thanks', 'thank', 'awesome', 'perfect', 'delicious', 'amazing'];
const NEGATIVE = ['bad', 'terrible', 'awful', 'slow', 'cold', 'rude', 'wrong', 'disappointed', 'refund', 'complaint', 'sick'];
const TOPICS: { topic: string; terms: string[] }[] = [
  { topic: 'menu', terms: ['menu', 'food', 'dish', 'eat', 'order', 'special'] },
  { topic: 'price', terms: ['price', 'cost', 'how much', 'expensive', 'cheap', 'discount'] },
  { topic: 'hours', terms: ['hour', 'open', 'close', 'when'] },
  { topic: 'location', terms: ['where', 'address', 'parking', 'directions'] },
  { topic: 'booking', terms: ['book', 'reserve', 'table', 'party'] },
  { topic: 'service', terms: ['wait', 'slow', 'rude', 'manager', 'complaint', 'waiter'] },
  { topic: 'allergy', terms: ['allergy', 'gluten', 'vegan', 'nut', 'dairy'] },
];

export function analyseTranscript(turns: ChatTurn[]): {
  sentiment: 'positive' | 'negative' | 'neutral' | 'insufficient-text';
  sentimentScore: number;
  topics: { topic: string; share: number }[];
  matchedPositive: string[];
  matchedNegative: string[];
} {
  const text = turns.map((t) => t.text).join(' ').toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const pos = POSITIVE.filter((t) => text.includes(t));
  const neg = NEGATIVE.filter((t) => text.includes(t));
  const total = pos.length + neg.length;
  const score = total === 0 ? 0 : Number(((pos.length - neg.length) / total).toFixed(2));

  const topicHits = TOPICS.map((t) => ({
    topic: t.topic,
    hits: t.terms.filter((term) => text.includes(term)).length,
  })).filter((t) => t.hits > 0);
  const hitTotal = topicHits.reduce((s, t) => s + t.hits, 0) || 1;

  return {
    sentiment: words.length < 2 ? 'insufficient-text' : total === 0 ? 'neutral' : score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral',
    sentimentScore: score,
    topics: topicHits.map((t) => ({ topic: t.topic, share: Number((t.hits / hitTotal).toFixed(2)) })),
    matchedPositive: [...new Set(pos)],
    matchedNegative: [...new Set(neg)],
  };
}

/* ----------------------------- handoff ------------------------------- */

export const HANDOFF_TRIGGERS = ['manager', 'human', 'person', 'speak to', 'refund', 'complaint', 'angry', 'allergy', 'sick', 'poison', 'emergency', '911'];

export function needsHandoff(text: string): { handoff: boolean; reason: string | null } {
  const q = text.toLowerCase();
  for (const t of HANDOFF_TRIGGERS) {
    if (q.includes(t)) {
      return { handoff: true, reason: `Customer asked for a human or raised "${t}".` };
    }
  }
  return { handoff: false, reason: null };
}

/* ------------------------------- leads ------------------------------- */

export interface LeadCapture {
  name?: string;
  phone?: string;
  email?: string;
  partySize?: number;
  preferredAt?: string;
  note?: string;
}

/** Pull contact details the customer actually typed. Never guesses a format. */
export function extractLead(text: string): LeadCapture {
  const out: LeadCapture = {};
  const email = /[^\s@]+@[^\s@]+\.[^\s@]+/.exec(text);
  if (email) out.email = email[0];
  const phone = /(\+?\d[\d\s\-().]{7,}\d)/.exec(text);
  if (phone) out.phone = phone[0].trim();
  const party = /(?:party|table|for)\s*(?:of\s*)?(\d{1,2})/i.exec(text);
  if (party) out.partySize = Number(party[1]);
  return out;
}

/* ------------------------------ reply -------------------------------- */

/**
 * Compose an answer from matched menu rows and known facts. Where nothing
 * matches, it says so and offers guided options instead of inventing a fact.
 */
export function reply(
  question: string,
  ctx: AssistantContext,
  consent: ConsentState,
): {
  answer: string;
  menuMatches: ReturnType<typeof matchMenu>['matches'];
  guided: ReturnType<typeof guidedOptions>;
  handoff: ReturnType<typeof needsHandoff>;
  lead: LeadCapture;
  consentChecked: true;
} {
  const gate = evaluateConsent(consent);
  if (!gate.allowed) {
    return {
      answer: gate.reason,
      menuMatches: [],
      guided: [],
      handoff: { handoff: false, reason: null },
      lead: {},
      consentChecked: true,
    };
  }

  const menu = matchMenu(question, ctx.menuItems);
  const guided = guidedOptions(question);
  const handoff = needsHandoff(question);
  const lead = extractLead(question);

  const facts: string[] = [];
  if (/hour|open|close|when/i.test(question) && ctx.hours) facts.push(`We are open ${ctx.hours}.`);
  if (/where|address|location/i.test(question) && ctx.address) facts.push(`You'll find us at ${ctx.address}.`);

  const items = menu.matches
    .map((m) => `${m.name}${m.price != null ? ` — ${m.price}` : ''}`)
    .join('; ');

  let answer: string;
  if (handoff.handoff) {
    answer = `Of course — I'm passing you to a team member. ${handoff.reason ?? ''} ${ctx.phone ? `You can also reach us at ${ctx.phone}.` : ''}`.trim();
  } else if (facts.length) {
    answer = facts.join(' ');
  } else if (menu.matched) {
    answer = `Here's what I found: ${items}.`;
  } else if (/allergy|gluten|nut|dairy|vegan/i.test(question)) {
    answer =
      'I can tell you what is on the menu, but I cannot confirm allergen safety — please ask a team member, who can check with the kitchen.';
  } else {
    answer = `I'm not certain from our records. ${ctx.phone ? `Call us on ${ctx.phone}` : 'Ask a team member'} and I can also pass you to a person.`;
  }

  return { answer, menuMatches: menu.matches, guided, handoff, lead, consentChecked: true };
}
