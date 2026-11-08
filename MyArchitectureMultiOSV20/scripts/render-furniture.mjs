// Renders the furniture library with the app's 3D builder in a headless Edge
// or Chrome (scripts/furniture/render.js):
//
//   npm run build:furniture                       library thumbnails →
//       assets/furniture/thumbs.webp (one sprite) + assets/furniture/thumbs.json
//   node scripts/render-furniture.mjs --sheet out.png [--kinds a,b] [--size 360x300] [--cols 6]
//       a labelled review sheet of some or all items
//
// MYARCH_BROWSER=<path> picks the browser.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opt = (name, dv) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dv; };
const sheet = opt("--sheet", null);
const [cw, ch] = (opt("--size", sheet ? "300x250" : "160x128")).split("x").map(Number);
const cols = +opt("--cols", sheet ? 6 : 16);
const kindsArg = opt("--kinds", "");
const dirArg = opt("--dir", "");

const BROWSERS = {
  win32: ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"],
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"],
};
const browser = [process.env.MYARCH_BROWSER, ...(BROWSERS[process.platform] || [])].find((p) => p && fs.existsSync(p));
if (!browser) { console.error("render-furniture: no Edge / Chrome found (set MYARCH_BROWSER)"); process.exit(1); }
const MIME = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".webp": "image/webp" };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const pagePort = server.address().port;
const cdpPort = 9700 + Math.floor(Math.random() * 250);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "myarch-furn-"));
const q = new URLSearchParams({ w: String(cw), h: String(ch), bg: sheet ? "#f4f3f0" : "transparent" });
if (kindsArg) q.set("kinds", kindsArg);
if (dirArg) q.set("dir", dirArg);
const url = `http://127.0.0.1:${pagePort}/scripts/furniture/index.html?${q}`;
const child = spawn(browser, ["--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=800,600", url], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let result;
try {
  let target = null;
  for (let i = 0; i < 100 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find((t) => t.type === "page" && t.url.includes("/scripts/furniture/")); } catch { /* starting */ }
    if (!target) await sleep(200);
  }
  if (!target) throw new Error("the browser did not open the render page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } };
  const evaluate = (expression) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } })); });
  const t0 = Date.now();
  for (;;) {
    const r = await evaluate("window.__renders ? JSON.stringify({ ok: window.__renders.ok, error: window.__renders.error, n: Object.keys(window.__renders.items || {}).length }) : null");
    const v = r.result && r.result.result && r.result.result.value;
    if (v) { const s = JSON.parse(v); if (!s.ok) throw new Error(s.error); break; }
    if (Date.now() - t0 > 600000) throw new Error("rendering did not finish in 10 minutes");
    await sleep(300);
  }
  // Compose the sprite / sheet in the page.
  const compose = `(async () => {
    const R = window.__renders, kinds = Object.keys(R.items), cols = ${cols}, cw = ${cw}, ch = ${ch}, sheet = ${sheet ? "true" : "false"};
    const { furnitureDef } = await import("/src/lib/furniture.js");
    const lab = sheet ? 34 : 0;
    const rows = Math.ceil(kinds.length / cols);
    const c = document.createElement("canvas"); c.width = cols * cw; c.height = rows * (ch + lab);
    const g = c.getContext("2d");
    if (sheet) { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
    const index = {};
    for (let i = 0; i < kinds.length; i++) {
      const img = new Image(); img.src = R.items[kinds[i]]; await img.decode();
      const x = (i % cols) * cw, y = Math.floor(i / cols) * (ch + lab);
      g.drawImage(img, x, y);
      index[kinds[i]] = i;
      if (sheet) { const d = furnitureDef(kinds[i]); g.fillStyle = "#222"; g.font = "bold 13px Segoe UI"; g.fillText(kinds[i], x + 6, y + ch + 14); g.font = "12px Segoe UI"; g.fillStyle = "#666"; g.fillText((d.cat + " · " + d.name).slice(0, 44), x + 6, y + ch + 29); g.strokeStyle = "#ddd"; g.strokeRect(x + 0.5, y + 0.5, cw - 1, ch + lab - 1); }
    }
    return JSON.stringify({ data: c.toDataURL(sheet ? "image/png" : "image/webp", 0.9), index, cols, cw, ch });
  })()`;
  const r = await evaluate(compose);
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  result = JSON.parse(r.result.result.value);
  ws.close();
} finally {
  child.kill();
  server.close();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still held */ }
}

const buf = Buffer.from(result.data.split(",")[1], "base64");
if (sheet) {
  fs.mkdirSync(path.dirname(path.resolve(sheet)), { recursive: true });
  fs.writeFileSync(path.resolve(sheet), buf);
  console.log(`sheet: ${path.resolve(sheet)} (${Object.keys(result.index).length} items)`);
} else {
  const dir = path.join(root, "assets", "furniture");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "thumbs.webp"), buf);
  fs.writeFileSync(path.join(dir, "thumbs.json"), JSON.stringify({ cols: result.cols, w: result.cw, h: result.ch, index: result.index }) + "\n");
  console.log(`thumbnails: ${Object.keys(result.index).length} items → assets/furniture/thumbs.webp (${(buf.length / 1024).toFixed(0)} KB)`);
}
