import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

/**
 * POST /api/payments/webhook
 * Stripe sends signed events here. We verify the signature then:
 *   - payment_intent.succeeded  → mark order PAID
 *   - payment_intent.payment_failed → log failure (order stays UNPAID)
 *
 * Next.js App Router requires the raw body, so we read it via request.arrayBuffer().
 * Add STRIPE_WEBHOOK_SECRET to your .env (from `stripe listen` or the dashboard).
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { error: "Payments are not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable the webhook." },
      { status: 503 }
    );
  }

  const rawBody = await request.arrayBuffer();
  const buf = Buffer.from(rawBody);
  const sig = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const orderId = intent.metadata?.orderId;

        if (orderId) {
          await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: "PAID",
              paymentMethod: intent.payment_method_types?.[0] ?? "card",
            },
          });

          // Also record a Payment row for the ledger
          await prisma.payment.create({
            data: {
              orderId,
              amount: intent.amount_received / 100,
              method: intent.payment_method_types?.[0] ?? "card",
              reference: intent.id,
              status: "completed",
            },
          });

          console.log(`Order ${orderId} marked as PAID via Stripe intent ${intent.id}`);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const orderId = intent.metadata?.orderId;
        if (orderId) {
          console.warn(
            `Payment failed for order ${orderId}: ${intent.last_payment_error?.message}`
          );
          // Leave order UNPAID; front-end can retry
        }
        break;
      }

      default:
        // Ignore other event types
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Disable body parsing — Stripe needs the raw bytes for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};
