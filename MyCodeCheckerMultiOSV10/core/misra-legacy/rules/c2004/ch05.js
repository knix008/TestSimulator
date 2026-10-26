'use strict';

// MISRA C:2004 chapter 5 — identifiers.

const { C04, M } = require('../../lib/meta');
const I = require('../../lib/ids');

const { significance, staticReuse, nameSpaces, reuse } = I;

module.exports = [
  C04({
    id: '5.1', cat: 'R', dec: true, c2012: '5.1',
    name: ['Identifiers shall not rely on more than 31 significant characters', '식별자는 31자를 넘는 유효 문자에 의존하지 않아야 합니다'],
    why: ['C90 compilers may ignore characters beyond the 31st, turning two names into one.', 'C90 컴파일러는 31번째 이후 문자를 무시할 수 있어 두 이름이 하나가 됩니다.'],
    fix: ['Make the names differ within their first 31 characters.', '이름이 처음 31자 안에서 달라지도록 바꾸세요.'],
    project(project, api) { significance(project, api, 31); },
  }),
  C04({
    id: '5.2', cat: 'R', dec: true, c2012: '5.3',
    name: ['An inner identifier shall not hide an outer one', '안쪽 범위의 식별자가 바깥 식별자를 가리면 안 됩니다'],
    why: ['Hiding makes it unclear which object a name refers to.', '가리기는 이름이 어떤 객체를 가리키는지 불분명하게 만듭니다.'],
    fix: ['Rename the inner identifier.', '안쪽 식별자의 이름을 바꾸세요.'],
    reuse: 'misra-c:5.3',
  }),
  C04({
    id: '5.3', cat: 'R', dec: true, c2012: '5.6',
    name: ['A typedef name shall be unique', 'typedef 이름은 고유해야 합니다'],
    why: ['Reusing a typedef name for another entity confuses readers and tools.', 'typedef 이름을 다른 개체에 재사용하면 사람과 도구가 혼동합니다.'],
    fix: ['Give the other entity a different name.', '다른 개체에 다른 이름을 주세요.'],
    reuse: 'misra-c:5.6',
  }),
  C04({
    id: '5.4', cat: 'R', dec: true, c2012: '5.7',
    name: ['A tag name shall be unique', '태그 이름은 고유해야 합니다'],
    why: ['Two types with the same tag in different scopes are easily mixed up.', '범위가 다른 두 형식이 같은 태그를 쓰면 쉽게 혼동됩니다.'],
    fix: ['Use one tag per type across the project.', '프로젝트 전체에서 형식마다 하나의 태그를 사용하세요.'],
    reuse: 'misra-c:5.7',
  }),
  C04({
    id: '5.5', cat: 'A', dec: true, c2012: '5.8',
    name: ['Names of static-storage objects and functions should not be reused', '정적 저장 기간 객체와 함수의 이름을 재사용하지 않아야 합니다'],
    why: ['A second entity with the same name can be mistaken for the global one.', '같은 이름의 두 번째 개체를 전역 개체로 착각할 수 있습니다.'],
    fix: ['Rename the other identifier.', '다른 식별자의 이름을 바꾸세요.'],
    project: staticReuse,
  }),
  C04({
    id: '5.6', cat: 'A', dec: true,
    name: ['No identifier should be spelled the same in two name spaces', '두 이름 공간에서 같은 철자의 식별자를 쓰지 않아야 합니다'],
    why: ['A tag, a label and a variable with one spelling are legal but confusing.', '철자가 같은 태그, 레이블, 변수는 허용되지만 혼란스럽습니다.'],
    fix: ['Rename one of the identifiers; struct and union member names are exempt.', '식별자 중 하나의 이름을 바꾸세요. 구조체와 공용체 멤버 이름은 예외입니다.'],
    project: nameSpaces,
  }),
  C04({
    id: '5.7', cat: 'A', dec: true,
    name: ['No identifier name should be reused', '식별자 이름을 재사용하지 않아야 합니다'],
    why: ['Each name standing for one entity makes code easier to read and search.', '이름마다 하나의 개체만 가리키면 코드를 읽고 찾기 쉽습니다.'],
    fix: ['Choose distinct names for distinct entities.', '서로 다른 개체에 서로 다른 이름을 고르세요.'],
    project: reuse,
  }),
];
