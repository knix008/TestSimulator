'use strict';

// Tolerant recursive-descent parser for C# 12 producing a plain-object AST.
// Every node has { k, line, col, endLine, endCol, pos, end }. A member (or a
// top-level statement) that fails to parse is replaced by { k: 'ErrorMember' }
// and the enclosing type is flagged `broken`; parsing never throws.

const { lex, PREDEFINED } = require('./lexer');

class ParseError extends Error {}

const TYPE_KW = new Set(['class', 'struct', 'interface', 'enum']);
const MODIFIERS = new Set(['public', 'private', 'protected', 'internal', 'static', 'readonly', 'volatile', 'virtual', 'override',
  'abstract', 'sealed', 'extern', 'unsafe', 'new', 'fixed']);
const CTX_MODIFIERS = new Set(['async', 'partial', 'required', 'file', 'scoped']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '??=']);
const BIN_PREC = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6,
  '<': 7, '>': 7, '<=': 7, '>=': 7, 'is': 7, 'as': 7,
  '<<': 8, '>>': 8, '>>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
};
// tokens after a '>' that make '<...>' a type-argument list (C# spec 6.2.5 plus a few)
const AFTER_TYPEARGS = new Set(['(', ')', ']', '}', ':', ';', ',', '.', '?', '==', '!=', '|', '^', '&&', '||', '&', '[', '=>', '?.', '??', 'is', 'as', '']);
const OVERLOADABLE = new Set(['+', '-', '!', '~', '++', '--', '*', '/', '%', '&', '|', '^', '<<', '==', '!=', '<', '<=', 'true', 'false', '>']);

class Parser {
  constructor(tokens, src, base) {
    this.toks = tokens;
    this.src = src;
    this.i = 0;
    this.n = tokens.length;
    this.errors = [];
    this.base = base || null;
    this.match = buildMatch(tokens);
    this.depth = 0;
    this.noLambdaDepth = -1;
  }

  get cur() { return this.toks[this.i]; }
  peek(k = 1) { return this.toks[Math.min(this.i + k, this.n - 1)]; }
  is(v, tok = this.cur) { return tok.v === v && (tok.t === 'op' || tok.t === 'kw' || tok.t === 'id'); }
  isOp(v, tok = this.cur) { return tok.t === 'op' && tok.v === v; }
  isKw(v, tok = this.cur) { return tok.t === 'kw' && tok.v === v; }
  isId(tok = this.cur) { return tok.t === 'id'; }
  isCtx(v, tok = this.cur) { return tok.t === 'id' && tok.v === v; }
  next() { const t = this.toks[this.i]; if (this.i < this.n - 1) this.i++; return t; }
  eat(v) { if (this.is(v)) { this.next(); return true; } return false; }
  expect(v) {
    if (this.is(v)) return this.next();
    this.fail(`expected '${v}' but found '${this.cur.v}'`);
    return null;
  }
  fail(msg) { throw new ParseError(`${msg} at ${this.cur.line}:${this.cur.col}`); }
  ident() {
    if (this.cur.t === 'id') return this.next();
    this.fail(`expected identifier but found '${this.cur.v}'`);
    return null;
  }
  adjacent(a, b) { return a.end === b.pos; }

  node(k, start, props) {
    const last = this.toks[Math.max(this.i - 1, 0)];
    const nd = { k, line: start.line, col: start.col, pos: start.pos, endLine: last.line, endCol: last.col + (last.end - last.pos), end: last.end };
    if (props) Object.assign(nd, props);
    return nd;
  }

  speculate(fn) {
    const save = this.i;
    try {
      return fn();
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      this.i = save;
      return null;
    }
  }

  // ───────────────────────────────────────────── compilation unit
  parseCompilationUnit() {
    const start = this.cur;
    const usings = [];
    const members = [];
    const attrs = [];
    this.parseNamespaceBody(usings, members, attrs, true);
    return this.node('CompilationUnit', start, { usings, members, attrs });
  }

  parseNamespaceBody(usings, members, attrs, top) {
    let guard = -1;
    while (this.cur.t !== 'eof') {
      if (this.i === guard) this.next();
      guard = this.i;
      if (!top && this.isOp('}')) return;
      const startIdx = this.i;
      try {
        if (this.isKw('extern') && this.isCtx('alias', this.peek())) { while (!this.isOp(';') && this.cur.t !== 'eof') this.next(); this.eat(';'); continue; }
        const u = this.tryUsingDirective();
        if (u) { usings.push(u); continue; }
        if (this.isOp('[') && (this.isCtx('assembly', this.peek()) || this.isCtx('module', this.peek())) && this.isOp(':', this.peek(2))) {
          attrs.push(...this.parseAttrs());
          continue;
        }
        if (this.isKw('namespace')) { members.push(this.parseNamespace(members)); continue; }
        // type declaration or global statement
        const save = this.i;
        const a = this.parseAttrs();
        const mods = this.parseMods();
        if (this.atTypeDecl()) {
          members.push(this.parseTypeDecl(a, mods, null));
          continue;
        }
        this.i = save;
        if (top) {
          const st = this.parseStatement();
          members.push(this.node('GlobalStatement', st, { stmt: st }));
        } else {
          this.fail('unexpected token in namespace');
        }
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        this.errors.push(e.message);
        const tok = this.toks[startIdx];
        this.i = this.skipMember(startIdx);
        members.push(this.node('ErrorMember', tok, { message: e.message }));
      }
    }
  }

  tryUsingDirective() {
    let j = 0;
    if (this.isCtx('global') && this.isKw('using', this.peek())) j = 1;
    if (!this.isKw('using', this.peek(j))) return null;
    const start = this.cur;
    const after = this.peek(j + 1);
    if (after.v === '(' || (after.t === 'id' && after.v === 'var') || (after.t === 'id' && after.v === 'await')) return null;
    const save = this.i;
    return this.speculate(() => {
      this.i += j + 1;
      let isStatic = false; let alias = null;
      if (this.isKw('static')) { this.next(); isStatic = true; }
      if (this.isId() && this.isOp('=', this.peek())) { alias = this.next().v; this.next(); }
      const t = alias ? this.parseType({}) : this.parseQualifiedTypeName();
      if (!this.isOp(';')) { this.i = save; throw new ParseError('not a directive'); }
      this.next();
      return this.node('UsingDirective', start, { name: typeQual(t), type: t, alias, isStatic, isGlobal: j === 1 });
    });
  }

  parseQualifiedTypeName() { return this.parseType({ noSuffix: true }); }

  parseNamespace() {
    const start = this.expect('namespace');
    const name = typeQual(this.parseQualifiedTypeName());
    const usings = []; const members = []; const attrs = [];
    if (this.eat(';')) {
      this.parseNamespaceBody(usings, members, attrs, false);
      return this.node('Namespace', start, { name, usings, members, fileScoped: true });
    }
    this.expect('{');
    this.parseNamespaceBody(usings, members, attrs, false);
    this.expect('}');
    this.eat(';');
    return this.node('Namespace', start, { name, usings, members, fileScoped: false });
  }

  atTypeDecl() {
    const t = this.cur;
    if (t.t === 'kw' && TYPE_KW.has(t.v)) return true;
    if (this.isCtx('record') && (this.isId(this.peek()) || this.isKw('class', this.peek()) || this.isKw('struct', this.peek()))) return true;
    if (this.isKw('delegate') && !this.isOp('(', this.peek()) && !this.isOp('{', this.peek())) return true;
    return false;
  }

  // skip a broken member / statement starting at token index j
  skipMember(j) {
    const toks = this.toks;
    let k = j;
    while (k < this.n - 1) {
      const t = toks[k];
      if (t.t === 'op') {
        if (t.v === '}') return k === j ? k + 1 : k;
        if (t.v === ';') return k + 1;
        if (t.v === '{' || t.v === '(' || t.v === '[') {
          const m = this.match[k];
          if (m < 0) return this.n - 1;
          k = m + 1;
          if (t.v === '{') {
            const nx = toks[k];
            if (nx && nx.t === 'op' && (nx.v === '=' || nx.v === ';' || nx.v === ',' || nx.v === '.' || nx.v === ')')) continue;
            return k;
          }
          continue;
        }
      }
      k++;
    }
    return this.n - 1;
  }

  // ───────────────────────────────────────────── attributes / modifiers
  parseAttrs() {
    const out = [];
    while (this.isOp('[')) {
      const open = this.next();
      let target = null;
      if ((this.isId() || this.cur.t === 'kw') && this.isOp(':', this.peek()) && !this.isOp('::', this.peek())) { target = this.next().v; this.next(); }
      while (!this.isOp(']') && this.cur.t !== 'eof') {
        const s = this.cur;
        const t = this.parseType({ noSuffix: true });
        let args = [];
        if (this.isOp('(')) args = this.parseArgList('(', ')', true);
        const name = t.name.replace(/Attribute$/, '') || t.name;
        out.push(this.node('Attribute', s, { name, fullName: t.name, qual: typeQual(t), args, target }));
        if (!this.eat(',')) break;
      }
      this.expect(']');
      void open;
    }
    return out;
  }

  parseMods() {
    const mods = new Set();
    for (;;) {
      const t = this.cur;
      if (t.t === 'kw' && MODIFIERS.has(t.v)) {
        // 'new' as a modifier only before another member token
        if (t.v === 'new' && (this.isOp('(', this.peek()) || this.isOp('[', this.peek()) || this.isOp('{', this.peek()))) break;
        if (t.v === 'fixed' && this.isOp('(', this.peek())) break;
        mods.add(t.v); this.next(); continue;
      }
      if (t.t === 'id' && CTX_MODIFIERS.has(t.v)) {
        const nx = this.peek();
        if (nx.t === 'id' || nx.t === 'kw') {
          // 'async' could start a lambda: async x => ..., async (...) is handled by '(' check
          if (t.v === 'async' && this.isOp('=>', this.peek(2))) break;
          mods.add(t.v); this.next(); continue;
        }
        if (t.v === 'async' && nx.t === 'op' && nx.v === '(' ) break;
      }
      if (t.t === 'kw' && t.v === 'ref' && (this.isKw('struct', this.peek()) || (this.isKw('partial', this.peek())))) { mods.add('ref'); this.next(); continue; }
      break;
    }
    return mods;
  }

