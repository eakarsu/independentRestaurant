import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { Actor } from "./authz";
import { auditHash } from "./crypto";
import { CommerceConflictError, CommerceValidationError } from "./orders";
import { StripePaymentProvider, type PaymentProvider } from "./providers";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function appendPaymentEvent(
  tx: Prisma.TransactionClient,
  input: { orderId: string; type: string; actor: Actor; idempotencyKey: string; payload: unknown },
) {
  const prior = await tx.orderEvent.findFirst({ where: { orderId: input.orderId }, orderBy: { sequence: "desc" } });
  const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId } });
  const sequence = (prior?.sequence ?? 0) + 1;
  const actorUserId = input.actor.role === "PROVIDER" ? null : input.actor.userId;
  const fields = {
    orderId: input.orderId,
    sequence,
    type: input.type,
    fromStatus: order.status,
    toStatus: order.status,
    actorUserId,
    actorRole: input.actor.role,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
    previousHash: prior?.hash ?? null,
  };
  await tx.orderEvent.create({ data: { ...fields, payload: toJson(input.payload), hash: auditHash(fields) } });
}

export async function beginPayment(
  input: { orderId: string; idempotencyKey: string; actor: Actor },
  provider: PaymentProvider = new StripePaymentProvider(),
) {
  const existing = await prisma.paymentAttempt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, include: { customer: true } });
  if (!order) throw new CommerceValidationError("Order not found");
  if (input.actor.role === "CUSTOMER" && order.customer?.userId !== input.actor.userId) {
    throw new CommerceValidationError("A customer cannot pay another customer's order");
  }
  if (!["CONFIRMED", "PAYMENT_FAILED", "READY", "SERVED", "COMPLETED"].includes(order.status)) throw new CommerceConflictError(`Payment cannot start while order is ${order.status}`);
  const amountCents = Math.round(order.total * 100);
  const priorAttempt = order.status === "PAYMENT_FAILED"
    ? await prisma.paymentAttempt.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } })
    : null;
  const resumeStatus = priorAttempt?.resumeStatus ?? order.status;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
    const locked = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    if (!["CONFIRMED", "PAYMENT_FAILED", "READY", "SERVED", "COMPLETED"].includes(locked.status)) {
      throw new CommerceConflictError(`Payment cannot start while order is ${locked.status}`);
    }
    await tx.paymentAttempt.create({ data: { orderId: order.id, provider: "stripe", idempotencyKey: input.idempotencyKey, amountCents, currency: order.currency, resumeStatus } });
    await tx.order.update({ where: { id: order.id }, data: { status: "PAYMENT_PENDING", paymentStatus: "AUTHORIZING", version: { increment: 1 } } });
    await appendPaymentEvent(tx, { orderId: order.id, type: "PAYMENT_STARTED", actor: input.actor, idempotencyKey: `${input.idempotencyKey}:started`, payload: { amountCents } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  try {
    const result = await provider.createIntent({
      idempotencyKey: input.idempotencyKey,
      orderId: order.id,
      orderNumber: order.orderNumber,
      money: { amountCents, currency: order.currency },
      receiptEmail: order.customer?.email ?? undefined,
    });
    return prisma.paymentAttempt.update({
      where: { idempotencyKey: input.idempotencyKey },
      data: { providerRef: result.providerRef, status: result.status === "succeeded" ? "SUCCEEDED" : "REQUIRES_ACTION" },
    }).then((attempt) => ({ ...attempt, clientSecret: result.clientSecret, redirectUrl: result.redirectUrl }));
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
      const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      await tx.paymentAttempt.update({ where: { idempotencyKey: input.idempotencyKey }, data: { status: "FAILED", failureMessage: error instanceof Error ? error.message : "Provider error" } });
      await tx.order.update({ where: { id: order.id }, data: { status: current.status === "CANCELLED" ? "CANCELLED" : "PAYMENT_FAILED", paymentStatus: "FAILED", lastError: error instanceof Error ? error.message : "Provider error" } });
      await appendPaymentEvent(tx, { orderId: order.id, type: "PAYMENT_FAILED", actor: input.actor, idempotencyKey: `${input.idempotencyKey}:failed`, payload: { message: error instanceof Error ? error.message : "Provider error" } });
    });
    throw error;
  }
}

