'use strict';

// MISRA C:2004 chapter 2 — language extensions; chapter 3 — documentation;
// chapter 4 — character sets.

const { C04 } = require('../../lib/meta');
const L = require('../../lib/lex');

module.exports = [
  C04({
    id: '2.1', cat: 'R', dec: true, c2012: 'dir-4.3',
    name: ['Assembly language shall be encapsulated and isolated', '어셈블리 언어는 캡슐화하고 격리해야 합니다'],
    why: ['Inline assembly mixed into C code is hard to port and to review.', 'C 코드에 섞인 인라인 어셈블리는 이식과 검토가 어렵습니다.'],
    fix: ['Move the assembly into a dedicated function or macro that contains nothing else.', '어셈블리를 다른 코드가 없는 전용 함수나 매크로로 옮기세요.'],
    reuse: 'misra-c:dir-4.3',
  }),
  C04({
    id: '2.2', cat: 'R', dec: true,
    name: ['Only /* ... */ comments shall be used', '/* ... */ 주석만 사용해야 합니다'],
    why: ['// comments are not part of C90 and interact badly with line splicing and some preprocessors.', '// 주석은 C90에 없으며 줄 이음 및 일부 전처리기와 잘 맞지 않습니다.'],
    fix: ['Rewrite the comment as /* ... */.', '주석을 /* ... */ 형식으로 바꾸세요.'],
    check(unit, api) { L.lineComments(unit, api, 'c04-2.2'); },
  }),
  C04({
    id: '2.3', cat: 'R', dec: true, c2012: '3.1',
    name: ['The sequence /* shall not appear inside a comment', '주석 안에 /* 시퀀스가 있으면 안 됩니다'],
    why: ['A nested /* usually means a comment was not closed and code is silently commented out.', '중첩된 /*는 보통 주석이 닫히지 않아 코드가 몰래 주석 처리되었다는 뜻입니다.'],
    fix: ['Close the comment before the next /* or remove the inner sequence.', '다음 /* 전에 주석을 닫거나 안쪽 시퀀스를 지우세요.'],
    check(unit, api) { L.nestedBlockComment(unit, api, 'c04-2.3'); },
  }),
  C04({
    id: '2.4', cat: 'A', dec: false, c2012: 'dir-4.4',
    name: ['Code should not be commented out', '코드를 주석 처리하지 않아야 합니다'],
    why: ['Commented-out code is not compiled or maintained and confuses readers.', '주석 처리된 코드는 컴파일되거나 유지보수되지 않아 읽는 사람을 혼란스럽게 합니다.'],
    fix: ['Delete the code or use conditional compilation with a clear reason.', '코드를 지우거나 이유가 분명한 조건부 컴파일을 사용하세요.'],
    reuse: 'misra-c:dir-4.4',
  }),
  // ---------------------------------------------------------------- chapter 3
  C04({
    id: '3.1', cat: 'R', manual: true, c2012: 'dir-1.1',
    name: ['Implementation-defined behaviour shall be documented', '구현 정의 동작은 문서화해야 합니다'],
    why: ['Reviewers need to know which implementation choices the code depends on.', '검토자는 코드가 어떤 구현 선택에 의존하는지 알아야 합니다.'],
    fix: ['List and explain every implementation-defined behaviour that is relied upon.', '의존하는 모든 구현 정의 동작을 나열하고 설명하세요.'],
  }),
  C04({
    id: '3.2', cat: 'R', manual: true,
    name: ['The character set and encoding shall be documented', '문자 집합과 인코딩을 문서화해야 합니다'],
    why: ['Character values and string handling depend on the execution character set.', '문자 값과 문자열 처리는 실행 문자 집합에 따라 달라집니다.'],
    fix: ['Record the source and execution character sets and their encodings.', '소스 및 실행 문자 집합과 그 인코딩을 기록하세요.'],
  }),
  C04({
    id: '3.3', cat: 'A', manual: true,
    name: ['Integer division behaviour should be determined and documented', '정수 나눗셈 동작을 확인하고 문서화해야 합니다'],
    why: ['In C90 the rounding of negative integer division is implementation-defined.', 'C90에서는 음수 정수 나눗셈의 반올림 방식이 구현 정의입니다.'],
    fix: ['Check how the compiler rounds negative quotients and record it.', '컴파일러가 음수 몫을 어떻게 반올림하는지 확인하고 기록하세요.'],
  }),
  C04({
    id: '3.4', cat: 'R', dec: false,
    name: ['Every #pragma shall be documented', '모든 #pragma는 문서화해야 합니다'],
    why: ['Pragmas change compiler behaviour in implementation-specific ways.', '#pragma는 구현마다 다른 방식으로 컴파일러 동작을 바꿉니다.'],
    fix: ['Explain each #pragma in a comment next to it.', '각 #pragma를 바로 옆 주석으로 설명하세요.'],
    check(unit, api) { L.undocumentedPragma(unit, api, 'c04-3.4'); },
  }),
  C04({
    id: '3.5', cat: 'R', manual: true,
    name: ['Bit-field layout relied upon shall be documented', '의존하는 비트 필드 배치는 문서화해야 합니다'],
    why: ['The order and packing of bit-fields are implementation-defined.', '비트 필드의 순서와 패킹은 구현 정의입니다.'],
    fix: ['Document the layout the code relies on or avoid relying on it.', '코드가 의존하는 배치를 문서화하거나 의존하지 마세요.'],
  }),
  C04({
    id: '3.6', cat: 'R', manual: true,
    name: ['Production libraries shall be written to a suitable standard', '배포 코드의 라이브러리는 적절한 표준으로 작성해야 합니다'],
    why: ['Library code runs with the same safety requirements as the application.', '라이브러리 코드도 응용 프로그램과 같은 안전 요구사항으로 실행됩니다.'],
    fix: ['Verify the libraries against this standard or a qualified equivalent.', '라이브러리를 이 표준이나 그에 준하는 기준으로 검증하세요.'],
  }),
  // ---------------------------------------------------------------- chapter 4
  C04({
    id: '4.1', cat: 'R', dec: true,
    name: ['Only standard escape sequences shall be used', '표준 이스케이프 시퀀스만 사용해야 합니다'],
    why: ['Unknown escape sequences have undefined meaning.', '알 수 없는 이스케이프 시퀀스는 의미가 정의되어 있지 않습니다.'],
    fix: ['Use one of the escape sequences defined by the C standard.', 'C 표준에 정의된 이스케이프 시퀀스 중 하나를 사용하세요.'],
    check(unit, api) { L.undefinedEscapes(unit, api); },
  }),
  C04({
    id: '4.2', cat: 'R', dec: true, c2012: '4.2',
    name: ['Trigraphs shall not be used', '삼중 문자를 사용하지 않아야 합니다'],
    why: ['Trigraphs are replaced silently, even inside string literals.', '삼중 문자는 문자열 리터럴 안에서도 조용히 치환됩니다.'],
    fix: ['Write the intended characters directly or escape the question marks.', '의도한 문자를 직접 쓰거나 물음표를 이스케이프하세요.'],
    check(unit, api) { L.trigraphs(unit, api, 'c04-4.2'); },
  }),
];
