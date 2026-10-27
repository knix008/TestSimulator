// Computed graphics data: data extents, automatic axes limits / ticks,
// subplot and tile layout, and derived geometry (bars, areas, histograms,
// quiver arrows, contours, stairs). Pure ESM.
import { autoLimits, ticksFor, tickLabels, maxTicksFor, dateTicks, linearTicks } from './ticks.js';
import { autoLevels, contourLines, contourBands, contourMatrix } from './contour.js';
import { G, isAxesType, figureOf } from './model.js';

const finite = (x) => x === x && x !== Infinity && x !== -Infinity;

class Ext {
  constructor() { this.x = [Infinity, -Infinity]; this.y = [Infinity, -Infinity]; this.z = [Infinity, -Infinity]; this.c = [Infinity, -Infinity]; }
  add(k, v, pos = false) { if (finite(v) && (!pos || v > 0)) { const r = this[k]; if (v < r[0]) r[0] = v; if (v > r[1]) r[1] = v; } }
  addAll(k, arr, pos) { if (!arr) return; for (let i = 0; i < arr.length; i++) this.add(k, arr[i], pos); }
}

const dataOf = (M) => (M ? M.data : null);

/** Default X data (1..n) for a Y matrix stored without X. */
export function implicitX(M) {
  if (!M) return [];
  const n = M.dims[0] === 1 ? M.dims[1] : M.dims[0];
  return Array.from({ length: n }, (_, i) => i + 1);
}

