// categorical arrays: codes (1-based, 0 = <undefined>) in `arr`, category
// names in props.categories, props.ordinal / props.protect.
import { tensor, normDims, prod, isTensor, isString, isCell, isChar, toTensor, num, bool, str, cell, stringArray, charMatrix } from '../../value.js';
import { E, textArg, optArg, textList } from './util.js';
import { arrObj, objIndex, objAssign, objDelete, objCat, dotName, pairIdx, nel } from './objarr.js';
import { num2strScalar } from './fmt.js';
import { sizeStr } from './display.js';

const UNDEF = '<undefined>';
const isCat = (v) => v && v.isObject && v.cls === 'categorical';

export function makeCat(dims, codes, categories, ordinal = false, protect = false) {
  return arrObj('categorical', dims, codes instanceof Float64Array ? codes : Float64Array.from(codes), { categories: categories.slice(), ordinal: !!ordinal, protect: !!(protect || ordinal) });
}
const nameOf = (c, i) => (c.arr[i] ? c.props.categories[c.arr[i] - 1] : null);

/** Text list of any data for categorical conversion (null = missing). */
function dataStrings(v) {
  if (isCat(v)) return { list: Array.from(v.arr, (k, i) => nameOf(v, i)), dims: v.dims, numeric: null };
  if (isString(v) || isCell(v) || isChar(v)) {
    const T = textList(v, 'categorical');
    return { list: T.list.map((s) => (s == null || s.trim() === '' ? null : s)), dims: T.kind === 'char' ? [1, 1] : T.dims, numeric: null };
  }
  const t = toTensor(v);
  return { list: Array.from(t.re, (x) => (x !== x ? null : t.cls === 'logical' ? String(x) : num2strScalar(x))), dims: t.dims, numeric: Array.from(t.re) };
}

function categoricalFn(args) {
  if (args.length === 0) return makeCat([0, 0], [], []);
  let k = args.length;
  for (let i = 1; i < args.length; i++) { const s = optArg(args[i]); if (s === 'ordinal' || s === 'protected') { k = i; break; } }
  let ordinal = false, protect = false;
  for (let i = k; i + 1 < args.length; i += 2) {
    const s = optArg(args[i]); const v = args[i + 1];
    const b = isTensor(v) ? v.re[0] !== 0 : optArg(v) === 'true';
    if (s === 'ordinal') ordinal = b; else if (s === 'protected') protect = b;
  }
  const D = dataStrings(args[0]);
  let cats, keys;
  if (k >= 2) {
    const vs = dataStrings(args[1]);
    keys = vs.list;
    cats = k >= 3 ? textList(args[2], 'categorical').list : vs.list.slice();
    if (cats.length !== keys.length) throw E('base:categorical:NumNamesMismatch', 'Number of category names must match the number of values in VALUESET.');
  } else {
    if (D.numeric) {
      const vals = [...new Set(D.numeric.filter((x) => x === x))].sort((a, b) => a - b);
      keys = vals.map((x) => num2strScalar(x)); cats = keys.slice();
    } else if (isCat(args[0])) { keys = args[0].props.categories.slice(); cats = keys.slice(); ordinal = ordinal || args[0].props.ordinal; } else {
      keys = [...new Set(D.list.filter((s) => s != null))].sort(); cats = keys.slice();
    }
  }
  const uniq = [...new Set(cats)];
  const codes = D.list.map((s) => { if (s == null) return 0; const p = keys.indexOf(s); return p < 0 ? 0 : uniq.indexOf(cats[p]) + 1; });
  return makeCat(D.dims, codes, uniq, ordinal, protect);
}

