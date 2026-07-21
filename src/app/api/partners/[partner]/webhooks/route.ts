import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sha256, verifyHmacSignature } from "@/lib/commerce/crypto";
import { transitionOrder } from "@/lib/commerce/orders";
import { ORDER_STATES } from "@/lib/commerce/state-machine";

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.literal("order.status_changed"),
  order: z.object({ providerOrderId: z.string().min(1), status: z.enum(ORDER_STATES), reason: z.string().max(1000).optional() }),
});

export async function POST(request: NextRequest, props: { params: Promise<{ partner: string }> }) {
  const params = await props.params;
  const provider = params.partner.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!provider || provider !== params.partner.toLowerCase()) return NextResponse.json({ error: "Invalid partner" }, { status: 400 });
  const secretName = `PARTNER_WEBHOOK_SECRET_${provider.toUpperCase().replace(/-/g, "_")}`;
  const secret = process.env[secretName];
  if (!secret) return NextResponse.json({ error: "Partner webhook is not configured" }, { status: 503 });
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyHmacSignature(rawBody, request.headers.get("x-webhook-signature") ?? "", secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(JSON.parse(rawBody.toString("utf8")));
  } catch {
    return NextResponse.json({ error: "Invalid partner event" }, { status: 400 });
  }
  try {
    await prisma.webhookEvent.create({ data: { provider, eventId: event.id, eventType: event.type, payloadHash: sha256(rawBody) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ received: true, duplicate: true });
    throw error;
  }
  try {
    const order = await prisma.order.findFirst({ where: { providerOrderId: event.order.providerOrderId } });
    if (!order) throw new Error("Partner order is not mapped to a local order");
    await transitionOrder({
      orderId: order.id,
      toStatus: event.order.status,
      reason: event.order.reason,
      idempotencyKey: `${provider}:${event.id}`,
      actor: { userId: `provider:${provider}`, role: "PROVIDER" },
    });
    await prisma.webhookEvent.update({ where: { provider_eventId: { provider, eventId: event.id } }, data: { status: "PROCESSED", processedAt: new Date(), attempts: { increment: 1 } } });
    return NextResponse.json({ received: true });
  } catch (error) {
    await prisma.webhookEvent.update({ where: { provider_eventId: { provider, eventId: event.id } }, data: { status: "FAILED", error: error instanceof Error ? error.message : "Unknown error", attempts: { increment: 1 } } });
    return NextResponse.json({ error: "Partner event processing failed" }, { status: 409 });
  }
}
