import assert from 'node:assert/strict';
import test from 'node:test';
import { receiptCents, refundedPaymentStatus, splitTenderBalance } from '@/lib/commerce/split-tender';

test('cash plus verified card captures the reviewed total in integer cents', () => {
  assert.equal(splitTenderBalance(2100, 500), 1600);
  assert.equal(splitTenderBalance(2100, 500, 1600), 0);
  assert.throws(() => splitTenderBalance(2100, 500, 1601), /reconcile/);
  assert.throws(() => splitTenderBalance(2100, -1), /reconcile/);
  assert.equal(receiptCents(5.01), 501);
  assert.throws(() => receiptCents(5.001), /invalid/);
});

test('card-only refund cannot close a cash plus card order', () => {
  assert.equal(refundedPaymentStatus(2100, 1600), 'PARTIALLY_REFUNDED');
  assert.equal(refundedPaymentStatus(2100, 2100), 'REFUNDED');
  assert.throws(() => refundedPaymentStatus(2100, 2101), /exceed/);
});
