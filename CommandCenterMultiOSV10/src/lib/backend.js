// Transport switch between the two hosts.
//
//   desktop  — window.commandCenter (electron/preload.js): IPC calls, pushed
//              job updates and fs.watch notifications
//   web      — fetch('/api/<method>'), jobs and directories are polled
//
// Everything above this file is host-agnostic.
import { getCustomThemesRaw } from '../themes';

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

// Native save-as picker (image save / convert) — desktop only; the browser downloads instead.
export async function pickSavePath(defaultPath, filters) {
  if (!isElectron || !electron.dialog) return null;
  return unwrap(await electron.dialog('saveFile', { defaultPath, filters }), 'dialog error');
}

// Native file picker (settings › text editor application) — desktop only.
export async function pickFile(defaultPath, filters) {
  if (!isElectron || !electron.dialog) return null;
  return unwrap(await electron.dialog('openFile', { defaultPath, filters }), 'dialog error');
}

// ── Tool windows ──────────────────────────────────────────
// The viewer, editor, multi-rename tool, search and settings open as
// separate windows: BrowserWindows on the desktop, popups in the browser.
// The page is the same bundle started with ?win=<kind>&id=<id>; its
// arguments travel through the main process (desktop) or localStorage
// (browser), and the windows talk to each other over a small message bus
// (IPC relay / BroadcastChannel).

const winParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
export const windowKind = winParams.get('win') || '';
export const windowId = winParams.get('id') || '';
export const canOpenWindows = typeof window !== 'undefined' && (isElectron ? !!electron.openWindow : true);

// Menu popup: on the desktop a menu is drawn in a frameless window of its own
// (electron/main.js, src/MenuPopup.jsx) so it is never cut off by the app
// window. `null` in the browser and in the popup page itself — the menu is
// then drawn in the page (ContextMenu folds it into columns instead).
// The theme and font size travel with every menu: the popup keeps no session.
export const menuPopup = (isElectron && electron.popupMenu && windowKind !== 'menu') ? {
  show: async ({ items, anchor }) => {
    const root = document.documentElement;
    const r = await electron.popupMenu({
      items, anchor,
      theme: root.dataset.theme || '',
      customThemes: getCustomThemesRaw(),
      fontSize: parseFloat(getComputedStyle(root).getPropertyValue('--fs')) || 13,
    });
    return r && r.ok && r.data && r.data.ok ? r.data.seq : null;
  },
  close: (seq) => electron.closeMenuPopup(seq),
  onShown: (cb) => electron.onMenuShown(cb),
  onPicked: (cb) => electron.onMenuPicked(cb),
  onClosed: (cb) => electron.onMenuClosed(cb),
} : null;

// A window that sizes itself to its content (the settings window). Desktop only — a browser popup keeps
// whatever size it was opened with.
export const fitWindow = (isElectron && electron.fitWindow) ? ((height) => electron.fitWindow(height)) : null;

const webChildren = new Set();
const SINGLETON_KINDS = new Set(['viewer', 'editor', 'preview', 'info', 'multiRename', 'search', 'settings', 'about']);   // one popup per tool
const QUIET_KINDS = new Set(['preview']);   // re-used without taking the focus (it follows clicks in the file list)
let bus = null;
function channel() {
  if (!bus && typeof BroadcastChannel !== 'undefined') { try { bus = new BroadcastChannel('command-center'); } catch { bus = null; } }
  return bus;
}

export async function openWindow(kind, args, { title, width, height } = {}) {
  if (isElectron) { const r = unwrap(await electron.openWindow({ kind, args, title, width, height }), 'window error'); return r.id; }
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  try { localStorage.setItem(`cc-win:${id}`, JSON.stringify(args || {})); } catch { /* no storage — the page falls back to the URL */ }
  if (SINGLETON_KINDS.has(kind)) {
    const open = Array.from(webChildren).find((c) => c.ccKind === kind && !c.closed);
    if (open) {
      try { localStorage.setItem(`cc-win:${open.ccId}`, JSON.stringify(args || {})); } catch { /* ignore */ }
      const c = channel(); if (c) c.postMessage({ type: 'replaceArgs', id: open.ccId, kind });
      if (!QUIET_KINDS.has(kind)) { try { open.focus(); } catch { /* ignore */ } }
      return open.ccId;
    }
  }
  const url = new URL(window.location.href);
  url.searchParams.set('win', kind);
  url.searchParams.set('id', id);
  const w = window.open(url.toString(), `cc-${kind}-${id}`, `popup=yes,width=${width || 900},height=${height || 680}`);
  if (w) { w.ccKind = kind; w.ccId = id; }
  if (!w) throw new Error('POPUP_BLOCKED');
  webChildren.add(w);
  return id;
}

export async function windowArgs() {
  if (isElectron) return unwrap(await electron.windowArgs(windowId), 'window error');
  try { const raw = localStorage.getItem(`cc-win:${windowId}`); if (raw) { localStorage.removeItem(`cc-win:${windowId}`); return JSON.parse(raw); } } catch { /* fall through */ }
  return {};
}

// Resize grip (desktop only): the window's outer size and a resize while dragging.
export const canResizeWindow = isElectron && !!electron.resizeWindow;
export async function windowSize() { return isElectron ? unwrap(await electron.windowSize(), 'window error') : { width: window.outerWidth, height: window.outerHeight }; }
export function resizeWindow(width, height) { if (isElectron) electron.resizeWindow(width, height); }

export function closeWindow() {
  if (isElectron) electron.closeWindow();
  else window.close();
}

export function postToApp(msg) {
  if (isElectron) electron.postMessage(msg);
  else { const c = channel(); if (c) c.postMessage(msg); }
}

export function onAppMessage(cb) {
  if (isElectron) return electron.onMessage(cb);
  const c = channel();
  if (!c) return () => {};
  const handler = (e) => cb(e.data);
  c.addEventListener('message', handler);
  return () => c.removeEventListener('message', handler);
}

// Browser popups do not close with the opener on their own.
if (typeof window !== 'undefined' && !isElectron && !windowKind) {
  window.addEventListener('beforeunload', () => { for (const w of webChildren) { try { w.close(); } catch { /* gone */ } } });
}
