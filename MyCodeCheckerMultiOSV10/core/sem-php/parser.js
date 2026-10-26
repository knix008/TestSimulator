'use strict';

// Tolerant recursive-descent PHP parser (PHP 5.x - 8.3). Produces an AST of
// plain objects { k, line, col, pos, endLine, endCol, end, ... }. Errors are
// collected; parsing resumes at the next statement / member.

const { lex } = require('./lexer');

class PErr extends Error {}

const BIN = {
  or: [1, 'L'], xor: [2, 'L'], and: [3, 'L'],
  '??': [6, 'R'], '||': [7, 'L'], '&&': [8, 'L'], '|': [9, 'L'], '^': [10, 'L'], '&': [11, 'L'],
  '==': [12, 'N'], '!=': [12, 'N'], '===': [12, 'N'], '!==': [12, 'N'], '<>': [12, 'N'], '<=>': [12, 'N'],
  '<': [13, 'N'], '<=': [13, 'N'], '>': [13, 'N'], '>=': [13, 'N'],
  '.': [14, 'L'], '<<': [15, 'L'], '>>': [15, 'L'], '+': [16, 'L'], '-': [16, 'L'],
  '*': [17, 'L'], '/': [17, 'L'], '%': [17, 'L'], instanceof: [19, 'N'], '**': [21, 'R'],
};
const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '.=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>=', '??=']);
const LVALUE = new Set(['Var', 'VarVar', 'Index', 'Prop', 'SProp', 'ListX', 'Arr']);
const MODS = new Set(['public', 'protected', 'private', 'static', 'abstract', 'final', 'readonly', 'var']);
const MAGIC = new Set(['__line__', '__file__', '__dir__', '__function__', '__class__', '__method__', '__namespace__', '__trait__']);

class Parser {
  constructor(tokens, src, lcAbs) {
    this.toks = tokens;
    this.i = 0;
    this.src = src;
    this.lcAbs = lcAbs;
    this.errors = [];
    this.depth = 0;
  }

  get tok() { return this.toks[this.i]; }
  peek(o = 1) { return this.toks[Math.min(this.i + o, this.toks.length - 1)]; }
  get prev() { return this.toks[this.i > 0 ? this.i - 1 : 0]; }
  next() { const t = this.toks[this.i]; if (this.i < this.toks.length - 1) this.i++; return t; }
  isOp(v, t = this.tok) { return t.t === 'op' && t.v === v; }
  isKw(w, t = this.tok) { return t.t === 'id' && t.v.length === w.length && t.v.toLowerCase() === w; }
  kw(t = this.tok) { return t.t === 'id' ? t.v.toLowerCase() : ''; }
  eat(v) { if (this.isOp(v)) { this.next(); return true; } return false; }
  eatKw(w) { if (this.isKw(w)) { this.next(); return true; } return false; }
  expect(v) {
    if (this.isOp(v)) return this.next();
    this.fail(`expected '${v}'`);
    return null;
  }
  expectKw(w) {
    if (this.isKw(w)) return this.next();
    this.fail(`expected '${w}'`);
    return null;
  }
  fail(msg) {
    const t = this.tok;
    throw new PErr(`${msg} at ${t.line}:${t.col} near '${t.v}'`);
  }

  node(k, t, props) {
    const n = { k, line: t.line, col: t.col, pos: t.pos };
    if (props) Object.assign(n, props);
    return n;
  }
  fin(n) {
    const p = this.prev;
    const end = Math.max(p.end, n.pos);
    n.end = end;
    if (this.lcAbs) { const at = this.lcAbs(Math.max(end - 1, n.pos)); n.endLine = at.line; n.endCol = at.col + 1; }
    else { n.endLine = p.line; n.endCol = p.col + (p.end - p.pos); }
    return n;
  }

  // ───────────────────────── program / statements
  parseProgram() {
    const t = this.tok;
    const prog = this.node('Program', t, { stmts: [] });
    while (this.tok.t !== 'eof') {
      const before = this.i;
      const s = this.stmtSafe();
      if (s) prog.stmts.push(s);
      if (s && s.k === 'HaltCompiler') break;
      if (this.i === before) this.next();
    }
    return this.fin(prog);
  }

  stmtSafe() {
    const start = this.i;
    try {
      return this.statement();
    } catch (e) {
      if (!(e instanceof PErr) && !(e instanceof RangeError)) throw e;
      this.errors.push(e instanceof RangeError ? 'nesting too deep' : e.message);
      this.recover(start);
      return null;
    }
  }

  recover(start) {
    if (this.i === start) this.next();
    let depth = 0;
    while (this.tok.t !== 'eof') {
      const t = this.tok;
      if (t.t === 'op') {
        if (t.v === '{') depth++;
        else if (t.v === '}') { if (depth === 0) return; depth--; if (depth === 0) { this.next(); return; } }
        else if (t.v === ';' && depth === 0) { this.next(); return; }
      }
      this.next();
    }
  }

  stmtsUntil(stops) {
    const out = [];
    while (this.tok.t !== 'eof') {
      if (this.isOp('}') && stops.includes('}')) break;
      const w = this.kw();
      if (w && stops.includes(w)) break;
      const before = this.i;
      const s = this.stmtSafe();
      if (s) out.push(s);
      if (this.i === before) {
        if (this.isOp('}')) { this.errors.push(`unexpected '}' at ${this.tok.line}`); }
        this.next();
      }
    }
    return out;
  }

