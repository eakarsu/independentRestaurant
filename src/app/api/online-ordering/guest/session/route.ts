import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { GUEST_COOKIE, assertGuestOrigin, guestActor, guestResponse, tokenDigest } from '@/lib/commerce/guest-session';

export async function GET(request: NextRequest) {
  return guestResponse(async () => {
    const actor = await guestActor(request);
    const customer = await prisma.customer.findUnique({ where: { userId: actor.userId }, select: { firstName: true, lastName: true, email: true } });
    return Response.json({ verified: true, customer }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
export async function DELETE(request: NextRequest) {
  return guestResponse(async () => {
    assertGuestOrigin(request);
    const token = request.cookies.get(GUEST_COOKIE)?.value;
    if (token && token.length <= 128) await prisma.guestCheckoutChallenge.updateMany({ where: { tokenHash: tokenDigest(token) }, data: { tokenHash: null, tokenExpiresAt: null } });
    const response = NextResponse.json({ cleared: true });
    response.cookies.set(GUEST_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
    return response;
  });
}
