// Local Ollama: is it installed, is it running, which models it has; install it, start it, pull a model
// (ARCHITECTURE.md §5.3). One job at a time; its progress is { kind, status, done, total, text, error }
// and goes out as 'ollama.progress' events (the UI also polls /api/ollama/job).
//
// Install: Windows winget (or the official OllamaSetup.exe, downloaded with progress and run silently),
// macOS Homebrew, Linux the official install script. Tests replace the pieces with
// MYAGENTS_OLLAMA_BIN (the program; a .js/.mjs file runs with Node) and MYAGENTS_OLLAMA_INSTALL (a command).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { AppError } from './errors.js';
import { providerInfo } from './providers/index.js';

const WIN_SETUP = 'https://ollama.com/download/OllamaSetup.exe';
export const OLLAMA_DOWNLOAD_PAGE = 'https://ollama.com/download';

const exists = (p) => { try { return Boolean(p) && fs.statSync(p).isFile(); } catch { return false; } };

function onPath(name) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? String(r.stdout).split(/\r?\n/).map((s) => s.trim()).find(exists) ?? '' : '';
}

export function createOllama(core, { env = process.env } = {}) {
  let job = { kind: null, status: 'idle', done: 0, total: 0, text: '', error: '', startedAt: 0 };
  const emit = () => core.events.emit({ type: 'ollama.progress', data: { ...job } });
  const set = (patch) => { job = { ...job, ...patch }; emit(); };
  const baseUrl = () => String(core.credentials.resolve('ollama').baseUrl || providerInfo('ollama').baseUrl).replace(/\/+$/, '');
  const allowed = () => {
    if (!core.nodeServices.allowShell()) throw new AppError('OLLAMA_NOT_ALLOWED', 'Installing or starting programs is off here (the web server, or Settings › Agents › Allow commands)', 403);
  };

  function binary() {
    if (env.MYAGENTS_OLLAMA_BIN !== undefined) return exists(env.MYAGENTS_OLLAMA_BIN) ? env.MYAGENTS_OLLAMA_BIN : '';
    const known = process.platform === 'win32'
      ? [path.join(env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Ollama', 'ollama.exe'), path.join(env.ProgramFiles ?? 'C:\\Program Files', 'Ollama', 'ollama.exe')]
      : process.platform === 'darwin' ? ['/Applications/Ollama.app/Contents/Resources/ollama', '/opt/homebrew/bin/ollama', '/usr/local/bin/ollama'] : ['/usr/local/bin/ollama', '/usr/bin/ollama'];
    return onPath('ollama') || known.find(exists) || '';
  }
  /** [program, args] for the binary (a .js test stand-in runs with Node). */
  const command = (bin, args) => (/\.m?js$/i.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args]);

  async function ping(timeout = 1500) {
    try {
      const res = await fetch(`${baseUrl()}/api/version`, { signal: AbortSignal.timeout(timeout) });
      if (!res.ok) return null;
      return (await res.json())?.version ?? '?';
    } catch { return null; }
  }

  async function status() {
    const bin = binary();
    const version = await ping();
    let models = [];
    if (version) { try { models = ((await (await fetch(`${baseUrl()}/api/tags`, { signal: AbortSignal.timeout(3000) })).json())?.models ?? []).map((m) => m.name); } catch { models = []; } }
    return { installed: Boolean(bin) || Boolean(version), path: bin, running: Boolean(version), version: version ?? '', models, baseUrl: baseUrl(), canInstall: core.nodeServices.allowShell(), via: plan().via, downloadPage: OLLAMA_DOWNLOAD_PAGE, job: { ...job } };
  }

  /** How it will be installed here. */
  function plan() {
    if (env.MYAGENTS_OLLAMA_INSTALL) return { via: 'command', command: env.MYAGENTS_OLLAMA_INSTALL };
    if (process.platform === 'win32') return onPath('winget') ? { via: 'winget', command: 'winget install -e --id Ollama.Ollama --silent --accept-package-agreements --accept-source-agreements --disable-interactivity' } : { via: 'download', url: WIN_SETUP };
    if (process.platform === 'darwin') return onPath('brew') ? { via: 'brew', command: 'brew install ollama' } : { via: 'page', url: OLLAMA_DOWNLOAD_PAGE };
    return { via: 'script', command: 'curl -fsSL https://ollama.com/install.sh | sh' };
  }

  const busy = () => job.status === 'running';
  const begin = (kind, text) => { if (busy()) throw new AppError('OLLAMA_BUSY', `Ollama is busy: ${job.kind}`, 409); set({ kind, status: 'running', done: 0, total: 0, text, error: '', startedAt: Date.now() }); };
  const fail = (err) => set({ status: 'failed', error: String(err?.message ?? err) });

  /** Runs a shell command; each output line becomes the job text (winget prints its own percentages). */
  function run(cmd) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, { shell: true, windowsHide: true, env: { ...process.env, ...env } });
      let tail = '';
      const take = (chunk) => {
        for (const line of String(chunk).split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean)) {
          tail = `${tail}\n${line}`.slice(-4000);
          const pct = /(\d{1,3})\s*%/.exec(line);
          set({ text: line.slice(0, 200), ...(pct ? { done: Math.min(100, Number(pct[1])), total: 100 } : {}) });
        }
      };
      child.stdout.on('data', take);
      child.stderr.on('data', take);
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new AppError('OLLAMA_INSTALL_FAILED', `The installer ended with ${code}: ${tail.split('\n').slice(-3).join(' ').trim()}`, 500))));
    });
  }

  async function download(url, file) {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new AppError('OLLAMA_DOWNLOAD_FAILED', `Download failed: ${res.status}`, 502);
    const total = Number(res.headers.get('content-length')) || 0;
    const out = fs.createWriteStream(file);
    let done = 0;
    let last = 0;
    for await (const chunk of res.body) {
      out.write(chunk);
      done += chunk.length;
      if (Date.now() - last > 200) { last = Date.now(); set({ done, total, text: 'download' }); }
    }
    await new Promise((resolve) => out.end(resolve));
    set({ done, total: total || done });
  }

  async function waitRunning(seconds = 40) {
    for (let i = 0; i < seconds * 4; i += 1) { if (await ping(800)) return true; await new Promise((r) => setTimeout(r, 250)); }
    return false;
  }

  function serve() {
    const bin = binary();
    if (!bin) throw new AppError('OLLAMA_NOT_INSTALLED', 'Ollama is not installed', 404);
    const [prog, args] = command(bin, ['serve']);
    const host = new URL(baseUrl());
    const child = spawn(prog, args, { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ...env, OLLAMA_HOST: `${host.hostname}:${host.port || 11434}` } });
    child.unref();
    return child;
  }

  return {
    status,
    plan,
    /** Throws now (not later in the background job) when it may not run or is busy. */
    check() { allowed(); if (busy()) throw new AppError('OLLAMA_BUSY', `Ollama is busy: ${job.kind}`, 409); },
    job: () => ({ ...job }),
    /** Installs (when needed) and starts Ollama; resolves when it answers. */
    async install() {
      allowed();
      begin('install', 'prepare');
      try {
        if (!binary()) {
          const p = plan();
          if (p.via === 'page') throw new AppError('OLLAMA_MANUAL', `Install Ollama from ${OLLAMA_DOWNLOAD_PAGE}`, 501);
          if (p.via === 'download') {
            const file = path.join(os.tmpdir(), 'OllamaSetup.exe');
            await download(p.url, file);
            set({ text: 'install', done: 0, total: 0 });
            await run(`"${file}" /VERYSILENT /NORESTART /SUPPRESSMSGBOXES`);
          } else await run(p.command);
        }
        if (!binary() && !(await ping())) throw new AppError('OLLAMA_NOT_FOUND_AFTER_INSTALL', 'Installed, but the ollama program was not found — restart MyAgents or sign in again', 500);
        if (!(await ping())) { set({ text: 'start' }); serve(); if (!(await waitRunning())) throw new AppError('OLLAMA_NOT_RUNNING', 'Ollama did not start', 500); }
        set({ status: 'done', text: 'ready', done: 1, total: 1 });
        return status();
      } catch (err) { fail(err); throw err; }
    },
    async start() {
      allowed();
      if (await ping()) return status();
      begin('start', 'start');
      try {
        serve();
        if (!(await waitRunning())) throw new AppError('OLLAMA_NOT_RUNNING', 'Ollama did not start', 500);
        set({ status: 'done', text: 'ready', done: 1, total: 1 });
        return status();
      } catch (err) { fail(err); throw err; }
    },
    /** Downloads a model; the job shows bytes done of the total. */
    async pull(model) {
      allowed();
      const name = String(model ?? '').trim();
      if (!/^[\w.:/-]+$/.test(name)) throw new AppError('BAD_MODEL_NAME', `Not a model name: ${model}`, 400);
      begin('pull', name);
      try {
        if (!(await ping())) throw new AppError('OLLAMA_NOT_RUNNING', 'Ollama is not running', 409);
        const res = await fetch(`${baseUrl()}/api/pull`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: name, stream: true }) });
        if (!res.ok || !res.body) throw new AppError('OLLAMA_PULL_FAILED', `Pull failed: ${res.status} ${await res.text().catch(() => '')}`.trim(), 502);
        let buf = '';
        let last = 0;
        for await (const chunk of res.body) {
          buf += Buffer.from(chunk).toString('utf8');
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const m = JSON.parse(line);
            if (m.error) throw new AppError('OLLAMA_PULL_FAILED', `${name}: ${m.error}`, 502);
            if (Date.now() - last > 150 || m.status === 'success') { last = Date.now(); set({ text: m.status ?? '', ...(m.total ? { done: m.completed ?? 0, total: m.total } : {}) }); }
          }
        }
        set({ status: 'done', text: 'success' });
        return status();
      } catch (err) { fail(err); throw err; }
    },
  };
}
