// Command Window display: `x = ...` statements without a semicolon, disp,
// display and format. Reproduces the classic layout: name line, blank lines
// (format loose / compact), type headers ("1×3 int8 row vector"), common
// scale factors ("1.0e+03 *"), column chunks ("Columns 1 through 8"),
// numeric formats short / long / shortE / longE / shortG / longG / bank /
// rat / hex / +, and cell / struct / string / char / logical / function
// handle / object display.
//
// JS API (used by the interpreter):
//   formatValue(value, name, ctx) → string   complete text, ends with '\n'
//   displayValue(value, name, ctx)           writes formatValue(...) with ctx.out
// The interpreter calls ctx.call('display', [value, nameCharRow], 0) or
// these functions directly.
import { INT_RANGE, prod, isTensor, isSparse, isString, isCell, isStruct, isChar, isObject, isFuncHandle, toTensor, str, num, structOf, MError } from '../../value.js';
import { E, textArg, optArg, classDef } from './util.js';
import { formatNumber } from './fmt.js';

const X = '×';
const isIntC = (c) => c in INT_RANGE;

// ------------------------------------------------------------- format state

const FORMAT_NAMES = {
  short: 'short', long: 'long', shorte: 'shortE', longe: 'longE', shortg: 'shortG', longg: 'longG',
  shorteng: 'shortEng', longeng: 'longEng', rat: 'rat', hex: 'hex', bank: 'bank', '+': '+',
};
export function getFormat(ctx) {
  const f = (ctx && ctx.format) || {};
  return { numeric: FORMAT_NAMES[String(f.numeric || 'short').toLowerCase()] || 'short', compact: f.spacing === 'compact', width: f.width || 80 };
}

// ------------------------------------------------------------- number helpers

const isNonFinite = (x) => !Number.isFinite(x);
function specialText(x) { return x !== x ? 'NaN' : x > 0 ? 'Inf' : '-Inf'; }
const fixed = (x, d) => (isNonFinite(x) ? specialText(x) : formatNumber(x, { flags: '', width: -1, prec: d, conv: 'f' }));
const expo = (x, d) => (isNonFinite(x) ? specialText(x) : formatNumber(x, { flags: '', width: -1, prec: d, conv: 'e' }));
const gfmt = (x, d) => (isNonFinite(x) ? specialText(x) : formatNumber(x, { flags: '', width: -1, prec: d, conv: 'g' }));

function engText(x, d) {
  if (isNonFinite(x)) return specialText(x);
  if (x === 0) return fixed(0, d) + 'e+00';
  let e = Math.floor(Math.log10(Math.abs(x)));
  e -= ((e % 3) + 3) % 3;
  let m = x / 10 ** e;
  const s = fixed(m, d);
  return `${s}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`;
}

/** Rational approximation text (continued fractions), like rats. */
export function ratText(x, tol) {
  if (isNonFinite(x)) return specialText(x);
  if (Number.isInteger(x)) return String(x);
  if (tol === undefined) tol = 1e-6 * Math.abs(x);
  let y = x, n0 = 1, d0 = 0, n1 = Math.round(y), d1 = 1;
  let frac = y - Math.round(y);
  let num = n1, den = d1;
  for (let k = 0; k < 20 && Math.abs(x - num / den) > tol; k++) {
    if (frac === 0) break;
    y = 1 / frac;
    const a = Math.round(y);
    frac = y - a;
    const n2 = a * n1 + n0, d2 = a * d1 + d0;
    n0 = n1; d0 = d1; n1 = n2; d1 = d2;
    num = n1; den = d1;
  }
  if (den < 0) { num = -num; den = -den; }
  return den === 1 ? String(num) : `${num}/${den}`;
}

