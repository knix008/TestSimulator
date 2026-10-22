'use strict';

// SEI CERT C++ — MSC: miscellaneous.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/cppx');
const { M, T, cf } = U;

const CPP = ['cpp'];
const fnLabel = (fn) => X.label(fn);

const ENGINES = new Set(['mt19937', 'mt19937_64', 'default_random_engine', 'minstd_rand', 'minstd_rand0', 'ranlux24', 'ranlux48',
  'ranlux24_base', 'ranlux48_base', 'knuth_b', 'linear_congruential_engine', 'mersenne_twister_engine', 'subtract_with_carry_engine',
  'discard_block_engine', 'independent_bits_engine', 'shuffle_order_engine']);
const engineName = (n) => { const m = /^(::)?std::(\w+)$/.exec(String(n || '')); return m && ENGINES.has(m[2]) ? m[2] : null; };

// 'const' | 'time' | null for a seed expression.
function badSeed(unit, e) {
  e = U.strip(e);
  if (!e) return null;
  if (U.constInt(unit, e) != null || ['IntegerLiteral', 'FloatingLiteral', 'CharLiteral'].includes(e.type)) return 'const';
  if (e.type === 'Identifier' && e.symbol && e.symbol.isConstexpr) return 'const';
  const calls = e.type === 'CallExpr' ? [e, ...cf.findAll(e, 'CallExpr')] : cf.findAll(e, 'CallExpr');
  if (calls.some((c) => U.isLib(c, new Set(['time', 'clock'])) || /^(now|time_since_epoch|count)$/.test(U.callName(c) || '') && /system_clock|steady_clock|high_resolution_clock|time_since_epoch/.test(U.src(unit, e)))) return 'time';
  return null;
}

function retType(fn) {
  const t = fn.ctype ? T.canonical(fn.ctype) : null;
  return t && t.kind === 'function' ? t.ret : null;
}

function endLoc(fn) {
  const b = fn.body;
  const l = b && b.loc;
  if (!l) return fn;
  return { file: l.file, line: l.endLine, col: Math.max(1, (l.endCol || 2) - 1) };
}

const isCoroutine = (fn) => !!cf.findFirst(fn.body, (n) => (n.type === 'ReturnStmt' && n.coroutine) || (n.type === 'UnaryExpr' && (n.op === 'co_await' || n.op === 'co_yield')));

function hasNoreturn(fn) {
  if (fn.symbol && fn.symbol.noreturn) return true;
  const decls = fn.symbol ? X.fnDecls(fn.symbol) : [fn];
  return decls.some((d) => (d.attributes || []).some((a) => a.name === 'noreturn') || (d.specs && ((d.specs.attributes || []).some((a) => a.name === 'noreturn') || (d.specs.functionSpecs || []).includes('_Noreturn'))));
}

// First C++-only construct in a signal handler body.
function cppFeature(unit, h) {
  let found = null;
  cf.walk(h.body, (n) => {
    if (found) return cf.walk.STOP;
    if (n.type === 'ThrowExpr') found = ['throws an exception', '예외를 던집니다'];
    else if (n.type === 'TryStmt') found = ['uses try/catch', 'try/catch 를 사용합니다'];
    else if (n.type === 'NewExpr' || n.type === 'DeleteExpr') found = [`uses '${n.type === 'NewExpr' ? 'new' : 'delete'}'`, `'${n.type === 'NewExpr' ? 'new' : 'delete'}' 를 사용합니다`];
    else if (n.type === 'CastExpr' && n.kind === 'dynamic_cast') found = ['uses dynamic_cast', 'dynamic_cast 를 사용합니다'];
    else if (n.type === 'TypeidExpr') found = ['uses typeid', 'typeid 를 사용합니다'];
    else if (n.type === 'LambdaExpr') found = ['creates a lambda', '람다를 만듭니다'];
    else if (n.type === 'Identifier' && !n.symbol && n.qualifier && /^(::)?std$/.test(n.qualifier) && !/^(sig_atomic_t|signal|_Exit|abort|quick_exit)$/.test(n.name)) found = [`uses the C++ library object '${n.qname || n.name}'`, `C++ 라이브러리 객체 '${n.qname || n.name}' 를 사용합니다`];
    else if (n.type === 'CallExpr' && U.isMemberCall(n)) found = [`calls the member function '${U.callName(n)}'`, `멤버 함수 '${U.callName(n)}' 를 호출합니다`];
    else if (n.type === 'VarDecl' && n.ctype && X.recordOf(n.ctype) && X.isNonTrivial(X.recordOf(n.ctype))) found = [`creates an object of class '${X.recordOf(n.ctype).name}'`, `클래스 '${X.recordOf(n.ctype).name}' 객체를 만듭니다`];
    else if (n.type === 'VarDecl' && /^(::)?std::/.test(U.declTypeName(n) || '')) found = [`creates a ${U.declTypeName(n)}`, `${U.declTypeName(n)} 객체를 만듭니다`];
    return undefined;
  });
  return found;
}

