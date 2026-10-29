'use strict';

// MISRA C:2012 / 2023 chapter 21 — standard libraries.

const B = require('../lib/b-common');
const L = require('../lib/b-stdlib');
const F = require('../lib/b-flow');
const R = require('../lib/b-resource');

const { cf, T, rule, msg, nodes, functions, text, skipParens, stripCasts, calleeName, isUserLoc, canon } = B;

const set = (...a) => new Set(a.flat());

// Report every use of the library names `names` (once per identifier node).
function banUses(unit, api, names, what) {
  for (const id of B.libUses(unit, names)) {
    if (id.symbol && id.symbol.kind === 'variable' && !id.symbol.system) continue;
    api.report(id, msg(`'${id.name}' ${what[0]}.`, `'${id.name}'${what[1]}.`));
  }
}

function banInclude(unit, api, header) {
  for (const inc of B.includesHeader(unit, header)) {
    api.report(inc, msg(`The header <${header}> is included.`, `헤더 <${header}>를 포함했습니다.`));
  }
}

const STRING_FNS = set('strcat', 'strchr', 'strcmp', 'strcoll', 'strcpy', 'strcspn', 'strlen', 'strpbrk', 'strrchr', 'strspn', 'strstr', 'strtok');
const SIZE_FNS = new Map([
  ['memchr', [0]], ['memcmp', [0, 1]], ['memcpy', [0, 1]], ['memmove', [0, 1]], ['memset', [0]],
  ['strncat', [0]], ['strncmp', []], ['strncpy', [0]], ['strxfrm', [0]],
]);
const SIZE_ARG = { memchr: 2, memcmp: 2, memcpy: 2, memmove: 2, memset: 2, strncat: 2, strncmp: 2, strncpy: 2, strxfrm: 2 };
const CONST_RESULT = set('localeconv', 'getenv', 'setlocale', 'strerror');
const STALE_FNS = set('asctime', 'ctime', 'gmtime', 'localtime', 'localeconv', 'getenv', 'setlocale', 'strerror');
const TGMATH_MULTI = set('pow', 'fmod', 'atan2', 'hypot', 'fmin', 'fmax', 'copysign', 'fdim', 'fma', 'nextafter', 'remainder', 'remquo');
const TGMATH_ALL = set(['acos', 'asin', 'atan', 'acosh', 'asinh', 'atanh', 'cos', 'sin', 'tan', 'cosh', 'sinh', 'tanh', 'exp', 'log', 'pow',
  'sqrt', 'fabs', 'atan2', 'cbrt', 'ceil', 'copysign', 'erf', 'erfc', 'exp2', 'expm1', 'fdim', 'floor', 'fma', 'fmax', 'fmin', 'fmod', 'frexp',
  'hypot', 'ilogb', 'ldexp', 'lgamma', 'llrint', 'llround', 'log10', 'log1p', 'log2', 'logb', 'lrint', 'lround', 'nearbyint', 'nextafter',
  'nexttoward', 'remainder', 'remquo', 'rint', 'round', 'scalbn', 'scalbln', 'tgamma', 'trunc', 'carg', 'cimag', 'conj', 'cproj', 'creal']);
const FENV_EXC = set('feclearexcept', 'fegetexceptflag', 'feraiseexcept', 'fesetexceptflag', 'fetestexcept');
const FENV_MACROS = set('FE_INEXACT', 'FE_DIVBYZERO', 'FE_UNDERFLOW', 'FE_OVERFLOW', 'FE_INVALID', 'FE_ALL_EXCEPT');

// Pointer argument with the conversion to void * removed.
function origArg(e) {
  let x = skipParens(e);
  for (let i = 0; i < 10 && x && x.type === 'CastExpr' && x.arg; i++) {
    const t = canon(x.ctype);
    if (t && t.kind === 'pointer' && T.isVoid(canon(t.to))) x = skipParens(x.arg); else break;
  }
  return x;
}
function pointeeOf(e) {
  const x = origArg(e);
  if (!x || !x.ctype) return null;
  const t = canon(T.decay(x.ctype));
  if (!t || t.kind !== 'pointer') return null;
  return t.to;
}

// Size in bytes of the object a pointer argument designates (when known).
function objectBytes(e, unit) {
  const x = origArg(e);
  if (!x) return null;
  const size = (t) => { try { return T.sizeOf(t, unit.target); } catch (err) { return null; } };
  if (x.type === 'StringLiteral') return x.length != null && !x.incomplete ? x.length * (size(canon(x.ctype).of) || 1) : null;
  if (x.type === 'Identifier' && x.symbol && x.symbol.kind !== 'parameter' && B.isArrayType(x.symbol.type)) return size(canon(x.symbol.type));
  if (x.type === 'MemberExpr' && B.isArrayType(x.ctype)) return size(canon(x.ctype));
  if (x.type === 'UnaryExpr' && x.op === '&') {
    const a = skipParens(x.arg);
    if (a && a.type === 'IndexExpr') {
      const base = objectBytes(a.object, unit);
      const k = B.constInt(a.index, unit);
      const es = size(canon(a.ctype));
      if (base != null && k !== null && es) return base - Number(k) * es;
      return null;
    }
    if (a && (a.type === 'Identifier' || a.type === 'MemberExpr')) return size(canon(a.ctype));
  }
  return null;
}

