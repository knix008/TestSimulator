import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Reusable context menu. `items` is a list of:
//   { icon: Component, label, onClick, disabled, danger }  or  { separator: true }
export default function ContextMenu({ open, x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => { setPos({ x, y }); }, [x, y]);

  // Clamp inside the viewport once measured.
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    let nx = x, ny = y;
    if (x + r.width > window.innerWidth) nx = Math.max(4, window.innerWidth - r.width - 4);
    if (y + r.height > window.innerHeight) ny = Math.max(4, window.innerHeight - r.height - 4);
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, x, y]);

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
