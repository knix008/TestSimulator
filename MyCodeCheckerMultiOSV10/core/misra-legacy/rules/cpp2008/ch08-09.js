'use strict';

// MISRA C++:2008 chapter 8 — declarators; chapter 9 — classes.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');
const S = require('../../lib/stmt');
const CP = require('../../lib/cpp');

const { cf, T } = U;
const P = U.P;

const canonT = (t) => (t ? T.canonical(t) : null);

function variadicDefinitions(unit, api) {
  for (const f of U.funcs(unit)) {
    if (f.type === 'FunctionDecl' && f.variadic) api.report(f.nameLoc || f, M(`Function '${f.name}' is defined with an ellipsis.`, `함수 '${f.name}'를 생략 부호(...)로 정의했습니다.`));
  }
}

// Member data referred to by a return expression: identifier of a non-static member (or this->m).
function memberData(e) {
  let x = U.strip(e);
  for (let i = 0; x && i < 10; i++) {
    if (x.type === 'UnaryExpr' && x.op === '&') { x = U.strip(x.arg); continue; }
    if (x.type === 'IndexExpr') { x = U.strip(x.object); continue; }
    break;
  }
  if (!x) return null;
  if (x.type === 'Identifier' && x.symbol && x.symbol.kind === 'field' && x.symbol.storage !== 'static' && (x.implicitThis || x.symbol.member)) return x;
  if (x.type === 'MemberExpr' && x.object && U.strip(x.object).type === 'ThisExpr') return x;
  return null;
}

function nonConstHandles(unit, api, constOnly) {
  for (const fd of U.funcs(unit)) {
    if (fd.type !== 'FunctionDecl' || !CP.ownerOf(unit, fd)) continue;
    const isConst = P.isConstMethod(fd);
    if (constOnly && !isConst) continue;
    const ft = canonT(fd.ctype);
    const rt = ft && ft.kind === 'function' ? canonT(ft.ret) : null;
    if (!rt || (rt.kind !== 'pointer' && rt.kind !== 'reference')) continue;
    if (canonT(rt.to).const) continue;
    for (const r of cf.findAll(fd.body, 'ReturnStmt')) {
      const m = r.arg && memberData(r.arg);
      if (!m) continue;
      api.report(r, M(`${isConst ? 'Const member function' : 'Member function'} '${fd.name}' returns a non-const handle to class data '${U.code(unit, m)}'.`, `${isConst ? 'const 멤버 함수' : '멤버 함수'} '${fd.name}'가 클래스 데이터 '${U.code(unit, m)}'에 대한 const가 아닌 핸들을 반환합니다.`));
    }
  }
}

// Can the member function be static (no use of this) or const (no modification of this)?
function staticOrConst(unit, api) {
  for (const fd of U.funcs(unit)) {
    if (fd.type !== 'FunctionDecl' || fd.isDefault || fd.isDeleted || CP.isSpecial(fd)) continue;
    const rec = CP.ownerOf(unit, fd);
    if (!rec) continue;
    const specs = P.specsOf(fd);
    if (specs && specs.storage && specs.storage.includes('static')) continue;
    if ((fd.symbol && (fd.symbol.decls || []).some((d) => { const s = P.specsOf(d); return s && s.storage && s.storage.includes('static'); }))) continue;
    if (CP.isVirtual(unit, fd)) continue;
    let usesThis = false;
    let modifies = false;
    cf.walk(fd.body, (n) => {
      if (n.type === 'LambdaExpr') return cf.walk.SKIP;
      const member = (n.type === 'Identifier' && n.implicitThis) || n.type === 'ThisExpr';
      if (!member) return undefined;
      usesThis = true;
      let top = n;
      for (let p = cf.parentOf(top); p && (p.type === 'MemberExpr' || p.type === 'IndexExpr' || p.type === 'ParenExpr') && cf.parentKey(top) === (p.type === 'ParenExpr' ? 'expr' : 'object'); p = cf.parentOf(p)) top = p;
      const { p, key } = P.upParens(top);
      if (p && p.type === 'AssignExpr' && key === 'left') modifies = true;
      else if (p && p.type === 'UnaryExpr' && (p.op === '++' || p.op === '--' || p.op === '&')) modifies = true;
      else if (p && p.type === 'CallExpr' && key === 'callee') {
        const s = n.symbol || (top.memberSymbol);
        const d = s && (s.decls || []).find((x) => x.type === 'FunctionDecl');
        if (!d || !P.isConstMethod(d)) modifies = true;
      } else if (p && p.type === 'CallExpr') modifies = true;
      else if (p && p.type === 'ReturnStmt') {
        const ft = canonT(fd.ctype);
        const rt = ft && ft.kind === 'function' ? canonT(ft.ret) : null;
        if (rt && (rt.kind === 'reference' || rt.kind === 'pointer') && !canonT(rt.to).const) modifies = true;
      } else if (n.type === 'ThisExpr' && !(p && p.type === 'MemberExpr')) modifies = true;
      if (top !== n && top.type === 'MemberExpr' && p && p.type === 'CallExpr' && key === 'callee') {
        const d = top.memberSymbol && (top.memberSymbol.decls || []).find((x) => x.type === 'FunctionDecl');
        if (!d || !P.isConstMethod(d)) modifies = true;
      }
      return undefined;
    });
    if (!usesThis) api.report(fd.nameLoc || fd, M(`Member function '${fd.name}' does not use the object and can be made static.`, `멤버 함수 '${fd.name}'는 객체를 사용하지 않으므로 static으로 만들 수 있습니다.`));
    else if (!modifies && !P.isConstMethod(fd)) api.report(fd.nameLoc || fd, M(`Member function '${fd.name}' does not modify the object and can be made const.`, `멤버 함수 '${fd.name}'는 객체를 변경하지 않으므로 const로 만들 수 있습니다.`));
  }
}

