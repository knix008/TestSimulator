// npm run generate:samples — regenerates the start page sample thumbnails
// (public/samples/<id>.webp, 640×256 = 320×128 at 2×) from the samples'
// real results.
//
// How: starts the Vite dev server on a free port (127.0.0.1 and ::1) with its
// own settings and work folder in a temporary directory (MSM_USER_DATA,
// MSM_ROOT — the user's real settings and files are never touched), opens the
// app in headless Chrome / Edge over the DevTools protocol, and for every
// sample in src/lib/samples.js runs `close all; clear all; clc`, then the
// sample's code, and:
//   - a figure was drawn → exported with the figure export pipeline
//     (src/graphics/paint.js) on a transparent background with neutral grey
//     text / axes, so the image reads in dark and light themes;
//   - no figure → a card drawn from the real Command Window output: a matrix
//     grid for the first numeric matrix of at least 3×3, else the first lines
//     of the output as a small monospace console card.
//
// Options:  --only id1,id2   regenerate some samples
//           --browser PATH   Chrome / Edge executable (or env CHROME)
//           --keep           keep the temporary folder (for debugging)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from './dev-port.mjs';
import { SAMPLES } from '../src/lib/samples.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'samples');
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

// ------------------------------------------------------------------ page side
// Evaluated in the app page: renders one thumbnail and returns { kind, b64 }.
const PAGE = String.raw`
window.__thumbs = window.__thumbs || {};
(() => {
  const T = window.__thumbs;
  const W = 640, H = 256;
  if (!T.listening) {
    T.out = [];
    window.__msmEngine.on('out', (m) => { if (m.stream !== 'echo') T.out.push({ text: m.text, err: m.stream === 'err' }); });
    T.listening = true;
  }
  const b64 = async (blob) => { const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  // neutral look: transparent background, mid-grey text / axes that read on dark and light cards
  const NEUTRAL = { name: 'neutral', dark: false, figure: [0.5, 0.5, 0.5], axes: [0.5, 0.5, 0.5], fg: [0.53, 0.57, 0.63], muted: [0.5, 0.54, 0.6],
    grid: [0.53, 0.57, 0.63], gridAlpha: 0.2, gridMajorAlpha: 0.34, accent: [0.25, 0.65, 0.9], ruler: [0.5, 0.5, 0.5], rulerText: [0.5, 0.5, 0.5], rulerLine: [0.5, 0.5, 0.5] };
  const FG = '#86909e', NAME = '#3b9fd6', ERR = '#e5534b';

  function blocks(text) {
    // "name =\n\n   1   2\n   3   4\n" → [{ name, rows: [[1,2],[3,4]] }]
    const lines = text.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*([A-Za-z]\w*)\s*=\s*$/.exec(lines[i]);
      if (!m) continue;
      const rows = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      for (; j < lines.length && lines[j].trim(); j++) {
        if (/Columns|:/.test(lines[j])) { rows.length = 0; break; }
        const toks = lines[j].trim().split(/\s+/);
        const nums = toks.map(Number);
        if (!nums.every(Number.isFinite)) { rows.length = 0; break; }
        rows.push(nums);
      }
      if (rows.length && rows.every((r) => r.length === rows[0].length)) out.push({ name: m[1], rows });
    }
    return out;
  }
  const fmt = (v) => { const a = Math.abs(v); if (a !== 0 && (a >= 1e4 || a < 1e-2)) return v.toExponential(1).replace('e+', 'e'); return String(Number(v.toPrecision(4))); };

  function card() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(128,136,150,0.10)'; g.strokeStyle = 'rgba(128,136,150,0.38)'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(3, 3, W - 6, H - 6, 16); g.fill(); g.stroke();
    return { c, g };
  }

  function matrixCard(b) {
    const { c, g } = card();
    const R = Math.min(b.rows.length, 6), C = Math.min(b.rows[0].length, 8);
    const all = b.rows.flat();
    const lo = Math.min(...all), hi = Math.max(...all);
    g.font = '600 30px Consolas, "Cascadia Mono", monospace'; g.fillStyle = NAME; g.textBaseline = 'middle';
    g.fillText(b.name + ' =', 22, 30);
    g.font = '20px Consolas, "Cascadia Mono", monospace'; g.fillStyle = FG;
    g.fillText(b.rows.length + '×' + b.rows[0].length, W - 22 - g.measureText(b.rows.length + '×' + b.rows[0].length).width, 30);
    const top = 58, cw = Math.min(104, (W - 44) / C), ch = Math.min(38, (H - top - 10) / R);
    const left = (W - cw * C) / 2;
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      const v = b.rows[i][j];
      const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
      const col = [Math.round(40 + 200 * t), Math.round(120 + 40 * Math.sin(t * Math.PI)), Math.round(220 - 180 * t)];
      g.fillStyle = 'rgba(' + col.join(',') + ',0.42)';
      g.fillRect(left + j * cw + 1, top + i * ch + 1, cw - 2, ch - 2);
      g.font = '600 25px Consolas, "Cascadia Mono", monospace'; g.textAlign = 'center';
      const s = (i === R - 1 && b.rows.length > R) || (j === C - 1 && b.rows[0].length > C) ? '…' : fmt(v);
      g.lineWidth = 3; g.strokeStyle = 'rgba(20,24,30,0.55)'; g.strokeText(s, left + (j + 0.5) * cw, top + (i + 0.5) * ch + 1);
      g.fillStyle = '#f2f5f8'; g.fillText(s, left + (j + 0.5) * cw, top + (i + 0.5) * ch + 1);
      g.textAlign = 'left';
    }
    return c;
  }

  function consoleCard(parts) {
    const { c, g } = card();
    const lines = [];
    for (const p of parts) for (const l of p.text.split('\n')) if (l.trim()) lines.push({ text: l.replace(/\t/g, '  ').replace(/\s+$/, ''), err: p.err });
    // trim the common indentation of value rows so more fits
    g.font = '30px Consolas, "Cascadia Mono", monospace'; g.textBaseline = 'middle';
    const max = 6, lh = 38;
    lines.slice(0, max).forEach((l, i) => {
      const y = 33 + i * lh;
      const named = /^\s*[A-Za-z]\w*\s*=/.test(l.text);
      g.fillStyle = l.err ? ERR : named ? NAME : FG;
      const base = l.text.startsWith('   ') ? l.text.slice(2) : l.text; // indented rows move by a fixed amount (columns stay aligned)
      let s = base;
      while (s.length > 2 && g.measureText(s).width > W - 40) s = s.slice(0, -2);
      if (s !== base) s += '…';
      g.fillText(s, 20, y);
    });
    if (lines.length > max) { g.fillStyle = FG; g.fillText('⋯', W - 40, H - 22); }
    return c;
  }

  T.render = async () => {
    const ctl = window.__msmFigures;
    const fig = ctl.figure();
    if (fig) {
      const { encodeExport } = await import('/src/graphics/paint.js');
      const paint = { ...ctl.paintOptions(fig), grid5: false, grid3d: false };
      const r = await encodeExport(fig, { format: 'webp', figW: 360, figH: 144, target: 'figure', sizeMode: 'pixels', width: W, height: H, lock: false, background: 'none', theme: NEUTRAL, quality: 90, rulers: false, tips: false }, paint);
      return { kind: 'figure', b64: await b64(new Blob([r.bytes])) };
    }
    const text = T.out.filter((p) => !p.err).map((p) => p.text).join('');
    const m = blocks(text).find((b) => b.rows.length >= 3 && b.rows[0].length >= 3);
    const canvas = m ? matrixCard(m) : consoleCard(T.out);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.92));
    return { kind: m ? 'matrix:' + m.name : 'console', b64: await b64(blob) };
  };
})();
1;
`;

