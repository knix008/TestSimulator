'use strict';

// SEI CERT C++ — OOP: object-oriented programming.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/cppx');
const { M, T, cf } = U;

const CPP = ['cpp'];
const fnLabel = (fn) => X.label(fn);

// Virtual member `name` visible in rec (own or inherited).
function findVirtual(rec, name, depth = 0) {
  if (!rec || depth > 30) return null;
  const own = X.scopeSyms(rec, name).find((s) => s.kind === 'function');
  if (own) return own.isVirtual ? own : null;
  for (const b of X.baseRecords(rec)) { const s = findVirtual(b, name, depth + 1); if (s) return s; }
  return null;
}

function isThisObj(e) {
  e = U.strip(e);
  if (!e) return false;
  if (e.type === 'ThisExpr') return true;
  return e.type === 'UnaryExpr' && e.op === '*' && U.strip(e.arg) && U.strip(e.arg).type === 'ThisExpr';
}

function recOfName(unit, name) {
  if (!name) return null;
  let s = null;
  try { s = String(name).includes('::') ? unit.lookupQualified(name) : unit.lookup(name); } catch (_) { s = null; }
  if (s && s.kind === 'tag' && s.type) return X.recordOf(s.type);
  if (s && s.type) return X.recordOf(s.type);
  return null;
}

// Record type of an object-valued expression (by value).
const valueRec = (e) => {
  const t = e && e.ctype;
  if (!t) return null;
  const c = T.canonical(t);
  return c && c.kind === 'record' ? c : null;
};

const declaredRef = (decl) => {
  const t = decl && (decl.declaredType || decl.ctype);
  const c = t ? T.canonical(t) : null;
  return !!c && (c.kind === 'reference' || c.kind === 'pointer');
};

function isNonConstRefParam(p) {
  const t = p && (p.declaredType || p.ctype);
  const c = t ? T.canonical(t) : null;
  if (!c || c.kind !== 'reference' || c.rvalue) return false;
  const to = c.to;
  return !(to && (to.const || T.canonical(to).const));
}

// Self-assignment check or copy-and-swap in a copy assignment operator.
function selfSafe(fn) {
  const p = fn.params[0] && fn.params[0].symbol;
  for (const b of X.ownNodes(fn, 'BinaryExpr')) {
    if (b.op !== '==' && b.op !== '!=') continue;
    const sides = [U.strip(b.left), U.strip(b.right)];
    const hasThis = sides.some((s) => s && s.type === 'ThisExpr');
    const hasAddr = sides.some((s) => s && ((s.type === 'UnaryExpr' && s.op === '&' && U.idSym(s.arg) === p)
      || (s.type === 'CallExpr' && U.callName(s) === 'addressof' && U.idSym(s.args[0]) === p)));
    if (hasThis && hasAddr) return true;
  }
  return X.ownNodes(fn, 'CallExpr').some((c) => /^swap$/i.test(U.callName(c) || ''));
}

const MEMFNS = { memset: [0], memcpy: [0, 1], memmove: [0, 1], memcmp: [0, 1], bzero: [0], memccpy: [0, 1], wmemset: [0] };

// Record object designated by a pointer argument: &obj, ptr-to-record, array of records.
function pointeeRec(e) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'UnaryExpr' && e.op === '&') return X.recordOf(U.strip(e.arg) && U.strip(e.arg).ctype);
  return X.recordOf(e.ctype, true);
}

