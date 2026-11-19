// Tokenizer for Wireshark display filters.
// Fields and unparsed literals share one token kind ('word'); the compiler decides which it is,
// as Wireshark does. Keywords are case-sensitive (Wireshark rejects "AND").
import { FILTER_ERRORS as E, FilterError } from './errors.js';

const KEYWORDS = {
  and: ['and'], or: ['or'], xor: ['xor'], not: ['not'], in: ['in'], any: ['any'], all: ['all'],
  eq: ['cmp', 'eq'], ne: ['cmp', 'ne'], gt: ['cmp', 'gt'], lt: ['cmp', 'lt'], ge: ['cmp', 'ge'], le: ['cmp', 'le'],
  any_eq: ['cmp', 'eq'], all_ne: ['cmp', 'ne'], all_eq: ['cmp', 'all_eq'], any_ne: ['cmp', 'any_ne'],
  contains: ['cmp', 'contains'], matches: ['cmp', 'matches'], bitwise_and: ['arith', '&'],
};

// Longest first.
const PUNCT = [
  ['===', 'cmp', 'all_eq'], ['!==', 'cmp', 'any_ne'],
  ['==', 'cmp', 'eq'], ['!=', 'cmp', 'ne'], ['~=', 'cmp', 'any_ne', true], ['<=', 'cmp', 'le'], ['>=', 'cmp', 'ge'],
  ['&&', 'and'], ['||', 'or'], ['^^', 'xor'], ['..', 'dotdot'],
  ['<', 'cmp', 'lt'], ['>', 'cmp', 'gt'], ['!', 'not'], ['~', 'cmp', 'matches'],
  ['&', 'arith', '&'], ['+', 'arith', '+'], ['-', 'arith', '-'], ['*', 'arith', '*'], ['/', 'arith', '/'], ['%', 'arith', '%'],
  ['(', 'lp'], [')', 'rp'], ['{', 'lbrace'], ['}', 'rbrace'], [',', 'comma'], ['#', 'hash'],
];

const isWordChar = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === ':' || c === '.';
const isAlnum = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
const isHex = (c) => /^[0-9a-fA-F]$/.test(c || '');
const isDigit = (c) => c >= '0' && c <= '9';
const IPV4ISH = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6ISH = /^[0-9a-fA-F:.]*:[0-9a-fA-F:.]*$/;
const BYTEDASH = /^[0-9a-fA-F]{2}(-[0-9a-fA-F]{2})*$/;

const UTF8 = new TextEncoder();

/**
 * Tokenize. Token: { t, v, at, end, text, dep? }.
 *   t: 'word' | 'str' (v: {bytes, str}) | 'char' (v: code) | 'ref' (v: field name)
 *      | 'cmp' (v: op) | 'arith' (v: op) | 'and' | 'or' | 'xor' | 'not' | 'in' | 'any' | 'all'
 *      | 'lp' | 'rp' | 'lbrace' | 'rbrace' | 'comma' | 'dotdot' | 'hash' | 'slice' (v: raw text) | 'eof'
 */
