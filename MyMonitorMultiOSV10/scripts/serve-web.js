"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { buildWeb } = require("./build-web");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".map": "application/json"
};

function createWebServer(options = {}) {
  const root = options.root || path.join(__dirname, "..");
  const dist = options.dist || path.join(root, "web", "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    buildWeb({ root, dest: dist });
  }

  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const file = path.normalize(path.join(dist, rel));
    if (!file.startsWith(path.normalize(dist))) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
}

function listenWeb(options = {}) {
  const port = options.port !== undefined ? Number(options.port) : Number(process.env.PORT || 9520);
  const host = options.host || "127.0.0.1";
  const server = createWebServer(options);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const bound = typeof addr === "object" && addr ? addr.port : port;
      const url = `http://${host}:${bound}/`;
      console.log(`[web] ${url}`);
      resolve({ server, url, port: bound, host });
    });
  });
}

if (require.main === module) {
  listenWeb().catch((err) => {
    console.error(`[web] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { createWebServer, listenWeb };
