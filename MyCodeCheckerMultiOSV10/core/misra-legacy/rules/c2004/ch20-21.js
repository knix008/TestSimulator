'use strict';

// MISRA C:2004 chapter 20 — standard libraries; chapter 21 — run-time failures.

const { C04, M } = require('../../lib/meta');
const U = require('../../lib/util');
const LB = require('../../lib/lib');

const { T } = U;

// Run-time failures that can be shown statically: division by a constant zero
// and constant array indexes outside the declared bounds.
function runtimeFailures(unit, api) {
  const zeroDiv = (n, op, r) => {
    if (U.iceValue(unit, r) === 0n) api.report(n, M(`'${op}' by the constant zero.`, `상수 0으로 '${op}' 연산을 합니다.`));
  };
  for (const b of U.get(unit, 'BinaryExpr')) if (b.op === '/' || b.op === '%') zeroDiv(b, b.op, b.right);
  for (const a of U.get(unit, 'AssignExpr')) if (a.op === '/=' || a.op === '%=') zeroDiv(a, a.op, a.right);
  for (const ix of U.get(unit, 'IndexExpr')) {
    const o = U.strip(ix.object);
    const t = o && o.ctype && T.canonical(o.ctype);
    if (!t || t.kind !== 'array' || t.size == null) continue;
    const v = U.iceValue(unit, ix.index);
    if (v == null) continue;
    // &a[N] (one past the end) is allowed
    const { p } = U.P.upParens(ix);
    const addr = p && p.type === 'UnaryExpr' && p.op === '&';
    if (v < 0n || v > BigInt(t.size) || (v === BigInt(t.size) && !addr)) api.report(ix, M(`Index ${v} is outside the bounds of '${U.code(unit, o)}' (${t.size} elements).`, `인덱스 ${v}가 '${U.code(unit, o)}'(요소 ${t.size}개)의 범위를 벗어났습니다.`));
  }
}

