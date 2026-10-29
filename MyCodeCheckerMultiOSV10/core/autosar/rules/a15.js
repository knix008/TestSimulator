'use strict';

// AUTOSAR C++14 chapter 15 — exception handling (thrown types, handlers,
// noexcept, termination) and MISRA C++:2008 M15 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

const TERMINATE = new Set(['abort', 'quick_exit', '_Exit', 'terminate']);

const throwsIn = (fn) => {
  const out = [];
  U.walkBody(fn, (n) => { if (n.type === 'ThrowExpr') out.push(n); return undefined; });
  return out;
};
const insideTry = (n, stop) => {
  for (const a of cf.ancestors(n)) {
    if (a === stop) return false;
    if (a.type === 'TryStmt' && cf.ancestors(n).includes(a.body)) return true;
  }
  return false;
};

function noexceptOf(fd) {
  const d = U.fdecl(fd);
  if (!d) return null;
  if (!d.noexcept) return false;
  const e = d.noexceptExpr ? U.strip(d.noexceptExpr) : null;
  if (e && e.type === 'BoolLiteral') return e.value;
  return e ? null : true;
}

function derivesFromException(rec, depth = 0) {
  if (!rec || depth > 20) return false;
  if (/exception|error/i.test(rec.name || '')) return true;
  for (const b of U.bases(rec)) {
    const n = String(b.spec.qname || b.spec.name || '');
    if (/^(::)?std::/.test(n) || /exception|error/i.test(n)) return true;
    if (!b.rec) return true; // unknown base (library type): assume it may derive from std::exception
    if (derivesFromException(b.rec, depth + 1)) return true;
  }
  return false;
}

const handlerRecord = (h) => {
  const t = h.param && h.param.ctype ? U.nonRef(h.param.ctype) : null;
  return t && t.kind === 'record' ? t : null;
};

