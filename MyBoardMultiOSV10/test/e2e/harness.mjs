// Starts the desktop app (the debug build npm start made: src-tauri/target/debug/myboard.exe —
// nothing is built here) for the desktop E2E cases and drives it over the Chrome DevTools Protocol
// (WebView2 started with --remote-debugging-port on a free port).
//
// The page comes from a Vite this harness starts. A debug Tauri exe loads the devUrl that was compiled
// into it (tauri.conf.json build.devUrl, or the --config of `tauri dev`): TAURI_CONFIG / --config are
// read when the program is COMPILED, not when it runs (tauri-codegen), so the environment variable is
// passed for completeness but does not move the page. The harness therefore reads the compiled URL out
// of the exe and starts its Vite on exactly that port when it is free on 127.0.0.1 and ::1. When
// another program (the user's `npm start`) serves that port, a COPY of the exe is made in a
// temporary folder with the compiled port replaced by a free one of the same length (the URL is a
// plain string in the binary); the user's exe, server and app are not touched.
//
// The app runs with its own WebView2 profile, config and data folders (the user's settings, recent
// files and any installed MyBoard are untouched), with MYBOARD_MULTI=1 (no instance count),
// and only the process started here is closed at the end.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from '../../scripts/dev-port.mjs';
import { listTargets, Page, sleep, waitTarget } from './cdp.mjs';
import { PAGE_HELPERS } from './page-helpers.mjs';
import { COMMAND_HELPER } from './web.suite.mjs';
import { startVite, watchConsole } from './web.harness.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const exe = path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'myboard.exe' : 'myboard');

/** The dev server URL compiled into the debug exe (http://127.0.0.1:NNNN or localhost). */
export function compiledDevUrl(file = exe) {
  const bytes = fs.readFileSync(file);
  const text = bytes.toString('latin1');
  const urls = [...text.matchAll(/http:\/\/(?:127\.0\.0\.1|localhost):(\d{2,5})/g)].map((m) => m[0]);
  return urls.length ? urls.sort((a, b) => urls.filter((u) => u === b).length - urls.filter((u) => u === a).length)[0] : null;
}

export class DesktopApp {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.notes = [];
    this.kind = 'desktop';
  }

  /** Resolves { skipped: reason } when it cannot run without another program's server; throws on a real failure. */
  async start() {
    if (!fs.existsSync(exe)) return { skipped: `${path.relative(root, exe)} 가 없습니다 (npm start 로 한 번 빌드하세요; 이 검사는 빌드하지 않습니다)` };
    const devUrl = compiledDevUrl();
    if (!devUrl) throw new Error('the dev URL compiled into the exe was not found');
    const port = Number(new URL(devUrl).port);
    this.notes.push(`exe 에 컴파일된 devUrl: ${devUrl} (TAURI_CONFIG 는 실행 시 적용되지 않음 — 컴파일 때만 읽힘)`);
    this.work = fs.mkdtempSync(path.join(os.tmpdir(), 'myboard-desktop-'));
    for (const dir of ['profile', 'config', 'data', 'bin']) fs.mkdirSync(path.join(this.work, dir), { recursive: true });
    let program = exe;
    const free = await freeDevPort(port, 1).catch(() => null);
    if (free === port) this.vite = await startVite({ from: port });
    else {
      // The compiled port is taken (the user's npm start): a patched copy of the exe loads our own Vite instead.
      const width = String(port).length;
      this.vite = await startVite({ from: port + 1 });
      if (String(this.vite.port).length !== width) throw new Error(`no free ${width}-digit port for the patched copy`);
      const bytes = fs.readFileSync(exe);
      const from = Buffer.from(devUrl, 'latin1');
      const to = Buffer.from(devUrl.replace(`:${port}`, `:${this.vite.port}`), 'latin1');
      let at = bytes.indexOf(from);
      let count = 0;
      while (at >= 0) { to.copy(bytes, at); count += 1; at = bytes.indexOf(from, at + 1); }
      program = path.join(this.work, 'bin', path.basename(exe));
      fs.writeFileSync(program, bytes);
      this.notes.push(`포트 ${port} 는 다른 프로그램이 사용 중 → exe 복사본의 devUrl 을 ${this.vite.url} 로 바꿔 실행 (${count}곳, 원본·사용자 서버는 그대로)`);
    }
    this.port = await freeDevPort(port + 100);
    const env = {
      ...process.env,
      MYBOARD_NO_OPEN: '1',
      MYBOARD_E2E: '1',
      MYBOARD_MULTI: '1',
      MYBOARD_CONFIG_DIR: path.join(this.work, 'config'),
      MYBOARD_DATA_DIR: path.join(this.work, 'data'),
      MYBOARD_LOCK_DIR: path.join(this.work, 'data'),
      WEBVIEW2_USER_DATA_FOLDER: path.join(this.work, 'profile'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${this.port}`,
      TAURI_CONFIG: JSON.stringify({ build: { devUrl: this.vite.url } }),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    this.process = spawn(program, [], { cwd: root, env, stdio: 'ignore' });
    this.exited = new Promise((resolve) => this.process.once('exit', resolve));
    const target = await waitTarget(this.port, (item) => item.type === 'page' && !String(item.title).startsWith('popup-') && !String(item.url).includes('popup='), 90000);
    this.main = await new Page(target).open();
    watchConsole(this.main, this);
    await this.ready();
    this.notes.push(`pid ${this.process.pid} · CDP ${this.port} · ${this.vite.url}`);
    return null;
  }

  async ready() {
    const ok = `Boolean(window.__myboard && document.querySelector('#toolbar .tool-button') && document.querySelector('#statusbar .status-notice'))`;
    try {
      await this.main.waitFor(ok, { timeout: 60000, interval: 250 });
    } catch {
      await this.main.eval('location.reload(); 1').catch(() => {});
      await sleep(1500);
      await this.main.waitFor(ok, { timeout: 60000, interval: 250 });
    }
    await this.main.eval(PAGE_HELPERS);
    await this.main.eval(COMMAND_HELPER);
  }

  run(body, timeout = 60000) {
    return this.main.eval(`(async () => { const A = window.__myboard; const T = window.__t; ${body} })()`, timeout);
  }

  takeErrors() {
    const list = [...(this.main?.errors.splice(0) ?? []), ...this.errors.splice(0)];
    this.warnings.length = 0;
    return list;
  }

  targets() { return listTargets(this.port); }

  async recover() {
    try { await this.run(`await T.reset(); return 1;`, 20000); } catch { /* the next case reports it */ }
    this.takeErrors();
  }

  /** Closes the process this harness started (its tree), nothing else. */
  async stop() {
    this.main?.close();
    let result = { ok: true };
    if (this.process && this.process.exitCode == null) {
      const pid = this.process.pid;
      if (process.platform === 'win32') spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      else this.process.kill('SIGKILL');
      const exited = await Promise.race([this.exited.then(() => true), sleep(8000).then(() => false)]);
      if (!exited) result = { ok: false, error: `pid ${pid} did not exit` };
    }
    this.vite?.process.kill();
    await sleep(500);
    if (this.work) try { fs.rmSync(this.work, { recursive: true, force: true }); } catch { /* WebView2 may still hold the profile briefly */ }
    return result;
  }
}
