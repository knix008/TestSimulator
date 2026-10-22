'use strict';

// MISRA C:2012 / 2023 chapter 12: expressions.

const U = require('../lib/a-util');
const { cf, T, meta, msg } = U;

const PREC = { '*': 13, '/': 13, '%': 13, '+': 12, '-': 12, '<<': 11, '>>': 11, '<': 10, '>': 10, '<=': 10, '>=': 10, '==': 9, '!=': 9, '&': 8, '^': 7, '|': 6, '&&': 5, '||': 4 };

function r121(unit, api) {
  const flag = (operand, parentOp) => {
    api.report(operand, msg(
      `Operand '${U.code(unit, operand)}' of '${parentOp}' relies on operator precedence; add parentheses.`,
      `'${parentOp}'의 피연산자 '${U.code(unit, operand)}'가 연산자 우선순위에 의존합니다. 괄호를 넣으세요.`));
  };
  for (const b of U.nodes(unit, 'BinaryExpr')) {
    const p = PREC[b.op];
    if (!p) continue;
    for (const side of [b.left, b.right]) {
      if (side && side.type === 'BinaryExpr' && PREC[side.op] && PREC[side.op] !== p) flag(side, b.op);
    }
  }
  for (const c of U.nodes(unit, 'ConditionalExpr')) {
    for (const side of [c.test, c.consequent, c.alternate]) {
      if (side && side.type === 'BinaryExpr' && PREC[side.op]) flag(side, '?:');
    }
  }
  for (const s of U.nodes(unit, 'SizeofExpr')) {
    if (s.arg && !s.typeName && s.arg.type !== 'ParenExpr') {
      api.report(s, msg(`The operand of sizeof in '${U.code(unit, s)}' is not parenthesized.`, `'${U.code(unit, s)}'에서 sizeof의 피연산자에 괄호가 없습니다.`));
    }
  }
}

function r122(unit, api) {
  const test = (node, left, right, op) => {
    const v = U.iceValue(unit, right);
    if (v == null) return;
    const L = U.et(unit, api, left);
    if (!L || L.size == null || (L.category !== 'signed' && L.category !== 'unsigned' && L.category !== 'character')) return;
    const width = L.bitField || L.size * 8;
    if (v >= 0n && v < BigInt(width)) return;
    api.report(right, msg(
      `Shift amount ${v} in '${U.code(unit, node)}' is outside 0..${width - 1} for the ${width}-bit essential type '${U.etName(L)}' of '${U.code(unit, left)}'.`,
      `'${U.code(unit, node)}'의 시프트 크기 ${v}가 '${U.code(unit, left)}'의 ${width}비트 본질 타입 '${U.etName(L)}'의 범위 0..${width - 1}을 벗어납니다.`));
  };
  for (const b of U.nodes(unit, 'BinaryExpr')) if (b.op === '<<' || b.op === '>>') test(b, b.left, b.right, b.op);
  for (const a of U.nodes(unit, 'AssignExpr')) if (a.op === '<<=' || a.op === '>>=') test(a, a.left, a.right, a.op);
}

function r123(unit, api) {
  for (const b of U.nodes(unit, 'BinaryExpr')) {
    if (b.op !== ',') continue;
    const at = b.right && b.right.loc ? { file: b.loc.file, line: b.left.loc.endLine || b.loc.line, col: b.left.loc.endCol || b.loc.col } : b;
    api.report(at.line ? at : b, msg(`Comma operator used in '${U.code(unit, b)}'.`, `'${U.code(unit, b)}'에서 쉼표 연산자를 사용합니다.`));
  }
}

const WRAP_OPS = new Set(['+', '-', '*', '<<']);
function r124(unit, api) {
  const check = (node, parts) => {
    const v = U.constOf(unit, node);
    if (!v || v.float || !v.wrapped) return;
    if (!T.isUnsigned(U.canon(node.ctype), unit.target)) return;
    for (const p of parts) {
      const pv = U.constOf(unit, p);
      if (pv && pv.wrapped) return;
    }
    api.report(node, msg(
      `Constant expression '${U.code(unit, node)}' wraps around in type '${U.typeStr(node.ctype)}'.`,
      `상수 식 '${U.code(unit, node)}'가 '${U.typeStr(node.ctype)}' 타입에서 값이 돌아갑니다.`));
  };
  for (const b of U.nodes(unit, 'BinaryExpr')) if (WRAP_OPS.has(b.op)) check(b, [b.left, b.right]);
  for (const u of U.nodes(unit, 'UnaryExpr')) if (u.op === '-') check(u, [u.arg]);
}

