// 그림 속성 / Figure Properties (right side of the plot screen): the current
// figure's target axes — title and axis labels, limits, grid, box, legend,
// colormap, line width. Read from the GUI copy of the figure tree
// (window.__msmFigures, src/graphics/controller.js; read only) and applied
// as M code on gca (title(gca, '…'), xlim(gca, […]) …), so the engine stays
// the owner of the figure.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { IconSelect, Stepper, Toggle } from '../views/common';
import { COLORMAP_NAMES, colormapByName } from '../../core/graphics/colormaps.js';
import { mQuote } from '../lib/files';
import { limitStep } from './panels';

/** The figure controller once the figure area has loaded it, and a re-render on every change. */
export function useFigureController() {
  const [ctl, setCtl] = useState(() => (typeof window !== 'undefined' ? window.__msmFigures || null : null));
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (ctl) return undefined;
    const timer = setInterval(() => { if (window.__msmFigures) { setCtl(window.__msmFigures); clearInterval(timer); } }, 500);
    return () => clearInterval(timer);
  }, [ctl]);
  useEffect(() => (ctl ? ctl.subscribe(setVersion) : undefined), [ctl]);
  return ctl;
}

const textOf = (node) => {
  const s = node && node.props ? node.props.String : '';
  if (Array.isArray(s)) return s.join(' ');
  return s == null ? '' : String(s);
};
const rowsOf = (M) => {
  if (!M || !M.dims || !M.data) return [];
  const m = M.dims[0];
  const out = [];
  for (let i = 0; i < m; i++) out.push([M.data[i], M.data[i + m], M.data[i + 2 * m]]);
  return out;
};
/** The colormap name whose rows match (first, middle and last row), or ''. */
export function colormapNameOf(M) {
  const rows = rowsOf(M);
  if (!rows.length) return '';
  const n = rows.length;
  const close = (a, b) => a && b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 0.02;
  for (const name of COLORMAP_NAMES) {
    const c = colormapByName(name, n);
    if (c && close(c[0], rows[0]) && close(c[n - 1], rows[n - 1]) && close(c[n >> 1], rows[n >> 1])) return name;
  }
  return '';
}
const css = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
function Swatch({ name }) {
  const rows = colormapByName(name, 9) || [];
  return <span className="cmap-swatch" aria-hidden="true" style={{ background: `linear-gradient(90deg, ${rows.map((r, i) => `${css(r)} ${Math.round((i / Math.max(1, rows.length - 1)) * 100)}%`).join(', ')})` }} />;
}
const CMAP_OPTIONS = COLORMAP_NAMES.map((name) => ({ value: name, label: name, icon: 'palette', iconNode: <Swatch name={name} /> }));

function firstLineWidth(ax) {
  let w = null;
  const walk = (n) => { for (const c of (n && n.children) || []) { if (w != null) return; if (c.type === 'line' || c.type === 'stair' || c.type === 'stem') { w = Number(c.props.LineWidth); return; } walk(c); } };
  walk(ax);
  return Number.isFinite(w) ? w : 0.5;
}

/** A text property: typed, applied on Enter or when the field is left. */
function TextProp({ label, value, onApply, id }) {
  const [draft, setDraft] = useState(value);
  const cur = useRef(value);
  useEffect(() => { setDraft(value); cur.current = value; }, [value]);
  const commit = () => { if (draft !== cur.current) { cur.current = draft; onApply(draft); } };
  return (
    <label className="fp-row" htmlFor={id}>
      <span className="fp-label">{label}</span>
      <input id={id} className="fp-input" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') { setDraft(cur.current); } }} />
    </label>
  );
}

