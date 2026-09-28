import type { Promotion, PromotionType } from "@prisma/client";

export function normalizePromotionCode(code: string): string {
  return code.trim().toUpperCase();
}

export type PromotionEvaluationInput = Pick<
  Promotion,
  | "type"
  | "value"
  | "minOrderAmount"
  | "maxDiscount"
  | "usageLimit"
  | "usageCount"
  | "dayOfWeek"
  | "startTime"
  | "endTime"
  | "startDate"
  | "endDate"
  | "isActive"
>;

export interface PromotionEvaluation {
  valid: boolean;
  reason?: string;
  /** Discount in integer cents, never more than the subtotal. */
  discountCents: number;
}

const UNSUPPORTED_TYPES: PromotionType[] = ["BUY_ONE_GET_ONE", "FREE_ITEM"];

/**
 * Single source of truth for whether a promo code applies and what it is
 * worth. The validate endpoint and order creation both call this so a code
 * that validates always produces the same discount when redeemed.
 */
export function evaluatePromotion(
  promotion: PromotionEvaluationInput,
  subtotalCents: number,
  now: Date = new Date(),
): PromotionEvaluation {
  if (!promotion.isActive) return { valid: false, reason: "Invalid or expired promo code", discountCents: 0 };
  if (now < promotion.startDate || now > promotion.endDate)
    return { valid: false, reason: "Invalid or expired promo code", discountCents: 0 };
  if (promotion.usageLimit !== null && promotion.usageCount >= promotion.usageLimit)
    return { valid: false, reason: "Promo code has reached its usage limit", discountCents: 0 };
  if (promotion.minOrderAmount !== null && subtotalCents < Math.round(promotion.minOrderAmount * 100))
    return {
      valid: false,
      reason: `Minimum order of $${promotion.minOrderAmount.toFixed(2)} required`,
      discountCents: 0,
    };
  if (promotion.dayOfWeek.length > 0 && !promotion.dayOfWeek.includes(now.getDay()))
    return { valid: false, reason: "This promo is not valid today", discountCents: 0 };
  if (promotion.startTime && promotion.endTime) {
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    if (currentTime < promotion.startTime || currentTime > promotion.endTime)
      return {
        valid: false,
        reason: `This promo is only valid from ${promotion.startTime} to ${promotion.endTime}`,
        discountCents: 0,
      };
  }
  if (UNSUPPORTED_TYPES.includes(promotion.type))
    return {
      valid: false,
      reason: "This promo type is applied by staff, not online",
      discountCents: 0,
    };

  const cap = promotion.maxDiscount !== null ? Math.round(promotion.maxDiscount * 100) : Number.POSITIVE_INFINITY;
  let discountCents: number;
  switch (promotion.type) {
    case "FIXED_AMOUNT":
      discountCents = Math.round(promotion.value * 100);
      break;
    case "PERCENTAGE":
    case "HAPPY_HOUR":
      discountCents = Math.round((subtotalCents * promotion.value) / 100);
      break;
    default:
      discountCents = 0;
  }
  discountCents = Math.max(0, Math.min(discountCents, cap, subtotalCents));
  return { valid: true, discountCents };
}