/** Converts a value to categorical codes against c's categories (adds new ones unless protected). */
function toCatLike(v, c, allowAdd = true) {
  if (isCat(v)) {
    const cats = c.props.categories.slice();
    const codes = Array.from(v.arr, (k, i) => {
      if (!k) return 0;
      const n = v.props.categories[k - 1];
      let p = cats.indexOf(n);
      if (p < 0) { if (!allowAdd || c.props.protect) throw E('base:categorical:ProtectedForCombination', `Cannot add new category '${n}' to a protected or ordinal categorical array.`); cats.push(n); p = cats.length - 1; }
      return p + 1;
    });
    return { codes, cats, dims: v.dims };
  }
  const D = dataStrings(v);
  const cats = c.props.categories.slice();
  const codes = D.list.map((n) => {
    if (n == null || n === UNDEF) return 0;
    let p = cats.indexOf(n);
    if (p < 0) { if (!allowAdd || c.props.protect) throw E('base:categorical:ProtectedForAssign', `Cannot add a new category '${n}' to this categorical array because its categories are protected.`); cats.push(n); p = cats.length - 1; }
    return p + 1;
  });
  return { codes, cats, dims: D.dims };
}

function cmp(name, a, b) {
  const c = isCat(a) ? a : b;
  const A = isCat(a) ? a : (() => { const r = toCatLike(a, c, false); return makeCat(r.dims, r.codes, r.cats, c.props.ordinal); })();
  let B;
  if (isCat(b) && b !== c) {
    if (c.props.ordinal && (b.props.categories.join('\u0000') !== c.props.categories.join('\u0000'))) throw E('base:categorical:InvalidComparison', 'Relational comparisons are not allowed for ordinal categorical arrays with different categories.');
    B = b;
  } else if (isCat(b)) B = b;
  else { try { const r = toCatLike(b, c, false); B = makeCat(r.dims, r.codes, r.cats); } catch (e) { B = makeCat([1, 1], [-1], c.props.categories); } }
  if (!['eq', 'ne'].includes(name) && !c.props.ordinal) throw E('base:categorical:NotOrdinal', 'Relational comparisons are not allowed for categorical arrays that are not ordinal.');
  const pi = pairIdx(nel(A), nel(B), A.dims, B.dims);
  const re = new Float64Array(pi.n);
  for (let q = 0; q < pi.n; q++) {
    const i = pi.ia(q), j = pi.ib(q);
    const x = A.arr[i], y = B.arr[j];
    if (name === 'eq' || name === 'ne') {
      const nx = x ? A.props.categories[x - 1] : null, ny = y > 0 ? B.props.categories[y - 1] : null;
      const e = nx !== null && nx === ny;
      re[q] = (name === 'eq') === e ? 1 : 0;
      continue;
    }
    if (!x || !y) { re[q] = 0; continue; }
    re[q] = { lt: x < y, gt: x > y, le: x <= y, ge: x >= y }[name] ? 1 : 0;
  }
  return { cls: 'logical', dims: normDims(pi.dims), re, im: null };
}

function catsOfArg(c, v) { return v === undefined ? [] : textList(v, 'categorical').list; }

