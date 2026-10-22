'use strict';

// Shared AST helpers for Java and Kotlin.
//
// Node kinds (both languages):
//   Unit Class Method Field Var Param Init EnumConst Anno Type Import
//   Block Local ExprStmt If While Do For ForEach Return Break Continue Throw
//   Try Catch Switch Case Sync Labeled Empty Assert Yield LocalClass LocalFun
//   Name Lit Tmpl Sel Call New Bin Un Assign Cond Cast InstOf Lambda MRef Idx
//   ArrInit This Super ClassLit TypeExpr Paren TypePat RecPat
//   Kotlin only: IfX (if expression), TryX, IsPat, InPat (when conditions)
// Every node has line/col (1-based) and s/en source offsets.

const SKIP_KEYS = new Set(['k', 'line', 'col', 's', 'en', 'el', 'mods', 'raw', 'id', 'name', 'op', 'idLine', 'idCol', 'opLine',
  'opCol', 'nameLine', 'nameCol', 'bodyLine', 'elseLine', 'comments', 'errorList', 'outerCls', 'label', 'lang', 'kind', 'tparams', 'imports']);

function isNode(x) {
  return x && typeof x === 'object' && typeof x.k === 'string';
}

// Calls fn(child, key) for every child node (Type nodes excluded unless
// withTypes). Plain objects/arrays (anno args, Kotlin supers) are walked
// through.
function eachChild(n, fn, withTypes) {
  for (const key in n) {
    if (SKIP_KEYS.has(key)) continue;
    const v = n[key];
    if (!v || typeof v !== 'object') continue;
    visitVal(v, fn, withTypes, key);
  }
}

function visitVal(v, fn, withTypes, key) {
  if (Array.isArray(v)) {
    for (const x of v) if (x && typeof x === 'object') visitVal(x, fn, withTypes, key);
    return;
  }
  if (v instanceof Set) return;
  if (typeof v.k === 'string') {
    if (v.k === 'Type' && !withTypes) return;
    fn(v, key);
    return;
  }
  for (const k2 in v) {
    const x = v[k2];
    if (x && typeof x === 'object') visitVal(x, fn, withTypes, key);
  }
}

// Pre-order traversal. fn returns false to skip the children.
function forEach(n, fn, opts) {
  const o = opts || {};
  const stack = [n];
  while (stack.length) {
    const x = stack.pop();
    if (fn(x) === false) continue;
    const kids = [];
    eachChild(x, (c) => {
      if (o.noLambda && c.k === 'Lambda') return;
      if (o.noClass && (c.k === 'Class' || c.k === 'LocalClass' || (c.k === 'New' && c.body))) {
        if (c.k === 'New' && c.body) { for (const a of c.args) kids.push(a); }
        return;
      }
      if (o.noLocalFun && c.k === 'LocalFun') return;
      kids.push(c);
    }, o.withTypes);
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  }
}

function find(n, pred, opts) {
  let out = null;
  forEach(n, (x) => {
    if (out) return false;
    if (pred(x)) { out = x; return false; }
    return true;
  }, opts);
  return out;
}

function findAll(n, pred, opts) {
  const out = [];
  forEach(n, (x) => { if (pred(x)) out.push(x); }, opts);
  return out;
}

function strip(e) {
  while (e && e.k === 'Paren') e = e.e;
  return e;
}

function simpleName(name) {
  if (!name) return '';
  const s = String(name);
  const i = s.lastIndexOf('.');
  return i >= 0 ? s.slice(i + 1) : s;
}

function typeName(t) {
  return t ? simpleName(t.name) : '';
}

function annoName(a) {
  return simpleName(a.name);
}

function hasAnno(n, names) {
  if (!n || !n.annos) return false;
  const set = typeof names === 'string' ? [names] : names;
  return n.annos.some((a) => set.includes(annoName(a)));
}

function getAnno(n, name) {
  if (!n || !n.annos) return null;
  return n.annos.find((a) => annoName(a) === name) || null;
}

function annoArg(a, name) {
  if (!a || !a.args) return null;
  const x = a.args.find((p) => p.name === name);
  return x ? x.value : null;
}

function mods(n) {
  return (n && n.mods) || new Set();
}

function isLit(e, t) {
  e = strip(e);
  return !!e && e.k === 'Lit' && (!t || e.t === t);
}

function isNull(e) {
  return isLit(e, 'null');
}

function isNumLit(e) {
  e = strip(e);
  return !!e && e.k === 'Lit' && (e.t === 'int' || e.t === 'long' || e.t === 'double' || e.t === 'float');
}

function isStrLit(e) {
  e = strip(e);
  return !!e && e.k === 'Lit' && e.t === 'str';
}

function isBoolLit(e, v) {
  e = strip(e);
  return !!e && e.k === 'Lit' && e.t === 'bool' && (v === undefined || e.v === v);
}

