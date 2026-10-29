'use strict';

// Calls: library models, user models (core/defects.js format), function
// summaries and unknown functions. Mixed into FnAnalyzer.prototype.

const { FnAnalyzer, skip, I, T, cf } = require('./interp');
const { lookup, NORETURN } = require('./models');

const P = FnAnalyzer.prototype;

const REL_AK = { free: 'malloc', delete: 'new', 'delete[]': 'new[]', fclose: 'file', pclose: 'pipe', closedir: 'dir', close: 'fd', user: null };
const MEM = new Set(['malloc', 'new', 'new[]']);
const OWN_ARGS = new Set(['alloc', 'realloc', 'free', 'copy', 'memset', 'bzero', 'strcpy', 'strncpy', 'strcat', 'strncat', 'sprintf', 'snprintf', 'printf', 'strlen', 'strnlen', 'find', 'atoi', 'getenv', 'fgets', 'gets', 'read', 'fread', 'scanf', 'cmd', 'tstr', 'lock', 'unlock', 'trylock']);
const REL_OF_AK = { malloc: 'free', file: 'fclose', pipe: 'pclose', dir: 'closedir', fd: 'close' };

// ---------------------------------------------------------------- helpers

P.calleeInfo = function calleeInfo(st, e) {
  const callee = skip(e.callee);
  if (callee && callee.type === 'Identifier') {
    const sym = e.calleeSymbol || callee.symbol || null;
    if (sym && sym.kind !== 'function') { this.eval(st, callee); return { name: null, sym: null }; }
    // `f()` inside a member function calls this->f(): dispatched unless qualified
    const virt = !!(sym && sym.member && !callee.qualifier && this.lang === 'cpp' && this.E.classIndex().isVirtual(sym));
    return { name: (sym && (sym.qname || sym.name)) || callee.name, sym, virtual: virt };
  }
  if (callee && callee.type === 'MemberExpr') {
    const sym = e.calleeSymbol || callee.memberSymbol || null;
    const fsym = sym && sym.kind === 'function' ? sym : null;
    if (callee.object) {
      const objT = this.T(callee.object.ctype);
      if (!callee.arrow && objT.kind !== 'pointer' && this.isLvalueish(callee.object)) {
        // a const member function does not write its object
        const ft = fsym && T.canonical(fsym.type);
        if (ft && ft.kind === 'function' && ft.quals && ft.quals.includes('const')) this.eval(st, callee.object);
        else this.markLvalueWritten(st, callee.object);
      } else {
        const pv = this.eval(st, callee.object);
        // calling a non-static member function through a null pointer
        if (callee.arrow && fsym && !fsym.isStatic && pv && pv.nul === 'null' && !pv.pt) {
          if (!this.derefCheck(st, pv, callee, 'read', 0, { baseNode: callee.object, baseKey: this.keyOf(callee.object) })) return { name: null, sym: null, dead: true };
        }
      }
    }
    if (!fsym) return { name: null, sym: null, method: callee.member };
    const virt = this.lang === 'cpp' && !callee.qualifier && this.E.classIndex().isVirtual(fsym);
    return { name: fsym.qname || fsym.name, sym: fsym, method: callee.member, virtual: virt };
  }
  if (callee) this.eval(st, callee);
  return { name: null, sym: null };
};

P.isLvalueish = function isLvalueish(e) {
  e = skip(e);
  if (!e) return false;
  if (e.type === 'Identifier') return !!(e.symbol && (e.symbol.kind === 'variable' || e.symbol.kind === 'parameter' || e.symbol.kind === 'field'));
  if (e.type === 'MemberExpr' || e.type === 'IndexExpr') return !hasSideEffectsLite(e);
  if (e.type === 'UnaryExpr' && e.op === '*') return !hasSideEffectsLite(e);
  return false;
};

// An lvalue the callee (or an overloaded operator) may write: forget what we know.
P.markLvalueWritten = function markLvalueWritten(st, e) {
  e = skip(e);
  let base = e;
  while (base && (base.type === 'MemberExpr' && !base.arrow || base.type === 'IndexExpr')) base = skip(base.object);
  if (base && base.type === 'Identifier' && base.symbol && (base.symbol.kind === 'variable' || base.symbol.kind === 'parameter')) {
    const k = `v${base.symbol.id}`;
    st.del(k);
    this.killDeps(st, k);
    const o = st.obj(this.varObjId(base.symbol));
    if (o) { const m = st.mut(o.id); m.init = 'yes'; m.term = undefined; m.slen = undefined; }
    if (base.symbol.storage === 'static') this.writesGlobals = true;
  } else {
    const k = this.keyOf(e);
    if (k) { st.del(k); this.killDeps(st, k); }
    this.killMem(st);
    this.writesMem = true;
  }
};

