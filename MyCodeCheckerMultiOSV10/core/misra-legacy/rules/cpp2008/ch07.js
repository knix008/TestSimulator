'use strict';

// MISRA C++:2008 chapter 7 — declarations.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');

const { cf, T } = U;

const canonT = (t) => (t ? T.canonical(t) : null);

// Is the identifier use a modification (or could it be, e.g. bound to a non-const reference)?
function modifies(id) {
  const w = U.P.writeKind(id);
  if (w) return true;
  const { p, key } = U.P.upParens(id);
  if (p && p.type === 'CallExpr' && key === 'args') {
    const i = p.args.findIndex((a) => U.strip(a) === id || a === id);
    const ft = U.C.fnTypeOfCallee(p);
    const pt = ft && ft.params[i] && canonT(ft.params[i]);
    if (pt && pt.kind === 'reference' && !canonT(pt.to).const) return true;
    if (!ft) return true;
  }
  if (p && p.type === 'MemberExpr') return true; // member call or member write on the object
  if (p && p.type === 'VarDecl' && canonT(p.ctype) && canonT(p.ctype).kind === 'reference' && !canonT(canonT(p.ctype).to).const) return true;
  return false;
}

function shouldBeConst(unit, api) {
  for (const v of U.get(unit, 'VarDecl')) {
    const s = v.symbol;
    if (!s || s.kind !== 'variable' || !v.init || s.storage === 'static' || cf.enclosing(v, 'FunctionDecl') == null) continue;
    const t = canonT(v.ctype);
    if (!t || t.const || !(t.kind === 'int' || t.kind === 'float' || t.kind === 'pointer' || t.kind === 'enum')) continue;
    const p = cf.parentOf(v);
    if (p && (p.condition || (cf.parentOf(p) && cf.parentOf(p).type === 'ForStmt' && cf.parentKey(p) === 'init'))) continue;
    if (cf.enclosing(v, 'RangeForStmt') && cf.parentKey(p) === 'decl') continue;
    if ((s.uses || []).some(modifies)) continue;
    if (t.kind === 'pointer') {
      // `const char *p` points to const data, but the pointer itself is still not const
      api.report(v.nameLoc || v, M(`Pointer variable '${v.name}' is never modified and should itself be const ('* const').`, `포인터 변수 '${v.name}'는 변경되지 않으므로 포인터 자체가 const('* const')여야 합니다.`));
      continue;
    }
    api.report(v.nameLoc || v, M(`Variable '${v.name}' is never modified and should be const.`, `변수 '${v.name}'는 변경되지 않으므로 const여야 합니다.`));
  }
}

function enumValues(unit, api) {
  for (const c of U.get(unit, 'CastExpr')) {
    if (!c.arg || !c.typeName) continue;
    const t = canonT(c.typeName.ctype);
    if (!t || t.kind !== 'enum' || !t.constants || !t.constants.length) continue;
    const v = U.iceValue(unit, c.arg);
    if (v == null) continue;
    if (!t.constants.some((k) => k.value === v)) api.report(c, M(`The value ${v} is not an enumerator of '${t.name || 'enum'}'.`, `값 ${v}는 '${t.name || 'enum'}'의 열거자가 아닙니다.`));
  }
}

function usingDirectives(unit, api) {
  for (const u of U.get(unit, 'UsingDirective')) api.report(u, M(`'using namespace ${u.name}' is used.`, `'using namespace ${u.name}'를 사용했습니다.`));
}

function usingInHeaders(unit, api) {
  for (const u of U.get(unit, 'UsingDirective', 'UsingDecl')) {
    if (!cf.isHeader(u.loc.file)) continue;
    if (u.type === 'UsingDecl' && cf.enclosing(u, ['FunctionDecl', 'RecordDecl'])) continue;
    if (!U.firstScan(api, 'cpp08-7-3-6', `${u.loc.file}:${u.loc.line}:${u.loc.col}`)) continue;
    api.report(u, M(`A ${u.type === 'UsingDirective' ? 'using-directive' : 'using-declaration'} is used in a header file.`, `헤더 파일에서 ${u.type === 'UsingDirective' ? 'using 지시문' : 'using 선언'}을 사용했습니다.`));
  }
}

