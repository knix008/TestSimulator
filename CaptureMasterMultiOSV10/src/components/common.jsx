import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
/** items: [{ label, icon, shortcut, sub, disabled, danger, onClick } | 'sep'] */
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
    const key = (e) => { if (e.key === 'Escape') onClose(); };
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
            className={`ctx-item${it.disabled ? ' disabled' : ''}${it.danger ? ' danger' : ''}`}
            onClick={() => { if (it.disabled) return; onClose(); it.onClick && it.onClick(); }}
          >
            {it.icon ? <Icon name={it.icon} /> : <span style={{ width: 15 }} />}
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

export function ToastHost({ toasts }) {
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <Icon name={t.kind === 'err' ? 'error' : t.kind === 'warn' ? 'warning' : 'check'} size={15} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
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
    <div ref={ref} className="dropdown" style={{ left: pos ? pos.x : -9999, top: pos ? pos.y : -9999, width }}>
      {children}
    </div>
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
