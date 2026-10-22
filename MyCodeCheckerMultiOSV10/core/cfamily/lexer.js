'use strict';

// C11/C17/C23 and C++17/20 lexical grammar (translation phases 1-3).
//
// lex(text, opts) -> { tokens, comments, trigraphs, splices, diagnostics, lineStarts, file, text }
//
// Tokens are preprocessing tokens: identifiers that spell a keyword of the
// selected language get kind 'keyword' (the preprocessor still treats them as
// identifiers for macro purposes). Positions are 1-based; endCol is exclusive.
// start/end are 0-based offsets into the ORIGINAL text (before splicing).

const C_KEYWORDS_17 = [
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extern', 'float', 'for', 'goto', 'if', 'inline', 'int', 'long', 'register', 'restrict', 'return',
  'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void',
  'volatile', 'while', '_Alignas', '_Alignof', '_Atomic', '_Bool', '_Complex', '_Generic',
  '_Imaginary', '_Noreturn', '_Static_assert', '_Thread_local',
];
const C_KEYWORDS_23_EXTRA = [
  'alignas', 'alignof', 'bool', 'constexpr', 'false', 'nullptr', 'static_assert', 'thread_local',
  'true', 'typeof', 'typeof_unqual', '_BitInt', '_Decimal32', '_Decimal64', '_Decimal128',
];
const GNU_KEYWORDS = [
  '__attribute__', '__attribute', '__asm__', '__asm', 'asm', '__inline', '__inline__', '__restrict',
  '__restrict__', '__extension__', '__typeof__', '__typeof', '__volatile__', '__volatile', '__const',
  '__const__', '__signed', '__signed__', '__builtin_va_arg', '__builtin_offsetof', '__builtin_va_list',
  '__int128', '__label__', '__alignof__', '__alignof', '__declspec', '__cdecl', '__stdcall',
  '__fastcall', '__forceinline', '__thread', '__auto_type', '__real__', '__imag__',
];
const CPP_KEYWORDS = [
  'alignas', 'alignof', 'asm', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'char8_t',
  'char16_t', 'char32_t', 'class', 'concept', 'const', 'consteval', 'constexpr', 'constinit',
  'const_cast', 'continue', 'co_await', 'co_return', 'co_yield', 'decltype', 'default', 'delete',
  'do', 'double', 'dynamic_cast', 'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float',
  'for', 'friend', 'goto', 'if', 'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept',
  'nullptr', 'operator', 'private', 'protected', 'public', 'register', 'reinterpret_cast', 'requires',
  'return', 'short', 'signed', 'sizeof', 'static', 'static_assert', 'static_cast', 'struct', 'switch',
  'template', 'this', 'thread_local', 'throw', 'true', 'try', 'typedef', 'typeid', 'typename',
  'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'wchar_t', 'while',
  // accepted in C++ as extensions
  '_Alignas', '_Alignof', '_Atomic', '_Bool', '_Complex', '_Noreturn', '_Static_assert', '_Thread_local',
  'restrict',
];
const CPP_ALT_TOKENS = {
  and: '&&', or: '||', not: '!', bitand: '&', bitor: '|', xor: '^', compl: '~',
  and_eq: '&=', or_eq: '|=', xor_eq: '^=', not_eq: '!=',
};

const KEYWORD_CACHE = new Map();
function keywordSet(lang, std) {
  const cpp = lang === 'cpp';
  const c23 = !cpp && /2x|23/.test(String(std || ''));
  const key = cpp ? 'cpp' : (c23 ? 'c23' : 'c');
  let s = KEYWORD_CACHE.get(key);
  if (!s) {
    s = new Set(cpp ? CPP_KEYWORDS.concat(GNU_KEYWORDS) : C_KEYWORDS_17.concat(c23 ? C_KEYWORDS_23_EXTRA : [], GNU_KEYWORDS));
    KEYWORD_CACHE.set(key, s);
  }
  return s;
}

const TRIGRAPHS = { '=': '#', '/': '\\', "'": '^', '(': '[', ')': ']', '!': '|', '<': '{', '>': '}', '-': '~' };
const DIGRAPHS = { '<:': '[', ':>': ']', '<%': '{', '%>': '}', '%:': '#', '%:%:': '##' };

