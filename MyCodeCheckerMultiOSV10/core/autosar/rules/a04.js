'use strict';

// AUTOSAR C++14 chapter 4 — standard conversions (enum and char operands,
// integer data loss, null pointer constants) and MISRA C++:2008 M4 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const conv = require('../../misra-cpp/lib/conv');

const ENUM_OK_BIN = new Set(['==', '!=', '<', '<=', '>', '>=', ',', '&&', '||', '.*', '->*', '<=>']);
const CHAR_OK_BIN = new Set(['==', '!=', ',', '&&', '||']);
const COMPOUND = new Set(['+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);

const isEnum = (e) => !!(e && e.ctype && U.nonRef(e.ctype).kind === 'enum');
const isPlainChar = (e) => { const c = e && e.ctype ? U.nonRef(e.ctype) : null; return !!(c && c.kind === 'int' && (c.name === 'char' || c.name === 'wchar_t')); };
const isZeroLit = (e) => { e = U.strip(e); return !!(e && e.type === 'IntegerLiteral' && e.value === 0n); };
// The node is the expansion of NULL itself (`0`, `((void*)0)`, `__null`), not an
// expression that merely starts with it (`NULL != p` has the same macro location).
const NULL_NODES = new Set(['IntegerLiteral', 'NullptrLiteral', 'CastExpr', 'Identifier']);
const fromNull = (e) => { e = U.strip(e); return !!(e && e.loc && e.loc.macro === 'NULL' && NULL_NODES.has(e.type)); };
const isPtrType = (t) => { const c = t ? U.nonRef(t) : null; return !!(c && (c.kind === 'pointer' || c.kind === 'memberPointer')); };

// Operands used with operators: [{ node, operand, op }]
function operatorUses(unit) {
  return U.memo(unit, 'autosar.opUses', () => {
    const out = [];
    const x = U.ix(unit);
    for (const b of x.get('BinaryExpr')) { out.push({ node: b, operand: b.left, op: b.op }); out.push({ node: b, operand: b.right, op: b.op }); }
    for (const u of x.get('UnaryExpr')) out.push({ node: u, operand: u.arg, op: u.prefix === false ? `${u.op}(post)` : u.op, unary: true });
    for (const a of x.get('AssignExpr')) if (COMPOUND.has(a.op)) { out.push({ node: a, operand: a.left, op: a.op }); out.push({ node: a, operand: a.right, op: a.op }); }
    return out;
  });
}

module.exports = [
  A({
    id: 'A4-5-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['Expressions with enum type shall only be used with subscript, assignment, equality, relational and unary & operators', '열거형 식은 첨자, 대입, 동등, 관계, 단항 & 연산자에만 써야 합니다'],
    why: ['Arithmetic and bitwise operations on enumerators produce values that need not correspond to any enumerator.', '열거자에 산술이나 비트 연산을 하면 어떤 열거자에도 해당하지 않는 값이 나올 수 있습니다.'],
    fix: ['Convert explicitly to the underlying type when arithmetic is really intended, or redesign the enumeration.', '산술이 정말 필요하면 기반 형식으로 명시적으로 변환하거나 열거형을 다시 설계하세요.'],
    check(unit, api) {
      for (const { node, operand, op, unary } of operatorUses(unit)) {
        if (!isEnum(operand)) continue;
        if (unary ? op === '&' : ENUM_OK_BIN.has(op)) continue;
        if (U.recordOf(node.ctype)) continue;
        api.report(node, M(`An expression of enumeration type is an operand of '${op.replace('(post)', '')}'.`, `열거형 식이 '${op.replace('(post)', '')}' 의 피연산자로 쓰입니다.`));
      }
    },
  }),
  D('A4-7-1', ['7.0.6'], { type: 'BUG', name: ['An integer expression shall not lead to data loss', '정수 식에서 데이터가 손실되면 안 됩니다'] }),
  D('A4-10-1', ['7.11.1'], { name: ['Only nullptr literal shall be used as the null-pointer constant', '널 포인터 상수로는 nullptr 리터럴만 써야 합니다'] }),
  D('M4-5-1', ['7.0.1'], { name: ['Expressions with type bool shall only be used with the logical, equality, assignment and conditional operators', 'bool 식은 논리, 동등, 대입, 조건 연산자에만 써야 합니다'] }),
  A({
    id: 'M4-5-3', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['Expressions with type plain char or wchar_t shall only be used with assignment, equality and unary & operators', 'plain char 와 wchar_t 식은 대입, 동등, 단항 & 연산자에만 써야 합니다'],
    why: ['Whether plain char is signed is implementation-defined, so arithmetic on it is not portable.', 'plain char 의 부호 여부는 구현 정의이므로 이에 대한 산술은 이식성이 없습니다.'],
    fix: ['Use signed char / unsigned char or a fixed-width integer for numeric work.', '수치 계산에는 signed char / unsigned char 나 고정 폭 정수를 쓰세요.'],
    check(unit, api) {
      for (const { node, operand, op, unary } of operatorUses(unit)) {
        if (!isPlainChar(operand)) continue;
        if (unary ? op === '&' : CHAR_OK_BIN.has(op)) continue;
        api.report(node, M(`A plain char expression is an operand of '${op.replace('(post)', '')}'.`, `plain char 식이 '${op.replace('(post)', '')}' 의 피연산자로 쓰입니다.`));
      }
    },
  }),
  A({
    id: 'M4-10-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['NULL shall not be used as an integer value', 'NULL 을 정수 값으로 쓰면 안 됩니다'],
    why: ['NULL denotes a null pointer; using it as a number hides the intent and may pick an unexpected overload.', 'NULL 은 널 포인터를 뜻하므로 숫자로 쓰면 의도가 가려지고 예상하지 못한 오버로드가 골라질 수 있습니다.'],
    fix: ['Write the integer constant 0 instead.', '대신 정수 상수 0 을 쓰세요.'],
    check(unit, api) {
      for (const c of conv.conversions(unit)) {
        // a target of unknown type (std::shared_ptr, a struct of a missing header) may be a pointer
        if (fromNull(c.src) && !U.unknownT(c.dst) && !isPtrType(c.dst) && U.nonRef(c.dst).kind !== 'nullptr') api.report(c.src, M(`NULL is used as an integer value for ${c.name || 'an object'}.`, `NULL 을 ${c.name || '객체'} 의 정수 값으로 씁니다.`));
      }
      for (const b of U.ix(unit).get('BinaryExpr')) {
        for (const [a, o] of [[b.left, b.right], [b.right, b.left]]) {
          if (fromNull(a) && o && o.ctype && !isPtrType(o.ctype) && !fromNull(o) && U.nonRef(o.ctype).kind === 'int') api.report(a, M('NULL is used as an integer operand.', 'NULL 을 정수 피연산자로 씁니다.'));
        }
      }
    },
  }),
  A({
    id: 'M4-10-2', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['The literal zero shall not be used as the null-pointer constant', '리터럴 0 을 널 포인터 상수로 쓰면 안 됩니다'],
    why: ['A plain 0 used as a pointer reads like a number and can select integer overloads.', '포인터로 쓰인 0 은 숫자처럼 읽히고 정수 오버로드를 고를 수 있습니다.'],
    fix: ['Use nullptr.', 'nullptr 를 쓰세요.'],
    check(unit, api) {
      for (const c of conv.conversions(unit)) {
        if (isZeroLit(c.src) && !fromNull(c.src) && isPtrType(c.dst)) api.report(c.src, M(`The literal 0 is used as a null pointer for ${c.name || 'an object'}.`, `${c.name || '객체'} 에 리터럴 0 을 널 포인터로 씁니다.`));
      }
      for (const b of U.ix(unit).get('BinaryExpr')) {
        if (b.op !== '==' && b.op !== '!=') continue;
        for (const [a, o] of [[b.left, b.right], [b.right, b.left]]) {
          if (isZeroLit(a) && !fromNull(a) && o && isPtrType(o.ctype)) api.report(a, M('The literal 0 is compared with a pointer.', '리터럴 0 을 포인터와 비교합니다.'));
        }
      }
    },
  }),
];
