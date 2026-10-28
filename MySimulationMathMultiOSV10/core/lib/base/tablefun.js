// More table and timetable functions: reshaping (rows2vars, stack,
// unstack, splitvars, mergevars, convertvars), group counts / transforms /
// filters, regularity tests, lags, and resampling of timetables (retime,
// synchronize, containsrange).
import { tensor, num, str, cell, isTensor, isString, isCell, isFuncHandle, toTensor, prod } from '../../value.js';
import { E, textArg, optArg, textList } from './util.js';
import { makeTableObj, rowsGather, rowsOf, varIndex, groupRows, withVars } from './table.js';
import { catValues } from './ops.js';

const isTable = (v) => v && v.isObject && (v.cls === 'table' || v.cls === 'timetable');
const isTT = (v) => v && v.isObject && v.cls === 'timetable';
const need = (args, n, f) => { if (args.length < n) throw E(`base:${f}:notEnoughInputs`, 'Not enough input arguments.'); };
const tableIn = (v, f, tt = false) => { if (!(tt ? isTT(v) : isTable(v))) throw E(`base:${f}:invalidInput`, `First input must be a ${tt ? 'timetable' : 'table'}.`); return v; };
const call1 = (ctx, f, args) => ctx.call(f, args, 1)[0];
const col = (a) => tensor('double', [a.length, 1], Float64Array.from(a));
const cellCol = (list) => cell([list.length, 1], list.map((s) => str(s)));
function nvPairs(args, start, fname, allowed) {
  const o = new Map();
  for (let i = start; i < args.length; i += 2) {
    const k = textArg(args[i]);
    if (k === null || args[i + 1] === undefined) throw E(`base:${fname}:invalidOption`, 'Options must be name-value pairs.');
    const name = allowed.find((a) => a.toLowerCase() === k.toLowerCase());
    if (!name) throw E(`base:${fname}:invalidOption`, `Invalid option '${k}'.`);
    o.set(name, args[i + 1]);
  }
  return o;
}
const P = (T) => T.props;

// ------------------------------------------------------------- rows2vars / splitvars / mergevars / convertvars