// Number of chars a string argument needs including the terminator, and
// whether it is known to lack a terminator.
function stringInfo(e) {
  const x = origArg(e);
  if (!x) return null;
  if (x.type === 'StringLiteral') return x.incomplete ? null : { need: x.length, unterminated: false, name: 'string literal' };
  if (x.type === 'Identifier' && x.symbol && x.symbol.kind !== 'parameter' && B.isArrayType(x.symbol.type)) {
    const at = canon(x.symbol.type);
    const d = (x.symbol.decls || []).find((dd) => dd.type === 'VarDecl' && dd.init);
    const init = d && d.init.type === 'StringLiteral' ? d.init : (d && d.init.type === 'InitList' && d.init.items.length === 1 && d.init.items[0].type === 'StringLiteral' ? d.init.items[0] : null);
    if (init && at.size != null) {
      if (init.length > at.size) return { need: null, unterminated: true, name: x.name, size: at.size };
      if (!modifiedAnywhere(x.symbol)) return { need: init.length, unterminated: false, name: x.name };
    }
  }
  return null;
}
function modifiedAnywhere(sym) {
  return sym.uses.some((u) => {
    const p = cf.parentOf(u);
    if (!p) return false;
    if (p.type === 'IndexExpr' || (p.type === 'UnaryExpr' && p.op === '&')) return true;
    if (p.type === 'CallExpr' && p.callee !== u) return true;
    if (p.type === 'AssignExpr' && p.left === u) return true;
    return false;
  });
}

function destCapacity(e, unit) {
  const x = origArg(e);
  if (!x) return null;
  if (x.type === 'Identifier' && x.symbol && x.symbol.kind !== 'parameter' && B.isArrayType(x.symbol.type)) {
    const at = canon(x.symbol.type);
    return at.size != null && B.isPlainCharType(at.of) ? { size: at.size, name: x.name } : null;
  }
  const b = objectBytes(e, unit);
  return b != null ? { size: b, name: text(unit, e) } : null;
}

function isConstPointee(t) {
  const c = canon(t);
  if (!c || c.kind !== 'pointer') return true;
  const p = c.to;
  return !!(p && (p.const || (canon(p) || {}).const));
}

function paramType(call, i) {
  const ft = canon(call.callee && call.callee.ctype);
  const f = ft && ft.kind === 'pointer' ? canon(ft.to) : ft;
  if (!f || f.kind !== 'function' || !f.prototype) return null;
  return f.params[i] || null;
}

const essCat = (e, unit) => cf.essentialType(e, { target: unit.target });

