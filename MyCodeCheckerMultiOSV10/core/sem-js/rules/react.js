'use strict';

// React / JSX rules.

const { rule, m } = require('./define');
const W = require('../walk');
const U = require('./util');
const B = require('./bugs');

const { unwrapTS, propName, dottedName, staticValue, isFunction, keyName } = W;

function jsxOf(n) {
  n = unwrapTS(n);
  if (!n) return [];
  if (n.type === 'JSXElement' || n.type === 'JSXFragment') return [n];
  if (n.type === 'ConditionalExpression') return jsxOf(n.consequent).concat(jsxOf(n.alternate));
  if (n.type === 'LogicalExpression') return jsxOf(n.right);
  return [];
}

function returnedJsx(fn) {
  if (fn.body.type !== 'BlockStatement') return jsxOf(fn.body);
  const out = [];
  for (const r of B.ownReturns(fn)) if (r.argument) out.push(...jsxOf(r.argument));
  return out;
}

function hasKey(el) {
  if (el.type === 'JSXFragment') return false;
  return !!U.attr(el, 'key') || U.hasSpreadAttr(el);
}

const MAP_METHODS = new Set(['map', 'flatMap']);

function iteratorCallback(fn) {
  const cb = U.callbackOf(fn);
  if (!cb) return null;
  const c = unwrapTS(cb.call.callee);
  if (cb.index === 0 && c.type === 'MemberExpression' && MAP_METHODS.has(propName(c))) return cb.call;
  if (cb.index === 1 && dottedName(c) === 'Array.from') return cb.call;
  if (cb.index === 1 && /(^|\.)Children\.map$/.test(dottedName(c) || '')) return cb.call;
  return null;
}

rule('jsx-key', {
  t: 'B', s: 'MA', debt: 5, ref: 'S6477', react: true, tags: ['jsx'],
  name: ['JSX list components should have a key property', 'JSX 목록 컴포넌트에는 key 속성이 있어야 합니다'],
  why: ['Without a stable key React cannot match list items between renders, causing lost state and wrong updates.', '안정적인 key가 없으면 React가 렌더 사이에 목록 항목을 맞추지 못해 상태가 사라지거나 잘못 갱신됩니다.'],
  fix: ['Add a key prop with a stable, unique id.', '안정적이고 고유한 id로 key 속성을 넣으세요.'],
}, (ctx) => {
  for (const fn of ctx.nodesOf('ArrowFunctionExpression', 'FunctionExpression')) {
    if (!iteratorCallback(fn)) continue;
    for (const el of returnedJsx(fn)) if (!hasKey(el)) ctx.report(el.type === 'JSXElement' ? el.openingElement : el.openingFragment, m('Missing "key" prop for element in iterator.', '반복으로 만든 요소에 "key" 속성이 없습니다.'));
  }
  for (const arr of ctx.nodes('ArrayExpression')) {
    for (const e of arr.elements) {
      if (!e || (e.type !== 'JSXElement' && e.type !== 'JSXFragment')) continue;
      if (!hasKey(e)) ctx.report(e.type === 'JSXElement' ? e.openingElement : e.openingFragment, m('Missing "key" prop for element in array.', '배열 안의 요소에 "key" 속성이 없습니다.'));
    }
  }
});

// ---- hooks
function hookOwner(call) {
  let p = call.parent;
  while (p && !isFunction(p)) p = p.parent;
  return p;
}

function isComponentOrHook(fn) {
  const name = W.functionName(fn);
  if (name && (U.isComponentName(name) || U.isHookName(name))) return true;
  const p = fn.parent;
  if (p && p.type === 'CallExpression') {
    const cn = W.calleeProp(p);
    if (cn === 'memo' || cn === 'forwardRef' || cn === 'observer') return true;
  }
  if (p && p.type === 'ExportDefaultDeclaration') return U.returnsJsx(fn) || true;
  return false;
}

function conditionalAncestor(call, fn) {
  let child = call;
  let p = call.parent;
  while (p && p !== fn) {
    switch (p.type) {
      case 'IfStatement': if (p.test !== child) return 'conditionally'; break;
      case 'ConditionalExpression': if (p.test !== child) return 'conditionally'; break;
      case 'LogicalExpression': if (p.right === child) return 'conditionally'; break;
      case 'SwitchCase': return 'conditionally';
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': case 'WhileStatement': case 'DoWhileStatement': return 'in a loop';
      case 'ChainExpression': return 'conditionally';
      case 'TryStatement': if (p.handler && child === p.handler) return 'conditionally'; break;
      default: break;
    }
    child = p;
    p = p.parent;
  }
  return null;
}

rule('hooks-rules', {
  t: 'B', s: 'CR', debt: 10, ref: 'S6440', react: true, tags: ['hooks'],
  name: ['React Hooks should be properly called', 'React Hook은 올바르게 호출해야 합니다'],
  why: ['React identifies hooks by call order; calling them conditionally, in loops, in callbacks or outside components breaks state.', 'React는 호출 순서로 Hook을 구별합니다. 조건부, 반복 안, 콜백, 컴포넌트 밖에서 부르면 상태가 깨집니다.'],
  fix: ['Call hooks unconditionally at the top level of a component or custom hook.', 'Hook은 컴포넌트나 사용자 Hook의 최상위에서 조건 없이 호출하세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    if (!U.isHookCall(call)) continue;
    const name = ctx.text(call.callee);
    const fn = hookOwner(call);
    if (!fn) continue;
    if (!isComponentOrHook(fn)) {
      const cls = U.enclosingClass(call);
      const owner = W.functionName(fn);
      if (cls && U.isClassComponent(cls)) { ctx.report(call.callee, m(`React Hook "${name}" cannot be called in a class component.`, `React Hook "${name}"는 클래스 컴포넌트에서 호출할 수 없습니다.`)); continue; }
      const parentFn = hookOwner(fn);
      if (parentFn && isComponentOrHook(parentFn)) ctx.report(call.callee, m(`React Hook "${name}" cannot be called inside a callback; call it at the top level of the component.`, `React Hook "${name}"는 콜백 안에서 호출할 수 없습니다. 컴포넌트 최상위에서 호출하세요.`));
      else if (owner && /^[a-z]/.test(owner)) ctx.report(call.callee, m(`React Hook "${name}" is called in function "${owner}" that is neither a React function component nor a custom React Hook.`, `React Hook "${name}"를 React 함수 컴포넌트도 사용자 Hook도 아닌 함수 "${owner}"에서 호출합니다.`));
      continue;
    }
    const cond = conditionalAncestor(call, fn);
    if (cond) { ctx.report(call.callee, m(`React Hook "${name}" is called ${cond}. Hooks must be called in the exact same order in every render.`, `React Hook "${name}"를 ${cond === 'in a loop' ? '반복 안에서' : '조건부로'} 호출합니다. Hook은 매 렌더마다 같은 순서로 호출해야 합니다.`)); continue; }
    if (fn.body.type === 'BlockStatement') {
      const early = B.ownReturns(fn).find((r) => r.start < call.start);
      if (early) ctx.report(call.callee, m(`React Hook "${name}" is called after an early return (line ${ctx.line(early)}).`, `React Hook "${name}"를 이른 반환(${ctx.line(early)}번 줄) 뒤에 호출합니다.`));
    }
  }
});

