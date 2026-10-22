'use strict';

// MISRA C++:2023 chapter 15 — special member functions.

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const { cf } = U;

const recs = (unit) => U.ix(unit).records.filter((r) => r.ctype && r.name).map((r) => ({ rd: r, rec: U.canon(r.ctype) }));

function kinds(rec, name) {
  const out = new Map();
  for (const m of U.methods(rec)) {
    const k = U.specialKind(m.node, name);
    if (k && !out.has(k)) out.set(k, m);
    // a by-value (unified) assignment operator serves as both copy and move assignment
    if (k === 'copyAssign' && m.node.params && m.node.params[0] && U.canon(m.node.params[0].ctype || U.T.T.unknown).kind !== 'reference' && !out.has('moveAssign')) out.set('moveAssign', m);
  }
  return out;
}

function isNoexcept(fd) {
  const d = U.fdecl(fd);
  if (!d || !d.noexcept) return false;
  const e = d.noexceptExpr ? U.strip(d.noexceptExpr) : null;
  if (e && e.type === 'BoolLiteral' && !e.value) return false;
  return true;
}

const hasSpec = (fd, s) => { const sp = U.specsOf(fd); return !!(sp && sp.functionSpecs && sp.functionSpecs.includes(s)); };

// Constructor definitions (inline or out-of-line) with their owner record.
function ctorDefs(unit) {
  return U.memo(unit, 'ctorDefs', () => {
    const out = [];
    for (const f of U.ix(unit).funcs) {
      if (!f.isConstructor && !f.isDestructor) continue;
      if (f.isDefault || f.isDeleted) continue;
      const rec = U.ownerRecord(unit, f);
      if (rec && rec.kind === 'record' && rec.decl) out.push({ f, rec });
    }
    return out;
  });
}

const baseName = (n) => String(n || '').replace(/<.*$/, '').split('::').pop();
const initNames = (f) => new Set((f.ctorInits || []).map((c) => baseName(c.name)));
const delegating = (f, rec) => (f.ctorInits || []).some((c) => baseName(c.name) === baseName(rec.name));

function isVirtualFn(sym) {
  if (!sym || sym.kind !== 'function') return false;
  if (sym.isVirtual) return true;
  return (sym.decls || []).some((d) => d.type === 'FunctionDecl' && (U.isVirtualDecl(d) || d.isOverride || d.isFinal || d.isPure));
}

function isInitListParam(p) {
  const ts = p && p.specs && p.specs.typeSpec;
  if (ts && ts.type === 'NamedType' && /(^|::)initializer_list$/.test(ts.qname || ts.name || '')) return true;
  return /initializer_list/.test(U.tstr(p && p.ctype));
}

