'use strict';

// Per-function dataflow for MISRA C 9.1 (automatic object read before it is
// set) and 2.2 (dead stores), built on cf.solve over the CFG.

const U = require('./a-util');
const { cf } = U;

// Local scalar objects with automatic storage declared in the function.
function trackedLocals(fn) {
  const set = new Set();
  cf.walk(fn.body, (n) => {
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (n.type === 'VarDecl' && n.symbol) {
      const s = n.symbol;
      if (s.kind !== 'variable' || s.storage !== 'automatic') return undefined;
      const c = U.canon(s.type);
      if (!c || !(c.kind === 'int' || c.kind === 'float' || c.kind === 'pointer' || c.kind === 'enum')) return undefined;
      set.add(s);
    }
    return undefined;
  });
  return set;
}

function rootIdent(e) {
  let x = U.skip(e);
  for (let g = 0; x && g < 100; g++) {
    if (x.type === 'Identifier') return x;
    if (x.type === 'MemberExpr' && !x.arrow) x = U.skip(x.object);
    else if (x.type === 'IndexExpr') {
      const t = U.canon(x.object && x.object.ctype);
      if (t && t.kind === 'array') x = U.skip(x.object);
      else return null;
    } else return null;
  }
  return null;
}

// Accesses of tracked symbols in evaluation order:
// [{ kind: 'read'|'write'|'addr'|'decl', sym, node, store?: 'assign'|'compound'|'incdec'|'init', constInit? }]
function accesses(unit, root, tracked) {
  const out = [];
  const tr = (id) => id && id.type === 'Identifier' && id.symbol && tracked.has(id.symbol);
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    switch (n.type) {
      case 'Identifier':
        if (tr(n)) out.push({ kind: 'read', sym: n.symbol, node: n });
        return;
      case 'AssignExpr': {
        const t = U.skip(n.left);
        if (n.op === '=') {
          visit(n.right);
          if (tr(t)) out.push({ kind: 'write', sym: t.symbol, node: n, store: 'assign' });
          else visit(n.left);
        } else if (tr(t)) {
          out.push({ kind: 'read', sym: t.symbol, node: t });
          visit(n.right);
          out.push({ kind: 'write', sym: t.symbol, node: n, store: 'compound' });
        } else {
          visit(n.left);
          visit(n.right);
        }
        return;
      }
      case 'UnaryExpr': {
        if (n.op === '&') {
          const r = rootIdent(n.arg);
          if (r && r.symbol && tracked.has(r.symbol)) { out.push({ kind: 'addr', sym: r.symbol, node: n }); return; }
          visit(n.arg);
          return;
        }
        if (n.op === '++' || n.op === '--') {
          const t = U.skip(n.arg);
          if (tr(t)) {
            out.push({ kind: 'read', sym: t.symbol, node: t });
            out.push({ kind: 'write', sym: t.symbol, node: n, store: 'incdec' });
            return;
          }
        }
        visit(n.arg);
        return;
      }
      case 'SizeofExpr': case 'AlignofExpr': case 'OffsetofExpr': case 'LambdaExpr': case 'TypeName':
        return;
      case 'VarDecl': {
        if (n.init) visit(n.init);
        if (n.symbol && tracked.has(n.symbol)) {
          if (n.init) out.push({ kind: 'write', sym: n.symbol, node: n, store: 'init', constInit: isConstInit(unit, n.init) });
          else out.push({ kind: 'decl', sym: n.symbol, node: n });
        }
        return;
      }
      default:
        for (const c of cf.childrenOf(n)) visit(c);
    }
  };
  visit(root);
  return out;
}

function isConstInit(unit, init) {
  if (!init) return false;
  if (init.type === 'InitList') return init.items.every((i) => isConstInit(unit, i));
  const x = U.skip(init);
  if (U.constOf(unit, x)) return true;
  if (x.type === 'FloatingLiteral' || x.type === 'StringLiteral' || x.type === 'CharLiteral') return true;
  if (U.isNullPtrConst(unit, x)) return true;
  if (x.type === 'CastExpr' && x.arg) return isConstInit(unit, x.arg);
  if (x.type === 'UnaryExpr' && x.op === '-' && x.arg && U.skip(x.arg).type === 'FloatingLiteral') return true;
  return false;
}

