'use strict';

// Maintainability rules (code smells).

const { rule, m } = require('./define');
const W = require('../walk');
const U = require('./util');
const B = require('./bugs');
const { parse } = require('../parser');

const { unwrapTS, equal, propName, dottedName, staticValue, isFunction, keyName } = W;

function opt(ctx, name, def) {
  const v = ctx.options && ctx.options[name];
  return typeof v === 'number' ? v : def;
}

function fnLabel(fn) {
  const n = W.functionName(fn);
  return n ? `"${n}"` : 'this function';
}
function fnLabelKo(fn) {
  const n = W.functionName(fn);
  return n ? `"${n}"` : '이 함수';
}

function fnHead(fn) {
  if (fn.id) return fn.id;
  const p = fn.parent;
  if (p && (p.type === 'MethodDefinition' || p.type === 'Property' || p.type === 'PropertyDefinition')) return p.key;
  if (p && p.type === 'VariableDeclarator') return p.id;
  return { start: fn.start, end: Math.min(fn.end, fn.start + 8) };
}

// ---------------------------------------------------------------- complexity
function logicalRuns(root) {
  const ops = [];
  const visit = (n) => {
    if (n.type === 'LogicalExpression' && !(n.parenthesized && n !== root)) {
      visit(n.left);
      ops.push(n.operator);
      visit(n.right);
    }
  };
  visit(root);
  let runs = 0;
  for (let i = 0; i < ops.length; i++) if (i === 0 || ops[i] !== ops[i - 1]) runs++;
  return runs;
}

function cognitive(fn) {
  let total = 0;
  const visit = (n, nesting) => {
    if (!n || typeof n !== 'object') return;
    switch (n.type) {
      case 'IfStatement': {
        const isElseIf = n.parent && n.parent.type === 'IfStatement' && n.parent.alternate === n;
        total += isElseIf ? 1 : 1 + nesting;
        visit(n.test, nesting);
        visit(n.consequent, nesting + 1);
        if (n.alternate) {
          if (n.alternate.type === 'IfStatement') visit(n.alternate, nesting);
          else { total += 1; visit(n.alternate, nesting + 1); }
        }
        return;
      }
      case 'ConditionalExpression':
        total += 1 + nesting;
        visit(n.test, nesting);
        visit(n.consequent, nesting + 1);
        visit(n.alternate, nesting + 1);
        return;
      case 'SwitchStatement':
        total += 1 + nesting;
        visit(n.discriminant, nesting);
        for (const c of n.cases) for (const s of c.consequent) visit(s, nesting + 1);
        for (const c of n.cases) if (c.test) visit(c.test, nesting + 1);
        return;
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': case 'WhileStatement': case 'DoWhileStatement':
        total += 1 + nesting;
        for (const c of W.children(n)) visit(c, c === n.body ? nesting + 1 : nesting);
        return;
      case 'CatchClause':
        total += 1 + nesting;
        visit(n.body, nesting + 1);
        return;
      case 'BreakStatement': case 'ContinueStatement':
        if (n.label) total += 1;
        return;
      case 'LogicalExpression':
        if (!(n.parent && n.parent.type === 'LogicalExpression' && !n.parenthesized)) total += logicalRuns(n);
        for (const c of W.children(n)) visit(c, nesting);
        return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
        if (n === fn) { for (const c of [n.body]) visit(c, nesting); return; }
        for (const c of [n.body]) visit(c, nesting + 1);
        return;
      default:
        for (const c of W.children(n)) visit(c, nesting);
    }
  };
  visit(fn, 0);
  return total;
}

rule('cognitive-complexity', {
  t: 'S', s: 'CR', debt: 10, ref: 'S3776', tags: ['brain-overload'],
  name: ['Cognitive Complexity of functions should not be too high', '함수의 인지 복잡도가 너무 높으면 안 됩니다'],
  why: ['Deeply nested and branching logic is hard to read, test and change safely.', '깊게 중첩되고 분기가 많은 로직은 읽고 시험하고 안전하게 고치기 어렵습니다.'],
  fix: ['Extract parts into smaller functions and flatten the nesting with early returns.', '일부를 작은 함수로 빼고 이른 반환으로 중첩을 줄이세요.'],
}, (ctx) => {
  const max = opt(ctx, 'cognitiveComplexity', 15);
  for (const fn of ctx.functions()) {
    if (!fn.body) continue;
    // only outermost functions (nested ones count toward them), plus IIFE-free class members
    let p = fn.parent;
    let nested = false;
    while (p) { if (isFunction(p)) { nested = true; break; } p = p.parent; }
    if (nested) continue;
    const c = cognitive(fn);
    if (c > max) ctx.report(fnHead(fn), m(`Refactor ${fnLabel(fn)} to reduce its Cognitive Complexity from ${c} to the ${max} allowed.`, `${fnLabelKo(fn)}의 인지 복잡도를 ${c}에서 허용치 ${max} 이하로 줄이세요.`));
  }
});

rule('too-many-params', {
  t: 'S', s: 'MA', debt: 20, ref: 'S107', tags: ['brain-overload'],
  name: ['Functions should not have too many parameters', '함수의 매개변수가 너무 많으면 안 됩니다'],
  why: ['Long parameter lists are hard to call correctly and usually mean the function does too much.', '매개변수 목록이 길면 올바르게 호출하기 어렵고 보통 함수가 너무 많은 일을 합니다.'],
  fix: ['Group related parameters into an object, or split the function.', '관련 매개변수를 객체로 묶거나 함수를 나누세요.'],
}, (ctx) => {
  const max = opt(ctx, 'maxParams', 7);
  for (const fn of ctx.functions()) {
    const ps = fn.params.filter((p) => !(p.type === 'Identifier' && p.name === 'this'));
    if (ps.length <= max) continue;
    if (fn.parent && fn.parent.type === 'MethodDefinition' && fn.parent.kind === 'constructor' && ps.some((p) => p.type === 'TSParameterProperty')) continue;
    ctx.report(fnHead(fn), m(`${fnLabel(fn)} has ${ps.length} parameters, which is greater than the ${max} authorized.`, `${fnLabelKo(fn)}의 매개변수가 ${ps.length}개로 허용치 ${max}개보다 많습니다.`));
  }
});

function codeLines(ctx, node) {
  const a = ctx.loc(node.start).line;
  const b = ctx.loc(node.end).line;
  const lines = ctx.src.split(/\r?\n/).slice(a - 1, b);
  let n = 0;
  let inBlock = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (inBlock) { if (l.includes('*/')) { inBlock = false; if (l.slice(l.indexOf('*/') + 2).trim()) n++; } continue; }
    if (!l || l.startsWith('//')) continue;
    if (l.startsWith('/*')) { if (!l.includes('*/')) inBlock = true; continue; }
    n++;
  }
  return n;
}

rule('function-too-long', {
  t: 'S', s: 'MA', debt: 20, ref: 'S138', tags: ['brain-overload'],
  name: ['Functions should not have too many lines of code', '함수의 코드 줄 수가 너무 많으면 안 됩니다'],
  why: ['Very long functions are hard to understand and usually mix several responsibilities.', '아주 긴 함수는 이해하기 어렵고 보통 여러 책임이 섞여 있습니다.'],
  fix: ['Split the function into smaller, named steps.', '함수를 이름 붙은 작은 단계로 나누세요.'],
}, (ctx) => {
  const max = opt(ctx, 'maxFunctionLines', 200);
  for (const fn of ctx.functions()) {
    if (!fn.body || fn.body.type !== 'BlockStatement') continue;
    const span = ctx.loc(fn.end).line - ctx.loc(fn.start).line;
    if (span <= max) continue;
    const n = codeLines(ctx, fn.body);
    if (n > max) ctx.report(fnHead(fn), m(`${fnLabel(fn)} has ${n} lines of code, which is greater than the ${max} authorized.`, `${fnLabelKo(fn)}의 코드가 ${n}줄로 허용치 ${max}줄보다 많습니다.`));
  }
});

const NESTING = new Set(['IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'SwitchStatement', 'TryStatement']);

rule('nesting-depth', {
  t: 'S', s: 'CR', debt: 10, ref: 'S134', tags: ['brain-overload'],
  name: ['Control flow statements should not be nested too deeply', '제어 흐름 문을 너무 깊이 중첩하면 안 됩니다'],
  why: ['Deep nesting makes code hard to follow; each level adds context the reader must keep in mind.', '깊은 중첩은 코드를 따라가기 어렵게 합니다. 단계마다 기억할 맥락이 늘어납니다.'],
  fix: ['Use early returns or extract the inner logic into a function.', '이른 반환을 쓰거나 안쪽 로직을 함수로 빼세요.'],
}, (ctx) => {
  const max = opt(ctx, 'maxNesting', 4);
  for (const n of ctx.nodesOf(...NESTING)) {
    if (n.type === 'IfStatement' && n.parent && n.parent.type === 'IfStatement' && n.parent.alternate === n) continue;
    let depth = 0;
    let p = n.parent;
    let child = n;
    while (p && !isFunction(p)) {
      if (NESTING.has(p.type) && !(p.type === 'IfStatement' && p.alternate === child && child.type === 'IfStatement')) depth++;
      child = p;
      p = p.parent;
    }
    if (depth === max) ctx.report({ start: n.start, end: n.start + 2 }, m(`Refactor this code to not nest more than ${max} if/for/while/switch/try statements.`, `if/for/while/switch/try 문을 ${max}단계보다 깊게 중첩하지 않도록 고치세요.`));
  }
});

rule('nested-functions', {
  t: 'S', s: 'CR', debt: 10, ref: 'S2004', tags: ['brain-overload'],
  name: ['Functions should not be nested too deeply', '함수를 너무 깊이 중첩하면 안 됩니다'],
  why: ['Many levels of nested functions make the flow of data and control very hard to follow.', '여러 단계로 중첩된 함수는 데이터와 제어 흐름을 따라가기 매우 어렵게 합니다.'],
  fix: ['Move inner functions to the outer level, or use async/await instead of nested callbacks.', '안쪽 함수를 바깥으로 옮기거나 중첩 콜백 대신 async/await를 쓰세요.'],
}, (ctx) => {
  const max = opt(ctx, 'maxFunctionNesting', 4);
  for (const fn of ctx.functions()) {
    let depth = 0;
    let p = fn.parent;
    while (p) { if (isFunction(p)) depth++; p = p.parent; }
    if (depth === max) ctx.report(fnHead(fn), m(`Refactor this code to not nest functions more than ${max} levels deep.`, `함수를 ${max}단계보다 깊게 중첩하지 않도록 고치세요.`));
  }
});

rule('nested-ternary', {
  t: 'S', s: 'MA', debt: 5, ref: 'S3358', tags: ['confusing'],
  name: ['Ternary operators should not be nested', '삼항 연산자를 중첩하면 안 됩니다'],
  why: ['Nested conditional expressions are hard to read and easy to get wrong.', '중첩된 조건식은 읽기 어렵고 틀리기 쉽습니다.'],
  fix: ['Use if / else statements or extract a function.', 'if / else 문을 쓰거나 함수로 빼세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('ConditionalExpression')) {
    let p = n.parent;
    let child = n;
    while (p && (p.type === 'TSAsExpression' || p.type === 'TSNonNullExpression')) { child = p; p = p.parent; }
    if (p && p.type === 'ConditionalExpression' && (p.consequent === child || p.alternate === child || p.test === child)) {
      ctx.report(n, m('Extract this nested ternary operation into an independent statement.', '이 중첩 삼항 연산을 별도 문장으로 빼세요.'));
    }
  }
});

function singleIf(s) {
  if (!s) return null;
  if (s.type === 'IfStatement') return s;
  if (s.type === 'BlockStatement' && s.body.length === 1 && s.body[0].type === 'IfStatement') return s.body[0];
  return null;
}

rule('collapsible-if', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1066', tags: ['clumsy'],
  name: ['Mergeable "if" statements should be combined', '합칠 수 있는 "if" 문은 합쳐야 합니다'],
  why: ['An if whose only content is another if without else adds a level of nesting for nothing.', 'else 없는 if 하나만 담은 if는 쓸데없이 중첩을 늘립니다.'],
  fix: ['Merge the conditions with &&.', '조건을 &&로 합치세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('IfStatement')) {
    if (n.alternate) continue;
    const inner = singleIf(n.consequent);
    if (!inner || inner.alternate) continue;
    if (n.consequent.type === 'BlockStatement' && ctx.comments.some((c) => c.start > n.consequent.start && c.end < inner.start)) continue;
    ctx.report({ start: inner.start, end: inner.start + 2 }, m('Merge this if statement with the enclosing one.', '이 if 문을 바깥 if 문과 합치세요.'));
  }
});

function substantial(ctx, b) {
  if (!b) return false;
  const list = b.type === 'BlockStatement' ? b.body : [b];
  const stmts = list.filter((s) => s.type !== 'EmptyStatement');
  if (stmts.length >= 2) return true;
  return stmts.length === 1 && ctx.loc(stmts[0].end).line > ctx.loc(stmts[0].start).line;
}

rule('duplicate-branch', {
  t: 'S', s: 'MA', debt: 10, ref: 'S1871', tags: ['design', 'suspicious'],
  name: ['Two branches in a conditional structure should not have exactly the same implementation', '조건 구조의 두 분기 구현이 똑같으면 안 됩니다'],
  why: ['Identical branches are either a copy-paste mistake or should be merged into one condition.', '똑같은 분기는 복사 실수이거나 하나의 조건으로 합쳐야 합니다.'],
  fix: ['Merge the conditions, or fix the branch that should differ.', '조건을 합치거나 달라야 할 분기를 고치세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('IfStatement')) {
    if (n.parent && n.parent.type === 'IfStatement' && n.parent.alternate === n) continue;
    const branches = [];
    let cur = n;
    for (;;) {
      branches.push(cur.consequent);
      if (cur.alternate && cur.alternate.type === 'IfStatement') { cur = cur.alternate; continue; }
      if (cur.alternate) branches.push(cur.alternate);
      break;
    }
    const allSame = cur.alternate && branches.every((b) => equal(b, branches[0]));
    if (allSame) continue;
    for (let i = 1; i < branches.length; i++) {
      if (!substantial(ctx, branches[i])) continue;
      for (let j = 0; j < i; j++) {
        if (equal(branches[i], branches[j])) { ctx.report(branches[i], m(`This branch's code block is the same as the block for the branch on line ${ctx.line(branches[j])}.`, `이 분기의 코드 블록이 ${ctx.line(branches[j])}번 줄 분기의 블록과 같습니다.`)); break; }
      }
    }
  }
  for (const sw of ctx.nodes('SwitchStatement')) {
    const bodies = sw.cases.map((c) => c.consequent.filter((s) => !(s.type === 'BreakStatement' && !s.label)));
    const allSame = sw.cases.some((c) => !c.test) && bodies.every((b) => b.length && equal(b, bodies[0]));
    if (allSame) continue;
    for (let i = 1; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.length < 2 && !(b.length === 1 && ctx.loc(b[0].end).line > ctx.loc(b[0].start).line)) continue;
      for (let j = 0; j < i; j++) {
        if (bodies[j].length && equal(b, bodies[j])) {
          // fall-through into the duplicate makes it intentional
          if (j === i - 1 && !sw.cases[j].consequent.length) continue;
          ctx.report(sw.cases[i], m(`This case's code block is the same as the block for the case on line ${ctx.line(sw.cases[j])}.`, `이 case의 코드 블록이 ${ctx.line(sw.cases[j])}번 줄 case의 블록과 같습니다.`));
          break;
        }
      }
    }
  }
});

rule('identical-functions', {
  t: 'S', s: 'MA', debt: 15, ref: 'S4144', tags: ['confusing', 'duplicate'],
  name: ['Functions should not have identical implementations', '함수 구현이 똑같으면 안 됩니다'],
  why: ['Two functions with the same body are duplicated code; a fix in one is easily forgotten in the other.', '본문이 같은 두 함수는 중복 코드라 한쪽의 수정을 다른 쪽에서 잊기 쉽습니다.'],
  fix: ['Make one function call the other, or extract the shared logic.', '한 함수가 다른 함수를 호출하게 하거나 공통 로직을 빼세요.'],
}, (ctx) => {
  const groups = new Map();
  for (const fn of ctx.functions()) {
    if (!fn.body || fn.body.type !== 'BlockStatement' || fn.body.body.length < 3) continue;
    if (ctx.loc(fn.body.end).line - ctx.loc(fn.body.start).line < 3) continue;
    const h = W.hash(fn.body) + '|' + fn.params.length;
    if (!groups.has(h)) groups.set(h, []);
    groups.get(h).push(fn);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (let i = 1; i < list.length; i++) {
      const orig = list.slice(0, i).find((f) => equal(f.body, list[i].body) && equal(f.params, list[i].params));
      if (orig) ctx.report(fnHead(list[i]), m(`Update ${fnLabel(list[i])} so that its implementation is not identical to the one on line ${ctx.line(orig)}.`, `${fnLabelKo(list[i])}의 구현이 ${ctx.line(orig)}번 줄의 함수와 똑같지 않도록 고치세요.`));
    }
  }
});

// ---------------------------------------------------------------- unused
function isVueOrScriptGlobal(ctx, v) {
  if (v.scope.type === 'global') return true;
  if (v.scope.type === 'module' && /\.vue$/i.test(ctx.file)) return true;
  return false;
}

function hasRestSibling(id) {
  let p = id.parent;
  while (p && (p.type === 'AssignmentPattern' || p.type === 'Property')) {
    if (p.type === 'Property' && p.parent && p.parent.type === 'ObjectPattern') return p.parent.properties.some((x) => x.type === 'RestElement');
    p = p.parent;
  }
  return false;
}

function readOutside(v, node) {
  return v.refs.some((r) => r.read && !(node && r.id.start >= node.start && r.id.end <= node.end));
}

rule('unused-variable', {
  t: 'S', s: 'MI', debt: 5, ref: 'S1481', tags: ['unused'],
  name: ['Unused local variables and functions should be removed', '사용하지 않는 지역 변수와 함수는 지워야 합니다'],
  why: ['A declared but never used variable or function is dead code that misleads readers.', '선언했지만 쓰지 않는 변수나 함수는 읽는 사람을 헷갈리게 하는 죽은 코드입니다.'],
  fix: ['Remove the declaration, or use it where it was meant to be used.', '선언을 지우거나 원래 쓰려던 곳에서 쓰세요.'],
}, (ctx) => {
  for (const s of ctx.scope.scopes) {
    for (const v of s.vars.values()) {
      if (!v.defs.length || v.exported || v.implicit) continue;
      const d = v.defs[0];
      if (!['var', 'let', 'const', 'function', 'class'].includes(d.kind)) continue;
      if (v.defs.some((x) => x.declare || x.overload)) continue;
      if (isVueOrScriptGlobal(ctx, v)) continue;
      if (v.name.startsWith('_')) continue;
      const self = d.kind === 'function' || d.kind === 'class' ? d.node : null;
      if (readOutside(v, self)) continue;
      if (d.node && d.node.type === 'VariableDeclarator') {
        const decl = d.node.parent;
        const loop = decl && decl.parent && (decl.parent.type === 'ForInStatement' || decl.parent.type === 'ForOfStatement') && decl.parent.left === decl;
        if (loop) continue;
        if (hasRestSibling(d.id)) continue;
        if (decl && decl.parent && decl.parent.type === 'ExportNamedDeclaration') continue;
      }
      if (d.node && (d.node.type === 'ClassDeclaration') && d.node.decorators && d.node.decorators.length) continue;
      const kindEn = d.kind === 'function' ? 'function' : d.kind === 'class' ? 'class' : 'variable';
      const kindKo = d.kind === 'function' ? '함수' : d.kind === 'class' ? '클래스' : '변수';
      ctx.report(d.id, m(`Remove the declaration of the unused ${kindEn} "${v.name}".`, `사용하지 않는 ${kindKo} "${v.name}"의 선언을 지우세요.`));
    }
  }
});

