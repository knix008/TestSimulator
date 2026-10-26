'use strict';

// Function exit checks, whole-function checks after the fixpoint and the
// function summary. Mixed into FnAnalyzer.prototype.

const { FnAnalyzer, skip, I, T, cf } = require('./interp');

const P = FnAnalyzer.prototype;

P.endNode = function endNode() {
  const b = this.fn.body && this.fn.body.loc ? this.fn.body.loc : this.fn.loc;
  return { loc: { file: b.file, line: b.endLine || b.line, col: Math.max(1, (b.endCol || 2) - 1) } };
};

P.returnsValue = function returnsValue() {
  const ft = this.fn.ctype && T.canonical(this.fn.ctype);
  if (!ft || ft.kind !== 'function') return false;
  const r = this.T(ft.ret);
  if (!r || r.kind === 'void' || r.kind === 'unknown' || r.kind === 'auto' || r.kind === 'dependent') return false;
  if (this.fn.isConstructor || this.fn.isDestructor) return false;
  return true;
};

P.refersTo = function refersTo(v, id) {
  return !!v && ((v.pt && v.pt.some((t) => t.o === id)) || v.rid === id || v.reall === id);
};

// An exception leaves the function (explicit throw outside any try): objects
// owned only by locals leak and locks taken here stay held, since no RAII
// owner releases them on the way out.
P.throwExitCheck = function throwExitCheck(o, e) {
  const node = e.node || (e.from.terminator && e.from.terminator.node) || this.endNode();
  const thrown = new Set();
  cf.walk(node, (n) => {
    if (n.type === 'Identifier' && n.symbol) { const v = o.get(`v${n.symbol.id}`); if (v && v.pt) for (const t of v.pt) thrown.add(t.o); }
  });
  for (const [id, ob] of o.objs) {
    if (ob.kind !== 'heap' || !ob.ak || ob.st !== 'live' || ob.esc || ob.multi || ob.mayFreed) continue;
    if (thrown.has(id) || this.reachableOutside(o, id)) continue;
    this.leakReport(o, ob, node, null, false, { via: null });
  }
  for (const [k, l] of o.locks) {
    if (l.h !== 'held' || !l.here || !this.released.has(k)) continue;
    this.report('LOCK', node, {
      en: `Lock ${k} is still held when the exception thrown here leaves ${this.fn.name}.`,
      ko: `여기서 던진 예외가 ${this.fn.name}을(를) 벗어날 때 잠금 ${k}을(를) 아직 쥐고 있습니다.`,
    }, [l.ev, o.trail], { tag: 'missing_unlock' });
  }
};

P.exitCheck = function exitCheck(o, e) {
  if (e.kind === 'throw' && this.lang === 'cpp') { this.throwExitCheck(o, e); return; }
  if (e.kind === 'noreturn' || e.kind === 'throw' || e.kind === 'exception') return;
  const node = o.ret ? o.ret.node : null;
  const retV = o.ret && o.ret.v;
  const at = node || this.endNode();
  // RETURN_LOCAL
  const fty = this.fn.ctype && T.canonical(this.fn.ctype);
  const rty = fty && fty.kind === 'function' ? T.canonical(fty.ret) : null;
  if (retV && retV.pt && retV.nul !== 'null' && rty && (rty.kind === 'pointer' || rty.kind === 'reference')) {
    for (const t of retV.pt) {
      const ob = o.obj(t.o);
      if (!ob || ob.kind !== 'stack' || ob.fnKey !== this.key) continue;
      const sym = ob.vsym ? this.E.symById(this.unit, ob.vsym) : null;
      if (sym && sym.storage !== 'automatic') continue;
      this.report('RETURN_LOCAL', at, {
        en: `Returning a pointer to local ${ob.name}, which goes out of scope when ${this.fn.name} returns.`,
        ko: `${this.fn.name}이(가) 반환되면 사라지는 지역 ${ob.name}을(를) 가리키는 포인터를 반환합니다.`,
      }, [o.trail], { tag: 'escape_local_addr' });
      break;
    }
  }
  // MISSING_RETURN
  if (!o.ret && e.kind !== 'return' && this.returnsValue() && !(this.fn.name === 'main' && !this.fn.qualifier)) {
    this.report('MISSING_RETURN', this.endNode(), {
      en: `Control reaches the end of non-void function ${this.fn.name} without returning a value.`,
      ko: `void가 아닌 함수 ${this.fn.name}의 끝에 값을 반환하지 않고 도달합니다.`,
    }, [o.trail], { tag: 'missing_return' });
  }
  // RESOURCE_LEAK
  for (const [id, ob] of o.objs) {
    if (ob.kind !== 'heap' || !ob.ak || ob.st !== 'live' || ob.esc || ob.multi || ob.mayFreed || ob.userAk && false) continue;
    if (this.refersTo(retV, id)) continue;
    if (this.reachableOutside(o, id)) continue;
    this.leakReport(o, ob, at, null, false);
  }
  // facts for the summary and the lock checks
  this.exits.push({ st: o, ret: retV, node: at, kind: e.kind });
};