function hexText(x, single) {
  const buf = new DataView(new ArrayBuffer(8));
  if (single) { buf.setFloat32(0, x); return Array.from({ length: 4 }, (_, i) => buf.getUint8(i).toString(16).padStart(2, '0')).join(''); }
  buf.setFloat64(0, x);
  return Array.from({ length: 8 }, (_, i) => buf.getUint8(i).toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------- numeric plans

/**
 * Decides how a float array is printed: returns
 * { fmt(x) → text, width, scale (number|null), scaleText }.
 */
function floatPlan(re, im, mode, single, scalar) {
  const vals = [];
  for (let i = 0; i < re.length; i++) { vals.push(re[i]); if (im) vals.push(im[i]); }
  const fin = vals.filter((x) => Number.isFinite(x));
  const allInt = fin.every((x) => Number.isInteger(x));
  let maxAbs = 0; for (const x of fin) { const a = Math.abs(x); if (a > maxAbs) maxAbs = a; }
  let minAbs = Infinity; for (const x of fin) { const a = Math.abs(x); if (a > 0 && a < minAbs) minAbs = a; }
  const anyNonFinite = vals.some(isNonFinite);
  const longDigits = single ? 7 : 15;
  const complex = !!im;
  const intLimit = mode === 'long' || mode === 'longG' ? (single ? 1e9 : 1e15) : 1e9;

  if (mode === 'hex') return { fmt: (x) => hexText(x, single), width: (single ? 8 : 16) + 3, intLike: false };
  if (mode === 'rat') {
    const f = (x) => ratText(x);
    let w = 0; for (const x of vals) w = Math.max(w, f(x).length);
    return { fmt: f, width: Math.max(w + 3, 6), intLike: false };
  }
  if (mode === 'bank') {
    const f = (x) => fixed(x, 2);
    let w = 0; for (const x of vals) w = Math.max(w, f(x).length);
    return { fmt: f, width: w + 3, intLike: false };
  }
  if (mode === '+') return { fmt: (x) => (x > 0 ? '+' : x < 0 ? '-' : ' '), width: 1, intLike: false, plus: true };

  if (allInt && !complex && maxAbs < intLimit && mode !== 'shortE' && mode !== 'longE' && mode !== 'shortEng' && mode !== 'longEng') {
    const digits = maxAbs === 0 ? 1 : String(maxAbs).length;
    let w = digits <= 3 && !anyNonFinite ? 6 : digits <= 3 ? 6 : digits + (vals.some((x) => x < 0) ? 1 : 0) + 3;
    if (digits > 3 && digits <= 9 && (mode === 'short' || mode === 'long')) w = 12;
    if (mode === 'long' && digits > 9) w = digits + 4;
    if (mode === 'shortG' || mode === 'longG') w = Math.max(digits + 3 + (vals.some((x) => x < 0) ? 1 : 0), 6);
    return { fmt: (x) => (isNonFinite(x) ? specialText(x) : String(x)), width: w, intLike: true };
  }
  if (mode === 'shortE' || mode === 'longE') {
    const d = mode === 'shortE' ? 4 : longDigits;
    const f = (x) => expo(x, d);
    let w = 0; for (const x of vals) w = Math.max(w, f(Math.abs(x)).length);
    return { fmt: f, width: w + 4, intLike: false };
  }
  if (mode === 'shortEng' || mode === 'longEng') {
    const d = mode === 'shortEng' ? 4 : longDigits;
    const f = (x) => engText(x, d);
    let w = 0; for (const x of vals) w = Math.max(w, f(Math.abs(x)).length);
    return { fmt: f, width: w + 4, intLike: false };
  }
  if (mode === 'shortG' || mode === 'longG') {
    const d = mode === 'shortG' ? 5 : longDigits;
    const f = (x) => gfmt(x, d);
    let w = 0; for (const x of vals) w = Math.max(w, f(x).length);
    return { fmt: f, width: Math.max(w + 3, scalar ? 0 : 0) + (scalar ? 1 : 2), intLike: false };
  }
  // short / long fixed with optional common scale factor
  const isLong = mode === 'long';
  const hiLimit = isLong ? 100 : 1000;
  const lo = 0.001;
  if (scalar && !complex) {
    const x = re[0];
    if (isNonFinite(x)) return { fmt: specialText, width: 6, intLike: true };
    const a = Math.abs(x);
    if (a === 0) return { fmt: () => '0', width: 6, intLike: true };
    if (a >= lo && a < hiLimit) {
      const d = isLong ? decimalsLong(a, single) : 4;
      return { fmt: (v) => fixed(v, d), width: isLong ? (single ? 12 : 20) : 10, intLike: false, scalarFixed: true };
    }
    const d = isLong ? longDigits : 4;
    return { fmt: (v) => expo(v, d), width: 3 + expo(x, d).length, intLike: false, scalarExp: true };
  }
  if (fin.length === 0 || maxAbs === 0) {
    // only NaN/Inf/0
    const d = isLong ? longDigits : 4;
    return { fmt: (v) => (v === 0 ? '0' : isNonFinite(v) ? specialText(v) : fixed(v, d)), width: allInt ? 6 : 10, intLike: allInt };
  }
  let scale = null;
  if (maxAbs >= hiLimit || maxAbs < lo) {
    const e = Math.floor(Math.log10(maxAbs));
    scale = 10 ** e;
    // scaled numbers must stay readable: when the spread is huge, use exponent display per element
    if (minAbs / maxAbs < 1e-5 && !isLong && false) scale = null;
  }
  const d = isLong ? (scale ? longDigits : decimalsLong(maxAbs, single)) : 4;
  const sc = scale || 1;
  const f = (v) => (isNonFinite(v) ? specialText(v) : v === 0 && !complex ? '0' : fixed(v / sc, d));
  let w = 0; for (const x of vals) w = Math.max(w, f(Math.abs(x)).length);
  const width = w + (isLong ? 3 : 4) + (vals.some((x) => x < 0) && isLong ? 1 : 0);
  return {
    fmt: f, width: Math.max(width, isLong ? 0 : 10), intLike: false,
    scale, scaleText: scale ? `   1.0e${scale < 1 ? '-' : '+'}${String(Math.abs(Math.round(Math.log10(scale)))).padStart(2, '0')} *` : null,
  };
}
function decimalsLong(a, single) {
  const top = single ? 7 : 15;
  if (a < 1) return top;
  return Math.max(0, top - Math.floor(Math.log10(a)));
}

/** Text of each element of a numeric tensor page (2-D slice) with its column width. */
function numericCells(t, plan) {
  const n = t.re.length;
  const out = new Array(n);
  if (t.im) {
    // complex "a + bi": align imaginary parts
    const reS = [], imS = [];
    let wr = 0, wi = 0;
    for (let i = 0; i < n; i++) {
      const r = plan.fmt(t.re[i]);
      const ip = t.im[i];
      const s = ip < 0 || Object.is(ip, -0) ? '-' : '+';
      const ai = plan.fmt(Math.abs(ip));
      reS.push(r); imS.push([s, ai]);
      wr = Math.max(wr, r.length); wi = Math.max(wi, ai.length);
    }
    for (let i = 0; i < n; i++) out[i] = `${reS[i].padStart(wr)} ${imS[i][0]} ${imS[i][1].padStart(wi)}i`;
    let w = 0; for (const s of out) w = Math.max(w, s.length);
    return { cells: out, width: w + 3 };
  }
  for (let i = 0; i < n; i++) out[i] = plan.fmt(t.re[i]);
  let w = plan.width;
  for (const s of out) if (s.length + 2 > w) w = s.length + 2;
  return { cells: out, width: w };
}

/** Lays out m×n cells (column-major) in chunks of columns. Returns blocks (arrays of lines). */
function layoutColumns(cells, m, n, colWidth, fmt, leftPad = 0, rightAlign = true) {
  const termWidth = fmt.width;
  const perChunk = Math.max(1, Math.floor((termWidth - leftPad) / colWidth));
  const blocks = [];
  for (let c0 = 0; c0 < n; c0 += perChunk) {
    const c1 = Math.min(n, c0 + perChunk);
    const lines = [];
    for (let i = 0; i < m; i++) {
      let line = ' '.repeat(leftPad);
      for (let j = c0; j < c1; j++) {
        const s = cells[i + j * m];
        line += rightAlign ? s.padStart(colWidth) : s.padEnd(colWidth);
      }
      lines.push(line.replace(/\s+$/, rightAlign ? '' : ''));
    }
    if (n > perChunk) {
      const head = c1 - c0 === 1 ? `  Column ${c0 + 1}` : `  Columns ${c0 + 1} through ${c1}`;
      blocks.push([head]);
    }
    blocks.push(lines);
  }
  return blocks;
}

function pages(v) {
  const d = v.dims;
  if (d.length <= 2) return [{ idx: null, offset: 0 }];
  const m = d[0], n = d[1], per = m * n;
  const higher = d.slice(2);
  const total = prod(higher);
  const out = [];
  for (let p = 0; p < total; p++) {
    const subs = []; let r = p;
    for (const h of higher) { subs.push((r % h) + 1); r = Math.floor(r / h); }
    out.push({ idx: subs, offset: p * per });
  }
  return out;
}
function pageOf(t, offset, m, n) {
  const per = m * n;
  return { cls: t.cls, dims: [m, n], re: t.re.subarray(offset, offset + per), im: t.im ? t.im.subarray(offset, offset + per) : null };
}

// ------------------------------------------------------------- size / type header text

export const sizeStr = (d) => d.join(X);
function shapeWord(d) {
  if (d.length > 2) return 'array';
  if (d[0] === 1 && d[1] !== 1) return 'row vector';
  if (d[1] === 1 && d[0] !== 1) return 'column vector';
  return 'matrix';
}

// ------------------------------------------------------------- inline value text (struct fields, cell items)

/** Short number text used inside struct fields and cells. */
export function inlineNumber(x, cls, mode = 'short') {
  if (isNonFinite(x)) return specialText(x);
  if (cls === 'logical' || isIntC(cls) || cls === 'char') return String(x);
  if (Number.isInteger(x) && Math.abs(x) < 1e9) return String(x);
  if (mode === 'long' || mode === 'longG' || mode === 'longE') {
    const a = Math.abs(x);
    if (a >= 0.001 && a < 100) return fixed(x, decimalsLong(a, cls === 'single'));
    return expo(x, cls === 'single' ? 7 : 15);
  }
  if (mode === 'shortG') return gfmt(x, 5);
  const a = Math.abs(x);
  if (a >= 0.001 && a < 1000) return fixed(x, 4);
  return expo(x, 4);
}
function inlineComplex(re, im, cls, mode) {
  const r = inlineNumber(re, 'single' === cls ? 'single' : 'double', mode);
  const i = inlineNumber(Math.abs(im), cls, mode);
  const rr = Number.isInteger(re) && Number.isInteger(im) && cls === 'double' ? fixed(re, 4) : r;
  const ii = Number.isInteger(re) && Number.isInteger(im) && cls === 'double' ? fixed(Math.abs(im), 4) : i;
  return `${rr} ${im < 0 || Object.is(im, -0) ? '-' : '+'} ${ii}i`;
}

function charRowText(v) { let s = ''; for (let i = 0; i < v.re.length; i++) s += String.fromCharCode(v.re[i]); return s; }

/** Text of a value inside a struct display ("a: 1", "b: [1 2 3]", "c: 'abc'"). */
export function fieldText(v, ctx, mode = 'short') {
  if (v == null) return '[]';
  if (isObject(v)) {
    const def = classDef(ctx, v.cls);
    if (def && typeof def.inlineText === 'function') { const t = def.inlineText(v, ctx); if (t != null) return t; }
    return `[${sizeStr(v.dims || [1, 1])} ${v.cls}]`;
  }
  if (isFuncHandle(v)) return fhText(v);
  if (isChar(v)) {
    if (v.dims.length === 2 && v.dims[0] === 0 && v.dims[1] === 0) return "''";
    if (v.dims.length === 2 && v.dims[0] === 1) return `'${charRowText(v)}'`;
    return `[${sizeStr(v.dims)} char]`;
  }
  if (isString(v)) {
    if (v.data.length === 1) return v.data[0] == null ? '<missing>' : `"${v.data[0]}"`;
    return `[${sizeStr(v.dims)} string]`;
  }
  if (isCell(v)) {
    if (v.dims.length === 2 && v.dims[0] === 0 && v.dims[1] === 0) return '{}';
    return `{${sizeStr(v.dims)} cell}`;
  }
  if (isStruct(v)) return `[${sizeStr(v.dims)} struct]`;
  if (isSparse(v)) return `[${sizeStr(v.dims)} ${v.cls === 'logical' ? 'logical' : 'double'} (sparse)]`;
  if (isTensor(v)) {
    const n = v.re.length;
    if (n === 0) return v.cls === 'double' && v.dims.length === 2 && v.dims[0] === 0 && v.dims[1] === 0 ? '[]' : `[${sizeStr(v.dims)} ${v.cls}]`;
    if (n === 1) return v.im ? inlineComplex(v.re[0], v.im[0], v.cls, mode) : inlineNumber(v.re[0], v.cls, mode);
    if (v.dims.length === 2 && v.dims[0] === 1 && n <= 10 && !v.im) {
      const parts = Array.from(v.re, (x) => inlineNumber(x, v.cls, mode));
      const s = `[${parts.join(' ')}]`;
      if (s.length <= 60) return s;
    }
    return `[${sizeStr(v.dims)} ${v.cls}]`;
  }
  return `[${sizeStr(v.dims || [1, 1])} ${v.cls}]`;
}

/** Text of a cell element in a cell array display ({[1]}, {'abc'}, {2×2 double}). */
export function cellItemText(v, ctx, mode = 'short') {
  if (v == null) return '{0×0 double}';
  if (isObject(v)) {
    const def = classDef(ctx, v.cls);
    if (def && typeof def.inlineText === 'function' && prod(v.dims || [1, 1]) === 1) { const t = def.inlineText(v, ctx); if (t != null) return `{[${t}]}`; }
    return `{${sizeStr(v.dims || [1, 1])} ${v.cls}}`;
  }
  if (isFuncHandle(v)) return `{${fhText(v)}}`;
  if (isChar(v)) {
    if (v.dims.length === 2 && v.dims[0] === 1) return `{'${charRowText(v)}'}`;
    if (v.dims.length === 2 && v.dims[0] === 0 && v.dims[1] === 0) return `{0×0 char}`;
    return `{${sizeStr(v.dims)} char}`;
  }
  if (isString(v)) {
    if (v.data.length === 1) return v.data[0] == null ? '{[<missing>]}' : `{["${v.data[0]}"]}`;
    return `{${sizeStr(v.dims)} string}`;
  }
  if (isCell(v)) return `{${sizeStr(v.dims)} cell}`;
  if (isStruct(v)) return `{${sizeStr(v.dims)} struct}`;
  if (isSparse(v)) return `{${sizeStr(v.dims)} double}`;
  if (isTensor(v)) {
    const n = v.re.length;
    if (n === 0) return `{${sizeStr(v.dims)} ${v.cls}}`;
    if (n === 1) return `{[${v.im ? inlineComplex(v.re[0], v.im[0], v.cls, mode) : inlineNumber(v.re[0], v.cls, mode)}]}`;
    if (v.dims.length === 2 && v.dims[0] === 1 && n <= 10 && !v.im) {
      const s = `{[${Array.from(v.re, (x) => inlineNumber(x, v.cls, mode)).join(' ')}]}`;
      if (s.length <= 40) return s;
    }
    return `{${sizeStr(v.dims)} ${v.cls}}`;
  }
  return `{${sizeStr(v.dims || [1, 1])} ${v.cls}}`;
}

function fhText(v) {
  if (v.text) return v.text.startsWith('@') ? v.text : '@' + v.text;
  if (v.name) return '@' + v.name;
  return '@<anonymous>';
}

// ------------------------------------------------------------- body builders (return {header, blocks})

function tensorBody(v, name, fmt, isDisp) {
  const t = isSparse(v) ? toTensor(v) : v;
  const d = t.dims;
  const n = t.re.length;
  const cls = t.cls;
  // empties
  if (n === 0) {
    if (isDisp) return { blocks: [] };
    if (cls === 'double' && d.length === 2 && d[0] === 0 && d[1] === 0 && !v.sparse) return { blocks: [['     []']] };
    const kind = cls === 'logical' || cls === 'char' || d.length > 2 ? 'array' : 'matrix';
    return { blocks: [[`  ${sizeStr(d)} empty ${cls} ${kind}`]] };
  }
  if (cls === 'char') return charBody(t, name, fmt, isDisp);
  const header = [];
  const scalar = n === 1;
  if (!isDisp) {
    if (cls === 'logical' || isIntC(cls) || cls === 'single') {
      if (scalar) header.push(`  ${cls}`);
      else header.push(`  ${sizeStr(d)} ${cls} ${cls === 'logical' ? 'array' : shapeWord(d)}`);
    }
    if (v.sparse) header.push(`  ${sizeStr(d)} sparse ${cls === 'logical' ? 'logical' : 'double'} matrix (${countNz(t)} nonzeros)`);
  }
  if (v.sparse) return sparseBody(v, t, fmt, header);
  const m = d[0], nn = d[1];
  const blocks = [];
  if (header.length) blocks.push(header);
  let plan;
  let cellsFn;
  if (cls === 'logical' || isIntC(cls)) {
    let w = 0;
    const strs = Array.from(t.re, (x) => String(x));
    const imS = t.im ? Array.from(t.im, (x) => x) : null;
    let texts = strs;
    if (imS) texts = strs.map((s, i) => `${s} ${imS[i] < 0 ? '-' : '+'} ${Math.abs(imS[i])}i`);
    for (const s of texts) w = Math.max(w, s.length);
    const width = w + 3;
    cellsFn = (pg) => ({ cells: Array.from(pg.re, (x, i) => (pg.im ? `${x} ${pg.im[i] < 0 ? '-' : '+'} ${Math.abs(pg.im[i])}i` : String(x))), width });
  } else {
    plan = floatPlan(t.re, t.im, fmt.numeric, cls === 'single', scalar);
    if (plan.plus) {
      const pgs = pages(t);
      for (const pg of pgs) {
        const page = pageOf(t, pg.offset, m, nn);
        if (pg.idx && !isDisp) blocks.push([`${name || 'ans'}(:,:,${pg.idx.join(',')}) =`]);
        const lines = [];
        for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < nn; j++) s += plan.fmt(page.re[i + j * m]); lines.push(s); }
        blocks.push(lines);
      }
      return { blocks };
    }
    cellsFn = (pg) => numericCells(pg, plan);
  }
  if (plan && plan.scaleText) blocks.push([plan.scaleText]);
  const pgs = pages(t);
  const nd = pgs.length > 1 || pgs[0].idx;
  for (const pg of pgs) {
    const page = pageOf(t, pg.offset, m, nn);
    if (pg.idx) blocks.push([`${isDisp ? '' : name || 'ans'}(:,:,${pg.idx.join(',')}) =`]);
    const { cells, width } = cellsFn(page);
    let w = width;
    if (plan && plan.scalarFixed) w = plan.width;
    if (plan && plan.scalarExp) w = plan.width;
    blocks.push(...layoutColumns(cells, m, nn, w, fmt));
  }
  return { blocks, nd: !!nd && !isDisp };
}
function countNz(t) { let c = 0; for (let i = 0; i < t.re.length; i++) if (t.re[i] !== 0 || (t.im && t.im[i] !== 0)) c++; return c; }
function sparseBody(v, t, fmt, header) {
  const lines = [];
  const [m, n] = v.dims;
  const items = [];
  for (let j = 0; j < n; j++) for (let k = v.colPtr[j]; k < v.colPtr[j + 1]; k++) items.push([v.rowIdx[k], j, v.re[k], v.im ? v.im[k] : 0]);
  const plan = floatPlan(Float64Array.from(items, (x) => x[2]), v.im ? Float64Array.from(items, (x) => x[3]) : null, fmt.numeric, false, false);
  const w1 = String(m).length, w2 = String(n).length;
  for (const [i, j, re, im] of items) {
    const val = v.cls === 'logical' ? '1' : v.im ? `${plan.fmt(re)} ${im < 0 ? '-' : '+'} ${plan.fmt(Math.abs(im))}i` : plan.fmt(re);
    lines.push(`   (${String(i + 1).padStart(w1)},${String(j + 1).padStart(w2)})${val.padStart(plan.width)}`);
  }
  const blocks = [header];
  if (lines.length) blocks.push(lines);
  return { blocks };
}

