// Set operations: unique, union, intersect, setdiff, setxor, ismember on
// numeric / logical / char arrays, cell arrays of text and string arrays,
// with 'rows', 'stable' / 'sorted', 'first' / 'last' and index outputs.
import { tensor, normDims, prod, isTensor, isSparse, isString, isCell, isChar, toTensor, num, bool, cell, stringArray, str } from '../../value.js';
import { E, optArg, textArg, gather } from './util.js';
import { catValues } from './ops.js';

const charRowKeep = (s) => (s.length === 0 ? tensor('char', [1, 0]) : str(s));
const isVec = (d) => d.length === 2 && (d[0] === 1 || d[1] === 1);

/** Normalized view of a set argument. */
function view(v, rows, fname) {
  if (isCell(v) || isString(v)) {
    const list = isString(v) ? v.data.slice() : v.data.map((x) => {
      const t = textArg(x);
      if (t === null) { if (isChar(x) && x.re.length === 0) return ''; throw E(`base:${fname}:InputClass`, 'Cell array input must be a cell array of character vectors.'); }
      return t;
    });
    return { text: true, list, dims: v.dims, isString: isString(v), n: list.length };
  }
  if (isSparse(v)) v = toTensor(v);
  if (!isTensor(v)) throw E(`base:${fname}:InvalidInput`, `Set operations are not supported for values of class '${v.cls}'.`);
  if (rows) {
    if (v.dims.length > 2) throw E(`base:${fname}:NotAMatrix`, "Inputs must be 2-D matrices with 'rows'.");
    return { text: false, rows: true, t: v, dims: v.dims, n: v.dims[0], m: v.dims[1] };
  }
  return { text: false, rows: false, t: v, dims: v.dims, n: v.re.length };
}

/** Pools one or two views into a single item store with key / compare functions. */
function pool(views, fname) {
  const anyText = views.some((w) => w.text);
  if (anyText) {
    const conv = (w) => {
      if (w.text) return w.list;
      if (isChar(w.t)) {
        if (w.t.dims[0] <= 1) { let s = ''; for (let i = 0; i < w.t.re.length; i++) s += String.fromCharCode(w.t.re[i]); return [s]; }
        const [m, n] = w.t.dims; const out = [];
        for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < n; j++) s += String.fromCharCode(w.t.re[i + j * m]); out.push(s); }
        return out;
      }
      if (w.n === 0) return [];
      throw E(`base:${fname}:InputClass`, 'Inputs must be text of the same kind, or numeric arrays.');
    };
    const lists = views.map(conv);
    const all = [].concat(...lists);
    const isStr = views.some((w) => w.isString);
    return {
      n: all.length, offsets: lists.map((l, i) => lists.slice(0, i).reduce((a, b) => a + b.length, 0)), counts: lists.map((l) => l.length),
      key: (i) => (all[i] == null ? Symbol('missing') : 's:' + all[i]),
      cmp: (i, j) => { const a = all[i], b = all[j]; if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1; return a < b ? -1 : a > b ? 1 : 0; },
      make: (idx, dims) => (isStr ? stringArray(dims, idx.map((i) => all[i])) : cell(dims, idx.map((i) => charRowKeep(all[i] == null ? '' : all[i])))),
      text: true,
    };
  }
  if (views[0].rows) {
    const ncols = views[0].m;
    for (const w of views) if (w.m !== ncols && w.n > 0) throw E(`base:${fname}:RowsNumColumns`, "Inputs must have the same number of columns with 'rows'.");
    const P = views.length === 1 ? views[0].t : catValues(0, views.map((w) => w.t), null);
    const m = P.dims[0];
    const val = (i, c) => P.re[i + c * m];
    return {
      n: m, offsets: views.map((w, i) => views.slice(0, i).reduce((a, b) => a + b.n, 0)), counts: views.map((w) => w.n),
      key: (i) => { let k = ''; for (let c = 0; c < ncols; c++) { const x = val(i, c); if (x !== x) return Symbol('nan'); k += x + (P.im ? '/' + P.im[i + c * m] : '') + ','; } return k; },
      cmp: (i, j) => { for (let c = 0; c < ncols; c++) { const a = val(i, c), b = val(j, c); if (a !== b) { if (a !== a) return 1; if (b !== b) return -1; return a < b ? -1 : 1; } } return 0; },
      make: (idx) => { const n = idx.length; const out = []; for (let c = 0; c < ncols; c++) for (const i of idx) out.push(i + c * m); return gather(P, out, [n, ncols]); },
      rows: true,
    };
  }
  const flat = views.map((w) => ({ ...w.t, dims: [w.t.re.length, 1] }));
  const P = flat.length === 1 ? flat[0] : catValues(0, flat, null);
  const re = P.re, im = P.im;
  const cmpNum = im
    ? (i, j) => { const a = Math.hypot(re[i], im[i]), b = Math.hypot(re[j], im[j]); if (a !== b) { if (a !== a) return 1; if (b !== b) return -1; return a < b ? -1 : 1; } const pa = Math.atan2(im[i], re[i]), pb = Math.atan2(im[j], re[j]); return pa < pb ? -1 : pa > pb ? 1 : 0; }
    : (i, j) => { const a = re[i], b = re[j]; if (a === b) return 0; if (a !== a) return b !== b ? 0 : 1; if (b !== b) return -1; return a < b ? -1 : 1; };
  return {
    n: re.length, offsets: views.map((w, i) => views.slice(0, i).reduce((a, b) => a + b.n, 0)), counts: views.map((w) => w.n),
    key: (i) => { const x = re[i]; if (x !== x || (im && im[i] !== im[i])) return Symbol('nan'); return im ? `${x === 0 ? 0 : x}/${im[i]}` : x === 0 ? 0 : x; },
    cmp: cmpNum,
    make: (idx, dims) => gather(P, idx, dims),
    cls: P.cls,
  };
}

