'use strict';

// MISRA C++:2008 chapter 16 — preprocessing directives.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');
const L = require('../../lib/lex');

const QUALS = new Set(['const', 'volatile', 'static', 'extern', 'register', 'mutable', 'inline']);

function guardOf(unit, file) {
  const g = unit.headerGuards && unit.headerGuards.get(file);
  return g && g.guarded ? g : null;
}

// Preprocessor used for something other than inclusion and include guards.
function otherUse(unit, api) {
  for (const d of L.directives(unit, api, 'cpp08-16-2-1')) {
    if (!d.active && !['else', 'elif', 'endif'].includes(d.kind)) continue;
    const g = guardOf(unit, d.file);
    if (['include', 'import', 'null', 'line', 'pragma', 'error', 'warning'].includes(d.kind)) continue;
    if (g && d.kind === 'define' && d.macro === g.macro) continue;
    if (g && (d.kind === 'ifndef' || d.kind === 'if') && d.line === g.ifLine) continue;
    if (g && d.kind === 'endif' && d.line === g.endifLine) continue;
    if (d.kind === 'endif' || d.kind === 'else') continue; // reported with their #if
    api.report(d, M(`'#${d.name || d.kind}' is used for something other than file inclusion or an include guard.`, `'#${d.name || d.kind}'를 파일 포함이나 include 가드 외의 용도로 사용했습니다.`));
  }
}

// Macros used for something other than include guards, type qualifiers or storage class specifiers.
function macroUse(unit, api) {
  const files = new Set(U.sourcesOnce(unit, api, 'cpp08-16-2-2').map(([f]) => f));
  for (const m of unit.macros || []) {
    if (!files.has(m.file)) continue;
    const b = m.body || [];
    // empty object-like macros (include guards, configuration flags) and single qualifiers are allowed
    if (m.kind === 'object' && (!b.length || (b.length === 1 && QUALS.has(b[0].value)))) continue;
    api.report({ file: m.file, line: m.line, col: m.col }, M(`Macro '${m.name}' is not an include guard, a type qualifier or a storage class specifier.`, `매크로 '${m.name}'가 include 가드, 형식 한정자, 저장 클래스 지정자가 아닙니다.`));
  }
}

