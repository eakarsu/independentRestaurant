import http from "node:http";
import net from "node:net";

const targetPort = Number(process.env.API_PORT);
const listenPort = Number(process.env.UI_PORT);
if (!Number.isInteger(targetPort) || !Number.isInteger(listenPort) || targetPort === listenPort) {
  throw new Error("distinct numeric ports are required");
}

const server = http.createServer((request, response) => {
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: targetPort,
    path: request.url,
    method: request.method,
    headers: { ...request.headers, host: `127.0.0.1:${targetPort}` },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Application is starting" }));
  });
  request.pipe(upstream);
});

// Next's development client needs the HMR WebSocket before hydration completes.
// Forward upgrades as well as ordinary HTTP requests through the UI port.
server.on("upgrade", (request, socket, head) => {
  const upstream = net.connect(targetPort, "127.0.0.1", () => {
    const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`];
    for (let i = 0; i < request.rawHeaders.length; i += 2) {
      const name = request.rawHeaders[i];
      const value = name.toLowerCase() === "host" ? `127.0.0.1:${targetPort}` : request.rawHeaders[i + 1];
      lines.push(`${name}: ${value}`);
    }
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
  upstream.on("close", () => socket.destroy());
});

server.listen(listenPort, "127.0.0.1", () => {
  console.log(`UI proxy listening on http://127.0.0.1:${listenPort}`);
});
