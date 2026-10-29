'use strict';

// "Underlying type" model of MISRA C:2004 (chapters 10 and 12) and MISRA
// C++:2008 (rules 5-0-x). It is close to the essential type of MISRA C:2012:
// integer constants get the smallest type able to hold their value, operators
// keep the larger operand type and integral promotion is ignored. The
// differences: plain char, Boolean and enum operands are not "numeric" here and
// are left to the dedicated rules.
//
// ut(unit, e) -> { kind: 'int'|'float'|'bool'|'char'|'enum'|'other', signed, size, name }
// conversions(unit) -> implicit conversion events
// casts(unit) -> explicit conversion events

const U = require('./util');
const AE = require('../../misra-c/lib/a-essential');

const { cf, T } = U;

function fromEssential(r) {
  if (!r) return { kind: 'other', signed: false, size: 0, name: '?' };
  const name = r.typedefName || r.name || '?';
  switch (r.category) {
    case 'signed': return { kind: 'int', signed: true, size: r.size || 0, name };
    case 'unsigned': return { kind: 'int', signed: false, size: r.size || 0, name };
    case 'floating': return { kind: 'float', signed: true, size: r.size || 0, name };
    case 'boolean': return { kind: 'bool', signed: false, size: r.size || 0, name };
    case 'character': return { kind: 'char', signed: true, size: r.size || 1, name };
    case 'enum': return { kind: 'enum', signed: true, size: r.size || 0, name };
    default: return { kind: 'other', signed: false, size: 0, name };
  }
}

function ut(unit, e) {
  if (U.A.guessedType(unit, e)) return fromEssential(null);
  try { return fromEssential(cf.essentialType(e, { target: unit.target })); } catch (_) { return fromEssential(null); }
}
function utOfType(unit, t) {
  try { return fromEssential(cf.essentialTypeOfType(t, { target: unit.target })); } catch (_) { return fromEssential(null); }
}

const numeric = (u) => u.kind === 'int' || u.kind === 'float';

// "Complex" (C:2004) / "cvalue" (C++:2008) expression: not a constant, not an
// lvalue and not a function result — the result of arithmetic, bitwise and
// shift operators (and ?: over such operands).
function isComplex(unit, e) {
  const x = U.strip(e);
  if (!x) return false;
  if (U.isConst(unit, x)) return false;
  if (AE.isComposite(unit, x)) return true;
  if (x.type === 'UnaryExpr' && (x.op === '-' || x.op === '~' || x.op === '+')) return true;
  return false;
}

function describe(u) {
  if (u.kind === 'int') return `${u.signed ? 'signed' : 'unsigned'} ${u.size * 8}-bit`;
  if (u.kind === 'float') return `${u.size * 8}-bit floating`;
  return u.kind;
}
function describeKo(u) {
  if (u.kind === 'int') return `${u.size * 8}비트 ${u.signed ? '부호 있는' : '부호 없는'} 정수`;
  if (u.kind === 'float') return `${u.size * 8}비트 부동소수점`;
  return u.kind;
}

// Classify the conversion from `from` to `to`:
//   'same' | 'sign' | 'narrow' | 'widen' | 'intFloat' | 'floatInt' | null (not numeric)
function classify(from, to) {
  if (!numeric(from) || !numeric(to) || !from.size || !to.size) return null;
  if (from.kind === 'int' && to.kind === 'float') return 'intFloat';
  if (from.kind === 'float' && to.kind === 'int') return 'floatInt';
  if (from.kind === 'int' && from.signed !== to.signed) return 'sign';
  if (to.size < from.size) return 'narrow';
  if (to.size > from.size) return 'widen';
  return 'same';
}

function flags(from, to) {
  const same = from.kind === to.kind;
  return {
    sign: same && from.kind === 'int' && from.signed !== to.signed,
    narrow: same && to.size < from.size,
    widen: same && to.size > from.size,
  };
}

