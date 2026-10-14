// Starts the real MyCAD desktop app (debug build) for end-to-end tests
// and drives it over the Chrome DevTools Protocol (WebView2 on Windows).
//
// - Vite is started on a port nobody uses (never an already running server:
//   another program's page would show). The debug build loads its UI from
//   1450; scripts/test.mjs builds it for another port through TAURI_CONFIG.
// - The app runs with its own WebView2 profile, config and data folders, so the
//   user's settings, recent files and any installed MyCAD are untouched.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listTargets, Page, sleep, waitTarget } from './cdp.mjs';
import { BASE_PORT, freeDevPort, portInUse } from '../../scripts/port.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const exe = path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'mycad.exe' : 'mycad');
export const DEV_PORT = BASE_PORT;

/** The env for cargo build: the debug app loads its UI from that port (1450 is tauri.conf.json's). */
export const devPortEnv = (port) => (port === BASE_PORT ? {} : { TAURI_CONFIG: JSON.stringify({ build: { devUrl: `http://localhost:${port}` } }) });

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

export class App {
  /** devPort: the port the debug build was made for (scripts/test.mjs picks a free one). */
  constructor({ ioDelay = 0, devPort = BASE_PORT } = {}) {
    this.ioDelay = ioDelay;
    this.devPort = devPort;
  }

  async start() {
    if (!fs.existsSync(exe)) throw new Error(`${path.relative(root, exe)} 가 없습니다. cargo build 를 먼저 실행하세요.`);
    this.work = fs.mkdtempSync(path.join(os.tmpdir(), 'mycad-e2e-'));
    this.files = path.join(this.work, 'files');
    this.profile = path.join(this.work, 'profile');
    this.config = path.join(this.work, 'config');
    this.data = path.join(this.work, 'data');
    for (const dir of [this.files, this.profile, this.config, this.data]) fs.mkdirSync(dir, { recursive: true });
    if (await portInUse(this.devPort)) {
      const free = await freeDevPort(this.devPort);
      throw new Error(`포트 ${this.devPort} 을(를) 다른 프로그램이 쓰고 있습니다. npm test 로 실행하거나 앱을 포트 ${free} 용으로 빌드하세요 (TAURI_CONFIG devUrl).`);
    }
    const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
    this.vite = spawn(process.execPath, [vite, '--port', String(this.devPort), '--strictPort'], { cwd: root, stdio: 'ignore' });
    for (let i = 0; i < 150 && !(await portOpen(this.devPort)); i++) await sleep(100);
    await this.warmUp();
    await this.launch();
    return this;
  }

  /**
   * Has Vite transform the app (and pre-bundle its dependencies) before the app
   * loads it. Otherwise, right after a source change, the first page load can be
   * slow or be reloaded by Vite while the test waits.
   */
  async warmUp() {
    const base = `http://localhost:${this.devPort}`;
    for (const file of ['/', '/src/main.js', '/src/app.js', '/src/popup.js']) {
      try { await (await fetch(base + file, { signal: AbortSignal.timeout(60000) })).text(); } catch { /* the app load will report problems */ }
    }
    await sleep(500);
  }