// character class table
const ID_START = 1, ID_CONT = 2, DIGIT = 4;
const CC = new Uint8Array(128);
for (let c = 0; c < 128; c++) {
  const ch = String.fromCharCode(c);
  if (/[A-Za-z_$]/.test(ch)) CC[c] = ID_START | ID_CONT;
  if (/[0-9]/.test(ch)) CC[c] = ID_CONT | DIGIT;
}
const isHex = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);

const STRING_PREFIXES = new Set(['L', 'u', 'U', 'u8']);
const RAW_PREFIXES = new Set(['R', 'LR', 'uR', 'UR', 'u8R']);

function computeLineStarts(text) {
  const starts = [0];
  for (let i = 0, n = text.length; i < n; i++) {
    const c = text.charCodeAt(i);
    if (c === 10) starts.push(i + 1);
    else if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) i++;
      starts.push(i + 1);
    }
  }
  return starts;
}

// Phase 1/2: trigraph detection (optional replacement) and line splicing.
// Returns the cleaned text and a map cleaned offset -> original offset (or null).
function phase12(text, opts, file, lineStarts, trigraphs, splices, diagnostics) {
  const replaceTri = !!opts.trigraphs;
  let hasWork = false;
  let q = text.indexOf('??');
  while (q !== -1) {
    const r = TRIGRAPHS[text[q + 2]];
    if (r !== undefined) {
      const p = posOf(lineStarts, q);
      trigraphs.push({ seq: text.slice(q, q + 3), replacement: r, offset: q, line: p.line, col: p.col, file });
      if (replaceTri) hasWork = true;
      q = text.indexOf('??', q + 3);
    } else q = text.indexOf('??', q + 1);
  }
  if (!hasWork && text.indexOf('\\') !== -1 && /\\[ \t]*(\r\n|\n|\r)/.test(text)) hasWork = true;
  if (!hasWork) return { src: text, map: null };
  const n = text.length;
  const out = [];
  const map = new Int32Array(n + 1);
  let k = 0;
  for (let i = 0; i < n; i++) {
    let ch = text[i];
    let width = 1;
    if (replaceTri && ch === '?' && text[i + 1] === '?' && TRIGRAPHS[text[i + 2]] !== undefined) {
      ch = TRIGRAPHS[text[i + 2]];
      width = 3;
    }
    if (ch === '\\') {
      let j = i + width;
      while (j < n && (text[j] === ' ' || text[j] === '\t')) j++;
      if (j < n && (text[j] === '\n' || text[j] === '\r')) {
        const p = posOf(lineStarts, i);
        const ws = j > i + width;
        splices.push({ offset: i, line: p.line, col: p.col, file, whitespace: ws });
        if (ws) diagnostics.push(diag('warning', 'lex-splice-whitespace', 'Backslash and newline separated by space', file, p.line, p.col));
        if (text[j] === '\r' && text[j + 1] === '\n') j++;
        i = j;
        continue;
      }
    }
    out.push(ch);
    map[k++] = i;
    i += width - 1;
  }
  map[k] = n;
  return { src: out.join(''), map: map.subarray(0, k + 1) };
}

function posOf(lineStarts, off) {
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1;
  }
  return { line: lo + 1, col: off - lineStarts[lo] + 1 };
}

function diag(severity, code, message, file, line, col) {
  return { severity, code, message, file, line, col };
}

