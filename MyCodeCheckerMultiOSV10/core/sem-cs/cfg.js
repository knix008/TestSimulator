'use strict';

// Control-flow graph per function body. Blocks hold "items" (statement nodes
// or synthetic markers) and end in either one successor, a two-way branch on
// `cond`, or an exit. Blocks inside a try region carry `exc` successors (catch
// entries or a throw path through finally). Finally blocks are copied per
// continuation so a `return` through finally never flows into code after the try.

let nextId = 1;

class Block {
  constructor(cfg) {
    this.id = nextId++;
    this.items = [];
    this.succ = [];
    this.cond = null;
    this.t = null;
    this.f = null;
    this.exc = [];
    this.loop = null;
    this.cfg = cfg;
    cfg.blocks.push(this);
  }
}

class CFG {
  constructor(fn) {
    this.fn = fn;
    this.blocks = [];
    this.entry = new Block(this);
    this.exit = new Block(this);
    this.exit.isExit = true;
    this.throwExit = new Block(this);
    this.throwExit.isExit = true;
    this.throwExit.isThrow = true;
    this.stmtBlock = new Map(); // statement node -> block where it starts
    this.loops = [];
    this.tooBig = false;
  }
}

function isTrueLit(e) {
  while (e && e.k === 'Paren') e = e.expr;
  return !!e && e.k === 'Literal' && e.kind === 'bool' && e.value === true;
}

class Builder {
  constructor(fn) {
    this.cfg = new CFG(fn);
    this.breakTargets = [];   // { node, target, finDepth }
    this.contTargets = [];
    this.tryStack = [];       // { catches: [Block], fin: AST|null, handler }
    this.labels = new Map();  // label -> Block
    this.pendingGotos = [];
    this.switchStack = [];
    this.count = 0;
  }

  newBlock() {
    if (++this.count > 20000) { this.cfg.tooBig = true; throw new Error('cfg too big'); }
    const b = new Block(this.cfg);
    // exceptional successors of the innermost try region
    const top = this.tryStack[this.tryStack.length - 1];
    if (top) b.exc = top.handlers();
    return b;
  }

  link(from, to) { if (from && to && !from.succ.includes(to)) from.succ.push(to); }

  branch(from, cond, t, f) {
    from.cond = cond;
    from.t = t;
    from.f = f;
    from.succ = [t, f].filter(Boolean);
  }

  build(body) {
    const cfg = this.cfg;
    let cur = this.newBlock();
    this.link(cfg.entry, cur);
    if (!body) { this.link(cur, cfg.exit); return cfg; }
    if (body.k === 'Block') cur = this.stmts(body.stmts, cur);
    else {
      // expression body
      cur.items.push({ k: 'ExprBody', expr: body, line: body.line, col: body.col });
      cfg.exprBody = true;
    }
    if (cur) this.link(cur, cfg.exit);
    for (const g of this.pendingGotos) {
      const target = this.labels.get(g.label);
      if (target) this.link(g.block, target);
      else this.link(g.block, cfg.exit);
    }
    return cfg;
  }

  stmts(list, cur) {
    for (const s of list) {
      if (!cur) {
        // unreachable sequence: still build it so its blocks exist (no predecessors)
        cur = this.newBlock();
        cur.dead = true;
      }
      cur = this.stmt(s, cur);
    }
    return cur;
  }