  semi() {
    if (this.isOp(';')) { this.next(); return; }
    if (this.tok.t === 'eof' || this.tok.t === 'html') return;
    this.fail('expected \';\'');
  }

  block() {
    const t = this.expect('{');
    const b = this.node('Block', t, { stmts: [] });
    b.stmts = this.stmtsUntil(['}']);
    this.expect('}');
    return this.fin(b);
  }

  // body of if/while/for/foreach/declare: statement or alternative syntax
  ctlBody(endKw) {
    if (this.isOp(':')) {
      const t = this.next();
      const b = this.node('Block', t, { stmts: [], alt: true });
      b.stmts = this.stmtsUntil([endKw]);
      this.expectKw(endKw);
      this.semi();
      return this.fin(b);
    }
    return this.statement();
  }

  statement() {
    if (++this.depth > 400) { this.depth = 0; throw new RangeError('deep'); }
    try { return this.statement0(); } finally { this.depth--; }
  }

  statement0() {
    const t = this.tok;
    if (t.t === 'html') { this.next(); return this.fin(this.node('InlineHTML', t, { text: t.v })); }
    if (t.t === 'op') {
      if (t.v === '{') return this.block();
      if (t.v === ';') { this.next(); return this.fin(this.node('Nop', t, { closeTag: !!t.closeTag })); }
      if (t.v === '#[') {
        const attrs = this.attributes();
        const s = this.statement();
        if (s) s.attrs = attrs;
        return s;
      }
    }
    if (t.t === 'id') {
      const w = t.v.toLowerCase();
      const nx = this.peek();
      // label
      if (nx.t === 'op' && nx.v === ':' && !['default', 'else', 'case'].includes(w) && !t.v.includes('\\')) {
        this.next(); this.next();
        return this.fin(this.node('Label', t, { name: t.v }));
      }
      switch (w) {
        case 'if': return this.ifStmt(this.next(), false);
        case 'while': {
          this.next(); this.expect('(');
          const cond = this.expr(); this.expect(')');
          const body = this.ctlBody('endwhile');
          return this.fin(this.node('While', t, { cond, body }));
        }
        case 'do': {
          this.next();
          const body = this.statement();
          this.expectKw('while'); this.expect('(');
          const cond = this.expr(); this.expect(')'); this.semi();
          return this.fin(this.node('DoWhile', t, { body, cond }));
        }
        case 'for': {
          this.next(); this.expect('(');
          const init = this.exprList(';'); this.expect(';');
          const cond = this.exprList(';'); this.expect(';');
          const step = this.exprList(')'); this.expect(')');
          const body = this.ctlBody('endfor');
          return this.fin(this.node('For', t, { init, cond, step, body }));
        }
        case 'foreach': return this.foreachStmt();
        case 'switch': return this.switchStmt();
        case 'break': case 'continue': {
          this.next();
          let levels = 1;
          if (this.tok.t === 'num') levels = parseInt(this.next().v, 10) || 1;
          else if (this.isOp('(') && this.peek().t === 'num') { this.next(); levels = parseInt(this.next().v, 10) || 1; this.expect(')'); }
          this.semi();
          return this.fin(this.node(w === 'break' ? 'Break' : 'Continue', t, { levels }));
        }
        case 'return': {
          this.next();
          let e = null;
          if (!this.isOp(';') && this.tok.t !== 'eof' && this.tok.t !== 'html') e = this.expr();
          this.semi();
          return this.fin(this.node('Return', t, { e }));
        }
        case 'echo': {
          this.next();
          const args = [this.expr()];
          while (this.eat(',')) args.push(this.expr());
          this.semi();
          return this.fin(this.node('Echo', t, { args, openEcho: !!t.openEcho }));
        }
        case 'global': {
          this.next();
          const vars = [this.primaryVar()];
          while (this.eat(',')) vars.push(this.primaryVar());
          this.semi();
          return this.fin(this.node('Global', t, { vars }));
        }
        case 'static':
          if (nx.t === 'var') {
            this.next();
            const vars = [];
            do {
              const vt = this.tok;
              const v = this.primaryVar();
              let init = null;
              if (this.eat('=')) init = this.expr();
              vars.push(this.fin(this.node('StaticVar', vt, { v, init })));
            } while (this.eat(','));
            this.semi();
            return this.fin(this.node('Static', t, { vars }));
          }
          break;
        case 'unset':
          if (this.isOp('(', nx)) {
            this.next();
            const args = this.args().map((a) => a.e);
            this.semi();
            return this.fin(this.node('Unset', t, { args }));
          }
          break;
        case 'try': return this.tryStmt();
        case 'function':
          if (nx.t === 'id' || (this.isOp('&', nx) && this.peek(2).t === 'id')) return this.funcDecl();
          break;
        case 'abstract': case 'final': case 'readonly': case 'class': case 'interface': case 'trait':
          if (w === 'class' || w === 'interface' || w === 'trait' ? nx.t === 'id' : true) return this.classDecl();
          break;
        case 'enum':
          if (nx.t === 'id' && (this.isOp('{', this.peek(2)) || this.isOp(':', this.peek(2)) || this.isKw('implements', this.peek(2)))) return this.classDecl();
          break;
        case 'namespace':
          if (nx.t === 'id' || this.isOp('{', nx) || this.isOp(';', nx)) return this.namespaceStmt();
          break;
        case 'use': return this.useStmt();
        case 'const': {
          this.next();
          const items = [];
          do {
            const nt = this.tok;
            if (nt.t !== 'id') this.fail('expected constant name');
            this.next(); this.expect('=');
            items.push(this.fin(this.node('ConstItem', nt, { name: nt.v, value: this.expr() })));
          } while (this.eat(','));
          this.semi();
          return this.fin(this.node('Const', t, { items }));
        }
        case 'declare': {
          this.next(); this.expect('(');
          const items = [];
          while (!this.isOp(')') && this.tok.t !== 'eof') {
            const nt = this.next();
            this.expect('=');
            items.push({ name: nt.v, value: this.expr() });
            if (!this.eat(',')) break;
          }
          this.expect(')');
          let body = null;
          if (this.isOp(';')) this.next();
          else if (this.isOp(':')) body = this.ctlBody('enddeclare');
          else if (this.tok.t !== 'eof') body = this.statement();
          return this.fin(this.node('Declare', t, { items, body }));
        }
        case 'goto': {
          this.next();
          const nt = this.next();
          this.semi();
          return this.fin(this.node('Goto', t, { name: nt.v }));
        }
        case '__halt_compiler': {
          this.next();
          while (this.tok.t !== 'eof') this.next();
          return this.fin(this.node('HaltCompiler', t));
        }
        case 'else': case 'elseif': case 'endif': case 'endwhile': case 'endfor': case 'endforeach': case 'endswitch': case 'case': case 'default': case 'catch': case 'finally':
          this.fail(`unexpected '${t.v}'`);
          break;
        default: break;
      }
    }
    const e = this.expr();
    this.semi();
    return this.fin(this.node('ExprStmt', t, { e }));
  }

