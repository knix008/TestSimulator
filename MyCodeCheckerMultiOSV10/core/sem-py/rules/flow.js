'use strict';

// CFG-driven rules: unreachable code, dead stores, use before assignment,
// None dereference, conditions always true/false, inconsistent returns,
// parameters overwritten before use, infinite recursion.

const { define } = require('./def');
const { buildCFG, reachable, TERMINATING_CALLS } = require('../cfg');
const { deadStores, unassignedUses, unreachableStatements, effects } = require('../flow');
const { SymExec } = require('../symbolic');
const { FUNC_TYPES, walkLocal, dotted, short, isNone, numValue } = require('../ast');

const RULES = [];
const R = define(RULES);

R('unreachable-code', 'B', 'MA', 5, ['cwe-561', 'unused'], 'S1763',
  ['Unreachable code', '도달할 수 없는 코드'],
  ['Statements after return, raise, break, continue, sys.exit() or an endless loop never run. They are dead weight or hide a logic error.', 'return, raise, break, continue, sys.exit() 또는 끝나지 않는 반복 뒤의 문장은 실행되지 않습니다. 쓸모없거나 논리 오류를 숨깁니다.'],
  ['Remove the dead statements or fix the jump that makes them unreachable.', '죽은 문장을 지우거나 도달하지 못하게 만드는 이동문을 고치세요.'],
  { flow: true, module: null });

R('dead-store', 'S', 'MA', 15, ['cwe-563', 'unused'], 'S1854',
  ['Useless assignment to a local variable', '지역 변수에 쓸모없는 대입'],
  ['The value assigned is overwritten or never read on any path, so the computation is wasted or a later read uses the wrong variable.', '대입한 값이 어떤 경로에서도 읽히지 않거나 덮어써집니다. 계산이 낭비되거나 나중에 엉뚱한 변수를 읽고 있을 수 있습니다.'],
  ['Remove the assignment or use the value.', '대입을 지우거나 값을 사용하세요.'],
  { flow: true });

R('use-before-assignment', 'B', 'CR', 10, ['cwe-457', 'pitfall'], 'S3827',
  ['Local variable used before it is assigned', '지역 변수를 대입하기 전에 사용합니다'],
  ['On every path that reaches this read the local variable has no value yet (or was deleted), so Python raises UnboundLocalError / NameError.', '이 읽기에 도달하는 모든 경로에서 지역 변수에 아직 값이 없거나 삭제되어 UnboundLocalError / NameError가 납니다.'],
  ['Assign the variable before reading it, or declare it global/nonlocal if the outer variable is meant.', '읽기 전에 변수를 대입하거나, 바깥 변수를 뜻했다면 global/nonlocal로 선언하세요.'],
  { flow: true });

R('none-dereference', 'B', 'MA', 10, ['cwe-476', 'symbolic-execution'], 'S2259',
  ['Attribute access, subscript or call on None', 'None에 대해 속성 접근, 첨자 또는 호출을 합니다'],
  ['On a feasible path the variable is None (assigned None or checked against None) and is then dereferenced, raising AttributeError or TypeError.', '실행 가능한 경로에서 변수가 None인데(None 대입 또는 None 확인) 역참조되어 AttributeError나 TypeError가 납니다.'],
  ['Check the variable for None before using it, or make sure it is assigned a real object on every path.', '사용하기 전에 None인지 확인하거나 모든 경로에서 실제 객체를 대입하세요.'],
  { flow: true });

R('condition-always-true', 'B', 'MA', 10, ['cwe-571', 'symbolic-execution', 'redundant'], 'S2589',
  ['Condition is always true', '조건이 항상 참입니다'],
  ['Every path that reaches this condition gives it the same value, so the test is gratuitous and the other branch is dead code.', '이 조건에 도달하는 모든 경로에서 값이 같아 검사가 쓸모없고 다른 분기는 죽은 코드입니다.'],
  ['Remove the test or fix the logic that makes it constant.', '검사를 지우거나 값을 고정시키는 논리를 고치세요.'],
  { flow: true });

R('condition-always-false', 'B', 'MA', 10, ['cwe-570', 'symbolic-execution', 'redundant'], 'S2583',
  ['Condition is always false', '조건이 항상 거짓입니다'],
  ['Every path that reaches this condition makes it false, so the guarded code can never run.', '이 조건에 도달하는 모든 경로에서 거짓이라 보호된 코드가 실행될 수 없습니다.'],
  ['Remove the dead branch or fix the logic that makes the condition constant.', '죽은 분기를 지우거나 조건을 고정시키는 논리를 고치세요.'],
  { flow: true });

