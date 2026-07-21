import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AuthorizationError, ORDER_READ_ROLES, requireActor } from "@/lib/commerce/authz";

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await requireActor(ORDER_READ_ROLES);
    const order = await prisma.order.findFirst({ where: { id: params.id, ...(actor.role === "CUSTOMER" ? { customer: { userId: actor.userId } } : {}) } });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json(await prisma.splitCheck.findMany({ where: { orderId: order.id }, include: { items: true, payments: true }, orderBy: { guestNumber: "asc" } }));
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Split check read failed" }, { status });
  }
}

export async function POST() {
  return NextResponse.json({ error: "Split-check mutation is disabled until it uses the provider-backed payment workflow" }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ error: "Direct split-check payment is disabled; use the provider-backed payment workflow" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: "Split-check evidence is retained" }, { status: 405 });
}
