'use strict';

// MISRA C++:2023 chapters 16 (overloading) and 17 (templates).

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const { cf } = U;

const SYMMETRIC = new Set(['operator+', 'operator-', 'operator*', 'operator/', 'operator%', 'operator==', 'operator!=', 'operator<', 'operator>', 'operator<=', 'operator>=', 'operator&', 'operator|', 'operator^', 'operator<=>', 'operator&&', 'operator||']);

// Is the FunctionDecl a (non-friend) member of a class?
function isMember(unit, fd) {
  const s = U.specsOf(fd);
  if (fd.friend || (s && s.functionSpecs && s.functionSpecs.includes('friend'))) return false;
  const rd = cf.enclosing(fd, ['RecordDecl', 'FunctionDecl', 'NamespaceDecl']);
  if (rd && rd.type === 'RecordDecl') return true;
  if (fd.qualifier && fd.symbol && fd.symbol.member) return true;
  return false;
}

// One report per function entity (first user declaration).
function operators(unit) {
  const seen = new Set();
  const out = [];
  for (const fd of U.ix(unit).get('FunctionDecl')) {
    if (!fd.isOperator) continue;
    const key = fd.symbol || fd;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fd);
  }
  return out;
}

module.exports = [
  R({
    id: '16.5.1', cat: 'Required', dec: true, autosar: 'M5-2-11', sev: 'MAJOR', debt: 10,
    name: ['The logical AND and logical OR operators shall not be overloaded', '논리 AND 와 논리 OR 연산자는 오버로드하면 안 됩니다'],
    why: ['Overloaded && and || lose short-circuit evaluation (and, before C++17, their sequencing).', '오버로드한 && 와 || 는 단락 평가 (와 C++17 이전의 순서 보장) 를 잃습니다.'],
    fix: ['Provide a named function or an explicit conversion to bool instead.', '이름 있는 함수나 bool 로의 explicit 변환을 대신 제공하세요.'],
    check(unit, api) {
      for (const fd of operators(unit)) if (fd.name === 'operator&&' || fd.name === 'operator||') api.report(fd, M(`'${fd.name}' is overloaded.`, `'${fd.name}' 가 오버로드되었습니다.`));
    },
  }),
  R({
    id: '16.5.2', cat: 'Required', dec: true, autosar: 'M5-3-3', sev: 'MAJOR', debt: 10,
    name: ['The address-of operator shall not be overloaded', '주소 연산자는 오버로드하면 안 됩니다'],
    why: ['Code taking the address of an object normally assumes the built-in meaning; overloading it surprises generic code.', '객체의 주소를 취하는 코드는 보통 내장 의미를 가정하므로 오버로드하면 제네릭 코드가 놀랍니다.'],
    fix: ['Remove the unary operator& overload.', '단항 operator& 오버로드를 없애세요.'],
    check(unit, api) {
      for (const fd of operators(unit)) {
        if (fd.name !== 'operator&') continue;
        const n = U.paramCount(fd);
        if ((isMember(unit, fd) && n === 0) || (!isMember(unit, fd) && n === 1)) api.report(fd, M('The unary address-of operator is overloaded.', '단항 주소 연산자가 오버로드되었습니다.'));
      }
    },
  }),
  R({
    id: '16.6.1', cat: 'Advisory', dec: true, autosar: 'A13-5-5', sev: 'MINOR', debt: 10,
    name: ['Symmetrical operators should only be implemented as non-member functions', '대칭 연산자는 비멤버 함수로만 구현해야 합니다'],
    why: ['A member operator does not allow implicit conversion of its left operand, so "a + 1" works but "1 + a" does not.', '멤버 연산자는 왼쪽 피연산자의 암시적 변환을 허용하지 않아 "a + 1" 은 되지만 "1 + a" 는 안 됩니다.'],
    fix: ['Implement the operator as a non-member (for example a hidden friend).', '연산자를 비멤버 (예: 숨은 friend) 로 구현하세요.'],
    check(unit, api) {
      for (const fd of operators(unit)) {
        if (!SYMMETRIC.has(fd.name) || !isMember(unit, fd) || U.paramCount(fd) !== 1) continue;
        api.report(fd, M(`Symmetrical operator '${fd.name}' is a member function.`, `대칭 연산자 '${fd.name}' 가 멤버 함수입니다.`));
      }
    },
  }),
  R({
    id: '17.8.1', cat: 'Required', dec: true, autosar: 'A14-8-2', sev: 'MAJOR', debt: 10,
    name: ['Function templates shall not be explicitly specialized', '함수 템플릿은 명시적으로 특수화하면 안 됩니다'],
    why: ['Explicit specialisations do not take part in overload resolution, so the function chosen can be surprising.', '명시적 특수화는 오버로드 해석에 참여하지 않아 선택되는 함수가 의외일 수 있습니다.'],
    fix: ['Provide an ordinary overload instead of a specialisation.', '특수화 대신 일반 오버로드를 제공하세요.'],
    check(unit, api) {
      for (const t of U.ix(unit).get('TemplateDecl')) {
        if (!t.isSpecialization || !t.decl || t.decl.type !== 'Declaration') continue;
        for (const d of t.decl.declarators || []) {
          if (d.type === 'FunctionDecl') api.report(d, M(`Function template '${d.qname || d.name}' is explicitly specialised.`, `함수 템플릿 '${d.qname || d.name}' 이 명시적으로 특수화되었습니다.`));
        }
      }
    },
  }),
];
