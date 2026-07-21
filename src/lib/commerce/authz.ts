import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

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
  if (!roles.includes(session.user.role)) throw new AuthorizationError("Insufficient role", 403);
  return { userId: session.user.id, role: session.user.role };
}
