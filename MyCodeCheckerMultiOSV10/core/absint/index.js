'use strict';

// Deep semantic analyzer for C/C++ (abstract interpretation with function
// summaries). Contract: core/ENGINE_CONTRACT.md. Rule keys 'absint:<CHECKER>'.
//
// Pipeline: parse once (core/cfront.projectFor, shared with the other C/C++
// engines) -> call graph SCCs bottom-up -> per function: abstract
// interpretation over the CFG (interp.js / eval.js / calls.js / checks.js)
// producing findings and a summary for its callers -> AST checkers
// (syntax.js) -> project-wide statistical checkers (CHECKED_RETURN,
// MISSING_LOCK, ORDER_REVERSAL).

const { projectFor } = require('../cfront');
const cf = require('../cfamily');
const { FnAnalyzer } = require('./interp');
require('./eval');
require('./calls');
require('./checks');
const { runSyntax } = require('./syntax');
const { runSyntax2, classFacts } = require('./syntax2');
const { classLevel, stackUse, fileLevel } = require('./project2');
const { catalog, BY_CHECKER } = require('./catalog');
const { compileUserModels, MUST_CHECK } = require('./models');
const { ClassIndex, joinSummaries } = require('./classes');
const { runCpp, runDontCall, classChecks } = require('./cpp');

const T = cf.types;

const DEFAULTS = {
  k: 8, // states per program point before joining
  functionMs: 200, // time budget per function
  totalMs: 15000, // time budget per analysis
  maxSteps: 40000, // worklist steps + replayed states per function
  widenAfter: 3, // loop header visits before widening
  maxFunctionNodes: 40000, // skip giant generated functions
  allocNull: false, // report NULL_RETURNS for unchecked malloc/calloc/realloc/strdup results
  stackLimit: 65536, // STACK_USE: bytes of stack per function / call chain
};

// Return-value statistics: functions whose result is not interesting.
const CR_SKIP = new Set(['printf', 'fprintf', 'sprintf', 'snprintf', 'vprintf', 'vfprintf', 'vsprintf', 'vsnprintf', 'puts', 'fputs',
  'putchar', 'fputc', 'putc', 'memcpy', 'memmove', 'memset', 'strcpy', 'strncpy', 'strcat', 'strncat', 'fflush', 'fclose', 'close',
  'free', 'wprintf', 'dprintf', 'syslog', 'perror', 'signal', 'time', 'umask', 'setlocale', 'std::move', 'move', 'std::forward', 'swap']);
const CR_ALWAYS = new Set(['setuid', 'setgid', 'seteuid', 'setegid', 'setreuid', 'setresuid', 'chroot']);

class Engine {
  constructor(project, files, opts, models) {
    this.project = project;
    this.opts = opts;
    this.models = models || [];
    this.userFiles = new Set(files.map((f) => f.path));
    this.summaries = new Map();
    this.defined = new Set();
    this.declKey = new Map();
    this.throwsOf = new Map(); // function key -> { ev } when an exception can escape it
    this.extraFindings = [];
    this.callLocks = new Map();
    this.symMaps = new Map();
    this.modelCache = new Map();
    this.internalErrors = 0;
    this.aborted = [];
    this.debug = !!opts.debug;
    this.analyzers = [];
    this.classFactsList = [];
    this.stats = { functions: 0, aborted: 0, ms: 0 };
  }

  symById(unit, id) {
    let m = this.symMaps.get(unit);
    if (!m) {
      m = new Map();
      for (const s of unit.symbols || []) m.set(s.id, s);
      this.symMaps.set(unit, m);
    }
    return m.get(id) || null;
  }

  userModels(lang) {
    if (!this.modelCache.has(lang)) this.modelCache.set(lang, compileUserModels(this.models, lang));
    return this.modelCache.get(lang);
  }

  keyForSym(sym, unit) {
    if (!sym) return null;
    if (sym.definition && this.declKey.has(sym.definition)) return this.declKey.get(sym.definition);
    for (const d of sym.decls || []) if (this.declKey.has(d)) return this.declKey.get(d);
    if (!sym.qname) return null;
    return cf.functionKey(sym, unit.lang ? unit : { file: unit.file, lang: cf.langOf(unit.file || '') });
  }

  summaryFor(sym, unit, fname) {
    const k = sym ? this.keyForSym(sym, unit) : fname;
    return (k && this.summaries.get(k)) || null;
  }

