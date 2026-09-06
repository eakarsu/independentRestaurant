import { withAccess, OPERATIONS } from "@/lib/commerce/access";
/**
 * GET /api/socketio
 *
 * This route exists purely so that Socket.IO's HTTP handshake path
 * (/api/socketio/?EIO=4&transport=polling) is reachable within the
 * Next.js App Router.
 *
 * The actual Socket.IO server is attached to the underlying Node HTTP server
 * via server.ts (custom server) or via the global init pattern in
 * src/lib/socket-server.ts.
 *
 * In development you can run `npm run dev:socket` which starts a small
 * custom Express+Socket.IO server alongside Next.js.
 */
import { NextResponse } from "next/server";

async function handleGET() {
  return NextResponse.json({
    info: "Socket.IO endpoint — connect via socket.io-client at /api/socketio",
    events: [
      "order:status-changed",
      "order:created",
      "kitchen:order-update",
      "kitchen:new-order",
    ],
  });
}

export const GET = withAccess(OPERATIONS, handleGET);
