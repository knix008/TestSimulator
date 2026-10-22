'use strict';

// SEI CERT C — CON: concurrency (C11 <threads.h>, with pthread equivalents where the rule is API neutral).

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const S = require('../lib/sys');
const { M, cf } = U;

const WAIT = new Set(['cnd_wait', 'cnd_timedwait', 'pthread_cond_wait', 'pthread_cond_timedwait']);
const SIGNAL1 = new Set(['cnd_signal', 'pthread_cond_signal']);
const JOIN_DETACH = new Set(['thrd_join', 'thrd_detach', 'pthread_join', 'pthread_detach']);
const MT_UNSAFE = new Set(['strtok', 'rand', 'srand', 'asctime', 'ctime', 'localtime', 'gmtime', 'strerror', 'setlocale', 'localeconv', 'tmpnam', 'getenv', 'readdir', 'strsignal', 'getpwnam', 'getpwuid', 'getgrnam', 'getgrgid', 'gethostbyname', 'gethostbyaddr', 'inet_ntoa', 'ttyname', 'getlogin', 'ecvt', 'fcvt', 'gcvt']);
const MB_STATE = { mbrtowc: 3, mbrlen: 2, mbsrtowcs: 3, wcrtomb: 2, wcsrtombs: 3, mbrtoc16: 3, mbrtoc32: 3, c16rtomb: 2, c32rtomb: 2 };
const CAS_WEAK = new Set(['atomic_compare_exchange_weak', 'atomic_compare_exchange_weak_explicit']);

// Expression statement / declaration that owns an expression node.
function fullExpr(n) {
  let x = n;
  let p = cf.parentOf(x);
  while (p && !/Stmt$|^Declaration$|^VarDecl$|^FunctionDecl$|^LambdaExpr$|^TranslationUnit$|^FieldDecl$|^ParamDecl$/.test(p.type)) {
    if (p.type === 'CallExpr' && U.isLib(p, U.callName(p) || '') && /^atomic_/.test(U.callName(p) || '')) return null;
    x = p; p = cf.parentOf(x);
  }
  return x;
}

