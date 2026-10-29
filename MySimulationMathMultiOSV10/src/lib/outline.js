// 문서 구조 / Outline of an M file (pure; tested in test/panels.test.mjs):
// %% sections, classdef, its properties / methods / events blocks, functions
// (main, local, nested, methods), each with its 1-based line and depth.
//
//   outlineOf(text) → [{ kind, name, line, depth }]
//     kind: 'section' | 'classdef' | 'block' | 'function' | 'local' | 'nested' | 'method'

const OPENERS = new Set(['if', 'for', 'parfor', 'while', 'switch', 'try', 'spmd', 'function', 'classdef', 'properties', 'methods', 'events', 'enumeration']);

/** The code of a line with comments and quoted text removed (quotes kept as empty). */
export function stripLine(line) {
  let out = '';
  let prev = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '%' || (c === '.' && line.startsWith('...', i))) break;
    if (c === '"' || (c === "'" && !/[\w)\]}.']/.test(prev))) {
      const q = c;
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === q) { if (line[j + 1] === q) { j += 2; continue; } break; }
        j += 1;
      }
      out += q + q;
      i = j;
      prev = q;
      continue;
    }
    out += c;
    if (c !== ' ' && c !== '\t') prev = c;
  }
  return out;
}

/** The keywords that open / close blocks in a stripped line, in order (index-`end` inside () / {} skipped). */
function blockTokens(code) {
  const toks = [];
  let depth = 0;
  let stmtStart = true;
  const re = /[A-Za-z_]\w*|[()[\]{}]|[;,]|\S/g;
  let m;
  while ((m = re.exec(code))) {
    const w = m[0];
    if (w === '(' || w === '[' || w === '{') { depth += 1; stmtStart = false; continue; }
    if (w === ')' || w === ']' || w === '}') { depth = Math.max(0, depth - 1); continue; }
    if (w === ';' || w === ',') { if (!depth) stmtStart = true; continue; }
    if (depth === 0 && w === 'end') { toks.push('end'); stmtStart = false; continue; }
    if (depth === 0 && stmtStart && OPENERS.has(w)) {
      // "properties" / "methods" as a plain name (x = methods(obj)) is not a block
      const rest = code.slice(re.lastIndex);
      if ((w === 'properties' || w === 'methods' || w === 'events' || w === 'enumeration') && /^\s*[=(]/.test(rest)) { stmtStart = false; continue; }
      toks.push(w);
    }
    stmtStart = false;
  }
  return toks;
}

/** The name in a function line: "function [a, b] = name(x)" → "name" (get.X / set.X kept). */
export function functionName(code) {
  const m = /^\s*function\b\s*(?:(?:\[[^\]]*\]|[A-Za-z_]\w*)\s*=\s*)?([A-Za-z_][\w.]*)/.exec(code);
  return m ? m[1] : '';
}

function scan(lines, endTerminated) {
  const items = [];
  const stack = []; // { kw, item? }
  let sawCode = false;
  let classdef = false;
  const fnDepth = () => stack.filter((f) => f.kw === 'function').length;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const sec = /^\s*%%(?:\s+(.*?))?\s*$/.exec(raw);
    if (sec || /^\s*%%(\s|$)/.test(raw)) {
      const name = sec && sec[1] ? sec[1] : '';
      items.push({ kind: 'section', name, line: i + 1, depth: stack.filter((f) => f.kw === 'function' || f.kw === 'classdef' || f.kw === 'methods').length });
      continue;
    }
    const code = stripLine(raw);
    if (!code.trim()) continue;
    const toks = blockTokens(code);
    for (const w of toks) {
      if (w === 'end') {
        stack.pop();
        continue;
      }
      if (w === 'function' && !endTerminated) {
        // functions without "end": a new function closes the previous one
        while (stack.length && stack[stack.length - 1].kw !== 'methods') stack.pop();
      }
      if (w === 'classdef') {
        const m = /^\s*classdef\b\s*(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/.exec(code);
        items.push({ kind: 'classdef', name: m ? m[1] : '', line: i + 1, depth: 0 });
        classdef = true;
      } else if (w === 'properties' || w === 'methods' || w === 'events' || w === 'enumeration') {
        if (classdef && stack.length && stack[stack.length - 1].kw === 'classdef') items.push({ kind: 'block', name: w, line: i + 1, depth: 1 });
      } else if (w === 'function') {
        const name = functionName(code);
        const inMethods = stack.length && stack[stack.length - 1].kw === 'methods';
        const nested = fnDepth() > 0;
        let kind;
        if (inMethods) kind = 'method';
        else if (nested) kind = 'nested';
        else if (!sawCode && !classdef && !items.some((x) => x.kind === 'function' || x.kind === 'local')) kind = 'function';
        else kind = 'local';
        const depth = inMethods ? 2 : nested ? fnDepth() : 0;
        items.push({ kind, name, line: i + 1, depth });
      }
      stack.push({ kw: w });
    }
    if (!toks.length || toks[0] !== 'function') { if (!stack.length) sawCode = true; }
  }
  return { items, open: stack.length };
}

/** The outline of an M file's text. */
export function outlineOf(text) {
  const lines = String(text || '').split(/\r?\n/);
  const a = scan(lines, true);
  if (a.open === 0) return a.items;
  // Unbalanced: functions are probably not closed with "end".
  const b = scan(lines, false);
  return b.open <= a.open ? b.items : a.items;
}
