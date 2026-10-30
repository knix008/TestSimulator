// Transport switch between the two hosts.
//
//   tauri — the desktop app. src-tauri starts the Node core (server/server.js)
//           on a free loopback port and tells the page where (`host_config`);
//           the page calls it over HTTP with a bearer token. Window buttons,
//           dialog windows, the clipboard and the folder picker are Tauri's.
//   web   — fetch('./api/<method>') against the server that served the page.
//
// Jobs and terminal output are polled in both. Everything above this file is
// host-agnostic.
const tauriInternals = typeof window !== 'undefined' ? window.__TAURI_INTERNALS__ : null;

export const isTauri = !!tauriInternals;
export const isDesktop = isTauri;
export const hostName = isTauri ? 'tauri' : 'web';

// Set once the Tauri shell has said where it started the core.
let apiOrigin = '';
let apiToken = '';
let hostReady = null;

export function invoke(cmd, args) {
  return import('@tauri-apps/api/core').then(({ invoke: run }) => run(cmd, args));
}

export function currentWindow() {
  return import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow());
}

// Listens to a Tauri event sent to this window (or to every window). Returns an
// unsubscribe fn. Window-scoped on purpose: a global listener would also get the
// events the shell sends to other windows (another window's dialog results).
export function listen(event, cb) {
  if (!isTauri) return () => {};
  let off = null;
  let stopped = false;
  import('@tauri-apps/api/webviewWindow').then(({ getCurrentWebviewWindow }) => getCurrentWebviewWindow().listen(event, (e) => cb(e.payload))).then((unlisten) => {
    if (stopped) unlisten(); else off = unlisten;
  }).catch(() => {});
  return () => { stopped = true; if (off) off(); };
}

export function ensureHost() {
  if (!isTauri) return Promise.resolve();
  if (!hostReady) {
    hostReady = invoke('host_config').then((cfg) => {
      if (!cfg || cfg.error || !cfg.origin) throw new Error(cfg && cfg.error ? cfg.error : 'The core is not running');
      apiOrigin = cfg.origin.endsWith('/') ? cfg.origin : `${cfg.origin}/`;
      apiToken = cfg.token || '';
    });
  }
  return hostReady;
}

function webToken() {
  if (apiToken) return apiToken;
  try {
    const t = new URLSearchParams(window.location.search).get('token');
    if (t) sessionStorage.setItem('mfc-token', t);
    return sessionStorage.getItem('mfc-token') || '';
  } catch { return ''; }
}

// { ok:false, error } → an Error carrying code / path / syscall and the stack
// of the process that failed (the core).
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
  const headers = { 'content-type': 'application/json' };
  const token = webToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const endpoint = apiOrigin ? new URL(`api/${encodeURIComponent(name)}`, apiOrigin).href : `./api/${encodeURIComponent(name)}`;
  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(args) });
  let body;
  try { body = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }
  return unwrap(body, `HTTP ${res.status}`);
}

// ── Jobs ──────────────────────────────────────────────────

// Follows a job until it leaves the running state. Returns an unsubscribe fn.
export function followJob(id, onUpdate) {
  let stopped = false;
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
  return () => { stopped = true; };
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
  if (isTauri) {
    try { const { writeText } = await import('@tauri-apps/plugin-clipboard-manager'); await writeText(String(text ?? '')); return; } catch { /* fall back */ }
  }
  try { await navigator.clipboard.writeText(text); } catch { /* denied */ }
}

export async function readClipboardText() {
  if (isTauri) {
    try { const { readText } = await import('@tauri-apps/plugin-clipboard-manager'); return (await readText()) || ''; } catch { return ''; }
  }
  try { return await navigator.clipboard.readText(); } catch { return ''; }
}

// ── Files in and out (desktop): OS drag & drop, the shell file clipboard ──

// Hands local `paths` to an OS drag (Explorer / Finder / the desktop can take
// them). `move` asks the drop target to move rather than copy. Resolves when
// the drag is over.
export async function startNativeDrag(paths, move = false) {
  if (!isTauri) return;
  await invoke('start_file_drag', { paths, moveFiles: !!move });
}

// { shift, ctrl, left } held right now — the page sees no key events during an OS drag.
export async function dragKeys() {
  if (!isTauri) return { shift: false, ctrl: false, left: false };
  try { return await invoke('drag_keys'); } catch { return { shift: false, ctrl: false, left: false }; }
}

// Windows: a real file list on the clipboard, so Explorer can paste what we cut
// or copied. False where the host has none.
export async function writeFileClipboard(paths, cut, text) {
  if (!isTauri) return false;
  try { return !!(await invoke('clipboard_write_files', { paths, cut: !!cut, text: text || '' })); } catch { return false; }
}

