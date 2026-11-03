/* `npm start`: the desktop app running the code as it is on disk right now.
 *
 * The pages are served straight from the project folder by a small static server on a free
 * port (free on IPv4 and IPv6, never another program's server), and `tauri dev` points the
 * windows at it, so every window — and every reload — shows the latest files; the Rust host
 * is rebuilt by tauri dev when it changes. Nothing is embedded, so nothing can be stale. */
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const FIRST_PORT = 47820;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/* Only what the app itself loads; tests, samples and node_modules are not served. */
const SERVED = new Set(["index.html", "popup.html", "menu.html", "guide.html", "style", "src", "assets", "guide"]);

function canListen(port, host) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (error) => resolve(error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT"));
    probe.listen({ port: port, host: host, exclusive: true }, () => probe.close(() => resolve(true)));
  });
}

/* A port nothing listens on, on 127.0.0.1 nor on ::1 (a machine without IPv6 counts as free there). */
async function freePort(start) {
  for (let port = start; port < start + 200; port += 1) {
    if ((await canListen(port, "127.0.0.1")) && (await canListen(port, "::1"))) return port;
  }
  throw new Error("No free port between " + start + " and " + (start + 199) + ".");
}

function serve(port) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname).replace(/^\/+/, "");
    if (!rel) rel = "index.html";
    const file = path.normalize(path.join(root, rel));
    const top = rel.split(/[\\/]/)[0];
    if (!file.startsWith(root + path.sep) || !SERVED.has(top)) {
      res.writeHead(404);
      res.end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const port = await freePort(Number(process.env.MYPAINT_DEV_PORT) || FIRST_PORT);
  const server = await serve(port);
  const url = "http://127.0.0.1:" + port;
  const config = path.join(os.tmpdir(), "mypaint-tauri-dev-" + process.pid + ".json");
  fs.writeFileSync(config, JSON.stringify({ build: { devUrl: url } }));
  console.log("MyPaint pages: " + url);
  const cli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
  const child = spawn(process.execPath, [cli, "dev", "--config", config].concat(process.argv.slice(2)), { cwd: root, stdio: "inherit" });
  const finish = (code) => {
    try { fs.unlinkSync(config); } catch (error) { /* already gone */ }
    server.close();
    process.exit(code == null ? 0 : code);
  };
  child.on("exit", finish);
  process.on("SIGINT", () => child.kill("SIGINT"));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { freePort: freePort };
