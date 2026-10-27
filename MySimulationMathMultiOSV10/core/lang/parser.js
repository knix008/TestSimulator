// Parser for the M language: tokens (lexer.js) -> AST.
//
// Program: { kind: 'script'|'function'|'classdef', body: Stmt[], functions: Fn[], classdef?, file }
// Fn: { name, params: string[], outs: string[], body: Stmt[], nested: Fn[], args: ArgBlock[], line, endLine, text? }
// Statements carry `line`. Expressions are plain objects with `t`.
import { lex, parseError } from './lexer.js';

const BIN_LEVELS = [
  ['||'], ['&&'], ['|'], ['&'], ['<', '<=', '>', '>=', '==', '~='],
];
const ADD_OPS = new Set(['+', '-']);
const MUL_OPS = new Set(['*', '/', '\\', '.*', './', '.\\']);

class Parser {
  constructor(tokens, opts) {
    this.t = tokens;
    this.p = 0;
    this.file = opts.file || null;
    this.src = opts.src || '';
    this.ctx = []; // 'm' (matrix) or 'p' (paren)
    this.endStyle = opts.endStyle !== false;
  }
  get tok() { return this.t[this.p]; }
  peek(k = 1) { return this.t[this.p + k]; }
  next() { return this.t[this.p++]; }
  is(type, value) { const t = this.t[this.p]; return t.type === type && (value === undefined || t.value === value); }
  isOp(v) { const t = this.t[this.p]; return t.type === 'op' && t.value === v; }
  isKw(v) { const t = this.t[this.p]; return t.type === 'kw' && (v === undefined || t.value === v); }
  err(msg, tok = this.tok) { throw parseError(msg, tok.line, tok.col, this.file); }
  expectOp(v) { if (!this.isOp(v)) this.err(this.tok.type === 'eof' || this.tok.type === 'nl' ? `Expected "${v}"; the expression is not complete.` : `Invalid expression. Expected "${v}" near "${this.tokText()}".`); return this.next(); }
  tokText(t = this.tok) { return t.type === 'nl' ? 'end of line' : t.type === 'eof' ? 'end of input' : String(t.value); }
  inMatrix() { return this.ctx.length > 0 && this.ctx[this.ctx.length - 1] === 'm'; }
  skipNl() { while (this.is('nl') || this.isOp(';') || this.isOp(',')) this.next(); }
  skipNewlinesOnly() { while (this.is('nl')) this.next(); }

  // ------------------------------------------------------------ program
  program() {
    this.skipNl();
    if (this.isKw('classdef')) {
      const cd = this.classdef();
      this.skipNl();
      const functions = [];
      while (this.isKw('function')) { functions.push(this.func()); this.skipNl(); }
      if (!this.is('eof')) this.err(`Unexpected "${this.tokText()}" after the class definition.`);
      return { kind: 'classdef', body: [], functions, classdef: cd, file: this.file };
    }
    const kind = this.isKw('function') ? 'function' : 'script';
    const body = [];
    const functions = [];
    for (;;) {
      this.skipNl();
      if (this.is('eof')) break;
      if (this.isKw('function')) { functions.push(this.func()); this.skipNl(); continue; }
      if (functions.length && kind === 'function') this.err('Statements are not allowed between function definitions.');
      if (functions.length && kind === 'script') this.err('Local functions in a script must be at the end of the file.');
      const s = this.statement();
      if (s) body.push(s);
    }
    return { kind, body, functions, file: this.file };
  }

  // a block of statements until one of the terminator keywords
  block(terms) {
    const out = [];
    for (;;) {
      this.skipNl();
      const t = this.tok;
      if (t.type === 'eof') return out;
      if (t.type === 'kw' && terms.includes(t.value)) return out;
      if (t.type === 'kw' && t.value === 'function') {
        if (terms.includes('function')) return out;
        this.err('Function definitions are not permitted in this context.');
      }
      const s = this.statement();
      if (s) out.push(s);
    }
  }

