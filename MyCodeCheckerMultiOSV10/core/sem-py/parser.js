'use strict';

// Tolerant recursive-descent parser for Python 3.12-3.14. The AST mirrors
// CPython's `ast` module (node type names and field names) so the rules read
// like Python tooling. Positions: line 1-based, col 0-based (characters).
//
// Error handling: a statement that fails to parse becomes an `ErrorStmt` node
// (the parser resyncs at the next logical line / skips its indented block) and
// every enclosing function is marked `hasError`. parse() never throws.

const { Tokenizer } = require('./tokenizer');

const KEYWORDS = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or',
  'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']);

const AUG = new Set(['+=', '-=', '*=', '/=', '//=', '%=', '**=', '>>=', '<<=', '&=', '|=', '^=', '@=']);
const COMP_OPS = new Set(['<', '>', '==', '>=', '<=', '!=']);
const BINOP = { '+': 'Add', '-': 'Sub', '*': 'Mult', '/': 'Div', '//': 'FloorDiv', '%': 'Mod', '**': 'Pow', '@': 'MatMult', '<<': 'LShift', '>>': 'RShift', '&': 'BitAnd', '|': 'BitOr', '^': 'BitXor' };
const CMPOP = { '<': 'Lt', '>': 'Gt', '==': 'Eq', '>=': 'GtE', '<=': 'LtE', '!=': 'NotEq', in: 'In', 'not in': 'NotIn', is: 'Is', 'is not': 'IsNot' };

class ParseError extends Error {
  constructor(msg, tok) {
    super(msg);
    this.tok = tok;
    this.isParseError = true;
  }
}

class Parser {
  constructor(src, tokens, opts = {}) {
    this.src = src;
    this.toks = tokens;
    this.i = 0;
    this.errors = opts.errors || [];
    this.fnStack = [];
    this.depth = 0;
  }

  get tok() { return this.toks[this.i]; }
  peek(k = 1) { return this.toks[Math.min(this.i + k, this.toks.length - 1)]; }
  prev() { return this.toks[this.i - 1] || this.toks[0]; }
  next() { const t = this.toks[this.i]; if (this.i < this.toks.length - 1) this.i++; return t; }
  isOp(v, t = this.tok) { return t.t === 'OP' && t.v === v; }
  isKw(v, t = this.tok) { return t.t === 'NAME' && t.v === v; }
  isName(t = this.tok) { return t.t === 'NAME' && !KEYWORDS.has(t.v); }
  eatOp(v) { if (this.isOp(v)) { this.next(); return true; } return false; }
  eatKw(v) { if (this.isKw(v)) { this.next(); return true; } return false; }
  fail(msg, t = this.tok) { throw new ParseError(msg, t); }
  expectOp(v) { if (!this.isOp(v)) this.fail(`expected '${v}'`); return this.next(); }
  expectKw(v) { if (!this.isKw(v)) this.fail(`expected '${v}'`); return this.next(); }
  expectName() { if (!this.isName()) this.fail('expected name'); return this.next(); }

  node(type, start, fields) {
    const end = this.prev();
    const n = { type, line: start.line, col: start.col, endLine: end.endLine, endCol: end.endCol };
    return Object.assign(n, fields);
  }
  // node spanning from another node's start
  nodeFrom(type, first, fields) {
    const end = this.prev();
    const n = { type, line: first.line, col: first.col, endLine: end.endLine, endCol: end.endCol };
    return Object.assign(n, fields);
  }

  // ── module / statements ───────────────────────────────────
  parseModule() {
    const body = [];
    while (this.tok.t !== 'ENDMARKER') {
      if (this.tok.t === 'NEWLINE' || this.tok.t === 'DEDENT') { this.next(); continue; }
      if (this.tok.t === 'INDENT') {
        this.error('unexpected indent', this.tok);
        this.skipBlock();
        continue;
      }
      body.push(...this.parseStatementSafe());
    }
    return { type: 'Module', body, line: 1, col: 0, endLine: this.tok.line, endCol: 0 };
  }

  error(msg, tok) {
    this.errors.push({ msg, line: tok ? tok.line : 0, col: tok ? tok.col : 0 });
    for (const fn of this.fnStack) fn.hasError = true;
  }

  skipBlock() {
    // at INDENT: skip to the matching DEDENT
    let d = 0;
    do {
      const t = this.next();
      if (t.t === 'INDENT') d++;
      else if (t.t === 'DEDENT') d--;
      if (t.t === 'ENDMARKER') return;
    } while (d > 0);
  }

  parseStatementSafe() {
    const start = this.i;
    const startTok = this.tok;
    try {
      return this.parseStatement();
    } catch (e) {
      if (!e.isParseError) throw e;
      this.error(e.message, e.tok || startTok);
      // resync: to the end of the logical line, then skip an indented block
      if (this.i < start) this.i = start;
      while (this.tok.t !== 'NEWLINE' && this.tok.t !== 'ENDMARKER') {
        if (this.tok.t === 'INDENT') { this.skipBlock(); continue; }
        if (this.tok.t === 'DEDENT') break;
        this.next();
      }
      if (this.tok.t === 'NEWLINE') this.next();
      if (this.tok.t === 'INDENT') this.skipBlock();
      if (this.i === start) this.next();
      const end = this.prev();
      return [{ type: 'ErrorStmt', line: startTok.line, col: startTok.col, endLine: end.endLine, endCol: end.endCol, msg: e.message }];
    }
  }

  parseStatement() {
    const t = this.tok;
    if (t.t === 'NAME') {
      switch (t.v) {
        case 'if': return [this.parseIf()];
        case 'while': return [this.parseWhile()];
        case 'for': return [this.parseFor(null)];
        case 'try': return [this.parseTry()];
        case 'with': return [this.parseWith(null)];
        case 'def': return [this.parseFunction([], null)];
        case 'class': return [this.parseClass([])];
        case 'async': {
          const n = this.peek();
          if (this.isKw('def', n)) { const a = this.next(); return [this.parseFunction([], a)]; }
          if (this.isKw('for', n)) { const a = this.next(); return [this.parseFor(a)]; }
          if (this.isKw('with', n)) { const a = this.next(); return [this.parseWith(a)]; }
          break;
        }
        case 'match': {
          const m = this.tryMatch();
          if (m) return [m];
          break;
        }
        default: break;
      }
    } else if (this.isOp('@')) {
      return [this.parseDecorated()];
    }
    return this.parseSimpleStatements();
  }

