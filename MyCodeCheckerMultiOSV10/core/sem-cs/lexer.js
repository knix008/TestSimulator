'use strict';

// Tolerant C# 12 lexer. Produces tokens, comments and preprocessor facts.
// Never throws: malformed input degrades to single-character tokens.
//
// Token: { t, v, line, col, pos, end, nl }
//   t: 'id' (identifier or contextual keyword), 'kw' (reserved keyword),
//      'num', 'str', 'char', 'op', 'eof'
//   str tokens carry { sk: 'regular'|'verbatim'|'raw', interp: bool, value,
//   holes: [{ pos, end, line, col, alignPos?, fmt? }], parts: [...] , u8 }
//   nl: a line break precedes the token.

const RESERVED = new Set(('abstract as base bool break byte case catch char checked class const continue decimal default ' +
  'delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int ' +
  'interface internal is lock long namespace new null object operator out override params private protected public ' +
  'readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ' +
  'ulong unchecked unsafe ushort using virtual void volatile while').split(' '));

const PREDEFINED = new Set('bool byte char decimal double float int long object sbyte short string uint ulong ushort void nint nuint dynamic'.split(' '));

const OPS3 = ['??=', '<<=', '...'];
const OPS2 = ['??', '?.', '::', '++', '--', '&&', '||', '->', '==', '!=', '<=', '<<', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '=>', '..'];

const DEFAULT_DEFINES = ['DEBUG', 'TRACE', 'NET', 'NETCOREAPP', 'NET6_0_OR_GREATER', 'NET5_0_OR_GREATER', 'NETCOREAPP3_0_OR_GREATER'];

function isIdStart(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || (c > '\x7f' && /[\p{L}\p{Nl}]/u.test(c));
}
function isIdPart(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' ||
    (c > '\x7f' && /[\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}\p{Cf}]/u.test(c));
}
function isDigit(c) { return c >= '0' && c <= '9'; }

// Evaluate a #if expression.
function evalPp(expr, defined) {
  const toks = expr.match(/\|\||&&|==|!=|!|\(|\)|[A-Za-z_][\w]*/g) || [];
  let i = 0;
  const prim = () => {
    const t = toks[i++];
    if (t === '!') return !prim();
    if (t === '(') { const v = or(); if (toks[i] === ')') i++; return v; }
    if (t === 'true') return true;
    if (t === 'false') return false;
    return t ? defined.has(t) : false;
  };
  const eq = () => {
    let v = prim();
    while (toks[i] === '==' || toks[i] === '!=') { const op = toks[i++]; const r = prim(); v = op === '==' ? v === r : v !== r; }
    return v;
  };
  const and = () => { let v = eq(); while (toks[i] === '&&') { i++; const r = eq(); v = v && r; } return v; };
  const or = () => { let v = and(); while (toks[i] === '||') { i++; const r = and(); v = v || r; } return v; };
  try { return or(); } catch { return false; }
}