function rows2varsFn(args) {
  need(args, 1, 'rows2vars');
  const T = tableIn(args[0], 'rows2vars');
  const o = nvPairs(args, 1, 'rows2vars', ['VariableNamesSource', 'DataVariables', 'VariableNamingRule']);
  let dv = o.has('DataVariables') ? varIndex(T, o.get('DataVariables')) : P(T).names.map((_, i) => i);
  let newNames;
  const h = T.dims[0];
  if (o.has('VariableNamesSource')) {
    const src = varIndex(T, o.get('VariableNamesSource'))[0];
    const v = P(T).vars[src];
    newNames = isTensor(v) && v.cls !== 'char' ? Array.from(toTensor(v).re, (x) => `x${x}`) : textList(v).list;
    dv = dv.filter((i) => i !== src);
  } else newNames = P(T).rowNames ? P(T).rowNames.slice() : Array.from({ length: h }, (_, i) => `Var${i + 1}`);
  const cols = [];
  for (let r = 0; r < h; r++) {
    const items = dv.map((j) => rowsGather(P(T).vars[j], [r]));
    const numeric = items.every((x) => isTensor(x) && x.re.length === 1);
    if (numeric) cols.push(tensor('double', [items.length, 1], Float64Array.from(items, (x) => x.re[0])));
    else cols.push(cell([items.length, 1], items));
  }
  return makeTableObj([cellCol(dv.map((j) => P(T).names[j])), ...cols], ['OriginalVariableNames', ...newNames]);
}
function splitvarsFn(args) {
  need(args, 1, 'splitvars');
  const T = tableIn(args[0], 'splitvars');
  let i = 1, sel = null;
  if (args[1] !== undefined && !(textArg(args[1]) && textArg(args[1]).toLowerCase() === 'newvariablenames')) { sel = varIndex(T, args[1]); i = 2; }
  const o = nvPairs(args, i, 'splitvars', ['NewVariableNames']);
  const names = P(T).names;
  if (!sel) sel = names.map((_, j) => j).filter((j) => { const v = P(T).vars[j]; return isTable(v) || (v.dims && prod(v.dims.slice(1)) > 1 && !(v.cls === 'char')); });
  const given = o.has('NewVariableNames') ? o.get('NewVariableNames') : null;
  const vars = [], outNames = [];
  let gi = 0;
  names.forEach((n, j) => {
    const v = P(T).vars[j];
    if (!sel.includes(j)) { vars.push(v); outNames.push(n); return; }
    let parts, pn;
    if (isTable(v)) { parts = P(v).vars.slice(); pn = P(v).names.slice(); }
    else {
      const h = rowsOf(v), w = prod(v.dims) / Math.max(h, 1);
      parts = Array.from({ length: w }, (_, c) => { const idx = Array.from({ length: h }, (_, r) => r + c * h); return gatherRaw(v, idx); });
      pn = parts.map((_, c) => `${n}_${c + 1}`);
    }
    if (given) { const g = isCell(given) && sel.length > 1 ? textList(given.data[gi]).list : textList(given).list; if (g.length === parts.length) pn = g; }
    gi++;
    vars.push(...parts); outNames.push(...pn);
  });
  return withVars(T, vars, outNames);
}
function gatherRaw(v, idx) { return rowsGather({ ...v, dims: [prod(v.dims), 1] }, idx); }
function mergevarsFn(args, nargout, ctx) {
  need(args, 2, 'mergevars');
  const T = tableIn(args[0], 'mergevars');
  const sel = varIndex(T, args[1]);
  const o = nvPairs(args, 2, 'mergevars', ['NewVariableName', 'MergeAsTable']);
  const asTable = o.has('MergeAsTable') && toTensor(o.get('MergeAsTable')).re[0] !== 0;
  const name = o.has('NewVariableName') ? textList(o.get('NewVariableName')).list[0] : `Var${Math.min(...sel) + 1}`;
  const items = sel.map((j) => P(T).vars[j]);
  const merged = asTable ? makeTableObj(items, sel.map((j) => P(T).names[j])) : catValues(1, items, ctx);
  const vars = [], names = [];
  const first = Math.min(...sel);
  P(T).names.forEach((n, j) => {
    if (j === first) { vars.push(merged); names.push(name); }
    if (sel.includes(j)) return;
    vars.push(P(T).vars[j]); names.push(n);
  });
  return withVars(T, vars, names);
}
function convertvarsFn(args, nargout, ctx) {
  need(args, 3, 'convertvars');
  const T = tableIn(args[0], 'convertvars');
  const sel = varIndex(T, args[1]);
  const fn = isFuncHandle(args[2]) ? args[2] : textList(args[2]).list[0];
  const vars = P(T).vars.map((v, j) => (sel.includes(j) ? call1(ctx, fn, [v]) : v));
  return withVars(T, vars, P(T).names);
}

// ------------------------------------------------------------- stack / unstack