  ifStmt(t, elseif) {
    this.expect('(');
    const cond = this.expr();
    this.expect(')');
    const n = this.node('If', t, { cond, then: null, else: null, elseif });
    if (this.isOp(':')) {
      const ct = this.next();
      const b = this.node('Block', ct, { stmts: [], alt: true });
      b.stmts = this.stmtsUntil(['elseif', 'else', 'endif']);
      n.then = this.fin(b);
      n.alt = true;
      if (this.isKw('elseif')) {
        n.else = this.ifStmt(this.next(), true);
      } else if (this.isKw('else')) {
        const et = this.next();
        n.elseLine = et.line; n.elseCol = et.col;
        if (this.isKw('if')) { const it = this.next(); n.else = this.ifStmt(it, false); n.else.viaElse = true; }
        else {
          this.expect(':');
          const eb = this.node('Block', et, { stmts: [], alt: true });
          eb.stmts = this.stmtsUntil(['endif']);
          n.else = this.fin(eb);
          this.expectKw('endif');
          this.semi();
        }
      } else {
        this.expectKw('endif');
        this.semi();
      }
      return this.fin(n);
    }
    n.then = this.statement();
    if (this.isKw('elseif')) {
      const et = this.next();
      n.elseLine = et.line; n.elseCol = et.col;
      n.else = this.ifStmt(et, true);
    } else if (this.isKw('else')) {
      const et = this.next();
      n.elseLine = et.line; n.elseCol = et.col;
      if (this.isKw('if')) { const it = this.next(); n.else = this.ifStmt(it, false); n.else.viaElse = true; }
      else n.else = this.statement();
    }
    return this.fin(n);
  }

  foreachStmt() {
    const t = this.next();
    this.expect('(');
    const e = this.expr();
    this.expectKw('as');
    let key = null;
    let byRef = this.eat('&');
    let value = this.expr();
    if (this.eat('=>')) {
      key = value;
      byRef = this.eat('&');
      value = this.expr();
    }
    this.expect(')');
    const body = this.ctlBody('endforeach');
    return this.fin(this.node('Foreach', t, { e, key, value, byRef, body }));
  }

  switchStmt() {
    const t = this.next();
    this.expect('(');
    const disc = this.expr();
    this.expect(')');
    const alt = this.isOp(':');
    if (alt) this.next(); else this.expect('{');
    const cases = [];
    const stop = alt ? ['case', 'default', 'endswitch'] : ['case', 'default', '}'];
    while (this.tok.t !== 'eof') {
      if (alt ? this.isKw('endswitch') : this.isOp('}')) break;
      const ct = this.tok;
      let test = null;
      if (this.eatKw('case')) test = this.expr();
      else if (this.eatKw('default')) test = null;
      else if (this.tok.t === 'html' || this.isOp(';')) { this.next(); continue; }
      else this.fail('expected case');
      if (!this.eat(':')) this.expect(';');
      const c = this.node('Case', ct, { test, body: [] });
      const colonTok = this.prev;
      c.colonLine = colonTok.line;
      c.body = this.stmtsUntil(stop);
      cases.push(this.fin(c));
    }
    if (alt) { this.expectKw('endswitch'); this.semi(); } else this.expect('}');
    return this.fin(this.node('Switch', t, { disc, cases }));
  }

  tryStmt() {
    const t = this.next();
    const block = this.block();
    const catches = [];
    while (this.isKw('catch')) {
      const ct = this.next();
      this.expect('(');
      const types = [this.nameTok()];
      while (this.eat('|')) types.push(this.nameTok());
      let v = null;
      if (this.tok.t === 'var') v = this.primaryVar();
      this.expect(')');
      const body = this.block();
      catches.push(this.fin(this.node('Catch', ct, { types, v, body })));
    }
    let fin = null;
    if (this.eatKw('finally')) fin = this.block();
    return this.fin(this.node('Try', t, { block, catches, fin }));
  }

