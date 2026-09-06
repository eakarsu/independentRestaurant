import { NextResponse } from "next/server";
import { AuthorizationError, requireActor } from "./authz";

export const MANAGEMENT = ["ADMIN", "MERCHANT", "MANAGER"];
export const OPERATIONS = [...MANAGEMENT, "OPERATOR", "STAFF", "HOST", "CHEF"];

/** Apply authorization before invoking a handler, including its own error boundary. */
export function withAccess<Args extends unknown[]>(roles: readonly string[], handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      await requireActor(roles);
      const request = args[0];
      if (request instanceof Request && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        const origin = request.headers.get("origin");
        const allowed = new Set([new URL(request.url).origin]);
        if (process.env.NEXTAUTH_URL) allowed.add(new URL(process.env.NEXTAUTH_URL).origin);
        // The local UI proxy and backend share the same authenticated app.
        if (process.env.NODE_ENV !== "production") {
          for (const port of [process.env.FRONTEND_PORT, process.env.BACKEND_PORT]) {
            if (port && /^\d+$/.test(port)) for (const host of ["localhost", "127.0.0.1"]) allowed.add(`http://${host}:${port}`);
          }
        }
        if (origin && !allowed.has(origin)) throw new AuthorizationError("Cross-origin mutation is not permitted");
      }
      return await handler(...args);
    } catch (error) {
      if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
      console.error("API request failed", error instanceof Error ? error.name : "UnknownError");
      return NextResponse.json({ error: "The request could not be completed" }, { status: 500 });
    }
  };
}
