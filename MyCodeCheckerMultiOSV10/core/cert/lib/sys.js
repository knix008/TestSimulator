'use strict';

// Shared helpers for the CERT SIG / ERR / CON / MSC / POS / WIN rule modules:
// library calls that also see C++ "functional casts" of POSIX struct/function
// name clashes, signal handlers and thread start routines collected across the
// project, cross-unit object keys, and a positional lock-set approximation.

const U = require('./util');
const { cf, T } = U;

// ------------------------------------------------------------------- calls
// Front-end workaround: in C++ `struct sigaction sa; sigaction(SIGINT, &sa, 0);`
// (no <signal.h> prototype for sigaction) parses the call as a functional cast
// to `struct sigaction`. Treat such casts as calls named after the type.
function castCallName(n) {
  if (!n || n.type !== 'CastExpr' || n.kind !== 'functional' || !n.typeName) return null;
  const ts = n.typeName.specs && n.typeName.specs.typeSpec;
  if (!ts) return null;
  if (ts.type === 'NamedType') return ts.name;
  if (ts.type === 'RecordDecl' && !ts.members) return ts.name;
  return null;
}

const asSet = (names) => (typeof names === 'string' ? new Set([names]) : names instanceof Set ? names : new Set(names));

function wrap(node, name) {
  const args = node.type === 'CallExpr' ? node.args : node.args ? node.args : node.arg ? [node.arg] : [];
  return { node, name, args, loc: node.loc };
}

// A library call: not defined by the user anywhere in the project.
function isLibP(call, names, project) {
  if (!U.isLib(call, names)) return false;
  return !U.calleeDef(call, project);
}

// Library calls `names` in a unit: [{ node, name, args, loc }]
const CALLS = new WeakMap();
function calls(unit, names, project) {
  const set = asSet(names);
  const out = [];
  for (const c of U.nodes(unit, 'CallExpr')) if (isLibP(c, set, project)) out.push(wrap(c, U.callName(c)));
  if (unit.lang === 'cpp') {
    let casts = CALLS.get(unit);
    if (!casts) {
      casts = U.nodes(unit, 'CastExpr').filter((c) => castCallName(c));
      CALLS.set(unit, casts);
    }
    for (const c of casts) { const n = castCallName(c); if (set.has(n)) out.push(wrap(c, n)); }
    out.sort((a, b) => a.loc.start - b.loc.start);
  }
  return out;
}

// Library calls inside a subtree (same shape).
function callsIn(root, names, project) {
  if (!root) return [];
  const set = asSet(names);
  const out = [];
  cf.walk(root, (n) => {
    if (n.type === 'CallExpr' && isLibP(n, set, project)) out.push(wrap(n, U.callName(n)));
    else if (n.type === 'CastExpr') { const k = castCallName(n); if (k && set.has(k)) out.push(wrap(n, k)); }
    return undefined;
  });
  return out;
}

// Every library call in a subtree (name not filtered): for SIG30-C.
function allLibCallsIn(root, project) {
  const out = [];
  if (!root) return out;
  cf.walk(root, (n) => {
    if (n.type === 'CallExpr') {
      const name = U.callName(n);
      if (name && !U.isMemberCall(n) && U.isLib(n, name) && !U.calleeDef(n, project)) out.push(wrap(n, name));
    }
    return undefined;
  });
  return out;
}

const argOf = (c, i) => (c && c.args && c.args[i] ? U.skip(c.args[i]) : null);

// ------------------------------------------------------------------- keys
// Object key comparable across units: globals by qname, locals by symbol id.
function gkey(unit, e) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'UnaryExpr' && e.op === '&') return gkey(unit, e.arg);
  if (e.type === 'Identifier') {
    const s = e.symbol;
    if (!s) return `?${e.name}`;
    if (s.storage === 'static' && s.linkage === 'external') return `G:${s.qname}`;
    if (s.storage === 'static') return `S:${s.file || ''}:${s.qname}`;
    return `#${s.id}`;
  }
  if (e.type === 'MemberExpr') { const o = gkey(unit, e.object); return o ? `${o}.${e.member}` : null; }
  if (e.type === 'IndexExpr') { const o = gkey(unit, e.object); return o ? `${o}[${U.src(unit, e.index).replace(/\s+/g, '')}]` : null; }
  if (e.type === 'UnaryExpr' && e.op === '*') { const o = gkey(unit, e.arg); return o ? `*${o}` : null; }
  return null;
}

