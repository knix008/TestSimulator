'use strict';

// MISRA C:2004 chapter 19 — preprocessing directives.

const { C04, M } = require('../../lib/meta');
const U = require('../../lib/util');
const L = require('../../lib/lex');

const QUALS = new Set(['const', 'volatile', 'static', 'extern', 'auto', 'register']);

function closes(b, open, i) {
  // index of the token matching b[i] (an opening bracket)
  const close = open === '(' ? ')' : '}';
  let depth = 0;
  for (let k = i; k < b.length; k++) {
    if (b[k].value === open) depth++;
    else if (b[k].value === close) { depth--; if (depth === 0) return k; }
  }
  return -1;
}

// Allowed replacement lists of C macros.
function allowedBody(b) {
  if (!b.length) return true;
  if (b.length === 1 && ['number', 'char', 'string'].includes(b[0].kind)) return true;
  if (b.every((t) => t.kind === 'string')) return true;
  if (b.length === 1 && QUALS.has(b[0].value)) return true;
  if (b[0].value === '(' && closes(b, '(', 0) === b.length - 1) return true;
  if (b[0].value === '{' && closes(b, '{', 0) === b.length - 1) return true;
  if (b[0].value === 'do' && b.slice(-4).map((t) => t.value).join(' ') === 'while ( 0 )') return true;
  return false;
}

function macroBodies(unit, api) {
  const files = new Set(U.sourcesOnce(unit, api, 'c04-19.4').map(([f]) => f));
  for (const m of unit.macros || []) {
    if (!files.has(m.file)) continue;
    if (allowedBody(m.body || [])) continue;
    api.report({ file: m.file, line: m.line, col: m.col }, M(`Macro '${m.name}' expands to something other than a constant, a braced initialiser, a parenthesised expression, a qualifier or a do-while-zero block.`,
      `매크로 '${m.name}'가 상수, 중괄호 초기화자, 괄호 식, 한정자, do-while-zero 블록이 아닌 것으로 확장됩니다.`));
  }
}

