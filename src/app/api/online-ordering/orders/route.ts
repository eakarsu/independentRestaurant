import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAccess } from "@/lib/commerce/access";
import { requireActor } from "@/lib/commerce/authz";
import { body, audit, OperationError } from "@/lib/operations/core";
import {
  createOrderSchema,
  createRestaurantOrder,
  priceRestaurantOrder,
  transitionOrder,
} from "@/lib/commerce/orders";
import { assertOnlineOrder } from "@/lib/commerce/online-policy";
const cart = z
  .object({
    items: z
      .array(
        z
          .object({
            menuItemId: z.string().min(1),
            quantity: z.number().int().min(1).max(100),
            modifierIds: z.array(z.string()).max(20),
            notes: z.string().max(500).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    pickupAt: z.string().datetime(),
    notes: z.string().max(1000).optional(),
    tipCents: z.number().int().min(0).max(100000).default(0),
  })
  .strict();
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quote"), cart }),
  z.object({
    action: z.literal("order"),
    cart,
    totalCents: z.number().int().positive(),
    confirmed: z.literal(true),
  }),
  z.object({
    action: z.literal("cancel"),
    id: z.string().min(1),
    reason: z.string().trim().min(3).max(500),
  }),
]);
const safeSelect = {
  id: true,
  orderNumber: true,
  type: true,
  status: true,
  paymentStatus: true,
  total: true,
  subtotal: true,
  tax: true,
  tip: true,
  currency: true,
  pickupAt: true,
  createdAt: true,
  items: {
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      notes: true,
      menuItem: { select: { name: true } },
      modifiers: {
        select: { priceAdjustment: true, modifier: { select: { name: true } } },
      },
    },
  },
} as const;
export const GET = withAccess(["CUSTOMER"], async () => {
  const actor = await requireActor(["CUSTOMER"]);
  const profile = await prisma.customer.findUnique({
    where: { userId: actor.userId },
    select: { firstName: true, lastName: true },
  });
  if (!profile)
    return Response.json(
      { error: "Ask the restaurant to connect your customer profile" },
      { status: 409 },
    );
  return Response.json({
    profile,
    orders: await prisma.order.findMany({
      where: { customer: { userId: actor.userId } },
      select: safeSelect,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  });
});
export const POST = withAccess(["CUSTOMER"], async (request: Request) => {
  try {
    const actor = await requireActor(["CUSTOMER"]),
      input = inputSchema.parse(await body(request)),
      key = request.headers.get("idempotency-key") || "";
    if (!/^[\w][\w.:-]{7,127}$/.test(key))
      throw new OperationError("Request key required");
    if (input.action === "cancel") {
      await transitionOrder({
        orderId: input.id,
        toStatus: "CANCELLED",
        actor,
        idempotencyKey: key,
        reason: input.reason,
      });
      return Response.json({ saved: true });
    }
    const parsed = createOrderSchema.parse({
      ...input.cart,
      idempotencyKey: key,
      type: "TAKEOUT",
      source: "online",
      expectedTotalCents: input.action === "order" ? input.totalCents : 1,
    });
    if (input.action === "quote") {
      await prisma.$transaction(async (tx) => {
        await assertOnlineOrder(tx, actor, parsed);
        if (
          (await tx.operationAudit.count({
            where: {
              actorId: actor.userId,
              action: "ONLINE_QUOTE_REQUEST",
              createdAt: { gte: new Date(Date.now() - 60000) },
            },
          })) >= 20
        )
          throw new OperationError(
            "Too many quote requests; try again in a minute",
            429,
          );
        await audit(
          tx,
          actor,
          "ONLINE_QUOTE_REQUEST",
          "Customer",
          actor.userId,
          {},
        );
      });
      const priced = await priceRestaurantOrder(parsed);
      return Response.json({
        subtotalCents: priced.subtotalCents,
        taxCents: priced.taxQuote.taxCents,
        totalCents: priced.totalCents,
        tipCents: parsed.tipCents,
        lines: priced.preparedItems.map((i) => ({
          name: i.menuItem.name,
          quantity: i.input.quantity,
          unitPriceCents: i.unitPriceCents,
          totalCents: i.totalPriceCents,
          modifiers: i.selected.map((m) => m.name),
        })),
      });
    }
    const saved = await createRestaurantOrder(parsed, actor);
    return Response.json(
      await prisma.order.findUniqueOrThrow({
        where: { id: saved.id },
        select: safeSelect,
      }),
      { status: 201 },
    );
  } catch (error) {
    const status =
      error instanceof z.ZodError
        ? 422
        : (error as { status?: number }).status || 503;
    return Response.json(
      {
        error:
          status < 500 && error instanceof Error
            ? error.message
            : "Ordering is unavailable. Contact the restaurant or try again later.",
      },
      { status },
    );
  }
});
