'use strict';

// AUTOSAR C++14 chapter 14 — templates (template constructors, generic
// operators, specializations) and MISRA C++:2008 M14 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

// Template declarations: primaries and specializations.
function templates(unit) {
  return U.memo(unit, 'autosar.templates', () => {
    const primaries = new Map(); // name -> TemplateDecl
    const specs = [];
    for (const td of U.ix(unit).get('TemplateDecl')) {
      const d = td.decl;
      if (!d || d.type !== 'Declaration') continue;
      const ts = d.specs && d.specs.typeSpec;
      let name = null;
      let isSpec = !!td.isSpecialization;
      if (!d.declarators.length && ts && ts.type === 'RecordDecl' && ts.name) { name = ts.name; if (ts.templateArgs) isSpec = true; }
      else if (d.declarators.length === 1 && d.declarators[0].type === 'FunctionDecl') name = d.declarators[0].name;
      if (!name || td.instantiation) continue;
      if (isSpec) specs.push({ td, name, rd: ts && ts.type === 'RecordDecl' ? ts : null });
      else if (!primaries.has(name)) primaries.set(name, td);
    }
    return { primaries, specs };
  });
}

// Names of user types declared in a file.
function typesDeclaredIn(unit, file) {
  const out = new Set();
  for (const r of U.ix(unit).get('RecordDecl', 'EnumDecl')) if (r.name && r.loc.file === file) out.add(r.name);
  for (const t of U.ix(unit).get('TypedefDecl', 'AliasDecl')) if (t.loc.file === file) out.add(t.name);
  return out;
}

const genericParam = (f, names) => {
  if (U.paramCount(f) !== 1) return false;
  const p = f.params[0];
  const ts = p.specs && p.specs.typeSpec;
  return !!(ts && ts.type === 'NamedType' && names.has(ts.name));
};
const tparamNames = (td) => new Set((td.params || []).filter((p) => p.kind === 'type' && p.name).map((p) => p.name));

