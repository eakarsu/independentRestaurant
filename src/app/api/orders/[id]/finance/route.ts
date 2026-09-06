import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  requireActor,
  ORDER_READ_ROLES,
  ORDER_WRITE_ROLES,
  AuthorizationError,
} from "@/lib/commerce/authz";
import { withAccess } from "@/lib/commerce/access";
import { body } from "@/lib/operations/core";
import {
  beginPayment,
  reconcilePayment,
  reconcileRefund,
  requestRefund,
} from "@/lib/commerce/payments";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pay") }),
  z.object({
    action: z.enum(["reconcile", "expire", "refund-reconcile"]),
    reference: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("refund"),
    amountCents: z.number().int().positive(),
    reason: z.string().trim().min(3).max(500),
    confirmed: z.literal(true),
  }),
]);
export const GET = withAccess(
  ORDER_READ_ROLES,
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const actor = await requireActor(ORDER_READ_ROLES),
      { id } = await params;
    const order = await prisma.order.findFirst({
      where: {
        id,
        ...(actor.role === "CUSTOMER"
          ? { customer: { userId: actor.userId } }
          : {}),
      },
      select: {
        id: true,
        total: true,
        currency: true,
        status: true,
        paymentStatus: true,
        lastError: true,
        paymentAttempts: { orderBy: { createdAt: "desc" }, take: 100 },
        refunds: { orderBy: { createdAt: "desc" }, take: 100 },
        payments: true,
      },
    });
    return order
      ? Response.json({
          order,
          canRefund: ["ADMIN", "MERCHANT", "MANAGER"].includes(actor.role),
        })
      : Response.json({ error: "Order not found" }, { status: 404 });
  },
);
export const POST = withAccess(
  ORDER_WRITE_ROLES,
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const actor = await requireActor(ORDER_WRITE_ROLES),
        { id: orderId } = await params,
        input = schema.parse(await body(request));
      if (input.action === "pay")
        return Response.json(
          await beginPayment({
            orderId,
            actor,
            idempotencyKey: request.headers.get("idempotency-key") || "",
          }),
        );
      if (input.action === "refund")
        return Response.json(
          await requestRefund({
            orderId,
            actor,
            amountCents: input.amountCents,
            reason: input.reason,
            idempotencyKey: request.headers.get("idempotency-key") || "",
          }),
        );
      if (input.action === "refund-reconcile")
        return Response.json(
          await reconcileRefund({ orderId, actor, reference: input.reference }),
        );
      return Response.json(
        await reconcilePayment({
          orderId,
          actor,
          reference: input.reference,
          expire: input.action === "expire",
        }),
      );
    } catch (error) {
      const status =
        error instanceof z.ZodError
          ? 422
          : (error as { status?: number }).status || 502;
      return Response.json(
        {
          error:
            status < 500 && error instanceof Error
              ? error.message
              : "Provider outcome was not confirmed. Refresh receipts and reconcile before another request.",
        },
        { status },
      );
    }
  },
);
