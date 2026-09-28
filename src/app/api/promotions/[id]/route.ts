import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePromotionCode } from "@/lib/commerce/promotions";

const promotionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  code: z.string().trim().min(3).max(64).optional().nullable(),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "BUY_ONE_GET_ONE", "FREE_ITEM", "HAPPY_HOUR"]).optional(),
  value: z.number().nonnegative().max(100000).optional(),
  minOrderAmount: z.number().nonnegative().max(1000000).optional().nullable(),
  maxDiscount: z.number().nonnegative().max(1000000).optional().nullable(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  usageLimit: z.number().int().nonnegative().optional().nullable(),
  applicableTo: z.array(z.string().min(1)).max(200).optional(),
  dayOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  isActive: z.boolean().optional(),
});

async function handleGET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const promotion = await prisma.promotion.findUnique({
      where: { id: params.id },
    });

    if (!promotion) {
      return NextResponse.json(
        { error: "Promotion not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(promotion);
  } catch (error) {
    console.error("Error fetching promotion:", error);
    return NextResponse.json(
      { error: "Failed to fetch promotion" },
      { status: 500 }
    );
  }
}

async function handlePUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const parsed = promotionUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
        { status: 422 },
      );
    }
    const body = parsed.data;
    const data: Prisma.PromotionUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.code !== undefined) data.code = body.code ? normalizePromotionCode(body.code) : null;
    if (body.type !== undefined) data.type = body.type;
    if (body.value !== undefined) data.value = body.value;
    if (body.minOrderAmount !== undefined) data.minOrderAmount = body.minOrderAmount;
    if (body.maxDiscount !== undefined) data.maxDiscount = body.maxDiscount;
    if (body.usageLimit !== undefined) data.usageLimit = body.usageLimit;
    if (body.applicableTo !== undefined) data.applicableTo = body.applicableTo;
    if (body.dayOfWeek !== undefined) data.dayOfWeek = body.dayOfWeek;
    if (body.startTime !== undefined) data.startTime = body.startTime;
    if (body.endTime !== undefined) data.endTime = body.endTime;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.startDate !== undefined) {
      const startDate = new Date(body.startDate);
      if (Number.isNaN(startDate.getTime())) return NextResponse.json({ error: "startDate is invalid" }, { status: 422 });
      data.startDate = startDate;
    }
    if (body.endDate !== undefined) {
      const endDate = new Date(body.endDate);
      if (Number.isNaN(endDate.getTime())) return NextResponse.json({ error: "endDate is invalid" }, { status: 422 });
      data.endDate = endDate;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 });
    }

    const promotion = await prisma.promotion.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(promotion);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A promotion with this code already exists" }, { status: 409 });
    }
    console.error("Error updating promotion:", error);
    return NextResponse.json(
      { error: "Failed to update promotion" },
      { status: 500 }
    );
  }
}

async function handleDELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await prisma.promotion.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting promotion:", error);
    return NextResponse.json(
      { error: "Failed to delete promotion" },
      { status: 500 }
    );
  }
}

export const GET = withAccess(MANAGEMENT, handleGET);

export const PUT = withAccess(MANAGEMENT, handlePUT);

export const DELETE = withAccess(MANAGEMENT, handleDELETE);
