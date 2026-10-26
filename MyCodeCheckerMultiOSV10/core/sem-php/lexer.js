'use strict';

// Tolerant PHP lexer. Handles inline HTML outside <?php ?>, short open tags,
// <?= (emitted as an `echo` token), line/block/doc comments, `#[` attributes,
// single / double quoted strings with interpolation, heredoc / nowdoc,
// backtick shell strings, casts, namespaced names and every PHP 8 operator.
//
// Token: { t, v, line, col, pos, end, sp, nl }
//   t: 'var' | 'id' | 'num' | 'str' | 'tpl' | 'shell' | 'cast' | 'op' | 'html' | 'eof'
//   'tpl' / 'shell' carry parts: [{ s: 'literal' } | { code, line, col }]
//   sp: whitespace before the token, nl: newline before the token.

const CASTS = new Set(['int', 'integer', 'bool', 'boolean', 'float', 'double', 'real', 'string', 'array', 'object', 'unset', 'binary']);
const OPS = [
  '**=', '...', '<=>', '===', '!==', '<<=', '>>=', '??=', '?->',
  '++', '--', '->', '=>', '::', '==', '!=', '<>', '<=', '>=', '&&', '||', '??', '+=', '-=', '*=', '/=', '.=', '%=', '&=', '|=', '^=', '<<', '>>', '**', '#[',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '.', '&', '|', '^', '~', '?', ':', ';', ',', '(', ')', '[', ']', '{', '}', '@', '$', '\\',
];

const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || (c >= '\x80' && c !== '﻿');
const isIdChar = (c) => isIdStart(c) || (c >= '0' && c <= '9');
const isDigit = (c) => c >= '0' && c <= '9';
const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';

function lineStartsOf(src) {
  const out = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) out.push(i + 1);
  return out;
}

function makeLC(starts) {
  return (pos) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, col: pos - starts[lo] + 1 };
  };
}

// Unescape a double-quoted literal segment (approximate, enough for analysis).
function unescapeDq(s) {
  if (s.indexOf('\\') < 0) return s;
  return s.replace(/\\(n|t|r|v|e|f|\\|\$|"|[0-7]{1,3}|x[0-9A-Fa-f]{1,2}|u\{[0-9A-Fa-f]+\})/g, (m, g) => {
    switch (g[0]) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'v': return '\v';
      case 'e': return '\x1b';
      case 'f': return '\f';
      case '\\': return '\\';
      case '$': return '$';
      case '"': return '"';
      case 'x': return String.fromCharCode(parseInt(g.slice(1), 16));
      case 'u': { const cp = parseInt(g.slice(2, -1), 16); return cp <= 0x10ffff ? String.fromCodePoint(cp) : m; }
      default: return String.fromCharCode(parseInt(g, 8) & 255);
    }
  });
}

function matchBrace(src, i, end) {
  // src[i] === '{' ; returns index of matching '}' (or -1)
  let depth = 0;
  for (let k = i; k < end; k++) {
    const c = src[k];
    if (c === '\'' || c === '"') {
      const q = c;
      k++;
      while (k < end && src[k] !== q) { if (src[k] === '\\') k++; k++; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return k; }
  }
  return -1;
}

// Split an interpolated body [from, to) into literal and code parts.
function interpolate(src, from, to, lc, quote, posOff) {
  posOff = posOff || 0;
  const parts = [];
  let lit = '';
  let litStart = from;
  const flush = () => { if (lit) parts.push({ s: unescapeDq(lit) }); lit = ''; };
  let i = from;
  while (i < to) {
    const c = src[i];
    if (c === '\\' && i + 1 < to) {
      // keep escapes for unescapeDq; \$ prevents interpolation
      if (quote === '\'') { lit += c; i++; continue; }
      lit += c + src[i + 1];
      i += 2;
      continue;
    }
    if (c === '$' && i + 1 < to && isIdStart(src[i + 1])) {
      flush();
      let k = i + 1;
      while (k < to && isIdChar(src[k])) k++;
      let code = src.slice(i, k);
      if (src[k] === '[') {
        const close = src.indexOf(']', k);
        if (close > 0 && close < to) {
          let key = src.slice(k + 1, close);
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) key = `'${key}'`;
          code += `[${key}]`;
          k = close + 1;
        }
      } else if (src.startsWith('->', k) && isIdStart(src[k + 2] || '')) {
        let e = k + 2;
        while (e < to && isIdChar(src[e])) e++;
        code += src.slice(k, e);
        k = e;
      } else if (src.startsWith('?->', k) && isIdStart(src[k + 3] || '')) {
        let e = k + 3;
        while (e < to && isIdChar(src[e])) e++;
        code += src.slice(k, e);
        k = e;
      }
      const at = lc(i);
      parts.push({ code, line: at.line, col: at.col, pos: i + posOff });
      i = k;
      litStart = i;
      continue;
    }
    if (c === '{' && src[i + 1] === '$') {
      const close = matchBrace(src, i, to);
      if (close > 0) {
        flush();
        const at = lc(i + 1);
        parts.push({ code: src.slice(i + 1, close), line: at.line, col: at.col, pos: i + 1 + posOff });
        i = close + 1;
        litStart = i;
        continue;
      }
    }
    if (c === '$' && src[i + 1] === '{') {
      const close = matchBrace(src, i + 1, to);
      if (close > 0) {
        flush();
        const inner = src.slice(i + 2, close);
        const at = lc(i);
        const code = /^[A-Za-z_][A-Za-z0-9_]*(\[.*\])?$/.test(inner) ? '$' + inner : '${' + inner + '}';
        parts.push({ code, line: at.line, col: at.col, pos: i + posOff });
        i = close + 1;
        litStart = i;
        continue;
      }
    }
    lit += c;
    i++;
  }
  void litStart;
  flush();
  return parts;
}

