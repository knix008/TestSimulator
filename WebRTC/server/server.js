const fs = require("fs");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const GUI_DIR = path.join(__dirname, "gui");
const rooms = new Map();
const adminSockets = new Set();

function getRoomStats() {
  return Array.from(rooms.entries()).map(([roomId, peers]) => ({
    roomId,
    peerCount: peers.size,
  }));
}

function broadcastAdminEvent(message, extra = {}) {
  const payload = JSON.stringify({
    type: "admin-event",
    data: {
      message,
      timestamp: new Date().toISOString(),
      rooms: getRoomStats(),
      ...extra,
    },
  });

  for (const admin of adminSockets) {
    if (admin.readyState === WebSocket.OPEN) {
      admin.send(payload);
    }
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function serveGuiFile(res, filePath, contentType) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 500, { error: "Failed to load server GUI" });
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.url === "/api/rooms") {
    sendJson(res, 200, { rooms: getRoomStats() });
    return;
  }

  if (req.url === "/" || req.url === "/index.html") {
    serveGuiFile(res, path.join(GUI_DIR, "index.html"), "text/html; charset=utf-8");
    return;
  }

  if (req.url === "/styles.css") {
    serveGuiFile(res, path.join(GUI_DIR, "styles.css"), "text/css; charset=utf-8");
    return;
  }

  if (req.url === "/app.js") {
    serveGuiFile(res, path.join(GUI_DIR, "app.js"), "application/javascript; charset=utf-8");
    return;
  }

  sendJson(res, 404, { error: "Not Found" });
});

const wss = new WebSocket.Server({ server });

function joinRoom(roomId, ws) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(ws);
}

function leaveRoom(roomId, ws) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  room.delete(ws);
  if (room.size === 0) {
    rooms.delete(roomId);
  }
}

function broadcastToRoom(roomId, sender, payload) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  for (const client of room) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  }
}

wss.on("connection", (ws) => {
  ws.roomId = null;

  ws.on("message", (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch (_error) {
      return;
    }

    const { type, roomId, data } = message;

    if (type === "admin-subscribe") {
      ws.isAdmin = true;
      adminSockets.add(ws);
      ws.send(
        JSON.stringify({
          type: "admin-snapshot",
          data: {
            rooms: getRoomStats(),
          },
        }),
      );
      return;
    }

    if (type === "join" && roomId) {
      if (ws.roomId) {
        leaveRoom(ws.roomId, ws);
      }
      ws.roomId = roomId;
      joinRoom(roomId, ws);
      ws.send(JSON.stringify({ type: "joined", roomId }));
      broadcastToRoom(roomId, ws, { type: "peer-joined" });
      broadcastAdminEvent("peer joined room", { roomId });
      return;
    }

    if (!ws.roomId) {
      return;
    }

    if (type === "signal") {
      broadcastToRoom(ws.roomId, ws, { type: "signal", data });
      broadcastAdminEvent("signal relayed", { roomId: ws.roomId });
      return;
    }

    if (type === "track-state") {
      broadcastToRoom(ws.roomId, ws, { type: "track-state", data });
      broadcastAdminEvent("track state changed", { roomId: ws.roomId, track: data });
    }
  });

  ws.on("close", () => {
    if (ws.isAdmin) {
      adminSockets.delete(ws);
    }
    if (!ws.roomId) {
      return;
    }
    const currentRoomId = ws.roomId;
    leaveRoom(currentRoomId, ws);
    broadcastToRoom(currentRoomId, ws, { type: "peer-left" });
    broadcastAdminEvent("peer left room", { roomId: currentRoomId });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server GUI: http://localhost:${PORT}`);
  console.log(`Signaling WS: ws://localhost:${PORT}`);
});
