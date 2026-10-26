'use strict';

// MISRA C++:2008 chapter 0 — language independent issues.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');
const CP = require('../../lib/cpp');

const { cf, T } = U;
const P = U.P;

// Variables whose definition and uses add up to a single occurrence.
function singleUse(unit, api) {
  for (const v of U.get(unit, 'VarDecl')) {
    const s = v.symbol;
    if (!s || s.kind !== 'variable' || s.member || s.linkage === 'external') continue;
    const c = v.ctype && T.canonical(v.ctype);
    if (!c || !(c.kind === 'int' || c.kind === 'float' || c.kind === 'pointer' || c.kind === 'enum') || c.volatile) continue;
    if (s.decls && s.decls[0] !== v) continue;
    const st = (v.specs && v.specs.storage) || [];
    if (st.includes('extern')) continue;
    const n = (v.init ? 1 : 0) + (s.uses || []).length;
    if (n === 1) api.report(v.nameLoc || v, M(`Variable '${v.name}' has only one use.`, `변수 '${v.name}'의 사용이 한 번뿐입니다.`));
  }
}

// Does the function body have any effect outside the function?
function externalEffect(unit, fd) {
  let hit = false;
  const locals = new Set();
  cf.walk(fd.body, (n) => {
    if (hit) return cf.walk.STOP;
    if (n.type === 'VarDecl' && n.symbol) locals.add(n.symbol);
    if (['CallExpr', 'ThrowExpr', 'NewExpr', 'DeleteExpr', 'AsmStmt', 'StmtExpr'].includes(n.type)) { hit = true; return cf.walk.STOP; }
    if ((n.type === 'Identifier' || n.type === 'MemberExpr') && n.ctype && T.canonical(T.nonRef(n.ctype)).volatile) { hit = true; return cf.walk.STOP; }
    let target = null;
    if (n.type === 'AssignExpr') target = n.left;
    else if (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--')) target = n.arg;
    if (target) {
      const t = U.strip(target);
      if (!(t && t.type === 'Identifier' && t.symbol && (locals.has(t.symbol) || (t.symbol.kind === 'parameter' && T.canonical(t.symbol.type || T.T.unknown).kind !== 'reference')) && !t.implicitThis)) hit = true;
    }
    return undefined;
  });
  return hit;
}

function voidWithoutEffect(unit, api) {
  for (const fd of U.funcs(unit)) {
    if (fd.type !== 'FunctionDecl' || fd.isDefault || fd.isDeleted || CP.isSpecial(fd) || fd.name === 'main') continue;
    const ft = fd.ctype && T.canonical(fd.ctype);
    if (!ft || ft.kind !== 'function' || !T.isVoid(ft.ret)) continue;
    if (CP.isVirtual(unit, fd)) continue;
    if (!externalEffect(unit, fd)) api.report(fd.nameLoc || fd, M(`Void function '${fd.name}' has no external side effect.`, `void 함수 '${fd.name}'에 외부 부수 효과가 없습니다.`));
  }
}

// Defined functions that are never called or referenced anywhere in the project.
function neverCalled(project, api) {
  const used = new Set();
  const usedQ = new Set();
  for (const unit of project.units || []) {
    const u = P.usedSyms(unit);
    for (const s of u.syms) { used.add(s); if (s.qname) usedQ.add(s.qname); }
    for (const q of u.qnames) usedQ.add(q);
  }
  const seen = new Set();
  for (const unit of project.units || []) {
    for (const fd of U.funcs(unit)) {
      if (fd.type !== 'FunctionDecl' || !U.user(fd) || fd.name === 'main' || fd.isDefault || fd.isDeleted || CP.isSpecial(fd)) continue;
      const s = fd.symbol;
      if (!s) continue;
      const k = `${fd.loc.file}:${fd.loc.line}:${fd.loc.col}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (cf.enclosing(fd, 'TemplateDecl') || CP.isVirtual(unit, fd)) continue;
      const all = [s, s.overloadOf, ...(s.decls || []).map((d) => d.symbol)].filter(Boolean);
      if (all.some((x) => used.has(x) || (x.uses && x.uses.length) || usedQ.has(x.qname))) continue;
      api.report(fd.nameLoc ? { ...fd.nameLoc, file: fd.loc.file } : fd, M(`Function '${fd.name}' is defined but never called.`, `함수 '${fd.name}'가 정의되었지만 호출되지 않습니다.`));
    }
  }
}

function unusedParamsNonVirtual(unit, api) {
  for (const fd of U.funcs(unit)) {
    if (fd.type !== 'FunctionDecl' || fd.isDefault || fd.isDeleted || CP.isVirtual(unit, fd)) continue;
    (fd.params || []).forEach((p, i) => {
      if (p.ctype && T.isVoid(p.ctype) && !p.name) return;
      if (p.pack) return;
      const used = p.symbol && (p.symbol.uses || []).length;
      if (used) return;
      api.report(p.nameLoc ? { ...p.nameLoc, file: p.loc.file } : p, M(`Parameter ${p.name ? `'${p.name}'` : i + 1} of '${fd.name}' is never used.`, `'${fd.name}'의 매개변수 ${p.name ? `'${p.name}'` : i + 1}를 사용하지 않습니다.`));
    });
  }
}

// Virtual functions: a parameter unused by the function and every override in the unit.
function unusedParamsVirtual(unit, api) {
  const groups = new Map();
  for (const fd of U.get(unit, 'FunctionDecl')) {
    if (!CP.isVirtual(unit, fd)) continue;
    let root = fd;
    for (let i = 0; i < 20; i++) { const b = CP.overriddenBy(unit, root); if (!b || b === root) break; root = b; }
    const key = root.symbol || root;
    if (!groups.has(key)) groups.set(key, { root, defs: [] });
    if (fd.body) groups.get(key).defs.push(fd);
  }
  for (const { root, defs } of groups.values()) {
    if (!defs.length || !U.user(root)) continue;
    const n = (root.params || []).length;
    for (let i = 0; i < n; i++) {
      const anyUse = defs.some((d) => { const p = (d.params || [])[i]; return p && p.symbol && (p.symbol.uses || []).length; });
      if (anyUse) continue;
      const p = root.params[i];
      api.report(p.nameLoc ? { ...p.nameLoc, file: p.loc.file } : p, M(`Parameter ${i + 1} of virtual function '${root.name}' is unused in the function and all its overrides.`, `가상 함수 '${root.name}'의 매개변수 ${i + 1}를 함수와 모든 재정의에서 사용하지 않습니다.`));
    }
  }
}

const DOC = (id, name, why, fix) => CPP08({ id, cat: 'D', manual: true, name, why, fix });

module.exports = [
  CPP08({
    id: '0-1-1', cat: 'R', dec: false, cpp2023: '0.0.1', cwe: 'CWE-561',
    name: ['A project shall not contain unreachable code', '프로젝트에 도달할 수 없는 코드가 없어야 합니다'],
    why: ['Unreachable statements are useless or reveal a control-flow error.', '도달할 수 없는 문은 쓸모없거나 제어 흐름 오류를 드러냅니다.'],
    fix: ['Remove the statements or correct the logic that skips them.', '문을 지우거나 그 문을 건너뛰는 논리를 고치세요.'],
    reuse: 'misra-cpp:0.0.1',
  }),
  CPP08({
    id: '0-1-2', cat: 'R', dec: false, cpp2023: '0.0.2', cwe: 'CWE-570',
    name: ['A project shall not contain infeasible paths', '프로젝트에 실행 불가능한 경로가 없어야 합니다'],
    why: ['A condition that never changes makes one branch impossible.', '바뀌지 않는 조건은 한 분기를 불가능하게 만듭니다.'],
    fix: ['Remove the invariant test or fix the condition.', '변하지 않는 검사를 없애거나 조건을 고치세요.'],
    reuse: 'misra-cpp:0.0.2',
  }),
  CPP08({
    id: '0-1-3', cat: 'R', dec: true, cpp2023: '0.2.1', cwe: 'CWE-563',
    name: ['A project shall not contain unused variables', '프로젝트에 사용하지 않는 변수가 없어야 합니다'],
    why: ['An unused variable is dead code or a sign of a missing use.', '사용하지 않는 변수는 죽은 코드이거나 빠진 사용의 신호입니다.'],
    fix: ['Remove the variable or use it as intended.', '변수를 지우거나 의도대로 사용하세요.'],
    reuse: 'misra-cpp:0.2.1',
  }),
  CPP08({
    id: '0-1-4', cat: 'R', dec: true, cwe: 'CWE-563',
    name: ['Non-volatile POD variables shall have more than one use', 'volatile이 아닌 POD 변수는 두 번 이상 사용해야 합니다'],
    why: ['A variable that is only set or only read once does not carry a value anywhere.', '한 번만 설정되거나 한 번만 읽히는 변수는 값을 어디에도 전달하지 않습니다.'],
    fix: ['Remove the variable or complete the missing set or use.', '변수를 지우거나 빠진 설정이나 사용을 채우세요.'],
    check: singleUse,
  }),
  CPP08({
    id: '0-1-5', cat: 'R', dec: true, cpp2023: '0.2.3', cwe: 'CWE-1164',
    name: ['A project shall not contain unused type declarations', '프로젝트에 사용하지 않는 형식 선언이 없어야 합니다'],
    why: ['Unused types are clutter that readers must still understand.', '사용하지 않는 형식은 읽는 사람이 여전히 이해해야 하는 군더더기입니다.'],
    fix: ['Remove the declaration.', '선언을 지우세요.'],
    reuse: 'misra-cpp:0.2.3',
  }),
  CPP08({
    id: '0-1-6', cat: 'R', dec: false, cpp2023: '0.1.1', cwe: 'CWE-563',
    name: ['Values assigned to variables shall be used', '변수에 대입한 값은 사용해야 합니다'],
    why: ['A value that is overwritten or discarded without being read is a dead store.', '읽히지 않고 덮어쓰이거나 버려지는 값은 죽은 저장입니다.'],
    fix: ['Remove the assignment or use the value.', '대입을 지우거나 값을 사용하세요.'],
    reuse: 'misra-cpp:0.1.1',
  }),
  CPP08({
    id: '0-1-7', cat: 'R', dec: true, cpp2023: '0.1.2', cwe: 'CWE-252',
    name: ['The value returned by a non-void function shall be used', 'void가 아닌 함수의 반환 값은 사용해야 합니다'],
    why: ['Ignoring a result may lose an error indication or other information.', '결과를 무시하면 오류 표시나 다른 정보를 잃을 수 있습니다.'],
    fix: ['Use the value, or cast the call to void to show it is deliberately ignored.', '값을 사용하거나 일부러 무시한다면 호출을 void로 캐스트하세요.'],
    reuse: 'misra-cpp:0.1.2',
  }),
  CPP08({
    id: '0-1-8', cat: 'R', dec: false,
    name: ['A void function shall have an external side effect', 'void 함수는 외부 부수 효과가 있어야 합니다'],
    why: ['A void function that changes nothing outside itself does no useful work.', '자기 밖의 아무것도 바꾸지 않는 void 함수는 쓸모 있는 일을 하지 않습니다.'],
    fix: ['Remove the function or make it produce its intended effect.', '함수를 지우거나 의도한 효과를 내도록 하세요.'],
    check: voidWithoutEffect,
  }),
  CPP08({
    id: '0-1-9', cat: 'R', dec: false, c2012: '2.2', cwe: 'CWE-1164',
    name: ['There shall be no dead code', '죽은 코드가 없어야 합니다'],
    why: ['Operations whose removal would not change the behaviour hide the intent.', '없애도 동작이 바뀌지 않는 연산은 의도를 숨깁니다.'],
    fix: ['Remove the operation.', '연산을 지우세요.'],
    reuse: 'misra-c:2.2',
  }),
  CPP08({
    id: '0-1-10', cat: 'R', dec: true, cwe: 'CWE-561',
    name: ['Every defined function shall be called at least once', '정의된 모든 함수는 한 번 이상 호출되어야 합니다'],
    why: ['A function that is never called is untested dead code.', '호출되지 않는 함수는 시험되지 않은 죽은 코드입니다.'],
    fix: ['Remove the function or call it where it is needed.', '함수를 지우거나 필요한 곳에서 호출하세요.'],
    project: neverCalled,
  }),
  CPP08({
    id: '0-1-11', cat: 'R', dec: true, cwe: 'CWE-563',
    name: ['Non-virtual functions shall have no unused parameters', '가상이 아닌 함수에 사용하지 않는 매개변수가 없어야 합니다'],
    why: ['An unused parameter means the interface asks for data the function ignores.', '사용하지 않는 매개변수는 인터페이스가 함수가 무시하는 데이터를 요구한다는 뜻입니다.'],
    fix: ['Remove the parameter from the function.', '함수에서 매개변수를 없애세요.'],
    check: unusedParamsNonVirtual,
  }),
  CPP08({
    id: '0-1-12', cat: 'R', dec: true, cwe: 'CWE-563',
    name: ['A virtual function parameter shall be used by at least one override', '가상 함수 매개변수는 적어도 하나의 재정의에서 사용해야 합니다'],
    why: ['A parameter no implementation in the hierarchy uses is a redundant part of the interface.', '계층의 어떤 구현도 쓰지 않는 매개변수는 인터페이스의 불필요한 부분입니다.'],
    fix: ['Remove the parameter from the whole hierarchy.', '계층 전체에서 매개변수를 없애세요.'],
    check: unusedParamsVirtual,
  }),
  CPP08({
    id: '0-2-1', cat: 'R', dec: false, type: 'BUG', cpp2023: '8.18.1', c2012: '19.1',
    name: ['An object shall not be assigned to an overlapping object', '객체를 겹치는 객체에 대입하지 않아야 합니다'],
    why: ['Copying between overlapping objects has undefined behaviour.', '겹치는 객체 사이의 복사는 정의되지 않은 동작입니다.'],
    fix: ['Copy through a temporary or use std::memmove.', '임시 객체를 거쳐 복사하거나 std::memmove를 사용하세요.'],
    reuse: 'misra-cpp:8.18.1',
  }),
  DOC('0-3-1', ['Run-time failures shall be minimised by analysis and checks', '분석과 검사로 실행 시간 오류를 최소화해야 합니다'],
    ['Division by zero, overflow and bad pointers must be prevented by design.', '0으로 나누기, 넘침, 잘못된 포인터는 설계로 막아야 합니다.'],
    ['Document the static analysis, defensive checks and tests that cover run-time failures.', '실행 시간 오류를 다루는 정적 분석, 방어 검사, 시험을 문서화하세요.']),
  CPP08({
    id: '0-3-2', cat: 'R', dec: false, c2012: 'dir-4.7', cwe: 'CWE-252',
    name: ['Error information returned by a function shall be tested', '함수가 반환한 오류 정보를 검사해야 합니다'],
    why: ['Ignoring an error result lets the program continue in a bad state.', '오류 결과를 무시하면 프로그램이 잘못된 상태로 계속됩니다.'],
    fix: ['Check the returned value before going on.', '진행하기 전에 반환 값을 검사하세요.'],
    reuse: 'misra-c:dir-4.7',
  }),
  DOC('0-4-1', ['Scaled-integer and fixed-point arithmetic shall be documented', '스케일 정수와 고정 소수점 연산은 문서화해야 합니다'],
    ['The scaling and range of fixed-point values are not visible in the code.', '고정 소수점 값의 스케일과 범위는 코드에 드러나지 않습니다.'],
    ['Record the representation, scaling and overflow handling.', '표현 방식, 스케일, 넘침 처리를 기록하세요.']),
  DOC('0-4-2', ['Use of floating-point arithmetic shall be documented', '부동소수점 연산의 사용은 문서화해야 합니다'],
    ['Floating-point code has rounding, range and NaN issues that need a rationale.', '부동소수점 코드에는 근거가 필요한 반올림, 범위, NaN 문제가 있습니다.'],
    ['Document where and why floating point is used and how errors are bounded.', '부동소수점을 어디서 왜 쓰는지, 오차를 어떻게 제한하는지 문서화하세요.']),
  DOC('0-4-3', ['Floating-point implementations shall follow a defined standard', '부동소수점 구현은 정의된 표준을 따라야 합니다'],
    ['Without a defined model results differ between targets.', '정의된 모델이 없으면 결과가 대상마다 다릅니다.'],
    ['Use and document an IEEE 754 conforming implementation.', 'IEEE 754를 따르는 구현을 사용하고 문서화하세요.']),
];
