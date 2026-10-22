'use strict';

// SEI CERT C++ — CON: concurrency.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/cppx');
const { M, T, cf } = U;

const CPP = ['cpp'];
const fnLabel = (fn) => X.label(fn);

// ------------------------------------------------------------ lock model
// Lock acquisitions / releases of one function, in source order.
// event = { kind: 'lock'|'trylock'|'unlock'|'guard'|'multi'|'adopt', keys, node, start, until, recursive, expr }
const EVENTS = new WeakMap();
function lockEvents(unit, fn) {
  if (EVENTS.has(fn)) return EVENTS.get(fn);
  const evs = [];
  const fnEnd = fn.body ? fn.body.loc.end : fn.loc.end;
  for (const c of X.ownNodes(fn, 'CallExpr')) {
    const m = X.memberCallOn(c);
    if (m && X.isMutexExpr(m.obj)) {
      const key = X.objKey(unit, m.obj);
      const kind = { lock: 'lock', lock_shared: 'lock', try_lock: 'trylock', try_lock_for: 'trylock', try_lock_until: 'trylock', unlock: 'unlock', unlock_shared: 'unlock' }[m.name];
      if (kind) evs.push({ kind, keys: [key], node: c, start: c.loc.start, recursive: X.isRecursiveMutexExpr(m.obj), expr: m.obj });
      continue;
    }
    if (!m && U.callName(c) === 'lock' && c.args.length >= 2 && ['std', ''].includes(U.calleeQualifier(c) || '')) {
      const ms = c.args.filter((a) => X.isMutexExpr(a));
      if (ms.length >= 2) evs.push({ kind: 'multi', keys: ms.map((a) => X.objKey(unit, a)), node: c, start: c.loc.start });
    }
  }
  for (const d of X.ownNodes(fn, 'VarDecl')) {
    const g = X.guardKind(d);
    if (!g) continue;
    const args = X.initArgs(d);
    if (args.some((a) => X.isTag(a, 'defer_lock'))) continue;
    const ms = args.filter((a) => X.isMutexExpr(a) || (!X.isTag(a, 'adopt_lock') && !X.isTag(a, 'try_to_lock') && U.strip(a) && ['Identifier', 'MemberExpr'].includes(U.strip(a).type) && /mutex|mtx|lock|^m_?$|^m\w*_$/i.test(U.src(unit, a))));
    if (!ms.length) continue;
    const stmt = U.parent(d);
    const block = stmt && U.parent(stmt);
    const until = block && block.type === 'CompoundStmt' ? block.loc.end : fnEnd;
    const kind = args.some((a) => X.isTag(a, 'adopt_lock')) ? 'adopt' : ms.length >= 2 ? 'multi' : args.some((a) => X.isTag(a, 'try_to_lock')) ? 'trylock' : 'guard';
    evs.push({ kind, keys: ms.map((a) => X.objKey(unit, a)), node: d, start: d.loc.start, until, recursive: ms.some((a) => X.isRecursiveMutexExpr(a)), expr: ms[0], guard: g });
  }
  evs.sort((a, b) => a.start - b.start);
  for (const e of evs) {
    if (e.kind !== 'lock' && e.kind !== 'trylock') continue;
    if (e.until) continue;
    const un = evs.find((x) => x.kind === 'unlock' && x.start > e.start && x.keys[0] === e.keys[0]);
    e.until = un ? un.start : fnEnd;
    e.unlock = un || null;
  }
  EVENTS.set(fn, evs);
  return evs;
}

const acquires = (e) => e.kind === 'lock' || e.kind === 'trylock' || e.kind === 'guard' || e.kind === 'multi';

// Walk acquisitions with the set of locks held at that point.
function walkHeld(evs, visit) {
  const held = [];
  for (const e of evs) {
    if (!acquires(e) && e.kind !== 'adopt') continue;
    const active = held.filter((h) => h.until > e.start);
    if (e.kind !== 'adopt') visit(e, active);
    held.push(e);
  }
}