function lex(src, opts = {}) {
  const text = String(src || '');
  const n = text.length;
  const tokens = [];
  const comments = [];
  const directives = [];
  const defined = new Set(opts.defines || DEFAULT_DEFINES);
  let pos = 0;
  let line = 1;
  let lineStart = 0;
  let nl = true;
  let nullableEnabled = !!opts.nullable;
  const nullableLines = [];
  // #if stack: { active, taken, parentActive }
  const ifStack = [];
  let active = true;
  const inactiveRanges = [];
  const inactiveIds = new Set();
  let inactiveFrom = -1;

  const col = (p) => p - lineStart + 1;
  const newline = (p) => { line++; lineStart = p + 1; };

  const pushTok = (t, v, start, sl, sc, extra) => {
    const tok = { t, v, line: sl, col: sc, pos: start, end: pos, nl };
    if (extra) Object.assign(tok, extra);
    tokens.push(tok);
    nl = false;
  };

  // Scan a regular (non-verbatim) quoted body from pos (after opening quote).
  // Returns raw value; supports interpolation holes when interp.
  function scanString(verbatim, interp, braces) {
    const holes = [];
    let value = '';
    while (pos < n) {
      const c = text[pos];
      if (c === '"') {
        if (verbatim && text[pos + 1] === '"') { value += '"'; pos += 2; continue; }
        pos++;
        return { value, holes, closed: true };
      }
      if (c === '\n') {
        if (!verbatim) return { value, holes, closed: false };
        value += c; newline(pos); pos++; continue;
      }
      if (c === '\\' && !verbatim) {
        const d = text[pos + 1];
        const map = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', "'": "'", a: '\x07', b: '\b', f: '\f', v: '\v', e: '\x1b' };
        if (d in map) { value += map[d]; pos += 2; continue; }
        if (d === 'u' || d === 'x' || d === 'U') {
          let j = pos + 2; let hex = '';
          const max = d === 'U' ? 8 : 4;
          while (j < n && hex.length < max && /[0-9a-fA-F]/.test(text[j])) hex += text[j++];
          value += hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : d;
          pos = j; continue;
        }
        value += d || ''; pos += 2; continue;
      }
      if (interp && c === '{') {
        if (text[pos + 1] === '{') { value += '{'; pos += 2; continue; }
        const h = scanHole(pos + 1, verbatim, false, 1);
        holes.push({ ...h, at: value.length });
        value += '\u0000';
        continue;
      }
      if (interp && c === '}' && text[pos + 1] === '}') { value += '}'; pos += 2; continue; }
      value += c; pos++;
    }
    return { value, holes, closed: false };
  }

  // Scan an interpolation hole starting at p (just after the opening braces).
  // Leaves pos after the closing brace(s). Returns { pos, end, line, col, alignPos, fmt }.
  function scanHole(p, verbatim, raw, nbrace) {
    pos = p;
    const hl = line; const hc = col(p);
    let depth = 0;
    let alignPos = -1;
    let fmtPos = -1;
    let end = -1;
    while (pos < n) {
      const c = text[pos];
      if (c === '\n') { newline(pos); pos++; continue; }
      if (c === '"' || c === '\'' || (c === '@' && text[pos + 1] === '"') || (c === '$' && /["@$]/.test(text[pos + 1] || ''))) {
        // nested literal: lex it as a token into a scratch list
        const save = tokens.length;
        scanToken();
        tokens.length = save;
        continue;
      }
      if (c === '/' && text[pos + 1] === '*') { const e = text.indexOf('*/', pos + 2); pos = e < 0 ? n : e + 2; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; pos++; continue; }
      if ((c === ')' || c === ']') && depth > 0) { depth--; pos++; continue; }
      if (c === '}' && depth > 0) { depth--; pos++; continue; }
      if (depth === 0 && c === ',' && alignPos < 0 && fmtPos < 0) { alignPos = pos; pos++; continue; }
      if (depth === 0 && c === ':' && fmtPos < 0 && text[pos + 1] !== ':' && text[pos - 1] !== ':') {
        // format specifier: runs until the closing brace
        fmtPos = pos;
        pos++;
        while (pos < n && text[pos] !== '}' && text[pos] !== '"' && text[pos] !== '\n') pos++;
        continue;
      }
      if (c === '}' && depth === 0) {
        end = pos;
        let k = 0;
        while (k < nbrace && text[pos] === '}') { pos++; k++; }
        break;
      }
      pos++;
    }
    if (end < 0) end = pos;
    const exprEnd = alignPos >= 0 ? alignPos : fmtPos >= 0 ? fmtPos : end;
    return { pos: p, end: exprEnd, line: hl, col: hc, alignPos, fmt: fmtPos >= 0 ? text.slice(fmtPos + 1, end) : null };
  }

  function scanRaw(nq, interp, ndollar) {
    // pos is just after the opening quotes
    const holes = [];
    let value = '';
    const close = '"'.repeat(nq);
    while (pos < n) {
      if (text.startsWith(close, pos)) {
        pos += nq;
        while (text[pos] === '"') pos++;
        return { value, holes, closed: true };
      }
      const c = text[pos];
      if (c === '\n') { value += c; newline(pos); pos++; continue; }
      if (interp && c === '{') {
        let k = 0; while (text[pos + k] === '{') k++;
        if (k >= ndollar) {
          value += '{'.repeat(k - ndollar);
          const h = scanHole(pos + k, true, true, ndollar);
          holes.push({ ...h, at: value.length });
          value += '\u0000';
          continue;
        }
        value += '{'.repeat(k); pos += k; continue;
      }
      value += c; pos++;
    }
    return { value, holes, closed: false };
  }

  function scanToken() {
    const start = pos; const sl = line; const sc = col(pos);
    const c = text[pos];
    // strings
    if (c === '"' || ((c === '@' || c === '$') && /["@$]/.test(text[pos + 1] || ''))) {
      let j = pos; let dollars = 0; let verbatim = false;
      while (text[j] === '$' || text[j] === '@') { if (text[j] === '$') dollars++; else verbatim = true; j++; }
      if (text[j] !== '"') { pos++; pushTok('op', c, start, sl, sc); return; }
      let q = 0; while (text[j + q] === '"') q++;
      let res; let sk;
      if (q >= 3 && !verbatim) {
        pos = j + q; sk = 'raw';
        res = scanRaw(q, dollars > 0, Math.max(1, dollars));
      } else {
        pos = j + 1; sk = verbatim ? 'verbatim' : 'regular';
        res = scanString(verbatim, dollars > 0, 1);
      }
      let u8 = false;
      if ((text[pos] === 'u' || text[pos] === 'U') && text[pos + 1] === '8') { u8 = true; pos += 2; }
      pushTok('str', text.slice(start, pos), start, sl, sc, { sk, interp: dollars > 0, value: res.value, holes: res.holes, u8, unclosed: !res.closed });
      return;
    }
    if (c === '\'') {
      pos++;
      let value = '';
      if (text[pos] === '\\') {
        const d = text[pos + 1];
        const map = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', "'": "'", a: '\x07', b: '\b', f: '\f', v: '\v' };
        if (d in map) { value = map[d]; pos += 2; } else if (d === 'u' || d === 'x' || d === 'U') {
          let k = pos + 2; let hex = '';
          while (k < n && hex.length < 8 && /[0-9a-fA-F]/.test(text[k])) hex += text[k++];
          value = hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : d; pos = k;
        } else { value = d || ''; pos += 2; }
      } else if (pos < n && text[pos] !== '\n') { value = text[pos]; pos++; }
      if (text[pos] === '\'') pos++;
      else { // not a char literal after all: skip to end of line or quote
        while (pos < n && text[pos] !== '\'' && text[pos] !== '\n') pos++;
        if (text[pos] === '\'') pos++;
      }
      pushTok('char', text.slice(start, pos), start, sl, sc, { value });
      return;
    }
    if (isDigit(c) || (c === '.' && isDigit(text[pos + 1] || ''))) {
      let j = pos;
      let real = false;
      if (c === '0' && (text[j + 1] === 'x' || text[j + 1] === 'X')) {
        j += 2; while (j < n && /[0-9a-fA-F_]/.test(text[j])) j++;
      } else if (c === '0' && (text[j + 1] === 'b' || text[j + 1] === 'B')) {
        j += 2; while (j < n && /[01_]/.test(text[j])) j++;
      } else {
        while (j < n && (isDigit(text[j]) || text[j] === '_')) j++;
        if (text[j] === '.' && isDigit(text[j + 1] || '')) { real = true; j++; while (j < n && (isDigit(text[j]) || text[j] === '_')) j++; }
        if ((text[j] === 'e' || text[j] === 'E') && /[0-9+-]/.test(text[j + 1] || '')) {
          real = true; j++; if (text[j] === '+' || text[j] === '-') j++; while (j < n && isDigit(text[j])) j++;
        }
      }
      let suffix = '';
      while (j < n && /[uUlLfFdDmM]/.test(text[j]) && suffix.length < 2) suffix += text[j++];
      if (/[fFdDmM]/.test(suffix)) real = true;
      pos = j;
      const raw = text.slice(start, pos);
      pushTok('num', raw, start, sl, sc, { real, suffix: suffix.toLowerCase(), value: numValue(raw, suffix) });
      return;
    }
    if (c === '@' && isIdStart(text[pos + 1] || '')) {
      pos++;
      while (pos < n && isIdPart(text[pos])) pos++;
      pushTok('id', text.slice(start + 1, pos), start, sl, sc, { verbatim: true });
      return;
    }
    if (isIdStart(c) || c === '\\') {
      if (c === '\\') { pos++; pushTok('op', c, start, sl, sc); return; }
      pos++;
      while (pos < n && isIdPart(text[pos])) pos++;
      const v = text.slice(start, pos);
      pushTok(RESERVED.has(v) ? 'kw' : 'id', v, start, sl, sc);
      return;
    }
    for (const op of OPS3) if (text.startsWith(op, pos)) { pos += 3; pushTok('op', op, start, sl, sc); return; }
    if (c !== '>') {
      for (const op of OPS2) if (text.startsWith(op, pos)) {
        // '?.' followed by a digit is '?' then '.5'
        if (op === '?.' && isDigit(text[pos + 2] || '')) break;
        pos += 2; pushTok('op', op, start, sl, sc); return;
      }
    }
    pos++;
    pushTok('op', c, start, sl, sc);
  }

  function numValue(raw, suffix) {
    let s = raw.replace(/_/g, '');
    if (suffix) s = s.slice(0, s.length - suffix.length);
    if (/^0[xX]/.test(s)) return parseInt(s.slice(2), 16);
    if (/^0[bB]/.test(s)) return parseInt(s.slice(2), 2);
    const v = Number(s);
    return Number.isFinite(v) ? v : NaN;
  }

  function directive() {
    // pos at '#'
    const start = pos; const sl = line;
    let e = text.indexOf('\n', pos);
    if (e < 0) e = n;
    let body = text.slice(pos + 1, e);
    const ci = body.indexOf('//');
    if (ci >= 0 && !/^\s*(region|endregion|error|warning|pragma)/.test(body)) body = body.slice(0, ci);
    body = body.replace(/\r$/, '').trim();
    const m = /^(\w+)\s*(.*)$/.exec(body) || ['', '', ''];
    const name = m[1]; const arg = m[2].trim();
    pos = e;
    directives.push({ name, arg, line: sl, pos: start });
    const wasActive = active;
    switch (name) {
      case 'if': {
        const cond = active && evalPp(arg, defined);
        ifStack.push({ parentActive: active, taken: cond });
        active = cond;
        break;
      }
      case 'elif': {
        const top = ifStack[ifStack.length - 1];
        if (!top) break;
        const cond = top.parentActive && !top.taken && evalPp(arg, defined);
        if (cond) top.taken = true;
        active = cond;
        break;
      }
      case 'else': {
        const top = ifStack[ifStack.length - 1];
        if (!top) break;
        active = top.parentActive && !top.taken;
        top.taken = true;
        break;
      }
      case 'endif': {
        const top = ifStack.pop();
        active = top ? top.parentActive : true;
        break;
      }
      case 'define': if (active) defined.add(arg.split(/\s/)[0]); break;
      case 'undef': if (active) defined.delete(arg.split(/\s/)[0]); break;
      case 'nullable':
        if (active) {
          if (/^enable/.test(arg)) { nullableEnabled = true; nullableLines.push({ line: sl, on: true }); }
          else if (/^(disable|restore)/.test(arg)) { nullableLines.push({ line: sl, on: false }); }
        }
        break;
      default: break;
    }
    if (wasActive && !active) inactiveFrom = sl;
    if (!wasActive && active && inactiveFrom >= 0) { inactiveRanges.push([inactiveFrom, sl]); inactiveFrom = -1; }
  }

  while (pos < n) {
    const c = text[pos];
    if (c === '\n') { newline(pos); pos++; nl = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '﻿' || c === ' ') { pos++; continue; }
    // preprocessor directive: '#' first on its line
    if (c === '#') {
      let k = pos - 1;
      while (k >= lineStart && (text[k] === ' ' || text[k] === '\t' || text[k] === '﻿')) k--;
      if (k < lineStart) { directive(); continue; }
    }
    if (!active) {
      // skip the whole inactive line
      const e = text.indexOf('\n', pos);
      const ids = text.slice(pos, e < 0 ? n : e).match(/[A-Za-z_][A-Za-z0-9_]*/g);
      if (ids) for (const id of ids) inactiveIds.add(id);
      pos = e < 0 ? n : e;
      continue;
    }
    if (c === '/' && text[pos + 1] === '/') {
      const sl = line; const sc = col(pos);
      let e = text.indexOf('\n', pos);
      if (e < 0) e = n;
      comments.push({ text: text.slice(pos, e).replace(/\r$/, ''), line: sl, col: sc, endLine: sl, block: false, doc: text[pos + 2] === '/' && text[pos + 3] !== '/', ownLine: nl });
      pos = e;
      continue;
    }
    if (c === '/' && text[pos + 1] === '*') {
      const sl = line; const sc = col(pos); const own = nl;
      let e = text.indexOf('*/', pos + 2);
      e = e < 0 ? n : e + 2;
      for (let k = pos; k < e; k++) if (text[k] === '\n') newline(k);
      comments.push({ text: text.slice(pos, e), line: sl, col: sc, endLine: line, block: true, doc: text[pos + 2] === '*' && text[pos + 3] !== '/', ownLine: own });
      pos = e;
      continue;
    }
    try {
      scanToken();
    } catch {
      pos++;
    }
  }
  if (!active && inactiveFrom >= 0) inactiveRanges.push([inactiveFrom, line]);
  tokens.push({ t: 'eof', v: '', line, col: col(pos), pos: n, end: n, nl: true });
  return { tokens, comments, directives, nullableEnabled, nullableLines, inactiveRanges, inactiveIds, lineCount: line };
}

module.exports = { lex, RESERVED, PREDEFINED };
