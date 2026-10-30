// A model for paper and documents: the whole diagram of the shown system
// (not the visible part of the canvas: no grid, rulers or selection) and a
// plot of every scope that holds results from the last run. Each image is
// { role: 'diagram' | 'scope', caption, width, height (CSS px), render({ scale, transparent }) → canvas };
// print (src/print/sources.js), document export and image saving all use them.
import { systemAt } from '../../core/sim/model.js';
import { lineGeometry, drawLines, drawBlock } from './render';

const SCOPE_TYPES = new Set(['Scope', 'FloatingScope', 'XYGraph']);
// print colours: dark lines and text, white blocks (a block's own colours are kept)
const PAPER = {
  fg: '#1f2933', block: '#ffffff', accent: '#1c7ed6', muted: '#52606d', strong: '#1f2933', danger: '#c92a2a', ok: '#2b8a3e',
  bg: 'rgba(0,0,0,0)', canvas: 'rgba(0,0,0,0)', grid: 'rgba(0,0,0,0)', gridMajor: 'rgba(0,0,0,0)', panel: '#ffffff', elev: '#ffffff', ruler: '#ffffff', rulerText: '#52606d', border: '#1f2933',
};
const SERIES = ['#1c7ed6', '#e8590c', '#2f9e44', '#c2255c', '#7048e8', '#0c8599', '#f08c00', '#e03131'];

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
function paperBackground(ctx, w, h, transparent) {
  if (transparent) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.restore();
}

/** The diagram's extent in model units, with a margin: { x0, y0, x1, y1 }. */
function bounds(sys, geo, pad = 24) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const b of sys.blocks) { grow(b.x, b.y); grow(b.x + b.w, b.y + b.h + (b.showName === false ? 0 : 16)); }
  for (const g of geo) for (const p of g.pts || []) grow(p[0], p[1]);
  for (const n of sys.notes || []) grow(n.x, n.y);
  if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = 200; y1 = 100; }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

function diagramImage(model, crumbs, title) {
  const sys = systemAt(model, crumbs) || model.root;
  const byId = new Map(sys.blocks.map((b) => [b.id, b]));
  const geo = lineGeometry(sys, byId);
  const B = bounds(sys, geo);
  const w = B.x1 - B.x0, h = B.y1 - B.y0;
  return {
    role: 'diagram', caption: title, width: Math.round(w), height: Math.round(h),
    render({ scale = 3, transparent = false } = {}) {
      const c = newCanvas(w * scale, h * scale);
      const ctx = c.getContext('2d');
      paperBackground(ctx, c.width, c.height, transparent);
      ctx.setTransform(scale, 0, 0, scale, -B.x0 * scale, -B.y0 * scale);
      drawLines(ctx, geo, { colors: PAPER, selected: new Set() });
      for (const b of sys.blocks) drawBlock(ctx, b, { colors: PAPER, selected: false, zoom: scale, values: null, error: false, hotHandle: -1 });
      for (const n of sys.notes || []) { ctx.fillStyle = PAPER.muted; ctx.font = '12px "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; String(n.text || '').split('\n').forEach((l, i) => ctx.fillText(l, n.x, n.y + i * 15)); }
      return c;
    },
  };
}

const fmt = (x) => { if (!Number.isFinite(x)) return String(x); const a = Math.abs(x); if (a !== 0 && (a >= 1e5 || a < 1e-3)) return x.toExponential(2); return String(Number(x.toPrecision(4))); };
function ticks(lo, hi, n = 6) {
  if (!(hi > lo)) { const c = Number.isFinite(lo) ? lo : 0; lo = c - 1; hi = c + 1; }
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f >= 5 ? 10 : f >= 2 ? 5 : f >= 1 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { lo, hi, list: out };
}

/** One axes box: grid, frame, tick labels, then the polylines [{ xs, ys, color }]. */
function plotBox(ctx, box, xs0, xs1, ys0, ys1, lines, { xlabel = '', ylabel = '', xTicks = true } = {}) {
  const xt = ticks(xs0, xs1), yt = ticks(ys0, ys1, 4);
  const pad = (yt.hi - yt.lo) * 0.06;
  const ylo = yt.lo - pad, yhi = yt.hi + pad;
  const px = (x) => box.x + ((x - xt.lo) / (xt.hi - xt.lo || 1)) * box.w;
  const py = (y) => box.y + box.h - ((y - ylo) / (yhi - ylo || 1)) * box.h;
  ctx.save();
  ctx.strokeStyle = '#d5dbe1'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of xt.list) { const X = Math.round(px(x)) + 0.5; ctx.moveTo(X, box.y); ctx.lineTo(X, box.y + box.h); }
  for (const y of yt.list) { const Y = Math.round(py(y)) + 0.5; if (Y >= box.y && Y <= box.y + box.h) { ctx.moveTo(box.x, Y); ctx.lineTo(box.x + box.w, Y); } }
  ctx.stroke();
  ctx.strokeStyle = '#52606d'; ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h);
  ctx.fillStyle = '#1f2933'; ctx.font = '12px "Segoe UI", sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const y of yt.list) { const Y = py(y); if (Y >= box.y - 1 && Y <= box.y + box.h + 1) ctx.fillText(fmt(y), box.x - 6, Y); }
  if (xTicks) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const x of xt.list) ctx.fillText(fmt(x), px(x), box.y + box.h + 5); }
  if (xlabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(xlabel, box.x + box.w / 2, box.y + box.h + (xTicks ? 22 : 6)); }
  if (ylabel) { ctx.save(); ctx.translate(box.x - 52, box.y + box.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ylabel, 0, 0); ctx.restore(); }
  ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
  ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
  for (const l of lines) {
    ctx.strokeStyle = l.color;
    ctx.beginPath();
    let on = false;
    for (let i = 0; i < l.xs.length; i++) {
      const X = px(l.xs[i]), Y = py(l.ys[i]);
      if (!Number.isFinite(X) || !Number.isFinite(Y)) { on = false; continue; }
      if (on) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); on = true; }
    }
    ctx.stroke();
  }
  ctx.restore();
}

