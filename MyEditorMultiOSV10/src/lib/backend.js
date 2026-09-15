// Transport switch between the two hosts.
//
//   desktop  — window.myEditor (electron/preload.js): IPC calls, native
//              dialogs, files handed over by the OS
//   web      — fetch('/api/<method>'); dialogs are drawn by the UI
//
// Everything above this file is host-agnostic.
const electron = typeof window !== 'undefined' ? window.myEditor : null;

export const isElectron = !!electron;
export const hostName = isElectron ? 'electron' : 'web';
export const platform = isElectron ? electron.platform : (navigator.platform || '').toLowerCase().startsWith('win') ? 'win32' : /mac/i.test(navigator.platform || '') ? 'darwin' : 'linux';
export const isMac = platform === 'darwin';

function webToken() {
  try {
    const t = new URLSearchParams(window.location.search).get('token');
    if (t) sessionStorage.setItem('med-token', t);
    return sessionStorage.getItem('med-token') || '';
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

// Native dialogs exist only on the desktop; the UI supplies a fallback
// (src/dialogs/FileDialog.jsx) through `setDialogFallback`.
let fallback = null;
export function setDialogFallback(fn) { fallback = fn; }

export async function nativeDialog(kind, opts = {}) {
  if (isElectron && electron.dialog) return unwrap(await electron.dialog(kind, opts), 'dialog error');
  if (!fallback) throw new Error('No file dialog available');
  return fallback(kind, opts);
}

// ── Clipboard ─────────────────────────────────────────────

export async function writeClipboardText(text) {
  try { await navigator.clipboard.writeText(text); return; } catch { /* fall through */ }
  if (isElectron) await call('clipboard.write', { text });
}

export async function readClipboardText() {
  try { return await navigator.clipboard.readText(); } catch { /* denied */ }
  if (isElectron) return call('clipboard.read');
  return '';
}

// ── Window (desktop only; the browser has its own chrome) ──

export function windowControl(action) {
  if (isElectron && electron.windowControl) electron.windowControl(action);
  else if (action === 'close') window.close();
  else if (action === 'fullscreen') {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }
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

export function setWindowTitle(title) {
  document.title = title;
  if (isElectron && electron.setTitle) electron.setTitle(title);
}

// Files handed over by the OS. The callback may be called before the UI has
// restored its session; the main process waits for `rendererReady()`.
export function onOpenFiles(cb) {
  if (!isElectron || !electron.onOpenFiles) return () => {};
  return electron.onOpenFiles(cb);
}
export function rendererReady() { if (isElectron && electron.rendererReady) electron.rendererReady(); }
// Absolute path of a dropped File (desktop only; '' in the browser).
export function pathForFile(file) { return isElectron && electron.pathForFile ? electron.pathForFile(file) : ''; }

// The window close request (unsaved documents) — desktop only; the browser
// uses `beforeunload`.
export function onCloseRequest(cb) {
  if (!isElectron || !electron.onCloseRequest) return () => {};
  return electron.onCloseRequest(cb);
}
export function replyClose(allow) { if (isElectron && electron.replyClose) electron.replyClose(allow); }

export function onWindowFocus(cb) {
  const h = () => cb();
  window.addEventListener('focus', h);
  const off = isElectron && electron.onFocus ? electron.onFocus(cb) : () => {};
  return () => { window.removeEventListener('focus', h); off(); };
}

export function quitApp() {
  if (isElectron) electron.quit();
  else window.close();
}
