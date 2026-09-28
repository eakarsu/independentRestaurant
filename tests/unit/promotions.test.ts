import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePromotion, type PromotionEvaluationInput } from "../../src/lib/commerce/promotions";

const base: PromotionEvaluationInput = {
  type: "PERCENTAGE",
  value: 10,
  minOrderAmount: null,
  maxDiscount: null,
  usageLimit: null,
  usageCount: 0,
  dayOfWeek: [],
  startTime: null,
  endTime: null,
  startDate: new Date(Date.now() - 86400000),
  endDate: new Date(Date.now() + 86400000),
  isActive: true,
};

test("percentage promotion values a subtotal in cents", () => {
  assert.equal(evaluatePromotion(base, 10000).discountCents, 1000);
});

test("maxDiscount caps percentage promotions", () => {
  assert.equal(evaluatePromotion({ ...base, maxDiscount: 5 }, 10000).discountCents, 500);
});

test("happy hour percentage can never exceed the subtotal", () => {
  const result = evaluatePromotion({ ...base, type: "HAPPY_HOUR", value: 150 }, 10000);
  assert.equal(result.valid, true);
  assert.equal(result.discountCents, 10000);
});

test("fixed amount promotions are clamped to the subtotal", () => {
  const result = evaluatePromotion({ ...base, type: "FIXED_AMOUNT", value: 999 }, 250);
  assert.equal(result.discountCents, 250);
});

test("minimum order amount blocks small orders", () => {
  const result = evaluatePromotion({ ...base, minOrderAmount: 50 }, 1000);
  assert.equal(result.valid, false);
});

test("exhausted usage limit blocks redemption", () => {
  const result = evaluatePromotion({ ...base, usageLimit: 5, usageCount: 5 }, 10000);
  assert.equal(result.valid, false);
});

test("expired promotions are rejected", () => {
  const result = evaluatePromotion(
    { ...base, endDate: new Date(Date.now() - 86400000) },
    10000,
  );
  assert.equal(result.valid, false);
  assert.equal(result.discountCents, 0);
});

test("in-store-only promotion types are not applied online", () => {
  assert.equal(evaluatePromotion({ ...base, type: "BUY_ONE_GET_ONE" }, 10000).valid, false);
  assert.equal(evaluatePromotion({ ...base, type: "FREE_ITEM" }, 10000).valid, false);
});
