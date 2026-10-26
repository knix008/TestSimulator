'use strict';

// AST helpers: child enumeration, walking with parents, structural equality,
// source text, small predicates shared by rules and flow engines.

const CHILDREN = {
  File: ['decls'],
  FuncDecl: ['recv', 'tparams', 'params', 'results', 'body'],
  GenDecl: ['specs'],
  VarSpec: ['names', 'type', 'values'],
  TypeSpec: ['tparams', 'type'],
  ImportSpec: [],
  Field: ['names', 'type'],
  ArrayType: ['len', 'elt'],
  MapType: ['key', 'val'],
  ChanType: ['elt'],
  FuncType: ['tparams', 'params', 'results'],
  StructType: ['fields'],
  InterfaceType: ['elems'],
  Ellipsis: ['elt'],
  Ident: [],
  BasicLit: [],
  CompositeLit: ['type', 'elts'],
  KeyValue: ['key', 'value'],
  FuncLit: ['type', 'body'],
  Paren: ['x'],
  Selector: ['x'],
  Index: ['x', 'indices'],
  Slice: ['x', 'lo', 'hi', 'max'],
  TypeAssert: ['x', 'type'],
  Call: ['fun', 'args'],
  Star: ['x'],
  Unary: ['x'],
  Binary: ['x', 'y'],
  Bad: [],
  Block: ['stmts'],
  ExprStmt: ['x'],
  Assign: ['lhs', 'rhs'],
  IncDec: ['x'],
  Send: ['ch', 'val'],
  DeclStmt: ['decl'],
  Go: ['call'],
  Defer: ['call'],
  Return: ['results'],
  Branch: [],
  Labeled: ['stmt'],
  If: ['init', 'cond', 'then', 'els'],
  For: ['init', 'cond', 'post', 'body'],
  Range: ['key', 'value', 'x', 'body'],
  Switch: ['init', 'tag', 'cases'],
  TypeSwitch: ['init', 'assign', 'cases'],
  Select: ['cases'],
  Case: ['list', 'body'],
  Comm: ['comm', 'body'],
  Empty: [],
};

function eachChild(n, fn) {
  const keys = CHILDREN[n.k];
  if (!keys) return;
  for (const key of keys) {
    const v = n[key];
    if (!v) continue;
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c === 'object' && c.k) fn(c, key); } else if (typeof v === 'object' && v.k) fn(v, key);
  }
}

// Pre-order walk. visit(node, parent) returning false skips the children.
function walk(n, visit, parent = null) {
  if (!n || typeof n !== 'object') return;
  if (visit(n, parent) === false) return;
  eachChild(n, (c) => walk(c, visit, n));
}

// Walk that does not descend into function literals (they get their own pass).
function walkNoFunc(n, visit) {
  walk(n, (x, p) => {
    if (x !== n && x.k === 'FuncLit') { visit(x, p); return false; }
    return visit(x, p);
  });
}

function strip(e) {
  while (e && e.k === 'Paren') e = e.x;
  return e;
}

function text(src, n) {
  if (!n || n.pos == null || n.end == null) return '';
  return src.slice(n.pos, n.end);
}

// Normalised source of an expression (whitespace and comments collapsed).
function norm(src, n) {
  return text(src, n).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim();
}

// Structural equality ignoring positions and annotations.
const ATTRS = ['op', 'name', 'kind', 'value', 'tok', 'dir', 'three', 'ellipsis', 'alias', 'kw', 'embedded'];
const NAMED = ['sel', 'label', 'names'];
function same(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  if (a.k !== b.k) return false;
  if (a.k === 'BasicLit') return a.kind === b.kind && a.value === b.value;
  if (a.k === 'Ident') return a.name === b.name;
  for (const k of ATTRS) if (a[k] !== b[k]) return false;
  for (const k of NAMED) {
    const va = a[k];
    const vb = b[k];
    if (!va && !vb) continue;
    if (!va || !vb) return false;
    if (Array.isArray(va)) { if (!Array.isArray(vb) || va.length !== vb.length || va.some((x, i) => x.name !== vb[i].name)) return false; } else if (va.name !== vb.name) return false;
  }
  const keys = CHILDREN[a.k];
  if (keys) for (const k of keys) { if (k === 'names') continue; if (!same(a[k] || null, b[k] || null)) return false; }
  return true;
}

// a.b.c -> 'a.b.c' when made only of identifiers and selectors
function dotted(e) {
  e = strip(e);
  if (!e) return null;
  if (e.k === 'Ident') return e.name;
  if (e.k === 'Selector') { const l = dotted(e.x); return l ? `${l}.${e.sel.name}` : null; }
  return null;
}

