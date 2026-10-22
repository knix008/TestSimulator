'use strict';

// Tokenizer shared by the Java and Kotlin parsers.
//
// Token: { t, v, line, col, pos, end, nl }
//   t   'id' | 'num' | 'str' | 'char' | 'op' | 'eof'
//   v   identifier / operator text, decoded string value, number text
//   nl  true when a line break separates this token from the previous one
// Kotlin strings with templates get `parts`: [string | { name } | { toks }].
// '>' is always a single token; the parsers glue '>' '>' '=' etc. back
// together where an operator (not a type-argument list) is expected.

const OPS_JAVA = ['<<=', '...', '->', '::', '++', '--', '&&', '||', '==', '!=', '<=', '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<'];
const OPS_KT = ['===', '!==', '..<', '?.', '?:', '!!', '..', '->', '::', '++', '--', '&&', '||', '==', '!=', '<=', '+=', '-=', '*=', '/=', '%='];

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function isIdStart(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$' || c > '\x7f';
}
function isIdPart(c) {
  return isIdStart(c) || (c >= '0' && c <= '9');
}
function isDigit(c) {
  return c >= '0' && c <= '9';
}

const ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', s: ' ', '0': '\0', '\\': '\\', "'": "'", '"': '"', $: '$' };

function lex(text, lang) {
  const kt = lang === 'kt';
  const src = String(text || '');
  const starts = lineIndex(src);
  const comments = [];
  const ops = kt ? OPS_KT : OPS_JAVA;
  let lastLineHint = 0;

  function posLine(pos) {
    // Fast path: positions mostly increase.
    let lo = lastLineHint;
    if (starts[lo] > pos) lo = 0;
    let hi = starts.length - 1;
    if (lo < hi && starts[lo + 1] > pos) { lastLineHint = lo; return lo; }
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    lastLineHint = lo;
    return lo;
  }

  function mk(t, v, pos, end, nl) {
    const li = posLine(pos);
    return { t, v, line: li + 1, col: pos - starts[li] + 1, pos, end, nl };
  }

  // Scan from `pos`. When `stopBrace` is set, stop at the '}' that closes an
  // already-open '${' template (depth 0) and return its position.
  function scan(pos, stopBrace) {
    const toks = [];
    let nl = false;
    let depth = 0;
    const n = src.length;
    while (pos < n) {
      const c = src[pos];
      if (c === '\n') { nl = true; pos++; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '﻿') { pos++; continue; }
      if (c === '/' && src[pos + 1] === '/') {
        let e = src.indexOf('\n', pos);
        if (e < 0) e = n;
        const li = posLine(pos);
        comments.push({ line: li + 1, endLine: li + 1, text: src.slice(pos + 2, e), block: false, pos });
        pos = e;
        continue;
      }
      if (c === '/' && src[pos + 1] === '*') {
        let e;
        if (kt) {
          let d = 1;
          e = pos + 2;
          while (e < n && d > 0) {
            if (src[e] === '/' && src[e + 1] === '*') { d++; e += 2; continue; }
            if (src[e] === '*' && src[e + 1] === '/') { d--; e += 2; continue; }
            e++;
          }
        } else {
          e = src.indexOf('*/', pos + 2);
          e = e < 0 ? n : e + 2;
        }
        const li = posLine(pos);
        const li2 = posLine(Math.max(pos, e - 1));
        comments.push({ line: li + 1, endLine: li2 + 1, text: src.slice(pos + 2, Math.max(pos + 2, e - 2)), block: true, pos, doc: src[pos + 2] === '*' });
        if (li2 > li) nl = true;
        pos = e;
        continue;
      }
      const start = pos;
      if (isIdStart(c)) {
        let e = pos + 1;
        while (e < n && isIdPart(src[e])) e++;
        toks.push(mk('id', src.slice(pos, e), start, e, nl));
        nl = false;
        pos = e;
        continue;
      }
      if (kt && c === '`') {
        let e = src.indexOf('`', pos + 1);
        if (e < 0 || src.slice(pos, e).includes('\n')) e = pos + 1;
        const tk = mk('id', src.slice(pos + 1, e), start, e + 1, nl);
        tk.bq = true;
        toks.push(tk);
        nl = false;
        pos = e + 1;
        continue;
      }
      if (isDigit(c) || (c === '.' && isDigit(src[pos + 1] || ''))) {
        let e = pos;
        if (c === '0' && (src[e + 1] === 'x' || src[e + 1] === 'X')) {
          e += 2;
          while (e < n && /[0-9a-fA-F_]/.test(src[e])) e++;
          if (src[e] === '.' && !kt) { e++; while (e < n && /[0-9a-fA-F_]/.test(src[e])) e++; }
          if (src[e] === 'p' || src[e] === 'P') { e++; if (src[e] === '+' || src[e] === '-') e++; while (e < n && isDigit(src[e])) e++; }
        } else if (c === '0' && (src[e + 1] === 'b' || src[e + 1] === 'B')) {
          e += 2;
          while (e < n && /[01_]/.test(src[e])) e++;
        } else {
          while (e < n && (isDigit(src[e]) || src[e] === '_')) e++;
          if (src[e] === '.' && isDigit(src[e + 1] || '')) {
            e++;
            while (e < n && (isDigit(src[e]) || src[e] === '_')) e++;
          } else if (!kt && src[e] === '.' && !isIdStart(src[e + 1] || 'a') && src[e + 1] !== '.') {
            e++;
          }
          if ((src[e] === 'e' || src[e] === 'E') && (isDigit(src[e + 1] || '') || ((src[e + 1] === '+' || src[e + 1] === '-') && isDigit(src[e + 2] || '')))) {
            e += 2;
            while (e < n && (isDigit(src[e]) || src[e] === '_')) e++;
          }
        }
        while (e < n && /[lLfFdDuU]/.test(src[e])) e++;
        toks.push(mk('num', src.slice(pos, e), start, e, nl));
        nl = false;
        pos = e;
        continue;
      }
      if (c === '"') {
        const tk = kt ? ktString(pos, nl) : javaString(pos, nl);
        toks.push(tk);
        nl = false;
        pos = tk.end;
        continue;
      }
      if (c === "'") {
        let e = pos + 1;
        let v = '';
        while (e < n && src[e] !== "'" && src[e] !== '\n') {
          if (src[e] === '\\') {
            const x = src[e + 1];
            if (x === 'u') { v += String.fromCharCode(parseInt(src.slice(e + 2, e + 6), 16) || 0); e += 6; continue; }
            v += ESC[x] != null ? ESC[x] : x;
            e += 2;
            continue;
          }
          v += src[e++];
        }
        const tk = mk('char', v, start, Math.min(n, e + 1), nl);
        toks.push(tk);
        nl = false;
        pos = Math.min(n, e + 1);
        continue;
      }
      if (stopBrace) {
        if (c === '{') depth++;
        else if (c === '}') {
          if (depth === 0) return { toks, pos };
          depth--;
        }
      }
      let op = null;
      if (c !== '>') {
        for (const o of ops) {
          if (src.startsWith(o, pos)) { op = o; break; }
        }
      }
      if (!op) op = c;
      toks.push(mk('op', op, start, pos + op.length, nl));
      nl = false;
      pos += op.length;
    }
    return { toks, pos };
  }

  function javaString(pos, nl) {
    const n = src.length;
    const start = pos;
    if (src.startsWith('"""', pos)) {
      let e = pos + 3;
      while (e < n && src[e] !== '\n') e++;
      const bodyStart = e + 1;
      let v = '';
      e = bodyStart;
      while (e < n && !src.startsWith('"""', e)) {
        if (src[e] === '\\') { const x = src[e + 1]; v += x === '\n' ? '' : (ESC[x] != null ? ESC[x] : x); e += 2; continue; }
        v += src[e++];
      }
      const tk = mk('str', stripIndent(v), start, Math.min(n, e + 3), nl);
      tk.tb = true;
      return tk;
    }
    let e = pos + 1;
    let v = '';
    while (e < n && src[e] !== '"' && src[e] !== '\n') {
      if (src[e] === '\\') {
        const x = src[e + 1];
        if (x === 'u') { v += String.fromCharCode(parseInt(src.slice(e + 2, e + 6), 16) || 0); e += 6; continue; }
        if (x >= '0' && x <= '7') { let k = e + 1; let o = ''; while (k < e + 4 && src[k] >= '0' && src[k] <= '7') o += src[k++]; v += String.fromCharCode(parseInt(o, 8)); e = k; continue; }
        v += ESC[x] != null ? ESC[x] : x;
        e += 2;
        continue;
      }
      v += src[e++];
    }
    return mk('str', v, start, Math.min(n, e + 1), nl);
  }

  function ktString(pos, nl) {
    const n = src.length;
    const start = pos;
    const raw = src.startsWith('"""', pos);
    let e = pos + (raw ? 3 : 1);
    const parts = [];
    let cur = '';
    let hasTmpl = false;
    while (e < n) {
      if (raw) {
        if (src.startsWith('"""', e)) {
          // Extra quotes before the closing triple belong to the content.
          while (src[e + 3] === '"') { cur += '"'; e++; }
          e += 3;
          break;
        }
      } else {
        if (src[e] === '"') { e++; break; }
        if (src[e] === '\n') break;
        if (src[e] === '\\') {
          const x = src[e + 1];
          if (x === 'u') { cur += String.fromCharCode(parseInt(src.slice(e + 2, e + 6), 16) || 0); e += 6; continue; }
          cur += ESC[x] != null ? ESC[x] : x;
          e += 2;
          continue;
        }
      }
      if (src[e] === '$' && src[e + 1] === '{') {
        if (cur) parts.push(cur);
        cur = '';
        const r = scan(e + 2, true);
        parts.push({ toks: r.toks });
        hasTmpl = true;
        e = r.pos + 1;
        continue;
      }
      if (src[e] === '$' && isIdStart(src[e + 1] || '') && src[e + 1] !== '$') {
        let k = e + 1;
        while (k < n && isIdPart(src[k]) && src[k] !== '$') k++;
        if (cur) parts.push(cur);
        cur = '';
        const li = posLine(e + 1);
        parts.push({ name: src.slice(e + 1, k), line: li + 1, col: e + 1 - starts[li] + 1 });
        hasTmpl = true;
        e = k;
        continue;
      }
      cur += src[e++];
    }
    if (cur || !parts.length) parts.push(cur);
    const v = parts.filter((p) => typeof p === 'string').join('');
    const tk = mk('str', v, start, e, nl);
    if (raw) tk.tb = true;
    if (hasTmpl) tk.parts = parts;
    return tk;
  }

  let toks;
  let error = null;
  try {
    toks = scan(0, false).toks;
  } catch (err) {
    error = err;
    toks = [];
  }
  const eofLine = starts.length;
  toks.push({ t: 'eof', v: '<eof>', line: eofLine, col: 1, pos: src.length, end: src.length, nl: true });
  return { toks, comments, error, lines: starts.length };
}

function stripIndent(v) {
  const lines = v.split('\n');
  let min = Infinity;
  for (const l of lines) {
    if (!l.trim()) continue;
    const m = /^[ \t]*/.exec(l)[0].length;
    if (m < min) min = m;
  }
  if (!isFinite(min)) min = 0;
  return lines.map((l) => l.slice(min).replace(/[ \t]+$/, '')).join('\n');
}

module.exports = { lex };
