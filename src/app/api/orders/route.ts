import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateOrderNumber } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const date = searchParams.get("date");

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.createdAt = {
        gte: startOfDay,
        lt: endOfDay,
      };
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
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
      },
    });
    return NextResponse.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Calculate totals
    let subtotal = 0;
    const itemsData = body.items.map((item: { menuItemId: string; quantity: number; unitPrice: number; notes?: string; modifiers?: { modifierId: string; priceAdjustment: number }[] }) => {
      const itemTotal = item.unitPrice * item.quantity;
      const modifiersTotal = (item.modifiers || []).reduce((sum: number, m: { priceAdjustment: number }) => sum + m.priceAdjustment, 0) * item.quantity;
      subtotal += itemTotal + modifiersTotal;
      return {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: itemTotal + modifiersTotal,
        notes: item.notes,
        modifiers: {
          create: (item.modifiers || []).map((m: { modifierId: string; priceAdjustment: number }) => ({
            modifierId: m.modifierId,
            priceAdjustment: m.priceAdjustment,
          })),
        },
      };
    });

    const tax = subtotal * 0.0875; // 8.75% tax
    const total = subtotal + tax - (body.discount || 0) + (body.tip || 0);

    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        tableId: body.tableId,
        customerId: body.customerId,
        staffId: body.staffId,
        type: body.type || "DINE_IN",
        status: "PENDING",
        subtotal,
        tax,
        discount: body.discount || 0,
        tip: body.tip || 0,
        total,
        notes: body.notes,
        source: body.source || "pos",
        items: {
          create: itemsData,
        },
      },
      include: {
        table: true,
        customer: true,
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
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