  endOfStatement() {
    // returns print flag
    const t = this.tok;
    if (t.type === 'op' && t.value === ';') { this.next(); if (this.is('nl')) this.next(); return false; }
    if (t.type === 'op' && t.value === ',') { this.next(); if (this.is('nl')) this.next(); return true; }
    if (t.type === 'nl') { this.next(); return true; }
    if (t.type === 'eof') return true;
    // keywords may follow on the same line in some contexts (e.g. `if x disp(1) end`)
    if (t.type === 'kw' && (t.value === 'end' || t.value === 'else' || t.value === 'elseif' || t.value === 'case' || t.value === 'otherwise' || t.value === 'catch')) return true;
    this.err(`Invalid expression near "${this.tokText()}". Check for missing operators, commas or semicolons.`);
  }

  statement() {
    const t = this.tok;
    const line = t.line;
    if (t.type === 'cmd') {
      this.next();
      const print = this.endOfStatement();
      return { t: 'cmd', name: t.value, args: t.args, print, line };
    }
    if (t.type === 'shell') { this.next(); this.endOfStatement(); return { t: 'shell', text: t.value, line }; }
    if (t.type === 'kw') {
      switch (t.value) {
        case 'if': return this.ifStmt();
        case 'for': case 'parfor': return this.forStmt();
        case 'while': return this.whileStmt();
        case 'switch': return this.switchStmt();
        case 'try': return this.tryStmt();
        case 'break': case 'continue': case 'return': this.next(); this.endOfStatement(); return { t: t.value, line };
        case 'global': case 'persistent': return this.declStmt(t.value);
        case 'spmd': { this.next(); const body = this.block(['end']); this.expectKw('end'); this.endOfStatement(); return { t: 'block', body, line }; }
        default: this.err(`Illegal use of reserved keyword "${t.value}".`);
      }
    }
    // assignment or expression
    if (t.type === 'op' && t.value === '[' ) {
      const save = this.p;
      const lhs = this.tryMultiLhs();
      if (lhs) {
        const rhs = this.expr();
        const print = this.endOfStatement();
        return { t: 'massign', lhs, rhs, print, line };
      }
      this.p = save;
    }
    const e = this.expr();
    if (this.isOp('=')) {
      this.next();
      const lv = this.toLvalue(e);
      const rhs = this.expr();
      const print = this.endOfStatement();
      return { t: 'assign', lhs: lv, rhs, print, line };
    }
    const print = this.endOfStatement();
    return { t: 'expr', e, print, line };
  }

  expectKw(v) { if (!this.isKw(v)) this.err(`Expected "${v}" near "${this.tokText()}".`); return this.next(); }

  tryMultiLhs() {
    // [a, b, ~, c(2), s.f] = ...
    this.next(); // [
    const items = [];
    for (;;) {
      while (this.isOp(',')) this.next();
      if (this.isOp(']')) { this.next(); break; }
      if (this.isOp('~') && (this.peek().type === 'op' && (this.peek().value === ',' || this.peek().value === ']'))) { this.next(); items.push({ t: 'tilde' }); continue; }
      if (!this.is('id')) return null;
      let e;
      try {
        this.ctx.push('m');
        e = this.postfix();
      } catch { this.ctx.pop(); return null; }
      this.ctx.pop();
      const lv = this.toLvalue(e, true);
      if (!lv) return null;
      items.push(lv);
      if (!(this.isOp(',') || this.isOp(']') || this.tok.sp)) return null;
    }
    if (!this.isOp('=')) return null;
    if (this.peek().type === 'op' && this.peek().value === '=') return null;
    this.next();
    return items;
  }

  toLvalue(e, soft) {
    if (e.t === 'id') return { t: 'lv', name: e.name, chain: [] };
    if (e.t === 'index' && e.base.t === 'id') return { t: 'lv', name: e.base.name, chain: e.chain };
    if (soft) return null;
    this.err('Invalid expression on the left of the assignment. Assign to a variable or an indexed variable.');
  }

  ifStmt() {
    const line = this.next().line;
    const clauses = [];
    let cond = this.expr();
    let body = this.block(['elseif', 'else', 'end']);
    clauses.push({ cond, body });
    let elseBody = null;
    for (;;) {
      if (this.isKw('elseif')) { this.next(); cond = this.expr(); body = this.block(['elseif', 'else', 'end']); clauses.push({ cond, body }); continue; }
      if (this.isKw('else')) { this.next(); elseBody = this.block(['end']); }
      break;
    }
    this.expectKw('end');
    this.endOfStatement();
    return { t: 'if', clauses, else: elseBody, line };
  }

