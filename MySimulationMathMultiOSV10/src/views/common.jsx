// Shared widgets: icon dropdown, tabs, toolbar
// buttons, −/+ steppers, confirmation dialog, API hook, file save / open.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { isDesktop, fsApi } from '../lib/backend';
import { chooseFile } from '../lib/prompt';
import { errorText, toast, showError } from '../lib/ui';
import { Icon, Dialog } from '../components/Chrome';
import { usePopupWindows, openPopupWindow } from '../lib/popups';
import { TWO_COLUMN_MIN, menuSize } from '../lib/menuColumns';
import { getCustomThemesRaw } from '../themes';

// ── Save / open ───────────────────────────────────────────
// Desktop: the app save dialog (chooseFile) and the sidecar writes the file
// (file.save), then "저장됨: <path>". Web (or a sidecar without file.save):
// a Blob and a download link.
function download(fileName, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Resolves the saved path, false (cancelled / failed) or null (download instead).
async function saveOnDesktop(fileName, content) {
  if (!isDesktop) return null;
  const ext = String(fileName || '').split('.').pop();
  const path = await chooseFile({ mode: 'save', name: fileName, exts: ext && ext !== fileName ? ['.' + ext] : [] });
  if (!path) return false;
  try {
    if (content.base64 != null) { const bin = atob(content.base64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); await fsApi.writeBytes(path, u8); } else await fsApi.writeText(path, content.text);
    const where = path;
    toast(t('saved_to', { path: where }), 'ok', 5000);
    return where;
  } catch (err) {
    showError(err);
    return false;
  }
}

export async function saveText(fileName, body, type = 'text/plain') {
  const done = await saveOnDesktop(fileName, { text: String(body == null ? '' : body) });
  if (done !== null) return done;
  download(fileName, new Blob([body], { type: type || 'text/plain' }));
  return fileName;
}

// Binary files from the API ({ base64, type, fileName }): decode and save.
export async function saveBase64(fileName, base64, type = 'application/octet-stream') {
  const done = await saveOnDesktop(fileName, { base64: String(base64 || '') });
  if (done !== null) return done;
  const bin = atob(String(base64 || ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  download(fileName, new Blob([bytes], { type }));
  return fileName;
}

// API warnings may be strings or { message: { ko, en } } objects.
export function warningText(w) {
  if (!w) return '';
  if (typeof w === 'string') return w;
  const m = w.message || w;
  if (typeof m === 'string') return m;
  return m[getLanguage()] || m.en || m.ko || JSON.stringify(w);
}

// Error text with a plain explanation for the API error codes (lib/ui.js).
export { errorText };

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

/**
 * Every numeric setting: [−] [value, centred] [+] with square buttons as tall
 * as the field. The value can be typed (checked against min / max / step on
 * Enter or leaving the field); hold a button to repeat; mouse wheel and ↑ / ↓
 * change it too. − is disabled at min and + at max. `unit` goes after it.
 */
// decIcon / incIcon: icons in place of − / + (e.g. zoomOut / zoomIn for a zoom ratio); decTitle / incTitle their tooltips.
export function Stepper({ value, onChange, min = 0, max = 100000, step = 1, label, width = 72, ariaLabel, unit, disabled, decIcon, incIcon, decTitle, incTitle }) {
  const clamp = (n) => {
    const v = Number.isFinite(n) ? n : min;
    const snapped = step > 0 ? Math.round((v - min) / step) * step + min : v;
    const digits = String(step).includes('.') ? String(step).split('.')[1].length : 0;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(digits));
  };
  const [text, setText] = useState(null); // while typing
  const cur = useRef(value);
  cur.current = value;
  const timer = useRef(null);
  const stop = () => { clearTimeout(timer.current); clearInterval(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  const bump = (dir) => {
    const next = clamp((Number(cur.current) || 0) + dir * step);
    if (next !== cur.current) { cur.current = next; onChange(next); }
  };
  // Hold to repeat: once now, then after 400 ms every 70 ms.
  const press = (dir) => (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    bump(dir);
    stop();
    timer.current = setTimeout(() => { timer.current = setInterval(() => bump(dir), 70); }, 400);
  };
  // A ratio shows its % in the value itself ("110%"); typed values may carry it or not.
  const inUnit = unit === '%';
  const num = (v) => Number(String(v).replace(',', '.').replace(/%/g, '').trim());
  const commit = () => {
    if (text == null) return;
    const n = num(text);
    setText(null);
    if (String(text).trim() !== '' && Number.isFinite(n)) onChange(clamp(n));
  };
  const invalid = text != null && (String(text).trim() === '' || !Number.isFinite(num(text)));
  return (
    <span className={`stepper ${disabled ? 'disabled' : ''}`}>
      {label && <span className="stepper-label">{label}</span>}
      <button type="button" className="step-btn" aria-label={decTitle || `${ariaLabel || label || ''} −`.trim()} title={decTitle} tabIndex={-1} disabled={disabled || value <= min}
        onPointerDown={press(-1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bump(-1); } }}>{decIcon ? <Icon name={decIcon} size={14} /> : '−'}</button>
      <input type="text" inputMode="decimal" className={`step-value ${invalid ? 'invalid' : ''}`} value={text != null ? text : (inUnit ? `${value}%` : String(value))} style={{ width: inUnit ? Math.max(width, 54) : width }} disabled={disabled}
        role="spinbutton" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-label={ariaLabel || label || undefined}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape' && text != null) { e.stopPropagation(); setText(null); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setText(null); bump(e.key === 'ArrowUp' ? 1 : -1); }
          else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); setText(null); bump((e.key === 'PageUp' ? 1 : -1) * 10); }
        }}
        onWheel={(e) => { if (disabled || document.activeElement !== e.currentTarget) return; e.preventDefault(); setText(null); bump(e.deltaY < 0 ? 1 : -1); }} />
      <button type="button" className="step-btn" aria-label={incTitle || `${ariaLabel || label || ''} +`.trim()} title={incTitle} tabIndex={-1} disabled={disabled || value >= max}
        onPointerDown={press(1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bump(1); } }}>{incIcon ? <Icon name={incIcon} size={14} /> : '+'}</button>
      {unit && !inUnit && <span className="stepper-unit">{unit}</span>}
    </span>
  );
}