  // ───────────────────────────────────────────── types
  // Parse a type. opts: { noSuffix, expr (is/as context), noArray, decl }
  parseType(opts = {}) {
    const start = this.cur;
    let t;
    if (this.isOp('(')) {
      // tuple type
      this.next();
      const elems = [];
      do {
        const et = this.parseType({ decl: true });
        let name = null;
        if (this.isId() && !this.isOp('=>', this.peek())) name = this.next().v;
        elems.push({ k: 'TupleElem', type: et, name, line: et.line, col: et.col });
      } while (this.eat(','));
      this.expect(')');
      if (elems.length < 2) this.fail('tuple type needs two elements');
      t = this.node('Type', start, { name: 'ValueTuple', qual: 'System.ValueTuple', args: elems.map((e) => e.type), tuple: elems, parts: [], nullable: false, ranks: 0, ptr: 0, predefined: false });
    } else if (this.cur.t === 'kw' && PREDEFINED.has(this.cur.v)) {
      const v = this.next().v;
      t = this.node('Type', start, { name: v, qual: v, args: [], parts: [{ name: v, args: [] }], nullable: false, ranks: 0, ptr: 0, predefined: true });
    } else if (this.isId()) {
      const parts = [];
      let aliasQ = null;
      if (this.isOp('::', this.peek())) { aliasQ = this.next().v; this.next(); }
      for (;;) {
        const id = this.ident();
        let args = [];
        if (this.isOp('<')) {
          const ta = this.parseTypeArgs(true);
          if (!ta) this.fail('bad type args');
          args = ta;
        }
        parts.push({ name: id.v, args });
        if (this.isOp('.') && this.isId(this.peek())) { this.next(); continue; }
        break;
      }
      const last = parts[parts.length - 1];
      const qual = parts.map((p) => p.name).join('.');
      t = this.node('Type', start, { name: last.name, qual, args: last.args, parts, nullable: false, ranks: 0, ptr: 0, predefined: PREDEFINED.has(last.name) && parts.length === 1, alias: aliasQ });
    } else {
      this.fail(`expected type but found '${this.cur.v}'`);
    }
    if (opts.noSuffix) return t;
    for (;;) {
      if (this.isOp('?') && this.nullableQuestionOk(opts)) { this.next(); t.nullable = true; t.endLine = this.toks[this.i - 1].line; continue; }
      if (this.isOp('*') && !opts.expr && !opts.noPtr) {
        const nx = this.peek();
        if (nx.t === 'id' || (nx.t === 'op' && (nx.v === '*' || nx.v === ')' || nx.v === ',' || nx.v === '>' || nx.v === '['))) { this.next(); t.ptr++; continue; }
      }
      if (this.isOp('[') && !opts.noArray && (this.isOp(']', this.peek()) || this.isOp(',', this.peek()))) {
        this.next();
        while (this.eat(',')) { /* rank */ }
        this.expect(']');
        t.ranks++;
        continue;
      }
      break;
    }
    return t;
  }

  nullableQuestionOk(opts) {
    const nx = this.peek();
    if (nx.t === 'op') {
      if (opts.inNew && (nx.v === '(' || nx.v === '{')) return true;
      if ([')', ',', '>', ']', ';', '=', '{', '}', '[', '?', '*', '=>', ':', '??', '.'].includes(nx.v)) {
        if (nx.v === ':' && opts.expr) return false;
        return true;
      }
      return false;
    }
    if (nx.t === 'eof') return true;
    if (opts.expr) {
      // `x is T? y` is rare; `x is T ? a : b` is common
      if (nx.t === 'id' && (nx.v === 'and' || nx.v === 'or' || nx.v === 'when')) return true;
      return false;
    }
    return nx.t === 'id' || nx.t === 'kw';
  }

  // '<' ... '>' ; returns array of types or null. typeCtx: in a type context any following token is fine
  parseTypeArgs(typeCtx) {
    if (!this.isOp('<')) return null;
    const save = this.i;
    this.next();
    const args = [];
    try {
      if (this.isOp('>') || this.isOp(',')) {
        // unbound generic: typeof(Dictionary<,>)
        while (this.eat(',')) { args.push(null); }
        args.push(null);
      } else {
        do {
          this.parseAttrs();
          if (this.isKw('in') || this.isKw('out')) this.next();
          args.push(this.parseType({ decl: true }));
        } while (this.eat(','));
      }
      if (!this.isOp('>')) throw new ParseError('no >');
      this.next();
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      this.i = save;
      return null;
    }
    if (!typeCtx) {
      const nx = this.cur;
      const ok = nx.t === 'eof' || (nx.t === 'op' && AFTER_TYPEARGS.has(nx.v)) || (nx.t === 'kw' && (nx.v === 'is' || nx.v === 'as'))
        || (nx.t === 'op' && nx.v === '>' ) || (nx.t === 'id' && (nx.v === 'when' || nx.v === 'and' || nx.v === 'or'));
      if (!ok) { this.i = save; return null; }
    }
    return args;
  }

  parseTypeParams() {
    const out = [];
    if (!this.isOp('<')) return out;
    this.next();
    do {
      this.parseAttrs();
      let variance = null;
      if (this.isKw('in') || this.isKw('out')) variance = this.next().v;
      const id = this.ident();
      out.push({ k: 'TypeParam', name: id.v, variance, line: id.line, col: id.col });
    } while (this.eat(','));
    this.expect('>');
    return out;
  }

  parseConstraints() {
    const out = [];
    while (this.isCtx('where') && this.isId(this.peek()) && this.isOp(':', this.peek(2))) {
      this.next();
      const name = this.next().v;
      this.next();
      const items = [];
      do {
        if (this.isKw('class') || this.isKw('struct')) { items.push(this.next().v); if (this.isOp('?')) this.next(); continue; }
        if (this.isKw('new')) { this.next(); this.expect('('); this.expect(')'); items.push('new()'); continue; }
        if (this.isKw('default')) { this.next(); items.push('default'); continue; }
        items.push(this.parseType({}));
      } while (this.eat(','));
      out.push({ k: 'Constraint', name, items });
    }
    return out;
  }

  // ───────────────────────────────────────────── type declarations
  parseTypeDecl(attrs, mods, outer) {
    const start = this.cur;
    let kind;
    if (this.isCtx('record')) {
      this.next();
      kind = 'record';
      if (this.isKw('struct')) { this.next(); kind = 'record struct'; } else if (this.isKw('class')) this.next();
    } else if (this.isKw('delegate')) {
      return this.parseDelegate(attrs, mods, start);
    } else {
      kind = this.next().v;
    }
    const nameTok = this.ident();
    const typeParams = this.parseTypeParams();
    let params = null;
    if (this.isOp('(')) params = this.parseParamList('(', ')');
    const bases = [];
    let baseArgs = null;
    if (this.eat(':')) {
      do {
        const bt = this.parseType({});
        if (this.isOp('(') && bases.length === 0) baseArgs = this.parseArgList('(', ')');
        bases.push(bt);
      } while (this.eat(','));
    }
    const constraints = this.parseConstraints();
    const td = { k: 'TypeDecl', kind, name: nameTok.v, nameLine: nameTok.line, nameCol: nameTok.col, typeParams, params, bases, baseArgs, constraints,
      attrs, mods, members: [], partial: mods.has('partial'), broken: false, outer };
    if (kind === 'enum') {
      this.expect('{');
      while (!this.isOp('}') && this.cur.t !== 'eof') {
        const a = this.parseAttrs();
        const id = this.ident();
        let value = null;
        if (this.eat('=')) value = this.parseExpr();
        td.members.push(this.node('EnumMember', id, { name: id.v, value, attrs: a }));
        if (!this.eat(',')) break;
      }
      this.expect('}');
    } else if (this.isOp('{')) {
      this.next();
      this.parseMembers(td);
      this.expect('}');
    } else {
      this.expect(';');
      td.noBody = true;
    }
    this.eat(';');
    const nd = this.node('TypeDecl', start, td);
    for (const m of nd.members) m.owner = nd;
    return nd;
  }

  parseDelegate(attrs, mods, start) {
    this.expect('delegate');
    const ret = this.parseRefType();
    const id = this.ident();
    const typeParams = this.parseTypeParams();
    const params = this.parseParamList('(', ')');
    const constraints = this.parseConstraints();
    this.expect(';');
    return this.node('Delegate', start, { name: id.v, nameLine: id.line, nameCol: id.col, retType: ret, typeParams, params, constraints, attrs, mods });
  }

  parseRefType() {
    if (this.isKw('ref')) { this.next(); if (this.isKw('readonly')) this.next(); }
    return this.parseType({ decl: true });
  }

  parseMembers(td) {
    let guard = -1;
    while (!this.isOp('}') && this.cur.t !== 'eof') {
      if (this.i === guard) { this.next(); continue; }
      guard = this.i;
      const startIdx = this.i;
      try {
        const m = this.parseMember(td);
        if (m) { if (Array.isArray(m)) td.members.push(...m); else td.members.push(m); }
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        this.errors.push(e.message);
        td.broken = true;
        const tok = this.toks[startIdx];
        this.i = this.skipMember(startIdx);
        td.members.push(this.node('ErrorMember', tok, { message: e.message }));
      }
    }
  }

