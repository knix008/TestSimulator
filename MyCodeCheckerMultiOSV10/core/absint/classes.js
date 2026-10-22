'use strict';

// Project-wide C++ class index for the abstract interpreter: class hierarchy
// (merged across translation units by qualified name), virtual dispatch
// targets and the summary of a virtual call (the join of the summaries of
// every overrider found in the project).

const cf = require('../cfamily');
const I = require('./interval');

const T = cf.types;

function recName(t) {
  const c = t && T.canonical(t);
  if (!c || c.kind !== 'record') return null;
  return (c.decl && c.decl.symbol && c.decl.symbol.qname) || c.name || null;
}

class ClassIndex {
  constructor(project) {
    this.classes = new Map(); // qname -> { qname, bases: Set<qname>, derived: Set<qname>, methods: Map<name, [{sym, unit}]>, recs: [{type, unit}] }
    for (const unit of project.units || []) {
      if (unit.lang !== 'cpp') continue;
      for (const s of unit.symbols || []) {
        if (s.kind !== 'tag') continue;
        const t = T.canonical(s.type);
        if (!t || t.kind !== 'record' || !t.complete || !t.scope) continue;
        const q = s.qname || s.name;
        if (!q) continue;
        let c = this.classes.get(q);
        if (!c) { c = { qname: q, bases: new Set(), derived: new Set(), methods: new Map(), recs: [], dtor: null }; this.classes.set(q, c); }
        c.recs.push({ type: t, unit });
        for (const b of t.bases || []) {
          const bn = recName(b) || (b && b.name);
          if (bn) c.bases.add(bn);
        }
        for (const bs of (t.decl && t.decl.bases) || []) if (bs.qname) c.bases.add(bs.qname.replace(/^::/, ''));
        for (const m of t.scope.names.values()) {
          if (!m || m.kind !== 'function') continue;
          for (const x of [m, ...(m.overloads || [])]) {
            let list = c.methods.get(x.name);
            if (!list) c.methods.set(x.name, (list = []));
            if (!list.some((y) => y.sym === x)) list.push({ sym: x, unit });
            if (x.name && x.name.startsWith('~')) c.dtor = c.dtor || { sym: x, unit };
          }
        }
      }
    }
    // resolve base names written unqualified (`struct D : B` inside a namespace)
    const byShort = new Map();
    for (const q of this.classes.keys()) {
      const s = q.split('::').pop();
      if (!byShort.has(s)) byShort.set(s, []);
      byShort.get(s).push(q);
    }
    for (const c of this.classes.values()) {
      const fixed = new Set();
      for (const b of c.bases) {
        if (this.classes.has(b)) { fixed.add(b); continue; }
        const cand = byShort.get(b.split('::').pop()) || [];
        if (cand.length === 1) fixed.add(cand[0]); else fixed.add(b);
      }
      c.bases = fixed;
      for (const b of fixed) { const bc = this.classes.get(b); if (bc) bc.derived.add(c.qname); }
    }
    this.cache = new Map();
  }

  get(q) { return this.classes.get(q) || null; }

  // every class derived (transitively) from q
  derivedOf(q) {
    const out = new Set();
    const stack = [q];
    while (stack.length) {
      const c = this.classes.get(stack.pop());
      if (!c) continue;
      for (const d of c.derived) if (!out.has(d) && d !== q) { out.add(d); stack.push(d); }
    }
    return out;
  }

  basesOf(q) {
    const out = new Set();
    const stack = [q];
    while (stack.length) {
      const c = this.classes.get(stack.pop());
      if (!c) continue;
      for (const b of c.bases) if (!out.has(b) && b !== q) { out.add(b); stack.push(b); }
    }
    return out;
  }

  // Is the method virtual here or in a base (same name and signature)?
  isVirtual(sym) {
    if (!sym || sym.kind !== 'function' || !sym.member) return false;
    if (sym.isVirtual) return true;
    const owner = sym.record && recName(sym.record);
    if (!owner) return false;
    const sig = cf.paramSignature(sym.type);
    for (const b of this.basesOf(owner)) {
      const c = this.classes.get(b);
      for (const m of (c && c.methods.get(sym.name)) || []) if (m.sym.isVirtual && cf.paramSignature(m.sym.type) === sig) return true;
    }
    return false;
  }

  // Definitions a virtual call to sym may reach: sym itself (when it has a
  // body) and the overriders in classes derived from its class.
  overriders(sym) {
    if (this.cache.has(sym)) return this.cache.get(sym);
    const out = [];
    const owner = sym.record && recName(sym.record);
    const sig = cf.paramSignature(sym.type);
    const add = (s, unit) => {
      const def = (s.definition && s.definition.body) ? s.definition : null;
      if (s.pure && !def) return;
      if (!out.some((x) => x.sym === s)) out.push({ sym: s, unit, def });
    };
    add(sym, null);
    if (owner) {
      for (const d of this.derivedOf(owner)) {
        const c = this.classes.get(d);
        for (const m of (c && c.methods.get(sym.name)) || []) if (cf.paramSignature(m.sym.type) === sig) add(m.sym, m.unit);
      }
    }
    this.cache.set(sym, out);
    return out;
  }

  hasVirtualDtor(q, seen = new Set()) {
    if (seen.has(q)) return false;
    seen.add(q);
    const c = this.classes.get(q);
    if (!c) return true; // unknown base (missing header): assume it is fine
    if (c.dtor && (c.dtor.sym.isVirtual || (c.dtor.sym.decls || []).some((d) => d.specs && d.specs.functionSpecs.includes('virtual')))) return true;
    for (const b of c.bases) if (this.hasVirtualDtor(b, seen)) return true;
    return false;
  }
}

// Join the summaries of every possible target of a virtual call. Facts a
// caller reports on (dereferenced or freed parameters, sinks, divisors) must
// hold for every target; side effects hold if any target has them.
function joinSummaries(list, key) {
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const all = (f) => list.every(f);
  const inter = (field) => {
    const m = new Map();
    for (const [i, v] of list[0][field]) if (list.every((s) => s[field].has(i))) m.set(i, v);
    return m;
  };
  const S = {
    key, name: list[0].name, file: list[0].file, virtual: true,
    derefs: inter('derefs'), frees: inter('frees'), sinks: inter('sinks'), divs: inter('divs'),
    escapes: new Set(), locks: new Map(), acquires: new Set(), globalLocks: new Set(), blocks: null,
    writesMem: list.some((s) => s.writesMem), writesGlobals: list.some((s) => s.writesGlobals),
    noreturn: all((s) => s.noreturn),
    retNull: false, retNullEv: null, retNonNull: all((s) => s.retNonNull), retAlloc: null, retIv: null, retNeg: null, retTaint: null, retPar: undefined,
    throws: list.some((s) => s.throws),
  };
  for (const s of list) {
    for (const i of s.escapes) S.escapes.add(i);
    for (const [i] of s.frees) if (!S.frees.has(i)) S.escapes.add(i);
  }
  if (all((s) => s.retAlloc && s.retAlloc.ak === list[0].retAlloc.ak)) S.retAlloc = { ak: list[0].retAlloc.ak, ev: list[0].retAlloc.ev, size: null };
  if (all((s) => s.retIv)) S.retIv = list.reduce((a, s) => (a ? I.join(a, s.retIv) : s.retIv), null);
  if (all((s) => s.retPar !== undefined && s.retPar === list[0].retPar)) S.retPar = list[0].retPar;
  return S;
}

module.exports = { ClassIndex, joinSummaries, recName };
