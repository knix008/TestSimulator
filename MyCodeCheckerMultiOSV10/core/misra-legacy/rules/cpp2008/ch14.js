'use strict';

// MISRA C++:2008 chapter 14 — templates.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');
const CP = require('../../lib/cpp');

const { cf, T } = U;
const P = U.P;
const X = CP.X;

// The function or record declared by a template declaration.
function inner(td) {
  const d = td && td.decl;
  if (!d) return null;
  if (d.type === 'Declaration') {
    const f = (d.declarators || []).find((x) => x.type === 'FunctionDecl');
    if (f) return { kind: 'function', node: f };
    const ts = d.specs && d.specs.typeSpec;
    if (ts && ts.type === 'RecordDecl') return { kind: 'record', node: ts };
    return null;
  }
  if (d.type === 'TemplateDecl') return inner(d);
  return null;
}

const typeParams = (td) => new Set((td.params || []).filter((p) => p.kind === 'type' && p.name).map((p) => p.name));

// Is parameter `p` of plain generic type T, T&, const T& or T&&?
function genericParam(p, names) {
  const ts = p.specs && p.specs.typeSpec;
  if (!ts || ts.type !== 'NamedType' || !names.has(ts.name) || ts.templateArgs) return false;
  let d = p.declarator;
  while (d && d.type === 'ReferenceDeclarator') d = d.inner;
  return !d || d.type === 'IdentDeclarator' || d.type === 'AbstractDeclarator';
}

function templates(unit) { return U.get(unit, 'TemplateDecl'); }

function associatedNamespace(unit, api) {
  for (const td of templates(unit)) {
    if (td.isSpecialization || td.instantiation) continue;
    const it = inner(td);
    if (!it || it.kind !== 'function' || cf.enclosing(td, 'RecordDecl')) continue;
    const names = typeParams(td);
    if (!(it.node.params || []).some((p) => genericParam(p, names))) continue;
    const ns = cf.enclosing(td, ['NamespaceDecl', 'TranslationUnit']);
    const decls = ns ? (ns.decls || []) : [];
    const hasClass = decls.some((d) => d !== td && ((d.type === 'Declaration' && d.specs && d.specs.typeSpec && d.specs.typeSpec.type === 'RecordDecl' && d.specs.typeSpec.isDefinition && U.user(d))
      || (d.type === 'TemplateDecl' && inner(d) && inner(d).kind === 'record')));
    if (hasClass) api.report(it.node.nameLoc || it.node, M(`Generic function '${it.node.name}' is declared in a namespace that also declares class types.`, `일반화 함수 '${it.node.name}'를 클래스 형식도 선언하는 네임스페이스에 선언했습니다.`));
  }
}

function templateMember(unit, api, kind) {
  for (const rd of P.ix(unit).records) {
    const rec = U.canon(rd.ctype);
    const cls = rd.name;
    let hasTemplate = null;
    for (const m of rd.members || []) {
      if (m.type !== 'TemplateDecl') continue;
      const it = inner(m);
      if (!it || it.kind !== 'function') continue;
      const f = it.node;
      const isTarget = kind === 'ctor' ? (f.isConstructor || f.name === cls) : f.name === 'operator=';
      if (!isTarget || (f.params || []).length !== 1) continue;
      if (genericParam(f.params[0], typeParams(m))) hasTemplate = f;
    }
    if (!hasTemplate) continue;
    const special = kind === 'ctor' ? 'copyCtor' : 'copyAssign';
    const declared = P.methods(rec).some((m) => !m.template && P.specialKind(m.node, cls) === special);
    if (!declared) api.report(hasTemplate.nameLoc || hasTemplate, M(`'${cls}' has a template ${kind === 'ctor' ? 'constructor' : 'assignment operator'} with a generic parameter but no user-declared copy ${kind === 'ctor' ? 'constructor' : 'assignment operator'}.`,
      `'${cls}'에 일반화 매개변수를 갖는 템플릿 ${kind === 'ctor' ? '생성자' : '대입 연산자'}가 있지만 사용자가 선언한 복사 ${kind === 'ctor' ? '생성자' : '대입 연산자'}가 없습니다.`));
  }
}

