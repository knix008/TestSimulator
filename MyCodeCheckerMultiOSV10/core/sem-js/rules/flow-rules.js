'use strict';

// Rules backed by the CFG / liveness / symbolic-execution engine.

const { rule, m } = require('./define');
const W = require('../walk');

rule('null-dereference', {
  t: 'B', s: 'MA', debt: 10, sonar: 'S2259', cwe: 'CWE-476', tags: ['symbolic-execution'],
  name: ['Properties of variables with "null" or "undefined" values should not be accessed', '"null"이나 "undefined" 값인 변수의 속성에 접근하면 안 됩니다'],
  why: ['On this path the variable is known to hold null or undefined, so reading a property or calling it throws a TypeError.', '이 경로에서 변수는 null이나 undefined로 알려져 있어 속성을 읽거나 호출하면 TypeError가 납니다.'],
  fix: ['Check the value before using it, or make sure it is assigned on every path.', '사용하기 전에 값을 검사하거나 모든 경로에서 대입되도록 하세요.'],
}, (ctx) => {
  for (const r of ctx.flow()) {
    for (const d of r.derefs.values()) {
      const name = d.name || 'value';
      const what = d.mask === 1 ? 'null' : d.mask === 2 ? 'undefined' : 'null or undefined';
      const whatKo = d.mask === 1 ? 'null' : d.mask === 2 ? 'undefined' : 'null 또는 undefined';
      const events = [];
      if (d.origin && d.origin.start != null) events.push({ node: d.origin, tag: 'path', text: m(`"${name}" is ${what} here`, `여기서 "${name}"는 ${whatKo}입니다`) });
      events.push({ node: d.node, tag: 'deref', main: true, text: m(`"${name}" is dereferenced`, `"${name}"에 접근합니다`) });
      ctx.report(d.node, m(`TypeError can be thrown as "${name}" is ${what} here.`, `여기서 "${name}"가 ${whatKo}이므로 TypeError가 날 수 있습니다.`), { events, fn: W.functionName(r.fn) || undefined });
    }
  }
});

function isConstFlag(ctx, test) {
  // conditions on literal-initialized constants are configuration switches
  let ok = true;
  let any = false;
  W.walk(test, (n) => {
    if (n.type === 'Identifier' && n._ref && n._ref.resolved) {
      any = true;
      const v = n._ref.resolved;
      const d = v.defs[0];
      if (!(v.defs.length === 1 && d.kind === 'const' && d.node && d.node.init && W.staticValue(d.node.init))) ok = false;
    }
  });
  return any && ok;
}

function conditionFindings(ctx) {
  if (ctx._condFindings) return ctx._condFindings;
  const out = [];
  for (const r of ctx.flow()) {
    for (const [test, rec] of r.conds) {
      if (!rec.fromVar || rec.notVar || rec.t === rec.f) continue;
      if (W.staticValue(test)) continue;
      if (isConstFlag(ctx, test)) continue;
      const p = test.parent;
      const always = rec.t;
      let dead = false;
      if (!p) continue;
      if (p.type === 'IfStatement') dead = !always || !!p.alternate;
      else if (p.type === 'ConditionalExpression') dead = true;
      else if (p.type === 'WhileStatement' || p.type === 'ForStatement') dead = !always;
      else if (p.type === 'DoWhileStatement') dead = false;
      else if (p.type === 'LogicalExpression' && p.left === test) dead = p.operator === '&&' ? !always : p.operator === '||' ? always : false;
      else continue;
      out.push({ test, always, dead });
    }
  }
  ctx._condFindings = out;
  return out;
}

rule('unreachable-branch', {
  t: 'B', s: 'MA', debt: 10, sonar: 'S2583', cwe: ['CWE-570', 'CWE-571'], tags: ['symbolic-execution'],
  name: ['Conditionally executed code should be reachable', '조건부로 실행되는 코드는 도달할 수 있어야 합니다'],
  why: ['The condition always evaluates to the same value on every path, so one branch can never run.', '모든 경로에서 조건 결과가 같아 한쪽 분기는 절대 실행되지 않습니다.'],
  fix: ['Fix the condition or remove the dead branch.', '조건을 고치거나 죽은 분기를 지우세요.'],
}, (ctx) => {
  for (const f of conditionFindings(ctx)) {
    if (!f.dead) continue;
    const v = f.always ? 'true' : 'false';
    ctx.report(f.test, m(`Change this condition so that it does not always evaluate to "${v}"; some subsequent code is never executed.`, `이 조건은 항상 "${v}"입니다. 뒤따르는 일부 코드가 실행되지 않으니 조건을 고치세요.`));
  }
});

rule('gratuitous-condition', {
  t: 'S', s: 'MA', debt: 5, sonar: 'S2589', cwe: ['CWE-570', 'CWE-571'], tags: ['symbolic-execution', 'redundant'],
  name: ['Boolean expressions should not be gratuitous', '불필요한 불리언 식을 쓰면 안 됩니다'],
  why: ['The expression always has the same value where it is evaluated, so it adds nothing but confusion.', '이 식은 평가되는 곳에서 항상 같은 값이라 혼란만 더합니다.'],
  fix: ['Remove the redundant test or fix the logic that should make it vary.', '불필요한 검사를 지우거나 값이 바뀌어야 할 로직을 고치세요.'],
}, (ctx) => {
  for (const f of conditionFindings(ctx)) {
    if (f.dead) continue;
    const v = f.always ? 'truthy' : 'falsy';
    const vk = f.always ? '참' : '거짓';
    ctx.report(f.test, m(`This condition is always ${v} here.`, `이 조건은 여기서 항상 ${vk}입니다.`));
  }
});