  namespaceStmt() {
    const t = this.next();
    let name = '';
    if (this.tok.t === 'id') name = this.next().v;
    const n = this.node('Namespace', t, { name, stmts: null });
    if (this.isOp('{')) {
      this.next();
      n.stmts = this.stmtsUntil(['}']);
      this.expect('}');
    } else this.semi();
    return this.fin(n);
  }

  useStmt() {
    const t = this.next();
    let kind = 'class';
    if (this.isKw('function') || this.isKw('const')) kind = this.next().v.toLowerCase();
    const items = [];
    do {
      const nt = this.tok;
      if (nt.t !== 'id') this.fail('expected name');
      this.next();
      if (this.isOp('\\') && this.isOp('{', this.peek())) {
        this.next(); this.next();
        while (!this.isOp('}') && this.tok.t !== 'eof') {
          if (this.isKw('function') || this.isKw('const')) this.next();
          const it = this.next();
          let alias = null;
          if (this.eatKw('as')) alias = this.next().v;
          items.push({ name: nt.v + '\\' + it.v, alias, line: it.line, col: it.col });
          if (!this.eat(',')) break;
        }
        this.expect('}');
        continue;
      }
      let alias = null;
      if (this.eatKw('as')) alias = this.next().v;
      items.push({ name: nt.v, alias, line: nt.line, col: nt.col });
    } while (this.eat(','));
    this.semi();
    return this.fin(this.node('Use', t, { kind, items }));
  }

  attributes() {
    const out = [];
    while (this.isOp('#[')) {
      this.next();
      while (!this.isOp(']') && this.tok.t !== 'eof') {
        const nt = this.tok;
        if (nt.t !== 'id') this.fail('expected attribute name');
        this.next();
        let args = [];
        if (this.isOp('(')) args = this.args();
        out.push({ name: nt.v, args, line: nt.line, col: nt.col });
        if (!this.eat(',')) break;
      }
      this.expect(']');
    }
    return out;
  }

  // ───────────────────────── declarations
  funcDecl() {
    const t = this.next();
    const byRef = this.eat('&');
    const nt = this.next();
    const params = this.params();
    let ret = null;
    if (this.eat(':')) ret = this.type();
    const body = this.block();
    return this.fin(this.node('FuncDecl', t, { name: nt.v, nameLine: nt.line, nameCol: nt.col, params, ret, body, byRef }));
  }

  params() {
    this.expect('(');
    const out = [];
    while (!this.isOp(')') && this.tok.t !== 'eof') {
      const pt = this.tok;
      let attrs = null;
      if (this.isOp('#[')) attrs = this.attributes();
      const mods = new Set();
      while (this.tok.t === 'id' && ['public', 'protected', 'private', 'readonly'].includes(this.kw())) mods.add(this.next().v.toLowerCase());
      let type = null;
      if (this.tok.t === 'id' || this.isOp('?') || (this.isOp('(') && this.peek().t === 'id')) type = this.type();
      const byRef = this.eat('&');
      const variadic = this.eat('...');
      const vt = this.tok;
      if (vt.t !== 'var') this.fail('expected parameter');
      this.next();
      let def = null;
      if (this.eat('=')) def = this.expr();
      const p = this.node('Param', attrs || mods.size || type ? pt : vt, { name: vt.v, nameLine: vt.line, nameCol: vt.col, type, def, byRef, variadic, mods, attrs });
      out.push(this.fin(p));
      if (!this.eat(',')) break;
    }
    this.expect(')');
    return out;
  }

  type() {
    const t = this.tok;
    const names = [];
    let nullable = false;
    if (this.eat('?')) nullable = true;
    const one = () => {
      if (this.isOp('(')) {
        this.next();
        one();
        while (this.isOp('&') && (this.peek().t === 'id')) { this.next(); one(); }
        this.expect(')');
        return;
      }
      if (this.tok.t !== 'id') this.fail('expected type');
      names.push(this.next().v);
    };
    one();
    for (;;) {
      if (this.isOp('|')) { this.next(); one(); continue; }
      if (this.isOp('&') && (this.peek().t === 'id' || this.isOp('(', this.peek())) && !this.isOp('...', this.peek())) { this.next(); one(); continue; }
      break;
    }
    if (names.some((x) => x.toLowerCase() === 'null')) nullable = true;
    return this.fin(this.node('Type', t, { names, nullable, text: this.src ? this.src.slice(t.pos, this.prev.end) : names.join('|') }));
  }

