import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { body, OperationError } from '@/lib/operations/core';
import { assertGuestOrigin, codeDigest, guestCode, guestResponse } from '@/lib/commerce/guest-session';
import { sendGuestCheckoutCode } from '@/lib/email';

const inputSchema = z.object({ email: z.string().trim().email().max(254).transform(value => value.toLowerCase()), firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), phone: z.string().trim().max(40).optional() }).strict();

export async function POST(request: Request) {
  return guestResponse(async () => {
    assertGuestOrigin(request);
    if (process.env.GUEST_CHECKOUT_EMAIL_SANDBOX_ACCEPTED !== 'true' || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) throw new OperationError('Guest email verification is not enabled', 503);
    const input = inputSchema.parse(await body(request));
    const code = guestCode();
    const id = randomUUID();
    const created = await prisma.$transaction(async tx => {
      // Serialize the global hourly cap across different email addresses too.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('guest-code-global'))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guest-code:${input.email}`}))`;
      const hourAgo = new Date(Date.now() - 3_600_000);
      if (await tx.guestCheckoutChallenge.count({ where: { email: input.email, createdAt: { gte: hourAgo } } }) >= 5) throw new OperationError('Too many codes requested for this email; try again later', 429);
      if (await tx.guestCheckoutChallenge.count({ where: { createdAt: { gte: hourAgo } } }) >= 1_000) throw new OperationError('Guest verification is busy; try again later', 429);
      const challenge = await tx.guestCheckoutChallenge.create({ data: { id, ...input, codeHash: codeDigest(id, code), expiresAt: new Date(Date.now() + 10 * 60_000) } });
      return challenge;
    });
    try { await sendGuestCheckoutCode(input.email, code); }
    catch { await prisma.guestCheckoutChallenge.update({ where: { id }, data: { expiresAt: new Date(0) } }); throw new OperationError('Verification email was not accepted; try again later', 503); }
    return Response.json({ challengeId: created.id, expiresAt: created.expiresAt.toISOString(), message: 'If email delivery is available, check your inbox for the code.' }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  });
}
