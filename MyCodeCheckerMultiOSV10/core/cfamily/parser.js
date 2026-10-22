'use strict';

// Recursive-descent parser for C11/C17 (+ GNU extensions) and C++20 over
// preprocessed tokens. Produces the AST documented in AST.md.
//
// parse(tokens, opts) -> { ast, diagnostics }
//
// Error handling: a syntax error inside a statement or declaration records a
// diagnostic, skips to a synchronisation point (';' or the end of the current
// brace group) and inserts an ErrorStmt / ErrorDecl node, so the rest of the
// file is still parsed.

const { classifyNumber, decodeEscapes, literalParts, spell } = require('./lexer');
const { STD_TEMPLATES, STD_TYPES } = require('./headers');

class ParseError extends Error {
  constructor(message, tok) {
    super(message);
    this.tok = tok;
  }
}

const set = (s) => new Set(s.split(' '));
const TYPE_KW = set('void char short int long float double signed unsigned _Bool bool _Complex _Imaginary wchar_t char8_t char16_t char32_t __int128 __signed __signed__ _Decimal32 _Decimal64 _Decimal128 __builtin_va_list _BitInt');
const QUAL_KW = set('const volatile restrict __restrict __restrict__ __const __const__ __volatile __volatile__ _Atomic');
const STORAGE_KW = set('typedef extern static auto register thread_local _Thread_local __thread mutable');
const FUNC_KW = set('inline __inline __inline__ __forceinline virtual explicit _Noreturn constexpr consteval constinit friend');
const OTHER_SPEC_KW = set('struct union class enum typeof typeof_unqual __typeof__ __typeof decltype __auto_type typename alignas _Alignas __attribute__ __attribute __declspec __extension__ __cdecl __stdcall __fastcall');
const DECL_ONLY_KW = set('static_assert _Static_assert template using namespace concept __label__');
const ASSIGN_OPS = set('= *= /= %= += -= <<= >>= &= ^= |=');
const BIN_PREC = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7,
  '<=>': 8, '<<': 9, '>>': 9, '+': 10, '-': 10, '*': 11, '/': 11, '%': 11, '.*': 12, '->*': 12,
};
const FOLD_OPS = set('+ - * / % ^ & | = < > << >> += -= *= /= %= ^= &= |= <<= >>= == != <= >= && || , .* ->*');
const QUAL_NORM = { __restrict: 'restrict', __restrict__: 'restrict', __const: 'const', __const__: 'const', __volatile: 'volatile', __volatile__: 'volatile', _Atomic: 'atomic' };
const STD_TEMPLATE_SET = new Set(STD_TEMPLATES);
const STD_TYPE_SET = new Set(STD_TYPES);
const CAST_KW = set('static_cast dynamic_cast reinterpret_cast const_cast');
// Windows calling-convention macros, seen as plain identifiers when <windows.h> is missing
const WIN_CC = set('WINAPI CALLBACK APIENTRY PASCAL WINAPIV NTAPI STDMETHODCALLTYPE STDAPICALLTYPE CDECL __CRTDECL DAPI DAPIV');

function mkLoc(s, e) {
  if (!e || e.file !== s.file || e.end < s.start) e = s;
  const loc = { file: s.file, line: s.line, col: s.col, endLine: e.endLine, endCol: e.endCol, start: s.start, end: e.end };
  if (s.fromMacro) loc.macro = s.fromMacro;
  return loc;
}

class Parser {
  constructor(tokens, opts = {}) {
    this.opts = opts;
    this.cpp = opts.lang === 'cpp';
    this.c23 = !this.cpp && /2x|23/.test(String(opts.std || ''));
    this.file = opts.file || '<input>';
    const toks = tokens.slice();
    const last = toks[toks.length - 1];
    const eofAt = last || { line: 1, col: 1, endLine: 1, endCol: 1, start: 0, end: 0, file: this.file };
    toks.push({ kind: 'eof', value: '', line: eofAt.endLine, col: eofAt.endCol, endLine: eofAt.endLine, endCol: eofAt.endCol, start: eofAt.end, end: eofAt.end, file: eofAt.file, bol: true, space: true });
    this.toks = toks;
    this.p = 0;
    this.diagnostics = [];
    this.scopes = [new Map()];
    this.allTypeNames = new Set();
    this.allTemplateNames = new Set();
    this.classStack = [];
    this.usingStd = false;
    this.noGreater = 0;
    this.splits = [];
    this.parenDepth = 0;
    this.failedAngles = new WeakSet(); // '<' tokens where a template-argument list was tried and failed
    this.maxErrors = opts.maxErrors || 500;
    if (this.cpp) this.declare('std', 'namespace');
    for (const nm of opts.knownTypes || []) this.declare(nm, 'type');
  }

  // ---------------------------------------------------------------- tokens

  get t() { return this.toks[this.p]; }
  peek(k = 1) { return this.toks[Math.min(this.p + k, this.toks.length - 1)]; }
  at(i) { return this.toks[Math.min(i, this.toks.length - 1)]; }
  isP(v, tok = this.toks[this.p]) { return tok.kind === 'punct' && tok.value === v; }
  isK(v, tok = this.toks[this.p]) { return tok.kind === 'keyword' && tok.value === v; }
  isOp(v, tok = this.toks[this.p]) { return tok.value === v && (tok.kind === 'punct' || tok.kind === 'keyword'); }
  isId(tok = this.toks[this.p]) { return tok.kind === 'identifier'; }
  isCtx(v, tok = this.toks[this.p]) { return tok.kind === 'identifier' && tok.value === v; }
  eof() { return this.toks[this.p].kind === 'eof'; }
  next() { const t = this.toks[this.p]; if (t.kind !== 'eof') this.p++; return t; }
  accept(v) {
    const t = this.toks[this.p];
    if (t.value === v && (t.kind === 'punct' || t.kind === 'keyword')) { this.p++; return t; }
    return null;
  }
  expect(v) {
    const t = this.toks[this.p];
    if (t.value === v && (t.kind === 'punct' || t.kind === 'keyword')) { this.p++; return t; }
    throw new ParseError(`expected '${v}' before ${describe(t)}`, t);
  }
  // closing tokens: report but do not throw
  expectClose(v, open) {
    const t = this.toks[this.p];
    if (t.value === v && t.kind === 'punct') { this.p++; return t; }
    this.error(`expected '${v}'${open ? ` to match '${open.value}' at line ${open.line}` : ''} before ${describe(t)}`, t);
    return null;
  }
  expectGreater() {
    const t = this.toks[this.p];
    if (t.kind === 'punct') {
      if (t.value === '>') { this.p++; return t; }
      if (t.value === '>>' || t.value === '>=' || t.value === '>>=') {
        this.splitToken(this.p);
        this.p++;
        return t;
      }
    }
    throw new ParseError(`expected '>' before ${describe(t)}`, t);
  }
  splitToken(i) {
    const t = this.toks[i];
    const first = { ...t, value: '>', endCol: t.col + 1, end: t.start + 1, endLine: t.line };
    const rest = { ...t, value: t.value.slice(1), col: t.col + 1, start: t.start + 1, space: false };
    this.toks.splice(i, 1, first, rest);
    this.splits.push({ i, tok: t });
  }
  error(message, tok) {
    tok = tok || this.t;
    if (this.diagnostics.length >= this.maxErrors) return;
    this.diagnostics.push({ severity: 'error', code: 'parse-error', message, file: tok.file, line: tok.line, col: tok.col });
  }
  warn(code, message, tok) {
    tok = tok || this.t;
    this.diagnostics.push({ severity: 'warning', code, message, file: tok.file, line: tok.line, col: tok.col });
  }
  fin(node, s) {
    node.loc = mkLoc(s, this.toks[this.p - 1] || s);
    return node;
  }
  finFrom(node, loc) {
    const e = this.toks[this.p - 1];
    const l = { ...loc };
    if (e && e.file === loc.file && e.end >= loc.start) { l.endLine = e.endLine; l.endCol = e.endCol; l.end = e.end; }
    node.loc = l;
    return node;
  }
  emptyLoc() {
    const t = this.t;
    return { file: t.file, line: t.line, col: t.col, endLine: t.line, endCol: t.col, start: t.start, end: t.start };
  }

  // speculative parsing: returns result or null and restores state on failure
  speculate(fn) {
    const p = this.p, d = this.diagnostics.length, sp = this.splits.length, ng = this.noGreater;
    try {
      return fn();
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      while (this.splits.length > sp) {
        const s = this.splits.pop();
        this.toks.splice(s.i, 2, s.tok);
      }
      this.p = p;
      this.diagnostics.length = d;
      this.noGreater = ng;
      return null;
    }
  }

  // ---------------------------------------------------------------- names

