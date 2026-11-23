// Separate windows for settings, about, the save question, printing and the user guide.
//
// In the desktop app each one is its own OS window (frameless, fixed size, movable outside the
// main window, owned by it). The window loads this same page with ?popup=<kind> and shows only
// that window's content. The main window and the popups talk over a BroadcastChannel: settings
// are saved to localStorage and announced, so every window applies them; the print window gets
// the result to print; the save question sends back the choice. In the browser there are no
// OS windows, and the same content opens as a window inside the page instead.
import { isTauri } from './save.js';

export const POPUP = new URLSearchParams(globalThis.location?.search ?? '').get('popup') || '';

/** Logical sizes of the windows: fixed, and big enough for their content without scroll bars. */
export const POPUP_SIZES = {
  settings: [880, 620],
  about: [460, 450],
  save: [460, 190],
  print: [1180, 820],
  guide: [1040, 720],
};

export const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('image2text') : null;

export const usesPopupWindows = () => isTauri() && !POPUP;

/** Opens a dialog element: as the whole content of a popup window, or modally in the page. */
export function showDialog(dialog) {
  if (dialog.open) return;
  if (POPUP) dialog.show();
  else dialog.showModal();
}

const waiting = new Map();

/** Opens (or brings forward) the popup window of `kind` and hands it `payload`. */
export async function openPopup(kind, payload = {}) {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const label = `popup-${kind}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    channel?.postMessage({ type: 'open', kind, payload });
    await existing.show();
    await existing.setFocus();
    return;
  }
  waiting.set(kind, payload);
  const [width, height] = POPUP_SIZES[kind];
  const css = getComputedStyle(document.documentElement);
  const win = new WebviewWindow(label, {
    url: `index.html?popup=${kind}`,
    title: 'Image2Text',
    width,
    height,
    resizable: false,
    maximizable: false,
    minimizable: false,
    decorations: false,
    shadow: true,
    center: true,
    focus: true,
    parent: 'main',
    skipTaskbar: true,
    backgroundColor: css.getPropertyValue('--bg-raised').trim() || '#1a2029',
  });
  win.once('tauri://error', (event) => {
    waiting.delete(kind);
    console.error(`popup ${kind}:`, event.payload);
  });
}

/** In the main window: answers a popup that has loaded with the payload it was opened for. */
export function listenForReady() {
  channel?.addEventListener('message', (event) => {
    const message = event.data;
    if (message?.type !== 'ready' || !waiting.has(message.kind)) return;
    channel.postMessage({ type: 'open', kind: message.kind, payload: waiting.get(message.kind) });
    waiting.delete(message.kind);
  });
}

/** In a popup window: closes the window itself. */
export async function closeSelf() {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().close();
}

/** In a popup window: lets the window be dragged by its title bar (not by its buttons). */
export function makeTitleBarDraggable(root = document) {
  for (const head of root.querySelectorAll('.modal-head')) {
    head.setAttribute('data-tauri-drag-region', '');
    for (const child of head.children) {
      if (!child.matches('button, a, input, select, textarea')) child.setAttribute('data-tauri-drag-region', '');
    }
  }
}