function classComponents(ctx) {
  return ctx.nodesOf('ClassDeclaration', 'ClassExpression').filter(U.isClassComponent);
}

function inMethod(node, kinds) {
  let p = node.parent;
  while (p) {
    if (p.type === 'MethodDefinition') return kinds.includes(p.kind) || kinds.includes(keyName(p.key, p.computed));
    if (p.type === 'ClassBody') return false;
    p = p.parent;
  }
  return false;
}

rule('state-mutation', {
  t: 'B', s: 'MA', debt: 5, ref: 'S6746', react: true,
  name: ['React state should not be mutated directly', 'React 상태를 직접 바꾸면 안 됩니다'],
  why: ['Assigning to this.state does not re-render the component and is overwritten by the next setState.', 'this.state에 대입하면 다시 렌더되지 않고 다음 setState에 덮어써집니다.'],
  fix: ['Use this.setState().', 'this.setState()를 쓰세요.'],
}, (ctx) => {
  for (const cls of classComponents(ctx)) {
    for (const a of U.findAll(cls.body, (n) => (n.type === 'AssignmentExpression' || n.type === 'UpdateExpression'), true)) {
      const target = a.type === 'AssignmentExpression' ? a.left : a.argument;
      const dn = dottedName(target) || '';
      if (!/^this\.state(\.|$)/.test(dn)) continue;
      if (inMethod(a, ['constructor'])) continue;
      ctx.report(a, m('Do not mutate this.state directly; use setState().', 'this.state를 직접 바꾸지 말고 setState()를 쓰세요.'));
    }
  }
});

rule('jsx-duplicate-props', {
  t: 'B', s: 'MA', debt: 5, ref: 'S6742', react: true, tags: ['jsx'],
  name: ['JSX elements should not have duplicate props', 'JSX 요소에 같은 속성을 두 번 쓰면 안 됩니다'],
  why: ['Only the last occurrence of a repeated prop is used; the earlier one is silently ignored.', '반복된 속성은 마지막 것만 쓰이고 앞의 것은 조용히 무시됩니다.'],
  fix: ['Remove one of the duplicated props.', '중복된 속성 중 하나를 지우세요.'],
}, (ctx) => {
  for (const op of ctx.nodes('JSXOpeningElement')) {
    const seen = new Map();
    for (const a of op.attributes) {
      const n = U.attrName(a);
      if (!n) continue;
      if (seen.has(n)) ctx.report(a, m(`Duplicate prop "${n}"; the one on line ${ctx.line(seen.get(n))} is overridden.`, `속성 "${n}"가 중복되어 ${ctx.line(seen.get(n))}번 줄의 것이 덮어써집니다.`));
      else seen.set(n, a);
    }
  }
});

rule('access-state-in-setstate', {
  t: 'B', s: 'MA', debt: 5, ref: 'S6756', react: true,
  name: ['"setState" should use a callback when referencing the previous state', '이전 상태를 참조하는 "setState"는 콜백을 써야 합니다'],
  why: ['setState is batched and asynchronous; this.state may be stale when the update is applied.', 'setState는 묶여서 비동기로 처리되어 갱신이 적용될 때 this.state가 낡았을 수 있습니다.'],
  fix: ['Use the updater form: this.setState(prev => ({ count: prev.count + 1 })).', '갱신 함수 형태를 쓰세요: this.setState(prev => ({ count: prev.count + 1 })).'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    if (dottedName(call.callee) !== 'this.setState') continue;
    const a = unwrapTS(call.arguments[0]);
    if (!a || a.type !== 'ObjectExpression') continue;
    const ref = U.findAll(a, (n) => n.type === 'MemberExpression' && /^this\.state(\.|$)/.test(dottedName(n) || ''), false)[0];
    if (ref) ctx.report(ref, m('Use a callback in setState() when the new state depends on this.state.', '새 상태가 this.state에 의존하면 setState()에 콜백을 쓰세요.'));
  }
});

rule('jsx-comment-textnode', {
  t: 'B', s: 'MA', debt: 2, ref: 'S6438', react: true, tags: ['jsx'],
  name: ['Comments inside JSX expressions should be enclosed in curly braces', 'JSX 안의 주석은 중괄호로 감싸야 합니다'],
  why: ['"// text" or "/* text */" written directly in JSX is rendered as visible text.', 'JSX에 바로 쓴 "// text"나 "/* text */"는 보이는 텍스트로 출력됩니다.'],
  fix: ['Wrap the comment: {/* comment */}.', '주석을 감싸세요: {/* comment */}.'],
}, (ctx) => {
  for (const t of ctx.nodes('JSXText')) {
    const re = /(^|\n)([^\S\n]*)\/\/|\/\*[\s\S]*?\*\//g;
    const raw = ctx.text(t);
    for (let mt; (mt = re.exec(raw));) {
      const at = t.start + mt.index + (mt[1] !== undefined ? mt[1].length + mt[2].length : 0);
      ctx.report({ start: at, end: at + 2 }, m('Wrap this comment in braces: {/* ... */}; it is rendered as text.', '이 주석을 {/* ... */}로 감싸세요. 텍스트로 출력됩니다.'));
    }
  }
});

