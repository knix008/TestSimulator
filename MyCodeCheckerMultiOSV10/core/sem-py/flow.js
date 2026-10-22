'use strict';

// Classic data-flow over the CFG: element effects (uses / defs / kills),
// liveness (dead stores), definite assignment (use before assignment) and
// unreachable statements.

const { children, FUNC_TYPES } = require('./ast');
const { reachable } = require('./cfg');

// effects of one element: { uses, deferred, defs, kills } - arrays of
// { id, sym, node }
function effects(el) {
  if (el._fx) return el._fx;
  const fx = { uses: [], deferred: [], defs: [], kills: [], seq: [] };
  const n = el.node;
  switch (el.kind) {
    case 'stmt': stmtEffects(n, fx); break;
    case 'iter': expr(n.iter, fx); break;
    case 'for-target': target(n.target, fx); break;
    case 'with':
      for (const it of n.items) { expr(it.context_expr, fx); if (it.optional_vars) target(it.optional_vars, fx); }
      break;
    case 'except-bind':
      if (n.etype) expr(n.etype, fx);
      if (n.nameNode) D(fx, ref(n.nameNode));
      break;
    case 'except-unbind':
      if (n.nameNode) KL(fx, ref(n.nameNode));
      break;
    case 'match': expr(n.subject, fx); break;
    case 'case-bind': patternDefs(n.pattern, fx); break;
    case 'cond-expr': expr(n, fx); break;
    case 'cond-case': patternUses(n.pattern, fx); break;
    default: break;
  }
  el._fx = fx;
  return fx;
}

function condEffects(cond) {
  if (!cond) return null;
  if (cond._fx) return cond._fx;
  let fx;
  if (cond.kind === 'expr') fx = effects({ kind: 'cond-expr', node: cond.node });
  else if (cond.kind === 'case') fx = effects({ kind: 'cond-case', node: cond.node });
  else fx = { uses: [], deferred: [], defs: [], kills: [], seq: [] };
  cond._fx = fx;
  return fx;
}

function U(fx, r) { fx.uses.push(r); fx.seq.push(['u', r]); }
function D(fx, r) { fx.defs.push(r); fx.seq.push(['d', r]); }
function KL(fx, r) { fx.kills.push(r); fx.seq.push(['k', r]); }

function ref(n) { return { id: n.id || n.bound || n.name, sym: n.sym, node: n }; }

function stmtEffects(s, fx) {
  switch (s.type) {
    case 'Assign':
      expr(s.value, fx);
      for (const t of s.targets) target(t, fx);
      break;
    case 'AugAssign':
      expr(s.value, fx);
      if (s.target.type === 'Name') {
        U(fx, { id: s.target.id, sym: s.target.sym, node: s.target, aug: true });
        D(fx, ref(s.target));
      } else target(s.target, fx, true);
      break;
    case 'AnnAssign':
      if (s.value) {
        expr(s.value, fx);
        target(s.target, fx);
      } else if (s.target.type !== 'Name') target(s.target, fx, true);
      break;
    case 'Import': case 'ImportFrom':
      for (const a of s.names) if (a.bound) D(fx, { id: a.bound, sym: a.sym, node: a });
      break;
    case 'FunctionDef': case 'AsyncFunctionDef':
      for (const d of s.decorator_list) expr(d, fx);
      for (const d of s.args.defaults) expr(d, fx);
      for (const d of s.args.kw_defaults) if (d) expr(d, fx);
      deferredLoads(s.body, fx);
      D(fx, { id: s.name, sym: s.sym, node: s });
      break;
    case 'ClassDef':
      for (const d of s.decorator_list) expr(d, fx);
      for (const d of s.bases) expr(d, fx);
      for (const k of s.keywords) expr(k.value, fx);
      deferredLoads(s.body, fx);
      D(fx, { id: s.name, sym: s.sym, node: s });
      break;
    case 'Delete':
      for (const t of s.targets) {
        if (t.type === 'Name') { U(fx, ref(t)); KL(fx, ref(t)); } else expr(t, fx);
      }
      break;
    case 'TypeAlias':
      deferredLoads([s.value], fx);
      D(fx, ref(s.name));
      break;
    case 'Global': case 'Nonlocal': case 'Pass': case 'Break': case 'Continue': case 'ErrorStmt':
      break;
    default:
      for (const c of children(s)) expr(c, fx);
  }
}

