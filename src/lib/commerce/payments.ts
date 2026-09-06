import { Prisma } from "@prisma/client";
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
  await tx.orderEvent.create({
    data: {
      ...fields,
      payload: toJson(input.payload),
      hash: auditHash(fields),
    },
  });
}

function validKey(key: string) {
  if (!/^[\w][\w.:-]{7,127}$/.test(key))
    throw new CommerceValidationError("Use an 8–128 character idempotency key");
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
      }),
      amountCents = Math.round(locked.total * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
      throw new CommerceValidationError(
        "A positive reviewed order total is required",
      );
    const pricing = await tx.orderEvent.findFirst({
        where: { orderId: order.id, type: "ORDER_CREATED" },
      }),
      snapshot = pricing?.payload as
        { totalCents?: number; taxReference?: string } | undefined;
    if (snapshot?.totalCents !== amountCents || !snapshot.taxReference)
      throw new CommerceConflictError(
        "This legacy order has no matching server pricing and tax receipt. Reconcile it before taking payment.",
      );

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
      if (order.status === "PAYMENT_PENDING")
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: attempt.resumeStatus || "CONFIRMED",
            paymentStatus: "UNPAID",
            version: { increment: 1 },
          },
        });
      await appendPaymentEvent(tx, {
        orderId: input.orderId,
        type: "PAYMENT_CHECKOUT_EXPIRED",
        actor: input.actor,
        idempotencyKey: `${attempt.idempotencyKey}:expired`,
        payload: { reference: receipt.providerRef },
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
        existing.orderId !== input.orderId ||
        existing.amountCents !== input.amountCents ||
        existing.reason !== input.reason ||
        existing.requestedById !== input.actor.userId
      )
        throw new CommerceConflictError("Refund idempotency payload changed");
      return existing;
    }
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (
      !order ||
      !["COMPLETED", "CANCELLED", "REFUND_PENDING"].includes(order.status)
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
      where: { orderId: order.id, status: { in: ["PENDING", "SUCCEEDED"] } },
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
export async function applyRefundReceipt(receipt: RefundReceipt) {
  const found = await prisma.refund.findUnique({
    where: { idempotencyKey: receipt.refundKey },
  });
  if (!found)
    throw new CommerceValidationError("Refund receipt is not recognized");
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
    const order = await tx.order.findUniqueOrThrow({
      where: { id: row.orderId },
    });
    const total = await tx.refund.aggregate({
        where: { orderId: row.orderId, status: "SUCCEEDED" },
        _sum: { amountCents: true },
      }),
      full = (total._sum.amountCents || 0) === payment.amountCents;
    if ((total._sum.amountCents || 0) > payment.amountCents)
      throw new CommerceConflictError("Refunds exceed captured payments");
    if (status !== "PENDING")
      await tx.order.update({
        where: { id: row.orderId },
        data: {
          status: full
            ? "REFUNDED"
            : order.cancelledAt
              ? "CANCELLED"
              : "COMPLETED",
          paymentStatus: full
            ? "REFUNDED"
            : total._sum.amountCents
              ? "PARTIALLY_REFUNDED"
              : "PAID",
          version: { increment: 1 },
          lastError:
            status === "FAILED" ? "Provider rejected the refund" : null,
        },
      });
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
          order.status === "CANCELLED"
            ? "EXCEPTION"
            : attempt.resumeStatus === "CONFIRMED"
              ? "PREPARING"
              : (attempt.resumeStatus ?? "CONFIRMED");
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: "PAID",
            paymentMethod: input.paymentMethod ?? "card",
            status: resumedStatus,
            version: { increment: 1 },
            lastError:
              order.status === "CANCELLED"
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
        });
      }
      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { paymentAttempts: true, events: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