function charBody(t, name, fmt, isDisp) {
  const d = t.dims;
  const blocks = [];
  const m = d[0], n = d[1];
  if (isDisp) {
    const pgs = pages(t);
    for (const pg of pgs) {
      const lines = [];
      for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < n; j++) s += String.fromCharCode(t.re[pg.offset + i + j * m]); lines.push(s); }
      blocks.push(lines);
    }
    return { blocks, raw: true };
  }
  if (!(d.length === 2 && m === 1)) blocks.push([`  ${sizeStr(d)} char array`]);
  const pgs = pages(t);
  for (const pg of pgs) {
    if (pg.idx) blocks.push([`${name || 'ans'}(:,:,${pg.idx.join(',')}) =`]);
    const lines = [];
    for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < n; j++) s += String.fromCharCode(t.re[pg.offset + i + j * m]); lines.push(`    '${s}'`); }
    blocks.push(lines);
  }
  return { blocks };
}

function stringBody(v, name, fmt, isDisp) {
  const d = v.dims;
  const n = v.data.length;
  if (n === 0) return { blocks: isDisp ? [] : [[`  ${sizeStr(d)} empty string array`]] };
  const q = (s) => (s == null ? '<missing>' : isDisp && n === 1 ? s : `"${s}"`);
  if (n === 1) return { blocks: [[isDisp ? q(v.data[0]) : `    ${q(v.data[0])}`]], raw: isDisp };
  const blocks = [];
  if (!isDisp) blocks.push([`  ${sizeStr(d)} string array`]);
  const m = d[0], nn = d[1];
  for (const pg of pages(v)) {
    if (pg.idx) blocks.push([`${isDisp ? '' : name || 'ans'}(:,:,${pg.idx.join(',')}) =`]);
    const texts = [];
    for (let k = 0; k < m * nn; k++) texts.push(v.data[pg.offset + k] == null ? '<missing>' : `"${v.data[pg.offset + k]}"`);
    blocks.push(...gridLines(texts, m, nn, fmt));
  }
  return { blocks };
}

