// The desktop program under test: the debug build (src-tauri/target/debug, `node node_modules/@tauri-apps/cli/tauri.js
// build --debug --no-bundle`) started with its own WebView2 profile and data folders in a temp folder,
// MYCHARTMASTER_MULTI=1 (no single-instance bookkeeping) and a DevTools port, driven over CDP.
// It closes only the process it started and removes its temp folder. Nothing is printed on a real printer.
//
//   const app = new DesktopApp(); const why = await app.start(); await app.run(`return A.doc()?.name`); await app.stop();
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exeName = process.platform === 'win32' ? 'MyChartMaster.exe' : 'MyChartMaster';

/** A CDP connection to one page target. */
export async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result); }
    else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description ?? 'exception');
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); setTimeout(() => { if (pending.has(n)) { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); } }, 60000); });
  await send('Runtime.enable');
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, evaluate, errors, close: () => ws.close(), screenshot: async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); } };
}

export class DesktopApp {
  /** installLanguage: the start is the first one after an installation in that language (the installer's marker). */
  constructor({ installLanguage = 'en' } = {}) {
    this.installLanguage = installLanguage;
    this.out = path.join(root, 'test-results', 'desktop');
    this.notes = [];
    this.seen = 0;
  }

  /** Starts the program; { skipped } when there is no debug build to run. */
  async start() {
    fs.mkdirSync(this.out, { recursive: true });
    this.program = [process.env.MYCHARTMASTER_E2E_EXE, path.join(root, 'src-tauri', 'target', 'debug', exeName)].filter(Boolean).find((p) => fs.existsSync(p));
    if (!this.program) return { skipped: 'no debug build — run `node node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle` first' };
    this.notes.push(path.relative(root, this.program));
    this.temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mychartmaster-desktop-'));
    this.port = 9500 + Math.floor(Math.random() * 300);
    // As the installer leaves it (hooks.nsh › MumWriteLanguage), in this run's own data folder.
    if (this.installLanguage) {
      const data = path.join(this.temp, 'config');
      fs.mkdirSync(data, { recursive: true });
      fs.writeFileSync(path.join(data, 'install-language'), this.installLanguage);
      this.languageMarker = path.join(data, 'install-language');
    }
    this.child = spawn(this.program, [], {
      env: {
        ...process.env, MYCHARTMASTER_MULTI: '1',
        WEBVIEW2_USER_DATA_FOLDER: path.join(this.temp, 'webview'),
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${this.port} --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`,
        APPDATA: path.join(this.temp, 'appdata'), LOCALAPPDATA: path.join(this.temp, 'localappdata'),
        // Tauri finds the app's folders through Windows (not APPDATA): the program's own overrides keep the window
        // place, the installer markers, the data files and the instance lock inside this run's temp folder.
        MYCHARTMASTER_CONFIG_DIR: path.join(this.temp, 'config'), MYCHARTMASTER_DATA_DIR: path.join(this.temp, 'data'), MYCHARTMASTER_LOCK_DIR: path.join(this.temp, 'lock'),
      },
      stdio: 'ignore',
    });
    const end = Date.now() + 60000;
    while (!this.main && Date.now() < end) {
      const target = (await this.targets()).find((t) => t.type === 'page' && !/[?&](popup|viewer)=/.test(t.url) && !t.url.startsWith('about:'));
      if (target) this.main = await connect(target);
      else await sleep(300);
    }
    if (!this.main) throw new Error('no page target on the DevTools port');
    await this.run(`await until(() => A && document.querySelector('.start-board'), 30000); return true;`);
    return null;
  }

  async targets() {
    try { return await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json(); } catch { return []; }
  }

  run(body) {
    return this.main.evaluate(`(async () => { const A = window.__mychartmaster; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const until = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(80); } throw new Error('timeout: ' + fn.toString().slice(0, 120)); };
      const q = (s) => document.querySelector(s); const qa = (s) => [...document.querySelectorAll(s)];
      ${body} })()`);
  }

  takeErrors() {
    const fresh = this.main ? this.main.errors.slice(this.seen) : [];
    this.seen = this.main?.errors.length ?? 0;
    return fresh;
  }

  async recover() {
    await this.run(`await A.popups.closeAll(); for (const d of [...A.state.docs]) await A.actions.closeDoc(d, { force: true }); return 1;`).catch(() => {});
    this.takeErrors();
  }

  async screenshot(name) {
    await this.main?.screenshot(path.join(this.out, `${name.replace(/[^\w.-]+/g, '_')}.png`)).catch(() => {});
  }

  /** Closes the program (only the copy this harness started) and removes its temp data. */
  async stop() {
    if (!this.child) return { ok: true };
    // The window closes before it can answer: wait a few seconds at most, not the 60 s CDP timeout.
    await Promise.race([this.run(`A.state.quitting = true; await window.__TAURI_INTERNALS__.invoke('quit_app'); return true;`).catch(() => {}), sleep(4000)]);
    for (let i = 0; i < 20 && this.child.exitCode == null && this.child.signalCode == null; i++) await sleep(150);
    const exited = this.child.exitCode != null || this.child.signalCode != null;
    try { this.child.kill(); } catch { /* gone */ }
    await sleep(500);
    try { fs.rmSync(this.temp, { recursive: true, force: true, maxRetries: 5 }); } catch { /* locked */ }
    this.main?.close();
    return exited || this.child.killed ? { ok: true } : { ok: false, error: `process ${this.child.pid} still running` };
  }
}
