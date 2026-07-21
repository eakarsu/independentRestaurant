export const ORDER_STATES = [
  "PENDING",
  "CONFIRMED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "PREPARING",
  "READY",
  "SERVED",
  "COMPLETED",
  "FULFILLMENT_FAILED",
  "EXCEPTION",
  "REFUND_PENDING",
  "REFUNDED",
  "CANCELLED",
] as const;

export type CommerceOrderStatus = (typeof ORDER_STATES)[number];

const transitions: Record<CommerceOrderStatus, readonly CommerceOrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED", "EXCEPTION"],
  CONFIRMED: ["PAYMENT_PENDING", "PREPARING", "CANCELLED", "EXCEPTION"],
  PAYMENT_PENDING: ["CONFIRMED", "PAYMENT_FAILED", "PREPARING", "CANCELLED", "EXCEPTION"],
  PAYMENT_FAILED: ["PAYMENT_PENDING", "CANCELLED", "EXCEPTION"],
  PREPARING: ["READY", "FULFILLMENT_FAILED", "CANCELLED", "EXCEPTION"],
  READY: ["SERVED", "COMPLETED", "FULFILLMENT_FAILED", "EXCEPTION"],
  SERVED: ["COMPLETED", "EXCEPTION"],
  COMPLETED: ["REFUND_PENDING", "EXCEPTION"],
  FULFILLMENT_FAILED: ["PREPARING", "READY", "CANCELLED", "EXCEPTION"],
  EXCEPTION: ["CONFIRMED", "PAYMENT_PENDING", "PREPARING", "READY", "CANCELLED"],
  REFUND_PENDING: ["REFUNDED", "COMPLETED", "EXCEPTION"],
  REFUNDED: [],
  CANCELLED: ["REFUND_PENDING"],
};

export class InvalidOrderTransitionError extends Error {
  constructor(from: CommerceOrderStatus, to: CommerceOrderStatus) {
    super(`Order cannot transition from ${from} to ${to}`);
    this.name = "InvalidOrderTransitionError";
  }
}

export function assertOrderTransition(
  from: CommerceOrderStatus,
  to: CommerceOrderStatus,
): void {
  if (from === to || !transitions[from].includes(to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}

export function allowedOrderTransitions(
  from: CommerceOrderStatus,
): readonly CommerceOrderStatus[] {
  return transitions[from];
}
