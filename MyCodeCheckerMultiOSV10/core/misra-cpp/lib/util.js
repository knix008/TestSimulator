'use strict';

// Shared helpers for the MISRA C++:2023 rules. Everything is computed once
// per unit and cached (the rules run over the same index), so ~180 rules cost
// about one AST walk.

const cf = require('../../cfamily');
const T = cf.types;

const isBuiltin = (file) => typeof file === 'string' && file.startsWith('<');
const user = (n) => !!(n && n.loc && n.loc.file && !isBuiltin(n.loc.file));

// ------------------------------------------------------------------ index

const INDEX = new WeakMap();

function ix(unit) {
  let x = INDEX.get(unit);
  if (x) return x;
  const by = new Map();
  const add = (n) => {
    let l = by.get(n.type);
    if (!l) by.set(n.type, (l = []));
    l.push(n);
  };
  cf.walk(unit.ast, (n) => { if (user(n)) add(n); });
  x = {
    by,
    get(...types) {
      if (types.length === 1) return by.get(types[0]) || [];
      const out = [];
      for (const t of types) for (const n of by.get(t) || []) out.push(n);
      return out;
    },
  };
  x.funcs = x.get('FunctionDecl').filter((f) => f.body);
  x.records = x.get('RecordDecl').filter((r) => r.isDefinition && r.members);
  INDEX.set(unit, x);
  return x;
}

const MEMO = new WeakMap();
// Per-unit memo of arbitrary derived data: memo(unit, 'name', () => value)
function memo(unit, name, fn) {
  let m = MEMO.get(unit);
  if (!m) MEMO.set(unit, (m = new Map()));
  if (!m.has(name)) m.set(name, fn());
  return m.get(name);
}

// ------------------------------------------------------------------ types

const canon = (t) => (t ? T.canonical(t) : T.T.unknown);
const nonRef = (t) => (t ? T.nonRef(t) : T.T.unknown);
const unknownT = (t) => !t || T.isUnknown(t) || nonRef(t).kind === 'closure' || nonRef(t).kind === 'initList';
const tstr = (t) => { try { return T.typeToString(t); } catch (e) { return '?'; } };

const CHAR_NAMES = new Set(['char', 'wchar_t', 'char8_t', 'char16_t', 'char32_t']);

// MISRA C++ numeric classification of a (possibly reference/typedef) type:
// 'bool' | 'char' | 'signed' | 'unsigned' | 'float' | 'enum' | 'scopedEnum' | 'pointer' | 'record' | null
function numCat(t, target) {
  if (!t) return null;
  const c = nonRef(t);
  switch (c.kind) {
    case 'int':
      if (c.name === 'bool') return 'bool';
      if (CHAR_NAMES.has(c.name)) return 'char';
      return T.isSigned(c, target) ? 'signed' : 'unsigned';
    case 'float': return 'float';
    case 'enum': return c.scoped ? 'scopedEnum' : 'enum';
    case 'pointer': case 'nullptr': return 'pointer';
    case 'record': return 'record';
    default: return null;
  }
}
const isIntegralCat = (c) => c === 'signed' || c === 'unsigned';
const isNumericCat = (c) => c === 'signed' || c === 'unsigned' || c === 'float';

function sizeOf(t, target) { try { return T.sizeOf(nonRef(t), target); } catch (e) { return null; } }

function recordOf(t) {
  if (!t) return null;
  let c = nonRef(t);
  if (c.kind === 'pointer') c = canon(c.to);
  return c.kind === 'record' ? c : null;
}

function pointee(t) {
  const c = nonRef(t);
  if (c.kind === 'pointer') return c.to;
  if (c.kind === 'array') return c.of;
  return null;
}

function isFnPtr(t) {
  const c = nonRef(t);
  if (c.kind === 'function') return true;
  return c.kind === 'pointer' && canon(c.to).kind === 'function';
}

// Pointer depth of a type (through typedefs and arrays).
function ptrDepth(t) {
  let n = 0;
  let c = canon(t);
  for (let i = 0; i < 20 && c; i++) {
    if (c.kind === 'pointer') { n++; c = canon(c.to); } else if (c.kind === 'array') c = canon(c.of);
    else if (c.kind === 'reference') c = canon(c.to);
    else break;
  }
  return n;
}

// Signed/unsigned integral constant value of an expression, or null.
function constInt(e, unit, allowConstVars = true) {
  if (!e) return null;
  try {
    const r = T.constValue(e, { target: unit && unit.target, allowConstVars });
    if (r && typeof r.value === 'bigint' && !r.invalid) return r;
  } catch (err) { /* not constant */ }
  return null;
}