  forStmt() {
    const kwTok = this.next();
    const line = kwTok.line;
    let paren = false;
    if (this.isOp('(') && kwTok.value === 'parfor') { paren = true; this.next(); }
    else if (this.isOp('(')) {
      // for (i = 1:3)
      const save = this.p;
      this.next();
      if (this.is('id') && this.peek().type === 'op' && this.peek().value === '=') paren = true;
      else this.p = save;
    }
    if (!this.is('id')) this.err('Invalid for loop: expected a variable name.');
    const v = this.postfix();
    const lv = this.toLvalue(v);
    this.expectOp('=');
    if (paren) this.ctx.push('p');
    const e = this.expr();
    if (paren) {
      if (this.isOp(',')) { this.next(); this.expr(); } // parfor (i = 1:n, M)
      this.ctx.pop();
      this.expectOp(')');
    }
    const body = this.block(['end']);
    this.expectKw('end');
    this.endOfStatement();
    return { t: 'for', lv, e, body, line };
  }

  whileStmt() {
    const line = this.next().line;
    const cond = this.expr();
    const body = this.block(['end']);
    this.expectKw('end');
    this.endOfStatement();
    return { t: 'while', cond, body, line };
  }

  switchStmt() {
    const line = this.next().line;
    const e = this.expr();
    this.skipNl();
    const cases = [];
    let otherwise = null;
    for (;;) {
      this.skipNl();
      if (this.isKw('case')) { this.next(); const v = this.expr(); const body = this.block(['case', 'otherwise', 'end']); cases.push({ v, body }); continue; }
      if (this.isKw('otherwise')) { this.next(); otherwise = this.block(['case', 'otherwise', 'end']); continue; }
      break;
    }
    this.expectKw('end');
    this.endOfStatement();
    return { t: 'switch', e, cases, otherwise, line };
  }

  tryStmt() {
    const line = this.next().line;
    if (this.isOp(',')) this.next();
    const body = this.block(['catch', 'end']);
    let id = null, cbody = [];
    if (this.isKw('catch')) {
      const ct = this.next();
      if (this.is('id') && this.tok.line === ct.line) id = this.next().value;
      else if (this.is('cmd') && this.tok.line === ct.line) {
        // `catch ME disp(x)` is unusual; treat the command name as the identifier
        const c = this.next(); id = c.value;
      }
      cbody = this.block(['end']);
    }
    this.expectKw('end');
    this.endOfStatement();
    return { t: 'try', body, id, cbody, line };
  }

  declStmt(kind) {
    const line = this.next().line;
    const names = [];
    const inits = [];
    // `global a b c` is lexed as plain identifiers (or a command for the first one)
    while (this.is('id')) {
      const name = this.next().value;
      names.push(name);
      if (this.isOp('=') && kind === 'persistent') { this.next(); inits.push([name, this.expr()]); }
    }
    const print = this.endOfStatement();
    return { t: kind, names, inits, print, line };
  }

  // ------------------------------------------------------------ expressions
  expr() { return this.binary(0); }

  binary(level) {
    if (level === BIN_LEVELS.length) return this.range();
    const ops = BIN_LEVELS[level];
    let a = this.binary(level + 1);
    for (;;) {
      const t = this.tok;
      if (t.type !== 'op' || !ops.includes(t.value)) return a;
      if (this.inMatrix() && t.sp && !this.peek().sp && false) return a;
      this.next();
      this.skipContinuationNl();
      const b = this.binary(level + 1);
      a = t.value === '&&' || t.value === '||' ? { t: t.value === '&&' ? 'andand' : 'oror', a, b } : { t: 'bin', op: t.value, a, b };
    }
  }
  skipContinuationNl() {}

  range() {
    // in an index context a lone ':' is the magic colon
    if (this.isOp(':') && this.ctx.length && this.ctx[this.ctx.length - 1] === 'i') {
      const nx = this.peek();
      if (nx.type === 'op' && (nx.value === ',' || nx.value === ')' || nx.value === '}')) { this.next(); return { t: 'colon' }; }
    }
    const a = this.additive();
    if (!this.isOp(':')) return a;
    if (this.inMatrix() && this.tok.sp && !this.peek().sp) { /* [1 :3] still a range in M */ }
    this.next();
    const b = this.additive();
    if (this.isOp(':')) {
      this.next();
      const c = this.additive();
      return { t: 'range', a, step: b, b: c };
    }
    return { t: 'range', a, step: null, b };
  }

