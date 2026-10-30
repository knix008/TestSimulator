// 자동 들여쓰기 of M code: every line gets the indentation of its block depth
// (if / for / while / switch-case / try-catch / function / classdef sections …),
// `unit` per level. Keywords inside brackets (x(end)), strings and comments do
// not count; `if x, y = 1; end` on one line stays one level; a line continued
// with ... indents its next line once more; %{ … %} block comments keep their
// own indentation. Functions are indented only when the file ends them with
// `end` (a file of functions without `end` keeps their bodies at the margin).
// Pure (tested in test/indent.test.mjs).

const OPEN = new Set(['if', 'for', 'parfor', 'while', 'switch', 'try', 'function', 'classdef', 'properties', 'methods', 'events', 'enumeration', 'spmd', 'arguments']);
const MID = new Set(['else', 'elseif', 'catch']); // close the branch above, open the next one
const CASE = new Set(['case', 'otherwise']);

/** The code of a line without strings and comments, and whether it is continued with '...'. */
function codeOf(line) {
  let out = '';
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) { if (line[i + 1] === q) { i++; continue; } q = null; } continue; }
    if (c === '%') break;
    if (c === '.' && line.startsWith('...', i)) return { code: out, cont: true };
    // ' starts a string unless it is a transpose (after a name, number, closing bracket, ' or .')
    if (c === '"' || (c === "'" && !/[\w)\]}'.]/.test(out.trimEnd() === out ? out[out.length - 1] || '' : ' '))) { q = c; out += ' '; continue; }
    out += c;
  }
  return { code: out, cont: false };
}

/** Block keywords of a line at bracket depth 0, in order. */
function keywordsOf(code) {
  const out = [];
  let depth = 0;
  const re = /[A-Za-z_]\w*|[()[\]{}]|\.\s*[A-Za-z_]\w*/g;
  for (let m; (m = re.exec(code));) {
    const t = m[0];
    if (t === '(' || t === '[' || t === '{') { depth++; continue; }
    if (t === ')' || t === ']' || t === '}') { depth = Math.max(0, depth - 1); continue; }
    if (depth || t.startsWith('.')) continue; // inside brackets, or a field name (s.end)
    if (OPEN.has(t) || MID.has(t) || CASE.has(t) || t === 'end') out.push(t);
  }
  return out;
}

/** Whether the file's functions end with `end` (counts the other blocks against the ends). */
function functionsHaveEnd(lines) {
  let open = 0, fns = 0, ends = 0;
  for (const l of lines) {
    for (const k of keywordsOf(codeOf(l).code)) {
      if (k === 'function') fns++;
      else if (OPEN.has(k)) open++;
      else if (k === 'end') ends++;
    }
  }
  return fns > 0 && ends >= open + fns;
}

/** Re-indents M text; `unit` is the indentation of one level (e.g. '    ' or '\t'). */
export function reindentM(text, unit = '    ') {
  const nl = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = String(text).split(/\r?\n/);
  const fnEnd = functionsHaveEnd(lines);
  const stack = []; // block kinds: 'block', 'switch', 'case', 'function'
  let cont = false;
  let blockComment = false;
  const out = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (blockComment) { out.push(raw.replace(/\s+$/, '')); if (/^%\}\s*$/.test(trimmed)) blockComment = false; continue; }
    if (!trimmed) { out.push(''); continue; }
    if (/^%\{\s*$/.test(trimmed)) { out.push(unit.repeat(stack.length) + trimmed); blockComment = true; continue; }
    const { code, cont: nextCont } = codeOf(trimmed);
    const kws = keywordsOf(code);
    // how far the line itself moves out: a leading end / else / case closes before the line
    let depth = stack.length;
    const first = kws[0];
    const leading = first && new RegExp(`^${first}\\b`).test(code.trim());
    if (leading && first === 'end') depth = Math.max(0, depth - (stack[stack.length - 1] === 'case' ? 2 : 1));
    else if (leading && MID.has(first)) depth = Math.max(0, depth - 1);
    else if (leading && CASE.has(first) && stack[stack.length - 1] === 'case') depth = Math.max(0, depth - 1);
    // a function without `end` in such a file: it starts at the margin and closes the one before it
    if (leading && first === 'function' && !fnEnd) { stack.length = 0; depth = 0; }
    const extra = cont ? 1 : 0;
    out.push(unit.repeat(depth + extra) + trimmed);
    // the blocks this line opens and closes
    for (const k of kws) {
      if (k === 'end') {
        if (stack[stack.length - 1] === 'case') stack.pop();
        stack.pop();
      } else if (MID.has(k)) {
        /* same depth: the branch above is closed and the next one opened */
      } else if (CASE.has(k)) {
        if (stack[stack.length - 1] !== 'case') stack.push('case');
      } else if (k === 'function') {
        if (fnEnd) stack.push('function');
      } else if (k === 'switch') stack.push('switch');
      else stack.push('block');
    }
    cont = nextCont;
  }
  return out.join(nl);
}
