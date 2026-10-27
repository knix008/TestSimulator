// Current figure / axes, newplot (hold logic), colour order, data
// conversion of plot arguments and LineSpec parsing.
import { isObject, isComplex, toTensor } from '../value.js';
import { gerr, isTxt, txt, nums, isNum, parseLineSpec, lower } from './util.js';
import { G, create, destroy, isAxesType, mustObj, rowsOfMat, matOfRows, touch, isHandleValue, handleIds, helperIds, figureOf } from './model.js';
import { DEFAULT_COLOR_ORDER } from './colormaps.js';
import { TYPES, COMMON } from './schema.js';
import { flush } from './scene.js';

// ---------------------------------------------------------------- figures

export function currentFigure(ctx, make = true) {
  const st = G(ctx);
  const root = st.objs.get(0);
  const id = root.props.CurrentFigure;
  if (id != null && st.objs.has(id)) return st.objs.get(id);
  if (!make) return null;
  return newFigure(ctx);
}

export function newFigure(ctx, number = null, opts = {}) {
  const st = G(ctx);
  const f = create(ctx, 'figure', 0, {}, { id: number });
  if (opts.ui) { f.internal.ui = true; f.props.Color = [0.94, 0.94, 0.94]; }
  st.objs.get(0).props.CurrentFigure = f.id;
  flush(ctx);
  return f;
}

/** Makes figure f current (and the root's CurrentFigure). */
export function makeCurrentFigure(ctx, f) {
  const st = G(ctx);
  const root = st.objs.get(0);
  root.props.CurrentFigure = f.id;
  root.children = [f.id, ...root.children.filter((c) => c !== f.id)];
  st.dirty.add(f.id);
}

export function currentAxes(ctx, make = true, fig = null) {
  const st = G(ctx);
  const f = fig || currentFigure(ctx, make);
  if (!f) return null;
  const id = f.props.CurrentAxes;
  if (id != null && st.objs.has(id)) return st.objs.get(id);
  // first axes child
  const any = allAxes(st, f)[0];
  if (any) { f.props.CurrentAxes = any.id; return any; }
  if (!make) return null;
  return newAxes(ctx, f);
}

/** All axes under a figure (including inside tiled layouts / panels). */
export function allAxes(st, f) {
  const out = [];
  const walk = (o) => { for (const c of o.children) { const co = st.objs.get(c); if (!co) continue; if (isAxesType(co.type)) out.push(co); else if (co.type === 'tiledlayout' || co.type === 'uipanel') walk(co); } };
  walk(f);
  return out;
}

export function newAxes(ctx, f, type = 'axes', props = {}, parentId = null) {
  const ax = create(ctx, type, parentId ?? f.id, props);
  f.props.CurrentAxes = ax.id;
  if (type === 'polaraxes') { ax.props.Box = true; ax.props.XGrid = true; ax.props.YGrid = true; }
  return ax;
}

export function makeCurrentAxes(ctx, ax) {
  const st = G(ctx);
  const f = figureOf(st, ax);
  if (f) { f.props.CurrentAxes = ax.id; makeCurrentFigure(ctx, f); }
}

/** Resets axes properties to defaults (keeps position / layout / helpers). */
export function resetAxes(ctx, ax) {
  const keep = ['OuterPosition', 'Position', 'PositionConstraint', 'Units', 'Title', 'Subtitle', 'XLabel', 'YLabel', 'ZLabel', 'Layout', 'Kind', 'XAxisType', 'YAxisType', 'ActivePositionProperty', 'Legend', 'Colorbar'];
  const saved = {};
  for (const k of keep) saved[k] = ax.props[k];
  const savedUser = new Set([...ax.userSet].filter((k) => keep.includes(k)));
  for (const e of [...COMMON, ...TYPES[ax.type]]) {
    if (keep.includes(e[0])) continue;
    if (e[0] === 'Visible' && ax.props.Visible === false && ax.internal.keepHidden) continue;
    const d = e[2];
    ax.props[e[0]] = Array.isArray(d) ? d.slice() : d;
  }
  Object.assign(ax.props, saved);
  ax.props.ColorOrder = ax.internal.colorOrder || ax.props.ColorOrder || null;
  if (!ax.props.ColorOrder) ax.props.ColorOrder = matOfRows(DEFAULT_COLOR_ORDER);
  ax.userSet = savedUser;
  ax.props.XAxisType = 'numeric'; ax.props.YAxisType = 'numeric';
  ax.internal.xcats = null; ax.internal.ycats = null;
  if (ax.type === 'polaraxes') { ax.props.Box = true; ax.props.XGrid = true; ax.props.YGrid = true; }
  for (const k of ['Title', 'Subtitle', 'XLabel', 'YLabel', 'ZLabel']) {
    const t = G(ctx).objs.get(ax.props[k]);
    if (t) { t.props.String = ''; }
  }
  for (const k of ['Legend', 'Colorbar']) if (ax.props[k] != null) { destroy(ctx, ax.props[k], false); ax.props[k] = null; }
  touch(G(ctx), ax);
}

