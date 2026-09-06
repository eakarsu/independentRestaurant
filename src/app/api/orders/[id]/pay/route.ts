import { withAccess } from '@/lib/commerce/access';
import { body as boundedBody } from '@/lib/operations/core';
import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, ORDER_WRITE_ROLES, requireActor } from "@/lib/commerce/authz";
import { beginPayment } from "@/lib/commerce/payments";

export const POST = withAccess(ORDER_WRITE_ROLES, async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await requireActor(ORDER_WRITE_ROLES);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey) return NextResponse.json({ error: "Idempotency-Key header is required" }, { status: 400 });
    return NextResponse.json(await beginPayment({ orderId: params.id, idempotencyKey, actor }));
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : (error as { status?: number }).status ?? 502;
    return NextResponse.json({ error: status<500 && error instanceof Error ? error.message : "Payment outcome not confirmed. Reconcile before another request." }, { status });
  }
});
