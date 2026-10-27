// Lexer and parser for the M-language subset the simulation engine runs on its
// own: block parameter expressions, Fcn blocks, M Function blocks, mask
// initialization code and state chart actions. When a full interpreter
// session is present the engine still uses this parser (fast, no worker
// round trips) and only forwards unknown functions to ctx.call.
import { MError } from '../../value.js';

const KEYWORDS = new Set(['if', 'elseif', 'else', 'end', 'for', 'while', 'break', 'continue', 'return', 'switch', 'case', 'otherwise', 'function', 'persistent', 'global', 'try', 'catch', 'parfor', 'endif', 'endfor', 'endwhile', 'endfunction', 'endswitch']);

export function lex(src) {
  const toks = [];
  let i = 0, line = 1;
  const n = src.length;
  const push = (type, value, sp) => toks.push({ type, value, sp, line });
  let bracketDepth = 0;
  while (i < n) {
    let sp = false;
    // whitespace, comments, continuation
    for (;;) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\r') { i++; sp = true; continue; }
      if (c === '.' && src.startsWith('...', i)) { while (i < n && src[i] !== '\n') i++; i++; line++; sp = true; continue; }
      if (c === '%' || (c === '#' && bracketDepth === 0)) {
        if (src.startsWith('%{', i) && /^%\{\s*$/m.test(src.slice(i, src.indexOf('\n', i) < 0 ? n : src.indexOf('\n', i)))) {
          const e = src.indexOf('%}', i); i = e < 0 ? n : e + 2; continue;
        }
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      break;
    }
    if (i >= n) break;
    const c = src[i];
    const prev = toks[toks.length - 1];
    if (c === '\n') { push('nl', '\n', sp); i++; line++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = /^(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eEdD][+-]?\d+)?)([ij](?![A-Za-z0-9_]))?/.exec(src.slice(i));
      let text = m[0];
      const imag = !!m[1];
      const body = imag ? text.slice(0, -1) : text;
      const v = /^0[xX]/.test(body) ? parseInt(body, 16) : parseFloat(body.replace(/[dD]/, 'e'));
      push('num', { v, imag }, sp); i += text.length; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      const w = m[0];
      push(KEYWORDS.has(w) ? 'kw' : 'id', w, sp); i += w.length; continue;
    }
    if (c === '"') {
      let j = i + 1, s = '';
      while (j < n) { if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; } if (src[j] === '\n') break; s += src[j++]; }
      push('str', { v: s, dq: true }, sp); i = j + 1; continue;
    }
    if (c === "'") {
      const valueEnd = prev && !(sp && bracketDepth > 0) && (prev.type === 'id' || prev.type === 'num' || prev.type === 'str' || (prev.type === 'op' && (prev.value === ')' || prev.value === ']' || prev.value === '}' || prev.value === "'" || prev.value === ".'")) || (prev.type === 'kw' && prev.value === 'end'));
      if (valueEnd) { push('op', "'", sp); i++; continue; }
      let j = i + 1, s = '';
      while (j < n) { if (src[j] === "'") { if (src[j + 1] === "'") { s += "'"; j += 2; continue; } break; } if (src[j] === '\n') break; s += src[j++]; }
      push('str', { v: s, dq: false }, sp); i = j + 1; continue;
    }
    const three = src.slice(i, i + 3), two = src.slice(i, i + 2);
    if (['.^\'', '...'].includes(three)) { push('op', three, sp); i += 3; continue; }
    if (['==', '~=', '!=', '<=', '>=', '&&', '||', '.*', './', '.\\', '.^', ".'", '++', '--', '+=', '-=', '*=', '/='].includes(two)) {
      if ((two === '++' || two === '--') ) { push('op', c, sp); i++; continue; }
      if (['+=', '-=', '*=', '/='].includes(two)) { push('op', two, sp); i += 2; continue; }
      push('op', two === '!=' ? '~=' : two, sp); i += 2; continue;
    }
    if ('+-*/\\^<>=&|~!()[]{},;:.@'.includes(c)) {
      if (c === '[' || c === '{' ) bracketDepth++;
      if ((c === ']' || c === '}') && bracketDepth > 0) bracketDepth--;
      push('op', c === '!' ? '~' : c, sp); i++; continue;
    }
    throw new MError('sim:expr:syntax', `Invalid character '${c}' in expression.`);
  }
  push('eof', null, false);
  return toks;
}

