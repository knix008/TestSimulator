// Display in Octave's own layout, for code written for Octave (core/lang/lexer.js isOctaveSource):
//   x = 4            disp(4) → 4            x = 3.1416         x = 1.0000e-03
//   x =                                     s =
//                                             scalar structure containing the fields:
//      1   2   3
//                                               a = 1
//   c =
//   {                                       e = [](0x0)
//     [1,1] = 1
//   }
// Numbers follow Octave's pr-output rules for "format short" (5 significant digits; "format long":
// 16): a common width per matrix from the digits of its largest and smallest element, fixed point
// unless that gets too wide, then e-notation; integer matrices in a width of their digits plus a sign
// place, separated by two spaces; wide matrices split into "Columns N through M:" blocks.
//
//   octaveDisplay(name, v, fmt) → text for `name = v` (null: not handled here, use the usual display)
//   octaveDisp(v, fmt)          → text for disp(v)   (null likewise)
import { isTensor, isCell, isStruct, isString, isSparse, isObject, isFuncHandle, toTensor, prod } from '../value.js';
import { handleText } from './display.js';

const INT_CLASSES = new Set(['int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64']);
const TERMINAL = 80;   // Octave splits matrices wider than the terminal

const precOf = (fmt) => (fmt && /long/.test(fmt.numeric || '') ? 16 : 5);
const digitsOf = (x) => (x === 0 || !Number.isFinite(x) ? 0 : Math.floor(Math.log10(Math.abs(x))) + 1);
const sizeText = (dims) => dims.join('x');

/** ld / rd (digits before / after the point) for a magnitude with `digits` integer digits (pr-output). */
function ldrd(digits, prec) {
  if (digits > 0) return [digits, prec > digits ? prec - digits : prec];
  if (digits < 0) return [1, prec > digits ? prec - digits : prec];
  return [1, prec > 1 ? prec - 1 : prec];
}
const special = (x) => (Number.isNaN(x) ? 'NaN' : x > 0 ? 'Inf' : '-Inf');
function eText(x, prec) {
  if (!Number.isFinite(x)) return special(x);
  const [m, e] = x.toExponential(prec - 1).split('e');
  const n = Number(e);
  return `${m}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`;
}

/**
 * A number format for a set of real values: { width, text(x) } (width counts a sign place).
 * Integers: their digits; otherwise fixed point with Octave's ld / rd, or e-notation when too wide.
 */
function realFormat(values, prec) {
  const fin = values.filter(Number.isFinite);
  const infNaN = fin.length < values.length;
  const allInt = fin.every((x) => Number.isInteger(x));
  if (allInt) {
    const maxAbs = fin.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    const d = Math.max(1, digitsOf(maxAbs));
    if (d > 15) return { width: prec + 6, text: (x) => eText(x, prec) };
    let width = d + 1;
    if (infNaN && width < 4) width = 4;
    return { width, text: (x) => (Number.isFinite(x) ? String(x === 0 ? 0 : x) : special(x)) };
  }
  const abs = fin.map(Math.abs);
  const max = Math.max(...abs), min = Math.min(...abs);
  const [ldM, rdM] = ldrd(digitsOf(max), prec);
  const [ldm, rdm] = ldrd(digitsOf(min), prec);
  const ld = Math.max(ldM, ldm), rd = Math.max(rdM, rdm);
  let width = 1 + ld + 1 + rd;
  if (infNaN && width < 4) width = 4;
  if (width > prec + 4 + (prec > 5 ? 6 : 0)) {
    // too wide for fixed point: e-notation (d.dddde+XX)
    return { width: prec + 6, text: (x) => eText(x, prec) };
  }
  return { width, text: (x) => (Number.isFinite(x) ? x.toFixed(rd) : special(x)) };
}

/** A format for integer classes and logical: their digits, no sign place, two spaces apart. */
function intFormat(values) {
  const width = Math.max(1, ...values.map((x) => String(x).length));
  return { width, text: (x) => String(x) };
}

/** The element texts of a numeric tensor (column-major), each padded to the common width. */
function cellsOf(t, prec) {
  const n = t.re.length;
  const isInt = INT_CLASSES.has(t.cls) || t.cls === 'logical' || t.cls === 'char';
  const re = Array.from(t.re, Number);
  if (!t.im) {
    const f = isInt ? intFormat(re) : realFormat(re, prec);
    return { width: f.width, items: re.map((x) => f.text(x).padStart(f.width)) };
  }
  const im = Array.from(t.im, Number);
  const fr = realFormat(re, prec), fi = realFormat(im.map(Math.abs), prec);
  const items = [];
  for (let k = 0; k < n; k++) {
    const sign = im[k] < 0 || Object.is(im[k], -0) ? '-' : '+';
    items.push(`${fr.text(re[k]).padStart(fr.width)} ${sign} ${fi.text(Math.abs(im[k])).padStart(fi.width - 1)}i`);
  }
  return { width: fr.width + fi.width + 3, items };
}