  parseMember(td) {
    const start = this.cur;
    if (this.isOp(';')) { this.next(); return null; }
    const attrs = this.parseAttrs();
    const mods = this.parseMods();
    if (this.atTypeDecl()) return this.parseTypeDecl(attrs, mods, td);
    if (this.isOp('~')) {
      this.next();
      const id = this.ident();
      this.expect('('); this.expect(')');
      const body = this.parseBodyOrSemi();
      return this.node('Destructor', start, { name: id.v, attrs, mods, params: [], ...body });
    }
    if (this.isKw('event')) return this.parseEvent(start, attrs, mods);
    if (this.isKw('implicit') || this.isKw('explicit')) {
      const kind = this.next().v;
      this.expect('operator');
      if (this.isKw('checked')) this.next();
      const type = this.parseType({});
      const params = this.parseParamList('(', ')');
      const body = this.parseBodyOrSemi();
      return this.node('Conversion', start, { kind, name: `op_${kind}`, retType: type, params, attrs, mods, ...body });
    }
    if (this.isKw('const')) {
      this.next();
      const type = this.parseType({ decl: true });
      const vars = this.parseVarDeclarators();
      this.expect(';');
      return this.node('Field', start, { type, vars, attrs, mods, isConst: true });
    }
    // constructor
    if (this.isId() && this.cur.v === td.name && this.isOp('(', this.peek())) {
      const id = this.next();
      const params = this.parseParamList('(', ')');
      let init = null;
      if (this.eat(':')) {
        const kt = this.cur;
        if (!this.isKw('base') && !this.isKw('this')) this.fail('expected base or this');
        this.next();
        const args = this.parseArgList('(', ')');
        init = this.node('CtorInit', kt, { kind: kt.v, args });
      }
      const body = this.parseBodyOrSemi();
      return this.node('Ctor', start, { name: id.v, nameLine: id.line, nameCol: id.col, params, init, attrs, mods, ...body });
    }
    let refRet = false;
    if (this.isKw('ref')) { this.next(); refRet = true; if (this.isKw('readonly')) this.next(); }
    const type = this.parseType({ decl: true });
    if (this.isKw('operator')) {
      this.next();
      if (this.isKw('checked')) this.next();
      let op = this.next().v;
      if (op === '>' && this.isOp('>') && this.adjacent(this.toks[this.i - 1], this.cur)) {
        this.next(); op = '>>';
        if (this.isOp('>') && this.adjacent(this.toks[this.i - 1], this.cur)) { this.next(); op = '>>>'; }
      } else if (op === '>' && this.isOp('=') && this.adjacent(this.toks[this.i - 1], this.cur)) { this.next(); op = '>='; }
      if (!OVERLOADABLE.has(op) && op !== '>>' && op !== '>>>' && op !== '>=') this.fail('bad operator');
      const params = this.parseParamList('(', ')');
      const body = this.parseBodyOrSemi();
      return this.node('Operator', start, { op, name: `op_${op}`, retType: type, params, attrs, mods, ...body });
    }
    // explicit interface or plain name
    let iface = null;
    let nameTok = null;
    let typeParams = [];
    if (this.isKw('this')) {
      nameTok = this.next();
    } else {
      nameTok = this.ident();
      const segs = [];
      for (;;) {
        if (this.isOp('<')) {
          const save = this.i;
          const ta = this.parseTypeArgs(true);
          if (ta && this.isOp('.')) { segs.push(nameTok.v); this.next(); if (this.isKw('this')) { nameTok = this.next(); break; } nameTok = this.ident(); continue; }
          this.i = save;
          break;
        }
        if (this.isOp('.')) {
          segs.push(nameTok.v);
          this.next();
          if (this.isKw('this')) { nameTok = this.next(); break; }
          nameTok = this.ident();
          continue;
        }
        break;
      }
      if (segs.length) iface = segs.join('.');
    }
    if (nameTok.v === 'this') {
      const params = this.parseParamList('[', ']');
      const acc = this.parseAccessorsOrExprBody();
      return this.node('Indexer', start, { name: 'this', type, params, attrs, mods, iface, ...acc });
    }
    if (this.isOp('<') || this.isOp('(')) {
      typeParams = this.parseTypeParams();
      const params = this.parseParamList('(', ')');
      const constraints = this.parseConstraints();
      const body = this.parseBodyOrSemi();
      return this.node('Method', start, { name: nameTok.v, nameLine: nameTok.line, nameCol: nameTok.col, retType: type, refRet, typeParams, params, constraints, attrs, mods, iface, ...body });
    }
    if (this.isOp('{') || this.isOp('=>')) {
      const acc = this.parseAccessorsOrExprBody();
      let init = null;
      if (acc.accessors && this.eat('=')) { init = this.parseVarInit(); this.expect(';'); }
      return this.node('Property', start, { name: nameTok.v, nameLine: nameTok.line, nameCol: nameTok.col, type, attrs, mods, iface, init, ...acc });
    }
    // field
    this.i--; // back to the name token
    while (this.toks[this.i] !== nameTok && this.i > 0) this.i--;
    const vars = this.parseVarDeclarators();
    this.expect(';');
    return this.node('Field', start, { type, vars, attrs, mods, isConst: false });
  }

  parseEvent(start, attrs, mods) {
    this.expect('event');
    const type = this.parseType({ decl: true });
    const id = this.ident();
    let iface = null;
    let nameTok = id;
    while (this.isOp('.')) { iface = (iface ? `${iface}.` : '') + nameTok.v; this.next(); nameTok = this.ident(); }
    if (this.isOp('{')) {
      const acc = this.parseAccessorsOrExprBody();
      return this.node('Event', start, { name: nameTok.v, nameLine: nameTok.line, nameCol: nameTok.col, type, attrs, mods, iface, ...acc, fieldLike: false });
    }
    this.i -= 1;
    while (this.toks[this.i] !== nameTok && this.i > 0) this.i--;
    const vars = this.parseVarDeclarators();
    this.expect(';');
    return this.node('Event', start, { name: vars[0].name, nameLine: vars[0].line, nameCol: vars[0].col, type, vars, attrs, mods, fieldLike: true });
  }

  parseAccessorsOrExprBody() {
    if (this.isOp('=>')) {
      this.next();
      const e = this.parseExpr();
      this.expect(';');
      return { exprBody: e, accessors: null };
    }
    this.expect('{');
    const accessors = [];
    while (!this.isOp('}') && this.cur.t !== 'eof') {
      const s = this.cur;
      const attrs = this.parseAttrs();
      const mods = this.parseMods();
      if (this.isKw('readonly')) this.next();
      const kt = this.ident();
      if (!['get', 'set', 'init', 'add', 'remove'].includes(kt.v)) this.fail('bad accessor');
      const body = this.parseBodyOrSemi();
      accessors.push(this.node('Accessor', s, { kind: kt.v, attrs, mods, ...body }));
    }
    this.expect('}');
    return { accessors, exprBody: null };
  }

  parseBodyOrSemi() {
    if (this.isOp('{')) return { body: this.parseBlock(), exprBody: null };
    if (this.isOp('=>')) {
      this.next();
      const e = this.parseExpr();
      this.expect(';');
      return { body: null, exprBody: e };
    }
    this.expect(';');
    return { body: null, exprBody: null };
  }

  parseParamList(open, close) {
    this.expect(open);
    const params = [];
    while (!this.isOp(close) && this.cur.t !== 'eof') {
      const s = this.cur;
      const attrs = this.parseAttrs();
      const mods = [];
      while (this.isKw('ref') || this.isKw('out') || this.isKw('in') || this.isKw('params') || this.isKw('this') || this.isCtx('scoped') || this.isKw('readonly')) {
        if (this.isCtx('scoped') && !(this.isId(this.peek()) || this.peek().t === 'kw')) break;
        mods.push(this.next().v);
      }
      if (this.isCtx('__arglist')) { this.next(); params.push(this.node('Param', s, { name: '__arglist', type: null, mods, attrs, def: null })); break; }
      const type = this.parseType({ decl: true });
      let id;
      if (this.isId()) id = this.next();
      else if (open === '(' && (this.isOp(',') || this.isOp(close))) id = null; // anonymous (function pointer etc.)
      else this.fail('expected parameter name');
      let def = null;
      if (this.eat('=')) def = this.parseExpr();
      params.push(this.node('Param', s, { name: id ? id.v : '', nameLine: id ? id.line : s.line, nameCol: id ? id.col : s.col, type, mods, attrs, def }));
      if (!this.eat(',')) break;
    }
    this.expect(close);
    return params;
  }

  parseVarDeclarators() {
    const vars = [];
    do {
      const id = this.ident();
      let size = null;
      if (this.isOp('[')) { this.next(); size = this.isOp(']') ? null : this.parseExpr(); this.expect(']'); }
      let init = null;
      if (this.eat('=')) init = this.parseVarInit();
      vars.push(this.node('VarDecl', id, { name: id.v, init, size }));
    } while (this.eat(','));
    return vars;
  }

  parseVarInit() {
    if (this.isOp('{')) return this.parseInitList('ArrayInit');
    if (this.isKw('ref')) { const s = this.next(); const e = this.parseExpr(); return this.node('Ref', s, { expr: e }); }
    return this.parseExpr();
  }

  // ───────────────────────────────────────────── statements
  parseBlock() {
    const start = this.expect('{');
    const stmts = [];
    while (!this.isOp('}') && this.cur.t !== 'eof') stmts.push(this.parseStatement());
    this.expect('}');
    return this.node('Block', start, { stmts });
  }

  parseEmbedded() {
    return this.parseStatement();
  }

  parseStatement() {
    if (++this.depth > 400) { this.depth = 0; this.fail('nesting too deep'); }
    try {
      return this.parseStatementInner();
    } finally {
      this.depth--;
    }
  }

