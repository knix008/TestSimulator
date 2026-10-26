'use strict';

// MISRA C++:2008 chapters 17-19 and 27 — library introduction, language
// support, diagnostics and input/output libraries.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');
const LB = require('../../lib/lib');
const STD = require('../../../misra-c/lib/b-stdlib');

const { cf } = U;

const C_HEADERS = new Set(['assert.h', 'ctype.h', 'errno.h', 'float.h', 'iso646.h', 'limits.h', 'locale.h', 'math.h', 'setjmp.h', 'signal.h',
  'stdarg.h', 'stddef.h', 'stdio.h', 'stdlib.h', 'string.h', 'time.h', 'wchar.h', 'wctype.h', 'stdint.h', 'inttypes.h', 'stdbool.h', 'fenv.h',
  'complex.h', 'tgmath.h', 'uchar.h', 'stdalign.h', 'stdnoreturn.h', 'stdatomic.h', 'threads.h']);

function cLibraryHeaders(unit, api) {
  const files = new Set(U.sourcesOnce(unit, api, 'cpp08-18-0-1').map(([f]) => f));
  for (const i of unit.includes || []) {
    if (!files.has(i.file) || !i.angled) continue;
    if (C_HEADERS.has(i.name)) api.report(i, M(`The C library header <${i.name}> is included; use <c${i.name.replace(/\.h$/, '')}>.`, `C 라이브러리 헤더 <${i.name}>를 포함했습니다. <c${i.name.replace(/\.h$/, '')}>를 사용하세요.`));
  }
}

const isStdOrGlobal = (s) => {
  const q = String(s.qname || s.name);
  return !q.includes('::') || q.startsWith('std::');
};

function libraryNamesReused(unit, api) {
  for (const s of unit.symbols || []) {
    if (s.system || s.kind !== 'variable' || !s.decls || !s.decls.length || !U.user(s.decls[0])) continue;
    if (!STD.OBJECT_NAMES.has(s.name) && !STD.MACRO_NAMES.has(s.name)) continue;
    if (!isStdOrGlobal(s)) continue;
    const d = s.decls[0];
    api.report(d.nameLoc ? { ...d.nameLoc, file: d.loc.file } : d, M(`'${s.name}' reuses the name of a standard library macro or object.`, `'${s.name}'가 표준 라이브러리 매크로나 객체의 이름을 재사용합니다.`));
  }
  const files = new Set(U.sourcesOnce(unit, api, 'cpp08-17-0-2').map(([f]) => f));
  for (const m of unit.macros || []) {
    if (files.has(m.file) && (STD.OBJECT_NAMES.has(m.name) || STD.MACRO_NAMES.has(m.name))) api.report({ file: m.file, line: m.line, col: m.col }, M(`Macro '${m.name}' reuses the name of a standard library macro or object.`, `매크로 '${m.name}'가 표준 라이브러리 매크로나 객체의 이름을 재사용합니다.`));
  }
}

function libraryFunctionsOverridden(unit, api) {
  for (const f of U.get(unit, 'FunctionDecl')) {
    if (!STD.FUNC_NAMES.has(f.name) || cf.enclosing(f, 'RecordDecl')) continue;
    const q = String(f.qname || f.name).replace(/^::/, '');
    if (q.includes('::') && !q.startsWith('std::')) continue;
    if (!U.firstScan(api, 'cpp08-17-0-3', `${f.loc.file}:${f.loc.line}:${f.loc.col}`)) continue;
    api.report(f.nameLoc || f, M(`Function '${f.name}' overrides the name of a standard library function.`, `함수 '${f.name}'가 표준 라이브러리 함수의 이름을 덮어씁니다.`));
  }
}

const TIME_FNS = new Set(['clock', 'difftime', 'mktime', 'time', 'asctime', 'ctime', 'gmtime', 'localtime', 'strftime']);
const UNBOUNDED = new Set(['strcpy', 'strcmp', 'strcat', 'strchr', 'strspn', 'strcspn', 'strpbrk', 'strrchr', 'strstr', 'strtok', 'strlen']);

