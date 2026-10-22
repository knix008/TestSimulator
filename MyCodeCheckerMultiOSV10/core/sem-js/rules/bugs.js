'use strict';

// Reliability rules (bugs) on the AST and scopes.

const { rule, m } = require('./define');
const W = require('../walk');
const U = require('./util');

const { unwrapTS, equal, propName, dottedName, staticValue, isFunction, keyName } = W;

const SIDE_EFFECT_TYPES = new Set(['CallExpression', 'NewExpression', 'AssignmentExpression', 'UpdateExpression', 'AwaitExpression', 'YieldExpression', 'TaggedTemplateExpression', 'ImportExpression']);

function hasSideEffects(n) {
  return U.contains(n, (x) => SIDE_EFFECT_TYPES.has(x.type) || (x.type === 'UnaryExpression' && x.operator === 'delete'), false);
}

function isUnresolved(ctx, id) {
  return id && id.type === 'Identifier' && (!id._ref || !id._ref.resolved);
}

function localFunction(ctx, callee) {
  callee = unwrapTS(callee);
  if (!callee || callee.type !== 'Identifier') return null;
  const v = ctx.varOf(callee);
  if (!v || v.defs.length !== 1) return null;
  if (v.refs.some((r) => r.write && !r.init)) return null;
  const d = v.defs[0];
  if (d.kind === 'function' && d.node.type === 'FunctionDeclaration') return d.node;
  if ((d.kind === 'const' || d.kind === 'let') && d.node.type === 'VariableDeclarator' && d.node.id.type === 'Identifier') {
    const init = unwrapTS(d.node.init);
    if (init && (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression')) return init;
  }
  return null;
}

function ownReturns(fn) {
  return U.findAll(fn.body, (n) => n.type === 'ReturnStatement', false);
}

function bodyText(ctx, n) {
  return ctx.text(n).replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------- operands
const IDENT_OPS = new Set(['==', '!=', '===', '!==', '<', '>', '<=', '>=', '&&', '||', '??', '-', '/', '%', '&', '|', '^', 'instanceof']);

rule('identical-operands', {
  t: 'B', s: 'MA', debt: 2, sonar: 'S1764', tags: ['suspicious'],
  name: ['Identical expressions should not be used on both sides of a binary operator', '이항 연산자 양쪽에 같은 식을 쓰면 안 됩니다'],
  why: ['Using the same expression on both sides always gives the same result and is almost always a copy-paste mistake.', '양쪽에 같은 식을 쓰면 결과가 항상 같고 거의 항상 복사 실수입니다.'],
  fix: ['Fix the operand that was meant to be different; use Number.isNaN() to test for NaN.', '달라야 할 피연산자를 고치세요. NaN 검사는 Number.isNaN()을 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodesOf('BinaryExpression', 'LogicalExpression')) {
    if (!IDENT_OPS.has(n.operator)) continue;
    if (!equal(n.left, n.right)) continue;
    if (hasSideEffects(n.left)) continue;
    const l = unwrapTS(n.left);
    if ((n.operator === '!==' || n.operator === '!=' || n.operator === '===' || n.operator === '==') && (l.type === 'Identifier' || l.type === 'MemberExpression')) {
      // x !== x is the classic NaN test
      if (n.operator === '!==' || n.operator === '!=') continue;
    }
    if (l.type === 'Literal' && (n.operator === '-' || n.operator === '/' || n.operator === '%' || n.operator === '&' || n.operator === '|' || n.operator === '^')) continue;
    ctx.report(n, m(`Correct one of the identical sub-expressions on both sides of operator "${n.operator}".`, `연산자 "${n.operator}" 양쪽의 같은 식 중 하나를 고치세요.`));
  }
});

const RELOAD_PROPS = new Set(['src', 'href', 'value', 'scrollTop', 'scrollLeft', 'currentTime', 'innerHTML', 'outerHTML', 'textContent', 'className', 'hash', 'search', 'location', 'data', 'checked', 'selectedIndex']);

rule('self-assignment', {
  t: 'B', s: 'MA', debt: 3, sonar: 'S1656', tags: ['suspicious'],
  name: ['Variables should not be self-assigned', '변수를 자기 자신에게 대입하면 안 됩니다'],
  why: ['Assigning a variable to itself has no effect and usually hides a typo in one of the names.', '자기 대입은 효과가 없고 보통 이름 중 하나의 오타를 숨깁니다.'],
  fix: ['Assign the intended value or remove the statement.', '의도한 값을 대입하거나 문장을 지우세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('AssignmentExpression')) {
    if (n.operator !== '=' && n.operator !== '&&=' && n.operator !== '||=' && n.operator !== '??=') continue;
    const l = unwrapTS(n.left);
    if (!equal(l, unwrapTS(n.right))) continue;
    if (l.type !== 'Identifier' && l.type !== 'MemberExpression') continue;
    if (hasSideEffects(l)) continue;
    if (l.type === 'MemberExpression') {
      const p = propName(l);
      if (!p || RELOAD_PROPS.has(p)) continue;
      const root = dottedName(l);
      if (!root || /^(window|document|location|globalThis)\b/.test(root)) continue;
    }
    ctx.report(n, m(`Remove or correct this useless self-assignment of "${ctx.text(l)}".`, `"${ctx.text(l)}"의 쓸모없는 자기 대입을 지우거나 고치세요.`));
  }
});

// ---------------------------------------------------------------- branches
function ifChain(ifs) {
  const branches = [];
  const tests = [];
  let cur = ifs;
  for (;;) {
    tests.push(cur.test);
    branches.push(cur.consequent);
    if (cur.alternate && cur.alternate.type === 'IfStatement') { cur = cur.alternate; continue; }
    return { branches, tests, final: cur.alternate };
  }
}

function stripBreak(list) {
  const out = list.slice();
  while (out.length && out[out.length - 1].type === 'BreakStatement' && !out[out.length - 1].label) out.pop();
  return out;
}

function isEmptyBranch(s) {
  return !s || s.type === 'EmptyStatement' || (s.type === 'BlockStatement' && s.body.length === 0);
}

rule('all-branches-identical', {
  t: 'B', s: 'MA', debt: 10, sonar: 'S3923', tags: ['suspicious'],
  name: ['All branches in a conditional structure should not have exactly the same implementation', '조건 구조의 모든 분기 구현이 똑같으면 안 됩니다'],
  why: ['When every branch does the same thing the condition is pointless, which usually means one branch was not updated.', '모든 분기가 같은 일을 하면 조건이 무의미하며 보통 한 분기를 고치지 않은 것입니다.'],
  fix: ['Remove the condition or fix the branch that should differ.', '조건을 지우거나 달라야 할 분기를 고치세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('IfStatement')) {
    if (n.parent && n.parent.type === 'IfStatement' && n.parent.alternate === n) continue;
    const { branches, final } = ifChain(n);
    if (!final || final.type === 'IfStatement') continue;
    const all = branches.concat([final]);
    if (all.every(isEmptyBranch)) continue;
    if (all.every((b) => equal(b, all[0]))) ctx.report(n, m('Remove this conditional structure or edit its code blocks so that they are not all the same.', '이 조건 구조를 지우거나 모든 분기가 같지 않도록 고치세요.'));
  }
  for (const n of ctx.nodes('ConditionalExpression')) {
    if (equal(n.consequent, n.alternate)) ctx.report(n, m('This conditional operation returns the same value whether the condition is true or false.', '이 조건 연산은 조건과 관계없이 같은 값을 돌려줍니다.'));
  }
  for (const n of ctx.nodes('SwitchStatement')) {
    if (n.cases.length < 2 || !n.cases.some((c) => !c.test)) continue;
    const bodies = n.cases.map((c) => stripBreak(c.consequent));
    if (bodies.some((b) => b.length === 0)) continue;
    if (bodies.every((b) => equal(b, bodies[0]))) ctx.report(n, m('Remove this switch or edit its cases so that they are not all the same.', '이 switch를 지우거나 모든 case가 같지 않도록 고치세요.'));
  }
});

rule('duplicate-condition', {
  t: 'B', s: 'MA', debt: 10, sonar: 'S1862', tags: ['suspicious'],
  name: ['Related "if/else if" statements should not have the same condition', '연결된 "if/else if"에 같은 조건을 쓰면 안 됩니다'],
  why: ['A repeated condition in an else-if chain can never be true when reached, so its branch is dead code.', 'else-if 사슬에서 반복된 조건은 도달했을 때 절대 참이 아니어서 그 분기는 죽은 코드입니다.'],
  fix: ['Change the duplicated condition or merge the branches.', '중복된 조건을 바꾸거나 분기를 합치세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('IfStatement')) {
    if (n.parent && n.parent.type === 'IfStatement' && n.parent.alternate === n) continue;
    const { tests } = ifChain(n);
    for (let i = 1; i < tests.length; i++) {
      if (hasSideEffects(tests[i])) continue;
      for (let j = 0; j < i; j++) {
        if (equal(tests[i], tests[j])) {
          ctx.report(tests[i], m(`This branch can not be reached because the condition duplicates a previous condition on line ${ctx.line(tests[j])}.`, `이 조건은 ${ctx.line(tests[j])}번 줄의 조건과 같아 이 분기에 도달할 수 없습니다.`));
          break;
        }
      }
    }
  }
});

rule('duplicate-case', {
  t: 'B', s: 'MA', debt: 10, sonar: 'S1862', tags: ['suspicious'],
  name: ['Switch statements should not have duplicate case values', 'switch 문에 같은 case 값을 쓰면 안 됩니다'],
  why: ['Only the first matching case runs, so a duplicated case label is dead code.', '처음 일치한 case만 실행되므로 중복된 case는 죽은 코드입니다.'],
  fix: ['Remove or correct the duplicated case.', '중복된 case를 지우거나 고치세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('SwitchStatement')) {
    const seen = [];
    for (const c of n.cases) {
      if (!c.test) continue;
      const dup = seen.find((t) => equal(t, c.test));
      if (dup && !hasSideEffects(c.test)) ctx.report(c, m(`This case duplicates the case on line ${ctx.line(dup)}.`, `이 case는 ${ctx.line(dup)}번 줄의 case와 같습니다.`));
      else seen.push(c.test);
    }
  }
});

function isNaNNode(n) {
  n = unwrapTS(n);
  if (!n) return false;
  if (n.type === 'Identifier' && n.name === 'NaN' && (!n._ref || !n._ref.resolved)) return true;
  return n.type === 'MemberExpression' && dottedName(n) === 'Number.NaN';
}

rule('nan-comparison', {
  t: 'B', s: 'CR', debt: 5, sonar: 'S2688', tags: ['suspicious'],
  name: ['"NaN" should not be used in comparisons', '"NaN"을 비교에 쓰면 안 됩니다'],
  why: ['NaN is not equal to anything, itself included, so the comparison always has the same result.', 'NaN은 자기 자신을 포함해 어떤 값과도 같지 않아 비교 결과가 항상 같습니다.'],
  fix: ['Use Number.isNaN(value).', 'Number.isNaN(value)를 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('BinaryExpression')) {
    if (!/^(==|!=|===|!==|<|>|<=|>=)$/.test(n.operator)) continue;
    if (isNaNNode(n.left) || isNaNNode(n.right)) ctx.report(n, m('Use Number.isNaN() to check for NaN; this comparison always gives the same result.', 'NaN 검사에는 Number.isNaN()을 쓰세요. 이 비교 결과는 항상 같습니다.'));
  }
  for (const c of ctx.nodes('SwitchCase')) {
    if (c.test && isNaNNode(c.test)) ctx.report(c, m('This "case NaN" never matches; use Number.isNaN().', '"case NaN"은 절대 일치하지 않습니다. Number.isNaN()을 쓰세요.'));
  }
});

const TYPEOF_VALUES = new Set(['undefined', 'object', 'boolean', 'number', 'string', 'function', 'symbol', 'bigint']);

rule('typeof-invalid', {
  t: 'B', s: 'CR', debt: 5, sonar: 'S4125', tags: ['suspicious'],
  name: ['"typeof" expressions should only be compared to valid values', '"typeof" 식은 올바른 값과만 비교해야 합니다'],
  why: ['typeof only returns a fixed set of strings, so comparing it with anything else never matches.', 'typeof는 정해진 문자열만 돌려주므로 다른 값과 비교하면 절대 일치하지 않습니다.'],
  fix: ['Compare with "undefined", "object", "boolean", "number", "string", "function", "symbol" or "bigint".', '"undefined", "object", "boolean", "number", "string", "function", "symbol", "bigint" 중 하나와 비교하세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('BinaryExpression')) {
    if (!/^(==|!=|===|!==)$/.test(n.operator)) continue;
    const l = unwrapTS(n.left);
    const r = unwrapTS(n.right);
    const isTypeof = (x) => x.type === 'UnaryExpression' && x.operator === 'typeof';
    if (!isTypeof(l) && !isTypeof(r)) continue;
    const other = isTypeof(l) ? r : l;
    if (isTypeof(other)) continue;
    if (other.type === 'Literal' || (other.type === 'TemplateLiteral' && !other.expressions.length) || (other.type === 'Identifier' && other.name === 'undefined')) {
      const v = staticValue(other);
      if (!v || typeof v.value !== 'string' || !TYPEOF_VALUES.has(v.value)) {
        ctx.report(other, m(`"${ctx.text(other)}" is not a possible result of typeof; this comparison is always ${n.operator.startsWith('!') ? 'true' : 'false'}.`, `"${ctx.text(other)}"는 typeof 결과가 될 수 없어 이 비교는 항상 ${n.operator.startsWith('!') ? '참' : '거짓'}입니다.`));
      }
    }
  }
});

rule('unsafe-finally', {
  t: 'B', s: 'CR', debt: 30, sonar: 'S1143', cwe: 'CWE-584', tags: ['error-handling'],
  name: ['Jump statements should not occur in "finally" blocks', '"finally" 블록에서 제어 이동 문을 쓰면 안 됩니다'],
  why: ['A return, throw, break or continue in finally silently discards the exception or return value of the try block.', 'finally 안의 return, throw, break, continue는 try 블록의 예외나 반환값을 조용히 버립니다.'],
  fix: ['Move the jump out of the finally block.', '제어 이동을 finally 블록 밖으로 옮기세요.'],
}, (ctx) => {
  for (const t of ctx.nodes('TryStatement')) {
    if (!t.finalizer) continue;
    const fin = t.finalizer;
    const visit = (n, loopDepth, labels) => {
      if (!n || typeof n !== 'object') return;
      if (isFunction(n) || n.type === 'ClassDeclaration' || n.type === 'ClassExpression') return;
      switch (n.type) {
        case 'ReturnStatement': case 'ThrowStatement':
          ctx.report(n, m(`Remove this "${n.type === 'ReturnStatement' ? 'return' : 'throw'}" statement from this "finally" block.`, `이 "finally" 블록에서 "${n.type === 'ReturnStatement' ? 'return' : 'throw'}" 문을 지우세요.`));
          return;
        case 'BreakStatement': case 'ContinueStatement':
          if (n.label ? !labels.includes(n.label.name) : loopDepth === 0) ctx.report(n, m(`Remove this "${n.type === 'BreakStatement' ? 'break' : 'continue'}" statement from this "finally" block.`, `이 "finally" 블록에서 "${n.type === 'BreakStatement' ? 'break' : 'continue'}" 문을 지우세요.`));
          return;
        default: break;
      }
      const isLoop = /^(For|While|DoWhile|ForIn|ForOf)Statement$/.test(n.type);
      const isSwitch = n.type === 'SwitchStatement';
      const lab = n.type === 'LabeledStatement' ? labels.concat([n.label.name]) : labels;
      for (const c of W.children(n)) {
        const isBreakOnlyCtx = isSwitch;
        visit(c, loopDepth + (isLoop || isBreakOnlyCtx ? 1 : 0), lab);
      }
    };
    visit(fin, 0, []);
  }
});

rule('duplicate-key', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S1534', tags: ['suspicious'],
  name: ['Object literals should not have duplicate property names', '객체 리터럴에 같은 속성 이름을 두 번 쓰면 안 됩니다'],
  why: ['A duplicated key silently overwrites the earlier value, which is usually a copy-paste error.', '중복된 키는 앞의 값을 조용히 덮어쓰며 보통 복사 실수입니다.'],
  fix: ['Rename or remove one of the duplicated properties.', '중복된 속성 중 하나의 이름을 바꾸거나 지우세요.'],
}, (ctx) => {
  for (const o of ctx.nodes('ObjectExpression')) {
    const seen = new Map();
    for (const p of o.properties) {
      if (p.type !== 'Property') { continue; }
      const name = keyName(p.key, p.computed);
      if (name == null || name === '__proto__') continue;
      const kind = p.kind;
      const prev = seen.get(name);
      if (prev) {
        const pairs = (prev.kind === 'get' && kind === 'set') || (prev.kind === 'set' && kind === 'get');
        if (!pairs) { ctx.report(p.key, m(`Duplicate key "${name}"; the property on line ${ctx.line(prev.node)} is overwritten.`, `키 "${name}"가 중복되어 ${ctx.line(prev.node)}번 줄의 속성을 덮어씁니다.`)); continue; }
      }
      seen.set(name, { kind, node: p });
    }
  }
});

rule('duplicate-class-member', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S1534', tags: ['suspicious'],
  name: ['Class members should not be declared twice', '클래스 멤버를 두 번 선언하면 안 됩니다'],
  why: ['The second declaration silently replaces the first one.', '두 번째 선언이 첫 번째를 조용히 대체합니다.'],
  fix: ['Rename or remove one of the members.', '멤버 중 하나의 이름을 바꾸거나 지우세요.'],
}, (ctx) => {
  for (const body of ctx.nodes('ClassBody')) {
    const seen = new Map();
    for (const mbr of body.body) {
      if (mbr.type !== 'MethodDefinition' && mbr.type !== 'PropertyDefinition') continue;
      if (mbr.type === 'MethodDefinition' && !mbr.value.body) continue;
      if (mbr.declare || mbr.abstract) continue;
      const name = keyName(mbr.key, mbr.computed);
      if (name == null) continue;
      const k = `${mbr.static ? 's' : 'i'}:${name}`;
      const kind = mbr.kind || 'field';
      const prev = seen.get(k);
      if (prev && !((prev.kind === 'get' && kind === 'set') || (prev.kind === 'set' && kind === 'get'))) {
        ctx.report(mbr.key, m(`Duplicate class member "${name}"; the declaration on line ${ctx.line(prev.node)} is overwritten.`, `클래스 멤버 "${name}"가 중복되어 ${ctx.line(prev.node)}번 줄의 선언을 덮어씁니다.`));
        continue;
      }
      seen.set(k, { kind, node: mbr });
    }
  }
});

rule('duplicate-parameter', {
  t: 'B', s: 'CR', debt: 5, sonar: 'S1536', tags: ['suspicious'],
  name: ['Function parameter names should be unique', '함수 매개변수 이름은 고유해야 합니다'],
  why: ['With duplicated names only the last parameter is visible, so the earlier argument is lost.', '이름이 중복되면 마지막 매개변수만 보여 앞의 인자가 사라집니다.'],
  fix: ['Rename the duplicated parameter.', '중복된 매개변수의 이름을 바꾸세요.'],
}, (ctx) => {
  for (const fn of ctx.functions()) {
    const seen = new Set();
    for (const p of fn.params) {
      for (const id of W.patternIds(p)) {
        if (id.name === '_' ) continue;
        if (seen.has(id.name)) ctx.report(id, m(`Rename the duplicated function parameter "${id.name}".`, `중복된 함수 매개변수 "${id.name}"의 이름을 바꾸세요.`));
        seen.add(id.name);
      }
    }
  }
});

rule('unsafe-negation', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S3812', tags: ['suspicious'],
  name: ['Negation should not be applied to the left operand of "in" or "instanceof"', '"in"이나 "instanceof"의 왼쪽 피연산자에 부정을 적용하면 안 됩니다'],
  why: ['"!a in b" negates a first and then tests the boolean, which is never what was meant.', '"!a in b"는 a를 먼저 부정한 뒤 불리언을 검사하므로 의도와 다릅니다.'],
  fix: ['Add parentheses: !(a in b) or !(a instanceof B).', '괄호를 쓰세요: !(a in b) 또는 !(a instanceof B).'],
}, (ctx) => {
  for (const n of ctx.nodes('BinaryExpression')) {
    if (n.operator !== 'in' && n.operator !== 'instanceof') continue;
    const l = n.left;
    if (l.type === 'UnaryExpression' && l.operator === '!' && !l.parenthesized) ctx.report(n, m(`Add parentheses: "!(${ctx.text(l.argument)} ${n.operator} ...)" was probably intended.`, `괄호를 넣으세요. "!(${ctx.text(l.argument)} ${n.operator} ...)"를 의도했을 것입니다.`));
  }
});