/** Axis limits: two −/+ steppers (applied after a short pause) and 자동. */
function LimitProp({ axis, lim, onApply, onAuto }) {
  const [draft, setDraft] = useState(lim);
  const timer = useRef(null);
  useEffect(() => { setDraft(lim); }, [lim && lim[0], lim && lim[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!lim) return null;
  const step = limitStep(lim[0], lim[1]);
  const set = (i, v) => {
    const next = draft.slice();
    next[i] = v;
    setDraft(next);
    clearTimeout(timer.current);
    if (next[0] < next[1]) timer.current = setTimeout(() => onApply(next), 300);
  };
  const A = axis.toUpperCase();
  return (
    <div className="fp-row fp-lim" data-lim={axis}>
      <span className="fp-label">{t('px_lim', { axis: A })}</span>
      <span className="fp-lim-steps">
        <Stepper value={draft[0]} min={-1e9} max={1e9} step={step} width={52} ariaLabel={t('px_lim_lo', { axis: A })} onChange={(v) => set(0, v)} />
        <Stepper value={draft[1]} min={-1e9} max={1e9} step={step} width={52} ariaLabel={t('px_lim_hi', { axis: A })} onChange={(v) => set(1, v)} />
      </span>
      <button type="button" className="vbtn fp-auto" title={t('px_auto_tip', { axis: A })} onClick={onAuto}><Icon name="fit" size={13} /><span>{t('px_auto')}</span></button>
    </div>
  );
}

const round = (x) => (Number.isFinite(x) ? Number(Number(x).toPrecision(6)) : x);

export function FigureProps({ runCode }) {
  useLanguage();
  const ctl = useFigureController();
  const fig = ctl ? ctl.figure() : null;
  const ax = ctl && fig ? ctl.targetAxes() : null;
  if (!fig || !ax) {
    return <div className="pane fp-pane"><div className="pane-empty small muted"><Icon name="figure" size={14} />{t('px_no_figure')}</div></div>;
  }
  const p = ax.props || {};
  const polar = p.Kind === 'polar' || ax.type === 'polaraxes';
  const is3d = !!p.Is3D;
  const run = (code) => {
    // gca is the axes this pane shows
    try { ctl.post({ type: 'graphics.currentAxes', id: ax.id }); } catch { /* engine gone */ }
    return runCode(code);
  };
  const lim = (k) => (Array.isArray(p[k]) && p[k].length >= 2 ? [round(p[k][0]), round(p[k][1])] : null);
  const legendOn = !!(p.Legend && p.Legend.props && p.Legend.props.Visible !== false);
  const cmap = colormapNameOf(p.Colormap);
  const lw = firstLineWidth(ax);
  const key = `${fig.id}:${ax.id}`;
  return (
    <div className="pane fp-pane" data-axes={ax.id}>
      <div className="pane-tools fp-target"><Icon name="figure" size={13} /><span className="small ellipsis">{t('px_fp_target', { n: fig.props.Number ?? fig.id })}{fig.props.Name ? ` — ${fig.props.Name}` : ''}</span></div>
      <div className="pane-scroll fp-scroll">
        <div className="fp-section small">{t('px_fp_labels')}</div>
        <TextProp key={`t${key}`} id={`fp-title-${key}`} label={t('px_title')} value={textOf(p.Title)} onApply={(v) => run(`title(gca, ${mQuote(v)})`)} />
        {!polar && <TextProp key={`x${key}`} id={`fp-x-${key}`} label={t('px_xlabel')} value={textOf(p.XLabel)} onApply={(v) => run(`xlabel(gca, ${mQuote(v)})`)} />}
        {!polar && <TextProp key={`y${key}`} id={`fp-y-${key}`} label={t('px_ylabel')} value={textOf(p.YLabel)} onApply={(v) => run(`ylabel(gca, ${mQuote(v)})`)} />}
        {!polar && is3d && <TextProp key={`z${key}`} id={`fp-z-${key}`} label={t('px_zlabel')} value={textOf(p.ZLabel)} onApply={(v) => run(`zlabel(gca, ${mQuote(v)})`)} />}
        {!polar && (
          <>
            <div className="fp-section small">{t('px_fp_limits')}</div>
            {['x', 'y', ...(is3d ? ['z'] : [])].map((a) => (
              <LimitProp key={`${a}${key}`} axis={a} lim={lim(`${a.toUpperCase()}Lim`)} onApply={(v) => run(`${a}lim(gca, [${v[0]} ${v[1]}])`)} onAuto={() => run(`${a}lim(gca, 'auto')`)} />
            ))}
          </>
        )}
        <div className="fp-section small">{t('px_fp_look')}</div>
        <div className="fp-toggles">
          {!polar && <Toggle checked={!!(p.XGrid || p.YGrid)} icon="grid" label={t('px_grid')} onChange={(on) => run(`grid(gca, '${on ? 'on' : 'off'}')`)} />}
          {!polar && <Toggle checked={!!p.Box} icon="layout" label={t('px_box')} onChange={(on) => run(`box(gca, '${on ? 'on' : 'off'}')`)} />}
          <Toggle checked={legendOn} icon="legend" label={t('px_legend')} onChange={(on) => run(on ? 'legend(gca, \'show\')' : 'legend(gca, \'off\')')} />
        </div>
        <div className="fp-row">
          <span className="fp-label">{t('px_colormap')}</span>
          <IconSelect value={cmap} options={CMAP_OPTIONS} placeholder={cmap || '—'} ariaLabel={t('px_colormap')} title={t('px_colormap')} icon="palette" onChange={(name) => run(`colormap(gca, ${mQuote(name)})`)} />
        </div>
        <div className="fp-row">
          <span className="fp-label">{t('px_linewidth')}</span>
          <Stepper value={lw} min={0.5} max={10} step={0.5} width={52} ariaLabel={t('px_linewidth')} onChange={(w) => run(`set(findobj(gca, 'Type', 'line'), 'LineWidth', ${w})`)} />
        </div>
      </div>
    </div>
  );
}