rule('children-prop', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6748', react: true, tags: ['jsx'],
  name: ['Children should not be passed as a prop', 'children을 속성으로 넘기면 안 됩니다'],
  why: ['children={...} competes with nested JSX children and is harder to read.', 'children={...}는 중첩된 JSX 자식과 겹치고 읽기 어렵습니다.'],
  fix: ['Nest the children between the opening and closing tags.', '자식을 여는 태그와 닫는 태그 사이에 넣으세요.'],
}, (ctx) => {
  for (const el of ctx.nodes('JSXElement')) {
    const a = U.attr(el, 'children');
    if (a && U.attrName(a) === 'children') ctx.report(a, m('Do not pass children as a prop; nest them instead.', 'children을 속성으로 넘기지 말고 중첩하세요.'));
  }
});

// children that render something (not blank text, not {/* comments */})
function realChildren(el) {
  return el.children.filter((c) => !(c.type === 'JSXText' && !c.value.trim()) && !(c.type === 'JSXExpressionContainer' && c.expression.type === 'JSXEmptyExpression'));
}

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'menuitem']);

rule('void-dom-children', {
  t: 'B', s: 'MA', debt: 2, ref: 'S6748', react: true, tags: ['jsx'],
  name: ['Void DOM elements should not have children', '빈 DOM 요소에는 자식이 있으면 안 됩니다'],
  why: ['Elements like <img>, <br> and <input> cannot contain children; React throws at runtime.', '<img>, <br>, <input> 같은 요소는 자식을 가질 수 없어 React가 실행 시 오류를 냅니다.'],
  fix: ['Remove the children / dangerouslySetInnerHTML.', '자식 / dangerouslySetInnerHTML을 지우세요.'],
}, (ctx) => {
  for (const el of ctx.nodes('JSXElement')) {
    const name = U.elementName(el);
    if (!VOID_ELEMENTS.has(name)) continue;
    const kids = realChildren(el);
    if (kids.length || U.attr(el, 'children') || U.attr(el, 'dangerouslySetInnerHTML')) ctx.report(el.openingElement, m(`Void DOM element <${name}> cannot receive children.`, `빈 DOM 요소 <${name}>는 자식을 가질 수 없습니다.`));
  }
});

rule('string-refs', {
  t: 'S', s: 'MA', debt: 5, ref: 'S6790', react: true, tags: ['obsolete'],
  name: ['String references should not be used', '문자열 ref를 쓰면 안 됩니다'],
  why: ['String refs are legacy, slow and removed in React 19.', '문자열 ref는 낡고 느리며 React 19에서 제거되었습니다.'],
  fix: ['Use useRef() / createRef() or a callback ref.', 'useRef() / createRef()나 콜백 ref를 쓰세요.'],
}, (ctx) => {
  for (const el of ctx.nodes('JSXElement')) {
    const a = U.attr(el, 'ref');
    const v = U.attrValue(a);
    if (a && v && typeof v.value === 'string') ctx.report(a, m('Using string literals in ref attributes is deprecated.', 'ref 속성에 문자열 리터럴을 쓰는 것은 폐기 예정입니다.'));
  }
});

rule('render-return-value', {
  t: 'B', s: 'MA', debt: 5, ref: 'S6750', react: true,
  name: ['The return value of "ReactDOM.render" should not be used', '"ReactDOM.render"의 반환값을 쓰면 안 됩니다'],
  why: ['ReactDOM.render may render asynchronously; its return value is unreliable and removed in modern React.', 'ReactDOM.render는 비동기로 렌더할 수 있어 반환값을 믿을 수 없고 최신 React에서 없어졌습니다.'],
  fix: ['Use a callback ref on the root element.', '루트 요소에 콜백 ref를 쓰세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const t = ctx.target(call.callee);
    const isRender = t && ((t.module === 'react-dom' && t.path.join('.') === 'render') || (t.global && t.name === 'ReactDOM.render'));
    if (isRender && U.isValueUsed(call) && call.parent.type !== 'ReturnStatement' && call.parent.type !== 'ArrowFunctionExpression') ctx.report(call, m('Do not use the return value of ReactDOM.render().', 'ReactDOM.render()의 반환값을 쓰지 마세요.'));
  }
});

rule('find-dom-node', {
  t: 'S', s: 'MA', debt: 10, ref: 'S6788', react: true, tags: ['obsolete'],
  name: ['"findDOMNode" should not be used', '"findDOMNode"를 쓰면 안 됩니다'],
  why: ['findDOMNode breaks component abstraction, does not work with function components and is removed in React 19.', 'findDOMNode는 컴포넌트 추상화를 깨고 함수 컴포넌트에서 동작하지 않으며 React 19에서 제거되었습니다.'],
  fix: ['Use a ref.', 'ref를 쓰세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    if (W.calleeProp(call) !== 'findDOMNode') continue;
    const t = ctx.target(call.callee);
    if (t && (t.module === 'react-dom' || t.base === 'ReactDOM' || t.module === 'react')) ctx.report(call, m('Do not use findDOMNode; use a ref instead.', 'findDOMNode를 쓰지 말고 ref를 쓰세요.'));
  }
});

function isFragment(el) {
  if (el.type === 'JSXFragment') return true;
  const n = U.elementName(el);
  return (n === 'Fragment' || n === 'React.Fragment') && !U.attr(el, 'key') && !U.hasSpreadAttr(el);
}

