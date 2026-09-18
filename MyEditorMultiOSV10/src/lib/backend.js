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

// Keeps the window at least as wide as its toolbars: every bar that must stay
// on one line (.toolbar.menubar, .icon-toolbar) is measured — the natural
// width of its children, the spacer at its minimum — and the widest is sent
// to the main process, which raises the window's minimum width to it. Called
// after every render of those bars; the calls collapse into one measurement
// per frame and only a larger value is sent. The bars themselves keep one
// width whatever they show (labels as wide as their widest text, see
// components/Widest.jsx; fixed-width formatter label), so in practice the
// value is set once. No-op in the browser.
let minWidthRaf = 0, lastMinWidth = 0;
export function syncWindowMinWidth() {
  if (!isElectron || !electron.setMinContentWidth || minWidthRaf) return;
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
        // the box (a bounding rect has no margins: the separators and the app controls carry some)
        w += (c.classList.contains('tb-spacer') ? parseFloat(ccs.minWidth) || 0 : c.getBoundingClientRect().width)
          + (parseFloat(ccs.marginLeft) || 0) + (parseFloat(ccs.marginRight) || 0);
        n++;
      }
      w += gap * Math.max(0, n - 1);
      need = Math.max(need, w + 4);   // a little slack: sub-pixel widths round
    }
    // The bars sit inside the app column: add whatever surrounds them (none today, but measured rather than assumed).
    const app = document.querySelector('.app');
    if (app) need += Math.max(0, document.documentElement.clientWidth - app.getBoundingClientRect().width);
    need = Math.ceil(need) + 1;
    // Only ever up: whatever the bars show later, the window is never resized by them.
    if (need > lastMinWidth) { lastMinWidth = need; electron.setMinContentWidth(need); }
  });
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

// The menu bar's dropdowns as native OS menus (desktop only — they can reach beyond the window).
// Not under the smoke test: a native menu would block the page script that drives the menus.
export const nativeMenus = !!(isElectron && electron.popupMenu && !electron.smoke);
// `items` may carry `png` (base64 PNG) + `scale` for an icon (lib/menuicons.js draws them).
export function popupNativeMenu(items, pos) {
  const plain = items.map((it) => (it.sep ? { sep: true } : it.header ? { header: it.header } : { id: it.id, label: it.label, checked: it.checked, radio: !!it.radio, disabled: !!it.disabled, shortcut: it.shortcut || '', meta: it.meta || '', png: it.png || '', scale: it.scale || 1 }));
  return electron.popupMenu(plain, pos);
}
// Settings / info / shortcuts in a separate window (desktop only; false when
// there is none — the caller shows the dialog inside the page instead).
// `tab`: which tab the settings window opens on (a new window reads it from its URL, an open one is told through a settings patch).
export function openPopup(kind, tab) {
  if (isElectron && electron.openPopup && !electron.smoke) { electron.openPopup(kind, tab || ''); return true; }
  return false;
}
// Desktop print preview is a separate window (like settings). The smoke test
// and the web app keep the dialog inside the page.
export function openPrintWindow(job) {
  if (isElectron && electron.openPrint && !electron.smoke) { electron.openPrint(job); return true; }
  return false;
}
export function onPrintJob(cb) { return isElectron && electron.onPrintJob ? electron.onPrintJob(cb) : () => {}; }
export function takePrintJob() { return isElectron && electron.takePrintJob ? electron.takePrintJob() : Promise.resolve(null); }
export function listPrinters() { return isElectron && electron.listPrinters ? electron.listPrinters() : Promise.resolve([]); }
// Sends the HTML to a printer: desktop prints silently with the chosen
// destination; the browser opens a window and uses its own print preview.
export function printHtml(html, title, labels, opts) {
  if (isElectron && electron.smoke) { window.__lastPrint = { html, title, labels, opts }; return Promise.resolve({ success: true }); }
  if (isElectron && electron.printHtml) return Promise.resolve(electron.printHtml(html, title, labels, opts));
  const w = window.open('', '_blank');
  if (!w) return Promise.resolve({ success: false, failureReason: 'popup-blocked' });
  w.document.open(); w.document.write(html); w.document.close();
  w.document.title = title || '';
  const go = () => { try { w.print(); } catch { /* popup print blocked */ } };
  w.addEventListener('load', go);
  if (w.document.readyState === 'complete') go();
  return Promise.resolve({ success: true });
}
export function sendSettingsPatch(patch) { if (isElectron && electron.sendSettingsPatch) electron.sendSettingsPatch(patch); }
export function onSettingsPatch(cb) { return isElectron && electron.onSettingsPatch ? electron.onSettingsPatch(cb) : () => {}; }

export function quitApp() {
  if (isElectron) electron.quit();
  else window.close();
}