const ARRAY_CB = new Set(['map', 'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'every', 'some', 'reduce', 'reduceRight', 'flatMap', 'sort', 'toSorted']);

function hasValueReturn(fn) {
  if (fn.body.type !== 'BlockStatement') return true;
  return ownReturns(fn).some((r) => r.argument) || U.contains(fn.body, (n) => n.type === 'ThrowStatement', false) && ownReturns(fn).length === 0 && fn.body.body.length && fn.body.body[fn.body.body.length - 1].type === 'ThrowStatement';
}

rule('array-callback-return', {
  t: 'B', s: 'CR', debt: 5, sonar: 'S3796', tags: ['suspicious'],
  name: ['Callbacks of array methods should have return statements', '배열 메서드의 콜백에는 return 문이 있어야 합니다'],
  why: ['map, filter, find, reduce and similar methods use the callback return value; a callback that returns nothing yields undefined.', 'map, filter, find, reduce 같은 메서드는 콜백 반환값을 씁니다. 아무것도 돌려주지 않으면 undefined가 됩니다.'],
  fix: ['Return a value from the callback, or use forEach when no result is needed.', '콜백에서 값을 돌려주거나 결과가 필요 없으면 forEach를 쓰세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    let cb = null;
    let method = null;
    if (c.type === 'MemberExpression') {
      method = propName(c);
      if (dottedName(c) === 'Array.from') { cb = call.arguments[1]; method = 'from'; } else if (ARRAY_CB.has(method)) cb = call.arguments[0];
    }
    if (!cb || (cb.type !== 'FunctionExpression' && cb.type !== 'ArrowFunctionExpression')) continue;
    if (cb.async || cb.generator || cb.body.type !== 'BlockStatement') continue;
    if (!cb.body.body.length) continue;
    if (ownReturns(cb).some((r) => r.argument)) continue;
    if (U.contains(cb.body, (n) => n.type === 'ThrowStatement', false) && !ownReturns(cb).length) continue;
    ctx.report(cb, m(`Add a "return" statement to this callback of "${method}".`, `"${method}"의 이 콜백에 "return" 문을 넣으세요.`));
  }
});

function accessorFns(ctx, kind) {
  const out = [];
  for (const md of ctx.nodes('MethodDefinition')) if (md.kind === kind && md.value.body) out.push({ fn: md.value, key: md.key, computed: md.computed });
  for (const p of ctx.nodes('Property')) if (p.kind === kind && isFunction(p.value)) out.push({ fn: p.value, key: p.key, computed: p.computed });
  // Object.defineProperty(o, 'x', { get() {} })
  for (const call of ctx.nodes('CallExpression')) {
    const n = dottedName(call.callee);
    if (n !== 'Object.defineProperty' && n !== 'Reflect.defineProperty') continue;
    const desc = unwrapTS(call.arguments[2]);
    if (!desc || desc.type !== 'ObjectExpression') continue;
    const p = W.objectProp(desc, kind);
    if (p && isFunction(p.value) && p.kind === 'init') out.push({ fn: p.value, key: p.key, computed: false });
  }
  return out;
}

rule('getter-return', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S3796', tags: ['suspicious'],
  name: ['Getters should return a value', 'getter는 값을 돌려줘야 합니다'],
  why: ['A getter that does not return yields undefined to every reader of the property.', '값을 돌려주지 않는 getter는 속성을 읽는 모든 곳에 undefined를 줍니다.'],
  fix: ['Return the value on every path of the getter.', 'getter의 모든 경로에서 값을 돌려주세요.'],
}, (ctx) => {
  for (const { fn, key, computed } of accessorFns(ctx, 'get')) {
    if (fn.body.type !== 'BlockStatement') continue;
    const name = keyName(key, computed) || 'getter';
    const rets = ownReturns(fn);
    if (!rets.some((r) => r.argument)) {
      if (U.contains(fn.body, (n) => n.type === 'ThrowStatement', false)) continue;
      ctx.report(key, m(`Add a "return" statement to getter "${name}".`, `getter "${name}"에 "return" 문을 넣으세요.`));
      continue;
    }
    let cfg;
    try { cfg = ctx.cfg(fn); } catch { continue; }
    if (cfg.fallsOff) ctx.report(key, m(`Getter "${name}" does not return a value on every path.`, `getter "${name}"가 모든 경로에서 값을 돌려주지 않습니다.`));
  }
});

rule('setter-return', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S2432', tags: ['suspicious'],
  name: ['Setters should not return values', 'setter는 값을 돌려주면 안 됩니다'],
  why: ['The value returned by a setter is ignored, so returning one suggests a misunderstanding.', 'setter가 돌려주는 값은 무시되므로 값을 돌려주는 것은 오해를 뜻합니다.'],
  fix: ['Remove the returned value.', '돌려주는 값을 지우세요.'],
}, (ctx) => {
  for (const { fn } of accessorFns(ctx, 'set')) {
    if (fn.body.type !== 'BlockStatement') continue;
    for (const r of ownReturns(fn)) if (r.argument && !W.isUndefined(r.argument)) ctx.report(r, m('Remove this return value; setters cannot return values.', '이 반환값을 지우세요. setter는 값을 돌려줄 수 없습니다.'));
  }
});

rule('constructor-return', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S6635', tags: ['suspicious'],
  name: ['Constructors should not return values', '생성자는 값을 돌려주면 안 됩니다'],
  why: ['Returning a value from a constructor replaces the new instance and confuses readers.', '생성자에서 값을 돌려주면 새 인스턴스가 대체되어 읽는 사람을 헷갈리게 합니다.'],
  fix: ['Remove the returned value, or use a factory function.', '반환값을 지우거나 팩토리 함수를 쓰세요.'],
}, (ctx) => {
  for (const md of ctx.nodes('MethodDefinition')) {
    if (md.kind !== 'constructor' || !md.value.body) continue;
    for (const r of ownReturns(md.value)) if (r.argument) ctx.report(r, m('Remove this return value from the constructor.', '생성자에서 이 반환값을 지우세요.'));
  }
});

function promiseExecutor(ctx, n) {
  if (n.type !== 'NewExpression') return null;
  const c = unwrapTS(n.callee);
  if (!(c.type === 'Identifier' && c.name === 'Promise' && isUnresolved(ctx, c))) return null;
  const ex = n.arguments[0];
  return ex && isFunction(ex) ? ex : null;
}

rule('promise-executor-return', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S7059', tags: ['promise'],
  name: ['Promise executors should not return values', 'Promise 실행자는 값을 돌려주면 안 됩니다'],
  why: ['The value returned by the executor is ignored; returning one usually means resolve() was meant.', '실행자가 돌려주는 값은 무시됩니다. 값을 돌려준다면 보통 resolve()를 의도한 것입니다.'],
  fix: ['Call resolve(value) instead of returning it.', '값을 돌려주는 대신 resolve(value)를 호출하세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('NewExpression')) {
    const ex = promiseExecutor(ctx, n);
    if (!ex || ex.body.type !== 'BlockStatement') continue;
    for (const r of ownReturns(ex)) {
      const a = r.argument && unwrapTS(r.argument);
      if (!a || a.type === 'CallExpression' || W.isUndefined(a)) continue;
      ctx.report(r, m('Use resolve() instead of returning a value from the Promise executor.', 'Promise 실행자에서 값을 돌려주지 말고 resolve()를 쓰세요.'));
    }
  }
});

rule('async-promise-executor', {
  t: 'B', s: 'MA', debt: 10, sonar: 'S6544', tags: ['promise', 'async'],
  name: ['Promise executors should not be async', 'Promise 실행자는 async이면 안 됩니다'],
  why: ['Errors thrown inside an async executor are lost and the outer promise never settles; wrapping await code in new Promise is also unnecessary.', 'async 실행자 안에서 난 오류는 사라지고 바깥 Promise가 끝나지 않습니다. await 코드를 new Promise로 감쌀 필요도 없습니다.'],
  fix: ['Make the executor synchronous, or write an async function instead of new Promise.', '실행자를 동기로 만들거나 new Promise 대신 async 함수를 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('NewExpression')) {
    const ex = promiseExecutor(ctx, n);
    if (ex && ex.async) ctx.report(ex, m('Remove "async" from this Promise executor.', '이 Promise 실행자에서 "async"를 지우세요.'));
  }
});

