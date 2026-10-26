'use strict';

// Tolerant recursive-descent Ruby parser. Builds an AST of plain objects:
//   { type, line, col, endLine, endCol, ... }
// Local variables are tracked while parsing (like MRI's local table) so that
// `foo -1` is a command call when `foo` is a method and a subtraction when it
// is a local. Statements that fail to parse are recorded in `errors` and
// skipped up to the next newline; parse() never throws.

const { lex, lineTable, makeLoc } = require('./lexer');

class PErr extends Error {}

const BIN_PREC = {
  '||': 1, '&&': 2,
  '<=>': 4, '==': 4, '===': 4, '!=': 4, '=~': 4, '!~': 4,
  '<': 5, '<=': 5, '>': 5, '>=': 5,
  '|': 6, '^': 6, '&': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10, '**': 12,
};
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '||=', '&&=', '|=', '&=', '^=', '<<=', '>>=']);
const ARG_START_KW = new Set(['nil', 'true', 'false', 'self', 'not', 'defined?', 'def', 'super', 'yield', '__FILE__', '__LINE__', '__ENCODING__', 'case', 'begin', 'lambda', 'proc']);
const LITERAL_T = new Set(['str', 'xstr', 'int', 'float', 'sym', 'dsym', 'regex', 'words', 'char', 'ivar', 'cvar', 'gvar', 'const', 'label', 'id']);

class Scope {
  constructor(parent, hard) { this.parent = parent; this.hard = hard; this.names = new Set(); }
  has(n) {
    for (let s = this; s; s = s.parent) {
      if (s.names.has(n)) return true;
      if (s.hard) return false;
    }
    return false;
  }
}

class Parser {
  constructor(tokens, ctx, scope) {
    this.toks = tokens;
    this.p = 0;
    this.ctx = ctx; // { src, errors, shared, depth }
    this.scope = scope || new Scope(null, true);
    this.noDo = 0;
    this.noPipe = 0;
    this.ternary = 0;
    this.pendingColon = false;
    this.depth = 0;
  }

  get tok() { return this.toks[this.p]; }
  peek(n = 1) { return this.toks[Math.min(this.p + n, this.toks.length - 1)]; }
  get prev() { return this.toks[Math.max(0, this.p - 1)]; }
  adv() { const t = this.toks[this.p]; if (this.p < this.toks.length - 1) this.p++; return t; }
  isOp(v, t = this.tok) { return t.t === 'op' && t.v === v; }
  isKw(v, t = this.tok) { return t.t === 'kw' && t.v === v; }
  isNl(t = this.tok) { return t.t === 'nl'; }
  skipNl() { while (this.tok.t === 'nl') this.adv(); }
  skipTerms() { while (this.tok.t === 'nl') this.adv(); }
  fail(msg, t = this.tok) { throw new PErr(`${msg} at ${t.line}:${t.col} (${t.t} ${JSON.stringify(t.v)})`); }
  expectOp(v) { if (!this.isOp(v)) this.fail(`expected '${v}'`); return this.adv(); }
  expectKw(v) { if (!this.isKw(v)) this.fail(`expected '${v}'`); return this.adv(); }
  declare(name) { if (name) this.scope.names.add(name); }
  pushScope(hard) { this.scope = new Scope(this.scope, hard); return this.scope; }
  popScope() { this.scope = this.scope.parent || this.scope; }

  node(type, t, props) {
    const n = { type, line: t.line, col: t.col, endLine: t.endLine, endCol: t.endCol, ...props };
    return n;
  }
  fin(n) {
    const t = this.prev;
    if (t && (t.endLine > n.endLine || (t.endLine === n.endLine && t.endCol > n.endCol))) { n.endLine = t.endLine; n.endCol = t.endCol; }
    return n;
  }
  enter() { if (++this.depth > 300) { this.depth = 0; this.fail('nesting too deep'); } }
  leave() { this.depth--; }

  atTerm(terms) {
    const t = this.tok;
    if (t.t === 'eof') return true;
    if ((t.t === 'kw' || t.t === 'op') && terms.has(t.v)) return true;
    return false;
  }

  // ── statements ─────────────────────────────────────────
  parseStmts(terms) {
    const out = [];
    for (;;) {
      this.skipTerms();
      if (this.atTerm(terms)) break;
      const start = this.p;
      try {
        const s = this.parseStmt();
        if (s) out.push(s);
        if (!this.isNl() && !this.atTerm(terms)) this.fail('expected end of statement');
      } catch (err) {
        if (!(err instanceof PErr)) throw err;
        this.ctx.errors.push({ line: this.tok.line, msg: err.message });
        this.recover(terms);
        if (this.p === start) this.adv();
      }
    }
    return out;
  }

  recover() {
    while (this.tok.t !== 'eof' && this.tok.t !== 'nl') this.adv();
  }

  parseStmt() {
    this.enter();
    let e = this.parseExprStmt();
    // one-line pattern matching: expr => pattern / expr in pattern
    if (this.isOp('=>') || (this.isKw('in') && this.noDo === 0)) {
      const t = this.adv();
      const pat = this.parsePattern();
      e = this.fin(this.node('MatchPattern', e, { expr: e, pat, raises: t.v === '=>' }));
    }
    for (;;) {
      const t = this.tok;
      if (t.t !== 'kw') break;
      if (t.v === 'if' || t.v === 'unless') {
        this.adv();
        const cond = this.parseExprStmt();
        e = this.fin(this.node('If', e, { kind: t.v, cond, then: [e], else: null, mod: true, kwLine: t.line, kwCol: t.col }));
      } else if (t.v === 'while' || t.v === 'until') {
        this.adv();
        const cond = this.parseExprStmt();
        e = this.fin(this.node('While', e, { until: t.v === 'until', cond, body: [e], mod: true, doWhile: e.type === 'Begin' }));
      } else if (t.v === 'rescue') {
        this.adv();
        const r = this.parseExprStmt();
        e = this.fin(this.node('RescueMod', e, { expr: e, rescue: r }));
      } else break;
    }
    this.leave();
    return e;
  }

  parseExprStmt() {
    let l = this.parseNotExpr();
    while (this.tok.t === 'kw' && (this.tok.v === 'and' || this.tok.v === 'or')) {
      const op = this.adv().v;
      this.skipNl();
      const r = this.parseNotExpr();
      l = this.fin(this.node('Bin', l, { op, l, r, kw: true }));
    }
    return l;
  }

  parseNotExpr() {
    if (this.isKw('not')) {
      const t = this.adv();
      const e = this.parseNotExpr();
      return this.fin(this.node('Not', t, { e, kw: true }));
    }
    return this.parseExpr();
  }

  parseExpr() {
    if (this.looksMultiAssign()) return this.parseMultiAssign();
    return this.parseArg(true, true);
  }

