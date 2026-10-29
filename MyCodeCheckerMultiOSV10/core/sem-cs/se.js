'use strict';

// Symbolic execution over the CFG, in the style of .NET reference analyzer's engine.
// A program state maps variables (locals, parameters, this-class fields) to
// symbolic values; constraints on values (null / not-null, true / false,
// numeric interval, collection empty / not-empty, disposed) are learned from
// assignments, checks and dereferences. Boolean values carry implications so
// `var ok = x != null; if (ok) x.Foo();` is understood.
//
// Findings: null dereference, Nullable<T>.Value on null, empty collection
// access, dispose twice, use after dispose, disposable not disposed, division
// by zero, lock not released, conditions always true/false (and the
// unreachable branch they cause).

const { buildCFG } = require('./cfg');
const { unparen, callName, callTarget, dotted, text: nodeText } = require('./ast');
const { forEachChild } = require('./ast');
const T = require('./types');

const MAX_STEPS = 6000;
const MAX_STATES_PER_BLOCK = 48;
const MAX_OUTCOMES = 24;
const LOOP_WIDEN_AFTER = 2;

const NULLV = 1; const TRUEV = 2; const FALSEV = 3; const THISV = 4; const SHORTNULLV = 5;
const BASE_CONS = new Map([[NULLV, { n: 'null' }], [TRUEV, { b: true }], [FALSEV, { b: false }], [THISV, { n: 'nn' }], [SHORTNULLV, { n: 'null' }]]);

const COLL_ADD = new Set(['Add', 'Insert', 'Push', 'Enqueue', 'TryAdd', 'AddFirst', 'AddLast', 'AddOrUpdate', 'GetOrAdd', 'Append']);
const COLL_UNKNOWN = new Set(['AddRange', 'InsertRange', 'Remove', 'RemoveAt', 'RemoveAll', 'RemoveRange', 'RemoveWhere', 'UnionWith', 'IntersectWith',
  'ExceptWith', 'SymmetricExceptWith', 'TryDequeue', 'TryPop', 'TryTake', 'TryRemove', 'Pop', 'Dequeue', 'RemoveFirst', 'RemoveLast', 'Sort', 'Reverse']);
const COLL_ACCESS = new Set(['First', 'Last', 'Single', 'ElementAt', 'Max', 'Min', 'Aggregate', 'Peek', 'Pop', 'Dequeue', 'RemoveAt', 'Average']);
const DISPOSE_NAMES = new Set(['Dispose', 'Close', 'DisposeAsync']);
const DISPOSED_OK = new Set(['Dispose', 'Close', 'DisposeAsync', 'IsDisposed', 'GetType', 'ToString', 'GetHashCode', 'Equals', 'ToArray', 'Disposing']);
const NN_RESULT = new Set(['ToString', 'Trim', 'TrimStart', 'TrimEnd', 'ToUpper', 'ToLower', 'ToUpperInvariant', 'ToLowerInvariant', 'Substring',
  'Replace', 'Split', 'ToList', 'ToArray', 'ToDictionary', 'ToHashSet', 'Where', 'Select', 'SelectMany', 'OrderBy', 'OrderByDescending', 'ThenBy',
  'ThenByDescending', 'GroupBy', 'Distinct', 'Concat', 'Skip', 'Take', 'Cast', 'OfType', 'Reverse', 'PadLeft', 'PadRight', 'GetType', 'Insert',
  'Normalize', 'AsEnumerable', 'AsQueryable', 'Zip', 'Union', 'Intersect', 'Except', 'DefaultIfEmpty', 'Append', 'Prepend', 'Chunk', 'ToLookup']);
const STATIC_NN = new Set(['string.Format', 'String.Format', 'string.Concat', 'String.Concat', 'string.Join', 'String.Join', 'Path.Combine',
  'Enumerable.Range', 'Enumerable.Repeat', 'Guid.NewGuid', 'DateTime.Now', 'Environment.NewLine']);
const EMPTY_FACTORY = new Set(['Array.Empty', 'Enumerable.Empty', 'ImmutableList.Empty', 'ImmutableArray.Empty']);
const LOCK_ACQ = { 'Monitor.Enter': 'Monitor', WaitOne: 'Mutex', EnterReadLock: 'ReadLock', EnterWriteLock: 'WriteLock', EnterUpgradeableReadLock: 'UpgradeableReadLock' };
const LOCK_REL = { 'Monitor.Exit': 'Monitor', ReleaseMutex: 'Mutex', ExitReadLock: 'ReadLock', ExitWriteLock: 'WriteLock', ExitUpgradeableReadLock: 'UpgradeableReadLock' };

let nextVid = 10;

class State {
  constructor(vars, cons, impl, res, locks) {
    this.vars = vars;
    this.cons = cons;
    this.impl = impl;
    this.res = res;
    this.locks = locks;
  }
  static initial() { return new State(new Map(), new Map(BASE_CONS), new Map(), new Map(), []); }
  withVar(key, v) { const m = new Map(this.vars); m.set(key, v); return new State(m, this.cons, this.impl, this.res, this.locks); }
  withoutVars(pred) {
    let m = null;
    for (const k of this.vars.keys()) if (pred(k)) { if (!m) m = new Map(this.vars); m.delete(k); }
    return m ? new State(m, this.cons, this.impl, this.res, this.locks) : this;
  }
  withCons(v, c) { const m = new Map(this.cons); m.set(v, c); return new State(this.vars, m, this.impl, this.res, this.locks); }
  withImpl(v, imp) { const m = new Map(this.impl); m.set(v, imp); return new State(this.vars, this.cons, m, this.res, this.locks); }
  withRes(v, r) { const m = new Map(this.res); m.set(v, r); return new State(this.vars, this.cons, this.impl, m, this.locks); }
  withLocks(l) { return new State(this.vars, this.cons, this.impl, this.res, l); }
  c(v) { return this.cons.get(v) || EMPTY; }
}
const EMPTY = Object.freeze({});

function consKey(c) {
  if (!c || c === EMPTY) return '';
  let s = '';
  if (c.n) s += c.n === 'null' ? 'N' : 'n';
  if (c.b !== undefined) s += c.b ? 'T' : 'F';
  if (c.lo !== undefined) s += `>${c.lo}`;
  if (c.hi !== undefined) s += `<${c.hi}`;
  if (c.ne && c.ne.length) s += `!${c.ne.join(',')}`;
  if (c.coll) s += c.coll;
  if (c.disp) s += 'D';
  return s;
}

function merge(a, c) {
  if (!a || a === EMPTY) return { ...c };
  const r = { ...a };
  if (c.n) { if (a.n && a.n !== c.n) return null; r.n = c.n; if (c.src && !a.n) r.src = c.src; }
  if (c.b !== undefined) { if (a.b !== undefined && a.b !== c.b) return null; r.b = c.b; }
  if (c.lo !== undefined) r.lo = a.lo !== undefined ? Math.max(a.lo, c.lo) : c.lo;
  if (c.hi !== undefined) r.hi = a.hi !== undefined ? Math.min(a.hi, c.hi) : c.hi;
  if (c.ne) r.ne = [...new Set([...(a.ne || []), ...c.ne])].slice(0, 6);
  if (r.lo !== undefined && r.hi !== undefined) {
    if (r.lo > r.hi) return null;
    if (r.lo === r.hi && r.ne && r.ne.includes(r.lo)) return null;
  }
  if (c.coll) { if (a.coll && a.coll !== c.coll) return null; r.coll = c.coll; }
  if (c.disp) r.disp = true;
  if (c.int) r.int = true;
  if (c.ann) r.ann = true;
  if (c.src && !r.src) r.src = c.src;
  return r;
}

function exact(c) { return c && c.lo !== undefined && c.lo === c.hi ? c.lo : undefined; }

class FnSE {
  constructor(engine, fn, body, pf) {
    this.engine = engine;
    this.fn = fn;
    this.body = body;
    this.pf = pf;
    this.project = engine.project;
    this.incomplete = false;
    this.condVals = new Map();
    this.emptyVisits = new Map();
    this.capturedKeys = new Set();
    this.reported = new Set();
    this.leaks = new Map();
    this.lockLeaks = new Map();
    this.loopWrites = new Map();
    this.steps = 0;
    this.trackFields = true;
  }

