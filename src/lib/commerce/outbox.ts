import type { OutboxEvent } from "@prisma/client";
import prisma from "@/lib/prisma";
import { HttpFulfillmentProvider, type FulfillmentProvider } from "./providers";

export async function processNextOutboxEvent(provider: FulfillmentProvider = new HttpFulfillmentProvider()) {
  const lease = await prisma.$queryRaw<OutboxEvent[]>`
    UPDATE "OutboxEvent"
    SET status = 'PROCESSING', "leasedUntil" = NOW() + INTERVAL '2 minutes', attempts = attempts + 1
    WHERE id = (
      SELECT id FROM "OutboxEvent"
      WHERE (status = 'PENDING' OR (status = 'PROCESSING' AND "leasedUntil" < NOW()))
        AND "availableAt" <= NOW()
      ORDER BY "availableAt", "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;
  const event = lease[0];
  if (!event) return null;
  try {
    if (event.topic !== "delivery.schedule" || !event.orderId) throw new Error(`Unsupported outbox topic ${event.topic}`);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: event.orderId }, include: { delivery: true } });
    if (!order.delivery) throw new Error("Delivery order has no address");
    const result = await provider.schedule({
      idempotencyKey: event.idempotencyKey,
      orderId: order.id,
      orderNumber: order.orderNumber,
      address: {
        address: order.delivery.address,
        apartmentUnit: order.delivery.apartmentUnit ?? undefined,
        city: order.delivery.city,
        state: order.delivery.state,
        zipCode: order.delivery.zipCode,
      },
    });
    await prisma.$transaction([
      prisma.deliveryInfo.update({ where: { orderId: order.id }, data: { platform: "configured-fulfillment-provider", platformOrderId: result.providerRef } }),
      prisma.outboxEvent.update({ where: { id: event.id }, data: { status: "SUCCEEDED", processedAt: new Date(), leasedUntil: null, lastError: null } }),
    ]);
    return { id: event.id, status: "SUCCEEDED" as const };
  } catch (error) {
    const dead = event.attempts >= 8;
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: dead ? "DEAD_LETTER" : "PENDING",
        leasedUntil: null,
        availableAt: new Date(Date.now() + Math.min(300_000, 1_000 * 2 ** event.attempts)),
        lastError: error instanceof Error ? error.message : "Unknown provider error",
      },
    });
    return { id: event.id, status: dead ? "DEAD_LETTER" as const : "PENDING" as const };
  }
}
