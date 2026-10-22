'use strict';

// SEI CERT C — PRE: preprocessor.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const { M } = U;

const userMacros = (unit) => (unit.macros || []).filter((m) => m.file && !m.file.startsWith('<') && !m.predefined && !m.commandLine && !m.builtin);
const at = (m) => ({ file: m.file, line: m.line, column: m.col });
const tv = (t) => t && t.value;

const SIDE_OPS = new Set(['++', '--', '=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '^=', '|=']);

// Parameters of a function-like macro that are evaluated more than once.
function multiUse(m) {
  const count = new Map();
  for (let i = 0; i < m.body.length; i++) {
    const t = m.body[i];
    if (t.kind !== 'identifier' || !m.params.includes(t.value)) continue;
    const prev = tv(m.body[i - 1]), next = tv(m.body[i + 1]);
    if (prev === '#' || prev === '##' || next === '##') continue;
    if (prev === 'sizeof' || prev === '.' || prev === '->') continue;
    count.set(t.value, (count.get(t.value) || 0) + 1);
  }
  return new Set([...count].filter(([, n]) => n > 1).map(([k]) => k));
}

const STMT_TOKENS = new Set([';', '{', '}', 'do', 'while', 'for', 'if', 'else', 'return', 'switch', 'goto', 'break', 'continue', 'case', 'default', '#', '##', 'typedef', 'struct', 'union', 'enum', 'class', 'template', 'typename', 'static', 'extern', 'asm', '__asm__', '__attribute__', '_Pragma', '__VA_ARGS__', '__VA_OPT__']);
const TYPE_KW = new Set(['int', 'char', 'short', 'long', 'float', 'double', 'void', 'signed', 'unsigned', '_Bool', 'bool', 'const', 'volatile', 'auto', 'register', 'typeof', '__typeof__', 'decltype', '_Generic', 'static_cast', 'reinterpret_cast', 'const_cast', 'dynamic_cast']);
const DYNAMIC = new Set(['__LINE__', '__FILE__', '__func__', '__FUNCTION__', '__PRETTY_FUNCTION__', '__COUNTER__', '__DATE__', '__TIME__']);

const BIN_OPS = new Set(['+', '-', '*', '/', '%', '<<', '>>', '&', '|', '^', '&&', '||', '<', '>', '<=', '>=', '==', '!=', '?', ':', ',', '=', '+=', '-=', '*=', '/=']);
const isOperand = (t) => !!t && (t.kind === 'identifier' || t.kind === 'number' || t.kind === 'char' || t.kind === 'string' || t.value === ')' || t.value === ']');
const isOperandStart = (t) => !!t && (t.kind === 'identifier' || t.kind === 'number' || t.kind === 'char' || t.kind === 'string' || t.value === '(' || t.value === '-' || t.value === '~' || t.value === '!' || t.value === '+');

module.exports = [
  rule('PRE30-C', {
    risk: 'LUM', cwe: ['CWE-176'],
    name: ['Do not create a universal character name through concatenation', '토큰 연결로 유니버설 문자 이름을 만들지 마세요'],
    why: ['Pasting tokens with ## so that the result is a universal character name (\\uXXXX) is undefined behavior.', '## 로 토큰을 이어 붙인 결과가 유니버설 문자 이름(\\uXXXX)이 되면 정의되지 않은 동작입니다.'],
    fix: ['Write the universal character name directly instead of building it with ##.', '## 로 만들지 말고 유니버설 문자 이름을 직접 쓰세요.'],
  }, {
    check(unit, api) {
      const toks = unit.tokens || [];
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i];
        if (!t.pasted || typeof t.value !== 'string') continue;
        // a complete \uXXXX produced by ##, or a stray '\' followed by the pasted hex digits
        const prev = toks[i - 1];
        const split = !!prev && prev.value === '\\' && /^[uU][0-9A-Fa-f]/.test(t.value);
        if (!/\\[uU]/.test(t.value) && !split) continue;
        const site = t.site || t;
        if (!site.file || site.file.startsWith('<')) continue;
        const ucn = (split ? '\\' : '') + t.value;
        api.report({ file: site.file, line: site.line, column: site.col }, M(`Token pasting in macro '${t.fromMacro || t.macro || '?'}' creates the universal character name '${ucn}'.`, `매크로 '${t.fromMacro || t.macro || '?'}' 의 토큰 연결이 유니버설 문자 이름 '${ucn}' 를 만듭니다.`));
      }
    },
  }),

  rule('PRE31-C', {
    risk: 'LUL', cwe: ['CWE-758'], approx: true,
    name: ['Avoid side effects in arguments to unsafe macros', '안전하지 않은 매크로의 인수에 부수 효과를 두지 마세요'],
    why: ['A macro that evaluates a parameter more than once repeats the side effect (x++ runs twice); assert() arguments vanish under NDEBUG.', '매개변수를 여러 번 평가하는 매크로는 부수 효과를 반복하고(x++ 가 두 번 실행), assert() 인수는 NDEBUG 에서 사라집니다.'],
    fix: ['Perform the side effect in a separate statement and pass the plain value, or turn the macro into an inline function.', '부수 효과는 별도 문장에서 수행하고 값만 넘기거나 매크로를 인라인 함수로 바꾸세요.'],
  }, {
    check(unit, api) {
      const cache = new Map();
      for (const e of unit.expansions || []) {
        if (e.nested || !e.file || e.file.startsWith('<') || !e.args || !e.def || e.def.kind !== 'function') continue;
        const isAssert = e.name === 'assert';
        let multi = cache.get(e.def);
        if (!multi) cache.set(e.def, (multi = multiUse(e.def)));
        if (!isAssert && !multi.size) continue;
        for (let i = 0; i < e.args.length; i++) {
          const pname = e.def.params[i];
          if (!isAssert && !multi.has(pname)) continue;
          const bad = e.args[i].find((t) => t.kind === 'punct' && SIDE_OPS.has(t.value));
          if (!bad) continue;
          const text = e.args[i].map((t) => t.value).join('');
          if (isAssert) api.report({ file: e.file, line: e.line, column: e.col }, M(`assert(${text}) has a side effect ('${bad.value}') that disappears when NDEBUG is defined.`, `assert(${text}) 의 부수 효과('${bad.value}')는 NDEBUG 가 정의되면 사라집니다.`));
          else api.report({ file: e.file, line: e.line, column: e.col }, M(`Argument '${text}' with side effect '${bad.value}' is passed to macro ${e.name}(), which evaluates '${pname}' more than once.`, `부수 효과 '${bad.value}' 가 있는 인수 '${text}' 를 '${pname}' 를 여러 번 평가하는 매크로 ${e.name}() 에 넘깁니다.`));
          break;
        }
      }
    },
  }),

  rule('PRE32-C', {
    risk: 'LUM', cwe: ['CWE-758'],
    name: ['Do not use preprocessor directives in invocations of function-like macros', '함수형 매크로 호출 안에 전처리 지시문을 쓰지 마세요'],
    why: ['A directive such as #ifdef inside the argument list of a function-like macro is undefined behavior; library functions like memcpy may be macros.', '함수형 매크로의 인수 목록 안에 #ifdef 같은 지시문을 쓰면 정의되지 않은 동작입니다. memcpy 같은 라이브러리 함수도 매크로일 수 있습니다.'],
    fix: ['Move the conditional outside the call and write one complete call per branch.', '조건부 지시문을 호출 밖으로 옮기고 분기마다 완전한 호출을 쓰세요.'],
  }, {
    check(unit, api) {
      for (const d of unit.diagnostics || []) {
        if (d.code !== 'pp-directive-in-macro-args' || !d.file || d.file.startsWith('<')) continue;
        api.report({ file: d.file, line: d.line, column: d.col }, M('Preprocessor directive inside the arguments of a function-like macro invocation.', '함수형 매크로 호출의 인수 안에 전처리 지시문이 있습니다.'));
      }
      // Directives inside the arguments of well-known library calls, which may be macros.
      const dirs = (unit.directives || []).filter((d) => d.file === unit.file && d.kind !== 'define' && d.kind !== 'undef');
      if (!dirs.length) return;
      for (const c of U.libCalls(unit, new Set(['memcpy', 'memmove', 'memset', 'strcpy', 'strncpy', 'printf', 'fprintf', 'sprintf', 'snprintf', 'puts', 'putc', 'getc', 'assert']))) {
        if (c.loc.file !== unit.file || c.loc.macro) continue;
        const d = dirs.find((x) => x.line > c.loc.line && x.line < c.loc.endLine);
        if (d) api.report({ file: d.file, line: d.line, column: d.col }, M(`#${d.name} inside the arguments of ${U.callName(c)}(), which may be implemented as a macro.`, `매크로로 구현될 수 있는 ${U.callName(c)}() 의 인수 안에 #${d.name} 가 있습니다.`));
      }
    },
  }),

  rule('PRE00-C', {
    risk: 'MLM', cwe: ['CWE-628'], approx: true,
    name: ['Prefer inline or static functions to function-like macros', '함수형 매크로보다 inline 또는 static 함수를 사용하세요'],
    why: ['Function-like macros have no type checking, evaluate arguments a variable number of times and are hard to debug.', '함수형 매크로는 형 검사가 없고, 인수 평가 횟수가 일정하지 않으며, 디버깅이 어렵습니다.'],
    fix: ['Replace the macro with a static inline function.', '매크로를 static inline 함수로 바꾸세요.'],
  }, {
    check(unit, api) {
      // macros defined inside a function body usually use its locals: not convertible
      const bodies = U.functions(unit).filter((f) => f.body && f.body.loc).map((f) => f.body.loc);
      const insideFn = (m) => bodies.some((l) => l.file === m.file && m.line > l.line && m.line < l.endLine);
      for (const m of userMacros(unit)) {
        if (m.kind !== 'function' || m.variadic || m.usesStringify || m.usesPaste || !m.params.length || !m.body.length) continue;
        if (insideFn(m)) continue;
        if (m.body.some((t) => STMT_TOKENS.has(t.value) || TYPE_KW.has(t.value) || DYNAMIC.has(t.value))) continue;
        // parameters used as member names, types or not at all suggest a non-function use
        const used = new Set();
        let odd = false;
        for (let i = 0; i < m.body.length; i++) {
          const t = m.body[i];
          if (t.kind !== 'identifier' || !m.params.includes(t.value)) continue;
          const prev = tv(m.body[i - 1]);
          const next = m.body[i + 1];
          if (prev === '.' || prev === '->' || prev === 'sizeof') odd = true;
          if (next && (next.kind === 'identifier' || (next.value === '*' && tv(m.body[i + 2]) === ')'))) odd = true;
          used.add(t.value);
        }
        if (odd || used.size !== m.params.length) continue;
        // the body must be an expression mentioning something besides one call target
        if (m.body.length < 3) continue;
        api.report(at(m), M(`Function-like macro ${m.name}(${m.params.join(', ')}) could be an inline function.`, `함수형 매크로 ${m.name}(${m.params.join(', ')}) 는 인라인 함수로 바꿀 수 있습니다.`));
      }
    },
  }),

  rule('PRE01-C', {
    risk: 'MPL', cwe: ['CWE-783'],
    name: ['Use parentheses within macros around parameter names', '매크로 안의 매개변수 이름을 괄호로 감싸세요'],
    why: ['An unparenthesised parameter binds to neighbouring operators after substitution: MUL(a + 1, b) becomes a + 1 * b.', '괄호 없는 매개변수는 치환 뒤 주변 연산자와 결합합니다: MUL(a + 1, b) 는 a + 1 * b 가 됩니다.'],
    fix: ['Write every use of a parameter as (x) in the replacement list.', '치환 목록에서 매개변수를 모두 (x) 로 쓰세요.'],
  }, {
    check(unit, api) {
      for (const m of userMacros(unit)) {
        if (m.kind !== 'function' || !m.params.length || m.body.length < 2) continue;
        for (let i = 0; i < m.body.length; i++) {
          const t = m.body[i];
          if (t.kind !== 'identifier' || !m.params.includes(t.value)) continue;
          const prev = tv(m.body[i - 1]), next = tv(m.body[i + 1]);
          if (prev === '#' || prev === '##' || next === '##') continue;
          if (prev === '.' || prev === '->' || prev === '::') continue;
          if ((prev === '(' || prev === ',' || prev === undefined) && (next === ')' || next === ',' || next === undefined)) continue;
          if (prev === '[' && next === ']') continue;
          if ((prev === '=' && (next === ';' || next === undefined || next === ')')) || prev === 'return') continue;
          // used as a type / declarator name: `x y` or `T *`
          const nt = m.body[i + 1];
          if (nt && nt.kind === 'identifier') continue;
          if (m.body[i - 1] && (m.body[i - 1].kind === 'identifier' || m.body[i - 1].kind === 'keyword') && !BIN_OPS.has(prev)) continue;
          // only an issue when an operator touches the parameter
          if (!(BIN_OPS.has(prev) || BIN_OPS.has(next) || prev === '!' || prev === '~' || prev === '*' || prev === '&' || next === '[' || next === '.' || next === '->' || next === '++' || next === '--')) continue;
          api.report(at(m), M(`Parameter '${t.value}' of macro ${m.name}() is not parenthesized in the replacement list.`, `매크로 ${m.name}() 의 매개변수 '${t.value}' 가 치환 목록에서 괄호로 감싸져 있지 않습니다.`));
          break;
        }
      }
    },
  }),

  rule('PRE02-C', {
    risk: 'MPL', cwe: ['CWE-783'],
    name: ['Macro replacement lists should be parenthesized', '매크로 치환 목록을 괄호로 감싸세요'],
    why: ['An expression macro without outer parentheses changes meaning next to other operators: #define SUM a + b gives SUM * 2 == a + b * 2.', '바깥 괄호가 없는 식 매크로는 다른 연산자 옆에서 의미가 바뀝니다: #define SUM a + b 이면 SUM * 2 는 a + b * 2 입니다.'],
    fix: ['Enclose the whole replacement list in parentheses.', '치환 목록 전체를 괄호로 감싸세요.'],
  }, {
    check(unit, api) {
      for (const m of userMacros(unit)) {
        const b = m.body;
        if (b.length < 3) continue;
        if (b.some((t) => STMT_TOKENS.has(t.value) || t.value === '=' )) continue;
        if (b.some((t) => t.kind === 'keyword' && TYPE_KW.has(t.value))) continue;
        // fully parenthesized?
        let depth = 0, top = null, wrapped = b[0].value === '(';
        for (let i = 0; i < b.length; i++) {
          const v = b[i].value;
          if (v === '(' || v === '[') depth++;
          else if (v === ')' || v === ']') { depth--; if (depth === 0 && i < b.length - 1) wrapped = false; }
          else if (depth === 0 && b[i].kind === 'punct' && BIN_OPS.has(v) && i > 0 && isOperand(b[i - 1]) && isOperandStart(b[i + 1])) { if (!top) top = v; }
        }
        if (wrapped || !top) continue;
        api.report(at(m), M(`Replacement list of macro ${m.name} contains operator '${top}' and is not enclosed in parentheses.`, `매크로 ${m.name} 의 치환 목록에 연산자 '${top}' 가 있지만 괄호로 감싸져 있지 않습니다.`));
      }
    },
  }),
];
