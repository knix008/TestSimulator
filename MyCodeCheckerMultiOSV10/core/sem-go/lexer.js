'use strict';

// Tolerant Go lexer. Produces tokens with 1-based line/col and applies the
// automatic semicolon insertion rule of the Go spec: a newline (or EOF, or a
// block comment spanning lines) after an identifier, a literal, one of the
// keywords break/continue/fallthrough/return, or one of ++ -- ) ] } becomes
// a ';' token marked auto. Never throws; unknown characters become 'bad'.
//
// Token: { t, v, line, col, pos, end, endLine, endCol, auto? }
//   t: 'id' | 'kw' | 'int' | 'float' | 'imag' | 'char' | 'str' | 'op' | 'bad' | 'eof'
//   for 'str' and 'char' tokens: raw (source text) and s (decoded value)

const KEYWORDS = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough',
  'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range',
  'return', 'select', 'struct', 'switch', 'type', 'var',
]);

const OPS = [
  '<<=', '>>=', '&^=', '...',
  '&&', '||', '<-', '++', '--', '==', '!=', '<=', '>=', ':=', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '<<', '>>', '&^',
  '+', '-', '*', '/', '%', '&', '|', '^', '<', '>', '=', '!', '~', '(', ')', '[', ']', '{', '}',
  ',', ';', '.', ':',
];

const SEMI_AFTER_KW = new Set(['break', 'continue', 'fallthrough', 'return']);
const SEMI_AFTER_OP = new Set(['++', '--', ')', ']', '}']);

function isLetter(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || (c > '\x7f' && /[\p{L}]/u.test(c));
}
function isDigit(c) { return c >= '0' && c <= '9'; }
function isIdentChar(c) { return isLetter(c) || isDigit(c) || (c > '\x7f' && /[\p{Nd}]/u.test(c)); }

function decodeEscapes(body) {
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== '\\') { out += c; continue; }
    const n = body[++i];
    switch (n) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case 'a': out += '\x07'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case '\\': out += '\\'; break;
      case '"': out += '"'; break;
      case '\'': out += '\''; break;
      case 'x': out += String.fromCharCode(parseInt(body.substr(i + 1, 2), 16) || 0); i += 2; break;
      case 'u': out += safeCp(parseInt(body.substr(i + 1, 4), 16)); i += 4; break;
      case 'U': out += safeCp(parseInt(body.substr(i + 1, 8), 16)); i += 8; break;
      default:
        if (n >= '0' && n <= '7') { out += String.fromCharCode(parseInt(body.substr(i, 3), 8) || 0); i += 2; } else if (n !== undefined) out += n;
    }
  }
  return out;
}
function safeCp(n) {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return '�';
  return String.fromCodePoint(n);
}

