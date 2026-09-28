/**
 * Restaurant-specific host capabilities.
 *
 * Closes the four gaps the AmeritAI restaurant vertical detail page names
 * that the homepage cards did not:
 *   - Menu & dishes: ingredients and allergen codes, not just price
 *   - Dietary questions: vegan / gluten-free / allergen answers
 *   - Reservation requests: create the booking, confirm to the guest, notify staff
 *   - Private events: capture birthday / group / private-event enquiries
 *
 * On allergens this deliberately differs from AmeritAI's "answers allergy
 * questions accurately": a wrong allergen answer is a safety harm. We state
 * what the recorded allergen codes say and always add a human confirmation
 * line. Nothing is inferred beyond the rows.
 */

export interface MenuItemFact {
  id: string | number;
  name: string;
  description?: string | null;
  price: number | null;
  allergens: string[];
  isAvailable: boolean;
  is86d: boolean;
}

/* ------------------------ menu & ingredients ------------------------ */

export interface DishAnswer {
  found: boolean;
  dishes: {
    id: string | number;
    name: string;
    price: number | null;
    description: string | null;
    allergenCodes: string[];
    /** Human-readable form of the recorded allergen codes. */
    contains: string[];
  }[];
  note: string;
}

/**
 * Answer a dish question from recorded rows. Ingredients are the recorded
 * allergen codes plus the description — a full ingredient list needs its own
 * field and is not invented here.
 */
