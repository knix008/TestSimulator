// Small value helpers for the graphics area (independent of the base library
// so graphics works on its own in tests). Pure ESM, no platform APIs.
import {
  MError, tensor, str, num, isTensor, isChar, isString, isCell, isNumeric, isLogical, isSparse,
  toTensor, cell, stringArray, rowVec, isFuncHandle, isStruct,
} from '../value.js';

export const gerr = (id, msg) => new MError(`graphics:${id}`, msg);

/** True for a char row / string scalar. */
export function isTxt(v) { return v != null && ((isChar(v) && v.dims[0] <= 1) || (isString(v) && v.data.length === 1)); }
/** JS string of a char row or string scalar (char matrix rows joined with \n). */
export function txt(v) {
  if (isString(v)) return v.data.length ? (v.data[0] == null ? '' : v.data[0]) : '';
  if (isChar(v)) {
    const [m, n] = v.dims;
    if (m <= 1) { let s = ''; for (let i = 0; i < v.re.length; i++) s += String.fromCharCode(v.re[i]); return s; }
    const rows = [];
    for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < n; j++) s += String.fromCharCode(v.re[i + j * m]); rows.push(s.replace(/\s+$/, '')); }
    return rows.join('\n');
  }
  throw gerr('notText', 'Expected a character vector or string scalar.');
}
/** Text list from cellstr / string array / char matrix / text. */
export function txtList(v) {
  if (v == null) return [];
  if (isString(v)) return v.data.map((s) => (s == null ? '' : s));
  if (isCell(v)) return v.data.map((x) => (isNumeric(x) || isLogical(x) ? numText(x) : txt(x)));
  if (isChar(v)) {
    if (v.dims[0] <= 1) return v.re.length ? [txt(v)] : [];
    return txt(v).split('\n');
  }
  if (isNumeric(v) || isLogical(v)) return Array.from(toTensor(v).re, (x) => fmtNum(x));
  throw gerr('notText', 'Expected text, a cell array of text or a string array.');
}
export function numText(v) {
  const t = toTensor(v);
  return Array.from(t.re, (x) => fmtNum(x)).join(' ');
}
/** Short %g-like number text (like num2str for scalars). */
export function fmtNum(x, prec = 5) {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Inf';
  if (x === -Infinity) return '-Inf';
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return String(x);
  let s = x.toPrecision(prec);
  if (s.includes('e')) {
    let [m, e] = s.split('e');
    if (m.includes('.')) m = m.replace(/0+$/, '').replace(/\.$/, '');
    const en = parseInt(e, 10);
    return `${m}e${en < 0 ? '-' : '+'}${String(Math.abs(en)).padStart(2, '0')}`;
  }
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
export const lower = (s) => String(s).toLowerCase();

/** Numeric data of a value as Float64Array (logical/char/int accepted). */
export function nums(v, what = 'Value') {
  if (v == null) return new Float64Array(0);
  if (isTensor(v) || isSparse(v)) { const t = toTensor(v); return t.re; }
  if (typeof v === 'number') return Float64Array.of(v);
  if (Array.isArray(v)) return Float64Array.from(v);
  if (v instanceof Float64Array) return v;
  throw gerr('notNumeric', `${what} must be numeric.`);
}
export function isNum(v) { return v != null && (isNumeric(v) || isLogical(v)) && !isSparse(v); }
export function scalar(v, what = 'Value') {
  const a = nums(v, what);
  if (a.length !== 1) throw gerr('notScalar', `${what} must be a scalar.`);
  return a[0];
}
export function dimsOfV(v) { return v && v.dims ? v.dims : [1, 1]; }
/** Tensor (double) from JS numbers and dims. */
export function dbl(dims, data) { return tensor('double', dims, data instanceof Float64Array ? data : Float64Array.from(data)); }
export function rowOf(arr) { return rowVec(Array.from(arr)); }
export function matOf(rows) {
  const m = rows.length, n = m ? rows[0].length : 0;
  const t = tensor('double', [m, n]);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) t.re[i + j * m] = rows[i][j];
  return t;
}
/** n×k matrix Value → array of row arrays. */
export function rowsOf(v) {
  const t = toTensor(v); const [m, n] = t.dims; const out = [];
  for (let i = 0; i < m; i++) { const r = new Array(n); for (let j = 0; j < n; j++) r[j] = t.re[i + j * m]; out.push(r); }
  return out;
}
export function cellOfStrs(list, column = false) {
  return cell(column ? [list.length, 1] : [1, list.length], list.map((s) => str(s)));
}
export function strArr(list) { return stringArray([1, list.length], list.slice()); }
export { str, num, isFuncHandle, isStruct, isCell, isChar, isString, isNumeric, isLogical, tensor, toTensor, cell };

