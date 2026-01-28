import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { code, orderTotal, orderItems } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: "Promo code is required" },
        { status: 400 }
      );
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const promotion = await prisma.promotion.findFirst({
      where: {
        code: code.toUpperCase(),
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });

    if (!promotion) {
      return NextResponse.json(
        { valid: false, error: "Invalid or expired promo code" },
        { status: 200 }
      );
    }

    // Check usage limit
    if (promotion.usageLimit && promotion.usageCount >= promotion.usageLimit) {
      return NextResponse.json(
        { valid: false, error: "Promo code has reached its usage limit" },
        { status: 200 }
      );
    }

    // Check minimum order amount
    if (promotion.minOrderAmount && orderTotal < promotion.minOrderAmount) {
      return NextResponse.json(
        {
          valid: false,
          error: `Minimum order of $${promotion.minOrderAmount} required`,
        },
        { status: 200 }
      );
    }

    // Check day of week
    if (promotion.dayOfWeek.length > 0 && !promotion.dayOfWeek.includes(currentDay)) {
      return NextResponse.json(
        { valid: false, error: "This promo is not valid today" },
        { status: 200 }
      );
    }

    // Check time window for happy hour
    if (promotion.startTime && promotion.endTime) {
      if (currentTime < promotion.startTime || currentTime > promotion.endTime) {
        return NextResponse.json(
          {
            valid: false,
            error: `This promo is only valid from ${promotion.startTime} to ${promotion.endTime}`,
          },
          { status: 200 }
        );
      }
    }

    // Calculate discount
    let discount = 0;
    switch (promotion.type) {
      case "PERCENTAGE":
        discount = (orderTotal * promotion.value) / 100;
        if (promotion.maxDiscount && discount > promotion.maxDiscount) {
          discount = promotion.maxDiscount;
        }
        break;
      case "FIXED_AMOUNT":
        discount = Math.min(promotion.value, orderTotal);
        break;
      case "HAPPY_HOUR":
        discount = (orderTotal * promotion.value) / 100;
        break;
      default:
        discount = 0;
    }

    return NextResponse.json({
      valid: true,
      promotion: {
        id: promotion.id,
        name: promotion.name,
        type: promotion.type,
        value: promotion.value,
      },
      discount: Math.round(discount * 100) / 100,
    });
  } catch (error) {
    console.error("Error validating promotion:", error);
    return NextResponse.json(
      { error: "Failed to validate promotion" },
      { status: 500 }
    );
  }
}
