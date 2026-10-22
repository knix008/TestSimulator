'use strict';

// SEI CERT C++ — ERR: exceptions and error handling.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const F = require('../lib/fmt');
const X = require('../lib/cppx');
const { M, T, cf } = U;

const CPP = ['cpp'];
const TERMINATORS = new Set(['abort', 'terminate', 'quick_exit', '_Exit', 'exit']);

const fnLabel = (fn) => X.label(fn);

// Allocating std:: classes whose construction / copy may throw.
const STD_ALLOC = new Set(['string', 'wstring', 'u16string', 'u32string', 'u8string', 'vector', 'list', 'deque', 'map', 'multimap', 'set', 'multiset',
  'unordered_map', 'unordered_set', 'unordered_multimap', 'unordered_multiset', 'function', 'basic_string', 'regex', 'locale', 'shared_ptr',
  'ifstream', 'ofstream', 'fstream', 'stringstream', 'istringstream', 'ostringstream', 'thread']);
const stdBare = (n) => { const m = /^(::)?std::(\w+)/.exec(String(n || '')); return m ? m[2] : null; };

function isConstantInit(e) {
  e = U.strip(e);
  if (!e) return true;
  if (['StringLiteral', 'IntegerLiteral', 'FloatingLiteral', 'CharLiteral', 'BoolLiteral', 'NullptrLiteral'].includes(e.type)) return true;
  if (e.type === 'ParenListInit') return (e.args || []).every(isConstantInit);
  if (e.type === 'InitList') return (e.items || []).every(isConstantInit);
  if (e.type === 'UnaryExpr' && (e.op === '-' || e.op === '+')) return isConstantInit(e.arg);
  return false;
}

// Is `node` inside a try (within fn) whose handler deletes `sym` or swallows the exception?
function protectedFromLeak(node, fn, sym) {
  let n = node;
  let p = cf.parentOf(n);
  while (p && p !== fn) {
    if (p.type === 'TryStmt' && cf.parentKey(n) === 'body') {
      for (const h of p.handlers || []) {
        const deletes = cf.findFirst(h.body, (x) => x.type === 'DeleteExpr' && U.idSym(x.arg) === sym);
        const exits = cf.findFirst(h.body, (x) => x.type === 'ThrowExpr' || x.type === 'ReturnStmt');
        if (deletes || !exits) return true;
      }
    }
    n = p;
    p = cf.parentOf(n);
  }
  return false;
}

function copyCtorOf(rec) {
  for (const s of X.ctorSyms(rec)) {
    for (const d of X.fnDecls(s)) if (X.copyKind(d) === 'ctor') return d;
  }
  return null;
}

// Why copying an exception object of class `rec` may throw (null when it cannot).
function copyMayThrow(rec, depth = 0) {
  if (!rec || depth > 10) return null;
  const cc = copyCtorOf(rec);
  if (cc && !cc.isDefault && !X.isNoexcept(cc)) return [`its copy constructor ${X.bareName(rec)}(const ${X.bareName(rec)} &) is not noexcept`, `복사 생성자 ${X.bareName(rec)}(const ${X.bareName(rec)} &) 가 noexcept 가 아닙니다`];
  if (cc && !cc.isDefault && X.isNoexcept(cc)) return null;
  for (const f of rec.fields || []) {
    const d = f.node;
    if (d && d.specs && d.specs.storage && d.specs.storage.includes('static')) continue;
    const n = stdBare((d && U.declTypeName(d)) || U.typeName(f.type));
    if (n && STD_ALLOC.has(n)) return [`member '${f.name}' is a std::${n}, whose copy may throw`, `멤버 '${f.name}' 가 복사 시 예외를 던질 수 있는 std::${n} 입니다`];
    const r = X.recordOf(f.type);
    if (r) { const w = copyMayThrow(r, depth + 1); if (w) return [`member '${f.name}': ${w[0]}`, `멤버 '${f.name}': ${w[1]}`]; }
  }
  for (const b of X.baseRecords(rec)) { const w = copyMayThrow(b, depth + 1); if (w) return w; }
  return null;
}

const SCAN_NUM = /[diouxXaAeEfFgG]/;

