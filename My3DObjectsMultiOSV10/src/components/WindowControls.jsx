import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconMinimize, IconMaximize, IconRestore, IconClose } from './Icons.jsx';
import { api, isDesktop } from '../lib/platform.js';

const IS_WINDOWS = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

// The window has no title bar: the toolbar's empty stretch is where it is
// grabbed (and double-clicked to maximise). On Windows the page's
// `app-region: drag` does it natively (with Snap); elsewhere the host is asked.
export function DragArea() {
  const onMouseDown = (e) => {
    if (!isDesktop || IS_WINDOWS || e.button !== 0 || e.detail > 1) return;
    api.win.startDragging?.().catch(() => {});
  };
  return (
    <div
      className="toolbar-drag"
      onMouseDown={onMouseDown}
      onDoubleClick={() => { if (isDesktop) api.win.toggleMaximize().catch(() => {}); }}
      aria-hidden="true"
    />
  );
}

export function useMaximized() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!isDesktop) return undefined;
    api.win.isMaximized().then(setMaximized).catch(() => {});
    return api.win.onMaximizeChange(setMaximized);
  }, []);
  return maximized;
}

// Minimise, maximise / restore and close, at the toolbar's right end.
export default function WindowControls() {
  const { t } = useTranslation();
  const maximized = useMaximized();
  if (!isDesktop) return null;
  return (
    <div className="window-controls">
      <button className="winbtn" onClick={() => api.win.minimize()} title={t('tip.minimize')} aria-label={t('tip.minimize')}>
        <IconMinimize size={16} />
      </button>
      <button className="winbtn" onClick={() => api.win.toggleMaximize()} title={maximized ? t('tip.restore') : t('tip.maximize')} aria-label={t('tip.maximize')}>
        {maximized ? <IconRestore size={16} /> : <IconMaximize size={16} />}
      </button>
      <button className="winbtn winbtn-close" onClick={() => api.win.close()} title={t('tip.closeWin')} aria-label={t('tip.closeWin')}>
        <IconClose size={16} />
      </button>
    </div>
  );
}

// The corner grip in the status bar: a frameless window's only visible
// handle. It follows the pointer in screen coordinates and asks the host for
// the new size, once per frame (from V20).
export function ResizeGrip() {
  const { t } = useTranslation();
  const drag = useRef(null);
  const frame = useRef(0);
  const maximized = useMaximized();

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    d.width = d.w0 + (e.screenX - d.x0);
    d.height = d.h0 + (e.screenY - d.y0);
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (drag.current) api.win.setSize({ width: drag.current.width, height: drag.current.height }).catch(() => {});
    });
  }, []);

  const stop = useCallback((e) => {
    drag.current = null;
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const grip = e.currentTarget;
    const { screenX, screenY, pointerId } = e;
    grip.setPointerCapture?.(pointerId);
    api.win.getSize().then((size) => {
      if (!size) { grip.releasePointerCapture?.(pointerId); return; }
      drag.current = { x0: screenX, y0: screenY, w0: size.width, h0: size.height };
    }).catch(() => { grip.releasePointerCapture?.(pointerId); });
  }, []);

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  if (!isDesktop || maximized) return null;
  return (
    <span
      className="st-grip"
      role="separator"
      aria-label={t('status.resize')}
      title={t('status.resize')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
        <path d="M12 4 4 12M12 8 8 12M12 12l0 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );
}
