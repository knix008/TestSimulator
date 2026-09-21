"use strict";

const http = require("http");
const https = require("https");
const net = require("net");
const { loadTlsCerts } = require("./tls-certs");
const { parseHttpPayload } = require("./protocol");

function cors(res, extra) {
  res.writeHead(extra.status || 204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Connection": "close",
    ...(extra.headers || {})
  });
}

function readBody(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function createHandler(onPayload) {
  return async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        cors(res, { status: 204 });
        res.end();
        return;
      }
      const url = req.url || "/";
      const pathOnly = url.split("?")[0];
      if (req.method === "GET" && (pathOnly === "/" || pathOnly === "/health" || pathOnly === "/metrics")) {
        cors(res, {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
        res.end(JSON.stringify({ ok: true, ingest: "push", tls: true }));
        return;
      }
      if (req.method === "POST" || req.method === "PUT") {
        const body = await readBody(req);
        const parsed = parseHttpPayload(body, req.headers["content-type"]);
        if (!parsed) {
          cors(res, { status: 400, headers: { "Content-Type": "text/plain" } });
          res.end("bad payload");
          return;
        }
        const peer = {
          address: req.socket && req.socket.remoteAddress,
          agentId: req.headers["x-mmon-id"] || (parsed.hello && parsed.hello.hostname) || null
        };
        onPayload({ parsed, peer });
        cors(res, { status: 204 });
        res.end();
        return;
      }
      cors(res, { status: 404, headers: { "Content-Type": "text/plain" } });
      res.end("not found");
    } catch (err) {
      cors(res, { status: 500, headers: { "Content-Type": "text/plain" } });
      res.end(err.message || "error");
    }
  };
}

function createIngestServer(onPayload, options = {}) {
  const handler = createHandler(onPayload);
  const httpServer = http.createServer(handler);
  const tls = options.tls === false ? null : options.tls || loadTlsCerts();
  const httpsServer = tls ? https.createServer(tls, handler) : null;
  const server = net.createServer((socket) => {
    socket.once("error", () => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    });
    socket.once("readable", () => {
      const buf = socket.read(1);
      if (!buf || !buf.length) {
        socket.destroy();
        return;
      }
      socket.unshift(buf);
      if (httpsServer && buf[0] === 0x16) httpsServer.emit("connection", socket);
      else httpServer.emit("connection", socket);
    });
  });
  server._http = httpServer;
  server._https = httpsServer;
  const innerClose = server.close.bind(server);
  server.close = (cb) => {
    try {
      httpServer.close();
    } catch {
      /* ignore */
    }
    try {
      if (httpsServer) httpsServer.close();
    } catch {
      /* ignore */
    }
    return innerClose(cb);
  };
  return server;
}

function listenIngest(onPayload, options = {}) {
  const host = options.host || "0.0.0.0";
  const parsed = Number(options.port);
  const port = options.port === 0 || parsed === 0 ? 0 : Number.isFinite(parsed) && parsed > 0 ? parsed : 9511;
  const server = createIngestServer(onPayload, options);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ server, host: addr.address, port: addr.port });
    });
  });
}

module.exports = { createIngestServer, listenIngest, createHandler };