  looksMultiAssign() {
    let depth = 0;
    let sawComma = false;
    for (let k = this.p; k < this.toks.length; k++) {
      const t = this.toks[k];
      if (t.t === 'eof' || t.t === 'nl') return false;
      if (t.t === 'kw' && depth === 0 && ['do', 'if', 'unless', 'while', 'until', 'and', 'or', 'then', 'rescue'].includes(t.v)) return false;
      if (t.t === 'op') {
        if (t.v === '(' || t.v === '[' || t.v === '{') depth++;
        else if (t.v === ')' || t.v === ']' || t.v === '}') { depth--; if (depth < 0) return false; }
        else if (depth === 0 && t.v === ',') sawComma = true;
        else if (depth === 0 && t.v === '=') return sawComma;
        else if (depth === 0 && (ASSIGN_OPS.has(t.v) || t.v === '=>' || t.v === '==')) return false;
      }
      if (depth === 0 && !sawComma && k > this.p && (t.t === 'str' || t.t === 'label' || t.t === 'int' || t.t === 'sym') && this.toks[k - 1].t === 'id') return false;
      if (depth === 0 && t.t === 'label') return false;
    }
    return false;
  }

  parseMultiAssign() {
    const start = this.tok;
    const targets = this.parseMlhs('=');
    this.expectOp('=');
    this.skipNl();
    const vals = [];
    for (;;) {
      if (this.isOp('*')) { const t = this.adv(); vals.push(this.fin(this.node('Splat', t, { e: this.parseArg(false) }))); }
      else vals.push(this.parseArg(true));
      if (!this.isOp(',')) break;
      this.adv();
      this.skipNl();
    }
    const value = vals.length === 1 && vals[0].type !== 'Splat' ? vals[0] : this.fin(this.node('Array', vals[0] || start, { elems: vals, implicit: true }));
    let n = this.fin(this.node('MultiAssign', start, { targets, value }));
    if (this.isKw('rescue')) { this.adv(); n.value = this.fin(this.node('RescueMod', value, { expr: value, rescue: this.parseArg(false) })); }
    return n;
  }

  parseMlhs(stop) {
    const targets = [];
    for (;;) {
      if (this.isOp(stop) || this.isOp('=')) break;
      if (this.isOp('*')) {
        const t = this.adv();
        let e = null;
        if (!this.isOp(',') && !this.isOp('=') && !this.isOp(')') && !this.isOp('|')) e = this.parseLhs();
        targets.push(this.fin(this.node('Splat', t, { e })));
      } else if (this.isOp('(')) {
        const t = this.adv();
        const inner = this.parseMlhs(')');
        this.expectOp(')');
        targets.push(this.fin(this.node('Mlhs', t, { targets: inner })));
      } else targets.push(this.parseLhs());
      if (!this.isOp(',')) break;
      this.adv();
    }
    return targets;
  }

  parseLhs() {
    const t = this.tok;
    if (t.t === 'id' && !(this.peek().t === 'op' && (this.peek().v === '.' || this.peek().v === '[' || this.peek().v === '&.' || this.peek().v === '::' || this.peek().v === '('))) {
      this.adv();
      this.declare(t.v);
      return this.node('Ident', t, { name: t.v, lvar: true });
    }
    const e = this.parsePostfix(this.parsePrimary(false), false);
    return e;
  }

  isAssignable(n) {
    if (!n) return false;
    if (n.type === 'Ident' || n.type === 'IVar' || n.type === 'CVar' || n.type === 'GVar' || n.type === 'Const') return true;
    if (n.type === 'Call' && n.recv && !n.block && (n.name === '[]' || (!n.paren && !n.args.length && /^[a-z_]/i.test(n.name)))) return true;
    return false;
  }

  parseArg(allowCmd, stmtLevel = false) {
    this.enter();
    const startTok = this.tok;
    // `x = ...` where x is not yet a local
    if (startTok.t === 'id' && this.peek().t === 'op' && ASSIGN_OPS.has(this.peek().v) && !(this.peek().v === '=' && this.peek().sp === false && this.peek(2).t === 'op' && this.peek(2).v === '(' && false)) {
      this.declare(startTok.v);
    }
    let left = this.parseTernary(allowCmd);
    const t = this.tok;
    if (t.t === 'op' && ASSIGN_OPS.has(t.v) && this.isAssignable(left)) {
      this.adv();
      if (left.type === 'Ident') { this.declare(left.name); left.lvar = true; }
      this.skipNl();
      let value;
      if (this.isOp('*') && stmtLevel) {
        const st = this.adv();
        value = this.fin(this.node('Splat', st, { e: this.parseArg(false) }));
      } else value = this.parseArg(allowCmd, false);
      if (stmtLevel && this.isOp(',')) {
        const elems = [value];
        while (this.isOp(',')) {
          this.adv();
          this.skipNl();
          if (this.isOp('*')) { const st = this.adv(); elems.push(this.fin(this.node('Splat', st, { e: this.parseArg(false) }))); }
          else elems.push(this.parseArg(false));
        }
        value = this.fin(this.node('Array', value, { elems, implicit: true }));
      }
      if (stmtLevel && t.v === '=' && this.isKw('rescue')) {
        this.adv();
        const r = this.parseArg(false);
        value = this.fin(this.node('RescueMod', value, { expr: value, rescue: r }));
      }
      left = this.fin(this.node('Assign', left, { target: left, op: t.v, value, opLine: t.line, opCol: t.col, opSp: t.sp }));
    }
    this.leave();
    return left;
  }

  parseTernary(allowCmd) {
    const c = this.parseRange(allowCmd);
    if (this.isOp('?')) {
      const q = this.adv();
      this.skipNl();
      this.ternary++;
      const a = this.parseTernary(false);
      this.ternary--;
      let b;
      if (this.pendingColon) { this.pendingColon = false; }
      else if (this.tok.t === 'sym') {
        const st = this.adv();
        b = this.parsePostfix(this.isLocalName(st.v) ? this.node('Ident', st, { name: st.v, lvar: true }) : this.node('Ident', st, { name: st.v, lvar: false }), false);
      } else this.expectOp(':');
      this.skipNl();
      if (!b) b = this.parseTernary(false);
      return this.fin(this.node('If', c, { kind: 'if', cond: c, then: [a], else: [b], ternary: true, kwLine: q.line, kwCol: q.col }));
    }
    return c;
  }

  isLocalName(n) { return this.scope.has(n); }

  parseRange(allowCmd) {
    let l = this.parseBinary(0, allowCmd);
    if (this.isOp('..') || this.isOp('...')) {
      const t = this.adv();
      let r = null;
      if (this.canStartExpr()) r = this.parseBinary(0, false);
      l = this.fin(this.node('Range', l, { lo: l, hi: r, excl: t.v === '...' }));
    }
    return l;
  }

  canStartExpr() {
    const t = this.tok;
    if (t.t === 'nl' || t.t === 'eof') return false;
    if (LITERAL_T.has(t.t)) return t.t !== 'label' || this.ternary > 0;
    if (t.t === 'kw') return !['then', 'do', 'end', 'and', 'or', 'if', 'unless', 'while', 'until', 'rescue', 'else', 'elsif', 'when', 'in', 'ensure'].includes(t.v);
    if (t.t === 'op') return ['(', '[', '{', '-', '!', '~', '->', '::', '..', '...', '*', '&', '**', '+'].includes(t.v);
    return false;
  }

