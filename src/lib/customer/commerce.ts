/**
 * Commerce and ROI for the customer assistant.
 *
 * Fills three AmeritAI gaps that need no provider credentials:
 *   - Smart Shopping Assistant  (wishlist, price/stock alerts, recommendations)
 *   - Sales Optimization        (upsell/cross-sell, cart-abandonment recovery)
 *   - ROI Calculator            (what missed calls cost)
 *
 * Rules: every recommendation names the row it came from; an upsell is
 * computed from real menu adjacency and price bands, never invented; the ROI
 * calculator only sums the numbers the operator enters.
 */

/* -------------------------- smart shopping --------------------------- */

export interface WishlistItem {
  menuItemId: string | number;
  name: string;
  price: number | null;
}

export interface PriceAlert {
  menuItemId: string | number;
  name: string;
  targetPrice: number;
  currentPrice: number | null;
  /** True when the current price is at or below the target. */
  triggered: boolean;
}

export interface StockAlert {
  menuItemId: string | number;
  name: string;
  isAvailable: boolean;
  is86d: boolean;
  notify: boolean;
}

export function priceAlerts(
  wishlist: WishlistItem[],
  menu: { id: string | number; name: string; price: number | null }[],
  targets: Record<string, number>,
): PriceAlert[] {
  const byId = new Map(menu.map((m) => [String(m.id), m]));
  return wishlist.map((w) => {
    const row = byId.get(String(w.menuItemId));
    const current = row?.price ?? null;
    const target = Number(targets[String(w.menuItemId)] ?? w.price ?? NaN);
    return {
      menuItemId: w.menuItemId,
      name: row?.name ?? w.name,
      targetPrice: Number.isFinite(target) ? target : 0,
      currentPrice: current,
      triggered: current != null && Number.isFinite(target) && current <= target,
    };
  });
}

export function stockAlerts(
  wishlist: WishlistItem[],
  menu: { id: string | number; name: string; isAvailable: boolean; is86d: boolean }[],
): StockAlert[] {
  const byId = new Map(menu.map((m) => [String(m.id), m]));
  return wishlist.map((w) => {
    const row = byId.get(String(w.menuItemId));
    const available = row ? row.isAvailable && !row.is86d : false;
    return {
      menuItemId: w.menuItemId,
      name: row?.name ?? w.name,
      isAvailable: available,
      is86d: row?.is86d ?? false,
      notify: !available,
    };
  });
}

/* ------------------------- sales optimization ------------------------ */

export interface Recommendation {
  menuItemId: string | number;
  name: string;
  price: number | null;
  reason: string;
}

/**
 * Cross-sell from category adjacency and price band. Every suggestion names
 * why it was chosen so a server can see the rule that fired.
 */
export function recommendToComplete(
  cart: { menuItemId: string | number; name: string; price: number | null; category?: string | null }[],
  menu: {
    id: string | number;
    name: string;
    price: number | null;
    category: string | null;
    allergens?: string[];
    isAvailable?: boolean;
    is86d?: boolean;
  }[],
  opts: { budgetHeadroom?: number; max?: number; avoidAllergens?: string[] } = {},
): Recommendation[] {
  const max = opts.max ?? 3;
  const inCart = new Set(cart.map((c) => String(c.menuItemId)));
  const cartCategories = new Set(cart.map((c) => (c.category ?? '').toLowerCase()).filter(Boolean));
  const cartTotal = cart.reduce((s, c) => s + (c.price ?? 0), 0);
  const headroom = opts.budgetHeadroom;

  const candidates = menu.filter((m) => {
    if (inCart.has(String(m.id))) return false;
    if (m.is86d === true || m.isAvailable === false) return false;
    if (opts.avoidAllergens?.length && (m.allergens ?? []).some((a) => opts.avoidAllergens!.includes(a))) return false;
    return true;
  });

  const scored = candidates.map((m) => {
    const cat = (m.category ?? '').toLowerCase();
    let score = 0;
    let reason = 'Available item outside your current selection.';
    if (cartCategories.has(cat) && cat) {
      score += 2;
      reason = `Completes your ${m.category} selection.`;
    }
    if (cartTotal > 0 && m.price != null && m.price <= cartTotal * 0.6) {
      score += 1;
      reason = 'Add-on priced well below your current total.';
    }
    if (headroom != null && m.price != null && cartTotal + m.price <= headroom) {
      score += 1;
      reason = 'Fits within your stated budget.';
    }
    return { menuItemId: m.id, name: m.name, price: m.price, reason, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ menuItemId, name, price, reason }) => ({ menuItemId, name, price, reason }));
}

