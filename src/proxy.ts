import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function proxy(request) {
    const token = request.nextauth.token;
    const path = request.nextUrl.pathname;
    if (["/settings", "/integrations"].some((route) => path.startsWith(route))) {
      if (!["ADMIN", "MERCHANT", "MANAGER"].includes(String(token?.role))) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
    const response = NextResponse.next();
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    response.headers.set("X-DNS-Prefetch-Control", "off");
    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => req.nextUrl.pathname.startsWith("/api/auth") || Boolean(token && !token.invalid),
    },
  },
);

export const config = {
  matcher: [
    "/dashboard/:path*", "/orders/:path*", "/reservations/:path*", "/menu/:path*",
    "/inventory/:path*", "/staff/:path*", "/customers/:path*", "/reports/:path*",
    "/kitchen/:path*", "/settings/:path*", "/integrations/:path*",
  ],
};
