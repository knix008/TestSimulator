'use strict';

// AST helpers shared by the CERT rule modules. Everything here works on the
// documented core/cfamily API only (see core/cfamily/AST.md).

const cf = require('../../cfamily');
const T = cf.types;

const M = (en, ko) => ({ en, ko });

// ---------------------------------------------------------------- node index
// One walk per unit; nodes from built-in header stand-ins are left out.
const INDEX = new WeakMap();
function index(unit) {
  let ix = INDEX.get(unit);
  if (ix) return ix;
  ix = new Map();
  cf.walk(unit.ast, (n) => {
    if (n.loc && typeof n.loc.file === 'string' && n.loc.file.startsWith('<')) {
      return n.type === 'TranslationUnit' ? undefined : cf.walk.SKIP;
    }
    let l = ix.get(n.type);
    if (!l) ix.set(n.type, (l = []));
    l.push(n);
    return undefined;
  });
  INDEX.set(unit, ix);
  return ix;
}

// nodes(unit, 'CallExpr') or nodes(unit, ['WhileStmt', 'DoStmt'])
function nodes(unit, type) {
  const ix = index(unit);
  if (Array.isArray(type)) {
    const out = [];
    for (const t of type) out.push(...(ix.get(t) || []));
    return out.sort((a, b) => (a.loc.start || 0) - (b.loc.start || 0));
  }
  return ix.get(type) || [];
}

const skip = (e) => cf.skipParens(e);

// Strip parentheses and implicit-looking casts that do not change meaning for
// pattern matching ((void) excluded).
function strip(e) {
  e = skip(e);
  while (e && e.type === 'CastExpr' && e.arg && !(e.typeName && isVoidType(e.typeName.ctype))) e = skip(e.arg);
  return e;
}

function isVoidType(t) {
  return !!t && T.isVoid(T.canonical(t));
}

// --------------------------------------------------------------- call names
// Bare called name: 'strcpy' for strcpy(...), std::strcpy(...), ::strcpy(...);
// member calls return the member name with call.member = true semantics via memberCall().
function callName(call) {
  if (!call || call.type !== 'CallExpr') return null;
  const c = skip(call.callee);
  if (!c) return null;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpr') return c.member;
  return null;
}

function calleeQualifier(call) {
  const c = skip(call.callee);
  return c && c.type === 'Identifier' ? (c.qualifier || '') : null;
}

function isMemberCall(call) {
  const c = skip(call && call.callee);
  return !!c && c.type === 'MemberExpr';
}

// A call to a library function `name`: plain or std::-qualified, and not a
// function the project defines itself.
function isLib(call, names) {
  const n = callName(call);
  if (!n || isMemberCall(call)) return false;
  if (typeof names === 'string' ? n !== names : !names.has(n)) return false;
  const q = calleeQualifier(call);
  if (q && q !== 'std' && q !== '::') return false;
  const s = call.calleeSymbol || (skip(call.callee).symbol);
  if (s && !s.system && !s.implicit && s.definition && s.definition.body) return false;
  return true;
}

// A call to a function declared by a built-in standard header (known not to be user code).
function isStdCall(call) {
  if (!call || call.type !== 'CallExpr' || isMemberCall(call)) return false;
  const s = call.calleeSymbol || idSym(call.callee);
  return !!(s && s.system);
}

// Library calls by name in user code.
function libCalls(unit, names) {
  const set = typeof names === 'string' ? new Set([names]) : names instanceof Set ? names : new Set(names);
  return nodes(unit, 'CallExpr').filter((c) => isLib(c, set));
}

function memberCalls(unit, names) {
  const set = typeof names === 'string' ? new Set([names]) : names instanceof Set ? names : new Set(names);
  return nodes(unit, 'CallExpr').filter((c) => isMemberCall(c) && set.has(callName(c)));
}

function arg(call, i) {
  return call && call.args && call.args[i] ? skip(call.args[i]) : null;
}

