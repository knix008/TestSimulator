// npm run viewers — direct viewing for the web build. Viewers open http://<this computer>:<port>/ and get
// server/viewer.html; their WebSocket (/ws) and the broadcasting page's (/host, this computer only) are
// joined here, so the WebRTC offer / answer / candidates can pass. Picture and sound never pass through
// this server: they go from the broadcasting page to each viewer directly. The desktop app does the same
// itself (src-tauri/src/viewers.rs).
//
//   node server/viewers.mjs [--port 8790] [--host 0.0.0.0]
//
// Messages to the host:  { ev: 'ready', port, addresses } { ev: 'open', id, addr } { ev: 'message', id, text } { ev: 'close', id }
// Messages from the host: { to, text } (send to viewer `to`), { to, drop: true } (disconnect it)
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { frame, parseFrames } from './relay.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const MAX_TEXT = 64 * 1024;

/** This computer's addresses a viewer can reach (network ones first, then 127.0.0.1). */
export function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address);
  return [...out, '127.0.0.1'];
}

const isLoopback = (addr) => /^(127\.|::1$|::ffff:127\.)/.test(String(addr ?? ''));

function upgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return false; }
  const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  return true;
}

/** Reads text frames from a socket: onText(text), onEnd(). */
function readText(socket, onText, onEnd) {
  let buffer = Buffer.alloc(0);
  let ended = false;
  const end = () => { if (!ended) { ended = true; onEnd(); } };
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > MAX_TEXT * 2) { socket.destroy(); return; }
    const { frames, rest } = parseFrames(buffer);
    buffer = rest;
    for (const f of frames) {
      if (f.opcode === 1 && f.data.length <= MAX_TEXT) onText(f.data.toString('utf8'));
      else if (f.opcode === 8) { try { socket.end(frame(Buffer.from([0x03, 0xe8]), 8)); } catch { /* gone */ } end(); }
      else if (f.opcode === 9) socket.write(frame(f.data, 10));
    }
  });
  socket.on('close', end);
  socket.on('error', end);
}

export function startViewerServer({ port = 8790, host = '0.0.0.0', log = console.log } = {}) {
  const page = fs.readFileSync(path.join(here, 'viewer.html'));
  const viewers = new Map(); // id → socket
  let hostSocket = null;
  let next = 1;
  const toHost = (m) => { try { hostSocket?.write(frame(JSON.stringify(m), 1)); } catch { /* gone */ } };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(page);
      return;
    }
    res.writeHead(url.pathname === '/favicon.ico' ? 204 : 404);
    res.end();
  });
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://x');
    const addr = socket.remoteAddress;
    if (url.pathname === '/host') {
      if (!isLoopback(addr) || !upgrade(req, socket)) { socket.destroy(); return; }
      try { hostSocket?.end(frame(Buffer.from([0x0f, 0xa0]), 8)); } catch { /* gone */ }
      hostSocket = socket;
      toHost({ ev: 'ready', port: server.address().port, addresses: localAddresses() });
      for (const [id, s] of viewers) toHost({ ev: 'open', id, addr: s.remoteAddress });
      readText(socket, (text) => {
        let m; try { m = JSON.parse(text); } catch { return; }
        const v = viewers.get(m.to);
        if (!v) return;
        if (m.drop) { try { v.end(frame(Buffer.from([0x0f, 0xa3]), 8)); } catch { /* gone */ } return; }
        try { v.write(frame(String(m.text ?? ''), 1)); } catch { /* gone */ }
      }, () => { if (hostSocket === socket) hostSocket = null; });
      return;
    }
    if (url.pathname !== '/ws' || !upgrade(req, socket)) { socket.destroy(); return; }
    const id = next++;
    viewers.set(id, socket);
    toHost({ ev: 'open', id, addr });
    readText(socket, (text) => toHost({ ev: 'message', id, text }), () => { viewers.delete(id); toHost({ ev: 'close', id }); });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const p = server.address().port;
      log(`MyBroadcasting direct viewing: ${localAddresses().map((a) => `http://${a}:${p}/`).join('  ')}`);
      resolve({ server, port: p, close: () => new Promise((r) => { for (const s of viewers.values()) s.destroy(); hostSocket?.destroy(); server.close(() => r()); }) });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startViewerServer({ port: Number(arg('port', 8790)), host: arg('host', '0.0.0.0') });
}
