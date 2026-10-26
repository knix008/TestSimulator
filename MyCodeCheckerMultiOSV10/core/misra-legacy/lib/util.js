'use strict';

// Small helpers shared by the legacy MISRA rule modules. Most of them come
// from the MISRA C:2012 / C++:2023 packs (read-only reuse).

const A = require('../../misra-c/lib/a-util');
const B = require('../../misra-c/lib/b-common');
const P = require('../../misra-cpp/lib/util');
const C = require('../../misra-cpp/lib/conv');

const cf = A.cf;
const T = cf.types;
const M = (en, ko) => ({ en, ko });

const isBuiltin = (file) => typeof file !== 'string' || file.startsWith('<');
const user = (n) => !!(n && n.loc && n.loc.file && !isBuiltin(n.loc.file));

// node index of user code: get(type...) -> Node[]
const ix = (unit) => P.ix(unit);
const get = (unit, ...types) => P.ix(unit).get(...types);
const memo = P.memo;
const strip = (e) => P.strip(e);
const canon = (t) => (t ? T.canonical(t) : null);
const nonRef = (t) => (t ? T.nonRef(t) : null);
const code = (unit, n, max = 40) => A.code(unit, n, max);
const funcs = (unit) => P.ix(unit).funcs;

function iceValue(unit, e) {
  if (!e) return null;
  try {
    const r = T.constValue(e, { target: unit.target, allowConstVars: unit.lang === 'cpp' });
    return r && !r.float && !r.invalid && typeof r.value === 'bigint' ? r.value : null;
  } catch (_) { return null; }
}
const isConst = (unit, e) => iceValue(unit, e) != null || isFloatConst(unit, e);
function isFloatConst(unit, e) {
  try {
    const r = T.constValue(e, { target: unit.target, allowFloat: true });
    return !!(r && r.float);
  } catch (_) { return false; }
}

function tstr(t) { try { return t ? T.typeToString(t) : '?'; } catch (_) { return '?'; } }

// true the first time a rule scans `file` within one project analysis
const ONCE = new WeakMap();
function firstScan(api, id, file) {
  const p = api && api.project;
  if (!p || typeof p !== 'object') return true;
  let s = ONCE.get(p);
  if (!s) ONCE.set(p, (s = new Set()));
  const k = `${id}|${file}`;
  if (s.has(k)) return false;
  s.add(k);
  return true;
}

// [file, LexResult] of every user source file of the unit, each scanned once per rule
function sourcesOnce(unit, api, id) {
  return A.userSources(unit).filter(([f]) => firstScan(api, id, f));
}

// Call name (plain identifier or std::name), or null.
function calleeName(call) {
  const c = strip(call && call.callee);
  if (!c) return null;
  if (c.type === 'Identifier') {
    if (c.qualifier && c.qualifier !== 'std' && c.qualifier !== '::') return null;
    return c.name;
  }
  return null;
}

// Call to a library function (not a project function of the same name).
function isLibCall(call, names) {
  const n = calleeName(call);
  if (!n || !names.has(n)) return null;
  const s = call.calleeSymbol || (strip(call.callee) && strip(call.callee).symbol);
  if (s && !s.system && !s.implicit && (s.decls || []).some((d) => user(d))) return null;
  return n;
}

const sideEffects = (e, unit, o) => B.sideEffects(e, unit, o);

function enclosingFn(n) { return cf.enclosing(n, ['FunctionDecl', 'LambdaExpr']); }

module.exports = {
  A, B, P, C, cf, T, M, isBuiltin, user, ix, get, memo, strip, canon, nonRef, code, funcs, iceValue, isConst,
  isFloatConst, tstr, firstScan, sourcesOnce, calleeName, isLibCall, sideEffects, enclosingFn,
};
