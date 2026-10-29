'use strict';

// Tolerant recursive-descent parser for Kotlin to the shared AST (ast.js).
// Kotlin is newline sensitive: a line break ends an expression unless it is
// inside ( ) or [ ], or the next line starts with . ?. ?: && || .
// Statement-position if / when / try / return / throw become the statement
// kinds the CFG understands; in expression position they stay expressions
// (IfX, Switch{expr:true}, TryX, Return, Throw...).

const { lex } = require('./lexer');
const { ParseError, matchBrackets } = require('./jparser');

const HARD = new Set(['as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in', 'interface', 'is', 'null',
  'object', 'package', 'return', 'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while']);
const MODS = new Set(['public', 'private', 'protected', 'internal', 'open', 'abstract', 'final', 'override', 'sealed', 'data', 'inner',
  'enum', 'annotation', 'companion', 'lateinit', 'const', 'suspend', 'inline', 'noinline', 'crossinline', 'tailrec', 'external',
  'operator', 'infix', 'value', 'vararg', 'reified', 'expect', 'actual']);
const PREC = { '||': 1, '&&': 2, '==': 3, '!=': 3, '===': 3, '!==': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, in: 5, '!in': 5, is: 5, '!is': 5,
  '?:': 6, infix: 7, '..': 8, '..<': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };
const NO_INFIX = new Set(['else', 'catch', 'finally', 'by', 'where', 'get', 'set', 'in', 'is', 'as', 'val', 'var', 'fun', 'class',
  'interface', 'object', 'if', 'when', 'try', 'while', 'for', 'do', 'return', 'throw', 'break', 'continue', 'this', 'super', 'null',
  'true', 'false', 'import', 'package', 'init', 'constructor', 'typealias', 'companion', 'private', 'public', 'protected', 'internal',
  'override', 'open', 'abstract', 'final', 'data', 'sealed', 'enum', 'inner', 'lateinit', 'const', 'suspend', 'inline', 'operator']);
const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=']);

function insensitivity(toks, match) {
  // insens[i] = innermost enclosing bracket of token i is ( or [
  const ins = new Uint8Array(toks.length);
  const stack = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    ins[i] = stack.length && stack[stack.length - 1] ? 1 : 0;
    if (t.t !== 'op') continue;
    if ((t.v === '(' || t.v === '[' || t.v === '{') && match[i] > i) stack.push(t.v !== '{');
    else if ((t.v === ')' || t.v === ']' || t.v === '}') && match[i] >= 0 && match[i] < i) stack.pop();
  }
  return ins;
}

class KParser {
  constructor(src, toks) {
    this.src = src;
    this.t = toks;
    this.i = 0;
    this.match = matchBrackets(toks);
    this.ins = insensitivity(toks, this.match);
    this.errors = 0;
    this.errorList = [];
  }

  peek(o = 0) { const k = this.i + o; return this.t[k < this.t.length ? k : this.t.length - 1]; }
  is(v, o = 0) { const k = this.peek(o); return (k.t === 'op' || k.t === 'id') && k.v === v && !k.bq; }
  isId(o = 0) { const k = this.peek(o); return k.t === 'id' && (k.bq || !HARD.has(k.v)); }
  eat(v) { if (this.is(v)) return this.t[this.i++]; return null; }
  next() { return this.t[this.i++] || this.t[this.t.length - 1]; }
  expect(v) { if (!this.is(v)) this.fail(`expected '${v}'`); return this.t[this.i++]; }
  ident() { if (!this.isId()) this.fail('expected identifier'); return this.t[this.i++].v; }
  fail(msg) { throw new ParseError(msg, this.peek()); }
  adj(o) { const a = this.peek(o); const b = this.peek(o + 1); return a.end === b.pos; }
  prevTok() { return this.t[this.i - 1] || this.t[0]; }
  // Line break before token o that ends an expression.
  nlBreak(o = 0) { const k = this.i + o; const t = this.peek(o); return t.nl && !(k < this.ins.length && this.ins[k]); }
  node(k, tok, props) {
    const n = { k, line: tok.line, col: tok.col, s: tok.pos !== undefined ? tok.pos : tok.s };
    if (props) Object.assign(n, props);
    return n;
  }
  done(n) { const p = this.prevTok(); n.en = p.end; n.el = p.line; return n; }
  semis() { while (this.is(';')) this.i++; }

  err(err) {
    if (!(err instanceof ParseError)) throw err;
    this.errors++;
    if (this.errorList.length < 20) this.errorList.push(err.message);
  }

  // Skip one declaration: to the end of the line at depth 0, or past a {...} block.
  skipDecl() {
    const start = this.i;
    const line = this.peek().line;
    while (this.peek().t !== 'eof') {
      const t = this.peek();
      if (this.i > start && t.nl && t.line !== line && !this.ins[this.i]) {
        // stop at a line that starts a new declaration
        if (t.t === 'id' && (MODS.has(t.v) || ['fun', 'val', 'var', 'class', 'object', 'interface', 'init', 'constructor', 'typealias'].includes(t.v))) return true;
        if (t.t === 'op' && t.v === '@') return true;
      }
      if (t.t === 'op' && t.v === '}') { if (this.i === start) this.i++; return true; }
      if (t.t === 'op' && (t.v === '{' || t.v === '(' || t.v === '[')) {
        const m = this.match[this.i];
        if (m < 0) { this.i = this.t.length - 1; return false; }
        this.i = m + 1;
        continue;
      }
      this.i++;
    }
    return this.i > start;
  }

  qualifiedName() {
    const parts = [this.anyName()];
    while (this.is('.') && this.peek(1).t === 'id') { this.i++; parts.push(this.anyName()); }
    return parts.join('.');
  }
  anyName() { const t = this.peek(); if (t.t !== 'id') this.fail('expected name'); this.i++; return t.v; }

