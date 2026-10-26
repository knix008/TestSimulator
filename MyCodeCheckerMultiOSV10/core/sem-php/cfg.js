'use strict';

// Per-function control flow graph. Blocks hold an ordered list of events
// produced by evaluating statements and expressions:
//   { t: 'use', sym, node }                       variable read
//   { t: 'def', sym, node, value, weak, nodead }  variable write
//   { t: 'kill', sym }                            value becomes unknown
//   { t: 'cond', node, kind }                     a condition is evaluated here
// Short-circuit and conditional sub-expressions produce weak defs (they may
// not happen). Exceptions inside `try` add edges to the catch / finally blocks.

const { unparen, forEachChild, FUNC_KINDS } = require('./ast');

class Block {
  constructor(id) {
    this.id = id;
    this.items = [];
    this.succ = [];
    this.preds = [];
  }
}

const tracked = (s) => !!s && !s.alias && s.kind !== 'global' && s.kind !== 'static';

class Builder {
  constructor(fn) {
    this.fn = fn;
    this.blocks = [];
    this.entry = this.newBlock();
    this.exit = this.newBlock();
    this.cur = this.entry;
    this.targets = [];
    this.handlers = [];
    this.unreachable = [];
    this.inTry = 0;
  }

  newBlock() {
    const b = new Block(this.blocks.length);
    this.blocks.push(b);
    return b;
  }

  edge(a, b) {
    if (!a || !b || a.succ.includes(b)) return;
    a.succ.push(b);
    b.preds.push(a);
  }

  ensure() {
    if (!this.cur) this.cur = this.newBlock();
    return this.cur;
  }

  push(item) { this.ensure().items.push(item); }

  handlerTargets() {
    return this.handlers.length ? this.handlers[this.handlers.length - 1] : [this.exit];
  }

  // ── statements
  stmts(list) { for (const s of list || []) this.stmt(s); }

  stmt(s) {
    if (!s) return;
    if (this.cur === null) {
      if (!['Label', 'FuncDecl', 'ClassDecl', 'Nop', 'InlineHTML', 'Const', 'Use', 'Namespace', 'Declare'].includes(s.k)) this.unreachable.push(s);
      this.cur = this.newBlock();
      this.cur.dead = true;
    }
    if (this.inTry && s.k !== 'Block') {
      const b = this.newBlock();
      this.edge(this.cur, b);
      this.cur = b;
      for (const h of this.handlerTargets()) this.edge(b, h);
    }
    switch (s.k) {
      case 'Block': this.stmts(s.stmts); return;
      case 'ExprStmt': {
        const e = unparen(s.e);
        this.expr(s.e, false);
        if (e.k === 'Throw') { for (const h of this.handlerTargets()) this.edge(this.cur, h); this.cur = null; }
        else if (e.k === 'Exit') { this.edge(this.cur, this.exit); this.cur = null; }
        return;
      }
      case 'Echo': for (const a of s.args) this.expr(a, false); return;
      case 'Return':
        if (s.e) this.expr(s.e, false);
        this.edge(this.cur, this.exit);
        this.cur = null;
        return;
      case 'If': return this.ifStmt(s);
      case 'While': return this.whileStmt(s);
      case 'DoWhile': return this.doStmt(s);
      case 'For': return this.forStmt(s);
      case 'Foreach': return this.foreachStmt(s);
      case 'Switch': return this.switchStmt(s);
      case 'Break': case 'Continue': {
        const loops = this.targets;
        const t = loops[loops.length - Math.max(1, s.levels || 1)];
        if (t) this.edge(this.cur, s.k === 'Break' ? t.brk : t.cont);
        else this.edge(this.cur, this.exit);
        this.cur = null;
        return;
      }
      case 'Try': return this.tryStmt(s);
      case 'Static':
        for (const v of s.vars) { if (v.init) this.expr(v.init, false); if (v.v && v.v.sym) this.push({ t: 'kill', sym: v.v.sym }); }
        return;
      case 'Global': for (const v of s.vars) if (v.sym) this.push({ t: 'kill', sym: v.sym }); return;
      case 'Unset':
        for (const a of s.args) {
          const x = unparen(a);
          if (x.k === 'Var' && tracked(x.sym)) this.push({ t: 'def', sym: x.sym, node: x, value: null, weak: false, nodead: true });
          else this.expr(a, false);
        }
        return;
      case 'Declare': if (s.body) this.stmt(s.body); return;
      case 'Namespace': if (s.stmts) this.stmts(s.stmts); return;
      case 'Label': { const b = this.newBlock(); this.edge(this.cur, b); this.cur = b; return; }
      case 'Goto': this.cur = null; return;
      case 'Const': for (const it of s.items) this.expr(it.value, false); return;
      default: return; // FuncDecl, ClassDecl, Nop, InlineHTML, Use, HaltCompiler
    }
  }