function jsxPragmas(ctx) {
  const names = new Set();
  for (const c of ctx.comments) {
    const mm = /@jsx(?:Frag)?\s+([\w$.]+)/.exec(c.value);
    if (mm) names.add(mm[1].split('.')[0]);
  }
  return names;
}

rule('unused-import', {
  t: 'S', s: 'MI', debt: 2, ref: 'S1128', tags: ['unused'],
  name: ['Unnecessary imports should be removed', '불필요한 import는 지워야 합니다'],
  why: ['Unused imports clutter the file, slow down bundling and may load modules for nothing.', '쓰지 않는 import는 파일을 어지럽히고 번들을 느리게 하며 모듈을 쓸데없이 불러옵니다.'],
  fix: ['Remove the unused import.', '쓰지 않는 import를 지우세요.'],
}, (ctx) => {
  if (/\.vue$/i.test(ctx.file)) return;
  const pragmas = ctx.scope.hasJsx ? jsxPragmas(ctx) : new Set();
  for (const v of ctx.scope.globalScope.vars.values()) {
    const d = v.defs[0];
    if (!d || d.kind !== 'import') continue;
    if (v.refs.some((r) => r.read)) continue;
    if (v.exported) continue;
    if (ctx.scope.hasJsx && (v.name === 'React' || v.name === 'h' || v.name === 'Fragment' || pragmas.has(v.name))) continue;
    // names referenced from JSDoc type comments
    if (ctx.comments.some((c) => c.value.includes('{') && new RegExp(`[{<(|,\\s]${v.name.replace(/\$/g, '\\$')}[}>)|,.\\s[]`).test(c.value))) continue;
    ctx.report(d.id, m(`Remove this unused import of "${v.name}".`, `사용하지 않는 "${v.name}" import를 지우세요.`));
  }
});

rule('unused-parameter', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1172', tags: ['unused'],
  name: ['Unused function parameters should be removed', '사용하지 않는 함수 매개변수는 지워야 합니다'],
  why: ['A trailing parameter that is never used makes callers pass values for nothing.', '쓰지 않는 뒤쪽 매개변수는 호출하는 쪽이 쓸데없이 값을 넘기게 합니다.'],
  fix: ['Remove the unused trailing parameters.', '쓰지 않는 뒤쪽 매개변수를 지우세요.'],
}, (ctx) => {
  for (const fn of ctx.functions()) {
    if (!fn.body || fn.body.type !== 'BlockStatement' || !fn.body.body.length) continue;
    // only plain function declarations / variables holding a function
    let v = null;
    if (fn.type === 'FunctionDeclaration' && fn.id) v = fn.id._var;
    else if (fn.parent && fn.parent.type === 'VariableDeclarator' && fn.parent.init === fn && fn.parent.id.type === 'Identifier') v = fn.parent.id._var;
    if (!v || v.exported || v.defs.some((d) => d.overload)) continue;
    // used as a value somewhere (callback, assignment) -> signature may be dictated
    if (v.refs.some((r) => r.read && !(r.id.parent && r.id.parent.type === 'CallExpression' && r.id.parent.callee === r.id))) continue;
    if (fn.type !== 'ArrowFunctionExpression' && U.contains(fn.body, (n) => n.type === 'Identifier' && n.name === 'arguments', false)) continue;
    const unused = [];
    for (let i = fn.params.length - 1; i >= 0; i--) {
      const p = fn.params[i];
      if (p.type !== 'Identifier' || p.name.startsWith('_') || p.name === 'this') break;
      const pv = p._var;
      if (!pv || pv.refs.some((r) => r.read)) break;
      unused.push(p);
    }
    for (const p of unused.reverse()) ctx.report(p, m(`Remove the unused function parameter "${p.name}".`, `사용하지 않는 함수 매개변수 "${p.name}"를 지우세요.`));
  }
});

rule('unused-private-member', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1068', tags: ['unused'],
  name: ['Unused private class members should be removed', '사용하지 않는 private 클래스 멤버는 지워야 합니다'],
  why: ['A private field or method that is never used is dead code.', '쓰지 않는 private 필드나 메서드는 죽은 코드입니다.'],
  fix: ['Remove the unused member.', '쓰지 않는 멤버를 지우세요.'],
}, (ctx) => {
  for (const body of ctx.nodes('ClassBody')) {
    const used = new Set();
    for (const me of U.findAll(body, (n) => n.type === 'MemberExpression', true)) {
      const p = me.property.type === 'PrivateIdentifier' ? `#${me.property.name}` : propName(me);
      if (p) used.add(p);
    }
    for (const b of U.findAll(body, (n) => n.type === 'BinaryExpression' && n.operator === 'in' && n.left.type === 'PrivateIdentifier', true)) used.add(`#${b.left.name}`);
    for (const pat of U.findAll(body, (n) => n.type === 'ObjectPattern', true)) for (const p of pat.properties) if (p.type === 'Property') { const k = keyName(p.key, p.computed); if (k) used.add(k); }
    for (const mbr of body.body) {
      if (mbr.type !== 'MethodDefinition' && mbr.type !== 'PropertyDefinition') continue;
      if (mbr.decorators && mbr.decorators.length) continue;
      if (mbr.kind === 'constructor') continue;
      const isPriv = mbr.key.type === 'PrivateIdentifier' || mbr.accessibility === 'private';
      if (!isPriv || mbr.computed) continue;
      const name = mbr.key.type === 'PrivateIdentifier' ? `#${mbr.key.name}` : keyName(mbr.key, false);
      if (!name || used.has(name)) continue;
      if ((mbr.kind === 'get' || mbr.kind === 'set')) continue;
      ctx.report(mbr.key, m(`Remove this unused private ${mbr.type === 'MethodDefinition' ? 'method' : 'field'} "${name}".`, `사용하지 않는 private ${mbr.type === 'MethodDefinition' ? '메서드' : '필드'} "${name}"를 지우세요.`));
    }
    const ctor = body.body.find((x) => x.type === 'MethodDefinition' && x.kind === 'constructor');
    if (ctor) {
      for (const p of ctor.value.params) {
        if (p.type !== 'TSParameterProperty' || p.accessibility !== 'private' || (p.decorators && p.decorators.length)) continue;
        const id = p.parameter.type === 'AssignmentPattern' ? p.parameter.left : p.parameter;
        if (id.type !== 'Identifier' || used.has(id.name)) continue;
        if (id._var && id._var.refs.some((r) => r.read)) continue;
        ctx.report(id, m(`Remove this unused private parameter property "${id.name}".`, `사용하지 않는 private 매개변수 속성 "${id.name}"를 지우세요.`));
      }
    }
  }
});

rule('unused-label', {
  t: 'S', s: 'MA', debt: 2, ref: 'S1065', tags: ['unused'],
  name: ['Unused labels should be removed', '사용하지 않는 레이블은 지워야 합니다'],
  why: ['A label that no break or continue refers to is noise and may hide a mistake.', 'break나 continue가 가리키지 않는 레이블은 잡음이며 실수를 숨길 수 있습니다.'],
  fix: ['Remove the label.', '레이블을 지우세요.'],
}, (ctx) => {
  for (const l of ctx.nodes('LabeledStatement')) {
    const name = l.label.name;
    if (!U.contains(l.body, (n) => (n.type === 'BreakStatement' || n.type === 'ContinueStatement') && n.label && n.label.name === name, false)) ctx.report(l.label, m(`Remove this unused label "${name}".`, `사용하지 않는 레이블 "${name}"를 지우세요.`));
  }
});

rule('redundant-jump', {
  t: 'S', s: 'MI', debt: 1, ref: 'S3626', tags: ['redundant', 'clumsy'],
  name: ['Jump statements should not be redundant', '제어 이동 문이 중복되면 안 됩니다'],
  why: ['A "return;" at the end of a function or a "continue;" at the end of a loop changes nothing.', '함수 끝의 "return;"이나 반복 끝의 "continue;"는 아무것도 바꾸지 않습니다.'],
  fix: ['Remove the redundant jump.', '중복된 제어 이동을 지우세요.'],
}, (ctx) => {
  for (const fn of ctx.functions()) {
    if (!fn.body || fn.body.type !== 'BlockStatement') continue;
    const last = fn.body.body[fn.body.body.length - 1];
    if (last && last.type === 'ReturnStatement' && !last.argument && fn.body.body.length > 1) ctx.report(last, m('Remove this redundant "return".', '중복된 "return"을 지우세요.'));
  }
  for (const loop of ctx.nodesOf('ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement')) {
    const b = loop.body;
    if (b.type !== 'BlockStatement' || b.body.length < 2) continue;
    const last = b.body[b.body.length - 1];
    if (last.type === 'ContinueStatement' && !last.label) ctx.report(last, m('Remove this redundant "continue".', '중복된 "continue"를 지우세요.'));
  }
});

function inTest(n) {
  const p = n.parent;
  if (!p) return false;
  if ((p.type === 'IfStatement' || p.type === 'WhileStatement' || p.type === 'DoWhileStatement' || p.type === 'ConditionalExpression' || p.type === 'ForStatement') && p.test === n) return true;
  if (p.type === 'UnaryExpression' && p.operator === '!') return true;
  if (p.type === 'LogicalExpression' && p.operator !== '??') return inTest(p);
  return false;
}

const isBool = (n) => { n = unwrapTS(n); return n.type === 'Literal' && typeof n.value === 'boolean'; };

rule('redundant-boolean', {
  t: 'S', s: 'MI', debt: 2, ref: 'S1125', tags: ['clumsy'],
  name: ['Boolean literals should not be redundant', '불리언 리터럴이 중복되면 안 됩니다'],
  why: ['Comparing with true / false or combining with a boolean literal only makes the expression longer.', 'true / false와 비교하거나 불리언 리터럴과 묶으면 식만 길어집니다.'],
  fix: ['Simplify: use x instead of x == true, !x instead of x == false.', '간단히 하세요: x == true 대신 x, x == false 대신 !x.'],
}, (ctx) => {
  for (const n of ctx.nodes('BinaryExpression')) {
    if ((n.operator === '==' || n.operator === '!=') && (isBool(n.left) || isBool(n.right))) ctx.report(n, m('Remove the unnecessary boolean literal.', '불필요한 불리언 리터럴을 지우세요.'));
  }
  for (const n of ctx.nodes('LogicalExpression')) {
    if (n.operator === '??') continue;
    if ((isBool(n.left) || isBool(n.right)) && inTest(n)) ctx.report(n, m('Remove the unnecessary boolean literal.', '불필요한 불리언 리터럴을 지우세요.'));
  }
  for (const n of ctx.nodes('UnaryExpression')) {
    if (n.operator === '!' && isBool(n.argument)) ctx.report(n, m('Remove the unnecessary boolean literal.', '불필요한 불리언 리터럴을 지우세요.'));
  }
});

rule('unneeded-ternary', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6644', tags: ['clumsy'],
  name: ['Ternary operators should not be used for boolean values or defaults', '불리언 값이나 기본값에 삼항 연산자를 쓰면 안 됩니다'],
  why: ['"c ? true : false" is just a boolean conversion and "a ? a : b" is "a || b".', '"c ? true : false"는 불리언 변환일 뿐이고 "a ? a : b"는 "a || b"입니다.'],
  fix: ['Use !!c, !c, or a || b.', '!!c, !c 또는 a || b를 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('ConditionalExpression')) {
    if (isBool(n.consequent) && isBool(n.alternate) && unwrapTS(n.consequent).value !== unwrapTS(n.alternate).value) ctx.report(n, m('Simplify this boolean ternary into a boolean expression.', '이 불리언 삼항식을 불리언 식으로 간단히 하세요.'));
    else if (equal(unwrapTS(n.test), unwrapTS(n.consequent)) && !B.hasSideEffects(n.test)) ctx.report(n, m(`Use "${ctx.text(n.test)} || ..." instead of repeating the test as the result.`, `검사를 결과로 반복하지 말고 "${ctx.text(n.test)} || ..."를 쓰세요.`));
  }
});

rule('prefer-const', {
  t: 'S', s: 'MI', debt: 2, ref: 'S3353', tags: ['es2015'],
  name: ['Unchanged variables should be marked "const"', '바뀌지 않는 변수는 "const"로 선언해야 합니다'],
  why: ['"let" announces that the value will change; when it never does, "const" states the intent and prevents accidents.', '"let"은 값이 바뀐다는 뜻입니다. 바뀌지 않으면 "const"가 의도를 밝히고 실수를 막습니다.'],
  fix: ['Declare the variable with const.', '변수를 const로 선언하세요.'],
}, (ctx) => {
  for (const decl of ctx.nodes('VariableDeclaration')) {
    if (decl.kind !== 'let' || decl.declare) continue;
    const p = decl.parent;
    if (p && p.type === 'ForStatement' && p.init === decl) continue;
    if (p && (p.type === 'ForInStatement' || p.type === 'ForOfStatement')) {
      // for (let x of xs) without reassignment
    }
    for (const d of decl.declarations) {
      const loopHead = p && (p.type === 'ForInStatement' || p.type === 'ForOfStatement');
      if (!d.init && !loopHead) continue;
      const ids = W.patternIds(d.id);
      if (!ids.length) continue;
      const vars = ids.map((id) => id._var).filter(Boolean);
      if (vars.length !== ids.length) continue;
      if (vars.some((v) => v.refs.some((r) => r.write && !r.init))) continue;
      // destructuring where only some bindings are reassigned is handled above; all constant here
      ctx.report(d.id, m(`"${ids.map((i) => i.name).join('", "')}" ${ids.length > 1 ? 'are' : 'is'} never reassigned. Use "const" instead of "let".`, `"${ids.map((i) => i.name).join('", "')}"는 다시 대입되지 않습니다. "let" 대신 "const"를 쓰세요.`));
    }
  }
});

rule('object-spread', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6661', tags: ['es2018'],
  name: ['Object spread syntax should be used instead of "Object.assign"', '"Object.assign" 대신 객체 전개 문법을 써야 합니다'],
  why: ['Object.assign({}, a, b) is longer and easier to get wrong than { ...a, ...b }.', 'Object.assign({}, a, b)는 { ...a, ...b }보다 길고 틀리기 쉽습니다.'],
  fix: ['Use { ...a, ...b }.', '{ ...a, ...b }를 쓰세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    if (dottedName(call.callee) !== 'Object.assign' || !B.isUnresolved(ctx, call.callee.object)) continue;
    const first = unwrapTS(call.arguments[0]);
    if (!first || first.type !== 'ObjectExpression') continue;
    if (call.arguments.some((a) => a.type === 'SpreadElement')) continue;
    ctx.report(call, m('Use an object spread instead of "Object.assign" with an object literal as first argument.', '첫 인자가 객체 리터럴인 "Object.assign" 대신 객체 전개를 쓰세요.'));
  }
});

function chainRootsOf(n) {
  // all prefixes of a member / call chain, excluding n itself
  const out = [];
  let cur = unwrapTS(n);
  for (;;) {
    if (cur.type === 'MemberExpression') { cur = unwrapTS(cur.object); out.push(cur); continue; }
    if (cur.type === 'CallExpression') { cur = unwrapTS(cur.callee); out.push(cur); continue; }
    break;
  }
  return out;
}

rule('prefer-optional-chain', {
  t: 'S', s: 'MI', debt: 5, ref: 'S6582', tags: ['es2020'],
  name: ['Optional chaining should be preferred', '옵셔널 체이닝을 우선해서 써야 합니다'],
  why: ['"a && a.b && a.b.c" repeats the same path; "a?.b?.c" is shorter and clearer.', '"a && a.b && a.b.c"는 같은 경로를 반복합니다. "a?.b?.c"가 더 짧고 명확합니다.'],
  fix: ['Use the optional chaining operator "?.".', '옵셔널 체이닝 연산자 "?."를 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('LogicalExpression')) {
    if (n.operator !== '&&') continue;
    if (n.parent && n.parent.type === 'LogicalExpression' && n.parent.operator === '&&' && n.parent.left === n) continue;
    // rightmost pair
    const left = unwrapTS(n.left.type === 'LogicalExpression' && n.left.operator === '&&' ? n.left.right : n.left);
    const right = unwrapTS(n.right);
    if (left.type !== 'Identifier' && left.type !== 'MemberExpression') continue;
    if (right.type !== 'MemberExpression' && right.type !== 'CallExpression') continue;
    if (left.type === 'MemberExpression' && (left.computed || B.hasSideEffects(left))) continue;
    const roots = chainRootsOf(right);
    if (!roots.some((r) => equal(r, left))) continue;
    if (inTest(n) === false && n.parent && n.parent.type === 'JSXExpressionContainer') continue;
    ctx.report(n, m(`Prefer using an optional chain expression instead, as it's more concise and easier to read ("${ctx.text(left)}?.").`, `더 짧고 읽기 쉬운 옵셔널 체인 식("${ctx.text(left)}?.")을 쓰세요.`));
  }
});

rule('useless-constructor', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6647', tags: ['redundant'],
  name: ['Unnecessary constructors should be removed', '불필요한 생성자는 지워야 합니다'],
  why: ['An empty constructor, or one that only forwards its arguments to super(), is what JavaScript does by default.', '빈 생성자나 인자를 super()에 넘기기만 하는 생성자는 JavaScript의 기본 동작과 같습니다.'],
  fix: ['Remove the constructor.', '생성자를 지우세요.'],
}, (ctx) => {
  for (const md of ctx.nodes('MethodDefinition')) {
    if (md.kind !== 'constructor' || !md.value.body) continue;
    if (md.accessibility === 'private' || md.accessibility === 'protected') continue;
    const fn = md.value;
    if (fn.params.some((p) => p.type === 'TSParameterProperty' || (p.decorators && p.decorators.length))) continue;
    const cls = md.parent.parent;
    const body = fn.body.body;
    // an explanatory comment inside the body keeps it (a trailing comment on the header line does not)
    const bodyLine = ctx.loc(fn.body.start).line;
    if (ctx.comments.some((c) => c.start > fn.body.start && c.end < fn.body.end && ctx.loc(c.start).line > bodyLine)) continue;
    if (!cls.superClass) {
      if (body.length === 0) ctx.report(md.key, m('Remove this useless empty constructor.', '쓸모없는 빈 생성자를 지우세요.'));
      continue;
    }
    if (body.length !== 1 || body[0].type !== 'ExpressionStatement') continue;
    const call = body[0].expression;
    if (call.type !== 'CallExpression' || call.callee.type !== 'Super') continue;
    const ps = fn.params;
    const args = call.arguments;
    let same = ps.length === args.length && ps.every((p, i) => {
      const a = args[i];
      if (p.type === 'Identifier' && a.type === 'Identifier') return p.name === a.name;
      if (p.type === 'RestElement' && a.type === 'SpreadElement') return p.argument.type === 'Identifier' && a.argument.type === 'Identifier' && p.argument.name === a.argument.name;
      return false;
    });
    if (ps.some((p) => p.typeAnnotation || (p.type === 'RestElement' && p.typeAnnotation))) same = same && ctx.ts === false;
    if (same) ctx.report(md.key, m('Remove this constructor; it only forwards its arguments to super().', '이 생성자를 지우세요. 인자를 super()에 넘기기만 합니다.'));
  }
});