module.exports = [
  C04({
    id: '19.1', cat: 'A', dec: true, c2012: '20.1',
    name: ['#include should only be preceded by directives or comments', '#include 앞에는 지시문이나 주석만 와야 합니다'],
    why: ['Code before an #include may change how the header is interpreted.', '#include 앞의 코드가 헤더 해석을 바꿀 수 있습니다.'],
    fix: ['Group all #include directives at the top of the file.', '모든 #include를 파일 맨 위에 모으세요.'],
    reuse: 'misra-c:20.1',
  }),
  C04({
    id: '19.2', cat: 'A', dec: true, c2012: '20.2',
    name: ['Header names should not contain non-standard characters', '헤더 이름에 비표준 문자를 쓰지 않아야 합니다'],
    why: ["The characters ', \", \\, /* and // in header names have undefined behaviour.", "헤더 이름 안의 ', \", \\, /*, //는 정의되지 않은 동작입니다."],
    fix: ['Rename the header or use forward slashes only.', '헤더 이름을 바꾸거나 슬래시만 사용하세요.'],
    reuse: 'misra-c:20.2',
  }),
  C04({
    id: '19.3', cat: 'R', dec: true, c2012: '20.3',
    name: ['#include shall be followed by <file> or "file"', '#include 뒤에는 <file> 또는 "file"이 와야 합니다'],
    why: ['Other forms depend on macro expansion and are easily wrong.', '다른 형식은 매크로 확장에 의존해 틀리기 쉽습니다.'],
    fix: ['Write the header name directly.', '헤더 이름을 직접 쓰세요.'],
    reuse: 'misra-c:20.3',
  }),
  C04({
    id: '19.4', cat: 'R', dec: true,
    name: ['Macros shall only expand to a restricted set of forms', '매크로는 제한된 형식으로만 확장되어야 합니다'],
    why: ['Macros that expand to partial statements or unparenthesised expressions behave unexpectedly.', '부분 문이나 괄호 없는 식으로 확장되는 매크로는 예상과 다르게 동작합니다.'],
    fix: ['Make the body a constant, a parenthesised expression, a braced initialiser, a qualifier or do { } while (0).', '본문을 상수, 괄호 식, 중괄호 초기화자, 한정자, do { } while (0) 중 하나로 만드세요.'],
    check: macroBodies,
  }),
  C04({
    id: '19.5', cat: 'R', dec: true,
    name: ['Macros shall not be defined or undefined within a block', '블록 안에서 매크로를 정의하거나 해제하지 않아야 합니다'],
    why: ['Macros have no scope, so a definition inside a block misleads the reader.', '매크로에는 범위가 없으므로 블록 안의 정의는 읽는 사람을 오도합니다.'],
    fix: ['Move the #define or #undef to file level.', '#define이나 #undef를 파일 수준으로 옮기세요.'],
    check(unit, api) { L.macroInBlock(unit, api, 'c04-19.5', false); },
  }),
  C04({
    id: '19.6', cat: 'R', dec: true, c2012: '20.5',
    name: ['#undef shall not be used', '#undef를 사용하지 않아야 합니다'],
    why: ['#undef makes the meaning of a macro depend on the position in the file.', '#undef는 매크로의 의미가 파일 안의 위치에 따라 달라지게 합니다.'],
    fix: ['Use a distinct macro name instead of redefining.', '재정의 대신 다른 매크로 이름을 사용하세요.'],
    reuse: 'misra-c:20.5',
  }),
  C04({
    id: '19.7', cat: 'A', dec: true, c2012: 'dir-4.9',
    name: ['Functions should be preferred to function-like macros', '함수형 매크로보다 함수를 사용해야 합니다'],
    why: ['Functions check argument types and evaluate arguments once.', '함수는 인수 형식을 검사하고 인수를 한 번만 평가합니다.'],
    fix: ['Replace the macro with a (static) function.', '매크로를 (static) 함수로 바꾸세요.'],
    reuse: 'misra-c:dir-4.9',
  }),
  C04({
    id: '19.8', cat: 'R', dec: true,
    name: ['Function-like macros shall be invoked with all their arguments', '함수형 매크로는 모든 인수와 함께 호출해야 합니다'],
    why: ['Missing macro arguments are undefined behaviour in C90.', '빠진 매크로 인수는 C90에서 정의되지 않은 동작입니다.'],
    fix: ['Pass every argument of the macro.', '매크로의 모든 인수를 전달하세요.'],
    check: L.macroArgsMissing,
  }),
  C04({
    id: '19.9', cat: 'R', dec: true, c2012: '20.6',
    name: ['Macro arguments shall not contain directive-like tokens', '매크로 인수에 지시문처럼 보이는 토큰이 없어야 합니다'],
    why: ['A # line inside macro arguments is undefined behaviour.', '매크로 인수 안의 # 줄은 정의되지 않은 동작입니다.'],
    fix: ['Move the directive outside the macro invocation.', '지시문을 매크로 호출 밖으로 옮기세요.'],
    reuse: 'misra-c:20.6',
  }),
  C04({
    id: '19.10', cat: 'R', dec: true, c2012: '20.7',
    name: ['Macro parameters shall be parenthesised in the replacement list', '매크로 매개변수는 대체 목록에서 괄호로 묶어야 합니다'],
    why: ['Without parentheses an argument expression can combine with surrounding operators.', '괄호가 없으면 인수 식이 주변 연산자와 결합할 수 있습니다.'],
    fix: ['Write (x) for every use of parameter x, except as an operand of # or ##.', '# 또는 ##의 피연산자를 제외하고 매개변수 x를 쓸 때마다 (x)로 쓰세요.'],
    check(unit, api) { L.macroParamParens(unit, api, 'c04-19.10'); },
  }),
  C04({
    id: '19.11', cat: 'R', dec: true, c2012: '20.9',
    name: ['Macro identifiers in #if shall be defined before use', '#if의 매크로 식별자는 사용 전에 정의해야 합니다'],
    why: ['An undefined identifier silently evaluates to 0.', '정의되지 않은 식별자는 조용히 0으로 평가됩니다.'],
    fix: ['Define the macro or test it with defined().', '매크로를 정의하거나 defined()로 검사하세요.'],
    reuse: 'misra-c:20.9',
  }),
  C04({
    id: '19.12', cat: 'R', dec: true,
    name: ['A macro shall contain at most one # or ## operator', '매크로에는 # 또는 ## 연산자가 하나 이하여야 합니다'],
    why: ['The evaluation order of several # and ## operators is unspecified.', '여러 #와 ## 연산자의 평가 순서는 지정되어 있지 않습니다.'],
    fix: ['Split the macro into several macros with one operator each.', '매크로를 연산자가 하나씩인 여러 매크로로 나누세요.'],
    check(unit, api) { L.multipleHashOps(unit, api, 'c04-19.12'); },
  }),
  C04({
    id: '19.13', cat: 'A', dec: true, c2012: '20.10',
    name: ['The # and ## operators should not be used', '#와 ## 연산자를 사용하지 않아야 합니다'],
    why: ['Stringizing and token pasting make code hard to read and check.', '문자열화와 토큰 붙이기는 코드를 읽고 검사하기 어렵게 합니다.'],
    fix: ['Write the identifiers or strings directly.', '식별자나 문자열을 직접 쓰세요.'],
    reuse: 'misra-c:20.10',
  }),
  C04({
    id: '19.14', cat: 'R', dec: true,
    name: ["The 'defined' operator shall be used in a standard form", "'defined' 연산자는 표준 형식으로 사용해야 합니다"],
    why: ["Only 'defined X' and 'defined(X)' are well defined; other uses, such as from macro expansion, are undefined.", "'defined X'와 'defined(X)'만 잘 정의되어 있고 매크로 확장 같은 다른 사용은 정의되지 않습니다."],
    fix: ["Write 'defined(NAME)' directly in the #if.", "#if 안에 'defined(NAME)'를 직접 쓰세요."],
    check(unit, api) { L.definedForm(unit, api, 'c04-19.14'); },
  }),
  C04({
    id: '19.15', cat: 'R', dec: true, c2012: 'dir-4.10',
    name: ['Headers shall be protected against multiple inclusion', '헤더는 중복 포함을 막아야 합니다'],
    why: ['A header included twice can redefine types and objects.', '두 번 포함된 헤더는 형식과 객체를 재정의할 수 있습니다.'],
    fix: ['Wrap the header in an include guard.', '헤더를 include 가드로 감싸세요.'],
    reuse: 'misra-c:dir-4.10',
  }),
  C04({
    id: '19.16', cat: 'R', dec: true,
    name: ['Directives shall be valid even in excluded code', '제외된 코드에서도 지시문은 올바라야 합니다'],
    why: ['An invalid directive in an excluded block becomes an error when the block is enabled.', '제외된 블록의 잘못된 지시문은 블록을 켜면 오류가 됩니다.'],
    fix: ['Correct or remove the directive.', '지시문을 고치거나 지우세요.'],
    check(unit, api) { L.skippedDirectives(unit, api, 'c04-19.16'); },
  }),
  C04({
    id: '19.17', cat: 'R', dec: true, c2012: '20.14',
    name: ['#else, #elif and #endif shall be in the same file as their #if', '#else, #elif, #endif는 해당 #if와 같은 파일에 있어야 합니다'],
    why: ['Conditional blocks spread over files are hard to follow.', '여러 파일에 걸친 조건 블록은 따라가기 어렵습니다.'],
    fix: ['Close every conditional in the file that opens it.', '모든 조건 블록을 연 파일에서 닫으세요.'],
    reuse: 'misra-c:20.14',
  }),
];