export function describeDish(question: string, menu: MenuItemFact[], limit = 3): DishAnswer {
  const q = question.toLowerCase();
  const terms = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2);

  const scored = menu
    .map((m) => {
      const hay = `${m.name} ${m.description ?? ''}`.toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score += t.length;
      return { m, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    found: scored.length > 0,
    dishes: scored.map(({ m }) => ({
      id: m.id,
      name: m.name,
      price: m.price,
      description: m.description ?? null,
      allergenCodes: m.allergens ?? [],
      contains: (m.allergens ?? []).map((a) => a.toUpperCase()),
    })),
    note: scored.length
      ? 'Allergen codes are read from the recorded menu row. A full ingredient list is not held for these dishes.'
      : 'No recorded dish matched this question.',
  };
}

/* --------------------------- dietary ------------------------------- */

export interface DietaryAnswer {
  question: 'vegan' | 'gluten-free' | 'allergen' | 'other';
  matches: { id: string | number; name: string; allergenCodes: string[] }[];
  /** Always true for allergen questions — a person must confirm before service. */
  requiresHumanConfirmation: boolean;
  answer: string;
  safetyNotice: string | null;
}

const ALLERGEN_CODE_MAP: Record<string, string[]> = {
  dairy: ['milk', 'dairy', 'butter', 'cheese'],
  egg: ['egg'],
  fish: ['fish'],
  shellfish: ['shellfish', 'crab', 'lobster', 'shrimp'],
  gluten: ['gluten', 'wheat'],
  peanut: ['peanut'],
  soy: ['soy'],
  treenut: ['tree nut', 'almond', 'cashew', 'walnut'],
  sesame: ['sesame'],
};

/** Animal words used to keep vegan answers away from meat dishes. */
const NON_VEGAN_WORDS = [
  'beef', 'steak', 'chicken', 'pork', 'bacon', 'ham', 'sausage', 'lamb',
  'turkey', 'duck', 'meat', 'pepperoni', 'salami', 'fish', 'salmon', 'tuna',
  'shrimp', 'prawn', 'crab', 'lobster', 'anchovy', 'gelatin', 'honey',
];

export function answerDietary(question: string, menu: MenuItemFact[]): DietaryAnswer {
  const q = question.toLowerCase();
  const isVegan = /vegan/.test(q);
  const isGluten = /gluten|coeliac|celiac/.test(q);
  const isAllergen = /allerg|peanut|nut|dairy|milk|shellfish|gluten|soy|sesame|egg/i.test(q);

  const avoid: string[] = [];
  if (isVegan) avoid.push('dairy', 'egg', 'fish', 'shellfish');
  if (isGluten) avoid.push('gluten');

  const matches = menu
    .filter((m) => m.isAvailable && !m.is86d)
    .filter((m) => {
      const codes = (m.allergens ?? []).map((a) => a.toLowerCase());
      const haystack = `${m.name} ${m.description ?? ''}`.toLowerCase();
      if (isVegan && NON_VEGAN_WORDS.some((word) => haystack.includes(word))) return false;
      if (avoid.length) return !codes.some((c) => avoid.includes(c));
      // Allergen question: list dishes that do NOT contain the named allergen.
      for (const [code, words] of Object.entries(ALLERGEN_CODE_MAP)) {
        if (words.some((w) => q.includes(w)) && codes.includes(code)) return false;
      }
      return true;
    })
    .slice(0, 8)
    .map((m) => ({ id: m.id, name: m.name, allergenCodes: (m.allergens ?? []).map((a) => a.toUpperCase()) }));

  const kind: DietaryAnswer['question'] = isVegan ? 'vegan' : isGluten ? 'gluten-free' : isAllergen ? 'allergen' : 'other';

  return {
    question: kind,
    matches,
    requiresHumanConfirmation: isAllergen || isVegan || isGluten || kind === 'other',
    answer: matches.length
      ? `Based on recorded allergen codes and dish names, ${matches.length} dish(es) avoid what you asked about: ${matches.map((m) => m.name).join(', ')}.`
      : 'I could not find a dish that clearly avoids that based on our recorded allergen codes.',
    safetyNotice:
      isAllergen
        ? 'Allergen information is recorded per dish but is not a guarantee. Please confirm with a team member before ordering — they will check with the kitchen.'
        : isVegan || isGluten
          ? 'This is based on recorded allergen codes and dish names only, not a full ingredient list. Please confirm with a team member before ordering.'
          : null,
  };
}

/* --------------------- reservation + confirmation ------------------ */

export interface BookingRequest {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  date: string;
  time: string;
  note?: string;
}

export interface BookingResult {
  created: boolean;
  reservationId: string | number | null;
  confirmationMessage: string;
  staffNotification: { subject: string; body: string; reason: string };
  missingFields: string[];
}

/**
 * Create the booking and produce both messages. The guest confirmation and
 * the staff notification are returned together so neither can be forgotten.
 */
export function planBooking(req: Partial<BookingRequest>): BookingResult {
  const missing: string[] = [];
  if (!req.customerName?.trim()) missing.push('customerName');
  if (!req.customerPhone?.trim()) missing.push('customerPhone');
  if (!req.partySize || Number(req.partySize) <= 0) missing.push('partySize');
  if (!req.date) missing.push('date');
  if (!req.time) missing.push('time');

  const when = `${req.date ?? 'the requested date'} at ${req.time ?? 'the requested time'}`;
  const party = req.partySize ? ` for ${req.partySize}` : '';

  return {
    created: false,
    reservationId: null,
    confirmationMessage: missing.length
      ? `To book I still need: ${missing.join(', ')}.`
      : `Request received${party} on ${when}. The team will confirm it shortly — see you then!`,
    staffNotification: {
      subject: `Reservation request${party} — ${when}`,
      body:
        `New reservation request from ${req.customerName ?? 'guest'}` +
        `${req.customerPhone ? ` (${req.customerPhone})` : ''}` +
        `${req.customerEmail ? ` <${req.customerEmail}>` : ''}.\n` +
        `Party of ${req.partySize ?? '?'} on ${when}.` +
        (req.note ? `\nNote: ${req.note}` : ''),
      reason: 'A reservation request always notifies the team so the table can be confirmed.',
    },
    missingFields: missing,
  };
}

/* -------------------------- private events -------------------------- */

export type EventType = 'birthday' | 'group' | 'private_dining' | 'corporate' | 'other';

export interface EventEnquiry {
  eventType: EventType;
  name: string;
  contact: string;
  date?: string;
  partySize?: number;
  details?: string;
}

export interface EventCapture {
  captured: boolean;
  enquiry: EventEnquiry;
  routingReason: string;
  missingFields: string[];
  followUpMessage: string;
}

/**
 * Capture a private-event enquiry. These always go to the team — they are a
 * sales conversation, not something the assistant can quote.
 */
export function captureEventEnquiry(input: Partial<EventEnquiry>): EventCapture {
  const allowed: EventType[] = ['birthday', 'group', 'private_dining', 'corporate', 'other'];
  const eventType: EventType = allowed.includes(input.eventType as EventType) ? (input.eventType as EventType) : 'other';

  const missing: string[] = [];
  if (!input.name?.trim()) missing.push('name');
  if (!input.contact?.trim()) missing.push('contact');

  return {
    captured: missing.length === 0,
    enquiry: {
      eventType,
      name: input.name ?? '',
      contact: input.contact ?? '',
      date: input.date,
      partySize: input.partySize,
      details: input.details,
    },
    routingReason: `Private-event enquiry (${eventType}) routed to the events team for a tailored quote.`,
    missingFields: missing,
    followUpMessage: missing.length
      ? `I can pass this to our events team — just need your ${missing.join(' and ')}.`
      : `Thanks — I've passed your ${eventType.replace('_', ' ')} enquiry to our events team${input.date ? ` for ${input.date}` : ''}. They'll be in touch shortly.`,
  };
}