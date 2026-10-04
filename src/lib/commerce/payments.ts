import { Prisma, type OrderStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  ORDER_WRITE_ROLES,
  REFUND_ROLES,
  AuthorizationError,
  type Actor,
} from "./authz";
import { auditHash } from "./crypto";
import { CommerceConflictError, CommerceValidationError } from "./orders";
import {
  StripePaymentProvider,
  type PaymentProvider,
  type RefundReceipt,
} from "./providers";
import { splitStripeSandboxReady } from './guest-payment';
import { receiptCents, refundedPaymentStatus, splitTenderBalance } from './split-tender';

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function appendPaymentEvent(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    type: string;
    actor: Actor;
    idempotencyKey: string;
    payload: unknown;
    fromStatus?: OrderStatus | null;
    toStatus?: OrderStatus | null;
  },
) {
  const prior = await tx.orderEvent.findFirst({
    where: { orderId: input.orderId },
    orderBy: { sequence: "desc" },
  });
  const order = await tx.order.findUniqueOrThrow({
    where: { id: input.orderId },
  });
  const sequence = (prior?.sequence ?? 0) + 1;
  const actorUserId =
    input.actor.role === "PROVIDER" ? null : input.actor.userId;
  // Hash the JSON shape that is actually persisted; JSON.stringify drops
  // `undefined` members and hashing the raw payload would break verification.
  const payload = toJson(input.payload);
  const fields = {
    orderId: input.orderId,
    sequence,
    type: input.type,
    fromStatus: input.fromStatus ?? order.status,
    toStatus: input.toStatus ?? order.status,
    actorUserId,
    actorRole: input.actor.role,
    idempotencyKey: input.idempotencyKey,
    payload,
    previousHash: prior?.hash ?? null,
  };
  await tx.orderEvent.create({
    data: {
      ...fields,
      hash: auditHash(fields),
    },
  });
}

export class UnrecognizedRefundError extends Error {
  status = 422;
  constructor(message = "Refund receipt is not recognized") {
    super(message);
    this.name = "UnrecognizedRefundError";
  }
}

