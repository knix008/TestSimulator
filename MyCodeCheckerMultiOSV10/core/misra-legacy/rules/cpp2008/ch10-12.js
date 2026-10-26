'use strict';

// MISRA C++:2008 chapter 10 — derived classes; chapter 11 — member access
// control; chapter 12 — special member functions.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');
const CP = require('../../lib/cpp');

const { cf, T } = U;
const P = U.P;
const X = CP.X;

const canonT = (t) => (t ? T.canonical(t) : null);
const nameOf = (r) => X.bareName(r);

// Records of the unit with their direct bases.
function recs(unit) { return CP.records(unit); }

function virtualWithoutDiamond(unit, api) {
  const all = recs(unit);
  for (const d of all) {
    for (const b of P.bases(d)) {
      if (!b.virtual || !b.rec) continue;
      // a diamond: some class reaches the base through two different direct bases
      const diamond = all.some((r) => {
        const via = P.bases(r).filter((x) => x.rec && (X.sameRec(x.rec, b.rec) || X.isDerivedFrom(x.rec, b.rec)));
        return via.length >= 2;
      });
      if (!diamond) api.report(b.spec || d.decl, M(`'${nameOf(b.rec)}' is a virtual base of '${nameOf(d)}' but is not used in a diamond hierarchy.`, `'${nameOf(b.rec)}'는 '${nameOf(d)}'의 가상 기반이지만 다이아몬드 계층에서 쓰이지 않습니다.`));
    }
  }
}

// Every member name reachable through a base (including the base's own bases).
function memberNames(rec, out = new Map(), depth = 0) {
  if (!rec || depth > 20) return out;
  for (const m of P.members(rec)) {
    const n = m.node.name;
    if (!n || (m.node.type === 'FunctionDecl' && CP.isSpecial(m.node))) continue;
    if (!out.has(n)) out.set(n, rec);
  }
  for (const b of P.bases(rec)) memberNames(b.rec, out, depth + 1);
  return out;
}

function ambiguousNames(unit, api) {
  for (const r of recs(unit)) {
    const bs = P.bases(r).filter((b) => b.rec);
    if (bs.length < 2) continue;
    const seen = new Map();
    for (const b of bs) {
      for (const [n, owner] of memberNames(b.rec)) {
        const prev = seen.get(n);
        if (prev && !X.sameRec(prev, owner)) {
          api.report(r.decl, M(`'${n}' is inherited by '${nameOf(r)}' from both '${nameOf(prev)}' and '${nameOf(owner)}'.`, `'${nameOf(r)}'가 '${n}'를 '${nameOf(prev)}'와 '${nameOf(owner)}' 양쪽에서 상속합니다.`));
        } else if (!prev) seen.set(n, owner);
      }
    }
  }
}

// Methods of a record that define (with body or in-class definition, not pure) a function.
function definesFn(rec, name, arity) {
  return P.methods(rec).some((m) => m.node.name === name && P.paramCount(m.node) === arity && !m.node.isPure && (m.node.body || (m.node.symbol && m.node.symbol.definition)));
}

function multipleDefinitionsOnPath(unit, api) {
  for (const r of recs(unit)) {
    for (const m of P.methods(r)) {
      const f = m.node;
      if (!f.name || f.isPure || CP.isSpecial(f) || !CP.isVirtual(unit, f)) continue;
      if (!(f.body || (f.symbol && f.symbol.definition))) continue;
      const base = CP.overriddenBy(unit, f);
      if (!base) continue;
      const arity = P.paramCount(f);
      // count definitions along the chain of overridden functions
      let count = 1;
      let cur = r;
      for (let i = 0; i < 20; i++) {
        const next = P.bases(cur).map((b) => b.rec).filter(Boolean).find((b) => P.methods(b).some((x) => x.node.name === f.name && P.paramCount(x.node) === arity) || memberNames(b).has(f.name));
        if (!next) break;
        if (definesFn(next, f.name, arity)) count++;
        cur = next;
      }
      if (count > 1) api.report(f.nameLoc || f, M(`Virtual function '${f.name}' has ${count} definitions on one inheritance path.`, `가상 함수 '${f.name}'가 하나의 상속 경로에 정의 ${count}개를 가집니다.`));
    }
  }
}

