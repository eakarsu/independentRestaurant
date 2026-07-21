import { Prisma } from "@prisma/client";

class InventoryConflictError extends Error {
  status = 409;
}

export interface TransactionalInventoryProvider {
  reserve(tx: Prisma.TransactionClient, input: { orderId: string; idempotencyKey: string; lines: Map<string, number> }): Promise<{ reservationId: string }>;
  release(tx: Prisma.TransactionClient, input: { orderId: string }): Promise<void>;
  commit(tx: Prisma.TransactionClient, input: { orderId: string }): Promise<void>;
}

export class PostgresInventoryProvider implements TransactionalInventoryProvider {
  async reserve(tx: Prisma.TransactionClient, input: { orderId: string; idempotencyKey: string; lines: Map<string, number> }) {
    const reservation = await tx.inventoryReservation.create({
      data: { orderId: input.orderId, provider: "internal-postgres", providerRef: input.orderId, idempotencyKey: input.idempotencyKey },
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
      await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED", releasedAt: new Date() } });
    }
  }

  async commit(tx: Prisma.TransactionClient, input: { orderId: string }) {
    await tx.inventoryReservation.updateMany({ where: { orderId: input.orderId, status: "RESERVED" }, data: { status: "COMMITTED", committedAt: new Date() } });
  }
}
