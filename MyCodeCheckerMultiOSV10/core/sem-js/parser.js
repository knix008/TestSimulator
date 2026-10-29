'use strict';

// Recursive-descent parser for modern JavaScript and TypeScript (ES2024,
// JSX, TS types, generics, decorators, enums, namespaces, satisfies). It
// produces an ESTree / typescript-estree shaped tree with `start` / `end`
// offsets on every node. A syntax error throws ParseError; callers catch it.

const { Lexer, LexError } = require('./lexer');

class ParseError extends Error {
  constructor(message, pos) {
    super(message);
    this.pos = pos;
  }
}

const RESERVED = new Set(['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'return',
  'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'null', 'true', 'false', 'enum']);

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??=']);

const BIN_PREC = {
  '??': 1, '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5,
  '==': 6, '!=': 6, '===': 6, '!==': 6,
  '<': 7, '>': 7, '<=': 7, '>=': 7, instanceof: 7, in: 7,
  '<<': 8, '>>': 8, '>>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10, '**': 11,
};

const TS_KEYWORD_TYPES = {
  any: 'TSAnyKeyword', unknown: 'TSUnknownKeyword', number: 'TSNumberKeyword', bigint: 'TSBigIntKeyword',
  boolean: 'TSBooleanKeyword', string: 'TSStringKeyword', symbol: 'TSSymbolKeyword', object: 'TSObjectKeyword',
  never: 'TSNeverKeyword', void: 'TSVoidKeyword', undefined: 'TSUndefinedKeyword', null: 'TSNullKeyword',
  intrinsic: 'TSIntrinsicKeyword',
};

const CLASS_MODIFIERS = new Set(['static', 'public', 'private', 'protected', 'readonly', 'abstract', 'override', 'declare', 'accessor']);
const PARAM_MODIFIERS = new Set(['public', 'private', 'protected', 'readonly', 'override']);

class Parser {
  constructor(src, opts = {}) {
    this.src = src;
    this.ts = !!opts.ts;
    this.jsx = opts.jsx !== false;
    this.lex = new Lexer(src);
    this.prevEnd = 0;
    this.inFunction = false;
    this.inAsync = false;
    this.inGenerator = false;
    this.noArrowRT = false;
    this.inCondExtends = false;
    this.failed = new Set();
    this.tok = null;
    this.next();
  }

  // ---------------------------------------------------------------- tokens
  raise(msg, pos) {
    throw new ParseError(msg, pos == null ? (this.tok ? this.tok.start : 0) : pos);
  }
  next() {
    if (this.tok) this.prevEnd = this.tok.end;
    this.tok = this.lex.next();
  }
  is(v) { return this.tok.type === 'punct' && this.tok.value === v; }
  isName(v) { return this.tok.type === 'name' && this.tok.value === v && !this.tok.esc; }
  eat(v) { if (this.is(v)) { this.next(); return true; } return false; }
  eatName(v) { if (this.isName(v)) { this.next(); return true; } return false; }
  expect(v) { if (!this.eat(v)) this.raise(`Expected '${v}' but found '${this.tok.value}'`); }
  expectName(v) { if (!this.eatName(v)) this.raise(`Expected '${v}'`); }
  semicolon() {
    if (this.eat(';')) return;
    if (this.is('}') || this.tok.type === 'eof' || this.tok.nl) return;
    this.raise(`Unexpected token '${this.tok.value}'`);
  }
  snapshot() {
    return { pos: this.lex.pos, tok: this.tok, prevEnd: this.prevEnd, f: this.inFunction, a: this.inAsync, g: this.inGenerator, n: this.noArrowRT, c: this.inCondExtends };
  }
  restore(s) {
    this.lex.pos = s.pos;
    this.tok = s.tok;
    this.prevEnd = s.prevEnd;
    this.inFunction = s.f;
    this.inAsync = s.a;
    this.inGenerator = s.g;
    this.noArrowRT = s.n;
    this.inCondExtends = s.c;
  }
  peek() {
    const s = this.snapshot();
    this.next();
    const t = this.tok;
    this.restore(s);
    return t;
  }
  peek2() {
    const s = this.snapshot();
    this.next();
    const a = this.tok;
    this.next();
    const b = this.tok;
    this.restore(s);
    return [a, b];
  }
  tryParse(key, fn) {
    if (key && this.failed.has(key)) return null;
    const s = this.snapshot();
    try {
      return fn();
    } catch (err) {
      if (!(err instanceof ParseError) && !(err instanceof LexError)) throw err;
      this.restore(s);
      if (key) this.failed.add(key);
      return null;
    }
  }
  finish(node, start) {
    node.start = start;
    node.end = this.prevEnd;
    return node;
  }
  isIdentTok(t = this.tok) {
    return t.type === 'name' && (t.esc || !RESERVED.has(t.value));
  }
  ident(allowReserved) {
    const t = this.tok;
    if (t.type !== 'name') this.raise(`Identifier expected but found '${t.value}'`);
    if (!allowReserved && !t.esc && RESERVED.has(t.value)) this.raise(`Unexpected keyword '${t.value}'`);
    this.next();
    return { type: 'Identifier', name: t.value, start: t.start, end: t.end };
  }
  withFn(isAsync, isGen, fn) {
    const sf = this.inFunction;
    const sa = this.inAsync;
    const sg = this.inGenerator;
    const sn = this.noArrowRT;
    this.inFunction = true;
    this.inAsync = isAsync;
    this.inGenerator = isGen;
    this.noArrowRT = false;
    try { return fn(); } finally {
      this.inFunction = sf; this.inAsync = sa; this.inGenerator = sg; this.noArrowRT = sn;
    }
  }
  noRT(fn) {
    const s = this.noArrowRT;
    this.noArrowRT = false;
    try { return fn(); } finally { this.noArrowRT = s; }
  }

  // ---------------------------------------------------------------- program
  parseProgram() {
    const body = [];
    this.parseDirectives(body);
    while (this.tok.type !== 'eof') body.push(this.parseStatement(true));
    const sourceType = body.some((s) => /^(Import|Export)/.test(s.type) || s.type === 'TSExportAssignment') ? 'module' : 'script';
    return { type: 'Program', body, sourceType, start: 0, end: this.src.length, comments: this.lex.comments };
  }

  parseDirectives(body) {
    while (this.tok.type === 'str') {
      const s = this.snapshot();
      const start = this.tok.start;
      const raw = this.src.slice(this.tok.start, this.tok.end);
      const value = this.tok.value;
      this.next();
      if (this.is(';') || this.is('}') || this.tok.type === 'eof' || this.tok.nl) {
        this.semicolon();
        const expr = { type: 'Literal', value, raw, start, end: start + raw.length };
        body.push(this.finish({ type: 'ExpressionStatement', expression: expr, directive: raw.slice(1, -1) }, start));
      } else {
        this.restore(s);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- statements
  parseStatement(topLevel) {
    const t = this.tok;
    const start = t.start;
    if (t.type === 'punct') {
      switch (t.value) {
        case '{': return this.parseBlock();
        case ';': this.next(); return this.finish({ type: 'EmptyStatement' }, start);
        case '@': {
          const decorators = this.parseDecorators();
          if (this.isName('export')) {
            const node = this.parseExport();
            const decl = node.declaration;
            if (decl && /Class/.test(decl.type)) { decl.decorators = decorators.concat(decl.decorators || []); }
            return node;
          }
          const abs = this.eatName('abstract');
          return this.parseClass(true, start, decorators, abs);
        }
        default: break;
      }
    }
    if (t.type === 'name' && !t.esc) {
      switch (t.value) {
        case 'var': return this.parseVarStatement('var', start);
        case 'const': {
          if (this.peek().value === 'enum') { this.next(); return this.parseEnum(start, { const: true }); }
          return this.parseVarStatement('const', start);
        }
        case 'let': {
          const n = this.peek();
          if ((n.type === 'name' && (n.value !== 'in' && n.value !== 'instanceof' && n.value !== 'of')) || (n.type === 'punct' && (n.value === '[' || n.value === '{'))) {
            return this.parseVarStatement('let', start);
          }
          break;
        }
        case 'using': {
          const n = this.peek();
          if (n.type === 'name' && !n.nl && this.isIdentTok(n)) return this.parseVarStatement('using', start);
          break;
        }
        case 'await': {
          // Explicit resource management: "await using x = ..." (ES2026 / TS 5.2).
          const [a, b] = this.peek2();
          if (a.type === 'name' && a.value === 'using' && !a.esc && !a.nl && b.type === 'name' && !b.nl && this.isIdentTok(b)) {
            this.next();
            return this.parseVarStatement('await using', start);
          }
          break;
        }
        case 'function': return this.parseFunction(start, true, false);
        case 'async': {
          const n = this.peek();
          if (n.type === 'name' && n.value === 'function' && !n.nl) { this.next(); return this.parseFunction(start, true, true); }
          break;
        }
        case 'class': return this.parseClass(true, start, null, false);
        case 'if': return this.parseIf(start);
        case 'for': return this.parseFor(start);
        case 'while': {
          this.next();
          const test = this.parseParenExpr();
          const body = this.parseStatement();
          return this.finish({ type: 'WhileStatement', test, body }, start);
        }
        case 'do': {
          this.next();
          const body = this.parseStatement();
          this.expectName('while');
          const test = this.parseParenExpr();
          this.eat(';');
          return this.finish({ type: 'DoWhileStatement', body, test }, start);
        }
        case 'return': {
          this.next();
          let argument = null;
          if (!this.is(';') && !this.is('}') && this.tok.type !== 'eof' && !this.tok.nl) argument = this.parseExpression();
          this.semicolon();
          return this.finish({ type: 'ReturnStatement', argument }, start);
        }
        case 'break': case 'continue': {
          this.next();
          let label = null;
          if (this.tok.type === 'name' && !this.tok.nl && this.isIdentTok()) label = this.ident();
          this.semicolon();
          return this.finish({ type: t.value === 'break' ? 'BreakStatement' : 'ContinueStatement', label }, start);
        }
        case 'throw': {
          this.next();
          const argument = this.parseExpression();
          this.semicolon();
          return this.finish({ type: 'ThrowStatement', argument }, start);
        }
        case 'try': return this.parseTry(start);
        case 'switch': return this.parseSwitch(start);
        case 'with': {
          this.next();
          const object = this.parseParenExpr();
          const body = this.parseStatement();
          return this.finish({ type: 'WithStatement', object, body }, start);
        }
        case 'debugger': this.next(); this.semicolon(); return this.finish({ type: 'DebuggerStatement' }, start);
        case 'import': {
          const n = this.peek();
          if (!(n.type === 'punct' && (n.value === '(' || n.value === '.'))) return this.parseImport(start);
          break;
        }
        case 'export': return this.parseExport();
        default: {
          const ts = this.parseTsStatement(start);
          if (ts) return ts;
        }
      }
    }
    // labeled statement
    if (t.type === 'name' && this.isIdentTok()) {
      const n = this.peek();
      if (n.type === 'punct' && n.value === ':') {
        const label = this.ident();
        this.next();
        const body = this.parseStatement();
        return this.finish({ type: 'LabeledStatement', label, body }, start);
      }
    }
    const expression = this.parseExpression();
    this.semicolon();
    return this.finish({ type: 'ExpressionStatement', expression }, start);
  }

  parseTsStatement(start) {
    const v = this.tok.value;
    if (v === 'type' || v === 'interface' || v === 'enum' || v === 'namespace' || v === 'module' || v === 'abstract' || v === 'declare' || v === 'global') {
      const n = this.peek();
      if (n.nl && v !== 'enum') return null;
      if (v === 'type' && n.type === 'name' && this.isIdentTok(n)) return this.parseTypeAlias(start);
      if (v === 'interface' && n.type === 'name') return this.parseInterface(start);
      if (v === 'enum' && n.type === 'name') return this.parseEnum(start, {});
      if ((v === 'namespace' && n.type === 'name') || (v === 'module' && (n.type === 'name' || n.type === 'str'))) return this.parseModule(start, {});
      if (v === 'abstract' && n.type === 'name' && n.value === 'class') { this.next(); return this.parseClass(true, start, null, true); }
      if (v === 'global' && n.type === 'punct' && n.value === '{') return this.parseModule(start, {});
      if (v === 'declare' && (n.type === 'name')) {
        this.next();
        const inner = this.parseStatement();
        inner.declare = true;
        inner.start = start;
        return inner;
      }
    }
    return null;
  }

  parseBlock() {
    const start = this.tok.start;
    this.expect('{');
    const body = [];
    while (!this.is('}')) {
      if (this.tok.type === 'eof') this.raise('Unexpected end of input');
      body.push(this.parseStatement());
    }
    this.next();
    return this.finish({ type: 'BlockStatement', body }, start);
  }

  parseFunctionBody() {
    const start = this.tok.start;
    this.expect('{');
    const body = [];
    this.parseDirectives(body);
    while (!this.is('}')) {
      if (this.tok.type === 'eof') this.raise('Unexpected end of input');
      body.push(this.parseStatement());
    }
    this.next();
    return this.finish({ type: 'BlockStatement', body }, start);
  }

  parseParenExpr() {
    this.expect('(');
    const e = this.noRT(() => this.parseExpression());
    this.expect(')');
    return e;
  }

  parseVarStatement(kind, start) {
    const node = this.parseVar(kind, start, false);
    this.semicolon();
    return this.finish(node, start);
  }

  parseVar(kind, start, noIn) {
    this.next();
    const declarations = [];
    for (;;) {
      const ds = this.tok.start;
      const id = this.parseBindingAtom();
      if (this.ts && this.is('!')) { this.next(); id.definite = true; }
      if (this.ts && this.is(':')) { id.typeAnnotation = this.parseTypeAnnotation(); id.end = this.prevEnd; }
      let init = null;
      if (this.eat('=')) init = this.parseAssign(noIn);
      declarations.push(this.finish({ type: 'VariableDeclarator', id, init }, ds));
      if (!this.eat(',')) break;
    }
    return this.finish({ type: 'VariableDeclaration', kind, declarations }, start);
  }

  parseIf(start) {
    this.next();
    const test = this.parseParenExpr();
    const consequent = this.parseStatement();
    let alternate = null;
    if (this.eatName('else')) alternate = this.parseStatement();
    return this.finish({ type: 'IfStatement', test, consequent, alternate }, start);
  }

  parseFor(start) {
    this.next();
    let isAwait = false;
    if (this.isName('await')) { isAwait = true; this.next(); }
    this.expect('(');
    let init = null;
    if (this.is(';')) {
      // no init
    } else {
      const v = this.tok.value;
      const isDecl = this.tok.type === 'name' && !this.tok.esc && (v === 'var' || v === 'const'
        || (v === 'let' && (() => { const n = this.peek(); return n.type === 'name' || (n.type === 'punct' && (n.value === '[' || n.value === '{')); })())
        || ((v === 'using') && (() => { const n = this.peek(); return n.type === 'name' && n.value !== 'of' && n.value !== 'in'; })()));
      if (isDecl) {
        const ds = this.tok.start;
        init = this.parseVar(v, ds, true);
      } else {
        const is = this.tok.start;
        init = this.noRT(() => this.parseExpression(true));
        if (this.isName('of') || this.isName('in')) init = this.toAssignable(init);
        init.start = init.start == null ? is : init.start;
      }
      if (this.isName('of') || this.isName('in')) {
        const of = this.tok.value === 'of';
        this.next();
        const right = of ? this.noRT(() => this.parseAssign()) : this.noRT(() => this.parseExpression());
        this.expect(')');
        const body = this.parseStatement();
        return this.finish({ type: of ? 'ForOfStatement' : 'ForInStatement', left: init, right, body, await: isAwait }, start);
      }
    }
    this.expect(';');
    const test = this.is(';') ? null : this.noRT(() => this.parseExpression());
    this.expect(';');
    const update = this.is(')') ? null : this.noRT(() => this.parseExpression());
    this.expect(')');
    const body = this.parseStatement();
    return this.finish({ type: 'ForStatement', init, test, update, body }, start);
  }

  parseTry(start) {
    this.next();
    const block = this.parseBlock();
    let handler = null;
    let finalizer = null;
    if (this.isName('catch')) {
      const cs = this.tok.start;
      this.next();
      let param = null;
      if (this.eat('(')) {
        param = this.parseBindingAtom();
        if (this.ts && this.is(':')) { param.typeAnnotation = this.parseTypeAnnotation(); }
        this.expect(')');
      }
      const body = this.parseBlock();
      handler = this.finish({ type: 'CatchClause', param, body }, cs);
    }
    if (this.eatName('finally')) finalizer = this.parseBlock();
    if (!handler && !finalizer) this.raise('Missing catch or finally');
    return this.finish({ type: 'TryStatement', block, handler, finalizer }, start);
  }

  parseSwitch(start) {
    this.next();
    const discriminant = this.parseParenExpr();
    this.expect('{');
    const cases = [];
    while (!this.eat('}')) {
      const cs = this.tok.start;
      let test = null;
      if (this.eatName('case')) test = this.noRT(() => this.parseExpression());
      else if (!this.eatName('default')) this.raise('Expected case or default');
      this.expect(':');
      const consequent = [];
      while (!this.is('}') && !this.isName('case') && !this.isName('default')) {
        if (this.tok.type === 'eof') this.raise('Unexpected end of input');
        consequent.push(this.parseStatement());
      }
      cases.push(this.finish({ type: 'SwitchCase', test, consequent }, cs));
    }
    return this.finish({ type: 'SwitchStatement', discriminant, cases }, start);
  }

  // ---------------------------------------------------------------- modules
  parseModuleSource() {
    if (this.tok.type !== 'str') this.raise('Module source expected');
    const t = this.tok;
    this.next();
    return { type: 'Literal', value: t.value, raw: this.src.slice(t.start, t.end), start: t.start, end: t.end };
  }

  parseImportAttributes() {
    if ((this.isName('with') || (this.isName('assert') && !this.tok.nl))) {
      this.next();
      this.parseObjectLike();
    }
  }

  parseImport(start) {
    this.next();
    let importKind = 'value';
    if (this.ts && this.isName('type')) {
      const n = this.peek();
      if ((n.type === 'name' && n.value !== 'from') || (n.type === 'punct' && (n.value === '{' || n.value === '*'))
        || (n.type === 'name' && n.value === 'from' && this.peek2()[1].value === 'from')) {
        importKind = 'type';
        this.next();
      }
    }
    const specifiers = [];
    if (this.tok.type === 'str') {
      const source = this.parseModuleSource();
      this.parseImportAttributes();
      this.semicolon();
      return this.finish({ type: 'ImportDeclaration', specifiers, source, importKind }, start);
    }
    if (this.tok.type === 'name' && !this.is('{')) {
      const ls = this.tok.start;
      const local = this.ident();
      // import x = require('y')  /  import x = A.B
      if (this.ts && this.is('=')) {
        this.next();
        let moduleReference;
        if (this.isName('require') && this.peek().value === '(') {
          const rs = this.tok.start;
          this.next();
          this.expect('(');
          const expression = this.parseModuleSource();
          this.expect(')');
          moduleReference = this.finish({ type: 'TSExternalModuleReference', expression }, rs);
        } else {
          moduleReference = this.parseEntityName(true);
        }
        this.semicolon();
        return this.finish({ type: 'TSImportEqualsDeclaration', id: local, moduleReference, importKind }, start);
      }
      specifiers.push(this.finish({ type: 'ImportDefaultSpecifier', local }, ls));
      this.eat(',');
    }
    if (this.is('*')) {
      const ss = this.tok.start;
      this.next();
      this.expectName('as');
      const local = this.ident();
      specifiers.push(this.finish({ type: 'ImportNamespaceSpecifier', local }, ss));
    } else if (this.eat('{')) {
      while (!this.eat('}')) {
        const ss = this.tok.start;
        let kind = 'value';
        if (this.ts && this.isName('type')) {
          const n = this.peek();
          if (n.type === 'name' || n.type === 'str') {
            if (!(n.value === 'as' && this.peek2()[1].type !== 'name')) { kind = 'type'; this.next(); }
          }
        }
        const imported = this.tok.type === 'str' ? this.parseModuleSource() : this.ident(true);
        let local = imported.type === 'Identifier' ? { ...imported } : null;
        if (this.eatName('as')) local = this.ident();
        if (!local) this.raise('Local name expected');
        specifiers.push(this.finish({ type: 'ImportSpecifier', imported, local, importKind: kind }, ss));
        if (!this.is('}')) this.expect(',');
      }
    }
    this.expectName('from');
    const source = this.parseModuleSource();
    this.parseImportAttributes();
    this.semicolon();
    return this.finish({ type: 'ImportDeclaration', specifiers, source, importKind }, start);
  }

  parseExport() {
    const start = this.tok.start;
    this.next();
    // export = x
    if (this.ts && this.is('=')) {
      this.next();
      const expression = this.parseExpression();
      this.semicolon();
      return this.finish({ type: 'TSExportAssignment', expression }, start);
    }
    if (this.ts && this.isName('as')) {
      this.next();
      this.expectName('namespace');
      const id = this.ident();
      this.semicolon();
      return this.finish({ type: 'TSNamespaceExportDeclaration', id }, start);
    }
    if (this.ts && this.isName('import')) {
      const ds = this.tok.start;
      const decl = this.parseImport(ds);
      return this.finish({ type: 'ExportNamedDeclaration', declaration: decl, specifiers: [], source: null }, start);
    }
    if (this.isName('default')) {
      this.next();
      const ds = this.tok.start;
      let declaration;
      if (this.isName('function')) declaration = this.parseFunction(ds, true, false, true);
      else if (this.isName('async') && this.peek().value === 'function' && !this.peek().nl) { this.next(); declaration = this.parseFunction(ds, true, true, true); }
      else if (this.isName('class')) declaration = this.parseClass(true, ds, null, false, true);
      else if (this.is('@')) { const decs = this.parseDecorators(); declaration = this.parseClass(true, ds, decs, this.eatName('abstract'), true); }
      else if (this.isName('abstract') && this.peek().value === 'class') { this.next(); declaration = this.parseClass(true, ds, null, true, true); }
      else if (this.ts && this.isName('interface') && this.peek().type === 'name') declaration = this.parseInterface(ds);
      else {
        declaration = this.parseAssign();
        this.semicolon();
      }
      return this.finish({ type: 'ExportDefaultDeclaration', declaration }, start);
    }
    let exportKind = 'value';
    if (this.ts && this.isName('type') && (this.peek().value === '{' || this.peek().value === '*')) { exportKind = 'type'; this.next(); }
    if (this.is('*')) {
      this.next();
      let exported = null;
      if (this.eatName('as')) exported = this.tok.type === 'str' ? this.parseModuleSource() : this.ident(true);
      this.expectName('from');
      const source = this.parseModuleSource();
      this.parseImportAttributes();
      this.semicolon();
      return this.finish({ type: 'ExportAllDeclaration', exported, source, exportKind }, start);
    }
    if (this.eat('{')) {
      const specifiers = [];
      while (!this.eat('}')) {
        const ss = this.tok.start;
        let kind = 'value';
        if (this.ts && this.isName('type') && (this.peek().type === 'name' || this.peek().type === 'str')) { kind = 'type'; this.next(); }
        const local = this.tok.type === 'str' ? this.parseModuleSource() : this.ident(true);
        let exported = local.type === 'Identifier' ? { ...local } : { ...local };
        if (this.eatName('as')) exported = this.tok.type === 'str' ? this.parseModuleSource() : this.ident(true);
        specifiers.push(this.finish({ type: 'ExportSpecifier', local, exported, exportKind: kind }, ss));
        if (!this.is('}')) this.expect(',');
      }
      let source = null;
      if (this.eatName('from')) { source = this.parseModuleSource(); this.parseImportAttributes(); }
      this.semicolon();
      return this.finish({ type: 'ExportNamedDeclaration', declaration: null, specifiers, source, exportKind }, start);
    }
    const declaration = this.parseStatement();
    return this.finish({ type: 'ExportNamedDeclaration', declaration, specifiers: [], source: null, exportKind }, start);
  }

  // ---------------------------------------------------------------- TS declarations
  parseTypeAlias(start) {
    this.next();
    const id = this.ident();
    const typeParameters = this.is('<') ? this.parseTypeParams() : null;
    this.expect('=');
    const typeAnnotation = this.parseType();
    this.semicolon();
    return this.finish({ type: 'TSTypeAliasDeclaration', id, typeParameters, typeAnnotation }, start);
  }

  parseInterface(start) {
    this.next();
    const id = this.ident();
    const typeParameters = this.is('<') ? this.parseTypeParams() : null;
    const ext = [];
    if (this.eatName('extends')) {
      do { ext.push(this.parseHeritage('TSInterfaceHeritage')); } while (this.eat(','));
    }
    const bs = this.tok.start;
    const members = this.parseTypeMembers();
    const body = this.finish({ type: 'TSInterfaceBody', body: members }, bs);
    return this.finish({ type: 'TSInterfaceDeclaration', id, typeParameters, extends: ext, body }, start);
  }

  parseHeritage(type) {
    const s = this.tok.start;
    const expression = this.parseEntityName(false, true);
    const typeArguments = this.is('<') ? this.parseTypeArgs() : null;
    return this.finish({ type, expression, typeArguments }, s);
  }

  parseEnum(start, flags) {
    this.next();
    const id = this.ident();
    this.expect('{');
    const members = [];
    while (!this.eat('}')) {
      const ms = this.tok.start;
      let mid;
      if (this.tok.type === 'str') mid = this.parseModuleSource();
      else if (this.is('[')) { this.next(); mid = this.parseAssign(); this.expect(']'); }
      else mid = this.ident(true);
      let initializer = null;
      if (this.eat('=')) initializer = this.parseAssign();
      members.push(this.finish({ type: 'TSEnumMember', id: mid, initializer }, ms));
      if (!this.is('}')) this.expect(',');
    }
    return this.finish({ type: 'TSEnumDeclaration', id, members, const: !!flags.const }, start);
  }

  parseModule(start) {
    let kind = this.tok.value;
    let id;
    if (kind === 'global') {
      id = this.ident(true);
    } else {
      this.next();
      if (this.tok.type === 'str') id = this.parseModuleSource();
      else {
        id = this.ident(true);
        while (this.is('.')) {
          this.next();
          const right = this.ident(true);
          id = { type: 'TSQualifiedName', left: id, right, start: id.start, end: right.end };
        }
      }
    }
    let body = null;
    if (this.is('{')) {
      const bs = this.tok.start;
      this.next();
      const stmts = [];
      while (!this.eat('}')) {
        if (this.tok.type === 'eof') this.raise('Unexpected end of input');
        stmts.push(this.parseStatement());
      }
      body = this.finish({ type: 'TSModuleBlock', body: stmts }, bs);
    } else this.semicolon();
    return this.finish({ type: 'TSModuleDeclaration', id, body, kind }, start);
  }

  // ---------------------------------------------------------------- functions & classes
  parseFunction(start, isStatement, isAsync, optionalId) {
    this.expectName('function');
    const generator = this.eat('*');
    let id = null;
    if (this.tok.type === 'name' && !this.is('(') && !(this.ts && this.is('<'))) {
      if (!(optionalId && this.isName('implements'))) id = this.ident();
    } else if (isStatement && !optionalId) this.raise('Function name expected');
    return this.withFn(isAsync, generator, () => {
      const typeParameters = this.ts && this.is('<') ? this.parseTypeParams() : null;
      const params = this.parseParams();
      const returnType = this.ts && this.is(':') ? this.parseReturnType() : null;
      let body = null;
      if (this.is('{')) body = this.parseFunctionBody();
      else if (this.ts || isStatement) { this.semicolon(); }
      else this.raise('Function body expected');
      const type = isStatement ? (body ? 'FunctionDeclaration' : 'TSDeclareFunction') : 'FunctionExpression';
      return this.finish({ type, id, params, body, async: isAsync, generator, expression: false, typeParameters, returnType }, start);
    });
  }

  parseParams() {
    this.expect('(');
    const params = [];
    this.noRT(() => {
      while (!this.is(')')) {
        params.push(this.parseParam());
        if (!this.is(')')) this.expect(',');
      }
    });
    this.next();
    return params;
  }

  parseParam() {
    const start = this.tok.start;
    const decorators = this.is('@') ? this.parseDecorators() : null;
    let accessibility = null;
    let readonly = false;
    let override = false;
    if (this.ts) {
      while (this.tok.type === 'name' && PARAM_MODIFIERS.has(this.tok.value)) {
        const n = this.peek();
        if (!(n.type === 'name' || (n.type === 'punct' && (n.value === '{' || n.value === '[')))) break;
        if (this.tok.value === 'readonly') readonly = true;
        else if (this.tok.value === 'override') override = true;
        else accessibility = this.tok.value;
        this.next();
      }
    }
    let param;
    if (this.is('...')) {
      this.next();
      const argument = this.parseBindingAtom();
      if (this.ts && this.is('?')) this.next();
      const typeAnnotation = this.ts && this.is(':') ? this.parseTypeAnnotation() : null;
      param = this.finish({ type: 'RestElement', argument, typeAnnotation }, start);
      if (this.is('=')) { this.next(); this.parseAssign(); }
    } else {
      const left = this.isName('this') ? this.ident(true) : this.parseBindingAtom();
      if (this.ts && this.is('?')) { this.next(); left.optional = true; }
      if (this.ts && this.is(':')) { left.typeAnnotation = this.parseTypeAnnotation(); left.end = this.prevEnd; }
      param = left;
      if (this.eat('=')) {
        const right = this.parseAssign();
        param = this.finish({ type: 'AssignmentPattern', left, right }, left.start);
      }
    }
    if (decorators) param.decorators = decorators;
    if (accessibility || readonly || override) {
      return this.finish({ type: 'TSParameterProperty', accessibility, readonly, override, parameter: param, decorators }, start);
    }
    return param;
  }

  parseDecorators() {
    const out = [];
    while (this.is('@')) {
      const s = this.tok.start;
      this.next();
      let expression;
      if (this.is('(')) expression = this.parseParenExpr();
      else {
        expression = this.ident(true);
        while (this.is('.')) {
          this.next();
          const property = this.ident(true);
          expression = { type: 'MemberExpression', object: expression, property, computed: false, optional: false, start: expression.start, end: property.end };
        }
        if (this.ts && this.is('<')) this.parseTypeArgs();
        if (this.is('(')) {
          const args = this.parseArguments();
          expression = this.finish({ type: 'CallExpression', callee: expression, arguments: args, optional: false }, expression.start);
        }
      }
      out.push(this.finish({ type: 'Decorator', expression }, s));
    }
    return out;
  }

  parseClass(isStatement, start, decorators, isAbstract, optionalId) {
    this.expectName('class');
    let id = null;
    if (this.tok.type === 'name' && !this.isName('extends') && !this.isName('implements') && !this.is('{')) id = this.ident();
    else if (isStatement && !optionalId) this.raise('Class name expected');
    const typeParameters = this.ts && this.is('<') ? this.parseTypeParams() : null;
    let superClass = null;
    let superTypeArguments = null;
    if (this.eatName('extends')) {
      superClass = this.parseSubscripts(this.parseExprAtom(), true);
      if (this.ts && this.is('<')) superTypeArguments = this.parseTypeArgs();
    }
    const impl = [];
    if (this.eatName('implements')) {
      do { impl.push(this.parseHeritage('TSClassImplements')); } while (this.eat(','));
    }
    const body = this.parseClassBody();
    return this.finish({ type: isStatement ? 'ClassDeclaration' : 'ClassExpression', id, superClass, superTypeArguments, implements: impl, body, decorators: decorators || [], abstract: !!isAbstract, typeParameters }, start);
  }

  parseClassBody() {
    const start = this.tok.start;
    this.expect('{');
    const body = [];
    const sf = this.inFunction;
    while (!this.eat('}')) {
      if (this.eat(';')) continue;
      if (this.tok.type === 'eof') this.raise('Unexpected end of input');
      const m = this.parseClassMember();
      if (m) body.push(m);
    }
    this.inFunction = sf;
    return this.finish({ type: 'ClassBody', body }, start);
  }

  isMemberNameNext(n) {
    // after a modifier word: is the following token a member name / modifier (so the word was a modifier)?
    if (n.nl && false) return false;
    if (n.type === 'name' || n.type === 'str' || n.type === 'num' || n.type === 'priv') return true;
    if (n.type === 'punct' && (n.value === '[' || n.value === '*' || n.value === '{' || n.value === '#')) return true;
    return false;
  }

  parseClassMember() {
    const start = this.tok.start;
    const decorators = this.is('@') ? this.parseDecorators() : [];
    const mods = {};
    let isStatic = false;
    let kind = 'method';
    let isAsync = false;
    let generator = false;
    // static block
    if (this.isName('static') && this.peek().value === '{' && this.peek().type === 'punct') {
      this.next();
      const body = this.withFn(false, false, () => this.parseBlock());
      return this.finish({ type: 'StaticBlock', body: body.body }, start);
    }
    for (;;) {
      if (this.tok.type !== 'name' || this.tok.esc) break;
      const v = this.tok.value;
      if (!CLASS_MODIFIERS.has(v) && v !== 'async' && v !== 'get' && v !== 'set') break;
      const n = this.peek();
      if (!this.isMemberNameNext(n)) break;
      if ((v === 'async' || v === 'get' || v === 'set') && n.nl) break;
      if (v === 'async' && n.type === 'punct' && n.value === '{') break;
      this.next();
      if (v === 'static') isStatic = true;
      else if (v === 'async') isAsync = true;
      else if (v === 'get' || v === 'set') kind = v;
      else if (v === 'public' || v === 'private' || v === 'protected') mods.accessibility = v;
      else mods[v] = true;
    }
    if (this.is('*')) { this.next(); generator = true; }
    // index signature
    if (this.ts && this.is('[')) {
      const sig = this.tryParse(null, () => this.parseIndexSignature(start));
      if (sig) { sig.static = isStatic; sig.readonly = !!mods.readonly; this.eat(';') || this.eat(','); return sig; }
    }
    const keyInfo = this.parsePropertyKey(true);
    const { key, computed } = keyInfo;
    let optional = false;
    if (this.ts && this.is('?')) { this.next(); optional = true; }
    if (this.ts && this.is('!')) { this.next(); mods.definite = true; }
    if (this.is('(') || this.is('<')) {
      const isCtor = !isStatic && !computed && ((key.type === 'Identifier' && key.name === 'constructor') || (key.type === 'Literal' && key.value === 'constructor'));
      const fs = this.tok.start;
      const value = this.withFn(isAsync, generator, () => {
        const typeParameters = this.ts && this.is('<') ? this.parseTypeParams() : null;
        const params = this.parseParams();
        const returnType = this.ts && this.is(':') ? this.parseReturnType() : null;
        let body = null;
        if (this.is('{')) body = this.parseFunctionBody();
        else this.semicolon();
        return this.finish({ type: 'FunctionExpression', id: null, params, body, async: isAsync, generator, expression: false, typeParameters, returnType }, fs);
      });
      return this.finish({ type: 'MethodDefinition', key, computed, value, kind: isCtor ? 'constructor' : kind, static: isStatic, decorators, optional, ...mods }, start);
    }
    // property
    const typeAnnotation = this.ts && this.is(':') ? this.parseTypeAnnotation() : null;
    let value = null;
    if (this.eat('=')) value = this.withFn(false, false, () => this.parseAssign());
    this.semicolon();
    return this.finish({ type: 'PropertyDefinition', key, computed, value, static: isStatic, decorators, optional, typeAnnotation, ...mods }, start);
  }

  parsePropertyKey(allowPrivate) {
    const t = this.tok;
    if (t.type === 'punct' && t.value === '[') {
      this.next();
      const key = this.noRT(() => this.parseAssign());
      this.expect(']');
      return { key, computed: true };
    }
    if (t.type === 'str' || t.type === 'num') {
      this.next();
      return { key: { type: 'Literal', value: t.value, raw: this.src.slice(t.start, t.end), bigint: t.bigint ? this.src.slice(t.start, t.end - 1) : undefined, start: t.start, end: t.end }, computed: false };
    }
    if (t.type === 'priv' && allowPrivate) {
      this.next();
      return { key: { type: 'PrivateIdentifier', name: t.value, start: t.start, end: t.end }, computed: false };
    }
    if (t.type === 'name') return { key: this.ident(true), computed: false };
    this.raise(`Property name expected but found '${t.value}'`);
    return null;
  }

  // ---------------------------------------------------------------- patterns
  parseBindingAtom() {
    const start = this.tok.start;
    if (this.is('[')) {
      this.next();
      const elements = [];
      while (!this.is(']')) {
        if (this.is(',')) { this.next(); elements.push(null); continue; }
        if (this.is('...')) {
          const rs = this.tok.start;
          this.next();
          const argument = this.parseBindingAtom();
          elements.push(this.finish({ type: 'RestElement', argument }, rs));
        } else elements.push(this.parseBindingElement());
        if (!this.is(']')) this.expect(',');
      }
      this.next();
      const node = this.finish({ type: 'ArrayPattern', elements }, start);
      return node;
    }
    if (this.is('{')) {
      this.next();
      const properties = [];
      while (!this.is('}')) {
        const ps = this.tok.start;
        if (this.is('...')) {
          this.next();
          const argument = this.parseBindingAtom();
          properties.push(this.finish({ type: 'RestElement', argument }, ps));
        } else {
          const { key, computed } = this.parsePropertyKey(false);
          let value;
          let shorthand = false;
          if (this.eat(':')) value = this.parseBindingElement();
          else {
            if (key.type !== 'Identifier' || computed) this.raise('Shorthand must be an identifier');
            if (!key.name || RESERVED.has(key.name)) this.raise('Reserved shorthand');
            shorthand = true;
            value = { type: 'Identifier', name: key.name, start: key.start, end: key.end };
            if (this.eat('=')) {
              const right = this.parseAssign();
              value = this.finish({ type: 'AssignmentPattern', left: value, right }, key.start);
            }
          }
          properties.push(this.finish({ type: 'Property', key, value, computed, shorthand, kind: 'init', method: false }, ps));
        }
        if (!this.is('}')) this.expect(',');
      }
      this.next();
      return this.finish({ type: 'ObjectPattern', properties }, start);
    }
    return this.ident();
  }

  parseBindingElement() {
    const start = this.tok.start;
    const left = this.parseBindingAtom();
    if (this.eat('=')) {
      const right = this.parseAssign();
      return this.finish({ type: 'AssignmentPattern', left, right }, start);
    }
    return left;
  }

  toAssignable(node) {
    if (!node) return node;
    switch (node.type) {
      case 'Identifier': case 'MemberExpression': case 'ObjectPattern': case 'ArrayPattern': case 'AssignmentPattern': case 'RestElement':
        return node;
      case 'TSAsExpression': case 'TSNonNullExpression': case 'TSSatisfiesExpression': case 'TSTypeAssertion':
        return node;
      case 'ObjectExpression':
        node.type = 'ObjectPattern';
        for (const p of node.properties) {
          if (p.type === 'SpreadElement') { p.type = 'RestElement'; p.argument = this.toAssignable(p.argument); } else p.value = this.toAssignable(p.value);
        }
        return node;
      case 'ArrayExpression':
        node.type = 'ArrayPattern';
        node.elements = node.elements.map((e) => {
          if (!e) return e;
          if (e.type === 'SpreadElement') { e.type = 'RestElement'; e.argument = this.toAssignable(e.argument); return e; }
          return this.toAssignable(e);
        });
        return node;
      case 'AssignmentExpression':
        if (node.operator !== '=') this.raise('Invalid assignment target', node.start);
        node.type = 'AssignmentPattern';
        delete node.operator;
        node.left = this.toAssignable(node.left);
        return node;
      default:
        this.raise('Invalid assignment target', node.start);
        return node;
    }
  }

  // ---------------------------------------------------------------- expressions
  parseExpression(noIn) {
    const start = this.tok.start;
    const first = this.parseAssign(noIn);
    if (this.is(',')) {
      const expressions = [first];
      while (this.eat(',')) expressions.push(this.parseAssign(noIn));
      return this.finish({ type: 'SequenceExpression', expressions }, start);
    }
    return first;
  }

  parseAssign(noIn) {
    const t = this.tok;
    const start = t.start;
    if (t.type === 'name' && !t.esc) {
      if (t.value === 'yield' && this.inGenerator) return this.parseYield(noIn);
      if (t.value === 'async') {
        const r = this.tryAsyncArrow(noIn);
        if (r) return r;
      } else if (this.isIdentTok()) {
        const n = this.peek();
        if (n.type === 'punct' && n.value === '=>' && !n.nl) {
          const param = this.ident();
          this.next();
          return this.parseArrowBody(start, [param], false, noIn, null, null);
        }
      }
    } else if (t.type === 'punct' && (t.value === '(' || (t.value === '<' && (this.ts)))) {
      const r = this.tryParse('a' + start, () => this.parseParenArrow(start, false, noIn));
      if (r) return r;
    }
    const left = this.parseConditional(noIn);
    if (this.tok.type === 'punct' && ASSIGN_OPS.has(this.tok.value)) {
      const operator = this.tok.value;
      const target = operator === '=' ? this.toAssignable(left) : left;
      this.next();
      const right = this.parseAssign(noIn);
      return this.finish({ type: 'AssignmentExpression', operator, left: target, right }, start);
    }
    return left;
  }

  tryAsyncArrow(noIn) {
    const start = this.tok.start;
    const n = this.peek();
    if (n.nl) return null;
    if (n.type === 'name' && n.value !== 'function') {
      return this.tryParse(null, () => {
        this.next();
        const param = this.ident();
        if (!this.is('=>') || this.tok.nl) this.raise('=> expected');
        this.next();
        return this.parseArrowBody(start, [param], true, noIn, null, null);
      });
    }
    if (n.type === 'punct' && (n.value === '(' || (n.value === '<' && this.ts))) {
      return this.tryParse('A' + start, () => {
        this.next();
        return this.parseParenArrow(start, true, noIn);
      });
    }
    return null;
  }

  parseParenArrow(start, isAsync, noIn) {
    let typeParameters = null;
    if (this.is('<')) typeParameters = this.parseTypeParams();
    const sa = this.inAsync;
    this.inAsync = isAsync;
    let params;
    let returnType = null;
    try {
      params = this.parseParams();
      if (this.ts && this.is(':') && !this.noArrowRT) returnType = this.parseReturnType();
    } finally { this.inAsync = sa; }
    if (!this.is('=>') || this.tok.nl) this.raise('=> expected');
    this.next();
    return this.parseArrowBody(start, params, isAsync, noIn, typeParameters, returnType);
  }

  parseArrowBody(start, params, isAsync, noIn, typeParameters, returnType) {
    return this.withFn(isAsync, false, () => {
      let body;
      let expression = false;
      if (this.is('{')) body = this.parseFunctionBody();
      else { body = this.parseAssign(noIn); expression = true; }
      return this.finish({ type: 'ArrowFunctionExpression', id: null, params, body, async: isAsync, generator: false, expression, typeParameters, returnType }, start);
    });
  }

  parseYield(noIn) {
    const start = this.tok.start;
    this.next();
    let delegate = false;
    let argument = null;
    if (!this.tok.nl) {
      delegate = this.eat('*');
      const t = this.tok;
      const ends = t.type === 'eof' || (t.type === 'punct' && [')', ']', '}', ',', ';', ':'].includes(t.value)) || (t.type === 'name' && t.value === 'in' && noIn);
      if (delegate || !ends) argument = this.parseAssign(noIn);
    }
    return this.finish({ type: 'YieldExpression', delegate, argument }, start);
  }

  parseConditional(noIn) {
    const start = this.tok.start;
    const test = this.parseBinary(noIn);
    if (this.is('?')) {
      this.next();
      const sn = this.noArrowRT;
      this.noArrowRT = true;
      let consequent;
      try { consequent = this.parseAssign(false); } finally { this.noArrowRT = sn; }
      this.expect(':');
      const alternate = this.parseAssign(noIn);
      return this.finish({ type: 'ConditionalExpression', test, consequent, alternate }, start);
    }
    return test;
  }

  parseBinary(noIn) {
    const start = this.tok.start;
    return this.parseBinOp(this.parseUnary(), start, -1, noIn);
  }

  binOpOf(noIn) {
    const t = this.tok;
    if (t.type === 'punct') return BIN_PREC[t.value] != null ? t.value : null;
    if (t.type === 'name' && !t.esc) {
      if (t.value === 'instanceof') return t.value;
      if (t.value === 'in' && !noIn) return t.value;
      if (this.ts && (t.value === 'as' || t.value === 'satisfies') && !t.nl) return t.value;
    }
    return null;
  }

  parseBinOp(left, leftStart, minPrec, noIn) {
    for (;;) {
      const op = this.binOpOf(noIn);
      if (!op) return left;
      const prec = op === 'as' || op === 'satisfies' ? 7 : BIN_PREC[op];
      if (prec <= minPrec) return left;
      this.next();
      if (op === 'as' || op === 'satisfies') {
        const typeAnnotation = this.parseType();
        left = this.finish({ type: op === 'as' ? 'TSAsExpression' : 'TSSatisfiesExpression', expression: left, typeAnnotation }, leftStart);
        continue;
      }
      const rs = this.tok.start;
      const right = this.parseBinOp(this.parseUnary(), rs, op === '**' ? prec - 1 : prec, noIn);
      const type = op === '||' || op === '&&' || op === '??' ? 'LogicalExpression' : 'BinaryExpression';
      left = this.finish({ type, operator: op, left, right }, leftStart);
    }
  }

  parseUnary() {
    const t = this.tok;
    const start = t.start;
    if (t.type === 'punct') {
      if (t.value === '!' || t.value === '~' || t.value === '+' || t.value === '-') {
        this.next();
        const argument = this.parseUnary();
        return this.finish({ type: 'UnaryExpression', operator: t.value, prefix: true, argument }, start);
      }
      if (t.value === '++' || t.value === '--') {
        this.next();
        const argument = this.parseUnary();
        return this.finish({ type: 'UpdateExpression', operator: t.value, prefix: true, argument }, start);
      }
      if (t.value === '<' && this.ts && !this.jsx) {
        this.next();
        const typeAnnotation = this.parseType();
        this.expectGt();
        const expression = this.parseUnary();
        return this.finish({ type: 'TSTypeAssertion', typeAnnotation, expression }, start);
      }
    } else if (t.type === 'name' && !t.esc) {
      if (t.value === 'typeof' || t.value === 'void' || t.value === 'delete') {
        this.next();
        const argument = this.parseUnary();
        return this.finish({ type: 'UnaryExpression', operator: t.value, prefix: true, argument }, start);
      }
      if (t.value === 'await') {
        const n = this.peek();
        const asIdent = !this.inAsync && (n.type === 'eof' || n.nl || (n.type === 'punct' && [')', ']', '}', ',', ';', '=', '.', ':', '?.', '=>'].includes(n.value)) || (n.type === 'punct' && BIN_PREC[n.value] != null && n.value !== '-' && n.value !== '+' && n.value !== '<' && n.value !== '/'));
        if (!asIdent) {
          this.next();
          const argument = this.parseUnary();
          return this.finish({ type: 'AwaitExpression', argument }, start);
        }
      }
    }
    let expr = this.parseSubscripts(this.parseExprAtom(), false);
    while (this.tok.type === 'punct' && (this.tok.value === '++' || this.tok.value === '--') && !this.tok.nl) {
      const op = this.tok.value;
      this.next();
      expr = this.finish({ type: 'UpdateExpression', operator: op, prefix: false, argument: expr }, start);
    }
    if (this.is('**') && expr.type === 'UnaryExpression') this.raise('Unary before **');
    return expr;
  }

  canFollowTypeArgs() {
    const t = this.tok;
    if (t.type === 'template') return true;
    if (t.type === 'eof') return true;
    if (t.type === 'punct') return ['(', ')', ']', ',', ';', '.', '?.', '}', ':', '==', '===', '!=', '!==', '&&', '||', '??', '?'].includes(t.value);
    return t.nl;
  }

  parseSubscripts(base, noCalls) {
    const start = base.parenthesized ? base.parenStart : base.start;
    let expr = base;
    let chain = false;
    for (;;) {
      const t = this.tok;
      if (t.type === 'punct') {
        if (t.value === '.') {
          this.next();
          const property = this.tok.type === 'priv' ? this.privateName() : this.ident(true);
          expr = this.finish({ type: 'MemberExpression', object: expr, property, computed: false, optional: false }, start);
          continue;
        }
        if (t.value === '?.') {
          if (noCalls) return expr;
          this.next();
          chain = true;
          if (this.is('(')) {
            const args = this.parseArguments();
            expr = this.finish({ type: 'CallExpression', callee: expr, arguments: args, optional: true }, start);
          } else if (this.is('[')) {
            this.next();
            const property = this.noRT(() => this.parseExpression());
            this.expect(']');
            expr = this.finish({ type: 'MemberExpression', object: expr, property, computed: true, optional: true }, start);
          } else if (this.ts && this.is('<')) {
            const typeArguments = this.parseTypeArgs();
            const args = this.parseArguments();
            expr = this.finish({ type: 'CallExpression', callee: expr, arguments: args, optional: true, typeArguments }, start);
          } else {
            const property = this.tok.type === 'priv' ? this.privateName() : this.ident(true);
            expr = this.finish({ type: 'MemberExpression', object: expr, property, computed: false, optional: true }, start);
          }
          continue;
        }
        if (t.value === '[') {
          this.next();
          const property = this.noRT(() => this.parseExpression());
          this.expect(']');
          expr = this.finish({ type: 'MemberExpression', object: expr, property, computed: true, optional: false }, start);
          continue;
        }
        if (t.value === '(' && !noCalls) {
          const args = this.parseArguments();
          expr = this.finish({ type: 'CallExpression', callee: expr, arguments: args, optional: false }, start);
          continue;
        }
        if (t.value === '!' && this.ts && !t.nl) {
          this.next();
          expr = this.finish({ type: 'TSNonNullExpression', expression: expr }, start);
          continue;
        }
        if ((t.value === '<' || t.value === '<<') && this.ts && t.value === '<') {
          const at = t.start;
          const typeArguments = this.tryParse('t' + at, () => {
            const ta = this.parseTypeArgs();
            if (!this.canFollowTypeArgs()) this.raise('not type args');
            return ta;
          });
          if (typeArguments) {
            if (this.is('(') && !noCalls) {
              const args = this.parseArguments();
              expr = this.finish({ type: 'CallExpression', callee: expr, arguments: args, optional: false, typeArguments }, start);
            } else if (this.tok.type === 'template') {
              const quasi = this.parseTemplate(true);
              expr = this.finish({ type: 'TaggedTemplateExpression', tag: expr, quasi, typeArguments }, start);
            } else {
              expr = this.finish({ type: 'TSInstantiationExpression', expression: expr, typeArguments }, start);
            }
            continue;
          }
        }
      } else if (t.type === 'template') {
        if (chain) this.raise('Tagged template in optional chain');
        const quasi = this.parseTemplate(true);
        expr = this.finish({ type: 'TaggedTemplateExpression', tag: expr, quasi }, start);
        continue;
      }
      break;
    }
    if (chain) expr = { type: 'ChainExpression', expression: expr, start: expr.start, end: expr.end };
    return expr;
  }

  privateName() {
    const t = this.tok;
    this.next();
    return { type: 'PrivateIdentifier', name: t.value, start: t.start, end: t.end };
  }

  parseArguments() {
    this.expect('(');
    const args = [];
    this.noRT(() => {
      while (!this.is(')')) {
        if (this.is('...')) {
          const s = this.tok.start;
          this.next();
          const argument = this.parseAssign();
          args.push(this.finish({ type: 'SpreadElement', argument }, s));
        } else args.push(this.parseAssign());
        if (!this.is(')')) this.expect(',');
      }
    });
    this.next();
    return args;
  }

  literalFromTok(t) {
    const raw = this.src.slice(t.start, t.end);
    if (t.type === 'num') {
      if (t.bigint) return { type: 'Literal', value: null, raw, bigint: raw.slice(0, -1).replace(/_/g, ''), start: t.start, end: t.end };
      return { type: 'Literal', value: t.value, raw, start: t.start, end: t.end, legacyOctal: t.legacyOctal || undefined };
    }
    return { type: 'Literal', value: t.value, raw, start: t.start, end: t.end, octal: t.octal || undefined };
  }

  parseExprAtom() {
    const t = this.tok;
    const start = t.start;
    switch (t.type) {
      case 'num': case 'str':
        this.next();
        return this.literalFromTok(t);
      case 'template':
        return this.parseTemplate(false);
      case 'priv':
        return this.privateName();
      case 'name': {
        if (!t.esc) {
          switch (t.value) {
            case 'function': return this.parseFunction(start, false, false);
            case 'async': {
              const n = this.peek();
              if (n.type === 'name' && n.value === 'function' && !n.nl) { this.next(); return this.parseFunction(start, false, true); }
              break;
            }
            case 'class': return this.parseClass(false, start, null, false);
            case 'this': this.next(); return this.finish({ type: 'ThisExpression' }, start);
            case 'super': this.next(); return this.finish({ type: 'Super' }, start);
            case 'null': this.next(); return this.finish({ type: 'Literal', value: null, raw: 'null' }, start);
            case 'true': case 'false': this.next(); return this.finish({ type: 'Literal', value: t.value === 'true', raw: t.value }, start);
            case 'new': return this.parseNew();
            case 'import': {
              this.next();
              if (this.eat('.')) {
                const property = this.ident(true);
                return this.finish({ type: 'MetaProperty', meta: { type: 'Identifier', name: 'import', start, end: t.end }, property }, start);
              }
              this.expect('(');
              const source = this.noRT(() => this.parseAssign());
              let options = null;
              if (this.eat(',') && !this.is(')')) { options = this.parseAssign(); this.eat(','); }
              this.expect(')');
              return this.finish({ type: 'ImportExpression', source, options }, start);
            }
            default: break;
          }
        }
        return this.ident(false);
      }
      case 'punct':
        switch (t.value) {
          case '(': {
            this.next();
            const expr = this.noRT(() => this.parseExpression());
            this.expect(')');
            expr.parenthesized = (expr.parenthesized || 0) + 1;
            expr.parenStart = start;
            expr.parenEnd = this.prevEnd;
            return expr;
          }
          case '[': return this.parseArray();
          case '{': return this.parseObject();
          case '/': case '/=': {
            const r = this.lex.readRegex(t.start, t.nl);
            this.tok = r;
            this.next();
            return { type: 'Literal', value: null, raw: this.src.slice(r.start, r.end), regex: r.value, start: r.start, end: r.end };
          }
          case '<':
            if (this.jsx) return this.parseJSX();
            break;
          case '@': {
            const decorators = this.parseDecorators();
            return this.parseClass(false, start, decorators, false);
          }
          case '#': break;
          default: break;
        }
        break;
      default: break;
    }
    this.raise(`Unexpected token '${t.value}'`);
    return null;
  }

  parseNew() {
    const start = this.tok.start;
    this.next();
    if (this.is('.')) {
      this.next();
      const property = this.ident(true);
      return this.finish({ type: 'MetaProperty', meta: { type: 'Identifier', name: 'new', start, end: start + 3 }, property }, start);
    }
    const cs = this.tok.start;
    let callee = this.isName('new') ? this.parseNew() : this.parseExprAtom();
    callee = this.parseSubscripts(callee, true);
    if (callee.start == null) callee.start = cs;
    let typeArguments = null;
    if (this.ts && this.is('<')) typeArguments = this.tryParse(null, () => this.parseTypeArgs());
    const args = this.is('(') ? this.parseArguments() : [];
    return this.finish({ type: 'NewExpression', callee, arguments: args, typeArguments }, start);
  }

  parseArray() {
    const start = this.tok.start;
    this.next();
    const elements = [];
    this.noRT(() => {
      while (!this.is(']')) {
        if (this.is(',')) { this.next(); elements.push(null); continue; }
        if (this.is('...')) {
          const s = this.tok.start;
          this.next();
          const argument = this.parseAssign();
          elements.push(this.finish({ type: 'SpreadElement', argument }, s));
        } else elements.push(this.parseAssign());
        if (!this.is(']')) this.expect(',');
      }
    });
    this.next();
    return this.finish({ type: 'ArrayExpression', elements }, start);
  }

  parseObjectLike() {
    return this.parseObject();
  }

  parseObject() {
    const start = this.tok.start;
    this.next();
    const properties = [];
    this.noRT(() => {
      while (!this.is('}')) {
        properties.push(this.parseObjectMember());
        if (!this.is('}')) this.expect(',');
      }
    });
    this.next();
    return this.finish({ type: 'ObjectExpression', properties }, start);
  }

  parseObjectMember() {
    const start = this.tok.start;
    if (this.is('...')) {
      this.next();
      const argument = this.parseAssign();
      return this.finish({ type: 'SpreadElement', argument }, start);
    }
    let isAsync = false;
    let generator = false;
    let kind = 'init';
    if (this.tok.type === 'name' && !this.tok.esc && (this.tok.value === 'async' || this.tok.value === 'get' || this.tok.value === 'set')) {
      const n = this.peek();
      const isMod = !(n.type === 'punct' && [',', ':', '(', '}', '=', '<'].includes(n.value)) && !(this.tok.value === 'async' && n.nl);
      if (isMod) {
        if (this.tok.value === 'async') isAsync = true; else kind = this.tok.value;
        this.next();
      }
    }
    if (this.is('*')) { this.next(); generator = true; }
    const { key, computed } = this.parsePropertyKey(false);
    if (this.is('(') || this.is('<')) {
      const fs = this.tok.start;
      const value = this.withFn(isAsync, generator, () => {
        const typeParameters = this.ts && this.is('<') ? this.parseTypeParams() : null;
        const params = this.parseParams();
        const returnType = this.ts && this.is(':') ? this.parseReturnType() : null;
        const body = this.parseFunctionBody();
        return this.finish({ type: 'FunctionExpression', id: null, params, body, async: isAsync, generator, expression: false, typeParameters, returnType }, fs);
      });
      return this.finish({ type: 'Property', key, value, computed, shorthand: false, kind, method: kind === 'init' }, start);
    }
    if (this.eat(':')) {
      const value = this.parseAssign();
      return this.finish({ type: 'Property', key, value, computed, shorthand: false, kind: 'init', method: false }, start);
    }
    if (key.type !== 'Identifier' || computed) this.raise('Unexpected token in object literal');
    let value = { type: 'Identifier', name: key.name, start: key.start, end: key.end };
    if (this.is('=')) {
      this.next();
      const right = this.parseAssign();
      value = this.finish({ type: 'AssignmentPattern', left: value, right }, key.start);
    }
    return this.finish({ type: 'Property', key, value, computed: false, shorthand: true, kind: 'init', method: false }, start);
  }

  parseTemplate(tagged) {
    const start = this.tok.start;
    const quasis = [];
    const expressions = [];
    let t = this.tok;
    for (;;) {
      if (t.type !== 'template') this.raise('Template expected');
      quasis.push({ type: 'TemplateElement', value: { raw: t.raw, cooked: t.value }, tail: t.tail, start: t.quasiStart, end: t.quasiEnd });
      if (t.tail) { this.next(); break; }
      this.next();
      expressions.push(this.noRT(() => this.parseExpression()));
      if (!this.is('}')) this.raise('Expected } in template');
      const close = this.tok;
      t = this.lex.readTemplate(close.end, false, close.start);
      this.prevEnd = close.end;
      this.tok = t;
    }
    return this.finish({ type: 'TemplateLiteral', quasis, expressions, tagged }, start);
  }

  // ---------------------------------------------------------------- JSX
  parseJSX() {
    const start = this.tok.start;
    this.lex.pos = start + 1;
    const el = this.jsxAfterLt(start);
    this.lex.pos = el.end;
    this.prevEnd = el.end;
    this.tok = this.lex.next();
    return el;
  }

  jsxName() {
    const lex = this.lex;
    const a = lex.readJsxName();
    let name = { type: 'JSXIdentifier', name: a.value, start: a.start, end: a.end };
    if (lex.peekChar() === ':') {
      lex.pos++;
      const b = lex.readJsxName();
      return { type: 'JSXNamespacedName', namespace: name, name: { type: 'JSXIdentifier', name: b.value, start: b.start, end: b.end }, start: a.start, end: b.end };
    }
    while (lex.peekChar() === '.') {
      lex.pos++;
      const b = lex.readJsxName();
      name = { type: 'JSXMemberExpression', object: name, property: { type: 'JSXIdentifier', name: b.value, start: b.start, end: b.end }, start: a.start, end: b.end };
    }
    return name;
  }

  jsxExprAt(open) {
    // open: offset of '{'. Returns [node, endPos]
    const lex = this.lex;
    lex.pos = open + 1;
    lex.jsxSkip();
    if (lex.peekChar() === '}') {
      const end = lex.pos + 1;
      return { type: 'JSXExpressionContainer', expression: { type: 'JSXEmptyExpression', start: open + 1, end: end - 1 }, start: open, end };
    }
    this.tok = lex.next();
    let expression;
    let spread = false;
    if (this.is('...')) { this.next(); spread = true; }
    const sn = this.noArrowRT;
    this.noArrowRT = false;
    try { expression = this.parseExpression(); } finally { this.noArrowRT = sn; }
    if (!this.is('}')) this.raise('Expected } in JSX');
    const end = this.tok.end;
    lex.pos = end;
    return { type: spread ? 'JSXSpreadChild' : 'JSXExpressionContainer', expression, start: open, end };
  }

  jsxAfterLt(start) {
    const lex = this.lex;
    lex.jsxSkip();
    if (lex.peekChar() === '>') {
      lex.pos++;
      const openingFragment = { type: 'JSXOpeningFragment', start, end: lex.pos };
      const { children, closeStart } = this.jsxChildren(null);
      return { type: 'JSXFragment', openingFragment, closingFragment: { type: 'JSXClosingFragment', start: closeStart, end: lex.pos }, children, start, end: lex.pos };
    }
    const name = this.jsxName();
    lex.jsxSkip();
    if (lex.peekChar() === '<' && this.ts) {
      // type arguments on a JSX element: skip balanced <...>
      let depth = 0;
      do {
        const c = lex.src[lex.pos];
        if (c === '<') depth++;
        else if (c === '>') depth--;
        lex.pos++;
      } while (depth > 0 && lex.pos < lex.len);
    }
    const attributes = [];
    let selfClosing = false;
    for (;;) {
      lex.jsxSkip();
      const c = lex.peekChar();
      if (c === undefined) this.raise('Unterminated JSX element', start);
      if (c === '/') {
        lex.pos++;
        lex.jsxSkip();
        if (lex.peekChar() !== '>') this.raise('Expected > in JSX', lex.pos);
        lex.pos++;
        selfClosing = true;
        break;
      }
      if (c === '>') { lex.pos++; break; }
      if (c === '{') {
        const as = lex.pos;
        lex.pos++;
        this.tok = lex.next();
        this.expect('...');
        const argument = this.parseAssign();
        if (!this.is('}')) this.raise('Expected } in JSX attribute');
        lex.pos = this.tok.end;
        attributes.push({ type: 'JSXSpreadAttribute', argument, start: as, end: lex.pos });
        continue;
      }
      const as = lex.pos;
      const an = lex.readJsxName();
      let aname = { type: 'JSXIdentifier', name: an.value, start: an.start, end: an.end };
      if (lex.peekChar() === ':') {
        lex.pos++;
        const b = lex.readJsxName();
        aname = { type: 'JSXNamespacedName', namespace: aname, name: { type: 'JSXIdentifier', name: b.value, start: b.start, end: b.end }, start: an.start, end: b.end };
      }
      lex.jsxSkip();
      let value = null;
      if (lex.peekChar() === '=') {
        lex.pos++;
        lex.jsxSkip();
        const vc = lex.peekChar();
        if (vc === '"' || vc === "'") {
          const s = lex.readJsxString();
          value = { type: 'Literal', value: s.value, raw: s.raw, start: s.start, end: s.end };
        } else if (vc === '{') {
          value = this.jsxExprAt(lex.pos);
          lex.pos = value.end;
        } else if (vc === '<') {
          const es = lex.pos;
          lex.pos++;
          value = this.jsxAfterLt(es);
        } else this.raise('JSX attribute value expected', lex.pos);
      }
      attributes.push({ type: 'JSXAttribute', name: aname, value, start: as, end: value ? value.end : aname.end });
    }
    const openingElement = { type: 'JSXOpeningElement', name, attributes, selfClosing, start, end: lex.pos };
    if (selfClosing) return { type: 'JSXElement', openingElement, closingElement: null, children: [], start, end: lex.pos };
    const { children, closeStart, closeName } = this.jsxChildren(name);
    const closingElement = { type: 'JSXClosingElement', name: closeName, start: closeStart, end: lex.pos };
    return { type: 'JSXElement', openingElement, closingElement, children, start, end: lex.pos };
  }

  jsxChildren(openName) {
    const lex = this.lex;
    const children = [];
    for (;;) {
      const text = lex.readJsxText();
      if (text.raw) children.push({ type: 'JSXText', value: text.value, raw: text.raw, start: text.start, end: text.end });
      const c = lex.peekChar();
      if (c === undefined) this.raise('Unterminated JSX contents');
      if (c === '{') {
        const node = this.jsxExprAt(lex.pos);
        lex.pos = node.end;
        children.push(node);
        continue;
      }
      // '<'
      const lt = lex.pos;
      lex.pos++;
      lex.jsxSkip();
      if (lex.peekChar() === '/') {
        lex.pos++;
        lex.jsxSkip();
        let closeName = null;
        if (lex.peekChar() !== '>') closeName = this.jsxName();
        lex.jsxSkip();
        if (lex.peekChar() !== '>') this.raise('Expected > in closing tag', lex.pos);
        lex.pos++;
        if (jsxNameText(closeName) !== jsxNameText(openName)) this.raise('Mismatched closing tag', lt);
        return { children, closeStart: lt, closeName };
      }
      lex.pos = lt + 1;
      children.push(this.jsxAfterLt(lt));
    }
  }

  // ---------------------------------------------------------------- TS types
  expectGt() {
    const t = this.tok;
    if (t.type === 'punct' && t.value[0] === '>') {
      if (t.value === '>') { this.next(); return; }
      // split >> / >= / >>= / >>>
      this.lex.pos = t.start + 1;
      this.prevEnd = t.start + 1;
      this.tok = this.lex.next();
      return;
    }
    this.raise(`Expected '>' but found '${t.value}'`);
  }

  parseTypeAnnotation() {
    const start = this.tok.start;
    this.expect(':');
    const typeAnnotation = this.parseType();
    return this.finish({ type: 'TSTypeAnnotation', typeAnnotation }, start);
  }

  parseReturnType() {
    const start = this.tok.start;
    this.expect(':');
    const typeAnnotation = this.parseTypeOrPredicate();
    return this.finish({ type: 'TSTypeAnnotation', typeAnnotation }, start);
  }

  parseTypeOrPredicate() {
    const start = this.tok.start;
    if (this.isName('asserts')) {
      const n = this.peek();
      if (n.type === 'name' && !n.nl) {
        this.next();
        const parameterName = this.ident(true);
        let typeAnnotation = null;
        if (this.isName('is') && !this.tok.nl) { this.next(); typeAnnotation = this.parseType(); }
        return this.finish({ type: 'TSTypePredicate', asserts: true, parameterName, typeAnnotation }, start);
      }
    }
    if (this.tok.type === 'name') {
      const n = this.peek();
      if (n.type === 'name' && n.value === 'is' && !n.nl) {
        const parameterName = this.ident(true);
        this.next();
        const typeAnnotation = this.parseType();
        return this.finish({ type: 'TSTypePredicate', asserts: false, parameterName, typeAnnotation }, start);
      }
    }
    return this.parseType();
  }

  parseTypeParams() {
    const start = this.tok.start;
    this.expect('<');
    const params = [];
    while (!this.is('>')) {
      const ps = this.tok.start;
      const mods = {};
      while (this.tok.type === 'name' && (this.tok.value === 'const' || this.tok.value === 'in' || this.tok.value === 'out')) {
        const n = this.peek();
        if (n.type !== 'name') break;
        mods[this.tok.value] = true;
        this.next();
      }
      const name = this.ident(true);
      let constraint = null;
      let def = null;
      if (this.eatName('extends')) constraint = this.parseType();
      if (this.eat('=')) def = this.parseType();
      params.push(this.finish({ type: 'TSTypeParameter', name, constraint, default: def, ...mods }, ps));
      if (!this.is('>')) this.expect(',');
    }
    this.expectGt();
    return this.finish({ type: 'TSTypeParameterDeclaration', params }, start);
  }

  parseTypeArgs() {
    const start = this.tok.start;
    this.expect('<');
    const params = [];
    while (!(this.tok.type === 'punct' && this.tok.value[0] === '>')) {
      params.push(this.parseType());
      if (!(this.tok.type === 'punct' && this.tok.value[0] === '>')) this.expect(',');
    }
    this.expectGt();
    return this.finish({ type: 'TSTypeParameterInstantiation', params }, start);
  }

  parseEntityName(allowReserved, allowThis) {
    const start = this.tok.start;
    let node = this.isName('this') && allowThis !== false ? this.ident(true) : this.ident(true);
    while (this.is('.')) {
      this.next();
      const right = this.ident(true);
      node = this.finish({ type: 'TSQualifiedName', left: node, right }, start);
    }
    return node;
  }

  parseType() {
    const start = this.tok.start;
    if (this.is('<')) return this.parseFunctionType(start, false);
    if (this.is('(')) {
      const ft = this.tryParse('f' + start, () => this.parseFunctionType(start, false));
      if (ft) return ft;
    }
    if (this.isName('new')) return this.parseFunctionType(start, true);
    if (this.isName('abstract') && this.peek().value === 'new') { this.next(); return this.parseFunctionType(start, true); }
    const t = this.parseUnionType();
    if (!this.inCondExtends && this.isName('extends') && !this.tok.nl) {
      this.next();
      const sc = this.inCondExtends;
      this.inCondExtends = true;
      let extendsType;
      try { extendsType = this.parseType(); } finally { this.inCondExtends = sc; }
      this.expect('?');
      const sc2 = this.inCondExtends;
      this.inCondExtends = false;
      let trueType;
      let falseType;
      try {
        trueType = this.parseType();
        this.expect(':');
        falseType = this.parseType();
      } finally { this.inCondExtends = sc2; }
      return this.finish({ type: 'TSConditionalType', checkType: t, extendsType, trueType, falseType }, start);
    }
    return t;
  }

  parseFunctionType(start, isCtor) {
    if (isCtor) this.expectName('new');
    const typeParameters = this.is('<') ? this.parseTypeParams() : null;
    const params = this.parseParams();
    this.expect('=>');
    const sc = this.inCondExtends;
    this.inCondExtends = false;
    let rt;
    try { rt = this.parseTypeOrPredicate(); } finally { this.inCondExtends = sc; }
    const returnType = { type: 'TSTypeAnnotation', typeAnnotation: rt, start: rt.start, end: rt.end };
    return this.finish({ type: isCtor ? 'TSConstructorType' : 'TSFunctionType', typeParameters, params, returnType }, start);
  }

  parseUnionType() {
    const start = this.tok.start;
    const leading = this.eat('|');
    const types = [this.parseIntersectionType()];
    while (this.is('|')) { this.next(); types.push(this.parseIntersectionType()); }
    if (types.length === 1 && !leading) return types[0];
    if (types.length === 1) return types[0];
    return this.finish({ type: 'TSUnionType', types }, start);
  }

  parseIntersectionType() {
    const start = this.tok.start;
    this.eat('&');
    const types = [this.parseTypeOperator()];
    while (this.is('&')) { this.next(); types.push(this.parseTypeOperator()); }
    if (types.length === 1) return types[0];
    return this.finish({ type: 'TSIntersectionType', types }, start);
  }

  parseTypeOperator() {
    const start = this.tok.start;
    const t = this.tok;
    if (t.type === 'name' && (t.value === 'keyof' || t.value === 'unique' || t.value === 'readonly')) {
      const n = this.peek();
      if (!(n.type === 'punct' && [',', ')', ']', '>', '=', ';', '|', '&', '}', '?', ':'].includes(n.value)) && n.type !== 'eof') {
        this.next();
        const typeAnnotation = this.parseTypeOperator();
        return this.finish({ type: 'TSTypeOperator', operator: t.value, typeAnnotation }, start);
      }
    }
    if (t.type === 'name' && t.value === 'infer') {
      const n = this.peek();
      if (n.type === 'name') {
        this.next();
        const ps = this.tok.start;
        const name = this.ident(true);
        let constraint = null;
        // TS 4.7 "infer U extends C": always a constraint inside the extends
        // clause of a conditional type; elsewhere (in parentheses, tuples,
        // ...) only when no "?" follows, otherwise it starts a conditional.
        if (this.isName('extends')) {
          const outer = this.inCondExtends;
          const c = this.tryParse(null, () => {
            this.next();
            this.inCondExtends = true;
            try {
              const ty = this.parseType();
              if (!outer && this.is('?')) this.raise('conditional');
              return ty;
            } finally { this.inCondExtends = outer; }
          });
          if (c) constraint = c;
        }
        const typeParameter = this.finish({ type: 'TSTypeParameter', name, constraint }, ps);
        return this.finish({ type: 'TSInferType', typeParameter }, start);
      }
    }
    return this.parsePostfixType();
  }

  parsePostfixType() {
    const start = this.tok.start;
    let t = this.parsePrimaryType();
    while (this.is('[') && !this.tok.nl) {
      this.next();
      if (this.eat(']')) { t = this.finish({ type: 'TSArrayType', elementType: t }, start); continue; }
      const indexType = this.parseType();
      this.expect(']');
      t = this.finish({ type: 'TSIndexedAccessType', objectType: t, indexType }, start);
    }
    return t;
  }

  parsePrimaryType() {
    const t = this.tok;
    const start = t.start;
    if (t.type === 'name') {
      const v = t.value;
      if (TS_KEYWORD_TYPES[v] && !t.esc) {
        const n = this.peek();
        if (!(n.type === 'punct' && n.value === '.')) {
          this.next();
          return this.finish({ type: TS_KEYWORD_TYPES[v] }, start);
        }
      }
      if (v === 'this') { this.next(); return this.finish({ type: 'TSThisType' }, start); }
      if (v === 'true' || v === 'false') {
        this.next();
        return this.finish({ type: 'TSLiteralType', literal: { type: 'Literal', value: v === 'true', raw: v, start, end: t.end } }, start);
      }
      if (v === 'typeof') {
        this.next();
        let exprName;
        if (this.isName('import')) exprName = this.parseImportType();
        else exprName = this.parseEntityName(true, true);
        const typeArguments = this.is('<') && !this.tok.nl ? this.parseTypeArgs() : null;
        return this.finish({ type: 'TSTypeQuery', exprName, typeArguments }, start);
      }
      if (v === 'import') return this.parseImportType();
      const typeName = this.parseEntityName(true, true);
      const typeArguments = this.is('<') ? this.parseTypeArgs() : null;
      return this.finish({ type: 'TSTypeReference', typeName, typeArguments }, start);
    }
    if (t.type === 'str' || t.type === 'num') {
      this.next();
      return this.finish({ type: 'TSLiteralType', literal: this.literalFromTok(t) }, start);
    }
    if (t.type === 'template') {
      const lit = this.parseTemplateType();
      return lit;
    }
    if (t.type === 'punct') {
      switch (t.value) {
        case '-': {
          this.next();
          const n = this.tok;
          if (n.type !== 'num') this.raise('Number expected');
          this.next();
          const lit = this.literalFromTok(n);
          return this.finish({ type: 'TSLiteralType', literal: { type: 'UnaryExpression', operator: '-', prefix: true, argument: lit, start, end: n.end } }, start);
        }
        case '{': {
          if (this.isStartOfMappedType()) return this.parseMappedType();
          const members = this.parseTypeMembers();
          return this.finish({ type: 'TSTypeLiteral', members }, start);
        }
        case '[': return this.parseTupleType();
        case '(': {
          this.next();
          const inner = this.noCond(() => this.parseType());
          this.expect(')');
          return inner;
        }
        case '?': case '*': this.next(); return this.finish({ type: 'TSUnknownKeyword' }, start);
        default: break;
      }
    }
    this.raise(`Type expected but found '${t.value}'`);
    return null;
  }

  noCond(fn) {
    const s = this.inCondExtends;
    this.inCondExtends = false;
    try { return fn(); } finally { this.inCondExtends = s; }
  }

  parseImportType() {
    const start = this.tok.start;
    this.expectName('import');
    this.expect('(');
    const argument = this.parseType();
    if (this.eat(',')) { this.parseObject(); this.eat(','); }
    this.expect(')');
    let qualifier = null;
    if (this.eat('.')) qualifier = this.parseEntityName(true);
    const typeArguments = this.is('<') ? this.parseTypeArgs() : null;
    return this.finish({ type: 'TSImportType', argument, qualifier, typeArguments }, start);
  }

  parseTemplateType() {
    const start = this.tok.start;
    const quasis = [];
    const types = [];
    let t = this.tok;
    for (;;) {
      quasis.push({ type: 'TemplateElement', value: { raw: t.raw, cooked: t.value }, tail: t.tail, start: t.quasiStart, end: t.quasiEnd });
      if (t.tail) { this.next(); break; }
      this.next();
      types.push(this.parseType());
      if (!this.is('}')) this.raise('Expected } in template type');
      const close = this.tok;
      t = this.lex.readTemplate(close.end, false, close.start);
      this.prevEnd = close.end;
      this.tok = t;
    }
    return this.finish({ type: 'TSTemplateLiteralType', quasis, types }, start);
  }

  isStartOfMappedType() {
    const s = this.snapshot();
    try {
      this.next();
      if (this.is('+') || this.is('-')) { this.next(); if (!this.isName('readonly')) return false; this.next(); } else if (this.isName('readonly')) this.next();
      if (!this.is('[')) return false;
      this.next();
      if (this.tok.type !== 'name') return false;
      this.next();
      return this.isName('in');
    } catch (e) {
      return false;
    } finally { this.restore(s); }
  }

  parseMappedType() {
    const start = this.tok.start;
    this.expect('{');
    let readonly;
    if (this.is('+') || this.is('-')) { readonly = this.tok.value; this.next(); this.expectName('readonly'); } else if (this.eatName('readonly')) readonly = true;
    this.expect('[');
    const ps = this.tok.start;
    const name = this.ident(true);
    this.expectName('in');
    const constraint = this.parseType();
    const typeParameter = this.finish({ type: 'TSTypeParameter', name, constraint }, ps);
    let nameType = null;
    if (this.eatName('as')) nameType = this.parseType();
    this.expect(']');
    let optional;
    if (this.is('+') || this.is('-')) { optional = this.tok.value; this.next(); this.expect('?'); } else if (this.eat('?')) optional = true;
    let typeAnnotation = null;
    if (this.eat(':')) typeAnnotation = this.parseType();
    this.eat(';') || this.eat(',');
    this.expect('}');
    return this.finish({ type: 'TSMappedType', typeParameter, nameType, readonly, optional, typeAnnotation }, start);
  }

  parseTupleType() {
    const start = this.tok.start;
    this.expect('[');
    const elementTypes = [];
    while (!this.is(']')) {
      const es = this.tok.start;
      if (this.is('...')) {
        this.next();
        let inner;
        if (this.tok.type === 'name' && this.peek().value === ':') {
          const label = this.ident(true);
          this.next();
          const et = this.parseType();
          inner = this.finish({ type: 'TSNamedTupleMember', label, elementType: et, optional: false }, label.start);
        } else inner = this.parseType();
        elementTypes.push(this.finish({ type: 'TSRestType', typeAnnotation: inner }, es));
      } else if (this.tok.type === 'name' && (this.peek().value === ':' || (this.peek().value === '?' && this.peek2()[1].value === ':'))) {
        const label = this.ident(true);
        const optional = this.eat('?');
        this.expect(':');
        const elementType = this.parseType();
        elementTypes.push(this.finish({ type: 'TSNamedTupleMember', label, elementType, optional }, es));
      } else {
        let et = this.parseType();
        if (this.is('?')) { this.next(); et = this.finish({ type: 'TSOptionalType', typeAnnotation: et }, es); }
        elementTypes.push(et);
      }
      if (!this.is(']')) this.expect(',');
    }
    this.next();
    return this.finish({ type: 'TSTupleType', elementTypes }, start);
  }

  parseTypeMembers() {
    this.expect('{');
    const members = [];
    while (!this.eat('}')) {
      if (this.tok.type === 'eof') this.raise('Unexpected end of input');
      members.push(this.parseTypeMember());
      if (!this.eat(';') && !this.eat(',')) {
        if (!this.is('}') && !this.tok.nl) this.raise(`Unexpected '${this.tok.value}' in type`);
      }
    }
    return members;
  }

  parseIndexSignature(start) {
    this.expect('[');
    const ps = this.tok.start;
    const name = this.ident(true);
    const pta = this.parseTypeAnnotation();
    const param = { type: 'Identifier', name: name.name, typeAnnotation: pta, start: ps, end: this.prevEnd };
    this.expect(']');
    const typeAnnotation = this.is(':') ? this.parseTypeAnnotation() : null;
    return this.finish({ type: 'TSIndexSignature', parameters: [param], typeAnnotation }, start);
  }

  parseSignatureRest(start, node) {
    node.typeParameters = this.is('<') ? this.parseTypeParams() : null;
    node.params = this.parseParams();
    node.returnType = this.is(':') ? this.parseReturnType() : null;
    return this.finish(node, start);
  }

  parseTypeMember() {
    const start = this.tok.start;
    if (this.is('(') || this.is('<')) return this.parseSignatureRest(start, { type: 'TSCallSignatureDeclaration' });
    if (this.isName('new') && (this.peek().value === '(' || this.peek().value === '<')) {
      this.next();
      return this.parseSignatureRest(start, { type: 'TSConstructSignatureDeclaration' });
    }
    let readonly = false;
    if (this.isName('readonly')) {
      const n = this.peek();
      if (n.type === 'name' || n.type === 'str' || n.type === 'num' || (n.type === 'punct' && n.value === '[')) { this.next(); readonly = true; }
    }
    if (this.is('[')) {
      const sig = this.tryParse(null, () => this.parseIndexSignature(start));
      if (sig) { sig.readonly = readonly; return sig; }
    }
    let kind = 'method';
    if ((this.isName('get') || this.isName('set'))) {
      const n = this.peek();
      if (n.type === 'name' || n.type === 'str' || n.type === 'num' || (n.type === 'punct' && n.value === '[')) { kind = this.tok.value; this.next(); }
    }
    const { key, computed } = this.parsePropertyKey(false);
    const optional = this.eat('?');
    if (this.is('(') || this.is('<')) {
      return this.parseSignatureRest(start, { type: 'TSMethodSignature', key, computed, optional, kind, readonly });
    }
    const typeAnnotation = this.is(':') ? this.parseTypeAnnotation() : null;
    return this.finish({ type: 'TSPropertySignature', key, computed, optional, readonly, typeAnnotation }, start);
  }
}

function jsxNameText(n) {
  if (!n) return '';
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXNamespacedName') return `${n.namespace.name}:${n.name.name}`;
  if (n.type === 'JSXMemberExpression') return `${jsxNameText(n.object)}.${n.property.name}`;
  return '';
}

function parse(src, opts = {}) {
  const p = new Parser(src, opts);
  return p.parseProgram();
}

module.exports = { parse, Parser, ParseError, LexError, jsxNameText };
