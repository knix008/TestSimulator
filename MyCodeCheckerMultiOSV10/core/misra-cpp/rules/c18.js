'use strict';

// MISRA C++:2023 chapter 18 — exception handling.

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const { cf } = U;

function noexceptState(fd) {
  const d = U.fdecl(fd);
  if (!d || !d.noexcept) return fd.isDestructor ? 'implicit' : null;
  const e = d.noexceptExpr ? U.strip(d.noexceptExpr) : null;
  if (e && e.type === 'BoolLiteral' && !e.value) return 'false';
  return 'true';
}

// Is node inside the try-block (not a handler) of a TryStmt within fn?
function insideTryBody(n, fn) {
  let c = n;
  for (let p = U.parent(c); p && p !== fn; c = p, p = U.parent(p)) {
    if (p.type === 'TryStmt' && p.body === c && !p.functionTry) return true;
    if (p.type === 'LambdaExpr') return false;
  }
  return false;
}

const TERMINATE = new Set(['abort', 'exit', '_Exit', 'quick_exit', 'terminate']);

module.exports = [
  R({
    id: '18.1.1', cat: 'Required', dec: true, autosar: 'A15-1-2', sev: 'MAJOR', debt: 5,
    name: ['An exception object shall not have pointer type', '예외 객체는 포인터 타입이면 안 됩니다'],
    why: ['It is unclear who owns a thrown pointer and whether the pointee still exists when it is caught.', '던진 포인터를 누가 소유하는지, 잡을 때 가리키는 객체가 아직 있는지 불분명합니다.'],
    fix: ['Throw an object by value.', '객체를 값으로 던지세요.'],
    check(unit, api) {
      for (const t of U.ix(unit).get('ThrowExpr')) {
        if (!t.arg) continue;
        const ty = U.strip(t.arg).ctype;
        if (ty && (U.canon(ty).kind === 'pointer' || U.canon(ty).kind === 'array')) api.report(t, M(`The thrown exception object has pointer type '${U.tstr(ty)}'.`, `던지는 예외 객체가 포인터 타입 '${U.tstr(ty)}' 입니다.`));
      }
    },
  }),
  R({
    id: '18.1.2', cat: 'Required', dec: true, type: 'BUG', autosar: 'M15-1-3', sev: 'MAJOR', debt: 5,
    name: ['An empty throw shall only occur within the compound-statement of a catch handler', '빈 throw 는 catch 처리기의 복합문 안에서만 써야 합니다'],
    why: ['A rethrow with no exception being handled calls std::terminate.', '처리 중인 예외 없이 다시 던지면 std::terminate 가 호출됩니다.'],
    fix: ['Only use "throw;" lexically inside a catch handler.', '"throw;" 는 문법적으로 catch 처리기 안에서만 쓰세요.'],
    check(unit, api) {
      for (const t of U.ix(unit).get('ThrowExpr')) {
        if (t.arg) continue;
        const h = cf.enclosing(t, ['CatchClause', 'FunctionDecl', 'LambdaExpr']);
        if (!h || h.type !== 'CatchClause') api.report(t, M('An empty throw is used outside a catch handler.', 'catch 처리기 밖에서 빈 throw 를 씁니다.'));
      }
    },
  }),
  R({
    id: '18.3.1', cat: 'Advisory', dec: true, autosar: 'A15-3-3', cert: 'ERR51-CPP', sev: 'MINOR', debt: 10,
    name: ['There should be at least one exception handler to catch all otherwise unhandled exceptions', '처리되지 않은 모든 예외를 잡는 처리기가 적어도 하나 있어야 합니다'],
    why: ['An exception escaping main terminates the program without stack unwinding being guaranteed.', 'main 밖으로 빠져나간 예외는 스택 되감기 보장 없이 프로그램을 종료합니다.'],
    fix: ['Wrap the body of main in a try block with a catch (...) handler.', 'main 본문을 catch (...) 처리기가 있는 try 블록으로 감싸세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).funcs) {
        if (f.name !== 'main' || f.qualifier || cf.enclosing(f, ['RecordDecl', 'NamespaceDecl'])) continue;
        const tries = f.body.type === 'TryStmt' ? [f.body] : (f.body.body || []).filter((s) => s.type === 'TryStmt');
        if (!tries.some((t) => t.handlers.some((h) => h.catchAll))) api.report(f, M("'main' has no catch (...) handler for otherwise unhandled exceptions.", "'main' 에 처리되지 않은 예외를 잡는 catch (...) 처리기가 없습니다."));
      }
    },
  }),
  R({
    id: '18.3.2', cat: 'Required', dec: true, type: 'BUG', autosar: 'A15-3-5', cert: 'ERR61-CPP', sev: 'MAJOR', debt: 5,
    name: ['An exception of class type shall be caught by const reference or reference', '클래스 타입의 예외는 const 참조나 참조로 잡아야 합니다'],
    why: ['Catching by value copies the exception and slices derived exception types.', '값으로 잡으면 예외가 복사되고 파생 예외 타입이 잘려 나갑니다.'],
    fix: ['Catch by (const) reference: "catch (const E& e)".', '(const) 참조로 잡으세요: "catch (const E& e)".'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CatchClause')) {
        const p = c.param;
        if (!p || !p.ctype) continue;
        const t = U.canon(p.ctype);
        const ts = p.specs && p.specs.typeSpec;
        const classLike = t.kind === 'record' || (t.kind === 'unknown' && ts && ts.type === 'NamedType');
        if (classLike) api.report(p, M(`Exception of class type '${U.tstr(p.ctype)}' is caught by value.`, `클래스 타입 예외 '${U.tstr(p.ctype)}' 를 값으로 잡습니다.`));
      }
    },
  }),
  R({
    id: '18.3.3', cat: 'Required', dec: true, type: 'BUG', autosar: 'M15-3-3', cert: 'ERR53-CPP', sev: 'MAJOR', debt: 10,
    name: ['Handlers for a function-try-block of a constructor or destructor shall not refer to non-static members from their class or its bases', '생성자·소멸자 함수 try 블록의 처리기는 클래스나 기반의 비정적 멤버를 참조하면 안 됩니다'],
    why: ['When the handler runs, the members and bases have already been destroyed; accessing them is undefined behaviour.', '처리기가 실행될 때 멤버와 기반은 이미 파괴되었으므로 접근하면 정의되지 않은 동작입니다.'],
    fix: ['Only use parameters and static members in such handlers.', '이런 처리기에서는 매개변수와 정적 멤버만 쓰세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).funcs) {
        if (!(f.isConstructor || f.isDestructor) || f.body.type !== 'TryStmt') continue;
        for (const h of f.body.handlers) {
          cf.walk(h.body, (n) => {
            if (n.type === 'LambdaExpr') return cf.walk.SKIP;
            if (n.type === 'ThisExpr') api.report(n, M("'this' is used in a constructor/destructor function-try-block handler.", "생성자/소멸자 함수 try 블록 처리기에서 'this' 를 씁니다."));
            if (n.type === 'Identifier' && n.symbol && n.symbol.kind === 'field' && !n.symbol.isStatic && n.implicitThis !== false && n.symbol.storage !== 'static') api.report(n, M(`Non-static member '${n.name}' is used in a constructor/destructor function-try-block handler.`, `생성자/소멸자 함수 try 블록 처리기에서 비정적 멤버 '${n.name}' 를 씁니다.`));
            return undefined;
          });
        }
      }
    },
  }),
  R({
    id: '18.4.1', cat: 'Required', dec: true, autosar: 'A15-5-1', cert: 'DCL57-CPP', sev: 'MAJOR', debt: 5,
    name: ['Exception-unfriendly functions shall be noexcept', '예외에 부적합한 함수는 noexcept 여야 합니다'],
    why: ['Destructors, move operations, swap and deallocation functions that may throw break the exception-safety guarantees of the library and of containers.', '예외를 던질 수 있는 소멸자, 이동 연산, swap, 해제 함수는 라이브러리와 컨테이너의 예외 안전성 보장을 깨뜨립니다.'],
    fix: ['Declare these functions noexcept (do not use noexcept(false)).', '이 함수들을 noexcept 로 선언하세요 (noexcept(false) 를 쓰지 마세요).'],
    check(unit, api) {
      const seen = new Set();
      for (const fd of U.ix(unit).get('FunctionDecl')) {
        if (fd.isDeleted || fd.isDefault) continue;
        const key = fd.symbol || fd;
        const st = noexceptState(fd);
        let what = null;
        if (fd.isDestructor) { if (st === 'false') what = ['destructor', '소멸자']; } else if (/^operator delete(\[\])?$/.test(fd.name || '')) { if (st === 'false') what = ['deallocation function', '해제 함수']; } else if (fd.name === 'swap' && (U.paramCount(fd) === 1 || U.paramCount(fd) === 2)) { if (!st) what = ['swap function', 'swap 함수']; } else {
          const rec = U.ownerRecord(unit, fd);
          const k = rec ? U.specialKind(fd, rec.name) : null;
          if ((k === 'moveCtor' || k === 'moveAssign') && !st) what = [k === 'moveCtor' ? 'move constructor' : 'move assignment operator', k === 'moveCtor' ? '이동 생성자' : '이동 대입 연산자'];
        }
        if (!what || seen.has(key)) continue;
        seen.add(key);
        api.report(fd, M(`The ${what[0]} '${fd.qname || fd.name}' is not noexcept.`, `${what[1]} '${fd.qname || fd.name}' 가 noexcept 가 아닙니다.`));
      }
    },
  }),
  R({
    id: '18.5.1', cat: 'Advisory', dec: false, type: 'BUG', autosar: 'A15-4-2', cert: 'ERR55-CPP', sev: 'MAJOR', debt: 10,
    name: ['A noexcept function should not attempt to propagate an exception to the calling function', 'noexcept 함수는 호출자에게 예외를 전파하려 하지 않아야 합니다'],
    why: ['An exception leaving a noexcept function calls std::terminate.', 'noexcept 함수에서 빠져나가는 예외는 std::terminate 를 호출합니다.'],
    fix: ['Catch the exception inside the function, or remove noexcept.', '함수 안에서 예외를 잡거나 noexcept 를 없애세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).funcs) {
        const st = noexceptState(f);
        if (st !== 'true' && st !== 'implicit') continue;
        for (const t of cf.findAll(f.body, 'ThrowExpr')) {
          if (U.fnOf(t) !== f) continue;
          const h = t.arg ? null : cf.enclosing(t, ['CatchClause', 'FunctionDecl', 'LambdaExpr']);
          const at = h && h.type === 'CatchClause' ? h : t;
          if (insideTryBody(at, f)) continue;
          api.report(t, M(`An exception may propagate out of the noexcept function '${f.qname || f.name}'.`, `noexcept 함수 '${f.qname || f.name}' 밖으로 예외가 전파될 수 있습니다.`));
        }
      }
    },
  }),
  R({
    id: '18.5.2', cat: 'Advisory', dec: true, autosar: 'M18-0-3', cert: 'ERR50-CPP', sev: 'MINOR', debt: 10,
    name: ['Program-terminating functions should not be used', '프로그램을 종료하는 함수는 쓰지 않아야 합니다'],
    why: ['abort, exit, quick_exit and terminate end the program without normal stack unwinding, so destructors may not run.', 'abort, exit, quick_exit, terminate 는 정상적인 스택 되감기 없이 프로그램을 끝내서 소멸자가 실행되지 않을 수 있습니다.'],
    fix: ['Report the error to the caller (return value or exception) and let main decide.', '오류를 호출자에게 (반환값이나 예외로) 알리고 main 이 결정하게 하세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CallExpr')) {
        const n = U.isLibCall(c, TERMINATE);
        if (n) api.report(c, M(`Program-terminating function '${n}' is called.`, `프로그램 종료 함수 '${n}' 를 호출합니다.`));
      }
    },
  }),
];
