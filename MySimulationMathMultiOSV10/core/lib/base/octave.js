// GNU Octave extensions of the base library (data side): character class
// tests, Octave string utilities (index / rindex / substr / strtrunc /
// ostrsplit / strread / untabify / escapes ...), cell and struct helpers,
// padding and rearranging (postpad / prepad / vec / vech / rotdim /
// repelems / nth_element), lookup, accumdim, bsxfun, merge / ifelse,
// constants e and NA, sizes (rows / columns / sizeof / size_equal),
// base64 of numeric data, message digests and version comparison.
import {
  tensor, isTensor, isSparse, isString, isCell, isStruct, isChar, isObject, isFuncHandle,
  toTensor, str, cell, num, bool, prod, normDims, toStr, stringArray, charMatrix,
} from '../../value.js';
import {
  E, textArg, finalize, firstNonSingleton, splitDims, dimsWith, gather, count,
  textList, sizeArgs, permuteAny, resolveIndex, boolT, isIntCls,
} from './util.js';
import { catClass } from './ops.js';

const first = (r) => (Array.isArray(r) ? r[0] : r);
const call1 = (ctx, f, args) => first(ctx.call(f, args, 1));
const dimsOfV = (v) => (v && v.dims ? v.dims : [1, 1]);
const S = (v, what = 'Argument') => {
  const t = textArg(v);
  if (t === null) throw E('base:text:invalidInput', `${what} must be a character vector or string scalar.`);
  return t;
};
const scalarNum = (v, fname, what = 'Argument') => {
  const t = isTensor(v) || isSparse(v) ? toTensor(v) : null;
  if (!t || t.re.length !== 1) throw E(`base:${fname}:invalidInput`, `${what} must be a numeric scalar.`);
  return t.re[0];
};
const charOrEmpty = (s) => { const t = str(s); if (!s.length) t.dims = [1, 0]; return t; };

// ------------------------------------------------------------- character classes

const UL = /\p{L}/u, ULL = /\p{Ll}/u, ULU = /\p{Lu}/u, UPUNCT = /[\p{P}\p{S}]/u, UCTRL = /\p{Cc}/u, USPACE = /\s/u;
const CLASSES = {
  isalpha: (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c > 127 && UL.test(String.fromCharCode(c))),
  isdigit: (c) => c >= 48 && c <= 57,
  isalnum: (c) => CLASSES.isalpha(c) || CLASSES.isdigit(c),
  islower: (c) => (c >= 97 && c <= 122) || (c > 127 && ULL.test(String.fromCharCode(c))),
  isupper: (c) => (c >= 65 && c <= 90) || (c > 127 && ULU.test(String.fromCharCode(c))),
  isxdigit: (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102),
  ispunct: (c) => (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126) || (c > 127 && UPUNCT.test(String.fromCharCode(c))),
  iscntrl: (c) => c < 32 || c === 127 || (c > 127 && UCTRL.test(String.fromCharCode(c))),
  isprint: (c) => (c >= 32 && c <= 126) || (c > 159 && !UCTRL.test(String.fromCharCode(c))),
  isgraph: (c) => (c >= 33 && c <= 126) || (c > 159 && !UCTRL.test(String.fromCharCode(c)) && !USPACE.test(String.fromCharCode(c))),
  isascii: (c) => c >= 0 && c < 128,
};
function charClass(name) {
  const test = CLASSES[name];
  const apply = (v) => {
    if (isCell(v)) return cell(v.dims, v.data.map(apply));
    if (isString(v)) return cell(v.dims, v.data.map((s) => apply(charOrEmpty(s || ''))));
    if (isChar(v)) { const re = new Float64Array(v.re.length); for (let i = 0; i < re.length; i++) re[i] = test(v.re[i]) ? 1 : 0; return boolT(v.dims, re); }
    if (name === 'isascii' && (isTensor(v) || isSparse(v))) {
      // numeric codes are tested as characters too
      const t = toTensor(v); const re = new Float64Array(t.re.length);
      for (let i = 0; i < re.length; i++) re[i] = Number.isInteger(t.re[i]) && test(t.re[i]) ? 1 : 0;
      return boolT(t.dims, re);
    }
    return boolT(dimsOfV(v), new Float64Array(count(v)));
  };
  return (args) => {
    if (args.length !== 1) throw E(`base:${name}:wrongNumberOfInputs`, `${name}: exactly one input argument is required.`);
    return apply(args[0]);
  };
}

// ------------------------------------------------------------- constants

const NA_BITS = (() => { const dv = new DataView(new ArrayBuffer(8)); dv.setUint32(0, 0x7FF840F4); dv.setUint32(4, 0x40000000); return dv.getFloat64(0); })();
const NA_DV = new DataView(new ArrayBuffer(8));
function isNAValue(x) {
  if (x === x) return false;
  NA_DV.setFloat64(0, x);
  return NA_DV.getUint32(0) === 0x7FF840F4 && NA_DV.getUint32(4) === 0x40000000;
}
function constArgs(args, name) {
  let cls = 'double';
  const a = args.slice();
  if (a.length && textArg(a[a.length - 1]) !== null) {
    const c = textArg(a.pop()).toLowerCase();
    if (c === 'like') throw E(`base:${name}:invalidClass`, `${name}: use ${name}(..., class) with 'double' or 'single'.`);
    if (c !== 'double' && c !== 'single') throw E(`base:${name}:invalidClass`, `${name}: CLASS must be 'double' or 'single'.`);
    cls = c;
  }
  return { cls, dims: sizeArgs(a, name) };
}
function eFn(args) {
  const { cls, dims } = constArgs(args, 'e');
  const re = new Float64Array(prod(dims)).fill(cls === 'single' ? Math.fround(Math.E) : Math.E);
  return tensor(cls, dims, re);
}
function NAFn(args) {
  const { cls, dims } = constArgs(args, 'NA');
  const re = new Float64Array(prod(dims)).fill(NA_BITS);
  return tensor(cls, dims, re);
}
function isnaFn(args) {
  if (args.length !== 1) throw E('base:isna:wrongNumberOfInputs', 'isna: exactly one input argument is required.');
  const v = args[0];
  if (!isTensor(v) && !isSparse(v)) return boolT(dimsOfV(v), new Float64Array(count(v)));
  const t = toTensor(v);
  const re = new Float64Array(t.re.length);
  if (t.cls === 'double' || t.cls === 'single') for (let i = 0; i < re.length; i++) re[i] = isNAValue(t.re[i]) || (t.im && isNAValue(t.im[i])) ? 1 : 0;
  return boolT(t.dims, re);
}

// ------------------------------------------------------------- sizes and types

function rowsFn(args) { if (args.length !== 1) throw E('base:rows:wrongNumberOfInputs', 'rows: exactly one input argument is required.'); return num(dimsOfV(args[0])[0]); }
function columnsFn(args) { if (args.length !== 1) throw E('base:columns:wrongNumberOfInputs', 'columns: exactly one input argument is required.'); return num(dimsOfV(args[0])[1]); }
function sameSize(a, b) {
  const x = normDims(dimsOfV(a).slice()), y = normDims(dimsOfV(b).slice());
  return x.length === y.length && x.every((d, i) => d === y[i]);
}
function sizeEqualFn(args) {
  for (let i = 1; i < args.length; i++) if (!sameSize(args[0], args[i])) return bool(false);
  return bool(true);
}
const ELEM_BYTES = { double: 8, single: 4, int8: 1, uint8: 1, int16: 2, uint16: 2, int32: 4, uint32: 4, int64: 8, uint64: 8, logical: 1, char: 1 };
function sizeOf(v) {
  if (v == null) return 0;
  if (isSparse(v)) return v.re.length * ((ELEM_BYTES[v.cls] || 8) * (v.im ? 2 : 1) + 8) + (v.dims[1] + 1) * 8;
  if (isTensor(v)) return v.re.length * (ELEM_BYTES[v.cls] || 8) * (v.im ? 2 : 1);
  if (isCell(v)) return v.data.reduce((s, x) => s + sizeOf(x), 0);
  if (isStruct(v)) return v.data.reduce((s, r) => s + v.fields.reduce((t, f) => t + sizeOf(r[f]), 0), 0);
  if (isString(v)) return v.data.reduce((s, x) => s + (x ? x.length : 0), 0);
  if (isObject(v)) {
    const p = v.props || {};
    return Object.values(p).reduce((s, x) => s + (x && typeof x === 'object' && x.cls ? sizeOf(x) : 0), 0);
  }
  return 0;
}
function sizeofFn(args) { if (args.length !== 1) throw E('base:sizeof:wrongNumberOfInputs', 'sizeof: exactly one input argument is required.'); return num(sizeOf(args[0])); }
function numfieldsFn(args) {
  if (args.length !== 1) throw E('base:numfields:wrongNumberOfInputs', 'numfields: exactly one input argument is required.');
  const v = args[0];
  if (isStruct(v)) return num(v.fields.length);
  return num(0);
}
function isindexFn(args) {
  if (args.length < 1 || args.length > 2) throw E('base:isindex:wrongNumberOfInputs', 'isindex: one or two input arguments are required.');
  const ind = args[0];
  const n = args.length > 1 ? scalarNum(args[1], 'isindex', 'N') : Infinity;
  if (isChar(ind) && ind.re.length === 1 && ind.re[0] === 58) return bool(true);
  if (!isTensor(ind) && !isSparse(ind)) return bool(false);
  if (isChar(ind)) return bool(false);
  const t = toTensor(ind);
  if (t.im) return bool(false);
  if (t.cls === 'logical') { for (let i = 0; i < t.re.length; i++) if (t.re[i] && i + 1 > n) return bool(false); return bool(true); }
  for (const x of t.re) if (!(x >= 1) || !Number.isInteger(x) || x > n) return bool(false);
  return bool(true);
}
function isuniformFn(args) {
  if (args.length !== 1) throw E('base:isuniform:wrongNumberOfInputs', 'isuniform: exactly one input argument is required.');
  const v = args[0];
  if (!(isTensor(v) || isSparse(v)) || isChar(v) || v.cls === 'logical') throw E('base:isuniform:invalidInput', 'isuniform: V must be a real numeric vector.');
  const t = toTensor(v);
  const d = t.dims;
  if (t.im || !(d.length === 2 && (d[0] === 1 || d[1] === 1 || t.re.length === 0))) throw E('base:isuniform:invalidInput', 'isuniform: V must be a real numeric vector.');
  const n = t.re.length;
  const out = (tf, delta) => [bool(tf), finalize(t.cls === 'single' ? 'single' : isIntCls(t.cls) ? t.cls : 'double', [1, 1], new Float64Array([delta]))];
  if (n === 0) return out(false, NaN);
  if (n === 1) return out(true, NaN);
  const x = t.re;
  for (const q of x) if (!Number.isFinite(q)) return out(false, NaN);
  const delta = (x[n - 1] - x[0]) / (n - 1);
  if (isIntCls(t.cls)) {
    for (let i = 1; i < n; i++) if (x[i] - x[i - 1] !== x[1] - x[0]) return out(false, NaN);
    return out(true, x[1] - x[0]);
  }
  const big = Math.max(Math.abs(x[0]), Math.abs(x[n - 1]));
  const ulp = big === 0 ? Number.MIN_VALUE : 2 ** (Math.floor(Math.log2(big)) - (t.cls === 'single' ? 23 : 52));
  const tol = 4 * ulp;
  for (let i = 1; i < n; i++) if (Math.abs(x[i] - x[i - 1] - delta) > tol) return out(false, NaN);
  return out(true, delta);
}
function isdefiniteFn(args) {
  if (args.length < 1 || args.length > 2) throw E('base:isdefinite:wrongNumberOfInputs', 'isdefinite: one or two input arguments are required.');
  const A0 = args[0];
  if (!(isTensor(A0) || isSparse(A0)) || isChar(A0)) throw E('base:isdefinite:invalidInput', 'isdefinite: A must be a numeric matrix.');
  const A = toTensor(A0);
  if (A.dims.length !== 2 || A.dims[0] !== A.dims[1]) return bool(false);
  const n = A.dims[0];
  if (n === 0) return bool(false);
  const re = A.re, im = A.im;
  let fro = 0; for (let i = 0; i < re.length; i++) fro += re[i] * re[i] + (im ? im[i] * im[i] : 0);
  fro = Math.sqrt(fro);
  const eps = A.cls === 'single' ? 2 ** -23 : 2 ** -52;
  const tol = args.length > 1 ? scalarNum(args[1], 'isdefinite', 'TOL') : 100 * eps * fro;
  // Hermitian check: norm(A - A', inf) / norm(A, inf) <= tol
  let dn = 0, an = 0;
  for (let i = 0; i < n; i++) {
    let rd = 0, ra = 0;
    for (let j = 0; j < n; j++) {
      const ar = re[i + j * n], ai = im ? im[i + j * n] : 0;
      const br = re[j + i * n], bi = im ? -im[j + i * n] : 0;
      rd += Math.hypot(ar - br, ai - bi); ra += Math.hypot(ar, ai);
    }
    dn = Math.max(dn, rd); an = Math.max(an, ra);
  }
  if (tol === 0 ? dn !== 0 : dn / (an || 1) > tol) return bool(false);
  // Cholesky of A - tol*I (Hermitian part)
  const Lr = new Float64Array(n * n), Li = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    let d = re[j + j * n] - tol;
    for (let k = 0; k < j; k++) d -= Lr[j + k * n] ** 2 + Li[j + k * n] ** 2;
    if (!(d > 0)) return bool(false);
    const ljj = Math.sqrt(d);
    Lr[j + j * n] = ljj;
    for (let i = j + 1; i < n; i++) {
      let sr = (re[i + j * n] + re[j + i * n]) / 2, si = im ? (im[i + j * n] - im[j + i * n]) / 2 : 0;
      for (let k = 0; k < j; k++) {
        // L(i,k) * conj(L(j,k))
        const ar = Lr[i + k * n], ai = Li[i + k * n], br = Lr[j + k * n], bi = -Li[j + k * n];
        sr -= ar * br - ai * bi; si -= ar * bi + ai * br;
      }
      Lr[i + j * n] = sr / ljj; Li[i + j * n] = si / ljj;
    }
  }
  return bool(true);
}