  // The call graph only knows the static target of a virtual call: analyse
  // the overriders before the functions that call through the base.
  virtualOrder(order) {
    if (!this.project.units.some((u) => u.lang === 'cpp')) return order;
    const ci = this.classIndex();
    let anyVirtual = false;
    for (const c of ci.classes.values()) { for (const l of c.methods.values()) if (l.some((m) => m.sym.isVirtual)) { anyVirtual = true; break; } if (anyVirtual) break; }
    if (!anyVirtual) return order;
    const byFn = new Map(order.map((it) => [it.fn, it]));
    const out = [];
    const state = new Map();
    const visit = (it, depth) => {
      if (state.has(it.fn) || depth > 200) return;
      state.set(it.fn, 1);
      cf.walk(it.fn.body, (n) => {
        if (n.type !== 'CallExpr') return undefined;
        const s = n.calleeSymbol;
        if (!s || !s.member || !ci.isVirtual(s)) return undefined;
        for (const t of ci.overriders(s)) { const d = t.def && byFn.get(t.def); if (d && d !== it) visit(d, depth + 1); }
        return undefined;
      });
      out.push(it);
    };
    for (const it of order) visit(it, 0);
    return out;
  }

  classIndex() {
    if (!this.classes) this.classes = new ClassIndex(this.project);
    return this.classes;
  }

  // Summary of a virtual call: the join of every overrider's summary, or null
  // when one of them has not been analysed (unknown call).
  virtualSummary(sym, unit) {
    const targets = this.classIndex().overriders(sym);
    const list = [];
    for (const t of targets) {
      if (!t.def) continue;
      const S = this.summaryFor(t.sym, t.unit || unit, null);
      if (!S) return null;
      list.push(S);
    }
    if (!list.length) return null;
    const S = joinSummaries(list, `virtual:${this.keyForSym(sym, unit)}`);
    if (list.some((x) => this.throwsOf.has(x.key))) S.throws = true;
    return S;
  }

  hasBody(sym, fname, unit) {
    if (!sym) return false;
    if (sym.system) return false;
    const k = this.keyForSym(sym, unit || { file: sym.file });
    return this.defined.has(k) || this.defined.has(fname);
  }