function neverInstantiated(project, api) {
  const usedQ = new Set();
  const usedS = new Set();
  for (const unit of project.units || []) {
    const u = P.usedSyms(unit);
    for (const q of u.qnames) usedQ.add(q);
    for (const s of u.syms) usedS.add(s);
  }
  const seen = new Set();
  for (const unit of project.units || []) {
    for (const td of templates(unit)) {
      if (td.isSpecialization || td.instantiation || cf.enclosing(td, 'TemplateDecl')) continue;
      const it = inner(td);
      if (!it) continue;
      const n = it.node;
      const s = n.symbol;
      const k = `${n.loc.file}:${n.loc.line}:${n.loc.col}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (it.kind === 'record' && !n.isDefinition) continue;
      if (it.kind === 'function' && cf.enclosing(td, 'RecordDecl') && CP.isSpecial(n)) continue;
      const q = (s && s.qname) || n.qname || n.name;
      if ((s && ((s.uses || []).length || usedS.has(s))) || usedQ.has(q)) continue;
      api.report(n.nameLoc ? { ...n.nameLoc, file: n.loc.file } : n, M(`Template '${n.name}' is never instantiated.`, `템플릿 '${n.name}'가 한 번도 인스턴스화되지 않습니다.`));
    }
  }
}

function specializationFile(project, api) {
  for (const unit of project.units || []) {
    for (const td of templates(unit)) {
      const it = inner(td);
      if (!it) continue;
      const partial = it.kind === 'record' && it.node.templateArgs && !td.isSpecialization;
      if (!td.isSpecialization && !partial) continue;
      const name = it.node.name;
      const primary = unit.symbols.find((s) => s.name === name && (s.kind === 'tag' || s.kind === 'function') && (s.decls || []).some((d) => cf.enclosing(d, 'TemplateDecl') && !(cf.enclosing(d, 'TemplateDecl').isSpecialization)));
      const pd = primary && (primary.decls || []).find((d) => { const t = cf.enclosing(d, 'TemplateDecl'); return t && !t.isSpecialization && !(d.templateArgs); });
      if (!pd || !pd.loc || pd.loc.file === td.loc.file) continue;
      if (!U.user(td) || !U.firstScan(api, 'cpp08-14-7-3', `${td.loc.file}:${td.loc.line}`)) continue;
      api.report(td, M(`The specialization of '${name}' is not in the file of its primary template (${pd.loc.file}).`, `'${name}'의 특수화가 기본 템플릿 파일(${pd.loc.file})에 있지 않습니다.`));
    }
  }
}

// function templates and plain functions of the unit, by qualified name
function fnKinds(unit) {
  return U.memo(unit, 'legacy.fnKinds', () => {
    const m = new Map();
    for (const f of U.get(unit, 'FunctionDecl')) {
      if (cf.enclosing(f, 'RecordDecl')) continue;
      const q = String(f.qname || f.name || '').replace(/^::/, '');
      if (!m.has(q)) m.set(q, { templates: new Set(), plain: new Set(), specs: [] });
      const e = m.get(q);
      const td = cf.enclosing(f, 'TemplateDecl');
      const sig = `${(f.params || []).map((p) => U.tstr(p.ctype)).join(',')}|${td ? (td.params || []).length : 0}`;
      if (td && td.isSpecialization) e.specs.push(f);
      else if (td) e.templates.add(sig);
      else e.plain.add(sig);
    }
    return m;
  });
}

function overloadedSpecialization(unit, api) {
  for (const [q, e] of fnKinds(unit)) {
    if (!e.specs.length) continue;
    if (e.templates.size + e.plain.size < 2) continue;
    for (const f of e.specs) api.report(f.nameLoc || f, M(`The overloaded function template '${q}' is explicitly specialized.`, `오버로드된 함수 템플릿 '${q}'를 명시적으로 특수화했습니다.`));
  }
}

function mixedViableSet(unit, api) {
  const kinds = fnKinds(unit);
  for (const c of U.get(unit, 'CallExpr')) {
    const cal = U.strip(c.callee);
    if (!cal || cal.type !== 'Identifier') continue;
    const s = c.calleeSymbol || cal.symbol;
    const q = String((s && s.qname) || cal.qname || cal.name || '').replace(/^::/, '');
    const e = kinds.get(q);
    if (!e || !e.templates.size || !e.plain.size) continue;
    api.report(c, M(`The call to '${q}' can select both a template specialization and a non-template function.`, `'${q}' 호출이 템플릿 특수화와 비템플릿 함수를 모두 선택할 수 있습니다.`));
  }
}

module.exports = [
  CPP08({
    id: '14-5-1', cat: 'R', dec: true,
    name: ['A generic non-member function shall not be in an associated namespace', '일반화 비멤버 함수는 연관 네임스페이스에 있으면 안 됩니다'],
    why: ['Argument-dependent lookup may pick the generic function instead of the intended one.', '인수 의존 조회가 의도한 함수 대신 일반화 함수를 고를 수 있습니다.'],
    fix: ['Move the generic function to a namespace without class types.', '일반화 함수를 클래스 형식이 없는 네임스페이스로 옮기세요.'],
    check: associatedNamespace,
  }),
  CPP08({
    id: '14-5-2', cat: 'R', dec: true,
    name: ['A copy constructor shall be declared when there is a generic template constructor', '일반화 템플릿 생성자가 있으면 복사 생성자를 선언해야 합니다'],
    why: ['A template constructor is never a copy constructor, so the implicit one is still generated.', '템플릿 생성자는 복사 생성자가 아니므로 암시적 복사 생성자가 여전히 만들어집니다.'],
    fix: ['Declare the copy constructor explicitly.', '복사 생성자를 명시적으로 선언하세요.'],
    check(unit, api) { templateMember(unit, api, 'ctor'); },
  }),
  CPP08({
    id: '14-5-3', cat: 'R', dec: true,
    name: ['A copy assignment shall be declared when there is a generic template assignment', '일반화 템플릿 대입 연산자가 있으면 복사 대입 연산자를 선언해야 합니다'],
    why: ['A template assignment operator never suppresses the implicit copy assignment.', '템플릿 대입 연산자는 암시적 복사 대입을 막지 않습니다.'],
    fix: ['Declare the copy assignment operator explicitly.', '복사 대입 연산자를 명시적으로 선언하세요.'],
    check(unit, api) { templateMember(unit, api, 'assign'); },
  }),
  CPP08({
    id: '14-6-1', cat: 'R', dec: true, cpp2023: '6.4.3',
    name: ['Names from a dependent base shall be qualified or used with this->', '종속 기반 클래스의 이름은 한정하거나 this->로 사용해야 합니다'],
    why: ['Unqualified lookup ignores dependent bases and may find another entity.', '한정되지 않은 조회는 종속 기반을 무시하고 다른 개체를 찾을 수 있습니다.'],
    fix: ['Write this->name or Base<T>::name.', 'this->name이나 Base<T>::name으로 쓰세요.'],
    reuse: 'misra-cpp:6.4.3',
  }),
  CPP08({
    id: '14-6-2', cat: 'R', manual: true,
    name: ['Overload resolution shall pick a function declared earlier in the unit', '오버로드 해석은 단위 앞쪽에 선언된 함수를 골라야 합니다'],
    why: ['Functions declared after the template definition may be found only at instantiation.', '템플릿 정의 뒤에 선언된 함수는 인스턴스화할 때만 찾아질 수 있습니다.'],
    fix: ['Declare the called functions before the template.', '호출되는 함수를 템플릿보다 먼저 선언하세요.'],
  }),
  CPP08({
    id: '14-7-1', cat: 'R', dec: true, cwe: 'CWE-561',
    name: ['Every template shall be instantiated at least once', '모든 템플릿은 한 번 이상 인스턴스화되어야 합니다'],
    why: ['An uninstantiated template is never compiled in full and may hide errors.', '인스턴스화되지 않은 템플릿은 완전히 컴파일되지 않아 오류를 숨길 수 있습니다.'],
    fix: ['Use the template or remove it.', '템플릿을 사용하거나 지우세요.'],
    project: neverInstantiated,
  }),
  CPP08({
    id: '14-7-2', cat: 'R', manual: true,
    name: ['Explicit instantiation of a specialization shall not make the program ill-formed', '특수화의 명시적 인스턴스화가 프로그램을 잘못된 형식으로 만들면 안 됩니다'],
    why: ['Members that are valid only for some arguments may break when fully instantiated.', '일부 인수에서만 유효한 멤버는 완전히 인스턴스화하면 깨질 수 있습니다.'],
    fix: ['Check that every member compiles for the arguments used.', '사용하는 인수에 대해 모든 멤버가 컴파일되는지 확인하세요.'],
  }),
  CPP08({
    id: '14-7-3', cat: 'R', dec: true,
    name: ['Specializations shall be declared in the file of the primary template', '특수화는 기본 템플릿이 있는 파일에 선언해야 합니다'],
    why: ['A specialization not visible at the point of use gives undefined behaviour.', '사용 지점에서 보이지 않는 특수화는 정의되지 않은 동작을 일으킵니다.'],
    fix: ['Move the specialization next to the primary template.', '특수화를 기본 템플릿 옆으로 옮기세요.'],
    project: specializationFile,
  }),
  CPP08({
    id: '14-8-1', cat: 'R', dec: true, cpp2023: '17.8.1',
    name: ['Overloaded function templates shall not be explicitly specialized', '오버로드된 함수 템플릿을 명시적으로 특수화하지 않아야 합니다'],
    why: ['Specializations do not take part in overload resolution, so the wrong overload may be called.', '특수화는 오버로드 해석에 참여하지 않아 엉뚱한 오버로드가 호출될 수 있습니다.'],
    fix: ['Add a plain overload instead of the specialization.', '특수화 대신 일반 오버로드를 추가하세요.'],
    check: overloadedSpecialization,
  }),
  CPP08({
    id: '14-8-2', cat: 'A', dec: true,
    name: ['A call should not mix template and non-template candidates', '호출의 후보에 템플릿과 비템플릿을 섞지 않아야 합니다'],
    why: ['Readers cannot easily tell which function overload resolution will pick.', '읽는 사람이 오버로드 해석이 어떤 함수를 고를지 쉽게 알 수 없습니다.'],
    fix: ['Provide only templates or only plain functions for the name.', '이름마다 템플릿만 또는 일반 함수만 제공하세요.'],
    check: mixedViableSet,
  }),
];
