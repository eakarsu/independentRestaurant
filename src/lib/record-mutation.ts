import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { AuthorizationError, requireActor } from '@/lib/commerce/authz';
import { MANAGEMENT } from '@/lib/commerce/access';

function checkRequest(request: Request) {
  // Next's native Node adapter aborts with ResponseAborted rather than a DOM
  // AbortError. Use a consistent cancellation result after its real signal.
  if (request.signal.aborted) throw new DOMException('Native record request cancelled', 'AbortError');
}

export async function recordMutation<T>(request: Request, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const actor = await requireActor(MANAGEMENT);
  checkRequest(request);
  return prisma.$transaction(async tx => {
    checkRequest(request);
    // Hold the real native account through commit; changing its role or active
    // state cannot race this authorized record write.
    const rows = await tx.$queryRaw<{ id: string; role: string; isActive: boolean }[]>`
      SELECT "id", "role", "isActive" FROM "User" WHERE "id" = ${actor.userId} FOR SHARE
    `;
    if (!rows[0]?.isActive) throw new AuthorizationError('Authentication required', 401);
    if (!MANAGEMENT.includes(rows[0].role)) throw new AuthorizationError('Management permission required', 403);
    checkRequest(request);
    const result = await work(tx);
    checkRequest(request);
    return result;
  }, { timeout: 15000 });
}

export function recordMutationFailure(error: unknown): Response | null {
  if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.name === 'AbortError') return Response.json({ error: 'Record request cancelled. Reload saved records to confirm their current state.' }, { status: 499 });
  return null;
}
