// The two runtimes behind one interface.
//   Desktop: real paths, the native engine on worker threads, native dialogs.
//   Web:     files held in memory by the WebAssembly engine in a Web Worker; downloads for output.
import { invoke as tauriInvoke } from '@tauri-apps/api/core';

export const isDesktop = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

export const invoke = (cmd, args) => tauriInvoke(cmd, args);

export class EngineError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

function unwrap(reply) {
  if (reply?.ok) return reply.result;
  throw new EngineError(reply?.code ?? 'io', reply?.detail ?? '');
}

// ── Desktop ───────────────────────────────────────────────────────────────────────────────────

let listeners = null;
const running = new Map();
// Replies that arrived before the page knew the job's number: small jobs finish that fast.
const early = new Map();

async function ensureListeners() {
  if (listeners) return listeners;
  const { listen } = await import('@tauri-apps/api/event');
  listeners = Promise.all([
    listen('job-progress', (e) => running.get(e.payload.id)?.onProgress?.(e.payload.done, e.payload.total, e.payload.name)),
    listen('job-done', (e) => {
      const job = running.get(e.payload.id);
      if (!job) {
        early.set(e.payload.id, e.payload.reply);
        return;
      }
      running.delete(e.payload.id);
      settle(job, e.payload.reply);
    }),
  ]);
  return listeners;
}

function settle(job, reply) {
  try {
    job.resolve(unwrap(reply));
  } catch (err) {
    job.reject(err);
  }
}

function desktopRun(op, options, onProgress) {
  let id = null;
  let cancelled = false;
  const promise = new Promise((resolve, reject) => {
    ensureListeners()
      .then(() => invoke('start_job', { op, options }))
      .then((jobId) => {
        id = jobId;
        if (early.has(id)) {
          const reply = early.get(id);
          early.delete(id);
          settle({ resolve, reject }, reply);
          return;
        }
        running.set(id, { resolve, reject, onProgress });
        if (cancelled) invoke('cancel_job', { id });
      })
      .catch((e) => reject(new EngineError('io', String(e))));
  });
  return {
    promise,
    cancel() {
      cancelled = true;
      if (id != null) invoke('cancel_job', { id });
    },
  };
}

// ── Web: the worker, and what it holds ────────────────────────────────────────────────────────

let worker = null;
let nextId = 1;
const pending = new Map();
// Everything the worker has been given: path -> File. A cancelled job kills the worker, and with
// it the memory, so these are what it is rebuilt from.
const webFiles = new Map();
// Paths the current worker already holds. Sent once: the engine may have changed its copy since
// (editing an archive), and sending the original again would undo that.
const sent = new Set();

// Imported only here, behind the constant, so the desktop bundle carries neither worker nor engine.
async function startWorker() {
  if (__WEB_BUILD__) {
    const { createEngineWorker } = await import('./webWorker.js');
    return adopt(createEngineWorker());
  }
  throw new EngineError('unsupported', 'no web engine in this build');
}

function adopt(w) {
  w.onmessage = (e) => {
    const { id, kind } = e.data;
    const job = pending.get(id);
    if (!job) return;
    if (kind === 'progress') {
      job.onProgress?.(e.data.done, e.data.total, e.data.name);
      return;
    }
    pending.delete(id);
    if (kind === 'error') job.reject(new EngineError(e.data.code ?? 'io', e.data.detail ?? ''));
    else job.resolve(e.data.value);
  };
  w.onerror = (e) => {
    const message = e.message || 'engine failed';
    for (const job of pending.values()) job.reject(new EngineError('corrupt', message));
    pending.clear();
    // Its memory died with it; the next job sends the files again.
    worker = null;
    sent.clear();
  };
  worker = w;
  return w;
}

function ask(message, onProgress) {
  const id = nextId;
  nextId += 1;
  return {
    id,
    promise: new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      (worker ? Promise.resolve(worker) : startWorker())
        .then((w) => w.postMessage({ ...message, id }))
        .catch((e) => {
          pending.delete(id);
          reject(e);
        });
    }),
  };
}

async function webStage(paths) {
  const wanted = [];
  for (const p of paths) {
    for (const [key, file] of webFiles) {
      if ((key === p || key.startsWith(`${p}/`)) && !sent.has(key)) {
        sent.add(key);
        wanted.push({ path: key, file });
      }
    }
  }
  if (wanted.length) await ask({ kind: 'stage', files: wanted }).promise;
}

