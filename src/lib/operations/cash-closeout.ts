import { createHash } from 'node:crypto';

export type CashPayment = { id: string; amount: number; order: { currency: string } };
export type CashRefund = { id: string; amountCents: number; currency: string };

export function cashLedger(payments: CashPayment[], currency: string, refunds: CashRefund[] = []) {
  const entries = payments.filter(payment => payment.order.currency === currency).map(payment => {
    const cents = Math.round(payment.amount * 100);
    if (!Number.isSafeInteger(cents) || cents < 0 || Math.abs(payment.amount * 100 - cents) > 0.000001) throw Error('Cash payment amount is invalid');
    return { id: payment.id, cents };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const receivedCents = entries.reduce((sum, entry) => sum + entry.cents, 0);
  const returned = refunds.filter(refund => refund.currency === currency).map(refund => {
    if (!Number.isSafeInteger(refund.amountCents) || refund.amountCents <= 0) throw Error('Cash refund amount is invalid');
    return { id: refund.id, cents: refund.amountCents };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const refundedCents = returned.reduce((sum, entry) => sum + entry.cents, 0);
  const netReceivedCents = receivedCents - refundedCents;
  if (![receivedCents, refundedCents, netReceivedCents].every(Number.isSafeInteger)) throw Error('Cash total is too large');
  const evidence = returned.length ? [entries, returned] : entries;
  return { paymentCount: entries.length, refundCount: returned.length, receivedCents, refundedCents, netReceivedCents, paymentDigest: createHash('sha256').update(JSON.stringify(evidence)).digest('hex') };
}

export function cashVariance(openingFloatCents: number, receivedCents: number, paidOutCents: number, countedCents: number) {
  const expectedCents = openingFloatCents + receivedCents - paidOutCents;
  return { expectedCents, varianceCents: countedCents - expectedCents };
}