P.reachableOutside = function reachableOutside(st, id) {
  for (const [k, v] of st.env) {
    if (!this.refersTo(v, id)) continue;
    if (k.includes('->') || k[0] === '*' || k.startsWith('this')) return true;
    const m = /^v(\d+)/.exec(k);
    if (m) {
      const sym = this.E.symById(this.unit, Number(m[1]));
      if (sym && sym.storage !== 'automatic') return true;
      if (sym && sym.type && T.canonical(sym.type) && T.canonical(sym.type).kind === 'reference') return true;
    }
  }
  return false;
};

// ---------------------------------------------------------------- after the fixpoint

P.postChecks = function postChecks() {
  this.reverseNullChecks();
  this.deadCodeChecks();
  this.infiniteLoopChecks();
  this.lockExitChecks();
  this.summary = this.buildSummary();
};

P.reverseNullChecks = function reverseNullChecks() {
  for (const [cond, rec] of this.nullChecks) {
    if (!rec.n || rec.dref !== rec.n || !rec.ev) continue;
    if (cond.loc && cond.loc.macro) continue;
    const name = this.src(rec.ptr, 40);
    this.reporting = true;
    this.report('REVERSE_INULL', cond, {
      en: `Null-checking ${name} suggests that it may be null, but it has already been dereferenced on all paths leading to the check.`,
      ko: `${name}을(를) 널 검사하는 것은 널일 수 있다는 뜻인데, 이 검사에 이르는 모든 경로에서 이미 역참조했습니다.`,
    }, [rec.ev], { tag: 'check_after_deref' });
    this.reporting = false;
  }
};

P.readsStatic = function readsStatic(e) {
  let found = false;
  cf.walk(e, (n) => {
    if (found) return cf.walk.STOP;
    if (n.type === 'Identifier' && n.symbol && (n.symbol.kind === 'variable' || n.symbol.kind === 'field')
      && (n.symbol.storage === 'static' || n.symbol.kind === 'field' || (n.symbol.type && T.canonical(n.symbol.type) && T.canonical(n.symbol.type).volatile))) found = true;
    if (n.type === 'MemberExpr' || (n.type === 'UnaryExpr' && n.op === '*') || n.type === 'IndexExpr') {
      // memory reads may change behind our back only through volatile types
      if (n.ctype && T.canonical(n.ctype) && T.canonical(n.ctype).volatile) found = true;
    }
    return undefined;
  });
  return found;
};

P.deadCodeChecks = function deadCodeChecks() {
  if (this.hasAsm) return;
  const g = this.cfg;
  this.reporting = true;
  for (const [e, s] of this.edgeStats) {
    if (!s.arrive || s.pass || s.reasons.has('soft')) continue;
    if (e.kind !== 'true' && e.kind !== 'false') continue;
    const to = e.to;
    if (to === g.exit || to.preds.length !== 1) continue;
    const cond = e.cond || (e.from.terminator && e.from.terminator.cond);
    if (!cond || (cond.loc && cond.loc.macro) || this.isConstCond(cond) || this.readsStatic(cond)) continue;
    const items = cf.cfg.blockItems(to);
    const first = items.find((n) => n && n.loc && n.loc.file === this.file && !n.loc.macro && n.type !== 'BreakStmt' && n.type !== 'NullStmt');
    if (!first) continue;
    const value = e.kind === 'true' ? { en: 'false', ko: '거짓' } : { en: 'true', ko: '참' };
    this.report('DEADCODE', first, {
      en: `Execution cannot reach this statement: the condition ${this.src(cond, 50)} is always ${value.en} here.`,
      ko: `이 문장에 도달할 수 없습니다: 여기서 조건 ${this.src(cond, 50)}은(는) 늘 ${value.ko}입니다.`,
    }, [s.sample ? s.sample.trail : null, this.ev(cond, 'cond_const', `Condition ${this.src(cond, 50)} is always ${value.en}.`, `조건 ${this.src(cond, 50)}은(는) 늘 ${value.ko}입니다.`)], { tag: 'dead_error_line' });
  }
  this.reporting = false;
};

