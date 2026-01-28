import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const body = await request.json();
    const orderItem = await prisma.orderItem.update({
      where: { id: params.itemId },
      data: {
        quantity: body.quantity,
        status: body.status,
        notes: body.notes,
        sentToKitchen: body.sentToKitchen ? new Date() : undefined,
        preparedAt: body.preparedAt ? new Date() : undefined,
      },
      include: {
        menuItem: true,
      },
    });
    return NextResponse.json(orderItem);
  } catch (error) {
    console.error("Error updating order item:", error);
    return NextResponse.json({ error: "Failed to update order item" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    // Delete modifiers first
    await prisma.orderItemModifier.deleteMany({
      where: { orderItemId: params.itemId },
    });

    const deletedItem = await prisma.orderItem.delete({
      where: { id: params.itemId },
    });

    // Update order totals
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { items: true },
    });

    if (order) {
      const subtotal = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
      const tax = subtotal * 0.0875;
      const total = subtotal + tax - order.discount + order.tip;

      await prisma.order.update({
        where: { id: params.id },
        data: { subtotal, tax, total },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting order item:", error);
    return NextResponse.json({ error: "Failed to delete order item" }, { status: 500 });
  }
}