  parseBinary(minPrec, allowCmd) {
    let l = this.parseUnary(allowCmd);
    for (;;) {
      const t = this.tok;
      if (t.t !== 'op') break;
      const prec = BIN_PREC[t.v];
      if (prec == null || prec < minPrec) break;
      if (t.v === '|' && this.noPipe) break;
      this.adv();
      this.skipNl();
      const nextMin = t.v === '**' ? prec : prec + 1;
      const r = this.parseBinary(nextMin, false);
      l = this.fin(this.node('Bin', l, { op: t.v, l, r, opLine: t.line, opCol: t.col }));
    }
    return l;
  }

  parseUnary(allowCmd) {
    const t = this.tok;
    if (t.t === 'op') {
      if (t.v === '!') {
        this.adv();
        const e = this.parseUnary(allowCmd);
        return this.fin(this.node('Not', t, { e }));
      }
      if (t.v === '-' || t.v === '+') {
        const n = this.peek();
        if ((n.t === 'int' || n.t === 'float') && n.pos === t.end) {
          this.adv();
          this.adv();
          const num = this.node(n.t === 'int' ? 'Int' : 'Float', t, { value: (t.v === '-' ? '-' : '') + n.v });
          this.fin(num);
          if (this.isOp('**')) {
            this.adv();
            const r = this.parseBinary(12, false);
            return this.fin(this.node('Bin', num, { op: '**', l: num, r }));
          }
          return this.parsePostfix(num, allowCmd);
        }
        this.adv();
        const e = this.parseBinary(11, false);
        return this.fin(this.node('Unary', t, { op: t.v, e }));
      }
      if (t.v === '~') {
        this.adv();
        const e = this.parseUnary(false);
        return this.fin(this.node('Unary', t, { op: '~', e }));
      }
      if (t.v === '&' || t.v === '*' || t.v === '**') {
        // stray splat in expression position (e.g. `when *LIST`)
        this.adv();
        const e = this.parseUnary(false);
        return this.fin(this.node(t.v === '&' ? 'BlockPass' : t.v === '*' ? 'Splat' : 'DSplat', t, { e }));
      }
    }
    if (t.t === 'kw' && t.v === 'defined?') {
      this.adv();
      let e;
      if (this.isOp('(') ) { this.adv(); this.skipNl(); e = this.parseExprStmt(); this.skipNl(); this.expectOp(')'); }
      else e = this.parseUnary(false);
      return this.fin(this.node('Defined', t, { e }));
    }
    if (t.t === 'kw' && t.v === 'not') {
      this.adv();
      const e = this.parseUnary(false);
      return this.fin(this.node('Not', t, { e, kw: true }));
    }
    const prim = this.parsePrimary(allowCmd);
    return this.parsePostfix(prim, allowCmd);
  }

  // ── calls / arguments ───────────────────────────────────
  canStartCommandArg() {
    const t = this.tok;
    if (!t.sp || t.t === 'nl' || t.t === 'eof') return false;
    if (t.t === 'label') return this.ternary === 0;
    if (LITERAL_T.has(t.t)) return true;
    if (t.t === 'kw') return ARG_START_KW.has(t.v);
    if (t.t === 'op') {
      const n = this.peek();
      const tight = n.pos === t.end;
      switch (t.v) {
        case '(': case '[': case '->': return true;
        case '::': return tight && n.t === 'const';
        case '*': case '**': case '&': case '-': case '!': case ':': case '~': case '+': return tight && n.t !== 'nl';
        case '..': case '...': return false;
        default: return false;
      }
    }
    return false;
  }

  parseCommandArgs() {
    this.noDo++;
    try {
      return this.parseArgList(null);
    } finally { this.noDo--; }
  }

  parseParenArgs() {
    this.expectOp('(');
    const saveDo = this.noDo;
    const saveT = this.ternary;
    this.noDo = 0;
    this.ternary = 0;
    try {
      this.skipNl();
      if (this.isOp(')')) { this.adv(); return []; }
      const args = this.parseArgList(')');
      this.skipNl();
      this.expectOp(')');
      return args;
    } finally { this.noDo = saveDo; this.ternary = saveT; }
  }

  // Parses `a, *b, k: 1, "x" => 2, **h, &blk`; bare pairs become one Hash.
  parseArgList(closer) {
    const args = [];
    let hash = null;
    const addPair = (key, value, t) => {
      if (!hash) { hash = this.node('Hash', t, { pairs: [], bare: true }); args.push(hash); }
      hash.pairs.push(this.fin(this.node('Pair', t, { key, value })));
      this.fin(hash);
    };
    for (;;) {
      const t = this.tok;
      if (closer && this.isOp(closer)) break;
      if (this.isOp('...') && closer === ')' && this.peek().t === 'op' && this.peek().v === ')') {
        this.adv();
        args.push(this.node('ForwardArgs', t, {}));
        break;
      }
      if (this.isOp('*') ) {
        this.adv();
        const e = this.argEnd(closer) ? null : this.parseArg(false);
        args.push(this.fin(this.node('Splat', t, { e })));
      } else if (this.isOp('**')) {
        this.adv();
        const e = this.argEnd(closer) ? null : this.parseArg(false);
        if (!hash) { hash = this.node('Hash', t, { pairs: [], bare: true }); args.push(hash); }
        hash.pairs.push(this.fin(this.node('DSplat', t, { e })));
      } else if (this.isOp('&')) {
        this.adv();
        const e = this.argEnd(closer) ? null : this.parseArg(false);
        args.push(this.fin(this.node('BlockPass', t, { e })));
      } else if (t.t === 'label') {
        this.adv();
        const key = this.labelKey(t);
        this.skipNl();
        let value;
        if (this.argEnd(closer) || this.isOp(',')) value = this.node('Ident', t, { name: t.v, lvar: this.isLocalName(t.v), shorthand: true });
        else value = this.parseArg(!closer);
        addPair(key, value, t);
      } else {
        const e = this.parseArg(true);
        if (this.isOp('=>')) {
          this.adv();
          this.skipNl();
          addPair(e, this.parseArg(false), t);
        } else args.push(e);
      }
      if (closer) this.skipNl();
      if (!this.isOp(',')) break;
      this.adv();
      this.skipNl();
    }
    return args;
  }

  argEnd(closer) {
    const t = this.tok;
    return t.t === 'nl' || t.t === 'eof' || (closer && this.isOp(closer)) || this.isOp(',') || (t.t === 'kw' && ['do', 'then', 'end', 'if', 'unless'].includes(t.v));
  }

  labelKey(t) {
    if (t.parts) return this.strNode(t, 'Str');
    return this.node('Sym', t, { name: t.v, label: true });
  }

  attachBlock(call) {
    if (this.isOp('{') && !call.block) {
      call.block = this.parseBraceBlock();
      return this.fin(call);
    }
    if (this.isKw('do') && this.noDo === 0 && !call.block) {
      call.block = this.parseDoBlock();
      return this.fin(call);
    }
    return call;
  }

  parseBraceBlock() {
    const t = this.expectOp('{');
    this.pushScope(false);
    try {
      this.skipNl();
      const params = this.parseBlockParams();
      const saveDo = this.noDo; const saveT = this.ternary; this.noDo = 0; this.ternary = 0;
      const body = this.parseStmts(new Set(['}']));
      this.noDo = saveDo; this.ternary = saveT;
      this.expectOp('}');
      return this.fin(this.node('Block', t, { params, body, brace: true }));
    } finally { this.popScope(); }
  }

