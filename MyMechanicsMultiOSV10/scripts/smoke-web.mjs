// Drives the web build in headless Edge/Chrome for quick checks of what changed:
//   node scripts/smoke-web.mjs --out <dir> --steps steps.json [--width 1600 --height 960]
// steps.json: [{ "name": "what it checks", "eval": "js expression (awaited)", "expect": "regex the result must match", "wait": 500, "until": "js condition", "shot": "name", "evalTimeout": 180000 }, …]
// Starts its own Vite on a port free on 127.0.0.1 and ::1, and stops it and the browser at the end.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from './dev-port.mjs';
import { Page, waitTarget, sleep } from '../test/e2e/cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args[i + 1]; };
const out = opt('--out', path.join(tmpdir(), 'msk-smoke'));
const width = Number(opt('--width', 1600));
const height = Number(opt('--height', 960));
const steps = JSON.parse(readFileSync(opt('--steps'), 'utf8'));
const gpu = args.includes('--gpu');
mkdirSync(out, { recursive: true });

const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((b) => existsSync(b));
const port = await freeDevPort(5800);
// --dist: the production build in dist/ (vite preview; run `npm run build:web` first) instead of the dev server.
const dist = args.includes('--dist');
const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), ...(dist ? ['preview'] : []), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MYMECHANICS_NO_HMR: '1' } });
let viteLog = '';
vite.stdout.on('data', (d) => { viteLog += d; });
vite.stderr.on('data', (d) => { viteLog += d; });
const debugPort = await freeDevPort(port + 1);
const profile = path.join(tmpdir(), `msk-smoke-${process.pid}`);
let edge;
let failed = false;