function strLit(e) {
  e = strip(e);
  // a literal with an unknown string macro in it has no known value
  return e && e.type === 'StringLiteral' && !e.incomplete ? e.value : null;
}

function isNullConst(e) {
  e = strip(e);
  if (!e) return false;
  if (e.type === 'NullptrLiteral') return true;
  if (e.type === 'IntegerLiteral' && e.value === 0n) return true;
  return false;
}

function constInt(unit, e) {
  if (!e) return null;
  try {
    const r = T.constValue(e, { target: unit && unit.target, allowConstVars: true });
    if (!r || r.invalid || typeof r.value !== 'bigint') return null;
    return r.value;
  } catch (_) {
    return null;
  }
}

function src(unit, node) {
  try {
    return cf.sourceText(unit, node) || '';
  } catch (_) {
    return '';
  }
}

// Normalised text key for comparing two lvalue expressions.
function key(unit, e) {
  e = strip(e);
  if (!e) return null;
  if (e.type === 'Identifier') return e.symbol ? `#${e.symbol.id}` : e.name;
  if (e.type === 'MemberExpr') {
    const o = key(unit, e.object);
    return o ? `${o}${e.arrow ? '->' : '.'}${e.member}` : null;
  }
  if (e.type === 'IndexExpr') {
    const o = key(unit, e.object);
    return o ? `${o}[${src(unit, e.index).replace(/\s+/g, '')}]` : null;
  }
  if (e.type === 'UnaryExpr' && (e.op === '*' || e.op === '&')) {
    const o = key(unit, e.arg);
    return o ? `${e.op}${o}` : null;
  }
  if (e.type === 'ThisExpr') return 'this';
  return null;
}

function idSym(e) {
  e = strip(e);
  return e && e.type === 'Identifier' ? e.symbol || null : null;
}

function refersTo(root, sym) {
  if (!root || !sym) return false;
  return !!cf.findFirst(root, (n) => n.type === 'Identifier' && n.symbol === sym);
}

// ----------------------------------------------------------------- structure
const FN_TYPES = ['FunctionDecl', 'LambdaExpr'];
const enclosingFn = (n) => cf.enclosing(n, FN_TYPES);

function functions(unit) {
  return nodes(unit, 'FunctionDecl').filter((f) => f.body);
}

// The statement holding `node` whose parent is a CompoundStmt (or a case body).
function stmtOf(node) {
  let n = node;
  let p = cf.parentOf(n);
  while (p) {
    if (p.type === 'CompoundStmt') return n;
    if (FN_TYPES.includes(p.type)) return null;
    n = p;
    p = cf.parentOf(n);
  }
  return null;
}

// Statements after `stmt` in its block (flattening case/label wrappers).
function following(stmt) {
  if (!stmt) return [];
  const block = cf.parentOf(stmt);
  if (!block || block.type !== 'CompoundStmt') return [];
  const i = block.body.indexOf(stmt);
  return i < 0 ? [] : block.body.slice(i + 1);
}

function preceding(stmt) {
  if (!stmt) return [];
  const block = cf.parentOf(stmt);
  if (!block || block.type !== 'CompoundStmt') return [];
  const i = block.body.indexOf(stmt);
  return i < 0 ? [] : block.body.slice(0, i);
}

// Is the expression in a condition position (if/while/for/?:/!/&&/||/compare/switch)?
const CMP = new Set(['==', '!=', '<', '>', '<=', '>=', '&&', '||']);
function inCondition(e) {
  let n = e;
  let p = cf.parentOf(n);
  while (p) {
    const k = cf.parentKey(n);
    if ((p.type === 'IfStmt' || p.type === 'WhileStmt' || p.type === 'DoStmt' || p.type === 'SwitchStmt') && k === 'cond') return true;
    if (p.type === 'ForStmt' && k === 'cond') return true;
    if (p.type === 'ConditionalExpr' && k === 'test') return true;
    if (p.type === 'BinaryExpr' && CMP.has(p.op)) return true;
    if (p.type === 'UnaryExpr' && p.op === '!') return true;
    if (p.type === 'ParenExpr' || p.type === 'CastExpr') { n = p; p = cf.parentOf(n); continue; }
    if (p.type === 'AssignExpr' && k === 'right') { n = p; p = cf.parentOf(n); continue; }
    return false;
  }
  return false;
}