function precisionLost(raw) {
  const s = raw.replace(/_/g, '');
  if (/^0[xob]/i.test(s)) {
    try {
      const big = BigInt(s);
      return big > BigInt(Number.MAX_SAFE_INTEGER) && BigInt(Number(big)) !== big;
    } catch { return false; }
  }
  if (/^0[0-7]+$/.test(s)) return false;
  const mm = /^(\d*)\.?(\d*)(?:e[+-]?\d+)?$/i.exec(s);
  if (!mm) return false;
  let digits = (mm[1] + mm[2]).replace(/^0+/, '');
  digits = digits.replace(/0+$/, '');
  if (digits.length <= 15) return false;
  const v = Number(s);
  if (!Number.isFinite(v)) return true;
  if (digits.length > 100) return true;
  const back = v.toPrecision(digits.length).replace(/e.*$/i, '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
  return back !== digits;
}

rule('loss-of-precision', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S6534', tags: ['suspicious'],
  name: ['Numeric literals should not lose precision', '숫자 리터럴이 정밀도를 잃으면 안 됩니다'],
  why: ['The literal cannot be represented exactly as a double, so the runtime value differs from what is written.', '이 리터럴은 double로 정확히 나타낼 수 없어 실행 값이 적힌 값과 다릅니다.'],
  fix: ['Use a BigInt literal (123n) or a string for exact values.', '정확한 값이 필요하면 BigInt 리터럴(123n)이나 문자열을 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('Literal')) {
    if (typeof n.value !== 'number' || n.bigint != null || !n.raw || !/^[0-9.]/.test(n.raw)) continue;
    if (precisionLost(n.raw)) ctx.report(n, m(`The numeric literal ${n.raw} loses precision at runtime (${n.value}).`, `숫자 리터럴 ${n.raw}는 실행 시 정밀도를 잃습니다 (${n.value}).`));
  }
});

rule('negative-zero-compare', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S6679', tags: ['suspicious'],
  name: ['Comparisons with "-0" should use Object.is', '"-0"과의 비교에는 Object.is를 써야 합니다'],
  why: ['x === -0 is also true for +0, so the test cannot tell the two zeros apart.', 'x === -0은 +0에도 참이라 두 0을 구별하지 못합니다.'],
  fix: ['Use Object.is(x, -0).', 'Object.is(x, -0)를 쓰세요.'],
}, (ctx) => {
  const negZero = (x) => { x = unwrapTS(x); return x.type === 'UnaryExpression' && x.operator === '-' && x.argument.type === 'Literal' && x.argument.value === 0; };
  for (const n of ctx.nodes('BinaryExpression')) {
    if (!/^(==|!=|===|!==|<|>|<=|>=)$/.test(n.operator)) continue;
    if (negZero(n.left) || negZero(n.right)) ctx.report(n, m('Use Object.is() to compare with -0.', '-0과 비교할 때는 Object.is()를 쓰세요.'));
  }
});

function testOf(n) {
  const p = n.parent;
  if (!p) return false;
  return ((p.type === 'IfStatement' || p.type === 'WhileStatement' || p.type === 'DoWhileStatement' || p.type === 'ConditionalExpression') && p.test === n) || (p.type === 'ForStatement' && p.test === n);
}

rule('assignment-in-condition', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S1121', cwe: 'CWE-481', tags: ['suspicious'],
  name: ['Assignments should not be used as conditions', '대입을 조건으로 쓰면 안 됩니다'],
  why: ['A single "=" in a condition assigns instead of comparing; it is usually a typo for "===".', '조건 안의 "=" 하나는 비교가 아니라 대입이며 보통 "==="의 오타입니다.'],
  fix: ['Use "===" to compare, or move the assignment before the condition.', '비교는 "==="를 쓰거나 대입을 조건 앞으로 옮기세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('AssignmentExpression')) {
    if (n.operator !== '=' || n.parenthesized) continue;
    if (testOf(n)) ctx.report(n, m(`Did you mean "===" here? "${ctx.text(n.left)}" is assigned inside the condition.`, `"==="를 의도했나요? 조건 안에서 "${ctx.text(n.left)}"에 대입합니다.`));
  }
});

rule('sparse-array', {
  t: 'B', s: 'MA', debt: 2, sonar: 'S4140', tags: ['suspicious'],
  name: ['Sparse arrays should not be declared', '빈 칸이 있는 배열을 선언하면 안 됩니다'],
  why: ['Consecutive commas create holes that behave differently from undefined in iteration and are usually typos.', '연속 쉼표는 반복에서 undefined와 다르게 동작하는 빈 칸을 만들며 보통 오타입니다.'],
  fix: ['Remove the extra comma or put an explicit value (undefined) there.', '여분의 쉼표를 지우거나 명시적인 값(undefined)을 넣으세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('ArrayExpression')) {
    if (n.elements.some((e) => e === null)) ctx.report(n, m('Remove the empty slots of this array literal or use explicit "undefined" values.', '이 배열 리터럴의 빈 칸을 지우거나 명시적인 "undefined"를 쓰세요.'));
  }
});

rule('unsafe-optional-chaining', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S6275', tags: ['suspicious'],
  name: ['Optional chaining should not be used where undefined throws', 'undefined가 오류를 일으키는 곳에 옵셔널 체이닝을 쓰면 안 됩니다'],
  why: ['The optional chain short-circuits to undefined, and the surrounding call, member access, spread or destructuring then throws a TypeError.', '옵셔널 체인이 undefined로 끝나면 둘러싼 호출, 속성 접근, 전개, 구조 분해가 TypeError를 냅니다.'],
  fix: ['Extend the optional chain (a?.b?.()) or provide a default with "??".', '옵셔널 체인을 이어 쓰거나(a?.b?.()) "??"로 기본값을 주세요.'],
}, (ctx) => {
  for (const ch of ctx.nodes('ChainExpression')) {
    let n = ch;
    let p = n.parent;
    while (p && (p.type === 'TSAsExpression' || p.type === 'TSNonNullExpression' || p.type === 'TSSatisfiesExpression')) { if (p.type === 'TSNonNullExpression') { p = null; break; } n = p; p = p.parent; }
    if (!p) continue;
    let bad = false;
    if ((p.type === 'CallExpression' || p.type === 'NewExpression') && p.callee === n && !p.optional) bad = true;
    else if (p.type === 'MemberExpression' && p.object === n && !p.optional) bad = true;
    else if (p.type === 'SpreadElement' && p.parent && (p.parent.type === 'ArrayExpression' || p.parent.type === 'CallExpression' || p.parent.type === 'NewExpression')) bad = true;
    else if (p.type === 'ForOfStatement' && p.right === n) bad = true;
    else if (p.type === 'VariableDeclarator' && p.init === n && (p.id.type === 'ObjectPattern' || p.id.type === 'ArrayPattern')) bad = true;
    else if (p.type === 'AssignmentExpression' && p.right === n && (p.left.type === 'ObjectPattern' || p.left.type === 'ArrayPattern')) bad = true;
    else if (p.type === 'BinaryExpression' && p.right === n && (p.operator === 'in' || p.operator === 'instanceof')) bad = true;
    else if ((p.type === 'ClassDeclaration' || p.type === 'ClassExpression') && p.superClass === n) bad = true;
    else if (p.type === 'TaggedTemplateExpression' && p.tag === n) bad = true;
    if (bad) ctx.report(ch, m('This optional chain can short-circuit to undefined, which then throws a TypeError.', '이 옵셔널 체인은 undefined로 끝날 수 있어 TypeError가 납니다.'));
  }
});

rule('new-native-nonconstructor', {
  t: 'B', s: 'MA', debt: 2, sonar: 'S3834', tags: ['suspicious'],
  name: ['"Symbol" and "BigInt" should not be used with "new"', '"Symbol"과 "BigInt"에 "new"를 쓰면 안 됩니다'],
  why: ['Symbol and BigInt are not constructors; "new" throws a TypeError.', 'Symbol과 BigInt는 생성자가 아니라 "new"를 쓰면 TypeError가 납니다.'],
  fix: ['Call them as functions: Symbol("x"), BigInt(1).', '함수로 호출하세요: Symbol("x"), BigInt(1).'],
}, (ctx) => {
  for (const n of ctx.nodes('NewExpression')) {
    const c = unwrapTS(n.callee);
    if (c.type === 'Identifier' && (c.name === 'Symbol' || c.name === 'BigInt') && isUnresolved(ctx, c)) ctx.report(n, m(`"${c.name}" cannot be called with "new".`, `"${c.name}"는 "new"로 호출할 수 없습니다.`));
  }
});

const NON_CALLABLE = new Set(['Math', 'JSON', 'Reflect', 'Atomics', 'Intl']);

rule('non-callable-global', {
  t: 'B', s: 'BL', debt: 5, sonar: 'S2873', tags: ['suspicious'],
  name: ['Non-callable global objects should not be called', '호출할 수 없는 전역 객체를 호출하면 안 됩니다'],
  why: ['Math, JSON, Reflect, Atomics and Intl are namespaces; calling them or using "new" throws a TypeError.', 'Math, JSON, Reflect, Atomics, Intl은 네임스페이스라 호출하거나 "new"를 쓰면 TypeError가 납니다.'],
  fix: ['Call one of their methods instead.', '대신 그 메서드 중 하나를 호출하세요.'],
}, (ctx) => {
  for (const n of ctx.nodesOf('CallExpression', 'NewExpression')) {
    const c = unwrapTS(n.callee);
    if (c.type === 'Identifier' && NON_CALLABLE.has(c.name) && isUnresolved(ctx, c)) ctx.report(n, m(`"${c.name}" is not a function and cannot be called.`, `"${c.name}"는 함수가 아니라 호출할 수 없습니다.`));
  }
});

function reassignRule(id, kinds, sonar, sev, nameEn, nameKo, whyEn, whyKo, msgEn, msgKo) {
  rule(id, {
    t: 'B', s: sev, debt: 5, sonar, tags: ['suspicious'],
    name: [nameEn, nameKo], why: [whyEn, whyKo],
    fix: ['Use a new variable instead of reassigning.', '다시 대입하지 말고 새 변수를 쓰세요.'],
  }, (ctx) => {
    for (const r of ctx.scope.allRefs) {
      if (!r.write || r.init || !r.resolved) continue;
      const v = r.resolved;
      if (!v.defs.length || !kinds.includes(v.defs[0].kind)) continue;
      if (v.defs.some((d) => d.kind === 'var' || d.kind === 'let' || d.kind === 'param')) continue;
      ctx.report(r.id, m(msgEn(v.name), msgKo(v.name)));
    }
  });
}

reassignRule('const-reassign', ['const', 'using'], 'S3500', 'CR', 'Attempts should not be made to update "const" variables', '"const" 변수를 바꾸려고 하면 안 됩니다',
  'Assigning to a const binding throws a TypeError at runtime.', 'const 바인딩에 대입하면 실행 시 TypeError가 납니다.',
  (n) => `"${n}" is a constant and cannot be reassigned.`, (n) => `"${n}"는 상수라 다시 대입할 수 없습니다.`);
reassignRule('function-reassign', ['function'], 'S1527', 'MA', 'Function declarations should not be reassigned', '함수 선언을 다시 대입하면 안 됩니다',
  'Overwriting a declared function makes calls behave differently depending on timing and hides the original.', '선언한 함수를 덮어쓰면 시점에 따라 호출 동작이 달라지고 원래 함수가 가려집니다.',
  (n) => `Function "${n}" is reassigned.`, (n) => `함수 "${n}"에 다시 대입합니다.`);
reassignRule('class-reassign', ['class', 'class-name'], 'S1527', 'MA', 'Class declarations should not be reassigned', '클래스 선언을 다시 대입하면 안 됩니다',
  'Overwriting a class binding breaks every later reference to the class.', '클래스 바인딩을 덮어쓰면 이후의 모든 클래스 참조가 깨집니다.',
  (n) => `Class "${n}" is reassigned.`, (n) => `클래스 "${n}"에 다시 대입합니다.`);
reassignRule('import-reassign', ['import'], 'S6522', 'MA', 'Imported bindings should not be reassigned', '가져온 바인딩에 다시 대입하면 안 됩니다',
  'Imports are read-only live bindings; assigning to one throws in ES modules.', 'import는 읽기 전용 바인딩이라 ES 모듈에서 대입하면 오류가 납니다.',
  (n) => `Imported binding "${n}" is reassigned.`, (n) => `가져온 바인딩 "${n}"에 다시 대입합니다.`);

const READONLY_GLOBALS = new Set(['undefined', 'NaN', 'Infinity', 'globalThis', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Promise', 'Symbol', 'Map', 'Set', 'Date', 'RegExp', 'Error', 'eval', 'console', 'window', 'document', 'Reflect', 'Proxy', 'BigInt']);

rule('global-reassign', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S2424', tags: ['suspicious'],
  name: ['Built-in global objects should not be reassigned', '내장 전역 객체에 다시 대입하면 안 됩니다'],
  why: ['Overwriting undefined, NaN, window or a built-in constructor breaks every other script in the page or process.', 'undefined, NaN, window, 내장 생성자를 덮어쓰면 페이지나 프로세스의 다른 모든 코드가 깨집니다.'],
  fix: ['Use a local variable with another name.', '다른 이름의 지역 변수를 쓰세요.'],
}, (ctx) => {
  for (const r of ctx.scope.through) {
    if (!r.write) continue;
    if (READONLY_GLOBALS.has(r.id.name)) ctx.report(r.id, m(`Do not reassign the built-in global "${r.id.name}".`, `내장 전역 "${r.id.name}"에 다시 대입하지 마세요.`));
  }
});

const RESTRICTED = new Set(['undefined', 'NaN', 'Infinity', 'eval', 'arguments']);

rule('restricted-name-shadow', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S2137', tags: ['suspicious'],
  name: ['Special identifiers should not be bound or shadowed', '특수 식별자를 선언하거나 가리면 안 됩니다'],
  why: ['Declaring undefined, NaN, Infinity, eval or arguments changes their meaning for the whole scope.', 'undefined, NaN, Infinity, eval, arguments를 선언하면 범위 전체에서 의미가 바뀝니다.'],
  fix: ['Choose another name.', '다른 이름을 고르세요.'],
}, (ctx) => {
  for (const s of ctx.scope.scopes) {
    for (const v of s.vars.values()) {
      if (!RESTRICTED.has(v.name) || v.implicit) continue;
      for (const d of v.defs) if (d.id && d.id.start != null) ctx.report(d.id, m(`Do not use "${v.name}" as a name; it shadows the built-in.`, `"${v.name}"를 이름으로 쓰지 마세요. 내장 값을 가립니다.`));
    }
  }
});

rule('delete-variable', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S3001', tags: ['suspicious'],
  name: ['"delete" should be used only with object properties', '"delete"는 객체 속성에만 써야 합니다'],
  why: ['delete on a variable has no effect (or is a syntax error in strict mode).', '변수에 delete를 쓰면 효과가 없습니다 (strict 모드에서는 문법 오류).'],
  fix: ['Assign undefined or null to the variable instead.', '대신 변수에 undefined나 null을 대입하세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('UnaryExpression')) {
    if (n.operator === 'delete' && unwrapTS(n.argument).type === 'Identifier') ctx.report(n, m(`Remove this "delete" of variable "${ctx.text(n.argument)}".`, `변수 "${ctx.text(n.argument)}"에 쓴 "delete"를 지우세요.`));
  }
});

