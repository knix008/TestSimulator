// Dialogs as windows of their own (desktop). runInWindow(kind, params) opens a frameless window
// owned by this one (dialogwindow.js draws the dialog there) and resolves with its answer, which the
// window sends back with the "dialog-result" event before it closes. While it waits, this window is
// dimmed; a click on it brings the dialog forward. In the browser the dialogs stay in the page.
import * as native from '../platform/native.js';

export const useWindows = () => native.desktop;

const pending = new Map();
let listening = null;
let waiting = [];

async function currentWindow() {
  const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  return getCurrentWebviewWindow();
}

function ensureListener() {
  listening ??= currentWindow().then((win) => win.listen('dialog-result', (event) => {
    const { id, result } = event.payload ?? {};
    const done = pending.get(id);
    if (!done) return;
    pending.delete(id);
    done(result);
  }));
  return listening;
}

/** The dim layer over this window while a dialog window waits; a click on it focuses the dialog. */
function dim(label, on) {
  waiting = on ? [...waiting, label] : waiting.filter((l) => l !== label);
  let layer = document.querySelector('.window-wait');
  if (!waiting.length) { layer?.remove(); return; }
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'window-wait';
    layer.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      native.focusWindow(waiting[waiting.length - 1]);
    });
    document.body.appendChild(layer);
  }
}

/**
 * Opens dialog `kind` in its own window and waits for its answer.
 * size: { width, height } (the page fits the height to its content unless fixed), resizable.
 */
export async function runInWindow(kind, params, { title, width, height, resizable = false, fixed = false }) {
  await ensureListener();
  const win = await currentWindow();
  const id = Math.random().toString(36).slice(2, 10);
  const label = `dlg-${kind}-${id}`;
  const answer = new Promise((resolve) => pending.set(id, resolve));
  dim(label, true);
  try {
    await native.openDialogWindow({ label, owner: win.label, title, width, height, resizable, init: JSON.stringify({ id, kind, params, owner: win.label, title, width, height, fixed }) });
  } catch (error) {
    pending.delete(id);
    dim(label, false);
    throw error;
  }
  try {
    return await answer;
  } finally {
    dim(label, false);
  }
}
