import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import prisma from "../../src/lib/prisma";
import { createRestaurantOrder, transitionOrder, transitionOrderItem, verifyOrderAuditChain } from "../../src/lib/commerce/orders";
import { applyPaymentWebhook, beginPayment, requestRefund } from "../../src/lib/commerce/payments";
import type { PaymentProvider, TaxProvider } from "../../src/lib/commerce/providers";

const enabled = process.env.RUN_DATABASE_TESTS === "1";
const taxProvider: TaxProvider = {
  async quote(input) {
    return { taxCents: Math.round((input.subtotalCents - input.discountCents) * 0.05), providerRef: "test-tax-quote" };
  },
};

test("idempotent order reservation, partial fulfillment, cancellation, oversell, and duplicate webhooks", { skip: !enabled }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({ data: { email: `operator-${suffix}@example.test`, password: "not-a-login-hash", role: "OPERATOR" } });
  const actor = { userId: user.id, role: "OPERATOR" };
  const merchant = await prisma.user.create({ data: { email: `merchant-${suffix}@example.test`, password: "not-a-login-hash", role: "MERCHANT" } });
  const merchantActor = { userId: merchant.id, role: "MERCHANT" };
  const category = await prisma.menuCategory.create({ data: { name: `Workflow ${suffix}` } });
  const ingredient = await prisma.ingredient.create({ data: { name: `Ingredient ${suffix}`, unit: "portion", currentStock: 3, reorderPoint: 0 } });
  const item = await prisma.menuItem.create({
    data: {
      categoryId: category.id,
      name: `Menu item ${suffix}`,
      price: 12.5,
      allergens: [],
      ingredients: { create: { ingredientId: ingredient.id, quantity: 1, unit: "portion" } },
    },
  });

  const request = { idempotencyKey: `order-${suffix}`, type: "TAKEOUT", items: [{ menuItemId: item.id, quantity: 1, modifierIds: [] }] };
  const order = await createRestaurantOrder(request, actor, taxProvider);
  const duplicate = await createRestaurantOrder(request, actor, taxProvider);
  assert.equal(duplicate.id, order.id);
  assert.equal(await prisma.order.count({ where: { idempotencyKey: request.idempotencyKey } }), 1);
  assert.equal((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock, 2);
  assert.equal(await verifyOrderAuditChain(order.id), true);

  const firstItem = order.items[0];
  await transitionOrderItem({ orderId: order.id, itemId: firstItem.id, toStatus: "SENT", idempotencyKey: `item-sent-${suffix}`, actor });
  assert.equal((await prisma.orderItem.findUniqueOrThrow({ where: { id: firstItem.id } })).status, "SENT");
  const failingPayment: PaymentProvider = {
    async createIntent() { throw new Error("processor unavailable"); },
    async refund() { return { providerRef: "unused", status: "failed" }; },
  };
  await assert.rejects(beginPayment({ orderId: order.id, idempotencyKey: `pay-fail-${suffix}`, actor }, failingPayment), /processor unavailable/);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "PAYMENT_FAILED");
  assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { idempotencyKey: `pay-fail-${suffix}` } })).status, "FAILED");
  await transitionOrder({ orderId: order.id, toStatus: "CANCELLED", idempotencyKey: `cancel-${suffix}`, reason: "integration test", actor });
  await transitionOrder({ orderId: order.id, toStatus: "CANCELLED", idempotencyKey: `cancel-${suffix}`, reason: "integration test", actor });
  assert.equal((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock, 3);
  assert.equal(await verifyOrderAuditChain(order.id), true);

  const concurrent = ["a", "b"].map((part) => createRestaurantOrder({ idempotencyKey: `oversell-${part}-${suffix}`, type: "TAKEOUT", items: [{ menuItemId: item.id, quantity: 2, modifierIds: [] }] }, actor, taxProvider));
  const results = await Promise.allSettled(concurrent);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.ok((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock >= 0);

  const event = { provider: "test-partner", eventId: `event-${suffix}`, eventType: "order.status_changed", payloadHash: "a".repeat(64) };
  await prisma.webhookEvent.create({ data: event });
  await assert.rejects(prisma.webhookEvent.create({ data: event }), (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");

  const refundIngredient = await prisma.ingredient.create({ data: { name: `Refund ingredient ${suffix}`, unit: "portion", currentStock: 2 } });
  const refundItem = await prisma.menuItem.create({
    data: { categoryId: category.id, name: `Refund item ${suffix}`, price: 8, allergens: [], ingredients: { create: { ingredientId: refundIngredient.id, quantity: 1, unit: "portion" } } },
  });
  const refundOrder = await createRestaurantOrder({ idempotencyKey: `refund-order-${suffix}`, type: "TAKEOUT", items: [{ menuItemId: refundItem.id, quantity: 1, modifierIds: [] }] }, actor, taxProvider);
  const successfulPayment: PaymentProvider = {
    async createIntent() { return { providerRef: `checkout-${suffix}`, clientSecret: null, status: "requires_action" }; },
    async refund() { return { providerRef: `refund-${suffix}`, status: "succeeded" }; },
  };
  await beginPayment({ orderId: refundOrder.id, idempotencyKey: `payment-${suffix}`, actor }, successfulPayment);
  await applyPaymentWebhook({ eventId: `payment-event-${suffix}`, eventType: "payment_intent.succeeded", paymentReference: `intent-${suffix}`, orderId: refundOrder.id, amountReceivedCents: Math.round(refundOrder.total * 100), paymentMethod: "card" });
  await transitionOrder({ orderId: refundOrder.id, toStatus: "READY", idempotencyKey: `ready-${suffix}`, actor });
  await transitionOrder({ orderId: refundOrder.id, toStatus: "COMPLETED", idempotencyKey: `completed-${suffix}`, actor });
  await requestRefund({ orderId: refundOrder.id, idempotencyKey: `refund-${suffix}`, amountCents: Math.round(refundOrder.total * 100), reason: "integration refund", actor: merchantActor }, successfulPayment);
  const refunded = await prisma.order.findUniqueOrThrow({ where: { id: refundOrder.id } });
  assert.equal(refunded.status, "REFUNDED");
  assert.equal(refunded.paymentStatus, "REFUNDED");
  assert.equal(await verifyOrderAuditChain(refundOrder.id), true);
});

test.after(async () => {
  await prisma.$disconnect();
});
