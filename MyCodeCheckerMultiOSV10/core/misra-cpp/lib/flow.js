'use strict';

// Dataflow helpers shared by the MISRA C++ rules: CFGs for functions and
// lambdas, use/def extraction for local scalar objects, liveness and
// "maybe uninitialised" analyses.

const U = require('./util');
const { cf, T } = U;

const CFGS = new WeakMap();
function cfgOf(fn) {
  let g = CFGS.get(fn);
  if (!g) {
    try { g = fn.type === 'LambdaExpr' ? cf.buildCFG(fn) : cf.getCFG(fn); } catch (e) { g = null; }
    CFGS.set(fn, g);
  }
  return g;
}

// Function definitions and lambdas of a unit (user code).
function bodies(unit) {
  const x = U.ix(unit);
  return [...x.funcs.filter((f) => !f.isDefault && !f.isDeleted), ...x.get('LambdaExpr')];
}

// Symbols declared directly in the function (params + locals), not static.
function localsOf(fn) {
  return U.memo(fn, 'locals', () => {
    const out = new Set();
    for (const p of fn.params || []) if (p.symbol) out.add(p.symbol);
    cf.walk(fn.body, (n) => {
      if (n.type === 'LambdaExpr') return cf.walk.SKIP;
      if (n.type === 'RecordDecl' && n !== fn) return cf.walk.SKIP;
      if (n.type === 'VarDecl' && n.symbol && n.symbol.storage === 'automatic') out.add(n.symbol);
      return undefined;
    });
    return out;
  });
}

function isScalarLocal(sym) {
  const t = sym.type;
  if (!t) return false;
  const c = U.canon(t);
  if (c.kind === 'reference') return false;
  if (c.volatile) return false;
  return c.kind === 'int' || c.kind === 'float' || c.kind === 'pointer' || c.kind === 'enum';
}

// Symbols whose address escapes or are captured / bound to references in fn.
function escaped(fn) {
  return U.memo(fn, 'escaped', () => {
    const out = new Set();
    cf.walk(fn.body, (n) => {
      if (n.type === 'Identifier' && n.symbol) {
        const { p, key } = U.upParens(n);
        if (p && p.type === 'UnaryExpr' && p.op === '&') out.add(n.symbol);
        else if (p && p.type === 'VarDecl' && key === 'init' && p.ctype && p.ctype.kind === 'reference') out.add(n.symbol);
        else if (p && p.type === 'CallExpr' && key === 'args') {
          // argument bound to a reference parameter: possibly modified
          const ft = p.callee && p.callee.ctype ? U.canon(p.callee.ctype) : null;
          const idx = p.args.indexOf(U.upParens(n).c);
          const fp = ft && ft.kind === 'pointer' ? U.canon(ft.to) : ft;
          const pt = fp && fp.kind === 'function' ? fp.params[idx] : null;
          if (!pt || pt.kind === 'reference' || (U.canon(n.symbol.type).kind === 'array')) out.add(n.symbol);
        } else if (p && p.type === 'MemberExpr') out.add(n.symbol);
        else if (U.canon(n.symbol.type).kind === 'array') out.add(n.symbol);
      }
      if (n.type === 'LambdaExpr') {
        cf.walk(n.body, (m) => { if (m.type === 'Identifier' && m.symbol) out.add(m.symbol); });
        for (const c of n.captures || []) if (c.symbol) out.add(c.symbol);
        return cf.walk.SKIP;
      }
      if (n.type === 'AsmStmt') { for (const s of localsOf(fn)) out.add(s); }
      return undefined;
    });
    return out;
  });
}

// Uses and definitions of tracked symbols in one CFG element.
// defs: [{ sym, node, kind: 'init'|'assign'|'compound'|'incdec', used: bool }]
function useDef(node, tracked) {
  const uses = new Set();
  const defs = [];
  const visit = (n) => {
    cf.walk(n, (x) => {
      if (x.type === 'LambdaExpr') return cf.walk.SKIP;
      if (x.type === 'SizeofExpr' || x.type === 'AlignofExpr' || x.type === 'DecltypeType' || x.type === 'TypeName') return cf.walk.SKIP;
      if (x.type === 'Identifier' && x.symbol && tracked.has(x.symbol)) {
        const w = U.writeKind(x);
        if (w === 'assign') {
          const a = U.upParens(x).p;
          defs.push({ sym: x.symbol, node: a, kind: 'assign', used: !U.isDiscarded(a) });
        } else if (w === 'compound' || w === 'incdec') {
          const a = U.upParens(x).p;
          uses.add(x.symbol);
          defs.push({ sym: x.symbol, node: a, kind: w, used: !U.isDiscarded(a) });
        } else uses.add(x.symbol);
      }
      if (x.type === 'VarDecl' && x.symbol && tracked.has(x.symbol) && x.init) defs.push({ sym: x.symbol, node: x, kind: 'init', used: false });
      return undefined;
    });
  };
  visit(node);
  return { uses, defs };
}

