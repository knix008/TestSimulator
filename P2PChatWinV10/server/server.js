import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_DIR = path.join(__dirname, 'admin');

const PORT = Number(process.env.PORT) || 8787;
const MAX_PEERS_PER_ROOM = 2;

/** @type {Map<string, { id: string, name: string, createdAt: number }>} */
const roomRegistry = new Map();

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const rooms = new Map();

const STATIC_FILES = new Set(['index.html', 'styles.css', 'app.js']);

/** 브라우저가 자동 요청 — 본문 없이 204로 조용히 처리 */
const NO_BODY_OK = new Set([
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
]);

function isGetOrHead(method) {
  return method === 'GET' || method === 'HEAD';
}

function buildRoomList() {
  return [...roomRegistry.values()].map((meta) => ({
    id: meta.id,
    name: meta.name,
    createdAt: meta.createdAt,
    peerCount: rooms.get(meta.id)?.size ?? 0,
  }));
}

function broadcastLobbyRoomList() {
  const payload = JSON.stringify({ type: 'room-list', rooms: buildRoomList() });
  for (const client of wss.clients) {
    if (client.readyState === 1 && !client.signalRoomId) {
      client.send(payload);
    }
  }
}

function broadcast(roomId, message, except) {
  const peers = rooms.get(roomId);
  if (!peers) return;
  const payload = JSON.stringify(message);
  for (const peer of peers) {
    if (peer !== except && peer.readyState === 1) {
      peer.send(payload);
    }
  }
}

function leaveRoom(ws) {
  const roomId = ws.signalRoomId;
  if (!roomId) return;
  if (!rooms.has(roomId)) {
    ws.signalRoomId = null;
    return;
  }
  const peers = rooms.get(roomId);
  peers.delete(ws);
  broadcast(roomId, { type: 'peer-left', roomId }, null);
  if (peers.size === 0) rooms.delete(roomId);
  ws.signalRoomId = null;
}

/**
 * @param {string} rawName
 */
function createRoomRecord(rawName) {
  const trimmed = typeof rawName === 'string' ? rawName.trim().slice(0, 64) : '';
  const id = randomUUID();
  const name = trimmed || `방 ${id.slice(0, 8)}`;
  const meta = { id, name, createdAt: Date.now() };
  roomRegistry.set(id, meta);
  broadcastLobbyRoomList();
  return meta;
}

/**
 * @param {string} roomId
 */
function deleteRoom(roomId) {
  if (!roomRegistry.has(roomId)) return false;
  const peerSet = rooms.get(roomId);
  const payload = JSON.stringify({ type: 'room-deleted', roomId });
  if (peerSet) {
    for (const peer of peerSet) {
      if (peer.readyState === 1) {
        peer.send(payload);
      }
      peer.signalRoomId = null;
    }
    rooms.delete(roomId);
  }
  roomRegistry.delete(roomId);
  broadcastLobbyRoomList();
  return true;
}

/**
 * @param {import('http').IncomingMessage} req
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} fileName
 * @param {string} contentType
 */
function sendAdminFile(req, res, fileName, contentType) {
  if (!STATIC_FILES.has(fileName)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const abs = path.join(ADMIN_DIR, fileName);
  fs.readFile(abs, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': data.length,
      });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || 'localhost';
  let pathname = '/';
  try {
    pathname = new URL(req.url || '/', `http://${host}`).pathname;
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  if (pathname === '/admin' || pathname === '/admin/') {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  if (isGetOrHead(req.method) && NO_BODY_OK.has(pathname)) {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && pathname === '/api/rooms') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        rooms: buildRoomList(),
        signalingConnections: wss.clients.size,
      }),
    );
    return;
  }

  if (req.method === 'POST' && pathname === '/api/rooms') {
    try {
      const body = await readJsonBody(req);
      const meta = createRoomRecord(body.name);
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ room: meta }));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/rooms/')) {
    const id = decodeURIComponent(pathname.slice('/api/rooms/'.length)).trim();
    if (!id || id.includes('/') || id.includes('..')) {
      res.writeHead(400);
      res.end();
      return;
    }
    const ok = deleteRoom(id);
    if (!ok) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    res.writeHead(204);
    res.end();
    return;
  }

  if (isGetOrHead(req.method) && (pathname === '/' || pathname === '/index.html')) {
    sendAdminFile(req, res, 'index.html', 'text/html; charset=utf-8');
    return;
  }

  if (isGetOrHead(req.method) && pathname === '/styles.css') {
    sendAdminFile(req, res, 'styles.css', 'text/css; charset=utf-8');
    return;
  }

  if (isGetOrHead(req.method) && pathname === '/app.js') {
    sendAdminFile(req, res, 'app.js', 'application/javascript; charset=utf-8');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Not found: ${pathname}`);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (String(request.headers.upgrade).toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  ws.signalRoomId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'list-rooms') {
      ws.send(JSON.stringify({ type: 'room-list', rooms: buildRoomList() }));
      return;
    }

    if (msg.type === 'create-room') {
      const rawName = typeof msg.name === 'string' ? msg.name : '';
      const meta = createRoomRecord(rawName);
      ws.send(JSON.stringify({ type: 'room-created', room: meta }));
      return;
    }

    if (msg.type === 'leave-room') {
      if (ws.signalRoomId) {
        leaveRoom(ws);
        ws.send(JSON.stringify({ type: 'left-room' }));
      }
      return;
    }

    if (msg.type === 'join' && typeof msg.roomId === 'string') {
      const id = msg.roomId.trim().slice(0, 128);
      if (!id) {
        ws.send(JSON.stringify({ type: 'error', message: '잘못된 방입니다.' }));
        return;
      }
      if (!roomRegistry.has(id)) {
        ws.send(JSON.stringify({ type: 'error', message: '존재하지 않는 방입니다.' }));
        return;
      }
      if (ws.signalRoomId === id) {
        return;
      }
      if (ws.signalRoomId) {
        leaveRoom(ws);
      }
      if (!rooms.has(id)) rooms.set(id, new Set());
      const peers = rooms.get(id);
      if (peers.size >= MAX_PEERS_PER_ROOM) {
        ws.send(JSON.stringify({ type: 'error', message: '방이 가득 찼습니다.' }));
        return;
      }
      peers.add(ws);
      ws.signalRoomId = id;
      const isInitiator = peers.size === 1;
      ws.send(
        JSON.stringify({
          type: 'joined',
          roomId: id,
          isInitiator,
          peerCount: peers.size,
        }),
      );
      broadcast(id, { type: 'peer-joined', roomId: id }, ws);
      return;
    }

    if (!ws.signalRoomId) return;

    const forwardTypes = new Set(['offer', 'answer', 'ice-candidate']);
    if (!forwardTypes.has(msg.type)) return;

    broadcast(ws.signalRoomId, msg, ws);
  });

  ws.on('close', () => {
    leaveRoom(ws);
  });
});

server.listen(PORT, () => {
  console.log(`관리 GUI: http://localhost:${PORT}/`);
  console.log(`WebSocket 시그널: ws://localhost:${PORT}`);
});