  parseSimpleStatements() {
    const out = [this.parseSmallStatement()];
    while (this.isOp(';')) {
      this.next();
      if (this.tok.t === 'NEWLINE' || this.tok.t === 'ENDMARKER') break;
      out.push(this.parseSmallStatement());
    }
    if (this.tok.t === 'NEWLINE') this.next();
    else if (this.tok.t !== 'ENDMARKER' && this.tok.t !== 'DEDENT') this.fail('invalid syntax');
    return out;
  }

  parseSmallStatement() {
    const t = this.tok;
    if (t.t === 'NAME') {
      switch (t.v) {
        case 'pass': this.next(); return this.node('Pass', t, {});
        case 'break': this.next(); return this.node('Break', t, {});
        case 'continue': this.next(); return this.node('Continue', t, {});
        case 'return': {
          this.next();
          const value = this.atStmtEnd() ? null : this.parseStarExpressions();
          return this.node('Return', t, { value });
        }
        case 'raise': {
          this.next();
          let exc = null;
          let cause = null;
          if (!this.atStmtEnd()) {
            exc = this.parseTest();
            if (this.eatKw('from')) cause = this.parseTest();
          }
          return this.node('Raise', t, { exc, cause });
        }
        case 'global':
        case 'nonlocal': {
          this.next();
          const names = [this.expectName().v];
          while (this.eatOp(',')) names.push(this.expectName().v);
          return this.node(t.v === 'global' ? 'Global' : 'Nonlocal', t, { names });
        }
        case 'del': {
          this.next();
          const targets = [];
          do {
            if (this.atStmtEnd()) break;
            const e = this.parseBitOrStar();
            setCtx(e, 'Del');
            targets.push(e);
          } while (this.eatOp(','));
          return this.node('Delete', t, { targets });
        }
        case 'assert': {
          this.next();
          const test = this.parseTest();
          const msg = this.eatOp(',') ? this.parseTest() : null;
          return this.node('Assert', t, { test, msg });
        }
        case 'import': return this.parseImport();
        case 'from': return this.parseFromImport();
        case 'type': {
          const n1 = this.peek();
          if (this.isName(n1) && (this.isOp('=', this.peek(2)) || this.isOp('[', this.peek(2)))) {
            this.next();
            const nameTok = this.next();
            const name = this.node('Name', nameTok, { id: nameTok.v, ctx: 'Store' });
            const typeParams = this.isOp('[') ? this.parseTypeParams() : [];
            this.expectOp('=');
            const value = this.parseTest();
            return this.node('TypeAlias', t, { name, type_params: typeParams, value });
          }
          break;
        }
        default: break;
      }
    }
    // expression / assignment
    const first = this.isKw('yield') ? this.parseYield() : this.parseStarExpressions(true);
    if (this.isOp('=')) {
      const targets = [first];
      let value = null;
      while (this.eatOp('=')) {
        const v = this.isKw('yield') ? this.parseYield() : this.parseStarExpressions(true);
        targets.push(v);
      }
      value = targets.pop();
      for (const tg of targets) setCtx(tg, 'Store');
      const n = this.nodeFrom('Assign', t, { targets, value });
      return n;
    }
    if (this.tok.t === 'OP' && AUG.has(this.tok.v)) {
      const opTok = this.next();
      const value = this.isKw('yield') ? this.parseYield() : this.parseStarExpressions();
      setCtx(first, 'Store');
      return this.nodeFrom('AugAssign', t, { target: first, op: BINOP[opTok.v.slice(0, -1)], value });
    }
    if (this.isOp(':')) {
      this.next();
      const annotation = this.parseTest();
      let value = null;
      if (this.eatOp('=')) value = this.isKw('yield') ? this.parseYield() : this.parseStarExpressions();
      setCtx(first, 'Store');
      return this.nodeFrom('AnnAssign', t, { target: first, annotation, value, simple: first.type === 'Name' && !first.parenthesized ? 1 : 0 });
    }
    return this.nodeFrom('Expr', t, { value: first });
  }

  atStmtEnd() {
    const t = this.tok;
    return t.t === 'NEWLINE' || t.t === 'ENDMARKER' || t.t === 'DEDENT' || this.isOp(';');
  }

  parseDottedName() {
    let name = this.expectName().v;
    while (this.isOp('.')) { this.next(); name += '.' + this.expectName().v; }
    return name;
  }

  parseImport() {
    const t = this.next();
    const names = [];
    do {
      const st = this.tok;
      const name = this.parseDottedName();
      let asname = null;
      if (this.eatKw('as')) asname = this.expectName().v;
      names.push(this.node('alias', st, { name, asname }));
    } while (this.eatOp(','));
    return this.node('Import', t, { names });
  }

  parseFromImport() {
    const t = this.next();
    let level = 0;
    while (this.isOp('.') || this.isOp('...')) { level += this.tok.v.length; this.next(); }
    let module = null;
    if (!this.isKw('import')) module = this.parseDottedName();
    this.expectKw('import');
    const names = [];
    if (this.isOp('*')) {
      const st = this.next();
      names.push(this.node('alias', st, { name: '*', asname: null }));
    } else {
      const paren = this.eatOp('(');
      do {
        if (paren && this.isOp(')')) break;
        const st = this.tok;
        const name = this.expectName().v;
        let asname = null;
        if (this.eatKw('as')) asname = this.expectName().v;
        names.push(this.node('alias', st, { name, asname }));
      } while (this.eatOp(','));
      if (paren) this.expectOp(')');
    }
    return this.node('ImportFrom', t, { module, names, level });
  }

  // block after ':'
  parseBlock() {
    this.expectOp(':');
    if (this.tok.t !== 'NEWLINE') {
      return this.parseSimpleStatements();
    }
    this.next();
    if (this.tok.t !== 'INDENT') this.fail('expected an indented block');
    this.next();
    const body = [];
    while (this.tok.t !== 'DEDENT' && this.tok.t !== 'ENDMARKER') {
      if (this.tok.t === 'NEWLINE') { this.next(); continue; }
      if (this.tok.t === 'INDENT') { this.error('unexpected indent', this.tok); this.skipBlock(); continue; }
      body.push(...this.parseStatementSafe());
    }
    if (this.tok.t === 'DEDENT') this.next();
    return body;
  }