module.exports = [
  rule('OOP50-CPP', {
    langs: CPP, risk: 'LUM', cwe: [], approx: false,
    name: ['Do not invoke virtual functions from constructors or destructors', '생성자나 소멸자에서 가상 함수를 호출하지 마세요'],
    why: ['During construction and destruction the dynamic type is the class being built or destroyed, so a virtual call does not reach the derived override (and a pure virtual call is undefined behavior).', '생성·소멸 중에는 동적 형식이 그 클래스 자신이므로 가상 호출이 파생 클래스의 재정의에 닿지 않으며 순수 가상 호출은 정의되지 않은 동작입니다.'],
    fix: ['Call a non-virtual (or explicitly qualified Class::f()) helper, or perform the work after construction.', '가상이 아닌(또는 Class::f() 로 한정한) 보조 함수를 호출하거나 생성 후에 작업하세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        if (!fn.isConstructor && !fn.isDestructor) continue;
        const rec = X.classOfFn(fn);
        if (!rec) continue;
        const where = fn.isConstructor ? 'constructor' : 'destructor';
        const whereKo = fn.isConstructor ? '생성자' : '소멸자';
        const roots = [fn.body, ...(fn.ctorInits || [])];
        for (const root of roots) {
          for (const c of cf.findAll(root, 'CallExpr')) {
            if (U.enclosingFn(c) !== fn) continue;
            const callee = U.skip(c.callee);
            let sym = null;
            if (callee.type === 'Identifier') {
              if (callee.qualifier) continue;
              const s = callee.symbol || c.calleeSymbol;
              if (s && s.kind === 'function' && s.isVirtual && s.record) sym = s;
            } else if (callee.type === 'MemberExpr' && !callee.qualifier && isThisObj(callee.object)) {
              sym = (callee.memberSymbol && callee.memberSymbol.isVirtual) ? callee.memberSymbol : findVirtual(rec, callee.member);
            }
            if (!sym) continue;
            const pure = sym.pure ? ' pure' : '';
            api.report(c, M(`Virtual function '${sym.name}' is called from the ${where} '${fnLabel(fn)}'; it will not dispatch to a derived override${pure ? ' (pure virtual: undefined behavior)' : ''}.`, `${whereKo} '${fnLabel(fn)}' 에서 가상 함수 '${sym.name}' 를 호출해 파생 클래스의 재정의로 가지 않습니다${pure ? '(순수 가상: 정의되지 않은 동작)' : ''}.`));
          }
        }
      }
    },
  }),

  rule('OOP51-CPP', {
    langs: CPP, risk: 'LPM', cwe: [], approx: true,
    name: ['Do not slice derived objects', '파생 객체를 잘라내지 마세요'],
    why: ['Copying a derived object into a base-class object by value keeps only the base part: derived data is lost and virtual calls use the base implementation.', '파생 객체를 기반 클래스 객체로 값 복사하면 기반 부분만 남아 파생 데이터가 사라지고 가상 호출이 기반 구현을 씁니다.'],
    fix: ['Pass and store polymorphic objects by reference or (smart) pointer.', '다형 객체는 참조나 (스마트) 포인터로 전달·보관하세요.'],
  }, {
    check(unit, api) {
      const sliced = (node, base, der, what, whatKo) => api.report(node, M(`${what}: '${der.name}' is sliced to its base '${base.name}'.`, `${whatKo}: '${der.name}' 가 기반 클래스 '${base.name}' 로 잘립니다.`));
      // parameters of polymorphic class type by value
      for (const fn of U.nodes(unit, 'FunctionDecl')) {
        if (!fn.body && fn.symbol && fn.symbol.definition && fn.symbol.definition !== fn) continue;
        const own = X.classOfFn(fn);
        for (const p of fn.params || []) {
          if (declaredRef(p)) continue;
          const r = X.recordOf(p.declaredType || p.ctype);
          if (!r || !X.isPolymorphic(r)) continue;
          if (own && X.sameRec(own, r) && (fn.name === 'operator=' || fn.isConstructor)) continue;
          api.report(p, M(`Parameter '${p.name || '<unnamed>'}' of '${fnLabel(fn)}' takes polymorphic class '${r.name}' by value; derived arguments are sliced.`, `'${fnLabel(fn)}' 의 매개변수 '${p.name || '<이름 없음>'}' 가 다형 클래스 '${r.name}' 를 값으로 받아 파생 인수가 잘립니다.`));
        }
      }
      for (const c of U.nodes(unit, 'CallExpr')) {
        const s = c.calleeSymbol;
        const ft = s && s.type ? T.canonical(s.type) : null;
        if (!ft || ft.kind !== 'function') continue;
        (c.args || []).forEach((a, i) => {
          const pt = ft.params && ft.params[i];
          if (!pt) return;
          const pc = T.canonical(pt);
          if (!pc || pc.kind !== 'record' || X.isPolymorphic(pc)) return; // polymorphic params reported above
          const ar = valueRec(U.strip(a));
          if (ar && X.isDerivedFrom(ar, pc)) sliced(a, pc, ar, `Argument ${i + 1} of '${U.callName(c)}' is passed by value`, `'${U.callName(c)}' 의 ${i + 1}번째 인수를 값으로 전달`);
        });
      }
      for (const d of U.nodes(unit, 'VarDecl')) {
        if (!d.init || declaredRef(d)) continue;
        const br = valueRec(d);
        if (!br) continue;
        let init = d.init.type === 'ParenListInit' && d.init.args.length === 1 ? d.init.args[0] : d.init.type === 'InitList' && d.init.items.length === 1 ? d.init.items[0] : d.init;
        const dr = valueRec(U.strip(init));
        if (dr && X.isDerivedFrom(dr, br)) sliced(d, br, dr, `Variable '${d.name}' is initialized by value`, `변수 '${d.name}' 를 값으로 초기화`);
      }
      for (const a of U.nodes(unit, 'AssignExpr')) {
        if (a.op !== '=') continue;
        const br = valueRec(U.strip(a.left));
        const dr = valueRec(U.strip(a.right));
        if (br && dr && X.isDerivedFrom(dr, br)) sliced(a, br, dr, `Assignment to '${U.src(unit, a.left)}'`, `'${U.src(unit, a.left)}' 에 대입`);
      }
      for (const h of U.nodes(unit, 'CatchClause')) {
        if (!h.param || declaredRef(h.param)) continue;
        const r = X.recordOf(X.handlerType(h));
        if (r && X.isPolymorphic(r)) api.report(h.param, M(`Handler catches polymorphic class '${r.name}' by value; derived exceptions are sliced.`, `처리기가 다형 클래스 '${r.name}' 를 값으로 잡아 파생 예외가 잘립니다.`));
      }
    },
  }),

  rule('OOP52-CPP', {
    langs: CPP, risk: 'LLL', cwe: ['CWE-758'], approx: true,
    name: ['Do not delete a polymorphic object without a virtual destructor', '가상 소멸자 없이 다형 객체를 삭제하지 마세요'],
    why: ['Deleting a derived object through a base-class pointer whose destructor is not virtual is undefined behavior: the derived destructor does not run.', '소멸자가 가상이 아닌 기반 클래스 포인터로 파생 객체를 삭제하면 정의되지 않은 동작이며 파생 소멸자가 실행되지 않습니다.'],
    fix: ['Declare the base destructor virtual (virtual ~Base() = default;), or make it protected and non-virtual if deletion through the base is not intended.', '기반 소멸자를 가상으로 선언하거나(virtual ~Base() = default;), 기반으로 삭제할 뜻이 없다면 protected 비가상으로 만드세요.'],
  }, {
    check(unit, api) {
      for (const d of U.nodes(unit, 'DeleteExpr')) {
        const r = X.recordOf(d.arg && U.strip(d.arg) && U.strip(d.arg).ctype, true);
        if (!r || X.hasVirtualDtor(r)) continue;
        let derived = null;
        const s = U.idSym(d.arg);
        if (s) {
          const inits = [];
          for (const dd of s.decls || []) if (dd.init) inits.push(dd.init);
          for (const u of s.uses || []) { const p = U.parent(u); if (p && p.type === 'AssignExpr' && p.left === u) inits.push(p.right); }
          for (const i of inits) {
            const e = U.strip(i);
            if (e && e.type === 'NewExpr') { const nr = X.recordOf(e.ctype, true); if (nr && X.isDerivedFrom(nr, r)) derived = nr; }
          }
        }
        if (derived) {
          api.report(d, M(`'${U.src(unit, d.arg)}' points to a '${derived.name}' but is deleted as '${r.name}', whose destructor is not virtual.`, `'${U.src(unit, d.arg)}' 는 '${derived.name}' 를 가리키지만 소멸자가 가상이 아닌 '${r.name}' 로 삭제됩니다.`));
        } else if (X.isPolymorphic(r)) {
          api.report(d, M(`Polymorphic class '${r.name}' is deleted through a pointer, but its destructor is not virtual.`, `다형 클래스 '${r.name}' 를 포인터로 삭제하지만 소멸자가 가상이 아닙니다.`));
        }
      }
    },
  }),

  rule('OOP53-CPP', {
    langs: CPP, risk: 'MUM', cwe: ['CWE-457'], approx: false,
    name: ['Write constructor member initializers in the canonical order', '생성자 멤버 초기화자를 선언 순서대로 쓰세요'],
    why: ['Members are initialized in declaration order, not in the order of the mem-initializer list; an initializer that reads a member declared later reads an uninitialized value.', '멤버는 초기화 목록 순서가 아니라 선언 순서로 초기화되므로 나중에 선언된 멤버를 읽는 초기화자는 초기화되지 않은 값을 읽습니다.'],
    fix: ['List bases and members in declaration order and do not use members that are initialized later.', '기반과 멤버를 선언 순서대로 나열하고 나중에 초기화되는 멤버를 사용하지 마세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        if (!fn.isConstructor || !fn.ctorInits || !fn.ctorInits.length) continue;
        const rec = X.classOfFn(fn);
        if (!rec) continue;
        const order = new Map();
        let i = 0;
        for (const f of rec.fields || []) {
          const d = f.node;
          if (d && d.specs && d.specs.storage && d.specs.storage.includes('static')) continue;
          order.set(f.name, i++);
        }
        let maxIdx = -1, maxName = null;
        for (const ci of fn.ctorInits) {
          const isField = ci.field && order.has(ci.name);
          const idx = isField ? order.get(ci.name) : -1; // bases come first
          if (isField && idx < maxIdx) {
            api.report(ci, M(`Member '${ci.name}' is listed after '${maxName}' in the initializer list but is declared (and initialized) before it.`, `멤버 '${ci.name}' 는 초기화 목록에서 '${maxName}' 뒤에 있지만 그보다 먼저 선언(초기화)됩니다.`));
          }
          if (isField && idx > maxIdx) { maxIdx = idx; maxName = ci.name; }
          if (!isField && maxIdx >= 0) {
            api.report(ci, M(`Base '${ci.name}' is listed after member '${maxName}'; bases are always initialized before members.`, `기반 '${ci.name}' 가 멤버 '${maxName}' 뒤에 있지만 기반은 항상 멤버보다 먼저 초기화됩니다.`));
          }
          for (const a of ci.args || []) {
            for (const n of cf.findAll(a, (x) => x.type === 'Identifier' || x.type === 'MemberExpr')) {
              let s = null;
              if (n.type === 'Identifier' && n.symbol && n.symbol.kind === 'field' && !n.qualifier) s = n.symbol;
              if (n.type === 'MemberExpr' && isThisObj(n.object)) s = { name: n.member, kind: 'field' };
              if (!s || !order.has(s.name)) continue;
              if (n.type === 'Identifier' && n.symbol.record && !X.sameRec(n.symbol.record, rec)) continue;
              const p = U.parent(n);
              if (p && (p.type === 'UnaryExpr' && p.op === '&' || p.type === 'SizeofExpr' || p.type === 'DecltypeType' || p.type === 'AlignofExpr')) continue;
              const used = order.get(s.name);
              if (used >= idx || idx < 0) {
                api.report(n, M(`Initializer of '${ci.name}' reads member '${s.name}', which is not initialized yet (it is declared ${idx < 0 ? 'after the bases are built' : used === idx ? 'as the same member' : 'later'}).`, `'${ci.name}' 의 초기화자가 아직 초기화되지 않은 멤버 '${s.name}' 를 읽습니다.`));
              }
            }
          }
        }
      }
    },
  }),

  rule('OOP54-CPP', {
    langs: CPP, risk: 'LPH', cwe: ['CWE-416'], approx: true,
    name: ['Gracefully handle self-copy assignment', '자기 자신에 대한 복사 대입을 안전하게 처리하세요'],
    why: ['A copy assignment operator that releases its own resources before copying from the source destroys the source too when an object is assigned to itself, then reads freed memory.', '원본을 복사하기 전에 자기 자원을 해제하는 복사 대입 연산자는 자기 대입 시 원본도 해제해 해제된 메모리를 읽습니다.'],
    fix: ['Check if (this != &rhs), or use the copy-and-swap idiom.', 'if (this != &rhs) 로 검사하거나 copy-and-swap 방식을 쓰세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        if (X.copyKind(fn) !== 'assign' || selfSafe(fn)) continue;
        const frees = [];
        for (const d of X.ownNodes(fn, 'DeleteExpr')) {
          const e = U.strip(d.arg);
          const s = U.idSym(e) || (e && e.type === 'MemberExpr' && isThisObj(e.object) ? { name: e.member, kind: 'field' } : null);
          if (s && s.kind === 'field') frees.push([d, s.name]);
        }
        for (const c of U.libCallsIn(fn.body, new Set(['free']))) {
          const s = U.idSym(c.args[0]);
          if (s && s.kind === 'field') frees.push([c, s.name]);
        }
        const p = fn.params[0];
        for (const [n, name] of frees.slice(0, 1)) {
          api.report(n, M(`'${fnLabel(fn)}' releases member '${name}' without a self-assignment check; 'x = x' frees the data it is about to copy from '${p.name || 'the source'}'.`, `'${fnLabel(fn)}' 가 자기 대입 검사 없이 멤버 '${name}' 를 해제해 'x = x' 일 때 '${p.name || '원본'}' 에서 복사할 데이터를 먼저 해제합니다.`));
        }
      }
    },
  }),

  rule('OOP55-CPP', {
    langs: CPP, risk: 'HPH', cwe: ['CWE-758'], approx: true,
    name: ['Do not use pointer-to-member operators to access nonexistent members', '멤버 포인터 연산자로 존재하지 않는 멤버에 접근하지 마세요'],
    why: ['Applying a pointer to a member of a derived class (.* / ->*) to an object whose dynamic type is only the base class accesses a member that does not exist: undefined behavior.', '파생 클래스 멤버 포인터를(.*/->*) 동적 형식이 기반 클래스인 객체에 적용하면 존재하지 않는 멤버에 접근해 정의되지 않은 동작입니다.'],
    fix: ['Only use member pointers of the object\'s own class (or its bases); downcast safely with dynamic_cast first.', '객체 자신의 클래스(또는 기반)의 멤버 포인터만 쓰고, 먼저 dynamic_cast 로 안전하게 변환하세요.'],
  }, {
    check(unit, api) {
      for (const b of U.nodes(unit, 'BinaryExpr')) {
        if (b.op !== '.*' && b.op !== '->*') continue;
        const left = U.strip(b.left);
        const objRec = X.recordOf(left && left.ctype, b.op === '->*');
        const mp = b.right && b.right.ctype ? T.canonical(b.right.ctype) : null;
        if (!objRec || !mp || mp.kind !== 'memberPointer') continue;
        const cls = typeof mp.cls === 'string' ? recOfName(unit, mp.cls) : X.recordOf(mp.cls);
        if (!cls || X.sameRec(cls, objRec)) continue;
        // object whose static type is the base, possibly pointing to the derived: only flag when the object is a base-class object
        if (!X.isDerivedFrom(cls, objRec)) continue;
        let realDerived = false;
        const s = U.idSym(left.type === 'UnaryExpr' && left.op === '*' ? left.arg : left);
        if (b.op === '->*' && s) {
          for (const d of s.decls || []) {
            const e = d.init && U.strip(d.init);
            const nr = e && e.type === 'NewExpr' ? X.recordOf(e.ctype, true) : null;
            if (nr && (X.sameRec(nr, cls) || X.isDerivedFrom(nr, cls))) realDerived = true;
          }
        }
        if (realDerived) continue;
        api.report(b, M(`Pointer to member of '${cls.name}' is applied to '${U.src(unit, b.left)}' of base class '${objRec.name}', which may not have that member.`, `'${cls.name}' 의 멤버 포인터를 그 멤버가 없을 수 있는 기반 클래스 '${objRec.name}' 의 '${U.src(unit, b.left)}' 에 적용합니다.`));
      }
    },
  }),

  rule('OOP56-CPP', {
    langs: CPP, risk: 'LPH', cwe: [], approx: true,
    name: ['Honor replacement handler requirements', '대체 처리기의 요구 사항을 지키세요'],
    why: ['A terminate handler must end the program without returning; a new_handler must make more memory available, throw std::bad_alloc or terminate. A handler that just returns causes undefined behavior or an endless allocation loop.', 'terminate 처리기는 반환하지 않고 프로그램을 끝내야 하며, new_handler 는 메모리를 확보하거나 std::bad_alloc 을 던지거나 종료해야 합니다. 그냥 반환하면 정의되지 않은 동작이나 무한 할당 반복이 됩니다.'],
    fix: ['End terminate/unexpected handlers with std::abort(); make new handlers free memory, throw std::bad_alloc or call std::set_new_handler(nullptr).', 'terminate/unexpected 처리기는 std::abort() 로 끝내고, new 처리기는 메모리를 해제하거나 std::bad_alloc 을 던지거나 std::set_new_handler(nullptr) 를 호출하세요.'],
  }, {
    check(unit, api) {
      const OUTPUT = /^(printf|fprintf|puts|fputs|perror|write|syslog|cerr|cout|clog|operator<<)$/;
      for (const c of U.libCalls(unit, new Set(['set_terminate', 'set_unexpected', 'set_new_handler']))) {
        const n = U.callName(c);
        const h = X.handlerFn(c.args[0], api.project);
        if (!h || !h.body) continue;
        const hname = h.type === 'LambdaExpr' ? 'lambda' : fnLabel(h);
        const exits = X.normalExits(h);
        if (!exits.length) continue;
        if (n === 'set_new_handler') {
          const own = (type) => cf.findAll(h.body, type).filter((x) => U.enclosingFn(x) === h);
          if (own('ThrowExpr').length || own('DeleteExpr').length) continue;
          const useful = own('CallExpr').some((x) => !OUTPUT.test(U.callName(x) || ''));
          if (useful) continue;
          api.report(c, M(`new_handler '${hname}' returns without freeing memory, throwing std::bad_alloc or terminating; operator new will loop forever.`, `new_handler '${hname}' 가 메모리 해제, std::bad_alloc 던지기, 종료 없이 반환해 operator new 가 무한 반복합니다.`));
        } else {
          api.report(c, M(`Handler '${hname}' installed with ${n}() can return; it must terminate the program (e.g. std::abort()).`, `${n}() 로 설치한 처리기 '${hname}' 가 반환할 수 있습니다. std::abort() 등으로 프로그램을 끝내야 합니다.`));
        }
      }
    },
  }),

  rule('OOP57-CPP', {
    langs: CPP, risk: 'HPH', cwe: ['CWE-758'], approx: true,
    name: ['Prefer special member functions and overloaded operators to C Standard Library functions', 'C 표준 라이브러리 함수보다 특수 멤버 함수와 연산자를 사용하세요'],
    why: ['memset/memcpy/memcmp/malloc/free bypass constructors, destructors and copy operations; on non-trivial classes they corrupt vtable pointers and owned resources or compare padding and pointers instead of values.', 'memset/memcpy/memcmp/malloc/free 는 생성자·소멸자·복사 연산을 건너뛰어, 비자명 클래스에서는 vtable 포인터와 소유 자원을 망가뜨리거나 값 대신 패딩과 포인터를 비교합니다.'],
    fix: ['Use constructors, assignment, operator== and new/delete (or containers) for objects of class type.', '클래스 형식 객체에는 생성자·대입·operator==·new/delete(또는 컨테이너)를 사용하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(Object.keys(MEMFNS)))) {
        const n = U.callName(c);
        for (const i of MEMFNS[n]) {
          const r = pointeeRec(c.args[i]);
          if (!r || !X.isNonTrivial(r)) continue;
          api.report(c, M(`${n}() is applied to an object of non-trivial class '${r.name}' (${X.nonTrivialReason(r)[0]}).`, `비자명 클래스 '${r.name}' 객체에 ${n}() 를 사용합니다(${X.nonTrivialReason(r)[1]}).`));
          break;
        }
      }
      for (const c of U.libCalls(unit, new Set(['malloc', 'calloc', 'realloc', 'aligned_alloc']))) {
        let p = U.parent(c);
        while (p && p.type === 'ParenExpr') p = U.parent(p);
        let r = null;
        if (p && p.type === 'CastExpr') r = X.recordOf(p.ctype, true);
        else if (p && p.type === 'VarDecl' && p.init) r = X.recordOf(p.ctype, true);
        if (!r || !X.isNonTrivial(r)) continue;
        api.report(c, M(`${U.callName(c)}() allocates storage for non-trivial class '${r.name}' without running its constructor; use new.`, `${U.callName(c)}() 가 비자명 클래스 '${r.name}' 의 생성자를 실행하지 않고 저장 공간만 할당합니다. new 를 사용하세요.`));
      }
      for (const c of U.libCalls(unit, new Set(['free']))) {
        const r = pointeeRec(c.args[0]);
        if (!r || !X.isNonTrivial(r)) continue;
        api.report(c, M(`free() releases an object of non-trivial class '${r.name}' without running its destructor; use delete.`, `free() 가 비자명 클래스 '${r.name}' 객체의 소멸자를 실행하지 않고 해제합니다. delete 를 사용하세요.`));
      }
    },
  }),

  rule('OOP58-CPP', {
    langs: CPP, risk: 'LLM', cwe: [], approx: true,
    name: ['Copy operations must not mutate the source object', '복사 연산은 원본 객체를 변경하면 안 됩니다'],
    why: ['Code (and the standard library) assumes that a copy leaves the source unchanged; a copy constructor or copy assignment that modifies its argument behaves like a hidden move (std::auto_ptr) and breaks containers and algorithms.', '코드와 표준 라이브러리는 복사가 원본을 바꾸지 않는다고 가정하므로, 인수를 바꾸는 복사 생성자·복사 대입은 숨은 이동(std::auto_ptr)처럼 동작해 컨테이너와 알고리즘을 망가뜨립니다.'],
    fix: ['Take the source as const T & and do not modify it; implement a move constructor / move assignment (T &&) for transfers of ownership.', '원본은 const T & 로 받아 바꾸지 말고, 소유권 이전에는 이동 생성자·이동 대입(T &&)을 구현하세요.'],
  }, {
    check(unit, api) {
      const seen = new Set();
      for (const fn of U.nodes(unit, 'FunctionDecl')) {
        const kind = X.copyKind(fn);
        if (!kind || fn.isDeleted) continue;
        const p = fn.params[0];
        const what = kind === 'ctor' ? 'Copy constructor' : 'Copy assignment operator';
        const whatKo = kind === 'ctor' ? '복사 생성자' : '복사 대입 연산자';
        if (fn.body && p.symbol) {
          let mutated = false;
          for (const n of X.ownNodes(fn, ['AssignExpr', 'UnaryExpr'])) {
            const t = n.type === 'AssignExpr' ? U.strip(n.left) : (n.op === '++' || n.op === '--') ? U.strip(n.arg) : null;
            if (!t || t.type !== 'MemberExpr') continue;
            let o = U.strip(t.object);
            while (o && o.type === 'MemberExpr') o = U.strip(o.object);
            if (U.idSym(o) !== p.symbol) continue;
            mutated = true;
            api.report(n, M(`${what} '${fnLabel(fn)}' modifies its source '${U.src(unit, t)}'.`, `${whatKo} '${fnLabel(fn)}' 가 원본 '${U.src(unit, t)}' 를 변경합니다.`));
          }
          if (mutated) continue;
        }
        if (!isNonConstRefParam(p)) continue;
        const key = fn.symbol || fn;
        if (seen.has(key)) continue;
        if (!fn.body && fn.symbol && fn.symbol.definition && fn.symbol.definition.body && fn.symbol.definition !== fn) continue;
        seen.add(key);
        api.report(p, M(`${what} '${fnLabel(fn)}' takes its source by non-const reference, so it can modify the object being copied.`, `${whatKo} '${fnLabel(fn)}' 가 원본을 비const 참조로 받아 복사 대상 객체를 바꿀 수 있습니다.`));
      }
    },
  }),
];