const BALANCE_OPS = new Set(['+', '-', '*', '/', '%', '&', '|', '^', '<', '>', '<=', '>=', '==', '!=']);
const COMPOUND = new Set(['+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=']);

function pointerish(e) {
  const t = U.canon(e && e.ctype);
  return !!t && (t.kind === 'pointer' || t.kind === 'array' || t.kind === 'function' || t.kind === 'record' || t.kind === 'nullptr');
}

// Implicit conversions: [{ node, value, from, to, kind, ctx: 'assign'|'init'|'arg'|'return'|'balance', complex, constant }]
function conversions(unit) {
  return U.memo(unit, 'legacy.conversions', () => {
    const out = [];
    const push = (node, value, toU, ctx) => {
      if (!value || pointerish(value)) return;
      const from = ut(unit, value);
      const kind = classify(from, toU);
      if (!kind || kind === 'same') return;
      out.push({ node, value, from, to: toU, kind, ...flags(from, toU), ctx, complex: isComplex(unit, value), constant: U.isConst(unit, value) });
    };
    const sites = unit.lang === 'cpp'
      ? U.C.conversions(unit).map((s) => ({ kind: s.ctx, value: s.src, to: s.dst, node: s.node === s.src ? s.src : s.src }))
      : U.A.conversionSites(unit).map((s) => ({ kind: s.kind, value: s.value, to: s.to, node: s.value }));
    for (const s of sites) {
      const tc = U.canon(s.to);
      if (!tc || tc.kind === 'pointer' || tc.kind === 'record' || tc.kind === 'array') continue;
      push(s.value, s.value, utOfType(unit, s.to), s.kind);
    }
    for (const a of U.get(unit, 'AssignExpr')) {
      if (!COMPOUND.has(a.op) || pointerish(a.left)) continue;
      push(a.right, a.right, ut(unit, a.left), 'assign');
    }
    for (const b of U.get(unit, 'BinaryExpr')) {
      if (!BALANCE_OPS.has(b.op) || pointerish(b.left) || pointerish(b.right)) continue;
      const L = ut(unit, b.left);
      const R = ut(unit, b.right);
      if (!numeric(L) || !numeric(R)) continue;
      // the operand that is converted towards the other one
      if (L.kind !== R.kind) {
        if (L.kind === 'int') push(b.left, b.left, R, 'balance'); else push(b.right, b.right, L, 'balance');
      } else if (L.kind === 'int' && L.signed !== R.signed) {
        // the signed operand changes signedness (constants included)
        if (L.signed) push(b.left, b.left, { ...R, size: Math.max(L.size, R.size) }, 'balance');
        else push(b.right, b.right, { ...L, size: Math.max(L.size, R.size) }, 'balance');
      } else if (L.size !== R.size) {
        if (L.size < R.size) push(b.left, b.left, R, 'balance'); else push(b.right, b.right, L, 'balance');
      }
    }
    return out;
  });
}

// Explicit conversions of numeric expressions: [{ node, value, from, to, kind, complex }]
function casts(unit) {
  return U.memo(unit, 'legacy.casts', () => {
    const out = [];
    for (const c of U.get(unit, 'CastExpr')) {
      if (!c.arg || !c.typeName) continue;
      const tt = U.canon(c.typeName.ctype);
      if (!tt || tt.kind === 'void' || tt.kind === 'pointer' || tt.kind === 'record') continue;
      if (pointerish(c.arg)) continue;
      const from = ut(unit, c.arg);
      const to = utOfType(unit, c.typeName.ctype);
      const kind = classify(from, to);
      if (!kind || kind === 'same') continue;
      out.push({ node: c, value: c.arg, from, to, kind, ...flags(from, to), complex: isComplex(unit, c.arg) });
    }
    return out;
  });
}

module.exports = { ut, utOfType, numeric, isComplex, classify, conversions, casts, describe, describeKo };