function bitFieldTypes(unit, api) {
  for (const f of S.bitFields(unit)) {
    const c = canonT(f.ctype);
    if (!c) continue;
    if (c.kind === 'enum') continue; // 9-6-3
    let ok = false;
    if (c.kind === 'int') {
      if (c.name === 'bool') ok = true;
      else {
        const names = S.specNames(f);
        ok = names ? (names.includes('signed') || names.includes('unsigned')) : (c.name.startsWith('unsigned') || c.name === 'signed char' || !['char', 'int', 'short', 'long', 'long long', 'wchar_t'].includes(c.name));
      }
    }
    if (!ok) api.report(f.nameLoc || f, M(`Bit-field '${f.name || '<unnamed>'}' is neither bool nor an explicitly signed or unsigned integral type.`, `비트 필드 '${f.name || '<이름 없음>'}'가 bool도, 명시적으로 부호를 지정한 정수 형식도 아닙니다.`));
  }
}

function enumBitFields(unit, api) {
  for (const f of S.bitFields(unit)) {
    const c = canonT(f.ctype);
    if (c && c.kind === 'enum') api.report(f.nameLoc || f, M(`Bit-field '${f.name || '<unnamed>'}' has enum type.`, `비트 필드 '${f.name || '<이름 없음>'}'가 열거형입니다.`));
  }
}