function lex(text, opts = {}) {
  text = String(text == null ? '' : text);
  if (text.charCodeAt(0) === 0xfeff) text = ' ' + text.slice(1); // BOM keeps offsets
  const file = opts.file || '<input>';
  const cpp = opts.lang === 'cpp';
  const std = opts.std || '';
  const c23 = !cpp && /2x|23/.test(String(std));
  const keywords = keywordSet(opts.lang, std);
  const lineStarts = computeLineStarts(text);
  const tokens = [];
  const comments = [];
  const trigraphs = [];
  const splices = [];
  const diagnostics = [];
  const { src, map } = phase12(text, opts, file, lineStarts, trigraphs, splices, diagnostics);
  const n = src.length;
  const nLines = lineStarts.length;

  // monotone position lookup with a moving hint
  let hint = 0;
  function lineIndex(off) {
    if (off >= lineStarts[hint]) {
      while (hint + 1 < nLines && lineStarts[hint + 1] <= off) hint++;
    } else {
      while (hint > 0 && lineStarts[hint] > off) hint--;
    }
    return hint;
  }
  const orig = map ? (k) => map[k] : (k) => k;

  let bol = true;
  let space = false;

  function make(kind, value, s, e) {
    const os = orig(s);
    const oe = e > s ? orig(e - 1) + 1 : os;
    const li = lineIndex(os);
    const line = li + 1;
    const col = os - lineStarts[li] + 1;
    let endLine = line, endCol = col + (oe - os);
    if (oe - 1 > os) {
      const lj = lineIndex(oe - 1);
      endLine = lj + 1;
      endCol = oe - 1 - lineStarts[lj] + 2;
    }
    return { kind, value, line, col, endLine, endCol, start: os, end: oe, file, space, bol };
  }
  function push(t) {
    tokens.push(t);
    bol = false;
    space = false;
    return t;
  }

  let i = 0;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c === 32 || c === 9 || c === 11 || c === 12 || c === 0) { space = true; i++; continue; }
    if (c === 10 || c === 13) { bol = true; space = true; i++; continue; }
    // comments
    if (c === 47) {
      const d = src.charCodeAt(i + 1);
      if (d === 47) {
        let j = i + 2;
        while (j < n) { const e = src.charCodeAt(j); if (e === 10 || e === 13) break; j++; }
        const t = make('comment', src.slice(i, j), i, j);
        t.style = 'line';
        if (t.endLine !== t.line) t.spliced = true;
        delete t.space; delete t.bol;
        comments.push(t);
        space = true;
        i = j;
        continue;
      }
      if (d === 42) {
        let j = src.indexOf('*/', i + 2);
        let unterminated = false;
        if (j === -1) { j = n; unterminated = true; } else j += 2;
        const t = make('comment', src.slice(i, j), i, j);
        t.style = 'block';
        delete t.space; delete t.bol;
        if (unterminated) {
          t.unterminated = true;
          diagnostics.push(diag('error', 'lex-unterminated-comment', 'Unterminated /* comment', file, t.line, t.col));
        }
        comments.push(t);
        space = true;
        i = j;
        continue;
      }
    }
    // identifiers / keywords / prefixed literals
    if ((c < 128 && (CC[c] & ID_START)) || c >= 128 || (c === 92 && isUcnAt(src, i))) {
      let j = i;
      let ucn = false;
      while (j < n) {
        const e = src.charCodeAt(j);
        if (e < 128) {
          if (CC[e] & ID_CONT) { j++; continue; }
          if (e === 92) {
            const len = isUcnAt(src, j);
            if (len) { ucn = true; j += len; continue; }
          }
          break;
        }
        j++;
      }
      const word = src.slice(i, j);
      const nx = src.charCodeAt(j);
      if (nx === 34 || nx === 39) {
        if (nx === 34 && cpp && RAW_PREFIXES.has(word)) {
          const r = lexRaw(src, j);
          const t = make('string', src.slice(i, r.end), i, r.end);
          t.prefix = word.slice(0, -1);
          t.raw = true;
          if (r.unterminated) t.unterminated = true;
          i = suffix(t, r.end);
          push(t);
          continue;
        }
        if (STRING_PREFIXES.has(word)) {
          const r = lexQuoted(src, j, nx);
          const t = make(nx === 34 ? 'string' : 'char', src.slice(i, r.end), i, r.end);
          t.prefix = word;
          if (r.unterminated) t.unterminated = true;
          i = suffix(t, r.end);
          push(t);
          continue;
        }
      }
      let t;
      if (cpp && Object.prototype.hasOwnProperty.call(CPP_ALT_TOKENS, word)) {
        t = make('punct', CPP_ALT_TOKENS[word], i, j);
        t.alt = word;
      } else {
        t = make(keywords.has(word) ? 'keyword' : 'identifier', word, i, j);
        if (ucn) t.ucn = true;
      }
      push(t);
      i = j;
      continue;
    }
    // pp-numbers
    if ((c >= 48 && c <= 57) || (c === 46 && isDigit(src.charCodeAt(i + 1)))) {
      let j = i + 1;
      while (j < n) {
        const e = src.charCodeAt(j);
        if ((e === 43 || e === 45)) {
          const p = src.charCodeAt(j - 1);
          if (p === 101 || p === 69 || p === 112 || p === 80) { j++; continue; }
          break;
        }
        if (e < 128 && (CC[e] & ID_CONT)) { j++; continue; }
        if (e === 46) { j++; continue; }
        if (e === 39 && (cpp || c23) && j + 1 < n) {
          const f = src.charCodeAt(j + 1);
          if (f < 128 && (CC[f] & ID_CONT)) { j += 2; continue; }
        }
        break;
      }
      push(make('number', src.slice(i, j), i, j));
      i = j;
      continue;
    }
    if (c === 34 || c === 39) {
      const r = lexQuoted(src, i, c);
      const t = make(c === 34 ? 'string' : 'char', src.slice(i, r.end), i, r.end);
      t.prefix = '';
      if (r.unterminated) t.unterminated = true;
      i = suffix(t, r.end);
      push(t);
      continue;
    }
    const len = punctLength(src, i, c, cpp, c23);
    if (len > 0) {
      let v = src.substr(i, len);
      const t = make('punct', v, i, i + len);
      const dg = DIGRAPHS[v];
      if (dg !== undefined) { t.value = dg; t.digraph = v; }
      push(t);
      i += len;
      continue;
    }
    // stray character
    const ch = c >= 0xd800 && c <= 0xdbff ? src.slice(i, i + 2) : src[i];
    push(make('other', ch, i, i + ch.length));
    i += ch.length;
  }

  // C++ user-defined literal suffix after a string/char literal
  function suffix(t, end) {
    if (!cpp || t.unterminated) return end;
    let j = end;
    const e = src.charCodeAt(j);
    if (e < 128 && (CC[e] & ID_START)) {
      j++;
      while (j < n) { const f = src.charCodeAt(j); if (f < 128 && (CC[f] & ID_CONT)) j++; else break; }
      t.udSuffix = src.slice(end, j);
      t.value += t.udSuffix;
      const oe = orig(j - 1) + 1;
      t.end = oe;
      t.endCol += j - end;
    }
    return j;
  }

  return { tokens, comments, trigraphs, splices, diagnostics, lineStarts, file, text };
}