function target(t, fx, augmented) {
  if (!t) return;
  switch (t.type) {
    case 'Name': D(fx, ref(t)); break;
    case 'Tuple': case 'List': for (const e of t.elts) target(e, fx); break;
    case 'Starred': target(t.value, fx); break;
    case 'Attribute': expr(t.value, fx); break;
    case 'Subscript': expr(t.value, fx); expr(t.slice, fx); break;
    default: expr(t, fx);
  }
  if (augmented && t.type === 'Name') U(fx, ref(t));
}

function expr(e, fx) {
  if (!e) return;
  switch (e.type) {
    case 'Name':
      if (e.ctx === 'Store') D(fx, ref(e));
      else if (e.ctx === 'Del') { U(fx, ref(e)); KL(fx, ref(e)); } else U(fx, ref(e));
      return;
    case 'NamedExpr':
      expr(e.value, fx);
      D(fx, ref(e.target));
      return;
    case 'ListComp': case 'SetComp': case 'GeneratorExp': case 'DictComp':
      for (const g of e.generators) { expr(g.iter, fx); target(g.target, fx); for (const c of g.ifs) expr(c, fx); }
      if (e.type === 'DictComp') { expr(e.key, fx); expr(e.value, fx); } else expr(e.elt, fx);
      return;
    case 'Lambda':
      for (const d of e.args.defaults) expr(d, fx);
      for (const d of e.args.kw_defaults) if (d) expr(d, fx);
      deferredLoads([e.body], fx);
      return;
    default:
      for (const c of children(e)) expr(c, fx);
  }
}

function deferredLoads(nodes, fx) {
  const visit = (n) => {
    if (n.type === 'Name' && n.ctx !== 'Store') fx.deferred.push(ref(n));
    for (const c of children(n)) visit(c);
  };
  for (const n of nodes) if (n) visit(n);
}

function patternDefs(p, fx) {
  const visit = (q) => {
    if (!q) return;
    if (q.nameNode) D(fx, ref(q.nameNode));
    if (q.restNode) D(fx, ref(q.restNode));
    for (const c of children(q)) if (/^Match/.test(c.type)) visit(c);
  };
  visit(p);
}

function patternUses(p, fx) {
  const visit = (q) => {
    if (!q) return;
    if (q.type === 'MatchValue') expr(q.value, fx);
    else if (q.type === 'MatchClass') expr(q.cls, fx);
    else if (q.type === 'MatchMapping') for (const k of q.keys) expr(k, fx);
    for (const c of children(q)) if (/^Match/.test(c.type)) visit(c);
  };
  visit(p);
}