function stackFn(args, nargout, ctx) {
  need(args, 2, 'stack');
  const T = tableIn(args[0], 'stack');
  const sel = varIndex(T, args[1]);
  const o = nvPairs(args, 2, 'stack', ['NewDataVariableName', 'IndexVariableName', 'ConstantVariables']);
  const names = P(T).names, h = T.dims[0], k = sel.length;
  const cons = o.has('ConstantVariables') ? varIndex(T, o.get('ConstantVariables')) : names.map((_, j) => j).filter((j) => !sel.includes(j));
  const dataName = o.has('NewDataVariableName') ? textList(o.get('NewDataVariableName')).list[0] : sel.map((j) => names[j]).join('_');
  const idxName = o.has('IndexVariableName') ? textList(o.get('IndexVariableName')).list[0] : `${dataName}_Indicator`;
  const rowIdx = []; for (let r = 0; r < h; r++) for (let q = 0; q < k; q++) rowIdx.push(r);
  const consVars = cons.map((j) => rowsGather(P(T).vars[j], rowIdx));
  const pieces = sel.map((j) => P(T).vars[j]);
  const dataIdx = []; for (let r = 0; r < h; r++) for (let q = 0; q < k; q++) dataIdx.push(q * h + r);
  const all = catValues(0, pieces, ctx);
  const data = rowsGather(all, dataIdx);
  const labels = []; for (let r = 0; r < h; r++) for (let q = 0; q < k; q++) labels.push(names[sel[q]]);
  const ind = call1(ctx, 'categorical', [cellCol(labels), cellCol(sel.map((j) => names[j]))]);
  const outT = makeTableObj([...consVars, ind, data], [...cons.map((j) => names[j]), idxName, dataName], { rowTimes: P(T).rowTimes ? rowsGather(P(T).rowTimes, rowIdx) : null });
  if (nargout >= 2) return [outT, col(rowIdx.map((r) => r + 1))];
  return outT;
}
function labelText(v, n) {
  if (isCell(v) || isString(v) || v.cls === 'char') return textList(v).list;
  if (v.isObject && v.cls === 'categorical') return Array.from(v.arr, (c) => (c ? v.props.categories[c - 1] : '<undefined>'));
  return Array.from(toTensor(v).re.slice(0, n), (x) => `x${x}`);
}
function unstackFn(args, nargout, ctx) {
  need(args, 3, 'unstack');
  const T = tableIn(args[0], 'unstack');
  const dv = varIndex(T, args[1]), iv = varIndex(T, args[2])[0];
  const o = nvPairs(args, 3, 'unstack', ['GroupingVariables', 'AggregationFunction', 'NewDataVariableNames', 'ConstantVariables']);
  const names = P(T).names, h = T.dims[0];
  const gv = o.has('GroupingVariables') ? varIndex(T, o.get('GroupingVariables')) : names.map((_, j) => j).filter((j) => !dv.includes(j) && j !== iv);
  const labels = labelText(P(T).vars[iv], h);
  const uniq = [...new Set(labels)];
  const groups = gv.length ? groupRows(T, gv) : [Array.from({ length: h }, (_, i) => i)];
  const agg = o.has('AggregationFunction') ? o.get('AggregationFunction') : null;
  const outVars = gv.map((j) => rowsGather(P(T).vars[j], groups.map((g) => g[0])));
  const outNames = gv.map((j) => names[j]);
  for (const d of dv) {
    const src = P(T).vars[d];
    const numeric = isTensor(src) && src.cls !== 'char';
    for (const u of uniq) {
      const vals = groups.map((g) => {
        const rows = g.filter((r) => labels[r] === u);
        if (!rows.length) return numeric ? NaN : null;
        const part = rowsGather(src, rows);
        if (agg) { const r = call1(ctx, agg, [part]); return numeric ? toTensor(r).re[0] : r; }
        if (numeric) { let s = 0; for (const r of rows) s += toTensor(src).re[r]; return s; }
        return rowsGather(src, [rows[0]]);
      });
      outVars.push(numeric ? col(vals) : cell([vals.length, 1], vals.map((x) => x || tensor('double', [0, 0]))));
      outNames.push(dv.length > 1 ? `${names[d]}_${u}` : u);
    }
  }
  const out = makeTableObj(outVars, outNames);
  if (nargout >= 2) return [out, col(groups.map((g) => g[0] + 1))];
  return out;
}

// ------------------------------------------------------------- group counts / transform / filter

