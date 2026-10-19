// A colour field: a swatch button that opens a palette (theme-independent
// colours, the map's branch colours, "automatic") plus a free colour input.
import React, { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { Icon } from './Icons';

export const PALETTE = [
  '#ffffff', '#f1f3f5', '#ced4da', '#868e96', '#495057', '#212529', '#000000',
  '#ffe3e3', '#ffc9c9', '#ff8787', '#fa5252', '#e03131', '#c92a2a',
  '#fff3bf', '#ffe066', '#fcc419', '#fab005', '#f59f00', '#e67700',
  '#d3f9d8', '#8ce99a', '#51cf66', '#37b24d', '#2b8a3e',
  '#d0ebff', '#74c0fc', '#339af0', '#1c7ed6', '#1864ab',
  '#e5dbff', '#b197fc', '#845ef7', '#7048e8', '#5f3dc4',
  '#ffdeeb', '#f783ac', '#e64980', '#c2255c',
  '#c3fae8', '#63e6be', '#20c997', '#087f5b',
];

export function ColorPicker({ value, onChange, allowNone = false, autoLabel, title }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('keydown', key, true); };
  }, [open]);
  const hex = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#888888';
  const pick = (v) => { onChange(v); setOpen(false); };
  return (
    <span className="color-picker" ref={ref}>
      <button type="button" className={`color-swatch ${!value ? 'auto' : value === 'none' ? 'none' : ''}`} title={title || value || autoLabel || t('color_auto')}
        style={value && value !== 'none' ? { background: value } : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)}>
        {!value && <Icon name="refresh" size={11} />}
      </button>
      {open && (
        <div className="color-pop" role="dialog">
          <div className="color-grid">
            {PALETTE.map((c) => <button key={c} type="button" className={`color-cell ${c === value ? 'on' : ''}`} style={{ background: c }} title={c} onClick={() => pick(c)} />)}
          </div>
          <div className="color-row">
            <button type="button" className="btn small" onClick={() => pick('')}><Icon name="refresh" size={12} /> {autoLabel || t('color_auto')}</button>
            {allowNone && <button type="button" className="btn small" onClick={() => pick('none')}><Icon name="delete" size={12} /> {t('color_none')}</button>}
            <span className="spacer" />
            <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} title={t('color_custom')} />
          </div>
        </div>
      )}
    </span>
  );
}

export default ColorPicker;
