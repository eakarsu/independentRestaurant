import { z } from 'zod';
import prisma from '@/lib/prisma';
import { MANAGEMENT } from '@/lib/commerce/access';
import { endpoint, body, mutate, audit, json, OperationError } from '@/lib/operations/core';
import { restaurantSettings } from '@/lib/operations/settings';
import { dateInZone, zonedMidnight } from '@/lib/operations/time';
import { cashLedger, cashVariance } from '@/lib/operations/cash-closeout';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const closeSchema = z.object({ date: dateSchema, currency: currencySchema, openingFloatCents: z.number().int().min(0).max(100_000_000), paidOutCents: z.number().int().min(0).max(100_000_000), countedCents: z.number().int().min(0).max(100_000_000), note: z.string().trim().max(1000) }).strict();
const keyFor = (date: string, currency: string) => `cash-closeout:${date}:${currency}`;
const nextDate = (date: string) => { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); return next.toISOString().slice(0, 10); };
async function timezone() {
  const profile = await restaurantSettings();
  const location = await prisma.location.findFirst({ where: { isPrimary: true, isActive: true }, select: { timezone: true } });
  return profile.value?.timezone || location?.timezone || process.env.RESTAURANT_TIMEZONE || 'America/New_York';
}
async function ledger(db: typeof prisma, date: string, currency: string, zone: string) {
  const [payments, refunds] = await Promise.all([
    db.payment.findMany({ where: { status: 'completed', method: { equals: 'cash', mode: 'insensitive' }, createdAt: { gte: zonedMidnight(date, zone), lt: zonedMidnight(nextDate(date), zone) } }, select: { id: true, amount: true, order: { select: { currency: true } } }, take: 10_001 }),
    db.refund.findMany({ where: { provider: 'cash', status: 'SUCCEEDED', completedAt: { gte: zonedMidnight(date, zone), lt: zonedMidnight(nextDate(date), zone) } }, select: { id: true, amountCents: true, currency: true }, take: 10_001 }),
  ]);
  if (payments.length + refunds.length > 10_000) throw new OperationError('Cash ledger exceeds the safe closeout limit; review it before closing', 409);
  try { return cashLedger(payments, currency, refunds); }
  catch { throw new OperationError('A cash payment amount needs review before closeout', 409); }
}
function validateDate(date: string, zone: string) {
  try { zonedMidnight(date, zone); } catch { throw new OperationError('Choose a valid restaurant calendar date', 422); }
  const today = dateInZone(new Date(), zone);
  const earliest = new Date(`${today}T12:00:00Z`); earliest.setUTCDate(earliest.getUTCDate() - 31);
  if (date > today || date < earliest.toISOString().slice(0, 10)) throw new OperationError('Choose today or a day from the previous 31 restaurant calendar days', 422);
}

export const GET = endpoint(MANAGEMENT, async (_actor, request: Request) => {
  const url = new URL(request.url);
  const zone = await timezone();
  const date = dateSchema.parse(url.searchParams.get('date') || dateInZone(new Date(), zone));
  const currency = currencySchema.parse(url.searchParams.get('currency') || 'USD');
  validateDate(date, zone);
  const [source, saved] = await Promise.all([ledger(prisma, date, currency, zone), prisma.settings.findUnique({ where: { key: keyFor(date, currency) } })]);
  const closeout = saved?.value && typeof saved.value === 'object' && !Array.isArray(saved.value) ? saved.value : null;
  return Response.json({ date, currency, timezone: zone, ledger: source, closeout, sourceChanged: !!closeout && closeout.paymentDigest !== source.paymentDigest, definitions: ['Cash received comes from completed cash Payment rows; cash returned comes from succeeded cash Refund rows on this restaurant calendar day and currency.', 'Opening float and other cash paid out are entered by a manager. Card provider refunds do not change the physical cash drawer.', 'A closed count is a snapshot. Later receipts or refunds are flagged for review rather than silently changing that count.'] }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = endpoint(MANAGEMENT, async (actor, request: Request) => {
  const input = closeSchema.parse(await body(request));
  const zone = await timezone();
  validateDate(input.date, zone);
  return Response.json(await mutate(actor, request, 'cash.closeout', input, async tx => {
    const key = keyFor(input.date, input.currency);
    if (await tx.settings.findUnique({ where: { key } })) throw new OperationError('This cash day is already closed; review the saved count', 409);
    const source = await ledger(tx as typeof prisma, input.date, input.currency, zone);
    const totals = cashVariance(input.openingFloatCents, source.netReceivedCents, input.paidOutCents, input.countedCents);
    if (totals.expectedCents < 0) throw new OperationError('Cash paid out exceeds opening float plus receipts', 422);
    if ((input.paidOutCents > 0 || totals.varianceCents !== 0) && input.note.length < 5) throw new OperationError('Explain cash paid out or a count variance', 422);
    const closeout = { ...input, ...source, ...totals, timezone: zone, closedAt: new Date().toISOString(), closedById: actor.userId };
    const saved = await tx.settings.create({ data: { key, value: json(closeout) } });
    await audit(tx, actor, 'CASH_CLOSEOUT', 'Settings', saved.id, closeout);
    return closeout;
  }));
});
