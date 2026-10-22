'use strict';

// Per-function control-flow graphs, reachability, dominators, natural loops
// and a generic worklist dataflow solver. See AST.md "CFG and dataflow".
//
// buildCFG(fnNode, opts) -> CFG     (fnNode: FunctionDecl with body | LambdaExpr | CompoundStmt)
// solve(cfg, analysis)   -> { in, out, iterations, converged }

const Ty = require('./types');
const { NORETURN_NAMES } = require('./symbols');
const { walk } = require('./ast');

class Block {
  constructor(id, kind) {
    this.id = id;
    this.kind = kind || 'normal'; // 'entry' | 'exit' | 'normal' | 'handler'
    this.elements = [];
    this.terminator = null; // { kind:'branch'|'switch'|'range'|'goto'|'return'|'throw', node, cond }
    this.succs = [];
    this.preds = [];
    this.label = null;
    this.loopHeader = false;
  }
  get loc() {
    const n = this.elements[0] || (this.terminator && (this.terminator.cond || this.terminator.node));
    return n && n.loc ? n.loc : null;
  }
}

class CFG {
  constructor(fn) {
    this.fn = fn;
    this.blocks = [];
    this.entry = this.newBlock('entry');
    this.exit = this.newBlock('exit');
    this.edges = [];
    this.nodeBlock = new Map();
    this._rpo = null;
    this._idom = null;
    this._ipdom = null;
  }

  newBlock(kind) {
    const b = new Block(this.blocks.length, kind);
    this.blocks.push(b);
    return b;
  }

  addEdge(from, to, kind, extra) {
    if (!from || !to) return null;
    const e = { from, to, kind: kind || 'normal', ...(extra || {}) };
    from.succs.push(e);
    to.preds.push(e);
    this.edges.push(e);
    return e;
  }

  blockOf(node) { return this.nodeBlock.get(node) || null; }

  // ------------------------------------------------------------ queries

  reachable() {
    if (this._reach) return this._reach;
    const seen = new Set([this.entry]);
    const stack = [this.entry];
    while (stack.length) {
      const b = stack.pop();
      for (const e of b.succs) if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
    }
    this._reach = seen;
    return seen;
  }

  isReachable(nodeOrBlock) {
    const b = nodeOrBlock instanceof Block ? nodeOrBlock : this.blockOf(nodeOrBlock);
    return b ? this.reachable().has(b) : true;
  }

  // Unreachable statements grouped by block: [{ block, nodes }]
  unreachable() {
    const r = this.reachable();
    const out = [];
    for (const b of this.blocks) {
      if (r.has(b) || b === this.exit) continue;
      const nodes = b.elements.slice();
      if (b.terminator && b.terminator.node && !nodes.includes(b.terminator.node)) nodes.push(b.terminator.node);
      if (nodes.length) out.push({ block: b, nodes });
    }
    return out;
  }

