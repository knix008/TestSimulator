const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = 1420;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end();
      return;
    }
    const type = types[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", "X-MyCalc-Root": encodeURIComponent(root) });
    res.end(data);
  });
});

// Asks whoever holds the port whether it serves this very folder. A server
// left over from an earlier run that was killed does, and can simply be used.
function probe() {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/index.html", timeout: 2000 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        if (res.headers["x-mycalc-root"] === encodeURIComponent(root)) return resolve("same");
        // An older copy of this script sent no header; its page is still ours.
        let ours = false;
        try {
          ours = Buffer.concat(chunks).equals(fs.readFileSync(path.join(root, "index.html")));
        } catch { /* Not readable here, so not provably ours. */ }
        resolve(ours ? "same" : "other");
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve("none"));
  });
}

let borrowing = false;

server.on("error", async (error) => {
  if (error.code !== "EADDRINUSE") {
    console.error(error.message);
    process.exit(1);
  }
  const holder = await probe();
  if (holder === "other") {
    console.error(`Port ${port} is taken by another program, so MyCalc cannot load. Close it and run npm start again.`);
    process.exit(1);
  }
  if (!borrowing) console.log(`MyCalc  http://127.0.0.1:${port} (already running, reusing it)`);
  borrowing = true;
  // tauri dev stops the app when this command ends, so stay up, and take the
  // port over if the other server goes away.
  setTimeout(() => server.listen(port, "127.0.0.1"), 2000);
});

server.on("listening", () => {
  console.log(`MyCalc  http://127.0.0.1:${port}${borrowing ? " (took over)" : ""}`);
});

server.listen(port, "127.0.0.1");
