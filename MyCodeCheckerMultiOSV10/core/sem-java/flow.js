'use strict';

// Local-variable data flow on the CFG: liveness (dead stores), unused locals,
// Kotlin `var` that is never reassigned.

const A = require('./ast');

const DEFAULT_INIT = (e) => {
  e = A.strip(e);
  if (!e) return true;
  if (e.k === 'Lit') {
    if (e.t === 'null' || e.t === 'bool') return true;
    if (e.t === 'str') return e.v === '';
    if (e.t === 'char') return e.v === '\0' || e.v === ' ';
    return e.v === 0 || e.v === 1 || e.v === -1;
  }
  if (e.k === 'Un' && e.op === '-' && A.isNumLit(e.e)) return A.strip(e.e).v === 1;
  return false;
};

// Names referenced inside lambdas / anonymous or local classes / local funs.
function capturedNames(method) {
  const out = new Set();
  if (!method.body) return out;
  A.forEach(method.body, (n) => {
    if (n.k === 'Lambda' || n.k === 'LocalClass' || n.k === 'LocalFun' || (n.k === 'New' && n.body) || n.k === 'MRef') {
      A.forEach(n, (x) => { if (x.k === 'Name') out.add(x.id); });
      if (n.k === 'Lambda' && n.kt && n.implicitIt) out.add('it');
      return n.k === 'New';
    }
    if (n.k === 'Tmpl') {
      for (const p of n.parts) if (p && typeof p === 'object') A.forEach(p, (x) => { if (x.k === 'Name') out.add(x.id); });
    }
    return true;
  });
  return out;
}

// Names assigned inside lambdas / local functions / anonymous classes.
function assignedInClosures(method) {
  const out = new Set();
  if (!method.body) return out;
  A.forEach(method.body, (n) => {
    if (n.k === 'Lambda' || n.k === 'LocalClass' || n.k === 'LocalFun' || (n.k === 'New' && n.body)) {
      A.forEach(n, (x) => {
        if (x.k === 'Assign') { const t = A.strip(x.t); if (t && t.k === 'Name') out.add(t.id); }
        if (x.k === 'Un' && (x.op === '++' || x.op === '--')) { const t = A.strip(x.e); if (t && t.k === 'Name') out.add(t.id); }
      });
      return false;
    }
    return true;
  });
  return out;
}

// Reads/defs of local names in one expression, in evaluation order.
function usesDefs(e, locals, uses, defs, evs) {
  if (!e) return;
  const use = (name) => { uses.add(name); if (evs) evs.push({ u: name }); };
  const def = (d) => { defs.push(d); if (evs) evs.push({ d }); };
  const visit = (x) => {
    x = x && x.k === 'Paren' ? x : x;
    if (!x || typeof x !== 'object') return;
    switch (x.k) {
      case 'Name':
        if (locals.has(x.id)) use(x.id);
        return;
      case 'Assign': {
        const t = A.strip(x.t);
        if (t && t.k === 'Name' && locals.has(t.id)) {
          if (x.op !== '=') use(t.id);
          visit(x.v);
          def({ name: t.id, node: x, init: x.v, op: x.op });
          return;
        }
        visit(x.t);
        visit(x.v);
        return;
      }
      case 'Un':
        if (x.op === '++' || x.op === '--') {
          const t = A.strip(x.e);
          if (t && t.k === 'Name' && locals.has(t.id)) { use(t.id); def({ name: t.id, node: x, inc: true }); return; }
        }
        visit(x.e);
        return;
      case 'Lambda':
      case 'Class':
        return;
      case 'New':
        for (const a of x.args || []) visit(a);
        for (const d of x.dims || []) visit(d);
        if (x.init) visit(x.init);
        return;
      case 'Tmpl':
        for (const p of x.parts) if (p && typeof p === 'object') visit(p);
        return;
      default:
        A.eachChild(x, (c) => visit(c));
    }
  };
  visit(e);
}

function nodeUD(n, locals) {
  if (n._ud) return n._ud;
  const uses = new Set();
  const defs = [];
  const evs = [];
  switch (n.k) {
    case 'eval':
    case 'branch':
    case 'return':
    case 'throw':
    case 'switch':
      usesDefs(n.e, locals, uses, defs, evs);
      break;
    case 'local':
      if (n.init) usesDefs(n.init, locals, uses, defs, evs);
      for (const v of n.vars) {
        if (v.init) usesDefs(v.init, locals, uses, defs, evs);
        if (locals.has(v.name) && v.init) { const d = { name: v.name, node: v, init: v.init, decl: true, twr: !!n.twr }; defs.push(d); evs.push({ d }); }
      }
      break;
    case 'foreach':
      for (const v of n.vars) if (locals.has(v.name)) { const d = { name: v.name, node: v, loopVar: true }; defs.push(d); evs.push({ d }); }
      break;
    case 'case':
      if (n.guard) usesDefs(n.guard, locals, uses, defs, evs);
      break;
    default: break;
  }
  n._ud = { uses, defs, evs };
  return n._ud;
}