  // Reverse post-order of the reachable blocks (forward).
  rpo() {
    if (this._rpo) return this._rpo;
    const order = [];
    const seen = new Set();
    const stack = [[this.entry, 0]];
    seen.add(this.entry);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [b, i] = top;
      if (i < b.succs.length) {
        top[1]++;
        const n = b.succs[i].to;
        if (!seen.has(n)) { seen.add(n); stack.push([n, 0]); }
      } else {
        stack.pop();
        order.push(b);
      }
    }
    order.reverse();
    this._rpo = order;
    return order;
  }

  // Immediate dominators: Map<Block, Block> (entry maps to itself).
  dominators() {
    if (this._idom) return this._idom;
    this._idom = computeIdom(this.rpo(), this.entry, (b) => b.preds.map((e) => e.from));
    return this._idom;
  }

  dominates(a, b) {
    const idom = this.dominators();
    if (!idom.has(b)) return false;
    let x = b;
    for (let guard = 0; guard < this.blocks.length + 2; guard++) {
      if (x === a) return true;
      const p = idom.get(x);
      if (!p || p === x) return x === a;
      x = p;
    }
    return false;
  }

  // Immediate post-dominators: Map<Block, Block> over blocks that reach the exit.
  postDominators() {
    if (this._ipdom) return this._ipdom;
    const order = [];
    const seen = new Set([this.exit]);
    const stack = [[this.exit, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [b, i] = top;
      if (i < b.preds.length) {
        top[1]++;
        const n = b.preds[i].from;
        if (!seen.has(n)) { seen.add(n); stack.push([n, 0]); }
      } else { stack.pop(); order.push(b); }
    }
    order.reverse();
    this._ipdom = computeIdom(order, this.exit, (b) => b.succs.map((e) => e.to));
    return this._ipdom;
  }

  postDominates(a, b) {
    const ip = this.postDominators();
    if (!ip.has(b)) return false;
    let x = b;
    for (let guard = 0; guard < this.blocks.length + 2; guard++) {
      if (x === a) return true;
      const p = ip.get(x);
      if (!p || p === x) return x === a;
      x = p;
    }
    return false;
  }

  // Natural loops: [{ header, latches, blocks: Set<Block>, backEdges, exits: Edge[] }]
  loops() {
    if (this._loops) return this._loops;
    const reach = this.reachable();
    const byHeader = new Map();
    for (const e of this.edges) {
      if (!reach.has(e.from)) continue;
      if (this.dominates(e.to, e.from)) {
        let L = byHeader.get(e.to);
        if (!L) { L = { header: e.to, latches: [], blocks: new Set([e.to]), backEdges: [], exits: [] }; byHeader.set(e.to, L); }
        L.latches.push(e.from);
        L.backEdges.push(e);
        const stack = [e.from];
        while (stack.length) {
          const b = stack.pop();
          if (L.blocks.has(b)) continue;
          L.blocks.add(b);
          for (const p of b.preds) if (reach.has(p.from)) stack.push(p.from);
        }
      }
    }
    const loops = [...byHeader.values()];
    for (const L of loops) {
      L.header.loopHeader = true;
      for (const b of L.blocks) for (const e of b.succs) if (!L.blocks.has(e.to)) L.exits.push(e);
    }
    this._loops = loops;
    return loops;
  }
}

function computeIdom(order, root, predsOf) {
  const index = new Map();
  order.forEach((b, i) => index.set(b, i));
  const idom = new Map();
  idom.set(root, root);
  let changed = true;
  const intersect = (a, b) => {
    let x = a, y = b;
    while (x !== y) {
      while (index.get(x) > index.get(y)) x = idom.get(x);
      while (index.get(y) > index.get(x)) y = idom.get(y);
    }
    return x;
  };
  let rounds = 0;
  while (changed && rounds++ < 1000) {
    changed = false;
    for (const b of order) {
      if (b === root) continue;
      let nd = null;
      for (const p of predsOf(b)) {
        if (!index.has(p) || !idom.has(p)) continue;
        nd = nd === null ? p : intersect(p, nd);
      }
      if (nd !== null && idom.get(b) !== nd) { idom.set(b, nd); changed = true; }
    }
  }
  return idom;
}

// ---------------------------------------------------------------- builder

class Builder {
  constructor(fn, opts) {
    this.opts = opts || {};
    this.cfg = new CFG(fn);
    this.cur = null;
    this.breakTargets = [];
    this.continueTargets = [];
    this.switches = [];
    this.labels = new Map();
    this.tries = [];
    this.pendingGotos = [];
    this.prune = this.opts.constantConditions !== 'keep';
    this.target = this.opts.target;
  }

  block() { return this.cfg.newBlock('normal'); }

  start(b) { this.cur = b; return b; }

  // add an element to the current block (creating a block if flow is dead)
  add(node) {
    if (!this.cur) this.cur = this.block();
    this.cur.elements.push(node);
    this.cfg.nodeBlock.set(node, this.cur);
    if (this.tries.length && mayThrow(node)) this.exceptionEdges(this.cur);
  }

  exceptionEdges(b) {
    const t = this.tries[this.tries.length - 1];
    if (!t || t.from.has(b)) return;
    t.from.add(b);
    for (const h of t.handlers) this.cfg.addEdge(b, h, 'exception');
  }

  jump(to, kind) {
    if (this.cur) this.cfg.addEdge(this.cur, to, kind || 'normal');
    this.cur = null;
  }

  build(body) {
    const c = this.cfg;
    const first = this.block();
    c.addEdge(c.entry, first, 'normal');
    this.start(first);
    if (body) {
      if (body.type === 'TryStmt') this.stmt(body);
      else this.stmt(body);
    }
    if (this.cur) c.addEdge(this.cur, c.exit, 'normal');
    for (const g of this.pendingGotos) {
      const tgt = this.labels.get(g.label);
      if (tgt) c.addEdge(g.from, tgt, 'goto', { node: g.node });
      else c.addEdge(g.from, c.exit, 'goto', { node: g.node, unresolved: true });
    }
    // loop headers: set syntactically for while/do/for/range-for; loops made of
    // gotos are found as natural loops
    if (this.pendingGotos.length || this.computedFrom) c.loops();
    return c;
  }