function r125(unit, api) {
  for (const s of U.nodes(unit, 'SizeofExpr')) {
    const a = U.skip(s.arg);
    if (!a || a.type !== 'Identifier' || !a.symbol || a.symbol.kind !== 'parameter') continue;
    const d = (a.symbol.decls || []).find((x) => x.type === 'ParamDecl' && x.declaredType);
    const dt = d && U.canon(d.declaredType);
    if (!dt || dt.kind !== 'array') continue;
    api.report(s, msg(
      `sizeof is applied to array parameter '${a.name}', which is really a pointer ('${U.typeStr(a.symbol.type)}').`,
      `배열 매개변수 '${a.name}'에 sizeof를 적용했지만 실제로는 포인터('${U.typeStr(a.symbol.type)}')입니다.`));
  }
}

function r126(unit, api) {
  for (const m of U.nodes(unit, 'MemberExpr')) {
    let t = m.object && m.object.ctype;
    if (!t) continue;
    if (m.arrow) t = U.pointee(T.decay(t));
    if (!t || !U.quals(t).atomic) continue;
    const c = U.canon(t);
    if (!c || c.kind !== 'record') continue;
    api.report(m.memberLoc || m, msg(
      `Member '${m.member}' of atomic ${c.tag} '${U.code(unit, m.object)}' is accessed directly.`,
      `atomic ${c.tag} '${U.code(unit, m.object)}'의 멤버 '${m.member}'에 직접 접근합니다.`));
  }
}

module.exports = [
  { meta: meta('12.1', { cat: 'A', sev: 'MINOR', debt: 2, dec: true, name: ['Operator precedence should be explicit', '연산자 우선순위는 명시해야 함'],
    why: ['Readers can misjudge how operators of different precedence bind.', '우선순위가 다른 연산자가 어떻게 묶이는지 잘못 읽을 수 있습니다.'],
    fix: ['Add parentheses around sub-expressions of different precedence and around the operand of sizeof.', '우선순위가 다른 하위 식과 sizeof 피연산자를 괄호로 감싸세요.'] }), check: r121 },
  { meta: meta('12.2', { cat: 'R', type: 'BUG', sev: 'CRITICAL', debt: 10, dec: false, cwe: ['CWE-1335'], cert: 'INT34-C', name: ['Shift amount outside the width of the left operand', '왼쪽 피연산자 폭을 벗어난 시프트 크기'],
    why: ['Shifting by a negative amount or by at least the width of the type is undefined behaviour or loses all bits.', '음수나 타입 폭 이상으로 시프트하면 미정의 동작이거나 모든 비트를 잃습니다.'],
    fix: ['Keep the right operand between zero and the bit width of the essential type of the left operand minus one.', '오른쪽 피연산자를 0부터 왼쪽 피연산자 본질 타입의 비트 폭-1 사이로 유지하세요.'] }), check: r122 },
  { meta: meta('12.3', { cat: 'A', sev: 'MINOR', debt: 5, dec: true, name: ['Comma operator should not be used', '쉼표 연산자를 사용하지 않아야 함'],
    why: ['The comma operator hurts readability and its value is easily misread.', '쉼표 연산자는 가독성을 떨어뜨리고 값이 쉽게 잘못 읽힙니다.'],
    fix: ['Split the expression into separate statements.', '식을 별도의 문으로 나누세요.'] }), check: r123 },
  { meta: meta('12.4', { cat: 'A', type: 'BUG', sev: 'MAJOR', debt: 5, dec: true, cwe: ['CWE-190'], cert: 'INT30-C', name: ['Constant expression wraps around', '상수 식의 값 돌아감'],
    why: ['An unsigned constant expression that wraps around is almost always an error in the constant.', '값이 돌아가는 부호 없는 상수 식은 거의 항상 상수 오류입니다.'],
    fix: ['Rewrite the constant so it stays within the range of its type.', '타입 범위 안에 머물도록 상수를 고치세요.'] }), check: r124 },
  { meta: meta('12.5', { cat: 'M', type: 'BUG', sev: 'CRITICAL', debt: 5, dec: true, cwe: ['CWE-467'], cert: 'ARR01-C', name: ['sizeof applied to an array parameter', '배열 매개변수에 sizeof 적용'],
    why: ['An array parameter is adjusted to a pointer, so sizeof gives the pointer size, not the array size.', '배열 매개변수는 포인터로 조정되므로 sizeof는 배열 크기가 아니라 포인터 크기를 줍니다.'],
    fix: ['Pass the array length as a separate parameter.', '배열 길이를 별도 매개변수로 넘기세요.'] }), check: r125 },
  { meta: meta('12.6', { cat: 'R', type: 'BUG', sev: 'MAJOR', debt: 10, dec: true, cwe: ['CWE-362'], amendment: 'AMD4', name: ['Members of atomic structures accessed directly', 'atomic 구조체 멤버에 직접 접근'],
    why: ['Accessing a member of an atomic structure or union is undefined and not atomic.', 'atomic 구조체나 공용체의 멤버에 접근하는 것은 미정의이며 원자적이지 않습니다.'],
    fix: ['Load the whole object atomically into a non-atomic copy, then use its members.', '객체 전체를 원자적으로 비원자 복사본에 읽어 온 뒤 멤버를 사용하세요.'] }), check: r126 },
];
