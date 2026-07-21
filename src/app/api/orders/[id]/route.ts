import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AuthorizationError, ORDER_READ_ROLES, requireActor } from "@/lib/commerce/authz";
import { verifyOrderAuditChain } from "@/lib/commerce/orders";

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await requireActor(ORDER_READ_ROLES);
    const order = await prisma.order.findFirst({
      where: { id: params.id, ...(actor.role === "CUSTOMER" ? { customer: { userId: actor.userId } } : {}) },
      include: {
        table: true,
        customer: true,
        staff: true,
        items: { include: { menuItem: true, modifiers: { include: { modifier: true } } } },
        payments: true,
        paymentAttempts: true,
        refunds: true,
        delivery: true,
        events: { orderBy: { sequence: "asc" } },
        inventoryReservations: { include: { lines: true } },
      },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ ...order, auditChainValid: await verifyOrderAuditChain(order.id) });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch order" }, { status });
  }
}

export async function PUT() {
  return NextResponse.json({ error: "Direct order mutation is disabled; use /api/orders/:id/actions" }, { status: 405, headers: { Allow: "GET" } });
}

export async function DELETE() {
  return NextResponse.json({ error: "Orders and audit history are immutable" }, { status: 405, headers: { Allow: "GET" } });
}