  report(rule, node, en, ko, extra) {
    const key = `${rule}@${node.line}:${node.col}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.engine.add(rule, this.pf, node, en, ko, extra);
  }

  // ───────────── variable keys
  keyOf(e) {
    e = unparen(e);
    if (!e) return null;
    if (e.k === 'Name') {
      if (e.sym) {
        const s = e.sym;
        if (s.capturedWrite || s.isRef || s.kind === 'range' || s.kind === 'localfunc') return null;
        if (s.captured) this.capturedKeys.add(`v${s.id}`);
        return `v${s.id}`;
      }
      if (this.trackFields && e.msym && e.msym.length === 1 && e.msym[0].kind === 'field' && this.isOwnField(e.msym[0])) return `f:${e.name}`;
      return null;
    }
    if (e.k === 'Member' && !e.cond && e.expr.k === 'This' && this.trackFields && e.msym && e.msym.length === 1 && e.msym[0].kind === 'field') return `f:${e.name}`;
    return null;
  }

  declaredNonNull(sym) {
    const t = sym.type;
    if (!t || t.nullable || t.ptr) return false;
    if (!this.engine.nullableCtx(this.pf)) return false;
    if (t.predefined) return t.name === 'string' || t.name === 'object' || t.name === 'dynamic';
    if (t.ranks) return true;
    if (T.isValueTypeName(t.name, this.project)) return false;
    if (/^T([A-Z]\w*)?$/.test(t.name) && !this.project.typesByName.has(t.name)) return false;
    return true;
  }

  isOwnField(entry) {
    const n = entry.node;
    if (n.mods && n.mods.has('const')) return false;
    return true;
  }

  forceNN(s, v) {
    if (v === NULLV || v === SHORTNULLV) return s;
    const c = s.c(v);
    if (c.n === 'nn') return s;
    const c2 = { ...c, n: 'nn' }; delete c2.src;
    return s.withCons(v, c2);
  }

  fresh(s, c) {
    const v = nextVid++;
    if (c) s = s.withCons(v, c);
    return [s, v];
  }

  read(s, e) {
    const key = this.keyOf(e);
    if (key) {
      const v = s.vars.get(key);
      if (v !== undefined) return [s, v];
      let c = null;
      const sym = e.sym || null;
      if (sym && sym.kind === 'catch') c = { n: 'nn' };
      if (sym && sym.kind === 'param' && this.declaredNonNull(sym)) c = { ann: true };
      if (sym && sym.kind === 'foreach') c = null;
      const [s2, nv] = this.fresh(s, c);
      return [s2.withVar(key, nv), nv];
    }
    return this.fresh(s, null);
  }

  write(s, e, v) {
    const key = this.keyOf(e);
    if (!key) return s;
    return s.withVar(key, v);
  }

  learn(s, v, c) {
    if (!s) return null;
    const cur = s.cons.get(v);
    const m = merge(cur, c);
    if (!m) return null;
    let ns = s.withCons(v, m);
    if (c.b !== undefined && ns.impl.has(v)) {
      const imp = ns.impl.get(v);
      for (const [v2, c2] of (c.b ? imp.t : imp.f)) {
        ns = this.learn(ns, v2, c2);
        if (!ns) return null;
      }
    }
    return ns;
  }

  boolWithImpl(s, t, f) {
    const v = nextVid++;
    return [s.withImpl(v, { t, f }), v];
  }

  hash(s) {
    const keys = [...s.vars.keys()].sort();
    let h = '';
    for (const k of keys) h += `${k}=${consKey(s.cons.get(s.vars.get(k)))};`;
    let open = 0;
    for (const r of s.res.values()) if (r.st === 'open') open++;
    h += `|r${open}|l${s.locks.length}`;
    return h;
  }

  gc(s) {
    if (s.cons.size < 300) return s;
    const keep = new Set(BASE_CONS.keys());
    for (const v of s.vars.values()) keep.add(v);
    for (const v of s.res.keys()) keep.add(v);
    const stack = [...keep];
    while (stack.length) {
      const v = stack.pop();
      const imp = s.impl.get(v);
      if (!imp) continue;
      for (const [v2] of imp.t.concat(imp.f)) if (!keep.has(v2)) { keep.add(v2); stack.push(v2); }
    }
    const cons = new Map(); const impl = new Map();
    for (const v of keep) { if (s.cons.has(v)) cons.set(v, s.cons.get(v)); if (s.impl.has(v)) impl.set(v, s.impl.get(v)); }
    return new State(s.vars, cons, impl, s.res, s.locks);
  }

  // ───────────── run
  run() {
    const cfg = buildCFG(this.fn, this.body);
    if (!cfg) return;
    this.cfg = cfg;
    this.precomputeLoops(cfg);
    const seen = new Map();
    const visits = new Map();
    const work = [[cfg.entry, State.initial()]];
    while (work.length) {
      const [b, s0] = work.pop();
      if (++this.steps > MAX_STEPS) { this.incomplete = true; break; }
      let s = s0;
      let h = this.hash(s);
      let hs = seen.get(b);
      if (!hs) { hs = new Set(); seen.set(b, hs); }
      if (hs.has(h)) continue;
      if (b.loop) {
        const vc = (visits.get(b) || 0) + 1;
        visits.set(b, vc);
        if (vc > LOOP_WIDEN_AFTER) {
          s = this.widen(s, b.loop);
          h = this.hash(s);
          if (hs.has(h)) continue;
        }
      }
      if (hs.size >= MAX_STATES_PER_BLOCK) { this.incomplete = true; continue; }
      hs.add(h);
      if (b === cfg.exit) { this.onExit(s); continue; }
      if (b === cfg.throwExit) continue;
      let states = [this.gc(s)];
      const excStates = b.exc.length ? [] : null;
      for (const item of b.items) {
        if (excStates) for (const st of states) if (excStates.length < MAX_OUTCOMES) excStates.push(st);
        const next = [];
        for (const st of states) {
          let outs;
          try {
            outs = this.execItem(item, st);
          } catch (e) {
            if (process.env.SEMCS_DEBUG) throw e;
            this.incomplete = true;
            outs = [];
            this.engine.internalErrors++;
          }
          for (const o of outs) next.push(o);
        }
        states = this.capStates(next);
        if (!states.length) break;
      }
      if (excStates) {
        if (b.cond) for (const st of states) excStates.push(st);
        if (!excStates.length) excStates.push(s);
        for (const st0 of excStates) {
          const st = this.afterException(st0);
          for (const x of b.exc) work.push([x, st]);
        }
      }
      if (b.cond) {
        for (const st of states) {
          let outs;
          try {
            outs = this.evalCond(b.cond, st, b);
          } catch (e) {
            if (process.env.SEMCS_DEBUG) throw e;
            this.incomplete = true;
            outs = [];
            this.engine.internalErrors++;
          }
          for (const o of outs) work.push([o.br ? b.t : b.f, o.s]);
        }
      } else {
        for (const x of b.succ) for (const st of states) work.push([x, st]);
      }
    }
    if (this.steps > MAX_STEPS) this.incomplete = true;
    this.finish(cfg, seen);
  }

  capStates(list) {
    if (list.length <= MAX_OUTCOMES) return list;
    this.incomplete = true;
    return list.slice(0, MAX_OUTCOMES);
  }

  capOuts(list) {
    if (list.length <= MAX_OUTCOMES) return list;
    this.incomplete = true;
    return list.slice(0, MAX_OUTCOMES);
  }

  precomputeLoops(cfg) {
    for (const { node } of cfg.loops) {
      const keys = new Set();
      let fields = false;
      const visit = (n) => {
        if (!n || typeof n !== 'object') return;
        if (n.k === 'Name' && n.isWrite) { const k = this.keyOf(n); if (k) keys.add(k); }
        if (n.k === 'Member' && n.isWrite) { const k = this.keyOf(n); if (k) keys.add(k); }
        if (n.k === 'Invocation' || n.k === 'Await' || n.k === 'New') fields = true;
        if (n.k === 'VarDecl' && n.sym) keys.add(`v${n.sym.id}`);
        if (n.k === 'DeclExpr' || n.k === 'DeclPattern' || n.k === 'SingleDesignation') { if (n.sym) keys.add(`v${n.sym.id}`); }
        if (n.k === 'Foreach' && n.sym) keys.add(`v${n.sym.id}`);
        forEachChild(n, visit);
      };
      visit(node);
      this.loopWrites.set(node, { keys, fields });
    }
  }

  widen(s, loop) {
    const lw = this.loopWrites.get(loop);
    if (!lw) return s;
    return s.withoutVars((k) => lw.keys.has(k) || (lw.fields && k.startsWith('f:')));
  }

  onExit(s) {
    for (const [v, r] of s.res) {
      if (r.st === 'open') {
        if (!this.leaks.has(r.node)) this.leaks.set(r.node, r);
      }
    }
    for (const l of s.locks) if (!this.lockLeaks.has(l.node)) this.lockLeaks.set(l.node, l);
  }

  finish(cfg, seen) {
    if (!this.incomplete) {
      for (const [node, r] of this.leaks) {
        const name = r.name ? `'${r.name}'` : 'this object';
        this.report('sem-cs:disposable-not-disposed', node,
          `Dispose ${name} (${r.type}) on every path, for example with a using statement.`,
          `${r.name ? `'${r.name}'` : '이 객체'}(${r.type})를 모든 경로에서 해제하세요. 예: using 문.`);
      }
      if (this.engine.lockReleases.get(this.fn)) {
        for (const [node, l] of this.lockLeaks) {
          this.report('sem-cs:lock-not-released', node,
            `This ${l.kind} lock is not released on every path; release it in a finally block.`,
            `이 ${l.kind} 잠금이 모든 경로에서 해제되지 않습니다. finally 블록에서 해제하세요.`);
        }
      }
      this.reportConditions(cfg, seen);
      for (const [node, r] of this.emptyVisits) if (r.e && !r.o) this.reportEmpty(node, r.how);
    }
  }

  reportConditions(cfg, seen) {
    void seen;
    for (const [node, vals] of this.condVals) {
      if (vals.U || (vals.T && vals.F) || (!vals.T && !vals.F)) continue;
      if (this.engine.isConstantish(node)) continue;
      const val = vals.T ? 'true' : 'false';
      const unreach = this.causesUnreachable(node, vals.T === true);
      if (unreach) {
        this.report('sem-cs:unreachable-branch', node,
          `Change this condition so that it does not always evaluate to '${val}'; some subsequent code is never executed.`,
          `이 조건은 항상 '${val}'입니다. 뒤따르는 일부 코드가 실행되지 않으니 조건을 고치세요.`);
      } else {
        this.report('sem-cs:condition-always-same', node,
          `Change this condition so that it does not always evaluate to '${val}'.`,
          `이 조건은 항상 '${val}'로 평가됩니다. 조건을 고치세요.`);
      }
    }
  }

  causesUnreachable(node, always) {
    const p = node.parent;
    if (!p) return false;
    if (p.k === 'If' && p.cond === node) return always ? !!p.else : true;
    if ((p.k === 'While' || p.k === 'For') && p.cond === node) return !always;
    if (p.k === 'Conditional' && p.cond === node) return true;
    if (p.k === 'Binary' && (p.op === '&&' || p.op === '||') && p.left === node) return p.op === '&&' ? !always : always;
    return false;
  }

  recordCond(node, s, v) {
    if (!node || node.synthetic) return;
    let r = this.condVals.get(node);
    if (!r) { r = {}; this.condVals.set(node, r); }
    const b = s.c(v).b;
    if (b === true) r.T = true; else if (b === false) r.F = true; else r.U = true;
  }

  // ───────────── items
  execItem(item, s) {
    switch (item.k) {
      case 'LocalDecl': return this.execLocalDecl(item, s);
      case 'ExprStmt': return this.ev(item.expr, s).map((o) => this.afterDiscard(o));
      case 'ExprBody': return this.ev(item.expr, s).map((o) => this.escape(o.s, o.v));
      case 'Return': case 'YieldReturn':
        if (!item.expr) return [s];
        return this.ev(item.expr, s).map((o) => this.escape(o.s, o.v));
      case 'Throw':
        if (!item.expr) return [s];
        return this.ev(item.expr, s).map((o) => o.s);
      case 'LocalFunc': case 'Break': case 'Continue': case 'Goto': case 'YieldBreak': case 'Empty': return [s];
      case 'CondEval': return this.ev(item.expr, s).map((o) => o.s);
      case 'ForeachInit': {
        const fe = item.node;
        return this.ev(fe.expr, s).map((o) => {
          const s2 = this.deref(o.s, o.v, fe.expr, 'foreach');
          return s2 ? s2.withVar(`fe:${fe.line}:${fe.col}`, o.v) : null;
        }).filter(Boolean);
      }
      case 'ForeachAssign': {
        const fe = item.node;
        if (fe.sym) { const [s2, v] = this.fresh(s, null); return [s2.withVar(`v${fe.sym.id}`, v)]; }
        if (fe.designation) return [this.havocDesignation(s, fe.designation)];
        return [s];
      }
      case 'SwitchEval': {
        const sw = item.node;
        return this.ev(sw.expr, s).map((o) => o.s.withVar(`sw:${sw.line}:${sw.col}`, o.v));
      }
      case 'CatchEnter': {
        const c = item.node;
        if (c.sym) { const [s2, v] = this.fresh(s, { n: 'nn' }); return [s2.withVar(`v${c.sym.id}`, v)]; }
        return [s];
      }
      case 'UsingEnter': {
        const u = item.node;
        if (u.decl) {
          return this.execLocalDecl(u.decl, s).map((st) => {
            let s3 = st;
            for (const v of u.decl.vars) {
              if (!v.sym) continue;
              const val = s3.vars.get(`v${v.sym.id}`);
              if (val !== undefined) s3 = this.markUsing(s3, val);
            }
            return s3;
          });
        }
        if (u.expr) return this.ev(u.expr, s).map((o) => this.markUsing(o.s, o.v));
        return [s];
      }
      case 'UsingExit': {
        const u = item.node;
        if (u.expr) {
          const key = this.keyOf(u.expr);
          if (key && s.vars.has(key)) {
            const v = s.vars.get(key);
            const s2 = this.learn(s, v, { disp: true });
            return [s2 || s];
          }
        }
        return [s];
      }
      case 'LockEnter': {
        const l = item.node;
        return this.ev(l.expr, s).map((o) => this.deref(o.s, o.v, l.expr, 'lock')).filter(Boolean).map((st) => this.invalidateFields(st));
      }
      case 'LockExit': return [s];
      default:
        if (item.expr) return this.ev(item.expr, s).map((o) => o.s);
        return [s];
    }
  }

  afterDiscard(o) { return o.s; }

  markUsing(s, v) {
    const r = s.res.get(v);
    if (r) return s.withRes(v, { ...r, st: 'using' });
    return s.withRes(v, { node: null, st: 'using', type: '', name: '' });
  }

  execLocalDecl(d, s) {
    let states = [s];
    for (const vd of d.vars) {
      const next = [];
      for (const st of states) {
        if (!vd.init) {
          if (vd.sym) { const [s2, v] = this.fresh(st, null); next.push(s2.withVar(`v${vd.sym.id}`, v)); } else next.push(st);
          continue;
        }
        for (const o of this.ev(vd.init, st)) {
          let s2 = o.s;
          if (vd.sym && !vd.sym.capturedWrite) {
            s2 = s2.withVar(`v${vd.sym.id}`, o.v);
            const r = s2.res.get(o.v);
            if (r && r.st === 'open' && !r.name) s2 = s2.withRes(o.v, { ...r, name: vd.name });
            if (d.isUsing) s2 = this.markUsing(s2, o.v);
          } else s2 = this.escape(s2, o.v);
          next.push(s2);
        }
      }
      states = this.capStates(next);
    }
    if (d.designation) {
      const next = [];
      for (const st of states) for (const o of this.ev(d.deconInit, st)) next.push(this.havocDesignation(o.s, d.designation));
      states = next;
    }
    return states;
  }

  havocDesignation(s, d) {
    if (!d) return s;
    if (d.k === 'SingleDesignation') {
      if (d.sym) { const [s2, v] = this.fresh(s, null); return s2.withVar(`v${d.sym.id}`, v); }
      return s;
    }
    if (d.k === 'ParenDesignation') { for (const x of d.items) s = this.havocDesignation(s, x); return s; }
    // an expression target such as (a, b)
    const walk = (e) => {
      e = unparen(e);
      if (!e) return;
      if (e.k === 'Tuple') for (const a of e.elems) walk(a.expr);
      else if (e.k === 'DeclExpr') s = this.havocDesignation(s, e.designation);
      else { const [s2, v] = this.fresh(s, null); s = this.write(s2, e, v); }
    };
    walk(d);
    return s;
  }

  escape(s, v) {
    const r = s.res.get(v);
    if (r && r.st === 'open') return s.withRes(v, { ...r, st: 'esc' });
    return s;
  }

  // a lambda or local function may later mutate the objects held by captured variables
  invalidateCaptured(s) {
    let st = s;
    for (const k of this.capturedKeys) {
      const v = st.vars.get(k);
      if (v === undefined) continue;
      const c = st.c(v);
      if (c.coll || c.disp) { const c2 = { ...c }; delete c2.coll; st = st.withCons(v, c2); }
      st = this.escape(st, v);
    }
    return st;
  }

  // leaks are not reported on exceptional paths
  afterException(s) {
    let st = s;
    for (const [v, r] of s.res) if (r.st === 'open') st = st.withRes(v, { ...r, st: 'esc' });
    return st;
  }

  invalidateFields(s) {
    if (!this.trackFields) return s;
    return s.withoutVars((k) => k.startsWith('f:'));
  }

  deref(s, v, recvNode, how) {
    const c = s.c(v);
    if (c.n === 'null') {
      if (!c.ann) this.reportNull(recvNode, c, how);
      // keep exploring as if it were not null to avoid cascades
      if (v === NULLV || v === SHORTNULLV) return s;
      const c2 = { ...c, n: 'nn' }; delete c2.src;
      return s.withCons(v, c2);
    }
    if (c.disp && how === 'member') { /* handled by caller */ }
    return this.learn(s, v, { n: 'nn' }) || null;
  }

  reportNull(node, c, how) {
    const txt = shortText(this.pf.text, node);
    const events = [];
    if (c.src) events.push({ line: c.src.line, tag: 'null', text: { en: `'${txt}' is null here`, ko: `여기서 '${txt}'는 null입니다` }, main: false });
    events.push({ line: node.line, tag: 'deref', text: { en: `'${txt}' is dereferenced`, ko: `'${txt}'를 역참조합니다` }, main: true });
    void how;
    this.report('sem-cs:null-dereference', node,
      `'${txt}' is null on at least one execution path.`,
      `'${txt}'는 적어도 한 실행 경로에서 null입니다.`, { events });
  }

  // ───────────── conditions
  evalCond(cond, s, block) {
    void block;
    if (cond.k === 'ForeachNext') {
      const fe = cond.node;
      const v = s.vars.get(`fe:${fe.line}:${fe.col}`);
      if (v === undefined) return [{ s, br: true }, { s, br: false }];
      const c = s.c(v);
      this.emptyCheck(fe.expr, c.coll === 'e', 'iterated');
      if (c.coll === 'e') return [{ s, br: false }];
      const st = this.learn(s, v, { coll: 'ne' });
      const out = [];
      if (st) out.push({ s: st, br: true });
      out.push({ s, br: false });
      return out;
    }
    if (cond.k === 'CaseTest') {
      const sw = cond.sw;
      const v = sw ? s.vars.get(`sw:${sw.line}:${sw.col}`) : undefined;
      const lab = cond.label;
      if (v === undefined) return [{ s, br: true }, { s, br: false }];
      const out = [];
      for (const m of this.matchPattern(lab.pattern, s, v)) {
        if (!m.matched) { out.push({ s: m.s, br: false }); continue; }
        if (!lab.when) { out.push({ s: m.s, br: true }); continue; }
        for (const o of this.ev(lab.when, m.s)) {
          this.recordCond(lab.when, o.s, o.v);
          for (const b of this.split(o.s, o.v)) out.push(b);
        }
      }
      return out;
    }
    const out = [];
    for (const o of this.ev(cond, s)) {
      this.recordCond(cond, o.s, o.v);
      for (const b of this.split(o.s, o.v)) out.push(b);
    }
    return out;
  }

  split(s, v) {
    const b = s.c(v).b;
    if (b === true) return [{ s, br: true }];
    if (b === false) return [{ s, br: false }];
    const out = [];
    const t = this.learn(s, v, { b: true });
    if (t) out.push({ s: t, br: true });
    const f = this.learn(s, v, { b: false });
    if (f) out.push({ s: f, br: false });
    return out;
  }

  // ───────────── expressions: return [{ s, v }]
  ev(e, s) {
    if (!e) return [{ s, v: this.fresh(s, null)[1] }];
    const r = this.evInner(e, s);
    return r.length > MAX_OUTCOMES ? this.capOuts(r) : r;
  }

  evAll(list, s) {
    // evaluate expressions left to right; returns [{ s, vs }]
    let acc = [{ s, vs: [] }];
    for (const e of list) {
      const next = [];
      for (const a of acc) for (const o of this.ev(e, a.s)) next.push({ s: o.s, vs: a.vs.concat([o.v]) });
      acc = next.length > MAX_OUTCOMES ? (this.incomplete = true, next.slice(0, MAX_OUTCOMES)) : next;
    }
    return acc;
  }

  evInner(e, s) {
    switch (e.k) {
      case 'Literal': {
        switch (e.kind) {
          case 'null': { const [s2, v] = this.fresh(s, { n: 'null', src: e }); return [{ s: s2, v }]; }
          case 'bool': return [{ s, v: e.value ? TRUEV : FALSEV }];
          case 'int': case 'char': {
            const n = typeof e.value === 'string' ? e.value.charCodeAt(0) : e.value;
            if (!Number.isFinite(n)) return [{ s, v: this.fresh(s, null)[1] }];
            const [s2, v] = this.fresh(s, { lo: n, hi: n, int: e.kind === 'int' && !/[fdm]/.test(e.suffix || '') });
            return [{ s: s2, v }];
          }
          case 'real': { const [s2, v] = this.fresh(s, { lo: e.value, hi: e.value }); return [{ s: s2, v }]; }
          case 'string': { const [s2, v] = this.fresh(s, { n: 'nn' }); return [{ s: s2, v }]; }
          default: { const [s2, v] = this.fresh(s, null); return [{ s: s2, v }]; }
        }
      }
      case 'InterpString': {
        let states = [s];
        for (const p of e.parts) if (p.k === 'Interp' && p.expr) { const next = []; for (const st of states) for (const o of this.ev(p.expr, st)) next.push(o.s); states = this.capStates(next); }
        return states.map((st) => { const [s2, v] = this.fresh(st, { n: 'nn' }); return { s: s2, v }; });
      }
      case 'This': case 'Base': return [{ s, v: THISV }];
      case 'Name': {
        const [s2, v] = this.read(s, e);
        return [{ s: s2, v }];
      }
      case 'Paren': return this.ev(e.expr, s).map((o) => (o.short ? { s: o.s, v: o.v } : o));
      case 'SuppressNull': return this.ev(e.expr, s).map((o) => (o.short ? o : { s: this.forceNN(o.s, o.v), v: o.v }));
      case 'Member': return this.evMember(e, s);
      case 'Invocation': return this.evInvocation(e, s);
      case 'Element': return this.evElement(e, s);
      case 'Assign': return this.evAssign(e, s);
      case 'Unary': return this.evUnary(e, s);
      case 'Binary': return this.evBinary(e, s);
      case 'Conditional': {
        const out = [];
        for (const o of this.ev(e.cond, s)) {
          this.recordCond(e.cond, o.s, o.v);
          for (const b of this.split(o.s, o.v)) for (const r of this.ev(b.br ? e.then : e.else, b.s)) out.push(r);
        }
        return out;
      }
      case 'Is': {
        const out = [];
        for (const o of this.ev(e.expr, s)) {
          const ms = this.matchPattern(e.pattern, o.s, o.v);
          const ts = ms.filter((m) => m.matched); const fs = ms.filter((m) => !m.matched);
          if (ts.length && !fs.length) for (const m of ts) out.push({ s: m.s, v: TRUEV });
          else if (fs.length && !ts.length) for (const m of fs) out.push({ s: m.s, v: FALSEV });
          else for (const m of ms) out.push({ s: m.s, v: m.matched ? TRUEV : FALSEV });
        }
        return out;
      }
      case 'As': return this.ev(e.expr, s).map((o) => {
        if (o.s.c(o.v).n === 'null') return { s: o.s, v: NULLV };
        const [s2, v] = this.fresh(o.s, null);
        return { s: s2, v };
      });
      case 'Cast': return this.ev(e.expr, s).map((o) => {
        const td = T.fromTypeNode(e.type);
        if (td && !td.nullable && T.isValueTypeName(td.name, this.project) && o.s.c(o.v).n === 'null') {
          const st = T.typeOf(e.expr, this.project);
          if (st && st.nullable && T.isValueTypeName(st.name, this.project)) {
            this.reportNullableValue(e.expr);
            return null;
          }
        }
        return o;
      }).filter(Boolean);
      case 'New': return this.evNew(e, s);
      case 'ArrayNew': {
        let states = [s];
        const sizes = e.sizes || [];
        let sizeVals = [];
        if (sizes.length) {
          const outs = this.evAll(sizes, s);
          states = outs.map((o) => o.s);
          sizeVals = outs.length ? outs[0].vs : [];
        }
        const items = e.init ? e.init.items : null;
        const res = [];
        const expanded = [];
        for (const st of states) for (const o of this.evAll(this.initValues(e.init), st)) { let s2 = o.s; for (const v of o.vs) s2 = this.escape(s2, v); expanded.push(s2); }
        for (const st of this.capStates(expanded)) {
          const s2 = st;
          let coll;
          if (items) coll = items.length ? 'ne' : 'e';
          else if (sizeVals.length === 1) { const n = exact(st.c(sizeVals[0])); if (n === 0) coll = 'e'; else if (n > 0) coll = 'ne'; }
          const [s3, v] = this.fresh(s2, { n: 'nn', ...(coll ? { coll } : {}) });
          res.push({ s: s3, v });
        }
        return res;
      }
      case 'Lambda': {
        // captured variables holding open resources escape; their collections may change later
        let s2 = s;
        this.forCaptured(e, (key) => {
          const v = s2.vars.get(key);
          if (v === undefined) return;
          s2 = this.escape(s2, v);
          const c = s2.c(v);
          if (c.coll) { const c2 = { ...c }; delete c2.coll; s2 = s2.withCons(v, c2); }
        });
        const [s3, v] = this.fresh(s2, { n: 'nn' });
        return [{ s: s3, v }];
      }
      case 'Await': {
        const out = [];
        for (const o of this.ev(e.expr, s)) {
          const s2 = this.deref(o.s, o.v, e.expr, 'await');
          if (!s2) continue;
          const [s3, v] = this.fresh(this.invalidateFields(s2), null);
          out.push({ s: s3, v });
        }
        return out;
      }
      case 'ThrowExpr': { this.ev(e.expr, s); return []; }
      case 'Typeof': case 'Sizeof': case 'Default': case 'PredefType': {
        const [s2, v] = this.fresh(s, e.k === 'Typeof' ? { n: 'nn' } : null);
        return [{ s: s2, v }];
      }
      case 'SwitchExpr': return this.evSwitchExpr(e, s);
      case 'Tuple': {
        const outs = this.evAll(e.elems.map((x) => x.expr), s);
        return outs.map((o) => { let st = o.s; for (const v of o.vs) st = this.escape(st, v); const [s2, v] = this.fresh(st, { n: 'nn' }); return { s: s2, v }; });
      }
      case 'TupleArg': return this.ev(e.expr, s);
      case 'DeclExpr': { const [s2, v] = this.fresh(s, null); return [{ s: s2, v }]; }
      case 'CheckedExpr': return this.ev(e.expr, s);
      case 'Ref': return this.ev(e.expr, s);
      case 'Range': case 'IndexFromEnd': {
        const kids = [e.from, e.to, e.expr].filter(Boolean);
        return this.evAll(kids, s).map((o) => { const [s2, v] = this.fresh(o.s, null); return { s: s2, v }; });
      }
      case 'AnonNew': {
        const outs = this.evAll(e.members.map((m) => m.value), s);
        return outs.map((o) => { let st = o.s; for (const v of o.vs) st = this.escape(st, v); const [s2, v] = this.fresh(st, { n: 'nn' }); return { s: s2, v }; });
      }
      case 'Collection': {
        const outs = this.evAll(e.elems.map((x) => (x.k === 'Spread' ? x.expr : x)), s);
        return outs.map((o) => { let st = o.s; for (const v of o.vs) st = this.escape(st, v); const [s2, v] = this.fresh(st, { n: 'nn', coll: e.elems.length ? (e.elems.some((x) => x.k === 'Spread') ? undefined : 'ne') : 'e' }); return { s: s2, v }; });
      }
      case 'With': {
        const out = [];
        for (const o of this.ev(e.expr, s)) {
          const s2 = this.deref(o.s, o.v, e.expr, 'with');
          if (!s2) continue;
          const [s3, v] = this.fresh(s2, { n: 'nn' });
          out.push({ s: s3, v });
        }
        return out;
      }
      case 'Query': {
        // evaluate the source; the rest runs lazily
        const first = e.clauses[0];
        return this.ev(first.expr, s).map((o) => { const [s2, v] = this.fresh(o.s, { n: 'nn' }); return { s: s2, v }; });
      }
      case 'Stackalloc': { const [s2, v] = this.fresh(s, { n: 'nn' }); return [{ s: s2, v }]; }
      default: {
        const [s2, v] = this.fresh(s, null);
        return [{ s: s2, v }];
      }
    }
  }

  forCaptured(lambda, fn) {
    const visit = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.k === 'Name' && n.sym && n.sym.captured) fn(`v${n.sym.id}`);
      forEachChild(n, visit);
    };
    visit(lambda.body);
  }

  isTypeOrNamespace(e) {
    e = unparen(e);
    if (!e) return false;
    if (e.k === 'PredefType') return true;
    if (e.k === 'Name') {
      if (e.sym) return false;
      if (e.msym) return e.msym.every((m) => m.kind === 'type');
      return true; // unresolved: a type, namespace or inherited member
    }
    if (e.k === 'Member') return !e.msym && this.isTypeOrNamespace(e.expr) && /^[A-Z]/.test(e.name);
    return false;
  }

  receiverTracked(e) {
    e = unparen(e);
    if (!e) return false;
    if (e.k === 'Name') return !!this.keyOf(e);
    if (e.k === 'Member' && e.expr.k === 'This') return !!this.keyOf(e);
    return true; // other expressions: value computed here
  }

  evMember(e, s) {
    if (this.isTypeOrNamespace(e.expr)) {
      const d = dotted(e);
      if (d && (d === 'string.Empty' || d === 'String.Empty')) { const [s2, v] = this.fresh(s, { n: 'nn' }); return [{ s: s2, v }]; }
      // field of own type accessed through the type name
      const [s2, v] = this.fresh(s, null);
      return [{ s: s2, v }];
    }
    if (e.expr.k === 'This' || e.expr.k === 'Base') {
      if (this.keyOf(e)) { const [s2, v] = this.read(s, e); return [{ s: s2, v }]; }
      const [s2, v] = this.fresh(s, null);
      return [{ s: s2, v }];
    }
    const out = [];
    for (const o of this.ev(e.expr, s)) {
      if (o.short) { out.push(o); continue; }
      const c = o.s.c(o.v);
      if (e.cond) {
        if (c.n !== 'nn') {
          const sn = this.learn(o.s, o.v, { n: 'null', src: e });
          if (sn) out.push({ s: sn, v: SHORTNULLV, short: true });
        }
        if (c.n === 'null') continue;
        const snn = this.learn(o.s, o.v, { n: 'nn' });
        if (snn) for (const r of this.memberValue(e, snn, o.v)) out.push(r);
        continue;
      }
      if (e.name === 'HasValue' || e.name === 'GetValueOrDefault' || this.isNullableValue(e.expr)) {
        if (e.name === 'HasValue') {
          if (c.n === 'null') { out.push({ s: o.s, v: FALSEV }); continue; }
          if (c.n === 'nn') { out.push({ s: o.s, v: TRUEV }); continue; }
          const [s2, v] = this.boolWithImpl(o.s, [[o.v, { n: 'nn' }]], [[o.v, { n: 'null', src: e }]]);
          out.push({ s: s2, v });
          continue;
        }
        if (e.name === 'Value') {
          if (c.n === 'null') { this.reportNullableValue(e.expr); continue; }
          const s2 = this.learn(o.s, o.v, { n: 'nn' });
          const [s3, v] = this.fresh(s2 || o.s, null);
          out.push({ s: s3, v });
          continue;
        }
        const [s2, v] = this.fresh(o.s, null);
        out.push({ s: s2, v });
        continue;
      }
      if (!this.receiverTracked(e.expr) && c.n !== 'null') { for (const r of this.memberValue(e, o.s, o.v)) out.push(r); continue; }
      if (c.disp && !DISPOSED_OK.has(e.name) && o.s.res.has(o.v) && !this.isInvocationCallee(e)) {
        this.reportDisposed(e);
      }
      const s2 = this.deref(o.s, o.v, e.expr, 'member');
      if (!s2) continue;
      for (const r of this.memberValue(e, s2, o.v)) out.push(r);
    }
    return out;
  }

  isInvocationCallee(m) { return m.parent && m.parent.k === 'Invocation' && m.parent.expr === m; }

  isNullableValue(e) {
    const t = T.typeOf(e, this.project);
    return !!t && T.isNullableValueType(t, this.project);
  }

  reportNullableValue(node) {
    const txt = shortText(this.pf.text, node);
    this.report('sem-cs:nullable-value-null', node,
      `'${txt}' is null here; accessing its value throws InvalidOperationException.`,
      `'${txt}'가 여기서 null이라 값에 접근하면 InvalidOperationException이 납니다.`);
  }

  reportDisposed(e) {
    const txt = shortText(this.pf.text, e.expr);
    this.report('sem-cs:disposed-object-used', e,
      `'${txt}' is used after it was disposed.`,
      `'${txt}'를 해제한 뒤에 사용합니다.`);
  }

  emptyCheck(node, isEmpty, how) {
    let r = this.emptyVisits.get(node);
    if (!r) { r = { e: 0, o: 0, how }; this.emptyVisits.set(node, r); }
    if (isEmpty) r.e++; else r.o++;
  }

  reportEmpty(node, how) {
    const txt = shortText(this.pf.text, node);
    this.report('sem-cs:empty-collection-access', node,
      `'${txt}' is always empty here; it is ${how} without ever being filled.`,
      `'${txt}'는 여기서 항상 비어 있습니다. 채우지 않은 채 ${how === 'iterated' ? '반복' : '접근'}합니다.`);
  }

  memberValue(e, s, recv) {
    const c = s.c(recv);
    if ((e.name === 'Count' || e.name === 'Length') && !this.isInvocationCallee(e)) {
      if (c.coll === 'e') { const [s2, v] = this.fresh(s, { lo: 0, hi: 0, int: true }); return [{ s: s2, v }]; }
      if (c.coll === 'ne') { const [s2, v] = this.fresh(s, { lo: 1, int: true }); return [{ s: s2, v }]; }
      const [s2, v] = this.fresh(s, { lo: 0, int: true });
      // learning on the count teaches the collection
      return [{ s: s2.withImpl(v, s2.impl.get(v) || { t: [], f: [] }), v, countOf: recv }];
    }
    const [s2, v] = this.fresh(s, null);
    return [{ s: s2, v }];
  }

  evElement(e, s) {
    const out = [];
    for (const o of this.ev(e.expr, s)) {
      if (o.short) { out.push(o); continue; }
      const argOuts = this.evAll(e.args.map((a) => a.expr), o.s);
      for (const ao of argOuts) {
        let st = ao.s;
        const c = st.c(o.v);
        if (e.cond) {
          if (c.n !== 'nn') { const sn = this.learn(st, o.v, { n: 'null', src: e }); if (sn) out.push({ s: sn, v: SHORTNULLV, short: true }); }
          if (c.n === 'null') continue;
          st = this.learn(st, o.v, { n: 'nn' });
          if (!st) continue;
        } else if (this.receiverTracked(e.expr)) {
          st = this.deref(st, o.v, e.expr, 'element');
          if (!st) continue;
        }
        if (!this.isWriteTarget(e, true)) this.emptyCheck(e.expr, st.c(o.v).coll === 'e', 'accessed');
        const [s2, v] = this.fresh(st, null);
        out.push({ s: s2, v });
      }
    }
    return out;
  }

  isWriteTarget(e, dictOnly) {
    const p = e.parent;
    if (!p || p.k !== 'Assign' || p.left !== e) return false;
    if (!dictOnly) return true;
    const t = T.typeOf(e.expr, this.project);
    return !t || !(t.name === 'List' || t.ranks);
  }

  initValues(init) {
    const out = [];
    if (!init) return out;
    const visit = (list) => {
      for (const it of list.items) {
        const val = it.k === 'MemberInit' || it.k === 'IndexInit' ? it.value : it;
        if (!val) continue;
        if (val.k === 'InitList' || val.k === 'ElementInit' || val.k === 'ArrayInit') { visit(val); continue; }
        out.push(val);
      }
    };
    visit(init);
    return out;
  }

  evNew(e, s) {
    const args = e.args || [];
    const outs = this.evAll(args.map((a) => a.expr).concat(this.initValues(e.init)), s);
    const res = [];
    const tname = e.type ? e.type.name : '';
    for (const o of outs) {
      let st = o.s;
      for (const v of o.vs) st = this.escape(st, v);
      st = this.invalidateFields(st);
      const c = { n: 'nn' };
      if (T.CONCRETE_COLLECTIONS.has(tname)) {
        if (e.init && e.init.items.length) c.coll = 'ne';
        else if (e.init && !e.init.items.length && !args.length) c.coll = 'e';
        else if (!args.length) c.coll = 'e';
        else if (args.length === 1 && args[0].expr.k === 'Literal' && args[0].expr.kind === 'int') c.coll = 'e';
      }
      let [s2, v] = this.fresh(st, c);
      if (T.isDisposableCreation(e, this.project) && this.engine.trackDisposables) {
        s2 = s2.withRes(v, { node: e, st: 'open', type: tname, name: '' });
      }
      res.push({ s: s2, v });
    }
    return res;
  }

  evInvocation(e, s) {
    const callee = unparen(e.expr);
    const name = callName(e);
    const target = callTarget(e);
    const tdot = target ? dotted(target) : null;
    const qual = tdot ? `${tdot.split('.').pop()}.${name}` : name;
    // nameof(x)
    if (callee.k === 'Name' && name === 'nameof' && !callee.sym) { const [s2, v] = this.fresh(s, { n: 'nn' }); return [{ s: s2, v }]; }
    // receiver
    let recvOuts;
    let conditional = false;
    if (callee.k === 'Member') {
      if (this.isTypeOrNamespace(callee.expr)) recvOuts = [{ s, v: null, isType: true }];
      else if (callee.expr.k === 'This' || callee.expr.k === 'Base') recvOuts = [{ s, v: THISV }];
      else {
        recvOuts = [];
        for (const o of this.ev(callee.expr, s)) {
          if (o.short) { recvOuts.push({ s: o.s, v: o.v, skipped: true }); continue; }
          const c = o.s.c(o.v);
          if (callee.cond) {
            conditional = true;
            if (c.n !== 'nn') { const sn = this.learn(o.s, o.v, { n: 'null', src: callee }); if (sn) recvOuts.push({ s: sn, v: o.v, skipped: true }); }
            if (c.n === 'null') continue;
            const snn = this.learn(o.s, o.v, { n: 'nn' });
            if (snn) recvOuts.push({ s: snn, v: o.v });
            continue;
          }
          if (c.disp && !DISPOSED_OK.has(name) && o.s.res.has(o.v)) this.reportDisposed(callee);
          if (this.receiverTracked(callee.expr)) {
            const s2 = this.deref(o.s, o.v, callee.expr, 'call');
            if (s2) recvOuts.push({ s: s2, v: o.v });
          } else recvOuts.push({ s: o.s, v: o.v });
        }
      }
    } else if (callee.k === 'Name') {
      if (callee.sym && callee.sym.kind !== 'localfunc') {
        // delegate invocation
        recvOuts = [];
        for (const o of this.ev(callee, s)) {
          const s2 = this.deref(o.s, o.v, callee, 'invoke');
          if (s2) recvOuts.push({ s: s2, v: null, delegate: true });
        }
      } else recvOuts = [{ s, v: null }];
    } else {
      recvOuts = this.ev(callee, s).map((o) => ({ s: o.s, v: null }));
    }
    const out = [];
    for (const ro of recvOuts) {
      if (ro.skipped) { out.push({ s: ro.s, v: SHORTNULLV, short: true }); continue; }
      const argOuts = this.evAll(e.args.map((a) => a.expr), ro.s);
      for (const ao of argOuts) {
        for (const r of this.applyCall(e, name, qual, tdot, ro, ao.s, ao.vs)) out.push(r);
      }
    }
    void conditional;
    return out;
  }

  neverReturns(e, name, tdot) {
    if ((name === 'Exit' || name === 'FailFast') && (tdot === 'Environment' || tdot === 'System.Environment')) return true;
    const ms = T.resolveCall(e, this.project);
    if (!ms || ms.length !== 1 || !ms[0].node) return false;
    const m = ms[0].node;
    if ((m.attrs || []).some((a) => a.name === 'DoesNotReturn' || a.name === 'System.Diagnostics.CodeAnalysis.DoesNotReturn')) return true;
    if (m.mods && (m.mods.has('virtual') || m.mods.has('abstract'))) return false;
    if (m.exprBody) return unparen(m.exprBody).k === 'ThrowExpr';
    return !!(m.body && m.body.stmts.length === 1 && m.body.stmts[0].k === 'Throw');
  }

  applyCall(e, name, qual, tdot, ro, s, vs) {
    const args = e.args;
    const recv = ro.v;
    // ---- special methods
    if ((name === 'IsNullOrEmpty' || name === 'IsNullOrWhiteSpace') && (tdot === 'string' || tdot === 'String') && vs.length === 1) {
      const c = s.c(vs[0]);
      if (c.n === 'null') return [{ s, v: TRUEV }];
      const [s2, v] = this.boolWithImpl(s, [], [[vs[0], { n: 'nn' }]]);
      return [{ s: s2, v }];
    }
    if ((name === 'ReferenceEquals' || (name === 'Equals' && (tdot === 'object' || tdot === 'Object'))) && vs.length === 2) {
      const r = this.compareNull(s, vs[0], vs[1], '==', e);
      if (r) return r;
    }
    if ((name === 'ThrowIfNull' && /ArgumentNullException$/.test(tdot || '')) || (name === 'ThrowIfNullOrEmpty' || name === 'ThrowIfNullOrWhiteSpace')) {
      const st = vs.length ? this.learn(s, vs[0], { n: 'nn' }) : s;
      return st ? [{ s: st, v: this.fresh(st, null)[1] }] : [];
    }
    if (name === 'Assert' && (tdot === 'Debug' || tdot === 'Trace' || tdot === 'System.Diagnostics.Debug') && vs.length >= 1) {
      const st = this.learn(s, vs[0], { b: true });
      return st ? [{ s: st, v: this.fresh(st, null)[1] }] : [];
    }
    // calls that never return end the path: Environment.Exit / FailFast, and project
    // methods marked [DoesNotReturn] or whose body only throws (throw helpers)
    if (this.neverReturns(e, name, tdot)) return [];
    let st = s;
    // ---- receiver state changes
    if (recv != null && !ro.isType) {
      const rc = st.c(recv);
      if (DISPOSE_NAMES.has(name) && args.length === 0) {
        const r = st.res.get(recv);
        if (name !== 'Close' && rc.disp && r) {
          this.report('sem-cs:dispose-twice', e,
            `'${shortText(this.pf.text, callTarget(e))}' is disposed more than once.`,
            `'${shortText(this.pf.text, callTarget(e))}'를 두 번 이상 해제합니다.`);
        } else if (name === 'Dispose' && r && r.st === 'using') {
          this.report('sem-cs:dispose-twice', e,
            `'${shortText(this.pf.text, callTarget(e))}' is disposed here and again by its using statement.`,
            `'${shortText(this.pf.text, callTarget(e))}'를 여기서 해제하고 using 문이 다시 해제합니다.`);
        }
        st = this.learn(st, recv, { disp: true }) || st;
        if (r) st = st.withRes(recv, { ...r, st: r.st === 'using' ? 'using' : 'closed' });
      } else if (COLL_ADD.has(name)) {
        if (rc.coll) st = st.withCons(recv, { ...rc, coll: 'ne' });
      } else if (COLL_ACCESS.has(name) && args.length <= 1 && !this.isLinqOnLambda(e) && (rc.coll || this.isTrackedCollection(callTarget(e)))) {
        this.emptyCheck(callTarget(e), rc.coll === 'e', 'accessed');
        if (COLL_UNKNOWN.has(name) && rc.coll) { const c2 = { ...rc }; delete c2.coll; st = st.withCons(recv, c2); }
      } else if (name === 'Clear' && args.length === 0) {
        if (rc.coll || this.isTrackedCollection(callTarget(e))) st = st.withCons(recv, { ...rc, coll: 'e' });
      } else if (COLL_UNKNOWN.has(name) && rc.coll) {
        const c2 = { ...rc }; delete c2.coll; st = st.withCons(recv, c2);
      }
    }
    // Any() / Count()
    if (recv != null && !ro.isType && args.length === 0 && (name === 'Any' || name === 'Count')) {
      const rc = st.c(recv);
      if (name === 'Any') {
        if (rc.coll === 'e') return [{ s: st, v: FALSEV }];
        if (rc.coll === 'ne') return [{ s: st, v: TRUEV }];
        const [s2, v] = this.boolWithImpl(st, [[recv, { coll: 'ne' }]], [[recv, { coll: 'e' }]]);
        return [{ s: s2, v }];
      }
      const [s2, v] = this.fresh(st, rc.coll === 'e' ? { lo: 0, hi: 0, int: true } : rc.coll === 'ne' ? { lo: 1, int: true } : { lo: 0, int: true });
      return [{ s: s2, v, countOf: recv }];
    }
    // locks
    const lockAcq = LOCK_ACQ[qual] || (qual !== name ? null : null) || (args.length === 0 && LOCK_ACQ[name]);
    const lockRel = LOCK_REL[qual] || (args.length === 0 && LOCK_REL[name]);
    if (lockAcq && (qual === 'Monitor.Enter' ? args.length === 1 : true)) st = st.withLocks(st.locks.concat([{ node: e, kind: lockAcq }]));
    else if (lockRel) {
      const idx = st.locks.map((l) => l.kind).lastIndexOf(lockRel);
      if (idx >= 0) { const l = st.locks.slice(); l.splice(idx, 1); st = st.withLocks(l); }
    }
    // ---- arguments: ref/out writes, escapes, collection havoc
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      const v = vs[i];
      if (a.refKind === 'out' || a.refKind === 'ref') {
        const tgt = unparen(a.expr);
        if (tgt.k === 'DeclExpr') st = this.havocDesignation(st, tgt.designation);
        else { const [s2, nv] = this.fresh(st, null); st = this.write(s2, tgt, nv); }
        continue;
      }
      if (v === undefined) continue;
      st = this.escape(st, v);
      const c = st.c(v);
      if (c.coll && !isPureArgUse(name)) { const c2 = { ...c }; delete c2.coll; st = st.withCons(v, c2); }
    }
    if (recv != null && !ro.isType && !isKnownNonEscapingCall(name)) {
      // a call on a resource keeps ownership local
    }
    // ---- side effects on fields / captured variables
    if (!isPureCall(name, tdot)) st = this.invalidateFields(st);
    if (unparen(e.expr).k === 'Name' && unparen(e.expr).sym && unparen(e.expr).sym.kind === 'localfunc') st = this.invalidateCaptured(st);
    // ---- result
    let rc = null;
    if ((NN_RESULT.has(name) && !(name === 'GetType' && args.length)) || STATIC_NN.has(qual) || (tdot && STATIC_NN.has(`${tdot}.${name}`))) rc = { n: 'nn' };
    if (EMPTY_FACTORY.has(qual)) rc = { n: 'nn', coll: 'e' };
    let [s3, v] = this.fresh(st, rc);
    if (T.isDisposableCreation(e, this.project) && this.engine.trackDisposables && e.parent && (e.parent.k === 'VarDecl')) {
      s3 = s3.withRes(v, { node: e, st: 'open', type: `${tdot ? `${tdot}.` : ''}${name}`, name: '' });
    }
    return [{ s: s3, v }];
  }

  isLinqOnLambda(e) { return e.args.length === 1 && e.args[0].expr.k === 'Lambda'; }

  isTrackedCollection(e) {
    const t = T.typeOf(e, this.project);
    return !!t && T.CONCRETE_COLLECTIONS.has(t.name);
  }

  evAssign(e, s) {
    const left = unparen(e.left);
    if (e.op === '??=') {
      const out = [];
      for (const lo of this.ev(left, s)) {
        const c = lo.s.c(lo.v);
        if (c.n === 'nn') { out.push(lo); continue; }
        const sn = c.n === 'null' ? lo.s : this.learn(lo.s, lo.v, { n: 'null' });
        if (c.n !== 'null') { const snn = this.learn(lo.s, lo.v, { n: 'nn' }); if (snn) out.push({ s: snn, v: lo.v }); }
        if (sn) for (const ro of this.ev(e.right, sn)) out.push({ s: this.assignTo(ro.s, left, ro.v, e), v: ro.v });
      }
      return out;
    }
    if (e.op !== '=') {
      // compound: x op= y
      const bop = e.op.slice(0, -1);
      const fake = { k: 'Binary', op: bop, left: e.left, right: e.right, line: e.line, col: e.col, parent: e, synthetic: true };
      return this.evBinary(fake, s).map((o) => ({ s: this.assignTo(o.s, left, o.v, e), v: o.v }));
    }
    if (left.k === 'Tuple') {
      return this.ev(e.right, s).map((o) => ({ s: this.havocDesignation(o.s, left), v: o.v }));
    }
    // evaluate target receiver first (for member / element targets)
    if (left.k === 'Member' && !this.keyOf(left)) {
      const out = [];
      const recvOuts = this.isTypeOrNamespace(left.expr) || left.expr.k === 'This' || left.expr.k === 'Base' ? [{ s, v: null }] : this.ev(left.expr, s);
      for (const r of recvOuts) {
        let st = r.s;
        if (r.v != null && this.receiverTracked(left.expr)) { st = this.deref(st, r.v, left.expr, 'member'); if (!st) continue; }
        for (const o of this.ev(e.right, st)) out.push({ s: this.escape(o.s, o.v), v: o.v });
      }
      return out;
    }
    if (left.k === 'Element') {
      const out = [];
      for (const r of this.ev(left.expr, s)) {
        let st = r.s;
        if (this.receiverTracked(left.expr)) { st = this.deref(st, r.v, left.expr, 'element'); if (!st) continue; }
        const argOuts = this.evAll(left.args.map((a) => a.expr), st);
        for (const ao of argOuts) {
          let st2 = ao.s;
          const c = st2.c(r.v);
          const lt = T.typeOf(left.expr, this.project);
          const isList = lt && (lt.name === 'List' || lt.ranks);
          if (isList) this.emptyCheck(left.expr, c.coll === 'e', 'accessed');
          if (c.coll === 'e' && !isList) st2 = st2.withCons(r.v, { ...c, coll: 'ne' });
          for (const o of this.ev(e.right, st2)) out.push({ s: this.escape(o.s, o.v), v: o.v });
        }
      }
      return out;
    }
    return this.ev(e.right, s).map((o) => ({ s: this.assignTo(o.s, left, o.v, e), v: o.v }));
  }

  assignTo(s, left, v, assign) {
    const key = this.keyOf(left);
    if (!key) return this.escape(s, v);
    let st = s.withVar(key, v);
    const c = st.c(v);
    if (c.n === 'null' && !c.src) st = st.withCons(v, { ...c, src: assign });
    const lsym = left.k === 'Name' ? left.sym : null;
    if (key.startsWith('f:') || (lsym && (lsym.outParam || lsym.refKind === 'ref' || lsym.captured))) st = this.escape(st, v);
    else {
      const r = st.res.get(v);
      if (r && r.st === 'open' && !r.name && left.k === 'Name') st = st.withRes(v, { ...r, name: left.name });
      // value used in a lambda writes?
    }
    return st;
  }

  evUnary(e, s) {
    if (e.op === '!') {
      return this.ev(e.operand, s).map((o) => {
        this.recordCondOperand(e.operand, o.s, o.v, e);
        const b = o.s.c(o.v).b;
        if (b === true) return { s: o.s, v: FALSEV };
        if (b === false) return { s: o.s, v: TRUEV };
        const [s2, v] = this.boolWithImpl(o.s, [[o.v, { b: false }]], [[o.v, { b: true }]]);
        return { s: s2, v };
      });
    }
    if (e.op === '++' || e.op === '--') {
      const target = unparen(e.operand);
      return this.ev(target, s).map((o) => {
        const c = o.s.c(o.v);
        const n = exact(c);
        let nc = null;
        if (n !== undefined) nc = { lo: n + (e.op === '++' ? 1 : -1), hi: n + (e.op === '++' ? 1 : -1), int: c.int };
        else if (c.lo !== undefined && e.op === '++') nc = { lo: c.lo + 1, int: c.int };
        else if (c.hi !== undefined && e.op === '--') nc = { hi: c.hi - 1, int: c.int };
        const [s2, nv] = this.fresh(o.s, nc);
        const s3 = this.write(s2, target, nv);
        return { s: s3, v: e.postfix ? o.v : nv };
      });
    }
    if (e.op === '-') {
      return this.ev(e.operand, s).map((o) => {
        const n = exact(o.s.c(o.v));
        if (n === undefined) { const [s2, v] = this.fresh(o.s, null); return { s: s2, v }; }
        const [s2, v] = this.fresh(o.s, { lo: -n, hi: -n, int: o.s.c(o.v).int });
        return { s: s2, v };
      });
    }
    return this.ev(e.operand, s).map((o) => { const [s2, v] = this.fresh(o.s, null); return { s: s2, v }; });
  }

  recordCondOperand(node, s, v, parent) {
    void parent;
    if (isBoolish(node)) this.recordCond(node, s, v);
  }

  evBinary(e, s) {
    const op = e.op;
    if (op === '&&' || op === '||') {
      const out = [];
      for (const lo of this.ev(e.left, s)) {
        this.recordCondOperand(e.left, lo.s, lo.v, e);
        for (const b of this.split(lo.s, lo.v)) {
          if (op === '&&' && !b.br) { out.push({ s: b.s, v: FALSEV }); continue; }
          if (op === '||' && b.br) { out.push({ s: b.s, v: TRUEV }); continue; }
          for (const ro of this.ev(e.right, b.s)) {
            this.recordCondOperand(e.right, ro.s, ro.v, e);
            out.push(ro);
          }
        }
      }
      return out;
    }
    if (op === '??') {
      const out = [];
      for (const lo of this.ev(e.left, s)) {
        const c = lo.s.c(lo.v);
        if (c.n === 'nn') { out.push(lo); continue; }
        if (c.n !== 'null') { const snn = this.learn(lo.s, lo.v, { n: 'nn' }); if (snn) out.push({ s: snn, v: lo.v }); }
        const sn = c.n === 'null' ? lo.s : this.learn(lo.s, lo.v, { n: 'null' });
        if (sn) for (const ro of this.ev(e.right, sn)) out.push(ro);
      }
      return out;
    }
    const out = [];
    for (const lo of this.ev(e.left, s)) {
      for (const ro of this.ev(e.right, lo.s)) {
        for (const r of this.binop(e, op, ro.s, lo.v, ro.v, lo, ro)) out.push(r);
      }
    }
    return out;
  }

  compareNull(s, a, b, op, node) {
    const ca = s.c(a); const cb = s.c(b);
    let x = null;
    if (ca.n === 'null') x = b; else if (cb.n === 'null') x = a;
    if (x === null) return null;
    const cx = s.c(x);
    const eq = op === '==';
    if (cx.n === 'null') return [{ s, v: eq ? TRUEV : FALSEV }];
    if (cx.n === 'nn') return [{ s, v: eq ? FALSEV : TRUEV }];
    const nullC = { n: 'null', src: node }; const nnC = { n: 'nn' };
    const [s2, v] = this.boolWithImpl(s, [[x, eq ? nullC : nnC]], [[x, eq ? nnC : nullC]]);
    return [{ s: s2, v }];
  }

  isConstLike(x) {
    x = unparen(x);
    if (!x) return false;
    if (x.k === 'Literal') return x.kind !== 'null' && x.kind !== 'default';
    if (x.k === 'Member' && /^[A-Z]/.test(x.name) && this.isTypeOrNamespace(x.expr)) return true;
    if (x.k === 'Unary' && x.op === '-' && unparen(x.operand).k === 'Literal') return true;
    return false;
  }

  binop(e, op, s, a, b, lo, ro) {
    if (['==', '!=', '<', '>', '<=', '>='].includes(op)) {
      const nA = s.c(a).n === 'null'; const nB = s.c(b).n === 'null';
      if (nA !== nB) {
        const oc = nA ? s.c(b) : s.c(a);
        const ox = nA ? e.right : e.left;
        const shortNull = nA ? a === SHORTNULLV : b === SHORTNULLV;
        if (oc.n === 'nn' || oc.b !== undefined || oc.lo !== undefined || (shortNull && this.isConstLike(ox))) {
          if (op === '==' || op === '!=') return [{ s, v: op === '==' ? FALSEV : TRUEV }];
          return [{ s, v: FALSEV }];
        }
      }
    }
    if (op === '==' || op === '!=') {
      const r = this.compareNull(s, a, b, op, e);
      if (r) return r;
      if (a === b && !isFloatish(e, this.project)) return [{ s, v: op === '==' ? TRUEV : FALSEV }];
      const ca = s.c(a); const cb = s.c(b);
      // bool == literal
      if (cb.b !== undefined && isBoolish(e.left)) {
        const want = op === '==' ? cb.b : !cb.b;
        if (ca.b !== undefined) return [{ s, v: ca.b === want ? TRUEV : FALSEV }];
        if (want) return [{ s, v: a }];
        const [s2, v] = this.boolWithImpl(s, [[a, { b: false }]], [[a, { b: true }]]);
        return [{ s: s2, v }];
      }
      const na = exact(ca); const nb = exact(cb);
      if (na !== undefined && nb !== undefined) return [{ s, v: (na === nb) === (op === '==') ? TRUEV : FALSEV }];
      const cnum = nb !== undefined ? [a, nb, ca] : na !== undefined ? [b, na, cb] : null;
      if (cnum && Number.isInteger(cnum[1])) {
        const [x, n, cx] = cnum;
        const impossible = (cx.lo !== undefined && n < cx.lo) || (cx.hi !== undefined && n > cx.hi) || (cx.ne && cx.ne.includes(n));
        if (impossible) return [{ s, v: op === '==' ? FALSEV : TRUEV }];
        const eqC = { lo: n, hi: n }; const neC = { ne: [n] };
        const [s2, v] = this.boolWithImpl(s, [[x, op === '==' ? eqC : neC]], [[x, op === '==' ? neC : eqC]]);
        // count <-> collection
        const cntOf = (nb !== undefined ? lo : ro).countOf;
        if (cntOf !== undefined && n === 0) {
          const imp = s2.impl.get(v);
          const emptyWhen = op === '==' ? 't' : 'f';
          imp[emptyWhen] = imp[emptyWhen].concat([[cntOf, { coll: 'e' }]]);
          imp[emptyWhen === 't' ? 'f' : 't'] = imp[emptyWhen === 't' ? 'f' : 't'].concat([[cntOf, { coll: 'ne' }]]);
        }
        return [{ s: s2, v }];
      }
      const [s2, v] = this.fresh(s, null);
      return [{ s: s2, v }];
    }
    if (op === '<' || op === '>' || op === '<=' || op === '>=') {
      const ca = s.c(a); const cb = s.c(b);
      const na = exact(ca); const nb = exact(cb);
      if (na !== undefined && nb !== undefined) return [{ s, v: cmp(na, op, nb) ? TRUEV : FALSEV }];
      if (nb !== undefined || na !== undefined) {
        // normalise to x OP n
        let x; let n; let o2; let cx;
        if (nb !== undefined) { x = a; n = nb; o2 = op; cx = ca; } else { x = b; n = na; o2 = flip(op); cx = cb; }
        const isInt = !!cx.int || (Number.isInteger(n) && !isFloatish(e, this.project));
        const dec = decide(cx.lo, cx.hi, o2, n);
        if (dec !== null) return [{ s, v: dec ? TRUEV : FALSEV }];
        const tC = rangeFor(o2, n, isInt); const fC = rangeFor(negate(o2), n, isInt);
        const [s2, v] = this.boolWithImpl(s, tC ? [[x, tC]] : [], fC ? [[x, fC]] : []);
        const cOf = (nb !== undefined ? lo : ro).countOf;
        if (cOf !== undefined && Number.isInteger(n)) {
          const imp = s2.impl.get(v);
          const tr = rangeFor(o2, n, true) || {};
          const fr = rangeFor(negate(o2), n, true) || {};
          if (tr.lo !== undefined && tr.lo >= 1) imp.t = imp.t.concat([[cOf, { coll: 'ne' }]]);
          if (tr.hi !== undefined && tr.hi <= 0) imp.t = imp.t.concat([[cOf, { coll: 'e' }]]);
          if (fr.lo !== undefined && fr.lo >= 1) imp.f = imp.f.concat([[cOf, { coll: 'ne' }]]);
          if (fr.hi !== undefined && fr.hi <= 0) imp.f = imp.f.concat([[cOf, { coll: 'e' }]]);
        }
        return [{ s: s2, v }];
      }
      const [s2, v] = this.fresh(s, null);
      return [{ s: s2, v }];
    }
    if (op === '/' || op === '%') {
      const cb = s.c(b);
      if (exact(cb) === 0 && cb.int && this.isIntegralExpr(e)) {
        this.report('sem-cs:division-by-zero', e.right,
          `'${shortText(this.pf.text, e.right)}' is zero here; this ${op === '/' ? 'division' : 'modulo'} throws DivideByZeroException.`,
          `'${shortText(this.pf.text, e.right)}'가 여기서 0이라 이 ${op === '/' ? '나눗셈' : '나머지 연산'}은 DivideByZeroException을 던집니다.`);
        { const [s2, v] = this.fresh(s, null); return [{ s: s2, v }]; }
      }
      const na = exact(s.c(a)); const nb = exact(cb);
      if (na !== undefined && nb !== undefined && nb !== 0) {
        const r = op === '/' ? (cb.int && s.c(a).int ? Math.trunc(na / nb) : na / nb) : na % nb;
        const [s2, v] = this.fresh(s, { lo: r, hi: r, int: cb.int && s.c(a).int });
        return [{ s: s2, v }];
      }
      const [s2, v] = this.fresh(s, null);
      return [{ s: s2, v }];
    }
    if (op === '+' || op === '-' || op === '*') {
      const ca = s.c(a); const cb = s.c(b);
      const na = exact(ca); const nb = exact(cb);
      if (na !== undefined && nb !== undefined) {
        const r = op === '+' ? na + nb : op === '-' ? na - nb : na * nb;
        if (Number.isFinite(r) && Math.abs(r) < 1e15) {
          const [s2, v] = this.fresh(s, { lo: r, hi: r, int: ca.int && cb.int });
          return [{ s: s2, v }];
        }
      }
      const isStr = op === '+' && (ca.n === 'nn' && !ca.int && ca.lo === undefined || cb.n === 'nn' && cb.lo === undefined);
      const [s2, v] = this.fresh(s, isStr ? { n: 'nn' } : null);
      return [{ s: s2, v }];
    }
    if (op === '&' || op === '|' || op === '^') {
      const ca = s.c(a); const cb = s.c(b);
      if (ca.b !== undefined && cb.b !== undefined) {
        const r = op === '&' ? ca.b && cb.b : op === '|' ? ca.b || cb.b : ca.b !== cb.b;
        return [{ s, v: r ? TRUEV : FALSEV }];
      }
    }
    const [s2, v] = this.fresh(s, null);
    return [{ s: s2, v }];
  }

  isIntegralExpr(e) {
    const t = T.typeOf(e.left, this.project);
    const r = T.typeOf(e.right, this.project);
    const intish = (x) => !x || T.INTEGRAL.has(x.name);
    if (t && !T.INTEGRAL.has(t.name)) return false;
    if (r && !T.INTEGRAL.has(r.name)) return false;
    return intish(t) && intish(r) && (!!t || !!r);
  }

  evSwitchExpr(e, s) {
    const out = [];
    for (const o of this.ev(e.expr, s)) {
      let pending = [o.s];
      for (const arm of e.arms) {
        const next = [];
        for (const st of pending) {
          for (const m of this.matchPattern(arm.pattern, st, o.v)) {
            if (!m.matched) { next.push(m.s); continue; }
            let ok = [m.s];
            if (arm.when) {
              ok = [];
              for (const w of this.ev(arm.when, m.s)) {
                for (const b of this.split(w.s, w.v)) { if (b.br) ok.push(b.s); else next.push(b.s); }
              }
            }
            for (const s2 of ok) for (const r of this.ev(arm.expr, s2)) out.push(r);
          }
        }
        pending = this.capStates(next);
        if (!pending.length) break;
      }
    }
    return out;
  }

  // returns [{ s, matched }]
  matchPattern(p, s, v) {
    if (!p) return [{ s, matched: true }, { s, matched: false }];
    const c = s.c(v);
    switch (p.k) {
      case 'ConstPattern': {
        const ex = unparen(p.expr);
        if (ex && ex.k === 'Literal' && ex.kind === 'null') {
          if (c.n === 'null') return [{ s, matched: true }];
          if (c.n === 'nn') return [{ s, matched: false }];
          const out = [];
          const t = this.learn(s, v, { n: 'null', src: p }); if (t) out.push({ s: t, matched: true });
          const f = this.learn(s, v, { n: 'nn' }); if (f) out.push({ s: f, matched: false });
          return out;
        }
        if (ex && ex.k === 'Literal' && ex.kind === 'bool') {
          if (c.b !== undefined) return [{ s, matched: c.b === ex.value }];
          const out = [];
          const t = this.learn(s, v, { b: ex.value }); if (t) out.push({ s: t, matched: true });
          const f = this.learn(s, v, { b: !ex.value }); if (f) out.push({ s: f, matched: false });
          return out;
        }
        if (ex && ex.k === 'Literal' && (ex.kind === 'int' || ex.kind === 'char') && Number.isInteger(typeof ex.value === 'string' ? ex.value.charCodeAt(0) : ex.value)) {
          const n = typeof ex.value === 'string' ? ex.value.charCodeAt(0) : ex.value;
          const en = exact(c);
          if (en !== undefined) return [{ s, matched: en === n }];
          if ((c.lo !== undefined && n < c.lo) || (c.hi !== undefined && n > c.hi) || (c.ne && c.ne.includes(n))) return [{ s, matched: false }];
          const out = [];
          const t = this.learn(s, v, { lo: n, hi: n, n: 'nn' }); if (t) out.push({ s: t, matched: true });
          const f = this.learn(s, v, { ne: [n] }); if (f) out.push({ s: f, matched: false });
          return out;
        }
        if (ex && ex.k === 'Literal' && ex.kind === 'string') {
          if (c.n === 'null') return [{ s, matched: false }];
          const out = [];
          const t = this.learn(s, v, { n: 'nn' }); if (t) out.push({ s: t, matched: true });
          out.push({ s, matched: false });
          return out;
        }
        // type or named constant: matched means not null
        if (c.n === 'null') return [{ s, matched: false }];
        {
          const out = [];
          const t = p.maybeType ? this.learn(s, v, { n: 'nn' }) : s;
          if (t) out.push({ s: t, matched: true });
          out.push({ s, matched: false });
          return out;
        }
      }
      case 'DiscardPattern': return [{ s, matched: true }];
      case 'VarPattern': return [{ s: this.bindDesignation(s, p.designation, v), matched: true }];
      case 'TypePattern': case 'DeclPattern': case 'RecursivePattern': case 'ListPattern': {
        if (c.n === 'null') return [{ s, matched: false }];
        const out = [];
        let t = this.learn(s, v, { n: 'nn' });
        if (t && p.sym) t = t.withVar(`v${p.sym.id}`, v);
        if (t && p.k === 'RecursivePattern' && p.props && p.props.length === 0 && !p.positional && !p.type) {
          // `is { }` : exactly a not-null check
          out.push({ s: t, matched: true });
          const f = this.learn(s, v, { n: 'null', src: p });
          if (f) out.push({ s: f, matched: false });
          return out;
        }
        if (t) out.push({ s: t, matched: true });
        out.push({ s, matched: false });
        return out;
      }
      case 'NotPattern': return this.matchPattern(p.pattern, s, v).map((m) => ({ s: m.s, matched: !m.matched }));
      case 'AndPattern': {
        const out = [];
        for (const m of this.matchPattern(p.left, s, v)) {
          if (!m.matched) { out.push(m); continue; }
          for (const m2 of this.matchPattern(p.right, m.s, v)) out.push(m2);
        }
        return out;
      }
      case 'OrPattern': {
        const out = [];
        for (const m of this.matchPattern(p.left, s, v)) {
          if (m.matched) { out.push(m); continue; }
          for (const m2 of this.matchPattern(p.right, m.s, v)) out.push(m2);
        }
        return out;
      }
      case 'RelPattern': {
        const ex = unparen(p.expr);
        const n = ex && ex.k === 'Literal' && (ex.kind === 'int' || ex.kind === 'real') ? ex.value : undefined;
        if (n === undefined) return [{ s, matched: true }, { s, matched: false }];
        const dec = decide(c.lo, c.hi, p.op, n);
        if (dec !== null) return [{ s, matched: dec }];
        const isInt = Number.isInteger(n) && ex.kind === 'int';
        const out = [];
        const tC = rangeFor(p.op, n, isInt); const fC = rangeFor(negate(p.op), n, isInt);
        const t = tC ? this.learn(s, v, tC) : s; if (t) out.push({ s: t, matched: true });
        const f = fC ? this.learn(s, v, fC) : s; if (f) out.push({ s: f, matched: false });
        return out;
      }
      default: return [{ s, matched: true }, { s, matched: false }];
    }
  }

  bindDesignation(s, d, v) {
    if (d && d.k === 'SingleDesignation' && d.sym) return s.withVar(`v${d.sym.id}`, v);
    if (d && d.k === 'ParenDesignation') return this.havocDesignation(s, d);
    return s;
  }
}

function cmp(a, op, b) {
  switch (op) { case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b; default: return false; }
}
function flip(op) { return { '<': '>', '>': '<', '<=': '>=', '>=': '<=' }[op]; }
function negate(op) { return { '<': '>=', '>': '<=', '<=': '>', '>=': '<' }[op]; }
function decide(lo, hi, op, n) {
  switch (op) {
    case '<': if (hi !== undefined && hi < n) return true; if (lo !== undefined && lo >= n) return false; break;
    case '<=': if (hi !== undefined && hi <= n) return true; if (lo !== undefined && lo > n) return false; break;
    case '>': if (lo !== undefined && lo > n) return true; if (hi !== undefined && hi <= n) return false; break;
    case '>=': if (lo !== undefined && lo >= n) return true; if (hi !== undefined && hi < n) return false; break;
    default: break;
  }
  return null;
}
function rangeFor(op, n, isInt) {
  if (!isInt) {
    // keep only non-strict bounds for reals
    switch (op) { case '<': case '<=': return { hi: n }; case '>': case '>=': return { lo: n }; default: return null; }
  }
  switch (op) {
    case '<': return { hi: Math.ceil(n) - (Number.isInteger(n) ? 1 : 0) };
    case '<=': return { hi: Math.floor(n) };
    case '>': return { lo: Math.floor(n) + 1 };
    case '>=': return { lo: Math.ceil(n) };
    default: return null;
  }
}

function isBoolish(e) {
  e = unparen(e);
  if (!e) return false;
  if (e.k === 'Binary') return ['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(e.op);
  if (e.k === 'Is') return true;
  if (e.k === 'Unary' && e.op === '!') return true;
  if (e.k === 'Name' && e.sym) {
    const t = T.symType(e.sym);
    return !!t && t.name === 'bool' && !t.nullable;
  }
  if (e.k === 'Literal' && e.kind === 'bool') return true;
  return false;
}

function isFloatish(e, project) {
  const l = T.typeOf(e.left, project); const r = T.typeOf(e.right, project);
  return !!((l && (l.name === 'double' || l.name === 'float')) || (r && (r.name === 'double' || r.name === 'float')));
}

function isPureArgUse(name) {
  return ['Contains', 'ContainsKey', 'IndexOf', 'Equals', 'WriteLine', 'Write', 'Format', 'Join', 'ReferenceEquals', 'IsNullOrEmpty', 'Assert', 'AreEqual', 'nameof'].includes(name);
}
function isKnownNonEscapingCall() { return true; }
function isPureCall(name, tdot) {
  if (tdot === 'string' || tdot === 'String' || tdot === 'Math' || tdot === 'Path' || tdot === 'Convert' || tdot === 'Enumerable' || tdot === 'Debug') return true;
  return ['ToString', 'Equals', 'GetHashCode', 'Contains', 'ContainsKey', 'IndexOf', 'StartsWith', 'EndsWith', 'Substring', 'Trim', 'ToUpper', 'ToLower',
    'IsNullOrEmpty', 'IsNullOrWhiteSpace', 'Format', 'Any', 'Count', 'Where', 'Select', 'First', 'FirstOrDefault', 'ToList', 'ToArray', 'TryGetValue',
    'Parse', 'TryParse', 'Max', 'Min', 'Abs', 'Split', 'Replace', 'Join', 'Concat', 'nameof', 'GetType', 'CompareTo', 'Compare', 'ReferenceEquals'].includes(name);
}

function shortText(src, node) {
  let t = nodeText(src, node).replace(/\s+/g, ' ');
  if (t.length > 40) t = `${t.slice(0, 37)}...`;
  return t;
}

module.exports = { FnSE, shortText };