function constAny(e, unit) {
  if (!e) return null;
  try {
    const r = T.constValue(e, { target: unit && unit.target, allowConstVars: true, allowFloat: true });
    if (r && !r.invalid) return r;
  } catch (err) { /* not constant */ }
  return null;
}

// ------------------------------------------------------------------ AST

const strip = (e) => {
  while (e && e.type === 'ParenExpr') e = e.expr;
  return e;
};

function parent(n) { return cf.parentOf(n); }

// Nearest non-paren parent and the child we came from.
function upParens(n) {
  let c = n;
  let p = parent(c);
  while (p && p.type === 'ParenExpr') { c = p; p = parent(p); }
  return { p, c, key: cf.parentKey(c) };
}

function fnOf(n) { return cf.enclosing(n, ['FunctionDecl', 'LambdaExpr']); }

// Root variable symbol of an lvalue-ish expression: a, a.b, a[i], *a, a->b.
function rootIdent(e) {
  e = strip(e);
  for (let i = 0; i < 30 && e; i++) {
    if (e.type === 'Identifier') return e;
    if (e.type === 'MemberExpr') e = strip(e.object);
    else if (e.type === 'IndexExpr') e = strip(e.object);
    else if (e.type === 'UnaryExpr' && (e.op === '*' || e.op === '&')) e = strip(e.arg);
    else if (e.type === 'CastExpr') e = strip(e.arg);
    else return null;
  }
  return null;
}

function attrNames(n) {
  const out = [];
  const push = (l) => { for (const a of l || []) if (a && a.name) out.push(a.name); };
  if (!n) return out;
  push(n.attributes);
  if (n.specs) push(n.specs.attributes);
  if (n.declarator) {
    const d = cf.directFunction ? cf.directFunction(n.declarator) : null;
    if (d) push(d.attributes);
    const leaf = cf.declLeaf ? cf.declLeaf(n.declarator) : null;
    if (leaf) push(leaf.attributes);
  }
  const p = parent(n);
  if (p && p.type === 'Declaration') { push(p.specs && p.specs.attributes); push(p.attributes); }
  return out;
}

function specsOf(n) {
  if (!n) return null;
  if (n.specs) return n.specs;
  const p = parent(n);
  return p && p.specs ? p.specs : null;
}

function fdecl(fd) { return fd && fd.declarator ? cf.directFunction(fd.declarator) : null; }

function isVirtualDecl(fd) {
  const s = specsOf(fd);
  return !!(s && s.functionSpecs && s.functionSpecs.includes('virtual'));
}

// Called name of a call: { name, qname, member, object, node }
function callName(call) {
  const c = strip(call.callee);
  if (!c) return null;
  if (c.type === 'Identifier') {
    const q = (c.qname || c.name || '').replace(/^::/, '');
    return { name: c.name, qname: q, qualifier: c.qualifier || '', member: false, object: null, node: c };
  }
  if (c.type === 'MemberExpr') return { name: c.member, qname: c.member, qualifier: c.qualifier || '', member: true, object: c.object, node: c, arrow: c.arrow };
  return null;
}

// Plain call to a C/C++ library function `name` (unqualified, ::name or std::name).
function isLibCall(call, names) {
  const cn = callName(call);
  if (!cn || cn.member) return null;
  if (cn.qualifier && cn.qualifier !== 'std') return null;
  if (!names.has(cn.name)) return null;
  // A user function of the same name declared in the project is not the library one.
  const s = call.calleeSymbol || cn.node.symbol;
  if (s && !s.system && s.decls && s.decls.some((d) => user(d)) && !cn.qualifier) return null;
  return cn.name;
}

// Statements "used as a value": parent context of an expression.
function isDiscarded(e) {
  const { p, key } = upParens(e);
  if (!p) return false;
  if (p.type === 'ExprStmt') return true;
  if (p.type === 'ForStmt' && key === 'inc') return true;
  if (p.type === 'BinaryExpr' && p.op === ',' && key === 'left') return true;
  if (p.type === 'BinaryExpr' && p.op === ',' && key === 'right') return isDiscarded(p);
  return false;
}

// Enclosing class (RecordDecl) of a member function definition, inline or out-of-line.
function ownerRecord(unit, fd) {
  const rd = cf.enclosing(fd, 'RecordDecl');
  if (rd && rd.ctype) {
    // direct member (not a local class function nested deeper)
    const f2 = cf.enclosing(fd, ['FunctionDecl', 'LambdaExpr']);
    if (!f2 || cf.ancestors(rd).includes(f2)) return canon(rd.ctype);
  }
  if (fd.qualifier) {
    let s = null;
    try { s = unit.lookupQualified(fd.qualifier, fd.symbol && fd.symbol.scope ? fd.symbol.scope : undefined); } catch (e) { s = null; }
    if (!s) try { s = unit.lookup(fd.qualifier.split('::').pop()); } catch (e) { s = null; }
    if (s && s.type && canon(s.type).kind === 'record') return canon(s.type);
  }
  if (fd.symbol && fd.symbol.record) {
    const r = fd.symbol.record;
    if (r.kind === 'record') return r;
    if (r.ctype) return canon(r.ctype);
  }
  return null;
}