// Root symbol of a mutex expression (for cross-function comparison): globals / members only.
function stableKey(expr) {
  let e = U.strip(expr);
  while (e && e.type === 'MemberExpr') {
    const o = U.strip(e.object);
    if (o && o.type === 'ThisExpr') return `this.${e.member}`;
    e = o;
  }
  const s = U.idSym(e);
  if (!s) return null;
  if (s.kind === 'field') return `field#${s.id}`;
  if (s.storage === 'static') return `#${s.id}`;
  return null;
}
const rootParam = (expr) => {
  let e = U.strip(expr);
  while (e && e.type === 'MemberExpr') e = U.strip(e.object);
  const s = U.idSym(e);
  return s && s.kind === 'parameter' ? s : null;
};

// ---------------------------------------------------------- thread entries
const THREAD_TYPES = /^(::)?std::(thread|jthread)$/;
function threadEntries(unit, project) {
  const out = [];
  const add = (callable, site, args) => {
    const f = X.handlerFn(callable, project);
    if (f) out.push({ fn: f, site, args: args || [], inLoop: !!U.loopOf(site) });
  };
  for (const d of U.nodes(unit, 'VarDecl')) {
    if (!THREAD_TYPES.test(U.declTypeName(d) || '')) continue;
    const a = X.initArgs(d);
    if (a.length) add(a[0], d, a.slice(1));
  }
  for (const c of U.nodes(unit, 'CastExpr')) {
    if (c.kind !== 'functional' || !THREAD_TYPES.test(U.typeName(c.ctype) || '')) continue;
    const a = c.arg ? [c.arg] : (c.args || []);
    if (a.length) add(a[0], c, a.slice(1));
  }
  for (const c of U.nodes(unit, 'CallExpr')) {
    const n = U.callName(c);
    if (n === 'async' && !U.isMemberCall(c)) {
      const first = U.strip(c.args[0]);
      const i = first && /launch/.test(U.src(unit, first)) ? 1 : 0;
      if (c.args[i]) add(c.args[i], c, c.args.slice(i + 1));
    } else if (n === 'emplace_back' && U.isMemberCall(c) && /thread/.test(X.exprTypeName(X.memberCallOn(c).obj) + U.src(unit, X.memberCallOn(c).obj)) && c.args[0]) {
      add(c.args[0], c, c.args.slice(1));
    }
  }
  return out;
}

function hasLocking(root) {
  if (!root) return false;
  return !!cf.findFirst(root, (n) => (n.type === 'VarDecl' && X.guardKind(n)) || (n.type === 'CallExpr' && X.memberCallOn(n) && /^(lock|try_lock)$/.test(X.memberCallOn(n).name)));
}

function bitFieldWrites(root, owner) {
  const out = [];
  if (!root) return out;
  for (const n of cf.findAll(root, ['AssignExpr', 'UnaryExpr'])) {
    if (owner && U.enclosingFn(n) !== owner) continue;
    const t = n.type === 'AssignExpr' ? U.strip(n.left) : (n.op === '++' || n.op === '--') ? U.strip(n.arg) : null;
    if (!t || t.type !== 'MemberExpr' || !t.bitField) continue;
    const rec = X.recordOf(U.strip(t.object) && U.strip(t.object).ctype, t.arrow);
    if (!rec) continue;
    out.push({ node: n, target: t, rec, field: t.member });
  }
  return out;
}

const CV_RE = /^(::)?std::condition_variable(_any)?$/;
const isCv = (e) => CV_RE.test(X.exprTypeName(e) || '');

function cvWaits(unit) {
  const out = [];
  for (const c of U.nodes(unit, 'CallExpr')) {
    const m = X.memberCallOn(c);
    if (!m || !/^wait(_for|_until)?$/.test(m.name) || !isCv(m.obj)) continue;
    const needed = m.name === 'wait' ? 1 : 2;
    const pred = c.args.length > needed ? c.args[needed] : null;
    const fn = U.enclosingFn(c);
    const loop = U.loopOf(c, fn);
    out.push({ call: c, name: m.name, key: X.objKey(unit, m.obj), pred, loop, fn });
  }
  return out;
}