  additive() {
    let a = this.multiplicative();
    for (;;) {
      const t = this.tok;
      if (t.type !== 'op' || !ADD_OPS.has(t.value)) return a;
      if (this.inMatrix() && t.sp && !this.peek().sp) return a; // [1 -2] is two elements
      this.next();
      const b = this.multiplicative();
      a = { t: 'bin', op: t.value, a, b };
    }
  }

  multiplicative() {
    let a = this.unary();
    for (;;) {
      const t = this.tok;
      if (t.type !== 'op' || !MUL_OPS.has(t.value)) return a;
      this.next();
      const b = this.unary();
      a = { t: 'bin', op: t.value, a, b };
    }
  }

  unary() {
    const t = this.tok;
    if (t.type === 'op' && (t.value === '-' || t.value === '+' || t.value === '~')) {
      this.next();
      const a = this.unary();
      if (t.value === '-' && a.t === 'num' && !a.neg) return { ...a, v: -a.v, neg: true };
      return { t: 'un', op: t.value, a };
    }
    return this.power();
  }

  power() {
    let a = this.postfix();
    for (;;) {
      const t = this.tok;
      if (t.type === 'op' && (t.value === "'" || t.value === ".'")) { this.next(); a = { t: 'post', op: t.value, a }; continue; }
      if (t.type === 'op' && (t.value === '^' || t.value === '.^')) {
        if (this.inMatrix() && t.sp && !this.peek().sp && false) return a;
        this.next();
        const b = this.powerOperand();
        a = { t: 'bin', op: t.value, a, b };
        continue;
      }
      return a;
    }
  }

  powerOperand() {
    const t = this.tok;
    if (t.type === 'op' && (t.value === '-' || t.value === '+' || t.value === '~')) {
      this.next();
      const a = this.powerOperand();
      return { t: 'un', op: t.value, a };
    }
    let a = this.postfix();
    while (this.isOp("'") || this.isOp(".'")) a = { t: 'post', op: this.next().value, a };
    return a;
  }

  postfix() {
    let base = this.primary();
    const chain = [];
    for (;;) {
      const t = this.tok;
      if (t.type !== 'op') break;
      if (this.inMatrix() && t.sp && (t.value === '(' || t.value === '{')) break;
      if (t.value === '(') {
        if (base.t === 'anon' || base.t === 'num' || base.t === 'str' || base.t === 'dstr' || base.t === 'matrix' || base.t === 'cellLit') {
          if (base.t !== 'matrix' && base.t !== 'cellLit') break;
        }
        this.next();
        chain.push({ k: '()', args: this.args(')') });
        continue;
      }
      if (t.value === '{') {
        if (base.t !== 'id' && base.t !== 'paren' && base.t !== 'cellLit' && chain.length === 0 && base.t !== 'fh') break;
        this.next();
        chain.push({ k: '{}', args: this.args('}') });
        continue;
      }
      if (t.value === '.' && !(this.inMatrix() && t.sp)) {
        const nx = this.peek();
        if (nx.type === 'id' || nx.type === 'kw') { this.next(); this.next(); chain.push({ k: '.', name: nx.value }); continue; }
        if (nx.type === 'op' && nx.value === '(') {
          this.next(); this.next();
          this.ctx.push('p');
          const e = this.expr();
          this.ctx.pop();
          this.expectOp(')');
          chain.push({ k: '.()', e });
          continue;
        }
        if (nx.type === 'cmd') {
          // `s.name arg` cannot happen (commands only at statement start)
        }
        this.err('Invalid use of a period. Expected a field name.');
      }
      if (t.value === '@' && base.t === 'id' && chain.length === 0 && !t.sp && this.peek().type === 'id' && !this.peek().sp) {
        // obj@Superclass(args)  or  method@Superclass(obj, args)
        this.next();
        let sup = this.next().value;
        while (this.isOp('.') && this.peek().type === 'id') { this.next(); sup += '.' + this.next().value; }
        let args = [];
        if (this.isOp('(') && !(this.inMatrix() && this.tok.sp)) { this.next(); args = this.args(')'); }
        base = { t: 'super', name: base.name, sup, args };
        continue;
      }
      break;
    }
    if (chain.length) return { t: 'index', base, chain };
    return base;
  }