// ------------------------------------------------------------------ run
async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'msm-thumbs-'));
  const env = { ...process.env, MSM_USER_DATA: path.join(tmp, 'userdata'), MSM_ROOT: path.join(tmp, 'work') };
  fs.mkdirSync(env.MSM_USER_DATA, { recursive: true });
  fs.mkdirSync(env.MSM_ROOT, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const port = await freeDevPort(5300);
  const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env, stdio: 'ignore' });
  const cdpPort = await anyPort();
  const browser = spawn(findBrowser(), ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${path.join(tmp, 'browser')}`, '--window-size=1400,900',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
    // (Re)attaches to the page: waits for the engine, removes the dev overlay of
    // unrelated build errors and the first-run tutorial, installs the renderer.
    // Also after a reload (the dev server reloads the page when files change).
    const attach = async () => {
      let ready = false;
      for (let i = 0; i < 150 && !ready; i++) { await sleep(300); ready = await js("!!(window.__msmEngine && window.__msmEngine.state === 'ready' && window.__msmFigures)").catch(() => false); }
      if (!ready) throw new Error('The app did not start.');
      await sleep(500);
      await js(`document.querySelectorAll('vite-error-overlay').forEach((e) => e.remove()); (() => { const b = [...document.querySelectorAll('button')].find((x) => /나중에|Later/.test(x.textContent)); if (b) b.click(); return 1; })()`);
      await js(PAGE);
    };
    await attach();
    const list = SAMPLES.filter((s) => !only || only.has(s.id));
    const report = [];
    for (const s of list) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await runOne(s); break; } catch (e) {
          if (attempt === 2) throw e;
          console.log(`  ${s.id}: ${e.message.split('\n')[0]} — the page reloaded, retrying`);
          await attach();
        }
      }
    }
    async function runOne(s) {
      if (!(await js('!!(window.__thumbs && window.__thumbs.render)'))) throw new Error('renderer missing');
      await js(`window.__msmEngine.eval('close all; clear all; clc', { echo: false, history: false })`);
      await js(`window.__msmEngine.eval('rng(1)', { echo: false, history: false }).catch(() => 0)`);
      await sleep(300);
      await js('window.__thumbs.out = []; 1');
      const res = await js(`Promise.race([window.__msmEngine.eval(${JSON.stringify(s.code)}, { echo: false, history: false }).then((r) => JSON.stringify(r)), new Promise((r) => setTimeout(() => { window.__msmEngine.interrupt(); r('timeout'); }, 30000))])`);
      await sleep(900); // figure flush + first paint
      await js(`document.querySelectorAll('vite-error-overlay').forEach((e) => e.remove()); 1`);
      if (!(await js('!!(window.__thumbs && window.__thumbs.render)'))) throw new Error('renderer missing');
      const r = await js('window.__thumbs.render()');
      const file = path.join(outDir, `${s.id}.webp`);
      fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
      const ok = res && res !== 'timeout' && JSON.parse(res).ok !== false;
      report.push(`${s.id.padEnd(12)} ${r.kind.padEnd(16)} ${ok ? '' : `(run: ${res})`}`);
      console.log(report[report.length - 1]);
    }
    await js(`window.__msmEngine.eval('close all', { echo: false, history: false })`);
    console.log(`\n${list.length} thumbnails → ${path.relative(root, outDir)}`);
  } finally { stop(); }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
