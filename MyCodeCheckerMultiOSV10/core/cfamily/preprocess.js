'use strict';

// C/C++ preprocessor (translation phase 4) over lexer tokens.
//
// preprocess(text, opts) -> PPResult   (see AST.md, "Preprocessor")
//
// Never throws on bad input: every problem becomes a diagnostic and processing
// continues. Tokens produced by macro expansion carry the location of the
// outermost expansion site plus `fromMacro`, `macro` and `spelling`.

const posix = require('path').posix;
const { lex, classifyNumber, decodeEscapes, literalParts, spell } = require('./lexer');
const { builtinHeaders } = require('./headers');

const MAX_EXPANSION_TOKENS = 2000000;

function normPath(p) {
  let s = String(p).replace(/\\/g, '/');
  s = posix.normalize(s);
  if (s.startsWith('./')) s = s.slice(2);
  return s;
}

// files: Map<path, string|{text, lang}> | Array<{path, text, lang}> | Object
function toFileMap(files) {
  const m = new Map();
  if (!files) return m;
  if (files instanceof Map) {
    for (const [k, v] of files) m.set(normPath(k), typeof v === 'string' ? { text: v } : v);
  } else if (Array.isArray(files)) {
    for (const f of files) if (f && f.path != null) m.set(normPath(f.path), { text: f.text || '', lang: f.lang });
  } else {
    for (const k of Object.keys(files)) {
      const v = files[k];
      m.set(normPath(k), typeof v === 'string' ? { text: v } : v);
    }
  }
  return m;
}

function cppVersion(std) {
  const s = String(std || 'c++20');
  if (/11|0x/.test(s)) return '201103L';
  if (/14|1y/.test(s)) return '201402L';
  if (/17|1z/.test(s)) return '201703L';
  if (/23|2b/.test(s)) return '202302L';
  return '202002L';
}
function cVersion(std) {
  const s = String(std || 'c17');
  if (/89|90|ansi/.test(s)) return null;
  if (/99/.test(s)) return '199901L';
  if (/11|1x/.test(s)) return '201112L';
  if (/23|2x/.test(s)) return '202311L';
  return '201710L';
}

const PLACEMARKER = { kind: 'placemarker', value: '' };

class Preprocessor {
  constructor(opts = {}) {
    this.opts = opts;
    this.lang = opts.lang === 'cpp' ? 'cpp' : 'c';
    this.cpp = this.lang === 'cpp';
    this.std = opts.std || (this.cpp ? 'c++20' : 'c17');
    this.target = opts.target || {};
    this.files = opts.fileMap || toFileMap(opts.files);
    this.includeDirs = (opts.includeDirs || []).map(normPath);
    this.useBuiltin = opts.builtinHeaders !== false;
    this.builtin = this.useBuiltin ? builtinHeaders(this.lang, this.target) : {};
    this.maxDepth = opts.maxIncludeDepth || 64;
    this.lexCache = opts.lexCache || new Map();
    this.macros = new Map();
    this.macroDefs = [];
    this.expansions = [];
    this.directives = [];
    this.includes = [];
    this.diagnostics = [];
    this.undefInIf = [];
    this.pragmas = [];
    this.skipped = [];
    this.out = [];
    this.cond = [];
    this.pending = [];
    this.sources = new Map();
    this.fileOrder = [];
    this.onceFiles = new Set();
    this.guards = new Map();
    this.fileState = null;
    this.counter = 0;
    this.groupId = 0;
    this.depth = 0;
    this.tokenBudget = MAX_EXPANSION_TOKENS;
    this.mainFile = '';
    this.src = null;
  }

  diag(severity, code, message, at) {
    this.diagnostics.push({ severity, code, message, file: at ? at.file : this.mainFile, line: at ? at.line : 0, col: at ? at.col : 0 });
  }

  getLexed(file, text, lang) {
    const key = file + '\u0000' + (lang || this.lang) + '\u0000' + this.std;
    let lx = this.lexCache.get(key);
    if (!lx || lx.text !== text) {
      lx = lex(text, { file, lang: lang || this.lang, std: this.std, trigraphs: this.opts.trigraphs });
      lx.guard = detectGuard(lx.tokens);
      this.lexCache.set(key, lx);
    }
    return lx;
  }

  run(file, text) {
    this.mainFile = file;
    // predefined and command-line macros are ordinary #defines in pseudo files
    this.processText('<predefined>', this.predefinedText(), { predefined: true });
    const cl = [];
    const defs = this.opts.defines;
    if (Array.isArray(defs)) {
      for (const d of defs) {
        const s = String(d);
        const eq = s.indexOf('=');
        cl.push(eq < 0 ? `#define ${s} 1` : `#define ${s.slice(0, eq)} ${s.slice(eq + 1)}`);
      }
    } else if (defs && typeof defs === 'object') {
      for (const k of Object.keys(defs)) cl.push(`#define ${k} ${defs[k] == null ? '1' : defs[k]}`);
    }
    for (const u of this.opts.undefs || []) cl.push(`#undef ${u}`);
    if (cl.length) this.processText('<command-line>', cl.join('\n'), { commandLine: true });
    this.out = [];
    const lx = this.getLexed(file, text, this.lang);
    this.processFile(file, lx, 0);
    return this.result();
  }

  processText(name, text, flags) {
    const lx = lex(text, { file: name, lang: this.lang, std: this.std });
    this.defineFlags = flags;
    this.processFile(name, lx, 0, true);
    this.defineFlags = null;
  }

  predefinedText() {
    const t = this.target;
    const lines = ['#define __STDC__ 1', '#define __STDC_HOSTED__ 1', '#define __STDC_UTF_16__ 1', '#define __STDC_UTF_32__ 1'];
    if (this.cpp) lines.push(`#define __cplusplus ${cppVersion(this.std)}`);
    else {
      const v = cVersion(this.std);
      if (v) lines.push(`#define __STDC_VERSION__ ${v}`);
      lines.push('#define __STDC_IEC_559__ 1', '#define __STDC_NO_THREADS__ 1');
    }
    const size = (k, d) => (t[k] != null ? t[k] : d);
    lines.push('#define __CHAR_BIT__ 8',
      `#define __SIZEOF_SHORT__ ${size('short', 2)}`, `#define __SIZEOF_INT__ ${size('int', 4)}`,
      `#define __SIZEOF_LONG__ ${size('long', 8)}`, `#define __SIZEOF_LONG_LONG__ ${size('longlong', 8)}`,
      `#define __SIZEOF_POINTER__ ${size('pointer', 8)}`, '#define __SIZEOF_FLOAT__ 4', '#define __SIZEOF_DOUBLE__ 8');
    if (size('long', 8) === 8 && size('pointer', 8) === 8) lines.push('#define __LP64__ 1', '#define _LP64 1');
    if (size('pointer', 8) === 4) lines.push('#define __ILP32__ 1');
    for (const name of ['__FILE__', '__LINE__', '__COUNTER__', '__DATE__', '__TIME__', '__INCLUDE_LEVEL__', '__BASE_FILE__', '__FILE_NAME__', '__TIMESTAMP__']) {
      lines.push(`#define ${name} ${name}`);
    }
    return lines.join('\n');
  }

  // ------------------------------------------------------------ file loop

