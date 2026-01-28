import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ingredientId, quantity, reason, cost, recordedBy } = body;

    // Create waste record
    const record = await prisma.wasteRecord.create({
      data: {
        ingredientId,
        quantity,
        reason,
        cost,
        recordedBy: recordedBy || null,
      },
      include: { ingredient: true },
    });

    // Also create a stock movement for the waste
    await prisma.stockMovement.create({
      data: {
        ingredientId,
        type: "WASTED",
        quantity: -quantity,
        reason,
      },
    });

    // Update ingredient stock
    await prisma.ingredient.update({
      where: { id: ingredientId },
      data: {
        currentStock: {
          decrement: quantity,
        },
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Error creating waste record:", error);
    return NextResponse.json({ error: "Failed to create waste record" }, { status: 500 });
  }
}
