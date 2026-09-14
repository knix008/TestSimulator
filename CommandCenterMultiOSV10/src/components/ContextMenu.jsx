// Positioned popup menu used for the panel context menu and the menu-bar
// dropdowns. Closes on outside click, Escape, or when an item is picked.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

export function ContextMenu({ x, y, items, onPick, onClose, anchorEl }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let left = x, top = y;
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      left = r.left; top = r.bottom + 2;
    }
    const w = el.offsetWidth, h = el.offsetHeight;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    setPos({ left, top });
  }, [x, y, anchorEl]);

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
    <div className="ctx-menu" ref={ref} style={pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => it.sep
        ? <div className="ctx-sep" key={`sep${i}`} />
        : (
          <button key={it.id} className={`ctx-item ${it.checked ? 'checked' : ''}`} role="menuitem" disabled={it.disabled}
            onClick={() => { if (!it.disabled) onPick(it.id); }}>
            <span className="ctx-icon">{it.checked ? <Icon name="check" size={14} /> : it.icon ? <Icon name={it.icon} size={14} /> : null}</span>
            {it.swatch && <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${it.swatchBg} 50%, ${it.swatch} 50%)` }} />}
            <span className="ctx-label">{it.label}</span>
            {it.shortcut && <span className="ctx-shortcut">{it.shortcut}</span>}
          </button>
        ))}
    </div>
  );
}

export default ContextMenu;
