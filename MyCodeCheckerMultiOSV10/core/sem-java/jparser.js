'use strict';

// Tolerant recursive-descent parser for Java 21 to the shared AST
// (see ast.js for the node shapes). A member that does not parse is skipped
// (unit.errors counts it); a method body that does not parse keeps the method
// with body = null and bodyError = true. Nothing here throws to the caller.

const { lex } = require('./lexer');

class ParseError extends Error {
  constructor(msg, tok) {
    super(`${msg} at ${tok ? tok.line + ':' + tok.col : '?'}`);
    this.tok = tok;
  }
}

const PRIMS = new Set(['int', 'long', 'short', 'byte', 'char', 'boolean', 'float', 'double', 'void']);
const RESERVED = new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default',
  'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int',
  'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super',
  'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null']);
const MODS = new Set(['public', 'protected', 'private', 'static', 'final', 'abstract', 'native', 'synchronized', 'transient', 'volatile',
  'strictfp', 'sealed', 'default']);
const BIN_PREC = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7, instanceof: 7,
  '<<': 8, '>>': 8, '>>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=']);

function matchBrackets(toks) {
  const match = new Int32Array(toks.length).fill(-1);
  const stack = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'op') continue;
    const v = t.v;
    if (v === '(' || v === '[' || v === '{') stack.push(i);
    else if (v === ')' || v === ']' || v === '}') {
      const want = v === ')' ? '(' : v === ']' ? '[' : '{';
      // Pop until the matching opener (tolerates stray brackets).
      for (let k = stack.length - 1; k >= 0; k--) {
        if (toks[stack[k]].v === want) {
          match[stack[k]] = i;
          match[i] = stack[k];
          stack.length = k;
          break;
        }
      }
    }
  }
  return match;
}

class JParser {
  constructor(src, toks) {
    this.src = src;
    this.t = toks;
    this.i = 0;
    this.match = matchBrackets(toks);
    this.errors = 0;
    this.errorList = [];
  }

  // ── token helpers ──
  peek(o = 0) { const k = this.i + o; return this.t[k < this.t.length ? k : this.t.length - 1]; }
  is(v, o = 0) { const k = this.peek(o); return (k.t === 'op' || k.t === 'id') && k.v === v; }
  isId(o = 0) { const k = this.peek(o); return k.t === 'id' && !RESERVED.has(k.v); }
  eat(v) { if (this.is(v)) return this.t[this.i++]; return null; }
  next() { return this.t[this.i++] || this.t[this.t.length - 1]; }
  expect(v) { if (!this.is(v)) this.fail(`expected '${v}'`); return this.t[this.i++]; }
  ident() { if (!this.isId()) this.fail('expected identifier'); return this.t[this.i++].v; }
  fail(msg) { throw new ParseError(msg, this.peek()); }
  adj(o) { const a = this.peek(o); const b = this.peek(o + 1); return a.end === b.pos; }
  prevTok() { return this.t[this.i - 1] || this.t[0]; }

  node(k, tok, props) {
    const n = { k, line: tok.line, col: tok.col, s: tok.pos };
    if (props) Object.assign(n, props);
    return n;
  }
  done(n) {
    const p = this.prevTok();
    n.en = p.end;
    n.el = p.line;
    return n;
  }

  // ── compilation unit ──
  parseUnit() {
    const unit = { k: 'Unit', lang: 'java', line: 1, col: 1, s: 0, pkg: null, pkgLine: 0, imports: [], types: [], funcs: [], props: [], stmts: [], annos: [] };
    if (this.is('module') || (this.is('open') && this.is('module', 1))) { unit.module = true; return unit; }
    try {
      const annos = this.annotations();
      if (this.is('package')) {
        const t = this.next();
        unit.pkg = this.qualifiedName();
        unit.pkgLine = t.line;
        unit.annos = annos;
        this.expect(';');
      } else if (annos.length) {
        // Annotations on the first type: rewind.
        this.i = 0;
      }
      while (this.is('import') || this.is(';')) {
        if (this.eat(';')) continue;
        const t = this.next();
        const imp = { k: 'Import', line: t.line, col: t.col, static: false, star: false, name: '' };
        if (this.eat('static')) imp.static = true;
        const parts = [this.anyName()];
        while (this.eat('.')) {
          if (this.eat('*')) { imp.star = true; break; }
          parts.push(this.anyName());
        }
        imp.name = parts.join('.');
        this.expect(';');
        unit.imports.push(imp);
      }
    } catch (err) {
      this.err(err);
      return unit;
    }
    if (this.is('module') || (this.is('open') && this.is('module', 1)) || (this.is('@') && /module-info/.test(''))) { unit.module = true; return unit; }
    while (this.peek().t !== 'eof') {
      if (this.eat(';')) continue;
      const start = this.i;
      try {
        const mods = this.modifiers();
        const d = this.typeDecl(mods);
        if (!d) this.fail('expected type declaration');
        unit.types.push(d);
      } catch (err) {
        this.err(err);
        this.i = start;
        if (!this.skipMember()) break;
      }
    }
    return unit;
  }

  err(err) {
    if (!(err instanceof ParseError)) throw err;
    this.errors++;
    if (this.errorList.length < 20) this.errorList.push(err.message);
  }

  // Skip one member/declaration from the current position: up to and
  // including the first ';' at depth 0, or the first {...} block.
  skipMember() {
    const start = this.i;
    while (this.peek().t !== 'eof') {
      const t = this.peek();
      if (t.t === 'op' && t.v === ';') { this.i++; return true; }
      if (t.t === 'op' && t.v === '}') { if (this.i === start) this.i++; return true; }
      if (t.t === 'op' && (t.v === '{' || t.v === '(' || t.v === '[')) {
        const m = this.match[this.i];
        if (m < 0) { this.i = this.t.length - 1; return false; }
        this.i = m + 1;
        if (t.v === '{') { this.eat(';'); return true; }
        continue;
      }
      this.i++;
    }
    return this.i > start;
  }

