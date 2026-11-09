// The web app for the E2E suite: its own Vite dev server on a port free on both
// 127.0.0.1 and ::1 (never another program's server), and headless Edge/Chrome
// with its own profile, driven over the DevTools Protocol. `gpu: true` uses the
// real GPU (needed for the path tracer and frame timings; SwiftShader is far too slow).
// Popups are frames inside the page in the web build.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from '../../scripts/dev-port.mjs';
import { Page, sleep, waitTarget } from './cdp.mjs';
import { PAGE_HELPERS } from './page-helpers.mjs';
import { COMMAND_HELPER } from './web.suite.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
];

/** Starts Vite (dev) on a free port; resolves { port, process, log() } once it serves. */
export async function startVite({ from = 5800 } = {}) {
  const port = await freeDevPort(from);
  const child = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MYSKETCHBOOK_NO_HMR: '1' },
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const url = `http://127.0.0.1:${port}`;
  const end = Date.now() + 60000;
  for (;;) {
    if (child.exitCode != null) throw new Error(`Vite ended (exit ${child.exitCode}): ${log.slice(-800)}`);
    try { if ((await fetch(`${url}/`)).ok) break; } catch { /* not yet */ }
    if (Date.now() > end) { child.kill(); throw new Error(`Vite did not answer on ${url}: ${log.slice(-800)}`); }
    await sleep(150);
  }
  // Transform the app (and pre-bundle its dependencies) before the page loads it.
  for (const file of ['/src/main.js', '/src/app.js', '/src/popup.js', '/src/tools/modeling.js', '/src/engine/photo.js', '/src/io/export.js']) {
    try { await (await fetch(url + file, { signal: AbortSignal.timeout(90000) })).text(); } catch { /* the page load reports it */ }
  }
  return { port, url, process: child, log: () => log };
}

/** What the app logs: page exceptions and console errors are failures; warnings are kept apart. */
export function watchConsole(page, sink) {
  page.on('Runtime.consoleAPICalled', (p) => {
    const textOf = (a) => a.value ?? a.description ?? a.unserializableValue ?? '';
    const message = p.args.map(textOf).join(' ');
    if (p.type === 'error' || p.type === 'assert') sink.errors.push(`console.error: ${message}`);
    else if (p.type === 'warning') sink.warnings.push(message);
  });
  page.on('Log.entryAdded', ({ entry }) => {
    // Network failures of the page's own resources (a missing library model, a 404 module).
    if (entry.level === 'error' && entry.source === 'network') sink.errors.push(`network: ${entry.text} ${entry.url ?? ''}`);
  });
}

export class WebApp {
  constructor({ gpu = true, width = 1600, height = 960 } = {}) {
    this.gpu = gpu;
    this.width = width;
    this.height = height;
    this.errors = [];
    this.warnings = [];
    this.kind = 'web';
  }

  async start() {
    const browser = BROWSERS.find((file) => fs.existsSync(file));
    if (!browser) throw new Error('Edge 또는 Chrome 이 필요합니다');
    this.vite = await startVite();
    this.url = `${this.vite.url}/`;
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mysketchbook-web-'));
    this.port = await freeDevPort(this.vite.port + 1);
    const gpuFlags = this.gpu ? ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    // No sync, no extensions (a synced extension once opened its tab over the page), no background throttling
    // (a headless page otherwise stops its animation frames after a while).
    this.browser = spawn(browser, ['--headless=new', ...gpuFlags, `--remote-debugging-port=${this.port}`, `--user-data-dir=${this.profile}`,
      `--window-size=${this.width},${this.height}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--disable-features=Translate',
      '--disable-sync', '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      'about:blank'], { stdio: 'ignore' });
    const target = await waitTarget(this.port, (item) => item.type === 'page', 30000);
    this.main = await new Page(target).open();
    await this.main.send('Log.enable');
    watchConsole(this.main, this);
    this.dialogs = [];
    this.main.on('Page.javascriptDialogOpening', (params) => { this.dialogs.push(params.type); this.main.send('Page.handleJavaScriptDialog', { accept: true }); });
    // Downloads (web exports) go to a folder of this run, never the user's Downloads.
    this.downloads = path.join(this.profile, 'downloads');
    fs.mkdirSync(this.downloads, { recursive: true });
    await this.browserCommand('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: this.downloads });
    await this.main.send('Emulation.setDeviceMetricsOverride', { width: this.width, height: this.height, deviceScaleFactor: 1, mobile: false });
    await this.main.send('Page.navigate', { url: `${this.url}?nowelcome` });
    await this.ready();
    return this;
  }

  async browserCommand(method, params) {
    const info = await (await fetch(`http://127.0.0.1:${this.port}/json/version`)).json();
    const ws = new WebSocket(info.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    const answer = await new Promise((resolve) => { ws.onmessage = (m) => resolve(JSON.parse(m.data)); ws.send(JSON.stringify({ id: 1, method, params })); });
    ws.close();
    return answer;
  }

  async ready() {
    await this.main.waitFor(`Boolean(window.__mysketchbook && document.querySelector('#toolbar .tool-button') && document.querySelector('#statusbar .status-notice'))`, { timeout: 90000, interval: 200 });
    await this.main.eval(PAGE_HELPERS);
    await this.main.eval(COMMAND_HELPER);
  }

  /** Runs an async function body in the page; returns its (JSON) value. */
  run(body, timeout = 60000) {
    return this.main.eval(`(async () => { const A = window.__mysketchbook; const T = window.__t; ${body} })()`, timeout);
  }

  /** Errors since the last call (page exceptions, console errors, failed requests). */
  takeErrors() {
    const list = [...this.main.errors.splice(0), ...this.errors.splice(0)];
    this.warnings.length = 0;
    return list;
  }

  /** Evaluates inside a popup frame (same origin). */
  frame(kind, expression) {
    return this.main.eval(`(() => { const f = document.querySelector('.web-popup-${kind} iframe'); if (!f || !f.contentWindow?.__mysketchbookPopup) return null; return ((window, document) => (${expression}))(f.contentWindow, f.contentDocument); })()`);
  }

  waitFrame(kind, expression = 'true', timeout = 15000) {
    return this.main.waitFor(`(() => { const f = document.querySelector('.web-popup-${kind} iframe'); if (!f || !f.contentWindow?.__mysketchbookPopup || getComputedStyle(f.parentElement).visibility === 'hidden') return false; return ((window, document) => Boolean(document.querySelector('.popup, .popup-menu') && (${expression})))(f.contentWindow, f.contentDocument); })()`, { timeout });
  }

  async reload() {
    await this.main.eval('location.reload(); 1').catch(() => {});
    await sleep(800);
    await this.ready();
  }

  /** After a failed case: no popups, a project open, the select tool. */
  async recover() {
    try {
      await this.run(`await T.reset(); return 1;`, 20000);
    } catch {
      await this.reload().catch(() => {});
    }
    this.takeErrors();
  }

  async stop() {
    this.main?.close();
    this.browser?.kill();
    this.vite?.process.kill();
    await sleep(600);
    try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch { /* still in use */ }
  }
}
