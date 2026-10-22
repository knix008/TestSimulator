'use strict';

// MISRA C:2012 / 2023 chapter 1: the implementation and the language.

const U = require('../lib/a-util');
const { cf, T, meta, msg } = U;

// ------------------------------------------------------------------ 1.1

// C99 minimum translation limits (5.2.4.1); override with options.misra.limits
const LIMITS = {
  blockNesting: 127, conditionalNesting: 63, declaratorModifiers: 12, parenNesting: 63, externalIds: 4095,
  blockIds: 511, macros: 4095, params: 127, args: 127, macroParams: 127, macroArgs: 127, lineLength: 4095,
  stringLength: 4095, objectSize: 65535, includeDepth: 15, caseLabels: 1023, members: 1023, enumConstants: 1023,
};
const LIMIT_TEXT = {
  blockNesting: ['nesting levels of blocks', '블록 중첩 단계'],
  conditionalNesting: ['nesting levels of conditional inclusion', '조건부 포함 중첩 단계'],
  declaratorModifiers: ['pointer, array and function declarators on one declaration', '한 선언의 포인터·배열·함수 선언자'],
  parenNesting: ['nested parenthesized expressions', '중첩된 괄호 식'],
  externalIds: ['external identifiers in one translation unit', '한 번역 단위의 외부 식별자'],
  blockIds: ['identifiers declared in one block', '한 블록에 선언된 식별자'],
  macros: ['macro identifiers defined at once', '동시에 정의된 매크로 식별자'],
  params: ['parameters in one function definition', '한 함수 정의의 매개변수'],
  args: ['arguments in one function call', '한 함수 호출의 인수'],
  macroParams: ['parameters in one macro definition', '한 매크로 정의의 매개변수'],
  macroArgs: ['arguments in one macro invocation', '한 매크로 호출의 인수'],
  lineLength: ['characters in a logical source line', '논리 소스 줄의 문자'],
  stringLength: ['characters in a string literal', '문자열 리터럴의 문자'],
  objectSize: ['bytes in an object', '객체의 바이트'],
  includeDepth: ['nesting levels of #include', '#include 중첩 단계'],
  caseLabels: ['case labels in one switch', '한 switch의 case 레이블'],
  members: ['members of one structure or union', '한 구조체·공용체의 멤버'],
  enumConstants: ['enumeration constants in one enumeration', '한 열거형의 열거 상수'],
};
const CONSTRAINT_CODES = new Set(['redefinition', 'conflicting-types', 'linkage-conflict', 'typedef-redefinition', 'duplicate-label',
  'undeclared-label', 'no-member', 'static-assert-failed', 'array-size-negative', 'integer-literal-too-large', 'enum-value-not-constant', 'redeclaration']);

