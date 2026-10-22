'use strict';

// MISRA C++:2023 chapter 19 — preprocessing directives.

const { R, M } = require('../lib/meta');
const U = require('../lib/util');

const userFile = (f) => typeof f === 'string' && !f.startsWith('<');
const userMacros = (unit) => (unit.macros || []).filter((m) => userFile(m.file) && !m.predefined && !m.commandLine && !m.builtin);
const diags = (unit, codes) => (unit.diagnostics || []).filter((d) => codes.includes(d.code) && userFile(d.file));
const at = (x) => ({ file: x.file, line: x.line, col: x.col });

// Classify every occurrence of each parameter in a function-like macro body.
function paramUse(m) {
  const body = m.body || [];
  const params = new Set(m.params || []);
  if (m.variadic) params.add('__VA_ARGS__');
  const use = new Map();
  body.forEach((t, i) => {
    if (t.kind !== 'identifier' || !params.has(t.value)) return;
    const prev = body[i - 1];
    const next = body[i + 1];
    const op = (prev && (prev.value === '#' || prev.value === '##')) || (next && next.value === '##');
    let u = use.get(t.value);
    if (!u) use.set(t.value, (u = { op: 0, plain: 0, idx: [] }));
    if (op) u.op++; else { u.plain++; u.idx.push(i); }
  });
  return use;
}

