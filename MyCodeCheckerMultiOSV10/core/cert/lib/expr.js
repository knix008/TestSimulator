'use strict';

// Expression / declaration helpers for the CERT PRE, DCL, EXP, INT and FLP rules.

const U = require('./util');
const { cf, T } = U;

// ------------------------------------------------------------------- types
function ctypeOf(e) {
  e = U.skip(e);
  return e && e.ctype ? T.nonRef(e.ctype) : null;
}

function isIntType(t) {
  const c = t && T.nonRef(t);
  return !!c && T.isInteger(c);
}

function isFloatType(t) {
  const c = t && T.nonRef(t);
  return !!c && T.isFloating(c);
}

// Record type a pointer / array / object expression designates, or null.
function recordOf(t) {
  let c = t && T.nonRef(t);
  if (!c) return null;
  if (c.kind === 'pointer') c = T.canonical(c.to);
  else if (c.kind === 'array') c = T.canonical(c.of);
  return c && c.kind === 'record' && c.complete !== false ? c : null;
}

// Does the record (recursively) contain padding bits / bytes?
const PAD = new WeakMap();
function hasPadding(rec, target, depth = 0) {
  if (!rec || rec.kind !== 'record' || depth > 8) return false;
  if (PAD.has(rec)) return PAD.get(rec);
  PAD.set(rec, false);
  let res = false;
  try {
    const lay = T.layout(rec, target);
    if (lay && lay.size) {
      if (rec.tag === 'union') {
        const max = Math.max(0, ...lay.fields.map((f) => f.size || 0));
        res = lay.size > max || new Set(lay.fields.map((f) => f.size)).size > 1;
      } else {
        const bits = new Uint8Array(lay.size * 8);
        for (const f of lay.fields) {
          if (f.bitWidth != null) {
            const s = f.offset * 8 + (f.bitOffset || 0);
            for (let i = s; i < s + f.bitWidth && i < bits.length; i++) bits[i] = 1;
          } else {
            for (let i = f.offset * 8; i < (f.offset + (f.size || 0)) * 8 && i < bits.length; i++) bits[i] = 1;
          }
        }
        res = bits.some((b) => !b);
      }
      if (!res) {
        for (const f of rec.fields || []) {
          let ft = T.canonical(f.type);
          while (ft && ft.kind === 'array') ft = T.canonical(ft.of);
          if (ft && ft.kind === 'record' && hasPadding(ft, target, depth + 1)) { res = true; break; }
        }
      }
    }
  } catch (_) {
    res = false;
  }
  PAD.set(rec, res);
  return res;
}

// Does the record (recursively) contain a floating member?
function hasFloat(rec, depth = 0) {
  if (!rec || depth > 8) return false;
  for (const f of rec.fields || []) {
    let ft = T.canonical(f.type);
    while (ft && ft.kind === 'array') ft = T.canonical(ft.of);
    if (!ft) continue;
    if (T.isFloating(ft)) return true;
    if (ft.kind === 'record' && hasFloat(ft, depth + 1)) return true;
  }
  return false;
}

// ----------------------------------------------------------- side effects
const ASSIGN_OPS = new Set(['=', '*=', '/=', '%=', '+=', '-=', '<<=', '>>=', '&=', '^=', '|=']);

