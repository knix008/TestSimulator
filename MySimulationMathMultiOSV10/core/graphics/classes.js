// Graphics handle classes: h.Prop, h.Prop = v, h(i), h(i).Prop, [h1 h2],
// display. Every type uses the same definition ('graphics.Line' etc.).
import { tensor, bool, num, str, cell, isCell, isStruct, isTensor, empty, toTensor, isChar } from '../value.js';
import { gerr, isTxt, txt, nums } from './util.js';
import { G, handleValue, handleIds, isHandleValue, getProp, setProp, displayHandle, destroy, CLASS_PREFIX } from './model.js';
import { TYPE_CLASS } from './schema.js';
import { builtins as manage } from './manage.js';

const nameOf = (s) => {
  const x = s.subs;
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) { const f = x[0]; return typeof f === 'string' ? f : txt(f); }
  return txt(x);
};
const subsList = (s) => (Array.isArray(s.subs) ? s.subs : [s.subs]);

/** 0-based linear indices for '()' subscripts over dims. */
export function linearIndices(dims, subs) {
  const total = dims.reduce((a, b) => a * b, 1);
  const one = (sub, len) => {
    if (sub === ':' || (isTxt(sub) && txt(sub) === ':') || (sub && sub.colon)) return Array.from({ length: len }, (_, i) => i);
    if (sub && sub.cls === 'logical') { const out = []; sub.re.forEach((b, i) => { if (b) out.push(i); }); return out; }
    const a = typeof sub === 'number' ? [sub] : Array.from(nums(sub));
    return a.map((k) => { if (!Number.isInteger(k) || k < 1) throw gerr('index', 'Array indices must be positive integers or logical values.'); return k - 1; });
  };
  if (subs.length === 1) return { idx: one(subs[0], total), shape: null };
  const r = one(subs[0], dims[0]), c = one(subs[1], dims[1] ?? 1);
  const idx = [];
  for (const j of c) for (const i of r) idx.push(i + j * dims[0]);
  return { idx, shape: [r.length, c.length] };
}

/** Generic '()' / '{}' / '.' indexing of plain values (what follows a property access). */
export function indexValue(v, s) {
  if (s.type === '.') {
    if (!isStruct(v)) throw gerr('index', 'Dot indexing is not supported for this value.');
    const f = nameOf(s);
    if (!v.fields.includes(f)) throw gerr('index', `Unrecognized field name "${f}".`);
    return v.data[0][f];
  }
  const { idx, shape } = linearIndices(v.dims, subsList(s));
  const n = v.dims.reduce((a, b) => a * b, 1);
  for (const k of idx) if (k >= n) throw gerr('index', `Index exceeds the number of array elements (${n}).`);
  const dims = shape || (v.dims[0] === 1 ? [1, idx.length] : [idx.length, 1]);
  if (isCell(v)) {
    if (s.type === '{}') { if (idx.length !== 1) throw gerr('index', 'Brace indexing must return one element here.'); return v.data[idx[0]]; }
    return cell(dims, idx.map((k) => v.data[k]));
  }
  if (isTensor(v)) return tensor(v.cls, dims, idx.map((k) => v.re[k]), v.im ? idx.map((k) => v.im[k]) : null);
  if (v.cls === 'string') return { cls: 'string', dims, data: idx.map((k) => v.data[k]) };
  throw gerr('index', 'This value cannot be indexed.');
}

