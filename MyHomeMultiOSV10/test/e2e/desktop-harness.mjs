// Starts the desktop app (a built MyHomeMaker executable) on its own: private config, data and
// WebView2 profile folders, a CDP port, links opened into a log instead of a browser. The user's
// own settings, recent files and windows are never touched.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { listTargets, Page, sleep, waitTarget } from './cdp.mjs';

export const freePort = () => new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

export class DesktopApp {
  constructor(exe) {
    this.exe = exe;
    this.base = fs.mkdtempSync(path.join(os.tmpdir(), 'myhomemaker-desktop-'));
    for (const dir of ['config', 'data', 'profile', 'files']) fs.mkdirSync(path.join(this.base, dir), { recursive: true });
    this.openLog = path.join(this.base, 'opened.log');
  }

  dir(name) { return path.join(this.base, name); }

  async launch(args = [], extraEnv = {}) {
    this.port = await freePort();
    const env = {
      ...process.env,
      MYHOMEMAKER_MULTI: '1',
      MYHOMEMAKER_TEST_COMMANDS: '1',
      MYHOMEMAKER_CONFIG_DIR: this.dir('config'),
      MYHOMEMAKER_DATA_DIR: this.dir('data'),
      MYHOMEMAKER_OPEN_LOG: this.openLog,
      WEBVIEW2_USER_DATA_FOLDER: this.dir('profile'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${this.port}`,
      ...extraEnv,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    this.process = spawn(this.exe, args, { env, stdio: 'ignore' });
    this.exited = new Promise((resolve) => this.process.once('exit', resolve));
    const target = await waitTarget(this.port, (item) => item.type === 'page' && !String(item.title).startsWith('popup-') && !String(item.url).includes('viewer='), 60000);
    this.main = await new Page(target).open();
    await this.main.waitFor("Boolean(window.__myhomemaker && document.querySelector('#toolbar .tool-button') && document.querySelector('#statusbar .status-notice'))", { timeout: 40000 });
    return this.main;
  }

  targets() { return listTargets(this.port); }

  /** Attaches to a popup window ("settings", "menu", …) once it is drawn. */
  async popup(kind, timeout = 15000) {
    const target = await waitTarget(this.port, (item) => item.title === `popup-${kind}`, timeout);
    const page = await new Page(target).open();
    await page.waitFor("Boolean(window.__myhomemakerPopup && document.querySelector('.popup, .popup-menu'))", { timeout });
    return page;
  }

  opened() { return fs.existsSync(this.openLog) ? fs.readFileSync(this.openLog, 'utf8').split(/\r?\n/).filter(Boolean) : []; }

  async kill() {
    this.main?.close();
    if (!this.process || this.process.exitCode != null) return;
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(this.process.pid), '/T', '/F'], { stdio: 'ignore' });
    else this.process.kill('SIGKILL');
    await Promise.race([this.exited, sleep(5000)]);
    await sleep(800);
  }

  async cleanup() {
    await this.kill();
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(this.base, { recursive: true, force: true }); return; } catch { await sleep(500); }
    }
  }
}
