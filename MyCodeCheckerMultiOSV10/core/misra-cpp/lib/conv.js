'use strict';

// Implicit conversion sites ("assignment-like" contexts) for chapter 7:
// assignment, initialisation, argument passing and return.

const U = require('./util');

function fnTypeOfCallee(call) {
  let t = null;
  if (call.calleeSymbol && call.calleeSymbol.type) t = call.calleeSymbol.type;
  else if (call.callee && call.callee.ctype) t = call.callee.ctype;
  if (!t) return null;
  let c = U.canon(t);
  if (c.kind === 'pointer') c = U.canon(c.to);
  if (c.kind === 'reference') c = U.canon(c.to);
  return c.kind === 'function' ? c : null;
}

// C++ <cmath> overloads the math functions for float and long double, but the
// front end only declares the double versions: a call such as std::cos(f)
// with a float argument is typed double here although it is float. Such
// calls make the operand types of the surrounding expression unreliable.
const MATH = new Set(['acos', 'asin', 'atan', 'atan2', 'cos', 'sin', 'tan', 'acosh', 'asinh', 'atanh', 'cosh', 'sinh', 'tanh',
  'exp', 'exp2', 'expm1', 'frexp', 'ldexp', 'log', 'log10', 'log1p', 'log2', 'logb', 'modf', 'scalbn', 'scalbln', 'ilogb',
  'pow', 'sqrt', 'cbrt', 'hypot', 'erf', 'erfc', 'tgamma', 'lgamma', 'ceil', 'floor', 'fmod', 'trunc', 'round', 'lround',
  'llround', 'nearbyint', 'rint', 'lrint', 'llrint', 'remainder', 'remquo', 'copysign', 'nextafter', 'nexttoward', 'fdim',
  'fmax', 'fmin', 'fma', 'fabs', 'abs']);
function mathOverload(call) {
  const cn = U.callName(call);
  if (!cn || cn.member || (cn.qualifier && cn.qualifier !== 'std') || !MATH.has(cn.name)) return false;
  const s = call.calleeSymbol || cn.node.symbol;
  if (s && !s.system) return false; // a project function of that name
  return (call.args || []).some((a) => {
    const c = a && a.ctype ? U.nonRef(a.ctype) : null;
    return !!(c && c.kind === 'float' && c.name !== 'double');
  });
}
function hasMathOverload(e) {
  if (!e) return false;
  let found = false;
  U.cf.walk(e, (n) => {
    if (n.type === 'LambdaExpr') return U.cf.walk.SKIP;
    if (n.type === 'CallExpr' && mathOverload(n)) { found = true; return U.cf.walk.STOP; }
    return undefined;
  });
  return found;
}

// [{ src: Expr, dst: Type, node, ctx: 'assign'|'init'|'arg'|'return', name }]
function conversions(unit) {
  return U.memo(unit, 'conversions', () => {
    const x = U.ix(unit);
    const out = [];
    for (const a of x.get('AssignExpr')) {
      if (a.op !== '=' || !a.left || !a.left.ctype) continue;
      if (U.recordOf(a.left.ctype) && U.canon(U.nonRef(a.left.ctype)).kind === 'record') continue; // operator=
      out.push({ src: a.right, dst: a.left.ctype, node: a, ctx: 'assign', name: (U.rootIdent(a.left) || {}).name });
    }
    for (const v of x.get('VarDecl', 'FieldDecl')) {
      if (!v.init || !v.ctype) continue;
      let src = v.init;
      if (src.type === 'InitList') { if (src.items.length !== 1) continue; src = src.items[0]; }
      if (src.type === 'ParenListInit') { if (src.args.length !== 1) continue; src = src.args[0]; }
      if (!src || src.type === 'InitList' || src.type === 'DesignatedInit') continue;
      const dt = v.ctype;
      if (U.canon(dt).kind === 'reference' || U.canon(dt).kind === 'record' || U.canon(dt).kind === 'array') continue;
      out.push({ src, dst: dt, node: v, ctx: 'init', name: v.name, brace: v.initStyle === 'brace' });
    }
    for (const c of x.get('CallExpr')) {
      const ft = fnTypeOfCallee(c);
      if (!ft || mathOverload(c)) continue;
      (c.args || []).forEach((arg, i) => {
        const pt = ft.params[i];
        if (!pt || !arg || arg.type === 'InitList' || arg.type === 'PackExpansion') return;
        if (U.canon(pt).kind === 'reference' && !U.canon(U.canon(pt).to).const) return;
        out.push({ src: arg, dst: U.canon(pt).kind === 'reference' ? U.canon(pt).to : pt, node: arg, ctx: 'arg', name: `argument ${i + 1}`, call: c, index: i });
      });
    }
    for (const r of x.get('ReturnStmt')) {
      if (!r.arg || r.arg.type === 'InitList' || !r.functionReturnType) continue;
      const rt = r.functionReturnType;
      if (U.unknownT(rt) || U.canon(rt).kind === 'reference' || U.canon(rt).kind === 'record') continue;
      out.push({ src: r.arg, dst: rt, node: r, ctx: 'return', name: 'return value' });
    }
    return out.filter((c) => !hasMathOverload(c.src));
  });
}

