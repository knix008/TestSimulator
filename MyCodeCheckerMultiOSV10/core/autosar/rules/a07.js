'use strict';

// AUTOSAR C++14 chapter 7 — declarations (specifiers, constexpr/const,
// auto, typedef, enumerations, namespaces, asm, return values) and MISRA
// C++:2008 M7 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const flow = require('../../misra-cpp/lib/flow');
const { cf } = U;

const NON_TYPE = new Set(['typedef', 'friend', 'constexpr', 'consteval', 'constinit', 'register', 'static', 'extern', 'thread_local', 'mutable', 'inline', 'virtual', 'explicit']);
const TYPE_KW = new Set(['void', 'bool', 'char', 'wchar_t', 'char8_t', 'char16_t', 'char32_t', 'short', 'int', 'long', 'signed', 'unsigned', 'float', 'double', 'auto', 'decltype', 'struct', 'class', 'union', 'enum', 'typename']);

const scalarKind = (t) => { const c = t ? U.canon(t) : null; return c && (c.kind === 'int' || c.kind === 'float' || c.kind === 'enum' || c.kind === 'pointer') ? c : null; };
const isConstT = (t) => { const c = t ? U.canon(t) : null; return !!(c && c.const); };

// Locals that are initialised and never modified: [{ v, fn }]
function neverModified(unit) {
  return U.memo(unit, 'autosar.neverModified', () => {
    const out = [];
    for (const fn of flow.bodies(unit)) {
      const esc = flow.escaped(fn);
      cf.walk(fn.body, (n) => {
        if (n !== fn.body && (n.type === 'LambdaExpr' || n.type === 'RecordDecl')) return cf.walk.SKIP;
        if (n.type !== 'VarDecl' || !n.symbol || !n.init || n.symbol.storage !== 'automatic') return undefined;
        const c = scalarKind(n.ctype);
        if (!c || isConstT(n.ctype) || U.hasFnSpec(n, 'constexpr')) return undefined;
        const decl = U.parent(n);
        const owner = decl && U.parent(decl);
        if (owner && (owner.type === 'RangeForStmt' || owner.type === 'ForStmt' || owner.type === 'IfStmt' || owner.type === 'WhileStmt' || owner.type === 'SwitchStmt')) return undefined;
        if (esc.has(n.symbol)) return undefined;
        const uses = n.symbol.uses || [];
        if (uses.some((u) => u.type === 'Identifier' && U.writeKind(u))) return undefined;
        out.push({ v: n, fn });
        return undefined;
      });
    }
    return out;
  });
}

// Source spelled before the declarators of a declaration: raw tokens.
function specTokens(unit, decl) {
  const first = decl.declarators && decl.declarators[0];
  if (!first || !first.loc || first.loc.file !== decl.loc.file) return [];
  return U.tokensIn(unit, decl.loc.file, decl.loc.start, first.loc.start);
}