/** Left-aligned grid with 4-space separators (strings and cells). */
function gridLines(texts, m, n, fmt) {
  const colW = [];
  for (let j = 0; j < n; j++) { let w = 0; for (let i = 0; i < m; i++) w = Math.max(w, texts[i + j * m].length); colW.push(w); }
  const blocks = [];
  let j0 = 0;
  const chunks = [];
  while (j0 < n) {
    let width = 4, j1 = j0;
    while (j1 < n && (j1 === j0 || width + colW[j1] + 4 <= fmt.width)) { width += colW[j1] + 4; j1++; }
    chunks.push([j0, j1]);
    j0 = j1;
  }
  for (const [a, b] of chunks) {
    if (chunks.length > 1) blocks.push([b - a === 1 ? `  Column ${a + 1}` : `  Columns ${a + 1} through ${b}`]);
    const lines = [];
    for (let i = 0; i < m; i++) {
      let s = '';
      for (let j = a; j < b; j++) s += '    ' + (j < b - 1 ? texts[i + j * m].padEnd(colW[j]) : texts[i + j * m]);
      lines.push(s);
    }
    blocks.push(lines);
  }
  return blocks;
}

function cellBody(v, name, fmt, ctx, isDisp) {
  const d = v.dims;
  const n = v.data.length;
  if (n === 0) return { blocks: isDisp ? [] : [[`  ${sizeStr(d)} empty cell array`]] };
  const blocks = [];
  if (!isDisp) blocks.push([`  ${sizeStr(d)} cell array`]);
  const m = d[0], nn = d[1];
  for (const pg of pages(v)) {
    if (pg.idx) blocks.push([`${isDisp ? '' : name || 'ans'}(:,:,${pg.idx.join(',')}) =`]);
    const texts = [];
    for (let k = 0; k < m * nn; k++) texts.push(cellItemText(v.data[pg.offset + k], ctx, fmt.numeric));
    blocks.push(...gridLines(texts, m, nn, fmt));
  }
  return { blocks };
}