// ------------------------------------------------------------- strings

function findSub(hay, needle, fromEnd) {
  if (!needle.length) return 0;
  const i = fromEnd ? hay.lastIndexOf(needle) : hay.indexOf(needle);
  return i < 0 ? 0 : i + 1;
}
function indexFn(name, defaultLast) {
  return (args) => {
    if (args.length < 2 || args.length > 3) throw E(`base:${name}:wrongNumberOfInputs`, `${name}: two or three input arguments are required.`);
    let last = defaultLast;
    if (args.length === 3) {
      const d = S(args[2], 'DIRECTION').toLowerCase();
      if (d === 'first') last = false; else if (d === 'last') last = true;
      else throw E(`base:${name}:invalidDirection`, `${name}: DIRECTION must be either "first" or "last".`);
    }
    const t = S(args[1], 'T');
    const s = args[0];
    if (isCell(s) || (isString(s) && s.data.length !== 1)) {
      const { list, dims } = textList(s, 'S');
      return tensor('double', dims, Float64Array.from(list.map((x) => findSub(x || '', t, last))));
    }
    return num(findSub(S(s, 'S'), t, last));
  };
}
function findstrFn(args) {
  if (args.length < 2 || args.length > 3) throw E('base:findstr:wrongNumberOfInputs', 'findstr: two or three input arguments are required.');
  let a = isString(args[0]) ? args[0].data[0] || '' : toStr(args[0]);
  let b = isString(args[1]) ? args[1].data[0] || '' : toStr(args[1]);
  const overlap = args.length < 3 || scalarNum(args[2], 'findstr', 'OVERLAP') !== 0;
  if (b.length > a.length) [a, b] = [b, a];
  const out = [];
  if (b.length) {
    let i = a.indexOf(b);
    while (i >= 0) { out.push(i + 1); i = a.indexOf(b, overlap ? i + 1 : i + b.length); }
  }
  if (!out.length) return tensor('double', [0, 0]);
  return tensor('double', [1, out.length], Float64Array.from(out));
}
function substrFn(args) {
  if (args.length < 2 || args.length > 3) throw E('base:substr:wrongNumberOfInputs', 'substr: two or three input arguments are required.');
  const s = S(args[0], 'S');
  const off = scalarNum(args[1], 'substr', 'OFFSET');
  const n = s.length;
  if (!Number.isInteger(off) || off < 1 || off > n + 1) throw E('base:substr:invalidOffset', 'substr: OFFSET must be an integer in the range 1 to length(S)+1.');
  let len = args.length > 2 ? scalarNum(args[2], 'substr', 'LEN') : n - off + 1;
  if (len < 0) len = n - off + 1 + len;
  if (!Number.isInteger(len) || len < 0 || off + len - 1 > n) throw E('base:substr:invalidLength', 'substr: LEN must be an integer and the substring must lie within S.');
  return charOrEmpty(s.substr(off - 1, len));
}
function strtruncFn(args) {
  if (args.length !== 2) throw E('base:strtrunc:wrongNumberOfInputs', 'strtrunc: exactly two input arguments are required.');
  const n = scalarNum(args[1], 'strtrunc', 'N');
  if (!(n >= 0) || !Number.isInteger(n)) throw E('base:strtrunc:invalidN', 'strtrunc: length N must be a positive integer (N >= 0).');
  const truncChar = (c) => {
    if (c.dims.length !== 2) throw E('base:strtrunc:invalidInput', 'strtrunc: S must be a character string or a cell array of strings.');
    const [m, w] = c.dims;
    if (w <= n) return c;
    const idx = []; for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) idx.push(i + j * m);
    return gather(c, idx, [m, n]);
  };
  const s = args[0];
  if (isChar(s)) return truncChar(s);
  if (isString(s)) return stringArray(s.dims, s.data.map((x) => (x == null ? x : x.slice(0, n))));
  if (isCell(s)) return cell(s.dims, s.data.map((x) => { if (!isChar(x)) throw E('base:strtrunc:invalidInput', 'strtrunc: S must be a character string or a cell array of strings.'); return truncChar(x); }));
  throw E('base:strtrunc:invalidInput', 'strtrunc: S must be a character string or a cell array of strings.');
}
function charRows(v) {
  if (!isChar(v)) return null;
  const [m, n] = v.dims; const rows = [];
  for (let i = 0; i < m; i++) { let s = ''; for (let j = 0; j < n; j++) s += String.fromCharCode(v.re[i + j * m]); rows.push(s); }
  return rows;
}
function ostrsplitFn(args) {
  if (args.length < 2 || args.length > 3) throw E('base:ostrsplit:wrongNumberOfInputs', 'ostrsplit: two or three input arguments are required.');
  const s0 = args[0];
  if (!isChar(s0) && !(isString(s0) && s0.data.length === 1)) throw E('base:ostrsplit:invalidInput', 'ostrsplit: S and SEP must be string values.');
  const sep = S(args[1], 'SEP');
  const strip = args.length > 2 && scalarNum(args[2], 'ostrsplit', 'STRIP_EMPTY') !== 0;
  let s = isString(s0) ? s0.data[0] || '' : (s0.dims[0] > 1 ? charRows(s0).join(sep.charAt(0)) : toStr(s0));
  const parts = [];
  let cur = '';
  for (const ch of s) { if (sep.includes(ch)) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  const list = strip ? parts.filter((p) => p.length) : parts;
  return cell([1, list.length], list.map((p) => charOrEmpty(p)));
}
function cstrcatFn(args, nargout, ctx) {
  if (!args.length) return charOrEmpty('');
  for (const a of args) if (!isChar(a)) throw E('base:cstrcat:invalidInput', 'cstrcat: arguments must be character strings.');
  return call1(ctx, 'horzcat', args);
}
const ESC_OUT = { 7: '\\a', 8: '\\b', 12: '\\f', 10: '\\n', 13: '\\r', 9: '\\t', 11: '\\v', 92: '\\\\', 34: '\\"', 0: '\\0' };
function doEscapes(s, warn) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\' || i === s.length - 1) { out += c; continue; }
    const d = s[++i];
    switch (d) {
      case 'a': out += '\x07'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'v': out += '\v'; break;
      case '\\': out += '\\'; break;
      case '"': out += '"'; break;
      case '\'': out += '\''; break;
      case 'x': {
        let h = ''; while (h.length < 2 && i + 1 < s.length && /[0-9a-fA-F]/.test(s[i + 1])) h += s[++i];
        if (!h.length) { warn('malformed hex escape sequence \'\\x\' -- converting to \'\\0\''); out += '\0'; } else out += String.fromCharCode(parseInt(h, 16));
        break;
      }
      default:
        if (/[0-7]/.test(d)) {
          let o = d; while (o.length < 3 && i + 1 < s.length && /[0-7]/.test(s[i + 1])) o += s[++i];
          out += String.fromCharCode(parseInt(o, 8));
        } else { warn(`unrecognized escape sequence '\\${d}' -- converting to '${d}'`); out += d; }
    }
  }
  return out;
}
function doStringEscapesFn(args, nargout, ctx) {
  if (args.length !== 1) throw E('base:do_string_escapes:wrongNumberOfInputs', 'do_string_escapes: exactly one input argument is required.');
  if (!isChar(args[0]) && !isString(args[0])) throw E('base:do_string_escapes:invalidInput', 'do_string_escapes: STRING argument must be of type char.');
  const r = doEscapes(S(args[0], 'STRING'), (m) => ctx.warning && ctx.warning('base:do_string_escapes:escape', m));
  return isString(args[0]) ? stringArray([1, 1], [r]) : charOrEmpty(r);
}
function undoStringEscapesFn(args) {
  if (args.length !== 1) throw E('base:undo_string_escapes:wrongNumberOfInputs', 'undo_string_escapes: exactly one input argument is required.');
  if (!isChar(args[0]) && !isString(args[0])) throw E('base:undo_string_escapes:invalidInput', 'undo_string_escapes: STRING argument must be a string.');
  const s = S(args[0], 'STRING');
  let out = '';
  for (const ch of s) out += ESC_OUT[ch.charCodeAt(0)] ?? ch;
  return isString(args[0]) ? stringArray([1, 1], [out]) : charOrEmpty(out);
}
function untabifyFn(args) {
  if (args.length < 1 || args.length > 3) throw E('base:untabify:wrongNumberOfInputs', 'untabify: one to three input arguments are required.');
  const tw = args.length > 1 ? scalarNum(args[1], 'untabify', 'TW') : 8;
  const deb = args.length > 2 && scalarNum(args[2], 'untabify', 'DEBLANK') !== 0;
  const fix = (line) => {
    let out = '';
    for (const ch of line) {
      if (ch === '\t') { const n = tw - (out.length % tw); out += ' '.repeat(n); } else out += ch;
    }
    return deb ? out.replace(/[\s\0]+$/, '') : out;
  };
  const t = args[0];
  if (isChar(t)) {
    const rows = charRows(t).map(fix);
    if (rows.length === 1) return charOrEmpty(rows[0]);
    return charMatrix(rows);
  }
  if (isCell(t)) return cell(t.dims, t.data.map((x) => {
    if (!isChar(x)) throw E('base:untabify:invalidInput', 'untabify: T must be a string or cellstring.');
    const rows = charRows(x).map(fix); return rows.length === 1 ? charOrEmpty(rows[0]) : charMatrix(rows);
  }));
  if (isString(t)) return stringArray(t.dims, t.data.map((x) => (x == null ? x : fix(x))));
  throw E('base:untabify:invalidInput', 'untabify: T must be a string or cellstring.');
}
function strchrFn(args, nargout, ctx) {
  if (args.length < 2 || args.length > 4) throw E('base:strchr:wrongNumberOfInputs', 'strchr: two to four input arguments are required.');
  const s = args[0];
  if (!isChar(s)) throw E('base:strchr:invalidInput', 'strchr: STR argument must be a string or string array.');
  const chars = S(args[1], 'CHARS');
  const set = new Set(Array.from(chars, (c) => c.charCodeAt(0)));
  const re = new Float64Array(s.re.length);
  for (let i = 0; i < re.length; i++) re[i] = set.has(s.re[i]) ? 1 : 0;
  return ctx.call('find', [boolT(s.dims, re), ...args.slice(2)], Math.max(1, nargout));
}
function strmatchFn(args) {
  if (args.length < 2 || args.length > 3) throw E('base:strmatch:wrongNumberOfInputs', 'strmatch: two or three input arguments are required.');
  const s = S(args[0], 'S');
  let exact = false;
  if (args.length === 3) {
    if ((textArg(args[2]) || '').toLowerCase() !== 'exact') throw E('base:strmatch:invalidOption', 'strmatch: third argument must be "exact".');
    exact = true;
  }
  const A = args[1];
  let list;
  if (isChar(A)) list = A.dims[0] === 0 && A.dims[1] === 0 ? [] : charRows(A);
  else if (isCell(A) || isString(A)) list = textList(A, 'A').list.map((x) => x || '');
  else throw E('base:strmatch:invalidInput', 'strmatch: A must be a string or cell array of strings.');
  const trimEnd = (x) => x.replace(/[ \0]+$/, '');
  const ss = exact ? trimEnd(s) : s;
  const hits = [];
  list.forEach((a, i) => {
    if (exact ? trimEnd(a) === ss : a.startsWith(ss)) hits.push(i + 1);
  });
  return tensor('double', [hits.length, hits.length ? 1 : 0], Float64Array.from(hits));
}
function unicodeIdxFn(args) {
  if (args.length !== 1) throw E('base:unicode_idx:wrongNumberOfInputs', 'unicode_idx: exactly one input argument is required.');
  const s = args[0];
  const one = (txt) => {
    const out = []; let k = 0;
    for (let i = 0; i < txt.length; i++) {
      const c = txt.charCodeAt(i);
      if (c >= 0xDC00 && c <= 0xDFFF && i > 0 && txt.charCodeAt(i - 1) >= 0xD800 && txt.charCodeAt(i - 1) <= 0xDBFF) out.push(k);
      else out.push(++k);
    }
    return tensor('double', [1, out.length], Float64Array.from(out));
  };
  if (isCell(s)) return cell(s.dims, s.data.map((x) => one(S(x, 'STR'))));
  return one(S(s, 'STR'));
}

