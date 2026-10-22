'use strict';

// Statement-level control-flow graph of one method body (Java or Kotlin AST).
//
// Node { id, k, succ: [Node], esucc: [Node]|null, ast, ... }
//   entry / exit / exc (exceptional exit)
//   eval    evaluates `e` (expression statement, update, resource, ...)
//   local   declares `vars` (each with init)
//   branch  evaluates `e`; succ[0] when true, succ[1] when false
//   return  evaluates optional `e`, then leaves (through finally blocks)
//   throw   evaluates `e`, then goes to the handlers in esucc
//   switch  evaluates `e`, succ = case entries (+ next without default)
//   foreach assigns the loop variables; succ = [body, next]
//   catch   binds the exception variable `name`
//   case    binds pattern variables of a Java case
//   rethrow end of a finally copy on the exceptional path
//   nop
// Exceptional edges: nodes whose expressions may throw get esucc = the catch
// entries / finally copy of the enclosing try, or the method's exc node.

const A = require('./ast');

let SYN = 0;

function mayThrow(e) {
  if (!e) return false;
  return !!A.find(e, (x) => x.k === 'Call' || x.k === 'New' || x.k === 'Throw' || x.k === 'Idx' || (x.k === 'Bin' && (x.op === '/' || x.op === '%')) || x.k === 'Cast' || (x.k === 'Un' && x.op === '!!'),
    { noLambda: true, noClass: true });
}

class Builder {
  constructor() {
    this.nodes = [];
    this.frames = [];
    this.excNode = null;
  }

  mk(k, props, mayThrowExpr) {
    const n = { id: this.nodes.length, k, succ: [], esucc: null };
    if (props) Object.assign(n, props);
    this.nodes.push(n);
    if (mayThrowExpr !== undefined && mayThrowExpr !== null && mayThrowExpr !== false) {
      const e = mayThrowExpr === true ? null : mayThrowExpr;
      if (mayThrowExpr === true || mayThrow(e)) n.esucc = this.excTargets();
    }
    return n;
  }

