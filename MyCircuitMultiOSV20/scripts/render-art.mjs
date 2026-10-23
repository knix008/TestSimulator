// Renders the program artwork in 3D (scripts/art/art.js, three.js in a
// headless Edge or Chrome) and writes every file the app and installers use:
//   assets/icon.png (512), assets/icons/<n>x<n>.png, assets/icon.ico, assets/icon.icns
//   assets/file-icon.png / .ico / .icns   (document icon)
//   assets/art/hero.png                   (start-page background fallback)
//   build/installerSidebar.bmp (164×314), build/installerHeader.bmp (150×57)
// src-tauri/tauri.conf.json points the Tauri bundle at these files.
//
//   npm run build:art          (MYCIRCUIT_BROWSER=<path> picks the browser)
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import pngToIco from "png-to-ico";

const root = path.resolve(import.meta.dirname, "..");
const BROWSERS = {
  win32: ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"],
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"],
};
const browser = [process.env.MYCIRCUIT_BROWSER, ...(BROWSERS[process.platform] || [])].find((p) => p && fs.existsSync(p));
if (!browser) {
  console.error("render-art: no Edge / Chrome found (set MYCIRCUIT_BROWSER to one)");
  process.exit(1);
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json" };

// ES modules do not load from file://: serve the project folder for the page.
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const pagePort = server.address().port;
const cdpPort = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mycircuit-art-"));
const child = spawn(browser, ["--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "--window-size=1200,1200", `http://127.0.0.1:${pagePort}/scripts/art/index.html`], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function collect() {
  let target = null;
  for (let i = 0; i < 100 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find((t) => t.type === "page" && t.url.includes("/scripts/art/")); } catch { /* starting */ }
    if (!target) await sleep(200);
  }
  if (!target) throw new Error("the browser did not open the art page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } };
  const evaluate = (expression) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true } })); });
  try {
    for (let i = 0; i < 600; i++) {
      const r = await evaluate("window.__art || null");
      const art = r.result && r.result.result && r.result.result.value;
      if (art) return art;
      await sleep(100);
    }
    throw new Error("the art page did not finish in 60 s");
  } finally {
    ws.close();
  }
}

let art;
try {
  art = await collect();
} catch (e) {
  art = { ok: false, error: String(e.message || e) };
} finally {
  child.kill();
  server.close();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* the browser still holds it */ }
}
if (!art.ok) {
  console.error(`render-art: ${art.error}`);
  process.exit(1);
}

if (art.boxes) console.log("boxes", JSON.stringify(art.boxes));
const buf = (url) => Buffer.from(url.split(",")[1], "base64");
const write = (rel, data) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
  return p;
};

// ICNS: PNG-based entries (macOS 10.7+).
function icns(entries) {
  const parts = entries.map(([type, png]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

// 24-bit BMP (what NSIS wants for its wizard images), box-filtered to size.
function bmpFromPng(pngBuf, w, h) {
  const src = PNG.sync.read(pngBuf);
  const out = Buffer.alloc(54 + w * h * 3 + h * ((4 - ((w * 3) % 4)) % 4));
  const rowPad = (4 - ((w * 3) % 4)) % 4;
  out.write("BM", 0, "ascii");
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(w, 18);
  out.writeInt32LE(h, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(out.length - 54, 34);
  const sx = src.width / w;
  const sy = src.height / h;
  let o = 54;
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy); yy++) {
        for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx); xx++) {
          const i = (yy * src.width + xx) * 4;
          const a = src.data[i + 3] / 255;
          // Composite over the brand navy so transparent pixels look right.
          r += src.data[i] * a + 16 * (1 - a);
          g += src.data[i + 1] * a + 36 * (1 - a);
          b += src.data[i + 2] * a + 58 * (1 - a);
          n++;
        }
      }
      out[o++] = Math.round(b / n);
      out[o++] = Math.round(g / n);
      out[o++] = Math.round(r / n);
    }
    o += rowPad;
  }
  return out;
}

const icons = Object.fromEntries(Object.entries(art.icons).map(([k, v]) => [+k, buf(v)]));
const docs = Object.fromEntries(Object.entries(art.doc).map(([k, v]) => [+k, buf(v)]));
write("assets/icon.png", icons[512]);
for (const n of [16, 24, 32, 48, 64, 128, 256, 512]) write(`assets/icons/${n}x${n}.png`, icons[n]);
write("assets/icon.ico", await pngToIco([16, 24, 32, 48, 64, 128, 256].map((n) => icons[n])));
write("assets/icon.icns", icns([["icp4", icons[16]], ["icp5", icons[32]], ["icp6", icons[64]], ["ic07", icons[128]], ["ic08", icons[256]], ["ic09", icons[512]], ["ic10", icons[1024]]]));
write("assets/file-icon.png", docs[256]);
write("assets/file-icon.ico", await pngToIco([16, 24, 32, 48, 64, 128, 256].map((n) => docs[n])));
write("assets/file-icon.icns", icns([["icp4", docs[16]], ["icp5", docs[32]], ["icp6", docs[64]], ["ic07", docs[128]], ["ic08", docs[256]], ["ic09", docs[512]]]));
write("assets/art/hero.png", buf(art.hero));
write("build/installerSidebar.bmp", bmpFromPng(buf(art.sidebar), 164, 314));
write("build/installerHeader.bmp", bmpFromPng(buf(art.header), 150, 57));
console.log("render-art: icons, document icon, hero image and installer bitmaps written");