export function parseProgram(src) {
  const p = new Parser(lex(src));
  const body = p.statements(['eof']);
  const funcs = {};
  const main = [];
  for (const s of body) { if (s.type === 'Function') funcs[s.name] = s; else main.push(s); }
  return { body: main, funcs };
}
export function parseExpression(src) {
  const p = new Parser(lex(src));
  p.skipNl();
  const e = p.expr();
  p.skipNl();
  if (p.peek().type !== 'eof') {
    if (p.peek().value === ';') { p.next(); p.skipNl(); }
    if (p.peek().type !== 'eof') throw new MError('sim:expr:syntax', `Unexpected '${p.peek().value}' in expression.`);
  }
  return e;
}

class Parser {
  constructor(toks) { this.t = toks; this.i = 0; this.inMatrix = 0; this.inIndex = 0; }
  peek(k = 0) { return this.t[this.i + k]; }
  next() { return this.t[this.i++]; }
  isOp(v, k = 0) { const t = this.peek(k); return t.type === 'op' && t.value === v; }
  isKw(v) { const t = this.peek(); return t.type === 'kw' && t.value === v; }
  expect(v) { const t = this.next(); if (t.value !== v) throw new MError('sim:expr:syntax', `Expected '${v}' but found '${t.value ?? 'end of text'}' (line ${t.line}).`); return t; }
  skipNl() { while (this.peek().type === 'nl' || this.isOp(';') || this.isOp(',')) this.next(); }