  parseIf() {
    const t = this.next();
    const test = this.parseNamedExpr();
    const body = this.parseBlock();
    let orelse = [];
    if (this.isKw('elif')) {
      orelse = [this.parseIf()];
    } else if (this.isKw('else')) {
      this.next();
      orelse = this.parseBlock();
    }
    const n = this.node('If', t, { test, body, orelse });
    if (t.v === 'elif') n.isElif = true;
    return n;
  }

  parseWhile() {
    const t = this.next();
    const test = this.parseNamedExpr();
    const body = this.parseBlock();
    let orelse = [];
    if (this.eatKw('else')) orelse = this.parseBlock();
    return this.node('While', t, { test, body, orelse });
  }

  parseFor(asyncTok) {
    const t = this.next();
    const target = this.parseTargetList();
    setCtx(target, 'Store');
    this.expectKw('in');
    const iter = this.parseStarExpressions();
    const body = this.parseBlock();
    let orelse = [];
    if (this.eatKw('else')) orelse = this.parseBlock();
    return this.node(asyncTok ? 'AsyncFor' : 'For', asyncTok || t, { target, iter, body, orelse });
  }

  parseTargetList() {
    const st = this.tok;
    const elts = [this.parseBitOrStar()];
    let comma = false;
    while (this.isOp(',')) {
      this.next();
      comma = true;
      if (this.isKw('in') || this.isOp('=')) break;
      elts.push(this.parseBitOrStar());
    }
    if (!comma) return elts[0];
    return this.node('Tuple', st, { elts, ctx: 'Load' });
  }

  parseBitOrStar() {
    if (this.isOp('*')) {
      const t = this.next();
      const value = this.parseBitOr();
      return this.node('Starred', t, { value, ctx: 'Load' });
    }
    return this.parseBitOr();
  }

  parseTry() {
    const t = this.next();
    const body = this.parseBlock();
    const handlers = [];
    let star = false;
    while (this.isKw('except')) {
      const et = this.next();
      if (this.eatOp('*')) star = true;
      let type = null;
      let name = null;
      let nameTok = null;
      if (!this.isOp(':')) {
        const st = this.tok;
        type = this.parseTest();
        if (this.isOp(',')) {
          // PEP 758: except A, B:
          const elts = [type];
          while (this.eatOp(',')) { if (this.isOp(':') || this.isKw('as')) break; elts.push(this.parseTest()); }
          type = this.node('Tuple', st, { elts, ctx: 'Load' });
        }
        if (this.eatKw('as')) {
          nameTok = this.expectName();
          name = nameTok.v;
        }
      }
      const hb = this.parseBlock();
      const h = this.node('ExceptHandler', et, { etype: type, name, body: hb });
      if (name) { h.nameLine = nameTok.line; h.nameCol = nameTok.col; }
      handlers.push(h);
    }
    let orelse = [];
    let finalbody = [];
    if (this.eatKw('else')) orelse = this.parseBlock();
    if (this.eatKw('finally')) finalbody = this.parseBlock();
    if (!handlers.length && !finalbody.length) this.fail("expected 'except' or 'finally' block");
    return this.node(star ? 'TryStar' : 'Try', t, { body, handlers, orelse, finalbody });
  }

  parseWith(asyncTok) {
    const t = this.next();
    let items = null;
    if (this.isOp('(')) {
      const save = this.i;
      const saveErr = this.errors.length;
      try {
        this.next();
        items = [];
        while (!this.isOp(')')) {
          items.push(this.parseWithItem());
          if (!this.eatOp(',')) break;
        }
        this.expectOp(')');
        if (!this.isOp(':')) throw new ParseError('not parenthesized items', this.tok);
      } catch (e) {
        if (!e.isParseError) throw e;
        this.i = save;
        this.errors.length = saveErr;
        items = null;
      }
    }
    if (!items) {
      items = [this.parseWithItem()];
      while (this.eatOp(',')) items.push(this.parseWithItem());
    }
    const body = this.parseBlock();
    return this.node(asyncTok ? 'AsyncWith' : 'With', asyncTok || t, { items, body });
  }

  parseWithItem() {
    const context_expr = this.parseTest();
    let optional_vars = null;
    if (this.eatKw('as')) {
      optional_vars = this.parseBitOrStar();
      setCtx(optional_vars, 'Store');
    }
    return { type: 'withitem', context_expr, optional_vars, line: context_expr.line, col: context_expr.col };
  }

  parseDecorated() {
    const decorators = [];
    while (this.isOp('@')) {
      this.next();
      decorators.push(this.parseNamedExpr());
      if (this.tok.t !== 'NEWLINE') this.fail('expected newline after decorator');
      this.next();
    }
    if (this.isKw('def')) return this.parseFunction(decorators, null);
    if (this.isKw('async') && this.isKw('def', this.peek())) { const a = this.next(); return this.parseFunction(decorators, a); }
    if (this.isKw('class')) return this.parseClass(decorators);
    this.fail('expected def or class after decorator');
    return null;
  }

  parseTypeParams() {
    this.expectOp('[');
    const params = [];
    while (!this.isOp(']')) {
      const st = this.tok;
      let kind = 'TypeVar';
      if (this.eatOp('**')) kind = 'ParamSpec';
      else if (this.eatOp('*')) kind = 'TypeVarTuple';
      const name = this.expectName().v;
      let bound = null;
      let def = null;
      if (kind === 'TypeVar' && this.eatOp(':')) bound = this.parseTest();
      if (this.eatOp('=')) def = this.isOp('*') ? this.parseStarExpression() : this.parseTest();
      params.push(this.node(kind, st, { name, bound, default_value: def }));
      if (!this.eatOp(',')) break;
    }
    this.expectOp(']');
    return params;
  }

  parseFunction(decorators, asyncTok) {
    const t = this.next(); // def
    const nameTok = this.expectName();
    const fn = { type: asyncTok ? 'AsyncFunctionDef' : 'FunctionDef', name: nameTok.v, nameLine: nameTok.line, nameCol: nameTok.col, decorator_list: decorators };
    const first = decorators.length ? decorators[0] : (asyncTok || t);
    fn.defLine = (asyncTok || t).line;
    fn.type_params = this.isOp('[') ? this.parseTypeParams() : [];
    this.expectOp('(');
    fn.args = this.parseParams(')', true);
    this.expectOp(')');
    fn.returns = null;
    if (this.eatOp('->')) fn.returns = this.parseTest();
    this.fnStack.push(fn);
    this.depth++;
    try {
      fn.body = this.parseBlock();
    } finally {
      this.depth--;
      this.fnStack.pop();
    }
    const end = this.prev();
    const n = { type: fn.type, line: (asyncTok || t).line, col: (asyncTok || t).col, endLine: end.endLine, endCol: end.endCol };
    delete fn.type;
    Object.assign(n, fn);
    if (decorators.length) { n.decoLine = first.line; }
    return n;
  }