  classDecl(anonTok) {
    const t = anonTok || this.tok;
    const mods = new Set();
    let kind = 'class';
    let name = null;
    let nameTok = null;
    if (!anonTok) {
      while (['abstract', 'final', 'readonly'].includes(this.kw())) mods.add(this.next().v.toLowerCase());
      const kt = this.next();
      kind = kt.v.toLowerCase();
      if (!['class', 'interface', 'trait', 'enum'].includes(kind)) this.fail('expected class');
      nameTok = this.tok;
      if (nameTok.t !== 'id') this.fail('expected class name');
      name = this.next().v;
    }
    const n = this.node('ClassDecl', t, { kind, name, nameLine: nameTok ? nameTok.line : t.line, nameCol: nameTok ? nameTok.col : t.col, mods, ext: [], impl: [], members: [], backing: null, anon: !!anonTok });
    if (kind === 'enum' && this.eat(':')) n.backing = this.type();
    if (this.eatKw('extends')) {
      n.ext.push(this.nameTok());
      while (this.eat(',')) n.ext.push(this.nameTok());
    }
    if (this.eatKw('implements')) {
      n.impl.push(this.nameTok());
      while (this.eat(',')) n.impl.push(this.nameTok());
    }
    const bt = this.expect('{');
    n.braceLine = bt.line;
    while (!this.isOp('}') && this.tok.t !== 'eof') {
      const start = this.i;
      try {
        const m = this.member(n);
        if (m) n.members.push(m);
      } catch (e) {
        if (!(e instanceof PErr)) throw e;
        this.errors.push(e.message);
        this.recover(start);
      }
      if (this.i === start) this.next();
    }
    this.expect('}');
    return this.fin(n);
  }

  member(cls) {
    const t = this.tok;
    let attrs = null;
    if (this.isOp('#[')) attrs = this.attributes();
    if (this.isOp(';')) { this.next(); return null; }
    if (this.isKw('use')) {
      this.next();
      const names = [this.nameTok()];
      while (this.eat(',')) names.push(this.nameTok());
      if (this.isOp('{')) this.skipBalanced('{', '}'); else this.semi();
      return this.fin(this.node('TraitUse', t, { names }));
    }
    if (this.isKw('case') && cls.kind === 'enum') {
      this.next();
      const nt = this.next();
      let value = null;
      if (this.eat('=')) value = this.expr();
      this.semi();
      return this.fin(this.node('EnumCase', t, { name: nt.v, value, attrs }));
    }
    const mods = new Set();
    const modToks = [];
    while (this.tok.t === 'id' && MODS.has(this.kw()) && !(this.isOp('(', this.peek()))) {
      modToks.push(this.tok);
      mods.add(this.next().v.toLowerCase());
    }
    const st = modToks.length ? modToks[0] : this.tok;
    if (this.isKw('const')) {
      this.next();
      let type = null;
      if (this.tok.t === 'id' && this.peek().t === 'id') type = this.type();
      const items = [];
      do {
        const nt = this.next();
        this.expect('=');
        items.push(this.fin(this.node('ConstItem', nt, { name: nt.v, value: this.expr() })));
      } while (this.eat(','));
      this.semi();
      return this.fin(this.node('ClassConst', st, { mods, modToks, type, items, attrs }));
    }
    if (this.isKw('function')) {
      this.next();
      const byRef = this.eat('&');
      const nt = this.next();
      if (nt.t !== 'id') this.fail('expected method name');
      const params = this.params();
      let ret = null;
      if (this.eat(':')) ret = this.type();
      let body = null;
      if (this.isOp('{')) body = this.block(); else this.semi();
      return this.fin(this.node('Method', st, { name: nt.v, nameLine: nt.line, nameCol: nt.col, mods, modToks, params, ret, body, byRef, attrs }));
    }
    // property
    let type = null;
    if (!(this.tok.t === 'var')) type = this.type();
    const props = [];
    do {
      const vt = this.tok;
      if (vt.t !== 'var') this.fail('expected property');
      this.next();
      let def = null;
      if (this.eat('=')) def = this.expr();
      props.push(this.fin(this.node('PropItem', vt, { name: vt.v, def })));
    } while (this.eat(','));
    if (this.isOp('{')) this.skipBalanced('{', '}'); else this.semi();
    return this.fin(this.node('PropDecl', st, { mods, modToks, type, props, attrs }));
  }

  skipBalanced(open, close) {
    let depth = 0;
    while (this.tok.t !== 'eof') {
      const t = this.next();
      if (t.t === 'op' && t.v === open) depth++;
      else if (t.t === 'op' && t.v === close) { depth--; if (depth <= 0) return; }
    }
  }

  nameTok() {
    const t = this.tok;
    if (t.t !== 'id') this.fail('expected name');
    this.next();
    return this.fin(this.node('Name', t, { name: t.v }));
  }

  primaryVar() {
    const t = this.tok;
    if (t.t === 'var') { this.next(); return this.fin(this.node('Var', t, { name: t.v })); }
    if (this.isOp('$')) return this.varVar();
    this.fail('expected variable');
    return null;
  }

  varVar() {
    const t = this.next();
    let e;
    if (this.isOp('{')) { this.next(); e = this.expr(); this.expect('}'); }
    else e = this.primaryVar();
    return this.fin(this.node('VarVar', t, { e }));
  }

  // ───────────────────────── expressions
  exprList(stop) {
    const out = [];
    if (this.isOp(stop)) return out;
    out.push(this.expr());
    while (this.eat(',')) out.push(this.expr());
    return out;
  }

  expr(min = 0) {
    if (++this.depth > 400) { this.depth = 0; throw new RangeError('deep'); }
    try { return this.expr0(min); } finally { this.depth--; }
  }