function nameOf(e) {
  e = strip(e);
  if (!e) return null;
  if (e.k === 'Name') return e.id;
  if (e.k === 'Sel' && e.o && e.o.k === 'This' && !e.o.q) return 'this.' + e.id;
  return null;
}

// Local-or-field key of a simple variable reference (x, this.x).
function varKey(e) {
  e = strip(e);
  if (!e) return null;
  if (e.k === 'Name') return e.id;
  if (e.k === 'Sel' && e.o && e.o.k === 'This' && !e.o.q) return 'this.' + e.id;
  return null;
}

// Dotted text of a Name/Sel chain: a.b.c ; null for anything else.
function dotted(e) {
  e = strip(e);
  if (!e) return null;
  if (e.k === 'Name') return e.id;
  if (e.k === 'Sel') {
    const o = dotted(e.o);
    return o ? o + '.' + e.id : null;
  }
  if (e.k === 'This') return 'this';
  return null;
}

// Call helpers ----------------------------------------------------------
function isCall(e, name, recv) {
  e = strip(e);
  if (!e || e.k !== 'Call') return false;
  if (name) {
    if (Array.isArray(name)) { if (!name.includes(e.id)) return false; } else if (e.id !== name) return false;
  }
  if (recv !== undefined) {
    const r = dotted(e.o);
    if (Array.isArray(recv)) return recv.includes(r) || recv.includes(simpleName(r || ''));
    return r === recv || simpleName(r || '') === recv;
  }
  return true;
}

// `new T(...)` in Java, `T(...)` in Kotlin (capitalized callee without receiver
// or with a package-like receiver).
function ctorType(e) {
  e = strip(e);
  if (!e) return null;
  if (e.k === 'New' && !e.array) return typeName(e.type);
  if (e.k === 'Call' && e.id && /^[A-Z]/.test(e.id) && !e.infix) {
    if (!e.o) return e.id;
    const d = dotted(e.o);
    if (d && /^[a-z][\w]*(\.[a-z]\w*)*$/.test(d) && d.includes('.')) return e.id;
  }
  return null;
}

function isCtor(e, names) {
  const t = ctorType(e);
  if (!t) return false;
  return typeof names === 'string' ? t === names : names.includes(t);
}

function ctorArgs(e) {
  e = strip(e);
  return e ? e.args || [] : [];
}

// Structural equality of expressions (positions ignored).
function eq(a, b) {
  a = strip(a);
  b = strip(b);
  if (a === b) return true;
  if (!a || !b || a.k !== b.k) return false;
  switch (a.k) {
    case 'Name': return a.id === b.id;
    case 'Lit': return a.t === b.t && a.v === b.v;
    case 'This': return eq(a.q, b.q);
    case 'Super': return true;
    case 'Sel': return a.id === b.id && !!a.safe === !!b.safe && eq(a.o, b.o);
    case 'Call': return a.id === b.id && eq(a.o, b.o) && eq(a.callee, b.callee) && eqList(a.args, b.args);
    case 'Bin': return a.op === b.op && eq(a.l, b.l) && eq(a.r, b.r);
    case 'Un': return a.op === b.op && !!a.post === !!b.post && eq(a.e, b.e);
    case 'Idx': return eq(a.o, b.o) && eq(a.i, b.i);
    case 'Cast': return typeName(a.type) === typeName(b.type) && eq(a.e, b.e);
    case 'InstOf': return typeName(a.type) === typeName(b.type) && eq(a.e, b.e) && !!a.neg === !!b.neg;
    case 'Cond': return eq(a.c, b.c) && eq(a.a, b.a) && eq(a.b, b.b);
    case 'Assign': return a.op === b.op && eq(a.t, b.t) && eq(a.v, b.v);
    case 'ClassLit': return typeName(a.type) === typeName(b.type);
    case 'New': return typeName(a.type) === typeName(b.type) && eqList(a.args, b.args) && !a.body && !b.body;
    case 'Tmpl': return a.raw === b.raw;
    case 'MRef': return a.id === b.id && eq(a.o, b.o);
    default: return false;
  }
}

function eqList(a, b) {
  a = a || [];
  b = b || [];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false;
  return true;
}

