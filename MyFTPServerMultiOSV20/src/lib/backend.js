// Transport switch between the two hosts.
//
//   desktop  — the Tauri program (src-tauri) put `window.__MFS_HOST__` =
//              { port, token, platform, firstRun } in the page: core/api.js
//              runs in its Node host (host/host.js) and is called with fetch
//              on 127.0.0.1 + the token; dialogs, reveal, open, clipboard and
//              the window go through Tauri directly
//   web      — fetch('./api/<method>') against server/server.js
//
// Both poll `server.poll` for log lines and the server state. Everything
// above this file is host-agnostic.
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

const boot = typeof window !== 'undefined' ? window.__MFS_HOST__ || null : null;

export const isDesktop = !!boot;
export const hostName = isDesktop ? 'tauri' : 'web';
/** The desktop host could not start (no Node.js, …): the reason. */
export const hostError = boot && boot.error ? String(boot.error) : '';
/** process.platform of the desktop host ('' on the web). */
export const platform = boot ? boot.platform || '' : '';
/** No window position was saved yet (first desktop run). */
export const firstRun = !!(boot && boot.firstRun);

function webToken() {
  try {
    const t = new URLSearchParams(window.location.search).get('token');
    if (t) sessionStorage.setItem('mfs-token', t);
    return sessionStorage.getItem('mfs-token') || '';
  } catch { return ''; }
}

// { ok:false, error } → an Error carrying code / path / detail and the stack
// of the process that failed (the Node host or the web server).
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

const dialogFilters = (filters) => (filters || []).map((f) => ({ name: f.name, extensions: f.extensions }));

// The host-native methods of core/api.js, answered by Tauri on the desktop.
const NATIVE = {
  'host.pickFolder': async ({ title, defaultPath }) => ({ path: (await openDialog({ title, defaultPath: defaultPath || undefined, directory: true, multiple: false })) || null }),
  'host.pickFile': async ({ title, defaultPath, filters }) => ({ path: (await openDialog({ title, defaultPath: defaultPath || undefined, multiple: false, filters: dialogFilters(filters) })) || null }),
  'host.saveFile': async ({ title, defaultPath, filters }) => ({ path: (await saveDialog({ title, defaultPath: defaultPath || undefined, filters: dialogFilters(filters) })) || null }),
  'host.reveal': async ({ path }) => {
    // A folder opens itself; a file is shown selected in its folder.
    const st = await apiCall('local.stat', { path });
    if (st && st.isDir) await openPath(path); else await revealItemInDir(path);
    return { ok: true };
  },
  'host.open': async ({ path }) => { await openPath(path); return { ok: true }; },
  'clipboard.write': async ({ text }) => { await writeText(text || ''); return { ok: true }; },
};

async function apiCall(name, args = {}) {
  const headers = { 'content-type': 'application/json' };
  let url = `./api/${encodeURIComponent(name)}`;
  if (isDesktop) {
    if (hostError) throw Object.assign(new Error(hostError), { code: 'NOHOST' });
    url = `http://127.0.0.1:${boot.port}/api/${encodeURIComponent(name)}`;
    headers.authorization = `Bearer ${boot.token}`;
  } else {
    const token = webToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(args) });
  let body;
  try { body = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }
  return unwrap(body, `HTTP ${res.status}`);
}

export async function call(name, args = {}) {
  if (isDesktop && NATIVE[name]) return NATIVE[name](args || {});
  const data = await apiCall(name, args);
  // The Node host has no dialogs of its own; the desktop page has them all.
  if (isDesktop && name === 'app.info' && data) {
    data.capabilities = { pickFolder: true, pickFile: true, saveFile: true, reveal: true, open: true, clipboard: true };
  }
  return data;
}

// ── Live updates ──────────────────────────────────────────
// subscribe({ onLog(line), onUpdate({state, stats}) }, fromSeq) → unsubscribe.
// Polls `server.poll` (700 ms, 250 ms while clients are connected so the
// counters feel live).
export function subscribe({ onLog, onUpdate }, fromSeq = 0) {
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
  if (isDesktop) { await call('clipboard.write', { text }); return; }
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

// ── Window (desktop only; the browser has its own chrome) ──

const win = () => getCurrentWindow();
const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };

export function windowControl(action) {
  if (!isDesktop) { if (action === 'close') window.close(); return; }
  if (action === 'minimize') quiet(win().minimize());
  else if (action === 'maximize') quiet(win().toggleMaximize());
  // The shell decides: quit, or hide to the tray while a server runs.
  else if (action === 'close') quiet(win().close());
}

export function onMaximized(cb) {
  if (!isDesktop) return () => {};
  let off = null;
  let gone = false;
  const check = () => win().isMaximized().then((m) => { if (!gone) cb(m); }).catch(() => {});
  check();
  win().onResized(check).then((un) => { if (gone) un(); else off = un; }).catch(() => {});
  return () => { gone = true; if (off) off(); };
}

/** Logical inner size of the window. */
export async function getWindowSize() {
  if (!isDesktop) return [window.outerWidth, window.outerHeight];
  const [size, scale] = await Promise.all([win().innerSize(), win().scaleFactor()]);
  return [size.width / scale, size.height / scale];
}

