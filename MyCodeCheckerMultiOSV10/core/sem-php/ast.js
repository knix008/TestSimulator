'use strict';

// AST helpers: child iteration, parent links, structural equality, names.

const SKIP = new Set(['parent', 'sym', 'fn', 'scope', 'opTok', 'modToks', 'mods', 'attrs', 'cls$', 'info']);
const FUNC_KINDS = new Set(['FuncDecl', 'Method', 'Closure', 'ArrowFn']);

function forEachChild(n, cb) {
  for (const key in n) {
    if (SKIP.has(key)) continue;
    const v = n[key];
    if (!v || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      for (const x of v) {
        if (x && typeof x === 'object') {
          if (x.k) cb(x, key);
          else if (key === 'items' && x.value) { if (x.value.k) cb(x.value, key); }
        }
      }
    } else if (v.k) cb(v, key);
  }
}

// set parent links and collect nodes by kind; returns { byKind, all }
function index(root) {
  const byKind = new Map();
  const all = [];
  const stack = [root];
  root.parent = null;
  while (stack.length) {
    const n = stack.pop();
    all.push(n);
    let arr = byKind.get(n.k);
    if (!arr) { arr = []; byKind.set(n.k, arr); }
    arr.push(n);
    const kids = [];
    forEachChild(n, (c, key) => { c.parent = n; c.pkey = key; kids.push(c); });
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  }
  for (const arr of byKind.values()) arr.sort((a, b) => a.pos - b.pos || 0);
  return { byKind, all };
}

function unparen(e) {
  while (e && e.k === 'Paren') e = e.e;
  return e;
}

const POS_KEYS = new Set(['line', 'col', 'pos', 'end', 'endLine', 'endCol', 'parent', 'pkey', 'sym', 'opLine', 'opCol', 'opTok', 'nameLine', 'nameCol', 'raw', 'sp', 'nl', 'colonLine', 'elseLine', 'elseCol', 'braceLine', 'fn', 'scope']);

function same(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }
  if (a.k === 'Paren') return same(a.e, b);
  if (b.k === 'Paren') return same(a, b.e);
  if (a.k !== b.k) return false;
  if (a.k === 'Name') return a.name.toLowerCase() === b.name.toLowerCase();
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (POS_KEYS.has(key)) continue;
    if (!same(a[key], b[key])) return false;
  }
  return true;
}

function text(src, n) {
  if (!n || n.pos == null || n.end == null) return '';
  return src.slice(n.pos, n.end);
}

function shortText(src, n, max = 60) {
  const t = text(src, n).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 3) + '...' : t;
}

// lower-cased function name of a plain call `foo(...)` (namespace stripped), or ''
function callName(n) {
  if (!n || n.k !== 'Call' || !n.callee || n.callee.k !== 'Name') return '';
  const s = n.callee.name;
  const i = s.lastIndexOf('\\');
  return (i >= 0 ? s.slice(i + 1) : s).toLowerCase();
}

function memberName(n) {
  if (!n) return '';
  if (typeof n.name === 'string') return n.name;
  return '';
}

function shortName(s) {
  if (!s) return '';
  const i = s.lastIndexOf('\\');
  return i >= 0 ? s.slice(i + 1) : s;
}

function argAt(call, i, name) {
  const args = call.args || [];
  if (name) { const a = args.find((x) => x.name === name); if (a) return a.e; }
  const a = args[i];
  if (!a || a.name || a.spread) return null;
  return a.e;
}

function isLit(e, kind) {
  e = unparen(e);
  return !!e && e.k === 'Lit' && (!kind || e.kind === kind);
}

function strVal(e) {
  e = unparen(e);
  if (e && e.k === 'Lit' && e.kind === 'str') return e.value;
  return null;
}

function litVal(e) {
  e = unparen(e);
  if (!e) return undefined;
  if (e.k === 'Lit') return e.value;
  if (e.k === 'Unary' && e.op === '-' && unparen(e.e).k === 'Lit' && typeof unparen(e.e).value === 'number') return -unparen(e.e).value;
  return undefined;
}

function enclosing(n, kinds) {
  for (let p = n.parent; p; p = p.parent) if (kinds.has ? kinds.has(p.k) : kinds.includes(p.k)) return p;
  return null;
}

function enclosingFn(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (FUNC_KINDS.has(p.k)) return p;
    if (p.k === 'ClassDecl') return null;
  }
  return null;
}

function enclosingClass(n) {
  for (let p = n.parent; p; p = p.parent) if (p.k === 'ClassDecl') return p;
  return null;
}

function contains(n, pred, intoFns = false) {
  let found = false;
  const visit = (x) => {
    if (found) return;
    if (pred(x)) { found = true; return; }
    if (!intoFns && x !== n && (FUNC_KINDS.has(x.k) || x.k === 'ClassDecl')) return;
    forEachChild(x, visit);
  };
  if (n) visit(n);
  return found;
}

function walk(n, cb, intoFns = false) {
  const visit = (x) => {
    if (cb(x) === false) return;
    if (!intoFns && x !== n && (FUNC_KINDS.has(x.k) || x.k === 'ClassDecl')) return;
    forEachChild(x, visit);
  };
  if (n) visit(n);
}

const hasSideEffects = (e) => contains(e, (x) => x.k === 'Call' || x.k === 'MCall' || x.k === 'SCall' || x.k === 'New' || x.k === 'Assign' || x.k === 'Incr' || x.k === 'Include' || x.k === 'Exit' || x.k === 'Yield' || x.k === 'Print' || x.k === 'Throw' || x.k === 'Shell');

function stmtsOf(s) {
  if (!s) return [];
  if (s.k === 'Block') return s.stmts;
  return [s];
}

// statement ends control flow unconditionally (return / throw / exit / break / continue / goto)
function isJump(s) {
  if (!s) return false;
  if (s.k === 'Return' || s.k === 'Break' || s.k === 'Continue' || s.k === 'Goto') return true;
  if (s.k === 'ExprStmt') {
    const e = unparen(s.e);
    return e.k === 'Throw' || e.k === 'Exit';
  }
  return false;
}

function terminates(s) {
  if (!s) return false;
  if (isJump(s)) return true;
  if (s.k === 'Block') return s.stmts.some((x) => terminates(x));
  if (s.k === 'If') return !!s.else && terminates(s.then) && terminates(s.else);
  if (s.k === 'Try') return (terminates(s.block) && s.catches.every((c) => terminates(c.body))) || (s.fin && terminates(s.fin));
  return false;
}

module.exports = {
  forEachChild, index, unparen, same, text, shortText, callName, memberName, shortName, argAt, isLit, strVal, litVal,
  enclosing, enclosingFn, enclosingClass, contains, walk, hasSideEffects, stmtsOf, isJump, terminates, FUNC_KINDS,
};