function webRun(op, options, onProgress) {
  let job = null;
  let killed = false;
  let rejectOuter = () => {};
  const promise = new Promise((resolve, reject) => {
    rejectOuter = reject;
    (async () => {
      await webStage(sourcesOf(op, options));
      if (killed) return;
      job = ask({ kind: 'call', op, options }, onProgress);
      resolve(unwrap(await job.promise));
    })().catch(reject);
  });
  return {
    promise,
    cancel() {
      killed = true;
      // The engine cannot be interrupted from outside, so the worker goes, and its memory with it.
      if (worker) {
        worker.terminate();
        worker = null;
        sent.clear();
        for (const j of pending.values()) j.reject(new EngineError('cancelled'));
        pending.clear();
      }
      rejectOuter(new EngineError('cancelled'));
    },
  };
}

// What must be in the worker's memory for an operation to run.
function sourcesOf(op, options) {
  const out = [];
  // An archive comes with its neighbours: they may be the other parts of its set.
  if (options.path) out.push(dirName(options.path));
  if (options.paths) out.push(...options.paths);
  for (const s of options.sources ?? []) out.push(s.path);
  for (const s of options.add ?? []) out.push(s.path);
  return out;
}

// ── The shared surface ────────────────────────────────────────────────────────────────────────

export function run(op, options, onProgress) {
  return isDesktop ? desktopRun(op, options, onProgress) : webRun(op, options, onProgress);
}

export async function readEntry(options) {
  if (isDesktop) {
    try {
      const data = await invoke('read_entry', { options });
      return new Uint8Array(data);
    } catch (e) {
      let parsed = null;
      try { parsed = JSON.parse(String(e)); } catch { /* not ours */ }
      throw new EngineError(parsed?.code ?? 'io', parsed?.detail ?? String(e));
    }
  }
  await webStage([dirName(options.path)]);
  return ask({ kind: 'readEntry', options }).promise;
}

// A file from the page, kept for the worker. Sets of parts and folders keep their shape.
export function webAddFile(path, file) {
  webFiles.set(path, file);
}

export function webRemove(prefix) {
  const paths = [...webFiles.keys()].filter((key) => key === prefix || key.startsWith(`${prefix}/`));
  for (const key of paths) {
    webFiles.delete(key);
    sent.delete(key);
  }
  if (worker && paths.length) ask({ kind: 'forget', paths }).promise.catch(() => {});
}

export function webListFiles() {
  return [...webFiles.keys()];
}

export async function webFetch(path) {
  const bytes = await ask({ kind: 'read', path }).promise;
  return bytes;
}

export async function webWalk(path) {
  return ask({ kind: 'walk', path }).promise;
}

// Saves a produced file through the browser.
export function downloadBytes(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function baseName(path) {
  const i = Math.max(String(path).lastIndexOf('/'), String(path).lastIndexOf('\\'));
  return i < 0 ? String(path) : String(path).slice(i + 1);
}

export function dirName(path) {
  const s = String(path).replace(/[\\/]+$/, '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  if (i < 0) return '';
  if (i === 0) return s[0];
  // C:\ keeps its slash, or it means something else.
  if (i === 2 && s[1] === ':') return s.slice(0, 3);
  return s.slice(0, i);
}

export function joinPath(dir, name) {
  if (!dir) return name;
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${name}` : `${dir}${sep}${name}`;
}

// ── Native dialogs. Tests answer these through window.__zmDialogs. ────────────────────────────

async function dialogPlugin() {
  return import('@tauri-apps/plugin-dialog');
}

function stubbed(kind, fallback) {
  const stub = typeof window !== 'undefined' ? window.__zmDialogs : null;
  if (stub && stub[kind] && stub[kind].length) return { value: stub[kind].shift() };
  return fallback;
}

export async function pickFiles({ multiple = true, title } = {}) {
  const s = stubbed('open');
  if (s) return s.value;
  const { open } = await dialogPlugin();
  const r = await open({ multiple, title, directory: false });
  if (r == null) return null;
  return Array.isArray(r) ? r : [r];
}

export async function pickFolder({ title, defaultPath } = {}) {
  const s = stubbed('folder');
  if (s) return s.value;
  const { open } = await dialogPlugin();
  return open({ directory: true, multiple: false, title, defaultPath });
}

export async function pickSave({ title, defaultPath } = {}) {
  const s = stubbed('save');
  if (s) return s.value;
  const { save } = await dialogPlugin();
  return save({ title, defaultPath });
}

// Closes the window this page is in. In the desktop program it must go through Tauri: the page's own
// window.close() takes the page away but leaves Tauri believing the window is there, so asking for
// that window again only "focuses" a dead one and nothing opens.
export async function closeThisWindow() {
  if (!isDesktop) {
    window.close();
    return;
  }
  const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  await getCurrentWebviewWindow().close();
}

// The roots do not change while the program starts, and two panels ask at once.
let rootsAsked = null;
export function fsRoots() {
  if (!rootsAsked) rootsAsked = invoke('fs_roots').catch((e) => { rootsAsked = null; throw e; });
  return rootsAsked;
}
