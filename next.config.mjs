const allowedOrigin = process.env.CORS_ORIGIN;

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  async headers() {
    if (!allowedOrigin) return [];
    return [{
      source: "/api/:path*",
      headers: [
        { key: "Access-Control-Allow-Credentials", value: "true" },
        { key: "Access-Control-Allow-Origin", value: allowedOrigin },
        { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,DELETE,OPTIONS" },
        { key: "Access-Control-Allow-Headers", value: "Content-Type,Authorization,Idempotency-Key,X-Requested-With" },
      ],
    }];
  },
};

export default nextConfig;
