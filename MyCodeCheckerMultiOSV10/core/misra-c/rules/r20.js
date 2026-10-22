'use strict';

// MISRA C:2012 / 2023 chapter 20 — preprocessing directives.

const B = require('../lib/b-common');

const { rule, msg, isUserLoc } = B;

const userMacros = (unit) => unit.macros.filter((m) => isUserLoc(m) && !m.predefined && !m.commandLine && !m.builtin);
const userDirectives = (unit, kinds) => unit.directives.filter((d) => isUserLoc(d) && (!kinds || kinds.includes(d.kind)));
const diags = (unit, codes) => unit.diagnostics.filter((d) => isUserLoc(d) && codes.includes(d.code));

const NOT_OPERATORS = new Set(['(', ')', '[', ']', '{', '}', ',', ';', '#', '##', '...']);

function isParamToken(m, t) {
  if (!t || t.kind !== 'identifier' && t.kind !== 'keyword') return false;
  if (m.params.includes(t.value)) return true;
  return m.variadic && t.value === (m.vaName || '__VA_ARGS__');
}

// Occurrences of a parameter in a macro body: [{ i, operandOfHash, operandOfPaste }]
function paramUses(m, name) {
  const out = [];
  const b = m.body;
  for (let i = 0; i < b.length; i++) {
    const t = b[i];
    if ((t.kind !== 'identifier' && t.kind !== 'keyword') || t.value !== name) continue;
    const prev = b[i - 1], next = b[i + 1];
    out.push({ i, hash: !!(prev && prev.value === '#'), paste: !!((prev && prev.value === '##') || (next && next.value === '##')) });
  }
  return out;
}

const NONSTANDARD = new Set(['unknown', 'ident', 'sccs', 'assert', 'unassert', 'import']);

