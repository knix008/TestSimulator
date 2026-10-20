// Transport switch between the hosts.
//
//   tauri    — the Tauri shell (src/lib/tauri-host.js). Core calls go to the
//              Node service it starts; window, dialogs and menus are Tauri.
//   web      — fetch('/api/<method>'); dialogs are drawn by the UI
import * as tauri from './tauri-host.js';

const tauriHost = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

export const isTauri = tauriHost;
// The UI treats the desktop shell as the native app (window buttons, grip, dialogs).
export const isDesktop = tauriHost;
export const hostName = tauriHost ? 'tauri' : 'web';
export const platform = tauriHost
  ? ((typeof window !== 'undefined' && window.__MTM_HOST__ && window.__MTM_HOST__.platform) || (/mac/i.test(navigator.userAgent) ? 'darwin' : /win/i.test(navigator.userAgent) ? 'win32' : 'linux'))
  : (typeof navigator !== 'undefined' && (navigator.platform || '').toLowerCase().startsWith('win')) ? 'win32' : (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '')) ? 'darwin' : 'linux';
export const isMac = platform === 'darwin';

function webToken() {
  try {
    const t = new URLSearchParams(window.location.search).get('token');
    if (t) sessionStorage.setItem('mtm-token', t);
    return sessionStorage.getItem('mtm-token') || '';
  } catch { return ''; }
}

// { ok:false, error } → an Error carrying code / path / syscall and the stack
// of the process that failed (desktop service or web server).
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
  if (tauriHost) return tauri.apiCall(name, args);
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
//   kind: 'open' (opts.filters, opts.multi) → paths[] | 'save' (opts.name, opts.filters) → path | 'openFolder' → path
let fallback = null;
export function setDialogFallback(fn) { fallback = fn; }

export async function nativeDialog(kind, opts = {}) {
  if (tauriHost) return tauri.nativeDialog(kind, opts);
  if (!fallback) throw new Error('No file dialog available');
  return fallback(kind, opts);
}

// ── Clipboard ─────────────────────────────────────────────

export async function writeClipboardText(text) {
  try { await navigator.clipboard.writeText(text); return; } catch { /* fall through */ }
  if (tauriHost) await call('clipboard.write', { text });
}

export async function readClipboardText() {
  try { return await navigator.clipboard.readText(); } catch { /* denied */ }
  if (tauriHost) return call('clipboard.read');
  return '';
}

// A PNG data URL on the clipboard: the browser API where it is allowed, the desktop service otherwise.
export async function writeClipboardImage(dataUrl) {
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      return true;
    }
  } catch { /* not allowed here */ }
  if (tauriHost) return call('clipboard.writeImage', { dataUrl });
  return false;
}

// ── Window (desktop only; the browser has its own chrome) ──

export function windowControl(action) {
  if (tauriHost) { tauri.windowControl(action); return; }
  if (action === 'close') window.close();
  else if (action === 'fullscreen') {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }
}

export function onMaximized(cb) {
  if (tauriHost) return tauri.onMaximized(cb);
  return () => {};
}

export async function getWindowSize() {
  if (tauriHost) return tauri.getWindowSize();
  return [window.outerWidth, window.outerHeight];
}

export function setWindowSize(w, h) {
  if (tauriHost) tauri.setWindowSize(w, h);
}

