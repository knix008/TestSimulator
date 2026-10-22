'use strict';

// Control-flow graph per function (or module body). Blocks hold elements
// ({ kind, node }) and an optional branch condition `cond`
// ({ kind: 'expr', node } | { kind: 'for', node } | { kind: 'case', node, irrefutable }).
// Edges are { to, kind: 'normal' | 'true' | 'false' | 'exc' | 'back' }.
// Inside a try body every statement starts a new block with an exception
// edge to the handler dispatch, so handlers see the state before and after
// each statement.

const { dotted, numValue } = require('./ast');

const TERMINATING_CALLS = new Set(['sys.exit', 'exit', 'quit', 'os._exit', 'os.abort', 'pytest.fail', 'pytest.skip', 'pytest.exit', 'self.fail', 'unittest.SkipTest']);
const SUPPRESSING_CTX = /(?:^|\.)(?:suppress|raises|assertRaises|assertRaisesRegex|assertWarns|assertWarnsRegex|warns|deprecated_call|assertLogs)$/;

class Block {
  constructor(id, kind) {
    this.id = id;
    this.kind = kind || 'normal';
    this.elems = [];
    this.succ = [];
    this.pred = [];
    this.cond = null;
  }
}

class CFGBuilder {
  constructor(fnNode, opts = {}) {
    this.fn = fnNode;
    this.blocks = [];
    this.loops = [];
    this.excTarget = null;
    this.finallyStack = [];
    this.stmtBlock = new Map();
    this.terminators = opts.terminators || TERMINATING_CALLS;
    this.isNoReturn = opts.isNoReturn || null;
    this.entry = this.newBlock('entry');
    this.exit = this.newBlock('exit');
    this.raise = this.newBlock('raise');
  }

  newBlock(kind) {
    const b = new Block(this.blocks.length, kind);
    this.blocks.push(b);
    return b;
  }

  link(a, b, kind = 'normal') {
    if (!a || !b) return;
    for (const e of a.succ) if (e.to === b && e.kind === kind) return;
    a.succ.push({ to: b, kind });
    b.pred.push({ from: a, kind });
  }

  build() {
    const end = this.stmts(this.fn.body, this.entry);
    if (end) {
      this.link(end, this.exit);
      this.fallthrough = end;
    }
    return {
      blocks: this.blocks, entry: this.entry, exit: this.exit, raise: this.raise, stmtBlock: this.stmtBlock,
      fallthrough: this.fallthrough || null,
    };
  }

  stmts(list, cur) {
    for (const s of list) {
      if (!cur) cur = this.newBlock('dead');
      cur = this.stmt(s, cur);
    }
    return cur;
  }

  // start a statement: in a try body, new block + exception edge
  begin(cur, s) {
    if (this.excTarget) {
      if (cur.elems.length || cur.cond) { const nb = this.newBlock(); this.link(cur, nb); cur = nb; }
      this.link(cur, this.excTarget, 'exc');
    }
    if (cur.cond) { const nb = this.newBlock(); this.link(cur, nb); cur = nb; }
    this.mark(s, cur);
    return cur;
  }

  mark(s, b) {
    const l = this.stmtBlock.get(s);
    if (l) l.push(b); else this.stmtBlock.set(s, [b]);
  }

  raiseTarget() { return this.excTarget || this.raise; }

  // route a jump (return/break/continue) through pending finally blocks
  jump(cur, target, depth) {
    const fins = this.finallyStack.slice(depth == null ? 0 : depth).filter(Boolean);
    if (fins.length) {
      const fin = fins[fins.length - 1];
      this.link(cur, fin.entry);
      fin.pending.add(target);
      return;
    }
    this.link(cur, target);
  }

  isTerminatingCall(e) {
    if (!e || e.type !== 'Call') return false;
    const d = dotted(e.func);
    if (d && this.terminators.has(d)) return true;
    if (this.isNoReturn && this.isNoReturn(e)) return true;
    return false;
  }