  parseStatementInner() {
    const t = this.cur;
    if (t.t === 'op') {
      if (t.v === '{') return this.parseBlock();
      if (t.v === ';') { this.next(); return this.node('Empty', t); }
      if (t.v === '[') {
        // attributes on a local function
        this.parseAttrs();
        return this.parseStatement();
      }
    }
    if (t.t === 'kw') {
      switch (t.v) {
        case 'if': return this.parseIf();
        case 'while': {
          this.next(); this.expect('(');
          const cond = this.parseExpr();
          this.expect(')');
          const body = this.parseEmbedded();
          return this.node('While', t, { cond, body });
        }
        case 'do': {
          this.next();
          const body = this.parseEmbedded();
          this.expect('while'); this.expect('(');
          const cond = this.parseExpr();
          this.expect(')'); this.expect(';');
          return this.node('Do', t, { cond, body });
        }
        case 'for': return this.parseFor();
        case 'foreach': return this.parseForeach(false, t);
        case 'switch': return this.parseSwitchStmt();
        case 'try': return this.parseTry();
        case 'return': {
          this.next();
          let expr = null;
          if (!this.isOp(';')) expr = this.isKw('ref') ? this.parseVarInit() : this.parseExpr();
          this.expect(';');
          return this.node('Return', t, { expr });
        }
        case 'throw': {
          this.next();
          let expr = null;
          if (!this.isOp(';')) expr = this.parseExpr();
          this.expect(';');
          return this.node('Throw', t, { expr });
        }
        case 'break': this.next(); this.expect(';'); return this.node('Break', t);
        case 'continue': this.next(); this.expect(';'); return this.node('Continue', t);
        case 'goto': {
          this.next();
          let kind = 'label'; let target = null;
          if (this.isKw('case')) { this.next(); kind = 'case'; target = this.parseExpr(); } else if (this.isKw('default')) { this.next(); kind = 'default'; } else target = this.ident().v;
          this.expect(';');
          return this.node('Goto', t, { kind, target });
        }
        case 'lock': {
          this.next(); this.expect('(');
          const expr = this.parseExpr();
          this.expect(')');
          const body = this.parseEmbedded();
          return this.node('Lock', t, { expr, body });
        }
        case 'using': return this.parseUsingStmt(false, t);
        case 'checked': case 'unchecked':
          if (this.isOp('{', this.peek())) { this.next(); const block = this.parseBlock(); return this.node('CheckedStmt', t, { kind: t.v, block }); }
          break;
        case 'unsafe':
          if (this.isOp('{', this.peek())) { this.next(); const block = this.parseBlock(); return this.node('UnsafeStmt', t, { block }); }
          break;
        case 'fixed': {
          this.next(); this.expect('(');
          const decl = this.parseLocalDeclCore(new Set(), true);
          this.expect(')');
          const body = this.parseEmbedded();
          return this.node('Fixed', t, { decl, body });
        }
        case 'const': {
          this.next();
          const type = this.parseType({ decl: true });
          const vars = this.parseVarDeclarators();
          this.expect(';');
          return this.node('LocalDecl', t, { type, vars, isConst: true, isUsing: false, mods: new Set(['const']) });
        }
        case 'else': this.fail('unexpected else'); break;
        default: break;
      }
    }
    if (t.t === 'id') {
      if (t.v === 'yield' && (this.isKw('return', this.peek()) || this.isKw('break', this.peek()))) {
        this.next();
        if (this.next().v === 'break') { this.expect(';'); return this.node('YieldBreak', t); }
        const expr = this.parseExpr();
        this.expect(';');
        return this.node('YieldReturn', t, { expr });
      }
      if (t.v === 'await' && this.isKw('foreach', this.peek())) { this.next(); return this.parseForeach(true, t); }
      if (t.v === 'await' && this.isKw('using', this.peek())) { this.next(); return this.parseUsingStmt(true, t); }
      if (this.isOp(':', this.peek()) ) {
        this.next(); this.next();
        const stmt = this.isOp('}') ? this.node('Empty', t) : this.parseStatement();
        return this.node('Labeled', t, { label: t.v, stmt });
      }
    }
    const decl = this.tryLocalDeclOrFunction();
    if (decl) return decl;
    const expr = this.parseExpr();
    this.expect(';');
    return this.node('ExprStmt', t, { expr });
  }

  parseIf() {
    const t = this.expect('if');
    this.expect('(');
    const cond = this.parseExpr();
    this.expect(')');
    const then = this.parseEmbedded();
    let els = null;
    let elseLine = 0;
    if (this.isKw('else')) { elseLine = this.cur.line; this.next(); els = this.parseEmbedded(); }
    return this.node('If', t, { cond, then, else: els, elseLine });
  }

  parseFor() {
    const t = this.expect('for');
    this.expect('(');
    let init = [];
    if (!this.isOp(';')) {
      const d = this.speculate(() => {
        const dd = this.parseLocalDeclCore(new Set(), true);
        if (!this.isOp(';')) throw new ParseError('x');
        return dd;
      });
      if (d) init = [d];
      else { do { init.push(this.parseExpr()); } while (this.eat(',')); }
    }
    this.expect(';');
    const cond = this.isOp(';') ? null : this.parseExpr();
    this.expect(';');
    const step = [];
    if (!this.isOp(')')) { do { step.push(this.parseExpr()); } while (this.eat(',')); }
    this.expect(')');
    const body = this.parseEmbedded();
    return this.node('For', t, { init, cond, step, body });
  }

  parseForeach(isAwait, t) {
    this.expect('foreach');
    this.expect('(');
    let type = null; let name = null; let designation = null; let nameLine = 0; let nameCol = 0;
    if (this.isCtx('var') && this.isOp('(', this.peek())) {
      const vs = this.next();
      type = this.node('Type', vs, { name: 'var', qual: 'var', args: [], parts: [{ name: 'var', args: [] }], nullable: false, ranks: 0, ptr: 0, predefined: false });
      designation = this.parseDesignation();
    } else {
      const d = this.speculate(() => {
        const ty = this.parseType({ decl: true });
        if (this.isId() && this.isKw('in', this.peek())) { const id = this.next(); return { ty, id }; }
        throw new ParseError('x');
      });
      if (d) { type = d.ty; name = d.id.v; nameLine = d.id.line; nameCol = d.id.col; } else {
        // deconstruction like foreach ((a, b) in x)
        designation = this.parseExprNoAssign();
      }
    }
    this.expect('in');
    const expr = this.parseExpr();
    this.expect(')');
    const body = this.parseEmbedded();
    return this.node('Foreach', t, { type, name, nameLine, nameCol, designation, expr, body, isAwait });
  }

  parseDesignation() {
    const s = this.cur;
    if (this.isOp('(')) {
      this.next();
      const items = [];
      do { items.push(this.parseDesignation()); } while (this.eat(','));
      this.expect(')');
      return this.node('ParenDesignation', s, { items });
    }
    const id = this.ident();
    return this.node('SingleDesignation', id, { name: id.v, discard: id.v === '_' });
  }

  parseSwitchStmt() {
    const t = this.expect('switch');
    const expr = this.parseParenExprMaybeTuple();
    this.expect('{');
    const sections = [];
    while (!this.isOp('}') && this.cur.t !== 'eof') {
      const s = this.cur;
      const labels = [];
      while (this.isKw('case') || (this.isKw('default') && this.isOp(':', this.peek()))) {
        const lt = this.next();
        if (lt.v === 'default') { this.expect(':'); labels.push(this.node('DefaultLabel', lt)); continue; }
        const pattern = this.parsePattern();
        let when = null;
        if (this.isCtx('when')) { this.next(); when = this.parseExpr(); }
        this.expect(':');
        labels.push(this.node('CaseLabel', lt, { pattern, when }));
      }
      if (!labels.length) this.fail('expected case');
      const stmts = [];
      while (!this.isOp('}') && !this.isKw('case') && !(this.isKw('default') && this.isOp(':', this.peek())) && this.cur.t !== 'eof') stmts.push(this.parseStatement());
      sections.push(this.node('Section', s, { labels, stmts }));
    }
    this.expect('}');
    return this.node('Switch', t, { expr, sections });
  }

  parseParenExprMaybeTuple() {
    const s = this.expect('(');
    const e = this.parseExpr();
    if (this.isOp(',')) {
      const elems = [this.node('TupleArg', e, { name: null, expr: e })];
      while (this.eat(',')) { const x = this.parseExpr(); elems.push(this.node('TupleArg', x, { name: null, expr: x })); }
      this.expect(')');
      return this.node('Tuple', s, { elems });
    }
    this.expect(')');
    return e;
  }

  parseTry() {
    const t = this.expect('try');
    const block = this.parseBlock();
    const catches = [];
    while (this.isKw('catch')) {
      const ct = this.next();
      let type = null; let name = null; let when = null; let nameLine = 0;
      if (this.isOp('(')) {
        this.next();
        type = this.parseType({ decl: true });
        if (this.isId()) { const id = this.next(); name = id.v; nameLine = id.line; }
        this.expect(')');
      }
      if (this.isCtx('when')) { this.next(); this.expect('('); when = this.parseExpr(); this.expect(')'); }
      const body = this.parseBlock();
      catches.push(this.node('Catch', ct, { type, name, nameLine, when, block: body }));
    }
    let fin = null;
    if (this.isKw('finally')) { this.next(); fin = this.parseBlock(); }
    if (!catches.length && !fin) this.fail('try without catch or finally');
    return this.node('Try', t, { block, catches, fin });
  }

  parseUsingStmt(isAwait, t) {
    this.expect('using');
    if (this.isOp('(')) {
      this.next();
      let decl = this.speculate(() => {
        const d = this.parseLocalDeclCore(new Set(), true);
        if (!this.isOp(')')) throw new ParseError('x');
        return d;
      });
      let expr = null;
      if (!decl) expr = this.parseExpr();
      this.expect(')');
      const body = this.parseEmbedded();
      if (decl) decl.isUsing = true;
      return this.node('Using', t, { decl, expr, body, isAwait });
    }
    const d = this.parseLocalDeclCore(new Set(), true);
    this.expect(';');
    d.isUsing = true;
    d.isAwait = isAwait;
    d.line = t.line; d.col = t.col; d.pos = t.pos;
    return d;
  }

  // declaration without the terminator; throws when not a declaration
  parseLocalDeclCore(mods, requireDecl) {
    const s = this.cur;
    if (this.isCtx('var') && this.isOp('(', this.peek())) {
      const vt = this.next();
      const designation = this.parseDesignation();
      this.expect('=');
      const init = this.parseExpr();
      const type = this.node('Type', vt, { name: 'var', qual: 'var', args: [], parts: [{ name: 'var', args: [] }], nullable: false, ranks: 0, ptr: 0, predefined: false });
      return this.node('LocalDecl', s, { type, vars: [], designation, deconInit: init, isConst: false, isUsing: false, mods });
    }
    if (this.isKw('ref')) { this.next(); if (this.isKw('readonly')) this.next(); mods.add('ref'); }
    const type = this.parseType({ decl: true });
    if (!this.isId()) this.fail('not a declaration');
    const after = this.peek();
    if (requireDecl && !(after.t === 'op' && ['=', ';', ',', ')', '['].includes(after.v)) && !(after.t === 'kw' && after.v === 'in')) this.fail('not a declaration');
    const vars = this.parseVarDeclarators();
    return this.node('LocalDecl', s, { type, vars, isConst: false, isUsing: false, mods });
  }

