'use strict';

// C++ helpers for the MISRA C++:2008 rules (classes, virtual functions, exceptions).

const U = require('./util');
const X = require('../../cert/lib/cppx');

const { cf, T } = U;
const P = U.P;

// Record (canonical) owning a member function, or null.
function ownerOf(unit, fd) {
  try { return P.ownerRecord(unit, fd); } catch (_) { return null; }
}

// Base-class function `fd` overrides, or null.
function overriddenBy(unit, fd) {
  const rec = ownerOf(unit, fd);
  if (!rec || !fd.name || fd.isConstructor || fd.isDestructor) return null;
  try { return P.overridden(rec, fd); } catch (_) { return null; }
}

function isVirtual(unit, fd) {
  if (P.isVirtualDecl(fd) || fd.isOverride || fd.isFinal || fd.isPure) return true;
  if (fd.symbol && fd.symbol.isVirtual) return true;
  // out-of-class definition: look at the in-class declaration
  const s = fd.symbol;
  if (s && (s.decls || []).some((d) => d !== fd && d.type === 'FunctionDecl' && (P.isVirtualDecl(d) || d.isOverride || d.isPure))) return true;
  return !!overriddenBy(unit, fd);
}

const records = (unit) => P.ix(unit).records.map((r) => U.canon(r.ctype)).filter((r) => r && r.kind === 'record');

function isSpecial(fd) {
  return !!(fd.isConstructor || fd.isDestructor || fd.isConversion || (fd.name || '').startsWith('operator') || (fd.name || '').startsWith('~'));
}

// Every throw expression of the unit: [{ node, fn }]
function throws(unit) {
  return U.get(unit, 'ThrowExpr').map((t) => ({ node: t, fn: cf.enclosing(t, ['FunctionDecl', 'LambdaExpr']) }));
}

// Handler of `node` inside its function, if any: the TryStmt whose body contains it.
function enclosingTry(node, fn) {
  let n = node;
  for (let p = cf.parentOf(n); p && p !== fn; n = p, p = cf.parentOf(p)) {
    if (p.type === 'TryStmt' && cf.parentKey(n) === 'body') return p;
    if (p.type === 'CatchClause') return null;
  }
  return null;
}

function inCatch(node) { return !!cf.enclosing(node, 'CatchClause'); }

const recordOf = (t) => X.recordOf(t, true);

// Type name used in a throw spec string ("E , int") -> trimmed names
function throwSpecNames(fd) {
  const d = fd && fd.declarator ? cf.directFunction(fd.declarator) : null;
  if (!d || d.throwSpec == null) return null;
  return String(d.throwSpec).split(',').map((s) => s.trim()).filter(Boolean);
}

function typeName(t) {
  const c = t && T.nonRef(t);
  if (!c) return '?';
  if (c.kind === 'record') return X.bareName(c);
  return U.tstr(c);
}

module.exports = {
  X, ownerOf, overriddenBy, isVirtual, records, isSpecial, throws, enclosingTry, inCatch, recordOf, throwSpecNames, typeName,
};
