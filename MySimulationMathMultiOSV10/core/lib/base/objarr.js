// Helpers for value classes whose elements live in typed arrays on the
// object (`arr`, optional `arr2`, `arr3`): datetime, duration,
// calendarDuration, categorical. Indexing, indexed assignment (with growth),
// deletion, reshaping and concatenation.
import { normDims, prod, isTensor, isChar, isString, toTensor, object, num } from '../../value.js';
import { E, resolveIndex, resolveDelete, gather, textArg, splitDims } from './util.js';

const KEYS = ['arr', 'arr2', 'arr3'];

/** Builds an array object of class cls. */
export function arrObj(cls, dims, arr, props = {}, extra = {}) {
  const o = object(cls, props, { dims: normDims(dims), extra: { arr, ...extra } });
  return o;
}
export const nel = (o) => prod(o.dims || [1, 1]);

/** o(subs) */
export function objIndex(o, subs) {
  const { idx, dims } = resolveIndex(o.dims || [1, 1], subs);
  return gather(o, idx, dims);
}

/** Linear target index list for an assignment, growing the array when needed. Returns {o (grown), idx}. */
function growFor(o, subs, fill) {
  const d = (o.dims || [1, 1]).slice();
  if (subs.length === 1) {
    const s = subs[0];
    const n = nel(o);
    if (isChar(s) && s.re.length === 1 && s.re[0] === 58) return { o, idx: Int32Array.from({ length: n }, (_, i) => i) };
    const t = toTensor(s);
    let idx;
    if (t.cls === 'logical') { const a = []; for (let i = 0; i < t.re.length; i++) if (t.re[i]) a.push(i); idx = Int32Array.from(a); } else idx = Int32Array.from(t.re, (x) => { if (!(x >= 1) || !Number.isInteger(x)) throw E('base:index:badSubscript', 'Array indices must be positive integers or logical values.'); return x - 1; });
    let max = -1; for (const i of idx) if (i > max) max = i;
    if (max >= n) {
      if (!(d.length === 2 && (d[0] <= 1 || d[1] <= 1))) throw E('base:index:outOfBoundsGrow', 'Attempt to grow array along ambiguous dimension.');
      const nd = d[0] > 1 || (d[0] === 1 && d[1] === 1 && false) ? [max + 1, 1] : d[0] === 0 && d[1] === 0 ? [1, max + 1] : d[1] === 1 && d[0] > 1 ? [max + 1, 1] : [1, max + 1];
      return { o: resize(o, nd, fill), idx };
    }
    return { o, idx };
  }
  const k = subs.length;
  while (d.length < k) d.push(1);
  const need = d.slice(0, k);
  const lists = subs.map((s, i) => {
    if (isChar(s) && s.re.length === 1 && s.re[0] === 58) return null;
    const t = toTensor(s);
    if (t.cls === 'logical') { const a = []; for (let q = 0; q < t.re.length; q++) if (t.re[q]) a.push(q); return a; }
    return Array.from(t.re, (x) => { if (!(x >= 1) || !Number.isInteger(x)) throw E('base:index:badSubscript', 'Array indices must be positive integers or logical values.'); return x - 1; });
  });
  lists.forEach((l, i) => { if (l) for (const x of l) if (x + 1 > need[i]) need[i] = x + 1; });
  let g = o;
  if (need.some((x, i) => x !== d[i])) g = resize(o, [...need, ...d.slice(k)], fill);
  const gd = g.dims.slice(); while (gd.length < k) gd.push(1);
  const full = lists.map((l, i) => l || Array.from({ length: gd[i] }, (_, q) => q));
  const counts = full.map((l) => l.length);
  const total = prod(counts);
  const idx = new Int32Array(total);
  const stride = []; let p = 1; for (let i = 0; i < k; i++) { stride.push(p); p *= gd[i]; }
  const sub = new Array(k).fill(0);
  for (let q = 0; q < total; q++) {
    let lin = 0; for (let i = 0; i < k; i++) lin += full[i][sub[i]] * stride[i];
    idx[q] = lin;
    for (let i = 0; i < k; i++) { sub[i]++; if (sub[i] < counts[i]) break; sub[i] = 0; }
  }
  return { o: g, idx };
}

