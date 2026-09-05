import React, { useEffect, useRef, useState } from 'react';
import { IconClock } from './Icons';

// Current wall-clock time rounded to the nearest `step` minutes → "HH:MM".
export function nowRounded(step = 15) {
  const d = new Date();
  let m = Math.round(d.getMinutes() / step) * step;
  let h = d.getHours();
  if (m >= 60) { m = 0; h = (h + 1) % 24; }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// A time combobox: free-text entry PLUS a scrollable dropdown of options.
// On open it scrolls to the current value (or the current time) so every option
// is reachable and the list is centered on "now".
export default function TimeCombo({ id, value, placeholder, invalid, options, onChange }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Scroll the current value (or, if none, the current time) into the middle of
  // the list each time the dropdown opens.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const target = value && options.includes(value) ? value : nowRounded();
      const el = listRef.current?.querySelector(`[data-t="${target}"]`);
      el?.scrollIntoView({ block: 'center' });
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = nowRounded();

  return (
    <div className="time-combo" ref={boxRef}>
      <input
        id={id}
        type="text"
        className={invalid ? 'invalid' : ''}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        aria-invalid={invalid}
      />
      <button type="button" className="time-btn" tabIndex={-1}
        title={placeholder} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}>
        <IconClock size={16} />
      </button>
      {open && (
        <div className="time-list" ref={listRef} role="listbox">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              data-t={o}
              className={`time-opt${o === value ? ' on' : ''}${o === now ? ' now' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(o); setOpen(false); }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