  parseParams(close, annotations) {
    const a = { type: 'arguments', posonlyargs: [], args: [], vararg: null, kwonlyargs: [], kw_defaults: [], kwarg: null, defaults: [] };
    let kwonly = false;
    const arg = () => {
      const nt = this.expectName();
      let annotation = null;
      if (annotations && this.eatOp(':')) annotation = this.isOp('*') ? this.parseStarExpression() : this.parseTest();
      return this.node('arg', nt, { arg: nt.v, annotation });
    };
    while (!this.isOp(close)) {
      if (this.eatOp('/')) {
        a.posonlyargs = a.args;
        a.args = [];
      } else if (this.isOp('**')) {
        this.next();
        a.kwarg = arg();
      } else if (this.isOp('*')) {
        this.next();
        kwonly = true;
        if (!this.isOp(',') && !this.isOp(close)) a.vararg = arg();
      } else {
        const p = arg();
        let def = null;
        if (this.eatOp('=')) def = this.parseTest();
        if (kwonly) { a.kwonlyargs.push(p); a.kw_defaults.push(def); } else {
          a.args.push(p);
          if (def) a.defaults.push(def);
          else if (a.defaults.length) this.fail('parameter without a default follows parameter with a default');
        }
      }
      if (!this.eatOp(',')) break;
    }
    return a;
  }

  parseClass(decorators) {
    const t = this.next();
    const nameTok = this.expectName();
    const type_params = this.isOp('[') ? this.parseTypeParams() : [];
    let bases = [];
    let keywords = [];
    if (this.isOp('(')) {
      const pt = this.next();
      ({ args: bases, keywords } = this.parseCallArgs(pt));
      this.expectOp(')');
    }
    const cls = { name: nameTok.v, nameLine: nameTok.line, nameCol: nameTok.col, decorator_list: decorators, type_params, bases, keywords };
    this.depth++;
    try {
      cls.body = this.parseBlock();
    } finally { this.depth--; }
    const n = this.node('ClassDef', t, cls);
    if (decorators.length) n.decoLine = decorators[0].line;
    return n;
  }

  // ── match statement ───────────────────────────────────────
  tryMatch() {
    const save = this.i;
    const saveErr = this.errors.length;
    const t = this.tok;
    const n1 = this.peek();
    // quick reject: match followed by an operator that cannot start an expression
    if (n1.t === 'OP' && !['(', '[', '{', '-', '+', '~', '*', '...'].includes(n1.v)) return null;
    if (n1.t === 'NEWLINE' || n1.t === 'ENDMARKER') return null;
    try {
      this.next();
      const subject = this.parseStarNamedExpressions();
      if (!this.isOp(':')) throw new ParseError('x', this.tok);
      this.next();
      if (this.tok.t !== 'NEWLINE') throw new ParseError('x', this.tok);
      this.next();
      if (this.tok.t !== 'INDENT') throw new ParseError('x', this.tok);
      if (!this.isKw('case', this.peek())) throw new ParseError('x', this.tok);
    } catch (e) {
      if (!e.isParseError) throw e;
      this.i = save;
      this.errors.length = saveErr;
      return null;
    }
    // committed to a match statement
    this.i = save;
    this.next();
    const subject = this.parseStarNamedExpressions();
    this.expectOp(':');
    this.next(); // NEWLINE
    this.next(); // INDENT
    const cases = [];
    while (this.isKw('case')) {
      const ct = this.next();
      const pattern = this.parsePatterns();
      let guard = null;
      if (this.eatKw('if')) guard = this.parseNamedExpr();
      const body = this.parseBlock();
      cases.push({ type: 'match_case', pattern, guard, body, line: ct.line, col: ct.col });
      while (this.tok.t === 'NEWLINE') this.next();
    }
    if (this.tok.t === 'DEDENT') this.next();
    else this.fail("expected 'case'");
    return this.node('Match', t, { subject, cases });
  }

  parseStarNamedExpressions() {
    const st = this.tok;
    const first = this.isOp('*') ? this.parseStarExpression() : this.parseNamedExpr();
    if (!this.isOp(',')) return first;
    const elts = [first];
    while (this.eatOp(',')) {
      if (this.isOp(':')) break;
      elts.push(this.isOp('*') ? this.parseStarExpression() : this.parseNamedExpr());
    }
    return this.node('Tuple', st, { elts, ctx: 'Load' });
  }

  parsePatterns() {
    const st = this.tok;
    const first = this.parseAsPattern();
    if (!this.isOp(',')) return first;
    const patterns = [first];
    while (this.eatOp(',')) {
      if (this.isOp(':') || this.isKw('if')) break;
      patterns.push(this.parseAsPattern());
    }
    return this.node('MatchSequence', st, { patterns });
  }

  parseAsPattern() {
    const st = this.tok;
    const p = this.parseOrPattern();
    if (this.eatKw('as')) {
      const nt = this.expectName();
      return this.node('MatchAs', st, { pattern: p, name: nt.v });
    }
    return p;
  }

  parseOrPattern() {
    const st = this.tok;
    const first = this.parseClosedPattern();
    if (!this.isOp('|')) return first;
    const patterns = [first];
    while (this.eatOp('|')) patterns.push(this.parseClosedPattern());
    return this.node('MatchOr', st, { patterns });
  }

