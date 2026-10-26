'use strict';

// MISRA C++:2008 chapter 5, rules 5-0-x — expressions and the underlying type.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');
const UT = require('../../lib/underlying');
const S = require('../../lib/stmt');
const CH = require('../../lib/chars');
const P = require('../../lib/ptr');

const { T } = U;

const CTX_EN = { assign: 'assignment', init: 'initialisation', arg: 'argument passing', return: 'return', balance: 'operand balancing' };
const CTX_KO = { assign: '대입', init: '초기화', arg: '인수 전달', return: '반환', balance: '피연산자 균형화' };

function implicit(unit, api, pred, what) {
  for (const c of UT.conversions(unit)) {
    if (!pred(c)) continue;
    api.report(c.node, M(`Implicit conversion of '${U.code(unit, c.value)}' from ${UT.describe(c.from)} to ${UT.describe(c.to)} in ${CTX_EN[c.ctx] || c.ctx} ${what[0]}.`,
      `${CTX_KO[c.ctx] || c.ctx}에서 '${U.code(unit, c.value)}'를 ${UT.describeKo(c.from)}에서 ${UT.describeKo(c.to)}로 암시적으로 변환하면 ${what[1]}.`));
  }
}
function explicit(unit, api, pred, what) {
  for (const c of UT.casts(unit)) {
    if (!c.complex || !pred(c)) continue;
    api.report(c.node, M(`The cvalue expression '${U.code(unit, c.value)}' is cast from ${UT.describe(c.from)} to ${UT.describe(c.to)}, which ${what[0]}.`,
      `cvalue 식 '${U.code(unit, c.value)}'를 ${UT.describeKo(c.from)}에서 ${UT.describeKo(c.to)}로 캐스트하면 ${what[1]}.`));
  }
}

const fi = (c) => c.kind === 'intFloat' || c.kind === 'floatInt';

function boolCondition(unit, api) {
  const isBool = (e) => { const c = e && e.ctype && T.canonical(T.nonRef(e.ctype)); return !!c && c.kind === 'int' && c.name === 'bool'; };
  const check = (e, what) => {
    if (!e || e.type === 'Declaration' || isBool(e)) return;
    const c = e.ctype && T.canonical(T.nonRef(e.ctype));
    if (!c || T.isUnknown(c) || c.kind === 'record') return;
    api.report(e, M(`The ${what[0]} '${U.code(unit, e)}' does not have type bool.`, `${what[1]} '${U.code(unit, e)}'의 형식이 bool이 아닙니다.`));
  };
  return { check, isBool };
}

function bitwiseSameType(unit, api) {
  for (const b of U.get(unit, 'BinaryExpr')) {
    if (b.op !== '&' && b.op !== '|' && b.op !== '^') continue;
    if (U.isConst(unit, b.left) || U.isConst(unit, b.right)) continue;
    const l = UT.ut(unit, b.left), r = UT.ut(unit, b.right);
    if (l.kind !== 'int' || r.kind !== 'int') continue;
    if (l.size !== r.size || l.signed !== r.signed) api.report(b, M(`Operands of '${b.op}' have different underlying types (${UT.describe(l)} and ${UT.describe(r)}).`, `'${b.op}'의 피연산자 기본 형식이 다릅니다(${UT.describeKo(l)}, ${UT.describeKo(r)}).`));
  }
}