// First node with a side effect (assignment, ++/--, call, new/delete/throw) in e.
function sideEffect(e, withCalls = true) {
  if (!e) return null;
  return cf.findFirst(e, (n) => (n.type === 'AssignExpr') ||
    (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--')) ||
    (withCalls && (n.type === 'CallExpr' || n.type === 'NewExpr' || n.type === 'DeleteExpr' || n.type === 'ThrowExpr')));
}

const BOOLISH_OPS = new Set(['==', '!=', '<', '>', '<=', '>=', '&&', '||']);
function isBoolLike(e) {
  e = U.skip(e);
  if (!e) return false;
  if (e.type === 'BinaryExpr' && BOOLISH_OPS.has(e.op)) return true;
  if (e.type === 'UnaryExpr' && e.op === '!') return true;
  if (e.type === 'BoolLiteral') return true;
  const t = ctypeOf(e);
  return !!t && T.isBool(t);
}

function isRelational(e) {
  e = U.skip(e);
  return !!e && ((e.type === 'BinaryExpr' && BOOLISH_OPS.has(e.op)) || (e.type === 'UnaryExpr' && e.op === '!'));
}

// --------------------------------------------------------------- variables
// Automatic local object (not static, not a parameter unless allowParam).
function isAutoLocal(sym, allowParam = true) {
  if (!sym) return false;
  if (sym.kind === 'parameter') return allowParam;
  return sym.kind === 'variable' && sym.storage === 'automatic';
}

function isFileOrStaticVar(sym) {
  return !!sym && sym.kind === 'variable' && (sym.storage === 'static' || sym.storage === 'thread');
}

// Is `id` (an Identifier use) written: assignment target, ++/--, or address taken?
function useKind(id) {
  let n = id;
  let p = U.parent(n);
  while (p && (p.type === 'ParenExpr')) { n = p; p = U.parent(n); }
  if (!p) return 'read';
  if (p.type === 'AssignExpr' && U.pkey(n) === 'left') return p.op === '=' ? 'write' : 'readwrite';
  if (p.type === 'UnaryExpr' && (p.op === '++' || p.op === '--')) return 'readwrite';
  if (p.type === 'UnaryExpr' && p.op === '&') return 'address';
  if (p.type === 'SizeofExpr' || p.type === 'AlignofExpr' || p.type === 'TypeidExpr' || p.type === 'DecltypeType') return 'unevaluated';
  return 'read';
}

// Is the node inside an unevaluated operand (sizeof, _Alignof, decltype)?
function unevaluated(n, stop) {
  let p = U.parent(n);
  while (p && p !== stop) {
    if (p.type === 'SizeofExpr' || p.type === 'AlignofExpr' || p.type === 'DecltypeType' || p.type === 'TypeofType') return true;
    if (p.type === 'FunctionDecl' || p.type === 'LambdaExpr') return false;
    p = U.parent(p);
  }
  return false;
}

// Uses of sym (in source order) that occur inside a subtree.
function usesIn(sym, root) {
  if (!sym || !root || !root.loc) return [];
  const s = root.loc.start, e = root.loc.end, f = root.loc.file;
  return (sym.uses || []).filter((u) => u.type === 'Identifier' && u.loc && u.loc.file === f && u.loc.start >= s && u.loc.end <= e)
    .sort((a, b) => a.loc.start - b.loc.start);
}

// Is sym referenced in a condition (if/while/?:/compare/!) inside fn before `before`?
function checkedBefore(sym, fn, before) {
  if (!sym || !fn) return false;
  for (const u of sym.uses || []) {
    if (!u.loc || !before.loc || u.loc.file !== before.loc.file) continue;
    if (u.loc.start >= before.loc.start) continue;
    if (fn.loc && (u.loc.start < fn.loc.start || u.loc.end > fn.loc.end)) continue;
    if (U.inCondition(u)) return true;
    const p = U.parent(u);
    if (p && p.type === 'CallExpr' && /assert|check|require|verify/i.test(U.callName(p) || '')) return true;
  }
  // assert() is a macro expanding to a conditional: inCondition covers it.
  return false;
}

// Statement kinds treated as straight-line (no control flow inside).
const STRAIGHT = new Set(['ExprStmt', 'Declaration', 'ReturnStmt', 'NullStmt']);

// --------------------------------------------------------------- constants
function constOf(unit, e, allowFloat = false) {
  if (!e) return null;
  try {
    const r = T.constValue(e, { target: unit.target, allowConstVars: true, allowFloat });
    if (!r || r.invalid) return null;
    return r;
  } catch (_) {
    return null;
  }
}

function floatConst(unit, e) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'FloatingLiteral') return e.value;
  if (e.type === 'UnaryExpr' && e.op === '-' ) { const v = floatConst(unit, e.arg); return v == null ? null : -v; }
  if (e.type === 'IntegerLiteral') return Number(e.value);
  const r = constOf(unit, e, true);
  if (r && typeof r.value === 'number') return r.value;
  if (r && typeof r.value === 'bigint') return Number(r.value);
  return null;
}

// Implicit conversion sites: [{ expr, to: Type, node, what }] for VarDecl inits, '=' assignments, returns, call args.
// A function symbol that only exists because of an implicit declaration (or a call
// statement the parser took for an old-style declaration: its first decl is the use).
function implicitFn(sym) {
  return !!sym && sym.kind === 'function' && (sym.implicit || (sym.decls && sym.decls[0] && sym.decls[0].type === 'Identifier'));
}

// Does the unit include headers that could not be found (types and prototypes are then guessed)?
function missingHeaders(unit) {
  return (unit.includes || []).some((i) => i.kind === 'missing');
}

// Expression whose type comes from a call to an implicitly declared function.
function fromImplicit(e) {
  e = U.strip(e);
  if (!e) return false;
  if (e.type === 'ConditionalExpr') return fromImplicit(e.consequent || e.test) || fromImplicit(e.alternate);
  if (e.type === 'BinaryExpr' && ['+', '-', '*', '/', '%', '<<', '>>', '&', '|', '^'].includes(e.op)) return fromImplicit(e.left) || fromImplicit(e.right);
  if (e.type === 'CallExpr') return implicitFn(e.calleeSymbol) || (!e.calleeSymbol && !!e.ctype && T.isUnknown(e.ctype));
  return !!e.ctype && T.isUnknown(T.canonical(e.ctype));
}

function conversions(unit) {
  const out = [];
  for (const d of U.nodes(unit, 'VarDecl')) {
    if (d.init && d.init.type !== 'InitList' && d.init.type !== 'ParenListInit' && d.ctype) out.push({ expr: d.init, to: d.ctype, node: d.init, what: `'${d.name}'`, whatKo: `'${d.name}'` });
  }
  for (const a of U.nodes(unit, 'AssignExpr')) {
    if (a.op === '=' && a.left && a.left.ctype) out.push({ expr: a.right, to: a.left.ctype, node: a.right, what: `'${U.src(unit, a.left)}'`, whatKo: `'${U.src(unit, a.left)}'` });
  }
  for (const r of U.nodes(unit, 'ReturnStmt')) {
    if (r.arg && r.arg.type !== 'InitList' && r.functionReturnType) out.push({ expr: r.arg, to: r.functionReturnType, node: r.arg, what: 'the return value', whatKo: '반환값' });
  }
  const CACHE = out.filter((c) => !fromImplicit(c.expr));
  return CACHE;
}

// Parameter types for a call when the callee has a prototype.
function paramTypes(call) {
  const t = call.callee && call.callee.ctype && T.nonRef(call.callee.ctype);
  let ft = t;
  if (ft && ft.kind === 'pointer') ft = T.canonical(ft.to);
  if (!ft || ft.kind !== 'function') return null;
  return ft;
}

module.exports = {
  ctypeOf, isIntType, isFloatType, recordOf, hasPadding, hasFloat, ASSIGN_OPS, sideEffect, isBoolLike, isRelational,
  isAutoLocal, isFileOrStaticVar, useKind, unevaluated, usesIn, checkedBefore, STRAIGHT, constOf, floatConst,
  conversions, paramTypes, implicitFn, missingHeaders, fromImplicit,
};
