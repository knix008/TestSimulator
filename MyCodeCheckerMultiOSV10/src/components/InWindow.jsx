// A dialog in a window of its own on the desktop (src/lib/popups.js), so it
// can be moved and shown outside the main window; on the web build the
// children (the in-page dialog) render instead. The child window renders
// the dialog registered for `kind` in views/DialogWindows.jsx from `payload`.
//   onResult(value): the dialog's answer (the window then closes);
//   onEvent(value):  something the dialog reports while it stays open;
//   onClose():       the window closed without an answer (Esc, ×, Cancel);
//   live:            a value sent to the open window whenever it changes
//                    (the progress of a running job).
import { useEffect, useRef } from 'react';
import { usePopupWindows, openPopupWindow, broadcast } from '../lib/popups';
import { getLanguage } from '../lib/i18n';
import { getCustomThemesRaw } from '../themes';

/** What a child window needs to look like the main window. */
export const popupLook = () => ({ theme: document.documentElement.dataset.theme, language: getLanguage(), customThemes: getCustomThemesRaw() });

// The size the print window was left at (views/DialogWindows.jsx keeps it).
export const PRINT_SIZE_KEY = 'mcc.printWindow';

let channels = 0;

export function InWindow({ kind, payload, width = 560, height = 360, resizable = false, frame = false, live, onResult, onEvent, onClose, children }) {
  const windowed = usePopupWindows();
  const handlers = useRef({ onResult, onEvent, onClose });
  handlers.current = { onResult, onEvent, onClose };
  const channel = useRef(null);
  if (!channel.current) channel.current = `${kind}-${Date.now().toString(36)}-${++channels}`;
  useEffect(() => {
    if (!windowed) return undefined;
    let win = null;
    let unmounted = false;
    let answered = false;
    let closed = false;
    // A window asked to close before it exists closes once it has been created.
    const closeWin = (w) => {
      if (!w) return;
      w.close().catch(() => {});
      w.once('tauri://created', () => { w.close().catch(() => {}); }).catch(() => {});
    };
    // Opened a tick later: a mount that is undone at once (React's development
    // double effects) opens nothing.
    const timer = setTimeout(() => openPopupWindow({
      kind,
      payload: { ...popupLook(), ...(payload || {}), channel: channel.current, live },
      width,
      height,
      center: true,
      resizable,
      frame,
      onResult: (r) => {
        if (unmounted) return;
        if (r && Object.prototype.hasOwnProperty.call(r, 'event')) { if (handlers.current.onEvent) handlers.current.onEvent(r.event); return; }
        answered = true;
        if (handlers.current.onResult) handlers.current.onResult(r ? r.value : undefined);
      },
      onClose: () => {
        if (closed) return;
        closed = true;
        if (!unmounted && !answered && handlers.current.onClose) handlers.current.onClose();
      },
    }).then((w) => {
      win = w;
      if (unmounted) closeWin(w);
    }).catch(() => { if (!unmounted && handlers.current.onClose) handlers.current.onClose(); }), 0);
    return () => {
      unmounted = true;
      clearTimeout(timer);
      if (win && !closed) closeWin(win);
    };
    // The window opens once per mount; a new dialog is a new mount (key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowed]);
  const liveText = live === undefined ? '' : JSON.stringify(live);
  useEffect(() => {
    if (windowed && live !== undefined) broadcast('mcc-window-live', { channel: channel.current, value: live }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowed, liveText]);
  return windowed ? null : children;
}
