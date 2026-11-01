import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clampPopupPos } from '../lib/popup-pos.js';
import { api } from '../lib/platform.js';
import { canPopOut, openPopout, fitPopout, toScreen } from '../lib/popout.js';

// On the desktop the menu is drawn in a window of its own, so it can reach
// past the program's edge like a system menu. The window is built once, a
// moment after start-up, and reused: building one per right-click is slow.
let menuHost = null;
function ensureMenuHost() {
  if (menuHost && !menuHost.win.closed) return menuHost;
  menuHost = openPopout('menu', { width: 240, height: 320, rootClass: 'popout-menu' });
  return menuHost;
}

// Reusable context menu. `items` is a list of:
//   { icon: Component, label, onClick, disabled, danger }  or  { separator: true }
export default function ContextMenu({ open, x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });
  const [host, setHost] = useState(null);

  useEffect(() => {
    if (!canPopOut()) return undefined;
    const t = setTimeout(ensureMenuHost, 1500);
    return () => clearTimeout(t);
  }, []);

  // Which window this opening draws in: the menu window when there is one.
  useLayoutEffect(() => {
    if (!open) { setHost(null); return; }
    setHost(canPopOut() ? ensureMenuHost() : null);
  }, [open]);

  // In-page: measure after layout and pin the menu inside the window. A later
  // effect must not write the raw click point back — that is what put the menu
  // under the window edge.
  useLayoutEffect(() => {
    if (!open || host) return;
    const el = ref.current;
    setPos(clampPopupPos({
      x,
      y,
      width: el?.offsetWidth || 224,
      height: el?.offsetHeight || 0,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
    }));
  }, [open, x, y, items, host]);

  // Menu window: size it to the menu and put it at the click point on the
  // screen; the host keeps it on the monitor (above the point near the bottom).
  useLayoutEffect(() => {
    if (!open || !host || !ref.current) return;
    const at = toScreen(x, y);
    fitPopout(host, ref.current, { x: at.x, y: at.y, flipY: at.y, modal: false, activate: false }).catch(() => {});
  }, [open, x, y, items, host]);

  useEffect(() => {
    if (!open || !host) return undefined;
    return () => { api.win.popoutHide(host.label).catch(() => {}); };
  }, [open, host]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    // Capture: a bubble listener misses clicks that stopPropagation, and a
    // window mousedown that closed the menu before click fired is why Copy
    // (and other items) did nothing. The menu window never takes focus, so a
    // click on it does not blur this window.
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const menu = (
    <div
      ref={ref}
      className="ctxmenu"
      style={host ? undefined : { left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        // Keep the page text selection; a default mousedown here collapses it
        // and Copy then reads an empty range.
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if (it.separator) return <div key={`s${i}`} className="ctxmenu-sep" />;
        const Ico = it.icon;
        return (
          <button
            key={i}
            type="button"
            className={`ctxmenu-item${it.danger ? ' danger' : ''}`}
            disabled={it.disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              it.onClick?.();
              onClose();
            }}
          >
            <span className="ci-icon">{Ico ? <Ico size={16} /> : null}</span>
            <span className="ci-label">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
  return host ? createPortal(menu, host.root) : menu;
}