  args(close) {
    const out = [];
    this.ctx.push('i');
    if (this.isOp(close)) { this.ctx.pop(); this.next(); return out; }
    for (;;) {
      while (this.is('nl')) this.next();
      // name=value arguments: f(x, Name=value) passes 'Name', value
      if (close === ')' && this.is('id') && this.peek().type === 'op' && this.peek().value === '=') {
        out.push({ t: 'str', v: this.next().value });
        this.next();
      }
      out.push(this.expr());
      while (this.is('nl')) this.next();
      if (this.isOp(',')) { this.next(); continue; }
      if (this.isOp(close)) { this.next(); break; }
      this.err(`Invalid expression near "${this.tokText()}". Expected "," or "${close}".`);
    }
    this.ctx.pop();
    return out;
  }

  primary() {
    const t = this.tok;
    switch (t.type) {
      case 'num': this.next(); return { t: 'num', v: t.value, imag: t.imag, cls: t.cls };
      case 'str': this.next(); return { t: 'str', v: t.value };
      case 'dstr': this.next(); return { t: 'dstr', v: t.value };
      case 'id': this.next(); return { t: 'id', name: t.value };
      case 'endval': this.next(); return { t: 'end' };
      case 'cmd': this.err(`Unexpected command syntax "${t.value}".`); break;
      case 'op':
        switch (t.value) {
          case '(': {
            this.next();
            this.ctx.push('p');
            const e = this.expr();
            this.ctx.pop();
            this.expectOp(')');
            return { t: 'paren', e };
          }
          case '[': this.next(); return this.matrix(']', 'matrix');
          case '{': this.next(); return this.matrix('}', 'cellLit');
          case '@': return this.handle();
          case '?': {
            this.next();
            let name = this.expectId();
            while (this.isOp('.') && this.peek().type === 'id') { this.next(); name += '.' + this.next().value; }
            return { t: 'meta', name };
          }
          case ':':
            if (this.ctx.length && this.ctx[this.ctx.length - 1] === 'i') { this.next(); return { t: 'colon' }; }
            break;
          default: break;
        }
        break;
      default: break;
    }
    if (t.type === 'nl' || t.type === 'eof') this.err('Invalid expression. The expression is not complete.');
    if (t.type === 'kw') this.err(`Illegal use of reserved keyword "${t.value}".`);
    this.err(`Invalid expression near "${this.tokText()}".`);
  }

  expectId() { if (!this.is('id')) this.err(`Expected a name near "${this.tokText()}".`); return this.next().value; }

  handle() {
    const at = this.next();
    if (this.isOp('(')) {
      // anonymous function
      this.next();
      const params = [];
      while (!this.isOp(')')) {
        if (this.isOp('~')) { this.next(); params.push('~'); }
        else params.push(this.expectId());
        if (this.isOp(',')) this.next();
        else if (!this.isOp(')')) this.err('Invalid anonymous function parameter list.');
      }
      this.next();
      const startTok = this.tok;
      this.ctx.push('p');
      const body = this.expr();
      this.ctx.pop();
      return { t: 'anon', params, body, line: at.line, col: startTok.col };
    }
    let name = this.expectId();
    while (this.isOp('.') && (this.peek().type === 'id' || this.peek().type === 'kw')) { this.next(); name += '.' + this.next().value; }
    return { t: 'fh', name };
  }

  matrix(close, kind) {
    this.ctx.push('m');
    const rows = [];
    let row = [];
    for (;;) {
      const t = this.tok;
      if (t.type === 'op' && t.value === close) { this.next(); break; }
      if (t.type === 'eof') this.err(`Expected "${close}".`);
      if (t.type === 'nl' || (t.type === 'op' && t.value === ';')) {
        this.next();
        if (row.length) { rows.push(row); row = []; }
        else if (t.type === 'op' && t.value === ';' && rows.length === 0) { /* leading ; */ }
        continue;
      }
      if (t.type === 'op' && t.value === ',') { this.next(); continue; }
      if (t.type === 'op' && (t.value === '~') && this.peek().type === 'op' && (this.peek().value === ',' || this.peek().value === close)) {
        this.next(); row.push({ t: 'tilde' }); continue;
      }
      row.push(this.expr());
      const nx = this.tok;
      if (nx.type === 'op' && (nx.value === ',' || nx.value === ';' || nx.value === close)) continue;
      if (nx.type === 'nl') continue;
      if (nx.sp) continue; // whitespace separates elements
      this.err(`Invalid expression near "${this.tokText()}" in the ${kind === 'matrix' ? 'matrix' : 'cell array'} definition.`);
    }
    if (row.length) rows.push(row);
    this.ctx.pop();
    return { t: kind, rows };
  }