function r11(unit, api) {
  const lim = { ...LIMITS, ...(U.misraOpts(api).limits || {}) };
  const over = (where, key, n) => {
    const [en, ko] = LIMIT_TEXT[key];
    api.report(where, msg(`Translation limit exceeded: ${n} ${en} (the guaranteed minimum is ${lim[key]}).`, `번역 한계 초과: ${ko} ${n}개(보장되는 최소값 ${lim[key]}).`));
  };
  for (const d of unit.diagnostics || []) {
    if (!CONSTRAINT_CODES.has(d.code) || U.isBuiltin(d.file)) continue;
    api.report(d, msg(`Constraint violation: ${d.message}`, `제약 위반: ${d.message}`));
  }
  // nesting of blocks and parentheses
  const ix = U.index(unit);
  cf.walk(unit.ast, {
    enter(n) {
      if (n.loc && U.isBuiltin(n.loc.file)) return cf.walk.SKIP;
      if (n.type === 'CompoundStmt') {
        let d = 0;
        for (let p = n; p; p = cf.parentOf(p)) if (p.type === 'CompoundStmt') d++;
        if (d > lim.blockNesting && !cf.findFirst(n, 'CompoundStmt', { skipRoot: true })) over(n, 'blockNesting', d);
        let ids = 0;
        for (const st of n.body) if (st.type === 'Declaration') ids += st.declarators.length;
        if (ids > lim.blockIds) over(n, 'blockIds', ids);
      }
      if (n.type === 'ParenExpr' && n.expr && n.expr.type !== 'ParenExpr') {
        let d = 0;
        for (let p = n; p; p = cf.parentOf(p)) if (p.type === 'ParenExpr') d++;
        if (d > lim.parenNesting) over(n, 'parenNesting', d);
      }
      return undefined;
    },
  });
  void ix;
  for (const n of U.nodes(unit, 'VarDecl', 'FunctionDecl', 'FieldDecl', 'ParamDecl', 'TypedefDecl')) {
    let k = 0;
    for (let d = n.declarator; d; d = d.inner) if (d.type === 'PointerDeclarator' || d.type === 'ArrayDeclarator' || d.type === 'FunctionDeclarator') k++;
    if (k > lim.declaratorModifiers) over(n.nameLoc || n, 'declaratorModifiers', k);
    if (n.type === 'VarDecl' && n.symbol && n.symbol.storage !== 'none') {
      const sz = T.sizeOf(n.ctype, unit.target);
      if (sz != null && sz > lim.objectSize) over(n.nameLoc || n, 'objectSize', sz);
    }
  }
  for (const fn of U.nodes(unit, 'FunctionDecl')) if (fn.body && (fn.params || []).length > lim.params) over(fn.nameLoc || fn, 'params', fn.params.length);
  for (const c of U.nodes(unit, 'CallExpr')) if (c.args.length > lim.args) over(c, 'args', c.args.length);
  for (const s of U.nodes(unit, 'StringLiteral')) if (s.length - 1 > lim.stringLength) over(s, 'stringLength', s.length - 1);
  for (const sw of U.nodes(unit, 'SwitchStmt')) {
    const n = cf.findAll(sw.body, 'CaseStmt').filter((c) => cf.enclosing(c, 'SwitchStmt') === sw).length;
    if (n > lim.caseLabels) over(sw, 'caseLabels', n);
  }
  for (const r of U.nodes(unit, 'RecordDecl')) {
    if (!r.members) continue;
    let n = 0;
    for (const m of r.members) n += m.type === 'Declaration' ? Math.max(1, m.declarators.length) : 0;
    if (n > lim.members) over(r, 'members', n);
  }
  for (const e of U.nodes(unit, 'EnumDecl')) if (e.enumerators && e.enumerators.length > lim.enumConstants) over(e, 'enumConstants', e.enumerators.length);
  const exts = (unit.externals || []).filter((s) => U.isUserSym(s)).length;
  if (exts > lim.externalIds) over({ file: unit.file, line: 1, col: 1 }, 'externalIds', exts);
  const live = unit.macroTable ? [...unit.macroTable.values()].filter((m) => !m.predefined && !m.builtin).length : 0;
  if (live > lim.macros) over({ file: unit.file, line: 1, col: 1 }, 'macros', live);
  for (const m of unit.macros || []) if (!U.isBuiltin(m.file) && (m.params || []).length > lim.macroParams) over(m, 'macroParams', m.params.length);
  for (const e of unit.expansions || []) if (!U.isBuiltin(e.file) && e.args && e.args.length > lim.macroArgs) over(e, 'macroArgs', e.args.length);
  for (const inc of unit.includes || []) if (!U.isBuiltin(inc.file) && inc.depth > lim.includeDepth) over(inc, 'includeDepth', inc.depth);
  // conditional nesting and line length per user file
  for (const [file, src] of U.userSources(unit)) {
    if (!U.firstScan(api, '1.1', file)) continue;
    let depth = 0;
    for (const d of unit.directives || []) {
      if (d.file !== file) continue;
      if (d.kind === 'if' || d.kind === 'ifdef' || d.kind === 'ifndef') { depth++; if (depth > lim.conditionalNesting) over(d, 'conditionalNesting', depth); }
      else if (d.kind === 'endif') depth = Math.max(0, depth - 1);
    }
    const text = src.text || '';
    const logical = text.replace(/\\\r?\n/g, '').split(/\r?\n/);
    if (logical.some((l) => l.length > lim.lineLength)) {
      let line = 1;
      for (const raw of text.split(/\n/)) {
        if (raw.length > lim.lineLength) { over({ file, line, col: 1 }, 'lineLength', raw.length); break; }
        line++;
      }
    }
  }
}

