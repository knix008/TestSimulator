// Font family combo box: a text input plus a scrollable dropdown (about ten
// rows high) listing every system font — the native <datalist> popup gets
// clipped by the window when the list is long. Typing filters the list,
// ↑ / ↓ move, Enter picks, Escape closes; each entry is drawn in its own
// font so it can be judged before choosing.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { fontList, loadSystemFonts } from '../lib/fonts';
import { Icon } from './Icons';

export function FontPicker({ value, onChange, placeholder, className = '', width }) {
  useLanguage();
  const [fonts, setFonts] = useState(fontList);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value || '');
  const [idx, setIdx] = useState(-1);
  const [pos, setPos] = useState(null);
  const boxRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { setText(value || ''); }, [value]);
  const load = () => loadSystemFonts().then(setFonts);

  const q = text.trim().toLowerCase();
  const shown = q && open && text !== value ? fonts.filter((f) => f.toLowerCase().includes(q)) : fonts;

  // Position the list under the box (fixed, so it is never clipped by a
  // scrolling parent); flip above when there is no room below.
  useLayoutEffect(() => {
    if (!open || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const h = Math.min(320, window.innerHeight - 24);
    const below = window.innerHeight - r.bottom - 8;
    setPos(below >= Math.min(h, 200) ? { left: r.left, top: r.bottom + 2, width: Math.max(r.width, 260), maxHeight: Math.min(h, below) } : { left: r.left, top: Math.max(8, r.top - h - 2), width: Math.max(r.width, 260), maxHeight: h });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (boxRef.current && !boxRef.current.contains(e.target) && !(listRef.current && listRef.current.contains(e.target))) setOpen(false); };
    document.addEventListener('mousedown', down, true);
    window.addEventListener('blur', () => setOpen(false));
    return () => document.removeEventListener('mousedown', down, true);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const cur = idx >= 0 ? idx : shown.indexOf(value);
    const el = listRef.current.children[cur];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [open, idx, shown, value]);

  const pick = (f) => { onChange(f); setText(f); setOpen(false); setIdx(-1); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) { setOpen(true); load(); } setIdx((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && idx >= 0 && shown[idx]) pick(shown[idx]); else { onChange(text.trim()); setOpen(false); } e.currentTarget.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setText(value || ''); e.currentTarget.blur(); }
  };

  return (
    <span className={`font-picker ${className}`} ref={boxRef} style={width ? { width } : undefined}>
      <input value={text} placeholder={placeholder || t('set_font_ph')} spellCheck={false} autoComplete="off"
        onFocus={() => { setOpen(true); load(); }} onMouseDown={() => { if (!open) { setOpen(true); load(); } }}
        onChange={(e) => { setText(e.target.value); setOpen(true); setIdx(-1); }} onKeyDown={onKey}
        onBlur={() => { if (!open) onChange(text.trim()); }} />
      <button className="fp-caret" tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); setOpen(!open); load(); }}><Icon name="chevronDown" size={13} /></button>
      {open && pos && (
        <div className="fp-list" ref={listRef} style={pos} role="listbox">
          {shown.length === 0 && <div className="fp-item muted">{t('fd_empty')}</div>}
          {shown.map((f, i) => (
            <div key={f} className={`fp-item ${i === idx ? 'hover' : ''} ${f === value ? 'current' : ''}`} style={{ fontFamily: `'${f.replace(/'/g, '')}', var(--mono)` }}
              onMouseEnter={() => setIdx(i)} onMouseDown={(e) => { e.preventDefault(); pick(f); }}>
              {f}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

export default FontPicker;