module.exports = [
  CPP08({
    id: '16-0-1', cat: 'R', dec: true, cpp2023: '19.0.3', c2012: '20.1',
    name: ['#include shall only be preceded by directives or comments', '#include 앞에는 지시문이나 주석만 와야 합니다'],
    why: ['Code before an #include may change how the header is read.', '#include 앞의 코드가 헤더 해석을 바꿀 수 있습니다.'],
    fix: ['Put all #include directives at the top.', '모든 #include를 맨 위에 두세요.'],
    reuse: 'misra-cpp:19.0.3',
  }),
  CPP08({
    id: '16-0-2', cat: 'R', dec: true,
    name: ['Macros shall only be defined or undefined in the global namespace', '매크로는 전역 네임스페이스에서만 정의하거나 해제해야 합니다'],
    why: ['Macros ignore scopes, so a definition inside a block or namespace misleads.', '매크로는 범위를 무시하므로 블록이나 네임스페이스 안의 정의는 오해를 줍니다.'],
    fix: ['Move the directive to file level.', '지시문을 파일 수준으로 옮기세요.'],
    check(unit, api) { L.macroInBlock(unit, api, 'cpp08-16-0-2', true); },
  }),
  CPP08({
    id: '16-0-3', cat: 'R', dec: true, c2012: '20.5',
    name: ['#undef shall not be used', '#undef를 사용하지 않아야 합니다'],
    why: ['#undef makes macro meaning depend on position.', '#undef는 매크로 의미가 위치에 따라 달라지게 합니다.'],
    fix: ['Use distinct macro names.', '서로 다른 매크로 이름을 사용하세요.'],
    check(unit, api) { L.undefs(unit, api, 'cpp08-16-0-3'); },
  }),
  CPP08({
    id: '16-0-4', cat: 'R', dec: true, cpp2023: '19.0.2', c2012: 'dir-4.9',
    name: ['Function-like macros shall not be defined', '함수형 매크로를 정의하지 않아야 합니다'],
    why: ['Inline functions and templates are type-safe alternatives.', '인라인 함수와 템플릿은 형식 안전한 대안입니다.'],
    fix: ['Replace the macro with an inline function or a template.', '매크로를 인라인 함수나 템플릿으로 바꾸세요.'],
    reuse: 'misra-cpp:19.0.2',
  }),
  CPP08({
    id: '16-0-5', cat: 'R', dec: true, cpp2023: '19.3.5', c2012: '20.6',
    name: ['Macro arguments shall not contain directive-like tokens', '매크로 인수에 지시문처럼 보이는 토큰이 없어야 합니다'],
    why: ['A directive inside macro arguments is undefined behaviour.', '매크로 인수 안의 지시문은 정의되지 않은 동작입니다.'],
    fix: ['Move the directive outside the invocation.', '지시문을 호출 밖으로 옮기세요.'],
    reuse: 'misra-cpp:19.3.5',
  }),
  CPP08({
    id: '16-0-6', cat: 'R', dec: true, cpp2023: '19.3.4', c2012: '20.7',
    name: ['Macro parameters shall be parenthesised in the replacement list', '매크로 매개변수는 대체 목록에서 괄호로 묶어야 합니다'],
    why: ['An argument expression can combine with surrounding operators.', '인수 식이 주변 연산자와 결합할 수 있습니다.'],
    fix: ['Write (x) for every use of a parameter, except with # and ##.', '#와 ##를 제외하고 매개변수를 쓸 때마다 (x)로 쓰세요.'],
    check(unit, api) { L.macroParamParens(unit, api, 'cpp08-16-0-6'); },
  }),
  CPP08({
    id: '16-0-7', cat: 'R', dec: true, cpp2023: '19.1.3', c2012: '20.9',
    name: ['Undefined macros shall not be used in #if, except with defined', '#if에서 defined 없이 정의되지 않은 매크로를 사용하지 않아야 합니다'],
    why: ['An undefined identifier silently evaluates to 0.', '정의되지 않은 식별자는 조용히 0으로 평가됩니다.'],
    fix: ['Define the macro or test it with defined().', '매크로를 정의하거나 defined()로 검사하세요.'],
    reuse: 'misra-cpp:19.1.3',
  }),
  CPP08({
    id: '16-0-8', cat: 'R', dec: true, cpp2023: '19.0.1', c2012: '20.13',
    name: ['A # at the start of a line shall be followed by a preprocessing token', '줄 처음의 # 뒤에는 전처리 토큰이 와야 합니다'],
    why: ['A lone # (null directive) is easily a leftover or a typing error.', '홀로 있는 #(널 지시문)는 남은 찌꺼기나 입력 실수이기 쉽습니다.'],
    fix: ['Remove the # or complete the directive.', '#를 지우거나 지시문을 완성하세요.'],
    check(unit, api) { L.nullDirective(unit, api, 'cpp08-16-0-8'); },
  }),
  CPP08({
    id: '16-1-1', cat: 'R', dec: true, cpp2023: '19.1.1',
    name: ["The 'defined' operator shall be used in a standard form", "'defined' 연산자는 표준 형식으로 사용해야 합니다"],
    why: ['Other forms, such as defined produced by a macro, are undefined.', '매크로가 만든 defined 같은 다른 형식은 정의되지 않습니다.'],
    fix: ["Write 'defined(NAME)' or 'defined NAME' directly.", "'defined(NAME)'나 'defined NAME'을 직접 쓰세요."],
    reuse: 'misra-cpp:19.1.1',
  }),
  CPP08({
    id: '16-1-2', cat: 'R', dec: true, cpp2023: '19.1.2', c2012: '20.14',
    name: ['#else, #elif and #endif shall be in the file of their #if', '#else, #elif, #endif는 해당 #if의 파일에 있어야 합니다'],
    why: ['Conditional blocks spread over files are hard to follow.', '여러 파일에 걸친 조건 블록은 따라가기 어렵습니다.'],
    fix: ['Close every conditional in the file that opens it.', '조건 블록을 연 파일에서 닫으세요.'],
    reuse: 'misra-cpp:19.1.2',
  }),
  CPP08({
    id: '16-2-1', cat: 'A', dec: true,
    name: ['The preprocessor should only be used for inclusion and include guards', '전처리기는 파일 포함과 include 가드에만 사용해야 합니다'],
    why: ['Conditional compilation and macros make the code differ from what is read.', '조건부 컴파일과 매크로는 코드가 읽히는 것과 다르게 만듭니다.'],
    fix: ['Use constants, inline functions and templates instead.', '대신 상수, 인라인 함수, 템플릿을 사용하세요.'],
    check: otherUse,
  }),
  CPP08({
    id: '16-2-2', cat: 'R', dec: true,
    name: ['Macros shall only be include guards, type qualifiers or storage class specifiers', '매크로는 include 가드, 형식 한정자, 저장 클래스 지정자로만 써야 합니다'],
    why: ['Other macros bypass the type system and scopes.', '다른 매크로는 형식 시스템과 범위를 우회합니다.'],
    fix: ['Use const objects, inline functions or templates.', 'const 객체, 인라인 함수, 템플릿을 사용하세요.'],
    check: macroUse,
  }),
  CPP08({
    id: '16-2-3', cat: 'R', dec: true, cpp2023: '19.2.1', c2012: 'dir-4.10',
    name: ['Include guards shall be provided', 'include 가드를 제공해야 합니다'],
    why: ['A header included twice may redefine entities.', '두 번 포함된 헤더는 개체를 재정의할 수 있습니다.'],
    fix: ['Wrap the header in an include guard.', '헤더를 include 가드로 감싸세요.'],
    reuse: 'misra-cpp:19.2.1',
  }),
  CPP08({
    id: '16-2-4', cat: 'R', dec: true, c2012: '20.2',
    name: ["Header names shall not contain ', \", /* or //", "헤더 이름에 ', \", /*, //가 없어야 합니다"],
    why: ['These characters in header names are undefined behaviour.', '헤더 이름 안의 이 문자들은 정의되지 않은 동작입니다.'],
    fix: ['Rename the header.', '헤더 이름을 바꾸세요.'],
    check(unit, api) { L.headerNameChars(unit, api, 'cpp08-16-2-4', ["'", '"', '/*', '//']); },
  }),
  CPP08({
    id: '16-2-5', cat: 'A', dec: true, c2012: '20.2',
    name: ['Header names should not contain a backslash', '헤더 이름에 역슬래시를 쓰지 않아야 합니다'],
    why: ['A backslash in a header name is implementation-defined.', '헤더 이름의 역슬래시는 구현 정의입니다.'],
    fix: ['Use forward slashes.', '슬래시를 사용하세요.'],
    check(unit, api) { L.headerNameChars(unit, api, 'cpp08-16-2-5', ['\\']); },
  }),
  CPP08({
    id: '16-2-6', cat: 'R', dec: true, cpp2023: '19.2.2', c2012: '20.3',
    name: ['#include shall be followed by <file> or "file"', '#include 뒤에는 <file> 또는 "file"이 와야 합니다'],
    why: ['Other forms depend on macro expansion.', '다른 형식은 매크로 확장에 의존합니다.'],
    fix: ['Write the header name directly.', '헤더 이름을 직접 쓰세요.'],
    reuse: 'misra-cpp:19.2.2',
  }),
  CPP08({
    id: '16-3-1', cat: 'R', dec: true, cpp2023: '19.3.2',
    name: ['A macro shall contain at most one # or ## operator', '매크로에는 # 또는 ## 연산자가 하나 이하여야 합니다'],
    why: ['The order of several # and ## operators is unspecified.', '여러 #와 ## 연산자의 순서는 지정되지 않습니다.'],
    fix: ['Split the macro.', '매크로를 나누세요.'],
    check(unit, api) { L.multipleHashOps(unit, api, 'cpp08-16-3-1'); },
  }),
  CPP08({
    id: '16-3-2', cat: 'A', dec: true, cpp2023: '19.3.1', c2012: '20.10',
    name: ['The # and ## operators should not be used', '#와 ## 연산자를 사용하지 않아야 합니다'],
    why: ['Stringizing and token pasting are hard to read and check.', '문자열화와 토큰 붙이기는 읽고 검사하기 어렵습니다.'],
    fix: ['Write the names or strings directly.', '이름이나 문자열을 직접 쓰세요.'],
    reuse: 'misra-cpp:19.3.1',
  }),
  CPP08({
    id: '16-6-1', cat: 'D', manual: true,
    name: ['All uses of #pragma shall be documented', '모든 #pragma 사용은 문서화해야 합니다'],
    why: ['Pragmas change compiler behaviour in implementation-defined ways.', '#pragma는 구현 정의 방식으로 컴파일러 동작을 바꿉니다.'],
    fix: ['Document each pragma and why it is needed.', '각 #pragma와 그 필요성을 문서화하세요.'],
  }),
];
