'use strict';

// MISRA C++:2008 chapter 1 — general; chapter 2 — lexical conventions.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');
const L = require('../../lib/lex');
const I = require('../../lib/ids');

const TYPE_KINDS = new Set(['typedef', 'tag']);
const OBJ_KINDS = new Set(['variable', 'function', 'enumerator', 'parameter']);

// A (qualified) type name that is also used for another entity.
function uniqueTypeName(project, api, kinds, what) {
  const all = I.entities(project);
  const owners = new Map();
  for (const e of all) if (kinds(e.sym) && !owners.has(e.name)) owners.set(e.name, e);
  for (const e of all) {
    const o = owners.get(e.name);
    if (!o || o.key === e.key || e.sym.kind === 'field' || e.sym.kind === 'label') continue;
    // typedef struct S { } S; and the constructor / destructor of a class are the same name by design
    if (TYPE_KINDS.has(e.sym.kind) && TYPE_KINDS.has(o.sym.kind) && e.sym.kind !== o.sym.kind) continue;
    if (e.sym.kind === 'function' && e.sym.member) continue;
    api.report(e.loc, M(`'${e.name}' reuses the name of the ${what[0]} declared at line ${o.loc.line}.`, `'${e.name}'가 ${o.loc.line}행에 선언된 ${what[1]}의 이름을 재사용합니다.`));
  }
}

// A type and an object or function with the same name in one scope.
function typeAndObject(unit, api) {
  const byScope = new Map();
  for (const s of unit.symbols || []) {
    if (!I.isUserSym(s) || !s.scope) continue;
    if (!TYPE_KINDS.has(s.kind) && !OBJ_KINDS.has(s.kind)) continue;
    let m = byScope.get(s.scope);
    if (!m) byScope.set(s.scope, (m = new Map()));
    const k = s.name;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s);
  }
  for (const m of byScope.values()) {
    for (const [name, list] of m) {
      const t = list.find((s) => TYPE_KINDS.has(s.kind));
      const o = list.find((s) => OBJ_KINDS.has(s.kind) && !(s.kind === 'function' && s.member));
      if (!t || !o) continue;
      const loc = I.locOf(o);
      if (loc) api.report(loc, M(`'${name}' names both a type and an object or function in the same scope.`, `'${name}'가 같은 범위에서 형식과 객체 또는 함수를 함께 가리킵니다.`));
    }
  }
}

function lowercaseSuffix(unit, api) {
  for (const n of U.get(unit, 'IntegerLiteral', 'FloatingLiteral')) {
    if (n.loc.macro || !n.suffix) continue;
    if (/[a-z]/.test(n.suffix)) api.report(n, M(`The literal suffix '${n.suffix}' of '${n.raw}' is not upper case.`, `'${n.raw}'의 리터럴 접미사 '${n.suffix}'가 대문자가 아닙니다.`));
  }
}

const DOC = (id, name, why, fix) => CPP08({ id, cat: 'D', manual: true, name, why, fix });