function structFieldLines(rec, fields, ctx, fmt) {
  const w = Math.max(0, ...fields.map((f) => f.length));
  return fields.map((f) => `${' '.repeat(4 + w - f.length)}${f}: ${fieldText(rec[f], ctx, fmt.numeric)}`);
}

function structBody(v, name, fmt, ctx, isDisp) {
  const n = v.data.length;
  const d = v.dims;
  if (n === 1) {
    const lines = structFieldLines(v.data[0], v.fields, ctx, fmt);
    if (isDisp) return { blocks: lines.length ? [lines] : [] };
    if (!v.fields.length) return { blocks: [['  struct with no fields.']] };
    return { blocks: [['  struct with fields:'], lines] };
  }
  if (n === 0) {
    if (!v.fields.length) return { blocks: [[`  ${sizeStr(d)} empty struct array with no fields.`]] };
    return { blocks: [[`  ${sizeStr(d)} empty struct array with fields:`], v.fields.map((f) => `    ${f}`)] };
  }
  if (!v.fields.length) return { blocks: [[`  ${sizeStr(d)} struct array with no fields.`]] };
  return { blocks: [[`  ${sizeStr(d)} struct array with fields:`], v.fields.map((f) => `    ${f}`)] };
}

function objectBody(v, name, fmt, ctx, isDisp) {
  const def = classDef(ctx, v.cls);
  if (def && typeof def.display === 'function') {
    const text = def.display(v, isDisp ? null : name, ctx, { compact: fmt.compact, disp: isDisp });
    return { text };
  }
  const props = def && def.props ? def.props : Object.keys(v.props || {});
  const lines = props.map((p) => {
    const val = v.props ? v.props[p] : undefined;
    return [p, val && val.cls ? fieldText(val, ctx, fmt.numeric) : val === undefined ? '[]' : JSON.stringify(val)];
  });
  const w = Math.max(0, ...lines.map((l) => l[0].length));
  const body = lines.map(([p, t]) => `${' '.repeat(4 + w - p.length)}${p}: ${t}`);
  if (prod(v.dims || [1, 1]) !== 1) return { blocks: [[`  ${sizeStr(v.dims)} ${v.cls} array`]] };
  if (isDisp) return { blocks: body.length ? [body] : [] };
  return { blocks: [[`  ${v.cls} with properties:`], body] };
}

