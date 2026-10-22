'use strict';

// CFG-based analyses that do not need symbolic values: live-variable analysis
// for dead stores (S1854) and reachability for unreachable statements.

const { reachable } = require('./cfg');
const { unparen, forEachChild } = require('./ast');

function trackedSym(sym, fn) {
  if (!sym) return false;
  if (sym.captured || sym.byRef || sym.isConst || sym.isUsing || sym.isRef) return false;
  if (sym.kind === 'range' || sym.kind === 'localfunc') return false;
  if (sym.kind === 'param' && (sym.refKind === 'ref' || sym.refKind === 'out' || sym.refKind === 'in' || sym.primary || sym.implicitValue)) return false;
  if (sym.func && fn && sym.func !== fn && !(fn.k === 'Lambda' || fn.k === 'LocalFunc')) return false;
  return true;
}

// events in evaluation order: { sym, kind: 'use'|'def', node, report, weak }
function itemEvents(item, fn) {
  const out = [];
  const use = (sym, node) => { if (trackedSym(sym, fn)) out.push({ sym, kind: 'use', node }); };
  const def = (sym, node, report, weak) => { if (trackedSym(sym, fn)) out.push({ sym, kind: 'def', node, report, weak }); };
  const visit = (e, weak) => {
    if (!e || typeof e !== 'object') return;
    switch (e.k) {
      case 'Lambda': case 'LocalFunc': return; // captured variables are not tracked
      case 'Name':
        if (e.sym && !e.isWrite) use(e.sym, e);
        return;
      case 'Assign': {
        const left = unparen(e.left);
        if (e.op === '=') {
          if (left.k === 'Name' && left.sym) { visit(e.right, weak); def(left.sym, e, !weak, weak); return; }
          if (left.k === 'Tuple') {
            visit(e.right, weak);
            for (const a of left.elems) { const t = unparen(a.expr); if (t.k === 'Name' && t.sym) def(t.sym, e, false, weak); else visit(t, weak); }
            return;
          }
          visitTarget(left, weak);
          visit(e.right, weak);
          return;
        }
        if (left.k === 'Name' && left.sym) {
          use(left.sym, left);
          visit(e.right, e.op === '??=' || weak);
          def(left.sym, e, e.op !== '??=' && !weak, e.op === '??=' || weak);
          return;
        }
        visitTarget(left, weak);
        visit(e.right, weak);
        return;
      }
      case 'Unary':
        if ((e.op === '++' || e.op === '--')) {
          const t = unparen(e.operand);
          if (t.k === 'Name' && t.sym) {
            use(t.sym, t);
            // the value of a prefix/postfix expression used by its parent keeps it alive
            const usedValue = e.parent && e.parent.k !== 'ExprStmt' && !(e.parent.k === 'For');
            def(t.sym, e, !weak && !usedValue, weak);
            if (usedValue) use(t.sym, t);
            return;
          }
        }
        visit(e.operand, weak);
        return;
      case 'Arg':
        if (e.refKind === 'out') {
          const t = unparen(e.expr);
          if (t.k === 'Name' && t.sym) { def(t.sym, e, false, weak); return; }
          if (t.k === 'DeclExpr') { defDesignation(t.designation, weak); return; }
        }
        if (e.refKind === 'ref') { const t = unparen(e.expr); if (t.k === 'Name' && t.sym) { use(t.sym, t); def(t.sym, e, false, true); return; } }
        visit(e.expr, weak);
        return;
      case 'DeclExpr': defDesignation(e.designation, weak); return;
      case 'DeclPattern': case 'RecursivePattern': case 'ListPattern':
        forKids(e, (c) => visit(c, weak));
        if (e.sym) def(e.sym, e, false, true);
        return;
      case 'VarPattern': defDesignation(e.designation, true); return;
      case 'Binary':
        if (e.op === '&&' || e.op === '||' || e.op === '??') { visit(e.left, weak); visit(e.right, true); return; }
        visit(e.left, weak); visit(e.right, weak);
        return;
      case 'Conditional': visit(e.cond, weak); visit(e.then, true); visit(e.else, true); return;
      case 'Member': if (e.cond) { visit(e.expr, weak); return; } visit(e.expr, weak); return;
      case 'Invocation': {
        visit(e.expr, weak);
        const condCall = unparen(e.expr).k === 'Member' && unparen(e.expr).cond;
        for (const a of e.args) visit(a, weak || condCall);
        return;
      }
      case 'SwitchExpr': {
        visit(e.expr, weak);
        for (const arm of e.arms) { visit(arm.pattern, true); visit(arm.when, true); visit(arm.expr, true); }
        return;
      }
      case 'Type': case 'Typeof': case 'Sizeof': return;
      default:
        forKids(e, (c) => visit(c, weak));
    }
  };
  const visitTarget = (t, weak) => {
    // member / element target: receiver and indices are reads
    if (t.k === 'Member') visit(t.expr, weak);
    else if (t.k === 'Element') { visit(t.expr, weak); for (const a of t.args) visit(a, weak); } else visit(t, weak);
  };
  const defDesignation = (d, weak) => {
    if (!d) return;
    if (d.k === 'SingleDesignation') { if (d.sym) def(d.sym, d, false, weak); return; }
    if (d.k === 'ParenDesignation') for (const x of d.items) defDesignation(x, weak);
  };
  switch (item.k) {
    case 'LocalDecl':
      for (const v of item.vars) {
        if (v.init) { visit(v.init, false); if (v.sym) def(v.sym, v, !isDefaultish(v.init), false); }
        else if (v.size) visit(v.size, false);
      }
      if (item.designation) { visit(item.deconInit, false); defDesignation(item.designation, false); }
      break;
    case 'ExprStmt': case 'Return': case 'Throw': case 'YieldReturn': case 'CondEval': case 'ExprBody':
      visit(item.expr, false);
      break;
    case 'ForeachInit': visit(item.node.expr, false); break;
    case 'ForeachAssign':
      if (item.node.sym) def(item.node.sym, item.node, false, false);
      else if (item.node.designation) {
        const d = item.node.designation;
        if (d.k === 'SingleDesignation' || d.k === 'ParenDesignation') defDesignation(d, false);
        else visit(d, false);
      }
      break;
    case 'SwitchEval': visit(item.node.expr, false); break;
    case 'CatchEnter': if (item.node.sym) def(item.node.sym, item.node, false, false); if (item.node.when) visit(item.node.when, false); break;
    case 'UsingEnter': if (item.node.decl) return itemEvents(item.node.decl, fn); if (item.node.expr) visit(item.node.expr, false); break;
    case 'LockEnter': visit(item.node.expr, false); break;
    case 'ForeachNext': break;
    case 'CaseTest': visit(item.label.pattern, false); if (item.label.when) visit(item.label.when, false); break;
    case 'LocalFunc': {
      // calling a local function may read any captured variable: those are untracked
      break;
    }
    default:
      if (item.k && item.expr) visit(item.expr, false);
      else if (item.k && item.k !== 'Break' && item.k !== 'Continue' && item.k !== 'Goto' && item.k !== 'YieldBreak' && item.k !== 'LockExit' && item.k !== 'UsingExit') visit(item, false);
  }
  return out;
}