function straddle(unit, api) {
  for (const u of U.get(unit, 'UsingDecl')) {
    if (cf.enclosing(u, ['FunctionDecl', 'RecordDecl'])) continue;
    const q = String(u.qname || u.name || '').replace(/^::/, '');
    if (!q.includes('::')) continue;
    const decls = U.get(unit, 'FunctionDecl').filter((f) => String((f.symbol && f.symbol.qname) || f.qname || '').replace(/^::/, '') === q && f.loc.file === u.loc.file);
    const before = decls.some((f) => f.loc.start < u.loc.start);
    const after = decls.find((f) => f.loc.start > u.loc.start);
    if (before && after) api.report(u, M(`Declarations of '${q}' appear both before and after this using-declaration.`, `'${q}'의 선언이 이 using 선언의 앞과 뒤에 모두 있습니다.`));
  }
}

const ASM_WORDS = new Set(['__asm__', '__asm', '_asm']);
function asmSpelling(unit, api) {
  for (const [, src] of U.sourcesOnce(unit, api, 'cpp08-7-4-2')) {
    for (const t of src.tokens || []) {
      if (ASM_WORDS.has(t.value)) api.report(t, M(`Assembler is introduced with '${t.value}' instead of the asm declaration.`, `asm 선언 대신 '${t.value}'로 어셈블러를 넣었습니다.`));
    }
  }
}

function returnsRefParam(unit, api) {
  for (const r of U.get(unit, 'ReturnStmt')) {
    if (!r.arg || !r.functionReturnType) continue;
    const rt = canonT(r.functionReturnType);
    if (!rt || (rt.kind !== 'reference' && rt.kind !== 'pointer')) continue;
    let e = U.strip(r.arg);
    if (rt.kind === 'pointer') { if (!e || e.type !== 'UnaryExpr' || e.op !== '&') continue; e = U.strip(e.arg); }
    if (!e || e.type !== 'Identifier' || !e.symbol || e.symbol.kind !== 'parameter') continue;
    const pt = canonT(e.symbol.type);
    if (pt && pt.kind === 'reference') api.report(r, M(`The function returns a ${rt.kind} to the reference parameter '${e.name}'.`, `함수가 참조 매개변수 '${e.name}'에 대한 ${rt.kind === 'reference' ? '참조' : '포인터'}를 반환합니다.`));
  }
}