rule('useless-catch', {
  t: 'S', s: 'MI', debt: 2, ref: 'S2737', tags: ['error-handling', 'clumsy'],
  name: ['"catch" clauses should do more than rethrow', '"catch" 절은 다시 던지는 것 이상을 해야 합니다'],
  why: ['A catch that only rethrows the same exception adds nesting without changing behaviour.', '같은 예외를 다시 던지기만 하는 catch는 동작은 그대로인 채 중첩만 늘립니다.'],
  fix: ['Remove the try/catch (keep finally if needed), or handle the error.', 'try/catch를 지우거나(필요하면 finally는 유지) 오류를 처리하세요.'],
}, (ctx) => {
  for (const c of ctx.nodes('CatchClause')) {
    if (!c.param || c.param.type !== 'Identifier') continue;
    const b = c.body.body;
    if (b.length === 1 && b[0].type === 'ThrowStatement' && b[0].argument.type === 'Identifier' && b[0].argument.name === c.param.name) ctx.report(c, m('Add logic to this catch clause or eliminate it and rethrow the exception automatically.', '이 catch 절에 처리 로직을 넣거나 catch를 없애 예외가 자동으로 전파되게 하세요.'));
  }
});

rule('useless-rename', {
  t: 'S', s: 'MI', debt: 1, ref: 'S6650', tags: ['redundant'],
  name: ['Renaming import, export and destructuring assignments should not be to the same name', 'import, export, 구조 분해에서 같은 이름으로 바꾸면 안 됩니다'],
  why: ['"a as a" or "{ a: a }" does nothing but add noise.', '"a as a"나 "{ a: a }"는 잡음만 더합니다.'],
  fix: ['Remove the redundant rename.', '중복된 이름 바꾸기를 지우세요.'],
}, (ctx) => {
  for (const sp of ctx.nodes('ImportSpecifier')) {
    if (sp.imported.type === 'Identifier' && sp.imported.name === sp.local.name && sp.local.start !== sp.imported.start) ctx.report(sp, m(`Remove the redundant rename of "${sp.local.name}".`, `"${sp.local.name}"의 중복된 이름 바꾸기를 지우세요.`));
  }
  for (const sp of ctx.nodes('ExportSpecifier')) {
    if (sp.local.type === 'Identifier' && sp.exported.type === 'Identifier' && sp.local.name === sp.exported.name && sp.local.start !== sp.exported.start) ctx.report(sp, m(`Remove the redundant rename of "${sp.local.name}".`, `"${sp.local.name}"의 중복된 이름 바꾸기를 지우세요.`));
  }
  for (const p of ctx.nodes('Property')) {
    if (!p.parent || p.parent.type !== 'ObjectPattern' || p.shorthand || p.computed) continue;
    const v = p.value.type === 'AssignmentPattern' ? p.value.left : p.value;
    if (p.key.type === 'Identifier' && v.type === 'Identifier' && p.key.name === v.name) ctx.report(p, m(`Remove the redundant rename of "${v.name}".`, `"${v.name}"의 중복된 이름 바꾸기를 지우세요.`));
  }
});

rule('useless-computed-key', {
  t: 'S', s: 'MI', debt: 1, ref: 'S6654', tags: ['redundant'],
  name: ['Computed keys should not be used with literals', '리터럴에 계산된 키를 쓰면 안 됩니다'],
  why: ['["name"]: value is the same as name: value with extra brackets.', '["name"]: value는 괄호만 더한 name: value와 같습니다.'],
  fix: ['Write the key directly.', '키를 직접 쓰세요.'],
}, (ctx) => {
  for (const p of ctx.nodesOf('Property', 'MethodDefinition', 'PropertyDefinition')) {
    if (!p.computed) continue;
    const k = unwrapTS(p.key);
    if (k.type !== 'Literal' || k.regex || (typeof k.value !== 'string' && typeof k.value !== 'number')) continue;
    if (k.value === '__proto__' || k.value === 'constructor') continue;
    if (p.parent && p.parent.type === 'ObjectPattern') continue;
    ctx.report(p.key, m(`Unnecessarily computed property [${k.raw}] found.`, `불필요하게 계산된 속성 [${k.raw}]가 있습니다.`));
  }
});

rule('useless-call', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6676', tags: ['redundant'],
  name: ['Calls to ".call()", ".apply()" and ".bind()" should not be redundant', '".call()", ".apply()", ".bind()" 호출이 중복되면 안 됩니다'],
  why: ['foo.call(undefined, a) is just foo(a), and binding a function that never uses "this" does nothing.', 'foo.call(undefined, a)는 foo(a)일 뿐이고 "this"를 쓰지 않는 함수를 bind해도 아무 일도 없습니다.'],
  fix: ['Call the function directly / remove the bind.', '함수를 직접 호출하거나 bind를 지우세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    if (c.type !== 'MemberExpression' || c.computed) continue;
    const p = propName(c);
    const fnExpr = unwrapTS(c.object);
    if (p === 'call' || p === 'apply') {
      const thisArg = call.arguments[0];
      if (!thisArg) continue;
      if (p === 'apply' && call.arguments[1] && unwrapTS(call.arguments[1]).type !== 'ArrayExpression') continue;
      let same = false;
      if (fnExpr.type === 'Identifier' && (W.isNullish(thisArg))) same = true;
      if (fnExpr.type === 'MemberExpression' && equal(unwrapTS(fnExpr.object), unwrapTS(thisArg)) && !B.hasSideEffects(thisArg)) same = true;
      if (same) ctx.report(call, m(`Unnecessary ".${p}()"; call "${ctx.text(fnExpr)}" directly.`, `불필요한 ".${p}()"입니다. "${ctx.text(fnExpr)}"를 직접 호출하세요.`));
    } else if (p === 'bind' && (fnExpr.type === 'FunctionExpression' || fnExpr.type === 'ArrowFunctionExpression') && call.arguments.length === 1) {
      if (fnExpr.type === 'ArrowFunctionExpression' || !U.usesThis(fnExpr)) ctx.report(call, m('The function does not use "this"; remove this ".bind()".', '함수가 "this"를 쓰지 않습니다. 이 ".bind()"를 지우세요.'));
    }
  }
});

rule('lonely-if', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6660', tags: ['clumsy'],
  name: ['"if" statements should not be the only statement in "else" blocks', '"else" 블록에 "if" 문 하나만 두면 안 됩니다'],
  why: ['"else { if (...) }" adds a nesting level that "else if" avoids.', '"else { if (...) }"는 "else if"로 피할 수 있는 중첩을 더합니다.'],
  fix: ['Use "else if".', '"else if"를 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('IfStatement')) {
    const a = n.alternate;
    if (a && a.type === 'BlockStatement' && a.body.length === 1 && a.body[0].type === 'IfStatement' && !ctx.comments.some((c) => c.start > a.start && c.end < a.end && (c.end <= a.body[0].start || c.start >= a.body[0].end))) ctx.report({ start: a.body[0].start, end: a.body[0].start + 2 }, m('"if" statement should not be the only statement in "else" block; use "else if".', '"else" 블록에 "if" 문만 있습니다. "else if"를 쓰세요.'));
  }
});

function returnsBool(s) {
  s = s && s.type === 'BlockStatement' && s.body.length === 1 ? s.body[0] : s;
  return s && s.type === 'ReturnStatement' && s.argument && isBool(s.argument) ? unwrapTS(s.argument).value : null;
}

rule('return-boolean', {
  t: 'S', s: 'MI', debt: 2, ref: 'S1126', tags: ['clumsy'],
  name: ['Return of boolean expressions should not be wrapped into an "if-then-else" statement', '불리언 식의 반환을 "if-else"로 감싸면 안 됩니다'],
  why: ['"if (c) return true; else return false;" is just "return c;".', '"if (c) return true; else return false;"는 "return c;"와 같습니다.'],
  fix: ['Return the condition directly (with !! if a boolean is required).', '조건을 바로 돌려주세요 (불리언이 필요하면 !!를 붙이세요).'],
}, (ctx) => {
  for (const n of ctx.nodes('IfStatement')) {
    const a = returnsBool(n.consequent);
    if (a === null) continue;
    let b = null;
    if (n.alternate) b = returnsBool(n.alternate);
    else {
      const list = n.parent && (n.parent.type === 'BlockStatement' || n.parent.type === 'Program') ? n.parent.body : null;
      const next = list && list[list.indexOf(n) + 1];
      if (next) b = returnsBool(next);
    }
    if (b !== null && a !== b) ctx.report({ start: n.start, end: n.start + 2 }, m('Replace this if-then-else flow by a single return statement.', '이 if-else 흐름을 return 문 하나로 바꾸세요.'));
  }
});

rule('immediately-returned', {
  t: 'S', s: 'MI', debt: 2, ref: 'S1488', tags: ['clumsy'],
  name: ['Local variables should not be declared and then immediately returned or thrown', '지역 변수를 선언하고 바로 반환하거나 던지면 안 됩니다'],
  why: ['A variable used only to return or throw the value on the next line adds nothing.', '다음 줄에서 반환하거나 던지기 위해서만 쓰는 변수는 아무것도 더하지 않습니다.'],
  fix: ['Return or throw the expression directly.', '식을 바로 반환하거나 던지세요.'],
}, (ctx) => {
  for (const blk of ctx.nodesOf('BlockStatement', 'StaticBlock')) {
    const list = blk.body;
    for (let i = 0; i + 1 < list.length; i++) {
      const d = list[i];
      const r = list[i + 1];
      if (d.type !== 'VariableDeclaration' || d.declarations.length !== 1 || d.kind === 'var') continue;
      const decl = d.declarations[0];
      if (decl.id.type !== 'Identifier' || !decl.init || decl.id.typeAnnotation) continue;
      if ((r.type !== 'ReturnStatement' && r.type !== 'ThrowStatement') || !r.argument) continue;
      const a = unwrapTS(r.argument);
      if (a.type !== 'Identifier' || a.name !== decl.id.name || r.argument !== a) continue;
      const v = decl.id._var;
      if (!v || v.refs.filter((x) => !x.init).length !== 1) continue;
      // a comment on its own line between the declaration and the return documents the variable
      if (ctx.comments.some((c) => c.start >= d.end && c.end <= r.start && ctx.loc(c.start).line > ctx.loc(d.end).line)) continue;
      ctx.report(decl.init, m(`Immediately ${r.type === 'ReturnStatement' ? 'return' : 'throw'} this expression instead of assigning it to the temporary variable "${v.name}".`, `임시 변수 "${v.name}"에 대입하지 말고 이 식을 바로 ${r.type === 'ReturnStatement' ? '반환' : '던지기'}하세요.`));
    }
  }
});

rule('lone-block', {
  t: 'S', s: 'MI', debt: 5, ref: 'S1199', tags: ['bad-practice'],
  name: ['Nested code blocks should not be used', '중첩된 코드 블록을 쓰면 안 됩니다'],
  why: ['A bare block does not create a function or condition; it usually means the code should be extracted.', '단독 블록은 함수나 조건을 만들지 않으며 보통 코드를 빼야 한다는 뜻입니다.'],
  fix: ['Remove the braces or extract a function.', '중괄호를 지우거나 함수로 빼세요.'],
}, (ctx) => {
  for (const b of ctx.nodes('BlockStatement')) {
    const p = b.parent;
    if (!p || !(p.type === 'BlockStatement' || p.type === 'Program' || p.type === 'StaticBlock')) continue;
    if (b.body.some((s) => (s.type === 'VariableDeclaration' && s.kind !== 'var') || s.type === 'ClassDeclaration' || s.type === 'FunctionDeclaration')) continue;
    ctx.report({ start: b.start, end: b.start + 1 }, m('Extract this nested code block into a function, or remove the braces.', '이 중첩 코드 블록을 함수로 빼거나 중괄호를 지우세요.'));
  }
});

rule('empty-statement', {
  t: 'S', s: 'MI', debt: 2, ref: 'S1116', tags: ['unused'],
  name: ['Extra semicolons should be removed', '여분의 세미콜론은 지워야 합니다'],
  why: ['Stray semicolons are noise and can hide a misplaced statement.', '떠도는 세미콜론은 잡음이며 잘못 놓인 문장을 숨길 수 있습니다.'],
  fix: ['Remove the semicolon.', '세미콜론을 지우세요.'],
}, (ctx) => {
  for (const e of ctx.nodes('EmptyStatement')) {
    const p = e.parent;
    if (!p || !(p.type === 'BlockStatement' || p.type === 'Program' || p.type === 'SwitchCase' || p.type === 'StaticBlock' || p.type === 'TSModuleBlock')) continue;
    ctx.report(e, m('Remove this empty statement.', '이 빈 문장을 지우세요.'));
  }
});

function hasCommentInside(ctx, node) {
  return ctx.comments.some((c) => c.start > node.start && c.end < node.end);
}

rule('empty-block', {
  t: 'S', s: 'MA', debt: 5, ref: 'S108', tags: ['suspicious'],
  name: ['Nested blocks of code should not be left empty', '중첩된 코드 블록을 비워 두면 안 됩니다'],
  why: ['An empty if, loop or try block is either unfinished code or a condition that should be removed.', '빈 if, 반복, try 블록은 덜 쓴 코드이거나 지워야 할 조건입니다.'],
  fix: ['Add the missing code, a comment explaining why it is empty, or remove the block.', '빠진 코드나 비어 있는 이유를 적은 주석을 넣거나 블록을 지우세요.'],
}, (ctx) => {
  for (const b of ctx.nodes('BlockStatement')) {
    if (b.body.length || hasCommentInside(ctx, b)) continue;
    const p = b.parent;
    if (!p || isFunction(p) || p.type === 'CatchClause' || p.type === 'StaticBlock') continue;
    if (p.type === 'TryStatement' && p.block === b && p.handler && p.handler.body.body.length) continue;
    if ((p.type === 'WhileStatement' || p.type === 'DoWhileStatement' || p.type === 'ForStatement') && p.body === b) {
      // busy-wait / do-nothing loops whose header has side effects are intentional
      const head = p.type === 'ForStatement' ? [p.test, p.update] : [p.test];
      if (head.some((h) => h && B.hasSideEffects(h))) continue;
    }
    ctx.report(b, m('Either remove or fill this block of code.', '이 코드 블록을 지우거나 채우세요.'));
  }
  for (const sw of ctx.nodes('SwitchStatement')) {
    if (!sw.cases.length && !hasCommentInside(ctx, sw)) ctx.report(sw, m('Either remove or fill this switch statement.', '이 switch 문을 지우거나 채우세요.'));
  }
});

rule('empty-function', {
  t: 'S', s: 'CR', debt: 5, ref: 'S1186', tags: ['suspicious'],
  name: ['Functions should not be empty', '함수를 비워 두면 안 됩니다'],
  why: ['An empty function is either unfinished or intentionally a no-op; without a comment readers cannot tell.', '빈 함수는 덜 썼거나 일부러 아무것도 안 하는 것인데 주석이 없으면 구별할 수 없습니다.'],
  fix: ['Implement the function, or add a comment explaining why it is empty.', '함수를 구현하거나 비어 있는 이유를 주석으로 적으세요.'],
}, (ctx) => {
  for (const fn of ctx.nodesOf('FunctionDeclaration', 'FunctionExpression')) {
    if (!fn.body || fn.body.body.length || hasCommentInside(ctx, fn.body)) continue;
    const p = fn.parent;
    if (p && (p.type === 'CallExpression' || p.type === 'NewExpression') && p.arguments.includes(fn)) continue;
    if (p && p.type === 'AssignmentPattern') continue;
    if (p && p.type === 'MethodDefinition' && (p.kind === 'constructor' || p.override || p.parent.parent.superClass)) continue;
    const name = W.functionName(fn);
    if (name && /^(noop|nop|noOp|empty|ignore|identity|_)/i.test(name)) continue;
    ctx.report(fnHead(fn), m(`Add a nested comment explaining why ${fnLabel(fn)} is empty, or complete the implementation.`, `${fnLabelKo(fn)}가 비어 있는 이유를 주석으로 적거나 구현을 마치세요.`));
  }
});

rule('empty-catch', {
  t: 'S', s: 'MI', debt: 5, ref: 'S2486', cwe: 'CWE-390', tags: ['error-handling'],
  name: ['Exceptions should not be ignored', '예외를 무시하면 안 됩니다'],
  why: ['An empty catch block silently swallows errors, which makes failures very hard to diagnose.', '빈 catch 블록은 오류를 조용히 삼켜 문제를 찾기 매우 어렵게 합니다.'],
  fix: ['Handle or log the exception, or add a comment explaining why it can be ignored.', '예외를 처리하거나 기록하거나 무시해도 되는 이유를 주석으로 적으세요.'],
}, (ctx) => {
  for (const c of ctx.nodes('CatchClause')) {
    if (c.body.body.length || hasCommentInside(ctx, c.body)) continue;
    ctx.report(c, m('Handle this exception or don\'t catch it at all.', '이 예외를 처리하거나 아예 잡지 마세요.'));
  }
});

// ---------------------------------------------------------------- naming
rule('function-naming', {
  t: 'S', s: 'MI', debt: 5, ref: 'S100', tags: ['convention'],
  name: ['Function and method names should comply with a naming convention', '함수와 메서드 이름은 명명 규칙을 따라야 합니다'],
  why: ['Consistent camelCase names make code easier to read and search.', '일관된 camelCase 이름은 코드를 읽고 찾기 쉽게 합니다.'],
  fix: ['Rename to camelCase (or PascalCase for components and constructors).', 'camelCase(컴포넌트와 생성자는 PascalCase)로 이름을 바꾸세요.'],
}, (ctx) => {
  const ok = /^[_$]*[a-zA-Z][a-zA-Z0-9$]*$/;
  for (const fn of ctx.nodes('FunctionDeclaration')) {
    if (fn.id && !ok.test(fn.id.name)) ctx.report(fn.id, m(`Rename this function "${fn.id.name}" to match the regular expression ^[_a-zA-Z][a-zA-Z0-9]*$.`, `함수 "${fn.id.name}"의 이름을 정규식 ^[_a-zA-Z][a-zA-Z0-9]*$에 맞게 바꾸세요.`));
  }
  for (const md of ctx.nodes('MethodDefinition')) {
    if (md.computed || md.key.type !== 'Identifier') continue;
    if (!ok.test(md.key.name) && !/^[A-Z0-9_]+$/.test(md.key.name) && !/^UNSAFE_/.test(md.key.name)) ctx.report(md.key, m(`Rename this method "${md.key.name}" to match the regular expression ^[_a-zA-Z][a-zA-Z0-9]*$.`, `메서드 "${md.key.name}"의 이름을 정규식 ^[_a-zA-Z][a-zA-Z0-9]*$에 맞게 바꾸세요.`));
  }
});

rule('class-naming', {
  t: 'S', s: 'MI', debt: 5, ref: 'S101', tags: ['convention'],
  name: ['Class and interface names should comply with a naming convention', '클래스와 인터페이스 이름은 명명 규칙을 따라야 합니다'],
  why: ['PascalCase type names distinguish types from values at a glance.', 'PascalCase 타입 이름은 타입과 값을 한눈에 구별하게 합니다.'],
  fix: ['Rename to PascalCase.', 'PascalCase로 이름을 바꾸세요.'],
}, (ctx) => {
  const ok = /^[A-Z][a-zA-Z0-9]*$/;
  for (const n of ctx.nodesOf('ClassDeclaration', 'ClassExpression', 'TSInterfaceDeclaration', 'TSEnumDeclaration')) {
    if (n.id && !ok.test(n.id.name)) ctx.report(n.id, m(`Rename "${n.id.name}" to match the regular expression ^[A-Z][a-zA-Z0-9]*$.`, `"${n.id.name}"의 이름을 정규식 ^[A-Z][a-zA-Z0-9]*$에 맞게 바꾸세요.`));
  }
});