function fhBody(v, isDisp) {
  if (isDisp) return { blocks: [[`    ${fhText(v)}`]] };
  return { blocks: [['  function_handle with value:'], [`    ${fhText(v)}`]] };
}

// ------------------------------------------------------------- top-level

function bodyOf(v, name, fmt, ctx, isDisp) {
  if (v == null) return { blocks: [['     []']] };
  if (isObject(v)) return objectBody(v, name, fmt, ctx, isDisp);
  if (isTensor(v) || isSparse(v)) return tensorBody(v, name, fmt, isDisp);
  if (isString(v)) return stringBody(v, name, fmt, isDisp);
  if (isCell(v)) return cellBody(v, name, fmt, ctx, isDisp);
  if (isStruct(v)) return structBody(v, name, fmt, ctx, isDisp);
  if (isFuncHandle(v)) return fhBody(v, isDisp);
  return { blocks: [[`  ${v.cls}`]] };
}

function joinBlocks(blocks, compact) {
  return blocks.map((b) => b.join('\n')).join(compact ? '\n' : '\n\n');
}

/**
 * Text shown for `name = value` (statement without semicolon). name may be
 * null/'' for an unnamed display (then it is the disp text).
 */
export function formatValue(v, name, ctx) {
  const fmt = getFormat(ctx);
  if (name == null || name === '') return dispText(v, ctx);
  const b = bodyOf(v, name, fmt, ctx, false);
  if (b.text !== undefined) return b.text.endsWith('\n') ? b.text : b.text + '\n';
  const body = joinBlocks(b.blocks, fmt.compact);
  // N-D arrays print each page with its own name line
  if (b.nd) return fmt.compact ? `${body}\n` : `${body}\n\n`;
  if (fmt.compact) return `${name} =\n${body}\n`;
  return `${name} =\n\n${body}\n\n`;
}

