// Desktop (Tauri) popups as separate OS child windows, so menus, dropdowns
// and dialogs can extend past the main window's edges. On the web build
// every caller keeps its in-page version (isDesktop is false).
//
// Fast path: two hidden "pool" windows made once after start-up are reused
// ('list' for menus / dropdown lists / the theme picker, 'dialog' for
// settings and about / help). Opening sends the model as an event, sets size
// and position and shows the window; closing hides it. Slow path (pool not
// ready yet): a new window at `index.html#/window/<kind>?id=<id>` that asks
// for its payload when it is ready. Results come back as Tauri events.
import { isDesktop } from './backend';

export const POPUP_HASH = '#/window/';

/** In a child window: { kind, id, slot }; in the main window: null. */
export function popupRoute() {
  if (typeof window === 'undefined') return null;
  const h = window.location.hash || '';
  if (!h.startsWith(POPUP_HASH)) return null;
  const [kind, query] = h.slice(POPUP_HASH.length).split('?');
  const q = new URLSearchParams(query || '');
  return { kind, id: q.get('id') || '', slot: q.get('slot') || '' };
}

export const usePopupWindows = () => isDesktop && !popupRoute();

const SLOT_OF = { menu: 'list', select: 'list', themes: 'list', settings: 'dialog', info: 'dialog', about: 'dialog' };
const pool = new Map(); // slot -> { win, ready, current: { id, cleanup } | null }
let tauriApi = null;
function tauri() {
  if (!tauriApi) {
    // api.webview: the main window's extra WebView2 arguments (a debug build's
    // CDP port); a child window with other ones fails to open.
    const hostInfo = import('@tauri-apps/api/core').then((m) => m.invoke('host_info')).catch(() => null);
    tauriApi = Promise.all([import('@tauri-apps/api/webviewWindow'), import('@tauri-apps/api/event'), import('@tauri-apps/api/window'), import('@tauri-apps/api/dpi'), hostInfo])
      .then(([ww, ev, win, dpi, h]) => ({ WebviewWindow: ww.WebviewWindow, emit: ev.emit, listen: ev.listen, getCurrentWindow: win.getCurrentWindow, currentMonitor: win.currentMonitor, LogicalSize: dpi.LogicalSize, LogicalPosition: dpi.LogicalPosition, webview: h && h.browserArgs ? { additionalBrowserArgs: h.browserArgs } : {} }));
  }
  return tauriApi;
}

/**
 * A popup window as high as its content (CSS pixels, at most maxHeight), so it
 * hides nothing and leaves no empty band at the bottom. The width stays:
 * a pool window takes the width of the request (setPopupWidth), not
 * window.innerWidth — that can still be the previous popup's while the main
 * window resizes it, and this resize may land after that one.
 */
let popupWidth = 0;
export function setPopupWidth(width) { popupWidth = width || 0; }
export async function fitPopupHeight(height, maxHeight = 900, minHeight = 120) {
  if (!popupRoute()) return;
  try {
    const api = await tauri();
    const w = api.getCurrentWindow();
    await w.setSize(new api.LogicalSize(Math.round(popupWidth || window.innerWidth), Math.round(Math.min(maxHeight, Math.max(minHeight, height)))));
  } catch { /* the window keeps its size */ }
}

/** Creates the hidden pool windows (main window, once, when idle). */
export async function warmPopups() {
  if (!usePopupWindows()) return;
  const api = await tauri();
  for (const slot of ['list', 'dialog']) {
    if (pool.has(slot)) continue;
    const entry = { win: null, ready: false, current: null };
    pool.set(slot, entry);
    await api.listen(`pool-ready:${slot}`, () => { entry.ready = true; });
    const label = `pool-${slot}`;
    let win = null;
    try { win = await api.WebviewWindow.getByLabel(label); } catch { win = null; }
    if (win) {
      // Left over from a reload of the main window: ask it to report in.
      entry.win = win;
      await api.emit(`pool-ping:${slot}`);
      continue;
    }
    win = new api.WebviewWindow(label, {
      url: `index.html${POPUP_HASH}pool?slot=${slot}`,
      parent: 'main',
      decorations: false,
      resizable: false,
      width: 300,
      height: 200,
      visible: false,
      focus: false,
      skipTaskbar: true,
      shadow: true,
      title: 'MyCodeChecker',
      ...api.webview,
    });
    entry.win = win;
    win.once('tauri://error', () => pool.delete(slot));
    win.once('tauri://destroyed', () => pool.delete(slot));
  }
}

