'use strict';

// Data-flow over the per-function CFG: reachability, liveness (dead stores)
// and a forward constant propagation used for always-true / always-false
// conditions.

const { unparen, contains } = require('./ast');
const { tracked } = require('./cfg');

function reachable(cfg) {
  const seen = new Set();
  const stack = [cfg.entry];
  while (stack.length) {
    const b = stack.pop();
    if (seen.has(b)) continue;
    seen.add(b);
    for (const s of b.succ) stack.push(s);
  }
  return seen;
}

// ── liveness / dead stores
function isDefaultValue(v) {
  v = unparen(v);
  if (!v) return true;
  if (v.k === 'Lit') {
    if (v.kind === 'null' || v.kind === 'bool') return true;
    if (v.kind === 'int' && (v.value === 0 || v.value === 1)) return true;
    if (v.kind === 'float' && v.value === 0) return true;
    if (v.kind === 'str' && (v.value === '' || v.value === '0')) return true;
  }
  if (v.k === 'Unary' && v.op === '-' && unparen(v.e).k === 'Lit' && unparen(v.e).value === 1) return true;
  if ((v.k === 'Arr') && v.items.length === 0) return true;
  return false;
}

function deadStores(cfg, report) {
  const reach = reachable(cfg);
  const liveIn = new Map();
  for (const b of cfg.blocks) liveIn.set(b, new Set());
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    for (let i = cfg.blocks.length - 1; i >= 0; i--) {
      const b = cfg.blocks[i];
      const live = new Set();
      for (const s of b.succ) for (const x of liveIn.get(s)) live.add(x);
      for (let k = b.items.length - 1; k >= 0; k--) {
        const it = b.items[k];
        if (it.t === 'use') live.add(it.sym);
        else if (it.t === 'def' && !it.weak) live.delete(it.sym);
      }
      const old = liveIn.get(b);
      if (old.size !== live.size || [...live].some((x) => !old.has(x))) { liveIn.set(b, live); changed = true; }
    }
  }
  for (const b of cfg.blocks) {
    if (!reach.has(b)) continue;
    const live = new Set();
    for (const s of b.succ) for (const x of liveIn.get(s)) live.add(x);
    for (let k = b.items.length - 1; k >= 0; k--) {
      const it = b.items[k];
      if (it.t === 'use') live.add(it.sym);
      else if (it.t === 'def') {
        if (!it.weak && !it.nodead && !live.has(it.sym) && tracked(it.sym)) {
          if (!(it.value && isDefaultValue(it.value)) || it.compound) report(it);
        }
        if (!it.weak) live.delete(it.sym);
      }
    }
  }
}

// ── constant propagation
// values: { t: 'int'|'float'|'str'|'bool'|'null', v }
function litConst(e) {
  if (e.kind === 'int' || e.kind === 'float' || e.kind === 'str' || e.kind === 'bool' || e.kind === 'null') return { t: e.kind, v: e.value };
  return undefined;
}

function truthy(c) {
  if (c.t === 'null') return false;
  if (c.t === 'bool') return c.v;
  if (c.t === 'int' || c.t === 'float') return c.v !== 0;
  if (c.t === 'str') return c.v !== '' && c.v !== '0';
  return undefined;
}

const B = (v) => ({ t: 'bool', v });