// Where does the value of a call go? 'discarded' | 'void' | 'condition' | 'var' (with sym) | 'used'
function resultUse(call) {
  let n = call;
  let p = cf.parentOf(n);
  while (p && p.type === 'ParenExpr') { n = p; p = cf.parentOf(n); }
  if (!p) return { kind: 'used' };
  if (p.type === 'ExprStmt') return { kind: 'discarded' };
  if (p.type === 'CastExpr' && isVoidType(p.typeName && p.typeName.ctype)) return { kind: 'void' };
  if (p.type === 'BinaryExpr' && p.op === ',' && cf.parentKey(n) === 'left') return { kind: 'discarded' };
  if (p.type === 'ForStmt' && cf.parentKey(n) === 'inc') return { kind: 'discarded' };
  if (inCondition(n)) return { kind: 'condition' };
  if (p.type === 'AssignExpr' && cf.parentKey(n) === 'right' && p.op === '=') {
    const s = idSym(p.left);
    if (s) return { kind: 'var', sym: s, node: p };
    return { kind: 'used' };
  }
  if ((p.type === 'VarDecl') && p.init === n) return { kind: 'var', sym: p.symbol, node: p };
  return { kind: 'used' };
}

// A variable holding a result is "checked" when a later use reads it in a
// condition, a comparison, a return, or passes it on.
function symChecked(sym, after) {
  if (!sym) return false;
  for (const u of sym.uses || []) {
    if (after && u.loc && after.loc && u.loc.start <= after.loc.start && u.loc.file === after.loc.file) continue;
    const p = cf.parentOf(u);
    if (!p) continue;
    if (p.type === 'AssignExpr' && p.left === u) continue;
    if (inCondition(u)) return true;
    if (p.type === 'ReturnStmt') return true;
    if (p.type === 'CallExpr' && p.callee !== u) return true;
  }
  return false;
}

function resultChecked(call) {
  const r = resultUse(call);
  if (r.kind === 'condition' || r.kind === 'used' || r.kind === 'void') return true;
  if (r.kind === 'var') return symChecked(r.sym, call);
  return false;
}

// ---------------------------------------------------------------------- types
function canon(t) {
  return t ? T.nonRef(t) : null;
}

// Printable class/record/std name of a type: 'std::vector', 'Foo', 'int'.
function typeName(t) {
  const c = canon(t);
  if (!c) return '';
  if (c.kind === 'record' || c.kind === 'enum' || c.kind === 'unknown' || c.kind === 'dependent') return c.name || '';
  return T.typeToString(c);
}

function isStdType(t, names) {
  const n = typeName(t);
  if (!n) return false;
  const bare = n.replace(/^::/, '').replace(/^std::(__\w+::)?/, '');
  if (!n.startsWith('std::') && !n.startsWith('::std::')) return false;
  return typeof names === 'string' ? bare === names : names.has(bare);
}

// Type of the declaration of a VarDecl-ish node, as written by NamedType (works
// for unresolved std:: classes whose ctype is unknown).
function declTypeName(decl) {
  const spec = decl && (decl.specs || (decl.declarator && decl.declarator.specs));
  const ts = spec && spec.typeSpec;
  if (ts && ts.type === 'NamedType') return ts.qname || ts.name;
  return typeName(decl && decl.ctype);
}

const tstr = (t) => (t ? T.typeToString(t) : '?');

// Parent statement-ish helpers
const parent = (n) => cf.parentOf(n);
const pkey = (n) => cf.parentKey(n);

