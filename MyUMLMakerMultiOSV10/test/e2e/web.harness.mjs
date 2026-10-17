// Serves the web build (dist/) and drives it in headless Microsoft Edge or
// Chrome over the DevTools Protocol. Popups are frames inside the page there.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Page, sleep, waitTarget } from './cdp.mjs';
import { freePort, portOpen, root } from './harness.mjs';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
];

export class WebApp {
  async start() {
    const browser = BROWSERS.find((file) => fs.existsSync(file));
    if (!browser) throw new Error('Edge 또는 Chrome 이 필요합니다');
    this.webPort = await freePort();
    this.server = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(this.webPort), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
    for (let i = 0; i < 100 && !(await portOpen(this.webPort)); i++) await sleep(100);
    this.url = `http://127.0.0.1:${this.webPort}/`;
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), 'myumlmaker-web-'));
    this.port = await freePort();
    // No sync and no extensions: Edge signs in with the Windows account, syncs the user's extensions and one
    // of them opened its welcome tab in front of the page a minute in (the page went hidden and stopped drawing).
    this.browser = spawn(browser, ['--headless=new', `--remote-debugging-port=${this.port}`, `--user-data-dir=${this.profile}`, '--window-size=1500,950', '--no-first-run', '--disable-features=Translate', '--disable-sync', '--disable-extensions', this.url], { stdio: 'ignore' });
    const target = await waitTarget(this.port, (item) => item.type === 'page' && item.url.startsWith(this.url), 20000);
    this.main = await new Page(target).open();
    // "Leave the page?" (unsaved boards) is answered automatically and recorded.
    this.dialogs = [];
    this.main.on('Page.javascriptDialogOpening', (params) => {
      this.dialogs.push(params.type);
      this.main.send('Page.handleJavaScriptDialog', { accept: true });
    });
    const browserInfo = await (await fetch(`http://127.0.0.1:${this.port}/json/version`)).json();
    this.browserSocket = browserInfo.webSocketDebuggerUrl;
    await this.grantClipboard();
    await this.main.waitFor(`Boolean(window.__myumlmaker && document.querySelector('#toolbar .tool-button') && document.querySelector('#statusbar .status-notice'))`, { timeout: 20000 });
    return this;
  }

  /** Clipboard read/write without prompts (browser-level CDP command). */
  async grantClipboard() {
    const ws = new WebSocket(this.browserSocket);
    await new Promise((resolve) => { ws.onopen = resolve; });
    await new Promise((resolve) => {
      ws.onmessage = resolve;
      ws.send(JSON.stringify({ id: 1, method: 'Browser.grantPermissions', params: { origin: this.url.replace(/\/$/, ''), permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] } }));
    });
    ws.close();
  }

  /** Evaluates inside a popup frame (same origin). */
  frame(kind, expression) {
    return this.main.eval(`(() => { const f = document.querySelector('.web-popup-${kind} iframe'); if (!f || !f.contentWindow?.__myumlmakerPopup) return null; return ((window, document) => (${expression}))(f.contentWindow, f.contentDocument); })()`);
  }

  async waitFrame(kind, expression = 'true', timeout = 15000) {
    return this.main.waitFor(`(() => { const f = document.querySelector('.web-popup-${kind} iframe'); if (!f || !f.contentWindow?.__myumlmakerPopup || getComputedStyle(f.parentElement).visibility === 'hidden') return false; return ((window, document) => Boolean(document.querySelector('.popup, .popup-menu') && (${expression})))(f.contentWindow, f.contentDocument); })()`, { timeout });
  }

  async reload() {
    await this.main.eval('location.reload(); 1').catch(() => {});
    await sleep(500);
    await this.main.waitFor(`Boolean(window.__myumlmaker && document.querySelector('#toolbar .tool-button') && document.querySelector('#statusbar .status-notice'))`, { timeout: 20000 });
  }

  async stop() {
    this.main?.close();
    this.browser?.kill();
    this.server?.kill();
    await sleep(500);
    try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch { /* still in use */ }
  }
}
