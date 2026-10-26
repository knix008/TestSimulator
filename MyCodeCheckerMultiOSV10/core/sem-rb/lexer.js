'use strict';

// Tolerant Ruby lexer. Produces tokens with absolute positions:
//   { t, v, pos, end, line, col, sp, bol, ... }
// t: 'id' | 'const' | 'ivar' | 'cvar' | 'gvar' | 'kw' | 'int' | 'float' |
//    'str' | 'xstr' | 'sym' | 'dsym' | 'regex' | 'words' | 'char' | 'label' |
//    'op' | 'nl' | 'eof'
// String-like tokens carry `parts`: [{ s }, { code, pos, end }] where `code`
// spans are interpolations ("#{...}") that the parser re-lexes in place.
// Newlines are emitted as 'nl' tokens except where Ruby continues the
// statement (after a binary operator / comma / opening bracket, before a
// leading ".method"). Comments are collected separately.

const KEYWORDS = new Set([
  'alias', 'and', 'begin', 'BEGIN', 'break', 'case', 'class', 'def', 'defined?', 'do', 'else', 'elsif',
  'end', 'END', 'ensure', 'false', 'for', 'if', 'in', 'module', 'next', 'nil', 'not', 'or', 'redo',
  'rescue', 'retry', 'return', 'self', 'super', 'then', 'true', 'undef', 'unless', 'until', 'when',
  'while', 'yield', '__FILE__', '__LINE__', '__ENCODING__',
]);

const VALUE_KW = new Set(['end', 'self', 'true', 'false', 'nil', '__FILE__', '__LINE__', '__ENCODING__']);
const VALUE_T = new Set(['id', 'const', 'ivar', 'cvar', 'gvar', 'int', 'float', 'str', 'xstr', 'sym', 'dsym', 'regex', 'words', 'char']);

const OPS = [
  '**=', '<=>', '===', '...', '<<=', '>>=', '&&=', '||=',
  '&.', '==', '!=', '>=', '<=', '&&', '||', '<<', '>>', '**', '=~', '!~', '+=', '-=', '*=', '/=', '%=',
  '|=', '&=', '^=', '..', '::', '->', '=>',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '&', '|', '^', '~', '?', ':', ',', '.', '(', ')', '[', ']', '{', '}',
];

// After these operators a newline does not end the statement.
const CONT_OPS = new Set([
  '**=', '<=>', '===', '<<=', '>>=', '&&=', '||=', '&.', '==', '!=', '>=', '<=', '&&', '||', '<<', '>>', '**',
  '=~', '!~', '+=', '-=', '*=', '/=', '%=', '|=', '&=', '^=', '::', '=>', '+', '-', '*', '/', '%', '=',
  '<', '>', '!', '&', '^', '~', '?', ':', ',', '.', '(', '[', '{', '..', '...',
]);

const PAIRS = { '(': ')', '[': ']', '{': '}', '<': '>' };
const isIdStart = (c) => !!c && (/[A-Za-z_]/.test(c) || c.charCodeAt(0) > 127);
const isIdChar = (c) => !!c && (/[A-Za-z0-9_]/.test(c) || c.charCodeAt(0) > 127);
const isSpace = (c) => c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v';

