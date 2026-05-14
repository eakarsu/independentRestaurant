import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { deductIngredients } from "@/lib/inventory";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    const itemTotal = body.unitPrice * body.quantity;
    const modifiersTotal = (body.modifiers || []).reduce((sum: number, m: { priceAdjustment: number }) => sum + m.priceAdjustment, 0) * body.quantity;

    const orderItem = await prisma.orderItem.create({
      data: {
        orderId: params.id,
        menuItemId: body.menuItemId,
        quantity: body.quantity,
        unitPrice: body.unitPrice,
        totalPrice: itemTotal + modifiersTotal,
        notes: body.notes,
        modifiers: {
          create: (body.modifiers || []).map((m: { modifierId: string; priceAdjustment: number }) => ({
            modifierId: m.modifierId,
            priceAdjustment: m.priceAdjustment,
          })),
        },
      },
      include: {
        menuItem: true,
        modifiers: {
          include: {
            modifier: true,
          },
        },
      },
    });

    // Update order totals
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { items: true },
    });

    if (order) {
      const subtotal = order.items.reduce((sum, item) => sum + item.totalPrice, 0) + itemTotal + modifiersTotal;
      const tax = subtotal * 0.0875;
      const total = subtotal + tax - order.discount + order.tip;

      await prisma.order.update({
        where: { id: params.id },
        data: { subtotal, tax, total },
      });
    }

    // Auto-deduct ingredients from inventory based on recipe_ingredients
    const inventoryAlerts = await deductIngredients(
      body.menuItemId,
      body.quantity,
      params.id
    );

    return NextResponse.json(
      { ...orderItem, inventoryAlerts },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error adding order item:", error);
    return NextResponse.json({ error: "Failed to add order item" }, { status: 500 });
  }
}