  anyName() {
    const t = this.peek();
    if (t.t !== 'id') this.fail('expected name');
    this.i++;
    return t.v;
  }

  qualifiedName() {
    const parts = [this.anyName()];
    while (this.is('.') && this.peek(1).t === 'id') { this.i++; parts.push(this.anyName()); }
    return parts.join('.');
  }

  // ── annotations / modifiers ──
  annotations() {
    const out = [];
    while (this.is('@') && !this.is('interface', 1)) out.push(this.annotation());
    return out;
  }

  annotation() {
    const t = this.expect('@');
    const a = this.node('Anno', t, { name: this.qualifiedName(), args: [] });
    if (this.is('(')) {
      this.next();
      if (!this.is(')')) {
        do {
          if (this.peek().t === 'id' && this.is('=', 1) && !this.is('=', 2)) {
            const nt = this.next();
            this.next();
            a.args.push({ name: nt.v, value: this.elementValue(), line: nt.line });
          } else {
            a.args.push({ name: 'value', value: this.elementValue(), line: this.peek().line });
          }
        } while (this.eat(','));
      }
      this.expect(')');
    }
    return this.done(a);
  }

  elementValue() {
    if (this.is('@')) return this.annotation();
    if (this.is('{')) return this.arrayInit(true);
    return this.ternary();
  }

  modifiers() {
    const mods = new Set();
    const annos = [];
    for (;;) {
      if (this.is('@') && !this.is('interface', 1)) { annos.push(this.annotation()); continue; }
      const t = this.peek();
      if (t.t === 'id' && MODS.has(t.v)) {
        if (t.v === 'default' && (this.is(':', 1) || this.is('->', 1))) break;
        if (t.v === 'sealed' && !(this.peek(1).t === 'id')) break;
        mods.add(t.v);
        this.i++;
        continue;
      }
      if (t.t === 'id' && t.v === 'non' && this.is('-', 1) && this.is('sealed', 2)) { this.i += 3; mods.add('non-sealed'); continue; }
      break;
    }
    return { mods, annos, line: this.peek().line };
  }

  // ── types ──
  isTypeStart() {
    const t = this.peek();
    return t.t === 'id' && (PRIMS.has(t.v) || !RESERVED.has(t.v));
  }

  type(allowVar) {
    const start = this.peek();
    const annos = this.annotations();
    const t = this.peek();
    if (t.t !== 'id') this.fail('expected type');
    let ty;
    if (PRIMS.has(t.v)) {
      this.i++;
      ty = this.node('Type', t, { name: t.v, args: [], dims: 0, prim: true });
    } else {
      if (RESERVED.has(t.v)) this.fail('expected type');
      if (t.v === 'var' && !allowVar && false) this.fail('var');
      ty = this.node('Type', t, { name: '', args: [], dims: 0, prim: false });
      const parts = [];
      for (;;) {
        parts.push(this.anyName());
        if (this.is('<')) ty.args = this.typeArgs();
        if (this.is('.') && (this.peek(1).t === 'id' || this.is('@', 1)) && !this.is('class', 1) && !RESERVED.has(this.peek(1).v)) {
          this.i++;
          this.annotations();
          continue;
        }
        break;
      }
      ty.name = parts.join('.');
    }
    while (this.is('@') || (this.is('[') && this.is(']', 1))) {
      if (this.is('@')) { this.annotations(); continue; }
      this.i += 2;
      ty.dims++;
    }
    if (annos.length) ty.annos = annos;
    ty.line = start.line;
    return this.done(ty);
  }

  typeArgs() {
    this.expect('<');
    const args = [];
    if (this.eat('>')) { args.diamond = true; return args; }
    do {
      this.annotations();
      if (this.is('?')) {
        const t = this.next();
        const w = this.node('Type', t, { name: '?', args: [], dims: 0, wildcard: '?' });
        if (this.eat('extends')) { w.wildcard = 'extends'; w.bound = this.type(); } else if (this.eat('super')) { w.wildcard = 'super'; w.bound = this.type(); }
        args.push(this.done(w));
      } else {
        args.push(this.type());
      }
    } while (this.eat(','));
    this.expect('>');
    return args;
  }

  typeParams() {
    this.expect('<');
    const out = [];
    do {
      this.annotations();
      const t = this.peek();
      const p = { name: this.ident(), bounds: [], line: t.line };
      if (this.eat('extends')) {
        p.bounds.push(this.type());
        while (this.eat('&')) p.bounds.push(this.type());
      }
      out.push(p);
    } while (this.eat(','));
    this.expect('>');
    return out;
  }

  typeList() {
    const out = [this.type()];
    while (this.eat(',')) out.push(this.type());
    return out;
  }

  // ── declarations ──
  typeDecl(m) {
    const t = this.peek();
    let kind = null;
    if (this.is('class')) kind = 'class';
    else if (this.is('interface')) kind = 'interface';
    else if (this.is('enum') && this.peek(1).t === 'id') kind = 'enum';
    else if (this.is('record') && this.peek(1).t === 'id' && (this.is('(', 2) || this.is('<', 2))) kind = 'record';
    else if (this.is('@') && this.is('interface', 1)) { kind = 'annotation'; this.i++; }
    if (!kind) return null;
    this.i++;
    const c = this.node('Class', t, { kind, name: this.ident(), mods: m.mods, annos: m.annos, tparams: [], ext: null, impls: [], members: [], params: [], enumConsts: [], permits: [] });
    if (m.annos.length) { c.line = m.annos[0].line; }
    c.nameLine = t.line;
    if (this.is('<')) c.tparams = this.typeParams();
    if (kind === 'record') {
      this.expect('(');
      if (!this.is(')')) {
        do c.params.push(this.param()); while (this.eat(','));
      }
      this.expect(')');
    }
    if (this.eat('extends')) {
      if (kind === 'interface') c.impls = this.typeList();
      else c.ext = this.type();
    }
    if (this.eat('implements')) c.impls = c.impls.concat(this.typeList());
    if (this.eat('permits')) c.permits = this.typeList();
    this.classBody(c);
    return this.done(c);
  }

