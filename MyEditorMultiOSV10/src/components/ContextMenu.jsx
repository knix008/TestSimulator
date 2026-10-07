// Positioned popup menu used for the menu-bar dropdowns, the tab / tree /
// editor context menus and the status-bar pickers. Closes on outside click,
// Escape, or when an item is picked. Items: { id, label, icon, iconEl, checked,
// radio, disabled, shortcut, meta, swatch, remove, removeTip } | { sep: true } |
// { header: '…' } | { spacer: true } (an empty cell that pads a group to the end
// of its column in the `rows` layout below). `remove` is an action id behind a small × at the row's end
// (a recent file to forget): it goes to onAction when given — the menu stays
// open — otherwise to onPick.
//
// A menu taller than the room below its anchor (a long 언어 list in a small
// window) is not pushed up over the bar and cut off: its items flow into as
// many columns as needed to fit, so every item stays visible. The `rows` prop
// asks for that column layout outright, with a given number of rows (the theme
// list groups its 40 themes that way: one column of dark, one of light).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

export function ContextMenu({ x, y, items, onPick, onAction, onClose, anchorEl, above = false, className = '', rows: fixedRows = 0 }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [rows, setRows] = useState(0);   // > 0: the items are laid out in columns of this many rows
  const [dense, setDense] = useState(0);   // 1 / 2: tighter rows so a `rows` layout fits the window whole
  const [maxH, setMaxH] = useState(0);   // last resort for a window too short even for the tightest rows

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let left = x, top = y;
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      left = r.left; top = above ? r.top - el.offsetHeight - 2 : r.bottom + 2;
    }
    // Too tall for the room below the anchor: columns (measured in the single-column layout first).
    el.style.gridTemplateRows = '';
    el.style.maxHeight = '';
    el.style.overflowY = '';
    el.classList.remove('columns', 'dense1', 'dense2');
    let h = el.offsetHeight;
    const room = (above ? (anchorEl ? anchorEl.getBoundingClientRect().top - 2 : y) : window.innerHeight - top) - 8;
    let n = 0, d = 0, cap = 0;
    // `rows` asks for a layout of its own (the theme list: one column per mode). Its groups
    // are never re-flowed — whatever the window size the columns stay as asked, so the modes
    // read as two separate lists. To keep all of it on screen the menu may reach up over the
    // toolbar (the clamp below moves it), and its rows go tighter before anything is cut off.
    if (anchorEl && fixedRows > 0) {
      n = fixedRows;
      el.classList.add('columns');
      el.style.gridTemplateRows = `repeat(${n}, auto)`;
      h = el.offsetHeight;
      const fit = window.innerHeight - 16;
      for (const step of [1, 2]) { if (h <= fit) break; d = step; el.classList.add(`dense${step}`); h = el.offsetHeight; }
      if (h > fit) { cap = fit; el.style.maxHeight = `${cap}px`; el.style.overflowY = 'auto'; h = cap; }   // a window shorter than the tightest list
      if (above) top = anchorEl.getBoundingClientRect().top - h - 2;
    }
    if (anchorEl && !fixedRows && h > room && room > 60) {
      const count = el.children.length;
      const maxRows = Math.max(2, Math.floor((n || count) * room / h) - 1);
      n = n ? maxRows : Math.ceil(count / Math.ceil(count / maxRows));   // as many columns as needed, filled evenly
      el.classList.add('columns');
      el.style.gridTemplateRows = `repeat(${n}, auto)`;
      h = el.offsetHeight;
      if (above) top = anchorEl.getBoundingClientRect().top - h - 2;
    }
    const w = el.offsetWidth;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    setRows(n);
    setDense(d);
    setMaxH(cap);
    setPos({ left, top });
  }, [x, y, anchorEl, above, items.length, fixedRows]);

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
    <div className={`ctx-menu ${className} ${rows ? 'columns' : ''} ${dense ? `dense${dense}` : ''}`} ref={ref}
      style={rows ? { ...pos, gridTemplateRows: `repeat(${rows}, auto)`, ...(maxH ? { maxHeight: maxH, overflowY: 'auto' } : {}) } : pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => it.sep
        ? <div className="ctx-sep" key={`sep${i}`} />
        : it.spacer ? <div className="ctx-spacer" key={`sp${i}`} aria-hidden="true" />
        : it.header ? <div className="ctx-header" key={`h${i}`}>{it.header}</div>
        : (
          <button key={it.id} className={`ctx-item ${it.checked ? 'checked' : ''}`} role="menuitem" disabled={it.disabled}
            onClick={() => { if (!it.disabled) onPick(it.id); }}>
            <span className="ctx-icon">{it.iconEl ? it.iconEl : it.icon ? <Icon name={it.icon} size={14} /> : it.checked ? <Icon name={it.radio ? 'circle' : 'check'} size={it.radio ? 10 : 14} /> : null}</span>
            {it.swatch && <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${it.swatchBg} 50%, ${it.swatch} 50%)` }} />}
            <span className="ctx-label">{it.label}</span>
            {(it.iconEl || it.icon) && it.checked && <Icon name="check" size={14} className="ctx-check" />}
            {it.meta && <span className="ctx-meta">{it.meta}</span>}
            {it.shortcut && <span className="ctx-shortcut">{it.shortcut}</span>}
            {it.remove && <span className="ctx-remove" role="button" title={it.removeTip || ''} onClick={(e) => { e.stopPropagation(); (onAction || onPick)(it.remove); }}><Icon name="close" size={12} /></span>}
          </button>
        ))}
    </div>
  );
}

export default ContextMenu;
