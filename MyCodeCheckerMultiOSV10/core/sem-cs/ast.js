'use strict';

// AST helpers: generic child iteration, parent links, kind index, structural
// equality and small predicates shared by the rules.

const SKIP_KEYS = new Set(['parent', 'owner', 'sym', 'msym', 'outer', 'type_', 'info', 'scope', 'fn', 'cfgBlock', 'typeInfo', 'decl', 'member', 'file', 'parentFn', 'valueSym', 'symbols', 'cfg', 'declNode', 'declStmt']);

function forEachChild(node, fn) {
  for (const key in node) {
    if (SKIP_KEYS.has(key)) continue;
    const v = node[key];
    if (!v || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      for (const x of v) if (x && typeof x === 'object' && x.k) fn(x, key);
    } else if (v.k) fn(v, key);
  }
}

// Set parent links and index nodes by kind. Returns Map kind -> nodes[].
let indexStamp = 0;
function indexUnit(unit) {
  const byKind = new Map();
  const stack = [unit];
  const stamp = ++indexStamp;
  unit.parent = null;
  unit._ix = stamp;
  while (stack.length) {
    const n = stack.pop();
    let arr = byKind.get(n.k);
    if (!arr) { arr = []; byKind.set(n.k, arr); }
    arr.push(n);
    forEachChild(n, (c) => {
      if (c._ix === stamp) return;
      c._ix = stamp;
      c.parent = n;
      stack.push(c);
    });
  }
  // keep document order inside each list
  for (const arr of byKind.values()) arr.sort((a, b) => (a.pos || 0) - (b.pos || 0));
  return byKind;
}

function walk(node, fn, parent) {
  if (fn(node, parent) === false) return;
  forEachChild(node, (c) => walk(c, fn, node));
}

// Visit descendants without entering nested lambdas / local functions when `noLambda`.
function descendants(node, fn, opts = {}) {
  forEachChild(node, (c) => {
    if (opts.noLambda && (c.k === 'Lambda' || c.k === 'LocalFunc')) return;
    if (opts.noTypes && (c.k === 'TypeDecl')) return;
    if (fn(c) === false) return;
    descendants(c, fn, opts);
  });
}

const POS_KEYS = new Set(['line', 'col', 'endLine', 'endCol', 'pos', 'end', 'nameLine', 'nameCol', 'parent', 'sym', 'owner', 'elseLine', 'intoLine', 'outer', 'typeInfo', 'info', 'raw',
  // binding flags differ between the read and the written side of `x = x`
  'isWrite', 'isRead', 'anyWrite', 'anyRead']);

function same(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  if (a.k !== b.k) return false;
  for (const key in a) {
    if (POS_KEYS.has(key) || key.startsWith('_')) continue;
    const va = a[key]; const vb = b[key];
    if (va && typeof va === 'object') { if (!same(va, vb)) return false; }
    else if (va !== vb && !(va == null && vb == null)) {
      if (key === 'mods' || typeof va === 'function') continue;
      return false;
    }
  }
  for (const key in b) {
    if (POS_KEYS.has(key) || key.startsWith('_')) continue;
    if (!(key in a) && b[key] != null && b[key] !== false) return false;
  }
  return true;
}

function text(src, node) {
  if (!node || node.pos == null || node.end == null) return '';
  return src.slice(node.pos, node.end);
}

function unparen(e) {
  while (e && (e.k === 'Paren' || e.k === 'SuppressNull')) e = e.expr;
  return e;
}

// Simple dotted name of a Name/Member chain, or null.
function dotted(e) {
  e = unparen(e);
  if (!e) return null;
  if (e.k === 'Name') return e.name;
  if (e.k === 'PredefType') return e.name;
  if (e.k === 'This') return 'this';
  if (e.k === 'Base') return 'base';
  if (e.k === 'Member' && !e.cond) { const l = dotted(e.expr); return l ? `${l}.${e.name}` : null; }
  return null;
}

function callName(inv) {
  const e = unparen(inv.expr);
  if (!e) return null;
  if (e.k === 'Name') return e.name;
  if (e.k === 'Member') return e.name;
  return null;
}

function callTarget(inv) {
  const e = unparen(inv.expr);
  if (e && e.k === 'Member') return e.expr;
  return null;
}

function isLiteral(e, kind) {
  e = unparen(e);
  return !!e && e.k === 'Literal' && (!kind || e.kind === kind);
}

function isNullLit(e) { e = unparen(e); return !!e && e.k === 'Literal' && (e.kind === 'null'); }

function bodyOf(m) {
  if (!m) return null;
  return m.body || m.exprBody || null;
}

function hasMod(m, mod) { return !!(m && m.mods && m.mods.has && m.mods.has(mod)); }

function attrNamed(attrs, names) {
  if (!attrs) return null;
  for (const a of attrs) if (names.includes(a.name)) return a;
  return null;
}

// enclosing node of one of the kinds
function enclosing(node, kinds) {
  let p = node.parent;
  while (p) {
    if (kinds.includes(p.k)) return p;
    p = p.parent;
  }
  return null;
}

const FUNC_KINDS = ['Method', 'Ctor', 'Accessor', 'LocalFunc', 'Lambda', 'Operator', 'Conversion', 'Destructor', 'Property', 'Indexer', 'GlobalStatement'];

function enclosingFunc(node) { return enclosing(node, FUNC_KINDS); }

function enclosingType(node) { return enclosing(node, ['TypeDecl']); }

function isInLoop(node, stopAt) {
  let p = node.parent;
  while (p && p !== stopAt) {
    if (p.k === 'For' || p.k === 'Foreach' || p.k === 'While' || p.k === 'Do') return true;
    if (p.k === 'Lambda' || p.k === 'LocalFunc' || p.k === 'Method' || p.k === 'Ctor' || p.k === 'Accessor') return false;
    p = p.parent;
  }
  return false;
}

module.exports = {
  forEachChild, indexUnit, walk, descendants, same, text, unparen, dotted, callName, callTarget, isLiteral, isNullLit,
  bodyOf, hasMod, attrNamed, enclosing, enclosingFunc, enclosingType, isInLoop, FUNC_KINDS,
};