  // ------------------------------------------------------------ functions
  func() {
    const kw = this.expectKw('function');
    const line = kw.line;
    let outs = [];
    let name;
    if (this.isOp('[')) {
      this.next();
      while (!this.isOp(']')) {
        if (this.isOp(',')) { this.next(); continue; }
        if (this.isOp('~')) { this.next(); outs.push('~'); continue; }
        outs.push(this.expectId());
      }
      this.next();
      this.expectOp('=');
      name = this.funcName();
    } else {
      const first = this.funcName();
      if (this.isOp('=')) { this.next(); outs = [first]; name = this.funcName(); }
      else name = first;
    }
    const params = [];
    if (this.isOp('(')) {
      this.next();
      while (!this.isOp(')')) {
        if (this.isOp(',')) { this.next(); continue; }
        if (this.isOp('~')) { this.next(); params.push('~'); continue; }
        if (this.is('nl')) { this.next(); continue; }
        params.push(this.expectId());
      }
      this.next();
    }
    // header ends
    if (!(this.is('nl') || this.isOp(';') || this.isOp(',') || this.is('eof'))) this.err(`Invalid function header near "${this.tokText()}".`);
    // help text: comment lines directly after the header (or before it)
    const fn = { name, params, outs, body: [], nested: [], args: [], line, endLine: line, file: this.file };
    this.skipNl();
    // arguments blocks
    while (this.is('id') && this.tok.section && this.tok.value === 'arguments') fn.args.push(this.argumentsBlock());
    const body = [];
    for (;;) {
      this.skipNl();
      const t = this.tok;
      if (t.type === 'eof') {
        if (this.endStyle) this.err(`The function "${name}" is missing its "end".`, kw);
        break;
      }
      if (t.type === 'kw' && t.value === 'function') {
        if (this.endStyle) { fn.nested.push(this.func()); continue; }
        break;
      }
      if (t.type === 'kw' && t.value === 'end') {
        if (!this.endStyle) this.err('Unexpected "end": this file defines functions without "end".');
        fn.endLine = t.line;
        this.next();
        if (this.isOp(';') || this.isOp(',')) this.next();
        break;
      }
      const s = this.statement();
      if (s) body.push(s);
    }
    fn.body = body;
    return fn;
  }

  funcName() {
    let name = this.expectId();
    while (this.isOp('.') && (this.peek().type === 'id' || this.peek().type === 'kw')) { this.next(); name += '.' + this.next().value; }
    return name;
  }

  attrs() {
    // (Name = value, Flag, ~Flag)
    const out = Object.create(null);
    if (!this.isOp('(')) return out;
    this.next();
    this.ctx.push('p');
    while (!this.isOp(')')) {
      if (this.isOp(',')) { this.next(); continue; }
      let neg = false;
      if (this.isOp('~')) { this.next(); neg = true; }
      const name = this.expectId();
      if (this.isOp('=')) { this.next(); out[name] = { expr: this.expr() }; }
      else out[name] = { value: !neg };
    }
    this.ctx.pop();
    this.next();
    return out;
  }

  argumentsBlock() {
    const line = this.next().line; // 'arguments'
    const attrs = this.attrs();
    const items = [];
    for (;;) {
      this.skipNl();
      if (this.isKw('end')) { this.next(); break; }
      if (this.is('eof')) this.err('The arguments block is missing its "end".');
      items.push(this.propLike(true));
    }
    return { line, attrs, output: !!(attrs.Output && attrs.Output.value), repeating: !!(attrs.Repeating && attrs.Repeating.value), items };
  }

