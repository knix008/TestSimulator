// Transport switch between the hosts.
//
//   electron — window.commandCenter, if a host injects it: IPC calls, pushed
//              job updates and fs.watch notifications. The shipped desktop host is Tauri.
//   tauri    — the same Node core as the web host (src-tauri spawns server.js)
//              plus native dialogs and tool windows. Jobs and directories are polled.
//   web      — fetch('/api/<method>'), jobs and directories are polled
//
// Everything above this file is host-agnostic.
import { getCustomThemesRaw } from '../themes';

const electron = typeof window !== 'undefined' ? window.commandCenter : null;

export const isElectron = !!electron;
export const isTauri = typeof window !== 'undefined' && !electron && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
export const isDesktop = isElectron || isTauri;
export const hostName = isElectron ? 'electron' : isTauri ? 'tauri' : 'web';

// Set once the Tauri shell has told us where it spawned the core.
let apiOrigin = '';
let tauriReady = null;

export function ensureHost() {
  if (!isTauri) return Promise.resolve();
  if (!tauriReady) {
    tauriReady = (async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const cfg = await invoke('host_config');
      if (!cfg || cfg.error || !cfg.origin) throw new Error(cfg && cfg.error ? cfg.error : 'Tauri core is not running');
      apiOrigin = cfg.origin.endsWith('/') ? cfg.origin : `${cfg.origin}/`;
      try { if (cfg.token) sessionStorage.setItem('cc-token', cfg.token); } catch { /* private mode */ }
    })();
  }
  return tauriReady;
}

// Absolute URL of a core endpoint. Tauri's page origin is not the core, so media,
// uploads and downloads must not be relative there. The web host is same-origin.
export function apiUrl(pathname, params) {
  const path = String(pathname || '').replace(/^\//, '');
  const base = apiOrigin || (typeof window !== 'undefined' ? new URL('./', window.location.href).href : 'http://127.0.0.1/');
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  if (params) for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  try {
    const tok = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('cc-token') : '';
    if (tok && !url.searchParams.has('token')) url.searchParams.set('token', tok);
  } catch { /* ignore */ }
  return url.href;
}

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
  await ensureHost();
  if (isElectron) return unwrap(await electron.call(name, args), 'IPC error');
  const headers = { 'content-type': 'application/json' };
  const token = webToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const endpoint = apiOrigin ? new URL(`api/${encodeURIComponent(name)}`, apiOrigin) : `./api/${encodeURIComponent(name)}`;
  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(args) });
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
      const hidden = typeof document !== 'undefined' && document.hidden;
      await new Promise((r) => setTimeout(r, hidden ? 8000 : 2000));
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
async function tauriDialog() { return import('@tauri-apps/plugin-dialog'); }

export async function pickFolder(defaultPath) {
  if (isElectron && electron.dialog) return unwrap(await electron.dialog('openFolder', { defaultPath }), 'dialog error');
  if (!isTauri) return null;
  const { open } = await tauriDialog();
  const picked = await open({ directory: true, multiple: false, defaultPath: defaultPath || undefined });
  return typeof picked === 'string' ? picked : null;
}

export function quitApp() {
  if (isElectron) electron.quit();
  else if (isTauri) import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close());
  else window.close();
}

// ── Drag & drop with the outside (see src/lib/dragdrop.js) ──

// Desktop: the path behind a File dropped from Explorer / Finder ('' in the browser, which uploads instead).
export function droppedFilePath(file) {
  if (!isElectron || !electron.pathForFile) return '';
  try { return electron.pathForFile(file) || ''; } catch { return ''; }
}

// Desktop: drags `paths` natively so they can be dropped on the OS or on another
// window of this app. `move` is the gesture held as the drag started. Resolves when the drag is over.
export async function startNativeDrag(paths, move = false) {
  if (isElectron && electron.startDrag) {
    unwrap(await electron.startDrag(paths), 'drag error');
    return;
  }
  if (!isTauri) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('start_file_drag', { paths, moveFiles: !!move });
}

// Windows shell clipboard: a real file list, so Explorer can paste what we cut or copied
// and we can paste what Explorer cut or copied. Returns false where the host has no
// file clipboard (the page then writes file:// text instead).
export async function writeFileClipboard(paths, cut, text) {
  if (!isTauri) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return !!(await invoke('clipboard_write_files', { paths, cut: !!cut, text: text || '' }));
  } catch { return false; }
}

// { paths, cut } from the shell clipboard, or null when this host cannot read one.
export async function readFileClipboard() {
  if (!isTauri) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const data = await invoke('clipboard_read_files');
    if (!data || !Array.isArray(data.paths)) return null;
    return { paths: data.paths, cut: !!data.cut };
  } catch { return null; }
}

export async function clearFileClipboard() {
  if (!isTauri) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('clipboard_clear_files');
  } catch { /* the in-app list is cleared either way */ }
}