R('inconsistent-return', 'S', 'MA', 10, ['confusing'], 'S3801',
  ['Function mixes return values and implicit None', '함수가 값 반환과 암묵적 None을 섞습니다'],
  ['Some paths return a value while others fall off the end or use a bare return, so callers silently get None.', '어떤 경로는 값을 반환하고 다른 경로는 끝으로 빠지거나 값 없는 return을 써서 호출자가 모르게 None을 받습니다.'],
  ['Return a value (or an explicit None) on every path.', '모든 경로에서 값(또는 명시적 None)을 반환하세요.'],
  { flow: true });

R('parameter-reassigned', 'S', 'MI', 5, ['pitfall'], 'S1226',
  ['Parameter is overwritten before it is read', '매개변수를 읽기 전에 덮어씁니다'],
  ['The argument passed by the caller is ignored because the parameter is reassigned before any read.', '매개변수를 읽기 전에 다시 대입해 호출자가 넘긴 인자가 무시됩니다.'],
  ['Use a new local variable, or read the parameter first.', '새 지역 변수를 쓰거나 매개변수를 먼저 읽으세요.'],
  { flow: true });

R('infinite-recursion', 'B', 'BL', 30, ['cwe-674'], 'S2190',
  ['Function recurses on every path', '함수가 모든 경로에서 자신을 호출합니다'],
  ['No path through the function returns or raises without calling the function itself again, so it ends in RecursionError.', '자신을 다시 호출하지 않고 반환하거나 예외를 던지는 경로가 없어 RecursionError로 끝납니다.'],
  ['Add a base case that returns without recursing.', '재귀하지 않고 반환하는 기저 조건을 추가하세요.'],
  { flow: true });

const byId = new Map(RULES.map((r) => [r.id, r]));

const DEFAULTISH = (e) => {
  if (!e) return true;
  if (e.type === 'Constant') return e.kind === 'None' || e.kind === 'bool' || (e.kind === 'str' && e.value.length === 0) || ((e.kind === 'int' || e.kind === 'float') && Math.abs(e.value) <= 1);
  if (e.type === 'UnaryOp' && e.op === 'USub') { const v = numValue(e); return v != null && Math.abs(v) <= 1; }
  if ((e.type === 'List' || e.type === 'Tuple' || e.type === 'Set') && e.elts.length === 0) return true;
  if (e.type === 'Dict' && e.keys.length === 0) return true;
  if (e.type === 'Call' && e.func.type === 'Name' && /^(?:list|dict|set|tuple|str|int|float|bool|object|frozenset|bytes|bytearray|deque|OrderedDict|defaultdict|Counter)$/.test(e.func.id) && e.args.length <= 1 && !e.keywords.length) return true;
  if (e.type === 'Constant' && e.kind === 'Ellipsis') return true;
  return false;
};

function catchesFor(kind) {
  const names = kind === 'attribute' || kind === 'with' ? ['AttributeError'] : ['TypeError'];
  return (node) => {
    let child = node;
    let p = node.parent;
    while (p && !FUNC_TYPES.has(p.type) && p.type !== 'Lambda') {
      if ((p.type === 'Try' || p.type === 'TryStar') && p.body.includes(child)) {
        for (const h of p.handlers) {
          if (!h.etype) return true;
          const ts = h.etype.type === 'Tuple' ? h.etype.elts : [h.etype];
          for (const t of ts) {
            const d = dotted(t) || '';
            const last = d.split('.').pop();
            if (last === 'Exception' || last === 'BaseException' || names.includes(last)) return true;
          }
        }
      }
      child = p;
      p = p.parent;
    }
    return false;
  };
}

function noReturnChecker(c) {
  return (call) => {
    const t = c.type(call.func);
    if (t && t.k === 'func' && t.fn && t.fn.node.returns) {
      const d = dotted(t.fn.node.returns) || '';
      if (/(?:^|\.)(?:NoReturn|Never)$/.test(d)) return true;
    }
    return false;
  };
}

function runFlow(c, rules, stats, options) {
  const active = new Set(rules.map((r) => r.id));
  const isNoReturn = noReturnChecker(c);
  const fns = c.mod.allNodes.filter((n) => FUNC_TYPES.has(n.type));
  const deadline = Date.now() + (options.flowMsPerFile || 4000);
  // module level: unreachable code only
  if (active.has('unreachable-code') && !c.mod.parsed.errors.length) {
    try {
      const cfg = buildCFG(c.mod.module, { isNoReturn });
      const reach = reachable(cfg);
      reportUnreachable(c, c.mod.module, cfg, reach);
    } catch (err) { if (options.debug) throw err; }
  }
  for (const fn of fns) {
    if (fn.hasError || hasTokenError(c, fn)) continue;
    if (Date.now() > deadline) { stats.aborted++; continue; }
    stats.functions++;
    try {
      flowFunction(c, fn, active, isNoReturn, stats);
    } catch (err) {
      if (options.debug) throw err;
    }
  }
}