/** v with v(subs) = rhs (tensors and cells; grows when needed). */
export function assignIndex(v, subs, rhs) {
  const t = isCell(v) ? v : toTensor(v.dims && v.dims.includes(0) ? tensor('double', [0, 0]) : v);
  let dims = t.dims.slice();
  const { idx } = linearIndices(dims.includes(0) ? [1, Math.max(...subsList({ subs }).flatMap((x) => (isTxt(x) ? [0] : Array.from(nums(x)))), 0)] : dims, subs);
  const maxK = Math.max(-1, ...idx);
  const n = dims.reduce((a, b) => a * b, 1);
  let data = isCell(t) ? t.data.slice() : Array.from(t.re);
  if (maxK >= n) {
    if (dims[0] <= 1) dims = [1, maxK + 1]; else if (dims[1] === 1) dims = [maxK + 1, 1]; else throw gerr('index', 'Assignment beyond the matrix size needs row and column subscripts.');
    while (data.length < maxK + 1) data.push(isCell(t) ? empty() : 0);
  }
  if (isCell(t)) { const vals = isCell(rhs) ? rhs.data : [rhs]; idx.forEach((k, i) => { data[k] = vals[vals.length === 1 ? 0 : i]; }); return cell(dims, data); }
  const r = Array.from(nums(rhs));
  if (r.length !== 1 && r.length !== idx.length) throw gerr('index', 'Unable to perform assignment because the left and right sides have a different number of elements.');
  idx.forEach((k, i) => { data[k] = r[r.length === 1 ? 0 : i]; });
  return tensor(isChar(t) ? 'char' : 'double', dims, data);
}

function subsref(obj, subs, nargout, ctx) {
  let cur = obj;
  for (let k = 0; k < subs.length; k++) {
    const s = subs[k];
    if (isHandleValue(cur)) {
      if (s.type === '()') {
        const ids = cur.gh;
        const { idx, shape } = linearIndices(cur.dims, subsList(s));
        for (const q of idx) if (q >= ids.length) throw gerr('index', `Index exceeds the number of array elements (${ids.length}).`);
        cur = handleValue(ctx, idx.map((q) => ids[q]), shape || (cur.dims[0] === 1 ? [1, idx.length] : [idx.length, 1]));
        continue;
      }
      if (s.type === '.') {
        const name = nameOf(s);
        const st = G(ctx);
        if (cur.gh.length !== 1) {
          if (k === subs.length - 1) return cur.gh.map((id) => getProp(ctx, st.objs.get(id) || dead(), name));
          throw gerr('index', 'Dot indexing of a handle array needs a single element.');
        }
        const o = st.objs.get(cur.gh[0]);
        if (!o) throw gerr('invalidHandle', 'Invalid or deleted object.');
        cur = getProp(ctx, o, name);
        continue;
      }
      throw gerr('index', 'Brace indexing is not supported for graphics handles.');
    }
    cur = indexValue(cur, s);
  }
  return [cur];
}
const dead = () => { throw gerr('invalidHandle', 'Invalid or deleted object.'); };

function subsasgn(obj, subs, rhs, ctx) {
  const st = G(ctx);
  if (subs[0].type === '.') {
    const name = nameOf(subs[0]);
    for (const id of obj.gh) {
      const o = st.objs.get(id);
      if (!o) throw gerr('invalidHandle', 'Invalid or deleted object.');
      if (subs.length === 1) setProp(ctx, o, name, rhs);
      else {
        let v = getProp(ctx, o, name);
        v = assignNested(v, subs.slice(1), rhs);
        setProp(ctx, o, name, v);
      }
    }
    return obj;
  }
  if (subs[0].type === '()') {
    const { idx } = linearIndices(obj.dims.includes(0) ? [1, Math.max(0, ...Array.from(nums(subsList(subs[0])[0])))] : obj.dims, subsList(subs[0]));
    if (subs.length === 1) {
      const ids = obj.gh.slice();
      const r = isHandleValue(rhs) ? rhs.gh : handleIds(rhs);
      const max = Math.max(...idx);
      while (ids.length <= max) ids.push(-1);
      idx.forEach((q, i) => { ids[q] = r[r.length === 1 ? 0 : i]; });
      const dims = obj.dims[0] <= 1 && !(obj.dims[0] === 0 && obj.dims[1] === 0 && false) ? [1, ids.length] : [ids.length, 1];
      return handleValue(ctx, ids, obj.dims[0] > 1 && obj.dims[1] === 1 ? [ids.length, 1] : dims);
    }
    const sel = handleValue(ctx, idx.map((q) => obj.gh[q]));
    subsasgn(sel, subs.slice(1), rhs, ctx);
    return obj;
  }
  throw gerr('index', 'Brace indexing is not supported for graphics handles.');
}

