import { withAccess, MANAGEMENT, OPERATIONS } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { WASTE_REASONS } from "@/lib/operations/waste";
import { prisma } from "@/lib/prisma";

/**
 * Edit or remove a single waste record.
 *
 * Waste is not just a row: creating one also writes a StockMovement and
 * decrements the ingredient's currentStock. Deleting or editing the row alone
 * would leave inventory permanently wrong, so every change here reverses the
 * stock effect as well, inside one transaction.
 */
type Params = { params: Promise<{ id: string }> };

async function handlePATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.wasteRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Waste record not found" }, { status: 404 });
    }

    const data: { quantity?: number; reason?: string; cost?: number } = {};

    if (body.quantity !== undefined) {
      const quantity = Number(body.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json({ error: "quantity must be a positive number" }, { status: 400 });
      }
      data.quantity = quantity;
    }
    if (body.reason !== undefined) {
      if (!WASTE_REASONS.includes(body.reason)) {
        return NextResponse.json(
          { error: `reason must be one of: ${WASTE_REASONS.join(", ")}` },
          { status: 400 },
        );
      }
      data.reason = body.reason;
    }
    if (body.cost !== undefined) {
      const cost = Number(body.cost);
      if (!Number.isFinite(cost) || cost < 0) {
        return NextResponse.json({ error: "cost must be zero or greater" }, { status: 400 });
      }
      data.cost = cost;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // If the quantity changed, move the stock by the difference: give back
      // what the old record took, then take what the new one should.
      if (data.quantity !== undefined && data.quantity !== existing.quantity) {
        const delta = existing.quantity - data.quantity;
        await tx.ingredient.update({
          where: { id: existing.ingredientId },
          data: { currentStock: { increment: delta } },
        });
        await tx.stockMovement.create({
          data: {
            ingredientId: existing.ingredientId,
            type: "WASTED",
            quantity: -data.quantity,
            reason: `Correction of waste record ${existing.id}`,
          },
        });
      }
      return tx.wasteRecord.update({
        where: { id },
        data,
        include: { ingredient: true },
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating waste record:", error);
    return NextResponse.json({ error: "Failed to update waste record" }, { status: 500 });
  }
}

async function handleDELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.wasteRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Waste record not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Put the wasted quantity back before removing the record.
      await tx.ingredient.update({
        where: { id: existing.ingredientId },
        data: { currentStock: { increment: existing.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          ingredientId: existing.ingredientId,
          type: "WASTED",
          quantity: existing.quantity,
          reason: `Reversal of deleted waste record ${existing.id}`,
        },
      });
      await tx.wasteRecord.delete({ where: { id } });
    });

    return NextResponse.json({ deleted: true, id, restoredQuantity: existing.quantity });
  } catch (error) {
    console.error("Error deleting waste record:", error);
    return NextResponse.json({ error: "Failed to delete waste record" }, { status: 500 });
  }
}

export const PATCH = withAccess(OPERATIONS, handlePATCH);
export const DELETE = withAccess(MANAGEMENT, handleDELETE);