function liveness(cfg, locals) {
  const N = cfg.nodes.length;
  const liveIn = new Array(N);
  const liveOut = new Array(N);
  for (let i = 0; i < N; i++) { liveIn[i] = new Set(); liveOut[i] = new Set(); }
  const work = cfg.nodes.filter((n) => n.reach).slice().reverse();
  const inWork = new Uint8Array(N);
  for (const n of work) inWork[n.id] = 1;
  let guard = 0;
  while (work.length && guard++ < 200000) {
    const n = work.pop();
    inWork[n.id] = 0;
    const out = new Set();
    for (const s of n.succ) if (s) for (const v of liveIn[s.id]) out.add(v);
    const { evs } = nodeUD(n, locals);
    const inn = new Set(out);
    for (let i = evs.length - 1; i >= 0; i--) {
      const ev = evs[i];
      if (ev.d) { if (!ev.d.inc) inn.delete(ev.d.name); } else inn.add(ev.u);
    }
    if (n.esucc) for (const s of n.esucc) for (const v of liveIn[s.id]) inn.add(v);
    liveOut[n.id] = out;
    if (inn.size !== liveIn[n.id].size || [...inn].some((v) => !liveIn[n.id].has(v))) {
      liveIn[n.id] = inn;
      for (const p of n.pred) if (!inWork[p.id]) { inWork[p.id] = 1; work.push(p); }
    }
  }
  return { liveIn, liveOut };
}

// Dead stores: a value written to a local and never read afterwards.
function deadStores(method, cfg, env, report) {
  if (!method.body) return;
  const locals = new Set();
  for (const [name, l] of env.locals) if (l.kind === 'local' || l.kind === 'param') locals.add(name);
  const captured = capturedNames(method);
  for (const c of captured) locals.delete(c);
  if (!locals.size) return;
  // read anywhere?
  const readAnywhere = new Set();
  A.forEach(method.body, (x) => {
    if (x.k === 'Name') readAnywhere.add(x.id);
    if (x.k === 'Tmpl') for (const p of x.parts) if (p && typeof p === 'object') A.forEach(p, (y) => { if (y.k === 'Name') readAnywhere.add(y.id); });
    return true;
  });
  const { liveOut } = liveness(cfg, locals);
  const seen = new Set();
  for (const n of cfg.nodes) {
    if (!n.reach) continue;
    const { defs, evs } = nodeUD(n, locals);
    if (!defs.length) continue;
    for (let i = 0; i < evs.length; i++) {
      const d = evs[i].d;
      if (!d) continue;
      if (d.inc || d.loopVar || d.twr) continue;
      // read later in the same node, or overwritten in it?
      let later = null;
      for (let j = i + 1; j < evs.length; j++) {
        if (evs[j].u === d.name) { later = 'use'; break; }
        if (evs[j].d && evs[j].d.name === d.name) { later = 'def'; break; }
      }
      if (later === 'use') continue;
      if (liveOut[n.id].has(d.name)) continue;
      if (!usedAsRead(method, d.name)) continue;
      if (d.decl && DEFAULT_INIT(d.init)) continue;
      if (d.op && d.op !== '=' ) continue;
      const key = d.node.line + ':' + d.name;
      if (seen.has(key)) continue;
      seen.add(key);
      report(d.node, d.name);
    }
  }
  void readAnywhere;
}

const readCache = new WeakMap();
function usedAsRead(method, name) {
  let m = readCache.get(method);
  if (!m) {
    m = new Set();
    const visit = (x) => {
      if (!x || typeof x !== 'object') return;
      if (x.k === 'Assign') {
        const t = A.strip(x.t);
        if (!(t && t.k === 'Name')) visit(x.t);
        else if (x.op !== '=') m.add(t.id);
        visit(x.v);
        return;
      }
      if (x.k === 'Name') { m.add(x.id); return; }
      if (x.k === 'Tmpl') { for (const p of x.parts) if (p && typeof p === 'object') visit(p); return; }
      A.eachChild(x, visit);
    };
    if (method.body) visit(method.body);
    readCache.set(method, m);
  }
  return m.has(name);
}

module.exports = { deadStores, capturedNames, assignedInClosures, usedAsRead, DEFAULT_INIT, liveness };