// ------------------------------------------------------------------ 1.2

const EXT_WORDS = new Set(['__attribute__', '__attribute', '__asm__', '__asm', 'asm', '__typeof__', '__typeof', '__extension__',
  '__inline__', '__inline', '__restrict', '__restrict__', '__volatile__', '__const', '__const__', '__signed__', '__signed', '__label__',
  '__int128', '__int128_t', '__uint128_t', '__declspec', '__cdecl', '__stdcall', '__fastcall', '__thiscall', '__vectorcall',
  '__alignof__', '__alignof', '__real__', '__imag__', '__auto_type', '__thread', '__complex__', '__based', '__ptr32', '__ptr64', '__forceinline']);

function r12(unit, api) {
  const c23 = /c2[3x]/.test(unit.std || '');
  const seen = new Set();
  const rep = (where, what, ko) => {
    const k = `${where.file || (where.loc && where.loc.file)}:${where.line || (where.loc && where.loc.line)}:${what}`;
    if (seen.has(k)) return;
    seen.add(k);
    api.report(where, msg(`Language extension used: ${what}.`, `언어 확장을 사용합니다: ${ko || what}.`));
  };
  for (const t of unit.tokens || []) {
    if (U.isBuiltin(t.file)) continue;
    if (t.fromMacro && t.spelling && U.isBuiltin(t.spelling.file)) continue;
    const v = t.value;
    if (t.kind !== 'identifier' && t.kind !== 'keyword') continue;
    const loc = t.site || t;
    if (EXT_WORDS.has(v) || (v === 'typeof' && !c23)) rep(loc, `'${v}'`);
    else if (v.startsWith('__builtin_') && !(t.fromMacro && t.spelling && U.isBuiltin(t.spelling.file))) rep(loc, `compiler built-in '${v}'`, `컴파일러 내장 '${v}'`);
  }
  const ast = [
    ['StmtExpr', () => true, ['statement expression ({ ... })', '문 식 ({ ... })']],
    ['CaseStmt', (n) => !!n.high, ['case range (case a ... b)', 'case 범위(case a ... b)']],
    ['ConditionalExpr', (n) => n.gnuElvis, ["conditional with omitted operand ('a ?: b')", "피연산자를 생략한 조건식('a ?: b')"]],
    ['GotoStmt', (n) => n.computed, ['computed goto', '계산된 goto']],
    ['AddrLabelExpr', () => true, ["address of a label ('&&label')", "레이블 주소('&&label')"]],
    ['Designator', (n) => !!n.high, ['designator range ([a ... b])', '지정자 범위([a ... b])']],
    ['ArrayDeclarator', (n) => n.size && U.iceValue(unit, n.size) === 0n, ['zero-length array', '길이 0 배열']],
    ['RecordDecl', (n) => n.isDefinition && n.members && n.members.length === 0, ['structure or union without members', '멤버 없는 구조체/공용체']],
    ['FunctionDecl', (n) => n.body && cf.enclosing(n, 'FunctionDecl'), ['nested function definition', '중첩 함수 정의']],
  ];
  for (const [type, pred, [en, ko]] of ast) for (const n of U.nodes(unit, type)) if (pred(n)) rep(n.loc, en, ko);
  for (const [file, src] of U.userSources(unit)) {
    if (!U.firstScan(api, '1.2', file)) continue;
    const li = U.lineInfo(unit);
    for (const t of src.tokens || []) {
      if (li.skipped(file, t.line)) continue;
      if (t.kind === 'number' && !c23 && /^0[bB]/.test(t.value)) rep(t, `binary constant '${t.value}'`, `2진 상수 '${t.value}'`);
      if (t.kind === 'identifier' && t.value.includes('$')) rep(t, `'$' in identifier '${t.value}'`, `식별자 '${t.value}'의 '$'`);
    }
  }
}