  // ── unit ──
  parseUnit() {
    const unit = { k: 'Unit', lang: 'kt', line: 1, col: 1, s: 0, pkg: null, pkgLine: 0, imports: [], types: [], funcs: [], props: [], stmts: [], annos: [] };
    try {
      while (this.is('@') && this.is('file', 1) && this.is(':', 2)) {
        this.i += 3;
        if (this.is('[')) this.i = this.match[this.i] + 1;
        else { this.qualifiedName(); if (this.is('(')) this.i = this.match[this.i] + 1; }
      }
      this.semis();
      if (this.is('package')) {
        const t = this.next();
        unit.pkg = this.qualifiedName();
        unit.pkgLine = t.line;
      }
      this.semis();
      while (this.is('import')) {
        const t = this.next();
        const imp = { k: 'Import', line: t.line, col: t.col, static: false, star: false, name: '', alias: null };
        const parts = [this.anyName()];
        while (this.is('.')) {
          this.i++;
          if (this.eat('*')) { imp.star = true; break; }
          parts.push(this.anyName());
        }
        imp.name = parts.join('.');
        if (this.is('as') && !this.nlBreak()) { this.i++; imp.alias = this.anyName(); }
        unit.imports.push(imp);
        this.semis();
      }
    } catch (err) {
      this.err(err);
      return unit;
    }
    while (this.peek().t !== 'eof') {
      if (this.eat(';')) continue;
      const start = this.i;
      try {
        const m = this.modifiers();
        const d = this.declaration(m, 'top');
        if (d) {
          if (d.k === 'Class') unit.types.push(d);
          else if (d.k === 'Method') unit.funcs.push(d);
          else if (d.k === 'Field') unit.props.push(d);
        } else {
          this.i = start;
          unit.stmts.push(this.statement());
        }
      } catch (err) {
        this.err(err);
        this.i = start;
        if (!this.skipDecl()) break;
      }
    }
    return unit;
  }

  // ── modifiers / annotations ──
  annotation() {
    const t = this.expect('@');
    if (this.is('[')) {
      const m = this.match[this.i];
      const a = this.node('Anno', t, { name: '', args: [] });
      this.i++;
      while (!this.is(']') && this.peek().t !== 'eof') {
        const nt = this.peek();
        const sub = this.node('Anno', nt, { name: this.qualifiedName(), args: [] });
        if (this.is('(') && this.adj(-1)) sub.args = this.annoArgs();
        a.args.push({ name: 'value', value: sub });
      }
      this.i = m + 1;
      return this.done(a);
    }
    // use-site target
    if (this.peek().t === 'id' && this.is(':', 1) && this.adj(0) && ['field', 'get', 'set', 'param', 'property', 'receiver', 'setparam', 'delegate', 'file'].includes(this.peek().v)) {
      this.i += 2;
      if (this.is('[')) { const a = this.node('Anno', t, { name: '', args: [] }); this.i = this.match[this.i] + 1; return this.done(a); }
    }
    const a = this.node('Anno', t, { name: this.qualifiedName(), args: [] });
    if (this.is('<') && this.adj(-1)) this.typeArgs();
    if (this.is('(') && this.adj(-1)) a.args = this.annoArgs();
    return this.done(a);
  }

  annoArgs() {
    const out = [];
    this.expect('(');
    while (!this.is(')')) {
      if (this.isId() && this.is('=', 1)) {
        const nt = this.next();
        this.next();
        out.push({ name: nt.v, value: this.expr(), line: nt.line });
      } else {
        this.eat('*');
        out.push({ name: 'value', value: this.expr(), line: this.peek().line });
      }
      if (!this.eat(',')) break;
    }
    this.expect(')');
    return out;
  }

