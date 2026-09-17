const api = window.myTerminal;

const listeners = new Map();

function ensureBridge() {
  if (!api?.onPopupEvent || ensureBridge.done) return;
  ensureBridge.done = true;
  api.onPopupEvent((ev) => {
    const list = listeners.get(ev?.id);
    if (!list) return;
    list.forEach((fn) => {
      try {
        fn(ev);
      } catch (err) {
        console.error(err);
      }
    });
  });
}

export function canUsePopup() {
  return !!(api?.isElectron && api.openPopup && api.popupSend);
}

/**
 * Open a detached popup window and exchange init/events with it.
 * @returns {{ id: string, close: () => void, send: (message: object) => void }}
 */
export async function openPopupHost({ kind, title, width, height, minWidth, minHeight, backgroundColor }) {
  ensureBridge();
  const opened = await api.openPopup({
    kind,
    title,
    width,
    height,
    minWidth,
    minHeight,
    backgroundColor,
  });
  const id = opened.id;
  const handlers = new Set();
  listeners.set(id, handlers);

  const onEvent = (fn) => {
    handlers.add(fn);
    return () => handlers.delete(fn);
  };

  const send = (message) => api.popupSend(id, message);
  const close = () => api.closePopup(id);
  const focus = () => api.focusPopup?.(id);

  // Wait until popup signals ready, then resolve.
  await new Promise((resolve) => {
    const off = onEvent((ev) => {
      if (ev.type === 'ready') {
        off();
        resolve();
      }
      if (ev.type === 'closed') {
        off();
        resolve();
      }
    });
    // Safety timeout
    setTimeout(resolve, 3000);
  });

  onEvent((ev) => {
    if (ev.type === 'closed') {
      listeners.delete(id);
    }
  });

  const host = { id, kind, send, close, focus, onEvent, open: true };
  onEvent((ev) => {
    if (ev.type === 'closed') host.open = false;
  });
  return host;
}
