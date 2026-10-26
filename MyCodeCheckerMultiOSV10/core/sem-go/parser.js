'use strict';

// Tolerant recursive-descent parser for Go 1.22 (generics included).
// Never throws: syntax errors are collected in `errors` and the parser
// resynchronises at the next statement / top-level declaration.
//
// Every node has k (kind), line, col, endLine, endCol, pos, end (offsets).
// Kinds:
//   File{pkg, imports[ImportSpec], decls[]}
//   FuncDecl{name, recv[Field]|null, tparams[Field], params[Field], results[Field], body}
//   GenDecl{kw, specs[]}  VarSpec{kw, names[Ident], type, values[]}  TypeSpec{name, tparams, type, alias}
//   ImportSpec{name, path}
//   Field{names[Ident], type, tag, embedded}
//   types: ArrayType{len, elt} MapType{key, val} ChanType{dir, elt} FuncType{params, results}
//          StructType{fields} InterfaceType{elems} Ellipsis{elt}
//   exprs: Ident{name} BasicLit{kind, value, s} CompositeLit{type, elts} KeyValue{key, value}
//          FuncLit{type, body} Paren{x} Selector{x, sel} Index{x, indices} Slice{x, lo, hi, max, three}
//          TypeAssert{x, type} Call{fun, args, ellipsis} Star{x} Unary{op, x} Binary{op, x, y} Bad{}
//   stmts: Block{stmts} ExprStmt{x} Assign{lhs, op, rhs} IncDec{x, op} Send{ch, val} DeclStmt{decl}
//          Go{call} Defer{call} Return{results} Branch{tok, label} Labeled{label, stmt}
//          If{init, cond, then, els} For{init, cond, post, body} Range{key, value, tok, x, body}
//          Switch{init, tag, cases[Case]} TypeSwitch{init, bind, x, cases[Case]}
//          Select{cases[Comm]} Case{list|null, body[]} Comm{comm|null, body[]} Empty{}

const { lex } = require('./lexer');

