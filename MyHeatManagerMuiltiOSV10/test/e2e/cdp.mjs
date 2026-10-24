// A minimal Chrome DevTools Protocol client (Node 22 WebSocket, no
// dependencies) and helpers to start the web build in headless Edge/Chrome.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
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

  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }

  /** A real mouse click at page coordinates. */
  async click(x, y, button = 'left', clickCount = 1) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount });
  }

  async drag(from, to, steps = 8) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from[0], y: from[1] });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from[0], y: from[1], button: 'left', clickCount: 1 });
    for (let i = 1; i <= steps; i++) {
      const x = from[0] + ((to[0] - from[0]) * i) / steps;
      const y = from[1] + ((to[1] - from[1]) * i) / steps;
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 1 });
    }
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to[0], y: to[1], button: 'left', clickCount: 1 });
  }

  async key(key, code = key, modifiers = 0, text = undefined) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, text, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
  }

  close() {
    try { this.ws.close(); } catch { /* closed */ }
  }
}

/** Starts headless Edge/Chrome on `url`; returns { cdp, browser, errors, stop }. */
export async function launchBrowser(url, { width = 1480, height = 900 } = {}) {
  const exe = BROWSERS.find((candidate) => fs.existsSync(candidate));
  if (!exe) throw new Error('Edge or Chrome is needed for the GUI tests');
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'myheat-e2e-'));
  const browser = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-features=EdgeSync,msEdgeSyncFeature',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
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
  await cdp.send('Page.navigate', { url });
  await waitFor(() => cdp.evaluate('document.readyState === "complete" && Boolean(window.__myheat)'), 30000);
  const stop = () => {
    cdp.close();
    browser.kill();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ } }, 1500);
  };
  return { cdp, browser, errors, stop };
}

/** Starts `vite` (dev server) for the project on a free port; returns { url, stop }. */
export async function startVite(root) {
  const port = await freePort();
  const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore', env: { ...process.env, BROWSER: 'none', MYHEAT_NO_HMR: '1' } });
  const url = `http://127.0.0.1:${port}/`;
  await waitFor(async () => (await fetch(url)).ok, 30000);
  return { url, stop: () => vite.kill() };
}