// ------------------------------------------------------------- strread

function strreadFn(args, nargout) {
  if (!args.length) throw E('base:strread:wrongNumberOfInputs', 'strread: not enough input arguments.');
  const text = S(args[0], 'STR');
  let k = 1;
  let format = '%f';
  if (k < args.length && textArg(args[k]) !== null && /%/.test(textArg(args[k]))) format = textArg(args[k++]);
  else if (k < args.length && textArg(args[k]) !== null && !isOption(textArg(args[k]))) format = textArg(args[k++]);
  let nRepeat = -1;
  if (k < args.length && isTensor(args[k]) && !isChar(args[k])) nRepeat = args[k++].re[0];
  let delim = null, white = ' \b\t', commentStyle = null, emptyValue = NaN, multipleDelims = false;
  for (; k + 1 < args.length; k += 2) {
    const name = S(args[k], 'option name').toLowerCase();
    const v = args[k + 1];
    if (name === 'delimiter') delim = doEscapes(S(v), () => {});
    else if (name === 'whitespace') white = doEscapes(S(v), () => {});
    else if (name === 'emptyvalue') emptyValue = scalarNum(v, 'strread', 'EmptyValue');
    else if (name === 'multipledelimsasone') multipleDelims = scalarNum(v, 'strread') !== 0;
    else if (name === 'commentstyle') {
      const c = textArg(v);
      const styles = { shell: ['#', '\n'], c: ['/*', '*/'], 'c++': ['//', '\n'] };
      commentStyle = c !== null ? (styles[c.toLowerCase()] || [c, '\n']) : textList(v).list;
    } else if (name === 'returnonerror' || name === 'bufsize' || name === 'endofline') { /* accepted */ } else throw E('base:strread:unknownOption', `strread: unknown option "${name}".`);
  }
  let src = text;
  if (commentStyle) {
    const [open, close] = commentStyle;
    let out = ''; let i = 0;
    while (i < src.length) {
      const j = src.indexOf(open, i);
      if (j < 0) { out += src.slice(i); break; }
      out += src.slice(i, j);
      const e2 = src.indexOf(close || '\n', j + open.length);
      if (e2 < 0) break;
      i = close === '\n' ? e2 : e2 + close.length;
    }
    src = out;
  }
  // words
  const isDelim = (c) => (delim !== null ? delim.includes(c) || c === '\n' || c === '\r' : false);
  const isWhite = (c) => white.includes(c) || (delim === null && (c === '\n' || c === '\r' || c === ' '));
  const words = [];
  {
    let cur = null;
    for (const c of src) {
      if (isDelim(c)) { if (cur !== null || !multipleDelims) words.push(cur === null ? '' : cur); cur = null; if (delim !== null && c !== '\n' && c !== '\r') cur = ''; else cur = null; continue; }
      if (isWhite(c)) { if (cur !== null && cur !== '' && delim === null) { words.push(cur); cur = null; } continue; }
      cur = (cur || '') + c;
    }
    if (cur !== null && (cur !== '' || delim !== null)) words.push(cur);
  }
  // remove trailing empty word produced by a final delimiter at end of text
  // format items
  const items = [];
  const re = /%(\*?)(\d*)(?:\.(\d+))?(\[[^\]]*\]|[a-zA-Z])|([^%\s]+)/g;
  let m;
  while ((m = re.exec(format))) {
    if (m[5] !== undefined) items.push({ literal: m[5] });
    else items.push({ skip: m[1] === '*', width: m[2] ? +m[2] : null, conv: m[4].toLowerCase().startsWith('[') ? 's' : m[4] });
  }
  if (!items.length) throw E('base:strread:badFormat', 'strread: no valid format conversion specifiers.');
  const outItems = items.filter((x) => !x.literal && !x.skip);
  const cols = outItems.map(() => []);
  let wi = 0, reps = 0;
  outer: while (wi < words.length && (nRepeat < 0 || reps < nRepeat)) {
    let oi = 0;
    for (const it of items) {
      if (wi >= words.length) break outer;
      let w = words[wi];
      if (it.literal) {
        if (w === it.literal) { wi++; continue; }
        if (w.startsWith(it.literal)) { words[wi] = w.slice(it.literal.length); continue; }
        throw E('base:strread:literalMismatch', `strread: text "${w}" does not match the format literal "${it.literal}".`);
      }
      let take = w;
      if (it.width && w.length > it.width) { take = w.slice(0, it.width); words[wi] = w.slice(it.width); } else wi++;
      if (it.skip) continue;
      const col = cols[oi++];
      if (it.conv === 's' || it.conv === 'q' || it.conv === 'c') {
        let v = take;
        if (it.conv === 'q' && /^".*"$/.test(v)) v = v.slice(1, -1);
        col.push(v);
      } else {
        let x = take === '' ? emptyValue : Number(take.replace(/^\+/, ''));
        if (take !== '' && Number.isNaN(x)) {
          const lw = take.toLowerCase();
          x = lw === 'nan' ? NaN : lw === 'inf' || lw === '+inf' ? Infinity : lw === '-inf' ? -Infinity : parseFloat(take);
          if (Number.isNaN(x) && lw !== 'nan') throw E('base:strread:badNumber', `strread: unable to parse "${take}" as a number.`);
        }
        if (it.conv === 'd' || it.conv === 'u') x = Number.isFinite(x) ? Math.trunc(x) : x;
        col.push(x);
      }
    }
    reps++;
  }
  const outs = outItems.map((it, i) => {
    const c = cols[i];
    if (it.conv === 's' || it.conv === 'q' || it.conv === 'c') return cell([c.length, 1], c.map((s) => charOrEmpty(s)));
    if (it.conv === 'd') return finalize('int32', [c.length, 1], Float64Array.from(c));
    if (it.conv === 'u') return finalize('uint32', [c.length, 1], Float64Array.from(c));
    return tensor('double', [c.length, 1], Float64Array.from(c));
  });
  return nargout <= 1 ? outs[0] : outs.slice(0, Math.max(1, nargout));
}
function isOption(s) { return ['delimiter', 'whitespace', 'emptyvalue', 'commentstyle', 'multipledelimsasone', 'returnonerror', 'bufsize', 'endofline'].includes(s.toLowerCase()); }

// ------------------------------------------------------------- cells and display

function celldispFn(args, nargout, ctx) {
  if (args.length < 1 || args.length > 2) throw E('base:celldisp:wrongNumberOfInputs', 'celldisp: one or two input arguments are required.');
  const c = args[0];
  if (!isCell(c)) throw E('base:celldisp:invalidInput', 'celldisp: argument must be a cell array.');
  const callNames = ctx.interp && ctx.interp.pendingArgNames;
  const name = args.length > 1 ? S(args[1], 'NAME') : (callNames && callNames[0]) || 'c';
  const show = (c, name) => {
    const d = c.dims;
    const isVec = d.length === 2 && (d[0] === 1 || d[1] === 1);
    for (let i = 0; i < c.data.length; i++) {
      let nm;
      if (isVec) nm = `${name}{${i + 1}}`;
      else {
        const subs = []; let r = i;
        for (const n of d) { subs.push((r % n) + 1); r = Math.floor(r / n); }
        nm = `${name}{${subs.join(',')}}`;
      }
      const v = c.data[i];
      if (isCell(v)) show(v, nm);
      else if (count(v) === 0 && !isObject(v)) ctx.out(`${nm} = [](${dimsOfV(v).join('x')})\n`);
      else { ctx.out(`${nm} =\n\n`); ctx.call('disp', [v], 0); ctx.out('\n'); }
    }
  };
  show(c, name);
  return undefined;
}
function cellindexmatFn(args) {
  if (args.length < 1) throw E('base:cellindexmat:wrongNumberOfInputs', 'cellindexmat: not enough input arguments.');
  const x = args[0];
  if (!isCell(x)) throw E('base:cellindexmat:invalidInput', 'cellindexmat: X must be a cell array.');
  const subs = args.slice(1);
  return cell(x.dims, x.data.map((v) => {
    const r = resolveIndex(dimsOfV(v), subs);
    return gather(v, r.idx, r.dims);
  }));
}
function sliceIndex(dims, dim, lo, hi) {
  const d = dims.slice(); while (d.length <= dim) d.push(1);
  const { before, len, after } = splitDims(d, dim);
  const idx = [];
  for (let a = 0; a < after; a++) for (let k = lo; k <= hi; k++) for (let b = 0; b < before; b++) idx.push(b + k * before + a * before * len);
  return { idx, dims: dimsWith(d, dim, Math.max(0, hi - lo + 1)) };
}
function cellslicesFn(args) {
  if (args.length < 3 || args.length > 4) throw E('base:cellslices:wrongNumberOfInputs', 'cellslices: three or four input arguments are required.');
  const x = args[0];
  const lb = Array.from(toTensor(args[1]).re), ub = Array.from(toTensor(args[2]).re);
  if (lb.length !== ub.length) throw E('base:cellslices:sizeMismatch', 'cellslices: the lengths of LB and UB must match.');
  const dims = dimsOfV(x);
  let dim;
  if (args.length > 3) dim = scalarNum(args[3], 'cellslices', 'DIM') - 1;
  else dim = firstNonSingleton(dims);
  const n = dim < dims.length ? dims[dim] : 1;
  const out = lb.map((l, i) => {
    const u = ub[i];
    if (u >= l && (l < 1 || u > n)) throw E('base:cellslices:outOfBound', 'cellslices: index out of bounds.');
    const { idx, dims: od } = sliceIndex(dims, dim, l - 1, u - 1);
    return gather(x, idx, od);
  });
  return cell([1, out.length], out);
}

