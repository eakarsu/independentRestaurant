/** @type {import('next').NextConfig} */
const allowedOrigin = process.env.CORS_ORIGIN || "*";

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
  async headers() {
    return [
      {
        // Apply CORS to API routes only — origin is configurable via CORS_ORIGIN.
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: allowedOrigin },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,DELETE,OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type,Authorization,X-Requested-With",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