  processFile(file, lx, depth, pseudo) {
    if (!pseudo && !this.sources.has(file)) {
      this.sources.set(file, lx);
      this.fileOrder.push(file);
    }
    if (!pseudo) {
      for (const d of lx.diagnostics) this.diagnostics.push(d);
    }
    const savedSrc = this.src;
    const savedState = this.fileState;
    const toks = lx.tokens;
    const n = toks.length;
    this.src = { toks, i: 0, n, file, lx, depth };
    this.fileState = { file, sawCode: false, pseudo: !!pseudo };
    const condBase = this.cond.length;
    const src = this.src;
    while (src.i < n) {
      const t = toks[src.i];
      if (t.bol && t.value === '#' && t.kind === 'punct') {
        const j = lineEnd(toks, src.i + 1, n);
        this.directive(lx, src.i, j, depth);
        src.i = j;
        continue;
      }
      if (!this.isActive()) {
        src.i = lineEnd(toks, src.i + 1, n);
        continue;
      }
      this.fileState.sawCode = true;
      this.expandMain();
    }
    while (this.cond.length > condBase) {
      const c = this.cond.pop();
      this.diag('error', 'pp-unterminated-conditional', `#${c.directive.name} without matching #endif`, c.directive);
      if (c.skipFrom) this.skipped.push({ file: c.skipFrom.file, startLine: c.skipFrom.line, endLine: lx.lineStarts.length });
    }
    this.src = savedSrc;
    this.fileState = savedState;
  }

  isActive() {
    const c = this.cond;
    return c.length === 0 || c[c.length - 1].active;
  }

  nextRaw() {
    const s = this.src;
    if (s.i >= s.n) return null;
    const t = s.toks[s.i];
    if (t.bol && t.value === '#' && t.kind === 'punct') return null;
    s.i++;
    return t;
  }

  // inside macro arguments a directive line is consumed as ordinary tokens
  nextRawArgs() {
    const s = this.src;
    if (s.i >= s.n) return null;
    const t = s.toks[s.i];
    if (t.bol && t.value === '#' && t.kind === 'punct' && !this.warnedArgDirective) {
      this.diag('warning', 'pp-directive-in-macro-args', 'Preprocessing directive inside macro arguments', t);
    }
    s.i++;
    return t;
  }

  expandMain() {
    const ctx = { pending: this.pending, raw: () => this.nextRaw(), rawArgs: () => this.nextRawArgs(), main: true };
    this.expand(ctx, (t) => this.emit(t));
  }

  emit(t) {
    if (t.kind === 'placemarker') return;
    if (this.fileState && this.fileState.pseudo) return;
    if (t.unterminated) this.diag('error', 'lex-unterminated-literal', `Missing terminating ${t.kind === 'char' ? "'" : '"'} character`, t);
    else if (t.kind === 'other') this.diag('error', 'lex-stray-character', `Stray '${t.value}' in program`, t);
    this.out.push(t);
  }

  // ------------------------------------------------------------ expansion

  expand(ctx, emit) {
    const pending = ctx.pending;
    for (;;) {
      const t = pending.length ? pending.pop() : ctx.raw();
      if (t === null || t === undefined) return;
      if ((t.kind === 'identifier' || t.kind === 'keyword') && t.noexpand !== true) {
        const m = this.macros.get(t.value);
        if (m !== undefined) {
          if (t.hs && t.hs.has(t.value)) { emit(painted(t)); continue; }
          let args = null, rparen = null;
          if (m.kind === 'function') {
            const nx = pending.length ? pending.pop() : ctx.raw();
            if (!nx || nx.kind !== 'punct' || nx.value !== '(') {
              if (nx) pending.push(nx);
              emit(t);
              continue;
            }
            const got = this.collectArgs(ctx, m, t, nx);
            if (!got) { emit(t); continue; }
            args = got.args;
            rparen = got.rparen;
          }
          const repl = this.substitute(m, args, t, rparen);
          if (repl === null) { emit(t); continue; }
          this.tokenBudget -= repl.length;
          if (this.tokenBudget < 0) {
            if (this.tokenBudget > -repl.length - 1) this.diag('error', 'pp-expansion-limit', 'Macro expansion produced too many tokens', t);
            continue;
          }
          for (let k = repl.length - 1; k >= 0; k--) pending.push(repl[k]);
          continue;
        }
        if (t.value === '_Pragma' && ctx.main) {
          if (this.handlePragmaOperator(ctx, t)) continue;
        }
      }
      emit(t);
    }
  }

  collectArgs(ctx, m, t, lparen) {
    const pending = ctx.pending;
    const read = () => (pending.length ? pending.pop() : (ctx.rawArgs ? ctx.rawArgs() : ctx.raw()));
    const args = [];
    let cur = [];
    let depth = 0;
    const consumed = [];
    for (;;) {
      const a = read();
      if (a === null || a === undefined) {
        this.diag('error', 'pp-unterminated-macro-call', `Unterminated argument list invoking macro "${m.name}"`, t);
        for (let k = consumed.length - 1; k >= 0; k--) pending.push(consumed[k]);
        pending.push(lparen);
        return null;
      }
      consumed.push(a);
      if (a.kind === 'punct') {
        if (a.value === '(') depth++;
        else if (a.value === ')') {
          if (depth === 0) {
            args.push(cur);
            return this.checkArgs(m, t, args) ? { args: this.groupVariadic(m, args), rparen: a } : null;
          }
          depth--;
        } else if (a.value === ',' && depth === 0) {
          args.push(cur);
          cur = [];
          cur.commaBefore = a;
          continue;
        }
      }
      cur.push(a);
    }
  }

  checkArgs(m, t, args) {
    const np = m.params.length;
    const count = args.length;
    if (count === 1 && args[0].length === 0 && np === 0 && !m.variadic) return true;
    if (m.variadic) {
      const named = m.vaName === '__VA_ARGS__' ? np : np - 1;
      if (count >= named || named === 0) return true;
    } else if (count === np) return true;
    this.diag('error', 'pp-macro-arg-count', `Macro "${m.name}" requires ${np}${m.variadic ? '+' : ''} arguments, but ${count} given`, t);
    return false;
  }

  groupVariadic(m, args) {
    if (!m.variadic) return args;
    const nNamed = m.vaName === '__VA_ARGS__' ? m.params.length : m.params.length - 1;
    const out = args.slice(0, nNamed);
    while (out.length < nNamed) out.push([]);
    const va = [];
    for (let k = nNamed; k < args.length; k++) {
      if (k > nNamed && args[k].commaBefore) va.push(args[k].commaBefore);
      for (const x of args[k]) va.push(x);
    }
    out.push(va);
    out.vaPresent = args.length > nNamed;
    return out;
  }

