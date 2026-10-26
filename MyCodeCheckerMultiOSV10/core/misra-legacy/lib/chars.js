'use strict';

// Plain char vs signed/unsigned char use (MISRA C:2004 6.1/6.2, C++:2008 5-0-11/5-0-12).

const U = require('./util');
const UT = require('./underlying');

const { T, M } = U;

const ALLOWED_PLAIN = new Set(['=', '==', '!=']);

function plainCharType(t) {
  const c = t && U.canon(T.nonRef(t));
  return !!c && c.kind === 'int' && c.name === 'char';
}
function numericCharType(t) {
  const c = t && U.canon(T.nonRef(t));
  return !!c && c.kind === 'int' && (c.name === 'signed char' || c.name === 'unsigned char');
}
const isCharLit = (e) => { const x = U.strip(e); return !!x && x.type === 'CharLiteral' && !x.prefix; };

function sites(unit) {
  if (unit.lang === 'cpp') return U.C.conversions(unit).map((s) => ({ value: s.src, to: s.dst }));
  return U.A.conversionSites(unit).map((s) => ({ value: s.value, to: s.to }));
}

// plain char used for numeric values
function plainCharMisuse(unit, api) {
  for (const s of sites(unit)) {
    if (!plainCharType(s.to) || !s.value) continue;
    const v = U.strip(s.value);
    if (isCharLit(v) || plainCharType(v.ctype)) continue;
    const u = UT.ut(unit, v);
    if (u.kind === 'int' || u.kind === 'float') api.report(s.value, M(`The numeric value '${U.code(unit, s.value)}' is stored in a plain char.`, `숫자 값 '${U.code(unit, s.value)}'를 일반 char에 저장했습니다.`));
  }
  const operand = (n, op, o) => {
    if (!o || !plainCharType(o.ctype)) return;
    if (U.strip(o).type === 'CharLiteral') return;
    api.report(n, M(`The plain char operand '${U.code(unit, o)}' is used with '${op}'.`, `일반 char 피연산자 '${U.code(unit, o)}'를 '${op}'와 함께 사용했습니다.`));
  };
  for (const b of U.get(unit, 'BinaryExpr')) {
    if (ALLOWED_PLAIN.has(b.op) || b.op === ',' || b.op === '&&' || b.op === '||') continue;
    operand(b, b.op, b.left); operand(b, b.op, b.right);
  }
  for (const a of U.get(unit, 'AssignExpr')) if (a.op !== '=') { operand(a, a.op, a.left); operand(a, a.op, a.right); }
  for (const n of U.get(unit, 'UnaryExpr')) if (['-', '+', '~', '++', '--'].includes(n.op)) operand(n, n.op, n.arg);
}

// signed/unsigned char used for character values
function numericCharMisuse(unit, api) {
  for (const s of sites(unit)) {
    if (!numericCharType(s.to) || !s.value) continue;
    const v = U.strip(s.value);
    if (isCharLit(v) || plainCharType(v.ctype)) api.report(s.value, M(`The character value '${U.code(unit, s.value)}' is stored in a signed or unsigned char.`, `문자 값 '${U.code(unit, s.value)}'를 signed 또는 unsigned char에 저장했습니다.`));
  }
}

module.exports = { plainCharType, numericCharType, plainCharMisuse, numericCharMisuse };
