import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AuthorizationError, REFUND_ROLES, requireActor } from "@/lib/commerce/authz";

export async function GET() {
  try {
    await requireActor(REFUND_ROLES);
    const staleBefore = new Date(Date.now() - 15 * 60_000);
    const [stalePayments, failedWebhooks, deadLetters, expiredReservations, paidWithoutCapture] = await Promise.all([
      prisma.order.findMany({ where: { status: "PAYMENT_PENDING", updatedAt: { lt: staleBefore } }, select: { id: true, orderNumber: true, updatedAt: true } }),
      prisma.webhookEvent.findMany({ where: { status: "FAILED" }, orderBy: { receivedAt: "asc" }, take: 100 }),
      prisma.outboxEvent.findMany({ where: { status: "DEAD_LETTER" }, orderBy: { createdAt: "asc" }, take: 100 }),
      prisma.inventoryReservation.findMany({ where: { status: "RESERVED", expiresAt: { lt: new Date() } }, select: { id: true, orderId: true, expiresAt: true } }),
      prisma.order.findMany({ where: { paymentStatus: "PAID", paymentAttempts: { none: { status: "SUCCEEDED" } } }, select: { id: true, orderNumber: true } }),
    ]);
    return NextResponse.json({ generatedAt: new Date(), stalePayments, failedWebhooks, deadLetters, expiredReservations, paidWithoutCapture });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reconciliation failed" }, { status });
  }
}
