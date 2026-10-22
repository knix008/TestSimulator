'use strict';

// Control-flow graph per function (or program). Blocks hold evaluation
// elements (expressions, declarators, return / throw statements and a few
// synthetic markers); a block ends with an optional branch test. Exception
// flow is modelled by `block.handler` (innermost catch / finally entry).

const { staticValue } = require('./walk');

class Block {
  constructor(id, handler) {
    this.id = id;
    this.elements = [];
    this.stmts = [];
    this.succ = [];
    this.pred = [];
    this.test = null;
    this.testKind = null;
    this.trueSucc = null;
    this.falseSucc = null;
    this.handler = handler || null;
    this.reachable = false;
  }
}

function constTruth(test) {
  if (!test) return null;
  const v = staticValue(test);
  if (!v) {
    if (test.type === 'ArrayExpression' || test.type === 'ObjectExpression' || test.type === 'ArrowFunctionExpression' || test.type === 'FunctionExpression') return true;
    return null;
  }
  return !!v.value;
}

class Builder {
  constructor(root) {
    this.root = root;
    this.blocks = [];
    this.loops = [];
    this.handlers = [];
    this.finallys = [];
    this.pendingLabels = [];
    this.exit = new Block(-1, null);
  }

  newBlock() {
    const b = new Block(this.blocks.length, this.handlers.length ? this.handlers[this.handlers.length - 1] : null);
    this.blocks.push(b);
    return b;
  }

  link(a, b) {
    if (!a || !b) return;
    a.succ.push(b);
    b.pred.push(a);
  }

  branch(cur, test, kind, t, f) {
    cur.test = test;
    cur.testKind = kind;
    const c = constTruth(test);
    cur.trueSucc = c === false ? null : t;
    cur.falseSucc = c === true ? null : f;
    this.link(cur, cur.trueSucc);
    this.link(cur, cur.falseSucc);
  }

  build() {
    const root = this.root;
    const entry = this.newBlock();
    this.entry = entry;
    let cur = entry;
    if (root.type !== 'Program') {
      entry.elements.push({ type: 'Params', node: root, start: root.start, end: root.start });
      if (root.body && root.body.type === 'BlockStatement') cur = this.stmts(root.body.body, cur);
      else if (root.body) { cur.elements.push({ type: 'ReturnStatement', argument: root.body, start: root.body.start, end: root.body.end, implicit: true }); this.link(cur, this.exit); cur = null; }
    } else cur = this.stmts(root.body, cur);
    if (cur) { this.link(cur, this.exit); cur.fallsOff = true; }
    this.fallsOff = !!cur;
    // reachability (normal + exception edges)
    const stack = [entry];
    entry.reachable = true;
    while (stack.length) {
      const b = stack.pop();
      const next = b.handler ? b.succ.concat([b.handler]) : b.succ;
      for (const s of next) if (!s.reachable) { s.reachable = true; stack.push(s); }
    }
    this.exit.reachable = this.exit.pred.some((p) => p.reachable);
    return { entry, exit: this.exit, blocks: this.blocks, root, fallsOff: this.exit.pred.some((p) => p.reachable && p.fallsOff) };
  }

  stmts(list, cur) {
    for (const s of list) {
      if (!cur) cur = this.newBlock();
      cur = this.stmt(s, cur);
    }
    return cur;
  }

  targetFor(kind, label) {
    for (let i = this.loops.length - 1; i >= 0; i--) {
      const l = this.loops[i];
      if (label) {
        if (l.labels.includes(label)) return l;
        continue;
      }
      if (kind === 'continue' && (l.isSwitch || l.labelOnly)) continue;
      if (kind === 'break' && l.labelOnly) continue;
      return l;
    }
    return null;
  }

  jump(cur, target, depth) {
    if (this.finallys.length > depth) {
      const fin = this.finallys[this.finallys.length - 1];
      this.link(cur, fin.entry);
      fin.targets.add(target);
    } else this.link(cur, target);
  }

  throwFrom(cur) {
    const h = this.handlers.length ? this.handlers[this.handlers.length - 1] : null;
    this.link(cur, h || this.exit);
    cur.throws = true;
  }

