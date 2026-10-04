import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { beginPayment, reconcilePayment } from '@/lib/commerce/payments';
import { body, OperationError } from '@/lib/operations/core';
import { assertGuestOrigin, guestActor, guestResponse } from '@/lib/commerce/guest-session';
import { guestStripeSandboxReady, splitStripeSandboxReady } from '@/lib/commerce/guest-payment';
import { receiptCents } from '@/lib/commerce/split-tender';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pay') }).strict(),
  z.object({ action: z.literal('reconcile'), reference: z.string().trim().regex(/^cs_[A-Za-z0-9_]+$/).max(200) }).strict(),
]);

async function ownedOrder(id: string, userId: string) {
  const order = await prisma.order.findFirst({
    where: { id, customer: { userId }, type: 'TAKEOUT', source: 'online' },
    select: { id: true, status: true, paymentStatus: true, total: true, currency: true, lastError: true,
      paymentAttempts: { orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, status: true, amountCents: true, currency: true, providerRef: true, failureMessage: true, createdAt: true } },
      refunds: { orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, provider: true, status: true, amountCents: true, currency: true, providerRef: true, reason: true, createdAt: true } },
      payments: { select: { id: true, amount: true, method: true, status: true, reference: true, createdAt: true } },
    },
  });
  if (!order) throw new OperationError('Order not found', 404);
  return order;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guestResponse(async () => {
    const actor = await guestActor(request);
    const order = await ownedOrder((await params).id, actor.userId);
    const cashCents = order.payments.filter(payment => payment.status === 'completed' && payment.method.toLowerCase() === 'cash').reduce((sum, payment) => sum + receiptCents(payment.amount), 0);
    const cardCents = order.payments.filter(payment => payment.status === 'completed' && payment.method.toLowerCase() !== 'cash').reduce((sum, payment) => sum + receiptCents(payment.amount), 0);
    return Response.json({ order, canRefund: false, canRecordCash: false, checkoutEnabled: guestStripeSandboxReady() && (!cashCents || splitStripeSandboxReady()), splitCheckoutEnabled: splitStripeSandboxReady(), totalCents: receiptCents(order.total), capturedCashCents: cashCents, capturedCardCents: cardCents, refundedCashCents: order.refunds.filter(refund => refund.provider === 'cash' && refund.status === 'SUCCEEDED').reduce((sum, refund) => sum + refund.amountCents, 0) }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guestResponse(async () => {
    assertGuestOrigin(request);
    const actor = await guestActor(request);
    const orderId = (await params).id;
    await ownedOrder(orderId, actor.userId);
    const input = actionSchema.parse(await body(request));
    if (!guestStripeSandboxReady()) return Response.json({ error: 'Guest card checkout is unavailable until the Stripe sandbox is enabled' }, { status: 503 });
    if (input.action === 'pay') {
      const idempotencyKey = request.headers.get('idempotency-key') || '';
      if (!/^[\w][\w.:-]{7,127}$/.test(idempotencyKey)) throw new OperationError('Request key required', 422);
      try { return Response.json(await beginPayment({ orderId, actor, idempotencyKey })); }
      catch (error) {
        if ((error as { status?: number }).status) throw error;
        return Response.json({ error: 'Provider outcome is unconfirmed. Refresh receipts and retry this checkout request; the saved attempt uses the original payment key.' }, { status: 502 });
      }
    }
    const attempt = await prisma.paymentAttempt.findFirst({ where: { orderId, providerRef: input.reference, provider: 'stripe' }, select: { id: true } });
    if (!attempt) throw new OperationError('Checkout reference does not belong to this order', 404);
    try { return Response.json(await reconcilePayment({ orderId, actor, reference: input.reference })); }
    catch (error) {
      if ((error as { status?: number }).status) throw error;
      return Response.json({ error: 'Provider receipt is unconfirmed. Refresh receipts and retry reconciliation before starting another payment.' }, { status: 502 });
    }
  });
}