module.exports = [
  rule('ERR50-CPP', {
    langs: CPP, risk: 'LPM', cwe: ['CWE-705'], approx: true,
    name: ['Do not abruptly terminate the program', '프로그램을 갑자기 종료하지 마세요'],
    why: ['std::abort, std::terminate, std::quick_exit and std::_Exit end the program without unwinding the stack, so destructors do not run and resources (files, locks, buffers) are not released. A throw that escapes a noexcept function or a destructor also calls std::terminate.', 'std::abort, std::terminate, std::quick_exit, std::_Exit 는 스택을 풀지 않고 끝내므로 소멸자가 실행되지 않고 파일·잠금·버퍼가 정리되지 않습니다. noexcept 함수나 소멸자에서 빠져나가는 예외도 std::terminate 를 부릅니다.'],
    fix: ['Report the error by throwing an exception (caught in main) or returning an error code; do not throw out of destructors or noexcept functions.', '예외를 던져 main 에서 잡거나 오류 코드를 반환하세요. 소멸자나 noexcept 함수 밖으로 예외를 던지지 마세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, TERMINATORS)) {
        const fn = U.enclosingFn(c);
        const n = U.callName(c);
        if (n === 'exit' && fn && fn.name === 'main' && !fn.qualifier) continue;
        api.report(c, M(`${n}() terminates the program abruptly in '${fnLabel(fn)}'; automatic objects are not destroyed.`, `'${fnLabel(fn)}' 에서 ${n}() 가 프로그램을 갑자기 끝내 자동 객체가 소멸되지 않습니다.`));
      }
      for (const fn of U.functions(unit)) {
        const spec = X.exceptionSpec(fn);
        if (spec.kind !== 'noexcept' && spec.kind !== 'throw()') continue;
        for (const th of X.ownNodes(fn, 'ThrowExpr')) {
          if (X.caughtIn(th, fn, X.thrownType(th))) continue;
          const what = fn.isDestructor ? `destructor '${fnLabel(fn)}' (implicitly noexcept)` : `noexcept function '${fnLabel(fn)}'`;
          const whatKo = fn.isDestructor ? `암시적 noexcept 인 소멸자 '${fnLabel(fn)}'` : `noexcept 함수 '${fnLabel(fn)}'`;
          api.report(th, M(`Exception thrown out of ${what} calls std::terminate.`, `${whatKo} 밖으로 던진 예외는 std::terminate 를 부릅니다.`));
        }
      }
    },
  }),

  rule('ERR51-CPP', {
    langs: CPP, risk: 'LPL', cwe: ['CWE-754', 'CWE-703'], approx: true,
    name: ['Handle all exceptions', '모든 예외를 처리하세요'],
    why: ['An exception that leaves main() calls std::terminate; whether the stack is unwound (and destructors run) is implementation-defined.', 'main() 을 빠져나간 예외는 std::terminate 를 부르며, 스택이 풀리고 소멸자가 실행되는지는 구현에 따라 다릅니다.'],
    fix: ['Wrap the body of main() (and thread entry functions) in try { ... } catch (...) { ... }.', 'main() 과 스레드 진입 함수의 본문을 try { ... } catch (...) { ... } 로 감싸세요.'],
  }, {
    check(unit, api) {
      const S = X.summaryFor(api.project);
      for (const fn of U.functions(unit)) {
        if (fn.name !== 'main' || fn.qualifier || cf.enclosing(fn, ['RecordDecl', 'NamespaceDecl'])) continue;
        const esc = S.escaping(fn, { requireCatchAll: true });
        if (!esc.length) continue;
        const e = esc[0];
        api.report(e.node, M(`main() lets an exception escape (${X.describeThrow(unit, e)}) without an enclosing catch (...).`, `main() 에서 예외(${X.describeThrowKo(unit, e)})가 catch (...) 없이 빠져나갑니다.`));
      }
    },
  }),

  rule('ERR52-CPP', {
    langs: CPP, risk: 'LPM', cwe: [], approx: false,
    name: ['Do not use setjmp() or longjmp()', 'setjmp() 나 longjmp() 를 사용하지 마세요'],
    why: ['longjmp() skips destructors of automatic objects between the jump points; when a non-trivial destructor would have run, the behavior is undefined.', 'longjmp() 는 사이에 있는 자동 객체의 소멸자를 건너뛰며, 비자명 소멸자가 있으면 정의되지 않은 동작입니다.'],
    fix: ['Use C++ exceptions (throw / catch) for non-local control transfer.', '비지역 제어 이동에는 C++ 예외(throw/catch)를 사용하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['setjmp', '_setjmp', 'sigsetjmp', 'longjmp', '_longjmp', 'siglongjmp']))) {
        api.report(c, M(`${U.callName(c)}() is used in C++ code; it bypasses destructors of automatic objects.`, `C++ 코드에서 ${U.callName(c)}() 를 사용해 자동 객체의 소멸자를 건너뜁니다.`));
      }
    },
  }),

  rule('ERR53-CPP', {
    langs: CPP, risk: 'LUM', cwe: [], approx: true,
    name: ['Do not reference base classes or class data members in a constructor or destructor function-try-block handler', '생성자·소멸자의 함수 try 블록 처리기에서 기반 클래스나 데이터 멤버를 참조하지 마세요'],
    why: ['When the handler of a constructor or destructor function-try-block runs, the members and bases have already been destroyed; reading them is undefined behavior.', '생성자·소멸자의 함수 try 블록 처리기가 실행될 때 멤버와 기반 클래스는 이미 소멸되어 접근하면 정의되지 않은 동작입니다.'],
    fix: ['Only use parameters, static members and local objects in the handler; or handle the error inside the body.', '처리기에서는 매개변수·정적 멤버·지역 객체만 사용하거나 본문 안에서 오류를 처리하세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        if (!(fn.isConstructor || fn.isDestructor) || !fn.body || fn.body.type !== 'TryStmt') continue;
        for (const h of fn.body.handlers || []) {
          const hits = cf.findAll(h.body, (n) => {
            if (n.type === 'Identifier' && n.symbol && n.symbol.kind === 'field' && n.symbol.storage !== 'static' && !n.symbol.isStatic) return true;
            if (n.type === 'Identifier' && n.implicitThis && n.symbol && n.symbol.kind === 'function' && !n.symbol.isStatic) return true;
            if (n.type === 'ThisExpr') return true;
            return false;
          });
          const seen = new Set();
          for (const n of hits) {
            const name = n.type === 'ThisExpr' ? 'this' : n.name;
            if (seen.has(name)) continue;
            seen.add(name);
            api.report(n, M(`Handler of the function-try-block of '${fnLabel(fn)}' refers to '${name}', which is already destroyed.`, `'${fnLabel(fn)}' 함수 try 블록의 처리기가 이미 소멸된 '${name}' 를 참조합니다.`));
          }
        }
      }
    },
  }),

  rule('ERR54-CPP', {
    langs: CPP, risk: 'MLL', cwe: [], approx: false,
    name: ['Catch handlers should order their parameter types from most derived to least derived', 'catch 처리기는 가장 파생된 형식부터 기반 형식 순으로 두세요'],
    why: ['Handlers are tried in order; a handler for a base class placed before a handler for a derived class (or catch (...) not last) makes the later handler unreachable.', '처리기는 순서대로 검사되므로 기반 클래스 처리기가 파생 클래스 처리기보다 앞에 있거나 catch (...) 가 마지막이 아니면 뒤 처리기는 실행되지 않습니다.'],
    fix: ['Order handlers from the most derived class to the base class and put catch (...) last.', '가장 파생된 클래스부터 기반 클래스 순으로 두고 catch (...) 는 맨 끝에 두세요.'],
  }, {
    check(unit, api) {
      for (const t of U.nodes(unit, 'TryStmt')) {
        const hs = t.handlers || [];
        hs.forEach((h, i) => {
          if (h.catchAll && i < hs.length - 1) {
            api.report(hs[i + 1], M('catch (...) is not the last handler; the handlers after it are unreachable.', 'catch (...) 가 마지막 처리기가 아니어서 뒤의 처리기는 실행되지 않습니다.'));
          }
        });
        for (let j = 1; j < hs.length; j++) {
          const dt = X.handlerType(hs[j]);
          if (!dt) continue;
          const dn = X.catchNames(T.canonical(dt).kind === 'pointer' ? T.canonical(T.canonical(dt).to) : dt);
          const dname = U.typeName(T.canonical(dt).kind === 'pointer' ? T.canonical(dt).to : dt);
          for (let i = 0; i < j; i++) {
            const bt = X.handlerType(hs[i]);
            if (!bt) continue;
            const bc = T.nonRef(bt);
            const bname = U.typeName(bc.kind === 'pointer' ? bc.to : bc);
            if (!bname || bname === dname) continue;
            if ((T.canonical(dt).kind === 'pointer') !== (bc.kind === 'pointer')) continue;
            if (dn.has(bname)) {
              api.report(hs[j], M(`Handler for '${dname}' is unreachable: the earlier handler for its base '${bname}' catches it first.`, `'${dname}' 처리기는 앞선 기반 클래스 '${bname}' 처리기가 먼저 잡으므로 실행되지 않습니다.`));
              break;
            }
          }
        }
      }
    },
  }),

  rule('ERR55-CPP', {
    langs: CPP, risk: 'LLL', cwe: ['CWE-705'], approx: true,
    name: ['Honor exception specifications', '예외 명세를 지키세요'],
    why: ['An exception leaving a noexcept / throw() function, or one whose type is not in a dynamic exception specification, calls std::terminate (or std::unexpected).', 'noexcept/throw() 함수에서 빠져나가거나 동적 예외 명세에 없는 형식의 예외는 std::terminate(또는 std::unexpected)를 부릅니다.'],
    fix: ['Catch the exception inside the function, or remove / correct the exception specification.', '함수 안에서 예외를 잡거나 예외 명세를 고치세요.'],
  }, {
    check(unit, api) {
      const S = X.summaryFor(api.project);
      for (const fn of U.functions(unit)) {
        const spec = X.exceptionSpec(fn);
        if (spec.kind === 'none' || spec.implicit) continue;
        const esc = S.escaping(fn);
        for (const e of esc) {
          if (spec.kind === 'dynamic') {
            if (e.kind !== 'throw' || !e.type) continue;
            const names = X.catchNames(e.type);
            const allowed = spec.types.some((t) => names.has(t) || names.has(t.replace(/^::/, '')) || [...names].some((n) => n.endsWith('::' + t)));
            if (allowed) continue;
            api.report(e.node, M(`'${fnLabel(fn)}' throws ${U.typeName(e.type) || 'a type'} which its exception specification throw(${spec.types.join(', ')}) does not allow.`, `'${fnLabel(fn)}' 가 예외 명세 throw(${spec.types.join(', ')}) 에 없는 ${U.typeName(e.type) || '형식'} 을 던집니다.`));
            continue;
          }
          const sp = spec.kind === 'throw()' ? 'throw()' : 'noexcept';
          api.report(e.node, M(`'${fnLabel(fn)}' is declared ${sp} but lets an exception escape (${X.describeThrow(unit, e)}).`, `'${fnLabel(fn)}' 는 ${sp} 로 선언됐지만 예외(${X.describeThrowKo(unit, e)})가 빠져나갑니다.`));
        }
      }
    },
  }),

  rule('ERR56-CPP', {
    langs: CPP, risk: 'HLH', cwe: ['CWE-460'], approx: true,
    name: ['Guarantee exception safety', '예외 안전성을 보장하세요'],
    why: ['Deleting the old resource before the new one is allocated leaves the object holding a dangling pointer if the allocation or copy throws; the next use or destructor then touches freed memory.', '새 자원을 할당하기 전에 기존 자원을 삭제하면 할당이나 복사가 예외를 던질 때 객체에 해제된 포인터가 남아 이후 사용이나 소멸자가 해제된 메모리에 접근합니다.'],
    fix: ['Allocate and copy into a temporary first, then swap / assign and delete the old resource (or use copy-and-swap / smart pointers).', '먼저 임시 객체에 할당·복사한 뒤 교환하고 기존 자원을 삭제하세요(copy-and-swap 이나 스마트 포인터 사용).'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        if (X.copyKind(fn) !== 'assign') continue;
        const dels = X.ownNodes(fn, 'DeleteExpr').filter((d) => { const s = U.idSym(d.arg) || (U.strip(d.arg) && U.strip(d.arg).memberSymbol); return s && s.kind === 'field'; });
        const news = X.ownNodes(fn, 'NewExpr');
        for (const d of dels) {
          const s = U.idSym(d.arg) || U.strip(d.arg).memberSymbol;
          const later = news.find((n) => n.loc.start > d.loc.start);
          if (!later) continue;
          api.report(d, M(`'${fnLabel(fn)}' deletes member '${s.name}' before the new allocation; if 'new' throws, '${s.name}' is left dangling.`, `'${fnLabel(fn)}' 가 새 할당 전에 멤버 '${s.name}' 를 삭제해 'new' 가 예외를 던지면 '${s.name}' 가 해제된 포인터로 남습니다.`));
        }
      }
    },
  }),

  rule('ERR57-CPP', {
    langs: CPP, risk: 'LPH', cwe: ['CWE-460', 'CWE-772', 'CWE-401'], approx: true, deep: 'absint:LEAK',
    name: ['Do not leak resources when handling exceptions', '예외 처리 중에 자원을 누수하지 마세요'],
    why: ['When an exception is thrown between a raw new and the matching delete, the delete is skipped and the memory (or other resource) leaks.', '원시 new 와 대응하는 delete 사이에서 예외가 발생하면 delete 가 건너뛰어져 메모리나 자원이 누수됩니다.'],
    fix: ['Hold the resource in an RAII object (std::unique_ptr, std::vector, a guard class), or delete it in a handler before rethrowing.', 'std::unique_ptr·std::vector·가드 클래스 같은 RAII 객체에 담거나 다시 던지기 전에 처리기에서 delete 하세요.'],
  }, {
    check(unit, api) {
      const S = X.summaryFor(api.project);
      for (const fn of U.functions(unit)) {
        const allocs = [];
        for (const d of X.ownNodes(fn, 'VarDecl')) {
          if (d.init && U.strip(d.init) && U.strip(d.init).type === 'NewExpr' && d.symbol) allocs.push({ sym: d.symbol, at: d });
        }
        for (const a of X.ownNodes(fn, 'AssignExpr')) {
          const s = U.idSym(a.left);
          if (a.op === '=' && s && s.kind === 'variable' && s.storage === 'automatic' && U.strip(a.right) && U.strip(a.right).type === 'NewExpr') allocs.push({ sym: s, at: a });
        }
        if (!allocs.length) continue;
        const throws = X.ownNodes(fn, 'ThrowExpr');
        const calls = X.ownNodes(fn, 'CallExpr').filter((c) => {
          const d = U.calleeDef(c, api.project);
          return d && d !== fn && !X.isNoexcept(d) && S.canThrow(d);
        });
        const risky = [...throws, ...calls].sort((x, y) => x.loc.start - y.loc.start);
        for (const { sym, at } of allocs) {
          const del = X.ownNodes(fn, 'DeleteExpr').find((d) => U.idSym(d.arg) === sym && d.loc.start > at.loc.end);
          if (!del) continue;
          const r = risky.find((x) => x.loc.start > at.loc.end && x.loc.end < del.loc.start && !protectedFromLeak(x, fn, sym));
          if (!r) continue;
          const what = r.type === 'ThrowExpr' ? 'the throw' : `the call to '${U.callName(r)}' that can throw`;
          const whatKo = r.type === 'ThrowExpr' ? 'throw 문' : `예외를 던질 수 있는 '${U.callName(r)}' 호출`;
          api.report(r, M(`'${sym.name}' allocated with new leaks if ${what} propagates before 'delete ${sym.name}'.`, `${whatKo}에서 예외가 'delete ${sym.name}' 전에 전파되면 new 로 할당한 '${sym.name}' 가 누수됩니다.`));
        }
      }
    },
  }),

  rule('ERR58-CPP', {
    langs: CPP, risk: 'LUL', cwe: ['CWE-703', 'CWE-754'], approx: true,
    name: ['Handle all exceptions thrown before main() begins executing', 'main() 실행 전에 발생하는 예외도 처리하세요'],
    why: ['Exceptions thrown while constructing objects with static storage duration (namespace-scope or static members) cannot be caught and call std::terminate.', '정적 저장 기간 객체(네임스페이스 범위·정적 멤버)를 생성할 때 던진 예외는 잡을 수 없어 std::terminate 를 부릅니다.'],
    fix: ['Construct such objects lazily inside a function (function-local static or factory) where the exception can be handled, or make the initialization noexcept.', '예외를 처리할 수 있는 함수 안에서 지연 생성(함수 지역 static 이나 팩토리)하거나 초기화를 noexcept 로 만드세요.'],
  }, {
    check(unit, api) {
      const S = X.summaryFor(api.project);
      for (const d of U.nodes(unit, ['VarDecl', 'FieldDecl'])) {
        if (!d.symbol || d.symbol.storage !== 'static' || U.enclosingFn(d)) continue;
        if (d.type === 'FieldDecl' && !d.init) continue;
        if (d.specs && d.specs.storage && d.specs.storage.includes('extern') && !d.init) continue;
        let why = null;
        const tn = U.declTypeName(d);
        const sb = stdBare(tn);
        if (d.init) {
          const nw = cf.findFirst(d.init, 'NewExpr');
          if (nw) why = ['its initializer allocates with new, which can throw std::bad_alloc', '초기화식이 new 로 할당해 std::bad_alloc 이 발생할 수 있습니다'];
          if (!why) {
            for (const c of cf.findAll(d.init, 'CallExpr')) {
              const def = U.calleeDef(c, api.project);
              if (def && !X.isNoexcept(def) && S.canThrow(def)) { why = [`its initializer calls '${U.fnName(def)}', which can throw`, `초기화식이 예외를 던질 수 있는 '${U.fnName(def)}' 를 호출합니다`]; break; }
            }
          }
          if (!why && sb && STD_ALLOC.has(sb) && !isConstantInit(d.init)) why = [`its ${tn} constructor gets a non-constant value and may throw`, `${tn} 을 상수가 아닌 값으로 생성해 예외가 발생할 수 있습니다`];
        }
        if (!why) {
          const rec = X.recordOf(d.ctype);
          if (rec) {
            for (const s of X.ctorSyms(rec)) {
              const def = X.fnDecls(s).find((x) => x.body);
              if (def && !X.isNoexcept(def) && S.canThrow(def)) { why = [`its constructor '${U.fnName(def)}' can throw`, `생성자 '${U.fnName(def)}' 가 예외를 던질 수 있습니다`]; break; }
            }
          }
        }
        if (!why) continue;
        api.report(d, M(`Static object '${d.name}' is initialized before main() and ${why[0]}; the exception cannot be caught.`, `정적 객체 '${d.name}' 는 main() 전에 초기화되며 ${why[1]}. 이 예외는 잡을 수 없습니다.`));
      }
    },
  }),

  rule('ERR59-CPP', {
    langs: CPP, risk: 'HPM', cwe: [], approx: true,
    name: ['Do not throw an exception across execution boundaries', '실행 경계를 넘어 예외를 던지지 마세요'],
    why: ['An exception propagating out of an extern "C" function or a callback invoked by C code (qsort, atexit, pthread_create ...) crosses code that has no unwinding information; the behavior is undefined.', 'extern "C" 함수나 C 코드가 호출하는 콜백(qsort, atexit, pthread_create 등) 밖으로 전파되는 예외는 되감기 정보가 없는 코드를 지나므로 정의되지 않은 동작입니다.'],
    fix: ['Catch every exception (catch (...)) inside the boundary function and convert it to an error code.', '경계 함수 안에서 모든 예외(catch (...))를 잡아 오류 코드로 바꾸세요.'],
  }, {
    check(unit, api) {
      const S = X.summaryFor(api.project);
      const reported = new Set();
      const flag = (fn, why, whyKo) => {
        if (reported.has(fn)) return;
        reported.add(fn);
        const e = S.escaping(fn, { requireCatchAll: true })[0];
        if (!e) return;
        api.report(e.node, M(`Exception (${X.describeThrow(unit, e)}) can leave '${fnLabel(fn)}', ${why}.`, `예외(${X.describeThrowKo(unit, e)})가 ${whyKo} '${fnLabel(fn)}' 밖으로 나갈 수 있습니다.`));
      };
      for (const fn of U.functions(unit)) {
        if (fn.symbol && fn.symbol.externC) flag(fn, 'which has C language linkage', 'C 언어 링크를 가진');
      }
      const CB = { qsort: 3, bsearch: 4, atexit: 0, at_quick_exit: 0, pthread_create: 2, thrd_create: 1, signal: 1, pthread_once: 1, pthread_atfork: -1 };
      for (const c of U.libCalls(unit, new Set(Object.keys(CB)))) {
        const n = U.callName(c);
        const idx = CB[n] >= 0 ? [CB[n]] : [0, 1, 2];
        for (const i of idx) {
          const fn = X.handlerFn(c.args[i], api.project);
          if (fn && fn.type === 'FunctionDecl' && U.isInUserFile(fn)) flag(fn, `which is called back from the C function ${n}()`, `C 함수 ${n}() 가 콜백으로 부르는`);
        }
      }
    },
  }),

  rule('ERR60-CPP', {
    langs: CPP, risk: 'LPM', cwe: ['CWE-705'], approx: true,
    name: ['Exception objects must be nothrow copy constructible', '예외 객체는 예외 없이 복사 생성될 수 있어야 합니다'],
    why: ['Throwing copies the exception object; if that copy throws (e.g. a std::string member allocating), std::terminate is called.', '예외를 던질 때 객체가 복사되는데, 그 복사가 예외를 던지면(예: std::string 멤버의 할당) std::terminate 가 호출됩니다.'],
    fix: ['Store messages in a std::runtime_error base or a reference-counted buffer and give the class a noexcept copy constructor.', '메시지는 std::runtime_error 기반이나 참조 계수 버퍼에 보관하고 복사 생성자를 noexcept 로 만드세요.'],
  }, {
    check(unit, api) {
      const done = new Set();
      for (const th of U.nodes(unit, 'ThrowExpr')) {
        const t = X.thrownType(th);
        const rec = X.recordOf(t);
        if (!rec) continue;
        const w = copyMayThrow(rec);
        if (!w) continue;
        const k = rec.id != null ? rec.id : rec.name;
        api.report(th, M(`Exception type '${rec.name}' is not nothrow copy constructible: ${w[0]}.`, `예외 형식 '${rec.name}' 은 예외 없이 복사 생성될 수 없습니다: ${w[1]}.`));
        done.add(k);
      }
    },
  }),

  rule('ERR61-CPP', {
    langs: CPP, risk: 'LUL', cwe: [], approx: false,
    name: ['Catch exceptions by lvalue reference', '예외는 lvalue 참조로 잡으세요'],
    why: ['Catching by value slices derived exception objects and copies them (which may throw); throwing and catching pointers (throw new ...) leaks the object and confuses ownership.', '값으로 잡으면 파생 예외 객체가 잘리고 복사(예외 가능)가 일어나며, 포인터를 던지고 잡으면(throw new ...) 객체가 누수되고 소유권이 모호해집니다.'],
    fix: ['Throw by value (throw E(...)) and catch by (const) reference: catch (const E &e).', '값으로 던지고(throw E(...)) (const) 참조로 잡으세요: catch (const E &e).'],
  }, {
    check(unit, api) {
      for (const h of U.nodes(unit, 'CatchClause')) {
        if (!h.param) continue;
        const t = X.handlerType(h);
        const c = t ? T.canonical(t) : null;
        if (!c) continue;
        const cls = (x) => x && (x.kind === 'record' || (x.kind === 'unknown' && /^(::)?std::/.test(x.name || '')));
        if (cls(c)) {
          api.report(h.param, M(`Exception '${U.typeName(c)}' is caught by value; catch it by reference to avoid slicing and copying.`, `예외 '${U.typeName(c)}' 를 값으로 잡습니다. 잘림과 복사를 피하려면 참조로 잡으세요.`));
        } else if (c.kind === 'pointer' && cls(T.canonical(c.to))) {
          api.report(h.param, M(`Exception is caught by pointer to '${U.typeName(c.to)}'; throw by value and catch by reference instead.`, `예외를 '${U.typeName(c.to)}' 포인터로 잡습니다. 값으로 던지고 참조로 잡으세요.`));
        }
      }
      for (const th of U.nodes(unit, 'ThrowExpr')) {
        const a = U.strip(th.arg);
        if (a && a.type === 'NewExpr') api.report(th, M(`'throw new ${U.src(unit, a.typeName)}' throws a pointer; the object leaks unless every handler deletes it.`, `'throw new ${U.src(unit, a.typeName)}' 는 포인터를 던져 모든 처리기가 삭제하지 않으면 객체가 누수됩니다.`));
      }
    },
  }),

  rule('ERR62-CPP', {
    langs: CPP, risk: 'MUM', cwe: ['CWE-676', 'CWE-20'], sec: true, approx: true,
    name: ['Detect errors when converting a string to a number', '문자열을 숫자로 변환할 때 오류를 검출하세요'],
    why: ['atoi/atol/atof and unchecked sscanf or stream extraction give no way to tell "0" from garbage or out-of-range input; the program silently works with a wrong value.', 'atoi/atol/atof 와 검사하지 않은 sscanf·스트림 추출은 "0" 과 잘못된 입력·범위 초과를 구별할 수 없어 틀린 값으로 조용히 동작합니다.'],
    fix: ['Use std::stoi/std::stol (which throw), strtol with errno and end-pointer checks, or check the stream state (if (!(std::cin >> n))).', 'std::stoi/std::stol(예외 발생), errno 와 끝 포인터를 검사하는 strtol 을 사용하거나 스트림 상태를 검사하세요(if (!(std::cin >> n))).'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['atoi', 'atol', 'atoll', 'atof', '_wtoi', '_wtol', '_atoi64']))) {
        api.report(c, M(`${U.callName(c)}() cannot report conversion errors; use std::stol() or strtol() with error checks.`, `${U.callName(c)}() 는 변환 오류를 알릴 수 없습니다. std::stol() 이나 오류를 검사하는 strtol() 을 사용하세요.`));
      }
      const fnText = new Map();
      const mentionsErrno = (fn) => {
        if (!fn) return false;
        if (!fnText.has(fn)) fnText.set(fn, /\berrno\b/.test(U.src(unit, fn)));
        return fnText.get(fn);
      };
      for (const c of U.libCalls(unit, new Set(['strtol', 'strtoll', 'strtoul', 'strtoull', 'strtod', 'strtof', 'strtold', 'strtoimax', 'strtoumax']))) {
        const fn = U.enclosingFn(c);
        if (U.isNullConst(c.args[1]) && !mentionsErrno(fn)) {
          api.report(c, M(`${U.callName(c)}() is called with a null end pointer and errno is not checked; invalid or out-of-range input goes unnoticed.`, `${U.callName(c)}() 를 널 끝 포인터로 호출하고 errno 도 검사하지 않아 잘못되었거나 범위를 넘은 입력을 알 수 없습니다.`));
        }
      }
      for (const c of U.libCalls(unit, new Set(['sscanf', 'scanf', 'fscanf', 'swscanf', 'wscanf']))) {
        const fi = U.callName(c) === 'scanf' || U.callName(c) === 'wscanf' ? 0 : 1;
        const fmt = U.strLit(c.args[fi]);
        if (fmt == null || !F.parse(fmt).some((x) => SCAN_NUM.test(x.conv) && !x.flags.includes('*') && !/^%\*/.test(x.text))) continue;
        api.report(c, M(`${U.callName(c)}() with numeric conversions has undefined behavior on out-of-range input; use strtol()/std::stol() instead.`, `숫자 변환이 있는 ${U.callName(c)}() 는 범위를 넘는 입력에서 정의되지 않은 동작입니다. strtol()/std::stol() 을 사용하세요.`));
      }
      // std::cin >> n; with no stream state check
      const checked = new Map();
      const streamChecked = (fn, key) => {
        const k = fn;
        if (!checked.has(k)) {
          const set = new Set();
          for (const mc of cf.findAll(fn.body || fn, 'CallExpr')) {
            const m = X.memberCallOn(mc);
            if (m && /^(fail|good|bad|rdstate|exceptions|eof)$/.test(m.name)) set.add(X.objKey(unit, m.obj));
          }
          for (const id of cf.findAll(fn.body || fn, (n) => n.type === 'Identifier' || n.type === 'BinaryExpr')) {
            if (U.inCondition(id)) set.add(id.type === 'Identifier' ? X.objKey(unit, id) : null);
          }
          checked.set(k, set);
        }
        return checked.get(k).has(key);
      };
      for (const b of U.nodes(unit, 'BinaryExpr')) {
        if (b.op !== '>>') continue;
        const p = U.parent(b);
        if (!p || p.type !== 'ExprStmt') continue;
        // leftmost stream of a chain
        let l = U.strip(b.left);
        const targets = [b.right];
        while (l && l.type === 'BinaryExpr' && l.op === '>>') { targets.push(l.right); l = U.strip(l.left); }
        if (!l) continue;
        const sn = l.type === 'Identifier' ? (l.qname || l.name) : '';
        const tn = X.exprTypeName(l);
        if (!(/^(std::)?(cin|wcin)$/.test(sn) || /istream|ifstream|stringstream|istringstream|fstream/.test(tn))) continue;
        const num = targets.find((t) => { const c = t && t.ctype ? T.nonRef(t.ctype) : null; return c && T.isArithmetic(c) && !T.isCharType(c); });
        if (!num) continue;
        const fn = U.enclosingFn(b);
        if (fn && streamChecked(fn, X.objKey(unit, l))) continue;
        api.report(b, M(`Extraction of '${U.src(unit, num)}' from '${U.src(unit, l)}' is not checked; a failed conversion leaves the stream in a fail state unnoticed.`, `'${U.src(unit, l)}' 에서 '${U.src(unit, num)}' 를 추출한 결과를 검사하지 않아 변환 실패를 알 수 없습니다.`));
      }
    },
  }),
];
