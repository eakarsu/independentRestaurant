import { withAccess } from '@/lib/commerce/access';
import { body as boundedBody } from '@/lib/operations/core';
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthorizationError, REFUND_ROLES, requireActor } from "@/lib/commerce/authz";
import { requestRefund } from "@/lib/commerce/payments";

const schema = z.object({ amountCents: z.number().int().positive(), reason: z.string().trim().min(3).max(500) });

export const POST = withAccess(REFUND_ROLES, async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await requireActor(REFUND_ROLES);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey) return NextResponse.json({ error: "Idempotency-Key header is required" }, { status: 400 });
    const body = schema.parse(await boundedBody(request));
    return NextResponse.json(await requestRefund({ orderId: params.id, idempotencyKey, actor, ...body }), { status: 202 });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : (error as { status?: number }).status ?? ((error as { name?: string }).name === "ZodError" ? 400 : 502);
    return NextResponse.json({ error: status<500 && error instanceof Error ? error.message : "Refund outcome not confirmed. Reconcile before another request." }, { status });
  }
});