const ARRAY_RETURNING = new Set(['split', 'map', 'filter', 'slice', 'concat', 'flat', 'flatMap', 'from', 'of', 'keys', 'values', 'entries', 'toSorted', 'toReversed', 'fill']);
function isArrayInit(n) {
  n = unwrapTS(n);
  if (!n) return false;
  if (n.type === 'ArrayExpression') return true;
  if ((n.type === 'NewExpression' || n.type === 'CallExpression') && unwrapTS(n.callee).type === 'Identifier' && unwrapTS(n.callee).name === 'Array') return true;
  if (n.type === 'CallExpression') {
    const name = dottedName(n.callee);
    if (name && /^(Array\.(from|of)|Object\.(keys|values|entries))$/.test(name)) return true;
    const p = W.calleeProp(n);
    if (p && ARRAY_RETURNING.has(p) && unwrapTS(n.callee).type === 'MemberExpression' && !/^(Object|Array)$/.test(dottedName(unwrapTS(n.callee).object) || '')) return p !== 'keys' && p !== 'values' && p !== 'entries' && p !== 'from' && p !== 'of';
  }
  return false;
}

function isArrayVar(ctx, id) {
  const v = ctx.varOf(id);
  if (!v || !v.defs.length) return false;
  const d = v.defs[0];
  if (d.id && d.id.typeAnnotation) {
    const t = d.id.typeAnnotation.typeAnnotation;
    if (t.type === 'TSArrayType' || (t.type === 'TSTypeReference' && t.typeName.type === 'Identifier' && (t.typeName.name === 'Array' || t.typeName.name === 'ReadonlyArray'))) return true;
  }
  return d.node && d.node.type === 'VariableDeclarator' && d.node.id === d.id && isArrayInit(d.node.init) && v.refs.filter((r) => r.write && !r.init).every((r) => r.writeExpr && isArrayInit(r.writeExpr));
}

rule('array-delete', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S2870', tags: ['suspicious'],
  name: ['"delete" should not be used on arrays', '배열에 "delete"를 쓰면 안 됩니다'],
  why: ['delete leaves a hole: the length does not change and the slot reads as undefined.', 'delete는 빈 칸을 남깁니다. 길이가 바뀌지 않고 그 칸은 undefined로 읽힙니다.'],
  fix: ['Use splice(index, 1) to remove the element.', 'splice(index, 1)로 요소를 지우세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('UnaryExpression')) {
    if (n.operator !== 'delete') continue;
    const a = unwrapTS(n.argument);
    if (a.type !== 'MemberExpression' || !a.computed) continue;
    if (W.isStringLike(a.property)) continue;
    const o = unwrapTS(a.object);
    if (o.type === 'Identifier' && isArrayVar(ctx, o)) ctx.report(n, m(`Use "${o.name}.splice()" instead of "delete" to remove an array element.`, `배열 요소를 지울 때는 "delete" 대신 "${o.name}.splice()"를 쓰세요.`));
  }
});

rule('in-on-primitive', {
  t: 'B', s: 'CR', debt: 5, sonar: 'S3785', tags: ['suspicious'],
  name: ['"in" should not be used with primitive types', '"in"을 원시 타입에 쓰면 안 됩니다'],
  why: ['The right operand of "in" must be an object; a string, number or boolean throws a TypeError.', '"in"의 오른쪽은 객체여야 합니다. 문자열, 숫자, 불리언이면 TypeError가 납니다.'],
  fix: ['Use includes() for strings, or test against an object.', '문자열은 includes()를 쓰거나 객체에 대해 검사하세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('BinaryExpression')) {
    if (n.operator !== 'in') continue;
    const r = unwrapTS(n.right);
    if ((r.type === 'Literal' && !r.regex) || r.type === 'TemplateLiteral' || (r.type === 'UnaryExpression' && r.operator !== 'delete')) ctx.report(n, m('The right operand of "in" is a primitive value; this throws a TypeError.', '"in"의 오른쪽이 원시 값이라 TypeError가 납니다.'));
  }
});

rule('useless-increment', {
  t: 'B', s: 'MA', debt: 2, sonar: 'S2123', tags: ['suspicious'],
  name: ['Values should not be uselessly incremented', '값을 쓸모없이 증가시키면 안 됩니다'],
  why: ['"i = i++" assigns the old value back, so the increment is lost.', '"i = i++"는 이전 값을 다시 대입해 증가가 사라집니다.'],
  fix: ['Use "i++" or "i = i + 1".', '"i++"나 "i = i + 1"을 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('AssignmentExpression')) {
    const r = unwrapTS(n.right);
    if (n.operator === '=' && r.type === 'UpdateExpression' && !r.prefix && equal(r.argument, n.left)) ctx.report(n, m(`Remove this increment or correct the code not to waste it: "${ctx.text(n)}".`, `증가가 사라집니다. "${ctx.text(n)}"를 고치세요.`));
  }
});

rule('inverted-assignment', {
  t: 'B', s: 'MA', debt: 2, sonar: 'S2757', tags: ['suspicious'],
  name: ['Non-existent operators like "=+" should not be used', '"=+" 같은 존재하지 않는 연산자를 쓰면 안 됩니다'],
  why: ['"x =+ y" is parsed as "x = +y", not "x += y", which is almost always a typo.', '"x =+ y"는 "x += y"가 아니라 "x = +y"로 해석되며 거의 항상 오타입니다.'],
  fix: ['Write "+=", "-=" or "!=" as intended, or put a space after "=".', '의도에 맞게 "+=", "-=", "!="를 쓰거나 "=" 뒤에 공백을 넣으세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('AssignmentExpression')) {
    if (n.operator !== '=') continue;
    const r = n.right;
    if (r.type !== 'UnaryExpression' || !['+', '-', '!'].includes(r.operator) || r.parenthesized) continue;
    const eq = ctx.src.lastIndexOf('=', r.start);
    if (eq < n.left.end || r.start !== eq + 1) continue;
    const before = ctx.src[eq - 1];
    const after = ctx.src[r.start + 1];
    if (/\s/.test(before) && /\s/.test(after || '')) ctx.report(n, m(`Was "${r.operator}=" intended? "=${r.operator}" assigns a ${r.operator === '!' ? 'negated' : 'signed'} value.`, `"${r.operator}="를 의도했나요? "=${r.operator}"는 ${r.operator === '!' ? '부정한' : '부호를 붙인'} 값을 대입합니다.`));
  }
});

rule('new-non-constructor', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S2999', tags: ['suspicious'],
  name: ['"new" should only be used with constructor functions', '"new"는 생성자 함수에만 써야 합니다'],
  why: ['Arrow functions, async functions and generators cannot be constructed; "new" throws a TypeError.', '화살표 함수, async 함수, 제너레이터는 생성할 수 없어 "new"를 쓰면 TypeError가 납니다.'],
  fix: ['Call the function without "new", or turn it into a class.', '"new" 없이 호출하거나 클래스로 바꾸세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('NewExpression')) {
    const fn = localFunction(ctx, n.callee);
    if (!fn) continue;
    if (fn.type === 'ArrowFunctionExpression' || fn.async || fn.generator) ctx.report(n, m(`"${ctx.text(n.callee)}" is not a constructor; remove "new".`, `"${ctx.text(n.callee)}"는 생성자가 아닙니다. "new"를 지우세요.`));
  }
});

function returnsNothing(fn) {
  if (!fn.body || fn.body.type !== 'BlockStatement') return false;
  if (fn.async || fn.generator) return false;
  if (!fn.body.body.length) return false;
  if (fn.returnType) {
    const t = fn.returnType.typeAnnotation;
    if (t.type !== 'TSVoidKeyword' && t.type !== 'TSUndefinedKeyword') return false;
  }
  if (ownReturns(fn).some((r) => r.argument)) return false;
  // functions that only throw are handled elsewhere
  if (U.contains(fn.body, (n) => n.type === 'ThrowStatement', false) && !ownReturns(fn).length) return false;
  return true;
}

rule('void-result-used', {
  t: 'B', s: 'MA', debt: 10, sonar: 'S3699', tags: ['suspicious'],
  name: ['The output of functions that don\'t return anything should not be used', '아무것도 돌려주지 않는 함수의 결과를 쓰면 안 됩니다'],
  why: ['The function never returns a value, so the result is always undefined.', '함수가 값을 돌려주지 않아 결과는 항상 undefined입니다.'],
  fix: ['Return a value from the function, or stop using its result.', '함수에서 값을 돌려주거나 결과를 쓰지 마세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const fn = localFunction(ctx, call.callee);
    if (!fn || !returnsNothing(fn)) continue;
    const p = call.parent;
    if (!p) continue;
    if (p.type === 'ReturnStatement' || p.type === 'ArrowFunctionExpression') continue;
    if (!U.isValueUsed(call)) continue;
    if (p.type === 'LogicalExpression' || p.type === 'ConditionalExpression' || p.type === 'SequenceExpression') continue;
    if (p.type === 'JSXExpressionContainer') continue;
    ctx.report(call, m(`Remove this use of the output from "${ctx.text(call.callee)}"; "${ctx.text(call.callee)}" doesn't return anything.`, `"${ctx.text(call.callee)}"는 아무것도 돌려주지 않으니 그 결과를 쓰지 마세요.`));
  }
});

rule('too-many-arguments', {
  t: 'B', s: 'CR', debt: 10, sonar: 'S930', tags: ['suspicious'],
  name: ['Function calls should not pass extra arguments', '함수 호출에 여분의 인자를 넘기면 안 됩니다'],
  why: ['The function declares fewer parameters than it is called with and never reads "arguments", so the extra values are silently ignored.', '함수가 받는 매개변수보다 많은 인자를 넘기고 "arguments"도 읽지 않아 여분의 값이 조용히 무시됩니다.'],
  fix: ['Remove the extra arguments or add the missing parameters.', '여분의 인자를 지우거나 빠진 매개변수를 추가하세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const fn = localFunction(ctx, call.callee);
    if (!fn) continue;
    const v = ctx.varOf(unwrapTS(call.callee));
    if (v && v.defs.some((d) => d.overload)) continue;
    if (fn.params.some((p) => p.type === 'RestElement')) continue;
    if (call.arguments.some((a) => a.type === 'SpreadElement')) continue;
    const ps = fn.params.filter((p) => !(p.type === 'Identifier' && p.name === 'this'));
    if (call.arguments.length <= ps.length) continue;
    if (fn.type !== 'ArrowFunctionExpression' && U.contains(fn.body, (n) => n.type === 'Identifier' && n.name === 'arguments', false)) continue;
    const decl = ctx.line(fn);
    ctx.report(call, m(`This function expects ${ps.length} argument${ps.length === 1 ? '' : 's'}, but ${call.arguments.length} were provided (declared on line ${decl}).`, `이 함수는 인자 ${ps.length}개를 받지만 ${call.arguments.length}개를 넘깁니다 (${decl}번 줄에 선언).`));
  }
});

function counterStep(update, name) {
  const u = unwrapTS(update);
  if (!u) return 0;
  if (u.type === 'UpdateExpression' && u.argument.type === 'Identifier' && u.argument.name === name) return u.operator === '++' ? 1 : -1;
  if (u.type === 'AssignmentExpression' && u.left.type === 'Identifier' && u.left.name === name) {
    const v = staticValue(u.right);
    if (u.operator === '+=' && v && typeof v.value === 'number') return Math.sign(v.value);
    if (u.operator === '-=' && v && typeof v.value === 'number') return -Math.sign(v.value);
  }
  return 0;
}

rule('for-direction', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S2251', cwe: 'CWE-835', tags: ['suspicious'],
  name: ['A "for" loop update clause should move the counter in the right direction', '"for" 반복의 증감식은 카운터를 올바른 방향으로 움직여야 합니다'],
  why: ['The counter moves away from the stop condition, so the loop either never runs or never ends.', '카운터가 종료 조건과 반대로 움직여 반복이 실행되지 않거나 끝나지 않습니다.'],
  fix: ['Flip the update (++ / --) or the comparison.', '증감(++ / --)이나 비교를 뒤집으세요.'],
}, (ctx) => {
  for (const f of ctx.nodes('ForStatement')) {
    const t = f.test && unwrapTS(f.test);
    if (!t || t.type !== 'BinaryExpression' || !f.update) continue;
    let name = null;
    let dir = 0;
    if (t.left.type === 'Identifier' && /^[<>]=?$/.test(t.operator)) { name = t.left.name; dir = t.operator[0] === '<' ? 1 : -1; } else if (t.right.type === 'Identifier' && /^[<>]=?$/.test(t.operator)) { name = t.right.name; dir = t.operator[0] === '<' ? -1 : 1; }
    if (!name) continue;
    const step = counterStep(f.update, name);
    if (step && step !== dir) ctx.report(f.update, m(`"${name}" is updated in the wrong direction for the condition "${ctx.text(t)}".`, `"${name}"가 조건 "${ctx.text(t)}"와 반대 방향으로 바뀝니다.`));
  }
});

function loopExits(loop) {
  // break targeting this loop, return, throw, yield/await (externally driven), process.exit
  let exits = false;
  const visit = (n, depth, labels) => {
    if (exits || !n || typeof n !== 'object') return;
    if (isFunction(n) && n !== loop) return;
    switch (n.type) {
      case 'ReturnStatement': case 'ThrowStatement': case 'YieldExpression': case 'AwaitExpression': exits = true; return;
      case 'BreakStatement':
        if (n.label ? labels.has(n.label.name) : depth === 0) exits = true;
        return;
      case 'CallExpression': {
        const name = dottedName(n.callee);
        if (name === 'process.exit' || name === 'app.quit' || name === 'app.exit') { exits = true; return; }
        break;
      }
      default: break;
    }
    const nested = n !== loop && (/^(For|While|DoWhile|ForIn|ForOf)Statement$/.test(n.type) || n.type === 'SwitchStatement');
    for (const c of W.children(n)) visit(c, depth + (nested ? 1 : 0), labels);
  };
  const labels = new Set();
  let p = loop.parent;
  while (p && p.type === 'LabeledStatement') { labels.add(p.label.name); p = p.parent; }
  visit(loop.body, 0, labels);
  return exits;
}

