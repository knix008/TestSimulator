// The resize marker at the bottom-right corner of a window (the main window's
// status bar, every resizable tool window): dragging it resizes the window
// through the host — the native frame still works as well. Renders nothing
// where the host cannot resize windows (the browser).
import React from 'react';
import { canResizeWindow, windowSize, resizeWindow } from '../lib/backend';

export function ResizeGrip() {
  if (!canResizeWindow) return null;
  const onDown = async (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = await windowSize();
    const x0 = e.screenX, y0 = e.screenY;
    let raf = 0, last = null;
    const move = (ev) => { last = ev; if (!raf) raf = requestAnimationFrame(() => { raf = 0; resizeWindow(start.width + (last.screenX - x0), start.height + (last.screenY - y0)); }); };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <svg className="resize-grip" viewBox="0 0 16 16" onMouseDown={onDown} aria-hidden="true">
      <path d="M15 1L1 15M15 6L6 15M15 11l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default ResizeGrip;