function isDigit(c) { return c >= 48 && c <= 57; }

function isUcnAt(src, i) {
  if (src.charCodeAt(i) !== 92) return 0;
  const k = src[i + 1];
  const len = k === 'u' ? 4 : k === 'U' ? 8 : 0;
  if (!len) return 0;
  for (let j = 0; j < len; j++) if (!isHex(src.charCodeAt(i + 2 + j))) return 0;
  return len + 2;
}

function lexQuoted(src, i, quote) {
  const n = src.length;
  let j = i + 1;
  while (j < n) {
    const e = src.charCodeAt(j);
    if (e === 92) { j += 2; continue; }
    if (e === quote) return { end: j + 1, unterminated: false };
    if (e === 10 || e === 13) break;
    j++;
  }
  return { end: Math.min(j, n), unterminated: true };
}

function lexRaw(src, q) {
  // src[q] === '"'
  const n = src.length;
  let j = q + 1;
  while (j < n && j - q - 1 <= 16 && src[j] !== '(' && !/[\s)\\]/.test(src[j])) j++;
  if (src[j] !== '(') return lexQuoted(src, q, 34);
  const delim = src.slice(q + 1, j);
  const close = ')' + delim + '"';
  const k = src.indexOf(close, j + 1);
  if (k === -1) return { end: n, unterminated: true };
  return { end: k + close.length, unterminated: false };
}

function punctLength(s, i, c, cpp, c23) {
  const d = s.charCodeAt(i + 1);
  switch (c) {
    case 91: case 93: case 40: case 41: case 123: case 125: case 63: case 126: case 44: case 59:
      return 1;
    case 46: // .
      if (d === 46 && s.charCodeAt(i + 2) === 46) return 3;
      if (cpp && d === 42) return 2;
      return 1;
    case 45: // -
      if (d === 62) return cpp && s.charCodeAt(i + 2) === 42 ? 3 : 2;
      return d === 45 || d === 61 ? 2 : 1;
    case 43: return d === 43 || d === 61 ? 2 : 1;
    case 38: return d === 38 || d === 61 ? 2 : 1;
    case 124: return d === 124 || d === 61 ? 2 : 1;
    case 42: case 47: case 61: case 33: case 94: return d === 61 ? 2 : 1;
    case 37: // %
      if (d === 58) return s.charCodeAt(i + 2) === 37 && s.charCodeAt(i + 3) === 58 ? 4 : 2;
      return d === 62 || d === 61 ? 2 : 1;
    case 60: // <
      if (d === 60) return s.charCodeAt(i + 2) === 61 ? 3 : 2;
      if (d === 61) return cpp && s.charCodeAt(i + 2) === 62 ? 3 : 2;
      if (d === 58) {
        if (cpp && s.charCodeAt(i + 2) === 58) {
          const e = s.charCodeAt(i + 3);
          if (e !== 58 && e !== 62) return 1; // <:: rule
        }
        return 2;
      }
      return d === 37 ? 2 : 1;
    case 62: // >
      if (d === 62) return s.charCodeAt(i + 2) === 61 ? 3 : 2;
      return d === 61 ? 2 : 1;
    case 58: // :
      if (d === 58 && (cpp || c23)) return 2;
      return d === 62 ? 2 : 1;
    case 35: return d === 35 ? 2 : 1;
    default: return 0;
  }
}