// True when Shift is held and Ctrl is not — the move gesture, including during an OS drag.
export async function dragMoveRequested() {
  if (!isTauri) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return !!(await invoke('drag_move_down'));
  } catch { return false; }
}

// Browser: one dropped file (or an empty folder when `file` is null) into `dir` at the relative
// path `rel` (server/server.js /api/upload). `overwrite` replaces a file that is already there;
// otherwise an EXISTS error comes back.
export async function uploadFile(file, dir, rel, { overwrite = false, signal } = {}) {
  const headers = {};
  const token = webToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const q = new URLSearchParams({ dir, rel });
  if (overwrite) q.set('overwrite', '1');
  if (!file) q.set('mkdir', '1');
  else headers['content-type'] = 'application/octet-stream';
  await ensureHost();
  const res = await fetch(apiUrl('api/upload', Object.fromEntries(q)), { method: 'POST', headers, body: file || undefined, signal });
  let body;
  try { body = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }
  return unwrap(body, `HTTP ${res.status}`);
}

// Native save-as picker (image save / convert) — desktop only; the browser downloads instead.
function tauriFilters(filters) {
  return (filters || []).filter((f) => f && f.extensions).map((f) => ({ name: f.name || 'Files', extensions: f.extensions }));
}

export async function pickSavePath(defaultPath, filters) {
  if (isElectron && electron.dialog) return unwrap(await electron.dialog('saveFile', { defaultPath, filters }), 'dialog error');
  if (!isTauri) return null;
  const { save } = await tauriDialog();
  const picked = await save({ defaultPath: defaultPath || undefined, filters: tauriFilters(filters) });
  return picked || null;
}

// Native file picker (settings › text editor application) — desktop only.
export async function pickFile(defaultPath, filters) {
  if (isElectron && electron.dialog) return unwrap(await electron.dialog('openFile', { defaultPath, filters }), 'dialog error');
  if (!isTauri) return null;
  const { open } = await tauriDialog();
  const picked = await open({ directory: false, multiple: false, defaultPath: defaultPath || undefined, filters: tauriFilters(filters) });
  return typeof picked === 'string' ? picked : null;
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

// Menu popup: only when a host exposes popupMenu. Otherwise null and the menu
// is drawn in the page (ContextMenu folds it into columns). Tauri uses the
// in-page menu.
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
export const fitWindow = (isElectron && electron.fitWindow)
  ? ((height) => electron.fitWindow(height))
  : (isTauri ? ((height) => { tauriFit(height); }) : null);

// The width the toolbar needs (src/lib/minwidth.js) becomes the window's minimum width. In a browser
// there is nothing to tell: the page's own min-width already makes it scroll instead of clipping.
// The theme list is taller than the space under its button, and a menu drawn in
// the page stops at the window edge. On the desktop it is a window of its own,
// placed in screen coordinates, so it can hang outside the application window.
// The browser has no such window and keeps the in-page menu.
const THEME_MENU_KEY = 'cc-theme-menu';
let themeMenuWindow = null;

export async function anchorScreenPoint(el) {
  const rect = el.getBoundingClientRect();
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  const inner = await win.innerPosition();
  const scale = await win.scaleFactor();
  return {
    x: inner.x / scale + rect.left,
    y: inner.y / scale + rect.bottom + 2,
    above: inner.y / scale + rect.top - 2,
  };
}

async function ensureThemeMenuWindow(x, y) {
  if (!themeMenuWindow) {
    themeMenuWindow = (async () => {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const existing = await WebviewWindow.getByLabel('theme-menu');
      if (existing) return existing;
      const webview = new WebviewWindow('theme-menu', {
        url: 'index.html?win=themeMenu&id=theme-menu',
        title: 'Theme',
        width: 420,
        height: 720,
        x: Math.round(x),
        y: Math.round(y),
        decorations: false,
        shadow: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        focus: false,
        visible: false,
        center: false,
        // Owned by the main window: Windows destroys it when the main window
        // closes, and it can still be placed outside that window.
        parent: 'main',
      });
      await new Promise((resolve, reject) => {
        webview.once('tauri://created', resolve);
        webview.once('tauri://error', (e) => reject(new Error(e && e.payload ? String(e.payload) : 'window error')));
      });
      return webview;
    })().catch((err) => { themeMenuWindow = null; throw err; });
  }
  return themeMenuWindow;
}

export async function showThemeMenu(payload) {
  const body = { ...payload, nonce: payload.nonce || Date.now() };
  try { localStorage.setItem(THEME_MENU_KEY, JSON.stringify(body)); } catch { /* the page reads an empty menu */ }
  await ensureThemeMenuWindow(payload.x, payload.y);
  await postToApp({ type: 'themeMenu:show' });
}

export function hideThemeMenu() {
  import('@tauri-apps/api/webviewWindow').then(async ({ WebviewWindow }) => {
    const win = await WebviewWindow.getByLabel('theme-menu');
    if (win) await win.hide();
  }).catch(() => {});
}

export function setMinContentWidth(width) {
  if (isElectron && electron.setMinContentWidth) electron.setMinContentWidth(width);
  else if (isTauri) tauriMinWidth(width);
}

const webChildren = new Set();
// A browser tab that opened the popups is the main window. Leaving it closes them.
if (typeof window !== 'undefined' && !windowKind) {
  window.addEventListener('pagehide', () => {
    for (const child of webChildren) {
      try { child.close(); } catch { /* already gone */ }
    }
  });
}
const SINGLETON_KINDS = new Set(['viewer', 'editor', 'preview', 'info', 'multiRename', 'search', 'settings', 'about', 'manual']);   // one popup per tool
const QUIET_KINDS = new Set(['preview']);   // re-used without taking the focus (it follows double-clicks in the file list)
let bus = null;
function channel() {
  if (!bus && typeof BroadcastChannel !== 'undefined') { try { bus = new BroadcastChannel('command-center'); } catch { bus = null; } }
  return bus;
}

// Settings and About open at the size their content actually takes, so the window is not
// drawn large and then shrunk. Settings is the width at which its tallest page (the viewer
// tab) still fits the height; About is the icon, the lines of text and the close button.
const TOOL_SIZES = { viewer: [960, 720], editor: [960, 720], preview: [720, 560], info: [660, 720], multiRename: [920, 680], search: [760, 600], settings: [960, 540], about: [480, 260], manual: [1000, 780] };
// The narrowest a tool window may get. The guide's header row (title, search, text size,
// languages) needs 769 px; doc/index.html keeps 780 px, plus the page's scrollbar.
const TOOL_MIN = { manual: [800, 480] };
// This window's smallest inner size. The host holds a drag on the native frame to it; a size set
// from code (the resize marker) is not held, so resizeWindow clamps to it. The main window's is
// tauri.conf.json's, raised by setMinContentWidth.
let tauriMin = windowKind ? (TOOL_MIN[windowKind] || [200, 150]) : [1149, 713];
// These two are created hidden and shown once their page has drawn, so the blank window
// never flashes past before the content is there.
const REVEAL_KINDS = new Set(['settings', 'about']);
const tauriToolIds = new Map();

function newWinId() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; }

