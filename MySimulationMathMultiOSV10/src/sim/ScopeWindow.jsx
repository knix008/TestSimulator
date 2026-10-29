// A floating scope window inside the editor: one axis per input (or all
// overlaid), autoscale, fit, two data cursors, legend, follow. Drawn on a
// Canvas 2D from the samples the engine streams with 'sim.scope'.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SimIcon } from './icons';
import { tr } from './i18n';
import { niceStep } from './render';

const COLORS = ['#f5c451', '#4cc9f0', '#ff6b6b', '#4ade80', '#c084fc', '#fb923c', '#22d3ee', '#f472b6'];

function niceTicks(lo, hi, px) {
  if (!(hi > lo)) { hi = lo + 1; }
  const step = niceStep((hi - lo) / Math.max(3, Math.floor(px / 32)));
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
const fmt = (x) => { if (!Number.isFinite(x)) return String(x); const a = Math.abs(x); if (a !== 0 && (a >= 1e5 || a < 1e-3)) return x.toExponential(2); return String(Number(x.toPrecision(5))); };

/** Index of the sample nearest to time tt (t sorted). */
function nearest(t, tt) {
  let lo = 0, hi = t.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= tt) lo = m; else hi = m; }
  return Math.abs(t[lo] - tt) <= Math.abs(t[hi] - tt) ? lo : hi;
}

