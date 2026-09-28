import { withAccess, MANAGEMENT, OPERATIONS } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { WASTE_REASONS } from "@/lib/operations/waste";
import { prisma } from "@/lib/prisma";

const wasteInputSchema = z.object({
  ingredientId: z.string().trim().min(1),
  quantity: z.number().finite().positive(),
  reason: z.enum(WASTE_REASONS),
  cost: z.number().finite().min(0),
  recordedBy: z.string().max(200).nullable().optional(),
});

async function handleGET() {
  try {
    const records = await prisma.wasteRecord.findMany({
      include: {
        ingredient: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(records);
  } catch (error) {
    console.error("Error fetching waste records:", error);
    return NextResponse.json({ error: "Failed to fetch waste records" }, { status: 500 });
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const input = wasteInputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") },
        { status: 422 },
      );
    }
    const { ingredientId, quantity, reason, cost, recordedBy } = input.data;

    const ingredient = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: { id: true },
    });
    if (!ingredient) {
      return NextResponse.json({ error: "ingredientId: ingredient not found" }, { status: 422 });
    }

    // The waste record, its stock movement and the stock decrement must all
    // land together, otherwise inventory drifts away from the waste log.
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.wasteRecord.create({
        data: {
          ingredientId,
          quantity,
          reason,
          cost,
          recordedBy: recordedBy || null,
        },
        include: { ingredient: true },
      });

      await tx.stockMovement.create({
        data: {
          ingredientId,
          type: "WASTED",
          quantity: -quantity,
          reason,
        },
      });

      await tx.ingredient.update({
        where: { id: ingredientId },
        data: {
          currentStock: {
            decrement: quantity,
          },
        },
      });

      return created;
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Error creating waste record:", error);
    return NextResponse.json({ error: "Failed to create waste record" }, { status: 500 });
  }
}

export const GET = withAccess(MANAGEMENT, handleGET);

export const POST = withAccess(OPERATIONS, handlePOST);