rule('useless-fragment', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6749', react: true, tags: ['jsx'],
  name: ['Redundant React fragments should be removed', '불필요한 React 프래그먼트는 지워야 합니다'],
  why: ['A fragment around a single element or around nothing adds markup noise.', '요소 하나나 아무것도 감싸지 않은 프래그먼트는 잡음만 더합니다.'],
  fix: ['Return the child directly.', '자식을 바로 돌려주세요.'],
}, (ctx) => {
  for (const el of ctx.nodesOf('JSXFragment', 'JSXElement')) {
    if (!isFragment(el)) continue;
    const kids = realChildren(el);
    const p = el.parent;
    if (p && p.type === 'JSXAttribute') continue;
    if (kids.length === 0 || (kids.length === 1 && kids[0].type === 'JSXElement')) ctx.report(el.type === 'JSXFragment' ? el.openingFragment : el.openingElement, m('Remove this redundant fragment.', '이 불필요한 프래그먼트를 지우세요.'));
  }
});

rule('array-index-key', {
  t: 'S', s: 'MA', debt: 10, ref: 'S6479', react: true, tags: ['jsx'],
  name: ['JSX list components should not use array indexes as key', 'JSX 목록 컴포넌트의 key로 배열 인덱스를 쓰면 안 됩니다'],
  why: ['Index keys change when items are inserted, removed or reordered, so React reuses the wrong component state.', '인덱스 key는 항목을 넣거나 지우거나 순서를 바꿀 때 달라져 React가 잘못된 컴포넌트 상태를 재사용합니다.'],
  fix: ['Use a stable id from the data.', '데이터의 안정적인 id를 쓰세요.'],
}, (ctx) => {
  for (const fn of ctx.nodesOf('ArrowFunctionExpression', 'FunctionExpression')) {
    if (!iteratorCallback(fn)) continue;
    const idx = fn.params[1];
    if (!idx || idx.type !== 'Identifier') continue;
    for (const el of U.findAll(fn.body, (n) => n.type === 'JSXElement', true)) {
      const a = U.attr(el, 'key');
      if (!a || !a.value || a.value.type !== 'JSXExpressionContainer') continue;
      const e = unwrapTS(a.value.expression);
      const uses = (x) => x && x.type === 'Identifier' && x.name === idx.name && x._ref && x._ref.resolved === idx._var;
      // index itself, `${i}` / `row-${i}`, 'row-' + i, i.toString(), String(i)
      const indexKey = (x) => {
        x = unwrapTS(x);
        if (!x) return false;
        if (uses(x)) return true;
        if (x.type === 'TemplateLiteral') return x.expressions.some(indexKey);
        if (x.type === 'BinaryExpression' && x.operator === '+') return indexKey(x.left) || indexKey(x.right);
        if (x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && propName(x.callee) === 'toString') return indexKey(x.callee.object);
        if (x.type === 'CallExpression' && x.callee.type === 'Identifier' && x.callee.name === 'String') return indexKey(x.arguments[0]);
        return false;
      };
      const bad = indexKey(e);
      if (bad) ctx.report(a, m('Do not use the array index in keys.', 'key에 배열 인덱스를 쓰지 마세요.'));
    }
  }
});

// useState pairs of a component: Map(setterVar -> { value: Variable, setter: Variable, decl })
function statePairs(ctx) {
  if (ctx._statePairs) return ctx._statePairs;
  const out = new Map();
  for (const d of ctx.nodes('VariableDeclarator')) {
    const init = unwrapTS(d.init);
    if (!init || init.type !== 'CallExpression') continue;
    const cp = W.calleeProp(init);
    if (cp !== 'useState' && cp !== 'useReducer') continue;
    if (d.id.type !== 'ArrayPattern' || d.id.elements.length < 2) continue;
    const [val, set] = d.id.elements;
    if (!set || set.type !== 'Identifier' || !set._var) continue;
    out.set(set._var, { value: val && val.type === 'Identifier' ? val._var : null, valueId: val, setter: set._var, setterId: set, decl: d, hook: cp });
  }
  ctx._statePairs = out;
  return out;
}

function setterCall(ctx, call) {
  const c = unwrapTS(call.callee);
  if (c.type !== 'Identifier' || !c._ref || !c._ref.resolved) return null;
  const pr = statePairs(ctx).get(c._ref.resolved);
  return pr && pr.hook === 'useState' ? pr : null;
}

rule('effect-without-deps-sets-state', {
  t: 'B', s: 'MA', debt: 10, react: true, tags: ['hooks'],
  name: ['Effects without a dependency array should not set state unconditionally', '의존성 배열 없는 effect에서 상태를 무조건 바꾸면 안 됩니다'],
  why: ['An effect without dependencies runs after every render; setting state in it triggers another render, creating an infinite loop.', '의존성이 없는 effect는 매 렌더 뒤에 실행됩니다. 그 안에서 상태를 바꾸면 다시 렌더되어 무한 반복이 됩니다.'],
  fix: ['Pass a dependency array as the second argument of useEffect.', 'useEffect의 두 번째 인자로 의존성 배열을 넘기세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const cp = W.calleeProp(call);
    if ((cp !== 'useEffect' && cp !== 'useLayoutEffect') || call.arguments.length !== 1) continue;
    const fn = call.arguments[0];
    if (!isFunction(fn) || fn.body.type !== 'BlockStatement') continue;
    for (const st of fn.body.body) {
      if (st.type !== 'ExpressionStatement') continue;
      const e = unwrapTS(st.expression);
      if (e.type === 'CallExpression' && setterCall(ctx, e)) { ctx.report(e, m(`"${ctx.text(e.callee)}" is called in an effect without dependency array; this re-renders forever.`, `의존성 배열 없는 effect에서 "${ctx.text(e.callee)}"를 호출해 끝없이 다시 렌더합니다.`)); break; }
    }
  }
});