/** The rows of a 2-D page (strings), split into column blocks when wider than the terminal. */
function matrixLines(t, prec, rows, cols, offset = 0) {
  const { width, items } = cellsOf(t, prec);
  const sep = INT_CLASSES.has(t.cls) || t.cls === 'logical' ? '  ' : '  ';
  const colW = width + sep.length;
  const per = Math.max(1, Math.floor((TERMINAL - 0) / colW));
  const blocks = [];
  for (let c0 = 0; c0 < cols; c0 += per) {
    const c1 = Math.min(cols, c0 + per);
    const lines = [];
    for (let i = 0; i < rows; i++) {
      let line = '';
      for (let j = c0; j < c1; j++) line += sep + items[offset + i + j * rows];
      lines.push(line);
    }
    blocks.push({ c0, c1, lines });
  }
  if (blocks.length === 1) return blocks[0].lines;
  const out = [];
  blocks.forEach((b, k) => {
    const head = b.c1 - b.c0 === 1 ? ` Column ${b.c0 + 1}:` : b.c1 - b.c0 === 2 && k === blocks.length - 1 ? ` Columns ${b.c0 + 1} and ${b.c1}:` : ` Columns ${b.c0 + 1} through ${b.c1}:`;
    if (k) out.push('');
    out.push(head, '', ...b.lines);
  });
  return out;
}

const isNumericLike = (v) => isTensor(v) && v.cls !== 'char';

/**
 * The body of a value: { inline } (shown after "name = ") or { lines } (shown after "name =" and a
 * blank line), or null when this module does not show the type.
 */
function body(v, fmt, name) {
  const prec = precOf(fmt);
  if (isSparse(v)) return null;   // the usual sparse display
  if (isFuncHandle(v)) {
    const text = handleText(v);
    return text.startsWith('@(') ? { lines: [text], fh: true } : { inline: text };
  }
  if (isString(v)) return null;
  if (isTensor(v)) {
    const dims = v.dims;
    const n = prod(dims);
    if (v.cls === 'char') {
      if (dims.length === 2 && dims[0] <= 1) return { inline: String.fromCharCode(...v.re) };
      if (dims.length === 2) {
        const [r, c] = dims;
        const lines = [];
        for (let i = 0; i < r; i++) { let s = ''; for (let j = 0; j < c; j++) s += String.fromCharCode(v.re[i + j * r]); lines.push(s); }
        return { lines, raw: true };
      }
      return null;
    }
    if (n === 0) return { inline: `[](${sizeText(dims)})` };
    if (n === 1) {
      const { items } = cellsOf(v, prec);
      return { inline: items[0].trim() };
    }
    if (dims.length === 2) return { lines: matrixLines(v, prec, dims[0], dims[1]) };
    // N-d: one page per trailing index, as name(:,:,k) = …
    const [r, c] = dims;
    const pages = n / (r * c);
    const lines = [];
    for (let p = 0; p < pages; p++) {
      const sub = [];
      let q = p;
      for (let d = 2; d < dims.length; d++) { sub.push(q % dims[d] + 1); q = Math.floor(q / dims[d]); }
      if (p) lines.push('');
      lines.push(`${name || 'ans'}(:,:,${sub.join(',')}) =`, '', ...matrixLines(v, prec, r, c, p * r * c));
    }
    return { lines, pages: true };
  }
  if (isStruct(v)) {
    const n = v.data.length;
    if (n === 1 && v.dims.every((d) => d === 1)) {
      const lines = ['  scalar structure containing the fields:', ''];
      for (const f of v.fields) lines.push(...fieldLines(f, v.data[0][f], fmt, '    '));
      return { lines, struct: true };
    }
    const lines = [`  ${sizeText(v.dims)} struct array ${v.fields.length ? 'containing the fields:' : 'with no fields'}`];
    if (v.fields.length) { lines.push(''); for (const f of v.fields) lines.push(`    ${f}`); }
    return { lines, struct: true };
  }
  if (isCell(v)) {
    if (prod(v.dims) === 0) return { inline: `{}(${sizeText(v.dims)})` };
    const lines = ['{'];
    const [r] = v.dims;
    v.data.forEach((e, k) => {
      const idx = v.dims.length === 2 ? `[${(k % r) + 1},${Math.floor(k / r) + 1}]` : `[${k + 1}]`;
      lines.push(...fieldLines(idx, e, fmt, '  '));
    });
    lines.push('}');
    return { lines, cell: true };
  }
  return null;
}

/** "name = value" lines of a struct field / cell element, indented. */
function fieldLines(name, v, fmt, indent) {
  const b = body(v, fmt, name);
  if (!b) {
    // a value this module does not show (objects, string arrays …): its size and class
    const dims = v && v.dims ? sizeText(v.dims) : '1x1';
    return [`${indent}${name} = <${dims} ${v && v.cls ? v.cls : 'object'}>`];
  }
  if (b.inline !== undefined) return [`${indent}${name} = ${b.inline}`];
  if (b.cell) return [`${indent}${name} =`, ...b.lines.map((l) => indent + l), ''];
  return [`${indent}${name} =`, '', ...b.lines.map((l) => (l ? indent + l : l)), ''];
}

/** Text for `name = v` in Octave's layout, or null (use the usual display). */
export function octaveDisplay(name, v, fmt = {}) {
  if (isObject(v)) return null;
  const b = body(v, fmt, name);
  if (!b) return null;
  if (b.inline !== undefined) return `${name} = ${b.inline}\n`;
  if (b.cell) return `${name} =\n${b.lines.join('\n')}\n\n`;
  if (b.pages) return `${name} =\n\n${b.lines.join('\n')}\n\n`;
  return `${name} =\n\n${b.lines.join('\n')}\n\n`;
}

/** Text for disp(v) in Octave's layout, or null. */
export function octaveDisp(v, fmt = {}) {
  if (isObject(v)) return null;
  const b = body(v, fmt, 'ans');
  if (!b) return null;
  if (b.inline !== undefined) return `${b.inline}\n`;
  if (b.struct) return `${b.lines.map((l) => l.replace(/^ {2}/, '')).join('\n')}\n`;
  return `${b.lines.join('\n')}\n`;
}

export { toTensor };