  // returns the block where control continues, or null when it never does
  stmt(s, cur) {
    this.cfg.stmtBlock.set(s, cur);
    switch (s.k) {
      case 'Block': return this.stmts(s.stmts, cur);
      case 'Empty': return cur;
      case 'ExprStmt': case 'LocalDecl': case 'LocalFunc':
        cur.items.push(s);
        return cur;
      case 'Labeled': {
        const b = this.newBlock();
        this.link(cur, b);
        this.labels.set(s.label, b);
        b.label = s.label;
        return this.stmt(s.stmt, b);
      }
      case 'If': {
        const t = this.newBlock(); const after = this.newBlock();
        const f = s.else ? this.newBlock() : after;
        this.branch(cur, s.cond, t, f);
        cur.branchNode = s;
        const te = this.stmt(s.then, t);
        if (te) this.link(te, after);
        if (s.else) { const fe = this.stmt(s.else, f); if (fe) this.link(fe, after); }
        return after;
      }
      case 'While': {
        const head = this.newBlock(); const body = this.newBlock(); const after = this.newBlock();
        this.link(cur, head);
        head.loop = s;
        this.cfg.loops.push({ node: s, head });
        if (isTrueLit(s.cond)) { head.items.push({ k: 'CondEval', expr: s.cond }); this.link(head, body); } else this.branch(head, s.cond, body, after);
        head.branchNode = s;
        this.breakTargets.push({ node: s, target: after, tryDepth: this.tryStack.length });
        this.contTargets.push({ node: s, target: head, tryDepth: this.tryStack.length });
        const be = this.stmt(s.body, body);
        if (be) this.link(be, head);
        this.breakTargets.pop(); this.contTargets.pop();
        return after;
      }
      case 'Do': {
        const body = this.newBlock(); const condB = this.newBlock(); const after = this.newBlock();
        this.link(cur, body);
        body.loop = s;
        this.cfg.loops.push({ node: s, head: body });
        this.breakTargets.push({ node: s, target: after, tryDepth: this.tryStack.length });
        this.contTargets.push({ node: s, target: condB, tryDepth: this.tryStack.length });
        const be = this.stmt(s.body, body);
        if (be) this.link(be, condB);
        this.breakTargets.pop(); this.contTargets.pop();
        if (isTrueLit(s.cond)) this.link(condB, body); else this.branch(condB, s.cond, body, after);
        condB.branchNode = s;
        return after;
      }
      case 'For': {
        for (const x of s.init) cur.items.push(x.k === 'LocalDecl' ? x : { k: 'ExprStmt', expr: x, line: x.line, col: x.col, synthetic: true });
        const head = this.newBlock(); const body = this.newBlock(); const step = this.newBlock(); const after = this.newBlock();
        this.link(cur, head);
        head.loop = s;
        this.cfg.loops.push({ node: s, head });
        if (!s.cond || isTrueLit(s.cond)) this.link(head, body); else this.branch(head, s.cond, body, after);
        head.branchNode = s;
        this.breakTargets.push({ node: s, target: after, tryDepth: this.tryStack.length });
        this.contTargets.push({ node: s, target: step, tryDepth: this.tryStack.length });
        const be = this.stmt(s.body, body);
        if (be) this.link(be, step);
        this.breakTargets.pop(); this.contTargets.pop();
        for (const x of s.step) step.items.push({ k: 'ExprStmt', expr: x, line: x.line, col: x.col, synthetic: true });
        this.link(step, head);
        return after;
      }
      case 'Foreach': {
        cur.items.push({ k: 'ForeachInit', node: s, line: s.line, col: s.col });
        const head = this.newBlock(); const body = this.newBlock(); const after = this.newBlock();
        this.link(cur, head);
        head.loop = s;
        this.cfg.loops.push({ node: s, head });
        this.branch(head, { k: 'ForeachNext', node: s, line: s.line, col: s.col }, body, after);
        head.branchNode = s;
        body.items.push({ k: 'ForeachAssign', node: s, line: s.line, col: s.col });
        this.breakTargets.push({ node: s, target: after, tryDepth: this.tryStack.length });
        this.contTargets.push({ node: s, target: head, tryDepth: this.tryStack.length });
        const be = this.stmt(s.body, body);
        if (be) this.link(be, head);
        this.breakTargets.pop(); this.contTargets.pop();
        return after;
      }
      case 'Switch': return this.switchStmt(s, cur);
      case 'Return': {
        cur.items.push(s);
        this.jumpOut(cur, this.cfg.exit, 0, 'return');
        return null;
      }
      case 'Throw': {
        cur.items.push(s);
        this.throwFrom(cur);
        return null;
      }
      case 'YieldBreak': {
        cur.items.push(s);
        this.jumpOut(cur, this.cfg.exit, 0, 'return');
        return null;
      }
      case 'YieldReturn': cur.items.push(s); return cur;
      case 'Break': {
        const t = this.breakTargets[this.breakTargets.length - 1];
        cur.items.push(s);
        if (t) this.jumpOut(cur, t.target, t.tryDepth, 'break'); else this.link(cur, this.cfg.exit);
        return null;
      }
      case 'Continue': {
        const t = this.contTargets[this.contTargets.length - 1];
        cur.items.push(s);
        if (t) this.jumpOut(cur, t.target, t.tryDepth, 'continue'); else this.link(cur, this.cfg.exit);
        return null;
      }
      case 'Goto': {
        cur.items.push(s);
        if (s.kind === 'label') this.pendingGotos.push({ block: cur, label: s.target });
        else {
          const sw = this.switchStack[this.switchStack.length - 1];
          if (sw) {
            const target = s.kind === 'default' ? sw.defaultBlock : sw.caseBlockFor(s.target);
            if (target) this.link(cur, target); else this.link(cur, this.cfg.exit);
          } else this.link(cur, this.cfg.exit);
        }
        return null;
      }
      case 'Lock': {
        cur.items.push({ k: 'LockEnter', node: s, line: s.line, col: s.col });
        const b = this.newBlock();
        this.link(cur, b);
        const e = this.stmt(s.body, b);
        if (!e) return null;
        e.items.push({ k: 'LockExit', node: s, line: s.line, col: s.col });
        return e;
      }
      case 'Using': {
        cur.items.push({ k: 'UsingEnter', node: s, line: s.line, col: s.col });
        const b = this.newBlock();
        this.link(cur, b);
        const e = this.stmt(s.body, b);
        if (!e) return null;
        const after = this.newBlock();
        after.items.push({ k: 'UsingExit', node: s, line: s.line, col: s.col });
        this.link(e, after);
        return after;
      }
      case 'Fixed': {
        cur.items.push(s.decl);
        return this.stmt(s.body, cur);
      }
      case 'CheckedStmt': return this.stmt(s.block, cur);
      case 'UnsafeStmt': return this.stmt(s.block, cur);
      case 'Try': return this.tryStmt(s, cur);
      default:
        cur.items.push(s);
        return cur;
    }
  }