  parseDoBlock() {
    const t = this.expectKw('do');
    this.pushScope(false);
    try {
      while (this.isNl() && this.tok.v === ';') this.adv();
      const params = this.parseBlockParams();
      const saveDo = this.noDo; const saveT = this.ternary; this.noDo = 0; this.ternary = 0;
      const body = this.parseBodyWithRescue(new Set(['end']));
      this.noDo = saveDo; this.ternary = saveT;
      this.expectKw('end');
      return this.fin(this.node('Block', t, { params, body, brace: false }));
    } finally { this.popScope(); }
  }

  parseBlockParams() {
    if (this.isOp('||')) { this.adv(); return []; }
    if (!this.isOp('|')) return null;
    this.adv();
    this.noPipe++;
    try {
      const params = this.parseParamList('|');
      this.expectOp('|');
      return params;
    } finally { this.noPipe--; }
  }

  // Parameter list up to `closer` (')' / '|' / null = end of line).
  parseParamList(closer) {
    const params = [];
    let blockLocal = false;
    for (;;) {
      if (closer) this.skipNlExceptSemi(closer);
      const t = this.tok;
      if (closer ? this.isOp(closer) : (t.t === 'nl' || t.t === 'eof' || this.isOp('='))) break;
      if (t.t === 'nl' && t.v === ';') { this.adv(); blockLocal = true; continue; }
      if (t.t === 'eof') break;
      let prm;
      if (this.isOp('*')) {
        this.adv();
        const n = this.tok.t === 'id' ? this.adv() : null;
        prm = this.node('Param', n || t, { name: n ? n.v : null, kind: 'rest' });
      } else if (this.isOp('**')) {
        this.adv();
        if (this.isKw('nil')) { this.adv(); prm = this.node('Param', t, { name: null, kind: 'nokey' }); }
        else {
          const n = this.tok.t === 'id' ? this.adv() : null;
          prm = this.node('Param', n || t, { name: n ? n.v : null, kind: 'krest' });
        }
      } else if (this.isOp('&')) {
        this.adv();
        const n = this.tok.t === 'id' ? this.adv() : null;
        prm = this.node('Param', n || t, { name: n ? n.v : null, kind: 'block' });
      } else if (this.isOp('...')) {
        this.adv();
        prm = this.node('Param', t, { name: null, kind: 'fwd' });
      } else if (this.isOp('(')) {
        this.adv();
        const inner = this.parseParamList(')');
        this.expectOp(')');
        prm = this.node('Param', t, { name: null, kind: 'destructure', inner });
      } else if (t.t === 'label') {
        this.adv();
        let def = null;
        if (!(closer ? this.isOp(closer) : false) && !this.isOp(',') && !this.isNl() && this.tok.t !== 'eof') def = this.parseTernary(false);
        prm = this.node('Param', t, { name: t.v, kind: def ? 'key' : 'keyreq', default: def });
        prm.endCol = t.col + t.v.length;
      } else if (t.t === 'id') {
        this.adv();
        let def = null;
        if (this.isOp('=')) { this.adv(); this.declare(t.v); def = this.parseTernary(false); }
        prm = this.node('Param', t, { name: t.v, kind: blockLocal ? 'local' : def ? 'opt' : 'req', default: def });
      } else this.fail('bad parameter');
      if (prm.name) this.declare(prm.name);
      params.push(this.fin(prm));
      if (this.isOp(',')) { this.adv(); continue; }
      if (this.isNl() && this.tok.v === ';') continue;
      if (closer) this.skipNlExceptSemi(closer);
      if (!this.isOp(',')) break;
    }
    return params;
  }

  skipNlExceptSemi() {
    while (this.tok.t === 'nl' && this.tok.v === '\n') this.adv();
  }

