'use strict';

// Per-function control-flow graph. Nodes are statements or atomic conditions
// (&&, || and ! are decomposed so that every 'cond' node tests one operand).
//   kinds: entry, exit, abort (panic / os.Exit / log.Fatal), stmt, cond,
//          join, range (loop head of a range statement), case, select
//   edges: { to, cond: true | false | undefined }
// `entryOf` maps a statement to the first CFG node that executes it.

const A = require('./ast');

class CFG {
  constructor(fn) {
    this.fn = fn;
    this.nodes = [];
    this.entryOf = new Map();
    this.entry = this.mk('entry', null);
    this.exit = this.mk('exit', null);
    this.abort = this.mk('abort', null);
    this.loops = [];
    this.labels = new Map();
    this.gotos = [];
    this.fallTo = null;
  }
  mk(kind, ast) {
    const n = { id: this.nodes.length, kind, ast, succ: [], pred: [] };
    this.nodes.push(n);
    return n;
  }
  edge(a, b, cond) {
    if (!a || !b) return;
    a.succ.push({ to: b, cond });
    b.pred.push({ from: a, cond });
  }
  stmtNode(s, next) {
    const n = this.mk('stmt', s);
    this.edge(n, next);
    return n;
  }
  list(stmts, next) {
    let cur = next;
    for (let i = stmts.length - 1; i >= 0; i--) cur = this.build(stmts[i], cur, null);
    return cur;
  }
  build(s, next, label) {
    const e = this.buildInner(s, next, label);
    if (s && e) this.entryOf.set(s, e);
    return e;
  }
  buildInner(s, next, label) {
    if (!s) return next;
    switch (s.k) {
      case 'Block': return this.list(s.stmts, next);
      case 'Empty': return next;
      case 'Labeled': {
        const target = this.mk('join', s);
        this.labels.set(s.label.name, target);
        const inner = this.build(s.stmt, next, s.label.name);
        this.edge(target, inner);
        return target;
      }
      case 'If': {
        const thenE = this.build(s.then, next, null);
        const elseE = s.els ? this.build(s.els, next, null) : next;
        const c = this.cond(s.cond, thenE, elseE);
        if (s.init) return this.stmtNode(s.init, c);
        return c;
      }
      case 'For': {
        const head = this.mk('join', s);
        const post = s.post ? this.stmtNode(s.post, head) : head;
        this.loops.push({ label, brk: next, cont: post, stmt: s });
        const body = this.build(s.body, post, null);
        this.loops.pop();
        if (s.cond) this.edge(head, this.cond(s.cond, body, next));
        else this.edge(head, body);
        if (s.init) return this.stmtNode(s.init, head);
        return head;
      }
      case 'Range': {
        const head = this.mk('range', s);
        this.loops.push({ label, brk: next, cont: head, stmt: s });
        const body = this.build(s.body, head, null);
        this.loops.pop();
        this.edge(head, body, true);
        this.edge(head, next, false);
        return head;
      }
      case 'Switch': {
        this.loops.push({ label, brk: next, cont: null, stmt: s, isSwitch: true });
        const bodies = new Array(s.cases.length);
        const saveFall = this.fallTo;
        for (let i = s.cases.length - 1; i >= 0; i--) {
          this.fallTo = i + 1 < s.cases.length ? bodies[i + 1] : next;
          bodies[i] = this.list(s.cases[i].body, next);
          if (!s.cases[i].body.length) bodies[i] = next;
        }
        this.fallTo = saveFall;
        this.loops.pop();
        const defIdx = s.cases.findIndex((c) => !c.list);
        let test = defIdx >= 0 ? bodies[defIdx] : next;
        for (let i = s.cases.length - 1; i >= 0; i--) {
          const c = s.cases[i];
          if (!c.list) continue;
          let t;
          if (!s.tag && c.list.length === 1) t = this.cond(c.list[0], bodies[i], test);
          else { t = this.mk('case', c); this.edge(t, bodies[i], true); this.edge(t, test, false); }
          this.entryOf.set(c, t);
          test = t;
        }
        let entry = test;
        if (s.tag) { const tn = this.mk('stmt', s.tag.k ? s.tag : s); this.edge(tn, entry); entry = tn; this.tagNode = tn; }
        if (s.init) entry = this.stmtNode(s.init, entry);
        return entry;
      }
      case 'TypeSwitch': {
        this.loops.push({ label, brk: next, cont: null, stmt: s, isSwitch: true });
        const sw = this.mk('stmt', s.assign);
        sw.typeSwitch = s;
        let hasDefault = false;
        for (const c of s.cases) {
          if (!c.list) hasDefault = true;
          const body = this.list(c.body, next);
          const cn = this.mk('case', c);
          this.edge(sw, cn);
          this.edge(cn, body);
          this.entryOf.set(c, cn);
        }
        this.loops.pop();
        if (!hasDefault) this.edge(sw, next);
        if (s.init) return this.stmtNode(s.init, sw);
        return sw;
      }
      case 'Select': {
        this.loops.push({ label, brk: next, cont: null, stmt: s, isSwitch: true });
        const sel = this.mk('select', s);
        for (const c of s.cases) {
          const body = this.list(c.body, next);
          const cn = c.comm ? this.stmtNode(c.comm, body) : this.mk('case', c);
          if (!c.comm) this.edge(cn, body);
          this.edge(sel, cn);
          this.entryOf.set(c, cn);
        }
        this.loops.pop();
        return sel;
      }
      case 'Branch': {
        const n = this.mk('stmt', s);
        if (s.tok === 'break') {
          const l = this.findLoop(s.label, false);
          this.edge(n, l ? l.brk : next);
        } else if (s.tok === 'continue') {
          const l = this.findLoop(s.label, true);
          this.edge(n, l ? l.cont : next);
        } else if (s.tok === 'goto') {
          this.gotos.push({ n, label: s.label ? s.label.name : '' });
        } else if (s.tok === 'fallthrough') {
          this.edge(n, this.fallTo || next);
        }
        return n;
      }
      case 'Return': {
        const n = this.mk('stmt', s);
        this.edge(n, this.exit);
        return n;
      }
      case 'ExprStmt': {
        if (A.isExitCall(s.x)) {
          const n = this.mk('stmt', s);
          n.aborts = true;
          this.edge(n, this.abort);
          return n;
        }
        return this.stmtNode(s, next);
      }
      default:
        return this.stmtNode(s, next);
    }
  }
  findLoop(label, needCont) {
    for (let i = this.loops.length - 1; i >= 0; i--) {
      const l = this.loops[i];
      if (label) { if (l.label === label.name) return l; continue; }
      if (needCont && l.isSwitch) continue;
      return l;
    }
    return null;
  }
  cond(e, T, F) {
    const x = A.strip(e);
    if (!x) { const n = this.mk('join', null); this.edge(n, T); return n; }
    if (x.k === 'Binary' && x.op === '&&') {
      const right = this.cond(x.y, T, F);
      return this.cond(x.x, right, F);
    }
    if (x.k === 'Binary' && x.op === '||') {
      const right = this.cond(x.y, T, F);
      return this.cond(x.x, T, right);
    }
    if (x.k === 'Unary' && x.op === '!') return this.cond(x.x, F, T);
    const n = this.mk('cond', x);
    this.edge(n, T, true);
    this.edge(n, F, false);
    return n;
  }
}

function buildCFG(fn) {
  const body = fn.body;
  if (!body) return null;
  const g = new CFG(fn);
  const first = g.list(body.stmts, g.exit);
  g.edge(g.entry, first);
  for (const gt of g.gotos) {
    const t = g.labels.get(gt.label);
    g.edge(gt.n, t || g.exit);
  }
  return g;
}

function reachable(g) {
  const seen = new Set();
  const stack = [g.entry];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    for (const e of n.succ) stack.push(e.to);
  }
  return seen;
}

module.exports = { buildCFG, reachable };