const methods = {
  eq: (a) => cmp('eq', a[0], a[1]), ne: (a) => cmp('ne', a[0], a[1]), lt: (a) => cmp('lt', a[0], a[1]),
  gt: (a) => cmp('gt', a[0], a[1]), le: (a) => cmp('le', a[0], a[1]), ge: (a) => cmp('ge', a[0], a[1]),
  categories(args) { const c = args[0]; return cell([c.props.categories.length, 1], c.props.categories.map((s) => str(s))); },
  string(args) { const c = args[0]; return stringArray(c.dims, Array.from(c.arr, (k, i) => nameOf(c, i))); },
  char(args) { const c = args[0]; const lines = Array.from(c.arr, (k, i) => nameOf(c, i) ?? UNDEF); return lines.length === 1 ? str(lines[0]) : charMatrix(lines); },
  cellstr(args) { const c = args[0]; return cell(c.dims, Array.from(c.arr, (k, i) => str(nameOf(c, i) ?? UNDEF))); },
  double(args) { const c = args[0]; return tensor('double', c.dims, Array.from(c.arr, (k) => (k ? k : NaN))); },
  int32(args) { const c = args[0]; return tensor('int32', c.dims, Array.from(c.arr)); },
  uint8(args) { const c = args[0]; return tensor('uint8', c.dims, Array.from(c.arr)); },
  isundefined(args) { const c = args[0]; return { cls: 'logical', dims: c.dims, re: Float64Array.from(c.arr, (k) => (k ? 0 : 1)), im: null }; },
  ismissing(args) { return methods.isundefined(args); },
  countcats(args) {
    const c = args[0];
    const counts = new Float64Array(c.props.categories.length);
    for (const k of c.arr) if (k) counts[k - 1]++;
    const d = c.dims;
    return tensor('double', d[0] === 1 ? [1, counts.length] : [counts.length, 1], counts);
  },
  addcats(args) {
    const c = args[0];
    const add = catsOfArg(c, args[1]).filter((s) => !c.props.categories.includes(s));
    const cats = c.props.categories.slice();
    let at = cats.length;
    for (let i = 2; i + 1 < args.length; i += 2) {
      const s = optArg(args[i]), where = textArg(args[i + 1]);
      const p = cats.indexOf(where);
      if (p >= 0) at = s === 'before' ? p : p + 1;
    }
    cats.splice(at, 0, ...add);
    const remap = c.props.categories.map((n) => cats.indexOf(n) + 1);
    return { ...c, arr: Float64Array.from(c.arr, (k) => (k ? remap[k - 1] : 0)), props: { ...c.props, categories: cats } };
  },
  removecats(args) {
    const c = args[0];
    const rm = args.length > 1 ? catsOfArg(c, args[1]) : c.props.categories.filter((_, i) => !c.arr.includes(i + 1));
    const cats = c.props.categories.filter((s) => !rm.includes(s));
    const remap = c.props.categories.map((n) => cats.indexOf(n) + 1);
    return { ...c, arr: Float64Array.from(c.arr, (k) => (k ? remap[k - 1] : 0)), props: { ...c.props, categories: cats } };
  },
  renamecats(args) {
    const c = args[0];
    let oldN, newN;
    if (args.length === 2) { oldN = c.props.categories; newN = catsOfArg(c, args[1]); } else { oldN = catsOfArg(c, args[1]); newN = catsOfArg(c, args[2]); }
    if (oldN.length !== newN.length) throw E('base:categorical:renamecats:NumNamesMismatch', 'Number of new category names must match the number of old ones.');
    const cats = c.props.categories.map((s) => { const p = oldN.indexOf(s); return p >= 0 ? newN[p] : s; });
    return { ...c, props: { ...c.props, categories: cats } };
  },
  reordercats(args) {
    const c = args[0];
    let order;
    if (args.length < 2) order = c.props.categories.slice().sort();
    else if (isTensor(args[1]) && !isChar(args[1])) order = Array.from(toTensor(args[1]).re, (k) => c.props.categories[k - 1]);
    else order = catsOfArg(c, args[1]);
    if (order.length !== c.props.categories.length || !order.every((s) => c.props.categories.includes(s))) throw E('base:categorical:reordercats:InvalidNeworder', 'NEWORDER must be a permutation of the existing categories.');
    const remap = c.props.categories.map((n) => order.indexOf(n) + 1);
    return { ...c, arr: Float64Array.from(c.arr, (k) => (k ? remap[k - 1] : 0)), props: { ...c.props, categories: order } };
  },
  mergecats(args) {
    const c = args[0];
    const old = catsOfArg(c, args[1]);
    const target = args.length > 2 ? textArg(args[2]) : old[0];
    const cats = [];
    for (const s of c.props.categories) { const n = old.includes(s) ? target : s; if (!cats.includes(n)) cats.push(n); }
    const remap = c.props.categories.map((s) => cats.indexOf(old.includes(s) ? target : s) + 1);
    return { ...c, arr: Float64Array.from(c.arr, (k) => (k ? remap[k - 1] : 0)), props: { ...c.props, categories: cats } };
  },
  setcats(args) {
    const c = args[0];
    const cats = catsOfArg(c, args[1]);
    return { ...c, arr: Float64Array.from(c.arr, (k) => (k ? cats.indexOf(c.props.categories[k - 1]) + 1 : 0)), props: { ...c.props, categories: cats } };
  },
  iscategory(args) {
    const c = args[0];
    const T = textList(args[1], 'iscategory');
    return { cls: 'logical', dims: T.kind === 'char' ? [1, 1] : T.dims, re: Float64Array.from(T.list, (s) => (c.props.categories.includes(s) ? 1 : 0)), im: null };
  },
  isordinal(args) { return bool(args[0].props.ordinal); },
  isprotected(args) { return bool(args[0].props.protect); },
  sort(args, nargout) {
    const c = args[0];
    const desc = args.slice(1).some((a) => optArg(a) === 'descend');
    const n = nel(c);
    const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => { const a = c.arr[i] || Infinity, b = c.arr[j] || Infinity; return (a === b ? 0 : (a < b ? -1 : 1) * (desc && a !== Infinity && b !== Infinity ? -1 : 1)) || i - j; });
    const out = { ...c, arr: Float64Array.from(idx, (i) => c.arr[i]) };
    return nargout >= 2 ? [out, tensor('double', c.dims, idx.map((i) => i + 1))] : out;
  },
  unique(args, nargout) {
    const c = args[0];
    const present = [...new Set(Array.from(c.arr).filter((k) => k))].sort((a, b) => a - b);
    const out = makeCat(c.dims[0] === 1 ? [1, present.length] : [present.length, 1], present, c.props.categories, c.props.ordinal, c.props.protect);
    if (nargout < 2) return out;
    const ia = present.map((k) => Array.from(c.arr).indexOf(k) + 1);
    const ic = Array.from(c.arr, (k) => present.indexOf(k) + 1);
    return [out, tensor('double', [ia.length, 1], ia), tensor('double', [ic.length, 1], ic)];
  },
  ismember(args, nargout) {
    const a = args[0], b = args[1];
    const A = isCat(a) ? Array.from(a.arr, (k, i) => nameOf(a, i)) : dataStrings(a).list;
    const B = isCat(b) ? Array.from(b.arr, (k, i) => nameOf(b, i)) : dataStrings(b).list;
    const dims = isCat(a) ? a.dims : dataStrings(a).dims;
    const tf = A.map((s) => (s != null && B.includes(s) ? 1 : 0));
    const TF = { cls: 'logical', dims, re: Float64Array.from(tf), im: null };
    return nargout >= 2 ? [TF, tensor('double', dims, A.map((s) => (s != null ? B.indexOf(s) + 1 : 0)))] : TF;
  },
  summary(args, nargout, ctx) {
    const c = args[0];
    const counts = methods.countcats([c]).re;
    const undef = Array.from(c.arr).filter((k) => !k).length;
    const names = c.props.categories.concat(undef ? [UNDEF] : []);
    const vals = Array.from(counts).concat(undef ? [undef] : []);
    const w = Math.max(...names.map((s) => s.length));
    ctx.out(names.map((s, i) => `     ${s.padEnd(w)}     ${vals[i]}`).join('\n') + '\n');
    return undefined;
  },
  histcounts(args, nargout) {
    const c = args[0];
    const N = methods.countcats([c]);
    const counts = tensor('double', [1, N.re.length], N.re);
    return nargout >= 2 ? [counts, cell([1, c.props.categories.length], c.props.categories.map((s) => str(s)))] : counts;
  },
  min(args) { const c = args[0]; if (!c.props.ordinal) throw E('base:categorical:NotOrdinal', 'Categorical array must be ordinal.'); const ks = Array.from(c.arr).filter((k) => k); return makeCat([1, 1], [ks.length ? Math.min(...ks) : 0], c.props.categories, true); },
  max(args) { const c = args[0]; if (!c.props.ordinal) throw E('base:categorical:NotOrdinal', 'Categorical array must be ordinal.'); const ks = Array.from(c.arr).filter((k) => k); return makeCat([1, 1], [ks.length ? Math.max(...ks) : 0], c.props.categories, true); },
};

