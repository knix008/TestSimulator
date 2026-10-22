'use strict';

// MISRA C++:2023 chapter 4 — general principles.

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const { cf } = U;

const DEPRECATED_NAMES = new Map([
  ['random_shuffle', 'std::shuffle'], ['bind1st', 'std::bind or a lambda'], ['bind2nd', 'std::bind or a lambda'],
  ['ptr_fun', 'a lambda'], ['mem_fun', 'std::mem_fn'], ['mem_fun_ref', 'std::mem_fn'], ['unary_function', 'nothing (define the typedefs yourself)'],
  ['binary_function', 'nothing (define the typedefs yourself)'], ['uncaught_exception', 'std::uncaught_exceptions'],
  ['wstring_convert', 'a dedicated conversion library'], ['wbuffer_convert', 'a dedicated conversion library'],
  ['not1', 'std::not_fn'], ['not2', 'std::not_fn'], ['get_temporary_buffer', 'std::allocator'], ['return_temporary_buffer', 'std::allocator'],
  ['raw_storage_iterator', 'std::uninitialized_copy'], ['is_literal_type', 'a concrete trait'], ['result_of', 'std::invoke_result'],
]);
const REMOVED_NAMES = new Map([['auto_ptr', 'std::unique_ptr']]);
const DEPRECATED_HEADERS = new Set(['ccomplex', 'cstdalign', 'cstdbool', 'ctgmath', 'strstream', 'codecvt']);

function nameOfRef(n) {
  if (n.type === 'NamedType') return { name: n.name, q: n.qualifier };
  if (n.type === 'Identifier') return { name: n.name, q: n.qualifier };
  return null;
}

// Unsequenced side effects ------------------------------------------------

function acc(e, out, report) {
  // returns Map<sym, { r: node|null, w: node|null }>
  const m = new Map();
  if (!e || typeof e !== 'object') return m;
  const add = (sym, kind, node) => {
    let x = m.get(sym);
    if (!x) m.set(sym, (x = { r: null, w: null }));
    if (!x[kind]) x[kind] = node;
  };
  const merge = (into, from) => {
    for (const [s, v] of from) {
      let x = into.get(s);
      if (!x) into.set(s, (x = { r: null, w: null }));
      if (!x.r && v.r) x.r = v.r;
      if (!x.w && v.w) x.w = v.w;
    }
  };
  const conflict = (parts) => {
    for (let i = 0; i < parts.length; i++) {
      for (let j = 0; j < parts.length; j++) {
        if (i === j) continue;
        for (const [s, a] of parts[i]) {
          const b = parts[j].get(s);
          if (a.w && b && (b.r || b.w) && (i < j || !b.w)) report(a.w, s);
        }
      }
    }
  };
  switch (e.type) {
    case 'Identifier':
      if (e.symbol && (e.symbol.kind === 'variable' || e.symbol.kind === 'parameter')) add(e.symbol, 'r', e);
      return m;
    case 'ParenExpr': return acc(e.expr, out, report);
    case 'LambdaExpr': case 'SizeofExpr': case 'AlignofExpr': case 'TypeidExpr': case 'NoexceptExpr': return m;
    case 'AssignExpr': {
      const L = U.strip(e.left);
      const right = acc(e.right, out, report);
      const left = new Map();
      if (L && L.type === 'Identifier' && L.symbol) {
        left.set(L.symbol, { r: e.op !== '=' ? L : null, w: e });
      } else merge(left, acc(e.left, out, report));
      merge(m, right); merge(m, left);
      return m;
    }
    case 'UnaryExpr': {
      const a = U.strip(e.arg);
      if ((e.op === '++' || e.op === '--') && a && a.type === 'Identifier' && a.symbol) {
        add(a.symbol, 'r', a); add(a.symbol, 'w', e);
        return m;
      }
      return acc(e.arg, out, report);
    }
    case 'BinaryExpr': {
      const l = acc(e.left, out, report);
      const r = acc(e.right, out, report);
      if (!['&&', '||', ',', '<<', '>>'].includes(e.op)) conflict([l, r]);
      merge(m, l); merge(m, r);
      return m;
    }
    case 'ConditionalExpr': {
      merge(m, acc(e.test, out, report));
      merge(m, acc(e.consequent, out, report));
      merge(m, acc(e.alternate, out, report));
      return m;
    }
    case 'CallExpr': {
      const parts = [acc(e.callee, out, report), ...(e.args || []).map((a) => acc(a, out, report))];
      conflict(parts);
      for (const p of parts) merge(m, p);
      return m;
    }
    default: {
      for (const c of cf.childrenOf(e)) merge(m, acc(c, out, report));
      return m;
    }
  }
}