// ------------------------------------------------------------- arrays

function expandTo(v, dims) {
  if (count(v) !== 1) return v;
  return gather(v, new Int32Array(prod(dims)), dims);
}
function commonSizeFn(args, nargout) {
  if (args.length < 2) throw E('base:common_size:wrongNumberOfInputs', 'common_size: only makes sense if nargin >= 2.');
  const nonScalar = args.filter((a) => count(a) !== 1);
  let err = 0, dims = [1, 1];
  if (nonScalar.length) {
    dims = dimsOfV(nonScalar[0]);
    if (nonScalar.some((a) => !sameSize(a, nonScalar[0]))) err = 1;
  }
  const outs = err ? args.slice() : args.map((a) => expandTo(a, dims));
  return [num(err), ...outs].slice(0, Math.max(1, nargout));
}
function padFn(name, atEnd) {
  return (args) => {
    if (args.length < 2 || args.length > 4) throw E(`base:${name}:wrongNumberOfInputs`, `${name}: two to four input arguments are required.`);
    const x = args[0];
    if (!(isTensor(x) || isSparse(x))) throw E(`base:${name}:invalidInput`, `${name}: X must be a numeric, logical or char array.`);
    const t = toTensor(x);
    const l = scalarNum(args[1], name, 'L');
    if (!(l >= 0) || !Number.isInteger(l)) throw E(`base:${name}:invalidLength`, `${name}: L must be a non-negative integer.`);
    let cr = 0, ci = 0;
    if (args.length > 2 && count(args[2]) > 0) {
      const c = toTensor(args[2]);
      if (c.re.length !== 1) throw E(`base:${name}:invalidPad`, `${name}: C must be empty or a scalar.`);
      cr = c.re[0]; ci = c.im ? c.im[0] : 0;
    }
    const dims = t.dims.slice();
    const dim = args.length > 3 ? scalarNum(args[3], name, 'DIM') - 1 : firstNonSingleton(dims);
    while (dims.length <= dim) dims.push(1);
    const { before, len, after } = splitDims(dims, dim);
    const od = dimsWith(dims, dim, l);
    const n = prod(od);
    const re = new Float64Array(n), im = t.im || ci ? new Float64Array(n) : null;
    const shift = atEnd ? 0 : l - len; // output k ← input k - shift
    for (let a = 0; a < after; a++) for (let k = 0; k < l; k++) for (let b = 0; b < before; b++) {
      const o = b + k * before + a * before * l;
      const src = k - shift;
      if (src >= 0 && src < len) { const p = b + src * before + a * before * len; re[o] = t.re[p]; if (im && t.im) im[o] = t.im[p]; } else { re[o] = cr; if (im) im[o] = ci; }
    }
    let cls = t.cls;
    if (args.length > 2 && count(args[2]) > 0 && !isChar(args[2]) && cls === 'char') cls = 'double';
    if (cls === 'logical' && !(cr === 0 || cr === 1)) cls = 'double';
    return finalize(cls, od, re, im);
  };
}
function vecFn(args) {
  if (args.length < 1 || args.length > 2) throw E('base:vec:wrongNumberOfInputs', 'vec: one or two input arguments are required.');
  const x = args[0];
  const n = count(x);
  const dim = args.length > 1 ? scalarNum(args[1], 'vec', 'DIM') : 1;
  if (!(dim >= 1) || !Number.isInteger(dim)) throw E('base:vec:invalidDim', 'vec: DIM must be greater than zero.');
  const dims = new Array(Math.max(2, dim)).fill(1); dims[dim - 1] = n;
  const idx = new Int32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
  return gather(isSparse(x) ? toTensor(x) : x, idx, dims);
}
function vechFn(args) {
  if (args.length !== 1) throw E('base:vech:wrongNumberOfInputs', 'vech: exactly one input argument is required.');
  const x = args[0];
  const d = dimsOfV(x);
  if (d.length !== 2 || d[0] !== d[1]) throw E('base:vech:notSquare', 'vech: X must be square.');
  const n = d[0]; const idx = [];
  for (let j = 0; j < n; j++) for (let i = j; i < n; i++) idx.push(i + j * n);
  return gather(isSparse(x) ? toTensor(x) : x, Int32Array.from(idx), [idx.length, 1]);
}
function flipAlong(v, dim) {
  const d = dimsOfV(v).slice(); while (d.length <= dim) d.push(1);
  const { before, len, after } = splitDims(d, dim);
  const idx = new Int32Array(prod(d)); let q = 0;
  for (let a = 0; a < after; a++) for (let k = 0; k < len; k++) for (let b = 0; b < before; b++) idx[q++] = b + (len - 1 - k) * before + a * before * len;
  // idx is in output order: element (b,k,a) of output ← input (b,len-1-k,a)
  return gather(v, idx, d);
}
function rotdimFn(args) {
  if (args.length < 1 || args.length > 3) throw E('base:rotdim:wrongNumberOfInputs', 'rotdim: one to three input arguments are required.');
  let x = args[0];
  if (isSparse(x)) x = toTensor(x);
  const n0 = args.length > 1 && count(args[1]) ? scalarNum(args[1], 'rotdim', 'N') : 1;
  if (!Number.isInteger(n0)) throw E('base:rotdim:invalidN', 'rotdim: N must be a scalar integer.');
  const d = dimsOfV(x).slice();
  let plane;
  if (args.length > 2) {
    plane = Array.from(toTensor(args[2]).re).map((p) => p - 1);
    if (plane.length !== 2 || plane[0] === plane[1] || plane.some((p) => !(p >= 0) || !Number.isInteger(p))) throw E('base:rotdim:invalidPlane', 'rotdim: PLANE must be a 2 element integer vector defining a valid PLANE.');
  } else {
    plane = [];
    for (let i = 0; i < d.length && plane.length < 2; i++) if (d[i] !== 1) plane.push(i);
    if (plane.length < 2) plane = plane.length === 1 ? (plane[0] === 0 ? [0, 1] : [0, plane[0]]) : [0, 1];
  }
  const nd = Math.max(d.length, plane[0] + 1, plane[1] + 1);
  while (d.length < nd) d.push(1);
  const n = ((n0 % 4) + 4) % 4;
  if (n === 0) return x;
  const [p, q] = plane;
  if (n === 2) return flipAlong(flipAlong(x, p), q);
  const perm = Array.from({ length: nd }, (_, i) => i); perm[p] = q; perm[q] = p;
  const y = permuteAny({ ...x, dims: d }, perm);
  return flipAlong(y, n === 1 ? p : q);
}
function repelemsFn(args) {
  if (args.length !== 2) throw E('base:repelems:wrongNumberOfInputs', 'repelems: exactly two input arguments are required.');
  const x = args[0];
  const r = toTensor(args[1]);
  if (r.dims.length !== 2 || r.dims[0] !== 2) throw E('base:repelems:invalidR', 'repelems: R must be a matrix with two rows.');
  const n = count(x);
  const idx = [];
  for (let j = 0; j < r.dims[1]; j++) {
    const k = r.re[2 * j], c = r.re[2 * j + 1];
    if (!Number.isInteger(k) || k < 1 || k > n) throw E('base:repelems:outOfBound', 'repelems: index out of range.');
    if (!Number.isInteger(c) || c < 0) throw E('base:repelems:invalidCount', 'repelems: second row must contain non-negative integers.');
    for (let q = 0; q < c; q++) idx.push(k - 1);
  }
  return gather(isSparse(x) ? toTensor(x) : x, Int32Array.from(idx), [1, idx.length]);
}
function nthElementFn(args) {
  if (args.length < 2 || args.length > 3) throw E('base:nth_element:wrongNumberOfInputs', 'nth_element: two or three input arguments are required.');
  const x0 = args[0];
  if (!(isTensor(x0) || isSparse(x0))) throw E('base:nth_element:invalidInput', 'nth_element: X must be a numeric array.');
  const x = toTensor(x0);
  const ns = Array.from(toTensor(args[1]).re);
  const dims = x.dims.slice();
  const dim = args.length > 2 ? scalarNum(args[2], 'nth_element', 'DIM') - 1 : firstNonSingleton(dims);
  while (dims.length <= dim) dims.push(1);
  const { before, len, after } = splitDims(dims, dim);
  for (const k of ns) if (!Number.isInteger(k) || k < 1 || k > len) throw E('base:nth_element:outOfBound', `nth_element: n must be valid index (1 to ${len}).`);
  const m = ns.length;
  const od = dimsWith(dims, dim, m);
  const re = new Float64Array(prod(od)), im = x.im ? new Float64Array(re.length) : null;
  const key = (i) => (x.im ? Math.hypot(x.re[i], x.im[i]) : x.re[i]);
  for (let a = 0; a < after; a++) for (let b = 0; b < before; b++) {
    const pos = [];
    for (let k = 0; k < len; k++) pos.push(b + k * before + a * before * len);
    pos.sort((i, j) => { const u = key(i), v = key(j); if (u !== u) return v !== v ? 0 : 1; if (v !== v) return -1; return u - v || (x.im ? Math.atan2(x.im[i], x.re[i]) - Math.atan2(x.im[j], x.re[j]) : 0); });
    ns.forEach((k, q) => { const o = b + q * before + a * before * m; re[o] = x.re[pos[k - 1]]; if (im) im[o] = x.im[pos[k - 1]]; });
  }
  return finalize(x.cls, od, re, im);
}
function mergeFn(args) {
  if (args.length !== 3) throw E('base:merge:wrongNumberOfInputs', 'merge: exactly three input arguments are required.');
  const [mask0, tv, fv] = args;
  if (!(isTensor(mask0) || isSparse(mask0)) || isChar(mask0)) throw E('base:merge:invalidMask', 'merge: MASK must be logical.');
  const mask = toTensor(mask0);
  if (mask.cls !== 'logical' && !(isTensor(mask) && mask.re.every((x) => x === 0 || x === 1))) throw E('base:merge:invalidMask', 'merge: MASK must be logical.');
  if (mask.re.length === 1) return mask.re[0] ? tv : fv;
  const n = mask.re.length;
  const okSize = (v) => count(v) === 1 || sameSize(v, mask);
  if (!okSize(tv) || !okSize(fv)) throw E('base:merge:sizeMismatch', 'merge: MASK, TVAL, and FVAL must be the same size (or scalars).');
  if (isCell(tv) || isCell(fv)) {
    if (!isCell(tv) || !isCell(fv)) throw E('base:merge:classMismatch', 'merge: TVAL and FVAL must both be cell arrays.');
    const data = new Array(n);
    for (let i = 0; i < n; i++) data[i] = mask.re[i] ? tv.data[tv.data.length === 1 ? 0 : i] : fv.data[fv.data.length === 1 ? 0 : i];
    return cell(mask.dims, data);
  }
  if (!(isTensor(tv) || isSparse(tv)) || !(isTensor(fv) || isSparse(fv))) throw E('base:merge:invalidInput', 'merge: TVAL and FVAL must be arrays of matching class, or cell arrays.');
  const t = toTensor(tv), f = toTensor(fv);
  const re = new Float64Array(n), im = t.im || f.im ? new Float64Array(n) : null;
  for (let i = 0; i < n; i++) {
    const src = mask.re[i] ? t : f; const j = src.re.length === 1 ? 0 : i;
    re[i] = src.re[j]; if (im && src.im) im[i] = src.im[j];
  }
  return finalize(t.cls === f.cls ? t.cls : catClass([t, f]), mask.dims, re, im);
}

// ------------------------------------------------------------- lookup

