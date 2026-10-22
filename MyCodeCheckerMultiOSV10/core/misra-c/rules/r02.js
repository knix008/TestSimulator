'use strict';

// MISRA C:2012 / 2023 chapter 2: unused code.

const U = require('../lib/a-util');
const F = require('../lib/a-flow');
const { cf, meta, msg } = U;

function r21(unit, api) {
  for (const fn of cf.functionsOf(unit)) {
    if (!U.userLoc(fn)) continue;
    let g;
    try { g = cf.getCFG(fn); } catch (_) { continue; }
    for (const { nodes } of g.unreachable()) {
      const n = (nodes || []).find((x) => x && U.userLoc(x) && x.type !== 'NullStmt');
      if (!n) continue;
      api.report(n, msg(`Code in function '${fn.name}' can never be reached.`, `함수 '${fn.name}'의 코드에 절대 도달할 수 없습니다.`));
    }
  }
}

function hasSideEffect(e) {
  let found = false;
  cf.walk(e, (n) => {
    if (found) return cf.walk.STOP;
    switch (n.type) {
      case 'AssignExpr': case 'CallExpr': case 'StmtExpr': case 'AsmStmt': case 'VaArgExpr':
        found = true; return cf.walk.STOP;
      case 'UnaryExpr':
        if (n.op === '++' || n.op === '--') { found = true; return cf.walk.STOP; }
        break;
      case 'SizeofExpr': case 'AlignofExpr':
        return cf.walk.SKIP;
      default:
        break;
    }
    if ((n.type === 'Identifier' || n.type === 'MemberExpr' || n.type === 'IndexExpr' || (n.type === 'UnaryExpr' && n.op === '*')) && n.ctype && U.quals(n.ctype).volatile) {
      found = true; return cf.walk.STOP;
    }
    return undefined;
  });
  return found;
}

function r22(unit, api) {
  for (const s of U.nodes(unit, 'ExprStmt')) {
    const e = s.expr;
    if (!e) continue;
    const x = U.skip(e);
    if (x.type === 'CastExpr' && x.typeName && U.canon(x.typeName.ctype) && U.canon(x.typeName.ctype).kind === 'void') continue;
    if (hasSideEffect(e)) continue;
    api.report(s, msg(`Statement '${U.code(unit, e)}' has no effect.`, `문 '${U.code(unit, e)}'는 아무 효과가 없습니다.`));
  }
  for (const fn of cf.functionsOf(unit)) {
    if (!U.userLoc(fn)) continue;
    for (const d of F.deadStores(unit, fn)) {
      api.report(d.node.type === 'VarDecl' ? d.node.nameLoc || d.node : d.node, msg(
        `The value stored in '${d.sym.name}' here is never used in function '${fn.name}'.`,
        `여기서 '${d.sym.name}'에 저장한 값은 함수 '${fn.name}'에서 사용되지 않습니다.`));
    }
  }
}

// all user symbols of a kind in the project, grouped by declaration identity
function grouped(project, pred) {
  const m = new Map();
  for (const u of project.units) {
    for (const s of u.symbols) {
      if (!pred(s) || !U.isUserSym(s)) continue;
      const k = U.symKey(s);
      let e = m.get(k);
      if (!e) m.set(k, (e = { sym: s, syms: [], unit: u }));
      e.syms.push(s);
    }
  }
  return m;
}

function r23(project, api) {
  for (const e of grouped(project, (s) => s.kind === 'typedef').values()) {
    if (e.syms.some((s) => s.uses && s.uses.length)) continue;
    api.report(U.symLoc(e.sym), msg(`Type '${e.sym.name}' is declared but never used.`, `타입 '${e.sym.name}'를 선언했지만 사용하지 않습니다.`));
  }
}

function tagRefs(project) {
  const used = new Set();
  for (const u of project.units) {
    for (const r of U.nodes(u, 'RecordDecl', 'EnumDecl')) {
      if (!r.symbol || r.isDefinition) continue;
      // `struct S;` on its own declares, it does not use
      const ds = cf.parentOf(r);
      const decl = ds && ds.type === 'DeclSpec' ? cf.parentOf(ds) : null;
      if (decl && decl.type === 'Declaration' && !decl.declarators.length) continue;
      used.add(U.symKey(r.symbol));
    }
  }
  return used;
}

