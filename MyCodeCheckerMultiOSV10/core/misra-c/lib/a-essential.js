'use strict';

// Essential type helpers for MISRA C chapter 10 (and 12.2).

const U = require('./a-util');

const NUMERIC = new Set(['signed', 'unsigned', 'floating']);
const INTEGER = new Set(['signed', 'unsigned']);

// Composite operators: multiplicative, additive, bitwise &|^, shifts, and ?:
// when either result operand is composite. Constant expressions are not composite.
const COMPOSITE_OPS = new Set(['*', '/', '%', '+', '-', '<<', '>>', '&', '|', '^']);
function isComposite(unit, e) {
  const x = U.skip(e);
  if (!x) return false;
  if (x.type === 'BinaryExpr' && COMPOSITE_OPS.has(x.op)) return U.iceValue(unit, x) == null;
  if (x.type === 'ConditionalExpr') {
    if (U.iceValue(unit, x) != null) return false;
    return isComposite(unit, x.consequent) || isComposite(unit, x.alternate);
  }
  return false;
}

// Operators that perform the usual arithmetic conversions (binary forms).
const UAC_OPS = new Set(['*', '/', '%', '+', '-', '<', '>', '<=', '>=', '==', '!=', '&', '|', '^']);
// compound assignment -> binary operator
function binOf(op) { return op && op.length > 1 && op.endsWith('=') && !['==', '!=', '<=', '>='].includes(op) ? op.slice(0, -1) : null; }

// Every operator application with usual arithmetic conversions:
// [{ node, op, left, right, compound }]
function uacApplications(unit) {
  const out = [];
  for (const b of U.nodes(unit, 'BinaryExpr')) if (UAC_OPS.has(b.op)) out.push({ node: b, op: b.op, left: b.left, right: b.right, compound: false });
  for (const a of U.nodes(unit, 'AssignExpr')) {
    const op = binOf(a.op);
    if (op && UAC_OPS.has(op)) out.push({ node: a, op, left: a.left, right: a.right, compound: true });
  }
  for (const c of U.nodes(unit, 'ConditionalExpr')) {
    if (c.consequent) out.push({ node: c, op: '?:', left: c.consequent, right: c.alternate, compound: false });
  }
  return out;
}

function isPointerOperand(e) {
  const t = U.canon(e && e.ctype);
  return !!t && (t.kind === 'pointer' || t.kind === 'array' || t.kind === 'function');
}

function sameEssential(A, B) {
  if (A.category !== B.category) return false;
  if (A.category === 'enum') return (A.enumName || '') === (B.enumName || '');
  return true;
}

module.exports = { NUMERIC, INTEGER, isComposite, uacApplications, binOf, isPointerOperand, sameEssential, UAC_OPS };