/** Adds the extent of one object to ext (log flags → positive only). */
export function addExtent(st, o, ext, logs, derived) {
  if (o.props.Visible === false && o.type !== 'hggroup') return;
  const p = o.props;
  const lx = logs.x, ly = logs.y, lz = logs.z;
  switch (o.type) {
    case 'line': case 'animatedline': case 'stair': case 'stem':
      ext.addAll('x', dataOf(p.XData), lx); ext.addAll('y', dataOf(p.YData), ly); ext.addAll('z', dataOf(p.ZData), lz);
      if (o.type === 'stem') { if (p.ZData && p.ZData.data.length) ext.add('z', p.BaseValue, lz); else ext.add('y', p.BaseValue, ly); }
      break;
    case 'scatter':
      ext.addAll('x', dataOf(p.XData), lx); ext.addAll('y', dataOf(p.YData), ly); ext.addAll('z', dataOf(p.ZData), lz);
      if (p.CData && p.CData.dims[1] !== 3) ext.addAll('c', p.CData.data);
      break;
    case 'errorbar': {
      const x = dataOf(p.XData), y = dataOf(p.YData);
      if (!x || !y) break;
      for (let i = 0; i < y.length; i++) {
        const yn = p.YNegativeDelta ? p.YNegativeDelta.data[i] || 0 : 0, yp = p.YPositiveDelta ? p.YPositiveDelta.data[i] || 0 : 0;
        const xn = p.XNegativeDelta ? p.XNegativeDelta.data[i] || 0 : 0, xp = p.XPositiveDelta ? p.XPositiveDelta.data[i] || 0 : 0;
        ext.add('x', x[i] - xn, lx); ext.add('x', x[i] + xp, lx); ext.add('y', y[i] - yn, ly); ext.add('y', y[i] + yp, ly);
      }
      break;
    }
    case 'surface': {
      const Z = p.ZData;
      if (!Z) break;
      ext.addAll('x', dataOf(p.XData), lx); ext.addAll('y', dataOf(p.YData), ly); ext.addAll('z', Z.data, lz);
      if (p.CData && p.CData.dims.length < 3) ext.addAll('c', p.CData.data);
      else if (!p.CData) ext.addAll('c', Z.data);
      break;
    }
    case 'patch': {
      const V = p.Vertices;
      if (V) {
        const [m, n] = V.dims;
        for (let i = 0; i < m; i++) { ext.add('x', V.data[i], lx); ext.add('y', V.data[i + m], ly); if (n > 2) ext.add('z', V.data[i + 2 * m], lz); }
      }
      const C = p.FaceVertexCData;
      if (C && C.dims[1] !== 3) ext.addAll('c', C.data);
      break;
    }
    case 'image': {
      const C = p.CData;
      if (!C) break;
      const [m, n] = C.dims;
      const xd = p.XData, yd = p.YData;
      const x1 = xd[0], x2 = xd.length > 1 ? xd[xd.length - 1] : xd[0] + n - 1;
      const y1 = yd[0], y2 = yd.length > 1 ? yd[yd.length - 1] : yd[0] + m - 1;
      const hx = n > 1 ? (x2 - x1) / (n - 1) / 2 : 0.5, hy = m > 1 ? (y2 - y1) / (m - 1) / 2 : 0.5;
      ext.add('x', Math.min(x1, x2) - Math.abs(hx)); ext.add('x', Math.max(x1, x2) + Math.abs(hx));
      ext.add('y', Math.min(y1, y2) - Math.abs(hy)); ext.add('y', Math.max(y1, y2) + Math.abs(hy));
      if (p.CDataMapping === 'scaled' && C.dims.length < 3) ext.addAll('c', C.data);
      break;
    }
    case 'rectangle': {
      const [x, y, w, h] = p.Position;
      ext.add('x', x, lx); ext.add('x', x + w, lx); ext.add('y', y, ly); ext.add('y', y + h, ly);
      break;
    }
    case 'quiver': {
      const q = derived.get(o.id) || quiverGeometry(o);
      const s = q.Segments;
      for (let i = 0; i < s.length; i += 6) { ext.add('x', s[i], lx); ext.add('y', s[i + 1], ly); ext.add('x', s[i + 3], lx); ext.add('y', s[i + 4], ly); if (q.is3d) { ext.add('z', s[i + 2], lz); ext.add('z', s[i + 5], lz); } }
      break;
    }
    case 'contour': {
      ext.addAll('x', dataOf(p.XData), lx); ext.addAll('y', dataOf(p.YData), ly);
      if (p.Is3D) ext.addAll('z', dataOf(p.ZData), lz);
      const lv = contourLevels(o);
      if (lv.length) { ext.add('c', lv[0]); ext.add('c', lv[lv.length - 1]); }
      if (p.Fill && p.ZData) ext.addAll('c', p.ZData.data);
      break;
    }
    case 'bar': case 'histogram': case 'area': {
      const r = derived.get(o.id);
      if (!r) break;
      if (r.Rects) for (const q of r.Rects) { ext.add('x', q[0], lx); ext.add('x', q[2], lx); ext.add('y', q[1], ly); ext.add('y', q[3], ly); }
      if (r.Upper) { ext.addAll('x', r.X, lx); ext.addAll('y', r.Upper, ly); ext.addAll('y', r.Lower, ly); }
      break;
    }
    case 'text': case 'light': break;
    case 'hggroup':
      for (const c of o.children) { const co = st.objs.get(c); if (co) addExtent(st, co, ext, logs, derived); }
      break;
    default: break;
  }
}

// ---------------------------------------------------------------- derived geometry

/** Per-axes derived data for bars / areas / histograms: Map id → {Rects | X, Lower, Upper}. */
export function deriveAxes(st, ax) {
  const out = new Map();
  const kids = ax.children.map((c) => st.objs.get(c)).filter(Boolean).reverse(); // creation order
  const flat = [];
  const walk = (list) => { for (const o of list) { if (o.type === 'hggroup') walk(o.children.map((c) => st.objs.get(c)).filter(Boolean).reverse()); else flat.push(o); } };
  walk(kids);
  // bars, grouped by creation call
  const groups = new Map();
  for (const o of flat) if (o.type === 'bar') { const g = o.internal.group ?? o.id; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(o); }
  for (const list of groups.values()) layoutBars(list, out);
  const areaGroups = new Map();
  for (const o of flat) if (o.type === 'area') { const g = o.internal.group ?? o.id; if (!areaGroups.has(g)) areaGroups.set(g, []); areaGroups.get(g).push(o); }
  for (const list of areaGroups.values()) layoutAreas(list, out);
  for (const o of flat) {
    if (o.type === 'histogram') out.set(o.id, { Rects: histRects(o) });
    else if (o.type === 'quiver') out.set(o.id, quiverGeometry(o));
  }
  return out;
}

