import { isTauri, tauriApi } from './tauriBridge.js';

// Main-window side of the native popup menus. Each open popup gets a token;
// its choices and its closing come back as events carrying that token.

export const nativePopups = isTauri;

let seq = 0;
let listening = false;
const handlers = new Map();
let lastClosed = { key: null, at: 0 };

function listen() {
  if (listening) return;
  listening = true;
  tauriApi.popup.onResult(({ token, id }) => {
    const h = handlers.get(token);
    if (h && h.onChoose) h.onChoose(id);
  });
  tauriApi.popup.onClosed(({ token }) => {
    const h = handlers.get(token);
    if (!h) return;
    handlers.delete(token);
    lastClosed = { key: h.key, at: performance.now() };
    if (h.onClose) h.onClose();
  });
  // Focus loss normally closes the popup, but Windows may refuse to focus it
  // (focus-stealing rules), so a press in the main window closes it too.
  const dismiss = () => { if (handlers.size) tauriApi.popup.hide(); };
  document.addEventListener('mousedown', dismiss, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dismiss(); }, true);
}

/** Client rect of an element, in the main window's CSS pixels. */
export function anchorOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/**
 * Opens a popup window. `key` identifies the menu: clicking its button while
 * it is open first closes it (focus loss), and that click must not reopen it.
 * Returns a handle, or null when the click only dismissed the menu.
 */
export function showPopup(key, payload, { onChoose, onClose } = {}) {
  listen();
  if (lastClosed.key === key && performance.now() - lastClosed.at < 300) {
    lastClosed = { key: null, at: 0 };
    return null;
  }
  const token = `p${++seq}`;
  handlers.set(token, { key, onChoose, onClose });
  tauriApi.popup.show({ ...payload, token }).catch(() => { handlers.delete(token); if (onClose) onClose(); });
  return {
    token,
    update: (next) => tauriApi.popup.update({ ...next, token }),
    close: () => tauriApi.popup.hide(),
  };
}
