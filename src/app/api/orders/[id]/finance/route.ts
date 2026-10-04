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
  recordCashTender,
  refundCashTender,
} from "@/lib/commerce/payments";
import { splitStripeSandboxReady } from '@/lib/commerce/guest-payment';
import { receiptCents } from '@/lib/commerce/split-tender';
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pay") }),
  z.object({ action: z.literal('cash'), amountCents: z.number().int().positive(), cashReceivedCents: z.number().int().positive(), confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal('cash-refund'), amountCents: z.number().int().positive(), reason: z.string().trim().min(3).max(500), cashReturnedConfirmed: z.literal(true) }).strict(),
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
          canRecordCash: ['ADMIN', 'MERCHANT', 'MANAGER', 'OPERATOR', 'STAFF', 'HOST'].includes(actor.role) && ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'].includes(order.status) && ['UNPAID', 'FAILED'].includes(order.paymentStatus) && !order.payments.some(payment => payment.status === 'completed') && !order.paymentAttempts.length,
          splitCheckoutEnabled: splitStripeSandboxReady(),
          totalCents: receiptCents(order.total),
          capturedCashCents: order.payments.filter(payment => payment.status === 'completed' && payment.method.toLowerCase() === 'cash').reduce((sum, payment) => sum + receiptCents(payment.amount), 0),
          capturedCardCents: order.payments.filter(payment => payment.status === 'completed' && payment.method.toLowerCase() !== 'cash').reduce((sum, payment) => sum + receiptCents(payment.amount), 0),
          refundedCashCents: order.refunds.filter(refund => refund.provider === 'cash' && refund.status === 'SUCCEEDED').reduce((sum, refund) => sum + refund.amountCents, 0),
        }, { headers: { 'Cache-Control': 'no-store' } })
      : Response.json({ error: "Order not found" }, { status: 404 });
  },
);
export const POST = withAccess(
  ORDER_WRITE_ROLES,
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin && origin !== process.env.NEXTAUTH_URL)
        throw new AuthorizationError('Cross-origin finance request is not permitted', 403);
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
      if (input.action === 'cash') {
        if (!splitStripeSandboxReady()) return Response.json({ error: 'Split tender is unavailable until Stripe test-mode checkout and webhook are accepted' }, { status: 503 });
        return Response.json(await recordCashTender({ orderId, actor, idempotencyKey: request.headers.get('idempotency-key') || '', amountCents: input.amountCents, cashReceivedCents: input.cashReceivedCents }));
      }
      if (input.action === 'cash-refund')
        return Response.json(await refundCashTender({ orderId, actor, idempotencyKey: request.headers.get('idempotency-key') || '', amountCents: input.amountCents, reason: input.reason, cashReturnedConfirmed: input.cashReturnedConfirmed }));
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