  ifStmt(s) {
    this.expr(s.cond, false);
    this.push({ t: 'cond', node: s.cond, kind: 'if' });
    const head = this.cur;
    const thenB = this.newBlock();
    this.edge(head, thenB);
    this.cur = thenB;
    this.stmt(s.then);
    const endThen = this.cur;
    let endElse = head;
    if (s.else) {
      const elseB = this.newBlock();
      this.edge(head, elseB);
      this.cur = elseB;
      this.stmt(s.else);
      endElse = this.cur;
    }
    if (!endThen && !endElse) { this.cur = null; return; }
    const join = this.newBlock();
    this.edge(endThen, join);
    this.edge(endElse, join);
    this.cur = join;
  }

  loopBody(body, brk, cont) {
    this.targets.push({ brk, cont });
    this.stmt(body);
    this.targets.pop();
  }

  after(b) {
    this.cur = b.preds.length ? b : null;
  }

  whileStmt(s) {
    const header = this.newBlock();
    this.edge(this.cur, header);
    this.cur = header;
    this.expr(s.cond, false);
    this.push({ t: 'cond', node: s.cond, kind: 'while' });
    const condEnd = this.cur;
    const bodyB = this.newBlock();
    const after = this.newBlock();
    this.edge(condEnd, bodyB);
    if (!isTrueLit(s.cond)) this.edge(condEnd, after);
    this.cur = bodyB;
    this.loopBody(s.body, after, header);
    this.edge(this.cur, header);
    this.after(after);
  }

  doStmt(s) {
    const bodyB = this.newBlock();
    this.edge(this.cur, bodyB);
    const condB = this.newBlock();
    const after = this.newBlock();
    this.cur = bodyB;
    this.loopBody(s.body, after, condB);
    this.edge(this.cur, condB);
    this.cur = condB;
    this.expr(s.cond, false);
    this.push({ t: 'cond', node: s.cond, kind: 'while' });
    this.edge(this.cur, bodyB);
    if (!isTrueLit(s.cond) && !isFalseLit(s.cond)) this.edge(this.cur, after);
    else if (isFalseLit(s.cond)) { this.cur.succ = this.cur.succ.filter((b) => b !== bodyB); bodyB.preds = bodyB.preds.filter((b) => b !== this.cur); this.edge(this.cur, after); }
    this.after(after);
  }

  forStmt(s) {
    for (const e of s.init) this.expr(e, false);
    const header = this.newBlock();
    this.edge(this.cur, header);
    this.cur = header;
    s.cond.forEach((e, i) => {
      this.expr(e, false);
      if (i === s.cond.length - 1) this.push({ t: 'cond', node: e, kind: 'for' });
    });
    const condEnd = this.cur;
    const bodyB = this.newBlock();
    const stepB = this.newBlock();
    const after = this.newBlock();
    this.edge(condEnd, bodyB);
    if (s.cond.length && !isTrueLit(s.cond[s.cond.length - 1])) this.edge(condEnd, after);
    this.cur = bodyB;
    this.loopBody(s.body, after, stepB);
    this.edge(this.cur, stepB);
    this.cur = stepB;
    for (const e of s.step) this.expr(e, false);
    this.edge(this.cur, header);
    this.after(after);
  }