  /** Starts the app process with this run's folders and attaches to the main page. */
  async launch(args = [], extraEnv = {}) {
    this.port = await freePort();
    this.env = {
      MYCAD_NO_OPEN: '1',
      MYCAD_TEST_COMMANDS: '1',
      ...process.env,
      MYCAD_MULTI: '1',
      MYCAD_CONFIG_DIR: this.config,
      MYCAD_DATA_DIR: this.data,
      MYCAD_IO_DELAY_MS: String(this.ioDelay),
      WEBVIEW2_USER_DATA_FOLDER: this.profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${this.port}`,
      ...extraEnv,
    };
    delete this.env.ELECTRON_RUN_AS_NODE;
    this.process = spawn(exe, args, { cwd: root, env: this.env, stdio: 'ignore' });
    this.exited = new Promise((resolve) => this.process.once('exit', resolve));
    const target = await waitTarget(this.port, (item) => item.type === 'page' && !String(item.title).startsWith('popup-'), 40000);
    this.main = await new Page(target).open();
    const ready = `Boolean(window.__mycad && document.querySelector('#toolbar .tool-button') && window.__mycad.state.docs.length)`;
    try {
      await this.main.waitFor(ready, { timeout: 40000 });
    } catch {
      // A page that started loading while Vite was still optimising: load it once more.
      await this.main.eval('location.reload(); 1').catch(() => {});
      await sleep(1000);
      await this.main.waitFor(ready, { timeout: 40000 });
    }
  }

  /**
   * Kills the app (like a crash) and starts it again with the same profile.
   * The kill leaves running.lock behind, so the next start would report an
   * abnormal end; it is removed unless { reportCrash: true }.
   */
  async restart(args = [], extraEnv = {}, { reportCrash = false } = {}) {
    this.main?.close();
    await this.kill();
    if (!reportCrash) fs.rmSync(path.join(this.data, 'running.lock'), { force: true });
    await this.launch(args, extraEnv);
  }

  async kill() {
    if (!this.process || this.process.exitCode != null) return;
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(this.process.pid), '/T', '/F'], { stdio: 'ignore' });
    else this.process.kill('SIGKILL');
    await Promise.race([this.exited, sleep(5000)]);
    await sleep(600);
  }

  targets() {
    return listTargets(this.port);
  }

  /** Attaches to a popup window ("settings", "menu", …) once it is up and drawn. */
  async popup(kind, timeout = 15000) {
    const end = Date.now() + timeout;
    let last;
    // A popup that was just closed may still be listed: retry on a fresh target.
    while (Date.now() < end) {
      const target = await waitTarget(this.port, (item) => item.title === `popup-${kind}`, Math.max(1000, end - Date.now()));
      const page = await new Page(target).open().catch((error) => { last = error; return null; });
      if (!page) { await sleep(200); continue; }
      try {
        await page.waitFor(`Boolean(window.__mycadPopup && document.querySelector('.popup, .popup-menu, .tut-window'))`, { timeout: Math.max(1000, end - Date.now()) });
        return page;
      } catch (error) {
        last = error;
        page.close();
        if (!/window closed/.test(error.message)) throw error;
        await sleep(200);
      }
    }
    throw last ?? new Error(`popup-${kind} did not open`);
  }

  /** Ends the app the normal way (no questions: quit_app) and waits for it to exit. */
  async quit() {
    await this.main.eval(`window.__TAURI_INTERNALS__.invoke('quit_app').catch(() => 1); 1`).catch(() => {});
    await Promise.race([this.exited, sleep(8000)]);
    this.main?.close();
    await sleep(500);
  }

  async hasPopup(kind) {
    return (await this.targets()).some((item) => item.title === `popup-${kind}`);
  }

  /** Window rectangle and visibility of a window of this process, by title (Windows). */
  windowInfo(titlePrefix) {
    const script = `[Console]::OutputEncoding=[Text.Encoding]::UTF8;Add-Type -TypeDefinition 'using System;using System.Text;using System.Runtime.InteropServices;public static class W{public delegate bool P(IntPtr h,IntPtr l);[DllImport("user32.dll")]public static extern bool EnumWindows(P p,IntPtr l);[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);[DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);[DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out R r);[DllImport("user32.dll")]public static extern IntPtr GetWindow(IntPtr h,uint c);[DllImport("user32.dll")]public static extern int GetWindowLong(IntPtr h,int i);[DllImport("user32.dll")]public static extern bool GetClientRect(IntPtr h,out R r);[DllImport("user32.dll")]public static extern bool GetLayeredWindowAttributes(IntPtr h,out uint k,out byte a,out uint f);public struct R{public int L,T,Rt,B;}}';
$pid0=${this.process.pid};$out=@();[W]::EnumWindows({param($h,$l) $p=0;[void][W]::GetWindowThreadProcessId($h,[ref]$p); if($p -eq $pid0){$sb=New-Object System.Text.StringBuilder 256;[void][W]::GetWindowText($h,$sb,256);$r=New-Object W+R;[void][W]::GetWindowRect($h,[ref]$r);$k=0;$a=[byte]255;$f=0;$ex=[W]::GetWindowLong($h,-20);$st=[W]::GetWindowLong($h,-16);if($ex -band 0x80000){[void][W]::GetLayeredWindowAttributes($h,[ref]$k,[ref]$a,[ref]$f)};$script:out+=[pscustomobject]@{title=$sb.ToString();visible=[W]::IsWindowVisible($h);left=$r.L;top=$r.T;right=$r.Rt;bottom=$r.B;owner=[int64][W]::GetWindow($h,4);handle=[int64]$h;layered=[bool]($ex -band 0x80000);alpha=[int]$a;style=[int64]$st}};$true},[IntPtr]::Zero)|Out-Null;$out|ConvertTo-Json -Compress`;
    const text = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }).toString('utf8').trim();
    const list = text ? [].concat(JSON.parse(text)) : [];
    return titlePrefix ? list.filter((item) => item.title.startsWith(titlePrefix)) : list;
  }

  async stop() {
    this.main?.close();
    await this.kill();
    this.vite?.kill();
    await sleep(300);
    try { fs.rmSync(this.work, { recursive: true, force: true }); } catch { /* WebView2 may still hold the profile briefly */ }
  }
}
