import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clampPopupPos } from '../lib/view.js';
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
    // A real click on the menu window gives it the focus (its webview takes
    // it although the window is not focusable), so this window blurs before
    // the click arrives. Closing on that blur removed the item under the
    // pointer, and Highlight, Copy, Copy image, Add to library… did nothing.
    // A blur only closes the menu once the focus has left both windows, for
    // another program; a press on the page closes it through pointerdown.
    const menuWin = host?.win || null;
    const menuHasFocus = () => {
      try { return !!menuWin && !menuWin.closed && menuWin.document.hasFocus(); } catch { return false; }
    };
    let blurTimer = 0;
    const onBlur = () => {
      if (!menuWin) { onClose(); return; }
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => { if (!menuHasFocus() && !document.hasFocus()) onClose(); }, 150);
    };
    const onMenuFocus = () => clearTimeout(blurTimer);
    // Capture: a bubble listener misses clicks that stopPropagation, and a
    // window mousedown that closed the menu before click fired is why Copy
    // (and other items) did nothing.
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKey);
    // The menu window holding the focus closes like the page would: on
    // Escape, and when the focus leaves it for another program.
    menuWin?.addEventListener('focus', onMenuFocus);
    menuWin?.addEventListener('blur', onBlur);
    menuWin?.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(blurTimer);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKey);
      menuWin?.removeEventListener('focus', onMenuFocus);
      menuWin?.removeEventListener('blur', onBlur);
      menuWin?.removeEventListener('keydown', onKey);
    };
  }, [open, host, onClose]);

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