module.exports = [
  R({
    id: '19.0.1', cat: 'Required', dec: true, autosar: 'M16-0-8', sev: 'MAJOR', debt: 5,
    name: ['A line whose first token is # shall be a valid preprocessing directive', '첫 토큰이 # 인 줄은 올바른 전처리 지시문이어야 합니다'],
    why: ['An unknown directive is either a typo or a compiler extension; in excluded code it can hide mistakes.', '알 수 없는 지시문은 오타이거나 컴파일러 확장이며, 제외된 코드에서는 실수를 숨길 수 있습니다.'],
    fix: ['Correct the directive name or remove the line.', '지시문 이름을 고치거나 그 줄을 없애세요.'],
    check(unit, api) {
      for (const d of unit.directives || []) {
        if (d.kind === 'unknown' && userFile(d.file)) api.report(at(d), M(`'#${d.name}' is not a valid preprocessing directive.`, `'#${d.name}' 는 올바른 전처리 지시문이 아닙니다.`));
      }
    },
  }),
  R({
    id: '19.0.2', cat: 'Required', dec: true, autosar: 'A16-0-1', sev: 'MAJOR', debt: 10,
    name: ['Function-like macros shall not be defined', '함수형 매크로는 정의하면 안 됩니다'],
    why: ['Function-like macros ignore scope and types and evaluate arguments in surprising ways.', '함수형 매크로는 범위와 타입을 무시하고 인자를 의외의 방식으로 평가합니다.'],
    fix: ['Use an inline function, a function template or a constexpr function.', 'inline 함수, 함수 템플릿, constexpr 함수를 쓰세요.'],
    check(unit, api) {
      for (const m of userMacros(unit)) if (m.kind === 'function') api.report(at(m), M(`Function-like macro '${m.name}' is defined.`, `함수형 매크로 '${m.name}' 가 정의되었습니다.`));
    },
  }),
  R({
    id: '19.0.3', cat: 'Advisory', dec: true, autosar: 'M16-0-1', sev: 'MINOR', debt: 5,
    name: ['#include directives should only be preceded by preprocessor directives or comments', '#include 앞에는 전처리 지시문이나 주석만 와야 합니다'],
    why: ['Includes in the middle of code make the dependencies of a file hard to see and can change meaning with the surrounding declarations.', '코드 중간의 include 는 파일의 의존 관계를 보기 어렵게 하고 주변 선언에 따라 의미가 바뀔 수 있습니다.'],
    fix: ['Move the #include to the top of the file.', '#include 를 파일 맨 위로 옮기세요.'],
    check(unit, api) {
      for (const i of unit.includes || []) if (i.precededByCode && userFile(i.file)) api.report(at(i), M(`#include "${i.name}" appears after code.`, `#include "${i.name}" 가 코드 뒤에 있습니다.`));
    },
  }),
  R({
    id: '19.0.4', cat: 'Advisory', dec: true, sev: 'MINOR', debt: 2,
    name: ['#undef should only be used for macros defined previously in the same file', '#undef 는 같은 파일에서 앞서 정의한 매크로에만 써야 합니다'],
    why: ['Undefining a macro defined elsewhere changes the meaning of other files in non-obvious ways.', '다른 곳에서 정의한 매크로를 해제하면 다른 파일의 의미가 알아차리기 어렵게 바뀝니다.'],
    fix: ['Only #undef macros that this file #defines earlier.', '이 파일이 앞에서 #define 한 매크로만 #undef 하세요.'],
    check(unit, api) {
      const defs = userMacros(unit);
      for (const d of unit.directives || []) {
        if (d.kind !== 'undef' || !d.active || !userFile(d.file) || !d.macro) continue;
        const ok = defs.some((m) => m.name === d.macro && m.file === d.file && m.line < d.line);
        if (!ok) api.report(at(d), M(`#undef '${d.macro}' refers to a macro not defined earlier in this file.`, `#undef '${d.macro}' 가 이 파일 앞쪽에서 정의되지 않은 매크로를 가리킵니다.`));
      }
    },
  }),
  R({
    id: '19.1.1', cat: 'Required', dec: true, type: 'BUG', autosar: 'M16-1-1', sev: 'MAJOR', debt: 5,
    name: ['The defined preprocessor operator shall be used appropriately', 'defined 전처리 연산자는 알맞게 써야 합니다'],
    why: ['"defined" produced by macro expansion, or used without a macro name, has undefined behaviour.', '매크로 확장으로 만들어진 "defined" 나 매크로 이름 없이 쓴 defined 는 정의되지 않은 동작입니다.'],
    fix: ['Write "defined(NAME)" or "defined NAME" directly in the #if/#elif.', '#if/#elif 안에 "defined(NAME)" 이나 "defined NAME" 을 직접 쓰세요.'],
    check(unit, api) {
      for (const d of diags(unit, ['pp-defined-no-name', 'pp-defined-from-macro'])) api.report(at(d), M(`Inappropriate use of 'defined': ${d.message}.`, `'defined' 를 알맞지 않게 씁니다: ${d.message}.`));
      for (const m of userMacros(unit)) if ((m.body || []).some((t) => t.value === 'defined')) api.report(at(m), M(`The body of macro '${m.name}' contains 'defined'.`, `매크로 '${m.name}' 의 본문에 'defined' 가 있습니다.`));
    },
  }),
  R({
    id: '19.1.2', cat: 'Required', dec: true, autosar: 'M16-1-2', sev: 'MAJOR', debt: 10,
    name: ['All #else, #elif and #endif preprocessor directives shall reside in the same file as the #if, #ifdef or #ifndef directive to which they are related', '#else, #elif, #endif 는 짝이 되는 #if, #ifdef, #ifndef 와 같은 파일에 있어야 합니다'],
    why: ['Conditional blocks spanning files are very hard to follow and break when inclusion order changes.', '파일에 걸친 조건 블록은 따라가기 매우 어렵고 포함 순서가 바뀌면 깨집니다.'],
    fix: ['Close every conditional block in the file that opens it.', '조건 블록은 연 파일 안에서 닫으세요.'],
    check(unit, api) {
      for (const d of diags(unit, ['pp-conditional-across-files', 'pp-unterminated-conditional', 'pp-unmatched-conditional'])) api.report(at(d), M(`Conditional directive is not matched in the same file: ${d.message}.`, `조건 지시문의 짝이 같은 파일에 없습니다: ${d.message}.`));
    },
  }),
  R({
    id: '19.1.3', cat: 'Required', dec: true, autosar: 'M16-0-7', sev: 'MAJOR', debt: 5,
    name: ['All identifiers used in the controlling expression of #if or #elif preprocessing directives shall be defined prior to evaluation', '#if 와 #elif 의 조건식에 쓴 식별자는 평가 전에 정의되어 있어야 합니다'],
    why: ['An undefined identifier silently evaluates as 0, which hides typos and missing configuration.', '정의되지 않은 식별자는 조용히 0 으로 평가되어 오타나 누락된 설정을 숨깁니다.'],
    fix: ['Define the macro, or test it with defined() first.', '매크로를 정의하거나 먼저 defined() 로 검사하세요.'],
    check(unit, api) {
      for (const u of unit.undefInIf || []) if (userFile(u.file)) api.report(at(u), M(`'${u.name}' is not defined when the #if/#elif is evaluated (it is treated as 0).`, `#if/#elif 를 평가할 때 '${u.name}' 가 정의되어 있지 않습니다 (0 으로 처리).`));
    },
  }),
  R({
    id: '19.2.1', cat: 'Required', dec: true, autosar: 'M16-2-3', sev: 'MAJOR', debt: 5,
    name: ['Precautions shall be taken in order to prevent the contents of a header file being included more than once', '헤더 파일 내용이 두 번 이상 포함되지 않도록 대비해야 합니다'],
    why: ['Including a header twice can cause redefinition errors or ODR problems.', '헤더를 두 번 포함하면 재정의 오류나 ODR 문제가 생길 수 있습니다.'],
    fix: ['Add an include guard (#ifndef X / #define X ... #endif).', 'include 가드 (#ifndef X / #define X ... #endif) 를 추가하세요.'],
    check(unit, api) {
      for (const f of unit.files || []) {
        if (f === unit.file || !userFile(f) || !U.isHeaderFile(f)) continue;
        const g = unit.headerGuards && unit.headerGuards.get(f);
        if (g && !g.guarded && !g.pragmaOnce) api.report({ file: f, line: 1, col: 1 }, M(`Header '${f}' has no include guard.`, `헤더 '${f}' 에 include 가드가 없습니다.`));
      }
      if (unit.standaloneHeader) {
        const g = unit.headerGuards && unit.headerGuards.get(unit.file);
        if (g && !g.guarded && !g.pragmaOnce) api.report({ file: unit.file, line: 1, col: 1 }, M(`Header '${unit.file}' has no include guard.`, `헤더 '${unit.file}' 에 include 가드가 없습니다.`));
      }
    },
  }),
  R({
    id: '19.2.2', cat: 'Required', dec: true, type: 'BUG', autosar: 'M16-2-6', sev: 'MAJOR', debt: 5,
    name: ['The #include directive shall be followed by either a <filename> or "filename" sequence', '#include 뒤에는 <filename> 이나 "filename" 이 와야 합니다'],
    why: ['Any other form is undefined behaviour or implementation-defined.', '다른 형태는 정의되지 않은 동작이거나 구현 정의입니다.'],
    fix: ['Write the header name in quotes or angle brackets.', '헤더 이름을 따옴표나 꺾쇠괄호로 쓰세요.'],
    check(unit, api) {
      for (const d of unit.directives || []) if (d.kind === 'include' && d.active && d.invalid && userFile(d.file)) api.report(at(d), M(`'${d.text.trim()}' is not followed by <filename> or "filename".`, `'${d.text.trim()}' 뒤에 <filename> 이나 "filename" 이 없습니다.`));
    },
  }),
  R({
    id: '19.2.3', cat: 'Required', dec: true, type: 'BUG', autosar: 'A16-2-1', sev: 'MAJOR', debt: 2,
    name: ['The \' or " or \\ characters and the /* or // character sequences shall not occur in a header file name', '헤더 파일 이름에 \' " \\ 문자나 /* // 문자열이 있으면 안 됩니다'],
    why: ['These characters in a header name give undefined behaviour.', '헤더 이름의 이런 문자는 정의되지 않은 동작을 일으킵니다.'],
    fix: ['Rename the header or use forward slashes only.', '헤더 이름을 바꾸거나 경로 구분에 / 만 쓰세요.'],
    check(unit, api) {
      for (const i of unit.includes || []) if (i.suspiciousChars && userFile(i.file)) api.report(at(i), M(`Header name '${i.name}' contains a forbidden character sequence.`, `헤더 이름 '${i.name}' 에 금지된 문자열이 있습니다.`));
    },
  }),
  R({
    id: '19.3.1', cat: 'Advisory', dec: true, autosar: 'M16-3-2', sev: 'MINOR', debt: 5,
    name: ['The # and ## preprocessor operators should not be used', '# 와 ## 전처리 연산자는 쓰지 않아야 합니다'],
    why: ['The evaluation order of # and ## is unspecified and token pasting is error-prone.', '# 와 ## 의 평가 순서는 명시되지 않았고 토큰 붙이기는 실수하기 쉽습니다.'],
    fix: ['Avoid stringizing and pasting; use templates or constexpr strings.', '문자열화와 토큰 붙이기를 피하고 템플릿이나 constexpr 문자열을 쓰세요.'],
    check(unit, api) {
      for (const m of userMacros(unit)) {
        if (m.usesStringify || m.usesPaste) api.report(at(m), M(`Macro '${m.name}' uses the ${[m.usesStringify && '#', m.usesPaste && '##'].filter(Boolean).join(' and ')} operator.`, `매크로 '${m.name}' 가 ${[m.usesStringify && '#', m.usesPaste && '##'].filter(Boolean).join(', ')} 연산자를 씁니다.`));
      }
    },
  }),
  R({
    id: '19.3.2', cat: 'Required', dec: true, sev: 'MAJOR', debt: 5,
    name: ['A macro parameter immediately following a # operator shall not be immediately followed by a ## operator', '# 연산자 바로 뒤의 매크로 매개변수 바로 뒤에 ## 연산자가 오면 안 됩니다'],
    why: ['The order of evaluation of # and ## is unspecified, so the result is not portable.', '# 와 ## 의 평가 순서가 명시되지 않아 결과가 이식성이 없습니다.'],
    fix: ['Split the operation over two macros.', '연산을 두 매크로로 나누세요.'],
    check(unit, api) {
      for (const m of userMacros(unit)) {
        if (m.kind !== 'function') continue;
        const b = m.body || [];
        for (let i = 0; i + 2 < b.length; i++) {
          if (b[i].value === '#' && b[i + 1].kind === 'identifier' && (m.params || []).includes(b[i + 1].value) && b[i + 2].value === '##') {
            api.report(at(m), M(`In macro '${m.name}', '#${b[i + 1].value}' is immediately followed by '##'.`, `매크로 '${m.name}' 에서 '#${b[i + 1].value}' 바로 뒤에 '##' 가 옵니다.`));
            break;
          }
        }
      }
    },
  }),
  R({
    id: '19.3.3', cat: 'Required', dec: true, sev: 'MAJOR', debt: 10,
    name: ['The argument to a mixed-use macro parameter shall not be subject to further expansion', '혼합 사용 매크로 매개변수의 인자는 추가로 확장되면 안 됩니다'],
    why: ['A parameter used both with #/## and normally receives the argument unexpanded in one place and expanded in the other.', '#/## 와 함께 쓰이면서 일반적으로도 쓰이는 매개변수는 한 곳에서는 확장되지 않은 인자를, 다른 곳에서는 확장된 인자를 받습니다.'],
    fix: ['Do not pass macro names to such parameters, or split the macro.', '이런 매개변수에 매크로 이름을 넘기지 말거나 매크로를 나누세요.'],
    check(unit, api) {
      const macroNames = new Set((unit.macros || []).map((m) => m.name));
      for (const e of unit.expansions || []) {
        const m = e.def;
        if (!m || m.kind !== 'function' || !e.args || !userFile(e.file) || e.nested) continue;
        const use = paramUse(m);
        (m.params || []).forEach((p, i) => {
          const u = use.get(p);
          if (!u || !u.op || !u.plain) return;
          const arg = e.args[i] || [];
          const mac = arg.find((t) => t.kind === 'identifier' && macroNames.has(t.value));
          if (mac) api.report(at(e), M(`Argument '${mac.value}' of mixed-use parameter '${p}' of macro '${m.name}' is itself a macro.`, `매크로 '${m.name}' 의 혼합 사용 매개변수 '${p}' 에 넘긴 인자 '${mac.value}' 가 그 자체로 매크로입니다.`));
        });
      }
    },
  }),
  R({
    id: '19.3.4', cat: 'Required', dec: true, autosar: 'M16-0-6', sev: 'MAJOR', debt: 5,
    name: ['Parentheses shall be used to ensure macro arguments are expanded appropriately', '매크로 인자가 알맞게 확장되도록 괄호를 써야 합니다'],
    why: ['An unparenthesised parameter combines with neighbouring operators in the expansion ("x + 1" with x = "a << 2").', '괄호 없는 매개변수는 확장 결과에서 주변 연산자와 엉뚱하게 결합합니다 (x 가 "a << 2" 일 때 "x + 1").'],
    fix: ['Enclose each use of the parameter in parentheses.', '매개변수를 쓸 때마다 괄호로 감싸세요.'],
    check(unit, api) {
      for (const m of userMacros(unit)) {
        if (m.kind !== 'function') continue;
        const b = m.body || [];
        if (b.length <= 1) continue;
        const use = paramUse(m);
        let bad = null;
        for (const [p, u] of use) {
          for (const i of u.idx) {
            const prev = b[i - 1]; const next = b[i + 1];
            const pv = prev ? prev.value : null; const nv = next ? next.value : null;
            if (pv === '(' && nv === ')') continue;
            if ((pv === '(' || pv === ',') && (nv === ')' || nv === ',')) continue;
            if ((pv === '{' || pv === ',') && (nv === '}' || nv === ',')) continue;
            bad = p; break;
          }
          if (bad) break;
        }
        if (bad) api.report(at(m), M(`Parameter '${bad}' of macro '${m.name}' is used without enclosing parentheses.`, `매크로 '${m.name}' 의 매개변수 '${bad}' 가 괄호 없이 쓰입니다.`));
      }
    },
  }),
  R({
    id: '19.3.5', cat: 'Required', dec: true, type: 'BUG', autosar: 'M16-0-5', sev: 'MAJOR', debt: 5,
    name: ['Tokens that look like a preprocessing directive shall not occur within a macro argument', '매크로 인자 안에 전처리 지시문처럼 보이는 토큰이 있으면 안 됩니다'],
    why: ['A directive inside macro arguments has undefined behaviour.', '매크로 인자 안의 지시문은 정의되지 않은 동작입니다.'],
    fix: ['Move the conditional outside the macro invocation.', '조건부 지시문을 매크로 호출 밖으로 옮기세요.'],
    check(unit, api) {
      for (const d of diags(unit, ['pp-directive-in-macro-args'])) api.report(at(d), M(`A preprocessing directive appears inside macro arguments: ${d.message}.`, `매크로 인자 안에 전처리 지시문이 있습니다: ${d.message}.`));
    },
  }),
  R({
    id: '19.6.1', cat: 'Advisory', dec: true, autosar: 'A16-7-1', sev: 'MINOR', debt: 5,
    name: ['The #pragma directive and the _Pragma operator should not be used', '#pragma 지시문과 _Pragma 연산자는 쓰지 않아야 합니다'],
    why: ['Pragmas are implementation-defined and silently ignored by other compilers.', 'pragma 는 구현 정의이고 다른 컴파일러에서는 조용히 무시됩니다.'],
    fix: ['Remove the pragma or isolate and document it.', 'pragma 를 없애거나 격리하고 문서화하세요.'],
    check(unit, api) {
      for (const p of unit.pragmas || []) if (userFile(p.file)) api.report(at(p), M(`'${(p.text || '#pragma').trim()}' is used.`, `'${(p.text || '#pragma').trim()}' 를 씁니다.`));
    },
  }),
];