// Member declarations of a record: [{ node, decl, access }]
function members(rec) {
  const out = [];
  const rd = rec && rec.decl;
  if (!rd || !rd.members) return out;
  let access = rd.tag === 'class' ? 'private' : 'public';
  for (const m of rd.members) {
    if (m.type === 'AccessSpec') { access = m.access; continue; }
    if (m.type === 'Declaration') {
      for (const d of m.declarators) out.push({ node: d, decl: m, access: m.access || access });
    } else if (m.type === 'TemplateDecl') {
      let inner = m.decl;
      if (inner && inner.type === 'Declaration') for (const d of inner.declarators) out.push({ node: d, decl: inner, access: inner.access || access, template: true });
    } else if (m.type === 'UsingDecl') out.push({ node: m, decl: m, access });
  }
  return out;
}

function methods(rec) { return members(rec).filter((m) => m.node.type === 'FunctionDecl'); }
function fields(rec) {
  return members(rec).filter((m) => m.node.type === 'FieldDecl' && !(m.decl.specs && m.decl.specs.storage.includes('static')));
}

// Direct bases: [{ rec, virtual, access, spec }]
function bases(rec) {
  const out = [];
  const rd = rec && rec.decl;
  if (!rd || !rd.bases) return out;
  for (const b of rd.bases) {
    const r = b.ctype ? canon(b.ctype) : null;
    out.push({ rec: r && r.kind === 'record' ? r : null, virtual: !!b.virtual, access: b.access || (rd.tag === 'class' ? 'private' : 'public'), spec: b });
  }
  return out;
}

// Every base reachable from rec (excluding rec): Map<rec, {virtualPaths, nonVirtualPaths}>
function allBases(rec, out = new Map(), viaVirtual = false, depth = 0) {
  if (depth > 20) return out;
  for (const b of bases(rec)) {
    if (!b.rec) continue;
    let e = out.get(b.rec);
    if (!e) out.set(b.rec, (e = { virtualPaths: 0, nonVirtualPaths: 0, spec: b.spec }));
    if (b.virtual) e.virtualPaths++; else e.nonVirtualPaths++;
    allBases(b.rec, out, viaVirtual || b.virtual, depth + 1);
  }
  return out;
}

const paramCount = (fd) => (fd.params || []).filter((p) => !(p.ctype && canon(p.ctype).kind === 'void' && !p.name)).length;
const isConstMethod = (fd) => { const d = fdecl(fd); return !!(d && d.quals && d.quals.includes('const')); };

// Base-class virtual function overridden by `fd` (same name and arity), or null.
function overridden(rec, fd, seen = new Set()) {
  for (const b of bases(rec)) {
    if (!b.rec || seen.has(b.rec)) continue;
    seen.add(b.rec);
    for (const m of methods(b.rec)) {
      const f = m.node;
      if (f.name === fd.name && paramCount(f) === paramCount(fd) && (isVirtualDecl(f) || f.isOverride || f.isFinal || (f.symbol && f.symbol.isVirtual))) return f;
    }
    const deeper = overridden(b.rec, fd, seen);
    if (deeper) return deeper;
  }
  return null;
}

function isPolymorphic(rec, depth = 0) {
  if (!rec || depth > 20) return false;
  for (const m of methods(rec)) if (isVirtualDecl(m.node) || m.node.isOverride || m.node.isFinal || m.node.isPure) return true;
  for (const b of bases(rec)) if (b.virtual || isPolymorphic(b.rec, depth + 1)) return true;
  return false;
}