// Root variable symbol of an lvalue (s.a.b -> s, p->x -> p, a[i] -> a).
function rootSym(e) {
  e = U.strip(e);
  while (e) {
    if (e.type === 'Identifier') return e.symbol || null;
    if (e.type === 'MemberExpr' || e.type === 'IndexExpr') e = U.strip(e.object);
    else if (e.type === 'UnaryExpr' && (e.op === '*' || e.op === '&')) e = U.strip(e.arg);
    else return null;
  }
  return null;
}

// ------------------------------------------------------------------- types
function typedefNames(t) {
  const out = [];
  let x = t;
  let guard = 0;
  while (x && x.kind === 'typedef' && guard++ < 20) { out.push(String(x.name || '').replace(/^(::)?std::/, '')); x = x.target; }
  return out;
}

function isAtomicType(t, decl) {
  if (t) {
    if (t.atomic) return true;
    const c = T.canonical(t);
    if (c && c.atomic) return true;
    if (typedefNames(t).some((n) => /^atomic_/.test(n))) return true;
  }
  if (decl) {
    const n = String(U.declTypeName(decl) || '');
    if (/^(::)?(std::)?atomic(_\w+)?$/.test(n) || /^(::)?(std::)?atomic_flag$/.test(n)) return true;
  }
  return false;
}

function isAtomicSym(s) {
  if (!s) return false;
  const d = s.definition || (s.decls && s.decls[0]);
  return isAtomicType(s.type, d && (d.type === 'VarDecl' || d.type === 'FieldDecl') ? d : null);
}

function isVolatileSigAtomic(t) {
  if (!t) return false;
  const c = T.canonical(t);
  const vol = !!(t.volatile || (c && c.volatile));
  return vol && typedefNames(t).some((n) => n === 'sig_atomic_t');
}

function isConstType(t) {
  if (!t) return false;
  const c = T.canonical(t);
  return !!(t.const || (c && c.const));
}

// ------------------------------------------------------------- signal / thread
const SIGNAL_NUM = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGILL: 4, SIGTRAP: 5, SIGABRT: 6, SIGBUS: 7, SIGFPE: 8, SIGKILL: 9, SIGUSR1: 10, SIGSEGV: 11, SIGUSR2: 12, SIGPIPE: 13, SIGALRM: 14, SIGTERM: 15 };
const NUM_SIGNAL = Object.fromEntries(Object.entries(SIGNAL_NUM).map(([k, v]) => [v, k]));

// Name of the signal an expression denotes ('SIGSEGV'), or null.
function signalName(unit, e) {
  if (!e) return null;
  const s = U.strip(e);
  if (e.loc && e.loc.macro && SIGNAL_NUM[e.loc.macro]) return e.loc.macro;
  if (s && s.type === 'Identifier' && SIGNAL_NUM[s.name]) return s.name;
  const t = U.src(unit, e).trim();
  if (SIGNAL_NUM[t]) return t;
  const v = U.constInt(unit, e);
  return v != null && NUM_SIGNAL[Number(v)] ? NUM_SIGNAL[Number(v)] : null;
}

const INFO = new WeakMap();

const THREAD_CREATE = { thrd_create: { fn: 1, arg: 2, api: 'c11' }, pthread_create: { fn: 2, arg: 3, api: 'pthread' } };