  pushScope() { this.scopes.push(new Map()); }
  popScope() { if (this.scopes.length > 1) this.scopes.pop(); }
  declare(name, kind) {
    if (!name) return;
    this.scopes[this.scopes.length - 1].set(name, kind);
    if (kind === 'type' || kind === 'template') this.allTypeNames.add(name);
    if (kind === 'template') this.allTemplateNames.add(name);
  }
  kindOf(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const k = this.scopes[i].get(name);
      if (k !== undefined) return k;
    }
    if (this.cpp && this.usingStd) {
      if (STD_TEMPLATE_SET.has(name)) return 'template';
      if (STD_TYPE_SET.has(name)) return 'type';
    }
    return undefined;
  }

  // Scan a (possibly qualified, possibly template) name starting at token i
  // without consuming. Returns { end, last, known, template, qualified, names }.
  scanName(i) {
    const start = i;
    let tok = this.at(i);
    const names = [];
    let qualified = false;
    if (this.cpp && this.isP('::', tok)) { i++; qualified = true; tok = this.at(i); }
    for (;;) {
      if (this.cpp && this.isK('template', tok)) { i++; tok = this.at(i); }
      if (this.cpp && this.isK('decltype', tok) && this.isP('(', this.at(i + 1))) {
        const close = this.skipBalanced(i + 1);
        if (close < 0) return null;
        i = close + 1;
        names.push('decltype');
      } else if (tok.kind === 'identifier') {
        names.push(tok.value);
        i++;
      } else return names.length ? { end: i, names, qualified, start, last: names[names.length - 1] } : null;
      tok = this.at(i);
      if (this.cpp && this.isP('<', tok) && (this.templateLikely(names, qualified) || this.stdTemplateAhead(names, qualified, i))) {
        const close = this.skipAngles(i);
        if (close < 0) break;
        i = close + 1;
        tok = this.at(i);
      }
      if (this.cpp && this.isP('::', tok) && (this.at(i + 1).kind === 'identifier' || this.isK('template', this.at(i + 1)) || this.isK('decltype', this.at(i + 1)))) {
        qualified = true;
        i++;
        tok = this.at(i);
        continue;
      }
      break;
    }
    return { end: i, names, qualified, start, last: names[names.length - 1] };
  }

  // `std::uniform_int_distribution<int> d(0, 15)`: an unknown std:: name followed by a
  // balanced <...> and then a name or '::' is a template-id (no comparison reads that way).
  stdTemplateAhead(names, qualified, i) {
    if (!qualified || names[0] !== 'std' || names.length < 2) return false;
    const close = this.skipAngles(i);
    if (close < 0) return false;
    // std::is_same_v<A, B> / std::decay_t<T>: type-trait aliases and variable templates
    if (/_[vt]$/.test(names[names.length - 1])) return true;
    const a = this.at(close + 1);
    return a.kind === 'identifier' || this.isP('::', a) || (this.isP('(', a) && this.isP(')', this.at(close + 2))) || this.isP('{', a);
  }

  templateLikely(names, qualified) {
    const last = names[names.length - 1];
    const k = this.kindOf(last);
    if (k === 'template' || k === 'fntemplate') return true;
    if (k === 'var') return false;
    if (qualified && (names.includes('std') && STD_TEMPLATE_SET.has(last))) return true;
    if (this.allTemplateNames.has(last) && k !== 'var') return true;
    return false;
  }

  // classify a scanned name: is it a type name?
  nameIsType(info) {
    if (!info) return false;
    const last = info.last;
    if (last === 'decltype') return true;
    if (!info.qualified || info.names.length === 1) {
      const k = this.kindOf(last);
      if (k === 'type' || k === 'template') return true;
      if (info.qualified && this.allTypeNames.has(last)) return true;
      return false;
    }
    const k = this.kindOf(last);
    if (k === 'type' || k === 'template') return true;
    if (this.allTypeNames.has(last)) return true;
    if (info.names[info.names.length - 2] === 'std' || info.names.includes('std')) {
      if (STD_TYPE_SET.has(last) || STD_TEMPLATE_SET.has(last)) return true;
    }
    return false;
  }

  skipBalanced(i) {
    // toks[i] is an opening bracket; returns index of the matching close or -1
    const open = this.at(i).value;
    const close = open === '(' ? ')' : open === '[' ? ']' : '}';
    let depth = 0;
    for (; i < this.toks.length; i++) {
      const t = this.toks[i];
      if (t.kind === 'eof') return -1;
      if (t.kind !== 'punct') continue;
      if (t.value === open) depth++;
      else if (t.value === close) { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  skipAngles(i) {
    // toks[i] is '<'; returns index of the matching '>' (a '>>' closes two levels)
    let depth = 0;
    for (; i < this.toks.length; i++) {
      const t = this.toks[i];
      if (t.kind === 'eof') return -1;
      if (t.kind !== 'punct') continue;
      const v = t.value;
      if (v === '<') depth++;
      else if (v === '>') { depth--; if (depth === 0) return i; }
      else if (v === '>>') { depth -= 2; if (depth <= 0) return i; }
      else if (v === '(' || v === '[') { const c = this.skipBalanced(i); if (c < 0) return -1; i = c; }
      else if (v === ';' || v === '{' || v === '}' || v === ')' || v === ']') return -1;
    }
    return -1;
  }

  // ---------------------------------------------------------------- top level

  parseTranslationUnit() {
    const s = this.t;
    const decls = this.parseDeclList(null, 'file');
    const unit = { type: 'TranslationUnit', decls };
    unit.loc = mkLoc(s, this.toks[this.toks.length - 1]);
    unit.loc.file = this.file;
    return unit;
  }

  parseDeclList(endPunct, ctx) {
    const out = [];
    while (!this.eof() && !(endPunct && this.isP(endPunct))) {
      const before = this.p;
      try {
        const d = this.parseExternal(ctx);
        if (d) out.push(d);
      } catch (e) {
        if (e instanceof RangeError) {
          // nesting too deep for the recursive-descent parser: drop this declaration only
          this.p = before;
          this.noGreater = 0;
          this.parenDepth = 0;
          this.error('Nesting too deep: declaration skipped', this.at(before));
          out.push(this.recover(before, endPunct === '}', 'ErrorDecl'));
        } else {
          if (!(e instanceof ParseError)) throw e;
          this.error(e.message, e.tok);
          out.push(this.recover(before, endPunct === '}', 'ErrorDecl'));
        }
      }
      if (this.p === before) this.next();
    }
    return out;
  }

  // Skip to a synchronisation point. Returns an Error node spanning the skipped tokens.
  recover(before, stopAtBrace, type) {
    const s = this.at(before);
    let depth = 0;
    while (!this.eof()) {
      const t = this.t;
      if (t.kind === 'punct') {
        if (t.value === '(' || t.value === '[' || t.value === '{') depth++;
        else if (t.value === ')' || t.value === ']') { if (depth > 0) depth--; }
        else if (t.value === '}') {
          if (depth === 0) { if (!stopAtBrace) this.p++; break; }
          depth--;
          if (depth === 0) { this.p++; if (this.isP(';')) this.p++; break; }
        } else if (t.value === ';' && depth === 0) { this.p++; break; }
      }
      this.p++;
    }
    if (this.p === before && !this.eof() && !(stopAtBrace && this.isP('}'))) this.p++;
    const node = { type };
    node.loc = mkLoc(s, this.toks[Math.max(before, this.p - 1)]);
    return node;
  }

  parseExternal(ctx) {
    const t = this.t;
    if (this.isP(';')) { this.p++; return this.fin({ type: 'EmptyDecl' }, t); }
    if (t.kind === 'keyword') {
      switch (t.value) {
        case 'namespace': if (this.cpp) return this.parseNamespace(); break;
        case 'inline': if (this.cpp && this.isK('namespace', this.peek())) return this.parseNamespace(); break;
        case 'using': if (this.cpp) return this.parseUsing(); break;
        case 'template': if (this.cpp) return this.parseTemplate(ctx); break;
        case 'export':
          if (this.cpp) {
            if (this.isCtx('module', this.peek()) || this.isCtx('import', this.peek())) return this.parseModuleDecl();
            this.p++;
            if (this.isP('{')) {
              const s = this.t;
              this.p++;
              const decls = this.parseDeclList('}', ctx);
              this.expectClose('}', s);
              return this.fin({ type: 'LinkageSpec', language: 'export', decls, braced: true }, t);
            }
            const d = this.parseExternal(ctx);
            if (d) d.exported = true;
            return d;
          }
          break;
        case 'extern':
          if (this.peek().kind === 'string') return this.parseLinkageSpec(ctx);
          break;
        case 'static_assert': case '_Static_assert':
          return this.parseStaticAssert();
        case 'asm': case '__asm__': case '__asm': {
          const s = this.t;
          const text = this.skipAsm();
          this.accept(';');
          return this.fin({ type: 'AsmDecl', text }, s);
        }
        case '__extension__':
          this.p++;
          return this.parseExternal(ctx);
        case 'public': case 'private': case 'protected':
          if (ctx === 'class' && this.isP(':', this.peek())) {
            this.p += 2;
            return this.fin({ type: 'AccessSpec', access: t.value }, t);
          }
          break;
        default: break;
      }
    }
    if (t.kind === 'identifier' && ctx !== 'block' && !this.kindOf(t.value)) {
      const n = this.peek();
      if (this.isP('(', n)) {
        const m = this.macroCallAhead();
        if (m) return m;
      } else if (t.bol && (n.bol || n.kind === 'eof') && (n.kind === 'keyword' || this.isP('}', n) || n.kind === 'eof'
        // G_BEGIN_DECLS / __BEGIN_DECLS before the next declaration
        || (n.kind === 'identifier' && /^_*[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(t.value)))) {
        // object-like macro on a line of its own, e.g. Q_OBJECT
        this.p++;
        const node = this.fin({ type: 'MacroCallDecl', name: t.value, args: null }, t);
        this.diagnostics.push({ severity: 'info', code: 'unknown-macro-invocation', message: `'${t.value}' looks like a macro whose definition is not available`, file: t.file, line: t.line, col: t.col });
        return node;
      }
    }
    if (this.cpp && t.kind === 'identifier' && (t.value === 'module' || t.value === 'import') && t.bol && ctx === 'file') {
      const n = this.peek();
      if (n.kind === 'identifier' || this.isP(';', n) || this.isP('<', n) || n.kind === 'string' || this.isP(':', n)) return this.parseModuleDecl();
    }
    return this.parseDeclaration(ctx);
  }

  // An unknown function-like macro used at file / class scope, e.g.
  // `DECLARE_TASK(blink, 128);` or `EXPORT_SYMBOL(x)` (its header was not found).
  macroCallAhead() {
    const s = this.t;
    const close = this.skipBalanced(this.p + 1);
    if (close < 0) return null;
    const after = this.at(close + 1);
    let plain = true;
    for (let i = this.p + 2; i < close; i++) {
      const x = this.toks[i];
      if (!(x.kind === 'identifier' || (x.kind === 'punct' && x.value === ','))) { plain = false; break; }
    }
    const semi = this.isP(';', after);
    let macro = false;
    // `foo();` stays a C90 implicit-int declaration; `foo(a, b);` is not a valid
    // declaration (an identifier list needs a definition), so it is a macro call.
    const empty = close === this.p + 2;
    if (semi) macro = !plain || !empty;
    else if (after.kind === 'eof') macro = !plain || !empty;
    else if (after.bol && !this.isP('{', after) && !this.isP('(', after) && !this.isP(',', after) && !this.isP('=', after)) {
      macro = true;
      if (plain && !this.cpp && this.isDeclSpecStartAt(close + 1, false)) {
        // K&R definition `f(a, b) int a; char b; {` declares its parameters next
        const params = new Set();
        for (let i = this.p + 2; i < close; i++) if (this.toks[i].kind === 'identifier') params.add(this.toks[i].value);
        for (let i = close + 1; i < this.toks.length; i++) {
          const x = this.toks[i];
          if (x.kind === 'eof' || (x.kind === 'punct' && (x.value === ';' || x.value === '{' || x.value === '('))) break;
          // parameter declarations take no storage class but register, and no function declarators
          if (x.kind === 'keyword' && (x.value === 'static' || x.value === 'extern' || x.value === 'typedef' || x.value === 'inline')) break;
          const nx = this.at(i + 1);
          if (x.kind === 'identifier' && params.has(x.value) && nx.kind === 'punct' && (nx.value === ';' || nx.value === ',' || nx.value === '[' || nx.value === ')')) { macro = false; break; }
        }
      }
    }
    if (!macro) return null;
    const parts = [];
    for (let i = this.p + 2; i < close; i++) parts.push(spell(this.toks[i]));
    this.p = close + 1;
    if (semi) this.p++;
    const node = this.fin({ type: 'MacroCallDecl', name: s.value, args: parts.join(' ') }, s);
    this.diagnostics.push({ severity: 'info', code: 'unknown-macro-invocation', message: `'${s.value}(...)' looks like a macro whose definition is not available`, file: s.file, line: s.line, col: s.col });
    return node;
  }

  parseModuleDecl() {
    const s = this.t;
    const words = [];
    while (!this.eof() && !this.isP(';')) words.push(spell(this.next()));
    this.accept(';');
    return this.fin({ type: 'ModuleDecl', text: words.join(' ') }, s);
  }

  skipAsm() {
    const s = this.t;
    this.p++;
    while (this.t.kind === 'keyword' || this.isCtx('goto') || this.isCtx('inline')) {
      if (this.isP('(')) break;
      this.p++;
    }
    if (!this.isP('(')) throw new ParseError("expected '(' after asm", this.t);
    const close = this.skipBalanced(this.p);
    if (close < 0) throw new ParseError('unterminated asm statement', this.t);
    const parts = [];
    for (let i = this.p; i <= close; i++) parts.push(spell(this.toks[i]));
    this.p = close + 1;
    void s;
    return parts.join(' ');
  }

  parseLinkageSpec(ctx) {
    const s = this.next(); // extern
    const lang = literalParts(this.next()).body;
    if (this.isP('{')) {
      const o = this.next();
      const decls = this.parseDeclList('}', ctx);
      this.expectClose('}', o);
      return this.fin({ type: 'LinkageSpec', language: lang, decls, braced: true }, s);
    }
    const d = this.parseExternal(ctx);
    return this.fin({ type: 'LinkageSpec', language: lang, decls: d ? [d] : [], braced: false }, s);
  }

  parseStaticAssert() {
    const s = this.next();
    this.expect('(');
    const cond = this.parseAssignment();
    let message = null;
    if (this.accept(',')) message = this.parsePrimary();
    this.expectClose(')');
    this.expect(';');
    return this.fin({ type: 'StaticAssert', cond, message, keyword: s.value }, s);
  }

  parseNamespace() {
    let isInline = false;
    if (this.isK('inline')) { this.p++; isInline = true; }
    const s = this.next();
    const attributes = this.parseAttributes();
    let name = null;
    const nested = [];
    if (this.isK('inline')) { this.p++; isInline = true; }
    if (this.isId()) {
      name = this.next().value;
      nested.push(name);
      while (this.isP('::') && (this.isId(this.peek()) || this.isK('inline', this.peek()))) {
        this.p++;
        this.accept('inline');
        nested.push(this.next().value);
      }
      if (this.isP('=')) {
        this.p++;
        const target = this.parseQualifiedName({ noTemplate: true });
        this.expect(';');
        this.declare(name, 'namespace');
        return this.fin({ type: 'NamespaceAlias', name, target: target.qname }, s);
      }
    }
    this.parseAttributes().forEach((a) => attributes.push(a));
    for (const n of nested) this.declare(n, 'namespace');
    const o = this.expect('{');
    const decls = this.parseDeclList('}', 'namespace');
    this.expectClose('}', o);
    return this.fin({ type: 'NamespaceDecl', name: nested.length ? nested.join('::') : null, inline: isInline, anonymous: !name, decls, attributes }, s);
  }

  parseUsing() {
    const s = this.next();
    if (this.accept('namespace')) {
      const n = this.parseQualifiedName({ noTemplate: true });
      this.expect(';');
      if (n.qname === 'std' || n.qname === '::std') this.usingStd = true;
      return this.fin({ type: 'UsingDirective', name: n.qname }, s);
    }
    if (this.accept('enum')) {
      const n = this.parseQualifiedName({ noTemplate: true });
      this.expect(';');
      return this.fin({ type: 'UsingDecl', name: n.name, qname: n.qname, isEnum: true }, s);
    }
    if (this.isId() && (this.isP('=', this.peek()) || (this.isP('[', this.peek()) && this.isP('[', this.peek(2))))) {
      const nameTok = this.next();
      const attributes = this.parseAttributes();
      this.expect('=');
      const typeName = this.parseTypeName();
      this.expect(';');
      this.declare(nameTok.value, 'type');
      return this.fin({ type: 'AliasDecl', name: nameTok.value, nameLoc: mkLoc(nameTok, nameTok), typeName, attributes }, s);
    }
    const names = [];
    let typename = false;
    do {
      if (this.accept('typename')) typename = true;
      const n = this.parseQualifiedName({ noTemplate: false });
      if (this.accept('...')) n.pack = true;
      names.push(n);
      const k = this.kindOf(n.name);
      if (typename || k === 'type' || k === 'template' || this.allTypeNames.has(n.name) || (n.qualifier.includes('std') && (STD_TYPE_SET.has(n.name) || STD_TEMPLATE_SET.has(n.name)))) {
        this.declare(n.name, STD_TEMPLATE_SET.has(n.name) || this.allTemplateNames.has(n.name) ? 'template' : 'type');
      } else if (!k) this.declare(n.name, 'var');
    } while (this.accept(','));
    this.expect(';');
    const first = names[0];
    return this.fin({ type: 'UsingDecl', name: first.name, qname: first.qname, names: names.map((n) => n.qname), typename }, s);
  }

  parseTemplate(ctx) {
    const s = this.next(); // template
    if (!this.isP('<')) {
      // explicit instantiation
      const decl = this.parseExternal(ctx);
      return this.fin({ type: 'TemplateDecl', params: [], decl, instantiation: true, isSpecialization: false, requires: null }, s);
    }
    this.pushScope();
    let params, decl, requires = null;
    try {
      params = this.parseTemplateParams();
      if (this.isK('requires')) { this.p++; requires = this.parseConstraint(); }
      if (this.isK('concept')) {
        const cs = this.next();
        const nameTok = this.next();
        this.expect('=');
        const expr = this.parseConstraintExpr();
        this.expect(';');
        decl = this.fin({ type: 'ConceptDecl', name: nameTok.value, expr }, cs);
      } else decl = this.parseExternal(ctx);
    } finally {
      this.popScope();
    }
    const name = templatedName(decl);
    if (name) {
      if (decl.type === 'ConceptDecl') this.declare(name, 'concept');
      else if (isTypeTemplate(decl)) this.declare(name, 'template');
      else if (!(decl.type === 'Declaration' && decl.declarators[0] && decl.declarators[0].qualifier)) {
        // function / variable templates are values; remember them for '<' disambiguation
        this.scopes[this.scopes.length - 1].set(name, 'fntemplate');
        this.allTemplateNames.add(name);
      } else this.allTemplateNames.add(name);
    }
    return this.fin({ type: 'TemplateDecl', params, decl, requires, isSpecialization: params.length === 0, instantiation: false }, s);
  }

  parseTemplateParams() {
    this.expect('<');
    const params = [];
    this.noGreater++;
    try {
      while (!this.isP('>') && !this.isP('>>') && !this.eof()) {
        const s = this.t;
        this.parseAttributes();
        let param;
        if ((this.isK('typename') || this.isK('class')) && !(this.isId(this.peek()) && (this.isP('*', this.peek(2)) || this.isP('&', this.peek(2))))) {
          const kw = this.next();
          const pack = !!this.accept('...');
          let name = null;
          if (this.isId()) name = this.next().value;
          this.declare(name, 'type');
          let def = null;
          if (this.accept('=')) def = this.parseTypeName(true);
          param = this.fin({ type: 'TemplateParam', kind: 'type', keyword: kw.value, name, pack, default: def }, s);
        } else if (this.isK('template')) {
          this.p++;
          this.pushScope();
          let inner;
          try { inner = this.parseTemplateParams(); } finally { this.popScope(); }
          if (this.isK('requires')) { this.p++; this.parseConstraint(); }
          if (!(this.accept('class') || this.accept('typename'))) throw new ParseError("expected 'class' in template template parameter", this.t);
          const pack = !!this.accept('...');
          let name = null;
          if (this.isId()) name = this.next().value;
          this.declare(name, 'template');
          let def = null;
          if (this.accept('=')) def = this.parseIdExpression();
          param = this.fin({ type: 'TemplateParam', kind: 'template', name, pack, params: inner, default: def }, s);
        } else if (this.isId() && (this.kindOf(this.t.value) === 'concept' || (!this.kindOf(this.t.value) && (this.isId(this.peek()) || this.isP('...', this.peek()) || this.isP('<', this.peek()) || this.isP('::', this.peek()))) || this.isP('::', this.peek())) && !this.nameIsType(this.scanName(this.p))) {
          // constrained type parameter: Concept T / Concept<X> T / ns::Concept T
          const c = this.parseQualifiedName({});
          const pack = !!this.accept('...');
          let name = null;
          if (this.isId()) name = this.next().value;
          this.declare(name, 'type');
          let def = null;
          if (this.accept('=')) def = this.parseTypeName(true);
          param = this.fin({ type: 'TemplateParam', kind: 'type', constraint: c.qname, name, pack, default: def }, s);
        } else {
          const p = this.parseParamDecl(true);
          param = this.fin({ type: 'TemplateParam', kind: 'nontype', name: p.name, pack: !!p.pack, param: p, default: null }, s);
          if (p.name) this.declare(p.name, 'var');
        }
        params.push(param);
        if (!this.accept(',')) break;
      }
    } finally {
      this.noGreater--;
    }
    this.expectGreater();
    return params;
  }

  parseConstraint() {
    // requires-clause: primary expressions joined by && / ||
    const s = this.t;
    let left = this.parseConstraintPrimary();
    while (this.isP('&&') || this.isP('||')) {
      const op = this.next().value;
      const right = this.parseConstraintPrimary();
      left = this.finFrom({ type: 'BinaryExpr', op, left, right }, left.loc || mkLoc(s, s));
    }
    return left;
  }
  parseConstraintPrimary() {
    if (this.isP('(')) {
      const s = this.next();
      const e = this.parseExpression();
      this.expectClose(')', s);
      return this.fin({ type: 'ParenExpr', expr: e }, s);
    }
    if (this.isK('requires')) return this.parsePrimary();
    return this.parsePostfix(this.parsePrimary());
  }
  parseConstraintExpr() {
    const ng = this.noGreater;
    this.noGreater = 0;
    try { return this.parseConditional(); } finally { this.noGreater = ng; }
  }

  // ---------------------------------------------------------------- declarations

  parseDeclaration(ctx, preSpecs, startTok) {
    const s = startTok || this.t;
    const specs = preSpecs || this.parseDeclSpecs(ctx);
    if (this.isP(';')) {
      this.p++;
      return this.fin({ type: 'Declaration', specs, declarators: [] }, s);
    }
    const declarators = [];
    for (;;) {
      const d = this.parseInitDeclarator(specs, ctx, null);
      declarators.push(d);
      if (d.type === 'FunctionDecl' && d.body) {
        return this.fin({ type: 'Declaration', specs, declarators }, s);
      }
      if (this.accept(',')) continue;
      break;
    }
    if (!this.accept(';')) {
      // missing ';' — report and continue without consuming if the next token starts a new line
      const t = this.t;
      if (t.bol || this.isP('}') || t.kind === 'eof') {
        this.error(`expected ';' after declaration`, this.toks[this.p - 1]);
      } else throw new ParseError(`expected ';' or ',' before ${describe(t)}`, t);
    }
    return this.fin({ type: 'Declaration', specs, declarators }, s);
  }

  parseDeclSpecs(ctx) {
    const s = this.t;
    // parseTypeName(true): the position must hold a type, so an unknown name is one
    const force = this.forceTypeName && ctx === 'typeName';
    this.forceTypeName = false;
    const specs = { type: 'DeclSpec', storage: [], qualifiers: [], functionSpecs: [], typeSpec: null, attributes: [], alignas: [], callingConvention: null };
    let builtin = null;
    let builtinStart = null;
    let sawType = false;
    const setType = (node) => {
      if (specs.typeSpec && !(specs.typeSpec.type === 'BuiltinType' && node.type === 'BuiltinType')) {
        this.error('two or more data types in declaration specifiers');
      }
      specs.typeSpec = node;
      sawType = true;
    };
    for (;;) {
      const t = this.t;
      if (t.kind === 'keyword') {
        const v = t.value;
        if (TYPE_KW.has(v)) {
          if (v === '_BitInt') {
            const bs = this.next();
            this.expect('(');
            const bits = this.parseAssignment();
            this.expect(')');
            builtin = this.fin({ type: 'BuiltinType', names: ['_BitInt'], bits }, bs);
            setType(builtin);
            continue;
          }
          this.p++;
          if (!builtin || specs.typeSpec !== builtin) {
            if (specs.typeSpec && specs.typeSpec.type !== 'BuiltinType') this.error('two or more data types in declaration specifiers', t);
            builtin = { type: 'BuiltinType', names: [] };
            builtinStart = t;
            specs.typeSpec = builtin;
            sawType = true;
          }
          builtin.names.push(v === '__signed' || v === '__signed__' ? 'signed' : v);
          builtin.loc = mkLoc(builtinStart, t);
          continue;
        }
        if (QUAL_KW.has(v)) {
          if (v === '_Atomic' && this.isP('(', this.peek())) {
            const as = this.next();
            this.p++;
            const tn = this.parseTypeName();
            this.expect(')');
            setType(this.fin({ type: 'AtomicType', typeName: tn }, as));
            continue;
          }
          this.p++;
          specs.qualifiers.push(QUAL_NORM[v] || v);
          continue;
        }
        if (STORAGE_KW.has(v)) {
          if (v === 'auto' && (this.cpp || (this.c23 && !sawType))) {
            this.p++;
            if (this.cpp) { setType(this.fin({ type: 'AutoType', keyword: 'auto' }, t)); continue; }
            specs.storage.push('auto');
            continue;
          }
          this.p++;
          specs.storage.push(v === '_Thread_local' || v === '__thread' ? 'thread_local' : v);
          continue;
        }
        if (FUNC_KW.has(v)) {
          this.p++;
          specs.functionSpecs.push(v === '__inline' || v === '__inline__' || v === '__forceinline' ? 'inline' : v);
          if (v === 'explicit' && this.isP('(')) { const c = this.skipBalanced(this.p); if (c > 0) this.p = c + 1; }
          continue;
        }
        switch (v) {
          case 'struct': case 'union': case 'class':
            if (sawType) break;
            setType(this.parseRecord());
            continue;
          case 'enum':
            if (sawType) break;
            setType(this.parseEnum());
            continue;
          case 'typeof': case 'typeof_unqual': case '__typeof__': case '__typeof': {
            const ts = this.next();
            this.expect('(');
            const arg = this.isTypeIdStart() ? this.parseTypeName() : this.parseExpression();
            this.expect(')');
            setType(this.fin({ type: 'TypeofType', arg, unqual: v === 'typeof_unqual' }, ts));
            continue;
          }
          case 'decltype': {
            if (sawType) break;
            const ts = this.next();
            this.expect('(');
            let expr = null, isAuto = false;
            if (this.isK('auto') && this.isP(')', this.peek())) { this.p++; isAuto = true; } else expr = this.parseExpression();
            this.expect(')');
            const node = this.fin({ type: 'DecltypeType', expr, auto: isAuto }, ts);
            if (this.isP('::')) {
              // decltype(x)::member
              this.p++;
              const n = this.parseQualifiedName({});
              setType(this.fin({ type: 'NamedType', name: n.name, qualifier: 'decltype(...)', qname: 'decltype(...)::' + n.qname, templateArgs: n.templateArgs, decltype: node, dependent: true }, ts));
              continue;
            }
            setType(node);
            continue;
          }
          case '__auto_type':
            this.p++;
            setType(this.fin({ type: 'AutoType', keyword: '__auto_type' }, t));
            continue;
          case 'typename': {
            if (sawType) break;
            this.p++;
            const n = this.parseQualifiedName({ forceTemplate: true });
            setType(this.fin({ type: 'NamedType', name: n.name, qualifier: n.qualifier, qname: n.qname, templateArgs: n.templateArgs, global: n.global, dependent: true }, t));
            continue;
          }
          case 'alignas': case '_Alignas': {
            const as = this.next();
            this.expect('(');
            const arg = this.isTypeIdStart() ? this.parseTypeName() : this.parseAssignment();
            const pack = !!this.accept('...');
            this.expect(')');
            specs.alignas.push(this.fin({ type: 'AlignasSpec', arg, pack, keyword: v }, as));
            continue;
          }
          case '__attribute__': case '__attribute': case '__declspec':
            for (const a of this.parseAttributes()) specs.attributes.push(a);
            continue;
          case '__extension__':
            this.p++;
            continue;
          case '__cdecl': case '__stdcall': case '__fastcall':
            this.p++;
            specs.callingConvention = v;
            continue;
          default: break;
        }
        break;
      }
      if (t.kind === 'punct') {
        if (t.value === '[' && this.isP('[', this.peek())) {
          for (const a of this.parseAttributes()) specs.attributes.push(a);
          continue;
        }
        if (t.value === '::' && this.cpp && !sawType) {
          const info = this.scanName(this.p);
          if (info && this.nameIsType(info) && !this.isCtorName(info)) {
            setType(this.parseNamedType());
            continue;
          }
        }
        break;
      }
      if (t.kind === 'identifier') {
        // `C10_NOINLINE static void f()`, `TORCH_API void g();`: an unknown attribute-like
        // macro (its header was not found) in front of the specifiers
        if (!sawType && this.cpp && !this.kindOf(t.value) && /^_*[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(t.value)) {
          const n = this.peek();
          if (n.kind === 'keyword' && n.line === t.line && (STORAGE_KW.has(n.value) || FUNC_KW.has(n.value) || (TYPE_KW.has(n.value) && !QUAL_KW.has(n.value)))) {
            this.p++;
            specs.attributes.push({ name: t.value, namespace: null, args: null, syntax: 'macro' });
            continue;
          }
        }
        if (WIN_CC.has(t.value) && !this.kindOf(t.value) && (this.isId(this.peek()) || this.isP('::', this.peek()))) {
          this.p++;
          specs.callingConvention = t.value;
          continue;
        }
        if (sawType) break;
        const info = this.scanName(this.p);
        if (!info) break;
        if (this.cpp && this.isCtorName(info)) break;
        if (this.nameIsType(info)) {
          setType(this.parseNamedType());
          continue;
        }
        if (this.kindOf(info.last) === 'var' || this.kindOf(info.last) === 'namespace') break;
        if (force || this.unknownIsType(info, ctx, specs)) {
          const nt = this.parseNamedType();
          nt.unknown = true;
          setType(nt);
          continue;
        }
        break;
      }
      break;
    }
    if (!specs.typeSpec && !specs.storage.length && !specs.qualifiers.length && !specs.functionSpecs.length && !specs.attributes.length && !specs.alignas.length) {
      specs.loc = this.emptyLoc();
      specs.empty = true;
    } else this.fin(specs, s);
    return specs;
  }

  // C++: is the name at `info` a constructor / destructor declarator of the current or a qualified class?
  isCtorName(info) {
    const after = this.at(info.end);
    // X::~X  /  X::operator...
    if (this.isP('::', after) && (this.isP('~', this.at(info.end + 1)) || this.isK('operator', this.at(info.end + 1)))) return true;
    if (!this.isP('(', after)) return false;
    const cls = this.classStack[this.classStack.length - 1];
    if (cls && info.names.length === 1 && info.last === cls) return true;
    if (info.names.length >= 2) {
      const n = info.names;
      if (n[n.length - 1] === n[n.length - 2]) return true;
    }
    return false;
  }

  // heuristics for identifiers that are not known type names
  unknownIsType(info, ctx, specs) {
    const j = info.end;
    const a = this.at(j);
    const hasOther = specs.storage.length || specs.qualifiers.length || specs.functionSpecs.length;
    if (ctx === 'typeName') {
      let k = j;
      while (this.isP('*', this.at(k)) || this.isP('&', this.at(k)) || (this.at(k).kind === 'keyword' && QUAL_KW.has(this.at(k).value))) k++;
      if (k > j && (this.isP(')', this.at(k)) || this.isP('>', this.at(k)) || this.isP(',', this.at(k)))) return true;
      if (this.isP(')', a) && hasOther) return true;
      return false;
    }
    if (ctx === 'param') {
      if (a.kind === 'identifier' || (a.kind === 'keyword' && (QUAL_KW.has(a.value) || a.value === '__attribute__'))) return true;
      if (this.isP('*', a) || this.isP('&', a) || this.isP('&&', a) || this.isP('[', a)) return true;
      if (this.isP('(', a) && this.isP('*', this.at(j + 1))) return true;
      if (this.cpp && (this.isP(',', a) || this.isP(')', a) || this.isP('=', a) || this.isP('...', a))) return true;
      if (hasOther && (this.isP(',', a) || this.isP(')', a))) return true;
      return false;
    }
    return this.declLikelyAfterType(j, !!hasOther);
  }

  declLikelyAfterType(j, hasOther) {
    const a = this.at(j);
    if (a.kind === 'identifier') {
      if (WIN_CC.has(a.value) && !this.kindOf(a.value) && (this.isId(this.at(j + 1)) || this.isP('::', this.at(j + 1)))) return true;
      const b = this.at(j + 1);
      if (b.kind === 'punct' && (b.value === ';' || b.value === ',' || b.value === '=' || b.value === '[' || b.value === '(' || b.value === ':' || b.value === ')' || (b.value === '{' && this.cpp))) return true;
      if (b.kind === 'keyword' && (b.value === '__attribute__' || b.value === '__asm__' || b.value === 'asm' || QUAL_KW.has(b.value))) return true;
      // `T C::member(...)` / `T C::static_member = ...`: two names in a row are never an expression
      if (this.cpp && this.isP('::', b)) {
        const info = this.scanName(j);
        const c = info && this.at(info.end);
        if (c && c.kind === 'punct' && (c.value === '(' || c.value === '=' || c.value === ';' || c.value === '[' || c.value === '{')) return true;
      }
      return false;
    }
    if (a.kind === 'keyword' && QUAL_KW.has(a.value)) return true;
    let k = j;
    while (this.isP('*', this.at(k)) || (this.cpp && (this.isP('&', this.at(k)) || this.isP('&&', this.at(k)))) || (this.at(k).kind === 'keyword' && QUAL_KW.has(this.at(k).value))) k++;
    if (k > j) {
      const c = this.at(k);
      const d = this.at(k + 1);
      if (c.kind === 'identifier' && d.kind === 'punct' && (d.value === ';' || d.value === '=' || d.value === ',' || d.value === '[' || d.value === ')' || d.value === '(' || (this.cpp && (d.value === ':' || d.value === '{')))) return true;
      if (this.cpp && c.kind === 'identifier' && this.isP('::', d)) {
        // `GtkWidget* AppWindow::build() {`
        const info = this.scanName(k);
        const e = info && this.at(info.end);
        if (e && this.isP('(', e) && info.names.length > 1) return true;
      }
      return false;
    }
    if (this.isP('(', a) && (this.isP('*', this.at(j + 1)) || this.isP('&', this.at(j + 1))) && this.isId(this.at(j + 2)) && this.isP(')', this.at(j + 3)) && (this.isP('(', this.at(j + 4)) || this.isP('[', this.at(j + 4)))) return true;
    if (hasOther && (this.isP(';', a))) return false;
    return false;
  }

  parseNamedType() {
    const s = this.t;
    const n = this.parseQualifiedName({ forceTemplate: true });
    return this.fin({ type: 'NamedType', name: n.name, qualifier: n.qualifier, qname: n.qname, templateArgs: n.templateArgs, global: n.global }, s);
  }

  // Qualified name: [::] (id [<args>] ::)* (id [<args>] | ~id | operator X)
  parseQualifiedName(o) {
    const s = this.t;
    const parts = [];
    let global = false;
    let templateArgs = null;
    if (this.cpp && this.isP('::')) { this.p++; global = true; }
    let name = null, isOperator = false, isDestructor = false, isConversion = false, conversionType = null;
    for (;;) {
      if (this.cpp && this.isK('template')) this.p++;
      const t = this.t;
      if (this.cpp && this.isK('operator')) {
        const op = this.parseOperatorName();
        name = op.name;
        isOperator = true;
        isConversion = op.conversion;
        conversionType = op.type || null;
        templateArgs = null;
        if (this.isP('<') && !op.conversion && (this.allTemplateNames.has(name))) templateArgs = this.parseTemplateArgs();
        break;
      }
      if (this.cpp && this.isP('~') && (this.isId(this.peek()) || this.isK('decltype', this.peek()))) {
        this.p++;
        name = '~' + this.next().value;
        isDestructor = true;
        templateArgs = null;
        break;
      }
      if (this.cpp && this.isK('decltype') && this.isP('(', this.peek())) {
        const c = this.skipBalanced(this.p + 1);
        this.p = c > 0 ? c + 1 : this.p + 1;
        name = 'decltype(...)';
      } else if (t.kind === 'identifier') {
        this.p++;
        name = t.value;
      } else throw new ParseError(`expected identifier before ${describe(t)}`, t);
      templateArgs = null;
      if (this.cpp && this.isP('<') && !o.noTemplate) {
        const nmInfo = { names: parts.concat(name), last: name, qualified: parts.length > 0 || global };
        if (o.forceTemplate || this.templateLikely(nmInfo.names, nmInfo.qualified) || this.stdTemplateAhead(nmInfo.names, nmInfo.qualified, this.p)) {
          const r = this.speculate(() => this.parseTemplateArgs());
          if (r) templateArgs = r;
        } else if (o.expr && this.kindOf(name) !== 'var') {
          const lt = this.t;
          if (!this.failedAngles.has(lt)) {
            const r = this.speculate(() => {
              const a = this.parseTemplateArgs();
              const n = this.t;
              if (!(this.isP('(', n) || this.isP('::', n) || this.isP('{', n))) throw new ParseError('not a template-id', n);
              return a;
            });
            if (r) templateArgs = r;
            else this.failedAngles.add(lt);
          }
        }
      }
      if (this.cpp && this.isP('::') && (this.isId(this.peek()) || this.isP('~', this.peek()) || this.isK('operator', this.peek()) || this.isK('template', this.peek()) || this.isK('decltype', this.peek()))) {
        if (o.stopBeforeMemberPointer && this.isP('*', this.peek())) break;
        if (o.forceTemplate && (this.isP('~', this.peek()) || this.isK('operator', this.peek()))) break;
        parts.push(templateArgs ? name + '<>' : name);
        this.p++;
        continue;
      }
      break;
    }
    const qualifier = parts.map((x) => x.replace(/<>$/, '')).join('::');
    const qname = (global ? '::' : '') + (qualifier ? qualifier + '::' : '') + name;
    return { name, qualifier, qname, global, templateArgs, isOperator, isDestructor, isConversion, conversionType, loc: mkLoc(s, this.toks[this.p - 1]) };
  }

  parseOperatorName() {
    this.next(); // operator
    const t = this.t;
    if (t.kind === 'keyword' && (t.value === 'new' || t.value === 'delete')) {
      this.p++;
      if (this.isP('[') && this.isP(']', this.peek())) { this.p += 2; return { name: `operator ${t.value}[]` }; }
      return { name: `operator ${t.value}` };
    }
    if (this.isK('co_await')) { this.p++; return { name: 'operator co_await' }; }
    if (this.isP('(') && this.isP(')', this.peek())) { this.p += 2; return { name: 'operator()' }; }
    if (this.isP('[') && this.isP(']', this.peek())) { this.p += 2; return { name: 'operator[]' }; }
    if (t.kind === 'string') {
      this.p++;
      let suffix = t.udSuffix || '';
      if (!suffix && this.isId()) suffix = this.next().value;
      return { name: `operator""${suffix}` };
    }
    if (t.kind === 'punct' && t.value !== '(' && t.value !== ';' && t.value !== '{') {
      this.p++;
      if (t.value === '>' && (this.isP('>') || this.isP('=')) && !this.t.space) {
        // '>' '>' split earlier
        const n = this.next();
        return { name: 'operator' + '>' + n.value };
      }
      return { name: 'operator' + t.value };
    }
    // conversion function
    const specs = this.parseDeclSpecs('typeName');
    const decl = this.parsePtrOpsOnly();
    const typeName = { type: 'TypeName', specs, declarator: decl, loc: specs.loc };
    return { name: 'operator ' + typeText(typeName), conversion: true, type: typeName };
  }

  parsePtrOpsOnly() {
    const s = this.t;
    if (this.isP('*')) {
      this.p++;
      const quals = this.parseQualList();
      const inner = this.parsePtrOpsOnly();
      return this.fin({ type: 'PointerDeclarator', quals, attributes: [], inner }, s);
    }
    if (this.isP('&') || this.isP('&&')) {
      const r = this.next().value === '&&';
      const inner = this.parsePtrOpsOnly();
      return this.fin({ type: 'ReferenceDeclarator', rvalue: r, inner }, s);
    }
    return { type: 'AbstractDeclarator', loc: this.emptyLoc() };
  }

  parseTemplateArgs() {
    this.expect('<');
    const args = [];
    this.noGreater++;
    const pd = this.parenDepth;
    this.parenDepth = 0;
    try {
      while (!this.isP('>') && !this.isP('>>') && !this.isP('>=') && !this.isP('>>=')) {
        if (this.eof()) throw new ParseError('unterminated template argument list', this.t);
        let arg;
        const s = this.t;
        if (this.isTypeIdStart(true)) {
          arg = this.speculate(() => {
            const tn = this.parseTypeName();
            if (!(this.isP(',') || this.isP('>') || this.isP('>>') || this.isP('...') || this.isP('>=') || this.isP('>>='))) throw new ParseError('not a type argument', this.t);
            return tn;
          });
          if (!arg) arg = this.parseConditional();
        } else arg = this.parseConditional();
        if (this.isP('...')) {
          this.p++;
          arg = this.fin({ type: 'PackExpansion', expr: arg }, s);
        }
        args.push(arg);
        if (!this.accept(',')) break;
      }
    } finally {
      this.noGreater--;
      this.parenDepth = pd;
    }
    this.expectGreater();
    return args;
  }

  parseAttributes() {
    const out = [];
    for (;;) {
      const t = this.t;
      if (this.isP('[') && this.isP('[', this.peek())) {
        const s = t;
        this.p += 2;
        let ns = null;
        if (this.isK('using')) { this.p++; ns = this.next().value; this.expect(':'); }
        while (!this.eof() && !(this.isP(']') && this.isP(']', this.peek()))) {
          if (this.accept(',')) continue;
          const as = this.t;
          let name = this.next().value;
          let aNs = ns;
          if (this.isP('::')) { this.p++; aNs = name; name = this.next().value; }
          let args = null;
          if (this.isP('(')) args = this.balancedText();
          if (this.accept('...')) { /* pack */ }
          out.push(this.fin({ type: 'Attribute', name: normAttr(name), namespace: aNs, args, syntax: 'cxx11' }, as));
        }
        this.expect(']');
        this.expect(']');
        void s;
        continue;
      }
      if (t.kind === 'keyword' && (t.value === '__attribute__' || t.value === '__attribute')) {
        this.p++;
        this.expect('(');
        this.expect('(');
        while (!this.eof() && !this.isP(')')) {
          if (this.accept(',')) continue;
          const as = this.t;
          const name = this.next().value;
          let args = null;
          if (this.isP('(')) args = this.balancedText();
          out.push(this.fin({ type: 'Attribute', name: normAttr(name), namespace: 'gnu', args, syntax: 'gnu' }, as));
        }
        this.expect(')');
        this.expect(')');
        continue;
      }
      if (this.isK('__declspec')) {
        this.p++;
        this.expect('(');
        while (!this.eof() && !this.isP(')')) {
          const as = this.t;
          const name = this.next().value;
          let args = null;
          if (this.isP('(')) args = this.balancedText();
          out.push(this.fin({ type: 'Attribute', name: normAttr(name), namespace: 'msvc', args, syntax: 'declspec' }, as));
        }
        this.expect(')');
        continue;
      }
      if (this.isK('alignas') || this.isK('_Alignas')) break;
      break;
    }
    return out;
  }

  balancedText() {
    const close = this.skipBalanced(this.p);
    if (close < 0) throw new ParseError('unbalanced parentheses', this.t);
    const parts = [];
    for (let i = this.p + 1; i < close; i++) parts.push(spell(this.toks[i]));
    this.p = close + 1;
    return parts.join(' ');
  }

  parseQualList() {
    const quals = [];
    for (;;) {
      const t = this.t;
      if (t.kind === 'keyword' && QUAL_KW.has(t.value)) { this.p++; quals.push(QUAL_NORM[t.value] || t.value); continue; }
      if (t.kind === 'keyword' && (t.value === '__attribute__' || t.value === '__attribute')) { this.parseAttributes(); continue; }
      if (t.kind === 'keyword' && (t.value === '__cdecl' || t.value === '__stdcall' || t.value === '__fastcall')) { this.p++; continue; }
      if (t.kind === 'identifier' && (t.value === '__ptr64' || t.value === '__ptr32' || t.value === '_Nonnull' || t.value === '_Nullable' || t.value === '__unaligned')) { this.p++; continue; }
      break;
    }
    return quals;
  }

  // o: { abstract: bool, ctx: string, noFunction?: bool }
  parseDeclarator(o) {
    const s = this.t;
    if (this.isP('*') || this.isP('^')) {
      this.p++;
      const attributes = this.isP('[') && this.isP('[', this.peek()) ? this.parseAttributes() : [];
      const quals = this.parseQualList();
      const inner = this.parseDeclarator(o);
      return this.fin({ type: 'PointerDeclarator', quals, attributes, inner }, s);
    }
    if (this.cpp && (this.isP('&') || this.isP('&&'))) {
      const rvalue = this.next().value === '&&';
      this.parseAttributes();
      const inner = this.parseDeclarator(o);
      return this.fin({ type: 'ReferenceDeclarator', rvalue, inner }, s);
    }
    if (this.t.kind === 'keyword' && (this.t.value === '__cdecl' || this.t.value === '__stdcall' || this.t.value === '__fastcall')) {
      this.p++;
      return this.parseDeclarator(o);
    }
    if (this.cpp && (this.isId() || this.isP('::'))) {
      // member pointer:  C::* p
      const mp = this.scanMemberPointer(this.p);
      if (mp > 0) {
        const n = this.parseQualifiedName({ stopBeforeMemberPointer: true });
        this.expect('::');
        this.expect('*');
        const quals = this.parseQualList();
        const inner = this.parseDeclarator(o);
        return this.fin({ type: 'MemberPointerDeclarator', cls: n.qname, quals, inner }, s);
      }
    }
    let node;
    if (this.isP('(') && this.nestedDeclaratorAhead(o)) {
      const open = this.next();
      const inner = this.parseDeclarator(o);
      this.expectClose(')', open);
      node = inner;
      node.parenthesized = true;
    } else if (this.cpp && this.isP('[') && !this.isP('[', this.peek()) && !o.abstract) {
      // structured binding
      this.p++;
      const names = [];
      while (!this.isP(']') && !this.eof()) {
        const nt = this.next();
        if (nt.kind !== 'identifier') throw new ParseError('expected identifier in structured binding', nt);
        names.push({ name: nt.value, loc: mkLoc(nt, nt) });
        if (!this.accept(',')) break;
      }
      this.expect(']');
      node = this.fin({ type: 'BindingDeclarator', names }, s);
      return node;
    } else if (this.isP('...') && this.cpp) {
      this.p++;
      const inner = this.parseDeclarator(o);
      inner.pack = true;
      return inner;
    } else if (this.isId() || (this.cpp && (this.isP('::') || this.isK('operator') || (this.isP('~') && this.isId(this.peek()))))) {
      if (o.abstract && this.isId() && o.ctx === 'typeName' && this.nameIsType(this.scanName(this.p))) {
        node = { type: 'AbstractDeclarator', loc: this.emptyLoc() };
      } else {
        const ns = this.t;
        const n = this.parseQualifiedName({ noTemplate: !this.cpp, forceTemplate: false });
        node = this.fin({
          type: 'IdentDeclarator', name: n.name, qualifier: n.qualifier, qname: n.qname, global: n.global,
          templateArgs: n.templateArgs, isOperator: n.isOperator, isDestructor: n.isDestructor, isConversion: n.isConversion,
          conversionType: n.conversionType,
        }, ns);
      }
    } else if (o.abstract || (o.ctx === 'member' && this.isP(':'))) {
      node = { type: 'AbstractDeclarator', loc: this.emptyLoc() };
    } else {
      throw new ParseError(`expected identifier or '(' before ${describe(this.t)}`, this.t);
    }
    // suffixes
    for (;;) {
      if (this.isP('[')) {
        if (this.isP('[', this.peek())) break; // attribute
        const bs = this.t;
        this.p++;
        let isStatic = false, star = false, size = null;
        const quals = [];
        for (;;) {
          if (this.isK('static')) { this.p++; isStatic = true; continue; }
          if (this.t.kind === 'keyword' && QUAL_KW.has(this.t.value)) { quals.push(QUAL_NORM[this.t.value] || this.t.value); this.p++; continue; }
          break;
        }
        if (this.isP('*') && this.isP(']', this.peek())) { this.p++; star = true; } else if (!this.isP(']')) {
          const ng = this.noGreater;
          this.noGreater = 0;
          try { size = this.parseAssignment(); } finally { this.noGreater = ng; }
        }
        this.expect(']');
        node = this.finFrom({ type: 'ArrayDeclarator', inner: node, size, quals, isStatic, star }, node.loc && node.loc.start <= bs.start && node.type !== 'AbstractDeclarator' ? node.loc : mkLoc(bs, bs));
        continue;
      }
      if (this.isP('(')) {
        if (o.noFunction) break;
        if (this.cpp && !o.abstract && o.ctx !== 'param' && o.ctx !== 'member' && !this.paramListAhead(node)) break;
        const ps = this.t;
        const fn = this.parseFunctionSuffix(node);
        node = this.finFrom(fn, node.loc && node.type !== 'AbstractDeclarator' ? node.loc : mkLoc(ps, ps));
        continue;
      }
      break;
    }
    // trailing GNU attributes / asm labels
    for (;;) {
      if (this.isK('__attribute__') || this.isK('__attribute')) {
        const attrs = this.parseAttributes();
        node.attributes = (node.attributes || []).concat(attrs);
        continue;
      }
      if (this.isK('asm') || this.isK('__asm__') || this.isK('__asm')) {
        node.asmLabel = this.skipAsm();
        continue;
      }
      break;
    }
    return node;
  }

  scanMemberPointer(i) {
    let k = i;
    if (this.isP('::', this.at(k))) k++;
    let any = false;
    for (;;) {
      if (!this.isId(this.at(k))) return -1;
      k++;
      if (this.isP('<', this.at(k))) {
        const c = this.skipAngles(k);
        if (c < 0) return -1;
        k = c + 1;
      }
      if (!this.isP('::', this.at(k))) return -1;
      k++;
      any = true;
      if (this.isP('*', this.at(k))) return any ? k : -1;
    }
  }

  nestedDeclaratorAhead(o) {
    const n = this.peek();
    if (n.kind === 'punct') {
      if (n.value === '*' || n.value === '^' || n.value === '(' ) return n.value !== '(' || o.abstract !== true || this.isP('*', this.peek(2)) || this.isP('^', this.peek(2));
      if (this.cpp && (n.value === '&' || n.value === '&&')) return true;
      if (n.value === '[' && this.isP('[', this.peek(2))) return true;
      if (this.cpp && n.value === '::') return this.scanMemberPointer(this.p + 1) > 0 || !o.abstract;
      if (n.value === '...' && this.cpp) return !o.abstract;
      return false;
    }
    if (n.kind === 'identifier') {
      if (o.abstract) {
        if (this.cpp && this.scanMemberPointer(this.p + 1) > 0) return true;
        // (T) in an abstract declarator is a parameter list when T is a type
        const info = this.scanName(this.p + 1);
        if (this.nameIsType(info)) return false;
        if (o.ctx === 'param' || o.ctx === 'typeName') return false;
        return true;
      }
      return true;
    }
    if (n.kind === 'keyword' && (n.value === '__cdecl' || n.value === '__stdcall' || n.value === '__attribute__')) return true;
    if (n.kind === 'keyword' && n.value === 'operator') return !o.abstract;
    return false;
  }

  // C++: after `T name`, does '(' start a parameter list (function declarator)
  // rather than a direct initializer?
  paramListAhead(node) {
    const n = this.peek();
    if (this.isP(')', n)) return true;
    if (this.isP('...', n)) return true;
    if (node && node.type === 'IdentDeclarator' && (node.isOperator || node.isDestructor || node.qualifier)) return true;
    if (this.isDeclSpecStartAt(this.p + 1, true)) return true;
    // `void cb(GtkButton*, gpointer) {`: a body or a function suffix after ')' settles it
    const close = this.skipBalanced(this.p);
    if (close > 0) {
      const a = this.at(close + 1);
      if (this.isP('{', a) || this.isP('->', a) || (a.kind === 'keyword' && (a.value === 'noexcept' || a.value === 'throw' || a.value === 'const' || a.value === 'volatile')) || (a.kind === 'identifier' && (a.value === 'override' || a.value === 'final'))) return true;
    }
    return false;
  }

  isDeclSpecStartAt(i, forParam) {
    const t = this.at(i);
    if (t.kind === 'keyword') {
      const v = t.value;
      if (TYPE_KW.has(v) || QUAL_KW.has(v) || STORAGE_KW.has(v) || FUNC_KW.has(v)) return true;
      if (OTHER_SPEC_KW.has(v) && v !== '__extension__') return true;
      return false;
    }
    if (this.isP('[', t) && this.isP('[', this.at(i + 1))) return true;
    if (t.kind === 'identifier' || (this.cpp && this.isP('::', t))) {
      const info = this.scanName(i);
      if (!info) return false;
      if (this.nameIsType(info)) {
        if (forParam) {
          // `T x(Other(y))` vs `T f(Other y)`: a type followed by '(' or '{' in a call is an expression
          const a = this.at(info.end);
          if (this.isP('(', a) && !(this.isP('*', this.at(info.end + 1)) || this.isP('&', this.at(info.end + 1)))) return false;
          if (this.isP('{', a) || this.isP('.', a) || this.isP('->', a)) return false;
        }
        return true;
      }
      if (forParam && !this.kindOf(info.last)) {
        const a = this.at(info.end);
        if (a.kind === 'identifier' && (this.isP(',', this.at(info.end + 1)) || this.isP(')', this.at(info.end + 1)) || this.isP('=', this.at(info.end + 1)))) return true;
        if ((this.isP('*', a) || this.isP('&', a)) && this.isId(this.at(info.end + 1)) && (this.isP(',', this.at(info.end + 2)) || this.isP(')', this.at(info.end + 2)))) return true;
        // unnamed parameter `T*,` / `T&)` / `T* const)` — never an expression
        let k = info.end;
        while (this.isP('*', this.at(k)) || this.isP('&', this.at(k)) || this.isP('&&', this.at(k)) || (this.at(k).kind === 'keyword' && QUAL_KW.has(this.at(k).value))) k++;
        if (k > info.end && (this.isP(',', this.at(k)) || this.isP(')', this.at(k)))) return true;
      }
    }
    return false;
  }

  parseFunctionSuffix(inner) {
    const open = this.expect('(');
    this.pushScope();
    let pl;
    try {
      pl = this.parseParamList();
    } finally {
      this.popScope();
    }
    this.expectClose(')', open);
    const fn = { type: 'FunctionDeclarator', inner, params: pl.params, variadic: pl.variadic, voidParams: pl.voidParams, noPrototype: pl.noPrototype, krIdentifiers: pl.krIdentifiers, quals: [], refQual: null, noexcept: null, noexceptExpr: null, throwSpec: null, trailingReturn: null, attributes: [] };
    for (;;) {
      const t = this.t;
      if (t.kind === 'keyword' && QUAL_KW.has(t.value)) { fn.quals.push(QUAL_NORM[t.value] || t.value); this.p++; continue; }
      if (this.cpp && (this.isP('&') || this.isP('&&')) && !this.isId(this.peek()) ) {
        const after = this.peek();
        if (this.isP(';', after) || this.isP('{', after) || this.isP('=', after) || this.isK('noexcept', after) || this.isK('const', after) || this.isP('->', after) || after.kind === 'identifier' && (after.value === 'override' || after.value === 'final') || this.isP(',', after) || this.isP(')', after)) {
          fn.refQual = this.next().value;
          continue;
        }
        break;
      }
      if (this.cpp && this.isK('noexcept')) {
        this.p++;
        fn.noexcept = true;
        if (this.isP('(')) {
          this.p++;
          fn.noexceptExpr = this.parseExpression();
          this.expect(')');
        }
        continue;
      }
      if (this.cpp && this.isK('throw') && this.isP('(', this.peek())) {
        this.p++;
        fn.throwSpec = this.balancedText();
        continue;
      }
      if (this.isP('[') && this.isP('[', this.peek())) { for (const a of this.parseAttributes()) fn.attributes.push(a); continue; }
      if (this.isK('__attribute__') || this.isK('__attribute')) { for (const a of this.parseAttributes()) fn.attributes.push(a); continue; }
      if (this.cpp && this.isP('->')) {
        this.p++;
        fn.trailingReturn = this.parseTypeName(true);
        continue;
      }
      if (this.cpp && this.isK('requires')) {
        this.p++;
        fn.requires = this.parseConstraint();
        continue;
      }
      break;
    }
    return fn;
  }

  parseParamList() {
    const res = { params: [], variadic: false, voidParams: false, noPrototype: false, krIdentifiers: false };
    if (this.isP(')')) { if (!this.cpp) res.noPrototype = true; return res; }
    if (this.isK('void') && this.isP(')', this.peek())) { this.p++; res.voidParams = true; return res; }
    for (;;) {
      if (this.isP('...')) { this.p++; res.variadic = true; break; }
      const t = this.t;
      if (!this.cpp && t.kind === 'identifier' && this.kindOf(t.value) !== 'type' && (this.isP(',', this.peek()) || this.isP(')', this.peek()))) {
        this.p++;
        res.krIdentifiers = true;
        res.params.push(this.fin({ type: 'ParamDecl', name: t.value, nameLoc: mkLoc(t, t), specs: null, declarator: null, default: null, krIdentifier: true, attributes: [] }, t));
      } else {
        const p = this.parseParamDecl(false);
        res.params.push(p);
        if (p.name) this.declare(p.name, 'var');
      }
      if (this.accept(',')) continue;
      if (this.cpp && this.isP('...')) { this.p++; res.variadic = true; }
      break;
    }
    return res;
  }

  parseParamDecl(inTemplate) {
    const s = this.t;
    const attributes = this.parseAttributes();
    const specs = this.parseDeclSpecs('param');
    if (specs.empty) throw new ParseError(`expected parameter declaration before ${describe(this.t)}`, this.t);
    const declarator = this.parseDeclarator({ abstract: true, ctx: 'param' });
    const leaf = declLeaf(declarator);
    let def = null;
    if (this.cpp && this.isP('=')) {
      this.p++;
      if (inTemplate) def = this.isTypeIdStart() ? this.parseTypeName() : this.parseConditional();
      else def = this.isP('{') ? this.parseInitList() : this.parseAssignment();
    }
    for (const a of specs.attributes) attributes.push(a);
    const node = {
      type: 'ParamDecl', name: leaf && leaf.type === 'IdentDeclarator' ? leaf.name : null,
      nameLoc: leaf && leaf.type === 'IdentDeclarator' ? leaf.loc : null, specs, declarator, default: def, attributes,
      pack: !!(leaf && leaf.pack) || hasPack(declarator),
    };
    return this.fin(node, s);
  }

  parseInitDeclarator(specs, ctx, preDecl) {
    const s = this.t;
    const declCtx = ctx === 'class' ? 'member' : ctx;
    const declarator = preDecl || this.parseDeclarator({ abstract: false, ctx: declCtx });
    const leaf = declLeaf(declarator);
    const isTypedef = specs.storage.includes('typedef');
    const fd = directFunction(declarator);
    const name = leaf && leaf.type === 'IdentDeclarator' ? leaf.name : null;
    let node;
    if (leaf && leaf.type === 'BindingDeclarator') {
      node = { type: 'BindingDecl', names: leaf.names, specs, declarator, init: null, initStyle: null };
    } else if (isTypedef) {
      node = { type: 'TypedefDecl', name, specs, declarator };
    } else if (fd) {
      node = {
        type: 'FunctionDecl', name, specs, declarator, params: fd.params, variadic: fd.variadic, body: null,
        isDefinition: false, isDefault: false, isDeleted: false, isPure: false, isOverride: false, isFinal: false,
        ctorInits: null, krDecls: null,
      };
    } else if (ctx === 'class') {
      node = { type: 'FieldDecl', name, specs, declarator, bitWidth: null, init: null, initStyle: null };
    } else {
      node = { type: 'VarDecl', name, specs, declarator, init: null, initStyle: null };
    }
    if (leaf && leaf.type === 'IdentDeclarator') {
      node.qualifier = leaf.qualifier || '';
      node.qname = leaf.qname;
      node.nameLoc = leaf.loc;
      if (leaf.isOperator) node.isOperator = true;
      if (leaf.isDestructor) node.isDestructor = true;
      if (leaf.isConversion) node.isConversion = true;
      if (leaf.templateArgs) node.templateArgs = leaf.templateArgs;
    }
    if (node.type === 'FunctionDecl' && this.cpp && specs.typeSpec === null && !leaf.isOperator && !leaf.isDestructor) {
      const cls = this.classStack[this.classStack.length - 1];
      const q = (leaf.qualifier || '').split('::');
      if ((cls && name === cls) || (q.length && q[q.length - 1] === name)) node.isConstructor = true;
    }
    if (!specs.typeSpec && !specs.empty && !this.cpp && node.type !== 'BindingDecl') node.implicitInt = true;
    if (specs.empty && !this.cpp) node.implicitInt = true;
    node.attributes = (leaf && leaf.attributes ? leaf.attributes : []).concat(declarator.attributes || []);
    if (name && !node.isConstructor && !node.isDestructor && !node.isOperator && !node.isConversion && !(node.qualifier && this.cpp)) {
      if (!(node.type === 'FunctionDecl' && this.cpp && (this.kindOf(name) === 'type' || this.kindOf(name) === 'template'))) this.declare(name, isTypedef ? 'type' : 'var');
    }
    if (node.type === 'BindingDecl') for (const b of node.names) this.declare(b.name, 'var');

    if (node.type === 'FunctionDecl') {
      for (;;) {
        if (this.isCtx('override')) { this.p++; node.isOverride = true; continue; }
        if (this.isCtx('final')) { this.p++; node.isFinal = true; continue; }
        if (this.isK('__attribute__') || (this.isP('[') && this.isP('[', this.peek()))) { for (const a of this.parseAttributes()) node.attributes.push(a); continue; }
        if (this.cpp && this.isK('requires')) { this.p++; node.requires = this.parseConstraint(); continue; }
        break;
      }
      if (!this.cpp && fd.krIdentifiers && !this.isP(';') && !this.isP(',') && !this.isP('{')) {
        // K&R parameter declarations
        node.krDecls = [];
        this.pushScope();
        try {
          while (!this.isP('{') && !this.eof()) node.krDecls.push(this.parseDeclaration('block'));
        } finally { this.popScope(); }
        node.oldStyle = true;
      } else if (!this.cpp && fd.krIdentifiers) node.oldStyle = true;
      if (this.isP('=')) {
        const n = this.peek();
        if (this.isK('default', n)) { this.p += 2; node.isDefault = true; }
        else if (this.isK('delete', n)) {
          this.p += 2;
          node.isDeleted = true;
          if (this.isP('(')) this.balancedText();
        } else if (n.kind === 'number' && n.value === '0') { this.p += 2; node.isPure = true; }
      }
      if (this.isP('{') || (this.cpp && (this.isK('try') || (this.isP(':') && ctx !== 'param')))) {
        this.parseFunctionBody(node, fd);
      }
      return this.fin(node, s);
    }
    if (node.type === 'FieldDecl' && this.isP(':')) {
      this.p++;
      node.bitWidth = this.parseConditional();
    }
    if (this.isP('=')) {
      this.p++;
      node.init = this.parseInitializer();
      node.initStyle = 'assign';
    } else if (this.cpp && this.isP('{')) {
      node.init = this.parseInitList();
      node.initStyle = 'brace';
    } else if (this.cpp && this.isP('(') && node.type !== 'TypedefDecl') {
      const ps = this.t;
      const args = this.parseCallArgs();
      node.init = this.fin({ type: 'ParenListInit', args }, ps);
      node.initStyle = 'paren';
    }
    for (;;) {
      if (this.isK('__attribute__') || this.isK('__attribute')) { for (const a of this.parseAttributes()) node.attributes.push(a); continue; }
      if (this.isK('asm') || this.isK('__asm__') || this.isK('__asm')) { node.asmLabel = this.skipAsm(); continue; }
      break;
    }
    return this.fin(node, s);
  }

  parseFunctionBody(node, fd) {
    this.pushScope();
    const savedClass = this.inFunction;
    this.inFunction = true;
    try {
      for (const p of fd.params) if (p.name) this.declare(p.name, 'var');
      const isTry = this.isK('try');
      const ts = this.t;
      if (isTry) this.p++;
      if (this.isP(':')) {
        this.p++;
        node.ctorInits = [];
        do {
          const s = this.t;
          const n = this.parseQualifiedName({ forceTemplate: true });
          let args, brace = false;
          if (this.isP('{')) { args = [this.parseInitList()]; brace = true; } else args = this.parseCallArgs();
          const pack = !!this.accept('...');
          node.ctorInits.push(this.fin({ type: 'CtorInit', name: n.qname, args, brace, pack }, s));
        } while (this.accept(','));
      }
      const body = this.parseCompound(false);
      if (isTry) {
        const handlers = this.parseHandlers();
        node.body = this.fin({ type: 'TryStmt', body, handlers, functionTry: true }, ts);
      } else node.body = body;
      node.isDefinition = true;
    } finally {
      this.inFunction = savedClass;
      this.popScope();
    }
  }

  parseRecord() {
    const s = this.next();
    const tag = s.value;
    const attributes = this.parseAttributes();
    for (;;) {
      if (this.isK('alignas') || this.isK('_Alignas')) {
        // kept as an attribute: { name: 'alignas', args: '32' }
        const kw = this.next().value;
        attributes.push({ name: 'alignas', namespace: null, args: this.isP('(') ? this.balancedText() : null, syntax: kw });
        continue;
      }
      // export macros from a header that was not found: `class C10_API Foo {`
      if (this.cpp && this.isId() && !this.kindOf(this.t.value) && /^_*[A-Z][A-Z0-9_]*$/.test(this.t.value) && /_|API$|EXPORT$|IMPORT$|DLL$/.test(this.t.value.replace(/^_+/, ''))
        && this.isId(this.peek()) && !this.isCtx('final', this.peek())
        && (this.isP('{', this.peek(2)) || (this.isP(':', this.peek(2)) && !this.isP(':', this.peek(3))) || this.isCtx('final', this.peek(2)))) { this.p++; continue; }
      break;
    }
    let name = null, qname = null, qualifier = '', templateArgs = null, nameLoc = null;
    if (this.isId() || (this.cpp && this.isP('::'))) {
      if (!(this.cpp && (this.isCtx('final') && (this.isP('{', this.peek()) || this.isP(':', this.peek()))))) {
        const ns = this.t;
        const n = this.parseQualifiedName({ forceTemplate: true });
        name = n.name;
        qname = n.qname;
        qualifier = n.qualifier;
        templateArgs = n.templateArgs;
        nameLoc = mkLoc(ns, this.toks[this.p - 1]);
      }
    }
    for (const a of this.parseAttributes()) attributes.push(a);
    let isFinal = false;
    if (this.cpp && this.isCtx('final')) { this.p++; isFinal = true; }
    if (this.cpp && name) this.declare(name, this.kindOf(name) === 'template' ? 'template' : 'type');
    if (!this.cpp && name) this.allTypeNames.add('struct ' + name);
    let bases = [];
    let members = null;
    if (this.cpp && this.isP(':') && !this.isP(':', this.peek())) {
      this.p++;
      bases = this.parseBaseList();
    }
    if (this.isP('{')) {
      const o = this.next();
      members = this.parseMembers(tag, name);
      this.expectClose('}', o);
    }
    for (const a of this.parseAttributes()) attributes.push(a);
    return this.fin({ type: 'RecordDecl', tag, name, qname, qualifier, nameLoc, templateArgs, bases, members, isDefinition: members !== null, isFinal, attributes, anonymous: !name }, s);
  }

  parseBaseList() {
    const bases = [];
    do {
      const s = this.t;
      this.parseAttributes();
      let access = null, isVirtual = false;
      for (;;) {
        if (this.isK('public') || this.isK('private') || this.isK('protected')) { access = this.next().value; continue; }
        if (this.isK('virtual')) { this.p++; isVirtual = true; continue; }
        break;
      }
      const n = this.parseQualifiedName({ forceTemplate: true });
      const pack = !!this.accept('...');
      bases.push(this.fin({ type: 'BaseSpecifier', access, virtual: isVirtual, name: n.name, qname: n.qname, templateArgs: n.templateArgs, pack }, s));
    } while (this.accept(','));
    return bases;
  }

  parseMembers(tag, name) {
    const members = [];
    this.classStack.push(name || '');
    this.pushScope();
    const savedFn = this.inFunction;
    this.inFunction = false;
    let access = this.cpp ? (tag === 'class' ? 'private' : 'public') : null;
    try {
      while (!this.isP('}') && !this.eof()) {
        const before = this.p;
        try {
          const d = this.parseExternal('class');
          if (d) {
            if (d.type === 'AccessSpec') access = d.access;
            else if (access) d.access = access;
            members.push(d);
          }
        } catch (e) {
          if (!(e instanceof ParseError)) throw e;
          this.error(e.message, e.tok);
          members.push(this.recover(before, true, 'ErrorDecl'));
        }
        if (this.p === before) this.next();
      }
    } finally {
      this.inFunction = savedFn;
      this.popScope();
      this.classStack.pop();
    }
    return members;
  }

  parseEnum() {
    const s = this.next();
    let scoped = false, key = null;
    if (this.isK('class') || this.isK('struct')) { key = this.next().value; scoped = true; }
    const attributes = this.parseAttributes();
    let name = null, qname = null, nameLoc = null;
    if (this.isId() || (this.cpp && this.isP('::'))) {
      const ns = this.t;
      const n = this.parseQualifiedName({ noTemplate: true });
      name = n.name;
      qname = n.qname;
      nameLoc = mkLoc(ns, this.toks[this.p - 1]);
    }
    for (const a of this.parseAttributes()) attributes.push(a);
    let underlying = null;
    if (this.isP(':') && (this.cpp || this.c23 || true) && !(this.classStack.length && !this.isEnumBaseAhead())) {
      this.p++;
      const us = this.t;
      this.forceTypeName = true;
      let specs;
      try { specs = this.parseDeclSpecs('typeName'); } finally { this.forceTypeName = false; }
      underlying = this.fin({ type: 'TypeName', specs, declarator: { type: 'AbstractDeclarator', loc: this.emptyLoc() } }, us);
    }
    if (this.cpp && name) this.declare(name, 'type');
    let enumerators = null;
    if (this.isP('{')) {
      const o = this.next();
      enumerators = [];
      while (!this.isP('}') && !this.eof()) {
        const es = this.t;
        if (!this.isId()) throw new ParseError(`expected enumerator name before ${describe(es)}`, es);
        this.p++;
        const ea = this.parseAttributes();
        let value = null;
        if (this.accept('=')) value = this.parseConditional();
        enumerators.push(this.fin({ type: 'EnumConstant', name: es.value, value, attributes: ea }, es));
        if (!scoped) this.declare(es.value, 'var');
        if (!this.accept(',')) break;
        if (this.isP('}')) enumerators.trailingComma = true;
      }
      this.expectClose('}', o);
    }
    return this.fin({ type: 'EnumDecl', name, qname, nameLoc, scoped, key, underlying, enumerators, isDefinition: enumerators !== null, attributes }, s);
  }

  isEnumBaseAhead() {
    // inside a class `enum E : int {` vs bit-field `enum E x : 3;` – a base is followed by a type word
    const n = this.peek();
    return n.kind === 'keyword' && TYPE_KW.has(n.value) || (n.kind === 'identifier' && this.nameIsType(this.scanName(this.p + 1)));
  }

  parseTypeName(force) {
    const s = this.t;
    this.forceTypeName = !!force;
    let specs;
    try { specs = this.parseDeclSpecs('typeName'); } finally { this.forceTypeName = false; }
    if (specs.empty) throw new ParseError(`expected type name before ${describe(this.t)}`, this.t);
    const declarator = this.parseDeclarator({ abstract: true, ctx: 'typeName' });
    return this.fin({ type: 'TypeName', specs, declarator }, s);
  }

  // Does a type-id start here? (used for casts, sizeof, template arguments)
  isTypeIdStart(templateArg) {
    return this.isTypeIdStartAt(this.p, templateArg);
  }

  isTypeIdStartAt(i, templateArg) {
    const t = this.at(i);
    if (t.kind === 'keyword') {
      const v = t.value;
      if (TYPE_KW.has(v) || QUAL_KW.has(v)) return true;
      if (v === 'struct' || v === 'union' || v === 'enum' || v === 'class' || v === 'typename' || v === 'typeof' || v === '__typeof__' || v === '__typeof' || v === 'typeof_unqual' || v === '__auto_type') return true;
      if (v === 'decltype' || (v === 'auto' && this.cpp)) return true;
      if (v === '__attribute__' || v === '__extension__') return true;
      return false;
    }
    if (t.kind === 'identifier' || (this.cpp && this.isP('::', t))) {
      const info = this.scanName(i);
      if (!info) return false;
      if (this.nameIsType(info)) {
        const a = this.at(info.end);
        if (templateArg) return true;
        if (this.cpp && (this.isP('(', a) && !this.isP('*', this.at(info.end + 1)) && !this.isP('&', this.at(info.end + 1)) && !this.isP(')', this.at(info.end + 1)))) return false;
        if (this.cpp && (this.isP('{', a) || this.isP('.', a) || this.isP('->', a) || this.isP('::', a))) return false;
        return true;
      }
    }
    return false;
  }

  // '(' at p: is this a cast / compound literal?
  castAhead() {
    const i = this.p + 1;
    if (this.isTypeIdStartAt(i, false)) {
      const t = this.at(i);
      if (t.kind === 'identifier' || this.isP('::', t)) {
        const info = this.scanName(i);
        const a = this.at(info.end);
        if (this.isP(')', a) || this.isP('*', a) || this.isP('&', a) || this.isP('&&', a) || this.isP('[', a) || (a.kind === 'keyword' && QUAL_KW.has(a.value))) return true;
        if (this.isP('(', a) && (this.isP('*', this.at(info.end + 1)) || this.isP('^', this.at(info.end + 1)) || this.isP(')', this.at(info.end + 1)) || this.isTypeIdStartAt(info.end + 1))) return true;
        if (this.isP('<', a)) return true;
        return false;
      }
      return true;
    }
    const t = this.at(i);
    if (t.kind === 'identifier' && !this.kindOf(t.value)) {
      // unknown identifier: (foo_t)x  or (foo_t *)p
      let k = i + 1;
      if (this.isP(')', this.at(k))) {
        const a = this.at(k + 1);
        return a.kind === 'identifier' || a.kind === 'number' || a.kind === 'char' || a.kind === 'string' || (a.kind === 'keyword' && (a.value === 'sizeof' || a.value === '_Alignof'));
      }
      let stars = 0;
      while (this.isP('*', this.at(k)) || (this.at(k).kind === 'keyword' && QUAL_KW.has(this.at(k).value))) { k++; stars++; }
      if (stars && this.isP(')', this.at(k))) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- statements

  parseCompound(newScope = true) {
    const open = this.expect('{');
    if (newScope) this.pushScope();
    const body = [];
    try {
      while (!this.isP('}') && !this.eof()) {
        const before = this.p;
        try {
          body.push(this.parseStatement());
        } catch (e) {
          if (!(e instanceof ParseError)) throw e;
          this.error(e.message, e.tok);
          body.push(this.recover(before, true, 'ErrorStmt'));
        }
        if (this.p === before) this.next();
      }
    } finally {
      if (newScope) this.popScope();
    }
    this.expectClose('}', open);
    return this.fin({ type: 'CompoundStmt', body }, open);
  }

  parseStatement() {
    const t = this.t;
    if (t.kind === 'punct') {
      if (t.value === '{') return this.parseCompound(true);
      if (t.value === ';') { this.p++; return this.fin({ type: 'NullStmt' }, t); }
      if (t.value === '[' && this.isP('[', this.peek())) {
        const attributes = this.parseAttributes();
        if (this.isP(';')) { this.p++; return this.fin({ type: 'NullStmt', attributes }, t); }
        const st = this.parseStatement();
        st.attributes = (st.attributes || []).concat(attributes);
        return st;
      }
    }
    if (t.kind === 'keyword') {
      switch (t.value) {
        case 'if': return this.parseIf();
        case 'switch': return this.parseSwitch();
        case 'while': return this.parseWhile();
        case 'do': return this.parseDo();
        case 'for': return this.parseFor();
        case 'goto': {
          this.p++;
          if (this.isP('*')) {
            this.p++;
            const target = this.parseExpression();
            this.expect(';');
            return this.fin({ type: 'GotoStmt', label: null, target, computed: true }, t);
          }
          const lt = this.next();
          if (lt.kind !== 'identifier') throw new ParseError('expected label name after goto', lt);
          this.expect(';');
          return this.fin({ type: 'GotoStmt', label: lt.value, labelLoc: mkLoc(lt, lt), target: null }, t);
        }
        case 'continue': this.p++; this.expect(';'); return this.fin({ type: 'ContinueStmt' }, t);
        case 'break': this.p++; this.expect(';'); return this.fin({ type: 'BreakStmt' }, t);
        case 'return': case 'co_return': {
          this.p++;
          let arg = null;
          if (!this.isP(';')) arg = this.cpp && this.isP('{') ? this.parseInitList() : this.parseExpression();
          this.expect(';');
          return this.fin({ type: 'ReturnStmt', arg, coroutine: t.value === 'co_return' }, t);
        }
        case 'case': {
          this.p++;
          const value = this.parseConditional();
          let high = null;
          if (this.accept('...')) high = this.parseConditional();
          this.expect(':');
          const body = this.labelBody();
          return this.fin({ type: 'CaseStmt', value, high, body }, t);
        }
        case 'default':
          if (this.isP(':', this.peek())) {
            this.p += 2;
            const body = this.labelBody();
            return this.fin({ type: 'DefaultStmt', body }, t);
          }
          break;
        case 'try': if (this.cpp) return this.parseTry(); break;
        case 'asm': case '__asm__': case '__asm': {
          const text = this.skipAsm();
          this.expect(';');
          return this.fin({ type: 'AsmStmt', text }, t);
        }
        case '__label__': {
          while (!this.isP(';') && !this.eof()) this.p++;
          this.expect(';');
          return this.fin({ type: 'NullStmt', gnuLabelDecl: true }, t);
        }
        case 'else':
          throw new ParseError("'else' without a previous 'if'", t);
        case 'static_assert': case '_Static_assert':
          return this.parseStaticAssert();
        case 'using': case 'namespace': case 'template':
          if (this.cpp) return this.parseExternal('block');
          break;
        default: break;
      }
    }
    if (t.kind === 'identifier' && this.isP(':', this.peek()) && !this.isP(':', this.peek(2))) {
      this.p += 2;
      const attributes = this.parseAttributes();
      const body = this.labelBody();
      return this.fin({ type: 'LabelStmt', label: t.value, body, attributes }, t);
    }
    if (t.kind === 'identifier' && t.bol && !this.kindOf(t.value) && /^_*[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(t.value)) {
      // unknown object-like macro on a line of its own (G_GNUC_BEGIN_IGNORE_DEPRECATIONS)
      const n = this.peek();
      if (n.bol && (n.kind === 'identifier' || n.kind === 'keyword' || this.isP('}', n) || this.isP('{', n))) {
        this.p++;
        this.diagnostics.push({ severity: 'info', code: 'unknown-macro-invocation', message: `'${t.value}' looks like a macro whose definition is not available`, file: t.file, line: t.line, col: t.col });
        return this.fin({ type: 'NullStmt', macro: t.value }, t);
      }
    }
    if (this.isDeclarationStatement()) return this.parseDeclaration('block');
    const expr = this.parseExpression();
    if (!this.accept(';')) {
      const at = this.t;
      if (at.bol || this.isP('}') || at.kind === 'eof') this.error(`expected ';' after expression`, this.toks[this.p - 1]);
      else throw new ParseError(`expected ';' before ${describe(at)}`, at);
    }
    return this.fin({ type: 'ExprStmt', expr }, t);
  }

  labelBody() {
    if (this.isP('}')) return null; // C23: label at end of compound statement
    return this.parseStatement();
  }

  isDeclarationStatement() {
    const t = this.t;
    if (t.kind === 'keyword') {
      const v = t.value;
      if (TYPE_KW.has(v) || QUAL_KW.has(v) || STORAGE_KW.has(v) || FUNC_KW.has(v)) return true;
      if (v === 'struct' || v === 'union' || v === 'enum' || v === 'class') return true;
      if (v === 'typeof' || v === '__typeof__' || v === '__typeof' || v === 'typeof_unqual' || v === '__auto_type' || v === 'alignas' || v === '_Alignas') return true;
      if (v === '__attribute__' || v === '__attribute' || v === '__declspec') return true;
      if (v === '__extension__') {
        const n = this.peek();
        return n.kind === 'keyword' && (TYPE_KW.has(n.value) || QUAL_KW.has(n.value) || STORAGE_KW.has(n.value));
      }
      if (DECL_ONLY_KW.has(v)) return true;
      if (v === 'typename') return true;
      if (v === 'decltype') {
        const c = this.skipBalanced(this.p + 1);
        const a = this.at(c + 1);
        return a.kind === 'identifier' || this.isP('*', a) || this.isP('&', a) || this.isP('&&', a) || this.isP('::', a);
      }
      return false;
    }
    if (t.kind === 'identifier' || (this.cpp && this.isP('::', t))) {
      const info = this.scanName(this.p);
      if (!info) return false;
      if (this.nameIsType(info)) {
        const a = this.at(info.end);
        if (this.cpp && this.isP('(', a)) {
          // T (*p)(...)  /  T (&r) = ...  are declarations; T(x) is an expression
          const b = this.at(info.end + 1);
          return (this.isP('*', b) || this.isP('&', b) || this.isP('&&', b)) && this.isId(this.at(info.end + 2)) && this.isP(')', this.at(info.end + 3));
        }
        if (a.kind === 'punct' && (a.value === '.' || a.value === '->' || a.value === '=' || a.value === '[' || a.value === '++' || a.value === '--' || a.value === ')' || a.value === ',' || a.value === '{' || a.value === '<<' || a.value === '>>' || a.value === '+' || a.value === '-' || a.value === '/' || a.value === '%' || a.value === '?')) return false;
        return true;
      }
      const k = this.kindOf(info.last);
      if (k === 'var' || k === 'namespace') return false;
      return this.declLikelyAfterType(info.end, false);
    }
    return false;
  }

  parseCondition() {
    // C++: `if (int x = f())` / `while (T* p = next())`
    if (this.cpp && this.isDeclarationStatement()) {
      const r = this.speculate(() => {
        const s = this.t;
        const specs = this.parseDeclSpecs('block');
        if (specs.empty) throw new ParseError('not a declaration', this.t);
        const declarator = this.parseDeclarator({ abstract: false, ctx: 'block' });
        if (!(this.isP('=') || this.isP('{') || this.isP(';') || this.isP(':') || this.isP(')'))) throw new ParseError('not a declaration', this.t);
        if (this.isP(';') || this.isP(':') || this.isP(')')) {
          if (this.isP(')') && !(declarator.type === 'IdentDeclarator')) throw new ParseError('not a declaration', this.t);
        }
        return { s, specs, declarator };
      });
      if (r) {
        if (this.isP(':')) return { rangeDecl: r };
        const d = this.parseInitDeclarator(r.specs, 'block', r.declarator);
        return { decl: this.fin({ type: 'Declaration', specs: r.specs, declarators: [d], condition: true }, r.s) };
      }
    }
    if (this.isDeclarationStatement() && !this.cpp) {
      // C: declarations are only valid in for-init, the caller decides
      return { expr: this.parseExpression() };
    }
    return { expr: this.parseExpression() };
  }

  parseIf() {
    const s = this.next();
    let isConstexpr = false, isConsteval = false, negated = false;
    if (this.isK('constexpr')) { this.p++; isConstexpr = true; }
    if (this.isP('!') && this.isK('consteval', this.peek())) { this.p += 2; isConsteval = true; negated = true; }
    else if (this.isK('consteval')) { this.p++; isConsteval = true; }
    this.pushScope();
    try {
      let init = null, cond = null;
      if (!isConsteval) {
        const open = this.expect('(');
        const r = this.parseInitAndCondition();
        init = r.init;
        cond = r.cond;
        this.expectClose(')', open);
      }
      const then = this.parseSubStatement();
      let els = null;
      if (this.isK('else')) { this.p++; els = this.parseSubStatement(); }
      return this.fin({ type: 'IfStmt', init, cond, then, else: els, constexpr: isConstexpr, consteval: isConsteval, negated }, s);
    } finally {
      this.popScope();
    }
  }

  parseSubStatement() {
    this.pushScope();
    try { return this.parseStatement(); } finally { this.popScope(); }
  }

  parseInitAndCondition() {
    const first = this.parseCondition();
    if (this.cpp && this.isP(';')) {
      const ws = this.t;
      this.p++;
      const init = first.decl || this.fin({ type: 'ExprStmt', expr: first.expr }, ws);
      if (first.expr) init.loc = { ...first.expr.loc };
      const second = this.parseCondition();
      return { init, cond: second.decl || second.expr };
    }
    if (first.rangeDecl) throw new ParseError("unexpected ':' in condition", this.t);
    return { init: null, cond: first.decl || first.expr };
  }

  parseSwitch() {
    const s = this.next();
    this.pushScope();
    try {
      const open = this.expect('(');
      const r = this.parseInitAndCondition();
      this.expectClose(')', open);
      const body = this.parseSubStatement();
      return this.fin({ type: 'SwitchStmt', init: r.init, cond: r.cond, body }, s);
    } finally {
      this.popScope();
    }
  }

  parseWhile() {
    const s = this.next();
    this.pushScope();
    try {
      const open = this.expect('(');
      const c = this.parseCondition();
      this.expectClose(')', open);
      const body = this.parseSubStatement();
      return this.fin({ type: 'WhileStmt', cond: c.decl || c.expr, body }, s);
    } finally {
      this.popScope();
    }
  }

  parseDo() {
    const s = this.next();
    const body = this.parseSubStatement();
    if (!this.isK('while')) throw new ParseError(`expected 'while' in do/while loop before ${describe(this.t)}`, this.t);
    this.p++;
    const open = this.expect('(');
    const cond = this.parseExpression();
    this.expectClose(')', open);
    this.expect(';');
    return this.fin({ type: 'DoStmt', body, cond }, s);
  }

  parseFor() {
    const s = this.next();
    if (this.isCtx('co_await') || this.isK('co_await')) this.p++;
    this.pushScope();
    try {
      const open = this.expect('(');
      let init = null;
      // init-statement or range-for declaration
      const parseInitPart = () => {
        if (this.isP(';')) { this.p++; return { init: null }; }
        if (this.isDeclarationStatement()) {
          const ds = this.t;
          const specs = this.parseDeclSpecs('block');
          if (this.cpp && !this.isP(';')) {
            const declarator = this.parseDeclarator({ abstract: false, ctx: 'block' });
            if (this.isP(':')) {
              const d = this.parseInitDeclaratorNoInit(specs, declarator);
              return { range: this.fin({ type: 'Declaration', specs, declarators: [d] }, ds) };
            }
            const declarators = [this.parseInitDeclarator(specs, 'block', declarator)];
            while (this.accept(',')) declarators.push(this.parseInitDeclarator(specs, 'block', null));
            this.expect(';');
            return { init: this.fin({ type: 'Declaration', specs, declarators }, ds) };
          }
          return { init: this.parseDeclaration('block', specs, ds) };
        }
        const es = this.t;
        const e = this.parseExpression();
        if (this.cpp && this.isP(':')) throw new ParseError('expected declaration in range-based for', this.t);
        this.expect(';');
        return { init: this.fin({ type: 'ExprStmt', expr: e }, es) };
      };
      let part = parseInitPart();
      let rangeInit = null;
      if (this.cpp && !part.range && part.init && this.isDeclarationStatement()) {
        // C++20: for (init; decl : range)
        const save = this.p;
        const r = this.speculate(() => {
          const ds = this.t;
          const specs = this.parseDeclSpecs('block');
          const declarator = this.parseDeclarator({ abstract: false, ctx: 'block' });
          if (!this.isP(':')) throw new ParseError('no range', this.t);
          const d = this.parseInitDeclaratorNoInit(specs, declarator);
          return this.fin({ type: 'Declaration', specs, declarators: [d] }, ds);
        });
        if (r) { rangeInit = part.init; part = { range: r }; } else this.p = save;
      }
      if (part.range) {
        this.expect(':');
        const range = this.isP('{') ? this.parseInitList() : this.parseExpression();
        this.expectClose(')', open);
        const body = this.parseSubStatement();
        return this.fin({ type: 'RangeForStmt', init: rangeInit, decl: part.range, range, body }, s);
      }
      init = part.init;
      let cond = null, inc = null;
      if (!this.isP(';')) {
        const c = this.parseCondition();
        cond = c.decl || c.expr;
      }
      this.expect(';');
      if (!this.isP(')')) inc = this.parseExpression();
      this.expectClose(')', open);
      const body = this.parseSubStatement();
      return this.fin({ type: 'ForStmt', init, cond, inc, body }, s);
    } finally {
      this.popScope();
    }
  }

  parseInitDeclaratorNoInit(specs, declarator) {
    const leaf = declLeaf(declarator);
    let node;
    if (leaf && leaf.type === 'BindingDeclarator') {
      node = { type: 'BindingDecl', names: leaf.names, specs, declarator, init: null, initStyle: null };
      for (const b of leaf.names) this.declare(b.name, 'var');
    } else {
      node = { type: 'VarDecl', name: leaf && leaf.name, specs, declarator, init: null, initStyle: null, qualifier: '', qname: leaf && leaf.qname, nameLoc: leaf && leaf.loc, attributes: [] };
      if (node.name) this.declare(node.name, 'var');
    }
    node.loc = { ...declarator.loc };
    return node;
  }

  parseTry() {
    const s = this.next();
    const body = this.parseCompound(true);
    const handlers = this.parseHandlers();
    return this.fin({ type: 'TryStmt', body, handlers }, s);
  }

  parseHandlers() {
    const handlers = [];
    while (this.isK('catch')) {
      const cs = this.next();
      const open = this.expect('(');
      let param = null;
      this.pushScope();
      try {
        if (this.isP('...')) this.p++;
        else {
          param = this.parseParamDecl(false);
          if (param.name) this.declare(param.name, 'var');
        }
        this.expectClose(')', open);
        const body = this.parseCompound(false);
        handlers.push(this.fin({ type: 'CatchClause', param, catchAll: param === null, body }, cs));
      } finally {
        this.popScope();
      }
    }
    if (!handlers.length) this.error("expected 'catch' after try block", this.t);
    return handlers;
  }

  // ---------------------------------------------------------------- expressions

  parseExpression() {
    let left = this.parseAssignment();
    while (this.isP(',') && !(this.noGreater && this.parenDepth === 0)) {
      this.p++;
      const right = this.parseAssignment();
      left = this.finFrom({ type: 'BinaryExpr', op: ',', left, right }, left.loc);
    }
    return left;
  }

  parseAssignment() {
    const t = this.t;
    if (this.cpp && this.isK('throw')) {
      this.p++;
      let arg = null;
      if (!this.isP(';') && !this.isP(')') && !this.isP(',') && !this.isP(':') && !this.isP('}') && !this.isP(']')) arg = this.parseAssignment();
      return this.fin({ type: 'ThrowExpr', arg }, t);
    }
    if (this.cpp && this.isK('co_yield')) {
      this.p++;
      const arg = this.isP('{') ? this.parseInitList() : this.parseAssignment();
      return this.fin({ type: 'UnaryExpr', op: 'co_yield', prefix: true, arg }, t);
    }
    const left = this.parseConditional();
    const o = this.t;
    if (o.kind === 'punct' && ASSIGN_OPS.has(o.value)) {
      if (this.noGreater && o.value === '>>=') return left;
      this.p++;
      const right = this.cpp && this.isP('{') ? this.parseInitList() : this.parseAssignment();
      return this.finFrom({ type: 'AssignExpr', op: o.value, left, right }, left.loc);
    }
    return left;
  }

  parseConditional() {
    const test = this.parseBinary(1);
    if (!this.isP('?')) return test;
    this.p++;
    let consequent = null;
    if (!this.isP(':')) {
      const ng = this.noGreater;
      this.noGreater = 0;
      try { consequent = this.parseExpression(); } finally { this.noGreater = ng; }
    }
    this.expect(':');
    const alternate = this.cpp ? this.parseAssignment() : this.parseConditional();
    return this.finFrom({ type: 'ConditionalExpr', test, consequent, alternate, gnuElvis: consequent === null }, test.loc);
  }

  parseBinary(min) {
    let left = this.parseCast();
    for (;;) {
      const o = this.t;
      if (o.kind !== 'punct') return left;
      const prec = BIN_PREC[o.value];
      if (prec === undefined || prec < min) return left;
      if (this.noGreater && (o.value === '>' || o.value === '>>')) return left;
      if (this.cpp && this.isP('...', this.peek()) && this.parenDepth > 0) {
        // fold expression: (pack op ...) or (pack op ... op init)
        return left;
      }
      this.p++;
      const right = this.parseBinary(prec + 1);
      left = this.finFrom({ type: 'BinaryExpr', op: o.value, left, right }, left.loc);
    }
  }

  parseCast() {
    if (this.isP('(') && this.castAhead()) {
      const s = this.t;
      const r = this.speculate(() => {
        this.p++;
        const tn = this.parseTypeName(true);
        this.expect(')');
        return tn;
      });
      if (r) {
        if (this.isP('{')) {
          const init = this.parseInitList();
          return this.parsePostfix(this.fin({ type: 'CompoundLiteral', typeName: r, init }, s));
        }
        const arg = this.parseCast();
        return this.fin({ type: 'CastExpr', kind: 'c-style', typeName: r, arg }, s);
      }
    }
    return this.parseUnary();
  }

  parseUnary() {
    const t = this.t;
    if (t.kind === 'punct') {
      switch (t.value) {
        case '++': case '--': {
          this.p++;
          const arg = this.parseUnary();
          return this.fin({ type: 'UnaryExpr', op: t.value, prefix: true, arg }, t);
        }
        case '&': case '*': case '+': case '-': case '~': case '!': {
          this.p++;
          const arg = this.parseCast();
          return this.fin({ type: 'UnaryExpr', op: t.value, prefix: true, arg }, t);
        }
        case '&&':
          if (this.isId(this.peek())) {
            this.p++;
            const l = this.next();
            return this.fin({ type: 'AddrLabelExpr', label: l.value }, t);
          }
          break;
        case '::':
          if (this.cpp && this.isK('new', this.peek())) return this.parseNew();
          if (this.cpp && this.isK('delete', this.peek())) return this.parseDelete();
          break;
        default: break;
      }
    } else if (t.kind === 'keyword') {
      switch (t.value) {
        case 'sizeof': {
          this.p++;
          if (this.cpp && this.isP('...')) {
            this.p++;
            this.expect('(');
            const nt = this.next();
            this.expect(')');
            return this.fin({ type: 'SizeofPackExpr', name: nt.value }, t);
          }
          if (this.isP('(') && this.sizeofTypeAhead()) {
            const r = this.speculate(() => {
              this.p++;
              const tn = this.parseTypeName();
              this.expect(')');
              if (this.isP('{')) throw new ParseError('compound literal', this.t);
              return tn;
            });
            if (r) return this.fin({ type: 'SizeofExpr', typeName: r, arg: null }, t);
          }
          const arg = this.parseUnary();
          return this.fin({ type: 'SizeofExpr', typeName: null, arg }, t);
        }
        case 'alignof': case '_Alignof': case '__alignof__': case '__alignof': {
          this.p++;
          if (this.isP('(') && this.sizeofTypeAhead()) {
            this.p++;
            const tn = this.parseTypeName();
            this.expect(')');
            return this.fin({ type: 'AlignofExpr', typeName: tn, arg: null, keyword: t.value }, t);
          }
          const arg = this.parseUnary();
          return this.fin({ type: 'AlignofExpr', typeName: null, arg, keyword: t.value }, t);
        }
        case 'new': if (this.cpp) return this.parseNew(); break;
        case 'delete': if (this.cpp) return this.parseDelete(); break;
        case 'co_await': {
          this.p++;
          const arg = this.parseCast();
          return this.fin({ type: 'UnaryExpr', op: 'co_await', prefix: true, arg }, t);
        }
        case 'noexcept':
          if (this.cpp) {
            this.p++;
            this.expect('(');
            const arg = this.parseExpression();
            this.expect(')');
            return this.fin({ type: 'NoexceptExpr', arg }, t);
          }
          break;
        case '__extension__': this.p++; return this.parseCast();
        case '__real__': case '__imag__': {
          this.p++;
          const arg = this.parseCast();
          return this.fin({ type: 'UnaryExpr', op: t.value, prefix: true, arg }, t);
        }
        default: break;
      }
    }
    return this.parsePostfix(this.parsePrimary());
  }

  sizeofTypeAhead() {
    if (this.isTypeIdStartAt(this.p + 1, false)) {
      const t = this.at(this.p + 1);
      if (t.kind === 'identifier' || this.isP('::', t)) {
        const info = this.scanName(this.p + 1);
        const a = this.at(info.end);
        return this.isP(')', a) || this.isP('*', a) || this.isP('&', a) || this.isP('[', a) || this.isP('(', a) || this.isP('<', a) || (a.kind === 'keyword' && QUAL_KW.has(a.value));
      }
      return true;
    }
    const t = this.at(this.p + 1);
    if (t.kind === 'identifier' && !this.kindOf(t.value)) {
      let k = this.p + 2;
      let stars = 0;
      while (this.isP('*', this.at(k))) { k++; stars++; }
      if (stars && this.isP(')', this.at(k))) return true;
    }
    return false;
  }

  parseNew() {
    const s = this.t;
    const global = !!this.accept('::');
    this.expect('new');
    let placement = null, typeName = null, parenType = false;
    if (this.isP('(')) {
      const save = this.p;
      const r = this.speculate(() => {
        this.p++;
        const tn = this.parseTypeName();
        this.expect(')');
        return tn;
      });
      if (r && !this.isTypeIdStart()) { typeName = r; parenType = true; } else {
        this.p = save;
        placement = this.parseCallArgs();
      }
    }
    if (!typeName) {
      if (this.isP('(')) {
        this.p++;
        typeName = this.parseTypeName(true);
        this.expect(')');
        parenType = true;
      } else {
        const ts = this.t;
        this.forceTypeName = true;
        let specs;
        try { specs = this.parseDeclSpecs('typeName'); } finally { this.forceTypeName = false; }
        const declarator = this.parseNewDeclarator();
        typeName = this.fin({ type: 'TypeName', specs, declarator }, ts);
      }
    }
    let init = null, initStyle = null;
    if (this.isP('(')) {
      const ps = this.t;
      init = this.fin({ type: 'ParenListInit', args: this.parseCallArgs() }, ps);
      initStyle = 'paren';
    } else if (this.isP('{')) {
      init = this.parseInitList();
      initStyle = 'brace';
    }
    const isArray = hasArray(typeName.declarator);
    return this.fin({ type: 'NewExpr', global, placement, typeName, init, initStyle, isArray, parenType }, s);
  }

  parseNewDeclarator() {
    const s = this.t;
    if (this.isP('*')) {
      this.p++;
      const quals = this.parseQualList();
      const inner = this.parseNewDeclarator();
      return this.fin({ type: 'PointerDeclarator', quals, attributes: [], inner }, s);
    }
    if (this.isP('&') || this.isP('&&')) {
      const rvalue = this.next().value === '&&';
      const inner = this.parseNewDeclarator();
      return this.fin({ type: 'ReferenceDeclarator', rvalue, inner }, s);
    }
    let node = { type: 'AbstractDeclarator', loc: this.emptyLoc() };
    while (this.isP('[') && !this.isP('[', this.peek())) {
      const bs = this.next();
      const size = this.isP(']') ? null : this.parseExpression();
      this.expect(']');
      node = this.fin({ type: 'ArrayDeclarator', inner: node, size, quals: [], isStatic: false, star: false }, bs);
    }
    return node;
  }

  parseDelete() {
    const s = this.t;
    const global = !!this.accept('::');
    this.expect('delete');
    let array = false;
    if (this.isP('[') && this.isP(']', this.peek())) { this.p += 2; array = true; }
    const arg = this.parseCast();
    return this.fin({ type: 'DeleteExpr', global, array, arg }, s);
  }

  parseCallArgs() {
    const open = this.expect('(');
    const args = [];
    const ng = this.noGreater;
    this.noGreater = 0;
    this.parenDepth++;
    try {
      while (!this.isP(')') && !this.eof()) {
        const s = this.t;
        let a = this.isP('{') && this.cpp ? this.parseInitList() : this.parseAssignment();
        if (this.cpp && this.isP('...')) { this.p++; a = this.fin({ type: 'PackExpansion', expr: a }, s); }
        args.push(a);
        if (!this.accept(',')) break;
      }
    } finally {
      this.noGreater = ng;
      this.parenDepth--;
    }
    this.expectClose(')', open);
    return args;
  }

  parsePostfix(expr) {
    for (;;) {
      const t = this.t;
      if (t.kind !== 'punct') return expr;
      switch (t.value) {
        case '[': {
          if (this.isP('[', this.peek())) return expr;
          this.p++;
          const ng = this.noGreater;
          this.noGreater = 0;
          let index;
          try { index = this.cpp && this.isP('{') ? this.parseInitList() : this.parseExpression(); } finally { this.noGreater = ng; }
          this.expect(']');
          expr = this.finFrom({ type: 'IndexExpr', object: expr, index }, expr.loc);
          continue;
        }
        case '(': {
          const args = this.parseCallArgs();
          expr = this.finFrom({ type: 'CallExpr', callee: expr, args }, expr.loc);
          continue;
        }
        case '.': case '->': {
          this.p++;
          if (this.isK('template')) this.p++;
          const mt = this.t;
          let member, isDestructor = false, templateArgs = null, qualifier = '';
          if (this.isP('~')) {
            this.p++;
            member = '~' + this.next().value;
            isDestructor = true;
          } else if (this.isK('operator')) {
            member = this.parseOperatorName().name;
          } else if (mt.kind === 'identifier') {
            this.p++;
            member = mt.value;
            // qualified member access: obj.Base::f
            while (this.cpp && this.isP('::') && this.isId(this.peek())) {
              qualifier = qualifier ? qualifier + '::' + member : member;
              this.p++;
              member = this.next().value;
            }
            if (this.cpp && this.isP('<') && !this.failedAngles.has(this.t)) {
              const lt = this.t;
              const r = this.speculate(() => {
                const a = this.parseTemplateArgs();
                if (!this.isP('(')) throw new ParseError('not a member template', this.t);
                return a;
              });
              if (r) templateArgs = r;
              else this.failedAngles.add(lt);
            }
          } else throw new ParseError(`expected member name before ${describe(mt)}`, mt);
          expr = this.finFrom({ type: 'MemberExpr', object: expr, member, arrow: t.value === '->', memberLoc: mkLoc(mt, this.toks[this.p - 1]), isDestructor, templateArgs, qualifier }, expr.loc);
          continue;
        }
        case '++': case '--':
          this.p++;
          expr = this.finFrom({ type: 'UnaryExpr', op: t.value, prefix: false, arg: expr }, expr.loc);
          continue;
        default:
          return expr;
      }
    }
  }

  parsePrimary() {
    const t = this.t;
    switch (t.kind) {
      case 'number': {
        this.p++;
        const c = classifyNumber(t.value, { lang: this.cpp ? 'cpp' : 'c' });
        if (c.error) this.error(c.error, t);
        if (c.kind === 'float') return this.fin({ type: 'FloatingLiteral', raw: t.value, value: c.value, suffix: c.suffix, base: c.base, udSuffix: c.udSuffix || null }, t);
        return this.fin({ type: 'IntegerLiteral', raw: t.value, value: c.kind === 'int' ? c.value : 0n, base: c.base, suffix: c.suffix, octal: c.octal, udSuffix: c.udSuffix || null, invalid: c.kind !== 'int' }, t);
      }
      case 'char': {
        this.p++;
        const parts = literalParts(t);
        const d = decodeEscapes(parts.body);
        for (const e of d.errors) this.warn('lex-escape', e, t);
        let value = 0;
        if (d.codes.length === 1) value = d.codes[0];
        else for (const cp of d.codes) value = ((value << 8) | (cp & 0xff)) >>> 0;
        if (!d.codes.length) this.error('empty character constant', t);
        return this.fin({ type: 'CharLiteral', raw: t.value, prefix: parts.prefix, value, codes: d.codes, multi: d.codes.length > 1, escapes: d.escapes, udSuffix: parts.udSuffix || null }, t);
      }
      case 'string': return this.parseStringLiteral();
      case 'identifier': {
        if (this.cpp) {
          const info = this.scanName(this.p);
          if (info && this.nameIsType(info) && !this.isCtorLikeCall(info)) {
            const a = this.at(info.end);
            if (this.isP('(', a) || this.isP('{', a)) return this.parseFunctionalCast();
          }
          // `WAVEHDR{}`: an undeclared name directly followed by a braced list is a type
          if (info && !this.kindOf(info.last) && this.isP('{', this.at(info.end))) {
            this.forceTypeName = true;
            return this.parseFunctionalCast();
          }
        }
        return this.parseIdExpression();
      }
      case 'keyword': return this.parseKeywordPrimary(t);
      case 'punct': {
        switch (t.value) {
          case '(': return this.parseParen();
          case '[': if (this.cpp) return this.parseLambda(); break;
          case '{': if (this.cpp) return this.parseInitList(); break;
          case '::': if (this.cpp) return this.parseIdExpression(); break;
          case '~':
            if (this.cpp && this.isId(this.peek())) return this.parseIdExpression();
            break;
          default: break;
        }
        break;
      }
      default: break;
    }
    throw new ParseError(`expected expression before ${describe(t)}`, t);
  }

  isCtorLikeCall() { return false; }

  parseStringLiteral() {
    const s = this.t;
    const parts = [];
    let prefix = '';
    const codes = [];
    const escapes = [];
    let udSuffix = null, raw = false;
    while (this.t.kind === 'string') {
      const t = this.next();
      parts.push(t.value);
      const lp = literalParts(t);
      if (lp.prefix && lp.prefix !== prefix) {
        if (prefix && prefix !== lp.prefix) this.error('concatenation of string literals with different encoding prefixes', t);
        prefix = lp.prefix;
      }
      if (lp.udSuffix) udSuffix = lp.udSuffix;
      if (lp.raw) {
        raw = true;
        for (const ch of lp.body) codes.push(ch.codePointAt(0));
      } else {
        const d = decodeEscapes(lp.body);
        for (const e of d.errors) this.warn('lex-escape', e, t);
        for (const e of d.escapes) escapes.push({ ...e, part: parts.length - 1 });
        for (const c of d.codes) codes.push(c);
      }
    }
    let value = '';
    for (const c of codes) value += c <= 0x10ffff ? String.fromCodePoint(c) : '�';
    return this.fin({ type: 'StringLiteral', raw: parts.join(' '), parts, prefix, value, codes, length: codes.length + 1, escapes, rawString: raw, udSuffix }, s);
  }

  parseIdExpression() {
    const s = this.t;
    const n = this.parseQualifiedName({ expr: true });
    return this.fin({ type: 'Identifier', name: n.name, qualifier: n.qualifier, qname: n.qname, global: n.global, templateArgs: n.templateArgs, isOperator: n.isOperator, isDestructor: n.isDestructor }, s);
  }

  parseFunctionalCast() {
    const s = this.t;
    let specs;
    try { specs = this.parseDeclSpecs('typeName'); } finally { this.forceTypeName = false; }
    const typeName = this.fin({ type: 'TypeName', specs, declarator: { type: 'AbstractDeclarator', loc: this.emptyLoc() } }, s);
    if (this.isP('{')) {
      const init = this.parseInitList();
      return this.fin({ type: 'CastExpr', kind: 'functional', typeName, arg: init, args: null, brace: true }, s);
    }
    const args = this.parseCallArgs();
    return this.fin({ type: 'CastExpr', kind: 'functional', typeName, arg: args.length === 1 ? args[0] : null, args: args.length === 1 ? null : args, brace: false }, s);
  }

  parseKeywordPrimary(t) {
    const v = t.value;
    switch (v) {
      case 'true': case 'false': this.p++; return this.fin({ type: 'BoolLiteral', value: v === 'true' }, t);
      case 'nullptr': this.p++; return this.fin({ type: 'NullptrLiteral' }, t);
      case 'this': this.p++; return this.fin({ type: 'ThisExpr' }, t);
      case 'static_cast': case 'dynamic_cast': case 'reinterpret_cast': case 'const_cast': {
        this.p++;
        this.expect('<');
        this.noGreater++;
        let typeName;
        try { typeName = this.parseTypeName(true); } finally { this.noGreater--; }
        this.expectGreater();
        this.expect('(');
        const ng = this.noGreater;
        this.noGreater = 0;
        let arg;
        try { arg = this.parseExpression(); } finally { this.noGreater = ng; }
        this.expect(')');
        return this.fin({ type: 'CastExpr', kind: v, typeName, arg }, t);
      }
      case 'typeid': {
        this.p++;
        this.expect('(');
        let typeName = null, arg = null;
        const r = this.isTypeIdStart() ? this.speculate(() => { const tn = this.parseTypeName(); if (!this.isP(')')) throw new ParseError('x', this.t); return tn; }) : null;
        if (r) typeName = r; else arg = this.parseExpression();
        this.expect(')');
        return this.fin({ type: 'TypeidExpr', typeName, arg }, t);
      }
      case '_Generic': {
        this.p++;
        this.expect('(');
        const control = this.parseAssignment();
        const assocs = [];
        while (this.accept(',')) {
          const as = this.t;
          let typeName = null;
          if (this.isK('default')) this.p++;
          else typeName = this.parseTypeName();
          this.expect(':');
          const expr = this.parseAssignment();
          assocs.push(this.fin({ type: 'GenericAssoc', typeName, isDefault: typeName === null, expr }, as));
        }
        this.expect(')');
        return this.fin({ type: 'GenericSelection', control, assocs }, t);
      }
      case '__builtin_va_arg': {
        this.p++;
        this.expect('(');
        const arg = this.parseAssignment();
        this.expect(',');
        const typeName = this.parseTypeName();
        this.expect(')');
        return this.fin({ type: 'VaArgExpr', arg, typeName }, t);
      }
      case '__builtin_offsetof': {
        this.p++;
        this.expect('(');
        const typeName = this.parseTypeName();
        this.expect(',');
        const designators = [];
        let member = '';
        for (;;) {
          const ds = this.t;
          if (this.isId()) {
            this.p++;
            designators.push(this.fin({ type: 'Designator', kind: 'field', name: ds.value, index: null, high: null }, ds));
            member += (member ? '.' : '') + ds.value;
          } else if (this.isP('.')) { this.p++; continue; } else if (this.isP('[')) {
            this.p++;
            const index = this.parseExpression();
            this.expect(']');
            designators.push(this.fin({ type: 'Designator', kind: 'index', name: null, index, high: null }, ds));
            member += '[]';
          } else break;
        }
        this.expect(')');
        return this.fin({ type: 'OffsetofExpr', typeName, member, designators }, t);
      }
      case 'requires': {
        this.p++;
        if (this.isP('(')) this.balancedText();
        let text = '';
        if (this.isP('{')) {
          const c = this.skipBalanced(this.p);
          const parts = [];
          for (let i = this.p; i <= c; i++) parts.push(spell(this.toks[i]));
          text = parts.join(' ');
          this.p = c + 1;
        }
        return this.fin({ type: 'RequiresExpr', text }, t);
      }
      case 'operator': return this.parseIdExpression();
      case 'typename': case 'decltype':
        if (this.cpp) {
          const s = this.t;
          const specs = this.parseDeclSpecs('typeName');
          const typeName = this.fin({ type: 'TypeName', specs, declarator: { type: 'AbstractDeclarator', loc: this.emptyLoc() } }, s);
          if (this.isP('(') || this.isP('{')) {
            const brace = this.isP('{');
            const args = brace ? [this.parseInitList()] : this.parseCallArgs();
            return this.fin({ type: 'CastExpr', kind: 'functional', typeName, arg: args.length === 1 ? args[0] : null, args: args.length === 1 ? null : args, brace }, s);
          }
          if (v === 'decltype' && specs.typeSpec && specs.typeSpec.type === 'DecltypeType') {
            // decltype(x) used as an expression operand (e.g. in templates)
            return this.fin({ type: 'CastExpr', kind: 'functional', typeName, arg: null, args: [], brace: false }, s);
          }
          throw new ParseError(`expected '(' after type in expression`, this.t);
        }
        break;
      default:
        if (TYPE_KW.has(v) && this.cpp) return this.parseFunctionalCast();
        if (v === '__func__' || v === '__FUNCTION__' || v === '__PRETTY_FUNCTION__') {
          this.p++;
          return this.fin({ type: 'Identifier', name: v, qualifier: '', qname: v, predefined: true }, t);
        }
        break;
    }
    throw new ParseError(`expected expression before ${describe(t)}`, t);
  }

  parseParen() {
    const s = this.next();
    if (this.isP('{')) {
      // GNU statement expression
      const body = this.parseCompound(true);
      this.expectClose(')', s);
      return this.fin({ type: 'StmtExpr', body }, s);
    }
    const ng = this.noGreater;
    this.noGreater = 0;
    this.parenDepth++;
    try {
      if (this.cpp && this.isP('...')) {
        // left fold: ( ... op pack )
        this.p++;
        const op = this.next().value;
        const right = this.parseCast();
        this.expectClose(')', s);
        return this.fin({ type: 'FoldExpr', op, left: null, right, direction: 'left' }, s);
      }
      const expr = this.parseExpression();
      if (this.cpp && this.t.kind === 'punct' && FOLD_OPS.has(this.t.value) && this.isP('...', this.peek())) {
        const op = this.next().value;
        this.p++; // ...
        let right = null;
        if (this.isP(op)) { this.p++; right = this.parseCast(); }
        this.expectClose(')', s);
        return this.fin({ type: 'FoldExpr', op, left: expr, right, direction: right ? 'binary' : 'right' }, s);
      }
      this.expectClose(')', s);
      return this.fin({ type: 'ParenExpr', expr }, s);
    } finally {
      this.noGreater = ng;
      this.parenDepth--;
    }
  }

  parseLambda() {
    const s = this.next(); // [
    const captures = [];
    let captureDefault = null;
    while (!this.isP(']') && !this.eof()) {
      const cs = this.t;
      if (this.isP('&') && (this.isP(',', this.peek()) || this.isP(']', this.peek()))) { this.p++; captureDefault = '&'; }
      else if (this.isP('=') ) { this.p++; captureDefault = '='; }
      else if (this.isK('this')) { this.p++; captures.push(this.fin({ type: 'LambdaCapture', kind: 'this', name: 'this', byRef: true, init: null }, cs)); }
      else if (this.isP('*') && this.isK('this', this.peek())) { this.p += 2; captures.push(this.fin({ type: 'LambdaCapture', kind: 'this', name: '*this', byRef: false, init: null }, cs)); }
      else {
        const byRef = !!this.accept('&');
        const pack = !!this.accept('...');
        const nt = this.next();
        if (nt.kind !== 'identifier') throw new ParseError('expected capture name', nt);
        let init = null;
        if (this.accept('...')) { /* pack */ }
        if (this.isP('=')) { this.p++; init = this.parseAssignment(); }
        else if (this.isP('(')) { const ps = this.t; init = this.fin({ type: 'ParenListInit', args: this.parseCallArgs() }, ps); }
        else if (this.isP('{')) init = this.parseInitList();
        captures.push(this.fin({ type: 'LambdaCapture', kind: init ? 'init' : 'name', name: nt.value, byRef, init, pack }, cs));
      }
      if (!this.accept(',')) break;
    }
    this.expect(']');
    this.pushScope();
    try {
      let templateParams = null;
      if (this.isP('<')) templateParams = this.parseTemplateParams();
      let params = [], variadic = false;
      if (this.isP('(')) {
        const open = this.next();
        const pl = this.parseParamList();
        params = pl.params;
        variadic = pl.variadic;
        this.expectClose(')', open);
      }
      let isMutable = false, isConstexpr = false, isConsteval = false, isStatic = false, noexcept = false, trailingReturn = null;
      const attributes = [];
      for (;;) {
        if (this.isK('mutable')) { this.p++; isMutable = true; continue; }
        if (this.isK('constexpr')) { this.p++; isConstexpr = true; continue; }
        if (this.isK('consteval')) { this.p++; isConsteval = true; continue; }
        if (this.isK('static')) { this.p++; isStatic = true; continue; }
        if (this.isK('noexcept')) { this.p++; noexcept = true; if (this.isP('(')) this.balancedText(); continue; }
        if (this.isP('[') && this.isP('[', this.peek())) { for (const a of this.parseAttributes()) attributes.push(a); continue; }
        if (this.isK('__attribute__')) { for (const a of this.parseAttributes()) attributes.push(a); continue; }
        if (this.isP('->')) { this.p++; trailingReturn = this.parseTypeName(true); continue; }
        if (this.isK('requires')) { this.p++; this.parseConstraint(); continue; }
        break;
      }
      for (const p of params) if (p.name) this.declare(p.name, 'var');
      const savedFn = this.inFunction;
      this.inFunction = true;
      let body;
      try { body = this.parseCompound(false); } finally { this.inFunction = savedFn; }
      return this.fin({ type: 'LambdaExpr', captures, captureDefault, templateParams, params, variadic, mutable: isMutable, constexpr: isConstexpr, consteval: isConsteval, static: isStatic, noexcept, trailingReturn, body, attributes }, s);
    } finally {
      this.popScope();
    }
  }

  parseInitializer() {
    if (this.isP('{')) return this.parseInitList();
    return this.parseAssignment();
  }

  parseInitList() {
    const open = this.expect('{');
    const items = [];
    let trailingComma = false;
    const ng = this.noGreater;
    this.noGreater = 0;
    try {
      while (!this.isP('}') && !this.eof()) {
        const s = this.t;
        const designators = [];
        // GNU old style  field: value
        if (this.isId() && this.isP(':', this.peek()) && !this.cpp) {
          designators.push(this.fin({ type: 'Designator', kind: 'field', name: s.value, index: null, high: null, gnuColon: true }, s));
          this.p += 2;
        }
        for (;;) {
          const ds = this.t;
          if (this.isP('.') && this.isId(this.peek())) {
            this.p++;
            const nt = this.next();
            designators.push(this.fin({ type: 'Designator', kind: 'field', name: nt.value, index: null, high: null }, ds));
            continue;
          }
          if (this.isP('[') && !this.cpp) {
            this.p++;
            const index = this.parseConditional();
            let high = null;
            if (this.accept('...')) high = this.parseConditional();
            this.expect(']');
            designators.push(this.fin({ type: 'Designator', kind: 'index', name: null, index, high }, ds));
            continue;
          }
          break;
        }
        let value;
        if (designators.length && !designators[0].gnuColon) {
          if (this.cpp && this.isP('{')) value = this.parseInitList();
          else {
            this.expect('=');
            value = this.parseInitializer();
          }
        } else value = this.parseInitializer();
        if (this.cpp && this.isP('...')) { this.p++; value = this.fin({ type: 'PackExpansion', expr: value }, s); }
        items.push(designators.length ? this.fin({ type: 'DesignatedInit', designators, value }, s) : value);
        if (!this.accept(',')) break;
        if (this.isP('}')) trailingComma = true;
      }
    } finally {
      this.noGreater = ng;
    }
    this.expectClose('}', open);
    return this.fin({ type: 'InitList', items, trailingComma }, open);
  }
}

// ---------------------------------------------------------------- helpers

function describe(t) {
  if (!t || t.kind === 'eof') return 'end of input';
  return `'${spell(t)}'`;
}

function normAttr(name) {
  const m = /^__(.+)__$/.exec(name);
  return m ? m[1] : name;
}

// The innermost named (or abstract) leaf of a declarator chain.
function declLeaf(d) {
  while (d && d.inner) d = d.inner;
  return d;
}

// The FunctionDeclarator that applies directly to the declared name, if any.
function directFunction(d) {
  let last = null;
  while (d && d.inner) { last = d; d = d.inner; }
  if (last && last.type === 'FunctionDeclarator' && d && (d.type === 'IdentDeclarator')) return last;
  return null;
}

function hasPack(d) {
  while (d) { if (d.pack) return true; d = d.inner; }
  return false;
}

function hasArray(d) {
  while (d) { if (d.type === 'ArrayDeclarator') return true; d = d.inner; }
  return false;
}

function isTypeTemplate(decl) {
  if (!decl) return false;
  if (decl.type === 'AliasDecl') return true;
  if (decl.type === 'Declaration' && decl.declarators.length === 0 && decl.specs.typeSpec && decl.specs.typeSpec.type === 'RecordDecl') return true;
  return false;
}

function templatedName(decl) {
  if (!decl) return null;
  if (decl.type === 'AliasDecl' || decl.type === 'ConceptDecl') return decl.name;
  if (decl.type === 'Declaration') {
    if (decl.declarators.length === 0 && decl.specs.typeSpec && decl.specs.typeSpec.type === 'RecordDecl') return decl.specs.typeSpec.name;
    if (decl.declarators[0]) return decl.declarators[0].name;
  }
  if (decl.type === 'TemplateDecl') return templatedName(decl.decl);
  return null;
}

// Plain text of a TypeName / DeclSpec (used for conversion operator names and diagnostics).
function typeText(tn) {
  if (!tn) return '';
  const sp = tn.specs || tn;
  const parts = [...(sp.qualifiers || [])];
  const ts = sp.typeSpec;
  if (ts) {
    if (ts.type === 'BuiltinType') parts.push(ts.names.join(' '));
    else if (ts.type === 'NamedType') parts.push(ts.qname);
    else if (ts.type === 'RecordDecl') parts.push(`${ts.tag} ${ts.name || '<anonymous>'}`);
    else if (ts.type === 'EnumDecl') parts.push(`enum ${ts.name || '<anonymous>'}`);
    else if (ts.type === 'AutoType') parts.push('auto');
    else parts.push(ts.type);
  }
  let d = tn.declarator;
  let suffix = '';
  while (d) {
    if (d.type === 'PointerDeclarator') suffix += '*';
    else if (d.type === 'ReferenceDeclarator') suffix += d.rvalue ? '&&' : '&';
    else if (d.type === 'ArrayDeclarator') suffix += '[]';
    else if (d.type === 'FunctionDeclarator') suffix += '()';
    d = d.inner;
  }
  return parts.join(' ') + suffix;
}

function parse(tokens, opts = {}) {
  const p = new Parser(tokens, opts);
  let ast;
  try {
    ast = p.parseTranslationUnit();
  } catch (e) {
    if (e instanceof RangeError) {
      p.error('Nesting too deep: ' + e.message, p.t);
      ast = { type: 'TranslationUnit', decls: [], loc: mkLoc(p.toks[0], p.toks[0]), truncated: true };
    } else throw e;
  }
  return { ast, diagnostics: p.diagnostics };
}

module.exports = { parse, Parser, ParseError, declLeaf, directFunction, typeText, mkLoc };