function lookupFn(args) {
  if (args.length < 2 || args.length > 3) throw E('base:lookup:wrongNumberOfInputs', 'lookup: two or three input arguments are required.');
  const opt = args.length > 2 ? S(args[2], 'OPT') : '';
  const optM = opt.includes('m'), optB = opt.includes('b'), optL = opt.includes('l'), optR = opt.includes('r');
  if (/[^mblr]/.test(opt)) throw E('base:lookup:invalidOption', `lookup: unrecognized option: ${opt}`);
  const tbl = args[0], y = args[1];
  const textTable = isCell(tbl) || isString(tbl);
  let T, Y, ydims, cmp;
  if (textTable) {
    T = textList(tbl, 'TABLE').list.map((s) => s || '');
    if (isCell(y) || isString(y)) { const r = textList(y, 'Y'); Y = r.list.map((s) => s || ''); ydims = r.dims; } else { Y = [S(y, 'Y')]; ydims = [1, 1]; }
    cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  } else {
    T = Array.from(toTensor(tbl).re); const yt = toTensor(y); Y = Array.from(yt.re); ydims = yt.dims;
    cmp = (a, b) => (a < b ? -1 : a > b ? 1 : a === b ? 0 : (a !== a ? (b !== b ? 0 : 1) : -1));
  }
  const n = T.length;
  const desc = n > 1 && cmp(T[0], T[n - 1]) > 0;
  const c = desc ? (a, b) => cmp(b, a) : cmp;
  const out = new Float64Array(Y.length);
  for (let q = 0; q < Y.length; q++) {
    const v = Y[q];
    // largest i (1-based) with T(i) <= v, 0 if none
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (c(T[mid], v) <= 0) lo = mid + 1; else hi = mid; }
    let idx = lo;
    if (optL && idx < 1 && n) idx = 1;
    if (optR && idx > n - 1) idx = Math.max(n - 1, optL ? 1 : 0);
    if (optM || optB) {
      const hit = idx >= 1 && c(T[idx - 1], v) === 0;
      out[q] = optB ? (hit ? 1 : 0) : hit ? idx : 0;
    } else out[q] = idx;
  }
  return optB ? boolT(ydims, out) : tensor('double', ydims, out);
}

// ------------------------------------------------------------- accumdim / bsxfun

function accumdimFn(args, nargout, ctx) {
  if (args.length < 2 || args.length > 6) throw E('base:accumdim:wrongNumberOfInputs', 'accumdim: two to six input arguments are required.');
  const subs = Array.from(toTensor(args[0]).re);
  let vals = args[1];
  if (!(isTensor(vals) || isSparse(vals))) throw E('base:accumdim:invalidInput', 'accumdim: VALS must be numeric.');
  vals = toTensor(vals);
  const vd = vals.dims.slice();
  const dim = args.length > 2 && count(args[2]) ? scalarNum(args[2], 'accumdim', 'DIM') - 1 : firstNonSingleton(vd);
  while (vd.length <= dim) vd.push(1);
  if (subs.some((s) => !Number.isInteger(s) || s < 1)) throw E('base:accumdim:invalidSubs', 'accumdim: indices must be positive integers.');
  if (subs.length !== vd[dim]) throw E('base:accumdim:dimensionMismatch', 'accumdim: dimension mismatch.');
  let n = args.length > 3 && count(args[3]) ? scalarNum(args[3], 'accumdim', 'N') : 0;
  const maxs = subs.length ? Math.max(...subs) : 0;
  if (n < maxs) { if (n) throw E('base:accumdim:outOfRange', 'accumdim: N index out of range.'); n = maxs; }
  const func = args.length > 4 && !(isTensor(args[4]) && count(args[4]) === 0) ? args[4] : null;
  const fill = args.length > 5 && count(args[5]) ? toTensor(args[5]).re[0] : 0;
  const { before, len, after } = splitDims(vd, dim);
  const od = dimsWith(vd, dim, n);
  const outCls = vals.cls === 'single' ? 'single' : 'double';
  if (!func) {
    const re = new Float64Array(prod(od)), im = vals.im ? new Float64Array(re.length) : null;
    if (fill !== 0) { const seen = new Set(subs); for (let a = 0; a < after; a++) for (let k = 0; k < n; k++) if (!seen.has(k + 1)) for (let b = 0; b < before; b++) re[b + k * before + a * before * n] = fill; }
    for (let a = 0; a < after; a++) for (let k = 0; k < len; k++) for (let b = 0; b < before; b++) {
      const o = b + (subs[k] - 1) * before + a * before * n, p = b + k * before + a * before * len;
      re[o] += vals.re[p]; if (im) im[o] += vals.im[p];
    }
    return finalize(outCls, od, re, im);
  }
  const groups = new Map();
  subs.forEach((s, k) => { if (!groups.has(s)) groups.set(s, []); groups.get(s).push(k); });
  const fname = isFuncHandle(func) ? func.name : textArg(func);
  const isMinMax = fname === 'min' || fname === 'max';
  let re = null, im = null, cls = outCls;
  for (const [s, ks] of groups) {
    const idx = [];
    for (let a = 0; a < after; a++) for (const k of ks) for (let b = 0; b < before; b++) idx.push(b + k * before + a * before * len);
    const slab = gather(vals, Int32Array.from(idx), dimsWith(vd, dim, ks.length));
    const r = toTensor(call1(ctx, func, isMinMax ? [slab, tensor('double', [0, 0]), num(dim + 1)] : [slab, num(dim + 1)]));
    if (r.re.length !== before * after) throw E('base:accumdim:badReduction', 'accumdim: FUNC must reduce each slice to a single element along DIM.');
    if (!re) { re = new Float64Array(prod(od)).fill(fill); cls = r.cls === 'logical' ? 'double' : r.cls; }
    if (r.im && !im) im = new Float64Array(re.length);
    for (let a = 0; a < after; a++) for (let b = 0; b < before; b++) {
      const o = b + (s - 1) * before + a * before * n;
      re[o] = r.re[b + a * before]; if (im) im[o] = r.im ? r.im[b + a * before] : 0;
    }
  }
  if (!re) re = new Float64Array(prod(od)).fill(fill);
  return finalize(cls, od, re, im);
}
function bsxfunFn(args, nargout, ctx) {
  if (args.length !== 3) throw E('base:bsxfun:wrongNumberOfInputs', 'bsxfun: exactly three input arguments are required.');
  const [f, A, B] = args;
  if (!isFuncHandle(f) && textArg(f) === null) throw E('base:bsxfun:invalidFunction', 'bsxfun: F must be a string or function handle.');
  const da = dimsOfV(A), db = dimsOfV(B);
  const nd = Math.max(da.length, db.length);
  const od = [];
  for (let i = 0; i < nd; i++) {
    const x = da[i] ?? 1, y = db[i] ?? 1;
    if (x !== y && x !== 1 && y !== 1) throw E('base:bsxfun:dimensionMismatch', `bsxfun: dimensions of A and B must match (dimension ${i + 1}: ${x} vs ${y}).`);
    od.push(x === 1 ? y : x);
  }
  const expand = (v, d) => {
    if (sameSize(v, { dims: od })) return v;
    const vd = d.slice(); while (vd.length < nd) vd.push(1);
    const n = prod(od); const idx = new Int32Array(n);
    const sub = new Array(nd).fill(0);
    for (let q = 0; q < n; q++) {
      let lin = 0, st = 1;
      for (let i = 0; i < nd; i++) { lin += (vd[i] === 1 ? 0 : sub[i]) * st; st *= vd[i]; }
      idx[q] = lin;
      for (let i = 0; i < nd; i++) { sub[i]++; if (sub[i] < od[i]) break; sub[i] = 0; }
    }
    return gather(isSparse(v) ? toTensor(v) : v, idx, od);
  };
  const r = call1(ctx, f, [expand(A, da), expand(B, db)]);
  if (!sameSize(r, { dims: od })) throw E('base:bsxfun:badResult', 'bsxfun: F must return an array of the same size as its (expanded) arguments.');
  return r;
}

// ------------------------------------------------------------- sets

function powersetFn(args, nargout, ctx) {
  if (args.length < 1 || args.length > 2) throw E('base:powerset:wrongNumberOfInputs', 'powerset: one or two input arguments are required.');
  const a = args[0];
  if (args.length > 1 && (textArg(args[1]) || '').toLowerCase() !== 'rows') throw E('base:powerset:invalidOption', 'powerset: second argument must be "rows".');
  if (args.length > 1) throw E('base:powerset:rowsUnimplemented', 'powerset: "rows" is not implemented (as in GNU Octave).');
  const isText = isCell(a);
  if (!isText && !(isTensor(a) || isSparse(a))) throw E('base:powerset:invalidInput', 'powerset: A must be a numeric array or a cell array of strings.');
  const u = call1(ctx, 'unique', [a]);
  const n = count(u);
  if (n > 32) throw E('base:powerset:tooLarge', 'powerset: not implemented for more than 32 elements.');
  const total = 2 ** n;
  const out = new Array(total);
  for (let m = 0; m < total; m++) {
    const idx = [];
    for (let i = 0; i < n; i++) if (Math.floor(m / 2 ** i) % 2) idx.push(i);
    out[m] = gather(u, Int32Array.from(idx), [m === 0 && !isText ? 1 : 1, idx.length]);
  }
  return cell([1, total], out);
}

// ------------------------------------------------------------- base64 of numbers

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function b64encode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const t = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += B64[(t >> 18) & 63] + B64[(t >> 12) & 63] + (i + 1 < bytes.length ? B64[(t >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[t & 63] : '=');
  }
  return out;
}
export function b64decode(s, fname) {
  const clean = s.replace(/[\s]/g, '').replace(/=+$/, '');
  const out = [];
  let acc = 0, bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch === '-' ? '+' : ch === '_' ? '/' : ch);
    if (v < 0) throw E(`base:${fname}:invalidInput`, `${fname}: input was not valid base64.`);
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); }
  }
  return Uint8Array.from(out);
}
const TYPED = { double: Float64Array, single: Float32Array, int8: Int8Array, uint8: Uint8Array, int16: Int16Array, uint16: Uint16Array, int32: Int32Array, uint32: Uint32Array, int64: BigInt64Array, uint64: BigUint64Array };
function base64EncodeFn(args) {
  if (args.length !== 1) throw E('base:base64_encode:wrongNumberOfInputs', 'base64_encode: exactly one input argument is required.');
  const x = args[0];
  if (!(isTensor(x) || isSparse(x)) || isChar(x) || x.cls === 'logical') throw E('base:base64_encode:invalidInput', 'base64_encode: encoding is supported only for numeric arrays.');
  const t = toTensor(x);
  if (t.im) throw E('base:base64_encode:complex', 'base64_encode: encoding complex or sparse data is not supported.');
  const C = TYPED[t.cls];
  const arr = new C(t.re.length);
  if (C === BigInt64Array || C === BigUint64Array) for (let i = 0; i < arr.length; i++) arr[i] = BigInt(t.re[i]); else arr.set(t.re);
  const bytes = new Uint8Array(arr.buffer);
  if (!littleEndian()) swapBytes(bytes, C.BYTES_PER_ELEMENT);
  return charOrEmpty(b64encode(bytes));
}
const littleEndian = () => new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
function swapBytes(b, w) { for (let i = 0; i < b.length; i += w) for (let a = 0; a < w / 2; a++) { const t = b[i + a]; b[i + a] = b[i + w - 1 - a]; b[i + w - 1 - a] = t; } }
function base64DecodeFn(args) {
  if (args.length < 1 || args.length > 2) throw E('base:base64_decode:wrongNumberOfInputs', 'base64_decode: one or two input arguments are required.');
  const bytes = b64decode(S(args[0], 'S'), 'base64_decode');
  if (bytes.length % 8) throw E('base:base64_decode:incorrectLength', 'base64_decode: incorrect input argument length (not a multiple of 8 bytes).');
  const copy = new Uint8Array(bytes);
  if (!littleEndian()) swapBytes(copy, 8);
  const re = new Float64Array(copy.buffer);
  let dims = [1, re.length];
  if (args.length > 1) {
    dims = Array.from(toTensor(args[1]).re);
    if (prod(dims) !== re.length) throw E('base:base64_decode:dimensionMismatch', 'base64_decode: input was not valid base64 or the dimensions do not match the data.');
  }
  return tensor('double', normDims(dims), Float64Array.from(re));
}