// ── liveness ────────────────────────────────────────────────
// tracked(sym) decides which symbols participate. Returns a list of dead
// definitions [{ def, el }].
function deadStores(cfg, tracked, reach) {
  const liveIn = new Map();
  const blocks = cfg.blocks.filter((b) => reach.has(b));
  const transfer = (b, live, onDead) => {
    const cfx = condEffects(b.cond);
    if (cfx) {
      for (const d of cfx.defs) if (d.sym && tracked(d.sym)) { if (!live.has(d.sym) && onDead) onDead(d, { kind: 'cond', node: b.cond.node }); live.delete(d.sym); }
      for (const u of cfx.uses) if (u.sym && tracked(u.sym)) live.add(u.sym);
      for (const u of cfx.deferred) if (u.sym && tracked(u.sym)) live.add(u.sym);
    }
    for (let i = b.elems.length - 1; i >= 0; i--) {
      const el = b.elems[i];
      const fx = effects(el);
      for (const d of fx.defs) if (d.sym && tracked(d.sym)) { if (!live.has(d.sym) && onDead) onDead(d, el); live.delete(d.sym); }
      for (const k of fx.kills) if (k.sym && tracked(k.sym)) live.delete(k.sym);
      for (const u of fx.uses) if (u.sym && tracked(u.sym)) live.add(u.sym);
      for (const u of fx.deferred) if (u.sym && tracked(u.sym)) live.add(u.sym);
    }
    return live;
  };
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      const out = new Set();
      for (const e of b.succ) { const s = liveIn.get(e.to); if (s) for (const x of s) out.add(x); }
      const inn = transfer(b, out, null);
      const prev = liveIn.get(b);
      if (!prev || prev.size !== inn.size) { liveIn.set(b, inn); changed = true; }
    }
  }
  const dead = [];
  for (const b of blocks) {
    const out = new Set();
    for (const e of b.succ) { const s = liveIn.get(e.to); if (s) for (const x of s) out.add(x); }
    transfer(b, out, (d, el) => dead.push({ def: d, el }));
  }
  return dead;
}

// ── definite assignment ─────────────────────────────────────
// Returns uses of tracked symbols that are unassigned on every path.
function unassignedUses(cfg, tracked, initial, reach) {
  const outMay = new Map();
  const blocks = cfg.blocks.filter((b) => reach.has(b));
  const order = blocks; // creation order approximates RPO
  const run = (b, may, report) => {
    const apply = (fx) => {
      for (const [op, r] of fx.seq) {
        if (!r.sym || !tracked(r.sym)) continue;
        if (op === 'u') { if (report && !may.has(r.sym)) report(r); } else if (op === 'd') may.add(r.sym); else may.delete(r.sym);
      }
    };
    for (const el of b.elems) apply(effects(el));
    const cfx = condEffects(b.cond);
    if (cfx) apply(cfx);
    return may;
  };
  const inOf = (b) => {
    if (b === cfg.entry) return new Set(initial);
    const may = new Set();
    for (const p of b.pred) {
      const s = outMay.get(p.from);
      if (s) for (const x of s) may.add(x);
    }
    return may;
  };
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    for (const b of order) {
      const out = run(b, inOf(b), null);
      const prev = outMay.get(b);
      if (!prev || prev.size !== out.size) { outMay.set(b, out); changed = true; }
    }
  }
  const found = [];
  for (const b of order) run(b, inOf(b), (u) => found.push(u));
  return found;
}

// first statement of every unreachable run inside fn (not nested functions)
function unreachableStatements(fnNode, cfg, reach) {
  const out = [];
  const isReach = (s) => {
    const l = cfg.stmtBlock.get(s);
    return l ? l.some((b) => reach.has(b)) : true;
  };
  const visitBody = (body, parentReach) => {
    for (let i = 0; i < body.length; i++) {
      const s = body[i];
      const r = isReach(s);
      if (!r) {
        const prevReach = i === 0 ? parentReach : isReach(body[i - 1]);
        if (prevReach) out.push({ stmt: s, after: i > 0 ? body[i - 1] : null });
        // the rest of this body is unreachable too unless something jumps into it (impossible)
        break;
      }
      if (FUNC_TYPES.has(s.type) || s.type === 'ClassDef') continue;
      for (const k of ['body', 'orelse', 'finalbody']) if (Array.isArray(s[k])) visitBody(s[k], r);
      if (s.handlers) for (const h of s.handlers) visitBody(h.body, r);
      if (s.cases) for (const c of s.cases) visitBody(c.body, r);
    }
  };
  visitBody(fnNode.body, true);
  return out;
}

module.exports = { effects, condEffects, deadStores, unassignedUses, unreachableStatements, reachable };