let seq = 0;
const open = new Map();

/** Close every popup of a kind (menus close each other). */
export async function closePopups(kind) {
  for (const [label, w] of open) {
    if (!kind || label.startsWith(`popup-${kind}-`)) { try { await w.close(); } catch { /* gone */ } open.delete(label); }
  }
  const list = pool.get('list');
  if (list && list.current && (!kind || SLOT_OF[kind] === 'list')) {
    const api = await tauri();
    await api.emit('pool-hide:list');
  }
}

async function geometry(api, { anchor, width, height, center }) {
  const main = api.getCurrentWindow();
  const [sf, inner, size, mon] = await Promise.all([main.scaleFactor(), main.innerPosition(), main.innerSize(), api.currentMonitor()]);
  const area = mon && mon.workArea
    ? { x: mon.workArea.position.x / sf, y: mon.workArea.position.y / sf, w: mon.workArea.size.width / sf, h: mon.workArea.size.height / sf }
    : { x: 0, y: 0, w: window.screen.availWidth, h: window.screen.availHeight };
  let x;
  let y;
  if (center || !anchor) {
    x = inner.x / sf + (size.width / sf - width) / 2;
    y = inner.y / sf + (size.height / sf - height) / 2;
  } else {
    x = inner.x / sf + anchor.left;
    y = inner.y / sf + anchor.bottom + 2;
    if (y + height > area.y + area.h) y = inner.y / sf + anchor.top - height - 2;
  }
  x = Math.max(area.x, Math.min(x, area.x + area.w - width));
  y = Math.max(area.y, Math.min(y, area.y + area.h - height));
  return { x: Math.round(x), y: Math.round(y) };
}

/** Open → first paint of the popup, in ms (window.__mccPopupTimes, newest last). */
function record(kind, ms, how) {
  const list = (window.__mccPopupTimes = window.__mccPopupTimes || []);
  list.push({ kind, ms: Math.round(ms), how });
  if (list.length > 50) list.shift();
  if (import.meta.env && import.meta.env.DEV) console.debug(`[popup] ${kind} (${how}) ${Math.round(ms)} ms`);
}

/**
 * Opens a popup. anchor: a DOMRect in the main window (CSS px) — the popup
 * goes below it (or above when there is no room) and is clamped to the
 * monitor's work area; center: centre it on the main window instead.
 * frame: an ordinary window with the system title bar and a taskbar button
 * (the print window: the system print preview covers the page, so the page's
 * own title bar could not move or resize it meanwhile).
 * owned: false makes a top-level window instead of a child of the main window
 * (the user's guide: it can go behind the main window, has its own taskbar
 * button; closePopups() closes it with the main window).
 */
