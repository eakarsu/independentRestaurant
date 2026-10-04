import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import prisma from '@/lib/prisma';
import { body, OperationError } from '@/lib/operations/core';
import { assertGuestOrigin, codeDigest, equalDigest, GUEST_COOKIE, guestResponse, guestToken, tokenDigest } from '@/lib/commerce/guest-session';

const schema = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
export async function POST(request: NextRequest) {
  return guestResponse(async () => {
    assertGuestOrigin(request);
    const input = schema.parse(await body(request));
    const token = guestToken();
    const password = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guest-verify:${input.challengeId}`}))`;
      const challenge = await tx.guestCheckoutChallenge.findUnique({ where: { id: input.challengeId } });
      if (!challenge || challenge.verifiedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5) throw new OperationError('Code expired or invalid; request a new one', 409);
      if (!equalDigest(challenge.codeHash, codeDigest(challenge.id, input.code))) {
        await tx.guestCheckoutChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
        return { invalid: true } as const;
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guest-email:${challenge.email}`}))`;
      const matchingUsers = await tx.user.findMany({ where: { email: { equals: challenge.email, mode: 'insensitive' } }, select: { id: true, role: true, isActive: true }, take: 2 });
      if (matchingUsers.length > 1) throw new OperationError('Customer account needs staff review', 409);
      let user = matchingUsers[0];
      if (user && (!user.isActive || user.role !== 'CUSTOMER')) throw new OperationError('This email is linked to another account type; sign in or contact the restaurant', 409);
      if (!user) user = await tx.user.create({ data: { email: challenge.email, name: `${challenge.firstName} ${challenge.lastName}`, password, role: 'CUSTOMER' }, select: { id: true, role: true, isActive: true } });
      let customer = await tx.customer.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!customer) {
        const matchingCustomers = await tx.customer.findMany({ where: { email: { equals: challenge.email, mode: 'insensitive' } }, select: { id: true, userId: true }, take: 2 });
        if (matchingCustomers.length > 1) throw new OperationError('Customer profile needs staff review', 409);
        const existing = matchingCustomers[0];
        if (existing?.userId && existing.userId !== user.id) throw new OperationError('Customer profile needs staff review', 409);
        customer = existing ? await tx.customer.update({ where: { id: existing.id }, data: { userId: user.id }, select: { id: true } }) : await tx.customer.create({ data: { userId: user.id, firstName: challenge.firstName, lastName: challenge.lastName, email: challenge.email, phone: challenge.phone, dietaryPrefs: [], allergens: [] }, select: { id: true } });
      }
      await tx.guestCheckoutChallenge.updateMany({ where: { userId: user.id, tokenHash: { not: null } }, data: { tokenHash: null, tokenExpiresAt: null } });
      await tx.guestCheckoutChallenge.update({ where: { id: challenge.id }, data: { verifiedAt: new Date(), userId: user.id, tokenHash: tokenDigest(token), tokenExpiresAt: new Date(Date.now() + 7 * 86_400_000) } });
      return { invalid: false, customerId: customer.id } as const;
    });
    if (result.invalid) throw new OperationError('Code expired or invalid; request a new one', 409);
    const response = NextResponse.json({ verified: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(GUEST_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 86_400 });
    return response;
  });
}
