// Transport switch between the hosts.
//
//   tauri    — the Tauri shell (src/lib/tauri-host.js). Core calls go to the
//              Node service it starts; window, dialogs and menus are Tauri.
//   electron — window.myEditor, if a preload injects it
//   web      — fetch('/api/<method>'); dialogs are drawn by the UI
import * as tauri from './tauri-host.js';

const tauriHost = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
const electron = !tauriHost && typeof window !== 'undefined' ? window.myEditor : null;

export const isTauri = tauriHost;
// The UI treats either desktop shell as the native app (window buttons, grip, dialogs).
export const isElectron = !!(tauriHost || electron);
export const hostName = tauriHost ? 'tauri' : electron ? 'electron' : 'web';
export const platform = tauriHost
  ? ((typeof window !== 'undefined' && window.__MED_HOST__ && window.__MED_HOST__.platform) || (/mac/i.test(navigator.userAgent) ? 'darwin' : /win/i.test(navigator.userAgent) ? 'win32' : 'linux'))
  : electron
    ? electron.platform
    : (navigator.platform || '').toLowerCase().startsWith('win') ? 'win32' : /mac/i.test(navigator.platform || '') ? 'darwin' : 'linux';
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

// A URL the <audio> / <video> element can play. The element cannot send the
// bearer header, so the desktop service accepts the same token on the query.
export async function mediaSrc(filePath) {
  if (tauriHost) return tauri.mediaSrc(filePath);
  const q = new URLSearchParams({ path: filePath });
  const token = webToken();
  if (token) q.set('token', token);
  return `./api/file.media?${q}`;
}

export async function call(name, args = {}) {
  if (tauriHost) return tauri.apiCall(name, args);
  if (electron) return unwrap(await electron.call(name, args), 'IPC error');
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
  if (tauriHost) return tauri.nativeDialog(kind, opts);
  if (electron && electron.dialog) return unwrap(await electron.dialog(kind, opts), 'dialog error');
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
  if (tauriHost) { tauri.windowControl(action); return; }
  if (electron && electron.windowControl) electron.windowControl(action);
  else if (action === 'close') window.close();
  else if (action === 'fullscreen') {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }
}

export function onMaximized(cb) {
  if (tauriHost) return tauri.onMaximized(cb);
  if (!electron || !electron.onMaximized) return () => {};
  if (electron.isMaximized) electron.isMaximized().then(cb).catch(() => {});
  return electron.onMaximized(cb);
}

export async function getWindowSize() {
  if (tauriHost) return tauri.getWindowSize();
  if (electron && electron.getWindowSize) return electron.getWindowSize();
  return [window.outerWidth, window.outerHeight];
}

export function setWindowSize(w, h) {
  if (tauriHost) { tauri.setWindowSize(w, h); return; }
  if (electron && electron.setWindowSize) electron.setWindowSize(w, h);
}

// Keeps the window at least as wide as its toolbars: every bar that must stay
// on one line (.toolbar.menubar, .icon-toolbar) is measured — the natural
// width of its children, the spacer at its minimum — and the widest is sent
// to the shell as the window's minimum width. Called after every render of
// those bars; the calls collapse into one measurement per frame and only a
// larger value is sent. No-op in the browser.
let minWidthRaf = 0, lastMinWidth = 0;
export function syncWindowMinWidth() {
  const apply = tauriHost ? tauri.setMinContentWidth : (electron && electron.setMinContentWidth);
  if (!apply || minWidthRaf) return;
  minWidthRaf = requestAnimationFrame(() => {
    minWidthRaf = 0;
    let need = 0;
    for (const el of document.querySelectorAll('.toolbar.menubar, .icon-toolbar')) {
      const cs = getComputedStyle(el);
      let w = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      const gap = parseFloat(cs.columnGap) || 0;
      let n = 0;
      for (const c of el.children) {
        const ccs = getComputedStyle(c);
        if (ccs.display === 'none') continue;
        w += (c.classList.contains('tb-spacer') ? parseFloat(ccs.minWidth) || 0 : c.getBoundingClientRect().width)
          + (parseFloat(ccs.marginLeft) || 0) + (parseFloat(ccs.marginRight) || 0);
        n++;
      }
      w += gap * Math.max(0, n - 1);
      need = Math.max(need, w + 4);
    }
    const app = document.querySelector('.app');
    if (app) need += Math.max(0, document.documentElement.clientWidth - app.getBoundingClientRect().width);
    need = Math.ceil(need) + 1;
    if (need > lastMinWidth) { lastMinWidth = need; apply(need); }
  });
}

export function setWindowTitle(title) {
  document.title = title;
  if (tauriHost) tauri.setTitle(title);
  else if (electron && electron.setTitle) electron.setTitle(title);
}

export function startDesktop() { if (tauriHost) tauri.startTracking(); }