module.exports = [
  CPP08({
    id: '8-0-1', cat: 'R', dec: true, cpp2023: '10.0.1',
    name: ['A declaration shall declare a single variable or member', '선언 하나는 변수나 멤버 하나만 선언해야 합니다'],
    why: ['Several declarators in one declaration are easy to misread, especially with pointers.', '한 선언에 여러 선언자가 있으면 특히 포인터에서 잘못 읽기 쉽습니다.'],
    fix: ['Declare one entity per declaration.', '선언마다 개체 하나만 선언하세요.'],
    reuse: 'misra-cpp:10.0.1',
  }),
  CPP08({
    id: '8-3-1', cat: 'R', dec: true, cpp2023: '13.3.2',
    name: ['Overriding functions shall use the same default arguments or none', '재정의 함수는 같은 기본 인수를 쓰거나 아예 쓰지 않아야 합니다'],
    why: ['Default arguments are bound statically, so different defaults give surprising results.', '기본 인수는 정적으로 결정되므로 다른 기본값은 뜻밖의 결과를 냅니다.'],
    fix: ['Repeat the base defaults or omit them.', '기반 클래스의 기본값을 반복하거나 생략하세요.'],
    reuse: 'misra-cpp:13.3.2',
  }),
  CPP08({
    id: '8-4-1', cat: 'R', dec: true, cpp2023: '8.2.11', c2012: '17.1',
    name: ['Functions shall not be defined with an ellipsis', '함수를 생략 부호로 정의하지 않아야 합니다'],
    why: ['Variadic arguments are not type-checked.', '가변 인수는 형식 검사가 되지 않습니다.'],
    fix: ['Use overloads, templates or a container parameter.', '오버로드, 템플릿, 컨테이너 매개변수를 사용하세요.'],
    check: variadicDefinitions,
  }),
  CPP08({
    id: '8-4-2', cat: 'R', dec: true, cpp2023: '13.3.3', c2012: '8.3',
    name: ['Parameter names shall be the same in every declaration', '모든 선언에서 매개변수 이름이 같아야 합니다'],
    why: ['Different names for one parameter mislead the reader.', '한 매개변수에 다른 이름을 쓰면 읽는 사람을 오도합니다.'],
    fix: ['Use identical parameter names.', '같은 매개변수 이름을 사용하세요.'],
    check: S.paramNamesMatch,
  }),
  CPP08({
    id: '8-4-3', cat: 'R', dec: true, type: 'BUG', cpp2023: '9.6.5', c2012: '17.4',
    name: ['Every exit of a non-void function shall return a value', 'void가 아닌 함수의 모든 출구는 값을 반환해야 합니다'],
    why: ['Flowing off the end of a non-void function is undefined behaviour.', 'void가 아닌 함수 끝까지 흘러가면 정의되지 않은 동작입니다.'],
    fix: ['Return a value on every path.', '모든 경로에서 값을 반환하세요.'],
    reuse: 'misra-cpp:9.6.5',
  }),
  CPP08({
    id: '8-4-4', cat: 'R', dec: true, cpp2023: '7.11.3', c2012: '17.12',
    name: ['A function identifier shall be called or preceded by &', '함수 식별자는 호출하거나 &를 앞에 붙여야 합니다'],
    why: ['A bare function name in a test is always true.', '검사에서 함수 이름만 쓰면 항상 참입니다.'],
    fix: ['Call the function or write &f.', '함수를 호출하거나 &f로 쓰세요.'],
    reuse: 'misra-cpp:7.11.3',
  }),
  CPP08({
    id: '8-5-1', cat: 'R', dec: false, type: 'BUG', sev: 'CRITICAL', cpp2023: '11.6.2', c2012: '9.1', cwe: 'CWE-457',
    name: ['Variables shall have a value before they are used', '변수는 사용하기 전에 값이 있어야 합니다'],
    why: ['Reading an uninitialised object gives an indeterminate value.', '초기화되지 않은 객체를 읽으면 값이 불확정입니다.'],
    fix: ['Initialise the variable at its declaration.', '선언에서 변수를 초기화하세요.'],
    reuse: 'misra-cpp:11.6.2',
  }),
  CPP08({
    id: '8-5-2', cat: 'R', dec: true, c2012: '9.2',
    name: ['Braces shall match the structure of aggregate initialisers', '집합체 초기화자의 중괄호는 구조와 맞아야 합니다'],
    why: ['Brace elision hides which element each value initialises.', '중괄호 생략은 각 값이 어떤 요소를 초기화하는지 숨깁니다.'],
    fix: ['Add braces for nested arrays and structures.', '중첩 배열과 구조체에 중괄호를 추가하세요.'],
    reuse: 'misra-c:9.2',
  }),
  CPP08({
    id: '8-5-3', cat: 'R', dec: true, cpp2023: '11.6.3', c2012: '8.12',
    name: ['Enumerators shall be initialised all, first only, or none', '열거자는 모두, 첫 번째만, 또는 전혀 초기화하지 않아야 합니다'],
    why: ['Mixing explicit and implicit values easily creates duplicates.', '명시적 값과 암시적 값을 섞으면 중복이 쉽게 생깁니다.'],
    fix: ['Initialise only the first or every enumerator.', '첫 번째만 또는 모든 열거자를 초기화하세요.'],
    check: S.enumInit,
  }),
  // ---------------------------------------------------------------- chapter 9
  CPP08({
    id: '9-3-1', cat: 'R', dec: true,
    name: ['Const member functions shall not return non-const pointers or references to class data', 'const 멤버 함수는 클래스 데이터에 대한 const가 아닌 포인터나 참조를 반환하지 않아야 합니다'],
    why: ['The caller could modify an object that was promised to stay unchanged.', '호출자가 변하지 않기로 약속된 객체를 수정할 수 있습니다.'],
    fix: ['Return a pointer or reference to const.', 'const에 대한 포인터나 참조를 반환하세요.'],
    check(unit, api) { nonConstHandles(unit, api, true); },
  }),
  CPP08({
    id: '9-3-2', cat: 'R', dec: true,
    name: ['Member functions shall not return non-const handles to class data', '멤버 함수는 클래스 데이터에 대한 const가 아닌 핸들을 반환하지 않아야 합니다'],
    why: ['A non-const handle lets callers bypass the class invariants.', 'const가 아닌 핸들은 호출자가 클래스 불변식을 우회하게 합니다.'],
    fix: ['Return by value or return a handle to const.', '값으로 반환하거나 const에 대한 핸들을 반환하세요.'],
    check(unit, api) { nonConstHandles(unit, api, false); },
  }),
  CPP08({
    id: '9-3-3', cat: 'R', dec: false,
    name: ['Member functions shall be static or const when possible', '멤버 함수는 가능하면 static이나 const여야 합니다'],
    why: ['static and const document how a function uses the object.', 'static과 const는 함수가 객체를 어떻게 쓰는지 알려 줍니다.'],
    fix: ['Make the function static if it does not use this, otherwise const if it does not modify the object.', 'this를 쓰지 않으면 static으로, 객체를 바꾸지 않으면 const로 만드세요.'],
    check: staticOrConst,
  }),
  CPP08({
    id: '9-5-1', cat: 'R', dec: true, cpp2023: '12.3.1', c2012: '19.2',
    name: ['Unions shall not be used', '공용체를 사용하지 않아야 합니다'],
    why: ['Reading a member other than the last written one is undefined.', '마지막으로 쓴 멤버가 아닌 멤버를 읽는 것은 정의되지 않습니다.'],
    fix: ['Use a class or std::variant.', '클래스나 std::variant를 사용하세요.'],
    reuse: 'misra-cpp:12.3.1',
  }),
  CPP08({
    id: '9-6-1', cat: 'D', manual: true,
    name: ['Bit-field layout relied upon shall be documented', '의존하는 비트 필드 배치는 문서화해야 합니다'],
    why: ['Bit-field packing and order are implementation-defined.', '비트 필드 패킹과 순서는 구현 정의입니다.'],
    fix: ['Document the layout the code depends on.', '코드가 의존하는 배치를 문서화하세요.'],
  }),
  CPP08({
    id: '9-6-2', cat: 'R', dec: true, cpp2023: '12.2.2', c2012: '6.1',
    name: ['Bit-fields shall be bool or explicitly signed or unsigned integral', '비트 필드는 bool이거나 부호를 명시한 정수 형식이어야 합니다'],
    why: ['The signedness of plain int and char bit-fields is implementation-defined.', '일반 int와 char 비트 필드의 부호 여부는 구현 정의입니다.'],
    fix: ['Use bool, unsigned int, signed int or a fixed-width typedef.', 'bool, unsigned int, signed int, 고정 폭 typedef를 사용하세요.'],
    check: bitFieldTypes,
  }),
  CPP08({
    id: '9-6-3', cat: 'R', dec: true, cpp2023: '12.2.2',
    name: ['Bit-fields shall not have enum type', '비트 필드는 열거형이면 안 됩니다'],
    why: ['Whether an enum bit-field can hold all enumerators is implementation-defined.', '열거형 비트 필드가 모든 열거자를 담을 수 있는지는 구현 정의입니다.'],
    fix: ['Use an unsigned integral bit-field.', '부호 없는 정수 비트 필드를 사용하세요.'],
    check: enumBitFields,
  }),
  CPP08({
    id: '9-6-4', cat: 'R', dec: true, cpp2023: '12.2.3', c2012: '6.2',
    name: ['Named signed bit-fields shall be wider than one bit', '이름 있는 부호 있는 비트 필드는 1비트보다 넓어야 합니다'],
    why: ['A 1-bit signed field holds only 0 and -1.', '1비트 부호 있는 필드는 0과 -1만 담습니다.'],
    fix: ['Make it unsigned or wider.', '부호 없게 하거나 더 넓게 하세요.'],
    reuse: 'misra-cpp:12.2.3',
  }),
];