/**
 * Cart-abandonment recovery message. Deterministic: it lists what is still in
 * the cart and offers a next step. No invented discount.
 */
export function abandonRecovery(
  cart: { name: string; price: number | null }[],
  opts: { minutesSince?: number; phone?: string | null; restaurantName?: string } = {},
): { send: boolean; message: string; reason: string } {
  const total = cart.reduce((s, c) => s + (c.price ?? 0), 0);
  const items = cart.map((c) => c.name).slice(0, 5).join(', ');
  const name = opts.restaurantName ?? 'us';
  const minutes = opts.minutesSince ?? 0;
  if (minutes < 30) {
    return { send: false, message: '', reason: 'Under the 30-minute reminder threshold.' };
  }
  if (!cart.length) {
    return { send: false, message: '', reason: 'Cart is empty; nothing to recover.' };
  }
  return {
    send: true,
    message: `Hi — you left ${items}${cart.length > 5 ? '…' : ''} (${total.toFixed(2)}) in your order at ${name}. Reply here to finish, or we can hold it for you.`,
    reason: `${minutes} minutes since the last cart update with ${cart.length} item(s) still open.`,
  };
}

/* ----------------------------- ROI ---------------------------------- */

export interface RoiInput {
  missedCallsPerWeek: number;
  averageTicket: number;
  captureRatePct: number;
  weeksPerYear?: number;
}

export interface RoiResult {
  missedCallsPerWeek: number;
  averageTicket: number;
  captureRatePct: number;
  /** Calls answered per year at the assumed capture rate. */
  recoveredCallsPerYear: number;
  /** Gross revenue from recovered calls per year. */
  revenuePerYear: number;
  /** Same figure net of a stated operating cost. */
  netPerYear: number;
  assumptions: string[];
}

/**
 * What missed calls cost. Only arithmetic on the operator's own numbers —
 * no benchmark is substituted and no conversion rate is assumed beyond the
 * one they enter.
 */
export function roiMissedCalls(input: RoiInput, opts: { annualCost?: number } = {}): RoiResult {
  const weeks = input.weeksPerYear ?? 52;
  const missed = Number(input.missedCallsPerWeek);
  const ticket = Number(input.averageTicket);
  const rate = Number(input.captureRatePct);
  if (![missed, ticket, rate, weeks].every((n) => Number.isFinite(n)) || missed < 0 || ticket < 0 || rate < 0) {
    throw new Error('missedCallsPerWeek, averageTicket and captureRatePct must be non-negative numbers');
  }
  if (rate > 100) throw new Error('captureRatePct cannot exceed 100');

  const calls = missed * weeks;
  const recovered = calls * (rate / 100);
  const revenue = recovered * ticket;
  const cost = Number(opts.annualCost ?? 0);

  return {
    missedCallsPerWeek: missed,
    averageTicket: ticket,
    captureRatePct: rate,
    recoveredCallsPerYear: Number(recovered.toFixed(1)),
    revenuePerYear: Number(revenue.toFixed(2)),
    netPerYear: Number((revenue - cost).toFixed(2)),
    assumptions: [
      `Only the operator's own inputs are used: ${missed} missed calls/week, ${ticket} average ticket, ${rate}% capture.`,
      `${weeks} weeks per year; no seasonal variation is applied.`,
      'No benchmark conversion rate is substituted for the one entered.',
    ],
  };
}