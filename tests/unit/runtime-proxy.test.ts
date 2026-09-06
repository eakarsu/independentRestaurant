import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('UI proxy forwards auth HTTP responses and the development WebSocket upgrade', { timeout: 15000 }, async () => {
  const upstreamSockets = new Set<import('node:stream').Duplex>();
  const backend = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'test-session=fixture; Path=/; HttpOnly' });
    res.end(JSON.stringify({ path: req.url, method: req.method, body: Buffer.concat(chunks).toString() }));
  });
  backend.on('upgrade', (req, socket, head) => {
    upstreamSockets.add(socket);
    socket.on('close', () => upstreamSockets.delete(socket));
    assert.equal(req.url, '/_next/webpack-hmr');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nconnected');
    if (head.length) socket.write(head);
    socket.on('data', data => socket.write(data));
    socket.on('error', () => socket.destroy());
  });
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const backendPort = (backend.address() as net.AddressInfo).port;
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const uiPort = (reservation.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const proxy = spawn(process.execPath, [fileURLToPath(new URL('../../scripts/runtime-proxy.mjs', import.meta.url))], {
    env: { ...process.env, API_PORT: String(backendPort), UI_PORT: String(uiPort) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let socket: net.Socket | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      proxy.once('error', reject);
      proxy.once('exit', code => reject(new Error(`Proxy exited before startup: ${code}`)));
      proxy.stdout.on('data', chunk => { if (String(chunk).includes('UI proxy listening')) resolve(); });
    });
    const response = await fetch(`http://127.0.0.1:${uiPort}/api/auth/session`, {
      method: 'POST', body: 'fixture', headers: { connection: 'close' },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') || '', /test-session=fixture/);
    assert.deepEqual(await response.json(), { path: '/api/auth/session', method: 'POST', body: 'fixture' });
    socket = net.connect(uiPort, '127.0.0.1');
    await once(socket, 'connect');
    const client = socket;
    await new Promise<void>((resolve, reject) => {
      let received = '', sentPing = false;
      client.on('error', reject);
      client.on('data', chunk => {
        received += chunk.toString();
        if (received.includes('connected') && !sentPing) {
          assert.match(received, /101 Switching Protocols/);
          sentPing = true;
          client.write('ping-through-proxy');
        }
        if (received.includes('ping-through-proxy')) resolve();
      });
      client.write(`GET /_next/webpack-hmr HTTP/1.1\r\nHost: 127.0.0.1:${uiPort}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`);
    });
  } finally {
    socket?.destroy();
    for (const upstream of upstreamSockets) upstream.destroy();
    const exited = once(proxy, 'exit');
    proxy.kill('SIGTERM');
    await exited;
    backend.closeAllConnections();
    await new Promise<void>(resolve => backend.close(() => resolve()));
  }
});
