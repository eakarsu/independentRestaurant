import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { OperationError } from '@/lib/operations/core';
import type { Actor } from '@/lib/commerce/authz';

export const GUEST_COOKIE = 'restaurant_guest_checkout';
export const guestCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const guestToken = () => randomBytes(32).toString('base64url');
function secret() {
  const value = process.env.GUEST_CHECKOUT_SECRET;
  if (!value || value.length < 32) throw new OperationError('Guest checkout is not configured', 503);
  return value;
}
export const codeDigest = (id: string, code: string) => createHmac('sha256', secret()).update(`${id}:${code}`).digest('hex');
export const tokenDigest = (token: string) => createHmac('sha256', secret()).update(`session:${token}`).digest('hex');
export const equalDigest = (a: string, b: string) => /^[0-9a-f]{64}$/.test(a) && /^[0-9a-f]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

export async function guestActor(request: NextRequest): Promise<Actor> {
  const token = request.cookies.get(GUEST_COOKIE)?.value;
  if (!token || token.length > 128) throw new OperationError('Verify your email to order', 401);
  const record = await prisma.guestCheckoutChallenge.findUnique({ where: { tokenHash: tokenDigest(token) }, select: { verifiedAt: true, tokenExpiresAt: true, user: { select: { id: true, role: true, isActive: true, customerProfile: { select: { id: true } } } } } });
  if (!record?.verifiedAt || !record.tokenExpiresAt || record.tokenExpiresAt <= new Date() || !record.user?.isActive || record.user.role !== 'CUSTOMER' || !record.user.customerProfile) throw new OperationError('Guest session expired; verify your email again', 401);
  return { userId: record.user.id, role: 'CUSTOMER' };
}

export function assertGuestOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin && origin !== process.env.NEXTAUTH_URL) throw new OperationError('Cross-origin request is not permitted', 403);
}

export async function guestResponse(work: () => Promise<Response>) {
  try { return await work(); }
  catch (error) {
    const status = error instanceof z.ZodError ? 422 : error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code) ? 409 : (error as { status?: number }).status || 503;
    return Response.json({ error: status < 500 && error instanceof Error ? error.message : 'Guest checkout is unavailable; try again later' }, { status });
  }
}
