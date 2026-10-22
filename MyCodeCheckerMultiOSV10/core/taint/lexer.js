'use strict';

// Tokenizer for the taint engine. One scanner, configured per language family.
// It never throws: anything it does not understand becomes a one-character
// operator token. Strings keep their interpolated expressions as nested token
// lists (template literals, f-strings, PHP/Kotlin/Ruby/C# interpolation).

const FAMILY = {
  js: 'js', ts: 'js', py: 'py', java: 'java', kt: 'kt', cs: 'cs', php: 'php', go: 'go', rb: 'rb',
};

const OPS = [
  '>>>=', '===', '!==', '**=', '...', '<=>', '<<=', '>>=', '??=', '||=', '&&=',
  '?.', '??', '=>', '->', '::', '&.', '==', '!=', '<=', '>=', '&&', '||', '++', '--',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', ':=', '**', '<<', '>>', '<-', '=~', '!~',
];

const VALUE_END = new Set(['id', 'num', 'str']);
const REGEX_AFTER_KW = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'when', 'if', 'unless', 'and', 'or', 'not']);

function isIdStart(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$' || c > '\u007f';
}
function isIdChar(c) {
  return isIdStart(c) || (c >= '0' && c <= '9');
}
function isDigit(c) {
  return c >= '0' && c <= '9';
}

function lex(text, lang, baseLine) {
  try {
    return scan(String(text || ''), FAMILY[lang] || 'js', baseLine || 1);
  } catch {
    return [];
  }
}