  parseClosedPattern() {
    const t = this.tok;
    if (this.isOp('*')) {
      this.next();
      const nt = this.expectName();
      return this.node('MatchStar', t, { name: nt.v === '_' ? null : nt.v });
    }
    if (t.t === 'NUMBER' || t.t === 'STRING' || (this.isOp('-') && this.peek().t === 'NUMBER')) {
      const value = this.parseArith();
      return this.node('MatchValue', t, { value });
    }
    if (this.isKw('None') || this.isKw('True') || this.isKw('False')) {
      this.next();
      return this.node('MatchSingleton', t, { value: t.v === 'None' ? null : t.v === 'True' });
    }
    if (this.isOp('(') || this.isOp('[')) {
      const close = t.v === '(' ? ')' : ']';
      this.next();
      const patterns = [];
      let comma = false;
      while (!this.isOp(close)) {
        patterns.push(this.parseAsPattern());
        if (!this.eatOp(',')) break;
        comma = true;
      }
      this.expectOp(close);
      if (close === ')' && patterns.length === 1 && !comma) return patterns[0];
      return this.node('MatchSequence', t, { patterns });
    }
    if (this.isOp('{')) {
      this.next();
      const keys = [];
      const patterns = [];
      let rest = null;
      while (!this.isOp('}')) {
        if (this.eatOp('**')) { rest = this.expectName().v; } else {
          const kt = this.tok;
          let key;
          if (kt.t === 'NUMBER' || kt.t === 'STRING' || this.isOp('-')) key = this.parseArith();
          else if (this.isKw('None') || this.isKw('True') || this.isKw('False')) { this.next(); key = this.node('Constant', kt, { value: kt.v === 'None' ? null : kt.v === 'True', kind: 'singleton' }); } else key = this.parseDottedValue();
          this.expectOp(':');
          keys.push(key);
          patterns.push(this.parseAsPattern());
        }
        if (!this.eatOp(',')) break;
      }
      this.expectOp('}');
      return this.node('MatchMapping', t, { keys, patterns, rest });
    }
    if (this.isName()) {
      const value = this.parseDottedValue();
      if (this.isOp('(')) {
        this.next();
        const patterns = [];
        const kwd_attrs = [];
        const kwd_patterns = [];
        while (!this.isOp(')')) {
          if (this.isName() && this.isOp('=', this.peek())) {
            kwd_attrs.push(this.next().v);
            this.next();
            kwd_patterns.push(this.parseAsPattern());
          } else patterns.push(this.parseAsPattern());
          if (!this.eatOp(',')) break;
        }
        this.expectOp(')');
        return this.node('MatchClass', t, { cls: value, patterns, kwd_attrs, kwd_patterns });
      }
      if (value.type === 'Name') {
        if (value.id === '_') return this.node('MatchAs', t, { pattern: null, name: null });
        return this.node('MatchAs', t, { pattern: null, name: value.id, nameNode: value });
      }
      return this.node('MatchValue', t, { value });
    }
    this.fail('invalid pattern');
    return null;
  }

  parseDottedValue() {
    const t = this.expectName();
    let e = this.node('Name', t, { id: t.v, ctx: 'Load' });
    while (this.isOp('.')) {
      this.next();
      const at = this.expectName();
      e = this.nodeFrom('Attribute', e, { value: e, attr: at.v, ctx: 'Load', attrLine: at.line, attrCol: at.col });
    }
    return e;
  }

  // ── expressions ───────────────────────────────────────────
  parseStarExpressions(allowNamed) {
    const st = this.tok;
    const first = this.parseStarExpression(allowNamed);
    if (!this.isOp(',')) return first;
    const elts = [first];
    while (this.eatOp(',')) {
      if (this.atExprListEnd()) break;
      elts.push(this.parseStarExpression(allowNamed));
    }
    return this.node('Tuple', st, { elts, ctx: 'Load' });
  }

  atExprListEnd() {
    const t = this.tok;
    if (t.t === 'NEWLINE' || t.t === 'ENDMARKER' || t.t === 'DEDENT') return true;
    return t.t === 'OP' && (t.v === '=' || t.v === ')' || t.v === ']' || t.v === '}' || t.v === ':' || t.v === ';' || AUG.has(t.v));
  }

  parseStarExpression(allowNamed) {
    if (this.isOp('*')) {
      const t = this.next();
      const value = this.parseBitOr();
      return this.node('Starred', t, { value, ctx: 'Load' });
    }
    return allowNamed ? this.parseNamedExpr() : this.parseTest();
  }

  parseNamedExpr() {
    if (this.isName() && this.isOp(':=', this.peek())) {
      const t = this.next();
      this.next();
      const target = { type: 'Name', id: t.v, ctx: 'Store', line: t.line, col: t.col, endLine: t.endLine, endCol: t.endCol };
      const value = this.parseTest();
      return this.node('NamedExpr', t, { target, value });
    }
    return this.parseTest();
  }

  enter() {
    if (++this.depth > 400) this.fail('expression too deeply nested');
  }

  parseTest() {
    if (this.isKw('lambda')) return this.parseLambda();
    this.enter();
    try {
      const st = this.tok;
      const body = this.parseOrTest();
      if (this.isKw('if')) {
        // conditional expression (but not a comprehension 'if' -- callers of
        // comprehension conditions use parseOrTest directly)
        this.next();
        const test = this.parseOrTest();
        this.expectKw('else');
        const orelse = this.parseTest();
        return this.node('IfExp', st, { test, body, orelse });
      }
      return body;
    } finally { this.depth--; }
  }

  parseLambda() {
    const t = this.next();
    const args = this.parseParams(':', false);
    this.expectOp(':');
    const body = this.parseTest();
    return this.node('Lambda', t, { args, body });
  }

  parseOrTest() {
    const st = this.tok;
    const first = this.parseAndTest();
    if (!this.isKw('or')) return first;
    const values = [first];
    while (this.eatKw('or')) values.push(this.parseAndTest());
    return this.node('BoolOp', st, { op: 'Or', values });
  }

  parseAndTest() {
    const st = this.tok;
    const first = this.parseNotTest();
    if (!this.isKw('and')) return first;
    const values = [first];
    while (this.eatKw('and')) values.push(this.parseNotTest());
    return this.node('BoolOp', st, { op: 'And', values });
  }

  parseNotTest() {
    if (this.isKw('not')) {
      const t = this.next();
      this.enter();
      try {
        const operand = this.parseNotTest();
        return this.node('UnaryOp', t, { op: 'Not', operand });
      } finally { this.depth--; }
    }
    return this.parseComparison();
  }

