// Popup windows (settings, about, confirmation, error, progress, recent files,
// print preview, menus, find, validation results, code generation, text import …).
//
// Desktop: each popup is its own OS window (label "popup-<kind>") owned by the
// main window — it can sit outside the main window, is moved on its own, and
// closes with the main window (lib.rs). Web: the same popup page runs in a
// floating frame inside the page. While the tutorial runs, the desktop app also
// uses frames so that a screen recording of the main window shows the popups.
//
// Opening parameters go through localStorage (`mysketchbook.popup.<kind>`), which
// every window of the app shares. Popups answer with messages:
//   { kind, type: 'result' | 'action' | 'ready' | 'place' | 'close' | 'hide' | 'drag', data }
import { emitTo, invoke, isDesktop, listen } from './native.js';

/** Logical size of each popup, measured to fit its content (Korean and English, full lists) without scrolling
 * or empty space. Fixed; confirm, about, welcome and prompt then follow their content height (fitHeight). */
export const POPUPS = {
  settings: { width: 1100, height: 700 },
  about: { width: 740, height: 600 },
  confirm: { width: 540, height: 270 },
  error: { width: 720, height: 500 },
  progress: { width: 520, height: 220 },
  recent: { width: 800, height: 510 },
  menu: { width: 300, height: 200 },
  theme: { width: 620, height: 680 },
  welcome: { width: 640, height: 470 },
  color: { width: 300, height: 300 },
  prompt: { width: 520, height: 230 },
  importmodel: { width: 680, height: 420 },
  importplan: { width: 720, height: 640 },
  snapshot: { width: 720, height: 430 },
  render: { width: 720, height: 430 },
  renderresult: { width: 1000, height: 680 },
  material: { width: 520, height: 400 },
  print: { width: 1240, height: 780 },
};

export const popupKey = (kind) => `mysketchbook.popup.${kind}`;

