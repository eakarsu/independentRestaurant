import { z } from 'zod';
import prisma from '@/lib/prisma';
import { endpoint, body, mutate, audit, json, OperationError } from '@/lib/operations/core';
import { OPERATIONS } from '@/lib/commerce/access';
import { prepForecast } from '@/lib/operations/prep-forecast';

const KEY = 'prep-plan-overrides';
const overrideSchema = z.object({ menuItemId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), quantity: z.number().int().min(0).max(10_000), reason: z.string().trim().min(5).max(500), updatedAt: z.string().datetime().nullable() }).strict();
type Override = { quantity: number; reason: string; actorId: string; recordedAt: string };
function readOverrides(value: unknown): Record<string, Override> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Override> : {};
}

export const GET = endpoint(OPERATIONS, async () => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since = new Date(today.getTime() - 56 * 86_400_000);
  const [menu, sales, waste, settings] = await Promise.all([
    prisma.menuItem.findMany({ where: { isAvailable: true, is86d: false }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 }),
    prisma.orderItem.findMany({ where: { order: { status: { in: ['COMPLETED', 'SERVED'] } }, createdAt: { gte: since, lt: today } }, select: { menuItemId: true, quantity: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20_000 }),
    prisma.wasteRecord.findMany({ where: { createdAt: { gte: since, lt: today } }, select: { ingredientId: true, quantity: true, cost: true, ingredient: { select: { name: true, unit: true } } }, take: 10_000 }),
    prisma.settings.findUnique({ where: { key: KEY } }),
  ]);
  const forecast = prepForecast(menu, sales, now);
  const wasteByIngredient = new Map<string, { ingredientId: string; name: string; unit: string; quantity: number; cost: number }>();
  for (const row of waste) {
    const current = wasteByIngredient.get(row.ingredientId) || { ingredientId: row.ingredientId, name: row.ingredient.name, unit: row.ingredient.unit, quantity: 0, cost: 0 };
    current.quantity += row.quantity;
    current.cost += row.cost;
    wasteByIngredient.set(row.ingredientId, current);
  }
  return Response.json({ ...forecast, overrides: readOverrides(settings?.value), updatedAt: settings?.updatedAt || null, salesRowsIncluded: sales.length, salesTruncated: sales.length === 20_000, wasteRowsIncluded: waste.length, wasteTruncated: waste.length === 10_000, waste: [...wasteByIngredient.values()].sort((a, b) => b.cost - a.cost).slice(0, 20), limitations: ['Missing calendar days are counted as zero recorded sales; verify the restaurant was open and data was complete.', 'Stockouts, events, weather and upcoming changes are not modeled.', 'Waste is from ingredient records and cannot be assigned to a specific menu item without recipe and batch evidence.', 'Suggested prep is advisory. A staff member must decide actual quantities.'] }, { headers: { 'Cache-Control': 'no-store' } });
});

export const PUT = endpoint(OPERATIONS, async (actor, request: Request) => {
  const input = overrideSchema.parse(await body(request));
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const target = new Date(`${input.date}T00:00:00.000Z`);
  if (!Number.isFinite(target.getTime()) || target < today || target >= new Date(today.getTime() + 7 * 86_400_000)) throw new OperationError('Choose a date in the next seven UTC days');
  return Response.json(await mutate(actor, request, 'prep.override', input, async (tx) => {
    const menu = await tx.menuItem.findFirst({ where: { id: input.menuItemId, isAvailable: true, is86d: false }, select: { id: true } });
    if (!menu) throw new OperationError('Menu item is unavailable', 404);
    const old = await tx.settings.findUnique({ where: { key: KEY } });
    if ((old?.updatedAt.toISOString() || null) !== input.updatedAt) throw new OperationError('Plan changed. Refresh before saving.', 409);
    const entries = Object.fromEntries(Object.entries(readOverrides(old?.value)).filter(([key]) => key.split(':')[1] >= today.toISOString().slice(0, 10)));
    entries[`${input.menuItemId}:${input.date}`] = { quantity: input.quantity, reason: input.reason, actorId: actor.userId, recordedAt: new Date().toISOString() };
    const saved = await tx.settings.upsert({ where: { key: KEY }, create: { key: KEY, value: json(entries) }, update: { value: json(entries) } });
    await audit(tx, actor, 'PREP_PLAN_OVERRIDE', 'Settings', saved.id, { menuItemId: input.menuItemId, date: input.date, quantity: input.quantity, reason: input.reason });
    return { overrides: entries, updatedAt: saved.updatedAt };
  }));
});
