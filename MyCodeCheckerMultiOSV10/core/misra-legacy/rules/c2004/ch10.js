'use strict';

// MISRA C:2004 chapter 10 — arithmetic type conversions (underlying type model).

const { C04, M } = require('../../lib/meta');
const U = require('../../lib/util');
const UT = require('../../lib/underlying');
const S = require('../../lib/stmt');

const CTX_EN = { assign: 'assignment', init: 'initialisation', arg: 'argument passing', return: 'return', balance: 'operand balancing' };
const CTX_KO = { assign: '대입', init: '초기화', arg: '인수 전달', return: '반환', balance: '피연산자 균형화' };

function why(c) {
  if (c.kind === 'sign') return ['changes the signedness', '부호 여부가 바뀝니다'];
  if (c.kind === 'narrow') return ['narrows the type', '형식이 좁아집니다'];
  if (c.kind === 'intFloat') return ['converts it to a floating type', '부동소수점 형식으로 바뀝니다'];
  if (c.kind === 'floatInt') return ['converts it to an integer type', '정수 형식으로 바뀝니다'];
  if (c.complex) return ['widens a complex expression', '복합 식이 넓어집니다'];
  return [`widens a non-constant ${c.ctx === 'arg' ? 'argument' : 'return value'}`, `상수가 아닌 ${c.ctx === 'arg' ? '인수' : '반환 값'}가 넓어집니다`];
}

function implicitViolations(unit, kind) {
  return UT.conversions(unit).filter((c) => {
    if (c.from.kind !== kind) return false;
    if (c.kind === 'sign' || c.kind === 'narrow' || c.kind === 'intFloat' || c.kind === 'floatInt') return true;
    if (c.kind === 'widen') {
      if (c.complex) return true;
      if ((c.ctx === 'arg' || c.ctx === 'return') && !c.constant) return true;
    }
    return false;
  });
}

function reportImplicit(unit, api, kind) {
  for (const c of implicitViolations(unit, kind)) {
    const [en, ko] = why(c);
    api.report(c.node, M(`Implicit conversion of '${U.code(unit, c.value)}' (${UT.describe(c.from)}) to ${UT.describe(c.to)} in ${CTX_EN[c.ctx] || c.ctx} ${en}.`,
      `${CTX_KO[c.ctx] || c.ctx}에서 '${U.code(unit, c.value)}'(${UT.describeKo(c.from)})를 ${UT.describeKo(c.to)}로 암시적으로 변환하면 ${ko}.`));
  }
}

function complexCasts(unit, api, kind) {
  for (const c of UT.casts(unit)) {
    if (!c.complex || c.from.kind !== kind) continue;
    const bad = kind === 'int'
      ? (c.kind === 'widen' || c.kind === 'sign' || c.kind === 'intFloat')
      : (c.kind === 'widen' || c.kind === 'floatInt');
    if (!bad) continue;
    api.report(c.node, M(`The complex expression '${U.code(unit, c.value)}' (${UT.describe(c.from)}) is cast to ${UT.describe(c.to)}.`,
      `복합 식 '${U.code(unit, c.value)}'(${UT.describeKo(c.from)})를 ${UT.describeKo(c.to)}로 캐스트했습니다.`));
  }
}

module.exports = [
  C04({
    id: '10.1', cat: 'R', dec: true, c2012: '10.3', cwe: 'CWE-681',
    name: ['Integer expressions shall not be implicitly converted to a different underlying type', '정수 식을 다른 기본 형식으로 암시적으로 변환하지 않아야 합니다'],
    why: ['Implicit sign changes, narrowing and widening of complex expressions lose values or hide the real arithmetic type.', '암시적인 부호 변경, 축소, 복합 식의 확장은 값을 잃거나 실제 연산 형식을 숨깁니다.'],
    fix: ['Use operands of one underlying type, add a U suffix, or cast explicitly before the operation.', '같은 기본 형식의 피연산자를 쓰거나 U 접미사를 붙이거나 연산 전에 명시적으로 캐스트하세요.'],
    check(unit, api) { reportImplicit(unit, api, 'int'); },
  }),
  C04({
    id: '10.2', cat: 'R', dec: true, c2012: '10.3', cwe: 'CWE-681',
    name: ['Floating expressions shall not be implicitly converted to a different underlying type', '부동소수점 식을 다른 기본 형식으로 암시적으로 변환하지 않아야 합니다'],
    why: ['Implicit float-to-integer conversion, narrowing or widening of complex results changes values silently.', '암시적인 부동소수점-정수 변환, 축소, 복합 결과의 확장은 값을 조용히 바꿉니다.'],
    fix: ['Keep floating arithmetic in one type and convert explicitly when needed.', '부동소수점 연산은 한 형식으로 유지하고 필요하면 명시적으로 변환하세요.'],
    check(unit, api) { reportImplicit(unit, api, 'float'); },
  }),
  C04({
    id: '10.3', cat: 'R', dec: true, c2012: '10.8',
    name: ['A complex integer expression shall only be cast to a narrower type of the same signedness', '복합 정수 식은 같은 부호의 더 좁은 형식으로만 캐스트해야 합니다'],
    why: ['Casting a complex expression to a wider type suggests the arithmetic was done in that type, but it was not.', '복합 식을 더 넓은 형식으로 캐스트하면 그 형식으로 연산한 것처럼 보이지만 실제로는 아닙니다.'],
    fix: ['Cast the operands before the operation instead of the result.', '결과 대신 연산 전에 피연산자를 캐스트하세요.'],
    check(unit, api) { complexCasts(unit, api, 'int'); },
  }),
  C04({
    id: '10.4', cat: 'R', dec: true, c2012: '10.8',
    name: ['A complex floating expression shall only be cast to a narrower floating type', '복합 부동소수점 식은 더 좁은 부동소수점 형식으로만 캐스트해야 합니다'],
    why: ['Widening the result of floating arithmetic does not recover the precision that was lost.', '부동소수점 연산 결과를 넓혀도 잃어버린 정밀도는 돌아오지 않습니다.'],
    fix: ['Cast the operands to the wider type before the operation.', '연산 전에 피연산자를 더 넓은 형식으로 캐스트하세요.'],
    check(unit, api) { complexCasts(unit, api, 'float'); },
  }),
  C04({
    id: '10.5', cat: 'R', dec: true,
    name: ['~ and << on unsigned char or short shall be cast back immediately', 'unsigned char나 short에 대한 ~와 <<는 즉시 원래 형식으로 캐스트해야 합니다'],
    why: ['Integral promotion fills the high bits, so the result differs from what the small type suggests.', '정수 승격이 상위 비트를 채워 결과가 작은 형식에서 기대한 값과 다릅니다.'],
    fix: ['Cast the result to the operand type, for example (uint8_t)(~x).', '결과를 피연산자 형식으로 캐스트하세요. 예: (uint8_t)(~x).'],
    check: S.shiftComplementCast,
  }),
  C04({
    id: '10.6', cat: 'R', dec: true, c2012: '7.2',
    name: ['Constants of unsigned type shall have a U suffix', '부호 없는 형식의 상수에는 U 접미사를 붙여야 합니다'],
    why: ['Whether an unsuffixed constant is signed depends on its value and the target.', '접미사 없는 상수가 부호 있는지는 값과 대상에 따라 달라집니다.'],
    fix: ['Add a U suffix to every constant that is meant to be unsigned.', '부호 없이 쓰려는 모든 상수에 U 접미사를 붙이세요.'],
    reuse: 'misra-c:7.2',
  }),
];
