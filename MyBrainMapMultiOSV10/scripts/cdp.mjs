// A small Chrome DevTools Protocol driver (Node 22 WebSocket, no Playwright):
// starts the web server on a free port with a throw-away profile, opens the
// app in headless Edge / Chrome, and gives the scripts (smoke test, help
// screenshots) evaluate / click / key / screenshot helpers.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function browserPath() {
  const list = process.platform === 'win32'
    ? [`${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`, `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`, `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`]
    : process.platform === 'darwin'
      ? ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return list.find((p) => p && fs.existsSync(p)) || null;
}

function freePort() {
  return new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}

async function waitFor(url, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return r; } catch { /* not yet */ }
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${url}`);
}

export async function launch({ width = 1440, height = 900, lang = 'ko', session = null, query = '' } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mtm-cdp-'));
  const config = path.join(profile, 'config');
  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(path.join(config, 'session.json'), JSON.stringify({ language: lang, restoreSession: true, showStartOnLaunch: false, tutorialDone: true, ...(session || {}) }));
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(root, 'server', 'server.js'), '--port', String(port), '--config', config, '--no-open'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MTM_NO_OPEN: '1' } });
  server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  await waitFor(`http://127.0.0.1:${port}/`);
  const debugPort = await freePort();
  const bin = browserPath();
  if (!bin) throw new Error('Edge or Chrome is needed');
  const browser = spawn(bin, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(profile, 'browser')}`, `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1', `--lang=${lang}`, 'about:blank'], { stdio: 'ignore' });
  const list = await (await waitFor(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const pageInfo = list.find((x) => x.type === 'page');
  const ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const events = [];
  const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result); return; }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
    events.push(msg);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { id += 1; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/${query}` });
  const page = {
    send, errors, events, port,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} ${r.exceptionDetails.exception ? r.exceptionDetails.exception.description : ''}`);
      return r.result.value;
    },
    async waitFor(expr, ms = 15000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await page.eval(expr)) return true; } catch { /* page loading */ } await sleep(100); }
      throw new Error(`timeout: ${expr}`);
    },
    sleep,
    async mouse(type, x, y, opts = {}) { await send('Input.dispatchMouseEvent', { type, x, y, button: opts.button || 'left', clickCount: opts.clickCount || 1, buttons: type === 'mouseReleased' ? 0 : 1, modifiers: opts.modifiers || 0 }); },
    async click(x, y, opts = {}) { await page.mouse('mouseMoved', x, y, { ...opts }); await page.mouse('mousePressed', x, y, opts); await page.mouse('mouseReleased', x, y, opts); },
    async clickSel(sel) {
      const r = await page.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
      if (!r) throw new Error(`no element ${sel}`);
      await page.click(r.x, r.y);
    },
    async drag(x0, y0, x1, y1, steps = 12) {
      await page.mouse('mouseMoved', x0, y0);
      await page.mouse('mousePressed', x0, y0);
      for (let i = 1; i <= steps; i++) await page.mouse('mouseMoved', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
      await page.mouse('mouseReleased', x1, y1);
    },
    async key(key, { code, text, modifiers = 0, keyCode, commands } = {}) {
      const kc = keyCode || { Enter: 13, Tab: 9, Escape: 27, Delete: 46, Backspace: 8, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, F2: 113, F4: 115, F5: 116, Home: 36, Insert: 45, ' ': 32 }[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
      await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code: code || key, windowsVirtualKeyCode: kc, modifiers, text, ...(commands ? { commands } : {}) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || key, windowsVirtualKeyCode: kc, modifiers });
    },
    async type(text) { await send('Input.insertText', { text }); },
    async shot(file, clip) {
      const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    async close() {
      try { ws.close(); } catch { /* gone */ }
      browser.kill();
      server.kill();
      await sleep(300);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
    },
  };
  return page;
}