function groupcountsFn(args, nargout, ctx) {
  need(args, 1, 'groupcounts');
  const A = args[0];
  if (!isTable(A)) {
    // vector (or matrix columns as grouping variables) input
    const cols = isTensor(A) && A.dims[1] > 1 && A.dims[0] > 1 ? Array.from({ length: A.dims[1] }, (_, c) => rowsGather({ ...A, dims: [A.dims[0], 1] , re: A.re.subarray(c * A.dims[0], (c + 1) * A.dims[0]), im: null }, Array.from({ length: A.dims[0] }, (_, r) => r))) : [A.dims && A.dims[0] === 1 && A.dims.length === 2 ? { ...A, dims: [A.dims[1], 1] } : A];
    const Tt = makeTableObj(cols, cols.map((_, i) => `g${i}`));
    const groups = groupRows(Tt, cols.map((_, i) => i));
    const n = Tt.dims[0];
    const counts = col(groups.map((g) => g.length));
    const BG = cols.length === 1 ? rowsGather(cols[0], groups.map((g) => g[0])) : cell([1, cols.length], cols.map((c) => rowsGather(c, groups.map((g) => g[0]))));
    const outs = [counts, BG, col(groups.map((g) => 100 * g.length / n))];
    return nargout <= 1 ? outs[0] : outs.slice(0, nargout);
  }
  need(args, 2, 'groupcounts');
  const gv = varIndex(A, args[1]);
  const groups = groupRows(A, gv);
  const n = A.dims[0];
  const vars = gv.map((j) => rowsGather(P(A).vars[j], groups.map((g) => g[0])));
  return makeTableObj([...vars, col(groups.map((g) => g.length)), col(groups.map((g) => 100 * g.length / n))], [...gv.map((j) => P(A).names[j]), 'GroupCount', 'Percent']);
}
const TRANSFORMS = {
  zscore: (a) => { const m = mean(a); const s = std(a) || 1; return a.map((x) => (x - m) / s); },
  norm: (a) => { const s = Math.sqrt(a.reduce((p, x) => p + (x === x ? x * x : 0), 0)); return a.map((x) => x / s); },
  meancenter: (a) => { const m = mean(a); return a.map((x) => x - m); },
  rescale: (a) => { const v = a.filter((x) => x === x); const lo = Math.min(...v), hi = Math.max(...v); return a.map((x) => (hi > lo ? (x - lo) / (hi - lo) : 0)); },
  meanfill: (a) => { const m = mean(a); return a.map((x) => (x === x ? x : m)); },
  linearfill: (a) => {
    const ok = a.map((x, i) => [i, x]).filter((p) => p[1] === p[1]);
    return a.map((x, i) => { if (x === x || ok.length < 2) return x; let lo = ok[0], hi = ok[ok.length - 1]; for (const p of ok) { if (p[0] < i) lo = p; if (p[0] > i) { hi = p; break; } } if (lo[0] > i) [lo, hi] = [ok[0], ok[1]]; if (hi[0] < i) [lo, hi] = [ok[ok.length - 2], ok[ok.length - 1]]; return lo[1] + (hi[1] - lo[1]) * (i - lo[0]) / (hi[0] - lo[0]); });
  },
};
function mean(a) { const v = a.filter((x) => x === x); return v.reduce((p, x) => p + x, 0) / v.length; }
function std(a) { const v = a.filter((x) => x === x); const m = mean(v); return Math.sqrt(v.reduce((p, x) => p + (x - m) ** 2, 0) / (v.length - 1)); }
function groupDataArgs(args, fname) {
  need(args, 3, fname);
  const T = tableIn(args[0], fname);
  const gv = varIndex(T, args[1]);
  const method = args[2];
  const dv = args[3] !== undefined ? varIndex(T, args[3]) : P(T).names.map((_, j) => j).filter((j) => !gv.includes(j));
  return { T, gv, method, dv };
}
function grouptransformFn(args, nargout, ctx) {
  const { T, gv, method, dv } = groupDataArgs(args, 'grouptransform');
  const groups = groupRows(T, gv);
  const h = T.dims[0];
  const vars = P(T).vars.map((v, j) => {
    if (!dv.includes(j)) return v;
    const src = toTensor(v).re; const out = new Float64Array(h);
    for (const g of groups) {
      const a = g.map((r) => src[r]);
      let y;
      if (isFuncHandle(method)) y = Array.from(toTensor(call1(ctx, method, [col(a)])).re);
      else { const f = TRANSFORMS[optArg(method)]; if (!f) throw E('base:grouptransform:invalidMethod', `Invalid method '${textArg(method) ?? '?'}'.`); y = f(a); }
      g.forEach((r, q) => { out[r] = y.length === 1 ? y[0] : y[q]; });
    }
    return col(Array.from(out));
  });
  return withVars(T, vars, P(T).names);
}
function groupfilterFn(args, nargout, ctx) {
  const { T, gv, method, dv } = groupDataArgs(args, 'groupfilter');
  if (!isFuncHandle(method)) throw E('base:groupfilter:invalidMethod', 'The method must be a function handle.');
  const groups = groupRows(T, gv);
  const keep = new Array(T.dims[0]).fill(true);
  for (const g of groups) for (const j of dv) {
    const r = toTensor(call1(ctx, method, [rowsGather(P(T).vars[j], g)])).re;
    g.forEach((row, q) => { if (!(r.length === 1 ? r[0] : r[q])) keep[row] = false; });
  }
  const idx = keep.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
  return rowsGather(T, idx);
}

// ------------------------------------------------------------- timetable functions

