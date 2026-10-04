import assert from 'node:assert/strict';
import test from 'node:test';
import prisma from '../../src/lib/prisma';
import { createRestaurantOrder, transitionOrder, verifyOrderAuditChain } from '../../src/lib/commerce/orders';
import { applyPaymentWebhook, beginPayment, reconcilePayment, recordCashTender, refundCashTender, requestRefund } from '../../src/lib/commerce/payments';
import { cashLedger } from '../../src/lib/operations/cash-closeout';
import type { PaymentProvider, TaxProvider } from '../../src/lib/commerce/providers';

const enabled = process.env.RUN_DATABASE_TESTS === '1';
const tax: TaxProvider = { async quote(input) { return { taxCents: Math.round(input.subtotalCents * 0.05), providerRef: 'split-fixture-tax' }; } };

test('split cash and server-priced card capture, separate refunds, and cancelled pending checkout', { skip: !enabled }, async () => {
  const tag = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({ data: { email: `split-${tag}@test.invalid`, password: 'not-login-hash', role: 'MERCHANT' } });
  const actor = { userId: user.id, role: 'MERCHANT' };
  const category = await prisma.menuCategory.create({ data: { name: `Split ${tag}` } });
  const item = await prisma.menuItem.create({ data: { categoryId: category.id, name: `Meal ${tag}`, price: 20, allergens: [] } });
  const makeOrder = (suffix: string) => createRestaurantOrder({ idempotencyKey: `order-${suffix}-${tag}`, type: 'TAKEOUT', items: [{ menuItemId: item.id, quantity: 1, modifierIds: [] }] }, actor, tax);
  const order = await makeOrder('paid');
  assert.equal(Math.round(order.total * 100), 2100);
  await assert.rejects(recordCashTender({ orderId: order.id, actor, idempotencyKey: `too-large-${tag}`, amountCents: 2100, cashReceivedCents: 2100 }), /less than/);
  const cashInput = { orderId: order.id, actor, idempotencyKey: `cash-paid-${tag}`, amountCents: 500, cashReceivedCents: 1000 };
  const cash = await recordCashTender(cashInput);
  assert.equal(cash.cardBalanceCents, 1600);
  assert.equal(cash.changeCents, 500);
  assert.equal((await recordCashTender(cashInput)).payment.id, cash.payment.id);
  await assert.rejects(recordCashTender({ ...cashInput, amountCents: 600 }), /different tender/);
  await assert.rejects(recordCashTender({ ...cashInput, idempotencyKey: `second-cash-${tag}` }), /Tender already started/);
  let cardAmount = 0;
  const cardKey = `split-card-${tag}`;
  const provider: PaymentProvider = {
    async createIntent(input) { cardAmount = input.money.amountCents; return { providerRef: `cs_${tag}`, clientSecret: null, redirectUrl: 'https://checkout.stripe.com/test', status: 'requires_action' }; },
    async checkout() { return { providerRef: `cs_${tag}`, orderId: order.id, attemptKey: cardKey, amountCents: 1600, currency: 'USD', status: 'paid', paymentReference: `pi_${tag}` }; },
    async refund(input) { return { providerRef: `re_${tag}`, status: 'succeeded', amountCents: input.money.amountCents, currency: input.money.currency, paymentReference: input.paymentReference, refundKey: input.idempotencyKey }; },
  };
  await beginPayment({ orderId: order.id, actor, idempotencyKey: cardKey }, provider);
  assert.equal(cardAmount, 1600);
  await assert.rejects(refundCashTender({ orderId: order.id, actor, idempotencyKey: `early-cash-refund-${tag}`, amountCents: 500, reason: 'Customer return', cashReturnedConfirmed: true }), /completed or cancelled/);
  await assert.rejects(applyPaymentWebhook({ eventId: `wrong-split-${tag}`, eventType: 'payment_intent.succeeded', paymentReference: `pi_${tag}`, orderId: order.id, attemptKey: cardKey, currency: 'usd', amountReceivedCents: 1601 }), /amount/);
  await applyPaymentWebhook({ eventId: `split-paid-${tag}`, eventType: 'payment_intent.succeeded', paymentReference: `pi_${tag}`, orderId: order.id, attemptKey: cardKey, currency: 'usd', amountReceivedCents: 1600, paymentMethod: 'card' });
  await applyPaymentWebhook({ eventId: `split-paid-${tag}`, eventType: 'payment_intent.succeeded', paymentReference: `pi_${tag}`, orderId: order.id, attemptKey: cardKey, currency: 'usd', amountReceivedCents: 1600, paymentMethod: 'card' });
  assert.equal(await prisma.payment.count({ where: { orderId: order.id } }), 2);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus, 'PAID');
  await transitionOrder({ orderId: order.id, toStatus: 'READY', idempotencyKey: `ready-${tag}`, actor });
  await transitionOrder({ orderId: order.id, toStatus: 'COMPLETED', idempotencyKey: `done-${tag}`, actor });
  await requestRefund({ orderId: order.id, actor, idempotencyKey: `card-refund-${tag}`, amountCents: 1600, reason: 'Customer return', }, provider);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus, 'PARTIALLY_REFUNDED');
  await assert.rejects(requestRefund({ orderId: order.id, actor, idempotencyKey: `extra-card-refund-${tag}`, amountCents: 1, reason: 'Excess card refund' }, provider), /refundable balance/);
  const cashRefundInput = { orderId: order.id, actor, idempotencyKey: `cash-refund-${tag}`, amountCents: 500, reason: 'Customer return', cashReturnedConfirmed: true };
  const cashRefund = await refundCashTender(cashRefundInput);
  assert.equal((await refundCashTender(cashRefundInput)).id, cashRefund.id);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus, 'REFUNDED');
  await assert.rejects(requestRefund({ orderId: order.id, actor, idempotencyKey: cashRefundInput.idempotencyKey, amountCents: cashRefundInput.amountCents, reason: cashRefundInput.reason }, provider), /different tender/);
  await assert.rejects(refundCashTender({ ...cashRefundInput, idempotencyKey: `extra-cash-refund-${tag}`, amountCents: 1 }), /completed or cancelled/);
  assert.equal(cashLedger([{ id: cash.payment.id, amount: cash.payment.amount, order: { currency: 'USD' } }], 'USD', [{ id: cashRefund.id, amountCents: cashRefund.amountCents, currency: cashRefund.currency }]).netReceivedCents, 0);
  await assert.rejects(prisma.payment.update({ where: { id: cash.payment.id }, data: { amount: 1 } }), /append-only/);
  await assert.rejects(prisma.refund.delete({ where: { id: cashRefund.id } }), /append-only/);
  assert.equal(await verifyOrderAuditChain(order.id), true);

  const cancelled = await makeOrder('cancelled');
  const cancelledCash = await recordCashTender({ orderId: cancelled.id, actor, idempotencyKey: `cancel-cash-${tag}`, amountCents: 400, cashReceivedCents: 400 });
  const expiringKey = `expiring-card-${tag}`;
  const expiringProvider: PaymentProvider = {
    async createIntent(input) { assert.equal(input.money.amountCents, 1700); return { providerRef: `cs_expiring_${tag}`, clientSecret: null, status: 'requires_action' }; },
    async checkout() { return { providerRef: `cs_expiring_${tag}`, orderId: cancelled.id, attemptKey: expiringKey, amountCents: 1700, currency: 'USD', status: 'expired' }; },
    async refund() { throw Error('No provider refund expected'); },
  };
  await beginPayment({ orderId: cancelled.id, actor, idempotencyKey: expiringKey }, expiringProvider);
  await transitionOrder({ orderId: cancelled.id, toStatus: 'CANCELLED', idempotencyKey: `cancel-${tag}`, actor, reason: 'Customer cancelled order' });
  await assert.rejects(refundCashTender({ orderId: cancelled.id, actor, idempotencyKey: `pending-cash-refund-${tag}`, amountCents: 400, reason: 'Cancelled order', cashReturnedConfirmed: true }), /pending card/);
  await reconcilePayment({ orderId: cancelled.id, actor, reference: `cs_expiring_${tag}` }, expiringProvider);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: cancelled.id } })).paymentStatus, 'PARTIAL');
  await refundCashTender({ orderId: cancelled.id, actor, idempotencyKey: `cancel-refund-${tag}`, amountCents: 400, reason: 'Cancelled order', cashReturnedConfirmed: true });
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: cancelled.id } })).status, 'REFUNDED');
  await applyPaymentWebhook({ eventId: `late-capture-${tag}`, eventType: 'payment_intent.succeeded', paymentReference: `pi_expiring_${tag}`, orderId: cancelled.id, attemptKey: expiringKey, currency: 'usd', amountReceivedCents: 1700, paymentMethod: 'card' });
  const late = await prisma.order.findUniqueOrThrow({ where: { id: cancelled.id } });
  assert.equal(late.status, 'EXCEPTION');
  assert.equal(late.paymentStatus, 'PARTIALLY_REFUNDED');
  const lateRefundProvider: PaymentProvider = {
    async createIntent() { throw Error('No new checkout expected'); },
    async refund(input) { return { providerRef: `re_late_${tag}`, status: 'succeeded', amountCents: input.money.amountCents, currency: input.money.currency, paymentReference: input.paymentReference, refundKey: input.idempotencyKey }; },
  };
  await requestRefund({ orderId: cancelled.id, actor, idempotencyKey: `late-card-refund-${tag}`, amountCents: 1700, reason: 'Late capture after cancellation' }, lateRefundProvider);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: cancelled.id } })).status, 'REFUNDED');
  assert.equal(cancelledCash.payment.method, 'cash');
  assert.equal(await verifyOrderAuditChain(cancelled.id), true);
});

test.after(() => prisma.$disconnect());
