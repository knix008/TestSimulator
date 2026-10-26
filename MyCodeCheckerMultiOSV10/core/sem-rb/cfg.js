'use strict';

// Per-method control-flow graph over local-variable events, plus backward
// liveness. Blocks hold ordered events { k: 'r'|'w', v: variable, node }.
// Blocks/lambdas are not expanded: the variables they touch are "captured"
// (scope.js) and every outer variable they read counts as a read where the
// block literal appears.

const { children } = require('./ast');

const RAISE = new Set(['raise', 'fail', 'exit', 'exit!', 'abort', 'throw']);

class CFG {
  constructor() {
    this.blocks = [];
    this.entry = this.newBlock();
    this.exit = this.newBlock();
  }
  newBlock() { const b = { id: this.blocks.length, ev: [], succ: new Set(), pred: new Set() }; this.blocks.push(b); return b; }
  edge(a, b) { if (a && b) { a.succ.add(b.id); b.pred.add(a.id); } }
}

function build(def) {
  const g = new CFG();
  let cur = g.newBlock();
  g.edge(g.entry, cur);
  const loops = [];
  const retries = []; // begin-body start blocks for 'retry' inside rescue clauses
  const handlers = []; // stack of { blocks: Set } for begin/rescue
  const fresh = () => { const b = g.newBlock(); if (handlers.length) handlers[handlers.length - 1].blocks.add(b); return b; };
  const ev = (k, ident) => { if (ident && ident._var) cur.ev.push({ k, v: ident._var, node: ident }); };
  const jumpTo = (b) => { g.edge(cur, b); cur = fresh(); cur.dead = true; };

  const reads = (n) => {
    // all variable reads inside n (used for blocks / lambdas)
    const stack = [n];
    while (stack.length) {
      const x = stack.pop();
      if (!x) continue;
      if (x.type === 'Ident' && x._var && !x.bind && !(x.parent && x.parent.type === 'Assign' && x.parent.target === x && x.parent.op === '=')) ev('r', x);
      for (const c of children(x)) if (c.type !== 'Def' && c.type !== 'Class' && c.type !== 'Module') stack.push(c);
    }
  };

  const cond = (n, tBlock, fBlock) => {
    // evaluates n, then branches
    expr(n);
    g.edge(cur, tBlock);
    g.edge(cur, fBlock);
  };

  function branch(list, from) {
    cur = fresh();
    g.edge(from, cur);
    stmts(list || []);
    return cur;
  }

  function expr(n) {
    if (!n || typeof n !== 'object') return;
    switch (n.type) {
      case 'Ident':
        if (n._var) ev(n.bind ? 'w' : 'r', n);
        return;
      case 'Block': case 'Lambda':
        reads(n);
        return;
      case 'Def': case 'Class': case 'Module': case 'SClass':
        return;
      case 'Assign':
        if (n.target.type === 'Ident') {
          if (n.op !== '=') ev('r', n.target);
          if (n.op === '||=' || n.op === '&&=') {
            const before = cur;
            const rhs = fresh();
            g.edge(before, rhs);
            cur = rhs;
            expr(n.value);
            ev('w', n.target);
            const join = fresh();
            g.edge(before, join);
            g.edge(cur, join);
            cur = join;
            return;
          }
          expr(n.value);
          ev('w', n.target);
          return;
        }
        expr(n.target);
        expr(n.value);
        return;
      case 'MultiAssign':
        expr(n.value);
        for (const t of n.targets) targetW(t);
        return;
      case 'Bin':
        if (n.op === '&&' || n.op === '||' || n.op === 'and' || n.op === 'or') {
          expr(n.l);
          const before = cur;
          const rhs = fresh();
          g.edge(before, rhs);
          cur = rhs;
          expr(n.r);
          const join = fresh();
          g.edge(before, join);
          g.edge(cur, join);
          cur = join;
          return;
        }
        expr(n.l);
        expr(n.r);
        return;
      case 'If': stmt(n); return;
      case 'Case': case 'While': case 'For': case 'Begin': case 'Return': case 'Break': case 'Next': case 'Redo': case 'Retry': case 'RescueMod':
        stmt(n);
        return;
      case 'Call':
        if (n.recv) expr(n.recv);
        for (const a of n.args) expr(a);
        if (n.block) reads(n.block);
        if (!n.recv && RAISE.has(n.name)) jumpTo(handlers.length ? handlers[handlers.length - 1].entry : g.exit);
        return;
      default:
        for (const c of children(n)) expr(c);
    }
  }

  function targetW(t) {
    if (!t) return;
    if (t.type === 'Ident') ev('w', t);
    else if (t.type === 'Splat') targetW(t.e);
    else if (t.type === 'Mlhs') t.targets.forEach(targetW);
    else expr(t);
  }

  function stmts(list) { for (const s of list || []) stmt(s); }

  function stmt(s) {
    if (!s) return;
    switch (s.type) {
      case 'If': {
        const t = g.newBlock();
        const f = g.newBlock();
        if (handlers.length) { handlers[handlers.length - 1].blocks.add(t); handlers[handlers.length - 1].blocks.add(f); }
        cond(s.cond, t, f);
        cur = t;
        stmts(s.then);
        const endT = cur;
        cur = f;
        stmts(s.else || []);
        const endF = cur;
        const join = fresh();
        g.edge(endT, join);
        g.edge(endF, join);
        cur = join;
        return;
      }
      case 'While': {
        const head = fresh();
        const body = g.newBlock();
        const exit = g.newBlock();
        if (handlers.length) { handlers[handlers.length - 1].blocks.add(body); handlers[handlers.length - 1].blocks.add(exit); }
        if (s.doWhile) {
          g.edge(cur, body);
          cur = body;
          loops.push({ brk: exit, nxt: head });
          stmts(s.body);
          loops.pop();
          g.edge(cur, head);
          cur = head;
          cond(s.cond, body, exit);
        } else {
          g.edge(cur, head);
          cur = head;
          cond(s.cond, body, exit);
          cur = body;
          loops.push({ brk: exit, nxt: head });
          stmts(s.body);
          loops.pop();
          g.edge(cur, head);
        }
        cur = exit;
        return;
      }
      case 'For': {
        expr(s.iter);
        const head = fresh();
        g.edge(cur, head);
        const body = fresh();
        const exit = fresh();
        g.edge(head, body);
        g.edge(head, exit);
        cur = body;
        for (const t of s.vars) targetW(t);
        loops.push({ brk: exit, nxt: head });
        stmts(s.body);
        loops.pop();
        g.edge(cur, head);
        cur = exit;
        return;
      }
      case 'Case': {
        if (s.subject) expr(s.subject);
        const ends = [];
        let test = cur;
        const clauses = s.whens.length ? s.whens : s.ins;
        for (const w of clauses) {
          cur = test;
          if (w.type === 'When') for (const c of w.conds) expr(c);
          else { expr(w.pat); if (w.guard) expr(w.guard.e); }
          const body = fresh();
          g.edge(cur, body);
          const nextTest = fresh();
          g.edge(cur, nextTest);
          cur = body;
          stmts(w.body);
          ends.push(cur);
          test = nextTest;
        }
        cur = test;
        stmts(s.else || []);
        ends.push(cur);
        const join = fresh();
        for (const e of ends) g.edge(e, join);
        cur = join;
        return;
      }
      case 'Begin': {
        const hasHandlers = s.rescues && s.rescues.length;
        const entryBlocks = new Set();
        let rescueEntry = null;
        if (hasHandlers) {
          rescueEntry = g.newBlock();
          handlers.push({ blocks: entryBlocks, entry: rescueEntry });
        }
        const start = fresh();
        entryBlocks.add(start);
        g.edge(cur, start);
        cur = start;
        stmts(s.body);
        if (hasHandlers) handlers.pop();
        let ends = [];
        if (s.elseBody) { stmts(s.elseBody); }
        ends.push(cur);
        if (hasHandlers) {
          for (const b of entryBlocks) g.edge(b, rescueEntry);
          retries.push(start);
          for (const r of s.rescues) {
            cur = fresh();
            g.edge(rescueEntry, cur);
            for (const c of r.classes) expr(c);
            if (r.var) targetW(r.var);
            stmts(r.body);
            ends.push(cur);
          }
          retries.pop();
          // an unmatched exception propagates
          g.edge(rescueEntry, g.exit);
        }
        if (s.ensure) {
          const ens = fresh();
          for (const e of ends) g.edge(e, ens);
          cur = ens;
          stmts(s.ensure);
          ends = [cur];
          g.edge(cur, g.exit);
        }
        const join = fresh();
        for (const e of ends) g.edge(e, join);
        cur = join;
        return;
      }
      case 'RescueMod': {
        const before = cur;
        const body = fresh();
        g.edge(before, body);
        cur = body;
        expr(s.expr);
        const endB = cur;
        const resc = fresh();
        g.edge(before, resc);
        g.edge(body, resc);
        cur = resc;
        expr(s.rescue);
        const join = fresh();
        g.edge(endB, join);
        g.edge(cur, join);
        cur = join;
        return;
      }
      case 'Return':
        expr(s.value);
        jumpTo(g.exit);
        return;
      case 'Break': case 'Next': {
        expr(s.value);
        const l = loops[loops.length - 1];
        jumpTo(l ? (s.type === 'Break' ? l.brk : l.nxt) : g.exit);
        return;
      }
      case 'Retry':
        jumpTo(retries.length ? retries[retries.length - 1] : g.exit);
        return;
      case 'Redo': {
        const l = loops[loops.length - 1];
        jumpTo(l ? l.nxt : g.exit);
        return;
      }
      default:
        expr(s);
    }
  }

  stmts(def.body);
  g.edge(cur, g.exit);
  return g;
}