export async function openPopupWindow({ kind, payload, anchor, width, height, center = false, resizable = false, frame = false, owned = true, onResult, onClose }) {
  const t0 = performance.now();
  const api = await tauri();
  const slot = SLOT_OF[kind];
  const entry = slot ? pool.get(slot) : null;
  seq += 1;
  const id = `${Date.now().toString(36)}${seq}`;
  if (entry && entry.ready && entry.win) {
    let cleaned = false;
    let unsub = [];
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      unsub.forEach((u) => u());
      if (entry.current && entry.current.id === id) entry.current = null;
      if (onClose) onClose();
    };
    const [pos, ...subs] = await Promise.all([
      geometry(api, { anchor, width, height, center }),
      api.listen(`popup-result:${id}`, (e) => { if (onResult) onResult(e.payload); }),
      api.listen(`popup-closed:${id}`, () => cleanup()),
      api.listen(`popup-shown:${id}`, () => record(kind, performance.now() - t0, 'pool')),
    ]);
    unsub = subs;
    if (entry.current && entry.current.cleanup) entry.current.cleanup();
    entry.current = { id, cleanup };
    const w = entry.win;
    // The content renders while the window is still hidden; then it is placed and shown.
    await api.emit(`pool-open:${slot}`, { id, kind, payload, width: Math.round(width) });
    await Promise.all([w.setSize(new api.LogicalSize(Math.round(width), Math.round(height))), w.setPosition(new api.LogicalPosition(pos.x, pos.y))]);
    await w.show();
    await w.setFocus();
    return w;
  }
  // No pool window yet: a new window (slow path).
  const pos = await geometry(api, { anchor, width, height, center });
  const label = `popup-${kind}-${id}`;
  const unlisten = [];
  unlisten.push(await api.listen(`popup-ready:${id}`, () => { api.emit(`popup-data:${id}`, payload); }));
  unlisten.push(await api.listen(`popup-result:${id}`, (e) => { if (onResult) onResult(e.payload); }));
  unlisten.push(await api.listen(`popup-shown:${id}`, () => record(kind, performance.now() - t0, 'new')));
  const w = new api.WebviewWindow(label, {
    url: `index.html${POPUP_HASH}${kind}?id=${id}`,
    ...(owned ? { parent: 'main' } : {}),
    decorations: frame,
    resizable,
    maximizable: resizable,
    width: Math.round(width),
    height: Math.round(height),
    minWidth: frame && resizable ? 480 : undefined,
    minHeight: frame && resizable ? 360 : undefined,
    x: pos.x,
    y: pos.y,
    skipTaskbar: !frame,
    focus: true,
    shadow: true,
    title: (payload && payload.windowTitle) || 'MyCodeChecker',
    ...api.webview,
  });
  open.set(label, w);
  const done = () => { unlisten.forEach((u) => u()); open.delete(label); if (onClose) onClose(); };
  w.once('tauri://destroyed', done);
  w.once('tauri://error', (e) => { done(); console.error('popup window', e); });
  return w;
}

// ── child side ─────────────────────────────────────────

// In a pool window "close" means hide; the pool page sets this.
let poolCloser = null;
export function setPoolCloser(fn) { poolCloser = fn; }

/** In the child: announce readiness and receive the payload once. */
export async function receivePayload(id, onData) {
  const { emit, listen } = await import('@tauri-apps/api/event');
  const un = await listen(`popup-data:${id}`, (e) => { onData(e.payload); un(); });
  await emit(`popup-ready:${id}`);
}

/** In the child, after the content's first paint (timing only). */
export async function announceShown(id) {
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(`popup-shown:${id}`);
  } catch { /* not in Tauri */ }
}

export async function sendResult(id, result, { close = true } = {}) {
  const { emit } = await import('@tauri-apps/api/event');
  await emit(`popup-result:${id}`, result);
  if (close) await closeSelf();
}

export async function closeSelf() {
  if (poolCloser) { poolCloser(); return; }
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  } catch { window.close(); }
}

/** Main ↔ child broadcast (settings preview / saved). */
export async function broadcast(event, payload) {
  if (!isDesktop) { window.dispatchEvent(new CustomEvent(event, { detail: payload })); return; }
  const { emit } = await import('@tauri-apps/api/event');
  await emit(event, payload);
}

export async function onBroadcast(event, fn) {
  if (!isDesktop) {
    const h = (e) => fn(e.detail);
    window.addEventListener(event, h);
    return () => window.removeEventListener(event, h);
  }
  const { listen } = await import('@tauri-apps/api/event');
  return listen(event, (e) => fn(e.payload));
}