// { paths, cut } from the shell clipboard (also a cut or copy made in
// Explorer), or null when this host cannot read one.
export async function readFileClipboard() {
  if (!isTauri) return null;
  try {
    const data = await invoke('clipboard_read_files');
    return data && Array.isArray(data.paths) ? { paths: data.paths, cut: !!data.cut } : null;
  } catch { return null; }
}

export async function clearFileClipboard() {
  if (isTauri) await invoke('clipboard_clear_files').catch(() => {});
}

// Files dragged over / dropped on the window from outside (Explorer, the
// desktop, our own drag coming back). `cb({ type, x, y, paths })` with CSS
// pixel coordinates; type is enter | over | drop | leave.
export function onOsDragDrop(cb) {
  if (!isTauri) return () => {};
  let off = null;
  let stopped = false;
  import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload || {};
    const scale = window.devicePixelRatio || 1;
    const pos = p.position || { x: 0, y: 0 };
    cb({ type: p.type, x: pos.x / scale, y: pos.y / scale, paths: p.paths || [] });
  })).then((unlisten) => {
    if (stopped) unlisten(); else off = unlisten;
  }).catch(() => {});
  return () => { stopped = true; if (off) off(); };
}

// ── Terminal output: polled (terminal.read) in both hosts ──

export const terminalsStream = false;
export function onTerminalData() { return () => {}; }
export function onTerminalExit() { return () => {}; }

// ── Folder picker: the native one on the desktop, the core's (if any) otherwise ──

export async function pickFolder(start) {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: true, multiple: false, defaultPath: start || undefined });
    return typeof picked === 'string' ? picked : '';
  }
  const r = await call('local.pickFolder', { start });
  return (r && r.path) || '';
}

// ── Window controls (desktop only; the browser has its own chrome) ──

export function windowControl(action) {
  if (!isTauri) { if (action === 'close') window.close(); return; }
  currentWindow().then((w) => {
    if (action === 'minimize') return w.minimize();
    if (action === 'maximize') return w.toggleMaximize();
    if (action === 'close') return w.close();
    return undefined;
  }).catch(() => {});
}

export function onMaximized(cb) {
  if (!isTauri) return () => {};
  let off = null;
  let stopped = false;
  currentWindow().then(async (w) => {
    const update = () => w.isMaximized().then((v) => { if (!stopped) cb(v); }).catch(() => {});
    update();
    const unlisten = await w.onResized(update);
    if (stopped) unlisten(); else off = unlisten;
  }).catch(() => {});
  return () => { stopped = true; if (off) off(); };
}

// The size grip (status bar, bottom-right): the OS resizes the window from that corner.
export function startResize() {
  if (isTauri) currentWindow().then((w) => w.startResizeDragging('SouthEast')).catch(() => {});
}

// The toolbar (and a dialog window's title) is the drag region of the frameless
// window: a press on it — not on one of its controls — moves the window.
const DRAG_REGIONS = '.toolbar, .dlg.standalone .dlg-title, .doc-head';
const NO_DRAG = 'button, select, input, textarea, a, .tb-conn, .tb-font, .theme-select-btn, [data-no-drag]';

export function installWindowDrag(doc = document) {
  if (!isTauri) return () => {};
  const onDown = (e) => {
    if (e.button !== 0 || e.detail > 1) return;
    const target = e.target;
    if (!target || !target.closest || !target.closest(DRAG_REGIONS) || target.closest(NO_DRAG)) return;
    e.preventDefault();
    currentWindow().then((w) => w.startDragging()).catch(() => {});
  };
  doc.addEventListener('mousedown', onDown);
  return () => doc.removeEventListener('mousedown', onDown);
}

export function quitApp() {
  windowControl('close');
}

// ── User guide (doc/index.html) ──
// Desktop: its own window, outside the main one. Browser: a new tab. Either
// way it gets the app's theme colours, language and font size, and follows
// later changes (`dialog:appearance` on the desktop, localStorage in a browser).

export const DOC_APPEARANCE_KEY = 'mfc-doc-appearance';

export function openManual(appearance) {
  if (isTauri) return invoke('manual_open', { appearance });
  try { localStorage.setItem(DOC_APPEARANCE_KEY, JSON.stringify(appearance)); } catch { /* private mode */ }
  window.open('./doc/index.html', 'mfc-user-guide');
  return Promise.resolve(true);
}

// Theme / language / font size changed: every other window (dialogs, the guide) follows.
export function broadcastAppearance(appearance) {
  try { localStorage.setItem(DOC_APPEARANCE_KEY, JSON.stringify(appearance)); } catch { /* private mode */ }
  if (isTauri) return invoke('broadcast_appearance', { appearance }).catch(() => {});
  return Promise.resolve();
}

export function onAppearance(cb) {
  return listen('dialog:appearance', cb);
}
