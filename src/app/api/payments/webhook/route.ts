import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { sha256 } from "@/lib/commerce/crypto";
import { applyPaymentWebhook } from "@/lib/commerce/payments";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 503 });
  const rawBody = Buffer.from(await request.arrayBuffer());
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, request.headers.get("stripe-signature") ?? "", webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    await prisma.webhookEvent.create({ data: { provider: "stripe", eventId: event.id, eventType: event.type, payloadHash: sha256(rawBody) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw error;
  }
  try {
    if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (!intent.metadata.orderId) throw new Error("Payment intent is missing orderId metadata");
      await applyPaymentWebhook({
        eventId: event.id,
        eventType: event.type,
        paymentReference: intent.id,
        orderId: intent.metadata.orderId,
        amountReceivedCents: intent.amount_received,
        paymentMethod: intent.payment_method_types[0],
        failureCode: intent.last_payment_error?.code,
        failureMessage: intent.last_payment_error?.message,
      });
      await prisma.webhookEvent.update({ where: { provider_eventId: { provider: "stripe", eventId: event.id } }, data: { status: "PROCESSED", processedAt: new Date(), attempts: { increment: 1 } } });
    } else {
      await prisma.webhookEvent.update({ where: { provider_eventId: { provider: "stripe", eventId: event.id } }, data: { status: "IGNORED", processedAt: new Date(), attempts: { increment: 1 } } });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    await prisma.webhookEvent.update({ where: { provider_eventId: { provider: "stripe", eventId: event.id } }, data: { status: "FAILED", attempts: { increment: 1 }, error: error instanceof Error ? error.message : "Unknown error" } });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