// ---------------------------------------------------------------- colors

export const COLOR_LETTERS = { r: [1, 0, 0], g: [0, 1, 0], b: [0, 0, 1], c: [0, 1, 1], m: [1, 0, 1], y: [1, 1, 0], k: [0, 0, 0], w: [1, 1, 1] };
export const COLOR_NAMES = { red: 'r', green: 'g', blue: 'b', cyan: 'c', magenta: 'm', yellow: 'y', black: 'k', white: 'w' };

/** Color from a JS string; returns [r,g,b] or null. */
export function colorFromText(s) {
  const l = s.trim().toLowerCase();
  if (COLOR_LETTERS[l]) return COLOR_LETTERS[l].slice();
  if (COLOR_NAMES[l]) return COLOR_LETTERS[COLOR_NAMES[l]].slice();
  let m = /^#?([0-9a-f]{6})$/.exec(l);
  if (m && (l[0] === '#' || l.length === 6)) {
    const h = m[1]; return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  m = /^#([0-9a-f]{3})$/.exec(l);
  if (m) { const h = m[1]; return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16) / 255); }
  return null;
}
/**
 * Parses a color value. `keywords` are allowed strings (e.g. ['none','flat']).
 * Returns [r,g,b] or the canonical keyword.
 */
export function parseColor(v, keywords = [], what = 'Color') {
  if (isTxt(v)) {
    const s = txt(v).trim().toLowerCase();
    for (const k of keywords) if (k.toLowerCase() === s) return k;
    const c = colorFromText(s);
    if (c) return c;
    throw gerr('invalidColor', `Invalid color specification for ${what}: '${txt(v)}'.`);
  }
  if (isNum(v)) {
    const a = nums(v);
    if (a.length === 3 || a.length === 4) {
      let rgb = Array.from(a.slice(0, 3));
      if (v.cls === 'uint8') rgb = rgb.map((x) => x / 255);
      if (rgb.some((x) => !(x >= 0 && x <= 1))) throw gerr('invalidColor', `${what} values must be between 0 and 1.`);
      return rgb;
    }
  }
  throw gerr('invalidColor', `Invalid color specification for ${what}. Use an RGB triplet, a hexadecimal color code or a color name.`);
}
export const rgbHex = (c) => '#' + c.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('');

// ---------------------------------------------------------------- line specs

export const MARKERS = ['none', 'o', '+', '*', '.', 'x', '_', '|', 's', 'd', '^', 'v', '>', '<', 'p', 'h', 'square', 'diamond', 'pentagram', 'hexagram'];
export const MARKER_ALIASES = { square: 's', diamond: 'd', pentagram: 'p', hexagram: 'h', '': 'none' };
export const LINESTYLES = ['-', '--', ':', '-.', 'none'];

/** Parses a LineSpec like 'r--o'; returns {color, lineStyle, marker} or null if not a spec. */
export function parseLineSpec(s) {
  let rest = s.trim();
  if (!rest) return null;
  const out = {};
  const words = ['square', 'diamond', 'pentagram', 'hexagram', 'none'];
  for (const w of words) {
    const i = rest.toLowerCase().indexOf(w);
    if (i >= 0) { if (w === 'none') out.lineStyle = 'none'; else out.marker = MARKER_ALIASES[w]; rest = rest.slice(0, i) + rest.slice(i + w.length); }
  }
  while (rest.length) {
    const two = rest.slice(0, 2);
    if (two === '--' || two === '-.') { if (out.lineStyle !== undefined) return null; out.lineStyle = two; rest = rest.slice(2); continue; }
    const ch = rest[0];
    if (ch === '-' || ch === ':') { if (out.lineStyle !== undefined) return null; out.lineStyle = ch; rest = rest.slice(1); continue; }
    if (COLOR_LETTERS[ch]) { if (out.color) return null; out.color = COLOR_LETTERS[ch].slice(); rest = rest.slice(1); continue; }
    if ('o+*.x_|sd^v><ph'.includes(ch)) { if (out.marker) return null; out.marker = ch; rest = rest.slice(1); continue; }
    return null;
  }
  return out;
}

// ---------------------------------------------------------------- misc

export function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
export function finiteMinMax(a, lo = Infinity, hi = -Infinity, positiveOnly = false) {
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x === x && x !== Infinity && x !== -Infinity && (!positiveOnly || x > 0)) { if (x < lo) lo = x; if (x > hi) hi = x; }
  }
  return [lo, hi];
}
export function linspace(a, b, n) { const out = new Float64Array(n); for (let i = 0; i < n; i++) out[i] = n === 1 ? b : a + (b - a) * i / (n - 1); return out; }
export function eqi(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }
