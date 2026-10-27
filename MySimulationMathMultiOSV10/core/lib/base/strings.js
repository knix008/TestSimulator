// Characters and strings: conversion (num2str, mat2str, str2double, string,
// cellstr, dec2bin ...), comparison, search and replace, splitting and
// joining, the string-function family (contains, extractBefore, pad ...),
// character classes, encodings, sprintf / fprintf / compose.
import {
  INT_RANGE, tensor, normDims, prod, isTensor, isSparse, isString, isCell, isStruct, isChar, isObject,
  toTensor, num, bool, str, charMatrix, cell, stringArray, MError,
} from '../../value.js';
import { E, textArg, optArg, textList, makeText, isCellstr, nameValues, finalize, dense, classDef } from './util.js';
import { sprintfJS, unescapeFormat, parseFormat, printfItems, runFormat, num2strScalar, num2strComplex, formatNumber, gText } from './fmt.js';
import { parseNumberText, convertClass } from './types.js';

const isIntC = (c) => c in INT_RANGE;
const codes = (s) => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
const charRowStr = (v) => { let s = ''; for (let i = 0; i < v.re.length; i++) s += String.fromCharCode(v.re[i]); return s; };
const charOf = (s) => { const t = str(s); if (s.length === 0) t.dims = [0, 0]; return t; };
const charRowKeep = (s) => (s.length === 0 ? tensor('char', [1, 0]) : str(s));

function need(args, n, fname) { if (args.length < n) throw E(`base:${fname}:notEnoughInputs`, 'Not enough input arguments.'); }

/** Elementwise text map keeping the container kind (char row, char matrix rows, cell, string). */
function mapText(v, f, fname) {
  if (isChar(v) && v.dims[0] > 1) {
    const T = textList(v, fname);
    return charMatrix(T.list.map(f));
  }
  const T = textList(v, fname);
  const out = T.list.map((s) => (s == null ? null : f(s)));
  if (T.kind === 'char') return charRowKeep(out[0]);
  return makeText(out, T.dims, T.kind);
}
/** Elementwise text → logical/double array. */
function mapTextNum(v, f, fname, cls = 'logical') {
  const T = textList(v, fname);
  const re = Float64Array.from(T.list, (s) => f(s));
  return { cls, dims: normDims(T.kind === 'char' ? [1, 1] : T.dims), re, im: null };
}
/** Pattern argument → JS string list. */
function patternList(v, fname) {
  if (isString(v)) return v.data.map((s) => (s == null ? '' : s));
  if (isChar(v)) return [charRowStr(v)];
  if (isCell(v)) return v.data.map((x) => { const t = textArg(x); if (t === null) throw E(`base:${fname}:invalidPattern`, 'Search term must be a string array, character vector, or cell array of character vectors.'); return t; });
  if (v && v.cls === 'pattern') return [v.props.text];
  throw E(`base:${fname}:invalidPattern`, 'Search term must be a string array, character vector, or cell array of character vectors.');
}
function ignoreCaseOpt(args, start, fname) {
  const nv = nameValues(args, start, fname, ['IgnoreCase']);
  if (!nv.has('ignorecase')) return false;
  const v = nv.get('ignorecase');
  return isTensor(v) ? v.re[0] !== 0 : optArg(v) === 'true';
}

// ------------------------------------------------------------- number → text

function num2strFn(args) {
  need(args, 1, 'num2str');
  const x = args[0];
  if (isChar(x)) return x;
  if (isString(x)) return convertClass(x, 'char');
  if (!isTensor(x) && !isSparse(x)) throw E('base:num2str:invalidInput', 'Input to num2str must be numeric.');
  const t = toTensor(x);
  if (args.length > 1) {
    const fmtArg = textArg(args[1]);
    if (fmtArg !== null) {
      // num2str(x, format): apply per row
      const m = t.dims[0] || 0, n = t.re.length / Math.max(m, 1);
      const lines = [];
      for (let i = 0; i < m; i++) {
        const row = []; for (let j = 0; j < n; j++) row.push(t.re[i + j * m]);
        lines.push(sprintfJS(fmtArg, [tensor('double', [1, row.length], row)]));
      }
      return lines.length === 1 ? charRowKeep(lines[0]) : charMatrix(lines);
    }
    const p = dense(args[1], 'num2str').re[0];
    const f = (v) => (Number.isInteger(v) && Math.abs(v) < 1e15 ? String(v) : formatNumber(v, { flags: '', width: -1, prec: p, conv: 'g' }));
    return numMatrixText(t, (v) => f(v), (re, im) => `${f(re)}${im < 0 ? '-' : '+'}${f(Math.abs(im))}i`);
  }
  if (t.re.length === 0) return charOf('');
  if (t.re.length === 1) {
    const v = t.re[0];
    if (t.cls === 'logical' || isIntC(t.cls)) return str(String(v));
    if (t.im) return str(num2strComplex(v, t.im[0]));
    return str(num2strScalar(v, t.cls === 'single'));
  }
  // matrices: common format for all elements, columns separated by two spaces
  const fin = Array.from(t.re).filter(Number.isFinite);
  const allInt = Array.from(t.re).every((v) => !Number.isFinite(v) || Number.isInteger(v)) && !t.im;
  if (allInt || t.cls === 'logical' || isIntC(t.cls)) {
    const maxAbs = fin.length ? Math.max(...fin.map(Math.abs)) : 0;
    const anyNeg = Array.from(t.re).some((v) => v < 0);
    const w = Math.max(String(maxAbs).length + (anyNeg ? 1 : 0), Array.from(t.re).some((v) => !Number.isFinite(v)) ? 3 + (anyNeg ? 1 : 0) : 0) + 2;
    return numMatrixText(t, (v) => (Number.isFinite(v) ? String(v) : v !== v ? 'NaN' : v > 0 ? 'Inf' : '-Inf').padStart(w));
  }
  let d = fin.length ? Math.floor(Math.log10(Math.max(...fin.map(Math.abs)))) : 0;
  if (!Number.isFinite(d)) d = 0;
  const prec = Math.max(d + 5, 5);
  const width = prec + 7 + (Array.from(t.re).some((v) => v < 0) ? 1 : 0);
  const g = (v) => formatNumber(v, { flags: '', width, prec, conv: 'g' });
  return numMatrixText(t, g, (re, im) => `${g(re)}${im < 0 ? '-' : '+'}${formatNumber(Math.abs(im), { flags: '-', width: 0, prec, conv: 'g' })}i`);
}
/** Builds a char matrix from per-element texts and trims common leading blanks. */
function numMatrixText(t, f, fc) {
  const d = t.dims;
  const m = d[0], n = t.re.length / Math.max(m, 1);
  const lines = [];
  for (let i = 0; i < m; i++) {
    let s = '';
    for (let j = 0; j < n; j++) { const k = i + j * m; s += t.im && fc ? fc(t.re[k], t.im[k]) + '  ' : f(t.re[k]); }
    lines.push(s.replace(/\s+$/, ''));
  }
  let lead = Infinity;
  for (const l of lines) { const k = l.length - l.trimStart().length; if (k < lead) lead = k; }
  const out = lines.map((l) => l.slice(lead === Infinity ? 0 : lead));
  if (out.length === 1) return charRowKeep(out[0]);
  return charMatrix(out);
}

function mat2strFn(args) {
  need(args, 1, 'mat2str');
  const x = args[0];
  let prec = 15, withClass = false;
  for (let i = 1; i < args.length; i++) { const o = optArg(args[i]); if (o === 'class') withClass = true; else if (o === null) prec = dense(args[i], 'mat2str').re[0]; }
  if (isChar(x)) {
    if (x.dims[0] <= 1) return str(`'${charRowStr(x).replace(/'/g, "''")}'`);
    const T = textList(x);
    return str('[' + T.list.map((s) => `'${s.replace(/'/g, "''")}'`).join(';') + ']');
  }
  if (isString(x)) {
    const q = (s) => (s == null ? '<missing>' : `"${s.replace(/"/g, '""')}"`);
    if (x.data.length === 1) return str(q(x.data[0]));
    const [m, n] = x.dims; const rows = [];
    for (let i = 0; i < m; i++) { const r = []; for (let j = 0; j < n; j++) r.push(q(x.data[i + j * m])); rows.push(r.join(' ')); }
    return str('[' + rows.join(';') + ']');
  }
  if (!isTensor(x) && !isSparse(x)) throw E('base:mat2str:invalidInput', 'Input matrix must be numeric, logical, char, or string.');
  const t = toTensor(x);
  if (t.dims.length > 2) throw E('base:mat2str:TwoDInput', 'Input matrix must be 2-D.');
  const one = (re, im) => {
    if (t.cls === 'logical') return re ? 'true' : 'false';
    let s = gText(re, prec);
    if (im !== undefined && im !== 0 || (t.im && im !== undefined)) { const ii = gText(Math.abs(im), prec); s += `${im < 0 || Object.is(im, -0) ? '-' : '+'}${ii}i`; }
    return s;
  };
  const [m, n] = t.dims;
  let s;
  if (m * n === 1) s = one(t.re[0], t.im ? t.im[0] : undefined);
  else {
    const rows = [];
    for (let i = 0; i < m; i++) { const r = []; for (let j = 0; j < n; j++) r.push(one(t.re[i + j * m], t.im ? t.im[i + j * m] : undefined)); rows.push(r.join(' ')); }
    s = '[' + rows.join(';') + ']';
    if (m * n === 0) s = `zeros(${m},${n})`;
  }
  if (withClass && t.cls !== 'double' && t.cls !== 'logical') s = `${t.cls}(${s})`;
  return str(s);
}

// ------------------------------------------------------------- text → number

/** Minimal literal parser for str2num: numbers, brackets, separators, unary minus, Inf/NaN/pi/i/j/true/false. */
function parseMatrixLiteral(s) {
  let txt = s.trim();
  if (!txt) return { ok: true, value: tensor('double', [0, 0]) };
  if (txt.startsWith('[') && txt.endsWith(']')) txt = txt.slice(1, -1);
  const rows = txt.split(/;|\n/).map((r) => r.trim()).filter((r, i, a) => r.length || a.length === 1);
  const data = [];
  let ncols = -1, anyLogicalOnly = true, anyIm = false;
  for (const r of rows) {
    const toks = r.split(/[\s,]+/).filter(Boolean);
    const vals = [];
    for (let tk of toks) {
      const tl = tk.toLowerCase();
      if (tl === 'true' || tl === 'false') { vals.push([tl === 'true' ? 1 : 0, 0]); continue; }
      anyLogicalOnly = false;
      let sign = 1;
      while (tl.startsWith('-') || tl.startsWith('+')) { if (tk[0] === '-') sign = -sign; tk = tk.slice(1); if (!tk) break; if (!(tk[0] === '-' || tk[0] === '+')) break; }
      const t2 = tk.toLowerCase();
      if (t2 === 'pi') { vals.push([sign * Math.PI, 0]); continue; }
      if (t2 === 'eps') { vals.push([sign * 2.220446049250313e-16, 0]); continue; }
      const [re, im] = parseNumberText(tk);
      if (re !== re && !/^nan$/i.test(tk)) return { ok: false };
      if (im) anyIm = true;
      vals.push([sign * re, sign * im]);
    }
    if (!vals.length) continue;
    if (ncols >= 0 && vals.length !== ncols) return { ok: false };
    ncols = vals.length;
    data.push(vals);
  }
  const m = data.length, n = Math.max(ncols, 0);
  const re = new Float64Array(m * n), im = anyIm ? new Float64Array(m * n) : null;
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) { re[i + j * m] = data[i][j][0]; if (im) im[i + j * m] = data[i][j][1]; }
  return { ok: true, value: finalize(anyLogicalOnly && m * n > 0 ? 'logical' : 'double', [m, n], re, im) };
}

function str2numFn(args, nargout, ctx) {
  need(args, 1, 'str2num');
  const v = args[0];
  let s;
  if (isChar(v)) s = textList(v).list.join(';');
  else if (isString(v) && v.data.length === 1) s = v.data[0] || '';
  else throw E('base:str2num:InvalidArgument', 'Input must be a character vector or string scalar.');
  let r = parseMatrixLiteral(s);
  if (!r.ok && ctx && typeof ctx.evalString === 'function') {
    try {
      const out = ctx.evalString(`[${s}]`, 'caller');
      const val = Array.isArray(out) ? out[0] : out;
      if (val) r = { ok: true, value: val };
    } catch (e) { r = { ok: false }; }
  }
  const val = r.ok ? r.value : tensor('double', [0, 0]);
  return nargout >= 2 ? [val, bool(r.ok)] : val;
}

function str2doubleFn(args) {
  need(args, 1, 'str2double');
  const v = args[0];
  const one = (s) => parseNumberText(s);
  if (isChar(v)) {
    if (v.dims[0] > 1) return num(NaN);
    const [re, im] = one(charRowStr(v));
    return finalize('double', [1, 1], Float64Array.of(re), Float64Array.of(im));
  }
  if (isString(v) || isCell(v)) {
    const list = isString(v) ? v.data : v.data.map((x) => (isChar(x) && x.dims[0] <= 1 ? charRowStr(x) : isString(x) && x.data.length === 1 ? x.data[0] : null));
    const re = new Float64Array(list.length), im = new Float64Array(list.length);
    list.forEach((s, i) => { const r = s == null ? [NaN, 0] : one(s); re[i] = r[0]; im[i] = r[1]; });
    return finalize('double', v.dims, re, im);
  }
  return num(NaN);
}

// ------------------------------------------------------------- string() / cellstr() / strings

export function toStringArray(v, ctx) {
  if (v === undefined) return stringArray([1, 1], ['']);
  if (isString(v)) return v;
  if (isChar(v)) {
    if (v.dims[0] <= 1 && v.dims.length === 2) return stringArray([1, 1], [charRowStr(v)]);
    return stringArray([v.dims[0], 1], textList(v).list);
  }
  if (isCell(v)) {
    return stringArray(v.dims, v.data.map((x) => {
      if (isChar(x)) return charRowStr(x);
      if (isString(x) && x.data.length === 1) return x.data[0];
      if ((isTensor(x) || isSparse(x)) && prod(x.dims) === 1) return toStringArray(x, ctx).data[0];
      if (isCell(x) && x.data.length === 0) return '';
      throw E('base:string:MustBeCellstrOrScalars', 'Conversion from cell failed. Element must be a string scalar, character vector, or numeric scalar.');
    }));
  }
  if (isTensor(v) || isSparse(v)) {
    const t = toTensor(v);
    const data = Array.from(t.re, (x, i) => {
      if (t.cls === 'logical') return x ? 'true' : 'false';
      if (t.cls === 'char') return String.fromCharCode(x);
      if (t.im && t.im[i] !== 0) return num2strComplex(x, t.im[i]);
      if (x !== x) return null; // NaN → <missing>
      return num2strScalar(x, t.cls === 'single');
    });
    return stringArray(t.dims, data);
  }
  if (isObject(v)) {
    const def = classDef(ctx, v.cls);
    if (def && def.methods && def.methods.string) return def.methods.string([v], 1, ctx);
  }
  throw E('base:string:invalidConversion', `Conversion to string from ${v.cls} is not possible.`);
}

function cellstrFn(args) {
  need(args, 1, 'cellstr');
  const v = args[0];
  if (isCell(v)) {
    if (!v.data.every((x) => isChar(x) && x.dims[0] <= 1) && !v.data.every((x) => isChar(x) || (isString(x) && x.data.length === 1))) throw E('base:cellstr:MustContainText', 'Cell must contain only character vectors.');
    return cell(v.dims, v.data.map((x) => (isString(x) ? charRowKeep(x.data[0] || '') : x)));
  }
  if (isString(v)) return cell(v.dims, v.data.map((s) => charRowKeep(s == null ? '' : s)));
  if (isChar(v)) {
    if (v.dims[0] <= 1) return cell([1, 1], [charRowKeep(charRowStr(v).replace(/\s+$/, ''))]);
    return cell([v.dims[0], 1], textList(v).list.map((s) => charRowKeep(s.replace(/[ \0]+$/, ''))));
  }
  throw E('base:cellstr:InputClass', 'Input must be a string, character array, or cell array of character vectors.');
}

// ------------------------------------------------------------- comparison

function cmpFn(fname, nChars, ignoreCase) {
  return (args) => {
    need(args, nChars ? 3 : 2, fname);
    const n = nChars ? dense(args[2], fname).re[0] : Infinity;
    if (nChars && (!(n >= 0) || !Number.isInteger(n))) throw E(`base:${fname}:invalidN`, 'N must be a nonnegative integer.');
    const norm = (s) => (s == null ? null : ignoreCase ? s.toLowerCase() : s);
    const eq = (a, b) => {
      if (a == null || b == null) return false;
      a = norm(a); b = norm(b);
      if (nChars) { if (a.length < n || b.length < n) return a === b && a.length >= n; return a.slice(0, n) === b.slice(0, n); }
      return a === b;
    };
    const one = (v) => {
      if (isChar(v)) return v.dims.length === 2 && v.dims[0] <= 1 ? { scalar: true, s: charRowStr(v) } : { scalar: true, s: null, mat: v };
      if (isString(v)) return v.data.length === 1 ? { scalar: true, s: v.data[0], isStr: true } : { list: v.data, dims: v.dims };
      if (isCell(v)) return { list: v.data.map((x) => (isChar(x) && x.dims[0] <= 1 ? charRowStr(x) : isString(x) && x.data.length === 1 ? x.data[0] : null)), dims: v.dims };
      return { scalar: true, s: null };
    };
    const A = one(args[0]), B = one(args[1]);
    if (A.scalar && B.scalar) {
      if (A.mat || B.mat) {
        // char matrices: equal when same size and content
        if (A.mat && B.mat && A.mat.dims.join() === B.mat.dims.join()) { const sa = charRowStr(A.mat), sb = charRowStr(B.mat); return bool(eq(sa, sb)); }
        return bool(false);
      }
      return bool(eq(A.s, B.s));
    }
    if (!A.scalar && !B.scalar) {
      if (A.list.length !== B.list.length) throw E(`base:${fname}:InputsSizeMismatch`, 'Inputs must be the same size or either one can be a scalar.');
      return { cls: 'logical', dims: A.dims, re: Float64Array.from(A.list, (s, i) => (eq(s, B.list[i]) ? 1 : 0)), im: null };
    }
    const L = A.scalar ? B : A, s = A.scalar ? A.s : B.s;
    return { cls: 'logical', dims: L.dims, re: Float64Array.from(L.list, (x) => (eq(x, s) ? 1 : 0)), im: null };
  };
}

// ------------------------------------------------------------- search / replace

function strfindFn(args) {
  need(args, 2, 'strfind');
  const ic = args.length > 2 ? ignoreCaseOpt(args, 2, 'strfind') : false;
  const pat0 = textArg(args[1]);
  if (pat0 === null) throw E('base:strfind:invalidPattern', 'Second argument must be a character vector or string scalar.');
  const pat = ic ? pat0.toLowerCase() : pat0;
  const find = (s0) => {
    const s = ic ? s0.toLowerCase() : s0;
    const out = [];
    if (pat.length === 0) return tensor('double', [0, 0]);
    for (let i = s.indexOf(pat); i >= 0; i = s.indexOf(pat, i + 1)) out.push(i + 1);
    return out.length ? tensor('double', [1, out.length], out) : tensor('double', [1, 0]);
  };
  const v = args[0];
  if (isChar(v) && v.dims[0] <= 1) return find(charRowStr(v));
  if (isString(v) && v.data.length === 1) return find(v.data[0] || '');
  if (isCell(v) || isString(v)) {
    const T = textList(v, 'strfind');
    return cell(T.dims, T.list.map((s) => find(s || '')));
  }
  throw E('base:strfind:invalidText', 'First argument must be text.');
}

function strrepFn(args) {
  need(args, 3, 'strrep');
  const o = textArg(args[1]), n = textArg(args[2]);
  if (o === null || n === null) throw E('base:strrep:invalidInput', 'Arguments must be character vectors or string scalars.');
  return mapText(args[0], (s) => (o === '' ? s : s.split(o).join(n)), 'strrep');
}

function replaceFn(args) {
  need(args, 3, 'replace');
  const olds = patternList(args[1], 'replace'), news = patternList(args[2], 'replace');
  if (news.length !== 1 && news.length !== olds.length) throw E('base:replace:SizeMismatch', 'NEW must be a scalar or the same size as OLD.');
  return mapText(args[0], (s) => {
    // replace earliest-longest occurrences, left to right
    let out = '', i = 0;
    while (i <= s.length) {
      let best = -1, bestPos = Infinity;
      olds.forEach((p, k) => { if (!p) return; const q = s.indexOf(p, i); if (q >= 0 && (q < bestPos || (q === bestPos && p.length > olds[best].length))) { best = k; bestPos = q; } });
      if (best < 0) { out += s.slice(i); break; }
      out += s.slice(i, bestPos) + (news.length === 1 ? news[0] : news[best]);
      i = bestPos + olds[best].length;
    }
    return out;
  }, 'replace');
}

function containsLike(fname, test) {
  return (args) => {
    need(args, 2, fname);
    const pats0 = patternList(args[1], fname);
    const ic = ignoreCaseOpt(args, 2, fname);
    const pats = ic ? pats0.map((p) => p.toLowerCase()) : pats0;
    return mapTextNum(args[0], (s) => {
      if (s == null) return 0;
      const t = ic ? s.toLowerCase() : s;
      return pats.some((p) => test(t, p)) ? 1 : 0;
    }, fname);
  };
}

function countFn(args) {
  need(args, 2, 'count');
  const pats0 = patternList(args[1], 'count');
  const ic = ignoreCaseOpt(args, 2, 'count');
  const pats = ic ? pats0.map((p) => p.toLowerCase()) : pats0;
  return mapTextNum(args[0], (s) => {
    if (s == null) return NaN;
    const t = ic ? s.toLowerCase() : s;
    let c = 0, i = 0;
    while (i < t.length) {
      let best = -1, bl = 0;
      for (const p of pats) { if (!p) continue; const q = t.indexOf(p, i); if (q >= 0 && (best < 0 || q < best)) { best = q; bl = p.length; } }
      if (best < 0) break;
      c++; i = best + bl;
    }
    return c;
  }, 'count', 'double');
}

function eraseFn(args) {
  need(args, 2, 'erase');
  const pats = patternList(args[1], 'erase').filter(Boolean).sort((a, b) => b.length - a.length);
  return mapText(args[0], (s) => { let out = s; for (const p of pats) out = out.split(p).join(''); return out; }, 'erase');
}

/** Position or pattern argument resolution for extract*/
function posOrPat(v, s, which, fname) {
  // returns [start, end) of the match or a position
  if (isTensor(v) && v.cls !== 'char') {
    const p = v.re[0];
    if (!(p >= 0) || !Number.isInteger(p) || p > s.length + (which === 'after' ? 0 : 1)) throw E(`base:${fname}:outOfRange`, 'Numeric position exceeds the number of characters.');
    return { pos: p };
  }
  const pats = patternList(v, fname);
  let best = null;
  for (const p of pats) { const q = s.indexOf(p); if (q >= 0 && (!best || q < best.at)) best = { at: q, len: p.length }; }
  return best ? { at: best.at, len: best.len } : null;
}

function extractBefore(args) {
  need(args, 2, 'extractBefore');
  return mapText(args[0], (s) => {
    const r = posOrPat(args[1], s, 'before', 'extractBefore');
    if (!r) return null;
    return r.pos !== undefined ? s.slice(0, r.pos - 1) : s.slice(0, r.at);
  }, 'extractBefore');
}
function extractAfter(args) {
  need(args, 2, 'extractAfter');
  return mapText(args[0], (s) => {
    const r = posOrPat(args[1], s, 'after', 'extractAfter');
    if (!r) return null;
    return r.pos !== undefined ? s.slice(r.pos) : s.slice(r.at + r.len);
  }, 'extractAfter');
}
function extractBetween(args) {
  need(args, 3, 'extractBetween');
  let inclusive = false;
  const nv = nameValues(args, 3, 'extractBetween', ['Boundaries']);
  if (nv.has('boundaries')) inclusive = optArg(nv.get('boundaries')) === 'inclusive';
  const one = (s) => {
    const numeric = isTensor(args[1]) && args[1].cls !== 'char';
    if (numeric) {
      const a = args[1].re[0], b = dense(args[2], 'extractBetween').re[0];
      return [s.slice(a - 1, b)];
    }
    const out = [];
    const p1 = patternList(args[1], 'extractBetween'), p2 = patternList(args[2], 'extractBetween');
    let i = 0;
    for (;;) {
      let a = -1, al = 0;
      for (const p of p1) { const q = s.indexOf(p, i); if (q >= 0 && (a < 0 || q < a)) { a = q; al = p.length; } }
      if (a < 0) break;
      let b = -1, bl = 0;
      for (const p of p2) { const q = s.indexOf(p, a + al); if (q >= 0 && (b < 0 || q < b)) { b = q; bl = p.length; } }
      if (b < 0) break;
      out.push(inclusive ? s.slice(a, b + bl) : s.slice(a + al, b));
      i = b + bl;
    }
    return out;
  };
  const v = args[0];
  const T = textList(v, 'extractBetween');
  if (T.list.length === 1) {
    const r = one(T.list[0] || '');
    if (T.kind === 'string') return stringArray([r.length, 1].map((x, i) => (i === 0 ? (r.length === 1 ? 1 : r.length) : 1)), r);
    if (T.kind === 'char') return r.length === 1 ? charRowKeep(r[0]) : cell([r.length, 1], r.map(charRowKeep));
    return cell([r.length, 1], r.map(charRowKeep));
  }
  const res = T.list.map((s) => { const r = one(s || ''); return r.length ? r[0] : ''; });
  return makeText(res, T.dims, T.kind);
}
function insertFn(after) {
  const fname = after ? 'insertAfter' : 'insertBefore';
  return (args) => {
    need(args, 3, fname);
    const ins = textArg(args[2]);
    return mapText(args[0], (s) => {
      if (isTensor(args[1]) && args[1].cls !== 'char') {
        const p = args[1].re[0];
        const at = after ? p : p - 1;
        return s.slice(0, at) + ins + s.slice(at);
      }
      const pats = patternList(args[1], fname);
      let out = s;
      for (const p of pats) { if (!p) continue; out = out.split(p).join(after ? p + ins : ins + p); }
      return out;
    }, fname);
  };
}

