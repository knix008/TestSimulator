// Minimal Chrome DevTools Protocol driver for headless Edge / Chrome (Node 22 WebSocket).
// Used by test/e2e/smoke.mjs and scripts/make-guide-images.mjs.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// CHROME_PATH wins; otherwise the usual Edge / Chrome locations per OS.
const EDGE = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((p) => p && fs.existsSync(p));

export const hasBrowser = () => !!EDGE;

export async function launch({ port = 9555, width = 1600, height = 1000, headless = true } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'my3dobjects-edge-'));
  const args = [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    ...(headless ? ['--headless=new'] : []), 'about:blank',
  ];
  const proc = spawn(EDGE, args, { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  const logs = [];
  listeners.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (m.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
  });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const api = {
    send,
    logs,
    async goto(url) {
      await send('Page.navigate', { url });
      await new Promise((r) => setTimeout(r, 1500));
    },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    async click(selector) {
      return api.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
    },
    async mouse(type, x, y, button = 'left', buttons = 1) {
      await send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1 });
    },
    async waitFor(expr, timeout = 30000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        try { if (await api.eval(expr)) return true; } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error(`timeout waiting for ${expr}`);
    },
    // Drops files on the app like a user dragging them in.
    async drop(files, selector = '.app') {
      const payload = files.map((f) => ({ name: path.basename(f), b64: fs.readFileSync(f).toString('base64') }));
      return api.eval(`(() => {
        const dt = new DataTransfer();
        for (const f of ${JSON.stringify(payload)}) {
          const bin = atob(f.b64); const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          dt.items.add(new File([u8], f.name));
        }
        const el = document.querySelector(${JSON.stringify(selector)});
        el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
        return true;
      })()`);
    },
    close() { try { ws.close(); } catch { /* */ } proc.kill(); },
  };
  return api;
}