  classBody(c) {
    const open = this.expect('{');
    const close = this.match[this.i - 1];
    if (c.kind === 'enum') this.enumConstants(c);
    while (!this.is('}') && this.peek().t !== 'eof') {
      if (this.eat(';')) continue;
      const start = this.i;
      try {
        const mem = this.member(c);
        if (mem) c.members.push(mem);
      } catch (err) {
        this.err(err);
        this.i = start;
        if (!this.skipMember()) break;
        if (close >= 0 && this.i > close) { this.i = close; break; }
      }
    }
    this.expect('}');
    c.bodyLine = open.line;
  }

  enumConstants(c) {
    while (!this.is(';') && !this.is('}')) {
      const annos = this.annotations();
      const t = this.peek();
      const ec = this.node('EnumConst', t, { name: this.ident(), args: [], body: null, annos });
      if (this.is('(')) ec.args = this.args();
      if (this.is('{')) {
        const body = this.node('Class', this.peek(), { kind: 'class', name: '', anon: true, mods: new Set(), annos: [], tparams: [], ext: null, impls: [], members: [], params: [], enumConsts: [], permits: [] });
        this.classBody(body);
        ec.body = this.done(body);
      }
      c.enumConsts.push(this.done(ec));
      if (!this.eat(',')) break;
    }
    this.eat(';');
  }

  member(c) {
    const t0 = this.peek();
    if (this.is('{')) {
      return this.done(this.node('Init', t0, { static: false, body: this.block() }));
    }
    if (this.is('static') && this.is('{', 1)) {
      this.next();
      return this.done(this.node('Init', t0, { static: true, body: this.block() }));
    }
    const m = this.modifiers();
    const td = this.typeDecl(m);
    if (td) return td;
    const startTok = m.annos.length ? m.annos[0] : this.peek();
    let tparams = [];
    if (this.is('<')) tparams = this.typeParams();
    // Constructor (incl. compact record constructor).
    if (this.peek().t === 'id' && this.peek().v === c.name && (this.is('(', 1) || (c.kind === 'record' && this.is('{', 1)))) {
      const nt = this.next();
      const meth = this.node('Method', startTok, { name: nt.v, ctor: true, mods: m.mods, annos: m.annos, tparams, ret: null, params: [], throws: [], body: null });
      meth.nameLine = nt.line;
      meth.nameCol = nt.col;
      if (this.is('(')) meth.params = this.params(); else meth.compact = true;
      if (this.eat('throws')) meth.throws = this.typeList();
      this.methodBody(meth);
      return this.done(meth);
    }
    const ty = this.type();
    const nt = this.peek();
    const name = this.ident();
    if (this.is('(')) {
      const meth = this.node('Method', startTok, { name, ctor: false, mods: m.mods, annos: m.annos, tparams, ret: ty, params: [], throws: [], body: null });
      meth.nameLine = nt.line;
      meth.nameCol = nt.col;
      meth.params = this.params();
      while (this.is('[') && this.is(']', 1)) { this.i += 2; ty.dims++; }
      if (this.eat('throws')) meth.throws = this.typeList();
      if (this.eat('default')) meth.defaultValue = this.elementValue();
      this.methodBody(meth);
      return this.done(meth);
    }
    const f = this.node('Field', startTok, { mods: m.mods, annos: m.annos, type: ty, vars: [] });
    f.fin = m.mods.has('final') || c.kind === 'interface' || c.kind === 'annotation';
    this.declarators(f.vars, name, nt);
    this.expect(';');
    return this.done(f);
  }

  methodBody(meth) {
    if (this.eat(';')) return;
    if (!this.is('{')) this.fail("expected '{'");
    const open = this.i;
    const close = this.match[open];
    try {
      meth.body = this.block();
    } catch (err) {
      if (!(err instanceof ParseError) || close < 0) throw err;
      this.err(err);
      meth.body = null;
      meth.bodyError = true;
      this.i = close + 1;
    }
  }

  declarators(out, firstName, firstTok) {
    let name = firstName;
    let tok = firstTok;
    for (;;) {
      const v = this.node('Var', tok, { name, dims: 0, init: null });
      while (this.is('[') && this.is(']', 1)) { this.i += 2; v.dims++; }
      if (this.eat('=')) v.init = this.is('{') ? this.arrayInit() : this.expr();
      out.push(this.done(v));
      if (!this.eat(',')) break;
      tok = this.peek();
      name = this.ident();
    }
  }

  params() {
    this.expect('(');
    const out = [];
    if (!this.is(')')) {
      do {
        // Receiver parameter: Type this
        out.push(this.param());
      } while (this.eat(','));
    }
    this.expect(')');
    return out.filter((p) => p.name !== 'this');
  }

  param() {
    const m = this.modifiers();
    const ty = this.type(true);
    const p = this.node('Param', this.peek(), { name: '', type: ty, mods: m.mods, annos: m.annos, varargs: false });
    if (m.annos.length) { p.line = m.annos[0].line; }
    this.annotations();
    if (this.eat('...')) { p.varargs = true; ty.dims++; }
    const nt = this.peek();
    if (this.is('this')) { this.i++; p.name = 'this'; return this.done(p); }
    p.name = this.ident();
    p.nameLine = nt.line;
    p.nameCol = nt.col;
    while (this.is('[') && this.is(']', 1)) { this.i += 2; ty.dims++; p.cdims = true; }
    return this.done(p);
  }