// Special member classification of a member FunctionDecl inside class `cls` (name).
function specialKind(fd, clsName) {
  const n = fd.name || '';
  const ps = fd.params || [];
  const base = clsName ? clsName.split('::').pop() : null;
  const pType = (p) => (p && p.ctype ? p.ctype : null);
  const isSelfRef = (p, rvalue) => {
    const t = pType(p);
    if (!t || t.kind !== 'reference' || !!t.rvalue !== rvalue) return false;
    const r = canon(t.to);
    if (r.kind === 'record') return !base || r.name === base || (r.name || '').split('::').pop() === base;
    // Front-end quirk: inside the class, after a constructor is declared the
    // class name can resolve to the constructor, leaving a non-record type.
    const ts = p.specs && p.specs.typeSpec;
    return !!(base && ts && ts.type === 'NamedType' && (ts.name === base) && !ts.templateArgs);
  };
  if (fd.isDestructor || n.startsWith('~')) return 'dtor';
  if (fd.isConstructor || (base && n === base)) {
    if (ps.length >= 1 && ps.slice(1).every((p) => p.default)) {
      if (isSelfRef(ps[0], false)) return 'copyCtor';
      if (isSelfRef(ps[0], true)) return 'moveCtor';
    }
    return 'ctor';
  }
  if (n === 'operator=' && ps.length === 1) {
    if (isSelfRef(ps[0], false)) return 'copyAssign';
    if (isSelfRef(ps[0], true)) return 'moveAssign';
    const t = canon(pType(ps[0]) || T.T.unknown);
    if (t.kind === 'record' && (!base || t.name === base)) return 'copyAssign'; // by-value (copy-and-swap)
    const ts0 = ps[0].specs && ps[0].specs.typeSpec;
    if (base && t.kind !== 'reference' && t.kind !== 'pointer' && ts0 && ts0.type === 'NamedType' && ts0.name === base && !ts0.templateArgs && ps[0].declarator && ps[0].declarator.type !== 'PointerDeclarator' && ps[0].declarator.type !== 'ReferenceDeclarator') return 'copyAssign';
  }
  return null;
}

// Variables / parameters with the given symbol used inside node.
function usesIn(node, sym) {
  const out = [];
  if (!node || !sym) return out;
  cf.walk(node, (n) => { if (n.type === 'Identifier' && n.symbol === sym) out.push(n); });
  return out;
}

// Whether an Identifier occurrence is written (assigned, ++/--, address taken or bound to non-const ref).
function writeKind(id) {
  const { p, c, key } = upParens(id);
  if (!p) return null;
  if (p.type === 'AssignExpr' && key === 'left') return p.op === '=' ? 'assign' : 'compound';
  if (p.type === 'UnaryExpr' && (p.op === '++' || p.op === '--')) return 'incdec';
  if (p.type === 'UnaryExpr' && p.op === '&') return 'address';
  void c;
  return null;
}

// Lines of a function body for rough ordering; loc start offsets.
const pos = (n) => (n && n.loc ? n.loc.start : 0);

function sameFile(a, b) { return a && b && a.loc && b.loc && a.loc.file === b.loc.file; }

// Names of the standard functions a unit includes from built-in headers.
function locOfToken(t) { return { file: t.file, line: t.line, col: t.col }; }

function isHeaderFile(f) { return cf.isHeader(f); }

// Symbols (and their qualified names) referenced anywhere in the unit's user code.
function usedSyms(unit) {
  return memo(unit, 'usedSyms', () => {
    const syms = new Set();
    const qnames = new Set();
    const add = (s) => {
      if (!s) return;
      syms.add(s);
      if (s.qname) qnames.add(s.qname);
      if (s.overloadOf) { syms.add(s.overloadOf); if (s.overloadOf.qname) qnames.add(s.overloadOf.qname); }
    };
    const x = ix(unit);
    for (const n of x.get('Identifier')) add(n.symbol);
    for (const n of x.get('MemberExpr')) add(n.memberSymbol);
    for (const n of x.get('CallExpr')) add(n.calleeSymbol);
    for (const n of x.get('NamedType')) add(n.symbol);
    for (const n of x.get('LambdaCapture')) add(n.symbol);
    for (const n of x.get('Designator')) add(n.field);
    for (const n of x.get('BaseSpecifier')) if (n.ctype && n.ctype.decl && n.ctype.decl.symbol) add(n.ctype.decl.symbol);
    for (const n of x.get('UsingDecl')) qnames.add((n.qname || '').replace(/^::/, ''));
    return { syms, qnames };
  });
}

module.exports = {
  usedSyms,
  cf, T, user, isBuiltin, ix, memo,
  canon, nonRef, unknownT, tstr, numCat, isIntegralCat, isNumericCat, sizeOf, recordOf, pointee, isFnPtr, ptrDepth,
  constInt, constAny,
  strip, parent, upParens, fnOf, rootIdent, attrNames, specsOf, fdecl, isVirtualDecl, callName, isLibCall, isDiscarded,
  ownerRecord, members, methods, fields, bases, allBases, paramCount, isConstMethod, overridden, isPolymorphic, specialKind,
  usesIn, writeKind, pos, sameFile, locOfToken, isHeaderFile, CHAR_NAMES,
};
