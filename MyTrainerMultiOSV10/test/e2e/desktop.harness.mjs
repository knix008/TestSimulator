// The real MyTrainer desktop program (debug build with the page embedded:
// `tauri build --debug --no-bundle`), driven over the DevTools protocol of WebView2.
// Every run gets its own WebView2 profile, config and data folders, so the user's
// settings, recent files and PyTorch environment are untouched.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listTargets, Page, sleep, waitTarget } from './cdp.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const exe = path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'MyTrainer.exe' : 'MyTrainer');

function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export class App {
  /** env: extra variables (MYTRAINER_PYTHON points the PyTorch engine at a Python). */
  constructor({ env = {}, storage = null } = {}) {
    this.extraEnv = env;
    // Tests drive the app themselves: no "training finished" or welcome popup in the way (unless a test asks for it).
    const key = 'mytrainer.settings.v1';
    this.storage = storage?.[key] && typeof storage[key] === 'object' ? { ...storage, [key]: { notifyTrainDone: false, showWelcome: false, ...storage[key] } } : storage;
  }

  async start() {
    if (!fs.existsSync(exe)) throw new Error(`${path.relative(root, exe)} is missing: run "npx tauri build --debug --no-bundle" first.`);
    this.work = fs.mkdtempSync(path.join(os.tmpdir(), 'mytrainer-e2e-'));
    for (const name of ['profile', 'config', 'data', 'files', 'lock']) fs.mkdirSync(path.join(this.work, name), { recursive: true });
    this.port = await freePort();
    const env = {
      ...process.env,
      MYTRAINER_MULTI: '1',
      MYTRAINER_NO_OPEN: '1',
      MYTRAINER_CONFIG_DIR: path.join(this.work, 'config'),
      MYTRAINER_DATA_DIR: path.join(this.work, 'data'),
      MYTRAINER_LOCK_DIR: path.join(this.work, 'lock'),
      WEBVIEW2_USER_DATA_FOLDER: path.join(this.work, 'profile'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${this.port}`,
      ...this.extraEnv,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    this.process = spawn(exe, [], { cwd: this.work, env, stdio: 'ignore' });
    this.exited = new Promise((resolve) => this.process.once('exit', resolve));
    const target = await waitTarget(this.port, (item) => item.type === 'page' && !String(item.title).startsWith('popup-') && !String(item.url).includes('popup='), 60000);
    this.main = await new Page(target).open();
    await this.main.waitFor('Boolean(window.__mytrainer)', { timeout: 60000, message: 'the app did not start' });
    if (this.storage) {
      await this.main.eval(`(() => { ${Object.entries(this.storage).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(typeof v === 'string' ? v : JSON.stringify(v))});`).join('')} location.reload(); return 1; })()`);
      await sleep(1500);
      const again = await waitTarget(this.port, (item) => item.type === 'page' && !String(item.title).startsWith('popup-'), 30000);
      this.main.close();
      this.main = await new Page(again).open();
      await this.main.waitFor('Boolean(window.__mytrainer)', { timeout: 60000 });
    }
    return this;
  }

  /** A popup window's page ("popup-<kind>"). */
  async popup(kind, timeout = 15000) {
    const target = await waitTarget(this.port, (item) => String(item.title) === `popup-${kind}`, timeout);
    return new Page(target).open();
  }

  async targets() { return listTargets(this.port); }

  async close() {
    this.main?.close();
    if (this.process && this.process.exitCode == null) {
      if (process.platform === 'win32') spawn('taskkill', ['/PID', String(this.process.pid), '/T', '/F'], { stdio: 'ignore' });
      else this.process.kill('SIGKILL');
      await Promise.race([this.exited, sleep(5000)]);
    }
    await sleep(800);
    try { fs.rmSync(this.work, { recursive: true, force: true }); } catch { /* WebView2 may still hold its profile */ }
  }
}