rule('setstate-in-render', {
  t: 'B', s: 'MA', debt: 10, ref: 'S6442', react: true, tags: ['hooks'],
  name: ['React state setters should not be called in the render body', 'React 상태 setter를 렌더 본문에서 호출하면 안 됩니다'],
  why: ['Calling a state setter unconditionally while rendering schedules another render, which loops forever.', '렌더 중에 상태 setter를 무조건 호출하면 또 렌더가 예약되어 끝없이 반복됩니다.'],
  fix: ['Move the call into an event handler or useEffect.', '호출을 이벤트 처리기나 useEffect로 옮기세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const pr = setterCall(ctx, call);
    if (!pr) continue;
    const st = call.parent;
    if (!st || st.type !== 'ExpressionStatement') continue;
    const blk = st.parent;
    if (!blk || blk.type !== 'BlockStatement' || !isFunction(blk.parent)) continue;
    const fn = blk.parent;
    if (!U.isFunctionComponent(fn)) continue;
    if (pr.decl.start < fn.start || pr.decl.end > fn.end) continue;
    ctx.report(call, m(`"${ctx.text(call.callee)}" is called during render; this causes an infinite re-render loop.`, `렌더 중에 "${ctx.text(call.callee)}"를 호출해 끝없이 다시 렌더합니다.`));
  }
});

rule('setstate-same-value', {
  t: 'B', s: 'MA', debt: 5, ref: 'S6443', react: true, tags: ['hooks'],
  name: ['React state setters should not be called with their own state value', 'React 상태 setter에 자기 상태 값을 넘기면 안 됩니다'],
  why: ['setX(x) sets the state to the value it already has, so nothing changes; it is usually a typo.', 'setX(x)는 이미 가진 값으로 상태를 설정해 아무것도 바뀌지 않으며 보통 오타입니다.'],
  fix: ['Pass the new value, or remove the call.', '새 값을 넘기거나 호출을 지우세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const pr = setterCall(ctx, call);
    if (!pr || !pr.value || call.arguments.length !== 1) continue;
    const a = unwrapTS(call.arguments[0]);
    if (a.type === 'Identifier' && a._ref && a._ref.resolved === pr.value) ctx.report(call, m(`"${ctx.text(call.callee)}" is called with its own state "${a.name}"; this does nothing.`, `"${ctx.text(call.callee)}"에 자기 상태 "${a.name}"를 넘겨 아무 일도 하지 않습니다.`));
  }
});

rule('usestate-naming', {
  t: 'S', s: 'MI', debt: 2, ref: 'S6754', react: true, tags: ['hooks', 'convention'],
  name: ['useState call should be destructured into value + setter pairs with matching names', 'useState는 이름이 맞는 값 + setter 쌍으로 구조 분해해야 합니다'],
  why: ['[value, setValue] naming makes it obvious which setter updates which state.', '[value, setValue] 이름은 어떤 setter가 어떤 상태를 바꾸는지 분명히 합니다.'],
  fix: ['Rename to [thing, setThing].', '[thing, setThing]으로 이름을 바꾸세요.'],
}, (ctx) => {
  for (const pr of statePairs(ctx).values()) {
    if (pr.hook !== 'useState' || !pr.valueId || pr.valueId.type !== 'Identifier') continue;
    const v = pr.valueId.name;
    const s = pr.setterId.name;
    const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
    const ok = s === `set${cap(v)}` || (/^is[A-Z]/.test(v) && s === `set${v.slice(2)}`) || s === `set${cap(v.replace(/^_+/, ''))}`;
    if (!ok) ctx.report(pr.decl.id, m(`useState call is not destructured into value + setter pair ("${v}", "set${cap(v)}").`, `useState를 값 + setter 쌍("${v}", "set${cap(v)}")으로 구조 분해하지 않았습니다.`));
  }
});

rule('unstable-context-value', {
  t: 'S', s: 'MA', debt: 5, ref: 'S6481', react: true, tags: ['performance'],
  name: ['React Context Provider values should have stable identities', 'React Context Provider의 value는 안정적인 정체성을 가져야 합니다'],
  why: ['An object or function created during render changes on every render, re-rendering every consumer of the context.', '렌더 중에 만든 객체나 함수는 매 렌더마다 바뀌어 컨텍스트의 모든 소비자를 다시 렌더합니다.'],
  fix: ['Wrap the value in useMemo / useCallback.', 'value를 useMemo / useCallback으로 감싸세요.'],
}, (ctx) => {
  for (const el of ctx.nodes('JSXElement')) {
    const name = U.elementName(el);
    if (!/\.Provider$/.test(name) && !/Context$/.test(name)) continue;
    const a = U.attr(el, 'value');
    if (!a || !a.value || a.value.type !== 'JSXExpressionContainer') continue;
    const e = unwrapTS(a.value.expression);
    if (!['ObjectExpression', 'ArrayExpression', 'ArrowFunctionExpression', 'FunctionExpression', 'NewExpression'].includes(e.type)) continue;
    const fn = W.enclosingFunction(el);
    if (!fn || !U.isFunctionComponent(fn)) continue;
    ctx.report(a, m('The value passed to this Context Provider changes on every render; memoize it.', '이 Context Provider에 넘기는 value는 매 렌더마다 바뀝니다. 메모이제이션하세요.'));
  }
});

rule('unstable-nested-component', {
  t: 'S', s: 'MA', debt: 10, ref: 'S6478', react: true, tags: ['performance'],
  name: ['React components should not be nested', 'React 컴포넌트를 중첩해서 정의하면 안 됩니다'],
  why: ['A component defined inside another component is a new type on every render, so React unmounts and remounts it (losing its state).', '다른 컴포넌트 안에서 정의한 컴포넌트는 매 렌더마다 새 타입이라 React가 언마운트 후 다시 마운트합니다 (상태 손실).'],
  fix: ['Move the inner component to the module level and pass data through props.', '안쪽 컴포넌트를 모듈 수준으로 옮기고 데이터는 props로 넘기세요.'],
}, (ctx) => {
  for (const fn of ctx.functions()) {
    const name = W.functionName(fn);
    if (!name || !U.isComponentName(name) || !U.returnsJsx(fn)) continue;
    const outer = W.enclosingFunction(fn);
    if (!outer || !U.isFunctionComponent(outer)) continue;
    // only plain declarations inside the component body
    const p = fn.parent;
    if (!(fn.type === 'FunctionDeclaration' || (p && p.type === 'VariableDeclarator'))) continue;
    ctx.report(fn.id || p.id, m(`Move the "${name}" component definition out of the parent component "${W.functionName(outer)}".`, `"${name}" 컴포넌트 정의를 부모 컴포넌트 "${W.functionName(outer)}" 밖으로 옮기세요.`));
  }
});