// ------------------------------------------------------------- hash

const utf8 = (s) => {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 256 && !(c >= 0xD800 && c <= 0xDFFF) && c < 128) { out.push(c); continue; }
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; } }
    if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
};
const hex = (words, bytesPerWord, little) => words.map((w) => {
  let s = '';
  for (let k = 0; k < bytesPerWord; k++) { const sh = little ? 8 * k : 8 * (bytesPerWord - 1 - k); s += ((w >>> sh) & 255).toString(16).padStart(2, '0'); }
  return s;
}).join('');
function mdPad(msg, little) {
  const n = msg.length;
  const total = Math.ceil((n + 9) / 64) * 64;
  const b = new Uint8Array(total); b.set(msg); b[n] = 0x80;
  const bits = n * 8;
  const lo = bits >>> 0, hi = Math.floor(bits / 4294967296) >>> 0;
  for (let k = 0; k < 4; k++) {
    if (little) { b[total - 8 + k] = (lo >>> (8 * k)) & 255; b[total - 4 + k] = (hi >>> (8 * k)) & 255; } else { b[total - 1 - k] = (lo >>> (8 * k)) & 255; b[total - 5 - k] = (hi >>> (8 * k)) & 255; }
  }
  return b;
}
const rotl = (x, n) => (x << n) | (x >>> (32 - n));
function md5(msg) {
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
  const R = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const b = mdPad(msg, true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Array(16);
  for (let off = 0; off < b.length; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = b[off + 4 * i] | (b[off + 4 * i + 1] << 8) | (b[off + 4 * i + 2] << 16) | (b[off + 4 * i + 3] << 24);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const tmp = D; D = C; C = B;
      B = (B + rotl((A + F + K[i] + M[g]) | 0, R[(i >> 4) * 4 + (i % 4)])) | 0;
      A = tmp;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  return hex([a0, b0, c0, d0], 4, true);
}
function md4(msg) {
  const b = mdPad(msg, true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const X = new Array(16);
  const F = (x, y, z) => (x & y) | (~x & z), G = (x, y, z) => (x & y) | (x & z) | (y & z), Hh = (x, y, z) => x ^ y ^ z;
  for (let off = 0; off < b.length; off += 64) {
    for (let i = 0; i < 16; i++) X[i] = b[off + 4 * i] | (b[off + 4 * i + 1] << 8) | (b[off + 4 * i + 2] << 16) | (b[off + 4 * i + 3] << 24);
    let A = a0, B = b0, C = c0, D = d0;
    const r1 = [3, 7, 11, 19];
    for (let i = 0; i < 16; i++) { const t = rotl((A + F(B, C, D) + X[i]) | 0, r1[i % 4]); A = D; D = C; C = B; B = t; }
    const o2 = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15], r2 = [3, 5, 9, 13];
    for (let i = 0; i < 16; i++) { const t = rotl((A + G(B, C, D) + X[o2[i]] + 0x5a827999) | 0, r2[i % 4]); A = D; D = C; C = B; B = t; }
    const o3 = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15], r3 = [3, 9, 11, 15];
    for (let i = 0; i < 16; i++) { const t = rotl((A + Hh(B, C, D) + X[o3[i]] + 0x6ed9eba1) | 0, r3[i % 4]); A = D; D = C; C = B; B = t; }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  return hex([a0, b0, c0, d0], 4, true);
}
const MD2_S = [41, 46, 67, 201, 162, 216, 124, 1, 61, 54, 84, 161, 236, 240, 6, 19, 98, 167, 5, 243, 192, 199, 115, 140, 152, 147, 43, 217, 188, 76, 130, 202, 30, 155, 87, 60, 253, 212, 224, 22, 103, 66, 111, 24, 138, 23, 229, 18, 190, 78, 196, 214, 218, 158, 222, 73, 160, 251, 245, 142, 187, 47, 238, 122, 169, 104, 121, 145, 21, 178, 7, 63, 148, 194, 16, 137, 11, 34, 95, 33, 128, 127, 93, 154, 90, 144, 50, 39, 53, 62, 204, 231, 191, 247, 151, 3, 255, 25, 48, 179, 72, 165, 181, 209, 215, 94, 146, 42, 172, 86, 170, 198, 79, 184, 56, 210, 150, 164, 125, 182, 118, 252, 107, 226, 156, 116, 4, 241, 69, 157, 112, 89, 100, 113, 135, 32, 134, 91, 207, 101, 230, 45, 168, 2, 27, 96, 37, 173, 174, 176, 185, 246, 28, 70, 97, 105, 52, 64, 126, 15, 85, 71, 163, 35, 221, 81, 175, 58, 195, 92, 249, 206, 186, 197, 234, 38, 44, 83, 13, 110, 133, 40, 132, 9, 211, 223, 205, 244, 65, 129, 77, 82, 106, 220, 55, 200, 108, 193, 171, 250, 36, 225, 123, 8, 12, 189, 177, 74, 120, 136, 149, 139, 227, 99, 232, 109, 233, 203, 213, 254, 59, 0, 29, 57, 242, 239, 183, 14, 102, 88, 208, 228, 166, 119, 114, 248, 235, 117, 75, 10, 49, 68, 80, 180, 143, 237, 31, 26, 219, 153, 141, 51, 159, 17, 131, 20];
function md2(msg) {
  const padLen = 16 - (msg.length % 16);
  const m = new Uint8Array(msg.length + padLen); m.set(msg); m.fill(padLen, msg.length);
  const C = new Uint8Array(16); let L = 0;
  for (let i = 0; i < m.length; i += 16) for (let j = 0; j < 16; j++) { C[j] ^= MD2_S[m[i + j] ^ L]; L = C[j]; }
  const all = new Uint8Array(m.length + 16); all.set(m); all.set(C, m.length);
  const X = new Uint8Array(48);
  for (let i = 0; i < all.length; i += 16) {
    for (let j = 0; j < 16; j++) { X[16 + j] = all[i + j]; X[32 + j] = X[16 + j] ^ X[j]; }
    let t = 0;
    for (let j = 0; j < 18; j++) { for (let k = 0; k < 48; k++) { X[k] ^= MD2_S[t]; t = X[k]; } t = (t + j) & 255; }
  }
  return Array.from(X.slice(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
}
function sha1(msg) {
  const b = mdPad(msg, false);
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
  const w = new Array(80);
  for (let off = 0; off < b.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (b[off + 4 * i] << 24) | (b[off + 4 * i + 1] << 16) | (b[off + 4 * i + 2] << 8) | b[off + 4 * i + 3];
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, bb = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (bb & c) | (~bb & d) : i < 40 ? bb ^ c ^ d : i < 60 ? (bb & c) | (bb & d) | (c & d) : bb ^ c ^ d;
      const k = i < 20 ? 0x5A827999 : i < 40 ? 0x6ED9EBA1 : i < 60 ? 0x8F1BBCDC : 0xCA62C1D6;
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0;
      e = d; d = c; c = rotl(bb, 30); bb = a; a = t;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + bb) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  return hex([h0, h1, h2, h3, h4], 4, false);
}
const K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
function sha256(msg, is224) {
  const b = mdPad(msg, false);
  let H = is224 ? [0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4] : [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < b.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (b[off + 4 * i] << 24) | (b[off + 4 * i + 1] << 16) | (b[off + 4 * i + 2] << 8) | b[off + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, bb, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    H = H.map((x, i) => (x + [a, bb, c, d, e, f, g, h][i]) | 0);
  }
  return hex(is224 ? H.slice(0, 7) : H, 4, false);
}
const K512 = ['428a2f98d728ae22', '7137449123ef65cd', 'b5c0fbcfec4d3b2f', 'e9b5dba58189dbbc', '3956c25bf348b538', '59f111f1b605d019', '923f82a4af194f9b', 'ab1c5ed5da6d8118', 'd807aa98a3030242', '12835b0145706fbe', '243185be4ee4b28c', '550c7dc3d5ffb4e2', '72be5d74f27b896f', '80deb1fe3b1696b1', '9bdc06a725c71235', 'c19bf174cf692694', 'e49b69c19ef14ad2', 'efbe4786384f25e3', '0fc19dc68b8cd5b5', '240ca1cc77ac9c65', '2de92c6f592b0275', '4a7484aa6ea6e483', '5cb0a9dcbd41fbd4', '76f988da831153b5', '983e5152ee66dfab', 'a831c66d2db43210', 'b00327c898fb213f', 'bf597fc7beef0ee4', 'c6e00bf33da88fc2', 'd5a79147930aa725', '06ca6351e003826f', '142929670a0e6e70', '27b70a8546d22ffc', '2e1b21385c26c926', '4d2c6dfc5ac42aed', '53380d139d95b3df', '650a73548baf63de', '766a0abb3c77b2a8', '81c2c92e47edaee6', '92722c851482353b', 'a2bfe8a14cf10364', 'a81a664bbc423001', 'c24b8b70d0f89791', 'c76c51a30654be30', 'd192e819d6ef5218', 'd69906245565a910', 'f40e35855771202a', '106aa07032bbd1b8', '19a4c116b8d2d0c8', '1e376c085141ab53', '2748774cdf8eeb99', '34b0bcb5e19b48a8', '391c0cb3c5c95a63', '4ed8aa4ae3418acb', '5b9cca4f7763e373', '682e6ff3d6b2b8a3', '748f82ee5defb2fc', '78a5636f43172f60', '84c87814a1f0ab72', '8cc702081a6439ec', '90befffa23631e28', 'a4506cebde82bde9', 'bef9a3f7b2c67915', 'c67178f2e372532b', 'ca273eceea26619c', 'd186b8c721c0c207', 'eada7dd6cde0eb1e', 'f57d4f7fee6ed178', '06f067aa72176fba', '0a637dc5a2c898a6', '113f9804bef90dae', '1b710b35131c471b', '28db77f523047d84', '32caab7b40c72493', '3c9ebe0a15c9bebc', '431d67c49c100d4c', '4cc5d4becb3e42b6', '597f299cfc657e2a', '5fcb6fab3ad6faec', '6c44198c4a475817'].map((h) => BigInt('0x' + h));
function sha512(msg, is384) {
  const n = msg.length;
  const total = Math.ceil((n + 17) / 128) * 128;
  const b = new Uint8Array(total); b.set(msg); b[n] = 0x80;
  let bits = BigInt(n) * 8n;
  for (let k = 0; k < 16; k++) { b[total - 1 - k] = Number(bits & 255n); bits >>= 8n; }
  const M = (1n << 64n) - 1n;
  const rotr = (x, k) => ((x >> BigInt(k)) | (x << BigInt(64 - k))) & M;
  let H = (is384 ? ['cbbb9d5dc1059ed8', '629a292a367cd507', '9159015a3070dd17', '152fecd8f70e5939', '67332667ffc00b31', '8eb44a8768581511', 'db0c2e0d64f98fa7', '47b5481dbefa4fa4'] : ['6a09e667f3bcc908', 'bb67ae8584caa73b', '3c6ef372fe94f82b', 'a54ff53a5f1d36f1', '510e527fade682d1', '9b05688c2b3e6c1f', '1f83d9abfb41bd6b', '5be0cd19137e2179']).map((h) => BigInt('0x' + h));
  const w = new Array(80);
  for (let off = 0; off < total; off += 128) {
    for (let i = 0; i < 16; i++) { let x = 0n; for (let k = 0; k < 8; k++) x = (x << 8n) | BigInt(b[off + 8 * i + k]); w[i] = x; }
    for (let i = 16; i < 80; i++) {
      const s0 = rotr(w[i - 15], 1) ^ rotr(w[i - 15], 8) ^ (w[i - 15] >> 7n), s1 = rotr(w[i - 2], 19) ^ rotr(w[i - 2], 61) ^ (w[i - 2] >> 6n);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & M;
    }
    let [a, bb, c, d, e, f, g, h] = H;
    for (let i = 0; i < 80; i++) {
      const S1 = rotr(e, 14) ^ rotr(e, 18) ^ rotr(e, 41), ch = (e & f) ^ (~e & M & g);
      const t1 = (h + S1 + ch + K512[i] + w[i]) & M;
      const S0 = rotr(a, 28) ^ rotr(a, 34) ^ rotr(a, 39), maj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + maj) & M;
      h = g; g = f; f = e; e = (d + t1) & M; d = c; c = bb; bb = a; a = (t1 + t2) & M;
    }
    H = H.map((x, i) => (x + [a, bb, c, d, e, f, g, h][i]) & M);
  }
  return (is384 ? H.slice(0, 6) : H).map((x) => x.toString(16).padStart(16, '0')).join('');
}
export const HASHES = { md2, md4, md5, sha1, sha224: (m) => sha256(m, true), sha256: (m) => sha256(m, false), sha384: (m) => sha512(m, true), sha512: (m) => sha512(m, false) };
function textBytes(v) {
  if (isChar(v)) { const codes = Array.from(v.re); return codes.every((c) => c < 256) ? Uint8Array.from(codes) : utf8(String.fromCharCode(...codes)); }
  return utf8(S(v, 'STR'));
}
function hashFn(args) {
  if (args.length !== 2) throw E('base:hash:wrongNumberOfInputs', 'hash: exactly two input arguments are required.');
  const type = S(args[0], 'HASH_TYPE').toLowerCase();
  const f = HASHES[type];
  if (!f) throw E('base:hash:unknownType', `hash: unknown hash type '${type}'.`);
  if (!isChar(args[1]) && !isString(args[1])) throw E('base:hash:invalidInput', 'hash: STR must be a string.');
  return str(f(textBytes(args[1])));
}

// ------------------------------------------------------------- versions and columns

function versionParts(v) {
  if (!/^\d/.test(v)) throw E('base:compare_versions:invalidVersion', 'compare_versions: version strings must start with a number.');
  return v.split('.').map((p) => { const m = /^(\d*)(.*)$/.exec(p); return { n: m[1] ? +m[1] : 0, s: m[2] }; });
}
function compareVersionsFn(args) {
  if (args.length !== 3) throw E('base:compare_versions:wrongNumberOfInputs', 'compare_versions: exactly three input arguments are required.');
  const a = versionParts(S(args[0], 'V1').trim()), b = versionParts(S(args[1], 'V2').trim());
  const op = S(args[2], 'OPERATOR').replace(/\s/g, '');
  let c = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && c === 0; i++) {
    const x = a[i] || { n: 0, s: '' }, y = b[i] || { n: 0, s: '' };
    if (x.n !== y.n) c = x.n < y.n ? -1 : 1;
    else if (x.s !== y.s) c = x.s < y.s ? -1 : 1;
  }
  const ops = { '==': c === 0, '<': c < 0, '<=': c <= 0, '>': c > 0, '>=': c >= 0, '!=': c !== 0, '~=': c !== 0 };
  if (!(op in ops)) throw E('base:compare_versions:invalidOperator', `compare_versions: invalid OPERATOR "${op}".`);
  return bool(ops[op]);
}
export function listInColumns(list, width, prefix = '') {
  if (!list.length) return '';
  const maxLen = Math.max(...list.map((s) => s.length)) + 2;
  const usable = width - prefix.length;
  let ncols = Math.floor(usable / maxLen); if (ncols < 1) ncols = 1;
  const nr = Math.ceil(list.length / ncols);
  let out = '';
  for (let r = 0; r < nr; r++) {
    out += prefix;
    for (let k = r; k < list.length; k += nr) {
      out += list[k];
      if (k + nr < list.length) out += ' '.repeat(maxLen - list[k].length);
    }
    out += '\n';
  }
  return out;
}
function listInColumnsFn(args, nargout, ctx) {
  if (args.length < 1 || args.length > 3) throw E('base:list_in_columns:wrongNumberOfInputs', 'list_in_columns: one to three input arguments are required.');
  const a = args[0];
  let list;
  if (isChar(a)) list = charRows(a).map((s) => s.replace(/ +$/, ''));
  else if (isCell(a) || isString(a)) list = textList(a, 'ARG').list.map((s) => s || '');
  else throw E('base:list_in_columns:invalidInput', 'list_in_columns: ARG must be a cellstr or char array.');
  let width = 80;
  if (args.length > 1 && count(args[1])) width = scalarNum(args[1], 'list_in_columns', 'WIDTH');
  else if (ctx && ctx.format && ctx.format.width) width = ctx.format.width;
  const prefix = args.length > 2 ? S(args[2], 'PREFIX') : '';
  return charOrEmpty(listInColumns(list, width, prefix));
}

// ------------------------------------------------------------- bitpack

function bitpackFn(args) {
  if (args.length !== 2) throw E('base:bitpack:wrongNumberOfInputs', 'bitpack: exactly two input arguments are required.');
  const x = args[0];
  if (!isTensor(x) || x.cls !== 'logical') throw E('base:bitpack:invalidInput', 'bitpack: X must be a logical array.');
  const cls = S(args[1], 'CLASS');
  const C = TYPED[cls] || (cls === 'char' ? Uint8Array : cls === 'logical' ? Uint8Array : null);
  if (!C) throw E('base:bitpack:invalidClass', `bitpack: invalid data type '${cls}' to pack.`);
  const w = C.BYTES_PER_ELEMENT * 8;
  if (cls === 'logical') return x;
  if (x.re.length % w) throw E('base:bitpack:incorrectNumber', `bitpack: incorrect number of bits to make up output value (must be a multiple of ${w}).`);
  const bytes = new Uint8Array(x.re.length / 8);
  for (let i = 0; i < x.re.length; i++) if (x.re[i]) bytes[i >> 3] |= 1 << (i & 7);
  if (!littleEndian()) swapBytes(bytes, C.BYTES_PER_ELEMENT);
  const arr = new C(bytes.buffer);
  const n = arr.length;
  const re = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Number(arr[i]);
  const dims = x.dims[0] === 1 && x.dims.length === 2 ? [1, n] : [n, 1];
  return tensor(cls, dims, re);
}
function bitunpackFn(args) {
  if (args.length !== 1) throw E('base:bitunpack:wrongNumberOfInputs', 'bitunpack: exactly one input argument is required.');
  const x = args[0];
  if (!isTensor(x) || x.im) throw E('base:bitunpack:invalidInput', 'bitunpack: argument must be a real numeric, char or logical array.');
  if (x.cls === 'logical') return x;
  const C = TYPED[x.cls] || (x.cls === 'char' ? Uint8Array : null);
  const arr = new C(x.re.length);
  if (C === BigInt64Array || C === BigUint64Array) for (let i = 0; i < arr.length; i++) arr[i] = BigInt(x.re[i]); else arr.set(x.re);
  const bytes = new Uint8Array(arr.buffer.slice(0));
  if (!littleEndian()) swapBytes(bytes, C.BYTES_PER_ELEMENT);
  const n = bytes.length * 8;
  const re = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  const dims = x.dims[0] === 1 && x.dims.length === 2 ? [1, n] : [n, 1];
  return boolT(dims, re);
}

// ------------------------------------------------------------- aliases

const alias = (target) => (args, nargout, ctx) => ctx.call(target, args, Math.max(1, nargout));

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const builtins = {
  isalpha: charClass('isalpha'), isdigit: charClass('isdigit'), isalnum: charClass('isalnum'),
  islower: charClass('islower'), isupper: charClass('isupper'), isxdigit: charClass('isxdigit'),
  ispunct: charClass('ispunct'), iscntrl: charClass('iscntrl'), isprint: charClass('isprint'),
  isgraph: charClass('isgraph'), isascii: charClass('isascii'),
  e: eFn, NA: NAFn, isna: isnaFn,
  rows: rowsFn, columns: columnsFn, size_equal: sizeEqualFn, sizeof: sizeofFn, numfields: numfieldsFn,
  sizemax() { return num(2 ** 53 - 1); },
  isindex: isindexFn, isuniform: isuniformFn, isdefinite: isdefiniteFn,
  isbool(args) { if (args.length !== 1) throw E('base:isbool:wrongNumberOfInputs', 'isbool: exactly one input argument is required.'); return bool(args[0] != null && args[0].cls === 'logical'); },
  iscomplex(args) { if (args.length !== 1) throw E('base:iscomplex:wrongNumberOfInputs', 'iscomplex: exactly one input argument is required.'); const v = args[0]; return bool((isTensor(v) || isSparse(v)) && !!v.im); },
  is_sq_string(args) { if (args.length !== 1) throw E('base:is_sq_string:wrongNumberOfInputs', 'is_sq_string: exactly one input argument is required.'); return bool(isChar(args[0])); },
  is_dq_string(args) { if (args.length !== 1) throw E('base:is_dq_string:wrongNumberOfInputs', 'is_dq_string: exactly one input argument is required.'); return bool(isString(args[0])); },
  index: indexFn('index', false), rindex: indexFn('rindex', true),
  findstr: findstrFn, substr: substrFn, strtrunc: strtruncFn, ostrsplit: ostrsplitFn, cstrcat: cstrcatFn,
  do_string_escapes: doStringEscapesFn, undo_string_escapes: undoStringEscapesFn, untabify: untabifyFn,
  strchr: strchrFn, strmatch: strmatchFn, unicode_idx: unicodeIdxFn, strread: strreadFn,
  tolower: alias('lower'), toupper: alias('upper'),
  celldisp: celldispFn, cellindexmat: cellindexmatFn, cellslices: cellslicesFn,
  common_size: commonSizeFn, postpad: padFn('postpad', true), prepad: padFn('prepad', false),
  vec: vecFn, vech: vechFn, rotdim: rotdimFn, repelems: repelemsFn, nth_element: nthElementFn,
  merge: mergeFn, ifelse: mergeFn, lookup: lookupFn, accumdim: accumdimFn, bsxfun: bsxfunFn,
  powerset: powersetFn,
  base64_encode: base64EncodeFn, base64_decode: base64DecodeFn, hash: hashFn,
  compare_versions: compareVersionsFn, list_in_columns: listInColumnsFn,
  bitpack: bitpackFn, bitunpack: bitunpackFn,
};

const cc = (name, what, ko) => H(`True for ${what} (character class test; non-char input gives false).`, `${ko}인 문자에 대해 참 (문자 분류 검사; 문자가 아닌 입력은 거짓).`, [`tf = ${name}(s)`]);
export const help = {
  isalpha: cc('isalpha', 'letters', '문자(알파벳)'),
  isdigit: cc('isdigit', 'decimal digits', '10진 숫자'),
  isalnum: cc('isalnum', 'letters or digits', '문자 또는 숫자'),
  islower: cc('islower', 'lowercase letters', '소문자'),
  isupper: cc('isupper', 'uppercase letters', '대문자'),
  isxdigit: cc('isxdigit', 'hexadecimal digits', '16진 숫자'),
  ispunct: cc('ispunct', 'punctuation characters', '문장 부호'),
  iscntrl: cc('iscntrl', 'control characters', '제어 문자'),
  isprint: cc('isprint', 'printable characters (including space)', '인쇄 가능한 문자(공백 포함)'),
  isgraph: cc('isgraph', 'printable characters except space', '공백을 제외한 인쇄 가능한 문자'),
  isascii: cc('isascii', 'ASCII characters (codes 0 to 127)', 'ASCII 문자(코드 0~127)'),
  e: H("Euler's number e = exp(1), or an array filled with it.", '자연로그의 밑 e = exp(1), 또는 e 로 채운 배열.', ['x = e', 'X = e(n)', 'X = e(m, n)', 'X = e(..., class)']),
  NA: H('Missing value NA (a special NaN), or an array filled with it.', '결측값 NA (특별한 NaN), 또는 NA 로 채운 배열.', ['x = NA', 'X = NA(n)', 'X = NA(m, n)', 'X = NA(..., class)']),
  isna: H('True for elements that are NA missing values (NaN that is not NA gives false).', 'NA 결측값인 원소에 대해 참 (NA 가 아닌 NaN 은 거짓).', ['tf = isna(x)']),
  rows: H('Number of rows of an array.', '배열의 행 수.', ['nr = rows(A)']),
  columns: H('Number of columns of an array.', '배열의 열 수.', ['nc = columns(A)']),
  size_equal: H('True if all arguments have the same size.', '모든 인수의 크기가 같으면 참.', ['tf = size_equal(a, b, ...)']),
  sizeof: H('Number of bytes used to store the value (char counts 1 byte per element).', '값을 저장하는 데 쓰는 바이트 수 (문자는 원소당 1 바이트).', ['n = sizeof(val)']),
  numfields: H('Number of fields of a structure (0 for other values).', '구조체의 필드 수 (다른 값은 0).', ['n = numfields(s)']),
  sizemax: H('Largest allowed value for an array dimension.', '배열 차원의 최대 허용 크기.', ['max = sizemax()']),
  isindex: H('True if IND is a valid index (optionally for an extent N).', 'IND 가 올바른 인덱스이면 참 (선택적으로 범위 N 기준).', ['tf = isindex(ind)', 'tf = isindex(ind, n)']),
  isuniform: H('True if a vector has uniformly spaced elements; also returns the step.', '벡터 원소가 균일한 간격이면 참; 간격도 반환.', ['tf = isuniform(v)', '[tf, delta] = isuniform(v)']),
  isdefinite: H('True if A is Hermitian positive definite within tolerance TOL.', 'A 가 허용오차 TOL 안에서 에르미트 양의 정부호이면 참.', ['tf = isdefinite(A)', 'tf = isdefinite(A, tol)']),
  isbool: H('True for logical arrays (same as islogical).', '논리형 배열이면 참 (islogical 과 같음).', ['tf = isbool(x)']),
  iscomplex: H('True if the value is stored as complex.', '값이 복소수로 저장되어 있으면 참.', ['tf = iscomplex(x)']),
  is_sq_string: H("True for character arrays (single-quoted text 'like this').", "문자형 배열(작은따옴표 텍스트 'like this')이면 참.", ['tf = is_sq_string(x)']),
  is_dq_string: H('True for double-quoted text, which is a string scalar or array in this language.', '큰따옴표 텍스트이면 참 (이 언어에서는 string 스칼라/배열).', ['tf = is_dq_string(x)']),
  index: H('Index of the first occurrence of T in S (0 if none).', 'S 에서 T 가 처음 나오는 위치 (없으면 0).', ['n = index(s, t)', "n = index(s, t, 'last')"]),
  rindex: H('Index of the last occurrence of T in S (0 if none).', 'S 에서 T 가 마지막으로 나오는 위치 (없으면 0).', ['n = rindex(s, t)']),
  findstr: H('Positions of the shorter string inside the longer one (legacy; use strfind).', '긴 문자열 안에서 짧은 문자열의 위치 (구식; strfind 사용 권장).', ['v = findstr(s, t)', 'v = findstr(s, t, overlap)']),
  substr: H('Substring of S starting at OFFSET with length LEN.', 'S 의 OFFSET 위치부터 길이 LEN 인 부분 문자열.', ['t = substr(s, offset)', 't = substr(s, offset, len)']),
  strtrunc: H('Truncate strings to length N.', '문자열을 길이 N 으로 자름.', ['s = strtrunc(s, n)']),
  ostrsplit: H('Split a string at any of the separator characters.', '구분 문자 중 하나가 나오는 곳에서 문자열을 분할.', ['c = ostrsplit(s, sep)', 'c = ostrsplit(s, sep, strip_empty)']),
  cstrcat: H('Concatenate character arrays horizontally, keeping whitespace.', '문자형 배열을 가로로 연결 (공백 유지).', ['s = cstrcat(s1, s2, ...)']),
  do_string_escapes: H('Replace backslash escape sequences (\\n, \\t, \\xhh, octal ...) by the characters.', '백슬래시 이스케이프 시퀀스(\\n, \\t, \\xhh, 8진수 ...)를 실제 문자로 바꿈.', ['s = do_string_escapes(str)']),
  undo_string_escapes: H('Convert special characters back to backslash escape sequences.', '특수 문자를 백슬래시 이스케이프 시퀀스로 되돌림.', ['s = undo_string_escapes(str)']),
  untabify: H('Replace tabs by spaces (tab width TW, default 8); optionally remove trailing blanks.', '탭을 공백으로 바꿈 (탭 폭 TW, 기본 8); 선택적으로 끝 공백 제거.', ['t = untabify(t)', 't = untabify(t, tw)', 't = untabify(t, tw, deblank)']),
  strchr: H('Positions of characters of STR that are in the set CHARS (like find).', 'STR 에서 CHARS 집합에 속하는 문자의 위치 (find 와 같은 출력).', ['idx = strchr(str, chars)', 'idx = strchr(str, chars, n, direction)', '[i, j] = strchr(...)']),
  strmatch: H('Indices of entries of A that begin with S (legacy).', 'S 로 시작하는 A 항목의 인덱스 (구식).', ['idx = strmatch(s, A)', "idx = strmatch(s, A, 'exact')"]),
  unicode_idx: H('Character index of each element of a text (surrogate pairs share an index).', '텍스트 각 원소의 문자 번호 (서로게이트 쌍은 같은 번호).', ['idx = unicode_idx(str)']),
  strread: H('Read formatted data from a string (legacy; use textscan).', '문자열에서 서식 있는 데이터 읽기 (구식; textscan 권장).', ['[a, ...] = strread(str)', '[a, ...] = strread(str, format)', '[a, ...] = strread(str, format, n)', "[a, ...] = strread(..., 'delimiter', d)"]),
  tolower: H('Convert text to lowercase (same as lower).', '텍스트를 소문자로 변환 (lower 와 같음).', ['y = tolower(s)']),
  toupper: H('Convert text to uppercase (same as upper).', '텍스트를 대문자로 변환 (upper 와 같음).', ['y = toupper(s)']),
  celldisp: H('Display the contents of a cell array recursively.', '셀형 배열의 내용을 재귀적으로 표시.', ['celldisp(c)', 'celldisp(c, name)']),
  cellindexmat: H('Index every element of a cell array: y{i} = x{i}(varargin{:}).', '셀형 배열의 모든 원소를 인덱싱: y{i} = x{i}(varargin{:}).', ['y = cellindexmat(x, varargin)']),
  cellslices: H('Cell array of slices x(lb(i):ub(i)) along a dimension.', '차원을 따라 x(lb(i):ub(i)) 조각을 모은 셀형 배열.', ['sl = cellslices(x, lb, ub)', 'sl = cellslices(x, lb, ub, dim)']),
  common_size: H('Expand scalar arguments to the common size of the others; err is 1 if sizes differ.', '스칼라 인수를 다른 인수의 공통 크기로 확장; 크기가 다르면 err = 1.', ['[err, a1, a2, ...] = common_size(a1, a2, ...)']),
  postpad: H('Append value C (default 0) or truncate at the end to length L.', '끝에 값 C(기본 0)를 덧붙이거나 잘라 길이 L 로 만듦.', ['y = postpad(x, l)', 'y = postpad(x, l, c)', 'y = postpad(x, l, c, dim)']),
  prepad: H('Prepend value C (default 0) or truncate at the start to length L.', '앞에 값 C(기본 0)를 덧붙이거나 잘라 길이 L 로 만듦.', ['y = prepad(x, l)', 'y = prepad(x, l, c)', 'y = prepad(x, l, c, dim)']),
  vec: H('Stack the columns of X into a column vector (or a vector along DIM).', 'X 의 열을 쌓아 열 벡터로 만듦 (또는 DIM 방향 벡터).', ['v = vec(x)', 'v = vec(x, dim)']),
  vech: H('Stack the lower-triangular part of a square matrix column by column.', '정사각 행렬의 아래 삼각 부분을 열 순서로 쌓음.', ['v = vech(x)']),
  rotdim: H('Rotate an N-d array by multiples of 90 degrees in a plane.', 'N 차원 배열을 평면 안에서 90도 배수만큼 회전.', ['y = rotdim(A)', 'y = rotdim(A, n)', 'y = rotdim(A, n, plane)']),
  repelems: H('Vector repeating elements: R(1,j) is an index of X and R(2,j) its count.', '원소 반복 벡터: R(1,j) 는 X 의 인덱스, R(2,j) 는 반복 횟수.', ['y = repelems(x, r)']),
  nth_element: H('The n-th smallest elements along a dimension (as if sorted).', '차원을 따라 n 번째로 작은 원소 (정렬한 것처럼).', ['nel = nth_element(x, n)', 'nel = nth_element(x, n, dim)']),
  merge: H('Choose elements of TVAL where MASK is true and of FVAL elsewhere.', 'MASK 가 참인 곳은 TVAL, 아닌 곳은 FVAL 원소를 선택.', ['y = merge(mask, tval, fval)']),
  ifelse: H('Same as merge: choose TVAL where MASK is true, FVAL elsewhere.', 'merge 와 같음: MASK 가 참이면 TVAL, 아니면 FVAL.', ['y = ifelse(mask, tval, fval)']),
  lookup: H("Binary search: index of the interval of a sorted TABLE containing each Y. Options 'm', 'b', 'l', 'r'.", "이진 탐색: 정렬된 TABLE 에서 각 Y 가 속한 구간 인덱스. 옵션 'm', 'b', 'l', 'r'.", ['idx = lookup(table, y)', 'idx = lookup(table, y, opt)']),
  accumdim: H('Accumulate slices of VALS along DIM into positions SUBS (sum, or a function).', 'VALS 의 DIM 방향 조각을 SUBS 위치에 누적 (합 또는 함수).', ['A = accumdim(subs, vals)', 'A = accumdim(subs, vals, dim, n, func, fillval)']),
  bsxfun: H('Apply a binary function with singleton expansion of A and B.', 'A 와 B 의 크기 1 차원을 확장하여 이항 함수를 적용.', ['C = bsxfun(f, A, B)']),
  powerset: H('All subsets of a set, as a cell array.', '집합의 모든 부분집합 (셀형 배열).', ['p = powerset(a)']),
  base64_encode: H('Encode the bytes of a numeric array as base64 text.', '숫자 배열의 바이트를 base64 텍스트로 인코딩.', ['s = base64_encode(x)']),
  base64_decode: H('Decode base64 text into a double array (optionally reshaped to DIMS).', 'base64 텍스트를 double 배열로 디코딩 (선택적으로 DIMS 로 변형).', ['x = base64_decode(s)', 'x = base64_decode(s, dims)']),
  hash: H('Message digest of a string: md2, md4, md5, sha1, sha224, sha256, sha384 or sha512.', '문자열의 메시지 다이제스트: md2, md4, md5, sha1, sha224, sha256, sha384, sha512.', ["h = hash('md5', str)", "h = hash('sha256', str)"]),
  compare_versions: H("Compare two version strings with an operator ('==', '<', '<=', '>', '>=', '!=').", "두 버전 문자열을 연산자('==', '<', '<=', '>', '>=', '!=')로 비교.", ["tf = compare_versions(v1, v2, '>=')"]),
  list_in_columns: H('Format a list of strings in columns that fit WIDTH.', '문자열 목록을 WIDTH 에 맞는 여러 열로 서식화.', ['s = list_in_columns(arg)', 's = list_in_columns(arg, width)', 's = list_in_columns(arg, width, prefix)']),
  bitpack: H('Pack a logical array of bits into values of a numeric class (little-endian).', '논리형 비트 배열을 숫자 클래스 값으로 묶음 (리틀 엔디언).', ["y = bitpack(x, 'uint8')"]),
  bitunpack: H('Unpack the bits of a numeric array into a logical array (little-endian).', '숫자 배열의 비트를 논리형 배열로 풀기 (리틀 엔디언).', ['y = bitunpack(x)']),
};
