import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { emitOrderStatusChanged } from "@/lib/socket-server";
import { sendOrderReadyEmail } from "@/lib/email";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        table: true,
        customer: true,
        staff: true,
        items: {
          include: {
            menuItem: true,
            modifiers: {
              include: {
                modifier: true,
              },
            },
          },
        },
        payments: true,
        delivery: true,
      },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    // Fetch the current order so we can detect a status transition
    const existing = await prisma.order.findUnique({
      where: { id: params.id },
      select: { status: true, orderNumber: true, type: true },
    });

    const order = await prisma.order.update({
      where: { id: params.id },
      data: {
        status: body.status,
        paymentStatus: body.paymentStatus,
        paymentMethod: body.paymentMethod,
        tip: body.tip,
        discount: body.discount,
        notes: body.notes,
      },
      include: {
        table: true,
        customer: true,
        items: {
          include: {
            menuItem: true,
          },
        },
      },
    });

    // Emit real-time event if status changed
    if (existing && body.status && existing.status !== body.status) {
      emitOrderStatusChanged({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        previousStatus: existing.status,
        type: order.type,
      });

      // Send ready-for-pickup email when order reaches READY status
      if (order.status === "READY" && order.customer?.email) {
        sendOrderReadyEmail({
          orderNumber: order.orderNumber,
          customerName: `${order.customer.firstName} ${order.customer.lastName}`,
          customerEmail: order.customer.email,
          type: order.type,
        });
      }
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error("Error updating order:", error);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Delete order items first
    await prisma.orderItemModifier.deleteMany({
      where: {
        orderItem: {
          orderId: params.id,
        },
      },
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: params.id },
    });
    await prisma.order.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting order:", error);
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}