// ------------------------------------------------------------------ 1.3

function r13(unit, api) {
  const say = (n, en, ko) => api.report(n, msg(`Undefined behaviour: ${en}.`, `미정의 동작: ${ko}.`));
  for (const b of U.nodes(unit, 'BinaryExpr', 'AssignExpr')) {
    const op = b.type === 'AssignExpr' ? b.op.slice(0, -1) : b.op;
    const L = b.left, R = b.right;
    if (!R) continue;
    if ((op === '/' || op === '%') && T.isInteger(U.canon(R.ctype) || T.T.double) && U.iceValue(unit, R) === 0n) {
      say(b, `integer division by zero in '${U.code(unit, b)}'`, `'${U.code(unit, b)}'에서 정수를 0으로 나눕니다`);
      continue;
    }
    if (op === '<<' || op === '>>') {
      const v = U.iceValue(unit, R);
      if (v == null) continue;
      const lt = U.canon(L && L.ctype);
      if (!lt || !T.isInteger(lt)) continue;
      let pt = lt;
      try { pt = T.integerPromote(lt, unit.target); } catch (_) { /* keep */ }
      const w = T.intBits(pt, unit.target);
      if (v < 0n || (w && v >= BigInt(w))) say(b, `shift by ${v} in '${U.code(unit, b)}' is outside 0..${w - 1} for '${U.typeStr(pt)}'`, `'${U.code(unit, b)}'의 시프트 크기 ${v}가 '${U.typeStr(pt)}'의 0..${w - 1}을 벗어납니다`);
      continue;
    }
    if (b.type === 'BinaryExpr' && (op === '+' || op === '-' || op === '*' || op === '<<')) {
      const v = U.constOf(unit, b);
      if (!v || !v.overflow) continue;
      const lv = U.constOf(unit, L), rv = U.constOf(unit, R);
      if ((lv && lv.overflow) || (rv && rv.overflow)) continue;
      say(b, `signed overflow in constant expression '${U.code(unit, b)}'`, `상수 식 '${U.code(unit, b)}'에서 부호 있는 오버플로가 일어납니다`);
    }
  }
  for (const d of unit.diagnostics || []) {
    if (d.code !== 'pp-defined-from-macro' || U.isBuiltin(d.file)) continue;
    say(d, "'defined' produced by macro expansion in #if", "#if에서 매크로 확장으로 'defined'가 생깁니다");
  }
}

// ------------------------------------------------------------------ 1.4

const ANNEX_K = new Set(['memcpy_s', 'memmove_s', 'memset_s', 'strcpy_s', 'strncpy_s', 'strcat_s', 'strncat_s', 'strtok_s', 'strerror_s',
  'strerrorlen_s', 'strnlen_s', 'sprintf_s', 'snprintf_s', 'vsprintf_s', 'vsnprintf_s', 'printf_s', 'fprintf_s', 'vprintf_s', 'vfprintf_s',
  'scanf_s', 'fscanf_s', 'sscanf_s', 'vscanf_s', 'vfscanf_s', 'vsscanf_s', 'gets_s', 'fopen_s', 'freopen_s', 'tmpfile_s', 'tmpnam_s',
  'getenv_s', 'qsort_s', 'bsearch_s', 'asctime_s', 'ctime_s', 'gmtime_s', 'localtime_s', 'wcscpy_s', 'wcsncpy_s', 'wcscat_s', 'wcsncat_s',
  'wmemcpy_s', 'wmemmove_s', 'wcstok_s', 'wcsnlen_s', 'mbstowcs_s', 'wcstombs_s', 'set_constraint_handler_s', 'abort_handler_s', 'ignore_handler_s']);
const C23_WORDS = new Set(['constexpr', 'nullptr', '_BitInt', 'typeof_unqual', '_Decimal32', '_Decimal64', '_Decimal128', 'nullptr_t']);
const C23_DIRECTIVES = new Set(['elifdef', 'elifndef', 'embed', 'warning']);