  labelBlock(name) {
    let b = this.labels.get(name);
    if (!b) { b = this.block(); b.label = name; this.labels.set(name, b); }
    return b;
  }

  stmt(s) {
    if (!s) return;
    switch (s.type) {
      case 'CompoundStmt':
        for (const x of s.body) this.stmt(x);
        return;
      case 'Declaration': {
        if (!s.declarators.length) { this.add(s); return; }
        for (const d of s.declarators) {
          if (d.type === 'VarDecl' || d.type === 'BindingDecl') this.add(d);
          else if (d.type === 'TypedefDecl' && hasVla(d)) this.add(d);
        }
        return;
      }
      case 'ExprStmt': {
        const e = s.expr;
        this.add(s);
        if (isThrow(e)) { this.throwFrom(s); return; }
        if (this.isNoreturnCall(e)) {
          this.cfg.addEdge(this.cur, this.cfg.exit, 'noreturn', { node: s });
          this.cur = null;
        }
        return;
      }
      case 'NullStmt': case 'AsmStmt': case 'StaticAssert': case 'UsingDirective': case 'UsingDecl': case 'AliasDecl': case 'ErrorStmt':
        this.add(s);
        return;
      case 'ReturnStmt':
        this.add(s);
        if (this.cur) {
          this.cur.terminator = { kind: 'return', node: s };
          this.cfg.addEdge(this.cur, this.cfg.exit, 'return', { node: s });
        }
        this.cur = null;
        return;
      case 'IfStmt': return this.ifStmt(s);
      case 'WhileStmt': return this.whileStmt(s);
      case 'DoStmt': return this.doStmt(s);
      case 'ForStmt': return this.forStmt(s);
      case 'RangeForStmt': return this.rangeFor(s);
      case 'SwitchStmt': return this.switchStmt(s);
      case 'CaseStmt': case 'DefaultStmt': return this.caseStmt(s);
      case 'BreakStmt': {
        const t = this.breakTargets[this.breakTargets.length - 1];
        this.add(s);
        if (t) this.jump(t, 'break'); else this.cur = null;
        return;
      }
      case 'ContinueStmt': {
        const t = this.continueTargets[this.continueTargets.length - 1];
        this.add(s);
        if (t) this.jump(t, 'continue'); else this.cur = null;
        return;
      }
      case 'GotoStmt': {
        this.add(s);
        if (s.label) {
          this.cur.terminator = { kind: 'goto', node: s };
          this.pendingGotos.push({ from: this.cur, label: s.label, node: s });
        } else {
          // computed goto: may reach any label
          this.cur.terminator = { kind: 'goto', node: s, computed: true };
          this.computedFrom = (this.computedFrom || []).concat([this.cur]);
        }
        this.cur = null;
        return;
      }
      case 'LabelStmt': {
        const b = this.labelBlock(s.label);
        b.labelNode = s;
        this.jump(b, 'normal');
        this.start(b);
        this.cfg.nodeBlock.set(s, b);
        if (this.computedFrom) for (const f of this.computedFrom) this.cfg.addEdge(f, b, 'goto', { computed: true });
        this.stmt(s.body);
        return;
      }
      case 'TryStmt': return this.tryStmt(s);
      default:
        this.add(s);
    }
  }

  isNoreturnCall(e) {
    let x = e;
    while (x && (x.type === 'ParenExpr' || (x.type === 'CastExpr' && x.arg))) x = x.type === 'ParenExpr' ? x.expr : x.arg;
    if (x && x.type === 'ConditionalExpr') return false;
    if (!x || x.type !== 'CallExpr') return false;
    const s = x.calleeSymbol || (x.callee && x.callee.symbol);
    if (s && s.noreturn) return true;
    const name = x.callee && x.callee.type === 'Identifier' ? x.callee.qname || x.callee.name : null;
    if (name && NORETURN_NAMES.has(name) && !(s && s.definition && !s.noreturn && !NORETURN_NAMES.has(s.qname))) return true;
    if (this.opts.noreturn && name && this.opts.noreturn.includes(name)) return true;
    return false;
  }

