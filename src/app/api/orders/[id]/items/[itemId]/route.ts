import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthorizationError, ORDER_CONTROL_ROLES, requireActor } from "@/lib/commerce/authz";
import { transitionOrderItem } from "@/lib/commerce/orders";

const schema = z.object({
  toStatus: z.enum(["PENDING", "SENT", "PREPARING", "READY", "SERVED", "CANCELLED"]),
  reason: z.string().trim().max(500).optional(),
});

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string; itemId: string }> }
) {
  const params = await props.params;
  try {
    const actor = await requireActor(ORDER_CONTROL_ROLES);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey) return NextResponse.json({ error: "Idempotency-Key header is required" }, { status: 400 });
    const body = schema.parse(await request.json());
    return NextResponse.json(await transitionOrderItem({ orderId: params.id, itemId: params.itemId, idempotencyKey, actor, ...body }));
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : (error as { status?: number }).status ?? 409;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Item transition failed" }, { status });
  }
}

export async function DELETE() {
  return NextResponse.json({ error: "Order items and their audit history are immutable" }, { status: 405 });
}