function hasTokenError(c, fn) {
  if (!c.errorLines.size) return false;
  for (const l of c.errorLines) if (l >= fn.line && l <= fn.endLine) return true;
  return false;
}

function reportUnreachable(c, fnNode, cfg, reach) {
  const r = byId.get('unreachable-code');
  for (const { stmt, after } of unreachableStatements(fnNode, cfg, reach)) {
    if (stmt.type === 'Expr' && (stmt.value.type === 'Yield' || stmt.value.type === 'YieldFrom')) continue;
    if (stmt.type === 'Return' && after && after.type === 'Raise' && !stmt.value) continue;
    if (stmt.type === 'Pass') continue;
    const events = after ? [{ line: after.line, tag: 'path', text: { en: `control never passes '${short(c.slice(after), 30)}'`, ko: `'${short(c.slice(after), 30)}' 다음으로 진행하지 않습니다` }, main: false }] : undefined;
    c.report(r, stmt, 'Remove this unreachable code.', '이 도달할 수 없는 코드를 지우세요.', events ? { events } : undefined);
  }
}

function flowFunction(c, fn, active, isNoReturn, stats) {
  const scope = fn.scope;
  if (!scope) return;
  const cfg = buildCFG(fn, { isNoReturn });
  const reach = reachable(cfg);
  if (active.has('unreachable-code')) reportUnreachable(c, fn, cfg, reach);
  const local = (sym) => sym && sym.scope === scope && !sym.nonlocalAssigned && !sym.globalAssigned && !scope.dynamic;
  const params = [];
  for (const sym of scope.symbols.values()) if (sym.isParam) params.push(sym);

  // dead stores / parameter overwritten
  if (active.has('dead-store') || active.has('parameter-reassigned')) {
    const trackedDS = (sym) => local(sym) && !sym.captured;
    const dead = deadStores(cfg, trackedDS, reach);
    const deadParams = new Set();
    if (active.has('dead-store')) {
      const seen = new Set();
      for (const { def, el } of dead) {
        if (el.kind !== 'stmt') continue;
        const st = el.node;
        if (!(st.type === 'Assign' || st.type === 'AugAssign' || st.type === 'AnnAssign')) continue;
        if (st.type === 'Assign' && (st.targets.length !== 1 || st.targets[0] !== def.node)) continue;
        if (st.type !== 'Assign' && st.target !== def.node) continue;
        const name = def.id;
        if (!name || name.startsWith('_') || name === '__all__') continue;
        if (!def.sym.uses.length) continue; // unused-variable territory
        if (st.type !== 'AugAssign' && DEFAULTISH(st.value)) continue;
        if (seen.has(def.node)) continue;
        seen.add(def.node);
        c.report(byId.get('dead-store'), def.node, `Remove this useless assignment to local variable '${name}'.`, `지역 변수 '${name}'에 대한 쓸모없는 대입을 지우세요.`);
      }
    }
    if (active.has('parameter-reassigned')) {
      // a parameter that is not live at entry but is read somewhere
      const liveAtEntry = new Set();
      const visit = new Set();
      // recompute: entry live set = params read before any write on some path
      const stack = [cfg.entry];
      const firstEvent = new Map();
      // per block, first event per parameter (use or def) in order
      const blockFirst = (b) => {
        if (b._pf) return b._pf;
        const m = new Map();
        const consider = (fx) => {
          for (const u of [...fx.uses, ...fx.deferred]) if (u.sym && u.sym.isParam && !m.has(u.sym)) m.set(u.sym, 'use');
          for (const d of fx.defs) if (d.sym && d.sym.isParam && !m.has(d.sym)) m.set(d.sym, { def: d });
        };
        for (const el of b.elems) consider(effects(el));
        if (b.cond) {
          const { condEffects } = require('../flow');
          const fx = condEffects(b.cond);
          if (fx) consider(fx);
        }
        b._pf = m;
        return m;
      };
      for (const p of params) {
        if (!trackedDS(p) || p.name === 'self' || p.name === 'cls' || p.name.startsWith('_') || p.bindings.length < 2 || !p.uses.length) continue;
        // BFS: is there a path from entry to a use without a def first?
        let readFirst = false;
        let firstDef = null;
        const seenB = new Set([cfg.entry]);
        const q = [cfg.entry];
        while (q.length && !readFirst) {
          const b = q.shift();
          const ev = blockFirst(b).get(p);
          if (ev === 'use') { readFirst = true; break; }
          if (ev && ev.def) { if (!firstDef) firstDef = ev.def; continue; }
          for (const e of b.succ) if (!seenB.has(e.to)) { seenB.add(e.to); q.push(e.to); }
        }
        if (!readFirst && firstDef && firstDef.node && firstDef.node.line) {
          deadParams.add(p);
          c.report(byId.get('parameter-reassigned'), firstDef.node, `Parameter '${p.name}' is overwritten before it is read; the caller's argument is ignored.`, `매개변수 '${p.name}'를 읽기 전에 덮어써서 호출자의 인자가 무시됩니다.`);
        }
      }
      void liveAtEntry; void visit; void stack; void firstEvent;
    }
  }

  // use before assignment
  if (active.has('use-before-assignment')) {
    const tracked = (sym) => local(sym) && sym.bindings.some((b) => b.kind !== 'param');
    const found = unassignedUses(cfg, tracked, params, reach);
    const seen = new Set();
    for (const u of found) {
      if (!u.node || !u.node.line || seen.has(u.node)) continue;
      seen.add(u.node);
      const outer = hasOuterBinding(u.sym);
      c.report(byId.get('use-before-assignment'), u.node,
        outer ? `Local variable '${u.id}' is read before assignment; the assignment later in '${fn.name}' makes it local, so this raises UnboundLocalError.` : `Local variable '${u.id}' is read before it is assigned.`,
        outer ? `지역 변수 '${u.id}'를 대입하기 전에 읽습니다. '${fn.name}' 뒤쪽의 대입 때문에 지역 변수가 되어 UnboundLocalError가 납니다.` : `지역 변수 '${u.id}'를 대입하기 전에 읽습니다.`);
    }
  }

  // symbolic execution
  if (active.has('none-dereference') || active.has('condition-always-true') || active.has('condition-always-false')) {
    const tracked = (sym) => local(sym);
    const catches = (node, kind) => catchesFor(kind)(node);
    const se = new SymExec(fn, cfg, { tracked, project: c.project, catches });
    const res = se.run();
    if (res.aborted) stats.aborted++;
    if (active.has('none-dereference')) {
      for (const d of res.derefs) {
        const what = d.kind === 'attribute' ? `accessing '${d.node.attr}'` : d.kind === 'subscript' ? 'subscripting it' : d.kind === 'call' ? 'calling it' : d.kind === 'with' ? 'using it as a context manager' : 'iterating over it';
        const whatKo = d.kind === 'attribute' ? `'${d.node.attr}'에 접근하면` : d.kind === 'subscript' ? '첨자로 접근하면' : d.kind === 'call' ? '호출하면' : d.kind === 'with' ? '컨텍스트 관리자로 쓰면' : '반복하면';
        const events = [];
        if (d.src && d.src.line) {
          const checked = d.src.type === 'Compare';
          events.push({ line: d.src.line, tag: checked ? 'path' : 'source', text: checked ? { en: `'${d.name.id}' is checked against None here`, ko: `여기서 '${d.name.id}'를 None과 비교합니다` } : { en: `'${d.name.id}' is assigned None here`, ko: `여기서 '${d.name.id}'에 None을 대입합니다` }, main: false });
        }
        events.push({ line: d.node.line, tag: 'deref', text: { en: `'${d.name.id}' is dereferenced while None`, ko: `None인 '${d.name.id}'를 역참조합니다` }, main: true });
        c.report(byId.get('none-dereference'), d.node, `'${d.name.id}' is None on this path; ${what} raises ${d.kind === 'attribute' || d.kind === 'with' ? 'AttributeError' : 'TypeError'}.`, `이 경로에서 '${d.name.id}'는 None이라 ${whatKo} ${d.kind === 'attribute' || d.kind === 'with' ? 'AttributeError' : 'TypeError'}가 납니다.`, { events });
      }
    }
    for (const r of res.conds) {
      if (r.canT === r.canF) continue;
      if (!r.canT && !r.canF) continue;
      const id = r.canT ? 'condition-always-true' : 'condition-always-false';
      if (!active.has(id)) continue;
      if (!assignedHere(r.sym, r.node)) continue;
      const text = short(c.slice(r.node), 40);
      c.report(byId.get(id), r.node, `Condition '${text}' is always ${r.canT ? 'true' : 'false'} here.`, `조건 '${text}'은 여기서 항상 ${r.canT ? '참' : '거짓'}입니다.`);
    }
  }

  // inconsistent return
  if (active.has('inconsistent-return') && fn.info && !fn.info.isGenerator) {
    const returns = [];
    walkLocal(fn, (n) => { if (n.type === 'Return') returns.push(n); return true; });
    const withValue = returns.filter((r) => r.value && !isNone(r.value));
    if (withValue.length) {
      const bare = returns.filter((r) => !r.value);
      const fallsOff = cfg.fallthrough && reach.has(cfg.fallthrough);
      if (bare.length || fallsOff) {
        const where = bare.length ? bare[0] : fn;
        c.report(byId.get('inconsistent-return'), where,
          `Function '${fn.name}' returns a value on some paths and ${bare.length ? 'uses a bare return' : 'implicitly returns None'} on others.`,
          `함수 '${fn.name}'가 어떤 경로에서는 값을 반환하고 다른 경로에서는 ${bare.length ? '값 없는 return을 씁니다' : '암묵적으로 None을 반환합니다'}.`);
      }
    }
  }

  // infinite recursion
  if (active.has('infinite-recursion')) checkRecursion(c, fn, cfg);
}