rule('variable-naming', {
  t: 'S', s: 'MI', debt: 2, ref: 'S117', tags: ['convention'],
  name: ['Variable, property and parameter names should comply with a naming convention', '변수, 속성, 매개변수 이름은 명명 규칙을 따라야 합니다'],
  why: ['Mixed naming styles (snake_case next to camelCase) make code harder to read.', '섞인 명명 방식(camelCase 옆의 snake_case)은 코드를 읽기 어렵게 합니다.'],
  fix: ['Use camelCase, or UPPER_SNAKE_CASE for constants.', 'camelCase를 쓰고 상수는 UPPER_SNAKE_CASE를 쓰세요.'],
}, (ctx) => {
  const ok = /^[_$]*[A-Za-z][$A-Za-z0-9]*$|^[_$A-Z][_$A-Z0-9]*$/;
  for (const s of ctx.scope.scopes) {
    if (s.type === 'global' && !ctx.isModule) continue;
    for (const v of s.vars.values()) {
      const d = v.defs[0];
      if (!d || !['var', 'let', 'const', 'param'].includes(d.kind)) continue;
      if (ok.test(v.name)) continue;
      // destructured API fields keep their names
      const p = d.id.parent;
      if (p && p.type === 'Property' && p.shorthand) continue;
      if (p && p.type === 'AssignmentPattern' && p.parent && p.parent.type === 'Property' && p.parent.shorthand) continue;
      if (d.declare) continue;
      ctx.report(d.id, m(`Rename this local ${d.kind === 'param' ? 'parameter' : 'variable'} "${v.name}" to match the regular expression ^[_$A-Za-z][$A-Za-z0-9]*$|^[_$A-Z][_$A-Z0-9]+$.`, `지역 ${d.kind === 'param' ? '매개변수' : '변수'} "${v.name}"의 이름을 camelCase나 UPPER_SNAKE_CASE로 바꾸세요.`));
    }
  }
});

rule('redeclaration', {
  t: 'S', s: 'MA', debt: 5, ref: 'S2814', tags: ['suspicious'],
  name: ['Variables and functions should not be redeclared', '변수와 함수를 다시 선언하면 안 됩니다'],
  why: ['Declaring the same name twice in a scope silently replaces the first binding.', '한 범위에서 같은 이름을 두 번 선언하면 첫 바인딩이 조용히 대체됩니다.'],
  fix: ['Rename one of them, or reuse the existing variable.', '한쪽 이름을 바꾸거나 기존 변수를 다시 쓰세요.'],
}, (ctx) => {
  for (const s of ctx.scope.scopes) {
    for (const v of s.vars.values()) {
      if (v.defs.length < 2) continue;
      const defs = v.defs.filter((d) => ['var', 'function', 'param', 'let', 'const', 'class'].includes(d.kind) && !d.overload && !d.declare);
      if (defs.length < 2) continue;
      if (v.defs.some((d) => d.kind === 'interface' || d.kind === 'namespace' || d.kind === 'enum' || d.kind === 'type')) continue;
      for (let i = 1; i < defs.length; i++) {
        const d = defs[i];
        if (d.kind === 'param' && defs[i - 1].kind === 'param') continue;
        if (d.kind === 'function' && defs.slice(0, i).every((x) => x.kind === 'function') && ctx.ts) continue;
        ctx.report(d.id, m(`"${v.name}" is already declared on line ${ctx.line(defs[0].id)}.`, `"${v.name}"는 ${ctx.line(defs[0].id)}번 줄에서 이미 선언했습니다.`));
      }
    }
  }
});

rule('shadowed-variable', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1117', tags: ['suspicious', 'pitfall'],
  name: ['Variables should not be shadowed', '변수가 다른 변수를 가리면 안 됩니다'],
  why: ['A local declaration with the same name as an outer variable hides it; reads meant for the outer one silently get the inner one.', '바깥 변수와 이름이 같은 지역 선언은 그것을 가립니다. 바깥 변수를 읽으려던 곳이 조용히 안쪽 변수를 읽습니다.'],
  fix: ['Rename the inner variable.', '안쪽 변수의 이름을 바꾸세요.'],
}, (ctx) => {
  for (const s of ctx.scope.scopes) {
    if (s.type === 'global' || s.type === 'module' || s.type === 'class' || s.type === 'function-name') continue;
    for (const v of s.vars.values()) {
      const d = v.defs[0];
      if (!d || !['var', 'let', 'const', 'function', 'class'].includes(d.kind)) continue;
      if (v.name === '_' || v.name.length < 2 && v.name !== 'i') continue;
      let outer = null;
      for (let p = s.parent; p; p = p.parent) {
        if (p.type === 'global' || p.type === 'module') break;
        const o = p.vars.get(v.name);
        if (o && !o.implicit && o.defs.length && !o.isTypeOnly() && o.defs[0].kind !== 'function-name' && o.defs[0].kind !== 'class-name') { outer = o; break; }
      }
      if (!outer) continue;
      if (outer.defs[0].id && outer.defs[0].id.start > d.id.start) continue;
      ctx.report(d.id, m(`"${v.name}" shadows a variable declared on line ${ctx.line(outer.defs[0].id)}.`, `"${v.name}"는 ${ctx.line(outer.defs[0].id)}번 줄에서 선언한 변수를 가립니다.`));
    }
  }
});

rule('return-await', {
  t: 'S', s: 'MI', debt: 1, ref: 'S4326', tags: ['async', 'redundant'],
  name: ['"await" should not be used redundantly', '"await"를 중복해서 쓰면 안 됩니다'],
  why: ['"return await x" outside a try block waits for no reason; returning the promise has the same effect.', 'try 블록 밖의 "return await x"는 이유 없이 기다립니다. Promise를 돌려줘도 효과는 같습니다.'],
  fix: ['Return the promise directly.', 'Promise를 바로 돌려주세요.'],
}, (ctx) => {
  for (const r of ctx.nodes('ReturnStatement')) {
    const a = r.argument;
    if (!a || a.type !== 'AwaitExpression') continue;
    let p = r.parent;
    let inTry = false;
    let child = r;
    while (p && !isFunction(p)) {
      if (p.type === 'TryStatement' && (p.block === child)) { inTry = true; break; }
      if (p.type === 'CatchClause' && p.parent.finalizer) { inTry = true; break; }
      child = p;
      p = p.parent;
    }
    if (!inTry) ctx.report(a, m('Redundant use of "await" on a return value.', '반환값에 쓴 "await"가 중복됩니다.'));
  }
});

rule('await-non-promise', {
  t: 'S', s: 'CR', debt: 1, ref: 'S4123', tags: ['async', 'confusing'],
  name: ['"await" should only be used with promises', '"await"는 Promise에만 써야 합니다'],
  why: ['Awaiting a plain value just delays the code by a microtask and misleads readers.', '일반 값을 기다리면 마이크로태스크만큼 지연될 뿐이고 읽는 사람을 헷갈리게 합니다.'],
  fix: ['Remove the "await".', '"await"를 지우세요.'],
}, (ctx) => {
  for (const a of ctx.nodes('AwaitExpression')) {
    const x = unwrapTS(a.argument);
    if ((x.type === 'Literal') || x.type === 'TemplateLiteral' || x.type === 'ArrayExpression' || x.type === 'ObjectExpression' || x.type === 'ArrowFunctionExpression' || x.type === 'FunctionExpression' || x.type === 'ClassExpression' || W.isUndefined(x) || (x.type === 'UnaryExpression' && x.operator !== 'void' && x.operator !== 'delete') || (x.type === 'BinaryExpression' && x.operator !== 'in' && x.operator !== 'instanceof' && false)) ctx.report(a, m('Unexpected "await" of a non-Promise (non-"Thenable") value.', 'Promise(Thenable)가 아닌 값에 "await"를 썼습니다.'));
  }
});

rule('var-scope', {
  t: 'S', s: 'MA', debt: 5, ref: 'S2392', tags: ['pitfall'],
  name: ['Variables should be used in the blocks where they are declared', '변수는 선언한 블록 안에서 써야 합니다'],
  why: ['"var" is function-scoped, so using it outside the block that declares it works by accident and confuses readers.', '"var"는 함수 범위라 선언한 블록 밖에서 써도 우연히 동작해 읽는 사람을 헷갈리게 합니다.'],
  fix: ['Declare the variable with let / const in the outer block.', '바깥 블록에서 let / const로 선언하세요.'],
}, (ctx) => {
  for (const decl of ctx.nodes('VariableDeclaration')) {
    if (decl.kind !== 'var') continue;
    // nearest enclosing block that is not the function body
    let blk = decl.parent;
    if (blk && (blk.type === 'ForStatement' || blk.type === 'ForInStatement' || blk.type === 'ForOfStatement')) {
      // the for statement itself is the block
    } else if (!blk || blk.type !== 'BlockStatement' || isFunction(blk.parent) || blk.parent.type === 'Program') continue;
    for (const d of decl.declarations) {
      for (const id of W.patternIds(d.id)) {
        const v = id._var;
        if (!v || v.defs.length !== 1) continue;
        const outside = v.refs.find((r) => !r.init && (r.id.start < blk.start || r.id.end > blk.end));
        if (outside) ctx.report(outside.id, m(`Consider moving the declaration of "${v.name}" (line ${ctx.line(id)}) to the outer block, or using let.`, `"${v.name}"의 선언(${ctx.line(id)}번 줄)을 바깥 블록으로 옮기거나 let을 쓰세요.`));
      }
    }
  }
});

// Commented-out code: comments that parse as statements.
const CODE_HINT = /[;{}()=]|\b(return|if|for|while|const|let|var|function|import|export|await|console\.)\b/;
function looksLikeCode(text) {
  const t = text.trim();
  if (t.length < 4) return false;
  if (!CODE_HINT.test(t)) return false;
  if (/^(eslint|@ts-|prettier|istanbul|c8|jshint|global|jslint|#region|#endregion|@flow|@jsx|@vite|webpack|tslint|noinspection|NOMCC|TODO|FIXME|XXX|HACK|NOTE)/i.test(t)) return false;
  if (/^https?:\/\//.test(t)) return false;
  // section rulers: // ---- name (1 - 2) ----, // ==== x ====
  if (/^(?:-{2,}|={2,}|\*{2,}|#{2,}|\/{2,})/.test(t)) return false;
  let ast;
  try { ast = parse(t, { ts: true, jsx: false }); } catch {
    try { ast = parse(t, { ts: false, jsx: true }); } catch { return false; }
  }
  if (!ast.body.length) return false;
  // natural-language sentences sometimes parse as identifiers / labels / binaries; demand real code shape
  let codeish = 0;
  for (const s of ast.body) {
    switch (s.type) {
      case 'ExpressionStatement': {
        const e = s.expression;
        if (e.type === 'CallExpression' || e.type === 'AssignmentExpression' || e.type === 'UpdateExpression' || e.type === 'AwaitExpression' || e.type === 'NewExpression') codeish++;
        else if (e.type === 'Identifier' || e.type === 'Literal' || e.type === 'BinaryExpression' || e.type === 'SequenceExpression' || e.type === 'MemberExpression' || e.type === 'LogicalExpression' || e.type === 'TemplateLiteral' || e.type === 'UnaryExpression' || e.type === 'TSAsExpression') return false;
        else codeish++;
        break;
      }
      case 'LabeledStatement': case 'EmptyStatement': case 'BlockStatement': case 'DirectiveStatement': return false;
      case 'TSTypeAliasDeclaration': case 'TSInterfaceDeclaration': case 'TSModuleDeclaration': return false;
      default: codeish++;
    }
  }
  if (!codeish) return false;
  // single call expression made of words like "see(foo)" in prose
  // judge the end of the code itself, not a trailing comment inside the commented-out text
  const code = t.slice(0, ast.body[ast.body.length - 1].end);
  if (ast.body.length === 1 && ast.body[0].type === 'ExpressionStatement' && ast.body[0].expression.type === 'CallExpression' && !/[;]\s*$|\)\s*$/.test(code)) return false;
  if (ast.body.length === 1 && ast.body[0].type === 'ExpressionStatement' && !/[;)\]}]\s*$/.test(code)) return false;
  if (ast.body.length === 1) {
    const st = ast.body[0];
    // prose: "word (an aside)" is not a call, "return value" is not a statement
    if (st.type === 'ExpressionStatement' && st.expression.type === 'CallExpression' && /^\s+\(/.test(code.slice(st.expression.callee.end - st.start)) && !/;\s*$/.test(code)) return false;
    if ((st.type === 'ReturnStatement' || st.type === 'ThrowStatement') && !/[;(){}[\].=]/.test(code.slice(code.indexOf(' ') + 1))) return false;
  }
  return true;
}

rule('commented-code', {
  t: 'S', s: 'MA', debt: 5, ref: 'S125', tags: ['unused'],
  name: ['Sections of code should not be commented out', '코드를 주석으로 막아 두면 안 됩니다'],
  why: ['Commented-out code rots quickly, distracts readers and is kept in version control anyway.', '주석 처리한 코드는 금방 낡고 읽는 사람을 방해하며 어차피 버전 관리에 남아 있습니다.'],
  fix: ['Remove the commented-out code.', '주석 처리한 코드를 지우세요.'],
}, (ctx) => {
  const cs = ctx.comments;
  const groups = [];
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (c.type === 'Block') {
      if (c.value.startsWith('*') || /^\s*(@license|!)/.test(c.value)) continue;
      groups.push({ start: c.start, end: c.end, text: c.value.split(/\r?\n/).map((l) => l.replace(/^\s*\*?\s?/, '')).join('\n') });
      continue;
    }
    // merge consecutive line comments
    let text = c.value;
    let end = c.end;
    let j = i;
    while (j + 1 < cs.length && cs[j + 1].type === 'Line' && /^[ \t]*\r?\n[ \t]*$/.test(ctx.src.slice(cs[j].end, cs[j + 1].start))) { j++; text += `\n${cs[j].value}`; end = cs[j].end; }
    groups.push({ start: c.start, end, text });
    i = j;
  }
  for (const g of groups) {
    // skip trailing comments on code lines
    const lineStart = ctx.src.lastIndexOf('\n', g.start - 1) + 1;
    if (ctx.src.slice(lineStart, g.start).trim()) continue;
    if (g.text.length > 4000) continue;
    if (looksLikeCode(g.text)) ctx.report({ start: g.start, end: g.start + 2 }, m('Remove this commented out code.', '주석 처리한 이 코드를 지우세요.'));
  }
});

// Calls that never return: process.exit() and the Next.js navigation helpers
// (redirect, notFound, ...), which throw to leave the request.
const NEXT_NO_RETURN = new Set(['redirect', 'permanentRedirect', 'notFound', 'unauthorized', 'forbidden']);
function neverReturns(ctx, el) {
  let e = el && unwrapTS(el);
  if (e && e.type === 'AwaitExpression') e = unwrapTS(e.argument);
  if (!e || e.type !== 'CallExpression') return false;
  const t = ctx.target(e.callee);
  if (!t) return false;
  if (t.global && t.name === 'process.exit') return true;
  return /^next(?:\/|$)/.test(t.module || '') && NEXT_NO_RETURN.has(t.path[t.path.length - 1]);
}

// The function is the callback of an effect hook: returning nothing or a
// cleanup function is the hook's contract.
function isEffectCallback(fn) {
  const p = fn.parent;
  if (!p || p.type !== 'CallExpression' || p.arguments[0] !== fn) return false;
  const c = unwrapTS(p.callee);
  const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : '';
  return /^use(?:Layout|Insertion)?Effect$/.test(name);
}

// "return void x" and "return f()" where f is typed "() => void" give no value.
function noValue(ctx, arg) {
  const a = unwrapTS(arg);
  if (!a || W.isUndefined(a)) return true;
  if (a.type === 'UnaryExpression' && a.operator === 'void') return true;
  if (a.type === 'CallExpression' && a.callee.type === 'Identifier') {
    const v = ctx.varOf(a.callee);
    const d = v && v.defs.length === 1 && v.defs[0];
    const id = d && d.id;
    const ann = id && id.typeAnnotation && id.typeAnnotation.typeAnnotation;
    if (ann && ann.type === 'TSFunctionType') {
      const rt = ann.returnType && ann.returnType.typeAnnotation;
      if (rt && rt.type === 'TSVoidKeyword') return true;
    }
  }
  return false;
}

rule('consistent-return', {
  t: 'S', s: 'MA', debt: 5, ref: 'S3801', tags: ['confusing'],
  name: ['Functions should use "return" consistently', '함수는 "return"을 일관되게 써야 합니다'],
  why: ['Returning a value on some paths and nothing on others makes callers receive undefined unexpectedly.', '일부 경로에서만 값을 돌려주면 호출하는 쪽이 예상치 못하게 undefined를 받습니다.'],
  fix: ['Return a value on every path, or on none.', '모든 경로에서 값을 돌려주거나 어디에서도 돌려주지 마세요.'],
}, (ctx) => {
  for (const fn of ctx.functions()) {
    if (!fn.body || fn.body.type !== 'BlockStatement' || fn.generator) continue;
    if (fn.returnType) {
      const t = fn.returnType.typeAnnotation;
      if (t.type === 'TSUnionType' && t.types.some((x) => x.type === 'TSUndefinedKeyword' || x.type === 'TSVoidKeyword')) continue;
      if (t.type === 'TSVoidKeyword' || t.type === 'TSUndefinedKeyword' || t.type === 'TSAnyKeyword' || t.type === 'TSUnknownKeyword') continue;
    }
    if (isEffectCallback(fn)) continue;
    const rets = B.ownReturns(fn);
    const withVal = rets.filter((r) => r.argument && !noValue(ctx, r.argument));
    if (!withVal.length) continue;
    const bare = rets.find((r) => !r.argument);
    let cfg;
    try { cfg = ctx.cfg(fn); } catch { continue; }
    // falling off after process.exit() / redirect() does not return undefined
    const fallsOff = cfg.fallsOff && cfg.exit.pred.some((b) => b.reachable && b.fallsOff && !neverReturns(ctx, b.elements[b.elements.length - 1]));
    if (bare || fallsOff) {
      ctx.report(fnHead(fn), m(`Refactor ${fnLabel(fn)} to use "return" consistently${bare ? '' : '; it can end without returning a value'}.`, `${fnLabelKo(fn)}가 "return"을 일관되게 쓰도록 고치세요${bare ? '' : '. 값을 돌려주지 않고 끝날 수 있습니다'}.`));
    }
  }
});

const INVERSE = { '==': '!=', '!=': '==', '===': '!==', '!==': '===', '<': '>=', '>': '<=', '<=': '>', '>=': '<' };

rule('boolean-inversion', {
  t: 'S', s: 'MI', debt: 2, ref: 'S1940', tags: ['pitfall'],
  name: ['Boolean checks should not be inverted', '불리언 검사를 뒤집어 쓰면 안 됩니다'],
  why: ['"!(a == b)" is harder to read than "a != b".', '"!(a == b)"는 "a != b"보다 읽기 어렵습니다.'],
  fix: ['Use the opposite operator.', '반대 연산자를 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('UnaryExpression')) {
    if (n.operator !== '!') continue;
    const a = n.argument;
    if (a.type === 'BinaryExpression' && INVERSE[a.operator] && a.parenthesized) ctx.report(n, m(`Use the opposite operator ("${INVERSE[a.operator]}") instead.`, `대신 반대 연산자("${INVERSE[a.operator]}")를 쓰세요.`));
  }
});

rule('param-order', {
  t: 'S', s: 'MA', debt: 5, ref: 'S2234', tags: ['suspicious'],
  name: ['Parameters should be passed in the correct order', '인자는 올바른 순서로 넘겨야 합니다'],
  why: ['The arguments have the same names as the parameters but in a different order, which is very likely a mistake.', '인자 이름이 매개변수 이름과 같지만 순서가 달라 실수일 가능성이 큽니다.'],
  fix: ['Swap the arguments back to the declared order.', '인자를 선언한 순서로 되돌리세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const fn = B.localFunction(ctx, call.callee);
    if (!fn) continue;
    const names = fn.params.map((p) => (p.type === 'Identifier' ? p.name : p.type === 'AssignmentPattern' && p.left.type === 'Identifier' ? p.left.name : null));
    const args = call.arguments.map((a) => (a.type === 'Identifier' ? a.name : null));
    let swapped = false;
    for (let i = 0; i < args.length && !swapped; i++) {
      if (!args[i] || args[i] === names[i]) continue;
      const j = names.indexOf(args[i]);
      if (j >= 0 && j !== i && args[j] === names[i]) swapped = true;
    }
    if (swapped) ctx.report(call, m(`Arguments to "${ctx.text(call.callee)}" have the same names but not the same order as the function parameters.`, `"${ctx.text(call.callee)}"의 인자 이름이 매개변수와 같지만 순서가 다릅니다.`));
  }
});

rule('too-many-cases', {
  t: 'S', s: 'MA', debt: 30, ref: 'S1479', tags: ['brain-overload'],
  name: ['"switch" statements should not have too many "case" clauses', '"switch" 문에 "case"가 너무 많으면 안 됩니다'],
  why: ['A very long switch is hard to maintain; a lookup table or polymorphism is usually clearer.', '아주 긴 switch는 유지보수가 어렵습니다. 조회 표나 다형성이 보통 더 명확합니다.'],
  fix: ['Replace the switch with a map of handlers.', 'switch를 처리기 맵으로 바꾸세요.'],
}, (ctx) => {
  const max = opt(ctx, 'maxSwitchCases', 30);
  for (const sw of ctx.nodes('SwitchStatement')) {
    const n = sw.cases.filter((c) => c.test).length;
    if (n > max) ctx.report({ start: sw.start, end: sw.start + 6 }, m(`Reduce the number of non-empty switch cases from ${n} to at most ${max}.`, `switch case 수를 ${n}개에서 ${max}개 이하로 줄이세요.`));
  }
});

rule('switch-few-cases', {
  t: 'S', s: 'MI', debt: 5, ref: 'S1301', tags: ['bad-practice'],
  name: ['"switch" statements should have at least 3 "case" clauses', '"switch" 문에는 "case"가 3개 이상 있어야 합니다'],
  why: ['A switch with one or two branches is more naturally written as an if statement.', '분기가 한두 개인 switch는 if 문이 더 자연스럽습니다.'],
  fix: ['Replace the switch with if / else.', 'switch를 if / else로 바꾸세요.'],
}, (ctx) => {
  for (const sw of ctx.nodes('SwitchStatement')) {
    if (sw.cases.length > 0 && sw.cases.length < 3 && !(sw.cases.length === 2 && sw.cases.every((c) => c.test) === false && false)) {
      if (sw.cases.length === 1 && !sw.cases[0].test) continue;
      ctx.report({ start: sw.start, end: sw.start + 6 }, m('Replace this "switch" statement by "if" statements to increase readability.', '가독성을 위해 이 "switch" 문을 "if" 문으로 바꾸세요.'));
    }
  }
});

rule('constructor-name-case', {
  t: 'S', s: 'MA', debt: 5, ref: 'S2430', tags: ['convention'],
  name: ['Constructor names should start with an upper case letter', '생성자 이름은 대문자로 시작해야 합니다'],
  why: ['"new" with a lowercase name hides that a constructor is called, and lowercase functions are rarely meant to be constructed.', '소문자 이름에 "new"를 쓰면 생성자 호출이 드러나지 않고 소문자 함수는 거의 생성용이 아닙니다.'],
  fix: ['Rename the constructor with an upper case first letter.', '생성자 이름의 첫 글자를 대문자로 바꾸세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('NewExpression')) {
    const c = unwrapTS(n.callee);
    if (c.type === 'Identifier' && /^[a-z]/.test(c.name) && c._ref && c._ref.resolved) ctx.report(c, m(`Rename this constructor "${c.name}" to start with an upper case letter.`, `생성자 "${c.name}"의 이름이 대문자로 시작하도록 바꾸세요.`));
  }
});

rule('this-global', {
  t: 'S', s: 'MA', debt: 5, ref: 'S2990', tags: ['pitfall'],
  name: ['The global "this" object should not be used', '전역 "this" 객체를 쓰면 안 됩니다'],
  why: ['At the top level of an ES module "this" is undefined; code relying on it breaks.', 'ES 모듈의 최상위에서 "this"는 undefined라 이에 기대는 코드는 깨집니다.'],
  fix: ['Use globalThis, window or an explicit object.', 'globalThis, window 또는 명시적인 객체를 쓰세요.'],
}, (ctx) => {
  if (ctx.ast.sourceType !== 'module') return;
  for (const t of ctx.nodes('ThisExpression')) {
    let p = t.parent;
    let top = true;
    while (p) {
      // arrow functions inherit the module-level "this"
      if ((isFunction(p) && p.type !== 'ArrowFunctionExpression') || p.type === 'ClassBody' || p.type === 'PropertyDefinition') { top = false; break; }
      p = p.parent;
    }
    if (top) ctx.report(t, m('Remove the use of "this"; it is undefined at the top level of a module.', '"this"를 지우세요. 모듈 최상위에서는 undefined입니다.'));
  }
});

const WRITABLE_GLOBALS = new Set(['exports', 'module', 'location', 'name', 'status', 'onload', 'onerror', 'onmessage', 'onbeforeunload', 'onresize', 'onunload', 'onpopstate', 'onhashchange', 'onkeydown', 'onkeyup', 'onclick', 'onscroll', 'onfocus', 'onblur', 'opener', 'self', 'top', 'parent', 'defaultStatus', 'require', 'process', 'global']);

rule('implicit-global', {
  t: 'S', s: 'CR', debt: 5, ref: 'S2703', tags: ['pitfall'],
  name: ['Variables should be declared explicitly', '변수는 명시적으로 선언해야 합니다'],
  why: ['Assigning to an undeclared name creates a global in sloppy mode and throws a ReferenceError in strict mode and modules.', '선언하지 않은 이름에 대입하면 느슨한 모드에서는 전역이 생기고 strict 모드와 모듈에서는 ReferenceError가 납니다.'],
  fix: ['Declare the variable with let / const.', 'let / const로 변수를 선언하세요.'],
}, (ctx) => {
  const done = new Set();
  for (const r of ctx.scope.through) {
    if (!r.write || r.type) continue;
    const n = r.id.name;
    if (WRITABLE_GLOBALS.has(n) || done.has(n) || /^on[a-z]+$/.test(n)) continue;
    if (['undefined', 'NaN', 'Infinity', 'window', 'document', 'globalThis', 'console'].includes(n)) continue;
    done.add(n);
    ctx.report(r.id, m(`Add the "let", "const" or "var" keyword to this declaration of "${n}" to make it explicit.`, `"${n}"의 이 선언에 "let", "const" 또는 "var"를 붙여 명시적으로 만드세요.`));
  }
});

rule('use-before-declare', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1526', tags: ['pitfall'],
  name: ['Variables declared with "var" should be declared before they are used', '"var" 변수는 쓰기 전에 선언해야 합니다'],
  why: ['"var" declarations are hoisted, so earlier reads see undefined instead of failing, which hides ordering bugs.', '"var" 선언은 끌어올려져 앞선 읽기가 실패하지 않고 undefined를 보게 되어 순서 버그를 숨깁니다.'],
  fix: ['Move the declaration before the first use, or use let / const.', '선언을 처음 사용하는 곳 앞으로 옮기거나 let / const를 쓰세요.'],
}, (ctx) => {
  for (const s of ctx.scope.scopes) {
    for (const v of s.vars.values()) {
      const d = v.defs[0];
      if (!d || d.kind !== 'var' || v.defs.length !== 1) continue;
      const declPos = d.id.start;
      const early = v.refs.find((r) => !r.init && r.id.start < declPos && r.scope.fn === v.scope.fn && !r.type);
      if (early) ctx.report(early.id, m(`Move the declaration of "${v.name}" (line ${ctx.line(d.id)}) before this usage.`, `"${v.name}"의 선언(${ctx.line(d.id)}번 줄)을 이 사용 앞으로 옮기세요.`));
    }
  }
});