/** Deletes the children of axes (cla). */
export function clearAxes(ctx, ax, reset = true) {
  const st = G(ctx);
  for (const c of ax.children.slice()) {
    const o = st.objs.get(c);
    if (o && (o.props.HandleVisibility !== 'off' || reset)) destroy(ctx, c);
  }
  ax.props.ColorOrderIndex = 1;
  ax.props.LineStyleOrderIndex = 1;
  ax.internal.colorIndex = 0;
  if (reset) resetAxes(ctx, ax);
  touch(st, ax);
}

/**
 * Prepares axes for a new plot (hold logic). Returns {ax, fig, held}:
 * held = the axes kept its content (hold on).
 */
export function newplot(ctx, axArg = null, opts = {}) {
  const st = G(ctx);
  let ax = axArg;
  let fig;
  if (!ax) {
    fig = currentFigure(ctx, true);
    if (fig.props.NextPlot === 'replace' || fig.props.NextPlot === 'replacechildren') {
      for (const c of fig.children.slice()) destroy(ctx, c);
      if (fig.props.NextPlot === 'replace') fig.props.NextPlot = 'add';
    }
    ax = currentAxes(ctx, false, fig);
    const wantPolar = !!opts.polar;
    if (ax && wantPolar !== (ax.type === 'polaraxes')) {
      if (ax.props.NextPlot === 'add' && !opts.forceType) throw gerr('axesType', wantPolar ? 'Cannot plot polar data on Cartesian axes while hold is on.' : 'Cannot plot Cartesian data on polar axes while hold is on.');
      // replace the axes by one of the wanted kind at the same place
      const parent = ax.parent;
      const outer = ax.props.OuterPosition.slice();
      const layout = ax.props.Layout;
      const pc = ax.props.PositionConstraint, pos = ax.props.Position.slice();
      destroy(ctx, ax.id);
      ax = newAxes(ctx, fig, wantPolar ? 'polaraxes' : 'axes', { OuterPosition: outer, Position: pos, PositionConstraint: pc, Layout: layout }, parent);
    }
    if (!ax) ax = newAxes(ctx, fig, wantPolar ? 'polaraxes' : 'axes');
  } else {
    fig = figureOf(st, ax);
  }
  const held = ax.props.NextPlot === 'add';
  if (!held) {
    if (ax.props.NextPlot === 'replacechildren') clearAxes(ctx, ax, false);
    else clearAxes(ctx, ax, true);
  }
  if (fig) { fig.props.CurrentAxes = ax.id; makeCurrentFigure(ctx, fig); }
  return { ax, fig, held };
}

// ---------------------------------------------------------------- colour order

/** Next colour (and line style) from the axes colour order. */
export function nextSeriesStyle(ax) {
  const rows = rowsOfMat(ax.props.ColorOrder);
  const n = Math.max(1, rows.length);
  const k = ax.internal.colorIndex || 0;
  ax.internal.colorIndex = k + 1;
  ax.props.ColorOrderIndex = ((k + 1) % n) + 1;
  const styles = ax.props.LineStyleOrder && ax.props.LineStyleOrder.length ? ax.props.LineStyleOrder : ['-'];
  const ls = styles[Math.floor(k / n) % styles.length];
  return { color: rows.length ? rows[k % n].slice() : [0, 0, 0], lineStyle: ls, index: k + 1 };
}
export function peekSeriesColor(ax, offset = 0) {
  const rows = rowsOfMat(ax.props.ColorOrder);
  const k = (ax.internal.colorIndex || 0) + offset;
  return rows.length ? rows[k % rows.length].slice() : [0, 0, 0];
}

// ---------------------------------------------------------------- arguments