// ---------------------------------------------------------------- literals

const INT_SUFFIX = /^(?:[uU](?:ll|LL|l|L|z|Z|wb|WB)?|(?:ll|LL|l|L|z|Z|wb|WB)[uU]?)?$/;
const FLOAT_SUFFIX = /^(?:[fFlL]|f16|f32|f64|f128|F16|F32|F64|F128|bf16|BF16|f32x|f64x|df|dd|dl|DF|DD|DL)?$/;

// Classify a pp-number. Returns
// { kind: 'int'|'float'|'invalid', value: BigInt|number, base: 2|8|10|16, suffix, octal, udSuffix?, error? }
function classifyNumber(spelling, opts = {}) {
  const cpp = opts.lang === 'cpp';
  const s = spelling.replace(/'/g, '');
  const res = { kind: 'invalid', value: 0n, base: 10, suffix: '', octal: false, separators: s.length !== spelling.length };
  let m;
  if ((m = /^0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?(?:[pP]([+-]?[0-9]+))?(.*)$/.exec(s))) {
    res.base = 16;
    const [, ip, fp, ex, suf] = m;
    if (fp !== undefined || ex !== undefined) {
      if (ex === undefined) return { ...res, error: 'hexadecimal floating constant needs an exponent' };
      if (!ip && !fp) return { ...res, error: 'no digits in hexadecimal floating constant' };
      return floatResult(res, hexFloat(ip || '', fp || '', +ex), suf, cpp);
    }
    if (!ip) return { ...res, error: 'no digits in hexadecimal constant' };
    return intResult(res, BigInt('0x' + ip), suf, cpp);
  }
  if ((m = /^0[bB]([01]*)(.*)$/.exec(s))) {
    res.base = 2;
    if (!m[1]) return { ...res, error: 'no digits in binary constant' };
    if (/^[0-9]/.test(m[2])) return { ...res, error: 'invalid digit in binary constant' };
    return intResult(res, BigInt('0b' + m[1]), m[2], cpp);
  }
  if ((m = /^([0-9]*)(\.[0-9]*)?([eE][+-]?[0-9]*)?(.*)$/.exec(s)) && (m[1] || (m[2] && m[2].length > 1))) {
    const [, ip, fp, ex, suf] = m;
    if (fp !== undefined || ex !== undefined) {
      if (ex !== undefined && !/[0-9]$/.test(ex)) return { ...res, error: 'exponent has no digits' };
      return floatResult(res, parseFloat((ip || '0') + (fp || '') + (ex || '')), suf, cpp);
    }
    if (ip.length > 1 && ip[0] === '0') {
      res.base = 8;
      res.octal = true;
      if (/[89]/.test(ip)) return { ...res, error: 'invalid digit in octal constant' };
      return intResult(res, BigInt('0o' + ip.slice(1)), suf, cpp);
    }
    return intResult(res, BigInt(ip), suf, cpp);
  }
  return { ...res, error: 'invalid numeric constant' };
}

function intResult(res, value, suf, cpp) {
  if (INT_SUFFIX.test(suf)) return { ...res, kind: 'int', value, suffix: suf };
  if (cpp && /^_[A-Za-z0-9_]*$/.test(suf)) return { ...res, kind: 'int', value, suffix: '', udSuffix: suf };
  return { ...res, value, error: `invalid suffix "${suf}" on integer constant` };
}

function floatResult(res, value, suf, cpp) {
  if (FLOAT_SUFFIX.test(suf)) return { ...res, kind: 'float', value, suffix: suf };
  if (cpp && /^_[A-Za-z0-9_]*$/.test(suf)) return { ...res, kind: 'float', value, suffix: '', udSuffix: suf };
  return { ...res, kind: 'invalid', value, error: `invalid suffix "${suf}" on floating constant` };
}

function hexFloat(ip, fp, ex) {
  let v = 0;
  for (const ch of ip) v = v * 16 + parseInt(ch, 16);
  let scale = 1 / 16;
  for (const ch of fp) { v += parseInt(ch, 16) * scale; scale /= 16; }
  return v * Math.pow(2, ex);
}

const SIMPLE_ESC = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '\\': 92, "'": 39, '"': 34, '?': 63, e: 27 };