function validKey(key: string) {
  if (!/^[\w][\w.:-]{7,127}$/.test(key))
    throw new CommerceValidationError("Use an 8–128 character idempotency key");
}
const CASH_TENDER_ROLES = ['ADMIN', 'MERCHANT', 'MANAGER', 'OPERATOR', 'STAFF', 'HOST'];
async function reviewedTotalCents(tx: Prisma.TransactionClient, order: { id: string; total: number }) {
  const totalCents = receiptCents(order.total);
  const pricing = await tx.orderEvent.findFirst({ where: { orderId: order.id, type: 'ORDER_CREATED' } });
  const snapshot = pricing?.payload as { totalCents?: number; taxReference?: string } | undefined;
  if (totalCents <= 0 || snapshot?.totalCents !== totalCents || !snapshot.taxReference)
    throw new CommerceConflictError('This order has no matching server pricing and tax receipt. Reconcile it before payment.');
  return totalCents;
}
async function cashReceipt(tx: Prisma.TransactionClient, orderId: string) {
  const cash = await tx.payment.findMany({ where: { orderId, status: 'completed', method: { equals: 'cash', mode: 'insensitive' } } });
  if (cash.length > 1 || cash.some(row => !row.reference?.startsWith('cash:')))
    throw new CommerceConflictError('Cash tender requires receipt reconciliation');
  if (cash[0]) {
    const event = await tx.orderEvent.findUnique({ where: { orderId_idempotencyKey: { orderId, idempotencyKey: cash[0].reference! } } });
    if (event?.type !== 'CASH_TENDER_COLLECTED' || (event.payload as { paymentId?: string }).paymentId !== cash[0].id)
      throw new CommerceConflictError('Cash receipt has no matching audit event');
  }
  return cash[0] || null;
}
async function capturedTenderCents(tx: Prisma.TransactionClient, orderId: string) {
  const rows = await tx.payment.findMany({ where: { orderId, status: 'completed' } });
  return rows.reduce((sum, row) => sum + receiptCents(row.amount), 0);
}
async function payableOrder(orderId: string, actor: Actor) {
  if (!(ORDER_WRITE_ROLES as readonly string[]).includes(actor.role))
    throw new AuthorizationError("Billing role required");
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) throw new CommerceValidationError("Order not found");
  if (actor.role === "CUSTOMER" && order.customer?.userId !== actor.userId)
    throw new CommerceValidationError(
      "A customer cannot pay another customer's order",
    );
  return order;
}
export async function recordCashTender(input: { orderId: string; actor: Actor; idempotencyKey: string; amountCents: number; cashReceivedCents: number }) {
  if (!CASH_TENDER_ROLES.includes(input.actor.role)) throw new AuthorizationError('Cash tender requires restaurant staff');
  validKey(input.idempotencyKey);
  if (![input.amountCents, input.cashReceivedCents].every(Number.isSafeInteger) || input.amountCents <= 0 || input.cashReceivedCents < input.amountCents || input.cashReceivedCents > 100_000_000)
    throw new CommerceValidationError('Enter the cash amount and actual cash received in cents');
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new CommerceValidationError('Order not found');
    const eventKey = `cash:${input.idempotencyKey}`;
    const prior = await tx.orderEvent.findUnique({ where: { orderId_idempotencyKey: { orderId: order.id, idempotencyKey: eventKey } } });
    if (prior) {
      const payload = prior.payload as { amountCents?: number; cashReceivedCents?: number; paymentId?: string };
      if (prior.actorUserId !== input.actor.userId || payload.amountCents !== input.amountCents || payload.cashReceivedCents !== input.cashReceivedCents || !payload.paymentId)
        throw new CommerceConflictError('Cash request key was used for different tender');
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: payload.paymentId } });
      if (payment.orderId !== order.id || payment.reference !== eventKey || payment.method !== 'cash' || payment.status !== 'completed' || receiptCents(payment.amount) !== input.amountCents)
        throw new CommerceConflictError('Saved cash receipt requires reconciliation');
      return { payment, cardBalanceCents: (await reviewedTotalCents(tx, order)) - input.amountCents, changeCents: input.cashReceivedCents - input.amountCents };
    }
    if (await tx.paymentAttempt.count({ where: { orderId: order.id } }) || await tx.payment.count({ where: { orderId: order.id, status: 'completed' } }))
      throw new CommerceConflictError('Tender already started; reconcile it before changing the cash portion');
    if (!['CONFIRMED', 'PREPARING', 'READY', 'SERVED'].includes(order.status) || !['UNPAID', 'FAILED'].includes(order.paymentStatus))
      throw new CommerceConflictError('Cash split requires an accepted unpaid order');
    const totalCents = await reviewedTotalCents(tx, order);
    if (input.amountCents >= totalCents) throw new CommerceValidationError('Cash portion must be less than the server-priced order total');
    const payment = await tx.payment.create({ data: { orderId: order.id, amount: input.amountCents / 100, method: 'cash', reference: eventKey, status: 'completed' } });
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PARTIAL', paymentMethod: 'cash+card', version: { increment: 1 } } });
    await appendPaymentEvent(tx, { orderId: order.id, type: 'CASH_TENDER_COLLECTED', actor: input.actor, idempotencyKey: eventKey, payload: { paymentId: payment.id, amountCents: input.amountCents, cashReceivedCents: input.cashReceivedCents, changeCents: input.cashReceivedCents - input.amountCents } });
    return { payment, cardBalanceCents: totalCents - input.amountCents, changeCents: input.cashReceivedCents - input.amountCents };
  });
}
export async function beginPayment(
  input: { orderId: string; idempotencyKey: string; actor: Actor },
  provider: PaymentProvider = new StripePaymentProvider(),
) {
  validKey(input.idempotencyKey);
  const order = await payableOrder(input.orderId, input.actor);
  provider.preflight?.();
  const attempt = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
    const duplicate = await tx.paymentAttempt.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (duplicate) {
      if (duplicate.orderId !== order.id)
        throw new CommerceConflictError(
          "Payment idempotency key belongs to another order",
        );
      return duplicate;
    }
    const locked = await tx.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    if (
      ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(locked.paymentStatus)
    )
      throw new CommerceConflictError(
        "Order payment has already been captured",
      );
    const active = await tx.paymentAttempt.findFirst({
      where: {
        orderId: order.id,
        status: { in: ["PENDING", "REQUIRES_ACTION"] },
      },
    });
    if (active) return active;
    if (
      ![
        "CONFIRMED",
        "PAYMENT_FAILED",
        "PREPARING",
        "READY",
        "SERVED",
        "COMPLETED",
      ].includes(locked.status)
    )
      throw new CommerceConflictError(
        `Payment cannot start while order is ${locked.status}`,
      );
    const prior = await tx.paymentAttempt.findFirst({
        where: { orderId: order.id },
        orderBy: { createdAt: "desc" },
      });
    const totalCents = await reviewedTotalCents(tx, locked);
    const cash = await cashReceipt(tx, order.id);
    const cashCents = cash ? receiptCents(cash.amount) : 0;
    if ((await capturedTenderCents(tx, order.id)) !== cashCents)
      throw new CommerceConflictError('A captured payment already exists; reconcile before another checkout');
    if (cashCents && provider instanceof StripePaymentProvider && !splitStripeSandboxReady())
      throw new CommerceConflictError('Split card checkout requires accepted Stripe test-mode credentials and webhook');
    const amountCents = splitTenderBalance(totalCents, cashCents);
    if (amountCents <= 0) throw new CommerceConflictError('Order balance has already been collected');

    const created = await tx.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider: "stripe",
        idempotencyKey: input.idempotencyKey,
        amountCents,
        currency: locked.currency,
        resumeStatus:
          locked.status === "PAYMENT_FAILED"
            ? prior?.resumeStatus || "CONFIRMED"
            : locked.status,
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAYMENT_PENDING",
        paymentStatus: "AUTHORIZING",
        version: { increment: 1 },
      },
    });
    await appendPaymentEvent(tx, {
      orderId: order.id,
      type: "PAYMENT_STARTED",
      actor: input.actor,
      idempotencyKey: `${created.idempotencyKey}:started`,
      payload: { amountCents },
      fromStatus: locked.status,
      toStatus: "PAYMENT_PENDING",
    });
    return created;
  });
  if (attempt.status === "SUCCEEDED") return attempt;
  if (attempt.providerRef && provider.checkout)
    return reconcilePayment(
      { orderId: order.id, actor: input.actor, reference: attempt.providerRef },
      provider,
    );
  if (!["PENDING", "REQUIRES_ACTION"].includes(attempt.status))
    throw new CommerceConflictError("Payment attempt is closed");
  if (attempt.createdAt.getTime() < Date.now() - 23 * 3600000)
    throw new CommerceConflictError(
      "Retry window elapsed. Reconcile the provider checkout session before another payment.",
    );
  try {
    const result = await provider.createIntent({
      idempotencyKey: attempt.idempotencyKey,
      orderId: order.id,
      orderNumber: order.orderNumber,
      money: { amountCents: attempt.amountCents, currency: attempt.currency },
      receiptEmail: order.customer?.email || undefined,
      onlineOrder:order.source==="online",
    });
    // Creation responses never establish a captured receipt. A callback or retrieval must reconcile it.
    await prisma.paymentAttempt.updateMany({
      where: { id: attempt.id, status: { in: ["PENDING", "REQUIRES_ACTION"] } },
      data: {
        providerRef: result.providerRef,
        status: "REQUIRES_ACTION",
        failureCode: null,
        failureMessage: null,
      },
    });
    const current = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    return {
      ...current,
      ...(current.status === "SUCCEEDED"
        ? {}
        : {
            redirectUrl: result.redirectUrl,
            clientSecret: result.clientSecret,
          }),
    };
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
      const current = await tx.paymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
      if (current.status === "SUCCEEDED") return;
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "PENDING",
          failureCode: "OUTCOME_UNKNOWN",
          failureMessage:
            "Provider outcome unknown. Reconcile or retry this request before another payment.",
        },
      });
      const logged = await tx.orderEvent.count({
        where: {
          orderId: order.id,
          idempotencyKey: `${attempt.idempotencyKey}:unknown`,
        },
      });
      if (!logged)
        await appendPaymentEvent(tx, {
          orderId: order.id,
          type: "PAYMENT_OUTCOME_UNKNOWN",
          actor: input.actor,
          idempotencyKey: `${attempt.idempotencyKey}:unknown`,
          payload: { attemptId: attempt.id },
        });
    });
    throw error;
  }
}
export async function reconcilePayment(
  input: { orderId: string; actor: Actor; reference: string; expire?: boolean },
  provider: PaymentProvider = new StripePaymentProvider(),
) {
  await payableOrder(input.orderId, input.actor);
  if (!provider.checkout)
    throw new CommerceConflictError(
      "Provider checkout retrieval is unavailable",
    );
  // Validate the identity before any provider expiration.
  let receipt = await provider.checkout(input.reference);
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { idempotencyKey: receipt.attemptKey },
  });
  if (
    !attempt ||
    attempt.orderId !== input.orderId ||
    receipt.orderId !== input.orderId ||
    receipt.amountCents !== attempt.amountCents ||
    receipt.currency.toUpperCase() !== attempt.currency.toUpperCase() ||
    (attempt.providerRef &&
      attempt.providerRef !== receipt.providerRef &&
      attempt.status !== "SUCCEEDED")
  )
    throw new CommerceConflictError(
      "Checkout identity, amount or currency mismatch",
    );
  if (input.expire && receipt.status === "open")
    receipt = await provider.checkout(input.reference, true);
  if (receipt.status === "paid") {
    if (!receipt.paymentReference)
      throw new CommerceConflictError("Captured payment reference is missing");
    await applyPaymentWebhook({
      eventId: `reconcile:${receipt.providerRef}`,
      eventType: "payment_intent.succeeded",
      paymentReference: receipt.paymentReference,
      orderId: input.orderId,
      attemptKey: attempt.idempotencyKey,
      currency: receipt.currency,
      amountReceivedCents: receipt.amountCents,
    });
  } else if (receipt.status === "expired") {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
      const current = await tx.paymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
      if (current.status === "SUCCEEDED" || current.status === "CANCELLED")
        return;
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "CANCELLED",
          providerRef: receipt.providerRef,
          failureCode: null,
          failureMessage: null,
        },
      });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: input.orderId },
      });
      const restoredStatus =
        order.status === "PAYMENT_PENDING"
          ? attempt.resumeStatus || "CONFIRMED"
          : order.status;
      if (order.status === "PAYMENT_PENDING" || order.status === 'CANCELLED')
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: restoredStatus,
            paymentStatus: (await cashReceipt(tx, order.id)) ? 'PARTIAL' : 'UNPAID',
            version: { increment: 1 },
          },
        });
      await appendPaymentEvent(tx, {
        orderId: input.orderId,
        type: "PAYMENT_CHECKOUT_EXPIRED",
        actor: input.actor,
        idempotencyKey: `${attempt.idempotencyKey}:expired`,
        payload: { reference: receipt.providerRef },
        fromStatus: order.status,
        toStatus: restoredStatus,
      });
    });
  }
  const current = await prisma.paymentAttempt.findUniqueOrThrow({
    where: { id: attempt.id },
  });
  return {
    ...current,
    ...(receipt.status === "open" && current.status !== "SUCCEEDED"
      ? { redirectUrl: receipt.redirectUrl }
      : {}),
  };
}

