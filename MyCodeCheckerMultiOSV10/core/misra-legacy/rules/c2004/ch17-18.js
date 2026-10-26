'use strict';

// MISRA C:2004 chapter 17 — pointers and arrays; chapter 18 — structures and unions.

const { C04, M } = require('../../lib/meta');
const U = require('../../lib/util');
const P = require('../../lib/ptr');

const { T } = U;

function incompleteRecords(unit, api) {
  const done = new Set();
  for (const r of U.get(unit, 'RecordDecl')) {
    if (r.isDefinition || !r.name || r.loc.file !== unit.file) continue;
    const t = r.ctype && T.canonical(r.ctype);
    if (!t || t.complete || done.has(t)) continue;
    done.add(t);
    api.report(r, M(`'${r.tag} ${r.name}' is still incomplete at the end of the translation unit.`, `'${r.tag} ${r.name}'가 번역 단위 끝까지 불완전한 형식입니다.`));
  }
}

module.exports = [
  C04({
    id: '17.1', cat: 'R', dec: false, type: 'BUG', c2012: '18.1', cwe: 'CWE-823',
    name: ['Pointer arithmetic shall only be applied to pointers into arrays', '포인터 연산은 배열을 가리키는 포인터에만 적용해야 합니다'],
    why: ['Moving a pointer away from a single object leaves it pointing at nothing valid.', '단일 객체에서 포인터를 옮기면 유효하지 않은 곳을 가리킵니다.'],
    fix: ['Only do arithmetic on pointers that address elements of an array.', '배열 요소를 가리키는 포인터에서만 연산하세요.'],
    check: P.arithmeticOnScalar,
  }),
  C04({
    id: '17.2', cat: 'R', dec: false, type: 'BUG', c2012: '18.2',
    name: ['Pointers shall only be subtracted within the same array', '포인터 빼기는 같은 배열 안에서만 해야 합니다'],
    why: ['Subtracting pointers to different objects is undefined behaviour.', '서로 다른 객체를 가리키는 포인터를 빼면 정의되지 않은 동작입니다.'],
    fix: ['Subtract only pointers into the same array.', '같은 배열 안을 가리키는 포인터만 빼세요.'],
    reuse: 'misra-c:18.2',
  }),
  C04({
    id: '17.3', cat: 'R', dec: false, type: 'BUG', c2012: '18.3',
    name: ['Relational operators shall only compare pointers into the same array', '관계 연산자는 같은 배열 안의 포인터만 비교해야 합니다'],
    why: ['Ordering pointers to unrelated objects is undefined behaviour.', '관계없는 객체를 가리키는 포인터의 대소 비교는 정의되지 않은 동작입니다.'],
    fix: ['Compare pointers only within one array.', '한 배열 안에서만 포인터를 비교하세요.'],
    reuse: 'misra-c:18.3',
  }),
  C04({
    id: '17.4', cat: 'R', dec: true, c2012: '18.4',
    name: ['Array indexing shall be the only form of pointer arithmetic', '배열 인덱싱만 포인터 연산으로 사용해야 합니다'],
    why: ['Explicit pointer arithmetic is harder to check for bounds than indexing.', '명시적 포인터 연산은 인덱싱보다 범위 검사가 어렵습니다.'],
    fix: ['Declare the object as an array and use subscripts.', '객체를 배열로 선언하고 첨자를 사용하세요.'],
    check(unit, api) { P.ptrArithmetic(unit, api, true); },
  }),
  C04({
    id: '17.5', cat: 'A', dec: true, c2012: '18.5',
    name: ['Declarations should have at most two levels of pointer indirection', '선언은 포인터 간접 참조를 두 단계 이하로 가져야 합니다'],
    why: ['Deep indirection is hard to understand and to use correctly.', '깊은 간접 참조는 이해하고 올바르게 쓰기 어렵습니다.'],
    fix: ['Introduce a typedef or restructure the data.', 'typedef를 도입하거나 데이터를 재구성하세요.'],
    reuse: 'misra-c:18.5',
  }),
  C04({
    id: '17.6', cat: 'R', dec: false, type: 'BUG', c2012: '18.6', cwe: 'CWE-562',
    name: ['The address of an automatic object shall not outlive it', '자동 객체의 주소가 객체보다 오래 남으면 안 됩니다'],
    why: ['A pointer to an object that no longer exists is dangling.', '더 이상 존재하지 않는 객체를 가리키는 포인터는 댕글링 포인터입니다.'],
    fix: ['Do not store or return the address of a local object beyond its lifetime.', '지역 객체의 주소를 수명 이후까지 저장하거나 반환하지 마세요.'],
    reuse: 'misra-c:18.6',
  }),
  // ---------------------------------------------------------------- chapter 18
  C04({
    id: '18.1', cat: 'R', dec: true,
    name: ['Structure and union types shall be complete at the end of a translation unit', '구조체와 공용체 형식은 번역 단위 끝에서 완전해야 합니다'],
    why: ['An incomplete type cannot be checked for size or layout.', '불완전한 형식은 크기나 배치를 검사할 수 없습니다.'],
    fix: ['Provide the full definition of the type in the translation unit.', '번역 단위 안에서 형식의 완전한 정의를 제공하세요.'],
    check: incompleteRecords,
  }),
  C04({
    id: '18.2', cat: 'R', dec: false, type: 'BUG', c2012: '19.1',
    name: ['An object shall not be assigned to an overlapping object', '객체를 겹치는 객체에 대입하지 않아야 합니다'],
    why: ['Copying between overlapping objects is undefined behaviour.', '겹치는 객체 사이의 복사는 정의되지 않은 동작입니다.'],
    fix: ['Use memmove or a temporary copy.', 'memmove나 임시 복사본을 사용하세요.'],
    reuse: 'misra-c:19.1',
  }),
  C04({
    id: '18.3', cat: 'R', manual: true,
    name: ['Memory shall not be reused for unrelated purposes', '메모리를 관계없는 용도로 재사용하지 않아야 합니다'],
    why: ['Reusing storage for different data makes lifetimes and aliasing unclear.', '저장 공간을 다른 데이터에 재사용하면 수명과 별칭이 불분명해집니다.'],
    fix: ['Give each purpose its own object.', '용도마다 별도의 객체를 쓰세요.'],
  }),
  C04({
    id: '18.4', cat: 'R', dec: true, c2012: '19.2',
    name: ['Unions shall not be used', '공용체를 사용하지 않아야 합니다'],
    why: ['Reading a union member other than the last written one is implementation-defined.', '마지막으로 쓴 멤버가 아닌 공용체 멤버를 읽는 것은 구현 정의입니다.'],
    fix: ['Use a structure or separate objects.', '구조체나 별도의 객체를 사용하세요.'],
    reuse: 'misra-c:19.2',
  }),
];