  parseComparison() {
    const st = this.tok;
    const left = this.parseBitOr();
    const ops = [];
    const comparators = [];
    for (;;) {
      const t = this.tok;
      let op = null;
      if (t.t === 'OP' && COMP_OPS.has(t.v)) { op = t.v; this.next(); } else if (this.isKw('in')) { op = 'in'; this.next(); } else if (this.isKw('not') && this.isKw('in', this.peek())) { op = 'not in'; this.next(); this.next(); } else if (this.isKw('is')) {
        this.next();
        op = this.eatKw('not') ? 'is not' : 'is';
      } else break;
      ops.push(CMPOP[op]);
      comparators.push(this.parseBitOr());
    }
    if (!ops.length) return left;
    return this.node('Compare', st, { left, ops, comparators });
  }

  binLevel(next, ops) {
    const st = this.tok;
    let left = next();
    while (this.tok.t === 'OP' && ops.includes(this.tok.v)) {
      const op = this.next().v;
      const right = next();
      left = this.node('BinOp', st, { left, op: BINOP[op], right });
      left.line = st.line; left.col = st.col;
    }
    return left;
  }

  parseBitOr() { return this.binLevel(() => this.parseBitXor(), ['|']); }
  parseBitXor() { return this.binLevel(() => this.parseBitAnd(), ['^']); }
  parseBitAnd() { return this.binLevel(() => this.parseShift(), ['&']); }
  parseShift() { return this.binLevel(() => this.parseArith(), ['<<', '>>']); }
  parseArith() { return this.binLevel(() => this.parseTerm(), ['+', '-']); }
  parseTerm() { return this.binLevel(() => this.parseFactor(), ['*', '/', '%', '//', '@']); }

  parseFactor() {
    const t = this.tok;
    if (t.t === 'OP' && (t.v === '+' || t.v === '-' || t.v === '~')) {
      this.next();
      this.enter();
      try {
        const operand = this.parseFactor();
        return this.node('UnaryOp', t, { op: t.v === '+' ? 'UAdd' : t.v === '-' ? 'USub' : 'Invert', operand, opTok: { line: t.line, col: t.col } });
      } finally { this.depth--; }
    }
    return this.parsePower();
  }

  parsePower() {
    const st = this.tok;
    let base;
    if (this.isKw('await')) {
      this.next();
      const value = this.parsePrimary();
      base = this.node('Await', st, { value });
    } else base = this.parsePrimary();
    if (this.isOp('**')) {
      this.next();
      const right = this.parseFactor();
      return this.node('BinOp', st, { left: base, op: 'Pow', right });
    }
    return base;
  }

  parsePrimary() {
    let e = this.parseAtom();
    const head = e.parenthesized && e.parenLine ? { line: e.parenLine, col: e.parenCol } : e;
    for (;;) {
      const t = this.tok;
      if (this.isOp('.')) {
        this.next();
        const at = this.expectName();
        e = this.nodeFrom('Attribute', head, { value: e, attr: at.v, ctx: 'Load', attrLine: at.line, attrCol: at.col });
      } else if (this.isOp('(')) {
        this.next();
        this.enter();
        let r;
        try { r = this.parseCallArgs(t); } finally { this.depth--; }
        this.expectOp(')');
        e = this.nodeFrom('Call', head, { func: e, args: r.args, keywords: r.keywords, parenLine: t.line, parenCol: t.col });
      } else if (this.isOp('[')) {
        this.next();
        this.enter();
        let slice;
        try { slice = this.parseSlices(); } finally { this.depth--; }
        this.expectOp(']');
        e = this.nodeFrom('Subscript', head, { value: e, slice, ctx: 'Load' });
      } else break;
    }
    return e;
  }

  parseSlices() {
    const st = this.tok;
    const first = this.parseSlice();
    if (!this.isOp(',')) return first.type === 'Starred' ? this.node('Tuple', st, { elts: [first], ctx: 'Load' }) : first;
    const elts = [first];
    while (this.eatOp(',')) {
      if (this.isOp(']')) break;
      elts.push(this.parseSlice());
    }
    return this.node('Tuple', st, { elts, ctx: 'Load' });
  }

  parseSlice() {
    const st = this.tok;
    if (this.isOp('*')) return this.parseStarExpression();
    let lower = null;
    if (!this.isOp(':')) {
      lower = this.parseNamedExpr();
      if (!this.isOp(':')) return lower;
    }
    this.expectOp(':');
    let upper = null;
    let step = null;
    if (!this.isOp(':') && !this.isOp(']') && !this.isOp(',')) upper = this.parseTest();
    if (this.eatOp(':')) {
      if (!this.isOp(']') && !this.isOp(',')) step = this.parseTest();
    }
    return this.node('Slice', st, { lower, upper, step });
  }

  parseCallArgs(parenTok) {
    const args = [];
    const keywords = [];
    while (!this.isOp(')')) {
      const t = this.tok;
      if (this.isOp('*')) {
        this.next();
        const value = this.parseTest();
        args.push(this.node('Starred', t, { value, ctx: 'Load' }));
      } else if (this.isOp('**')) {
        this.next();
        const value = this.parseTest();
        keywords.push(this.node('keyword', t, { arg: null, value }));
      } else if (this.isName() && this.isOp('=', this.peek())) {
        const nt = this.next();
        this.next();
        const value = this.parseTest();
        keywords.push(this.node('keyword', nt, { arg: nt.v, value }));
      } else {
        let value = this.parseNamedExpr();
        if (this.isKw('for') || (this.isKw('async') && this.isKw('for', this.peek()))) {
          const generators = this.parseComprehensions();
          value = this.nodeFrom('GeneratorExp', value, { elt: value, generators });
          if (parenTok) { value.line = parenTok.line; value.col = parenTok.col; } else { value.line = t.line; value.col = t.col; }
        }
        args.push(value);
      }
      if (!this.eatOp(',')) break;
    }
    return { args, keywords };
  }

  parseComprehensions() {
    const gens = [];
    while (this.isKw('for') || (this.isKw('async') && this.isKw('for', this.peek()))) {
      const st = this.tok;
      const isAsync = this.eatKw('async') ? 1 : 0;
      this.expectKw('for');
      const target = this.parseTargetList();
      setCtx(target, 'Store');
      this.expectKw('in');
      const iter = this.parseOrTest();
      const ifs = [];
      while (this.isKw('if')) {
        this.next();
        ifs.push(this.parseOrTest());
      }
      gens.push({ type: 'comprehension', target, iter, ifs, is_async: isAsync, line: st.line, col: st.col });
    }
    return gens;
  }

