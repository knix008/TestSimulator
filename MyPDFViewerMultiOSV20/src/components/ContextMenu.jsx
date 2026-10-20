import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clampPopupPos } from '../lib/view.js';

// Reusable context menu. `items` is a list of:
//   { icon: Component, label, onClick, disabled, danger }  or  { separator: true }
export default function ContextMenu({ open, x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });

  // Measure after layout and pin the menu inside the window. A later effect
  // must not write the raw click point back — that is what put the menu
  // under the window edge.
  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    setPos(clampPopupPos({
      x,
      y,
      width: el?.offsetWidth || 224,
      height: el?.offsetHeight || 0,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
    }));
  }, [open, x, y, items]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    // Capture: a bubble listener misses clicks that stopPropagation, and a
    // window mousedown that closed the menu before click fired is why Copy
    // (and other items) did nothing.
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

  return (
    <div
      ref={ref}
      className="ctxmenu"
      style={{ left: pos.x, top: pos.y }}
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
}