rule('infinite-loop', {
  t: 'B', s: 'BL', debt: 10, sonar: 'S2189', cwe: 'CWE-835', tags: ['suspicious'],
  name: ['Loops should not be infinite', '반복문이 무한이면 안 됩니다'],
  why: ['Nothing inside the loop can make the condition false or leave the loop, so it never terminates.', '반복 안에서 조건을 거짓으로 만들거나 빠져나갈 방법이 없어 끝나지 않습니다.'],
  fix: ['Update the loop variable, or add a break / return.', '반복 변수를 바꾸거나 break / return을 넣으세요.'],
}, (ctx) => {
  for (const loop of ctx.nodesOf('WhileStatement', 'DoWhileStatement', 'ForStatement')) {
    const test = loop.test;
    if (loopExits(loop)) continue;
    if (!test) { ctx.report(loop, m('Add an end condition to this loop.', '이 반복에 종료 조건을 넣으세요.')); continue; }
    const sv = staticValue(test);
    if (sv) {
      if (sv.value) ctx.report(loop, m('Add an end condition to this loop; nothing inside it breaks out.', '이 반복에 종료 조건을 넣으세요. 안에서 빠져나가는 곳이 없습니다.'));
      continue;
    }
    // condition on local variables that the loop never changes
    let pure = true;
    const vars = [];
    W.walk(test, (n) => {
      if (!pure) return false;
      if (n.type === 'Identifier') {
        const v = n._ref && n._ref.resolved;
        if (!v || v.writtenInClosure || !['let', 'var', 'const', 'param'].includes(v.kind)) { pure = false; return false; }
        vars.push(v);
        return undefined;
      }
      if (n.type === 'Literal' || n.type === 'BinaryExpression' || n.type === 'LogicalExpression' || (n.type === 'UnaryExpression' && n.operator === '!')) return undefined;
      pure = false;
      return false;
    });
    if (!pure || !vars.length) continue;
    const inLoop = (node) => node.start >= loop.start && node.end <= loop.end;
    const written = vars.some((v) => v.refs.some((r) => r.write && inLoop(r.id)) || v.kind === 'const' && false);
    if (written) continue;
    if (vars.every((v) => v.kind === 'const')) continue;
    ctx.report(loop, m(`"${vars[0].name}" is not modified in this loop, so its condition never changes.`, `"${vars[0].name}"가 이 반복 안에서 바뀌지 않아 조건이 변하지 않습니다.`));
  }
});

rule('reduce-initial-value', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S6959', tags: ['suspicious'],
  name: ['"Array.reduce()" calls should include an initial value', '"Array.reduce()" 호출에는 초기값을 넣어야 합니다'],
  why: ['Without an initial value reduce() throws a TypeError on an empty array and treats the first element specially.', '초기값이 없으면 reduce()는 빈 배열에서 TypeError를 내고 첫 요소를 특별하게 다룹니다.'],
  fix: ['Pass the initial accumulator as the second argument.', '두 번째 인자로 초기 누적값을 넘기세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    if (c.type !== 'MemberExpression') continue;
    const p = propName(c);
    if ((p !== 'reduce' && p !== 'reduceRight') || call.arguments.length !== 1 || !isFunction(call.arguments[0])) continue;
    const o = unwrapTS(c.object);
    if (o.type === 'ArrayExpression' && o.elements.length && !o.elements.some((e) => !e || e.type === 'SpreadElement')) continue;
    ctx.report(call, m(`Add an initial value to this "${p}()" call.`, `이 "${p}()" 호출에 초기값을 넣으세요.`));
  }
});

function numericArray(ctx, n) {
  n = unwrapTS(n);
  if (!n) return false;
  if (n.type === 'ArrayExpression') return n.elements.length > 0 && n.elements.every((e) => e && (typeof (staticValue(e) || {}).value === 'number'));
  if (n.type === 'CallExpression' && W.calleeProp(n) === 'map' && n.arguments[0] && n.arguments[0].type === 'Identifier' && ['Number', 'parseFloat', 'parseInt', 'Math.round'].includes(n.arguments[0].name)) return true;
  if (n.type === 'Identifier') {
    const v = ctx.varOf(n);
    if (!v || v.defs.length !== 1 || v.refs.some((r) => r.write && !r.init)) return false;
    const d = v.defs[0];
    if (d.id && d.id.typeAnnotation) {
      const t = d.id.typeAnnotation.typeAnnotation;
      if (t.type === 'TSArrayType' && t.elementType.type === 'TSNumberKeyword') return true;
    }
    return d.node && d.node.type === 'VariableDeclarator' && d.node.id === d.id && numericArray(ctx, d.node.init);
  }
  return false;
}

rule('sort-without-compare', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S2871', tags: ['suspicious'],
  name: ['A compare function should be provided when sorting numbers', '숫자를 정렬할 때는 비교 함수를 넘겨야 합니다'],
  why: ['sort() without a compare function converts elements to strings, so [10, 9, 1] sorts as [1, 10, 9].', '비교 함수 없는 sort()는 요소를 문자열로 바꿔 [10, 9, 1]이 [1, 10, 9]로 정렬됩니다.'],
  fix: ['Pass a compare function such as (a, b) => a - b.', '(a, b) => a - b 같은 비교 함수를 넘기세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    if (c.type !== 'MemberExpression' || call.arguments.length) continue;
    const p = propName(c);
    if (p !== 'sort' && p !== 'toSorted') continue;
    if (numericArray(ctx, c.object)) ctx.report(call, m(`Provide a compare function to "${p}()"; numbers are otherwise sorted as strings.`, `"${p}()"에 비교 함수를 넘기세요. 아니면 숫자가 문자열로 정렬됩니다.`));
  }
});

const PURE_METHODS = new Set(['trim', 'trimStart', 'trimEnd', 'toUpperCase', 'toLowerCase', 'toLocaleUpperCase', 'toLocaleLowerCase', 'padStart', 'padEnd', 'substring', 'substr', 'charAt', 'charCodeAt', 'codePointAt', 'normalize', 'repeat', 'startsWith', 'endsWith', 'localeCompare', 'toFixed', 'toPrecision', 'toExponential', 'concat', 'slice', 'toSorted', 'toReversed', 'toSpliced', 'flat', 'indexOf', 'lastIndexOf', 'includes', 'join', 'at']);
const PURE_GLOBALS = new Set(['parseInt', 'parseFloat', 'isNaN', 'isFinite', 'String', 'Number', 'Boolean', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI']);

rule('ignored-return', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S2201', tags: ['suspicious'],
  name: ['Return values from functions without side effects should not be ignored', '부작용 없는 함수의 반환값을 버리면 안 됩니다'],
  why: ['These functions only compute a new value; calling them without using the result does nothing.', '이 함수들은 새 값을 계산할 뿐이라 결과를 쓰지 않으면 아무 일도 하지 않습니다.'],
  fix: ['Use the returned value, e.g. s = s.trim().', '반환값을 쓰세요. 예: s = s.trim()'],
}, (ctx) => {
  for (const st of ctx.nodes('ExpressionStatement')) {
    const call = unwrapTS(st.expression);
    if (call.type !== 'CallExpression' || call.optional) continue;
    const c = unwrapTS(call.callee);
    let name = null;
    if (c.type === 'MemberExpression') {
      const p = propName(c);
      const o = unwrapTS(c.object);
      if (o.type === 'ThisExpression' || o.type === 'Super') continue;
      const dn = dottedName(c);
      if (dn && /^Math\.\w+$/.test(dn) && isUnresolved(ctx, o)) name = dn;
      else if (dn && /^(Number\.(isNaN|isFinite|isInteger|parseFloat|parseInt)|Object\.(keys|values|entries)|Array\.(isArray|from|of))$/.test(dn) && isUnresolved(ctx, o)) name = dn;
      else if (p && PURE_METHODS.has(p) && !c.computed) {
        // only when the receiver is clearly a string / array value
        if (o.type === 'Literal' || o.type === 'TemplateLiteral' || o.type === 'ArrayExpression' || (o.type === 'Identifier' && (isStringVar(ctx, o) || isArrayVar(ctx, o)))) name = `${ctx.text(o).slice(0, 30)}.${p}`;
        else if (['trim', 'toUpperCase', 'toLowerCase', 'padStart', 'padEnd', 'trimStart', 'trimEnd', 'toFixed', 'toLocaleUpperCase', 'toLocaleLowerCase', 'normalize', 'substring', 'charAt', 'toSorted', 'toReversed'].includes(p)) name = p;
      }
    } else if (c.type === 'Identifier' && PURE_GLOBALS.has(c.name) && isUnresolved(ctx, c)) name = c.name;
    if (name) ctx.report(call, m(`The return value of "${name}" is not used; this call has no effect.`, `"${name}"의 반환값을 쓰지 않아 이 호출은 효과가 없습니다.`));
  }
});

function isStringVar(ctx, id) {
  const v = ctx.varOf(id);
  if (!v || !v.defs.length) return false;
  const d = v.defs[0];
  if (d.id && d.id.typeAnnotation && d.id.typeAnnotation.typeAnnotation.type === 'TSStringKeyword') return true;
  return !!(d.node && d.node.type === 'VariableDeclarator' && d.node.id === d.id && W.isStringLike(d.node.init));
}

function isErrorCtor(name) {
  return /(^|\.)([A-Z]\w*)?(Error|Exception)$/.test(name || '');
}

rule('error-not-thrown', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S3984', tags: ['error-handling'],
  name: ['Errors should not be created without being thrown', '오류 객체를 만들고 던지지 않으면 안 됩니다'],
  why: ['The error object is created and immediately discarded; the "throw" keyword was probably forgotten.', '오류 객체를 만들고 바로 버립니다. "throw"를 빠뜨렸을 것입니다.'],
  fix: ['Add "throw" in front of "new".', '"new" 앞에 "throw"를 넣으세요.'],
}, (ctx) => {
  for (const st of ctx.nodes('ExpressionStatement')) {
    const e = unwrapTS(st.expression);
    if (e.type === 'NewExpression' && isErrorCtor(dottedName(e.callee))) ctx.report(e, m(`Throw this error or remove this useless statement: "new ${ctx.text(e.callee)}(...)".`, `이 오류를 던지거나 쓸모없는 문장 "new ${ctx.text(e.callee)}(...)"를 지우세요.`));
  }
});

const PURE_CTORS = new Set(['Object', 'Array', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp', 'String', 'Number', 'Boolean', 'URL', 'URLSearchParams', 'Blob', 'FormData', 'Headers', 'TextEncoder', 'TextDecoder', 'ArrayBuffer', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array', 'DataView', 'Intl.NumberFormat', 'Intl.DateTimeFormat', 'Intl.Collator', 'AbortController', 'Event', 'CustomEvent']);

rule('discarded-new', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S1848', tags: ['suspicious'],
  name: ['Objects should not be created to be dropped immediately without being used', '사용하지 않을 객체를 만들고 바로 버리면 안 됩니다'],
  why: ['The constructor has no useful side effect here, so creating and discarding the object does nothing.', '이 생성자는 쓸모 있는 부작용이 없어 객체를 만들고 버리는 것은 아무 일도 하지 않습니다.'],
  fix: ['Assign the new object, or remove the statement.', '새 객체를 대입하거나 문장을 지우세요.'],
}, (ctx) => {
  for (const st of ctx.nodes('ExpressionStatement')) {
    const e = unwrapTS(st.expression);
    if (e.type !== 'NewExpression') continue;
    const name = dottedName(e.callee);
    if (!name || isErrorCtor(name)) continue;
    let pure = false;
    const callee = unwrapTS(e.callee);
    if (PURE_CTORS.has(name) && (callee.type !== 'Identifier' || isUnresolved(ctx, callee))) pure = true;
    else if (callee.type === 'Identifier') {
      const v = ctx.varOf(callee);
      const d = v && v.defs.length === 1 ? v.defs[0] : null;
      if (d && d.kind === 'class' && d.node.type === 'ClassDeclaration' && !d.node.superClass) {
        const ctor = d.node.body.body.find((x) => x.type === 'MethodDefinition' && x.kind === 'constructor');
        const fields = d.node.body.body.filter((x) => x.type === 'PropertyDefinition' && x.value);
        const sideFree = (node) => !node || !U.contains(node, (x) => x.type === 'CallExpression' || x.type === 'NewExpression' || x.type === 'AwaitExpression' || x.type === 'TaggedTemplateExpression' || (x.type === 'AssignmentExpression' && !(x.left.type === 'MemberExpression' && x.left.object.type === 'ThisExpression')), true);
        if ((!ctor || sideFree(ctor.value.body)) && fields.every((f) => sideFree(f.value))) pure = true;
      }
    }
    if (pure) ctx.report(e, m(`Either remove this useless object instantiation of "${name}" or use it.`, `"${name}"의 쓸모없는 객체 생성을 지우거나 그 객체를 쓰세요.`));
  }
});

rule('template-placeholder-in-string', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S3786', tags: ['suspicious'],
  name: ['Template literal placeholder syntax should not be used in regular strings', '일반 문자열에 템플릿 리터럴 자리표시자 문법을 쓰면 안 됩니다'],
  why: ['"${name}" inside quotes is printed literally; only backtick strings interpolate.', '따옴표 안의 "${name}"는 그대로 출력됩니다. 백틱 문자열만 값을 끼워 넣습니다.'],
  fix: ['Use a template literal (backticks).', '템플릿 리터럴(백틱)을 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('Literal')) {
    if (typeof n.value !== 'string' || !n.raw || (n.raw[0] !== '"' && n.raw[0] !== "'")) continue;
    const mm = /\$\{([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\}/.exec(n.value);
    if (!mm) continue;
    if (/^[A-Z0-9_]+$/.test(mm[1])) continue;
    const p = n.parent;
    if (!p) continue;
    if (p.type === 'JSXAttribute' || p.type === 'ImportDeclaration' || p.type === 'Property' && p.key === n) continue;
    if (p.type === 'CallExpression' || p.type === 'NewExpression') {
      const cp = W.calleeProp(p);
      if (cp && /^(replace|replaceAll|split|includes|indexOf|startsWith|endsWith|RegExp|t|i18n|translate|format|formatMessage|\$t|template|interpolate|compile|render|sprintf)$/.test(cp)) continue;
    }
    // the variable must exist for this to be a real mistake
    const root = mm[1].split('.')[0];
    let scope = null;
    let q = n;
    while (q && !scope) { scope = ctx.scope.byNode.get(q); q = q.parent; }
    let found = false;
    for (let s = scope; s && !found; s = s.parent) if (s.vars.has(root)) found = true;
    if (!found && root !== 'this') continue;
    ctx.report(n, m(`Replace the quotes with backticks: "${mm[0]}" is not interpolated in a regular string.`, `따옴표를 백틱으로 바꾸세요. 일반 문자열에서 "${mm[0]}"는 값이 들어가지 않습니다.`));
  }
});

rule('empty-destructuring', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S3799', tags: ['suspicious'],
  name: ['Destructuring patterns should not be empty', '구조 분해 패턴이 비어 있으면 안 됩니다'],
  why: ['An empty pattern binds nothing; it is usually a mistyped default value ({a: {}} instead of {a = {}}).', '빈 패턴은 아무것도 바인딩하지 않으며 보통 기본값을 잘못 쓴 것입니다 ({a = {}} 대신 {a: {}}).'],
  fix: ['Add the bindings you need, or remove the pattern.', '필요한 바인딩을 넣거나 패턴을 지우세요.'],
}, (ctx) => {
  for (const p of ctx.nodesOf('ObjectPattern', 'ArrayPattern')) {
    const empty = p.type === 'ObjectPattern' ? p.properties.length === 0 : p.elements.length === 0;
    if (!empty) continue;
    if (p.typeAnnotation) continue;
    ctx.report(p, m('Change this empty destructuring pattern; it binds nothing.', '이 빈 구조 분해 패턴을 고치세요. 아무것도 바인딩하지 않습니다.'));
  }
});