  stmt(s, cur) {
    switch (s.type) {
      case 'If': {
        cur = this.begin(cur, s);
        cur.cond = { kind: 'expr', node: s.test, stmt: s };
        const t = this.newBlock();
        const f = this.newBlock();
        this.link(cur, t, 'true');
        this.link(cur, f, 'false');
        const te = this.stmts(s.body, t);
        const fe = s.orelse.length ? this.stmts(s.orelse, f) : f;
        if (!te && !fe) return null;
        const join = this.newBlock();
        this.link(te, join);
        this.link(fe, join);
        return join;
      }
      case 'While': {
        cur = this.begin(cur, s);
        const head = this.newBlock('loop');
        this.link(cur, head);
        this.mark(s, head);
        if (this.excTarget) this.link(head, this.excTarget, 'exc');
        head.cond = { kind: 'expr', node: s.test, stmt: s, loop: true };
        const body = this.newBlock();
        const after = this.newBlock();
        this.link(head, body, 'true');
        const always = alwaysTrue(s.test);
        let elseB = null;
        if (!always) {
          elseB = this.newBlock();
          this.link(head, elseB, 'false');
        }
        this.loops.push({ brk: after, cont: head, fin: this.finallyStack.length });
        const be = this.stmts(s.body, body);
        this.loops.pop();
        if (be) this.link(be, head, 'back');
        if (elseB) {
          const ee = this.stmts(s.orelse, elseB);
          if (ee) this.link(ee, after);
        }
        return after.pred.length ? after : null;
      }
      case 'For': case 'AsyncFor': {
        cur = this.begin(cur, s);
        cur.elems.push({ kind: 'iter', node: s });
        const head = this.newBlock('loop');
        this.link(cur, head);
        if (this.excTarget) this.link(head, this.excTarget, 'exc');
        head.cond = { kind: 'for', node: s, stmt: s, loop: true };
        const body = this.newBlock();
        body.elems.push({ kind: 'for-target', node: s });
        const after = this.newBlock();
        const elseB = this.newBlock();
        this.link(head, body, 'true');
        this.link(head, elseB, 'false');
        this.loops.push({ brk: after, cont: head, fin: this.finallyStack.length });
        const be = this.stmts(s.body, body);
        this.loops.pop();
        if (be) this.link(be, head, 'back');
        const ee = this.stmts(s.orelse, elseB);
        if (ee) this.link(ee, after);
        return after.pred.length ? after : null;
      }
      case 'Try': case 'TryStar': return this.tryStmt(s, cur);
      case 'With': case 'AsyncWith': {
        cur = this.begin(cur, s);
        cur.elems.push({ kind: 'with', node: s });
        const suppress = s.items.some((it) => it.context_expr.type === 'Call' && SUPPRESSING_CTX.test(dotted(it.context_expr.func) || ''));
        const body = this.newBlock();
        this.link(cur, body);
        if (suppress) {
          const after = this.newBlock();
          const saved = this.excTarget;
          this.excTarget = after;
          this.link(body, after, 'exc');
          const be = this.stmts(s.body, body);
          this.excTarget = saved;
          if (be) this.link(be, after);
          return after;
        }
        return this.stmts(s.body, body);
      }
      case 'Match': {
        cur = this.begin(cur, s);
        cur.elems.push({ kind: 'match', node: s });
        const after = this.newBlock();
        let prev = cur;
        let exhaustive = false;
        for (const c of s.cases) {
          const test = this.newBlock();
          this.link(prev, test, prev === cur ? 'normal' : 'false');
          const irrefutable = isIrrefutable(c.pattern) && !c.guard;
          test.cond = { kind: 'case', node: c, stmt: s, irrefutable };
          const bind = this.newBlock();
          bind.elems.push({ kind: 'case-bind', node: c });
          this.link(test, bind, 'true');
          let bodyStart = bind;
          if (c.guard) {
            bind.cond = { kind: 'expr', node: c.guard, stmt: s };
            bodyStart = this.newBlock();
            this.link(bind, bodyStart, 'true');
            const nextTest = this.newBlock();
            this.link(bind, nextTest, 'false');
            const be = this.stmts(c.body, bodyStart);
            if (be) this.link(be, after);
            prev = nextTest;
            continue;
          }
          const be = this.stmts(c.body, bodyStart);
          if (be) this.link(be, after);
          if (irrefutable) { exhaustive = true; prev = null; break; }
          prev = test;
        }
        if (prev && !exhaustive) this.link(prev, after, prev.cond ? 'false' : 'normal');
        return after.pred.length ? after : null;
      }
      case 'Return': {
        cur = this.begin(cur, s);
        cur.elems.push({ kind: 'stmt', node: s });
        this.jump(cur, this.exit, 0);
        return null;
      }
      case 'Raise': {
        cur = this.begin(cur, s);
        cur.elems.push({ kind: 'stmt', node: s });
        this.link(cur, this.raiseTarget(), 'exc');
        return null;
      }
      case 'Break': case 'Continue': {
        cur = this.begin(cur, s);
        cur.elems.push({ kind: 'stmt', node: s });
        const loop = this.loops[this.loops.length - 1];
        if (!loop) return null;
        this.jump(cur, s.type === 'Break' ? loop.brk : loop.cont, loop.fin);
        return null;
      }
      case 'Assert': {
        cur = this.begin(cur, s);
        cur.elems.push({ kind: 'stmt', node: s });
        const v = constTruth(s.test);
        if (v === false) { this.link(cur, this.raiseTarget(), 'exc'); return null; }
        return cur;
      }
      case 'Expr': {
        cur = this.begin(cur, s);
        cur.elems.push({ kind: 'stmt', node: s });
        let call = s.value;
        if (call.type === 'Await') call = call.value;
        if (this.isTerminatingCall(call)) { this.link(cur, this.raiseTarget(), 'exc'); return null; }
        return cur;
      }
      default: {
        cur = this.begin(cur, s);
        cur.elems.push({ kind: 'stmt', node: s });
        return cur;
      }
    }
  }