module.exports = [
  A({
    id: 'A15-1-1', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['Only instances of types derived from std::exception should be thrown', 'std::exception 에서 파생된 형식의 객체만 던져야 합니다'],
    why: ['A common exception base lets handlers catch every error uniformly and get a description via what().', '공통 예외 기반이 있어야 처리기가 모든 오류를 일관되게 잡고 what() 으로 설명을 얻을 수 있습니다.'],
    fix: ['Throw an object of a class derived from std::exception.', 'std::exception 에서 파생된 클래스의 객체를 던지세요.'],
    check(unit, api) {
      for (const t of U.ix(unit).get('ThrowExpr')) {
        if (!t.arg) continue;
        const ty = t.arg.ctype ? U.nonRef(t.arg.ctype) : null;
        if (!ty || U.unknownT(ty)) continue;
        let bad = null;
        if (ty.kind === 'record') { if (!derivesFromException(ty)) bad = ty.name; } else if (ty.kind !== 'pointer') bad = U.tstr(ty); // pointers: A15-1-2
        if (bad) api.report(t, M(`An object of type '${bad}', which does not derive from std::exception, is thrown.`, `std::exception 에서 파생되지 않은 '${bad}' 형식 객체를 던집니다.`));
      }
    },
  }),
  D('A15-1-2', ['18.1.1'], { cat: 'Required', name: ['An exception object shall not be a pointer', '예외 객체는 포인터이면 안 됩니다'] }),
  D('A15-3-3', ['18.3.1'], { cat: 'Required', name: ['The main function and task entry points shall catch all exceptions', 'main 함수와 태스크 진입점은 모든 예외를 잡아야 합니다'] }),
  A({
    id: 'A15-3-4', cat: 'Required', enf: 'partially automated', sev: 'MINOR', debt: 5,
    name: ['catch (...) shall only be used in main, task entry points and isolation boundaries', 'catch (...) 는 main, 태스크 진입점, 격리 경계에서만 써야 합니다'],
    why: ['Catching every exception deep inside the code swallows errors that callers should see.', '코드 깊은 곳에서 모든 예외를 잡으면 호출자가 알아야 할 오류를 삼킵니다.'],
    fix: ['Catch the specific exception types, or move the catch-all to main / the task entry.', '구체적인 예외 형식을 잡거나 catch-all 을 main / 태스크 진입점으로 옮기세요.'],
    check(unit, api) {
      for (const h of U.ix(unit).get('CatchClause')) {
        if (!h.catchAll) continue;
        const fn = cf.enclosing(h, ['FunctionDecl', 'LambdaExpr']);
        if (fn && fn.type === 'FunctionDecl' && U.isMain(fn)) continue;
        // a catch-all that rethrows is not swallowing
        if (h.body && cf.findFirst(h.body, (n) => n.type === 'ThrowExpr' && !n.arg)) continue;
        api.report(h, M(`catch (...) is used in '${fn && fn.name ? fn.name : 'a lambda'}', which is not main.`, `main 이 아닌 '${fn && fn.name ? fn.name : '람다'}' 에서 catch (...) 를 씁니다.`));
      }
    },
  }),
  D('A15-3-5', ['18.3.2'], { name: ['A class type exception shall be caught by reference or const reference', '클래스 형식 예외는 참조나 const 참조로 잡아야 합니다'] }),
  A({
    id: 'A15-4-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['Dynamic exception-specification shall not be used', '동적 예외 명세(throw(...))는 쓰면 안 됩니다'],
    why: ['throw(...) specifications are deprecated (removed in C++17) and call std::unexpected at run time.', 'throw(...) 명세는 폐기 예정이며(C++17 에서 제거) 실행 중 std::unexpected 를 호출합니다.'],
    fix: ['Use noexcept or noexcept(false).', 'noexcept 나 noexcept(false) 를 쓰세요.'],
    check(unit, api) {
      for (const d of U.ix(unit).get('FunctionDeclarator')) if (d.throwSpec !== undefined && d.throwSpec !== null) api.report(d, M('A dynamic exception specification is used.', '동적 예외 명세를 씁니다.'));
    },
  }),
  D('A15-4-2', ['18.5.1'], { cat: 'Required', name: ['A function declared noexcept shall not exit with an exception', 'noexcept 로 선언한 함수는 예외로 끝나면 안 됩니다'] }),
  A({
    id: 'A15-4-3', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['The noexcept specification of a function shall be identical across all its declarations', '함수의 noexcept 명세는 모든 선언에서 같아야 합니다'],
    why: ['Declarations that disagree on noexcept are ill-formed or mislead callers about the exception guarantee.', 'noexcept 가 서로 다른 선언은 잘못된 코드이거나 호출자에게 예외 보장을 잘못 알립니다.'],
    fix: ['Use the same noexcept specification on every declaration.', '모든 선언에 같은 noexcept 명세를 쓰세요.'],
    check(unit, api) {
      for (const s of unit.symbols || []) {
        if (s.kind !== 'function' || s.system) continue;
        const decls = (s.decls || []).filter((d) => d.type === 'FunctionDecl' && U.user(d));
        if (decls.length < 2) continue;
        const first = noexceptOf(decls[0]);
        for (const d of decls.slice(1)) {
          const n = noexceptOf(d);
          if (n !== null && first !== null && n !== first) api.report(U.at(d), M(`This declaration of '${s.name}' has a different noexcept specification than the first one.`, `'${s.name}' 의 이 선언은 첫 선언과 noexcept 명세가 다릅니다.`));
        }
      }
    },
  }),
  A({
    id: 'A15-4-4', cat: 'Required', enf: 'partially automated', sev: 'MINOR', debt: 2,
    name: ['A declaration of a non-throwing function shall contain a noexcept specification', '예외를 던지지 않는 함수의 선언에는 noexcept 를 써야 합니다'],
    why: ['noexcept documents the guarantee, enables optimizations and is required for efficient moves in containers.', 'noexcept 는 보장을 문서화하고 최적화를 가능하게 하며 컨테이너의 효율적인 이동에 필요합니다.'],
    fix: ['Add noexcept to the declaration.', '선언에 noexcept 를 붙이세요.'],
    check(unit, api) {
      const scalar = (t) => { const c = t ? U.nonRef(t) : null; return !!(c && (c.kind === 'int' || c.kind === 'float' || c.kind === 'enum' || c.kind === 'pointer' || c.kind === 'void' || c.kind === 'nullptr')); };
      for (const f of U.fnDefs(unit)) {
        if (!f.body || f.body.type !== 'CompoundStmt' || f.isDestructor || U.inTemplate(f) || noexceptOf(f) !== false) continue;
        if (f.isConstructor && (f.ctorInits || []).length) continue;
        // `C::C() {}` still default-constructs the bases and members, and a
        // member such as std::list or a mutex wrapper may throw doing so
        if (f.isConstructor) {
          const rec = U.ownerRecord(unit, f);
          const plain = (t) => { const c = t ? U.canon(t) : null; return !!c && (scalar(c) || (c.kind === 'array' && scalar(U.canon(c.of)))); };
          if (!rec || U.bases(rec).length || !U.fields(rec).every((m) => plain(m.node.ctype))) continue;
        }
        const ft = f.ctype ? U.canon(f.ctype) : null;
        if (!ft || ft.kind !== 'function' || !scalar(ft.ret) || !(f.params || []).every((p) => !p.ctype || scalar(p.ctype) || U.canon(p.ctype).kind === 'reference')) continue;
        let mayThrow = false;
        cf.walk(f.body, (n) => {
          if (mayThrow) return cf.walk.STOP;
          if (['CallExpr', 'NewExpr', 'ThrowExpr', 'DeleteExpr', 'TypeidExpr', 'LambdaExpr', 'AsmStmt', 'TryStmt'].includes(n.type)) mayThrow = true;
          else if (n.type === 'CastExpr' && n.kind === 'dynamic_cast') mayThrow = true;
          else if (n.ctype && !scalar(n.ctype) && n.type !== 'StringLiteral' && !['TypeName', 'DeclSpec'].includes(n.type) && U.canon(n.ctype).kind !== 'array' && U.canon(n.ctype).kind !== 'function') mayThrow = true;
          return undefined;
        });
        if (!mayThrow) api.report(U.at(f), M(`'${f.name}' cannot throw but is not declared noexcept.`, `'${f.name}' 은(는) 예외를 던질 수 없지만 noexcept 로 선언되지 않았습니다.`));
      }
    },
  }),
  D('A15-5-1', ['18.4.1'], { name: ['Destructors, deallocation functions, move operations and swap shall not exit with an exception and shall be noexcept', '소멸자, 해제 함수, 이동 연산, swap 은 예외로 끝나면 안 되며 noexcept 여야 합니다'] }),
  A({
    id: 'A15-5-2', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 10,
    name: ['Program shall not be abruptly terminated (std::abort, std::quick_exit, std::_Exit, std::terminate)', '프로그램을 갑자기 종료하면 안 됩니다(std::abort, std::quick_exit, std::_Exit, std::terminate)'],
    why: ['Abrupt termination skips destructors and leaves resources and data in an inconsistent state.', '갑작스러운 종료는 소멸자를 건너뛰어 자원과 데이터를 일관성 없는 상태로 남깁니다.'],
    fix: ['Report the error by an exception or a return value and terminate through main.', '오류를 예외나 반환값으로 알리고 main 을 통해 종료하세요.'],
    check(unit, api) {
      for (const { c, n } of U.stdCalls(unit, TERMINATE)) api.report(c, M(`'${n}' terminates the program abruptly.`, `'${n}' 이(가) 프로그램을 갑자기 종료합니다.`));
    },
  }),
  A({
    id: 'A15-5-3', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'CRITICAL', debt: 10,
    name: ['The std::terminate function shall not be called implicitly', 'std::terminate 가 암시적으로 호출되면 안 됩니다'],
    why: ['An exception escaping a destructor (implicitly noexcept) or a rethrow without an active exception calls std::terminate.', '(암시적으로 noexcept 인) 소멸자에서 빠져나가는 예외나 활성 예외 없는 재던지기는 std::terminate 를 호출합니다.'],
    fix: ['Catch exceptions inside destructors and only rethrow inside handlers.', '소멸자 안에서 예외를 잡고, 재던지기는 처리기 안에서만 하세요.'],
    check(unit, api) {
      for (const f of U.fnDefs(unit)) {
        if (!f.isDestructor) continue;
        for (const t of throwsIn(f)) if (!insideTry(t, f)) api.report(t, M(`An exception is thrown out of the destructor '${f.name}'.`, `소멸자 '${f.name}' 밖으로 예외를 던집니다.`));
      }
      for (const t of U.ix(unit).get('ThrowExpr')) {
        if (t.arg) continue;
        const fn = U.fnOf(t);
        if (fn && !cf.ancestors(t).some((a) => a.type === 'CatchClause')) {
          const fname = fn.name || 'lambda';
          if (fn.type === 'FunctionDecl' && noexceptOf(fn) === true) api.report(t, M(`A rethrow outside any handler in the noexcept function '${fname}' calls std::terminate.`, `noexcept 함수 '${fname}' 에서 처리기 밖의 재던지기는 std::terminate 를 호출합니다.`));
        }
      }
    },
  }),
  // ------------------------------------------------------- MISRA C++:2008 M15
  A({
    id: 'M15-0-3', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['Control shall not be transferred into a try or catch block using goto or switch', 'goto 나 switch 로 try 나 catch 블록 안으로 제어를 옮기면 안 됩니다'],
    why: ['Jumping into a try block or a handler is ill-formed and bypasses the exception handling set-up.', 'try 블록이나 처리기 안으로 뛰어드는 것은 잘못된 코드이며 예외 처리 준비를 건너뜁니다.'],
    fix: ['Restructure the code so jumps stay outside the try/catch blocks.', '점프가 try/catch 블록 밖에 머물도록 코드를 다시 구성하세요.'],
    check(unit, api) {
      const guarded = (n) => cf.ancestors(n).filter((a) => a.type === 'TryStmt' || a.type === 'CatchClause');
      for (const g of U.ix(unit).get('GotoStmt')) {
        const target = g.labelSymbol && g.labelSymbol.decls && g.labelSymbol.decls[0];
        if (!target) continue;
        const from = new Set(guarded(g));
        if (guarded(target).some((b) => !from.has(b))) api.report(g, M(`goto '${g.label}' jumps into a try or catch block.`, `goto '${g.label}' 가 try 나 catch 블록 안으로 뛰어듭니다.`));
      }
      for (const sw of U.ix(unit).get('SwitchStmt')) {
        cf.walk(sw.body, (n) => {
          if (n.type === 'SwitchStmt') return cf.walk.SKIP;
          if ((n.type === 'CaseStmt' || n.type === 'DefaultStmt') && guarded(n).some((b) => cf.ancestors(b).includes(sw))) api.report(n, M('A switch label is placed inside a try or catch block.', 'switch 레이블이 try 나 catch 블록 안에 있습니다.'));
          return undefined;
        });
      }
    },
  }),
  A({
    id: 'M15-1-2', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['NULL shall not be thrown explicitly', 'NULL 을 명시적으로 던지면 안 됩니다'],
    why: ['throw NULL throws an integer, not a pointer, so pointer handlers do not catch it.', 'throw NULL 은 포인터가 아니라 정수를 던지므로 포인터 처리기가 잡지 못합니다.'],
    fix: ['Throw an exception object.', '예외 객체를 던지세요.'],
    check(unit, api) {
      for (const t of U.ix(unit).get('ThrowExpr')) {
        const e = U.strip(t.arg);
        if (e && (e.loc.macro === 'NULL' || (e.type === 'IntegerLiteral' && e.value === 0n))) api.report(t, M('NULL (the integer zero) is thrown.', 'NULL(정수 0)을 던집니다.'));
      }
    },
  }),
  D('M15-1-3', ['18.1.2']),
  D('M15-3-3', ['18.3.3']),
  A({
    id: 'M15-3-6', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 5,
    name: ['Handlers for a derived class and its base shall be ordered most-derived first', '파생 클래스와 그 기반 클래스의 처리기는 가장 파생된 것부터 두어야 합니다'],
    why: ['A base-class handler placed first catches the derived exceptions too, so the later handler is dead code.', '기반 클래스 처리기를 먼저 두면 파생 예외까지 잡아서 뒤의 처리기는 죽은 코드가 됩니다.'],
    fix: ['Move the derived-class handler before the base-class handler.', '파생 클래스 처리기를 기반 클래스 처리기 앞으로 옮기세요.'],
    check(unit, api) {
      for (const t of U.ix(unit).get('TryStmt')) {
        const hs = t.handlers || [];
        for (let j = 1; j < hs.length; j++) {
          const rj = handlerRecord(hs[j]);
          if (!rj) continue;
          for (let i = 0; i < j; i++) {
            const ri = handlerRecord(hs[i]);
            if (ri && ri.decl !== rj.decl && [...U.allBases(rj).keys()].some((b) => b === ri || (b.decl && b.decl === ri.decl))) { api.report(hs[j], M(`The handler for '${rj.name}' follows the handler for its base '${ri.name}' and is never reached.`, `'${rj.name}' 의 처리기가 기반 '${ri.name}' 처리기 뒤에 있어 실행되지 않습니다.`)); break; }
          }
        }
      }
    },
  }),
  A({
    id: 'M15-3-7', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['A catch-all handler (...) shall be the last handler of a try block', 'catch-all 처리기 (...) 는 try 블록의 마지막 처리기여야 합니다'],
    why: ['Handlers after catch (...) can never be reached.', 'catch (...) 뒤의 처리기는 결코 실행되지 않습니다.'],
    fix: ['Move catch (...) to the end.', 'catch (...) 를 맨 끝으로 옮기세요.'],
    check(unit, api) {
      for (const t of U.ix(unit).get('TryStmt')) {
        const hs = t.handlers || [];
        hs.forEach((h, i) => { if (h.catchAll && i < hs.length - 1) api.report(h, M('catch (...) is not the last handler.', 'catch (...) 가 마지막 처리기가 아닙니다.')); });
      }
    },
  }),
];
