// Lexer for the M language. Context sensitive in the same places the language
// is: quote vs transpose, whitespace inside [] and {}, `end` inside indexing,
// command syntax (`hold on`), block comments and `...` continuation.
//
// Tokens: { type, value, line, col, sp }
//   type: 'num' (value: number, imag: bool, cls) | 'str' (char) | 'dstr' (string)
//         'id' | 'kw' | 'op' | 'nl' | 'endval' | 'cmd' (value: name, args: string[])
//         'shell' (value: text) | 'eof'
//   sp: true when whitespace precedes the token on the same line.
import { MError } from '../value.js';

/**
 * Octave's specific end keywords and the block each one closes. The lexer
 * returns them as an `end` keyword token with `form` set to the word.
 */
export const END_FORMS = {
  endif: 'if', endfor: 'for', endparfor: 'parfor', endwhile: 'while', endswitch: 'switch', endfunction: 'function',
  end_try_catch: 'try', end_unwind_protect: 'unwind_protect', endclassdef: 'classdef', endproperties: 'properties',
  endmethods: 'methods', endevents: 'events', endenumeration: 'enumeration',
};
/** Octave block keywords: do … until, unwind_protect … unwind_protect_cleanup … end_unwind_protect. */
export const OCTAVE_KEYWORDS = ['do', 'until', 'unwind_protect', 'unwind_protect_cleanup', ...Object.keys(END_FORMS)];

export const KEYWORDS = new Set([
  'break', 'case', 'catch', 'classdef', 'continue', 'else', 'elseif', 'end', 'for', 'function', 'global',
  'if', 'otherwise', 'parfor', 'persistent', 'return', 'spmd', 'switch', 'try', 'while',
  ...OCTAVE_KEYWORDS,
]);
const BLOCK_OPENERS = new Set(['if', 'for', 'parfor', 'while', 'switch', 'try', 'function', 'classdef', 'spmd', 'do', 'unwind_protect']);
const CLASS_SECTIONS = new Set(['properties', 'methods', 'events', 'enumeration']);
const NO_COMMAND = new Set(['classdef', 'properties', 'events', 'enumeration', 'arguments', 'methods']);

// three-character operators first: Octave's element-wise power `.**` and the element-wise assignment operators
const OPS3 = ['.**', '.*=', './=', '.\\=', '.^='];
// operator assignment (x += 1): only at the top level of a statement
const ASSIGN_OPS = new Set(['+=', '-=', '*=', '/=', '\\=', '^=', '|=', '&=', '.*=', './=', '.\\=', '.^=']);
const OPS2 = ['==', '~=', '!=', '<=', '>=', '&&', '||', '**', '+=', '-=', '*=', '/=', '\\=', '^=', '|=', '&=', '.*', './', '.\\', '.^', ".'"];
const OPS1 = '+-*/\\^<>&|~!=:,;()[]{}.@?';
const CMD_OPS = ['==', '~=', '!=', '<=', '>=', '&&', '||', '.*', './', '.\\', '.^', '+', '-', '*', '/', '\\', '^', '<', '>', '&', '|', ':'];

const isDigit = (c) => c >= '0' && c <= '9';
const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isIdChar = (c) => isIdStart(c) || isDigit(c) || c === '_';
const isSpace = (c) => c === ' ' || c === '\t' || c === '\f' || c === '\v' || c === ' ';

export function parseError(msg, line, col, file) {
  const where = file ? `File: ${file} Line: ${line} Column: ${col}` : `Line: ${line} Column: ${col}`;
  const e = new MError('core:parse', `${msg}`);
  e.extra.parse = { line, col, file, where };
  e.parseLine = line;
  return e;
}

/**
 * @param {string} src
 * @param {{isVar?: (name:string)=>boolean, file?: string, commandSyntax?: boolean}} opts
 */
