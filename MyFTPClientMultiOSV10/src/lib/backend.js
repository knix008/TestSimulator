// Transport switch between the two hosts.
//
//   desktop  — window.myFtpClient (electron/preload.js): IPC calls and
//              pushed job updates
//   web      — fetch('/api/<method>'), jobs are polled
//
// Everything above this file is host-agnostic.
const electron = typeof window !== 'undefined' ? window.myFtpClient : null;

export const isElectron = !!electron;
export const hostName = isElectron ? 'electron' : 'web';

function webToken() {
  try {
    const t = new URLSearchParams(window.location.search).get('token');
    if (t) sessionStorage.setItem('mfc-token', t);
    return sessionStorage.getItem('mfc-token') || '';
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
      let finished = false;
      const handle = (snap) => {
        if (finished) return;
        if (onUpdate) onUpdate(snap);
        if (snap.status !== 'running') { finished = true; if (stop) stop(); resolve(snap); }
      };
      stop = followJob(first.id, handle);
      handle(first);
    }, reject);
  });
}

export function cancelJob(id) { return call('jobs.cancel', { id }); }
export function resolveConflict(id, answer, applyAll) { return call('jobs.resolveConflict', { id, answer, applyAll }); }

// ── Clipboard ─────────────────────────────────────────────

export async function writeClipboardText(text) {
  if (isElectron) { await call('clipboard.write', { text }); return; }
  try { await navigator.clipboard.writeText(text); } catch { /* denied */ }
}

// ── Window controls (desktop only; the browser has its own chrome) ──

export function windowControl(action) {
  if (isElectron && electron.windowControl) electron.windowControl(action);
  else if (action === 'close') window.close();
}

export function onMaximized(cb) {
  if (!isElectron || !electron.onMaximized) return () => {};
  if (electron.isMaximized) electron.isMaximized().then(cb).catch(() => {});
  return electron.onMaximized(cb);
}

export async function getWindowSize() {
  if (isElectron && electron.getWindowSize) return electron.getWindowSize();
  return [window.outerWidth, window.outerHeight];
}

export function setWindowSize(w, h) {
  if (isElectron && electron.setWindowSize) electron.setWindowSize(w, h);
}

export function quitApp() {
  if (isElectron) electron.quit();
  else window.close();
}
