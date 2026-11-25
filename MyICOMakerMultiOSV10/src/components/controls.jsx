// Shared controls. Every button has a colour icon, and icon and label sit at the left.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { glyph } from '../icons/glyphs.js';
import { t } from '../i18n.js';

export function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: glyph(name) }} />
  );
}

/** A button: icon then label, left-aligned. `compact` hides the label (the tooltip keeps it). */
export function Btn({ icon, label, title, onClick, active = false, disabled = false, danger = false, primary = false, className = '', size = 18, children, ...rest }) {
  return (
    <button type="button" className={`btn ${active ? 'active' : ''} ${danger ? 'danger' : ''} ${primary ? 'primary' : ''} ${className}`}
      title={title ?? label} aria-label={title ?? label} aria-pressed={active || undefined} onClick={onClick} disabled={disabled} {...rest}>
      {icon && <Icon name={icon} size={size} />}
      {label && <span className="btn-label">{label}</span>}
      {children}
    </button>
  );
}

/** −  [slider]  +  value — small square −/+ buttons as tall as the bar, the value right of +. */
export function Slider({ icon, label, value, min, max, step = 1, unit = '', onChange, disabled = false, testId }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  return (
    <div className={`ctrl slider-row ${disabled ? 'disabled' : ''}`} data-testid={testId}>
      <span className="ctrl-label">{icon && <Icon name={icon} size={16} />}<span>{label}</span></span>
      <div className="slider-line">
        <button type="button" className="step-btn" onClick={() => set(value - step)} disabled={disabled || value <= min} title="−" aria-label={`${label} −`}><Icon name="minus" size={13} /></button>
        <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-label={label}
          onChange={(e) => set(Number(e.target.value))} />
        <button type="button" className="step-btn" onClick={() => set(value + step)} disabled={disabled || value >= max} title="+" aria-label={`${label} +`}><Icon name="plus" size={13} /></button>
        <output className="slider-value">{value}{unit}</output>
      </div>
    </div>
  );
}

/** − value+unit + : a number field with buttons on both sides and the value centred. */
export function Stepper({ value, min = -9999, max = 9999, step = 1, unit = '', onChange, disabled = false, label, width }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const set = (v) => { if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))); };
  return (
    <div className={`stepper ${disabled ? 'disabled' : ''}`} style={width ? { width } : undefined}>
      <button type="button" className="step-btn" disabled={disabled || value <= min} onClick={() => set(value - step)} aria-label={`${label ?? ''} −`}><Icon name="minus" size={13} /></button>
      <span className="stepper-field">
        <input value={text} disabled={disabled} aria-label={label} inputMode="decimal"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => { const v = Number(text); if (Number.isFinite(v)) set(v); else setText(String(value)); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        {unit && <em>{unit}</em>}
      </span>
      <button type="button" className="step-btn" disabled={disabled || value >= max} onClick={() => set(value + step)} aria-label={`${label ?? ''} +`}><Icon name="plus" size={13} /></button>
    </div>
  );
}

export const SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#facc15', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#78350f', '#ffffff', '#cbd5e1',
  '#94a3b8', '#64748b', '#334155', '#0f172a', '#000000',
  '#FFB3B3', '#FFE0B3', '#FFF3B3', '#DBFFB3', '#B3FFC9', '#B3FFF3', '#B3E0FF', '#B3B8FF', '#DBB3FF', '#FFB3DB',
];

