// Serves the web build (dist/) with `vite preview` and drives it in headless
// Microsoft Edge or Chrome over the DevTools Protocol.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Page, sleep, waitTarget } from './cdp.mjs';
import { freePort, portOpen, READY, root } from './harness.mjs';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
];

export class WebApp {
  async start({ width = 1500, height = 950 } = {}) {
    const browser = BROWSERS.find((file) => fs.existsSync(file));
    if (!browser) throw new Error('Edge 또는 Chrome 이 필요합니다');
    this.webPort = await freePort();
    this.server = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(this.webPort), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
    for (let i = 0; i < 100 && !(await portOpen(this.webPort)); i++) await sleep(100);
    this.url = `http://127.0.0.1:${this.webPort}/`;
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), 'myphoto-web-'));
    this.port = await freePort();
    this.browser = spawn(browser, ['--headless=new', `--remote-debugging-port=${this.port}`, `--user-data-dir=${this.profile}`, `--window-size=${width},${height}`, '--no-first-run', '--disable-features=Translate', this.url], { stdio: 'ignore' });
    const target = await waitTarget(this.port, (item) => item.type === 'page' && item.url.startsWith(this.url), 20000);
    this.main = await new Page(target).open();
    this.main.on('Page.javascriptDialogOpening', () => this.main.send('Page.handleJavaScriptDialog', { accept: true }));
    await this.main.waitFor(READY, { timeout: 20000 });
    return this;
  }

  async reload() {
    await this.main.eval('location.reload(); 1').catch(() => {});
    await sleep(600);
    await this.main.waitFor(READY, { timeout: 20000 });
  }

  async stop() {
    this.main?.close();
    this.browser?.kill();
    this.server?.kill();
    await sleep(500);
    try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch { /* still in use */ }
  }
}
