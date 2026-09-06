import { Prisma, type OrderStatus } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { auditHash, sha256 } from "./crypto";
import {
  assertOrderTransition,
  type CommerceOrderStatus,
} from "./state-machine";
import {
  ORDER_CONTROL_ROLES,
  ORDER_WRITE_ROLES,
  AuthorizationError,
  type Actor,
} from "./authz";
import { assertOnlineOrder } from "./online-policy";
import { configuredTaxProvider, type TaxProvider } from "./providers";
import {
  PostgresInventoryProvider,
  type TransactionalInventoryProvider,
} from "./inventory";

const itemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().positive().max(100),
  notes: z.string().trim().max(500).optional(),
  modifierIds: z.array(z.string().min(1)).max(20).default([]),
});

export const createOrderSchema = z.object({
  idempotencyKey: z.string().min(8).max(200),
  type: z
    .enum(["DINE_IN", "TAKEOUT", "DELIVERY", "CATERING"])
    .default("DINE_IN"),
  pickupAt: z.string().datetime().optional(),
  expectedTotalCents: z.number().int().positive().optional(),
  tableId: z.string().optional(),
  customerId: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
  source: z.enum(["pos", "online", "phone", "delivery_app"]).default("pos"),
  discountCents: z.number().int().nonnegative().default(0),
  tipCents: z.number().int().nonnegative().default(0),
  deliveryAddress: z
    .object({
      address: z.string().min(1),
      apartmentUnit: z.string().optional(),
      city: z.string().min(1),
      state: z.string().min(1),
      zipCode: z.string().min(1),
      instructions: z.string().max(500).optional(),
    })
    .optional(),
  items: z.array(itemSchema).min(1).max(100),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export class CommerceConflictError extends Error {
  status = 409;
  constructor(message: string) {
    super(message);
    this.name = "CommerceConflictError";
  }
}

export class CommerceValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "CommerceValidationError";
  }
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function dollars(value: number): number {
  return value / 100;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function appendEvent(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    type: string;
    fromStatus?: OrderStatus | null;
    toStatus?: OrderStatus | null;
    actor: Actor;
    idempotencyKey: string;
    payload?: unknown;
  },
) {
  const prior = await tx.orderEvent.findFirst({
    where: { orderId: input.orderId },
    orderBy: { sequence: "desc" },
  });
  const sequence = (prior?.sequence ?? 0) + 1;
  const payload = input.payload ?? {};
  const actorUserId =
    input.actor.role === "PROVIDER" ? null : input.actor.userId;
  const hashInput = {
    orderId: input.orderId,
    sequence,
    type: input.type,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    actorUserId,
    actorRole: input.actor.role,
    idempotencyKey: input.idempotencyKey,
    payload,
    previousHash: prior?.hash ?? null,
  };
  return tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      sequence,
      type: input.type,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actorUserId,
      actorRole: input.actor.role,
      idempotencyKey: input.idempotencyKey,
      payload: jsonValue(payload),
      previousHash: prior?.hash ?? null,
      hash: auditHash(hashInput),
    },
  });
}

async function customerIdForActor(
  actor: Actor,
  requestedCustomerId?: string,
): Promise<string | undefined> {
  if (actor.role !== "CUSTOMER") return requestedCustomerId;
  const customer = await prisma.customer.findUnique({
    where: { userId: actor.userId },
  });
  if (!customer)
    throw new CommerceValidationError(
      "Customer account is not linked to a customer profile",
    );
  if (requestedCustomerId && requestedCustomerId !== customer.id) {
    throw new CommerceValidationError(
      "A customer cannot place an order for another customer",
    );
  }
  return customer.id;
}