  tryLocalDeclOrFunction() {
    const save = this.i;
    const s = this.cur;
    const mods = new Set();
    for (;;) {
      if ((this.isKw('static') || this.isKw('unsafe') || this.isKw('extern') || this.isKw('readonly')) && !this.isOp('.', this.peek())) { mods.add(this.next().v); continue; }
      if (this.isCtx('async') && (this.isId(this.peek()) || this.peek().t === 'kw') && !this.isOp('=>', this.peek(2))) { mods.add(this.next().v); continue; }
      if (this.isCtx('scoped') && (this.isId(this.peek()) || this.isKw('ref', this.peek()))) { mods.add(this.next().v); continue; }
      break;
    }
    if (this.isCtx('var') && this.isOp('(', this.peek())) {
      const r = this.speculate(() => { const d = this.parseLocalDeclCore(mods, true); this.expect(';'); return d; });
      if (r) return r;
      this.i = save;
      return null;
    }
    const startI = this.i;
    let isRef = false;
    if (this.isKw('ref')) { this.next(); isRef = true; if (this.isKw('readonly')) this.next(); }
    const type = this.speculate(() => this.parseType({ decl: true }));
    if (!type || !this.isId()) { this.i = save; return null; }
    if (!type.predefined && type.parts && type.parts.length === 1 && !type.args.length && !type.nullable && !type.ranks && !type.ptr &&
      ['await', 'yield', 'nameof', 'from'].includes(type.name) && !mods.size) {
      this.i = save; return null;
    }
    const nameTok = this.cur;
    const after = this.peek();
    if (after.t === 'op' && (after.v === '(' || after.v === '<')) {
      // local function?
      const r = this.speculate(() => {
        this.next();
        const typeParams = this.parseTypeParams();
        const params = this.parseParamList('(', ')');
        const constraints = this.parseConstraints();
        if (!this.isOp('{') && !this.isOp('=>')) throw new ParseError('not a local function');
        return { typeParams, params, constraints };
      });
      if (r) {
        const body = this.parseBodyOrSemi();
        return this.node('LocalFunc', s, { name: nameTok.v, nameLine: nameTok.line, nameCol: nameTok.col, retType: type, ...r, mods, attrs: [], ...body });
      }
      this.i = save;
      return null;
    }
    if (after.t === 'op' && (after.v === '=' || after.v === ';' || after.v === ',' || after.v === '[')) {
      this.i = startI;
      if (isRef) mods.add('ref');
      const d = this.parseLocalDeclCore(mods, true);
      this.expect(';');
      d.line = s.line; d.col = s.col; d.pos = s.pos;
      return d;
    }
    this.i = save;
    return null;
  }

  // ───────────────────────────────────────────── expressions
  parseExpr() {
    if (++this.depth > 600) { this.depth = 0; this.fail('expression too deep'); }
    try {
      return this.parseAssignment();
    } finally {
      this.depth--;
    }
  }

  parseExprNoAssign() { return this.parseConditional(); }

  assignOp() {
    const t = this.cur;
    if (t.t !== 'op') return null;
    if (ASSIGN_OPS.has(t.v)) return { op: t.v, len: 1 };
    if (t.v === '>') {
      const a = this.peek(1); const b = this.peek(2); const c = this.peek(3);
      if (a.v === '>' && this.adjacent(t, a)) {
        if (b.t === 'op' && b.v === '=' && this.adjacent(a, b)) return { op: '>>=', len: 3 };
        if (b.t === 'op' && b.v === '>' && this.adjacent(a, b) && c.t === 'op' && c.v === '=' && this.adjacent(b, c)) return { op: '>>>=', len: 4 };
      }
    }
    return null;
  }

  parseAssignment() {
    if (this.isLambdaStart()) return this.parseLambda();
    const s = this.cur;
    const left = this.parseConditional();
    const a = this.assignOp();
    if (a) {
      for (let k = 0; k < a.len; k++) this.next();
      let right;
      if (this.isKw('ref') && a.op === '=') { const rs = this.next(); right = this.node('Ref', rs, { expr: this.parseExpr() }); } else right = this.parseExpr();
      return this.node('Assign', s, { op: a.op, left, right });
    }
    return left;
  }

  isLambdaStart() {
    let j = this.i;
    const T = this.toks;
    for (;;) {
      const t = T[j];
      if (t.t === 'id' && t.v === 'async' && (T[j + 1].t === 'id' || T[j + 1].v === '(' || T[j + 1].v === 'static')) { j++; continue; }
      if (t.t === 'kw' && t.v === 'static' && (T[j + 1].t === 'id' || T[j + 1].v === '(' || T[j + 1].v === 'async')) { j++; continue; }
      break;
    }
    const t = T[j];
    if (this.noLambdaDepth === this.depth && j === this.i) return false;
    if (t.t === 'id' && T[j + 1] && T[j + 1].t === 'op' && T[j + 1].v === '=>') return true;
    if (t.t === 'op' && t.v === '(') {
      const m = this.match[j];
      if (m > 0 && T[m + 1] && T[m + 1].t === 'op' && T[m + 1].v === '=>') return true;
    }
    // explicit return type lambda: int (x) => ...
    if (t.t === 'kw' && PREDEFINED.has(t.v)) {
      if (T[j + 1] && T[j + 1].v === '(' && T[j + 1].t === 'op') {
        const m = this.match[j + 1];
        if (m > 0 && T[m + 1] && T[m + 1].t === 'op' && T[m + 1].v === '=>') return true;
      }
    }
    return false;
  }

  parseLambda() {
    const s = this.cur;
    let isAsync = false; let isStatic = false;
    for (;;) {
      if (this.isCtx('async') && !this.isOp('=>', this.peek())) { this.next(); isAsync = true; continue; }
      if (this.isKw('static')) { this.next(); isStatic = true; continue; }
      break;
    }
    let params = [];
    let retType = null;
    if (this.isId() && this.isOp('=>', this.peek())) {
      const id = this.next();
      params = [this.node('Param', id, { name: id.v, nameLine: id.line, nameCol: id.col, type: null, mods: [], attrs: [], def: null, implicit: true })];
    } else {
      if (!this.isOp('(')) retType = this.parseType({ decl: true });
      this.expect('(');
      while (!this.isOp(')') && this.cur.t !== 'eof') {
        const ps = this.cur;
        const attrs = this.parseAttrs();
        const mods = [];
        while (this.isKw('ref') || this.isKw('out') || this.isKw('in') || this.isKw('params') || this.isCtx('scoped')) mods.push(this.next().v);
        if (this.isId() && (this.isOp(',', this.peek()) || this.isOp(')', this.peek()))) {
          const id = this.next();
          params.push(this.node('Param', ps, { name: id.v, nameLine: id.line, nameCol: id.col, type: null, mods, attrs, def: null, implicit: true }));
        } else {
          const type = this.parseType({ decl: true });
          const id = this.ident();
          let def = null;
          if (this.eat('=')) def = this.parseExpr();
          params.push(this.node('Param', ps, { name: id.v, nameLine: id.line, nameCol: id.col, type, mods, attrs, def }));
        }
        if (!this.eat(',')) break;
      }
      this.expect(')');
    }
    this.expect('=>');
    let body;
    if (this.isOp('{')) body = this.parseBlock(); else if (this.isKw('ref')) body = this.parseVarInit(); else body = this.parseExpr();
    return this.node('Lambda', s, { params, body, isAsync, isStatic, retType });
  }

  parseConditional() {
    const s = this.cur;
    const cond = this.parseCoalesce();
    if (this.isOp('?')) {
      this.next();
      const then = this.isKw('ref') ? this.parseVarInit() : this.parseExpr();
      this.expect(':');
      const els = this.isKw('ref') ? this.parseVarInit() : this.parseExpr();
      return this.node('Conditional', s, { cond, then, else: els });
    }
    return cond;
  }

  parseCoalesce() {
    const s = this.cur;
    const left = this.parseBinary(1);
    if (this.isOp('??')) {
      this.next();
      const right = this.isKw('throw') ? this.parseThrowExpr() : this.parseCoalesce();
      return this.node('Binary', s, { op: '??', left, right });
    }
    return left;
  }

  binOp() {
    const t = this.cur;
    if (t.t === 'kw' && (t.v === 'is' || t.v === 'as')) return { op: t.v, len: 1 };
    if (t.t !== 'op') return null;
    if (t.v === '>') {
      const a = this.peek(1);
      if (a.t === 'op' && this.adjacent(t, a)) {
        if (a.v === '>') {
          const b = this.peek(2);
          if (b.t === 'op' && this.adjacent(a, b)) {
            if (b.v === '=') return null; // >>=
            if (b.v === '>') {
              const c = this.peek(3);
              if (c.t === 'op' && c.v === '=' && this.adjacent(b, c)) return null;
              return { op: '>>>', len: 3 };
            }
          }
          return { op: '>>', len: 2 };
        }
        if (a.v === '=') {
          return { op: '>=', len: 2 };
        }
        if (a.v === '==') return { op: '>=', len: 1, split: true };
      }
      return { op: '>', len: 1 };
    }
    if (BIN_PREC[t.v]) return { op: t.v, len: 1 };
    return null;
  }

  parseBinary(minPrec) {
    const s = this.cur;
    let left = this.parseSwitchWith();
    for (;;) {
      const b = this.binOp();
      if (!b) break;
      const prec = BIN_PREC[b.op];
      if (!prec || prec < minPrec) break;
      for (let k = 0; k < b.len; k++) this.next();
      if (b.op === 'is') {
        const pattern = this.parsePattern();
        left = this.node('Is', s, { expr: left, pattern });
        continue;
      }
      if (b.op === 'as') {
        const type = this.parseType({ expr: true });
        left = this.node('As', s, { expr: left, type });
        continue;
      }
      const right = this.parseBinary(prec + 1);
      left = this.node('Binary', s, { op: b.op, left, right });
    }
    return left;
  }

  parseSwitchWith() {
    const s = this.cur;
    let e = this.parseRange();
    for (;;) {
      if (this.isKw('switch') && this.isOp('{', this.peek())) {
        this.next(); this.next();
        const arms = [];
        while (!this.isOp('}') && this.cur.t !== 'eof') {
          const as = this.cur;
          const pattern = this.parsePattern();
          let when = null;
          if (this.isCtx('when')) { this.next(); when = this.parseWhenExpr(); }
          this.expect('=>');
          const expr = this.isKw('throw') ? this.parseThrowExpr() : this.parseExpr();
          arms.push(this.node('SwitchArm', as, { pattern, when, expr }));
          if (!this.eat(',')) break;
        }
        this.expect('}');
        e = this.node('SwitchExpr', s, { expr: e, arms });
        continue;
      }
      if (this.isCtx('with') && this.isOp('{', this.peek())) {
        this.next();
        const init = this.parseInitList('InitList');
        e = this.node('With', s, { expr: e, init });
        continue;
      }
      break;
    }
    return e;
  }

  parseRange() {
    const s = this.cur;
    if (this.isOp('..')) {
      this.next();
      const to = this.startsExpr() ? this.parseUnary() : null;
      return this.node('Range', s, { from: null, to });
    }
    const e = this.parseUnary();
    if (this.isOp('..')) {
      this.next();
      const to = this.startsExpr() ? this.parseUnary() : null;
      return this.node('Range', s, { from: e, to });
    }
    return e;
  }