// Call to pkg.Fn / recv.Method: returns { q: 'pkg.Fn' | null, recv, name }
function callee(call) {
  if (!call || call.k !== 'Call') return null;
  const f = strip(call.fun);
  if (f.k === 'Ident') return { q: f.name, recv: null, name: f.name };
  if (f.k === 'Selector') return { q: dotted(f), recv: f.x, name: f.sel.name };
  if (f.k === 'Index') { const g = strip(f.x); if (g.k === 'Ident') return { q: g.name, recv: null, name: g.name, generic: true }; if (g.k === 'Selector') return { q: dotted(g), recv: g.x, name: g.sel.name, generic: true }; }
  return { q: null, recv: null, name: null };
}

function isIdent(e, name) { e = strip(e); return !!e && e.k === 'Ident' && (name === undefined || e.name === name); }
function isNil(e) { return isIdent(e, 'nil'); }
function isBoolLit(e) { e = strip(e); return !!e && e.k === 'Ident' && (e.name === 'true' || e.name === 'false') && !(e.sym && !e.sym.builtin); }
function isStr(e) { e = strip(e); return !!e && e.k === 'BasicLit' && e.kind === 'string'; }
function isNum(e) { e = strip(e); return !!e && e.k === 'BasicLit' && (e.kind === 'int' || e.kind === 'float'); }

// Statements that unconditionally leave the enclosing block.
const EXIT_CALLS = new Set(['panic', 'os.Exit', 'log.Fatal', 'log.Fatalf', 'log.Fatalln', 'log.Panic', 'log.Panicf', 'log.Panicln', 'runtime.Goexit', 't.Fatal', 't.Fatalf', 't.FailNow', 'b.Fatal', 'b.Fatalf', 't.Skip', 't.Skipf', 't.SkipNow']);
function isExitCall(e) {
  e = strip(e);
  if (!e || e.k !== 'Call') return false;
  const c = callee(e);
  return !!(c && c.q && EXIT_CALLS.has(c.q));
}
function terminates(s) {
  if (!s) return false;
  switch (s.k) {
    case 'Return': return true;
    case 'Branch': return s.tok === 'goto' || s.tok === 'break' || s.tok === 'continue';
    case 'ExprStmt': return isExitCall(s.x);
    case 'Block': return s.stmts.length > 0 && terminates(s.stmts[s.stmts.length - 1]);
    case 'If': return !!s.els && terminates(s.then) && terminates(s.els);
    case 'Labeled': return terminates(s.stmt);
    default: return false;
  }
}

// Statement lists of a Case / Comm / Block
function stmtsOf(n) {
  if (!n) return [];
  if (n.k === 'Block') return n.stmts;
  if (n.k === 'Case' || n.k === 'Comm') return n.body;
  return [n];
}

function funcBodyOf(fn) {
  return fn.k === 'FuncLit' ? fn.body : fn.body;
}
function funcTypeOf(fn) {
  return fn.k === 'FuncLit' ? fn.type : fn;
}
function funcName(fn) {
  if (fn.k === 'FuncDecl') {
    if (fn.recv && fn.recv.length) {
      let t = fn.recv[0].type;
      t = strip(t);
      if (t && t.k === 'Star') t = strip(t.x);
      if (t && t.k === 'Index') t = t.x;
      const rn = t && t.k === 'Ident' ? t.name : '?';
      return `${rn}.${fn.name.name}`;
    }
    return fn.name.name;
  }
  return 'func literal';
}

// type expression as a short string ('*os.File', '[]int', 'map[string]int')
function typeStr(t) {
  t = strip(t);
  if (!t) return '';
  switch (t.k) {
    case 'Ident': return t.name;
    case 'Selector': return dotted(t) || '?';
    case 'Star': return `*${typeStr(t.x)}`;
    case 'ArrayType': return t.len ? `[${t.len.k === 'BasicLit' ? t.len.value : (t.len.k === 'Ellipsis' ? '...' : 'N')}]${typeStr(t.elt)}` : `[]${typeStr(t.elt)}`;
    case 'MapType': return `map[${typeStr(t.key)}]${typeStr(t.val)}`;
    case 'ChanType': return `chan ${typeStr(t.elt)}`;
    case 'FuncType': return 'func';
    case 'StructType': return 'struct{}';
    case 'InterfaceType': return t.elems.length ? 'interface{...}' : 'interface{}';
    case 'Index': return `${typeStr(t.x)}[...]`;
    case 'Ellipsis': return `...${typeStr(t.elt)}`;
    default: return '';
  }
}

function lineCount(n) { return (n.endLine || n.line) - n.line + 1; }

module.exports = {
  CHILDREN, eachChild, walk, walkNoFunc, strip, text, norm, same, dotted, callee, isIdent, isNil,
  isBoolLit, isStr, isNum, isExitCall, terminates, stmtsOf, funcBodyOf, funcTypeOf, funcName, typeStr, lineCount, EXIT_CALLS,
};