module.exports = [
  C04({
    id: '20.1', cat: 'R', dec: true, c2012: '21.1',
    name: ['Reserved identifiers and library macros shall not be defined or undefined', '예약 식별자와 라이브러리 매크로를 정의하거나 해제하지 않아야 합니다'],
    why: ['Redefining names the library relies on is undefined behaviour.', '라이브러리가 의존하는 이름을 재정의하면 정의되지 않은 동작입니다.'],
    fix: ['Choose a name that is not reserved.', '예약되지 않은 이름을 고르세요.'],
    reuse: 'misra-c:21.1',
  }),
  C04({
    id: '20.2', cat: 'R', dec: true, c2012: '21.2',
    name: ['Names of standard library macros, objects and functions shall not be reused', '표준 라이브러리 매크로, 객체, 함수의 이름을 재사용하지 않아야 합니다'],
    why: ['A user entity named like a library one is easily confused with it.', '라이브러리 개체와 같은 이름의 사용자 개체는 쉽게 혼동됩니다.'],
    fix: ['Rename the user identifier.', '사용자 식별자의 이름을 바꾸세요.'],
    reuse: 'misra-c:21.2',
  }),
  C04({
    id: '20.3', cat: 'R', dec: false, c2012: 'dir-4.11', cwe: 'CWE-628',
    name: ['Values passed to library functions shall be checked for validity', '라이브러리 함수에 전달하는 값의 유효성을 검사해야 합니다'],
    why: ['Many library functions have undefined behaviour for out-of-domain arguments.', '많은 라이브러리 함수는 정의역 밖의 인수에서 정의되지 않은 동작을 합니다.'],
    fix: ['Check the argument range before the call.', '호출 전에 인수의 범위를 검사하세요.'],
    reuse: 'misra-c:dir-4.11',
  }),
  C04({
    id: '20.4', cat: 'R', dec: true, c2012: '21.3', type: 'VULNERABILITY', cwe: 'CWE-401',
    name: ['Dynamic heap memory allocation shall not be used', '동적 힙 메모리 할당을 사용하지 않아야 합니다'],
    why: ['Heap allocation can fail, fragment memory and leak.', '힙 할당은 실패하거나 메모리를 단편화하거나 누수될 수 있습니다.'],
    fix: ['Use statically allocated storage.', '정적으로 할당된 저장 공간을 사용하세요.'],
    reuse: 'misra-c:21.3',
  }),
  C04({
    id: '20.5', cat: 'R', dec: true,
    name: ['errno shall not be used', 'errno를 사용하지 않아야 합니다'],
    why: ['errno is set inconsistently by library functions and is easily overwritten.', 'errno는 라이브러리 함수마다 일관되지 않게 설정되고 쉽게 덮어쓰입니다.'],
    fix: ['Check the arguments and results of library calls instead.', '대신 라이브러리 호출의 인수와 결과를 검사하세요.'],
    check(unit, api) { LB.macroOrIdent(unit, api, 'c04-20.5', new Set(['errno'])); },
  }),
  C04({
    id: '20.6', cat: 'R', dec: true,
    name: ['The offsetof macro shall not be used', 'offsetof 매크로를 사용하지 않아야 합니다'],
    why: ['offsetof has undefined behaviour for bit-fields and some operand forms.', 'offsetof는 비트 필드와 일부 피연산자 형식에서 정의되지 않은 동작을 합니다.'],
    fix: ['Access the member by name.', '멤버에 이름으로 접근하세요.'],
    check(unit, api) { LB.offsetofUse(unit, api, 'c04-20.6'); },
  }),
  C04({
    id: '20.7', cat: 'R', dec: true, c2012: '21.4',
    name: ['setjmp and longjmp shall not be used', 'setjmp와 longjmp를 사용하지 않아야 합니다'],
    why: ['Non-local jumps bypass normal control flow and cleanup.', '비지역 점프는 정상적인 제어 흐름과 정리를 건너뜁니다.'],
    fix: ['Return error codes through the call chain.', '호출 연쇄를 통해 오류 코드를 반환하세요.'],
    reuse: 'misra-c:21.4',
  }),
  C04({
    id: '20.8', cat: 'R', dec: true, c2012: '21.5',
    name: ['The <signal.h> facilities shall not be used', '<signal.h> 기능을 사용하지 않아야 합니다'],
    why: ['Signal handling has much implementation-defined and undefined behaviour.', '시그널 처리에는 구현 정의 및 정의되지 않은 동작이 많습니다.'],
    fix: ['Use a platform mechanism that is documented for the target.', '대상에 문서화된 플랫폼 메커니즘을 사용하세요.'],
    reuse: 'misra-c:21.5',
  }),
  C04({
    id: '20.9', cat: 'R', dec: true, c2012: '21.6',
    name: ['<stdio.h> shall not be used in production code', '배포 코드에서 <stdio.h>를 사용하지 않아야 합니다'],
    why: ['Stream I/O has much unspecified, undefined and implementation-defined behaviour.', '스트림 입출력에는 지정되지 않은, 정의되지 않은, 구현 정의 동작이 많습니다.'],
    fix: ['Use a dedicated, verified I/O layer.', '전용으로 검증된 입출력 계층을 사용하세요.'],
    reuse: 'misra-c:21.6',
  }),
  C04({
    id: '20.10', cat: 'R', dec: true, c2012: '21.7',
    name: ['atof, atoi and atol shall not be used', 'atof, atoi, atol을 사용하지 않아야 합니다'],
    why: ['These functions have undefined behaviour when the value cannot be represented.', '이 함수들은 값을 표현할 수 없을 때 정의되지 않은 동작을 합니다.'],
    fix: ['Use strtol, strtoul or strtod and check the result.', 'strtol, strtoul, strtod를 쓰고 결과를 검사하세요.'],
    reuse: 'misra-c:21.7',
  }),
  C04({
    id: '20.11', cat: 'R', dec: true, c2012: '21.8',
    name: ['abort, exit, getenv and system shall not be used', 'abort, exit, getenv, system을 사용하지 않아야 합니다'],
    why: ['Their behaviour depends on the host environment and they bypass normal shutdown.', '동작이 호스트 환경에 따라 다르고 정상 종료를 건너뜁니다.'],
    fix: ['Handle errors and configuration inside the program.', '오류와 설정을 프로그램 안에서 처리하세요.'],
    check(unit, api) { LB.libCalls(unit, api, new Set(['abort', 'exit', 'getenv', 'system'])); },
  }),
  C04({
    id: '20.12', cat: 'R', dec: true, c2012: '21.10',
    name: ['The time handling functions of <time.h> shall not be used', '<time.h>의 시간 처리 함수를 사용하지 않아야 합니다'],
    why: ['Time functions have unspecified and implementation-defined behaviour.', '시간 함수에는 지정되지 않은 동작과 구현 정의 동작이 있습니다.'],
    fix: ['Use a verified timer interface of the platform.', '플랫폼의 검증된 타이머 인터페이스를 사용하세요.'],
    reuse: 'misra-c:21.10',
  }),
  // ---------------------------------------------------------------- chapter 21
  C04({
    id: '21.1', cat: 'R', dec: false, type: 'BUG', c2012: 'dir-4.1', cwe: 'CWE-369',
    name: ['Run-time failures shall be minimised', '실행 시간 오류를 최소화해야 합니다'],
    why: ['Division by zero and out-of-bounds indexing crash or corrupt the program.', '0으로 나누기와 범위를 벗어난 인덱싱은 프로그램을 멈추거나 손상시킵니다.'],
    fix: ['Guard divisors and keep indexes inside the array bounds.', '나누는 수를 검사하고 인덱스를 배열 범위 안에 두세요.'],
    check: runtimeFailures,
  }),
];