rule('case-declaration', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S6836', tags: ['suspicious'],
  name: ['Lexical declarations should not appear directly in "case" clauses', 'case 절에 바로 블록 범위 선언을 쓰면 안 됩니다'],
  why: ['let, const, class and function declarations in a case are visible in the whole switch but only initialized when that case runs.', 'case 안의 let, const, class, function 선언은 switch 전체에서 보이지만 그 case가 실행될 때만 초기화됩니다.'],
  fix: ['Wrap the case body in braces.', 'case 본문을 중괄호로 감싸세요.'],
}, (ctx) => {
  for (const c of ctx.nodes('SwitchCase')) {
    for (const s of c.consequent) {
      if ((s.type === 'VariableDeclaration' && s.kind !== 'var') || s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') {
        ctx.report(s, m('Wrap this case body in a block to scope the declaration.', '선언 범위를 정하도록 이 case 본문을 블록으로 감싸세요.'));
      }
    }
  }
});

rule('case-logical-or', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S3616', tags: ['suspicious'],
  name: ['Comma and logical OR operators should not be used in switch cases', 'switch case에 쉼표나 논리 OR 연산자를 쓰면 안 됩니다'],
  why: ['"case a || b:" evaluates to a single value (a or b), it does not match either one.', '"case a || b:"는 a나 b 중 하나의 값으로 계산될 뿐 둘 다와 일치하지 않습니다.'],
  fix: ['Write one case per value: "case a: case b:".', '값마다 case를 쓰세요: "case a: case b:".'],
}, (ctx) => {
  for (const sw of ctx.nodes('SwitchStatement')) {
    const d = staticValue(sw.discriminant);
    if (d && d.value === true) continue;
    for (const c of sw.cases) {
      const t = c.test && unwrapTS(c.test);
      if (t && ((t.type === 'LogicalExpression' && t.operator !== '??') || t.type === 'SequenceExpression')) ctx.report(c, m('Explicitly specify the separate cases that should match this branch.', '이 분기에 일치할 case를 각각 명시하세요.'));
    }
  }
});

rule('switch-label', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S1219', tags: ['suspicious'],
  name: ['"switch" statements should not contain non-case labels', 'switch 문에 case가 아닌 레이블을 쓰면 안 됩니다'],
  why: ['A label inside a switch looks like a case but is not one; it is usually a missing "case" keyword.', 'switch 안의 레이블은 case처럼 보이지만 아닙니다. 보통 "case"를 빠뜨린 것입니다.'],
  fix: ['Add the missing "case" keyword or move the label.', '빠진 "case"를 넣거나 레이블을 옮기세요.'],
}, (ctx) => {
  for (const c of ctx.nodes('SwitchCase')) {
    for (const s of c.consequent) if (s.type === 'LabeledStatement') ctx.report(s.label, m(`Remove the label "${s.label.name}" or add "case" in front of it.`, `레이블 "${s.label.name}"를 지우거나 앞에 "case"를 넣으세요.`));
  }
});

function writeKey(st) {
  if (st.type !== 'ExpressionStatement') return null;
  const e = unwrapTS(st.expression);
  if (e.type === 'AssignmentExpression' && e.operator === '=' && e.left.type === 'MemberExpression') {
    const l = e.left;
    const obj = dottedName(l.object);
    if (!obj) return null;
    let key;
    if (!l.computed) key = propName(l);
    else { const v = staticValue(l.property); key = v ? `#${String(v.value)}` : (l.property.type === 'Identifier' ? `@${l.property.name}` : null); }
    if (key == null) return null;
    return { obj, key, rhs: e.right, node: e };
  }
  if (e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && propName(e.callee) === 'set' && e.arguments.length === 2) {
    const obj = dottedName(e.callee.object);
    const v = staticValue(e.arguments[0]);
    const key = v ? `#${String(v.value)}` : (e.arguments[0].type === 'Identifier' ? `@${e.arguments[0].name}` : null);
    if (!obj || key == null) return null;
    return { obj: `${obj}.set()`, key, rhs: e.arguments[1], node: e };
  }
  return null;
}

rule('collection-overwrite', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S4143', tags: ['suspicious'],
  name: ['Map values and array elements should not be overwritten immediately', 'Map 값과 배열 요소를 곧바로 덮어쓰면 안 됩니다'],
  why: ['The second write to the same key replaces the first one before it can be used.', '같은 키에 두 번째로 쓰면 첫 값이 쓰이기 전에 대체됩니다.'],
  fix: ['Fix the key of one of the writes, or remove the first one.', '한쪽 쓰기의 키를 고치거나 첫 번째 쓰기를 지우세요.'],
}, (ctx) => {
  for (const list of [...ctx.nodes('BlockStatement').map((b) => b.body), ctx.ast.body, ...ctx.nodes('SwitchCase').map((c) => c.consequent)]) {
    for (let i = 1; i < list.length; i++) {
      const a = writeKey(list[i - 1]);
      const b = writeKey(list[i]);
      if (!a || !b || a.obj !== b.obj || a.key !== b.key) continue;
      const target = a.node.type === 'AssignmentExpression' ? a.node.left : null;
      if (target && U.contains(b.rhs, (x) => equal(x, target), true)) continue;
      if (U.contains(b.rhs, (x) => x.type === 'Identifier' && a.obj.split('.')[0] === x.name, true)) continue;
      ctx.report(b.node, m(`Verify this is the key that was intended; it was already set on line ${ctx.line(a.node)}.`, `의도한 키인지 확인하세요. ${ctx.line(a.node)}번 줄에서 이미 설정했습니다.`));
    }
  }
});

rule('collection-size-compare', {
  t: 'B', s: 'MA', debt: 2, sonar: 'S3981', tags: ['suspicious'],
  name: ['Collection sizes and array length comparisons should make sense', '컬렉션 크기와 배열 길이 비교는 말이 되어야 합니다'],
  why: ['A length or size is never negative, so ">= 0" is always true and "< 0" always false.', '길이나 크기는 음수가 아니라 ">= 0"은 항상 참이고 "< 0"은 항상 거짓입니다.'],
  fix: ['Compare with "> 0" or "=== 0" as intended.', '의도에 맞게 "> 0"이나 "=== 0"과 비교하세요.'],
}, (ctx) => {
  const isSize = (x) => { x = unwrapTS(x); const p = x.type === 'MemberExpression' ? propName(x) : null; return p === 'length' || p === 'size'; };
  const isZero = (x) => { const v = staticValue(x); return v && v.value === 0; };
  for (const n of ctx.nodes('BinaryExpression')) {
    let bad = null;
    if (isSize(n.left) && isZero(n.right) && (n.operator === '>=' || n.operator === '<')) bad = n.operator === '>=';
    else if (isZero(n.left) && isSize(n.right) && (n.operator === '<=' || n.operator === '>')) bad = n.operator === '<=';
    if (bad !== null) ctx.report(n, m(`This comparison is always ${bad ? 'true' : 'false'}; a length or size is never negative.`, `길이나 크기는 음수가 아니어서 이 비교는 항상 ${bad ? '참' : '거짓'}입니다.`));
  }
});

rule('index-of-positive', {
  t: 'B', s: 'MA', debt: 2, sonar: 'S2692', tags: ['suspicious'],
  name: ['"indexOf" checks should not be for positive numbers', '"indexOf" 검사를 양수로 하면 안 됩니다'],
  why: ['indexOf returns 0 for a match at the first position, so "> 0" misses it.', 'indexOf는 첫 위치에서 일치하면 0을 돌려주므로 "> 0"은 그 경우를 놓칩니다.'],
  fix: ['Use ">= 0", "!== -1" or includes().', '">= 0", "!== -1" 또는 includes()를 쓰세요.'],
}, (ctx) => {
  const isIdx = (x) => { x = unwrapTS(x); return x.type === 'CallExpression' && (W.calleeProp(x) === 'indexOf' || W.calleeProp(x) === 'lastIndexOf') && x.arguments.length === 1; };
  const isZero = (x) => { const v = staticValue(x); return v && v.value === 0; };
  for (const n of ctx.nodes('BinaryExpression')) {
    if ((isIdx(n.left) && n.operator === '>' && isZero(n.right)) || (isZero(n.left) && n.operator === '<' && isIdx(n.right))) ctx.report(n, m('This check ignores the index 0; consider using ">= 0" or includes().', '이 검사는 인덱스 0을 무시합니다. ">= 0"이나 includes()를 쓰세요.'));
  }
});

rule('misleading-array-mutation', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S4043', tags: ['suspicious'],
  name: ['Array-mutating methods should not be used misleadingly', '배열을 바꾸는 메서드를 오해하게 쓰면 안 됩니다'],
  why: ['reverse() and sort() change the array in place and return the same array; assigning the result to another name suggests a copy that does not exist.', 'reverse()와 sort()는 배열 자체를 바꾸고 같은 배열을 돌려줍니다. 결과를 다른 이름에 대입하면 없는 복사본이 있는 것처럼 보입니다.'],
  fix: ['Copy first ([...a].reverse(), a.slice().sort()) or use toReversed() / toSorted().', '먼저 복사하거나([...a].reverse(), a.slice().sort()) toReversed() / toSorted()를 쓰세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    if (c.type !== 'MemberExpression') continue;
    const p = propName(c);
    if (p !== 'reverse' && p !== 'sort') continue;
    const o = unwrapTS(c.object);
    if (o.type !== 'Identifier' && o.type !== 'MemberExpression') continue;
    if (o.type === 'Identifier' && !isArrayVar(ctx, o)) continue;
    const parent = call.parent;
    let target = null;
    if (parent.type === 'VariableDeclarator' && parent.init === call && parent.id.type === 'Identifier') target = parent.id;
    else if (parent.type === 'AssignmentExpression' && parent.right === call) target = parent.left;
    if (!target || equal(unwrapTS(target), o)) continue;
    ctx.report(call, m(`Move this "${p}()" into a separate statement, or copy the array first; "${ctx.text(o)}" itself is modified.`, `이 "${p}()"를 별도 문장으로 옮기거나 먼저 배열을 복사하세요. "${ctx.text(o)}" 자체가 바뀝니다.`));
  }
});

// ---- collections that are never filled / never read
const MUTATORS = new Set(['push', 'unshift', 'splice', 'set', 'add', 'fill', 'copyWithin', 'pop', 'shift', 'delete', 'clear', 'sort', 'reverse']);
const FILLERS = new Set(['push', 'unshift', 'splice', 'set', 'add', 'fill', 'copyWithin']);

function emptyCollectionInit(n) {
  n = unwrapTS(n);
  if (!n) return false;
  if (n.type === 'ArrayExpression') return n.elements.length === 0;
  if (n.type === 'NewExpression') {
    const c = unwrapTS(n.callee);
    return c.type === 'Identifier' && ['Map', 'Set', 'Array', 'WeakMap', 'WeakSet'].includes(c.name) && n.arguments.length === 0;
  }
  return false;
}

function classifyCollection(v) {
  // returns { reads: [], writes: number, escapes: bool }
  const res = { reads: [], fills: 0, escapes: false };
  for (const r of v.refs) {
    if (r.init) continue;
    if (r.write) { res.escapes = true; continue; }
    if (r.type) continue;
    const id = r.id;
    const p = id.parent;
    if (p && p.type === 'MemberExpression' && p.object === id) {
      const name = propName(p);
      const gp = p.parent;
      if (gp && gp.type === 'CallExpression' && gp.callee === p) {
        if (FILLERS.has(name)) { res.fills++; continue; }
        if (MUTATORS.has(name)) continue;
        if (name === 'concat' || name === 'slice' || name === 'map' || name === 'filter') { res.reads.push(id); continue; }
        res.reads.push(id);
        continue;
      }
      if (gp && gp.type === 'AssignmentExpression' && gp.left === p) { res.fills++; continue; }
      if (gp && gp.type === 'UpdateExpression') { res.fills++; continue; }
      res.reads.push(id);
      continue;
    }
    if (p && (p.type === 'ForOfStatement' && p.right === id)) { res.reads.push(id); continue; }
    if (p && p.type === 'SpreadElement') { res.reads.push(id); res.escapes = true; continue; }
    res.escapes = true;
  }
  return res;
}

function localCollections(ctx) {
  if (ctx._colls) return ctx._colls;
  const out = [];
  for (const s of ctx.scope.scopes) {
    if (s.type === 'global' || s.type === 'module') continue;
    for (const v of s.vars.values()) {
      if (v.defs.length !== 1) continue;
      const d = v.defs[0];
      if ((d.kind !== 'const' && d.kind !== 'let') || !d.node || d.node.type !== 'VariableDeclarator' || d.node.id !== d.id) continue;
      if (!emptyCollectionInit(d.node.init)) continue;
      if (v.exported || v.captured && v.writtenInClosure) continue;
      out.push({ v, decl: d.node, info: classifyCollection(v) });
    }
  }
  ctx._colls = out;
  return out;
}

rule('empty-collection-read', {
  t: 'B', s: 'MI', debt: 5, sonar: 'S4158', tags: ['suspicious'],
  name: ['Empty collections should not be accessed or iterated', '빈 컬렉션에 접근하거나 반복하면 안 됩니다'],
  why: ['The collection is created empty and nothing ever adds to it, so every read finds nothing.', '컬렉션을 비어 있게 만들고 아무것도 추가하지 않아 모든 읽기가 아무것도 찾지 못합니다.'],
  fix: ['Fill the collection before reading it, or remove the dead code.', '읽기 전에 컬렉션을 채우거나 죽은 코드를 지우세요.'],
}, (ctx) => {
  for (const c of localCollections(ctx)) {
    if (c.info.escapes || c.info.fills || !c.info.reads.length) continue;
    ctx.report(c.info.reads[0], m(`Review this usage of "${c.v.name}" as it can only be empty here.`, `"${c.v.name}"는 여기서 항상 비어 있으니 이 사용을 검토하세요.`));
  }
});

rule('collection-never-read', {
  t: 'S', s: 'MA', debt: 5, sonar: 'S4030', tags: ['unused'],
  name: ['Collection contents should be used', '컬렉션의 내용은 쓰여야 합니다'],
  why: ['Elements are added but never read, so the collection and the work to fill it are useless.', '요소를 추가하지만 읽지 않아 컬렉션과 채우는 작업이 쓸모없습니다.'],
  fix: ['Use the collection, or remove it together with the code that fills it.', '컬렉션을 쓰거나 채우는 코드와 함께 지우세요.'],
}, (ctx) => {
  for (const c of localCollections(ctx)) {
    if (c.info.escapes || !c.info.fills || c.info.reads.length) continue;
    ctx.report(c.decl.id, m(`Either use this collection's contents or remove the collection "${c.v.name}".`, `컬렉션 "${c.v.name}"의 내용을 쓰거나 컬렉션을 지우세요.`));
  }
});