  // ── statements ──
  block() {
    const t = this.expect('{');
    const b = this.node('Block', t, { stmts: [] });
    while (!this.is('}')) {
      if (this.peek().t === 'eof') this.fail("expected '}'");
      b.stmts.push(this.statement());
    }
    this.expect('}');
    return this.done(b);
  }

  statement() {
    const t = this.peek();
    if (t.t === 'op') {
      if (t.v === '{') return this.block();
      if (t.v === ';') { this.i++; return this.done(this.node('Empty', t)); }
    }
    if (t.t === 'id') {
      switch (t.v) {
        case 'if': {
          this.i++;
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          const n = this.node('If', t, { c, t: this.statement(), f: null });
          if (this.is('else')) { n.elseLine = this.peek().line; this.i++; n.f = this.statement(); }
          return this.done(n);
        }
        case 'while': {
          this.i++;
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          return this.done(this.node('While', t, { c, body: this.statement() }));
        }
        case 'do': {
          this.i++;
          const body = this.statement();
          this.expect('while');
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          this.eat(';');
          return this.done(this.node('Do', t, { body, c }));
        }
        case 'for': return this.forStatement();
        case 'try': return this.tryStatement();
        case 'switch': {
          const sw = this.switchBody(false);
          this.eat(';');
          return sw;
        }
        case 'return': {
          this.i++;
          const n = this.node('Return', t, { e: this.is(';') ? null : this.expr() });
          this.expect(';');
          return this.done(n);
        }
        case 'break':
        case 'continue': {
          this.i++;
          const n = this.node(t.v === 'break' ? 'Break' : 'Continue', t, { label: this.isId() ? this.next().v : null });
          this.expect(';');
          return this.done(n);
        }
        case 'throw': {
          this.i++;
          const n = this.node('Throw', t, { e: this.expr() });
          this.expect(';');
          return this.done(n);
        }
        case 'synchronized':
          if (this.is('(', 1)) {
            this.i++;
            this.expect('(');
            const lock = this.expr();
            this.expect(')');
            return this.done(this.node('Sync', t, { lock, body: this.block() }));
          }
          break;
        case 'assert': {
          this.i++;
          const n = this.node('Assert', t, { c: this.expr(), msg: null });
          if (this.eat(':')) n.msg = this.expr();
          this.expect(';');
          return this.done(n);
        }
        case 'yield':
          if (!this.is('=', 1) && !this.is('.', 1) && !this.is('[', 1) && !this.is('++', 1) && !this.is('--', 1) && !this.is('+=', 1) && !this.is('-=', 1)) {
            this.i++;
            const n = this.node('Yield', t, { e: this.expr() });
            this.expect(';');
            return this.done(n);
          }
          break;
        default:
          break;
      }
      if (this.isId() && this.is(':', 1) && !this.is('::', 1)) {
        this.i += 2;
        return this.done(this.node('Labeled', t, { label: t.v, body: this.statement() }));
      }
      // Local class / record / interface / enum
      const save = this.i;
      if (this.is('class') || this.is('interface') || this.is('abstract') || this.is('final') || this.is('static') || this.is('@') ||
          (this.is('record') && this.peek(1).t === 'id' && (this.is('(', 2) || this.is('<', 2))) || (this.is('enum') && this.peek(1).t === 'id' && this.is('{', 2))) {
        try {
          const m = this.modifiers();
          const td = this.typeDecl(m);
          if (td) return this.done(this.node('LocalClass', t, { cls: td }));
        } catch (err) {
          if (!(err instanceof ParseError)) throw err;
        }
        this.i = save;
      }
      if (this.isLocalVarDecl()) return this.localVar(true);
    } else if (t.t === 'op' && t.v === '@') {
      const save = this.i;
      try {
        const m = this.modifiers();
        const td = this.typeDecl(m);
        if (td) return this.done(this.node('LocalClass', t, { cls: td }));
      } catch (err) {
        if (!(err instanceof ParseError)) throw err;
      }
      this.i = save;
      if (this.isLocalVarDecl()) return this.localVar(true);
    }
    const e = this.expr();
    const n = this.node('ExprStmt', t, { e });
    this.expect(';');
    return this.done(n);
  }

  isLocalVarDecl() {
    const save = this.i;
    try {
      this.modifiers();
      if (!this.isTypeStart()) return false;
      if (this.peek().v === 'void') return false;
      this.type(true);
      if (!this.isId()) return false;
      const nx = this.peek(1);
      return nx.t === 'op' && (nx.v === '=' || nx.v === ';' || nx.v === ',' || nx.v === '[' || nx.v === ':');
    } catch (err) {
      if (!(err instanceof ParseError)) throw err;
      return false;
    } finally {
      this.i = save;
    }
  }

  localVar(semi) {
    const t = this.peek();
    const m = this.modifiers();
    const ty = this.type(true);
    const n = this.node('Local', m.annos.length ? m.annos[0] : t, { type: ty, vars: [], mods: m.mods, annos: m.annos, fin: m.mods.has('final') });
    const nt = this.peek();
    this.declarators(n.vars, this.ident(), nt);
    if (semi) this.expect(';');
    return this.done(n);
  }