const PREC = {
  '||': 1, '&&': 2,
  '==': 3, '!=': 3, '<': 3, '<=': 3, '>': 3, '>=': 3,
  '+': 4, '-': 4, '|': 4, '^': 4,
  '*': 5, '/': 5, '%': 5, '<<': 5, '>>': 5, '&': 5, '&^': 5,
};
const ASSIGN_OPS = new Set(['=', ':=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '&^=']);
const TOP_KW = new Set(['func', 'var', 'const', 'type', 'import']);
const MAX_ERRORS = 300;
const MAX_DEPTH = 400;

class Parser {
  constructor(src) {
    this.src = String(src || '');
    const { tokens, comments } = lex(this.src);
    this.toks = tokens;
    this.comments = comments;
    this.i = 0;
    this.errors = [];
    this.exprLev = 0;
    this.depth = 0;
    this.nodes = 0;
  }

  get tok() { return this.toks[this.i]; }
  peek(o = 1) { return this.toks[Math.min(this.i + o, this.toks.length - 1)]; }
  get prev() { return this.toks[Math.max(0, this.i - 1)]; }
  is(v, t) { const k = this.tok; return k.v === v && (t ? k.t === t : (k.t === 'op' || k.t === 'kw')); }
  isAt(o, v) { const k = this.peek(o); return k.v === v && (k.t === 'op' || k.t === 'kw'); }
  eof() { return this.tok.t === 'eof'; }
  next() { const k = this.tok; if (k.t !== 'eof') this.i++; return k; }
  eat(v) { if (this.is(v)) { return this.next(); } return null; }
  err(msg, tok) {
    const k = tok || this.tok;
    if (this.errors.length < MAX_ERRORS) this.errors.push({ line: k.line, col: k.col, msg });
    if (this.errors.length >= MAX_ERRORS) this.i = this.toks.length - 1;
  }
  expect(v) {
    if (this.is(v)) return this.next();
    this.err(`expected '${v}' found '${this.tok.v || this.tok.t}'`);
    return null;
  }
  // semicolon or closing token
  expectSemi() {
    if (this.is(';')) { this.next(); return; }
    if (this.is(')') || this.is('}') || this.eof()) return;
    this.err(`expected ';' found '${this.tok.v}'`);
  }
  node(k, start, props) {
    const s = start || this.tok;
    const e = this.prev;
    this.nodes++;
    const n = { k, line: s.line, col: s.col, pos: s.pos };
    if (props) Object.assign(n, props);
    const endTok = this.i > 0 && e.pos >= s.pos ? e : s;
    n.endLine = endTok.endLine; n.endCol = endTok.endCol; n.end = endTok.end;
    return n;
  }
  ident() {
    const s = this.tok;
    if (s.t === 'id') { this.next(); return this.node('Ident', s, { name: s.v }); }
    this.err(`expected identifier found '${s.v || s.t}'`);
    return this.node('Ident', s, { name: '_', bad: true });
  }

  // ── file / declarations ──
  parseFile() {
    const start = this.tok;
    const file = { k: 'File', pkg: null, imports: [], decls: [], line: 1, col: 1, pos: 0 };
    while (this.is(';')) this.next();
    if (this.is('package')) {
      this.next();
      file.pkg = this.ident();
      this.expectSemi();
    }
    while (!this.eof()) {
      const at = this.i;
      if (this.is(';')) { this.next(); continue; }
      try {
        const d = this.parseTopDecl();
        if (d) {
          file.decls.push(d);
          if (d.k === 'GenDecl' && d.kw === 'import') file.imports.push(...d.specs);
        }
      } catch (e) {
        if (!(e instanceof DepthError)) throw e;
        this.err('nesting too deep');
        this.depth = 0;
        this.exprLev = 0;
      }
      if (!this.eof() && !this.is(';') && !this.is('func')) {
        this.err(`unexpected '${this.tok.v}' after declaration`);
        this.syncTop();
      } else if (this.is(';')) this.next();
      if (this.i === at) { this.next(); this.syncTop(); }
    }
    file.endLine = this.tok.line; file.endCol = this.tok.col; file.end = this.src.length;
    void start;
    return file;
  }
  syncTop() {
    while (!this.eof()) {
      const k = this.tok;
      if (k.t === 'kw' && TOP_KW.has(k.v) && k.col === 1) return;
      this.next();
    }
  }
  parseTopDecl() {
    const k = this.tok;
    if (k.t === 'kw' && k.v === 'func') return this.parseFuncDecl();
    if (k.t === 'kw' && (k.v === 'var' || k.v === 'const' || k.v === 'type' || k.v === 'import')) return this.parseGenDecl();
    this.err(`unexpected '${k.v || k.t}' at top level`);
    this.next();
    this.syncTop();
    return null;
  }
  parseGenDecl() {
    const start = this.next();
    const kw = start.v;
    const specs = [];
    let grouped = false;
    if (this.is('(')) {
      grouped = true;
      this.next();
      while (!this.is(')') && !this.eof()) {
        const at = this.i;
        if (this.is(';')) { this.next(); continue; }
        const s = this.parseSpec(kw, specs);
        if (s) specs.push(s);
        this.expectSemi();
        if (this.i === at) this.next();
      }
      this.expect(')');
    } else {
      const s = this.parseSpec(kw, specs);
      if (s) specs.push(s);
    }
    return this.node('GenDecl', start, { kw, specs, grouped });
  }
  parseSpec(kw, prevSpecs) {
    const start = this.tok;
    if (kw === 'import') {
      let name = null;
      if (this.tok.t === 'id') name = this.ident();
      else if (this.is('.')) { const t = this.next(); name = this.node('Ident', t, { name: '.' }); }
      if (this.tok.t !== 'str') { this.err('expected import path'); return null; }
      const p = this.next();
      return this.node('ImportSpec', start, { name, path: p.s });
    }
    if (kw === 'type') {
      const name = this.ident();
      let tparams = [];
      if (this.is('[') && this.looksLikeTypeParams()) tparams = this.parseTypeParams();
      const alias = !!this.eat('=');
      const type = this.parseType();
      return this.node('TypeSpec', start, { name, tparams, type, alias });
    }
    const names = [this.ident()];
    while (this.eat(',')) names.push(this.ident());
    let type = null;
    let values = [];
    if (!this.is('=') && !this.is(';') && !this.is(')')) type = this.parseType();
    if (this.eat('=')) values = this.parseExprList();
    const spec = this.node('VarSpec', start, { kw, names, type, values });
    if (kw === 'const' && !type && !values.length && prevSpecs.length) {
      const p = prevSpecs[prevSpecs.length - 1];
      spec.type = p.type; spec.implicit = p.implicit || p;
    }
    return spec;
  }
  // `type A[T any] ...` versus `type A [N]int`
  looksLikeTypeParams() {
    const a = this.peek(1);
    const b = this.peek(2);
    if (a.t !== 'id') return false;
    if (b.v === ']') return false;
    if (b.t === 'id' || b.v === ',' || b.v === '*' || b.v === '~' || b.v === '[' || b.v === 'interface' || b.v === 'func' || b.v === 'map' || b.v === 'chan' || b.v === '(') {
      if (b.v === '*' || b.v === '(' || b.v === '[') return this.peek(3).t === 'id' || this.peek(3).v === ']';
      return true;
    }
    return false;
  }
  parseFuncDecl() {
    const start = this.next();
    let recv = null;
    if (this.is('(')) recv = this.parseParams(false);
    const name = this.ident();
    let tparams = [];
    if (this.is('[')) tparams = this.parseTypeParams();
    const params = this.parseParams(false);
    const results = this.parseResults();
    let body = null;
    if (this.is('{')) {
      const lev = this.exprLev;
      this.exprLev = 0;
      body = this.parseBlock();
      this.exprLev = lev;
    }
    return this.node('FuncDecl', start, { name, recv, tparams, params, results, body, nameLine: name.line, nameCol: name.col });
  }
  parseTypeParams() {
    this.expect('[');
    const fields = this.parseFieldGroups(']', true);
    this.expect(']');
    return fields;
  }
  parseParams(tparam) {
    if (!this.expect('(')) return [];
    const fields = this.parseFieldGroups(')', tparam);
    this.expect(')');
    return fields;
  }
  // parameter lists: (a, b int, c ...string) or (int, string)
  parseFieldGroups(close, tparam) {
    const items = [];
    while (!this.is(close) && !this.eof()) {
      const at = this.i;
      const s = this.tok;
      let x = tparam ? this.parseConstraint() : this.parseParamType();
      let type = null;
      if (!this.is(',') && !this.is(close) && !this.eof()) type = tparam ? this.parseConstraint() : this.parseParamType();
      items.push({ x, type, start: s });
      if (!this.eat(',')) break;
      while (this.is(';')) this.next();
      if (this.i === at) { this.next(); break; }
      void x;
    }
    while (this.is(';')) this.next();
    const named = items.some((it) => it.type);
    const out = [];
    if (!named) {
      for (const it of items) out.push({ k: 'Field', names: [], type: it.x, line: it.x.line, col: it.x.col, pos: it.x.pos, endLine: it.x.endLine, endCol: it.x.endCol, end: it.x.end });
      return out;
    }
    let pending = [];
    for (const it of items) {
      if (!it.type) {
        if (it.x.k === 'Ident') pending.push(it.x);
        else { this.err('mixed named and unnamed parameters', it.start); pending.push({ k: 'Ident', name: '_', line: it.x.line, col: it.x.col, pos: it.x.pos, endLine: it.x.endLine, endCol: it.x.endCol, end: it.x.end }); }
        continue;
      }
      const name = it.x.k === 'Ident' ? it.x : { k: 'Ident', name: '_', line: it.x.line, col: it.x.col, pos: it.x.pos, end: it.x.end, endLine: it.x.endLine, endCol: it.x.endCol };
      const names = pending.concat([name]);
      for (const nm of names) {
        out.push({ k: 'Field', names: [nm], type: it.type, line: nm.line, col: nm.col, pos: nm.pos, endLine: it.type.endLine, endCol: it.type.endCol, end: it.type.end, group: names.length > 1 });
      }
      pending = [];
    }
    for (const nm of pending) out.push({ k: 'Field', names: [nm], type: { k: 'Bad', line: nm.line, col: nm.col, pos: nm.pos, end: nm.end }, line: nm.line, col: nm.col, pos: nm.pos, end: nm.end, endLine: nm.endLine, endCol: nm.endCol });
    return out;
  }
  parseParamType() {
    const s = this.tok;
    if (this.is('...')) {
      this.next();
      const elt = this.parseType();
      return this.node('Ellipsis', s, { elt });
    }
    // `name [N]T` must not be read as instantiation `name[N]`
    if (s.t === 'id' && this.isAt(1, '[') && this.arrayAfterName()) {
      return this.ident();
    }
    return this.parseType();
  }
  // At `id [`: true when the matching ']' is followed by a type start.
  arrayAfterName() {
    let j = this.i + 1;
    let depth = 0;
    for (; j < this.toks.length; j++) {
      const t = this.toks[j];
      if (t.t === 'eof') return false;
      if (t.v === '[' && t.t === 'op') depth++;
      else if (t.v === ']' && t.t === 'op') { depth--; if (depth === 0) break; }
    }
    const nx = this.toks[j + 1];
    if (!nx) return false;
    return nx.t === 'id' || (nx.t === 'op' && ['*', '[', '(', '<-'].includes(nx.v)) || (nx.t === 'kw' && ['map', 'chan', 'func', 'struct', 'interface'].includes(nx.v));
  }
  parseConstraint() {
    const s = this.tok;
    let x = this.parseConstraintTerm();
    while (this.is('|')) {
      this.next();
      const y = this.parseConstraintTerm();
      x = this.node('Binary', s, { op: '|', x, y });
    }
    return x;
  }
  parseConstraintTerm() {
    const s = this.tok;
    if (this.is('~')) { this.next(); const x = this.parseType(); return this.node('Unary', s, { op: '~', x }); }
    return this.parseType();
  }
  parseResults() {
    if (this.is('(')) return this.parseParams(false);
    if (this.startsType()) {
      const t = this.parseType();
      return [{ k: 'Field', names: [], type: t, line: t.line, col: t.col, pos: t.pos, end: t.end, endLine: t.endLine, endCol: t.endCol }];
    }
    return [];
  }
  startsType() {
    const k = this.tok;
    if (k.t === 'id') return true;
    if (k.t === 'op') return k.v === '*' || k.v === '[' || k.v === '(' || k.v === '<-';
    if (k.t === 'kw') return k.v === 'map' || k.v === 'chan' || k.v === 'func' || k.v === 'struct' || k.v === 'interface';
    return false;
  }

  // ── types ──
  enter() { if (++this.depth > MAX_DEPTH) throw new DepthError(); }
  leave() { this.depth--; }
  parseType() {
    this.enter();
    try { return this.parseTypeInner(); } finally { this.leave(); }
  }
  parseTypeInner() {
    const s = this.tok;
    if (s.t === 'id') {
      let x = this.ident();
      if (this.is('.') && this.peek(1).t === 'id') {
        this.next();
        const sel = this.ident();
        x = this.node('Selector', s, { x, sel });
      }
      if (this.is('[') && !this.isAt(1, ']')) {
        this.next();
        const lev = this.exprLev; this.exprLev++;
        const indices = [this.parseTypeOrExpr()];
        while (this.eat(',')) { if (this.is(']')) break; indices.push(this.parseTypeOrExpr()); }
        this.exprLev = lev;
        this.expect(']');
        x = this.node('Index', s, { x, indices });
      }
      return x;
    }
    if (s.t === 'op') {
      if (s.v === '*') { this.next(); const x = this.parseType(); return this.node('Star', s, { x }); }
      if (s.v === '[') return this.parseArrayType();
      if (s.v === '(') { this.next(); const x = this.parseType(); this.expect(')'); return this.node('Paren', s, { x }); }
      if (s.v === '<-') {
        this.next();
        if (!this.expect('chan')) return this.node('Bad', s);
        const elt = this.parseType();
        return this.node('ChanType', s, { dir: 'recv', elt });
      }
      if (s.v === '...') { this.next(); const elt = this.parseType(); return this.node('Ellipsis', s, { elt }); }
    }
    if (s.t === 'kw') {
      switch (s.v) {
        case 'map': return this.parseMapType();
        case 'chan': return this.parseChanType();
        case 'func': { this.next(); return this.parseSignature(s); }
        case 'struct': return this.parseStructType();
        case 'interface': return this.parseInterfaceType();
        default: break;
      }
    }
    this.err(`expected type found '${s.v || s.t}'`);
    if (!this.is(';') && !this.is(')') && !this.is('}') && !this.is(',') && !this.is(']') && !this.is('{')) this.next();
    return this.node('Bad', s);
  }
  parseTypeOrExpr() { return this.parseExpr(); }
  parseArrayType() {
    const s = this.next();
    let len = null;
    if (this.is('...')) { this.next(); len = this.node('Ellipsis', s, { elt: null }); } else if (!this.is(']')) {
      const lev = this.exprLev; this.exprLev++;
      len = this.parseExpr();
      this.exprLev = lev;
    }
    this.expect(']');
    const elt = this.parseType();
    return this.node('ArrayType', s, { len, elt });
  }
  parseMapType() {
    const s = this.next();
    this.expect('[');
    const key = this.parseType();
    this.expect(']');
    const val = this.parseType();
    return this.node('MapType', s, { key, val });
  }
  parseChanType() {
    const s = this.next();
    let dir = 'both';
    if (this.is('<-')) { this.next(); dir = 'send'; }
    const elt = this.parseType();
    return this.node('ChanType', s, { dir, elt });
  }
  parseSignature(s) {
    let tparams = [];
    if (this.is('[')) tparams = this.parseTypeParams();
    const params = this.parseParams(false);
    const results = this.parseResults();
    return this.node('FuncType', s, { params, results, tparams });
  }
  parseStructType() {
    const s = this.next();
    const fields = [];
    if (!this.expect('{')) return this.node('StructType', s, { fields });
    while (!this.is('}') && !this.eof()) {
      const at = this.i;
      if (this.is(';')) { this.next(); continue; }
      const f = this.parseStructField();
      if (f) fields.push(f);
      this.expectSemi();
      if (this.i === at) this.next();
    }
    this.expect('}');
    return this.node('StructType', s, { fields });
  }
  parseStructField() {
    const s = this.tok;
    let names = [];
    let type;
    let embedded = false;
    if (s.t === 'id') {
      const n1 = this.peek(1);
      const embeddedNext = n1.v === ';' || n1.v === '}' || n1.t === 'str' || n1.v === '.' || (n1.v === '[' && n1.t === 'op' && !this.arrayAfterName());
      if (embeddedNext) {
        type = this.parseType();
        embedded = true;
      } else {
        names.push(this.ident());
        while (this.eat(',')) names.push(this.ident());
        type = this.parseType();
      }
    } else if (this.is('*')) {
      type = this.parseType();
      embedded = true;
    } else {
      this.err(`unexpected '${s.v}' in struct`);
      this.next();
      return null;
    }
    let tag = null;
    if (this.tok.t === 'str') { const t = this.next(); tag = { raw: t.raw, s: t.s, line: t.line, col: t.col }; }
    return this.node('Field', s, { names, type, tag, embedded });
  }
  parseInterfaceType() {
    const s = this.next();
    const elems = [];
    if (!this.expect('{')) return this.node('InterfaceType', s, { elems });
    while (!this.is('}') && !this.eof()) {
      const at = this.i;
      if (this.is(';')) { this.next(); continue; }
      const es = this.tok;
      if (es.t === 'id' && this.isAt(1, '(')) {
        const name = this.ident();
        const ft = this.parseSignature(es);
        elems.push(this.node('Field', es, { names: [name], type: ft }));
      } else {
        const t = this.parseConstraint();
        elems.push(this.node('Field', es, { names: [], type: t, embedded: true }));
      }
      this.expectSemi();
      if (this.i === at) this.next();
    }
    this.expect('}');
    return this.node('InterfaceType', s, { elems });
  }

  // ── expressions ──
  parseExprList() {
    const out = [this.parseExpr()];
    while (this.is(',')) { this.next(); out.push(this.parseExpr()); }
    return out;
  }
  parseExpr() {
    this.enter();
    try { return this.parseBinary(1); } finally { this.leave(); }
  }
  parseBinary(minPrec) {
    const s = this.tok;
    let x = this.parseUnary();
    for (;;) {
      const k = this.tok;
      const p = k.t === 'op' ? PREC[k.v] : undefined;
      if (!p || p < minPrec) return x;
      this.next();
      const y = this.parseBinary(p + 1);
      x = this.node('Binary', s, { op: k.v, x, y, opLine: k.line, opCol: k.col });
    }
  }
  parseUnary() {
    const s = this.tok;
    if (s.t === 'op') {
      switch (s.v) {
        case '+': case '-': case '!': case '^': case '&': case '~': {
          this.next();
          this.enter();
          let x;
          try { x = this.parseUnary(); } finally { this.leave(); }
          return this.node('Unary', s, { op: s.v, x });
        }
        case '<-': {
          this.next();
          this.enter();
          let x;
          try { x = this.parseUnary(); } finally { this.leave(); }
          if (x.k === 'ChanType') {
            return this.node('ChanType', s, { dir: 'recv', elt: x.elt });
          }
          return this.node('Unary', s, { op: '<-', x });
        }
        case '*': {
          this.next();
          this.enter();
          let x;
          try { x = this.parseUnary(); } finally { this.leave(); }
          return this.node('Star', s, { x });
        }
        default: break;
      }
    }
    return this.parsePrimary();
  }
  parseOperand() {
    const s = this.tok;
    switch (s.t) {
      case 'id': return this.ident();
      case 'int': case 'float': case 'imag': case 'char': case 'str':
        this.next();
        return this.node('BasicLit', s, { kind: s.t === 'str' ? 'string' : s.t, value: s.v, s: s.s, rawString: !!s.rawString });
      case 'op':
        if (s.v === '(') {
          this.next();
          const lev = this.exprLev; this.exprLev++;
          const x = this.parseExprOrTypeInParen();
          this.exprLev = lev;
          this.expect(')');
          return this.node('Paren', s, { x });
        }
        if (s.v === '[') return this.parseArrayType();
        break;
      case 'kw':
        if (s.v === 'func') {
          this.next();
          const type = this.parseSignature(s);
          if (this.is('{')) {
            const lev = this.exprLev; this.exprLev = 0;
            const body = this.parseBlock();
            this.exprLev = lev;
            return this.node('FuncLit', s, { type, body });
          }
          return type;
        }
        if (s.v === 'map' || s.v === 'chan' || s.v === 'struct' || s.v === 'interface') return this.parseType();
        break;
      default: break;
    }
    this.err(`expected expression found '${s.v || s.t}'`);
    if (!this.is(';') && !this.is(')') && !this.is('}') && !this.is(']') && !this.is(',') && !this.is('{') && !this.eof()) this.next();
    return this.node('Bad', s);
  }
  parseExprOrTypeInParen() {
    // types such as (*T) or (chan int) parse as expressions too
    return this.parseExpr();
  }
  parsePrimary() {
    const s = this.tok;
    let x = this.parseOperand();
    for (let guard = 0; guard < 100000; guard++) {
      const k = this.tok;
      if (k.t !== 'op') return x;
      if (k.v === '.') {
        this.next();
        if (this.tok.t === 'id') {
          const sel = this.ident();
          x = this.node('Selector', s, { x, sel });
        } else if (this.is('(')) {
          this.next();
          let type = null;
          if (this.is('type')) this.next(); else type = this.parseType();
          this.expect(')');
          x = this.node('TypeAssert', s, { x, type });
        } else {
          this.err(`expected selector found '${this.tok.v}'`);
          return x;
        }
        continue;
      }
      if (k.v === '[') {
        this.next();
        const lev = this.exprLev; this.exprLev++;
        let lo = null;
        if (!this.is(':')) lo = this.parseExpr();
        if (this.is(':')) {
          this.next();
          let hi = null;
          let max = null;
          let three = false;
          if (!this.is(']') && !this.is(':')) hi = this.parseExpr();
          if (this.is(':')) { this.next(); three = true; max = this.parseExpr(); }
          this.exprLev = lev;
          this.expect(']');
          x = this.node('Slice', s, { x, lo, hi, max, three });
          continue;
        }
        const indices = [lo];
        while (this.eat(',')) { if (this.is(']')) break; indices.push(this.parseExpr()); }
        this.exprLev = lev;
        this.expect(']');
        x = this.node('Index', s, { x, indices });
        continue;
      }
      if (k.v === '(') {
        this.next();
        const lev = this.exprLev; this.exprLev++;
        const args = [];
        let ellipsis = false;
        while (!this.is(')') && !this.eof()) {
          const at = this.i;
          args.push(this.parseExpr());
          if (this.is('...')) { this.next(); ellipsis = true; }
          if (!this.eat(',')) break;
          while (this.is(';')) this.next();
          if (this.i === at) break;
        }
        while (this.is(';')) this.next();
        this.exprLev = lev;
        this.expect(')');
        x = this.node('Call', s, { fun: x, args, ellipsis });
        continue;
      }
      if (k.v === '{') {
        if (isLiteralType(x) && (this.exprLev >= 0 || !isTypeName(x))) {
          x = this.parseCompositeLit(x, s);
          continue;
        }
        return x;
      }
      return x;
    }
    return x;
  }
  parseCompositeLit(type, s) {
    this.next();
    const lev = this.exprLev; this.exprLev++;
    const elts = [];
    while (!this.is('}') && !this.eof()) {
      const at = this.i;
      if (this.is(';')) { this.next(); continue; }
      elts.push(this.parseElement());
      if (!this.eat(',')) { while (this.is(';')) this.next(); break; }
      if (this.i === at) { this.next(); }
    }
    this.exprLev = lev;
    this.expect('}');
    return this.node('CompositeLit', s || type, { type, elts });
  }
  parseElement() {
    const s = this.tok;
    let x = this.is('{') ? this.parseCompositeLit(null, s) : this.parseExpr();
    if (this.is(':')) {
      this.next();
      const v = this.is('{') ? this.parseCompositeLit(null, this.tok) : this.parseExpr();
      x = this.node('KeyValue', s, { key: x, value: v });
    }
    return x;
  }

  // ── statements ──
  parseBlock() {
    const s = this.tok;
    if (!this.expect('{')) return this.node('Block', s, { stmts: [], bad: true });
    const stmts = this.parseStmtList();
    this.expect('}');
    return this.node('Block', s, { stmts });
  }
  parseStmtList() {
    const out = [];
    while (!this.is('}') && !this.is('case') && !this.is('default') && !this.eof()) {
      const at = this.i;
      if (this.is(';')) { this.next(); continue; }
      // a declaration keyword in column 1 means the enclosing function lost its '}'
      if (this.tok.t === 'kw' && this.tok.col === 1 && (this.tok.v === 'func' || this.tok.v === 'import' || this.tok.v === 'type')) break;
      let st = null;
      try {
        st = this.parseStmt();
      } catch (e) {
        if (!(e instanceof DepthError)) throw e;
        this.err('nesting too deep');
        this.depth = 0;
      }
      if (st) out.push(st);
      if (this.is(';')) this.next();
      else if (!this.is('}') && !this.is('case') && !this.is('default') && !this.eof()) {
        this.err(`expected ';' found '${this.tok.v}'`);
        this.syncStmt();
      }
      if (this.i === at) { this.next(); }
    }
    return out;
  }
  syncStmt() {
    let depth = 0;
    while (!this.eof()) {
      const k = this.tok;
      if (k.t === 'op') {
        if (k.v === '(' || k.v === '[' || k.v === '{') depth++;
        else if (k.v === ')' || k.v === ']' || k.v === '}') { if (depth === 0) return; depth--; }
        else if (k.v === ';' && depth === 0) { this.next(); return; }
      }
      if (k.t === 'kw' && TOP_KW.has(k.v) && k.col === 1 && k.v !== 'var' && k.v !== 'const' && k.v !== 'type') return;
      this.next();
    }
  }
  parseStmt() {
    const s = this.tok;
    if (s.t === 'kw') {
      switch (s.v) {
        case 'var': case 'const': case 'type': {
          const decl = this.parseGenDecl();
          return this.node('DeclStmt', s, { decl });
        }
        case 'go': case 'defer': {
          this.next();
          const call = this.parseExpr();
          return this.node(s.v === 'go' ? 'Go' : 'Defer', s, { call });
        }
        case 'return': {
          this.next();
          const results = (this.is(';') || this.is('}')) ? [] : this.parseExprList();
          return this.node('Return', s, { results });
        }
        case 'break': case 'continue': case 'goto': case 'fallthrough': {
          this.next();
          let label = null;
          if (s.v !== 'fallthrough' && this.tok.t === 'id') label = this.ident();
          return this.node('Branch', s, { tok: s.v, label });
        }
        case 'if': return this.parseIf();
        case 'for': return this.parseFor();
        case 'switch': return this.parseSwitch();
        case 'select': return this.parseSelect();
        case 'func': case 'map': case 'chan': case 'struct': case 'interface':
          return this.parseSimpleStmt(false);
        default:
          this.err(`unexpected '${s.v}'`);
          this.next();
          return null;
      }
    }
    if (s.t === 'op') {
      if (s.v === '{') return this.parseBlock();
      if (s.v === ';') return this.node('Empty', s);
    }
    if (s.t === 'id' && this.isAt(1, ':')) {
      const label = this.ident();
      this.next();
      while (this.is(';') && this.tok.auto) this.next();
      let stmt = null;
      if (!this.is('}')) stmt = this.parseStmt();
      return this.node('Labeled', s, { label, stmt });
    }
    return this.parseSimpleStmt(false);
  }
  parseSimpleStmt(rangeOk) {
    const s = this.tok;
    if (rangeOk && this.is('range')) {
      this.next();
      const x = this.parseExpr();
      return this.node('Range', s, { key: null, value: null, tok: null, x });
    }
    const lhs = this.parseExprList();
    const k = this.tok;
    if (k.t === 'op' && ASSIGN_OPS.has(k.v)) {
      this.next();
      if (rangeOk && this.is('range') && (k.v === '=' || k.v === ':=')) {
        this.next();
        const x = this.parseExpr();
        return this.node('Range', s, { key: lhs[0] || null, value: lhs[1] || null, tok: k.v, x });
      }
      const rhs = this.parseExprList();
      return this.node('Assign', s, { lhs, op: k.v, rhs, opLine: k.line, opCol: k.col });
    }
    if (k.t === 'op' && (k.v === '++' || k.v === '--')) {
      this.next();
      return this.node('IncDec', s, { x: lhs[0], op: k.v });
    }
    if (k.t === 'op' && k.v === '<-') {
      this.next();
      const val = this.parseExpr();
      return this.node('Send', s, { ch: lhs[0], val });
    }
    if (lhs.length > 1) this.err('expected assignment');
    return this.node('ExprStmt', s, { x: lhs[0] });
  }
  parseIf() {
    const s = this.next();
    const lev = this.exprLev;
    this.exprLev = -1;
    let init = null;
    let cond = null;
    if (this.is('{')) {
      this.err('missing condition in if statement');
    } else {
      if (!this.is(';')) {
        const st = this.parseSimpleStmt(false);
        if (this.is(';')) { this.next(); init = st; if (!this.is('{')) cond = this.parseExpr(); } else cond = st.k === 'ExprStmt' ? st.x : st;
      } else {
        this.next();
        if (!this.is('{')) cond = this.parseExpr();
      }
    }
    this.exprLev = lev;
    const then = this.parseBlock();
    let els = null;
    if (this.is('else')) {
      this.next();
      if (this.is('if')) els = this.parseIf();
      else if (this.is('{')) els = this.parseBlock();
      else this.err('expected if or block after else');
    }
    return this.node('If', s, { init, cond, then, els });
  }
  parseFor() {
    const s = this.next();
    const lev = this.exprLev;
    this.exprLev = -1;
    let init = null;
    let cond = null;
    let post = null;
    let range = null;
    if (!this.is('{')) {
      let s1 = null;
      if (!this.is(';')) s1 = this.parseSimpleStmt(true);
      if (s1 && s1.k === 'Range') range = s1;
      else if (this.is(';')) {
        this.next();
        init = s1;
        if (!this.is(';')) cond = this.parseExpr();
        if (!this.is('{')) {
          this.expect(';');
          if (!this.is('{')) post = this.parseSimpleStmt(false);
        }
      } else if (s1) {
        cond = s1.k === 'ExprStmt' ? s1.x : s1;
      }
    }
    this.exprLev = lev;
    const body = this.parseBlock();
    if (range) {
      const n = this.node('Range', s, { key: range.key, value: range.value, tok: range.tok, x: range.x, body });
      return n;
    }
    return this.node('For', s, { init, cond, post, body });
  }
  parseSwitch() {
    const s = this.next();
    const lev = this.exprLev;
    this.exprLev = -1;
    let init = null;
    let tag = null;
    if (!this.is('{')) {
      let s1 = null;
      if (!this.is(';')) s1 = this.parseSimpleStmt(false);
      if (this.is(';')) {
        this.next();
        init = s1;
        if (!this.is('{')) tag = this.parseSimpleStmt(false);
      } else tag = s1;
    }
    this.exprLev = lev;
    let typeSwitch = null;
    if (tag && tag.k === 'ExprStmt' && tag.x.k === 'TypeAssert' && !tag.x.type) typeSwitch = { bind: null, x: tag.x.x };
    else if (tag && tag.k === 'Assign' && tag.op === ':=' && tag.lhs.length === 1 && tag.rhs.length === 1 && tag.rhs[0].k === 'TypeAssert' && !tag.rhs[0].type) typeSwitch = { bind: tag.lhs[0], x: tag.rhs[0].x };
    const cases = [];
    if (this.expect('{')) {
      while (!this.is('}') && !this.eof()) {
        const at = this.i;
        if (this.is(';')) { this.next(); continue; }
        const cs = this.tok;
        let list = null;
        if (this.is('case')) {
          this.next();
          list = typeSwitch ? this.parseTypeList() : this.parseExprList();
        } else if (this.is('default')) {
          this.next();
        } else {
          this.err(`expected case or default found '${this.tok.v}'`);
          this.syncStmt();
          if (this.i === at) this.next();
          continue;
        }
        this.expect(':');
        const body = this.parseStmtList();
        cases.push(this.node('Case', cs, { list, body }));
        if (this.i === at) this.next();
      }
      this.expect('}');
    }
    if (typeSwitch) return this.node('TypeSwitch', s, { init, bind: typeSwitch.bind, x: typeSwitch.x, cases, assign: tag });
    return this.node('Switch', s, { init, tag: tag ? (tag.k === 'ExprStmt' ? tag.x : tag) : null, cases });
  }
  parseTypeList() {
    const out = [this.parseType()];
    while (this.eat(',')) out.push(this.parseType());
    return out;
  }
  parseSelect() {
    const s = this.next();
    const cases = [];
    if (this.expect('{')) {
      while (!this.is('}') && !this.eof()) {
        const at = this.i;
        if (this.is(';')) { this.next(); continue; }
        const cs = this.tok;
        let comm = null;
        if (this.is('case')) { this.next(); comm = this.parseSimpleStmt(false); } else if (this.is('default')) this.next();
        else { this.err('expected case or default'); this.syncStmt(); if (this.i === at) this.next(); continue; }
        this.expect(':');
        const body = this.parseStmtList();
        cases.push(this.node('Comm', cs, { comm, body }));
        if (this.i === at) this.next();
      }
      this.expect('}');
    }
    return this.node('Select', s, { cases });
  }
}

class DepthError extends Error {}

function isTypeName(x) {
  return x.k === 'Ident' || (x.k === 'Selector' && x.x.k === 'Ident');
}
function isLiteralType(x) {
  switch (x.k) {
    case 'Ident': return x.name !== '_';
    case 'Selector': return x.x.k === 'Ident';
    case 'ArrayType': case 'MapType': case 'StructType': return true;
    case 'Index': return isTypeName(x.x);
    default: return false;
  }
}

function parseGo(src) {
  const p = new Parser(src);
  let file;
  try {
    file = p.parseFile();
  } catch (e) {
    if (process.env.SEMGO_DEBUG) throw e;
    p.err(`internal parser error: ${e && e.message}`);
    file = { k: 'File', pkg: null, imports: [], decls: [], line: 1, col: 1, pos: 0, end: p.src.length };
  }
  return { file, errors: p.errors, comments: p.comments, tokens: p.toks, src: p.src };
}

module.exports = { parseGo };