  expr0(min) {
    let left = this.unary();
    for (;;) {
      const t = this.tok;
      if (t.t === 'op' && t.v === '?') {
        if (min > 5) break;
        this.next();
        let th = null;
        if (!this.isOp(':')) th = this.expr(0);
        this.expect(':');
        const el = this.expr(6);
        left = this.fin(this.node('Ternary', left, { c: left, t: th, f: el, line: left.line, col: left.col, pos: left.pos }));
        continue;
      }
      let op = null;
      if (t.t === 'op' && BIN[t.v]) op = t.v;
      else if (t.t === 'id') { const w = t.v.toLowerCase(); if (w === 'and' || w === 'or' || w === 'xor' || w === 'instanceof') op = w; }
      if (!op) break;
      const [p, assoc] = BIN[op];
      if (p < min) break;
      this.next();
      if (op === 'instanceof') {
        const cls = this.classRef();
        left = this.fin(this.node('Instanceof', left, { e: left, cls, line: left.line, col: left.col, pos: left.pos }));
        continue;
      }
      const right = this.expr(assoc === 'R' ? p : p + 1);
      left = this.fin(this.node('Bin', left, { op, l: left, r: right, opLine: t.line, opCol: t.col, line: left.line, col: left.col, pos: left.pos, kwOp: t.t === 'id' }));
    }
    return left;
  }

  unary() {
    const t = this.tok;
    if (t.t === 'op') {
      switch (t.v) {
        case '!': this.next(); return this.fin(this.node('Unary', t, { op: '!', e: this.expr(18) }));
        case '-': case '+': case '~': case '@': this.next(); return this.fin(this.node('Unary', t, { op: t.v, e: this.expr(20) }));
        case '++': case '--': { this.next(); const e = this.postfix(this.primary()); return this.fin(this.node('Incr', t, { op: t.v, prefix: true, e })); }
        case '&': { this.next(); return this.fin(this.node('Unary', t, { op: '&', e: this.expr(20) })); }
        default: break;
      }
    }
    if (t.t === 'cast') { this.next(); return this.fin(this.node('Cast', t, { type: t.v, e: this.expr(20) })); }
    const e = this.postfix(this.primary());
    const at = this.tok;
    if (at.t === 'op' && ASSIGN.has(at.v) && LVALUE.has(e.k)) {
      this.next();
      let byRef = false;
      if (at.v === '=' && this.isOp('&')) { this.next(); byRef = true; }
      const r = this.expr(4);
      return this.fin(this.node('Assign', e, { op: at.v, l: e, r, byRef, opLine: at.line, opCol: at.col, opTok: at, line: e.line, col: e.col, pos: e.pos }));
    }
    return e;
  }

  classRef() {
    const t = this.tok;
    if (t.t === 'id') { this.next(); return this.fin(this.node('Name', t, { name: t.v })); }
    if (t.t === 'var' || this.isOp('$')) {
      let e = this.primaryVar();
      for (;;) {
        if (this.isOp('->') || this.isOp('?->')) {
          const nullsafe = this.next().v === '?->';
          const nt = this.next();
          e = this.fin(this.node('Prop', t, { obj: e, name: nt.v, nullsafe }));
        } else if (this.isOp('::') && this.peek().t === 'var') {
          this.next();
          const nt = this.next();
          e = this.fin(this.node('SProp', t, { cls: e, name: nt.v }));
        } else if (this.isOp('[')) {
          this.next();
          const idx = this.isOp(']') ? null : this.expr();
          this.expect(']');
          e = this.fin(this.node('Index', t, { obj: e, idx }));
        } else break;
      }
      return e;
    }
    if (this.isOp('(')) { this.next(); const e = this.expr(); this.expect(')'); return e; }
    this.fail('expected class reference');
    return null;
  }

  args() {
    this.expect('(');
    const out = [];
    if (this.isOp('...') && this.isOp(')', this.peek())) {
      this.next(); this.next();
      out.fcc = true;
      return out;
    }
    while (!this.isOp(')') && this.tok.t !== 'eof') {
      const t = this.tok;
      let name = null;
      if (t.t === 'id' && this.isOp(':', this.peek()) && !this.isOp('::', this.peek())) { name = t.v; this.next(); this.next(); }
      const spread = this.eat('...');
      const e = this.expr();
      out.push(this.fin(this.node('Arg', t, { name, e, spread })));
      if (!this.eat(',')) break;
    }
    this.expect(')');
    return out;
  }

  arrayItems(close) {
    const items = [];
    while (!this.isOp(close) && this.tok.t !== 'eof') {
      if (this.isOp(',')) { this.next(); items.push(null); continue; }
      const t = this.tok;
      if (this.eat('...')) {
        items.push(this.fin(this.node('Item', t, { key: null, value: this.expr(), byRef: false, spread: true })));
      } else {
        let byRef = this.eat('&');
        let value = this.expr();
        let key = null;
        if (!byRef && this.eat('=>')) {
          key = value;
          byRef = this.eat('&');
          value = this.expr();
        }
        items.push(this.fin(this.node('Item', t, { key, value, byRef, spread: false })));
      }
      if (!this.eat(',')) break;
    }
    this.expect(close);
    return items;
  }

  closure(t, isStatic) {
    // at 'function' or 'fn'
    const kwTok = this.next();
    const isArrow = kwTok.v.toLowerCase() === 'fn';
    const byRef = this.eat('&');
    const params = this.params();
    if (isArrow) {
      let ret = null;
      if (this.eat(':')) ret = this.type();
      this.expect('=>');
      const body = this.expr(4);
      return this.fin(this.node('ArrowFn', t, { params, ret, body, static: isStatic, byRef }));
    }
    const uses = [];
    if (this.eatKw('use')) {
      this.expect('(');
      while (!this.isOp(')') && this.tok.t !== 'eof') {
        const r = this.eat('&');
        const vt = this.tok;
        if (vt.t !== 'var') this.fail('expected variable');
        this.next();
        uses.push({ k: 'ClosureUse', name: vt.v, byRef: r, line: vt.line, col: vt.col, pos: vt.pos, end: vt.end });
        if (!this.eat(',')) break;
      }
      this.expect(')');
    }
    let ret = null;
    if (this.eat(':')) ret = this.type();
    const body = this.block();
    return this.fin(this.node('Closure', t, { params, uses, ret, body, static: isStatic, byRef }));
  }

