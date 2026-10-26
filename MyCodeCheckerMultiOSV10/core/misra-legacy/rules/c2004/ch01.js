'use strict';

// MISRA C:2004 chapter 1 — environment.

const { C04, M } = require('../../lib/meta');
const U = require('../../lib/util');

const { cf, T } = U;

// Features that are not part of C90 (ISO 9899:1990 with amendments).
function c99Features(unit, api) {
  const say = (n, what, ko) => api.report(n, M(`${what} is not part of C90.`, `${ko}은(는) C90에 없는 기능입니다.`));
  for (const b of U.get(unit, 'BuiltinType')) {
    const names = b.names || [];
    if (names.filter((x) => x === 'long').length > 1) say(b, "'long long'", "'long long'");
    if (names.includes('_Bool')) say(b, "'_Bool'", "'_Bool'");
    if (names.includes('_Complex')) say(b, "'_Complex'", "'_Complex'");
  }
  for (const d of U.get(unit, 'Declaration')) {
    const s = d.specs;
    if (!s) continue;
    if ((s.functionSpecs || []).includes('inline')) say(d, "The 'inline' specifier", "'inline' 지정자");
    if ((s.qualifiers || []).includes('restrict')) say(d, "The 'restrict' qualifier", "'restrict' 한정자");
  }
  for (const p of U.get(unit, 'PointerDeclarator')) if ((p.quals || []).includes('restrict')) say(p, "The 'restrict' qualifier", "'restrict' 한정자");
  for (const n of U.get(unit, 'DesignatedInit')) say(n, 'A designated initializer', '지정 초기화자');
  for (const n of U.get(unit, 'CompoundLiteral')) say(n, 'A compound literal', '복합 리터럴');
  for (const v of U.get(unit, 'VarDecl')) {
    const c = v.ctype && T.canonical(v.ctype);
    if (c && c.kind === 'array' && c.vla) say(v.nameLoc || v, 'A variable-length array', '가변 길이 배열');
  }
  for (const f of U.get(unit, 'ForStmt')) if (f.init && f.init.type === 'Declaration') say(f.init, 'A declaration in a for statement', 'for 문 안의 선언');
  for (const c of U.get(unit, 'CompoundStmt')) {
    let stmt = false;
    for (const s of c.body) {
      if (s.type === 'Declaration' || s.type === 'StaticAssert') {
        if (stmt) { say(s, 'A declaration after a statement', '문 뒤의 선언'); break; }
      } else stmt = true;
    }
  }
  for (const i of U.get(unit, 'Identifier')) if (i.predefined && i.name === '__func__') say(i, "'__func__'", "'__func__'");
  const files = new Set(U.sourcesOnce(unit, api, 'c04-1.1').map(([f]) => f));
  for (const m of unit.macros || []) if (files.has(m.file) && m.variadic) say({ file: m.file, line: m.line, col: m.col }, `The variadic macro '${m.name}'`, `가변 인수 매크로 '${m.name}'`);
  for (const r of U.get(unit, 'RecordDecl')) {
    const t = r.ctype && T.canonical(r.ctype);
    const last = t && t.fields && t.fields[t.fields.length - 1];
    if (last && T.canonical(last.type).kind === 'array' && T.canonical(last.type).size == null) say(last.node || r, 'A flexible array member', '유연한 배열 멤버');
  }
  void cf;
}

module.exports = [
  C04({
    id: '1.1', cat: 'R', dec: true, c2012: '1.1',
    name: ['Code shall conform to C90 (ISO 9899:1990)', '코드는 C90(ISO 9899:1990)을 따라야 합니다'],
    why: ['Features added after C90 or outside the standard behave differently across the compilers this standard targets.', 'C90 이후에 추가되었거나 표준 밖의 기능은 이 표준이 대상으로 하는 컴파일러마다 다르게 동작합니다.'],
    fix: ['Use only C90 constructs: declarations at the start of blocks, no long long, no designated initializers.', 'C90 구문만 사용하세요. 선언은 블록 시작에 두고 long long, 지정 초기화자를 쓰지 마세요.'],
    reuse: 'misra-c:1.1', check: c99Features,
  }),
  C04({
    id: '1.2', cat: 'R', dec: false, type: 'BUG', sev: 'CRITICAL', c2012: '1.3', cwe: 'CWE-758',
    name: ['No reliance on undefined or unspecified behaviour', '정의되지 않거나 지정되지 않은 동작에 의존하지 않아야 합니다'],
    why: ['Undefined behaviour makes the program meaningless; unspecified behaviour can change with the compiler.', '정의되지 않은 동작은 프로그램을 무의미하게 만들고, 지정되지 않은 동작은 컴파일러에 따라 바뀔 수 있습니다.'],
    fix: ['Rewrite the construct so its result is fully defined by the standard.', '결과가 표준에 의해 완전히 정의되도록 구문을 다시 작성하세요.'],
    reuse: 'misra-c:1.3',
  }),
  C04({
    id: '1.3', cat: 'R', manual: true,
    name: ['Mixed-language or multi-compiler code needs a defined interface', '여러 언어나 컴파일러로 만든 코드는 정의된 인터페이스가 필요합니다'],
    why: ['Object code from different compilers or languages may disagree on calling conventions and data layout.', '서로 다른 컴파일러나 언어의 목적 코드는 호출 규약과 데이터 배치가 다를 수 있습니다.'],
    fix: ['Document and verify the interface between the parts built with different tools.', '다른 도구로 만든 부분 사이의 인터페이스를 문서화하고 검증하세요.'],
  }),
  C04({
    id: '1.4', cat: 'R', manual: true,
    name: ['Check identifier significance of the compiler and linker', '컴파일러와 링커의 식별자 유효 길이를 확인해야 합니다'],
    why: ['The toolchain must distinguish external identifiers by at least 31 characters and by case.', '도구 체인은 외부 식별자를 최소 31자와 대소문자로 구별할 수 있어야 합니다.'],
    fix: ['Confirm the limits in the compiler and linker documentation and record them.', '컴파일러와 링커 문서에서 한계를 확인하고 기록하세요.'],
  }),
  C04({
    id: '1.5', cat: 'A', manual: true,
    name: ['Floating-point implementation should follow a defined standard', '부동소수점 구현은 정의된 표준을 따라야 합니다'],
    why: ['Without a defined floating-point model, rounding and range differ between targets.', '정의된 부동소수점 모델이 없으면 반올림과 범위가 대상마다 다릅니다.'],
    fix: ['Use an IEEE 754 implementation and document it.', 'IEEE 754 구현을 사용하고 문서화하세요.'],
  }),
];