  loopStart(entry) {
    const labels = this.pendingLabels;
    this.pendingLabels = [];
    entry.finallyDepth = this.finallys.length;
    entry.labels = labels;
    this.loops.push(entry);
  }

  stmt(s, cur) {
    cur.stmts.push(s);
    switch (s.type) {
      case 'BlockStatement': return this.stmts(s.body, cur);
      case 'ExpressionStatement': cur.elements.push(s.expression); return cur;
      case 'VariableDeclaration':
        for (const d of s.declarations) cur.elements.push(d);
        return cur;
      case 'ReturnStatement':
        cur.elements.push(s);
        this.jump(cur, this.exit, 0);
        return null;
      case 'ThrowStatement':
        cur.elements.push(s);
        this.throwFrom(cur);
        return null;
      case 'IfStatement': {
        const t = this.newBlock();
        const f = this.newBlock();
        this.branch(cur, s.test, 'if', t, f);
        const tEnd = this.stmt(s.consequent, t);
        const fEnd = s.alternate ? this.stmt(s.alternate, f) : f;
        if (!tEnd && !fEnd) return null;
        const join = this.newBlock();
        this.link(tEnd, join);
        this.link(fEnd, join);
        return join;
      }
      case 'WhileStatement': {
        const testB = this.newBlock();
        this.link(cur, testB);
        const body = this.newBlock();
        const after = this.newBlock();
        this.branch(testB, s.test, 'loop', body, after);
        this.loopStart({ breakTo: after, continueTo: testB });
        const end = this.stmt(s.body, body);
        this.link(end, testB);
        this.loops.pop();
        return after;
      }
      case 'DoWhileStatement': {
        const body = this.newBlock();
        this.link(cur, body);
        const testB = this.newBlock();
        const after = this.newBlock();
        this.loopStart({ breakTo: after, continueTo: testB });
        const end = this.stmt(s.body, body);
        this.link(end, testB);
        this.loops.pop();
        this.branch(testB, s.test, 'loop', body, after);
        return after;
      }
      case 'ForStatement': {
        if (s.init) {
          if (s.init.type === 'VariableDeclaration') for (const d of s.init.declarations) cur.elements.push(d);
          else cur.elements.push(s.init);
        }
        const testB = this.newBlock();
        this.link(cur, testB);
        const body = this.newBlock();
        const after = this.newBlock();
        const update = this.newBlock();
        if (s.test) this.branch(testB, s.test, 'loop', body, after);
        else this.link(testB, body);
        this.loopStart({ breakTo: after, continueTo: update });
        const end = this.stmt(s.body, body);
        this.link(end, update);
        this.loops.pop();
        if (s.update) update.elements.push(s.update);
        this.link(update, testB);
        return after;
      }
      case 'ForInStatement': case 'ForOfStatement': {
        cur.elements.push({ type: 'ForRight', node: s, start: s.right.start, end: s.right.end });
        const head = this.newBlock();
        this.link(cur, head);
        const body = this.newBlock();
        const after = this.newBlock();
        head.forEach = s;
        head.trueSucc = body;
        head.falseSucc = after;
        this.link(head, body);
        this.link(head, after);
        body.elements.push({ type: 'ForEachAssign', node: s, start: s.left.start, end: s.left.end });
        this.loopStart({ breakTo: after, continueTo: head });
        const end = this.stmt(s.body, body);
        this.link(end, head);
        this.loops.pop();
        return after;
      }
      case 'LabeledStatement': {
        const b = s.body;
        if (/^(For|While|DoWhile)/.test(b.type) || b.type === 'ForInStatement' || b.type === 'ForOfStatement') {
          this.pendingLabels.push(s.label.name);
          return this.stmt(b, cur);
        }
        const after = this.newBlock();
        this.loops.push({ breakTo: after, labels: [s.label.name], labelOnly: true, finallyDepth: this.finallys.length });
        const end = this.stmt(b, cur);
        this.loops.pop();
        this.link(end, after);
        return after.pred.length ? after : (end ? after : null);
      }
      case 'BreakStatement': {
        const t = this.targetFor('break', s.label && s.label.name);
        if (t) this.jump(cur, t.breakTo, t.finallyDepth);
        return null;
      }
      case 'ContinueStatement': {
        const t = this.targetFor('continue', s.label && s.label.name);
        if (t) this.jump(cur, t.continueTo, t.finallyDepth);
        return null;
      }
      case 'SwitchStatement': {
        cur.elements.push(s.discriminant);
        const after = this.newBlock();
        const labels = this.pendingLabels;
        this.pendingLabels = [];
        this.loops.push({ breakTo: after, isSwitch: true, labels, finallyDepth: this.finallys.length });
        const bodies = s.cases.map(() => this.newBlock());
        const defIdx = s.cases.findIndex((c) => !c.test);
        const tests = [];
        s.cases.forEach((c, i) => { if (c.test) tests.push([i, this.newBlock()]); });
        const fallback = defIdx >= 0 ? bodies[defIdx] : after;
        this.link(cur, tests.length ? tests[0][1] : fallback);
        tests.forEach(([i, tb], k) => {
          tb.test = s.cases[i].test;
          tb.testKind = 'case';
          tb.caseNode = s.cases[i];
          tb.discriminant = s.discriminant;
          tb.trueSucc = bodies[i];
          tb.falseSucc = k + 1 < tests.length ? tests[k + 1][1] : fallback;
          this.link(tb, tb.trueSucc);
          this.link(tb, tb.falseSucc);
        });
        s.cases.forEach((c, i) => {
          bodies[i].stmts.push(c);
          const end = this.stmts(c.consequent, bodies[i]);
          if (end) this.link(end, i + 1 < s.cases.length ? bodies[i + 1] : after);
        });
        this.loops.pop();
        return after;
      }
      case 'TryStatement': {
        const finB = s.finalizer ? this.newBlock() : null;
        let catchB = null;
        if (s.handler) {
          if (finB) this.handlers.push(finB);
          catchB = this.newBlock();
          if (finB) this.handlers.pop();
        }
        const fin = finB ? { entry: finB, targets: new Set() } : null;
        if (fin) this.finallys.push(fin);
        this.handlers.push(catchB || finB);
        const tryStart = this.newBlock();
        this.link(cur, tryStart);
        const tryEnd = this.stmt(s.block, tryStart);
        this.handlers.pop();
        let catchEnd = null;
        if (catchB) {
          if (finB) this.handlers.push(finB);
          catchB.isCatch = true;
          catchB.elements.push({ type: 'CatchParam', node: s.handler, start: s.handler.start, end: s.handler.start });
          catchEnd = this.stmt(s.handler.body, catchB);
          if (finB) this.handlers.pop();
        }
        if (fin) this.finallys.pop();
        if (finB) {
          finB.isFinally = true;
          this.link(tryEnd, finB);
          this.link(catchEnd, finB);
          const finEnd = this.stmt(s.finalizer, finB);
          if (!finEnd) return null;
          for (const t of fin.targets) this.link(finEnd, t);
          if (!catchB) this.throwFrom(finEnd);
          if (!tryEnd && !catchEnd) return null;
          const after = this.newBlock();
          this.link(finEnd, after);
          return after;
        }
        if (!tryEnd && !catchEnd) return null;
        const after = this.newBlock();
        this.link(tryEnd, after);
        this.link(catchEnd, after);
        return after;
      }
      case 'WithStatement':
        cur.elements.push(s.object);
        return this.stmt(s.body, cur);
      case 'ClassDeclaration':
        cur.elements.push(s);
        return cur;
      case 'ExportNamedDeclaration':
        if (s.declaration) return this.stmt(s.declaration, cur);
        return cur;
      case 'ExportDefaultDeclaration': {
        const d = s.declaration;
        if (d.type === 'ClassDeclaration') { cur.elements.push(d); return cur; }
        if (d.type !== 'FunctionDeclaration' && d.type !== 'TSInterfaceDeclaration') cur.elements.push(d);
        return cur;
      }
      case 'TSExportAssignment':
        cur.elements.push(s.expression);
        return cur;
      case 'TSEnumDeclaration': case 'TSModuleDeclaration':
        cur.elements.push({ type: 'Opaque', node: s, start: s.start, end: s.end });
        return cur;
      default:
        return cur;
    }
  }
}

function buildCFG(root) {
  return new Builder(root).build();
}

module.exports = { buildCFG, Block };