// Statement-level structural equality, used for duplicated branches.
function eqStmt(a, b) {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  if (a.k === 'Block' && a.stmts.length === 1 && b.k !== 'Block') return eqStmt(a.stmts[0], b);
  if (b.k === 'Block' && b.stmts.length === 1 && a.k !== 'Block') return eqStmt(a, b.stmts[0]);
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'Block': {
      if (a.stmts.length !== b.stmts.length) return false;
      for (let i = 0; i < a.stmts.length; i++) if (!eqStmt(a.stmts[i], b.stmts[i])) return false;
      return true;
    }
    case 'ExprStmt': return eq(a.e, b.e);
    case 'Return': return eq(a.e, b.e) || (!a.e && !b.e);
    case 'Throw': return eq(a.e, b.e);
    case 'Break': case 'Continue': return a.label === b.label;
    case 'Empty': return true;
    case 'If': return eq(a.c, b.c) && eqStmt(a.t, b.t) && eqStmt(a.f, b.f);
    case 'Local': {
      if (a.vars.length !== b.vars.length) return false;
      for (let i = 0; i < a.vars.length; i++) {
        if (a.vars[i].name !== b.vars[i].name) return false;
        if (!(eq(a.vars[i].init, b.vars[i].init) || (!a.vars[i].init && !b.vars[i].init))) return false;
      }
      return typeName(a.type) === typeName(b.type);
    }
    default: return false;
  }
}

// Text of a node in the source.
function text(src, n) {
  if (!n || n.s == null || n.en == null) return '';
  return src.slice(n.s, n.en);
}

function shortText(src, n, max = 40) {
  const t = text(src, n).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 3) + '...' : t;
}

// Compile-time constant value of an expression (int/long/double/string/bool)
// or undefined. `lookup(name)` resolves identifiers to constant values.
function constValue(e, lookup, depth = 0) {
  e = strip(e);
  if (!e || depth > 8) return undefined;
  switch (e.k) {
    case 'Lit':
      if (e.t === 'null') return undefined;
      if (e.t === 'char') return e.v;
      return e.v;
    case 'Name':
    case 'Sel': {
      if (!lookup) return undefined;
      const d = dotted(e);
      return d ? lookup(d, e) : undefined;
    }
    case 'Un': {
      const v = constValue(e.e, lookup, depth + 1);
      if (v === undefined) return undefined;
      if (e.op === '-' && typeof v === 'number') return -v;
      if (e.op === '+' && typeof v === 'number') return v;
      if (e.op === '!' && typeof v === 'boolean') return !v;
      if (e.op === '~' && typeof v === 'number') return ~v;
      return undefined;
    }
    case 'Bin': {
      const l = constValue(e.l, lookup, depth + 1);
      if (l === undefined) return undefined;
      const r = constValue(e.r, lookup, depth + 1);
      if (r === undefined) return undefined;
      switch (e.op) {
        case '+': return (typeof l === 'string' || typeof r === 'string') ? String(l) + String(r) : l + r;
        case '-': return typeof l === 'number' && typeof r === 'number' ? l - r : undefined;
        case '*': return typeof l === 'number' && typeof r === 'number' ? l * r : undefined;
        case '==': return l === r;
        case '!=': return l !== r;
        case '&&': return typeof l === 'boolean' ? l && r : undefined;
        case '||': return typeof l === 'boolean' ? l || r : undefined;
        default: return undefined;
      }
    }
    case 'Tmpl': return undefined;
    default: return undefined;
  }
}

function lineOfNode(n) {
  return n ? n.line : 0;
}

// Statements that unconditionally leave the current block.
function isJump(s) {
  if (!s) return false;
  if (s.k === 'ExprStmt') {
    const e = strip(s.e);
    return !!e && (e.k === 'Throw' || e.k === 'Return');
  }
  return s.k === 'Return' || s.k === 'Throw' || s.k === 'Break' || s.k === 'Continue' || s.k === 'Yield';
}

// Does the statement complete normally? (conservative: true when unsure)
function canComplete(s) {
  if (!s) return true;
  switch (s.k) {
    case 'Return': case 'Throw': case 'Break': case 'Continue': case 'Yield': return false;
    case 'Block': {
      for (const x of s.stmts) if (!canComplete(x)) return false;
      return true;
    }
    case 'If': return !s.f || canComplete(s.t) || canComplete(s.f);
    case 'ExprStmt': {
      const e = strip(s.e);
      if (e && (e.k === 'Throw' || e.k === 'Return')) return false;
      if (e && e.k === 'Call' && !e.o && (e.id === 'fail' || e.id === 'TODO' || e.id === 'error')) return e.id === 'fail';
      return true;
    }
    case 'While': return !(isBoolLit(s.c, true) && !find(s.body, (x) => x.k === 'Break', { noClass: true, noLambda: true }));
    case 'Try': return canComplete(s.body) || s.catches.some((c) => canComplete(c.body));
    default: return true;
  }
}

function blockStmts(s) {
  if (!s) return [];
  return s.k === 'Block' ? s.stmts : [s];
}

module.exports = {
  isNode, eachChild, forEach, find, findAll, strip, simpleName, typeName, annoName, hasAnno, getAnno, annoArg, mods,
  isLit, isNull, isNumLit, isStrLit, isBoolLit, nameOf, varKey, dotted, isCall, ctorType, isCtor, ctorArgs, eq, eqList, eqStmt,
  text, shortText, constValue, lineOfNode, isJump, canComplete, blockStmts,
};