// Dead stores in fn: [{ sym, node, kind }]
function deadStores(fn) {
  const g = cfgOf(fn);
  if (!g) return [];
  const esc = escaped(fn);
  const tracked = new Set([...localsOf(fn)].filter((s) => isScalarLocal(s) && !esc.has(s)));
  if (!tracked.size) return [];
  const cache = new Map();
  const ud = (n) => { let r = cache.get(n); if (!r) cache.set(n, (r = useDef(n, tracked))); return r; };
  const res = cf.solve(g, {
    direction: 'backward',
    boundary: new Set(),
    init: new Set(),
    transferElement(n, v) {
      const { uses, defs } = ud(n);
      if (!uses.size && !defs.length) return v;
      const out = new Set(v);
      for (const d of defs) if (d.kind === 'assign' || d.kind === 'init') out.delete(d.sym);
      for (const u of uses) out.add(u);
      return out;
    },
    join(a, b) { const u = new Set(a); for (const x of b) u.add(x); return u; },
    equal(a, b) { if (a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; },
  });
  const found = [];
  for (const b of g.reachable()) {
    let live = res.out.get(b) || new Set();
    const items = cf.cfg.blockItems(b);
    for (let i = items.length - 1; i >= 0; i--) {
      const n = items[i];
      const { uses, defs } = ud(n);
      for (const d of defs) {
        if (d.used) continue;
        if (!live.has(d.sym)) found.push(d);
      }
      if (uses.size || defs.length) {
        const nl = new Set(live);
        for (const d of defs) if (d.kind === 'assign' || d.kind === 'init') nl.delete(d.sym);
        for (const u of uses) nl.add(u);
        live = nl;
      }
    }
  }
  return found;
}

// Reads of possibly-unset local scalars: [{ sym, node }]
function uninitReads(fn) {
  const g = cfgOf(fn);
  if (!g) return [];
  const esc = escaped(fn);
  const cand = new Set();
  cf.walk(fn.body, (n) => {
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (n.type === 'VarDecl' && n.symbol && !n.init && n.symbol.storage === 'automatic' && isScalarLocal(n.symbol) && !esc.has(n.symbol)) {
      const p = U.parent(n);
      const pp = p && U.parent(p);
      if (pp && pp.type === 'RangeForStmt') return undefined;
      cand.add(n.symbol);
    }
    return undefined;
  });
  if (!cand.size) return [];
  const declOf = new Map();
  const cache = new Map();
  const ud = (n) => { let r = cache.get(n); if (!r) cache.set(n, (r = useDef(n, cand))); return r; };
  const declsIn = (n) => {
    const out = [];
    if (n.type === 'VarDecl' && cand.has(n.symbol)) out.push(n.symbol);
    return out;
  };
  void declOf;
  const res = cf.solve(g, {
    direction: 'forward',
    boundary: new Set(),
    init: new Set(),
    transferElement(n, v) {
      const ds = declsIn(n);
      const { defs } = ud(n);
      if (!ds.length && !defs.length) return v;
      const out = new Set(v);
      for (const s of ds) out.add(s);
      for (const d of defs) out.delete(d.sym);
      return out;
    },
    join(a, b) { const u = new Set(a); for (const x of b) u.add(x); return u; },
    equal(a, b) { if (a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; },
  });
  const found = [];
  const seen = new Set();
  for (const b of g.reachable()) {
    let maybe = res.in.get(b) || new Set();
    for (const n of cf.cfg.blockItems(b)) {
      if (maybe.size) {
        // reads: identifiers that are not pure assignment targets
        cf.walk(n, (x) => {
          if (x.type === 'LambdaExpr' || x.type === 'SizeofExpr' || x.type === 'DecltypeType') return cf.walk.SKIP;
          if (x.type === 'Identifier' && x.symbol && maybe.has(x.symbol) && U.writeKind(x) !== 'assign' && !seen.has(x.symbol)) {
            seen.add(x.symbol);
            found.push({ sym: x.symbol, node: x });
          }
          return undefined;
        });
      }
      const ds = declsIn(n);
      const { defs } = ud(n);
      if (ds.length || defs.length) {
        maybe = new Set(maybe);
        for (const s of ds) maybe.add(s);
        for (const d of defs) maybe.delete(d.sym);
      }
    }
  }
  return found;
}

void T;
module.exports = { cfgOf, bodies, localsOf, escaped, isScalarLocal, useDef, deadStores, uninitReads };