function lineTable(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function makeLoc(starts) {
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

function unescape(s, dq) {
  if (s.indexOf('\\') < 0) return s;
  if (!dq) return s.replace(/\\([\\'])/g, '$1');
  return s.replace(/\\(u\{[0-9a-fA-F ]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/gs, (m, e) => {
    switch (e[0]) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 's': return ' ';
      case '0': return e.length === 1 ? '\0' : String.fromCharCode(parseInt(e, 8));
      case 'e': return '\x1b';
      case 'a': return '\x07';
      case 'b': return '\b';
      case 'u':
        if (e[1] === '{') return e.slice(2, -1).trim().split(/\s+/).map((h) => String.fromCodePoint(parseInt(h, 16) || 0)).join('');
        return String.fromCharCode(parseInt(e.slice(1), 16));
      case 'x': return String.fromCharCode(parseInt(e.slice(1), 16));
      case '\n': return '';
      default:
        if (/[1-7]/.test(e[0])) return String.fromCharCode(parseInt(e, 8));
        return e;
    }
  });
}

// Finds the '}' closing an interpolation that starts at `i` (just after "#{").
function scanCode(src, i, limit) {
  let depth = 1;
  while (i < limit) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
    else if (c === '"' || c === '`') {
      i++;
      while (i < limit && src[i] !== c) {
        if (src[i] === '\\') i++;
        else if (src[i] === '#' && src[i + 1] === '{') { i = scanCode(src, i + 2, limit); }
        i++;
      }
    } else if (c === "'") {
      i++;
      while (i < limit && src[i] !== "'") { if (src[i] === '\\') i++; i++; }
    }
    i++;
  }
  return limit;
}

// Scans a delimited literal body from `i` (just after the opening delimiter).
// Returns { end (index of closing delimiter or limit), parts, closed }.
function scanDelimited(src, i, open, close, interp, limit) {
  const parts = [];
  let depth = 0;
  let buf = '';
  let bufStart = i;
  const flush = () => { if (buf) parts.push({ s: buf, pos: bufStart }); buf = ''; };
  while (i < limit) {
    const c = src[i];
    if (c === '\\') { buf += src.slice(i, i + 2); i += 2; continue; }
    if (interp && c === '#' && src[i + 1] === '{') {
      flush();
      const endI = scanCode(src, i + 2, limit);
      parts.push({ code: src.slice(i + 2, endI), pos: i + 2, end: endI });
      i = endI + 1;
      bufStart = i;
      continue;
    }
    if (interp && c === '#' && (src[i + 1] === '@' || src[i + 1] === '$') && isIdStart(src[i + 2] === '@' ? src[i + 3] : src[i + 2])) {
      flush();
      let k = i + 2;
      if (src[k] === '@') k++;
      while (isIdChar(src[k])) k++;
      parts.push({ code: src.slice(i + 1, k), pos: i + 1, end: k });
      i = k;
      bufStart = i;
      continue;
    }
    if (open !== close && c === open) depth++;
    else if (c === close) {
      if (depth === 0) { flush(); return { end: i, parts, closed: true }; }
      depth--;
    }
    buf += c;
    i++;
  }
  flush();
  return { end: limit, parts, closed: false };
}

function partsValue(parts, dq) {
  if (parts.some((p) => p.code != null)) return null;
  return unescape(parts.map((p) => p.s).join(''), dq);
}

function lex(src, start = 0, limit = src.length, shared = null) {
  const starts = shared ? shared.starts : lineTable(src);
  const loc = shared ? shared.loc : makeLoc(starts);
  const tokens = [];
  const comments = shared ? shared.comments : [];
  const errors = shared ? shared.errors : [];
  let i = start;
  let sp = false;
  let heredocResume = null; // { nl, to }
  let heredocNext = -1;
  let parenDepth = 0;

  const last = () => tokens[tokens.length - 1] || null;
  const push = (tok, from, to) => {
    const a = loc(from);
    const b = loc(Math.max(from, to - 1));
    tok.pos = from;
    tok.end = to;
    tok.line = a.line;
    tok.col = a.col;
    tok.endLine = b.line;
    tok.endCol = b.col + 1;
    tok.sp = sp;
    const p = last();
    tok.bol = !p || p.t === 'nl';
    tokens.push(tok);
    sp = false;
    return tok;
  };
  const endsValue = (p) => !!p && (VALUE_T.has(p.t) || (p.t === 'kw' && VALUE_KW.has(p.v)) || (p.t === 'op' && (p.v === ')' || p.v === ']' || p.v === '}')));
  // true when an operand (not an operator) is expected at `i`
  const valuePos = (i2) => {
    const p = last();
    if (!endsValue(p)) return true;
    if (p.t === 'id' && sp && !isSpace(src[i2 + 1] || ' ') && src[i2 + 1] !== '\n' && src[i2 + 1] !== '=') return 'cmd';
    return false;
  };

  const emitNl = (from, v) => {
    const p = last();
    if (!p || p.t === 'nl') { sp = false; return; }
    if (v === '\n' && ((p.t === 'op' && CONT_OPS.has(p.v)) || (p.t === 'kw' && (p.v === 'and' || p.v === 'or' || p.v === 'not')))) {
      // `|` closing block params is not a continuation; `*`/`&` in `(*)` close on ')'
      return;
    }
    if (v === '\n' && leadingDot(from + 1)) return;
    push({ t: 'nl', v }, from, from + 1);
  };
  const leadingDot = (k) => {
    for (;;) {
      while (k < limit && (isSpace(src[k]) || src[k] === '\n')) k++;
      if (src[k] === '#' && src[k + 1] !== '{') { while (k < limit && src[k] !== '\n') k++; continue; }
      break;
    }
    return (src[k] === '.' && src[k + 1] !== '.') || (src[k] === '&' && src[k + 1] === '.');
  };

  while (i < limit) {
    const c = src[i];
    if (heredocResume && i === heredocResume.nl) {
      emitNl(i, '\n');
      i = heredocResume.to;
      heredocResume = null;
      heredocNext = -1;
      continue;
    }
    if (isSpace(c)) { i++; sp = true; continue; }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; sp = true; continue; }
    if (c === '\\' && src[i + 1] === '\r' && src[i + 2] === '\n') { i += 3; sp = true; continue; }
    if (c === '\n') {
      const bol = i + 1;
      emitNl(i, '\n');
      i = bol;
      sp = true;
      // =begin ... =end
      if (src.startsWith('=begin', i) && !isIdChar(src[i + 6])) {
        const from = i;
        const m = src.slice(i).search(/\n=end\b/);
        const stop = m < 0 ? limit : i + m + 5;
        comments.push({ text: src.slice(from, stop), line: loc(from).line, pos: from, block: true });
        i = src.indexOf('\n', stop);
        if (i < 0) i = limit;
        continue;
      }
      if (src.startsWith('__END__', i) && (src[i + 7] === '\n' || src[i + 7] === '\r' || i + 7 >= limit)) { i = limit; break; }
      continue;
    }
    if (c === '#') {
      let k = i;
      while (k < limit && src[k] !== '\n') k++;
      comments.push({ text: src.slice(i, k).replace(/\r$/, ''), line: loc(i).line, col: loc(i).col, pos: i });
      i = k;
      continue;
    }
    if (c === ';') { emitNl(i, ';'); i++; continue; }
    if (i === 0 && src.startsWith('=begin', i) && !isIdChar(src[i + 6])) {
      const m = src.slice(i).search(/\n=end\b/);
      const stop = m < 0 ? limit : i + m + 5;
      comments.push({ text: src.slice(i, stop), line: 1, pos: i, block: true });
      i = src.indexOf('\n', stop);
      if (i < 0) i = limit;
      continue;
    }

    // numbers
    if (/[0-9]/.test(c)) {
      const re = /0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?/y;
      re.lastIndex = i;
      const m = re.exec(src);
      let k = i + m[0].length;
      const isFloat = /[.eE]/.test(m[0]) && !/^0[xX]/.test(m[0]);
      while (src[k] === 'r' || src[k] === 'i') { if (isIdChar(src[k + 1])) break; k++; }
      push({ t: isFloat ? 'float' : 'int', v: m[0].replace(/_/g, '') }, i, k);
      i = k;
      continue;
    }

    // identifiers / keywords / labels / constants
    if (isIdStart(c)) {
      let k = i + 1;
      while (isIdChar(src[k])) k++;
      if ((src[k] === '?' || src[k] === '!') && (src[k + 1] !== '=' || src[k + 2] === '=' || src[k + 2] === '~')) {
        // `a ?b :c` ternary with no space is rare; method names win
        if (!(src[k] === '?' && src[k + 1] === ':' )) k++;
      }
      const word = src.slice(i, k);
      const p = last();
      const afterDot = p && p.t === 'op' && (p.v === '.' || p.v === '&.') ;
      const afterDef = p && p.t === 'kw' && p.v === 'def';
      if (src[k] === ':' && src[k + 1] !== ':' && !afterDot && !(p && p.t === 'op' && p.v === '?')) {
        push({ t: 'label', v: word }, i, k + 1);
        i = k + 1;
        continue;
      }
      let t;
      if (KEYWORDS.has(word) && !afterDot && !(afterDef && word !== 'self')) t = 'kw';
      else if (word === 'defined' && src[k] === '?') t = 'kw';
      else if (/^[A-Z]/.test(word)) t = 'const';
      else t = 'id';
      push({ t, v: word }, i, k);
      i = k;
      continue;
    }

    // instance / class / global variables
    if (c === '@') {
      let k = i + 1;
      const cvar = src[k] === '@';
      if (cvar) k++;
      if (isIdStart(src[k])) {
        while (isIdChar(src[k])) k++;
        push({ t: cvar ? 'cvar' : 'ivar', v: src.slice(i, k) }, i, k);
        i = k;
        continue;
      }
    }
    if (c === '$') {
      let k = i + 1;
      if (isIdStart(src[k])) { while (isIdChar(src[k])) k++; }
      else if (/[0-9]/.test(src[k])) { while (/[0-9]/.test(src[k])) k++; }
      else if (src[k] === '-' && isIdChar(src[k + 1])) k += 2;
      else if (src[k] && '!@&`\'+~=/\\,;.<>_*$?:"'.includes(src[k])) k++;
      if (k > i + 1) {
        push({ t: 'gvar', v: src.slice(i, k) }, i, k);
        i = k;
        continue;
      }
    }

    // strings
    if (c === '"' || c === '`' || c === "'") {
      const interp = c !== "'";
      const r = scanDelimited(src, i + 1, c, c, interp, limit);
      if (!r.closed) errors.push({ line: loc(i).line, msg: 'unterminated string' });
      const endI = Math.min(limit, r.end + 1);
      // "key": value (string label)
      if (c !== '`' && src[endI] === ':' && src[endI + 1] !== ':' && (isSpace(src[endI + 1] || ' ') || src[endI + 1] === '\n')) {
        const lp = last();
        if (lp && lp.t === 'op' && (lp.v === '{' || lp.v === ',' || lp.v === '(')) {
          push({ t: 'label', v: partsValue(r.parts, interp) || '', parts: r.parts, q: c }, i, endI + 1);
          i = endI + 1;
          continue;
        }
      }
      push({ t: c === '`' ? 'xstr' : 'str', v: partsValue(r.parts, interp), parts: r.parts, q: c, interp: r.parts.some((p) => p.code != null) }, i, endI);
      i = endI;
      continue;
    }

    // symbols
    if (c === ':' && src[i + 1] !== ':') {
      const p = last();
      const prevIsWordEnd = p && p.end === i && (p.t === 'id' || p.t === 'const');
      if (!prevIsWordEnd) {
        const n = src[i + 1];
        if (n === '"' || n === "'") {
          const r = scanDelimited(src, i + 2, n, n, n === '"', limit);
          const endI = Math.min(limit, r.end + 1);
          push({ t: 'dsym', v: partsValue(r.parts, n === '"'), parts: r.parts, interp: r.parts.some((x) => x.code != null) }, i, endI);
          i = endI;
          continue;
        }
        if (isIdStart(n)) {
          let k = i + 2;
          while (isIdChar(src[k])) k++;
          if ((src[k] === '?' || src[k] === '!' || src[k] === '=') && src[k + 1] !== '=' && src[k + 1] !== '>' && src[k + 1] !== '~') k++;
          push({ t: 'sym', v: src.slice(i + 1, k) }, i, k);
          i = k;
          continue;
        }
        if (n === '@' || n === '$') {
          let k = i + 2;
          if (src[k] === '@') k++;
          while (isIdChar(src[k])) k++;
          if (k > i + 2) { push({ t: 'sym', v: src.slice(i + 1, k) }, i, k); i = k; continue; }
        }
        const opm = /^(\[\]=|\[\]|<=>|===|==|=~|!=|!~|\*\*|<<|>>|<=|>=|[+\-]@|[+\-*\/%<>!~^&|])/.exec(src.slice(i + 1, i + 5));
        if (opm && (p ? !endsValue(p) || sp : true) && !isSpace(n)) {
          push({ t: 'sym', v: opm[1] }, i, i + 1 + opm[1].length);
          i += 1 + opm[1].length;
          continue;
        }
      }
    }

    // heredoc
    if (c === '<' && src[i + 1] === '<') {
      const vp = valuePos(i + 1);
      const m = /^<<([~-]?)(["'`]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(src.slice(i, i + 80));
      if (m && vp && (vp === true || m[2] || /^[A-Z]/.test(m[3]))) {
        const squiggly = m[1] === '~';
        const indented = m[1] !== '';
        const quote = m[2];
        const id = m[3];
        const tagEnd = i + m[0].length;
        let bodyStart = heredocNext;
        let nlPos;
        if (bodyStart < 0) {
          nlPos = src.indexOf('\n', tagEnd);
          if (nlPos < 0 || nlPos >= limit) nlPos = limit;
          bodyStart = Math.min(limit, nlPos + 1);
        } else nlPos = heredocResume ? heredocResume.nl : src.indexOf('\n', tagEnd);
        let k = bodyStart;
        let bodyEnd = limit;
        let after = limit;
        while (k < limit) {
          let e = src.indexOf('\n', k);
          if (e < 0 || e > limit) e = limit;
          const lineText = src.slice(k, e).replace(/\r$/, '');
          if ((indented ? lineText.trim() : lineText) === id) { bodyEnd = k; after = Math.min(limit, e + 1); break; }
          k = e + 1;
        }
        if (bodyEnd === limit) errors.push({ line: loc(i).line, msg: `unterminated heredoc ${id}` });
        const interp = quote !== "'";
        const r = scanDelimited(src, bodyStart, '\0', '\0', interp, bodyEnd);
        let value = partsValue(r.parts, interp);
        if (value != null && squiggly) {
          const ls = value.split('\n');
          const ind = Math.min(...ls.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)[0].length).concat([1e9]));
          if (ind < 1e9) value = ls.map((l) => l.slice(ind)).join('\n');
        }
        push({ t: quote === '`' ? 'xstr' : 'str', v: value, parts: r.parts, q: 'heredoc', heredoc: id, interp: r.parts.some((p) => p.code != null), bodyLine: loc(bodyStart).line, bodyEndLine: loc(Math.max(bodyStart, after - 1)).line }, i, tagEnd);
        heredocNext = after;
        heredocResume = { nl: nlPos, to: after };
        i = tagEnd;
        continue;
      }
    }

    // percent literals
    if (c === '%') {
      const vp = valuePos(i);
      if (vp) {
        let k = i + 1;
        let kind = '';
        if (/[qQwWiIrsx]/.test(src[k]) && src[k + 1] && !isIdChar(src[k + 1]) && !isSpace(src[k + 1])) { kind = src[k]; k++; }
        const d = src[k];
        const okDelim = d && !isIdChar(d) && !isSpace(d) && d !== '\n' && (kind || d !== '=' ) && (kind || vp === true || d === '(' || d === '[' || d === '{' || d === '|');
        if (okDelim) {
          const close = PAIRS[d] || d;
          const interp = kind === '' || kind === 'Q' || kind === 'W' || kind === 'I' || kind === 'r' || kind === 'x';
          const r = scanDelimited(src, k + 1, d, close, interp, limit);
          let endI = Math.min(limit, r.end + 1);
          if (kind === 'w' || kind === 'W' || kind === 'i' || kind === 'I') {
            const raw = src.slice(k + 1, r.end);
            const words = raw.split(/\s+/).filter(Boolean);
            push({ t: 'words', v: words, sym: kind === 'i' || kind === 'I', parts: r.parts }, i, endI);
          } else if (kind === 'r') {
            const fm = /^[imxounse]*/.exec(src.slice(endI, endI + 8));
            push({ t: 'regex', v: partsValue(r.parts, true), parts: r.parts, flags: fm[0], interp: r.parts.some((p) => p.code != null) }, i, endI + fm[0].length);
            endI += fm[0].length;
          } else if (kind === 's') {
            push({ t: 'sym', v: src.slice(k + 1, r.end) }, i, endI);
          } else if (kind === 'x') {
            push({ t: 'xstr', v: partsValue(r.parts, true), parts: r.parts, q: '%x', interp: r.parts.some((p) => p.code != null) }, i, endI);
          } else {
            push({ t: 'str', v: partsValue(r.parts, interp), parts: r.parts, q: '%' + kind, interp: r.parts.some((p) => p.code != null) }, i, endI);
          }
          i = endI;
          continue;
        }
      }
    }

    // regex literal
    if (c === '/') {
      const vp = valuePos(i);
      if (vp) {
        const r = scanDelimited(src, i + 1, '/', '/', true, limit);
        let endI = Math.min(limit, r.end + 1);
        const fm = /^[imxounse]*/.exec(src.slice(endI, endI + 8));
        endI += fm[0].length;
        push({ t: 'regex', v: partsValue(r.parts, true), parts: r.parts, flags: fm[0], interp: r.parts.some((p) => p.code != null) }, i, endI);
        i = endI;
        continue;
      }
    }

    // character literal ?a
    if (c === '?' && valuePos(i) && src[i + 1] && !isSpace(src[i + 1]) && src[i + 1] !== '\n') {
      let k = i + 2;
      if (src[i + 1] === '\\') k = i + 3;
      if (!isIdChar(src[k]) || src[i + 1] === '\\') {
        push({ t: 'char', v: unescape(src.slice(i + 1, k), true) }, i, k);
        i = k;
        continue;
      }
    }

    // unary operator method names: def -@ / :+@ / obj.-@
    if ((c === '-' || c === '+' || c === '!' || c === '~') && src[i + 1] === '@' && !isIdStart(src[i + 2] || '')) {
      const p = last();
      if (p && ((p.t === 'kw' && p.v === 'def') || (p.t === 'op' && (p.v === '.' || p.v === '&.')))) {
        push({ t: 'op', v: c + '@' }, i, i + 2);
        i += 2;
        continue;
      }
    }

    // operators
    let op = null;
    for (const o of OPS) { if (src.startsWith(o, i)) { op = o; break; } }
    if (op) {
      if (op === '(' ) parenDepth++;
      if (op === ')') parenDepth = Math.max(0, parenDepth - 1);
      push({ t: 'op', v: op }, i, i + op.length);
      i += op.length;
      continue;
    }
    errors.push({ line: loc(i).line, msg: `unexpected character ${JSON.stringify(c)}` });
    i++;
  }
  const eofPos = Math.min(limit, src.length);
  const a = loc(Math.max(0, eofPos - 1));
  tokens.push({ t: 'eof', v: '', pos: eofPos, end: eofPos, line: a.line, col: a.col + 1, endLine: a.line, endCol: a.col + 1, sp: false, bol: true });
  return { tokens, comments, errors, starts, loc };
}

module.exports = { lex, KEYWORDS, unescape, lineTable, makeLoc };