// Files handed over by the OS. The callback may be called before the UI has
// restored its session; the shell waits for `rendererReady()`.
export function onOpenFiles(cb) {
  if (tauriHost) return tauri.onOpenFiles(cb);
  if (!electron || !electron.onOpenFiles) return () => {};
  return electron.onOpenFiles(cb);
}
export function rendererReady() {
  if (tauriHost) tauri.rendererReady();
  else if (electron && electron.rendererReady) electron.rendererReady();
}
// Absolute path of a dropped File (Electron only; the Tauri shell reports the
// drop through onOsFileDrop, and the browser has no path).
export function pathForFile(file) { return electron && electron.pathForFile ? electron.pathForFile(file) : ''; }
export function onOsFileDrop(cb) { return tauriHost ? tauri.onOsFileDrop(cb) : () => {}; }

export function onCloseRequest(cb) {
  if (tauriHost) return tauri.onCloseRequest(cb);
  if (!electron || !electron.onCloseRequest) return () => {};
  return electron.onCloseRequest(cb);
}
export function replyClose(allow) {
  if (tauriHost) { tauri.replyClose(allow); return; }
  if (electron && electron.replyClose) electron.replyClose(allow);
}

export function onWindowFocus(cb) {
  const h = () => cb();
  window.addEventListener('focus', h);
  const off = tauriHost ? tauri.onFocus(cb) : (electron && electron.onFocus ? electron.onFocus(cb) : () => {});
  return () => { window.removeEventListener('focus', h); off(); };
}

// The menu bar's dropdowns as native OS menus (desktop only — they can reach beyond the window).
export const nativeMenus = tauriHost || !!(electron && electron.popupMenu && !electron.smoke);
export function popupNativeMenu(items, pos) {
  const plain = items.map((it) => (it.sep ? { sep: true } : it.header ? { header: it.header } : { id: it.id, label: it.label, checked: it.checked, radio: !!it.radio, disabled: !!it.disabled, shortcut: it.shortcut || '', meta: it.meta || '', png: it.png || '', scale: it.scale || 1 }));
  if (tauriHost) return tauri.popupMenu(plain, pos);
  return electron.popupMenu(plain, pos);
}
// Settings / info / shortcuts in a separate window (desktop only; false when
// there is none — the caller shows the dialog inside the page instead).
export function openPopup(kind, tab) {
  if (tauriHost) return tauri.openPopup(kind, tab);
  if (electron && electron.openPopup && !electron.smoke) { electron.openPopup(kind, tab || ''); return true; }
  return false;
}
export function warmPopups() { if (tauriHost) tauri.warmPopups(); }
export function openPrintWindow(job) {
  if (tauriHost) { tauri.openPrint(job); return true; }
  if (electron && electron.openPrint && !electron.smoke) { electron.openPrint(job); return true; }
  return false;
}
export function onPrintJob(cb) {
  if (tauriHost) return tauri.onPrintJob(cb);
  return electron && electron.onPrintJob ? electron.onPrintJob(cb) : () => {};
}
export function takePrintJob() {
  if (tauriHost) return tauri.takePrintJob();
  return electron && electron.takePrintJob ? electron.takePrintJob() : Promise.resolve(null);
}
export function listPrinters() {
  if (tauriHost) return tauri.listPrinters();
  return electron && electron.listPrinters ? electron.listPrinters() : Promise.resolve([]);
}
// Sends the HTML to a printer: desktop prints silently with the chosen
// destination; the browser opens a window and uses its own print preview.
export function printHtml(html, title, labels, opts) {
  if (electron && electron.smoke) { window.__lastPrint = { html, title, labels, opts }; return Promise.resolve({ success: true }); }
  if (tauriHost) return tauri.printHtml(html, title, labels, opts);
  if (electron && electron.printHtml) return Promise.resolve(electron.printHtml(html, title, labels, opts));
  const w = window.open('', '_blank');
  if (!w) return Promise.resolve({ success: false, failureReason: 'popup-blocked' });
  w.document.open(); w.document.write(html); w.document.close();
  w.document.title = title || '';
  const go = () => { try { w.print(); } catch { /* popup print blocked */ } };
  w.addEventListener('load', go);
  if (w.document.readyState === 'complete') go();
  return Promise.resolve({ success: true });
}
export function sendSettingsPatch(patch) {
  if (tauriHost) { tauri.sendSettingsPatch(patch); return; }
  if (electron && electron.sendSettingsPatch) electron.sendSettingsPatch(patch);
}
export function onSettingsPatch(cb) {
  if (tauriHost) return tauri.onSettingsPatch(cb);
  return electron && electron.onSettingsPatch ? electron.onSettingsPatch(cb) : () => {};
}

export function openExternal(url) {
  if (tauriHost) { tauri.openExternal(url); return; }
  window.open(url, '_blank', 'noopener');
}

export function quitApp() {
  if (tauriHost) { tauri.quit(); return; }
  if (electron) electron.quit();
  else window.close();
}
