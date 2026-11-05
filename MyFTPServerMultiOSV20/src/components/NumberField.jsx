// Numeric input with a − button on the left and a + button on the right
// (the native up/down spinner is hidden in styles.css). Typing still works;
// the value is clamped to [min, max] when a button is used or the field
// loses focus. `blank` shows an empty field for 0 (PASV range "any").
// `unit` ('초', 'px'…) is shown right after the number, the pair centred
// between the buttons.
import React, { useEffect, useState } from 'react';
import { Icon } from './Icons';

export function NumberField({ value, onChange, min = 0, max = 65535, step = 1, disabled, width, blank = false, className = '', title, mono = true, unit = '', label }) {
  const show = (n) => (blank && !n ? '' : String(n));
  const [text, setText] = useState(show(value));
  useEffect(() => { setText(show(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const clamp = (n) => Math.max(min, Math.min(max, n));
  const commit = (n) => { const v = clamp(Number.isFinite(n) ? Math.round(n) : (blank ? 0 : min)); setText(show(v)); if (v !== value) onChange(v); };
  const bump = (d) => { if (disabled) return; commit((Number(text) || 0) + d * step); };
  const onKey = (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); bump(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(text === '' ? (blank ? 0 : min) : Number(text)); }
  };
  const input = (
    <input type="text" inputMode="numeric" pattern="[0-9]*" className={mono ? 'mono' : ''} value={text} disabled={disabled} aria-label={label}
      style={unit ? { width: `${Math.max(1, text.length) + 0.6}ch` } : undefined}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => commit(text === '' ? (blank ? 0 : min) : Number(text))}
      onKeyDown={onKey} onWheel={(e) => e.currentTarget.blur()} />
  );
  return (
    <span className={`numfield ${unit ? 'with-unit' : ''} ${disabled ? 'disabled' : ''} ${className}`} style={width ? { width } : undefined} title={title}>
      <button type="button" className="num-btn" tabIndex={-1} disabled={disabled || (Number(text) || 0) <= min} onClick={() => bump(-1)} aria-label="−"><Icon name="minus" size={11} /></button>
      {unit ? <span className="num-mid">{input}<span className="num-unit">{unit}</span></span> : input}
      <button type="button" className="num-btn" tabIndex={-1} disabled={disabled || (Number(text) || 0) >= max} onClick={() => bump(1)} aria-label="+"><Icon name="plus" size={11} /></button>
    </span>
  );
}

export default NumberField;
