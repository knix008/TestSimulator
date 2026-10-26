'use strict';

// AST helpers: generic child iteration, parent links, structural
// fingerprints and small predicates shared by the rules.

const SKIP = new Set(['parent', 'line', 'col', 'endLine', 'endCol', 'nameLine', 'nameCol', 'kwLine', 'kwCol', 'opLine', 'opCol', 'opSp', 'elseLine', 'bodyLine', 'bodyEndLine']);

function isNode(v) { return v && typeof v === 'object' && typeof v.type === 'string'; }

function children(n) {
  const out = [];
  if (!n || typeof n !== 'object') return out;
  for (const k in n) {
    if (SKIP.has(k) || k.charCodeAt(0) === 95) continue;
    const v = n[k];
    if (!v || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      for (const x of v) if (isNode(x)) out.push(x);
    } else if (isNode(v)) out.push(v);
  }
  return out;
}

// Sets `parent` on every node; returns all nodes in pre-order.
function link(root) {
  const all = [];
  const stack = [root];
  root.parent = null;
  while (stack.length) {
    const n = stack.pop();
    all.push(n);
    const ch = children(n);
    for (let i = ch.length - 1; i >= 0; i--) {
      Object.defineProperty(ch[i], 'parent', { value: n, writable: true, configurable: true, enumerable: false });
      stack.push(ch[i]);
    }
  }
  return all;
}

// Structural fingerprint that ignores positions.
function fp(n) {
  if (n == null) return '~';
  if (Array.isArray(n)) return '[' + n.map(fp).join(',') + ']';
  if (typeof n !== 'object') return JSON.stringify(n);
  if (n._fp) return n._fp;
  let s = '';
  if (!n.type) {
    // string part
    if (n.s != null) return JSON.stringify(n.s);
    return '?';
  }
  s = n.type + '(';
  for (const k in n) {
    if (SKIP.has(k) || k === 'type' || k.charCodeAt(0) === 95 || k === 'code' || k === 'lvar' || k === 'q' || k === 'paren' || k === 'cmd') continue;
    const v = n[k];
    s += k + ':' + (v && typeof v === 'object' ? fp(v) : JSON.stringify(v)) + ';';
  }
  s += ')';
  Object.defineProperty(n, '_fp', { value: s, writable: true, configurable: true, enumerable: false });
  return s;
}

function same(a, b) { return fp(a) === fp(b); }

// Walks `n` (pre-order). `fn` returns false to skip children. Does not enter
// nested Def/Class/Module unless `deep`.
function walk(n, fn, deep = false) {
  const stack = Array.isArray(n) ? n.slice().reverse() : [n];
  while (stack.length) {
    const x = stack.pop();
    if (!x) continue;
    if (fn(x) === false) continue;
    const ch = children(x);
    for (let i = ch.length - 1; i >= 0; i--) {
      const c = ch[i];
      if (!deep && (c.type === 'Def' || c.type === 'Class' || c.type === 'Module' || c.type === 'SClass')) continue;
      stack.push(c);
    }
  }
}

const SCOPE_TYPES = new Set(['Def', 'Class', 'Module', 'SClass', 'Program']);

function enclosing(n, types) {
  let p = n && n.parent;
  while (p) {
    if (types.has(p.type)) return p;
    p = p.parent;
  }
  return null;
}

function enclosingDef(n) {
  let p = n && n.parent;
  while (p) {
    if (p.type === 'Def') return p;
    if (p.type === 'Class' || p.type === 'Module' || p.type === 'SClass') return null;
    p = p.parent;
  }
  return null;
}

function enclosingClass(n) { return enclosing(n, new Set(['Class', 'Module', 'SClass'])); }