module.exports = [
  rule({
    id: '20.1', cat: 'Advisory', debt: 5, decidable: true,
    name: ['#include should only be preceded by directives or comments', '#include 앞에는 전처리 지시문이나 주석만 있어야 합니다'],
    why: ['Code before an #include can change the meaning of the included header and makes the dependencies hard to see.', '#include 앞의 코드는 포함된 헤더의 의미를 바꿀 수 있고 의존 관계를 알아보기 어렵게 합니다.'],
    fix: ['Move all #include directives to the top of the file.', '모든 #include 지시문을 파일 맨 위로 옮기세요.'],
    check(unit, api) {
      for (const inc of unit.includes) {
        if (!isUserLoc(inc) || !inc.precededByCode) continue;
        api.report(inc, msg(`'#include ${inc.angled ? `<${inc.name}>` : `"${inc.name}"`}' follows code in '${inc.file}'.`, `'${inc.file}'에서 '#include ${inc.angled ? `<${inc.name}>` : `"${inc.name}"`}'가 코드 뒤에 있습니다.`));
      }
    },
  }),
  rule({
    id: '20.2', cat: 'Required', type: 'BUG', debt: 5, decidable: true,
    name: ['Header names shall not contain \', ", \\, /* or //', '헤더 이름에 \', ", \\, /*, //가 있으면 안 됩니다'],
    why: ['These characters in a header name give undefined behaviour.', '헤더 이름에 이 문자들이 있으면 정의되지 않은 동작입니다.'],
    fix: ['Rename the header, and use / as the path separator.', '헤더 이름을 바꾸고 경로 구분자로 /를 사용하세요.'],
    check(unit, api) {
      for (const inc of unit.includes) {
        if (!isUserLoc(inc) || !inc.suspiciousChars) continue;
        api.report(inc, msg(`The header name '${inc.name}' contains a character sequence that is not allowed.`, `헤더 이름 '${inc.name}'에 허용되지 않는 문자열이 있습니다.`));
      }
    },
  }),
  rule({
    id: '20.3', cat: 'Required', type: 'BUG', debt: 5, decidable: true,
    name: ['#include shall be followed by <file> or "file"', '#include 뒤에는 <file> 또는 "file"이 와야 합니다'],
    why: ['Any other form of #include (also after macro expansion) is undefined behaviour or non-portable.', '(매크로 확장 후에도) 다른 형태의 #include는 정의되지 않은 동작이거나 이식성이 없습니다.'],
    fix: ['Write the header name in angle brackets or quotes, with nothing after it.', '헤더 이름을 꺾쇠괄호나 따옴표로 쓰고 그 뒤에 아무것도 두지 마세요.'],
    check(unit, api) {
      const incLines = new Set(userDirectives(unit, ['include']).map((d) => `${d.file}:${d.line}`));
      for (const d of userDirectives(unit, ['include'])) {
        if (d.invalid) api.report(d, msg(`'${d.text.trim()}' is not followed by <file> or "file".`, `'${d.text.trim()}' 뒤에 <file> 또는 "file"이 없습니다.`));
      }
      for (const g of diags(unit, ['pp-extra-tokens'])) {
        if (incLines.has(`${g.file}:${g.line}`)) api.report(g, msg('Extra tokens follow the header name of the #include directive.', '#include 지시문의 헤더 이름 뒤에 추가 토큰이 있습니다.'));
      }
    },
  }),
  rule({
    id: '20.4', cat: 'Required', debt: 5, decidable: true,
    name: ['A macro shall not have the name of a keyword', '매크로 이름이 키워드와 같으면 안 됩니다'],
    why: ['Redefining a keyword changes the language under the reader\'s feet and is undefined behaviour when standard headers are included.', '키워드를 재정의하면 읽는 사람 모르게 언어가 바뀌며, 표준 헤더를 포함하면 정의되지 않은 동작입니다.'],
    fix: ['Choose a macro name that is not a keyword.', '키워드가 아닌 매크로 이름을 고르세요.'],
    check(unit, api) {
      for (const m of userMacros(unit)) if (m.isKeyword) api.report(m, msg(`Macro '${m.name}' has the name of a keyword.`, `매크로 '${m.name}'의 이름이 키워드와 같습니다.`));
    },
  }),
  rule({
    id: '20.5', cat: 'Advisory', debt: 5, decidable: true,
    name: ['#undef should not be used', '#undef를 사용하지 않아야 합니다'],
    why: ['Undefining macros makes their meaning depend on the position in the file.', '매크로를 해제하면 그 의미가 파일 안의 위치에 따라 달라집니다.'],
    fix: ['Define each macro once, with a single meaning.', '각 매크로를 한 가지 의미로 한 번만 정의하세요.'],
    check(unit, api) {
      for (const d of userDirectives(unit, ['undef'])) if (d.active) api.report(d, msg(`'#undef ${d.macro || ''}' is used.`, `'#undef ${d.macro || ''}'를 사용했습니다.`));
    },
  }),
  rule({
    id: '20.6', cat: 'Required', type: 'BUG', debt: 5, decidable: true,
    name: ['Macro arguments shall not contain preprocessing directives', '매크로 인자에 전처리 지시문이 있으면 안 됩니다'],
    why: ['A line starting with # inside the arguments of a function-like macro is undefined behaviour.', '함수형 매크로 인자 안에 #으로 시작하는 줄이 있으면 정의되지 않은 동작입니다.'],
    fix: ['Move the conditional outside the macro invocation and write two invocations.', '조건부 지시문을 매크로 호출 밖으로 옮기고 호출을 두 번 쓰세요.'],
    check(unit, api) {
      for (const g of diags(unit, ['pp-directive-in-macro-args'])) api.report(g, msg('A preprocessing directive appears inside macro arguments.', '매크로 인자 안에 전처리 지시문이 있습니다.'));
    },
  }),
  rule({
    id: '20.7', cat: 'Required', type: 'BUG', debt: 5, decidable: true, cert: 'PRE01-C',
    name: ['Macro parameters used in expressions shall be parenthesised', '식에 쓰인 매크로 매개변수는 괄호로 감싸야 합니다'],
    why: ['Without parentheses an argument such as a + b binds to the operators around it in the macro body and gives a different result.', '괄호가 없으면 a + b 같은 인자가 매크로 본문의 주변 연산자와 결합해 다른 결과가 나옵니다.'],
    fix: ['Write every use of the parameter as (param) in the macro body.', '매크로 본문에서 매개변수를 모두 (param) 형태로 쓰세요.'],
    check(unit, api) {
      for (const m of userMacros(unit)) {
        if (m.kind !== 'function') continue;
        const b = m.body;
        const reported = new Set();
        for (let i = 0; i < b.length; i++) {
          const t = b[i];
          if (!isParamToken(m, t) || reported.has(t.value)) continue;
          const prev = b[i - 1], next = b[i + 1];
          if ((prev && (prev.value === '#' || prev.value === '##')) || (next && next.value === '##')) continue;
          if (prev && (prev.value === '.' || prev.value === '->')) continue;
          const opPrev = prev && prev.kind === 'punct' && !NOT_OPERATORS.has(prev.value);
          const opNext = next && next.kind === 'punct' && !NOT_OPERATORS.has(next.value);
          if (!opPrev && !opNext) continue;
          reported.add(t.value);
          api.report({ file: m.file, line: t.line || m.line, column: t.col }, msg(`Parameter '${t.value}' of macro '${m.name}' is used as an operand without parentheses.`, `매크로 '${m.name}'의 매개변수 '${t.value}'이(가) 괄호 없이 피연산자로 쓰였습니다.`));
        }
      }
    },
  }),
  rule({
    id: '20.8', cat: 'Required', debt: 5, decidable: true,
    name: ['#if and #elif expressions shall evaluate to 0 or 1', '#if와 #elif 식의 값은 0 또는 1이어야 합니다'],
    why: ['A controlling expression with another value is a sign that a Boolean test was intended but a numeric one was written.', '다른 값이 나오는 제어 식은 불리언 검사를 의도했지만 숫자 검사를 썼다는 신호입니다.'],
    fix: ['Write an explicit comparison, for example #if VERSION != 0.', '#if VERSION != 0처럼 명시적인 비교를 쓰세요.'],
    check(unit, api) {
      for (const d of userDirectives(unit, ['if', 'elif'])) {
        if (!d.active || d.taken === null || d.taken === undefined || !d.exprOk || d.value === undefined || d.value === null) continue;
        const v = typeof d.value === 'bigint' ? d.value : BigInt(Math.trunc(Number(d.value)));
        if (v !== 0n && v !== 1n) api.report(d, msg(`The expression of '#${d.kind}' evaluates to ${v}, not 0 or 1.`, `'#${d.kind}' 식의 값이 0이나 1이 아닌 ${v}입니다.`));
      }
    },
  }),
  rule({
    id: '20.9', cat: 'Required', debt: 5, decidable: true,
    name: ['Identifiers in #if and #elif shall be defined before use', '#if와 #elif의 식별자는 사용 전에 정의되어야 합니다'],
    why: ['An undefined identifier silently evaluates to 0, which hides a missing or misspelt configuration macro.', '정의되지 않은 식별자는 조용히 0으로 평가되어 빠졌거나 철자가 틀린 설정 매크로를 숨깁니다.'],
    fix: ['Define the macro, or test it with defined() first.', '매크로를 정의하거나 먼저 defined()로 검사하세요.'],
    check(unit, api) {
      for (const u of unit.undefInIf || []) {
        if (!isUserLoc(u)) continue;
        api.report(u, msg(`'${u.name}' is not defined but is evaluated in '#${(u.directive && u.directive.kind) || 'if'}'.`, `'${u.name}'이(가) 정의되지 않았는데 '#${(u.directive && u.directive.kind) || 'if'}'에서 평가됩니다.`));
      }
    },
  }),
  rule({
    id: '20.10', cat: 'Advisory', debt: 10, decidable: true,
    name: ['The # and ## operators should not be used', '# 및 ## 연산자를 사용하지 않아야 합니다'],
    why: ['The evaluation order of several # and ## operators is unspecified and their results are often surprising.', '여러 # 및 ## 연산자의 평가 순서는 정해져 있지 않고 결과가 예상과 다른 경우가 많습니다.'],
    fix: ['Avoid token pasting and stringification, or document the use as a deviation.', '토큰 붙이기와 문자열화를 피하거나, 사용을 편차로 문서화하세요.'],
    check(unit, api) {
      for (const m of userMacros(unit)) {
        if (!m.usesStringify && !m.usesPaste) continue;
        const ops = [m.usesStringify ? '#' : null, m.usesPaste ? '##' : null].filter(Boolean).join(' and ');
        api.report(m, msg(`Macro '${m.name}' uses the ${ops} operator.`, `매크로 '${m.name}'이(가) ${ops} 연산자를 사용합니다.`));
      }
    },
  }),
  rule({
    id: '20.11', cat: 'Required', type: 'BUG', debt: 5, decidable: true,
    name: ['A parameter after # shall not be followed by ##', '# 뒤의 매개변수 다음에 ##가 오면 안 됩니다'],
    why: ['The order of evaluation of # and ## is unspecified, so # param ## x may stringify or paste first.', '#과 ##의 평가 순서는 정해져 있지 않아 # param ## x가 먼저 문자열화될지 붙여질지 알 수 없습니다.'],
    fix: ['Split the operation into two macro levels.', '연산을 두 단계의 매크로로 나누세요.'],
    check(unit, api) {
      for (const m of userMacros(unit)) {
        if (m.kind !== 'function' || !m.usesStringify || !m.usesPaste) continue;
        const b = m.body;
        for (let i = 0; i + 2 < b.length; i++) {
          if (b[i].value === '#' && isParamToken(m, b[i + 1]) && b[i + 2].value === '##') {
            api.report({ file: m.file, line: b[i].line || m.line, column: b[i].col }, msg(`In macro '${m.name}', '#${b[i + 1].value}' is immediately followed by '##'.`, `매크로 '${m.name}'에서 '#${b[i + 1].value}' 바로 뒤에 '##'가 옵니다.`));
          }
        }
      }
    },
  }),
  rule({
    id: '20.12', cat: 'Required', debt: 10, decidable: true,
    name: ['A parameter used with # or ## and further replaced shall only be used with them', '#·##와 함께 쓰이고 추가 치환되는 매개변수는 그 연산자와만 써야 합니다'],
    why: ['An argument is macro-expanded where the parameter is used normally but not where it is used with # or ##, so one parameter yields two different texts.', '매개변수를 보통으로 쓴 곳에서는 인자가 매크로 확장되지만 #·##와 쓴 곳에서는 확장되지 않아, 한 매개변수가 서로 다른 두 텍스트가 됩니다.'],
    fix: ['Use separate parameters, or a second macro level, for the stringified and the expanded forms.', '문자열화한 형태와 확장된 형태에 별도의 매개변수나 두 번째 매크로 단계를 사용하세요.'],
    check(unit, api) {
      const macroNames = new Set([...unit.macroTable.keys(), ...unit.macros.map((m) => m.name)]);
      for (const e of unit.expansions) {
        const m = e.def;
        if (!m || m.kind !== 'function' || !isUserLoc(m) || !e.args || !isUserLoc(e) || e.nested) continue;
        if (!m.usesStringify && !m.usesPaste) continue;
        m.params.forEach((p, idx) => {
          const uses = paramUses(m, p);
          const special = uses.some((u) => u.hash || u.paste);
          const plain = uses.some((u) => !u.hash && !u.paste);
          if (!special || !plain) return;
          const arg = e.args[idx] || [];
          const mac = arg.find((t) => t.kind === 'identifier' && macroNames.has(t.value));
          if (mac) api.report(e, msg(`Argument '${mac.value}' of '${m.name}' is a macro, and parameter '${p}' is used both with #/## and as a plain operand.`, `'${m.name}'의 인자 '${mac.value}'은(는) 매크로인데 매개변수 '${p}'이(가) #/##와 일반 피연산자로 모두 쓰였습니다.`));
        });
      }
    },
  }),
  rule({
    id: '20.13', cat: 'Required', debt: 5, decidable: true,
    name: ['A line starting with # shall be a valid preprocessing directive', '#으로 시작하는 줄은 올바른 전처리 지시문이어야 합니다'],
    why: ['An invalid or misspelt directive (also in excluded code) is either ignored or rejected, hiding what was intended.', '잘못되었거나 철자가 틀린 지시문은 (제외된 코드에서도) 무시되거나 거부되어 의도를 숨깁니다.'],
    fix: ['Correct the directive name or remove the line.', '지시문 이름을 고치거나 줄을 제거하세요.'],
    check(unit, api) {
      const c23 = /23|2x/.test(unit.std || '');
      for (const d of userDirectives(unit)) {
        let bad = NONSTANDARD.has(d.kind) || (d.kind === 'include' && d.name === 'include_next');
        if (!c23 && (d.kind === 'warning' || d.kind === 'elifdef' || d.kind === 'elifndef' || d.name === 'embed')) bad = true;
        if (bad) api.report(d, msg(`'#${d.name || d.kind}' is not a valid preprocessing directive.`, `'#${d.name || d.kind}'은(는) 올바른 전처리 지시문이 아닙니다.`));
      }
    },
  }),
  rule({
    id: '20.14', cat: 'Required', debt: 10, decidable: true,
    name: ['#else, #elif and #endif shall be in the same file as their #if', '#else, #elif, #endif는 대응하는 #if와 같은 파일에 있어야 합니다'],
    why: ['Conditional blocks spread over several files are hard to follow and break when the include structure changes.', '여러 파일에 걸친 조건부 블록은 따라가기 어렵고 포함 구조가 바뀌면 깨집니다.'],
    fix: ['Close every #if group in the file where it starts.', '모든 #if 그룹을 시작한 파일 안에서 닫으세요.'],
    check(unit, api) {
      for (const g of diags(unit, ['pp-conditional-across-files', 'pp-unterminated-conditional', 'pp-unmatched-conditional'])) {
        api.report(g, msg(`Conditional directive not matched in the same file: ${g.message}.`, `같은 파일에서 짝이 맞지 않는 조건부 지시문입니다: ${g.message}.`));
      }
    },
  }),
];