  throwFrom(s) {
    const t = this.tries[this.tries.length - 1];
    if (t) for (const h of t.handlers) this.cfg.addEdge(this.cur, h, 'throw', { node: s });
    else this.cfg.addEdge(this.cur, this.cfg.exit, 'throw', { node: s });
    this.cur.terminator = { kind: 'throw', node: s };
    this.cur = null;
  }

  constCond(e) {
    if (!this.prune || !e || e.type === 'Declaration' || e.type === 'VarDecl') return null;
    const v = Ty.constValue(e, { target: this.target });
    if (!v || v.invalid) return null;
    return v.float ? v.value !== 0 : v.value !== 0n;
  }

  // Emit a conditional branch from the current block, splitting && / || / !.
  branch(cond, tBlock, fBlock, node) {
    if (!this.cur) this.cur = this.block();
    if (cond && cond.type === 'Declaration') {
      for (const d of cond.declarators) this.add(d);
      const d = cond.declarators[0];
      this.setBranch(d, tBlock, fBlock, node);
      return;
    }
    let e = cond;
    while (e && e.type === 'ParenExpr') e = e.expr;
    if (e && e.type === 'UnaryExpr' && e.op === '!' && this.opts.splitConditions !== false) {
      this.branch(e.arg, fBlock, tBlock, node);
      return;
    }
    if (e && e.type === 'BinaryExpr' && (e.op === '&&' || e.op === '||') && this.opts.splitConditions !== false) {
      const k = this.constCond(e);
      if (k !== null) { this.jump(k ? tBlock : fBlock, k ? 'true' : 'false'); return; }
      const mid = this.block();
      if (e.op === '&&') this.branch(e.left, mid, fBlock, node);
      else this.branch(e.left, tBlock, mid, node);
      this.start(mid);
      this.branch(e.right, tBlock, fBlock, node);
      return;
    }
    if (e && e.type === 'BinaryExpr' && e.op === ',') {
      this.add(e.left);
      this.branch(e.right, tBlock, fBlock, node);
      return;
    }
    this.setBranch(cond, tBlock, fBlock, node);
  }

  setBranch(cond, tBlock, fBlock, node) {
    const b = this.cur;
    const k = this.constCond(cond);
    b.terminator = { kind: 'branch', cond, node, constant: k };
    this.cfg.nodeBlock.set(cond, b);
    if (this.tries.length && mayThrow(cond)) this.exceptionEdges(b);
    if (k !== false) this.cfg.addEdge(b, tBlock, 'true', { cond });
    if (k !== true) this.cfg.addEdge(b, fBlock, 'false', { cond });
    this.cur = null;
  }

  ifStmt(s) {
    if (s.init) this.stmt(s.init);
    const thenB = this.block();
    const after = this.block();
    const elseB = s.else ? this.block() : after;
    if (s.consteval) {
      // if consteval: both arms possible
      if (!this.cur) this.cur = this.block();
      this.cur.terminator = { kind: 'branch', cond: null, node: s, constant: null };
      this.cfg.addEdge(this.cur, thenB, 'true');
      this.cfg.addEdge(this.cur, elseB, 'false');
      this.cur = null;
    } else this.branch(s.cond, thenB, elseB, s);
    this.start(thenB);
    this.stmt(s.then);
    this.jump(after, 'normal');
    if (s.else) {
      this.start(elseB);
      this.stmt(s.else);
      this.jump(after, 'normal');
    }
    this.start(after);
  }

  whileStmt(s) {
    const header = this.block();
    const body = this.block();
    const after = this.block();
    this.jump(header, 'normal');
    this.start(header);
    header.loopNode = s;
    header.loopHeader = true;
    this.branch(s.cond, body, after, s);
    this.breakTargets.push(after);
    this.continueTargets.push(header);
    this.start(body);
    this.stmt(s.body);
    this.jump(header, 'back');
    this.breakTargets.pop();
    this.continueTargets.pop();
    this.start(after);
  }

  doStmt(s) {
    const body = this.block();
    const condB = this.block();
    const after = this.block();
    this.jump(body, 'normal');
    body.loopNode = s;
    body.loopHeader = true;
    this.breakTargets.push(after);
    this.continueTargets.push(condB);
    this.start(body);
    this.stmt(s.body);
    this.jump(condB, 'normal');
    this.breakTargets.pop();
    this.continueTargets.pop();
    this.start(condB);
    this.branch(s.cond, body, after, s);
    for (const e of body.preds) if (e.from === condB) e.back = true;
    this.start(after);
  }

