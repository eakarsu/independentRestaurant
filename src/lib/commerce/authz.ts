import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const ORDER_READ_ROLES = [
  "ADMIN", "MERCHANT", "MANAGER", "OPERATOR", "STAFF", "HOST", "CHEF", "CUSTOMER",
] as const;
export const ORDER_WRITE_ROLES = [
  "ADMIN", "MERCHANT", "MANAGER", "OPERATOR", "STAFF", "HOST", "CUSTOMER",
] as const;
export const ORDER_CONTROL_ROLES = [
  "ADMIN", "MERCHANT", "MANAGER", "OPERATOR", "STAFF", "CHEF",
] as const;
export const REFUND_ROLES = ["ADMIN", "MERCHANT", "MANAGER"] as const;

export type Actor = { userId: string; role: string };

export class AuthorizationError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

export async function requireActor(roles: readonly string[]): Promise<Actor> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new AuthorizationError("Authentication required", 401);
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true, isActive: true } });
  if (!user?.isActive) throw new AuthorizationError("Session is no longer active", 401);
  if (!roles.includes(user.role)) throw new AuthorizationError("Insufficient role", 403);
  return { userId: user.id, role: user.role };
}
