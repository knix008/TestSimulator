// A small Chrome DevTools Protocol driver (Node 22 WebSocket, no Playwright) for the GUI
// tests and the tutorial / help captures. Two ways to run the app:
//   launch()                    the web page (server.js on a free port) in headless Edge / Chrome;
//                               downloads (every export) land in page.downloads
//   launch({ desktop: true })   the real Tauri program (src-tauri/target/debug/…exe, page from the
//                               dev server on :5193) with WebView2's CDP port; settings.json and the
//                               WebView2 profile live in a throw-away folder (MYDCMVIEWER_CONFIG_DIR)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function browserPath() {
  const list = process.platform === 'win32'
    ? [`${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`, `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`, `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`]
    : process.platform === 'darwin'
      ? ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return list.find((p) => p && fs.existsSync(p)) || null;
}

export function freePort() {
  return new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}
async function portBusy(port) {
  return new Promise((resolve) => { const s = net.createServer(); s.once('error', () => resolve(true)); s.listen(port, '127.0.0.1', () => s.close(() => resolve(false))); });
}

async function waitFor(url, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return r; } catch { /* not yet */ }
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${url}`);
}

export function desktopExe() {
  const dir = path.join(root, 'src-tauri', 'target', 'debug');
  for (const n of ['MyDCMViewer.exe', 'mydcmviewer.exe', 'MyDCMViewer', 'mydcmviewer']) if (fs.existsSync(path.join(dir, n))) return path.join(dir, n);
  return null;
}

/** settings: seeded into localStorage (web) or settings.json (desktop). */
/** env: extra environment for the desktop program (e.g. the MYDCMVIEWER_TEST_* dialog answers). */
export async function launch({ width = 1440, height = 900, lang = 'en', settings = {}, desktop = false, args = [], env: extraEnv = {} } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dcmv-cdp-'));
  const downloads = path.join(profile, 'downloads');
  fs.mkdirSync(downloads, { recursive: true });
  const seed = { lang, showStartOnLaunch: false, tutorialDone: true, ...settings };
  const children = [];
  let debugPort, port;
  if (desktop) {
    const exe = desktopExe();
    if (!exe) throw new Error('Build the desktop program first: cargo build --manifest-path src-tauri/Cargo.toml');
    if (!(await portBusy(5193))) {
      const server = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, PORT: '5193', STRICT_PORT: '1' } });
      server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
      children.push(server);
      await waitFor('http://127.0.0.1:5193/');
    }
    const config = path.join(profile, 'config');
    fs.mkdirSync(config, { recursive: true });
    fs.writeFileSync(path.join(config, 'settings.json'), JSON.stringify({ windowBounds: { width, height }, ...seed }));
    debugPort = await freePort();
    const env = { ...process.env, MYDCMVIEWER_CONFIG_DIR: config, MYDCMVIEWER_DEBUG_PORT: String(debugPort), ...extraEnv };
    delete env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
    const app = spawn(exe, args, { cwd: root, stdio: 'ignore', env });
    children.push(app);
  } else {
    port = await freePort();
    const server = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, PORT: String(port), STRICT_PORT: '1' } });
    server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
    children.push(server);
    await waitFor(`http://127.0.0.1:${port}/`);
    debugPort = await freePort();
    const bin = browserPath();
    if (!bin) throw new Error('Edge or Chrome is needed');
    children.push(spawn(bin, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(profile, 'browser')}`, `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required', `--lang=${lang}`, 'about:blank'], { stdio: 'ignore' }));
  }
  const t0 = Date.now();
  let pageInfo = null;
  while (!pageInfo && Date.now() - t0 < 60000) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      pageInfo = list.find((x) => x.type === 'page' && (desktop ? /index\.html|localhost:5193\/?$/.test(x.url) && !/popup\.html/.test(x.url) : true));
    } catch { /* not yet */ }
    if (!pageInfo) await sleep(250);
  }
  if (!pageInfo) { children.forEach((c) => c.kill()); throw new Error('no page target'); }
  const page = await connect(pageInfo.webSocketDebuggerUrl, { debugPort });
  page.profile = profile; page.downloads = downloads; page.port = port; page.desktop = desktop; page.debugPort = debugPort;
  if (!desktop) {
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!localStorage.getItem('dcmviewer.settings')) localStorage.setItem('dcmviewer.settings', ${JSON.stringify(JSON.stringify(seed))}); } catch (e) {}` });
    await page.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true }).catch(() => page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads }));
    await page.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
    await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  }
  await page.waitFor('window.App && document.readyState === "complete"', 30000);
  const close = page.close;
  page.close = async () => {
    await close();
    for (const c of children) { try { c.kill(); } catch { /* gone */ } }
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
  };
  /** Targets of popup windows (desktop): [{ url, webSocketDebuggerUrl }] */
  page.targets = async () => (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).filter((x) => x.type === 'page');
  page.connectTarget = (t) => connect(t.webSocketDebuggerUrl, { debugPort });
  return page;
}

export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  const listeners = new Set();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result); return; }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
    for (const fn of listeners) fn(msg);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { id += 1; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  const page = {
    send, errors, on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, sleep,
    async eval(expr, ms = 60000) {
      const r = await Promise.race([send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }), sleep(ms).then(() => { throw new Error(`eval timeout: ${expr.slice(0, 80)}`); })]);
      if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} ${r.exceptionDetails.exception ? r.exceptionDetails.exception.description : ''}`);
      return r.result.value;
    },
    async waitFor(expr, ms = 15000) {
      const t0 = Date.now();
      let last = null;
      while (Date.now() - t0 < ms) { try { if (await page.eval(expr, 5000)) return true; } catch (e) { last = e; } await sleep(100); }
      throw new Error(`timeout: ${expr}${last ? ` (${last.message})` : ''}`);
    },
    async mouse(type, x, y, opts = {}) { await send('Input.dispatchMouseEvent', { type, x, y, button: opts.button || 'left', clickCount: opts.clickCount || 1, buttons: type === 'mouseReleased' ? 0 : (opts.button === 'right' ? 2 : 1), modifiers: opts.modifiers || 0, deltaX: opts.deltaX || 0, deltaY: opts.deltaY || 0 }); },
    async click(x, y, opts = {}) { await page.mouse('mouseMoved', x, y, opts); await page.mouse('mousePressed', x, y, opts); await page.mouse('mouseReleased', x, y, opts); },
    async wheel(x, y, deltaY, modifiers = 0) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY, modifiers }); },
    async rect(sel) {
      return page.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; })()`);
    },
    async clickSel(sel, opts) {
      const r = await page.rect(sel);
      if (!r || r.w === 0) throw new Error(`no visible element ${sel}`);
      await page.click(r.cx, r.cy, opts);
    },
    async drag(x0, y0, x1, y1, { steps = 12, button = 'left', modifiers = 0 } = {}) {
      await page.mouse('mouseMoved', x0, y0, { modifiers });
      await page.mouse('mousePressed', x0, y0, { button, modifiers });
      for (let i = 1; i <= steps; i++) await page.mouse('mouseMoved', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, { button, modifiers });
      await page.mouse('mouseReleased', x1, y1, { button, modifiers });
    },
    async key(key, { code, text, modifiers = 0, keyCode } = {}) {
      const kc = keyCode || { Enter: 13, Tab: 9, Escape: 27, Delete: 46, Backspace: 8, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, F1: 112, F9: 120, F11: 122, Home: 36, End: 35, PageUp: 33, PageDown: 34, ' ': 32 }[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
      await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code: code || (key.length === 1 && /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key.length === 1 && /\d/.test(key) ? `Digit${key}` : key), windowsVirtualKeyCode: kc, modifiers, text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || key, windowsVirtualKeyCode: kc, modifiers });
    },
    async type(text) { await send('Input.insertText', { text }); },
    async shot(file, clip) {
      const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    async close() { try { ws.close(); } catch { /* gone */ } },
  };
  return page;
}
