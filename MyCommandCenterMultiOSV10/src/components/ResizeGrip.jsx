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
    // A frame under the pointer (the guide) would take the moves; let them pass while dragging.
    document.body.classList.add('window-resizing');
    let raf = 0, last = null;
    const move = (ev) => { last = ev; if (!raf) raf = requestAnimationFrame(() => { raf = 0; resizeWindow(start.width + (last.screenX - x0), start.height + (last.screenY - y0)); }); };
    const up = () => { document.body.classList.remove('window-resizing'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <svg className="resize-grip" viewBox="0 0 16 16" onMouseDown={onDown} aria-hidden="true">
      {/* Six dots in a triangle, the same marker as the start page cards' corners. */}
      {[[13, 13], [9, 13], [13, 9], [5, 13], [9, 9], [13, 5]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.4" fill="currentColor" />)}
    </svg>
  );
}

export default ResizeGrip;