function r24(project, api) {
  const used = tagRefs(project);
  for (const [k, e] of grouped(project, (s) => s.kind === 'tag' && s.name)) {
    if (used.has(k)) continue;
    const d = e.sym.decls && e.sym.decls[0];
    api.report(d && (d.nameLoc || d.loc), msg(`Tag '${e.sym.name}' is declared but never used.`, `태그 '${e.sym.name}'를 선언했지만 사용하지 않습니다.`));
  }
}

function r25(project, api) {
  const defs = new Map();
  const refNames = new Set();
  for (const u of project.units) {
    for (const m of u.macros || []) {
      if (U.isBuiltin(m.file) || m.predefined || m.commandLine) continue;
      const k = `${m.name}|${m.file}:${m.line}`;
      let e = defs.get(k);
      if (!e) defs.set(k, (e = { m, count: 0 }));
      e.count += m.expansionCount || 0;
    }
    for (const d of u.directives || []) {
      if (d.kind === 'define' || d.kind === 'undef') continue;
      if (d.macro) refNames.add(d.macro);
      for (const x of d.defined || []) refNames.add(x.name);
    }
    for (const x of u.expansions || []) if (x.name) refNames.add(`#exp:${x.def ? `${x.def.file}:${x.def.line}` : ''}|${x.name}`);
  }
  for (const e of defs.values()) {
    if (e.count > 0 || refNames.has(e.m.name) || refNames.has(`#exp:${e.m.file}:${e.m.line}|${e.m.name}`)) continue;
    api.report({ file: e.m.file, line: e.m.line, col: e.m.col }, msg(`Macro '${e.m.name}' is defined but never used.`, `매크로 '${e.m.name}'를 정의했지만 사용하지 않습니다.`));
  }
}

function r26(unit, api) {
  for (const l of U.nodes(unit, 'LabelStmt')) {
    const s = l.symbol;
    if (s && s.uses && s.uses.length) continue;
    api.report(l, msg(`Label '${l.label}' is never used.`, `레이블 '${l.label}'를 사용하지 않습니다.`));
  }
}

function r27(unit, api) {
  for (const fn of cf.functionsOf(unit)) {
    if (!U.userLoc(fn)) continue;
    for (const p of fn.params || []) {
      if (!p.name || !p.symbol || (p.symbol.uses && p.symbol.uses.length)) continue;
      api.report(p.nameLoc || p, msg(`Parameter '${p.name}' of function '${fn.name}' is never used.`, `함수 '${fn.name}'의 매개변수 '${p.name}'를 사용하지 않습니다.`));
    }
  }
}

function r28(project, api) {
  const ext = new Map();
  for (const u of project.units) {
    for (const s of u.symbols) {
      if (s.kind !== 'variable' || !U.isUserSym(s) || s.predefined) continue;
      if (s.linkage === 'external') {
        let e = ext.get(s.qname);
        if (!e) ext.set(s.qname, (e = { sym: null, used: false }));
        if (s.uses && s.uses.length) e.used = true;
        if (s.definition && !e.sym) e.sym = s;
        continue;
      }
      if (s.uses && s.uses.length) continue;
      if (!s.definition && s.linkage !== 'none') continue;
      const d = s.definition || s.decls[0];
      api.report(d && (d.nameLoc || d.loc), msg(`Object '${s.name}' is defined but never used.`, `객체 '${s.name}'를 정의했지만 사용하지 않습니다.`));
    }
  }
  for (const e of ext.values()) {
    if (e.used || !e.sym) continue;
    const d = e.sym.definition;
    api.report(d && (d.nameLoc || d.loc), msg(`Object '${e.sym.name}' with external linkage is defined but never used in the project.`, `외부 링크 객체 '${e.sym.name}'를 정의했지만 프로젝트에서 사용하지 않습니다.`));
  }
}

