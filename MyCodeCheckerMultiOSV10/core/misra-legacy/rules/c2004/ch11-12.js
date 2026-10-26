'use strict';

// MISRA C:2004 chapter 11 — pointer type conversions; chapter 12 — expressions.

const { C04, M } = require('../../lib/meta');
const U = require('../../lib/util');
const UT = require('../../lib/underlying');
const S = require('../../lib/stmt');

// Operands of logical operators effectively Boolean; Boolean values not used arithmetically.
const NON_LOGICAL = new Set(['+', '-', '*', '/', '%', '<<', '>>', '&', '|', '^', '<', '>', '<=', '>=']);
function booleanUse(unit, api) {
  const isBool = (e) => UT.ut(unit, e).kind === 'bool';
  const check = (e, op) => {
    if (!e || isBool(e)) return;
    api.report(e, M(`Operand '${U.code(unit, e)}' of '${op}' is not effectively Boolean.`, `'${op}'의 피연산자 '${U.code(unit, e)}'가 실질적으로 부울이 아닙니다.`));
  };
  for (const b of U.get(unit, 'BinaryExpr')) {
    if (b.op === '&&' || b.op === '||') { check(b.left, b.op); check(b.right, b.op); continue; }
    if (!NON_LOGICAL.has(b.op)) continue;
    for (const o of [b.left, b.right]) {
      const x = U.strip(o);
      if (x && isBool(x) && x.type === 'BinaryExpr') api.report(o, M(`The Boolean expression '${U.code(unit, o)}' is used as an operand of '${b.op}'.`, `부울 식 '${U.code(unit, o)}'를 '${b.op}'의 피연산자로 사용했습니다.`));
    }
  }
  for (const n of U.get(unit, 'UnaryExpr')) if (n.op === '!') check(n.arg, '!');
}

