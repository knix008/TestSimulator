// `npm run start:web`: serves src/ as the browser build on a free port (127.0.0.1 and ::1 checked).
// The page then encodes with qrcore.wasm instead of the native Rust command.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freePort } from "./free-port.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = await freePort(Number(process.env.PORT) || 4180);
  createServer().listen(port, "127.0.0.1", () => console.log(`QRGenerator (web): http://127.0.0.1:${port}/`));
}