// Project-wide facts: signal handlers and thread start routines.
function info(project) {
  let inf = project && INFO.get(project);
  if (inf) return inf;
  inf = { handlers: [], threads: [], c11Threads: false, pthreads: false };
  const units = (project && project.units) || [];
  for (const unit of units) {
    // signal(sig, handler)
    for (const c of calls(unit, 'signal', project)) {
      const fn = U.fnFromExpr(c.args[1], project);
      if (fn) inf.handlers.push({ fn, sig: signalName(unit, c.args[0]), site: c.node, unit, via: 'signal' });
    }
    // sigaction: sa.sa_handler = h / { .sa_handler = h }
    const sigCalls = calls(unit, 'sigaction', project);
    const sigOf = (objKey) => {
      for (const c of sigCalls) if (objKey && gkey(unit, c.args[1]) === objKey) return signalName(unit, c.args[0]);
      return null;
    };
    for (const a of U.nodes(unit, 'AssignExpr')) {
      const l = U.strip(a.left);
      if (a.op !== '=' || !l || l.type !== 'MemberExpr' || !/^sa_(handler|sigaction)$/.test(l.member)) continue;
      const fn = U.fnFromExpr(a.right, project);
      if (fn) inf.handlers.push({ fn, sig: sigOf(gkey(unit, l.object)), site: a, unit, via: 'sigaction' });
    }
    for (const d of U.nodes(unit, 'DesignatedInit')) {
      const ds = d.designators || [];
      const last = ds[ds.length - 1];
      if (!last || last.kind !== 'field' || !/^sa_(handler|sigaction)$/.test(last.name || '')) continue;
      const fn = U.fnFromExpr(d.value, project);
      if (!fn) continue;
      const vd = cf.enclosing(d, 'VarDecl');
      inf.handlers.push({ fn, sig: vd && vd.symbol ? sigOf(vd.symbol.storage === 'static' && vd.symbol.linkage === 'external' ? `G:${vd.symbol.qname}` : `#${vd.symbol.id}`) : null, site: d, unit, via: 'sigaction' });
    }
    for (const c of calls(unit, Object.keys(THREAD_CREATE), project)) {
      const spec = THREAD_CREATE[c.name];
      if (spec.api === 'c11') inf.c11Threads = true; else inf.pthreads = true;
      const fn = U.fnFromExpr(c.args[spec.fn], project);
      inf.threads.push({ fn, call: c, unit, api: spec.api, arg: argOf(c, spec.arg), tid: c.args[0] });
    }
  }
  inf.createsThreads = inf.c11Threads || inf.pthreads;
  if (project) INFO.set(project, inf);
  return inf;
}

// FunctionDecl -> Set of handlers / start routines reaching it (memoised).
const REACH = new WeakMap();
function reachMap(project, what, filter) {
  let byKey = REACH.get(project);
  if (!byKey) REACH.set(project, (byKey = new Map()));
  const k = what + (filter || '');
  if (byKey.has(k)) return byKey.get(k);
  const inf = info(project);
  const m = new Map(); // fn -> [root entry]
  const list = what === 'handlers' ? inf.handlers : inf.threads.filter((t) => t.fn && (!filter || t.api === filter));
  const done = new Set();
  for (const h of list) {
    if (done.has(h.fn)) continue;
    done.add(h.fn);
    for (const f of U.reachableDefs(h.fn, project)) {
      let l = m.get(f);
      if (!l) m.set(f, (l = []));
      l.push(h);
    }
  }
  byKey.set(k, m);
  return m;
}

// The unit that owns a node (for project rules that need U.src/U.nodes).
const UNIT_OF = new WeakMap();
function unitOf(project, node) {
  if (!project || !node) return null;
  let m = UNIT_OF.get(project);
  if (!m) { m = new Map(); for (const u of project.units) m.set(u.ast, u); UNIT_OF.set(project, m); }
  let root = node;
  while (root && cf.parentOf(root)) root = cf.parentOf(root);
  if (m.has(root)) return m.get(root);
  const file = node.loc && node.loc.file;
  for (const u of project.units) if (u.file === file) return u;
  return null;
}

// ------------------------------------------------------------------- locks
const LOCK = new Set(['mtx_lock', 'mtx_timedlock', 'mtx_trylock', 'pthread_mutex_lock', 'pthread_mutex_trylock', 'pthread_mutex_timedlock', 'EnterCriticalSection', 'pthread_rwlock_rdlock', 'pthread_rwlock_wrlock', 'pthread_spin_lock']);
const UNLOCK = new Set(['mtx_unlock', 'pthread_mutex_unlock', 'LeaveCriticalSection', 'pthread_rwlock_unlock', 'pthread_spin_unlock']);
const LOCK_ALL = new Set([...LOCK, ...UNLOCK]);