module.exports = [
  rule('MSC50-CPP', {
    langs: CPP, risk: 'MUL', cwe: ['CWE-338', 'CWE-330'], sec: true, approx: false,
    name: ['Do not use std::rand() for generating pseudorandom numbers', '의사 난수 생성에 std::rand() 를 사용하지 마세요'],
    why: ['std::rand() has a short period and poor distribution, and its sequence is easily predicted; it is unsuitable for anything security- or quality-sensitive.', 'std::rand() 는 주기가 짧고 분포가 나쁘며 예측이 쉬워 보안이나 품질이 중요한 곳에 부적합합니다.'],
    fix: ['Use the <random> facilities (std::mt19937 seeded from std::random_device with a distribution), or a CSPRNG for security.', '<random> 기능(std::random_device 로 시드한 std::mt19937 과 분포)이나 보안용 CSPRNG 를 사용하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['rand', 'random', 'drand48', 'lrand48']))) {
        api.report(c, M(`${U.callName(c)}() is a weak pseudorandom generator; use <random> engines seeded from std::random_device.`, `${U.callName(c)}() 는 약한 의사 난수 생성기입니다. std::random_device 로 시드한 <random> 엔진을 사용하세요.`));
      }
    },
  }),

  rule('MSC51-CPP', {
    langs: CPP, risk: 'MLL', cwe: ['CWE-327', 'CWE-330', 'CWE-337'], sec: true, approx: true,
    name: ['Ensure your random number generator is properly seeded', '난수 생성기를 올바르게 시드하세요'],
    why: ['A default-constructed engine, or one seeded with a constant or the current time, produces the same or an easily guessed sequence on every run.', '기본 생성되거나 상수·현재 시간으로 시드한 엔진은 매번 같거나 쉽게 추측할 수 있는 수열을 만듭니다.'],
    fix: ['Seed the engine from std::random_device (ideally through std::seed_seq).', '엔진을 std::random_device 로(가능하면 std::seed_seq 를 통해) 시드하세요.'],
  }, {
    check(unit, api) {
      for (const d of U.nodes(unit, 'VarDecl')) {
        const en = engineName(U.declTypeName(d));
        if (!en) continue;
        const args = X.initArgs(d);
        if (!args.length) {
          // seeded later with .seed(x)?
          const seeded = (d.symbol && d.symbol.uses || []).some((u) => { const p = U.parent(u); return p && p.type === 'MemberExpr' && p.member === 'seed'; });
          if (seeded) continue;
          api.report(d, M(`Random engine '${d.name}' (std::${en}) is default-constructed; it produces the same sequence on every run.`, `난수 엔진 '${d.name}'(std::${en}) 이 기본 생성되어 매번 같은 수열을 만듭니다.`));
          continue;
        }
        const k = badSeed(unit, args[0]);
        if (k) api.report(d, M(`Random engine '${d.name}' (std::${en}) is seeded with ${k === 'const' ? 'a constant' : 'the current time'}; the sequence is predictable.`, `난수 엔진 '${d.name}'(std::${en}) 을 ${k === 'const' ? '상수로' : '현재 시간으로'} 시드해 수열을 예측할 수 있습니다.`));
      }
      for (const c of U.nodes(unit, 'CallExpr')) {
        const m = X.memberCallOn(c);
        if (!m || m.name !== 'seed' || !engineName(X.exprTypeName(m.obj))) continue;
        const k = c.args.length ? badSeed(unit, c.args[0]) : 'const';
        if (k) api.report(c, M(`'${U.src(unit, m.obj)}.seed()' uses ${k === 'const' ? 'a constant' : 'the current time'}; the sequence is predictable.`, `'${U.src(unit, m.obj)}.seed()' 가 ${k === 'const' ? '상수를' : '현재 시간을'} 사용해 수열을 예측할 수 있습니다.`));
      }
    },
  }),

  rule('MSC52-CPP', {
    langs: CPP, risk: 'MPM', cwe: ['CWE-758'], approx: false,
    name: ['Value-returning functions must return a value from all exit paths', '값을 반환하는 함수는 모든 종료 경로에서 값을 반환해야 합니다'],
    why: ['Flowing off the end of a non-void function (other than main) is undefined behavior in C++; the caller reads a garbage value or the optimizer removes the path.', 'C++ 에서 main 이 아닌 non-void 함수의 끝을 벗어나면 정의되지 않은 동작이며 호출자가 쓰레기 값을 읽거나 최적화가 경로를 없앱니다.'],
    fix: ['Return a value (or throw) on every path, including after switch statements and loops.', 'switch 문과 반복문 뒤를 포함해 모든 경로에서 값을 반환하거나 예외를 던지세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        if (fn.isConstructor || fn.isDestructor) continue;
        if (fn.name === 'main' && !fn.qualifier && !X.classOfFn(fn)) continue;
        const ret = retType(fn);
        if (!ret) continue;
        const rc = T.canonical(ret);
        if (!rc || rc.kind === 'void' || rc.kind === 'auto') continue;
        if (hasNoreturn(fn) || isCoroutine(fn) || U.hasParseError(fn.body)) continue;
        const g = X.cfgOf(fn);
        if (!g) continue;
        const R = g.reachable();
        const falls = g.exit.preds.filter((e) => R.has(e.from) && e.kind === 'normal');
        if (!falls.length) continue;
        api.report(endLoc(fn), M(`Control can reach the end of '${fnLabel(fn)}', which returns ${U.tstr(ret)}, without a return statement.`, `${U.tstr(ret)} 를 반환하는 '${fnLabel(fn)}' 의 끝에 return 문 없이 도달할 수 있습니다.`));
      }
    },
  }),

  rule('MSC53-CPP', {
    langs: CPP, risk: 'MUL', cwe: ['CWE-758'], approx: false,
    name: ['Do not return from a function declared [[noreturn]]', '[[noreturn]] 로 선언한 함수에서 반환하지 마세요'],
    why: ['Returning from a [[noreturn]] function is undefined behavior; callers are compiled assuming control never comes back.', '[[noreturn]] 함수에서 반환하면 정의되지 않은 동작이며 호출자는 제어가 돌아오지 않는다고 가정하고 컴파일됩니다.'],
    fix: ['End every path with a throw, std::abort()/std::exit() or an infinite loop, or remove the attribute.', '모든 경로를 throw, std::abort()/std::exit() 또는 무한 반복으로 끝내거나 속성을 제거하세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        if (!hasNoreturn(fn)) continue;
        const ex = X.normalExits(fn);
        if (!ex.length) continue;
        const e = ex.find((x) => x.kind === 'return');
        const where = e && e.from.terminator && e.from.terminator.node ? e.from.terminator.node : endLoc(fn);
        api.report(where, M(`'${fnLabel(fn)}' is declared [[noreturn]] but can return to its caller.`, `'${fnLabel(fn)}' 는 [[noreturn]] 로 선언됐지만 호출자로 반환될 수 있습니다.`));
      }
    },
  }),

  rule('MSC54-CPP', {
    langs: CPP, risk: 'HPH', cwe: ['CWE-479'], sec: true, approx: true,
    name: ['A signal handler must be a plain old function', '시그널 처리기는 평범한 C 함수여야 합니다'],
    why: ['Signal handlers run asynchronously; C++ features (exceptions, new/delete, library objects, member functions, lambdas) and functions without C language linkage are not guaranteed to work there.', '시그널 처리기는 비동기로 실행되므로 C++ 기능(예외, new/delete, 라이브러리 객체, 멤버 함수, 람다)과 C 언어 링크가 없는 함수는 동작이 보장되지 않습니다.'],
    fix: ['Declare the handler extern "C", use only C-compatible code, and just set a volatile std::sig_atomic_t flag.', '처리기를 extern "C" 로 선언하고 C 호환 코드만 써서 volatile std::sig_atomic_t 플래그만 설정하세요.'],
  }, {
    check(unit, api) {
      const sites = [];
      for (const c of U.libCalls(unit, new Set(['signal', 'sigset', 'bsd_signal']))) if (c.args[1]) sites.push([c, c.args[1]]);
      for (const a of U.nodes(unit, 'AssignExpr')) {
        const l = U.strip(a.left);
        if (a.op === '=' && l && l.type === 'MemberExpr' && /^(sa_handler|sa_sigaction)$/.test(l.member)) sites.push([a, a.right]);
      }
      const done = new Set();
      for (const [site, harg] of sites) {
        const h = X.handlerFn(harg, api.project);
        if (!h || done.has(h)) continue;
        done.add(h);
        if (h.type === 'LambdaExpr') {
          api.report(site, M('A lambda is installed as a signal handler; a signal handler must be a plain function with C linkage.', '람다를 시그널 처리기로 설치합니다. 시그널 처리기는 C 링크를 가진 평범한 함수여야 합니다.'));
          continue;
        }
        const name = fnLabel(h);
        if (X.classOfFn(h)) {
          api.report(site, M(`Member function '${name}' is installed as a signal handler; use an extern "C" free function.`, `멤버 함수 '${name}' 를 시그널 처리기로 설치합니다. extern "C" 자유 함수를 사용하세요.`));
          continue;
        }
        const feat = cppFeature(unit, h);
        if (feat) {
          api.report(site, M(`Signal handler '${name}' ${feat[0]}; a signal handler must only use plain C features.`, `시그널 처리기 '${name}' 가 ${feat[1]}. 시그널 처리기는 C 기능만 사용해야 합니다.`));
          continue;
        }
        if (!(h.symbol && h.symbol.externC)) {
          api.report(site, M(`Signal handler '${name}' does not have C language linkage; declare it extern "C".`, `시그널 처리기 '${name}' 에 C 언어 링크가 없습니다. extern "C" 로 선언하세요.`));
        }
      }
    },
  }),
];