async function tauriSize(width, height) {
  const { LogicalSize } = await import('@tauri-apps/api/dpi');
  return new LogicalSize(width, height);
}
async function currentTauriWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}
function tauriFit(height) {
  currentTauriWindow().then(async (win) => {
    const outer = await win.outerSize();
    const scale = await win.scaleFactor();
    await win.setSize(await tauriSize(Math.round(outer.width / scale), Math.max(200, Math.round(height))));
  }).catch(() => {});
}
// The colour behind the page while it is still blank. Taken from the theme that is on screen
// now, so a new window is that colour instead of the web view's default grey.
function pageBackground() {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const m = /^#([0-9a-fA-F]{6})$/.exec(raw);
    if (!m) return [18, 22, 28, 255];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  } catch { return [18, 22, 28, 255]; }
}
export function revealWindow() {
  if (!isTauri) return;
  currentTauriWindow().then(async (win) => {
    await win.show();
    try { await win.setFocus(); } catch { /* already in front */ }
  }).catch(() => {});
}
function tauriMinWidth(width) {
  const w = Math.max(1149, Math.round(Number(width) || 0));
  currentTauriWindow().then(async (win) => {
    const { LogicalSize } = await import('@tauri-apps/api/dpi');
    tauriMin = [w, 713];
    await win.setMinSize(new LogicalSize(w, 713));
    const scale = await win.scaleFactor();
    const inner = await win.innerSize();
    if (inner.width / scale < w - 0.5) {
      const outer = await win.outerSize();
      await win.setSize(new LogicalSize(w, Math.max(713, Math.round(outer.height / scale))));
    }
  }).catch(() => {});
}