/** Copy of o resized to dims nd (new elements filled). */
export function resize(o, nd, fill) {
  nd = normDims(nd);
  const od = (o.dims || [1, 1]).slice();
  const n = prod(nd);
  const out = { ...o, dims: nd };
  for (const key of KEYS) {
    if (!o[key]) continue;
    const C = o[key].constructor;
    const a = new C(n);
    const f = Array.isArray(fill) ? fill[KEYS.indexOf(key)] : fill;
    if (f !== 0) a.fill(f);
    const k = Math.max(od.length, nd.length);
    const d1 = od.slice(); while (d1.length < k) d1.push(1);
    const d2 = nd.slice(); while (d2.length < k) d2.push(1);
    const total = prod(d1);
    const sub = new Array(k).fill(0);
    for (let q = 0; q < total; q++) {
      let ok = true, lin = 0, mul = 1;
      for (let i = 0; i < k; i++) { if (sub[i] >= d2[i]) { ok = false; break; } lin += sub[i] * mul; mul *= d2[i]; }
      if (ok) a[lin] = o[key][q];
      for (let i = 0; i < k; i++) { sub[i]++; if (sub[i] < d1[i]) break; sub[i] = 0; }
    }
    out[key] = a;
  }
  return out;
}

/** o(subs) = rhs where rhs is an object of the same class (already converted). */
export function objAssign(o, subs, rhs, fill) {
  const { o: g, idx } = growFor(o, subs, fill);
  const rn = nel(rhs);
  if (rn !== 1 && rn !== idx.length) throw E('base:index:assignmentSizeMismatch', `Unable to perform assignment because the left and right sides have a different number of elements.`);
  const out = { ...g };
  for (const key of KEYS) {
    if (!g[key]) continue;
    const a = g[key].slice();
    const src = rhs[key];
    for (let q = 0; q < idx.length; q++) a[idx[q]] = src[rn === 1 ? 0 : q];
    out[key] = a;
  }
  return out;
}

/** o(subs) = [] */
export function objDelete(o, subs) {
  const { keep, dims } = resolveDelete(o.dims || [1, 1], subs);
  return gather(o, keep, dims);
}

/** Concatenation along 0-based dim k of objects of the same class (already converted). */
export function objCat(k, items, proto) {
  const use = items.filter((x) => nel(x) > 0 || items.length === 1);
  if (use.length === 0) return { ...proto, dims: [0, 0], arr: new proto.arr.constructor(0), ...(proto.arr2 ? { arr2: new proto.arr2.constructor(0) } : {}), ...(proto.arr3 ? { arr3: new proto.arr3.constructor(0) } : {}) };
  if (use.length === 1) return use[0];
  const nd = Math.max(k + 1, ...use.map((x) => x.dims.length));
  const d0 = use[0].dims.slice(); while (d0.length < nd) d0.push(1);
  let total = 0;
  for (const x of use) {
    const d = x.dims.slice(); while (d.length < nd) d.push(1);
    for (let i = 0; i < nd; i++) if (i !== k && d[i] !== d0[i]) throw E('base:catenate:dimensionMismatch', 'Dimensions of arrays being concatenated are not consistent.');
    total += d[k];
  }
  const od = d0.slice(); od[k] = total;
  const { before, after } = splitDims(od, k);
  const out = { ...use[0], dims: normDims(od) };
  for (const key of KEYS) {
    if (!use[0][key]) continue;
    const a = new use[0][key].constructor(prod(od));
    let off = 0;
    for (const x of use) {
      const d = x.dims.slice(); while (d.length < nd) d.push(1);
      const len = d[k], chunk = before * len;
      for (let o = 0; o < after; o++) for (let i = 0; i < chunk; i++) a[o * before * total + off * before + i] = x[key][o * chunk + i];
      off += len;
    }
    out[key] = a;
  }
  return out;
}

/** Name of a '.' subscript. */
export const dotName = (s) => (typeof s.subs === 'string' ? s.subs : textArg(s.subs));

/** Elementwise pairing of two arr-objects / numbers with implicit expansion of scalars. */
export function pairIdx(na, nb, da, db) {
  if (na === nb) return { n: na, dims: da, ia: (k) => k, ib: (k) => k };
  if (nb === 1) return { n: na, dims: da, ia: (k) => k, ib: () => 0 };
  if (na === 1) return { n: nb, dims: db, ia: () => 0, ib: (k) => k };
  throw E('base:sizeDimensionsMustMatch', 'Arrays have incompatible sizes for this operation.');
}
export { isTensor, isString, num };