// Ordered lock/unlock events of a function body.
const EVENTS = new WeakMap();
function lockEvents(unit, fn, project) {
  let ev = EVENTS.get(fn);
  if (ev) return ev;
  ev = callsIn(fn.body, LOCK_ALL, project).map((c) => ({ op: LOCK.has(c.name) ? 'lock' : 'unlock', name: c.name, key: gkey(unit, c.args[0]), call: c }));
  // C++ RAII guards: std::lock_guard<std::mutex> g(m); std::unique_lock / scoped_lock
  if (unit.lang === 'cpp') {
    for (const d of cf.findAll(fn.body, 'VarDecl')) {
      const tn = String(U.declTypeName(d) || '');
      if (!/(^|::)(lock_guard|unique_lock|scoped_lock)$/.test(tn)) continue;
      const init = d.init && (d.init.args || d.init.items || [d.init]);
      const m = init && init[0];
      if (m) ev.push({ op: 'lock', name: tn, key: gkey(unit, m), call: { node: d, name: tn, args: [m], loc: d.loc }, raii: true });
    }
    ev.sort((a, b) => a.call.loc.start - b.call.loc.start);
  }
  EVENTS.set(fn, ev);
  return ev;
}

// Keys of the locks held (positionally) just before `node` in fn.
function heldAt(unit, fn, node, project) {
  const held = [];
  if (!fn || !fn.body) return held;
  for (const e of lockEvents(unit, fn, project)) {
    if (e.call.loc.start >= node.loc.start) break;
    if (e.op === 'lock') { if (!e.raii || encloses(cf.parentOf(stmtOrSelf(e.call.node)), node)) held.push(e.key); }
    else { const i = held.lastIndexOf(e.key); if (i >= 0) held.splice(i, 1); }
  }
  return held;
}

function stmtOrSelf(n) {
  return U.stmtOf(n) || n;
}

function encloses(a, b) {
  return !!a && !!b && a.loc && b.loc && a.loc.file === b.loc.file && a.loc.start <= b.loc.start && b.loc.end <= a.loc.end;
}

// ------------------------------------------------------------------- misc
// Is the node inside a branch that excludes the other (if/else, switch cases)?
function exclusive(a, b) {
  let n = a;
  let p = cf.parentOf(n);
  while (p) {
    if (p.type === 'IfStmt' && p.else) {
      const k = cf.parentKey(n);
      if (k === 'then' && encloses(p.else, b)) return true;
      if (k === 'else' && encloses(p.then, b)) return true;
    }
    if (p.type === 'ConditionalExpr' && p.consequent && p.alternate) {
      const k = cf.parentKey(n);
      if ((k === 'consequent' && encloses(p.alternate, b)) || (k === 'alternate' && encloses(p.consequent, b))) return true;
    }
    if (p.type === 'CaseStmt' || p.type === 'DefaultStmt') {
      const sw = cf.enclosing(p, 'SwitchStmt');
      if (sw && encloses(sw, b) && !encloses(p, b)) return true;
    }
    n = p;
    p = cf.parentOf(n);
  }
  return false;
}

function isErrno(e) {
  e = U.strip(e);
  if (!e) return false;
  if (e.loc && e.loc.macro === 'errno') return true;
  return e.type === 'Identifier' && e.name === 'errno';
}

function errnoUses(root) {
  if (!root) return [];
  return cf.findAll(root, (n) => (n.type === 'Identifier' && n.name === 'errno') || (n.type === 'CallExpr' && n.loc && n.loc.macro === 'errno'));
}

// Writes: the lvalue of an assignment or ++/--.
function isWrite(n) {
  const p = cf.parentOf(n);
  if (!p) return false;
  if (p.type === 'AssignExpr' && cf.parentKey(n) === 'left') return true;
  if (p.type === 'UnaryExpr' && (p.op === '++' || p.op === '--')) return true;
  if (p.type === 'ParenExpr') return isWrite(p);
  return false;
}