// The browser must not outlive this script. On Windows msedge.exe hands over to another process and
// exits at once, so its pid is useless for cleanup: every process started with this run's profile folder
// is closed instead — also when the script is interrupted or timed out (signals, exit).
const smokeProcesses = (pattern) => {
  if (process.platform !== 'win32') return [];
  const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe'" | Where-Object { $_.CommandLine -match 'msk-smoke-(\\d+)' } | ForEach-Object { $null = $_.CommandLine -match 'msk-smoke-(\\d+)'; '{0} {1}' -f $_.ProcessId, $Matches[1] }`;
  try {
    return spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean)
      .map((l) => l.trim().split(' ')).filter(([, owner]) => pattern(owner)).map(([pid]) => pid);
  } catch { return []; }
};
const killPids = (pids) => { for (const pid of pids) spawnSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' }); };
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { edge?.kill(); } catch { /* gone */ }
  try { vite?.kill(); } catch { /* gone */ }
  killPids(smokeProcesses((owner) => owner === String(process.pid)));
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(signal, () => { cleanup(); process.exit(130); });
process.on('exit', cleanup);
// Browsers left behind by earlier runs whose script is gone (killed outright): close them.
{
  const alive = (pid) => { try { process.kill(Number(pid), 0); return true; } catch { return false; } };
  const orphans = smokeProcesses((owner) => owner !== String(process.pid) && !alive(owner));
  killPids(orphans);
  if (orphans.length) console.log(`  (closed ${orphans.length} browser processes left by earlier runs)`);
}
try {
  for (let i = 0; i < 200 && !/Local:/.test(viteLog); i++) await sleep(150);
  const flags = gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  edge = spawn(browser, ['--headless=new', ...flags, `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--disable-sync', '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  const target = await waitTarget(debugPort, (t) => t.type === 'page', 40000);
  const page = await new Page(target).open();
  const logs = [];
  page.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error' || p.type === 'warning') logs.push(`${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`); });
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/?nowelcome` });
  try { await page.waitFor('Boolean(window.__mymechanics)', { timeout: 60000, interval: 200 }); } catch (error) {
    console.log(`✘ the app did not start: ${error.message}`);
    for (const e of [...page.errors, ...logs]) console.log(`  ! ${String(e).slice(0, 800)}`);
    throw error;
  }
  for (const [n, step] of steps.entries()) {
    const label = step.shot ?? step.eval?.slice(0, 60) ?? step.until ?? `step ${n}`;
    const t0 = Date.now();
    if (step.eval) {
      const r = await page.send('Runtime.evaluate', { expression: `(async () => { ${step.eval.trim().startsWith("return") ? step.eval : `return (${step.eval})`} })()`, awaitPromise: true, returnByValue: true }, step.evalTimeout ?? 180000);
      const value = r.result?.result?.value;
      const ex = r.result?.exceptionDetails;
      if (ex || r.error) { failed = true; console.log(`✘ ${step.name ?? label}:${ex?.exception?.description ?? ex?.text ?? r.error?.message} [${Date.now() - t0} ms]`); }
      else if (step.expect !== undefined && !new RegExp(step.expect).test(typeof value === 'string' ? value : JSON.stringify(value))) { failed = true; console.log(`✘ ${step.name ?? label}: got ${typeof value === 'string' ? value : JSON.stringify(value)} — expected /${step.expect}/ [${Date.now() - t0} ms]`); }
      else if (step.name) console.log(`✔ ${step.name}${value !== undefined && step.verbose ? ` → ${JSON.stringify(value)}` : ''} [${Date.now() - t0} ms]`);
      else if (value !== undefined) console.log(`  ${label} → ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    }
    // Real browser input (CDP Input.dispatchMouseEvent) into this headless page: [{ type, x, y, button, buttons, delay }].
    // CPU profile around steps: { "profile": "start" } … { "profile": "stop" } prints the top self-time functions.
    if (step.profile === 'start') { await page.send('Profiler.enable'); await page.send('Profiler.setSamplingInterval', { interval: 200 }); await page.send('Profiler.start'); }
    if (step.profile === 'stop') {
      const { result } = await page.send('Profiler.stop');
      const nodes = result?.profile?.nodes ?? [];
      const dt = new Map();
      const { samples = [], timeDeltas = [] } = result?.profile ?? {};
      samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (timeDeltas[i] ?? 0)));
      const self = new Map();
      for (const n of nodes) {
        const f = n.callFrame;
        const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}`;
        self.set(key, (self.get(key) ?? 0) + (dt.get(n.id) ?? 0) / 1000);
      }
      const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, step.top ?? 18);
      console.log('  profile (self ms):');
      for (const [k, ms] of top) console.log(`    ${ms.toFixed(1).padStart(8)}  ${k}`);
      // { "total": N }: also the N app functions with the most time including what they call (each counted once
      // per call path, so recursion does not add up twice) — finds the caller of an expensive library loop.
      if (step.total) {
        const byId = new Map(nodes.map((n) => [n.id, n]));
        const keyOf = (n) => { const f = n.callFrame; return `${f.functionName || '(anon)'} ${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}`; };
        const inclusive = new Map();
        const walk = (id, onPath) => {
          const n = byId.get(id); const k = keyOf(n); let sum = (dt.get(id) ?? 0) / 1000;
          const fresh = !onPath.has(k); if (fresh) onPath.add(k);
          for (const c of n.children ?? []) sum += walk(c, onPath);
          if (fresh) { onPath.delete(k); if (/\/src\//.test(n.callFrame.url)) inclusive.set(k, (inclusive.get(k) ?? 0) + sum); }
          return sum;
        };
        if (nodes.length) walk(nodes[0].id, new Set());
        console.log('  profile (total ms, app code):');
        for (const [k, ms] of [...inclusive].sort((a, b) => b[1] - a[1]).slice(0, step.total)) console.log(`    ${ms.toFixed(1).padStart(8)}  ${k}`);
      }
    }
    // x / y may be JS expressions evaluated in the page (positions computed from the view: { "x": "window.__pt[0]" }).
    const coord = async (v) => (typeof v === 'string' ? (await page.send('Runtime.evaluate', { expression: v, returnByValue: true })).result?.result?.value : v);
    if (step.mouse) for (const ev of step.mouse) { await page.send('Input.dispatchMouseEvent', { button: 'none', clickCount: ev.type === 'mouseMoved' ? 0 : 1, ...ev, x: await coord(ev.x), y: await coord(ev.y), delay: undefined }); if (ev.delay) await sleep(ev.delay); }
    // Real key presses: [{ key: 'ArrowRight', code?, keyCode?, modifiers?: Alt 1 | Ctrl 2 | Meta 4 | Shift 8 }].
    const KEY_CODES = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Escape: 27, Enter: 13 };
    if (step.keys) for (const k of step.keys) {
      const base = { key: k.key, code: k.code ?? k.key, windowsVirtualKeyCode: k.keyCode ?? KEY_CODES[k.key] ?? k.key.toUpperCase().charCodeAt(0), modifiers: k.modifiers ?? 0 };
      await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(k.delay ?? 60);
    }
    if (step.until) { try { await page.waitFor(step.until, { timeout: step.timeout ?? 30000, interval: 200 }); } catch { failed = true; console.log(`✘ timed out: ${step.until} [${Date.now() - t0} ms]`); } }
    if (step.wait) await sleep(step.wait);
    if (step.shot) {
      // "clip": a JS expression giving { x, y, width, height } (page pixels) captures only that part.
      const clip = step.clip ? (await page.send('Runtime.evaluate', { expression: step.clip, returnByValue: true })).result?.result?.value : null;
      const area = clip && clip.width > 0 && clip.height > 0 ? { clip: { x: Math.max(0, Math.round(clip.x)), y: Math.max(0, Math.round(clip.y)), width: Math.round(Math.min(clip.width, width - Math.max(0, clip.x))), height: Math.round(Math.min(clip.height, height - Math.max(0, clip.y))), scale: 1 } } : {};
      const shot = await page.send('Page.captureScreenshot', { format: 'png', ...area }, 60000);
      const file = path.join(out, `${step.shot}.png`);
      writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      console.log(`📷 ${file} (${Date.now() - t0} ms)`);
    }
    // A step that provokes an error on purpose (a damaged file refused) names it in `allowErrors` (a regex).
    const allowed = step.allowErrors ? new RegExp(step.allowErrors) : null;
    for (const e of [...page.errors.splice(0), ...logs.splice(0)]) {
      if (allowed?.test(String(e))) { console.log(`  ~ expected: ${String(e).slice(0, 300)}`); continue; }
      console.log(`  ! ${String(e).slice(0, 500)}`);
      if (!/warning:/.test(e)) failed = true;
    }
  }
  page.close();
} finally {
  cleanup();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still held */ }
}
process.exit(failed ? 1 : 0);