function startsEnds(fname, ends) {
  return containsLike(fname, ends ? (t, p) => t.endsWith(p) : (t, p) => t.startsWith(p));
}

function padFn(args) {
  need(args, 1, 'pad');
  let width = null, side = 'right', ch = ' ';
  let i = 1;
  if (i < args.length && isTensor(args[i]) && args[i].cls !== 'char') { width = args[i].re[0]; i++; }
  if (i < args.length) { const o = optArg(args[i]); if (['left', 'right', 'both'].includes(o)) { side = o; i++; } }
  if (i < args.length) { const c = textArg(args[i]); if (c !== null) ch = c; }
  const T = textList(args[0], 'pad');
  const w = width !== null ? width : Math.max(0, ...T.list.map((s) => (s ? s.length : 0)));
  const p = (s) => {
    if (s == null) return null;
    const k = w - s.length;
    if (k <= 0) return s;
    if (side === 'left') return ch.repeat(k) + s;
    if (side === 'right') return s + ch.repeat(k);
    const l = Math.floor(k / 2);
    return ch.repeat(l) + s + ch.repeat(k - l);
  };
  return mapText(args[0], p, 'pad');
}
function stripFn(args) {
  need(args, 1, 'strip');
  let side = 'both', ch = null;
  for (let i = 1; i < args.length; i++) { const o = optArg(args[i]); if (['left', 'right', 'both'].includes(o)) side = o; else ch = textArg(args[i]); }
  const isW = (c) => (ch === null ? /\s/.test(c) : c === ch);
  return mapText(args[0], (s) => {
    let a = 0, b = s.length;
    if (side !== 'right') while (a < b && isW(s[a])) a++;
    if (side !== 'left') while (b > a && isW(s[b - 1])) b--;
    return s.slice(a, b);
  }, 'strip');
}

// ------------------------------------------------------------- split / join

function splitWS(s) { return s.split(/[ \f\n\r\t\v   -     　]+/); }

