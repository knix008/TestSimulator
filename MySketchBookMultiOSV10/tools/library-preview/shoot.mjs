// Dev-only: screenshots the library preview with headless Edge/Chrome.
//   node tools/library-preview/shoot.mjs --out <dir> [--width 1600] [--port-from 5600] "cat=living" "id=sofa-modern&view=front" …
// Starts its own Vite server on a port free on both 127.0.0.1 and ::1 and stops it (and the
// browser it launched) at the end — it never touches servers other programs run.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from '../../scripts/dev-port.mjs';
import { Page, waitTarget, sleep } from '../../test/e2e/cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const out = opt('--out', path.join(tmpdir(), 'library-preview'));
const width = Number(opt('--width', 1600));
const portFrom = Number(opt('--port-from', 5600));
const queries = args.length ? args : ['cat=living'];
mkdirSync(out, { recursive: true });

const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const browser = browsers.find((b) => existsSync(b));
if (!browser) throw new Error('No Edge/Chrome found');

const port = await freeDevPort(portFrom);
const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MYSKETCHBOOK_NO_HMR: '1' } });
let viteLog = '';
vite.stdout.on('data', (d) => { viteLog += d; });
vite.stderr.on('data', (d) => { viteLog += d; });

const debugPort = await freeDevPort(port + 1);
const profile = path.join(tmpdir(), `lib-preview-profile-${process.pid}`);
let edge;
try {
  for (let i = 0; i < 100 && !/Local:/.test(viteLog); i++) await sleep(150);
  edge = spawn(browser, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', `--window-size=${width},1000`, 'about:blank'], { stdio: 'ignore' });
  const target = await waitTarget(debugPort, (t) => t.type === 'page');
  const page = await new Page(target).open();
  const logs = [];
  page.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error' || p.type === 'warning') logs.push(p.args.map((a) => a.value ?? a.description).join(' ')); });
  await page.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
  for (const query of queries) {
    const url = `http://127.0.0.1:${port}/tools/library-preview/index.html?${query}`;
    logs.length = 0;
    page.errors.length = 0;
    await page.send('Page.navigate', { url });
    await page.waitFor('window.__done === true', { timeout: 240000, interval: 300 });
    const h = await page.eval('document.documentElement.scrollHeight');
    await page.send('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(200);
    const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, 120000);
    await page.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    const file = path.join(out, `${query.replace(/[^a-z0-9=,_-]+/gi, '_').replace(/[=,]/g, '-')}.png`);
    if (shot.error) throw new Error(shot.error.message);
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    const timings = await page.eval('JSON.stringify(window.__timings)');
    console.log(file, timings);
    for (const e of [...page.errors, ...logs]) console.log('  !', String(e).slice(0, 400));
  }
  page.close();
} finally {
  edge?.kill();
  vite.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* browser may still hold files */ }
}