module.exports = [
  rule({
    id: '21.1', cat: 'Required', type: 'BUG', debt: 5, decidable: true, cert: 'DCL37-C',
    name: ['#define and #undef shall not be used on reserved identifiers or library macro names', '예약 식별자나 라이브러리 매크로 이름에 #define과 #undef를 쓰면 안 됩니다'],
    why: ['Defining or undefining names reserved for the implementation or the standard library is undefined behaviour and can break library headers.', '구현이나 표준 라이브러리에 예약된 이름을 정의하거나 해제하면 정의되지 않은 동작이며 라이브러리 헤더를 깨뜨릴 수 있습니다.'],
    fix: ['Rename the macro so that it does not start with an underscore and does not match a standard library name.', '밑줄로 시작하지 않고 표준 라이브러리 이름과 겹치지 않도록 매크로 이름을 바꾸세요.'],
    check(unit, api) {
      for (const d of unit.directives) {
        if (!isUserLoc(d) || (d.kind !== 'define' && d.kind !== 'undef') || !d.active || !d.macro) continue;
        const n = d.macro;
        if (n === 'NDEBUG' || n === '__STDC_WANT_LIB_EXT1__') continue;
        let why = null;
        if (n === 'defined') why = ['is the preprocessor operator name', '전처리 연산자 이름입니다'];
        else if (/^_/.test(n)) why = ['starts with an underscore and is reserved', '밑줄로 시작하는 예약 식별자입니다'];
        else if (L.MACRO_NAMES.has(n)) why = ['is a standard library macro name', '표준 라이브러리 매크로 이름입니다'];
        else if (L.FUNC_NAMES.has(n) || L.OBJECT_NAMES.has(n)) why = ['is a standard library function or object name', '표준 라이브러리 함수 또는 객체 이름입니다'];
        if (why) api.report(d, msg(`'#${d.kind} ${n}': '${n}' ${why[0]}.`, `'#${d.kind} ${n}': '${n}'은(는) ${why[1]}.`));
      }
    },
  }),
  rule({
    id: '21.2', cat: 'Required', type: 'BUG', debt: 5, decidable: true, cert: 'DCL37-C',
    name: ['Reserved identifiers and library names shall not be declared', '예약 식별자와 라이브러리 이름을 선언하면 안 됩니다'],
    why: ['Declaring an identifier reserved for the implementation or the library is undefined behaviour and may clash with the real declaration.', '구현이나 라이브러리에 예약된 식별자를 선언하면 정의되지 않은 동작이며 실제 선언과 충돌할 수 있습니다.'],
    fix: ['Rename the identifier.', '식별자 이름을 바꾸세요.'],
    check(unit, api) {
      const fileScope = (n) => !cf.enclosing(n, ['FunctionDecl', 'CompoundStmt', 'RecordDecl', 'ParamDecl']) || (n.type === 'FunctionDecl' && !cf.enclosing(n, ['CompoundStmt']));
      const check = (n, name, where) => {
        if (!name || name === 'main') return;
        let why = null;
        if (L.reservedPrefix(name)) why = ['starts with __ or _ and an upper-case letter', '__ 또는 _와 대문자로 시작합니다'];
        else if (/^_/.test(name) && fileScope(n)) why = ['starts with an underscore at file scope', '파일 범위에서 밑줄로 시작합니다'];
        else if (fileScope(n) && (n.type === 'FunctionDecl' || n.type === 'VarDecl') && (L.FUNC_NAMES.has(name) || L.OBJECT_NAMES.has(name))) why = ['is the name of a standard library function or object', '표준 라이브러리 함수 또는 객체의 이름입니다'];
        if (why) api.report(where || n, msg(`The declared identifier '${name}' ${why[0]}.`, `선언한 식별자 '${name}'이(가) ${why[1]}.`));
      };
      for (const n of nodes(unit, ['VarDecl', 'FunctionDecl', 'TypedefDecl', 'FieldDecl', 'ParamDecl'])) check(n, n.name, n.nameLoc ? { ...n.nameLoc, file: n.loc.file } : n);
      for (const n of nodes(unit, 'EnumConstant')) check(n, n.name);
      for (const n of nodes(unit, ['RecordDecl', 'EnumDecl'])) if (n.name && (n.isDefinition || !cf.enclosing(n, 'CompoundStmt'))) check(n, n.name);
      for (const n of nodes(unit, 'LabelStmt')) if (L.reservedPrefix(n.label)) check(n, n.label);
    },
  }),
  rule({
    id: '21.3', cat: 'Required', type: 'VULNERABILITY', debt: 30, decidable: true, cwe: 'CWE-401', cert: 'MEM31-C',
    name: ['The memory allocation functions of <stdlib.h> shall not be used', '<stdlib.h>의 메모리 할당 함수를 사용하면 안 됩니다'],
    why: ['Dynamic allocation can fail, fragment memory, leak or be misused (double free, use after free), all of which are hard to rule out.', '동적 할당은 실패하거나, 메모리를 단편화하거나, 누수되거나, 잘못 쓰일(이중 해제, 해제 후 사용) 수 있어 배제하기 어렵습니다.'],
    fix: ['Use statically allocated storage or a deterministic memory pool.', '정적으로 할당된 저장소나 결정적인 메모리 풀을 사용하세요.'],
    check(unit, api) { banUses(unit, api, set('malloc', 'calloc', 'realloc', 'aligned_alloc', 'free'), ['is a dynamic memory function of <stdlib.h>', '은(는) <stdlib.h>의 동적 메모리 함수입니다']); },
  }),
  rule({
    id: '21.4', cat: 'Required', type: 'VULNERABILITY', debt: 30, decidable: true, cert: 'MSC22-C',
    name: ['The <setjmp.h> facilities shall not be used', '<setjmp.h>의 기능을 사용하면 안 됩니다'],
    why: ['setjmp and longjmp bypass normal function exits, skip clean-up and leave local variables with indeterminate values.', 'setjmp와 longjmp는 정상적인 함수 종료를 우회해 정리 코드를 건너뛰고 지역 변수 값을 불확정하게 만듭니다.'],
    fix: ['Report errors through return values and structured control flow.', '반환 값과 구조화된 제어 흐름으로 오류를 전달하세요.'],
    check(unit, api) {
      banInclude(unit, api, 'setjmp.h');
      banUses(unit, api, set('setjmp', 'longjmp'), ['is a <setjmp.h> facility', '은(는) <setjmp.h>의 기능입니다']);
    },
  }),
  rule({
    id: '21.5', cat: 'Required', type: 'VULNERABILITY', debt: 30, decidable: true, cert: 'SIG30-C',
    name: ['The <signal.h> facilities shall not be used', '<signal.h>의 기능을 사용하면 안 됩니다'],
    why: ['Signal handling has much undefined and implementation-defined behaviour, and handlers easily call functions that are not async-safe.', '시그널 처리에는 정의되지 않았거나 구현에 따라 다른 동작이 많고, 처리기에서 비동기 안전하지 않은 함수를 호출하기 쉽습니다.'],
    fix: ['Use the platform\'s event or interrupt mechanism through a reviewed abstraction.', '검토된 추상화를 통해 플랫폼의 이벤트나 인터럽트 기구를 사용하세요.'],
    check(unit, api) {
      banInclude(unit, api, 'signal.h');
      banUses(unit, api, set('signal', 'raise'), ['is a <signal.h> facility', '은(는) <signal.h>의 기능입니다']);
    },
  }),
  rule({
    id: '21.6', cat: 'Required', type: 'VULNERABILITY', debt: 30, decidable: true, cwe: 'CWE-134',
    name: ['The standard library input/output functions shall not be used', '표준 라이브러리 입출력 함수를 사용하면 안 됩니다'],
    why: ['The stream and file functions have unspecified, undefined and implementation-defined behaviour (format strings, buffer sizes, error handling).', '스트림·파일 함수에는 지정되지 않았거나 정의되지 않았거나 구현에 따라 다른 동작(형식 문자열, 버퍼 크기, 오류 처리)이 있습니다.'],
    fix: ['Use a project I/O layer whose behaviour is fully specified.', '동작이 완전히 정의된 프로젝트 입출력 계층을 사용하세요.'],
    check(unit, api) {
      const io = set(L.FUNCS['stdio.h'], L.FUNCS['wchar.h'].filter((f) => /^(f|s|v|vf|vs|vw)?w?(printf|scanf)$|^(f|un)?(get|put)w(c|s|char)$|^fwide$|^(get|put)wchar$|^(get|put)wc$/.test(f)));
      banUses(unit, api, io, ['is a standard library input/output function', '은(는) 표준 라이브러리 입출력 함수입니다']);
    },
  }),
  rule({
    id: '21.7', cat: 'Required', type: 'VULNERABILITY', debt: 10, decidable: true, cwe: 'CWE-190', cert: 'ERR34-C',
    name: ['atof, atoi, atol and atoll shall not be used', 'atof, atoi, atol, atoll을 사용하면 안 됩니다'],
    why: ['These functions have undefined behaviour when the value cannot be represented and give no way to detect conversion errors.', '이 함수들은 값을 표현할 수 없을 때 정의되지 않은 동작을 하고 변환 오류를 알아낼 방법이 없습니다.'],
    fix: ['Use strtol, strtoul, strtod and check errno and the end pointer.', 'strtol, strtoul, strtod를 쓰고 errno와 끝 포인터를 검사하세요.'],
    check(unit, api) { banUses(unit, api, set('atof', 'atoi', 'atol', 'atoll'), ['is an unchecked string conversion function', '은(는) 검사하지 않는 문자열 변환 함수입니다']); },
  }),
  rule({
    id: '21.8', cat: 'Required', type: 'VULNERABILITY', debt: 15, decidable: true, cwe: 'CWE-382', cert: 'ERR04-C',
    name: ['The termination functions of <stdlib.h> shall not be used', '<stdlib.h>의 종료 함수를 사용하면 안 됩니다'],
    why: ['Terminating the program from inside a function skips the normal shutdown of the system and may leave resources and data inconsistent.', '함수 안에서 프로그램을 종료하면 시스템의 정상 종료 절차를 건너뛰어 자원과 데이터가 불일치 상태로 남을 수 있습니다.'],
    fix: ['Return an error status to the caller and let the system decide how to stop.', '호출자에게 오류 상태를 반환하고 시스템이 종료 방법을 결정하게 하세요.'],
    check(unit, api) { banUses(unit, api, set('abort', 'exit', '_Exit', 'quick_exit'), ['is a program termination function of <stdlib.h>', '은(는) <stdlib.h>의 프로그램 종료 함수입니다']); },
  }),
  rule({
    id: '21.9', cat: 'Required', type: 'BUG', debt: 15, decidable: true,
    name: ['bsearch and qsort shall not be used', 'bsearch와 qsort를 사용하면 안 됩니다'],
    why: ['The comparison function may misbehave, qsort may recurse deeply and the order of equal elements is unspecified.', '비교 함수가 잘못 동작할 수 있고, qsort는 깊게 재귀할 수 있으며 같은 요소의 순서가 정해져 있지 않습니다.'],
    fix: ['Use a reviewed search or sort implementation with known behaviour.', '동작이 알려진 검토된 탐색·정렬 구현을 사용하세요.'],
    check(unit, api) { banUses(unit, api, set('bsearch', 'qsort'), ['is a <stdlib.h> search/sort function', '은(는) <stdlib.h>의 탐색/정렬 함수입니다']); },
  }),
  rule({
    id: '21.10', cat: 'Required', debt: 15, decidable: true,
    name: ['The time handling functions of <time.h> shall not be used', '<time.h>의 시간 처리 함수를 사용하면 안 됩니다'],
    why: ['Time and date functions have unspecified, undefined and implementation-defined behaviour, and some return pointers to shared static data.', '시간·날짜 함수에는 지정되지 않았거나 정의되지 않았거나 구현에 따라 다른 동작이 있고, 일부는 공유 정적 데이터의 포인터를 반환합니다.'],
    fix: ['Use a project time service with defined behaviour.', '동작이 정의된 프로젝트 시간 서비스를 사용하세요.'],
    check(unit, api) { banUses(unit, api, set(L.FUNCS['time.h']), ['is a time handling function of <time.h>', '은(는) <time.h>의 시간 처리 함수입니다']); },
  }),
  rule({
    id: '21.11', cat: 'Advisory', cat2012: 'Required', debt: 10, decidable: true,
    name: ['The <tgmath.h> header should not be used', '<tgmath.h> 헤더를 사용하지 않아야 합니다'],
    why: ['Type-generic macros silently pick the function from the argument types, which can select an unexpected precision.', '형 일반 매크로는 인자 형으로 함수를 조용히 고르므로 예상치 못한 정밀도가 선택될 수 있습니다.'],
    fix: ['Include <math.h> and call the function for the intended type, such as sqrtf.', '<math.h>를 포함하고 sqrtf처럼 의도한 형의 함수를 호출하세요.'],
    check(unit, api) { banInclude(unit, api, 'tgmath.h'); },
  }),
  rule({
    id: '21.12', cat: 'Advisory', debt: 15, decidable: true,
    name: ['The exception handling features of <fenv.h> should not be used', '<fenv.h>의 예외 처리 기능을 사용하지 않아야 합니다'],
    why: ['Floating-point exception flags have unspecified and implementation-defined behaviour and interact badly with compiler optimisation.', '부동소수점 예외 플래그는 지정되지 않았거나 구현에 따라 다른 동작이 있으며 컴파일러 최적화와 잘 맞지 않습니다.'],
    fix: ['Check operands before the operation instead of testing exception flags afterwards.', '연산 후 예외 플래그를 검사하는 대신 연산 전에 피연산자를 검사하세요.'],
    check(unit, api) {
      banUses(unit, api, FENV_EXC, ['is a floating-point exception function of <fenv.h>', '은(는) <fenv.h>의 부동소수점 예외 함수입니다']);
      for (const id of nodes(unit, 'Identifier')) if (FENV_MACROS.has(id.name)) api.report(id, msg(`'${id.name}' is a floating-point exception macro of <fenv.h>.`, `'${id.name}'은(는) <fenv.h>의 부동소수점 예외 매크로입니다.`));
      for (const e of unit.expansions) if (isUserLoc(e) && FENV_MACROS.has(e.name) && !e.nested) api.report(e, msg(`'${e.name}' is a floating-point exception macro of <fenv.h>.`, `'${e.name}'은(는) <fenv.h>의 부동소수점 예외 매크로입니다.`));
    },
  }),
  rule({
    id: '21.13', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 10, decidable: false, amd: 'AMD1', cwe: 'CWE-704', cert: 'STR37-C',
    name: ['<ctype.h> functions shall get an unsigned char value or EOF', '<ctype.h> 함수에는 unsigned char 값이나 EOF를 넘겨야 합니다'],
    why: ['Passing any other value, such as a negative plain char, is undefined behaviour and often indexes outside the classification table.', '음수인 일반 char 등 다른 값을 넘기면 정의되지 않은 동작이며 분류 표의 범위 밖을 참조하는 경우가 많습니다.'],
    fix: ['Convert the argument with (unsigned char) before the call, or pass the int returned by getc.', '호출 전에 인자를 (unsigned char)로 변환하거나 getc가 반환한 int를 넘기세요.'],
    check(unit, api) {
      for (const c of B.libCalls(unit, set(L.FUNCS['ctype.h']))) {
        const a = c.args[0];
        if (!a) continue;
        const nm = calleeName(c);
        const v = B.constInt(a, unit);
        if (v !== null) {
          if (v !== -1n && (v < 0n || v > 255n)) api.report(a, msg(`'${nm}' is called with ${v}, which is neither an unsigned char value nor EOF.`, `'${nm}'을(를) unsigned char 값도 EOF도 아닌 ${v}(으)로 호출합니다.`));
          continue;
        }
        const et = essCat(stripCasts(a) === a ? a : skipParens(a), unit);
        const signedChar = et && ((et.category === 'character' && unit.target.charSigned !== false) || (et.category === 'signed' && et.size === 1));
        if (signedChar) api.report(a, msg(`'${nm}' is called with '${text(unit, a)}' of type '${et.typedefName || et.name}', which may be negative.`, `'${nm}'을(를) 음수일 수 있는 '${et.typedefName || et.name}' 형의 '${text(unit, a)}'(으)로 호출합니다.`));
      }
    },
  }),
  rule({
    id: '21.14', cat: 'Required', type: 'BUG', debt: 10, decidable: false, amd: 'AMD1',
    name: ['memcmp shall not compare null-terminated strings', 'memcmp로 널 종료 문자열을 비교하면 안 됩니다'],
    why: ['memcmp also compares the bytes after the terminator, so equal strings can compare as different.', 'memcmp는 종료 문자 뒤의 바이트까지 비교하므로 같은 문자열도 다르다고 판단할 수 있습니다.'],
    fix: ['Use strcmp or strncmp for strings.', '문자열에는 strcmp나 strncmp를 사용하세요.'],
    check(unit, api) {
      for (const c of B.libCalls(unit, set('memcmp'))) {
        const arg = c.args.slice(0, 2).find((a) => {
          const x = origArg(a);
          if (!x) return false;
          if (x.type === 'StringLiteral') return true;
          const p = pointeeOf(a);
          return p && B.isPlainCharType(p) && stringInfo(a);
        });
        if (arg) api.report(c, msg(`'memcmp' compares the null-terminated string '${text(unit, arg)}'.`, `'memcmp'가 널 종료 문자열 '${text(unit, arg)}'을(를) 비교합니다.`));
      }
    },
  }),
  rule({
    id: '21.15', cat: 'Required', type: 'BUG', debt: 10, decidable: true, amd: 'AMD1',
    name: ['memcpy, memmove and memcmp pointer arguments shall point to compatible types', 'memcpy, memmove, memcmp의 포인터 인자는 호환되는 형을 가리켜야 합니다'],
    why: ['Copying or comparing objects of different types byte-wise is almost always a mistake.', '서로 다른 형의 객체를 바이트 단위로 복사하거나 비교하는 것은 거의 항상 실수입니다.'],
    fix: ['Pass pointers to objects of the same type (ignoring qualifiers).', '(한정자를 제외하고) 같은 형의 객체에 대한 포인터를 넘기세요.'],
    check(unit, api) {
      for (const c of B.libCalls(unit, set('memcpy', 'memmove', 'memcmp'))) {
        if (c.args.length < 2) continue;
        const a = pointeeOf(c.args[0]), b = pointeeOf(c.args[1]);
        if (!a || !b || T.isVoid(canon(a)) || T.isVoid(canon(b)) || T.isUnknown(canon(a)) || T.isUnknown(canon(b))) continue;
        if (T.sameType(a, b, { ignoreQuals: true })) continue;
        api.report(c, msg(`'${calleeName(c)}' gets pointers to different types '${T.typeToString(a)}' and '${T.typeToString(b)}'.`, `'${calleeName(c)}'에 서로 다른 형 '${T.typeToString(a)}'와(과) '${T.typeToString(b)}'에 대한 포인터를 넘깁니다.`));
      }
    },
  }),
  rule({
    id: '21.16', cat: 'Required', type: 'BUG', debt: 10, decidable: true, amd: 'AMD1',
    name: ['memcmp shall only compare pointer, integer, Boolean or enum objects', 'memcmp는 포인터, 정수, 불리언, 열거형 객체만 비교해야 합니다'],
    why: ['Structures contain padding, floating values have several representations of equal values and strings continue after the terminator, so byte-wise comparison gives wrong answers.', '구조체에는 패딩이 있고, 부동소수점은 같은 값의 표현이 여러 가지이며, 문자열은 종료 문자 뒤에도 바이트가 있어 바이트 비교 결과가 틀립니다.'],
    fix: ['Compare structures member by member, floating values with a tolerance and strings with strcmp.', '구조체는 멤버별로, 부동소수점은 허용 오차로, 문자열은 strcmp로 비교하세요.'],
    check(unit, api) {
      for (const c of B.libCalls(unit, set('memcmp'))) {
        for (const a of c.args.slice(0, 2)) {
          const p = pointeeOf(a);
          if (!p) continue;
          const pc = canon(p);
          if (!pc || T.isVoid(pc) || T.isUnknown(pc) || pc.kind === 'pointer') continue;
          const et = cf.essentialTypeOfType(p, { target: unit.target });
          const cat = et && et.category;
          if (['signed', 'unsigned', 'boolean', 'enum'].includes(cat)) continue;
          const what = pc.kind === 'record' ? `${pc.tag}` : pc.kind === 'array' ? 'array' : cat;
          api.report(a, msg(`'memcmp' compares objects of type '${T.typeToString(p)}' (${what}).`, `'memcmp'가 '${T.typeToString(p)}' 형(${what})의 객체를 비교합니다.`));
          break;
        }
      }
    },
  }),
  rule({
    id: '21.17', cat: 'Mandatory', type: 'VULNERABILITY', sev: 'BLOCKER', debt: 15, decidable: false, amd: 'AMD1', cwe: 'CWE-120', cert: 'STR31-C',
    name: ['<string.h> string functions shall not access beyond the objects', '<string.h> 문자열 함수가 객체 범위를 넘어 접근하면 안 됩니다'],
    why: ['Copying a string into a smaller array, or handing a string function an array without terminator, reads or writes out of bounds.', '더 작은 배열에 문자열을 복사하거나 종료 문자가 없는 배열을 문자열 함수에 넘기면 범위 밖을 읽거나 씁니다.'],
    fix: ['Make the destination large enough, ensure every string is terminated, or use bounded functions with a checked size.', '대상을 충분히 크게 하고, 모든 문자열이 종료되도록 하거나, 크기를 검사한 제한 함수를 사용하세요.'],
    check(unit, api) {
      for (const c of B.libCalls(unit, STRING_FNS)) {
        const nm = calleeName(c);
        for (const a of c.args.slice(0, nm === 'strchr' || nm === 'strrchr' || nm === 'strlen' ? 1 : 2)) {
          const si = stringInfo(a);
          if (si && si.unterminated && !(nm === 'strcpy' && a === c.args[0])) {
            api.report(a, msg(`'${nm}' reads '${si.name}', whose ${si.size} elements hold no null terminator.`, `'${nm}'이(가) ${si.size}개 요소에 널 종료 문자가 없는 '${si.name}'을(를) 읽습니다.`));
          }
        }
        if ((nm === 'strcpy' || nm === 'strcat') && c.args.length >= 2) {
          const d = destCapacity(c.args[0], unit);
          const s = stringInfo(c.args[1]);
          if (!d || !s || s.need == null) continue;
          let need = s.need;
          if (nm === 'strcat') {
            const di = stringInfo(c.args[0]);
            if (!di || di.need == null) continue;
            need = di.need - 1 + s.need;
          }
          if (need > d.size) api.report(c, msg(`'${nm}' writes ${need} characters into '${d.name}', which holds ${d.size}.`, `'${nm}'이(가) ${d.size}개만 담을 수 있는 '${d.name}'에 ${need}개 문자를 씁니다.`));
        }
      }
    },
  }),
  rule({
    id: '21.18', cat: 'Mandatory', type: 'VULNERABILITY', sev: 'BLOCKER', debt: 15, decidable: false, amd: 'AMD1', cwe: 'CWE-787', cert: 'ARR38-C',
    name: ['A size_t argument of a <string.h> function shall fit the objects', '<string.h> 함수의 size_t 인자는 객체 크기에 맞아야 합니다'],
    why: ['A length larger than the objects passed makes the function read or write beyond them.', '넘긴 객체보다 큰 길이를 주면 함수가 그 범위를 넘어 읽거나 씁니다.'],
    fix: ['Derive the length from sizeof of the destination, or check it against the object sizes.', '길이를 대상의 sizeof에서 구하거나 객체 크기와 비교해 검사하세요.'],
    check(unit, api) {
      for (const c of B.libCalls(unit, new Set(SIZE_FNS.keys()))) {
        const nm = calleeName(c);
        const n = c.args[SIZE_ARG[nm]];
        const v = n ? B.constInt(n, unit) : null;
        if (v === null) continue;
        for (const i of SIZE_FNS.get(nm)) {
          const bytes = objectBytes(c.args[i], unit);
          if (bytes != null && v > BigInt(bytes)) {
            api.report(n, msg(`'${nm}' is given the size ${v}, but '${text(unit, c.args[i])}' has only ${bytes} bytes.`, `'${nm}'에 크기 ${v}을(를) 주었지만 '${text(unit, c.args[i])}'은(는) ${bytes}바이트뿐입니다.`));
            break;
          }
        }
      }
    },
  }),
  rule({
    id: '21.19', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 10, decidable: false, amd: 'AMD1', cert: 'ENV30-C',
    name: ['Pointers from localeconv, getenv, setlocale and strerror shall be treated as const', 'localeconv, getenv, setlocale, strerror가 반환한 포인터는 const로 다뤄야 합니다'],
    why: ['These functions return pointers to library-owned data; modifying it is undefined behaviour.', '이 함수들은 라이브러리 소유 데이터의 포인터를 반환하므로 그 데이터를 수정하면 정의되지 않은 동작입니다.'],
    fix: ['Store the result in a pointer to const, and copy the data before changing it.', '결과를 const를 가리키는 포인터에 저장하고, 바꾸려면 먼저 데이터를 복사하세요.'],
    check(unit, api) {
      for (const c of B.libCalls(unit, CONST_RESULT)) {
        const nm = calleeName(c);
        let n = c;
        let p = cf.parentOf(n);
        while (p && (p.type === 'ParenExpr' || (p.type === 'CastExpr' && isConstPointee(p.ctype)))) { n = p; p = cf.parentOf(p); }
        if (!p) continue;
        let bad = null;
        if (p.type === 'CastExpr' && !isConstPointee(p.ctype)) bad = `is cast to '${T.typeToString(p.ctype)}'`;
        else if (p.type === 'VarDecl' && p.init === n && !isConstPointee(p.ctype)) bad = `is stored in '${p.name}' of type '${T.typeToString(p.ctype)}'`;
        else if (p.type === 'AssignExpr' && p.right === n && !isConstPointee(p.left.ctype)) bad = `is assigned to '${text(unit, p.left)}' of type '${T.typeToString(p.left.ctype)}'`;
        else if (p.type === 'CallExpr' && p.callee !== n) {
          const pt = paramType(p, p.args.indexOf(n));
          if (pt && !isConstPointee(pt)) bad = `is passed to '${calleeName(p) || text(unit, p.callee)}' as '${T.typeToString(pt)}'`;
        } else if (p.type === 'ReturnStmt') {
          const fd = cf.enclosing(p, 'FunctionDecl');
          const ft = fd && canon(fd.ctype);
          if (ft && ft.kind === 'function' && !isConstPointee(ft.ret)) bad = `is returned as '${T.typeToString(ft.ret)}'`;
        } else if ((p.type === 'IndexExpr' && p.object === n) || (p.type === 'UnaryExpr' && p.op === '*') || (p.type === 'MemberExpr' && p.arrow)) {
          let q = p;
          let pq = cf.parentOf(q);
          while (pq && pq.type === 'ParenExpr') { q = pq; pq = cf.parentOf(pq); }
          if (pq && ((pq.type === 'AssignExpr' && pq.left === q) || (pq.type === 'UnaryExpr' && (pq.op === '++' || pq.op === '--')))) bad = 'is used to modify the data it points to';
        }
        if (bad) api.report(c, msg(`The pointer returned by '${nm}' ${bad}.`, `'${nm}'이(가) 반환한 포인터가 const가 아닌 방식으로 쓰입니다: ${bad}.`));
      }
    },
  }),
  rule({
    id: '21.20', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 15, decidable: false, amd: 'AMD1', cert: 'ENV34-C',
    name: ['A pointer from asctime, getenv, strerror and similar shall not be used after the next call', 'asctime, getenv, strerror 등이 반환한 포인터는 다음 호출 후에 사용하면 안 됩니다'],
    why: ['These functions may return the same static buffer each time, so a later call overwrites the data an earlier pointer refers to.', '이 함수들은 매번 같은 정적 버퍼를 반환할 수 있어 나중 호출이 이전 포인터가 가리키는 데이터를 덮어씁니다.'],
    fix: ['Copy the result before calling the same function again.', '같은 함수를 다시 호출하기 전에 결과를 복사하세요.'],
    check(unit, api) {
      for (const fd of functions(unit)) {
        const events = F.run(fd, {
          node(n, st, emit) {
            if (n.type === 'CallExpr' && B.isLibCall(n, STALE_FNS)) {
              const nm = calleeName(n);
              for (const v of st.values()) if (v.has(`F:${nm}`)) { v.delete(`F:${nm}`); v.add(`S:${nm}:${n.loc.line}`); }
              return;
            }
            const assign = (sym, rhs) => {
              const x = stripCasts(rhs);
              if (x && x.type === 'CallExpr' && B.isLibCall(x, STALE_FNS)) st.set(sym, new Set([`F:${calleeName(x)}`]));
              else st.delete(sym);
            };
            if (n.type === 'VarDecl' && n.symbol && n.init) { assign(n.symbol, n.init); return; }
            if (n.type === 'AssignExpr' && n.op === '=') {
              const l = skipParens(n.left);
              if (l && l.type === 'Identifier' && l.symbol) assign(l.symbol, n.right);
              return;
            }
            if (n.type === 'Identifier' && n.symbol && st.has(n.symbol)) {
              for (const v of st.get(n.symbol)) {
                if (!v.startsWith('S:')) continue;
                const [, fn, line] = v.split(':');
                emit('21.20', n, msg(`'${n.name}' still points to the result of '${fn}', which the call at line ${line} may have overwritten.`, `'${n.name}'은(는) ${line}행의 호출로 덮어써졌을 수 있는 '${fn}'의 결과를 가리킵니다.`));
                break;
              }
            }
          },
        });
        for (const e of events) api.report(e.node, e.message);
      }
    },
  }),
  rule({
    id: '21.21', cat: 'Required', type: 'VULNERABILITY', debt: 15, decidable: true, amd: 'AMD2', cwe: 'CWE-78', cert: 'ENV33-C',
    name: ['The system function of <stdlib.h> shall not be used', '<stdlib.h>의 system 함수를 사용하면 안 됩니다'],
    why: ['system runs an external command interpreter whose presence and behaviour are implementation-defined and which is open to command injection.', 'system은 존재 여부와 동작이 구현에 따라 다른 외부 명령 해석기를 실행하며 명령 주입에 취약합니다.'],
    fix: ['Call the required functionality directly through a documented API.', '필요한 기능을 문서화된 API로 직접 호출하세요.'],
    check(unit, api) { banUses(unit, api, set('system'), ['runs an external command interpreter', '은(는) 외부 명령 해석기를 실행합니다']); },
  }),
  rule({
    id: '21.22', cat: 'Mandatory', type: 'BUG', debt: 10, decidable: true, amd: 'AMD3',
    name: ['Arguments of <tgmath.h> macros shall have an appropriate essential type', '<tgmath.h> 매크로의 인자는 적절한 본질적 형이어야 합니다'],
    why: ['A Boolean, character or enum argument selects a type-generic function through an implicit conversion that was hardly intended.', '불리언, 문자, 열거형 인자는 의도하지 않았을 암시적 변환으로 형 일반 함수를 선택합니다.'],
    fix: ['Pass an essentially signed, unsigned or floating value, converting explicitly if needed.', '필요하면 명시적으로 변환해 본질적으로 부호 있는 정수, 부호 없는 정수, 부동소수점 값을 넘기세요.'],
    check(unit, api) {
      if (!B.includesHeader(unit, 'tgmath.h').length && !unit.includes.some((i) => i.name === 'tgmath.h')) return;
      for (const c of B.libCalls(unit, TGMATH_ALL)) {
        for (const a of c.args) {
          const et = essCat(a, unit);
          if (et && ['boolean', 'character', 'enum', 'other'].includes(et.category)) {
            api.report(a, msg(`Argument '${text(unit, a)}' of type-generic '${calleeName(c)}' is essentially '${et.category}'.`, `형 일반 '${calleeName(c)}'의 인자 '${text(unit, a)}'이(가) 본질적 '${et.category}' 형입니다.`));
          }
        }
      }
    },
  }),
  rule({
    id: '21.23', cat: 'Required', type: 'BUG', debt: 10, decidable: true, amd: 'AMD3',
    name: ['Multi-argument <tgmath.h> macros shall get arguments of the same type', '여러 인자를 받는 <tgmath.h> 매크로의 인자 형은 같아야 합니다'],
    why: ['With mixed argument types the generic selection follows the usual conversions, which may silently change the precision used.', '인자 형이 섞이면 일반 선택이 통상 변환을 따라 사용되는 정밀도가 조용히 바뀔 수 있습니다.'],
    fix: ['Convert the arguments explicitly to one common type.', '인자를 하나의 공통 형으로 명시적으로 변환하세요.'],
    check(unit, api) {
      if (!unit.includes.some((i) => i.name === 'tgmath.h')) return;
      for (const c of B.libCalls(unit, TGMATH_MULTI)) {
        const nm = calleeName(c);
        const generic = nm === 'remquo' ? c.args.slice(0, 2) : nm === 'fma' ? c.args.slice(0, 3) : c.args.slice(0, 2);
        if (generic.length < 2) continue;
        const t0 = generic[0].ctype;
        const other = generic.find((a) => a.ctype && t0 && !T.sameType(T.unqualified(a.ctype), T.unqualified(t0), { ignoreQuals: true }));
        if (other) api.report(c, msg(`Type-generic '${nm}' gets arguments of types '${T.typeToString(t0)}' and '${T.typeToString(other.ctype)}'.`, `형 일반 '${nm}'에 '${T.typeToString(t0)}'와(과) '${T.typeToString(other.ctype)}' 형의 인자를 넘깁니다.`));
      }
    },
  }),
  rule({
    id: '21.24', cat: 'Required', type: 'VULNERABILITY', debt: 10, decidable: true, amd: 'AMD3', cwe: 'CWE-338', cert: 'MSC30-C',
    name: ['The random number functions of <stdlib.h> shall not be used', '<stdlib.h>의 난수 함수를 사용하면 안 됩니다'],
    why: ['rand produces a low-quality, predictable sequence that is unsuitable where randomness matters.', 'rand는 품질이 낮고 예측 가능한 수열을 만들어 무작위성이 중요한 곳에는 부적합합니다.'],
    fix: ['Use a documented random number generator suited to the purpose.', '목적에 맞는 문서화된 난수 생성기를 사용하세요.'],
    check(unit, api) { banUses(unit, api, set('rand', 'srand'), ['is a random number function of <stdlib.h>', '은(는) <stdlib.h>의 난수 함수입니다']); },
  }),
  rule({
    id: '21.25', cat: 'Required', type: 'BUG', debt: 15, decidable: true, amd: 'AMD4', cwe: 'CWE-662',
    name: ['Memory synchronisation shall use sequentially consistent ordering', '메모리 동기화는 순차 일관 순서를 사용해야 합니다'],
    why: ['Relaxed, acquire, release and consume orderings are subtle and allow reorderings that are very hard to reason about.', 'relaxed, acquire, release, consume 순서는 미묘하며 추론하기 매우 어려운 재배치를 허용합니다.'],
    fix: ['Use memory_order_seq_cst, or the atomic functions without _explicit.', 'memory_order_seq_cst나 _explicit가 없는 원자 함수를 사용하세요.'],
    check(unit, api) {
      for (const id of nodes(unit, 'Identifier')) {
        if (/^memory_order_(relaxed|consume|acquire|release|acq_rel)$/.test(id.name)) api.report(id, msg(`The memory order '${id.name}' is not sequentially consistent.`, `메모리 순서 '${id.name}'은(는) 순차 일관 순서가 아닙니다.`));
      }
      for (const e of unit.expansions) {
        if (isUserLoc(e) && !e.nested && /^memory_order_(relaxed|consume|acquire|release|acq_rel)$/.test(e.name)) api.report(e, msg(`The memory order '${e.name}' is not sequentially consistent.`, `메모리 순서 '${e.name}'은(는) 순차 일관 순서가 아닙니다.`));
      }
    },
  }),
  rule({
    id: '21.26', cat: 'Required', type: 'BUG', debt: 15, decidable: false, amd: 'AMD4',
    name: ['mtx_timedlock shall only be used on timed mutexes', 'mtx_timedlock은 시간 제한 뮤텍스에만 써야 합니다'],
    why: ['Calling mtx_timedlock on a mutex that was not initialised with mtx_timed is undefined behaviour.', 'mtx_timed로 초기화하지 않은 뮤텍스에 mtx_timedlock을 호출하면 정의되지 않은 동작입니다.'],
    fix: ['Initialise the mutex with mtx_timed (or mtx_timed | mtx_recursive), or use mtx_lock.', '뮤텍스를 mtx_timed(또는 mtx_timed | mtx_recursive)로 초기화하거나 mtx_lock을 사용하세요.'],
    project(project, api) {
      const info = R.projectInfo(project);
      for (const u of project.units) {
        for (const c of B.nodes(u, 'CallExpr')) {
          if (calleeName(c) !== 'mtx_timedlock' || !c.args[0]) continue;
          const k = R.objKey(c.args[0], u);
          if (info.timed.has(k.key) && !info.timed.get(k.key)) api.report(c, msg(`'mtx_timedlock' is used on mutex '${k.name}', which is not initialised with mtx_timed.`, `mtx_timed로 초기화하지 않은 뮤텍스 '${k.name}'에 'mtx_timedlock'을 사용합니다.`));
        }
      }
    },
  }),
];