export async function priceRestaurantOrder(
  input: CreateOrderInput,
  taxProvider: TaxProvider = configuredTaxProvider(),
) {
  const menuIds = [...new Set(input.items.map((item) => item.menuItemId))];
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuIds }, isAvailable: true, is86d: false },
    include: {
      ingredients: true,
      modifierGroups: {
        include: { modifierGroup: { include: { modifiers: true } } },
      },
    },
  });
  if (menuItems.length !== menuIds.length)
    throw new CommerceValidationError("One or more menu items are unavailable");
  const menuById = new Map(menuItems.map((item) => [item.id, item]));

  let subtotalCents = 0;
  const preparedItems = input.items.map((item) => {
    const menuItem = menuById.get(item.menuItemId)!;
    const modifiers = menuItem.modifierGroups.flatMap(
      (group) => group.modifierGroup.modifiers,
    );
    const allowed = new Map(
      modifiers
        .filter((modifier) => modifier.isAvailable)
        .map((modifier) => [modifier.id, modifier]),
    );
    if (new Set(item.modifierIds).size !== item.modifierIds.length)
      throw new CommerceValidationError("Duplicate modifiers are not allowed");
    const selected = item.modifierIds.map((id) => {
      const modifier = allowed.get(id);
      if (!modifier)
        throw new CommerceValidationError(
          `Modifier ${id} is not available for ${menuItem.name}`,
        );
      return modifier;
    });
    for (const { modifierGroup: group } of menuItem.modifierGroups) {
      const count = selected.filter(
        (modifier) => modifier.groupId === group.id,
      ).length;
      if (
        count < Math.max(group.minSelect, group.required ? 1 : 0) ||
        count > group.maxSelect
      )
        throw new CommerceValidationError(
          `Choose ${Math.max(group.minSelect, group.required ? 1 : 0)}–${group.maxSelect} options for ${group.name}`,
        );
    }
    const unitPriceCents =
      cents(menuItem.price) +
      selected.reduce(
        (sum, modifier) => sum + cents(modifier.priceAdjustment),
        0,
      );
    const totalPriceCents = unitPriceCents * item.quantity;
    subtotalCents += totalPriceCents;
    return { input: item, menuItem, selected, unitPriceCents, totalPriceCents };
  });
  if (input.discountCents > subtotalCents)
    throw new CommerceValidationError("Discount cannot exceed subtotal");

  const taxQuote = await taxProvider.quote({
    idempotencyKey: `${input.idempotencyKey}:tax`,
    currency: "USD",
    subtotalCents,
    discountCents: input.discountCents,
    deliveryAddress: input.deliveryAddress,
    lines: preparedItems.map((item) => ({
      sku: item.menuItem.id,
      quantity: item.input.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
  });
  if (!Number.isSafeInteger(taxQuote.taxCents) || taxQuote.taxCents < 0) {
    throw new CommerceValidationError(
      "Tax provider returned an invalid amount",
    );
  }
  const totalCents =
    subtotalCents - input.discountCents + input.tipCents + taxQuote.taxCents;

  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents <= 0 ||
    totalCents > 100000000
  )
    throw new CommerceValidationError("Order total is invalid");
  return { preparedItems, subtotalCents, taxQuote, totalCents };
}

export async function createRestaurantOrder(
  rawInput: unknown,
  actor: Actor,
  taxProvider: TaxProvider = configuredTaxProvider(),
  inventoryProvider: TransactionalInventoryProvider = new PostgresInventoryProvider(),
) {
  if (!(ORDER_WRITE_ROLES as readonly string[]).includes(actor.role))
    throw new AuthorizationError("Ordering access required");
  const input = createOrderSchema.parse(rawInput);
  if (input.type === "DELIVERY" && !input.deliveryAddress) {
    throw new CommerceValidationError(
      "Delivery address is required for delivery orders",
    );
  }
  const customerId = await customerIdForActor(actor, input.customerId);
  if (
    input.discountCents &&
    !["ADMIN", "MERCHANT", "MANAGER"].includes(actor.role)
  )
    throw new CommerceValidationError(
      "Manager authority is required for discounts",
    );
  const requestHash = sha256(JSON.stringify({ input, actorId: actor.userId }));
  const duplicate = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (duplicate) {
    if (duplicate.requestHash !== requestHash)
      throw new CommerceConflictError(
        "Idempotency key was reused with a different request",
      );
    return prisma.order.findUniqueOrThrow({
      where: { id: duplicate.id },
      include: {
        items: { include: { menuItem: true, modifiers: true } },
        delivery: true,
        events: true,
      },
    });
  }

  const { preparedItems, subtotalCents, taxQuote, totalCents } =
    await priceRestaurantOrder(input, taxProvider);
  if (
    input.expectedTotalCents !== undefined &&
    input.expectedTotalCents !== totalCents
  )
    throw new CommerceConflictError(
      "Prices or tax changed. Review a fresh quote before ordering.",
    );

  return prisma.$transaction(
    async (tx) => {
      if (actor.role === "CUSTOMER") await assertOnlineOrder(tx, actor, input);
      const order = await tx.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}-${input.idempotencyKey.slice(-6).toUpperCase()}`,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          customerId,
          tableId: input.tableId,
          type: input.type,
          source: input.source,
          pickupAt: input.pickupAt ? new Date(input.pickupAt) : undefined,
          status: "PENDING",
          subtotal: dollars(subtotalCents),
          tax: dollars(taxQuote.taxCents),
          discount: dollars(input.discountCents),
          tip: dollars(input.tipCents),
          total: dollars(totalCents),
          notes: input.notes,
          delivery: input.deliveryAddress
            ? { create: input.deliveryAddress }
            : undefined,
          items: {
            create: preparedItems.map((item) => ({
              menuItemId: item.menuItem.id,
              quantity: item.input.quantity,
              unitPrice: dollars(item.unitPriceCents),
              totalPrice: dollars(item.totalPriceCents),
              notes: item.input.notes,
              modifiers: {
                create: item.selected.map((modifier) => ({
                  modifierId: modifier.id,
                  priceAdjustment: modifier.priceAdjustment,
                })),
              },
            })),
          },
        },
      });
      await appendEvent(tx, {
        orderId: order.id,
        type: "ORDER_CREATED",
        toStatus: "PENDING",
        actor,
        idempotencyKey: `${input.idempotencyKey}:created`,
        payload: {
          subtotalCents,
          taxCents: taxQuote.taxCents,
          totalCents,
          taxReference: taxQuote.providerRef,
        },
      });

      const required = new Map<string, number>();
      for (const item of preparedItems) {
        for (const ingredient of item.menuItem.ingredients) {
          required.set(
            ingredient.ingredientId,
            (required.get(ingredient.ingredientId) ?? 0) +
              ingredient.quantity * item.input.quantity,
          );
        }
      }
      const reservation = await inventoryProvider.reserve(tx, {
        orderId: order.id,
        idempotencyKey: `${input.idempotencyKey}:inventory`,
        lines: required,
      });
      const confirmed = await tx.order.update({
        where: { id: order.id },
        data: {
          status: actor.role === "CUSTOMER" ? "PENDING" : "CONFIRMED",
          version: { increment: 1 },
        },
      });
      await appendEvent(tx, {
        orderId: order.id,
        type: "INVENTORY_RESERVED",
        fromStatus: "PENDING",
        toStatus: confirmed.status,
        actor,
        idempotencyKey: `${input.idempotencyKey}:reserved`,
        payload: {
          reservationId: reservation.reservationId,
          lines: [...required.entries()],
        },
      });
      return tx.order.findUniqueOrThrow({
        where: { id: confirmed.id },
        include: {
          items: { include: { menuItem: true, modifiers: true } },
          delivery: true,
          events: true,
          inventoryReservations: { include: { lines: true } },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function transitionOrder(input: {
  orderId: string;
  toStatus: CommerceOrderStatus;
  idempotencyKey: string;
  reason?: string;
  actor: Actor;
}) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
      const scoped = await tx.order.findUnique({
        where: { id: input.orderId },
        include: { customer: { select: { userId: true } } },
      });
      if (!scoped) throw new CommerceValidationError("Order not found");
      if (input.actor.role === "CUSTOMER") {
        if (scoped.customer?.userId !== input.actor.userId)
          throw new AuthorizationError("Order is not yours");
        if (input.toStatus !== "CANCELLED")
          throw new AuthorizationError(
            "Customers may only cancel a pending request",
          );
      } else if (
        !(ORDER_CONTROL_ROLES as readonly string[]).includes(input.actor.role)
      )
        throw new AuthorizationError("Order control role required");
      const priorEvent = await tx.orderEvent.findUnique({
        where: {
          orderId_idempotencyKey: {
            orderId: input.orderId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (
        priorEvent &&
        (priorEvent.actorUserId !== input.actor.userId ||
          priorEvent.toStatus !== input.toStatus ||
          (priorEvent.payload as { reason?: string }).reason !==
            (input.reason ?? null))
      )
        throw new CommerceConflictError(
          "Request key was used for different changes",
        );
      if (priorEvent)
        return tx.order.findUniqueOrThrow({
          where: { id: input.orderId },
          include: { events: true },
        });
      const order = await tx.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new CommerceValidationError("Order not found");
      if (input.actor.role === "CUSTOMER" && order.status !== "PENDING")
        throw new CommerceConflictError(
          "The restaurant has already acted on this request. Contact the restaurant to cancel.",
        );
      assertOrderTransition(
        order.status as CommerceOrderStatus,
        input.toStatus,
      );

      if (input.toStatus === "CANCELLED") {
        await new PostgresInventoryProvider().release(tx, {
          orderId: order.id,
        });
      }
      if (input.toStatus === "COMPLETED") {
        await new PostgresInventoryProvider().commit(tx, { orderId: order.id });
      }
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: input.toStatus as OrderStatus,
          version: { increment: 1 },
          lastError:
            input.toStatus === "EXCEPTION" ||
            input.toStatus === "FULFILLMENT_FAILED"
              ? input.reason
              : null,
          cancelledAt: input.toStatus === "CANCELLED" ? new Date() : undefined,
          completedAt: input.toStatus === "COMPLETED" ? new Date() : undefined,
        },
      });
      await appendEvent(tx, {
        orderId: order.id,
        type: "ORDER_STATUS_CHANGED",
        fromStatus: order.status,
        toStatus: updated.status,
        actor: input.actor,
        idempotencyKey: input.idempotencyKey,
        payload: { reason: input.reason ?? null },
      });
      if (input.toStatus === "READY" && order.type === "DELIVERY") {
        await tx.outboxEvent.create({
          data: {
            orderId: order.id,
            topic: "delivery.schedule",
            idempotencyKey: `${input.idempotencyKey}:delivery`,
            payload: jsonValue({ orderId: order.id }),
          },
        });
      }
      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { events: true, inventoryReservations: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function verifyOrderAuditChain(orderId: string): Promise<boolean> {
  const events = await prisma.orderEvent.findMany({
    where: { orderId },
    orderBy: { sequence: "asc" },
  });
  let previousHash: string | null = null;
  for (const event of events) {
    if (event.previousHash !== previousHash) return false;
    const expected = auditHash({
      orderId: event.orderId,
      sequence: event.sequence,
      type: event.type,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actorUserId: event.actorUserId,
      actorRole: event.actorRole,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
      previousHash: event.previousHash,
    });
    if (event.hash !== expected) return false;
    previousHash = event.hash;
  }
  return true;
}

const itemTransitions: Record<string, readonly string[]> = {
  PENDING: ["SENT", "CANCELLED"],
  SENT: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: [],
  CANCELLED: [],
};

export async function transitionOrderItem(input: {
  orderId: string;
  itemId: string;
  toStatus: "PENDING" | "SENT" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
  idempotencyKey: string;
  actor: Actor;
  reason?: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
      const duplicate = await tx.orderEvent.findUnique({
        where: {
          orderId_idempotencyKey: {
            orderId: input.orderId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (duplicate)
        return tx.orderItem.findUniqueOrThrow({ where: { id: input.itemId } });
      const item = await tx.orderItem.findFirst({
        where: { id: input.itemId, orderId: input.orderId },
      });
      if (!item) throw new CommerceValidationError("Order item not found");
      if (!itemTransitions[item.status].includes(input.toStatus))
        throw new CommerceConflictError(
          `Order item cannot transition from ${item.status} to ${input.toStatus}`,
        );
      const updated = await tx.orderItem.update({
        where: { id: item.id },
        data: {
          status: input.toStatus,
          sentToKitchen: input.toStatus === "SENT" ? new Date() : undefined,
          preparedAt: input.toStatus === "READY" ? new Date() : undefined,
        },
      });
      await appendEvent(tx, {
        orderId: input.orderId,
        type: "ORDER_ITEM_STATUS_CHANGED",
        actor: input.actor,
        idempotencyKey: input.idempotencyKey,
        payload: {
          itemId: item.id,
          fromStatus: item.status,
          toStatus: input.toStatus,
          reason: input.reason ?? null,
        },
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