function catDisplayTexts(c) { return Array.from(c.arr, (k, i) => nameOf(c, i) ?? UNDEF); }

const categoricalClass = {
  props: [],
  construct: (args) => categoricalFn(args),
  methods,
  subsref(obj, subs) {
    let v = obj;
    for (const s of subs) {
      if (s.type === '()') v = objIndex(v, s.subs);
      else throw E('base:categorical:badIndex', 'Only parenthesis indexing is supported for categorical arrays.');
    }
    return [v];
  },
  subsasgn(obj, subs, rhs) {
    const s0 = subs[0];
    if (s0.type !== '()') throw E('base:categorical:badAssign', 'Only parenthesis assignment is supported for categorical arrays.');
    if (isTensor(rhs) && rhs.re.length === 0 && !isChar(rhs)) return objDelete(obj, s0.subs);
    const r = toCatLike(rhs, obj, true);
    const grown = { ...obj, props: { ...obj.props, categories: r.cats } };
    return objAssign(grown, s0.subs, makeCat(r.dims, r.codes, r.cats), 0);
  },
  cat(k, items) {
    const first = items.find(isCat);
    let cur = { ...first, props: { ...first.props, categories: first.props.categories.slice() } };
    const conv = [];
    for (const v of items) {
      if (isTensor(v) && v.re.length === 0 && !isChar(v)) continue;
      const r = toCatLike(v, cur, !first.props.ordinal || isCat(v) && v.props.categories.every((s) => cur.props.categories.includes(s)));
      cur = { ...cur, props: { ...cur.props, categories: r.cats } };
      conv.push(makeCat(r.dims, r.codes, r.cats));
    }
    const out = objCat(k, conv, cur);
    return { ...out, props: { ...first.props, categories: cur.props.categories } };
  },
  display(c, name, ctx, opts) {
    const loose = !(opts && opts.compact);
    const texts = catDisplayTexts(c);
    let body;
    if (texts.length === 0) body = `  ${sizeStr(c.dims)} empty categorical array`;
    else {
      const m = c.dims[0], cols = texts.length / m;
      const w = Math.max(...texts.map((t) => t.length));
      const rows = [];
      for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < cols; j++) s += '     ' + texts[i + j * m].padEnd(w); rows.push(s); }
      const head = texts.length === 1 ? '  categorical' : `  ${sizeStr(c.dims)} categorical array`;
      body = (opts && opts.disp ? '' : head + (loose ? '\n\n' : '\n')) + rows.join('\n');
    }
    if (opts && opts.disp) return body + '\n';
    if (!name) return body + '\n';
    return loose ? `${name} = \n\n${body}\n\n` : `${name} = \n${body}\n`;
  },
  inlineText(c) { return nel(c) === 1 ? (nameOf(c, 0) ?? UNDEF) : null; },
};