  modifiers() {
    const mods = new Set();
    const annos = [];
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && t.v === '@') {
        // label (foo@) is not an annotation here
        annos.push(this.annotation());
        continue;
      }
      if (t.t === 'id' && !t.bq && MODS.has(t.v)) {
        const nx = this.peek(1);
        if (nx.t === 'id' && !nx.nl) { mods.add(t.v); this.i++; continue; }
        if (nx.t === 'op' && nx.v === '@' && !nx.nl) { mods.add(t.v); this.i++; continue; }
        if (t.v !== 'enum' && nx.t === 'id' && nx.nl && (MODS.has(nx.v) || ['fun', 'val', 'var', 'class', 'object', 'interface', 'constructor'].includes(nx.v))) { mods.add(t.v); this.i++; continue; }
      }
      if (t.t === 'id' && t.v === 'fun' && this.is('interface', 1)) { mods.add('fun'); this.i++; continue; }
      // Context receivers / parameters: "context(Logger)" (1.6.20) and
      // "context(logger: Logger)" (2.2) before a declaration.
      if (t.t === 'id' && !t.bq && t.v === 'context' && this.is('(', 1)) {
        const close = this.match[this.i + 1];
        const nx = close > 0 ? this.t[close + 1] : null;
        if (nx && ((nx.t === 'id' && (MODS.has(nx.v) || ['fun', 'val', 'var', 'class', 'object', 'interface', 'constructor', 'context'].includes(nx.v))) || (nx.t === 'op' && nx.v === '@'))) {
          mods.add('context');
          this.i = close + 1;
          continue;
        }
      }
      break;
    }
    return { mods, annos };
  }

  // ── types ──
  type() {
    const start = this.peek();
    const annos = [];
    while (this.is('@')) annos.push(this.annotation());
    if (this.is('suspend') && (this.is('(', 1) || this.peek(1).t === 'id')) this.i++;
    let ty;
    if (this.is('(')) {
      const close = this.match[this.i];
      if (close > 0 && this.t[close + 1] && this.t[close + 1].v === '->') {
        ty = this.fnTypeParams(start);
      } else {
        this.i++;
        ty = this.type();
        this.expect(')');
      }
    } else {
      ty = this.typeRef();
    }
    for (;;) {
      if (this.is('?') && !this.nlBreak()) { this.i++; ty.nullable = true; continue; }
      break;
    }
    // receiver function type  A.(B) -> C   /  A?.() -> C
    if ((this.is('.') || this.is('?.')) && this.is('(', 1)) {
      const close = this.match[this.i + 1];
      if (close > 0 && this.t[close + 1] && this.t[close + 1].v === '->') {
        this.i++;
        const fn = this.fnTypeParams(start);
        fn.recv = ty;
        ty = fn;
      }
    }
    if (annos.length) ty.annos = annos;
    return ty;
  }

  fnTypeParams(start) {
    this.expect('(');
    const params = [];
    while (!this.is(')')) {
      if (this.isId() && this.is(':', 1)) this.i += 2;
      params.push(this.type());
      if (!this.eat(',')) break;
    }
    this.expect(')');
    this.expect('->');
    const ret = this.type();
    const ty = this.node('Type', start, { name: 'Function', args: params.concat([ret]), dims: 0, fn: true, ret });
    return this.done(ty);
  }

  typeRef() {
    const t = this.peek();
    if (t.t !== 'id') this.fail('expected type');
    const ty = this.node('Type', t, { name: '', args: [], dims: 0 });
    const parts = [];
    for (;;) {
      parts.push(this.anyName());
      if (this.is('<') && !this.nlBreak()) ty.args = this.typeArgs();
      if (this.is('.') && this.peek(1).t === 'id' && !this.is('(', 2)) {
        // A.B is a nested type unless followed by ( which would be a call
        this.i++;
        continue;
      }
      break;
    }
    ty.name = parts.join('.');
    return this.done(ty);
  }

  typeArgs() {
    this.expect('<');
    const args = [];
    while (!this.is('>')) {
      while (this.is('@')) this.annotation();
      if (this.is('*')) {
        const t = this.next();
        args.push(this.done(this.node('Type', t, { name: '*', args: [], dims: 0, wildcard: '*' })));
      } else {
        let variance = null;
        if ((this.is('in') || this.is('out')) && this.peek(1).t === 'id') variance = this.next().v;
        const ty = this.type();
        if (variance) ty.variance = variance;
        args.push(ty);
      }
      if (!this.eat(',')) break;
    }
    this.expect('>');
    return args;
  }

  typeParams() {
    this.expect('<');
    const out = [];
    while (!this.is('>')) {
      this.modifiers();
      if (this.is('in') || this.is('out')) this.i++;
      const t = this.peek();
      const p = { name: this.ident(), bounds: [], line: t.line };
      if (this.eat(':')) p.bounds.push(this.type());
      out.push(p);
      if (!this.eat(',')) break;
    }
    this.expect('>');
    return out;
  }

  whereClause() {
    if (this.is('where')) {
      this.i++;
      do {
        this.ident();
        this.expect(':');
        this.type();
      } while (this.eat(','));
    }
  }

  // ── declarations ──
  declaration(m, ctx) {
    const t = this.peek();
    const startTok = m.annos.length ? m.annos[0] : t;
    if (this.is('class') || this.is('interface') || (this.is('object') && (this.peek(1).t === 'id' && !this.is(':', 1)) && !this.nlBreak(1))) {
      return this.classDecl(m, startTok);
    }
    if (this.is('object') && m.mods.has('companion')) return this.classDecl(m, startTok);
    if (this.is('fun') && !this.is('(', 1)) return this.funDecl(m, startTok);
    if ((this.is('val') || this.is('var'))) return this.propDecl(m, startTok, ctx);
    if (this.is('typealias')) {
      this.i++;
      this.ident();
      if (this.is('<')) this.typeParams();
      this.expect('=');
      this.type();
      return { k: 'TypeAlias', line: t.line, col: t.col };
    }
    return null;
  }

  classDecl(m, startTok) {
    const kw = this.next();
    let kind = kw.v === 'interface' ? 'interface' : kw.v === 'object' ? 'object' : 'class';
    if (kind === 'class' && m.mods.has('enum')) kind = 'enum';
    if (kind === 'class' && m.mods.has('annotation')) kind = 'annotation';
    let name = '';
    let nameTok = kw;
    if (this.isId() && !this.nlBreak()) { nameTok = this.peek(); name = this.ident(); } else if (kind === 'object' && m.mods.has('companion')) name = 'Companion';
    const c = this.node('Class', startTok, { kind, name, mods: m.mods, annos: m.annos, tparams: [], ext: null, impls: [], supers: [], members: [], params: [], enumConsts: [], permits: [], lang: 'kt' });
    if (m.mods.has('companion')) c.companion = true;
    c.nameLine = nameTok.line;
    if (this.is('<')) c.tparams = this.typeParams();
    // primary constructor
    const pm = this.modifiers();
    if (this.is('constructor')) { this.i++; c.ctorMods = pm.mods; }
    if (this.is('(') && !this.nlBreak()) {
      c.params = this.valueParams(true);
      c.hasPrimary = true;
    }
    if (this.is(':') ) {
      this.i++;
      do {
        while (this.is('@')) this.annotation();
        const st = this.peek();
        const ty = this.type();
        const sup = { type: ty, args: null, by: null, line: st.line };
        if (this.is('(') && !this.nlBreak()) sup.args = this.callArgs();
        if (this.is('by')) { this.i++; sup.by = this.expr(); }
        c.supers.push(sup);
      } while (this.eat(','));
      for (const s of c.supers) {
        if (s.args && !c.ext) c.ext = s.type; else c.impls.push(s.type);
      }
    }
    this.whereClause();
    if (this.is('{') ) this.classBody(c);
    return this.done(c);
  }

  classBody(c) {
    const open = this.expect('{');
    const close = this.match[this.i - 1];
    c.bodyLine = open.line;
    if (c.kind === 'enum') this.enumEntries(c);
    while (!this.is('}') && this.peek().t !== 'eof') {
      if (this.eat(';')) continue;
      const start = this.i;
      try {
        const mem = this.member(c);
        if (mem) c.members.push(mem);
      } catch (err) {
        this.err(err);
        this.i = start;
        if (!this.skipDecl()) break;
        if (close >= 0 && this.i > close) { this.i = close; break; }
      }
    }
    this.expect('}');
  }

  enumEntries(c) {
    while (!this.is(';') && !this.is('}')) {
      while (this.is('@')) this.annotation();
      const t = this.peek();
      const ec = this.node('EnumConst', t, { name: this.ident(), args: [], body: null, annos: [] });
      if (this.is('(')) ec.args = this.callArgs();
      if (this.is('{')) {
        const body = this.node('Class', this.peek(), { kind: 'class', name: '', anon: true, mods: new Set(), annos: [], tparams: [], ext: null, impls: [], supers: [], members: [], params: [], enumConsts: [], permits: [], lang: 'kt' });
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
    if (this.is('init') && this.is('{', 1)) {
      this.i++;
      return this.done(this.node('Init', t0, { static: false, body: this.block() }));
    }
    const m = this.modifiers();
    const startTok = m.annos.length ? m.annos[0] : this.peek();
    if (this.is('constructor')) {
      const kt = this.next();
      const meth = this.node('Method', startTok, { name: c.name, ctor: true, mods: m.mods, annos: m.annos, tparams: [], ret: null, params: [], throws: [], body: null });
      meth.nameLine = kt.line;
      meth.params = this.valueParams(false);
      if (this.eat(':')) {
        const dt = this.next();
        const args = this.callArgs();
        meth.deleg = this.done(this.node('Call', dt, { o: null, id: dt.v, args, ctorCall: true }));
      }
      if (this.is('{')) this.fnBody(meth);
      return this.done(meth);
    }
    const d = this.declaration(m, 'member');
    if (!d) this.fail('expected member');
    return d;
  }

  valueParams(isClass) {
    this.expect('(');
    const out = [];
    while (!this.is(')')) {
      const m = this.modifiers();
      const t = this.peek();
      let prop = null;
      if (isClass && (this.is('val') || this.is('var'))) prop = this.next().v;
      const nt = this.peek();
      const p = this.node('Param', m.annos.length ? m.annos[0] : t, { name: this.ident(), type: null, mods: m.mods, annos: m.annos, varargs: m.mods.has('vararg'), prop, def: null });
      p.nameLine = nt.line;
      p.nameCol = nt.col;
      if (this.eat(':')) p.type = this.type();
      if (this.eat('=')) p.def = this.expr();
      out.push(this.done(p));
      if (!this.eat(',')) break;
    }
    this.expect(')');
    return out;
  }

  // segments a.b.C<T>.name  -> { recv: Type|null, name, nameTok }
  receiverAndName() {
    const segs = [];
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && t.v === '(') {
        // function-type receiver: (A) -> B.name  (rare) — parse type
        const ty = this.type();
        segs.push({ type: ty, tok: t });
      } else {
        if (t.t !== 'id') this.fail('expected name');
        this.i++;
        const seg = { name: t.v, tok: t, args: [] };
        if (this.is('<') && !this.nlBreak()) seg.args = this.typeArgs();
        while (this.is('?')) { this.i++; seg.nullable = true; }
        segs.push(seg);
      }
      if (this.is('.') && (this.peek(1).t === 'id' || this.is('(', 1))) { this.i++; continue; }
      if (this.is('?.') && this.peek(1).t === 'id') { segs[segs.length - 1].nullable = true; this.i++; continue; }
      break;
    }
    const last = segs.pop();
    if (!last.name) this.fail('expected name');
    let recv = null;
    if (segs.length) {
      if (segs.length === 1 && segs[0].type) recv = segs[0].type;
      else {
        const first = segs[0];
        recv = { k: 'Type', name: segs.map((s) => s.name || 'Function').join('.'), args: segs[segs.length - 1].args || [], dims: 0, nullable: !!segs[segs.length - 1].nullable, line: first.tok.line, col: first.tok.col };
      }
    }
    return { recv, name: last.name, nameTok: last.tok };
  }

  funDecl(m, startTok) {
    this.expect('fun');
    const meth = this.node('Method', startTok, { name: '', ctor: false, mods: m.mods, annos: m.annos, tparams: [], ret: null, params: [], throws: [], body: null, lang: 'kt' });
    if (this.is('<')) meth.tparams = this.typeParams();
    const rn = this.receiverAndName();
    meth.name = rn.name;
    meth.recv = rn.recv;
    meth.nameLine = rn.nameTok.line;
    meth.nameCol = rn.nameTok.col;
    meth.params = this.valueParams(false);
    if (this.is(':')) { this.i++; meth.ret = this.type(); }
    this.whereClause();
    if (this.is('{') || this.is('=')) this.fnBody(meth);
    return this.done(meth);
  }

  fnBody(meth) {
    if (this.is('=')) {
      const t = this.next();
      const st = this.peek();
      try {
        const e = this.expr();
        const ret = this.done(this.node('Return', st, { e, implicit: true }));
        const b = this.node('Block', t, { stmts: [ret] });
        meth.body = this.done(b);
        meth.exprBody = true;
      } catch (err) {
        this.err(err);
        meth.bodyError = true;
        this.skipDecl();
      }
      return;
    }
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

  propDecl(m, startTok, ctx) {
    const kw = this.next();
    const f = this.node('Field', startTok, { mods: m.mods, annos: m.annos, type: null, vars: [], fin: kw.v === 'val', mutable: kw.v === 'var', lang: 'kt' });
    if (this.is('<')) this.typeParams();
    if (this.is('(')) {
      // destructuring
      this.i++;
      while (!this.is(')')) {
        const nt = this.peek();
        const v = this.node('Var', nt, { name: this.ident(), dims: 0, init: null });
        if (this.eat(':')) v.type = this.type();
        f.vars.push(this.done(v));
        if (!this.eat(',')) break;
      }
      this.expect(')');
      f.destructure = true;
    } else {
      const rn = this.receiverAndName();
      f.recv = rn.recv;
      const v = this.node('Var', rn.nameTok, { name: rn.name, dims: 0, init: null });
      f.vars.push(v);
    }
    if (this.is(':')) { this.i++; f.type = this.type(); }
    this.whereClause();
    if (this.is('=')) {
      this.i++;
      const init = this.expr();
      if (f.destructure) f.init = init; else f.vars[0].init = init;
    } else if (this.is('by')) {
      this.i++;
      f.delegate = this.expr();
    }
    for (const v of f.vars) { if (!v.e) this.done(v); if (f.type && !v.type) v.type = f.type; }
    if (ctx !== 'local') this.accessors(f);
    return this.done(f);
  }

  accessors(f) {
    for (let n = 0; n < 2; n++) {
      const save = this.i;
      this.semis();
      const m = this.modifiers();
      if ((this.is('get') || this.is('set')) && (this.is('(', 1) || this.nlBreak(1) || this.is('}', 1) || this.is(';', 1) || this.is('=', 1))) {
        const t = this.next();
        if (this.is('(')) {
          const meth = this.node('Method', t, { name: t.v === 'get' ? 'get' : 'set', ctor: false, mods: m.mods, annos: m.annos, tparams: [], ret: null, params: [], throws: [], body: null, accessor: true, lang: 'kt' });
          this.i++;
          if (!this.is(')')) {
            const pt = this.peek();
            const p = this.node('Param', pt, { name: this.ident(), type: null, mods: new Set(), annos: [] });
            if (this.eat(':')) p.type = this.type();
            meth.params.push(this.done(p));
          }
          this.expect(')');
          if (this.eat(':')) meth.ret = this.type();
          if (this.is('{') || this.is('=')) this.fnBody(meth);
          this.done(meth);
          if (t.v === 'get') f.getter = meth; else f.setter = meth;
        } else if (t.v === 'set') {
          f.setterMods = m.mods;
        }
        continue;
      }
      this.i = save;
      break;
    }
  }

  // ── statements ──
  block() {
    const t = this.expect('{');
    const b = this.node('Block', t, { stmts: [] });
    this.semis();
    while (!this.is('}')) {
      if (this.peek().t === 'eof') this.fail("expected '}'");
      b.stmts.push(this.statement());
      this.semis();
    }
    this.expect('}');
    return this.done(b);
  }

  statement() {
    const t = this.peek();
    if (t.t === 'op' && t.v === ';') { this.i++; return this.done(this.node('Empty', t)); }
    // label: name@ stmt
    if (t.t === 'id' && !HARD.has(t.v) && this.is('@', 1) && this.adj(0) && !this.peek(1).nl) {
      this.i += 2;
      const body = this.statement();
      return this.done(this.node('Labeled', t, { label: t.v, body }));
    }
    if (t.t === 'id') {
      switch (t.v) {
        case 'for': return this.forStatement();
        case 'while': {
          this.i++;
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          const body = this.is(';') ? this.done(this.node('Empty', this.next())) : this.controlBody();
          return this.done(this.node('While', t, { c, body }));
        }
        case 'do': {
          this.i++;
          const body = this.is('while') ? this.node('Empty', t) : this.controlBody();
          this.semis();
          this.expect('while');
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          return this.done(this.node('Do', t, { body, c }));
        }
        default: break;
      }
    }
    // declarations
    const save = this.i;
    if ((t.t === 'id' && (MODS.has(t.v) || ['val', 'var', 'fun', 'class', 'interface', 'object'].includes(t.v))) || (t.t === 'op' && t.v === '@')) {
      const m = this.modifiers();
      const startTok = m.annos.length ? m.annos[0] : this.peek();
      if (this.is('val') || this.is('var')) {
        const f = this.propDecl(m, startTok, 'local');
        const loc = this.node('Local', startTok, { type: f.type, vars: f.vars, mods: m.mods, annos: m.annos, fin: f.fin, mutable: f.mutable, delegate: f.delegate || null });
        if (f.destructure) { loc.destructure = true; loc.init = f.init; }
        return this.done(loc);
      }
      if (this.is('fun') && !this.is('(', 1)) {
        const fn = this.funDecl(m, startTok);
        return this.done(this.node('LocalFun', startTok, { fn }));
      }
      if (this.is('class') || this.is('interface') || (this.is('object') && this.peek(1).t === 'id' && !this.is(':', 1))) {
        const cls = this.classDecl(m, startTok);
        return this.done(this.node('LocalClass', startTok, { cls }));
      }
      this.i = save;
      if (t.t === 'op' && t.v === '@') {
        // annotated expression
        while (this.is('@')) this.annotation();
        return this.statement();
      }
    }
    const e = this.expr();
    const op = this.peek();
    if (op.t === 'op' && ASSIGN.has(op.v) && !this.nlBreak()) {
      this.i++;
      const v = this.expr();
      const a = this.done(this.node('Assign', t, { op: op.v, t: e, v }));
      return this.done(this.node('ExprStmt', t, { e: a }));
    }
    return exprToStmt(e);
  }

  controlBody() {
    if (this.is('{')) return this.block();
    return this.statement();
  }

  forStatement() {
    const t = this.next();
    this.expect('(');
    while (this.is('@')) this.annotation();
    const vars = [];
    if (this.is('(')) {
      this.i++;
      while (!this.is(')')) {
        const nt = this.peek();
        const v = this.node('Var', nt, { name: this.ident(), dims: 0, init: null });
        if (this.eat(':')) v.type = this.type();
        vars.push(this.done(v));
        if (!this.eat(',')) break;
      }
      this.expect(')');
    } else {
      const nt = this.peek();
      const v = this.node('Var', nt, { name: this.ident(), dims: 0, init: null });
      if (this.eat(':')) v.type = this.type();
      vars.push(this.done(v));
    }
    this.expect('in');
    const iter = this.expr();
    this.expect(')');
    const body = this.is(';') ? this.done(this.node('Empty', this.next())) : this.controlBody();
    return this.done(this.node('ForEach', t, { vars, type: vars[0] && vars[0].type || null, iter, body, destructure: vars.length > 1 }));
  }

  // ── expressions ──
  expr() {
    return this.binary(1);
  }

  binOp() {
    const t = this.peek();
    const brk = this.nlBreak();
    if (t.t === 'op') {
      if (t.v === '&&' || t.v === '||' || t.v === '?:') return { op: t.v, n: 1 };
      if (brk) return null;
      if (t.v === '>') {
        if (this.is('=', 1) && this.adj(0)) return { op: '>=', n: 2 };
        return { op: '>', n: 1 };
      }
      if (t.v === '!' && this.adj(0) && (this.is('is', 1) || this.is('in', 1))) return { op: '!' + this.peek(1).v, n: 2 };
      if (PREC[t.v] && t.v !== 'infix') return { op: t.v, n: 1 };
      return null;
    }
    if (t.t === 'id' && !brk) {
      if (t.bq) return null;
      if (t.v === 'in' || t.v === 'is') return { op: t.v, n: 1 };
      if (NO_INFIX.has(t.v)) return null;
      // infix call: next token must start an operand on the same line
      const nx = this.peek(1);
      if (nx.nl && !this.ins[this.i + 1]) return null;
      if (nx.t === 'op' && !['(', '{', '-', '!', '+', '"', '::', '@', '['].includes(nx.v)) return null;
      if (nx.t === 'eof') return null;
      return { op: 'infix', n: 1, id: t.v };
    }
    return null;
  }

  binary(minPrec) {
    const t = this.peek();
    let left = this.unary();
    for (;;) {
      const op = this.binOp();
      if (!op) break;
      const prec = PREC[op.op];
      if (prec < minPrec) break;
      const opTok = this.peek();
      this.i += op.n;
      if (op.op === 'is' || op.op === '!is') {
        const ty = this.type();
        left = this.done(this.node('InstOf', t, { e: left, type: ty, bind: null, neg: op.op === '!is' }));
        continue;
      }
      const right = this.binary(prec + 1);
      if (op.op === 'infix') {
        left = this.done(this.node('Call', t, { o: left, id: op.id, args: [right], infix: true, idLine: opTok.line, idCol: opTok.col }));
        continue;
      }
      left = this.done(this.node('Bin', t, { op: op.op, l: left, r: right, opLine: opTok.line, opCol: opTok.col }));
    }
    return left;
  }

  unary() {
    const t = this.peek();
    if (t.t === 'op') {
      if (t.v === '-' || t.v === '+' || t.v === '!' || t.v === '++' || t.v === '--') {
        this.i++;
        const e = this.unary();
        if (t.v === '-' && e.k === 'Lit' && (e.t === 'int' || e.t === 'long' || e.t === 'double' || e.t === 'float') && e.s === t.end) {
          e.v = -e.v; e.neg = true; e.s = t.pos; e.line = t.line; e.col = t.col; e.raw = '-' + e.raw;
          return e;
        }
        return this.done(this.node('Un', t, { op: t.v, e, post: false }));
      }
      if (t.v === '!!') {
        // !!x  is a double negation in prefix position
        this.i++;
        const e = this.unary();
        const inner = this.done(this.node('Un', t, { op: '!', e, post: false }));
        return this.done(this.node('Un', t, { op: '!', e: inner, post: false }));
      }
      if (t.v === '@') {
        this.annotation();
        return this.unary();
      }
    }
    if (t.t === 'id' && this.is('@', 1) && this.adj(0) && !this.peek(1).nl && !t.bq && !HARD.has(t.v)) {
      // labeled expression: lit@{ ... }
      this.i += 2;
      const e = this.unary();
      e.label = t.v;
      return e;
    }
    let e = this.postfix(this.primary());
    // as / as?
    while (this.is('as') && !this.nlBreak()) {
      const at = this.next();
      let safe = false;
      if (this.is('?') && this.adj(-1)) { this.i++; safe = true; }
      const ty = this.type();
      e = this.done(Object.assign(this.node('Cast', at, { type: ty, e, safe }), { line: e.line, col: e.col, s: e.s }));
    }
    return e;
  }

  literal(t) {
    if (t.t === 'num') {
      const raw = t.v;
      const clean = raw.replace(/_/g, '').replace(/[uU][lL]?$/, '');
      let kind = 'int';
      let v;
      if (/^0[xX]/.test(clean)) { kind = /[lL]$/.test(clean) ? 'long' : 'int'; const h = clean.replace(/[lL]$/, '').slice(2); v = h.length <= 13 ? parseInt(h, 16) : Number(BigInt('0x' + h)); }
      else if (/^0[bB]/.test(clean)) { kind = /[lL]$/.test(clean) ? 'long' : 'int'; v = parseInt(clean.replace(/[lL]$/, '').slice(2), 2); }
      else if (/[.eE]/.test(clean) || /[fF]$/.test(clean)) { kind = /[fF]$/.test(clean) ? 'float' : 'double'; v = parseFloat(clean.replace(/[fFdD]$/, '')); }
      else { kind = /[lL]$/.test(clean) ? 'long' : 'int'; v = Number(clean.replace(/[lL]$/, '')); }
      return this.node('Lit', t, { t: kind, v, raw });
    }
    if (t.t === 'char') return this.node('Lit', t, { t: 'char', v: t.v, raw: this.src.slice(t.pos, t.end) });
    if (t.t === 'str') {
      if (t.parts) {
        const parts = [];
        for (const p of t.parts) {
          if (typeof p === 'string') parts.push(p);
          else if (p.name) parts.push({ k: 'Name', id: p.name, line: p.line, col: p.col, s: 0, en: 0 });
          else if (p.toks) {
            const sub = new KParser(this.src, p.toks.concat([{ t: 'eof', v: '<eof>', line: t.line, col: t.col, pos: t.end, end: t.end, nl: true }]));
            try { parts.push(sub.expr()); } catch (err) { if (!(err instanceof ParseError)) throw err; }
          }
        }
        return this.node('Tmpl', t, { parts, v: t.v, raw: this.src.slice(t.pos, t.end), tb: !!t.tb });
      }
      return this.node('Lit', t, { t: 'str', v: t.v, raw: this.src.slice(t.pos, t.end), tb: !!t.tb });
    }
    return null;
  }

  primary() {
    const t = this.peek();
    if (t.t === 'num' || t.t === 'str' || t.t === 'char') { this.i++; return this.done(this.literal(t)); }
    if (t.t === 'op') {
      switch (t.v) {
        case '(': {
          this.i++;
          const e = this.expr();
          this.expect(')');
          return this.done(this.node('Paren', t, { e }));
        }
        case '{': return this.lambdaLiteral();
        case '::': {
          this.i++;
          const nt = this.next();
          if (nt.v === 'class') return this.done(this.node('ClassLit', t, { type: null }));
          return this.done(this.node('MRef', t, { o: null, id: nt.v }));
        }
        case '[': {
          this.i++;
          const n = this.node('ArrInit', t, { elems: [] });
          while (!this.is(']')) { n.elems.push(this.expr()); if (!this.eat(',')) break; }
          this.expect(']');
          return this.done(n);
        }
        default: this.fail(`unexpected '${t.v}'`);
      }
    }
    if (t.t !== 'id') this.fail('unexpected end');
    if (!t.bq) {
      switch (t.v) {
        case 'true':
        case 'false': this.i++; return this.done(this.node('Lit', t, { t: 'bool', v: t.v === 'true', raw: t.v }));
        case 'null': this.i++; return this.done(this.node('Lit', t, { t: 'null', v: null, raw: 'null' }));
        case 'this': {
          this.i++;
          const n = this.node('This', t, { q: null });
          if (this.is('@') && this.adj(-1)) { this.i++; n.label = this.anyName(); }
          return this.done(n);
        }
        case 'super': {
          this.i++;
          const n = this.node('Super', t, { q: null });
          if (this.is('<') && this.adj(-1)) this.typeArgs();
          if (this.is('@') && this.adj(-1)) { this.i++; n.label = this.anyName(); }
          return this.done(n);
        }
        case 'if': return this.ifExpr();
        case 'when': return this.whenExpr();
        case 'try': return this.tryExpr();
        case 'return': {
          this.i++;
          const n = this.node('Return', t, { e: null, label: null });
          if (this.is('@') && this.adj(-1)) { this.i++; n.label = this.anyName(); }
          if (this.startsExpr() && !this.nlBreak()) n.e = this.expr();
          return this.done(n);
        }
        case 'throw': this.i++; return this.done(this.node('Throw', t, { e: this.expr() }));
        case 'break':
        case 'continue': {
          this.i++;
          const n = this.node(t.v === 'break' ? 'Break' : 'Continue', t, { label: null });
          if (this.is('@') && this.adj(-1)) { this.i++; n.label = this.anyName(); }
          return this.done(n);
        }
        case 'fun': {
          // anonymous function
          this.i++;
          if (this.peek().t === 'id' && this.is('.', 1)) { this.type(); this.expect('.'); }
          const lam = this.node('Lambda', t, { params: this.valueParams(false), body: null, anonFun: true });
          if (this.eat(':')) lam.ret = this.type();
          if (this.is('{')) lam.body = this.block();
          else { this.expect('='); lam.body = this.expr(); }
          return this.done(lam);
        }
        case 'object': {
          this.i++;
          const body = this.node('Class', t, { kind: 'class', name: '', anon: true, mods: new Set(), annos: [], tparams: [], ext: null, impls: [], supers: [], members: [], params: [], enumConsts: [], permits: [], lang: 'kt' });
          if (this.eat(':')) {
            do {
              const ty = this.type();
              const sup = { type: ty, args: null };
              if (this.is('(') && !this.nlBreak()) sup.args = this.callArgs();
              body.supers.push(sup);
            } while (this.eat(','));
            for (const s of body.supers) { if (s.args && !body.ext) body.ext = s.type; else body.impls.push(s.type); }
          }
          if (this.is('{')) this.classBody(body);
          this.done(body);
          const ty = body.ext || body.impls[0] || { k: 'Type', name: 'Any', args: [], dims: 0, line: t.line, col: t.col };
          return this.done(this.node('New', t, { type: ty, args: [], body, dims: [], init: null, objExpr: true }));
        }
        default: break;
      }
    }
    if (!this.isId()) this.fail(`unexpected '${t.v}'`);
    this.i++;
    return this.done(this.node('Name', t, { id: t.v }));
  }

  startsExpr() {
    const t = this.peek();
    if (t.t === 'eof') return false;
    if (t.t === 'op') return ['(', '{', '-', '+', '!', '::', '[', '@', '++', '--'].includes(t.v);
    if (t.t === 'id') return !['else', 'catch', 'finally', 'in', 'is', 'as', 'by'].includes(t.v) || t.bq;
    return true;
  }

  ifExpr() {
    const t = this.expect('if');
    this.expect('(');
    const c = this.expr();
    this.expect(')');
    const n = this.node('IfX', t, { c, t: null, f: null });
    if (this.is('else')) n.t = this.node('Empty', this.peek());
    else if (this.is(';')) { n.t = this.done(this.node('Empty', this.next())); }
    else n.t = this.controlBody();
    // else may follow a newline or ';'
    const save = this.i;
    this.semis();
    if (this.is('else')) {
      n.elseLine = this.peek().line;
      this.i++;
      n.f = this.is(';') ? this.done(this.node('Empty', this.next())) : this.controlBody();
    } else this.i = save;
    return this.done(n);
  }

  whenExpr() {
    const t = this.expect('when');
    const sw = this.node('Switch', t, { sel: null, selVar: null, cases: [], expr: true, arrow: true, kt: true });
    if (this.is('(') && !this.nlBreak()) {
      this.i++;
      while (this.is('@')) this.annotation();
      if (this.is('val')) {
        this.i++;
        const nt = this.peek();
        sw.selVar = this.done(this.node('Var', nt, { name: this.ident(), dims: 0, init: null }));
        if (this.eat(':')) sw.selVar.type = this.type();
        this.expect('=');
      }
      sw.sel = this.expr();
      if (sw.selVar) sw.selVar.init = sw.sel;
      this.expect(')');
    }
    this.expect('{');
    this.semis();
    while (!this.is('}')) {
      if (this.peek().t === 'eof') this.fail('eof in when');
      const ct = this.peek();
      const c = this.node('Case', ct, { labels: [], dflt: false, guard: null, body: [], arrow: true });
      if (this.is('else') && (this.is('->', 1) || this.is('if', 1))) {
        this.i++;
        c.dflt = true;
      } else {
        for (;;) {
          c.labels.push(this.whenCondition());
          if (!this.eat(',')) break;
          if (this.is('->')) break;
        }
      }
      // Guard condition (Kotlin 2.1): "is Ok if x > 0 ->", "else if ok ->".
      if (this.is('if')) { this.i++; c.guard = this.expr(); }
      this.expect('->');
      c.body = [this.controlBody()];
      sw.cases.push(this.done(c));
      this.semis();
    }
    this.expect('}');
    return this.done(sw);
  }

  whenCondition() {
    const t = this.peek();
    if (this.is('is')) { this.i++; return this.done(this.node('IsPat', t, { type: this.type(), neg: false })); }
    if (this.is('!') && (this.is('is', 1) || this.is('in', 1)) && this.adj(0)) {
      const w = this.peek(1).v;
      this.i += 2;
      if (w === 'is') return this.done(this.node('IsPat', t, { type: this.type(), neg: true }));
      return this.done(this.node('InPat', t, { e: this.expr(), neg: true }));
    }
    if (this.is('in')) { this.i++; return this.done(this.node('InPat', t, { e: this.expr(), neg: false })); }
    return this.expr();
  }

  tryExpr() {
    const t = this.expect('try');
    const n = this.node('Try', t, { res: [], body: this.block(), catches: [], fin: null });
    for (;;) {
      const save = this.i;
      this.semis();
      if (this.is('catch')) {
        const ct = this.next();
        this.expect('(');
        while (this.is('@')) this.annotation();
        const nt = this.peek();
        const name = this.ident();
        this.expect(':');
        const ty = this.type();
        this.eat(',');
        this.expect(')');
        n.catches.push(this.done(this.node('Catch', ct, { types: [ty], name, nameLine: nt.line, mods: new Set(), body: this.block() })));
        continue;
      }
      if (this.is('finally')) { this.i++; n.fin = this.block(); break; }
      this.i = save;
      break;
    }
    this.done(n);
    return this.done(this.node('TryX', t, { t: n }));
  }

  lambdaLiteral() {
    const t = this.expect('{');
    const lam = this.node('Lambda', t, { params: [], body: null, kt: true });
    const save = this.i;
    let ok = false;
    try {
      if (this.is('->')) { this.i++; ok = true; } else {
        const params = [];
        for (;;) {
          const pt = this.peek();
          if (this.is('(')) {
            this.i++;
            const names = [];
            while (!this.is(')')) { names.push(this.ident()); if (this.eat(':')) this.type(); if (!this.eat(',')) break; }
            this.expect(')');
            const p = this.node('Param', pt, { name: '(' + names.join(',') + ')', names, type: null, mods: new Set(), annos: [] });
            if (this.eat(':')) p.type = this.type();
            params.push(this.done(p));
          } else {
            const p = this.node('Param', pt, { name: this.ident(), type: null, mods: new Set(), annos: [] });
            if (this.eat(':')) p.type = this.type();
            params.push(this.done(p));
          }
          if (this.eat(',')) continue;
          break;
        }
        if (this.is('->')) { this.i++; ok = true; lam.params = params; }
      }
    } catch (err) {
      if (!(err instanceof ParseError)) throw err;
    }
    if (!ok) { this.i = save; lam.implicitIt = true; }
    const b = this.node('Block', t, { stmts: [] });
    this.semis();
    while (!this.is('}')) {
      if (this.peek().t === 'eof') this.fail("expected '}'");
      b.stmts.push(this.statement());
      this.semis();
    }
    this.expect('}');
    lam.body = this.done(b);
    return this.done(lam);
  }

  callArgs() {
    this.expect('(');
    const out = [];
    while (!this.is(')')) {
      while (this.is('@')) this.annotation();
      let name = null;
      if (this.isId() && this.is('=', 1) && !this.is('=', 2)) { name = this.next().v; this.i++; }
      const spread = !!this.eat('*');
      const e = this.expr();
      if (name) e.argName = name;
      if (spread) e.spread = true;
      out.push(e);
      if (!this.eat(',')) break;
    }
    this.expect(')');
    return out;
  }

  tryTypeArgsCall() {
    // after a name: <T>( / <T>{ / <T>:: / <T>.
    const save = this.i;
    try {
      this.typeArgs();
      if ((this.is('(') || this.is('{') || this.is('::') || this.is('.')) && !this.nlBreak()) return true;
    } catch (err) {
      if (!(err instanceof ParseError)) throw err;
    }
    this.i = save;
    return false;
  }

  postfix(e) {
    for (;;) {
      const t = this.peek();
      const brk = this.nlBreak();
      if (t.t !== 'op') break;
      if (t.v === '.' || t.v === '?.') {
        const nt = this.peek(1);
        if (nt.t !== 'id') break;
        this.i += 2;
        e = this.done({ k: 'Sel', line: e.line, col: e.col, s: e.s, o: e, id: nt.v, safe: t.v === '?.', idLine: nt.line, idCol: nt.col });
        continue;
      }
      if (brk) break;
      if (t.v === '<' && (e.k === 'Name' || e.k === 'Sel') && this.adj(-1)) {
        if (this.tryTypeArgsCall()) { e.targs = true; continue; }
        break;
      }
      if (t.v === '(') {
        const args = this.callArgs();
        e = this.done(this.toCall(e, args));
        continue;
      }
      if (t.v === '{' || (t.t === 'op' && t.v === '{')) {
        if (!(e.k === 'Name' || e.k === 'Sel' || e.k === 'Call' || e.k === 'This' || e.k === 'Super')) break;
        if (e.k === 'Name' && HARD.has(e.id)) break;
        const lam = this.lambdaLiteral();
        lam.trailing = true;
        if (e.k === 'Call' && !e.lambdaDone) { e.args.push(lam); e.trailing = true; e.lambdaDone = true; this.done(e); }
        else { e = this.done(this.toCall(e, [lam])); e.trailing = true; e.lambdaDone = true; }
        continue;
      }
      if (t.v === '[') {
        this.i++;
        const idx = [];
        while (!this.is(']')) { idx.push(this.expr()); if (!this.eat(',')) break; }
        this.expect(']');
        e = this.done({ k: 'Idx', line: e.line, col: e.col, s: e.s, o: e, i: idx[0], idx });
        continue;
      }
      if (t.v === '!!') {
        this.i++;
        e = this.done({ k: 'Un', line: e.line, col: e.col, s: e.s, op: '!!', e, post: true, opLine: t.line, opCol: t.col });
        continue;
      }
      if (t.v === '++' || t.v === '--') {
        this.i++;
        e = this.done({ k: 'Un', line: e.line, col: e.col, s: e.s, op: t.v, e, post: true });
        continue;
      }
      if (t.v === '::') {
        this.i++;
        const nt = this.next();
        if (nt.v === 'class') { e = this.done({ k: 'ClassLit', line: e.line, col: e.col, s: e.s, type: exprType(e), o: e }); continue; }
        e = this.done({ k: 'MRef', line: e.line, col: e.col, s: e.s, o: e, id: nt.v });
        continue;
      }
      break;
    }
    return e;
  }

  toCall(e, args) {
    if (e.k === 'Name') return { k: 'Call', line: e.line, col: e.col, s: e.s, o: null, id: e.id, args, targs: e.targs, idLine: e.line, idCol: e.col };
    if (e.k === 'Sel') return { k: 'Call', line: e.line, col: e.col, s: e.s, o: e.o, id: e.id, args, safe: e.safe, targs: e.targs, idLine: e.idLine, idCol: e.idCol };
    return { k: 'Call', line: e.line, col: e.col, s: e.s, o: null, id: null, callee: e, args };
  }
}