function evalConst(e, state) {
  e = unparen(e);
  if (!e) return undefined;
  switch (e.k) {
    case 'Lit': return litConst(e);
    case 'Var': return tracked(e.sym) ? state.get(e.sym) : undefined;
    case 'Unary': {
      const x = evalConst(e.e, state);
      if (!x) return undefined;
      if (e.op === '!') { const t = truthy(x); return t === undefined ? undefined : B(!t); }
      if (e.op === '-' && (x.t === 'int' || x.t === 'float')) return { t: x.t, v: -x.v };
      return undefined;
    }
    case 'Bin': {
      const op = e.op;
      if (op === '&&' || op === 'and') {
        const l = evalConst(e.l, state);
        if (l && truthy(l) === false) return B(false);
        const r = evalConst(e.r, state);
        if (l && r) return B(truthy(l) && truthy(r));
        return undefined;
      }
      if (op === '||' || op === 'or') {
        const l = evalConst(e.l, state);
        if (l && truthy(l) === true) return B(true);
        const r = evalConst(e.r, state);
        if (l && r) return B(truthy(l) || truthy(r));
        return undefined;
      }
      const l = evalConst(e.l, state);
      const r = evalConst(e.r, state);
      if (!l || !r) return undefined;
      switch (op) {
        case '===': return B(l.t === r.t && l.v === r.v);
        case '!==': return B(!(l.t === r.t && l.v === r.v));
        case '==': case '!=': case '<>': {
          let eq;
          if (l.t === r.t) eq = l.v === r.v;
          else if ((l.t === 'int' || l.t === 'float') && (r.t === 'int' || r.t === 'float')) eq = l.v === r.v;
          else if (l.t === 'null' && (r.t === 'bool' || r.t === 'null')) eq = truthy(r) === false;
          else if (r.t === 'null' && l.t === 'bool') eq = truthy(l) === false;
          else return undefined;
          return B(op === '==' ? eq : !eq);
        }
        case '<': case '<=': case '>': case '>=': {
          const num = (c) => (c.t === 'int' || c.t === 'float');
          if (!num(l) || !num(r)) return undefined;
          return B(op === '<' ? l.v < r.v : op === '<=' ? l.v <= r.v : op === '>' ? l.v > r.v : l.v >= r.v);
        }
        default: return undefined;
      }
    }
    case 'Call': {
      const name = e.callee && e.callee.k === 'Name' ? e.callee.name.toLowerCase().replace(/^\\/, '') : '';
      if (name === 'is_null' && e.args.length === 1) { const x = evalConst(e.args[0].e, state); return x ? B(x.t === 'null') : undefined; }
      return undefined;
    }
    case 'Empty': { const x = evalConst(e.e, state); if (!x) return undefined; const t = truthy(x); return t === undefined ? undefined : B(!t); }
    default: return undefined;
  }
}

function joinInto(dst, src) {
  // dst: Map | null ; returns [newMap, changed]
  if (!dst) return [new Map(src), true];
  let changed = false;
  for (const [k, v] of dst) {
    const o = src.get(k);
    if (!o || o.t !== v.t || o.v !== v.v) { dst.delete(k); changed = true; }
  }
  return [dst, changed];
}

function transfer(b, state, onCond) {
  for (const it of b.items) {
    if (it.t === 'def') {
      if (it.weak || !it.value) state.delete(it.sym);
      else {
        const c = evalConst(it.value, state);
        if (c) state.set(it.sym, c); else state.delete(it.sym);
      }
    } else if (it.t === 'kill') state.delete(it.sym);
    else if (it.t === 'cond' && onCond) onCond(it, state);
  }
}

function constantConditions(cfg, report) {
  const inState = new Map();
  inState.set(cfg.entry, new Map());
  const work = [cfg.entry];
  let guard = 0;
  while (work.length && guard++ < 20000) {
    const b = work.shift();
    const st = new Map(inState.get(b));
    transfer(b, st, null);
    for (const s of b.succ) {
      const [m, changed] = joinInto(inState.get(s) || null, st);
      if (changed || !inState.has(s)) { inState.set(s, m); if (!work.includes(s)) work.push(s); }
    }
  }
  const found = [];
  for (const b of cfg.blocks) {
    const st0 = inState.get(b);
    if (!st0) continue;
    const st = new Map(st0);
    transfer(b, st, (it, state) => {
      const node = unparen(it.node);
      if (!node || node.k === 'Lit') return;
      const usesKnown = contains(node, (x) => x.k === 'Var' && tracked(x.sym) && state.has(x.sym));
      if (!usesKnown) return;
      const c = evalConst(node, state);
      if (!c) return;
      const t = truthy(c);
      if (t === undefined) return;
      found.push({ node: it.node, kind: it.kind, value: t, parent: it.parent });
    });
  }
  // drop operands whose enclosing condition is reported already
  const reported = new Set(found.map((f) => unparen(f.node)));
  const seen = new Set();
  for (const f of found) {
    const n = unparen(f.node);
    if (seen.has(n)) continue;
    seen.add(n);
    let covered = false;
    for (let p = n.parent; p; p = p.parent) {
      if (reported.has(p)) { covered = true; break; }
      if (p.k !== 'Bin' && p.k !== 'Paren' && p.k !== 'Unary') break;
    }
    if (!covered) report(f);
  }
}

module.exports = { reachable, deadStores, constantConditions, evalConst, truthy, isDefaultValue };