export async function requestRefund(
  input: {
    orderId: string;
    idempotencyKey: string;
    amountCents: number;
    reason: string;
    actor: Actor;
  },
  provider: PaymentProvider = new StripePaymentProvider(),
) {
  if (!(REFUND_ROLES as readonly string[]).includes(input.actor.role))
    throw new AuthorizationError("Refund authority required");
  validKey(input.idempotencyKey);
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    input.reason.trim().length < 3 ||
    input.reason.length > 500
  )
    throw new CommerceValidationError(
      "A positive refund amount and reason are required",
    );
  provider.preflight?.();
  const refund = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
    const existing = await tx.refund.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (
        existing.provider !== 'stripe' ||
        existing.orderId !== input.orderId ||
        existing.amountCents !== input.amountCents ||
        existing.reason !== input.reason ||
        existing.requestedById !== input.actor.userId
      )
        throw new CommerceConflictError("Refund request key belongs to a different tender or payload");
      return existing;
    }
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (
      !order ||
      !["COMPLETED", "CANCELLED", "REFUND_PENDING", "EXCEPTION"].includes(order.status)
    )
      throw new CommerceConflictError(
        "Only paid completed or cancelled orders can be refunded",
      );
    if (
      await tx.refund.count({ where: { orderId: order.id, status: "PENDING" } })
    )
      throw new CommerceConflictError(
        "Reconcile the pending refund before requesting another",
      );
    const payment = await tx.paymentAttempt.findFirst({
      where: { orderId: order.id, status: "SUCCEEDED" },
    });
    if (
      !payment?.providerRef ||
      !(await tx.payment.count({
        where: {
          orderId: order.id,
          reference: payment.providerRef,
          status: "completed",
        },
      }))
    )
      throw new CommerceConflictError("No captured provider receipt exists");
    const reserved = await tx.refund.aggregate({
      where: { orderId: order.id, provider: payment.provider, status: { in: ["PENDING", "SUCCEEDED"] } },
      _sum: { amountCents: true },
    });
    if (
      (reserved._sum.amountCents || 0) + input.amountCents >
      payment.amountCents
    )
      throw new CommerceValidationError(
        "Refund amount exceeds the refundable balance",
      );
    const created = await tx.refund.create({
      data: {
        orderId: order.id,
        provider: payment.provider,
        idempotencyKey: input.idempotencyKey,
        amountCents: input.amountCents,
        currency: payment.currency,
        reason: input.reason,
        requestedById: input.actor.userId,
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { status: "REFUND_PENDING", version: { increment: 1 } },
    });
    await appendPaymentEvent(tx, {
      orderId: order.id,
      type: "REFUND_REQUESTED",
      actor: input.actor,
      idempotencyKey: `${created.idempotencyKey}:requested`,
      payload: {
        refundId: created.id,
        amountCents: created.amountCents,
        reason: created.reason,
      },
      fromStatus: order.status,
      toStatus: "REFUND_PENDING",
    });
    return created;
  });
  if (refund.status !== "PENDING") return refund;
  if (refund.providerRef && provider.refundReceipt)
    return applyRefundReceipt(await provider.refundReceipt(refund.providerRef));
  if (refund.createdAt.getTime() < Date.now() - 23 * 3600000)
    throw new CommerceConflictError(
      "Retry window elapsed. Reconcile the provider refund before another request.",
    );
  const payment = await prisma.paymentAttempt.findFirstOrThrow({
    where: { orderId: refund.orderId, status: "SUCCEEDED" },
  });
  try {
    return await applyRefundReceipt(
      await provider.refund({
        idempotencyKey: refund.idempotencyKey,
        paymentReference: payment.providerRef!,
        money: { amountCents: refund.amountCents, currency: refund.currency },
        reason: refund.reason,
      }),
    );
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${refund.orderId} FOR UPDATE`;
      const current = await tx.refund.findUniqueOrThrow({
        where: { id: refund.id },
      });
      if (current.status !== "PENDING") return;
      await tx.order.update({
        where: { id: refund.orderId },
        data: {
          lastError:
            "Refund outcome unknown. Reconcile or retry the original refund request.",
        },
      });
      if (
        !(await tx.orderEvent.count({
          where: {
            orderId: refund.orderId,
            idempotencyKey: `${refund.idempotencyKey}:unknown`,
          },
        }))
      )
        await appendPaymentEvent(tx, {
          orderId: refund.orderId,
          type: "REFUND_OUTCOME_UNKNOWN",
          actor: input.actor,
          idempotencyKey: `${refund.idempotencyKey}:unknown`,
          payload: { refundId: refund.id },
        });
    });
    throw error;
  }
}
async function settleRefundedOrder(tx: Prisma.TransactionClient, orderId: string, failed = false) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const capturedCents = await capturedTenderCents(tx, orderId);
  const totals = await tx.refund.aggregate({ where: { orderId, status: 'SUCCEEDED' }, _sum: { amountCents: true } });
  const refundedCents = totals._sum.amountCents || 0;
  const paymentStatus = refundedPaymentStatus(capturedCents, refundedCents);
  const nextStatus: OrderStatus = paymentStatus === 'REFUNDED' ? 'REFUNDED' : order.cancelledAt ? 'CANCELLED' : 'COMPLETED';
  await tx.order.update({ where: { id: orderId }, data: { status: nextStatus, paymentStatus, version: { increment: 1 }, lastError: failed ? 'Provider rejected the refund' : null } });
  return { nextStatus, paymentStatus, full: paymentStatus === 'REFUNDED', capturedCents, refundedCents };
}

export async function refundCashTender(input: { orderId: string; idempotencyKey: string; amountCents: number; reason: string; cashReturnedConfirmed: boolean; actor: Actor }) {
  if (!(REFUND_ROLES as readonly string[]).includes(input.actor.role)) throw new AuthorizationError('Cash refund requires manager authority');
  validKey(input.idempotencyKey);
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.reason.trim().length < 3 || input.reason.length > 500 || !input.cashReturnedConfirmed)
    throw new CommerceValidationError('Confirm the cash returned and provide a positive amount and reason');
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
    const prior = await tx.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (prior) {
      if (prior.provider !== 'cash' || prior.orderId !== input.orderId || prior.amountCents !== input.amountCents || prior.reason !== input.reason || prior.requestedById !== input.actor.userId)
        throw new CommerceConflictError('Cash refund request key was used for different tender');
      return prior;
    }
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order || !['COMPLETED', 'CANCELLED', 'EXCEPTION'].includes(order.status))
      throw new CommerceConflictError('Cash refunds require a completed or cancelled order');
    if (await tx.paymentAttempt.count({ where: { orderId: input.orderId, status: { in: ['PENDING', 'REQUIRES_ACTION'] } } }) ||
        await tx.refund.count({ where: { orderId: input.orderId, status: 'PENDING' } }))
      throw new CommerceConflictError('Reconcile pending card activity before returning cash');
    const cash = await cashReceipt(tx, input.orderId);
    if (!cash) throw new CommerceConflictError('No verified split cash receipt exists');
    const reserved = await tx.refund.aggregate({ where: { orderId: input.orderId, provider: 'cash', status: { in: ['PENDING', 'SUCCEEDED'] } }, _sum: { amountCents: true } });
    if ((reserved._sum.amountCents || 0) + input.amountCents > receiptCents(cash.amount))
      throw new CommerceValidationError('Cash refund exceeds the collected cash portion');
    const refund = await tx.refund.create({ data: { orderId: input.orderId, provider: 'cash', providerRef: `cash-refund:${input.idempotencyKey}`, idempotencyKey: input.idempotencyKey, amountCents: input.amountCents, currency: order.currency, reason: input.reason, status: 'SUCCEEDED', requestedById: input.actor.userId, completedAt: new Date() } });
    const settled = await settleRefundedOrder(tx, input.orderId);
    await appendPaymentEvent(tx, { orderId: input.orderId, type: 'CASH_REFUND_SUCCEEDED', actor: input.actor, idempotencyKey: `cash-refund:${input.idempotencyKey}`, payload: { refundId: refund.id, amountCents: refund.amountCents, reason: refund.reason, cashReturnedConfirmed: true, totalRefundedCents: settled.refundedCents }, fromStatus: order.status, toStatus: settled.nextStatus });
    return refund;
  });
}
export async function applyRefundReceipt(receipt: RefundReceipt) {
  const found = await prisma.refund.findUnique({
    where: { idempotencyKey: receipt.refundKey },
  });
  if (!found)
    throw new UnrecognizedRefundError(
      "Refund was not created by this application; reconcile it manually",
    );
  if (found.provider !== 'stripe') throw new UnrecognizedRefundError('This is not a provider card refund');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${found.orderId} FOR UPDATE`;
    const row = await tx.refund.findUniqueOrThrow({ where: { id: found.id } }),
      payment = await tx.paymentAttempt.findFirst({
        where: {
          orderId: row.orderId,
          status: "SUCCEEDED",
          providerRef: receipt.paymentReference,
        },
      });
    if (
      !payment ||
      receipt.amountCents !== row.amountCents ||
      receipt.currency.toUpperCase() !== row.currency.toUpperCase() ||
      (row.providerRef && row.providerRef !== receipt.providerRef)
    )
      throw new CommerceConflictError(
        "Refund amount, currency or original receipt mismatch",
      );
    if (row.status === "SUCCEEDED") return row;
    if (row.status === "FAILED" && receipt.status !== "failed")
      throw new CommerceConflictError("A closed refund requires investigation");
    const status =
      receipt.status === "succeeded"
        ? "SUCCEEDED"
        : receipt.status === "failed"
          ? "FAILED"
          : "PENDING";
    const saved = await tx.refund.update({
      where: { id: row.id },
      data: {
        providerRef: receipt.providerRef,
        status,
        completedAt: status === "SUCCEEDED" ? new Date() : undefined,
      },
    });
    const order = await tx.order.findUniqueOrThrow({ where: { id: row.orderId } });
    const cardRefunds = await tx.refund.aggregate({ where: { orderId: row.orderId, provider: row.provider, status: 'SUCCEEDED' }, _sum: { amountCents: true } });
    if ((cardRefunds._sum.amountCents || 0) > payment.amountCents) throw new CommerceConflictError('Card refunds exceed captured card payment');
    const settled = status === 'PENDING' ? null : await settleRefundedOrder(tx, row.orderId, status === 'FAILED');
    const full = settled?.full || false;
    const nextStatus = settled?.nextStatus || order.status;
    const key = `${row.idempotencyKey}:${status}`;
    if (
      !(await tx.orderEvent.count({
        where: { orderId: row.orderId, idempotencyKey: key },
      }))
    )
      await appendPaymentEvent(tx, {
        orderId: row.orderId,
        type: `REFUND_${status}`,
        actor: { userId: "provider:stripe", role: "PROVIDER" },
        idempotencyKey: key,
        payload: {
          refundId: row.id,
          providerRef: receipt.providerRef,
          amountCents: row.amountCents,
          full,
        },
        fromStatus: order.status,
        toStatus: status !== "PENDING" ? nextStatus : order.status,
      });
    return saved;
  });
}
export async function reconcileRefund(
  input: { orderId: string; actor: Actor; reference: string },
  provider: PaymentProvider = new StripePaymentProvider(),
) {
  if (!(REFUND_ROLES as readonly string[]).includes(input.actor.role))
    throw new AuthorizationError("Refund authority required");
  if (!provider.refundReceipt)
    throw new CommerceConflictError("Provider refund retrieval is unavailable");
  const receipt = await provider.refundReceipt(input.reference),
    row = await prisma.refund.findUnique({
      where: { idempotencyKey: receipt.refundKey },
    });
  if (!row || row.orderId !== input.orderId)
    throw new CommerceConflictError("Refund belongs to another order");
  return applyRefundReceipt(receipt);
}

