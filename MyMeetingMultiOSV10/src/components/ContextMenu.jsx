import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Reusable context menu. `items` is a list of:
//   { icon: Component, label, onClick, disabled, danger }  or  { separator: true }
export default function ContextMenu({ open, x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });

  // Position the menu inside the viewport. This runs in a layout effect (before
  // paint) and is the SINGLE source of truth for the position — measuring the
  // real size, then shifting the menu up/left so it never spills past (and gets
  // clipped by) the window edge. `items` is a dependency so a taller menu is
  // re-clamped. NOTE: there must be no separate effect resetting pos to the raw
  // cursor coordinates, or it would overwrite this clamp and re-clip the menu.
  useLayoutEffect(() => {
    if (!open) return;
    const r = ref.current ? ref.current.getBoundingClientRect() : { width: 0, height: 0 };
    const m = 6; // keep a small gap from the window edge
    const nx = Math.max(m, Math.min(x, window.innerWidth - r.width - m));
    const ny = Math.max(m, Math.min(y, window.innerHeight - r.height - m));
    setPos({ x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, x, y, items]);

  useEffect(() => {
    if (!open) return;
    const close = () => onClose();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="ctxmenu"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if (it.separator) return <div key={`s${i}`} className="ctxmenu-sep" />;
        const Ico = it.icon;
        return (
          <button
            key={i}
            className={`ctxmenu-item${it.danger ? ' danger' : ''}`}
            disabled={it.disabled}
            onClick={() => { onClose(); it.onClick?.(); }}
          >
            <span className="ci-icon">{Ico ? <Ico size={16} /> : null}</span>
            <span className="ci-label">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