const B = { cat: 'A', sev: 'MINOR', debt: 5, dec: true };
module.exports = [
  { meta: meta('2.1', { cat: 'R', type: 'BUG', sev: 'MAJOR', debt: 10, dec: false, cwe: ['CWE-561'], cert: 'MSC12-C', name: ['Unreachable code', '도달할 수 없는 코드'],
    why: ['Code that can never execute usually reveals a logic error, and it wastes review and test effort.', '실행될 수 없는 코드는 대개 논리 오류를 드러내며 검토와 시험 노력을 낭비합니다.'],
    fix: ['Remove the unreachable code or fix the control flow that makes it unreachable.', '도달할 수 없는 코드를 지우거나 원인이 된 흐름을 고치세요.'] }), check: r21 },
  { meta: meta('2.2', { cat: 'R', sev: 'MAJOR', debt: 5, dec: false, cwe: ['CWE-561', 'CWE-563'], cert: 'MSC12-C', name: ['Dead code', '죽은 코드'],
    why: ['Operations whose removal would not change behaviour, such as statements without effect or stores that are never read, point to mistakes.', '없애도 동작이 바뀌지 않는 연산(효과 없는 문, 읽히지 않는 저장)은 실수를 가리킵니다.'],
    fix: ['Remove the operation, or use its result as intended.', '연산을 없애거나 의도대로 결과를 사용하세요.'] }), check: r22 },
  { meta: meta('2.3', { ...B, name: ['Unused type declaration', '사용하지 않는 타입 선언'],
    why: ['An unused typedef may mean that code using it was removed or forgotten.', '사용하지 않는 typedef는 이를 쓰던 코드가 지워졌거나 빠졌다는 뜻일 수 있습니다.'],
    fix: ['Remove the typedef.', 'typedef를 지우세요.'] }), project: r23 },
  { meta: meta('2.4', { ...B, name: ['Unused tag declaration', '사용하지 않는 태그 선언'],
    why: ['A tag that is never referenced is clutter and may hide an incomplete change.', '참조하지 않는 태그는 군더더기이며 덜 끝난 변경을 숨길 수 있습니다.'],
    fix: ['Remove the tag name (keep an anonymous type if a typedef names it).', '태그 이름을 지우세요(typedef가 이름을 주면 익명 타입으로 두세요).'] }), project: r24 },
  { meta: meta('2.5', { ...B, name: ['Unused macro definition', '사용하지 않는 매크로 정의'],
    why: ['A macro that is never expanded or tested is clutter and may indicate a forgotten feature.', '확장되거나 검사되지 않는 매크로는 군더더기이며 잊힌 기능을 뜻할 수 있습니다.'],
    fix: ['Remove the macro.', '매크로를 지우세요.'] }), project: r25 },
  { meta: meta('2.6', { ...B, name: ['Unused label', '사용하지 않는 레이블'],
    why: ['A label with no goto is confusing and may show that a jump was removed by mistake.', 'goto가 없는 레이블은 혼란스럽고 점프가 실수로 지워졌음을 뜻할 수 있습니다.'],
    fix: ['Remove the label.', '레이블을 지우세요.'] }), check: r26 },
  { meta: meta('2.7', { ...B, name: ['Unused function parameter', '사용하지 않는 함수 매개변수'],
    why: ['An unused parameter often means the function does not do what its interface promises.', '사용하지 않는 매개변수는 함수가 인터페이스의 약속대로 동작하지 않는다는 뜻인 경우가 많습니다.'],
    fix: ['Use the parameter, remove it, or leave it unnamed when an interface requires it.', '매개변수를 사용하거나 지우고, 인터페이스상 필요하면 이름을 빼세요.'] }), check: r27 },
  { meta: meta('2.8', { ...B, amendment: 'AMD3', cwe: ['CWE-563'], name: ['Unused object definition', '사용하지 않는 객체 정의'],
    why: ['An object that is never used wastes memory and may reveal a missing piece of logic.', '사용하지 않는 객체는 메모리를 낭비하고 빠진 로직을 드러낼 수 있습니다.'],
    fix: ['Remove the object or use it as intended.', '객체를 지우거나 의도대로 사용하세요.'] }), project: r28 },
];
