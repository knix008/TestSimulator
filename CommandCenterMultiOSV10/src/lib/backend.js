// Transport switch between the two hosts.
//
//   desktop  — window.commandCenter (electron/preload.js): IPC calls, pushed
//              job updates and fs.watch notifications
//   web      — fetch('/api/<method>'), jobs and directories are polled
//
// Everything above this file is host-agnostic.
const electron = typeof window !== 'undefined' ? window.commandCenter : null;

export const isElectron = !!electron;
export const hostName = isElectron ? 'electron' : 'web';

function webToken() {
  try {
    const t = new URLSearchParams(window.location.search).get('token');
    if (t) sessionStorage.setItem('cc-token', t);
    return sessionStorage.getItem('cc-token') || '';
  } catch { return ''; }
}

// { ok:false, error } → an Error carrying code / path / syscall and the stack
// of the process that failed (main process or web server).
function unwrap(body, fallback) {
  if (body && body.ok) return body.data;
  const err = new Error(body && body.error ? body.error.message : fallback);
  if (body && body.error) {
    const { stack, ...rest } = body.error;
    Object.assign(err, rest);
    if (stack) err.stack = `${stack}\n    [renderer] ${(err.stack || '').split('\n').slice(1, 3).join('\n').trim()}`;
  }
  throw err;
}

export async function call(name, args = {}) {
  if (isElectron) return unwrap(await electron.call(name, args), 'IPC error');
  const headers = { 'content-type': 'application/json' };
  const token = webToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`./api/${encodeURIComponent(name)}`, { method: 'POST', headers, body: JSON.stringify(args) });
  let body;
  try { body = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }
  return unwrap(body, `HTTP ${res.status}`);
}

// ── Jobs ──────────────────────────────────────────────────

const jobListeners = new Map(); // id → Set<fn>
let electronUnsub = null;

function dispatch(snap) {
  const set = jobListeners.get(snap.id);
  if (!set) return;
  for (const fn of Array.from(set)) fn(snap);
}

// Follows a job until it leaves the running state. Returns an unsubscribe fn.
export function followJob(id, onUpdate) {
  let set = jobListeners.get(id);
  if (!set) { set = new Set(); jobListeners.set(id, set); }
  set.add(onUpdate);

  let stopped = false;
  const stop = () => {
    stopped = true;
    const s = jobListeners.get(id);
    if (s) { s.delete(onUpdate); if (!s.size) jobListeners.delete(id); }
  };

  if (isElectron) {
    if (!electronUnsub) electronUnsub = electron.onJobUpdate(dispatch);
    // Catch up in case the first update was pushed before we subscribed.
    call('jobs.get', { id }).then((snap) => { if (snap && !stopped) onUpdate(snap); }).catch(() => {});
    return stop;
  }

  (async () => {
    while (!stopped) {
      let snap = null;
      try { snap = await call('jobs.get', { id }); } catch { /* transient */ }
      if (stopped) break;
      if (snap) {
        onUpdate(snap);
        if (snap.status !== 'running') break;
      }
      await new Promise((r) => setTimeout(r, snap && snap.conflict ? 400 : 150));
    }
  })();
  return stop;
}

// Runs a job-returning API call and resolves with the final snapshot.
// `onUpdate` sees every intermediate snapshot (progress, conflicts).
export function runJob(name, args, onUpdate) {
  return new Promise((resolve, reject) => {
    call(name, args).then((first) => {
      if (!first || first.id === undefined) { resolve(first); return; }
      let stop = null;
      const handle = (snap) => {
        if (onUpdate) onUpdate(snap);
        if (snap.status !== 'running') { if (stop) stop(); resolve(snap); }
      };
      stop = followJob(first.id, handle);
      handle(first);
    }, reject);
  });
}

export function cancelJob(id) { return call('jobs.cancel', { id }); }
export function resolveConflict(id, answer, applyAll) { return call('jobs.resolveConflict', { id, answer, applyAll }); }

// ── Directory watching ────────────────────────────────────

let dirUnsub = null;
const dirListeners = new Map(); // id → fn

export function watchDir(id, path, onChange) {
  if (isElectron) {
    if (!dirUnsub) dirUnsub = electron.onDirChanged((info) => { const fn = dirListeners.get(info.id); if (fn) fn(info); });
    dirListeners.set(id, onChange);
    electron.watchDir(id, path);
    return () => { dirListeners.delete(id); electron.unwatchDir(id); };
  }
  // Web: poll the directory mtime.
  let stopped = false;
  let last = null;
  (async () => {
    while (!stopped) {
      try {
        const { mtime } = await call('fs.mtime', { path });
        if (last !== null && mtime !== last) onChange({ id, path });
        last = mtime;
      } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 2000));
    }
  })();
  return () => { stopped = true; };
}

// ── Clipboard ─────────────────────────────────────────────

export async function readClipboardText() {
  if (isElectron) return (await call('clipboard.read')).text || '';
  try { return await navigator.clipboard.readText(); } catch { return ''; }
}

export async function writeClipboardText(text) {
  if (isElectron) { await call('clipboard.write', { text }); return; }
  try { await navigator.clipboard.writeText(text); } catch { /* denied — in-app clipboard still works */ }
}

// Native folder picker — desktop only (the web version has no file dialogs; the path is typed).
export async function pickFolder(defaultPath) {
  if (!isElectron || !electron.dialog) return null;
  return unwrap(await electron.dialog('openFolder', { defaultPath }), 'dialog error');
}

export function quitApp() {
  if (isElectron) electron.quit();
  else window.close();
}