P.infiniteLoopChecks = function infiniteLoopChecks() {
  const g = this.cfg;
  let loops = [];
  try { loops = g.loops(); } catch { loops = []; }
  this.reporting = true;
  for (const L of loops) {
    const h = L.header;
    const node = h.loopNode;
    if (!node || !h.terminator || h.terminator.kind !== 'branch') continue;
    const cond = h.terminator.cond;
    if (!cond || this.isConstCond(cond) || (cond.loc && cond.loc.macro) || this.readsStatic(cond)) continue;
    if (!L.exits.length || L.exits.some((x) => x.to === g.exit)) continue;
    let arrived = false, ok = true;
    for (const x of L.exits) {
      const s = this.edgeStats.get(x);
      if (!s) { if (x.kind === 'true' || x.kind === 'false') continue; ok = false; break; }
      if (s.pass || s.reasons.has('soft')) { ok = false; break; }
      if (s.arrive) arrived = true;
    }
    if (!ok || !arrived) continue;
    let hasCall = false;
    for (const b of L.blocks) for (const it of cf.cfg.blockItems(b)) {
      cf.walk(it, (n) => { if (n.type === 'CallExpr' || n.type === 'AsmStmt') hasCall = true; });
      if (it.type === 'ReturnStmt' || it.type === 'GotoStmt') hasCall = true;
    }
    if (hasCall) continue;
    this.report('INFINITE_LOOP', node, {
      en: `The loop never ends: ${this.src(cond, 50)} cannot become false and the body has no other exit.`,
      ko: `반복이 끝나지 않습니다: ${this.src(cond, 50)}이(가) 거짓이 될 수 없고 본문에 다른 출구가 없습니다.`,
    }, [this.ev(cond, 'loop_condition', `Loop condition ${this.src(cond, 50)} stays true.`, `반복 조건 ${this.src(cond, 50)}이(가) 계속 참입니다.`)], { tag: 'loop_top' });
  }
  this.reporting = false;
};

P.lockExitChecks = function lockExitChecks() {
  const exits = this.exits;
  if (exits.length < 2) return;
  const keys = new Set();
  for (const x of exits) for (const [k, l] of x.st.locks) if (l.here) keys.add(k);
  this.reporting = true;
  for (const k of keys) {
    const held = exits.filter((x) => { const l = x.st.locks.get(k); return l && l.h === 'held' && l.here; });
    const free = exits.filter((x) => { const l = x.st.locks.get(k); return !l; });
    if (!held.length || !free.length) continue;
    const x = held[0];
    const l = x.st.locks.get(k);
    this.report('LOCK', x.node, {
      en: `Returning without releasing lock ${k}, although other paths through ${this.fn.name} release it.`,
      ko: `${this.fn.name}의 다른 경로에서는 잠금 ${k}을(를) 푸는데 이 경로는 풀지 않고 반환합니다.`,
    }, [l.ev, x.st.trail], { tag: 'missing_unlock' });
  }
  this.reporting = false;
};

// ---------------------------------------------------------------- summary