function fullExprs(unit) {
  const x = U.ix(unit);
  const out = [];
  for (const s of x.get('ExprStmt')) if (s.expr) out.push(s.expr);
  for (const v of x.get('VarDecl')) if (v.init) out.push(v.init);
  for (const r of x.get('ReturnStmt')) if (r.arg) out.push(r.arg);
  for (const s of x.get('IfStmt', 'WhileStmt', 'DoStmt', 'SwitchStmt')) if (s.cond && s.cond.type !== 'Declaration') out.push(s.cond);
  for (const s of x.get('ForStmt')) { if (s.cond && s.cond.type !== 'Declaration') out.push(s.cond); if (s.inc) out.push(s.inc); }
  return out;
}

module.exports = [
  R({
    id: '4.1.1', cat: 'Required', dec: false, autosar: 'A1-1-1', sev: 'MAJOR', debt: 15,
    name: ['A program shall conform to ISO/IEC 14882:2017 (C++17)', '프로그램은 ISO/IEC 14882:2017 (C++17) 을 따라야 합니다'],
    why: ['Language extensions, later-standard features and ill-formed code make behaviour depend on one compiler.', '언어 확장, 이후 표준의 기능, 잘못된 코드는 동작을 특정 컴파일러에 묶어 버립니다.'],
    fix: ['Rewrite the construct with standard C++17 features.', '표준 C++17 기능으로 다시 작성하세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      const rep = (n, what, ko) => api.report(n, M(`${what} is not part of standard C++17.`, `${ko} 은(는) 표준 C++17 에 없습니다.`));
      const lines = new Set();
      for (const d of unit.diagnostics) {
        if (d.code !== 'parse-error' || U.isBuiltin(d.file) || lines.has(`${d.file}:${d.line}`)) continue;
        lines.add(`${d.file}:${d.line}`);
        api.report({ file: d.file, line: d.line, col: d.col }, M(`The code does not parse as C++: ${d.message}.`, `코드가 C++ 로 해석되지 않습니다: ${d.message}.`));
      }
      for (const n of x.get('ConceptDecl')) rep(n, 'A concept (C++20)', 'concept (C++20)');
      for (const n of x.get('RequiresExpr')) rep(n, 'A requires-expression (C++20)', 'requires 식 (C++20)');
      for (const n of x.get('TemplateDecl')) if (n.requires) rep(n, 'A requires-clause (C++20)', 'requires 절 (C++20)');
      for (const n of x.get('BinaryExpr')) if (n.op === '<=>') rep(n, 'The three-way comparison operator (C++20)', '3방향 비교 연산자 (C++20)');
      for (const n of x.get('UnaryExpr')) if (n.op === 'co_await' || n.op === 'co_yield') rep(n, `'${n.op}' (C++20)`, `'${n.op}' (C++20)`);
      for (const n of x.get('ReturnStmt')) if (n.coroutine) rep(n, `'co_return' (C++20)`, `'co_return' (C++20)`);
      for (const n of x.get('DesignatedInit')) rep(n, 'A designated initializer (C++20)', '지정 초기화자 (C++20)');
      for (const n of x.get('ModuleDecl')) rep(n, 'A module declaration (C++20)', '모듈 선언 (C++20)');
      for (const n of x.get('IfStmt')) if (n.consteval) rep(n, `'if consteval' (C++23)`, `'if consteval' (C++23)`);
      for (const n of x.get('RangeForStmt')) if (n.init) rep(n, 'A range-for init-statement (C++20)', 'range-for 초기화 문 (C++20)');
      for (const n of x.get('UsingDecl')) if (n.isEnum) rep(n, `'using enum' (C++20)`, `'using enum' (C++20)`);
      for (const n of x.get('LambdaExpr')) if (n.templateParams) rep(n, 'A lambda template parameter list (C++20)', '람다 템플릿 매개변수 목록 (C++20)');
      for (const n of x.get('DeclSpec')) {
        for (const s of ['consteval', 'constinit']) if (n.functionSpecs.includes(s)) rep(n, `'${s}' (C++20)`, `'${s}' (C++20)`);
        if (n.storage.includes('register')) rep(n, `The 'register' storage class (removed in C++17)`, `'register' 저장 클래스 (C++17 에서 제거)`);
      }
      for (const n of x.get('BuiltinType')) {
        if (n.names.includes('char8_t')) rep(n, `'char8_t' (C++20)`, `'char8_t' (C++20)`);
        if (n.names.some((s) => s.includes('__int128'))) rep(n, `'__int128' (GNU extension)`, `'__int128' (GNU 확장)`);
      }
      for (const n of x.get('StmtExpr')) rep(n, 'A statement expression (GNU extension)', '문장 식 (GNU 확장)');
      for (const n of x.get('TypeofType')) rep(n, `'typeof' (GNU extension)`, `'typeof' (GNU 확장)`);
      for (const n of x.get('ConditionalExpr')) if (n.gnuElvis) rep(n, `The 'a ?: b' operator (GNU extension)`, `'a ?: b' 연산자 (GNU 확장)`);
      for (const n of x.get('CaseStmt')) if (n.high) rep(n, 'A case range (GNU extension)', 'case 범위 (GNU 확장)');
      for (const n of x.get('GotoStmt')) if (n.computed) rep(n, 'A computed goto (GNU extension)', '계산된 goto (GNU 확장)');
      for (const n of x.get('AddrLabelExpr')) rep(n, 'The address of a label (GNU extension)', '레이블의 주소 (GNU 확장)');
      for (const n of x.get('Attribute')) if (n.syntax === 'gnu' || n.syntax === 'declspec') rep(n, `The attribute '${n.name}' (compiler extension)`, `속성 '${n.name}' (컴파일러 확장)`);
      for (const n of x.get('VarDecl')) if (n.ctype && U.canon(n.ctype).kind === 'array' && U.canon(n.ctype).vla) rep(n, `The variable-length array '${n.name}'`, `가변 길이 배열 '${n.name}'`);
      for (const n of x.get('UnaryExpr')) if ((n.op === '++' || n.op === '--') && n.arg && U.numCat(n.arg.ctype, unit.target) === 'bool') rep(n, `'${n.op}' on a bool (removed in C++17)`, `bool 에 대한 '${n.op}' (C++17 에서 제거)`);
      for (const n of x.get('FunctionDeclarator')) if (n.throwSpec) rep(n, `The dynamic exception specification 'throw(${n.throwSpec})' (removed in C++17)`, `동적 예외 명세 'throw(${n.throwSpec})' (C++17 에서 제거)`);
      for (const n of x.get('NamedType', 'Identifier')) {
        const r = nameOfRef(n);
        if (r && r.q === 'std' && REMOVED_NAMES.has(r.name)) rep(n, `'std::${r.name}' (removed in C++17; use ${REMOVED_NAMES.get(r.name)})`, `'std::${r.name}' (C++17 에서 제거, ${REMOVED_NAMES.get(r.name)} 사용)`);
      }
    },
  }),
  R({
    id: '4.1.2', cat: 'Advisory', dec: true, autosar: 'A1-1-1', sev: 'MINOR', debt: 10,
    name: ['Deprecated features should not be used', '폐기 예정(deprecated) 기능은 쓰지 않아야 합니다'],
    why: ['Deprecated features may be removed by the next standard and often have safer replacements.', '폐기 예정 기능은 다음 표준에서 사라질 수 있고 대개 더 안전한 대안이 있습니다.'],
    fix: ['Use the modern replacement named in the message.', '메시지에 적힌 현대적인 대안을 쓰세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      for (const n of x.get('FunctionDeclarator')) if (n.throwSpec === '') api.report(n, M(`'throw()' is deprecated; use 'noexcept'.`, `'throw()' 는 폐기 예정입니다. 'noexcept' 를 쓰세요.`));
      for (const n of x.get('NamedType', 'Identifier')) {
        const r = nameOfRef(n);
        if (r && r.q === 'std' && DEPRECATED_NAMES.has(r.name)) api.report(n, M(`'std::${r.name}' is deprecated; use ${DEPRECATED_NAMES.get(r.name)}.`, `'std::${r.name}' 는 폐기 예정입니다. ${DEPRECATED_NAMES.get(r.name)} 를 쓰세요.`));
      }
      for (const inc of unit.includes) {
        if (U.isBuiltin(inc.file)) continue;
        if (DEPRECATED_HEADERS.has(inc.name)) api.report(inc, M(`The header <${inc.name}> is deprecated.`, `헤더 <${inc.name}> 는 폐기 예정입니다.`));
      }
      // out-of-class redefinition of a static constexpr data member
      for (const v of x.get('VarDecl')) {
        if (!v.qualifier || v.init) continue;
        const s = v.symbol;
        if (s && s.member && s.isConstexpr) api.report(v, M(`Redeclaring the static constexpr member '${v.name}' outside its class is deprecated.`, `static constexpr 멤버 '${v.name}' 를 클래스 밖에서 다시 선언하는 것은 폐기 예정입니다.`));
      }
    },
  }),
  R({
    id: '4.1.3', cat: 'Required', dec: false, type: 'BUG', autosar: 'A0-4-4', cwe: 'CWE-758', sev: 'CRITICAL', debt: 20,
    name: ['There shall be no occurrence of undefined or critical unspecified behaviour', '정의되지 않은 동작이나 심각한 미지정 동작이 있으면 안 됩니다'],
    why: ['Undefined behaviour lets the compiler do anything, including silently removing safety checks.', '정의되지 않은 동작은 컴파일러가 무엇이든 하게 만들며 안전 검사를 조용히 지울 수도 있습니다.'],
    fix: ['Change the expression so that it is well defined for every input.', '모든 입력에 대해 잘 정의되도록 식을 고치세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      for (const b of x.get('BinaryExpr')) {
        if (b.op === '/' || b.op === '%') {
          const r = U.constInt(b.right, unit);
          if (r && r.value === 0n && U.numCat(b.right.ctype, unit.target) !== 'float') { api.report(b, M(`Integer division by zero in '${cf.sourceText(unit, b)}'.`, `'${cf.sourceText(unit, b)}' 에서 정수를 0 으로 나눕니다.`)); continue; }
        }
        if (b.op === '<<' || b.op === '>>') {
          const r = U.constInt(b.right, unit);
          const lt = b.left && b.left.ctype ? U.T.integerPromote(U.nonRef(b.left.ctype), unit.target) : null;
          const bits = lt && U.T.isInteger(lt) ? U.T.intBits(lt, unit.target) : null;
          if (r && bits && (r.value < 0n || r.value >= BigInt(bits))) { api.report(b, M(`Shift by ${r.value} is out of range for a ${bits}-bit operand.`, `${bits}비트 피연산자를 ${r.value} 만큼 시프트하는 것은 범위를 벗어납니다.`)); continue; }
        }
        const p = U.upParens(b).p;
        const c = U.constInt(b, unit);
        if (c && c.overflow && !(p && p.type === 'BinaryExpr' && U.constInt(p, unit) && U.constInt(p, unit).overflow)) {
          api.report(b, M(`Signed overflow in the constant expression '${cf.sourceText(unit, b)}'.`, `상수식 '${cf.sourceText(unit, b)}' 에서 부호 있는 오버플로가 일어납니다.`));
        }
      }
      for (const u of x.get('UnaryExpr')) {
        if (u.op === '*') {
          const a = U.strip(u.arg);
          if (a && (a.type === 'NullptrLiteral' || (a.type === 'CastExpr' && a.arg && U.strip(a.arg).type === 'NullptrLiteral'))) api.report(u, M('A null pointer is dereferenced.', '널 포인터를 역참조합니다.'));
        }
      }
    },
  }),
  R({
    id: '4.6.1', cat: 'Required', dec: false, type: 'BUG', autosar: 'A5-0-1', cwe: 'CWE-758', sev: 'MAJOR', debt: 10,
    name: ['Operations on a memory location shall be sequenced appropriately', '같은 메모리 위치에 대한 연산은 순서가 정해져 있어야 합니다'],
    why: ['Modifying an object and accessing it again without a sequence point between gives undefined or unspecified results.', '순서가 정해지지 않은 채 객체를 수정하고 다시 접근하면 결과가 정의되지 않거나 미지정입니다.'],
    fix: ['Split the expression so that each object is modified at most once and not read elsewhere in it.', '식을 나누어 각 객체를 한 번만 수정하고 같은 식의 다른 곳에서 읽지 않게 하세요.'],
    check(unit, api) {
      for (const e of fullExprs(unit)) {
        acc(e, null, (node, sym) => api.report(node, M(`'${sym.name}' is modified and accessed again without sequencing.`, `'${sym.name}' 를 순서 없이 수정하고 다시 접근합니다.`)));
      }
    },
  }),
];