const times = (TT) => P(TT).rowTimes.arr;
function isregularFn(args, nargout, ctx) {
  need(args, 1, 'isregular');
  const TT = tableIn(args[0], 'isregular', true);
  const unit = args[1] !== undefined ? optArg(args[1]) : 'time';
  const t = times(TT); const n = t.length;
  let ok = true, step = NaN;
  if (unit === 'time') {
    if (n >= 2) { step = t[1] - t[0]; for (let i = 2; i < n; i++) if (Math.abs(t[i] - t[i - 1] - step) > 1e-9 * Math.max(1, Math.abs(step))) { ok = false; break; } }
    if (!ok) step = NaN;
    const stepV = { ...P(TT).rowTimes, cls: 'duration', dims: [1, 1], arr: Float64Array.of(step), props: { Format: 'hh:mm:ss' } };
    return nargout >= 2 ? [tensor('logical', [1, 1], [ok ? 1 : 0]), stepV] : tensor('logical', [1, 1], [ok ? 1 : 0]);
  }
  if (P(TT).rowTimes.cls !== 'datetime') throw E('base:isregular:unitNeedsDatetime', 'Calendar units need datetime row times.');
  const parts = Array.from(t, (ms) => { const d = new Date(ms); return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), rest: ms - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }; });
  const idx = (p) => (unit === 'years' ? p.y : unit === 'quarters' ? p.y * 4 + Math.floor(p.mo / 3) : unit === 'months' ? p.y * 12 + p.mo : unit === 'weeks' ? Math.floor(Date.UTC(p.y, p.mo, p.d) / (7 * 864e5)) : Math.floor(Date.UTC(p.y, p.mo, p.d) / 864e5));
  if (n >= 2) { step = idx(parts[1]) - idx(parts[0]); for (let i = 1; i < n; i++) { const same = unit === 'days' || unit === 'weeks' ? parts[i].rest === parts[0].rest : parts[i].d === parts[0].d && parts[i].rest === parts[0].rest; if (idx(parts[i]) - idx(parts[i - 1]) !== step || !same) { ok = false; break; } } }
  if (!ok) step = NaN;
  void ctx;
  return nargout >= 2 ? [tensor('logical', [1, 1], [ok ? 1 : 0]), num(step)] : tensor('logical', [1, 1], [ok ? 1 : 0]);
}
function lagFn(args) {
  need(args, 1, 'lag');
  const TT = tableIn(args[0], 'lag', true);
  const n = args[1] !== undefined ? toTensor(args[1]).re[0] : 1;
  const h = TT.dims[0];
  const idx = Array.from({ length: h }, (_, i) => (i - n >= 0 && i - n < h ? i - n : -1));
  const vars = P(TT).vars.map((v) => rowsGather(v, idx));
  return withVars(TT, vars, P(TT).names);
}
function containsrangeFn(args, nargout) {
  need(args, 2, 'containsrange');
  const TT = tableIn(args[0], 'containsrange', true);
  const t = times(TT); const lo = Math.min(...t), hi = Math.max(...t);
  const r = args[1];
  let a, b;
  if (r.cls === 'timerange') { a = r.props.start; b = r.props.end; }
  else if (r.arr) { a = Math.min(...r.arr); b = Math.max(...r.arr); }
  else throw E('base:containsrange:invalidRange', 'The range must be a timerange or row times.');
  const tf = a >= lo && b <= hi;
  const out = tensor('logical', [1, 1], [tf ? 1 : 0]);
  if (nargout < 2) return out;
  const which = Array.from(t, (x) => (x >= a && x <= b ? 1 : 0));
  return [out, tensor('logical', [which.length, 1], which)];
}
const STEP_MS = { secondly: 1e3, minutely: 6e4, hourly: 36e5, daily: 864e5, weekly: 6048e5 };
function calendarSteps(t0, t1, months) {
  // period starts from the one containing t0 up to t1
  const d = new Date(t0);
  let y = d.getUTCFullYear(), m = d.getUTCMonth();
  m -= m % months;
  const out = [];
  for (;;) { const ms = Date.UTC(y, m, 1); if (ms > t1) break; out.push(ms); m += months; while (m >= 12) { m -= 12; y++; } }
  return out;
}
/** New time vector from a retime/synchronize specification. */
function newTimes(spec, t0, t1, rt, o) {
  if (spec && spec.arr) return Array.from(spec.arr);
  const s = optArg(spec);
  if (s === 'regular') {
    let step;
    if (o.has('TimeStep')) step = o.get('TimeStep').arr[0];
    else if (o.has('SampleRate')) step = 1000 / toTensor(o.get('SampleRate')).re[0];
    else throw E('base:retime:needsStep', "'regular' needs 'TimeStep' or 'SampleRate'.");
    const start = Math.floor(t0 / step) * step;
    const out = []; for (let x = start; x <= t1 + 1e-9; x += step) out.push(x); return out;
  }
  if (STEP_MS[s]) { const st = STEP_MS[s]; const start = Math.floor(t0 / st) * st; const out = []; for (let x = start; x <= t1; x += st) out.push(x); return out; }
  if (s === 'monthly' || s === 'quarterly' || s === 'yearly') {
    if (rt.cls !== 'datetime') throw E('base:retime:calendarNeedsDatetime', 'Calendar time steps need datetime row times.');
    return calendarSteps(t0, t1, s === 'monthly' ? 1 : s === 'quarterly' ? 3 : 12);
  }
  throw E('base:retime:invalidTimes', `Invalid new time specification '${textArg(spec) ?? '?'}'.`);
}
const AGG = {
  mean: (a) => (a.length ? a.reduce((p, x) => p + x, 0) / a.length : NaN), sum: (a) => a.reduce((p, x) => p + x, 0), count: (a) => a.length,
  min: (a) => (a.length ? Math.min(...a) : NaN), max: (a) => (a.length ? Math.max(...a) : NaN),
  median: (a) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; },
  firstvalue: (a) => (a.length ? a[0] : NaN), lastvalue: (a) => (a.length ? a[a.length - 1] : NaN),
  mode: (a) => { if (!a.length) return NaN; const c = new Map(); for (const x of a) c.set(x, (c.get(x) || 0) + 1); let best = a[0], bc = 0; for (const [k, v] of c) if (v > bc || (v === bc && k < best)) { best = k; bc = v; } return best; },
};
function retimeTT(TT, nt, method, o, ctx) {
  const t = Array.from(times(TT));
  const order = t.map((_, i) => i).sort((a, b) => t[a] - t[b]);
  const ts = order.map((i) => t[i]);
  const m = optArg(method) ?? (isFuncHandle(method) ? 'func' : 'fillwithmissing');
  const fillC = o.has('Constant') ? toTensor(o.get('Constant')).re[0] : 0;
  const vars = P(TT).vars.map((v) => {
    const numeric = isTensor(v) && v.cls !== 'char';
    if (!numeric) {
      // nonnumeric: exact matches or previous / next / nearest
      const idx = nt.map((x) => pickIndex(ts, x, m === 'next' ? 'next' : m === 'nearest' ? 'nearest' : m === 'previous' ? 'previous' : 'exact'));
      return rowsGather(v, idx.map((k) => (k < 0 ? -1 : order[k])));
    }
    const src = toTensor(v); const h = rowsOf(v); const w = src.re.length / Math.max(h, 1);
    const out = new Float64Array(nt.length * w);
    for (let c = 0; c < w; c++) {
      const y = order.map((i) => src.re[i + c * h]);
      let res;
      if (m === 'linear' || m === 'spline' || m === 'pchip' || m === 'makima') {
        const r = call1(ctx, 'interp1', [col(ts), col(y), col(nt), str(m), ...(o.has('EndValues') ? [o.get('EndValues')] : [])]);
        res = Array.from(toTensor(r).re);
      } else if (AGG[m] || m === 'func') {
        res = nt.map((x, k) => {
          const hi = k + 1 < nt.length ? nt[k + 1] : Infinity;
          const a = []; for (let q = 0; q < ts.length; q++) if (ts[q] >= x && ts[q] < hi && y[q] === y[q]) a.push(y[q]);
          if (m === 'func') return a.length ? toTensor(call1(ctx, method, [col(a)])).re[0] : NaN;
          return AGG[m](a);
        });
      } else {
        res = nt.map((x) => {
          const k = pickIndex(ts, x, m === 'fillwithmissing' || m === 'fillwithconstant' || m === 'default' ? 'exact' : m);
          if (k >= 0) return y[k];
          return m === 'fillwithconstant' ? fillC : NaN;
        });
      }
      res.forEach((val, k) => { out[k + c * nt.length] = val; });
    }
    return finalizeLike(src, [nt.length, ...src.dims.slice(1)], out);
  });
  const rowTimes = { ...P(TT).rowTimes, dims: [nt.length, 1], arr: Float64Array.from(nt) };
  return makeTableObj(vars, P(TT).names, { rowTimes, height: nt.length, units: P(TT).units, vdesc: P(TT).vdesc, dimNames: P(TT).dimNames });
}
function finalizeLike(src, dims, re) { return tensor(src.cls === 'single' ? 'single' : 'double', dims, re); }
function pickIndex(ts, x, how) {
  let lo = 0, hi = ts.length - 1, k = -1;
  // last index with ts <= x
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (ts[mid] <= x) { k = mid; lo = mid + 1; } else hi = mid - 1; }
  if (how === 'exact') return k >= 0 && ts[k] === x ? k : -1;
  if (how === 'previous') return k;
  if (how === 'next') return k >= 0 && ts[k] === x ? k : k + 1 < ts.length ? k + 1 : -1;
  if (how === 'nearest') { const a = k, b = k + 1 < ts.length ? k + 1 : -1; if (a < 0) return b; if (b < 0) return a; return x - ts[a] <= ts[b] - x ? a : b; }
  throw E('base:retime:invalidMethod', `Invalid method '${how}'.`);
}
function retimeFn(args, nargout, ctx) {
  need(args, 2, 'retime');
  const TT = tableIn(args[0], 'retime', true);
  const t = times(TT);
  let i = 1; const spec = args[i++];
  let method = 'fillwithmissing';
  if (args[i] !== undefined && (isFuncHandle(args[i]) || (textArg(args[i]) && !['TimeStep', 'SampleRate', 'Constant', 'EndValues', 'IncludedEdge'].some((k) => k.toLowerCase() === textArg(args[i]).toLowerCase())))) method = args[i++];
  const o = nvPairs(args, i, 'retime', ['TimeStep', 'SampleRate', 'Constant', 'EndValues', 'IncludedEdge']);
  const nt = newTimes(spec, Math.min(...t), Math.max(...t), P(TT).rowTimes, o);
  return retimeTT(TT, nt, method, o, ctx);
}
function synchronizeFn(args, nargout, ctx) {
  const tts = []; let i = 0;
  while (i < args.length && isTT(args[i])) tts.push(args[i++]);
  if (tts.length < 1) throw E('base:synchronize:notEnoughInputs', 'Inputs must be timetables.');
  let spec = str('union');
  if (args[i] !== undefined && (args[i].arr || textArg(args[i]))) { if (!(textArg(args[i]) && ['TimeStep', 'SampleRate', 'Constant', 'EndValues'].some((k) => k.toLowerCase() === textArg(args[i]).toLowerCase()))) spec = args[i++]; }
  let method = 'fillwithmissing';
  if (args[i] !== undefined && (isFuncHandle(args[i]) || (textArg(args[i]) && !['TimeStep', 'SampleRate', 'Constant', 'EndValues'].some((k) => k.toLowerCase() === textArg(args[i]).toLowerCase())))) method = args[i++];
  const o = nvPairs(args, i, 'synchronize', ['TimeStep', 'SampleRate', 'Constant', 'EndValues']);
  const all = tts.map((T) => Array.from(times(T)));
  const s = optArg(spec);
  let nt;
  if (s === 'union') nt = [...new Set(all.flat())].sort((a, b) => a - b);
  else if (s === 'intersection') nt = all.reduce((acc, a) => acc.filter((x) => a.includes(x))).sort((a, b) => a - b);
  else if (s === 'commonrange') { const lo = Math.max(...all.map((a) => Math.min(...a))), hi = Math.min(...all.map((a) => Math.max(...a))); nt = [...new Set(all.flat())].filter((x) => x >= lo && x <= hi).sort((a, b) => a - b); }
  else if (s === 'first') nt = all[0].slice().sort((a, b) => a - b);
  else if (s === 'last') nt = all[all.length - 1].slice().sort((a, b) => a - b);
  else { const lo = Math.min(...all.flat()), hi = Math.max(...all.flat()); nt = newTimes(spec, lo, hi, P(tts[0]).rowTimes, o); }
  const parts = tts.map((T) => retimeTT(T, nt, method, o, ctx));
  const names = []; const vars = [];
  const seen = new Map();
  for (const T of parts) for (const n of P(T).names) seen.set(n, (seen.get(n) || 0) + 1);
  parts.forEach((T, k) => P(T).names.forEach((n, j) => { names.push(seen.get(n) > 1 ? `${n}_TT${k + 1}` : n); vars.push(P(T).vars[j]); }));
  return makeTableObj(vars, names, { rowTimes: P(parts[0]).rowTimes, height: nt.length });
}

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const builtins = {
  rows2vars: rows2varsFn,
  splitvars: splitvarsFn,
  mergevars: mergevarsFn,
  convertvars: convertvarsFn,
  stack: stackFn,
  unstack: unstackFn,
  groupcounts: groupcountsFn,
  grouptransform: grouptransformFn,
  groupfilter: groupfilterFn,
  isregular: isregularFn,
  lag: lagFn,
  containsrange: containsrangeFn,
  retime: retimeFn,
  synchronize: synchronizeFn,
};
export const help = {
  rows2vars: H('Reorients a table so that rows become variables.', '행이 변수가 되도록 테이블 방향 전환.', ['T2 = rows2vars(T)', "T2 = rows2vars(T, 'VariableNamesSource', var)"]),
  splitvars: H('Splits multicolumn variables into separate variables.', '다중 열 변수를 개별 변수로 분할.', ['T2 = splitvars(T)', 'T2 = splitvars(T, vars)', "T2 = splitvars(T, vars, 'NewVariableNames', names)"]),
  mergevars: H('Combines table variables into one multicolumn variable.', '테이블 변수를 하나의 다중 열 변수로 결합.', ['T2 = mergevars(T, vars)', "T2 = mergevars(T, vars, 'NewVariableName', name)", "T2 = mergevars(..., 'MergeAsTable', true)"]),
  convertvars: H('Converts table variables to another data type.', '테이블 변수를 다른 데이터 형식으로 변환.', ['T2 = convertvars(T, vars, dataType)', 'T2 = convertvars(T, vars, @func)']),
  stack: H('Stacks data from several variables into one (wide to long).', '여러 변수의 데이터를 하나로 쌓기 (넓은 형식 → 긴 형식).', ['S = stack(T, vars)', "S = stack(T, vars, 'NewDataVariableName', name, 'IndexVariableName', iname)", '[S, iu] = stack(...)']),
  unstack: H('Unstacks data from one variable into several (long to wide).', '하나의 변수를 여러 변수로 펼치기 (긴 형식 → 넓은 형식).', ['U = unstack(S, vars, ivar)', "U = unstack(..., 'AggregationFunction', @mean)", "U = unstack(..., 'GroupingVariables', g)"]),
  groupcounts: H('Number of group elements.', '그룹별 원소 개수.', ['G = groupcounts(T, groupvars)', '[B, BG, BP] = groupcounts(A)']),
  grouptransform: H('Transforms data by group.', '그룹별 데이터 변환.', ["G = grouptransform(T, groupvars, 'zscore')", 'G = grouptransform(T, groupvars, @func, datavars)']),
  groupfilter: H('Keeps the rows of groups that satisfy a condition.', '조건을 만족하는 그룹의 행만 남김.', ['G = groupfilter(T, groupvars, @func)', 'G = groupfilter(T, groupvars, @func, datavars)']),
  isregular: H('True when the row times are regularly spaced.', '행 시간이 일정한 간격인지 확인.', ['TF = isregular(TT)', "[TF, dt] = isregular(TT, 'months')"]),
  lag: H('Shifts timetable data by a number of rows.', '타임테이블 데이터를 행 수만큼 이동.', ['TT2 = lag(TT)', 'TT2 = lag(TT, n)']),
  containsrange: H('True when the row times span a time range.', '행 시간이 시간 범위를 포함하는지 확인.', ['tf = containsrange(TT, rowTimes)', '[tf, whichRows] = containsrange(TT, timeRange)']),
  retime: H('Resamples or aggregates a timetable at new row times.', '새 행 시간으로 타임테이블 재표본 또는 집계.', ["TT2 = retime(TT, newTimes, 'linear')", "TT2 = retime(TT, 'hourly', 'mean')", "TT2 = retime(TT, 'regular', 'linear', 'TimeStep', dt)"]),
  synchronize: H('Synchronizes timetables to a common time vector.', '타임테이블을 공통 시간 벡터로 동기화.', ['TT = synchronize(TT1, TT2)', "TT = synchronize(TT1, TT2, 'union', 'linear')", "TT = synchronize(TT1, TT2, 'hourly', 'mean')"]),
};