rule('constructor-super', {
  t: 'B', s: 'CR', debt: 5, sonar: 'S3854', tags: ['suspicious'],
  name: ['"super()" should be invoked appropriately', '"super()"는 알맞게 호출해야 합니다'],
  why: ['A derived constructor must call super() before using "this", and a base class constructor cannot call super().', '파생 클래스 생성자는 "this"를 쓰기 전에 super()를 호출해야 하고, 기본 클래스 생성자는 super()를 호출할 수 없습니다.'],
  fix: ['Call super(...) first in derived constructors; remove it from base classes.', '파생 생성자에서는 super(...)를 먼저 호출하고 기본 클래스에서는 지우세요.'],
}, (ctx) => {
  for (const cls of ctx.nodesOf('ClassDeclaration', 'ClassExpression')) {
    const ctor = cls.body.body.find((x) => x.type === 'MethodDefinition' && x.kind === 'constructor' && x.value.body);
    if (!ctor) continue;
    const body = ctor.value.body;
    const supers = U.findAll(body, (n) => n.type === 'CallExpression' && n.callee.type === 'Super', false).concat(
      U.findAll(body, (n) => n.type === 'ArrowFunctionExpression', false).flatMap((a) => U.findAll(a.body, (n) => n.type === 'CallExpression' && n.callee.type === 'Super', false)));
    const derived = !!cls.superClass && !W.isLiteral(cls.superClass, null);
    if (!derived) {
      for (const s of supers) ctx.report(s, m('Remove this "super()" call; the class does not extend another class.', '이 "super()" 호출을 지우세요. 이 클래스는 다른 클래스를 상속하지 않습니다.'));
      continue;
    }
    if (!supers.length) {
      if (U.contains(body, (n) => n.type === 'ReturnStatement' && n.argument, false) || U.contains(body, (n) => n.type === 'ThrowStatement', false)) continue;
      ctx.report(ctor.key, m('Add a "super()" call to this derived class constructor.', '이 파생 클래스 생성자에 "super()" 호출을 넣으세요.'));
      continue;
    }
    // `this` before the first top-level super()
    for (const st of body.body) {
      const hasSuper = U.contains(st, (n) => n.type === 'CallExpression' && n.callee.type === 'Super', false);
      const thisNode = U.findAll(st, (n) => n.type === 'ThisExpression' || (n.type === 'MemberExpression' && n.object.type === 'Super'), false)[0];
      if (thisNode && (!hasSuper || thisNode.start < U.findAll(st, (n) => n.type === 'CallExpression' && n.callee.type === 'Super', false)[0].start)) {
        ctx.report(thisNode, m('"this" is used before "super()" is called.', '"super()"를 호출하기 전에 "this"를 씁니다.'));
        break;
      }
      if (hasSuper) break;
    }
  }
});

rule('getter-setter-field', {
  t: 'B', s: 'CR', debt: 5, sonar: 'S4275', tags: ['suspicious'],
  name: ['Getters and setters should access the expected fields', 'getter와 setter는 예상한 필드에 접근해야 합니다'],
  why: ['The accessor named after one field reads or writes a different one, usually after a copy-paste.', '한 필드 이름의 접근자가 다른 필드를 읽거나 써서 보통 복사 실수입니다.'],
  fix: ['Access the matching backing field.', '이름이 맞는 저장 필드에 접근하세요.'],
}, (ctx) => {
  for (const body of ctx.nodes('ClassBody')) {
    const fields = new Set();
    for (const mbr of body.body) {
      if (mbr.type === 'PropertyDefinition') { const k = keyName(mbr.key, mbr.computed); if (k) fields.add(k); }
    }
    for (const a of U.findAll(body, (n) => n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.type === 'ThisExpression', true)) {
      const k = propName(a.left);
      if (k) fields.add(k);
    }
    for (const mbr of body.body) {
      if (mbr.type !== 'MethodDefinition' || (mbr.kind !== 'get' && mbr.kind !== 'set') || !mbr.value.body) continue;
      const name = keyName(mbr.key, mbr.computed);
      if (!name) continue;
      const backing = [`_${name}`, `#${name}`, `${name}_`, `__${name}`].filter((x) => fields.has(x));
      if (!backing.length) continue;
      const stmts = mbr.value.body.body;
      if (stmts.length !== 1) continue;
      let accessed = null;
      const s = stmts[0];
      if (mbr.kind === 'get' && s.type === 'ReturnStatement' && s.argument && unwrapTS(s.argument).type === 'MemberExpression' && unwrapTS(s.argument).object.type === 'ThisExpression') accessed = unwrapTS(s.argument);
      if (mbr.kind === 'set' && s.type === 'ExpressionStatement' && s.expression.type === 'AssignmentExpression' && s.expression.left.type === 'MemberExpression' && s.expression.left.object.type === 'ThisExpression') accessed = s.expression.left;
      if (!accessed) continue;
      const k = propName(accessed);
      if (!k || k === name || backing.includes(k)) continue;
      if (!/^(_|#)|_$/.test(k)) continue;
      ctx.report(accessed, m(`Refactor this ${mbr.kind}ter so that it actually refers to the field "${backing[0]}".`, `이 ${mbr.kind === 'get' ? 'getter' : 'setter'}가 실제로 필드 "${backing[0]}"를 가리키도록 고치세요.`));
    }
  }
});

function bodyOf(n) {
  switch (n.type) {
    case 'IfStatement': return n.alternate ? null : n.consequent;
    case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': case 'WhileStatement': return n.body;
    default: return null;
  }
}

rule('multiline-block-without-braces', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S2681', cwe: 'CWE-483', tags: ['suspicious'],
  name: ['Multiline blocks should be enclosed in curly braces', '여러 줄 블록은 중괄호로 감싸야 합니다'],
  why: ['The indentation suggests the next statement belongs to the if / loop, but without braces only the first statement is conditional.', '들여쓰기는 다음 문장이 if나 반복에 속하는 것처럼 보이지만 중괄호가 없어 첫 문장만 조건부입니다.'],
  fix: ['Add braces around the statements, or fix the indentation.', '문장들을 중괄호로 감싸거나 들여쓰기를 고치세요.'],
}, (ctx) => {
  for (const n of ctx.nodesOf('IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement')) {
    const body = bodyOf(n);
    if (!body || body.type === 'BlockStatement' || body.type === 'EmptyStatement') continue;
    const list = n.parent && (n.parent.type === 'BlockStatement' || n.parent.type === 'Program') ? n.parent.body : n.parent && n.parent.type === 'SwitchCase' ? n.parent.consequent : null;
    if (!list) continue;
    const next = list[list.indexOf(n) + 1];
    if (!next) continue;
    const head = ctx.loc(n.start);
    const b = ctx.loc(body.start);
    const nx = ctx.loc(next.start);
    if (b.line === head.line) continue;
    if (nx.line <= ctx.loc(body.end).line) continue;
    if (nx.column === b.column && b.column > head.column) ctx.report(next, m(`This statement will not be executed conditionally; only the first statement on line ${b.line} is part of the ${n.type === 'IfStatement' ? '"if"' : 'loop'}.`, `이 문장은 조건부로 실행되지 않습니다. ${b.line}번 줄의 첫 문장만 ${n.type === 'IfStatement' ? '"if"' : '반복'}에 속합니다.`));
  }
});

function nlBetween(src, a, b) {
  // newline in [a, b) outside comments
  const s = src.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
  return /[\n\r]/.test(s);
}

rule('unexpected-multiline', {
  t: 'B', s: 'MA', debt: 2, sonar: 'S1472', tags: ['suspicious'],
  name: ['Function call arguments should not start on new lines', '함수 호출 인자를 새 줄에서 시작하면 안 됩니다'],
  why: ['Without a semicolon, a line starting with "(", "[" or a template literal continues the previous expression as a call or index.', '세미콜론이 없으면 "(", "[", 템플릿 리터럴로 시작하는 줄은 앞 식에 이어져 호출이나 인덱스가 됩니다.'],
  fix: ['Add a semicolon at the end of the previous line, or move the "(" up.', '앞 줄 끝에 세미콜론을 넣거나 "("를 위로 옮기세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('CallExpression')) {
    if (n.optional || n.typeArguments) continue;
    const calleeEnd = n.callee.parenthesized ? n.callee.parenEnd : n.callee.end;
    const open = ctx.src.indexOf('(', calleeEnd);
    if (open < 0 || open >= n.end) continue;
    if (nlBetween(ctx.src, calleeEnd, open)) ctx.report(n, m('Make sure this expression is not interpreted as a function call; add a semicolon at the end of the previous line.', '이 식이 함수 호출로 해석되지 않도록 앞 줄 끝에 세미콜론을 넣으세요.'));
  }
  for (const n of ctx.nodes('TaggedTemplateExpression')) {
    if (nlBetween(ctx.src, n.tag.parenthesized ? n.tag.parenEnd : n.tag.end, n.quasi.start)) ctx.report(n, m('This template literal is used as a tag argument of the previous line; add a semicolon.', '이 템플릿 리터럴이 앞 줄의 태그 인자로 쓰입니다. 세미콜론을 넣으세요.'));
  }
  for (const n of ctx.nodes('MemberExpression')) {
    if (!n.computed || n.optional) continue;
    const objEnd = n.object.parenthesized ? n.object.parenEnd : n.object.end;
    const open = ctx.src.indexOf('[', objEnd);
    if (open < 0 || open > n.property.start) continue;
    if (nlBetween(ctx.src, objEnd, open) && n.property.type === 'SequenceExpression') ctx.report(n, m('This "[" continues the previous line as an index access; add a semicolon.', '이 "["는 앞 줄에 이어져 인덱스 접근이 됩니다. 세미콜론을 넣으세요.'));
  }
});

function continuesTo(loop) {
  let found = false;
  const labels = new Set();
  let p = loop.parent;
  while (p && p.type === 'LabeledStatement') { labels.add(p.label.name); p = p.parent; }
  const visit = (n, depth) => {
    if (found || !n || typeof n !== 'object') return;
    if (isFunction(n)) return;
    if (n.type === 'ContinueStatement' && (n.label ? labels.has(n.label.name) : depth === 0)) { found = true; return; }
    const nested = /^(For|While|DoWhile|ForIn|ForOf)Statement$/.test(n.type);
    for (const c of W.children(n)) visit(c, depth + (nested ? 1 : 0));
  };
  visit(loop.body, 0);
  return found;
}

rule('loop-single-iteration', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S1751', tags: ['suspicious'],
  name: ['Loops with at most one iteration should be refactored', '최대 한 번만 도는 반복은 고쳐야 합니다'],
  why: ['The loop body always ends with a return, throw or break, so it can run at most once.', '반복 본문이 항상 return, throw, break로 끝나 최대 한 번만 실행됩니다.'],
  fix: ['Replace the loop by an if statement, or make the jump conditional.', '반복을 if 문으로 바꾸거나 이동을 조건부로 만드세요.'],
}, (ctx) => {
  for (const loop of ctx.nodesOf('ForStatement', 'WhileStatement', 'DoWhileStatement')) {
    const b = loop.body;
    if (!b || b.type !== 'BlockStatement' || !b.body.length) continue;
    const last = b.body[b.body.length - 1];
    let jumps = last.type === 'ReturnStatement' || last.type === 'ThrowStatement' || (last.type === 'BreakStatement' && !last.label);
    if (!jumps) continue;
    if (continuesTo(loop)) continue;
    if (loop.type === 'ForStatement' && !loop.test && !loop.update) continue;
    ctx.report(loop, m('Refactor this loop to do more than one iteration.', '이 반복이 한 번 넘게 돌도록 고치세요.'));
  }
});

function staticType(n) {
  n = unwrapTS(n);
  if (!n) return null;
  switch (n.type) {
    case 'Literal':
      if (n.regex) return 'object';
      if (n.bigint != null) return 'bigint';
      return n.value === null ? 'null' : typeof n.value;
    case 'TemplateLiteral': return 'string';
    case 'ArrayExpression': case 'ObjectExpression': case 'NewExpression': case 'FunctionExpression': case 'ArrowFunctionExpression': case 'ClassExpression': return 'object';
    case 'UnaryExpression':
      if (n.operator === 'typeof') return 'string';
      if (n.operator === '!' || n.operator === 'delete') return 'boolean';
      if (n.operator === 'void') return 'undefined';
      if ((n.operator === '-' || n.operator === '+') && staticType(n.argument) === 'number') return 'number';
      return null;
    case 'Identifier': return n.name === 'undefined' && (!n._ref || !n._ref.resolved) ? 'undefined' : null;
    default: return null;
  }
}

rule('strict-equality-mismatch', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S3403', tags: ['suspicious'],
  name: ['Strict equality operators should not be used with dissimilar types', '서로 다른 타입에 엄격 비교 연산자를 쓰면 안 됩니다'],
  why: ['=== and !== never convert types, so comparing values of different types always gives the same result.', '===와 !==는 타입을 바꾸지 않아 다른 타입의 값을 비교하면 결과가 항상 같습니다.'],
  fix: ['Convert one side explicitly, or compare with a value of the same type.', '한쪽을 명시적으로 변환하거나 같은 타입의 값과 비교하세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('BinaryExpression')) {
    if (n.operator !== '===' && n.operator !== '!==') continue;
    const a = staticType(n.left);
    const b = staticType(n.right);
    if (!a || !b || a === b) continue;
    if (a === 'object' && b === 'object') continue;
    ctx.report(n, m(`Remove this "${n.operator}" check; it will always be ${n.operator === '===' ? 'false' : 'true'} (${a} vs ${b}).`, `이 "${n.operator}" 검사는 항상 ${n.operator === '===' ? '거짓' : '참'}입니다 (${a} 대 ${b}). 지우세요.`));
  }
});

rule('arithmetic-on-string', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S3760', tags: ['suspicious'],
  name: ['Arithmetic operators should only have numbers as operands', '산술 연산자의 피연산자는 숫자여야 합니다'],
  why: ['Subtracting, multiplying or dividing a non-numeric string or an object literal yields NaN.', '숫자가 아닌 문자열이나 객체 리터럴을 빼거나 곱하거나 나누면 NaN이 됩니다.'],
  fix: ['Convert the operand to a number first, or fix the operand.', '먼저 피연산자를 숫자로 바꾸거나 피연산자를 고치세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('BinaryExpression')) {
    if (!['-', '*', '/', '%', '**'].includes(n.operator)) continue;
    for (const side of [n.left, n.right]) {
      const s = unwrapTS(side);
      let bad = false;
      if (s.type === 'Literal' && typeof s.value === 'string' && Number.isNaN(Number(s.value))) bad = true;
      if (s.type === 'ObjectExpression' || (s.type === 'ArrayExpression' && s.elements.length > 1)) bad = true;
      if (bad) { ctx.report(n, m(`"${ctx.text(s).slice(0, 40)}" is not a number; this "${n.operator}" yields NaN.`, `"${ctx.text(s).slice(0, 40)}"는 숫자가 아니라 이 "${n.operator}" 결과는 NaN입니다.`)); break; }
    }
  }
});

