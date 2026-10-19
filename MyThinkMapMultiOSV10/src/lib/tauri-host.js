// Desktop host when the page runs inside the Tauri shell.
// The Node service (host/desktop.js) answers core API calls over HTTP.
// Window chrome, native dialogs, menus and OS file hand-off stay here.
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { Image } from '@tauri-apps/api/image';
import { CheckMenuItem, IconMenuItem, Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl, openPath } from '@tauri-apps/plugin-opener';

const POPUPS = {
  settings: { width: 1000, height: 860 },
  about: { width: 560, height: 360 },
  shortcuts: { width: 1000, height: 800 },
  print: { width: 1100, height: 800, resizable: true },
  help: { width: 1180, height: 820, resizable: true },
};
const POPUP_LABELS = Object.keys(POPUPS);
const KEEP = new Set(['settings']);

const selfId = Math.random().toString(36).slice(2);
let popupsDying = false;
let closing = false;
let lastNormal = null;
let minW = 640;

function bootHost() {
  const boot = typeof window !== 'undefined' ? window.__MTM_HOST__ : null;
  return boot && boot.port && boot.token ? boot : null;
}

let hostPromise = null;
function ensureHost() {
  const boot = bootHost();
  if (boot) return Promise.resolve(boot);
  if (!hostPromise) hostPromise = invoke('host_info').then((h) => { window.__MTM_HOST__ = h; return h; });
  return hostPromise;
}