export function setMinWindowSize(w, h) {
  if (isDesktop) quiet(invoke('set_min_size', { width: w, height: h }));
}

export function setWindowSize(w, h) {
  if (isDesktop) quiet(win().setSize(new LogicalSize(Math.round(w), Math.round(h))));
}

/** The system's own resize loop from the bottom-right grip. */
export function startResizeDrag() {
  if (isDesktop) quiet(win().startResizeDragging('SouthEast'));
}

/** Moves the window with the pointer (macOS / Linux: the CSS drag region only works on Windows). */
export function startWindowDrag() {
  if (isDesktop) quiet(win().startDragging());
}

/** The first frame is painted: the shell shows the window. */
export function rendererReady() {
  if (isDesktop) quiet(invoke('renderer_ready'));
}

/** Tray icon on / off, and whether closing hides the window (a server runs). */
export function setTray({ enabled, keep, show, quit }) {
  if (isDesktop) quiet(invoke('set_tray', { args: { enabled: !!enabled, keep: !!keep, show, quit } }));
}

export function quitApp() {
  if (isDesktop) quiet(invoke('quit_app'));
  else window.close();
}

// ── User guide (doc/index.html) ──
// Desktop: its own window beside the main one. Browser: a new tab. Either
// way it gets the app's theme and language, and follows later changes
// (`doc:appearance` on the desktop, localStorage in a browser).
//   appearance = { language, bg, mode, vars: { '--bg': …, … } }
export const DOC_APPEARANCE_KEY = 'mfs-doc-appearance';

export function openManual(appearance) {
  try { localStorage.setItem(DOC_APPEARANCE_KEY, JSON.stringify(appearance)); } catch { /* private mode */ }
  if (isDesktop) return invoke('manual_open', { appearance });
  window.open('./doc/index.html', 'mfs-user-guide');
  return Promise.resolve(true);
}

/** Theme or language changed: the open guide follows. */
export function broadcastAppearance(appearance) {
  try { localStorage.setItem(DOC_APPEARANCE_KEY, JSON.stringify(appearance)); } catch { /* private mode */ }
  if (isDesktop) quiet(invoke('broadcast_appearance', { appearance }));
}

// ── Theme dropdown (desktop) ──
// A window of its own beside the main one (src-tauri theme_menu_open), so it
// may reach past the main window's edges. `button` is the ▾ (its rectangle in
// this page); `data` = { current, language, fontSize, customThemes, bg }.
export function openThemeMenu(button, data) {
  const r = button.getBoundingClientRect();
  return invoke('theme_menu_open', { args: { anchor: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, data } });
}

export function closeThemeMenu() {
  if (isDesktop) quiet(invoke('theme_menu_close'));
}

/** onPick("theme:<id>" | "newCustomTheme" | "themeSettings"), onClosed(): returns an unsubscribe function. */
export function onThemeMenu({ onPick, onClosed }) {
  if (!isDesktop) return () => {};
  const offs = [win().listen('theme-menu:pick', (e) => onPick(String(e.payload))), win().listen('theme-menu:closed', () => onClosed())];
  return () => offs.forEach((p) => p.then((off) => off()).catch(() => {}));
}

// ── Dialog windows (desktop): Settings and About ──
// Windows of their own (src-tauri dialog_open), movable past the main window.
// The main window awaits `dialog:result` (null = cancelled or closed); the
// settings window also sends live theme previews (`dialog:preview`).
const pendingDialogs = new Map();
let dialogResults = null;

export async function openDialogWindow(kind, payload) {
  if (pendingDialogs.has(kind)) { quiet(invoke('dialog_open', { kind, payload })); return pendingDialogs.get(kind).promise; }
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  pendingDialogs.set(kind, { promise, resolve });
  if (!dialogResults) {
    dialogResults = win().listen('dialog:result', (e) => {
      const { kind: k, data } = e.payload || {};
      const p = pendingDialogs.get(k);
      if (p) { pendingDialogs.delete(k); p.resolve(data === undefined ? null : data); }
    });
  }
  await dialogResults;
  try { await invoke('dialog_open', { kind, payload }); } catch (err) { pendingDialogs.delete(kind); throw err; }
  return promise;
}

export function onDialogPreview(cb) {
  if (!isDesktop) return () => {};
  const p = win().listen('dialog:preview', (e) => cb(e.payload || {}));
  return () => { p.then((off) => off()).catch(() => {}); };
}

// In a dialog window: what to show, and the way back.
export const dialogWindow = typeof window !== 'undefined' ? window.__MFS_DIALOG__ || null : null;
export function submitDialog(data) { return invoke('dialog_submit', { data: data === undefined ? null : data }); }
export function previewDialog(data) { quiet(invoke('dialog_preview', { data })); }
/** Painted: fit the window to `size` (About) and show it. */
export function dialogReady(size) {
  if (size) quiet(invoke('dialog_size', size));
  quiet(invoke('dialog_ready'));
}
export function startDialogDrag() { quiet(win().startDragging()); }
