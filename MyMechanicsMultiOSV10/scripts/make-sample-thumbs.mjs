// npm run samples:thumbs — the start page's sample pictures (src/assets/samples/<id>.webp), one per sample.
//   node scripts/make-sample-thumbs.mjs [--only id,id] [--gpu]
// Drives the web build in headless Edge (its own Vite on a free port): every sample is opened as the user sees it
// without its motion stage, turned to the isometric view and fitted, and the graphics area is rendered without
// planes, origin, sketches, grid, rulers or scale bar (viewport.capture). A drawing sample is a shot of its sheet.
// Run it again after adding or changing a sample; the start page shows the sample's icon when it has no picture.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { freeDevPort } from './dev-port.mjs';
import { Page, waitTarget, sleep } from '../test/e2e/cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args[i + 1]; };
const only = opt('--only', '') ? new Set(opt('--only').split(',')) : null;
const gpu = args.includes('--gpu');
const outDir = path.join(root, 'src', 'assets', 'samples');
// The tile shows the picture at about 190 × 112 px: rendered at twice that for sharp screens.
const W = 400; const H = 236;
const WIDTH = 1600; const HEIGHT = 960;
fs.mkdirSync(outDir, { recursive: true });

const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((b) => fs.existsSync(b));
const port = await freeDevPort(5950);
const env = { ...process.env, MYMECHANICS_NO_HMR: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env });
let viteLog = '';
vite.stdout.on('data', (d) => { viteLog += d; });
vite.stderr.on('data', (d) => { viteLog += d; });
const debugPort = await freeDevPort(port + 1);
// The profile's name ("msk-smoke-<pid>") lets smoke-web's orphan sweep close this browser too if the script dies.
const profile = path.join(tmpdir(), `msk-smoke-${process.pid}`);
let edge;
let page;
const killProfileBrowsers = () => {
  if (process.platform !== 'win32') return;
  const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*msk-smoke-${process.pid}*' } | ForEach-Object { $_.ProcessId }`;
  const pids = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean);
  for (const pid of pids) spawnSync('taskkill', ['/PID', pid.trim(), '/F'], { stdio: 'ignore' });
};
let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  cleaned = true;
  try { page?.send('Browser.close').catch(() => {}); } catch { /* gone */ }
  try { edge?.kill(); } catch { /* gone */ }
  try { vite?.kill(); } catch { /* gone */ }
  killProfileBrowsers();
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, () => { cleanup(); process.exit(130); });
process.on('exit', cleanup);

const evaluate = async (expression, timeout = 240000) => {
  const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
  const ex = r.result?.exceptionDetails;
  if (ex || r.error) throw new Error(ex?.exception?.description ?? ex?.text ?? r.error?.message);
  return r.result?.result?.value;
};

// In the page: open one sample and return its picture (a PNG data URL) or the clip of its drawing sheet.
const shootInPage = async (id, w, h) => {
  const m = window.__mymechanics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const idle = async (ms) => { await sleep(ms); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); };
  if (m.state.editing) m.actions.cancelEditing({ quiet: true });
  await m.actions.closeProject({ force: true });
  await m.actions.openSampleAsk(id, { stage: false });
  // Wait for the rebuilds (parts, then the assembly placements).
  for (let i = 0; i < 200 && (m.state.building || m.state.busy); i++) await sleep(100);
  await idle(900);
  if (m.state.showStart) m.actions.showStartPage(false);
  const kind = m.active()?.kind ?? m.project?.active?.kind;
  if (kind === 'drawing') {
    await m.run('zoomFit'); await idle(700);
    const paper = document.querySelector('#drawing-host .drawing-paper svg') ?? document.querySelector('#drawing-host svg');
    const r = paper?.getBoundingClientRect();
    return r ? { clip: { x: r.left + 3, y: r.top + 3, width: r.width - 6, height: r.height - 6 } } : { error: 'no sheet' };
  }
  await m.run('view:iso'); await idle(300);
  await m.run('zoomFit'); await idle(600);
  const vp = m.viewport;
  if (!vp) return { error: 'no viewport' };
  // A little closer than "fit" (which leaves room round the model): the tile is small.
  // A plain background (the view's gradient can't be trimmed), put back afterwards.
  const bg = vp.scene.background;
  vp.scene.background = null; vp.renderer.setClearColor(0xf4f6f9, 1);
  const png = vp.capture(w * 2, h * 2).toDataURL('image/png');
  vp.scene.background = bg; vp.render();
  return { png };
};

try {
  for (let i = 0; i < 200 && !/Local:/.test(viteLog); i++) await sleep(150);
  const flags = gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  edge = spawn(browser, ['--headless=new', ...flags, `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--disable-sync', '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${WIDTH},${HEIGHT}`, 'about:blank'], { stdio: 'ignore' });
  const target = await waitTarget(debugPort, (t) => t.type === 'page', 40000);
  page = await new Page(target).open();
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/?nowelcome` });
  await page.waitFor('Boolean(window.__mymechanics)', { timeout: 90000, interval: 200 });
  await evaluate('window.__mymechanics.actions.ensureKernel().then(() => "ready")');
  // Only the model: no reference geometry or guides; the light theme (the tiles sit on light and dark cards alike).
  await evaluate(`(async () => { const m = window.__mymechanics; m.actions.updateSettings({ showPlanes: false, showOrigin: false, showSketches: false, showGrid: false, showRulers: false, showScaleBar: false, showAxes: false, showLampMarkers: false, showSunMarker: false, showSunLine: false, perspectiveView: false }); await new Promise((r) => setTimeout(r, 300)); return 1; })()`);
  const ids = (await evaluate(`(async () => { const { SAMPLES } = await import('/src/cad/samples.js'); return SAMPLES.map((s) => s.id); })()`)).filter((id) => !only || only.has(id));
  let made = 0; const failed = [];
  for (const id of ids) {
    const t0 = Date.now();
    try {
      const r = await evaluate(`(${shootInPage})(${JSON.stringify(id)}, ${W}, ${H})`);
      let buffer;
      if (r?.png) buffer = Buffer.from(r.png.split(',')[1], 'base64');
      else if (r?.clip) {
        const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...r.clip, scale: 1 } }, 60000);
        buffer = Buffer.from(shot.result.data, 'base64');
      } else throw new Error(r?.error ?? 'nothing to shoot');
      // Trim the empty margin the fit leaves, then centre the model in the tile's frame.
      const trimmed = await sharp(buffer).trim({ background: '#f4f6f9', threshold: 14 }).extend({ top: 14, bottom: 14, left: 14, right: 14, background: '#f4f6f9' }).toBuffer().catch(() => buffer);
      const file = path.join(outDir, `${id}.webp`);
      await sharp(trimmed).resize(W, H, { fit: 'contain', background: '#f4f6f9' }).flatten({ background: '#f4f6f9' }).webp({ quality: 82 }).toFile(file);
      made++;
      console.log(`✔ ${id} ${Math.round(fs.statSync(file).size / 1024)} KB ${Date.now() - t0} ms`);
    } catch (error) {
      failed.push(id);
      console.log(`✘ ${id}: ${String(error.message ?? error).split('\n')[0]}`);
    }
  }
  console.log(`${made} pictures in src/assets/samples${failed.length ? `, failed: ${failed.join(', ')}` : ''}`);
  if (failed.length) process.exitCode = 1;
} finally {
  cleanup();
}
