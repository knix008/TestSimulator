'use strict';

// Small helpers shared by the rule files.

const A = require('../ast');

function classMethods(cls) {
  return cls ? cls.members.filter((m) => m.k === 'Method') : [];
}

function findMethod(cls, name, argc) {
  return classMethods(cls).find((m) => m.name === name && (argc === undefined || (m.params || []).length === argc)) || null;
}

function classFields(cls) {
  const out = [];
  if (!cls) return out;
  for (const m of cls.members) if (m.k === 'Field') for (const v of m.vars) out.push({ name: v.name, field: m, v });
  for (const p of cls.params || []) if (p.prop || cls.kind === 'record') out.push({ name: p.name, param: p, field: null });
  return out;
}

function isStatic(m) {
  return !!(m && m.mods && (m.mods.has('static') || m.mods.has('const')));
}

function isFinal(m) {
  return !!(m && m.mods && m.mods.has('final'));
}

function isPrivate(m) {
  return !!(m && m.mods && m.mods.has('private'));
}

function isPublic(m, cls) {
  if (!m) return false;
  if (m.mods && m.mods.has('public')) return true;
  if (m.lang === 'kt' || (cls && cls.lang === 'kt')) return !(m.mods && (m.mods.has('private') || m.mods.has('protected') || m.mods.has('internal')));
  return !!(cls && cls.kind === 'interface');
}

function inSync(cx) {
  const m = cx.method;
  if (m && m.mods && m.mods.has('synchronized')) return true;
  if (m && A.hasAnno(m, 'Synchronized')) return true;
  for (let i = cx.stack.length - 2; i >= 0; i--) {
    const x = cx.stack[i];
    if (x.k === 'Sync') return true;
    if (x.k === 'Method' || x.k === 'Lambda' || x.k === 'Class') return false;
    if (x.k === 'Call' && x.id === 'synchronized' && x.trailing) return true;
  }
  return false;
}

function inLoopWithin(cx) {
  for (let i = cx.stack.length - 2; i >= 0; i--) {
    const x = cx.stack[i];
    if (x.k === 'While' || x.k === 'Do' || x.k === 'For' || x.k === 'ForEach') return x;
    if (x.k === 'Method' || x.k === 'Lambda' || x.k === 'Class') return null;
  }
  return null;
}

// Expression of an expression statement (ExprStmt / Kotlin statement forms).
function stmtExpr(s) {
  return s && s.k === 'ExprStmt' ? A.strip(s.e) : null;
}

function noNested(n, fn) {
  A.forEach(n, fn, { noLambda: true, noClass: true });
}

function findIn(n, pred) {
  return A.find(n, pred, { noLambda: true, noClass: true });
}

function isTypeName(t, names) {
  if (!t) return false;
  const s = t.replace(/\?$/, '');
  return names.includes(s);
}

// receiver type (simple) of a call
function recvType(cx, call) {
  return call && call.o ? cx.typeOf(call.o) : null;
}

function superNames(cx, cls) {
  const names = new Set();
  if (!cls) return names;
  if (cls.ext) names.add(A.typeName(cls.ext));
  for (const t of cls.impls || []) names.add(A.typeName(t));
  const info = cx.proj.infoOf(cls);
  if (info) for (const n of cx.proj.allSuperNames(info)) names.add(n);
  return names;
}

function implementsAny(cx, cls, names) {
  const s = superNames(cx, cls);
  return names.some((n) => s.has(n));
}

function stringish(cx, e) {
  e = A.strip(e);
  if (!e) return false;
  if (A.isStrLit(e) || e.k === 'Tmpl') return true;
  return cx.typeOf(e) === 'String';
}

function isOverride(m) {
  return !!(m && (A.hasAnno(m, 'Override') || (m.mods && m.mods.has('override'))));
}

function lineText(cx, line) {
  if (!cx.lines) cx.lines = cx.src.split('\n');
  return cx.lines[line - 1] || '';
}

function argCount(call) {
  return call && call.args ? call.args.filter((a) => a.k !== 'Lambda' || !a.trailing).length : 0;
}

module.exports = {
  classMethods, findMethod, classFields, isStatic, isFinal, isPrivate, isPublic, inSync, inLoopWithin, stmtExpr, noNested, findIn,
  isTypeName, recvType, superNames, implementsAny, stringish, isOverride, lineText, argCount,
};
