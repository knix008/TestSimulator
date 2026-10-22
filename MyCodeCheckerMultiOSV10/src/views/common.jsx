// Shared widgets for the platform views: icon dropdown, tabs, toolbar
// buttons, −/+ steppers, confirmation dialog, API hook, file save / open.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon, Dialog } from '../components/Chrome';

// ── API hook ──────────────────────────────────────────────
export function useApi(method, args, deps, enabled = true) {
  const [state, setState] = useState({ data: null, error: '', loading: false });
  const seq = useRef(0);
  const run = useCallback(async () => {
    if (!enabled) { setState({ data: null, error: '', loading: false }); return null; }
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await call(method, args);
      if (id === seq.current) setState({ data, error: '', loading: false });
      return data;
    } catch (err) {
      if (id === seq.current) setState({ data: null, error: err.message || String(err), loading: false, code: err.code });
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, enabled, ...deps]);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

// ── Save / open ───────────────────────────────────────────
// The same mechanism as the File › Export menu: a Blob and a download link.
export function saveText(fileName, body, type = 'text/plain') {
  const blob = new Blob([body], { type: type || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

// Reads a local file into text in the page (works on the web and in Tauri).
export function FilePickButton({ label, icon = 'upload', accept, onText, className = 'vbtn' }) {
  const ref = useRef(null);
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current && ref.current.click()}>
        <Icon name={icon} size={15} /><span>{label}</span>
      </button>
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }} onChange={(e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => onText(String(reader.result || ''), file.name);
        reader.readAsText(file);
        e.target.value = '';
      }} />
    </>
  );
}

// ── Buttons, tabs, steppers ───────────────────────────────
export function Btn({ icon, label, onClick, disabled, primary, title, danger, active }) {
  return (
    <button type="button" className={`vbtn ${primary ? 'vbtn-primary' : ''} ${danger ? 'vbtn-danger' : ''} ${active ? 'on' : ''}`}
      onClick={onClick} disabled={disabled} title={title || label}>
      {icon && <Icon name={icon} size={15} />}<span>{label}</span>
    </button>
  );
}

// A group of buttons with the same width.
export function BtnGroup({ children }) {
  return <div className="btn-group">{children}</div>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="vtabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={value === tab.id}
          className={`vtab ${value === tab.id ? 'on' : ''}`} onClick={() => onChange(tab.id)}>
          {tab.icon && <Icon name={tab.icon} size={15} />}<span>{tab.label}</span>
          {tab.count != null && <span className="vtab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, icon }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} className={`vbtn toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="switch" aria-hidden="true"><span /></span>
      {icon && <Icon name={icon} size={15} />}<span>{label}</span>
    </button>
  );
}

export function Stepper({ value, onChange, min = 0, max = 100000, step = 1, label, width = 72, ariaLabel }) {
  const clamp = (n) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  return (
    <span className="stepper">
      {label && <span className="stepper-label">{label}</span>}
      <button type="button" className="step-btn" aria-label="−" disabled={value <= min} onClick={() => onChange(clamp(value - step))}>−</button>
      <input type="number" value={value} style={{ width }} aria-label={ariaLabel || label || undefined} onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      <button type="button" className="step-btn" aria-label="+" disabled={value >= max} onClick={() => onChange(clamp(value + step))}>+</button>
    </span>
  );
}