/** Splits a leading axes handle: {ax, args}. */
export function leadingAxes(ctx, args) {
  if (args.length && isHandleValue(args[0])) {
    const st = G(ctx);
    const ids = handleIds(args[0]);
    if (ids.length === 1) {
      const o = mustObj(st, ids[0], 'Axes');
      if (isAxesType(o.type)) return { ax: o, args: args.slice(1) };
    }
  }
  if (args.length > 1 && isNum(args[0]) && args[0].dims[0] * args[0].dims[1] === 1) {
    const st = G(ctx);
    const id = nums(args[0])[0];
    const o = st.objs.get(id);
    if (o && isAxesType(o.type) && !Number.isInteger(id)) return { ax: o, args: args.slice(1) };
  }
  return { ax: null, args };
}

/** Numeric data of a plot argument, with datetime / categorical support. */
export function plotData(ctx, v) {
  if (isObject(v) && !isHandleValue(v)) {
    const cls = String(v.cls);
    if (cls === 'datetime') {
      for (const fn of ['datenum', 'double']) {
        try { const r = ctx.call(fn, [v], 1)[0]; return { data: Float64Array.from(nums(r)), dims: r.dims.slice(), kind: 'datetime' }; } catch { /* next */ }
      }
      throw gerr('datetime', 'Cannot plot datetime values (datenum is not available).');
    }
    if (cls === 'duration') {
      try { const r = ctx.call('days', [v], 1)[0]; return { data: Float64Array.from(nums(r)), dims: r.dims.slice(), kind: 'numeric' }; } catch { /* fallthrough */ }
    }
    if (cls === 'categorical') {
      const codes = ctx.call('double', [v], 1)[0];
      let cats = [];
      try { const c = ctx.call('categories', [v], 1)[0]; cats = c.data.map((x) => txt(x)); } catch { /* none */ }
      return { data: Float64Array.from(nums(codes)), dims: codes.dims.slice(), kind: 'categorical', cats };
    }
    throw gerr('notNumeric', `Cannot plot values of class ${cls}.`);
  }
  if (v && v.cls === 'string' || v && v.cls === 'cell') {
    // text categories
    const list = v.cls === 'string' ? v.data.map((s) => s ?? '') : v.data.map((x) => txt(x));
    const cats = [...new Set(list)];
    return { data: Float64Array.from(list.map((s) => cats.indexOf(s) + 1)), dims: v.dims.slice(), kind: 'categorical', cats };
  }
  if (!isNum(v)) throw gerr('notNumeric', 'Data must be numeric, datetime, duration or categorical.');
  const t = toTensor(v);
  return { data: Float64Array.from(t.re), dims: t.dims.slice(), kind: 'numeric', im: isComplex(t) ? Float64Array.from(t.im) : null };
}

/** Applies datetime / categorical axis types to the axes. */
export function noteAxisKind(ax, axis, d) {
  if (!d || d.kind === 'numeric') return;
  ax.props[`${axis}AxisType`] = d.kind;
  if (d.kind === 'categorical') {
    const key = `${axis.toLowerCase()}cats`;
    const prev = ax.internal[key] || [];
    if (d.cats && d.cats.length >= prev.length) ax.internal[key] = d.cats.slice();
  }
}

const isVec = (dims) => dims.length === 2 && (dims[0] === 1 || dims[1] === 1);

/** Columns of a data matrix as arrays (vectors → one column). */
export function columnsOf(d, rowsLen = null) {
  const [m, n] = d.dims;
  if (isVec(d.dims)) return [Array.from(d.data)];
  if (rowsLen != null && m !== rowsLen && n === rowsLen) {
    const out = [];
    for (let i = 0; i < m; i++) { const r = []; for (let j = 0; j < n; j++) r.push(d.data[i + j * m]); out.push(r); }
    return out;
  }
  const out = [];
  for (let j = 0; j < n; j++) out.push(Array.from(d.data.subarray(j * m, (j + 1) * m)));
  return out;
}

/** A LineSpec string, or null if text is not a line spec. */
export function lineSpecOf(v) {
  if (!isTxt(v)) return null;
  return parseLineSpec(txt(v));
}

/**
 * Parses plot(X1,Y1,LineSpec1,...,Name,Value) into series:
 * [{x, y, z, spec, xd, yd}] (x / y as arrays) and the trailing pairs.
 * dim = 2 or 3 (plot3).
 */
