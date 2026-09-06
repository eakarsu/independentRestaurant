import assert from "node:assert/strict";
import test from "node:test";
import prisma from "../../src/lib/prisma";
import {
  createRestaurantOrder,
  priceRestaurantOrder,
  createOrderSchema,
  transitionOrder,
  verifyOrderAuditChain,
} from "../../src/lib/commerce/orders";
import { beginPayment } from "../../src/lib/commerce/payments";
import type {
  TaxProvider,
  PaymentProvider,
} from "../../src/lib/commerce/providers";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
const tax: TaxProvider = {
  async quote(input) {
    return {
      taxCents: Math.round(input.subtotalCents * 0.05),
      providerRef: "fixture-tax",
    };
  },
};
test(
  "customer pickup requires reviewed pricing, respects hours/capacity, and isolates cancellation and acceptance",
  { skip: !enabled },
  async () => {
    const tag = Date.now().toString(),
      user = await prisma.user.create({
        data: {
          email: `pickup-${tag}@test.invalid`,
          password: "not-login-hash",
          role: "CUSTOMER",
        },
      }),
      otherUser = await prisma.user.create({
        data: {
          email: `other-pickup-${tag}@test.invalid`,
          password: "not-login-hash",
          role: "CUSTOMER",
        },
      }),
      manager = await prisma.user.create({
        data: {
          email: `manager-pickup-${tag}@test.invalid`,
          password: "not-login-hash",
          role: "MANAGER",
        },
      }),
      actor = { userId: user.id, role: "CUSTOMER" },
      other = { userId: otherUser.id, role: "CUSTOMER" },
      staff = { userId: manager.id, role: "MANAGER" };
    await prisma.customer.create({
      data: {
        userId: user.id,
        firstName: "Test",
        lastName: "Customer",
        email: user.email,
        dietaryPrefs: [],
        allergens: [],
      },
    });
    await prisma.customer.create({
      data: {
        userId: otherUser.id,
        firstName: "Other",
        lastName: "Customer",
        email: otherUser.email,
        dietaryPrefs: [],
        allergens: [],
      },
    });
    const category = await prisma.menuCategory.create({
        data: { name: `Pickup-${tag}` },
      }),
      stock = await prisma.ingredient.create({
        data: { name: "Pickup stock", unit: "portion", currentStock: 3 },
      }),
      item = await prisma.menuItem.create({
        data: {
          categoryId: category.id,
          name: "Pickup item",
          price: 20,
          allergens: ["milk"],
          ingredients: {
            create: { ingredientId: stock.id, quantity: 1, unit: "portion" },
          },
        },
      });
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 1);
    date.setUTCHours(12, 0, 0, 0);
    const input = createOrderSchema.parse({
      idempotencyKey: `pickup-${tag}`,
      type: "TAKEOUT",
      source: "online",
      pickupAt: date.toISOString(),
      expectedTotalCents: 2100,
      items: [{ menuItemId: item.id, quantity: 1 }],
    });
    await assert.rejects(
      createRestaurantOrder(input, actor, tax),
      /configured/,
    );
    const profile = {
      name: "Test restaurant",
      address: "Test",
      phone: "",
      email: "",
      timezone: "UTC",
      reservationDurationMinutes: 60,
      hours: Array.from({ length: 7 }, (_, day) => ({
        day,
        closed: false,
        open: "09:00",
        close: "20:00",
      })),
    };
    await prisma.settings.upsert({
      where: { key: "restaurant-profile" },
      create: { key: "restaurant-profile", value: profile },
      update: { value: profile },
    });
    const policy = {
      enabled: true,
      reviewed: true,
      noticeMinutes: 10,
      horizonDays: 7,
      maxPendingPerCustomer: 1,
    };
    await prisma.settings.create({
      data: { key: "online-ordering", value: policy },
    });
    const quote = await priceRestaurantOrder(input, tax);
    assert.equal(quote.totalCents, 2100);
    await assert.rejects(
      createRestaurantOrder({ ...input, expectedTotalCents: 2000 }, actor, tax),
      /Prices or tax changed/,
    );
    const early = new Date(date);
    early.setUTCHours(8);
    await assert.rejects(
      createRestaurantOrder(
        { ...input, pickupAt: early.toISOString() },
        actor,
        tax,
      ),
      /opening hours/,
    );
    const invalidType = { ...input, type: "DINE_IN" };
    await assert.rejects(
      createRestaurantOrder(invalidType, actor, tax),
      /pickup quote/,
    );
    const attempts = await Promise.allSettled(
      ["a", "b"].map((k) =>
        createRestaurantOrder(
          { ...input, idempotencyKey: `pickup-${tag}-${k}` },
          actor,
          tax,
        ),
      ),
    );
    assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
    const winner = (
      attempts.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<
        Awaited<ReturnType<typeof createRestaurantOrder>>
      >
    ).value;
    assert.equal(winner.status, "PENDING");
    assert.equal(winner.pickupAt?.toISOString(), date.toISOString());
    assert.equal(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: stock.id } }))
        .currentStock,
      2,
    );
    await assert.rejects(
      transitionOrder({
        orderId: winner.id,
        toStatus: "CANCELLED",
        actor: other,
        idempotencyKey: `foreign-cancel-${tag}`,
      }),
      /not yours/,
    );
    await assert.rejects(
      transitionOrder({
        orderId: winner.id,
        toStatus: "CONFIRMED",
        actor,
        idempotencyKey: `self-accept-${tag}`,
      }),
      /only cancel/,
    );
    const provider: PaymentProvider = {
      async createIntent() {
        throw Error("Provider must not be called");
      },
      async refund() {
        throw Error("Unused");
      },
    };
    await assert.rejects(
      beginPayment(
        { orderId: winner.id, actor, idempotencyKey: `early-payment-${tag}` },
        provider,
      ),
      /PENDING/,
    );
    const cancel = {
      orderId: winner.id,
      toStatus: "CANCELLED" as const,
      actor,
      idempotencyKey: `cancel-pickup-${tag}`,
      reason: "Changed pickup plans",
    };
    await transitionOrder(cancel);
    await transitionOrder(cancel);
    assert.equal(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: stock.id } }))
        .currentStock,
      3,
    );
    assert.equal(await verifyOrderAuditChain(winner.id), true);
    const accepted = await createRestaurantOrder(
      { ...input, idempotencyKey: `accepted-${tag}` },
      actor,
      tax,
    );
    await transitionOrder({
      orderId: accepted.id,
      toStatus: "CONFIRMED",
      actor: staff,
      idempotencyKey: `staff-accept-${tag}`,
    });
    await assert.rejects(
      transitionOrder({
        ...cancel,
        orderId: accepted.id,
        idempotencyKey: `late-cancel-${tag}`,
      }),
      /already acted/,
    );
    const paymentProvider: PaymentProvider = {
      async createIntent(value) {
        assert.equal(value.onlineOrder, true);
        assert.equal(value.money.amountCents, 2100);
        return {
          providerRef: `cs_${tag}`,
          clientSecret: null,
          status: "requires_action",
          redirectUrl: "https://checkout.stripe.com/fixture",
        };
      },
      async refund() {
        throw Error("Unused");
      },
    };
    await beginPayment(
      {
        orderId: accepted.id,
        actor,
        idempotencyKey: `accepted-payment-${tag}`,
      },
      paymentProvider,
    );
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    await assert.rejects(
      createRestaurantOrder(
        { ...input, idempotencyKey: `revoked-${tag}` },
        actor,
        tax,
      ),
      /no longer active/,
    );
  },
);
test.after(() => prisma.$disconnect());