rule('in-array-value', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S4619', tags: ['suspicious'],
  name: ['"in" should not be used on arrays to look up values', '배열에서 값을 찾을 때 "in"을 쓰면 안 됩니다'],
  why: ['"x in array" tests indexes (0, 1, 2...), not the values stored in the array.', '"x in array"는 배열에 든 값이 아니라 인덱스(0, 1, 2...)를 검사합니다.'],
  fix: ['Use array.includes(x).', 'array.includes(x)를 쓰세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('BinaryExpression')) {
    if (n.operator !== 'in') continue;
    const r = unwrapTS(n.right);
    const isArr = r.type === 'ArrayExpression' || (r.type === 'Identifier' && isArrayVar(ctx, r));
    if (!isArr) continue;
    const l = staticType(n.left);
    if (l === 'number') continue;
    ctx.report(n, m('Use "includes()" to check whether the array contains this value; "in" checks indexes.', '배열에 값이 있는지는 "includes()"로 확인하세요. "in"은 인덱스를 검사합니다.'));
  }
});

function promiseCall(ctx, n) {
  n = unwrapTS(n);
  if (!n) return null;
  if (n.type === 'NewExpression' && unwrapTS(n.callee).type === 'Identifier' && unwrapTS(n.callee).name === 'Promise' && isUnresolved(ctx, unwrapTS(n.callee))) return 'new Promise()';
  if (n.type !== 'CallExpression') return null;
  const c = unwrapTS(n.callee);
  if (c.type === 'Identifier') {
    if (c.name === 'fetch' && isUnresolved(ctx, c)) return 'fetch()';
    const fn = localFunction(ctx, c);
    if (fn && fn.async) return `${c.name}()`;
  }
  const dn = dottedName(c);
  if (dn && /^Promise\.(all|allSettled|race|any|resolve|reject)$/.test(dn) && isUnresolved(ctx, c.object)) return `${dn}()`;
  return null;
}

rule('promise-in-condition', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S6544', tags: ['promise', 'async'],
  name: ['Promises should not be used as conditions', 'Promise를 조건으로 쓰면 안 됩니다'],
  why: ['A promise object is always truthy, so the test does not depend on the asynchronous result.', 'Promise 객체는 항상 참이라 검사가 비동기 결과에 따라 달라지지 않습니다.'],
  fix: ['Await the promise first: if (await check()).', '먼저 Promise를 기다리세요: if (await check())'],
}, (ctx) => {
  const tests = [];
  for (const n of ctx.nodesOf('IfStatement', 'WhileStatement', 'DoWhileStatement', 'ConditionalExpression')) tests.push(n.test);
  for (const n of ctx.nodes('ForStatement')) if (n.test) tests.push(n.test);
  for (const n of ctx.nodes('LogicalExpression')) if (n.operator !== '??') tests.push(n.left);
  for (const n of ctx.nodes('UnaryExpression')) if (n.operator === '!') tests.push(n.argument);
  for (const t of tests) {
    const what = promiseCall(ctx, t);
    if (what) ctx.report(t, m(`Expected a non-Promise value in this condition; "${what}" returns a Promise that is always truthy.`, `조건에는 Promise가 아닌 값이 와야 합니다. "${what}"는 항상 참인 Promise를 돌려줍니다.`));
  }
});

const ASYNC_BAD_CB = new Set(['forEach', 'filter', 'some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex', 'sort', 'toSorted']);

rule('async-callback-misuse', {
  t: 'B', s: 'MA', debt: 10, sonar: 'S6544', tags: ['promise', 'async'],
  name: ['Async functions should not be passed where a synchronous result is expected', '동기 결과를 기대하는 곳에 async 함수를 넘기면 안 됩니다'],
  why: ['forEach ignores the returned promises (nothing waits for them), and filter / some / every / find treat every promise as truthy.', 'forEach는 돌려받은 Promise를 무시하고(아무도 기다리지 않음) filter / some / every / find는 모든 Promise를 참으로 봅니다.'],
  fix: ['Use a for...of loop with await, or Promise.all(array.map(async ...)).', 'await와 함께 for...of를 쓰거나 Promise.all(array.map(async ...))을 쓰세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    if (c.type !== 'MemberExpression') continue;
    const p = propName(c);
    if (!ASYNC_BAD_CB.has(p)) continue;
    const cb = call.arguments[0];
    if (cb && isFunction(cb) && cb.async) ctx.report(cb, m(`Async callback passed to "${p}()": ${p === 'forEach' ? 'the returned promises are not awaited' : 'every promise is truthy'}.`, `"${p}()"에 async 콜백을 넘겼습니다. ${p === 'forEach' ? '돌려받은 Promise를 기다리지 않습니다' : '모든 Promise가 참입니다'}.`));
  }
});

function enclosingFn(n) {
  return W.enclosingFunction(n);
}

rule('floating-promise', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S4822', tags: ['promise', 'async'],
  name: ['Promises returned by async functions should be awaited or handled', 'async 함수가 돌려주는 Promise는 기다리거나 처리해야 합니다'],
  why: ['Inside an async function, calling another async function without await lets it run unobserved: errors become unhandled rejections and ordering is lost.', 'async 함수 안에서 다른 async 함수를 await 없이 호출하면 결과를 보지 못합니다. 오류는 처리되지 않은 거부가 되고 순서가 사라집니다.'],
  fix: ['Add "await", return the promise, or handle it with .catch(); prefix with "void" if fire-and-forget is intended.', '"await"를 넣거나 Promise를 돌려주거나 .catch()로 처리하세요. 일부러 기다리지 않는다면 "void"를 붙이세요.'],
}, (ctx) => {
  for (const st of ctx.nodes('ExpressionStatement')) {
    const e = unwrapTS(st.expression);
    if (e.type !== 'CallExpression') continue;
    const fn = enclosingFn(st);
    if (!fn || !fn.async) continue;
    let target = localFunction(ctx, e.callee);
    if (!target) {
      const c = unwrapTS(e.callee);
      if (c.type === 'MemberExpression' && c.object.type === 'ThisExpression' && !c.computed) {
        const cls = U.enclosingClass(st);
        const name = propName(c);
        const mtd = cls && cls.body.body.find((x) => x.type === 'MethodDefinition' && keyName(x.key, x.computed) === name && !x.static);
        if (mtd) target = mtd.value;
      }
    }
    if (!target || !target.async) continue;
    ctx.report(e, m(`Promise returned by "${ctx.text(e.callee)}" is not awaited or handled.`, `"${ctx.text(e.callee)}"가 돌려준 Promise를 기다리거나 처리하지 않습니다.`));
  }
});

rule('empty-body-after-control', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S1116', tags: ['suspicious'],
  name: ['Control statements should not have an empty statement as their body', '제어 문의 본문이 빈 문장이면 안 됩니다'],
  why: ['A stray semicolon right after if / for / while becomes the whole body, so the following block runs unconditionally or once.', 'if / for / while 바로 뒤의 세미콜론이 본문 전체가 되어 뒤의 블록이 조건 없이 또는 한 번만 실행됩니다.'],
  fix: ['Remove the semicolon.', '세미콜론을 지우세요.'],
}, (ctx) => {
  for (const n of ctx.nodesOf('IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement')) {
    const body = n.type === 'IfStatement' ? n.consequent : n.body;
    if (body.type === 'EmptyStatement') ctx.report(body, m('Remove this semicolon; it is the whole body of the statement.', '이 세미콜론을 지우세요. 문장의 본문 전체가 됩니다.'));
  }
});

function pureExpr(n) {
  n = unwrapTS(n);
  switch (n.type) {
    case 'Identifier': case 'Literal': case 'ThisExpression': case 'TemplateLiteral': case 'ArrowFunctionExpression': case 'FunctionExpression': case 'ClassExpression':
      return n.type !== 'TemplateLiteral' || n.expressions.every(pureExpr);
    case 'BinaryExpression': return pureExpr(n.left) && pureExpr(n.right);
    case 'LogicalExpression': return pureExpr(n.left) && pureExpr(n.right);
    case 'UnaryExpression': return n.operator !== 'delete' && n.operator !== 'void' && pureExpr(n.argument);
    case 'ConditionalExpression': return pureExpr(n.test) && pureExpr(n.consequent) && pureExpr(n.alternate);
    case 'ArrayExpression': return n.elements.every((e) => !e || (e.type !== 'SpreadElement' && pureExpr(e)));
    case 'ObjectExpression': return n.properties.every((p) => p.type === 'Property' && !p.computed && pureExpr(p.value));
    case 'SequenceExpression': return n.expressions.every(pureExpr);
    default: return false;
  }
}

rule('unused-expression', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S905', tags: ['suspicious'],
  name: ['Non-empty statements should change control flow or have at least one side effect', '빈 문장이 아니면 제어 흐름을 바꾸거나 부작용이 있어야 합니다'],
  why: ['An expression statement without a side effect does nothing; it is usually a forgotten call, assignment or return.', '부작용 없는 식 문장은 아무 일도 하지 않으며 보통 호출, 대입, return을 빠뜨린 것입니다.'],
  fix: ['Call the function, assign or return the value, or remove the statement.', '함수를 호출하거나 값을 대입 또는 반환하거나 문장을 지우세요.'],
}, (ctx) => {
  for (const st of ctx.nodes('ExpressionStatement')) {
    if (st.directive) continue;
    const e = st.expression;
    if (!pureExpr(e)) continue;
    const u = unwrapTS(e);
    if (u.type === 'Literal' && typeof u.value === 'string' && st.parent && (st.parent.type === 'Program' || (st.parent.type === 'BlockStatement' && isFunction(st.parent.parent)))) continue;
    ctx.report(st, m('Expected an assignment or function call and instead saw an expression.', '대입이나 함수 호출이 와야 할 자리에 식만 있습니다.'));
  }
});

function constantTruth(n) {
  n = unwrapTS(n);
  const v = staticValue(n);
  if (v) return { value: !!v.value };
  switch (n.type) {
    case 'ArrayExpression': case 'ObjectExpression': case 'FunctionExpression': case 'ArrowFunctionExpression': case 'ClassExpression':
    case 'NewExpression':
      return { value: true };
    case 'UnaryExpression':
      if (n.operator === 'typeof') return { value: true };
      if (n.operator === 'void') return { value: false };
      return null;
    case 'TemplateLiteral':
      if (n.quasis.some((q) => q.value.cooked)) return { value: true };
      return null;
    default: return null;
  }
}

rule('constant-condition', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S2583', cwe: ['CWE-570', 'CWE-571'], tags: ['suspicious'],
  name: ['Conditions should not be constant', '조건이 상수이면 안 됩니다'],
  why: ['A literal or always-truthy condition makes one branch dead code.', '리터럴이나 항상 참인 조건은 한쪽 분기를 죽은 코드로 만듭니다.'],
  fix: ['Test a real value, or remove the dead branch.', '실제 값을 검사하거나 죽은 분기를 지우세요.'],
}, (ctx) => {
  const check = (test, isLoop) => {
    if (!test) return;
    const c = constantTruth(test);
    if (!c) return;
    if (isLoop && c.value) return;
    ctx.report(test, m(`This condition is always ${c.value ? 'truthy' : 'falsy'}.`, `이 조건은 항상 ${c.value ? '참' : '거짓'}입니다.`));
  };
  for (const n of ctx.nodes('IfStatement')) check(n.test, false);
  for (const n of ctx.nodes('ConditionalExpression')) check(n.test, false);
  for (const n of ctx.nodesOf('WhileStatement', 'ForStatement')) check(n.test, true);
  for (const n of ctx.nodes('DoWhileStatement')) { const c = constantTruth(n.test); if (c && c.value && !staticValue(n.test)) check(n.test, false); }
  for (const n of ctx.nodes('LogicalExpression')) {
    if (n.operator === '??') continue;
    const p = n.parent;
    const inTest = p && ((p.type === 'IfStatement' || p.type === 'WhileStatement' || p.type === 'ConditionalExpression' || p.type === 'ForStatement') && p.test === n);
    if (!inTest) continue;
    const c = constantTruth(n.left);
    if (c && !W.isLiteral(n.left)) check(n.left, false);
  }
});

rule('constant-binary-expression', {
  t: 'B', s: 'MA', debt: 5, sonar: 'S6638', tags: ['suspicious'],
  name: ['Binary expressions should not have constant results', '이항 식의 결과가 상수이면 안 됩니다'],
  why: ['The left side of "??" can never be nullish here, or the comparison is against a freshly created object, so the result never changes.', '"??"의 왼쪽이 null일 수 없거나 새로 만든 객체와 비교해 결과가 변하지 않습니다.'],
  fix: ['Fix the operator precedence or the operand.', '연산자 우선순위나 피연산자를 고치세요.'],
}, (ctx) => {
  const neverNullish = (x) => {
    x = unwrapTS(x);
    switch (x.type) {
      case 'Literal': return x.value !== null;
      case 'TemplateLiteral': case 'ArrayExpression': case 'ObjectExpression': case 'FunctionExpression': case 'ArrowFunctionExpression': case 'ClassExpression': case 'NewExpression': return true;
      case 'BinaryExpression': return true;
      case 'UnaryExpression': return x.operator !== 'void';
      case 'UpdateExpression': return true;
      default: return false;
    }
  };
  const fresh = (x) => { x = unwrapTS(x); return x.type === 'ArrayExpression' || x.type === 'ObjectExpression' || (x.type === 'NewExpression') || x.type === 'FunctionExpression' || x.type === 'ArrowFunctionExpression' || (x.type === 'Literal' && x.regex); };
  for (const n of ctx.nodes('LogicalExpression')) {
    if (n.operator === '??' && neverNullish(n.left)) ctx.report(n, m('The left side of "??" is never null or undefined; the right side is dead.', '"??"의 왼쪽은 절대 null이나 undefined가 아니어서 오른쪽은 죽은 코드입니다.'));
  }
  for (const n of ctx.nodes('BinaryExpression')) {
    if (!/^(==|!=|===|!==)$/.test(n.operator)) continue;
    if (fresh(n.left) || fresh(n.right)) {
      if (fresh(n.left) && fresh(n.right) && false) continue;
      const other = fresh(n.left) ? n.right : n.left;
      if (fresh(other) || unwrapTS(other).type === 'Literal' && false) continue;
      ctx.report(n, m(`This comparison against a newly created object is always ${n.operator[0] === '!' ? 'true' : 'false'}.`, `새로 만든 객체와의 이 비교는 항상 ${n.operator[0] === '!' ? '참' : '거짓'}입니다.`));
    }
  }
});

module.exports = { localFunction, isArrayVar, hasSideEffects, isUnresolved, promiseCall, staticType, ownReturns };