  forStatement() {
    const t = this.next();
    this.expect('(');
    // for-each?
    const save = this.i;
    let each = false;
    try {
      this.modifiers();
      this.type(true);
      this.ident();
      each = this.is(':');
    } catch (err) {
      if (!(err instanceof ParseError)) throw err;
    }
    this.i = save;
    if (each) {
      const m = this.modifiers();
      const ty = this.type(true);
      const nt = this.peek();
      const v = this.done(this.node('Var', nt, { name: this.ident(), dims: 0, init: null, type: ty, fin: m.mods.has('final') }));
      this.expect(':');
      const iter = this.expr();
      this.expect(')');
      return this.done(this.node('ForEach', t, { vars: [v], type: ty, iter, body: this.statement() }));
    }
    const n = this.node('For', t, { init: [], c: null, upd: [], body: null });
    if (!this.is(';')) {
      if (this.isLocalVarDecl()) n.init.push(this.localVar(false));
      else {
        do { const st = this.peek(); n.init.push(this.done(this.node('ExprStmt', st, { e: this.expr() }))); } while (this.eat(','));
      }
    }
    this.expect(';');
    if (!this.is(';')) n.c = this.expr();
    this.expect(';');
    if (!this.is(')')) {
      do n.upd.push(this.expr()); while (this.eat(','));
    }
    this.expect(')');
    n.body = this.statement();
    return this.done(n);
  }

  tryStatement() {
    const t = this.next();
    const n = this.node('Try', t, { res: [], body: null, catches: [], fin: null });
    if (this.eat('(')) {
      while (!this.is(')')) {
        if (this.isLocalVarDecl()) {
          const lv = this.localVar(false);
          n.res.push(lv);
        } else {
          const st = this.peek();
          n.res.push(this.done(this.node('ExprStmt', st, { e: this.expr() })));
        }
        if (!this.eat(';')) break;
      }
      this.expect(')');
    }
    n.body = this.block();
    while (this.is('catch')) {
      const ct = this.next();
      this.expect('(');
      const m = this.modifiers();
      const types = [this.type()];
      while (this.eat('|')) types.push(this.type());
      const nt = this.peek();
      const name = this.ident();
      this.expect(')');
      const c = this.node('Catch', ct, { types, name, nameLine: nt.line, mods: m.mods, body: this.block() });
      n.catches.push(this.done(c));
    }
    if (this.eat('finally')) n.fin = this.block();
    if (!n.catches.length && !n.fin && !n.res.length) this.fail('try without catch/finally');
    return this.done(n);
  }

  switchBody(isExpr) {
    const t = this.expect('switch');
    this.expect('(');
    const sel = this.expr();
    this.expect(')');
    this.expect('{');
    const sw = this.node('Switch', t, { sel, cases: [], expr: isExpr, arrow: false });
    while (!this.is('}')) {
      const ct = this.peek();
      const c = this.node('Case', ct, { labels: [], dflt: false, guard: null, body: [], arrow: false });
      if (this.eat('default')) {
        c.dflt = true;
      } else {
        this.expect('case');
        do {
          if (this.is('default')) { this.i++; c.dflt = true; continue; }
          c.labels.push(this.caseLabel());
        } while (this.eat(','));
        if (this.is('when')) { this.i++; c.guard = this.expr(); }
      }
      if (this.eat('->')) {
        c.arrow = true;
        sw.arrow = true;
        if (this.is('{')) c.body = [this.block()];
        else if (this.is('throw')) c.body = [this.statement()];
        else {
          const st = this.peek();
          const e = this.expr();
          this.expect(';');
          c.body = [this.done(this.node('ExprStmt', st, { e, arrowValue: true }))];
        }
      } else {
        this.expect(':');
        while (!this.is('case') && !this.is('}') && !(this.is('default') && (this.is(':', 1) || this.is('->', 1)))) {
          if (this.peek().t === 'eof') this.fail('eof in switch');
          c.body.push(this.statement());
        }
      }
      sw.cases.push(this.done(c));
    }
    this.expect('}');
    return this.done(sw);
  }

  caseLabel() {
    const save = this.i;
    try {
      const p = this.pattern();
      if (p) return p;
    } catch (err) {
      if (!(err instanceof ParseError)) throw err;
    }
    this.i = save;
    return this.ternary();
  }

  // Type pattern `T name` or record pattern `R(...) [name]`; null otherwise.
  pattern() {
    const t = this.peek();
    const m = this.modifiers();
    if (!this.isTypeStart()) return null;
    const ty = this.type(true);
    if (this.is('(')) {
      this.next();
      const subs = [];
      if (!this.is(')')) {
        do {
          const s = this.pattern();
          if (!s) this.fail('pattern');
          subs.push(s);
        } while (this.eat(','));
      }
      this.expect(')');
      const rp = this.node('RecPat', t, { type: ty, subs, name: null });
      if (this.isId() && !this.is('when')) rp.name = this.next().v;
      return this.done(rp);
    }
    if (this.isId() && !(this.is('when') && !this.isId(1) && !this.is('->', 1) && !this.is(':', 1))) {
      const nt = this.next();
      return this.done(this.node('TypePat', t, { type: ty, name: nt.v, fin: m.mods.has('final') }));
    }
    return null;
  }

  // ── expressions ──
  expr() {
    if (this.isLambdaStart()) return this.lambda();
    const t = this.peek();
    const lhs = this.ternary();
    const op = this.assignOp();
    if (op) {
      this.i += op.n;
      const v = this.expr();
      return this.done(this.node('Assign', t, { op: op.op, t: lhs, v }));
    }
    return lhs;
  }

  assignOp() {
    const t = this.peek();
    if (t.t !== 'op') return null;
    if (ASSIGN_OPS.has(t.v)) return { op: t.v, n: 1 };
    if (t.v === '>' && this.is('>', 1) && this.adj(0)) {
      if (this.is('=', 2) && this.adj(1)) return { op: '>>=', n: 3 };
      if (this.is('>', 2) && this.adj(1) && this.is('=', 3) && this.adj(2)) return { op: '>>>=', n: 4 };
    }
    return null;
  }

  isLambdaStart() {
    const t = this.peek();
    if (t.t === 'id' && !RESERVED.has(t.v) && this.is('->', 1)) return true;
    if (t.t === 'op' && t.v === '(') {
      const m = this.match[this.i];
      if (m > 0 && this.t[m + 1] && this.t[m + 1].t === 'op' && this.t[m + 1].v === '->') return true;
    }
    return false;
  }