rule('nested-template', {
  t: 'S', s: 'MA', debt: 10, ref: 'S4624', tags: ['confusing'],
  name: ['Template literals should not be nested', '템플릿 리터럴을 중첩하면 안 됩니다'],
  why: ['A template literal inside another one is hard to read.', '템플릿 리터럴 안의 템플릿 리터럴은 읽기 어렵습니다.'],
  fix: ['Extract the inner template into a variable.', '안쪽 템플릿을 변수로 빼세요.'],
}, (ctx) => {
  for (const t of ctx.nodes('TemplateLiteral')) {
    if (t.parent && t.parent.type === 'TaggedTemplateExpression') continue;
    let p = t.parent;
    let child = t;
    while (p && !isFunction(p) && p.type !== 'JSXElement' && p.type !== 'JSXFragment') {
      if (p.type === 'TemplateLiteral' && p.expressions.includes(child) && !(p.parent && p.parent.type === 'TaggedTemplateExpression')) { ctx.report(t, m('Refactor this code to not use nested template literals.', '중첩된 템플릿 리터럴을 쓰지 않도록 고치세요.')); break; }
      if (p.type === 'TemplateLiteral') break;
      child = p;
      p = p.parent;
    }
  }
});

rule('promise-resolve-shorthand', {
  t: 'S', s: 'MI', debt: 2, ref: 'S4634', tags: ['promise'],
  name: ['Shorthand promises should be used', '단축 Promise를 써야 합니다'],
  why: ['new Promise(resolve => resolve(x)) is a long way to write Promise.resolve(x).', 'new Promise(resolve => resolve(x))는 Promise.resolve(x)를 길게 쓴 것입니다.'],
  fix: ['Use Promise.resolve(x) / Promise.reject(err).', 'Promise.resolve(x) / Promise.reject(err)를 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('NewExpression')) {
    const c = unwrapTS(n.callee);
    if (!(c.type === 'Identifier' && c.name === 'Promise' && B.isUnresolved(ctx, c))) continue;
    const ex = n.arguments[0];
    if (!ex || !isFunction(ex) || ex.async) continue;
    let call = null;
    if (ex.body.type !== 'BlockStatement') call = unwrapTS(ex.body);
    else if (ex.body.body.length === 1 && ex.body.body[0].type === 'ExpressionStatement') call = ex.body.body[0].expression;
    if (!call || call.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.arguments.length > 1) continue;
    const idx = ex.params.findIndex((p) => p.type === 'Identifier' && p.name === call.callee.name);
    if (idx !== 0 && idx !== 1) continue;
    if (call.arguments[0] && B.hasSideEffects(call.arguments[0])) continue;
    ctx.report(n, m(`Replace this trivial promise with "Promise.${idx === 0 ? 'resolve' : 'reject'}".`, `이 단순한 Promise를 "Promise.${idx === 0 ? 'resolve' : 'reject'}"로 바꾸세요.`));
  }
});

rule('prefer-for-of', {
  t: 'S', s: 'MI', debt: 5, ref: 'S4138', tags: ['es2015'],
  name: ['"for of" should be used with iterables', '반복 가능한 값에는 "for of"를 써야 합니다'],
  why: ['An index loop whose index is only used to read the element is better written as for...of.', '인덱스를 요소를 읽는 데만 쓰는 인덱스 반복은 for...of가 더 낫습니다.'],
  fix: ['Use for (const item of array).', 'for (const item of array)를 쓰세요.'],
}, (ctx) => {
  for (const f of ctx.nodes('ForStatement')) {
    if (!f.init || !f.test || !f.update) continue;
    const init = f.init.type === 'VariableDeclaration' && f.init.declarations.length === 1 ? f.init.declarations[0] : null;
    if (!init || init.id.type !== 'Identifier' || !W.isLiteral(init.init, 0)) continue;
    const i = init.id;
    const t = unwrapTS(f.test);
    if (t.type !== 'BinaryExpression' || t.operator !== '<' || t.left.type !== 'Identifier' || t.left.name !== i.name) continue;
    const r = unwrapTS(t.right);
    if (r.type !== 'MemberExpression' || propName(r) !== 'length') continue;
    const arr = unwrapTS(r.object);
    if (arr.type !== 'Identifier' && !(arr.type === 'MemberExpression' && dottedName(arr))) continue;
    const u = unwrapTS(f.update);
    if (!(u.type === 'UpdateExpression' && u.operator === '++' && u.argument.type === 'Identifier' && u.argument.name === i.name)) continue;
    const v = i._var;
    if (!v) continue;
    const bodyRefs = v.refs.filter((x) => x.id.start >= f.body.start && x.id.end <= f.body.end);
    if (!bodyRefs.length) continue;
    const ok = bodyRefs.every((x) => {
      if (x.write) return false;
      const p = x.id.parent;
      if (!(p && p.type === 'MemberExpression' && p.computed && p.property === x.id && equal(unwrapTS(p.object), arr))) return false;
      const gp = p.parent;
      if (gp && ((gp.type === 'AssignmentExpression' && gp.left === p) || gp.type === 'UpdateExpression' || (gp.type === 'UnaryExpression' && gp.operator === 'delete'))) return false;
      return true;
    });
    if (!ok) continue;
    if (U.contains(f.body, (n) => isFunction(n) && U.contains(n, (x) => x.type === 'Identifier' && x.name === i.name, true), false)) continue;
    ctx.report({ start: f.start, end: f.start + 3 }, m(`Use "for...of" to iterate over "${ctx.text(arr)}".`, `"${ctx.text(arr)}"를 반복할 때는 "for...of"를 쓰세요.`));
  }
});

rule('this-alias', {
  t: 'S', s: 'MI', debt: 2, ref: 'S4327', tags: ['es2015'],
  name: ['"this" should not be assigned to variables', '"this"를 변수에 대입하면 안 됩니다'],
  why: ['Aliasing "this" (self = this) is a workaround that arrow functions make unnecessary.', '"this"를 별칭으로 두는 것(self = this)은 화살표 함수로 필요 없어진 우회책입니다.'],
  fix: ['Use arrow functions, which keep "this".', '"this"를 유지하는 화살표 함수를 쓰세요.'],
}, (ctx) => {
  for (const d of ctx.nodes('VariableDeclarator')) {
    if (d.id.type !== 'Identifier' || !d.init || unwrapTS(d.init).type !== 'ThisExpression') continue;
    // a cursor that walks from this (for (let s = this; s; s = s.parent)) is not an alias
    const v = ctx.varOf(d.id);
    if (v && v.refs.some((r) => r.write && !r.init)) continue;
    ctx.report(d, m(`Remove the alias "${d.id.name}" of "this"; use arrow functions instead.`, `"this"의 별칭 "${d.id.name}"를 지우고 화살표 함수를 쓰세요.`));
  }
});