P.buildSummary = function buildSummary() {
  const S = {
    key: this.key, name: this.name, file: this.file,
    derefs: new Map(), frees: new Map(), escapes: new Set(), sinks: this.paramSinks, divs: new Map(), indexes: new Map(),
    retNull: false, retNullEv: null, retNonNull: false, retAlloc: null, retIv: null, retNeg: null, retTaint: null, retPar: undefined,
    locks: new Map(), acquires: new Set(this.acquired.keys()), globalLocks: new Set(), blocks: this.blocksEv,
    writesMem: this.writesMem, writesGlobals: this.writesGlobals, noreturn: false,
  };
  for (const [k, a] of this.acquired) if (a.global) S.globalLocks.add(k);
  const ex = this.exits;
  if (!ex.length) {
    // every path ends in a call that does not return
    S.noreturn = this.cfg.exit.preds.length > 0 && this.cfg.exit.preds.every((p) => p.kind === 'noreturn');
    return S;
  }
  const nParams = (this.fn.params || []).length;
  for (let i = 0; i < nParams; i++) {
    if (!this.paramNullChecked.has(i) && this.derefEv.has(i) && ex.every((x) => x.st.dp && x.st.dp.has(i))) S.derefs.set(i, this.derefEv.get(i));
    let freedAll = true, freedAny = false, rel = null, fev = null, esc = false;
    for (const x of ex) {
      const ob = x.st.obj(`P${i}`);
      if (!ob) { freedAll = false; continue; }
      if (ob.esc) esc = true;
      if (ob.st === 'freed') { freedAny = true; rel = rel || ob.frel; fev = fev || (ob.fev && ob.fev[0]); }
      else if (!(ob.nulledParam && x.ret === undefined)) freedAll = false;
    }
    if (freedAll && freedAny) S.frees.set(i, { rel: rel || 'free', ev: fev });
    else if (freedAny || esc) S.escapes.add(i);
  }
  for (const [i, list] of this.paramPre) {
    const d = list.find((x) => x.kind === 'div' && x.uncond);
    if (d) S.divs.set(i, d.ev);
    let ix = null;
    for (const x of list) if (x.kind === 'index' && x.uncond && (!ix || x.need > ix.need)) ix = x;
    if (ix) S.indexes.set(i, { need: ix.need, ev: ix.ev });
  }
  const ft = this.fn.ctype && T.canonical(this.fn.ctype);
  const rt = ft && ft.kind === 'function' ? this.T(ft.ret) : null;
  const rets = ex.map((x) => x.ret).filter((v) => v !== undefined);
  if (rt && rets.length === ex.length && rets.every(Boolean)) {
    if (rt.kind === 'pointer') {
      const nullRet = ex.find((x) => x.ret.nul === 'null' && !x.ret.pt && !x.ret.oom);
      const nonNull = ex.filter((x) => !(x.ret.nul === 'null' && !x.ret.pt));
      if (nullRet && nonNull.length) { S.retNull = true; S.retNullEv = this.ev(nullRet.node, 'return_null', `${this.fn.name} returns null here.`, `${this.fn.name}이(가) 여기서 널을 반환합니다.`); }
      if (!nullRet && nonNull.some((x) => x.ret.nret)) { const n = nonNull.find((x) => x.ret.nret); S.retNull = true; S.retNullEv = [].concat(n.ret.nret.ev).slice(-1)[0]; }
      if (!nullRet && nonNull.every((x) => x.ret.nul === 'non' && !x.ret.nret)) S.retNonNull = true;
      if (ex.some((x) => (x.ret.nul === 'null' && !x.ret.pt && x.ret.oom) || (x.ret.nul === 'maybe' && x.ret.oom))) { S.retNonNull = false; S.retOom = true; }
      // allocation wrapper
      let alloc = null, okAlloc = nonNull.length > 0;
      for (const x of nonNull) {
        const v = x.ret;
        if (!v.pt || v.pt.length !== 1) { okAlloc = false; break; }
        const ob = x.st.obj(v.pt[0].o);
        if (!ob || ob.kind !== 'heap' || !ob.ak || ob.st !== 'live' || ob.esc || !I.isConst(v.pt[0].off) || v.pt[0].off.lo !== 0) { okAlloc = false; break; }
        if (alloc && alloc.ak !== ob.ak) { okAlloc = false; break; }
        alloc = alloc || { ak: ob.ak, ev: [].concat(ob.aev || [])[0] || null, size: ob.size && I.isConst(ob.size) ? ob.size : null };
      }
      if (okAlloc && alloc) S.retAlloc = alloc;
      const strTnt = ex.map((x) => x.ret.pt && x.ret.pt.length === 1 && x.st.obj(x.ret.pt[0].o)).find((ob) => ob && ob.tnt);
      if (strTnt && !S.retAlloc) S.retTaint = [].concat(strTnt.tnt)[0];
    } else if (T.isInteger(rt)) {
      let iv = null;
      for (const v of rets) iv = iv ? I.join(iv, v.iv || this.rangeIv(rt)) : (v.iv || this.rangeIv(rt));
      if (iv && !I.isTop(iv) && !I.equal(iv, this.rangeIv(rt))) S.retIv = iv;
      const negRet = ex.find((x) => x.ret.iv && x.ret.iv.hi < 0);
      const nonNeg = ex.some((x) => x.ret.iv && x.ret.iv.hi >= 0);
      if (negRet && nonNeg) S.retNeg = this.ev(negRet.node, 'return_negative', `${this.fn.name} returns ${I.show(negRet.ret.iv)} here.`, `${this.fn.name}이(가) 여기서 ${I.show(negRet.ret.iv)}을(를) 반환합니다.`);
      else if (!negRet && ex.some((x) => x.ret.neg)) S.retNeg = [].concat(ex.find((x) => x.ret.neg).ret.neg.ev).slice(-1)[0];
      const t = ex.find((x) => x.ret.tnt);
      if (t) S.retTaint = [].concat(t.ret.tnt).slice(-1)[0];
    }
    const p0 = rets[0].par;
    if (p0 !== undefined && rets.every((v) => v.par === p0)) S.retPar = p0;
  }
  // lock effects visible to callers
  const lockKeys = new Set();
  for (const x of ex) for (const [k, l] of x.st.locks) if (l.global) lockKeys.add(k);
  for (const k of lockKeys) {
    if (ex.every((x) => { const l = x.st.locks.get(k); return l && l.h === 'held'; })) {
      const l = ex[0].st.locks.get(k);
      S.locks.set(k, { op: 'acquire', ev: l.ev });
    }
  }
  for (const k of this.released) {
    if (!S.locks.has(k) && ex.every((x) => !x.st.locks.get(k))) S.locks.set(k, { op: 'release' });
  }
  return S;
};

module.exports = P;