  run() {
    const start = Date.now();
    this.deadline = start + this.opts.totalMs;
    const unitsByFile = new Map(this.project.units.map((u) => [u.file, u]));
    const cg = this.project.callGraph;
    const order = [];
    const seenFn = new Set();
    if (cg && cg.nodes) {
      for (const n of cg.nodes.values()) {
        for (const d of n.definitions || []) this.declKey.set(d.node, n.key);
        if (n.defined) this.defined.add(n.key);
      }
      let sccs = [];
      try { sccs = cg.sccs(); } catch { sccs = [...cg.nodes.keys()].map((k) => [k]); }
      for (const scc of sccs) {
        for (const key of scc) {
          const n = cg.nodes.get(key);
          if (!n || !n.defined) continue;
          const d = (n.definitions || [])[0];
          if (!d || !d.node || seenFn.has(d.node)) continue;
          const unit = d.unitRef || unitsByFile.get(d.unit);
          if (!unit) continue;
          seenFn.add(d.node);
          order.push({ fn: d.node, unit, key });
        }
      }
    }
    // functions outside the call graph (methods defined in classes, lambdas' owners ...)
    for (const unit of this.project.units) {
      let fns = [];
      try { fns = cf.functionsOf(unit); } catch { fns = []; }
      for (const fn of fns) {
        if (seenFn.has(fn) || !fn.body) continue;
        seenFn.add(fn);
        order.push({ fn, unit, key: this.declKey.get(fn) || `${unit.file}#${fn.qname || fn.name}@${fn.loc.line}` });
      }
    }
    const findings = [];
    const doneLoc = new Set();
    for (const item of this.virtualOrder(order)) {
      const { fn, unit, key } = item;
      const file = fn.loc && fn.loc.file;
      if (!file || file.startsWith('<') || !this.userFiles.has(file)) continue;
      const lk = `${file}:${fn.loc.start}`;
      if (doneLoc.has(lk) || fn.loc.macro) continue;
      doneLoc.add(lk);
      if (Date.now() > this.deadline) { this.stats.aborted++; continue; }
      // A function the parser had to recover in has a truncated body: skip it.
      if (this.hasParseError(unit, fn)) { this.stats.skipped = (this.stats.skipped || 0) + 1; continue; }
      let an;
      try {
        an = new FnAnalyzer(this, unit, fn, key);
      } catch (err) {
        if (this.debug) throw err;
        this.internalErrors++;
        continue;
      }
      this.stats.functions++;
      let res = { findings: [], aborted: true };
      const big = countNodes(fn.body, this.opts.maxFunctionNodes) >= this.opts.maxFunctionNodes;
      if (big) an.aborted = true;
      if (!big) {
        try {
          res = an.run();
        } catch (err) {
          if (this.debug) throw err;
          this.internalErrors++;
          res = { findings: [], aborted: true };
        }
      }
      if (res.aborted) { this.stats.aborted++; this.aborted.push(an.name); }
      else if (an.summary) this.summaries.set(key, an.summary);
      try { runSyntax(an); } catch (err) { if (this.debug) throw err; this.internalErrors++; }
      try { runSyntax2(an); this.classFactsList.push(classFacts(an)); } catch (err) { if (this.debug) throw err; this.internalErrors++; }
      try { runDontCall(an); if (unit.lang === 'cpp') runCpp(an); } catch (err) { if (this.debug) throw err; this.internalErrors++; }
      an.IN = null;
      this.analyzers.push(an);
    }
    this.checkedReturn();
    try { classChecks(this, (node, checker, message) => this.directReport(node, checker, message)); } catch (err) { if (this.debug) throw err; this.internalErrors++; }
    this.missingLock();
    this.orderReversal();
    try { classLevel(this); } catch (err) { if (this.debug) throw err; this.internalErrors++; }
    try { stackUse(this); } catch (err) { if (this.debug) throw err; this.internalErrors++; }
    try { fileLevel(this); } catch (err) { if (this.debug) throw err; this.internalErrors++; }
    for (const an of this.analyzers) {
      const list = an.aborted ? an.findings.filter((f) => SYNTAX_ONLY.has(f.checker) || f.projectLevel) : an.findings;
      for (const f of list) findings.push(f);
    }
    for (const f of this.extraFindings) findings.push(f);
    this.stats.ms = Date.now() - start;
    const out = [];
    const seen = new Set();
    // a newer, narrower checker gives way to the established one at the same line
    const atLine = new Set(findings.map((f) => `${f.checker}|${f.file}|${f.line}`));
    for (const f of findings) {
      const k = `${f.rule}|${f.file}|${f.line}|${f.message.en}`;
      if (seen.has(k)) continue;
      if (YIELDS[f.checker] && atLine.has(`${YIELDS[f.checker]}|${f.file}|${f.line}`)) continue;
      seen.add(k);
      out.push(f);
    }
    out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.column || 0) - (b.column || 0)));
    return out;
  }

  // NULL_RETURNS for project functions is statistical (as in Defect Analysis): the
  // result must be null-checked at some call sites before an unchecked
  // dereference elsewhere is reported.
  nullRetOk(nret) {
    if (!nret || !nret.key) return true;
    if (!this.nullStats) this.computeNullStats();
    const s = this.nullStats.get(nret.key);
    return !!s && s.checked >= 1 && s.checked * 2 >= s.total;
  }

  computeNullStats() {
    this.nullStats = new Map();
    for (const unit of this.project.units) {
      let fns = [];
      try { fns = cf.functionsOf(unit); } catch { fns = []; }
      for (const fn of fns) {
        if (!fn.body || !fn.loc || !this.userFiles.has(fn.loc.file)) continue;
        const assigned = [];
        cf.walk(fn.body, (n) => {
          let call = null, sym = null;
          if (n.type === 'AssignExpr' && n.op === '=') {
            call = cf.skipParens(n.right);
            const l = cf.skipParens(n.left);
            sym = l && l.type === 'Identifier' ? l.symbol : null;
          } else if (n.type === 'VarDecl' && n.init) { call = cf.skipParens(n.init); sym = n.symbol; }
          while (call && call.type === 'CastExpr' && call.arg) call = cf.skipParens(call.arg);
          if (!call || call.type !== 'CallExpr' || !sym) return undefined;
          const c = cf.skipParens(call.callee);
          const fs = call.calleeSymbol || (c && c.type === 'Identifier' ? c.symbol : null);
          if (!fs || fs.kind !== 'function') return undefined;
          assigned.push({ key: this.keyForSym(fs, unit), sym });
          return undefined;
        });
        if (!assigned.length) continue;
        const checked = new Set();
        const isNullLit = (e) => { e = cf.skipParens(e); while (e && e.type === 'CastExpr' && e.arg) e = cf.skipParens(e.arg); return !!e && (e.type === 'NullptrLiteral' || (e.type === 'IntegerLiteral' && Number(e.value) === 0)); };
        const symOf = (e) => { e = cf.skipParens(e); return e && e.type === 'Identifier' ? e.symbol : null; };
        const cond = (e) => {
          e = cf.skipParens(e);
          if (!e) return;
          if (e.type === 'UnaryExpr' && e.op === '!') { const s = symOf(e.arg); if (s) checked.add(s); cond(e.arg); return; }
          if (e.type === 'BinaryExpr' && (e.op === '&&' || e.op === '||')) { cond(e.left); cond(e.right); return; }
          if (e.type === 'BinaryExpr' && (e.op === '==' || e.op === '!=')) {
            if (isNullLit(e.right) && symOf(e.left)) checked.add(symOf(e.left));
            if (isNullLit(e.left) && symOf(e.right)) checked.add(symOf(e.right));
            return;
          }
          const s = symOf(e);
          if (s) checked.add(s);
        };
        cf.walk(fn.body, (n) => {
          if (n.type === 'IfStmt' || n.type === 'WhileStmt' || n.type === 'DoStmt' || n.type === 'ForStmt') cond(n.cond);
          else if (n.type === 'ConditionalExpr') cond(n.test);
          else if (n.type === 'BinaryExpr' && (n.op === '&&' || n.op === '||')) cond(n.left);
          else if (n.type === 'CallExpr') {
            const c = cf.skipParens(n.callee);
            if (c && c.type === 'Identifier' && /assert|return_if_fail|return_val_if_fail|CHECK/i.test(c.name || '')) for (const a of n.args || []) cond(a);
          }
          return undefined;
        });
        for (const a of assigned) {
          if (!a.key) continue;
          let s = this.nullStats.get(a.key);
          if (!s) { s = { total: 0, checked: 0 }; this.nullStats.set(a.key, s); }
          s.total++;
          if (checked.has(a.sym)) s.checked++;
        }
      }
    }
  }

  hasParseError(unit, fn) {
    if (!this.errorLines) this.errorLines = new Map();
    let m = this.errorLines.get(unit);
    if (!m) {
      m = [];
      for (const d of unit.diagnostics || []) if (d.severity === 'error' && /^parse-|^sema-too-deep|internal/.test(d.code || '')) m.push(d);
      this.errorLines.set(unit, m);
    }
    const l = fn.loc;
    if (m.some((d) => d.file === l.file && d.line >= l.line && d.line <= (l.endLine || l.line))) return true;
    let bad = false;
    cf.walk(fn.body, (n) => {
      if (bad) return cf.walk.STOP;
      if (n.type === 'ErrorStmt' || n.type === 'ErrorExpr' || n.type === 'ErrorDecl') bad = true;
      return undefined;
    });
    return bad;
  }

  analyzerFor(file, line) {
    for (const an of this.analyzers) {
      const l = an.fn.loc;
      if (l.file === file && line >= l.line && line <= (l.endLine || l.line)) return an;
    }
    return null;
  }

  // A finding outside any function (class-level checks).
  directReport(node, checker, message) {
    const sink = { reporting: true, quiet: 0, seen: this.directSeen || (this.directSeen = new Set()), findings: [], fn: { loc: node.loc }, name: '' };
    FnAnalyzer.prototype.report.call(sink, checker, node, message, [], {});
    for (const f of sink.findings) { delete f.function; this.extraFindings.push(f); }
  }

  projectReport(an, checker, node, message, events) {
    if (!an) return;
    const before = an.findings.length;
    an.reporting = true;
    an.report(checker, node, message, events, {});
    an.reporting = false;
    for (let i = before; i < an.findings.length; i++) an.findings[i].projectLevel = true;
  }

  // CHECKED_RETURN: the result is checked at most call sites but ignored here.
  checkedReturn() {
    const stats = new Map();
    for (const an of this.analyzers) {
      cf.walk(an.fn.body, (n) => {
        if (n.type !== 'CallExpr' || !n.loc || n.loc.file !== an.file) return undefined;
        const c = n.callee && cf.skipParens(n.callee);
        const sym = n.calleeSymbol || (c && c.type === 'Identifier' ? c.symbol : null);
        if (!sym || sym.kind !== 'function') return undefined;
        const name = sym.qname || sym.name;
        if (CR_SKIP.has(name) || CR_SKIP.has(sym.name)) return undefined;
        const ft = T.canonical(sym.type);
        if (!ft || ft.kind !== 'function') return undefined;
        const rt = T.canonical(ft.ret);
        if (!rt || rt.kind === 'void' || rt.kind === 'unknown' || rt.kind === 'reference' || T.isRecord(rt)) return undefined;
        let p = cf.parentOf(n);
        while (p && p.type === 'ParenExpr') p = cf.parentOf(p);
        let kind = 'used';
        if (p && p.type === 'ExprStmt') kind = 'ignored';
        else if (p && p.type === 'CastExpr' && T.canonical(p.ctype) && T.canonical(p.ctype).kind === 'void') kind = 'void';
        else if (p && p.type === 'BinaryExpr' && p.op === ',' && p.left === n) kind = 'ignored';
        const k = this.keyForSym(sym, an.unit) || name;
        let s = stats.get(k);
        if (!s) { s = { name: sym.name, used: 0, ignored: [], voided: 0 }; stats.set(k, s); }
        if (kind === 'used') s.used++;
        else if (kind === 'void') s.voided++;
        else s.ignored.push({ an, n });
        return undefined;
      });
    }
    for (const s of stats.values()) {
      if (!s.ignored.length) continue;
      const total = s.used + s.ignored.length;
      const always = CR_ALWAYS.has(s.name);
      if (!always && !(s.used >= 3 && s.used / total >= 0.75) && !(MUST_CHECK.has(s.name) && s.used >= 1 && s.used / total >= 0.5)) continue;
      for (const { an, n } of s.ignored.slice(0, 20)) {
        this.projectReport(an, 'CHECKED_RETURN', n, {
          en: always ? `The return value of ${s.name} is ignored; a failure here goes unnoticed.` : `The return value of ${s.name} is ignored here, but it is checked at ${s.used} of ${total} call sites.`,
          ko: always ? `${s.name}의 반환값을 무시해서 실패를 알아차리지 못합니다.` : `${s.name}의 반환값을 여기서 무시하는데, 호출 ${total}곳 중 ${s.used}곳에서는 확인합니다.`,
        }, [an.ev(n, 'check_return', `Calling ${s.name} without checking its result.`, `결과를 확인하지 않고 ${s.name}을(를) 부릅니다.`)]);
      }
    }
  }

  // MISSING_LOCK: shared variable accessed with a lock almost everywhere else.
  missingLock() {
    const byVar = new Map();
    for (const an of this.analyzers) {
      if (an.aborted) continue;
      for (const u of an.uses.values()) {
        let list = byVar.get(u.key);
        if (!list) { list = []; byVar.set(u.key, list); }
        list.push({ ...u, an });
      }
    }
    for (const list of byVar.values()) {
      if (list.length < 4) continue;
      const count = new Map();
      for (const u of list) for (const k of new Set(u.held)) count.set(k, (count.get(k) || 0) + 1);
      let best = null;
      for (const [k, c] of count) if (!best || c > best[1]) best = [k, c];
      if (!best || best[1] < 3 || best[1] / list.length < 0.75) continue;
      const [L] = best;
      const lockedFns = new Set(list.filter((u) => u.held.includes(L)).map((u) => u.fn));
      for (const u of list) {
        if (u.held.includes(L)) continue;
        if (/^(main|.*init.*|.*Init.*|.*setup.*|.*destroy.*|.*cleanup.*)$/.test(u.an.fn.name || '')) continue;
        const calls = this.callLocks.get(u.fn);
        if (calls && calls.length && calls.every((h) => h.includes(L))) continue;
        if (lockedFns.has(u.fn) && list.filter((x) => x.fn === u.fn).some((x) => x.held.includes(L)) && !u.write) continue;
        this.projectReport(u.an, 'MISSING_LOCK', u.node, {
          en: `${u.write ? 'Writing' : 'Reading'} ${u.name} without holding lock ${L}; ${best[1]} of ${list.length} accesses hold it.`,
          ko: `잠금 ${L} 없이 ${u.name}을(를) ${u.write ? '씁니다' : '읽습니다'}. 접근 ${list.length}곳 중 ${best[1]}곳은 잠금을 쥡니다.`,
        }, [u.an.ev(u.node, 'missing_lock', `Accessing ${u.name} without lock ${L}.`, `잠금 ${L} 없이 ${u.name}에 접근합니다.`)]);
      }
    }
  }

  // ORDER_REVERSAL: two global locks taken in both orders.
  orderReversal() {
    const pairs = new Map();
    for (const an of this.analyzers) {
      if (an.aborted) continue;
      for (const o of an.lockOrders) {
        if (!o.ga || !o.gb) continue;
        const k = `${o.a}\u0000${o.b}`;
        if (!pairs.has(k)) pairs.set(k, { ...o, an });
      }
    }
    for (const [k, o] of pairs) {
      const rev = pairs.get(`${o.b}\u0000${o.a}`);
      if (!rev || o.a > o.b) continue;
      void k;
      this.projectReport(rev.an, 'ORDER_REVERSAL', rev.node, {
        en: `Acquiring lock ${rev.b} while holding ${rev.a}, but ${o.an.fn.name} acquires them in the opposite order: this can deadlock.`,
        ko: `${rev.a}을(를) 쥔 채 잠금 ${rev.b}을(를) 얻는데 ${o.an.fn.name}은(는) 반대 순서로 얻어 교착 상태가 될 수 있습니다.`,
      }, [o.aev, o.ev, rev.aev, rev.ev]);
    }
  }
}