export async function requestRefund(
  input: { orderId: string; idempotencyKey: string; amountCents: number; reason: string; actor: Actor },
  provider: PaymentProvider = new StripePaymentProvider(),
) {
  const existing = await prisma.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { paymentAttempts: { where: { status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, take: 1 }, refunds: { where: { status: "SUCCEEDED" } } },
  });
  if (!order || !["COMPLETED", "CANCELLED", "REFUND_PENDING"].includes(order.status)) throw new CommerceConflictError("Only paid completed or cancelled orders can be refunded");
  const payment = order.paymentAttempts[0];
  if (!payment?.providerRef) throw new CommerceConflictError("No captured provider payment exists");
  const refundable = Math.round(order.total * 100) - order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > refundable) throw new CommerceValidationError("Refund amount exceeds the refundable balance");

  const refund = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
    const locked = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    if (!["COMPLETED", "CANCELLED", "REFUND_PENDING"].includes(locked.status)) throw new CommerceConflictError("Order is no longer refundable");
    const reservedRefunds = await tx.refund.aggregate({ where: { orderId: order.id, status: { in: ["PENDING", "SUCCEEDED"] } }, _sum: { amountCents: true } });
    if ((reservedRefunds._sum.amountCents ?? 0) + input.amountCents > Math.round(locked.total * 100)) {
      throw new CommerceValidationError("Concurrent refunds exceed the refundable balance");
    }
    const created = await tx.refund.create({ data: { orderId: order.id, provider: payment.provider, idempotencyKey: input.idempotencyKey, amountCents: input.amountCents, currency: order.currency, reason: input.reason, requestedById: input.actor.userId } });
    await tx.order.update({ where: { id: order.id }, data: { status: "REFUND_PENDING", version: { increment: 1 } } });
    await appendPaymentEvent(tx, { orderId: order.id, type: "REFUND_REQUESTED", actor: input.actor, idempotencyKey: `${input.idempotencyKey}:requested`, payload: { refundId: created.id, amountCents: input.amountCents, reason: input.reason } });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  try {
    const result = await provider.refund({ idempotencyKey: input.idempotencyKey, paymentReference: payment.providerRef, money: { amountCents: input.amountCents, currency: order.currency }, reason: input.reason });
    const updated = await prisma.refund.update({ where: { id: refund.id }, data: { providerRef: result.providerRef, status: result.status === "succeeded" ? "SUCCEEDED" : result.status === "failed" ? "FAILED" : "PENDING", completedAt: result.status === "succeeded" ? new Date() : undefined } });
    if (result.status === "succeeded") {
      const allRefunds = await prisma.refund.aggregate({ where: { orderId: order.id, status: "SUCCEEDED" }, _sum: { amountCents: true } });
      const full = (allRefunds._sum.amountCents ?? 0) >= Math.round(order.total * 100);
      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { status: full ? "REFUNDED" : "COMPLETED", paymentStatus: full ? "REFUNDED" : "PARTIALLY_REFUNDED", version: { increment: 1 } } });
        await appendPaymentEvent(tx, { orderId: order.id, type: "REFUND_SUCCEEDED", actor: { userId: "provider:stripe", role: "PROVIDER" }, idempotencyKey: `${input.idempotencyKey}:succeeded`, payload: { refundId: refund.id, providerRef: result.providerRef, amountCents: input.amountCents, full } });
      });
    } else if (result.status === "failed") {
      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { status: order.cancelledAt ? "CANCELLED" : "COMPLETED", lastError: "Refund was rejected by the payment provider", version: { increment: 1 } } });
        await appendPaymentEvent(tx, { orderId: order.id, type: "REFUND_FAILED", actor: { userId: "provider:stripe", role: "PROVIDER" }, idempotencyKey: `${input.idempotencyKey}:failed`, payload: { refundId: refund.id, providerRef: result.providerRef } });
      });
    }
    return updated;
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.refund.update({ where: { id: refund.id }, data: { status: "FAILED" } });
      await tx.order.update({ where: { id: order.id }, data: { status: order.cancelledAt ? "CANCELLED" : "COMPLETED", lastError: error instanceof Error ? error.message : "Refund provider error", version: { increment: 1 } } });
      await appendPaymentEvent(tx, { orderId: order.id, type: "REFUND_FAILED", actor: { userId: "provider:stripe", role: "PROVIDER" }, idempotencyKey: `${input.idempotencyKey}:failed`, payload: { refundId: refund.id, message: error instanceof Error ? error.message : "Refund provider error" } });
    });
    throw error;
  }
}

export async function applyPaymentWebhook(input: {
  eventId: string;
  eventType: "payment_intent.succeeded" | "payment_intent.payment_failed";
  paymentReference: string;
  orderId: string;
  amountReceivedCents?: number;
  paymentMethod?: string;
  failureCode?: string;
  failureMessage?: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new CommerceValidationError("Webhook references an unknown order");
    const attempt = await tx.paymentAttempt.findFirst({
      where: { OR: [{ providerRef: input.paymentReference }, { orderId: order.id, status: { in: ["PENDING", "REQUIRES_ACTION"] } }] },
      orderBy: { createdAt: "desc" },
    });
    if (!attempt) throw new CommerceValidationError("Webhook does not match a payment attempt");
    const webhookActor: Actor = { userId: "provider:stripe", role: "PROVIDER" };
    if (input.eventType === "payment_intent.succeeded") {
      const received = input.amountReceivedCents ?? 0;
      if (received < attempt.amountCents) throw new CommerceConflictError("Captured amount is below the order payment amount");
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { providerRef: input.paymentReference, status: "SUCCEEDED", failureCode: null, failureMessage: null } });
      await tx.payment.upsert({
        where: { reference: input.paymentReference },
        create: { orderId: order.id, amount: received / 100, method: input.paymentMethod ?? "card", reference: input.paymentReference, status: "completed" },
        update: {},
      });
      const resumedStatus = order.status === "CANCELLED" ? "EXCEPTION" : attempt.resumeStatus === "CONFIRMED" ? "PREPARING" : attempt.resumeStatus ?? "CONFIRMED";
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", paymentMethod: input.paymentMethod ?? "card", status: resumedStatus, version: { increment: 1 }, lastError: order.status === "CANCELLED" ? "Payment captured after cancellation; refund reconciliation required" : null },
      });
      await appendPaymentEvent(tx, { orderId: order.id, type: "PAYMENT_CAPTURED", actor: webhookActor, idempotencyKey: `stripe:${input.eventId}`, payload: { paymentReference: input.paymentReference, amountCents: received } });
    } else {
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { providerRef: input.paymentReference, status: "FAILED", failureCode: input.failureCode, failureMessage: input.failureMessage } });
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED", status: "PAYMENT_FAILED", lastError: input.failureMessage ?? "Payment failed", version: { increment: 1 } } });
      await appendPaymentEvent(tx, { orderId: order.id, type: "PAYMENT_FAILED", actor: webhookActor, idempotencyKey: `stripe:${input.eventId}`, payload: { paymentReference: input.paymentReference, code: input.failureCode, message: input.failureMessage } });
    }
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { paymentAttempts: true, events: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