function hasSideEffectsLite(e) {
  let f = false;
  cf.walk(e, (n) => { if (n.type === 'CallExpr' || n.type === 'AssignExpr' || (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--'))) f = true; });
  return f;
}

P.target1 = function target1(st, v) {
  if (!v || !v.pt || v.pt.length !== 1) return null;
  const t = v.pt[0];
  const o = st.obj(t.o);
  if (!o) return null;
  const avail = o.size && t.off ? I.sub(o.size, t.off) : null;
  return { t, o, avail };
};

P.strTaint = function strTaint(st, v) {
  if (!v) return null;
  if (v.tnt) return v.tnt;
  if (v.pt) for (const t of v.pt) { const o = st.obj(t.o); if (o && o.tnt) return o.tnt; }
  return null;
};

// Known string length (interval) of the string v points to, or null.
P.strLen = function strLen(st, v) {
  const tg = this.target1(st, v);
  if (!tg || tg.o.term !== 'yes' || !tg.o.slen || !tg.t.off || !I.isConst(tg.t.off)) return null;
  const k = tg.t.off.lo / (tg.o.esz || 1);
  if (k === 0) return tg.o.slen;
  return I.meet(I.sub(tg.o.slen, I.konst(k)), I.make(0, I.INF));
};

P.isTightBounded = function isTightBounded(iv) {
  return I.finite(iv) && iv.hi < 1048576 && iv.hi - iv.lo < 1048576;
};

P.calleeEv = function calleeEv(ev) {
  return ev || null;
};

// A pointer argument the callee dereferences.
P.argDeref = function argDeref(st, v, argNode, fname, calleeEv) {
  if (!v || !argNode) return true;
  const name = this.src(argNode, 40);
  if (v.nul === 'null' && !v.pt) {
    this.report('FORWARD_NULL', argNode, {
      en: `Passing null pointer ${name} to ${fname}, which dereferences it.`,
      ko: `널 포인터 ${name}을(를) 역참조하는 ${fname}에 넘깁니다.`,
    }, [v.nev, st.trail, calleeEv], { tag: 'var_deref_model' });
    st.dead = 'soft';
    return false;
  }
  if (v.nul === 'maybe' && v.nret && !this.quiet && this.E.nullRetOk(v.nret)) {
    this.report('NULL_RETURNS', argNode, {
      en: `Passing ${name}, which is null when ${v.nret.fn} fails, to ${fname}, which dereferences it.`,
      ko: `${v.nret.fn}이(가) 실패하면 널인 ${name}을(를) 역참조하는 ${fname}에 넘깁니다.`,
    }, [v.nret.ev, st.trail, calleeEv], { tag: 'dereference' });
  }
  const pv = v.nul === 'maybe' ? { ...v, nul: undefined, nret: undefined, nev: undefined } : v;
  return this.derefCheck(st, pv, argNode, 'read', 0, { baseNode: argNode, baseKey: this.keyOf(argNode) });
};

P.strArg = function strArg(st, v, argNode, fname) {
  const tg = this.target1(st, v);
  if (!tg || tg.o.term !== 'no' || tg.o.st === 'freed') return;
  const name = this.src(argNode, 40);
  this.report('STRING_NULL', argNode, {
    en: `Passing ${name} to ${fname}, but it may not be NUL-terminated.`,
    ko: `${name}을(를) ${fname}에 넘기는데 NUL로 끝나지 않을 수 있습니다.`,
  }, [tg.o.tev, st.trail], { tag: 'string_null' });
};

P.paramOf = function paramOf(st, v) {
  if (!v) return undefined;
  if (v.par !== undefined) return v.par;
  if (v.pt && v.pt.length === 1) { const o = st.obj(v.pt[0].o); if (o && o.kind === 'param') return o.pidx; }
  return undefined;
};

P.addParamSink = function addParamSink(i, checker, ev) {
  if (this.quiet || !this.reporting) return;
  if (!this.paramSinks.has(i)) this.paramSinks.set(i, { checker, ev });
};

// Taint sink for a string argument (command, format, file name ...).
P.stringSink = function stringSink(st, v, argNode, e, fname, checker, extraEv) {
  if (!v || !argNode) return;
  const tn = this.strTaint(st, v);
  const name = this.src(argNode, 40);
  if (tn) {
    const msg = {
      OS_CMD_INJECTION: { en: `Passing tainted string ${name} to command interpreter ${fname}.`, ko: `오염된 문자열 ${name}을(를) 명령 해석기 ${fname}에 넘깁니다.` },
      FORMAT_STRING: { en: `Passing tainted string ${name} as the format of ${fname}.`, ko: `오염된 문자열 ${name}을(를) ${fname}의 형식 문자열로 넘깁니다.` },
      TAINTED_STRING: { en: `Passing tainted string ${name} to ${fname}.`, ko: `오염된 문자열 ${name}을(를) ${fname}에 넘깁니다.` },
    }[checker];
    this.report(checker, argNode, msg, [tn, st.trail, extraEv], { tag: 'tainted_string' });
    return;
  }
  const pi = this.paramOf(st, v);
  if (pi !== undefined) {
    this.addParamSink(pi, checker, extraEv || this.ev(argNode, 'sink', `${this.fn.name} passes ${name} to ${fname}.`, `${this.fn.name}이(가) ${name}을(를) ${fname}에 넘깁니다.`));
  }
};

// Size / count argument of an allocation or copy.
P.sizeArgCheck = function sizeArgCheck(st, n, sizeNode, callNode, fname) {
  if (!n || !this.reporting || this.quiet) return false;
  const name = this.src(sizeNode, 40);
  if (n.tnt) {
    const r = this.range(sizeNode && sizeNode.ctype);
    const iv = n.iv || I.TOP;
    if (!Number.isFinite(iv.hi) || (r && iv.hi >= r.max) || iv.lo < 0) {
      this.report('TAINTED_SCALAR', sizeNode, {
        en: `Passing tainted value ${name} as the size argument of ${fname} without bounding it.`,
        ko: `오염된 값 ${name}을(를) 범위 확인 없이 ${fname}의 크기 인자로 넘깁니다.`,
      }, [n.tnt, st.trail], { tag: 'tainted_data' });
      return true;
    }
    return false;
  }
  if (n.neg && (!n.iv || n.iv.lo < 0)) {
    this.report('NEGATIVE_RETURNS', sizeNode, {
      en: `${name} is passed to ${fname} as a size but may be negative (returned by ${n.neg.fn}).`,
      ko: `${name}을(를) ${fname}의 크기로 넘기는데 음수(${n.neg.fn}의 반환값)일 수 있습니다.`,
    }, [n.neg.ev, st.trail], { tag: 'negative_returns' });
    return true;
  }
  if (n.wrap) {
    this.report('INTEGER_OVERFLOW', sizeNode, {
      en: n.wrap.definite ? `${name} wraps around and is then used as the size argument of ${fname}.` : `${name} may wrap around and is then used as the size argument of ${fname}.`,
      ko: n.wrap.definite ? `${name}이(가) 한 바퀴 돈 값으로 ${fname}의 크기 인자에 쓰입니다.` : `${name}이(가) 한 바퀴 돌 수 있는 값으로 ${fname}의 크기 인자에 쓰입니다.`,
    }, [n.wrap.ev, st.trail], { tag: 'overflow_sink', confidence: n.wrap.definite ? 'definite' : 'possible' });
    return true;
  }
  return false;
};

// `buf + x` (or `&buf[x]`) with a size `K - ... - x`: the call ends at
// offset K - ..., whatever x is. Intervals do not relate x to the size, so
// without this the classic `recv(fd, buf + used, sizeof buf - used, 0)` looks
// like it may run past the end. Returns { key, end } (end: upper bound of
// x + size) or null.
P.offsetRel = function offsetRel(st, bufNode, sizeNode, n) {
  const b = skip(bufNode);
  let off = null;
  if (b && b.type === 'BinaryExpr' && b.op === '+') off = this.isPtrT(skip(b.left) && skip(b.left).ctype) ? skip(b.right) : skip(b.left);
  else if (b && b.type === 'UnaryExpr' && b.op === '&' && skip(b.arg) && skip(b.arg).type === 'IndexExpr') off = skip(skip(b.arg).index);
  if (!off || off.type !== 'Identifier' || !n || !n.iv || !Number.isFinite(n.iv.hi)) return null;
  const key = this.keyOf(off);
  if (!key) return null;
  let s = skip(sizeNode);
  let found = false;
  while (s && s.type === 'BinaryExpr' && s.op === '-') {
    const r = skip(s.right);
    if (r && r.type === 'Identifier' && this.keyOf(r) === key) { found = true; break; }
    s = skip(s.left);
  }
  if (!found) return null;
  const xv = this.peek(st, off);
  if (!xv || !xv.iv || !Number.isFinite(xv.iv.lo)) return null;
  return { key, end: n.iv.hi + xv.iv.lo, xlo: xv.iv.lo };
};

// n bytes written to (or read from) the buffer v points to.
P.copySizeCheck = function copySizeCheck(st, v, n, argNode, sizeNode, fname, mode) {
  if (!this.reporting || this.quiet || !n || !n.iv || n.tnt) return;
  const tg = this.target1(st, v);
  if (!tg || tg.o.st === 'freed') return;
  const o = tg.o;
  const len = n.iv;
  // The size shrinks as the offset grows: the end is fixed (see offsetRel).
  const rel = sizeNode ? this.offsetRel(st, argNode, sizeNode, n) : null;
  // The pointer may itself sit at an offset in the object: off = base + x.
  if (rel && (o.esz || 1) === 1 && o.size && Number.isFinite(o.size.lo) && tg.t.off && Number.isFinite(tg.t.off.lo) && tg.t.off.lo - rel.xlo + rel.end <= o.size.lo) return;
  let definite = false, possible = false;
  if (tg.avail) {
    const av = tg.avail;
    if (len.lo > av.hi) definite = true;
    else if (len.th && len.hi > av.hi && I.finite(len)) definite = true;
    else if (this.isTightBounded(len) && len.hi > av.lo && Number.isFinite(av.lo) && o.size && (I.isConst(o.size) || o.size.tl)) possible = true;
  }
  if (!definite && o.ssym && n.sym && tg.t.off && I.isConst(tg.t.off) && n.sym.s === o.ssym.s && n.sym.d + tg.t.off.lo > o.ssym.d) { definite = true; possible = false; }
  if (!definite && !possible) return;
  const name = this.src(argNode, 40);
  const size = o.size ? (I.isConst(o.size) ? `${o.size.lo}` : I.show(o.size)) : '?';
  const what = mode === 'write' ? { en: 'writing', ko: '쓰기' } : { en: 'reading', ko: '읽기' };
  this.report('OVERRUN', argNode, {
    en: `${definite ? 'Overrunning' : 'Possibly overrunning'} ${o.name} of ${size} bytes by ${what.en} ${I.show(len)} bytes through ${name} in ${fname}.`,
    ko: `${fname}에서 ${name}을(를) 통해 ${I.show(len)}바이트를 ${what.ko}하여 ${size}바이트인 ${o.name}의 범위를 넘${definite ? '습니다' : '을 수 있습니다'}.`,
  }, [o.aev, n.tev, st.trail], { tag: 'overrun', confidence: definite ? 'definite' : 'possible' });
};

P.lockKey = function lockKey(arg) {
  let a = skip(arg);
  if (!a) return null;
  if (a.type === 'UnaryExpr' && a.op === '&') a = skip(a.arg);
  const text = this.src(a, 80).replace(/\s+/g, '');
  if (!text) return null;
  let base = a;
  while (base && (base.type === 'MemberExpr' || base.type === 'IndexExpr')) {
    if (base.type === 'MemberExpr' && base.arrow) { base = null; break; }
    base = skip(base.object);
  }
  const global = !!(base && base.type === 'Identifier' && base.symbol && base.symbol.storage === 'static');
  return { k: text, global };
};

P.acquireLock = function acquireLock(st, lk, node, ev, fromCallee) {
  if (!lk) return;
  const cur = st.locks.get(lk.k);
  if (cur && cur.h === 'held' && !this.quiet) {
    this.report('LOCK', node, {
      en: `Acquiring lock ${lk.k} while it is already held.`,
      ko: `이미 쥐고 있는 잠금 ${lk.k}을(를) 다시 얻습니다.`,
    }, [cur.ev, st.trail, fromCallee], { tag: 'double_lock' });
  }
  if (this.reporting && !this.quiet) {
    for (const [k, l] of st.locks) {
      if (k === lk.k || l.h !== 'held') continue;
      this.lockOrders.push({ a: k, b: lk.k, ga: l.global, gb: lk.global, node, ev, aev: l.ev });
    }
    if (!this.acquired.has(lk.k)) this.acquired.set(lk.k, { ev, global: lk.global });
  }
  st.locks.set(lk.k, { h: 'held', ev, here: true, node, global: lk.global });
  st.touch();
};

P.releaseLock = function releaseLock(st, lk) {
  if (!lk) return;
  if (!st.locks.has(lk.k) && this.reporting && lk.global) this.released.add(lk.k);
  st.locks.delete(lk.k);
  st.touch();
};

P.heldLocks = function heldLocks(st) {
  const out = [];
  for (const [k, l] of st.locks) if (l.h === 'held') out.push([k, l]);
  return out;
};

P.sleepCheck = function sleepCheck(st, e, fname, calleeEv) {
  if (!this.blocksEv && this.reporting) this.blocksEv = this.ev(e, 'sleep', `${this.fn.name} calls ${fname}, which may block.`, `${this.fn.name}이(가) 멈출 수 있는 ${fname}을(를) 부릅니다.`);
  const held = this.heldLocks(st);
  if (!held.length) return;
  const [k, l] = held[0];
  this.report('SLEEP', e, {
    en: `Calling ${fname}, which may block, while holding lock ${k}.`,
    ko: `잠금 ${k}을(를) 쥔 채 멈출 수 있는 ${fname}을(를) 부릅니다.`,
  }, [l.ev, st.trail, calleeEv], { tag: 'sleep' });
};

// ---------------------------------------------------------------- release

P.release = function release(st, v, rel, node, argNode, via, viaEv) {
  if (!v) return;
  if (v.nul === 'null' && !v.pt) return;
  const name = this.src(argNode, 40);
  const targets = [];
  if (rel === 'close') { if (v.rid) targets.push({ o: v.rid, off: I.konst(0) }); }
  else if (v.pt) targets.push(...v.pt);
  const single = targets.length === 1;
  const relName = via || rel;
  for (const t of targets) {
    const o = st.obj(t.o);
    if (!o) continue;
    if (o.kind === 'param') {
      if (!single) continue;
      const m = st.mut(t.o);
      if (m.st === 'freed') {
        this.report('DOUBLE_FREE', node, {
          en: `Releasing ${name} (parameter ${o.name}) a second time.`, ko: `${name}(매개변수 ${o.name})을(를) 두 번 해제합니다.`,
        }, [m.fev, st.trail, viaEv], { tag: 'double_free' });
        continue;
      }
      m.st = 'freed';
      m.frel = rel;
      m.fev = [this.ev(node, 'freed_arg', `${relName} releases ${name}.`, `${relName}이(가) ${name}을(를) 해제합니다.`)];
      continue;
    }
    if (o.kind === 'stack' || o.kind === 'global' || o.kind === 'string') {
      if (single && rel !== 'close' && REL_AK[rel] !== undefined && MEM.has(REL_AK[rel] || 'malloc')) {
        const what = o.kind === 'string' ? { en: 'a string literal', ko: '문자열 리터럴' } : o.kind === 'stack' ? { en: `local variable ${o.name}`, ko: `지역 변수 ${o.name}` } : { en: `global object ${o.name}`, ko: `전역 객체 ${o.name}` };
        this.report('BAD_FREE', node, {
          en: `Releasing ${name} with ${relName}, but it points to ${what.en}, not to heap memory.`,
          ko: `${name}을(를) ${relName}(으)로 해제하는데 힙이 아니라 ${what.ko}을(를) 가리킵니다.`,
        }, [st.trail, viaEv], { tag: 'bad_free' });
      }
      continue;
    }
    if (o.kind !== 'heap' || !o.ak) continue;
    if (o.st === 'freed') {
      if (single) {
        this.report('DOUBLE_FREE', node, {
          en: `Releasing ${name} with ${relName}, but it was already released.`,
          ko: `${name}을(를) ${relName}(으)로 해제하는데 이미 해제했습니다.`,
        }, [o.aev, o.fev, st.trail, viaEv], { tag: 'double_free' });
      }
      continue;
    }
    if (!single) { st.mut(t.o).esc = true; continue; }
    const exp = REL_AK[rel];
    if (t.off && !(I.isConst(t.off) && t.off.lo === 0) && (t.off.lo > 0 || t.off.hi < 0) && MEM.has(o.ak)) {
      this.report('BAD_FREE', node, {
        en: `Releasing ${name}, which points ${I.show(t.off)} bytes into the allocation instead of to its start.`,
        ko: `${name}이(가) 할당의 시작이 아니라 ${I.show(t.off)}바이트 안쪽을 가리키는데 해제합니다.`,
      }, [o.aev, st.trail, viaEv], { tag: 'bad_free' });
    } else if (exp && o.ak !== exp && MEM.has(o.ak) && MEM.has(exp)) {
      this.report('ALLOC_FREE_MISMATCH', node, {
        en: `Memory allocated with ${o.ak} is released with ${rel}.`,
        ko: `${o.ak}(으)로 할당한 메모리를 ${rel}(으)로 해제합니다.`,
      }, [o.aev, st.trail, viaEv], { tag: 'free' });
    }
    const m = st.mut(t.o);
    m.st = 'freed';
    m.mayFreed = undefined;
    m.fev = [this.ev(node, 'freed_arg', `${relName} releases ${name}.`, `${relName}이(가) ${name}을(를) 해제합니다.`)].concat(viaEv ? [viaEv] : []);
  }
};

// ---------------------------------------------------------------- leaks

P.leakReport = function leakReport(st, o, node, key, overwrite, exc) {
  if (!this.reporting || this.quiet || !o) return;
  // a descriptor is a leak only once the code has seen it is valid (fd >= 0)
  if (o.ak === 'fd' && !o.valid) return;
  if (this.leaked.has(o.id)) return;
  this.leaked.add(o.id);
  let vname = null;
  if (key && key[0] === 'v') { const sym = this.E.symById(this.unit, Number(key.slice(1))); if (sym) vname = sym.name; }
  if (!vname) {
    for (const [k, v] of st.env) {
      if (k[0] !== 'v' || !/^v\d+$/.test(k)) continue;
      if ((v.pt && v.pt.some((t) => t.o === o.id)) || v.rid === o.id) { const sym = this.E.symById(this.unit, Number(k.slice(1))); if (sym) { vname = sym.name; break; } }
    }
  }
  const what = o.ak === 'file' || o.ak === 'pipe' || o.ak === 'dir' ? { en: 'the handle', ko: '핸들' } : o.ak === 'fd' ? { en: 'the descriptor', ko: '디스크립터' } : { en: 'the storage', ko: '저장소' };
  const msg = exc
    ? (exc.via
      ? { en: `${vname ? `Variable ${vname}` : `Resource from ${o.name}`} leaks ${what.en} it points to if ${exc.via} throws: nothing releases it on the exception path.`, ko: `${exc.via}이(가) 예외를 던지면 ${vname ? `${vname} 변수` : `${o.name}의 자원`}이(가) 가리키던 ${what.ko}을(를) 해제할 곳이 없어 샙니다.` }
      : { en: `${vname ? `Variable ${vname}` : `Resource from ${o.name}`} leaks ${what.en} it points to when the exception thrown here leaves ${this.fn.name}.`, ko: `여기서 던진 예외가 ${this.fn.name}을(를) 벗어나면 ${vname ? `${vname} 변수` : `${o.name}의 자원`}이(가) 가리키던 ${what.ko}이(가) 샙니다.` })
    : overwrite
    ? { en: `Overwriting ${vname || 'the pointer'} leaks ${what.en} it pointed to (allocated by ${o.name}).`, ko: `${vname || '포인터'}을(를) 덮어써서 가리키던 ${what.ko}(${o.name} 할당)이(가) 샙니다.` }
    : { en: `${vname ? `Variable ${vname}` : `Resource from ${o.name}`} going out of scope leaks ${what.en} it points to.`, ko: `${vname ? `${vname} 변수` : `${o.name}의 자원`}이(가) 범위를 벗어나 가리키던 ${what.ko}이(가) 샙니다.` };
  this.report('RESOURCE_LEAK', node, msg, [o.aev, st.trail], { tag: exc ? 'exception_leak' : overwrite ? 'overwrite_var' : 'leaked_storage' });
};

// ---------------------------------------------------------------- globals

P.recordAccess = function recordAccess(st, sym, node, write) {
  if (!this.reporting || this.quiet || !node || !node.loc) return;
  const t = this.T(sym.type);
  if (t.const || sym.system) return;
  const held = [];
  for (const [k, l] of st.locks) if (l.h === 'held') held.push(k);
  const key = `${sym.qname || sym.name}|${sym.linkage === 'internal' ? sym.file : ''}`;
  const id = `${key}|${node.loc.file}|${node.loc.line}|${node.loc.col}`;
  if (this.uses.has(id)) {
    const u = this.uses.get(id);
    u.held = u.held.filter((x) => held.includes(x));
    return;
  }
  this.uses.set(id, { key, name: sym.name, node, write, held, fn: this.key });
};

// ---------------------------------------------------------------- calls

P.evalCall = function evalCall(st, e) {
  const info = this.calleeInfo(st, e);
  if (st.dead) return {};
  const args = e.args || [];
  if (info.name && /^(__builtin_)?va_(start|copy|end)$/.test(info.name)) {
    const k = args[0] && this.keyOf(args[0]);
    if (k) { st.set(k, {}); this.killDeps(st, k); }
    for (const a of args.slice(1)) if (a) this.eval(st, a);
    return {};
  }
  const vals = [];
  const ftype = info.sym && info.sym.type ? T.canonical(info.sym.type) : null;
  let ptypes = ftype && ftype.kind === 'function' ? ftype.params || [] : null;
  if (!ptypes) {
    const ce = skip(e.callee);
    let ct = ce && ce.ctype ? T.canonical(ce.ctype) : null;
    if (ct && ct.kind === 'pointer') ct = T.canonical(ct.to);
    if (ct && (ct.kind === 'function' || ct.kind === 'closure') && Array.isArray(ct.params)) ptypes = ct.params.map((p) => (p && p.type && typeof p.type === 'string' && p.ctype ? p.ctype : p));
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a) { vals.push({}); continue; }
    if (a.type === 'PackExpansion' || a.type === 'InitList') { this.eval(st, a); vals.push({}); continue; }
    if (this.lang === 'cpp' && this.isLvalueish(a)) {
      const pt = ptypes ? ptypes[i] && T.canonical(ptypes[i]) : null;
      const byRef = pt ? (pt.kind === 'reference' && !(T.canonical(pt.to) && T.canonical(pt.to).const)) : (!ptypes && !info.name);
      if (byRef) {
        // what the variable points to now is reachable from the callee
        const cur = this.keyOf(a) ? st.get(this.keyOf(a)) : null;
        if (cur) this.escapeValue(st, cur);
        this.markLvalueWritten(st, a); vals.push({}); continue;
      }
    }
    vals.push(this.eval(st, a));
    if (st.dead) return {};
  }
  let r = this.callBody(st, e, info, args, vals);
  if (st.dead) return {};
  if (!r) r = {};
  if (st.tmp) st.tmp.set(e, r);
  return r;
};

P.callBody = function callBody(st, e, info, args, vals) {
  const fname = info.name;
  const um = this.userModel(e);
  if (um) return this.applyUserModel(st, e, um, args, vals, fname || um.name);
  if (info.virtual && info.sym) {
    const S = this.E.virtualSummary(info.sym, this.unit);
    if (S) {
      this.calledWith(st, S.key);
      const r = this.applySummary(st, e, S, args, vals, info.sym.name || fname);
      if (S.throws) this.throwingCall(st, e, info.sym.name);
      return r;
    }
    return this.unknownCall(st, e, args, vals);
  }
  if (fname) {
    const S = this.E.summaryFor(info.sym, this.unit, fname);
    if (S) {
      this.calledWith(st, S.key);
      const r = this.applySummary(st, e, S, args, vals, (info.sym && info.sym.name) || fname);
      if (this.lang === 'cpp' && info.sym && this.E.throwsOf.has(S.key)) this.throwingCall(st, e, info.sym.name);
      return r;
    }
    const m = (!info.sym || !this.E.hasBody(info.sym, fname, this.unit)) ? lookup(fname) : null;
    if (m) return this.applyModel(st, e, m, args, vals, fname.replace(/^std::/, ''));
    if (NORETURN.has(fname)) { st.dead = 'noreturn'; return {}; }
  }
  return this.unknownCall(st, e, args, vals);
};

// A callee that can throw, called outside any try block: what this function
// owns through raw pointers leaks on the exception path.
P.throwingCall = function throwingCall(st, e, fname) {
  if (!this.reporting || this.quiet || st.dead) return;
  for (let p = cf.parentOf(e), c = e; p && p !== this.fn; c = p, p = cf.parentOf(p)) {
    if (p.type === 'TryStmt' && cf.parentKey(c) === 'body') return;
    if (p.type === 'LambdaExpr') return;
  }
  for (const [id, ob] of st.objs) {
    if (ob.kind !== 'heap' || !ob.ak || ob.ak === 'fd' || ob.st !== 'live' || ob.esc || ob.multi || ob.mayFreed) continue;
    if (!this.isReferenced(st, id) || this.reachableOutside(st, id)) continue;
    this.leakReport(st, ob, e, null, false, { via: fname });
  }
};

P.calledWith = function calledWith(st, key) {
  if (!this.reporting || this.quiet) return;
  const held = [];
  for (const [k, l] of st.locks) if (l.h === 'held') held.push(k);
  let list = this.E.callLocks.get(key);
  if (!list) { list = []; this.E.callLocks.set(key, list); }
  if (list.length < 64) list.push(held);
};

P.userModel = function userModel(e) {
  const models = this.E.userModels(this.lang);
  if (!models.length) return null;
  let text = '';
  try { text = cf.sourceText(this.unit, e) || ''; } catch { text = ''; }
  for (const m of models) {
    m.re.lastIndex = 0;
    if (m.re.test(text)) return m;
  }
  return null;
};

P.applyUserModel = function applyUserModel(st, e, m, args, vals, fname) {
  const evs = this.ev(e, 'model', `${fname} matches the user model ${m.name || m.pattern}.`, `${fname}이(가) 사용자 모델 ${m.name || m.pattern}에 맞습니다.`);
  if (m.kind === 'allocator') {
    const o = this.newHeap(st, e, 'malloc', null, { name: fname, aev: [evs] });
    o.userAk = true;
    return { pt: [{ o: o.id, off: I.konst(0) }], nul: 'maybe' };
  }
  if (m.kind === 'free') {
    this.release(st, vals[0], 'user', e, args[0], fname);
    return {};
  }
  if (m.kind === 'source') {
    const tn = [this.ev(e, 'tainted_source', `${fname} returns untrusted data (user model).`, `${fname}은(는) 신뢰할 수 없는 데이터를 반환합니다(사용자 모델).`)];
    for (const v of vals) if (v && v.pt) for (const t of v.pt) { const o = st.obj(t.o); if (o && o.kind !== 'string') { const mm = st.mut(t.o); mm.tnt = tn; mm.init = 'yes'; } }
    const r = this.typeVal(e.ctype);
    r.tnt = tn;
    return r;
  }
  if (m.kind === 'sink') {
    const checker = m.checker && ['TAINTED_SCALAR', 'TAINTED_STRING', 'OS_CMD_INJECTION', 'FORMAT_STRING', 'STRING_OVERFLOW'].includes(m.checker) ? m.checker : 'TAINTED_SCALAR';
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      const tn = this.strTaint(st, v);
      if (!tn) continue;
      const iv = v.iv;
      if (checker === 'TAINTED_SCALAR' && iv && I.finite(iv) && !v.tnt) continue;
      this.report(checker, args[i] || e, m.message && m.message.en ? m.message : {
        en: `Passing tainted value ${this.src(args[i], 40)} to sink ${fname} (user model).`,
        ko: `오염된 값 ${this.src(args[i], 40)}을(를) 싱크 ${fname}에 넘깁니다(사용자 모델).`,
      }, [tn, st.trail, evs], { tag: 'tainted_sink' });
      break;
    }
    return this.unknownCall(st, e, args, vals);
  }
  return this.unknownCall(st, e, args, vals);
};

P.applySummary = function applySummary(st, e, S, args, vals, fname) {
  if (S.noreturn) { st.dead = 'noreturn'; return {}; }
  for (let i = 0; i < args.length; i++) {
    const v = vals[i];
    const a = args[i];
    if (!a || !v) continue;
    if (S.derefs.has(i)) {
      if (!this.argDeref(st, v, a, fname, S.derefs.get(i))) return {};
    }
    if (S.frees.has(i)) {
      const f = S.frees.get(i);
      this.release(st, v, f.rel, e, a, fname, f.ev);
    } else if (S.escapes.has(i)) this.escapeValue(st, v);
    if (S.sinks.has(i)) {
      const sk = S.sinks.get(i);
      this.stringSink(st, v, a, e, fname, sk.checker, sk.ev);
    }
    if (S.divs.has(i) && v.iv && I.isConst(v.iv) && v.iv.lo === 0) {
      this.report('DIVIDE_BY_ZERO', a, {
        en: `Passing zero ${this.src(a, 30)} to ${fname}, which divides by it.`,
        ko: `0인 ${this.src(a, 30)}을(를) 그 값으로 나누는 ${fname}에 넘깁니다.`,
      }, [v.zev, st.trail, S.divs.get(i)], { tag: 'divide_by_zero' });
    }
    if (S.indexes && S.indexes.has(i) && v.pt && v.pt.length === 1 && this.reporting && !this.quiet) {
      const ix = S.indexes.get(i);
      const t = v.pt[0];
      const o = st.obj(t.o);
      if (o && o.single && o.vsym && !o.sub && o.size && I.isConst(o.size) && I.isConst(t.off) && t.off.lo + ix.need > o.size.lo) {
        this.report('ARRAY_VS_SINGLETON', a, {
          en: `Passing ${this.src(a, 30)}, a pointer to the single object ${o.name} (${o.size.lo} bytes), to ${fname}, which uses it as an array (up to byte ${ix.need}).`,
          ko: `단일 객체 ${o.name}(${o.size.lo}바이트)의 포인터 ${this.src(a, 30)}을(를) 배열처럼 쓰는 ${fname}(바이트 ${ix.need}까지)에 넘깁니다.`,
        }, [st.trail, ix.ev], { tag: 'callee_ptr_arith' });
      }
    }
    if (S.writesMem && v.pt) this.pointeeWritten(st, v, a);
  }
  if (S.writesMem) { this.killMem(st); this.killAddrTaken(st); this.writesMem = true; }
  if (S.writesGlobals) { this.killGlobals(st); this.writesGlobals = true; }
  for (const [k, eff] of S.locks) {
    if (eff.op === 'acquire') this.acquireLock(st, { k, global: true }, e, this.ev(e, 'lock', `${fname} acquires lock ${k}.`, `${fname}이(가) 잠금 ${k}을(를) 얻습니다.`), eff.ev);
    else this.releaseLock(st, { k, global: true });
  }
  if (this.reporting && !this.quiet) {
    for (const k of S.acquires) {
      for (const [h, l] of st.locks) {
        if (h === k || l.h !== 'held' || !S.globalLocks.has(k)) continue;
        if (S.locks.has(k)) continue;
        this.lockOrders.push({ a: h, b: k, ga: l.global, gb: true, node: e, ev: this.ev(e, 'lock', `${fname} acquires lock ${k}.`, `${fname}이(가) 잠금 ${k}을(를) 얻습니다.`), aev: l.ev });
      }
    }
  }
  if (S.blocks) this.sleepCheck(st, e, fname, S.blocks);
  // return value
  let r = {};
  if (S.retPar !== undefined && vals[S.retPar]) r = { ...vals[S.retPar] };
  else if (S.retAlloc) {
    const aev = [this.ev(e, 'alloc_fn', `Storage is returned from allocation function ${fname}.`, `할당 함수 ${fname}이(가) 저장소를 반환합니다.`)];
    if (S.retAlloc.ev) aev.unshift(S.retAlloc.ev);
    const o = this.newHeap(st, e, S.retAlloc.ak, S.retAlloc.size ? { iv: S.retAlloc.size } : null, { name: fname, aev });
    r = { pt: [{ o: o.id, off: I.konst(0) }], nul: S.retNull ? 'maybe' : 'non' };
    if (S.retNull) r.nret = { fn: fname, key: S.key, ev: [S.retNullEv, this.ev(e, 'returned_null', `${fname} can return null.`, `${fname}은(는) 널을 반환할 수 있습니다.`)] };
  } else if (S.retNull) {
    r = { nul: 'maybe', nret: { fn: fname, key: S.key, ev: [S.retNullEv, this.ev(e, 'returned_null', `${fname} can return null.`, `${fname}은(는) 널을 반환할 수 있습니다.`)] } };
  } else if (S.retNonNull) r = { nul: 'non' };
  if (S.retOom && !S.retNull && r.nul !== 'null') { r.nul = 'maybe'; r.oom = true; }
  if (S.retIv) r.iv = S.retIv;
  if (S.retNeg) r.neg = { fn: fname, ev: [S.retNeg, this.ev(e, 'negative_return_fn', `${fname} can return a negative value.`, `${fname}은(는) 음수를 반환할 수 있습니다.`)] };
  if (S.retTaint) r.tnt = [S.retTaint, this.ev(e, 'tainted_return', `${fname} returns untrusted data.`, `${fname}은(는) 신뢰할 수 없는 데이터를 반환합니다.`)];
  if (!r.iv && this.isIntT(e.ctype)) r.iv = this.rangeIv(e.ctype);
  return r;
};

// The callee may write through pointer v.
P.markWrite = function markWrite(st, v) {
  if (!v || !v.pt) { if (v) this.writesMem = true; return; }
  for (const t of v.pt) { const o = st.obj(t.o); if (!o || !(o.kind === 'stack' && o.fnKey === this.key)) { this.writesMem = true; return; } }
};

P.pointeeWritten = function pointeeWritten(st, v, argNode) {
  if (!v || !v.pt) return;
  this.markWrite(st, v);
  const pt = this.T(argNode && argNode.ctype);
  const pointee = pt && pt.kind === 'pointer' ? this.T(pt.to) : null;
  if (pointee && pointee.const) return;
  for (const t of v.pt) {
    const o = st.obj(t.o);
    if (!o || o.kind === 'string') continue;
    const m = st.mut(t.o);
    m.init = 'yes';
    if (m.term === 'no' || m.term === 'yes') { m.term = undefined; m.slen = undefined; }
    if (o.vsym) { st.del(`v${o.vsym}`); this.killDeps(st, `v${o.vsym}`); }
  }
};

P.unknownCall = function unknownCall(st, e, args, vals) {
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (!v) continue;
    this.escapeValue(st, v);
    if (v.pt) this.pointeeWritten(st, v, args[i]);
    if (v.rid) { const o = st.obj(v.rid); if (o && !o.esc) st.mut(v.rid).esc = true; }
  }
  this.havocAll(st);
  this.writesMem = true;
  this.writesGlobals = true;
  const t = this.T(e.ctype);
  if (t.kind === 'pointer') return {};
  return this.typeVal(e.ctype);
};

// ---------------------------------------------------------------- library models

P.applyModel = function applyModel(st, e, m, args, vals, fname) {
  if (m.deref) {
    for (const i of m.deref) {
      if (i >= args.length) continue;
      if (!this.argDeref(st, vals[i], args[i], fname, null)) return {};
    }
  }
  if (m.str) for (const i of m.str) if (i < args.length) this.strArg(st, vals[i], args[i], fname);
  const v0 = vals[0], v1 = vals[1], v2 = vals[2];
  if (!OWN_ARGS.has(m.op)) for (let i = 0; i < vals.length; i++) if (vals[i] && vals[i].pt && !(m.deref || []).includes(i)) this.pointeeWritten(st, vals[i], args[i]);
  const intRes = () => this.typeVal(e.ctype);
  const nretOf = () => ({ fn: fname, ev: this.ev(e, 'returned_null', `${fname} returns null on failure.`, `${fname}은(는) 실패하면 널을 반환합니다.`) });
  switch (m.op) {
    case 'alloc': {
      let size = null;
      if (m.size === 'arg0' && v0) { this.sizeArgCheck(st, v0, args[0], e, fname); size = v0.iv ? { iv: v0.iv, sym: v0.sym } : null; }
      else if (m.size === 'arg1' && v1) { this.sizeArgCheck(st, v1, args[1], e, fname); size = v1.iv ? { iv: v1.iv, sym: v1.sym } : null; }
      else if (m.size === 'calloc' && v0 && v1) {
        if (!this.sizeArgCheck(st, v0, args[0], e, fname)) this.sizeArgCheck(st, v1, args[1], e, fname);
        if (v0.iv && v1.iv) size = { iv: I.mul(v0.iv, v1.iv), sym: I.isConst(v1.iv) && v1.iv.lo === 1 ? v0.sym : I.isConst(v0.iv) && v0.iv.lo === 1 ? v1.sym : undefined };
      } else if (m.size === 'strdup') {
        const L = this.strLen(st, v0);
        if (L) size = { iv: I.add(L, I.konst(1)) };
      }
      const tn = (m.size === 'strdup' || m.size === 'strndup') ? this.strTaint(st, v0) : null;
      const extra = {
        name: fname, aev: [this.ev(e, 'alloc_fn', `Storage is allocated by ${fname}.`, `${fname}(으)로 저장소를 할당합니다.`)],
        zero: m.zero, tnt: tn || undefined,
      };
      if (m.size === 'strdup' || m.size === 'strndup') { extra.term = 'yes'; const L = this.strLen(st, v0); if (L) extra.slen = L; }
      if (m.ak === 'file' || m.ak === 'pipe' || m.ak === 'dir') extra.aev = [this.ev(e, 'alloc_fn', `${fname} opens a resource.`, `${fname}이(가) 자원을 엽니다.`)];
      if (m.cmd !== undefined) this.stringSink(st, vals[m.cmd], args[m.cmd], e, fname, 'OS_CMD_INJECTION');
      const o = this.newHeap(st, e, m.ak, size, extra);
      if (!size || !(m.ak === 'malloc')) { if (m.ak !== 'malloc') st.mut(o.id).size = null; }
      const r = { pt: [{ o: o.id, off: I.konst(0) }], nul: m.nret ? 'maybe' : 'non' };
      if (m.nret && (!m.oom || this.E.opts.allocNull)) r.nret = nretOf();
      if (m.oom) r.oom = true;
      return r;
    }
    case 'realloc': {
      if (v1) this.sizeArgCheck(st, v1, args[1], e, fname);
      const old = this.target1(st, v0);
      const o = this.newHeap(st, e, 'malloc', v1 && v1.iv ? { iv: v1.iv, sym: v1.sym } : null, {
        name: fname, aev: [this.ev(e, 'alloc_fn', `Storage is allocated by ${fname}.`, `${fname}(으)로 저장소를 할당합니다.`)],
      });
      const r = { pt: [{ o: o.id, off: I.konst(0) }], nul: 'maybe', oom: true };
      if (this.E.opts.allocNull) r.nret = nretOf();
      // In a loop the block being grown can come from this very realloc
      // (same allocation site, same abstract object): the new block is that
      // object again, so it must not be marked released.
      if (old && old.o.id === o.id) {
        if (this.pendingRealloc && this.pendingRealloc.id === o.id) this.pendingRealloc = null;
        st.mut(o.id).multi = false;
      } else if (old && old.o.kind === 'heap' && old.o.ak && old.o.st === 'live') {
        const mo = st.mut(old.o.id);
        mo.st = 'freed';
        mo.fev = [this.ev(e, 'freed_arg', `${fname} releases the old block on success.`, `${fname}이(가) 성공하면 이전 블록을 해제합니다.`)];
        r.reall = old.o.id;
        const no = st.mut(o.id);
        no.term = old.o.term; no.slen = old.o.slen; no.tnt = old.o.tnt;
      } else if (v0 && v0.pt) this.escapeValue(st, v0);
      return r;
    }
    case 'free': {
      const rel = REL_OF_AK[m.ak] || 'free';
      this.release(st, v0, rel === 'free' && fname !== 'free' ? 'free' : rel, e, args[0], fname);
      return intRes();
    }
    case 'fd': {
      if (args[0] && (fname === 'open' || fname === 'open64' || fname === 'creat')) this.stringSink(st, v0, args[0], e, fname, 'TAINTED_STRING');
      const o = this.newHeap(st, e, 'fd', null, { name: fname, aev: [this.ev(e, 'alloc_fn', `${fname} returns a descriptor.`, `${fname}이(가) 디스크립터를 반환합니다.`)] });
      return { iv: I.make(-1, 2147483647), rid: o.id, neg: { fn: fname, ev: this.ev(e, 'negative_return_fn', `${fname} returns -1 on failure.`, `${fname}은(는) 실패하면 -1을 반환합니다.`) } };
    }
    case 'copy': {
      if (v2) {
        if (!this.sizeArgCheck(st, v2, args[2], e, fname)) {
          this.copySizeCheck(st, v0, v2, args[0], args[2], fname, 'write');
          this.copySizeCheck(st, v1, v2, args[1], args[2], fname, 'read');
        }
        if (fname === 'memcpy' || fname === '__builtin_memcpy') this.overlapCheck(st, v0, v1, v2, e, fname);
      }
      const src = this.target1(st, v1), dst = this.target1(st, v0);
      this.markWrite(st, v0);
      if (dst && dst.o.kind !== 'string') {
        const md = st.mut(dst.o.id);
        md.init = 'yes';
        if (src && src.o.tnt) md.tnt = src.o.tnt;
        if (src && src.o.term === 'yes' && v2 && v2.iv && src.o.slen && I.isConst(dst.t.off) && dst.t.off.lo === 0 && v2.iv.lo > src.o.slen.hi) { md.term = 'yes'; md.slen = src.o.slen; }
        else { md.term = undefined; md.slen = undefined; }
        if (dst.o.vsym) { st.del(`v${dst.o.vsym}`); this.killDeps(st, `v${dst.o.vsym}`); }
      } else if (v0 && v0.pt) this.pointeeWritten(st, v0, args[0]);
      this.killMem(st);
      return v0 ? { ...v0, nret: undefined } : {};
    }
    case 'memset': case 'bzero': {
      const n = m.op === 'memset' ? v2 : v1;
      const nNode = m.op === 'memset' ? args[2] : args[1];
      if (n && !this.sizeArgCheck(st, n, nNode, e, fname)) this.copySizeCheck(st, v0, n, args[0], nNode, fname, 'write');
      const dst = this.target1(st, v0);
      this.markWrite(st, v0);
      if (dst && dst.o.kind !== 'string') {
        const md = st.mut(dst.o.id);
        md.init = 'yes';
        const c = m.op === 'memset' && v1 && v1.iv && I.isConst(v1.iv) ? v1.iv.lo : (m.op === 'bzero' ? 0 : null);
        if (c === 0 && n && n.iv && dst.o.size && I.isConst(dst.t.off) && dst.t.off.lo === 0 && n.iv.lo >= dst.o.size.hi) { md.term = 'yes'; md.slen = I.konst(0); }
        else if (c === 0 && n && n.iv && n.iv.lo > 0 && I.isConst(dst.t.off) && dst.t.off.lo === 0) { md.term = 'yes'; md.slen = I.konst(0); }
        else { md.term = undefined; md.slen = undefined; }
        if (dst.o.vsym) { st.del(`v${dst.o.vsym}`); this.killDeps(st, `v${dst.o.vsym}`); }
      } else if (v0 && v0.pt) this.pointeeWritten(st, v0, args[0]);
      this.killMem(st);
      return v0 ? { ...v0, nret: undefined } : {};
    }
    case 'strcpy': return this.modelStrcpy(st, e, args, vals, fname);
    case 'strncpy': return this.modelStrncpy(st, e, args, vals, fname);
    case 'strcat': case 'strncat': return this.modelStrcat(st, e, args, vals, fname, m.op === 'strncat');
    case 'sprintf': case 'snprintf': return this.modelSprintf(st, e, args, vals, fname, m);
    case 'printf': {
      if (m.fmt !== undefined && args[m.fmt]) this.formatCheck(st, vals[m.fmt], args[m.fmt], e, fname);
      if (m.fmt !== undefined) for (let i = m.fmt + 1; i < args.length; i++) {
        if (this.isPtrT(args[i].ctype) && T.isCharType(T.pointee(this.T(args[i].ctype)) || T.T.int)) this.strArgFmt(st, vals[i], args[i], fname, args[m.fmt], i - m.fmt - 1);
      }
      return { iv: I.make(-1, 2147483647) };
    }
    case 'strlen': {
      const tg = this.target1(st, v0);
      const r = { iv: I.make(0, I.INF) };
      if (tg) {
        const L = this.strLen(st, v0);
        if (L) r.iv = L;
        else if (tg.avail && I.finite(tg.avail) && tg.o.term === 'yes') r.iv = I.make(0, Math.max(0, tg.avail.hi - 1));
        if (I.isConst(tg.t.off) && tg.t.off.lo === 0) { r.slen = tg.o.id; if (!this.inLoop()) r.sym = { s: `L${tg.o.id}`, d: 0 }; }
      }
      if (!r.sym && !this.inLoop()) r.sym = { s: `c${e.loc.start}`, d: 0 };
      return r;
    }
    case 'strnlen': {
      const r = { iv: I.make(0, I.INF) };
      if (v1 && v1.iv) r.iv = I.make(0, Math.max(0, v1.iv.hi));
      return r;
    }
    case 'pure': return intRes();
    case 'strcmp': return this.modelStrcmp(st, e, args, vals, fname, m);
    case 'find': {
      const r = { nul: 'maybe', nret: nretOf() };
      if (v0 && v0.pt) r.pt = v0.pt.map((t) => ({ o: t.o, off: I.make(0, I.INF) }));
      return r;
    }
    case 'atoi': {
      const r = this.typeVal(e.ctype);
      const tn = this.strTaint(st, v0);
      if (tn) r.tnt = [...[].concat(tn).slice(-2), this.ev(e, 'tainted_data_transitive', `${fname} converts the untrusted string to a number.`, `${fname}이(가) 신뢰할 수 없는 문자열을 숫자로 바꿉니다.`)];
      if (fname.startsWith('strto') && args[1]) this.pointeeWritten(st, v1, args[1]);
      return r;
    }
    case 'abs': {
      const r = this.typeVal(e.ctype);
      if (v0 && v0.iv) {
        const a = v0.iv;
        const lo = a.lo >= 0 ? a.lo : a.hi <= 0 ? -a.hi : 0;
        const hi = Math.max(Math.abs(a.lo), Math.abs(a.hi));
        r.iv = I.make(lo, hi);
        const rg = this.range(e.ctype);
        if (rg && r.iv.hi > rg.max) r.iv = I.make(lo === -rg.min ? rg.min : 0, rg.max);
      }
      if (v0 && v0.tnt) r.tnt = v0.tnt;
      return r;
    }
    case 'range': {
      const r = { iv: I.make(m.lo, m.hi) };
      if (m.neg) r.neg = { fn: fname, ev: this.ev(e, 'negative_return_fn', `${fname} returns -1 on failure.`, `${fname}은(는) 실패하면 -1을 반환합니다.`) };
      return r;
    }
    case 'passthru': return v0 ? { ...v0 } : intRes();
    case 'getenv': {
      if (!st.obj('ENV')) st.addObj({ id: 'ENV', kind: 'env', name: 'environment string', size: null, init: 'yes', term: 'yes', tnt: [this.ev(e, 'tainted_source', `${fname} returns an untrusted environment value.`, `${fname}은(는) 신뢰할 수 없는 환경 값을 반환합니다.`)] });
      return { pt: [{ o: 'ENV', off: I.konst(0) }], nul: 'maybe', nret: nretOf() };
    }
    case 'fgets': {
      if (v1 && !this.sizeArgCheck(st, v1, args[1], e, fname)) this.copySizeCheck(st, v0, v1, args[0], args[1], fname, 'write');
      this.taintBuffer(st, v0, e, fname, 'yes');
      const r = { nul: 'maybe' };
      if (v0 && v0.pt) r.pt = v0.pt;
      return r;
    }
    case 'gets': {
      const tg = this.target1(st, v0);
      if (tg && tg.o.size) {
        this.report('STRING_OVERFLOW', args[0], {
          en: `${fname} copies an input line of any length into ${tg.o.name} of ${I.show(tg.o.size)} bytes.`,
          ko: `${fname}이(가) 길이 제한 없는 입력 줄을 ${I.show(tg.o.size)}바이트인 ${tg.o.name}에 복사합니다.`,
        }, [st.trail], { tag: 'string_overflow' });
      }
      this.taintBuffer(st, v0, e, fname, 'yes');
      return v0 ? { pt: v0.pt, nul: 'maybe' } : {};
    }
    case 'read': {
      const buf = vals[m.buf], len = vals[m.len];
      if (buf) this.argDeref(st, buf, args[m.buf], fname, null);
      if (len && !this.sizeArgCheck(st, len, args[m.len], e, fname)) this.copySizeCheck(st, buf, len, args[m.buf], args[m.len], fname, 'write');
      this.taintBuffer(st, buf, e, fname, 'no');
      const hi = len && len.iv && Number.isFinite(len.iv.hi) ? len.iv.hi : 2147483647;
      const res = { iv: I.make(-1, hi), neg: { fn: fname, ev: this.ev(e, 'negative_return_fn', `${fname} returns -1 on failure.`, `${fname}은(는) 실패하면 -1을 반환합니다.`) } };
      // recv(fd, buf + used, N - used): `used += result` stays <= N.
      const rel = len ? this.offsetRel(st, args[m.buf], args[m.len], len) : null;
      if (rel) res.rel = { key: rel.key, end: rel.end };
      return res;
    }
    case 'fread': {
      if (v1 && v2 && v1.iv && v2.iv) this.copySizeCheck(st, v0, { iv: I.mul(v1.iv, v2.iv) }, args[0], args[2], fname, 'write');
      this.taintBuffer(st, v0, e, fname, 'no');
      return intRes();
    }
    case 'getc': {
      const r = { iv: I.make(-1, 255) };
      r.tnt = [this.ev(e, 'tainted_source', `${fname} reads untrusted input.`, `${fname}은(는) 신뢰할 수 없는 입력을 읽습니다.`)];
      return r;
    }
    case 'scanf': return this.modelScanf(st, e, args, vals, fname, m);
    case 'cmd': {
      this.stringSink(st, v0, args[0], e, fname, 'OS_CMD_INJECTION');
      for (let i = 1; i < args.length && /^exec|^_exec/.test(fname); i++) this.stringSink(st, vals[i], args[i], e, fname, 'OS_CMD_INJECTION');
      return intRes();
    }
    case 'tstr': {
      if (args[m.arg]) this.stringSink(st, vals[m.arg], args[m.arg], e, fname, 'TAINTED_STRING');
      return this.T(e.ctype).kind === 'pointer' ? {} : intRes();
    }
    case 'lock': {
      const lk = this.lockKey(args[0]);
      this.acquireLock(st, lk, e, this.ev(e, 'lock', `Acquiring lock ${lk ? lk.k : '?'}.`, `잠금 ${lk ? lk.k : '?'}을(를) 얻습니다.`));
      return { iv: I.konst(0) };
    }
    case 'unlock': {
      this.releaseLock(st, this.lockKey(args[0]));
      return intRes();
    }
    case 'trylock': {
      const lk = this.lockKey(args[0]);
      if (!lk) return intRes();
      return { iv: m.succ === 'zero' ? I.make(0, 2147483647) : I.make(0, 1), lck: lk.k, lckSucc: m.succ, lckEv: this.ev(e, 'lock', `Acquiring lock ${lk.k} (trylock succeeded).`, `잠금 ${lk.k}을(를) 얻습니다(trylock 성공).`), lckNode: e };
    }
    case 'sleep': {
      this.sleepCheck(st, e, fname, null);
      return intRes();
    }
    default: return this.unknownCall(st, e, args, vals);
  }
};

// Predicate functions `bool valid(int x) { return x >= 0 && x < N; }` (same
// translation unit): a branch on the call refines the arguments as if the
// returned expression were written at the call site.
P.assumePred = function assumePred(st, e, truth) {
  const c = skip(e.callee);
  if (!c || c.type !== 'Identifier' || !c.symbol || c.symbol.kind !== 'function') return 'ok';
  const def = c.symbol.definition;
  if (!def || def.type !== 'FunctionDecl' || !def.body || def.body.type !== 'CompoundStmt' || def === this.fn) return 'ok';
  if (this.E.symById(this.unit, c.symbol.id) !== c.symbol) return 'ok';
  const body = def.body.body || [];
  if (body.length !== 1 || body[0].type !== 'ReturnStmt' || !body[0].arg) return 'ok';
  const ret = body[0].arg;
  const params = def.params || [];
  const pids = new Map();
  params.forEach((p, i) => { if (p.symbol) pids.set(p.symbol.id, i); });
  let ok = true;
  cf.walk(ret, (n) => {
    if (!ok) return cf.walk.STOP;
    if (n.type === 'CallExpr' || n.type === 'AssignExpr' || n.type === 'StmtExpr' || (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--' || n.op === '*' || n.op === '&'))) ok = false;
    if (n.type === 'MemberExpr' || n.type === 'IndexExpr') ok = false;
    if (n.type === 'Identifier' && n.symbol && n.symbol.kind !== 'enumerator' && !pids.has(n.symbol.id)
      && !(n.symbol.storage === 'static' && n.symbol.type && T.canonical(n.symbol.type) && T.canonical(n.symbol.type).const)) ok = false;
    return undefined;
  });
  if (!ok) return 'ok';
  const args = e.args || [];
  const saved = [];
  for (const [id, i] of pids) {
    const a = args[i];
    if (!a || !this.isIntT(a.ctype) || !this.isIntT(params[i].ctype)) continue;
    const pk = `v${id}`;
    saved.push({ pk, old: st.get(pk), a, i });
    const v = this.peek(st, a);
    st.set(pk, this.convert(v, params[i].ctype, a.ctype, a));
  }
  if (!saved.length) return 'ok';
  this.quiet++;
  let r;
  try { r = this.assume(st, ret, truth); } finally { this.quiet--; }
  for (const s of saved) {
    const nv = st.get(s.pk);
    if (s.old === undefined) st.env.delete(s.pk); else st.env.set(s.pk, s.old);
    if (r === 'ok' && nv && nv.iv) this.applyRefine(st, s.a, nv.iv, null, null);
  }
  st.touch();
  return r === 'ok' ? 'ok' : r;
};

// strcmp / strncmp: decide equality when both strings, or one literal and the other length, are known.
P.modelStrcmp = function modelStrcmp(st, e, args, vals, fname, m) {
  const any = { iv: I.make(-2147483648, 2147483647) };
  const nonzero = { iv: I.make(-2147483648, 2147483647, { nz: true }) };
  let n = null;
  if (m.n !== undefined) {
    const nv = vals[m.n];
    if (!nv || !nv.iv || !I.isConst(nv.iv)) return any;
    n = nv.iv.lo;
  }
  const lit = (v) => {
    const tg = this.target1(st, v);
    if (!tg || tg.o.lit === undefined || !I.isConst(tg.t.off)) return null;
    return tg.o.lit.slice(tg.t.off.lo / (tg.o.esz || 1));
  };
  const fold = (s) => (/case/.test(fname) ? s.toLowerCase() : s);
  const A = lit(vals[0]), B = lit(vals[1]);
  if (A !== null && B !== null) {
    let a = fold(A), b = fold(B);
    if (n !== null) { a = a.slice(0, n); b = b.slice(0, n); }
    return a === b ? { iv: I.konst(0) } : nonzero;
  }
  for (const [x, y] of [[0, 1], [1, 0]]) {
    const L = lit(vals[y]);
    if (L === null) continue;
    const len = this.strLen(st, vals[x]);
    if (!len) continue;
    if (n === null ? !I.contains(len, L.length) : len.hi < Math.min(L.length, n)) return nonzero;
  }
  return any;
};

P.inLoop = function inLoop() {
  return !!(this.curBlock && this.loopBlocks && this.loopBlocks.has(this.curBlock));
};

P.taintBuffer = function taintBuffer(st, v, e, fname, term) {
  if (!v || !v.pt) return;
  this.markWrite(st, v);
  const tn = [this.ev(e, 'tainted_source', `${fname} fills the buffer with untrusted input.`, `${fname}이(가) 신뢰할 수 없는 입력으로 버퍼를 채웁니다.`)];
  for (const t of v.pt) {
    const o = st.obj(t.o);
    if (!o || o.kind === 'string') continue;
    const m = st.mut(t.o);
    m.tnt = tn;
    m.init = 'yes';
    m.term = term === 'yes' ? 'yes' : 'no';
    m.slen = undefined;
    if (term === 'no') m.tev = this.ev(e, 'string_null_source', `${fname} does not NUL-terminate the buffer.`, `${fname}은(는) 버퍼 끝에 NUL을 넣지 않습니다.`);
    if (o.vsym) { st.del(`v${o.vsym}`); this.killDeps(st, `v${o.vsym}`); }
  }
  this.killMem(st);
};

P.overlapCheck = function overlapCheck(st, d, s, n, e, fname) {
  if (!d || !s || !d.pt || !s.pt || d.pt.length !== 1 || s.pt.length !== 1 || !n.iv) return;
  const a = d.pt[0], b = s.pt[0];
  if (a.o !== b.o || !I.isConst(a.off) || !I.isConst(b.off)) return;
  const dist = Math.abs(a.off.lo - b.off.lo);
  if (dist < n.iv.lo) {
    this.report('OVERLAPPING_COPY', e, {
      en: `The source and destination of ${fname} overlap: they are ${dist} bytes apart and ${I.show(n.iv)} bytes are copied.`,
      ko: `${fname}의 원본과 대상이 겹칩니다: ${dist}바이트 떨어져 있는데 ${I.show(n.iv)}바이트를 복사합니다.`,
    }, [st.trail], { tag: 'overlapping_copy' });
  }
};

P.formatCheck = function formatCheck(st, v, argNode, e, fname) {
  const a = skip(argNode);
  if (a && a.type === 'StringLiteral') return;
  this.stringSink(st, v, argNode, e, fname, 'FORMAT_STRING');
};

P.strArgFmt = function strArgFmt(st, v, argNode, fname, fmtNode, idx) {
  const f = skip(fmtNode);
  if (!f || f.type !== 'StringLiteral' || f.incomplete) return;
  const convs = fmtConversions(f.value || '');
  const c = convs[idx];
  if (c && c.conv === 's' && !c.prec) this.strArg(st, v, argNode, fname);
};

function fmtConversions(fmt) {
  const out = [];
  const re = /%([-+ #0']*)(\*|\d+)?(?:\.(\*|\d+))?(hh|h|ll|l|j|z|t|L)?([diouxXeEfFgGaAcspn%])/g;
  let m;
  while ((m = re.exec(fmt))) {
    if (m[5] === '%') continue;
    if (m[2] === '*') out.push({ conv: '*' });
    if (m[3] === '*') out.push({ conv: '*' });
    out.push({ conv: m[5], width: m[2] && m[2] !== '*' ? Number(m[2]) : 0, prec: m[3] !== undefined ? (m[3] === '*' ? -1 : Number(m[3])) : null });
  }
  return out;
}

// Minimum number of characters the format produces (constant parts and known arguments).
P.fmtMinLen = function fmtMinLen(st, fmt, args, vals, first) {
  let lit = fmt.replace(/%%/g, 'x');
  let min = 0;
  let tnt = null;
  let unbounded = null;
  const convs = fmtConversions(fmt);
  min = lit.replace(/%([-+ #0']*)(\*|\d+)?(?:\.(\*|\d+))?(hh|h|ll|l|j|z|t|L)?([diouxXeEfFgGaAcspn])/g, '').length;
  let ai = first;
  for (const c of convs) {
    const v = vals[ai], a = args[ai];
    ai++;
    if (c.conv === '*') continue;
    let w = 0;
    if (c.conv === 's') {
      const L = this.strLen(st, v);
      w = L && c.prec === null ? L.lo : 0;
      if (c.prec > 0 && L) w = Math.min(L.lo, c.prec);
      const tn = this.strTaint(st, v);
      if (tn && c.prec === null) { tnt = tn; unbounded = a; }
    } else if (c.conv === 'c') w = 1;
    else if (c.conv === 'n' || c.conv === 'p') w = c.conv === 'p' ? 1 : 0;
    else if ('diouxX'.includes(c.conv)) {
      w = 1;
      if (v && v.iv && I.isConst(v.iv) && 'di'.includes(c.conv)) w = String(v.iv.lo).length;
      else if (v && v.iv && v.iv.lo < 0 && 'di'.includes(c.conv) && v.iv.hi < 0) w = 2;
    } else w = 1;
    min += Math.max(w, c.width || 0);
  }
  return { min, tnt, unbounded };
};

P.modelSprintf = function modelSprintf(st, e, args, vals, fname, m) {
  const fi = m.fmt;
  const fmtNode = skip(args[fi]);
  if (args[fi]) this.formatCheck(st, vals[fi], args[fi], e, fname);
  const dst = this.target1(st, vals[0]);
  this.markWrite(st, vals[0]);
  if (m.op === 'snprintf' && vals[1] && !(vals[1].iv && I.isConst(vals[1].iv) && vals[1].iv.lo === 0)) {
    if (!this.argDeref(st, vals[0], args[0], fname, null)) return {};
  }
  if (m.op === 'snprintf' && vals[1]) {
    if (!this.sizeArgCheck(st, vals[1], args[1], e, fname)) this.copySizeCheck(st, vals[0], vals[1], args[0], args[1], fname, 'write');
  }
  let slen = null, tnt = null;
  if (fmtNode && fmtNode.type === 'StringLiteral' && !fmtNode.incomplete) {
    const fl = this.fmtMinLen(st, fmtNode.value || '', args, vals, fi + 1);
    tnt = fl.tnt;
    for (let i = fi + 1; i < args.length; i++) {
      const v = vals[i];
      if (v && v.pt && vals[0] && vals[0].pt && v.pt.length === 1 && vals[0].pt.length === 1 && v.pt[0].o === vals[0].pt[0].o) {
        this.report('OVERLAPPING_COPY', args[i], {
          en: `${this.src(args[i], 30)} is both a source and the destination of ${fname}.`,
          ko: `${this.src(args[i], 30)}이(가) ${fname}의 원본이면서 대상입니다.`,
        }, [st.trail], { tag: 'overlapping_copy' });
      }
    }
    if (m.op === 'sprintf' && dst && dst.avail && Number.isFinite(dst.avail.hi)) {
      if (fl.min + 1 > dst.avail.hi) {
        this.report('OVERRUN', args[0], {
          en: `${fname} writes at least ${fl.min + 1} bytes into ${dst.o.name}, which has ${I.show(dst.avail)} bytes.`,
          ko: `${fname}이(가) ${I.show(dst.avail)}바이트인 ${dst.o.name}에 적어도 ${fl.min + 1}바이트를 씁니다.`,
        }, [dst.o.aev, st.trail], { tag: 'overrun' });
      } else if (fl.tnt && dst.o.kind !== 'heap' && dst.o.size && I.isConst(dst.o.size)) {
        this.report('STRING_OVERFLOW', fl.unbounded || args[0], {
          en: `${fname} copies the untrusted string ${this.src(fl.unbounded, 30)} of unchecked length into ${dst.o.name} of ${I.show(dst.avail)} bytes.`,
          ko: `${fname}이(가) 길이를 확인하지 않은 신뢰할 수 없는 문자열 ${this.src(fl.unbounded, 30)}을(를) ${I.show(dst.avail)}바이트인 ${dst.o.name}에 복사합니다.`,
        }, [fl.tnt, st.trail], { tag: 'string_overflow' });
      }
    }
    const convs = fmtConversions(fmtNode.value || '');
    convs.forEach((c, k) => { if (c.conv === 's') this.strArg(st, vals[fi + 1 + k], args[fi + 1 + k], fname); });
    if (!convs.length) slen = I.konst((fmtNode.value || '').replace(/%%/g, '%').length);
  }
  if (dst && dst.o.kind !== 'string') {
    const md = st.mut(dst.o.id);
    md.init = 'yes';
    md.term = 'yes';
    md.slen = slen && I.isConst(dst.t.off) && dst.t.off.lo === 0 ? slen : undefined;
    if (tnt) md.tnt = tnt;
  }
  this.killMem(st);
  return { iv: I.make(-1, 2147483647) };
};

P.modelStrcpy = function modelStrcpy(st, e, args, vals, fname) {
  const [d, s] = vals;
  const dst = this.target1(st, d), src = this.target1(st, s);
  this.markWrite(st, d);
  const L = this.strLen(st, s);
  const tn = this.strTaint(st, s);
  if (dst && src && dst.o.id === src.o.id) {
    this.report('OVERLAPPING_COPY', e, {
      en: `The source and destination of ${fname} are the same buffer ${dst.o.name}.`,
      ko: `${fname}의 원본과 대상이 같은 버퍼 ${dst.o.name}입니다.`,
    }, [st.trail], { tag: 'overlapping_copy' });
  }
  if (dst && dst.o.st !== 'freed') {
    let reported = false;
    if (L && dst.avail && L.lo + 1 > dst.avail.hi) {
      this.report('OVERRUN', args[0], {
        en: `${fname} copies ${L.lo + 1} bytes (string ${this.src(args[1], 30)} and its NUL) into ${dst.o.name} of ${I.show(dst.avail)} bytes.`,
        ko: `${fname}이(가) ${L.lo + 1}바이트(문자열 ${this.src(args[1], 30)}와 NUL)를 ${I.show(dst.avail)}바이트인 ${dst.o.name}에 복사합니다.`,
      }, [dst.o.aev, st.trail], { tag: 'overrun' });
      reported = true;
    } else if (!reported && src && dst.o.ssym && dst.o.ssym.s === `L${src.o.id}` && dst.o.ssym.d <= 0 && I.isConst(dst.t.off) && dst.t.off.lo === 0) {
      this.report('OVERRUN', args[0], {
        en: `${fname} copies strlen(${this.src(args[1], 30)}) + 1 bytes into ${dst.o.name}, which was allocated with only strlen(${this.src(args[1], 30)})${dst.o.ssym.d ? ` ${dst.o.ssym.d}` : ''} bytes.`,
        ko: `${fname}이(가) strlen(${this.src(args[1], 30)}) + 1바이트를 strlen(${this.src(args[1], 30)})${dst.o.ssym.d ? ` ${dst.o.ssym.d}` : ''}바이트만 할당한 ${dst.o.name}에 복사합니다.`,
      }, [dst.o.aev, st.trail], { tag: 'alloc_strlen' });
      reported = true;
    } else if (tn && !L && dst.o.size && I.isConst(dst.o.size) && dst.o.kind !== 'heap') {
      this.report('STRING_OVERFLOW', args[1], {
        en: `${fname} copies the untrusted string ${this.src(args[1], 30)} of unchecked length into ${dst.o.name} of ${I.show(dst.o.size)} bytes.`,
        ko: `${fname}이(가) 길이를 확인하지 않은 신뢰할 수 없는 문자열 ${this.src(args[1], 30)}을(를) ${I.show(dst.o.size)}바이트인 ${dst.o.name}에 복사합니다.`,
      }, [tn, st.trail], { tag: 'string_overflow' });
    }
    if (dst.o.kind !== 'string') {
      const md = st.mut(dst.o.id);
      md.init = 'yes';
      md.term = 'yes';
      md.slen = L && I.isConst(dst.t.off) && dst.t.off.lo === 0 ? L : undefined;
      md.tnt = tn || undefined;
      if (src && src.o.ssym && src.o.ssym.s) { /* keep */ }
    }
  }
  this.killMem(st);
  return d ? { ...d, nret: undefined } : {};
};

P.modelStrncpy = function modelStrncpy(st, e, args, vals, fname) {
  const [d, s, n] = vals;
  const dst = this.target1(st, d);
  this.markWrite(st, d);
  const L = this.strLen(st, s);
  if (n && !this.sizeArgCheck(st, n, args[2], e, fname)) this.copySizeCheck(st, d, n, args[0], args[2], fname, 'write');
  if (dst && n && n.iv && I.isConst(n.iv) && dst.o.size && I.isConst(dst.o.size) && I.isConst(dst.t.off) && dst.t.off.lo === 0
    && n.iv.lo === dst.o.size.lo && !(L && L.hi < n.iv.lo) && T.isCharType(T.pointee(this.T(args[0].ctype)) || T.T.int) && !this.terminatedNext(e, args[0])) {
    this.report('BUFFER_SIZE', args[2], {
      en: `${fname} is called with the full size of ${dst.o.name} (${n.iv.lo}), so the copy may leave it without a terminating NUL.`,
      ko: `${fname}에 ${dst.o.name}의 전체 크기(${n.iv.lo})를 넘겨서 복사 결과에 끝 NUL이 없을 수 있습니다.`,
    }, [st.trail], { tag: 'buffer_size_warning' });
  }
  if (dst && dst.o.kind !== 'string') {
    const md = st.mut(dst.o.id);
    md.init = 'yes';
    if (L && n && n.iv && L.hi < n.iv.lo) { md.term = 'yes'; md.slen = I.isConst(dst.t.off) && dst.t.off.lo === 0 ? L : undefined; }
    else if (!n || !n.iv || !I.isConst(n.iv)) { md.term = undefined; md.slen = undefined; }
    else {
      md.term = 'no';
      md.slen = undefined;
      md.tev = this.ev(e, 'string_null_source', `${fname} does not add a NUL when the source is at least ${this.src(args[2], 30)} characters long.`, `원본이 ${this.src(args[2], 30)}자 이상이면 ${fname}은(는) NUL을 넣지 않습니다.`);
    }
    const tn = this.strTaint(st, s);
    if (tn) md.tnt = tn;
  }
  this.killMem(st);
  return d ? { ...d, nret: undefined } : {};
};

// The statement after the call writes the terminating NUL itself: dst[...] = 0.
P.terminatedNext = function terminatedNext(e, dstNode) {
  let stmt = e, p = cf.parentOf(e);
  while (p && p.type !== 'CompoundStmt') { stmt = p; p = cf.parentOf(p); }
  if (!p) return false;
  const i = p.body.indexOf(stmt);
  const name = this.src(dstNode, 200).replace(/\s+/g, '');
  for (const nx of p.body.slice(i + 1, i + 3)) {
    const t = this.src(nx, 400).replace(/\s+/g, '');
    if (t.startsWith(`${name}[`) && /\]=(0|'\\0'|\(char\)0);?$/.test(t)) return true;
  }
  return false;
};

P.modelStrcat = function modelStrcat(st, e, args, vals, fname, bounded) {
  const [d, s, n] = vals;
  const dst = this.target1(st, d);
  this.markWrite(st, d);
  const Ls = this.strLen(st, s);
  const Ld = this.strLen(st, d);
  const tn = this.strTaint(st, s);
  if (dst && dst.o.st !== 'freed') {
    if (bounded && n && n.iv && I.isConst(n.iv) && dst.o.size && I.isConst(dst.o.size) && I.isConst(dst.t.off) && dst.t.off.lo === 0 && n.iv.lo >= dst.o.size.lo) {
      this.report('BUFFER_SIZE', args[2], {
        en: `${fname} is given the full size of ${dst.o.name} (${n.iv.lo}), but its bound is the space left after the current string.`,
        ko: `${fname}에 ${dst.o.name}의 전체 크기(${n.iv.lo})를 넘기는데, 이 인자는 현재 문자열 뒤에 남은 공간이어야 합니다.`,
      }, [st.trail], { tag: 'buffer_size' });
    } else if (!bounded && dst.avail && Ld && Ls && Ld.lo + Ls.lo + 1 > dst.avail.hi) {
      this.report('OVERRUN', args[0], {
        en: `${fname} needs ${Ld.lo + Ls.lo + 1} bytes in ${dst.o.name}, which has ${I.show(dst.avail)} bytes.`,
        ko: `${fname}에 ${Ld.lo + Ls.lo + 1}바이트가 필요한데 ${dst.o.name}은(는) ${I.show(dst.avail)}바이트입니다.`,
      }, [dst.o.aev, st.trail], { tag: 'overrun' });
    } else if (!bounded && tn && !Ls && dst.o.size && I.isConst(dst.o.size) && dst.o.kind !== 'heap') {
      this.report('STRING_OVERFLOW', args[1], {
        en: `${fname} appends the untrusted string ${this.src(args[1], 30)} of unchecked length to ${dst.o.name} of ${I.show(dst.o.size)} bytes.`,
        ko: `${fname}이(가) 길이를 확인하지 않은 신뢰할 수 없는 문자열 ${this.src(args[1], 30)}을(를) ${I.show(dst.o.size)}바이트인 ${dst.o.name}에 덧붙입니다.`,
      }, [tn, st.trail], { tag: 'string_overflow' });
    }
    if (dst.o.kind !== 'string') {
      const md = st.mut(dst.o.id);
      md.term = 'yes';
      md.slen = Ld && Ls && !bounded ? I.add(Ld, Ls) : undefined;
      if (tn) md.tnt = tn;
    }
  }
  this.killMem(st);
  return d ? { ...d, nret: undefined } : {};
};

P.modelScanf = function modelScanf(st, e, args, vals, fname, m) {
  const fmtNode = skip(args[m.fmt]);
  if (args[m.fmt]) this.formatCheck(st, vals[m.fmt], args[m.fmt], e, fname);
  const tn = m.from !== undefined ? this.strTaint(st, vals[m.from]) : null;
  const taint = tn || [this.ev(e, 'tainted_source', `${fname} reads untrusted input.`, `${fname}은(는) 신뢰할 수 없는 입력을 읽습니다.`)];
  const convs = fmtNode && fmtNode.type === 'StringLiteral' && !fmtNode.incomplete ? scanConversions(fmtNode.value || '') : null;
  let k = 0;
  for (let i = m.fmt + 1; i < args.length; i++, k++) {
    const v = vals[i];
    const c = convs ? convs[k] : null;
    if (!v || !v.pt) continue;
    this.markWrite(st, v);
    if (c && (c.conv === 's' || c.conv === '[') && !c.width && m.from === undefined) {
      const tg = this.target1(st, v);
      if (tg && tg.o.size) {
        this.report('STRING_OVERFLOW', args[i], {
          en: `${fname} reads a string of any length with "%${c.conv === '[' ? '[' : 's'}" into ${tg.o.name} of ${I.show(tg.o.size)} bytes.`,
          ko: `${fname}이(가) "%${c.conv === '[' ? '[' : 's'}"로 길이 제한 없는 문자열을 ${I.show(tg.o.size)}바이트인 ${tg.o.name}에 읽습니다.`,
        }, [st.trail], { tag: 'string_overflow' });
      }
    }
    for (const t of v.pt) {
      const o = st.obj(t.o);
      if (!o || o.kind === 'string') continue;
      const mo = st.mut(t.o);
      mo.init = 'yes';
      mo.tnt = taint;
      if (c && (c.conv === 's' || c.conv === '[')) { mo.term = 'yes'; mo.slen = undefined; }
      if (o.vsym && o.scalar) {
        const sym = this.E.symById(this.unit, o.vsym);
        const val = sym ? this.typeVal(sym.type) : {};
        val.tnt = taint;
        st.set(`v${o.vsym}`, val);
        this.killDeps(st, `v${o.vsym}`);
      }
    }
  }
  this.killMem(st);
  return { iv: I.make(-1, Math.max(0, args.length - m.fmt - 1)) };
};

function scanConversions(fmt) {
  const out = [];
  const re = /%(\*)?(\d+)?(hh|h|ll|l|j|z|t|L)?(\[[^\]]*\]|[diouxXeEfFgGaAcspn%])/g;
  let m;
  while ((m = re.exec(fmt))) {
    if (m[4] === '%') continue;
    if (m[1]) continue;
    out.push({ conv: m[4][0] === '[' ? '[' : m[4], width: m[2] ? Number(m[2]) : 0 });
  }
  return out;
}

module.exports = { REL_AK, fmtConversions };