// Keeps the window at least as wide as its toolbars: every bar that must stay
// on one line (.toolbar.menubar, .icon-toolbar) is measured — the natural
// width of its children, the spacer at its minimum — and the widest is sent
// to the shell as the window's minimum width. Called after every render of
// those bars; the calls collapse into one measurement per frame and only a
// larger value is sent. No-op in the browser.
let minWidthRaf = 0, lastMinWidth = 0;
export function syncWindowMinWidth() {
  if (!tauriHost || minWidthRaf) return;
  minWidthRaf = requestAnimationFrame(() => {
    minWidthRaf = 0;
    let need = 0;
    // the icon toolbar wraps its groups onto a second row, so only the menu bar sets the minimum
    for (const el of document.querySelectorAll('.toolbar.menubar')) {
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
    if (need > lastMinWidth) { lastMinWidth = need; tauri.setMinContentWidth(need); }
  });
}

export function setWindowTitle(title) {
  document.title = title;
  if (tauriHost) tauri.setTitle(title);
}

export function startDesktop() { if (tauriHost) tauri.startTracking(); }

// Files handed over by the OS. The callback may be called before the UI has
// restored its session; the shell waits for `rendererReady()`.
export function onOpenFiles(cb) {
  if (tauriHost) return tauri.onOpenFiles(cb);
  return () => {};
}
export function rendererReady() { if (tauriHost) tauri.rendererReady(); }
export function onOsFileDrop(cb) { return tauriHost ? tauri.onOsFileDrop(cb) : () => {}; }

export function onCloseRequest(cb) {
  if (tauriHost) return tauri.onCloseRequest(cb);
  return () => {};
}
export function replyClose(allow) {
  if (tauriHost) tauri.replyClose(allow);
}

export function onWindowFocus(cb) {
  const h = () => cb();
  window.addEventListener('focus', h);
  const off = tauriHost ? tauri.onFocus(cb) : () => {};
  return () => { window.removeEventListener('focus', h); off(); };
}
export function onWindowBlur(cb) {
  const h = () => cb();
  window.addEventListener('blur', h);
  return () => window.removeEventListener('blur', h);
}

// The menu bar's dropdowns as native OS menus (desktop only — they can reach beyond the window).
export const nativeMenus = tauriHost && !(typeof window !== 'undefined' && window.__MTM_SMOKE__);
export function popupNativeMenu(items, pos) {
  const plain = items.map((it) => (it.sep ? { sep: true } : it.header ? { header: it.header } : { id: it.id, label: it.label, checked: it.checked, radio: !!it.radio, disabled: !!it.disabled, shortcut: it.shortcut || '', meta: it.meta || '', png: it.png || '', scale: it.scale || 1 }));
  return tauri.popupMenu(plain, pos);
}
// Settings / info / shortcuts / help / print in a separate window (desktop only;
// false when there is none — the caller shows the dialog inside the page instead).
export function openPopup(kind, tab) {
  if (tauriHost) return tauri.openPopup(kind, tab);
  return false;
}
/** The Help window. The web version opens it as a browser popup of the same page. */
export function openHelp(chapter = '') {
  if (openPopup('help', chapter)) return;
  const url = new URL(window.location.href);
  url.search = chapter ? `?popup=help&tab=${encodeURIComponent(chapter)}` : '?popup=help';
  window.open(url.toString(), 'mybrainmap-help', 'popup,width=1180,height=820');
}
export function warmPopups() { if (tauriHost) tauri.warmPopups(); }
export function openPrintWindow(job) {
  if (tauriHost) { tauri.openPrint(job); return true; }
  return false;
}
export function onPrintJob(cb) {
  if (tauriHost) return tauri.onPrintJob(cb);
  return () => {};
}
export function takePrintJob() {
  if (tauriHost) return tauri.takePrintJob();
  return Promise.resolve(null);
}
export function listPrinters() {
  if (tauriHost) return tauri.listPrinters();
  return Promise.resolve([]);
}
// Sends the HTML to a printer: desktop prints silently with the chosen
// destination; the browser opens a window and uses its own print dialog.
export function printHtml(html, title, opts) {
  if (typeof window !== 'undefined' && window.__MTM_SMOKE__) { window.__lastPrint = { html, title, opts }; return Promise.resolve({ success: true }); }
  if (tauriHost) return tauri.printHtml(html, opts);
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
  if (tauriHost) tauri.sendSettingsPatch(patch);
}
export function onSettingsPatch(cb) {
  if (tauriHost) return tauri.onSettingsPatch(cb);
  return () => {};
}

// A web page, or a file / folder (desktop: the OS default app; web: the server opens it on its machine).
export function openExternal(url) {
  if (tauriHost) { tauri.openExternal(url); return; }
  window.open(url, '_blank', 'noopener');
}

export function quitApp() {
  if (tauriHost) { tauri.quit(); return; }
  window.close();
}

export function onHelpOpen(cb) { return tauriHost ? tauri.onHelpOpen(cb) : () => {}; }