  tryStmt(s, cur) {
    cur = this.begin(cur, s);
    const outer = this.excTarget;
    const fin = s.finalbody.length ? { entry: this.newBlock('finally-abrupt'), normal: this.newBlock('finally'), pending: new Set() } : null;
    const dispatch = s.handlers.length ? this.newBlock('dispatch') : null;
    const afterExc = fin ? fin.entry : (outer || this.raise);
    this.finallyStack.push(fin);
    // try body
    this.excTarget = dispatch || afterExc;
    const start = this.newBlock();
    this.link(cur, start);
    this.link(start, this.excTarget, 'exc');
    const body0 = this.newBlock();
    this.link(start, body0);
    const ends = [];
    let be = this.stmts(s.body, body0);
    // else body: exceptions skip the handlers
    this.excTarget = fin ? fin.entry : outer;
    if (be && s.orelse.length) {
      const eb = this.newBlock();
      this.link(be, eb);
      be = this.stmts(s.orelse, eb);
    }
    if (be) ends.push(be);
    // handlers
    let catchAll = false;
    for (const h of s.handlers) {
      const hb = this.newBlock('handler');
      this.link(dispatch, hb, 'exc');
      hb.elems.push({ kind: 'except-bind', node: h });
      this.mark(h, hb);
      let he = this.stmts(h.body, hb);
      if (he && h.name) {
        if (he.cond) { const nb = this.newBlock(); this.link(he, nb); he = nb; }
        he.elems.push({ kind: 'except-unbind', node: h });
      }
      if (he) ends.push(he);
      if (!h.etype || /^(?:BaseException|builtins\.BaseException)$/.test(dotted(h.etype) || '')) catchAll = true;
    }
    if (dispatch && !catchAll) this.link(dispatch, afterExc, 'exc');
    this.excTarget = outer;
    this.finallyStack.pop();
    const after = this.newBlock();
    if (fin) {
      // normal completion and abrupt completion run separate copies of the
      // finally body, so a return inside try never continues after the try
      for (const e of ends) this.link(e, fin.normal);
      if (ends.length) {
        const fe = this.stmts(s.finalbody, fin.normal);
        if (fe) this.link(fe, after);
      }
      if (fin.entry.pred.length) {
        const fe2 = this.stmts(s.finalbody, fin.entry);
        if (fe2) {
          if (fin.entry.pred.some((p) => p.kind === 'exc')) this.link(fe2, outer || this.raise, 'exc');
          for (const t of fin.pending) this.jumpFromFinally(fe2, t);
        }
      }
      return after.pred.length ? after : null;
    }
    for (const e of ends) this.link(e, after);
    return after.pred.length ? after : null;
  }

  jumpFromFinally(fe, target) {
    // a pending jump continues to its target, through outer finally blocks
    const fins = this.finallyStack.filter(Boolean);
    if (fins.length && target === this.exit) {
      const f = fins[fins.length - 1];
      this.link(fe, f.entry);
      f.pending.add(target);
      return;
    }
    this.link(fe, target);
  }
}

function constTruth(e) {
  if (!e) return null;
  if (e.type === 'Constant') {
    if (e.kind === 'None') return false;
    if (e.kind === 'bool') return e.value;
    if (e.kind === 'int' || e.kind === 'float') return e.value !== 0;
    if (e.kind === 'str' || e.kind === 'bytes') return e.value.length > 0;
    if (e.kind === 'Ellipsis') return true;
  }
  if (e.type === 'UnaryOp' && e.op === 'USub') { const v = numValue(e); return v == null ? null : v !== 0; }
  if (e.type === 'UnaryOp' && e.op === 'Not') { const v = constTruth(e.operand); return v == null ? null : !v; }
  return null;
}

function alwaysTrue(e) { return constTruth(e) === true; }

function isIrrefutable(p) {
  if (!p) return false;
  if (p.type === 'MatchAs') return !p.pattern || isIrrefutable(p.pattern);
  if (p.type === 'MatchOr') return p.patterns.some(isIrrefutable);
  return false;
}

function buildCFG(fnNode, opts) {
  return new CFGBuilder(fnNode, opts).build();
}

// blocks reachable from entry
function reachable(cfg) {
  const seen = new Set([cfg.entry]);
  const stack = [cfg.entry];
  while (stack.length) {
    const b = stack.pop();
    for (const e of b.succ) if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
  }
  return seen;
}

module.exports = { buildCFG, reachable, constTruth, alwaysTrue, TERMINATING_CALLS };
