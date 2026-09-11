// The diagonal grip in the bottom-right corner of a window.
//
// It is a real handle, not decoration: dragging it resizes the window it sits
// in. A popup dialog resizes itself through `window.resizeTo`; the main
// Electron window cannot do that from the renderer, so it goes through the
// host. In a browser tab neither is possible, and the grip makes itself
// invisible rather than sit there doing nothing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getHost } from '../platform';
import { useT } from '../i18n';

/** Never shrink a window past the point where its own chrome stops fitting. */
const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;

export function ResizeGrip() {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [usable, setUsable] = useState(true);

  useEffect(() => {
    const win = ref.current?.ownerDocument?.defaultView;
    if (!win) return;
    // A popup can resize itself. The main window needs the host, which only
    // Electron provides.
    const isPopup = Boolean(win.opener);
    setUsable(isPopup || getHost().kind === 'electron');
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const win = ref.current?.ownerDocument?.defaultView;
    if (!win) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const isPopup = Boolean(win.opener);
    const host = getHost();

    // Measured once, at the start. Resizing from per-event deltas feeds back on
    // itself — the window moves under the pointer, the next event reports a
    // delta that includes that movement, and the size runs away. Sizing from
    // where the drag began cannot drift: the pointer's position on screen does
    // not depend on the window.
    const startWidth = win.outerWidth;
    const startHeight = win.outerHeight;
    const startX = e.screenX;
    const startY = e.screenY;

    const onMove = (move: PointerEvent) => {
      const width = Math.max(MIN_WIDTH, Math.round(startWidth + (move.screenX - startX)));
      const height = Math.max(MIN_HEIGHT, Math.round(startHeight + (move.screenY - startY)));
      if (isPopup) win.resizeTo(width, height);
      else host.resizeWindowTo(width, height);
    };
    const onUp = (up: PointerEvent) => {
      ref.current?.releasePointerCapture?.(up.pointerId);
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerup', onUp);
      win.removeEventListener('pointercancel', onUp);
    };
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
    win.addEventListener('pointercancel', onUp);
  }, []);

  return (
    <div
      // Rendered even when it cannot resize anything, because the effect that
      // works that out needs an element in the document to look at. It simply
      // stays invisible and ignores the pointer in that case.
      className="resize-grip"
      ref={ref}
      role={usable ? 'separator' : undefined}
      aria-hidden={usable ? undefined : true}
      aria-label={usable ? t('TtResizeWindow') : undefined}
      title={usable ? t('TtResizeWindow') : undefined}
      style={usable ? undefined : { opacity: 0, pointerEvents: 'none', cursor: 'default' }}
      onPointerDown={usable ? onPointerDown : undefined}
    />
  );
}