/** Orientation of a set result: row when the inputs are row vectors. */
function orientDims(views, n, rows) {
  if (rows) return null;
  const allRow = views.every((w) => w.n === 0 ? true : isVec(w.dims) && w.dims[0] === 1 && !(w.dims[1] === 1 && w.n === 1 && false));
  const anyRowNonScalar = views.some((w) => w.dims.length === 2 && w.dims[0] === 1);
  if (views.length === 1) {
    const d = views[0].dims;
    if (d.length === 2 && d[0] === 1 && !(views[0].text && false)) return [1, n];
    return [n, 1];
  }
  if (allRow && anyRowNonScalar) return [1, n];
  return [n, 1];
}

function parseSetOpts(args, start, fname) {
  const o = { rows: false, stable: false, last: false, legacy: false };
  for (let i = start; i < args.length; i++) {
    const s = optArg(args[i]);
    if (s === 'rows') o.rows = true;
    else if (s === 'stable') o.stable = true;
    else if (s === 'sorted') o.stable = false;
    else if (s === 'first') o.last = false;
    else if (s === 'last') o.last = true;
    else if (s === 'legacy') o.legacy = true;
    else throw E(`base:${fname}:UnknownFlag`, `Unknown flag '${textArg(args[i])}'.`);
  }
  return o;
}

/** Unique items of index list (first or last occurrence), sorted or stable. Returns [{rep, members}]. */
function groups(P, idxs, o) {
  const map = new Map();
  const order = [];
  for (const i of idxs) {
    const k = P.key(i);
    let g = map.get(k);
    if (!g) { g = { rep: i, members: [] }; map.set(k, g); order.push(g); }
    g.members.push(i);
    if (o.last) g.rep = i;
  }
  if (!o.stable) order.sort((a, b) => P.cmp(a.rep, b.rep) || a.rep - b.rep);
  return order;
}

const col = (arr) => tensor('double', [arr.length, 1], arr);
const range = (a, n) => Array.from({ length: n }, (_, i) => a + i);

function uniqueFn(args, nargout) {
  if (args.length < 1) throw E('base:unique:notEnoughInputs', 'Not enough input arguments.');
  const o = parseSetOpts(args, 1, 'unique');
  const w = view(args[0], o.rows, 'unique');
  const P = pool([w], 'unique');
  const gs = groups(P, range(0, P.n), o);
  const reps = gs.map((g) => g.rep);
  let C;
  if (P.rows) C = P.make(reps);
  else if (isChar(args[0]) && !w.text) C = P.make(reps, orientDims([w], reps.length));
  else C = P.make(reps, orientDims([w], reps.length));
  if (nargout <= 1) return C;
  const ic = new Array(P.n);
  gs.forEach((g, k) => { for (const m of g.members) ic[m] = k + 1; });
  return [C, col(reps.map((i) => i + 1)), col(ic)].slice(0, Math.max(nargout, 1));
}