  lambda() {
    const t = this.peek();
    const lam = this.node('Lambda', t, { params: [], body: null });
    if (t.t === 'id') {
      this.i++;
      lam.params.push(this.done(this.node('Param', t, { name: t.v, type: null, mods: new Set(), annos: [] })));
    } else {
      this.expect('(');
      if (!this.is(')')) {
        do {
          if (this.isId() && (this.is(',', 1) || this.is(')', 1))) {
            const pt = this.next();
            lam.params.push(this.done(this.node('Param', pt, { name: pt.v, type: null, mods: new Set(), annos: [] })));
          } else {
            lam.params.push(this.param());
          }
        } while (this.eat(','));
      }
      this.expect(')');
    }
    this.expect('->');
    lam.body = this.is('{') ? this.block() : this.expr();
    return this.done(lam);
  }

  ternary() {
    const t = this.peek();
    const c = this.binary(1);
    if (this.is('?')) {
      this.i++;
      const a = this.isLambdaStart() ? this.lambda() : this.ternaryOrAssign();
      this.expect(':');
      const b = this.isLambdaStart() ? this.lambda() : this.ternary();
      return this.done(this.node('Cond', t, { c, a, b }));
    }
    return c;
  }

  ternaryOrAssign() {
    return this.expr();
  }

  binOp() {
    const t = this.peek();
    if (t.t === 'id') return t.v === 'instanceof' ? { op: 'instanceof', n: 1 } : null;
    if (t.t !== 'op') return null;
    if (t.v === '>') {
      if (this.is('>', 1) && this.adj(0)) {
        if (this.is('>', 2) && this.adj(1)) {
          if (this.is('=', 3) && this.adj(2)) return null;
          return { op: '>>>', n: 3 };
        }
        if (this.is('=', 2) && this.adj(1)) return null;
        return { op: '>>', n: 2 };
      }
      if (this.is('=', 1) && this.adj(0)) return { op: '>=', n: 2 };
      return { op: '>', n: 1 };
    }
    return BIN_PREC[t.v] ? { op: t.v, n: 1 } : null;
  }

  binary(minPrec) {
    const t = this.peek();
    let left = this.unary();
    for (;;) {
      const op = this.binOp();
      if (!op) break;
      const prec = BIN_PREC[op.op];
      if (prec < minPrec) break;
      const opTok = this.peek();
      this.i += op.n;
      if (op.op === 'instanceof') {
        const n = this.node('InstOf', t, { e: left, type: null, bind: null, pat: null });
        const fin = this.eat('final');
        const save = this.i;
        const p = (() => { try { return this.pattern(); } catch (err) { if (!(err instanceof ParseError)) throw err; return null; } })();
        if (p && p.k === 'RecPat') { n.pat = p; n.type = p.type; } else if (p && p.k === 'TypePat') { n.type = p.type; n.bind = p.name; } else {
          this.i = save;
          n.type = this.type();
        }
        void fin;
        left = this.done(n);
        continue;
      }
      const right = this.binary(prec + 1);
      left = this.done(this.node('Bin', t, { op: op.op, l: left, r: right, opLine: opTok.line, opCol: opTok.col }));
    }
    return left;
  }

  unary() {
    const t = this.peek();
    if (t.t === 'op') {
      if (t.v === '++' || t.v === '--' || t.v === '+' || t.v === '-' || t.v === '!' || t.v === '~') {
        this.i++;
        const e = this.unary();
        if ((t.v === '-') && e.k === 'Lit' && (e.t === 'int' || e.t === 'long' || e.t === 'double' || e.t === 'float') && e.s === t.end) {
          e.v = typeof e.v === 'number' ? -e.v : e.v;
          e.neg = true;
          e.s = t.pos; e.line = t.line; e.col = t.col;
          e.raw = '-' + e.raw;
          return e;
        }
        return this.done(this.node('Un', t, { op: t.v, e, post: false }));
      }
      if (t.v === '(') {
        const c = this.tryCast();
        if (c) return c;
      }
    }
    return this.postfix(this.primary());
  }

  tryCast() {
    const t = this.peek();
    const save = this.i;
    const close = this.match[this.i];
    if (close < 0) return null;
    try {
      this.i++;
      const ty = this.type();
      const types = [ty];
      while (this.eat('&')) types.push(this.type());
      if (this.i !== close) { this.i = save; return null; }
      this.i++;
      const nx = this.peek();
      let ok = false;
      if (ty.prim && ty.dims === 0) ok = !(nx.t === 'op' && (nx.v === ')' || nx.v === ';' || nx.v === ',' || nx.v === '.' || nx.v === '['));
      else if (ty.prim) ok = true;
      else if (nx.t === 'id') ok = !['instanceof'].includes(nx.v);
      else if (nx.t === 'num' || nx.t === 'str' || nx.t === 'char') ok = true;
      else if (nx.t === 'op') ok = nx.v === '(' || nx.v === '!' || nx.v === '~';
      if (!ok) { this.i = save; return null; }
      const e = this.isLambdaStart() ? this.lambda() : this.unary();
      const n = this.node('Cast', t, { type: ty, e });
      if (types.length > 1) n.types = types;
      return this.done(n);
    } catch (err) {
      if (!(err instanceof ParseError)) throw err;
      this.i = save;
      return null;
    }
  }