// opts.php: start in PHP mode (for interpolation snippets); opts.line/col: base position
function lex(src, opts = {}) {
  src = String(src == null ? '' : src);
  const n = src.length;
  const starts = lineStartsOf(src);
  const lc0 = makeLC(starts);
  const baseLine = opts.line || 1;
  const baseCol = opts.col || 1;
  const posBase = opts.pos || 0;
  const lc = (baseLine === 1 && baseCol === 1) ? lc0 : (pos) => {
    const r = lc0(pos);
    return r.line === 1 ? { line: baseLine, col: baseCol + r.col - 1 } : { line: baseLine + r.line - 1, col: r.col };
  };
  const tokens = [];
  const comments = [];
  const info = {
    bom: src.charCodeAt(0) === 0xfeff,
    firstOpen: -1,
    leading: '',
    shortTags: [],
    closeTags: [],
    html: 0,
    trailingClose: null,
    errors: [],
  };
  let sp = false;
  let nl = false;
  const push = (t, v, pos, end, extra) => {
    const at = lc(pos);
    const tok = { t, v, line: at.line, col: at.col, pos: pos + posBase, end: end + posBase, sp, nl };
    if (extra) Object.assign(tok, extra);
    tokens.push(tok);
    sp = false;
    nl = false;
    return tok;
  };

  let i = 0;
  let php = !!opts.php;
  if (info.bom && !php) i = 1;

  const htmlMode = () => {
    // find next open tag
    let k = i;
    while (k < n) {
      const lt = src.indexOf('<?', k);
      if (lt < 0) { k = n; break; }
      const rest = src.slice(lt + 2, lt + 6).toLowerCase();
      if (rest.startsWith('php') && (lt + 5 >= n || isWs(src[lt + 5]))) {
        emitHtml(i, lt);
        if (info.firstOpen < 0) { info.firstOpen = lt; info.leading = src.slice(0, lt); }
        i = lt + 5;
        if (src[i] === '\r') i++;
        if (src[i] === '\n') i++;
        php = true;
        sp = true;
        return;
      }
      if (src[lt + 2] === '=') {
        emitHtml(i, lt);
        if (info.firstOpen < 0) { info.firstOpen = lt; info.leading = src.slice(0, lt); }
        push('id', 'echo', lt, lt + 3, { openEcho: true });
        i = lt + 3;
        php = true;
        return;
      }
      if (rest.startsWith('xml')) { k = lt + 2; continue; }
      // short open tag
      emitHtml(i, lt);
      if (info.firstOpen < 0) { info.firstOpen = lt; info.leading = src.slice(0, lt); }
      const at = lc(lt);
      info.shortTags.push({ line: at.line, col: at.col });
      i = lt + 2;
      php = true;
      sp = true;
      return;
    }
    emitHtml(i, n);
    i = n;
  };
  function emitHtml(a, b) {
    if (b > a) {
      push('html', src.slice(a, b), a, b);
      info.html++;
    }
  }

  while (i < n) {
    if (!php) { htmlMode(); continue; }
    const c = src[i];
    if (isWs(c)) {
      if (c === '\n') nl = true;
      sp = true;
      i++;
      continue;
    }
    // close tag
    if (c === '?' && src[i + 1] === '>') {
      const at = lc(i);
      info.closeTags.push({ line: at.line, col: at.col, pos: i });
      push('op', ';', i, i + 2, { closeTag: true });
      i += 2;
      if (src[i] === '\r' && src[i + 1] === '\n') i += 2;
      else if (src[i] === '\n') i++;
      php = false;
      continue;
    }
    // comments
    if ((c === '#' && src[i + 1] !== '[') || (c === '/' && src[i + 1] === '/')) {
      let k = i + (c === '#' ? 1 : 2);
      while (k < n && src[k] !== '\n' && !(src[k] === '?' && src[k + 1] === '>')) k++;
      const at = lc(i);
      comments.push({ text: src.slice(i, k), line: at.line, col: at.col, pos: i, end: k, kind: c === '#' ? 'hash' : 'line' });
      i = k;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let k = src.indexOf('*/', i + 2);
      if (k < 0) { k = n; info.errors.push('unterminated comment'); } else k += 2;
      const at = lc(i);
      const text = src.slice(i, k);
      comments.push({ text, line: at.line, col: at.col, pos: i, end: k, kind: text.startsWith('/**') ? 'doc' : 'block' });
      for (let q = i; q < k; q++) if (src.charCodeAt(q) === 10) nl = true;
      sp = true;
      i = k;
      continue;
    }
    // variables
    if (c === '$' && isIdStart(src[i + 1] || '')) {
      let k = i + 1;
      while (k < n && isIdChar(src[k])) k++;
      push('var', src.slice(i + 1, k), i, k);
      i = k;
      continue;
    }
    // names (with namespace separators)
    if (isIdStart(c) || (c === '\\' && isIdStart(src[i + 1] || ''))) {
      let k = i;
      if (src[k] === '\\') k++;
      for (;;) {
        while (k < n && isIdChar(src[k])) k++;
        if (src[k] === '\\' && isIdStart(src[k + 1] || '')) { k++; continue; }
        break;
      }
      const word = src.slice(i, k);
      // heredoc never starts with a name; nothing special here
      push('id', word, i, k);
      i = k;
      continue;
    }
    // numbers
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
      let k = i;
      let isFloat = false;
      if (c === '0' && /[xX]/.test(src[i + 1] || '')) { k += 2; while (k < n && /[0-9a-fA-F_]/.test(src[k])) k++; }
      else if (c === '0' && /[bB]/.test(src[i + 1] || '')) { k += 2; while (k < n && /[01_]/.test(src[k])) k++; }
      else if (c === '0' && /[oO]/.test(src[i + 1] || '')) { k += 2; while (k < n && /[0-7_]/.test(src[k])) k++; }
      else {
        while (k < n && (isDigit(src[k]) || src[k] === '_')) k++;
        if (src[k] === '.' && isDigit(src[k + 1] || '')) { isFloat = true; k++; while (k < n && (isDigit(src[k]) || src[k] === '_')) k++; }
        else if (src[k] === '.' && !(src[k + 1] === '.' || src[k + 1] === '=') && !isIdStart(src[k + 1] || '')) { isFloat = true; k++; }
        if (/[eE]/.test(src[k] || '') && (isDigit(src[k + 1] || '') || (/[+-]/.test(src[k + 1] || '') && isDigit(src[k + 2] || '')))) {
          isFloat = true;
          k += 2;
          while (k < n && isDigit(src[k])) k++;
        }
      }
      const raw = src.slice(i, k);
      push('num', raw, i, k, { float: isFloat });
      i = k;
      continue;
    }
    // single quoted
    if (c === '\'') {
      let k = i + 1;
      let v = '';
      while (k < n && src[k] !== '\'') {
        if (src[k] === '\\' && (src[k + 1] === '\'' || src[k + 1] === '\\')) { v += src[k + 1]; k += 2; continue; }
        v += src[k];
        k++;
      }
      if (k >= n) info.errors.push('unterminated string');
      push('str', v, i, Math.min(k + 1, n), { q: '\'' });
      i = k + 1;
      continue;
    }
    // double quoted / backtick
    if (c === '"' || c === '`') {
      let k = i + 1;
      while (k < n && src[k] !== c) { if (src[k] === '\\') k++; k++; }
      if (k >= n) { info.errors.push('unterminated string'); k = n; }
      const parts = interpolate(src, i + 1, Math.min(k, n), lc, c, posBase);
      const hasCode = parts.some((p) => p.code);
      if (c === '`') push('shell', parts.map((p) => p.s || '').join(''), i, Math.min(k + 1, n), { parts, q: c });
      else if (hasCode) push('tpl', parts.map((p) => p.s || '').join(''), i, Math.min(k + 1, n), { parts, q: c });
      else push('str', parts.map((p) => p.s || '').join(''), i, Math.min(k + 1, n), { q: c });
      i = k + 1;
      continue;
    }
    // heredoc / nowdoc
    if (c === '<' && src.startsWith('<<<', i)) {
      const m = /^<<<[ \t]*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1\r?\n/.exec(src.slice(i, i + 200));
      if (m) {
        const id = m[2];
        const nowdoc = m[1] === '\'';
        const bodyStart = i + m[0].length;
        // find closing marker: line whose first non-blank text is id, not followed by an id char
        let k = bodyStart;
        let close = -1;
        let closeEnd = -1;
        let indent = 0;
        while (k <= n) {
          let s = k;
          while (s < n && (src[s] === ' ' || src[s] === '\t')) s++;
          if (src.startsWith(id, s) && !isIdChar(src[s + id.length] || '')) { close = k; closeEnd = s + id.length; indent = s - k; break; }
          const nlx = src.indexOf('\n', k);
          if (nlx < 0) break;
          k = nlx + 1;
        }
        if (close < 0) { info.errors.push('unterminated heredoc'); close = n; closeEnd = n; }
        const bodyEnd = close > bodyStart ? close - 1 - (src[close - 2] === '\r' ? 1 : 0) : bodyStart;
        let tok;
        if (nowdoc) {
          let body = src.slice(bodyStart, Math.max(bodyStart, bodyEnd));
          if (indent) body = body.split('\n').map((l) => l.slice(Math.min(indent, l.length - l.trimStart().length))).join('\n');
          tok = push('str', body, i, closeEnd, { q: 'nowdoc', heredoc: id });
        } else {
          const parts = interpolate(src, bodyStart, Math.max(bodyStart, bodyEnd), lc, '"', posBase);
          if (indent) parts.forEach((p, pi) => { if (p.s != null) p.s = p.s.split('\n').map((l, li) => (li === 0 && pi > 0 ? l : l.replace(/^[ \t]+/, (w) => w.slice(Math.min(indent, w.length))))).join('\n'); });
          const hasCode = parts.some((p) => p.code);
          const text = parts.map((p) => p.s || '').join('');
          tok = push(hasCode ? 'tpl' : 'str', text, i, closeEnd, { parts: hasCode ? parts : undefined, q: 'heredoc', heredoc: id });
        }
        void tok;
        i = closeEnd;
        continue;
      }
    }
    // casts
    if (c === '(') {
      const m = /^\([ \t]*([A-Za-z]+)[ \t]*\)/.exec(src.slice(i, i + 24));
      if (m && CASTS.has(m[1].toLowerCase())) {
        push('cast', m[1].toLowerCase(), i, i + m[0].length);
        i += m[0].length;
        continue;
      }
    }
    // operators
    let op = null;
    for (const o of OPS) { if (src.startsWith(o, i)) { op = o; break; } }
    if (op) {
      push('op', op, i, i + op.length);
      i += op.length;
      continue;
    }
    // unknown char: skip
    info.errors.push(`unexpected character '${c}'`);
    i++;
  }
  // trailing close tag: the last token is a close tag and only whitespace follows
  if (tokens.length) {
    const last = tokens[tokens.length - 1];
    const prev = tokens.length > 1 ? tokens[tokens.length - 2] : null;
    if (last.t === 'html' && /^\s*$/.test(last.v) && prev && prev.closeTag) info.trailingClose = { line: prev.line, col: prev.col, ws: last.v };
    else if (last.closeTag) info.trailingClose = { line: last.line, col: last.col, ws: '' };
  }
  push('eof', '', n, n);
  return { tokens, comments, info, lineStarts: starts, lc: lc0 };
}

module.exports = { lex, CASTS, isIdStart, isIdChar };