function twoSet(fname) {
  return (args, nargout) => {
    if (args.length < 2) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.');
    const o = parseSetOpts(args, 2, fname);
    const wa = view(args[0], o.rows, fname), wb = view(args[1], o.rows, fname);
    const P = pool([wa, wb], fname);
    const na = P.counts[0], nb = P.counts[1];
    const A = range(0, na), B = range(na, nb);
    const keysB = new Map(); for (const j of B) { const k = P.key(j); if (!keysB.has(k)) keysB.set(k, j); }
    const keysA = new Map(); for (const i of A) { const k = P.key(i); if (!keysA.has(k)) keysA.set(k, i); }
    let reps, ia = [], ib = [];
    if (fname === 'union') {
      const ga = groups(P, A, { ...o, stable: true });
      const gb = groups(P, B.filter((j) => !keysA.has(P.key(j))), { ...o, stable: true });
      let all = ga.map((g) => ({ rep: g.rep, from: 'a' })).concat(gb.map((g) => ({ rep: g.rep, from: 'b' })));
      if (!o.stable) all.sort((x, y) => P.cmp(x.rep, y.rep) || x.rep - y.rep);
      reps = all.map((x) => x.rep);
      ia = all.filter((x) => x.from === 'a').map((x) => x.rep + 1);
      ib = all.filter((x) => x.from === 'b').map((x) => x.rep - na + 1);
    } else if (fname === 'intersect') {
      const ga = groups(P, A.filter((i) => keysB.has(P.key(i))), o);
      reps = ga.map((g) => g.rep);
      ia = reps.map((i) => i + 1);
      ib = reps.map((i) => keysB.get(P.key(i)) - na + 1);
    } else if (fname === 'setdiff') {
      const ga = groups(P, A.filter((i) => !keysB.has(P.key(i))), o);
      reps = ga.map((g) => g.rep);
      ia = reps.map((i) => i + 1);
    } else {
      const ga = groups(P, A.filter((i) => !keysB.has(P.key(i))), { ...o, stable: true });
      const gb = groups(P, B.filter((j) => !keysA.has(P.key(j))), { ...o, stable: true });
      let all = ga.map((g) => ({ rep: g.rep, from: 'a' })).concat(gb.map((g) => ({ rep: g.rep, from: 'b' })));
      if (!o.stable) all.sort((x, y) => P.cmp(x.rep, y.rep) || x.rep - y.rep);
      reps = all.map((x) => x.rep);
      ia = all.filter((x) => x.from === 'a').map((x) => x.rep + 1);
      ib = all.filter((x) => x.from === 'b').map((x) => x.rep - na + 1);
    }
    let C;
    if (P.rows) C = P.make(reps);
    else {
      const views = fname === 'setdiff' ? [wa] : [wa, wb];
      let d = orientDims(views, reps.length);
      if (fname === 'setdiff' && !(wa.dims.length === 2 && wa.dims[0] === 1) && wa.n > 0) d = [reps.length, 1];
      if (fname === 'setdiff' && wa.dims.length === 2 && wa.dims[0] === 1) d = [1, reps.length];
      C = P.make(reps, d);
    }
    const outs = [C, col(ia)];
    if (fname !== 'setdiff') outs.push(col(ib));
    return nargout <= 1 ? C : outs.slice(0, nargout);
  };
}

function ismemberFn(args, nargout) {
  if (args.length < 2) throw E('base:ismember:notEnoughInputs', 'Not enough input arguments.');
  const o = parseSetOpts(args, 2, 'ismember');
  const A0 = args[0];
  // a char row tested against a cell array is one text element
  let wa;
  if (isChar(A0) && A0.dims[0] <= 1 && (isCell(args[1]) || isString(args[1]))) wa = { text: true, list: [textArg(A0) ?? ''], dims: [1, 1], n: 1 };
  else wa = view(A0, o.rows, 'ismember');
  let wb;
  if (isChar(args[1]) && args[1].dims[0] <= 1 && (isCell(A0) || isString(A0))) wb = { text: true, list: [textArg(args[1]) ?? ''], dims: [1, 1], n: 1 };
  else wb = view(args[1], o.rows, 'ismember');
  const P = pool([wa, wb], 'ismember');
  const na = P.counts[0], nb = P.counts[1];
  const first = new Map();
  for (let j = na; j < na + nb; j++) { const k = P.key(j); if (!first.has(k)) first.set(k, j - na + 1); }
  const tf = new Float64Array(na), loc = new Float64Array(na);
  for (let i = 0; i < na; i++) { const k = P.key(i); if (first.has(k)) { tf[i] = 1; loc[i] = first.get(k); } }
  const dims = o.rows ? [na, 1] : wa.text && isChar(A0) ? [1, 1] : wa.dims;
  const TF = { cls: 'logical', dims: normDims(dims), re: tf, im: null };
  return nargout >= 2 ? [TF, tensor('double', dims, loc)] : TF;
}

export const builtins = {
  unique: uniqueFn,
  union: twoSet('union'),
  intersect: twoSet('intersect'),
  setdiff: twoSet('setdiff'),
  setxor: twoSet('setxor'),
  ismember: ismemberFn,
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  unique: H('Unique values in an array.', '배열의 고유한 값.', ['C = unique(A)', "C = unique(A, 'rows')", "C = unique(A, 'stable')", '[C, ia, ic] = unique(...)']),
  union: H('Set union of two arrays.', '두 배열의 합집합.', ['C = union(A, B)', "C = union(A, B, 'rows')", '[C, ia, ib] = union(...)']),
  intersect: H('Set intersection of two arrays.', '두 배열의 교집합.', ['C = intersect(A, B)', "C = intersect(A, B, 'stable')", '[C, ia, ib] = intersect(...)']),
  setdiff: H('Set difference of two arrays.', '두 배열의 차집합.', ['C = setdiff(A, B)', '[C, ia] = setdiff(...)']),
  setxor: H('Set exclusive OR of two arrays.', '두 배열의 대칭 차집합.', ['C = setxor(A, B)', '[C, ia, ib] = setxor(...)']),
  ismember: H('Array elements that are members of a set.', '집합의 원소인 배열 원소.', ['Lia = ismember(A, B)', "Lia = ismember(A, B, 'rows')", '[Lia, Locb] = ismember(...)']),
};
void prod; void num; void bool;