function forKids(e, fn) { forEachChild(e, fn); }

function isDefaultish(e) {
  e = unparen(e);
  if (!e) return true;
  if (e.k === 'Literal') {
    if (e.kind === 'null' || e.kind === 'bool' || e.kind === 'default') return true;
    if (e.kind === 'int' || e.kind === 'real') return e.value === 0 || e.value === 1 || e.value === -1;
    if (e.kind === 'string') return e.value === '';
    if (e.kind === 'char') return e.value === '\0' || e.value === ' ';
  }
  if (e.k === 'Default') return true;
  if (e.k === 'Member' && (e.name === 'Empty' || e.name === 'MinValue' || e.name === 'MaxValue' || e.name === 'Zero' || e.name === 'None')) return true;
  if (e.k === 'Unary' && e.op === '-' && e.operand.k === 'Literal') return true;
  return false;
}

function deadStores(cfg, fn, onDead) {
  const blocks = cfg.blocks;
  const evs = new Map();
  for (const b of blocks) {
    const list = [];
    for (const it of b.items) for (const ev of itemEvents(it, fn)) list.push(ev);
    if (b.cond) {
      if (b.cond.k === 'CaseTest' || b.cond.k === 'ForeachNext') for (const ev of itemEvents(b.cond, fn)) list.push(ev);
      else for (const ev of itemEvents({ k: 'CondEval', expr: b.cond }, fn)) list.push(ev);
    }
    evs.set(b, list);
  }
  // iterate to fixpoint
  const liveIn = new Map();
  for (const b of blocks) liveIn.set(b, new Set());
  let changed = true;
  let rounds = 0;
  while (changed && rounds++ < 50) {
    changed = false;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      const live = new Set();
      for (const s of b.succ) for (const x of liveIn.get(s)) live.add(x);
      for (const s of b.exc) { const li = liveIn.get(s); if (li) for (const x of li) live.add(x); }
      const list = evs.get(b);
      for (let k = list.length - 1; k >= 0; k--) {
        const ev = list[k];
        if (ev.kind === 'use') live.add(ev.sym);
        else if (!ev.weak) live.delete(ev.sym);
      }
      const prev = liveIn.get(b);
      if (prev.size !== live.size || [...live].some((x) => !prev.has(x))) { liveIn.set(b, live); changed = true; }
    }
  }
  const reach = reachable(cfg);
  for (const b of blocks) {
    if (!reach.has(b)) continue;
    const live = new Set();
    for (const s of b.succ) for (const x of liveIn.get(s)) live.add(x);
    for (const s of b.exc) { const li = liveIn.get(s); if (li) for (const x of li) live.add(x); }
    const list = evs.get(b);
    for (let k = list.length - 1; k >= 0; k--) {
      const ev = list[k];
      if (ev.kind === 'use') { live.add(ev.sym); continue; }
      if (ev.report && !live.has(ev.sym)) onDead(ev);
      if (!ev.weak) live.delete(ev.sym);
    }
  }
}

function unreachableStatements(cfg, onUnreachable) {
  const reach = reachable(cfg);
  const lists = [];
  const collect = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.k === 'Lambda' || n.k === 'LocalFunc') return;
    if (n.k === 'Block' && n.stmts) lists.push(n.stmts);
    if (n.k === 'Section') lists.push(n.stmts);
    forKids(n, collect);
  };
  const body = cfg.fn && (cfg.fn.body || (cfg.fn.k === 'TopLevel' ? { k: 'Block', stmts: cfg.fn.stmts } : null));
  if (!body) return;
  collect(body);
  for (const list of lists) {
    let prevReach = true;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const b = cfg.stmtBlock.get(s);
      if (!b) continue;
      const r = reach.has(b) && !b.dead;
      const isReach = reach.has(b);
      if (!isReach && prevReach && i > 0 && s.k !== 'LocalFunc' && s.k !== 'Labeled' && s.k !== 'Empty' && s.k !== 'Block') {
        onUnreachable(s);
      }
      void r;
      prevReach = isReach;
    }
  }
}

module.exports = { deadStores, unreachableStatements, itemEvents, isDefaultish };
