'use strict';

// Per-function abstract interpreter.
//
// The function's CFG (core/cfamily, constant conditions kept) is solved with a
// worklist over disjunctive states: each program point holds up to K states,
// partitioned by their property signature (nullness, allocation status, locks,
// uninitialized variables — see State.part()). States with the same signature
// are joined; past K the point collapses to one state. Loop headers widen
// (with thresholds taken from the function's constants) after a few visits.
// Branch edges refine the state with the condition (assume), so a state that
// went through `p == NULL` carries p = null with the event that explains it.
//
// After the fixpoint, a check pass replays every reachable block once from
// its final input states with reporting enabled; defects found there are
// definite on the path the state stands for (or 'possible' for interval
// alarms). The check pass also records the facts a summary needs.

const cf = require('../cfamily');
const I = require('./interval');
const { State, joinStates, vJoin, symEq } = require('./state');
const { BY_CHECKER, POSSIBLE_OK, LOWER } = require('./catalog');

const T = cf.types;
let SEQ = 0;

const ARITH = new Set(['+', '-', '*', '/', '%', '<<', '>>', '&', '|', '^']);
const CMP = new Set(['<', '<=', '>', '>=', '==', '!=']);
const NEGATE = { '<': '>=', '<=': '>', '>': '<=', '>=': '<', '==': '!=', '!=': '==' };
const SWAP = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '==': '==', '!=': '!=' };

function skip(e) {
  while (e && e.type === 'ParenExpr') e = e.expr;
  return e;
}