  // jump to `target` leaving try regions deeper than `depth`, running their finally blocks
  jumpOut(from, target, depth, kind) {
    let cur = from;
    for (let k = this.tryStack.length - 1; k >= depth; k--) {
      const tr = this.tryStack[k];
      if (tr.fin && tr.inBody) {
        const fb = this.finallyCopy(tr, k);
        this.link(cur, fb.entry);
        cur = fb.exit;
        if (!cur) return;
      }
    }
    void kind;
    this.link(cur, target);
  }

  throwFrom(from) {
    // innermost try with catches gets it; finally copies on the way
    let cur = from;
    for (let k = this.tryStack.length - 1; k >= 0; k--) {
      const tr = this.tryStack[k];
      if (tr.catchBlocks.length && tr.inBody) {
        for (const c of tr.catchBlocks) this.link(cur, c);
        return;
      }
      if (tr.fin && (tr.inBody || tr.inCatch)) {
        const fb = this.finallyCopy(tr, k);
        this.link(cur, fb.entry);
        cur = fb.exit;
        if (!cur) return;
      }
    }
    this.link(cur, this.cfg.throwExit);
  }

  finallyCopy(tr, k) {
    // build the finally body with the try stack truncated below this try
    const saved = this.tryStack;
    this.tryStack = saved.slice(0, k);
    const entry = this.newBlock();
    entry.finallyOf = tr.node;
    let exit;
    try {
      exit = this.stmt(tr.fin, entry);
    } finally {
      this.tryStack = saved;
    }
    return { entry, exit };
  }