function addS(s, x) { if (s.has(x)) return s; const n = new Set(s); n.add(x); return n; }
function delS(s, x) { if (!s.has(x)) return s; const n = new Set(s); n.delete(x); return n; }
function union(a, b) { if (a === b || !b.size) return a; if (!a.size) return b; const n = new Set(a); for (const x of b) n.add(x); return n; }
function eqS(a, b) { if (a === b) return true; if (!a || !b || a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; }

const EMPTY = new Set();

function cfgOf(fn) {
  try { return cf.getCFG(fn); } catch (_) { return null; }
}

// 9.1: first read of each possibly-unset local: [{ sym, node }]
function readsBeforeSet(unit, fn) {
  const tracked = trackedLocals(fn);
  if (!tracked.size) return [];
  const g = cfgOf(fn);
  if (!g) return [];
  const cache = new Map();
  const acc = (n) => { let a = cache.get(n); if (!a) cache.set(n, (a = accesses(unit, n, tracked))); return a; };
  const step = (s, ev) => (ev.kind === 'decl' ? addS(s, ev.sym) : ev.kind === 'write' || ev.kind === 'addr' ? delS(s, ev.sym) : s);
  const res = cf.solve(g, {
    direction: 'forward', boundary: EMPTY, init: EMPTY,
    transferElement(node, value) { let s = value; for (const ev of acc(node)) s = step(s, ev); return s; },
    join: union, equal: eqS,
  });
  const out = [];
  const seen = new Set();
  for (const b of g.reachable()) {
    let s = res.in.get(b) || EMPTY;
    for (const item of cf.cfg.blockItems(b)) {
      for (const ev of acc(item)) {
        if (ev.kind === 'read' && s.has(ev.sym) && !seen.has(ev.sym)) { seen.add(ev.sym); out.push({ sym: ev.sym, node: ev.node }); }
        s = step(s, ev);
      }
    }
  }
  return out.sort((a, b) => a.node.loc.start - b.node.loc.start);
}

// 2.2: stores whose value is never read afterwards: [{ sym, node, store }]
function deadStores(unit, fn) {
  const tracked = trackedLocals(fn);
  if (!tracked.size) return [];
  // address-taken or volatile objects are not analysed
  cf.walk(fn.body, (n) => {
    if (n.type === 'UnaryExpr' && n.op === '&') {
      const r = rootIdent(n.arg);
      if (r && r.symbol) tracked.delete(r.symbol);
    }
    if (n.type === 'AsmStmt' || n.type === 'StmtExpr') tracked.clear();
    return undefined;
  });
  for (const s of [...tracked]) if (U.quals(s.type).volatile) tracked.delete(s);
  if (!tracked.size) return [];
  const g = cfgOf(fn);
  if (!g) return [];
  const cache = new Map();
  const acc = (n) => { let a = cache.get(n); if (!a) cache.set(n, (a = accesses(unit, n, tracked))); return a; };
  const back = (s, ev) => (ev.kind === 'read' ? addS(s, ev.sym) : ev.kind === 'write' || ev.kind === 'decl' ? delS(s, ev.sym) : s);
  const res = cf.solve(g, {
    direction: 'backward', boundary: EMPTY, init: EMPTY,
    transferElement(node, value) { let s = value; const a = acc(node); for (let i = a.length - 1; i >= 0; i--) s = back(s, a[i]); return s; },
    join: union, equal: eqS,
  });
  // blocks that cannot reach the exit (endless loops) were not solved backwards
  const toExit = new Set([g.exit]);
  const stack = [g.exit];
  while (stack.length) {
    const b = stack.pop();
    for (const e of b.preds || []) if (!toExit.has(e.from)) { toExit.add(e.from); stack.push(e.from); }
  }
  const out = [];
  for (const b of g.reachable()) {
    if (!toExit.has(b)) continue;
    let s = res.out.get(b) || EMPTY;
    const items = cf.cfg.blockItems(b);
    for (let k = items.length - 1; k >= 0; k--) {
      const a = acc(items[k]);
      for (let i = a.length - 1; i >= 0; i--) {
        const ev = a[i];
        if (ev.kind === 'write' && !s.has(ev.sym) && !(ev.store === 'init' && ev.constInit)) out.push({ sym: ev.sym, node: ev.node, store: ev.store });
        s = back(s, ev);
      }
    }
  }
  return out.sort((a, b) => a.node.loc.start - b.node.loc.start);
}

module.exports = { trackedLocals, accesses, readsBeforeSet, deadStores, rootIdent, isConstInit };