/** Text written by disp(value). */
export function dispText(v, ctx) {
  const fmt = getFormat(ctx);
  const b = bodyOf(v, null, fmt, ctx, true);
  if (b.text !== undefined) return b.text.endsWith('\n') || b.text === '' ? b.text : b.text + '\n';
  if (!b.blocks.length) return '';
  const body = b.raw ? b.blocks.map((x) => x.join('\n')).join('\n') : joinBlocks(b.blocks, fmt.compact);
  return body + '\n';
}

export function displayValue(v, name, ctx) {
  const text = formatValue(v, name, ctx);
  if (ctx && typeof ctx.out === 'function') ctx.out(text);
  return text;
}

// ------------------------------------------------------------- builtins

function setFormat(ctx, words) {
  if (!ctx.format) ctx.format = { numeric: 'short', spacing: 'loose' };
  if (words.length === 0) { ctx.format.numeric = 'short'; ctx.format.spacing = 'loose'; return; }
  for (const w0 of words) {
    const w = w0.toLowerCase();
    if (w === 'compact' || w === 'loose') ctx.format.spacing = w;
    else if (w === 'default') { ctx.format.numeric = 'short'; ctx.format.spacing = 'loose'; } else if (FORMAT_NAMES[w]) ctx.format.numeric = FORMAT_NAMES[w];
    else if (w === 'shorteng' || w === 'longeng') ctx.format.numeric = FORMAT_NAMES[w];
    else throw E('base:format:unknownFormat', `Unknown format '${w0}'.`);
  }
}