module.exports = [
  A({
    id: 'A14-5-1', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 10,
    name: ['A template constructor shall not participate in overload resolution for a single argument of the enclosing class type', '템플릿 생성자가 자기 클래스 형식의 단일 인자에 대한 오버로드 해석에 참여하면 안 됩니다'],
    why: ['An unconstrained template constructor taking T&& is a better match than the copy constructor for non-const lvalues.', '제약 없는 T&& 템플릿 생성자는 비 const 좌측값에 대해 복사 생성자보다 더 잘 맞습니다.'],
    fix: ['Constrain the template (std::enable_if / requires) so it excludes the class type, or take a different parameter.', '템플릿에 제약(std::enable_if / requires)을 두어 자기 클래스 형식을 제외하거나 다른 매개변수를 받으세요.'],
    check(unit, api) {
      for (const td of U.ix(unit).get('TemplateDecl')) {
        const d = td.decl;
        if (!d || d.type !== 'Declaration' || d.declarators.length !== 1) continue;
        const f = d.declarators[0];
        if (f.type !== 'FunctionDecl' || !f.isConstructor || td.requires || f.requires) continue;
        const names = tparamNames(td);
        if (!genericParam(f, names)) continue;
        if ((td.params || []).some((p) => p.default || (p.param && p.param.default))) continue; // SFINAE-style default argument
        api.report(U.at(f), M(`The template constructor of '${f.name}' accepts a single generic argument and can hijack copying.`, `'${f.name}' 의 템플릿 생성자가 단일 제네릭 인자를 받아 복사를 가로챌 수 있습니다.`));
      }
    },
  }),
  A({
    id: 'A14-5-3', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['A non-member generic operator should only be declared in a namespace that does not contain class declarations', '비멤버 제네릭 연산자는 클래스 선언이 없는 네임스페이스에만 선언해야 합니다'],
    why: ['Argument-dependent lookup finds the generic operator for every class of that namespace, often unintentionally.', '인자 종속 이름 찾기가 그 네임스페이스의 모든 클래스에 대해 제네릭 연산자를 찾아 의도치 않게 쓰입니다.'],
    fix: ['Move the generic operator into its own namespace.', '제네릭 연산자를 별도의 네임스페이스로 옮기세요.'],
    check(unit, api) {
      const lists = [{ decls: unit.ast.decls }, ...U.ix(unit).get('NamespaceDecl')];
      for (const ns of lists) {
        const decls = ns.decls || [];
        const hasClass = decls.some((d) => { const x = d.type === 'TemplateDecl' ? d.decl : d; const ts = x && x.specs && x.specs.typeSpec; return ts && ts.type === 'RecordDecl' && ts.isDefinition; });
        if (!hasClass) continue;
        for (const d of decls) {
          if (d.type !== 'TemplateDecl' || !d.decl || d.decl.type !== 'Declaration' || !U.user(d)) continue;
          for (const f of d.decl.declarators) {
            if (f.type !== 'FunctionDecl' || !f.isOperator || f.isConversion) continue;
            const names = tparamNames(d);
            const generic = (f.params || []).some((p) => { const ts = p.specs && p.specs.typeSpec; return ts && ts.type === 'NamedType' && names.has(ts.name); });
            if (generic) api.report(U.at(f), M(`The generic operator '${f.name}' is declared in a namespace that also declares classes.`, `제네릭 연산자 '${f.name}' 을(를) 클래스도 선언하는 네임스페이스에 선언했습니다.`));
          }
        }
      }
    },
  }),
  A({
    id: 'A14-7-2', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 10,
    name: ['A template specialization shall be declared in the file of the primary template or of a user-defined type it is specialized for', '템플릿 특수화는 기본 템플릿이나 특수화 대상 사용자 정의 형식과 같은 파일에 선언해야 합니다'],
    why: ['A specialization that is not visible everywhere the template is used makes programs ill-formed (no diagnostic required).', '템플릿을 쓰는 모든 곳에서 보이지 않는 특수화는 진단 없이 잘못된 프로그램을 만듭니다.'],
    fix: ['Move the specialization next to the primary template or to the type it is specialized for.', '특수화를 기본 템플릿이나 대상 형식 옆으로 옮기세요.'],
    check(unit, api) {
      const { primaries, specs } = templates(unit);
      for (const s of specs) {
        const p = primaries.get(s.name);
        if (!p || p.loc.file === s.td.loc.file) continue;
        const local = typesDeclaredIn(unit, s.td.loc.file);
        const argText = s.rd ? (s.rd.templateArgs || []).map((a) => cf.sourceText(unit, a) || '').join(' ') : (cf.sourceText(unit, s.td) || '');
        if (argText.split(/[^\w]+/).some((w) => local.has(w))) continue;
        api.report(s.td, M(`The specialization of '${s.name}' is declared neither with the primary template nor with a type it is specialized for.`, `'${s.name}' 의 특수화가 기본 템플릿과도, 특수화 대상 형식과도 다른 파일에 선언되었습니다.`));
      }
    },
  }),
  D('A14-8-2', ['17.8.1'], { cat: 'Required' }),
  // ------------------------------------------------------- MISRA C++:2008 M14
  A({
    id: 'M14-5-3', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['A copy assignment operator shall be declared when there is a template assignment operator with a generic parameter', '제네릭 매개변수를 받는 템플릿 대입 연산자가 있으면 복사 대입 연산자를 선언해야 합니다'],
    why: ['A template operator= is never a copy assignment, so the implicit (shallow) one is still generated.', '템플릿 operator= 는 결코 복사 대입이 아니므로 암시적인(얕은) 복사 대입이 여전히 만들어집니다.'],
    fix: ['Declare the copy assignment operator explicitly.', '복사 대입 연산자를 명시적으로 선언하세요.'],
    check(unit, api) {
      for (const rd of U.ix(unit).records) {
        if (!rd.ctype || !rd.name) continue;
        const rec = U.canon(rd.ctype);
        let tmpl = null;
        for (const m of rd.members || []) {
          if (m.type !== 'TemplateDecl' || !m.decl || m.decl.type !== 'Declaration') continue;
          for (const f of m.decl.declarators) if (f.type === 'FunctionDecl' && f.name === 'operator=' && genericParam(f, tparamNames(m))) tmpl = f;
        }
        if (!tmpl) continue;
        const hasCopy = U.methods(rec).some((m) => !m.template && U.specialKind(m.node, rd.name) === 'copyAssign');
        if (!hasCopy) api.report(U.at(tmpl), M(`'${rd.name}' has a template assignment operator but no copy assignment operator.`, `'${rd.name}' 에 템플릿 대입 연산자는 있지만 복사 대입 연산자가 없습니다.`));
      }
    },
  }),
  D('M14-6-1', ['6.4.3'], { name: ['In a class template with a dependent base, names from that base shall be referred to using a qualified-id or this->', '종속 기반을 가진 클래스 템플릿에서는 그 기반의 이름을 한정 이름이나 this-> 로 써야 합니다'] }),
  A({
    id: 'M14-7-3', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['All partial and explicit specializations of a template shall be declared in the same file as the primary template', '템플릿의 모든 부분/명시적 특수화는 기본 템플릿과 같은 파일에 선언해야 합니다'],
    why: ['If the specialization is not visible where the template is instantiated, the primary template is used instead.', '템플릿을 인스턴스화하는 곳에서 특수화가 보이지 않으면 기본 템플릿이 대신 쓰입니다.'],
    fix: ['Move the specialization into the file of the primary template.', '특수화를 기본 템플릿이 있는 파일로 옮기세요.'],
    check(unit, api) {
      const { primaries, specs } = templates(unit);
      for (const s of specs) {
        const p = primaries.get(s.name);
        if (p && p.loc.file !== s.td.loc.file) api.report(s.td, M(`The specialization of '${s.name}' is not in the file of its primary template (${p.loc.file}).`, `'${s.name}' 의 특수화가 기본 템플릿 파일(${p.loc.file})에 있지 않습니다.`));
      }
    },
  }),
];