  startsExpr() {
    const t = this.cur;
    if (t.t === 'eof') return false;
    if (t.t === 'op') return ['(', '!', '~', '-', '+', '^', '++', '--', '@', '[', '&', '*'].includes(t.v);
    if (t.t === 'id') return !['and', 'or', 'when'].includes(t.v);
    return t.t !== 'kw' || !['is', 'as', 'in', 'switch'].includes(t.v);
  }

  parseWhenExpr() {
    const save = this.noLambdaDepth;
    this.noLambdaDepth = this.depth + 1;
    try { return this.parseExpr(); } finally { this.noLambdaDepth = save; }
  }

  parseThrowExpr() {
    const s = this.expect('throw');
    const expr = this.parseExpr();
    return this.node('ThrowExpr', s, { expr });
  }

  parseUnary() {
    const s = this.cur;
    const t = this.cur;
    if (t.t === 'op') {
      switch (t.v) {
        case '+': case '-': case '!': case '~': case '^': case '&': case '*': {
          this.next();
          const operand = this.parseUnary();
          if (t.v === '-' && operand.k === 'Literal' && (operand.kind === 'int' || operand.kind === 'real')) {
            return this.node('Literal', s, { kind: operand.kind, value: -operand.value, raw: `-${operand.raw}`, suffix: operand.suffix });
          }
          return this.node(t.v === '^' ? 'IndexFromEnd' : 'Unary', s, { op: t.v, operand, postfix: false });
        }
        case '++': case '--': {
          this.next();
          const operand = this.parseUnary();
          return this.node('Unary', s, { op: t.v, operand, postfix: false });
        }
        case '(': {
          const c = this.tryCast();
          if (c) return c;
          break;
        }
        default: break;
      }
    }
    if (t.t === 'id' && t.v === 'await' && this.awaitIsOperator()) {
      this.next();
      const expr = this.parseUnary();
      return this.node('Await', s, { expr });
    }
    if (t.t === 'kw' && t.v === 'throw') return this.parseThrowExpr();
    if (t.t === 'kw' && t.v === 'ref' ) { this.next(); const expr = this.parseUnary(); return this.node('Ref', s, { expr }); }
    return this.parsePostfix(this.parsePrimary());
  }

  awaitIsOperator() {
    const nx = this.peek();
    if (nx.t === 'eof') return false;
    if (nx.t === 'op') return ['(', '!', '-', '+', '@', '['].includes(nx.v);
    if (nx.t === 'id') return true;
    if (nx.t === 'kw') return !['is', 'as', 'in'].includes(nx.v);
    return true; // literal
  }

  tryCast() {
    const save = this.i;
    const s = this.cur;
    const m = this.match[this.i];
    if (m < 0) return null;
    this.next();
    let type;
    try {
      type = this.parseType({ decl: true });
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      this.i = save;
      return null;
    }
    if (!this.isOp(')') || this.i !== m) { this.i = save; return null; }
    this.next();
    const nx = this.cur;
    let isCast = false;
    const simple = type.parts && type.parts.length === 1 && !type.args.length && !type.nullable && !type.ranks && !type.ptr && !type.predefined && !type.tuple;
    if (type.predefined || type.nullable || type.ranks || type.ptr || type.args.length) {
      // predefined/generic types: cast if anything that starts an expression follows
      isCast = this.castFollower(nx, true);
    } else if (type.tuple) {
      isCast = false;
    } else {
      isCast = this.castFollower(nx, false);
    }
    void simple;
    if (!isCast) { this.i = save; return null; }
    const expr = this.parseUnary();
    return this.node('Cast', s, { type, expr });
  }

  castFollower(nx, loose) {
    if (nx.t === 'eof') return false;
    if (nx.t === 'id') return !['and', 'or', 'when', 'with', 'switch'].includes(nx.v) || this.isOp('(', this.peek(0)) ;
    if (nx.t === 'num' || nx.t === 'str' || nx.t === 'char') return true;
    if (nx.t === 'kw') return !['is', 'as', 'switch', 'in'].includes(nx.v);
    if (nx.t === 'op') {
      if (nx.v === '(' || nx.v === '~' || nx.v === '!') return true;
      if (loose && ['-', '+', '&', '*', '++', '--', '^', '['].includes(nx.v)) return true;
      if (nx.v === '@') return true;
    }
    return false;
  }

  parsePrimary() {
    const t = this.cur;
    const s = t;
    switch (t.t) {
      case 'num': this.next(); return this.node('Literal', s, { kind: t.real ? 'real' : 'int', value: t.value, raw: t.v, suffix: t.suffix });
      case 'char': this.next(); return this.node('Literal', s, { kind: 'char', value: t.value, raw: t.v });
      case 'str': {
        this.next();
        if (!t.interp) {
          // adjacent literals do not concatenate in C#, keep single
          return this.node('Literal', s, { kind: 'string', value: t.value, raw: t.v, sk: t.sk, u8: t.u8 });
        }
        return this.parseInterpolated(t);
      }
      case 'kw':
        switch (t.v) {
          case 'true': case 'false': this.next(); return this.node('Literal', s, { kind: 'bool', value: t.v === 'true', raw: t.v });
          case 'null': this.next(); return this.node('Literal', s, { kind: 'null', value: null, raw: 'null' });
          case 'this': this.next(); return this.node('This', s);
          case 'base': this.next(); return this.node('Base', s);
          case 'new': return this.parseNew();
          case 'typeof': {
            this.next(); this.expect('(');
            const type = this.parseType({ decl: true });
            this.expect(')');
            return this.node('Typeof', s, { type });
          }
          case 'sizeof': {
            this.next(); this.expect('(');
            const type = this.parseType({ decl: true });
            this.expect(')');
            return this.node('Sizeof', s, { type });
          }
          case 'default': {
            this.next();
            if (this.isOp('(')) { this.next(); const type = this.parseType({ decl: true }); this.expect(')'); return this.node('Default', s, { type }); }
            return this.node('Literal', s, { kind: 'default', value: null, raw: 'default' });
          }
          case 'checked': case 'unchecked': {
            this.next(); this.expect('(');
            const expr = this.parseExpr();
            this.expect(')');
            return this.node('CheckedExpr', s, { kind: t.v, expr });
          }
          case 'delegate': {
            this.next();
            let params = null;
            if (this.isOp('(')) params = this.parseParamList('(', ')');
            const body = this.parseBlock();
            return this.node('Lambda', s, { params: params || [], body, isAsync: false, isStatic: false, anonymous: true });
          }
          case 'stackalloc': {
            this.next();
            let type = null; let size = null; let init = null;
            if (this.isOp('[')) { this.next(); this.expect(']'); } else {
              type = this.parseType({ noArray: true, decl: true });
              this.expect('[');
              if (!this.isOp(']')) size = this.parseExpr();
              this.expect(']');
            }
            if (this.isOp('{')) init = this.parseInitList('ArrayInit');
            return this.node('Stackalloc', s, { type, size, init });
          }
          case 'throw': return this.parseThrowExpr();
          default:
            if (PREDEFINED.has(t.v)) {
              this.next();
              return this.node('PredefType', s, { name: t.v });
            }
        }
        break;
      case 'op':
        if (t.v === '(') return this.parseParenOrTuple();
        if (t.v === '[') {
          // collection expression
          this.next();
          const elems = [];
          while (!this.isOp(']') && this.cur.t !== 'eof') {
            if (this.isOp('..')) { const ss = this.next(); const e = this.parseExpr(); elems.push(this.node('Spread', ss, { expr: e })); } else elems.push(this.parseExpr());
            if (!this.eat(',')) break;
          }
          this.expect(']');
          return this.node('Collection', s, { elems });
        }
        break;
      case 'id': {
        if (t.v === 'from' && this.isQueryStart()) return this.parseQuery();
        this.next();
        if (this.isOp('::')) {
          this.next();
          const id = this.ident();
          return this.node('Name', s, { name: id.v, alias: t.v, typeArgs: null });
        }
        if (this.isOp('<')) {
          const ta = this.parseTypeArgs(false);
          if (ta) return this.node('Name', s, { name: t.v, typeArgs: ta });
        }
        return this.node('Name', s, { name: t.v, typeArgs: null });
      }
      default: break;
    }
    this.fail(`unexpected '${t.v}'`);
    return null;
  }