module.exports = [
  CPP08({
    id: '1-0-1', cat: 'R', dec: true, cpp2023: '4.1.1',
    name: ['All code shall conform to ISO/IEC 14882', '모든 코드는 ISO/IEC 14882를 따라야 합니다'],
    why: ['Compiler extensions and ill-formed code are not portable and may be misunderstood.', '컴파일러 확장과 잘못된 형식의 코드는 이식성이 없고 오해될 수 있습니다.'],
    fix: ['Use only standard C++ and fix ill-formed constructs.', '표준 C++만 사용하고 잘못된 형식의 구문을 고치세요.'],
    reuse: 'misra-cpp:4.1.1',
  }),
  DOC('1-0-2', ['Multiple compilers shall only be used with a common defined interface', '여러 컴파일러는 공통의 정의된 인터페이스가 있을 때만 사용해야 합니다'],
    ['Different compilers may disagree on layout and calling conventions.', '서로 다른 컴파일러는 배치와 호출 규약이 다를 수 있습니다.'],
    ['Document and verify the interface between the parts.', '각 부분 사이의 인터페이스를 문서화하고 검증하세요.']),
  DOC('1-0-3', ['Integer division behaviour of the compiler shall be documented', '컴파일러의 정수 나눗셈 동작을 문서화해야 합니다'],
    ['Rounding of negative quotients was implementation-defined in C++03.', 'C++03에서 음수 몫의 반올림은 구현 정의였습니다.'],
    ['Record how the compiler rounds negative division results.', '컴파일러가 음수 나눗셈 결과를 어떻게 반올림하는지 기록하세요.']),
  DOC('2-2-1', ['The character set and its encoding shall be documented', '문자 집합과 인코딩을 문서화해야 합니다'],
    ['Character values and string handling depend on the encoding.', '문자 값과 문자열 처리는 인코딩에 따라 달라집니다.'],
    ['Record the source and execution character sets.', '소스 및 실행 문자 집합을 기록하세요.']),
  CPP08({
    id: '2-3-1', cat: 'R', dec: true, cpp2023: '5.0.1', c2012: '4.2',
    name: ['Trigraphs shall not be used', '삼중 문자를 사용하지 않아야 합니다'],
    why: ['Trigraphs are replaced silently, even in string literals.', '삼중 문자는 문자열 리터럴 안에서도 조용히 치환됩니다.'],
    fix: ['Write the characters directly or escape the question marks.', '문자를 직접 쓰거나 물음표를 이스케이프하세요.'],
    check(unit, api) { L.trigraphs(unit, api, 'cpp08-2-3-1'); },
  }),
  CPP08({
    id: '2-5-1', cat: 'A', dec: true,
    name: ['Digraphs should not be used', '이중 문자를 사용하지 않아야 합니다'],
    why: ['Digraphs such as <: and %> make code hard to read.', '<:나 %> 같은 이중 문자는 코드를 읽기 어렵게 합니다.'],
    fix: ['Write the ordinary punctuator.', '보통의 구두점을 쓰세요.'],
    check(unit, api) { L.digraphs(unit, api, 'cpp08-2-5-1'); },
  }),
  CPP08({
    id: '2-7-1', cat: 'R', dec: true, cpp2023: '5.7.1', c2012: '3.1',
    name: ['The sequence /* shall not be used inside a C-style comment', 'C 스타일 주석 안에서 /* 시퀀스를 사용하지 않아야 합니다'],
    why: ['A nested /* usually means a comment was not closed.', '중첩된 /*는 보통 주석이 닫히지 않았다는 뜻입니다.'],
    fix: ['Close the comment before the next /*.', '다음 /* 전에 주석을 닫으세요.'],
    check(unit, api) { L.nestedBlockComment(unit, api, 'cpp08-2-7-1'); },
  }),
  CPP08({
    id: '2-7-2', cat: 'R', dec: false, cpp2023: 'dir-5.7.2', c2012: 'dir-4.4',
    name: ['Code shall not be commented out with C-style comments', 'C 스타일 주석으로 코드를 주석 처리하지 않아야 합니다'],
    why: ['Commented-out code is not compiled or maintained.', '주석 처리된 코드는 컴파일되거나 유지보수되지 않습니다.'],
    fix: ['Delete the code or use conditional compilation.', '코드를 지우거나 조건부 컴파일을 사용하세요.'],
    check(unit, api) { L.commentedOut(unit, api, 'cpp08-2-7-2', 'block'); },
  }),
  CPP08({
    id: '2-7-3', cat: 'A', dec: false, cpp2023: 'dir-5.7.2', c2012: 'dir-4.4',
    name: ['Code should not be commented out with C++ comments', 'C++ 주석으로 코드를 주석 처리하지 않아야 합니다'],
    why: ['Commented-out code is not compiled or maintained.', '주석 처리된 코드는 컴파일되거나 유지보수되지 않습니다.'],
    fix: ['Delete the code or use conditional compilation.', '코드를 지우거나 조건부 컴파일을 사용하세요.'],
    check(unit, api) { L.commentedOut(unit, api, 'cpp08-2-7-3', 'line'); },
  }),
  CPP08({
    id: '2-10-1', cat: 'R', dec: true, c2012: 'dir-4.5',
    name: ['Different identifiers shall be typographically unambiguous', '서로 다른 식별자는 글자 모양으로 혼동되지 않아야 합니다'],
    why: ['Names that differ only in l/1, O/0 or underscores are easily confused.', 'l/1, O/0, 밑줄만 다른 이름은 쉽게 혼동됩니다.'],
    fix: ['Rename one of the identifiers.', '식별자 중 하나의 이름을 바꾸세요.'],
    reuse: 'misra-c:dir-4.5',
  }),
  CPP08({
    id: '2-10-2', cat: 'R', dec: true, cpp2023: '6.4.1',
    name: ['An inner identifier shall not hide an outer one', '안쪽 식별자가 바깥 식별자를 가리면 안 됩니다'],
    why: ['Hiding makes it unclear which entity a name refers to.', '가리기는 이름이 어떤 개체를 가리키는지 불분명하게 만듭니다.'],
    fix: ['Rename the inner identifier.', '안쪽 식별자의 이름을 바꾸세요.'],
    reuse: 'misra-cpp:6.4.1',
  }),
  CPP08({
    id: '2-10-3', cat: 'R', dec: true, c2012: '5.6',
    name: ['A typedef name shall be unique', 'typedef 이름은 고유해야 합니다'],
    why: ['Reusing a typedef name for another entity is confusing.', 'typedef 이름을 다른 개체에 재사용하면 혼란스럽습니다.'],
    fix: ['Give the other entity a different name.', '다른 개체에 다른 이름을 주세요.'],
    project(project, api) { uniqueTypeName(project, api, (s) => s.kind === 'typedef', ['typedef', 'typedef']); },
  }),
  CPP08({
    id: '2-10-4', cat: 'R', dec: true, c2012: '5.7',
    name: ['A class, union or enum name shall be unique', '클래스, 공용체, 열거형 이름은 고유해야 합니다'],
    why: ['Reusing a type name for another entity is confusing.', '형식 이름을 다른 개체에 재사용하면 혼란스럽습니다.'],
    fix: ['Give the other entity a different name.', '다른 개체에 다른 이름을 주세요.'],
    project(project, api) { uniqueTypeName(project, api, (s) => s.kind === 'tag', ['type', '형식']); },
  }),
  CPP08({
    id: '2-10-5', cat: 'A', dec: true, c2012: '5.8',
    name: ['Names of static-storage non-member objects and functions should not be reused', '정적 저장 기간 비멤버 객체와 함수의 이름을 재사용하지 않아야 합니다'],
    why: ['Another entity with the same name can be mistaken for it.', '같은 이름의 다른 개체를 그것으로 착각할 수 있습니다.'],
    fix: ['Rename the other identifier.', '다른 식별자의 이름을 바꾸세요.'],
    project: I.staticReuse,
  }),
  CPP08({
    id: '2-10-6', cat: 'R', dec: true,
    name: ['A name shall not refer to both a type and an object or function in one scope', '한 범위에서 이름이 형식과 객체 또는 함수를 함께 가리키면 안 됩니다'],
    why: ['The object hides the type, which then needs an elaborated specifier.', '객체가 형식을 가려 형식에 정교화 지정자가 필요해집니다.'],
    fix: ['Rename the type or the object.', '형식이나 객체의 이름을 바꾸세요.'],
    check: typeAndObject,
  }),
  CPP08({
    id: '2-13-1', cat: 'R', dec: true, cpp2023: '5.13.1',
    name: ['Only standard escape sequences shall be used', '표준 이스케이프 시퀀스만 사용해야 합니다'],
    why: ['Unknown escape sequences are conditionally supported with implementation-defined meaning.', '알 수 없는 이스케이프 시퀀스는 조건부로 지원되며 의미가 구현 정의입니다.'],
    fix: ['Use an escape sequence defined by the standard.', '표준에 정의된 이스케이프 시퀀스를 사용하세요.'],
    check: L.undefinedEscapes,
  }),
  CPP08({
    id: '2-13-2', cat: 'R', dec: true, cpp2023: '5.13.3', c2012: '7.1',
    name: ['Octal constants and octal escapes shall not be used', '8진 상수와 8진 이스케이프를 사용하지 않아야 합니다'],
    why: ['A leading zero silently makes a number octal.', '앞의 0 하나로 숫자가 조용히 8진수가 됩니다.'],
    fix: ['Write the value in decimal or hexadecimal; 0 and \\0 are allowed.', '값을 10진수나 16진수로 쓰세요. 0과 \\0은 허용됩니다.'],
    check: L.octals,
  }),
  CPP08({
    id: '2-13-3', cat: 'R', dec: true, cpp2023: '5.13.4', c2012: '7.2',
    name: ['Unsigned octal and hexadecimal literals shall have a U suffix', '부호 없는 8진 및 16진 리터럴에는 U 접미사를 붙여야 합니다'],
    why: ['A large hexadecimal literal silently becomes unsigned.', '큰 16진 리터럴은 조용히 부호 없는 형식이 됩니다.'],
    fix: ['Add a U suffix.', 'U 접미사를 붙이세요.'],
    reuse: 'misra-cpp:5.13.4',
  }),
  CPP08({
    id: '2-13-4', cat: 'R', dec: true, cpp2023: '5.13.5', c2012: '7.3',
    name: ['Literal suffixes shall be upper case', '리터럴 접미사는 대문자여야 합니다'],
    why: ['A lower-case l looks like the digit 1.', '소문자 l은 숫자 1처럼 보입니다.'],
    fix: ['Write the suffix in upper case, for example 10UL or 1.0F.', '접미사를 대문자로 쓰세요. 예: 10UL, 1.0F.'],
    check: lowercaseSuffix,
  }),
  CPP08({
    id: '2-13-5', cat: 'R', dec: true, cpp2023: '5.13.7',
    name: ['Narrow and wide string literals shall not be concatenated', '좁은 문자열과 넓은 문자열 리터럴을 이어 붙이지 않아야 합니다'],
    why: ['Concatenating literals of different encodings was undefined or conditionally supported.', '인코딩이 다른 리터럴의 연결은 정의되지 않거나 조건부 지원이었습니다.'],
    fix: ['Give every part the same prefix.', '모든 부분에 같은 접두사를 주세요.'],
    reuse: 'misra-cpp:5.13.7',
  }),
];