function r14(unit, api) {
  const say = (where, en, ko) => api.report(where, msg(`Emergent language feature used: ${en}.`, `새로 도입된 언어 기능을 사용합니다: ${ko}.`));
  for (const d of unit.directives || []) {
    if (U.isBuiltin(d.file) || !d.active) continue;
    if (d.kind === 'define' && d.macro === '__STDC_WANT_LIB_EXT1__') say(d, 'Annex K bounds-checking interfaces (__STDC_WANT_LIB_EXT1__)', 'Annex K 경계 검사 인터페이스(__STDC_WANT_LIB_EXT1__)');
    const w = d.name || d.kind;
    if (C23_DIRECTIVES.has(w) || C23_DIRECTIVES.has(d.kind)) say(d, `the #${w} directive`, `#${w} 지시문`);
  }
  for (const c of U.nodes(unit, 'CallExpr')) {
    const n = U.callName(c);
    if (n && ANNEX_K.has(n) && U.isLibraryCall(c)) say(c, `Annex K function '${n}'`, `Annex K 함수 '${n}'`);
  }
  for (const t of unit.tokens || []) {
    if (U.isBuiltin(t.file) || (t.fromMacro && t.spelling && U.isBuiltin(t.spelling.file))) continue;
    if ((t.kind === 'keyword' || t.kind === 'identifier') && C23_WORDS.has(t.value)) say(t.site || t, `C23 '${t.value}'`, `C23 '${t.value}'`);
  }
  for (const a of U.nodes(unit, 'Attribute')) if (a.syntax === 'cxx11') say(a, `C23 attribute '[[${a.namespace ? a.namespace + '::' : ''}${a.name}]]'`, `C23 속성 '[[${a.name}]]'`);
}

// ------------------------------------------------------------------ 1.5

const STORAGE = new Set(['static', 'extern', 'typedef', 'register', 'auto', '_Thread_local', 'thread_local']);
const BEFORE_STORAGE = new Set(['int', 'char', 'short', 'long', 'signed', 'unsigned', 'float', 'double', 'void', '_Bool', 'bool',
  'const', 'volatile', 'restrict', 'inline', '_Noreturn', '_Atomic', '_Complex', 'struct', 'union', 'enum']);

function r15(unit, api) {
  const say = (where, en, ko) => api.report(where, msg(`Obsolescent language feature used: ${en}.`, `폐지 예정 언어 기능을 사용합니다: ${ko}.`));
  for (const fd of U.nodes(unit, 'FunctionDeclarator')) {
    if (fd.noPrototype) say(fd, 'function declarator with empty parentheses', '빈 괄호 함수 선언자');
    else if (fd.krIdentifiers) say(fd, 'K&R (identifier list) function definition', 'K&R(식별자 목록) 함수 정의');
  }
  // storage-class specifier not at the start of the declaration specifiers
  const toks = (unit.tokens || []);
  for (let i = 1; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== 'keyword' || !STORAGE.has(t.value) || U.isBuiltin(t.file) || t.fromMacro) continue;
    const p = toks[i - 1];
    if (p.kind === 'keyword' && BEFORE_STORAGE.has(p.value) && p.line === t.line) {
      say(t, `storage-class specifier '${t.value}' placed after '${p.value}'`, `저장 클래스 지정자 '${t.value}'가 '${p.value}' 뒤에 있습니다`);
    }
  }
  for (const c of U.nodes(unit, 'CallExpr')) {
    const n = U.callName(c);
    if (!n || !U.isLibraryCall(c)) continue;
    if (n === 'gets') say(c, "'gets'", "'gets'");
    if (n === 'realloc' && c.args[1] && U.iceValue(unit, c.args[1]) === 0n) say(c, 'realloc with a size of zero', '크기 0의 realloc');
  }
  for (const e of unit.expansions || []) {
    if (U.isBuiltin(e.file) || e.nested) continue;
    if (e.name === 'ATOMIC_VAR_INIT') say(e, 'the ATOMIC_VAR_INIT macro', 'ATOMIC_VAR_INIT 매크로');
  }
  for (const d of unit.directives || []) {
    if (U.isBuiltin(d.file) || !d.active || (d.kind !== 'undef' && d.kind !== 'define')) continue;
    if (['bool', 'true', 'false'].includes(d.macro)) say(d, `#${d.kind} of the '${d.macro}' macro`, `'${d.macro}' 매크로의 #${d.kind}`);
  }
}