function overrideWithoutVirtual(unit, api) {
  for (const r of recs(unit)) {
    for (const m of P.methods(r)) {
      const f = m.node;
      if (CP.isSpecial(f) || P.isVirtualDecl(f)) continue;
      const base = CP.overriddenBy(unit, f);
      if (base) api.report(f.nameLoc || f, M(`'${f.name}' overrides a virtual function but is not declared virtual.`, `'${f.name}'는 가상 함수를 재정의하지만 virtual로 선언되지 않았습니다.`));
    }
  }
}

function pureOverride(unit, api) {
  for (const r of recs(unit)) {
    for (const m of P.methods(r)) {
      const f = m.node;
      if (!f.isPure) continue;
      const base = CP.overriddenBy(unit, f);
      if (base && !base.isPure) api.report(f.nameLoc || f, M(`'${f.name}' overrides the non-pure virtual function of a base with a pure virtual function.`, `'${f.name}'가 기반 클래스의 순수하지 않은 가상 함수를 순수 가상 함수로 재정의합니다.`));
    }
  }
}

function isPod(rec) {
  if (P.bases(rec).length) return false;
  const ms = P.members(rec);
  if (ms.some((m) => m.node.type === 'FunctionDecl')) return false;
  const fs = P.fields(rec);
  const access = new Set(fs.map((f) => f.access));
  return access.size <= 1 && !access.has('private') && !access.has('protected');
}

function nonPrivateData(unit, api) {
  for (const r of recs(unit)) {
    if (!r.decl || r.tag === 'union' || isPod(r)) continue;
    for (const f of P.fields(r)) {
      if (f.access === 'private') continue;
      api.report(f.node.nameLoc ? { ...f.node.nameLoc, file: f.node.loc.file } : f.node, M(`Data member '${f.node.name}' of the non-POD class '${nameOf(r)}' is ${f.access}.`, `POD가 아닌 클래스 '${nameOf(r)}'의 데이터 멤버 '${f.node.name}'가 ${f.access === 'public' ? '공개' : '보호'} 멤버입니다.`));
    }
  }
}

const FUNDAMENTAL = new Set(['int', 'float', 'pointer', 'enum', 'nullptr']);
function implicitCtors(unit, api) {
  for (const r of recs(unit)) {
    for (const m of P.methods(r)) {
      const f = m.node;
      if (!(f.isConstructor || f.name === nameOf(r))) continue;
      const specs = P.specsOf(f);
      if (specs && (specs.functionSpecs || []).includes('explicit')) continue;
      const ps = f.params || [];
      if (!ps.length || ps.slice(1).some((p) => !p.default)) continue;
      const t = canonT(ps[0].ctype && T.nonRef(ps[0].ctype));
      if (!t || !FUNDAMENTAL.has(t.kind)) continue;
      api.report(f.nameLoc || f, M(`Constructor '${f.name}' can be called with one argument of fundamental type but is not explicit.`, `생성자 '${f.name}'는 기본 형식 인수 하나로 호출될 수 있지만 explicit이 아닙니다.`));
    }
  }
}