/** A colour: the system picker, the hex value and the swatches. */
export function ColorField({ value, onChange, disabled = false, label, swatches = true }) {
  const safe = /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#000000';
  return (
    <div className={`color-field ${disabled ? 'disabled' : ''}`}>
      <div className="color-line">
        <input type="color" value={safe} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value)} />
        <input className="hex" value={safe} disabled={disabled} aria-label={`${label} hex`} maxLength={7}
          onChange={(e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value); }} />
      </div>
      {swatches && !disabled && (
        <div className="swatches">
          {SWATCHES.map((c) => (
            <button key={c} type="button" className={`swatch ${safe.toLowerCase() === c.toLowerCase() ? 'active' : ''}`} style={{ background: c }} title={c} aria-label={c} onClick={() => onChange(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A check box drawn as a toggle button with an icon. */
export function Toggle({ icon, label, checked, onChange, disabled = false, title }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`toggle ${checked ? 'on' : ''}`} disabled={disabled} title={title ?? label} onClick={() => onChange(!checked)}>
      <span className="toggle-box" aria-hidden="true">{checked ? '✓' : ''}</span>
      {icon && <Icon name={icon} size={16} />}
      <span className="btn-label">{label}</span>
    </button>
  );
}

/** A drop-down with icons on the button and on every option (native <select> cannot show icons). */
export function IconSelect({ value, options, onChange, label, className = '', compact = false, testId }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);
  const ref = useRef(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const height = Math.min(360, options.length * 32 + 8);
    const below = r.bottom + height + 4 < window.innerHeight;
    setPlace({ left: Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 6), top: below ? r.bottom + 3 : Math.max(4, r.top - height - 3), width: Math.max(r.width, 180) });
  }, [open, options.length]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!e.target.closest?.('.iconselect-list') && !ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', () => setOpen(false), { once: true });
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <>
      <button type="button" ref={ref} className={`btn iconselect ${compact ? 'compact' : ''} ${className}`} title={label} aria-label={label} aria-haspopup="listbox" aria-expanded={open} data-testid={testId}
        onClick={() => setOpen((v) => !v)}>
        <Icon name={current?.icon} />
        <span className="btn-label">{current?.label}</span>
        <Icon name="chevronDown" size={12} className="chev" />
      </button>
      {open && place && createPortal(
        <div className="iconselect-list" role="listbox" aria-label={label} style={{ left: place.left, top: place.top, minWidth: place.width }}>
          {options.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value} className={`menu-item ${o.value === value ? 'active' : ''}`}
              onClick={() => { setOpen(false); onChange(o.value); }}>
              <Icon name={o.icon} size={17} /><span>{o.label}</span>
            </button>
          ))}
        </div>, document.body)}
    </>
  );
}

/** A segmented choice: equal buttons with icons, one pressed. */
export function Segmented({ value, options, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={`btn ${o.value === value ? 'active' : ''}`} title={o.label} onClick={() => onChange(o.value)}>
          <Icon name={o.icon} size={16} /><span className="btn-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** A right-click menu at x, y. items: { icon, label, shortcut, onClick, danger, disabled } | { separator }. */
export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.min(x, window.innerWidth - r.width - 6), top: Math.min(y, window.innerHeight - r.height - 6) });
  }, [x, y]);
  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', key); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="context-menu" role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) => (item.separator
        ? <div key={`s${i}`} className="menu-sep" role="separator" />
        : (
          <button key={item.label} type="button" role="menuitem" className={`menu-item ${item.danger ? 'danger' : ''}`} disabled={item.disabled}
            onClick={() => { onClose(); item.onClick(); }}>
            <Icon name={item.icon} size={17} /><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        )))}
    </div>, document.body);
}

/** A card of the side panels: title with icon, body. */
export function Card({ icon, title, children, extra, className = '', testId }) {
  return (
    <section className={`card ${className}`} data-testid={testId}>
      <h3 className="card-title"><Icon name={icon} size={17} /><span>{title}</span><span className="grow" />{extra}</h3>
      <div className="card-body">{children}</div>
    </section>
  );
}

/** A modal dialog inside the window. */
export function Modal({ icon, title, children, actions, onClose, className = '' }) {
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head"><Icon name={icon} size={20} /><span>{title}</span><span className="grow" /><Btn icon="close" title={t('common.close')} onClick={onClose} className="icon-only" /></header>
        <div className="modal-body">{children}</div>
        {actions && <footer className="modal-actions">{actions}</footer>}
      </div>
    </div>, document.body);
}
