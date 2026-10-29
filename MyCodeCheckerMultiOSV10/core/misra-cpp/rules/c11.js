'use strict';

// MISRA C++:2023 chapter 11 — declarators and initialisation.

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const F = require('../lib/flow');
const { cf } = U;

function inRangeForOrCond(v) {
  const d = U.parent(v);
  if (!d || d.type !== 'Declaration') return false;
  if (d.condition) return true;
  const p = U.parent(d);
  return !!(p && p.type === 'RangeForStmt' && p.decl === d);
}

module.exports = [
  R({
    id: '11.3.1', cat: 'Advisory', dec: true, autosar: 'A18-1-1', sev: 'MINOR', debt: 10,
    name: ['Variables of array type should not be declared', '배열 타입의 변수는 선언하지 않아야 합니다'],
    why: ['C-style arrays decay to pointers, lose their size and invite out-of-bounds access.', 'C 스타일 배열은 포인터로 변환되며 크기를 잃고 범위 밖 접근을 부릅니다.'],
    fix: ['Use std::array (or another container).', 'std::array (또는 다른 컨테이너) 를 쓰세요.'],
    check(unit, api) {
      api = U.cppOnlyFix(api); // a header shared with C must stay C
      for (const v of U.ix(unit).get('VarDecl', 'FieldDecl')) {
        if (!v.ctype || U.canon(v.ctype).kind !== 'array') continue;
        api.report(v, M(`'${v.name}' is declared as a C-style array of type '${U.tstr(v.ctype)}'.`, `'${v.name}' 가 C 스타일 배열 '${U.tstr(v.ctype)}' 로 선언되었습니다.`));
      }
    },
  }),
  R({
    id: '11.3.2', cat: 'Advisory', dec: true, autosar: 'A5-0-3', sev: 'MINOR', debt: 10,
    name: ['The declaration of an object should contain no more than two levels of pointer indirection', '객체 선언의 포인터 간접 단계는 두 단계를 넘지 않아야 합니다'],
    why: ['More than two levels of indirection make code hard to understand.', '간접 단계가 둘을 넘으면 코드를 이해하기 어렵습니다.'],
    fix: ['Introduce a type alias or a small structure to reduce indirection.', '타입 별칭이나 작은 구조체를 도입해 간접 단계를 줄이세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      const chk = (n, t, what, ko) => {
        const d = t ? U.ptrDepth(t) : 0;
        if (d > 2) api.report(n, n.name
          ? M(`${what} '${n.name}' has ${d} levels of pointer indirection.`, `${ko} '${n.name}' 의 포인터 간접 단계가 ${d}입니다.`)
          : M(`An unnamed ${what.toLowerCase()} has ${d} levels of pointer indirection.`, `이름 없는 ${ko} 의 포인터 간접 단계가 ${d}입니다.`));
      };
      for (const v of x.get('VarDecl', 'FieldDecl')) chk(v, v.ctype, 'Object', '객체');
      for (const p of x.get('ParamDecl')) chk(p, p.declaredType || p.ctype, 'Parameter', '매개변수');
      for (const t of x.get('TypedefDecl')) chk(t, t.ctype, 'Type alias', '타입 별칭');
      for (const a of x.get('AliasDecl')) chk(a, a.ctype, 'Type alias', '타입 별칭');
    },
  }),
  R({
    id: '11.6.1', cat: 'Advisory', dec: true, autosar: 'A8-5-0', sev: 'MINOR', debt: 2,
    name: ['All variables should be initialized', '모든 변수는 초기화해야 합니다'],
    why: ['An initializer at the point of declaration removes any chance of reading an indeterminate value.', '선언 시점의 초기화는 불확정 값을 읽을 가능성을 없앱니다.'],
    fix: ['Give the variable an initializer (for example "int n{};").', '변수에 초기값을 주세요 (예: "int n{};").'],
    check(unit, api) {
      for (const v of U.ix(unit).get('VarDecl')) {
        if (v.init || !v.symbol || v.symbol.storage !== 'automatic') continue;
        if (inRangeForOrCond(v)) continue;
        const c = U.canon(v.ctype || U.T.T.unknown);
        const base = c.kind === 'array' ? U.canon(c.of) : c;
        if (!['int', 'float', 'pointer', 'enum'].includes(base.kind)) continue;
        api.report(v, M(`Local variable '${v.name}' is declared without an initializer.`, `지역 변수 '${v.name}' 가 초기값 없이 선언되었습니다.`));
      }
    },
  }),
  R({
    id: '11.6.2', cat: 'Mandatory', dec: false, type: 'BUG', autosar: 'A8-5-0', cert: 'EXP53-CPP', cwe: 'CWE-457', sev: 'CRITICAL', debt: 10,
    name: ['The value of an object must not be read before it has been set', '객체의 값은 설정되기 전에 읽으면 안 됩니다'],
    why: ['Reading an indeterminate value is undefined behaviour.', '불확정 값을 읽는 것은 정의되지 않은 동작입니다.'],
    fix: ['Initialise the object at its declaration or assign it on every path before the read.', '선언에서 초기화하거나 읽기 전에 모든 경로에서 대입하세요.'],
    check(unit, api) {
      for (const fn of F.bodies(unit)) {
        for (const r of F.uninitReads(fn)) api.report(r.node, M(`'${r.sym.name}' may be read before it has been given a value.`, `'${r.sym.name}' 가 값이 설정되기 전에 읽힐 수 있습니다.`));
      }
    },
  }),
  R({
    id: '11.6.3', cat: 'Required', dec: true, sev: 'MAJOR', debt: 5,
    name: ['Within an enumerator list, the value of an implicitly-specified enumeration constant shall be unique', '열거자 목록에서 암시적으로 값이 정해진 열거 상수의 값은 고유해야 합니다'],
    why: ['An implicit value that collides with another enumerator is almost always a mistake made while editing the list.', '다른 열거자와 겹치는 암시적 값은 거의 언제나 목록을 고치다 생긴 실수입니다.'],
    fix: ['Give the enumerator an explicit value, or reorder the list.', '열거자에 명시적인 값을 주거나 목록 순서를 바꾸세요.'],
    check(unit, api) {
      for (const e of U.ix(unit).get('EnumDecl')) {
        const list = e.enumerators || [];
        for (const k of list) {
          if (k.value || k.constValue === undefined || k.constValue === null) continue;
          const dup = list.find((o) => o !== k && o.constValue === k.constValue);
          if (dup) api.report(k, M(`Implicit enumerator '${k.name}' has the value ${k.constValue}, the same as '${dup.name}'.`, `암시적 열거자 '${k.name}' 의 값 ${k.constValue} 가 '${dup.name}' 와 같습니다.`));
        }
      }
    },
  }),
];

void cf;
