#!/usr/bin/env node
// Starts the local SF3D engine for the web build (`npm run engine`, and
// `npm run web` starts it next to Vite). The desktop app does the same from
// Rust (src-tauri/src/engine.rs); both share one engine folder:
//
//   Windows  %LOCALAPPDATA%\MyStableFast3D\engine
//   macOS    ~/Library/Application Support/MyStableFast3D/engine
//   Linux    $XDG_DATA_HOME (~/.local/share)/MyStableFast3D/engine
//
// 1. uv (a single binary) is downloaded into <engine>/bin once.
// 2. uv creates <engine>/venv with its own Python 3.11 (no system Python).
// 3. The engine runs: `python -m mysf3d`. It installs PyTorch, SF3D and the
//    weights by itself on the first run, showing every step in its log.
//
// Options: --home <dir>  --port <n> (57650)  --host <addr> (127.0.0.1)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UV_VERSION = '0.13.1';
export const PYTHON_VERSION = '3.11';
export const DEFAULT_PORT = 57650;
export const RESTART_EXIT_CODE = 75;

const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_SRC = path.resolve(here, '..', 'engine');

export function defaultHome(platform = process.platform, env = process.env, home = os.homedir()) {
  if (env.MYSF3D_ENGINE_HOME) return env.MYSF3D_ENGINE_HOME;
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'MyStableFast3D', 'engine');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'MyStableFast3D', 'engine');
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'MyStableFast3D', 'engine');
}

// The uv release asset for this machine.
export function uvAsset(platform = process.platform, arch = process.arch) {
  const cpu = arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (platform === 'win32') return { name: `uv-${cpu}-pc-windows-msvc.zip`, exe: 'uv.exe' };
  if (platform === 'darwin') return { name: `uv-${cpu}-apple-darwin.tar.gz`, exe: 'uv' };
  return { name: `uv-${cpu}-unknown-linux-gnu.tar.gz`, exe: 'uv' };
}

export function venvPython(venv, platform = process.platform) {
  return platform === 'win32' ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python');
}

function parseArgs(argv) {
  const out = { home: defaultHome(), port: DEFAULT_PORT, host: '127.0.0.1' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--home') out.home = path.resolve(argv[++i]);
    else if (a === '--port') out.port = Number(argv[++i]) || DEFAULT_PORT;
    else if (a === '--host') out.host = argv[++i];
  }
  return out;
}

const say = (msg) => console.log(`[engine] ${msg}`);

function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return p;
    if (entry.isDirectory()) {
      const hit = findFile(p, name);
      if (hit) return hit;
    }
  }
  return '';
}

async function ensureUv(home) {
  const asset = uvAsset();
  const bin = path.join(home, 'bin', asset.exe);
  if (fs.existsSync(bin)) return bin;
  const url = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${asset.name}`;
  say(`Downloading uv ${UV_VERSION} — ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`uv download failed: HTTP ${res.status}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mysf3d-uv-'));
  const archive = path.join(tmp, asset.name);
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  // bsdtar (Windows 10+, macOS) and GNU tar (Linux) both read these archives.
  // On Windows the system one by its full path: a GNU tar from Git or MSYS
  // earlier on PATH reads "C:\…" as a remote host and cannot open zips.
  const tar = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  const r = spawnSync(tar, ['-xf', archive, '-C', tmp], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Could not unpack uv (is `tar` available?)');
  const found = findFile(tmp, asset.exe);
  if (!found) throw new Error('uv was not found in its archive');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.copyFileSync(found, bin);
  if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
  fs.rmSync(tmp, { recursive: true, force: true });
  return bin;
}

export function uvEnv(home, base = process.env) {
  return {
    ...base,
    UV_PYTHON_INSTALL_DIR: path.join(home, 'python'),
    UV_CACHE_DIR: path.join(home, 'uv-cache'),
    UV_PYTHON_PREFERENCE: 'only-managed',
    UV_NO_PROGRESS: '1',
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
  };
}

function ensureVenv(home, uv) {
  const venv = path.join(home, 'venv');
  const py = venvPython(venv);
  if (fs.existsSync(py)) return py;
  say(`Creating the Python ${PYTHON_VERSION} environment in ${venv} (uv downloads Python itself) …`);
  const r = spawnSync(uv, ['venv', '--python', PYTHON_VERSION, venv], { stdio: 'inherit', env: uvEnv(home) });
  if (r.status !== 0 || !fs.existsSync(py)) throw new Error('uv venv failed');
  return py;
}

function run(opts, py, uv) {
  return new Promise((resolve) => {
    const env = { ...uvEnv(opts.home), PYTHONPATH: ENGINE_SRC, PYTHONUNBUFFERED: '1' };
    const child = spawn(py, ['-u', '-m', 'mysf3d', '--home', opts.home, '--port', String(opts.port), '--host', opts.host, '--uv', uv, '--parent-pid', String(process.pid)], {
      stdio: 'inherit', env,
    });
    const stop = () => child.kill();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    child.on('exit', (code) => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve(code ?? 0);
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(opts.home, { recursive: true });
  say(`Engine folder: ${opts.home}`);
  const uv = await ensureUv(opts.home);
  const py = ensureVenv(opts.home, uv);
  for (;;) {
    const code = await run(opts, py, uv);
    if (code !== RESTART_EXIT_CODE) process.exit(code);
    say('Restarting the engine …');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[engine] ${err.message || err}`);
    process.exit(1);
  });
}