function assignNested(v, subs, rhs) {
  const s = subs[0];
  if (subs.length === 1) {
    if (s.type === '.') { if (!isStruct(v)) throw gerr('index', 'Dot assignment needs a struct.'); const d = { ...v.data[0] }; d[nameOf(s)] = rhs; return { ...v, fields: v.fields.includes(nameOf(s)) ? v.fields : [...v.fields, nameOf(s)], data: [d] }; }
    return assignIndex(v, subsList(s), rhs);
  }
  const inner = indexValue(v, s);
  return assignNested(v, [s], assignNested(inner, subs.slice(1), rhs));
}

const cat = (ctx, args, vertical) => {
  const ids = [];
  for (const a of args) if (a && !(a.dims && a.dims.includes(0) && !isHandleValue(a))) ids.push(...handleIds(a));
  return handleValue(ctx, ids, vertical ? [ids.length, 1] : [1, ids.length]);
};

const methods = {
  delete(args, nargout, ctx) { for (const id of handleIds(args[0])) destroy(ctx, id); return []; },
  isvalid(args, nargout, ctx) { const st = G(ctx); const v = args[0]; return tensor('logical', v.dims.slice(), v.gh.map((id) => (st.objs.has(id) ? 1 : 0))); },
  double(args) { const v = args[0]; return tensor('double', v.dims.slice(), v.gh.slice()); },
  eq(args) { const a = handleIds(args[0]), b = handleIds(args[1]); const n = Math.max(a.length, b.length); return tensor('logical', a.length >= b.length ? (args[0].dims || [1, 1]).slice() : (args[1].dims || [1, 1]).slice(), Array.from({ length: n }, (_, i) => (a[a.length === 1 ? 0 : i] === b[b.length === 1 ? 0 : i] ? 1 : 0))); },
  ne(args) { const r = methods.eq(args); return tensor('logical', r.dims, Array.from(r.re, (x) => 1 - x)); },
  horzcat(args, nargout, ctx) { return cat(ctx, args, false); },
  vertcat(args, nargout, ctx) { return cat(ctx, args, true); },
  cat(args, nargout, ctx) { const d = nums(args[0])[0]; return cat(ctx, args.slice(1), d === 1); },
  isempty(args) { return bool(args[0].gh.length === 0); },
  numel(args) { return num(args[0].gh.length); },
  length(args) { return num(args[0].gh.length ? Math.max(...args[0].dims) : 0); },
  // Straight to the builtins: ctx.call('get', …) would dispatch on the handle
  // argument back to this method and recurse until the stack overflows.
  get(args, nargout, ctx) { return manage.get(args, nargout, ctx); },
  set(args, nargout, ctx) { manage.set(args, 0, ctx); return []; },
  ishandle(args, nargout, ctx) { return methods.isvalid(args, nargout, ctx); },
  isgraphics(args, nargout, ctx) { return methods.isvalid(args, nargout, ctx); },
  disp(args, nargout, ctx) { ctx.out(displayHandle(ctx, args[0], '')); return []; },
};

const def = {
  handle: true,
  construct() { throw gerr('construct', 'Graphics objects are created with plotting functions (figure, plot, ...).'); },
  methods,
  subsref,
  subsasgn,
  display(obj, name, ctx) { return displayHandle(ctx, obj, name); },
  size(obj) { return obj.dims.slice(); },
  numel(obj) { return obj.gh.length; },
  props: [],
};

export const classes = Object.fromEntries([...new Set([...Object.values(TYPE_CLASS), 'Graphics', 'GraphicsPlaceholder'])].map((n) => [CLASS_PREFIX + n, def]));
export { subsref, subsasgn };
void str;