  // Replace a macro invocation. args: array (named params..., variadic) or null.
  substitute(m, args, t, rparen) {
    const top = !t.site;
    const end = rparen || t;
    const site = t.site || {
      file: t.file, line: t.line, col: t.col, endLine: end.endLine, endCol: end.endCol,
      start: t.start, end: end.end, macro: m.name,
    };
    if (top || this.opts.recordNested !== false) {
      this.expansions.push({
        name: m.name, file: site.file, line: t.site ? site.line : t.line, col: t.site ? site.col : t.col,
        endLine: site.endLine, endCol: site.endCol, nested: !top, def: m,
        args: args ? args.map((a) => a.slice()) : null,
      });
    }
    m.expansionCount++;
    if (m.builtin) return [this.builtinToken(m, site, t)];
    let hsBase;
    if (rparen) {
      hsBase = new Set();
      if (t.hs && rparen.hs) for (const x of t.hs) if (rparen.hs.has(x)) hsBase.add(x);
    } else hsBase = t.hs ? new Set(t.hs) : new Set();
    hsBase.add(m.name);
    const params = m.paramIndex;
    const expCache = [];
    const self = this;
    const expArg = (k) => {
      if (expCache[k] === undefined) expCache[k] = self.expandList(args[k] || []);
      return expCache[k];
    };
    const vaIdx = m.variadic ? args && args.length - 1 : -1;
    const vaNonEmpty = () => vaIdx >= 0 && expArg(vaIdx).length > 0;

    const subst = (body) => {
      const res = [];
      for (let i = 0; i < body.length; i++) {
        const b = body[i];
        const isId = b.kind === 'identifier' || b.kind === 'keyword';
        if (args && b.kind === 'punct' && b.value === '#' && i + 1 < body.length) {
          const nx = body[i + 1];
          const k = params.get(nx.value);
          if (k !== undefined && (nx.kind === 'identifier' || nx.kind === 'keyword')) {
            const st = stringify(args[k] || []);
            st.space = b.space;
            res.push(st);
            i++;
            continue;
          }
          if (nx.value === '__VA_OPT__') {
            const grp = vaOptGroup(body, i + 1);
            const inner = vaNonEmpty() ? subst(grp.tokens) : [];
            res.push(stringify(inner));
            i = grp.end;
            continue;
          }
        }
        if (b.kind === 'punct' && b.value === '##' && i + 1 < body.length) {
          const nx = body[i + 1];
          let rhs;
          let skip = 1;
          const k = args && (nx.kind === 'identifier' || nx.kind === 'keyword') ? params.get(nx.value) : undefined;
          if (k !== undefined) {
            rhs = args[k] || [];
            // GNU: , ## __VA_ARGS__ drops the comma when the variadic part is empty
            if (k === vaIdx && res.length && res[res.length - 1].value === ',') {
              if (rhs.length === 0) res.pop();
              else for (const x of expArg(k)) res.push(x);
              i++;
              continue;
            }
          } else if (nx.value === '__VA_OPT__' && args) {
            const grp = vaOptGroup(body, i + 1);
            rhs = vaNonEmpty() ? subst(grp.tokens) : [];
            skip = grp.end - i;
          } else rhs = [nx];
          if (rhs.length === 0) { i += skip; continue; }
          const lhs = res.length ? res[res.length - 1] : null;
          if (!lhs || lhs.kind === 'placemarker') {
            if (lhs) res.pop();
            for (const x of rhs) res.push(x);
          } else {
            const pasted = self.paste(lhs, rhs[0], site);
            res.pop();
            for (const x of pasted) res.push(x);
            for (let q = 1; q < rhs.length; q++) res.push(rhs[q]);
          }
          i += skip;
          continue;
        }
        if (args && isId) {
          if (b.value === '__VA_OPT__') {
            const grp = vaOptGroup(body, i);
            if (vaNonEmpty()) {
              const inner = subst(grp.tokens);
              for (const x of inner) res.push(x);
            } else res.push(PLACEMARKER);
            i = grp.end;
            continue;
          }
          const k = params.get(b.value);
          if (k !== undefined) {
            const nextIsPaste = i + 1 < body.length && body[i + 1].kind === 'punct' && body[i + 1].value === '##';
            const arg = nextIsPaste ? (args[k] || []) : expArg(k);
            if (arg.length === 0) res.push(PLACEMARKER);
            else {
              for (let q = 0; q < arg.length; q++) {
                const x = arg[q];
                res.push(q === 0 ? withSpace(x, b.space) : x);
              }
            }
            continue;
          }
        }
        res.push(b);
      }
      return res;
    };

    const raw = subst(m.body);
    const out = [];
    const hsCache = new Map();
    let first = true;
    for (const r of raw) {
      if (r.kind === 'placemarker') continue;
      let hs;
      if (!r.hs) hs = hsBase;
      else {
        hs = hsCache.get(r.hs);
        if (!hs) { hs = new Set(r.hs); for (const x of hsBase) hs.add(x); hsCache.set(r.hs, hs); }
      }
      const c = copyToken(r, site, hs, m.name);
      if (first) { c.space = t.space; first = false; }
      out.push(c);
    }
    return out;
  }

  expandList(tokens) {
    const ctx = { pending: [], raw: () => null };
    for (let k = tokens.length - 1; k >= 0; k--) ctx.pending.push(tokens[k]);
    const out = [];
    this.expand(ctx, (x) => out.push(x));
    return out;
  }

  paste(a, b, site) {
    const s = spell(a) + spell(b);
    const lx = lex(s, { lang: this.lang, std: this.std, file: site.file });
    if (lx.tokens.length === 1 && lx.comments.length === 0) {
      const p = lx.tokens[0];
      const r = { ...a, kind: p.kind, value: p.value, hs: a.hs };
      delete r.digraph; delete r.alt; delete r.noexpand;
      if (p.prefix !== undefined) r.prefix = p.prefix; else delete r.prefix;
      if (p.raw) r.raw = true;
      if (p.digraph) r.digraph = p.digraph;
      if (p.alt) r.alt = p.alt;
      if (p.udSuffix) r.udSuffix = p.udSuffix;
      r.pasted = true;
      return [r];
    }
    if (s.length) this.diag('warning', 'pp-invalid-paste', `Pasting "${spell(a)}" and "${spell(b)}" does not give a valid preprocessing token`, site);
    return [a, b];
  }

  builtinToken(m, site, t) {
    const base = { line: site.line, col: site.col, endLine: site.endLine, endCol: site.endCol, start: site.start, end: site.end, file: site.file, space: t.space, bol: false, fromMacro: site.macro, macro: m.name, site, hs: null };
    const d = new Date(0);
    switch (m.builtin) {
      case '__LINE__': return { ...base, kind: 'number', value: String(site.line) };
      case '__FILE__': return { ...base, kind: 'string', value: JSON.stringify(site.file), prefix: '' };
      case '__FILE_NAME__': return { ...base, kind: 'string', value: JSON.stringify(posix.basename(site.file)), prefix: '' };
      case '__BASE_FILE__': return { ...base, kind: 'string', value: JSON.stringify(this.mainFile), prefix: '' };
      case '__COUNTER__': return { ...base, kind: 'number', value: String(this.counter++) };
      case '__INCLUDE_LEVEL__': return { ...base, kind: 'number', value: String(this.src ? this.src.depth : 0) };
      case '__DATE__': return { ...base, kind: 'string', value: '"Jan  1 1970"', prefix: '' };
      case '__TIME__': return { ...base, kind: 'string', value: '"00:00:00"', prefix: '' };
      default: void d; return { ...base, kind: 'string', value: '"Thu Jan  1 00:00:00 1970"', prefix: '' };
    }
  }