  parseInterpolated(t) {
    const parts = [];
    let prev = 0;
    const value = t.value;
    for (const h of t.holes) {
      if (h.at > prev) parts.push({ k: 'InterpText', text: value.slice(prev, h.at), line: t.line, col: t.col });
      prev = h.at + 1;
      let expr = null;
      try {
        const sub = this.src.slice(h.pos, h.end);
        expr = parseSubExpr(sub, h, this.src);
      } catch {
        expr = null;
      }
      let align = null;
      if (h.alignPos >= 0) {
        const alEnd = h.fmt != null ? this.src.indexOf(':', h.alignPos) : -1;
        align = this.src.slice(h.alignPos + 1, alEnd > 0 ? alEnd : h.alignPos + 12).replace(/[}"].*$/s, '').trim();
      }
      parts.push({ k: 'Interp', expr, align, fmt: h.fmt, line: h.line, col: h.col });
    }
    if (prev < value.length) parts.push({ k: 'InterpText', text: value.slice(prev), line: t.line, col: t.col });
    return this.node('InterpString', t, { parts, raw: t.v, sk: t.sk });
  }

  isQueryStart() {
    const a = this.peek(1); const b = this.peek(2); const c = this.peek(3);
    if (!(a.t === 'id' || (a.t === 'kw' && PREDEFINED.has(a.v)))) return false;
    if (b.t === 'kw' && b.v === 'in') return true;
    if (b.t === 'id' && c.t === 'kw' && c.v === 'in') return true;
    if (b.t === 'op' && (b.v === '<' || b.v === '.' || b.v === '[' || b.v === '?')) {
      // from T<x> y in ...
      for (let k = 2; k < 12; k++) { const x = this.peek(k); if (x.t === 'kw' && x.v === 'in') return true; if (x.t === 'op' && (x.v === ';' || x.v === '{' || x.v === '=')) return false; }
    }
    return false;
  }

  parseQuery() {
    const s = this.cur;
    const clauses = [];
    const fromClause = (kw) => {
      const st = this.next();
      let type = null;
      if (!(this.isId() && this.isKw('in', this.peek()))) type = this.parseType({ decl: true });
      const id = this.ident();
      this.expect('in');
      const expr = this.parseExpr();
      return this.node(kw === 'join' ? 'QJoin' : 'QFrom', st, { type, name: id.v, nameLine: id.line, nameCol: id.col, expr });
    };
    clauses.push(fromClause('from'));
    for (;;) {
      const t = this.cur;
      if (this.isCtx('from')) { clauses.push(fromClause('from')); continue; }
      if (this.isCtx('let')) {
        this.next(); const id = this.ident(); this.expect('='); const expr = this.parseExpr();
        clauses.push(this.node('QLet', t, { name: id.v, nameLine: id.line, nameCol: id.col, expr })); continue;
      }
      if (this.isCtx('where')) { this.next(); const expr = this.parseExpr(); clauses.push(this.node('QWhere', t, { expr })); continue; }
      if (this.isCtx('join')) {
        const j = fromClause('join');
        if (!this.isCtx('on')) this.fail('expected on');
        this.next(); j.on = this.parseExpr();
        if (!this.isCtx('equals')) this.fail('expected equals');
        this.next(); j.equals = this.parseExpr();
        if (this.isCtx('into')) { this.next(); const id = this.ident(); j.into = id.v; j.intoLine = id.line; }
        clauses.push(j); continue;
      }
      if (this.isCtx('orderby')) {
        this.next();
        const keys = [];
        do {
          const e = this.parseExpr();
          let dir = 'asc';
          if (this.isCtx('ascending')) this.next(); else if (this.isCtx('descending')) { this.next(); dir = 'desc'; }
          keys.push({ k: 'QKey', expr: e, dir, line: e.line, col: e.col });
        } while (this.eat(','));
        clauses.push(this.node('QOrderBy', t, { keys })); continue;
      }
      if (this.isCtx('select')) { this.next(); const expr = this.parseExpr(); clauses.push(this.node('QSelect', t, { expr })); }
      else if (this.isCtx('group')) {
        this.next(); const expr = this.parseExpr();
        if (!this.isCtx('by')) this.fail('expected by');
        this.next(); const by = this.parseExpr();
        clauses.push(this.node('QGroup', t, { expr, by }));
      } else this.fail('bad query clause');
      if (this.isCtx('into')) {
        const it = this.next(); const id = this.ident();
        clauses.push(this.node('QInto', it, { name: id.v, nameLine: id.line, nameCol: id.col }));
        continue;
      }
      break;
    }
    return this.node('Query', s, { clauses });
  }

  parseParenOrTuple() {
    const s = this.expect('(');
    const afterOpen = this.i;
    const elems = [];
    for (;;) {
      const es = this.cur;
      let name = null;
      if (this.isId() && this.isOp(':', this.peek()) && !this.isOp('::', this.peek())) { name = this.next().v; this.next(); }
      let e = this.tryDeclExpr([',', ')']);
      if (!e) e = this.parseExpr();
      elems.push(this.node('TupleArg', es, { name, expr: e }));
      if (!this.eat(',')) break;
    }
    if (elems.length === 1 && elems[0].expr.k === 'DeclExpr' && !elems[0].name) {
      this.i = afterOpen;
      const e = this.parseExpr();
      this.expect(')');
      return this.node('Paren', s, { expr: e });
    }
    this.expect(')');
    if (elems.length === 1 && !elems[0].name) return this.node('Paren', s, { expr: elems[0].expr });
    return this.node('Tuple', s, { elems });
  }

  // `Type name` or `var (a, b)` declaration expression followed by one of `follow`
  tryDeclExpr(follow) {
    const s = this.cur;
    if (this.isCtx('var') && this.isOp('(', this.peek())) {
      const r = this.speculate(() => {
        this.next();
        const d = this.parseDesignation();
        if (!follow.some((f) => this.isOp(f))) throw new ParseError('x');
        return d;
      });
      if (r) return this.node('DeclExpr', s, { type: null, isVar: true, designation: r });
    }
    if (!(this.isId() || (this.cur.t === 'kw' && PREDEFINED.has(this.cur.v)) || this.isOp('('))) return null;
    return this.speculate(() => {
      const type = this.parseType({ decl: true, noPtr: true });
      if (!this.isId()) throw new ParseError('x');
      const id = this.next();
      if (!follow.some((f) => this.isOp(f))) throw new ParseError('x');
      const designation = { k: 'SingleDesignation', name: id.v, discard: id.v === '_', line: id.line, col: id.col };
      return this.node('DeclExpr', s, { type, isVar: type.name === 'var' && type.parts.length === 1, designation });
    });
  }

  parseNew() {
    const s = this.expect('new');
    const pm = this.isOp('(') ? this.match[this.i] : -1;
    const tupleArr = pm > 0 && this.toks[pm + 1] && this.toks[pm + 1].t === 'op' && this.toks[pm + 1].v === '[';
    if (this.isOp('(') && !tupleArr) {
      const args = this.parseArgList('(', ')');
      let init = null;
      if (this.isOp('{')) init = this.parseInitList('InitList');
      return this.node('New', s, { type: null, args, init, implicit: true });
    }
    if (this.isOp('[')) {
      this.next();
      while (this.eat(',')) { /* rank */ }
      this.expect(']');
      const init = this.parseInitList('ArrayInit');
      return this.node('ArrayNew', s, { type: null, sizes: [], init, implicitType: true });
    }
    if (this.isOp('{')) {
      // anonymous object
      this.next();
      const members = [];
      while (!this.isOp('}') && this.cur.t !== 'eof') {
        const ms = this.cur;
        let name = null;
        if (this.isId() && this.isOp('=', this.peek())) { name = this.next().v; this.next(); }
        const value = this.parseExpr();
        members.push(this.node('AnonMember', ms, { name, value }));
        if (!this.eat(',')) break;
      }
      this.expect('}');
      return this.node('AnonNew', s, { members });
    }
    const type = this.parseType({ noArray: true, decl: true, noPtr: true, inNew: true });
    if (this.isOp('[')) {
      // array creation
      const sizes = [];
      this.next();
      if (!this.isOp(']') && !this.isOp(',')) {
        do { sizes.push(this.parseExpr()); } while (this.eat(','));
      } else { while (this.eat(',')) { /* rank */ } }
      this.expect(']');
      let ranks = 1;
      while (this.isOp('[') && (this.isOp(']', this.peek()) || this.isOp(',', this.peek()))) { this.next(); while (this.eat(',')) { /* */ } this.expect(']'); ranks++; }
      let init = null;
      if (this.isOp('{')) init = this.parseInitList('ArrayInit');
      return this.node('ArrayNew', s, { type, sizes, init, ranks });
    }
    let args = null;
    if (this.isOp('(')) args = this.parseArgList('(', ')');
    let init = null;
    if (this.isOp('{')) init = this.parseInitList('InitList');
    if (!args && !init) this.fail('bad new');
    return this.node('New', s, { type, args: args || [], init, noParens: !args });
  }

  parseInitList(kind) {
    const s = this.expect('{');
    const items = [];
    while (!this.isOp('}') && this.cur.t !== 'eof') {
      const is = this.cur;
      if (this.isId() && this.isOp('=', this.peek())) {
        const id = this.next(); this.next();
        const value = this.isOp('{') ? this.parseInitList('InitList') : this.parseExpr();
        items.push(this.node('MemberInit', is, { name: id.v, value }));
      } else if (this.isOp('[') && kind === 'InitList' && this.indexInitAhead()) {
        const args = this.parseArgList('[', ']');
        this.expect('=');
        const value = this.isOp('{') ? this.parseInitList('InitList') : this.parseExpr();
        items.push(this.node('IndexInit', is, { args, value }));
      } else if (this.isOp('{')) {
        items.push(this.parseInitList(kind === 'ArrayInit' ? 'ArrayInit' : 'ElementInit'));
      } else {
        items.push(this.parseExpr());
      }
      if (!this.eat(',')) break;
    }
    this.expect('}');
    return this.node(kind, s, { items });
  }

  indexInitAhead() {
    const m = this.match[this.i];
    return m > 0 && this.toks[m + 1] && this.toks[m + 1].v === '=' && this.toks[m + 1].t === 'op';
  }

  parseArgList(open, close, attr) {
    this.expect(open);
    const args = [];
    while (!this.isOp(close) && this.cur.t !== 'eof') {
      const s = this.cur;
      let name = null;
      if ((this.isId() || (attr && this.cur.t === 'kw')) && this.isOp(':', this.peek()) && !this.isOp('::', this.peek())) { name = this.next().v; this.next(); }
      else if (attr && this.isId() && this.isOp('=', this.peek())) { name = this.next().v; this.next(); }
      let refKind = null;
      if (this.isKw('ref') || this.isKw('out') || this.isKw('in')) refKind = this.next().v;
      let expr = null;
      if (refKind === 'out') expr = this.tryDeclExpr([',', close]);
      if (!expr) expr = this.parseExpr();
      args.push(this.node('Arg', s, { name, refKind, expr, attrNamed: attr && name != null }));
      if (!this.eat(',')) break;
    }
    this.expect(close);
    return args;
  }

  parsePostfix(e) {
    const s = e;
    for (;;) {
      const t = this.cur;
      if (t.t !== 'op') break;
      if (t.v === '.' || t.v === '?.' || t.v === '->') {
        this.next();
        if (t.v === '?.' && this.isOp('[')) {
          const args = this.parseArgList('[', ']');
          e = this.nodeFrom('Element', s, { expr: e, args, cond: true });
          continue;
        }
        const nt = this.cur;
        let name;
        if (nt.t === 'id' || nt.t === 'kw') { this.next(); name = nt.v; } else this.fail('expected member name');
        let typeArgs = null;
        if (this.isOp('<')) typeArgs = this.parseTypeArgs(false);
        e = this.nodeFrom('Member', s, { expr: e, name, typeArgs, cond: t.v === '?.', arrow: t.v === '->', nameLine: nt.line, nameCol: nt.col });
        continue;
      }
      if (t.v === '(') {
        const args = this.parseArgList('(', ')');
        e = this.nodeFrom('Invocation', s, { expr: e, args });
        continue;
      }
      if (t.v === '[') {
        const args = this.parseArgList('[', ']');
        e = this.nodeFrom('Element', s, { expr: e, args, cond: false });
        continue;
      }
      if (t.v === '?' && this.isOp('.', this.peek())) {
        this.next(); this.next();
        const nt = this.cur;
        let name;
        if (nt.t === 'id' || nt.t === 'kw') { this.next(); name = nt.v; } else this.fail('expected member name');
        let typeArgs = null;
        if (this.isOp('<')) typeArgs = this.parseTypeArgs(false);
        e = this.nodeFrom('Member', s, { expr: e, name, typeArgs, cond: true, arrow: false, nameLine: nt.line, nameCol: nt.col });
        continue;
      }
      if (t.v === '?' && this.isOp('[', this.peek()) && this.adjacent(t, this.peek())) {
        this.next();
        const args = this.parseArgList('[', ']');
        e = this.nodeFrom('Element', s, { expr: e, args, cond: true });
        continue;
      }
      if (t.v === '++' || t.v === '--') {
        this.next();
        e = this.nodeFrom('Unary', s, { op: t.v, operand: e, postfix: true });
        continue;
      }
      if (t.v === '!') {
        const nx = this.peek();
        if (nx.t === 'op' && ['.', ';', ')', ',', ']', '[', '?', '}', ':', '=', '??', '(', '?.', '!'].includes(nx.v) || nx.t === 'eof' || (nx.t === 'kw' && (nx.v === 'is' || nx.v === 'as'))) {
          this.next();
          e = this.nodeFrom('SuppressNull', s, { expr: e });
          continue;
        }
      }
      break;
    }
    return e;
  }

  nodeFrom(k, startNode, props) {
    const last = this.toks[Math.max(this.i - 1, 0)];
    return Object.assign({ k, line: startNode.line, col: startNode.col, pos: startNode.pos, endLine: last.line, endCol: last.col + (last.end - last.pos), end: last.end }, props);
  }

  // ───────────────────────────────────────────── patterns
  parsePattern() { return this.parseOrPattern(); }

  parseOrPattern() {
    const s = this.cur;
    let l = this.parseAndPattern();
    while (this.isCtx('or') && this.patternFollows()) {
      this.next();
      const r = this.parseAndPattern();
      l = this.node('OrPattern', s, { left: l, right: r });
    }
    return l;
  }

  parseAndPattern() {
    const s = this.cur;
    let l = this.parseNotPattern();
    while (this.isCtx('and') && this.patternFollows()) {
      this.next();
      const r = this.parseNotPattern();
      l = this.node('AndPattern', s, { left: l, right: r });
    }
    return l;
  }

  patternFollows() {
    const nx = this.peek();
    if (nx.t === 'eof') return false;
    if (nx.t === 'op') return ['(', '[', '{', '<', '>', '<=', '-', '!', '..', '+'].includes(nx.v);
    return true;
  }

  parseNotPattern() {
    const s = this.cur;
    if (this.isCtx('not') && this.patternFollows()) {
      this.next();
      const p = this.parseNotPattern();
      return this.node('NotPattern', s, { pattern: p });
    }
    return this.parsePrimaryPattern();
  }

  parsePrimaryPattern() {
    const s = this.cur;
    const t = this.cur;
    if (t.t === 'op') {
      if (t.v === '(') {
        const castSave = this.i;
        const c = this.tryCast();
        if (c) {
          this.i = castSave;
          const expr = this.parseBinary(3);
          return this.node('ConstPattern', s, { expr });
        }
        this.next();
        const subs = [];
        while (!this.isOp(')') && this.cur.t !== 'eof') {
          let name = null;
          if (this.isId() && this.isOp(':', this.peek())) { name = this.next().v; this.next(); }
          subs.push({ k: 'SubPattern', name, pattern: this.parsePattern(), line: this.cur.line, col: this.cur.col });
          if (!this.eat(',')) break;
        }
        this.expect(')');
        if (subs.length === 1 && !subs[0].name && !this.isOp('{') && !(this.isId() && !this.isPatternKeyword())) {
          return subs[0].pattern;
        }
        return this.finishRecursive(s, null, subs);
      }
      if (t.v === '{') return this.finishRecursive(s, null, null);
      if (t.v === '[') {
        this.next();
        const items = [];
        while (!this.isOp(']') && this.cur.t !== 'eof') {
          items.push(this.parsePattern());
          if (!this.eat(',')) break;
        }
        this.expect(']');
        let name = null;
        if (this.isId() && !this.isPatternKeyword()) name = this.next().v;
        return this.node('ListPattern', s, { items, name });
      }
      if (t.v === '..') {
        this.next();
        let p = null;
        if (!this.isOp(',') && !this.isOp(']')) p = this.parsePattern();
        return this.node('SlicePattern', s, { pattern: p });
      }
      if (t.v === '<' || t.v === '<=' || t.v === '>') {
        let op = t.v;
        this.next();
        if (op === '>' && this.isOp('=') && this.adjacent(t, this.cur)) { this.next(); op = '>='; }
        const expr = this.parseBinary(8);
        return this.node('RelPattern', s, { op, expr });
      }
    }
    if (this.isCtx('var') && (this.isId(this.peek()) || this.isOp('(', this.peek()))) {
      this.next();
      const d = this.parseDesignation();
      return this.node('VarPattern', s, { designation: d });
    }
    if (this.isCtx('_') && !this.isOp('.', this.peek()) && !this.isOp('(', this.peek())) {
      this.next();
      return this.node('DiscardPattern', s);
    }
    // type-ish
    if (this.isId() || (t.t === 'kw' && PREDEFINED.has(t.v))) {
      const save = this.i;
      const type = this.speculate(() => this.parseType({ expr: true, noPtr: true }));
      if (type) {
        if (this.isId() && !this.isPatternKeyword()) {
          const id = this.next();
          return this.node('DeclPattern', s, { type, name: id.v, nameLine: id.line, nameCol: id.col });
        }
        if (this.isOp('(') && !type.predefined) {
          // positional pattern Point(x, y) - but could be a constant method call; treat as recursive
          const r = this.speculate(() => {
            this.next();
            const subs = [];
            while (!this.isOp(')') && this.cur.t !== 'eof') {
              let name = null;
              if (this.isId() && this.isOp(':', this.peek())) { name = this.next().v; this.next(); }
              subs.push({ k: 'SubPattern', name, pattern: this.parsePattern() });
              if (!this.eat(',')) break;
            }
            this.expect(')');
            return this.finishRecursive(s, type, subs);
          });
          if (r) return r;
          this.i = save;
        } else if (this.isOp('{')) {
          return this.finishRecursive(s, type, null);
        } else if (this.patternEnds()) {
          const ambiguous = !type.predefined && !type.args.length && !type.nullable && !type.ranks && !type.tuple;
          if (!ambiguous) return this.node('TypePattern', s, { type });
          // Name or A.B.C: could be a constant or a type
          return this.node('ConstPattern', s, { expr: typeToExpr(type), maybeType: true, type });
        }
        this.i = save;
      }
    }
    const expr = this.parseBinary(3);
    return this.node('ConstPattern', s, { expr });
  }

  isPatternKeyword() { return this.isCtx('and') || this.isCtx('or') || this.isCtx('when'); }

  patternEnds() {
    const t = this.cur;
    if (t.t === 'eof') return true;
    if (t.t === 'id') return ['and', 'or', 'when'].includes(t.v);
    if (t.t === 'op') return [')', ',', '=>', ':', '}', ']', ';', '&&', '||', '?'].includes(t.v);
    return false;
  }

  finishRecursive(s, type, positional) {
    let props = null;
    if (this.isOp('{')) {
      this.next();
      props = [];
      while (!this.isOp('}') && this.cur.t !== 'eof') {
        const ps = this.cur;
        let path = null;
        // name(.name)* ':'
        const save = this.i;
        const names = [];
        if (this.isId()) {
          names.push(this.next().v);
          while (this.isOp('.') && this.isId(this.peek())) { this.next(); names.push(this.next().v); }
          if (this.isOp(':')) { this.next(); path = names; } else this.i = save;
        }
        const pattern = this.parsePattern();
        props.push(this.node('PropPattern', ps, { path, pattern }));
        if (!this.eat(',')) break;
      }
      this.expect('}');
    }
    let name = null;
    if (this.isId() && !this.isPatternKeyword()) name = this.next().v;
    return this.node('RecursivePattern', s, { type, positional, props, name });
  }
}

function typeToExpr(t) {
  let e = null;
  for (const p of t.parts) {
    if (!e) e = { k: 'Name', name: p.name, typeArgs: p.args.length ? p.args : null, line: t.line, col: t.col, pos: t.pos, endLine: t.endLine, endCol: t.endCol, end: t.end };
    else e = { k: 'Member', expr: e, name: p.name, typeArgs: p.args.length ? p.args : null, cond: false, line: t.line, col: t.col, pos: t.pos, endLine: t.endLine, endCol: t.endCol, end: t.end };
  }
  return e;
}

function typeQual(t) {
  if (!t) return '';
  return t.qual || t.name || '';
}

function buildMatch(tokens) {
  const m = new Int32Array(tokens.length).fill(-1);
  const stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.t !== 'op') continue;
    if (t.v === '(' || t.v === '[' || t.v === '{') stack.push(i);
    else if (t.v === ')' || t.v === ']' || t.v === '}') {
      const want = t.v === ')' ? '(' : t.v === ']' ? '[' : '{';
      // pop to the matching opener (tolerate mismatches)
      let k = stack.length - 1;
      while (k >= 0 && tokens[stack[k]].v !== want) k--;
      if (k < 0) continue;
      const o = stack[k];
      stack.length = k;
      m[o] = i; m[i] = o;
    }
  }
  return m;
}

function parseSubExpr(sub, h, src) {
  const lx = lex(sub, { noPp: true });
  for (const tk of lx.tokens) {
    if (tk.line === 1) tk.col += h.col - 1;
    tk.line += h.line - 1;
    tk.pos += h.pos; tk.end += h.pos;
  }
  const p = new Parser(lx.tokens, src);
  const e = p.parseExpr();
  if (p.cur.t !== 'eof') return e;
  return e;
}

function parse(text) {
  const lx = lex(text);
  const p = new Parser(lx.tokens, text);
  let unit;
  try {
    unit = p.parseCompilationUnit();
  } catch (e) {
    if (e instanceof RangeError || e instanceof ParseError) {
      return { unit: null, lex: lx, errors: [String(e.message)], fatal: true };
    }
    throw e;
  }
  return { unit, lex: lx, errors: p.errors, fatal: false };
}

module.exports = { parse, Parser, ParseError, typeQual };