// Type of an expression before integral promotion, as MISRA sees it.
function srcType(e) {
  e = U.strip(e);
  return e ? e.ctype : null;
}

// Expression contexts that require a bool (contextual conversion).
function boolContexts(unit) {
  return U.memo(unit, 'boolContexts', () => {
    const x = U.ix(unit);
    const out = [];
    for (const s of x.get('IfStmt')) if (s.cond && s.cond.type !== 'Declaration') out.push({ e: s.cond, ctx: 'if condition' });
    for (const s of x.get('WhileStmt', 'DoStmt')) if (s.cond && s.cond.type !== 'Declaration') out.push({ e: s.cond, ctx: 'loop condition' });
    for (const s of x.get('ForStmt')) if (s.cond && s.cond.type !== 'Declaration') out.push({ e: s.cond, ctx: 'loop condition' });
    for (const c of x.get('ConditionalExpr')) if (c.test) out.push({ e: c.test, ctx: 'conditional operator' });
    for (const u of x.get('UnaryExpr')) if (u.op === '!') out.push({ e: u.arg, ctx: "operand of '!'" });
    for (const b of x.get('BinaryExpr')) if (b.op === '&&' || b.op === '||') { out.push({ e: b.left, ctx: `operand of '${b.op}'` }); out.push({ e: b.right, ctx: `operand of '${b.op}'` }); }
    return out;
  });
}

const ARITH_OPS = new Set(['+', '-', '*', '/', '%']);
const BIT_OPS = new Set(['&', '|', '^']);
const SHIFT_OPS = new Set(['<<', '>>']);
const REL_OPS = new Set(['<', '>', '<=', '>=']);
const EQ_OPS = new Set(['==', '!=']);
const COMPOUND = { '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%', '&=': '&', '|=': '|', '^=': '^', '<<=': '<<', '>>=': '>>' };

// Binary operations with built-in operands: [{ node, op, l, r }] (compound assignments included).
function binops(unit) {
  return U.memo(unit, 'binops', () => {
    const x = U.ix(unit);
    const out = [];
    const builtin = (e) => {
      const c = U.numCat(e && e.ctype, unit.target);
      return c && c !== 'record';
    };
    for (const b of x.get('BinaryExpr')) {
      if (b.op === ',' || b.op === '&&' || b.op === '||' || b.op === '.*' || b.op === '->*') continue;
      if (!builtin(b.left) || !builtin(b.right) || hasMathOverload(b.left) || hasMathOverload(b.right)) continue;
      out.push({ node: b, op: b.op, l: b.left, r: b.right, compound: false });
    }
    for (const a of x.get('AssignExpr')) {
      const op = COMPOUND[a.op];
      if (!op || !builtin(a.left) || !builtin(a.right) || hasMathOverload(a.right)) continue;
      out.push({ node: a, op, l: a.left, r: a.right, compound: true });
    }
    return out;
  });
}

module.exports = { mathOverload, hasMathOverload, conversions, srcType, boolContexts, binops, fnTypeOfCallee, ARITH_OPS, BIT_OPS, SHIFT_OPS, REL_OPS, EQ_OPS };
