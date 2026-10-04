/** Convert persisted decimal-dollar receipts without accepting fractional cents. */
export function receiptCents(amount: number) {
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || Math.abs(amount * 100 - cents) > 0.000001)
    throw Error('Payment receipt amount is invalid');
  return cents;
}

export function splitTenderBalance(totalCents: number, cashCents: number, cardCents = 0) {
  if (![totalCents, cashCents, cardCents].every(Number.isSafeInteger) || totalCents <= 0 || cashCents < 0 || cardCents < 0 || cashCents + cardCents > totalCents)
    throw Error('Tender does not reconcile to the reviewed order total');
  return totalCents - cashCents - cardCents;
}

export function refundedPaymentStatus(capturedCents: number, refundedCents: number) {
  if (![capturedCents, refundedCents].every(Number.isSafeInteger) || capturedCents <= 0 || refundedCents < 0 || refundedCents > capturedCents)
    throw Error('Refunds exceed captured tender');
  return refundedCents === capturedCents ? 'REFUNDED' : refundedCents > 0 ? 'PARTIALLY_REFUNDED' : 'PAID';
}