function fnName(fn) {
  if (!fn) return '';
  if (fn.type === 'LambdaExpr') return '<lambda>';
  return fn.qname || fn.name || '';
}

function loopOf(node, stopAt) {
  let p = cf.parentOf(node);
  while (p && p !== stopAt) {
    if (['ForStmt', 'WhileStmt', 'DoStmt', 'RangeForStmt'].includes(p.type)) return p;
    if (FN_TYPES.includes(p.type)) return null;
    p = cf.parentOf(p);
  }
  return null;
}

// Identifiers / calls inside a subtree.
const idsIn = (root) => cf.findAll(root, 'Identifier');
const callsIn = (root) => (root ? cf.findAll(root, 'CallExpr') : []);

function libCallsIn(root, names) {
  const set = typeof names === 'string' ? new Set([names]) : names instanceof Set ? names : new Set(names);
  return callsIn(root).filter((c) => isLib(c, set));
}

// Definition (FunctionDecl with body) for a call's callee, searching the
// project when the unit has only a prototype.
function calleeDef(call, project) {
  const s = call.calleeSymbol || idSym(call.callee);
  if (!s) return null;
  if (s.definition && s.definition.body) return s.definition;
  for (const d of s.decls || []) if (d.body) return d;
  if (project && project.globalSymbols && s.qname) {
    const g = project.globalSymbols.get(s.qname);
    if (g) for (const d of g.definitions || []) if (d.node && d.node.body) return d.node;
  }
  return null;
}

// Functions transitively reachable from fn (FunctionDecl nodes), including fn.
function reachableDefs(fn, project, limit = 500) {
  const out = [];
  const seen = new Set();
  const todo = [fn];
  while (todo.length && out.length < limit) {
    const f = todo.pop();
    if (!f || seen.has(f)) continue;
    seen.add(f);
    out.push(f);
    for (const c of callsIn(f.body)) {
      const d = calleeDef(c, project);
      if (d && !seen.has(d)) todo.push(d);
    }
  }
  return out;
}

// Function definition named by an expression (signal handler, thread start routine).
function fnFromExpr(e, project) {
  e = strip(e);
  if (e && e.type === 'UnaryExpr' && e.op === '&') e = strip(e.arg);
  if (!e || e.type !== 'Identifier' || !e.symbol || e.symbol.kind !== 'function') return null;
  const s = e.symbol;
  if (s.definition && s.definition.body) return s.definition;
  for (const d of s.decls || []) if (d.body) return d;
  if (project && project.globalSymbols) {
    const g = project.globalSymbols.get(s.qname);
    if (g) for (const d of g.definitions || []) if (d.node && d.node.body) return d.node;
  }
  return null;
}

function isInUserFile(n) {
  return !!(n && n.loc && typeof n.loc.file === 'string' && !n.loc.file.startsWith('<'));
}

// True when the front end could not parse part of the subtree (ErrorStmt / ErrorExpr), e.g.
// static_cast<T> with T from an unresolved header. Control-flow based rules skip such functions.
const errCache = new WeakMap();
function hasParseError(n) {
  if (!n) return false;
  if (errCache.has(n)) return errCache.get(n);
  const r = !!cf.findFirst(n, (x) => x.type === 'ErrorStmt' || x.type === 'ErrorExpr' || x.type === 'ErrorDecl');
  errCache.set(n, r);
  return r;
}

module.exports = {
  cf, T, M, index, nodes, skip, strip, isVoidType,
  callName, calleeQualifier, isMemberCall, isLib, isStdCall, libCalls, memberCalls, arg, strLit, isNullConst, constInt,
  src, key, idSym, refersTo, enclosingFn, functions, stmtOf, following, preceding, inCondition,
  resultUse, symChecked, resultChecked, canon, typeName, isStdType, declTypeName, tstr, parent, pkey,
  fnName, loopOf, idsIn, callsIn, libCallsIn, calleeDef, reachableDefs, fnFromExpr, isInUserFile, hasParseError,
};