// Outermost lvalue expression containing n (n itself, or a member/index chain).
function lvalueTop(n) {
  let x = n;
  let p = cf.parentOf(x);
  while (p && ((p.type === 'MemberExpr' && cf.parentKey(x) === 'object' && !p.arrow) || (p.type === 'IndexExpr' && cf.parentKey(x) === 'object') || p.type === 'ParenExpr')) { x = p; p = cf.parentOf(x); }
  return x;
}

const fnLabel = (fn) => U.fnName(fn) || '?';
// Source text of an argument without a leading '&'.
function bare(unit, e) {
  const x = U.strip(e);
  return U.src(unit, x && x.type === 'UnaryExpr' && x.op === '&' ? x.arg : e);
}

// ------------------------------------------------- shared thread rule bodies
// Used by the CON (C11 threads) and POS (pthreads) twins.
const API = {
  c11: {
    label: 'thrd_create', create: 'thrd_create', join: new Set(['thrd_join']), detach: new Set(['thrd_detach']),
    lock: new Set(['mtx_lock', 'mtx_timedlock', 'mtx_trylock']), unlock: new Set(['mtx_unlock']), destroy: 'mtx_destroy', self: 'thrd_current',
  },
  pthread: {
    label: 'pthread_create', create: 'pthread_create', join: new Set(['pthread_join']), detach: new Set(['pthread_detach']),
    lock: new Set(['pthread_mutex_lock', 'pthread_mutex_timedlock', 'pthread_mutex_trylock']), unlock: new Set(['pthread_mutex_unlock']), destroy: 'pthread_mutex_destroy', self: 'pthread_self',
  },
};
const M2 = (en, ko) => ({ en, ko });

// CON34-C / POS50-C: address of an automatic object handed to a thread that may outlive it.
function autoArgToThread(unit, api, which) {
  const A = API[which];
  const inf = info(api.project);
  for (const t of inf.threads) {
    if (t.unit !== unit || t.api !== which || !t.arg) continue;
    let a = U.strip(t.arg);
    let addr = false;
    if (a && a.type === 'UnaryExpr' && a.op === '&') { addr = true; a = U.strip(a.arg); }
    const s = rootSym(a);
    if (!s || (s.kind !== 'variable' && s.kind !== 'parameter')) continue;
    const ty = U.canon(s.type);
    const isArr = ty && ty.kind === 'array';
    if (!addr && !isArr) continue;
    if (s.storage === 'thread') {
      api.report(t.call.node, M2(`The address of thread-local '${s.name}' is passed to a new thread; each thread has its own copy.`, `스레드 지역 객체 '${s.name}' 의 주소를 새 스레드에 넘깁니다. 스레드마다 별도 복사본이 있습니다.`));
      continue;
    }
    if (s.storage !== 'automatic') continue;
    const fn = U.enclosingFn(t.call.node);
    if (!fn) continue;
    const tidRoot = rootSym(t.tid);
    const later = callsIn(fn.body, new Set([...A.join, ...A.detach]), api.project).filter((c) => c.loc.start > t.call.loc.end);
    const joined = later.some((c) => A.join.has(c.name) && (!tidRoot || rootSym(c.args[0]) === tidRoot || gkey(unit, c.args[0]) === gkey(unit, t.tid)));
    const detached = later.some((c) => A.detach.has(c.name));
    if (joined && !detached) continue;
    api.report(t.call.node, M2(`'${U.src(unit, t.arg)}' points to automatic '${s.name}' of '${fnLabel(fn)}', which ${detached ? 'detaches the thread' : 'returns without joining the thread'}; the thread may use the object after it is gone.`, `'${U.src(unit, t.arg)}' 는 '${fnLabel(fn)}' 의 자동 객체 '${s.name}' 를 가리키는데 이 함수는 ${detached ? '스레드를 분리합니다' : '스레드를 조인하지 않고 반환합니다'}. 객체가 사라진 뒤 스레드가 사용할 수 있습니다.`));
  }
}

