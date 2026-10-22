'use strict';

// Small forward "may" dataflow engine over the front end's CFG, used by the
// resource, errno, mutex and thread rules (MISRA C 21.20, 22.x).
//
// State: Map<key, Set<string>>. A key missing on one incoming path joins as
// '?' (unknown). Expressions of every CFG element are visited in post-order
// (operands before the operator, arguments before the call), so a handler
// for CallExpr sees the state after its arguments were evaluated.

const cf = require('../../cfamily');
const B = require('./b-common');

function clone(st) {
  const o = new Map();
  for (const [k, v] of st) o.set(k, new Set(v));
  return o;
}

function join(a, b) {
  if (a === null) return b === null ? null : clone(b);
  if (b === null) return clone(a);
  const o = new Map();
  for (const [k, v] of a) {
    const s = new Set(v);
    const w = b.get(k);
    if (w) for (const x of w) s.add(x); else s.add('?');
    o.set(k, s);
  }
  for (const [k, w] of b) if (!a.has(k)) { const s = new Set(w); s.add('?'); o.set(k, s); }
  return o;
}

function equal(a, b) {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (!w || w.size !== v.size) return false;
    for (const x of v) if (!w.has(x)) return false;
  }
  return true;
}

// Visit an element in evaluation order (post-order), skipping unevaluated parts.
function visit(node, fn) {
  if (!node || typeof node !== 'object') return;
  switch (node.type) {
    case 'SizeofExpr': case 'AlignofExpr': case 'OffsetofExpr': case 'LambdaExpr': case 'TypeName':
    case 'CompoundStmt': case 'IfStmt': case 'WhileStmt': case 'DoStmt': case 'ForStmt': case 'SwitchStmt':
      return;
    case 'GenericSelection': {
      const sel = node.assocs[node.selected];
      if (sel) visit(sel.expr, fn);
      return;
    }
    case 'AssignExpr':
      // the right operand is evaluated, then the target
      visit(node.right, fn);
      visitLvalue(node.left, fn);
      fn(node);
      return;
    case 'VarDecl':
      if (node.init) visit(node.init, fn);
      fn(node);
      return;
    case 'ExprStmt':
      visit(node.expr, fn);
      return;
    case 'ReturnStmt':
      if (node.arg) visit(node.arg, fn);
      fn(node);
      return;
    case 'Declaration':
      for (const d of node.declarators || []) visit(d, fn);
      return;
    default:
      for (const c of cf.childrenOf(node)) visit(c, fn);
      fn(node);
  }
}

// The target of an assignment: only the sub-expressions needed to designate it.
function visitLvalue(e, fn) {
  const x = B.skipParens(e);
  if (!x) return;
  if (x.type === 'Identifier') return;
  if (x.type === 'MemberExpr') { if (x.arrow) visit(x.object, fn); else visitLvalue(x.object, fn); return; }
  if (x.type === 'IndexExpr') { visit(x.object, fn); visit(x.index, fn); return; }
  if (x.type === 'UnaryExpr' && x.op === '*') { visit(x.arg, fn); return; }
  visit(x, fn);
}

// run(fd, spec): spec = { init?(): Map, node(n, st, emit), edge?(e, st): st|null, exit?(st, emit) }
// emit(rule, node, message) is only active in the final reporting pass.
function run(fd, spec) {
  const g = cf.getCFG(fd);
  const out = [];
  let reporting = false;
  const emit = (key, node, message) => { if (reporting) out.push({ key, node, message }); };
  const transfer = (block, v) => {
    if (v === null) return null;
    const st = clone(v);
    for (const item of cf.cfg.blockItems(block)) visit(item, (n) => spec.node(n, st, emit, block));
    return st;
  };
  const res = cf.solve(g, {
    direction: 'forward',
    boundary: spec.init ? spec.init() : new Map(),
    init: null,
    transfer,
    join,
    equal,
    edge(e, v) {
      if (v === null || v === undefined) return null;
      if (!spec.edge) return v;
      return spec.edge(e, clone(v));
    },
    maxIterations: 20000,
  });
  reporting = true;
  for (const b of g.rpo()) transfer(b, res.in.get(b));
  if (spec.exit) {
    const st = res.in.get(g.exit);
    if (st) spec.exit(st, emit);
  }
  return out;
}

const only = (set, x) => !!set && set.size === 1 && set.has(x);
const may = (set, x) => !!set && set.has(x);

// Condition refinement for "pointer is null" tests.
// Returns { sym, nullWhenTrue } for p, !p, p == NULL, p != 0, (p = f()) == NULL ...
function nullTest(cond) {
  let x = B.skipParens(cond);
  let neg = false;
  while (x && x.type === 'UnaryExpr' && x.op === '!') { neg = !neg; x = B.skipParens(x.arg); }
  const asSym = (e) => {
    let y = B.stripCasts(e);
    if (y && y.type === 'AssignExpr' && y.op === '=') y = B.skipParens(y.left);
    return y && y.type === 'Identifier' && y.symbol ? y.symbol : null;
  };
  const isNull = (e) => {
    const y = B.stripCasts(e);
    return !!(y && ((y.type === 'IntegerLiteral' && y.value === 0n) || (y.loc && y.loc.macro === 'NULL')));
  };
  if (x && x.type === 'BinaryExpr' && (x.op === '==' || x.op === '!=')) {
    let s = null;
    if (isNull(x.right)) s = asSym(x.left);
    else if (isNull(x.left)) s = asSym(x.right);
    if (!s) return null;
    const nullWhenTrue = x.op === '==';
    return { sym: s, nullWhenTrue: neg ? !nullWhenTrue : nullWhenTrue };
  }
  const s = asSym(x);
  if (s && B.isPointerType(s.type)) return { sym: s, nullWhenTrue: neg };
  return null;
}

module.exports = { run, visit, clone, join, equal, only, may, nullTest };