  forStmt(s) {
    if (s.init) this.stmt(s.init);
    const header = this.block();
    const body = this.block();
    const inc = this.block();
    const after = this.block();
    this.jump(header, 'normal');
    this.start(header);
    header.loopNode = s;
    header.loopHeader = true;
    if (s.cond) this.branch(s.cond, body, after, s);
    else this.jump(body, 'normal');
    this.breakTargets.push(after);
    this.continueTargets.push(inc);
    this.start(body);
    this.stmt(s.body);
    this.jump(inc, 'normal');
    this.breakTargets.pop();
    this.continueTargets.pop();
    this.start(inc);
    if (s.inc) this.add(s.inc);
    this.jump(header, 'back');
    this.start(after);
  }

  rangeFor(s) {
    if (s.init) this.stmt(s.init);
    this.add(s.range);
    const header = this.block();
    const body = this.block();
    const after = this.block();
    this.jump(header, 'normal');
    this.start(header);
    header.loopNode = s;
    header.loopHeader = true;
    header.terminator = { kind: 'range', node: s, cond: null };
    this.cfg.addEdge(header, body, 'true');
    this.cfg.addEdge(header, after, 'false');
    this.cur = null;
    this.breakTargets.push(after);
    this.continueTargets.push(header);
    this.start(body);
    for (const d of s.decl.declarators) this.add(d);
    this.stmt(s.body);
    this.jump(header, 'back');
    this.breakTargets.pop();
    this.continueTargets.pop();
    this.start(after);
  }

  switchStmt(s) {
    if (s.init) this.stmt(s.init);
    if (!this.cur) this.cur = this.block();
    if (s.cond && s.cond.type === 'Declaration') for (const d of s.cond.declarators) this.add(d);
    const sw = this.cur;
    sw.terminator = { kind: 'switch', cond: s.cond, node: s };
    if (s.cond) this.cfg.nodeBlock.set(s.cond, sw);
    const after = this.block();
    const ctx = { block: sw, node: s, hasDefault: false, cases: [] };
    this.switches.push(ctx);
    this.breakTargets.push(after);
    this.cur = null; // statements before the first label are unreachable
    this.stmt(s.body);
    this.jump(after, 'normal');
    this.breakTargets.pop();
    this.switches.pop();
    if (!ctx.hasDefault) this.cfg.addEdge(sw, after, 'default', { implicit: true });
    this.start(after);
  }

  caseStmt(s) {
    const ctx = this.switches[this.switches.length - 1];
    const b = this.block();
    if (this.cur) this.cfg.addEdge(this.cur, b, 'fallthrough');
    if (ctx) {
      if (s.type === 'DefaultStmt') {
        ctx.hasDefault = true;
        this.cfg.addEdge(ctx.block, b, 'default', { node: s });
      } else {
        ctx.cases.push(s);
        this.cfg.addEdge(ctx.block, b, 'case', { node: s, value: s.value, constValue: s.constValue === undefined ? null : s.constValue, high: s.high || null });
      }
    }
    b.caseNode = s;
    this.cfg.nodeBlock.set(s, b);
    this.start(b);
    this.stmt(s.body);
  }

  tryStmt(s) {
    const handlers = s.handlers.map(() => { const h = this.cfg.newBlock('handler'); return h; });
    const after = this.block();
    const ctx = { handlers, from: new Set() };
    this.tries.push(ctx);
    const bodyB = this.block();
    this.jump(bodyB, 'normal');
    this.start(bodyB);
    this.stmt(s.body);
    this.jump(after, 'normal');
    this.tries.pop();
    s.handlers.forEach((h, i) => {
      const hb = handlers[i];
      hb.catchNode = h;
      this.cfg.nodeBlock.set(h, hb);
      this.start(hb);
      if (h.param) hb.elements.push(h.param);
      this.stmt(h.body);
      this.jump(after, 'normal');
    });
    this.start(after);
  }
}

function isThrow(e) {
  while (e && e.type === 'ParenExpr') e = e.expr;
  return !!e && e.type === 'ThrowExpr';
}

function hasVla(d) {
  const t = d.ctype && Ty.canonical(d.ctype);
  return !!(t && t.kind === 'array' && t.vla);
}