  excTargets() {
    const out = [];
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i];
      if (f.kind !== 'try') continue;
      for (const c of f.catches) out.push(c);
      if (f.catchAll) return out;
      if (f.finExc) { out.push(f.finExc); return out; }
    }
    out.push(this.excNode);
    return out;
  }

  // Build `stmts` in sequence, flowing into `next`.
  list(stmts, next) {
    let cur = next;
    for (let i = stmts.length - 1; i >= 0; i--) cur = this.stmt(stmts[i], cur);
    return cur;
  }

  withFrames(depth, fn) {
    const saved = this.frames;
    this.frames = saved.slice(0, depth);
    try {
      return fn();
    } finally {
      this.frames = saved;
    }
  }

  // Target node for a jump to frame index `targetIdx` (exclusive of finally
  // blocks at or below it), threading through crossed finally blocks.
  jumpTarget(targetIdx, target) {
    let t = target;
    const fins = [];
    for (let i = this.frames.length - 1; i > targetIdx; i--) {
      const f = this.frames[i];
      if (f.fin) fins.push({ fin: f.fin, depth: i });
    }
    for (let k = fins.length - 1; k >= 0; k--) {
      const { fin, depth } = fins[k];
      const tt = t;
      t = this.withFrames(depth, () => this.list(fin.stmts, tt));
    }
    return t;
  }

  findLoop(label, forContinue) {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i];
      if (forContinue) {
        if (f.kind === 'loop' && (!label || f.label === label)) return i;
      } else if ((f.kind === 'loop' || f.kind === 'switch') && !label) return i;
      else if (label && (f.kind === 'loop' || f.kind === 'label') && f.label === label) return i;
    }
    return -1;
  }

  stmt(s, next) {
    if (!s) return next;
    switch (s.k) {
      case 'Block': return this.list(s.stmts, next);
      case 'Empty':
      case 'LocalClass':
      case 'LocalFun':
        return next;
      case 'ExprStmt': {
        const n = this.mk('eval', { e: s.e, ast: s, line: s.line }, s.e);
        n.succ = [next];
        return n;
      }
      case 'Assert': {
        const n = this.mk('eval', { e: s.c, ast: s, line: s.line, assert: true });
        n.succ = [next];
        return n;
      }
      case 'Local': {
        const n = this.mk('local', { vars: s.vars, ast: s, line: s.line, init: s.init || null, delegate: s.delegate || null }, s);
        n.succ = [next];
        return n;
      }
      case 'If': {
        const n = this.mk('branch', { e: s.c, ast: s, line: s.c ? s.c.line : s.line }, s.c);
        n.succ = [this.stmt(s.t, next), s.f ? this.stmt(s.f, next) : next];
        return n;
      }
      case 'While': {
        const cond = this.mk('branch', { e: s.c, ast: s, line: s.c.line, loop: true }, s.c);
        this.frames.push({ kind: 'loop', label: s.label || null, breakT: next, contT: cond });
        const body = this.stmt(s.body, cond);
        this.frames.pop();
        cond.succ = [body, next];
        return cond;
      }
      case 'Do': {
        const cond = this.mk('branch', { e: s.c, ast: s, line: s.c.line, loop: true }, s.c);
        this.frames.push({ kind: 'loop', label: s.label || null, breakT: next, contT: cond });
        const body = this.stmt(s.body, cond);
        this.frames.pop();
        cond.succ = [body, next];
        const head = this.mk('nop', { ast: s, loop: true, line: s.line });
        head.succ = [body];
        return head;
      }
      case 'For': {
        const head = s.c ? this.mk('branch', { e: s.c, ast: s, line: s.c.line, loop: true }, s.c) : this.mk('nop', { ast: s, loop: true, line: s.line });
        let upd = head;
        for (let i = s.upd.length - 1; i >= 0; i--) {
          const u = this.mk('eval', { e: s.upd[i], ast: s, line: s.upd[i].line }, s.upd[i]);
          u.succ = [upd];
          upd = u;
        }
        this.frames.push({ kind: 'loop', label: s.label || null, breakT: next, contT: upd });
        const body = this.stmt(s.body, upd);
        this.frames.pop();
        head.succ = s.c ? [body, next] : [body];
        return this.list(s.init, head);
      }
      case 'ForEach': {
        const head = this.mk('foreach', { vars: s.vars, ast: s, line: s.line, loop: true, iter: s.iter });
        this.frames.push({ kind: 'loop', label: s.label || null, breakT: next, contT: head });
        const body = this.stmt(s.body, head);
        this.frames.pop();
        head.succ = [body, next];
        const it = this.mk('eval', { e: s.iter, ast: s, line: s.iter.line, deref: s.iter, iterOf: s }, s.iter);
        it.succ = [head];
        return it;
      }
      case 'Labeled': {
        const body = s.body;
        if (body && (body.k === 'While' || body.k === 'Do' || body.k === 'For' || body.k === 'ForEach')) {
          return this.stmt(Object.assign({}, body, { label: s.label }), next);
        }
        this.frames.push({ kind: 'label', label: s.label, breakT: next });
        const n = this.stmt(body, next);
        this.frames.pop();
        return n;
      }
      case 'Break': {
        const idx = this.findLoop(s.label, false);
        const n = this.mk('nop', { ast: s, line: s.line, jump: 'break' });
        n.succ = [idx >= 0 ? this.jumpTarget(idx, this.frames[idx].breakT) : next];
        return n;
      }
      case 'Continue': {
        const idx = this.findLoop(s.label, true);
        const n = this.mk('nop', { ast: s, line: s.line, jump: 'continue' });
        n.succ = [idx >= 0 ? this.jumpTarget(idx, this.frames[idx].contT) : next];
        return n;
      }
      case 'Yield': {
        const n = this.mk('eval', { e: s.e, ast: s, line: s.line }, s.e);
        const idx = this.findLoop(null, false);
        n.succ = [idx >= 0 ? this.jumpTarget(idx, this.frames[idx].breakT) : next];
        return n;
      }
      case 'Return': {
        const n = this.mk('return', { e: s.e, ast: s, line: s.line }, s.e);
        n.succ = [this.jumpTarget(-1, this.exitNode)];
        return n;
      }
      case 'Throw': {
        const n = this.mk('throw', { e: s.e, ast: s, line: s.line });
        n.esucc = this.excTargets();
        n.succ = [];
        return n;
      }
      case 'Sync': {
        const n = this.mk('eval', { e: s.lock, ast: s, line: s.line, deref: s.lock, sync: true }, s.lock);
        n.succ = [this.stmt(s.body, next)];
        return n;
      }
      case 'Try': return this.tryStmt(s, next);
      case 'Switch': return s.kt ? this.whenStmt(s, next) : this.switchStmt(s, next);
      default: {
        const n = this.mk('nop', { ast: s, line: s.line });
        n.succ = [next];
        return n;
      }
    }
  }

  tryStmt(s, next) {
    const depth = this.frames.length;
    const normalNext = s.fin ? this.list(s.fin.stmts, next) : next;
    let finExc = null;
    if (s.fin) {
      const rethrow = this.mk('rethrow', { ast: s, line: s.fin.line });
      rethrow.esucc = this.excTargets();
      finExc = this.withFrames(depth, () => this.list(s.fin.stmts, rethrow));
      if (finExc === rethrow) finExc = rethrow;
    }
    const catchAll = s.catches.some((c) => c.types.some((t) => ['Exception', 'Throwable'].includes(A.typeName(t))));
    // catch blocks run inside the finally scope only
    this.frames.push({ kind: 'try', catches: [], catchAll: false, finExc, fin: s.fin });
    const catches = s.catches.map((c) => {
      const n = this.mk('catch', { name: c.name, types: c.types, ast: c, line: c.line });
      n.succ = [this.list(c.body.stmts, normalNext)];
      return n;
    });
    this.frames.pop();
    this.frames.push({ kind: 'try', catches, catchAll, finExc, fin: s.fin });
    let body = this.list(s.body.stmts, normalNext);
    for (let i = s.res.length - 1; i >= 0; i--) {
      const r = s.res[i];
      const n = r.k === 'Local'
        ? this.mk('local', { vars: r.vars, ast: r, line: r.line, twr: true }, true)
        : this.mk('eval', { e: r.e, ast: r, line: r.line, twr: true }, true);
      n.succ = [body];
      body = n;
    }
    this.frames.pop();
    const head = this.mk('nop', { ast: s, line: s.line, tryHead: true });
    head.succ = [body];
    return head;
  }

  switchStmt(s, next) {
    const sw = this.mk('switch', { e: s.sel, ast: s, line: s.line }, s.sel);
    this.frames.push({ kind: 'switch', breakT: next });
    const entries = [];
    let fall = next;
    for (let i = s.cases.length - 1; i >= 0; i--) {
      const c = s.cases[i];
      const body = this.list(c.body, c.arrow ? next : fall);
      const ce = this.mk('case', { ast: c, line: c.line, labels: c.labels, guard: c.guard });
      ce.succ = [body];
      entries.unshift(ce);
      fall = body;
    }
    this.frames.pop();
    const hasDefault = s.cases.some((c) => c.dflt);
    sw.succ = hasDefault ? entries : entries.concat([next]);
    return sw;
  }

  // Kotlin when: chain of conditions so path-sensitive analysis can learn
  // from `when { x == null -> ... }` and `when (x) { null -> ... }`.
  whenStmt(s, next) {
    let subj = null;
    let pre = null;
    if (s.sel) {
      const ss = A.strip(s.sel);
      if (s.selVar) subj = { k: 'Name', id: s.selVar.name, line: s.line, col: s.col, s: s.s, en: s.s };
      else if (ss.k === 'Name' || (ss.k === 'Sel' && ss.o.k === 'This')) subj = ss;
      else subj = { k: 'Name', id: '$when' + (++SYN), line: s.line, col: s.col, s: s.s, en: s.s, synthetic: true };
      if (s.selVar || subj.synthetic) {
        const v = { k: 'Var', name: subj.id, init: s.sel, line: s.line, col: s.col, synthetic: true };
        pre = this.mk('local', { vars: [v], ast: s, line: s.line, synthetic: true }, s.sel);
      }
    }
    let cur = next;
    const dflt = s.cases.find((c) => c.dflt);
    if (dflt) cur = this.list(dflt.body, next);
    for (let i = s.cases.length - 1; i >= 0; i--) {
      const c = s.cases[i];
      if (c.dflt) continue;
      let cond = null;
      for (const lab of c.labels) {
        const one = whenCond(subj, lab);
        cond = cond ? { k: 'Bin', op: '||', l: cond, r: one, line: lab.line, col: lab.col, s: lab.s, en: lab.en, synthetic: true } : one;
      }
      const br = this.mk('branch', { e: cond, ast: c, line: c.line, when: true, labels: c.labels }, cond);
      br.succ = [this.list(c.body, next), cur];
      cur = br;
    }
    if (pre) { pre.succ = [cur]; return pre; }
    return cur;
  }
}