  tryStmt(s, cur) {
    const after = this.newBlock();
    const catchBlocks = s.catches.map(() => null);
    const tr = {
      node: s, fin: s.fin, catchBlocks: [], inBody: true, inCatch: false,
      handlers: null,
    };
    // catch entries are created first so blocks of the try body can point to them
    for (let i = 0; i < s.catches.length; i++) {
      const saved = this.tryStack;
      // catch entry blocks belong to the outer region
      const b = this.newBlock();
      b.items.push({ k: 'CatchEnter', node: s.catches[i], line: s.catches[i].line, col: s.catches[i].col });
      b.catchEntry = true;
      catchBlocks[i] = b;
      void saved;
    }
    tr.catchBlocks = catchBlocks;
    let finThrow = null;
    const self = this;
    tr.handlers = () => {
      if (tr.catchBlocks.length && tr.inBody) return tr.catchBlocks;
      if (tr.fin) {
        if (!finThrow) {
          const k = self.tryStack.indexOf(tr);
          const fb = self.finallyCopy(tr, k);
          if (fb.exit) {
            // after finally on the exceptional path, keep propagating
            const orig = self.tryStack;
            self.tryStack = orig.slice(0, k);
            try { self.throwFrom(fb.exit); } finally { self.tryStack = orig; }
          }
          finThrow = fb.entry;
          finThrow.exceptional = true;
        }
        return [finThrow];
      }
      const k = self.tryStack.indexOf(tr);
      const outer = self.tryStack[k - 1];
      return outer ? outer.handlers() : [];
    };
    this.tryStack.push(tr);
    const body = this.newBlock();
    body.tryEntry = s;
    this.link(cur, body);
    // the try entry state can reach the catches as well
    for (const c of catchBlocks) this.link(cur, c);
    cur.tryHead = s;
    let be;
    try {
      be = this.stmt(s.block, body);
    } finally {
      tr.inBody = false;
    }
    const ends = [];
    if (be) ends.push(be);
    tr.inCatch = true;
    for (let i = 0; i < s.catches.length; i++) {
      const c = s.catches[i];
      const ce = this.stmt(c.block, catchBlocks[i]);
      if (ce) ends.push(ce);
    }
    tr.inCatch = false;
    this.tryStack.pop();
    if (s.fin) {
      if (ends.length) {
        const k = this.tryStack.length;
        this.tryStack.push(tr);
        const fb = this.finallyCopy(tr, k);
        this.tryStack.pop();
        for (const e of ends) this.link(e, fb.entry);
        if (fb.exit) this.link(fb.exit, after); else return null;
        return after;
      }
      return null;
    }
    for (const e of ends) this.link(e, after);
    return ends.length ? after : null;
  }

  switchStmt(s, cur) {
    cur.items.push({ k: 'SwitchEval', node: s, line: s.line, col: s.col });
    const after = this.newBlock();
    const sectionBlocks = s.sections.map(() => this.newBlock());
    let defaultBlock = null;
    const caseMap = [];
    // test chain
    let test = cur;
    let hasDefault = false;
    for (let i = 0; i < s.sections.length; i++) {
      for (const lab of s.sections[i].labels) {
        if (lab.k === 'DefaultLabel') { defaultBlock = sectionBlocks[i]; hasDefault = true; continue; }
        caseMap.push({ lab, block: sectionBlocks[i] });
      }
    }
    for (const { lab, block } of caseMap) {
      const next = this.newBlock();
      this.branch(test, { k: 'CaseTest', sw: s, label: lab, line: lab.line, col: lab.col }, block, next);
      test = next;
    }
    this.link(test, hasDefault ? defaultBlock : after);
    this.switchStack.push({
      defaultBlock,
      caseBlockFor: (expr) => {
        for (const { lab, block } of caseMap) {
          const p = lab.pattern;
          if (p && p.k === 'ConstPattern' && p.expr && expr && p.expr.k === expr.k && p.expr.value === expr.value && p.expr.name === expr.name) return block;
        }
        return null;
      },
    });
    this.breakTargets.push({ node: s, target: after, tryDepth: this.tryStack.length });
    for (let i = 0; i < s.sections.length; i++) {
      const e = this.stmts(s.sections[i].stmts, sectionBlocks[i]);
      if (e) this.link(e, after); // fall-through is an error in C#; treat as leaving
    }
    this.breakTargets.pop();
    this.switchStack.pop();
    return after;
  }
}

function buildCFG(fn, body) {
  const b = new Builder(fn);
  try {
    return b.build(body);
  } catch (e) {
    if (b.cfg.tooBig) return null;
    throw e;
  }
}

function reachable(cfg) {
  const seen = new Set();
  const stack = [cfg.entry];
  while (stack.length) {
    const b = stack.pop();
    if (seen.has(b)) continue;
    seen.add(b);
    for (const s of b.succ) stack.push(s);
    for (const s of b.exc) stack.push(s);
  }
  return seen;
}

function preds(cfg) {
  const p = new Map();
  for (const b of cfg.blocks) p.set(b, []);
  for (const b of cfg.blocks) {
    for (const s of b.succ) p.get(s).push(b);
    for (const s of b.exc) if (p.has(s)) p.get(s).push(b);
  }
  return p;
}

module.exports = { buildCFG, reachable, preds };
