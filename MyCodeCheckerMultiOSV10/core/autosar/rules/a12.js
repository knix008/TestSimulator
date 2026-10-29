'use strict';

// AUTOSAR C++14 chapter 12 — special member functions (constructors,
// destructors, copy / move) and MISRA C++:2008 M12 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

const recs = (unit) => U.ix(unit).records.filter((r) => r.ctype && r.name && r.tag !== 'union').map((r) => ({ rd: r, rec: U.canon(r.ctype) }));
const baseName = (n) => String(n || '').replace(/<.*$/, '').split('::').pop();

function specials(rec, name) {
  const out = new Map();
  for (const m of U.methods(rec)) {
    const k = U.specialKind(m.node, name);
    if (k && !out.has(k)) out.set(k, m);
  }
  return out;
}

// Records used as a base anywhere in the unit.
function usedAsBase(unit) {
  return U.memo(unit, 'autosar.usedAsBase', () => {
    const out = new Set();
    for (const { rec } of recs(unit)) for (const b of U.bases(rec)) if (b.rec) out.add(b.rec);
    return out;
  });
}

const hasPure = (rec) => U.methods(rec).some((m) => m.node.isPure);

// Constructor definitions written inside their class: [{ f, rec, rd }]
function inlineCtors(rd, rec) {
  return U.methods(rec).filter((m) => m.node.isConstructor && m.node.body && !m.node.isDefault && !m.node.isDeleted).map((m) => m.node);
}