  // ── postfix ────────────────────────────────────────────
  parsePostfix(n, allowCmd) {
    for (;;) {
      const t = this.tok;
      if (t.t === 'op' && (t.v === '.' || t.v === '&.')) {
        this.adv();
        this.skipNl();
        const nt = this.tok;
        let name;
        if (this.isOp('(')) name = 'call';
        else if (nt.t === 'id' || nt.t === 'const' || nt.t === 'kw') { name = nt.v; this.adv(); }
        else if (nt.t === 'label') {
          // `obj.meth key: v` lexed as label: split it
          name = nt.v;
          this.adv();
          const call = this.node('Call', n, { recv: n, name, args: [], dot: t.v, paren: false, block: null, nameLine: nt.line, nameCol: nt.col });
          const value = this.parseArg(false);
          call.args.push(this.fin(this.node('Hash', nt, { pairs: [this.fin(this.node('Pair', nt, { key: this.node('Sym', nt, { name: nt.v }), value }))], bare: true })));
          n = this.fin(call);
          continue;
        } else if (nt.t === 'op' && /^(\+|-|\*|\/|%|\*\*|==|!=|<|>|<=|>=|<=>|<<|>>|!|\[|&|\||\^)$/.test(nt.v)) { name = nt.v; this.adv(); if (name === '[') { this.expectOp(']'); name = '[]'; } }
        else this.fail('expected method name');
        const call = this.node('Call', n, { recv: n, name, args: [], dot: t.v, paren: false, block: null, nameLine: nt.line, nameCol: nt.col });
        if (this.isOp('(') && !this.tok.sp) { call.args = this.parseParenArgs(); call.paren = true; }
        else if (allowCmd !== false && !this.isOp('=') && this.canStartCommandArg() && !(this.tok.t === 'op' && this.tok.v === '[' )) {
          call.args = this.parseCommandArgs();
          call.cmd = true;
        } else if (this.isOp('[') && this.tok.sp && allowCmd !== false) {
          call.args = this.parseCommandArgs();
          call.cmd = true;
        }
        this.fin(call);
        n = this.attachBlock(call);
        continue;
      }
      if (t.t === 'op' && t.v === '::' && !(t.sp && !this.peek().sp)) {
        this.adv();
        const nt = this.adv();
        if (nt.t === 'const' && !(this.isOp('(') && !this.tok.sp)) {
          n = this.fin(this.node('Const', n, { name: nt.v, scope: n, nameLine: nt.line, nameCol: nt.col }));
          continue;
        }
        if (nt.t !== 'const' && nt.t !== 'id' && nt.t !== 'kw') this.fail('expected name after ::', nt);
        const call = this.node('Call', n, { recv: n, name: nt.v, args: [], dot: '::', paren: false, block: null, nameLine: nt.line, nameCol: nt.col });
        if (this.isOp('(') && !this.tok.sp) { call.args = this.parseParenArgs(); call.paren = true; }
        this.fin(call);
        n = this.attachBlock(call);
        continue;
      }
      if (t.t === 'op' && t.v === '[' && (!t.sp || n.lvar || n.type === 'IVar' || n.type === 'Const' || n.type === 'GVar' || n.type === 'CVar')) {
        this.adv();
        const saveDo = this.noDo; this.noDo = 0;
        this.skipNl();
        const args = this.isOp(']') ? [] : this.parseArgList(']');
        this.noDo = saveDo;
        this.skipNl();
        this.expectOp(']');
        n = this.fin(this.node('Call', n, { recv: n, name: '[]', args, dot: null, paren: true, block: null, index: true, nameLine: t.line, nameCol: t.col }));
        continue;
      }
      if ((this.isOp('{') || (this.isKw('do') && this.noDo === 0)) && this.blockable(n)) {
        let call = n;
        if (n.type === 'Ident') call = this.node('Call', n, { recv: null, name: n.name, args: [], dot: null, paren: false, block: null, nameLine: n.line, nameCol: n.col });
        if (call.block) break;
        n = this.attachBlock(call);
        continue;
      }
      break;
    }
    return n;
  }

  blockable(n) {
    if (n.type === 'Ident') return !n.lvar;
    if (n.type === 'Call') return !n.block && !n.index;
    if (n.type === 'Super' || n.type === 'ZSuper') return !n.block;
    if (n.type === 'Lambda') return false;
    return false;
  }

  // ── primary ────────────────────────────────────────────
  parsePrimary(allowCmd) {
    this.enter();
    try { return this.primary(allowCmd); } finally { this.leave(); }
  }

  primary(allowCmd) {
    const t = this.tok;
    switch (t.t) {
      case 'int': this.adv(); return this.node('Int', t, { value: t.v });
      case 'float': this.adv(); return this.node('Float', t, { value: t.v });
      case 'str': {
        this.adv();
        let n = this.strNode(t, 'Str');
        while (this.tok.t === 'str' && this.tok.q !== 'heredoc' && t.q !== 'heredoc') {
          const o = this.adv();
          const m = this.strNode(o, 'Str');
          n.parts = n.parts.concat(m.parts);
          n.value = n.value != null && m.value != null ? n.value + m.value : null;
          n.interp = n.interp || m.interp;
          this.fin(n);
        }
        return n;
      }
      case 'xstr': this.adv(); return this.strNode(t, 'XStr');
      case 'regex': this.adv(); { const n = this.strNode(t, 'Regex'); n.flags = t.flags || ''; return n; }
      case 'dsym': this.adv(); { const n = this.strNode(t, 'Sym'); n.name = t.v; return n; }
      case 'sym': this.adv(); return this.node('Sym', t, { name: t.v });
      case 'char': this.adv(); return this.node('Str', t, { value: t.v, parts: [{ s: t.v }], interp: false, q: '?' });
      case 'words': {
        this.adv();
        const elems = t.v.map((w) => this.node(t.sym ? 'Sym' : 'Str', t, t.sym ? { name: w } : { value: w, parts: [{ s: w }], interp: false, q: '%w' }));
        return this.node('Array', t, { elems, words: true });
      }
      case 'ivar': this.adv(); return this.node('IVar', t, { name: t.v });
      case 'cvar': this.adv(); return this.node('CVar', t, { name: t.v });
      case 'gvar': this.adv(); return this.node('GVar', t, { name: t.v });
      case 'const': {
        this.adv();
        if (this.isOp('(') && !this.tok.sp) {
          const call = this.node('Call', t, { recv: null, name: t.v, args: this.parseParenArgs(), dot: null, paren: true, block: null, nameLine: t.line, nameCol: t.col });
          return this.attachBlock(this.fin(call));
        }
        if (allowCmd && this.tok.t === 'str' && this.tok.sp) {
          const call = this.node('Call', t, { recv: null, name: t.v, args: this.parseCommandArgs(), dot: null, paren: false, cmd: true, block: null, nameLine: t.line, nameCol: t.col });
          return this.fin(call);
        }
        return this.node('Const', t, { name: t.v, scope: null });
      }
      case 'label': {
        if (this.ternary > 0) {
          this.adv();
          this.pendingColon = true;
          return this.node('Ident', t, { name: t.v, lvar: this.isLocalName(t.v) });
        }
        this.fail('unexpected label');
        break;
      }
      case 'id': return this.identifier(allowCmd);
      case 'kw': return this.keyword(allowCmd);
      case 'op': return this.opPrimary(allowCmd);
      default: break;
    }
    this.fail('unexpected token');
    return null;
  }

  strNode(t, type) {
    const parts = [];
    for (const p of t.parts || []) {
      if (p.code != null) parts.push(this.interp(p));
      else parts.push({ s: p.s });
    }
    const n = this.node(type, t, { value: t.v, parts, interp: !!t.interp, q: t.q || '' });
    if (t.heredoc) { n.heredoc = t.heredoc; n.bodyLine = t.bodyLine; n.bodyEndLine = t.bodyEndLine; }
    return n;
  }

  interp(p) {
    const { src } = this.ctx;
    const shared = this.ctx.shared;
    const sub = lex(src, p.pos, p.end, shared);
    const parser = new Parser(sub.tokens, this.ctx, this.scope);
    parser.depth = this.depth;
    const body = parser.parseStmts(new Set());
    const a = shared.loc(p.pos);
    return { type: 'Interp', line: a.line, col: a.col, endLine: a.line, endCol: a.col + (p.end - p.pos), body, code: p.code };
  }

  identifier(allowCmd) {
    const t = this.adv();
    const name = t.v;
    if (this.isOp('(') && !this.tok.sp) {
      const call = this.node('Call', t, { recv: null, name, args: this.parseParenArgs(), dot: null, paren: true, block: null, nameLine: t.line, nameCol: t.col });
      this.fin(call);
      return this.attachBlock(call);
    }
    if (this.isLocalName(name) && !(this.tok.t === 'op' && this.tok.v === '(' )) {
      return this.node('Ident', t, { name, lvar: true });
    }
    if (allowCmd !== false && this.canStartCommandArg()) {
      const call = this.node('Call', t, { recv: null, name, args: [], dot: null, paren: false, cmd: true, block: null, nameLine: t.line, nameCol: t.col });
      call.args = this.parseCommandArgs();
      this.fin(call);
      return this.attachBlock(call);
    }
    return this.node('Ident', t, { name, lvar: false });
  }

  keyword(allowCmd) {
    const t = this.tok;
    switch (t.v) {
      case 'nil': this.adv(); return this.node('Nil', t, {});
      case 'true': this.adv(); return this.node('True', t, {});
      case 'false': this.adv(); return this.node('False', t, {});
      case 'self': this.adv(); return this.node('Self', t, {});
      case '__FILE__': case '__LINE__': case '__ENCODING__': this.adv(); return this.node('Magic', t, { name: t.v });
      case 'def': return this.parseDef();
      case 'class': return this.parseClass();
      case 'module': return this.parseModule();
      case 'if': case 'unless': return this.parseIf();
      case 'while': case 'until': return this.parseWhile();
      case 'case': return this.parseCase();
      case 'for': return this.parseFor();
      case 'begin': {
        this.adv();
        const body = this.parseBodyWithRescue(new Set(['end']), true);
        this.expectKw('end');
        return this.fin(this.node('Begin', t, body));
      }
      case 'return': case 'break': case 'next': {
        this.adv();
        let value = null;
        if (this.canStartExpr() && !this.isOp('{') && !(this.tok.t === 'op' && this.tok.v === '[' && false)) {
          const args = this.parseCommandArgs();
          value = args.length === 1 && args[0].type !== 'Splat' ? args[0] : this.fin(this.node('Array', args[0] || t, { elems: args, implicit: true }));
        }
        return this.fin(this.node(t.v === 'return' ? 'Return' : t.v === 'break' ? 'Break' : 'Next', t, { value }));
      }
      case 'redo': case 'retry': this.adv(); return this.node(t.v === 'redo' ? 'Redo' : 'Retry', t, {});
      case 'yield': {
        this.adv();
        let args = [];
        if (this.isOp('(') && !this.tok.sp) args = this.parseParenArgs();
        else if (this.canStartExpr() && this.tok.sp && !this.isOp('{') && !this.isOp('[')) args = this.parseCommandArgs();
        return this.fin(this.node('Yield', t, { args }));
      }
      case 'super': {
        this.adv();
        if (this.isOp('(') && !this.tok.sp) {
          const n = this.node('Super', t, { args: this.parseParenArgs(), paren: true, block: null });
          return this.attachBlock(this.fin(n));
        }
        if (allowCmd !== false && this.canStartCommandArg()) {
          const n = this.node('Super', t, { args: this.parseCommandArgs(), paren: false, block: null });
          return this.attachBlock(this.fin(n));
        }
        return this.node('ZSuper', t, { block: null });
      }
      case 'alias': {
        this.adv();
        const a = this.adv();
        const b = this.adv();
        return this.fin(this.node('Alias', t, { to: a.v, from: b.v }));
      }
      case 'undef': {
        this.adv();
        const names = [this.adv().v];
        while (this.isOp(',')) { this.adv(); names.push(this.adv().v); }
        return this.fin(this.node('Undef', t, { names }));
      }
      case 'BEGIN': case 'END': {
        this.adv();
        this.expectOp('{');
        const body = this.parseStmts(new Set(['}']));
        this.expectOp('}');
        return this.fin(this.node('Begin', t, { body, rescues: [], elseBody: null, ensure: null, hook: t.v }));
      }
      case 'then': case 'do': case 'end': case 'else': case 'elsif': case 'when': case 'in': case 'ensure': case 'rescue':
        this.fail(`unexpected '${t.v}'`);
        break;
      default: break;
    }
    this.fail('unexpected keyword');
    return null;
  }

  opPrimary() {
    const t = this.tok;
    switch (t.v) {
      case '(': {
        this.adv();
        const saveDo = this.noDo; const saveT = this.ternary; const saveP = this.noPipe;
        this.noDo = 0; this.ternary = 0; this.noPipe = 0;
        try {
          this.skipNl();
          if (this.isOp(')')) { this.adv(); return this.fin(this.node('Paren', t, { body: [] })); }
          let body;
          if (this.looksMultiAssign()) body = [this.parseMultiAssign()];
          else body = this.parseStmts(new Set([')']));
          this.skipNl();
          this.expectOp(')');
          return this.fin(this.node('Paren', t, { body }));
        } finally { this.noDo = saveDo; this.ternary = saveT; this.noPipe = saveP; }
      }
      case '[': {
        this.adv();
        const saveDo = this.noDo; const saveT = this.ternary; this.noDo = 0; this.ternary = 0;
        try {
          this.skipNl();
          const elems = this.isOp(']') ? [] : this.parseArgList(']');
          this.skipNl();
          this.expectOp(']');
          return this.fin(this.node('Array', t, { elems }));
        } finally { this.noDo = saveDo; this.ternary = saveT; }
      }
      case '{': return this.parseHash();
      case '->': return this.parseLambda();
      case '..': case '...': {
        this.adv();
        const hi = this.parseBinary(0, false);
        return this.fin(this.node('Range', t, { lo: null, hi, excl: t.v === '...' }));
      }
      case '::': {
        this.adv();
        const c = this.adv();
        return this.fin(this.node('Const', t, { name: c.v, scope: null, top: true }));
      }
      case '*': case '**': case '&': {
        this.adv();
        const e = this.parseArg(false);
        return this.fin(this.node(t.v === '*' ? 'Splat' : t.v === '**' ? 'DSplat' : 'BlockPass', t, { e }));
      }
      default: break;
    }
    this.fail('unexpected operator');
    return null;
  }

  parseHash() {
    const t = this.expectOp('{');
    const saveDo = this.noDo; const saveT = this.ternary; this.noDo = 0; this.ternary = 0;
    try {
      const pairs = [];
      this.skipNl();
      while (!this.isOp('}')) {
        const kt = this.tok;
        if (this.isOp('**')) {
          this.adv();
          pairs.push(this.fin(this.node('DSplat', kt, { e: this.parseArg(false) })));
        } else if (kt.t === 'label') {
          this.adv();
          const key = this.labelKey(kt);
          this.skipNl();
          let value;
          if (this.isOp(',') || this.isOp('}')) value = this.node('Ident', kt, { name: kt.v, lvar: this.isLocalName(kt.v), shorthand: true });
          else value = this.parseArg(false);
          pairs.push(this.fin(this.node('Pair', kt, { key, value })));
        } else {
          const key = this.parseArg(false);
          this.skipNl();
          this.expectOp('=>');
          this.skipNl();
          const value = this.parseArg(false);
          pairs.push(this.fin(this.node('Pair', kt, { key, value })));
        }
        this.skipNl();
        if (!this.isOp(',')) break;
        this.adv();
        this.skipNl();
      }
      this.skipNl();
      this.expectOp('}');
      return this.fin(this.node('Hash', t, { pairs }));
    } finally { this.noDo = saveDo; this.ternary = saveT; }
  }

  parseLambda() {
    const t = this.expectOp('->');
    this.pushScope(false);
    try {
      let params = [];
      if (this.isOp('(')) { this.adv(); params = this.parseParamList(')'); this.expectOp(')'); }
      else if (this.tok.t === 'id' || this.tok.t === 'label' || this.isOp('*') || this.isOp('&')) {
        params = [];
        while (this.tok.t === 'id' || this.tok.t === 'label' || this.isOp('*') || this.isOp('&') || this.isOp('**')) {
          const sub = this.parseParamListUntilBlock();
          params.push(...sub);
          break;
        }
      }
      let body;
      if (this.isOp('{')) {
        this.adv();
        const saveDo = this.noDo; this.noDo = 0;
        body = this.parseStmts(new Set(['}']));
        this.noDo = saveDo;
        this.expectOp('}');
      } else if (this.isKw('do')) {
        this.adv();
        const saveDo = this.noDo; this.noDo = 0;
        body = this.parseBodyWithRescue(new Set(['end']));
        this.noDo = saveDo;
        this.expectKw('end');
      } else this.fail('expected lambda body');
      return this.fin(this.node('Lambda', t, { params, body }));
    } finally { this.popScope(); }
  }

  parseParamListUntilBlock() {
    const params = [];
    for (;;) {
      const t = this.tok;
      if (t.t === 'id') { this.adv(); this.declare(t.v); params.push(this.node('Param', t, { name: t.v, kind: 'req' })); }
      else if (t.t === 'label') { this.adv(); this.declare(t.v); params.push(this.node('Param', t, { name: t.v, kind: 'keyreq' })); }
      else if (this.isOp('*') || this.isOp('&') || this.isOp('**')) {
        this.adv();
        const n = this.tok.t === 'id' ? this.adv() : null;
        if (n) this.declare(n.v);
        params.push(this.node('Param', n || t, { name: n ? n.v : null, kind: t.v === '*' ? 'rest' : t.v === '&' ? 'block' : 'krest' }));
      } else break;
      if (!this.isOp(',')) break;
      this.adv();
    }
    return params;
  }

  // ── definitions ────────────────────────────────────────
  parseDef() {
    const t = this.expectKw('def');
    let singleton = null;
    const a = this.tok;
    const b = this.peek();
    if ((a.t === 'kw' && a.v === 'self') || ((a.t === 'id' || a.t === 'const' || a.t === 'ivar') && b.t === 'op' && b.v === '.')) {
      if (b.t === 'op' && b.v === '.') {
        this.adv();
        this.adv();
        singleton = a.t === 'kw' ? this.node('Self', a, {}) : this.node(a.t === 'const' ? 'Const' : a.t === 'ivar' ? 'IVar' : 'Ident', a, { name: a.v });
      }
    }
    const nt = this.tok;
    let name;
    if (nt.t === 'id' || nt.t === 'const' || nt.t === 'kw') { name = nt.v; this.adv(); }
    else if (nt.t === 'label') { name = nt.v; this.adv(); }
    else if (nt.t === 'op') {
      this.adv();
      name = nt.v;
      if (name === '[') { this.expectOp(']'); name = '[]'; if (this.isOp('=') && !this.tok.sp) { this.adv(); name = '[]='; } }
      else if ((name === '+' || name === '-' || name === '!' || name === '~') && this.tok.t === 'ivar' ) { /* unusual */ }
      else if ((name === '+' || name === '-') && this.isOp('@') ) { this.adv(); name += '@'; }
    } else if (nt.t === 'xstr') { name = '`'; this.adv(); }
    else this.fail('expected method name');
    // `+@` / `-@` are lexed as op + ivar-less '@'; tolerate
    if (this.tok.t === 'op' && this.tok.v === '=' && !this.tok.sp && /^[a-z_A-Z]/.test(name) && (this.peek().t === 'op' && this.peek().v === '(')) { this.adv(); name += '='; }
    const outer = this.scope;
    this.pushScope(true);
    const saveDo = this.noDo; const saveT = this.ternary;
    this.noDo = 0; this.ternary = 0;
    try {
      let params = [];
      let paren = false;
      if (this.isOp('(')) {
        this.adv();
        paren = true;
        params = this.parseParamList(')');
        this.skipNl();
        this.expectOp(')');
      } else if (!this.isNl() && !this.isOp('=') && this.tok.t !== 'eof') {
        params = this.parseParamList(null);
      }
      if (this.isOp('=')) {
        this.adv();
        this.skipNl();
        const e = this.parseStmt();
        return this.fin(this.node('Def', t, { name, singleton, params, body: [e], endless: true, paren, nameLine: nt.line, nameCol: nt.col }));
      }
      const body = this.parseBodyWithRescue(new Set(['end']));
      this.expectKw('end');
      return this.fin(this.node('Def', t, { name, singleton, params, body, paren, nameLine: nt.line, nameCol: nt.col }));
    } finally {
      this.noDo = saveDo; this.ternary = saveT;
      this.scope = outer;
    }
  }

  // Body with optional rescue/else/ensure clauses. Returns a stmt list; with
  // clauses the list holds one implicit Begin. For `begin` (asBegin) returns
  // the Begin's props instead.
  parseBodyWithRescue(terms, asBegin = false) {
    const all = new Set([...terms, 'rescue', 'else', 'ensure']);
    const startTok = this.tok;
    const body = this.parseStmts(all);
    const rescues = [];
    let elseBody = null;
    let ensure = null;
    while (this.isKw('rescue')) {
      const rt = this.adv();
      const classes = [];
      let v = null;
      if (!this.isNl() && !this.isKw('then') && !this.isOp('=>')) {
        for (;;) {
          if (this.isOp('*')) { const st = this.adv(); classes.push(this.fin(this.node('Splat', st, { e: this.parseTernary(false) }))); }
          else classes.push(this.parseTernary(false));
          if (!this.isOp(',')) break;
          this.adv();
          this.skipNl();
        }
      }
      if (this.isOp('=>')) {
        this.adv();
        v = this.parseLhs();
      }
      if (this.isKw('then')) this.adv();
      const rbody = this.parseStmts(all);
      rescues.push(this.fin(this.node('Rescue', rt, { classes, var: v, body: rbody })));
    }
    if (this.isKw('else')) {
      this.adv();
      elseBody = this.parseStmts(all);
    }
    if (this.isKw('ensure')) {
      this.adv();
      ensure = this.parseStmts(all);
    }
    if (asBegin) return { body, rescues, elseBody, ensure };
    if (!rescues.length && !elseBody && !ensure) return body;
    const b = this.node('Begin', body[0] || startTok, { body, rescues, elseBody, ensure, implicit: true });
    return [this.fin(b)];
  }

  parseConstPath() {
    const t = this.tok;
    let n;
    if (this.isOp('::')) { this.adv(); const c = this.adv(); n = this.node('Const', t, { name: c.v, scope: null, top: true }); }
    else if (t.t === 'const' || t.t === 'id') { this.adv(); n = this.node('Const', t, { name: t.v, scope: null }); }
    else this.fail('expected class name');
    while (this.isOp('::')) {
      this.adv();
      const c = this.adv();
      n = this.fin(this.node('Const', n, { name: c.v, scope: n, nameLine: c.line, nameCol: c.col }));
    }
    return this.fin(n);
  }

  parseClass() {
    const t = this.expectKw('class');
    const outer = this.scope;
    if (this.isOp('<<')) {
      this.adv();
      const target = this.parseExpr();
      this.pushScope(true);
      try {
        const body = this.parseBodyWithRescue(new Set(['end']));
        this.expectKw('end');
        return this.fin(this.node('SClass', t, { target, body }));
      } finally { this.scope = outer; }
    }
    const path = this.parseConstPath();
    let superclass = null;
    if (this.isOp('<')) { this.adv(); superclass = this.parseArg(false); }
    this.pushScope(true);
    try {
      const body = this.parseBodyWithRescue(new Set(['end']));
      this.expectKw('end');
      return this.fin(this.node('Class', t, { path, name: constName(path), superclass, body, nameLine: path.nameLine || path.line, nameCol: path.nameCol || path.col }));
    } finally { this.scope = outer; }
  }

  parseModule() {
    const t = this.expectKw('module');
    const outer = this.scope;
    const path = this.parseConstPath();
    this.pushScope(true);
    try {
      const body = this.parseBodyWithRescue(new Set(['end']));
      this.expectKw('end');
      return this.fin(this.node('Module', t, { path, name: constName(path), body, nameLine: path.nameLine || path.line, nameCol: path.nameCol || path.col }));
    } finally { this.scope = outer; }
  }

  parseCond() {
    this.noDo++;
    try { return this.parseExprStmt(); } finally { this.noDo--; }
  }

  parseIf() {
    const t = this.adv();
    const cond = this.parseCond();
    if (this.isKw('then')) this.adv();
    const then = this.parseStmts(new Set(['elsif', 'else', 'end']));
    let els = null;
    if (this.isKw('elsif')) {
      els = [this.parseElsif()];
      return this.fin(this.node('If', t, { kind: t.v, cond, then, else: els, kwLine: t.line, kwCol: t.col }));
    }
    let elseLine = null;
    if (this.isKw('else')) { elseLine = this.tok.line; this.adv(); els = this.parseStmts(new Set(['end'])); }
    this.expectKw('end');
    return this.fin(this.node('If', t, { kind: t.v, cond, then, else: els, elseLine, kwLine: t.line, kwCol: t.col }));
  }

  parseElsif() {
    const t = this.adv();
    const cond = this.parseCond();
    if (this.isKw('then')) this.adv();
    const then = this.parseStmts(new Set(['elsif', 'else', 'end']));
    let els = null;
    let elseLine = null;
    if (this.isKw('elsif')) els = [this.parseElsif()];
    else {
      if (this.isKw('else')) { elseLine = this.tok.line; this.adv(); els = this.parseStmts(new Set(['end'])); }
      this.expectKw('end');
    }
    return this.fin(this.node('If', t, { kind: 'elsif', cond, then, else: els, elseLine, kwLine: t.line, kwCol: t.col }));
  }

  parseWhile() {
    const t = this.adv();
    const cond = this.parseCond();
    if (this.isKw('do')) this.adv();
    const body = this.parseStmts(new Set(['end']));
    this.expectKw('end');
    return this.fin(this.node('While', t, { until: t.v === 'until', cond, body }));
  }

  parseFor() {
    const t = this.adv();
    const vars = [];
    for (;;) {
      const v = this.tok;
      if (v.t === 'id') { this.adv(); this.declare(v.v); vars.push(this.node('Ident', v, { name: v.v, lvar: true })); }
      else vars.push(this.parseLhs());
      if (!this.isOp(',')) break;
      this.adv();
    }
    this.expectKw('in');
    const iter = this.parseCond();
    if (this.isKw('do')) this.adv();
    const body = this.parseStmts(new Set(['end']));
    this.expectKw('end');
    return this.fin(this.node('For', t, { vars, iter, body }));
  }

  parseCase() {
    const t = this.adv();
    let subject = null;
    if (!this.isNl()) subject = this.parseExprStmt();
    this.skipNl();
    const whens = [];
    const ins = [];
    let els = null;
    let elseLine = null;
    const terms = new Set(['when', 'in', 'else', 'end']);
    while (this.isKw('when') || this.isKw('in')) {
      const wt = this.adv();
      if (wt.v === 'when') {
        const conds = [];
        for (;;) {
          if (this.isOp('*')) { const st = this.adv(); conds.push(this.fin(this.node('Splat', st, { e: this.parseTernary(false) }))); }
          else conds.push(this.parseTernary(false));
          if (!this.isOp(',')) break;
          this.adv();
          this.skipNl();
        }
        if (this.isKw('then')) this.adv();
        const body = this.parseStmts(terms);
        whens.push(this.fin(this.node('When', wt, { conds, body })));
      } else {
        const pat = this.parsePattern();
        let guard = null;
        if (this.isKw('if') || this.isKw('unless')) { const gt = this.adv(); guard = this.parseExprStmt(); guard = { type: 'Guard', kind: gt.v, e: guard, line: gt.line, col: gt.col, endLine: guard.endLine, endCol: guard.endCol }; }
        if (this.isKw('then')) this.adv();
        const body = this.parseStmts(terms);
        ins.push(this.fin(this.node('InClause', wt, { pat, guard, body })));
      }
    }
    if (this.isKw('else')) { elseLine = this.tok.line; this.adv(); els = this.parseStmts(new Set(['end'])); }
    this.expectKw('end');
    return this.fin(this.node('Case', t, { subject, whens, ins, else: els, elseLine, pattern: ins.length > 0 }));
  }

  // Patterns are kept as token text plus the variables they bind.
  parsePattern() {
    const start = this.tok;
    let depth = 0;
    const binds = [];
    const pins = [];
    let text = '';
    for (;;) {
      const t = this.tok;
      if (t.t === 'eof') break;
      if (depth === 0 && (t.t === 'nl' || (t.t === 'kw' && (t.v === 'then' || t.v === 'if' || t.v === 'unless')))) break;
      if (t.t === 'op' && (t.v === '(' || t.v === '[' || t.v === '{')) depth++;
      if (t.t === 'op' && (t.v === ')' || t.v === ']' || t.v === '}')) depth--;
      const p = this.prev;
      if (t.t === 'id' && !(p && p.t === 'op' && (p.v === '.' || p.v === '&.' || p.v === '^')) && !(this.peek().t === 'op' && this.peek().v === '(' && !this.peek().sp)) {
        binds.push(this.node('Ident', t, { name: t.v, lvar: true, bind: true }));
        this.declare(t.v);
      } else if (t.t === 'label') {
        const n = this.peek();
        if (n.t === 'op' && (n.v === ',' || n.v === '}' || n.v === ')') || n.t === 'nl' || (n.t === 'kw' && n.v === 'then')) {
          binds.push(this.node('Ident', t, { name: t.v, lvar: true, bind: true }));
          this.declare(t.v);
        }
      } else if (t.t === 'id' && p && p.t === 'op' && p.v === '^') {
        pins.push(this.node('Ident', t, { name: t.v, lvar: this.isLocalName(t.v) }));
      } else if (t.t === 'ivar' && p && p.t === 'op' && p.v === '^') {
        pins.push(this.node('IVar', t, { name: t.v }));
      }
      text += (t.sp && text ? ' ' : '') + (typeof t.v === 'string' ? t.v : '');
      this.adv();
      if (depth < 0) break;
    }
    return this.fin(this.node('Pattern', start, { text, binds, pins }));
  }
}

function constName(n) {
  if (!n) return '';
  if (n.type === 'Const') return n.scope ? `${constName(n.scope)}::${n.name}` : n.name;
  return '';
}

function parse(src) {
  const text = String(src == null ? '' : src).replace(/^﻿/, '');
  const starts = lineTable(text);
  const loc = makeLoc(starts);
  const shared = { starts, loc, comments: [], errors: [] };
  const errors = shared.errors;
  let lexed;
  try {
    lexed = lex(text, 0, text.length, shared);
  } catch (err) {
    errors.push({ line: 1, msg: `lexer: ${err.message}` });
    return { program: { type: 'Program', line: 1, col: 1, endLine: 1, endCol: 1, body: [], failed: true }, comments: shared.comments, errors, tokens: [], text, lines: starts.length };
  }
  const ctx = { src: text, errors, shared };
  const parser = new Parser(lexed.tokens, ctx);
  let body = [];
  try {
    body = parser.parseStmts(new Set());
  } catch (err) {
    errors.push({ line: parser.tok.line, msg: `parser: ${err.message}` });
  }
  const last = lexed.tokens[lexed.tokens.length - 1];
  const program = { type: 'Program', line: 1, col: 1, endLine: last ? last.line : 1, endCol: 1, body };
  return { program, comments: shared.comments.sort((a, b) => a.pos - b.pos), errors, tokens: lexed.tokens, text, lines: starts.length };
}

module.exports = { parse, constName };
