// Package functions whose names (or documented result fields) carry the name
// of the compatible commercial product, so by the project rule (see
// core/CONTRACT.md) they can only live in core/compat/:
//
//   matlabroot                       the install root (Octave: OCTAVE_HOME)
//   matlab.lang.makeValidName        valid variable names from arbitrary text
//   matlab.lang.makeUniqueStrings    unique strings (suffixes _1, _2, ...)
//   matlab.net.base64encode          bytes / text → base64 text
//   matlab.net.base64decode          base64 text → bytes
//   memory                           memory information (its result has the
//                                    field MemUsedMATLAB, as in Octave)
//
// The dotted names are ordinary builtins: the interpreter calls a builtin
// named "a.b.c" when a.b.c(...) is written and `a` is not a variable,
// function or class (core/lang/interp.js callChain).
import {
  MError, tensor, str, num, cell, structOf, stringArray, isChar, isCell, isString, isTensor, isNumeric,
  isLogical, toStr, isText, prod,
} from '../value.js';
import { KEYWORDS } from '../lang/lexer.js';

const H = (en, ko, syntax) => ({ en, ko, syntax });
const err = (fn, what, msg) => new MError(`compat:${fn}:${what}`, `${fn}: ${msg}`);
const TXT = (v) => (v != null && (isText(v)));

/** char row / cellstr / string array → { list, kind, dims } */
function textList(v, fn, what) {
  if (isChar(v)) {
    if (v.dims.length > 2 || (v.dims[0] > 1)) throw err(fn, 'badInput', `${what} must be a character vector, a cell array of character vectors or a string array.`);
    return { list: [toStr(v)], kind: 'char', dims: [1, 1] };
  }
  if (isCell(v)) {
    const list = v.data.map((x) => {
      if (!isChar(x) || x.dims[0] > 1) throw err(fn, 'badInput', `${what} must be a character vector, a cell array of character vectors or a string array.`);
      return toStr(x);
    });
    return { list, kind: 'cell', dims: v.dims.slice() };
  }
  if (isString(v)) return { list: v.data.map((x) => (x == null ? '' : String(x))), kind: 'string', dims: v.dims.slice() };
  throw err(fn, 'badInput', `${what} must be a character vector, a cell array of character vectors or a string array.`);
}
function fromList(list, kind, dims) {
  if (kind === 'char') { const t = str(list[0]); if (!list[0].length) t.dims = [1, 0]; return t; }
  if (kind === 'string') return stringArray(dims, list.slice());
  return cell(dims, list.map((s) => { const t = str(s); if (!s.length) t.dims = [1, 0]; return t; }));
}
const logicalOf = (flags, kind, dims) => tensor('logical', kind === 'char' ? [1, 1] : dims, flags.map((b) => (b ? 1 : 0)));

// ---------------------------------------------------------------- matlabroot

function installRoot(ctx) {
  const fs = ctx.fs || {};
  for (const k of ['installDir', 'appRoot']) {
    try { if (typeof fs[k] === 'function') { const p = fs[k](); if (p) return String(p).replace(/\\/g, '/').replace(/\/+$/, '') || '/'; } } catch { /* next source */ }
  }
  for (const name of ['OCTAVE_HOME', 'MYSIMULATIONMATH_HOME']) {
    try {
      const r = ctx.call('getenv', [str(name)], 1);
      const v = Array.isArray(r) ? r[0] : r;
      const s = v && isText(v) ? toStr(v) : '';
      if (s) return s.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
    } catch { /* no environment */ }
  }
  return '/';
}

// ---------------------------------------------------------------- makeValidName

const isAlpha = (c) => /^[A-Za-z]$/.test(c);
const isAlnum = (c) => /^[A-Za-z0-9]$/.test(c);
const isSpace = (c) => /^[ \t\n\v\f\r]$/.test(c);
const isVarName = (s) => /^[A-Za-z][A-Za-z0-9_]*$/.test(s) && !KEYWORDS.has(s);