function whenCond(subj, lab) {
  const base = { line: lab.line, col: lab.col, s: lab.s, en: lab.en, synthetic: true };
  if (lab.k === 'IsPat') return Object.assign({ k: 'InstOf', e: subj, type: lab.type, neg: lab.neg, fromWhen: true }, base);
  if (lab.k === 'InPat') return Object.assign({ k: 'Bin', op: lab.neg ? '!in' : 'in', l: subj, r: lab.e }, base);
  if (!subj) return lab;
  return Object.assign({ k: 'Bin', op: '==', l: subj, r: lab, whenLabel: true }, base);
}

function buildCFG(method) {
  const b = new Builder();
  const entry = b.mk('entry', { line: method.line });
  const exit = b.mk('exit', { line: method.body ? method.body.el : method.line });
  const exc = b.mk('exc', {});
  b.exitNode = exit;
  b.excNode = exc;
  const body = method.body;
  const stmts = body ? (body.k === 'Block' ? body.stmts : [{ k: 'Return', e: body, line: body.line, col: body.col, s: body.s, en: body.en, implicit: true }]) : [];
  entry.succ = [b.list(stmts, exit)];
  const cfg = { nodes: b.nodes, entry, exit, exc };
  markReachable(cfg);
  return cfg;
}

function markReachable(cfg) {
  const seen = new Uint8Array(cfg.nodes.length);
  const stack = [cfg.entry];
  seen[cfg.entry.id] = 1;
  while (stack.length) {
    const n = stack.pop();
    for (const s of n.succ) if (s && !seen[s.id]) { seen[s.id] = 1; stack.push(s); }
    if (n.esucc) for (const s of n.esucc) if (s && !seen[s.id]) { seen[s.id] = 1; stack.push(s); }
  }
  for (const n of cfg.nodes) n.reach = !!seen[n.id];
  // predecessors
  for (const n of cfg.nodes) n.pred = [];
  for (const n of cfg.nodes) {
    if (!n.reach) continue;
    for (const s of n.succ) if (s) s.pred.push(n);
    if (n.esucc) for (const s of n.esucc) if (s) s.pred.push(n);
  }
}

module.exports = { buildCFG, mayThrow };