const SYNTAX_ONLY = new Set(['UNREACHABLE', 'IDENTICAL_BRANCHES', 'CONSTANT_EXPRESSION_RESULT', 'NO_EFFECT', 'MISSING_BREAK',
  'SIGN_EXTENSION', 'MIXED_ENUMS', 'COPY_PASTE_ERROR', 'SIZEOF_MISMATCH', 'UNINIT_CTOR',
  'USE_AFTER_MOVE', 'INVALIDATE_ITERATOR', 'MISMATCHED_ITERATOR', 'DELETE_VOID', 'VIRTUAL_DTOR', 'UNCAUGHT_EXCEPT', 'AUTO_CAUSES_COPY', 'PASS_BY_VALUE',
  'DC.STRING_BUFFER', 'DC.WEAK_CRYPTO', 'DC.STREAM_BUFFER', 'COPY_WITHOUT_ASSIGN', 'ASSIGN_WITHOUT_COPY',
  'UNINTENDED_INTEGER_DIVISION', 'SWAPPED_ARGUMENTS', 'UNUSED_VALUE', 'EVALUATION_ORDER', 'BAD_COMPARE', 'NESTING_INDENT_MISMATCH',
  'MISSING_COMMA', 'STRAY_SEMICOLON', 'SIZECHECK', 'BAD_SIZEOF', 'DELETE_ARRAY', 'COPY_INSTEAD_OF_MOVE', 'WRAPPER_ESCAPE']);

