// Transport switch between the two hosts.
//
//   desktop  — window.myFtpServer (electron/preload.js): IPC calls and
//              pushed log lines / server updates
//   web      — fetch('/api/<method>'); log lines and state are polled
//
// Everything above this file is host-agnostic.
const electron = typeof window !== 'undefined' ? window.myFtpServer : null;

export const isElectron = !!electron;
export const hostName = isElectron ? 'electron' : 'web';

function webToken() {
  try {
    const t = new URLSearchParams(window.location.search).get('token');
    if (t) sessionStorage.setItem('mfs-token', t);
    return sessionStorage.getItem('mfs-token') || '';
  } catch { return ''; }
}

// { ok:false, error } → an Error carrying code / path / detail and the stack
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

// ── Live updates ──────────────────────────────────────────
// subscribe({ onLog(line), onUpdate({state, stats}) }, fromSeq) → unsubscribe.
// Electron pushes; the web version polls `server.poll` (700 ms, 250 ms while
// clients are connected so the counters feel live).
export function subscribe({ onLog, onUpdate }, fromSeq = 0) {
  if (isElectron) {
    const a = electron.onLog((line) => onLog && onLog(line));
    const b = electron.onUpdate((snap) => onUpdate && onUpdate(snap));
    return () => { a(); b(); };
  }
  let stopped = false;
  let seq = fromSeq;
  (async () => {
    while (!stopped) {
      let delay = 700;
      try {
        const r = await call('server.poll', { seq });
        if (stopped) break;
        for (const line of r.lines || []) { seq = Math.max(seq, line.seq); if (onLog) onLog(line); }
        if (r.seq !== undefined) seq = Math.max(seq, r.seq);
        if (onUpdate) onUpdate({ state: r.state, stats: r.stats });
        if (r.stats && r.stats.clients > 0) delay = 250;
      } catch { delay = 2000; }
      await new Promise((res) => setTimeout(res, delay));
    }
  })();
  return () => { stopped = true; };
}

// ── Clipboard ─────────────────────────────────────────────

export async function writeClipboardText(text) {
  if (isElectron) { await call('clipboard.write', { text }); return; }
  try { await navigator.clipboard.writeText(text); } catch { /* denied */ }
}

// ── Files (web: hand the text to the browser as a download) ──

export function downloadText(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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

export function setMinWindowSize(w, h) {
  if (isElectron && electron.setMinWindowSize) electron.setMinWindowSize(w, h);
}

export function setWindowSize(w, h) {
  if (isElectron && electron.setWindowSize) electron.setWindowSize(w, h);
}

export function quitApp() {
  if (isElectron) electron.quit();
  else window.close();
}
