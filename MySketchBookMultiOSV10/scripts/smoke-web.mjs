// Drives the web build in headless Edge/Chrome for quick checks of what changed:
//   node scripts/smoke-web.mjs --out <dir> --steps steps.json [--width 1600 --height 960]
// steps.json: [{ "eval": "js expression (awaited)", "wait": 500, "until": "js condition", "shot": "name" }, …]
// Starts its own Vite on a port free on 127.0.0.1 and ::1, and stops it and the browser at the end.
import { spawn } from 'node:child_process';
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
try {
  for (let i = 0; i < 200 && !/Local:/.test(viteLog); i++) await sleep(150);
  const flags = gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  edge = spawn(browser, ['--headless=new', ...flags, `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--disable-sync', '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  const target = await waitTarget(debugPort, (t) => t.type === 'page');
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
  edge?.kill();
  vite.kill();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still held */ }
}
process.exit(failed ? 1 : 0);