rule('button-type', {
  t: 'S', s: 'MI', debt: 2, react: true, tags: ['jsx'],
  name: ['Buttons should have an explicit "type"', '버튼에는 명시적인 "type"이 있어야 합니다'],
  why: ['A <button> without type is a submit button and submits the surrounding form when clicked.', 'type 없는 <button>은 제출 버튼이라 누르면 둘러싼 폼을 제출합니다.'],
  fix: ['Add type="button" (or "submit" / "reset" when intended).', 'type="button"(의도하면 "submit" / "reset")을 넣으세요.'],
}, (ctx) => {
  for (const el of ctx.nodes('JSXElement')) {
    if (U.elementName(el) !== 'button' || U.hasSpreadAttr(el)) continue;
    const t = U.attrValue(U.attr(el, 'type'));
    if (!t) ctx.report(el.openingElement, m('Add an explicit "type" attribute to this button.', '이 버튼에 명시적인 "type" 속성을 넣으세요.'));
    else if (!t.dynamic && !['button', 'submit', 'reset'].includes(String(t.value))) ctx.report(el.openingElement, m(`"${t.value}" is not a valid button type.`, `"${t.value}"는 올바른 버튼 type이 아닙니다.`));
  }
});

const LEGACY_LIFECYCLE = new Set(['componentWillMount', 'componentWillReceiveProps', 'componentWillUpdate']);

rule('react-deprecated', {
  t: 'S', s: 'MA', debt: 15, ref: 'S6957', react: true, tags: ['obsolete'],
  name: ['Deprecated React APIs should not be used', '폐기 예정 React API를 쓰면 안 됩니다'],
  why: ['Legacy lifecycle methods and the old root APIs are removed or behave incorrectly with concurrent rendering.', '옛 생명주기 메서드와 옛 루트 API는 제거되었거나 동시 렌더링에서 잘못 동작합니다.'],
  fix: ['Use componentDidMount / getDerivedStateFromProps / createRoot as appropriate.', '알맞게 componentDidMount / getDerivedStateFromProps / createRoot를 쓰세요.'],
}, (ctx) => {
  for (const cls of classComponents(ctx)) {
    for (const mbr of cls.body.body) {
      const k = mbr.type === 'MethodDefinition' || mbr.type === 'PropertyDefinition' ? keyName(mbr.key, mbr.computed) : null;
      if (k && LEGACY_LIFECYCLE.has(k)) ctx.report(mbr.key, m(`"${k}" is deprecated; use the replacement lifecycle method.`, `"${k}"는 폐기 예정입니다. 대체 생명주기 메서드를 쓰세요.`));
    }
  }
  for (const call of ctx.nodes('CallExpression')) {
    const t = ctx.target(call.callee);
    if (!t) continue;
    const p = t.path.join('.');
    if ((t.module === 'react-dom' || t.base === 'ReactDOM') && /^(render|hydrate|unmountComponentAtNode)$/.test(p)) ctx.report(call.callee, m(`ReactDOM.${p}() is deprecated; use createRoot() / hydrateRoot().`, `ReactDOM.${p}()는 폐기 예정입니다. createRoot() / hydrateRoot()를 쓰세요.`));
    else if ((t.module === 'react' || t.base === 'React') && p === 'createClass') ctx.report(call.callee, m('React.createClass is removed; use a class or function component.', 'React.createClass는 제거되었습니다. 클래스나 함수 컴포넌트를 쓰세요.'));
  }
  for (const me of ctx.nodes('MemberExpression')) {
    const t = ctx.target(me);
    if (t && (t.module === 'react' || t.base === 'React') && t.path.join('.') === 'PropTypes') ctx.report(me, m('React.PropTypes is removed; use the prop-types package.', 'React.PropTypes는 제거되었습니다. prop-types 패키지를 쓰세요.'));
  }
});

rule('unsafe-lifecycle', {
  t: 'S', s: 'MA', debt: 15, ref: 'S6791', react: true, tags: ['obsolete'],
  name: ['React legacy "UNSAFE_" lifecycle methods should not be used', 'React의 옛 "UNSAFE_" 생명주기 메서드를 쓰면 안 됩니다'],
  why: ['UNSAFE_ lifecycles are unsafe with async rendering and will be removed.', 'UNSAFE_ 생명주기는 비동기 렌더링에서 안전하지 않고 제거될 예정입니다.'],
  fix: ['Move the logic to componentDidMount / componentDidUpdate or getDerivedStateFromProps.', '로직을 componentDidMount / componentDidUpdate나 getDerivedStateFromProps로 옮기세요.'],
}, (ctx) => {
  for (const cls of classComponents(ctx)) {
    for (const mbr of cls.body.body) {
      const k = mbr.type === 'MethodDefinition' ? keyName(mbr.key, mbr.computed) : null;
      if (k && /^UNSAFE_(componentWillMount|componentWillReceiveProps|componentWillUpdate)$/.test(k)) ctx.report(mbr.key, m(`"${k}" is unsafe for async rendering.`, `"${k}"는 비동기 렌더링에서 안전하지 않습니다.`));
    }
  }
});