// Decode the body of a char/string literal (without quotes/prefix).
// Returns { codes: number[], escapes: [{kind:'simple'|'octal'|'hex'|'ucn'|'unknown', text, offset}], errors: string[] }
function decodeEscapes(body) {
  const codes = [];
  const escapes = [];
  const errors = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') {
      const cp = body.codePointAt(i);
      codes.push(cp);
      if (cp > 0xffff) i++;
      continue;
    }
    const k = body[i + 1];
    if (k === undefined) { errors.push('trailing backslash'); break; }
    if (SIMPLE_ESC[k] !== undefined) {
      codes.push(SIMPLE_ESC[k]);
      escapes.push({ kind: 'simple', text: '\\' + k, offset: i });
      i++;
      continue;
    }
    if (k >= '0' && k <= '7') {
      let j = i + 1;
      while (j < body.length && j < i + 4 && body[j] >= '0' && body[j] <= '7') j++;
      codes.push(parseInt(body.slice(i + 1, j), 8));
      escapes.push({ kind: 'octal', text: body.slice(i, j), offset: i, end: j });
      i = j - 1;
      continue;
    }
    if (k === 'x') {
      let j = i + 2;
      while (j < body.length && isHex(body.charCodeAt(j))) j++;
      if (j === i + 2) errors.push('\\x used with no following hex digits');
      codes.push(j > i + 2 ? Number(BigInt('0x' + body.slice(i + 2, j)) & 0xffffffffn) : 0);
      escapes.push({ kind: 'hex', text: body.slice(i, j), offset: i, end: j });
      i = j - 1;
      continue;
    }
    if (k === 'u' || k === 'U') {
      const len = k === 'u' ? 4 : 8;
      const hex = body.slice(i + 2, i + 2 + len);
      if (hex.length === len && /^[0-9a-fA-F]+$/.test(hex)) {
        codes.push(parseInt(hex, 16));
        escapes.push({ kind: 'ucn', text: body.slice(i, i + 2 + len), offset: i });
        i += 1 + len;
        continue;
      }
      errors.push('incomplete universal character name');
    }
    escapes.push({ kind: 'unknown', text: '\\' + k, offset: i });
    errors.push(`unknown escape sequence \\${k}`);
    codes.push(k.charCodeAt(0));
    i++;
  }
  return { codes, escapes, errors };
}

// Split a char/string token spelling into { prefix, body, raw, udSuffix }.
function literalParts(tok) {
  let v = tok.value;
  const prefix = tok.prefix || '';
  let ud = tok.udSuffix || '';
  if (ud) v = v.slice(0, -ud.length);
  let rest = v.slice(prefix.length + (tok.raw ? 1 : 0));
  if (tok.raw) {
    const open = rest.indexOf('(');
    const delim = rest.slice(1, open);
    const body = rest.slice(open + 1, rest.length - delim.length - 2);
    return { prefix, body, raw: true, udSuffix: ud };
  }
  const q = rest[0];
  let body = rest.slice(1);
  if (body.endsWith(q) && !tok.unterminated) body = body.slice(0, -1);
  return { prefix, body, raw: false, udSuffix: ud };
}

// Spelling as written (digraphs / alternative tokens restored).
function spell(tok) {
  return tok.digraph || tok.alt || tok.value;
}

function isKeyword(name, lang, std) {
  return keywordSet(lang, std).has(name);
}

module.exports = {
  lex,
  classifyNumber,
  decodeEscapes,
  literalParts,
  spell,
  keywordSet,
  isKeyword,
  computeLineStarts,
  posOf,
  C_KEYWORDS: C_KEYWORDS_17.slice(),
  C23_KEYWORDS: C_KEYWORDS_17.concat(C_KEYWORDS_23_EXTRA),
  CPP_KEYWORDS: CPP_KEYWORDS.slice(),
  GNU_KEYWORDS: GNU_KEYWORDS.slice(),
  CPP_ALT_TOKENS: { ...CPP_ALT_TOKENS },
  DIGRAPHS: { ...DIGRAPHS },
  TRIGRAPHS: { ...TRIGRAPHS },
};