const range = (arr) => { let lo = Infinity, hi = -Infinity; for (const v of arr) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };

/** The plot of a scope's samples: one axes per input (time on x), or x–y for an XY graph. */
function scopeImage(block, st, path) {
  const W = 760;
  const ports = (st.series || []).filter(Boolean);
  const xy = block.type === 'XYGraph';
  const H = xy ? 520 : Math.max(240, 60 + ports.length * 170);
  return {
    role: 'scope', caption: path, width: W, height: H,
    render({ scale = 3, transparent = false } = {}) {
      const c = newCanvas(W * scale, H * scale);
      const ctx = c.getContext('2d');
      paperBackground(ctx, c.width, c.height, transparent);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = '#1f2933'; ctx.font = '600 14px "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(block.name, 70, 10);
      const t = st.t || [];
      if (xy) {
        const xs = [], ys = [];
        const a = ports[0], b = ports[1];
        if (a && b) for (let i = 0; i < t.length; i++) { xs.push(a.data[i * a.width]); ys.push(b.data[i * b.width]); }
        const [x0, x1] = range(xs), [y0, y1] = range(ys);
        plotBox(ctx, { x: 70, y: 36, w: W - 100, h: H - 90 }, x0, x1, y0, y1, [{ xs, ys, color: SERIES[0] }], { xlabel: 'x', ylabel: 'y' });
        return c;
      }
      const [t0, t1] = range(t);
      const top = 36, gap = 34, each = (H - top - 40 - gap * (ports.length - 1)) / Math.max(1, ports.length);
      ports.forEach((s, k) => {
        const lines = [];
        for (let j = 0; j < s.width; j++) {
          const ys = new Array(t.length);
          for (let i = 0; i < t.length; i++) ys[i] = s.data[i * s.width + j];
          lines.push({ xs: t, ys, color: SERIES[(k + j) % SERIES.length] });
        }
        const [y0, y1] = range(lines.flatMap((l) => l.ys));
        const last = k === ports.length - 1;
        plotBox(ctx, { x: 70, y: top + k * (each + gap), w: W - 100, h: each }, t0, t1, y0, y1, lines, { xlabel: last ? 't (s)' : '', ylabel: ports.length > 1 ? `in ${s.port}` : '', xTicks: true });
      });
      return c;
    },
  };
}

/** Scope blocks of the model (every level) that hold results: [{ block, path }]. */
function scopesWithData(model, scopes) {
  const out = [];
  const walk = (sys, path) => {
    for (const b of sys.blocks) {
      const st = scopes && scopes.get(b.id);
      if (SCOPE_TYPES.has(b.type) && st && st.t && st.t.length > 1 && (st.series || []).some(Boolean)) out.push({ block: b, st, path: `${path}/${b.name}` });
      if (b.system) walk(b.system, `${path}/${b.name}`);
    }
  };
  walk(model.root, model.name);
  return out;
}

/** The print images of a model editor (editorApi.js api): the diagram, then the scopes with results. */
export function modelPrintImages(api) {
  const out = [diagramImage(api.model, api.crumbs || [], api.name)];
  for (const s of scopesWithData(api.model, api.scopes)) out.push(scopeImage(s.block, s.st, s.path));
  return out;
}