module.exports = [
  rule('CON50-CPP', {
    langs: CPP, risk: 'MPH', cwe: ['CWE-667'], approx: true,
    name: ['Do not destroy a mutex while it is locked', '잠긴 상태의 뮤텍스를 소멸시키지 마세요'],
    why: ['Destroying a std::mutex that is still owned (or that detached threads may still lock) is undefined behavior.', '아직 소유된(또는 분리된 스레드가 잠글 수 있는) std::mutex 를 소멸시키면 정의되지 않은 동작입니다.'],
    fix: ['Give the mutex a lifetime longer than every thread that uses it (static or owning object, join the threads) and always release it with RAII guards.', '뮤텍스 수명을 사용하는 모든 스레드보다 길게 하고(static 이나 소유 객체, 스레드 join) RAII 가드로 항상 해제하세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        const locals = X.ownNodes(fn, 'VarDecl').filter((d) => d.symbol && d.symbol.storage === 'automatic' && X.isMutexName(U.declTypeName(d)));
        if (!locals.length) continue;
        const detaches = X.ownNodes(fn, 'CallExpr').filter((c) => { const m = X.memberCallOn(c); return m && m.name === 'detach'; });
        const evs = lockEvents(unit, fn);
        for (const d of locals) {
          const key = `#${d.symbol.id}`;
          const used = (d.symbol.uses || []).some((u) => U.enclosingFn(u) && U.enclosingFn(u) !== fn)
            || X.ownNodes(fn, 'LambdaExpr').some((l) => l.captureDefault === '&' && cf.findFirst(l.body, (n) => n.type === 'Identifier' && n.symbol === d.symbol))
            || (d.symbol.uses || []).some((u) => { const p = U.parent(u); return p && p.type === 'CallExpr' && U.callName(p) === 'ref'; });
          if (detaches.length && used) {
            api.report(d, M(`Local mutex '${d.name}' is used by a detached thread; it is destroyed when '${fnLabel(fn)}' returns, possibly while still locked.`, `지역 뮤텍스 '${d.name}' 를 분리된 스레드가 사용하는데 '${fnLabel(fn)}' 가 반환될 때 잠긴 채 소멸될 수 있습니다.`));
            continue;
          }
          const lk = evs.find((e) => (e.kind === 'lock') && e.keys[0] === key && !e.unlock);
          if (lk) api.report(lk.node, M(`Local mutex '${d.name}' is locked and never unlocked; it is destroyed while still owned at the end of '${fnLabel(fn)}'.`, `지역 뮤텍스 '${d.name}' 를 잠근 뒤 풀지 않아 '${fnLabel(fn)}' 끝에서 잠긴 채 소멸됩니다.`));
        }
      }
    },
  }),

  rule('CON51-CPP', {
    langs: CPP, risk: 'LPL', cwe: ['CWE-667', 'CWE-833'], approx: true,
    name: ['Ensure actively held locks are released on exceptional conditions', '예외 상황에서도 잡고 있는 잠금이 해제되도록 하세요'],
    why: ['With manual lock()/unlock(), an exception thrown between the two skips the unlock and leaves the mutex locked forever; other threads then deadlock.', 'lock()/unlock() 을 직접 호출하면 그 사이의 예외가 unlock 을 건너뛰어 뮤텍스가 계속 잠기고 다른 스레드가 교착됩니다.'],
    fix: ['Use std::lock_guard, std::unique_lock or std::scoped_lock so the destructor unlocks during stack unwinding.', '스택 되감기 중 소멸자가 잠금을 풀도록 std::lock_guard, std::unique_lock, std::scoped_lock 을 사용하세요.'],
  }, {
    check(unit, api) {
      const S = X.summaryFor(api.project);
      const mayThrow = (n) => {
        if (n.type === 'ThrowExpr' || n.type === 'NewExpr') return true;
        if (n.type !== 'CallExpr') return false;
        const m = X.memberCallOn(n);
        if (m && X.isMutexExpr(m.obj)) return false;
        const s = n.calleeSymbol || U.idSym(n.callee);
        if (s && s.system) return false;
        const d = U.calleeDef(n, api.project);
        if (d) return !X.isNoexcept(d) && !!S.canThrow(d);
        if (s && s.decls && s.decls.some((x) => x.type === 'FunctionDecl' && X.isNoexcept(x))) return false;
        return true;
      };
      for (const fn of U.functions(unit)) {
        for (const e of lockEvents(unit, fn)) {
          if (e.kind !== 'lock' || !e.unlock) continue;
          const between = cf.findAll(fn.body, (n) => (n.type === 'CallExpr' || n.type === 'ThrowExpr' || n.type === 'NewExpr') && n.loc.start > e.node.loc.end && n.loc.end < e.unlock.start && U.enclosingFn(n) === fn);
          const risky = between.find((n) => {
            if (!mayThrow(n)) return false;
            // protected by a try whose handler unlocks
            let p = U.parent(n), c = n;
            while (p && p !== fn) {
              if (p.type === 'TryStmt' && U.pkey(c) === 'body' && (p.handlers || []).some((h) => cf.findFirst(h.body, (x) => x.type === 'CallExpr' && X.memberCallOn(x) && X.memberCallOn(x).name === 'unlock'))) return false;
              c = p; p = U.parent(p);
            }
            return true;
          });
          if (!risky) continue;
          const what = risky.type === 'CallExpr' ? `'${U.callName(risky) || U.src(unit, risky.callee)}()'` : risky.type === 'NewExpr' ? `'new'` : `'throw'`;
          api.report(e.node, M(`'${U.src(unit, e.expr)}' is locked manually and ${what} may throw before unlock(); use std::lock_guard.`, `'${U.src(unit, e.expr)}' 를 직접 잠근 뒤 unlock() 전에 ${what} 가 예외를 던질 수 있습니다. std::lock_guard 를 사용하세요.`));
        }
      }
    },
  }),

  rule('CON52-CPP', {
    langs: CPP, risk: 'MPM', cwe: ['CWE-362'], approx: true,
    name: ['Prevent data races when accessing bit-fields from multiple threads', '여러 스레드에서 비트 필드에 접근할 때 데이터 경쟁을 막으세요'],
    why: ['Adjacent bit-fields share one memory location; writing different bit-fields of the same object from different threads is a data race even though the fields are distinct.', '인접한 비트 필드는 같은 메모리 위치를 공유하므로 서로 다른 비트 필드라도 다른 스레드에서 쓰면 데이터 경쟁입니다.'],
    fix: ['Protect all bit-fields of the object with one mutex, or use separate non-bit-field members (or std::atomic).', '객체의 모든 비트 필드를 하나의 뮤텍스로 보호하거나 비트 필드가 아닌 별도 멤버(또는 std::atomic)를 사용하세요.'],
  }, {
    check(unit, api) {
      const entries = threadEntries(unit, api.project);
      if (!entries.length) return;
      const groups = [];
      const seenFn = new Set();
      for (const en of entries) {
        if (seenFn.has(en.fn)) continue;
        seenFn.add(en.fn);
        if (hasLocking(en.fn.body)) continue;
        const w = bitFieldWrites(en.fn.body, en.fn);
        if (w.length) groups.push({ en, writes: w });
      }
      // the creating function, after starting the thread
      for (const en of entries) {
        const creator = U.enclosingFn(en.site);
        if (!creator || seenFn.has(creator) || hasLocking(creator.body)) continue;
        const w = bitFieldWrites(creator.body, creator).filter((x) => x.node.loc.start > en.site.loc.end);
        if (w.length) { groups.push({ en: { fn: creator }, writes: w }); seenFn.add(creator); }
      }
      const reported = new Set();
      for (let i = 0; i < groups.length; i++) {
        for (let j = 0; j < groups.length; j++) {
          if (i === j) continue;
          for (const a of groups[i].writes) {
            const other = groups[j].writes.find((b) => X.sameRec(a.rec, b.rec));
            if (!other || reported.has(a.node)) continue;
            reported.add(a.node);
            api.report(a.node, M(`Bit-field '${a.field}' of '${a.rec.name}' is written in '${fnLabel(groups[i].en.fn)}' while '${fnLabel(groups[j].en.fn)}' writes bit-field '${other.field}' concurrently without a lock; they share one memory location.`, `'${a.rec.name}' 의 비트 필드 '${a.field}' 를 '${fnLabel(groups[i].en.fn)}' 에서 쓰는 동안 '${fnLabel(groups[j].en.fn)}' 가 잠금 없이 비트 필드 '${other.field}' 를 씁니다. 같은 메모리 위치를 공유합니다.`));
          }
        }
      }
    },
  }),

  rule('CON53-CPP', {
    langs: CPP, risk: 'LPM', cwe: ['CWE-833', 'CWE-764'], approx: true,
    name: ['Avoid deadlock by locking in a predefined order', '정해진 순서로 잠가 교착 상태를 피하세요'],
    why: ['Two threads that acquire the same pair of mutexes in opposite orders can each hold one and wait forever for the other.', '같은 두 뮤텍스를 서로 반대 순서로 잠그는 두 스레드는 각자 하나를 잡고 다른 하나를 영원히 기다릴 수 있습니다.'],
    fix: ['Lock several mutexes at once with std::scoped_lock / std::lock, or always acquire them in one global order.', 'std::scoped_lock/std::lock 으로 여러 뮤텍스를 한 번에 잠그거나 항상 하나의 전역 순서로 잠그세요.'],
  }, {
    check(unit, api) {
      const pairs = new Map(); // 'A|B' -> { e, fn, a, b }
      for (const fn of U.functions(unit)) {
        const evs = lockEvents(unit, fn);
        walkHeld(evs, (e, active) => {
          if (e.kind === 'multi' || e.kind === 'trylock') return;
          for (const h of active) {
            if (h.kind === 'multi') continue;
            if (h.keys[0] === e.keys[0]) continue;
            // argument-dependent order: same member of two different parameters
            const pa = rootParam(h.expr), pb = rootParam(e.expr);
            const ea = U.strip(h.expr), eb = U.strip(e.expr);
            if (pa && pb && pa !== pb && ea.type === 'MemberExpr' && eb.type === 'MemberExpr' && ea.member === eb.member) {
              api.report(e.node, M(`'${U.src(unit, e.expr)}' is locked while holding '${U.src(unit, h.expr)}'; the order depends on the arguments, so two calls with swapped arguments deadlock. Use std::scoped_lock or std::lock.`, `'${U.src(unit, h.expr)}' 를 잡은 채 '${U.src(unit, e.expr)}' 를 잠급니다. 순서가 인수에 따라 달라 인수를 바꾼 두 호출이 교착됩니다. std::scoped_lock 이나 std::lock 을 사용하세요.`));
              continue;
            }
            const ka = stableKey(h.expr), kb = stableKey(e.expr);
            if (!ka || !kb || ka === kb) continue;
            const k = `${ka}|${kb}`;
            if (!pairs.has(k)) pairs.set(k, { e, fn, a: h, b: e });
          }
        });
      }
      for (const [k, v] of pairs) {
        const [ka, kb] = k.split('|');
        const rev = pairs.get(`${kb}|${ka}`);
        if (!rev || rev.fn === v.fn && rev.e === v.e) continue;
        if (ka > kb) continue; // report once per pair
        api.report(v.e.node, M(`'${fnLabel(v.fn)}' locks '${U.src(unit, v.a.expr)}' then '${U.src(unit, v.b.expr)}', but '${fnLabel(rev.fn)}' locks them in the opposite order: possible deadlock.`, `'${fnLabel(v.fn)}' 는 '${U.src(unit, v.a.expr)}' 다음 '${U.src(unit, v.b.expr)}' 를 잠그지만 '${fnLabel(rev.fn)}' 는 반대 순서로 잠가 교착될 수 있습니다.`));
      }
    },
  }),

  rule('CON54-CPP', {
    langs: CPP, risk: 'LUM', cwe: ['CWE-662'], approx: false,
    name: ['Wrap functions that can spuriously wake up in a loop', '가짜 깨어남이 있는 함수는 반복문으로 감싸세요'],
    why: ['condition_variable::wait can return without a notification (spurious wake-up) or after another thread already consumed the condition; waiting without re-checking the predicate proceeds on a false condition.', 'condition_variable::wait 는 알림 없이(가짜 깨어남) 또는 다른 스레드가 조건을 이미 소비한 뒤 반환될 수 있어, 조건을 다시 검사하지 않으면 거짓 조건에서 진행합니다.'],
    fix: ['Use the predicate overload cv.wait(lock, [&]{ return ready; }) or call wait in while (!ready) cv.wait(lock);', '조건자 버전 cv.wait(lock, [&]{ return ready; }) 를 쓰거나 while (!ready) cv.wait(lock); 안에서 호출하세요.'],
  }, {
    check(unit, api) {
      for (const w of cvWaits(unit)) {
        if (w.pred || w.loop) continue;
        api.report(w.call, M(`'${U.src(unit, U.skip(w.call.callee))}' is called without a predicate and outside a loop; a spurious wake-up is not handled.`, `'${U.src(unit, U.skip(w.call.callee))}' 를 조건자 없이 반복문 밖에서 호출해 가짜 깨어남을 처리하지 않습니다.`));
      }
    },
  }),

  rule('CON55-CPP', {
    langs: CPP, risk: 'LUM', cwe: ['CWE-662'], approx: true,
    name: ['Preserve thread safety and liveness when using condition variables', '조건 변수를 사용할 때 스레드 안전성과 진행성을 지키세요'],
    why: ['notify_one() wakes an arbitrary waiter; when threads wait on the same condition variable for different conditions, the woken thread may not be the one whose condition became true and everyone keeps waiting.', 'notify_one() 은 임의의 대기 스레드를 깨우므로, 서로 다른 조건으로 같은 조건 변수를 기다리면 깨어난 스레드의 조건이 거짓일 수 있어 모두 계속 기다립니다.'],
    fix: ['Use notify_all() (each waiter re-checks its own predicate), or give each condition its own condition variable.', 'notify_all() 을 사용하거나(각자 조건 재검사) 조건마다 별도 조건 변수를 두세요.'],
  }, {
    check(unit, api) {
      const waits = cvWaits(unit);
      if (!waits.length) return;
      const predText = (w) => {
        if (w.pred) return U.src(unit, w.pred).replace(/\s+/g, '');
        if (w.loop && w.loop.cond) return U.src(unit, w.loop.cond).replace(/\s+/g, '');
        return null;
      };
      const threadSpecific = (w) => {
        const root = w.pred || (w.loop && w.loop.cond);
        if (!root) return false;
        return cf.findAll(root, 'Identifier').some((id) => {
          const s = id.symbol;
          if (!s || !(s.kind === 'parameter' || (s.kind === 'variable' && s.storage === 'automatic'))) return false;
          const decl = (s.decls || [])[0];
          if (!decl) return false;
          const declFn = U.enclosingFn(decl);
          if (w.pred && w.pred.type === 'LambdaExpr' && declFn === w.pred) return false;
          if (/mutex|lock/.test(U.declTypeName(decl) || '')) return false;
          return true;
        });
      };
      for (const c of U.nodes(unit, 'CallExpr')) {
        const m = X.memberCallOn(c);
        if (!m || m.name !== 'notify_one' || !isCv(m.obj)) continue;
        const key = X.objKey(unit, m.obj);
        const same = waits.filter((w) => w.key === key);
        const texts = new Set(same.map(predText).filter(Boolean));
        const specific = same.find(threadSpecific);
        if (texts.size < 2 && !specific) continue;
        api.report(c, M(`notify_one() on '${U.src(unit, m.obj)}' may wake a thread whose condition is still false: waiters use ${texts.size >= 2 ? 'different predicates' : 'a thread-specific predicate'}. Use notify_all().`, `'${U.src(unit, m.obj)}' 의 notify_one() 이 조건이 아직 거짓인 스레드를 깨울 수 있습니다. 대기자가 ${texts.size >= 2 ? '서로 다른 조건' : '스레드마다 다른 조건'}을 씁니다. notify_all() 을 사용하세요.`));
      }
    },
  }),

  rule('CON56-CPP', {
    langs: CPP, risk: 'LUH', cwe: ['CWE-667', 'CWE-764'], approx: true,
    name: ['Do not speculatively lock a non-recursive mutex that is already owned by the calling thread', '호출 스레드가 이미 소유한 비재귀 뮤텍스를 다시 잠그지 마세요'],
    why: ['Locking (or try_lock-ing) a std::mutex that the current thread already owns is undefined behavior; in practice it deadlocks.', '현재 스레드가 이미 소유한 std::mutex 를 다시 잠그거나 try_lock 하면 정의되지 않은 동작이며 실제로는 교착됩니다.'],
    fix: ['Restructure so the mutex is locked once (pass the lock or split locked / unlocked helpers), or use std::recursive_mutex deliberately.', '뮤텍스를 한 번만 잠그도록(잠금을 넘기거나 잠금/비잠금 보조 함수로 분리) 구조를 바꾸거나 의도적으로 std::recursive_mutex 를 쓰세요.'],
  }, {
    check(unit, api) {
      // functions (by node) that acquire a stable mutex key directly
      const acquirersOf = new Map();
      for (const fn of U.functions(unit)) {
        for (const e of lockEvents(unit, fn)) {
          if (!acquires(e) || e.kind === 'multi') continue;
          const k = stableKey(e.expr);
          if (!k || e.recursive) continue;
          if (!acquirersOf.has(fn)) acquirersOf.set(fn, new Map());
          if (!acquirersOf.get(fn).has(k)) acquirersOf.get(fn).set(k, e);
        }
      }
      for (const fn of U.functions(unit)) {
        const evs = lockEvents(unit, fn);
        walkHeld(evs, (e, active) => {
          for (const key of e.keys) {
            const h = active.find((x) => x.keys.includes(key) && !x.recursive);
            if (!h || e.recursive) continue;
            const op = e.kind === 'trylock' ? 'try_lock' : e.kind === 'lock' ? 'lock' : e.guard || 'lock';
            api.report(e.node, M(`'${U.src(unit, e.expr)}' is acquired again (${op}) while already owned by this thread since line ${h.node.loc.line}; non-recursive mutex: undefined behavior / deadlock.`, `${h.node.loc.line}행부터 이미 이 스레드가 소유한 '${U.src(unit, e.expr)}' 를 다시 획득(${op})합니다. 비재귀 뮤텍스라 정의되지 않은 동작/교착입니다.`));
          }
        });
        // calls made while holding a lock to functions that lock the same mutex
        const held = evs.filter((e) => acquires(e) && e.kind !== 'multi' && !e.recursive && stableKey(e.expr));
        if (!held.length) continue;
        for (const c of X.ownNodes(fn, 'CallExpr')) {
          const d = U.calleeDef(c, api.project);
          if (!d || d === fn || !acquirersOf.has(d)) continue;
          for (const h of held) {
            if (!(h.start < c.loc.start && h.until > c.loc.start)) continue;
            const k = stableKey(h.expr);
            const inner = acquirersOf.get(d).get(k);
            if (!inner) continue;
            if (k.startsWith('this.') || k.startsWith('field#')) {
              const co = U.skip(c.callee);
              if (co.type === 'MemberExpr' && U.strip(co.object).type !== 'ThisExpr') continue; // another object's mutex
            }
            api.report(c, M(`'${U.callName(c)}' locks '${U.src(unit, inner.expr)}', which '${fnLabel(fn)}' already holds (line ${h.node.loc.line}); deadlock on a non-recursive mutex.`, `'${U.callName(c)}' 가 '${fnLabel(fn)}' 이 이미 잡고 있는(${h.node.loc.line}행) '${U.src(unit, inner.expr)}' 를 잠가 비재귀 뮤텍스에서 교착됩니다.`));
            break;
          }
        }
      }
    },
  }),
];