  statements(terminators) {
    const out = [];
    for (;;) {
      this.skipNl();
      const t = this.peek();
      if (t.type === 'eof') { if (terminators.includes('eof')) break; throw new MError('sim:expr:syntax', 'Missing "end".'); }
      if (t.type === 'kw' && terminators.includes(t.value)) break;
      if (t.type === 'kw' && ['end', 'endif', 'endfor', 'endwhile', 'endfunction', 'endswitch'].includes(t.value) && terminators.includes('end')) break;
      out.push(this.statement());
    }
    return out;
  }
  endKw() { const t = this.next(); if (!(t.type === 'kw' && /^end/.test(t.value))) throw new MError('sim:expr:syntax', `Expected 'end' (line ${t.line}).`); }
  terminator() {
    const t = this.peek();
    if (t.type === 'op' && t.value === ';') { this.next(); return false; }
    if (t.type === 'op' && t.value === ',') { this.next(); return true; }
    if (t.type === 'nl') { this.next(); return true; }
    return true;
  }
  statement() {
    const t = this.peek();
    const line = t.line;
    if (t.type === 'kw') {
      switch (t.value) {
        case 'if': {
          this.next();
          const clauses = [];
          let cond = this.expr();
          let body = this.statements(['elseif', 'else', 'end']);
          clauses.push({ cond, body });
          let els = null;
          for (;;) {
            if (this.isKw('elseif')) { this.next(); cond = this.expr(); body = this.statements(['elseif', 'else', 'end']); clauses.push({ cond, body }); continue; }
            if (this.isKw('else')) { this.next(); els = this.statements(['end']); }
            break;
          }
          this.endKw();
          return { type: 'If', clauses, els, line };
        }
        case 'for': case 'parfor': {
          this.next();
          const paren = this.isOp('(');
          if (paren) this.next();
          const v = this.next();
          if (v.type !== 'id') throw new MError('sim:expr:syntax', 'Expected a loop variable.');
          this.expect('=');
          const e = this.expr();
          if (paren) { if (this.isOp(',')) { this.next(); this.expr(); } this.expect(')'); }
          const body = this.statements(['end']);
          this.endKw();
          return { type: 'For', var: v.value, e, body, line };
        }
        case 'while': {
          this.next();
          const cond = this.expr();
          const body = this.statements(['end']);
          this.endKw();
          return { type: 'While', cond, body, line };
        }
        case 'switch': {
          this.next();
          const e = this.expr();
          const cases = []; let otherwise = null;
          this.skipNl();
          while (this.isKw('case') || this.isKw('otherwise')) {
            if (this.isKw('case')) { this.next(); const v = this.expr(); const body = this.statements(['case', 'otherwise', 'end']); cases.push({ v, body }); }
            else { this.next(); otherwise = this.statements(['case', 'otherwise', 'end']); }
          }
          this.endKw();
          return { type: 'Switch', e, cases, otherwise, line };
        }
        case 'try': {
          this.next();
          const body = this.statements(['catch', 'end']);
          let id = null, handler = [];
          if (this.isKw('catch')) { this.next(); if (this.peek().type === 'id' && this.peek(1).type === 'nl') id = this.next().value; handler = this.statements(['end']); }
          this.endKw();
          return { type: 'Try', body, id, handler, line };
        }
        case 'break': this.next(); this.terminator(); return { type: 'Break', line };
        case 'continue': this.next(); this.terminator(); return { type: 'Continue', line };
        case 'return': this.next(); this.terminator(); return { type: 'Return', line };
        case 'persistent': case 'global': {
          this.next(); const names = [];
          while (this.peek().type === 'id') names.push(this.next().value);
          this.terminator();
          return { type: t.value === 'persistent' ? 'Persistent' : 'Global', names, line };
        }
        case 'function': return this.func();
        default: throw new MError('sim:expr:syntax', `Unexpected '${t.value}' (line ${line}).`);
      }
    }
    // multiple assignment [a, b] = f(...)
    if (this.isOp('[')) {
      const save = this.i;
      const lhs = this.tryMultiLhs();
      if (lhs) { const rhs = this.expr(); const print = this.terminator(); return { type: 'Assign', lhs, rhs, print, line }; }
      this.i = save;
    }
    // command syntax:  disp hello   (only for a few words)
    const e = this.expr();
    if (this.isOp('=') ) {
      this.next();
      if (!isLvalue(e)) throw new MError('sim:expr:syntax', `Invalid assignment target (line ${line}).`);
      const rhs = this.expr();
      const print = this.terminator();
      return { type: 'Assign', lhs: [e], rhs, print, line };
    }
    if (['+=', '-=', '*=', '/='].some((o) => this.isOp(o))) {
      const op = this.next().value[0];
      const rhs = this.expr();
      const print = this.terminator();
      return { type: 'Assign', lhs: [e], rhs: { type: 'Bin', op, a: e, b: rhs }, print, line };
    }
    if (this.isOp('+') && this.isOp('+', 1) && e.type === 'Id') { this.next(); this.next(); const print = this.terminator(); return { type: 'Assign', lhs: [e], rhs: { type: 'Bin', op: '+', a: e, b: { type: 'Num', v: 1 } }, print, line }; }
    if (this.isOp('-') && this.isOp('-', 1) && e.type === 'Id') { this.next(); this.next(); const print = this.terminator(); return { type: 'Assign', lhs: [e], rhs: { type: 'Bin', op: '-', a: e, b: { type: 'Num', v: 1 } }, print, line }; }
    const print = this.terminator();
    return { type: 'Expr', e, print, line };
  }
  tryMultiLhs() {
    this.next(); // [
    const items = [];
    try {
      while (!this.isOp(']')) {
        if (this.isOp(',')) { this.next(); continue; }
        if (this.isOp('~')) { this.next(); items.push({ type: 'Tilde' }); continue; }
        if (this.peek().type !== 'id') return null;
        this.inMatrix++;
        const e = this.postfix();
        this.inMatrix--;
        if (!isLvalue(e)) return null;
        items.push(e);
      }
      this.next();
      if (!this.isOp('=') || this.isOp('=', 1)) return null;
      this.next();
      return items;
    } catch { return null; }
  }
  func() {
    const line = this.next().line;
    let outs = [], name, params = [];
    // function [a,b] = name(x,y)  |  function a = name(x)  |  function name(x)
    if (this.isOp('[')) {
      this.next();
      while (!this.isOp(']')) { if (this.isOp(',')) { this.next(); continue; } outs.push(this.next().value); }
      this.next(); this.expect('=');
      name = this.next().value;
    } else {
      const first = this.next().value;
      if (this.isOp('=')) { this.next(); outs = [first]; name = this.next().value; } else name = first;
    }
    while (this.isOp('.')) { this.next(); name += '.' + this.next().value; }
    if (this.isOp('(')) {
      this.next();
      while (!this.isOp(')')) { if (this.isOp(',')) { this.next(); continue; } const t = this.next(); params.push(t.value === '~' ? '~' : t.value); }
      this.next();
    }
    const body = this.statements(['end', 'function', 'eof']);
    if (this.peek().type === 'kw' && /^end/.test(this.peek().value)) this.next();
    return { type: 'Function', name, params, outs, body, line };
  }

