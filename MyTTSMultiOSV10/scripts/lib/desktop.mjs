// Starts the built Tauri program for tests and screenshots, isolated: TTS_CONFIG_DIR holds its
// models, logs and WebView storage; CDP through WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Page, sleep, waitForTarget } from './cdp.mjs';

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const exeName = process.platform === 'win32' ? 'MyTTS.exe' : 'MyTTS';
export const exePath = (profile = 'debug') => path.join(root, 'src-tauri', 'target', profile, exeName);

/** Newest modification time under the sources the debug program is built from. */
export function sourcesNewerThan(file) {
  if (!fs.existsSync(file)) return true;
  const built = fs.statSync(file).mtimeMs;
  const roots = ['index.html', 'guide.html', 'src/web', 'src-tauri/src', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'doc', 'assets'];
  const walk = (p) => {
    if (!fs.existsSync(p)) return false;
    const stat = fs.statSync(p);
    if (!stat.isDirectory()) return stat.mtimeMs > built;
    return fs.readdirSync(p).some((name) => walk(path.join(p, name)));
  };
  return roots.some((r) => walk(path.join(root, r)));
}

export async function launchDesktop({ profile = 'debug', configDir, port = 9471, hideNodeFromPath = false }) {
  const exe = exePath(profile);
  if (!fs.existsSync(exe)) throw new Error(`not built: ${path.relative(root, exe)}`);
  const env = { ...process.env, TTS_CONFIG_DIR: configDir, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` };
  delete env.ELECTRON_RUN_AS_NODE;
  // The release check must prove the bundled Node is used, not the one on PATH.
  if (hideNodeFromPath) env.PATH = (env.PATH || '').split(path.delimiter).filter((d) => !fs.existsSync(path.join(d, process.platform === 'win32' ? 'node.exe' : 'node'))).join(path.delimiter);
  const child = spawn(exe, [], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-20000); });
  let exited = false;
  child.on('exit', () => { exited = true; });
  const target = await waitForTarget(port, (t) => /index\.html|localhost\/?$/.test(t.url), 40000);
  const page = await Page.connect(target);
  const app = {
    page, child, port,
    get exited() { return exited; },
    get stderr() { return stderr; },
    /** The Node host processes (children of the program). */
    hostPids() {
      if (process.platform !== 'win32') return [];
      const out = execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "ParentProcessId=${child.pid} and Name='node.exe'" | ForEach-Object { $_.ProcessId }`], { encoding: 'utf8' });
      return out.split(/\s+/).filter(Boolean).map(Number);
    },
    async waitExit(ms = 8000) {
      const end = Date.now() + ms;
      while (!exited && Date.now() < end) await sleep(100);
      return exited;
    },
    /** A second window's page (the guide window). */
    async otherPage(match, ms = 15000) {
      return Page.connect(await waitForTarget(port, match, ms));
    },
    async close() {
      page.close();
      if (!exited) { try { child.kill(); } catch { /* gone */ } }
      await sleep(300);
    },
  };
  return app;
}
