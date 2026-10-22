'use strict';

// Expression evaluation, memory access checks and condition refinement,
// mixed into FnAnalyzer.prototype.

const { isRefType, FnAnalyzer, skip, hasSideEffects, isDep, CMP, NEGATE, SWAP, I, T, cf, vJoin, joinStates } = require('./interp');

const P = FnAnalyzer.prototype;

P.boolV = function boolV(iv) {
  return { iv: iv || I.make(0, 1) };
};

// Truthiness of a value: true, false or null (unknown).
P.truth = function truth(v, t) {
  if (!v) return null;
  if (this.isPtrT(t) || v.pt || v.nul) {
    if (v.nul === 'null') return false;
    if (v.nul === 'non') return true;
    return null;
  }
  if (v.iv) {
    if (I.isConst(v.iv)) return v.iv.lo !== 0;
    if (!I.contains(v.iv, 0)) return true;
  }
  return null;
};

P.eval = function evalE(st, e) {
  if (!e || st.dead) return {};
  switch (e.type) {
    case 'IntegerLiteral': return { iv: I.konst(Number(e.value)) };
    case 'CharLiteral': return { iv: I.konst(Number(e.value)) };
    case 'BoolLiteral': return { iv: I.konst(e.value ? 1 : 0) };
    case 'FloatingLiteral': return {};
    case 'NullptrLiteral': return { nul: 'null', iv: I.konst(0) };
    case 'StringLiteral': return this.stringLit(st, e);
    case 'ParenExpr': return this.eval(st, e.expr);
    case 'Identifier': return this.evalIdent(st, e);
    case 'CastExpr': return this.evalCast(st, e);
    case 'UnaryExpr': return this.evalUnary(st, e);
    case 'BinaryExpr': return this.evalBinary(st, e);
    case 'AssignExpr': return this.evalAssign(st, e);
    case 'ConditionalExpr': return this.evalCond(st, e);
    case 'CallExpr': return this.evalCall(st, e);
    case 'MemberExpr': case 'IndexExpr': {
      const L = this.lval(st, e);
      if (st.dead) return {};
      if (T.isArray(this.T(e.ctype))) return L.ptr || { nul: 'non' };
      return this.load(st, L, e);
    }
    case 'SizeofExpr': case 'AlignofExpr': case 'OffsetofExpr': {
      const c = this.constOf(e);
      if (c !== null) return { iv: I.konst(c) };
      if (e.type === 'SizeofExpr' && e.arg && T.isArray(this.T(e.arg.ctype))) {
        const L = this.lval(st, e.arg);
        if (L.ptr && L.ptr.pt && L.ptr.pt.length === 1) {
          const o = st.obj(L.ptr.pt[0].o);
          if (o && o.size) return { iv: o.size, sym: o.ssym || undefined };
        }
      }
      return { iv: I.make(0, I.INF) };
    }
    case 'InitList': for (const x of e.items || []) this.eval(st, x); return {};
    case 'DesignatedInit': return this.eval(st, e.value);
    case 'CompoundLiteral': {
      if (e.init) this.eval(st, e.init);
      const t = this.T(e.ctype);
      if (t.kind === 'array') {
        const id = `C${e.loc.start}`;
        st.addObj({ id, kind: 'stack', name: 'compound literal', size: this.sizeOf(t) != null ? I.konst(this.sizeOf(t)) : null, esz: this.elemSizeOfArray(t), init: 'yes', fnKey: this.key });
        return { pt: [{ o: id, off: I.konst(0) }], nul: 'non', nn: 'addr' };
      }
      return {};
    }
    case 'NewExpr': return this.evalNew(st, e);
    case 'DeleteExpr': {
      const v = this.eval(st, e.arg);
      this.release(st, v, e.array ? 'delete[]' : 'delete', e, e.arg);
      return {};
    }
    case 'ThrowExpr': if (e.arg) this.eval(st, e.arg); return {};
    case 'ThisExpr': return { nul: 'non', nn: 'addr' };
    case 'StmtExpr': {
      cf.walk(e.body, (n) => {
        if (n.type === 'AssignExpr' || (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--'))) {
          const k = this.keyOf(n.type === 'AssignExpr' ? n.left : n.arg);
          if (k) { st.del(k); this.killDeps(st, k); }
        }
        if (n.type === 'CallExpr') this.havocAll(st);
      });
      return {};
    }
    case 'LambdaExpr': return { nul: 'non' };
    case 'VaArgExpr': this.eval(st, e.arg); return this.typeVal(e.ctype);
    case 'PackExpansion': return {};
    default: return this.typeVal(e.ctype);
  }
};

P.stringLit = function stringLit(st, e) {
  const id = `S${e.loc.start}:${e.loc.file}`;
  if (!st.obj(id)) {
    const csize = this.sizeOf(T.pointee(this.T(e.ctype)) || T.T.char) || 1;
    const len = e.length || ((e.value || '').length + 1);
    st.addObj({ id, kind: 'string', name: `"${(e.value || '').slice(0, 20)}"`, size: I.konst(len * csize), esz: csize, init: 'yes', term: 'yes', slen: I.konst(len - 1), lit: e.value || '' });
  }
  return { pt: [{ o: id, off: I.konst(0) }], nul: 'non', nn: 'addr' };
};

P.evalIdent = function evalIdent(st, e) {
  const s = e.symbol;
  if (!s) return {};
  if (s.kind === 'enumerator') return { iv: I.konst(Number(s.value)) };
  if (s.kind === 'function') return { fn: s.qname || s.name, nul: 'non', nn: 'addr' };
  if (s.kind === 'field') {
    const k = `this->${e.name}`;
    const t = this.T(e.ctype);
    if (t.kind === 'array') return { nul: 'non' };
    return st.get(k) || this.typeVal(e.ctype);
  }
  if (s.kind !== 'variable' && s.kind !== 'parameter') return this.typeVal(e.ctype);
  const t = this.T(s.type || e.ctype);
  if (t.kind === 'array' || t.kind === 'function') {
    const o = this.varObj(st, s);
    return { pt: [{ o: o.id, off: I.konst(0) }], nul: 'non', nn: 'addr' };
  }
  if (T.isRecord(t)) return {};
  return this.load(st, { k: 'var', key: `v${s.id}`, sym: s, type: s.type }, e);
};

P.initialValue = function initialValue(sym) {
  const t = this.T(sym.type);
  if (t.volatile) return this.typeVal(t);
  if (sym.storage === 'static' && t.const && sym.constInit) {
    const c = this.constOf(sym.constInit);
    if (c !== null) return { iv: I.konst(c) };
  }
  if (sym.storage === 'static' && t.const && sym.definition && sym.definition.init && sym.definition.init.type !== 'InitList') {
    const c = this.constOf(sym.definition.init);
    if (c !== null) return { iv: I.konst(c) };
  }
  return this.typeVal(t);
};

// ---------------------------------------------------------------- lvalues

P.lval = function lval(st, e) {
  e = skip(e);
  if (!e) return { k: 'unknown' };
  switch (e.type) {
    case 'Identifier': {
      const s = e.symbol;
      if (!s) return { k: 'unknown', type: e.ctype };
      if (s.kind === 'field') return { k: 'mem', key: `this->${e.name}`, type: e.ctype, ptr: null, node: e, thisField: true };
      if (s.kind === 'variable' || s.kind === 'parameter') {
        if (isRefType(s.type)) return { k: 'unknown', type: e.ctype, ref: true };
        return { k: 'var', key: `v${s.id}`, sym: s, type: s.type || e.ctype, node: e };
      }
      return { k: 'unknown', type: e.ctype };
    }
    case 'UnaryExpr':
      if (e.op === '*') {
        const pv = this.eval(st, e.arg);
        const bk = this.keyOf(e.arg);
        return { k: 'mem', key: bk ? `*${bk}` : null, ptr: pv, type: e.ctype, node: e, baseNode: e.arg, baseKey: bk };
      }
      break;
    case 'IndexExpr': {
      let baseE = e.object, idxE = e.index;
      if (!this.isPtrT(baseE.ctype) && this.isPtrT(idxE.ctype)) { baseE = e.index; idxE = e.object; }
      const base = this.eval(st, baseE);
      const idx = this.eval(st, idxE);
      const esz = this.sizeOf(e.ctype) || 1;
      const ptr = this.ptrAdd(base, idx, esz, idxE.ctype);
      const bk = this.keyOf(baseE);
      const c = idx.iv && I.isConst(idx.iv) ? idx.iv.lo : null;
      return { k: 'mem', key: bk && c !== null ? `${bk}[${c}]` : null, ptr, type: e.ctype, node: e, idx, idxNode: idxE, baseNode: baseE, baseKey: bk, esz };
    }
    case 'MemberExpr': {
      if (e.arrow) {
        const pv = this.eval(st, e.object);
        const bk = this.keyOf(e.object);
        const ptr = this.memberPtr(st, pv, e);
        return { k: 'mem', key: bk ? `${bk}->${e.member}` : null, ptr, type: e.ctype, node: e, baseNode: e.object, baseKey: bk, arrowOf: pv };
      }
      const L = this.lval(st, e.object);
      const key = L.key ? `${L.key}.${e.member}` : null;
      let ptr = null;
      if (L.k === 'var' && L.sym) {
        const t = this.T(L.sym.type);
        if (T.isRecord(t)) {
          const o = this.varObj(st, L.sym);
          ptr = this.memberPtr(st, { pt: [{ o: o.id, off: I.konst(0) }], nul: 'non' }, e);
        }
      } else if (L.k === 'mem' && L.ptr) {
        ptr = this.memberPtr(st, L.ptr, e);
      }
      return { k: 'mem', key, ptr, type: e.ctype, node: e, parent: L, dot: true };
    }
    case 'CastExpr':
      if (e.arg) return this.lval(st, e.arg);
      break;
    case 'AssignExpr': {
      this.eval(st, e);
      return this.lval(st, e.left);
    }
    case 'UnaryExpr_': break;
    default: break;
  }
  this.eval(st, e);
  return { k: 'unknown', type: e.ctype };
};

// Pointer to a member: arrays get their own sub-object with the field size,
// scalars point into the parent object.
P.memberPtr = function memberPtr(st, pv, e) {
  if (!pv || !pv.pt || pv.pt.length !== 1) return pv ? { nul: pv.nul, nev: pv.nev, nret: pv.nret, par: pv.par, dref: pv.dref } : null;
  const t = pv.pt[0];
  const ft = this.T(e.ctype);
  const r = { nul: pv.nul, nev: pv.nev, nret: pv.nret, par: pv.par, dref: pv.dref };
  if (ft.kind === 'array') {
    const o = this.subObj(st, t.o, e.member, e.ctype);
    r.pt = [{ o: o.id, off: I.konst(0) }];
    r.sub = true;
  } else {
    let off = null;
    const rec = this.T(e.object.ctype && (e.arrow ? T.pointee(this.T(e.object.ctype)) : e.object.ctype));
    if (rec && T.isRecord(rec)) {
      try {
        const lay = T.layout(rec, this.target);
        const f = lay && lay.fields.find((x) => x.name === e.member);
        if (f && Number.isFinite(f.offset)) off = I.konst(f.offset);
      } catch { off = null; }
    }
    r.pt = [{ o: t.o, off: off && t.off ? I.add(t.off, off) : I.make(0, I.INF) }];
    r.field = e.member;
  }
  return r;
};

P.ptrAdd = function ptrAdd(base, idx, esz, idxType) {
  if (!base) return {};
  const r = { nul: base.nul, nev: base.nev, nret: base.nret, par: base.par, dref: base.dref, nn: base.nn };
  if (base.nul === 'null' && (!idx.iv || !I.isConst(idx.iv) || idx.iv.lo !== 0)) { r.nul = 'null'; }
  if (!base.pt) return r;
  let iv = idx.iv || this.rangeIv(idxType);
  const scaled = esz === 1 ? iv : I.mul(iv, I.konst(esz));
  r.pt = base.pt.map((t) => {
    const n = { o: t.o, off: I.add(t.off, scaled) || I.TOP };
    if (esz === 1 && I.isConst(t.off)) {
      if (idx.sym && !t.sym) n.sym = { s: idx.sym.s, d: idx.sym.d + t.off.lo };
      if (idx.ub && !t.ub) n.ub = { s: idx.ub.s, d: idx.ub.d + t.off.lo };
    }
    return n;
  });
  if (idx.tnt) r.itnt = idx.tnt;
  if (idx.neg) r.ineg = idx.neg;
  return r;
};

// ---------------------------------------------------------------- load / store

P.load = function load(st, L, node) {
  if (L.k === 'var') {
    let v = st.get(L.key);
    const sym = L.sym;
    if (v === undefined) {
      v = sym && sym.storage !== 'automatic' ? this.initialValue(sym) : this.typeVal(L.type);
      if (sym && sym.storage === 'static') this.recordAccess(st, sym, node, false);
      return v;
    }
    if (sym && sym.storage === 'static') this.recordAccess(st, sym, node, false);
    if (sym && this.T(sym.type).volatile) return this.typeVal(L.type);
    if (v.un) {
      if (!v.un.may && !this.quiet) {
        this.report('UNINIT', node, {
          en: `Using uninitialized value ${sym ? sym.name : this.src(node)}.`,
          ko: `초기화하지 않은 값 ${sym ? sym.name : this.src(node)}을(를) 사용합니다.`,
        }, [v.un.ev, st.trail], { tag: 'uninit_use' });
        if (!this.quiet) { const nv = { ...v }; delete nv.un; st.set(L.key, nv); v = nv; }
      }
      const r = { ...v };
      delete r.un;
      if (!r.iv && this.isIntT(L.type)) r.iv = this.rangeIv(L.type);
      return r;
    }
    return v;
  }
  if (L.k === 'mem') {
    if (!this.access(st, L, 'read', node)) return {};
    if (L.key) {
      const v = st.get(L.key);
      if (v !== undefined) return v;
    }
    const p = L.ptr;
    if (p && p.pt && p.pt.length === 1) {
      const t = p.pt[0];
      const o = st.obj(t.o);
      if (o && o.vsym && o.scalar && I.isConst(t.off) && t.off.lo === 0) {
        const v = st.get(`v${o.vsym}`);
        if (v) return v.un ? this.typeVal(L.type) : v;
      }
      if (o) {
        if (o.init === 'no' && !this.quiet && !L.dot) {
          this.report('UNINIT', node, {
            en: `Using uninitialized value: ${o.name} is read before any element is written.`,
            ko: `초기화하지 않은 값 사용: ${o.name}의 원소를 쓰기 전에 읽습니다.`,
          }, [st.trail], { tag: 'uninit_use' });
        } else if (o.init === 'no' && !this.quiet && L.dot) {
          this.report('UNINIT', node, {
            en: `Using uninitialized value ${this.src(node)}: field ${L.node.member} was never assigned.`,
            ko: `초기화하지 않은 값 ${this.src(node)} 사용: ${L.node.member} 필드에 값을 넣은 적이 없습니다.`,
          }, [st.trail], { tag: 'uninit_use' });
        }
        if (o.kind === 'argv') return { pt: [{ o: 'ARGVS', off: I.konst(0) }], ...this.argvString(st) };
        const r = this.typeVal(L.type);
        if (o.tnt) r.tnt = o.tnt;
        if (T.isCharType(this.T(L.type)) && o.term === 'yes' && o.slen && I.isConst(o.slen) && I.isConst(t.off) && t.off.lo === o.slen.lo) r.iv = I.konst(0);
        return r;
      }
    }
    const r = this.typeVal(L.type);
    if (p && p.pt) for (const t of p.pt) { const o = st.obj(t.o); if (o && o.tnt) r.tnt = o.tnt; }
    return r;
  }
  return this.typeVal(L.type);
};

P.argvString = function argvString(st) {
  if (!st.obj('ARGVS')) {
    st.addObj({ id: 'ARGVS', kind: 'argv', name: 'argv[]', size: null, init: 'yes', term: 'yes', tnt: [this.ev(this.fn, 'tainted_source', 'Command line arguments (argv) are untrusted.', '명령줄 인자(argv)는 신뢰할 수 없습니다.')] });
  }
  return {};
};

P.convert = function convert(v, toT, fromT, node) {
  const to = this.T(toT);
  if (!v) return this.typeVal(to);
  if (T.isInteger(to)) {
    if (to.name === 'bool') {
      const tr = this.truth(v, fromT);
      return { iv: tr === null ? I.make(0, 1) : I.konst(tr ? 1 : 0), tnt: v.tnt };
    }
    if (v.pt || v.nul) {
      if (v.nul === 'null' && !v.pt) return { iv: I.konst(0) };
      const r = this.typeVal(to);
      if (v.tnt) r.tnt = v.tnt;
      return r;
    }
    const range = this.range(to);
    const iv = v.iv || this.rangeIv(fromT && T.isInteger(this.T(fromT)) ? fromT : to);
    const f = I.fit(iv, range);
    if (f.overflow === 'none') return v.iv === f.iv ? v : { ...v, iv: f.iv };
    const r = { iv: f.iv };
    for (const k of ['tnt', 'neg', 'rid', 'lck']) if (v[k]) r[k] = v[k];
    if (range && range.unsigned && I.finite(iv) && iv.lo < 0 && v.neg) r.neg = v.neg;
    if (range && range.unsigned && iv.lo < 0 && I.finite(iv) && !v.tnt && !v.neg && (iv.hi < 0 || iv.tl)) {
      r.wrap = { ev: this.ev(node, 'negative_to_unsigned', `Converting a value that can be negative (${I.show(iv)}) to unsigned type.`, `음수일 수 있는 값(${I.show(iv)})을 부호 없는 타입으로 변환합니다.`), definite: iv.hi < 0 || !!iv.tl };
    }
    if (v.wrap) r.wrap = v.wrap;
    return r;
  }
  if (to.kind === 'pointer') {
    if (v.pt || v.nul) return v;
    if (v.iv && I.isConst(v.iv) && v.iv.lo === 0) return { nul: 'null', iv: I.konst(0), nev: v.nev };
    if (v.fn) return v;
    return v.tnt ? { tnt: v.tnt } : {};
  }
  if (v.tnt) return { tnt: v.tnt };
  return v.pt || v.nul ? v : {};
};

P.store = function store(st, L, v, node, rhsNode) {
  if (L.k === 'var') {
    const sym = L.sym;
    let nv = this.convert(v, L.type, rhsNode && rhsNode.ctype, node);
    if (nv.un) { nv = { ...nv }; delete nv.un; }
    if (nv.nul === 'null' && !nv.pt && sym && this.isPtrT(L.type)) {
      const isLit = rhsNode && this.isNullLiteral(rhsNode);
      if (isLit || !nv.nev) nv = { ...nv, nev: [this.ev(node, 'assign_zero', `Assigning: ${sym.name} = NULL.`, `대입: ${sym.name} = NULL.`)] };
      else nv = { ...nv, nev: [...nv.nev.slice(-3), this.ev(node, 'assign', `Assigning: ${sym.name} = ${this.src(rhsNode, 30)} (null).`, `대입: ${sym.name} = ${this.src(rhsNode, 30)} (널).`)] };
    }
    if (nv.par !== undefined && sym && this.params.get(sym.id) !== nv.par) { nv = { ...nv }; delete nv.par; }
    if (nv.par !== undefined && sym && this.params.get(sym.id) === nv.par && v !== st.get(L.key)) { /* same param re-assigned with its own value */ }
    this.overwriteCheck(st, L.key, nv, node);
    st.set(L.key, nv);
    this.killDeps(st, L.key);
    if (sym && sym.storage === 'static') {
      this.writesGlobals = true;
      this.recordAccess(st, sym, node, true);
      this.escapeValue(st, nv);
    }
    if (sym) {
      const o = st.obj(this.varObjId(sym));
      if (o && o.init === 'no') st.mut(o.id).init = 'yes';
    }
    return;
  }
  if (L.k === 'mem') {
    if (!this.access(st, L, 'write', node)) return;
    const nv = this.convert(v, L.type, rhsNode && rhsNode.ctype, node);
    if (L.key) {
      st.set(L.key, nv);
      this.killDeps(st, L.key);
      if (L.key.includes('->')) {
        const field = L.key.slice(L.key.lastIndexOf('->'));
        for (const k of [...st.env.keys()]) if (k !== L.key && k.endsWith(field)) st.env.delete(k);
      } else if (L.key.startsWith('*')) {
        for (const k of [...st.env.keys()]) if (k !== L.key && k.startsWith('*')) st.env.delete(k);
      }
    }
    let local = false;
    if (L.thisField) { this.writesMem = true; this.escapeValue(st, nv); return; }
    const p = L.ptr;
    if (p && p.pt) {
      for (const t of p.pt) {
        const o = st.obj(t.o);
        if (!o) continue;
        const m = st.mut(t.o);
        if (L.dot) { if (m.init === 'no') m.init = 'part'; } else m.init = 'yes';
        if (m.parent) { const pm = st.mut(m.parent); if (pm && pm.init === 'no') pm.init = 'part'; }
        if (nv.tnt) m.tnt = nv.tnt;
        if (o.kind === 'stack' && o.fnKey === this.key) local = true;
        if (o.vsym && o.scalar && p.pt.length === 1 && I.isConst(t.off) && t.off.lo === 0) {
          st.set(`v${o.vsym}`, nv);
          this.killDeps(st, `v${o.vsym}`);
        } else if (o.vsym && o.scalar) {
          const old = st.get(`v${o.vsym}`);
          st.set(`v${o.vsym}`, old ? vJoin(old, nv) : nv);
        }
        if (T.isCharType(this.T(L.type)) && !L.dot) {
          if (nv.iv && I.isConst(nv.iv) && nv.iv.lo === 0) {
            if (I.isConst(t.off)) {
              const pos = t.off.lo / (o.esz || 1);
              m.term = 'yes';
              m.slen = m.slen && m.term === 'yes' && m.slen.hi <= pos ? m.slen : I.make(0, pos);
            } else if (p.pt.length === 1 && t.sym && o.ssym && t.sym.s === o.ssym.s && t.sym.d === o.ssym.d - 1) {
              m.term = 'yes';
            } else if (p.pt.length === 1 && o.size && I.finite(t.off) && o.size.lo > 0 && t.off.hi === o.size.lo - 1) {
              m.term = 'yes';
            } else if (m.term === 'no') {
              m.term = undefined;
            }
          } else if (I.isConst(t.off) && m.slen && I.isConst(m.slen) && t.off.lo === m.slen.lo) {
            m.term = undefined; m.slen = undefined;
          }
        }
        if (!(o.kind === 'stack' && o.fnKey === this.key)) this.writesMem = true;
        if (o.kind === 'param') this.writesMem = true;
      }
    } else this.writesMem = true;
    if (!local) this.escapeValue(st, nv);
    return;
  }
  if (L.ref) { this.killAddrTaken(st); this.escapeValue(st, v); return; }
  this.escapeValue(st, v);
};

P.isNullLiteral = function isNullLiteral(e) {
  e = skip(e);
  if (!e) return false;
  if (e.type === 'NullptrLiteral') return true;
  if (e.type === 'IntegerLiteral' && Number(e.value) === 0) return true;
  if (e.type === 'CastExpr' && e.arg) return this.isNullLiteral(e.arg);
  return false;
};

// Heap objects reachable from the value are now owned elsewhere.
P.escapeValue = function escapeValue(st, v) {
  if (!v) return;
  if (v.pt) for (const t of v.pt) {
    const o = st.obj(t.o);
    if (o && (o.ak || o.kind === 'param') && !o.esc) st.mut(t.o).esc = true;
  }
  if (v.rid) { const o = st.obj(v.rid); if (o && !o.esc) st.mut(v.rid).esc = true; }
};

// Assigning over the last pointer to a live allocation leaks it.
P.overwriteCheck = function overwriteCheck(st, key, nv, node) {
  const pend = this.pendingRealloc;
  this.pendingRealloc = null;
  const old = st.get(key);
  if (!old) return;
  if (pend && old.pt && old.pt.length === 1 && old.pt[0].o === pend.id && nv.pt && nv.pt.length === 1 && nv.pt[0].o === pend.id
    && !this.isReferenced(st, pend.id, key)) {
    const m = st.mut(pend.id);
    if (m) m.multi = false;
    if (this.reporting) this.leakReport(st, pend.old, node, key, true);
    return;
  }
  if (!this.reporting) return;
  const ids = [];
  if (old.pt) for (const t of old.pt) ids.push(t.o);
  if (old.rid) ids.push(old.rid);
  for (const id of ids) {
    if ((nv.pt && nv.pt.some((t) => t.o === id)) || nv.rid === id || nv.reall === id) continue;
    const o = st.obj(id);
    if (!o || !o.ak || o.st !== 'live' || o.esc || o.multi) continue;
    if (old.pt && old.pt.length > 1) continue;
    if (this.isReferenced(st, id, key)) continue;
    if (old.nul === 'maybe' && !old.nret && !old.rid && !old.oom) continue;
    this.leakReport(st, o, node, key, true);
  }
};

// ---------------------------------------------------------------- access checks

P.access = function access(st, L, mode, node) {
  if (L.k !== 'mem' || !L.ptr) return true;
  const bytes = L.esz || this.sizeOf(L.type) || 1;
  return this.derefCheck(st, L.ptr, node, mode, bytes, L);
};

P.ptrName = function ptrName(L, node) {
  if (L && L.baseNode) { const b = skip(L.baseNode); return this.src(b && b.type === 'AssignExpr' ? b.left : L.baseNode, 40); }
  return this.src(node, 40);
};

// Validate a dereference of pointer value pv. Returns false when the path ends.
P.derefCheck = function derefCheck(st, pv, node, mode, bytes, L) {
  if (!pv) return true;
  const name = this.ptrName(L, node);
  if (pv.nul === 'null' && !pv.pt) {
    this.report('FORWARD_NULL', node, {
      en: `Dereferencing null pointer ${name}.`, ko: `널 포인터 ${name}을(를) 역참조합니다.`,
    }, [pv.nev, st.trail], { tag: 'var_deref_op' });
    st.dead = 'soft';
    return false;
  }
  if (pv.nul === 'maybe' || pv.nul === undefined) {
    if (pv.nul === 'maybe' && pv.nret && !this.quiet && this.E.nullRetOk(pv.nret)) {
      this.report('NULL_RETURNS', node, {
        en: `Dereferencing ${name}, which is null when ${pv.nret.fn} fails.`,
        ko: `${pv.nret.fn}이(가) 실패하면 널인 ${name}을(를) 역참조합니다.`,
      }, [pv.nret.ev, st.trail], { tag: 'dereference' });
    } else if (pv.nul === 'maybe' && pv.nev && !this.quiet) {
      this.report('FORWARD_NULL', node, {
        en: `Dereferencing ${name}, which may be null.`, ko: `널일 수 있는 ${name}을(를) 역참조합니다.`,
      }, [pv.nev, st.trail], { tag: 'var_deref_op', confidence: 'possible' });
    }
    if (L && L.baseKey && !this.quiet) {
      const cur = st.get(L.baseKey);
      if (cur && (cur.nul === undefined || cur.nul === 'maybe') && (cur.pt || cur.par !== undefined || cur.nul === 'maybe' || cur.nret)) {
        const nv = { ...cur, nul: 'non', dref: cur.dref || this.ev(node, 'deref', `Dereferencing ${name}.`, `${name}을(를) 역참조합니다.`) };
        delete nv.nret; delete nv.nev;
        st.set(L.baseKey, nv);
      } else if (!cur && L.baseKey) {
        st.set(L.baseKey, { nul: 'non', dref: this.ev(node, 'deref', `Dereferencing ${name}.`, `${name}을(를) 역참조합니다.`) });
      }
    }
    if (pv.par !== undefined && pv.nul === undefined && !this.quiet) {
      st.dp.add(pv.par);
      if (!this.derefEv.has(pv.par)) this.derefEv.set(pv.par, this.ev(node, 'deref_parm', `${this.fn.name} dereferences ${name}.`, `${this.fn.name}이(가) ${name}을(를) 역참조합니다.`));
    }
  }
  if (!pv.pt) return true;
  for (const t of pv.pt) {
    const o = st.obj(t.o);
    if (!o) continue;
    if (o.st === 'freed' && pv.pt.length === 1) {
      this.report('USE_AFTER_FREE', node, {
        en: `Using ${name} after it was released.`, ko: `해제한 뒤에 ${name}을(를) 사용합니다.`,
      }, [o.aev, o.fev, st.trail], { tag: 'use_after_free' });
      continue;
    }
    if (pv.pt.length === 1) this.boundsCheck(st, o, t, bytes, node, mode, L, pv);
  }
  return true;
};

P.boundsCheck = function boundsCheck(st, o, t, bytes, node, mode, L, pv) {
  if (this.quiet || !this.reporting) return;
  const off = t.off;
  if (!off) return;
  const esz = (L && L.esz) || o.esz || 1;
  const idxV = L && L.idx;
  const idxTaint = (idxV && idxV.tnt) || pv.itnt;
  const idxNeg = (idxV && idxV.neg) || pv.ineg;
  const what = mode === 'write' ? { en: 'writing', ko: '쓰기' } : { en: 'reading', ko: '읽기' };
  const idxText = L && L.idxNode ? this.src(L.idxNode, 30) : null;
  if (idxNeg && off.lo < 0) {
    this.report('NEGATIVE_RETURNS', node, {
      en: `${idxText || 'The index'} is passed as an index to ${o.name} but may be negative (returned by ${idxNeg.fn}).`,
      ko: `${idxText || '인덱스'}가 ${o.name}의 인덱스로 쓰이는데 음수(${idxNeg.fn}의 반환값)일 수 있습니다.`,
    }, [idxNeg.ev, st.trail], { tag: 'negative_returns' });
    return;
  }
  if (idxTaint && o.size) {
    const bounded = off.lo >= 0 && Number.isFinite(off.hi) && off.hi + bytes <= o.size.lo;
    if (!bounded) {
      this.report('TAINTED_SCALAR', node, {
        en: `Using tainted value ${idxText || ''} as an index into ${o.name} without checking its bounds.`.replace('  ', ' '),
        ko: `오염된 값 ${idxText || ''}을(를) 범위 확인 없이 ${o.name}의 인덱스로 씁니다.`.replace('  ', ' '),
      }, [idxTaint, st.trail], { tag: 'tainted_data' });
      return;
    }
  }
  if (idxTaint && !o.size) return;
  let definite = false, possible = false, at = null;
  if (o.size) {
    const size = o.size;
    if (Number.isFinite(off.lo) && off.lo + bytes > size.hi) { definite = true; at = off.lo; }
    else if (off.th && off.hi + bytes > size.hi) { definite = true; at = off.hi; }
    else if (off.hi < 0 && Number.isFinite(off.hi)) { definite = true; at = off.hi; }
    else if (off.tl && off.lo < 0) { definite = true; at = off.lo; }
    else if (this.isTightBounded(off) && !(idxV && idxV.iv && idxV.iv.bits) && off.hi + bytes > size.lo && !idxTaint && Number.isFinite(size.lo) && (I.isConst(size) || size.tl)) { possible = true; at = off.hi; }
    else if (I.finite(off) && off.lo < 0 && off.tl && off.lo > -1048576 && off.hi - off.lo < 1048576) { possible = true; at = off.lo; }
  }
  if (!definite && o.ssym) {
    if (t.sym && t.sym.s === o.ssym.s && t.sym.d + bytes > o.ssym.d) { definite = true; at = null; }
    else if (t.ub && t.ub.s === o.ssym.s && t.ub.d + bytes > o.ssym.d) { definite = true; at = null; }
    if (definite) possible = false;
  }
  if (!definite && !possible) return;
  const sizeText = o.size ? (I.isConst(o.size) ? `${o.size.lo} bytes` : `${I.show(o.size)} bytes`) : 'its allocated size';
  const sizeKo = o.size ? (I.isConst(o.size) ? `${o.size.lo}바이트` : `${I.show(o.size)}바이트`) : '할당 크기';
  const atText = at !== null ? ` at byte offset ${at}` : ' past its end';
  const atKo = at !== null ? ` 바이트 오프셋 ${at}에서` : ' 끝을 넘어';
  const using = idxText ? ` using index ${idxText}${idxV && idxV.iv ? ` (which evaluates to ${I.show(at !== null && esz ? I.konst(Math.floor(at / esz)) : idxV.iv)})` : ''}` : '';
  const usingKo = idxText ? ` 인덱스 ${idxText}${idxV && idxV.iv ? `(값 ${I.show(at !== null && esz ? I.konst(Math.floor(at / esz)) : idxV.iv)})` : ''}로` : '';
  const evs = [o.aev, st.trail];
  if (idxV && idxV.tev) evs.push(idxV.tev);
  this.report('OVERRUN', node, {
    en: `Overrunning ${o.name} of ${sizeText} by ${what.en}${atText}${using}.`,
    ko: `${sizeKo}인 ${o.name}을(를)${atKo}${usingKo} ${what.ko}하여 범위를 넘습니다.`,
  }, evs, { tag: 'overrun', confidence: definite ? 'definite' : 'possible' });
};

// ---------------------------------------------------------------- unary / binary

P.evalCast = function evalCast(st, e) {
  const arg = e.arg || (e.args && e.args[0]);
  if (e.args && e.args.length !== 1) { for (const a of e.args || []) this.eval(st, a); return this.typeVal(e.ctype); }
  if (!arg) return this.typeVal(e.ctype);
  if (arg.type === 'InitList') { this.eval(st, arg); return this.typeVal(e.ctype); }
  const v = this.eval(st, arg);
  const to = this.T(e.ctype);
  if (to.kind === 'void') return {};
  return this.convert(v, e.ctype, arg.ctype, e);
};

P.intOp = function intOp(op, a, b) {
  switch (op) {
    case '+': return I.add(a, b);
    case '-': return I.sub(a, b);
    case '*': return I.mul(a, b);
    case '/': return I.div(a, b);
    case '%': return I.mod(a, b);
    case '<<': return I.shl(a, b);
    case '>>': return I.shr(a, b);
    case '&': return I.bitAnd(a, b);
    case '|': return I.bitOr(a, b);
    case '^': return I.bitXor(a, b);
    default: return I.TOP;
  }
};

P.evalUnary = function evalUnary(st, e) {
  switch (e.op) {
    case '&': {
      const a = skip(e.arg);
      if (a && a.type === 'Identifier' && a.symbol && a.symbol.kind === 'function') return { fn: a.symbol.name, nul: 'non', nn: 'addr' };
      if (a && a.type === 'Identifier' && a.symbol && (a.symbol.kind === 'variable' || a.symbol.kind === 'parameter')) {
        if (isRefType(a.symbol.type)) return { nul: 'non', nn: 'addr' };
        const o = this.varObj(st, a.symbol);
        return { pt: [{ o: o.id, off: I.konst(0) }], nul: 'non', nn: 'addr' };
      }
      if (a && a.type === 'UnaryExpr' && a.op === '*') return this.eval(st, a.arg);
      const L = this.lval(st, a);
      if (L.k === 'mem' && L.ptr) {
        if (L.arrowOf && L.arrowOf.nul === 'null' && !L.arrowOf.pt) return { nul: 'non' };
        const r = { ...L.ptr };
        delete r.nret;
        if (L.ptr.nul !== 'null') r.nul = 'non';
        r.nn = 'addr';
        return r;
      }
      return { nul: 'non', nn: 'addr' };
    }
    case '*': {
      const L = this.lval(st, e);
      if (st.dead) return {};
      if (T.isArray(this.T(e.ctype)) || this.T(e.ctype).kind === 'function') return L.ptr || {};
      return this.load(st, L, e);
    }
    case '+': return this.eval(st, e.arg);
    case '-': {
      const v = this.eval(st, e.arg);
      if (!v.iv) return this.typeVal(e.ctype);
      return this.arith(st, e, '-', { iv: I.konst(0) }, v, e.ctype, true);
    }
    case '~': {
      const v = this.eval(st, e.arg);
      const iv = v.iv ? I.bitNot(v.iv) : null;
      const r = this.range(e.ctype);
      const out = { iv: iv ? I.fit(iv, r).iv : this.rangeIv(e.ctype) };
      if (v.tnt) out.tnt = v.tnt;
      return out;
    }
    case '!': {
      const v = this.eval(st, e.arg);
      const tr = this.truth(v, e.arg.ctype);
      return { iv: tr === null ? I.make(0, 1) : I.konst(tr ? 0 : 1) };
    }
    case '++': case '--': {
      const L = this.lval(st, e.arg);
      if (st.dead) return {};
      const old = this.load(st, L, e.arg);
      let nv;
      const t = this.T(e.arg.ctype);
      if (t.kind === 'pointer') {
        const esz = this.sizeOf(T.pointee(t)) || 1;
        nv = this.ptrAdd(old, { iv: I.konst(e.op === '++' ? 1 : -1) }, esz);
        if (old.nul === 'null') nv.nul = 'null';
      } else if (T.isInteger(t)) {
        nv = this.arith(st, e, e.op === '++' ? '+' : '-', old, { iv: I.konst(1) }, e.arg.ctype, false, true);
      } else nv = {};
      this.store(st, L, nv, e, null);
      return e.prefix ? nv : old;
    }
    default:
      this.eval(st, e.arg);
      return this.typeVal(e.ctype);
  }
};

// Integer arithmetic with overflow / wrap detection in type t.
P.arith = function arith(st, node, op, a, b, t, isNeg, isIncDec) {
  const ct = this.T(t);
  const range = this.range(ct);
  const ai = a.iv || this.rangeIv(ct), bi = b.iv || this.rangeIv(ct);
  if ((op === '/' || op === '%') && !isNeg) this.divCheck(st, node, b, bi);
  if (op === '<<' || op === '>>') this.shiftCheck(st, node, bi, ct);
  let m = this.intOp(op, ai, bi);
  if (!m) m = this.rangeIv(ct);
  const out = {};
  if (a.tnt || b.tnt) out.tnt = a.tnt || b.tnt;
  if (a.neg && (op === '+' || op === '-') && I.isConst(bi)) out.neg = a.neg;
  // symbolic offsets: x + c, x - c
  if ((op === '+' || op === '-') && I.isConst(bi) && a.sym) out.sym = { s: a.sym.s, d: a.sym.d + (op === '+' ? bi.lo : -bi.lo) };
  if (op === '+' && I.isConst(ai) && b.sym) out.sym = { s: b.sym.s, d: b.sym.d + ai.lo };
  if ((op === '+' || op === '-') && I.isConst(bi) && a.ub) out.ub = { s: a.ub.s, d: a.ub.d + (op === '+' ? bi.lo : -bi.lo) };
  if (a.slen && I.isConst(bi) && (op === '+' || op === '-')) out.slenD = { o: a.slen, d: op === '+' ? bi.lo : -bi.lo };
  if (!range) { out.iv = m; return out; }
  const f = I.fit(m, range);
  out.iv = f.iv;
  if (f.overflow !== 'none') {
    delete out.sym; delete out.ub;
    const boundedSide = (x) => I.finite(x) && x.lo > range.min && x.hi < range.max && (I.isConst(x) || (!!x.tl && !!x.th));
    const operandsBounded = boundedSide(ai) && (isIncDec || boundedSide(bi) || I.isConst(bi));
    const tight = (m.hi > range.max && m.th) || (m.lo < range.min && m.tl);
    if (!range.unsigned) {
      if (this.reporting && !this.quiet && !out.tnt) {
        const definite = f.overflow === 'full' || tight;
        if ((definite && (operandsBounded || I.isConst(ai) || f.overflow === 'full')) || (operandsBounded && !definite)) {
          if (operandsBounded || f.overflow === 'full' || (I.isConst(ai) && I.isConst(bi))) {
            this.report('INTEGER_OVERFLOW', node, {
              en: `Signed integer overflow: ${this.src(node, 40)} can reach ${I.show(m)}, outside the range of ${T.typeToString(ct)}.`,
              ko: `부호 있는 정수 오버플로: ${this.src(node, 40)}의 값이 ${I.show(m)}까지 되어 ${T.typeToString(ct)} 범위를 벗어납니다.`,
            }, [a.tev, b.tev, st.trail], { tag: 'overflow', confidence: definite ? 'definite' : 'possible' });
          }
        }
      }
    } else if (operandsBounded || (I.isConst(ai) && I.isConst(bi)) || f.overflow === 'full') {
      out.wrap = {
        ev: this.ev(node, 'overflow', `${this.src(node, 40)} wraps around: its mathematical value ${I.show(m)} does not fit in ${T.typeToString(ct)}.`, `${this.src(node, 40)}의 값 ${I.show(m)}이(가) ${T.typeToString(ct)}에 맞지 않아 한 바퀴 돕니다.`),
        definite: f.overflow === 'full' || tight,
      };
    }
  }
  if (a.wrap || b.wrap) out.wrap = out.wrap || a.wrap || b.wrap;
  return out;
};

P.divCheck = function divCheck(st, node, b, bi) {
  if (!this.reporting || this.quiet) return;
  const dname = node.right ? this.src(node.right, 30) : 'divisor';
  if (bi && I.isConst(bi) && bi.lo === 0) {
    this.report('DIVIDE_BY_ZERO', node, {
      en: `Dividing by ${dname}, which is zero.`, ko: `0인 ${dname}(으)로 나눕니다.`,
    }, [b.zev, st.trail], { tag: 'divide_by_zero' });
    return;
  }
  if (bi && I.contains(bi, 0) && I.finite(bi) && (bi.lo === 0 ? bi.tl : bi.hi === 0 ? bi.th : false) && !b.tnt) {
    this.report('DIVIDE_BY_ZERO', node, {
      en: `Dividing by ${dname}, which can be zero (${I.show(bi)}).`, ko: `0일 수 있는 ${dname}(${I.show(bi)})(으)로 나눕니다.`,
    }, [b.zev, st.trail], { tag: 'divide_by_zero', confidence: 'possible' });
    return;
  }
  if (b.par !== undefined && bi && bi.lo === this.rangeIv(node.right && node.right.ctype).lo && !this.quiet) {
    const list = this.paramPre.get(b.par) || [];
    if (!list.some((x) => x.kind === 'div')) list.push({ kind: 'div', ev: this.ev(node, 'divide', `${this.fn.name} divides by ${dname}.`, `${this.fn.name}이(가) ${dname}(으)로 나눕니다.`), uncond: this.uncond() });
    this.paramPre.set(b.par, list);
  }
};

P.uncond = function uncond() {
  const g = this.cfg;
  try { return g.postDominates(this.curBlock, g.entry); } catch { return false; }
};

P.shiftCheck = function shiftCheck(st, node, bi, ct) {
  if (!this.reporting || this.quiet || !bi) return;
  const lt = node.left ? T.integerPromote(this.T(node.left.ctype), this.target) : ct;
  const bits = (this.range(lt) || {}).bits;
  if (!bits) return;
  const amount = node.right ? this.src(node.right, 30) : 'amount';
  if (bi.lo >= bits || (bi.th && bi.hi >= bits && I.finite(bi))) {
    const at = bi.lo >= bits ? bi.lo : bi.hi;
    this.report('BAD_SHIFT', node, {
      en: `Shifting by ${amount} (${at}), which is not less than the ${bits}-bit width of ${T.typeToString(lt)}.`,
      ko: `${amount}(${at})만큼 시프트하는데, ${T.typeToString(lt)}의 ${bits}비트 폭 이상입니다.`,
    }, [st.trail], { tag: 'large_shift' });
  } else if (bi.hi < 0 || (bi.tl && bi.lo < 0)) {
    this.report('BAD_SHIFT', node, {
      en: `Shifting by a negative amount ${amount} (${bi.hi < 0 ? bi.hi : bi.lo}).`,
      ko: `음수 양 ${amount}(${bi.hi < 0 ? bi.hi : bi.lo})만큼 시프트합니다.`,
    }, [st.trail], { tag: 'negative_shift' });
  }
};

P.evalBinary = function evalBinary(st, e) {
  const op = e.op;
  if (op === '&&' || op === '||') return this.evalLogical(st, e);
  if (op === ',') { this.eval(st, e.left); return this.eval(st, e.right); }
  if (this.lang === 'cpp' && (!this.scalarE(e.left) || !this.scalarE(e.right))) return this.opaqueOp(st, [e.left, e.right], e);
  const a = this.eval(st, e.left);
  if (st.dead) return {};
  const b = this.eval(st, e.right);
  if (st.dead) return {};
  const lt = this.T(e.left.ctype), rt = this.T(e.right.ctype);
  if (CMP.has(op)) {
    const r = this.compare(op, a, b, lt, rt);
    return { iv: r === null ? I.make(0, 1) : I.konst(r ? 1 : 0) };
  }
  const lp = lt.kind === 'pointer' || lt.kind === 'array', rp = rt.kind === 'pointer' || rt.kind === 'array';
  if ((op === '+' || op === '-') && lp && !rp) {
    const esz = this.sizeOf(T.pointee(lt)) || 1;
    const idx = op === '+' ? b : { ...b, iv: b.iv ? I.neg(b.iv) : undefined, sym: undefined, ub: undefined };
    return this.ptrAdd(a, idx, esz, e.right.ctype);
  }
  if (op === '+' && rp && !lp) {
    const esz = this.sizeOf(T.pointee(rt)) || 1;
    return this.ptrAdd(b, a, esz, e.left.ctype);
  }
  if (op === '-' && lp && rp) {
    if (a.pt && b.pt && a.pt.length === 1 && b.pt.length === 1 && a.pt[0].o === b.pt[0].o) {
      const esz = this.sizeOf(T.pointee(lt)) || 1;
      const d = I.sub(a.pt[0].off, b.pt[0].off);
      return { iv: d && esz === 1 ? d : I.make(-I.INF, I.INF) };
    }
    return this.typeVal(e.ctype);
  }
  if (!T.isInteger(this.T(e.ctype))) return (a.tnt || b.tnt) ? { tnt: a.tnt || b.tnt } : {};
  const ct = e.ctype;
  const conv = (v, t) => (v.iv ? this.convert(v, ct, t, e) : v);
  const shift = op === '<<' || op === '>>';
  return this.arith(st, e, op, conv(a, e.left.ctype), shift ? b : conv(b, e.right.ctype), ct);
};

// Decide a comparison if the operands' abstract values allow it.
P.compare = function compare(op, a, b, lt, rt) {
  const lp = this.isPtrT(lt) || a.nul, rp = this.isPtrT(rt) || b.nul;
  if (lp || rp) {
    if (op !== '==' && op !== '!=') return null;
    const an = a.nul === 'null' && !a.pt, bn = b.nul === 'null' && !b.pt;
    let eq = null;
    if (an && bn) eq = true;
    else if (an && b.nul === 'non') eq = false;
    else if (bn && a.nul === 'non') eq = false;
    if (eq === null) return null;
    return op === '==' ? eq : !eq;
  }
  const x = a.iv, y = b.iv;
  if (!x || !y) return null;
  switch (op) {
    case '<': if (x.hi < y.lo) return true; if (x.lo >= y.hi) return false; return null;
    case '<=': if (x.hi <= y.lo) return true; if (x.lo > y.hi) return false; return null;
    case '>': if (x.lo > y.hi) return true; if (x.hi <= y.lo) return false; return null;
    case '>=': if (x.lo >= y.hi) return true; if (x.hi < y.lo) return false; return null;
    case '==': if (I.isConst(x) && I.isConst(y)) return x.lo === y.lo; if (!I.meet(x, y)) return false; return null;
    case '!=': if (I.isConst(x) && I.isConst(y)) return x.lo !== y.lo; if (!I.meet(x, y)) return true; return null;
    default: return null;
  }
};

P.evalLogical = function evalLogical(st, e) {
  const isAnd = e.op === '&&';
  this.eval(st, e.left);
  if (st.dead) return {};
  const sR = st.clone();
  const okR = this.assume(sR, e.left, isAnd) === 'ok';
  const sS = st.clone();
  const okS = this.assume(sS, e.left, !isAnd) === 'ok';
  let rv = null;
  if (okR) rv = this.eval(sR, e.right);
  const live = [];
  if (okR && !sR.dead) live.push(sR);
  if (okS) live.push(sS);
  if (!live.length) { st.dead = sR.dead || 'hard'; return {}; }
  const before = st.env;
  st.replaceWith(live.length === 1 ? live[0] : joinStates(live[0], live[1]));
  if (live.length === 2) {
    // A test in value context (a && b) does not make a pointer 'maybe null' afterwards.
    for (const [k, v] of st.env) {
      if (v.nul !== 'maybe') continue;
      const o = before.get(k);
      if (o && o.nul !== 'maybe' && o.nul !== 'null') st.env.set(k, o);
    }
    st.touch();
  }
  if (!okR) return { iv: I.konst(isAnd ? 0 : 1) };
  const tr = rv ? this.truth(rv, e.right.ctype) : null;
  if (!okS && tr !== null) return { iv: I.konst(tr ? 1 : 0) };
  return { iv: I.make(0, 1) };
};

P.evalCond = function evalCond(st, e) {
  this.eval(st, e.test);
  if (st.dead) return {};
  if (!e.consequent) {
    const v = this.peek(st, e.test);
    const sF = st.clone();
    const okF = this.assume(sF, e.test, false) === 'ok';
    if (!okF) return v;
    const fv = this.eval(sF, e.alternate);
    const sT = st.clone();
    const okT = this.assume(sT, e.test, true) === 'ok';
    if (!okT) { st.replaceWith(sF); return fv; }
    st.replaceWith(sF.dead ? sT : joinStates(sT, sF));
    return sF.dead ? v : vJoin(v, fv);
  }
  const sT = st.clone();
  const okT = this.assume(sT, e.test, true) === 'ok';
  const sF = st.clone();
  const okF = this.assume(sF, e.test, false) === 'ok';
  let tv = null, fv = null;
  if (okT) tv = this.eval(sT, e.consequent);
  if (okF) fv = this.eval(sF, e.alternate);
  const tLive = okT && !sT.dead, fLive = okF && !sF.dead;
  if (!tLive && !fLive) { st.dead = (okT && sT.dead) || (okF && sF.dead) || 'hard'; return {}; }
  if (tLive && !fLive) { st.replaceWith(sT); return tv; }
  if (fLive && !tLive) { st.replaceWith(sF); return fv; }
  st.replaceWith(joinStates(sT, sF));
  const t = this.T(e.ctype);
  const conv = (v, n) => (n && T.isInteger(t) ? this.convert(v, t, n.ctype, n) : v);
  return vJoin(conv(tv, e.consequent), conv(fv, e.alternate));
};

P.scalarE = function scalarE(e) {
  const x = skip(e);
  if (x && x.type === 'Identifier' && !x.symbol) return false;
  if (x && x.type === 'BinaryExpr' && !['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(x.op)) return this.scalarE(x.left) && this.scalarE(x.right);
  if (x && x.type === 'BinaryExpr') return this.scalarE(x.left) && this.scalarE(x.right);
  if (x && x.type === 'CallExpr') return this.scalarT(x.ctype) && !(x.ctype && T.canonical(x.ctype) && T.canonical(x.ctype).kind === 'unknown');
  return this.scalarT(x && x.ctype);
};

P.scalarT = function scalarT(t) {
  const c = this.T(t);
  return T.isArithmetic(c) || ['pointer', 'enum', 'array', 'nullptr', 'function'].includes(c.kind);
};

// Overloaded C++ operator: an unknown call on its operands.
P.opaqueOp = function opaqueOp(st, nodes, e) {
  const vals = [];
  for (const n of nodes) {
    if (!n) continue;
    if (this.isLvalueish(n)) this.markLvalueWritten(st, n);
    else vals.push(this.eval(st, n));
    if (st.dead) return {};
  }
  for (const v of vals) this.escapeValue(st, v);
  this.havocAll(st);
  this.writesMem = true;
  this.writesGlobals = true;
  return this.typeVal(e.ctype);
};

P.evalAssign = function evalAssign(st, e) {
  if (this.lang === 'cpp' && !this.scalarT(e.left.ctype)) return this.opaqueOp(st, [e.left, e.right], e);
  const L = this.lval(st, e.left);
  if (st.dead) return {};
  if (e.op === '=') {
    const v = this.eval(st, e.right);
    if (st.dead) return {};
    this.store(st, L, v, e, e.right);
    return L.k === 'var' ? (st.get(L.key) || v) : v;
  }
  const old = this.load(st, L, e.left);
  const rhs = this.eval(st, e.right);
  if (st.dead) return {};
  const op = e.op.slice(0, -1);
  const lt = this.T(e.left.ctype);
  let nv;
  if (lt.kind === 'pointer' && (op === '+' || op === '-')) {
    const esz = this.sizeOf(T.pointee(lt)) || 1;
    nv = this.ptrAdd(old, op === '+' ? rhs : { ...rhs, iv: rhs.iv ? I.neg(rhs.iv) : undefined }, esz, e.right.ctype);
  } else if (T.isInteger(lt)) {
    const ct = T.isInteger(this.T(e.right.ctype)) ? T.usualArithmetic(lt, this.T(e.right.ctype), this.target) : lt;
    const fake = { ...e, left: e.left, right: e.right };
    nv = this.arith(st, fake, op, this.convert(old, ct, e.left.ctype, e), this.convert(rhs, ct, e.right.ctype, e), ct);
  } else nv = {};
  this.store(st, L, nv, e, null);
  return nv;
};

P.evalNew = function evalNew(st, e) {
  for (const a of e.placement || []) this.eval(st, a);
  // `new Widget(parent)`: an object constructed with a pointer or reference to
  // another object usually registers itself there (Qt/GTK parent ownership)
  let parented = false;
  if (e.init) {
    const args = e.init.type === 'ParenListInit' ? e.init.args || [] : e.init.type === 'InitList' ? e.init.items || [] : [e.init];
    for (const a of args) {
      if (!a) continue;
      const v = this.eval(st, a);
      this.escapeValue(st, v);
      const at = a.ctype && T.canonical(a.ctype);
      const pointee = at && (at.kind === 'pointer' || at.kind === 'array') ? T.canonical(at.kind === 'pointer' ? at.to : at.of) : null;
      if (this.lang === 'cpp' && (this.isPtrT(a.ctype) || (at && at.kind === 'reference') || (a.type === 'ThisExpr')) && !this.isNullLiteral(a)
        && !(pointee && (T.isCharType(pointee) || T.isArithmetic(pointee))) && a.type !== 'StringLiteral') parented = true;
    }
  }
  if (e.placement && e.placement.length) return { nul: 'non' };
  const tt = this.T(e.typeName && e.typeName.ctype);
  let size = null;
  if (e.isArray) {
    const decl = e.typeName && e.typeName.declarator;
    const sizeExpr = decl && decl.type === 'ArrayDeclarator' ? decl.size : null;
    const esz = this.sizeOf(tt.kind === 'array' ? tt.of : tt) || 1;
    if (sizeExpr) {
      const n = this.eval(st, sizeExpr);
      this.sizeArgCheck(st, n, sizeExpr, e, 'new[]');
      size = n.iv ? { iv: I.mul(n.iv, I.konst(esz)), sym: esz === 1 ? n.sym : undefined } : null;
    } else if (tt.kind === 'array' && tt.size != null) size = { iv: I.konst(tt.size * esz) };
  } else {
    const s = this.sizeOf(tt);
    if (s != null) size = { iv: I.konst(s) };
  }
  const ak = e.isArray ? 'new[]' : 'new';
  const o = this.newHeap(st, e, ak, size, {
    aev: [this.ev(e, 'alloc_fn', `Storage is allocated by ${ak === 'new[]' ? 'new[]' : 'new'}.`, `${ak === 'new[]' ? 'new[]' : 'new'}(으)로 저장소를 할당합니다.`)],
  });
  o.esz = this.sizeOf(tt.kind === 'array' ? tt.of : tt) || 1;
  if (parented) o.esc = true;
  return { pt: [{ o: o.id, off: I.konst(0) }], nul: 'non', nn: 'alloc' };
};

// ---------------------------------------------------------------- peek / assume

// Linear form of a condition operand: e == key + delta, without side effects.
P.linForm = function linForm(st, e) {
  e = skip(e);
  if (!e) return null;
  if (e.type === 'CallExpr' && st.tmp && st.tmp.has(e)) return { key: null, tmp: e, delta: 0 };
  if (e.type === 'AssignExpr' && e.op === '=') { const k = this.keyOf(e.left); return k ? { key: k, delta: 0, node: e.left } : null; }
  if (e.type === 'UnaryExpr' && (e.op === '++' || e.op === '--')) {
    const k = this.keyOf(e.arg);
    if (!k) return null;
    const d = e.prefix ? 0 : (e.op === '++' ? -1 : 1);
    return { key: k, delta: d, node: e.arg };
  }
  if (e.type === 'BinaryExpr' && (e.op === '+' || e.op === '-')) {
    const c = this.constOf(e.right);
    if (c !== null && !this.isPtrT(e.left.ctype)) {
      const inner = this.linForm(st, e.left);
      if (inner) return { ...inner, delta: inner.delta + (e.op === '+' ? c : -c) };
    }
    return null;
  }
  const k = this.keyOf(e);
  if (k) return { key: k, delta: 0, node: e };
  return null;
};

P.peek = function peek(st, e) {
  e = skip(e);
  if (!e) return {};
  if (e.$v) return e.$v;
  const lf = this.linForm(st, e);
  if (lf) {
    let v;
    if (lf.tmp) v = st.tmp.get(lf.tmp) || {};
    else {
      v = st.get(lf.key);
      if (v === undefined) {
        this.quiet++;
        try { const s2 = st.clone(); v = this.eval(s2, lf.node || e); } finally { this.quiet--; }
      }
    }
    if (lf.delta && v.iv) return { ...v, iv: I.add(v.iv, I.konst(lf.delta)), sym: v.sym ? { s: v.sym.s, d: v.sym.d + lf.delta } : undefined, ub: undefined };
    return v;
  }
  if (e.type === 'CallExpr') return (st.tmp && st.tmp.get(e)) || this.typeVal(e.ctype);
  if (hasSideEffects(e)) return this.typeVal(e.ctype);
  this.quiet++;
  try {
    const s2 = st.clone();
    return this.eval(s2, e);
  } finally { this.quiet--; }
};

// Refine st with `e` being `truth`. Returns 'ok', 'hard' (infeasible) or
// 'soft' (infeasible only because of an assumption we do not want to report on).
P.assume = function assume(st, e, truth) {
  e = skip(e);
  if (!e) return 'ok';
  if (e.type === 'Declaration') {
    const d = (e.declarators || []).find((x) => x && x.type === 'VarDecl' && x.symbol);
    return d ? this.assume(st, d, truth) : 'ok';
  }
  if (e.type === 'VarDecl') {
    if (!e.symbol) return 'ok';
    const id = { type: 'Identifier', name: e.name, symbol: e.symbol, ctype: e.ctype || e.symbol.type, loc: e.nameLoc || e.loc };
    return this.assume(st, id, truth);
  }
  if (e.type === 'UnaryExpr' && e.op === '!') return this.assume(st, e.arg, !truth);
  if (e.type === 'BinaryExpr') {
    if (e.op === '&&' || e.op === '||') {
      const both = (e.op === '&&') === truth;
      if (both) {
        const r = this.assume(st, e.left, truth);
        if (r !== 'ok') return r;
        return this.assume(st, e.right, truth);
      }
      const s1 = st.clone();
      const r1 = this.assume(s1, e.left, truth);
      const s2 = st.clone();
      const r2 = this.assume(s2, e.right, truth);
      if (r1 !== 'ok' && r2 !== 'ok') return r1 === 'soft' || r2 === 'soft' ? 'soft' : 'hard';
      if (r1 !== 'ok') st.replaceWith(s2);
      else if (r2 !== 'ok') st.replaceWith(s1);
      return 'ok';
    }
    if (e.op === ',') return this.assume(st, e.right, truth);
    if (CMP.has(e.op)) return this.assumeCmp(st, truth ? e.op : NEGATE[e.op], e.left, e.right, e);
  }
  if (e.type === 'CastExpr' && e.arg && (this.isPtrT(e.ctype) || this.isIntT(e.ctype) || this.T(e.ctype).name === 'bool')) {
    return this.assume(st, e.arg, truth);
  }
  if (e.type === 'CallExpr') {
    const r = this.assumePred(st, e, truth);
    if (r !== 'ok') return r;
  }
  return this.assumeCmp(st, truth ? '!=' : '==', e, { $v: { iv: I.konst(0), nul: 'null' }, ctype: e.ctype, type: '$V' }, e);
};

P.pruneKind = function pruneKind(cond) {
  return this.isConstCond(cond) ? 'soft' : 'hard';
};

P.assumeCmp = function assumeCmp(st, op, l, r, cond) {
  const lv = this.peek(st, l), rv = this.peek(st, r);
  const lt = this.T(l.ctype), rt = this.T(r.ctype);
  const lp = this.isPtrT(lt) || (!!lv.pt && !lv.iv), rp = this.isPtrT(rt) || (!!rv.pt && !rv.iv);
  if (lp || rp) {
    if (op !== '==' && op !== '!=') return 'ok';
    const lNull = lv.nul === 'null' && !lv.pt, rNull = rv.nul === 'null' && !rv.pt;
    const lz = r.$v ? false : this.isNullLiteral(l), rz = r.$v ? true : this.isNullLiteral(r);
    if ((rNull || rz) && !(lNull || lz)) return this.refineNull(st, l, lv, op === '==', cond);
    if ((lNull || lz) && !(rNull || rz)) return this.refineNull(st, r, rv, op === '==', cond);
    if ((lNull || lz) && (rNull || rz)) return op === '==' ? 'ok' : this.pruneKind(cond);
    return 'ok';
  }
  if (!T.isInteger(lt) && !lv.iv) return 'ok';
  if (!T.isInteger(rt) && !rv.iv && !r.$v) return 'ok';
  let li = lv.iv || this.rangeIv(lt);
  let ri = rv.iv || this.rangeIv(rt);
  if (T.isInteger(lt) && T.isInteger(rt)) {
    const common = T.usualArithmetic(lt, rt, this.target);
    if (common && T.isUnsigned(common, this.target) && (li.lo < 0 || ri.lo < 0)) return 'ok';
  }
  let nl = li, nr = ri;
  const below = (x, c) => I.make(-I.INF, x, { th: c });
  const above = (x, c) => I.make(x, I.INF, { tl: c });
  switch (op) {
    case '<': nl = I.meet(li, below(ri.hi - 1, ri.th)); nr = I.meet(ri, above(li.lo + 1, li.tl)); break;
    case '<=': nl = I.meet(li, below(ri.hi, ri.th)); nr = I.meet(ri, above(li.lo, li.tl)); break;
    case '>': nl = I.meet(li, above(ri.lo + 1, ri.tl)); nr = I.meet(ri, below(li.hi - 1, li.th)); break;
    case '>=': nl = I.meet(li, above(ri.lo, ri.tl)); nr = I.meet(ri, below(li.hi, li.th)); break;
    case '==': nl = I.meet(li, ri); nr = nl; break;
    case '!=':
      if (I.isConst(ri)) nl = exclude(li, ri.lo);
      if (I.isConst(li)) nr = exclude(ri, li.lo);
      if (I.isConst(li) && I.isConst(ri) && li.lo === ri.lo) { nl = null; }
      break;
    default: return 'ok';
  }
  // A cut by a constant bound makes the new bound tight.
  if (nl && (op === '<' || op === '<=') && I.isConst(ri) && li.hi > nl.hi) nl = { ...nl, th: true };
  if (nl && (op === '>' || op === '>=') && I.isConst(ri) && li.lo < nl.lo) nl = { ...nl, tl: true };
  if (nr && (op === '>' || op === '>=') && I.isConst(li) && ri.hi > nr.hi) nr = { ...nr, th: true };
  if (nr && (op === '<' || op === '<=') && I.isConst(li) && ri.lo < nr.lo) nr = { ...nr, tl: true };
  if (!nl || !nr) return this.pruneKind(cond);
  // symbolic relations
  if (lv.sym && rv.sym && lv.sym.s === rv.sym.s) {
    const d = lv.sym.d - rv.sym.d;
    const res = this.compare(op, { iv: I.konst(d) }, { iv: I.konst(0) });
    if (res === false) return this.pruneKind(cond);
  }
  let extraL = null;
  if (rv.sym && (op === '<' || op === '<=')) extraL = { ub: { s: rv.sym.s, d: rv.sym.d - (op === '<' ? 1 : 0) } };
  if (rv.sym && op === '==') extraL = { sym: rv.sym };
  let extraR = null;
  if (lv.sym && (op === '>' || op === '>=')) extraR = { ub: { s: lv.sym.s, d: lv.sym.d - (op === '>' ? 1 : 0) } };
  this.applyRefine(st, l, nl, lv, extraL);
  this.applyRefine(st, r, nr, rv, extraR);
  return 'ok';
};

function exclude(iv, c) {
  if (!iv) return null;
  if (I.isConst(iv) && iv.lo === c) return null;
  if (iv.lo === c) return I.make(c + 1, iv.hi, { th: iv.th, tl: iv.tl });
  if (iv.hi === c) return I.make(iv.lo, c - 1, { tl: iv.tl, th: iv.th });
  if (c === 0) return I.make(iv.lo, iv.hi, { nz: true, tl: iv.tl, th: iv.th });
  return iv;
}

P.applyRefine = function applyRefine(st, e, niv, old, extra) {
  if (!niv) return;
  const lf = this.linForm(st, e);
  if (!lf) return;
  const shifted = lf.delta ? I.sub(niv, I.konst(lf.delta)) : niv;
  let cur;
  if (lf.tmp) cur = st.tmp.get(lf.tmp) || {};
  else cur = st.get(lf.key);
  if (cur === undefined) {
    if (!lf.key) return;
    cur = this.peek(st, lf.node || e);
    if (lf.delta && cur.iv) cur = { ...cur, iv: I.sub(cur.iv, I.konst(lf.delta)) };
  }
  if (cur.un) return;
  const base = cur.iv || this.rangeIv(e.ctype);
  let iv = I.meet(base, shifted);
  if (!iv) return;
  const nv = { ...cur, iv };
  if (extra && extra.ub && !lf.delta) nv.ub = extra.ub;
  if (extra && extra.sym && !lf.delta && !nv.sym) nv.sym = extra.sym;
  if (nv.neg && iv.lo >= 0) delete nv.neg;
  if (nv.wrap && !I.equal(iv, base)) delete nv.wrap;
  this.sideRefine(st, nv, iv);
  if (lf.tmp) st.tmp.set(lf.tmp, nv);
  else st.set(lf.key, nv);
};

// Facts linked to an integer value: strlen of an object, a descriptor, a trylock result.
P.sideRefine = function sideRefine(st, v, iv) {
  if (v.slen) {
    const o = st.obj(v.slen);
    if (o) { const m = st.mut(v.slen); m.slen = m.slen ? (I.meet(m.slen, iv) || m.slen) : iv; }
  }
  if (v.rid) {
    const o = st.obj(v.rid);
    if (o && (iv.hi < 0 || (I.isConst(iv) && iv.lo >= 4294967295))) { const m = st.mut(v.rid); m.st = 'nulled'; }
    else if (o && iv.lo >= 0 && !o.valid) st.mut(v.rid).valid = true;
  }
  if (v.lck) {
    const succZero = v.lckSucc !== 'nonzero';
    const acquired = succZero ? (I.isConst(iv) && iv.lo === 0) : !I.contains(iv, 0);
    const failed = succZero ? !I.contains(iv, 0) : (I.isConst(iv) && iv.lo === 0);
    if (acquired) st.locks.set(v.lck, { h: 'held', ev: v.lckEv, here: true, node: v.lckNode });
    else if (failed) st.locks.delete(v.lck);
    st.touch();
  }
};

P.refineNull = function refineNull(st, e, v, isNull, cond) {
  const lf = this.linForm(st, e);
  const name = this.src(e, 40);
  if (isNull) {
    if (v.nul === 'non') return v.dref || v.nn !== 'check' ? 'soft' : this.pruneKind(cond);
    if (v.nn === 'addr' || v.nn === 'alloc') return 'soft';
    const nv = { nul: 'null', iv: I.konst(0), nev: [this.ev(cond, 'null_check', `Condition ${this.src(cond, 50)} implies that ${name} is null.`, `조건 ${this.src(cond, 50)}은(는) ${name}이(가) 널이라는 뜻입니다.`)] };
    if (v.par !== undefined) { nv.par = v.par; this.paramNullChecked.add(v.par); }
    if (v.oom) nv.oom = true;
    if (v.pt) for (const t of v.pt) {
      const o = st.obj(t.o);
      if (o && o.ak && o.st === 'live' && v.pt.length === 1) st.mut(t.o).st = 'nulled';
      if (o && o.kind === 'param') st.mut(t.o).nulledParam = true;
    }
    if (v.reall) { const o = st.obj(v.reall); if (o && o.st === 'freed') { const m = st.mut(v.reall); m.st = 'live'; m.fev = null; } }
    if (lf && lf.key && !lf.delta) { st.set(lf.key, nv); this.killDeps(st, lf.key); }
    else if (lf && lf.tmp) st.tmp.set(lf.tmp, nv);
    return 'ok';
  }
  if (v.nul === 'null' && !v.pt) return this.pruneKind(cond);
  if (v.par !== undefined && v.nul === undefined) this.paramNullChecked.add(v.par);
  const nv = { ...v, nul: 'non', nn: v.nn || 'check' };
  delete nv.nret; delete nv.nev;
  if (nv.iv && I.contains(nv.iv, 0)) nv.iv = exclude(nv.iv, 0) || nv.iv;
  if (lf && lf.key && !lf.delta) st.set(lf.key, nv);
  else if (lf && lf.tmp) st.tmp.set(lf.tmp, nv);
  return 'ok';
};

P.nullCheckOf = function nullCheckOf(e) {
  e = skip(e);
  if (!e) return null;
  if (e.type === 'UnaryExpr' && e.op === '!') return this.nullCheckOf(e.arg);
  if (e.type === 'BinaryExpr' && (e.op === '==' || e.op === '!=')) {
    if (this.isNullLiteral(e.right) && this.isPtrT(e.left.ctype)) return skip(e.left);
    if (this.isNullLiteral(e.left) && this.isPtrT(e.right.ctype)) return skip(e.right);
    return null;
  }
  if (this.isPtrT(e.ctype) && this.keyOf(e)) return e;
  return null;
};

// TAINTED_SCALAR as a loop bound: `i < n` with an unbounded tainted n.
P.loopBoundCheck = function loopBoundCheck(st, e) {
  const b = this.curBlock;
  if (!b || !b.loopHeader) return;
  const c = skip(e);
  if (!c || c.type !== 'BinaryExpr' || !['<', '<=', '>', '>=', '!='].includes(c.op)) return;
  for (const side of [c.right, c.left]) {
    const v = this.peek(st, side);
    if (!v.tnt) continue;
    const r = this.range(side.ctype);
    const iv = v.iv || I.TOP;
    const unbounded = !Number.isFinite(iv.hi) || (r && iv.hi >= r.max) || (r && !r.unsigned && iv.lo <= r.min);
    if (unbounded) {
      this.report('TAINTED_SCALAR', c, {
        en: `Using tainted value ${this.src(side, 30)} as a loop boundary without an upper bound check.`,
        ko: `오염된 값 ${this.src(side, 30)}을(를) 위쪽 경계 확인 없이 반복 경계로 씁니다.`,
      }, [v.tnt, st.trail], { tag: 'tainted_data' });
      return;
    }
  }
};

// ---------------------------------------------------------------- edges

P.edgeStates = function edgeStates(e, outs, check) {
  const kind = e.kind;
  if (kind === 'noreturn') return [];
  if (kind === 'true' || kind === 'false') {
    const res = [];
    const cond = e.cond || (e.from.terminator && e.from.terminator.cond);
    const stats = check ? this.statsOf(e) : null;
    for (const s of outs) {
      const r = s.clone();
      const out = this.assume(r, cond, kind === 'true');
      if (stats) { stats.arrive++; if (out === 'ok') stats.pass++; else stats.reasons.add(out); if (!stats.sample) stats.sample = s; }
      if (out !== 'ok') continue;
      if (!this.isConstCond(cond)) {
        r.pushTrail(this.ev(cond, 'condition', `Condition ${this.src(cond, 50)}, taking ${kind} branch.`, `조건 ${this.src(cond, 50)}, ${kind === 'true' ? '참' : '거짓'} 분기로 갑니다.`));
      }
      res.push(r);
    }
    return res;
  }
  if (kind === 'case' || kind === 'default') {
    const sw = e.from.terminator && e.from.terminator.cond;
    if (!sw) return outs;
    const res = [];
    const stats = check ? this.statsOf(e) : null;
    for (const s of outs) {
      const r = s.clone();
      let out = 'ok';
      if (kind === 'case' && e.constValue !== undefined && e.constValue !== null) {
        const lo = Number(e.constValue);
        const hi = e.high !== undefined && e.high !== null && e.node && e.node.constHigh !== undefined && e.node.constHigh !== null ? Number(e.node.constHigh) : lo;
        out = this.assumeCmp(r, '>=', sw, { $v: { iv: I.konst(lo) }, ctype: sw.ctype, type: '$V' }, sw);
        if (out === 'ok') out = this.assumeCmp(r, '<=', sw, { $v: { iv: I.konst(hi) }, ctype: sw.ctype, type: '$V' }, sw);
        if (out === 'ok') r.pushTrail(this.ev(e.node || sw, 'switch_case', `Switch case value ${lo}.`, `switch case 값 ${lo}.`));
      } else if (kind === 'default') {
        for (const s2 of e.from.succs) {
          if (s2.kind !== 'case' || s2.constValue === undefined || s2.constValue === null || (s2.high !== undefined && s2.high !== null)) continue;
          out = this.assumeCmp(r, '!=', sw, { $v: { iv: I.konst(Number(s2.constValue)) }, ctype: sw.ctype, type: '$V' }, sw);
          if (out !== 'ok') break;
        }
        if (out === 'ok') r.pushTrail(this.ev(sw, 'switch_default', 'Switch case default.', 'switch default로 갑니다.'));
      }
      if (stats) { stats.arrive++; if (out === 'ok') stats.pass++; else stats.reasons.add(out); }
      if (out === 'ok') res.push(r);
    }
    return res;
  }
  if (check) { const stats = this.statsOf(e); stats.arrive += outs.length; stats.pass += outs.length; }
  return outs;
};

P.statsOf = function statsOf(e) {
  let s = this.edgeStats.get(e);
  if (!s) { s = { arrive: 0, pass: 0, reasons: new Set(), sample: null }; this.edgeStats.set(e, s); }
  return s;
};

module.exports = P;