  handlePragmaOperator(ctx, t) {
    const pending = ctx.pending;
    const read = () => (pending.length ? pending.pop() : ctx.raw());
    const a = read();
    if (!a || a.value !== '(') { if (a) pending.push(a); return false; }
    const s = read();
    const c = s && s.kind === 'string' ? read() : null;
    if (!s || s.kind !== 'string' || !c || c.value !== ')') {
      this.diag('error', 'pp-pragma-operator', '_Pragma takes a parenthesized string literal', t);
      if (c) pending.push(c);
      if (s) pending.push(s);
      return true;
    }
    const text = literalParts(s).body.replace(/\\(["\\])/g, '$1');
    const rec = { kind: 'pragma', name: '_Pragma', file: t.file, line: t.line, col: t.col, endLine: c.endLine, endCol: c.endCol, active: true, text, operator: true, tokens: [] };
    this.directives.push(rec);
    this.pragmas.push(rec);
    return true;
  }

  // ------------------------------------------------------------ directives

  directive(lx, i, j, depth) {
    const toks = lx.tokens;
    const hash = toks[i];
    const nameTok = i + 1 < j ? toks[i + 1] : null;
    const name = nameTok ? nameTok.value : '';
    const line = toks.slice(i + 2, j);
    const last = toks[j - 1];
    const active = this.isActive();
    const rec = {
      kind: 'unknown', name, file: lx.file, line: hash.line, col: hash.col, endLine: last.endLine, endCol: last.endCol,
      active, tokens: line, text: lx.text.slice(hash.start, last.end), nameToken: nameTok,
    };
    if (hash.digraph) rec.digraph = true;
    const pseudo = this.fileState && this.fileState.pseudo;
    if (!pseudo) this.directives.push(rec);
    if (!nameTok) { rec.kind = 'null'; return; }
    if (nameTok.kind === 'number' && active) {
      rec.kind = 'line';
      rec.gnuLine = true;
      return;
    }
    switch (name) {
      case 'if': case 'ifdef': case 'ifndef':
        rec.kind = name;
        this.doIf(rec, line);
        return;
      case 'elif': case 'elifdef': case 'elifndef':
        rec.kind = name;
        this.doElif(rec, line);
        return;
      case 'else':
        rec.kind = 'else';
        this.doElse(rec, line);
        return;
      case 'endif':
        rec.kind = 'endif';
        this.doEndif(rec, line);
        return;
      default: break;
    }
    if (!active) {
      rec.kind = KNOWN_DIRECTIVES.has(name) ? name : 'unknown';
      return;
    }
    switch (name) {
      case 'define': rec.kind = 'define'; this.doDefine(rec, line, nameTok); return;
      case 'undef': rec.kind = 'undef'; this.doUndef(rec, line, nameTok); return;
      case 'include': case 'include_next': case 'import':
        rec.kind = name === 'import' ? 'import' : 'include';
        if (name !== 'include') rec.variant = name;
        this.doInclude(rec, line, nameTok, lx, depth);
        return;
      case 'error': case 'warning': {
        rec.kind = name;
        rec.message = line.length ? lx.text.slice(line[0].start, last.end) : '';
        this.diag(name === 'error' ? 'error' : 'warning', name === 'error' ? 'pp-error' : 'pp-warning', `#${name} ${rec.message}`.trim(), rec);
        return;
      }
      case 'pragma': {
        rec.kind = 'pragma';
        rec.pragma = line.length ? lx.text.slice(line[0].start, last.end) : '';
        this.pragmas.push(rec);
        if (line.length && line[0].value === 'once') {
          this.onceFiles.add(lx.file);
          rec.once = true;
        }
        return;
      }
      case 'line': {
        rec.kind = 'line';
        const ex = this.expandList(line);
        if (!ex.length || ex[0].kind !== 'number' || classifyNumber(ex[0].value).kind !== 'int') {
          this.diag('error', 'pp-line-invalid', '#line requires a positive integer', rec);
        } else {
          rec.lineNumber = Number(classifyNumber(ex[0].value).value);
          if (ex[1] && ex[1].kind === 'string') rec.fileName = literalParts(ex[1]).body;
          else if (ex[1]) this.diag('error', 'pp-line-invalid', 'Invalid filename in #line', rec);
        }
        return;
      }
      case 'ident': case 'sccs': case 'assert': case 'unassert':
        rec.kind = name;
        this.diag('info', 'pp-extension-directive', `#${name} is a compiler extension`, rec);
        return;
      default:
        rec.kind = 'unknown';
        this.diag('error', 'pp-unknown-directive', `Invalid preprocessing directive #${name}`, rec);
    }
  }

  // --------------------------------------------- conditionals

  doIf(rec, line) {
    const parentActive = this.isActive();
    const group = ++this.groupId;
    rec.group = group;
    let taken = false;
    if (parentActive) {
      if (rec.kind === 'if') taken = this.evalIf(rec, line);
      else taken = this.evalIfdef(rec, line);
    }
    rec.taken = parentActive ? taken : null;
    const entry = { directive: rec, active: parentActive && taken, taken: !parentActive || taken, parentActive, elseSeen: false, file: rec.file, group, branches: [rec] };
    rec.branches = entry.branches;
    if (parentActive && !taken) entry.skipFrom = { file: rec.file, line: rec.line + 1 };
    this.cond.push(entry);
  }

  evalIfdef(rec, line) {
    const t = line[0];
    if (!t || (t.kind !== 'identifier' && t.kind !== 'keyword')) {
      this.diag('error', 'pp-ifdef-no-macro', `#${rec.kind} with no macro name`, rec);
      return false;
    }
    if (line.length > 1) this.diag('warning', 'pp-extra-tokens', `Extra tokens at end of #${rec.kind} directive`, line[1]);
    rec.macro = t.value;
    const def = this.macros.has(t.value);
    return rec.kind === 'ifdef' || rec.kind === 'elifdef' ? def : !def;
  }

  topCond(rec) {
    const top = this.cond[this.cond.length - 1];
    if (!top) {
      this.diag('error', 'pp-unmatched-conditional', `#${rec.kind} without #if`, rec);
      return null;
    }
    if (top.file !== rec.file) {
      this.diag('error', 'pp-conditional-across-files', `#${rec.kind} is in a different file from its #${top.directive.kind}`, rec);
    }
    rec.group = top.group;
    top.branches.push(rec);
    return top;
  }

  closeSkip(top, rec) {
    if (top.skipFrom) {
      this.skipped.push({ file: top.skipFrom.file, startLine: top.skipFrom.line, endLine: rec.line - 1 });
      top.skipFrom = null;
    }
  }

  doElif(rec, line) {
    const top = this.topCond(rec);
    if (!top) return;
    rec.active = top.parentActive;
    if (top.elseSeen) this.diag('error', 'pp-elif-after-else', `#${rec.kind} after #else`, rec);
    this.closeSkip(top, rec);
    if (top.parentActive && !top.taken) {
      const v = rec.kind === 'elif' ? this.evalIf(rec, line) : this.evalIfdef(rec, line);
      rec.taken = v;
      top.active = v;
      if (v) top.taken = true;
      else top.skipFrom = { file: rec.file, line: rec.line + 1 };
    } else {
      rec.taken = top.parentActive ? false : null;
      rec.evaluated = false;
      if (top.active && top.parentActive) top.skipFrom = null;
      if (top.parentActive) top.skipFrom = { file: rec.file, line: rec.line + 1 };
      top.active = false;
    }
  }

  doElse(rec, line) {
    const top = this.topCond(rec);
    if (!top) return;
    rec.active = top.parentActive;
    if (line.length) this.diag('warning', 'pp-extra-tokens', 'Extra tokens at end of #else directive', line[0]);
    if (top.elseSeen) this.diag('error', 'pp-else-after-else', '#else after #else', rec);
    top.elseSeen = true;
    this.closeSkip(top, rec);
    const v = top.parentActive && !top.taken;
    rec.taken = top.parentActive ? v : null;
    top.active = v;
    top.taken = true;
    if (top.parentActive && !v) top.skipFrom = { file: rec.file, line: rec.line + 1 };
  }

  doEndif(rec, line) {
    const top = this.topCond(rec);
    if (!top) return;
    rec.active = top.parentActive;
    if (line.length) this.diag('warning', 'pp-extra-tokens', 'Extra tokens at end of #endif directive', line[0]);
    this.closeSkip(top, rec);
    this.cond.pop();
  }

  // #if / #elif constant expression
  evalIf(rec, line) {
    if (!line.length) {
      this.diag('error', 'pp-if-no-expression', `#${rec.kind} with no expression`, rec);
      rec.value = 0;
      return false;
    }
    const defs = [];
    const step1 = this.replaceDefined(line, rec, defs, false);
    const expanded = this.expandList(step1);
    const step2 = this.replaceDefined(expanded, rec, defs, true);
    rec.defined = defs;
    const vals = [];
    for (const t of step2) {
      if (t.kind === 'identifier' || t.kind === 'keyword') {
        if (this.cpp && (t.value === 'true' || t.value === 'false')) {
          vals.push({ ...t, kind: 'number', value: t.value === 'true' ? '1' : '0' });
          continue;
        }
        const u = { name: t.value, file: rec.file, line: t.line, col: t.col, directive: rec };
        this.undefInIf.push(u);
        (rec.undefinedIdentifiers || (rec.undefinedIdentifiers = [])).push(t.value);
        vals.push({ ...t, kind: 'number', value: '0', wasIdentifier: t.value });
        continue;
      }
      vals.push(t);
    }
    const ev = new IfEvaluator(vals, this, rec);
    const r = ev.run();
    rec.value = r.ok ? (r.v > BigInt(Number.MAX_SAFE_INTEGER) || r.v < -BigInt(Number.MAX_SAFE_INTEGER) ? r.v : Number(r.v)) : 0;
    rec.valueUnsigned = r.u;
    rec.exprOk = r.ok;
    return r.ok && r.v !== 0n;
  }

  replaceDefined(tokens, rec, defs, afterExpansion) {
    const out = [];
    for (let k = 0; k < tokens.length; k++) {
      const t = tokens[k];
      if ((t.kind === 'identifier' || t.kind === 'keyword')) {
        if (t.value === 'defined') {
          if (afterExpansion && t.fromMacro) this.diag('warning', 'pp-defined-from-macro', 'Macro expansion produced "defined" in #if', t);
          let q = k + 1;
          let paren = false;
          if (tokens[q] && tokens[q].value === '(') { paren = true; q++; }
          const id = tokens[q];
          if (!id || (id.kind !== 'identifier' && id.kind !== 'keyword')) {
            this.diag('error', 'pp-defined-no-name', 'Operator "defined" requires an identifier', t);
            out.push(numTok(t, 0));
            k = q - 1;
            continue;
          }
          if (paren) {
            if (!tokens[q + 1] || tokens[q + 1].value !== ')') {
              this.diag('error', 'pp-defined-no-paren', 'Missing ")" after "defined"', t);
            } else q++;
          }
          defs.push({ name: id.value, paren, line: t.line, col: t.col });
          out.push(numTok(t, this.macros.has(id.value) ? 1 : 0));
          k = q;
          continue;
        }
        if (HAS_OPS.has(t.value)) {
          const r = this.hasOperator(tokens, k, t, rec);
          out.push(numTok(t, r.value));
          k = r.end;
          continue;
        }
      }
      out.push(t);
    }
    return out;
  }

  hasOperator(tokens, k, t, rec) {
    let q = k + 1;
    if (!tokens[q] || tokens[q].value !== '(') {
      this.diag('error', 'pp-has-syntax', `Missing "(" after ${t.value}`, t);
      return { value: 0, end: k };
    }
    let depth = 0;
    const inner = [];
    for (q = k + 1; q < tokens.length; q++) {
      const x = tokens[q];
      if (x.value === '(') { depth++; if (depth === 1) continue; }
      if (x.value === ')') { depth--; if (depth === 0) break; }
      inner.push(x);
    }
    if (t.value === '__has_include' || t.value === '__has_include_next') {
      let name = null, angled = false;
      if (inner[0] && inner[0].kind === 'string') name = literalParts(inner[0]).body;
      else if (inner[0] && inner[0].value === '<') {
        angled = true;
        const lx = this.sources.get(inner[0].file);
        const close = inner[inner.length - 1];
        if (lx && close && close.value === '>' && !inner[0].fromMacro) name = lx.text.slice(inner[0].end, close.start);
        else name = inner.slice(1, -1).map(spell).join('');
      }
      const found = name ? this.resolveInclude(name, angled, rec.file) : null;
      return { value: found || (name && this.builtin[name] !== undefined) ? 1 : 0, end: q };
    }
    if (t.value === '__has_cpp_attribute' || t.value === '__has_c_attribute') {
      const nm = inner.map(spell).join('');
      const std = { noreturn: 200809, deprecated: 201309, fallthrough: 201603, nodiscard: 201907, maybe_unused: 201603, likely: 201803, unlikely: 201803, no_unique_address: 201803, carries_dependency: 200809 };
      return { value: std[nm] || 0, end: q };
    }
    return { value: 0, end: q };
  }

  // --------------------------------------------- #define / #undef

  doDefine(rec, line, nameTok) {
    const nt = line[0];
    if (!nt) { this.diag('error', 'pp-define-no-name', 'Macro name missing in #define', rec); return; }
    if (nt.kind !== 'identifier' && nt.kind !== 'keyword') {
      this.diag('error', 'pp-define-invalid-name', 'Macro names must be identifiers', nt);
      return;
    }
    if (nt.value === 'defined' || (this.cpp && nt.value === '__has_include')) {
      this.diag('error', 'pp-define-defined', `"${nt.value}" cannot be used as a macro name`, nt);
      return;
    }
    const def = {
      name: nt.value, kind: 'object', params: [], variadic: false, vaName: null, body: [],
      file: rec.file, line: nt.line, col: nt.col, directive: rec,
      predefined: !!(this.defineFlags && this.defineFlags.predefined),
      commandLine: !!(this.defineFlags && this.defineFlags.commandLine),
      builtin: null, usesStringify: false, usesPaste: false, usesVaOpt: false,
      undef: null, expansionCount: 0, id: this.macroDefs.length, paramIndex: new Map(),
      isKeyword: nt.kind === 'keyword',
    };
    let k = 1;
    if (line[1] && line[1].kind === 'punct' && line[1].value === '(' && !line[1].space) {
      def.kind = 'function';
      k = 2;
      let ok = false;
      let expectParam = true;
      while (k < line.length) {
        const p = line[k];
        if (p.value === ')' && p.kind === 'punct') { ok = !expectParam || def.params.length === 0; k++; break; }
        if (expectParam && p.value === '...' && p.kind === 'punct') {
          def.variadic = true;
          def.vaName = '__VA_ARGS__';
          expectParam = false;
          k++;
          if (!line[k] || line[k].value !== ')') break;
          continue;
        }
        if (expectParam && (p.kind === 'identifier' || p.kind === 'keyword')) {
          if (def.paramIndex.has(p.value)) {
            this.diag('error', 'pp-duplicate-param', `Duplicate macro parameter "${p.value}"`, p);
          }
          if (line[k + 1] && line[k + 1].value === '...') {
            def.variadic = true;
            def.vaName = p.value;
            def.params.push(p.value);
            def.paramIndex.set(p.value, def.params.length - 1);
            expectParam = false;
            k += 2;
            if (!line[k] || line[k].value !== ')') break;
            continue;
          }
          if (p.value === '__VA_ARGS__') this.diag('warning', 'pp-va-args-param', '__VA_ARGS__ used as a parameter name', p);
          def.params.push(p.value);
          def.paramIndex.set(p.value, def.params.length - 1);
          expectParam = false;
          k++;
          continue;
        }
        if (!expectParam && p.value === ',' && p.kind === 'punct') { expectParam = true; k++; continue; }
        break;
      }
      if (!ok) {
        this.diag('error', 'pp-define-bad-params', `Invalid parameter list in definition of "${def.name}"`, nt);
        return;
      }
      if (def.variadic && def.vaName === '__VA_ARGS__') def.paramIndex.set('__VA_ARGS__', def.params.length);
    } else if (line[1] && !line[1].space) {
      this.diag('warning', 'pp-define-missing-space', `Missing whitespace after the macro name "${def.name}"`, line[1]);
    }
    const body = [];
    for (let q = k; q < line.length; q++) {
      const b = line[q];
      body.push(b.bol ? { ...b, bol: false } : b);
    }
    if (body.length) body[0] = { ...body[0], space: false };
    def.body = body;
    for (let q = 0; q < body.length; q++) {
      const b = body[q];
      if (b.kind !== 'punct' && b.kind !== 'identifier' && b.kind !== 'keyword') continue;
      if (b.value === '##' && b.kind === 'punct') {
        def.usesPaste = true;
        if (q === 0 || q === body.length - 1) {
          this.diag('error', 'pp-paste-at-edge', "'##' cannot appear at either end of a macro expansion", b);
        }
      } else if (b.value === '#' && b.kind === 'punct' && def.kind === 'function') {
        def.usesStringify = true;
        const nx = body[q + 1];
        if (!nx || !(def.paramIndex.has(nx.value) || nx.value === '__VA_OPT__')) {
          this.diag('error', 'pp-stringify-non-param', "'#' is not followed by a macro parameter", b);
        }
      } else if (b.value === '__VA_OPT__') {
        def.usesVaOpt = true;
        if (!def.variadic) this.diag('error', 'pp-va-opt-non-variadic', '__VA_OPT__ can only appear in a variadic macro', b);
      } else if (b.value === '__VA_ARGS__' && !(def.variadic && def.vaName === '__VA_ARGS__')) {
        this.diag('warning', 'pp-va-args-misuse', '__VA_ARGS__ can only appear in a variadic macro', b);
      }
    }
    if (def.predefined && def.body.length === 1 && def.body[0].value === def.name && /^__\w+__$/.test(def.name) && BUILTIN_NAMES.has(def.name)) {
      def.builtin = def.name;
      def.body = [];
    }
    const prev = this.macros.get(def.name);
    if (prev) {
      def.redefines = prev;
      if (!sameDefinition(prev, def)) {
        this.diag('warning', 'pp-macro-redefined', `"${def.name}" redefined`, nt);
        def.incompatibleRedefinition = true;
      }
      if (prev.predefined || prev.builtin) def.redefinesPredefined = true;
    }
    rec.macro = def.name;
    rec.def = def;
    this.macros.set(def.name, def);
    this.macroDefs.push(def);
  }

  doUndef(rec, line) {
    const nt = line[0];
    if (!nt || (nt.kind !== 'identifier' && nt.kind !== 'keyword')) {
      this.diag('error', 'pp-undef-no-name', 'Macro name missing in #undef', rec);
      return;
    }
    if (line.length > 1) this.diag('warning', 'pp-extra-tokens', 'Extra tokens at end of #undef directive', line[1]);
    rec.macro = nt.value;
    const prev = this.macros.get(nt.value);
    rec.wasDefined = !!prev;
    if (prev) {
      prev.undef = { file: rec.file, line: rec.line, col: rec.col, directive: rec };
      rec.def = prev;
      if (prev.predefined || prev.builtin) rec.undefinesPredefined = true;
      this.macros.delete(nt.value);
    }
  }

  // --------------------------------------------- #include

  doInclude(rec, line, nameTok, lx, depth) {
    let name = null, angled = false, viaMacro = false;
    let toks = line;
    if (!toks.length) {
      this.diag('error', 'pp-include-invalid', `#${rec.name} expects "FILENAME" or <FILENAME>`, rec);
      rec.invalid = true;
      return;
    }
    const parseName = (ts, fromSource) => {
      if (ts[0].kind === 'string' && !ts[0].prefix) return { name: literalParts(ts[0]).body, angled: false, rest: ts.slice(1) };
      if (ts[0].kind === 'punct' && ts[0].value === '<') {
        let q = 1;
        while (q < ts.length && !(ts[q].kind === 'punct' && ts[q].value === '>')) q++;
        if (q >= ts.length) return null;
        let nm;
        if (fromSource) nm = lx.text.slice(ts[0].end, ts[q].start);
        else nm = ts.slice(1, q).map((x, idx) => (idx > 0 && x.space ? ' ' : '') + spell(x)).join('');
        return { name: nm, angled: true, rest: ts.slice(q + 1) };
      }
      return null;
    };
    let got = parseName(toks, true);
    if (!got) {
      const ex = this.expandList(toks);
      viaMacro = true;
      got = ex.length ? parseName(ex, false) : null;
    }
    if (!got || !got.name) {
      this.diag('error', 'pp-include-invalid', `#${rec.name} expects "FILENAME" or <FILENAME>`, rec);
      rec.invalid = true;
      return;
    }
    name = got.name;
    angled = got.angled;
    if (got.rest.length) this.diag('warning', 'pp-extra-tokens', `Extra tokens at end of #${rec.name} directive`, got.rest[0]);
    const inc = {
      file: rec.file, line: rec.line, col: rec.col, name, angled, viaMacro, resolved: null, kind: 'missing',
      precededByCode: !!(this.fileState && this.fileState.sawCode), depth: depth + 1, directive: rec,
    };
    rec.include = inc;
    rec.headerName = name;
    rec.angled = angled;
    this.includes.push(inc);
    if (/\\|'|"|\/\*|\/\//.test(name)) inc.suspiciousChars = true;
    if (depth + 1 > this.maxDepth) {
      this.diag('error', 'pp-include-depth', `#include nested too deeply (${depth + 1})`, rec);
      return;
    }
    const resolved = this.resolveInclude(name, angled, rec.file);
    if (resolved) {
      inc.resolved = resolved;
      inc.kind = 'project';
      const f = this.files.get(resolved);
      this.enterInclude(resolved, f.text || '', f.lang, inc, rec, depth);
      return;
    }
    if (this.builtin[name] !== undefined) {
      const path = '<builtin>/' + name;
      inc.resolved = path;
      inc.kind = 'builtin';
      inc.system = true;
      this.enterInclude(path, this.builtin[name], this.lang, inc, rec, depth);
      return;
    }
    inc.system = angled;
    this.diag(angled ? 'info' : 'warning', 'pp-include-not-found', `Cannot find include file ${angled ? '<' + name + '>' : '"' + name + '"'}`, rec);
  }

  enterInclude(path, text, lang, inc, rec, depth) {
    if (this.onceFiles.has(path) || rec.variant === 'import' && this.sources.has(path)) { inc.skipped = 'pragma-once'; return; }
    const lx = this.getLexed(path, text, this.lang);
    if (lx.guard && this.macros.has(lx.guard.macro) && this.sources.has(path)) { inc.skipped = 'guard'; return; }
    const stackDepth = this.includeStack || (this.includeStack = []);
    if (stackDepth.includes(path) && stackDepth.length > 32) {
      this.diag('error', 'pp-include-recursion', `Recursive #include of ${path}`, rec);
      return;
    }
    stackDepth.push(path);
    this.processFile(path, lx, depth + 1);
    stackDepth.pop();
  }

  resolveInclude(name, angled, fromFile) {
    const files = this.files;
    const n = normPath(name);
    if (!angled && fromFile && !fromFile.startsWith('<')) {
      const dir = posix.dirname(normPath(fromFile));
      const c = normPath(dir === '.' ? n : dir + '/' + n);
      if (files.has(c)) return c;
    }
    for (const d of this.includeDirs) {
      const c = normPath(d === '.' || d === '' ? n : d + '/' + n);
      if (files.has(c)) return c;
    }
    if (files.has(n)) return n;
    if (angled && this.builtin[name] !== undefined) return null;
    // last resort: any project file whose path ends with the include name
    const suffix = '/' + n;
    let best = null;
    for (const p of files.keys()) {
      if (p.endsWith(suffix) && (best === null || p.length < best.length)) best = p;
    }
    return best;
  }

  // ------------------------------------------------------------ result

  result() {
    const headerGuards = new Map();
    for (const [file, lx] of this.sources) {
      if (file.startsWith('<')) continue;
      const g = lx.guard;
      headerGuards.set(file, { file, macro: g ? g.macro : null, pragmaOnce: this.onceFiles.has(file), guarded: !!g || this.onceFiles.has(file), ifLine: g ? g.ifLine : 0, endifLine: g ? g.endifLine : 0 });
    }
    const comments = [];
    const trigraphs = [];
    for (const lx of this.sources.values()) {
      for (const c of lx.comments) comments.push(c);
      for (const t of lx.trigraphs) trigraphs.push(t);
    }
    return {
      tokens: this.out,
      directives: this.directives,
      macros: this.macros,
      macroDefs: this.macroDefs.filter((d) => !d.predefined),
      allMacroDefs: this.macroDefs,
      expansions: this.expansions,
      includes: this.includes,
      diagnostics: this.diagnostics,
      undefInIf: this.undefInIf,
      pragmas: this.pragmas,
      skipped: this.skipped,
      headerGuards,
      sources: this.sources,
      files: this.fileOrder,
      comments,
      trigraphs,
    };
  }
}

const KNOWN_DIRECTIVES = new Set(['define', 'undef', 'include', 'include_next', 'import', 'error', 'warning', 'pragma', 'line', 'ident', 'sccs', 'assert', 'unassert', 'embed']);
const BUILTIN_NAMES = new Set(['__FILE__', '__LINE__', '__COUNTER__', '__DATE__', '__TIME__', '__INCLUDE_LEVEL__', '__BASE_FILE__', '__FILE_NAME__', '__TIMESTAMP__']);
const HAS_OPS = new Set(['__has_include', '__has_include_next', '__has_attribute', '__has_cpp_attribute', '__has_c_attribute', '__has_builtin', '__has_feature', '__has_extension', '__has_warning', '__has_declspec_attribute', '__has_embed']);

function lineEnd(toks, k, n) {
  while (k < n && !toks[k].bol) k++;
  return k;
}

function numTok(t, v) {
  return { kind: 'number', value: String(v), line: t.line, col: t.col, endLine: t.endLine, endCol: t.endCol, start: t.start, end: t.end, file: t.file, space: t.space, bol: false };
}

function painted(t) {
  if (t.noexpand) return t;
  const c = { ...t };
  c.noexpand = true;
  return c;
}

function withSpace(t, space) {
  if (!!t.space === !!space) return t;
  const c = { ...t };
  c.space = space;
  return c;
}

function copyToken(r, site, hs, macroName) {
  const c = {
    kind: r.kind, value: r.value, line: site.line, col: site.col, endLine: site.endLine, endCol: site.endCol,
    start: site.start, end: site.end, file: site.file, space: r.space, bol: false,
    fromMacro: site.macro, macro: macroName, site, hs,
    spelling: r.spelling || { file: r.file, line: r.line, col: r.col },
  };
  if (r.prefix !== undefined) c.prefix = r.prefix;
  if (r.raw) c.raw = true;
  if (r.digraph) c.digraph = r.digraph;
  if (r.alt) c.alt = r.alt;
  if (r.udSuffix) c.udSuffix = r.udSuffix;
  if (r.unterminated) c.unterminated = true;
  if (r.noexpand) c.noexpand = true;
  if (r.pasted) c.pasted = true;
  if (r.stringified) c.stringified = true;
  return c;
}

function stringify(tokens) {
  let s = '';
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.kind === 'placemarker') continue;
    if (k > 0 && s.length && (t.space || t.bol)) s += ' ';
    let v = spell(t);
    if (t.kind === 'string' || t.kind === 'char') v = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    s += v;
  }
  const f = tokens[0];
  return {
    kind: 'string', value: '"' + s + '"', prefix: '', line: f ? f.line : 0, col: f ? f.col : 0,
    endLine: f ? f.endLine : 0, endCol: f ? f.endCol : 0, start: f ? f.start : 0, end: f ? f.end : 0,
    file: f ? f.file : '', space: false, bol: false, stringified: true,
  };
}

function vaOptGroup(body, i) {
  // body[i] is __VA_OPT__, expects ( ... )
  let q = i + 1;
  if (!body[q] || body[q].value !== '(') return { tokens: [], end: i };
  let depth = 0;
  const tokens = [];
  for (; q < body.length; q++) {
    const b = body[q];
    if (b.value === '(' && b.kind === 'punct') { depth++; if (depth === 1) continue; }
    if (b.value === ')' && b.kind === 'punct') { depth--; if (depth === 0) break; }
    tokens.push(b);
  }
  return { tokens, end: q };
}

function sameDefinition(a, b) {
  if (a.kind !== b.kind || a.params.join(',') !== b.params.join(',') || a.variadic !== b.variadic) return false;
  if (a.builtin || b.builtin) return a.builtin === b.builtin;
  if (a.body.length !== b.body.length) return false;
  for (let k = 0; k < a.body.length; k++) {
    if (a.body[k].value !== b.body[k].value) return false;
    if (k > 0 && !!a.body[k].space !== !!b.body[k].space) return false;
  }
  return true;
}

// Header guard: first directive #ifndef X / #if !defined(X), then #define X,
// matching #endif is the last token of the file.
function detectGuard(toks) {
  const n = toks.length;
  if (!n || !(toks[0].bol && toks[0].value === '#')) return null;
  const l0 = lineEnd(toks, 1, n);
  const d0 = toks.slice(1, l0);
  let macro = null;
  if (d0[0] && d0[0].value === 'ifndef' && d0[1] && d0.length === 2) macro = d0[1].value;
  else if (d0[0] && d0[0].value === 'if') {
    const r = d0.slice(1).map((t) => t.value).join(' ');
    const m = /^! defined (?:\( )?([A-Za-z_]\w*)(?: \))?$/.exec(r);
    if (m) macro = m[1];
  }
  if (!macro) return null;
  if (!(toks[l0] && toks[l0].value === '#')) return null;
  const l1 = lineEnd(toks, l0 + 1, n);
  const d1 = toks.slice(l0 + 1, l1);
  if (!(d1[0] && d1[0].value === 'define' && d1[1] && d1[1].value === macro)) return null;
  let depth = 0;
  let k = 0;
  while (k < n) {
    const e = lineEnd(toks, k + 1, n);
    if (toks[k].bol && toks[k].value === '#' && toks[k + 1] && k + 1 < e) {
      const nm = toks[k + 1].value;
      if (nm === 'if' || nm === 'ifdef' || nm === 'ifndef') depth++;
      else if (nm === 'endif') {
        depth--;
        if (depth === 0) {
          if (e === n) return { macro, ifLine: toks[0].line, endifLine: toks[k].line };
          return null;
        }
      }
    }
    k = e;
  }
  return null;
}

// ----------------------------------------------------------------- #if

const BIN_PREC = {
  '*': 10, '/': 10, '%': 10, '+': 9, '-': 9, '<<': 8, '>>': 8, '<': 7, '>': 7, '<=': 7, '>=': 7,
  '==': 6, '!=': 6, '&': 5, '^': 4, '|': 3, '&&': 2, '||': 1,
};

class IfError extends Error {}

class IfEvaluator {
  constructor(tokens, pp, rec) {
    this.t = tokens;
    this.p = 0;
    this.pp = pp;
    this.rec = rec;
  }

  fail(msg, at) {
    throw new IfError(msg + (at ? '' : ''));
  }

  run() {
    try {
      const v = this.comma(true);
      if (this.p < this.t.length) this.fail(`Missing binary operator before token "${spell(this.t[this.p])}"`);
      return { v: v.v, u: v.u, ok: true };
    } catch (e) {
      if (!(e instanceof IfError)) throw e;
      const at = this.t[Math.min(this.p, this.t.length - 1)] || this.rec;
      this.pp.diag('error', 'pp-if-syntax', `Invalid #${this.rec.kind} expression: ${e.message}`, at.line ? at : this.rec);
      return { v: 0n, u: false, ok: false };
    }
  }

  peek() { return this.t[this.p]; }
  isOp(v) { const x = this.t[this.p]; return x && x.kind === 'punct' && x.value === v; }

  comma(ev) {
    let v = this.cond(ev);
    while (this.isOp(',')) { this.p++; v = this.cond(ev); }
    return v;
  }

  cond(ev) {
    const c = this.binary(1, ev);
    if (!this.isOp('?')) return c;
    this.p++;
    const take = c.v !== 0n;
    const a = this.comma(ev && take);
    if (!this.isOp(':')) this.fail("Expected ':' in conditional expression");
    this.p++;
    const b = this.cond(ev && !take);
    const u = a.u || b.u;
    const r = take ? a : b;
    return { v: wrap(r.v, u), u };
  }

  binary(min, ev) {
    let l = this.unary(ev);
    for (;;) {
      const x = this.t[this.p];
      if (!x || x.kind !== 'punct') return l;
      const prec = BIN_PREC[x.value];
      if (prec === undefined || prec < min) return l;
      this.p++;
      const op = x.value;
      let evR = ev;
      if (op === '&&') evR = ev && l.v !== 0n;
      if (op === '||') evR = ev && l.v === 0n;
      const r = this.binary(prec + 1, evR);
      l = this.apply(op, l, r, evR, x);
    }
  }

  apply(op, l, r, ev, at) {
    const u = l.u || r.u;
    const A = u ? BigInt.asUintN(64, l.v) : l.v;
    const B = u ? BigInt.asUintN(64, r.v) : r.v;
    switch (op) {
      case '*': return { v: wrap(A * B, u), u };
      case '/': case '%':
        if (B === 0n) {
          if (ev) this.pp.diag('error', 'pp-if-div-zero', `Division by zero in #${this.rec.kind}`, at);
          return { v: 0n, u };
        }
        return { v: wrap(op === '/' ? A / B : A % B, u), u };
      case '+': return { v: wrap(A + B, u), u };
      case '-': return { v: wrap(A - B, u), u };
      case '<<': return { v: wrap(B >= 64n || B < 0n ? 0n : A << B, l.u), u: l.u };
      case '>>': return { v: wrap(B >= 64n || B < 0n ? (A < 0n ? -1n : 0n) : A >> B, l.u), u: l.u };
      case '<': return bool(A < B);
      case '>': return bool(A > B);
      case '<=': return bool(A <= B);
      case '>=': return bool(A >= B);
      case '==': return bool(A === B);
      case '!=': return bool(A !== B);
      case '&': return { v: wrap(A & B, u), u };
      case '^': return { v: wrap(A ^ B, u), u };
      case '|': return { v: wrap(A | B, u), u };
      case '&&': return bool(l.v !== 0n && r.v !== 0n);
      case '||': return bool(l.v !== 0n || r.v !== 0n);
      default: this.fail(`Unknown operator ${op}`);
    }
    return bool(false);
  }

  unary(ev) {
    const x = this.t[this.p];
    if (!x) this.fail('Unexpected end of expression');
    if (x.kind === 'punct') {
      switch (x.value) {
        case '+': this.p++; return this.unary(ev);
        case '-': { this.p++; const v = this.unary(ev); return { v: wrap(-v.v, v.u), u: v.u }; }
        case '~': { this.p++; const v = this.unary(ev); return { v: wrap(~v.v, v.u), u: v.u }; }
        case '!': { this.p++; const v = this.unary(ev); return bool(v.v === 0n); }
        case '(': {
          this.p++;
          const v = this.comma(ev);
          if (!this.isOp(')')) this.fail("Missing ')' in expression");
          this.p++;
          return v;
        }
        default: break;
      }
    }
    this.p++;
    if (x.kind === 'number') {
      const c = classifyNumber(x.value, { lang: this.pp.lang });
      if (c.kind === 'float') this.fail('Floating constant in preprocessor expression');
      if (c.kind !== 'int') this.fail(c.error || `Invalid number "${x.value}"`);
      let u = /u/i.test(c.suffix);
      if (!u && c.value > 0x7fffffffffffffffn) u = true;
      return { v: wrap(c.value, u), u };
    }
    if (x.kind === 'char') {
      const parts = literalParts(x);
      const d = decodeEscapes(parts.body);
      let v = 0n;
      if (d.codes.length === 1) {
        v = BigInt(d.codes[0]);
        if (!parts.prefix && this.pp.target.charSigned !== false && v > 127n && v < 256n) v -= 256n;
      } else for (const cp of d.codes) v = (v << 8n) | BigInt(cp & 0xff);
      return { v, u: false };
    }
    this.p--;
    this.fail(`Token "${spell(x)}" is not valid in preprocessor expressions`);
    return bool(false);
  }
}

function wrap(v, u) { return u ? BigInt.asUintN(64, v) : BigInt.asIntN(64, v); }
function bool(b) { return { v: b ? 1n : 0n, u: false }; }

function preprocess(text, opts = {}) {
  const pp = new Preprocessor(opts);
  try {
    return pp.run(normPath(opts.file || '<input>'), String(text == null ? '' : text));
  } catch (e) {
    pp.diag('error', 'pp-internal', `Internal preprocessor error: ${e && e.message}`, null);
    return pp.result();
  }
}

module.exports = { preprocess, Preprocessor, detectGuard, normPath, toFileMap, stringify };