function exprType(e) {
  const parts = [];
  let x = e;
  while (x && x.k === 'Sel') { parts.unshift(x.id); x = x.o; }
  if (x && x.k === 'Name') parts.unshift(x.id);
  return { k: 'Type', name: parts.join('.') || '?', args: [], dims: 0, line: e.line, col: e.col };
}

function exprToStmt(e) {
  if (!e) return e;
  switch (e.k) {
    case 'IfX': return Object.assign({}, e, { k: 'If' });
    case 'TryX': return e.t;
    case 'Switch': return Object.assign({}, e, { expr: false });
    case 'Return':
    case 'Throw':
    case 'Break':
    case 'Continue':
      return e;
    default:
      return { k: 'ExprStmt', line: e.line, col: e.col, s: e.s, en: e.en, el: e.el, e };
  }
}

function parseKotlin(text) {
  const lx = lex(text, 'kt');
  const p = new KParser(String(text || ''), lx.toks);
  let unit;
  try {
    unit = p.parseUnit();
  } catch (err) {
    unit = { k: 'Unit', lang: 'kt', line: 1, col: 1, pkg: null, imports: [], types: [], funcs: [], props: [], stmts: [], annos: [], fatal: String(err && err.message) };
    p.errors++;
  }
  unit.comments = lx.comments;
  unit.errors = p.errors;
  unit.errorList = p.errorList;
  unit.lineCount = lx.lines;
  return unit;
}

module.exports = { parseKotlin };
