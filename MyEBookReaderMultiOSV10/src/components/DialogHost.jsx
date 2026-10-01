import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DialogBody, DialogFrame, FIXED_SIZE_DIALOGS, keepsWindowOpen } from './dialogs.jsx';
import { applyTheme, applyFontSettings } from '../lib/settings.js';

const electron = () => (typeof window !== 'undefined' ? window.electronAPI : undefined);

/**
 * A dialog running in its own OS window.
 *
 * Which dialog this is comes from the main process, not from the URL: popup
 * windows are pooled, and a dismissed one is hidden and handed to whichever
 * dialog opens next. Results travel back over IPC; the window sizes itself to
 * its content, so a popup never needs a scrollbar of its own.
 */
export default function DialogHost() {
  const [message, setMessage] = useState(null);
  const shellRef = useRef(null);
  const name = message?.name || '';
  const payload = message?.payload || null;

  useEffect(() => {
    let cancelled = false;
    electron()?.dialog?.payload?.().then((value) => {
      if (!cancelled && value) setMessage(value);
    }).catch(() => {});
    const off = electron()?.dialog?.onPayload?.((next) => { if (!cancelled) setMessage(next); });
    document.documentElement.classList.add('popup-window', 'dialog-window-root');
    document.body.classList.add('popup-window');
    return () => { cancelled = true; off?.(); };
  }, []);

  useEffect(() => {
    if (payload?.theme) applyTheme(payload.theme);
    if (payload?.settings) applyFontSettings(payload.settings);
  }, [payload?.theme, payload?.settings]);

  const close = () => electron()?.dialog?.close?.();

  // The window follows its content: the title bar plus whatever the body needs,
  // so a popup never has empty space under its buttons nor a scrollbar of its
  // own. A fixed-size dialog (Settings, Print) never reports.
  useLayoutEffect(() => {
    const node = shellRef.current?.firstElementChild;
    if (!node || !name || FIXED_SIZE_DIALOGS.has(name)) return undefined;
    const report = () => {
      const content = node.querySelector('.dialog-content');
      let height = Math.ceil(node.scrollHeight);
      if (content) {
        const top = content.getBoundingClientRect().top - node.getBoundingClientRect().top;
        // Measured at its own height, not the one the window is giving it.
        // The content is stretched to fill the shell, so its scrollHeight is
        // whatever the window already is: the report could say 'taller' but
        // never 'shorter', and a dialog that opened too tall stayed too tall
        // with the empty space sitting under its buttons.
        const was = content.style.height;
        content.style.height = 'max-content';
        height = Math.ceil(top + content.scrollHeight);
        content.style.height = was;
      }
      electron()?.dialog?.reportSize?.({ width: 0, height });
    };
    report();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(report) : null;
    observer?.observe(node);
    const settle = setTimeout(report, 150);
    const settleLate = setTimeout(report, 450);
    return () => {
      observer?.disconnect();
      clearTimeout(settle);
      clearTimeout(settleLate);
    };
  }, [name, payload]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!name || !payload) return <div className="dialog-window" ref={shellRef} />;

  const send = (result) => {
    electron()?.dialog?.send?.(name, result);
    if (result?.action === 'close' || !keepsWindowOpen(result?.action)) close();
  };

  // Keyed on the opening: a pooled window keeps its React tree between uses, and
  // without this a form would come back holding what was typed last time. The
  // progress dialog is the exception — it is re-sent while open.
  const key = name === 'progress' || name === 'print' ? name : message?.openId || 0;

  return (
    <div className="dialog-window" ref={shellRef}>
      <DialogFrame key={key} name={name} payload={payload} onClose={close}>
        <DialogBody name={name} payload={payload} onResult={send} />
      </DialogFrame>
    </div>
  );
}
