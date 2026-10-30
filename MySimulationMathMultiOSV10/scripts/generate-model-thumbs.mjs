// npm run generate:models — regenerates the start page thumbnails of the
// example models (public/models/<id>.webp, 640×256 = 320×128 at 2×) from the
// real diagrams.
//
// How: every example of src/lib/modelSamples.js is built in Node by the real
// engine (its M code: new_system / add_block / add_line); the model is then
// drawn in headless Chrome / Edge with the model editor's own renderer
// (src/sim/render.js: lineGeometry, drawLines, drawBlock), fitted to the
// thumbnail, on a transparent background so it reads in dark
// and light themes (blocks in their library group colour, wires in the colour
// of their source block). The page comes from the Vite dev server on a free port with
// its own settings and work folder in a temporary directory (MSM_USER_DATA,
// MSM_ROOT — the user's real settings and files are never touched).
//
// Options:  --only id1,id2   regenerate some models
//           --browser PATH   Chrome / Edge executable (or env CHROME)
//           --keep           keep the temporary folder (for debugging)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from './dev-port.mjs';
import { MODEL_SAMPLES } from '../src/lib/modelSamples.js';
import { createSession } from '../core/session.js';
import { simState } from '../core/sim/state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'models');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const only = opt('--only') ? new Set(opt('--only').split(',')) : null;
const keep = args.includes('--keep');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const c = [opt('--browser'), process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const hit = c.find((p) => p && fs.existsSync(p));
  if (!hit) throw new Error('No Chrome / Edge found: pass --browser PATH or set CHROME.');
  return hit;
}
const anyPort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

/** The example models built by the engine: [{ id, model }]. */
function buildModels(list) {
  const s = createSession({ host: { post() {}, request() { return null; } } });
  return list.map((m) => {
    const r = s.evaluate(m.code);
    if (!r.ok) throw new Error(`${m.id}: ${r.error && r.error.message}`);
    return { id: m.id, model: JSON.parse(JSON.stringify(simState(s.ctx).models.get(m.model).model)) };
  });
}

// ------------------------------------------------------------------ page side
// window.__modelThumb(model) → base64 WebP of the root diagram, fitted with a margin.
const PAGE = String.raw`
(async () => {
  const R = await import('/src/sim/render.js');
  const { blockDef } = await import('/core/sim/blocks/index.js');
  const W = 640, H = 256, PAD = 14;
  // block colour by library group (saturated mid tones: they read on dark and light themes)
  const GROUP = {
    sources: '#2f9e44', sinks: '#1c7ed6', continuous: '#7048e8', discrete: '#0c8599', math: '#e8590c', logic: '#f08c00',
    discont: '#e03131', lookup: '#9c36b5', routing: '#c2255c', ports: '#5c7cfa', userfn: '#4263eb', attributes: '#868e96', verification: '#66a80f',
  };
  const colorOf = (b) => { const d = b && blockDef(b.type); return (d && GROUP[d.group]) || '#868e96'; };
  const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + a + ')'; };
  const colors = {
    fg: '#8793a3', block: 'rgba(141, 152, 168, 0.13)', accent: '#3fa7e0', muted: '#8a95a5', strong: '#8a95a5', danger: '#e05a5a', ok: '#3fb37f',
    bg: 'rgba(0, 0, 0, 0)', canvas: 'rgba(0, 0, 0, 0)', grid: 'rgba(0, 0, 0, 0)', gridMajor: 'rgba(0, 0, 0, 0)', panel: 'rgba(0, 0, 0, 0)', elev: 'rgba(0, 0, 0, 0)',
    ruler: 'rgba(0, 0, 0, 0)', rulerText: '#8a95a5', border: '#8a95a5',
  };
  window.__modelThumb = async (model) => {
    const sys = model.root;
    const byId = new Map(sys.blocks.map((b) => [b.id, b]));
    const geo = R.lineGeometry(sys, byId);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const b of sys.blocks) { grow(b.x - 6, b.y - 6); grow(b.x + b.w + 6, b.y + b.h + (b.showName === false ? 6 : 20)); }
    for (const g of geo) for (const p of g.pts || []) grow(p.x !== undefined ? p.x : p[0], p.y !== undefined ? p.y : p[1]);
    const z = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0), 2.6);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    // a model scaled down keeps readable strokes and labels: line widths and font
    // sizes set by the renderer (in model units) are enlarged by the zoom-out factor
    const kLine = Math.max(1.6, 1.7 / z), kFont = Math.min(1.5, Math.max(1, 0.9 / z));
    const lw = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'lineWidth');
    const ft = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
    Object.defineProperty(ctx, 'lineWidth', { get() { return lw.get.call(this) / kLine; }, set(v) { lw.set.call(this, v * kLine); } });
    Object.defineProperty(ctx, 'font', { get() { return ft.get.call(this); }, set(v) { ft.set.call(this, String(v).replace(/([\d.]+)px/, (m, n) => (Number(n) * kFont).toFixed(1) + 'px')); } });
    ctx.setTransform(z, 0, 0, z, (W - (x1 - x0) * z) / 2 - x0 * z, (H - (y1 - y0) * z) / 2 - y0 * z);
    // wires in the colour of the block they come from, blocks in their group colour with a tinted fill
    for (const g of geo) R.drawLines(ctx, [g], { colors: { ...colors, fg: colorOf(byId.get(g.line.src.block)) }, selected: new Set() });
    for (const b of sys.blocks) {
      const col = colorOf(b);
      R.drawBlock(ctx, { ...b, fg: col, bg: tint(col, 0.22) }, { colors, selected: false, zoom: z, values: null, error: false, hotHandle: -1 });
    }
    const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.92));
    const u = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  return 1;
})()
`;

