// Headless Edge / Chrome over the DevTools protocol (Node 22's WebSocket; no Playwright), and a tiny static
// server for the web build. Every browser gets its own profile folder; close() ends it with Browser.close and
// removes the profile, so no headless browser is left behind.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
];
export const findBrowser = () => BROWSERS.find((p) => fs.existsSync(p)) ?? null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.pcapng': 'application/octet-stream', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

/** Serves `dir` on a free port. Returns { url, close() }. */
export function serve(folder) {
  const dir = path.resolve(folder);
  const server = http.createServer((req, res) => {
    const clean = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    let file = path.join(dir, clean || 'index.html');
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) })));
}

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.listeners = new Set();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      } else if (msg.method) {
        for (const listener of this.listeners) listener(msg);
      }
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 60000);
    });
  }
}

/** Starts a headless browser on `url` with a window of width × height. */
export async function launch(url, { width = 1600, height = 1000, language = 'en' } = {}) {
  const executable = findBrowser();
  if (!executable) throw new Error('No Edge or Chrome found for the headless browser tests');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mynetmanager-e2e-'));
  const child = spawn(executable, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},${height}`, `--lang=${language}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-features=Translate', '--hide-scrollbars', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let wsUrl = null;
  await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('The headless browser did not start')), 30000);
    child.stderr.on('data', (chunk) => {
      buffer += chunk.toString();
      const m = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { wsUrl = m[1]; clearTimeout(timer); resolve(); }
    });
    child.on('exit', () => reject(new Error('The headless browser exited')));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  const browser = new Session(ws);
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const page = {
    errors: [],
    console: [],
    send: (method, params) => browser.send(method, params, sessionId),
  };
  browser.listeners.add((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') page.errors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? 'exception');
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') page.console.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  });
  /** Calls handler(params) for every `method` event of this page (e.g. Page.screencastFrame). */
  page.on = (method, handler) => browser.listeners.add((msg) => { if (msg.sessionId === sessionId && msg.method === method) handler(msg.params); });
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  /** Evaluates an expression (awaits promises) and returns its value. */
  page.eval = async (expression) => {
    const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  page.goto = async (target) => { await page.send('Page.navigate', { url: target }); await sleep(300); };
  page.waitFor = async (expression, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try { if (await page.eval(expression)) return true; } catch { /* not yet */ }
      await sleep(80);
    }
    throw new Error(`Timed out waiting for: ${expression.slice(0, 120)}`);
  };
  page.screenshot = async (file, clip = null) => {
    const r = await page.send('Page.captureScreenshot', { format: file.endsWith('.jpg') ? 'jpeg' : 'png', quality: file.endsWith('.jpg') ? 88 : undefined, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  page.mouse = async (type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
  page.click = async (x, y) => { await page.mouse('mousePressed', x, y); await page.mouse('mouseReleased', x, y); };
  page.key = async (key, { code = key, modifiers = 0, text } = {}) => {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, text, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
  };
  page.close = async () => {
    try { await browser.send('Browser.close'); } catch { /* already gone */ }
    await new Promise((resolve) => { if (child.exitCode != null) resolve(); else { child.once('exit', resolve); setTimeout(resolve, 5000); } });
    try { child.kill(); } catch { /* gone */ }
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch { /* locked: the OS cleans temp */ }
  };
  await page.goto(url);
  return page;
}
