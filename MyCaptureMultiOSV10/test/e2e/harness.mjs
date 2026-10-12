// Starts the real MyCapture app for end-to-end tests and drives it over the
// Chrome DevTools Protocol (WebView2 on Windows), with no browser automation library.
//
// - Vite serves the UI on :1420 (reused when a dev server already runs there).
// - The debug binary runs with its own WebView2 profile, so the user's settings
//   and any installed MyCapture are never touched.
// - Fake media flags auto-accept the screen picker and provide a test microphone.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const exe = path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'mycapture.exe' : 'mycapture');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

async function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** CDP session on one page target. */
export class Page {
  constructor(target) {
    this.target = target;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
  }

  async open() {
    this.ws = new WebSocket(this.target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    // A window that closes (Esc, close button) never answers; fail fast instead of hanging.
    this.ws.onclose = () => {
      for (const resolve of this.pending.values()) resolve({ error: { message: 'window closed' } });
      this.pending.clear();
    };
    this.ws.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.id && this.pending.has(data.id)) {
        this.pending.get(data.id)(data);
        this.pending.delete(data.id);
      } else if (data.method === 'Runtime.exceptionThrown') {
        this.errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text);
      }
    };
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    return this;
  }

  send(method, params = {}, timeout = 15000) {
    return new Promise((resolve) => {
      if (this.ws.readyState !== WebSocket.OPEN) return resolve({ error: { message: 'window closed' } });
      const id = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ error: { message: `${method} timed out` } });
      }, timeout);
      this.pending.set(id, (response) => { clearTimeout(timer); resolve(response); });
      this.ws.send(JSON.stringify({ id, method, params }));
      return undefined;
    });
  }

  async eval(expression) {
    const response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.error) throw new Error(response.error.message);
    const details = response.result?.exceptionDetails;
    if (details) throw new Error(details.exception?.description ?? details.text);
    return response.result?.result?.value;
  }

  /** Clicks the element via the DOM (fast, deterministic). Throws if missing or disabled. */
  async click(selector) {
    const result = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'missing';
      if (el.disabled) return 'disabled';
      el.click();
      return 'ok';
    })()`);
    if (result !== 'ok') throw new Error(`${selector}: ${result}`);
  }

  async mouse(type, x, y) {
    await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });
  }

  async key(key) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 });
  }

  /** Polls `expression` until it returns a truthy value. */
  async waitFor(expression, { timeout = 15000, interval = 150, message } = {}) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      try {
        last = await this.eval(expression);
        if (last) return last;
      } catch (error) {
        last = error.message;
      }
      await sleep(interval);
    }
    throw new Error(`${message ?? 'timed out waiting for'} ${expression.slice(0, 120)} (last: ${JSON.stringify(last)?.slice(0, 200)})`);
  }

  close() {
    this.ws?.close();
  }
}

export class App {
  async start() {
    if (!fs.existsSync(exe)) throw new Error(`${path.relative(root, exe)} 가 없습니다. cargo build 를 먼저 실행하세요.`);
    this.output = fs.mkdtempSync(path.join(os.tmpdir(), 'mycapture-e2e-out-'));
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mycapture-e2e-profile-'));
    // Saved window place/size; the user's own window-state.json stays untouched.
    this.config = fs.mkdtempSync(path.join(os.tmpdir(), 'mycapture-e2e-config-'));

    if (!(await portOpen(1420))) {
      const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
      this.vite = spawn(process.execPath, [vite, '--port', '1420', '--strictPort'], { cwd: root, stdio: 'ignore' });
      for (let i = 0; i < 100 && !(await portOpen(1420)); i++) await sleep(100);
    }

    await this.launch();
    return this;
  }

  /** Starts the app process (again) with this run's folders and attaches to its main page. */
  async launch() {
    this.port = await freePort();
    const env = {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: this.profile,
      MYCAPTURE_CONFIG_DIR: this.config,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: [
        `--remote-debugging-port=${this.port}`,
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--auto-select-desktop-capture-source=Entire screen',
      ].join(' '),
    };
    this.env = env;
    this.process = spawn(exe, [], { cwd: root, env, stdio: 'ignore' });
    this.main = await (await this.page((target) => !this.isOverlay(target), 30000)).open();
    await this.main.waitFor(`document.querySelector('#bar .brand') && window.__mycapture`, { timeout: 30000 });
  }

  /** Starts a second copy with this run's folders (it should refuse to run next to the first). */
  spawnSecond() {
    return spawn(exe, [], { cwd: root, env: { ...this.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '' }, stdio: 'ignore' });
  }

  /** Kills the app the hard way (like a crash) and starts it again with the same profile and settings. */
  async restart() {
    this.main?.close();
    await this.kill();
    await this.launch();
  }

  async kill() {
    if (!this.process || this.process.exitCode != null) return;
    const exited = new Promise((resolve) => this.process.once('exit', resolve));
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(this.process.pid), '/T', '/F'], { stdio: 'ignore' });
    else this.process.kill('SIGKILL');
    await Promise.race([exited, sleep(5000)]);
    await sleep(500);
  }

  async targets() {
    const response = await fetch(`http://127.0.0.1:${this.port}/json/list`);
    return (await response.json()).filter((target) => target.type === 'page');
  }

  isOverlay(target) {
    return Boolean(this.overlayIds?.has(target.id));
  }

  /** Waits for a page target matching `match`. */
  async page(match, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        const hit = (await this.targets()).find(match);
        if (hit) return new Page(hit);
      } catch { /* debugger not up yet */ }
      await sleep(200);
    }
    throw new Error('page target not found');
  }

  /** Page targets other than the main window (overlays, recording controls). */
  async otherPages() {
    return (await this.targets()).filter((target) => target.id !== this.main.target.id);
  }

  /** Attaches to a popup window ("settings", "about", "confirm", "theme-menu") once it is up. */
  async popup(kind, timeout = 15000) {
    const page = await (await this.page((target) => target.title === `popup-${kind}`, timeout)).open();
    await page.waitFor(`document.querySelector('.popup, .popup-menu')`, { timeout });
    return page;
  }

  /** True while a popup window of that kind exists. */
  async hasPopup(kind) {
    return (await this.targets()).some((target) => target.title === `popup-${kind}`);
  }

  /** Reloads the main page with the given settings (and an output folder for auto-save). */
  async reset(settings = {}, { keepGallery = false } = {}) {
    await this.main.eval(`Promise.all(['settings', 'about', 'confirm', 'theme-menu'].map((kind) => window.__TAURI_INTERNALS__.invoke('close_popup', { kind }))).then(() => 1)`);
    const merged = { askPath: false, imageDirectory: this.output, videoDirectory: this.output, language: 'ko', ...settings };
    await this.main.eval(`localStorage.setItem('mycapture.settings.v1', ${JSON.stringify(JSON.stringify(merged))}); ${keepGallery ? '' : "localStorage.removeItem('mycapture.gallery.v1');"} location.reload(); 1`);
    await sleep(400);
    await this.main.waitFor(`document.querySelector('#bar .brand') && window.__mycapture && window.__mycapture.state.monitors.length > 0`, { timeout: 20000 });
  }

  /** Clears the status line so the next notice can be awaited. */
  async clearNotice() {
    await this.main.eval(`document.querySelector('[data-action="dismiss"]')?.click(); 1`);
  }

  /** Waits for a success or error notice and returns { kind, text }. */
  async notice(timeout = 20000) {
    const raw = await this.main.waitFor(`(() => { const n = window.__mycapture.state.notice; return n && (n.kind === 'success' || n.kind === 'error') ? JSON.stringify(n) : null; })()`, { timeout });
    return JSON.parse(raw);
  }

  newestFile(extension) {
    return fs.readdirSync(this.output)
      .filter((name) => name.toLowerCase().endsWith(extension))
      .map((name) => path.join(this.output, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  }

  async stop() {
    this.main?.close();
    await this.kill();
    this.vite?.kill();
    await sleep(300);
    for (const dir of [this.output, this.profile, this.config]) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* WebView2 may still hold the profile briefly */ }
    }
  }
}