  interp(t) {
    const parts = [];
    for (const p of t.parts || []) {
      if (p.s != null) { parts.push(p.s); continue; }
      try {
        const lx = lex(p.code, { php: true, line: p.line, col: p.col, pos: p.pos });
        const sub = new Parser(lx.tokens, this.src, this.lcAbs);
        const e = sub.expr();
        parts.push(e);
      } catch (e) {
        if (!(e instanceof PErr) && !(e instanceof RangeError)) throw e;
      }
    }
    return parts;
  }

  primary() {
    const t = this.tok;
    switch (t.t) {
      case 'var': this.next(); return this.fin(this.node('Var', t, { name: t.v }));
      case 'num': {
        this.next();
        const raw = t.v.replace(/_/g, '');
        let value;
        if (t.float) value = parseFloat(raw);
        else if (/^0[xX]/.test(raw)) value = parseInt(raw.slice(2), 16);
        else if (/^0[bB]/.test(raw)) value = parseInt(raw.slice(2), 2);
        else if (/^0[oO]/.test(raw)) value = parseInt(raw.slice(2), 8);
        else if (/^0[0-7]+$/.test(raw)) value = parseInt(raw, 8);
        else value = Number(raw);
        return this.fin(this.node('Lit', t, { kind: t.float ? 'float' : 'int', value, raw: t.v }));
      }
      case 'str': this.next(); return this.fin(this.node('Lit', t, { kind: 'str', value: t.v, raw: this.src ? this.src.slice(t.pos, t.end) : t.v, q: t.q }));
      case 'tpl': this.next(); return this.fin(this.node('Interp', t, { parts: this.interp(t), q: t.q }));
      case 'shell': this.next(); return this.fin(this.node('Shell', t, { parts: this.interp(t) }));
      case 'op': {
        if (t.v === '$') return this.varVar();
        if (t.v === '[') { this.next(); const items = this.arrayItems(']'); return this.fin(this.node('Arr', t, { items, short: true })); }
        if (t.v === '(') { this.next(); const e = this.expr(); this.expect(')'); return this.fin(this.node('Paren', t, { e })); }
        if (t.v === '#[') { const attrs = this.attributes(); const e = this.primary(); e.attrs = attrs; return e; }
        if (t.v === '&') { this.next(); return this.fin(this.node('Unary', t, { op: '&', e: this.unary() })); }
        if (t.v === '-' || t.v === '+' || t.v === '!' || t.v === '~' || t.v === '@') return this.unary();
        this.fail('unexpected token');
        return null;
      }
      case 'cast': return this.unary();
      case 'id': {
        const w = t.v.toLowerCase();
        const nx = this.peek();
        const call = this.isOp('(', nx);
        switch (w) {
          case 'true': case 'false': this.next(); return this.fin(this.node('Lit', t, { kind: 'bool', value: w === 'true', raw: t.v }));
          case 'null': this.next(); return this.fin(this.node('Lit', t, { kind: 'null', value: null, raw: t.v }));
          case 'array': if (call) { this.next(); this.next(); const items = this.arrayItems(')'); return this.fin(this.node('Arr', t, { items, short: false })); } break;
          case 'list': if (call) { this.next(); this.next(); const items = this.arrayItems(')'); return this.fin(this.node('ListX', t, { items })); } break;
          case 'isset': if (call) { this.next(); const args = this.args().map((a) => a.e); return this.fin(this.node('Isset', t, { args })); } break;
          case 'empty': if (call) { this.next(); const a = this.args(); return this.fin(this.node('Empty', t, { e: a[0] ? a[0].e : null })); } break;
          case 'exit': case 'die': {
            this.next();
            let e = null;
            let paren = false;
            if (this.isOp('(')) { paren = true; this.next(); if (!this.isOp(')')) e = this.expr(); this.expect(')'); }
            return this.fin(this.node('Exit', t, { kind: w, e, paren }));
          }
          case 'print': this.next(); return this.fin(this.node('Print', t, { e: this.expr(4) }));
          case 'include': case 'include_once': case 'require': case 'require_once':
            this.next(); return this.fin(this.node('Include', t, { kind: w, e: this.expr(4) }));
          case 'new': return this.newExpr();
          case 'clone': this.next(); return this.fin(this.node('Clone', t, { e: this.expr(20) }));
          case 'function': case 'fn':
            if (call || (this.isOp('&', nx) && this.isOp('(', this.peek(2)))) return this.closure(t, false);
            break;
          case 'static':
            if (this.isKw('function', nx) || this.isKw('fn', nx)) { this.next(); return this.closure(t, true); }
            break;
          case 'match':
            if (call) return this.matchExpr();
            break;
          case 'yield': {
            this.next();
            if (this.isKw('from')) { this.next(); return this.fin(this.node('YieldFrom', t, { e: this.expr(4) })); }
            let key = null;
            let value = null;
            if (!this.isOp(';') && !this.isOp(')') && !this.isOp(',') && !this.isOp(']') && this.tok.t !== 'eof') {
              value = this.expr(4);
              if (this.eat('=>')) { key = value; value = this.expr(4); }
            }
            return this.fin(this.node('Yield', t, { key, value }));
          }
          case 'throw': this.next(); return this.fin(this.node('Throw', t, { e: this.expr(0) }));
          default: break;
        }
        this.next();
        const nm = this.fin(this.node('Name', t, { name: t.v, magic: MAGIC.has(w) }));
        return nm;
      }
      default:
        this.fail('unexpected token');
        return null;
    }
  }