// CON35-C / POS51-C: two locks acquired in opposite orders.
function lockOrder(project, api, which) {
  const A = API[which];
  const pairs = new Map(); // 'a\u0001b' -> [{ node, fn }]
  const paramLocks = []; // { fn, i, j, node }
  for (const unit of project.units) {
    for (const fn of U.functions(unit)) {
      const held = [];
      for (const e of lockEvents(unit, fn, project)) {
        if (e.raii) continue;
        if (!e.raii && !A.lock.has(e.name) && !A.unlock.has(e.name)) continue;
        if (e.op === 'unlock') { const i = held.findIndex((h) => h.key === e.key); if (i >= 0) held.splice(i, 1); continue; }
        if (!e.key) continue;
        for (const h of held) {
          if (h.key === e.key) continue;
          const k = `${h.key}\u0001${e.key}`;
          if (!pairs.has(k)) pairs.set(k, []);
          pairs.get(k).push({ node: e.call.node, fn, a: h, b: e, unit });
          const ps = rootSym(h.call.args[0]), qs = rootSym(e.call.args[0]);
          if (ps && qs && ps !== qs && ps.kind === 'parameter' && qs.kind === 'parameter') {
            const i = fn.params.findIndex((p) => p.symbol === ps), j = fn.params.findIndex((p) => p.symbol === qs);
            if (i >= 0 && j >= 0) paramLocks.push({ fn, i, j, node: e.call.node, unit, a: h, b: e });
          }
        }
        held.push(e);
      }
    }
  }
  for (const [k, list] of pairs) {
    const [a, b] = k.split('\u0001');
    const rev = pairs.get(`${b}\u0001${a}`);
    if (!rev) continue;
    for (const x of list) {
      const other = rev[0];
      const an = bare(x.unit, x.a.call.args[0]), bn = bare(x.unit, x.b.call.args[0]);
      api.report(x.node, M2(`'${fnLabel(x.fn)}' locks '${bn}' while holding '${an}', but '${fnLabel(other.fn)}' takes them in the opposite order; this can deadlock.`, `'${fnLabel(x.fn)}' 는 '${an}' 를 잡은 채 '${bn}' 를 잠그지만 '${fnLabel(other.fn)}' 는 반대 순서로 잠급니다. 교착 상태가 될 수 있습니다.`));
    }
  }
  if (!paramLocks.length) return;
  const byFn = new Map();
  for (const p of paramLocks) if (!byFn.has(p.fn)) byFn.set(p.fn, p);
  const sites = new Map();
  for (const unit of project.units) {
    for (const c of U.nodes(unit, 'CallExpr')) {
      const d = U.calleeDef(c, project);
      if (d && byFn.has(d)) { if (!sites.has(d)) sites.set(d, []); sites.get(d).push({ c, unit }); }
    }
  }
  for (const [fn, p] of byFn) {
    const seen = new Map();
    for (const { c, unit } of sites.get(fn) || []) {
      const x = gkey(unit, c.args[p.i]), y = gkey(unit, c.args[p.j]);
      if (!x || !y || x === y) continue;
      seen.set(`${x}\u0001${y}`, c);
      const r = seen.get(`${y}\u0001${x}`);
      if (r) {
        api.report(c, M2(`'${fnLabel(fn)}' locks its arguments in parameter order; this call swaps them relative to the call at line ${r.loc.line}, so the two can deadlock.`, `'${fnLabel(fn)}' 는 인수를 매개변수 순서대로 잠급니다. 이 호출은 ${r.loc.line} 행의 호출과 인수 순서가 반대라 교착 상태가 될 수 있습니다.`));
        break;
      }
    }
  }
}

