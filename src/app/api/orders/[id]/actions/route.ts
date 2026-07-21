import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthorizationError, ORDER_CONTROL_ROLES, requireActor } from "@/lib/commerce/authz";
import { transitionOrder } from "@/lib/commerce/orders";
import { ORDER_STATES } from "@/lib/commerce/state-machine";

const schema = z.object({ toStatus: z.enum(ORDER_STATES), reason: z.string().trim().max(1000).optional() });

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await requireActor(ORDER_CONTROL_ROLES);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey) return NextResponse.json({ error: "Idempotency-Key header is required" }, { status: 400 });
    const input = schema.parse(await request.json());
    return NextResponse.json(await transitionOrder({ orderId: params.id, idempotencyKey, actor, ...input }));
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : (error as { status?: number }).status ?? ((error as { name?: string }).name === "ZodError" ? 400 : 409);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Order transition failed" }, { status });
  }
}