module.exports = [
  A({
    id: 'A7-1-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['constexpr or const specifiers shall be used for immutable data declarations', '바뀌지 않는 데이터 선언에는 constexpr 나 const 를 써야 합니다'],
    why: ['Marking unmodified objects const documents intent and lets the compiler catch accidental writes.', '바뀌지 않는 객체를 const 로 표시하면 의도가 드러나고 컴파일러가 실수로 쓰는 것을 잡아 줍니다.'],
    fix: ['Declare the object const or constexpr.', '객체를 const 나 constexpr 로 선언하세요.'],
    check(unit, api) {
      for (const { v } of neverModified(unit)) api.report(U.at(v), M(`'${v.name}' is never modified and should be const or constexpr.`, `'${v.name}' 은(는) 바뀌지 않으므로 const 나 constexpr 여야 합니다.`));
    },
  }),
  A({
    id: 'A7-1-2', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['The constexpr specifier shall be used for values that can be determined at compile time', '컴파일 시간에 정해지는 값에는 constexpr 를 써야 합니다'],
    why: ['constexpr guarantees compile-time evaluation and constant initialization, which const alone does not.', 'constexpr 는 컴파일 시간 평가와 상수 초기화를 보장하지만 const 만으로는 보장되지 않습니다.'],
    fix: ['Replace const with constexpr.', 'const 를 constexpr 로 바꾸세요.'],
    check(unit, api) {
      for (const v of U.ix(unit).get('VarDecl')) {
        if (!v.init || !isConstT(v.ctype) || U.hasFnSpec(v, 'constexpr') || U.hasStorage(v, 'extern')) continue;
        const c = U.canon(v.ctype);
        if (c.kind !== 'int' && c.kind !== 'float' && c.kind !== 'enum') continue;
        let init = v.init;
        if (init.type === 'InitList') { if (init.items.length !== 1) continue; init = init.items[0]; }
        if (init.type === 'ParenListInit') { if (init.args.length !== 1) continue; init = init.args[0]; }
        if (U.constAny(init, unit)) api.report(U.at(v), M(`'${v.name}' is initialized with a constant expression and should be constexpr.`, `'${v.name}' 은(는) 상수 식으로 초기화되므로 constexpr 여야 합니다.`));
      }
    },
  }),
  A({
    id: 'A7-1-3', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 1,
    name: ['CV-qualifiers shall be placed on the right hand side of a type that is a typedef or a using name', 'typedef 나 using 이름 형식에서는 cv 한정자를 형식의 오른쪽에 써야 합니다'],
    why: ['"const T" with T = int* reads like a pointer to const but is a const pointer; "T const" reads correctly.', 'T = int* 일 때 "const T" 는 const 를 가리키는 포인터처럼 읽히지만 실제로는 const 포인터이며, "T const" 는 바르게 읽힙니다.'],
    fix: ['Write the qualifier after the alias name: T const.', '한정자를 별칭 이름 뒤에 쓰세요: T const.'],
    check(unit, api) {
      const sites = [...U.ix(unit).get('Declaration'), ...U.ix(unit).get('ParamDecl')];
      for (const d of sites) {
        const sp = d.specs;
        const ts = sp && sp.typeSpec;
        if (!ts || ts.type !== 'NamedType' || !sp.qualifiers || !sp.qualifiers.some((q) => q === 'const' || q === 'volatile')) continue;
        const isAlias = (ts.symbol && ts.symbol.kind === 'typedef') || (ts.ctype && ts.ctype.kind === 'typedef');
        if (!isAlias || !ts.loc || !d.loc || ts.loc.file !== d.loc.file) continue;
        const before = U.tokensIn(unit, d.loc.file, d.loc.start, ts.loc.start);
        const q = before.find((t) => t.value === 'const' || t.value === 'volatile');
        if (q) api.report({ file: d.loc.file, line: q.line, col: q.col }, M(`'${q.value}' is written before the alias type '${ts.name}'.`, `'${q.value}' 를 별칭 형식 '${ts.name}' 앞에 썼습니다.`));
      }
    },
  }),
  A({
    id: 'A7-1-4', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 1,
    name: ['The register keyword shall not be used', 'register 키워드는 쓰면 안 됩니다'],
    why: ['register has no effect in modern C++ (it is removed in C++17).', 'register 는 현대 C++ 에서 효과가 없습니다(C++17 에서 제거되었습니다).'],
    fix: ['Remove the register keyword.', 'register 키워드를 지우세요.'],
    check(unit, api) {
      for (const { file, tokens } of U.rawTokenFiles(unit)) for (const t of tokens) if (t.kind === 'keyword' && t.value === 'register') api.report({ file, line: t.line, col: t.col }, M("The keyword 'register' is used.", "'register' 키워드를 씁니다."));
    },
  }),
  A({
    id: 'A7-1-5', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['The auto specifier shall only be used for call results, non-fundamental initializers, generic lambda parameters and trailing return types', 'auto 는 함수 호출 결과, 기본 형식이 아닌 초기값, 제네릭 람다 매개변수, 후행 반환 형식에만 써야 합니다'],
    why: ['auto with a fundamental-type initializer hides the exact type (int vs long, float vs double).', '기본 형식 초기값에 auto 를 쓰면 정확한 형식(int 와 long, float 와 double)이 가려집니다.'],
    fix: ['Spell the fundamental type explicitly.', '기본 형식을 명시하세요.'],
    check(unit, api) {
      const fundamental = (t) => { const c = t ? U.nonRef(t) : null; return !!(c && (c.kind === 'int' || c.kind === 'float')); };
      for (const v of U.ix(unit).get('VarDecl')) {
        const ts = v.specs && v.specs.typeSpec;
        if (!ts || ts.type !== 'AutoType' || !v.init) continue;
        let init = v.init;
        if (init.type === 'InitList' && init.items.length === 1) init = init.items[0];
        const e = U.strip(init);
        if (!e || e.type === 'CallExpr' || e.type === 'LambdaExpr' || e.type === 'InitList') continue;
        if (fundamental(e.ctype)) api.report(U.at(v), M(`'${v.name}' is declared auto with an initializer of fundamental type '${U.tstr(e.ctype)}'.`, `'${v.name}' 을(를) 기본 형식 '${U.tstr(e.ctype)}' 초기값과 함께 auto 로 선언했습니다.`));
      }
      for (const f of U.ix(unit).get('FunctionDecl')) {
        const ts = f.specs && f.specs.typeSpec;
        const fd = U.fdecl(f);
        if (ts && ts.type === 'AutoType' && fd && !fd.trailingReturn && !f.isConversion) api.report(U.at(f), M(`The return type of '${f.name}' is deduced from auto without a trailing return type.`, `'${f.name}' 의 반환 형식을 후행 반환 형식 없이 auto 로 추론합니다.`));
      }
    },
  }),
  A({
    id: 'A7-1-6', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['The typedef specifier shall not be used', 'typedef 지정자는 쓰면 안 됩니다'],
    why: ['An alias declaration (using) is easier to read and also works for templates.', '별칭 선언(using)이 읽기 쉽고 템플릿에도 쓸 수 있습니다.'],
    fix: ['Write using Name = Type; instead.', '대신 using Name = Type; 을 쓰세요.'],
    check(unit, api) {
      for (const t of U.ix(unit).get('TypedefDecl')) if (!t.loc.macro) api.report(U.at(t), M(`'${t.name}' is declared with typedef.`, `'${t.name}' 을(를) typedef 로 선언했습니다.`));
    },
  }),
  D('A7-1-7', ['10.0.1'], { cat: 'Required', name: ['Each expression statement and identifier declaration shall be placed on a separate line', '식 문장과 식별자 선언은 각각 별도의 줄에 써야 합니다'] }),
  A({
    id: 'A7-1-8', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 1,
    name: ['A non-type specifier shall be placed before a type specifier in a declaration', '선언에서 형식이 아닌 지정자는 형식 지정자 앞에 써야 합니다'],
    why: ['Writing "int static" or "char const static" in mixed order makes declarations hard to scan.', '"int static" 처럼 순서를 섞어 쓰면 선언을 훑어보기 어렵습니다.'],
    fix: ['Put storage and function specifiers (static, inline, constexpr ...) first.', '저장 지정자와 함수 지정자(static, inline, constexpr ...)를 먼저 쓰세요.'],
    check(unit, api) {
      for (const d of U.ix(unit).get('Declaration')) {
        if (d.loc.macro) continue;
        const toks = specTokens(unit, d);
        let sawType = false;
        for (const t of toks) {
          if (t.kind === 'punct' && (t.value === '<' || t.value === '(' || t.value === '{' || t.value === '[')) break;
          if (t.kind === 'keyword' && NON_TYPE.has(t.value)) {
            if (sawType) { api.report({ file: d.loc.file, line: t.line, col: t.col }, M(`The specifier '${t.value}' follows the type specifier.`, `지정자 '${t.value}' 가 형식 지정자 뒤에 있습니다.`)); break; }
          } else if ((t.kind === 'keyword' && TYPE_KW.has(t.value)) || t.kind === 'identifier') sawType = true;
        }
      }
    },
  }),
  A({
    id: 'A7-1-9', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['A class, structure or enumeration shall not be declared in the definition of its type', '클래스, 구조체, 열거형을 형식 정의와 함께 객체로 선언하면 안 됩니다'],
    why: ['Defining a type and an object in one declaration mixes two concerns and is easy to misread.', '형식과 객체를 한 선언에서 정의하면 두 가지 일이 섞여 잘못 읽기 쉽습니다.'],
    fix: ['Define the type first, then declare the object separately.', '형식을 먼저 정의한 뒤 객체를 따로 선언하세요.'],
    check(unit, api) {
      for (const d of U.ix(unit).get('Declaration')) {
        const ts = d.specs && d.specs.typeSpec;
        if (!ts || (ts.type !== 'RecordDecl' && ts.type !== 'EnumDecl') || !ts.isDefinition || !d.declarators.length) continue;
        if (d.specs.storage.includes('typedef')) continue;
        const names = d.declarators.map((x) => x.name).filter(Boolean).join(', ');
        api.report(U.at(d.declarators[0]), M(`'${names}' is declared in the definition of its type.`, `'${names}' 을(를) 형식 정의 안에서 함께 선언했습니다.`));
      }
    },
  }),
  A({
    id: 'A7-2-1', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 5,
    name: ['An expression with enum underlying type shall only have values corresponding to the enumerators', '열거형으로 바꾼 식의 값은 열거자에 해당하는 값이어야 합니다'],
    why: ['Casting an arbitrary integer to an enumeration produces a value no switch or comparison expects.', '임의의 정수를 열거형으로 캐스트하면 어떤 switch 나 비교도 예상하지 못한 값이 됩니다.'],
    fix: ['Validate the integer against the enumerators before converting it.', '변환 전에 정수가 열거자 값인지 확인하세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CastExpr')) {
        const t = c.ctype ? U.nonRef(c.ctype) : null;
        if (!t || t.kind !== 'enum' || !t.constants || !t.constants.length || !c.arg) continue;
        if (U.nonRef(c.arg.ctype || U.T.T.unknown).kind === 'enum') continue;
        const v = U.constInt(c.arg, unit);
        if (!v) continue;
        if (!t.constants.some((k) => k.value === v.value)) api.report(c, M(`The value ${v.value} does not correspond to an enumerator of '${t.name || 'enum'}'.`, `값 ${v.value} 은(는) '${t.name || 'enum'}' 의 어떤 열거자에도 해당하지 않습니다.`));
      }
    },
  }),
  D('A7-2-2', ['10.2.1'], { cat: 'Required', name: ['Enumeration underlying type shall be explicitly defined', '열거형의 기반 형식을 명시해야 합니다'] }),
  D('A7-2-3', ['10.2.2'], { cat: 'Required', name: ['Enumerations shall be declared as scoped enum classes', '열거형은 범위 있는 enum class 로 선언해야 합니다'] }),
  A({
    id: 'A7-2-4', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['In an enumeration, either none, the first only, or all enumerators shall be initialized', '열거형에서는 열거자를 하나도 초기화하지 않거나, 첫 번째만, 또는 모두 초기화해야 합니다'],
    why: ['Mixing explicit and implicit enumerator values easily produces unintended duplicates.', '명시적 값과 암시적 값을 섞으면 의도하지 않은 중복 값이 생기기 쉽습니다.'],
    fix: ['Initialize no enumerator, only the first one, or every one.', '열거자를 초기화하지 않거나, 첫 번째만, 또는 모두 초기화하세요.'],
    check(unit, api) {
      for (const e of U.ix(unit).get('EnumDecl')) {
        const list = e.enumerators || [];
        if (list.length < 2) continue;
        const inited = list.map((k) => !!k.value);
        const n = inited.filter(Boolean).length;
        const ok = n === 0 || n === list.length || (n === 1 && inited[0]);
        if (!ok) api.report(e, M(`The enumeration '${e.name || '<anonymous>'}' initializes only some of its enumerators.`, `열거형 '${e.name || '<이름 없음>'}' 은(는) 열거자 일부만 초기화합니다.`));
      }
    },
  }),
  D('A7-4-1', ['10.4.1']),
  A({
    id: 'A7-5-1', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 10, cwe: 'CWE-416',
    name: ['A function shall not return a reference or a pointer to a parameter that is passed by reference to const', '함수가 const 참조로 받은 매개변수의 참조나 포인터를 반환하면 안 됩니다'],
    why: ['A const reference parameter may be bound to a temporary that dies at the end of the call expression.', 'const 참조 매개변수는 호출 식이 끝나면 사라지는 임시 객체에 묶일 수 있습니다.'],
    fix: ['Return by value, or take the parameter by non-const reference or pointer.', '값으로 반환하거나 매개변수를 const 가 아닌 참조나 포인터로 받으세요.'],
    check(unit, api) {
      const constRefParam = (s) => { if (!s || s.kind !== 'parameter') return false; const t = U.canon(s.type); return t.kind === 'reference' && !t.rvalue && U.canon(t.to).const; };
      for (const r of U.ix(unit).get('ReturnStmt')) {
        const rt = r.functionReturnType ? U.canon(r.functionReturnType) : null;
        if (!rt || (rt.kind !== 'reference' && rt.kind !== 'pointer')) continue;
        let e = U.strip(r.arg);
        if (e && rt.kind === 'pointer' && e.type === 'UnaryExpr' && e.op === '&') e = U.strip(e.arg);
        else if (rt.kind === 'pointer') continue;
        if (e && e.type === 'Identifier' && constRefParam(e.symbol)) api.report(r, M(`A ${rt.kind} to the const reference parameter '${e.name}' is returned.`, `const 참조 매개변수 '${e.name}' 의 ${rt.kind === 'pointer' ? '포인터' : '참조'}를 반환합니다.`));
      }
    },
  }),
  D('A7-5-2', ['8.2.10'], { cat: 'Required', name: ['Functions shall not call themselves, either directly or indirectly', '함수가 직접이든 간접이든 자기 자신을 호출하면 안 됩니다'] }),
  D('A7-6-1', ['9.6.4'], { name: ['Functions declared with the [[noreturn]] attribute shall not return', '[[noreturn]] 함수는 반환하면 안 됩니다'] }),
  // ------------------------------------------------------- MISRA C++:2008 M7
  D('M7-1-2', ['10.1.1'], { cat: 'Required', name: ['A pointer or reference parameter shall point to const if the object is not modified', '객체를 바꾸지 않는 포인터나 참조 매개변수는 const 를 가리켜야 합니다'] }),
  D('M7-3-1', ['6.0.3'], { cat: 'Required' }),
  D('M7-3-2', ['6.0.4']),
  D('M7-3-3', ['10.3.1'], { cat: 'Required' }),
  A({
    id: 'M7-3-4', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['Using-directives shall not be used', 'using 지시문은 쓰면 안 됩니다'],
    why: ['using namespace brings every name of a namespace into scope and can silently change which function is called.', 'using namespace 는 네임스페이스의 모든 이름을 범위로 가져와 어떤 함수가 호출되는지 조용히 바꿀 수 있습니다.'],
    fix: ['Qualify names or use individual using-declarations.', '이름을 한정하거나 개별 using 선언을 쓰세요.'],
    check(unit, api) {
      for (const u of U.ix(unit).get('UsingDirective')) api.report(u, M(`The using-directive for '${u.name}' is used.`, `'${u.name}' 에 대한 using 지시문을 씁니다.`));
    },
  }),
  A({
    id: 'M7-3-6', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['Using-directives and namespace-scope using-declarations shall not be used in header files', '헤더 파일에서는 using 지시문과 네임스페이스 범위의 using 선언을 쓰면 안 됩니다'],
    why: ['A using in a header changes name lookup in every file that includes it.', '헤더의 using 은 그 헤더를 포함하는 모든 파일의 이름 찾기를 바꿉니다.'],
    fix: ['Move the using into function or class scope, or qualify the names.', 'using 을 함수나 클래스 범위로 옮기거나 이름을 한정하세요.'],
    check(unit, api) {
      for (const u of U.ix(unit).get('UsingDirective', 'UsingDecl')) {
        if (!cf.isHeader(u.loc.file)) continue;
        if (cf.enclosing(u, ['FunctionDecl', 'RecordDecl', 'LambdaExpr'])) continue;
        api.report(u, M(`A ${u.type === 'UsingDirective' ? 'using-directive' : 'using-declaration'} for '${u.name || u.qname}' appears in a header file.`, `헤더 파일에 '${u.name || u.qname}' 에 대한 using ${u.type === 'UsingDirective' ? '지시문' : '선언'}이 있습니다.`));
      }
    },
  }),
  A({
    id: 'M7-4-3', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 10,
    name: ['Assembly language shall be encapsulated and isolated', '어셈블리 언어는 캡슐화하고 분리해야 합니다'],
    why: ['Mixing assembly with C++ statements in one function makes both hard to review and port.', '한 함수 안에서 어셈블리와 C++ 문장을 섞으면 둘 다 검토와 이식이 어렵습니다.'],
    fix: ['Put the assembly in a dedicated function that contains nothing else.', '어셈블리를 다른 것이 없는 전용 함수에 두세요.'],
    check(unit, api) {
      for (const a of U.ix(unit).get('AsmStmt')) {
        const fn = cf.enclosing(a, ['FunctionDecl', 'LambdaExpr']);
        const body = fn && fn.body;
        if (!body || body.type !== 'CompoundStmt') continue;
        if (body.body.some((s) => s.type !== 'AsmStmt' && s.type !== 'NullStmt')) api.report(a, M('Assembly is mixed with other statements in this function.', '이 함수에서 어셈블리가 다른 문장과 섞여 있습니다.'));
      }
    },
  }),
  D('M7-5-1', ['6.8.2'], { cat: 'Required', type: 'BUG' }),
  D('M7-5-2', ['6.8.3'], { cat: 'Required', type: 'BUG' }),
];