function hasSideEffects(e) {
  let found = false;
  cf.walk(e, (n) => {
    if (found) return cf.walk.STOP;
    if (n.type === 'AssignExpr' || n.type === 'CallExpr' || n.type === 'NewExpr' || n.type === 'DeleteExpr' || n.type === 'StmtExpr'
      || (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--'))) { found = true; return cf.walk.STOP; }
    if (n.type === 'SizeofExpr' || n.type === 'AlignofExpr' || n.type === 'LambdaExpr') return cf.walk.SKIP;
    return undefined;
  });
  return found;
}

function isDep(k, K) {
  if (k === K) return false;
  if (k.startsWith(K)) {
    const c = k[K.length];
    return c === '.' || c === '-' || c === '[';
  }
  if (k.startsWith(`*${K}`)) {
    const c = k[K.length + 1];
    return c === undefined || c === '.' || c === '-' || c === '[';
  }
  return false;
}

function isMemKey(k) {
  return k.includes('->') || k.startsWith('*') || k.includes('[') || k.startsWith('this');
}

const MAXEV = 8;

class FnAnalyzer {
  constructor(engine, unit, fn, key) {
    this.E = engine;
    this.unit = unit;
    this.fn = fn;
    this.key = key;
    this.name = fn.qname || fn.name;
    this.file = fn.loc.file;
    this.target = unit.target;
    this.lang = unit.lang;
    this.K = engine.opts.k;
    this.reporting = false;
    this.quiet = 0;
    this.findings = [];
    this.seen = new Set();
    this.aborted = false;
    this.cfg = cf.buildCFG(fn, { constantConditions: 'keep', target: unit.target });
    // Blocks inside natural loops (loop headers are marked by the front end).
    this.loopBlocks = new Set();
    try {
      for (const L of this.cfg.loops()) { for (const b of L.blocks) this.loopBlocks.add(b); }
    } catch { /* no loop info */ }
    this.leaked = new Set();
    this.released = new Set();
    this.params = new Map();
    (fn.params || []).forEach((p, i) => { if (p.symbol) this.params.set(p.symbol.id, i); });
    this.rangeCache = new Map();
    this.prepare();
    // summary facts
    this.exits = [];
    this.derefEv = new Map();
    this.paramNullChecked = new Set();
    this.paramSinks = new Map();
    this.paramPre = new Map();
    this.acquired = new Map();
    this.lockOrders = [];
    this.blocksEv = null;
    this.writesGlobals = false;
    this.writesMem = false;
    this.edgeStats = new Map();
    this.nullChecks = new Map();
    this.uses = new Map();
  }

  // ---------------------------------------------------------------- setup

  prepare() {
    const consts = new Set([0, 1, -1]);
    const addrTaken = new Set();
    const byRef = new Set();
    cf.walk(this.fn.body, (n) => {
      if (n.type === 'IntegerLiteral' || n.type === 'CharLiteral') {
        const v = Number(n.value);
        if (Number.isFinite(v)) { consts.add(v); consts.add(v - 1); consts.add(v + 1); }
      } else if (n.type === 'UnaryExpr' && n.op === '&') {
        let a = skip(n.arg);
        while (a && (a.type === 'MemberExpr' && !a.arrow || a.type === 'IndexExpr')) a = skip(a.object);
        if (a && a.type === 'Identifier' && a.symbol) addrTaken.add(a.symbol.id);
      } else if (n.type === 'VarDecl' && isRefType(n.ctype) && n.init) {
        const a = skip(n.init);
        if (a && a.type === 'Identifier' && a.symbol) addrTaken.add(a.symbol.id);
      } else if (n.type === 'VarDecl' && n.ctype && n.ctype.kind === 'array' && n.ctype.size != null) {
        consts.add(n.ctype.size); consts.add(n.ctype.size - 1);
      } else if (n.type === 'LambdaExpr') {
        cf.walk(n.body, (m) => { if (m.type === 'Identifier' && m.symbol) byRef.add(m.symbol.id); });
        return cf.walk.SKIP;
      } else if (n.type === 'AsmStmt') this.hasAsm = true;
      return undefined;
    });
    for (const id of byRef) addrTaken.add(id);
    this.addrTaken = addrTaken;
    this.thresholds = [...consts].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  }

  budget() {
    const now = Date.now();
    if (now >= this.deadline || now >= this.E.deadline) { this.aborted = true; return false; }
    if (++this.steps > this.E.opts.maxSteps) { this.aborted = true; return false; }
    return true;
  }

  // ---------------------------------------------------------------- driver

  run() {
    const g = this.cfg;
    this.deadline = Date.now() + this.E.opts.functionMs;
    this.steps = 0;
    const order = g.rpo();
    const idx = new Map();
    order.forEach((b, i) => idx.set(b, i));
    this.order = order;
    const entry = this.entryState();
    const IN = new Map();
    const EOUT = new Map();
    const visits = new Map();
    const done = new Set();
    const queue = new Set([g.entry]);
    while (queue.size) {
      if (!this.budget()) break;
      let b = null;
      for (const x of queue) if (!b || idx.get(x) < idx.get(b)) b = x;
      queue.delete(b);
      let ins;
      if (b === g.entry) ins = [entry];
      else {
        ins = [];
        for (const e of b.preds) { const s = EOUT.get(e); if (s) for (const x of s) ins.push(x); }
      }
      const n = (visits.get(b) || 0) + 1;
      visits.set(b, n);
      ins = this.normalize(ins, b.loopHeader ? IN.get(b) : null, n);
      if (done.has(b) && sameStates(IN.get(b), ins)) continue;
      IN.set(b, ins);
      done.add(b);
      const outs = [];
      for (const s of ins) {
        const o = this.transferBlock(b, s);
        if (!o.dead) outs.push(o);
        if (this.aborted) break;
      }
      if (this.aborted) break;
      for (const e of b.succs) {
        if (e.to === g.exit) continue;
        const prev = EOUT.get(e);
        const next = this.edgeStates(e, outs);
        EOUT.set(e, next);
        if (!idx.has(e.to)) continue;
        if (!prev || !sameStates(prev, next) || !done.has(e.to)) queue.add(e.to);
      }
    }
    if (this.aborted) return this.result();
    // check pass
    this.reporting = true;
    this.IN = IN;
    for (const b of order) {
      const ins = IN.get(b);
      if (!ins) continue;
      for (const s of ins) {
        if (!this.budget()) break;
        this.curBlock = b;
        const o = this.transferBlock(b, s);
        if (o.dead) continue;
        for (const e of b.succs) {
          if (e.to === g.exit) this.exitCheck(o, e);
          else this.edgeStates(e, [o], true);
        }
      }
      if (this.aborted) break;
    }
    this.reporting = false;
    if (!this.aborted) this.postChecks(IN);
    return this.result();
  }

  result() {
    return { findings: this.aborted ? [] : this.findings, aborted: this.aborted };
  }

  normalize(states, prev, visits) {
    if (!states.length) return states;
    const groups = new Map();
    for (const s of states) {
      if (s.dead) continue;
      const p = s.part();
      groups.set(p, groups.has(p) ? joinStates(groups.get(p), s) : s);
    }
    let list = [...groups.values()];
    const collapse = list.length > this.K || visits > 12;
    if (collapse && list.length > 1) {
      let j = list[0];
      for (let i = 1; i < list.length; i++) j = joinStates(j, list[i]);
      list = [j];
    }
    if (prev && prev.length && visits > this.E.opts.widenAfter) {
      const th = visits > 30 ? [] : this.thresholds;
      if (list.length === 1 && (collapse || prev.length > 1)) {
        let p = prev[0];
        for (let i = 1; i < prev.length; i++) p = joinStates(p, prev[i]);
        list = [joinStates(p, joinStates(p, list[0]), th)];
      } else {
        const byPart = new Map(prev.map((s) => [s.part(), s]));
        list = list.map((s) => {
          const p = byPart.get(s.part());
          return p ? joinStates(p, joinStates(p, s), th) : s;
        });
      }
    }
    return list;
  }

  transferBlock(b, s) {
    const st = s.clone();
    st.tmp = null;
    this.curBlock = b;
    const items = cf.cfg.blockItems(b);
    const cond = b.terminator && b.terminator.cond;
    for (const item of items) {
      if (st.dead) break;
      try {
        this.transferItem(st, item, item === cond);
      } catch (err) {
        if (err && err.absintAbort) { this.aborted = true; st.dead = 'hard'; break; }
        // Unexpected node shapes must not stop the analysis: forget this path.
        if (this.E.debug) throw err;
        st.dead = 'hard';
        this.E.internalErrors++;
      }
    }
    return st;
  }

  transferItem(st, item, isCond) {
    switch (item.type) {
      case 'ExprStmt': if (item.expr) this.eval(st, item.expr); return;
      case 'VarDecl': this.declare(st, item); return;
      case 'BindingDecl':
        if (item.init) this.eval(st, item.init);
        for (const b of item.bindings || []) if (b) st.del(`v${b.id}`);
        return;
      case 'ReturnStmt': {
        let v;
        if (item.arg) {
          v = this.eval(st, item.arg);
          const rt = item.functionReturnType || (this.fn.ctype && this.fn.ctype.ret);
          if (rt) v = this.convert(v, rt, item.arg.ctype, item.arg);
        }
        st.ret = { v: v || null, node: item };
        return;
      }
      case 'Declaration':
        // `if (T *p = f())`: the condition declares its variable.
        if (isCond) for (const d of item.declarators || []) if (d && d.type === 'VarDecl') this.declare(st, d);
        return;
      case 'BreakStmt': case 'ContinueStmt': case 'GotoStmt': case 'NullStmt': case 'LabelStmt':
      case 'StaticAssert': case 'ParamDecl': case 'CatchClause':
      case 'UsingDirective': case 'UsingDecl': case 'AliasDecl': case 'NamespaceAlias':
        return;
      case 'AsmStmt': this.havocAll(st); return;
      default:
        if (item.type === 'RangeForStmt') return;
        if (isCond) this.condition(st, item);
        else this.eval(st, item);
    }
  }

  // Evaluate a branch / switch condition (with side effects) and remember
  // call results so that edge refinement can see them.
  condition(st, e) {
    st.tmp = new Map();
    const nc = this.nullCheckOf(e);
    let before = null;
    if (nc) before = this.peek(st, nc);
    this.condCalls = st.tmp;
    this.eval(st, e);
    this.condCalls = null;
    if (this.reporting && nc && before) {
      const rec = this.nullChecks.get(e) || { n: 0, dref: 0, ev: null, ptr: nc };
      rec.n++;
      if (before.dref && before.nul === 'non') { rec.dref++; rec.ev = rec.ev || before.dref; }
      this.nullChecks.set(e, rec);
    }
    if (this.reporting) this.loopBoundCheck(st, e);
  }

  entryState() {
    const st = new State();
    st.dp = new Set();
    const isMain = this.fn.name === 'main' && !this.fn.qualifier;
    (this.fn.params || []).forEach((p, i) => {
      if (!p.symbol) return;
      const t = this.T(p.ctype || p.symbol.type);
      const k = `v${p.symbol.id}`;
      if (isMain && i === 1 && T.isPointer(t)) {
        st.addObj({ id: 'ARGV', kind: 'argv', name: 'argv', size: null, init: 'yes' });
        st.set(k, { pt: [{ o: 'ARGV', off: I.konst(0) }], nul: 'non' });
        return;
      }
      if (isMain && i === 0) { st.set(k, { iv: I.make(1, 2147483647) }); return; }
      if (T.isPointer(t)) {
        const pid = `P${i}`;
        const pointee = T.pointee(t);
        st.addObj({ id: pid, kind: 'param', name: p.name || `#${i + 1}`, size: null, pidx: i, init: 'yes', esz: this.sizeOf(pointee) || 1 });
        st.set(k, { pt: [{ o: pid, off: I.konst(0) }], par: i });
      } else if (T.isInteger(t)) {
        st.set(k, { iv: this.range(t), par: i, sym: { s: `p${i}`, d: 0 } });
      }
    });
    return st;
  }

  // ---------------------------------------------------------------- utils

  T(t) {
    if (!t) return T.T.unknown;
    let c = T.canonical(t);
    if (c && c.kind === 'reference') c = T.canonical(c.to);
    return c || T.T.unknown;
  }

  isPtrT(t) { const c = this.T(t); return c.kind === 'pointer' || c.kind === 'array' || c.kind === 'nullptr' || c.kind === 'function'; }

  isIntT(t) { return T.isInteger(this.T(t)); }

  range(t) {
    const c = this.T(t);
    if (!T.isInteger(c)) return null;
    const k = c.kind === 'enum' ? `enum:${c.name}:${c.decl && c.decl.loc ? `${c.decl.loc.file}:${c.decl.loc.start}` : ''}` : c.name + (c.bits || '');
    if (this.rangeCache.has(k)) return this.rangeCache.get(k);
    let r = null;
    try {
      const x = T.intRange(c, this.target);
      if (x) r = { lo: Number(x.min), hi: Number(x.max), min: Number(x.min), max: Number(x.max), bits: x.bits, unsigned: Number(x.min) === 0 };
      // an enum object holds one of its enumerators (values outside need an explicit cast)
      if (r && c.kind === 'enum' && c.constants && c.constants.length) {
        const vals = c.constants.map((k) => Number(k.value));
        r = { ...r, min: Math.min(...vals), max: Math.max(...vals), lo: Math.min(...vals), hi: Math.max(...vals) };
      }
    } catch { r = null; }
    this.rangeCache.set(k, r);
    return r;
  }

  rangeIv(t) {
    const r = this.range(t);
    if (!r) return I.TOP;
    const iv = I.make(r.min, r.max);
    // marks a range that only comes from the type (not a possible OVERRUN by itself)
    if (iv && typeof iv === 'object' && !Object.isFrozen(iv)) iv.bits = r.bits;
    return iv;
  }

  sizeOf(t) {
    if (!t) return null;
    try {
      const c = this.T(t);
      if (c.kind === 'void') return 1;
      // records with members of unknown type have no size (front end)
      if (c.kind === 'unknown' || c.kind === 'dependent' || c.kind === 'auto') return null;
      const s = T.sizeOf(c, this.target);
      return s == null || Number(s) <= 0 ? null : Number(s);
    } catch { return null; }
  }

  typeVal(t) {
    const c = this.T(t);
    if (T.isInteger(c)) return { iv: this.rangeIv(c) };
    return {};
  }

  src(node, max = 60) {
    if (!node) return '';
    let s = '';
    if (node.loc && node.loc.macro) s = exprText(node);
    else try { s = cf.sourceText(this.unit, node) || ''; } catch { s = ''; }
    s = s.replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max - 3)}...` : s;
  }

  ev(node, tag, en, ko) {
    const loc = (node && node.loc) || this.fn.loc;
    return { seq: ++SEQ, file: loc.file, line: loc.line, col: loc.col, tag, text: { en, ko } };
  }

  // ---------------------------------------------------------------- reporting

  report(checker, node, message, events, opts = {}) {
    if (!this.reporting || this.quiet) return;
    const meta = BY_CHECKER.get(checker);
    if (!meta) return;
    const confidence = opts.confidence || 'definite';
    if (confidence === 'possible' && !POSSIBLE_OK.has(checker)) return;
    const loc = (node && node.loc) || this.fn.loc;
    if (!loc || !loc.file || loc.file.startsWith('<')) return;
    const dk = `${checker}|${loc.file}|${loc.line}|${loc.col}|${message.en}`;
    if (this.seen.has(dk)) return;
    this.seen.add(dk);
    const evs = [];
    const seenEv = new Set();
    const flat = (events || []).flat().filter(Boolean).sort((a, b) => (a.seq || 0) - (b.seq || 0));
    for (const e of flat) {
      const k = `${e.file}|${e.line}|${e.tag}|${e.text.en}`;
      if (seenEv.has(k)) continue;
      seenEv.add(k);
      evs.push(e);
    }
    let kept = evs;
    if (kept.length > MAXEV - 1) kept = [kept[0], ...kept.slice(kept.length - (MAXEV - 2))];
    const outEvents = kept.map((e) => ({ line: e.line, file: e.file, tag: e.tag, text: e.text, main: false }));
    outEvents.push({ line: loc.line, file: loc.file, tag: opts.tag || checker.toLowerCase(), text: message, main: true });
    const f = {
      rule: `absint:${checker}`,
      file: loc.file,
      line: loc.line,
      column: loc.col,
      endLine: loc.endLine,
      message,
      events: outEvents,
      function: this.name,
      checker,
      confidence,
      category: meta.category,
      cwe: meta.cwe,
    };
    if (confidence === 'possible') f.severity = LOWER[meta.severity];
    this.findings.push(f);
  }

  // ---------------------------------------------------------------- objects

  varObjId(sym) { return `V${sym.id}`; }

  varObj(st, sym, init) {
    const id = this.varObjId(sym);
    let o = st.obj(id);
    if (o) return o;
    const t = sym.type;
    const size = this.sizeOf(t);
    const isLocal = sym.storage === 'automatic' && !this.params.has(sym.id);
    o = {
      id, kind: sym.storage === 'automatic' ? 'stack' : 'global', name: sym.name,
      size: size != null ? I.konst(size) : null, esz: this.elemSizeOfArray(t),
      init: init || 'yes', fnKey: isLocal ? this.key : null, vsym: sym.id, scalar: !T.isArray(this.T(t)) && !T.isRecord(this.T(t)),
      single: !T.isArray(this.T(t)) && this.T(t).kind !== 'unknown',
    };
    if (this.params.has(sym.id)) o.kind = 'stack';
    return st.addObj(o);
  }

  elemSizeOfArray(t) {
    const c = this.T(t);
    if (c.kind === 'array') return this.sizeOf(c.of) || 1;
    return this.sizeOf(c) || 1;
  }

  subObj(st, parentId, member, ftype) {
    const id = `${parentId}.${member}`;
    let o = st.obj(id);
    if (o) return o;
    const parent = st.obj(parentId);
    const size = this.sizeOf(ftype);
    o = {
      id, kind: parent ? parent.kind : 'unknown', name: parent ? `${parent.name}.${member}` : member,
      size: size != null && T.isArray(this.T(ftype)) ? I.konst(size) : (size != null ? I.konst(size) : null),
      esz: this.elemSizeOfArray(ftype), init: parent && parent.init === 'no' ? 'no' : 'yes', fnKey: parent ? parent.fnKey : null,
      tnt: parent ? parent.tnt : undefined, sub: true, parent: parentId,
    };
    return st.addObj(o);
  }

  newHeap(st, node, ak, sizeV, extra = {}) {
    const id = `H${node.loc.start}:${node.loc.file === this.file ? '' : node.loc.file}`;
    const old = st.obj(id);
    const o = {
      id, kind: 'heap', name: extra.name || ak, ak, size: sizeV && sizeV.iv ? I.meet(sizeV.iv, I.make(0, I.INF)) : null,
      ssym: sizeV && sizeV.sym ? sizeV.sym : null, esz: 1, st: 'live', aev: extra.aev || [],
      init: extra.zero ? 'yes' : 'yes', term: extra.zero ? 'yes' : extra.term, slen: extra.slen, tnt: extra.tnt,
    };
    if (old && old.st === 'live' && !old.esc && this.isReferenced(st, id)) {
      // Same site again while the previous block is still referenced: two
      // live blocks share the id until a store overwrites the last pointer.
      o.multi = true;
      if (old.ak && !old.multi) this.pendingRealloc = { id, old };
    }
    else if (old && old.st === 'live' && !old.esc && old.ak && !old.multi && this.reporting && !this.isReferenced(st, id)) {
      // previous allocation from this site is unreachable now
      this.leakReport(st, old, node, null);
    }
    if (o.multi) o.size = old.size && o.size ? I.join(old.size, o.size) : null;
    st.objs.set(id, o);
    st.own.add(id);
    st.touch();
    return o;
  }

  isReferenced(st, id, except) {
    for (const [k, v] of st.env) {
      if (k === except) continue;
      if (v.pt && v.pt.some((t) => t.o === id)) return true;
      if (v.rid === id) return true;
      if (v.reall === id) return true;
    }
    if (st.ret && st.ret.v && st.ret.v.pt && st.ret.v.pt.some((t) => t.o === id)) return true;
    return false;
  }

  // ---------------------------------------------------------------- keys

  keyOf(e) {
    e = skip(e);
    if (!e) return null;
    switch (e.type) {
      case 'Identifier': {
        const s = e.symbol;
        if (!s) return null;
        if (s.kind === 'field') return `this->${e.name}`;
        if (s.kind === 'variable' || s.kind === 'parameter') {
          if (s.type && T.canonical(s.type) && T.canonical(s.type).kind === 'reference') return null;
          return `v${s.id}`;
        }
        return null;
      }
      case 'CastExpr': {
        if (!e.arg) return null;
        const to = this.T(e.ctype), from = this.T(e.arg.ctype);
        if ((to.kind === 'pointer' && from.kind === 'pointer') || (T.isInteger(to) && T.isInteger(from) && (this.sizeOf(to) || 0) >= (this.sizeOf(from) || 0) && T.isSigned(to, this.target) === T.isSigned(from, this.target))) return this.keyOf(e.arg);
        return null;
      }
      case 'MemberExpr': {
        const b = this.keyOf(e.object);
        return b ? `${b}${e.arrow ? '->' : '.'}${e.member}` : null;
      }
      case 'UnaryExpr':
        if (e.op === '*') { const b = this.keyOf(e.arg); return b ? `*${b}` : null; }
        return null;
      case 'IndexExpr': {
        const b = this.keyOf(e.object);
        if (!b) return null;
        const c = this.constOf(e.index);
        return c === null ? null : `${b}[${c}]`;
      }
      case 'ThisExpr': return 'this';
      default: return null;
    }
  }

  constOf(e) {
    try {
      const r = T.constValue(e, { target: this.target });
      if (r && !r.float && !r.invalid && r.value !== undefined) return Number(r.value);
    } catch { /* not constant */ }
    return null;
  }

  isConstCond(e) {
    if (!e) return true;
    if (e.loc && e.loc.macro) return true;
    if (this.constOf(e) !== null) return true;
    let usesVar = false, constVar = false;
    cf.walk(e, (n) => {
      if (n.type === 'Identifier' && n.symbol) {
        if (n.symbol.kind === 'variable' || n.symbol.kind === 'parameter' || n.symbol.kind === 'field') {
          usesVar = true;
          const t = n.symbol.type && T.canonical(n.symbol.type);
          if (t && t.const && n.symbol.storage === 'static') constVar = true;
        }
      }
      if (n.type === 'SizeofExpr') return cf.walk.SKIP;
      return undefined;
    });
    return !usesVar || constVar;
  }

  // Kill facts derived from key K (K itself is set by the caller).
  killDeps(st, K) {
    for (const k of [...st.env.keys()]) if (isDep(k, K)) st.env.delete(k);
    st.touch();
  }

  killMem(st) {
    for (const k of [...st.env.keys()]) if (isMemKey(k)) st.env.delete(k);
    st.touch();
  }

  killAddrTaken(st) {
    for (const id of this.addrTaken) {
      const k = `v${id}`;
      const v = st.get(k);
      if (v) st.set(k, this.forget(v));
      this.killDeps(st, k);
    }
  }

  killGlobals(st) {
    for (const k of [...st.env.keys()]) {
      if (k[0] !== 'v') continue;
      const id = Number(k.slice(1).split(/[.\-[]/)[0]);
      const sym = this.E.symById(this.unit, id);
      if (sym && sym.storage === 'static') st.env.delete(k);
    }
    st.touch();
  }

  // Unknown code may have written the variable: keep only facts that cannot change.
  forget(v) {
    return {};
  }

  havocAll(st) {
    this.killMem(st);
    this.killAddrTaken(st);
    this.killGlobals(st);
  }

  // ---------------------------------------------------------------- declarations

  declare(st, d) {
    const sym = d.symbol;
    if (!sym) { if (d.init) this.eval(st, d.init); return; }
    const k = `v${sym.id}`;
    const t = this.T(sym.type || d.ctype);
    const storage = (d.specs && d.specs.storage) || [];
    if (storage.includes('static') || storage.includes('extern') || storage.includes('thread_local') || sym.storage === 'static') {
      st.del(k);
      this.killDeps(st, k);
      return;
    }
    if (isRefType(sym.type || d.ctype)) { if (d.init) this.eval(st, d.init); st.del(k); return; }
    const par = cf.parentOf(d), gp = par && cf.parentOf(par);
    if ((par && par.type === 'RangeForStmt') || (gp && gp.type === 'RangeForStmt' && cf.parentKey(par) === 'decl')) { st.set(k, this.typeVal(t)); return; }
    this.killDeps(st, k);
    // C++ class objects (also unknown library classes such as std::unique_ptr or a
    // ScopedFd guard): constructor arguments are handed to the new object, which owns them
    if (this.lang === 'cpp' && d.init && (T.isRecord(t) || t.kind === 'unknown' || t.kind === 'dependent')
      && (d.init.type === 'ParenListInit' || d.init.type === 'InitList' || (t.kind !== 'record' && d.initStyle !== 'assign'))) {
      const args = d.init.type === 'ParenListInit' ? d.init.args || [] : d.init.type === 'InitList' ? d.init.items || [] : [d.init];
      for (const a of args) { if (!a) continue; const v = this.eval(st, a); this.escapeValue(st, v); if (v && v.pt) this.pointeeWritten(st, v, a); }
      if (T.isRecord(t)) { st.objs.delete(this.varObjId(sym)); this.varObj(st, sym, 'yes'); } else st.del(k);
      return;
    }
    if (t.kind === 'array' || T.isRecord(t)) {
      st.objs.delete(this.varObjId(sym));
      const trackInit = this.trackableAggregate(t);
      const o = this.varObj(st, sym, d.init || !trackInit ? 'yes' : 'no');
      const m = st.mut(o.id);
      if (t.kind === 'array' && t.vla && t.sizeExpr) {
        const n = this.eval(st, t.sizeExpr);
        const esz = this.sizeOf(t.of) || 1;
        m.size = n.iv ? I.mul(n.iv, I.konst(esz)) : null;
        if (n.sym && esz === 1) m.ssym = n.sym;
      }
      if (d.init) this.initAggregate(st, m, t, d.init);
      return;
    }
    if (d.init) {
      let init = d.init;
      if (init.type === 'InitList') { const items = init.items || []; init = items[0] || null; for (const x of items.slice(1)) this.eval(st, x); }
      if (init && init.type === 'ParenListInit') { const a = init.args || []; init = a.length === 1 ? a[0] : null; }
      if (!init) { st.set(k, this.isIntT(t) ? { iv: I.konst(0) } : this.isPtrT(t) ? this.nullV(d, sym.name) : {}); return; }
      const v = this.eval(st, init);
      this.store(st, { k: 'var', key: k, sym, type: sym.type, node: d }, v, d, init);
      return;
    }
    if (this.lang === 'cpp' && T.isRecord(t)) { st.del(k); return; }
    if (T.isScalar(t) || t.kind === 'pointer' || T.isInteger(t) || t.kind === 'enum') {
      st.set(k, { un: { ev: this.ev(d, 'var_decl', `Declaring variable ${sym.name} without initializer.`, `${sym.name} 변수를 초기화 없이 선언합니다.`) } });
    } else st.del(k);
  }

  trackableAggregate(t) {
    if (t.kind === 'array') {
      const of = this.T(t.of);
      return T.isScalar(of) || of.kind === 'pointer' || (T.isRecord(of) && this.trackableAggregate(of));
    }
    if (T.isRecord(t)) {
      if (this.lang !== 'cpp') return true;
      const decl = t.decl;
      if (!decl || !decl.members) return false;
      if ((t.bases || []).length) return false;
      for (const m of decl.members) {
        if (m.type !== 'Declaration') return false;
        for (const dd of m.declarators || []) {
          if (dd.type === 'FunctionDecl') return false;
          if (dd.init) return false;
          const ft = this.T(dd.ctype);
          if (T.isRecord(ft) || ft.kind === 'unknown') return false;
        }
      }
      return true;
    }
    return false;
  }

  initAggregate(st, m, t, init) {
    m.init = 'yes';
    if (init.type === 'StringLiteral' && t.kind === 'array') {
      const n = (init.value || '').length;
      if (t.size != null) {
        if (n >= t.size) { m.term = n > t.size ? undefined : 'no'; m.slen = undefined; }
        else { m.term = 'yes'; m.slen = I.konst(n); }
      }
      return;
    }
    if (init.type === 'InitList') {
      const items = init.items || [];
      for (const x of items) this.eval(st, x);
      if (t.kind === 'array' && T.isCharType(this.T(t.of)) && t.size != null) {
        if (items.length < t.size) m.term = 'yes';
        else {
          const last = items[items.length - 1];
          const c = last ? this.constOf(last) : null;
          m.term = c === 0 ? 'yes' : (items.some((x) => this.constOf(x) === 0) ? 'yes' : 'no');
        }
      }
      return;
    }
    const v = this.eval(st, init);
    if (v.tnt) m.tnt = v.tnt;
  }

  nullV(node, name) {
    return { nul: 'null', iv: I.konst(0), nev: [this.ev(node, 'assign_zero', `Assigning: ${name} = NULL.`, `대입: ${name} = NULL.`)] };
  }
}

// Printer for nodes that come from a macro expansion (their source text is
// the macro invocation).
function isRefType(t) {
  const c = t && T.canonical(t);
  return !!c && c.kind === 'reference';
}

function exprText(e, d = 0) {
  if (!e || d > 12) return '...';
  const r = (x) => exprText(x, d + 1);
  switch (e.type) {
    case 'Identifier': return e.qname || e.name || '?';
    case 'IntegerLiteral': return e.raw || String(e.value);
    case 'CharLiteral': case 'FloatingLiteral': return e.raw || String(e.value);
    case 'StringLiteral': return e.raw || JSON.stringify(e.value || '');
    case 'ParenExpr': return `(${r(e.expr)})`;
    case 'MemberExpr': return `${r(e.object)}${e.arrow ? '->' : '.'}${e.member}`;
    case 'IndexExpr': return `${r(e.object)}[${r(e.index)}]`;
    case 'UnaryExpr': return e.prefix === false ? `${r(e.arg)}${e.op}` : `${e.op}${r(e.arg)}`;
    case 'BinaryExpr': return `${r(e.left)} ${e.op} ${r(e.right)}`;
    case 'AssignExpr': return `${r(e.left)} ${e.op} ${r(e.right)}`;
    case 'CallExpr': return `${r(e.callee)}(${(e.args || []).map(r).join(', ')})`;
    case 'CastExpr': return e.arg ? r(e.arg) : '...';
    case 'ConditionalExpr': return `${r(e.test)} ? ${r(e.consequent)} : ${r(e.alternate)}`;
    case 'ThisExpr': return 'this';
    case 'NullptrLiteral': return 'nullptr';
    default: return '...';
  }
}

function sameStates(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  const ka = a.map((s) => s.key()).sort();
  const kb = b.map((s) => s.key()).sort();
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return false;
  return true;
}

module.exports = { isRefType, FnAnalyzer, skip, hasSideEffects, isDep, isMemKey, ARITH, CMP, NEGATE, SWAP, sameStates, I, T, cf, vJoin, joinStates, symEq };