module.exports = [
  C04({
    id: '11.1', cat: 'R', dec: true, c2012: '11.1', type: 'BUG',
    name: ['Function pointers shall only be converted to or from integral types', '함수 포인터는 정수 형식과만 변환해야 합니다'],
    why: ['Converting a function pointer to another pointer type has undefined behaviour.', '함수 포인터를 다른 포인터 형식으로 변환하면 정의되지 않은 동작입니다.'],
    fix: ['Keep function pointers in their own type.', '함수 포인터는 원래 형식으로 유지하세요.'],
    reuse: 'misra-c:11.1',
  }),
  C04({
    id: '11.2', cat: 'R', dec: true, c2012: '11.7',
    name: ['Object pointers shall only be converted to integral, object or void pointer types', '객체 포인터는 정수, 객체 포인터, void 포인터로만 변환해야 합니다'],
    why: ['Converting an object pointer to a floating type is meaningless and non-portable.', '객체 포인터를 부동소수점 형식으로 변환하는 것은 의미가 없고 이식성도 없습니다.'],
    fix: ['Remove the conversion.', '변환을 없애세요.'],
    reuse: 'misra-c:11.7',
  }),
  C04({
    id: '11.3', cat: 'A', dec: true, c2012: '11.4', cwe: 'CWE-704',
    name: ['Casts between pointers and integers should not be performed', '포인터와 정수 사이의 캐스트를 하지 않아야 합니다'],
    why: ['The result depends on the pointer size and the address layout of the target.', '결과가 포인터 크기와 대상의 주소 배치에 따라 달라집니다.'],
    fix: ['Avoid the cast, or isolate it in a documented hardware-access function.', '캐스트를 피하거나 문서화한 하드웨어 접근 함수 안에 격리하세요.'],
    reuse: 'misra-c:11.4',
  }),
  C04({
    id: '11.4', cat: 'A', dec: true, c2012: '11.3', cwe: 'CWE-704',
    name: ['Casts between different object pointer types should not be performed', '서로 다른 객체 포인터 형식 사이의 캐스트를 하지 않아야 합니다'],
    why: ['The new pointer may be misaligned or alias an object of another type.', '새 포인터가 정렬이 어긋나거나 다른 형식의 객체를 별칭할 수 있습니다.'],
    fix: ['Access the object through its own type or copy it with memcpy.', '객체 자신의 형식으로 접근하거나 memcpy로 복사하세요.'],
    reuse: 'misra-c:11.3',
  }),
  C04({
    id: '11.5', cat: 'R', dec: true, c2012: '11.8', type: 'BUG',
    name: ['A cast shall not remove const or volatile from a pointed-to type', '캐스트로 가리키는 형식의 const나 volatile을 제거하지 않아야 합니다'],
    why: ['Writing through the resulting pointer to a const object is undefined behaviour.', '결과 포인터로 const 객체에 쓰면 정의되지 않은 동작입니다.'],
    fix: ['Keep the qualifiers in the target type.', '대상 형식에 한정자를 유지하세요.'],
    reuse: 'misra-c:11.8',
  }),
  // ---------------------------------------------------------------- chapter 12
  C04({
    id: '12.1', cat: 'A', dec: true, c2012: '12.1',
    name: ['Operator precedence should be made explicit with parentheses', '연산자 우선순위는 괄호로 명시해야 합니다'],
    why: ['C precedence rules are easy to get wrong when operators are mixed.', '연산자를 섞으면 C의 우선순위 규칙을 틀리기 쉽습니다.'],
    fix: ['Add parentheses around the operands of mixed operators.', '섞인 연산자의 피연산자를 괄호로 묶으세요.'],
    reuse: 'misra-c:12.1',
  }),
  C04({
    id: '12.2', cat: 'R', dec: false, type: 'BUG', c2012: '13.2',
    name: ['The value of an expression shall not depend on evaluation order', '식의 값은 평가 순서에 의존하지 않아야 합니다'],
    why: ['The order in which operands and arguments are evaluated is unspecified.', '피연산자와 인수의 평가 순서는 지정되어 있지 않습니다.'],
    fix: ['Split the side effects into separate statements.', '부수 효과를 별도의 문으로 나누세요.'],
    reuse: 'misra-c:13.2',
  }),
  C04({
    id: '12.3', cat: 'R', dec: true, c2012: '13.6',
    name: ['sizeof shall not be applied to expressions with side effects', '부수 효과가 있는 식에 sizeof를 적용하지 않아야 합니다'],
    why: ['The operand of sizeof is not evaluated, so its side effects never happen.', 'sizeof의 피연산자는 평가되지 않으므로 그 부수 효과는 일어나지 않습니다.'],
    fix: ['Move the side effect out of the sizeof operand.', '부수 효과를 sizeof 피연산자 밖으로 옮기세요.'],
    reuse: 'misra-c:13.6',
  }),
  C04({
    id: '12.4', cat: 'R', dec: false, c2012: '13.5',
    name: ['The right operand of && or || shall have no side effects', '&& 또는 ||의 오른쪽 피연산자에 부수 효과가 없어야 합니다'],
    why: ['The right operand is evaluated only conditionally.', '오른쪽 피연산자는 조건에 따라서만 평가됩니다.'],
    fix: ['Evaluate the side effect in a separate statement first.', '부수 효과를 먼저 별도의 문에서 평가하세요.'],
    reuse: 'misra-c:13.5',
  }),
  C04({
    id: '12.5', cat: 'R', dec: true,
    name: ['Operands of && and || shall be primary expressions', '&&와 ||의 피연산자는 기본 식이어야 합니다'],
    why: ['Parenthesised operands make the grouping of logical expressions obvious.', '괄호로 묶은 피연산자는 논리식의 묶음을 분명히 합니다.'],
    fix: ['Put each non-trivial operand in parentheses; chains of one operator are fine.', '단순하지 않은 피연산자는 괄호로 묶으세요. 같은 연산자의 연쇄는 괜찮습니다.'],
    check(unit, api) { S.logicalOperands(unit, api, false); },
  }),
  C04({
    id: '12.6', cat: 'A', dec: true, c2012: '10.1',
    name: ['Logical operators should take Boolean operands, and Boolean values only logical operators', '논리 연산자는 부울 피연산자를, 부울 값은 논리 연산자만 사용해야 합니다'],
    why: ['Mixing Boolean and arithmetic use hides the intent of the expression.', '부울 용도와 산술 용도를 섞으면 식의 의도가 숨습니다.'],
    fix: ['Compare explicitly, for example (x != 0U), and keep Boolean results out of arithmetic.', '명시적으로 비교하고(예: (x != 0U)) 부울 결과를 산술에 쓰지 마세요.'],
    check: booleanUse,
  }),
  C04({
    id: '12.7', cat: 'R', dec: true, c2012: '10.1',
    name: ['Bitwise operators shall not be applied to signed operands', '부호 있는 피연산자에 비트 연산자를 적용하지 않아야 합니다'],
    why: ['Bit operations on signed values depend on the representation and can be undefined.', '부호 있는 값의 비트 연산은 표현 방식에 의존하며 정의되지 않을 수 있습니다.'],
    fix: ['Use unsigned operands.', '부호 없는 피연산자를 사용하세요.'],
    check: S.bitwiseSigned,
  }),
  C04({
    id: '12.8', cat: 'R', dec: true, type: 'BUG', c2012: '12.2', cwe: 'CWE-1335',
    name: ['The shift amount shall be within the width of the left operand', '이동 크기는 왼쪽 피연산자의 폭 안에 있어야 합니다'],
    why: ['Shifting by a negative amount or by the width or more is undefined behaviour.', '음수나 폭 이상의 크기로 이동하면 정의되지 않은 동작입니다.'],
    fix: ['Keep the shift amount between 0 and the bit width minus one.', '이동 크기를 0부터 비트 폭 빼기 1 사이로 유지하세요.'],
    reuse: 'misra-c:12.2',
  }),
  C04({
    id: '12.9', cat: 'R', dec: true, c2012: '10.1',
    name: ['Unary minus shall not be applied to unsigned expressions', '부호 없는 식에 단항 마이너스를 적용하지 않아야 합니다'],
    why: ['Negating an unsigned value wraps around instead of producing a negative number.', '부호 없는 값을 음수화하면 음수가 아니라 순환된 값이 나옵니다.'],
    fix: ['Convert to a signed type first or rewrite the expression.', '먼저 부호 있는 형식으로 변환하거나 식을 다시 쓰세요.'],
    check: S.unaryMinusUnsigned,
  }),
  C04({
    id: '12.10', cat: 'R', dec: true, c2012: '12.3',
    name: ['The comma operator shall not be used', '쉼표 연산자를 사용하지 않아야 합니다'],
    why: ['The comma operator makes code harder to read.', '쉼표 연산자는 코드를 읽기 어렵게 합니다.'],
    fix: ['Write separate statements.', '별도의 문으로 쓰세요.'],
    reuse: 'misra-c:12.3',
  }),
  C04({
    id: '12.11', cat: 'A', dec: true, c2012: '12.4',
    name: ['Constant unsigned expressions should not wrap around', '상수 부호 없는 식이 순환하지 않아야 합니다'],
    why: ['A wrapping constant expression is usually a mistake.', '순환하는 상수 식은 대개 실수입니다.'],
    fix: ['Rewrite the constant so it stays within range.', '범위 안에 머물도록 상수를 다시 쓰세요.'],
    reuse: 'misra-c:12.4',
  }),
  C04({
    id: '12.12', cat: 'R', dec: true,
    name: ['The bit representation of floating-point values shall not be used', '부동소수점 값의 비트 표현을 사용하지 않아야 합니다'],
    why: ['The layout of floating-point values depends on the implementation.', '부동소수점 값의 배치는 구현에 따라 다릅니다.'],
    fix: ['Use the arithmetic value or the functions of <math.h>.', '산술 값이나 <math.h> 함수를 사용하세요.'],
    check: S.floatBits,
  }),
  C04({
    id: '12.13', cat: 'A', dec: true, c2012: '13.3',
    name: ['++ and -- should not be mixed with other operators', '++와 --를 다른 연산자와 섞지 않아야 합니다'],
    why: ['Increments inside larger expressions hide side effects and their order.', '큰 식 안의 증감 연산은 부수 효과와 그 순서를 숨깁니다.'],
    fix: ['Put the increment or decrement in its own statement.', '증가나 감소를 별도의 문으로 쓰세요.'],
    reuse: 'misra-c:13.3',
  }),
];