function mayThrow(node) {
  let found = false;
  walk(node, (n) => {
    if (found) return walk.STOP;
    if (n.type === 'CallExpr' || n.type === 'NewExpr' || n.type === 'ThrowExpr') { found = true; return walk.STOP; }
    if (n.type === 'LambdaExpr') return walk.SKIP;
    return undefined;
  });
  return found;
}

function buildCFG(fn, opts = {}) {
  let body = fn;
  if (fn && (fn.type === 'FunctionDecl' || fn.type === 'LambdaExpr')) body = fn.body;
  const b = new Builder(fn, opts);
  try {
    return b.build(body);
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    // too deeply nested: return what was built, flagged
    b.cfg.truncated = true;
    if (b.cur) b.cfg.addEdge(b.cur, b.cfg.exit, 'normal');
    return b.cfg;
  }
}

// Build CFGs for every function definition (and lambda when opts.lambdas) under root.
function buildAllCFGs(root, opts = {}) {
  const out = new Map();
  walk(root, (n) => {
    if (n.type === 'FunctionDecl' && n.body) out.set(n, buildCFG(n, opts));
    else if (n.type === 'LambdaExpr' && opts.lambdas) out.set(n, buildCFG(n, opts));
  });
  return out;
}

// ---------------------------------------------------------------- dataflow

// analysis = {
//   direction: 'forward' | 'backward',      (default forward)
//   boundary: V,                             value at entry (forward) or exit (backward)
//   init: V | (block) => V,                  initial value of every other block (bottom)
//   transfer(block, value) => V,             or transferElement(node, value, block) => V
//   join(a, b) => V,
//   equal(a, b) => boolean,
//   edge(edge, value) => V | null,           optional: refine along an edge (null = infeasible)
//   widen(prev, next, block, visits) => V,   optional: applied at loop headers
//   widenAfter: 2,                           visits of a loop header before widening
//   maxIterations: 100000,
// }
function solve(cfg, a) {
  const backward = a.direction === 'backward';
  const order = backward ? reversePostorderBackward(cfg) : cfg.rpo();
  const index = new Map();
  order.forEach((b, i) => index.set(b, i));
  const initOf = typeof a.init === 'function' ? a.init : () => a.init;
  const IN = new Map(), OUT = new Map();
  for (const b of cfg.blocks) { IN.set(b, initOf(b)); OUT.set(b, initOf(b)); }
  const start = backward ? cfg.exit : cfg.entry;
  const equal = a.equal || ((x, y) => x === y);
  const transfer = a.transfer || ((block, v) => {
    let x = v;
    const els = blockItems(block);
    if (backward) for (let i = els.length - 1; i >= 0; i--) x = a.transferElement(els[i], x, block);
    else for (const n of els) x = a.transferElement(n, x, block);
    return x;
  });
  if (cfg.loops) cfg.loops();
  const visits = new Map();
  const queued = new Set(order);
  const heap = new MinHeap((x, y) => index.get(x) - index.get(y));
  for (const b of order) heap.push(b);
  let iterations = 0;
  const max = a.maxIterations || 100000;
  const widenAfter = a.widenAfter == null ? 2 : a.widenAfter;
  while (heap.size && iterations < max) {
    const b = heap.pop();
    queued.delete(b);
    iterations++;
    // merge
    let v;
    let any = false;
    const incoming = backward ? b.succs : b.preds;
    for (const e of incoming) {
      const src = backward ? e.to : e.from;
      if (!index.has(src)) continue;
      let ev = OUT.get(src);
      if (a.edge) {
        ev = a.edge(e, ev);
        if (ev === null || ev === undefined) continue;
      }
      v = any ? a.join(v, ev) : ev;
      any = true;
    }
    if (b === start) v = any ? a.join(a.boundary, v) : a.boundary;
    else if (!any) v = initOf(b);
    const prevIn = IN.get(b);
    const isHeader = !backward && b.loopHeader;
    if (isHeader && a.widen) {
      const n = (visits.get(b) || 0) + 1;
      visits.set(b, n);
      if (n > widenAfter) v = a.widen(prevIn, v, b, n);
    }
    IN.set(b, v);
    const out = transfer(b, v);
    const prevOut = OUT.get(b);
    OUT.set(b, out);
    if (iterations > order.length && equal(prevOut, out) && equal(prevIn, v)) continue;
    const next = backward ? b.preds : b.succs;
    for (const e of next) {
      const dst = backward ? e.from : e.to;
      if (!index.has(dst) || queued.has(dst)) continue;
      queued.add(dst);
      heap.push(dst);
    }
  }
  if (backward) return { in: OUT, out: IN, before: OUT, after: IN, iterations, converged: heap.size === 0 };
  return { in: IN, out: OUT, iterations, converged: heap.size === 0 };
}