rule('danger-with-children', {
  t: 'B', s: 'MA', debt: 5, ref: 'S6761', react: true, tags: ['jsx'],
  name: ['DOM elements should not use both "children" and "dangerouslySetInnerHTML"', 'DOM 요소에 "children"과 "dangerouslySetInnerHTML"을 같이 쓰면 안 됩니다'],
  why: ['React throws when an element has both children and dangerouslySetInnerHTML.', '요소에 children과 dangerouslySetInnerHTML이 함께 있으면 React가 오류를 냅니다.'],
  fix: ['Keep only one of them.', '둘 중 하나만 남기세요.'],
}, (ctx) => {
  for (const el of ctx.nodes('JSXElement')) {
    if (!U.attr(el, 'dangerouslySetInnerHTML')) continue;
    const kids = realChildren(el);
    if (kids.length || U.attr(el, 'children')) ctx.report(el.openingElement, m('Only set one of "children" or "dangerouslySetInnerHTML".', '"children"과 "dangerouslySetInnerHTML" 중 하나만 설정하세요.'));
  }
});

rule('is-mounted', {
  t: 'S', s: 'MA', debt: 10, ref: 'S6789', react: true, tags: ['obsolete'],
  name: ['React\'s "isMounted" should not be used', 'React의 "isMounted"를 쓰면 안 됩니다'],
  why: ['isMounted is an anti-pattern, unavailable in ES6 classes and removed from React.', 'isMounted는 안티 패턴이며 ES6 클래스에서 쓸 수 없고 React에서 제거되었습니다.'],
  fix: ['Cancel async work in componentWillUnmount instead.', '대신 componentWillUnmount에서 비동기 작업을 취소하세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    if (dottedName(call.callee) !== 'this.isMounted') continue;
    const cls = U.enclosingClass(call);
    if (cls && U.isClassComponent(cls)) ctx.report(call, m('Do not use isMounted().', 'isMounted()를 쓰지 마세요.'));
  }
});

rule('this-in-function-component', {
  t: 'B', s: 'MA', debt: 5, ref: 'S6757', react: true,
  name: ['"this" should not be used in functional components', '함수 컴포넌트에서 "this"를 쓰면 안 됩니다'],
  why: ['Function components have no instance; this.props and this.state are undefined there.', '함수 컴포넌트에는 인스턴스가 없어 this.props와 this.state가 undefined입니다.'],
  fix: ['Use the props parameter and hooks.', 'props 매개변수와 Hook을 쓰세요.'],
}, (ctx) => {
  for (const me of ctx.nodes('MemberExpression')) {
    if (me.object.type !== 'ThisExpression') continue;
    const p = propName(me);
    if (p !== 'props' && p !== 'state' && p !== 'context' && p !== 'setState') continue;
    const owner = U.thisOwner(me);
    if (owner && isFunction(owner) && owner.type !== 'ArrowFunctionExpression' && U.isFunctionComponent(owner) && !U.enclosingClass(me)) ctx.report(me, m(`"this.${p}" is used in a function component; use props / hooks instead.`, `함수 컴포넌트에서 "this.${p}"를 씁니다. props / Hook을 쓰세요.`));
    else if (!owner) {
      const fn = W.enclosingFunction(me);
      if (fn && fn.type === 'ArrowFunctionExpression' && U.isFunctionComponent(fn)) ctx.report(me, m(`"this.${p}" is used in a function component; use props / hooks instead.`, `함수 컴포넌트에서 "this.${p}"를 씁니다. props / Hook을 쓰세요.`));
    }
  }
});

const DOM_PROP_FIX = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', minlength: 'minLength', colspan: 'colSpan', rowspan: 'rowSpan', cellpadding: 'cellPadding', cellspacing: 'cellSpacing', contenteditable: 'contentEditable', crossorigin: 'crossOrigin', accesskey: 'accessKey', autocomplete: 'autoComplete', autofocus: 'autoFocus', enctype: 'encType', frameborder: 'frameBorder', novalidate: 'noValidate', spellcheck: 'spellCheck', srcset: 'srcSet', usemap: 'useMap', allowfullscreen: 'allowFullScreen', 'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin', 'fill-rule': 'fillRule', 'clip-rule': 'clipRule', 'stroke-dasharray': 'strokeDasharray', 'stroke-opacity': 'strokeOpacity', 'fill-opacity': 'fillOpacity', 'stop-color': 'stopColor', 'font-size': 'fontSize', 'text-anchor': 'textAnchor', 'xlink:href': 'href', 'clip-path': 'clipPath' };

rule('unknown-dom-property', {
  t: 'B', s: 'MI', debt: 2, ref: 'S6747', react: true, tags: ['jsx'],
  name: ['JSX DOM elements should use React property names', 'JSX DOM 요소에는 React 속성 이름을 써야 합니다'],
  why: ['React expects camelCase DOM properties (className, htmlFor, onClick); HTML spellings are ignored or warned about.', 'React는 camelCase DOM 속성(className, htmlFor, onClick)을 기대합니다. HTML 철자는 무시되거나 경고가 납니다.'],
  fix: ['Use the React property name.', 'React 속성 이름을 쓰세요.'],
}, (ctx) => {
  const imps = [...ctx.imports().values()].map((i) => i.source);
  if (!imps.some((s) => s === 'react' || s === 'react-dom' || s.startsWith('react-dom/'))) return;
  if (imps.some((s) => /^(preact|solid-js|@builder\.io\/qwik|vue|inferno)/.test(s))) return;
  for (const el of ctx.nodes('JSXElement')) {
    if (!U.isDomElement(el)) continue;
    for (const a of el.openingElement.attributes) {
      const n = U.attrName(a);
      if (!n) continue;
      let fix = DOM_PROP_FIX[n];
      if (!fix && /^on[a-z]+$/.test(n) && n.length > 3) fix = `on${n.charAt(2).toUpperCase()}${n.slice(3)}`;
      if (fix) ctx.report(a, m(`Unknown DOM property "${n}"; use "${fix}" instead.`, `알 수 없는 DOM 속성 "${n}"입니다. 대신 "${fix}"를 쓰세요.`));
    }
  }
});