module.exports = [
  CPP08({
    id: '17-0-1', cat: 'R', dec: true, c2012: '21.1',
    name: ['Reserved identifiers and library macros shall not be defined or undefined', '예약 식별자와 라이브러리 매크로를 정의하거나 해제하지 않아야 합니다'],
    why: ['Redefining names the library depends on is undefined behaviour.', '라이브러리가 의존하는 이름을 재정의하면 정의되지 않은 동작입니다.'],
    fix: ['Choose a name that is not reserved.', '예약되지 않은 이름을 고르세요.'],
    reuse: 'misra-c:21.1',
  }),
  CPP08({
    id: '17-0-2', cat: 'R', dec: true, c2012: '21.2',
    name: ['Names of standard library macros and objects shall not be reused', '표준 라이브러리 매크로와 객체의 이름을 재사용하지 않아야 합니다'],
    why: ['User entities with library names are easily confused with them.', '라이브러리 이름의 사용자 개체는 쉽게 혼동됩니다.'],
    fix: ['Rename the user entity.', '사용자 개체의 이름을 바꾸세요.'],
    check: libraryNamesReused,
  }),
  CPP08({
    id: '17-0-3', cat: 'R', dec: true, c2012: '21.2',
    name: ['Names of standard library functions shall not be overridden', '표준 라이브러리 함수의 이름을 덮어쓰지 않아야 합니다'],
    why: ['A user function named like a library function may be called instead of it.', '라이브러리 함수와 같은 이름의 사용자 함수가 대신 호출될 수 있습니다.'],
    fix: ['Rename the function or put it in a namespace.', '함수 이름을 바꾸거나 네임스페이스 안에 넣으세요.'],
    check: libraryFunctionsOverridden,
  }),
  CPP08({
    id: '17-0-4', cat: 'D', manual: true,
    name: ['Library code shall conform to MISRA C++', '라이브러리 코드는 MISRA C++를 따라야 합니다'],
    why: ['Libraries run with the same safety requirements as the application.', '라이브러리도 응용 프로그램과 같은 안전 요구사항으로 실행됩니다.'],
    fix: ['Verify or document the compliance of every library.', '모든 라이브러리의 준수 여부를 검증하거나 문서화하세요.'],
  }),
  CPP08({
    id: '17-0-5', cat: 'R', dec: true, cpp2023: '21.10.2', c2012: '21.4',
    name: ['setjmp and longjmp shall not be used', 'setjmp와 longjmp를 사용하지 않아야 합니다'],
    why: ['Non-local jumps skip destructors.', '비지역 점프는 소멸자를 건너뜁니다.'],
    fix: ['Use exceptions or return codes.', '예외나 반환 코드를 사용하세요.'],
    reuse: 'misra-cpp:21.10.2',
  }),
  CPP08({
    id: '18-0-1', cat: 'R', dec: true,
    name: ['The C library headers shall not be used', 'C 라이브러리 헤더를 사용하지 않아야 합니다'],
    why: ['The <name.h> headers put declarations in the global namespace.', '<name.h> 헤더는 선언을 전역 네임스페이스에 넣습니다.'],
    fix: ['Include the <cname> form instead.', '대신 <cname> 형식을 포함하세요.'],
    check: cLibraryHeaders,
  }),
  CPP08({
    id: '18-0-2', cat: 'R', dec: true, cpp2023: '21.2.1', c2012: '21.7',
    name: ['atof, atoi and atol shall not be used', 'atof, atoi, atol을 사용하지 않아야 합니다'],
    why: ['They have undefined behaviour for unrepresentable values.', '표현할 수 없는 값에서 정의되지 않은 동작을 합니다.'],
    fix: ['Use std::strtol or std::strtod and check the result.', 'std::strtol이나 std::strtod를 쓰고 결과를 검사하세요.'],
    reuse: 'misra-cpp:21.2.1',
  }),
  CPP08({
    id: '18-0-3', cat: 'R', dec: true, c2012: '21.8',
    name: ['abort, exit, getenv and system shall not be used', 'abort, exit, getenv, system을 사용하지 않아야 합니다'],
    why: ['They depend on the environment and skip normal cleanup.', '환경에 의존하고 정상적인 정리를 건너뜁니다.'],
    fix: ['Handle errors and configuration inside the program.', '오류와 설정을 프로그램 안에서 처리하세요.'],
    check(unit, api) { LB.libCalls(unit, api, new Set(['abort', 'exit', 'getenv', 'system'])); },
  }),
  CPP08({
    id: '18-0-4', cat: 'R', dec: true, c2012: '21.10',
    name: ['The time functions of <ctime> shall not be used', '<ctime>의 시간 함수를 사용하지 않아야 합니다'],
    why: ['They have unspecified and implementation-defined behaviour.', '지정되지 않은 동작과 구현 정의 동작이 있습니다.'],
    fix: ['Use a verified platform timer.', '검증된 플랫폼 타이머를 사용하세요.'],
    check(unit, api) { LB.libCalls(unit, api, TIME_FNS); },
  }),
  CPP08({
    id: '18-0-5', cat: 'R', dec: true, type: 'VULNERABILITY', cpp2023: '21.2.2', cwe: 'CWE-120',
    name: ['The unbounded functions of <cstring> shall not be used', '<cstring>의 길이 제한 없는 함수를 사용하지 않아야 합니다'],
    why: ['Functions such as strcpy and strlen read or write until a terminator that may be missing.', 'strcpy나 strlen 같은 함수는 없을 수도 있는 종료 문자까지 읽거나 씁니다.'],
    fix: ['Use bounded alternatives or std::string.', '길이 제한이 있는 대안이나 std::string을 사용하세요.'],
    check(unit, api) { LB.libCalls(unit, api, UNBOUNDED); },
  }),
  CPP08({
    id: '18-2-1', cat: 'R', dec: true, cpp2023: '21.2.4',
    name: ['The offsetof macro shall not be used', 'offsetof 매크로를 사용하지 않아야 합니다'],
    why: ['offsetof is only defined for standard-layout types.', 'offsetof는 표준 배치 형식에서만 정의됩니다.'],
    fix: ['Use pointers to members.', '멤버 포인터를 사용하세요.'],
    reuse: 'misra-cpp:21.2.4',
  }),
  CPP08({
    id: '18-4-1', cat: 'R', dec: true, type: 'VULNERABILITY', cpp2023: '21.6.1', c2012: '21.3', cwe: 'CWE-401',
    name: ['Dynamic heap memory allocation shall not be used', '동적 힙 메모리 할당을 사용하지 않아야 합니다'],
    why: ['Heap allocation can fail, fragment memory and leak.', '힙 할당은 실패하거나 메모리를 단편화하거나 누수될 수 있습니다.'],
    fix: ['Use static or automatic storage.', '정적 또는 자동 저장 공간을 사용하세요.'],
    reuse: 'misra-cpp:21.6.1',
  }),
  CPP08({
    id: '18-7-1', cat: 'R', dec: true, cpp2023: '21.10.3', c2012: '21.5',
    name: ['The signal handling facilities of <csignal> shall not be used', '<csignal>의 시그널 처리 기능을 사용하지 않아야 합니다'],
    why: ['Signal handling has much undefined and implementation-defined behaviour.', '시그널 처리에는 정의되지 않은 동작과 구현 정의 동작이 많습니다.'],
    fix: ['Use a documented platform mechanism.', '문서화된 플랫폼 메커니즘을 사용하세요.'],
    reuse: 'misra-cpp:21.10.3',
  }),
  CPP08({
    id: '19-3-1', cat: 'R', dec: true,
    name: ['errno shall not be used', 'errno를 사용하지 않아야 합니다'],
    why: ['errno is set inconsistently and easily overwritten.', 'errno는 일관되지 않게 설정되고 쉽게 덮어쓰입니다.'],
    fix: ['Check arguments and results instead.', '대신 인수와 결과를 검사하세요.'],
    check(unit, api) { LB.macroOrIdent(unit, api, 'cpp08-19-3-1', new Set(['errno'])); },
  }),
  CPP08({
    id: '27-0-1', cat: 'R', dec: true, cpp2023: '30.0.1', c2012: '21.6',
    name: ['The stream I/O library <cstdio> shall not be used', '스트림 입출력 라이브러리 <cstdio>를 사용하지 않아야 합니다'],
    why: ['C stream I/O has much unspecified and undefined behaviour.', 'C 스트림 입출력에는 지정되지 않은 동작과 정의되지 않은 동작이 많습니다.'],
    fix: ['Use a verified I/O layer.', '검증된 입출력 계층을 사용하세요.'],
    reuse: 'misra-cpp:30.0.1',
  }),
];
