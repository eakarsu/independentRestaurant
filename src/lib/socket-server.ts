/**
 * Socket.IO singleton server.
 *
 * Next.js App Router doesn't natively support WebSockets, so we attach
 * a Socket.IO server to the underlying Node HTTP server on first import.
 * The server is stored on `globalThis` to survive Hot Module Replacement.
 *
 * Usage:
 *   import { getIO } from "@/lib/socket-server";
 *   getIO().emit("order:status-changed", { orderId, status });
 *
 * Clients subscribe to:
 *   - "order:status-changed"  { orderId, orderNumber, status, previousStatus }
 *   - "order:created"         { orderId, orderNumber, type }
 *
 * Kitchen Display System (KDS) can join the "kitchen" room and receive
 * only orders whose status has entered PREPARING or READY.
 */

import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";

declare global {
  // eslint-disable-next-line no-var
  var __socketIO: SocketIOServer | undefined;
}

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  if (globalThis.__socketIO) return globalThis.__socketIO;

  const io = new SocketIOServer(httpServer, {
    path: "/api/socketio",
    addTrailingSlash: false,
    cors: {
      origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("[Socket.IO] client connected:", socket.id);

    // Kitchen Display System subscribes to the "kitchen" room
    socket.on("join:kitchen", () => {
      socket.join("kitchen");
      console.log("[Socket.IO] client joined kitchen room:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("[Socket.IO] client disconnected:", socket.id);
    });
  });

  globalThis.__socketIO = io;
  console.log("[Socket.IO] server initialised");
  return io;
}

/**
 * Get the running Socket.IO instance. Returns undefined if the server
 * hasn't been initialised yet (e.g. during static generation).
 */
export function getIO(): SocketIOServer | undefined {
  return globalThis.__socketIO;
}

/**
 * Emit an order status change event to all connected clients.
 * Also emits to the "kitchen" room when the status is PREPARING or READY.
 */
export function emitOrderStatusChanged(payload: {
  orderId: string;
  orderNumber: string;
  status: string;
  previousStatus: string;
  type?: string;
}) {
  const io = getIO();
  if (!io) return;

  io.emit("order:status-changed", payload);

  // KDS-specific events
  if (payload.status === "PREPARING" || payload.status === "READY") {
    io.to("kitchen").emit("kitchen:order-update", payload);
  }
}

export function emitOrderCreated(payload: {
  orderId: string;
  orderNumber: string;
  type: string;
  total: number;
}) {
  const io = getIO();
  if (!io) return;
  io.emit("order:created", payload);
  io.to("kitchen").emit("kitchen:new-order", payload);
}