// ── Icon dropdown (no native <select>) ────────────────────
// options: [{ value, label, icon, hint? }]
// Keyboard: Enter / Space / ArrowDown / ArrowUp open the list on the current
// value; ArrowUp / ArrowDown / Home / End move; Enter / Space pick; Esc and
// Tab close. The popup is clamped to the window on every side.
export function IconSelect({ value, options, onChange, title, width, icon, placeholder, ariaLabel }) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [active, setActive] = useState(-1);
  const btn = useRef(null);
  const pop = useRef(null);
  const currentIndex = options.findIndex((o) => o.value === value);
  const current = currentIndex >= 0 ? options[currentIndex] : null;
  const openAt = (index) => { setActive(index); setOpen(true); };
  const close = (refocus) => { setOpen(false); if (refocus && btn.current) btn.current.focus(); };
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => {
      if (btn.current && btn.current.contains(e.target)) return;
      if (pop.current && pop.current.contains(e.target)) return;
      setOpen(false);
    };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(true); } };
    const shut = () => setOpen(false);
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key, true);
    const scroll = (e) => { if (!(pop.current && pop.current.contains(e.target))) setOpen(false); };
    window.addEventListener('resize', shut);
    window.addEventListener('scroll', scroll, true);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', shut);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const want = Math.min(320, options.length * 30 + 10);
    const below = vh - r.bottom - 6;
    const above = r.top - 6;
    const up = below < want && above > below;
    const h = Math.max(40, Math.min(want, up ? above : below));
    const top = up ? Math.max(4, r.top - h - 2) : Math.min(r.bottom + 2, vh - h - 4);
    const maxWidth = Math.max(120, vw - 12);
    const w = Math.min(Math.max(r.width, 180), maxWidth);
    const left = Math.max(6, Math.min(r.left, vw - w - 6));
    setPos({ top, left, minWidth: w, maxWidth: Math.min(maxWidth, vw - left - 6), maxHeight: h });
  }, [open, options.length]);
  // Move the focus to the active option and keep it in view inside the list.
  useEffect(() => {
    if (!open || !pos || !pop.current) return;
    const items = pop.current.querySelectorAll('[role="option"]');
    const el = items[active] || items[0];
    if (!el) return;
    el.focus({ preventScroll: true });
    const p = pop.current;
    if (el.offsetTop < p.scrollTop) p.scrollTop = el.offsetTop - 4;
    else if (el.offsetTop + el.offsetHeight > p.scrollTop + p.clientHeight) p.scrollTop = el.offsetTop + el.offsetHeight - p.clientHeight + 4;
  }, [open, pos, active]);
  const onButtonKey = (e) => {
    if (open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!options.length) return;
      openAt(currentIndex >= 0 ? currentIndex : (e.key === 'ArrowUp' ? options.length - 1 : 0));
    }
  };
  const onListKey = (e) => {
    const n = options.length;
    if (!n) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(n - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Home' || e.key === 'PageUp') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' || e.key === 'PageDown') { e.preventDefault(); setActive(n - 1); }
    else if (e.key === 'Tab') { setOpen(false); }
  };
  const pick = (o) => { close(true); onChange(o.value); };
  return (
    <>
      <button ref={btn} type="button" className="vbtn iselect" title={title} style={width ? { width } : undefined}
        aria-label={ariaLabel || undefined} aria-haspopup="listbox" aria-expanded={open}
        onKeyDown={onButtonKey} onClick={() => (open ? setOpen(false) : openAt(currentIndex >= 0 ? currentIndex : 0))}>
        <Icon name={(current && current.icon) || icon || 'list'} size={15} />
        <span className="iselect-text">{current ? current.label : (placeholder || title)}</span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open && pos && (
        <div ref={pop} className="iselect-pop" role="listbox" aria-label={ariaLabel || title || undefined} onKeyDown={onListKey}
          style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth, maxWidth: pos.maxWidth, maxHeight: pos.maxHeight }}>
          {options.map((o, i) => (
            <button key={String(o.value)} type="button" role="option" aria-selected={o.value === value} tabIndex={i === active ? 0 : -1}
              className={`iselect-item ${o.value === value ? 'on' : ''} ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
              <Icon name={o.icon || 'list'} size={15} />
              <span className="iselect-text">{o.label}</span>
              {o.value === value && <Icon name="check" size={13} />}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ── Date field (no native date input) ─────────────────────
// A YYYY-MM-DD text box with a calendar popover. value is '' or 'YYYY-MM-DD'.
const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
function parseIso(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

export function DateField({ value, onChange, placeholder = 'YYYY-MM-DD' }) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [month, setMonth] = useState(() => { const d = parseIso(value) || new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const box = useRef(null);
  const pop = useRef(null);
  const invalid = !!value && !parseIso(value);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (box.current && box.current.contains(e.target)) return;
      if (pop.current && pop.current.contains(e.target)) return;
      setOpen(false);
    };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    const shut = () => setOpen(false);
    const scroll = (e) => { if (!(pop.current && pop.current.contains(e.target))) setOpen(false); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key, true);
    window.addEventListener('resize', shut);
    window.addEventListener('scroll', scroll, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', shut);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const w = 252;
    const h = 292;
    const below = window.innerHeight - r.bottom;
    const top = below < h + 8 && r.top > below ? Math.max(4, r.top - h - 2) : r.bottom + 2;
    const left = Math.max(4, Math.min(r.right - w, window.innerWidth - w - 6));
    setPos({ top, left, width: w });
  }, [open]);
  const toggle = () => {
    if (!open) { const d = parseIso(value) || new Date(); setMonth({ y: d.getFullYear(), m: d.getMonth() }); }
    setOpen(!open);
  };
  const shift = (delta) => setMonth(({ y, m }) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const ko = getLanguage() === 'ko';
  const weekdays = ko ? ['일', '월', '화', '수', '목', '금', '토'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const title = ko ? `${month.y}년 ${month.m + 1}월` : new Date(month.y, month.m, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const first = new Date(month.y, month.m, 1).getDay();
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(month.y, month.m, i - first + 1);
    cells.push({ iso: isoOf(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), out: i < first || i >= first + days, dow: d.getDay() });
  }
  const now = new Date();
  const today = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  const pick = (iso) => { onChange(iso); setOpen(false); };
  return (
    <span ref={box} className={`datefield ${invalid ? 'invalid' : ''}`}>
      <input value={value || ''} placeholder={placeholder} title={invalid ? t('dp_invalid') : undefined} aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value.trim())} />
      <button type="button" className="date-btn" title={t('dp_pick')} aria-label={t('dp_pick')} aria-expanded={open} onClick={toggle}>
        <Icon name="calendar" size={15} />
      </button>
      {open && pos && (
        <div ref={pop} className="date-pop" role="dialog" style={{ top: pos.top, left: pos.left, width: pos.width }}>
          <div className="date-head">
            <button type="button" className="step-btn" title={t('dp_prev')} aria-label={t('dp_prev')} onClick={() => shift(-1)}><Icon name="chevronLeft" size={14} /></button>
            <span className="date-title">{title}</span>
            <button type="button" className="step-btn" title={t('dp_next')} aria-label={t('dp_next')} onClick={() => shift(1)}><Icon name="chevronRight" size={14} /></button>
          </div>
          <div className="date-grid">
            {weekdays.map((w, i) => <span key={w} className={`date-dow ${i === 0 ? 'sun' : ''}`}>{w}</span>)}
            {cells.map((c) => (
              <button key={c.iso} type="button" onClick={() => pick(c.iso)}
                className={`date-day ${c.out ? 'out' : ''} ${c.iso === value ? 'on' : ''} ${c.iso === today ? 'today' : ''} ${c.dow === 0 ? 'sun' : ''}`}>{c.day}</button>
            ))}
          </div>
          <div className="date-foot">
            <BtnGroup>
              <Btn icon="calendar" label={t('dp_today')} onClick={() => pick(today)} />
              <Btn icon="close" label={t('dp_clear')} onClick={() => pick('')} />
            </BtnGroup>
          </div>
        </div>
      )}
    </span>
  );
}

// ── Confirmation dialog ───────────────────────────────────
export function Confirm({ title, body, okLabel, onOk, onCancel, danger }) {
  useLanguage();
  return (
    <Dialog title={title} onClose={onCancel}>
      <p style={{ margin: '4px 0 8px', lineHeight: 1.5 }}>{body}</p>
      <div className="dialog-actions">
        <BtnGroup>
          <Btn icon={danger ? 'alert' : 'check'} label={okLabel || t('ok')} primary onClick={onOk} />
          <Btn icon="close" label={t('cancel')} onClick={onCancel} />
        </BtnGroup>
      </div>
    </Dialog>
  );
}

// ── Small pieces ──────────────────────────────────────────
export function Empty({ text, icon = 'info' }) {
  return <div className="empty"><Icon name={icon} size={18} /><span>{text}</span></div>;
}

export function ApiState({ state, noData }) {
  if (state.loading && !state.data) return <Empty text={t('loading')} icon="clock" />;
  if (state.error) {
    if (state.code === 'NOT_FOUND') return <Empty text={noData || t('pf_no_analysis')} />;
    return <Empty text={state.error} icon="alert" />;
  }
  return null;
}

export function Stat({ label, value, sub, tone }) {
  return (
    <div className="card">
      <div className="k">{label}</div>
      <div className={`v ${tone || ''}`}>{value == null ? '—' : value}</div>
      {sub != null && <div className="small">{sub}</div>}
    </div>
  );
}

export function Rating({ letter }) {
  if (!letter) return <span className="muted">—</span>;
  return <span className={`rating-chip ${letter}`}>{letter}</span>;
}

export function ViewHeader({ icon, title, hint, children }) {
  return (
    <div className="view-head">
      <div className="view-title"><Icon name={icon} size={18} /><h2>{title}</h2></div>
      {hint && <p className="small view-hint">{hint}</p>}
      {children && <div className="view-toolbar">{children}</div>}
    </div>
  );
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function linesToList(text) {
  return String(text || '').split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
}
