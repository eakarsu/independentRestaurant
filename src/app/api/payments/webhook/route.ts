import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { sha256 } from "@/lib/commerce/crypto";
import {
  applyPaymentWebhook,
  applyRefundReceipt,
} from "@/lib/commerce/payments";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret)
    return NextResponse.json(
      { error: "Stripe webhook is not configured" },
      { status: 503 },
    );
  const reader = request.body?.getReader();
  if (!reader)
    return NextResponse.json({ error: "Body required" }, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 100000) {
      await reader.cancel();
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    chunks.push(value);
  }
  const rawBody = Buffer.concat(chunks);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      request.headers.get("stripe-signature") ?? "",
      webhookSecret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: "stripe",
        eventId: event.id,
        eventType: event.type,
        payloadHash: sha256(rawBody),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const previous = await prisma.webhookEvent.findUniqueOrThrow({
        where: { provider_eventId: { provider: "stripe", eventId: event.id } },
      });
      if (previous.payloadHash !== sha256(rawBody))
        return NextResponse.json(
          { error: "Event payload changed" },
          { status: 409 },
        );
      if (["PROCESSED", "IGNORED"].includes(previous.status))
        return NextResponse.json({ received: true, duplicate: true });
    } else throw error;
  }
  try {
    if (
      event.type === "payment_intent.succeeded" ||
      event.type === "payment_intent.payment_failed"
    ) {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (!intent.metadata.orderId)
        throw new Error("Payment intent is missing orderId metadata");
      await applyPaymentWebhook({
        eventId: event.id,
        eventType: event.type,
        paymentReference: intent.id,
        orderId: intent.metadata.orderId,
        amountReceivedCents: intent.amount_received,
        attemptKey: intent.metadata.attemptKey,
        currency: intent.currency,
        paymentMethod: intent.payment_method_types[0],
        failureCode: intent.last_payment_error?.code,
        failureMessage: intent.last_payment_error?.message,
      });
      await prisma.webhookEvent.update({
        where: { provider_eventId: { provider: "stripe", eventId: event.id } },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
    } else if (
      ["refund.created", "refund.updated", "refund.failed"].includes(event.type)
    ) {
      const refund = event.data.object as Stripe.Refund;
      await applyRefundReceipt({
        providerRef: refund.id,
        refundKey: refund.metadata?.refundKey || "",
        amountCents: refund.amount,
        currency: refund.currency,
        paymentReference:
          typeof refund.payment_intent === "string"
            ? refund.payment_intent
            : refund.payment_intent?.id || "",
        status:
          refund.status === "succeeded"
            ? "succeeded"
            : refund.status === "failed" || refund.status === "canceled"
              ? "failed"
              : "pending",
      });
      await prisma.webhookEvent.update({
        where: { provider_eventId: { provider: "stripe", eventId: event.id } },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          attempts: { increment: 1 },
          error: null,
        },
      });
    } else {
      await prisma.webhookEvent.update({
        where: { provider_eventId: { provider: "stripe", eventId: event.id } },
        data: {
          status: "IGNORED",
          processedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { provider_eventId: { provider: "stripe", eventId: event.id } },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
