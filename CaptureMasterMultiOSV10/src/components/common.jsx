import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icons.jsx';

// ── Tooltips ──────────────────────────────────────────────
// Any element with a `data-tip` attribute gets a tooltip. One listener on the
// document is cheaper than a wrapper per button and works inside dialogs too.
export function TooltipLayer() {
  const [tip, setTip] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    const show = (el) => {
      const text = el.getAttribute('data-tip');
      if (!text) return;
      const r = el.getBoundingClientRect();
      setTip({ text, x: r.left + r.width / 2, y: r.bottom + 6, top: r.top });
    };
    const onOver = (e) => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      clearTimeout(timer.current);
      if (!el) { setTip(null); return; }
      timer.current = setTimeout(() => show(el), 450);
    };
    const hide = () => { clearTimeout(timer.current); setTip(null); };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mousedown', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!tip || !ref.current) { setPos(null); return; }
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    let x = tip.x - w / 2;
    let y = tip.y;
    x = Math.max(6, Math.min(window.innerWidth - w - 6, x));
    if (y + h > window.innerHeight - 6) y = tip.top - h - 6;
    setPos({ x, y });
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={ref} className="tooltip" style={{ left: pos ? pos.x : -9999, top: pos ? pos.y : -9999 }}>
      {tip.text}
    </div>
  );
}

// ── Context menu ──────────────────────────────────────────
/** items: [{ label, icon, shortcut, sub, disabled, danger, checked, onClick } | 'sep'] */
export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    setPos({ x: Math.max(4, Math.min(window.innerWidth - w - 4, x)), y: Math.max(4, Math.min(window.innerHeight - h - 4, y)) });
  }, [x, y, items]);

  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    // Esc closes only the menu, not the dialog window it sits in.
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); } };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="ctx-menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => {
        if (it === 'sep') return <div key={i} className="ctx-sep" />;
        if (!it) return null;
        return (
          <div
            key={i}
            className={`ctx-item${it.disabled ? ' disabled' : ''}${it.danger ? ' danger' : ''}${it.checked ? ' checked' : ''}`}
            role={it.checked ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={it.checked || undefined}
            onClick={() => { if (it.disabled) return; onClose(); it.onClick && it.onClick(); }}
          >
            {it.checked ? <Icon name="check" /> : it.icon ? <Icon name={it.icon} /> : <span style={{ width: 15 }} />}
            <span>{it.label}</span>
            {it.sub ? <span className="sub">{it.sub}</span> : null}
            {it.shortcut ? <span className="shortcut">{it.shortcut}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

// ── Toasts ────────────────────────────────────────────────
let toastSeq = 0;
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, kind = 'ok', ms = 2800) => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  return [toasts, push];
}

const TOAST_ICON = { err: 'error', warn: 'warning', ok: 'check' };

/** Success, warning and error notices share this corner of the window. */
export function ToastHost({ toasts }) {
  if (!toasts.length) return null;
  return createPortal(
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind || 'ok'}`}>
          <Icon name={TOAST_ICON[t.kind] || 'check'} size={15} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ── Dropdown anchored to a button ─────────────────────────
export function Dropdown({ anchor, onClose, children, width }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const w = ref.current.offsetWidth;
    setPos({ x: Math.max(4, Math.min(window.innerWidth - w - 4, r.left)), y: r.bottom + 4 });
  }, [anchor, children]);
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !(anchor && anchor.contains(e.target))) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
    };
  }, [anchor, onClose]);
  return (
    <div ref={ref} className="dropdown" style={{ left: pos ? pos.x : -9999, top: pos ? pos.y : -9999, width, maxHeight: pos ? window.innerHeight - pos.y - 8 : undefined, overflowY: 'auto' }}>
      {children}
    </div>
  );
}

// ── Number input with decrease / increase buttons ─────────
/**
 * A centred number field between "−" and "+" buttons. Holding a button
 * repeats; ↑/↓ step too. Typing is free-form: a value inside [min, max] is
 * applied at once, anything else is clamped when the field loses focus.
 */
export function NumberInput({ value, min = -Infinity, max = Infinity, step = 1, onChange, disabled, ariaLabel, width = 52, unit, className = '' }) {
  const { t } = useTranslation();
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const valueRef = useRef(value);
  const repeat = useRef(null);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => { if (!editing) setText(String(value)); }, [value, editing]);
  useEffect(() => () => clearTimeout(repeat.current), []);

  const clamp = (n) => Math.min(max, Math.max(min, n));
  const round = (n) => Math.round(n / step) * step;
  const bump = (dir) => {
    const next = clamp(round((Number(valueRef.current) || 0) + dir * step));
    if (next !== valueRef.current) { valueRef.current = next; onChangeRef.current(next); }
    setText(String(next));
    return next;
  };
  const startRepeat = (dir) => {
    if (disabled) return;
    bump(dir);
    const tick = (delay) => {
      repeat.current = setTimeout(() => {
        const n = bump(dir);
        if (n > min && n < max) tick(Math.max(40, delay * 0.8));
      }, delay);
    };
    tick(400);
  };
  const stopRepeat = () => clearTimeout(repeat.current);

  const commitText = () => {
    setEditing(false);
    const n = Number(text);
    const next = Number.isFinite(n) && text.trim() !== '' ? clamp(round(n)) : value;
    if (next !== value) onChange(next);
    setText(String(next));
  };

  const stepButton = (dir) => (
    <button
      type="button"
      className="num-btn"
      tabIndex={-1}
      disabled={disabled || (dir < 0 ? value <= min : value >= max)}
      aria-label={dir < 0 ? t('common.decrease') : t('common.increase')}
      data-tip={dir < 0 ? t('common.decrease') : t('common.increase')}
      onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); startRepeat(dir); } }}
      onPointerUp={stopRepeat}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bump(dir); } }}
    >
      <Icon name={dir < 0 ? 'minus' : 'plus'} />
    </button>
  );

  return (
    <span className={`num-input${disabled ? ' disabled' : ''} ${className}`}>
      {stepButton(-1)}
      <input
        type="text"
        inputMode="numeric"
        value={text}
        disabled={disabled}
        aria-label={ariaLabel}
        style={{ width }}
        onFocus={(e) => { setEditing(true); e.target.select(); }}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= min && n <= max && n !== value) onChange(round(n));
        }}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commitText(); setEditing(true); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); bump(e.key === 'ArrowUp' ? 1 : -1); }
          else if (e.key === 'Escape') { setText(String(value)); }
        }}
      />
      {stepButton(1)}
      {unit ? <span className="num-unit">{unit}</span> : null}
    </span>
  );
}

// ── Small building blocks ─────────────────────────────────
export function Field({ label, children, hint }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div>{children}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function Check({ label, checked, onChange, disabled }) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