// Backward liveness: liveOut[b] = U liveIn[succ]; liveIn = use U (out - def)
function liveness(g) {
  const n = g.blocks.length;
  const liveIn = new Array(n);
  const liveOut = new Array(n);
  const use = new Array(n);
  const defs = new Array(n);
  for (const b of g.blocks) {
    const u = new Set();
    const d = new Set();
    for (const e of b.ev) {
      if (e.k === 'r') { if (!d.has(e.v)) u.add(e.v); }
      else d.add(e.v);
    }
    use[b.id] = u;
    defs[b.id] = d;
    liveIn[b.id] = new Set(u);
    liveOut[b.id] = new Set();
  }
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    for (let i = n - 1; i >= 0; i--) {
      const b = g.blocks[i];
      const out = liveOut[i];
      for (const s of b.succ) for (const v of liveIn[s]) if (!out.has(v)) { out.add(v); changed = true; }
      const inn = liveIn[i];
      for (const v of out) if (!defs[i].has(v) && !inn.has(v)) { inn.add(v); changed = true; }
    }
  }
  return { liveIn, liveOut };
}

// Writes whose value can never be read. Returns [{ v, node }].
function deadStores(g, live) {
  const out = [];
  for (const b of g.blocks) {
    const liveNow = new Set(live.liveOut[b.id]);
    for (let i = b.ev.length - 1; i >= 0; i--) {
      const e = b.ev[i];
      if (e.k === 'w') {
        if (!liveNow.has(e.v)) out.push({ v: e.v, node: e.node, dead: !!b.dead });
        liveNow.delete(e.v);
      } else liveNow.add(e.v);
    }
  }
  return out;
}

module.exports = { build, liveness, deadStores, RAISE };