function minSpacing(x) {
  const s = Array.from(x).filter(finite).sort((a, b) => a - b);
  let d = Infinity;
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > 0) d = Math.min(d, s[i] - s[i - 1]);
  return finite(d) ? d : 1;
}

function layoutBars(list, out) {
  const ns = list.length;
  const first = list[0].props;
  const stacked = first.BarLayout === 'stacked';
  const posAcc = new Map(), negAcc = new Map();
  list.forEach((o, k) => {
    const p = o.props;
    const y = p.YData ? p.YData.data : [];
    const x = p.XData && p.XData.data.length === y.length ? p.XData.data : Array.from({ length: y.length }, (_, i) => i + 1);
    const dx = minSpacing(x);
    const rects = [];
    const ends = [];
    for (let i = 0; i < y.length; i++) {
      const v = y[i];
      let x0, x1, y0, y1;
      if (stacked) {
        const w = dx * p.BarWidth;
        x0 = x[i] - w / 2; x1 = x[i] + w / 2;
        const acc = v >= 0 ? posAcc : negAcc;
        const base = acc.has(x[i]) ? acc.get(x[i]) : p.BaseValue;
        y0 = base; y1 = base + (finite(v) ? v : 0);
        acc.set(x[i], y1);
      } else {
        const W = dx * (ns === 1 ? p.BarWidth : Math.min(0.8, ns / (ns + 1.5)) * (p.BarWidth / 0.8));
        const w = W / ns;
        const c = x[i] - W / 2 + w * (k + 0.5);
        x0 = c - w / 2; x1 = c + w / 2;
        y0 = p.BaseValue; y1 = v;
      }
      ends.push([(x0 + x1) / 2, y1]);
      rects.push(p.Horizontal ? [Math.min(y0, y1), x0, Math.max(y0, y1), x1, i] : [x0, Math.min(y0, y1), x1, Math.max(y0, y1), i]);
    }
    out.set(o.id, { Rects: rects.map((r) => (finite(r[1]) && finite(r[3]) ? r : null)).filter(Boolean), Ends: ends });
  });
}

function layoutAreas(list, out) {
  let lower = null;
  for (const o of list) {
    const p = o.props;
    const y = p.YData ? Array.from(p.YData.data) : [];
    const x = p.XData && p.XData.data.length === y.length ? Array.from(p.XData.data) : y.map((_, i) => i + 1);
    const lo = lower || y.map(() => p.BaseValue);
    const up = y.map((v, i) => lo[i] + (finite(v) ? v : 0));
    out.set(o.id, { X: x, Lower: lo, Upper: up });
    lower = up;
  }
}

export function histRects(o) {
  const p = o.props;
  const e = p.BinEdges || [], v = o.internal.values || [];
  const rects = [];
  for (let i = 0; i < v.length && i + 1 < e.length; i++) {
    rects.push(p.Orientation === 'horizontal' ? [0, e[i], v[i], e[i + 1], i] : [e[i], 0, e[i + 1], v[i], i]);
  }
  return rects;
}

