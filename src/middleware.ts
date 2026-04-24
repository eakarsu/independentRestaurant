import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Admin-only routes
    const adminRoutes = ["/settings", "/integrations"];
    if (adminRoutes.some((route) => path.startsWith(route))) {
      if (token?.role !== "ADMIN" && token?.role !== "MANAGER") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }

    // Add security headers (helmet equivalent)
    const response = NextResponse.next();
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    response.headers.set("X-DNS-Prefetch-Control", "off");
    response.headers.set("X-Download-Options", "noopen");
    response.headers.set("X-Permitted-Cross-Domain-Policies", "none");

    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow auth API routes without token
        if (req.nextUrl.pathname.startsWith("/api/auth")) {
          return true;
        }
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/orders/:path*",
    "/reservations/:path*",
    "/menu/:path*",
    "/inventory/:path*",
    "/staff/:path*",
    "/customers/:path*",
    "/reports/:path*",
    "/kitchen/:path*",
    "/ai/:path*",
    "/settings/:path*",
    "/integrations/:path*",
  ],
};