  // property / argument declaration: name[.field] [(dims)] [class] [{validators}] [= default]
  propLike(allowDotted) {
    const t = this.tok;
    let name = this.expectId();
    let field = null;
    if (allowDotted && this.isOp('.') && this.peek().type === 'id') { this.next(); field = this.next().value; }
    const item = { name, field, line: t.line, dims: null, cls: null, validators: [], def: null };
    if (this.isOp('(')) {
      this.next();
      const dims = [];
      while (!this.isOp(')')) {
        if (this.isOp(',')) { this.next(); continue; }
        if (this.isOp(':')) { this.next(); dims.push(-1); continue; }
        if (this.is('num')) { dims.push(this.next().value); continue; }
        this.err('Invalid size specification.');
      }
      this.next();
      item.dims = dims;
    }
    if (this.is('id')) {
      let cls = this.next().value;
      while (this.isOp('.') && this.peek().type === 'id') { this.next(); cls += '.' + this.next().value; }
      item.cls = cls;
    }
    if (this.isOp('{')) {
      this.next();
      this.ctx.push('p');
      while (!this.isOp('}')) {
        if (this.isOp(',') || this.is('nl')) { this.next(); continue; }
        item.validators.push(this.expr());
      }
      this.ctx.pop();
      this.next();
    }
    if (this.isOp('=')) { this.next(); this.ctx.push('p'); item.def = this.expr(); this.ctx.pop(); }
    if (this.isOp(';') || this.isOp(',')) this.next();
    if (!(this.is('nl') || this.is('eof') || this.isKw('end'))) this.err(`Invalid declaration near "${this.tokText()}".`);
    return item;
  }

  // ------------------------------------------------------------ classdef
  classdef() {
    const line = this.next().line;
    const attrs = this.attrs();
    const name = this.funcName();
    const supers = [];
    if (this.isOp('<')) {
      this.next();
      supers.push(this.funcName());
      while (this.isOp('&')) { this.next(); supers.push(this.funcName()); }
    }
    const cd = { name, attrs, supers, props: [], methods: [], events: [], enums: [], line };
    for (;;) {
      this.skipNl();
      const t = this.tok;
      if (t.type === 'kw' && t.value === 'end') { this.next(); break; }
      if (t.type === 'eof') this.err('The class definition is missing its "end".');
      if (t.type === 'id' && t.section) {
        this.next();
        const a = this.attrs();
        if (t.value === 'properties') {
          for (;;) {
            this.skipNl();
            if (this.isKw('end')) { this.next(); break; }
            const p = this.propLike(false);
            p.attrs = a;
            cd.props.push(p);
          }
        } else if (t.value === 'methods') {
          for (;;) {
            this.skipNl();
            if (this.isKw('end')) { this.next(); break; }
            if (this.isKw('function')) { const fn = this.func(); fn.attrs = a; cd.methods.push(fn); continue; }
            // method signature only (defined in its own file): skip the line
            while (!this.is('nl') && !this.is('eof')) this.next();
          }
        } else if (t.value === 'events') {
          for (;;) {
            this.skipNl();
            if (this.isKw('end')) { this.next(); break; }
            cd.events.push({ name: this.expectId(), attrs: a });
          }
        } else if (t.value === 'enumeration') {
          for (;;) {
            this.skipNl();
            if (this.isKw('end')) { this.next(); break; }
            const nm = this.expectId();
            let args = [];
            if (this.isOp('(')) { this.next(); args = this.args(')'); }
            cd.enums.push({ name: nm, args });
          }
        } else this.err(`Unexpected "${t.value}" in the class definition.`);
        continue;
      }
      this.err(`Unexpected "${this.tokText()}" in the class definition.`);
    }
    return cd;
  }
}

/** Parses source text. opts: { file, isVar, commandSyntax } */
export function parse(src, opts = {}) {
  const tokens = lex(src, opts);
  try {
    return new Parser(tokens, { ...opts, src, endStyle: true }).program();
  } catch (e) {
    // files whose functions are not terminated by `end`
    if (e.identifier === 'core:parse' && /function/.test(src)) {
      try { return new Parser(tokens, { ...opts, src, endStyle: false }).program(); } catch { /* report the first error */ }
    }
    throw e;
  }
}

/** Parses a single expression (str2func, anonymous text, validators). */
export function parseExpr(src, opts = {}) {
  const tokens = lex(src, { ...opts, commandSyntax: false });
  const p = new Parser(tokens, opts);
  p.skipNewlinesOnly();
  const e = p.expr();
  p.skipNewlinesOnly();
  if (!p.is('eof')) p.err(`Invalid expression near "${p.tokText()}".`);
  return e;
}
