import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluatePromotion, normalizePromotionCode } from "@/lib/commerce/promotions";

async function handlePOST(request: NextRequest) {
  try {
    const { code, orderTotal } = await request.json();

    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Promo code is required" }, { status: 400 });
    }
    const subtotalCents = Math.round(Number(orderTotal ?? 0) * 100);
    if (!Number.isFinite(subtotalCents) || subtotalCents < 0) {
      return NextResponse.json({ error: "orderTotal must be a non-negative number" }, { status: 400 });
    }

    const promotion = await prisma.promotion.findFirst({
      where: { code: normalizePromotionCode(code) },
    });
    if (!promotion) {
      return NextResponse.json(
        { valid: false, error: "Invalid or expired promo code" },
        { status: 200 },
      );
    }

    const evaluation = evaluatePromotion(promotion, subtotalCents);
    if (!evaluation.valid) {
      return NextResponse.json({ valid: false, error: evaluation.reason }, { status: 200 });
    }

    return NextResponse.json({
      valid: true,
      promotion: {
        id: promotion.id,
        name: promotion.name,
        type: promotion.type,
        value: promotion.value,
      },
      discount: evaluation.discountCents / 100,
    });
  } catch (error) {
    console.error("Error validating promotion:", error);
    return NextResponse.json({ error: "Failed to validate promotion" }, { status: 500 });
  }
}

export const POST = withAccess(MANAGEMENT, handlePOST);
