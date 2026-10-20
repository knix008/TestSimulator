// A drop-down list whose every entry has an icon — the app's stand-in for <select>, whose options
// can only hold text. The closed control looks like a select (the current entry's icon and label and
// a caret); clicking it, or Enter / Space / Alt+↓, opens the list as a ContextMenu, and ↑ / ↓ step
// through the entries without opening it, as a select does.
//   options: [{ value, label, icon | iconEl | marker | swatch: [bg, accent] }]; `icon` is the
//   default for entries without one. onChange gets the chosen option's value (its own type).
import React, { useRef, useState } from 'react';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';
import { markerSvgDoc } from '../lib/markers';

const same = (a, b) => String(a ?? '') === String(b ?? '');

export function IconSelect({ value, onChange, options, icon = 'list', disabled = false, className = '', style, title, name }) {
  const [open, setOpen] = useState(null);
  const btn = useRef(null);
  const cur = options.find((o) => same(o.value, value)) || null;
  const pick = (o) => { if (o && !same(o.value, value)) onChange(o.value); };
  const iconOf = (o, size = 14) => {
    if (o.iconEl) return o.iconEl;
    if (o.marker) return <span className="ctx-marker" dangerouslySetInnerHTML={{ __html: markerSvgDoc(o.marker, size + 1) }} />;
    if (o.swatch) return <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${o.swatch[0]} 50%, ${o.swatch[1]} 50%)` }} />;
    return <Icon name={o.icon || icon} size={size} />;
  };
  const onKey = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowDown' && e.altKey)) { e.preventDefault(); setOpen(open ? null : btn.current); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = options.findIndex((o) => same(o.value, value));
      const next = options[Math.max(0, Math.min(options.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      pick(next);
    }
  };
  return (
    <>
      <button type="button" ref={btn} className={`icon-select ${open ? 'open' : ''} ${className}`} style={style} title={title} disabled={disabled}
        role="combobox" aria-expanded={!!open} data-name={name} data-value={cur ? String(cur.value) : ''}
        onClick={(e) => setOpen(open ? null : e.currentTarget)} onKeyDown={onKey}>
        <span className="is-icon">{cur ? iconOf(cur) : <Icon name={icon} size={14} />}</span>
        <span className="is-label">{cur ? cur.label : ''}</span>
        <Icon name="chevronDown" size={12} className="is-caret" />
      </button>
      {open && (
        <ContextMenu anchorEl={open} x={0} y={0} className="select-menu" portal
          items={options.map((o, i) => ({ id: `opt${i}`, label: o.label, checked: same(o.value, value), ...(o.marker ? { marker: o.marker } : { iconEl: iconOf(o) }) }))}
          onPick={(id) => { setOpen(null); pick(options[Number(id.slice(3))]); btn.current && btn.current.focus(); }}
          onClose={() => setOpen(null)} />
      )}
    </>
  );
}

// ── small drawn icons for the entries ──
const svg = (children, w = 16, h = 16) => <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke="currentColor" aria-hidden="true">{children}</svg>;
// a line as thick as the entry says (0: a dashed "none")
export const lineWidthIcon = (w) => svg(w ? <line x1="2" y1="8" x2="14" y2="8" strokeWidth={Math.min(6, w)} strokeLinecap="round" /> : <line x1="2" y1="8" x2="14" y2="8" strokeWidth="1" strokeDasharray="2 2" />);
// a rectangle as wide as the entry says, relative to the widest one
export const widthIcon = (w, max) => svg(<><rect x="1.5" y="5" width={Math.max(3, Math.round(13 * w / max))} height="6" rx="1" strokeWidth="1.3" /></>);
// the connecting line drawn in that style
export const lineStyleIcon = (s) => svg(<path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d={{ curve: 'M2 13C8 13 8 3 14 3', straight: 'M2 13L14 3', elbow: 'M2 13H8V3H14', rounded: 'M2 13H5Q8 13 8 10V6Q8 3 11 3H14' }[s] || 'M2 13C8 13 8 3 14 3'} />);
// a page on its side or upright
export const orientIcon = (landscape) => svg(landscape ? <rect x="1.5" y="4" width="13" height="9" rx="1" strokeWidth="1.3" /> : <rect x="3.5" y="1.5" width="9" height="13" rx="1" strokeWidth="1.3" />);
// n pages: a grid of n tiles
export const tilesIcon = (n) => {
  const [c, r] = { 1: [1, 1], 2: [2, 1], 4: [2, 2], 6: [3, 2], 9: [3, 3] }[n] || [1, 1];
  const cells = [];
  for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) cells.push(<rect key={`${i}-${j}`} x={1.5 + i * 13 / c} y={2.5 + j * 11 / r} width={13 / c - 1} height={11 / r - 1} strokeWidth="1" />);
  return svg(cells);
};
// a theme mode: dark or light
export const modeIcon = (mode) => svg(mode === 'light'
  ? <><circle cx="8" cy="8" r="3" strokeWidth="1.4" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" strokeWidth="1.3" strokeLinecap="round" /></>
  : <path d="M12.5 10.2A5.5 5.5 0 0 1 5.8 3.5 5.5 5.5 0 1 0 12.5 10.2z" strokeWidth="1.4" strokeLinejoin="round" />);
// "expand to level n": a tree n levels deep, each level a step further in
export function LevelIcon({ n }) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(<line key={i} x1={2 + i * 4} y1={3 + i * 5} x2={9 + i * 4} y2={3 + i * 5} strokeWidth="2" strokeLinecap="round" />);
  return svg(<>{rows}{n > 1 && <path d={`M3 4V${3 + (n - 1) * 5}`} strokeWidth="1" opacity="0.6" />}</>);
}
// a small text badge (1×, 2× …)
export const badgeIcon = (text) => <span className="is-badge">{text}</span>;

// task priority 1‥9 and progress steps, with the same icons the topics show
export const priorityOptions = (noneLabel) => [{ value: '', label: noneLabel, icon: 'priority' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => ({ value: p, label: String(p), marker: `priority-${p}` }))];
export const progressOptions = (noneLabel, current) => [{ value: '', label: noneLabel, icon: 'progress' }, ...[0, 25, 50, 75, 100].concat(current != null && ![0, 25, 50, 75, 100].includes(current) ? [current] : []).map((p) => ({ value: p, label: `${p}%`, marker: `progress-${[0, 25, 50, 75, 100].includes(p) ? p : Math.round(p / 25) * 25}` }))];

// export / print choices shared by the export dialog, print preview and Settings
export const scaleOptions = () => [1, 1.5, 2, 3, 4].map((s) => ({ value: s, label: `${s}×`, iconEl: badgeIcon(`${s}×`) }));
export const paddingOptions = () => [0, 20, 40, 80].map((p) => ({ value: p, label: `${p}px`, icon: p ? 'fit' : 'minus' }));
export const paperOptions = (papers, fitLabel) => [...(fitLabel ? [{ value: 'fit', label: fitLabel, icon: 'fit' }] : []), ...papers.map((p) => ({ value: p, label: p.toUpperCase(), icon: 'fileText' }))];
export const orientOptions = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label, ...(value === 'auto' ? { icon: 'refresh' } : { iconEl: orientIcon(value === 'landscape') }) }));
export const tilesOptions = (label) => [1, 2, 4, 6, 9].map((n) => ({ value: n, label: label(n), iconEl: tilesIcon(n) }));

export default IconSelect;