module.exports = [
  { meta: meta('1.1', { cat: 'R', type: 'BUG', sev: 'CRITICAL', debt: 10, dec: true, cwe: ['CWE-758'], name: ['Standard C syntax, constraints and translation limits', '표준 C 문법·제약·번역 한계 준수'],
    why: ['Code that breaks constraints or goes beyond the guaranteed translation limits may be rejected or mistranslated by a conforming compiler.', '제약을 어기거나 보장된 번역 한계를 넘는 코드는 표준 컴파일러가 거부하거나 잘못 번역할 수 있습니다.'],
    fix: ['Fix the constraint violation or restructure the code to stay within the limits.', '제약 위반을 고치거나 한계 안에 머물도록 코드를 재구성하세요.'] }), check: r11 },
  { meta: meta('1.2', { cat: 'A', sev: 'MINOR', debt: 10, dec: true, cert: 'MSC04-C', name: ['Language extensions should not be used', '언어 확장을 사용하지 않아야 함'],
    why: ['Compiler extensions are not portable and their exact behaviour may not be documented.', '컴파일러 확장은 이식성이 없고 정확한 동작이 문서화되지 않았을 수 있습니다.'],
    fix: ['Use standard C, or isolate and document the extension.', '표준 C를 쓰거나 확장을 격리해 문서화하세요.'] }), check: r12 },
  { meta: meta('1.3', { cat: 'R', type: 'BUG', sev: 'BLOCKER', debt: 15, dec: false, cwe: ['CWE-758', 'CWE-369'], cert: 'MSC15-C', name: ['No undefined or critical unspecified behaviour', '미정의·중대한 미지정 동작 금지'],
    why: ['Undefined behaviour lets the program do anything, including working in tests and failing in the field.', '미정의 동작이 있으면 시험에서는 되고 현장에서 실패하는 등 프로그램이 무엇이든 할 수 있습니다.'],
    fix: ['Rewrite the expression so that its behaviour is defined (check divisors, shift amounts and ranges).', '나눗수·시프트 크기·범위를 확인해 동작이 정의되도록 식을 고치세요.'] }), check: r13 },
  { meta: meta('1.4', { cat: 'R', sev: 'MAJOR', debt: 10, dec: true, name: ['Emergent language features shall not be used', '새로 도입된 언어 기능을 사용하지 않아야 함'],
    why: ['New features (Annex K, C23 additions) may be implemented inconsistently and lack usage experience.', '새 기능(Annex K, C23 추가 기능)은 구현이 일관되지 않고 사용 경험이 부족할 수 있습니다.'],
    fix: ['Use the established C99/C11 equivalents.', '자리 잡은 C99/C11 대체 수단을 쓰세요.'] }), check: r14 },
  { meta: meta('1.5', { cat: 'R', sev: 'MAJOR', debt: 5, dec: true, amendment: 'AMD3', cert: 'DCL20-C', name: ['Obsolescent language features shall not be used', '폐지 예정 언어 기능을 사용하지 않아야 함'],
    why: ['Obsolescent features may be removed from future standards and some are inherently unsafe (gets).', '폐지 예정 기능은 앞으로 표준에서 사라질 수 있고 일부(gets)는 본질적으로 위험합니다.'],
    fix: ['Use prototypes, put storage-class specifiers first, and replace removed library functions.', '원형을 쓰고, 저장 클래스 지정자를 맨 앞에 두고, 제거된 라이브러리 함수를 대체하세요.'] }), check: r15 },
];