export function lex(src, opts = {}) {
  const toks = [];
  const n = src.length;
  let i = 0, line = 1, lineStart = 0;
  const stack = []; // '(', '[', '{'
  const blocks = []; // keyword blocks
  let sp = false;
  const cmdOk = opts.commandSyntax !== false;
  const isVar = opts.isVar || null;

  const prev = () => (toks.length ? toks[toks.length - 1] : null);
  const inMatrix = () => stack.length > 0 && stack[stack.length - 1] !== '(';
  const inIndex = () => stack.includes('(') || stack.includes('{');
  const push = (type, value, start, extra) => {
    const t = { type, value, line, col: start - lineStart + 1, sp };
    if (extra) Object.assign(t, extra);
    toks.push(t);
    sp = false;
    return t;
  };
  const err = (msg) => { throw parseError(msg, line, i - lineStart + 1, opts.file); };
  const atStmtStart = () => {
    if (stack.length) return false;
    const p = prev();
    if (!p) return true;
    if (p.type === 'nl') return true;
    if (p.type === 'op' && (p.value === ';' || p.value === ',')) return true;
    if (p.type === 'kw' && (p.value === 'else' || p.value === 'try' || p.value === 'otherwise' || p.value === 'do' || p.value === 'unwind_protect' || p.value === 'unwind_protect_cleanup')) return true;
    return false;
  };
  const valueEnding = (p) => {
    if (!p) return false;
    if (p.type === 'num' || p.type === 'str' || p.type === 'dstr' || p.type === 'id' || p.type === 'endval') return true;
    if (p.type === 'op') return p.value === ')' || p.value === ']' || p.value === '}' || p.value === "'" || p.value === ".'";
    return false;
  };
  const restOfLineBlank = (j) => { while (j < n && isSpace(src[j])) j++; return j >= n || src[j] === '\n' || src[j] === '\r'; };
  // only blanks, then ; , a comment or the end of the line
  const restIsStatementEnd = (j) => { while (j < n && isSpace(src[j])) j++; return j >= n || src[j] === '\n' || src[j] === '\r' || src[j] === ';' || src[j] === ',' || src[j] === '%' || src[j] === '#'; };
  const lineBlankBefore = (j) => { for (let k = lineStart; k < j; k++) if (!isSpace(src[k])) return false; return true; };
  const newline = () => {
    // called with src[i] at '\n' or '\r'
    if (src[i] === '\r' && src[i + 1] === '\n') i++;
    i++;
    line++;
    lineStart = i;
  };
  const skipToEol = () => { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; };
  const emitNl = () => {
    const p = prev();
    if (stack.length && stack[stack.length - 1] === '(') { sp = true; return; }
    if (p && p.type === 'nl') return;
    push('nl', '\n', i);
  };

  function blockComment() {
    // at '%{' (or Octave's '#{') alone on a line
    let depth = 0;
    for (;;) {
      if (i >= n) return;
      const eol = (() => { let j = i; while (j < n && src[j] !== '\n' && src[j] !== '\r') j++; return j; })();
      const text = src.slice(i, eol).trim();
      if (text === '%{' || text === '#{') depth++;
      else if (text === '%}' || text === '#}') depth--;
      i = eol;
      if (depth === 0) return;
      if (i < n) newline();
    }
  }

  function commandArgs(j) {
    // parse command-syntax words starting at j until ; , % or end of line
    const args = [];
    let cur = null;
    while (j < n) {
      const c = src[j];
      if (c === '\n' || c === '\r') break;
      if (isSpace(c)) { if (cur !== null) { args.push(cur); cur = null; } j++; continue; }
      if (cur === null && (c === ';' || c === ',' || c === '%' || c === '#')) break;
      if (c === '.' && src.startsWith('...', j) && cur === null) { j = n; while (j < n) j++; break; }
      if (c === "'") {
        j++;
        cur = cur || '';
        for (;;) {
          if (j >= n || src[j] === '\n' || src[j] === '\r') err('Unterminated character vector.');
          if (src[j] === "'") { if (src[j + 1] === "'") { cur += "'"; j += 2; continue; } j++; break; }
          cur += src[j++];
        }
        continue;
      }
      if (cur !== null && (c === ';' || c === ',')) { args.push(cur); cur = null; break; }
      cur = (cur || '') + c;
      j++;
    }
    if (cur !== null) args.push(cur);
    return { args, end: j };
  }

  function tryCommand(name, j, start) {
    if (!cmdOk || !atStmtStart()) return false;
    if (blocks.length && NO_COMMAND.has(blocks[blocks.length - 1])) return false;
    if (!isSpace(src[j])) return false;
    let k = j;
    while (k < n && isSpace(src[k])) k++;
    const c = src[k];
    if (k >= n || c === '\n' || c === '\r' || c === ';' || c === ',' || c === '%' || c === '#') return false;
    if (c === '(') return false;
    if (c === '=' && src[k + 1] !== '=') return false;
    // x += 1, x .*= 2 (operator assignment), x++ / x-- are statements, not commands
    if (/^(\.?[*/\\^]|[+\-|&])=(?!=)/.test(src.slice(k, k + 4))) return false;
    if ((src.startsWith('++', k) || src.startsWith('--', k)) && restIsStatementEnd(k + 2)) return false;
    if (isVar && isVar(name)) return false;
    if (c === '.' && src.startsWith('...', k)) return false;
    for (const op of CMD_OPS) {
      if (src.startsWith(op, k)) {
        const after = src[k + op.length];
        if (after === undefined || isSpace(after) || after === '\n' || after === '\r') return false;
        break;
      }
    }
    const { args, end } = commandArgs(k);
    push('cmd', name, start, { args });
    i = end;
    return true;
  }

  while (i < n) {
    const c = src[i];
    if (isSpace(c)) { i++; sp = true; continue; }
    if (c === '\n' || c === '\r') { emitNl(); newline(); sp = false; continue; }
    if (c === '%' || c === '#') {
      if (src[i + 1] === '{' && lineBlankBefore(i) && restOfLineBlank(i + 2)) { blockComment(); continue; }
      skipToEol();
      continue;
    }
    if (c === '.' && src[i + 1] === '.' && src[i + 2] === '.') {
      // continuation: ignore the rest of the line
      skipToEol();
      if (i < n) newline();
      sp = true;
      continue;
    }
    const start = i;
    // shell escape
    if (c === '!' && atStmtStart() && src[i + 1] !== '=') {
      i++;
      const s = i; skipToEol();
      push('shell', src.slice(s, i).trim(), start);
      continue;
    }
    // numbers
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let cls = 'double', value;
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X' || src[i + 1] === 'b' || src[i + 1] === 'B')) {
        const hex = src[i + 1] === 'x' || src[i + 1] === 'X';
        let j = i + 2; const s = j;
        while (j < n && (hex ? /[0-9a-fA-F]/.test(src[j]) : (src[j] === '0' || src[j] === '1'))) j++;
        if (j === s) err('Invalid number literal.');
        const digits = src.slice(s, j);
        value = parseInt(digits, hex ? 16 : 2);
        const bits = hex ? digits.length * 4 : digits.length;
        const m = /^([us])(8|16|32|64)/.exec(src.slice(j, j + 3));
        if (m) { cls = (m[1] === 'u' ? 'uint' : 'int') + m[2]; j += m[0].length; if (m[1] === 's') { const w = +m[2]; if (value >= 2 ** (w - 1)) value -= 2 ** w; } }
        else cls = bits <= 8 ? 'uint8' : bits <= 16 ? 'uint16' : bits <= 32 ? 'uint32' : 'uint64';
        i = j;
        if (isIdChar(src[i] || '')) err('Invalid number literal.');
        push('num', value, start, { imag: false, cls });
        continue;
      }
      let j = i;
      while (j < n && isDigit(src[j])) j++;
      if (src[j] === '.' && !(src[j + 1] === '*' || src[j + 1] === '/' || src[j + 1] === '\\' || src[j + 1] === '^' || src[j + 1] === "'")) {
        j++;
        while (j < n && isDigit(src[j])) j++;
      }
      if ((src[j] === 'e' || src[j] === 'E' || src[j] === 'd' || src[j] === 'D') && (isDigit(src[j + 1]) || ((src[j + 1] === '+' || src[j + 1] === '-') && isDigit(src[j + 2])))) {
        j += 2;
        while (j < n && isDigit(src[j])) j++;
      }
      value = Number(src.slice(i, j).replace(/[dD]/, 'e'));
      let imag = false;
      if ((src[j] === 'i' || src[j] === 'j' || src[j] === 'I' || src[j] === 'J') && !isIdChar(src[j + 1] || '')) { imag = true; j++; }
      i = j;
      push('num', value, start, { imag, cls });
      continue;
    }
    // identifiers and keywords
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isIdChar(src[j])) j++;
      const word = src.slice(i, j);
      const p = prev();
      const afterDot = p && p.type === 'op' && p.value === '.' && !p.sp && !sp;
      // `do` and `until` are keywords only where a loop can start / end (do = 1 stays a variable)
      let kwWord = !afterDot && KEYWORDS.has(word);
      if (kwWord && word === 'do') {
        let k = j; while (k < n && isSpace(src[k])) k++;
        const nx = src[k];
        kwWord = atStmtStart() && !(nx === '=' && src[k + 1] !== '=') && nx !== '(' && nx !== '.' && nx !== '{' && !(nx === "'" && k === j);
      } else if (kwWord && word === 'until') kwWord = atStmtStart() && blocks.length > 0 && blocks[blocks.length - 1] === 'do';
      if (kwWord) {
        if (word === 'end' && inIndex()) { i = j; push('endval', 'end', start); continue; }
        i = j;
        if (Object.prototype.hasOwnProperty.call(END_FORMS, word)) {
          push('kw', 'end', start, { form: word });
          blocks.pop();
          continue;
        }
        push('kw', word, start);
        if (BLOCK_OPENERS.has(word)) blocks.push(word);
        else if (word === 'end' || word === 'until') blocks.pop();
        continue;
      }
      // contextual block keywords inside classdef / functions
      if (!afterDot && atStmtStart() && blocks.length) {
        const top = blocks[blocks.length - 1];
        let k = j; while (k < n && isSpace(src[k])) k++;
        const nx = src[k];
        const opensBlock = k >= n || nx === '\n' || nx === '\r' || nx === '%' || nx === '#' || nx === '(' || nx === ';' || nx === ',';
        if (opensBlock && ((top === 'classdef' && CLASS_SECTIONS.has(word)) || (top === 'function' && word === 'arguments' && nx !== ';' && nx !== ','))) {
          i = j;
          push('id', word, start, { section: true });
          blocks.push(word);
          continue;
        }
      }
      if (!afterDot && tryCommand(word, j, start)) continue;
      i = j;
      push('id', word, start);
      continue;
    }
    // strings
    if (c === '"') {
      let j = i + 1, s = '';
      for (;;) {
        if (j >= n || src[j] === '\n' || src[j] === '\r') err('String is not terminated properly.');
        if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } j++; break; }
        s += src[j++];
      }
      i = j;
      push('dstr', s, start);
      continue;
    }
    if (c === "'") {
      const p = prev();
      if (valueEnding(p) && !(inMatrix() && sp)) { i++; push('op', "'", start); continue; }
      let j = i + 1, s = '';
      for (;;) {
        if (j >= n || src[j] === '\n' || src[j] === '\r') err('Character vector is not terminated properly.');
        if (src[j] === "'") { if (src[j + 1] === "'") { s += "'"; j += 2; continue; } j++; break; }
        s += src[j++];
      }
      i = j;
      push('str', s, start);
      continue;
    }
    // operators
    let op = null;
    // x++ / x-- after a value at the end of a statement, ++x / --x as a whole statement
    if ((c === '+' || c === '-') && src[i + 1] === c && !stack.length
      && ((valueEnding(prev()) && !sp && restIsStatementEnd(i + 2)) || (atStmtStart() && /^[A-Za-z]\w*[ \t]*([;,%#\r\n]|$)/.test(src.slice(i + 2, i + 80))))) op = c + c;
    if (!op) for (const o of OPS3) if (src.startsWith(o, i)) { op = o; break; }
    if (!op) for (const o of OPS2) if (src.startsWith(o, i)) { op = o; break; }
    // operator assignment only at the top level (not inside brackets, where `=` is not an assignment)
    if (op && ASSIGN_OPS.has(op) && (stack.length || src[i + op.length] === '=')) op = op.slice(0, -1) || null;
    if (!op && OPS1.includes(c)) op = c;
    if (!op) err(`Invalid text character "${c}".`);
    if (op === '!=') op = '~=';
    if (op === '!') op = '~';
    if (op === '**' || op === '.**') { i += op.length; push('op', op === '**' ? '^' : '.^', start); continue; }
    i += op.length;
    if (op === '(' || op === '[' || op === '{') stack.push(op);
    else if (op === ')' || op === ']' || op === '}') {
      const want = op === ')' ? '(' : op === ']' ? '[' : '{';
      if (stack.length && stack[stack.length - 1] === want) stack.pop();
      else { i -= op.length; err(`Invalid use of "${op}" or unbalanced brackets.`); }
    }
    push('op', op, start);
  }
  if (stack.length) err(`Unbalanced or unexpected bracket "${stack[stack.length - 1]}"; the expression is not complete.`);
  push('nl', '\n', i);
  push('eof', null, i);
  return toks;
}