export function ScopeWindow({ block, store, tick, lang, status, onClose, index = 0, colors }) {
  const p = block.params || {};
  const xy = block.type === 'XYGraph';
  const [pos, setPos] = useState({ x: 60 + index * 28, y: 50 + index * 28, w: 520, h: 340 });
  const [auto, setAuto] = useState(String(p.AutoScale || 'on') !== 'off');
  const [overlay, setOverlay] = useState(String(p.Layout || 'separate') === 'overlay');
  const [legend, setLegend] = useState(String(p.Legend || 'off') === 'on');
  const [cursors, setCursors] = useState(null); // [t1, t2]
  const [follow, setFollow] = useState(true);
  const [fitBox, setFitBox] = useState(null); // frozen y ranges after "fit"
  const canvas = useRef(null);
  const layout = useRef(null);
  const drag = useRef(null);
  const rootEl = useRef(null);
  // the first placement fits inside the editor canvas (a short pane must not clip the plot)
  useLayoutEffect(() => {
    const host = rootEl.current && rootEl.current.parentElement; if (!host) return;
    const W = host.clientWidth, H = host.clientHeight;
    setPos((p) => {
      const w = Math.max(260, Math.min(p.w, W - 24)), h = Math.max(180, Math.min(p.h, H - 16));
      const x = Math.max(0, Math.min(p.x, W - w - 8)), y = Math.max(0, Math.min(p.y, H - h - 8));
      return x === p.x && y === p.y && w === p.w && h === p.h ? p : { x, y, w, h };
    });
  }, []);

  // ----- drawing
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const W = c.clientWidth, H = c.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, W * dpr); c.height = Math.max(1, H * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = '#0b0f14', axisCol = '#8a96a8', gridCol = 'rgba(160,175,195,0.16)', text = '#cfd8e3';
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const data = store || { t: [], series: [] };
    const t = data.t || [];
    const series = (data.series || []).filter(Boolean);
    ctx.font = '11px "Segoe UI", sans-serif';
    if (!t.length || !series.length) {
      ctx.fillStyle = text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tr(lang, 'noData'), W / 2, H / 2);
      layout.current = null;
      return;
    }
    const L = 52, R = 12, T = 10, B = 24;
    // time range
    let t0 = t[0], t1 = t[t.length - 1];
    const range = Number(p.TimeRange);
    if (Number.isFinite(range) && range > 0 && follow) t0 = Math.max(t0, t1 - range);
    else if (status && Number.isFinite(status.stop) && status.stop > t1 && status.stop - (status.start || 0) < 1e9 && follow) t1 = status.stop;
    if (status && Number.isFinite(status.start) && !(Number.isFinite(range) && range > 0)) t0 = Math.min(t0, status.start);
    if (!(t1 > t0)) t1 = t0 + 1;
    const i0 = Math.max(0, nearest(t, t0) - 1);
    if (xy) {
      const sx = series[0], sy = series[1] || series[0];
      const xs = [], ys = [];
      for (let k = 0; k < t.length; k++) { xs.push(sx.data[k * sx.width]); ys.push(sy.data[k * sy.width + (sy === sx && sx.width > 1 ? 1 : 0)]); }
      let xlo = Math.min(...xs), xhi = Math.max(...xs), ylo = Math.min(...ys), yhi = Math.max(...ys);
      if (!auto) { xlo = Number(p.XMin ?? -1); xhi = Number(p.XMax ?? 1); ylo = Number(p.YMin ?? -1); yhi = Number(p.YMax ?? 1); }
      if (!(xhi > xlo)) { xlo -= 1; xhi += 1; } if (!(yhi > ylo)) { ylo -= 1; yhi += 1; }
      const px = (x) => L + (x - xlo) / (xhi - xlo) * (W - L - R), py = (y) => H - B - (y - ylo) / (yhi - ylo) * (H - T - B);
      drawAxes(ctx, { L, T, W: W - L - R, H: H - T - B }, niceTicks(xlo, xhi, W - L - R), niceTicks(ylo, yhi, H - T - B), px, py, axisCol, gridCol, text);
      ctx.strokeStyle = COLORS[0]; ctx.lineWidth = 1.5; ctx.beginPath();
      xs.forEach((x, k) => (k ? ctx.lineTo(px(x), py(ys[k])) : ctx.moveTo(px(x), py(ys[k])))); ctx.stroke();
      layout.current = null;
      return;
    }
    const groups = overlay ? [series] : series.map((s) => [s]);
    const n = groups.length;
    const gap = 8;
    const hEach = (H - T - B - gap * (n - 1)) / n;
    const px = (tt) => L + (tt - t0) / (t1 - t0) * (W - L - R);
    const axes = [];
    groups.forEach((grp, gi) => {
      const top = T + gi * (hEach + gap);
      let lo = Infinity, hi = -Infinity;
      if (auto && !fitBox) {
        for (const s of grp) for (let k = i0; k < t.length; k++) for (let j = 0; j < s.width; j++) { const v = s.data[k * s.width + j]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
        if (!(hi >= lo)) { lo = -1; hi = 1; }
        if (hi === lo) { lo -= 1; hi += 1; }
        const m = (hi - lo) * 0.06; lo -= m; hi += m;
      } else if (fitBox) { [lo, hi] = fitBox[gi] || [-1, 1]; }
      else { lo = Number(p.YMin ?? -1); hi = Number(p.YMax ?? 1); if (!(hi > lo)) { lo = -1; hi = 1; } }
      const py = (y) => top + hEach - (y - lo) / (hi - lo) * hEach;
      drawAxes(ctx, { L, T: top, W: W - L - R, H: hEach }, niceTicks(t0, t1, W - L - R), niceTicks(lo, hi, hEach), px, py, axisCol, gridCol, text, gi === n - 1);
      ctx.save();
      ctx.beginPath(); ctx.rect(L, top, W - L - R, hEach); ctx.clip();
      let ci = 0;
      const legendItems = [];
      for (const s of grp) {
        for (let j = 0; j < s.width; j++) {
          const col = COLORS[(overlay ? ci : j) % COLORS.length]; ci++;
          ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath();
          let started = false;
          const stepK = Math.max(1, Math.floor((t.length - i0) / (W * 2)));
          for (let k = i0; k < t.length; k += stepK) {
            const v = s.data[k * s.width + j];
            if (!Number.isFinite(v)) { started = false; continue; }
            const X = px(t[k]), Y = py(v);
            if (started) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); started = true; }
          }
          ctx.stroke();
          legendItems.push({ col, label: `${tr(lang, 'scope') === 'Scope' ? 'In' : '입력 '}${s.port}${s.width > 1 ? `(${j + 1})` : ''}` });
        }
      }
      ctx.restore();
      if (legend) {
        ctx.font = '10px "Segoe UI", sans-serif';
        const lw = Math.max(...legendItems.map((it) => ctx.measureText(it.label).width)) + 30;
        const lx = W - R - lw - 4, ly = top + 4;
        ctx.fillStyle = 'rgba(20,26,34,0.85)'; ctx.fillRect(lx, ly, lw, legendItems.length * 14 + 6);
        ctx.strokeStyle = gridCol; ctx.strokeRect(lx + 0.5, ly + 0.5, lw, legendItems.length * 14 + 6);
        legendItems.forEach((it, k) => {
          ctx.strokeStyle = it.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx + 5, ly + 10 + k * 14); ctx.lineTo(lx + 20, ly + 10 + k * 14); ctx.stroke();
          ctx.fillStyle = text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(it.label, lx + 24, ly + 10 + k * 14);
        });
      }
      axes.push({ top, h: hEach, lo, hi, grp });
    });
    if (cursors) {
      cursors.forEach((ct, k) => {
        const X = px(ct);
        ctx.strokeStyle = k ? '#ff9f43' : '#54a0ff'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(X, T); ctx.lineTo(X, H - B); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle; ctx.font = '10px "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(`t${k + 1}=${fmt(ct)}`, X + 3, T + 1);
      });
    }
    layout.current = { L, R, W, t0, t1, axes, px };
  });

  const fitNow = () => {
    const data = store; if (!data || !data.t || !data.t.length) return;
    const groups = overlay ? [data.series.filter(Boolean)] : data.series.filter(Boolean).map((s) => [s]);
    setFitBox(groups.map((grp) => {
      let lo = Infinity, hi = -Infinity;
      for (const s of grp) for (const v of s.data) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
      if (!(hi >= lo)) return [-1, 1];
      if (hi === lo) return [lo - 1, hi + 1];
      const m = (hi - lo) * 0.06; return [lo - m, hi + m];
    }));
  };
  useEffect(() => { if (auto) setFitBox(null); }, [auto]);

  // values at the cursors
  let cursorRows = null;
  if (cursors && store && store.t && store.t.length) {
    const t = store.t;
    cursorRows = [];
    for (const s of store.series.filter(Boolean)) for (let j = 0; j < s.width; j++) {
      const v = cursors.map((ct) => { const k = nearest(t, ct); return k >= 0 ? s.data[k * s.width + j] : NaN; });
      cursorRows.push({ label: `${s.port}${s.width > 1 ? `(${j + 1})` : ''}`, v });
    }
  }

  // ----- window drag / resize
  const startDrag = (kind) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    drag.current = { kind, sx: e.clientX, sy: e.clientY, p: { ...pos } };
    const move = (ev) => {
      const d = drag.current; if (!d) return;
      const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
      if (d.kind === 'move') setPos({ ...d.p, x: Math.max(0, d.p.x + dx), y: Math.max(0, d.p.y + dy) });
      else setPos({ ...d.p, w: Math.max(260, d.p.w + dx), h: Math.max(180, d.p.h + dy) });
    };
    const up = () => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // cursor drag on the plot
  const onPlotDown = (e) => {
    if (!cursors || !layout.current) return;
    const r = canvas.current.getBoundingClientRect();
    const lay = layout.current;
    const toT = (cx) => lay.t0 + (cx - r.left - lay.L) / (lay.W - lay.L - lay.R) * (lay.t1 - lay.t0);
    const tt = toT(e.clientX);
    const which = Math.abs(tt - cursors[0]) <= Math.abs(tt - cursors[1]) ? 0 : 1;
    const set = (cx) => setCursors((c) => { const n = [...c]; n[which] = Math.max(lay.t0, Math.min(lay.t1, toT(cx))); return n; });
    set(e.clientX);
    const move = (ev) => set(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const toggleCursors = () => {
    if (cursors) { setCursors(null); return; }
    const t = (store && store.t) || [];
    const a = t.length ? t[0] : 0, b = t.length ? t[t.length - 1] : 1;
    setCursors([a + (b - a) * 0.3, a + (b - a) * 0.7]);
  };

  const title = (p.Title && String(p.Title).trim()) || block.name;
  return (
    <div ref={rootEl} className="sim-scope" data-block={block.id} style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="sim-scope-head" onPointerDown={startDrag('move')}>
        <SimIcon name="scope" size={14} /><span className="sim-scope-title ellipsis">{title}</span>
        <span className="spacer" />
        <button type="button" className={`sim-mini ${auto ? 'on' : ''}`} title={tr(lang, 'autoscale')} onPointerDown={(e) => e.stopPropagation()} onClick={() => setAuto(!auto)}><SimIcon name="autoscale" size={13} /><span>{tr(lang, 'autoscale')}</span></button>
        <button type="button" className="sim-mini" title={tr(lang, 'fitData')} onPointerDown={(e) => e.stopPropagation()} onClick={fitNow}><SimIcon name="fit" size={13} /><span>{tr(lang, 'fitData')}</span></button>
        {!xy && <button type="button" className={`sim-mini ${overlay ? 'on' : ''}`} title={tr(lang, 'overlay')} onPointerDown={(e) => e.stopPropagation()} onClick={() => { setOverlay(!overlay); setFitBox(null); }}><SimIcon name="overlay" size={13} /><span>{tr(lang, 'overlay')}</span></button>}
        {!xy && <button type="button" className={`sim-mini ${cursors ? 'on' : ''}`} title={tr(lang, 'cursors')} onPointerDown={(e) => e.stopPropagation()} onClick={toggleCursors}><SimIcon name="cursor" size={13} /><span>{tr(lang, 'cursors')}</span></button>}
        {!xy && <button type="button" className={`sim-mini ${legend ? 'on' : ''}`} title={tr(lang, 'legend')} onPointerDown={(e) => e.stopPropagation()} onClick={() => setLegend(!legend)}><SimIcon name="legend" size={13} /><span>{tr(lang, 'legend')}</span></button>}
        {!xy && <button type="button" className={`sim-mini ${follow ? 'on' : ''}`} title={tr(lang, 'follow')} onPointerDown={(e) => e.stopPropagation()} onClick={() => setFollow(!follow)}><SimIcon name="follow" size={13} /><span>{tr(lang, 'follow')}</span></button>}
        <button type="button" className="sim-mini sim-x" title={tr(lang, 'close')} onPointerDown={(e) => e.stopPropagation()} onClick={onClose}><SimIcon name="close" size={13} /></button>
      </div>
      <canvas ref={canvas} className="sim-scope-canvas" data-tick={tick} onPointerDown={onPlotDown} />
      {cursorRows && (
        <div className="sim-scope-cursors">
          <table><thead><tr><th /><th>t1 = {fmt(cursors[0])}</th><th>t2 = {fmt(cursors[1])}</th><th>{tr(lang, 'delta')} = {fmt(cursors[1] - cursors[0])}</th></tr></thead>
            <tbody>{cursorRows.slice(0, 6).map((r) => <tr key={r.label}><td>{r.label}</td><td>{fmt(r.v[0])}</td><td>{fmt(r.v[1])}</td><td>{fmt(r.v[1] - r.v[0])}</td></tr>)}</tbody></table>
        </div>
      )}
      <div className="sim-scope-grip" onPointerDown={startDrag('size')} />
    </div>
  );
}

function drawAxes(ctx, box, xt, yt, px, py, axisCol, gridCol, text, xlabels = true) {
  ctx.save();
  ctx.strokeStyle = gridCol; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of xt) { const X = Math.round(px(x)) + 0.5; if (X < box.L - 0.5 || X > box.L + box.W + 0.5) continue; ctx.moveTo(X, box.T); ctx.lineTo(X, box.T + box.H); }
  for (const y of yt) { const Y = Math.round(py(y)) + 0.5; if (Y < box.T - 0.5 || Y > box.T + box.H + 0.5) continue; ctx.moveTo(box.L, Y); ctx.lineTo(box.L + box.W, Y); }
  ctx.stroke();
  ctx.strokeStyle = axisCol;
  ctx.strokeRect(box.L + 0.5, box.T + 0.5, box.W, box.H);
  ctx.fillStyle = text; ctx.font = '10px "Segoe UI", sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const y of yt) { const Y = py(y); if (Y < box.T - 1 || Y > box.T + box.H + 1) continue; ctx.fillText(fmt(y), box.L - 4, Y); }
  if (xlabels) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const x of xt) { const X = px(x); if (X < box.L - 1 || X > box.L + box.W + 1) continue; ctx.fillText(fmt(x), X, box.T + box.H + 4); }
  }
  ctx.restore();
}