export async function applyPaymentWebhook(input: {
  eventId: string;
  eventType: "payment_intent.succeeded" | "payment_intent.payment_failed";
  paymentReference: string;
  orderId: string;
  attemptKey?: string;
  currency?: string;
  amountReceivedCents?: number;
  paymentMethod?: string;
  failureCode?: string;
  failureMessage?: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: input.orderId } });
      if (!order)
        throw new CommerceValidationError(
          "Webhook references an unknown order",
        );
      const attempt = await tx.paymentAttempt.findFirst({
        where: {
          orderId: order.id,
          ...(input.attemptKey
            ? { idempotencyKey: input.attemptKey }
            : { providerRef: input.paymentReference }),
        },
        orderBy: { createdAt: "desc" },
      });
      if (!attempt)
        throw new CommerceValidationError(
          "Webhook does not match a payment attempt",
        );
      if (
        input.currency &&
        input.currency.toUpperCase() !== attempt.currency.toUpperCase()
      )
        throw new CommerceConflictError(
          "Payment currency does not match the attempt",
        );
      if (
        attempt.status === "SUCCEEDED" &&
        attempt.providerRef !== input.paymentReference
      )
        throw new CommerceConflictError("Captured payment reference changed");
      const priorEvent = await tx.orderEvent.findFirst({
        where: { orderId: order.id, idempotencyKey: `stripe:${input.eventId}` },
      });
      if (priorEvent)
        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: { paymentAttempts: true, events: true },
        });
      // Success is terminal for a payment attempt: retries and delayed failures must
      // not undo fulfillment, cancellation or subsequent refunds.
      if (attempt.status === "SUCCEEDED")
        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: { paymentAttempts: true, events: true },
        });
      const webhookActor: Actor = {
        userId: "provider:stripe",
        role: "PROVIDER",
      };
      if (input.eventType === "payment_intent.succeeded") {
        const received = input.amountReceivedCents ?? 0;
        if (!Number.isSafeInteger(received) || received !== attempt.amountCents)
          throw new CommerceConflictError(
            "Captured amount does not match the order payment amount",
          );
        const cash = await cashReceipt(tx, order.id);
        const cashCents = cash ? receiptCents(cash.amount) : 0;
        const totalCents = await reviewedTotalCents(tx, order);
        if (await capturedTenderCents(tx, order.id) !== cashCents || splitTenderBalance(totalCents, cashCents, received) !== 0)
          throw new CommerceConflictError('Cash and card receipts do not match the reviewed order total');
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            providerRef: input.paymentReference,
            status: "SUCCEEDED",
            failureCode: null,
            failureMessage: null,
          },
        });
        await tx.payment.upsert({
          where: { reference: input.paymentReference },
          create: {
            orderId: order.id,
            amount: received / 100,
            method: input.paymentMethod ?? "card",
            reference: input.paymentReference,
            status: "completed",
          },
          update: {},
        });
        const resumedStatus =
          order.cancelledAt || ['CANCELLED', 'REFUNDED', 'REFUND_PENDING'].includes(order.status)
            ? "EXCEPTION"
            : attempt.resumeStatus === "CONFIRMED"
              ? "PREPARING"
              : (attempt.resumeStatus ?? "CONFIRMED");
        const refunded = await tx.refund.aggregate({ where: { orderId: order.id, status: 'SUCCEEDED' }, _sum: { amountCents: true } });
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: refunded._sum.amountCents ? 'PARTIALLY_REFUNDED' : 'PAID',
            paymentMethod: cash ? 'cash+card' : (input.paymentMethod ?? 'card'),
            status: resumedStatus,
            version: { increment: 1 },
            lastError:
              resumedStatus === 'EXCEPTION'
                ? "Payment captured after cancellation; refund reconciliation required"
                : null,
          },
        });
        await appendPaymentEvent(tx, {
          orderId: order.id,
          type: "PAYMENT_CAPTURED",
          actor: webhookActor,
          idempotencyKey: `stripe:${input.eventId}`,
          payload: {
            paymentReference: input.paymentReference,
            amountCents: received,
          },
          fromStatus: order.status,
          toStatus: resumedStatus,
        });
      } else {
        const capturedAlready =
          ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(
            order.paymentStatus,
          ) ||
          Boolean(
            await tx.payment.findFirst({
              where: { orderId: order.id, status: "completed", NOT: { method: { equals: 'cash', mode: 'insensitive' } } },
              select: { id: true },
            }),
          );
        const terminalStatus = [
          "REFUNDED",
          "REFUND_PENDING",
          "COMPLETED",
        ].includes(order.status);
        if (capturedAlready || terminalStatus) {
          // A late failure for a superseded attempt must not reopen an order
          // that is already paid, refunded or closed. Close the attempt so it
          // cannot be resumed for another charge, and keep the evidence.
          if (["PENDING", "REQUIRES_ACTION"].includes(attempt.status)) {
            await tx.paymentAttempt.update({
              where: { id: attempt.id },
              data: {
                status: "FAILED",
                failureCode: input.failureCode,
                failureMessage: input.failureMessage,
              },
            });
          }
          await appendPaymentEvent(tx, {
            orderId: order.id,
            type: "PAYMENT_FAILED",
            actor: webhookActor,
            idempotencyKey: `stripe:${input.eventId}`,
            payload: {
              paymentReference: input.paymentReference,
              code: input.failureCode,
              message: input.failureMessage,
              ignored: "order already captured; no order state change",
            },
            fromStatus: order.status,
            toStatus: order.status,
          });
        } else {
          await tx.paymentAttempt.update({
            where: { id: attempt.id },
            data: {
              status: "REQUIRES_ACTION",
              failureCode: input.failureCode,
              failureMessage: input.failureMessage,
            },
          });
          await tx.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: "AUTHORIZING",
              status:
                order.status === "CANCELLED" ? "CANCELLED" : "PAYMENT_PENDING",
              lastError: input.failureMessage ?? "Payment failed",
              version: { increment: 1 },
            },
          });
          await appendPaymentEvent(tx, {
            orderId: order.id,
            type: "PAYMENT_FAILED",
            actor: webhookActor,
            idempotencyKey: `stripe:${input.eventId}`,
            payload: {
              paymentReference: input.paymentReference,
              code: input.failureCode,
              message: input.failureMessage,
            },
            fromStatus: order.status,
            toStatus:
              order.status === "CANCELLED" ? "CANCELLED" : "PAYMENT_PENDING",
          });
        }
      }
      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { paymentAttempts: true, events: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
