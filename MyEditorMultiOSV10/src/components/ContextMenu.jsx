// Positioned popup menu used for the menu-bar dropdowns, the tab / tree /
// editor context menus and the status-bar pickers. Closes on outside click,
// Escape, or when an item is picked. Items: { id, label, icon, checked,
// radio, disabled, shortcut, meta, swatch } | { sep: true } | { header: '…' }.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

export function ContextMenu({ x, y, items, onPick, onClose, anchorEl, above = false, className = '' }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let left = x, top = y;
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      left = r.left; top = above ? r.top - el.offsetHeight - 2 : r.bottom + 2;
    }
    const w = el.offsetWidth, h = el.offsetHeight;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    setPos({ left, top });
  }, [x, y, anchorEl, above]);

  useEffect(() => {
    const down = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (anchorEl && anchorEl.contains(e.target)) return;
      onClose();
    };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, anchorEl]);

  return (
    <div className={`ctx-menu ${className}`} ref={ref} style={pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => it.sep
        ? <div className="ctx-sep" key={`sep${i}`} />
        : it.header ? <div className="ctx-header" key={`h${i}`}>{it.header}</div>
        : (
          <button key={it.id} className={`ctx-item ${it.checked ? 'checked' : ''}`} role="menuitem" disabled={it.disabled}
            onClick={() => { if (!it.disabled) onPick(it.id); }}>
            <span className="ctx-icon">{it.checked ? <Icon name={it.radio ? 'circle' : 'check'} size={it.radio ? 10 : 14} /> : it.icon ? <Icon name={it.icon} size={14} /> : null}</span>
            {it.swatch && <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${it.swatchBg} 50%, ${it.swatch} 50%)` }} />}
            <span className="ctx-label">{it.label}</span>
            {it.meta && <span className="ctx-meta">{it.meta}</span>}
            {it.shortcut && <span className="ctx-shortcut">{it.shortcut}</span>}
          </button>
        ))}
    </div>
  );
}

export default ContextMenu;