// CON31-C / POS48-C: a mutex destroyed while locked or while threads may still use it.
function destroyLocked(unit, api, which) {
  const A = API[which];
  const project = api.project;
  const inf = info(project);
  const reach = reachMap(project, 'threads', which);
  for (const fn of U.functions(unit)) {
    const destroys = callsIn(fn.body, A.destroy, project);
    if (!destroys.length) continue;
    for (const d of destroys) {
      const key = gkey(unit, d.args[0]);
      if (!key) continue;
      const mname = U.src(unit, d.args[0]);
      if (heldAt(unit, fn, d.node, project).includes(key)) {
        api.report(d.node, M2(`${A.destroy}(${mname}) destroys a mutex that is still locked on this path.`, `${A.destroy}(${mname}) 가 이 경로에서 아직 잠긴 뮤텍스를 파괴합니다.`));
        continue;
      }
      // threads created here whose routines lock the mutex, not joined before the destroy
      for (const t of inf.threads) {
        if (t.unit !== unit || t.api !== which || !t.fn || !encloses(fn.body, t.call.node) || t.call.loc.start > d.loc.start) continue;
        let uses = false;
        for (const [f, roots] of reach) {
          if (!roots.some((r) => r.fn === t.fn)) continue;
          const fu = unitOf(project, f) || unit;
          if (lockEvents(fu, f, project).some((e) => e.key === key)) { uses = true; break; }
        }
        if (!uses) continue;
        const joins = callsIn(fn.body, A.join, project).filter((c) => c.loc.start > t.call.loc.end && c.loc.start < d.loc.start);
        if (joins.length) continue;
        api.report(d.node, M2(`${A.destroy}(${mname}) runs while the thread started at line ${t.call.loc.line} ('${fnLabel(t.fn)}') may still be using the mutex; join the thread first.`, `${t.call.loc.line} 행에서 시작한 스레드('${fnLabel(t.fn)}') 가 아직 뮤텍스를 쓰는 중일 수 있는데 ${A.destroy}(${mname}) 를 호출합니다. 먼저 스레드를 조인하세요.`));
        break;
      }
    }
  }
}

// CON32-C / POS49-C: different bit-fields of one struct written by thread routines.
function bitfieldRace(project, api, which) {
  const reach = reachMap(project, 'threads', which);
  const byRec = new Map(); // record type -> Map(member -> [{ node, fn }])
  for (const [fn] of reach) {
    const unit = unitOf(project, fn);
    if (!unit) continue;
    for (const m of cf.findAll(fn.body, 'MemberExpr')) {
      if (!m.bitField || !isWrite(m)) continue;
      if (heldAt(unit, fn, m, project).length) continue;
      let t = m.object && m.object.ctype ? U.canon(m.object.ctype) : null;
      if (t && m.arrow && t.kind === 'pointer') t = T.canonical(t.to);
      if (!t || t.kind !== 'record') continue;
      const rk = t.decl || t;
      if (!byRec.has(rk)) byRec.set(rk, { t, members: new Map() });
      const r = byRec.get(rk);
      if (!r.members.has(m.member)) r.members.set(m.member, []);
      r.members.get(m.member).push({ node: m, fn, unit });
    }
  }
  for (const { t, members } of byRec.values()) {
    if (members.size < 2) continue;
    const names = [...members.keys()];
    for (const [name, list] of members) {
      const others = names.filter((n) => n !== name).join("', '");
      for (const w of list) {
        api.report(w.node, M2(`Bit-field '${name}' of '${t.name || 'struct'}' is written by a thread without a lock while '${others}' (same storage unit) is written by thread code too.`, `'${t.name || 'struct'}' 의 비트 필드 '${name}' 를 스레드가 잠금 없이 쓰는데, 같은 저장 단위의 '${others}' 도 스레드 코드가 씁니다.`));
      }
    }
  }
}

module.exports = {
  castCallName, calls, callsIn, allLibCallsIn, isLibP, argOf, gkey, rootSym, typedefNames,
  isAtomicType, isAtomicSym, isVolatileSigAtomic, isConstType, signalName, SIGNAL_NUM,
  info, reachMap, unitOf, LOCK, UNLOCK, lockEvents, heldAt, encloses, exclusive,
  isErrno, errnoUses, isWrite, lvalueTop, fnLabel, bare,
  API, autoArgToThread, lockOrder, destroyLocked, bitfieldRace,
};
