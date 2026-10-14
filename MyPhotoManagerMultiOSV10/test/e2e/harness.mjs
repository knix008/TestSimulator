// Starts the real MyPhotoManager desktop app (debug build) and drives it over
// the Chrome DevTools Protocol (WebView2 on Windows). The app gets its own
// WebView2 profile, config and data folders, and a copy of the fixture photos,
// so nothing of the user's is touched.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Page, sleep, waitTarget } from './cdp.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const fixtures = path.join(root, 'test', 'fixtures', 'photos');
const exe = path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'myphotomanager.exe' : 'myphotomanager');
export const DEV_PORT = 1440;

export function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

export async function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

export const READY = `Boolean(window.__myphoto && document.body.classList.contains('ready'))`;

export class App {
  /** options.prepare(work): add files before the app starts; options.env(work): extra environment. */
  constructor(options = {}) {
    this.options = options;
  }

  async start() {
    if (!fs.existsSync(exe)) throw new Error(`${path.relative(root, exe)} 가 없습니다. cargo build 를 먼저 실행하세요.`);
    this.work = fs.mkdtempSync(path.join(os.tmpdir(), 'myphoto-e2e-'));
    this.photos = path.join(this.work, 'photos');
    this.profile = path.join(this.work, 'profile');
    this.config = path.join(this.work, 'config');
    this.data = path.join(this.work, 'data');
    for (const dir of [this.profile, this.config, this.data]) fs.mkdirSync(dir, { recursive: true });
    copyDir(fixtures, this.photos);
    await this.options.prepare?.(this.work);
    if (!(await portOpen(DEV_PORT))) {
      this.vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(DEV_PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
      for (let i = 0; i < 150 && !(await portOpen(DEV_PORT)); i++) await sleep(100);
    }
    // Let Vite transform and pre-bundle before the app loads (first run after a change is slow).
    for (const file of ['/', '/src/main.js', '/src/app.js', '/src/thumbs/worker.js']) {
      try { await (await fetch(`http://localhost:${DEV_PORT}${file}`, { signal: AbortSignal.timeout(60000) })).text(); } catch { /* reported by the load */ }
    }
    await this.launch([this.photos]);
    return this;
  }

  async launch(args = []) {
    this.port = await freePort();
    const env = { ...process.env, MYPHOTO_MULTI: '1', MYPHOTO_CONFIG_DIR: this.config, MYPHOTO_DATA_DIR: this.data, WEBVIEW2_USER_DATA_FOLDER: this.profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${this.port}`, ...(this.options.env?.(this.work) ?? {}) };
    delete env.ELECTRON_RUN_AS_NODE;
    this.process = spawn(exe, args, { cwd: root, env, stdio: 'ignore' });
    this.exited = new Promise((resolve) => this.process.once('exit', resolve));
    const target = await waitTarget(this.port, (item) => item.type === 'page', 40000);
    this.main = await new Page(target).open();
    try {
      await this.main.waitFor(READY, { timeout: 40000 });
    } catch {
      await this.main.eval('location.reload(); 1').catch(() => {});
      await sleep(1500);
      await this.main.waitFor(READY, { timeout: 40000 });
    }
    // Background image analysis stays off unless a test asks for it (it would load the models and change the catalog).
    if (!this.options.analysis) await this.main.eval('window.__myphoto?.analysis?.suspendAuto(true); 1').catch(() => {});
  }

  async restart(args = []) {
    this.main?.close();
    await this.kill();
    await this.launch(args);
  }

  async quit() {
    await this.main.eval(`window.__TAURI_INTERNALS__.invoke('quit_app').catch(() => 1); 1`).catch(() => {});
    await Promise.race([this.exited, sleep(8000)]);
    this.main?.close();
    await sleep(500);
  }

  async kill() {
    if (!this.process || this.process.exitCode != null) return;
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(this.process.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else this.process.kill('SIGKILL');
    await Promise.race([this.exited, sleep(5000)]);
    await sleep(500);
  }

  async stop() {
    this.main?.close();
    await this.kill();
    this.vite?.kill();
    await sleep(300);
    try { fs.rmSync(this.work, { recursive: true, force: true }); } catch { /* WebView2 may still hold the profile */ }
  }
}