async function openTauriWindow(kind, args, { title, width, height } = {}) {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const singleton = SINGLETON_KINDS.has(kind);
  const label = singleton ? `tool-${kind}` : `tool-${kind}-${newWinId()}`;
  const [dw, dh] = TOOL_SIZES[kind] || [900, 680];
  const existing = singleton ? await WebviewWindow.getByLabel(label) : null;
  if (existing) {
    const id = tauriToolIds.get(label);
    if (id) {
      try { localStorage.setItem(`cc-win:${id}`, JSON.stringify(args || {})); } catch { /* ignore */ }
      await postToApp({ type: 'replaceArgs', id, kind });
    }
    if (title) { try { await existing.setTitle(title); } catch { /* the page sets document.title as well */ } }
    if (!QUIET_KINDS.has(kind)) { try { await existing.setFocus(); } catch { /* ignore */ } }
    return id;
  }
  const id = newWinId();
  tauriToolIds.set(label, id);
  try { localStorage.setItem(`cc-win:${id}`, JSON.stringify(args || {})); } catch { /* ignore */ }
  const reveal = REVEAL_KINDS.has(kind);
  const webview = new WebviewWindow(label, {
    url: `index.html?win=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,
    title: title || kind,
    width: width || dw,
    height: height || dh,
    focus: !QUIET_KINDS.has(kind),
    resizable: kind !== 'settings' && kind !== 'about',
    ...(TOOL_MIN[kind] ? { minWidth: TOOL_MIN[kind][0], minHeight: TOOL_MIN[kind][1] } : {}),
    alwaysOnTop: QUIET_KINDS.has(kind),
    center: true,
    visible: !reveal,
    backgroundColor: pageBackground(),
    // Closing the main window closes this one with it.
    parent: 'main',
  });
  await new Promise((resolve, reject) => {
    webview.once('tauri://created', resolve);
    webview.once('tauri://error', (e) => reject(new Error(e && e.payload ? String(e.payload) : 'window error')));
  });
  // The page shows itself as soon as it has drawn. This is only the backstop, so a window
  // whose page never gets that far does not stay invisible.
  if (reveal) setTimeout(() => { webview.show().catch(() => {}); }, 1200);
  return id;
}

export async function openWindow(kind, args, { title, width, height } = {}) {
  if (isElectron) { const r = unwrap(await electron.openWindow({ kind, args, title, width, height }), 'window error'); return r.id; }
  if (isTauri) return openTauriWindow(kind, args, { title, width, height });
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
  const [bw, bh] = TOOL_SIZES[kind] || [900, 680];
  const w = window.open(url.toString(), `cc-${kind}-${id}`, `popup=yes,width=${width || bw},height=${height || bh}`);
  if (w) { w.ccKind = kind; w.ccId = id; }
  if (!w) throw new Error('POPUP_BLOCKED');
  webChildren.add(w);
  return id;
}

// Arguments for this tool window. Kept once read, so a second read (the page renders from them
// immediately, then the loader asks again) returns the same object. New arguments left for this
// window (the same tool asked for again: replaceArgs) replace them.
const argCache = new Map();
function cachedWindowArgs() {
  if (!windowId) return null;
  try {
    const raw = localStorage.getItem(`cc-win:${windowId}`);
    if (raw) { localStorage.removeItem(`cc-win:${windowId}`); argCache.set(windowId, JSON.parse(raw)); }
  } catch { /* keep what was read before */ }
  return argCache.has(windowId) ? argCache.get(windowId) : null;
}
export function seededWindowArgs() {
  if (isElectron) return null;
  return cachedWindowArgs();
}
export async function windowArgs() {
  if (isElectron) return unwrap(await electron.windowArgs(windowId), 'window error');
  return cachedWindowArgs() || {};
}

// Resize grip (desktop only): the window's outer size and a resize while dragging.
export const canResizeWindow = (isElectron && !!electron.resizeWindow) || isTauri;
export async function windowSize() {
  if (isElectron) return unwrap(await electron.windowSize(), 'window error');
  if (isTauri) {
    const win = await currentTauriWindow();
    // The inner size: setSize (resizeWindow) sets that one, so a framed window does not jump by its frame.
    const inner = await win.innerSize();
    const scale = await win.scaleFactor();
    return { width: Math.round(inner.width / scale), height: Math.round(inner.height / scale) };
  }
  return { width: window.outerWidth, height: window.outerHeight };
}
export function resizeWindow(width, height) {
  if (isElectron) electron.resizeWindow(width, height);
  else if (isTauri) {
    const w = Math.max(tauriMin[0], Math.round(width)), h = Math.max(tauriMin[1], Math.round(height));
    currentTauriWindow().then(async (win) => { await win.setSize(await tauriSize(w, h)); }).catch(() => {});
  }
}

export function closeWindow() {
  if (isElectron) electron.closeWindow();
  else if (isTauri) currentTauriWindow().then((win) => win.close()).catch(() => {});
  else window.close();
}

export async function postToApp(msg) {
  if (isElectron) { electron.postMessage(msg); return; }
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('bus_post', { msg });
    return;
  }
  const c = channel(); if (c) c.postMessage(msg);
}

export function onAppMessage(cb) {
  if (isElectron) return electron.onMessage(cb);
  if (isTauri) {
    let unlisten = () => {};
    let dead = false;
    import('@tauri-apps/api/event').then(({ listen }) => listen('cc-bus', (e) => cb(e.payload))).then((u) => { if (dead) u(); else unlisten = u; }).catch(() => {});
    return () => { dead = true; unlisten(); };
  }
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