// checker -> established checker that reports the same defect at the same line
const YIELDS = { DELETE_ARRAY: 'ALLOC_FREE_MISMATCH', BAD_SIZEOF: 'SIZEOF_MISMATCH', ARRAY_VS_SINGLETON: 'OVERRUN' };

function countNodes(root, cap) {
  let n = 0;
  cf.walk(root, () => { n++; if (n >= cap) return cf.walk.STOP; return undefined; });
  return n;
}

function analyze(files, ctx = {}) {
  const inactive = ctx.inactive || new Set();
  const cat = catalog();
  if (cat.every((m) => inactive.has(m.key))) return [];
  const cfiles = (files || []).filter((f) => f.lang === 'c' || f.lang === 'cpp');
  if (!cfiles.length) return [];
  const options = ctx.options || {};
  const opts = { ...DEFAULTS, ...(options.absint || {}) };
  const project = projectFor(files, options.cfamily || {});
  const engine = new Engine(project, cfiles, opts, options.models);
  const found = engine.run();
  if (ctx.stats) Object.assign(ctx.stats, engine.stats, { internalErrors: engine.internalErrors });
  return found.filter((f) => !inactive.has(f.rule) && BY_CHECKER.has(f.checker));
}

module.exports = { catalog, analyze, Engine, DEFAULTS };