const BUILTINS = new Set(['Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'JSON', 'Math', 'Date', 'RegExp', 'Error', 'Function', 'Proxy', 'Reflect', 'BigInt', 'Intl']);

rule('builtin-shadow', {
  t: 'S', s: 'MA', debt: 5, ref: 'S2424', tags: ['pitfall'],
  name: ['Built-in objects should not be shadowed', '내장 객체를 가리면 안 됩니다'],
  why: ['A local variable named like a built-in (Object, Map, JSON...) hides the real one in that scope.', '내장 객체 이름(Object, Map, JSON...)의 지역 변수는 그 범위에서 진짜를 가립니다.'],
  fix: ['Rename the local variable.', '지역 변수의 이름을 바꾸세요.'],
}, (ctx) => {
  for (const s of ctx.scope.scopes) {
    for (const v of s.vars.values()) {
      if (!BUILTINS.has(v.name)) continue;
      const d = v.defs[0];
      if (!d || d.kind === 'import' || d.kind === 'interface' || d.kind === 'type' || d.declare) continue;
      ctx.report(d.id, m(`Remove this declaration of "${v.name}"; it shadows the built-in object.`, `"${v.name}"의 이 선언을 지우세요. 내장 객체를 가립니다.`));
    }
  }
});

rule('arguments-usage', {
  t: 'S', s: 'MI', debt: 5, ref: 'S3513', tags: ['es2015'],
  name: ['"arguments" should not be accessed directly', '"arguments"에 직접 접근하면 안 됩니다'],
  why: ['"arguments" is array-like but not an array and hides the function\'s real signature.', '"arguments"는 배열 같지만 배열이 아니며 함수의 실제 시그니처를 숨깁니다.'],
  fix: ['Use rest parameters (...args).', '나머지 매개변수(...args)를 쓰세요.'],
}, (ctx) => {
  const seen = new Set();
  for (const s of ctx.scope.scopes) {
    const v = s.vars.get('arguments');
    if (!v || !v.implicit || !v.refs.length) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    ctx.report(v.refs[0].id, m('Use the rest syntax to declare this function\'s arguments.', '이 함수의 인자는 나머지 문법으로 선언하세요.'));
  }
});

rule('generator-without-yield', {
  t: 'S', s: 'MA', debt: 5, ref: 'S3531', tags: ['suspicious'],
  name: ['Generators should "yield" something', '제너레이터는 무언가를 "yield"해야 합니다'],
  why: ['A generator that never yields produces an empty sequence; it is usually a forgotten yield or an unnecessary *.', 'yield하지 않는 제너레이터는 빈 시퀀스를 만듭니다. 보통 yield를 빠뜨렸거나 *가 불필요합니다.'],
  fix: ['Add the yield, or make it a normal function.', 'yield를 넣거나 일반 함수로 만드세요.'],
}, (ctx) => {
  for (const fn of ctx.functions()) {
    if (!fn.generator || !fn.body || !fn.body.body.length) continue;
    if (!U.contains(fn.body, (n) => n.type === 'YieldExpression', false)) ctx.report(fnHead(fn), m('Add a "yield" statement to this generator.', '이 제너레이터에 "yield" 문을 넣으세요.'));
  }
});

rule('array-named-props', {
  t: 'S', s: 'MA', debt: 5, ref: 'S3579', tags: ['suspicious'],
  name: ['Array indexes should be numeric', '배열 인덱스는 숫자여야 합니다'],
  why: ['Named properties on an array are ignored by length, iteration and JSON serialization.', '배열의 이름 붙은 속성은 length, 반복, JSON 직렬화에서 무시됩니다.'],
  fix: ['Use an object or a Map for named keys.', '이름 키에는 객체나 Map을 쓰세요.'],
}, (ctx) => {
  for (const a of ctx.nodes('AssignmentExpression')) {
    const l = a.left;
    if (l.type !== 'MemberExpression') continue;
    const o = unwrapTS(l.object);
    if (o.type !== 'Identifier') continue;
    const key = l.computed ? B.staticType(l.property) === 'string' ? W.stringValue(l.property) : null : propName(l);
    if (key == null || /^\d+$/.test(key) || key === 'length') continue;
    const v = ctx.varOf(o);
    const d = v && v.defs.length === 1 ? v.defs[0] : null;
    if (!d || !d.node || d.node.type !== 'VariableDeclarator' || d.node.id !== d.id) continue;
    const init = unwrapTS(d.node.init);
    if (!init || init.type !== 'ArrayExpression') continue;
    if (v.refs.some((r) => r.write && !r.init)) continue;
    ctx.report(l, m(`Make "${o.name}" an object if it must have named properties ("${key}"); otherwise use a numeric index.`, `이름 속성("${key}")이 필요하면 "${o.name}"를 객체로 만들고 아니면 숫자 인덱스를 쓰세요.`));
  }
});

rule('arguments-callee', {
  t: 'S', s: 'CR', debt: 15, ref: 'S2685', tags: ['obsolete'],
  name: ['"arguments.caller" and "arguments.callee" should not be used', '"arguments.caller"와 "arguments.callee"를 쓰면 안 됩니다'],
  why: ['They are forbidden in strict mode, prevent optimizations and are deprecated.', '이들은 strict 모드에서 금지되고 최적화를 막으며 폐기 예정입니다.'],
  fix: ['Name the function and refer to it by name.', '함수에 이름을 붙이고 그 이름으로 가리키세요.'],
}, (ctx) => {
  for (const me of ctx.nodes('MemberExpression')) {
    const n = dottedName(me);
    if ((n === 'arguments.callee' || n === 'arguments.caller') && me.object._ref && me.object._ref.resolved && me.object._ref.resolved.implicit) ctx.report(me, m(`Remove this use of "${n}".`, `"${n}"의 사용을 지우세요.`));
  }
});

rule('octal-literal', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1314', tags: ['pitfall'],
  name: ['Octal values should not be used', '8진수 값을 쓰면 안 됩니다'],
  why: ['A leading zero makes 010 equal 8, which surprises most readers and is forbidden in strict mode.', '앞의 0 때문에 010이 8이 되어 대부분을 놀라게 하며 strict 모드에서는 금지됩니다.'],
  fix: ['Use the 0o prefix for octal or remove the leading zero.', '8진수는 0o 접두사를 쓰거나 앞의 0을 지우세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('Literal')) if (n.legacyOctal) ctx.report(n, m(`Replace the octal literal ${n.raw} with 0o${n.raw.slice(1)} or the decimal value ${n.value}.`, `8진수 리터럴 ${n.raw}를 0o${n.raw.slice(1)}이나 10진수 ${n.value}로 바꾸세요.`));
});

rule('octal-escape', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6657', tags: ['obsolete'],
  name: ['Octal escape sequences should not be used', '8진수 이스케이프를 쓰면 안 됩니다'],
  why: ['Octal escapes such as "\\251" are deprecated and forbidden in strict mode and templates.', '"\\251" 같은 8진수 이스케이프는 폐기 예정이며 strict 모드와 템플릿에서 금지됩니다.'],
  fix: ['Use \\x or \\u escapes.', '\\x나 \\u 이스케이프를 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('Literal')) if (n.octal) ctx.report(n, m('Replace this octal escape sequence with a \\x or \\u escape.', '이 8진수 이스케이프를 \\x나 \\u 이스케이프로 바꾸세요.'));
});

rule('primitive-wrapper', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1533', tags: ['pitfall'],
  name: ['Wrapper objects should not be used for primitive types', '원시 타입에 래퍼 객체를 쓰면 안 됩니다'],
  why: ['new Boolean(false) is truthy and new String("a") !== "a"; wrapper objects behave unlike primitives.', 'new Boolean(false)는 참이고 new String("a") !== "a"입니다. 래퍼 객체는 원시 값과 다르게 동작합니다.'],
  fix: ['Use the literal or call the function without "new" for conversion.', '리터럴을 쓰거나 변환할 때는 "new" 없이 함수를 호출하세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('NewExpression')) {
    const c = unwrapTS(n.callee);
    if (c.type === 'Identifier' && ['String', 'Number', 'Boolean'].includes(c.name) && B.isUnresolved(ctx, c)) ctx.report(n, m(`Remove "new" from this use of the "${c.name}" wrapper.`, `"${c.name}" 래퍼의 이 사용에서 "new"를 지우세요.`));
  }
});

rule('array-constructor', {
  t: 'S', s: 'MI', debt: 2, ref: 'S1528', tags: ['convention'],
  name: ['Array constructors should not be used', '배열 생성자를 쓰면 안 됩니다'],
  why: ['Array(a, b) creates [a, b] but Array(3) creates three holes; the literal syntax is unambiguous.', 'Array(a, b)는 [a, b]를 만들지만 Array(3)은 빈 칸 셋을 만듭니다. 리터럴 문법은 모호하지 않습니다.'],
  fix: ['Use an array literal [a, b].', '배열 리터럴 [a, b]를 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodesOf('NewExpression', 'CallExpression')) {
    const c = unwrapTS(n.callee);
    // new Array<T>() parses with a TSInstantiationExpression callee
    if (!(c.type === 'Identifier' && c.name === 'Array' && B.isUnresolved(ctx, c)) || n.typeArguments || n.callee.type === 'TSInstantiationExpression') continue;
    if (n.arguments.length === 1) continue;
    ctx.report(n, m('Use an array literal instead of the Array constructor.', 'Array 생성자 대신 배열 리터럴을 쓰세요.'));
  }
  for (const n of ctx.nodes('NewExpression')) {
    const c = unwrapTS(n.callee);
    if (c.type === 'Identifier' && c.name === 'Object' && B.isUnresolved(ctx, c) && n.arguments.length === 0) ctx.report(n, m('Use an object literal {} instead of "new Object()".', '"new Object()" 대신 객체 리터럴 {}를 쓰세요.'));
  }
});

rule('default-param-last', {
  t: 'S', s: 'MI', debt: 2, ref: 'S1788', tags: ['convention'],
  name: ['Function parameters with default values should be last', '기본값이 있는 매개변수는 마지막에 와야 합니다'],
  why: ['A default before a required parameter can only be used by passing undefined explicitly.', '필수 매개변수 앞의 기본값은 undefined를 명시적으로 넘겨야만 쓸 수 있습니다.'],
  fix: ['Move the parameters with defaults to the end.', '기본값이 있는 매개변수를 끝으로 옮기세요.'],
}, (ctx) => {
  for (const fn of ctx.functions()) {
    const ps = fn.params.map((p) => (p.type === 'TSParameterProperty' ? p.parameter : p));
    for (let i = 0; i < ps.length - 1; i++) {
      if (ps[i].type !== 'AssignmentPattern') continue;
      if (ps.slice(i + 1).some((p) => p.type !== 'AssignmentPattern' && p.type !== 'RestElement' && !p.optional)) { ctx.report(ps[i], m('Move this parameter with a default value after the required parameters.', '기본값이 있는 이 매개변수를 필수 매개변수 뒤로 옮기세요.')); break; }
    }
  }
});

rule('nested-switch', {
  t: 'S', s: 'CR', debt: 10, ref: 'S1821', tags: ['brain-overload'],
  name: ['"switch" statements should not be nested', '"switch" 문을 중첩하면 안 됩니다'],
  why: ['A switch inside a switch case is hard to follow.', 'switch case 안의 switch는 따라가기 어렵습니다.'],
  fix: ['Extract the inner switch into a function.', '안쪽 switch를 함수로 빼세요.'],
}, (ctx) => {
  for (const sw of ctx.nodes('SwitchStatement')) {
    let p = sw.parent;
    while (p && !isFunction(p)) {
      if (p.type === 'SwitchStatement') { ctx.report({ start: sw.start, end: sw.start + 6 }, m('Refactor the code to eliminate this nested "switch".', '이 중첩 "switch"가 없도록 코드를 고치세요.')); break; }
      p = p.parent;
    }
  }
});

rule('label-non-loop', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1439', tags: ['confusing'],
  name: ['Only loops and switch statements should be labelled', '반복문과 switch 문에만 레이블을 붙여야 합니다'],
  why: ['Labels on other statements are rarely understood and usually unnecessary.', '다른 문장의 레이블은 거의 이해되지 않고 보통 필요 없습니다.'],
  fix: ['Remove the label or restructure the code.', '레이블을 지우거나 코드 구조를 바꾸세요.'],
}, (ctx) => {
  for (const l of ctx.nodes('LabeledStatement')) {
    if (!/^(For|While|DoWhile|ForIn|ForOf|Switch)Statement$/.test(l.body.type)) ctx.report(l.label, m(`Remove the label "${l.label.name}" from this non-loop statement.`, `반복이 아닌 이 문장에서 레이블 "${l.label.name}"를 지우세요.`));
  }
});

rule('void-use', {
  t: 'S', s: 'MI', debt: 2, ref: 'S3735', tags: ['confusing'],
  name: ['"void" should not be used', '"void"를 쓰면 안 됩니다'],
  why: ['"void expr" evaluates and discards a value, which is obscure except for promises and void 0.', '"void expr"는 값을 계산하고 버리는데 Promise와 void 0 외에는 이해하기 어렵습니다.'],
  fix: ['Remove the void operator.', 'void 연산자를 지우세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('UnaryExpression')) {
    if (n.operator !== 'void') continue;
    const a = unwrapTS(n.argument);
    if (a.type === 'Literal' && a.value === 0) continue;
    if (a.type === 'CallExpression' || a.type === 'AwaitExpression' || a.type === 'NewExpression' || a.type === 'ChainExpression' || a.type === 'ImportExpression' || a.type === 'TaggedTemplateExpression') continue;
    ctx.report(n, m('Remove this use of the "void" operator.', '"void" 연산자의 이 사용을 지우세요.'));
  }
});

rule('object-shorthand', {
  t: 'S', s: 'MI', debt: 1, ref: 'S3498', tags: ['es2015'],
  name: ['Object literal shorthand syntax should be used', '객체 리터럴 단축 문법을 써야 합니다'],
  why: ['{ a: a } and { f: function () {} } are longer than { a } and { f() {} }.', '{ a: a }와 { f: function () {} }는 { a }와 { f() {} }보다 깁니다.'],
  fix: ['Use the shorthand property or method syntax.', '단축 속성이나 메서드 문법을 쓰세요.'],
}, (ctx) => {
  for (const p of ctx.nodes('Property')) {
    if (!p.parent || p.parent.type !== 'ObjectExpression' || p.shorthand || p.computed || p.method || p.kind !== 'init') continue;
    const v = unwrapTS(p.value);
    if (p.key.type === 'Identifier' && v.type === 'Identifier' && p.key.name === v.name && p.value === v) ctx.report(p, m(`Expected property shorthand for "${v.name}".`, `"${v.name}"에는 단축 속성을 쓰세요.`));
    else if (p.key.type === 'Identifier' && v.type === 'FunctionExpression' && !v.id && !v.generator) ctx.report(p, m(`Expected method shorthand for "${p.key.name}".`, `"${p.key.name}"에는 단축 메서드를 쓰세요.`));
  }
});

rule('prefer-spread', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6666', tags: ['es2015'],
  name: ['Spread syntax should be used instead of ".apply()"', '".apply()" 대신 전개 문법을 써야 합니다'],
  why: ['fn.apply(null, args) is harder to read than fn(...args).', 'fn.apply(null, args)는 fn(...args)보다 읽기 어렵습니다.'],
  fix: ['Use fn(...args).', 'fn(...args)를 쓰세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    if (c.type !== 'MemberExpression' || propName(c) !== 'apply' || call.arguments.length !== 2) continue;
    const fnExpr = unwrapTS(c.object);
    const thisArg = call.arguments[0];
    const args = unwrapTS(call.arguments[1]);
    if (args.type === 'ArrayExpression' || (args.type === 'Identifier' && args.name === 'arguments')) continue;
    const ok = (fnExpr.type === 'Identifier' && W.isNullish(thisArg)) || (fnExpr.type === 'MemberExpression' && equal(unwrapTS(fnExpr.object), unwrapTS(thisArg)) && !B.hasSideEffects(thisArg));
    if (ok) ctx.report(call, m(`Use the spread operator instead of ".apply()": ${ctx.text(fnExpr)}(...${ctx.text(args)}).`, `".apply()" 대신 전개 연산자를 쓰세요: ${ctx.text(fnExpr)}(...${ctx.text(args)}).`));
  }
});

rule('starts-with', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6557', tags: ['es2015'],
  name: ['"startsWith()" and "endsWith()" should be preferred to index checks', '인덱스 검사보다 "startsWith()"와 "endsWith()"를 써야 합니다'],
  why: ['s.indexOf(x) === 0 scans the whole string and states the intent less clearly than s.startsWith(x).', 's.indexOf(x) === 0은 문자열 전체를 훑고 의도도 s.startsWith(x)보다 덜 명확합니다.'],
  fix: ['Use startsWith() / endsWith().', 'startsWith() / endsWith()를 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('BinaryExpression')) {
    if (!/^(===|==|!==|!=)$/.test(n.operator)) continue;
    for (const [a, b] of [[n.left, n.right], [n.right, n.left]]) {
      const x = unwrapTS(a);
      if (x.type === 'CallExpression' && W.calleeProp(x) === 'indexOf' && x.arguments.length === 1 && W.isLiteral(b, 0)) {
        const recv = unwrapTS(x.callee).object;
        if (recv && (W.isStringLike(recv) || (recv.type === 'Identifier' && !B.isArrayVar(ctx, recv) && W.isStringLike(x.arguments[0])))) { ctx.report(n, m('Use "startsWith()" instead of comparing "indexOf()" with 0.', '"indexOf()"를 0과 비교하지 말고 "startsWith()"를 쓰세요.')); break; }
      }
      if (x.type === 'CallExpression' && ['slice', 'substring', 'substr'].includes(W.calleeProp(x)) && x.arguments.length === 2 && W.isLiteral(x.arguments[0], 0)) {
        const lit = W.stringValue(b);
        const len = staticValue(x.arguments[1]);
        if (lit && len && len.value === lit.length) { ctx.report(n, m('Use "startsWith()" instead of comparing a prefix slice.', '앞부분을 잘라 비교하지 말고 "startsWith()"를 쓰세요.')); break; }
      }
    }
  }
});

rule('string-literal-duplicate', {
  t: 'S', s: 'CR', debt: 2, ref: 'S1192', tags: ['design'],
  name: ['String literals should not be duplicated', '문자열 리터럴을 중복하면 안 됩니다'],
  why: ['The same literal repeated in many places must be updated everywhere when it changes.', '여러 곳에 반복된 같은 리터럴은 바뀔 때 모든 곳을 고쳐야 합니다.'],
  fix: ['Define a constant and use it.', '상수를 정의해서 쓰세요.'],
}, (ctx) => {
  const minLen = opt(ctx, 'duplicateStringMinLength', 10);
  const threshold = opt(ctx, 'duplicateStringThreshold', 3);
  const groups = new Map();
  for (const n of ctx.nodes('Literal')) {
    if (typeof n.value !== 'string' || n.value.length < minLen) continue;
    if (!/[A-Za-z]/.test(n.value) || /^\s*$/.test(n.value)) continue;
    const p = n.parent;
    if (!p) continue;
    if (p.type === 'ImportDeclaration' || p.type === 'ExportNamedDeclaration' || p.type === 'ExportAllDeclaration' || p.type === 'ImportExpression' || p.type === 'TSExternalModuleReference') continue;
    if (p.type === 'Property' && p.key === n) continue;
    if (p.type === 'JSXAttribute' || p.type === 'TSLiteralType' || p.type === 'TSEnumMember' || p.type === 'SwitchCase') continue;
    if (p.type === 'ExpressionStatement') continue;
    if (p.type === 'CallExpression' && p.callee.type === 'Identifier' && p.callee.name === 'require') continue;
    if (p.type === 'MemberExpression' && p.property === n) continue;
    if (/^[\w-]+(\s[\w-]+)*$/.test(n.value) && /\s/.test(n.value) && /^(?:[a-z0-9-]+\s)+[a-z0-9-]+$/.test(n.value) && /-/.test(n.value)) continue; // css class lists
    if (!groups.has(n.value)) groups.set(n.value, []);
    groups.get(n.value).push(n);
  }
  for (const [value, list] of groups) {
    if (list.length < threshold) continue;
    ctx.report(list[0], m(`Define a constant instead of duplicating this literal ${list.length} times: "${value.length > 40 ? `${value.slice(0, 40)}...` : value}".`, `이 리터럴을 ${list.length}번 반복하지 말고 상수를 정의하세요: "${value.length > 40 ? `${value.slice(0, 40)}...` : value}".`));
  }
});

rule('for-to-while', {
  t: 'S', s: 'MI', debt: 2, ref: 'S1264', tags: ['clumsy'],
  name: ['A "while" loop should be used instead of a "for" loop', '"for" 반복 대신 "while" 반복을 써야 합니다'],
  why: ['A for loop with only a condition is a while loop in disguise.', '조건만 있는 for 반복은 while 반복을 감춘 것입니다.'],
  fix: ['Use while (condition).', 'while (condition)을 쓰세요.'],
}, (ctx) => {
  for (const f of ctx.nodes('ForStatement')) if (!f.init && !f.update && f.test) ctx.report({ start: f.start, end: f.start + 3 }, m('Replace this "for" loop with a "while" loop.', '이 "for" 반복을 "while" 반복으로 바꾸세요.'));
});

rule('loop-counter-assign', {
  t: 'S', s: 'MA', debt: 10, ref: 'S2310', tags: ['pitfall'],
  name: ['Loop counters should not be assigned within the loop body', '반복 카운터를 반복 본문 안에서 대입하면 안 됩니다'],
  why: ['Changing the counter inside the body makes the number of iterations hard to predict.', '본문 안에서 카운터를 바꾸면 반복 횟수를 예측하기 어렵습니다.'],
  fix: ['Use a separate variable, or a while loop.', '별도 변수나 while 반복을 쓰세요.'],
}, (ctx) => {
  for (const f of ctx.nodes('ForStatement')) {
    if (!f.update) continue;
    const counters = new Set();
    const u = unwrapTS(f.update);
    const collect = (x) => {
      if (x.type === 'UpdateExpression' && x.argument.type === 'Identifier') counters.add(x.argument.name);
      else if (x.type === 'AssignmentExpression' && x.left.type === 'Identifier') counters.add(x.left.name);
      else if (x.type === 'SequenceExpression') x.expressions.forEach(collect);
    };
    collect(u);
    if (!counters.size) continue;
    for (const w of U.findAll(f.body, (n) => (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && counters.has(n.left.name)) || (n.type === 'UpdateExpression' && n.argument.type === 'Identifier' && counters.has(n.argument.name)), false)) {
      const id = w.type === 'AssignmentExpression' ? w.left : w.argument;
      ctx.report(id, m(`Remove this assignment of "${id.name}"; it is the loop counter.`, `"${id.name}"는 반복 카운터이니 이 대입을 지우세요.`));
    }
  }
});

rule('conditional-same-line', {
  t: 'S', s: 'MA', debt: 2, ref: 'S3972', tags: ['suspicious'],
  name: ['Conditionals should start on new lines', '조건문은 새 줄에서 시작해야 합니다'],
  why: ['"} if (" on one line looks like an "else if" but is a separate, unconditional if.', '한 줄의 "} if ("는 "else if"처럼 보이지만 별개의 조건 없는 if입니다.'],
  fix: ['Put the if on its own line, or add the missing "else".', 'if를 새 줄에 두거나 빠진 "else"를 넣으세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('IfStatement')) {
    const p = n.parent;
    const list = p && (p.type === 'BlockStatement' || p.type === 'Program' || p.type === 'SwitchCase') ? (p.type === 'SwitchCase' ? p.consequent : p.body) : null;
    if (!list) continue;
    const prev = list[list.indexOf(n) - 1];
    if (!prev || prev.type !== 'IfStatement') continue;
    if (ctx.src[prev.end - 1] !== '}') continue;
    if (ctx.loc(prev.end).line === ctx.loc(n.start).line) ctx.report({ start: n.start, end: n.start + 2 }, m('Move this "if" to a new line or add the missing "else".', '이 "if"를 새 줄로 옮기거나 빠진 "else"를 넣으세요.'));
  }
});