/** Octave's make_valid_name (libinterp utils.cc) on one string; returns [name, modified]. */
function makeValid(s, style, prefix) {
  if (isVarName(s)) return [s, false];
  // a letter after whitespace becomes upper case (not before the first non-blank)
  let out = '';
  let previous = false, anyNonSpace = false;
  for (const ch of s) {
    const c = anyNonSpace && previous && isAlpha(ch) ? ch.toUpperCase() : ch;
    out += c;
    previous = isSpace(c);
    anyNonSpace = anyNonSpace || !previous;
  }
  out = [...out].filter((c) => !isSpace(c)).join('');
  if (!out.length) out = prefix;
  if (KEYWORDS.has(out)) out = prefix + out[0].toUpperCase() + out.slice(1);
  if (!isAlpha(out[0])) out = prefix + out;
  if (style === 'underscore') out = [...out].map((c) => (isAlnum(c) ? c : '_')).join('');
  else if (style === 'delete') out = [...out].filter((c) => isAlnum(c) || c === '_').join('');
  else {
    out = [...out].map((c) => (isAlnum(c) || c === '_' ? c : `0x${c.codePointAt(0).toString(16).toUpperCase().padStart(2, '0')}`)).join('');
  }
  return [out, true];
}

function makeValidName(args, nargout) {
  const fn = 'makeValidName';
  if (args.length < 1) throw err(fn, 'minrhs', 'not enough input arguments.');
  const { list, kind, dims } = textList(args[0], fn, 'STR');
  if ((args.length - 1) % 2) throw err(fn, 'nameValue', 'options must be given as name/value pairs.');
  let style = 'underscore', prefix = 'x';
  for (let i = 1; i < args.length; i += 2) {
    if (!TXT(args[i])) throw err(fn, 'nameValue', 'option names must be text.');
    const name = toStr(args[i]).toLowerCase();
    if (!TXT(args[i + 1])) throw err(fn, 'badOption', `the value of option "${toStr(args[i])}" must be text.`);
    const val = toStr(args[i + 1]);
    if (name === 'replacementstyle') {
      style = val.toLowerCase();
      if (!['underscore', 'delete', 'hex'].includes(style)) throw err(fn, 'badStyle', 'invalid "ReplacementStyle" value; it must be "underscore", "delete" or "hex".');
    } else if (name === 'prefix') {
      if (!isVarName(val)) throw err(fn, 'badPrefix', 'invalid "Prefix" for valid identifier.');
      prefix = val;
    } else throw err(fn, 'badOption', `unknown option "${toStr(args[i])}".`);
  }
  const res = list.map((s) => makeValid(s, style, prefix));
  const out = fromList(res.map((r) => r[0]), kind, dims);
  return nargout > 1 ? [out, logicalOf(res.map((r) => r[1]), kind, dims)] : out;
}

// ---------------------------------------------------------------- makeUniqueStrings

function makeUniqueStrings(args, nargout) {
  const fn = 'makeUniqueStrings';
  if (args.length < 1 || args.length > 3) throw err(fn, 'nargin', 'one to three input arguments are required.');
  const { list, kind, dims } = textList(args[0], fn, 'STR');
  const n = list.length;
  // what to make unique: everything, or the elements selected by an index; the rest is kept as it is
  const selected = new Array(n).fill(true);
  const fixed = new Set();
  if (args.length > 1) {
    const ex = args[1];
    if (isTensor(ex) && (isNumeric(ex) || isLogical(ex)) && ex.cls !== 'char') {
      selected.fill(false);
      if (isLogical(ex)) {
        if (ex.re.length > n) throw err(fn, 'badIndex', 'the logical index is longer than STR.');
        for (let i = 0; i < ex.re.length; i++) if (ex.re[i]) selected[i] = true;
      } else {
        for (const x of ex.re) {
          if (!(x >= 1 && x <= n && Number.isInteger(x))) throw err(fn, 'badIndex', `index ${x} is out of bounds (STR has ${n} elements).`);
          selected[x - 1] = true;
        }
      }
      for (let i = 0; i < n; i++) if (!selected[i]) fixed.add(list[i]);
    } else if (isChar(ex) || isCell(ex) || isString(ex)) {
      for (const s of (isChar(ex) && !ex.re.length ? [] : textList(ex, fn, 'EXCLUDED').list)) fixed.add(s);
    } else throw err(fn, 'badExcluded', 'EXCLUDED must be text, a cell array of character vectors, a string array or an index.');
  }
  let maxLen = Infinity;
  if (args.length > 2) {
    const m = args[2];
    if (!isTensor(m) || prod(m.dims) !== 1 || !(m.re[0] >= 1) || (Number.isFinite(m.re[0]) && !Number.isInteger(m.re[0]))) throw err(fn, 'badLength', 'MAXLENGTH must be a positive integer scalar (or Inf).');
    maxLen = m.re[0];
  }
  const out = list.slice();
  const modified = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (selected[i] && out[i].length > maxLen) { out[i] = out[i].slice(0, maxLen); modified[i] = true; }
  }
  const count = new Map();
  for (let i = 0; i < n; i++) if (selected[i]) count.set(out[i], (count.get(out[i]) || 0) + 1);
  const rename = (i) => selected[i] && (count.get(out[i]) > 1 || fixed.has(out[i]));
  const taken = new Set(fixed);
  const todo = [];
  for (let i = 0; i < n; i++) { if (rename(i)) todo.push(i); else if (selected[i]) taken.add(out[i]); }
  const next = new Map();
  for (const i of todo) {
    const base = out[i];
    let k = next.get(base) || 1;
    let cand;
    for (;;) {
      const suffix = `_${k}`;
      if (suffix.length > maxLen) throw err(fn, 'tooShort', 'MAXLENGTH is too short to make the strings unique.');
      cand = base.slice(0, Math.max(0, Math.min(base.length, maxLen - suffix.length))) + suffix;
      k++;
      if (!taken.has(cand)) break;
    }
    next.set(base, k);
    taken.add(cand);
    out[i] = cand;
    modified[i] = true;
  }
  const res = fromList(out, kind, dims);
  return nargout > 1 ? [res, logicalOf(modified, kind, dims)] : res;
}