const BASIC_INIT = (n) => {
  n = W.unwrapTS(n);
  if (!n) return true;
  if (n.type === 'Literal') return n.value === null || n.value === true || n.value === false || n.value === 0 || n.value === 1 || n.value === '' || (typeof n.value === 'string' && n.value.length <= 1);
  if (n.type === 'UnaryExpression' && (n.operator === '-' || n.operator === '+') && n.argument.type === 'Literal' && (n.argument.value === 1 || n.argument.value === 0)) return true;
  if (n.type === 'UnaryExpression' && n.operator === 'void') return true;
  if (n.type === 'Identifier' && (n.name === 'undefined' || n.name === 'NaN' || n.name === 'Infinity')) return true;
  if (n.type === 'ArrayExpression' && n.elements.length === 0) return true;
  if (n.type === 'ObjectExpression' && n.properties.length === 0) return true;
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0 && n.quasis[0].value.raw === '') return true;
  return false;
};

rule('dead-store', {
  t: 'S', s: 'MA', debt: 15, sonar: 'S1854', cwe: 'CWE-563', tags: ['unused'],
  name: ['Unused assignments should be removed', '사용하지 않는 대입은 지워야 합니다'],
  why: ['The assigned value is overwritten or the function ends before it is read, so the computation is wasted or a later read uses the wrong variable.', '대입한 값이 읽히기 전에 덮어써지거나 함수가 끝나 계산이 낭비되거나 다른 변수를 잘못 읽고 있습니다.'],
  fix: ['Remove the assignment, or use the value where it was meant to be used.', '대입을 지우거나 원래 쓰려던 곳에서 값을 쓰세요.'],
}, (ctx) => {
  for (const r of ctx.flow()) {
    for (const e of r.dead) {
      if (e.pattern || e.decl) continue;
      const v = e.v;
      if (v.name.startsWith('_')) continue;
      if (!v.refs.some((x) => x.read && !x.type)) continue;
      if (e.init) {
        const init = e.expr && e.expr.init;
        if (BASIC_INIT(init)) continue;
      } else if (e.expr && e.expr.type === 'AssignmentExpression' && e.expr.operator === '=' && BASIC_INIT(e.expr.right) && isInsideFinallyOrLoopReset(e.expr)) continue;
      ctx.report(e.node, m(`Remove this useless assignment to variable "${v.name}".`, `변수 "${v.name}"에 대한 쓸모없는 대입을 지우세요.`), { fn: W.functionName(r.fn) || undefined });
    }
  }
});

function isInsideFinallyOrLoopReset(n) {
  let p = n.parent;
  while (p && !W.isFunction(p)) {
    if (p.type === 'TryStatement' && p.finalizer) return true;
    p = p.parent;
  }
  return false;
}

const HOISTED = new Set(['FunctionDeclaration', 'TSDeclareFunction', 'TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'EmptyStatement', 'TSModuleDeclaration', 'TSEnumDeclaration', 'ClassDeclaration']);

rule('unreachable-code', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S1763', cwe: 'CWE-561', tags: ['unused'],
  name: ['All code should be reachable', '모든 코드는 도달할 수 있어야 합니다'],
  why: ['Statements after a return, throw, break or continue (or after a branch where every path jumps away) never run.', 'return, throw, break, continue 뒤나 모든 경로가 빠져나가는 분기 뒤의 문장은 절대 실행되지 않습니다.'],
  fix: ['Remove the dead statements or fix the jump that skips them.', '죽은 문장을 지우거나 그 문장을 건너뛰는 이동을 고치세요.'],
}, (ctx) => {
  const roots = [ctx.ast, ...ctx.functions()];
  const dead = new Set();
  for (const fn of roots) {
    if (fn.type !== 'Program' && !fn.body) continue;
    let cfg;
    try { cfg = ctx.cfg(fn); } catch { continue; }
    for (const b of cfg.blocks) {
      if (b.reachable || b.pred.length) continue;
      for (const s of b.stmts) dead.add(s);
    }
  }
  for (const s of dead) {
    if (HOISTED.has(s.type) || s.type === 'SwitchCase') continue;
    if (s.type === 'VariableDeclaration' && s.kind === 'var' && s.declarations.every((d) => !d.init)) continue;
    // report only the first statement of a dead run
    const p = s.parent;
    let anc = p;
    let nested = false;
    while (anc && !W.isFunction(anc)) { if (dead.has(anc) && !HOISTED.has(anc.type)) { nested = true; break; } anc = anc.parent; }
    if (nested) continue;
    const list = p && (p.type === 'BlockStatement' || p.type === 'Program' || p.type === 'StaticBlock') ? p.body : p && p.type === 'SwitchCase' ? p.consequent : null;
    if (list) {
      const i = list.indexOf(s);
      let prevDead = false;
      for (let j = i - 1; j >= 0; j--) {
        if (HOISTED.has(list[j].type)) continue;
        prevDead = dead.has(list[j]);
        break;
      }
      if (prevDead) continue;
      // a dead statement right after a jump, or an unreachable branch body
      const prev = list.slice(0, i).reverse().find((x) => !HOISTED.has(x.type));
      if (!prev) {
        // first statement of a block: report only when the block itself is reachable syntax-wise
        if (!(p.parent && p.parent.type === 'SwitchCase')) continue;
      }
    } else continue;
    ctx.report(s, m('Remove this unreachable code.', '도달할 수 없는 이 코드를 지우세요.'));
  }
});
