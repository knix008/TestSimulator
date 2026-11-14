// A list that paints with the current theme. The closed control looks like a
// select; the open list is the same menu as the rest of the app, so profiles,
// history, protocols and settings follow --bg, --fg and --bg-sel instead of
// the operating system's popup colours.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

const useClientLayout = typeof document === 'undefined' ? useEffect : useLayoutEffect;
import { createPortal } from 'react-dom';
import { Icon } from './Icons';

function rowsOf(options) {
  const rows = [];
  for (const item of options || []) {
    if (!item) continue;
    if (Array.isArray(item.options)) {
      rows.push({ kind: 'group', label: item.group || item.label || '' });
      for (const child of item.options) rows.push({ kind: 'item', value: child.value, label: child.label, disabled: !!child.disabled, style: child.style });
    } else {
      rows.push({ kind: 'item', value: item.value, label: item.label, disabled: !!item.disabled, style: item.style });
    }
  }
  return rows;
}

function same(a, b) {
  return String(a) === String(b);
}

export function DropDown({ value, onChange, options, disabled = false, title, ariaLabel, className = '', style }) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 160 });
  const rows = rowsOf(options);
  const current = rows.find((row) => row.kind === 'item' && same(row.value, value));
  const label = current ? current.label : (value == null || value === '' ? '' : String(value));

  useClientLayout(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menu = menuRef.current;
    const height = menu ? menu.offsetHeight : 0;
    let top = rect.bottom + 2;
    if (height && top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 2);
    let left = rect.left;
    const width = Math.max(rect.width, menu ? menu.offsetWidth : 0);
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    setPos({ left, top, width: rect.width });
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (buttonRef.current && buttonRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    const hide = () => setOpen(false);
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', hide);
    };
  }, [open]);

  const pick = (row) => {
    if (row.disabled) return;
    setOpen(false);
    if (onChange) onChange(row.value);
  };

  const menu = open && (
    <div className="ctx-menu drop-menu" ref={menuRef} role="listbox" style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
      onMouseDown={(e) => e.stopPropagation()}>
      {rows.map((row, i) => (row.kind === 'group'
        ? <div className="drop-group" key={`g${i}`}>{row.label}</div>
        : (
          <button key={`i${i}`} type="button" role="option" aria-selected={same(row.value, value)}
            className={`ctx-item drop-item${same(row.value, value) ? ' checked' : ''}`}
            disabled={row.disabled} style={row.style} onClick={() => pick(row)}>
            <span className="ctx-icon">{same(row.value, value) ? <Icon name="check" size={14} /> : null}</span>
            <span className="ctx-label">{row.label}</span>
          </button>
        )))}
    </div>
  );

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={`drop-btn ${className}`.trim()}
        style={style}
        title={title}
        aria-label={ariaLabel || title}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
      >
        <span className="drop-value">{label}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {menu && createPortal(menu, document.body)}
    </>
  );
}

export default DropDown;