export const classes = { categorical: categoricalClass };

export const builtins = {
  categorical: categoricalFn,
  iscategorical: (args) => bool(isCat(args[0])),
  categories: (args) => { if (!isCat(args[0])) throw E('base:categories:notCategorical', 'Input must be a categorical array.'); return methods.categories(args); },
  isundefined: (args) => { if (!isCat(args[0])) throw E('base:isundefined:notCategorical', 'Input must be a categorical array.'); return methods.isundefined(args); },
  countcats: (args) => { if (!isCat(args[0])) throw E('base:countcats:notCategorical', 'Input must be a categorical array.'); return methods.countcats(args); },
  addcats: (args) => methods.addcats(args),
  removecats: (args) => methods.removecats(args),
  renamecats: (args) => methods.renamecats(args),
  reordercats: (args) => methods.reordercats(args),
  mergecats: (args) => methods.mergecats(args),
  setcats: (args) => methods.setcats(args),
  iscategory: (args) => methods.iscategory(args),
  isordinal: (args) => bool(isCat(args[0]) && args[0].props.ordinal),
  isprotected: (args) => bool(isCat(args[0]) && args[0].props.protect),
  discretize(args) {
    const t = toTensor(args[0]);
    const edges = Array.from(toTensor(args[1]).re);
    const n = edges.length - 1;
    const bins = Array.from(t.re, (x) => {
      if (!(x >= edges[0] && x <= edges[n])) return NaN;
      for (let k = 0; k < n; k++) if (x >= edges[k] && (x < edges[k + 1] || (k === n - 1 && x === edges[n]))) return k + 1;
      return NaN;
    });
    if (args.length > 2 && (optArg(args[2]) === 'categorical' || isCell(args[2]) || isString(args[2]))) {
      const names = optArg(args[2]) === 'categorical' ? Array.from({ length: n }, (_, k) => `[${num2strScalar(edges[k])}, ${num2strScalar(edges[k + 1])}${k === n - 1 ? ']' : ')'}`) : textList(args[2]).list;
      return makeCat(t.dims, bins.map((b) => (b !== b ? 0 : b)), names);
    }
    if (args.length > 2 && isTensor(args[2]) && !isChar(args[2])) { const vals = toTensor(args[2]).re; return tensor('double', t.dims, bins.map((b) => (b !== b ? NaN : vals[b - 1]))); }
    return tensor('double', t.dims, bins);
  },
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  categorical: H('Array of discrete categories.', '이산 범주로 된 배열.', ['B = categorical(A)', 'B = categorical(A, valueset)', 'B = categorical(A, valueset, catnames)', "B = categorical(..., 'Ordinal', true)"]),
  iscategorical: H('True for categorical arrays.', 'categorical 배열이면 참.', ['tf = iscategorical(A)']),
  categories: H('Categories of a categorical array.', 'categorical 배열의 범주.', ['C = categories(A)']),
  isundefined: H('True for undefined elements of a categorical array.', '정의되지 않은 범주 원소이면 참.', ['TF = isundefined(A)']),
  countcats: H('Count occurrences of categories.', '범주 발생 횟수.', ['C = countcats(A)']),
  addcats: H('Add categories to a categorical array.', 'categorical 배열에 범주 추가.', ['B = addcats(A, newcats)', "B = addcats(A, newcats, 'Before', where)"]),
  removecats: H('Remove categories from a categorical array.', 'categorical 배열에서 범주 제거.', ['B = removecats(A)', 'B = removecats(A, oldcats)']),
  renamecats: H('Rename categories.', '범주 이름 변경.', ['B = renamecats(A, newnames)', 'B = renamecats(A, oldnames, newnames)']),
  reordercats: H('Reorder categories.', '범주 순서 변경.', ['B = reordercats(A)', 'B = reordercats(A, neworder)']),
  mergecats: H('Merge categories.', '범주 병합.', ['B = mergecats(A, oldcats)', 'B = mergecats(A, oldcats, newcat)']),
  setcats: H('Set categories of a categorical array.', 'categorical 배열의 범주 설정.', ['B = setcats(A, newcats)']),
  iscategory: H('True for names that are categories.', '범주 이름이면 참.', ['tf = iscategory(A, catnames)']),
  isordinal: H('True for ordinal categorical arrays.', '순서형 categorical이면 참.', ['tf = isordinal(A)']),
  isprotected: H('True for protected categorical arrays.', '보호된 categorical이면 참.', ['tf = isprotected(A)']),
  discretize: H('Group data into bins.', '데이터를 구간으로 묶기.', ['Y = discretize(X, edges)', "Y = discretize(X, edges, 'categorical')", 'Y = discretize(X, edges, values)']),
};
void prod; void num; void dotName;