rule('multiline-string', {
  t: 'S', s: 'MI', debt: 2, ref: 'S1516', tags: ['pitfall'],
  name: ['Multiline string literals should not be used', '여러 줄 문자열 리터럴을 쓰면 안 됩니다'],
  why: ['A backslash at the end of a line continues the string, but trailing spaces after it silently break the code.', '줄 끝의 역슬래시는 문자열을 잇지만 그 뒤의 공백이 조용히 코드를 깨뜨립니다.'],
  fix: ['Use a template literal or string concatenation.', '템플릿 리터럴이나 문자열 연결을 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('Literal')) if (typeof n.value === 'string' && /\\\r?\n/.test(n.raw || '')) ctx.report(n, m('Use a template literal or concatenation instead of a backslash line continuation.', '역슬래시 줄 이음 대신 템플릿 리터럴이나 연결을 쓰세요.'));
});

const FUTURE_RESERVED = new Set(['implements', 'interface', 'package', 'private', 'protected', 'public', 'static', 'await', 'yield', 'let']);

rule('future-reserved-word', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1527', tags: ['pitfall'],
  name: ['Future reserved words should not be used as identifiers', '예약어 후보를 식별자로 쓰면 안 됩니다'],
  why: ['These words are reserved in strict mode and modules, so the code breaks there.', '이 단어들은 strict 모드와 모듈에서 예약어라 그곳에서 코드가 깨집니다.'],
  fix: ['Rename the identifier.', '식별자 이름을 바꾸세요.'],
}, (ctx) => {
  if (ctx.ts) return;
  for (const s of ctx.scope.scopes) {
    for (const v of s.vars.values()) {
      if (!FUTURE_RESERVED.has(v.name)) continue;
      const d = v.defs[0];
      if (d && d.id && d.id.start != null) ctx.report(d.id, m(`Rename "${v.name}"; it is a reserved word in strict mode.`, `"${v.name}"의 이름을 바꾸세요. strict 모드의 예약어입니다.`));
    }
  }
});

rule('extra-boolean-cast', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6509', tags: ['redundant'],
  name: ['Extra boolean casts should be removed', '불필요한 불리언 변환은 지워야 합니다'],
  why: ['A condition already converts its value to a boolean, so !!x or Boolean(x) is noise there.', '조건은 이미 값을 불리언으로 바꾸므로 거기서 !!x나 Boolean(x)는 잡음입니다.'],
  fix: ['Remove the cast.', '변환을 지우세요.'],
}, (ctx) => {
  const isCast = (n) => {
    n = unwrapTS(n);
    if (n.type === 'UnaryExpression' && n.operator === '!' && n.argument.type === 'UnaryExpression' && n.argument.operator === '!') return true;
    return n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'Boolean' && n.arguments.length === 1 && B.isUnresolved(ctx, n.callee);
  };
  const check = (t) => { if (t && isCast(t)) ctx.report(t, m('Redundant double negation / Boolean() call in a boolean context.', '불리언 문맥에서 이중 부정 / Boolean() 호출이 중복됩니다.')); };
  for (const n of ctx.nodesOf('IfStatement', 'WhileStatement', 'DoWhileStatement', 'ConditionalExpression')) check(n.test);
  for (const n of ctx.nodes('ForStatement')) check(n.test);
  for (const n of ctx.nodes('UnaryExpression')) if (n.operator === '!' && !(n.parent && n.parent.type === 'UnaryExpression' && n.parent.operator === '!')) {
    const a = unwrapTS(n.argument);
    if (a.type === 'CallExpression' && isCast(a)) check(a);
  }
});

rule('undefined-assignment', {
  t: 'S', s: 'MI', debt: 2, ref: 'S2138', tags: ['pitfall'],
  name: ['"undefined" should not be assigned', '"undefined"를 대입하면 안 됩니다'],
  why: ['undefined means "never set"; assigning it explicitly blurs that meaning. Use null for an intentional empty value.', 'undefined는 "설정한 적 없음"을 뜻합니다. 명시적으로 대입하면 의미가 흐려지니 의도한 빈 값은 null을 쓰세요.'],
  fix: ['Assign null instead, or leave the variable uninitialized.', '대신 null을 대입하거나 초기화하지 마세요.'],
}, (ctx) => {
  for (const d of ctx.nodes('VariableDeclarator')) if (d.init && W.isUndefined(d.init) && d.id.type === 'Identifier') ctx.report(d.init, m(`Remove the explicit initialization of "${d.id.name}" to undefined.`, `"${d.id.name}"를 undefined로 명시적으로 초기화하지 마세요.`));
  for (const a of ctx.nodes('AssignmentExpression')) if (a.operator === '=' && a.left.type === 'Identifier' && W.isUndefined(a.right)) ctx.report(a.right, m(`Use null instead of assigning undefined to "${a.left.name}".`, `"${a.left.name}"에 undefined 대신 null을 대입하세요.`));
});

rule('invariant-return', {
  t: 'S', s: 'BL', debt: 2, ref: 'S3516', tags: ['design'],
  name: ['Function returns should not be invariant', '함수 반환값이 항상 같으면 안 됩니다'],
  why: ['Every return statement gives the same value, so the logic choosing between them is pointless or broken.', '모든 return이 같은 값을 돌려주어 그 사이를 고르는 로직이 무의미하거나 잘못되었습니다.'],
  fix: ['Return the value that each path is meant to produce, or simplify the function.', '경로마다 의도한 값을 돌려주거나 함수를 간단히 하세요.'],
}, (ctx) => {
  for (const fn of ctx.functions()) {
    if (!fn.body || fn.body.type !== 'BlockStatement') continue;
    const rets = B.ownReturns(fn);
    if (rets.length < 2 || rets.some((r) => !r.argument)) continue;
    const vals = rets.map((r) => (W.isLiteral(r.argument) ? unwrapTS(r.argument).value : Symbol('x')));
    if (!vals.every((v) => v === vals[0])) continue;
    let cfg;
    try { cfg = ctx.cfg(fn); } catch { continue; }
    if (cfg.fallsOff) continue;
    ctx.report(fnHead(fn), m(`Refactor ${fnLabel(fn)} to not always return the same value (${JSON.stringify(vals[0])}).`, `${fnLabelKo(fn)}가 항상 같은 값(${JSON.stringify(vals[0])})을 돌려주지 않도록 고치세요.`));
  }
});

rule('setter-without-getter', {
  t: 'S', s: 'MA', debt: 5, ref: 'S2376', tags: ['pitfall'],
  name: ['Property setters should have matching getters', '속성 setter에는 짝이 되는 getter가 있어야 합니다'],
  why: ['A write-only property returns undefined when read, which surprises users.', '쓰기 전용 속성은 읽으면 undefined를 돌려줘 사용자를 놀라게 합니다.'],
  fix: ['Add the getter, or use a method instead of a setter.', 'getter를 추가하거나 setter 대신 메서드를 쓰세요.'],
}, (ctx) => {
  const check = (members, getKey) => {
    const gets = new Set();
    const sets = [];
    for (const mbr of members) {
      const k = getKey(mbr);
      if (k == null) continue;
      if (mbr.kind === 'get') gets.add(k);
      if (mbr.kind === 'set') sets.push([k, mbr]);
    }
    for (const [k, mbr] of sets) if (!gets.has(k)) ctx.report(mbr.key, m(`Provide a getter matching this setter "${k.slice(2)}".`, `이 setter "${k.slice(2)}"에 맞는 getter를 만드세요.`));
  };
  for (const o of ctx.nodes('ObjectExpression')) check(o.properties.filter((p) => p.type === 'Property'), (p) => { const k = keyName(p.key, p.computed); return k == null ? null : `i:${k}`; });
  for (const b of ctx.nodes('ClassBody')) check(b.body.filter((p) => p.type === 'MethodDefinition'), (p) => { const k = keyName(p.key, p.computed); return k == null ? null : `${p.static ? 's' : 'i'}:${k}`; });
});

rule('exception-reassign', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1226', tags: ['pitfall'],
  name: ['Caught exceptions should not be reassigned', '잡은 예외에 다시 대입하면 안 됩니다'],
  why: ['Overwriting the catch parameter loses the original error.', 'catch 매개변수를 덮어쓰면 원래 오류가 사라집니다.'],
  fix: ['Use a new variable.', '새 변수를 쓰세요.'],
}, (ctx) => {
  for (const r of ctx.scope.allRefs) {
    if (!r.write || r.init || !r.resolved) continue;
    if (r.resolved.defs[0] && r.resolved.defs[0].kind === 'catch') ctx.report(r.id, m(`Do not reassign the caught exception "${r.id.name}".`, `잡은 예외 "${r.id.name}"에 다시 대입하지 마세요.`));
  }
});

rule('param-reassign', {
  t: 'S', s: 'MI', debt: 5, ref: 'S1226', tags: ['pitfall'],
  name: ['Function parameters should not be overwritten before being read', '함수 매개변수를 읽기 전에 덮어쓰면 안 됩니다'],
  why: ['Overwriting a parameter before reading it ignores the value the caller passed.', '매개변수를 읽기 전에 덮어쓰면 호출하는 쪽이 넘긴 값을 무시합니다.'],
  fix: ['Use a local variable, or read the parameter first.', '지역 변수를 쓰거나 매개변수를 먼저 읽으세요.'],
}, (ctx) => {
  for (const fn of ctx.functions()) {
    for (const p of fn.params) {
      if (p.type !== 'Identifier' || !p._var) continue;
      const v = p._var;
      const refs = v.refs.filter((r) => !r.init).sort((a, b) => a.id.start - b.id.start);
      const first = refs[0];
      if (!first || !first.write || first.read || first.compound) continue;
      if (first.scope.fn !== v.scope.fn) continue;
      // x = x || def / x = f(x): the right-hand side reads the parameter before the write
      let asg = first.id.parent;
      while (asg && asg.type !== 'AssignmentExpression' && !isFunction(asg)) asg = asg.parent;
      if (asg && asg.type === 'AssignmentExpression' && refs.some((r) => r.read && r.id.start >= asg.right.start && r.id.end <= asg.right.end)) continue;
      // conditional overwrite (if (!x) x = ...) reads first in the test
      ctx.report(first.id, m(`Introduce a new variable instead of reusing the parameter "${p.name}".`, `매개변수 "${p.name}"를 다시 쓰지 말고 새 변수를 만드세요.`));
    }
  }
});

rule('useless-concat', {
  t: 'S', s: 'MI', debt: 1, tags: ['redundant'],
  name: ['String literals should not be concatenated on the same line', '같은 줄에서 문자열 리터럴끼리 이으면 안 됩니다'],
  why: ['"a" + "b" is just "ab" written in a more complicated way.', '"a" + "b"는 "ab"를 복잡하게 쓴 것일 뿐입니다.'],
  fix: ['Merge the literals.', '리터럴을 합치세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('BinaryExpression')) {
    if (n.operator !== '+') continue;
    const l = unwrapTS(n.left.type === 'BinaryExpression' && n.left.operator === '+' && !n.left.parenthesized ? n.left.right : n.left);
    const r = unwrapTS(n.right);
    const isStr = (x) => (x.type === 'Literal' && typeof x.value === 'string') || (x.type === 'TemplateLiteral' && !x.expressions.length);
    if (isStr(l) && isStr(r) && ctx.loc(l.end).line === ctx.loc(r.start).line) ctx.report(n, m('Merge these string literals; concatenating them is useless.', '이 문자열 리터럴들을 합치세요. 잇는 것은 쓸모없습니다.'));
  }
});

rule('parseint-radix', {
  t: 'S', s: 'MI', debt: 2, ref: 'S2427', tags: ['pitfall'],
  name: ['The radix parameter of "parseInt" should be specified', '"parseInt"의 기수 인자를 지정해야 합니다'],
  why: ['Without a radix, strings like "0x1f" are parsed as hexadecimal and the intent is unclear.', '기수가 없으면 "0x1f" 같은 문자열이 16진수로 해석되고 의도가 불분명합니다.'],
  fix: ['Pass the radix, usually 10.', '기수를 넘기세요. 보통 10입니다.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    const isPI = (c.type === 'Identifier' && c.name === 'parseInt' && B.isUnresolved(ctx, c)) || dottedName(c) === 'Number.parseInt';
    if (isPI && call.arguments.length === 1 && call.arguments[0].type !== 'SpreadElement') ctx.report(call, m('Add the radix argument to this "parseInt" call.', '이 "parseInt" 호출에 기수 인자를 넣으세요.'));
  }
});

rule('global-isnan', {
  t: 'S', s: 'MI', debt: 2, tags: ['pitfall'],
  name: ['"Number.isNaN" and "Number.isFinite" should be preferred', '"Number.isNaN"과 "Number.isFinite"를 써야 합니다'],
  why: ['The global isNaN / isFinite convert their argument first, so isNaN("abc") is true.', '전역 isNaN / isFinite는 인자를 먼저 변환해 isNaN("abc")가 참입니다.'],
  fix: ['Use Number.isNaN / Number.isFinite.', 'Number.isNaN / Number.isFinite를 쓰세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    if (c.type === 'Identifier' && (c.name === 'isNaN' || c.name === 'isFinite') && B.isUnresolved(ctx, c)) ctx.report(call, m(`Use "Number.${c.name}()" instead of the global "${c.name}()".`, `전역 "${c.name}()" 대신 "Number.${c.name}()"를 쓰세요.`));
  }
});

const DEPRECATED_MODULE_FNS = {
  fs: { exists: 'fs.existsSync() or fs.access()', SyncWriteStream: 'fs.createWriteStream()' },
  url: { parse: 'new URL()', resolve: 'new URL(relative, base)', format: 'URL.toString()' },
  util: { isArray: 'Array.isArray()', isBoolean: 'typeof x === "boolean"', isNull: 'x === null', isNullOrUndefined: 'x == null', isNumber: 'typeof x === "number"', isString: 'typeof x === "string"', isSymbol: 'typeof x === "symbol"', isUndefined: 'x === undefined', isRegExp: 'x instanceof RegExp', isObject: 'typeof x === "object"', isDate: 'x instanceof Date', isError: 'x instanceof Error', isFunction: 'typeof x === "function"', isPrimitive: 'a typeof check', isBuffer: 'Buffer.isBuffer()', log: 'console.log()', print: 'console.log()', puts: 'console.log()', debug: 'console.error()', error: 'console.error()', _extend: 'Object.assign()' },
  crypto: { pseudoRandomBytes: 'crypto.randomBytes()', createCredentials: 'tls.createSecureContext()' },
  os: { tmpDir: 'os.tmpdir()', getNetworkInterfaces: 'os.networkInterfaces()' },
  path: { _makeLong: 'path.toNamespacedPath()' },
};
const DEPRECATED_MODULES = new Set(['domain', 'punycode', 'sys', 'constants', '_linklist', '_stream_wrap']);
const DEPRECATED_METHODS = { substr: 'substring() or slice()', __defineGetter__: 'Object.defineProperty()', __defineSetter__: 'Object.defineProperty()', __lookupGetter__: 'Object.getOwnPropertyDescriptor()', __lookupSetter__: 'Object.getOwnPropertyDescriptor()', getYear: 'getFullYear()', setYear: 'setFullYear()', toGMTString: 'toUTCString()' };

rule('deprecated-api', {
  t: 'S', s: 'MI', debt: 15, ref: 'S1874', tags: ['obsolete'],
  name: ['Deprecated APIs should not be used', '폐기 예정 API를 쓰면 안 됩니다'],
  why: ['Deprecated APIs may be removed or behave insecurely; their replacements are better maintained.', '폐기 예정 API는 없어지거나 안전하지 않게 동작할 수 있으며 대체 API가 더 잘 관리됩니다.'],
  fix: ['Switch to the documented replacement.', '문서에 나온 대체 API로 바꾸세요.'],
}, (ctx) => {
  const say = (node, what, repl) => ctx.report(node, m(`"${what}" is deprecated; use ${repl} instead.`, `"${what}"는 폐기 예정입니다. 대신 ${repl}를 쓰세요.`));
  for (const n of ctx.nodesOf('CallExpression', 'NewExpression')) {
    const c = unwrapTS(n.callee);
    if (c.type === 'Identifier' && B.isUnresolved(ctx, c)) {
      if (c.name === 'Buffer' && n.arguments.length) { say(n, `${n.type === 'NewExpression' ? 'new ' : ''}Buffer()`, 'Buffer.from() / Buffer.alloc()'); continue; }
      if (c.name === 'escape' || c.name === 'unescape') { say(n, `${c.name}()`, c.name === 'escape' ? 'encodeURIComponent()' : 'decodeURIComponent()'); continue; }
      if (c.name === 'require' && n.arguments.length === 1) {
        const s = W.stringValue(n.arguments[0]);
        if (s && DEPRECATED_MODULES.has(s.replace(/^node:/, ''))) say(n, `require('${s}')`, 'a maintained alternative');
        continue;
      }
    }
    if (c.type === 'Identifier') {
      // const { parse } = require('url'); parse(u)  /  import { exists } from 'fs'
      const t = ctx.target(c);
      if (t && t.module && t.path.length === 1 && DEPRECATED_MODULE_FNS[t.module.replace(/^node:/, '')] && DEPRECATED_MODULE_FNS[t.module.replace(/^node:/, '')][t.path[0]]) { say(c, `${t.module}.${t.path[0]}`, DEPRECATED_MODULE_FNS[t.module.replace(/^node:/, '')][t.path[0]]); continue; }
    }
    if (c.type === 'MemberExpression' && !c.computed) {
      const p = propName(c);
      const t = ctx.target(c);
      if (t && t.module && t.path.length === 1 && DEPRECATED_MODULE_FNS[t.module] && DEPRECATED_MODULE_FNS[t.module][t.path[0]]) { say(c.property, `${t.module}.${t.path[0]}`, DEPRECATED_MODULE_FNS[t.module][t.path[0]]); continue; }
      if (p && DEPRECATED_METHODS[p] && n.type === 'CallExpression') {
        if (p === 'getYear' || p === 'setYear' || p === 'toGMTString' || p.startsWith('__') || p === 'substr') { say(c.property, p, DEPRECATED_METHODS[p]); continue; }
      }
      if (p === 'execCommand' && dottedName(c.object) === 'document') { say(c.property, 'document.execCommand', 'the Clipboard / Selection APIs'); continue; }
    }
  }
  for (const d of ctx.nodes('ImportDeclaration')) {
    const s = d.source.value.replace(/^node:/, '');
    if (DEPRECATED_MODULES.has(s)) say(d.source, `import '${d.source.value}'`, 'a maintained alternative');
  }
  for (const me of ctx.nodes('MemberExpression')) {
    if (me.computed) continue;
    const p = propName(me);
    if (p === 'keyCode' || p === 'charCode' || p === 'which') {
      const o = unwrapTS(me.object);
      if (o.type === 'Identifier' && /^(e|ev|evt|event|keyEvent|keyboardEvent|ke)$/i.test(o.name)) {
        const pa = me.parent;
        if (pa && pa.type === 'AssignmentExpression' && pa.left === me) continue;
        say(me.property, `KeyboardEvent.${p}`, 'event.key or event.code');
      }
    }
    const dn = dottedName(me);
    if (dn && /^RegExp\.\$[1-9]$|^RegExp\.(lastMatch|leftContext|rightContext|input|lastParen)$/.test(dn) && B.isUnresolved(ctx, me.object)) say(me, dn, 'the match result array');
  }
});