  foreachStmt(s) {
    this.expr(s.e, false);
    const header = this.newBlock();
    this.edge(this.cur, header);
    const bodyB = this.newBlock();
    const after = this.newBlock();
    this.edge(header, bodyB);
    this.edge(header, after);
    this.cur = bodyB;
    if (s.key) this.target(s.key);
    this.target(s.value);
    this.loopBody(s.body, after, header);
    this.edge(this.cur, header);
    this.after(after);
  }

  // destructuring / foreach target: defs that are never reported as dead
  target(e) {
    e = unparen(e);
    if (!e) return;
    if (e.k === 'Var') { if (tracked(e.sym)) this.push({ t: 'def', sym: e.sym, node: e, value: null, weak: false, nodead: true }); return; }
    if (e.k === 'Arr' || e.k === 'ListX') {
      for (const it of e.items) {
        if (!it) continue;
        if (it.key) this.expr(it.key, false);
        this.target(it.value);
      }
      return;
    }
    if (e.k === 'Unary' && e.op === '&') { this.target(e.e); return; }
    this.expr(e, false);
  }

  switchStmt(s) {
    this.expr(s.disc, false);
    const after = this.newBlock();
    let prevEnd = null;
    let hasDefault = false;
    this.targets.push({ brk: after, cont: after });
    for (const c of s.cases) {
      if (c.test) this.expr(c.test, true); else hasDefault = true;
      const dispatch = this.ensure();
      const caseB = this.newBlock();
      this.edge(dispatch, caseB);
      this.edge(prevEnd, caseB);
      this.cur = caseB;
      this.stmts(c.body);
      prevEnd = this.cur;
      this.cur = dispatch;
    }
    this.targets.pop();
    this.edge(prevEnd, after);
    if (!hasDefault) this.edge(this.cur, after);
    this.after(after);
  }

  tryStmt(s) {
    const catchBs = s.catches.map(() => this.newBlock());
    const finB = s.fin ? this.newBlock() : null;
    const outer = this.handlerTargets();
    const hs = catchBs.length ? catchBs.slice() : [];
    if (finB) hs.push(finB);
    if (!hs.length) hs.push(...outer);
    const start = this.newBlock();
    this.edge(this.cur, start);
    for (const h of hs) this.edge(start, h);
    this.cur = start;
    this.handlers.push(hs);
    this.inTry++;
    this.stmt(s.block);
    this.inTry--;
    this.handlers.pop();
    const ends = [this.cur];
    s.catches.forEach((c, i) => {
      this.cur = catchBs[i];
      if (finB) this.edge(catchBs[i], finB);
      if (c.v) this.target(c.v);
      if (finB) { this.handlers.push([finB]); this.inTry++; }
      this.stmt(c.body);
      if (finB) { this.inTry--; this.handlers.pop(); }
      ends.push(this.cur);
    });
    if (finB) {
      for (const e of ends) this.edge(e, finB);
      this.cur = finB;
      this.stmt(s.fin);
      if (this.cur) for (const h of outer) this.edge(this.cur, h);
      if (!ends.some(Boolean) && this.cur) {
        // finally reached only by exceptions / returns: code after it is still reached conservatively
      }
      return;
    }
    const live = ends.filter(Boolean);
    if (!live.length) { this.cur = null; return; }
    const join = this.newBlock();
    for (const e of live) this.edge(e, join);
    this.cur = join;
  }