  literal(t) {
    if (t.t === 'num') {
      const raw = t.v;
      const clean = raw.replace(/_/g, '');
      let kind = 'int';
      let v;
      if (/^0[xX]/.test(clean) && !/[pP]/.test(clean)) {
        kind = /[lL]$/.test(clean) ? 'long' : 'int';
        const hex = clean.replace(/[lL]$/, '').slice(2);
        v = hex.length <= 13 ? parseInt(hex, 16) : Number(BigInt('0x' + hex));
        if (kind === 'int' && v > 0x7fffffff && v <= 0xffffffff) v = v - 0x100000000;
      } else if (/^0[bB]/.test(clean)) {
        kind = /[lL]$/.test(clean) ? 'long' : 'int';
        v = parseInt(clean.replace(/[lL]$/, '').slice(2), 2);
        if (kind === 'int' && v > 0x7fffffff && v <= 0xffffffff) v = v - 0x100000000;
      } else if (/[.eEpP]/.test(clean) && !/^0[xX]/.test(clean) || /[fFdD]$/.test(clean) && !/^0[xX]/.test(clean)) {
        kind = /[fF]$/.test(clean) ? 'float' : 'double';
        v = parseFloat(clean.replace(/[fFdD]$/, ''));
      } else {
        kind = /[lL]$/.test(clean) ? 'long' : 'int';
        const digits = clean.replace(/[lLuU]+$/, '');
        v = /^0\d/.test(digits) ? parseInt(digits, 8) : Number(digits);
        if (/^0\d/.test(digits)) this.octal = true;
      }
      const n = this.node('Lit', t, { t: kind, v, raw });
      if (/^0[0-7]+[lL]?$/.test(clean)) n.octal = true;
      return n;
    }
    if (t.t === 'str') return this.node('Lit', t, { t: 'str', v: t.v, raw: this.src.slice(t.pos, t.end), tb: !!t.tb });
    if (t.t === 'char') return this.node('Lit', t, { t: 'char', v: t.v, raw: this.src.slice(t.pos, t.end) });
    return null;
  }

  primary() {
    const t = this.next();
    if (t.t === 'num' || t.t === 'str' || t.t === 'char') return this.done(this.literal(t));
    if (t.t === 'op') {
      if (t.v === '(') {
        const e = this.expr();
        this.expect(')');
        return this.done(this.node('Paren', t, { e }));
      }
      if (t.v === '<') {
        // Generic method call without receiver: <T>foo()
        this.i--;
        this.typeArgs();
        const nt = this.peek();
        const name = this.ident();
        return this.done(this.node('Call', nt, { o: null, id: name, args: this.args() }));
      }
      if (t.v === '@') {
        this.i--;
        this.annotations();
        return this.primary();
      }
      this.i--;
      this.fail(`unexpected '${t.v}'`);
    }
    if (t.t !== 'id') { this.i--; this.fail('unexpected end'); }
    switch (t.v) {
      case 'true':
      case 'false': return this.done(this.node('Lit', t, { t: 'bool', v: t.v === 'true', raw: t.v }));
      case 'null': return this.done(this.node('Lit', t, { t: 'null', v: null, raw: 'null' }));
      case 'this':
        if (this.is('(')) return this.done(this.node('Call', t, { o: null, id: 'this', args: this.args(), ctorCall: true }));
        return this.done(this.node('This', t, { q: null }));
      case 'super':
        if (this.is('(')) return this.done(this.node('Call', t, { o: null, id: 'super', args: this.args(), ctorCall: true }));
        if (this.is('::')) return this.done(this.node('Super', t, { q: null }));
        if (this.is('.')) return this.done(this.node('Super', t, { q: null }));
        this.i--;
        this.fail('bad super');
        break;
      case 'new': return this.creator(t);
      case 'switch': this.i--; return this.switchBody(true);
      default: break;
    }
    if (PRIMS.has(t.v)) {
      // int.class, int[].class, int[]::new
      this.i--;
      const ty = this.type();
      if (this.is('.') && this.is('class', 1)) { this.i += 2; return this.done(this.node('ClassLit', t, { type: ty })); }
      if (this.is('::')) return this.done(this.node('TypeExpr', t, { type: ty }));
      this.fail('primitive in expression');
    }
    if (RESERVED.has(t.v)) { this.i--; this.fail(`unexpected '${t.v}'`); }
    if (this.is('(')) return this.done(this.node('Call', t, { o: null, id: t.v, args: this.args() }));
    // Array type for class literal / method ref: Foo[].class, Foo[]::new
    if (this.is('[') && this.is(']', 1)) {
      this.i--;
      const ty = this.type();
      if (this.is('.') && this.is('class', 1)) { this.i += 2; return this.done(this.node('ClassLit', t, { type: ty })); }
      if (this.is('::')) return this.done(this.node('TypeExpr', t, { type: ty }));
      this.fail('array type');
    }
    // Generic type method ref / array: List<String>::new, Class<?>[]::new
    if (this.is('<')) {
      const save = this.i;
      try {
        this.i--;
        const ty = this.type();
        if (this.is('::')) return this.done(this.node('TypeExpr', t, { type: ty }));
        if (this.is('.') && this.is('class', 1)) { this.i += 2; return this.done(this.node('ClassLit', t, { type: ty })); }
      } catch (err) {
        if (!(err instanceof ParseError)) throw err;
      }
      this.i = save;
    }
    return this.done(this.node('Name', t, { id: t.v }));
  }

  creator(t) {
    if (this.is('<')) this.typeArgs();
    const annos = this.annotations();
    void annos;
    const tt = this.peek();
    // Type without dims first.
    let ty;
    if (PRIMS.has(tt.v)) {
      this.i++;
      ty = this.node('Type', tt, { name: tt.v, args: [], dims: 0, prim: true });
      this.done(ty);
    } else {
      ty = this.node('Type', tt, { name: '', args: [], dims: 0, prim: false });
      const parts = [];
      for (;;) {
        this.annotations();
        parts.push(this.anyName());
        if (this.is('<')) ty.args = this.typeArgs();
        if (this.is('.') && this.peek(1).t === 'id') { this.i++; continue; }
        break;
      }
      ty.name = parts.join('.');
      this.done(ty);
    }
    const n = this.node('New', t, { type: ty, args: [], body: null, dims: [], init: null });
    if (this.is('[')) {
      while (this.is('[')) {
        this.i++;
        if (this.eat(']')) { ty.dims++; continue; }
        n.dims.push(this.expr());
        this.expect(']');
        ty.dims++;
      }
      if (this.is('{')) n.init = this.arrayInit();
      n.array = true;
      return this.done(n);
    }
    n.args = this.args();
    if (this.is('{')) {
      const body = this.node('Class', this.peek(), { kind: 'class', name: '', anon: true, mods: new Set(), annos: [], tparams: [], ext: ty, impls: [], members: [], params: [], enumConsts: [], permits: [] });
      this.classBody(body);
      n.body = this.done(body);
    }
    return this.done(n);
  }