module.exports = [
  R({
    id: '15.0.1', cat: 'Required', dec: false, autosar: 'A12-0-1', cert: 'OOP58-CPP', sev: 'MAJOR', debt: 20,
    name: ['Special member functions shall be provided appropriately', '특수 멤버 함수는 알맞게 제공해야 합니다'],
    why: ['Declaring only some of the copy/move/destructor members leads to accidental shallow copies or missing moves; a polymorphic base with a public non-virtual destructor can be deleted through a base pointer.', '복사/이동/소멸자 멤버 중 일부만 선언하면 의도치 않은 얕은 복사나 이동 누락이 생기고, public 비가상 소멸자를 가진 다형 기반 클래스는 기반 포인터로 delete 될 수 있습니다.'],
    fix: ['Follow the rule of zero or the rule of five, and give polymorphic bases a public virtual or protected non-virtual destructor.', '0의 규칙이나 5의 규칙을 따르고, 다형 기반 클래스에는 public 가상 소멸자나 protected 비가상 소멸자를 주세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        if (rd.tag === 'union') continue;
        const k = kinds(rec, rd.name);
        const copyMove = ['copyCtor', 'copyAssign', 'moveCtor', 'moveAssign'];
        const declared = copyMove.filter((x) => k.has(x));
        const dtor = k.get('dtor');
        const userDtor = dtor && !dtor.node.isDefault && !dtor.node.isDeleted;
        if ((declared.length && declared.length < 4) || (userDtor && declared.length < 4)) {
          const missing = copyMove.filter((x) => !k.has(x));
          const nice = { copyCtor: 'copy constructor', copyAssign: 'copy assignment', moveCtor: 'move constructor', moveAssign: 'move assignment' };
          const niceKo = { copyCtor: '복사 생성자', copyAssign: '복사 대입', moveCtor: '이동 생성자', moveAssign: '이동 대입' };
          api.report(rd, M(`'${rd.name}' declares ${userDtor && !declared.length ? 'a destructor' : declared.map((x) => nice[x]).join(', ')} but not the ${missing.map((x) => nice[x]).join(', ')}.`, `'${rd.name}' 가 ${userDtor && !declared.length ? '소멸자' : declared.map((x) => niceKo[x]).join(', ')} 를 선언하지만 ${missing.map((x) => niceKo[x]).join(', ')} 는 선언하지 않습니다.`));
        }
        if (!rd.isFinal && U.isPolymorphic(rec) && !U.bases(rec).some((b) => U.isPolymorphic(b.rec))) {
          if (!dtor) api.report(rd, M(`Polymorphic class '${rd.name}' has an implicit public non-virtual destructor.`, `다형 클래스 '${rd.name}' 의 소멸자가 암시적인 public 비가상 소멸자입니다.`));
          else if (dtor.access === 'public' && !U.isVirtualDecl(dtor.node) && !dtor.node.isOverride) api.report(dtor.node, M(`Polymorphic class '${rd.name}' has a public non-virtual destructor.`, `다형 클래스 '${rd.name}' 의 소멸자가 public 비가상입니다.`));
        }
      }
    },
  }),
  R({
    id: '15.0.2', cat: 'Advisory', dec: true, autosar: 'A12-8-1', sev: 'MINOR', debt: 5,
    name: ['User-provided copy and move member functions of a class should have appropriate signatures', '사용자 제공 복사·이동 멤버 함수는 알맞은 시그니처를 가져야 합니다'],
    why: ['Unusual signatures (non-const copy source, non-reference return, throwing moves) break the expectations of containers and generic code.', '특이한 시그니처(const 아닌 복사 원본, 참조가 아닌 반환, 예외를 던지는 이동) 는 컨테이너와 제네릭 코드의 기대를 깨뜨립니다.'],
    fix: ['Use "T(const T&)", "T(T&&) noexcept", "T& operator=(const T&)" and "T& operator=(T&&) noexcept".', '"T(const T&)", "T(T&&) noexcept", "T& operator=(const T&)", "T& operator=(T&&) noexcept" 를 쓰세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        for (const m of U.methods(rec)) {
          const f = m.node;
          if (f.isDeleted) continue;
          const k = U.specialKind(f, rd.name);
          if (!k || k === 'ctor' || k === 'dtor') continue;
          const p = (f.params || [])[0];
          const pt = p && p.ctype ? U.canon(p.ctype) : null;
          const rep = (en, ko) => api.report(f, M(en, ko));
          if ((k === 'copyCtor' || k === 'copyAssign') && pt && pt.kind === 'reference' && !pt.rvalue && !U.T.qualsOf(pt.to).const) rep(`The ${k === 'copyCtor' ? 'copy constructor' : 'copy assignment operator'} of '${rd.name}' takes a non-const reference.`, `'${rd.name}' 의 ${k === 'copyCtor' ? '복사 생성자' : '복사 대입 연산자'} 가 const 가 아닌 참조를 받습니다.`);
          if ((k === 'moveCtor' || k === 'moveAssign') && !isNoexcept(f)) rep(`The ${k === 'moveCtor' ? 'move constructor' : 'move assignment operator'} of '${rd.name}' is not noexcept.`, `'${rd.name}' 의 ${k === 'moveCtor' ? '이동 생성자' : '이동 대입 연산자'} 가 noexcept 가 아닙니다.`);
          if (k === 'copyAssign' || k === 'moveAssign') {
            const ft = f.ctype ? U.canon(f.ctype) : null;
            const ret = ft && ft.kind === 'function' ? U.canon(ft.ret) : null;
            const ok = ret && ret.kind === 'reference' && !ret.rvalue && U.canon(ret.to).kind !== 'void' && !U.T.qualsOf(ret.to).const;
            if (ret && !U.unknownT(ret) && !ok) rep(`The assignment operator of '${rd.name}' returns '${U.tstr(ft.ret)}' instead of '${rd.name}&'.`, `'${rd.name}' 의 대입 연산자가 '${rd.name}&' 대신 '${U.tstr(ft.ret)}' 를 반환합니다.`);
            if (U.isVirtualDecl(f)) rep(`The assignment operator of '${rd.name}' is virtual.`, `'${rd.name}' 의 대입 연산자가 가상 함수입니다.`);
          }
        }
      }
    },
  }),
  R({
    id: '15.1.1', cat: 'Required', dec: true, type: 'BUG', autosar: 'M12-1-1', cert: 'OOP50-CPP', sev: 'MAJOR', debt: 10,
    name: ["An object's dynamic type shall not be used from within its constructor or destructor", '생성자나 소멸자 안에서 객체의 동적 타입을 쓰면 안 됩니다'],
    why: ['During construction and destruction virtual calls, typeid and dynamic_cast see the class being built, not the most-derived class.', '생성·소멸 중에는 가상 호출, typeid, dynamic_cast 가 가장 파생된 클래스가 아니라 지금 만드는 클래스를 봅니다.'],
    fix: ['Call the function with explicit qualification, or move the logic out of the constructor/destructor.', '함수를 명시적으로 한정해 호출하거나 그 논리를 생성자/소멸자 밖으로 옮기세요.'],
    check(unit, api) {
      for (const { f } of ctorDefs(unit)) {
        const what = f.isDestructor ? 'destructor' : 'constructor';
        const ko = f.isDestructor ? '소멸자' : '생성자';
        const bodyNodes = [f.body, ...(f.ctorInits || [])];
        for (const root of bodyNodes) {
          cf.walk(root, (n) => {
            if (n.type === 'LambdaExpr') return cf.walk.SKIP;
            if (n.type === 'CallExpr') {
              const c = U.strip(n.callee);
              let sym = null;
              if (c && c.type === 'Identifier' && !c.qualifier) sym = n.calleeSymbol || c.symbol;
              else if (c && c.type === 'MemberExpr' && !c.qualifier && U.strip(c.object) && U.strip(c.object).type === 'ThisExpr') sym = n.calleeSymbol || c.memberSymbol;
              if (sym && sym.member !== false && isVirtualFn(sym)) api.report(n, M(`Virtual function '${sym.name}' is called from a ${what}.`, `${ko}에서 가상 함수 '${sym.name}' 를 호출합니다.`));
            }
            if (n.type === 'TypeidExpr' && n.arg && /\bthis\b/.test(cf.sourceText(unit, n.arg) || '')) api.report(n, M(`typeid of this object is used in a ${what}.`, `${ko}에서 이 객체의 typeid 를 씁니다.`));
            if (n.type === 'CastExpr' && n.kind === 'dynamic_cast' && n.arg && /\bthis\b/.test(cf.sourceText(unit, n.arg) || '')) api.report(n, M(`dynamic_cast of this object is used in a ${what}.`, `${ko}에서 이 객체의 dynamic_cast 를 씁니다.`));
            return undefined;
          });
        }
      }
    },
  }),
  R({
    id: '15.1.2', cat: 'Advisory', dec: true, autosar: 'A12-1-1', sev: 'MINOR', debt: 5,
    name: ['All constructors of a class should explicitly initialize all of its virtual base classes and immediate base classes', '클래스의 모든 생성자는 가상 기반 클래스와 직접 기반 클래스를 명시적으로 초기화해야 합니다'],
    why: ['Relying on implicit base construction hides which base constructor runs.', '암시적인 기반 생성에 기대면 어떤 기반 생성자가 실행되는지 드러나지 않습니다.'],
    fix: ['Name every immediate and virtual base in the member initializer list.', '모든 직접 기반과 가상 기반을 멤버 초기화 목록에 적으세요.'],
    check(unit, api) {
      for (const { f, rec } of ctorDefs(unit)) {
        if (!f.isConstructor || delegating(f, rec)) continue;
        const names = initNames(f);
        const need = new Map();
        for (const b of U.bases(rec)) if (b.rec) need.set(b.rec, b.spec.name);
        for (const [b, e] of U.allBases(rec)) if (e.virtualPaths) need.set(b, e.spec && e.spec.name ? e.spec.name : b.name);
        for (const [, nm] of need) {
          if (!names.has(baseName(nm))) api.report(f, M(`Constructor of '${rec.name}' does not explicitly initialise base '${baseName(nm)}'.`, `'${rec.name}' 의 생성자가 기반 '${baseName(nm)}' 를 명시적으로 초기화하지 않습니다.`));
        }
      }
    },
  }),
  R({
    id: '15.1.3', cat: 'Required', dec: true, autosar: 'A12-1-4', sev: 'MAJOR', debt: 2,
    name: ['Conversion operators and constructors that are callable with a single argument shall be explicit', '인자 하나로 호출할 수 있는 생성자와 변환 연산자는 explicit 이어야 합니다'],
    why: ['Implicit conversions through such members happen silently and can select unexpected overloads.', '이런 멤버를 통한 암시적 변환은 조용히 일어나고 예상치 못한 오버로드를 고르게 합니다.'],
    fix: ['Declare the constructor or conversion operator explicit.', '생성자나 변환 연산자를 explicit 으로 선언하세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        for (const m of U.methods(rec)) {
          const f = m.node;
          if (hasSpec(f, 'explicit') || f.isDeleted) continue;
          if (f.isConversion) { api.report(f, M(`Conversion operator '${f.name}' of '${rd.name}' is not explicit.`, `'${rd.name}' 의 변환 연산자 '${f.name}' 가 explicit 이 아닙니다.`)); continue; }
          const k = U.specialKind(f, rd.name);
          if (k !== 'ctor') continue;
          const ps = f.params || [];
          const n = U.paramCount(f);
          if (n < 1 || !ps.slice(1).every((p) => p.default)) continue;
          if (n === 1 && isInitListParam(ps[0])) continue;
          api.report(f, M(`Constructor '${rd.name}(${ps.map((p) => U.tstr(p.ctype)).join(', ')})' can be called with one argument but is not explicit.`, `생성자 '${rd.name}(${ps.map((p) => U.tstr(p.ctype)).join(', ')})' 는 인자 하나로 호출될 수 있는데 explicit 이 아닙니다.`));
        }
      }
    },
  }),
  R({
    id: '15.1.4', cat: 'Advisory', dec: true, autosar: 'A12-6-1', sev: 'MINOR', debt: 5,
    name: ['All direct, non-static data members of a class should be initialized before the class object is accessible', '클래스의 모든 직접 비정적 데이터 멤버는 객체에 접근할 수 있기 전에 초기화해야 합니다'],
    why: ['A member left out of both the member initializer list and the default member initializer starts with an indeterminate value.', '멤버 초기화 목록과 기본 멤버 초기값 어디에도 없는 멤버는 불확정 값으로 시작합니다.'],
    fix: ['Initialise the member in the constructor\'s initializer list or with a default member initializer.', '생성자의 초기화 목록이나 기본 멤버 초기값으로 멤버를 초기화하세요.'],
    check(unit, api) {
      for (const { f, rec } of ctorDefs(unit)) {
        if (!f.isConstructor || delegating(f, rec)) continue;
        const names = initNames(f);
        for (const fl of U.fields(rec)) {
          const fd = fl.node;
          if (fd.init || !fd.name || names.has(fd.name)) continue;
          const c = U.canon(fd.ctype || U.T.T.unknown);
          const base = c.kind === 'array' ? U.canon(c.of) : c;
          if (!['int', 'float', 'pointer', 'enum'].includes(base.kind)) continue;
          api.report(f, M(`Constructor of '${rec.name}' does not initialise member '${fd.name}' (no initializer-list entry or default member initializer).`, `'${rec.name}' 의 생성자가 멤버 '${fd.name}' 를 초기화하지 않습니다 (초기화 목록이나 기본 멤버 초기값 없음).`));
        }
      }
    },
  }),
  R({
    id: '15.1.5', cat: 'Required', dec: true, autosar: 'A8-5-4', sev: 'MAJOR', debt: 10,
    name: ['A class shall only define an initializer-list constructor when it is the only constructor', '초기화 목록 생성자는 그것이 유일한 생성자일 때만 정의해야 합니다'],
    why: ['Brace initialisation prefers the initializer-list constructor, so "T{3}" and "T(3)" can call different constructors.', '중괄호 초기화는 초기화 목록 생성자를 우선하므로 "T{3}" 와 "T(3)" 가 서로 다른 생성자를 부를 수 있습니다.'],
    fix: ['Remove the other constructors, or replace the initializer-list constructor with a named factory function.', '다른 생성자를 없애거나, 초기화 목록 생성자를 이름 있는 팩토리 함수로 바꾸세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        const ctors = U.methods(rec).filter((m) => U.specialKind(m.node, rd.name) === 'ctor' && !m.node.isDeleted);
        const il = ctors.find((m) => isInitListParam((m.node.params || [])[0]));
        if (!il) continue;
        for (const m of ctors) {
          if (m === il || U.paramCount(m.node) === 0) continue;
          api.report(m.node, M(`'${rd.name}' has an initializer-list constructor and another constructor here.`, `'${rd.name}' 에 초기화 목록 생성자와 함께 다른 생성자가 있습니다.`));
        }
      }
    },
  }),
  R({
    id: '15.8.1', dir: true, cat: 'Required', dec: false, type: 'BUG', autosar: 'A12-8-5', cert: 'OOP54-CPP', sev: 'MAJOR', debt: 15,
    name: ['User-provided copy assignment operators and move assignment operators shall handle self-assignment', '사용자 제공 복사·이동 대입 연산자는 자기 대입을 처리해야 합니다'],
    why: ['An assignment operator that releases its own resources before copying from the source destroys the data when source and target are the same object.', '원본에서 복사하기 전에 자기 자원을 해제하는 대입 연산자는 원본과 대상이 같은 객체일 때 데이터를 파괴합니다.'],
    fix: ['Test "if (this != &other)" first, or use copy-and-swap.', '먼저 "if (this != &other)" 를 검사하거나 copy-and-swap 을 쓰세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).funcs) {
        if (f.name !== 'operator=' || f.isDefault || f.isDeleted) continue;
        const p = (f.params || [])[0];
        if (!p || !p.ctype || U.canon(p.ctype).kind !== 'reference') continue; // by value: copy-and-swap
        const text = cf.sourceText(unit, f.body) || '';
        if (/this\s*[!=]=\s*&|&\s*\w+\s*[!=]=\s*this|std::addressof/.test(text)) continue;
        const frees = cf.findAll(f.body, (n) => n.type === 'DeleteExpr' || (n.type === 'CallExpr' && U.isLibCall(n, new Set(['free']))));
        if (frees.length) api.report(frees[0], M(`'${f.qname || f.name}' releases resources without checking for self-assignment.`, `'${f.qname || f.name}' 가 자기 대입을 검사하지 않고 자원을 해제합니다.`));
      }
    },
  }),
];