  parseYield() {
    const t = this.next();
    if (this.eatKw('from')) {
      const value = this.parseTest();
      return this.node('YieldFrom', t, { value });
    }
    let value = null;
    if (!this.atExprListEnd() && !this.isOp(')')) value = this.parseStarExpressions();
    return this.node('Yield', t, { value });
  }

  parseAtom() {
    const t = this.tok;
    if (t.t === 'NAME') {
      if (t.v === 'None' || t.v === 'True' || t.v === 'False') {
        this.next();
        return this.node('Constant', t, { value: t.v === 'None' ? null : t.v === 'True', kind: t.v === 'None' ? 'None' : 'bool' });
      }
      if (KEYWORDS.has(t.v)) {
        if (t.v === 'yield') this.fail("'yield' outside parentheses");
        this.fail(`unexpected keyword '${t.v}'`);
      }
      this.next();
      return this.node('Name', t, { id: t.v, ctx: 'Load' });
    }
    if (t.t === 'NUMBER') {
      this.next();
      return this.node('Constant', t, numberValue(t.v));
    }
    if (t.t === 'STRING') return this.parseStrings();
    if (t.t === 'OP') {
      switch (t.v) {
        case '(': return this.parseParen();
        case '[': return this.parseListAtom();
        case '{': return this.parseBraceAtom();
        case '...': this.next(); return this.node('Constant', t, { value: '...', kind: 'Ellipsis' });
        default: break;
      }
    }
    this.fail(t.t === 'NEWLINE' ? 'unexpected end of line' : `unexpected '${t.v}'`);
    return null;
  }

  parseParen() {
    const t = this.next();
    if (this.isOp(')')) { this.next(); return this.node('Tuple', t, { elts: [], ctx: 'Load', parenthesized: true }); }
    if (this.isKw('yield')) {
      const y = this.parseYield();
      this.expectOp(')');
      y.parenthesized = true;
      return y;
    }
    this.enter();
    try {
      const first = this.isOp('*') ? this.parseStarExpression() : this.parseNamedExpr();
      if (this.isKw('for') || (this.isKw('async') && this.isKw('for', this.peek()))) {
        const generators = this.parseComprehensions();
        this.expectOp(')');
        return this.node('GeneratorExp', t, { elt: first, generators });
      }
      if (this.isOp(',')) {
        const elts = [first];
        while (this.eatOp(',')) {
          if (this.isOp(')')) break;
          elts.push(this.isOp('*') ? this.parseStarExpression() : this.parseNamedExpr());
        }
        this.expectOp(')');
        return this.node('Tuple', t, { elts, ctx: 'Load', parenthesized: true });
      }
      this.expectOp(')');
      first.parenthesized = (first.parenthesized || 0) + 1;
      first.parenLine = t.line;
      first.parenCol = t.col;
      return first;
    } finally { this.depth--; }
  }

  parseListAtom() {
    const t = this.next();
    if (this.isOp(']')) { this.next(); return this.node('List', t, { elts: [], ctx: 'Load' }); }
    this.enter();
    try {
      const first = this.isOp('*') ? this.parseStarExpression() : this.parseNamedExpr();
      if (this.isKw('for') || (this.isKw('async') && this.isKw('for', this.peek()))) {
        const generators = this.parseComprehensions();
        this.expectOp(']');
        return this.node('ListComp', t, { elt: first, generators });
      }
      const elts = [first];
      while (this.eatOp(',')) {
        if (this.isOp(']')) break;
        elts.push(this.isOp('*') ? this.parseStarExpression() : this.parseNamedExpr());
      }
      this.expectOp(']');
      return this.node('List', t, { elts, ctx: 'Load' });
    } finally { this.depth--; }
  }

  parseBraceAtom() {
    const t = this.next();
    if (this.isOp('}')) { this.next(); return this.node('Dict', t, { keys: [], values: [] }); }
    this.enter();
    try {
      // dict
      if (this.isOp('**')) return this.parseDictRest(t, null, null);
      const first = this.isOp('*') ? this.parseStarExpression() : this.parseNamedExpr();
      if (this.isOp(':')) {
        this.next();
        const value = this.parseTest();
        if (this.isKw('for') || (this.isKw('async') && this.isKw('for', this.peek()))) {
          const generators = this.parseComprehensions();
          this.expectOp('}');
          return this.node('DictComp', t, { key: first, value, generators });
        }
        return this.parseDictRest(t, first, value);
      }
      if (this.isKw('for') || (this.isKw('async') && this.isKw('for', this.peek()))) {
        const generators = this.parseComprehensions();
        this.expectOp('}');
        return this.node('SetComp', t, { elt: first, generators });
      }
      const elts = [first];
      while (this.eatOp(',')) {
        if (this.isOp('}')) break;
        elts.push(this.isOp('*') ? this.parseStarExpression() : this.parseNamedExpr());
      }
      this.expectOp('}');
      return this.node('Set', t, { elts });
    } finally { this.depth--; }
  }

  parseDictRest(t, k0, v0) {
    const keys = [];
    const values = [];
    if (k0) { keys.push(k0); values.push(v0); if (!this.eatOp(',')) { this.expectOp('}'); return this.node('Dict', t, { keys, values }); } }
    while (!this.isOp('}')) {
      if (this.eatOp('**')) {
        keys.push(null);
        values.push(this.parseBitOr());
      } else {
        keys.push(this.parseTest());
        this.expectOp(':');
        values.push(this.parseTest());
      }
      if (!this.eatOp(',')) break;
    }
    this.expectOp('}');
    return this.node('Dict', t, { keys, values });
  }

