import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

/**
 * POST /api/orders/:id/pay
 * Creates a Stripe PaymentIntent for the order total.
 * Returns { clientSecret } for the frontend to confirm with Stripe.js
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Payments are not configured. Set STRIPE_SECRET_KEY to enable card payments." },
      { status: 503 }
    );
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { customer: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.paymentStatus === "PAID") {
      return NextResponse.json({ error: "Order already paid" }, { status: 400 });
    }

    // Stripe amounts are in the smallest currency unit (cents for USD)
    const amountCents = Math.round(order.total * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        restaurantName: "Independent Restaurant",
      },
      description: `Order #${order.orderNumber}`,
      receipt_email: order.customer?.email ?? undefined,
    });

    // Store the paymentIntentId on the order so the webhook can match it
    await prisma.order.update({
      where: { id: order.id },
      data: {
        // We store the intent ID in the paymentMethod field temporarily
        // until the webhook confirms payment. A production system would
        // use a separate PaymentIntent model.
        paymentMethod: `pi:${paymentIntent.id}`,
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: order.total,
      currency: "usd",
    });
  } catch (error) {
    console.error("Stripe PaymentIntent error:", error);
    return NextResponse.json(
      { error: "Failed to create payment intent" },
      { status: 500 }
    );
  }
}