// Elements of a block followed by its branch / switch condition (evaluation order).
function blockItems(block) {
  const t = block.terminator;
  if (t && t.cond && (t.kind === 'branch' || t.kind === 'switch') && !block.elements.includes(t.cond)) return block.elements.concat([t.cond]);
  return block.elements;
}

function reversePostorderBackward(cfg) {
  const order = [];
  const seen = new Set([cfg.exit]);
  const stack = [[cfg.exit, 0]];
  while (stack.length) {
    const top = stack[stack.length - 1];
    const [b, i] = top;
    if (i < b.preds.length) {
      top[1]++;
      const n = b.preds[i].from;
      if (!seen.has(n)) { seen.add(n); stack.push([n, 0]); }
    } else { stack.pop(); order.push(b); }
  }
  order.reverse();
  return order;
}

class MinHeap {
  constructor(cmp) { this.a = []; this.cmp = cmp; }
  get size() { return this.a.length; }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

// Classic example analyses built on solve(), useful as references and in tests.

// Reaching definitions of local variables: value = Set of defining nodes.
function reachingDefinitions(cfg) {
  const defsOf = (n) => {
    const out = [];
    walk(n, (x) => {
      if (x.type === 'LambdaExpr') return walk.SKIP;
      if (x.type === 'VarDecl' && x.symbol) out.push({ sym: x.symbol, node: x });
      if (x.type === 'AssignExpr' && x.left && x.left.type === 'Identifier' && x.left.symbol) out.push({ sym: x.left.symbol, node: x });
      if (x.type === 'UnaryExpr' && (x.op === '++' || x.op === '--') && x.arg.type === 'Identifier' && x.arg.symbol) out.push({ sym: x.arg.symbol, node: x });
      return undefined;
    });
    return out;
  };
  return solve(cfg, {
    direction: 'forward',
    boundary: new Map(),
    init: new Map(),
    transferElement(n, v) {
      const ds = defsOf(n);
      if (!ds.length) return v;
      const m = new Map(v);
      for (const d of ds) m.set(d.sym, new Set([d.node]));
      return m;
    },
    join(a, b) {
      const m = new Map(a);
      for (const [k, s] of b) {
        const cur = m.get(k);
        if (!cur) m.set(k, s);
        else { const u = new Set(cur); for (const x of s) u.add(x); m.set(k, u); }
      }
      return m;
    },
    equal(a, b) {
      if (a.size !== b.size) return false;
      for (const [k, s] of a) {
        const t = b.get(k);
        if (!t || t.size !== s.size) return false;
        for (const x of s) if (!t.has(x)) return false;
      }
      return true;
    },
  });
}

// Live variables (backward): value = Set of symbols live at the point.
function liveVariables(cfg) {
  const usesDefs = (n) => {
    const uses = new Set(), defs = new Set();
    walk(n, (x, p, k) => {
      if (x.type === 'LambdaExpr') return walk.SKIP;
      if (x.type === 'Identifier' && x.symbol && (x.symbol.kind === 'variable' || x.symbol.kind === 'parameter')) {
        if (p && p.type === 'AssignExpr' && k === 'left' && p.op === '=') defs.add(x.symbol);
        else uses.add(x.symbol);
      }
      if (x.type === 'VarDecl' && x.symbol && x.init) defs.add(x.symbol);
      return undefined;
    });
    return { uses, defs };
  };
  return solve(cfg, {
    direction: 'backward',
    boundary: new Set(),
    init: new Set(),
    transferElement(n, v) {
      const { uses, defs } = usesDefs(n);
      const out = new Set(v);
      for (const d of defs) out.delete(d);
      for (const u of uses) out.add(u);
      return out;
    },
    join(a, b) { const u = new Set(a); for (const x of b) u.add(x); return u; },
    equal(a, b) { if (a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; },
  });
}

module.exports = { buildCFG, buildAllCFGs, solve, blockItems, CFG, Block, reachingDefinitions, liveVariables };