// A slider with the −/+ stepper and the value next to it.
export function RangeStepper({ value, onChange, min = 0, max = 100, step = 1, unit = '', ariaLabel, width = 52 }) {
  return (
    <span className="range-stepper">
      <input type="range" min={min} max={max} step={step} value={value} aria-label={ariaLabel} onChange={(e) => onChange(Number(e.target.value))} />
      <Stepper value={value} min={min} max={max} step={step} width={width} ariaLabel={ariaLabel} onChange={onChange} unit={unit === '%' ? unit : undefined} />
      {unit && unit !== '%' && <span className="small">{unit}</span>}
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
    const two = options.length >= TWO_COLUMN_MIN;
    const rows = two ? Math.ceil(options.length / 2) : options.length;
    const want = Math.min(two ? 420 : 320, rows * 30 + 10);
    const below = vh - r.bottom - 6;
    const above = r.top - 6;
    const up = below < want && above > below;
    const h = Math.max(40, Math.min(want, up ? above : below));
    const top = up ? Math.max(4, r.top - h - 2) : Math.min(r.bottom + 2, vh - h - 4);
    const maxWidth = Math.max(120, vw - 12);
    const w = Math.min(two ? Math.max(r.width, 180) * 2 + 9 : Math.max(r.width, 180), maxWidth);
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
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && n >= TWO_COLUMN_MIN) {
      e.preventDefault();
      const half = Math.ceil(n / 2);
      setActive((i) => (e.key === 'ArrowRight' ? (i < half ? Math.min(n - 1, i + half) : i) : (i >= half ? i - half : i)));
    }
    else if (e.key === 'Home' || e.key === 'PageUp') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' || e.key === 'PageDown') { e.preventDefault(); setActive(n - 1); }
    else if (e.key === 'Tab') { setOpen(false); }
  };
  const pick = (o) => { close(true); onChange(o.value); };
  // Desktop: the list is a child window at the button (it can go past the main window).
  const openDesktop = () => {
    const r = btn.current.getBoundingClientRect();
    const items = options.map((o) => ({ value: o.value, label: String(o.label), icon: o.icon || 'list', flag: o.flag || '' }));
    const size = menuSize(items, Math.max(r.width, 180));
    const look = { theme: document.documentElement.dataset.theme, language: getLanguage(), customThemes: getCustomThemesRaw() };
    openPopupWindow({ kind: 'select', anchor: r, width: size.width, height: Math.min(size.columns > 1 ? 420 : 320, size.height), payload: { ...look, items, value },
      onResult: (res) => { if (res && 'value' in res) onChange(res.value); if (btn.current) btn.current.focus(); } });
  };
  return (
    <>
      <button ref={btn} type="button" className="vbtn iselect" title={title} style={width ? { width } : undefined}
        aria-label={ariaLabel || undefined} aria-haspopup="listbox" aria-expanded={open}
        onKeyDown={(e) => { if (usePopupWindows() && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDesktop(); return; } onButtonKey(e); }}
        onClick={() => { if (usePopupWindows()) { openDesktop(); return; } if (open) setOpen(false); else openAt(currentIndex >= 0 ? currentIndex : 0); }}>
        {(current && current.iconNode) || <Icon name={(current && current.icon) || icon || 'list'} size={15} />}
        <span className="iselect-text">{current ? current.label : (placeholder || title)}</span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open && pos && (
        <div ref={pop} className={`iselect-pop ${options.length >= TWO_COLUMN_MIN ? 'two-col' : ''}`} role="listbox" aria-label={ariaLabel || title || undefined} onKeyDown={onListKey}
          style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth, maxWidth: pos.maxWidth, maxHeight: pos.maxHeight, '--rows': Math.ceil(options.length / 2) }}>
          {options.map((o, i) => (
            <button key={String(o.value)} type="button" role="option" aria-selected={o.value === value} tabIndex={i === active ? 0 : -1}
              className={`iselect-item ${o.value === value ? 'on' : ''} ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
              {o.iconNode || <Icon name={o.icon || 'list'} size={15} />}
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
// One-line empty note, or (with hint / children) a centred empty state:
// icon + what is missing + what to do, with the action buttons.
export function Empty({ text, icon = 'inbox', hint, children }) {
  if (!hint && !children) return <div className="empty"><Icon name={icon} size={18} /><span>{text}</span></div>;
  return (
    <div className="empty empty-big">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <strong>{text}</strong>
      {hint && <span className="small">{hint}</span>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}

// Asks App to run a menu action (open folder, sample, view:…) without
// threading callbacks through every view.
export function emitAction(id) {
  window.dispatchEvent(new CustomEvent('msm-action', { detail: id }));
}

export function ViewHeader({ icon, title, hint, children, tour }) {
  return (
    <div className="view-head">
      <div className="view-title"><Icon name={icon} size={18} /><h2>{title}</h2></div>
      {hint && <p className="small view-hint" title={hint}>{hint}</p>}
      {children && <div className="view-toolbar" data-tour={tour}>{children}</div>}
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

// ── Long lists ──────────────────────────────────────────────
// A large project has 100 000+ issues; one <tr> each blocks the window for
// minutes. Lists render the first rows and add more when the end scrolls
// into view (or on "Show more"). Returns the rows to render and the footer.
const ROWS_STEP = 300;
export function useRowWindow(list, step = ROWS_STEP) {
  const [count, setCount] = useState(step);
  const footRef = useRef(null);
  useEffect(() => { setCount(step); }, [list, step]);
  const more = list.length > count;
  useEffect(() => {
    const el = footRef.current;
    if (!more || !el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setCount((c) => c + step);
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, count, step]);
  const rows = more ? list.slice(0, count) : list;
  const footer = more ? (
    <div className="row-window-more" ref={footRef}>
      <span className="small">{t('rw_shown', { n: count.toLocaleString(), total: list.length.toLocaleString() })}</span>
      <Btn icon="chevronDown" label={t('rw_more')} onClick={() => setCount((c) => c + step * 10)} />
    </div>
  ) : null;
  return { rows, footer };
}
