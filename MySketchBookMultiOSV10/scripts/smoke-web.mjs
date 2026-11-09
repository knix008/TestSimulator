// Drives the web build in headless Edge/Chrome for quick checks of what changed:
//   node scripts/smoke-web.mjs --out <dir> --steps steps.json [--width 1600 --height 960]
// steps.json: [{ "eval": "js expression (awaited)", "wait": 500, "until": "js condition", "shot": "name" }, …]
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
const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MYSKETCHBOOK_NO_HMR: '1' } });
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
  try { await page.waitFor('Boolean(window.__mysketchbook)', { timeout: 60000, interval: 200 }); } catch (error) {
    console.log(`✘ the app did not start: ${error.message}`);
    for (const e of [...page.errors, ...logs]) console.log(`  ! ${String(e).slice(0, 800)}`);
    throw error;
  }
  for (const [n, step] of steps.entries()) {
    const label = step.shot ?? step.eval?.slice(0, 60) ?? step.until ?? `step ${n}`;
    const t0 = Date.now();
    if (step.eval) {
      const r = await page.send('Runtime.evaluate', { expression: `(async () => { ${step.eval.trim().startsWith("return") ? step.eval : `return (${step.eval})`} })()`, awaitPromise: true, returnByValue: true }, 180000);
      const value = r.result?.result?.value;
      const ex = r.result?.exceptionDetails;
      if (ex || r.error) { failed = true; console.log(`✘ ${label}: ${ex?.exception?.description ?? ex?.text ?? r.error?.message}`); }
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
    }
    if (step.mouse) for (const ev of step.mouse) { await page.send('Input.dispatchMouseEvent', { button: 'none', clickCount: ev.type === 'mouseMoved' ? 0 : 1, ...ev, delay: undefined }); if (ev.delay) await sleep(ev.delay); }
    if (step.until) { try { await page.waitFor(step.until, { timeout: step.timeout ?? 30000, interval: 200 }); } catch { failed = true; console.log(`✘ timed out: ${step.until}`); } }
    if (step.wait) await sleep(step.wait);
    if (step.shot) {
      const shot = await page.send('Page.captureScreenshot', { format: 'png' }, 60000);
      const file = path.join(out, `${step.shot}.png`);
      writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      console.log(`📷 ${file} (${Date.now() - t0} ms)`);
    }
    for (const e of [...page.errors.splice(0), ...logs.splice(0)]) { console.log(`  ! ${String(e).slice(0, 500)}`); if (!/warning:/.test(e)) failed = true; }
  }
  page.close();
} finally {
  cleanup();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still held */ }
}
process.exit(failed ? 1 : 0);
