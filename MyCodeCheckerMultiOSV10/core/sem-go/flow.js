'use strict';

// Data flow on the CFG: uses/defs of local variables per node, liveness,
// dead stores (UNUSED_VALUE), reachability of statements (DEADCODE).

const A = require('./ast');
const { reachable } = require('./cfg');

const LOCAL_KINDS = new Set(['var', 'param', 'result', 'recv']);
const isLocal = (s) => !!s && s.local && LOCAL_KINDS.has(s.kind);

function collectReads(e, uses) {
  if (!e) return;
  A.walk(e, (n) => {
    if (n.k === 'Ident') {
      if (n.isDecl || n.isField || n.isSel) return false;
      if (isLocal(n.sym)) uses.add(n.sym);
      return false;
    }
    if (n.k === 'Selector') { collectReads(n.x, uses); return false; }
    if (n.k === 'KeyValue' && n.key && n.key.isField) { collectReads(n.value, uses); return false; }
    return true;
  });
}

function lhsDefs(l, op, rhs, stmt, ud) {
  const x = A.strip(l);
  if (x && x.k === 'Ident') {
    if (x.blank || !isLocal(x.sym)) return;
    if (op !== '=' && op !== ':=') ud.uses.add(x.sym);
    ud.defs.push({ sym: x.sym, ident: x, rhs, stmt, op });
    return;
  }
  collectReads(l, ud.uses);
}

// uses / defs of one CFG node
function nodeUD(node, fn) {
  if (node._ud) return node._ud;
  const ud = { uses: new Set(), defs: [] };
  node._ud = ud;
  const s = node.ast;
  if (node.kind === 'exit') {
    for (const sym of fn.syms || []) if (sym.kind === 'result') ud.uses.add(sym);
    return ud;
  }
  if (!s || node.kind === 'join' || node.kind === 'select' || node.kind === 'entry' || node.kind === 'abort') return ud;
  if (node.kind === 'case') {
    if (s.k === 'Case' && s.list && !(s.parent && s.parent.k === 'TypeSwitch')) for (const e of s.list) collectReads(e, ud.uses);
    return ud;
  }
  if (node.kind === 'range') {
    collectReads(s.x, ud.uses);
    for (const v of [s.key, s.value]) if (v) lhsDefs(v, s.tok === ':=' ? ':=' : '=', null, s, ud);
    return ud;
  }
  if (node.kind === 'cond') { collectReads(s, ud.uses); return ud; }
  switch (s.k) {
    case 'Assign': {
      for (const r of s.rhs) collectReads(r, ud.uses);
      s.lhs.forEach((l, i) => lhsDefs(l, s.op, s.rhs.length === s.lhs.length ? s.rhs[i] : s.rhs[0], s, ud));
      return ud;
    }
    case 'IncDec': lhsDefs(s.x, '+=', null, s, ud); return ud;
    case 'DeclStmt':
      for (const sp of s.decl.specs || []) {
        if (sp.k !== 'VarSpec') continue;
        for (const v of sp.values) collectReads(v, ud.uses);
        sp.names.forEach((nm, i) => {
          if (isLocal(nm.sym)) ud.defs.push({ sym: nm.sym, ident: nm, rhs: sp.values.length === sp.names.length ? sp.values[i] : (sp.values[0] || null), stmt: s, op: '=', zero: !sp.values.length });
        });
      }
      return ud;
    case 'Return':
      for (const r of s.results) collectReads(r, ud.uses);
      if (!s.results.length) for (const sym of fn.syms || []) if (sym.kind === 'result') ud.uses.add(sym);
      return ud;
    default:
      collectReads(s, ud.uses);
      return ud;
  }
}

function liveness(g) {
  const fn = g.fn;
  const liveIn = new Map();
  const liveOut = new Map();
  for (const n of g.nodes) { liveIn.set(n.id, new Set()); liveOut.set(n.id, new Set()); nodeUD(n, fn); }
  let changed = true;
  let iter = 0;
  while (changed && iter++ < 200) {
    changed = false;
    for (let i = g.nodes.length - 1; i >= 0; i--) {
      const n = g.nodes[i];
      const out = liveOut.get(n.id);
      for (const e of n.succ) for (const v of liveIn.get(e.to.id)) if (!out.has(v)) { out.add(v); changed = true; }
      const ud = n._ud;
      const inn = liveIn.get(n.id);
      const defd = new Set(ud.defs.filter((d) => d.op === '=' || d.op === ':=').map((d) => d.sym));
      for (const v of out) if (!defd.has(v) && !inn.has(v)) { inn.add(v); changed = true; }
      for (const v of ud.uses) if (!inn.has(v)) { inn.add(v); changed = true; }
    }
  }
  return { liveIn, liveOut };
}

function trivialValue(e) {
  e = A.strip(e);
  if (!e) return true;
  if (e.k === 'Ident') return e.name === 'nil' || e.name === 'false' || e.name === 'true';
  if (e.k === 'BasicLit') return e.value === '0' || e.value === '""' || e.value === '``' || e.value === '1' || e.value === '0.0';
  if (e.k === 'Unary' && e.op === '-') { const x = A.strip(e.x); return !!x && x.k === 'BasicLit' && x.value === '1'; }
  if (e.k === 'CompositeLit') return e.elts.length === 0;
  return false;
}

// Dead stores: onDead({ sym, ident, rhs, stmt, node })
function deadStores(g, onDead) {
  const live = liveness(g);
  const reach = reachable(g);
  for (const n of g.nodes) {
    if (!reach.has(n.id)) continue;
    const ud = n._ud;
    if (!ud || !ud.defs.length) continue;
    const out = live.liveOut.get(n.id);
    for (const d of ud.defs) {
      if (out.has(d.sym)) continue;
      onDead({ ...d, node: n });
    }
  }
}

// Statements that can never execute: reported once at the first statement
// after a reachable one in each statement list.
function unreachableStatements(g, report) {
  const reach = reachable(g);
  const lists = [];
  A.walkNoFunc(g.fn.body, (n) => {
    if (n.k === 'FuncLit') return false;
    if (n.k === 'Block') lists.push(n.stmts);
    else if (n.k === 'Case' || n.k === 'Comm') lists.push(n.body);
    return true;
  });
  for (const stmts of lists) {
    let prevReach = null;
    for (const s of stmts) {
      if (s.k === 'Empty') continue;
      const e = g.entryOf.get(s);
      if (!e) continue;
      const r = reach.has(e.id);
      if (!r && prevReach === true && s.k !== 'Labeled') { report(s); break; }
      prevReach = r;
    }
  }
}

module.exports = { nodeUD, liveness, deadStores, unreachableStatements, collectReads, trivialValue, isLocal };
