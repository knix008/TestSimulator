// Popup windows (settings, about, confirmation, error, progress, recent files,
// print preview, menus, part and array windows).
//
// Desktop: each popup is its own OS window (label "popup-<kind>") owned by the
// main window — it can sit outside the main window, is moved on its own, and
// closes with the main window (lib.rs). Web: the same popup page runs in a
// floating frame inside the page.
//
// Opening parameters go through localStorage (`mycad.popup.<kind>`), which
// every window of the app shares. Popups answer with messages:
//   { kind, type: 'result' | 'action' | 'ready' | 'place' | 'close' | 'hide' | 'drag', data }
import { emitTo, invoke, isDesktop, listen } from './native.js';

/** Logical size of each popup. Fixed: each fits its content without scrolling. */
export const POPUPS = {
  settings: { width: 880, height: 620 },
  about: { width: 720, height: 560 },
  confirm: { width: 520, height: 270 },
  error: { width: 680, height: 480 },
  progress: { width: 470, height: 200 },
  recent: { width: 780, height: 560 },
  print: { width: 1120, height: 740 },
  menu: { width: 300, height: 200 },
  theme: { width: 600, height: 640 },
  part: { width: 880, height: 600 },
  array: { width: 660, height: 500 },
  stl: { width: 820, height: 540 },
  solid: { width: 940, height: 640 },
  coverage: { width: 1180, height: 640 },
  tutorial: { width: 400, height: 380 },
  bim: { width: 780, height: 560 },
  check: { width: 860, height: 560 },
  cam: { width: 1000, height: 600 },
  fem: { width: 1180, height: 680 },
  plate: { width: 1180, height: 680 },
  spreadsheet: { width: 1000, height: 640 },
};

export const popupKey = (kind) => `mycad.popup.${kind}`;

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
    this.open = this.open.bind(this);
  }

  async init() {
    if (isDesktop()) {
      await listen('popup-message', (message) => this.receive(message));
      await listen('popup-hidden', (kind) => this.settle(kind, null));
    } else {
      window.addEventListener('message', (event) => {
        if (event.origin === location.origin && event.data?.mycad) this.receive(event.data);
      });
    }
  }

  /** Registers a handler for `action` messages (e.g. settings asking for a background image). */
  on(action, handler) {
    this.actions.set(action, handler);
  }

  settle(kind, value) {
    const resolve = this.pending.get(kind);
    if (resolve) {
      this.pending.delete(kind);
      resolve(value);
    }
  }

  receive({ kind, type, data }) {
    if (type === 'result') this.settle(kind, data ?? null);
    else if (type === 'action') {
      const handler = this.actions.get(data?.action);
      if (handler) Promise.resolve(handler(data, kind)).catch((error) => this.actions.get('error')?.(error));
    } else if (!isDesktop()) this.frameMessage(kind, type, data);
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
    const result = new Promise((resolve) => this.pending.set(kind, resolve));
    if (isDesktop()) {
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
    if (!isDesktop() || this.pending.has(kind)) return Promise.resolve();
    const size = POPUPS[kind];
    return invoke('open_popup', { kind, x: -32000, y: -32000, width: size.width, height: size.height, show: false }).catch(() => {});
  }

  /** Sends a message to an open popup. */
  post(kind, message) {
    if (isDesktop()) return emitTo(`popup-${kind}`, 'popup-message', message).catch(() => {});
    this.frames.get(kind)?.querySelector('iframe')?.contentWindow?.postMessage({ mycadHost: true, ...message }, location.origin);
    return Promise.resolve();
  }

  close(kind) {
    this.settle(kind, null);
    if (isDesktop()) return invoke('close_popup', { kind }).catch(() => {});
    this.removeFrame(kind);
    return Promise.resolve();
  }

  isOpen(kind) {
    return this.pending.has(kind) || this.frames.has(kind);
  }

  // ───────────────────────── web frames

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

  /** A transparent layer behind a web menu: clicking outside closes it. */
  addMenuShield(frame) {
    const shield = document.createElement('div');
    shield.className = 'web-popup-shield';
    shield.addEventListener('pointerdown', () => this.close('menu'));
    shield.addEventListener('contextmenu', (event) => { event.preventDefault(); this.close('menu'); });
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
    } else if (type === 'drag') {
      frame.style.left = `${parseFloat(frame.style.left) + data.dx}px`;
      frame.style.top = `${parseFloat(frame.style.top) + data.dy}px`;
    } else if (type === 'close' || type === 'hide') {
      this.settle(kind, null);
      this.removeFrame(kind);
    }
  }
}
