// A minimal Chrome DevTools Protocol client (Node 22 WebSocket, no
// dependencies) and helpers to run the web build in headless Edge/Chrome:
// a free port (on both 127.0.0.1 and ::1), Vite on it with an isolated user
// data folder (MCC_USER_DATA), and a browser with a throw-away profile.
// Used by scripts/tutorial-capture.mjs and scripts/tutorial-video.mjs.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const BROWSERS = [
  process.env.MCC_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
].filter(Boolean);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function canListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT'));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** A port nobody listens on, on IPv4 and IPv6 loopback both. */
export async function freePort() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const { port: p } = server.address();
        server.close(() => resolve(p));
      });
    });
    if (await canListen(port, '::1') && await canListen(port, '127.0.0.1')) return port;
  }
  throw new Error('no free port');
}

export async function waitFor(check, timeout = 20000, interval = 100) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(interval);
  }
  throw new Error(`timed out${last instanceof Error ? `: ${last.message}` : ''}`);
}

export class Cdp {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      } else if (data.method) {
        for (const handler of this.handlers.get(data.method) ?? []) handler(data.params);
      }
    };
    return this;
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }

  async screenshot(file, { format = 'jpeg', quality = 82 } = {}) {
    const { data } = await this.send('Page.captureScreenshot', format === 'png' ? { format } : { format, quality });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }

  close() {
    try { this.ws.close(); } catch { /* closed */ }
  }
}

/** Starts headless Edge/Chrome on `url`; returns { cdp, browser, errors, stop }. */
export async function launchBrowser(url, { width = 1360, height = 840, args = [], ready = 'document.readyState === "complete" && !!(window.__mcc && window.__mcc.action)' } = {}) {
  const exe = BROWSERS.find((candidate) => fs.existsSync(candidate));
  if (!exe) throw new Error('Edge or Chrome is needed (or set MCC_BROWSER)');
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-e2e-'));
  const browser = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-features=EdgeSync,msEdgeSyncFeature,Translate',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...args, 'about:blank',
  ], { stdio: 'ignore' });
  const target = await waitFor(async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return list.find((item) => item.type === 'page');
  });
  const cdp = await new Cdp(target.webSocketDebuggerUrl).open();
  const errors = [];
  cdp.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push(p.args.map((a) => a.value ?? a.description).join(' ')); });
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }).catch(() => {});
  if (url) {
    await cdp.send('Page.navigate', { url });
    if (ready) await waitFor(() => cdp.evaluate(ready), 60000, 200);
  }
  const stop = () => {
    cdp.close();
    try { browser.kill(); } catch { /* gone */ }
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ } }, 1500);
  };
  return { cdp, browser, errors, stop, port };
}

/** Starts Vite (dev server + the API middleware) on a free port with its own user data; returns { url, userData, stop }. */
export async function startVite(root, { userData } = {}) {
  const port = await freePort();
  const data = userData || fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-data-'));
  const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: root, stdio: 'ignore', env: { ...process.env, BROWSER: 'none', MCC_USER_DATA: data },
  });
  const url = `http://127.0.0.1:${port}/`;
  await waitFor(async () => (await fetch(url)).ok, 60000, 250);
  const stop = () => {
    try { vite.kill(); } catch { /* gone */ }
    if (!userData) setTimeout(() => { try { fs.rmSync(data, { recursive: true, force: true }); } catch { /* still open */ } }, 1500);
  };
  return { url, userData: data, stop };
}

/** Mounts the tutorial and guide in the page when App does not render them yet, and hides the welcome card. */
export const ENSURE_TOUR = `(async () => {
  if (!window.__mcc || !window.__mcc.tutorial) { const m = await import('/src/components/Tutorial.jsx'); m.mountTutorial(); }
  if (!window.__mcc.openGuide) { const g = await import('/src/components/UserGuide.jsx'); g.mountUserGuide(); }
  for (let i = 0; i < 40 && !(window.__mcc.tutorial && window.__mcc.openGuide); i++) await new Promise((r) => setTimeout(r, 50));
  const later = document.querySelector('[data-testid="tutorial-welcome-later"]');
  if (later) later.click();
  return !!window.__mcc.tutorial;
})()`;
