import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePromotionCode } from "@/lib/commerce/promotions";

const promotionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  code: z.string().trim().min(3).max(64).optional().nullable(),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "BUY_ONE_GET_ONE", "FREE_ITEM", "HAPPY_HOUR"]),
  value: z.number().nonnegative().max(100000),
  minOrderAmount: z.number().nonnegative().max(1000000).optional().nullable(),
  maxDiscount: z.number().nonnegative().max(1000000).optional().nullable(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  usageLimit: z.number().int().nonnegative().optional().nullable(),
  applicableTo: z.array(z.string().min(1)).max(200).optional(),
  dayOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
});

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
    const parsed = promotionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
        { status: 422 },
      );
    }
    const body = parsed.data;
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return NextResponse.json({ error: "endDate must be after startDate" }, { status: 422 });
    }
    if ((body.type === "PERCENTAGE" || body.type === "HAPPY_HOUR") && body.value > 100) {
      return NextResponse.json({ error: "Percentage promotions cannot exceed 100" }, { status: 422 });
    }

    const promotion = await prisma.promotion.create({
      data: {
        name: body.name,
        description: body.description,
        code: body.code ? normalizePromotionCode(body.code) : null,
        type: body.type,
        value: body.value,
        minOrderAmount: body.minOrderAmount,
        maxDiscount: body.maxDiscount,
        startDate,
        endDate,
        usageLimit: body.usageLimit,
        applicableTo: body.applicableTo || ["all"],
        dayOfWeek: body.dayOfWeek || [],
        startTime: body.startTime,
        endTime: body.endTime,
      },
    });

    return NextResponse.json(promotion, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A promotion with this code already exists" }, { status: 409 });
    }
    console.error("Error creating promotion:", error);
    return NextResponse.json(
      { error: "Failed to create promotion" },
      { status: 500 }
    );
  }
}

export const GET = withAccess(MANAGEMENT, handleGET);

export const POST = withAccess(MANAGEMENT, handlePOST);