/** Quiver shafts / heads: {Segments, Heads, is3d}. */
export function quiverGeometry(o) {
  const p = o.props;
  const X = p.XData ? p.XData.data : [], Y = p.YData ? p.YData.data : [];
  const U = p.UData ? p.UData.data : [], V = p.VData ? p.VData.data : [];
  const Z = p.ZData ? p.ZData.data : null, W = p.WData ? p.WData.data : null;
  const is3d = !!(Z && W && Z.length && W.length);
  const n = Math.min(X.length, Y.length, U.length, V.length);
  let scale = 1;
  if (p.AutoScale && n) {
    let maxLen = 0;
    for (let i = 0; i < n; i++) { const l = Math.hypot(U[i], V[i], is3d ? W[i] : 0); if (finite(l)) maxLen = Math.max(maxLen, l); }
    const xs = [Infinity, -Infinity], ys = [Infinity, -Infinity], zs = [Infinity, -Infinity];
    for (let i = 0; i < n; i++) { xs[0] = Math.min(xs[0], X[i]); xs[1] = Math.max(xs[1], X[i]); ys[0] = Math.min(ys[0], Y[i]); ys[1] = Math.max(ys[1], Y[i]); if (is3d) { zs[0] = Math.min(zs[0], Z[i]); zs[1] = Math.max(zs[1], Z[i]); } }
    const spans = [xs[1] - xs[0], ys[1] - ys[0], is3d ? zs[1] - zs[0] : 0].filter((s) => s > 0);
    let delta;
    if (spans.length >= 2) delta = Math.pow(spans.reduce((a, b) => a * b, 1) / n, 1 / spans.length);
    else if (spans.length === 1) delta = spans[0] / Math.max(1, n - 1);
    else delta = 1;
    if (maxLen > 0) scale = (p.AutoScaleFactor * delta) / maxLen;
  }
  const seg = [], heads = [];
  for (let i = 0; i < n; i++) {
    const u = U[i] * scale, v = V[i] * scale, w = is3d ? W[i] * scale : 0;
    let x0 = X[i], y0 = Y[i], z0 = is3d ? Z[i] : 0;
    if (p.Alignment === 'center') { x0 -= u / 2; y0 -= v / 2; z0 -= w / 2; } else if (p.Alignment === 'head') { x0 -= u; y0 -= v; z0 -= w; }
    const x1 = x0 + u, y1 = y0 + v, z1 = z0 + w;
    if (![x0, y0, x1, y1].every(finite)) continue;
    seg.push(x0, y0, z0, x1, y1, z1);
    if (p.ShowArrowHead) {
      const len = Math.hypot(u, v, w);
      if (len === 0) continue;
      const hl = len * Math.min(1, p.MaxHeadSize) * 0.9;
      const a = (20 * Math.PI) / 180;
      // perpendicular in the xy-plane (or with z for vertical vectors)
      let px = -v, py = u, pz = 0;
      let pl = Math.hypot(px, py, pz);
      if (pl < 1e-12 * len) { px = 1; py = 0; pz = 0; pl = 1; }
      px /= pl; py /= pl; pz /= pl;
      const bx = -u / len, by = -v / len, bz = -w / len;
      for (const sgn of [1, -1]) {
        const hx = x1 + hl * (Math.cos(a) * bx + sgn * Math.sin(a) * px);
        const hy = y1 + hl * (Math.cos(a) * by + sgn * Math.sin(a) * py);
        const hz = z1 + hl * (Math.cos(a) * bz + sgn * Math.sin(a) * pz);
        heads.push(x1, y1, z1, hx, hy, hz);
      }
    }
  }
  return { Segments: seg, Heads: heads, is3d, scale };
}