export function popupParams(kind) {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(popupKey(kind)) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export class PopupHost {
  constructor() {
    this.actions = new Map();
    this.pending = new Map();
    this.frames = new Map();
    /** Frames instead of OS windows on the desktop (tutorial recording). */
    this.inline = false;
    this.opened = [];
    this.drawn = new Map();
    this.open = this.open.bind(this);
  }

  /**
   * Resolves once the popup `kind` has drawn itself (it sends 'drawn'; the progress window does), or after
   * `timeout` ms at the latest — a long computation starts after it, so the window is on screen with its text.
   */
  whenDrawn(kind, timeout = 1500) {
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); this.drawn.delete(kind); resolve(); };
      const timer = setTimeout(done, timeout);
      this.drawn.set(kind, done);
    });
  }

  get useFrames() {
    return !isDesktop() || this.inline;
  }

  async init() {
    if (isDesktop()) {
      await listen('popup-message', (message) => this.receive(message, false));
      await listen('popup-hidden', (kind) => { if (!this.reopenedSinceResult(kind)) this.settle(kind, null); });
    }
    window.addEventListener('message', (event) => {
      if (event.origin === location.origin && event.data?.mysketchbook) this.receive(event.data, true);
    });
  }

  /** Registers a handler for `action` messages (e.g. settings asking for a background image). */
  on(action, handler) {
    this.actions.set(action, handler);
  }

  /**
   * A popup hides itself right after sending its result. When the host has
   * opened the same popup again in between (a submenu reusing the menu), that
   * late "hidden" belongs to the old request and must not cancel the new one.
   */
  reopenedSinceResult(kind) {
    const answered = this.answeredAt?.[kind];
    if (answered == null) return false;
    this.answeredAt[kind] = null;
    return (this.openCount?.[kind] ?? 0) > answered;
  }

  settle(kind, value) {
    const resolve = this.pending.get(kind);
    if (resolve) {
      this.pending.delete(kind);
      resolve(value);
    }
  }

  receive({ kind, type, data }, fromFrame) {
    if (type === 'drawn') { this.drawn.get(kind)?.(); return; }
    if (type === 'result') {
      this.answeredAt = { ...this.answeredAt, [kind]: this.openCount?.[kind] ?? 0 };
      this.settle(kind, data ?? null);
    }
    else if (type === 'action') {
      const handler = this.actions.get(data?.action);
      if (handler) Promise.resolve(handler(data, kind)).catch((error) => this.actions.get('error')?.(error));
    } else if (fromFrame) this.frameMessage(kind, type, data);
  }

  /**
   * Opens a popup. `anchor` = { x, y, flipY } in screen CSS pixels (menus), or
   * nothing to centre it over the main window. Resolves with the popup's result
   * (null when it closes without one).
   */
  open(kind, params = {}, { anchor = null, delay = 0 } = {}) {
    const size = POPUPS[kind];
    try {
      globalThis.localStorage?.setItem(popupKey(kind), JSON.stringify({ ...params, anchor, at: Date.now() }));
    } catch { /* the popup falls back to its defaults */ }
    this.settle(kind, null);
    this.openCount = { ...this.openCount, [kind]: (this.openCount?.[kind] ?? 0) + 1 };
    this.opened.push({ kind, at: Date.now() });
    const result = new Promise((resolve) => this.pending.set(kind, resolve));
    if (!this.useFrames) {
      const x = anchor ? anchor.x : window.screenX + (window.outerWidth - size.width) / 2;
      const y = anchor ? anchor.y : window.screenY + Math.max(40, (window.outerHeight - size.height) / 2);
      // delay (progress): the window is shown by the backend after that long, unless hidden before.
      invoke('open_popup', { kind, x: Math.round(x), y: Math.round(y), width: size.width, height: size.height, show: true, delay: Math.max(0, Math.round(delay)) })
        .catch((error) => { this.settle(kind, null); this.actions.get('error')?.(error); });
    } else {
      this.openFrame(kind, anchor);
    }
    return result;
  }

  /** Creates a hidden popup ahead of time so it opens instantly later (menus). */
  prewarm(kind, { warm = false } = {}) {
    // Never touches the popup's parameters (a menu opened meanwhile keeps its items) — except `warm`: the
    // page then draws nothing and does not show itself (progress, which shows only when asked).
    if (this.useFrames || this.pending.has(kind)) return Promise.resolve();
    if (warm) {
      try { globalThis.localStorage?.setItem(popupKey(kind), JSON.stringify({ warm: true })); } catch { /* defaults */ }
    }
    const size = POPUPS[kind];
    return invoke('open_popup', { kind, x: -32000, y: -32000, width: size.width, height: size.height, show: false }).catch(() => {});
  }

  /** Sends a message to an open popup. */
  post(kind, message) {
    const frame = this.frames.get(kind);
    if (frame) {
      frame.querySelector('iframe')?.contentWindow?.postMessage({ mysketchbookHost: true, ...message }, location.origin);
      return Promise.resolve();
    }
    if (isDesktop()) return emitTo(`popup-${kind}`, 'popup-message', message).catch(() => {});
    return Promise.resolve();
  }

  close(kind) {
    this.settle(kind, null);
    if (this.frames.has(kind)) {
      this.removeFrame(kind);
      return Promise.resolve();
    }
    if (isDesktop()) return invoke('close_popup', { kind }).catch(() => {});
    return Promise.resolve();
  }

  closeAll() {
    return Promise.all(Object.keys(POPUPS).map((kind) => (kind === 'menu' ? this.hideMenu() : this.close(kind))));
  }

  /** Hides a popup but keeps its window for the next time (progress: opening it again is then instant). */
  hide(kind) {
    this.settle(kind, null);
    if (this.frames.has(kind)) { this.removeFrame(kind); return Promise.resolve(); }
    return isDesktop() ? invoke('hide_popup', { kind }).catch(() => {}) : Promise.resolve();
  }

  hideMenu() {
    this.settle('menu', null);
    if (this.frames.has('menu')) { this.removeFrame('menu'); return Promise.resolve(); }
    return isDesktop() ? invoke('hide_popup', { kind: 'menu' }).catch(() => {}) : Promise.resolve();
  }

  isOpen(kind) {
    return this.pending.has(kind) || this.frames.has(kind);
  }

  // ───────────────────────── frames (web, tutorial)

  openFrame(kind, anchor) {
    const size = POPUPS[kind];
    let frame = this.frames.get(kind);
    if (!frame) {
      frame = document.createElement('div');
      frame.className = `web-popup web-popup-${kind}`;
      frame.dataset.kind = kind;
      frame.innerHTML = `<iframe title="popup-${kind}" src="${location.pathname}?popup=${kind}"></iframe>`;
      frame.style.visibility = 'hidden';
      document.body.append(frame);
      this.frames.set(kind, frame);
      if (kind === 'menu') this.addMenuShield(frame);
    } else {
      this.post(kind, { type: 'refresh' });
    }
    frame.style.width = `${size.width}px`;
    frame.style.height = `${size.height}px`;
    const left = anchor ? anchor.x - window.screenX : (window.innerWidth - size.width) / 2;
    const top = anchor ? anchor.y - window.screenY : Math.max(20, (window.innerHeight - size.height) / 2);
    this.placeFrame(frame, left, top, size.width, size.height);
    if (kind !== 'menu') frame.style.visibility = '';
  }

  /** A transparent layer behind a menu frame: clicking outside closes it. */
  addMenuShield(frame) {
    const shield = document.createElement('div');
    shield.className = 'web-popup-shield';
    shield.addEventListener('pointerdown', () => this.hideMenu());
    shield.addEventListener('contextmenu', (event) => { event.preventDefault(); this.hideMenu(); });
    frame.before(shield);
    frame.shield = shield;
  }

  placeFrame(frame, left, top, width, height, flipTop = null) {
    let x = Math.min(left, window.innerWidth - width - 4);
    let y = top;
    if (y + height > window.innerHeight - 4) y = flipTop != null && flipTop - height >= 0 ? flipTop - height : window.innerHeight - height - 4;
    x = Math.max(4, x);
    y = Math.max(4, y);
    Object.assign(frame.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
  }

  removeFrame(kind) {
    const frame = this.frames.get(kind);
    if (!frame) return;
    frame.shield?.remove();
    frame.remove();
    this.frames.delete(kind);
  }

  frameMessage(kind, type, data = {}) {
    const frame = this.frames.get(kind);
    if (!frame) return;
    if (type === 'ready') frame.style.visibility = '';
    else if (type === 'place') {
      const left = data.x - window.screenX;
      const top = data.y - window.screenY;
      this.placeFrame(frame, left, top, data.width, data.height, data.flipY != null ? data.flipY - window.screenY : null);
      frame.style.visibility = '';
      frame.querySelector('iframe')?.focus();
    } else if (type === 'resize') {
      frame.style.height = `${data.height}px`;
    } else if (type === 'drag') {
      frame.style.left = `${parseFloat(frame.style.left) + data.dx}px`;
      frame.style.top = `${parseFloat(frame.style.top) + data.dy}px`;
    } else if (type === 'close' || type === 'hide') {
      if (type === 'hide' && this.reopenedSinceResult(kind)) return;
      this.settle(kind, null);
      this.removeFrame(kind);
    }
  }
}