  // ── expressions
  expr(e, weak) {
    if (!e) return;
    switch (e.k) {
      case 'Var':
        if (tracked(e.sym)) this.push({ t: 'use', sym: e.sym, node: e });
        return;
      case 'Paren': this.expr(e.e, weak); return;
      case 'Assign': return this.assign(e, weak);
      case 'Incr': {
        const x = unparen(e.e);
        if (x.k === 'Var') {
          if (tracked(x.sym)) {
            this.push({ t: 'use', sym: x.sym, node: x });
            this.push({ t: 'def', sym: x.sym, node: e, value: null, weak, nodead: true, incr: e });
          }
        } else this.expr(e.e, weak);
        return;
      }
      case 'Bin':
        if (e.op === '&&' || e.op === '||' || e.op === 'and' || e.op === 'or') {
          this.expr(e.l, weak);
          this.push({ t: 'cond', node: e.l, kind: 'operand', parent: e });
          this.expr(e.r, true);
          this.push({ t: 'cond', node: e.r, kind: 'operand', parent: e });
          return;
        }
        if (e.op === '??') { this.expr(e.l, weak); this.expr(e.r, true); return; }
        this.expr(e.l, weak);
        this.expr(e.r, weak);
        return;
      case 'Ternary':
        this.expr(e.c, weak);
        this.push({ t: 'cond', node: e.c, kind: 'ternary' });
        if (e.t) this.expr(e.t, true);
        this.expr(e.f, true);
        return;
      case 'Match':
        this.expr(e.subject, weak);
        for (const a of e.arms) {
          for (const c of a.conds || []) this.expr(c, true);
          this.expr(a.body, true);
        }
        return;
      case 'Call': case 'MCall': case 'SCall': case 'New': {
        forEachChild(e, (c) => this.expr(c, weak));
        for (const a of e.args || []) {
          const x = unparen(a.e);
          if (x && x.k === 'Var' && tracked(x.sym)) this.push({ t: 'kill', sym: x.sym });
        }
        return;
      }
      case 'Closure':
        for (const u of e.uses) if (u.outer && tracked(u.outer)) this.push({ t: 'use', sym: u.outer, node: u });
        return;
      case 'ArrowFn': {
        const visit = (n) => {
          if (n.k === 'Var' && n.captured && tracked(n.sym)) this.push({ t: 'use', sym: n.sym, node: n });
          if (n.k === 'ClassDecl') return;
          forEachChild(n, visit);
        };
        visit(e.body);
        return;
      }
      case 'ClassDecl': case 'FuncDecl': return;
      default:
        if (FUNC_KINDS.has(e.k)) return;
        forEachChild(e, (c) => this.expr(c, weak));
    }
  }

  assign(e, weak) {
    const l = e.l;
    if (e.byRef) {
      this.expr(e.r, weak);
      this.killAll(l);
      this.killAll(e.r);
      return;
    }
    if (l.k === 'Var') {
      if (e.op === '=') {
        this.expr(e.r, weak);
        if (tracked(l.sym)) this.push({ t: 'def', sym: l.sym, node: e, value: e.r, weak, nodead: false });
      } else {
        if (tracked(l.sym)) this.push({ t: 'use', sym: l.sym, node: l });
        this.expr(e.r, weak || e.op === '??=');
        if (tracked(l.sym)) this.push({ t: 'def', sym: l.sym, node: e, value: null, weak: weak || e.op === '??=', nodead: false, compound: true });
      }
      return;
    }
    if (l.k === 'Arr' || l.k === 'ListX') {
      this.expr(e.r, weak);
      this.target(l);
      return;
    }
    // $a[...] = v, $o->p = v, Foo::$x = v
    this.expr(e.r, weak);
    this.expr(l, weak);
    let base = l;
    while (base && (base.k === 'Index' || base.k === 'Prop')) base = unparen(base.obj);
    if (base && base.k === 'Var' && tracked(base.sym)) this.push({ t: 'kill', sym: base.sym });
  }

  killAll(n) {
    const visit = (x) => {
      if (x.k === 'Var' && tracked(x.sym)) this.push({ t: 'kill', sym: x.sym });
      forEachChild(x, visit);
    };
    if (n) visit(n);
  }
}

function isTrueLit(e) {
  e = unparen(e);
  return !!e && e.k === 'Lit' && ((e.kind === 'bool' && e.value === true) || (e.kind === 'int' && e.value === 1));
}
function isFalseLit(e) {
  e = unparen(e);
  return !!e && e.k === 'Lit' && ((e.kind === 'bool' && e.value === false) || (e.kind === 'int' && e.value === 0));
}

function buildCFG(fn) {
  const b = new Builder(fn);
  if (fn.k === 'Program') b.stmts(fn.stmts);
  else if (fn.body && fn.body.k === 'Block') b.stmt(fn.body);
  else return null;
  b.edge(b.cur, b.exit);
  return { blocks: b.blocks, entry: b.entry, exit: b.exit, unreachable: b.unreachable };
}

module.exports = { buildCFG, tracked };