/** Contour levels of a contour object (LevelList or automatic). */
export function contourLevels(o) {
  const p = o.props;
  if (p.LevelListMode === 'manual' && p.LevelList.length) return p.LevelList.slice().sort((a, b) => a - b);
  if (!p.ZData) return [];
  if (p.LevelStepMode === 'manual' && p.LevelStep > 0) {
    let lo = Infinity, hi = -Infinity;
    for (const v of p.ZData.data) if (finite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const out = [];
    for (let v = Math.ceil(lo / p.LevelStep) * p.LevelStep; v <= hi + 1e-12; v += p.LevelStep) out.push(Number(v.toPrecision(12)));
    return out;
  }
  return autoLevels(p.ZData.data, o.internal.nlevels ?? null);
}

/** Cached contour geometry: {levels, lines, bands, matrix}. */
export function contourGeometry(o) {
  const c = o.internal.contourCache;
  if (c && c.ver === o.ver) return c;
  const p = o.props;
  const Z = p.ZData;
  let res = { ver: o.ver, levels: [], lines: [], bands: [], matrix: { dims: [2, 0], data: new Float64Array(0) } };
  if (Z && Z.dims[0] >= 2 && Z.dims[1] >= 2) {
    const [m, n] = Z.dims;
    const X = p.XData ? p.XData.data : Float64Array.from({ length: n }, (_, j) => j + 1);
    const Y = p.YData ? p.YData.data : Float64Array.from({ length: m }, (_, i) => i + 1);
    const levels = contourLevels(o);
    const lines = contourLines(X, Y, Z.data, m, n, levels);
    const bands = p.Fill ? contourBands(X, Y, Z.data, m, n, levels, p.LevelListMode !== 'manual') : [];
    res = { ver: o.ver, levels, lines, bands, matrix: contourMatrix(lines) };
  }
  o.internal.contourCache = res;
  return res;
}

/** Path of a stairstep plot: [x0,y0,x1,y0,x1,y1,...]. */
export function stairPath(o) {
  const p = o.props;
  const y = p.YData ? p.YData.data : [];
  const x = p.XData && p.XData.data.length === y.length ? p.XData.data : Array.from({ length: y.length }, (_, i) => i + 1);
  const out = [];
  for (let i = 0; i < y.length; i++) {
    if (i > 0) out.push(x[i], y[i - 1]);
    out.push(x[i], y[i]);
  }
  return out;
}

// ---------------------------------------------------------------- axes limits and ticks

/** Pixel size of the plot box of an axes (estimated from figure / axes positions). */
export function axesPixelSize(st, ax) {
  const f = figureOf(st, ax);
  const fw = f ? f.props.Position[2] : 560, fh = f ? f.props.Position[3] : 420;
  const pos = ax.props.PositionConstraint === 'innerposition' ? ax.props.Position : innerFromOuter(ax.props.OuterPosition);
  return [Math.max(40, pos[2] * fw), Math.max(30, pos[3] * fh)];
}
/** Approximate plot box (normalized) inside an outer position (room for labels). */
export function innerFromOuter(o) {
  const [l, b, w, h] = o;
  const ml = 0.13 * w / 1, mb = 0.11 * h, mr = 0.095 * w, mt = 0.075 * h;
  return [l + ml, b + mb, Math.max(0.05 * w, w - ml - mr), Math.max(0.05 * h, h - mb - mt)];
}

/** Full computed state of an axes (cached per version). */
export function axesInfo(ctx, ax) {
  const st = G(ctx);
  const f = figureOf(st, ax);
  const key = `${ax.ver}|${f ? f.props.Position.join(',') : ''}`;
  if (ax.internal.info && ax.internal.infoKey === key) return ax.internal.info;
  const p = ax.props;
  const derived = deriveAxes(st, ax);
  const logs = { x: p.XScale === 'log', y: p.YScale === 'log', z: p.ZScale === 'log' };
  const ext = new Ext();
  for (const c of ax.children) { const o = st.objs.get(c); if (o) addExtent(st, o, ext, logs, derived); }
  const is3D = !(p.View[0] === 0 && p.View[1] === 90) && p.Kind !== 'polar';
  const [pw, ph] = axesPixelSize(st, ax);
  const res = { derived, Is3D: is3D };
  const lim = (k, scale, mode, method, userLim, px, horiz) => {
    let r = ext[k];
    const has = r[0] <= r[1];
    let L;
    if (mode === 'manual') {
      L = userLim.slice();
      if (!finite(L[0]) || !finite(L[1])) {
        const a = has ? autoLimits(r[0], r[1], scale, method, maxTicksFor(px, horiz)) : (scale === 'log' ? [1, 10] : [0, 1]);
        if (!finite(L[0])) L[0] = a[0];
        if (!finite(L[1])) L[1] = a[1];
      }
    } else if (!has) L = scale === 'log' ? [1, 10] : [0, 1];
    else L = autoLimits(r[0], r[1], scale, method, maxTicksFor(px, horiz));
    return L;
  };
  const px3 = Math.min(pw, ph) * 0.7;
  res.XLim = lim('x', p.XScale, p.XLimMode, p.XLimitMethod, p.XLim, is3D ? px3 : pw, true);
  res.YLim = lim('y', p.YScale, p.YLimMode, p.YLimitMethod, p.YLim, is3D ? px3 : ph, is3D);
  res.ZLim = lim('z', p.ZScale, p.ZLimMode, p.ZLimitMethod, p.ZLim, is3D ? px3 : ph, false);
  if (p.CLimMode === 'manual') res.CLim = p.CLim.slice();
  else {
    const c = ext.c;
    res.CLim = c[0] <= c[1] ? (c[0] === c[1] ? [c[0] - 1, c[1] + 1] : [c[0], c[1]]) : [0, 1];
  }
  // ticks
  const tick = (axis, L, scale, px, horiz) => {
    const type = p[`${axis}AxisType`];
    let ticks, labels, exponent = 0;
    if (p[`${axis}TickMode`] === 'manual') ticks = p[`${axis}Tick`].slice();
    else if (type === 'datetime') { const d = dateTicks(L[0], L[1], Math.max(3, maxTicksFor(px, horiz) - 1)); ticks = d.ticks; labels = d.labels; }
    else if (type === 'categorical') { const cats = ax.internal[`${axis.toLowerCase()}cats`] || []; ticks = cats.map((_, i) => i + 1).filter((v) => v >= L[0] && v <= L[1]); labels = ticks.map((v) => cats[v - 1]); }
    else ticks = ticksFor(L[0], L[1], scale, maxTicksFor(px, horiz));
    if (p[`${axis}TickLabelMode`] === 'manual') labels = p[`${axis}TickLabel`].slice();
    else if (!labels) {
      if (type === 'datetime') labels = dateTicks(L[0], L[1]).labels;
      else { const t = tickLabels(ticks, scale); labels = t.labels; exponent = t.exponent; }
    }
    res[`${axis}Tick`] = ticks;
    res[`${axis}TickLabel`] = labels;
    res[`${axis}TickExponent`] = exponent;
  };
  tick('X', res.XLim, p.XScale, is3D ? px3 : pw, true);
  tick('Y', res.YLim, p.YScale, is3D ? px3 : ph, is3D);
  tick('Z', res.ZLim, p.ZScale, is3D ? px3 : ph, false);
  // aspect ratios
  const span = (L, s) => (s === 'log' ? Math.log10(L[1]) - Math.log10(L[0]) : L[1] - L[0]);
  const sx = span(res.XLim, p.XScale), sy = span(res.YLim, p.YScale), sz = span(res.ZLim, p.ZScale);
  if (p.DataAspectRatioMode === 'manual') {
    res.DataAspectRatio = p.DataAspectRatio.slice();
    res.PlotBoxAspectRatio = p.PlotBoxAspectRatioMode === 'manual' ? p.PlotBoxAspectRatio.slice()
      : normalizePba([sx / p.DataAspectRatio[0], sy / p.DataAspectRatio[1], sz / p.DataAspectRatio[2]]);
  } else {
    res.PlotBoxAspectRatio = p.PlotBoxAspectRatioMode === 'manual' ? p.PlotBoxAspectRatio.slice() : (is3D ? [1, 1, 1] : [pw / Math.max(pw, ph), ph / Math.max(pw, ph), 1]);
    const pb = res.PlotBoxAspectRatio;
    const d = [sx / pb[0], sy / pb[1], sz / pb[2]];
    const m = Math.min(...d.filter((x) => x > 0)) || 1;
    res.DataAspectRatio = d.map((x) => Number((x / m).toPrecision(6)));
  }
  // polar
  if (p.Kind === 'polar') {
    const rr = ext.y;
    res.ThetaLim = p.ThetaLimMode === 'manual' ? p.ThetaLim.slice() : [0, 360];
    res.RLim = p.RLimMode === 'manual' ? p.RLim.slice() : (rr[0] <= rr[1] ? [Math.min(0, rr[0]), autoLimits(Math.min(0, rr[0]), rr[1], 'linear', 'tickaligned', 6)[1]] : [0, 1]);
    res.RTick = p.RTickMode === 'manual' ? p.RTick.slice() : linearTicks(res.RLim[0], res.RLim[1], 6);
    const thStep = res.ThetaLim[1] - res.ThetaLim[0] > 180 ? 30 : 15;
    res.ThetaTick = p.ThetaTickMode === 'manual' ? p.ThetaTick.slice() : linearTicks(res.ThetaLim[0], res.ThetaLim[1] - (res.ThetaLim[1] - res.ThetaLim[0] >= 360 ? 1e-9 : 0), 100).filter((v) => Math.abs(v / thStep - Math.round(v / thStep)) < 1e-9);
    res.RTickLabel = p.RTickLabel.length ? p.RTickLabel : tickLabels(res.RTick).labels;
    res.ThetaTickLabel = p.ThetaTickLabel.length ? p.ThetaTickLabel : res.ThetaTick.map((v) => (p.ThetaAxisUnits === 'radians' ? radLabel(v) : `${v}°`));
  }
  ax.internal.info = res;
  ax.internal.infoKey = key;
  return res;
}
function normalizePba(v) { const m = Math.max(...v.filter((x) => x > 0)) || 1; return v.map((x) => (x > 0 ? x / m : 1)); }
function radLabel(deg) {
  const k = Math.round(deg / 15);
  if (k === 0) return '0';
  const g = gcd(k, 12);
  const num = k / g, den = 12 / g;
  return `${num === 1 ? '' : num}π${den === 1 ? '' : `/${den}`}`;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

// ---------------------------------------------------------------- layouts

/** OuterPosition of subplot(m, n, p) (p may be a list of cells to span). */
export function subplotOuter(m, n, cells) {
  const rows = cells.map((c) => Math.floor((c - 1) / n)), cols = cells.map((c) => (c - 1) % n);
  const r0 = Math.min(...rows), r1 = Math.max(...rows), c0 = Math.min(...cols), c1 = Math.max(...cols);
  const w = 1 / n, h = 1 / m;
  return [c0 * w, 1 - (r1 + 1) * h, (c1 - c0 + 1) * w, (r1 - r0 + 1) * h];
}

/** OuterPosition of a tile (1-based index, span [r c]) inside a tiled layout. */
export function tileOuter(layout, tile, span = [1, 1]) {
  const [R, C] = layout.props.GridSize;
  const idx = tile - 1;
  const rowMajor = layout.props.TileIndexing !== 'columnmajor';
  const r = rowMajor ? Math.floor(idx / C) : idx % R;
  const c = rowMajor ? idx % C : Math.floor(idx / R);
  const gap = { loose: 0.02, compact: 0.008, tight: 0, none: 0 }[layout.props.TileSpacing] ?? 0.02;
  const pad = { loose: 0.02, compact: 0.01, tight: 0 }[layout.props.Padding] ?? 0.02;
  const titleRoom = layout.internal.hasTitle ? 0.06 : 0;
  const [L, B, W, H] = layout.props.OuterPosition;
  const iw = W - 2 * pad, ih = H - 2 * pad - titleRoom;
  const cw = (iw - gap * (C - 1)) / C, chh = (ih - gap * (R - 1)) / R;
  const x = L + pad + c * (cw + gap);
  const top = B + pad + ih - r * (chh + gap);
  const w = cw * span[1] + gap * (span[1] - 1), h = chh * span[0] + gap * (span[0] - 1);
  return [x, top - h, w, h];
}

export function isAxes(o) { return o && isAxesType(o.type); }