module.exports = [
  CPP08({
    id: '5-0-1', cat: 'R', dec: false, type: 'BUG', cpp2023: '4.6.1', c2012: '13.2',
    name: ['The value of an expression shall not depend on evaluation order', '식의 값은 평가 순서에 의존하지 않아야 합니다'],
    why: ['Operand evaluation order is unspecified, so side effects may happen in any order.', '피연산자 평가 순서는 지정되지 않아 부수 효과가 어떤 순서로든 일어날 수 있습니다.'],
    fix: ['Split the side effects into separate statements.', '부수 효과를 별도의 문으로 나누세요.'],
    reuse: 'misra-cpp:4.6.1',
  }),
  CPP08({
    id: '5-0-2', cat: 'A', dec: true, cpp2023: '8.0.1', c2012: '12.1',
    name: ['Limited dependence should be placed on operator precedence', '연산자 우선순위에 대한 의존을 줄여야 합니다'],
    why: ['Mixed operators without parentheses are easy to misread.', '괄호 없이 섞인 연산자는 잘못 읽기 쉽습니다.'],
    fix: ['Add parentheses to show the grouping.', '묶음을 보여 주는 괄호를 추가하세요.'],
    reuse: 'misra-cpp:8.0.1',
  }),
  CPP08({
    id: '5-0-3', cat: 'R', dec: true, cpp2023: '7.0.5', c2012: '10.6',
    name: ['A cvalue expression shall not be implicitly converted to a different underlying type', 'cvalue 식을 다른 기본 형식으로 암시적으로 변환하지 않아야 합니다'],
    why: ['Converting the result of arithmetic suggests the arithmetic used the target type, but it did not.', '연산 결과를 변환하면 대상 형식으로 연산한 것처럼 보이지만 실제로는 아닙니다.'],
    fix: ['Convert the operands before the operation.', '연산 전에 피연산자를 변환하세요.'],
    check(unit, api) { implicit(unit, api, (c) => c.complex, ['changes the underlying type of a cvalue', 'cvalue의 기본 형식이 바뀝니다']); },
  }),
  CPP08({
    id: '5-0-4', cat: 'R', dec: true, cpp2023: '7.0.5', c2012: '10.3', cwe: 'CWE-195',
    name: ['An implicit integral conversion shall not change signedness', '암시적 정수 변환이 부호 여부를 바꾸면 안 됩니다'],
    why: ['Signed/unsigned conversions change the value of negative or large numbers.', '부호 있음/없음 변환은 음수나 큰 수의 값을 바꿉니다.'],
    fix: ['Use operands of one signedness, add a U suffix, or cast explicitly.', '같은 부호의 피연산자를 쓰거나 U 접미사를 붙이거나 명시적으로 캐스트하세요.'],
    check(unit, api) { implicit(unit, api, (c) => c.sign, ['changes signedness', '부호 여부가 바뀝니다']); },
  }),
  CPP08({
    id: '5-0-5', cat: 'R', dec: true, cpp2023: '7.0.6', c2012: '10.3', cwe: 'CWE-681',
    name: ['There shall be no implicit floating-integral conversions', '암시적 부동소수점-정수 변환이 없어야 합니다'],
    why: ['Converting between floating and integer types loses the fraction or the precision.', '부동소수점과 정수 형식 사이의 변환은 소수 부분이나 정밀도를 잃습니다.'],
    fix: ['Make the conversion explicit with static_cast.', 'static_cast로 변환을 명시하세요.'],
    check(unit, api) { implicit(unit, api, fi, ['mixes floating and integral types', '부동소수점과 정수 형식이 섞입니다']); },
  }),
  CPP08({
    id: '5-0-6', cat: 'R', dec: true, cpp2023: '7.0.6', c2012: '10.3', cwe: 'CWE-197',
    name: ['An implicit conversion shall not reduce the size of the underlying type', '암시적 변환이 기본 형식의 크기를 줄이면 안 됩니다'],
    why: ['Narrowing silently truncates values.', '축소는 값을 조용히 잘라 냅니다.'],
    fix: ['Use a wide enough destination or cast explicitly after checking the range.', '충분히 넓은 대상을 쓰거나 범위를 확인한 뒤 명시적으로 캐스트하세요.'],
    check(unit, api) { implicit(unit, api, (c) => c.narrow, ['reduces its size', '크기가 줄어듭니다']); },
  }),
  CPP08({
    id: '5-0-7', cat: 'R', dec: true, c2012: '10.8',
    name: ['There shall be no explicit floating-integral conversion of a cvalue', 'cvalue의 명시적 부동소수점-정수 변환이 없어야 합니다'],
    why: ['The cast suggests the arithmetic was done in the target type.', '캐스트는 연산을 대상 형식으로 한 것처럼 보이게 합니다.'],
    fix: ['Convert the operands before the operation.', '연산 전에 피연산자를 변환하세요.'],
    check(unit, api) { explicit(unit, api, fi, ['mixes floating and integral types', '부동소수점과 정수 형식이 섞입니다']); },
  }),
  CPP08({
    id: '5-0-8', cat: 'R', dec: true, c2012: '10.8',
    name: ['An explicit conversion shall not increase the size of a cvalue', '명시적 변환이 cvalue의 크기를 늘리면 안 됩니다'],
    why: ['Widening the result does not recover overflow that already happened.', '결과를 넓혀도 이미 일어난 넘침은 되돌릴 수 없습니다.'],
    fix: ['Cast the operands to the wider type before the operation.', '연산 전에 피연산자를 더 넓은 형식으로 캐스트하세요.'],
    check(unit, api) { explicit(unit, api, (c) => c.widen, ['increases its size', '크기가 늘어납니다']); },
  }),
  CPP08({
    id: '5-0-9', cat: 'R', dec: true, c2012: '10.8',
    name: ['An explicit integral conversion shall not change the signedness of a cvalue', '명시적 정수 변환이 cvalue의 부호 여부를 바꾸면 안 됩니다'],
    why: ['The cast hides that the arithmetic was done with the other signedness.', '캐스트는 연산이 다른 부호 여부로 이루어졌다는 것을 숨깁니다.'],
    fix: ['Convert the operands before the operation.', '연산 전에 피연산자를 변환하세요.'],
    check(unit, api) { explicit(unit, api, (c) => c.sign, ['changes signedness', '부호 여부가 바뀝니다']); },
  }),
  CPP08({
    id: '5-0-10', cat: 'R', dec: true,
    name: ['~ and << on unsigned char or short shall be cast back immediately', 'unsigned char나 short에 대한 ~와 <<는 즉시 원래 형식으로 캐스트해야 합니다'],
    why: ['Integral promotion fills the high bits of the small operand.', '정수 승격이 작은 피연산자의 상위 비트를 채웁니다.'],
    fix: ['Cast the result, for example static_cast<std::uint8_t>(~x).', '결과를 캐스트하세요. 예: static_cast<std::uint8_t>(~x).'],
    check: S.shiftComplementCast,
  }),
  CPP08({
    id: '5-0-11', cat: 'R', dec: true, cpp2023: '7.0.3',
    name: ['Plain char shall only hold character values', '일반 char는 문자 값만 저장해야 합니다'],
    why: ['The signedness of plain char is implementation-defined.', '일반 char의 부호 여부는 구현 정의입니다.'],
    fix: ['Use std::int8_t or std::uint8_t for small numbers.', '작은 숫자에는 std::int8_t나 std::uint8_t를 사용하세요.'],
    check: CH.plainCharMisuse,
  }),
  CPP08({
    id: '5-0-12', cat: 'R', dec: true,
    name: ['Signed and unsigned char shall only hold numeric values', 'signed char와 unsigned char는 숫자 값만 저장해야 합니다'],
    why: ['Storing characters in signed or unsigned char mixes two uses.', 'signed 또는 unsigned char에 문자를 저장하면 두 용도가 섞입니다.'],
    fix: ['Use plain char for characters.', '문자에는 일반 char를 사용하세요.'],
    check: CH.numericCharMisuse,
  }),
  CPP08({
    id: '5-0-13', cat: 'R', dec: true, cpp2023: '7.0.2', c2012: '14.4',
    name: ['Conditions of if and iteration statements shall have type bool', 'if와 반복문의 조건은 bool 형식이어야 합니다'],
    why: ['Implicit tests against zero hide whether a number, a pointer or a flag is meant.', '0과의 암시적 비교는 숫자, 포인터, 플래그 중 무엇을 뜻하는지 숨깁니다.'],
    fix: ['Write an explicit comparison.', '명시적 비교를 쓰세요.'],
    check(unit, api) {
      const { check } = boolCondition(unit, api);
      for (const s of U.get(unit, 'IfStmt', 'WhileStmt', 'DoStmt', 'ForStmt')) check(s.cond, ['condition', '조건']);
    },
  }),
  CPP08({
    id: '5-0-14', cat: 'R', dec: true, cpp2023: '7.0.2',
    name: ['The first operand of ?: shall have type bool', '?:의 첫 번째 피연산자는 bool 형식이어야 합니다'],
    why: ['An implicit test against zero hides the intent.', '0과의 암시적 비교는 의도를 숨깁니다.'],
    fix: ['Write an explicit comparison.', '명시적 비교를 쓰세요.'],
    check(unit, api) {
      const { check } = boolCondition(unit, api);
      for (const c of U.get(unit, 'ConditionalExpr')) check(c.test, ['first operand of ?:', '?:의 첫 번째 피연산자']);
    },
  }),
  CPP08({
    id: '5-0-15', cat: 'R', dec: true, cpp2023: '8.7.1', c2012: '18.4',
    name: ['Array indexing shall be the only form of pointer arithmetic', '배열 인덱싱만 포인터 연산으로 사용해야 합니다'],
    why: ['Explicit pointer arithmetic is harder to check for bounds.', '명시적 포인터 연산은 범위 검사가 더 어렵습니다.'],
    fix: ['Use subscripts instead of +, -, ++ and -- on pointers.', '포인터에 +, -, ++, -- 대신 첨자를 사용하세요.'],
    check(unit, api) { P.ptrArithmetic(unit, api, false); },
  }),
  CPP08({
    id: '5-0-16', cat: 'R', dec: false, type: 'BUG', cpp2023: '8.7.1', c2012: '18.1', cwe: 'CWE-823',
    name: ['Pointer arithmetic shall stay within the same array', '포인터 연산은 같은 배열 안에 머물러야 합니다'],
    why: ['A pointer moved away from a single object points to nothing valid.', '단일 객체에서 옮긴 포인터는 유효한 곳을 가리키지 않습니다.'],
    fix: ['Only do arithmetic on pointers into arrays.', '배열을 가리키는 포인터에서만 연산하세요.'],
    check: P.arithmeticOnScalar,
  }),
  CPP08({
    id: '5-0-17', cat: 'R', dec: false, type: 'BUG', cpp2023: '8.7.2', c2012: '18.2',
    name: ['Pointer subtraction shall only be within the same array', '포인터 빼기는 같은 배열 안에서만 해야 합니다'],
    why: ['Subtracting pointers to different objects is undefined behaviour.', '서로 다른 객체의 포인터를 빼면 정의되지 않은 동작입니다.'],
    fix: ['Subtract only pointers into the same array.', '같은 배열 안의 포인터만 빼세요.'],
    reuse: 'misra-cpp:8.7.2',
  }),
  CPP08({
    id: '5-0-18', cat: 'R', dec: false, type: 'BUG', cpp2023: '8.9.1', c2012: '18.3',
    name: ['Relational operators shall only compare pointers into the same array', '관계 연산자는 같은 배열 안의 포인터만 비교해야 합니다'],
    why: ['Ordering pointers to unrelated objects is unspecified.', '관계없는 객체를 가리키는 포인터의 대소 비교는 지정되지 않습니다.'],
    fix: ['Compare pointers within one array only.', '한 배열 안에서만 포인터를 비교하세요.'],
    reuse: 'misra-cpp:8.9.1',
  }),
  CPP08({
    id: '5-0-19', cat: 'R', dec: true, cpp2023: '11.3.2', c2012: '18.5',
    name: ['Declarations shall have at most two levels of pointer indirection', '선언은 포인터 간접 참조를 두 단계 이하로 가져야 합니다'],
    why: ['Deep indirection is hard to understand and use correctly.', '깊은 간접 참조는 이해하고 올바르게 쓰기 어렵습니다.'],
    fix: ['Introduce a typedef or restructure the data.', 'typedef를 도입하거나 데이터를 재구성하세요.'],
    reuse: 'misra-cpp:11.3.2',
  }),
  CPP08({
    id: '5-0-20', cat: 'R', dec: true, cpp2023: '7.0.4',
    name: ['Non-constant operands of a binary bitwise operator shall have the same underlying type', '이항 비트 연산자의 상수가 아닌 피연산자는 같은 기본 형식이어야 합니다'],
    why: ['Mixing widths or signedness in bit operations hides promotions and sign extension.', '비트 연산에서 폭이나 부호를 섞으면 승격과 부호 확장이 숨습니다.'],
    fix: ['Convert one operand so both have the same type.', '두 피연산자가 같은 형식이 되도록 하나를 변환하세요.'],
    check: bitwiseSameType,
  }),
  CPP08({
    id: '5-0-21', cat: 'R', dec: true, cpp2023: '7.0.4', c2012: '10.1',
    name: ['Bitwise operators shall only be applied to unsigned operands', '비트 연산자는 부호 없는 피연산자에만 적용해야 합니다'],
    why: ['Bit operations on signed values depend on the representation.', '부호 있는 값의 비트 연산은 표현 방식에 의존합니다.'],
    fix: ['Use unsigned operands.', '부호 없는 피연산자를 사용하세요.'],
    check: S.bitwiseSigned,
  }),
];
