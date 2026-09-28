import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

class InventoryConflictError extends Error {
  status = 409;
}

/** How long a held reservation survives before it can be auto-released. */
export const RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface TransactionalInventoryProvider {
  reserve(tx: Prisma.TransactionClient, input: { orderId: string; idempotencyKey: string; lines: Map<string, number> }): Promise<{ reservationId: string }>;
  release(tx: Prisma.TransactionClient, input: { orderId: string }): Promise<void>;
  commit(tx: Prisma.TransactionClient, input: { orderId: string }): Promise<void>;
}

export class PostgresInventoryProvider implements TransactionalInventoryProvider {
  async reserve(tx: Prisma.TransactionClient, input: { orderId: string; idempotencyKey: string; lines: Map<string, number> }) {
    const reservation = await tx.inventoryReservation.create({
      data: {
        orderId: input.orderId,
        provider: "internal-postgres",
        providerRef: input.orderId,
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      },
    });
    for (const [ingredientId, quantity] of input.lines) {
      const updated = await tx.ingredient.updateMany({
        where: { id: ingredientId, currentStock: { gte: quantity } },
        data: { currentStock: { decrement: quantity } },
      });
      if (updated.count !== 1) throw new InventoryConflictError(`Insufficient inventory for ingredient ${ingredientId}`);
      await tx.inventoryReservationLine.create({ data: { reservationId: reservation.id, ingredientId, quantity } });
      await tx.stockMovement.create({ data: { ingredientId, type: "USED", quantity: -quantity, reason: "Order inventory reservation", reference: input.orderId } });
    }
    return { reservationId: reservation.id };
  }

  async release(tx: Prisma.TransactionClient, input: { orderId: string }) {
    const reservations = await tx.inventoryReservation.findMany({ where: { orderId: input.orderId, status: "RESERVED" }, include: { lines: true } });
    for (const reservation of reservations) {
      for (const line of reservation.lines) {
        await tx.ingredient.update({ where: { id: line.ingredientId }, data: { currentStock: { increment: line.quantity } } });
        await tx.stockMovement.create({ data: { ingredientId: line.ingredientId, type: "RETURNED", quantity: line.quantity, reason: "Order cancellation release", reference: input.orderId } });
      }
      await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED", releasedAt: new Date(), expiresAt: null } });
    }
  }

  async commit(tx: Prisma.TransactionClient, input: { orderId: string }) {
    await tx.inventoryReservation.updateMany({ where: { orderId: input.orderId, status: "RESERVED" }, data: { status: "COMMITTED", committedAt: new Date() } });
  }
}

/**
 * Return reserved stock for orders that never moved past acceptance.
 * Orders already in payment or fulfillment keep their reservation (the
 * reservation is cleared from the expiry scan instead of being released mid-flow).
 */
export async function releaseExpiredReservations(limit = 50) {
  return prisma.$transaction(async (tx) => {
    const expired = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "InventoryReservation"
      WHERE status = 'RESERVED' AND "expiresAt" < NOW()
      ORDER BY "expiresAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;
    const ids = expired.map((row) => row.id);
    if (!ids.length) return { scanned: 0, released: 0, held: 0 };
    const reservations = await tx.inventoryReservation.findMany({
      where: { id: { in: ids } },
      include: { lines: true, order: { select: { status: true } } },
    });
    let released = 0;
    let held = 0;
    for (const reservation of reservations) {
      if (!["PENDING", "CONFIRMED"].includes(reservation.order.status)) {
        await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { expiresAt: null } });
        held++;
        continue;
      }
      for (const line of reservation.lines) {
        await tx.ingredient.update({ where: { id: line.ingredientId }, data: { currentStock: { increment: line.quantity } } });
        await tx.stockMovement.create({ data: { ingredientId: line.ingredientId, type: "RETURNED", quantity: line.quantity, reason: "Expired reservation release", reference: reservation.orderId } });
      }
      await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED", releasedAt: new Date(), expiresAt: null } });
      released++;
    }
    return { scanned: reservations.length, released, held };
  });
}