function scan(src, fam, baseLine) {
  const toks = [];
  const n = src.length;
  let i = 0;
  let line = baseLine;
  let lineStart = 0;
  let nl = true;
  let ind = 0;
  let indSet = false;
  const hashComment = fam === 'py' || fam === 'rb' || fam === 'php';
  const slashComment = fam !== 'py' && fam !== 'rb';

  const push = (tok, start) => {
    tok.line = tok.line || line;
    tok.col = start - lineStart + 1;
    tok.nl = nl;
    if (!indSet) { ind = start - lineStart; indSet = true; }
    tok.ind = ind;
    nl = false;
    toks.push(tok);
    return tok;
  };
  const prevSig = () => toks[toks.length - 1];

  while (i < n) {
    const c = src[i];
    if (c === '\n') {
      line++; i++; lineStart = i; nl = true; indSet = false; continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }
    // line continuation
    if (c === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) {
      i += src[i + 1] === '\r' ? 3 : 2; line++; lineStart = i; continue;
    }
    // comments
    if (slashComment && c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (slashComment && c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') { line++; lineStart = k + 1; nl = true; indSet = false; }
      i = stop;
      continue;
    }
    if (hashComment && c === '#' && !(fam === 'php' && src[i + 1] === '[')) {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (fam === 'php' && c === '#' && src[i + 1] === '[') { // PHP 8 attribute: keep as tokens
      push({ t: 'op', v: '#[' }, i); i += 2; continue;
    }
    if (fam === 'rb' && c === '=' && i === lineStart && src.startsWith('=begin', i)) {
      const end = src.indexOf('\n=end', i);
      const stop = end < 0 ? n : end + 5;
      for (let k = i; k < stop; k++) if (src[k] === '\n') { line++; lineStart = k + 1; }
      i = stop;
      continue;
    }
    if (fam === 'php' && c === '?' && src[i + 1] === '>') { i += 2; continue; }
    if (fam === 'php' && c === '<' && src.startsWith('<?php', i)) { i += 5; continue; }
    if (fam === 'php' && c === '<' && src.startsWith('<?=', i)) { push({ t: 'id', v: 'echo' }, i); i += 3; continue; }
    if (fam === 'php' && c === '<' && src[i + 1] === '?') { i += 2; continue; }

    const start = i;
    // heredocs
    if ((fam === 'php' && src.startsWith('<<<', i)) || (fam === 'rb' && c === '<' && src[i + 1] === '<' && /^<<[~-]?(['"]?)[A-Z_][A-Z0-9_]*\1/.test(src.slice(i, i + 40)))) {
      const m = fam === 'php'
        ? /^<<<[ \t]*(['"]?)([A-Za-z_]\w*)\1/.exec(src.slice(i, i + 80))
        : /^<<[~-]?(['"]?)([A-Z_][A-Z0-9_]*)\1/.exec(src.slice(i, i + 80));
      if (m) {
        const raw = m[1] === "'";
        const bodyStart = src.indexOf('\n', i);
        if (bodyStart > 0) {
          const re = new RegExp('\\n[ \\t]*' + m[2] + '\\b');
          re.lastIndex = 0;
          const rest = src.slice(bodyStart);
          const mm = re.exec(rest);
          const bodyEnd = mm ? bodyStart + mm.index : n;
          const body = src.slice(bodyStart + 1, bodyEnd);
          const tok = push({ t: 'str', v: body, parts: [] }, start);
          if (!raw) tok.parts = interpolations(body, fam, line, fam === 'php' ? 'php' : 'rb');
          // keep the rest of the opening line (e.g. `<<~SQL)` ) lexed normally:
          const lineRest = src.slice(i + m[0].length, bodyStart);
          const inner = scan(lineRest, fam, line);
          for (const t of inner) { t.nl = false; t.ind = tok.ind; toks.push(t); }
          const stopAt = mm ? bodyStart + mm.index + mm[0].length : n;
          for (let k = bodyStart; k < stopAt; k++) if (src[k] === '\n') { line++; lineStart = k + 1; }
          i = stopAt;
          continue;
        }
      }
    }
    // strings
    const strTok = readString(src, i, fam, prevSig());
    if (strTok) {
      const tok = push(strTok.tok, start);
      tok.line = line;
      if (tok.parts) for (const part of tok.parts) for (const t of part) if (!t.line || t.line < line) t.line = line;
      for (let k = i; k < strTok.end; k++) if (src[k] === '\n') { line++; lineStart = k + 1; }
      i = strTok.end;
      continue;
    }
    // numbers
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
      let k = i + 1;
      while (k < n && (isIdChar(src[k]) || src[k] === '.' && isDigit(src[k + 1] || ''))) k++;
      push({ t: 'num', v: src.slice(i, k) }, start);
      i = k;
      continue;
    }
    // identifiers
    if (isIdStart(c) || (fam === 'rb' && c === '@') || (fam === 'php' && c === '$' && isIdStart(src[i + 1] || ''))) {
      let k = i + 1;
      if (fam === 'rb' && c === '@' && src[k] === '@') k++;
      if (fam === 'php' && c === '$' && src[k] === '$') k++;
      while (k < n && isIdChar(src[k]) && !(fam === 'php' && src[k] === '$')) k++;
      if (fam === 'rb' && (src[k] === '?' || src[k] === '!') && src[k + 1] !== '=' && k > i + 1) k++;
      // Ruby symbol-keyed hash `key: value` stays as id + ':'
      push({ t: 'id', v: src.slice(i, k) }, start);
      i = k;
      continue;
    }
    // ruby symbol :name
    if (fam === 'rb' && c === ':' && isIdStart(src[i + 1] || '') && src[i - 1] !== ':' && !isIdChar(src[i - 1] || ' ')) {
      let k = i + 1;
      while (k < n && isIdChar(src[k])) k++;
      if (src[k] === '?' || src[k] === '!') k++;
      push({ t: 'str', v: src.slice(i + 1, k), parts: [], sym: true }, start);
      i = k;
      continue;
    }
    // regex literals
    if (c === '/' && (fam === 'js' || fam === 'rb')) {
      const p = prevSig();
      const canRegex = !p || (!VALUE_END.has(p.t) && p.v !== ')' && p.v !== ']' && p.v !== '}') || (p.t === 'id' && REGEX_AFTER_KW.has(p.v));
      const rbSpaced = fam === 'rb' && p && p.t === 'id' && src[i - 1] === ' ' && src[i + 1] !== ' ' && src[i + 1] !== '=';
      if (canRegex || rbSpaced) {
        const r = readRegex(src, i, fam, line);
        if (r) {
          push(r.tok, start);
          i = r.end;
          continue;
        }
      }
    }
    // operators
    let op = null;
    for (const o of OPS) {
      if (src.startsWith(o, i)) { op = o; break; }
    }
    if (op === '<-' && fam !== 'go') op = null;
    if (op === '=~' && fam !== 'rb' && fam !== 'py') op = null;
    if (op === '!~' && fam !== 'rb') op = null;
    if (fam === 'php' && src.startsWith('.=', i)) op = '.=';
    if (op) {
      push({ t: 'op', v: op }, start);
      i += op.length;
      continue;
    }
    push({ t: 'op', v: c }, start);
    i++;
  }
  return toks;
}

// Reads a string starting at i. Returns { tok, end } or null.
function readString(src, i, fam, prev) {
  const c = src[i];
  let k = i;
  let prefix = '';
  // prefixes
  if (fam === 'py') {
    const m = /^([rRbBuUfF]{1,2})(['"])/.exec(src.slice(i, i + 3));
    if (m && (i === 0 || !isIdChar(src[i - 1]))) { prefix = m[1].toLowerCase(); k = i + m[1].length; }
  } else if (fam === 'cs') {
    const m = /^(\$@|@\$|\$+|@)"/.exec(src.slice(i, i + 4));
    if (m) { prefix = m[1]; k = i + m[1].length; }
  } else if (fam === 'rb' && c === '%') {
    const m = /^%([qQwWiIxr]?)([({[<|!\/])/.exec(src.slice(i, i + 3));
    const p = prev;
    const valueBefore = p && (VALUE_END.has(p.t) || p.v === ')' || p.v === ']');
    if (m && !(valueBefore && m[1] === '')) {
      const open = m[2];
      const close = { '(': ')', '{': '}', '[': ']', '<': '>' }[open] || open;
      let j = i + m[0].length;
      let depth = 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === open && open !== close) depth++;
        else if (src[j] === close) { depth--; if (depth === 0) break; }
        j++;
      }
      const body = src.slice(i + m[0].length, j);
      const kind = m[1];
      const tok = { t: 'str', v: body, parts: [] };
      if (kind === 'x') tok.shell = true;
      if (kind === 'r') tok.regex = true;
      if (kind !== 'q' && kind !== 'w' && kind !== 'i') tok.parts = interpolations(body, fam, 0, 'rb');
      return { tok, end: Math.min(src.length, j + 1) };
    }
    return null;
  }
  const q = src[k];
  if (q !== '"' && q !== "'" && q !== '`') return null;
  if (q === '`' && fam !== 'js' && fam !== 'go' && fam !== 'php' && fam !== 'rb' && fam !== 'kt') return null;
  // triple quotes
  const triple = src.startsWith(q.repeat(3), k) && (fam === 'py' || fam === 'kt' || fam === 'java' || fam === 'cs') && q !== '`';
  const openLen = triple ? 3 : 1;
  let j = k + openLen;
  const verbatim = fam === 'cs' && prefix.includes('@');
  const raw = (fam === 'go' && q === '`') || verbatim || triple && fam === 'cs';
  const stopAtNewline = !triple && q !== '`' && !verbatim && !(fam === 'php' || fam === 'rb' || fam === 'py' && false);
  while (j < src.length) {
    const ch = src[j];
    if (!raw && ch === '\\') { j += 2; continue; }
    if (verbatim && ch === '"' && src[j + 1] === '"') { j += 2; continue; }
    if (triple) {
      if (src.startsWith(q.repeat(3), j)) break;
    } else if (ch === q) break;
    if (stopAtNewline && ch === '\n' && fam !== 'php' && fam !== 'rb') break;
    // skip nested interpolation braces in templates
    if (q === '`' && fam === 'js' && ch === '$' && src[j + 1] === '{') {
      j = skipBraces(src, j + 1);
      continue;
    }
    if (q !== "'" && src[j + 1] === '{' && ((fam === 'rb' && ch === '#') || (fam === 'kt' && ch === '$'))) {
      j = skipBraces(src, j + 1);
      continue;
    }
    if (q === '"' && fam === 'php' && ch === '{' && src[j + 1] === '$') {
      j = skipBraces(src, j);
      continue;
    }
    j++;
  }
  const body = src.slice(k + openLen, j);
  const end = Math.min(src.length, j + (src[j] === q ? openLen : 0));
  const tok = { t: 'str', v: body, parts: [], q };
  let mode = null;
  if (fam === 'js' && q === '`') mode = 'js';
  else if (fam === 'py' && prefix.includes('f')) mode = 'py';
  else if (fam === 'cs' && prefix.includes('$')) mode = 'cs';
  else if (fam === 'kt' && q === '"') mode = 'kt';
  else if (fam === 'php' && (q === '"' || q === '`')) mode = 'php';
  else if (fam === 'rb' && (q === '"' || q === '`')) mode = 'rb';
  if (mode) tok.parts = interpolations(body, fam, 0, mode);
  if ((fam === 'php' || fam === 'rb') && q === '`') tok.shell = true;
  if (fam === 'py' && prefix.includes('r')) tok.rawPrefix = true;
  if (fam === 'py' && prefix.includes('f')) tok.fstring = true;
  return { tok, end };
}

function skipBraces(src, j) {
  // j at '{'
  let depth = 0;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return j + 1; }
    else if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; j++;
      while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; }
    }
    j++;
  }
  return j;
}

function readRegex(src, i, fam, line) {
  let j = i + 1;
  let inClass = false;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '\n') return null;
    if (ch === '\\') { j += 2; continue; }
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) break;
    j++;
  }
  if (j >= src.length) return null;
  const body = src.slice(i + 1, j);
  j++;
  while (j < src.length && /[a-z]/i.test(src[j])) j++;
  const tok = { t: 'str', v: body, parts: [], regex: true };
  if (fam === 'rb') tok.parts = interpolations(body, fam, line, 'rb');
  return { tok, end: j };
}

// Returns the embedded expressions of an interpolated string as token lists.
function interpolations(body, fam, line, mode) {
  const out = [];
  const sub = (text) => {
    const toks = scan(text, fam, line || 1);
    for (const t of toks) { t.nl = false; t.interp = true; }
    if (toks.length) out.push(toks);
  };
  let i = 0;
  const n = body.length;
  while (i < n) {
    const ch = body[i];
    if (ch === '\\') { i += 2; continue; }
    if (mode === 'js' && ch === '$' && body[i + 1] === '{') {
      const end = skipBraces(body, i + 1);
      sub(body.slice(i + 2, end - 1));
      i = end;
      continue;
    }
    if (mode === 'rb' && ch === '#' && body[i + 1] === '{') {
      const end = skipBraces(body, i + 1);
      sub(body.slice(i + 2, end - 1));
      i = end;
      continue;
    }
    if ((mode === 'py' || mode === 'cs') && ch === '{') {
      if (body[i + 1] === '{') { i += 2; continue; }
      const end = skipBraces(body, i);
      let inner = body.slice(i + 1, end - 1);
      inner = cutFormatSpec(inner, mode);
      sub(inner);
      i = end;
      continue;
    }
    if (mode === 'kt' && ch === '$') {
      if (body[i + 1] === '{') {
        const end = skipBraces(body, i + 1);
        sub(body.slice(i + 2, end - 1));
        i = end;
        continue;
      }
      const m = /^\$([A-Za-z_]\w*)/.exec(body.slice(i));
      if (m) { sub(m[1]); i += m[0].length; continue; }
    }
    if (mode === 'php') {
      if (ch === '{' && body[i + 1] === '$') {
        const end = skipBraces(body, i);
        sub(body.slice(i + 1, end - 1));
        i = end;
        continue;
      }
      if (ch === '$' && body[i + 1] === '{') {
        const end = skipBraces(body, i + 1);
        sub('$' + body.slice(i + 2, end - 1));
        i = end;
        continue;
      }
      const m = /^\$[A-Za-z_]\w*(?:->[A-Za-z_]\w*|\[[^\]\s]*\])?/.exec(body.slice(i));
      if (m) {
        let text = m[0];
        text = text.replace(/\[([A-Za-z_]\w*)\]$/, "['$1']");
        sub(text);
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  return out;
}

function cutFormatSpec(inner, mode) {
  let depth = 0;
  for (let k = 0; k < inner.length; k++) {
    const ch = inner[k];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (depth === 0) {
      if (mode === 'py' && ch === '!' && inner[k + 1] !== '=') return inner.slice(0, k);
      if (ch === ':' && !(mode === 'cs' && inner[k + 1] === ':')) return inner.slice(0, k);
      if (mode === 'cs' && ch === ',') return inner.slice(0, k);
    }
    if (ch === '"' || ch === "'") {
      const q = ch; k++;
      while (k < inner.length && inner[k] !== q) k++;
    }
  }
  return inner;
}

module.exports = { lex, FAMILY };