rule('has-own-property', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6653', tags: ['es2022'],
  name: ['"Object.hasOwn()" should be used instead of "hasOwnProperty"', '"hasOwnProperty" 대신 "Object.hasOwn()"을 써야 합니다'],
  why: ['obj.hasOwnProperty() breaks for objects without a prototype or that override the method; Object.hasOwn is safe and shorter.', 'obj.hasOwnProperty()는 프로토타입이 없거나 메서드를 덮어쓴 객체에서 깨집니다. Object.hasOwn이 안전하고 짧습니다.'],
  fix: ['Use Object.hasOwn(obj, key).', 'Object.hasOwn(obj, key)를 쓰세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    if (c.type !== 'MemberExpression') continue;
    const dn = dottedName(c);
    const viaLiteral = !c.computed && propName(c) === 'call' && unwrapTS(c.object).type === 'MemberExpression' && propName(unwrapTS(c.object)) === 'hasOwnProperty' && unwrapTS(unwrapTS(c.object).object).type === 'ObjectExpression' && !unwrapTS(unwrapTS(c.object).object).properties.length;
    if (dn === 'Object.prototype.hasOwnProperty.call' || viaLiteral) { ctx.report(call, m('Use "Object.hasOwn()" instead of "Object.prototype.hasOwnProperty.call()".', '"Object.prototype.hasOwnProperty.call()" 대신 "Object.hasOwn()"을 쓰세요.')); continue; }
    if (propName(c) === 'hasOwnProperty' && call.arguments.length === 1 && !c.computed) {
      const o = unwrapTS(c.object);
      if (o.type === 'ThisExpression' || o.type === 'Super') continue;
      ctx.report(call, m('Use "Object.hasOwn()" instead of calling "hasOwnProperty" on the object.', '객체의 "hasOwnProperty"를 부르지 말고 "Object.hasOwn()"을 쓰세요.'));
    }
  }
});

rule('async-without-await', {
  t: 'S', s: 'MI', debt: 5, tags: ['async'],
  name: ['Async functions should use "await"', 'async 함수는 "await"를 써야 합니다'],
  why: ['An async function without await still wraps its result in a promise, which costs time and misleads callers.', 'await 없는 async 함수도 결과를 Promise로 감싸 시간을 쓰고 호출하는 쪽을 헷갈리게 합니다.'],
  fix: ['Remove "async", or add the missing await.', '"async"를 지우거나 빠진 await를 넣으세요.'],
}, (ctx) => {
  for (const fn of ctx.functions()) {
    if (!fn.async || fn.generator || !fn.body || fn.body.type !== 'BlockStatement' || !fn.body.body.length) continue;
    if (fn.parent && (fn.parent.type === 'MethodDefinition' || fn.parent.type === 'Property' || fn.parent.type === 'PropertyDefinition')) continue;
    if (U.callbackOf(fn)) continue;
    if (U.contains(fn.body, (n) => n.type === 'AwaitExpression' || (n.type === 'ForOfStatement' && n.await) || (n.type === 'VariableDeclaration' && n.kind === 'await using'), false)) continue;
    if (U.contains(fn.body, (n) => n.type === 'ThrowStatement', false)) continue;
    ctx.report(fnHead(fn), m(`${fnLabel(fn)} is async but contains no "await".`, `${fnLabelKo(fn)}는 async인데 "await"가 없습니다.`));
  }
});

const NATIVE = new Set(['Object', 'Array', 'String', 'Number', 'Boolean', 'Function', 'Date', 'RegExp', 'Error', 'Promise', 'Map', 'Set', 'Symbol', 'Element', 'HTMLElement', 'Node', 'Event', 'EventTarget', 'NodeList']);

rule('extend-native', {
  t: 'S', s: 'MA', debt: 10, ref: 'S2424', tags: ['pitfall'],
  name: ['Built-in prototypes should not be extended', '내장 프로토타입을 확장하면 안 됩니다'],
  why: ['Adding properties to Array.prototype or Object.prototype affects every script and can collide with future standards.', 'Array.prototype이나 Object.prototype에 속성을 더하면 모든 코드에 영향을 주고 미래 표준과 충돌할 수 있습니다.'],
  fix: ['Use a helper function or a subclass.', '도우미 함수나 하위 클래스를 쓰세요.'],
}, (ctx) => {
  for (const a of ctx.nodes('AssignmentExpression')) {
    const l = a.left;
    if (l.type !== 'MemberExpression') continue;
    const o = unwrapTS(l.object);
    if (o.type === 'MemberExpression' && propName(o) === 'prototype' && o.object.type === 'Identifier' && NATIVE.has(o.object.name) && B.isUnresolved(ctx, o.object)) ctx.report(a, m(`Do not extend the native "${o.object.name}.prototype".`, `내장 "${o.object.name}.prototype"을 확장하지 마세요.`));
  }
  for (const call of ctx.nodes('CallExpression')) {
    const dn = dottedName(call.callee);
    if (dn !== 'Object.defineProperty' && dn !== 'Object.defineProperties') continue;
    const t = unwrapTS(call.arguments[0]);
    if (t && t.type === 'MemberExpression' && propName(t) === 'prototype' && t.object.type === 'Identifier' && NATIVE.has(t.object.name) && B.isUnresolved(ctx, t.object)) ctx.report(call, m(`Do not extend the native "${t.object.name}.prototype".`, `내장 "${t.object.name}.prototype"을 확장하지 마세요.`));
  }
});

rule('function-in-block', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1530', tags: ['pitfall'],
  name: ['Function declarations should not be made within blocks', '블록 안에서 함수를 선언하면 안 됩니다'],
  why: ['Function declarations inside if / loop blocks behave differently between strict and sloppy mode and between engines.', 'if나 반복 블록 안의 함수 선언은 strict와 느슨한 모드, 엔진마다 다르게 동작합니다.'],
  fix: ['Use a function expression assigned to a let / const, or move it out of the block.', 'let / const에 대입한 함수 식을 쓰거나 블록 밖으로 옮기세요.'],
}, (ctx) => {
  for (const fn of ctx.nodes('FunctionDeclaration')) {
    const p = fn.parent;
    if (p && p.type === 'BlockStatement' && p.parent && !isFunction(p.parent) && p.parent.type !== 'StaticBlock' && p.parent.type !== 'TSModuleBlock') ctx.report(fn.id || fn, m('Do not use function declarations within blocks.', '블록 안에서 함수 선언을 쓰지 마세요.'));
  }
});

rule('comma-operator', {
  t: 'S', s: 'MA', debt: 5, ref: 'S878', tags: ['confusing'],
  name: ['Comma operator should not be used', '쉼표 연산자를 쓰면 안 됩니다'],
  why: ['The comma operator evaluates several expressions and keeps only the last; it is easily mistaken for an argument list.', '쉼표 연산자는 여러 식을 계산하고 마지막 값만 남기며 인자 목록으로 오해하기 쉽습니다.'],
  fix: ['Split it into separate statements.', '별도 문장으로 나누세요.'],
}, (ctx) => {
  for (const s of ctx.nodes('SequenceExpression')) {
    const p = s.parent;
    if (p && p.type === 'ForStatement' && (p.init === s || p.update === s)) continue;
    if ((s.parenthesized || 0) >= 2) continue;
    ctx.report(s, m('Remove use of the comma operator.', '쉼표 연산자를 쓰지 마세요.'));
  }
});

rule('default-case-last', {
  t: 'S', s: 'MI', debt: 5, ref: 'S4524', tags: ['convention'],
  name: ['"default" clauses should be last', '"default" 절은 마지막에 와야 합니다'],
  why: ['Readers expect the default case at the end; putting it elsewhere hides the fall-through logic.', '읽는 사람은 default가 끝에 있을 것으로 기대합니다. 다른 곳에 두면 흐름이 가려집니다.'],
  fix: ['Move the default clause to the end.', 'default 절을 끝으로 옮기세요.'],
}, (ctx) => {
  for (const sw of ctx.nodes('SwitchStatement')) {
    const i = sw.cases.findIndex((c) => !c.test);
    if (i >= 0 && i !== sw.cases.length - 1) ctx.report(sw.cases[i], m('Move this "default" clause to the end of this "switch" statement.', '이 "default" 절을 "switch" 문의 끝으로 옮기세요.'));
  }
});

rule('bitwise-in-boolean', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1529', tags: ['suspicious'],
  name: ['Bitwise operators should not be used in boolean contexts', '불리언 문맥에서 비트 연산자를 쓰면 안 됩니다'],
  why: ['"&" and "|" between comparisons evaluate both sides and are usually a typo for "&&" / "||".', '비교 사이의 "&"와 "|"는 양쪽을 다 계산하며 보통 "&&" / "||"의 오타입니다.'],
  fix: ['Use && or ||.', '&&나 ||를 쓰세요.'],
}, (ctx) => {
  const boolish = (x) => { x = unwrapTS(x); return (x.type === 'BinaryExpression' && /^(==|!=|===|!==|<|>|<=|>=|instanceof|in)$/.test(x.operator)) || (x.type === 'UnaryExpression' && x.operator === '!') || isBool(x) || (x.type === 'LogicalExpression' && x.operator !== '??'); };
  for (const n of ctx.nodes('BinaryExpression')) {
    if (n.operator !== '&' && n.operator !== '|') continue;
    if (!(boolish(n.left) || boolish(n.right))) continue;
    ctx.report(n, m(`Review this use of the bitwise "${n.operator}" operator; did you mean "${n.operator}${n.operator}"?`, `비트 연산자 "${n.operator}"의 이 사용을 검토하세요. "${n.operator}${n.operator}"를 의도했나요?`));
  }
});

rule('loop-func', {
  t: 'S', s: 'MA', debt: 10, ref: 'S1515', tags: ['pitfall'],
  name: ['Functions should not be defined inside loops when they capture the loop variable', '반복 변수를 붙잡는 함수를 반복 안에서 정의하면 안 됩니다'],
  why: ['A closure created in a loop that reads a "var" loop variable sees its final value, not the value of its own iteration.', '반복 안에서 만든 클로저가 "var" 반복 변수를 읽으면 자기 반복의 값이 아니라 최종 값을 봅니다.'],
  fix: ['Declare the loop variable with let, or pass the value as a parameter.', '반복 변수를 let으로 선언하거나 값을 매개변수로 넘기세요.'],
}, (ctx) => {
  for (const fn of ctx.nodesOf('FunctionExpression', 'ArrowFunctionExpression')) {
    // nearest loop within the same function
    let p = fn.parent;
    let loop = null;
    while (p && !isFunction(p)) {
      if (/^(For|While|DoWhile|ForIn|ForOf)Statement$/.test(p.type)) { loop = p; break; }
      p = p.parent;
    }
    if (!loop) continue;
    // IIFE or immediately-invoked callbacks of array methods are fine
    const cb = U.callbackOf(fn);
    if (cb && cb.call.type === 'CallExpression' && cb.call.callee === fn) continue;
    if (fn.parent && fn.parent.type === 'CallExpression' && fn.parent.callee === fn) continue;
    if (cb && ['forEach', 'map', 'filter', 'some', 'every', 'find', 'reduce', 'findIndex', 'sort', 'flatMap'].includes(W.calleeProp(cb.call))) continue;
    const bad = U.findAll(fn.body, (n) => {
      if (n.type !== 'Identifier' || !n._ref || !n._ref.resolved) return false;
      const v = n._ref.resolved;
      if (v.kind !== 'var') return false;
      if (v.scope.fn !== (ctx.scope.byNode.get(W.enclosingFunction(fn)) || ctx.scope.globalScope).fn && v.scope.fn !== ctx.scope.globalScope) return false;
      return v.refs.some((r) => r.write && r.id.start >= loop.start && r.id.end <= loop.end && !(r.id.start >= fn.start && r.id.end <= fn.end));
    }, true);
    if (bad.length) ctx.report(fn, m(`This function refers to the loop variable "${bad[0].name}", which is declared with "var" and shared by all iterations.`, `이 함수는 "var"로 선언되어 모든 반복이 공유하는 반복 변수 "${bad[0].name}"를 참조합니다.`));
  }
});

rule('misleading-indentation', {
  t: 'S', s: 'CR', debt: 5, ref: 'S3973', tags: ['suspicious'],
  name: ['A conditionally executed single line should be denoted by indentation', '조건부로 실행되는 한 줄은 들여쓰기로 표시해야 합니다'],
  why: ['The body of the if / loop is on the next line but not indented, so it looks unconditional.', 'if나 반복의 본문이 다음 줄에 있지만 들여쓰지 않아 조건 없이 실행되는 것처럼 보입니다.'],
  fix: ['Indent the body, or add braces.', '본문을 들여쓰거나 중괄호를 넣으세요.'],
}, (ctx) => {
  for (const n of ctx.nodesOf('IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement')) {
    const bodies = n.type === 'IfStatement' ? [n.consequent, n.alternate && n.alternate.type !== 'IfStatement' ? n.alternate : null] : [n.body];
    for (const b of bodies) {
      if (!b || b.type === 'BlockStatement' || b.type === 'EmptyStatement') continue;
      const head = ctx.loc(n.start);
      const bl = ctx.loc(b.start);
      if (bl.line === head.line) continue;
      if (b === n.alternate) {
        const elsePos = ctx.src.lastIndexOf('else', b.start);
        const el = ctx.loc(elsePos);
        if (bl.line !== el.line && bl.column <= el.column) ctx.report(b, m('Use curly braces or indentation to denote the code conditionally executed by this "else".', '이 "else"가 조건부로 실행하는 코드는 중괄호나 들여쓰기로 표시하세요.'));
        continue;
      }
      if (bl.column <= head.column) ctx.report(b, m('Use curly braces or indentation to denote the code conditionally executed by this statement.', '이 문장이 조건부로 실행하는 코드는 중괄호나 들여쓰기로 표시하세요.'));
    }
  }
});

rule('throw-literal', {
  t: 'S', s: 'MA', debt: 5, ref: 'S3696', tags: ['error-handling'],
  name: ['Literals should not be thrown', '리터럴을 던지면 안 됩니다'],
  why: ['A thrown string or number has no stack trace and breaks "instanceof Error" checks.', '던진 문자열이나 숫자에는 스택 추적이 없고 "instanceof Error" 검사가 깨집니다.'],
  fix: ['Throw an Error object: throw new Error("...").', 'Error 객체를 던지세요: throw new Error("...")'],
}, (ctx) => {
  for (const t of ctx.nodes('ThrowStatement')) {
    const a = unwrapTS(t.argument);
    const lit = (x) => (x.type === 'Literal' && !x.regex) || x.type === 'TemplateLiteral' || (x.type === 'BinaryExpression' && x.operator === '+' && (lit(unwrapTS(x.left)) || lit(unwrapTS(x.right))));
    if (lit(a) || W.isUndefined(a)) ctx.report(t, m('Throw an Error object instead of a literal.', '리터럴 대신 Error 객체를 던지세요.'));
  }
});

rule('promise-reject-non-error', {
  t: 'S', s: 'MA', debt: 5, ref: 'S6671', tags: ['promise', 'error-handling'],
  name: ['Promise rejections should use Error objects', 'Promise 거부에는 Error 객체를 써야 합니다'],
  why: ['Rejecting with a string or plain object loses the stack trace and confuses error handlers.', '문자열이나 일반 객체로 거부하면 스택 추적이 사라지고 오류 처리기가 헷갈립니다.'],
  fix: ['Reject with new Error("...").', 'new Error("...")로 거부하세요.'],
}, (ctx) => {
  const bad = (x) => { x = unwrapTS(x); return (x.type === 'Literal' && !x.regex) || x.type === 'TemplateLiteral' || x.type === 'ObjectExpression' || W.isUndefined(x); };
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    if (dottedName(c) === 'Promise.reject' && B.isUnresolved(ctx, c.object) && call.arguments[0] && bad(call.arguments[0])) { ctx.report(call, m('Expected the Promise rejection reason to be an Error.', 'Promise 거부 이유는 Error여야 합니다.')); continue; }
    if (c.type === 'Identifier' && call.arguments[0] && bad(call.arguments[0])) {
      const v = ctx.varOf(c);
      const d = v && v.defs[0];
      if (d && d.kind === 'param' && d.node && d.node.type !== 'TSDeclareFunction' && d.node.params[1] === d.id) {
        const ex = d.node;
        const ne = ex.parent;
        if (ne && ne.type === 'NewExpression' && ne.arguments[0] === ex && unwrapTS(ne.callee).type === 'Identifier' && unwrapTS(ne.callee).name === 'Promise') ctx.report(call, m('Expected the Promise rejection reason to be an Error.', 'Promise 거부 이유는 Error여야 합니다.'));
      }
    }
  }
});

rule('nested-assignment', {
  t: 'S', s: 'MA', debt: 5, ref: 'S1121', tags: ['suspicious'],
  name: ['Assignments should not be made from within sub-expressions', '하위 식 안에서 대입하면 안 됩니다'],
  why: ['An assignment buried in a larger expression is easy to overlook and to confuse with a comparison.', '큰 식에 묻힌 대입은 놓치기 쉽고 비교로 오해하기 쉽습니다.'],
  fix: ['Move the assignment into its own statement.', '대입을 별도 문장으로 빼세요.'],
}, (ctx) => {
  for (const a of ctx.nodes('AssignmentExpression')) {
    let p = a.parent;
    let child = a;
    while (p && (p.type === 'TSAsExpression' || p.type === 'TSNonNullExpression')) { child = p; p = p.parent; }
    if (!p) continue;
    if (p.type === 'ExpressionStatement' || p.type === 'AssignmentExpression' && p.right === child) continue;
    if (p.type === 'ForStatement' && (p.init === child || p.update === child)) continue;
    if (p.type === 'SequenceExpression') {
      const gp = p.parent;
      if (gp && (gp.type === 'ExpressionStatement' || (gp.type === 'ForStatement' && (gp.init === p || gp.update === p)))) continue;
    }
    if (p.type === 'ArrowFunctionExpression' && p.body === child) continue;
    if (testOfAny(child)) continue;
    if (p.type === 'BinaryExpression' && testOfAny(p) && child.parenthesized) continue;
    if (p.type === 'LogicalExpression' && p.right === child && p.parent && p.parent.type === 'ExpressionStatement') continue;
    if (p.type === 'ConditionalExpression' && p.test !== child && p.parent && p.parent.type === 'ExpressionStatement') continue;
    if (p.type === 'UnaryExpression' && p.operator === 'void') continue;
    if (p.type === 'AssignmentPattern' || p.type === 'Property' || p.type === 'JSXExpressionContainer') continue;
    ctx.report(a, m(`Extract the assignment of "${ctx.text(a.left)}" from this expression.`, `이 식에서 "${ctx.text(a.left)}"에 대한 대입을 빼내세요.`));
  }
});

function testOfAny(n) {
  const p = n.parent;
  return !!p && ((p.type === 'IfStatement' || p.type === 'WhileStatement' || p.type === 'DoWhileStatement' || p.type === 'ConditionalExpression' || p.type === 'ForStatement') && p.test === n);
}

module.exports = { cognitive, looksLikeCode };