function copyCtorEffects(unit, api) {
  for (const fd of U.funcs(unit)) {
    if (fd.type !== 'FunctionDecl') continue;
    const rec = CP.ownerOf(unit, fd);
    if (!rec || P.specialKind(fd, nameOf(rec)) !== 'copyCtor') continue;
    cf.walk(fd.body, (n) => {
      let target = null;
      if (n.type === 'AssignExpr') target = n.left;
      else if (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--')) target = n.arg;
      if (!target) return;
      const id = P.rootIdent(target);
      const s = id && id.symbol;
      if (!s) return;
      const isMember = s.kind === 'field' && s.storage !== 'static';
      const isLocal = (s.kind === 'variable' && s.storage === 'automatic') || s.kind === 'parameter';
      if (!isMember && !isLocal) api.report(n, M(`The copy constructor of '${nameOf(rec)}' modifies '${s.name}', which is not a non-static member.`, `'${nameOf(rec)}'의 복사 생성자가 비정적 멤버가 아닌 '${s.name}'를 변경합니다.`));
    });
  }
}

function abstractCopyAssign(unit, api) {
  for (const r of recs(unit)) {
    const ms = P.methods(r);
    if (!ms.some((m) => m.node.isPure)) continue;
    const ca = ms.find((m) => P.specialKind(m.node, nameOf(r)) === 'copyAssign');
    if (ca && (ca.access !== 'public' || ca.node.isDeleted)) continue;
    api.report(ca ? (ca.node.nameLoc || ca.node) : r.decl, M(`The copy assignment operator of the abstract class '${nameOf(r)}' is ${ca ? 'public' : 'implicitly public'}.`, `추상 클래스 '${nameOf(r)}'의 복사 대입 연산자가 ${ca ? '' : '암시적으로 '}공개되어 있습니다.`));
  }
}

module.exports = [
  CPP08({
    id: '10-1-1', cat: 'A', dec: true, cpp2023: '13.1.1',
    name: ['Classes should not be derived from virtual bases', '클래스는 가상 기반에서 파생하지 않아야 합니다'],
    why: ['Virtual inheritance complicates construction and casting.', '가상 상속은 생성과 캐스트를 복잡하게 합니다.'],
    fix: ['Use non-virtual inheritance or composition.', '비가상 상속이나 합성을 사용하세요.'],
    reuse: 'misra-cpp:13.1.1',
  }),
  CPP08({
    id: '10-1-2', cat: 'R', dec: true,
    name: ['A base shall only be virtual if it is used in a diamond hierarchy', '기반 클래스는 다이아몬드 계층에서 쓰일 때만 가상이어야 합니다'],
    why: ['A virtual base without a diamond adds cost and complexity for nothing.', '다이아몬드 없는 가상 기반은 이득 없이 비용과 복잡도만 늘립니다.'],
    fix: ['Remove the virtual keyword from the base specifier.', '기반 지정자에서 virtual을 없애세요.'],
    check: virtualWithoutDiamond,
  }),
  CPP08({
    id: '10-1-3', cat: 'R', dec: true, cpp2023: '13.1.2',
    name: ['A base shall not be both virtual and non-virtual in one hierarchy', '한 계층에서 기반 클래스가 가상과 비가상을 겸하면 안 됩니다'],
    why: ['The object then contains several base sub-objects, which is rarely intended.', '그러면 객체에 기반 하위 객체가 여러 개 생기는데 이는 의도와 다르기 쉽습니다.'],
    fix: ['Make every path to the base virtual, or none.', '기반으로 가는 모든 경로를 가상으로 하거나 모두 비가상으로 하세요.'],
    reuse: 'misra-cpp:13.1.2',
  }),
  CPP08({
    id: '10-2-1', cat: 'A', dec: true,
    name: ['Names inherited through multiple inheritance should be unique', '다중 상속으로 물려받는 이름은 고유해야 합니다'],
    why: ['The same name from two bases makes uses ambiguous.', '두 기반에서 온 같은 이름은 사용을 모호하게 만듭니다.'],
    fix: ['Rename one of the members.', '멤버 중 하나의 이름을 바꾸세요.'],
    check: ambiguousNames,
  }),
  CPP08({
    id: '10-3-1', cat: 'R', dec: true,
    name: ['A virtual function shall have at most one definition on each inheritance path', '가상 함수는 상속 경로마다 정의가 하나 이하여야 합니다'],
    why: ['Several definitions on one path make it unclear which one is called.', '한 경로에 여러 정의가 있으면 어느 것이 호출되는지 불분명합니다.'],
    fix: ['Keep a single overriding definition per path.', '경로마다 재정의 정의를 하나만 두세요.'],
    check: multipleDefinitionsOnPath,
  }),
  CPP08({
    id: '10-3-2', cat: 'R', dec: true,
    name: ['Overriding virtual functions shall be declared with virtual', '가상 함수를 재정의할 때는 virtual로 선언해야 합니다'],
    why: ['Without the keyword readers cannot see that the function is virtual.', '키워드가 없으면 읽는 사람이 함수가 가상임을 알 수 없습니다.'],
    fix: ['Add virtual to the overriding declaration.', '재정의 선언에 virtual을 추가하세요.'],
    check: overrideWithoutVirtual,
  }),
  CPP08({
    id: '10-3-3', cat: 'R', dec: true,
    name: ['A non-pure virtual function shall not be overridden by a pure one', '순수하지 않은 가상 함수를 순수 가상 함수로 재정의하지 않아야 합니다'],
    why: ['Re-declaring a defined function as pure is surprising for users of the hierarchy.', '정의된 함수를 순수로 다시 선언하면 계층 사용자가 놀랍니다.'],
    fix: ['Keep the override non-pure or make the base pure.', '재정의를 순수하지 않게 두거나 기반을 순수로 만드세요.'],
    check: pureOverride,
  }),
  CPP08({
    id: '11-0-1', cat: 'R', dec: true, cpp2023: '14.1.1',
    name: ['Member data in non-POD classes shall be private', 'POD가 아닌 클래스의 멤버 데이터는 private이어야 합니다'],
    why: ['Public data lets users bypass the class invariants.', '공개 데이터는 사용자가 클래스 불변식을 우회하게 합니다.'],
    fix: ['Make the data private and provide member functions.', '데이터를 private으로 하고 멤버 함수를 제공하세요.'],
    check: nonPrivateData,
  }),
  CPP08({
    id: '12-1-1', cat: 'R', dec: true, type: 'BUG', cpp2023: '15.1.1',
    name: ['The dynamic type shall not be used in constructors and destructors', '생성자와 소멸자에서 동적 형식을 사용하지 않아야 합니다'],
    why: ['During construction the object is not yet of the derived type.', '생성 중에는 객체가 아직 파생 형식이 아닙니다.'],
    fix: ['Avoid virtual calls and typeid on this in constructors and destructors.', '생성자와 소멸자에서 this에 대한 가상 호출과 typeid를 피하세요.'],
    reuse: 'misra-cpp:15.1.1',
  }),
  CPP08({
    id: '12-1-2', cat: 'A', dec: true, cpp2023: '15.1.2',
    name: ['Constructors should explicitly initialise all immediate and virtual bases', '생성자는 모든 직접 기반과 가상 기반을 명시적으로 초기화해야 합니다'],
    why: ['Implicit base construction hides which base constructor runs.', '암시적 기반 생성은 어떤 기반 생성자가 실행되는지 숨깁니다.'],
    fix: ['Name every base in the member initialiser list.', '멤버 초기화 목록에 모든 기반을 쓰세요.'],
    reuse: 'misra-cpp:15.1.2',
  }),
  CPP08({
    id: '12-1-3', cat: 'R', dec: true, cpp2023: '15.1.3',
    name: ['Constructors callable with one fundamental-type argument shall be explicit', '기본 형식 인수 하나로 호출되는 생성자는 explicit이어야 합니다'],
    why: ['Such constructors allow surprising implicit conversions.', '이런 생성자는 뜻밖의 암시적 변환을 허용합니다.'],
    fix: ['Declare the constructor explicit.', '생성자를 explicit으로 선언하세요.'],
    check: implicitCtors,
  }),
  CPP08({
    id: '12-8-1', cat: 'R', dec: true,
    name: ['A copy constructor shall only initialise bases and non-static members', '복사 생성자는 기반과 비정적 멤버만 초기화해야 합니다'],
    why: ['Compilers may elide copies, so other side effects may not happen.', '컴파일러가 복사를 생략할 수 있어 다른 부수 효과가 일어나지 않을 수 있습니다.'],
    fix: ['Move other work out of the copy constructor.', '다른 작업은 복사 생성자 밖으로 옮기세요.'],
    check: copyCtorEffects,
  }),
  CPP08({
    id: '12-8-2', cat: 'R', dec: true,
    name: ['The copy assignment of an abstract class shall be protected or private', '추상 클래스의 복사 대입은 protected나 private이어야 합니다'],
    why: ['Assigning through a base reference slices the derived object.', '기반 참조를 통한 대입은 파생 객체를 잘라 냅니다.'],
    fix: ['Declare the copy assignment operator protected or private.', '복사 대입 연산자를 protected나 private으로 선언하세요.'],
    check: abstractCopyAssign,
  }),
];
