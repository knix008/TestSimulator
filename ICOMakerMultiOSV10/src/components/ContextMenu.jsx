import React, { useEffect, useRef, useState } from 'react';

// items: Array<{ icon?: ReactNode, label: string, onClick?: fn, danger?: bool, disabled?: bool, separator?: bool }>
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });

  // Keep the menu inside the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x, ny = y;
    if (x + r.width > window.innerWidth) nx = window.innerWidth - r.width - 8;
    if (y + r.height > window.innerHeight) ny = window.innerHeight - r.height - 8;
    setPos({ x: Math.max(4, nx), y: Math.max(4, ny) });
  }, [x, y]);

  useEffect(() => {
    // Close on clicks OUTSIDE the menu only — otherwise this capture-phase
    // listener would unmount the menu before an item's click can fire.
    const onDown = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={`sep-${i}`} className="context-sep" />
        ) : (
          <button
            key={it.label}
            className={`context-item ${it.danger ? 'danger' : ''}`}
            disabled={it.disabled}
            onClick={() => { it.onClick?.(); onClose(); }}
          >
            <span className="context-icon">{it.icon}</span>
            <span className="context-label">{it.label}</span>
            {it.shortcut && <span className="context-shortcut">{it.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );
}