// ---------------------------------------------------------------- base64

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function utf8(s) {
  if (typeof globalThis.TextEncoder === 'function') return new globalThis.TextEncoder().encode(s);
  const out = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}
function isVectorDims(d) { return d.length === 2 && (d[0] <= 1 || d[1] <= 1); }

function base64encode(args) {
  const fn = 'base64encode';
  if (args.length !== 1) throw err(fn, 'nargin', 'exactly one input argument is required.');
  const v = args[0];
  let bytes;
  if (isChar(v) && isVectorDims(v.dims)) bytes = utf8(toStr(v));
  else if (isString(v) && v.data.length === 1) bytes = utf8(v.data[0] == null ? '' : v.data[0]);
  else if (isTensor(v) && v.cls === 'uint8' && isVectorDims(v.dims)) bytes = Uint8Array.from(v.re);
  else throw err(fn, 'badInput', 'IN must be a uint8 or char vector.');
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const t = (a << 16) | (b << 8) | c;
    s += B64[(t >> 18) & 63] + B64[(t >> 12) & 63] + (i + 1 < bytes.length ? B64[(t >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[t & 63] : '=');
  }
  const out = str(s);
  if (!s.length) out.dims = [1, 0];
  return out;
}

function base64decode(args) {
  const fn = 'base64decode';
  if (args.length !== 1) throw err(fn, 'nargin', 'exactly one input argument is required.');
  const v = args[0];
  let text;
  if (isChar(v) && isVectorDims(v.dims)) text = toStr(v);
  else if (isString(v) && v.data.length === 1) text = v.data[0] == null ? '' : v.data[0];
  else if (isTensor(v) && v.cls === 'uint8' && isVectorDims(v.dims)) text = String.fromCharCode(...v.re);
  else throw err(fn, 'badInput', 'B64_STR must be a base64 encoded character vector.');
  // URL-safe letters are accepted too; blanks and line breaks are skipped
  const clean = text.replace(/[\s]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const body = clean.replace(/=+$/, '');
  if (/[^A-Za-z0-9+/]/.test(body) || clean.length - body.length > 2 || body.length % 4 === 1) throw err(fn, 'badBase64', 'input was not valid base64.');
  const out = [];
  let acc = 0, bits = 0;
  for (const ch of body) {
    acc = (acc << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); acc &= (1 << bits) - 1; }
  }
  return tensor('uint8', [1, out.length], out);
}

// ---------------------------------------------------------------- memory

/** What the platform tells about memory (bytes); NaN where nothing is known. */
function memoryFacts() {
  const g = globalThis;
  const f = { totalRam: NaN, availRam: NaN, freeRam: NaN, totalSwap: NaN, freeSwap: NaN, usedRam: NaN, usedVirt: NaN, heapLimit: NaN };
  try {
    const p = g.process;
    if (p && typeof p.memoryUsage === 'function') { const m = p.memoryUsage(); f.usedRam = m.rss; f.usedVirt = m.rss; }
    if (p && typeof p.availableMemory === 'function') { const a = p.availableMemory(); if (a > 0) f.availRam = a; }
    if (p && typeof p.constrainedMemory === 'function') { const c = p.constrainedMemory(); if (c > 0 && c < 2 ** 62) f.totalRam = c; }
  } catch { /* not available */ }
  try {
    const pm = g.performance && g.performance.memory;
    if (pm) {
      if (Number.isNaN(f.usedRam)) { f.usedRam = pm.usedJSHeapSize; f.usedVirt = pm.totalJSHeapSize; }
      f.heapLimit = pm.jsHeapSizeLimit;
      if (Number.isNaN(f.availRam)) f.availRam = Math.max(0, pm.jsHeapSizeLimit - pm.usedJSHeapSize);
    }
  } catch { /* not available */ }
  try {
    const dm = g.navigator && g.navigator.deviceMemory;
    if (dm > 0 && Number.isNaN(f.totalRam)) f.totalRam = dm * 2 ** 30;
  } catch { /* not available */ }
  return f;
}

function memory(args, nargout, ctx) {
  if (args.length) throw err('memory', 'tooManyInputs', 'no input arguments are accepted.');
  const f = memoryFacts();
  const addressSpace = 2 ** 48; // computer(): maximum array size + 1
  const availVirt = Number.isNaN(f.usedVirt) ? NaN : addressSpace - f.usedVirt;
  const sysAvail = Number.isNaN(f.freeSwap) ? f.availRam : f.availRam + f.freeSwap;
  const minKnown = (...xs) => { const k = xs.filter((x) => !Number.isNaN(x)); return k.length ? Math.min(...k) : NaN; };
  const maxArray = minKnown(sysAvail, availVirt);
  const user = structOf({
    MaxPossibleArrayBytes: num(maxArray),
    MemAvailableAllArrays: num(maxArray),
    ram_available_all_arrays: num(minKnown(f.availRam, availVirt)),
    MemUsedMATLAB: num(f.usedVirt),
    mem_used_octave: num(f.usedVirt),
    ram_used_octave: num(f.usedRam),
  });
  const sys = structOf({
    PhysicalMemory: structOf({ Available: num(f.availRam), Total: num(f.totalRam) }),
    SystemMemory: structOf({ Available: num(sysAvail), Total: num(Number.isNaN(f.totalSwap) ? f.totalRam : f.totalRam + f.totalSwap) }),
    VirtualAddressSpace: structOf({ Available: num(availVirt), Total: num(addressSpace) }),
  });
  if (nargout > 0) return [user, sys];
  const MiB = 2 ** 20, kiB = 1024;
  const big = !(f.totalRam <= 1e7 * kiB);
  const unit = big ? MiB : kiB, uname = big ? 'MiB' : 'kiB';
  const q = (x) => (Number.isNaN(x) ? 'unknown'.padStart(9) : String(Math.round(x / unit)).padStart(9));
  let arch = '';
  try { const r = ctx.call('computer', [], 1); arch = toStr(Array.isArray(r) ? r[0] : r); } catch { arch = 'unknown'; }
  ctx.out(`Running on ${arch}\n` +
    `System    RAM: ${q(f.totalRam)} ${uname},  swap: ${q(f.totalSwap)} ${uname}\n` +
    `Engine    RAM: ${q(f.usedRam)} ${uname},  virt: ${q(f.usedVirt)} ${uname}\n` +
    `Free      RAM: ${q(f.freeRam)} ${uname},  swap: ${q(f.freeSwap)} ${uname}\n` +
    `Available RAM: ${q(minKnown(f.availRam, availVirt))} ${uname}, total: ${q(maxArray)} ${uname}\n`);
  return [];
}

// ---------------------------------------------------------------- export

export const builtins = {
  matlabroot(args, nargout, ctx) {
    if (args.length) throw err('matlabroot', 'tooManyInputs', 'no input arguments are accepted.');
    return str(installRoot(ctx));
  },
  'matlab.lang.makeValidName': makeValidName,
  'matlab.lang.makeUniqueStrings': makeUniqueStrings,
  'matlab.net.base64encode': base64encode,
  'matlab.net.base64decode': base64decode,
  memory,
};

export const help = {
  matlabroot: H('Root folder of the installation (Octave: OCTAVE_HOME). Taken from the host when it reports the install folder, else from the OCTAVE_HOME environment variable, else "/".',
    '설치 루트 폴더 (Octave: OCTAVE_HOME). 호스트가 설치 폴더를 알려 주면 그것, 아니면 OCTAVE_HOME 환경 변수, 그것도 없으면 "/".',
    ['dir = matlabroot', 'dir = matlabroot()']),
  'matlab.lang.makeValidName': H('Turns text into valid variable names: blanks are removed (a letter after a blank becomes upper case), keywords and names that do not start with a letter get the prefix, other invalid characters are replaced. ReplacementStyle: "underscore" (default), "delete" or "hex"; Prefix: default "x". The second output tells which names were changed.',
    '텍스트를 올바른 변수 이름으로 바꿉니다: 공백을 지우고(공백 뒤 글자는 대문자), 키워드나 글자로 시작하지 않는 이름에는 접두사를 붙이고, 그 밖의 잘못된 문자는 바꿉니다. ReplacementStyle: "underscore"(기본), "delete", "hex"; Prefix: 기본 "x". 두 번째 출력은 바뀐 이름을 알려 줍니다.',
    ['varname = matlab.lang.makeValidName(str)', 'varname = matlab.lang.makeValidName(___, "ReplacementStyle", rs)', 'varname = matlab.lang.makeValidName(___, "Prefix", pfx)', '[varname, ismodified] = matlab.lang.makeValidName(___)']),
  'matlab.lang.makeUniqueStrings': H('Makes strings unique by adding _1, _2, ... to repeated ones and to those equal to an excluded string. EXCLUDED is text, a cell array of text or an index of the elements to change (the others stay as they are). MAXLENGTH limits the length (the suffix is kept). The second output tells which strings were changed.',
    '반복되는 문자열과 제외 문자열과 같은 문자열에 _1, _2, ... 를 붙여 유일하게 만듭니다. EXCLUDED 는 텍스트, 텍스트 셀 배열, 또는 바꿀 원소의 인덱스(나머지는 그대로)입니다. MAXLENGTH 는 길이를 제한합니다(접미사는 유지). 두 번째 출력은 바뀐 문자열을 알려 줍니다.',
    ['uniqstr = matlab.lang.makeUniqueStrings(str)', 'uniqstr = matlab.lang.makeUniqueStrings(str, ex)', 'uniqstr = matlab.lang.makeUniqueStrings(str, ex, maxlength)', '[uniqstr, ismodified] = matlab.lang.makeUniqueStrings(___)']),
  'matlab.net.base64encode': H('Base64 text of a uint8 vector or of text (encoded as UTF-8).', 'uint8 벡터나 텍스트(UTF-8로 인코딩)의 Base64 텍스트.', ['b64_str = matlab.net.base64encode(in)']),
  'matlab.net.base64decode': H('Bytes (uint8 row vector) of Base64 text; blanks and line breaks are skipped.', 'Base64 텍스트의 바이트(uint8 행 벡터). 공백과 줄바꿈은 건너뜁니다.', ['out = matlab.net.base64decode(b64_str)']),
  memory: H('Memory information. With no output prints a table; else returns [userdata, systemdata] structs with the fields Octave documents (MaxPossibleArrayBytes, MemAvailableAllArrays, ram_available_all_arrays, MemUsedMATLAB, mem_used_octave, ram_used_octave; PhysicalMemory, SystemMemory, VirtualAddressSpace). The engine runs in a JavaScript runtime: used memory is the process resident size (desktop) or the JS heap (browser), available memory comes from the runtime when it reports it; values it does not report (swap, often total RAM) are NaN.',
    '메모리 정보. 출력이 없으면 표를 출력하고, 있으면 Octave 문서의 필드를 담은 [userdata, systemdata] 구조체를 돌려줍니다 (MaxPossibleArrayBytes, MemAvailableAllArrays, ram_available_all_arrays, MemUsedMATLAB, mem_used_octave, ram_used_octave; PhysicalMemory, SystemMemory, VirtualAddressSpace). 엔진은 JavaScript 런타임에서 돌므로 사용 메모리는 프로세스 상주 크기(데스크톱) 또는 JS 힙(브라우저)이고, 사용 가능 메모리는 런타임이 알려 줄 때만 채웁니다. 알 수 없는 값(스왑, 대개 전체 RAM)은 NaN 입니다.',
    ['memory', '[userdata, systemdata] = memory()']),
};