function strsplitFn(args, nargout) {
  need(args, 1, 'strsplit');
  const s = textArg(args[0]);
  if (s === null) throw E('base:strsplit:InvalidStringInput', 'First input must be either a character vector or a string scalar.');
  let delims = null, i = 1;
  if (i < args.length && !(['collapsedelimiters', 'delimitertype'].includes(optArg(args[i])))) { delims = patternList(args[i], 'strsplit'); i++; }
  const nv = nameValues(args, i, 'strsplit', ['CollapseDelimiters', 'DelimiterType']);
  const collapse = nv.has('collapsedelimiters') ? (isTensor(nv.get('collapsedelimiters')) ? nv.get('collapsedelimiters').re[0] !== 0 : true) : true;
  const isRegex = nv.has('delimitertype') && optArg(nv.get('delimitertype')) === 'regularexpression';
  let pattern;
  if (delims === null) pattern = '\\s';
  else if (isRegex) pattern = delims.join('|');
  else pattern = delims.map((d) => unescapeFormat(d).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|');
  const re = new RegExp(collapse ? `(?:${pattern})+` : pattern, 'g');
  const parts = [], matches = [];
  let last = 0, m;
  while ((m = re.exec(s)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    parts.push(s.slice(last, m.index)); matches.push(m[0]); last = m.index + m[0].length;
  }
  parts.push(s.slice(last));
  const asString = isString(args[0]);
  const C = asString ? stringArray([1, parts.length], parts) : cell([1, parts.length], parts.map(charRowKeep));
  if (nargout >= 2) return [C, asString ? stringArray([1, matches.length], matches) : cell([1, matches.length], matches.map(charRowKeep))];
  return C;
}

function strjoinFn(args) {
  need(args, 1, 'strjoin');
  const v = args[0];
  if (!isCell(v) && !isString(v)) throw E('base:strjoin:InvalidCellType', 'First input must be a 1xN cell array of character vectors or string array.');
  const list = textList(v, 'strjoin').list.map((s) => (s == null ? '' : s));
  let out;
  if (args.length > 1 && (isCell(args[1]) || (isString(args[1]) && args[1].data.length > 1))) {
    const ds = patternList(args[1], 'strjoin');
    if (ds.length !== list.length - 1) throw E('base:strjoin:WrongNumberOfDelimiterElements', 'Delimiter must have one element less than the number of strings to join.');
    out = list.map((s, k) => s + (k < ds.length ? ds[k] : '')).join('');
  } else {
    const d = args.length > 1 ? unescapeFormat(textArg(args[1])) : ' ';
    out = list.join(d);
  }
  return isString(v) ? stringArray([1, 1], [out]) : charRowKeep(out);
}

function splitFn(args) {
  need(args, 1, 'split');
  const T = textList(args[0], 'split');
  const delims = args.length > 1 && !(isTensor(args[1]) && args[1].cls !== 'char') ? patternList(args[1], 'split') : null;
  const one = (s) => {
    if (delims === null) return splitWS(s.trim() === '' ? s : s).filter((x, i, a) => !(x === '' && (i === 0 || i === a.length - 1) && a.length > 1 && false));
    const pat = delims.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|');
    return s.split(new RegExp(pat));
  };
  const results = T.list.map((s) => (s == null ? [null] : delims === null ? splitWS(s) : one(s)));
  const kind = T.kind === 'char' ? 'cell' : T.kind;
  if (results.length === 1) {
    const r = results[0];
    return makeText(r, [r.length, 1], kind);
  }
  const np = results[0].length;
  if (!results.every((r) => r.length === np)) throw E('base:split:InconsistentNumberOfParts', 'Each element must split into the same number of parts.');
  const d = T.dims;
  const n = results.length;
  const data = new Array(n * np);
  if (d[1] === 1) { for (let i = 0; i < n; i++) for (let k = 0; k < np; k++) data[i + k * n] = results[i][k]; return makeText(data, [n, np], kind); }
  for (let i = 0; i < n; i++) for (let k = 0; k < np; k++) data[i + k * n] = results[i][k];
  return makeText(data, [...d, np], kind);
}

function joinFn(args) {
  need(args, 1, 'join');
  const v = args[0];
  const T = textList(v, 'join');
  let delim = ' ';
  let dim = null;
  for (let i = 1; i < args.length; i++) { if (isTensor(args[i]) && args[i].cls !== 'char') dim = args[i].re[0] - 1; else delim = textArg(args[i]); }
  const d = T.kind === 'char' ? [1, 1] : T.dims;
  if (dim === null) { dim = d.length - 1; while (dim > 0 && d[dim] === 1) dim--; }
  const before = d.slice(0, dim).reduce((a, b) => a * b, 1), len = d[dim] || 1, after = d.slice(dim + 1).reduce((a, b) => a * b, 1);
  const out = [];
  for (let a = 0; a < after; a++) for (let b = 0; b < before; b++) {
    const parts = []; for (let k = 0; k < len; k++) parts.push(T.list[a * before * len + k * before + b] || '');
    out.push(parts.join(delim));
  }
  const od = d.slice(); od[dim] = 1;
  if (T.kind === 'string') return stringArray(od, out);
  if (out.length === 1) return charRowKeep(out[0]);
  return cell(od, out.map(charRowKeep));
}

// ------------------------------------------------------------- whitespace / case

function strtrimFn(args) {
  need(args, 1, 'strtrim');
  const v = args[0];
  if (!isChar(v) && !isString(v) && !isCell(v)) throw E('base:strtrim:InputClass', 'Input should be a string, character array, or cell array of character vectors.');
  const ws = /^[\s\0]+|[\s\0]+$/g;
  if (isChar(v) && v.dims[0] > 1) {
    const T = textList(v);
    let lead = Infinity, trail = Infinity;
    for (const s of T.list) { lead = Math.min(lead, s.length - s.replace(/^[\s\0]+/, '').length); trail = Math.min(trail, s.length - s.replace(/[\s\0]+$/, '').length); }
    return charMatrix(T.list.map((s) => s.slice(lead, s.length - trail)));
  }
  return mapText(v, (s) => s.replace(ws, ''), 'strtrim');
}
function deblankFn(args) {
  need(args, 1, 'deblank');
  return mapText(args[0], (s) => s.replace(/[\s\0]+$/, ''), 'deblank');
}
function caseFn(upper) {
  return (args) => {
    need(args, 1, upper ? 'upper' : 'lower');
    const v = args[0];
    const f = (s) => (upper ? s.toUpperCase() : s.toLowerCase());
    if (isChar(v)) {
      const re = Float64Array.from(v.re, (c) => { const s = f(String.fromCharCode(c)); return s.length === 1 ? s.charCodeAt(0) : c; });
      return { ...v, re };
    }
    if (isString(v)) return stringArray(v.dims, v.data.map((s) => (s == null ? null : f(s))));
    if (isCell(v)) return cell(v.dims, v.data.map((x) => (isChar(x) || isString(x) ? caseFn(upper)([x]) : (() => { throw E('base:upper:InvalidInput', 'Cell array elements must be character vectors.'); })())));
    if (isTensor(v)) return v;
    throw E(`base:${upper ? 'upper' : 'lower'}:InvalidInput`, 'Input must be a string array, character array, or cell array of character vectors.');
  };
}

function strcatFn(args) {
  if (args.length === 0) throw E('base:strcat:notEnoughInputs', 'Not enough input arguments.');
  const anyCell = args.some(isCell), anyStr = args.some(isString);
  if (anyCell || anyStr) {
    const lists = args.map((a) => {
      if (isChar(a) && a.dims[0] <= 1) return { list: [charRowStr(a)], dims: [1, 1] };
      if (isTensor(a) && !isChar(a) && a.re.length === 0) return { list: [''], dims: [1, 1] };
      const T = textList(a, 'strcat'); return { list: T.list, dims: T.dims };
    });
    let n = 1, dims = [1, 1];
    for (const L of lists) if (L.list.length !== 1) { if (n !== 1 && L.list.length !== n) throw E('base:strcat:InvalidInputSize', 'Inputs must be the same size or either one can be a scalar.'); n = L.list.length; dims = L.dims; }
    const out = [];
    for (let i = 0; i < n; i++) out.push(lists.map((L) => (L.list.length === 1 ? L.list[0] : L.list[i])).reduce((a, b) => (a == null || b == null ? null : a + b), ''));
    return anyStr ? stringArray(dims, out) : cell(dims, out.map(charRowKeep));
  }
  // char arrays: trailing whitespace removed, rows concatenated
  const T = args.map((a) => {
    if (isChar(a)) return textList(a).list.map((s) => s.replace(/[ \t\n\v\f\r\0]+$/, ''));
    if (isTensor(a) && a.re.length === 0) return [''];
    if (isTensor(a)) return [String.fromCharCode(...a.re)];
    throw E('base:strcat:InvalidInputType', 'Inputs must be character arrays, cell arrays, or string arrays.');
  });
  let rows = 1;
  for (const l of T) if (l.length !== 1) { if (rows !== 1 && l.length !== rows) throw E('base:strcat:InvalidInputSize', 'Character arrays must have the same number of rows.'); rows = l.length; }
  const lines = [];
  for (let i = 0; i < rows; i++) lines.push(T.map((l) => (l.length === 1 ? l[0] : l[i])).join(''));
  return rows === 1 ? charRowKeep(lines[0]) : charMatrix(lines);
}

function strvcatFn(args) {
  const lines = [];
  for (const a of args) {
    if (isCell(a)) { for (const x of a.data) { const s = textArg(x); if (s) lines.push(s); } continue; }
    if (isString(a)) { for (const s of a.data) if (s) lines.push(s); continue; }
    if (isChar(a)) { if (a.re.length) lines.push(...textList(a).list); continue; }
    if (isTensor(a) && a.re.length) lines.push(String.fromCharCode(...a.re));
  }
  return lines.length ? charMatrix(lines) : charOf('');
}

// ------------------------------------------------------------- bases

function toBaseList(d, base, minLen, fname) {
  const t = dense(d, fname);
  const list = Array.from(t.re, (x) => {
    if (x < 0 || !Number.isFinite(x)) {
      if (x < 0 && Number.isInteger(x) && fname === 'dec2bin') {
        // two's complement with the smallest of 8/16/32/64 bits
        const bits = x >= -128 ? 8 : x >= -32768 ? 16 : x >= -2147483648 ? 32 : 64;
        return BigInt.asUintN(bits, BigInt(x)).toString(2);
      }
      throw E(`base:${fname}:negativeInput`, 'D must be a nonnegative integer.');
    }
    let b = BigInt(Math.floor(x)).toString(base).toUpperCase();
    return b;
  });
  const w = Math.max(minLen, ...list.map((s) => s.length), 1);
  const padded = list.map((s) => s.padStart(w, '0'));
  if (padded.length === 0) return charOf('');
  if (padded.length === 1) return str(padded[0]);
  return charMatrix(padded);
}
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function fromBase(v, base, fname) {
  const T = isChar(v) ? textList(v) : textList(v, fname);
  const out = T.list.map((s0) => {
    const s = (s0 || '').replace(/\s/g, '').toUpperCase().replace(/^0X/, base === 16 ? '' : '0X').replace(/^0B/, base === 2 ? '' : '0B');
    if (!s.length) return 0;
    let r = 0;
    for (const c of s) {
      const d = DIGITS.indexOf(c);
      if (d < 0 || d >= base) throw E(`base:${fname}:IllegalString`, `Input string contains characters that are not valid digits in base ${base}.`);
      r = r * base + d;
    }
    return r;
  });
  return tensor('double', [out.length, 1], out);
}

// ------------------------------------------------------------- character classes

const CLASS_TESTS = {
  alpha: (c) => /\p{L}/u.test(c), digit: (c) => /[0-9]/.test(c), alphanum: (c) => /[\p{L}0-9]/u.test(c), lower: (c) => /\p{Ll}/u.test(c),
  upper: (c) => /\p{Lu}/u.test(c), wspace: (c) => /\s/.test(c), punct: (c) => /[\p{P}\p{S}]/u.test(c), cntrl: (c) => /[\x00-\x1f\x7f]/.test(c),
  xdigit: (c) => /[0-9a-fA-F]/.test(c), graphic: (c) => /[^\s\x00-\x1f\x7f]/.test(c), graph: (c) => /[^\s\x00-\x1f\x7f]/.test(c), print: (c) => /[^\x00-\x1f\x7f]/.test(c), ascii: (c) => c.charCodeAt(0) < 128,
};
function charClassFn(fname, test) {
  return (args) => {
    need(args, 1, fname);
    const v = args[0];
    if (isChar(v)) return { cls: 'logical', dims: v.dims, re: Float64Array.from(v.re, (c) => (test(String.fromCharCode(c)) ? 1 : 0)), im: null };
    if (isString(v) && v.data.length === 1) { const s = v.data[0] || ''; return { cls: 'logical', dims: [1, s.length], re: Float64Array.from(s, (c) => (test(c) ? 1 : 0)), im: null }; }
    if (isTensor(v)) return { cls: 'logical', dims: v.dims, re: new Float64Array(v.re.length), im: null };
    throw E(`base:${fname}:invalidInput`, 'Input must be a character array or string scalar.');
  };
}
function isstrpropFn(args) {
  need(args, 2, 'isstrprop');
  const cat = optArg(args[1]);
  const test = CLASS_TESTS[cat];
  if (!test) throw E('base:isstrprop:InvalidCategory', `Invalid category '${textArg(args[1])}'.`);
  const f = charClassFn('isstrprop', test);
  const v = args[0];
  if (isCell(v)) return cell(v.dims, v.data.map((x) => f([x])));
  if (isString(v) && v.data.length > 1) return cell(v.dims, v.data.map((s) => f([str(s || '')])));
  return f([v]);
}

// ------------------------------------------------------------- encodings

function encodeText(s, enc) {
  enc = (enc || 'UTF-8').toUpperCase().replace(/_/g, '-');
  if (enc === 'UTF-8' || enc === 'UTF8') return Array.from(new TextEncoder().encode(s));
  if (enc === 'US-ASCII' || enc === 'ASCII') return Array.from(s, (c) => { const k = c.charCodeAt(0); return k < 128 ? k : 26; });
  if (enc === 'ISO-8859-1' || enc === 'LATIN1' || enc === 'WINDOWS-1252') return Array.from(s, (c) => { const k = c.charCodeAt(0); return k < 256 ? k : 26; });
  if (enc === 'UTF-16LE' || enc === 'UTF-16') { const out = []; for (let i = 0; i < s.length; i++) { const k = s.charCodeAt(i); out.push(k & 255, k >> 8); } return out; }
  if (enc === 'UTF-16BE') { const out = []; for (let i = 0; i < s.length; i++) { const k = s.charCodeAt(i); out.push(k >> 8, k & 255); } return out; }
  throw E('base:unicode2native:UnknownEncoding', `Unsupported character encoding '${enc}'.`);
}
function decodeBytes(bytes, enc) {
  enc = (enc || 'UTF-8').toUpperCase().replace(/_/g, '-');
  const u8 = Uint8Array.from(bytes);
  if (enc === 'UTF-8' || enc === 'UTF8') return new TextDecoder('utf-8').decode(u8);
  if (enc === 'US-ASCII' || enc === 'ASCII' || enc === 'ISO-8859-1' || enc === 'LATIN1') return String.fromCharCode(...u8);
  if (enc === 'WINDOWS-1252') return new TextDecoder('windows-1252').decode(u8);
  if (enc === 'UTF-16LE' || enc === 'UTF-16') return new TextDecoder('utf-16le').decode(u8);
  if (enc === 'UTF-16BE') return new TextDecoder('utf-16be').decode(u8);
  try { return new TextDecoder(enc.toLowerCase()).decode(u8); } catch (e) { throw E('base:native2unicode:UnknownEncoding', `Unsupported character encoding '${enc}'.`); }
}

// ------------------------------------------------------------- printf family

function sprintfFn(args, nargout) {
  need(args, 1, 'sprintf');
  const f = textArg(args[0]);
  if (f === null) throw E('base:sprintf:invalidFormat', 'Format must be a character vector or string scalar.');
  const text = sprintfJS(f, args.slice(1), 'sprintf');
  const out = isString(args[0]) ? stringArray([1, 1], [text]) : charRowKeep(text);
  return nargout >= 2 ? [out, charOf('')] : out;
}

function fprintfFn(args, nargout, ctx) {
  need(args, 1, 'fprintf');
  let fid = 1, rest = args;
  if (isTensor(args[0]) && args[0].cls !== 'char' && args[0].re.length === 1 && args.length >= 1 && (args.length === 1 ? false : true)) { fid = args[0].re[0]; rest = args.slice(1); }
  if (!rest.length) throw E('base:fprintf:notEnoughInputs', 'Not enough input arguments.');
  const f = textArg(rest[0]);
  if (f === null) throw E('base:fprintf:invalidFormat', 'Format must be a character vector or string scalar.');
  const text = sprintfJS(f, rest.slice(1), 'fprintf');
  if (fid === 1) ctx.out(text);
  else if (fid === 2) (ctx.errOut || ctx.out).call(ctx, text);
  else {
    const reg = ctx.registry || (ctx.session && ctx.session.registry);
    if (!reg || !reg.builtins || !reg.builtins.__fwrite_text__) throw E('base:fprintf:invalidFid', 'Invalid file identifier. Use fopen to generate a valid file identifier.');
    ctx.call('__fwrite_text__', [num(fid), charRowKeep(text)], 0);
  }
  if (nargout >= 1) return num(new TextEncoder().encode(text).length);
  return undefined;
}

function composeFn(args) {
  need(args, 1, 'compose');
  const T = textList(args[0], 'compose');
  const data = args.slice(1);
  if (data.length === 0) return makeText(T.list.map((s) => unescapeFormat(s || '')), T.dims, T.kind === 'char' ? 'string' : T.kind);
  const f = T.list[0] || '';
  const parts = parseFormat(unescapeFormat(f));
  const nspec = parts.filter((p) => !('lit' in p)).length;
  const A = data.map((a) => (isString(a) || isChar(a) || isCell(a) ? toStringArray(a) : toTensor(a)));
  const first = A[0];
  const fd = first.dims;
  const itemOf = (a, k) => (isString(a) ? { text: a.data[k] == null ? '<missing>' : a.data[k] } : { num: a.re[k] });
  const out = [];
  let od;
  if (A.length === 1 && nspec <= 1) {
    const n = isString(first) ? first.data.length : first.re.length;
    for (let k = 0; k < n; k++) out.push(runFormat(parts, [itemOf(first, k)]));
    od = fd;
  } else if (A.length === 1) {
    const m = fd[0], n = (isString(first) ? first.data.length : first.re.length) / Math.max(m, 1);
    for (let i = 0; i < m; i++) { const items = []; for (let j = 0; j < n; j++) items.push(itemOf(first, i + j * m)); out.push(runFormat(parts, items)); }
    od = [m, 1];
  } else {
    const m = isString(first) ? first.data.length : first.re.length;
    for (let i = 0; i < m; i++) out.push(runFormat(parts, A.map((a) => itemOf(a, (isString(a) ? a.data.length : a.re.length) === 1 ? 0 : i))));
    od = fd;
  }
  const res = stringArray(od, out);
  if (T.kind === 'cell') return cell(od, out.map(charRowKeep));
  if (T.kind === 'char') return cell(od, out.map(charRowKeep));
  return res;
}

// ------------------------------------------------------------- builtins

export const builtins = {
  num2str: num2strFn,
  int2str(args) {
    need(args, 1, 'int2str');
    const v = args[0];
    if (isChar(v) || isTensor(v) && v.cls === 'logical') return num2strFn([convertClass(v, 'double')]);
    const t = toTensor(v);
    const r = finalize(t.cls === 'single' ? 'single' : t.cls in INT_RANGE ? t.cls : 'double', t.dims, Float64Array.from(t.re, (x) => (Number.isFinite(x) ? (x < 0 ? -Math.round(-x) : Math.round(x)) : x)));
    return num2strFn([r]);
  },
  mat2str: mat2strFn,
  str2num: str2numFn,
  str2double: str2doubleFn,
  string(args, nargout, ctx) {
    if (args.length === 0) return stringArray([1, 1], ['']);
    if (args.length > 1 && args[0] && args[0].isObject) {
      const def = classDef(ctx, args[0].cls);
      if (def && def.methods && def.methods.string) return def.methods.string(args, nargout, ctx);
    }
    return toStringArray(args[0], ctx);
  },
  strings(args) {
    const t = args.length === 0 ? [0, 0] : args.length === 1 ? (dense(args[0], 'strings').re.length === 1 ? [args[0].re[0], args[0].re[0]] : Array.from(args[0].re)) : args.map((a) => dense(a, 'strings').re[0]);
    const d = normDims(t.map((x) => Math.max(0, x)));
    return stringArray(d, new Array(prod(d)).fill(''));
  },
  cellstr: cellstrFn,
  strcmp: cmpFn('strcmp', false, false),
  strcmpi: cmpFn('strcmpi', false, true),
  strncmp: cmpFn('strncmp', true, false),
  strncmpi: cmpFn('strncmpi', true, true),
  strfind: strfindFn,
  strrep: strrepFn,
  strsplit: strsplitFn,
  strjoin: strjoinFn,
  strtrim: strtrimFn,
  deblank: deblankFn,
  upper: caseFn(true),
  lower: caseFn(false),
  strcat: strcatFn,
  strvcat: strvcatFn,
  blanks(args) { need(args, 1, 'blanks'); const n = dense(args[0], 'blanks').re[0]; if (!(n >= 0) || !Number.isInteger(n)) throw E('base:blanks:invalidN', 'N must be a nonnegative integer.'); return n === 0 ? tensor('char', [1, 0]) : str(' '.repeat(n)); },
  newline() { return str('\n'); },
  contains: containsLike('contains', (t, p) => t.includes(p)),
  startsWith: startsEnds('startsWith', false),
  endsWith: startsEnds('endsWith', true),
  replace: replaceFn,
  split: splitFn,
  join: joinFn,
  extractBefore,
  extractAfter,
  extractBetween,
  insertBefore: insertFn(false),
  insertAfter: insertFn(true),
  erase: eraseFn,
  pad: padFn,
  strip: stripFn,
  count: countFn,
  reverse(args) { need(args, 1, 'reverse'); return mapText(args[0], (s) => Array.from(s).reverse().join(''), 'reverse'); },
  strlength(args) {
    need(args, 1, 'strlength');
    const v = args[0];
    if (isChar(v) && v.dims[0] <= 1) return num(v.re.length);
    return mapTextNum(v, (s) => (s == null ? NaN : s.length), 'strlength', 'double');
  },
  strjust(args) {
    need(args, 1, 'strjust');
    const side = args.length > 1 ? optArg(args[1]) : 'right';
    const T = textList(args[0], 'strjust');
    const w = Math.max(0, ...T.list.map((s) => s.length));
    const f = (s) => { const t = s.trim(); const k = w - t.length; if (side === 'left') return t.padEnd(w); if (side === 'center') { const l = Math.floor(k / 2); return ' '.repeat(l) + t + ' '.repeat(k - l); } return t.padStart(w); };
    if (T.kind === 'charmat') return charMatrix(T.list.map(f));
    return mapText(args[0], f, 'strjust');
  },
  dec2bin(args) { need(args, 1, 'dec2bin'); return toBaseList(args[0], 2, args.length > 1 ? dense(args[1], 'dec2bin').re[0] : 0, 'dec2bin'); },
  dec2hex(args) { need(args, 1, 'dec2hex'); return toBaseList(args[0], 16, args.length > 1 ? dense(args[1], 'dec2hex').re[0] : 0, 'dec2hex'); },
  dec2base(args) {
    need(args, 2, 'dec2base');
    const b = textArg(args[1]);
    if (b !== null) {
      // custom symbol set
      const sym = b; const base = sym.length;
      const t = dense(args[0], 'dec2base');
      const list = Array.from(t.re, (x) => { let n = Math.floor(x), s = ''; do { s = sym[n % base] + s; n = Math.floor(n / base); } while (n > 0); return s; });
      const w = Math.max(args.length > 2 ? dense(args[2], 'dec2base').re[0] : 0, ...list.map((s) => s.length));
      const padded = list.map((s) => s.padStart(w, sym[0]));
      return padded.length === 1 ? str(padded[0]) : charMatrix(padded);
    }
    const base = dense(args[1], 'dec2base').re[0];
    if (!(base >= 2 && base <= 36)) throw E('base:dec2base:invalidBase', 'Base must be an integer between 2 and 36.');
    return toBaseList(args[0], base, args.length > 2 ? dense(args[2], 'dec2base').re[0] : 0, 'dec2base');
  },
  bin2dec(args) { need(args, 1, 'bin2dec'); return fromBase(args[0], 2, 'bin2dec'); },
  hex2dec(args) { need(args, 1, 'hex2dec'); return fromBase(args[0], 16, 'hex2dec'); },
  base2dec(args) { need(args, 2, 'base2dec'); return fromBase(args[0], dense(args[1], 'base2dec').re[0], 'base2dec'); },
  isspace: charClassFn('isspace', (c) => /[ \t\n\v\f\r]/.test(c)),
  isletter: charClassFn('isletter', (c) => /\p{L}/u.test(c)),
  isstrprop: isstrpropFn,
  isvarname(args) {
    need(args, 1, 'isvarname');
    const s = textArg(args[0]);
    const KW = ['break', 'case', 'catch', 'classdef', 'continue', 'else', 'elseif', 'end', 'for', 'function', 'global', 'if', 'otherwise', 'parfor', 'persistent', 'return', 'spmd', 'switch', 'try', 'while'];
    return bool(s !== null && /^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(s) && !KW.includes(s));
  },
  iskeyword(args) {
    const KW = ['break', 'case', 'catch', 'classdef', 'continue', 'else', 'elseif', 'end', 'for', 'function', 'global', 'if', 'otherwise', 'parfor', 'persistent', 'return', 'spmd', 'switch', 'try', 'while'];
    if (args.length === 0) return cell([KW.length, 1], KW.map((k) => str(k)));
    return bool(KW.includes(textArg(args[0])));
  },
  unicode2native(args) {
    need(args, 1, 'unicode2native');
    const s = textArg(args[0]);
    if (s === null) throw E('base:unicode2native:invalidInput', 'Input must be a character vector or string scalar.');
    const b = encodeText(s, args.length > 1 ? textArg(args[1]) : 'UTF-8');
    return tensor('uint8', [1, b.length], b);
  },
  native2unicode(args) {
    need(args, 1, 'native2unicode');
    const t = dense(args[0], 'native2unicode');
    const s = decodeBytes(Array.from(t.re), args.length > 1 ? textArg(args[1]) : 'UTF-8');
    return charRowKeep(s);
  },
  sprintf: sprintfFn,
  fprintf: fprintfFn,
  compose: composeFn,
  convertCharsToStrings(args) { return args.length === 1 ? convOne(args[0], true) : args.map((a) => convOne(a, true)); },
  convertStringsToChars(args) { return args.length === 1 ? convOne(args[0], false) : args.map((a) => convOne(a, false)); },
  ismissing(args) {
    need(args, 1, 'ismissing');
    const v = args[0];
    if (isString(v)) return { cls: 'logical', dims: v.dims, re: Float64Array.from(v.data, (s) => (s == null ? 1 : 0)), im: null };
    if (isTensor(v) || isSparse(v)) { const t = toTensor(v); if (t.cls === 'char') return { cls: 'logical', dims: t.dims, re: Float64Array.from(t.re, (c) => (c === 32 ? 1 : 0)), im: null }; return { cls: 'logical', dims: t.dims, re: Float64Array.from(t.re, (x, i) => (x !== x || (t.im && t.im[i] !== t.im[i]) ? 1 : 0)), im: null }; }
    if (isCell(v)) return { cls: 'logical', dims: v.dims, re: Float64Array.from(v.data, (x) => (isChar(x) && x.re.length === 0 ? 1 : 0)), im: null };
    throw E('base:ismissing:invalidType', `ismissing is not supported for values of class '${v.cls}'.`);
  },
};

function convOne(v, toStrings) {
  if (toStrings) {
    if (isChar(v) && v.dims[0] <= 1) return stringArray([1, 1], [charRowStr(v)]);
    if (isCell(v) && isCellstr(v)) return stringArray(v.dims, v.data.map(charRowStr));
    return v;
  }
  if (isString(v)) {
    if (v.data.length === 1) return charRowKeep(v.data[0] || '');
    return cell(v.dims, v.data.map((s) => charRowKeep(s || '')));
  }
  if (isCell(v)) return cell(v.dims, v.data.map((x) => (isString(x) && x.data.length === 1 ? charRowKeep(x.data[0] || '') : x)));
  return v;
}

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  num2str: H('Convert numbers to a character array.', '숫자를 문자형 배열로 변환.', ['s = num2str(A)', 's = num2str(A, precision)', 's = num2str(A, formatSpec)']),
  int2str: H('Convert integers to characters (rounds).', '정수를 문자로 변환 (반올림).', ['s = int2str(N)']),
  mat2str: H('Convert a matrix to its text form ([1 2;3 4]).', '행렬을 텍스트 형식으로 변환 ([1 2;3 4]).', ['s = mat2str(A)', 's = mat2str(A, n)', "s = mat2str(A, 'class')"]),
  str2num: H('Convert text to a numeric array (evaluates the text).', '텍스트를 숫자 배열로 변환 (텍스트 평가).', ['X = str2num(txt)', '[X, tf] = str2num(txt)']),
  str2double: H('Convert text to double precision values (NaN when invalid).', '텍스트를 배정밀도 값으로 변환 (잘못되면 NaN).', ['X = str2double(str)']),
  string: H('String array.', 'string 배열.', ['str = string(A)', 'str = string(datetime, fmt)']),
  strings: H('Create a string array with no characters.', '빈 문자들로 된 string 배열 생성.', ['str = strings(n)', 'str = strings(sz1, ..., szN)']),
  cellstr: H('Convert to a cell array of character vectors.', '문자형 벡터로 된 셀형 배열로 변환.', ['C = cellstr(A)']),
  strcmp: H('Compare strings (case sensitive).', '문자열 비교 (대소문자 구분).', ['tf = strcmp(s1, s2)']),
  strcmpi: H('Compare strings (case insensitive).', '문자열 비교 (대소문자 무시).', ['tf = strcmpi(s1, s2)']),
  strncmp: H('Compare first n characters (case sensitive).', '처음 n개 문자 비교 (대소문자 구분).', ['tf = strncmp(s1, s2, n)']),
  strncmpi: H('Compare first n characters (case insensitive).', '처음 n개 문자 비교 (대소문자 무시).', ['tf = strncmpi(s1, s2, n)']),
  strfind: H('Find occurrences of a pattern in text.', '텍스트에서 패턴 위치 찾기.', ['k = strfind(str, pat)', "k = strfind(str, pat, 'IgnoreCase', true)"]),
  strrep: H('Find and replace substrings.', '부분 문자열 찾아 바꾸기.', ['newStr = strrep(str, old, new)']),
  strsplit: H('Split text at delimiters.', '구분 기호로 텍스트 분할.', ['C = strsplit(str)', 'C = strsplit(str, delimiter)', "C = strsplit(..., 'CollapseDelimiters', false)", '[C, matches] = strsplit(...)']),
  strjoin: H('Join strings with a delimiter.', '구분 기호로 문자열 결합.', ['str = strjoin(C)', 'str = strjoin(C, delimiter)']),
  strtrim: H('Remove leading and trailing whitespace.', '앞뒤 공백 제거.', ['newStr = strtrim(str)']),
  deblank: H('Remove trailing whitespace.', '끝 공백 제거.', ['newStr = deblank(str)']),
  upper: H('Convert to uppercase.', '대문자로 변환.', ['newStr = upper(str)']),
  lower: H('Convert to lowercase.', '소문자로 변환.', ['newStr = lower(str)']),
  strcat: H('Concatenate strings horizontally.', '문자열을 가로로 연결.', ['s = strcat(s1, ..., sN)']),
  strvcat: H('Concatenate strings vertically (legacy).', '문자열을 세로로 연결 (구형).', ['S = strvcat(t1, t2, ...)']),
  blanks: H('Character vector of blanks.', '공백 문자형 벡터.', ['str = blanks(n)']),
  newline: H('Newline character.', '줄 바꿈 문자.', ['c = newline']),
  contains: H('True if text contains a pattern.', '텍스트가 패턴을 포함하면 참.', ['TF = contains(str, pat)', "TF = contains(str, pat, 'IgnoreCase', true)"]),
  startsWith: H('True if text starts with a pattern.', '텍스트가 패턴으로 시작하면 참.', ['TF = startsWith(str, pat)']),
  endsWith: H('True if text ends with a pattern.', '텍스트가 패턴으로 끝나면 참.', ['TF = endsWith(str, pat)']),
  replace: H('Find and replace one or more substrings.', '하나 이상의 부분 문자열 찾아 바꾸기.', ['newStr = replace(str, old, new)']),
  split: H('Split strings at delimiters.', '구분 기호에서 문자열 분할.', ['newStr = split(str)', 'newStr = split(str, delimiter)']),
  join: H('Combine strings.', '문자열 결합.', ['newStr = join(str)', 'newStr = join(str, delimiter)', 'newStr = join(str, dim)']),
  extractBefore: H('Extract substring before a position or pattern.', '위치나 패턴 앞의 부분 문자열 추출.', ['newStr = extractBefore(str, pat)', 'newStr = extractBefore(str, pos)']),
  extractAfter: H('Extract substring after a position or pattern.', '위치나 패턴 뒤의 부분 문자열 추출.', ['newStr = extractAfter(str, pat)', 'newStr = extractAfter(str, pos)']),
  extractBetween: H('Extract substrings between start and end points.', '시작점과 끝점 사이의 부분 문자열 추출.', ['newStr = extractBetween(str, startPat, endPat)', 'newStr = extractBetween(str, startPos, endPos)']),
  insertBefore: H('Insert text before a position or pattern.', '위치나 패턴 앞에 텍스트 삽입.', ['newStr = insertBefore(str, pat, newText)']),
  insertAfter: H('Insert text after a position or pattern.', '위치나 패턴 뒤에 텍스트 삽입.', ['newStr = insertAfter(str, pat, newText)']),
  erase: H('Delete substrings.', '부분 문자열 삭제.', ['newStr = erase(str, match)']),
  pad: H('Add leading or trailing characters.', '앞이나 뒤에 문자 추가.', ['newStr = pad(str)', 'newStr = pad(str, numberOfCharacters)', "newStr = pad(..., 'left', padCharacter)"]),
  strip: H('Remove leading and trailing characters.', '앞뒤 문자 제거.', ['newStr = strip(str)', "newStr = strip(str, 'left')", 'newStr = strip(str, side, stripCharacter)']),
  count: H('Count occurrences of a pattern.', '패턴 발생 횟수.', ['A = count(str, pat)']),
  reverse: H('Reverse order of characters.', '문자 순서 뒤집기.', ['newStr = reverse(str)']),
  strlength: H('Length of strings.', '문자열 길이.', ['L = strlength(str)']),
  strjust: H('Justify a character array.', '문자형 배열 정렬.', ['S = strjust(S)', "S = strjust(S, 'left')"]),
  dec2bin: H('Convert decimal integer to binary text.', '10진 정수를 2진 텍스트로 변환.', ['str = dec2bin(d)', 'str = dec2bin(d, n)']),
  dec2hex: H('Convert decimal integer to hexadecimal text.', '10진 정수를 16진 텍스트로 변환.', ['str = dec2hex(d)', 'str = dec2hex(d, n)']),
  dec2base: H('Convert decimal integer to text in a base.', '10진 정수를 지정 진법 텍스트로 변환.', ['str = dec2base(d, base)', 'str = dec2base(d, base, n)']),
  bin2dec: H('Convert binary text to a decimal number.', '2진 텍스트를 10진 수로 변환.', ['D = bin2dec(binStr)']),
  hex2dec: H('Convert hexadecimal text to a decimal number.', '16진 텍스트를 10진 수로 변환.', ['D = hex2dec(hexStr)']),
  base2dec: H('Convert text in a base to a decimal number.', '지정 진법 텍스트를 10진 수로 변환.', ['D = base2dec(baseStr, base)']),
  isspace: H('True for whitespace characters.', '공백 문자이면 참.', ['TF = isspace(A)']),
  isletter: H('True for letters.', '문자(글자)이면 참.', ['TF = isletter(A)']),
  isstrprop: H('Determine which characters are of a category.', '문자가 지정 범주인지 판별.', ["TF = isstrprop(str, 'alpha')", "TF = isstrprop(str, 'digit')"]),
  isvarname: H('True for a valid variable name.', '유효한 변수 이름이면 참.', ['tf = isvarname(s)']),
  iskeyword: H('True for a language keyword; list keywords.', '언어 키워드이면 참; 키워드 목록.', ['tf = iskeyword(s)', 'C = iskeyword']),
  unicode2native: H('Convert characters to encoded bytes.', '문자를 인코딩된 바이트로 변환.', ['bytes = unicode2native(str)', 'bytes = unicode2native(str, encoding)']),
  native2unicode: H('Convert encoded bytes to characters.', '인코딩된 바이트를 문자로 변환.', ['str = native2unicode(bytes)', 'str = native2unicode(bytes, encoding)']),
  sprintf: H('Format data into text.', '데이터를 텍스트로 서식화.', ['str = sprintf(formatSpec, A1, ..., An)']),
  fprintf: H('Write formatted data to the Command Window or a file.', '서식화된 데이터를 명령 창이나 파일에 쓰기.', ['fprintf(formatSpec, A1, ..., An)', 'fprintf(fileID, formatSpec, A1, ..., An)', 'nbytes = fprintf(...)']),
  compose: H('Format data into multiple strings.', '데이터를 여러 문자열로 서식화.', ['str = compose(formatSpec, A)', 'str = compose(formatSpec, A1, ..., AN)']),
  convertCharsToStrings: H('Convert character arrays to string arrays.', '문자형 배열을 string 배열로 변환.', ['B = convertCharsToStrings(A)']),
  convertStringsToChars: H('Convert string arrays to character arrays.', 'string 배열을 문자형 배열로 변환.', ['B = convertStringsToChars(A)']),
  ismissing: H('Find missing values (NaN, <missing>, empty text).', '누락 값 찾기 (NaN, <missing>, 빈 텍스트).', ['TF = ismissing(A)']),
};