  arrayInit(annotationCtx) {
    const t = this.expect('{');
    const n = this.node('ArrInit', t, { elems: [] });
    while (!this.is('}')) {
      n.elems.push(this.is('{') ? this.arrayInit(annotationCtx) : (annotationCtx ? this.elementValue() : this.expr()));
      if (!this.eat(',')) break;
    }
    this.expect('}');
    return this.done(n);
  }

  args() {
    this.expect('(');
    const out = [];
    if (!this.is(')')) {
      do out.push(this.expr()); while (this.eat(','));
    }
    this.expect(')');
    return out;
  }

  postfix(e) {
    for (;;) {
      const t = this.peek();
      if (t.t !== 'op') break;
      if (t.v === '.') {
        this.i++;
        const nt = this.peek();
        if (nt.t === 'id' && nt.v === 'new') {
          this.i++;
          const inner = this.creator(nt);
          inner.outer = e;
          inner.s = e.s; inner.line = e.line; inner.col = e.col;
          e = this.done(inner);
          continue;
        }
        if (nt.t === 'op' && nt.v === '<') {
          this.typeArgs();
          const mt = this.peek();
          const name = this.ident();
          e = this.done(this.node('Call', e, { o: e, id: name, args: this.args(), idLine: mt.line, idCol: mt.col }));
          e.line = e.o.line; e.col = e.o.col; e.s = e.o.s;
          continue;
        }
        if (nt.t === 'id' && nt.v === 'class') { this.i++; e = this.done(Object.assign(this.node('ClassLit', t), { type: exprToType(e), line: e.line, col: e.col, s: e.s })); continue; }
        if (nt.t === 'id' && nt.v === 'this') { this.i++; e = this.done(Object.assign(this.node('This', t), { q: e, line: e.line, col: e.col, s: e.s })); continue; }
        if (nt.t === 'id' && nt.v === 'super') {
          this.i++;
          if (this.is('(')) { e = this.done(Object.assign(this.node('Call', t, { o: e, id: 'super', args: this.args(), ctorCall: true }), { line: e.line, col: e.col, s: e.s })); continue; }
          e = this.done(Object.assign(this.node('Super', t), { q: e, line: e.line, col: e.col, s: e.s }));
          continue;
        }
        if (nt.t !== 'id') this.fail('expected member name');
        this.i++;
        if (this.is('(')) {
          const c = { k: 'Call', line: e.line, col: e.col, s: e.s, o: e, id: nt.v, args: this.args(), idLine: nt.line, idCol: nt.col };
          e = this.done(c);
        } else {
          e = this.done({ k: 'Sel', line: e.line, col: e.col, s: e.s, o: e, id: nt.v, idLine: nt.line, idCol: nt.col });
        }
        continue;
      }
      if (t.v === '[' && this.is(']', 1)) {
        const ty = exprToType(e);
        while (this.is('[') && this.is(']', 1)) { this.i += 2; ty.dims++; }
        if (this.is('.') && this.is('class', 1)) { this.i += 2; e = this.done({ k: 'ClassLit', line: e.line, col: e.col, s: e.s, type: ty }); continue; }
        if (this.is('::')) { e = this.done({ k: 'TypeExpr', line: e.line, col: e.col, s: e.s, type: ty }); continue; }
        this.fail('array type');
      }
      if (t.v === '[') {
        this.i++;
        const idx = this.expr();
        this.expect(']');
        e = this.done({ k: 'Idx', line: e.line, col: e.col, s: e.s, o: e, i: idx });
        continue;
      }
      if (t.v === '::') {
        this.i++;
        const nt = this.next();
        if (nt.t !== 'id') this.fail('method ref');
        e = this.done({ k: 'MRef', line: e.line, col: e.col, s: e.s, o: e, id: nt.v });
        continue;
      }
      if (t.v === '++' || t.v === '--') {
        this.i++;
        e = this.done({ k: 'Un', line: e.line, col: e.col, s: e.s, op: t.v, e, post: true });
        continue;
      }
      break;
    }
    return e;
  }
}

function exprToType(e) {
  const parts = [];
  let x = e;
  while (x && x.k === 'Sel') { parts.unshift(x.id); x = x.o; }
  if (x && x.k === 'Name') parts.unshift(x.id);
  if (x && x.k === 'TypeExpr') return x.type;
  return { k: 'Type', name: parts.join('.'), args: [], dims: 0, line: e.line, col: e.col };
}

function parseJava(text) {
  const lx = lex(text, 'java');
  const p = new JParser(String(text || ''), lx.toks);
  let unit;
  try {
    unit = p.parseUnit();
  } catch (err) {
    unit = { k: 'Unit', lang: 'java', line: 1, col: 1, pkg: null, imports: [], types: [], funcs: [], props: [], stmts: [], annos: [], fatal: String(err && err.message) };
    p.errors++;
  }
  unit.comments = lx.comments;
  unit.errors = p.errors;
  unit.errorList = p.errorList;
  unit.lineCount = lx.lines;
  return unit;
}

module.exports = { parseJava, ParseError, matchBrackets, PRIMS, exprToType };
