// Drives the web build in a headless Edge / Chrome over the DevTools protocol (no Playwright):
// a static server for dist/, a browser with its own throw-away profile, and helpers to
// evaluate, click, type and take screenshots. Used by test/gui.mjs.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

/** Serves a folder on a free port. */
export function serve(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = path.join(dir, url === '/' ? 'index.html' : url);
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

export async function launch({ width = 1500, height = 920 } = {}) {
  const browser = BROWSERS.find((candidate) => fs.existsSync(candidate));
  if (!browser) throw new Error('Edge 또는 Chrome 이 필요합니다 / Edge or Chrome is needed');
  const port = 9500 + Math.floor(Math.random() * 400);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mytextmaster-gui-'));
  const child = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let attempt = 0; attempt < 80 && !target; attempt += 1) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((item) => item.type === 'page'); } catch { /* not up yet */ }
    if (!target) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!target) { child.kill(); throw new Error('headless browser did not start'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); return; }
    // "Leave the page?" (unsaved documents) and other native dialogs would block navigation: accept them.
    if (data.method === 'Page.javascriptDialogOpening') ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text);
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') errors.push(data.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (data) => (data.error ? reject(new Error(`${method}: ${data.error.message}`)) : resolve(data.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const page = {
    errors,
    send,
    async goto(url) {
      await send('Page.navigate', { url });
      await page.waitFor('document.readyState === "complete" && window.__mytextmaster && document.querySelector("#menubar .menubar-item")', 15000);
    },
    async eval(expression) {
      const result = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    },
    async waitFor(expression, timeout = 5000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        try { if (await page.eval(`return Boolean(${expression});`)) return true; } catch { /* page not ready */ }
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      throw new Error(`timed out waiting for: ${expression}`);
    },
    async click(selector) {
      const box = await page.eval(`const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({block:'nearest'}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
      if (!box) throw new Error(`no element: ${selector}`);
      await page.mouse(box.x, box.y);
    },
    async mouse(x, y, { button = 'left', clickCount = 1 } = {}) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount });
    },
    async key(key, { ctrl = false, shift = false, alt = false, code, text } = {}) {
      const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (shift ? 8 : 0);
      const keyCode = key.length === 1 ? key.toUpperCase().charCodeAt(0) : { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, F1: 112, F5: 116, F11: 122, Alt: 18 }[key];
      const base = { key, code: code ?? (key.length === 1 ? (/\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`) : key), modifiers, windowsVirtualKeyCode: keyCode };
      await send('Input.dispatchKeyEvent', { type: text && !ctrl && !alt ? 'keyDown' : 'rawKeyDown', ...base, ...(text && !ctrl && !alt ? { text } : {}) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },
    async type(text) { await send('Input.insertText', { text }); },
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
    },
    async close() {
      try { ws.close(); } catch { /* gone */ }
      child.kill();
      setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still held */ } }, 800);
    },
  };
  return page;
}