function lex(src) {
  const text = String(src || '');
  const toks = [];
  const comments = [];
  const n = text.length;
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let last = null; // last significant token (for semicolon insertion)

  const needSemi = () => {
    if (!last) return false;
    if (last.t === 'id' || last.t === 'int' || last.t === 'float' || last.t === 'imag' || last.t === 'char' || last.t === 'str') return true;
    if (last.t === 'kw') return SEMI_AFTER_KW.has(last.v);
    if (last.t === 'op') return SEMI_AFTER_OP.has(last.v);
    return false;
  };
  const autoSemi = (pos, ln, col) => {
    if (needSemi()) {
      const t = { t: 'op', v: ';', auto: true, line: ln, col, pos, end: pos, endLine: ln, endCol: col };
      toks.push(t);
      last = t;
    }
  };
  const push = (t, v, start, sl, sc, extra) => {
    const tok = { t, v, line: sl, col: sc, pos: start, end: i, endLine: line, endCol: i - lineStart + 1 };
    if (extra) Object.assign(tok, extra);
    toks.push(tok);
    last = tok;
    return tok;
  };

  while (i < n) {
    const c = text[i];
    if (c === '\n') {
      autoSemi(i, line, i - lineStart + 1);
      i++; line++; lineStart = i;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '﻿') { i++; continue; }
    const start = i;
    const sl = line;
    const sc = i - lineStart + 1;
    if (c === '/' && text[i + 1] === '/') {
      let j = text.indexOf('\n', i);
      if (j < 0) j = n;
      comments.push({ text: text.slice(i + 2, j).replace(/\r$/, ''), line: sl, col: sc, block: false, endLine: sl });
      i = j;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      let j = text.indexOf('*/', i + 2);
      if (j < 0) j = n; else j += 2;
      const body = text.slice(i + 2, Math.max(i + 2, j - 2));
      let nl = false;
      for (let k = i; k < j; k++) if (text[k] === '\n') { nl = true; line++; lineStart = k + 1; }
      comments.push({ text: body, line: sl, col: sc, block: true, endLine: line });
      if (nl) autoSemi(start, sl, sc);
      i = j;
      continue;
    }
    if (isLetter(c)) {
      let j = i + 1;
      while (j < n && isIdentChar(text[j])) j++;
      const word = text.slice(i, j);
      i = j;
      push(KEYWORDS.has(word) ? 'kw' : 'id', word, start, sl, sc);
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(text[i + 1] || ''))) {
      lexNumber();
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"' && text[j] !== '\n') { if (text[j] === '\\') j++; j++; }
      const closed = j < n && text[j] === '"';
      const raw = text.slice(i, closed ? j + 1 : j);
      i = closed ? j + 1 : j;
      push('str', raw, start, sl, sc, { raw, s: decodeEscapes(raw.slice(1, closed ? -1 : undefined)), bad: !closed });
      continue;
    }
    if (c === '`') {
      let j = text.indexOf('`', i + 1);
      const closed = j >= 0;
      if (!closed) j = n;
      for (let k = i + 1; k < j; k++) if (text[k] === '\n') { line++; lineStart = k + 1; }
      const raw = text.slice(i, closed ? j + 1 : j);
      i = closed ? j + 1 : j;
      push('str', raw, start, sl, sc, { raw, s: raw.slice(1, closed ? -1 : undefined).replace(/\r/g, ''), rawString: true, bad: !closed });
      continue;
    }
    if (c === '\'') {
      let j = i + 1;
      while (j < n && text[j] !== '\'' && text[j] !== '\n') { if (text[j] === '\\') j++; j++; }
      const closed = j < n && text[j] === '\'';
      const raw = text.slice(i, closed ? j + 1 : j);
      i = closed ? j + 1 : j;
      push('char', raw, start, sl, sc, { raw, s: decodeEscapes(raw.slice(1, closed ? -1 : undefined)), bad: !closed });
      continue;
    }
    let op = null;
    for (const o of OPS) {
      if (text.startsWith(o, i)) { op = o; break; }
    }
    if (op) {
      i += op.length;
      push('op', op, start, sl, sc);
      continue;
    }
    i++;
    push('bad', c, start, sl, sc);
  }
  autoSemi(n, line, n - lineStart + 1);
  toks.push({ t: 'eof', v: '', line, col: n - lineStart + 1, pos: n, end: n, endLine: line, endCol: n - lineStart + 1 });
  return { tokens: toks, comments };

  function lexNumber() {
    const start = i;
    const sl = line;
    const sc = i - lineStart + 1;
    let kind = 'int';
    const c0 = text[i];
    const c1 = (text[i + 1] || '').toLowerCase();
    const digitsWhile = (re) => { while (i < n && (re.test(text[i]) || text[i] === '_')) i++; };
    if (c0 === '0' && (c1 === 'x' || c1 === 'b' || c1 === 'o')) {
      i += 2;
      if (c1 === 'x') {
        digitsWhile(/[0-9a-fA-F]/);
        if (text[i] === '.') { kind = 'float'; i++; digitsWhile(/[0-9a-fA-F]/); }
        if (text[i] === 'p' || text[i] === 'P') {
          kind = 'float'; i++;
          if (text[i] === '+' || text[i] === '-') i++;
          digitsWhile(/[0-9]/);
        }
      } else digitsWhile(c1 === 'b' ? /[01]/ : /[0-7]/);
    } else {
      digitsWhile(/[0-9]/);
      if (text[i] === '.' && text[i + 1] !== '.') { kind = 'float'; i++; digitsWhile(/[0-9]/); }
      if (text[i] === 'e' || text[i] === 'E') {
        const save = i;
        i++;
        if (text[i] === '+' || text[i] === '-') i++;
        if (isDigit(text[i] || '')) { kind = 'float'; digitsWhile(/[0-9]/); } else i = save;
      }
    }
    if (text[i] === 'i') { kind = 'imag'; i++; }
    const v = text.slice(start, i);
    const tok = { t: kind, v, line: sl, col: sc, pos: start, end: i, endLine: line, endCol: i - lineStart + 1 };
    toks.push(tok);
    last = tok;
  }
}

function numValue(raw) {
  const s = String(raw).replace(/_/g, '');
  if (/^0[xX]/.test(s) && !/[.pP]/.test(s)) return parseInt(s.slice(2), 16);
  if (/^0[bB]/.test(s)) return parseInt(s.slice(2), 2);
  if (/^0[oO]/.test(s)) return parseInt(s.slice(2), 8);
  if (/^0[0-7]+$/.test(s)) return parseInt(s.slice(1), 8);
  const v = Number(s.replace(/i$/, ''));
  return Number.isFinite(v) ? v : NaN;
}

module.exports = { lex, numValue, KEYWORDS };