export function tokenize(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    const at = i;
    // strings
    if (c === '"' || ((c === 'r' || c === 'R') && src[i + 1] === '"')) {
      const raw = c !== '"';
      const r = readString(src, raw ? i + 1 : i, raw);
      out.push({ t: 'str', v: r.value, at, end: r.end, text: src.slice(at, r.end), raw });
      i = r.end;
      continue;
    }
    if (c === "'") {
      const r = readChar(src, i);
      out.push({ t: 'char', v: r.value, at, end: r.end, text: src.slice(at, r.end) });
      i = r.end;
      continue;
    }
    if (c === '[') {
      const close = src.indexOf(']', i + 1);
      if (close < 0) throw new FilterError(E.UNCLOSED_SLICE, 'The right bracket was missing from a slice.', at, n);
      out.push({ t: 'slice', v: src.slice(i + 1, close), at, end: close + 1, text: src.slice(at, close + 1) });
      i = close + 1;
      continue;
    }
    if (c === '$') {
      if (src[i + 1] === '{') {
        const close = src.indexOf('}', i + 2);
        if (close < 0) throw new FilterError(E.BAD_REFERENCE, 'Missing closing brace in field reference.', at, n);
        const name = src.slice(i + 2, close).trim();
        if (!/^[A-Za-z0-9_.\-#]+$/.test(name)) throw new FilterError(E.BAD_REFERENCE, 'Invalid character in field reference.', at, close + 1);
        out.push({ t: 'ref', v: name, at, end: close + 1, text: src.slice(at, close + 1) });
        i = close + 1;
        continue;
      }
      let j = i + 1;
      while (j < n && (isWordChar(src[j]) || src[j] === '-')) j++;
      if (j === i + 1) throw new FilterError(E.BAD_REFERENCE, 'Invalid field reference.', at, at + 1);
      out.push({ t: 'ref', v: src.slice(i + 1, j), at, end: j, text: src.slice(at, j) });
      i = j;
      continue;
    }
    // '@field' (raw bytes of a field)
    if (c === '@' && isWordChar(src[i + 1] || '')) {
      const w = readWord(src, i + 1);
      out.push({ t: 'word', v: w.text, at, end: w.end, text: src.slice(at, w.end), rawBytes: true });
      i = w.end;
      continue;
    }
    // words (fields, keywords, unparsed literals: numbers, addresses, byte strings, names)
    if (isWordChar(c) && !(c === '.' && src[i + 1] === '.')) {
      const w = readWord(src, i);
      const text = w.text;
      const kw = Object.prototype.hasOwnProperty.call(KEYWORDS, text) ? KEYWORDS[text] : null;
      if (kw) out.push({ t: kw[0], v: kw[1], at, end: w.end, text, dep: text === 'bitwise_and' ? false : undefined });
      else out.push({ t: 'word', v: text, at, end: w.end, text });
      i = w.end;
      continue;
    }
    let hit = null;
    for (const p of PUNCT) if (src.startsWith(p[0], i)) { hit = p; break; }
    if (!hit) {
      throw new FilterError(E.UNEXPECTED_TOKEN, `"${c}" was unexpected in this context.`, at, at + 1);
    }
    // '|' alone is not an operator (Wireshark: "|" was unexpected); '||' handled above.
    const tok = { t: hit[1], v: hit[2], at, end: i + hit[0].length, text: hit[0] };
    if (hit[3]) tok.deprecated = `"${hit[0]}" is deprecated; use "!==" (any not equal) instead.`;
    out.push(tok);
    i += hit[0].length;
  }
  out.push({ t: 'eof', at: n, end: n, text: '' });
  return out;
}

function readWord(src, i) {
  const n = src.length;
  let j = i;
  // A MAC/byte string with '-' separators is one word ("00-11-22-33-44-55").
  const guid = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/.exec(src.slice(i));
  if (guid && !isWordChar(src[i + guid[0].length] || ' ')) return { text: guid[0], end: i + guid[0].length };
  const dash = /^[0-9A-Fa-f]{2}(?:-[0-9A-Fa-f]{2})+/.exec(src.slice(i));
  if (dash && !isWordChar(src[i + dash[0].length] || ' ')) return { text: dash[0], end: i + dash[0].length };
  while (j < n) {
    const c = src[j];
    if (c === '.') {
      if (src[j + 1] === '.') break;       // set range "1..5"
      j++;
      continue;
    }
    if (isWordChar(c)) { j++; continue; }
    if (c === '-') {
      // inside names ("a-b") and dash byte strings, but not "tcp.len-1" (arithmetic)
      const sofar = src.slice(i, j);
      const next = src[j + 1] || '';
      if (j > i && isAlnum(src[j - 1]) && (/[A-Za-z_]/.test(next) || (BYTEDASH.test(sofar.slice(-2)) && BYTEDASH.test(sofar) && isHex(next) && isHex(src[j + 2])))) { j++; continue; }
      break;
    }
    if (c === '/') {
      // CIDR suffix of an address ("10.0.0.0/8", "fe80::/10"); otherwise division
      const sofar = src.slice(i, j);
      if ((IPV4ISH.test(sofar) || IPV6ISH.test(sofar)) && isDigit(src[j + 1] || '')) {
        j++;
        while (j < n && isDigit(src[j])) j++;
        break;
      }
      break;
    }
    break;
  }
  return { text: src.slice(i, j), end: j };
}

/** Parse "..." (or r"..."); returns { value: { bytes: Uint8Array, str }, end }. */
function readString(src, i, raw) {
  const bytes = [];
  let j = i + 1;
  const n = src.length;
  const pushStr = (s) => { for (const b of UTF8.encode(s)) bytes.push(b); };
  while (j < n) {
    const c = src[j];
    if (c === '"') {
      const arr = Uint8Array.from(bytes);
      return { value: { bytes: arr, str: new TextDecoder().decode(arr) }, end: j + 1 };
    }
    if (c === '\\') {
      const e = src[j + 1];
      if (e === undefined) break;
      if (raw) { // raw strings keep the backslash; \" does not end the string
        pushStr('\\' + e);
        j += 2;
        continue;
      }
      const r = escape(src, j);
      if (r.byte !== undefined) bytes.push(r.byte); else pushStr(r.str);
      j = r.end;
      continue;
    }
    const cp = src.codePointAt(j);
    const ch = String.fromCodePoint(cp);
    pushStr(ch);
    j += ch.length;
  }
  throw new FilterError(E.UNCLOSED_STRING, 'The string was not terminated.', i, n);
}

const SIMPLE_ESC = { n: '\n', r: '\r', t: '\t', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'", '?': '?' };

function escape(src, j) {
  const e = src[j + 1];
  if (SIMPLE_ESC[e] !== undefined) return { str: SIMPLE_ESC[e], end: j + 2 };
  if (e === 'x') {
    const m = /^[0-9a-fA-F]{1,2}/.exec(src.slice(j + 2));
    if (!m) throw new FilterError(E.BAD_ESCAPE, `\\x is not a valid character escape sequence`, j, j + 2);
    return { byte: parseInt(m[0], 16), end: j + 2 + m[0].length };
  }
  if (e >= '0' && e <= '7') {
    const m = /^[0-7]{1,3}/.exec(src.slice(j + 1));
    return { byte: parseInt(m[0], 8) & 255, end: j + 1 + m[0].length };
  }
  if (e === 'u' || e === 'U') {
    const len = e === 'u' ? 4 : 8;
    const h = src.slice(j + 2, j + 2 + len);
    if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(h)) throw new FilterError(E.BAD_ESCAPE, `\\${e}${h} is not a valid universal character name`, j, j + 2 + h.length);
    return { str: String.fromCodePoint(parseInt(h, 16)), end: j + 2 + len };
  }
  throw new FilterError(E.BAD_ESCAPE, `\\${e} is not a valid character escape sequence`, j, j + 2);
}

function readChar(src, i) {
  let j = i + 1;
  let value;
  if (src[j] === '\\') {
    const r = escape(src, j);
    value = r.byte !== undefined ? r.byte : r.str.codePointAt(0);
    j = r.end;
  } else if (j < src.length && src[j] !== "'") {
    value = src.codePointAt(j);
    j += String.fromCodePoint(value).length;
  }
  if (src[j] !== "'" || value === undefined) {
    const close = src.indexOf("'", i + 1);
    const end = close < 0 ? src.length : close + 1;
    throw new FilterError(E.BAD_CHAR, `${src.slice(i, end)} is not a valid character constant.`, i, end);
  }
  return { value, end: j + 1 };
}
