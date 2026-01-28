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

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
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