// The condition variable got its value from an assignment / check in this
// function (not merely from refinement of an unknown parameter by the same
// expression).
function assignedHere(sym, node) {
  void node;
  return !!sym && sym.bindings.length > 0;
}

function hasOuterBinding(sym) {
  let p = sym.scope.parent;
  while (p) {
    if (p.kind !== 'class' && p.symbols.has(sym.name)) return true;
    p = p.parent;
  }
  return false;
}

function checkRecursion(c, fn, cfg) {
  const info = fn.info;
  if (!info || info.isGenerator) return;
  const isProp = info.kind === 'property';
  const selfName = fn.args.args[0] && fn.args.args[0].arg;
  const recursive = (n) => {
    // calling a coroutine function only creates a coroutine; it recurses when awaited
    if (n.type === 'Call' && info.isAsync && !(n.parent && n.parent.type === 'Await')) return false;
    if (n.type === 'Call') {
      const f = n.func;
      if (!info.cls && f.type === 'Name' && f.id === fn.name && f.sym && f.sym.bindings.length === 1 && f.sym.bindings[0].node === fn) return true;
      if (info.cls && info.kind === 'method' && f.type === 'Attribute' && f.attr === fn.name && f.value.type === 'Name' && f.value.id === selfName && selfName === 'self') return true;
    }
    if (isProp && n.type === 'Attribute' && n.ctx === 'Load' && n.attr === fn.name && n.value.type === 'Name' && n.value.id === selfName && selfName === 'self' && !info.decorators.some((d) => /\.(?:setter|deleter)$/.test(d))) return true;
    return false;
  };
  const blockRecurses = (b) => {
    for (const el of b.elems) {
      let hit = false;
      const roots = el.kind === 'stmt' ? [el.node] : el.kind === 'iter' ? [el.node.iter] : el.kind === 'with' ? el.node.items.map((i) => i.context_expr) : [];
      for (const r of roots) {
        if (FUNC_TYPES.has(r.type) || r.type === 'ClassDef') continue;
        walkLocal(r, (n) => {
          if (hit) return false;
          if (n.type === 'Lambda') return false;
          if (n.type === 'BoolOp' || n.type === 'IfExp') {
            // only the always-evaluated first operand counts
            const first = n.type === 'BoolOp' ? n.values[0] : n.test;
            walkLocal(first, (m) => { if (recursive(m)) hit = true; return !hit; }, true);
            return false;
          }
          if (recursive(n)) { hit = true; return false; }
          return true;
        }, true);
      }
      if (hit) return true;
    }
    if (b.cond && b.cond.kind === 'expr') {
      let hit = false;
      walkLocal(b.cond.node, (n) => { if (n.type === 'BoolOp') { walkLocal(n.values[0], (m) => { if (recursive(m)) hit = true; return !hit; }, true); return false; } if (recursive(n)) hit = true; return !hit; }, true);
      if (hit) return true;
    }
    return false;
  };
  const seen = new Set([cfg.entry]);
  const q = [cfg.entry];
  let terminates = false;
  let any = false;
  while (q.length) {
    const b = q.shift();
    if (b === cfg.exit || b === cfg.raise) { terminates = true; break; }
    if (blockRecurses(b)) { any = true; continue; }
    for (const e of b.succ) {
      if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
    }
  }
  if (!terminates && any) {
    c.report(byId.get('infinite-recursion'), fn, `'${fn.name}' calls itself on every path; add a base case.`, `'${fn.name}'가 모든 경로에서 자신을 호출합니다. 기저 조건을 추가하세요.`);
  }
}

void TERMINATING_CALLS;

module.exports = { RULES, runFlow };