// ------------------------------------------------------------------ run
async function main() {
  const list = MODEL_SAMPLES.filter((m) => !only || only.has(m.id));
  const built = buildModels(list);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'msm-model-thumbs-'));
  const env = { ...process.env, MSM_USER_DATA: path.join(tmp, 'userdata'), MSM_ROOT: path.join(tmp, 'work') };
  fs.mkdirSync(env.MSM_USER_DATA, { recursive: true });
  fs.mkdirSync(env.MSM_ROOT, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const port = await freeDevPort(5300);
  const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env, stdio: 'ignore' });
  const cdpPort = await anyPort();
  const browser = spawn(findBrowser(), ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${path.join(tmp, 'browser')}`, '--window-size=1000,700',
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  const stop = () => { try { browser.kill(); } catch { /* gone */ } try { vite.kill(); } catch { /* gone */ } if (!keep) setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 800); };
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch { /* starting */ } await sleep(200); }
    let ws;
    for (let i = 0; i < 50 && !ws; i++) {
      try { const pg = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((t) => t.type === 'page'); if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl); } catch { /* starting */ }
      if (!ws) await sleep(200);
    }
    await new Promise((r) => ws.addEventListener('open', r));
    let seq = 0;
    const pending = new Map();
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { seq += 1; pending.set(seq, r); ws.send(JSON.stringify({ id: seq, method, params })); });
    const js = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text);
      return r.result && r.result.result ? r.result.result.value : undefined;
    };
    // a plain page of the dev server: only the renderer module is needed, not the app
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/src/sim/render.js` });
    await sleep(600);
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) { try { await js(PAGE); ok = true; } catch (e) { if (i === 19) throw e; await sleep(500); } }
    for (const { id, model } of built) {
      const b64 = await js(`window.__modelThumb(${JSON.stringify(model)})`);
      fs.writeFileSync(path.join(outDir, `${id}.webp`), Buffer.from(b64, 'base64'));
      console.log(`${id.padEnd(20)} ${model.root.blocks.length} blocks`);
    }
    console.log(`\n${built.length} thumbnails → ${path.relative(root, outDir)}`);
  } finally { stop(); }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