  newExpr() {
    const t = this.next();
    if (this.isKw('class') || (this.isOp('#[') )) {
      let attrs = null;
      if (this.isOp('#[')) attrs = this.attributes();
      const ct = this.next();
      let args = [];
      if (this.isOp('(')) args = this.args();
      const cls = this.classDecl(ct);
      cls.attrs = attrs;
      return this.fin(this.node('New', t, { cls, args }));
    }
    const cls = this.classRef();
    let args = [];
    let hasArgs = false;
    if (this.isOp('(')) { args = this.args(); hasArgs = true; }
    return this.fin(this.node('New', t, { cls, args, hasArgs }));
  }

  matchExpr() {
    const t = this.next();
    this.expect('(');
    const subject = this.expr();
    this.expect(')');
    this.expect('{');
    const arms = [];
    while (!this.isOp('}') && this.tok.t !== 'eof') {
      const at = this.tok;
      let conds = null;
      if (this.isKw('default') && (this.isOp('=>', this.peek()) || this.isOp(',', this.peek()))) { this.next(); this.eat(','); }
      else {
        conds = [this.expr()];
        while (this.eat(',')) { if (this.isOp('=>')) break; conds.push(this.expr()); }
      }
      this.expect('=>');
      const body = this.expr();
      arms.push(this.fin(this.node('MatchArm', at, { conds, body })));
      if (!this.eat(',')) break;
    }
    this.expect('}');
    return this.fin(this.node('Match', t, { subject, arms }));
  }

  postfix(e) {
    for (;;) {
      const t = this.tok;
      if (t.t !== 'op') break;
      if (t.v === '[') {
        this.next();
        const idx = this.isOp(']') ? null : this.expr();
        this.expect(']');
        e = this.fin(this.node('Index', e, { obj: e, idx, line: e.line, col: e.col, pos: e.pos }));
        continue;
      }
      if (t.v === '->' || t.v === '?->') {
        this.next();
        const nullsafe = t.v === '?->';
        let name;
        const nt = this.tok;
        if (nt.t === 'id') { this.next(); name = nt.v; }
        else if (nt.t === 'var') { this.next(); name = this.fin(this.node('Var', nt, { name: nt.v })); }
        else if (this.isOp('{')) { this.next(); name = this.expr(); this.expect('}'); }
        else if (this.isOp('$')) name = this.varVar();
        else this.fail('expected member name');
        if (this.isOp('(')) {
          const args = this.args();
          e = this.fin(this.node('MCall', e, { obj: e, name, args, nullsafe, nameLine: nt.line, nameCol: nt.col, line: e.line, col: e.col, pos: e.pos }));
        } else {
          e = this.fin(this.node('Prop', e, { obj: e, name, nullsafe, nameLine: nt.line, nameCol: nt.col, line: e.line, col: e.col, pos: e.pos }));
        }
        continue;
      }
      if (t.v === '::') {
        this.next();
        const nt = this.tok;
        if (nt.t === 'var') {
          this.next();
          e = this.fin(this.node('SProp', e, { cls: e, name: nt.v, line: e.line, col: e.col, pos: e.pos }));
          continue;
        }
        let name;
        if (nt.t === 'id') { this.next(); name = nt.v; }
        else if (this.isOp('{')) { this.next(); name = this.expr(); this.expect('}'); }
        else if (this.isOp('$')) { name = this.varVar(); }
        else this.fail('expected static member');
        if (this.isOp('(')) {
          const args = this.args();
          e = this.fin(this.node('SCall', e, { cls: e, name, args, line: e.line, col: e.col, pos: e.pos }));
        } else {
          e = this.fin(this.node('CConst', e, { cls: e, name, line: e.line, col: e.col, pos: e.pos }));
        }
        continue;
      }
      if (t.v === '(') {
        const args = this.args();
        e = this.fin(this.node('Call', e, { callee: e, args, line: e.line, col: e.col, pos: e.pos }));
        continue;
      }
      if ((t.v === '++' || t.v === '--') && LVALUE.has(e.k)) {
        this.next();
        e = this.fin(this.node('Incr', e, { op: t.v, prefix: false, e, line: e.line, col: e.col, pos: e.pos }));
        continue;
      }
      break;
    }
    return e;
  }
}

function parse(src) {
  const lx = lex(src);
  const p = new Parser(lx.tokens, String(src == null ? '' : src), lx.lc);
  let ast;
  try {
    ast = p.parseProgram();
  } catch (e) {
    if (!(e instanceof PErr) && !(e instanceof RangeError)) throw e;
    p.errors.push(e.message);
    ast = { k: 'Program', stmts: [], line: 1, col: 1, pos: 0, end: 0, endLine: 1, endCol: 1 };
  }
  return { ast, lex: lx, errors: p.errors.concat(lx.info.errors) };
}

module.exports = { parse, Parser, PErr };