module.exports = [
  // 15.0.1 also checks the destructor of polymorphic classes, which AUTOSAR
  // checks as A12-4-1: only the rule-of-five findings belong here.
  D('A12-0-1', ['15.0.1'], { only: (m) => !/^Polymorphic class/.test(m.en || ''), name: ['If a class declares a copy or move operation or a destructor, it shall declare all five special members', '클래스가 복사, 이동 연산이나 소멸자 중 하나를 선언하면 다섯 특수 멤버를 모두 선언해야 합니다'] }),
  D('A12-0-2', ['24.5.2'], { name: ['Bitwise operations and operations that assume data representation shall not be performed on objects', '객체에 비트 단위 연산이나 데이터 표현을 가정한 연산을 하면 안 됩니다'] }),
  D('A12-1-1', ['15.1.2'], { cat: 'Required' }),
  A({
    id: 'A12-1-2', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['Both a non-static data member initializer and a constructor initializer shall not be used for the same member', '같은 멤버에 기본 멤버 초기값과 생성자 초기화를 함께 쓰면 안 됩니다'],
    why: ['The constructor initializer silently overrides the default member initializer, so the default is misleading.', '생성자 초기화가 기본 멤버 초기값을 조용히 덮어쓰므로 기본값이 오해를 부릅니다.'],
    fix: ['Use only one of the two for each member.', '멤버마다 둘 중 하나만 쓰세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).funcs) {
        if (!f.ctorInits || !f.ctorInits.length) continue;
        const rec = U.ownerRecord(unit, f);
        if (!rec || !rec.decl) continue;
        const nsdmi = new Set(U.fields(rec).filter((m) => m.node.init).map((m) => m.node.name));
        for (const ci of f.ctorInits) if (nsdmi.has(baseName(ci.name))) api.report(ci.loc ? ci : f, M(`'${ci.name}' has a default member initializer and is also initialized by the constructor.`, `'${ci.name}' 에 기본 멤버 초기값이 있는데 생성자에서도 초기화합니다.`));
      }
    },
  }),
  A({
    id: 'A12-1-3', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['If all constructors initialize a data member with the same constant, a default member initializer shall be used', '모든 생성자가 데이터 멤버를 같은 상수로 초기화하면 기본 멤버 초기값을 써야 합니다'],
    why: ['Repeating the same constant in every constructor is error-prone when constructors are added.', '모든 생성자에 같은 상수를 반복하면 생성자를 추가할 때 실수하기 쉽습니다.'],
    fix: ['Move the constant into a default member initializer.', '상수를 기본 멤버 초기값으로 옮기세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        const ctors = inlineCtors(rd, rec).filter((f) => { const k = U.specialKind(f, rd.name); return k !== 'copyCtor' && k !== 'moveCtor'; });
        if (!ctors.length) continue;
        for (const m of U.fields(rec)) {
          if (m.node.init) continue;
          let value = null;
          let all = true;
          let at = null;
          for (const f of ctors) {
            const ci = (f.ctorInits || []).find((c) => baseName(c.name) === m.node.name);
            const arg = ci && ci.args && ci.args.length === 1 ? ci.args[0] : null;
            const v = arg && arg.type !== 'InitList' ? U.constAny(arg, unit) : (arg && arg.type === 'InitList' && arg.items.length === 1 ? U.constAny(arg.items[0], unit) : null);
            if (!v) { all = false; break; }
            const s = String(v.value);
            if (value === null) { value = s; at = ci; } else if (value !== s) { all = false; break; }
          }
          if (all && at) api.report(at.loc ? at : rd, M(`Every constructor initializes '${m.node.name}' with ${value}; use a default member initializer.`, `모든 생성자가 '${m.node.name}' 을(를) ${value} 로 초기화합니다. 기본 멤버 초기값을 쓰세요.`));
        }
      }
    },
  }),
  D('A12-1-4', ['15.1.3']),
  A({
    id: 'A12-4-1', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'CRITICAL', debt: 10, cert: 'OOP52-CPP', cwe: 'CWE-1079',
    name: ['The destructor of a base class shall be public virtual, public override or protected non-virtual', '기반 클래스의 소멸자는 public virtual, public override, protected 비가상 중 하나여야 합니다'],
    why: ['Deleting a derived object through a base pointer with a public non-virtual destructor is undefined behaviour.', 'public 비가상 소멸자를 가진 기반 포인터로 파생 객체를 delete 하면 정의되지 않은 동작입니다.'],
    fix: ['Declare the destructor public virtual, or protected if deletion through the base is not intended.', '소멸자를 public virtual 로 하거나, 기반을 통한 삭제가 없으면 protected 로 선언하세요.'],
    check(unit, api) {
      const bases = usedAsBase(unit);
      for (const { rd, rec } of recs(unit)) {
        if (!bases.has(rec)) continue;
        const dt = specials(rec, rd.name).get('dtor');
        const virt = dt && (U.isVirtualDecl(dt.node) || dt.node.isOverride || dt.node.isFinal);
        // a base of unknown type (its header was not found) may give a virtual destructor
        const inheritedVirtual = U.bases(rec).some((b) => !b.rec || U.isPolymorphic(b.rec));
        if (!dt) {
          if (!inheritedVirtual) api.report(rd, M(`The base class '${rd.name}' has an implicit public non-virtual destructor.`, `기반 클래스 '${rd.name}' 의 소멸자가 암시적인 public 비가상 소멸자입니다.`));
        } else if (dt.access === 'public' && !virt && !inheritedVirtual) {
          api.report(U.at(dt.node), M(`The destructor of the base class '${rd.name}' is public and non-virtual.`, `기반 클래스 '${rd.name}' 의 소멸자가 public 이면서 비가상입니다.`));
        } else if (dt.access === 'protected' && virt) {
          api.report(U.at(dt.node), M(`The destructor of the base class '${rd.name}' is protected and virtual.`, `기반 클래스 '${rd.name}' 의 소멸자가 protected 이면서 가상입니다.`));
        }
      }
    },
  }),
  A({
    id: 'A12-4-2', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['If the public destructor of a class is non-virtual, the class should be declared final', 'public 소멸자가 비가상인 클래스는 final 로 선언해야 합니다'],
    why: ['Marking the class final prevents someone from deriving from it and deleting through a base pointer.', '클래스를 final 로 표시하면 누군가 파생해서 기반 포인터로 삭제하는 일을 막습니다.'],
    fix: ['Add final to the class, or make the destructor virtual.', '클래스에 final 을 붙이거나 소멸자를 가상으로 만드세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        if (rd.isFinal || rd.tag === 'struct') continue;
        const dt = specials(rec, rd.name).get('dtor');
        if (!dt || dt.access !== 'public' || U.isVirtualDecl(dt.node) || dt.node.isOverride || U.isPolymorphic(rec)) continue;
        api.report(rd, M(`'${rd.name}' has a public non-virtual destructor but is not final.`, `'${rd.name}' 은(는) public 비가상 소멸자를 가지지만 final 이 아닙니다.`));
      }
    },
  }),
  D('A12-6-1', ['15.1.4']),
  A({
    id: 'A12-7-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['If a special member function is identical to the implicit one, it shall be defaulted or not defined', '특수 멤버 함수가 암시적인 것과 같다면 =default 로 하거나 정의하지 않아야 합니다'],
    why: ['An empty user-provided constructor or destructor makes the type non-trivial for no reason.', '빈 사용자 제공 생성자나 소멸자는 이유 없이 형식을 비자명(non-trivial)하게 만듭니다.'],
    fix: ['Write = default instead of an empty body.', '빈 본문 대신 = default 를 쓰세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        const fieldsHaveInit = U.fields(rec).some((m) => m.node.init);
        for (const m of U.methods(rec)) {
          const f = m.node;
          if (!f.body || f.isDefault || f.isDeleted || f.body.type !== 'CompoundStmt' || f.body.body.length) continue;
          const k = U.specialKind(f, rd.name);
          const emptyCtor = k === 'ctor' && U.paramCount(f) === 0 && !(f.ctorInits || []).length && (fieldsHaveInit || !U.fields(rec).length);
          if (k === 'dtor' || emptyCtor) api.report(U.at(f), M(`The ${k === 'dtor' ? 'destructor' : 'default constructor'} of '${rd.name}' is identical to the implicit one; use = default.`, `'${rd.name}' 의 ${k === 'dtor' ? '소멸자' : '기본 생성자'}가 암시적인 것과 같습니다. = default 를 쓰세요.`));
        }
      }
    },
  }),
  D('A12-8-3', ['28.6.3'], { type: 'BUG', name: ['Moved-from objects shall not be read-accessed', '이동된 객체를 읽으면 안 됩니다'] }),
  A({
    id: 'A12-8-4', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['A move constructor shall not initialize its class members and base classes using copy semantics', '이동 생성자는 멤버와 기반 클래스를 복사 방식으로 초기화하면 안 됩니다'],
    why: ['Initializing a member from other.m (an lvalue) copies it, defeating the purpose of the move constructor.', 'other.m(좌측값)으로 멤버를 초기화하면 복사가 일어나 이동 생성자의 목적이 사라집니다.'],
    fix: ['Use std::move(other.m) in the initializer.', '초기화에 std::move(other.m) 를 쓰세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).funcs) {
        if (!f.isConstructor || !f.ctorInits) continue;
        const rec = U.ownerRecord(unit, f);
        if (!rec || U.specialKind(f, rec.name) !== 'moveCtor') continue;
        const param = f.params[0] && f.params[0].symbol;
        for (const ci of f.ctorInits) {
          const a = ci.args && ci.args.length === 1 ? U.strip(ci.args[0]) : null;
          if (!a) continue;
          const isParamMember = a.type === 'MemberExpr' && U.strip(a.object) && U.strip(a.object).type === 'Identifier' && U.strip(a.object).symbol === param;
          const isParam = a.type === 'Identifier' && a.symbol === param;
          if (!isParamMember && !isParam) continue;
          const t = a.ctype ? U.nonRef(a.ctype) : null;
          if (t && (t.kind === 'int' || t.kind === 'float' || t.kind === 'pointer' || t.kind === 'enum')) continue; // copying scalars is moving them
          api.report(ci.loc ? ci : f, M(`'${ci.name}' is initialized by copying from the moved-from object.`, `'${ci.name}' 을(를) 이동 원본 객체에서 복사해 초기화합니다.`));
        }
      }
    },
  }),
  D('A12-8-5', ['dir-15.8.1'], { cat: 'Required', name: ['A copy assignment and a move assignment operator shall handle self-assignment', '복사 대입과 이동 대입 연산자는 자기 대입을 처리해야 합니다'] }),
  A({
    id: 'A12-8-6', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 10, cert: 'OOP51-CPP',
    name: ['Copy and move constructors and assignment operators shall be declared protected or deleted in a base class', '기반 클래스의 복사/이동 생성자와 대입 연산자는 protected 로 선언하거나 삭제해야 합니다'],
    why: ['Public copy operations of a polymorphic base allow slicing when a derived object is copied through a base reference.', '다형 기반 클래스의 public 복사 연산은 기반 참조로 파생 객체를 복사할 때 슬라이싱을 허용합니다.'],
    fix: ['Declare the copy/move operations protected, or = delete them.', '복사/이동 연산을 protected 로 선언하거나 = delete 하세요.'],
    check(unit, api) {
      const bases = usedAsBase(unit);
      for (const { rd, rec } of recs(unit)) {
        if (rd.isFinal || !U.isPolymorphic(rec) || !(bases.has(rec) || hasPure(rec))) continue;
        const k = specials(rec, rd.name);
        const ops = ['copyCtor', 'copyAssign', 'moveCtor', 'moveAssign'];
        const declared = ops.filter((o) => k.has(o));
        if (!declared.length) {
          api.report(rd, M(`The base class '${rd.name}' has implicit public copy and move operations.`, `기반 클래스 '${rd.name}' 에 암시적인 public 복사/이동 연산이 있습니다.`));
          continue;
        }
        for (const o of declared) {
          const m = k.get(o);
          if (m.access === 'public' && !m.node.isDeleted) api.report(U.at(m.node), M(`The base class '${rd.name}' declares a public ${o.replace(/([A-Z])/g, ' $1').toLowerCase()}.`, `기반 클래스 '${rd.name}' 이(가) public ${{ copyCtor: '복사 생성자', copyAssign: '복사 대입', moveCtor: '이동 생성자', moveAssign: '이동 대입' }[o]}를 선언합니다.`));
        }
      }
    },
  }),
  A({
    id: 'A12-8-7', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 1,
    name: ['Assignment operators should be declared with the ref-qualifier &', '대입 연산자는 참조 한정자 & 를 붙여 선언해야 합니다'],
    why: ['Without &, assignment to a temporary (f() = x) compiles silently and has no effect.', '& 가 없으면 임시 객체에 대한 대입(f() = x)이 조용히 컴파일되고 아무 효과가 없습니다.'],
    fix: ['Declare T& operator=(const T&) &;', 'T& operator=(const T&) &; 로 선언하세요.'],
    check(unit, api) {
      for (const { rec } of recs(unit)) {
        for (const m of U.methods(rec)) {
          const f = m.node;
          if (!/^operator(=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=)$/.test(f.name || '') || f.isDeleted) continue;
          const fd = U.fdecl(f);
          if (fd && fd.refQual !== '&') api.report(U.at(f), M(`The assignment operator '${f.name}' has no & ref-qualifier.`, `대입 연산자 '${f.name}' 에 & 참조 한정자가 없습니다.`));
        }
      }
    },
  }),
  D('M12-1-1', ['15.1.1'], { name: ["An object's dynamic type shall not be used from the body of its constructor or destructor", '생성자나 소멸자 본문에서 객체의 동적 형식을 쓰면 안 됩니다'] }),
];

void cf;