rule('conditional-render-zero', {
  t: 'B', s: 'MA', debt: 5, ref: 'S6439', react: true, tags: ['jsx'],
  name: ['React components should not render non-boolean condition values', 'React 컴포넌트가 불리언이 아닌 조건 값을 렌더하면 안 됩니다'],
  why: ['"{items.length && <List />}" renders the digit 0 when the list is empty.', '"{items.length && <List />}"는 목록이 비면 숫자 0을 렌더합니다.'],
  fix: ['Compare explicitly: {items.length > 0 && <List />}.', '명시적으로 비교하세요: {items.length > 0 && <List />}.'],
}, (ctx) => {
  for (const c of ctx.nodes('JSXExpressionContainer')) {
    const e = unwrapTS(c.expression);
    if (!e || e.type !== 'LogicalExpression' || e.operator !== '&&') continue;
    let l = unwrapTS(e.left);
    while (l.type === 'LogicalExpression' && l.operator === '&&') l = unwrapTS(l.left);
    const isCount = (l.type === 'MemberExpression' && /^(length|size|count)$/.test(propName(l) || '')) || (l.type === 'Identifier' && /^(count|total|length|size|num[A-Z]\w*|\w+Count)$/.test(l.name));
    if (!isCount) continue;
    if (!U.isJsx(e.right) && e.right.type !== 'JSXElement') continue;
    ctx.report(e.left, m(`Convert "${ctx.text(e.left)}" to a boolean (e.g. "> 0"); 0 would be rendered.`, `"${ctx.text(e.left)}"를 불리언으로 바꾸세요 (예: "> 0"). 0이 렌더됩니다.`));
  }
});

rule('props-mutation', {
  t: 'B', s: 'MA', debt: 5, react: true,
  name: ['React props should not be mutated', 'React props를 바꾸면 안 됩니다'],
  why: ['Props belong to the parent; mutating them causes inconsistent renders and is ignored by React.', 'props는 부모의 것입니다. 바꾸면 렌더가 어긋나고 React는 이를 무시합니다.'],
  fix: ['Copy the value into local state or ask the parent to change it.', '값을 지역 상태로 복사하거나 부모에게 바꾸도록 요청하세요.'],
}, (ctx) => {
  for (const fn of ctx.functions()) {
    const p0 = fn.params[0];
    if (!p0 || p0.type !== 'Identifier' || p0.name !== 'props' || !U.isFunctionComponent(fn)) continue;
    const targetOf = (n) => unwrapTS(n.type === 'AssignmentExpression' ? n.left : n.type === 'UpdateExpression' ? n.argument : null);
    for (const a of U.findAll(fn.body, (n) => { const t = targetOf(n); return !!t && t.type === 'MemberExpression'; }, true)) {
      const left = targetOf(a);
      const dn = dottedName(left) || '';
      let base = unwrapTS(left.object);
      while (base && base.type === 'MemberExpression') base = unwrapTS(base.object);
      if (dn.startsWith('props.') && base && base.type === 'Identifier' && base._ref && base._ref.resolved === p0._var) ctx.report(a, m(`Do not mutate "${dn}"; props are read-only.`, `"${dn}"를 바꾸지 마세요. props는 읽기 전용입니다.`));
    }
  }
});

rule('jsx-undefined-component', {
  t: 'B', s: 'MA', debt: 5, react: true, tags: ['jsx'],
  name: ['JSX components should be defined or imported', 'JSX 컴포넌트는 정의하거나 가져와야 합니다'],
  why: ['Rendering an undeclared component throws a ReferenceError at runtime.', '선언하지 않은 컴포넌트를 렌더하면 실행 시 ReferenceError가 납니다.'],
  fix: ['Import or define the component.', '컴포넌트를 가져오거나 정의하세요.'],
}, (ctx) => {
  if (!ctx.isModule) return;
  const seen = new Set();
  for (const r of ctx.scope.through) {
    if (!r.id._jsx) continue;
    const n = r.id.name;
    if (seen.has(n) || /^(React|Fragment)$/.test(n)) continue;
    seen.add(n);
    ctx.report(r.id, m(`"${n}" is not defined; import or declare this component.`, `"${n}"가 정의되지 않았습니다. 이 컴포넌트를 가져오거나 선언하세요.`));
  }
});

rule('react-dangerous-html', {
  t: 'H', s: 'MA', debt: 10, ref: 'S6728', cwe: 'CWE-79', owasp: ['A03'], react: true, tags: ['xss'],
  name: ['Using "dangerouslySetInnerHTML" is security-sensitive', '"dangerouslySetInnerHTML" 사용은 보안에 민감합니다'],
  why: ['The HTML is inserted without escaping; any attacker-controlled part leads to XSS.', 'HTML이 이스케이프 없이 들어가 공격자가 만든 부분이 있으면 XSS가 됩니다.'],
  fix: ['Render text with JSX, or sanitize the HTML (e.g. DOMPurify) first.', 'JSX로 텍스트를 렌더하거나 먼저 HTML을 정화하세요 (예: DOMPurify).'],
}, (ctx) => {
  for (const el of ctx.nodes('JSXElement')) {
    const a = U.attr(el, 'dangerouslySetInnerHTML');
    if (!a || !a.value || a.value.type !== 'JSXExpressionContainer') continue;
    const o = unwrapTS(a.value.expression);
    let html = o;
    if (o.type === 'ObjectExpression') { const p = W.objectProp(o, '__html'); html = p ? unwrapTS(p.value) : null; }
    if (!html || W.isStringLike(html) && html.type !== 'TemplateLiteral') continue;
    if (html.type === 'TemplateLiteral' && !html.expressions.length) continue;
    if (html.type === 'CallExpression' && /sanitize|purify|escape/i.test(ctx.text(html.callee))) continue;
    ctx.report(a, m('Make sure that using dangerouslySetInnerHTML is safe here (the HTML is not escaped).', 'dangerouslySetInnerHTML 사용이 안전한지 확인하세요 (HTML이 이스케이프되지 않습니다).'));
  }
});

module.exports = { statePairs };
