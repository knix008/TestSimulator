'use strict';

// AUTOSAR C++14 chapter 11 — member access control (class vs struct,
// friends) and MISRA C++:2008 M11 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');

const structs = (unit) => U.ix(unit).records.filter((r) => r.tag === 'struct' && r.ctype).map((r) => ({ rd: r, rec: U.canon(r.ctype) }));

module.exports = [
  A({
    id: 'A11-0-1', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['A non-POD type should be defined as class', 'POD 가 아닌 형식은 class 로 정의해야 합니다'],
    why: ['struct signals a plain data aggregate; a type with invariants, virtual functions or hidden members is a class.', 'struct 는 단순 데이터 묶음을 뜻하며, 불변식이나 가상 함수, 숨긴 멤버가 있는 형식은 class 입니다.'],
    fix: ['Use the class keyword.', 'class 키워드를 쓰세요.'],
    check(unit, api) {
      for (const { rd, rec } of structs(unit)) {
        const ms = U.members(rec);
        const hidden = ms.some((m) => m.access !== 'public');
        const virt = U.methods(rec).some((m) => U.isVirtualDecl(m.node) || m.node.isOverride || m.node.isPure);
        const userSpecial = U.methods(rec).some((m) => (m.node.isConstructor || m.node.isDestructor) && !m.node.isDefault);
        if (hidden || virt || userSpecial || U.bases(rec).some((b) => b.virtual)) api.report(rd, M(`The non-POD type '${rd.name}' is defined as struct.`, `POD 가 아닌 형식 '${rd.name}' 을(를) struct 로 정의했습니다.`));
      }
    },
  }),
  A({
    id: 'A11-0-2', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['A type defined as struct shall provide only public data members, no member functions and no base classes', 'struct 로 정의한 형식에는 public 데이터 멤버만 두고, 멤버 함수와 기반 클래스는 없어야 합니다'],
    why: ['Keeping struct for pure data and class for everything else makes the intent of a type obvious.', 'struct 는 순수 데이터에만, 나머지는 class 로 쓰면 형식의 의도가 분명해집니다.'],
    fix: ['Turn the struct into a class, or remove its functions, bases and non-public members.', 'struct 를 class 로 바꾸거나 함수, 기반, 비공개 멤버를 없애세요.'],
    check(unit, api) {
      for (const { rd, rec } of structs(unit)) {
        const fns = U.methods(rec).filter((m) => !m.node.isDeleted && !m.node.isDefault);
        const why = [];
        if (fns.length) why.push(['member functions', '멤버 함수']);
        if (U.bases(rec).length) why.push(['base classes', '기반 클래스']);
        if (U.members(rec).some((m) => m.access !== 'public')) why.push(['non-public members', '비공개 멤버']);
        if (why.length) api.report(rd, M(`The struct '${rd.name}' has ${why.map((w) => w[0]).join(', ')}.`, `struct '${rd.name}' 에 ${why.map((w) => w[1]).join(', ')}이(가) 있습니다.`));
      }
    },
  }),
  A({
    id: 'A11-3-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 10,
    name: ['Friend declarations shall not be used', 'friend 선언은 쓰면 안 됩니다'],
    why: ['A friend has full access to private members, which weakens encapsulation.', 'friend 는 private 멤버에 모두 접근할 수 있어 캡슐화를 약하게 합니다.'],
    fix: ['Provide the needed access through the public interface (comparison operators may be members).', '필요한 접근을 public 인터페이스로 제공하세요(비교 연산자는 멤버로 만들 수 있습니다).'],
    check(unit, api) {
      for (const rd of U.ix(unit).records) {
        for (const m of rd.members || []) {
          const d = m.type === 'TemplateDecl' ? m.decl : m;
          if (!d || d.type !== 'Declaration' || !d.specs || !d.specs.functionSpecs.includes('friend')) continue;
          const what = d.declarators.length ? d.declarators.map((x) => x.name).join(', ') : U.typeSpecName(d.specs.typeSpec) || 'a class';
          api.report(d, M(`'${what}' is declared as a friend of '${rd.name}'.`, `'${what}' 을(를) '${rd.name}' 의 friend 로 선언했습니다.`));
        }
      }
    },
  }),
  D('M11-0-1', ['14.1.1'], { cat: 'Required', name: ['Member data in non-POD class types shall be private', 'POD 가 아닌 클래스의 멤버 데이터는 private 이어야 합니다'] }),
];