export async function apiCall(name, args = {}) {
  const host = await ensureHost();
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${host.port}/api/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${host.token}` },
      body: JSON.stringify(args ?? {}),
    });
  } catch (err) {
    throw new Error(err && err.message ? err.message : 'ThinkMap service unavailable');
  }
  let body;
  try { body = await res.json(); } catch { throw new Error(`HTTP ${res.status}`); }
  if (body && body.ok) return body.data;
  const err = new Error(body && body.error ? body.error.message : `HTTP ${res.status}`);
  if (body && body.error) {
    const { stack, ...rest } = body.error;
    Object.assign(err, rest);
    if (stack) err.stack = `${stack}\n    [renderer] ${(err.stack || '').split('\n').slice(1, 3).join('\n').trim()}`;
  }
  throw err;
}

// opts.filters: [{ name, extensions: ['tmap', …] }] (the UI builds them, src/lib/formats/index.js)
export async function nativeDialog(kind, opts = {}) {
  if (kind === 'openFolder') {
    const picked = await open({ directory: true, multiple: false, defaultPath: opts.defaultPath, title: opts.title || 'Open folder' });
    return picked || null;
  }
  if (kind === 'save') {
    const picked = await save({
      defaultPath: opts.defaultPath || opts.name,
      title: opts.title || 'Save as',
      filters: opts.filters && opts.filters.length ? opts.filters : [{ name: 'All files', extensions: ['*'] }],
    });
    return picked || null;
  }
  const selected = await open({
    directory: false,
    multiple: opts.multi !== false,
    defaultPath: opts.defaultPath,
    title: opts.title || 'Open',
    filters: opts.filters && opts.filters.length ? opts.filters : [{ name: 'All files', extensions: ['*'] }],
  });
  if (selected == null) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function windowControl(action) {
  const win = getCurrentWindow();
  if (action === 'minimize') await win.minimize();
  else if (action === 'maximize') await win.toggleMaximize();
  else if (action === 'close') await win.close();
  else if (action === 'fullscreen') await win.setFullscreen(!(await win.isFullscreen()));
}

export function onMaximized(cb) {
  let un = () => {};
  let dead = false;
  (async () => {
    const win = getCurrentWindow();
    try { cb(await win.isMaximized()); } catch { /* gone */ }
    const off = await win.onResized(async () => { try { cb(await win.isMaximized()); } catch { /* gone */ } });
    if (dead) off(); else un = off;
  })();
  return () => { dead = true; un(); };
}

export async function getWindowSize() {
  const win = getCurrentWindow();
  const factor = await win.scaleFactor();
  const size = await win.outerSize();
  return [size.width / factor, size.height / factor];
}

export function setWindowSize(w, h) {
  const win = getCurrentWindow();
  win.isMaximized().then((max) => {
    if (!max) return win.setSize(new LogicalSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))));
  }).catch(() => {});
}

export function setMinContentWidth(w) {
  const need = Math.ceil(w);
  if (!(need > minW)) return;
  minW = need;
  const win = getCurrentWindow();
  win.setMinSize(new LogicalSize(need, 600)).catch(() => {});
  Promise.all([win.isMaximized(), win.isFullscreen(), win.outerSize(), win.scaleFactor()]).then(([max, full, size, factor]) => {
    if (!max && !full && size.width / factor < need) return win.setSize(new LogicalSize(need, Math.round(size.height / factor)));
  }).catch(() => {});
}

export function setTitle(title) {
  getCurrentWindow().setTitle(title || 'My ThinkMap').catch(() => {});
}

async function readNormal() {
  const win = getCurrentWindow();
  if (win.label !== 'main' || await win.isMaximized()) return;
  const factor = await win.scaleFactor();
  const pos = await win.outerPosition();
  const size = await win.innerSize();
  lastNormal = { x: pos.x / factor, y: pos.y / factor, width: size.width / factor, height: size.height / factor };
}

export function startTracking() {
  const win = getCurrentWindow();
  if (win.label !== 'main') return;
  readNormal().catch(() => {});
  win.onResized(() => { readNormal().catch(() => {}); }).catch(() => {});
  win.onMoved(() => { readNormal().catch(() => {}); }).catch(() => {});
}

async function saveBounds() {
  const win = getCurrentWindow();
  if (win.label !== 'main') return;
  const maximized = await win.isMaximized();
  if (!lastNormal) await readNormal();
  const bounds = lastNormal
    ? { ...lastNormal, maximized }
    : { width: 1320, height: 840, maximized };
  await apiCall('session.save', { windowBounds: bounds });
}

let closeCb = null;
let closeInstalled = false;
export function onCloseRequest(cb) {
  closeCb = cb;
  if (closeInstalled) return () => { closeCb = null; };
  closeInstalled = true;
  let un = () => {};
  getCurrentWindow().onCloseRequested(async (event) => {
    if (getCurrentWindow().label !== 'main') return;
    if (closing) return;
    event.preventDefault();
    try { await saveBounds(); } catch { /* the session write is best-effort */ }
    if (closeCb) closeCb();
  }).then((off) => { un = off; }).catch(() => {});
  return () => { closeCb = null; un(); };
}

export async function replyClose(allow) {
  if (!allow) return;
  closing = true;
  popupsDying = true;
  for (const label of POPUP_LABELS) {
    const w = await WebviewWindow.getByLabel(label);
    if (w) { try { await w.destroy(); } catch { /* already closed */ } }
  }
  try { await getCurrentWindow().destroy(); } catch { /* already closing */ }
}

export function onFocus(cb) {
  let un = () => {};
  let dead = false;
  getCurrentWindow().onFocusChanged(({ payload }) => { if (payload) cb(); }).then((off) => { if (dead) off(); else un = off; }).catch(() => {});
  return () => { dead = true; un(); };
}

export function onOpenFiles(cb) {
  let un = () => {};
  let dead = false;
  listen('files:open', (e) => { if (Array.isArray(e.payload) && e.payload.length) cb(e.payload); }).then((off) => { if (dead) off(); else un = off; });
  return () => { dead = true; un(); };
}

export function rendererReady() { invoke('renderer_ready').catch(() => {}); }

export function onOsFileDrop(cb) {
  let un = () => {};
  let dead = false;
  (async () => {
    const win = getCurrentWindow();
    const off = await win.onDragDropEvent(async (event) => {
      const payload = event.payload;
      if (!payload || payload.type !== 'drop' || !payload.paths || !payload.paths.length) return;
      const factor = await win.scaleFactor();
      cb({
        paths: payload.paths,
        x: payload.position ? payload.position.x / factor : null,
        y: payload.position ? payload.position.y / factor : null,
      });
    });
    if (dead) off(); else un = off;
  })();
  return () => { dead = true; un(); };
}

function pngBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function accelerator(shortcut) {
  if (!shortcut) return undefined;
  const s = String(shortcut).replace(/^Ctrl\+/, 'CmdOrCtrl+').replace(/\+\+$/, '+Plus');
  return /^[ -~]+$/.test(s) ? s : undefined;
}

export async function popupMenu(items, pos) {
  let picked = null;
  const built = [];
  for (const it of items || []) {
    if (it.sep) { built.push(await PredefinedMenuItem.new({ item: 'Separator' })); continue; }
    if (it.header) { built.push(await MenuItem.new({ text: String(it.header), enabled: false })); continue; }
    const shortcut = accelerator(it.shortcut);
    const text = `${it.label}${it.meta ? `  (${it.meta})` : ''}`;
    const action = () => { picked = it.id; };
    const base = { text, enabled: !it.disabled, accelerator: shortcut, action };
    if (it.radio || it.checked !== undefined) { built.push(await CheckMenuItem.new({ ...base, checked: !!it.checked })); continue; }
    let icon;
    if (it.png) { try { icon = await Image.fromBytes(pngBytes(it.png)); } catch { icon = undefined; } }
    built.push(icon ? await IconMenuItem.new({ ...base, icon }) : await MenuItem.new(base));
  }
  const menu = await Menu.new({ items: built });
  await menu.popup(new LogicalPosition(Math.round((pos && pos.x) || 0), Math.round((pos && pos.y) || 0)), getCurrentWindow());
  return picked;
}

async function placePopup(win, spec) {
  const main = await WebviewWindow.getByLabel('main');
  if (!main) return;
  const factor = await main.scaleFactor();
  const pos = await main.outerPosition();
  const size = await main.outerSize();
  const x = pos.x / factor + (size.width / factor - spec.width) / 2;
  const y = pos.y / factor + Math.max(40, (size.height / factor - spec.height) / 2);
  await win.setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
}

function popupUrl(kind, tab) {
  const q = new URLSearchParams({ popup: kind });
  if (tab) q.set('tab', tab);
  return `/?${q}`;
}

async function openPopupWindow(kind, tab, { warm = false } = {}) {
  const spec = POPUPS[kind];
  if (!spec) return;
  const existing = await WebviewWindow.getByLabel(kind);
  if (existing) {
    if (warm) return;
    try { await placePopup(existing, spec); } catch { /* keep where the user left it */ }
    if (kind === 'help' && tab) await emit('help:open', { tab });
    await existing.show();
    await existing.setFocus();
    return;
  }
  const win = new WebviewWindow(kind, {
    url: popupUrl(kind, warm ? '' : tab),
    title: 'My ThinkMap',
    width: spec.width,
    height: spec.height,
    resizable: !!spec.resizable,
    maximizable: !!spec.resizable,
    minimizable: true,
    decorations: false,
    shadow: true,
    parent: 'main',
    visible: false,
    focus: false,
  });
  win.once('tauri://created', async () => {
    try { await placePopup(win, spec); } catch { /* centered by the shell if this fails */ }
    if (!warm) { await win.show(); await win.setFocus(); }
    await win.onCloseRequested(async (event) => {
      if (KEEP.has(kind) && !popupsDying) { event.preventDefault(); await win.hide(); }
    });
  });
}

export function openPopup(kind, tab) {
  if (!POPUPS[kind]) return false;
  openPopupWindow(kind, tab || '', { warm: false }).catch(() => {});
  return true;
}

export function warmPopups() {
  setTimeout(() => { openPopupWindow('settings', '', { warm: true }).catch(() => {}); }, 1500);
}

export async function openPrint(job) {
  await apiCall('print.setJob', { job });
  const existed = await WebviewWindow.getByLabel('print');
  await openPopupWindow('print', '', { warm: false });
  if (existed) await emit('print:ping', {});
}

export function onPrintJob(cb) {
  let un = () => {};
  let dead = false;
  listen('print:ping', async () => {
    try { const job = await apiCall('print.takeJob'); if (job) cb(job); } catch { /* the window will keep the job it already has */ }
  }).then((off) => { if (dead) off(); else un = off; });
  return () => { dead = true; un(); };
}

export function takePrintJob() { return apiCall('print.takeJob'); }
export function listPrinters() { return apiCall('print.printers'); }
export function printHtml(html, opts) { return apiCall('print.html', { html, opts: opts || {} }); }

export function sendSettingsPatch(patch) { emit('settings:patch', { ...(patch || {}), __from: selfId }); }
export function onSettingsPatch(cb) {
  let un = () => {};
  let dead = false;
  listen('settings:patch', (e) => {
    const payload = e.payload || {};
    if (payload.__from === selfId) return;
    const patch = { ...payload };
    delete patch.__from;
    cb(patch);
  }).then((off) => { if (dead) off(); else un = off; });
  return () => { dead = true; un(); };
}

export function quit() { getCurrentWindow().close().catch(() => {}); }
// A web address opens in the browser; anything else is a file or folder for its default app.
export function openExternal(target) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target) || /^mailto:/i.test(target)) openUrl(target).catch(() => {});
  else openPath(target).catch(() => { apiCall('os.open', { path: target }).catch(() => {}); });
}

// The Help window, asked for a chapter while it is already open.
export function onHelpOpen(cb) {
  let un = () => {};
  let dead = false;
  listen('help:open', (e) => { if (e.payload && e.payload.tab) cb(e.payload.tab); }).then((off) => { if (dead) off(); else un = off; });
  return () => { dead = true; un(); };
}