module.exports = [
  CPP08({
    id: '7-1-1', cat: 'R', dec: true, cpp2023: '10.1.1',
    name: ['A variable that is not modified shall be const', '변경되지 않는 변수는 const여야 합니다'],
    why: ['const documents and enforces that the value never changes.', 'const는 값이 바뀌지 않는다는 것을 알리고 강제합니다.'],
    fix: ['Add const to the declaration.', '선언에 const를 추가하세요.'],
    check: shouldBeConst,
  }),
  CPP08({
    id: '7-1-2', cat: 'R', dec: true, cpp2023: '10.1.1', c2012: '8.13',
    name: ['Pointer and reference parameters shall be const when not used to modify', '수정에 쓰지 않는 포인터와 참조 매개변수는 const여야 합니다'],
    why: ['const parameters show the function only reads the argument.', 'const 매개변수는 함수가 인수를 읽기만 한다는 것을 보여 줍니다.'],
    fix: ['Add const to the pointed-to or referenced type.', '가리키거나 참조하는 형식에 const를 추가하세요.'],
    reuse: 'misra-cpp:10.1.1',
  }),
  CPP08({
    id: '7-2-1', cat: 'R', dec: true, type: 'BUG', cwe: 'CWE-704',
    name: ['An enum expression shall only hold values of its enumerators', '열거형 식은 열거자 값만 가져야 합니다'],
    why: ['A value that is not an enumerator falls outside every switch case.', '열거자가 아닌 값은 모든 switch case에서 벗어납니다.'],
    fix: ['Convert only values that correspond to an enumerator.', '열거자에 해당하는 값만 변환하세요.'],
    check: enumValues,
  }),
  CPP08({
    id: '7-3-1', cat: 'R', dec: true, cpp2023: '6.0.3',
    name: ['The global namespace shall only contain main, namespaces and extern "C" declarations', '전역 네임스페이스에는 main, 네임스페이스, extern "C" 선언만 있어야 합니다'],
    why: ['Global names collide easily between libraries.', '전역 이름은 라이브러리 사이에서 쉽게 충돌합니다.'],
    fix: ['Put the declarations into a namespace.', '선언을 네임스페이스 안에 넣으세요.'],
    reuse: 'misra-cpp:6.0.3',
  }),
  CPP08({
    id: '7-3-2', cat: 'R', dec: true, cpp2023: '6.0.4',
    name: ['main shall only be used for the global main function', 'main은 전역 main 함수에만 사용해야 합니다'],
    why: ['Another function named main is confusing.', 'main이라는 이름의 다른 함수는 혼란스럽습니다.'],
    fix: ['Rename the function.', '함수 이름을 바꾸세요.'],
    reuse: 'misra-cpp:6.0.4',
  }),
  CPP08({
    id: '7-3-3', cat: 'R', dec: true, cpp2023: '10.3.1',
    name: ['There shall be no unnamed namespaces in header files', '헤더 파일에 이름 없는 네임스페이스가 없어야 합니다'],
    why: ['Each including unit gets its own copy of the contents.', '포함하는 단위마다 내용의 복사본을 따로 가집니다.'],
    fix: ['Use a named namespace in the header.', '헤더에서는 이름 있는 네임스페이스를 사용하세요.'],
    reuse: 'misra-cpp:10.3.1',
  }),
  CPP08({
    id: '7-3-4', cat: 'R', dec: true,
    name: ['using-directives shall not be used', 'using 지시문을 사용하지 않아야 합니다'],
    why: ['A using-directive brings unknown names into scope and changes lookup.', 'using 지시문은 알 수 없는 이름을 범위에 들여 조회를 바꿉니다.'],
    fix: ['Use qualified names or using-declarations.', '한정된 이름이나 using 선언을 사용하세요.'],
    check: usingDirectives,
  }),
  CPP08({
    id: '7-3-5', cat: 'R', dec: true,
    name: ['Declarations of a name shall not straddle a using-declaration for it', '이름의 선언들이 그 이름의 using 선언 앞뒤에 걸치면 안 됩니다'],
    why: ['Overloads declared after the using-declaration are not visible through it.', 'using 선언 뒤에 선언된 오버로드는 그 선언으로 보이지 않습니다.'],
    fix: ['Declare all overloads before the using-declaration.', '모든 오버로드를 using 선언 앞에서 선언하세요.'],
    check: straddle,
  }),
  CPP08({
    id: '7-3-6', cat: 'R', dec: true,
    name: ['using-directives and namespace-scope using-declarations shall not be in headers', '헤더에 using 지시문과 네임스페이스 범위 using 선언을 두지 않아야 합니다'],
    why: ['They change name lookup in every file that includes the header.', '헤더를 포함하는 모든 파일의 이름 조회를 바꿉니다.'],
    fix: ['Use qualified names in the header.', '헤더에서는 한정된 이름을 사용하세요.'],
    check: usingInHeaders,
  }),
  CPP08({
    id: '7-4-1', cat: 'D', manual: true,
    name: ['All use of assembler shall be documented', '어셈블러의 모든 사용은 문서화해야 합니다'],
    why: ['Assembler is not portable and needs a rationale.', '어셈블러는 이식성이 없어 근거가 필요합니다.'],
    fix: ['Document why and where assembler is used.', '어셈블러를 왜, 어디서 쓰는지 문서화하세요.'],
  }),
  CPP08({
    id: '7-4-2', cat: 'R', dec: true, cpp2023: '10.4.1',
    name: ['Assembler shall only be introduced with the asm declaration', '어셈블러는 asm 선언으로만 넣어야 합니다'],
    why: ['Compiler-specific spellings are not portable.', '컴파일러별 표기는 이식성이 없습니다.'],
    fix: ['Use the standard asm declaration.', '표준 asm 선언을 사용하세요.'],
    check: asmSpelling,
  }),
  CPP08({
    id: '7-4-3', cat: 'R', dec: true, c2012: 'dir-4.3',
    name: ['Assembly language shall be encapsulated and isolated', '어셈블리 언어는 캡슐화하고 격리해야 합니다'],
    why: ['Mixed assembler and C++ is hard to port and review.', '어셈블러와 C++를 섞으면 이식과 검토가 어렵습니다.'],
    fix: ['Move the assembler into a dedicated function.', '어셈블러를 전용 함수로 옮기세요.'],
    reuse: 'misra-c:dir-4.3',
  }),
  CPP08({
    id: '7-5-1', cat: 'R', dec: true, type: 'BUG', cpp2023: '6.8.2', cwe: 'CWE-562',
    name: ['A function shall not return a reference or pointer to an automatic variable', '함수는 자동 변수에 대한 참조나 포인터를 반환하지 않아야 합니다'],
    why: ['The object no longer exists when the caller uses the result.', '호출자가 결과를 쓸 때 객체는 이미 없습니다.'],
    fix: ['Return by value or use an object with a longer lifetime.', '값으로 반환하거나 수명이 더 긴 객체를 사용하세요.'],
    reuse: 'misra-cpp:6.8.2',
  }),
  CPP08({
    id: '7-5-2', cat: 'R', dec: false, type: 'BUG', cpp2023: '6.8.3', c2012: '18.6', cwe: 'CWE-562',
    name: ['The address of an automatic object shall not be stored in a longer-lived object', '자동 객체의 주소를 수명이 더 긴 객체에 저장하지 않아야 합니다'],
    why: ['The stored pointer dangles once the object goes out of scope.', '객체가 범위를 벗어나면 저장된 포인터는 댕글링이 됩니다.'],
    fix: ['Do not keep the address beyond the lifetime of the object.', '객체 수명 이후까지 주소를 보관하지 마세요.'],
    reuse: 'misra-cpp:6.8.3',
  }),
  CPP08({
    id: '7-5-3', cat: 'R', dec: true, type: 'BUG', cwe: 'CWE-562',
    name: ['A function shall not return a reference or pointer to a reference parameter', '함수는 참조 매개변수에 대한 참조나 포인터를 반환하지 않아야 합니다'],
    why: ['The argument may be a temporary that dies at the end of the call expression.', '인수가 호출 식 끝에서 사라지는 임시 객체일 수 있습니다.'],
    fix: ['Return by value.', '값으로 반환하세요.'],
    check: returnsRefParam,
  }),
  CPP08({
    id: '7-5-4', cat: 'A', dec: false, cpp2023: '8.2.10', c2012: '17.2', cwe: 'CWE-674',
    name: ['Functions should not call themselves directly or indirectly', '함수는 직접 또는 간접으로 자신을 호출하지 않아야 합니다'],
    why: ['Recursion can exhaust the stack.', '재귀는 스택을 고갈시킬 수 있습니다.'],
    fix: ['Rewrite iteratively.', '반복 방식으로 다시 작성하세요.'],
    reuse: 'misra-cpp:8.2.10',
  }),
];