  // ------------------------------------------------------------ expressions
  expr() { return this.oror(); }
  oror() { let a = this.andand(); while (this.isOp('||')) { this.next(); a = { type: 'Bin', op: '||', a, b: this.andand() }; } return a; }
  andand() { let a = this.or(); while (this.isOp('&&')) { this.next(); a = { type: 'Bin', op: '&&', a, b: this.or() }; } return a; }
  or() { let a = this.and(); while (this.isOp('|') && !this.matrixSplit()) { this.next(); a = { type: 'Bin', op: '|', a, b: this.and() }; } return a; }
  and() { let a = this.cmp(); while (this.isOp('&') && !this.matrixSplit()) { this.next(); a = { type: 'Bin', op: '&', a, b: this.cmp() }; } return a; }
  cmp() {
    let a = this.range();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op' && ['==', '~=', '<', '<=', '>', '>='].includes(t.value) && !this.matrixSplit()) { this.next(); a = { type: 'Bin', op: t.value, a, b: this.range() }; }
      else return a;
    }
  }
  range() {
    if (this.isOp(':') && this.inIndex && (this.isOp(',', 1) || this.isOp(')', 1) || this.isOp('}', 1))) { this.next(); return { type: 'Colon' }; }
    let a = this.add();
    if (this.isOp(':') && !(this.inMatrix && this.peek().sp && !this.peek(1).sp && false)) {
      this.next();
      const b = this.add();
      if (this.isOp(':')) { this.next(); const c = this.add(); return { type: 'Range', a, s: b, b: c }; }
      return { type: 'Range', a, s: null, b };
    }
    return a;
  }
  // In a matrix "[a -b]" the minus starts a new element.
  matrixSplit() {
    if (!this.inMatrix || this.inIndex) return false;
    const t = this.peek(), n = this.peek(1);
    return t.sp && !n.sp && (t.value === '+' || t.value === '-');
  }
  add() {
    let a = this.mul();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
        if (this.inMatrix && !this.inIndex && t.sp && !this.peek(1).sp) return a;
        this.next(); a = { type: 'Bin', op: t.value, a, b: this.mul() };
      } else return a;
    }
  }
  mul() {
    let a = this.unaryE();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op' && ['*', '/', '.*', './', '\\', '.\\'].includes(t.value)) { this.next(); a = { type: 'Bin', op: t.value, a, b: this.unaryE() }; }
      else return a;
    }
  }
  unaryE() {
    const t = this.peek();
    if (t.type === 'op' && (t.value === '-' || t.value === '+' || t.value === '~')) {
      this.next();
      const a = this.unaryE();
      return t.value === '+' ? a : { type: 'Un', op: t.value, a };
    }
    return this.pow();
  }
  pow() {
    let a = this.postfix();
    for (;;) {
      if (this.isOp('^') || this.isOp('.^')) {
        const op = this.next().value;
        let b;
        const t = this.peek();
        if (t.type === 'op' && (t.value === '-' || t.value === '+' || t.value === '~')) { this.next(); const x = this.postfix(); b = t.value === '+' ? x : { type: 'Un', op: t.value, a: x }; }
        else b = this.postfix();
        a = { type: 'Bin', op, a, b };
      } else return a;
    }
  }
  postfix() {
    let a = this.primary();
    for (;;) {
      const t = this.peek();
      if (t.type !== 'op') return a;
      if (t.value === '(' && !(this.inMatrix && !this.inIndex && t.sp)) {
        this.next(); const args = this.args(')'); a = { type: 'Index', obj: a, args, kind: '()' }; continue;
      }
      if (t.value === '{' && !(this.inMatrix && t.sp)) { this.next(); const args = this.args('}'); a = { type: 'Index', obj: a, args, kind: '{}' }; continue; }
      if (t.value === '.' && !t.sp) {
        this.next();
        if (this.isOp('(')) { this.next(); const e = this.expr(); this.expect(')'); a = { type: 'DynField', obj: a, e }; continue; }
        const f = this.next();
        if (f.type !== 'id' && f.type !== 'kw') throw new MError('sim:expr:syntax', 'Expected a field name after "."');
        a = { type: 'Field', obj: a, name: f.value }; continue;
      }
      if (t.value === "'" || t.value === ".'") { this.next(); a = { type: 'Post', op: t.value, a }; continue; }
      return a;
    }
  }
  args(close) {
    const args = [];
    this.inIndex++;
    const saveM = this.inMatrix; this.inMatrix = 0;
    while (this.peek().type === 'nl') this.next();
    if (this.isOp(close)) { this.next(); this.inIndex--; this.inMatrix = saveM; return args; }
    for (;;) {
      while (this.peek().type === 'nl') this.next();
      if (this.isOp(':') && (this.isOp(',', 1) || this.isOp(close, 1))) { this.next(); args.push({ type: 'Colon' }); }
      else args.push(this.expr());
      while (this.peek().type === 'nl') this.next();
      if (this.isOp(',')) { this.next(); continue; }
      this.expect(close); break;
    }
    this.inIndex--; this.inMatrix = saveM;
    return args;
  }
  primary() {
    const t = this.next();
    if (t.type === 'num') return t.value.imag ? { type: 'Imag', v: t.value.v } : { type: 'Num', v: t.value.v };
    if (t.type === 'str') return { type: 'Str', v: t.value.v, dq: t.value.dq };
    if (t.type === 'id') return { type: 'Id', name: t.value };
    if (t.type === 'kw' && t.value === 'end' && this.inIndex) return { type: 'End' };
    if (t.type === 'op') {
      if (t.value === '(') {
        const saveM = this.inMatrix, saveI = this.inIndex; this.inMatrix = 0; this.inIndex = 0;
        const e = this.expr(); this.expect(')');
        this.inMatrix = saveM; this.inIndex = saveI;
        return { type: 'Paren', e };
      }
      if (t.value === '[' || t.value === '{') return this.matrix(t.value === '[' ? ']' : '}');
      if (t.value === '@') {
        if (this.isOp('(')) {
          this.next(); const params = [];
          while (!this.isOp(')')) { if (this.isOp(',')) { this.next(); continue; } params.push(this.next().value); }
          this.next();
          const saveM = this.inMatrix, saveI = this.inIndex; this.inMatrix = 0; this.inIndex = 0;
          const body = this.expr();
          this.inMatrix = saveM; this.inIndex = saveI;
          return { type: 'Anon', params, body };
        }
        let name = this.next().value;
        while (this.isOp('.')) { this.next(); name += '.' + this.next().value; }
        return { type: 'FuncRef', name };
      }
      if (t.value === ':') return { type: 'Colon' };
    }
    throw new MError('sim:expr:syntax', `Unexpected '${t.value ?? 'end of text'}' (line ${t.line}).`);
  }
  matrix(close) {
    const rows = [[]];
    this.inMatrix++;
    const saveI = this.inIndex; this.inIndex = 0;
    for (;;) {
      const t = this.peek();
      if (t.type === 'eof') throw new MError('sim:expr:syntax', `Missing '${close}'.`);
      if (t.type === 'op' && t.value === close) { this.next(); break; }
      if (t.type === 'nl' || (t.type === 'op' && t.value === ';')) { this.next(); rows.push([]); continue; }
      if (t.type === 'op' && t.value === ',') { this.next(); continue; }
      rows[rows.length - 1].push(this.expr());
    }
    this.inMatrix--; this.inIndex = saveI;
    return { type: close === ']' ? 'Matrix' : 'CellLit', rows: rows.filter((r, i) => r.length || (i === 0 && rows.length === 1)) };
  }
}

function isLvalue(e) {
  if (e.type === 'Id') return true;
  if (e.type === 'Index' || e.type === 'Field' || e.type === 'DynField') return isLvalue(e.obj);
  return false;
}

/** Names of all identifiers read in an expression/program (for dependency analysis). */
export function identifiers(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const x of node) identifiers(x, out); return out; }
  if (node.type === 'Id') out.add(node.name);
  for (const k of Object.keys(node)) if (k !== 'type') identifiers(node[k], out);
  return out;
}
