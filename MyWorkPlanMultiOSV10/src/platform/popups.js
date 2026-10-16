// Popup windows (settings, about, confirmation, error, progress, recent files,
// print preview, menus, task / resource / project information …).
//
// Desktop: each popup is its own OS window (label "popup-<kind>") owned by the
// main window — it can sit outside the main window, is moved on its own, and
// closes with the main window (lib.rs). Web: the same popup page runs in a
// floating frame inside the page. While the tutorial runs, the desktop app also
// uses frames so that a screen recording of the main window shows the popups.
//
// Opening parameters go through localStorage (`myworkplan.popup.<kind>`), which
// every window of the app shares. Popups answer with messages:
//   { kind, type: 'result' | 'action' | 'ready' | 'place' | 'close' | 'hide' | 'drag', data }
import { emitTo, invoke, isDesktop, listen } from './native.js';

/** Logical size of each popup. Fixed: each fits its content without scrolling. */
export const POPUPS = {
  settings: { width: 920, height: 640 },
  about: { width: 740, height: 600 },
  confirm: { width: 540, height: 270 },
  error: { width: 720, height: 500 },
  progress: { width: 480, height: 210 },
  recent: { width: 800, height: 600 },
  print: { width: 1180, height: 760 },
  menu: { width: 300, height: 200 },
  theme: { width: 620, height: 680 },
  task: { width: 820, height: 600 },
  resource: { width: 760, height: 560 },
  project: { width: 780, height: 690 },
  calendar: { width: 900, height: 640 },
  link: { width: 560, height: 330 },
  baseline: { width: 600, height: 470 },
  update: { width: 820, height: 470 },
  leveling: { width: 780, height: 480 },
  recurring: { width: 700, height: 560 },
  find: { width: 620, height: 400 },
  columns: { width: 760, height: 600 },
  assign: { width: 720, height: 560 },
  welcome: { width: 640, height: 470 },
  image: { width: 680, height: 430 },
  database: { width: 800, height: 600 },
};

export const popupKey = (kind) => `myworkplan.popup.${kind}`;

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
    this.open = this.open.bind(this);
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
      if (event.origin === location.origin && event.data?.myworkplan) this.receive(event.data, true);
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
  open(kind, params = {}, { anchor = null } = {}) {
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
      invoke('open_popup', { kind, x: Math.round(x), y: Math.round(y), width: size.width, height: size.height, show: true })
        .catch((error) => { this.settle(kind, null); this.actions.get('error')?.(error); });
    } else {
      this.openFrame(kind, anchor);
    }
    return result;
  }

  /** Creates a hidden popup ahead of time so it opens instantly later (menus). */
  prewarm(kind) {
    // Never touches the popup's parameters: a menu opened meanwhile keeps its items.
    if (this.useFrames || this.pending.has(kind)) return Promise.resolve();
    const size = POPUPS[kind];
    return invoke('open_popup', { kind, x: -32000, y: -32000, width: size.width, height: size.height, show: false }).catch(() => {});
  }

  /** Sends a message to an open popup. */
  post(kind, message) {
    const frame = this.frames.get(kind);
    if (frame) {
      frame.querySelector('iframe')?.contentWindow?.postMessage({ myworkplanHost: true, ...message }, location.origin);
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