export const builtins = {
  display(args, nargout, ctx) {
    if (args.length < 1) throw E('base:display:notEnoughInputs', 'Not enough input arguments.');
    const name = args.length > 1 ? textArg(args[1]) : (ctx && ctx.inputName ? ctx.inputName(0) : null);
    const v = args[0];
    if (v && v.isObject) {
      const def = classDef(ctx, v.cls);
      if (def && def.methods && typeof def.methods.disp === 'function' && !def.display) {
        if (name) ctx.out(`${name} =\n\n`);
        def.methods.disp([v], 0, ctx);
        if (name && getFormat(ctx).compact === false) ctx.out('\n');
        return undefined;
      }
    }
    ctx.out(formatValue(v, name || 'ans', ctx));
    return undefined;
  },
  disp(args, nargout, ctx) {
    if (args.length < 1) throw E('base:disp:notEnoughInputs', 'Not enough input arguments.');
    ctx.out(dispText(args[0], ctx));
    return undefined;
  },
  formattedDisplayText(args, nargout, ctx) {
    if (args.length < 1) throw E('base:formattedDisplayText:notEnoughInputs', 'Not enough input arguments.');
    let local = ctx;
    if (args.length > 1) {
      const saved = { ...(ctx.format || {}) };
      local = { ...ctx, format: { ...saved } };
      for (let i = 1; i + 1 < args.length; i += 2) {
        const k = optArg(args[i]), val = textArg(args[i + 1]);
        if (k === 'numericformat') setFormat(local, [val]);
        else if (k === 'linespacing') local.format.spacing = val.toLowerCase();
      }
    }
    return { cls: 'string', dims: [1, 1], data: [dispText(args[0], local)] };
  },
  format(args, nargout, ctx) {
    if (args.length === 0 && nargout >= 1) {
      const f = getFormat(ctx);
      return structOf({ NumericFormat: str(f.numeric), LineSpacing: str(f.compact ? 'compact' : 'loose') });
    }
    const words = [];
    for (const a of args) {
      if (a && a.cls === 'struct') {
        const r = a.data[0];
        if (r.NumericFormat) words.push(textArg(r.NumericFormat));
        if (r.LineSpacing) words.push(textArg(r.LineSpacing));
        continue;
      }
      const t = textArg(a);
      if (t === null) throw E('base:format:invalidInput', 'Format must be a character vector or string.');
      words.push(...t.split(/\s+/).filter(Boolean));
    }
    const prev = getFormat(ctx);
    setFormat(ctx, words);
    if (nargout >= 1) return structOf({ NumericFormat: str(prev.numeric), LineSpacing: str(prev.compact ? 'compact' : 'loose') });
    return undefined;
  },
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  display: H('Show a value with its name (used for statements without a semicolon).', '값을 이름과 함께 표시 (세미콜론 없는 문장).', ['display(X)', 'display(X, name)']),
  disp: H('Display value of a variable without its name.', '변수 이름 없이 값만 표시.', ['disp(X)']),
  formattedDisplayText: H('Capture display output as a string.', '표시 출력을 문자열로 받기.', ['str = formattedDisplayText(X)', "str = formattedDisplayText(X, 'NumericFormat', 'long')"]),
  format: H('Set Command Window output display format.', '명령 창 출력 표시 형식 설정.', ['format', 'format long', 'format shortG', 'format compact', 'format loose', 'fmt = format']),
};
