import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { cashLedger, cashVariance } from '@/lib/operations/cash-closeout';

test('cash closeout is currency scoped, stable across record order, and counts cents', () => {
  const payments = [{ id: 'b', amount: 4.25, order: { currency: 'USD' } }, { id: 'a', amount: 1.1, order: { currency: 'USD' } }, { id: 'c', amount: 9, order: { currency: 'EUR' } }];
  const ledger = cashLedger(payments, 'USD');
  assert.equal(ledger.receivedCents, 535);
  assert.equal(ledger.paymentCount, 2);
  assert.equal(ledger.paymentDigest, cashLedger([...payments].reverse(), 'USD').paymentDigest);
  assert.notEqual(ledger.paymentDigest, cashLedger(payments.slice(1), 'USD').paymentDigest);
  assert.deepEqual(cashVariance(1000, ledger.receivedCents, 200, 1320), { expectedCents: 1335, varianceCents: -15 });
  const withRefund = cashLedger(payments, 'USD', [{ id: 'refund-one', amountCents: 300, currency: 'USD' }, { id: 'foreign-refund', amountCents: 900, currency: 'EUR' }]);
  assert.equal(withRefund.refundedCents, 300);
  assert.equal(withRefund.netReceivedCents, ledger.receivedCents - 300);
  assert.equal(withRefund.refundCount, 1);
  assert.notEqual(withRefund.paymentDigest, ledger.paymentDigest);
  assert.equal(withRefund.paymentDigest, cashLedger([...payments].reverse(), 'USD', [{ id: 'foreign-refund', amountCents: 900, currency: 'EUR' }, { id: 'refund-one', amountCents: 300, currency: 'USD' }]).paymentDigest);
});