module.exports = [
  rule('CON30-C', {
    risk: 'MUM', cwe: ['CWE-401', 'CWE-404'], approx: true,
    name: ['Clean up thread-specific storage', '스레드별 저장소를 정리하세요'],
    why: ['A tss_t key that is never deleted, or that has no destructor while each thread stores heap memory in it, leaks that memory when the threads end.', '삭제되지 않는 tss_t 키나, 스레드마다 힙 메모리를 저장하면서 소멸자가 없는 키는 스레드가 끝날 때 그 메모리를 누수합니다.'],
    fix: ['Give tss_create() a destructor such as free (or free the value before the thread exits) and call tss_delete() when the key is no longer needed.', 'tss_create() 에 free 같은 소멸자를 주거나 스레드 종료 전에 값을 해제하고, 키가 더 필요 없으면 tss_delete() 를 호출하세요.'],
  }, {
    project(project, api) {
      const creates = [];
      const deleted = new Set();
      const freedGet = new Set();
      const mallocSet = new Map();
      for (const unit of project.units) {
        for (const c of S.calls(unit, 'tss_create', project)) creates.push({ c, unit, key: S.gkey(unit, c.args[0]) });
        for (const c of S.calls(unit, 'tss_delete', project)) deleted.add(S.gkey(unit, c.args[0]));
        for (const c of S.calls(unit, 'free', project)) {
          const a = U.strip(c.args[0]);
          if (a && a.type === 'CallExpr' && U.callName(a) === 'tss_get') freedGet.add(S.gkey(unit, a.args[0]));
        }
        for (const c of S.calls(unit, 'tss_set', project)) {
          const v = U.strip(c.args[1]);
          const k = S.gkey(unit, c.args[0]);
          if (v && v.type === 'CallExpr' && /^(malloc|calloc|realloc|strdup|aligned_alloc)$/.test(U.callName(v) || '')) mallocSet.set(k, c);
          const s = U.idSym(v);
          if (s && s.definition && s.definition.init && /^(malloc|calloc|realloc|strdup|aligned_alloc)$/.test(U.callName(U.strip(s.definition.init)) || '')) mallocSet.set(k, c);
        }
      }
      for (const { c, unit, key } of creates) {
        const name = S.bare(unit, c.args[0]);
        if (!deleted.has(key)) api.report(c.node, M(`Thread-specific storage key '${name}' is created but never released with tss_delete().`, `스레드별 저장소 키 '${name}' 를 만들지만 tss_delete() 로 해제하지 않습니다.`));
        else if (U.isNullConst(c.args[1]) && mallocSet.has(key) && !freedGet.has(key)) api.report(c.node, M(`'${name}' holds heap memory (tss_set at line ${mallocSet.get(key).loc.line}) but tss_create() has no destructor and the value is never freed.`, `'${name}' 에 힙 메모리를 저장하지만(${mallocSet.get(key).loc.line} 행 tss_set) tss_create() 에 소멸자가 없고 값을 해제하지 않습니다.`));
      }
    },
  }),

  rule('CON31-C', {
    risk: 'MPH', cwe: ['CWE-667'], approx: true,
    name: ['Do not destroy a mutex while it is locked', '잠긴 뮤텍스를 파괴하지 마세요'],
    why: ['mtx_destroy() on a mutex that is locked, or that other threads may still lock, is undefined behavior.', '잠겨 있거나 다른 스레드가 아직 잠글 수 있는 뮤텍스에 mtx_destroy() 를 호출하면 정의되지 않은 동작입니다.'],
    fix: ['Unlock the mutex and join every thread that uses it before calling mtx_destroy().', 'mtx_destroy() 전에 뮤텍스를 풀고 그것을 쓰는 모든 스레드를 조인하세요.'],
  }, { check(unit, api) { S.destroyLocked(unit, api, 'c11'); } }),

  rule('CON32-C', {
    risk: 'MPM', cwe: ['CWE-362'], approx: true,
    name: ['Prevent data races when accessing bit-fields from multiple threads', '여러 스레드에서 비트 필드에 접근할 때 데이터 경합을 막으세요'],
    why: ['Adjacent bit-fields share one memory location; writing one rewrites the whole unit, so two threads updating different bit-fields of the same object race and lose updates.', '인접한 비트 필드는 같은 메모리 위치를 공유해 하나를 쓰면 단위 전체를 다시 씁니다. 두 스레드가 같은 객체의 서로 다른 비트 필드를 갱신하면 경합으로 값이 사라집니다.'],
    fix: ['Protect all bit-fields of the object with one mutex, or use separate non-bit-field members.', '객체의 모든 비트 필드를 하나의 뮤텍스로 보호하거나 비트 필드가 아닌 별도 멤버를 사용하세요.'],
  }, { project(project, api) { S.bitfieldRace(project, api, 'c11'); } }),

  rule('CON33-C', {
    risk: 'MPH', cwe: ['CWE-330', 'CWE-377', 'CWE-676'], approx: true,
    name: ['Avoid race conditions when using library functions', '라이브러리 함수를 쓸 때 경합 조건을 피하세요'],
    why: ['strtok(), rand(), localtime(), strerror(), setlocale() and similar functions keep hidden static state; called from several threads they return corrupted or another thread\'s data.', 'strtok(), rand(), localtime(), strerror(), setlocale() 같은 함수는 숨은 정적 상태를 가지므로 여러 스레드에서 부르면 깨진 값이나 다른 스레드의 데이터를 반환합니다.'],
    fix: ['In multithreaded programs use the reentrant forms (strtok_r/strtok_s, localtime_r, strerror_r, mbrtowc with an explicit mbstate_t) or serialise the calls with a mutex.', '다중 스레드 프로그램에서는 재진입 가능한 함수(strtok_r/strtok_s, localtime_r, strerror_r, mbstate_t 를 넘기는 mbrtowc)를 쓰거나 뮤텍스로 호출을 직렬화하세요.'],
  }, {
    check(unit, api) {
      if (!S.info(api.project).createsThreads) return;
      for (const c of S.calls(unit, MT_UNSAFE, api.project)) {
        api.report(c.node, M(`${c.name}() is not thread-safe and this program creates threads.`, `이 프로그램은 스레드를 만드는데 ${c.name}() 는 스레드 안전하지 않습니다.`));
      }
      for (const c of S.calls(unit, Object.keys(MB_STATE), api.project)) {
        const st = c.args[MB_STATE[c.name]];
        if (st && U.isNullConst(st)) api.report(c.node, M(`${c.name}() with a null mbstate_t uses hidden static state shared by all threads.`, `널 mbstate_t 로 호출한 ${c.name}() 는 모든 스레드가 공유하는 숨은 정적 상태를 씁니다.`));
      }
    },
  }),

  rule('CON34-C', {
    risk: 'MPH', cwe: ['CWE-562', 'CWE-416'], approx: true,
    name: ['Declare objects shared between threads with appropriate storage durations', '스레드 간 공유 객체는 알맞은 저장 기간으로 선언하세요'],
    why: ['Passing the address of a local variable to thrd_create() lets the new thread use it after the creating function returned and its stack frame is gone.', 'thrd_create() 에 지역 변수 주소를 넘기면 만든 함수가 반환해 스택 프레임이 사라진 뒤에도 새 스레드가 그 변수를 사용할 수 있습니다.'],
    fix: ['Join the thread before the creating function returns, or pass static or dynamically allocated storage.', '만든 함수가 반환하기 전에 스레드를 조인하거나 정적 또는 동적 할당 저장소를 넘기세요.'],
  }, { check(unit, api) { S.autoArgToThread(unit, api, 'c11'); } }),

  rule('CON35-C', {
    risk: 'LPM', cwe: ['CWE-764', 'CWE-833'], approx: true,
    name: ['Avoid deadlock by locking in a predefined order', '정해진 순서로 잠가 교착 상태를 피하세요'],
    why: ['Two threads that take the same pair of mutexes in opposite orders can each hold one and wait forever for the other.', '같은 두 뮤텍스를 반대 순서로 잡는 두 스레드는 각자 하나를 쥔 채 서로를 영원히 기다릴 수 있습니다.'],
    fix: ['Define a global lock order (for example by address or id) and always acquire the mutexes in that order.', '주소나 번호 등으로 전역 잠금 순서를 정하고 항상 그 순서로 뮤텍스를 잡으세요.'],
  }, { project(project, api) { S.lockOrder(project, api, 'c11'); } }),

  rule('CON36-C', {
    risk: 'LUM', cwe: ['CWE-662'], approx: true,
    name: ['Wrap functions that can spuriously wake up in a loop', '가짜로 깨어날 수 있는 함수는 루프로 감싸세요'],
    why: ['cnd_wait() and pthread_cond_wait() may return without a signal (spurious wakeup) or after another thread consumed the condition; acting without re-testing the predicate is a race.', 'cnd_wait() 와 pthread_cond_wait() 는 신호 없이(가짜 깨어남) 또는 다른 스레드가 조건을 소비한 뒤 반환할 수 있어 조건을 다시 확인하지 않으면 경합입니다.'],
    fix: ['Call the wait in a while loop that re-checks the condition: while (!ready) cnd_wait(&cv, &m);', '조건을 다시 확인하는 while 루프 안에서 기다리세요: while (!ready) cnd_wait(&cv, &m);'],
  }, {
    check(unit, api) {
      for (const c of S.calls(unit, WAIT, api.project)) {
        if (U.loopOf(c.node)) continue;
        api.report(c.node, M(`${c.name}() is not called inside a loop that re-checks the condition; a spurious wakeup is not handled.`, `${c.name}() 를 조건을 다시 확인하는 루프 밖에서 호출해 가짜 깨어남을 처리하지 못합니다.`));
      }
    },
  }),

  rule('CON37-C', {
    risk: 'LPL', cwe: ['CWE-479'],
    name: ['Do not call signal() in a multithreaded program', '다중 스레드 프로그램에서 signal() 을 호출하지 마세요'],
    why: ['The behavior of signal() in a program that creates threads is undefined; the handler may run in any thread.', '스레드를 만드는 프로그램에서 signal() 의 동작은 정의되지 않았고 처리기가 어느 스레드에서든 실행될 수 있습니다.'],
    fix: ['Use sigaction() with pthread_sigmask() to direct signals to one thread, or avoid signals.', 'sigaction() 과 pthread_sigmask() 로 시그널을 한 스레드로 보내거나 시그널을 쓰지 마세요.'],
  }, {
    check(unit, api) {
      if (!S.info(api.project).createsThreads) return;
      for (const c of S.calls(unit, 'signal', api.project)) api.report(c.node, M('signal() is called in a program that creates threads; its behavior is undefined there.', '스레드를 만드는 프로그램에서 signal() 을 호출합니다. 이 경우 동작이 정의되지 않았습니다.'));
    },
  }),

  rule('CON38-C', {
    risk: 'LUM', cwe: ['CWE-662', 'CWE-833'], approx: true,
    name: ['Preserve thread safety and liveness when using condition variables', '조건 변수를 쓸 때 스레드 안전성과 활성을 지키세요'],
    why: ['When threads wait on one condition variable for different predicates (e.g. "my turn"), cnd_signal() may wake a thread whose predicate is still false; it waits again and the right thread is never woken.', '스레드들이 하나의 조건 변수에서 서로 다른 조건(예: 내 차례)을 기다릴 때 cnd_signal() 은 조건이 아직 거짓인 스레드를 깨울 수 있고, 그 스레드는 다시 기다려 맞는 스레드는 끝내 깨어나지 않습니다.'],
    fix: ['Use cnd_broadcast() / pthread_cond_broadcast() so every waiter re-checks its own predicate, or use one condition variable per predicate.', 'cnd_broadcast() / pthread_cond_broadcast() 로 모든 대기자가 자기 조건을 다시 확인하게 하거나 조건마다 조건 변수를 따로 쓰세요.'],
  }, {
    project(project, api) {
      const perThread = new Map();
      for (const unit of project.units) {
        for (const w of S.calls(unit, WAIT, project)) {
          const loop = U.loopOf(w.node);
          if (!loop || !loop.cond) continue;
          const local = cf.findAll(loop.cond, 'Identifier').find((id) => id.symbol && (id.symbol.kind === 'parameter' || (id.symbol.kind === 'variable' && id.symbol.storage === 'automatic')));
          if (local) perThread.set(S.gkey(unit, w.args[0]), { w, local });
        }
      }
      if (!perThread.size) return;
      for (const unit of project.units) {
        for (const c of S.calls(unit, SIGNAL1, project)) {
          const p = perThread.get(S.gkey(unit, c.args[0]));
          if (!p) continue;
          api.report(c.node, M(`${c.name}() wakes one waiter of '${S.bare(unit, c.args[0])}', but the waiters test a per-thread predicate ('${p.local.name}', line ${p.w.loc.line}); use the broadcast form.`, `${c.name}() 는 '${S.bare(unit, c.args[0])}' 의 대기자 하나만 깨우지만 대기자들은 스레드마다 다른 조건('${p.local.name}', ${p.w.loc.line} 행)을 확인합니다. broadcast 를 사용하세요.`));
        }
      }
    },
  }),

  rule('CON39-C', {
    risk: 'MLL', cwe: ['CWE-675'], approx: true,
    name: ['Do not join or detach a thread that was previously joined or detached', '이미 조인하거나 분리한 스레드를 다시 조인하거나 분리하지 마세요'],
    why: ['Joining or detaching a thread a second time (including joining a thread that detached itself) is undefined behavior.', '스레드를 두 번 조인하거나 분리하는 것(스스로 분리한 스레드를 조인하는 것 포함)은 정의되지 않은 동작입니다.'],
    fix: ['Join or detach each thread exactly once; do not join a thread that calls thrd_detach() on itself.', '각 스레드는 정확히 한 번만 조인하거나 분리하고, 스스로 thrd_detach() 하는 스레드는 조인하지 마세요.'],
  }, {
    check(unit, api) {
      const project = api.project;
      for (const fn of U.functions(unit)) {
        const list = S.callsIn(fn.body, JOIN_DETACH, project);
        const creates = S.callsIn(fn.body, ['thrd_create', 'pthread_create'], project);
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          const ka = S.gkey(unit, a.args[0]);
          if (!ka || U.loopOf(a.node, fn)) continue;
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j];
            if (S.gkey(unit, b.args[0]) !== ka || S.exclusive(a.node, b.node)) continue;
            if (creates.some((c) => c.loc.start > a.loc.end && c.loc.start < b.loc.start && S.gkey(unit, c.args[0]) === ka)) continue;
            api.report(b.node, M(`${b.name}(${U.src(unit, b.args[0])}) on a thread already ${/join/.test(a.name) ? 'joined' : 'detached'} at line ${a.loc.line}.`, `${a.loc.line} 행에서 이미 ${/join/.test(a.name) ? '조인한' : '분리한'} 스레드에 ${b.name}(${U.src(unit, b.args[0])}) 를 호출합니다.`));
            break;
          }
        }
      }
      // joining a thread whose start routine detaches itself
      const reach = S.reachMap(project, 'threads');
      for (const t of S.info(project).threads) {
        if (t.unit !== unit || !t.fn) continue;
        let selfDetach = null;
        for (const [f, roots] of reach) {
          if (!roots.some((r) => r.fn === t.fn)) continue;
          selfDetach = S.callsIn(f.body, ['thrd_detach', 'pthread_detach'], project).find((c) => { const x = U.strip(c.args[0]); return x && x.type === 'CallExpr' && /^(thrd_current|pthread_self)$/.test(U.callName(x) || ''); });
          if (selfDetach) break;
        }
        if (!selfDetach) continue;
        const fn = U.enclosingFn(t.call.node);
        const tk = S.gkey(unit, t.tid);
        for (const j of S.callsIn(fn && fn.body, ['thrd_join', 'pthread_join'], project)) {
          if (j.loc.start > t.call.loc.end && S.gkey(unit, j.args[0]) === tk) {
            api.report(j.node, M(`${j.name}(${U.src(unit, j.args[0])}) joins a thread whose start routine '${S.fnLabel(t.fn)}' detaches itself.`, `시작 루틴 '${S.fnLabel(t.fn)}' 가 스스로 분리하는 스레드를 ${j.name}(${U.src(unit, j.args[0])}) 로 조인합니다.`));
            break;
          }
        }
      }
    },
  }),

  rule('CON40-C', {
    risk: 'MPM', cwe: ['CWE-366', 'CWE-362'], approx: true,
    name: ['Do not refer to an atomic variable twice in an expression', '한 식에서 원자 변수를 두 번 참조하지 마세요'],
    why: ['Each access to an atomic object is atomic on its own, but an expression such as flag = !flag or x = x + 1 reads and writes in two separate operations; another thread can intervene between them.', '원자 객체에 대한 각 접근은 원자적이지만 flag = !flag 나 x = x + 1 같은 식은 읽기와 쓰기가 별개 연산이라 그 사이에 다른 스레드가 끼어들 수 있습니다.'],
    fix: ['Use one atomic read-modify-write operation (x += 1, atomic_fetch_add, atomic_fetch_xor) or a compare-exchange loop.', '하나의 원자적 읽기-수정-쓰기 연산(x += 1, atomic_fetch_add, atomic_fetch_xor)이나 compare-exchange 루프를 사용하세요.'],
  }, {
    check(unit, api) {
      const groups = new Map();
      for (const id of U.nodes(unit, 'Identifier')) {
        const s = id.symbol;
        if (!s || s.kind !== 'variable' || !S.isAtomicSym(s)) continue;
        if (cf.enclosing(id, ['SizeofExpr', 'AlignofExpr'])) continue;
        const top = fullExpr(id);
        if (!top) continue;
        if (!groups.has(top)) groups.set(top, new Map());
        const g = groups.get(top);
        g.set(s, (g.get(s) || 0) + 1);
      }
      for (const [top, g] of groups) {
        for (const [s, n] of g) {
          if (n < 2) continue;
          api.report(top, M(`Atomic variable '${s.name}' is referred to ${n} times in '${U.src(unit, top)}'; the combined access is not atomic.`, `'${U.src(unit, top)}' 에서 원자 변수 '${s.name}' 를 ${n} 번 참조합니다. 합쳐진 접근은 원자적이지 않습니다.`));
        }
      }
    },
  }),

  rule('CON41-C', {
    risk: 'LUM', cwe: ['CWE-662'], approx: true,
    name: ['Wrap functions that can fail spuriously in a loop', '가짜로 실패할 수 있는 함수는 루프로 감싸세요'],
    why: ['atomic_compare_exchange_weak() may fail even when the values are equal; called once outside a loop the update is silently lost.', 'atomic_compare_exchange_weak() 는 값이 같아도 실패할 수 있어 루프 밖에서 한 번만 부르면 갱신이 조용히 사라집니다.'],
    fix: ['Retry the weak compare-exchange in a loop, or use the strong form for a single attempt.', 'weak compare-exchange 는 루프에서 재시도하거나 한 번만 시도할 때는 strong 형을 사용하세요.'],
  }, {
    check(unit, api) {
      const list = [...S.calls(unit, CAS_WEAK, api.project).map((c) => c.node), ...U.memberCalls(unit, ['compare_exchange_weak'])];
      for (const c of list) {
        if (U.loopOf(c)) continue;
        api.report(c, M(`${U.callName(c)}() can fail spuriously but is not retried in a loop.`, `${U.callName(c)}() 는 가짜로 실패할 수 있는데 루프에서 재시도하지 않습니다.`));
      }
    },
  }),

  rule('CON43-C', {
    risk: 'MPH', cwe: ['CWE-366', 'CWE-362'], approx: true,
    name: ['Do not allow data races in multithreaded code', '다중 스레드 코드에서 데이터 경합을 허용하지 마세요'],
    why: ['A shared non-atomic object written by a thread while other threads access it without synchronisation is a data race and undefined behavior.', '공유된 비원자 객체를 한 스레드가 쓰는 동안 다른 스레드가 동기화 없이 접근하면 데이터 경합이며 정의되지 않은 동작입니다.'],
    fix: ['Protect the object with a mutex held around every access, or make it _Atomic.', '모든 접근을 뮤텍스로 보호하거나 객체를 _Atomic 으로 만드세요.'],
  }, {
    project(project, api) {
      const reach = S.reachMap(project, 'threads');
      for (const [fn, roots] of reach) {
        const unit = S.unitOf(project, fn);
        if (!unit) continue;
        const seen = new Set();
        for (const id of cf.findAll(fn.body, 'Identifier')) {
          const s = id.symbol;
          if (!s || s.kind !== 'variable' || s.storage !== 'static' || seen.has(s) || s.system) continue;
          if (S.isConstType(s.type) || S.isAtomicSym(s)) continue;
          const top = S.lvalueTop(id);
          if (!S.isWrite(top)) continue;
          if (S.heldAt(unit, fn, id, project).length) continue;
          seen.add(s);
          const r = roots[0];
          api.report(id, M(`Shared object '${s.name}' is modified in thread code ('${S.fnLabel(fn)}'${r.fn !== fn ? `, reached from start routine '${S.fnLabel(r.fn)}'` : ''}) without holding a lock.`, `공유 객체 '${s.name}' 를 스레드 코드('${S.fnLabel(fn)}'${r.fn !== fn ? `, 시작 루틴 '${S.fnLabel(r.fn)}' 에서 호출` : ''})에서 잠금 없이 수정합니다.`));
        }
      }
    },
  }),
];
