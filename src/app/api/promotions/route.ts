import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function handleGET() {
  try {
    const promotions = await prisma.promotion.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(promotions);
  } catch (error) {
    console.error("Error fetching promotions:", error);
    return NextResponse.json(
      { error: "Failed to fetch promotions" },
      { status: 500 }
    );
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      code,
      type,
      value,
      minOrderAmount,
      maxDiscount,
      startDate,
      endDate,
      usageLimit,
      applicableTo,
      dayOfWeek,
      startTime,
      endTime,
    } = body;

    const promotion = await prisma.promotion.create({
      data: {
        name,
        description,
        code: code || null,
        type,
        value,
        minOrderAmount,
        maxDiscount,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        usageLimit,
        applicableTo: applicableTo || ["all"],
        dayOfWeek: dayOfWeek || [],
        startTime,
        endTime,
      },
    });

    return NextResponse.json(promotion, { status: 201 });
  } catch (error) {
    console.error("Error creating promotion:", error);
    return NextResponse.json(
      { error: "Failed to create promotion" },
      { status: 500 }
    );
  }
}

export const GET = withAccess(MANAGEMENT, handleGET);

export const POST = withAccess(MANAGEMENT, handlePOST);