export function parseSeries(ctx, args, dim = 2) {
  const groups = [];
  let i = 0;
  let pairsAt = args.length;
  while (i < args.length) {
    if (isTxt(args[i])) {
      // a LineSpec right after data, or the start of name/value pairs
      const spec = lineSpecOf(args[i]);
      if (spec && groups.length && !groups[groups.length - 1].spec && !(args.length - i > 1 && (args.length - i) % 2 === 0 && isPropName(args[i]) && !isLikelySpec(args[i]))) {
        groups[groups.length - 1].spec = spec; i++; continue;
      }
      pairsAt = i; break;
    }
    const data = [];
    while (i < args.length && !isTxt(args[i]) && data.length < dim) { data.push(args[i]); i++; }
    groups.push({ data, spec: null });
  }
  const series = [];
  for (const g of groups) {
    const ds = g.data.map((v) => plotData(ctx, v));
    if (dim === 2) {
      if (ds.length === 1) {
        const y = ds[0];
        if (y.im) { series.push(...pairCols({ ...y, im: null }, { data: y.im, dims: y.dims, kind: 'numeric' }, g.spec)); continue; }
        const cols = columnsOf(y);
        const n = cols[0] ? cols[0].length : 0;
        const x = Array.from({ length: n }, (_, k) => k + 1);
        for (const c of cols) series.push({ x, y: c, spec: g.spec, yd: y });
      } else {
        if (ds.length === 3 || ds.length > 2) throw gerr('plotArgs', 'Data must be given as X, Y pairs.');
        series.push(...pairCols(ds[0], ds[1], g.spec));
      }
    } else {
      if (ds.length !== 3) throw gerr('plotArgs', 'plot3 needs X, Y and Z data.');
      const [xd, yd, zd] = ds;
      const ref = !isVec(zd.dims) ? zd.dims[0] : !isVec(yd.dims) ? yd.dims[0] : !isVec(xd.dims) ? xd.dims[0] : null;
      const xc = columnsOf(xd, ref), yc = columnsOf(yd, ref), zc = columnsOf(zd, ref);
      const k = Math.max(xc.length, yc.length, zc.length);
      for (let j = 0; j < k; j++) series.push({ x: xc[Math.min(j, xc.length - 1)], y: yc[Math.min(j, yc.length - 1)], z: zc[Math.min(j, zc.length - 1)], spec: g.spec, xd, yd, zd });
    }
  }
  return { series, pairs: args.slice(pairsAt) };
}
const isLikelySpec = (v) => { const s = txt(v); return s.length <= 4 && /^[-:.rgbcmykwo+*xsdv^<>ph]+$/.test(s); };
function isPropName(v) {
  const s = lower(txt(v));
  return s.length > 1 && ['color', 'linestyle', 'linewidth', 'marker', 'markersize', 'markeredgecolor', 'markerfacecolor', 'displayname', 'markerindices', 'tag', 'visible', 'parent', 'userdata'].some((p) => p.startsWith(s));
}

function pairCols(xd, yd, spec) {
  const out = [];
  if (isVec(xd.dims) && isVec(yd.dims)) {
    if (xd.data.length !== yd.data.length) throw gerr('plotArgs', 'Vectors must be the same length.');
    return [{ x: Array.from(xd.data), y: Array.from(yd.data), spec, xd, yd }];
  }
  if (isVec(xd.dims)) {
    const ycols = columnsOf(yd, xd.data.length);
    if (ycols[0].length !== xd.data.length) throw gerr('plotArgs', 'Vectors must be the same length.');
    for (const c of ycols) out.push({ x: Array.from(xd.data), y: c, spec, xd, yd });
    return out;
  }
  if (isVec(yd.dims)) {
    const xcols = columnsOf(xd, yd.data.length);
    for (const c of xcols) out.push({ x: c, y: Array.from(yd.data), spec, xd, yd });
    return out;
  }
  if (xd.dims[0] !== yd.dims[0] || xd.dims[1] !== yd.dims[1]) throw gerr('plotArgs', 'Matrix dimensions must agree.');
  const xc = columnsOf(xd), yc = columnsOf(yd);
  for (let j = 0; j < xc.length; j++) out.push({ x: xc[j], y: yc[j], spec, xd, yd });
  return out;
}

/** Applies a parsed LineSpec to a line-like object (props JS). */
export function applySpec(props, spec, defaults) {
  props.Color = spec && spec.color ? spec.color : defaults.color;
  let ls = spec && spec.lineStyle !== undefined ? spec.lineStyle : null;
  const mk = spec && spec.marker ? spec.marker : null;
  if (mk) props.Marker = mk;
  if (ls == null) ls = mk ? 'none' : defaults.lineStyle;
  props.LineStyle = ls;
}

export { helperIds, flush };
