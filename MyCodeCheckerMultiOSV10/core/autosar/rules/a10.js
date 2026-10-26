'use strict';

// AUTOSAR C++14 chapter 10 — derived classes (multiple inheritance,
// virtual functions, override / final) and MISRA C++:2008 M10 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');

const recs = (unit) => U.ix(unit).records.filter((r) => r.ctype && r.name).map((r) => ({ rd: r, rec: U.canon(r.ctype) }));

// Interface class: only pure virtual functions (plus special members / typedefs), no data.
function isInterface(rec) {
  if (!rec || !rec.decl || !rec.decl.members) return false;
  if (U.fields(rec).length) return false;
  for (const m of U.methods(rec)) {
    const f = m.node;
    if (f.isDestructor || f.isConstructor || f.isDeleted || f.isDefault) continue;
    if (U.hasStorage(f, 'static')) continue;
    if (f.name === 'operator=') continue;
    if (!f.isPure) return false;
  }
  return U.bases(rec).every((b) => !b.rec || isInterface(b.rec));
}

const declaresVirtual = (f) => U.isVirtualDecl(f) || f.isOverride || f.isFinal || f.isPure;

module.exports = [
  A({
    id: 'A10-1-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 20,
    name: ['A class shall not be derived from more than one base class which is not an interface class', '클래스는 인터페이스가 아닌 기반 클래스를 둘 이상 상속하면 안 됩니다'],
    why: ['Multiple implementation inheritance brings ambiguous members, diamond problems and fragile layouts.', '구현을 여럿 상속하면 모호한 멤버, 다이아몬드 문제, 깨지기 쉬운 배치가 생깁니다.'],
    fix: ['Inherit implementation from at most one class; use interfaces (pure abstract classes) or composition for the rest.', '구현은 최대 한 클래스에서만 상속하고, 나머지는 인터페이스(순수 추상 클래스)나 합성을 쓰세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        const impl = U.bases(rec).filter((b) => b.rec && !isInterface(b.rec));
        if (impl.length > 1) api.report(rd, M(`'${rd.name}' inherits from ${impl.length} non-interface classes (${impl.map((b) => b.rec.name).join(', ')}).`, `'${rd.name}' 이(가) 인터페이스가 아닌 클래스 ${impl.length}개(${impl.map((b) => b.rec.name).join(', ')})를 상속합니다.`));
      }
    },
  }),
  D('A10-2-1', ['6.4.2'], { name: ['Non-virtual public or protected member functions shall not be redefined in derived classes', '비가상 public/protected 멤버 함수를 파생 클래스에서 다시 정의하면 안 됩니다'] }),
  D('A10-3-1', ['13.3.1'], { name: ['A virtual function declaration shall contain exactly one of virtual, override or final', '가상 함수 선언에는 virtual, override, final 중 정확히 하나만 있어야 합니다'] }),
  A({
    id: 'A10-3-2', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['Each overriding virtual function shall be declared with the override or final specifier', '재정의하는 가상 함수는 모두 override 나 final 로 선언해야 합니다'],
    why: ['Without override, a signature mismatch silently creates a new function instead of overriding.', 'override 가 없으면 시그니처가 어긋날 때 재정의 대신 새 함수가 조용히 생깁니다.'],
    fix: ['Add override (or final).', 'override(또는 final)를 붙이세요.'],
    check(unit, api) {
      for (const { rec } of recs(unit)) {
        for (const m of U.methods(rec)) {
          const f = m.node;
          if (f.isOverride || f.isFinal || f.isDestructor || f.isConstructor) continue;
          const base = U.overridden(rec, f);
          if (base) api.report(U.at(f), M(`'${f.name}' overrides a virtual function of '${(U.ownerRecord(unit, base) || {}).name || 'a base'}' without override or final.`, `'${f.name}' 이(가) override 나 final 없이 '${(U.ownerRecord(unit, base) || {}).name || '기반 클래스'}' 의 가상 함수를 재정의합니다.`));
        }
      }
    },
  }),
  A({
    id: 'A10-3-3', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['Virtual functions shall not be introduced in a final class', 'final 클래스에서 새 가상 함수를 도입하면 안 됩니다'],
    why: ['A final class cannot be derived from, so a new virtual function can never be overridden.', 'final 클래스는 파생될 수 없으므로 새 가상 함수는 결코 재정의되지 않습니다.'],
    fix: ['Remove virtual from the new function.', '새 함수에서 virtual 을 빼세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        if (!rd.isFinal) continue;
        for (const m of U.methods(rec)) {
          const f = m.node;
          if (!U.isVirtualDecl(f) || f.isOverride || f.isFinal || f.isDestructor) continue;
          if (!U.overridden(rec, f)) api.report(U.at(f), M(`The final class '${rd.name}' introduces the virtual function '${f.name}'.`, `final 클래스 '${rd.name}' 이(가) 가상 함수 '${f.name}' 를 새로 도입합니다.`));
        }
      }
    },
  }),
  A({
    id: 'A10-3-5', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['A user-defined assignment operator shall not be virtual', '사용자 정의 대입 연산자는 가상이면 안 됩니다'],
    why: ['A virtual operator= cannot be overridden with the derived type as parameter, which invites slicing.', '가상 operator= 는 파생 형식을 매개변수로 재정의할 수 없어 슬라이싱을 부릅니다.'],
    fix: ['Make the assignment operator non-virtual.', '대입 연산자를 비가상으로 만드세요.'],
    check(unit, api) {
      for (const { rec } of recs(unit)) {
        for (const m of U.methods(rec)) {
          const f = m.node;
          if (/^operator(=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=)$/.test(f.name || '') && declaresVirtual(f)) api.report(U.at(f), M(`The assignment operator '${f.name}' is virtual.`, `대입 연산자 '${f.name}' 이(가) 가상입니다.`));
        }
      }
    },
  }),
  // ------------------------------------------------------- MISRA C++:2008 M10
  D('M10-1-1', ['13.1.1']),
  A({
    id: 'M10-1-2', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['A base class shall only be declared virtual if it is used in a diamond hierarchy', '기반 클래스는 다이아몬드 계층에 쓰일 때만 virtual 로 선언해야 합니다'],
    why: ['Virtual inheritance has a cost and changes construction rules; it is only needed to share a base in a diamond.', '가상 상속은 비용이 들고 생성 규칙을 바꾸며, 다이아몬드에서 기반을 공유할 때만 필요합니다.'],
    fix: ['Remove virtual from the base specifier.', '기반 지정자에서 virtual 을 빼세요.'],
    check(unit, api) {
      const all = recs(unit);
      const diamondBases = new Set();
      for (const { rec } of all) for (const [b, e] of U.allBases(rec)) if (e.virtualPaths + e.nonVirtualPaths > 1) diamondBases.add(b);
      for (const { rd, rec } of all) {
        for (const b of U.bases(rec)) if (b.virtual && b.rec && !diamondBases.has(b.rec)) api.report(b.spec, M(`'${b.rec.name}' is a virtual base of '${rd.name}' but is not part of a diamond.`, `'${b.rec.name}' 은(는) '${rd.name}' 의 가상 기반이지만 다이아몬드 계층의 일부가 아닙니다.`));
      }
    },
  }),
  D('M10-1-3', ['13.1.2']),
  A({
    id: 'M10-2-1', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['All accessible entity names within a multiple inheritance hierarchy should be unique', '다중 상속 계층에서 접근 가능한 개체 이름은 고유해야 합니다'],
    why: ['The same member name in two bases makes unqualified uses ambiguous or surprising.', '두 기반에 같은 멤버 이름이 있으면 한정하지 않은 사용이 모호하거나 뜻밖이 됩니다.'],
    fix: ['Rename one of the members.', '멤버 중 하나의 이름을 바꾸세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        const bs = U.bases(rec).filter((b) => b.rec);
        if (bs.length < 2) continue;
        const owner = new Map();
        for (const b of bs) {
          for (const m of U.members(b.rec)) {
            const n = m.node.name;
            if (!n || m.access === 'private' || m.node.isDestructor || m.node.isConstructor || n === 'operator=') continue;
            const prev = owner.get(n);
            if (prev && prev !== b.rec) { api.report(rd, M(`The member name '${n}' is inherited from both '${prev.name}' and '${b.rec.name}'.`, `멤버 이름 '${n}' 을(를) '${prev.name}' 와(과) '${b.rec.name}' 양쪽에서 상속합니다.`)); }
            else owner.set(n, b.rec);
          }
        }
      }
    },
  }),
  A({
    id: 'M10-3-3', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['A virtual function shall only be overridden by a pure virtual function if it is itself declared as pure virtual', '가상 함수는 자신이 순수 가상일 때만 순수 가상 함수로 재정의될 수 있습니다'],
    why: ['Re-declaring an implemented virtual function as pure hides the base implementation from further derived classes.', '구현된 가상 함수를 순수 가상으로 다시 선언하면 더 파생된 클래스에서 기반 구현이 가려집니다.'],
    fix: ['Keep the override non-pure, or make the base function pure too.', '재정의를 순수 가상이 아니게 두거나 기반 함수도 순수 가상으로 만드세요.'],
    check(unit, api) {
      for (const { rec } of recs(unit)) {
        for (const m of U.methods(rec)) {
          const f = m.node;
          if (!f.isPure) continue;
          const base = U.overridden(rec, f);
          if (base && !base.isPure) api.report(U.at(f), M(`'${f.name}' overrides a non-pure virtual function with a pure virtual one.`, `'${f.name}' 이(가) 순수 가상이 아닌 가상 함수를 순수 가상 함수로 재정의합니다.`));
        }
      }
    },
  }),
];
