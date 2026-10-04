import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { body, audit, OperationError } from '@/lib/operations/core';
import { createOrderSchema, createRestaurantOrder, priceRestaurantOrder, transitionOrder } from '@/lib/commerce/orders';
import { assertOnlineOrder } from '@/lib/commerce/online-policy';
import { assertGuestOrigin, guestActor, guestResponse } from '@/lib/commerce/guest-session';

const cart = z.object({ items: z.array(z.object({ menuItemId: z.string().min(1), quantity: z.number().int().min(1).max(100), modifierIds: z.array(z.string()).max(20), notes: z.string().max(500).optional() }).strict()).min(1).max(30), pickupAt: z.string().datetime(), notes: z.string().max(1000).optional(), tipCents: z.number().int().min(0).max(100_000).default(0) }).strict();
const schema = z.discriminatedUnion('action', [z.object({ action: z.literal('quote'), cart }), z.object({ action: z.literal('order'), cart, totalCents: z.number().int().positive(), confirmed: z.literal(true) }), z.object({ action: z.literal('cancel'), id: z.string().min(1), reason: z.string().trim().min(3).max(500) })]);
const safeSelect = { id: true, orderNumber: true, type: true, status: true, paymentStatus: true, total: true, subtotal: true, tax: true, tip: true, currency: true, pickupAt: true, createdAt: true, items: { select: { id: true, quantity: true, unitPrice: true, totalPrice: true, notes: true, menuItem: { select: { name: true } }, modifiers: { select: { priceAdjustment: true, modifier: { select: { name: true } } } } } } } as const;

export async function GET(request: NextRequest) {
  return guestResponse(async () => {
    const actor = await guestActor(request);
    const [profile, orders] = await Promise.all([
      prisma.customer.findUnique({ where: { userId: actor.userId }, select: { firstName: true, lastName: true } }),
      prisma.order.findMany({ where: { customer: { userId: actor.userId }, source: 'online', type: 'TAKEOUT' }, select: safeSelect, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return Response.json({ profile, orders }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(request: NextRequest) {
  return guestResponse(async () => {
    assertGuestOrigin(request);
    const actor = await guestActor(request);
    const input = schema.parse(await body(request));
    const key = request.headers.get('idempotency-key') || '';
    if (!/^[\w][\w.:-]{7,127}$/.test(key)) throw new OperationError('Request key required');
    if (input.action === 'cancel') {
      const owned = await prisma.order.findFirst({ where: { id: input.id, customer: { userId: actor.userId }, source: 'online', type: 'TAKEOUT' }, select: { id: true } });
      if (!owned) throw new OperationError('Order not found', 404);
      await transitionOrder({ orderId: input.id, toStatus: 'CANCELLED', actor, idempotencyKey: key, reason: input.reason });
      return Response.json({ saved: true });
    }
    const parsed = createOrderSchema.parse({ ...input.cart, idempotencyKey: key, type: 'TAKEOUT', source: 'online', expectedTotalCents: input.action === 'order' ? input.totalCents : 1 });
    if (input.action === 'quote') {
      await prisma.$transaction(async tx => {
        await assertOnlineOrder(tx, actor, parsed);
        if (await tx.operationAudit.count({ where: { actorId: actor.userId, action: 'ONLINE_QUOTE_REQUEST', createdAt: { gte: new Date(Date.now() - 60_000) } } }) >= 20) throw new OperationError('Too many quotes; try again in a minute', 429);
        await audit(tx, actor, 'ONLINE_QUOTE_REQUEST', 'Customer', actor.userId, { guest: true });
      });
      const priced = await priceRestaurantOrder(parsed);
      return Response.json({ subtotalCents: priced.subtotalCents, taxCents: priced.taxQuote.taxCents, totalCents: priced.totalCents, tipCents: parsed.tipCents, lines: priced.preparedItems.map(item => ({ name: item.menuItem.name, quantity: item.input.quantity, unitPriceCents: item.unitPriceCents, totalCents: item.totalPriceCents, modifiers: item.selected.map(modifier => modifier.name) })) });
    }
    const saved = await createRestaurantOrder(parsed, actor);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: saved.id }, select: safeSelect });
    return Response.json(order, { status: 201 });
  });
}