  parseStrings() {
    const first = this.tok;
    const toks = [];
    while (this.tok.t === 'STRING') toks.push(this.next());
    const anyF = toks.some((x) => x.fstring);
    if (!anyF) {
      let value = '';
      let bytes = false;
      for (const s of toks) {
        value += s.raw ? s.body : decodeEscapes(s.body, s.bytes);
        if (s.bytes) bytes = true;
      }
      const n = this.node('Constant', first, { value, kind: bytes ? 'bytes' : 'str' });
      n.strToks = toks.length;
      if (toks.length > 1) n.implicitConcat = toks.map((x) => ({ line: x.line, col: x.col, endLine: x.endLine }));
      if (toks[0].prefix) n.prefix = toks[0].prefix;
      return n;
    }
    // JoinedStr / TemplateStr
    const values = [];
    let lit = '';
    let litTok = null;
    const flushLit = () => { if (lit) values.push({ type: 'Constant', value: lit, kind: 'str', line: litTok.line, col: litTok.col, endLine: litTok.endLine, endCol: litTok.endCol, inFString: true }); lit = ''; litTok = null; };
    let fieldCount = 0;
    for (const s of toks) {
      if (!s.fstring) { if (!litTok) litTok = s; lit += s.raw ? s.body : decodeEscapes(s.body, false); continue; }
      for (const p of s.parts) {
        if (p.kind === 'lit') { if (!litTok) litTok = s; lit += s.raw ? p.text : decodeEscapes(p.text, false); continue; }
        fieldCount++;
        if (p.debug) { if (!litTok) litTok = s; lit += this.src.slice(p.start, p.end) + '='; }
        flushLit();
        values.push(this.fstringField(p, s));
      }
    }
    flushLit();
    const n = this.node(toks.some((x) => x.tstring) ? 'TemplateStr' : 'JoinedStr', first, { values });
    n.fieldCount = fieldCount;
    if (toks.length > 1) n.implicitConcat = toks.map((x) => ({ line: x.line, col: x.col, endLine: x.endLine }));
    return n;
  }

  fstringField(p, s) {
    let value;
    const tz = new Tokenizer(this.src, { start: p.start, end: p.end, line: p.line, col: p.col, inParens: true });
    tz.run();
    const sub = new Parser(this.src, tz.tokens, { errors: [] });
    sub.depth = this.depth;
    try {
      value = sub.isKw('yield') ? sub.parseYield() : sub.parseStarExpressions(true);
      if (sub.tok.t !== 'ENDMARKER') throw new ParseError('invalid f-string expression', sub.tok);
    } catch (e) {
      if (!e.isParseError) throw e;
      this.error('f-string: ' + e.message, e.tok);
      value = { type: 'Name', id: '__error__', ctx: 'Load', line: p.line, col: p.col, endLine: p.line, endCol: p.col, error: true };
    }
    let format_spec = null;
    if (p.spec) {
      const vals = [];
      for (const q of p.spec) {
        if (q.kind === 'lit') vals.push({ type: 'Constant', value: q.text, kind: 'str', line: q.line, col: p.col, endLine: q.line, endCol: p.col, inFString: true });
        else vals.push(this.fstringField(q, s));
      }
      format_spec = { type: 'JoinedStr', values: vals, line: p.line, col: p.col, endLine: p.line, endCol: p.col, isSpec: true };
    }
    const conversion = p.conv ? p.conv.charCodeAt(0) : (p.debug && !p.spec ? 114 : -1);
    return { type: s.tstring ? 'Interpolation' : 'FormattedValue', value, conversion, format_spec, line: value.line, col: value.col, endLine: value.endLine, endCol: value.endCol };
  }
}

function setCtx(e, ctx) {
  if (!e) return;
  switch (e.type) {
    case 'Name': case 'Attribute': case 'Subscript': e.ctx = ctx; break;
    case 'Starred': e.ctx = ctx; setCtx(e.value, ctx); break;
    case 'Tuple': case 'List': e.ctx = ctx; for (const x of e.elts) setCtx(x, ctx); break;
    default: break;
  }
}

function numberValue(text) {
  const t = text.replace(/_/g, '');
  if (/[jJ]$/.test(t)) return { value: parseFloat(t.slice(0, -1)) || 0, kind: 'complex', raw: text };
  if (/^0[xX]/.test(t)) return { value: parseInt(t.slice(2), 16), kind: 'int', raw: text };
  if (/^0[oO]/.test(t)) return { value: parseInt(t.slice(2), 8), kind: 'int', raw: text };
  if (/^0[bB]/.test(t)) return { value: parseInt(t.slice(2), 2), kind: 'int', raw: text };
  if (/[.eE]/.test(t)) return { value: parseFloat(t), kind: 'float', raw: text };
  return { value: parseInt(t, 10), kind: 'int', raw: text };
}

const ESC = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', f: '\f', v: '\v', 0: '\0', '\n': '' };

function decodeEscapes(s, bytes) {
  if (s.indexOf('\\') < 0) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') { out += c; continue; }
    const n = s[i + 1];
    if (n === undefined) { out += c; break; }
    if (n === 'x' && /^[0-9a-fA-F]{2}$/.test(s.substr(i + 2, 2))) { out += String.fromCharCode(parseInt(s.substr(i + 2, 2), 16)); i += 3; continue; }
    if (!bytes && n === 'u' && /^[0-9a-fA-F]{4}$/.test(s.substr(i + 2, 4))) { out += String.fromCharCode(parseInt(s.substr(i + 2, 4), 16)); i += 5; continue; }
    if (!bytes && n === 'U' && /^[0-9a-fA-F]{8}$/.test(s.substr(i + 2, 8))) { try { out += String.fromCodePoint(parseInt(s.substr(i + 2, 8), 16)); } catch { /* invalid */ } i += 9; continue; }
    if (!bytes && n === 'N' && s[i + 2] === '{') { const e = s.indexOf('}', i); out += '?'; i = e < 0 ? s.length : e; continue; }
    if (/[0-7]/.test(n)) { const m = /^[0-7]{1,3}/.exec(s.slice(i + 1)); out += String.fromCharCode(parseInt(m[0], 8)); i += m[0].length; continue; }
    if (n === '\r') { i += s[i + 2] === '\n' ? 2 : 1; continue; }
    if (Object.prototype.hasOwnProperty.call(ESC, n)) { out += ESC[n]; i++; continue; }
    out += c + n;
    i++;
  }
  return out;
}

// parse(src) -> { module, errors, comments, tokens }
function parse(src) {
  const text = String(src || '').replace(/^﻿/, '');
  const tz = new Tokenizer(text);
  tz.run();
  const errors = tz.errors.slice();
  const p = new Parser(text, tz.tokens, { errors });
  let module;
  try {
    module = p.parseModule();
  } catch (e) {
    errors.push({ msg: 'parser failure: ' + (e && e.message), line: 0, col: 0 });
    module = { type: 'Module', body: [], line: 1, col: 0, endLine: 1, endCol: 0, failed: true };
  }
  return { module, errors, comments: tz.comments, tokens: tz.tokens, text };
}

module.exports = { parse, KEYWORDS, decodeEscapes };