// literal helpers
function strValue(n) {
  if (!n) return null;
  if (n.type === 'Str' && !n.interp && n.value != null) return n.value;
  return null;
}
function symOrStr(n) {
  if (!n) return null;
  if (n.type === 'Sym' && !n.interp && n.name != null) return n.name;
  return strValue(n);
}
function isLiteral(n) {
  if (!n) return false;
  switch (n.type) {
    case 'Int': case 'Float': case 'Nil': case 'True': case 'False': case 'Sym': return !n.interp;
    case 'Str': case 'Regex': return !n.interp;
    case 'Array': return n.elems.every(isLiteral);
    case 'Hash': return n.pairs.every((p) => p.type === 'Pair' && isLiteral(p.key) && isLiteral(p.value));
    case 'Range': return (!n.lo || isLiteral(n.lo)) && (!n.hi || isLiteral(n.hi));
    case 'Paren': return n.body.length === 1 && isLiteral(n.body[0]);
    default: return false;
  }
}
function isBoolLit(n) { return n && (n.type === 'True' || n.type === 'False'); }
function strip(n) {
  while (n && n.type === 'Paren' && n.body.length === 1) n = n.body[0];
  return n;
}

// Name of a constant path, e.g. OpenSSL::Digest::MD5
function constPath(n) {
  if (!n) return null;
  if (n.type === 'Const') {
    if (!n.scope) return n.name;
    const s = constPath(n.scope);
    return s == null ? null : `${s}::${n.name}`;
  }
  return null;
}

// "Recv.name" style description of a call target, e.g. 'Digest::MD5.hexdigest'
function callTarget(n) {
  if (!n || n.type !== 'Call') return null;
  if (!n.recv) return n.name;
  const r = constPath(n.recv);
  if (r) return `${r}.${n.name}`;
  return null;
}

function isCall(n, name, argc) {
  if (!n) return false;
  if (n.type === 'Call' && (name == null || n.name === name || (name instanceof Set && name.has(n.name)) || (Array.isArray(name) && name.includes(n.name)))) return argc == null || n.args.length === argc;
  return false;
}

// Call without receiver and arguments, or bare identifier that is not a local.
function isVcall(n, name) {
  if (!n) return false;
  if (n.type === 'Ident' && !n.lvar) return name == null || n.name === name;
  if (n.type === 'Call' && !n.recv && !n.args.length && !n.block) return name == null || n.name === name;
  return false;
}

function hasInterp(n) {
  return !!n && (n.type === 'Str' || n.type === 'XStr' || n.type === 'Regex' || n.type === 'Sym') && !!n.interp;
}

// Body statement list of a node (Def, Block, Lambda...) with implicit Begin unwrapped.
function stmtsOf(list) {
  if (!list) return [];
  if (list.length === 1 && list[0].type === 'Begin' && list[0].implicit) return list[0].body;
  return list;
}

function isEmptyBody(list) {
  if (!list || !list.length) return true;
  if (list.length === 1 && list[0].type === 'Begin' && list[0].implicit) {
    const b = list[0];
    return !b.body.length && b.rescues.every((r) => !r.body.length) && !(b.elseBody && b.elseBody.length) && !(b.ensure && b.ensure.length);
  }
  return false;
}

function hashGet(h, key) {
  if (!h || h.type !== 'Hash') return null;
  for (const p of h.pairs) if (p.type === 'Pair' && symOrStr(p.key) === key) return p;
  return null;
}

// Last bare hash argument of a call (keyword arguments).
function kwargs(call) {
  if (!call || !call.args) return null;
  const last = call.args[call.args.length - 1];
  return last && last.type === 'Hash' ? last : null;
}

function short(n, ctx, max = 40) {
  if (!n || !ctx) return '';
  const s = ctx.slice(n);
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > max ? one.slice(0, max - 3) + '...' : one;
}

module.exports = {
  children, link, fp, same, walk, enclosing, enclosingDef, enclosingClass, SCOPE_TYPES,
  strValue, symOrStr, isLiteral, isBoolLit, strip, constPath, callTarget, isCall, isVcall, hasInterp,
  stmtsOf, isEmptyBody, hashGet, kwargs, short, isNode,
};
