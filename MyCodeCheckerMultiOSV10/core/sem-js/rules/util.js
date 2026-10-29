'use strict';

// Helpers shared by the rule modules.

const W = require('../walk');

const { unwrapTS, propName, dottedName, staticValue, isFunction } = W;

// ---- JSX
function elementName(el) {
  const n = el.type === 'JSXElement' ? el.openingElement.name : el.name;
  if (!n) return '';
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return `${elementName({ name: n.object })}.${n.property.name}`;
  if (n.type === 'JSXNamespacedName') return `${n.namespace.name}:${n.name.name}`;
  return '';
}

function isDomElement(el) {
  const name = elementName(el);
  return /^[a-z]/.test(name) && !name.includes('.') && !name.includes(':') && !name.includes('-');
}

function attrName(a) {
  if (a.type !== 'JSXAttribute') return null;
  return a.name.type === 'JSXIdentifier' ? a.name.name : `${a.name.namespace.name}:${a.name.name.name}`;
}

function attr(el, name) {
  const attrs = el.type === 'JSXElement' ? el.openingElement.attributes : el.attributes;
  const lower = name.toLowerCase();
  for (let i = attrs.length - 1; i >= 0; i--) {
    const a = attrs[i];
    if (a.type === 'JSXAttribute' && String(attrName(a)).toLowerCase() === lower) return a;
  }
  return null;
}

function hasSpreadAttr(el) {
  const attrs = el.type === 'JSXElement' ? el.openingElement.attributes : el.attributes;
  return attrs.some((a) => a.type === 'JSXSpreadAttribute');
}

// Static value of a JSX attribute: { value } (true for bare attributes) or
// { dynamic: true } or null when absent.
function attrValue(a) {
  if (!a) return null;
  if (!a.value) return { value: true };
  if (a.value.type === 'Literal') return { value: a.value.value };
  if (a.value.type === 'JSXExpressionContainer') {
    const e = a.value.expression;
    if (e.type === 'JSXEmptyExpression') return { dynamic: true };
    const v = staticValue(e);
    if (v) return { value: v.value };
    return { dynamic: true, expr: e };
  }
  return { dynamic: true };
}

function jsxText(el) {
  let s = '';
  for (const c of el.children || []) {
    if (c.type === 'JSXText') s += c.value;
    else if (c.type === 'JSXExpressionContainer' && c.expression.type !== 'JSXEmptyExpression') s += '{x}';
    else if (c.type === 'JSXElement' || c.type === 'JSXFragment') s += jsxText(c) || '<x>';
  }
  return s;
}

function hasAccessibleChild(el) {
  for (const c of el.children || []) {
    if (c.type === 'JSXText' && c.value.trim()) return true;
    if (c.type === 'JSXExpressionContainer' && c.expression.type !== 'JSXEmptyExpression') return true;
    if (c.type === 'JSXElement') {
      const h = attr(c, 'aria-hidden');
      const hv = attrValue(h);
      if (hv && hv.value === true) continue;
      if (!isDomElement(c) || hasAccessibleChild(c) || attr(c, 'alt') || attr(c, 'aria-label')) return true;
    }
    if (c.type === 'JSXFragment' && hasAccessibleChild(c)) return true;
  }
  return false;
}

// ---- React components & hooks
function isComponentName(name) {
  return !!name && /^[A-Z]/.test(name);
}
function isHookName(name) {
  return !!name && /^use[A-Z0-9]/.test(name);
}

function returnsJsx(fn) {
  if (!fn.body) return false;
  if (fn.body.type !== 'BlockStatement') {
    const b = unwrapTS(fn.body);
    return b.type === 'JSXElement' || b.type === 'JSXFragment' || (b.type === 'ConditionalExpression' && (isJsx(b.consequent) || isJsx(b.alternate))) || (b.type === 'LogicalExpression' && isJsx(b.right));
  }
  let found = false;
  W.walk(fn.body, (n) => {
    if (found) return false;
    if (n !== fn.body && isFunction(n)) return false;
    if (n.type === 'ReturnStatement' && n.argument && isJsx(n.argument)) found = true;
    return undefined;
  });
  return found;
}

function isJsx(n) {
  n = unwrapTS(n);
  if (!n) return false;
  if (n.type === 'JSXElement' || n.type === 'JSXFragment') return true;
  if (n.type === 'ConditionalExpression') return isJsx(n.consequent) || isJsx(n.alternate);
  if (n.type === 'LogicalExpression') return isJsx(n.right) || isJsx(n.left);
  return false;
}

// Function component: capitalized function returning JSX (incl. memo/forwardRef wrappers).
function componentName(fn) {
  const name = W.functionName(fn);
  if (name && isComponentName(name)) return name;
  let p = fn.parent;
  if (p && p.type === 'CallExpression') {
    const cn = W.calleeProp(p);
    if (cn === 'memo' || cn === 'forwardRef') {
      const d = p.parent;
      if (d && d.type === 'VariableDeclarator' && d.id.type === 'Identifier' && isComponentName(d.id.name)) return d.id.name;
      if (d && d.type === 'ExportDefaultDeclaration') return 'default';
      p = d;
    }
  }
  return null;
}

function isFunctionComponent(fn) {
  if (!isFunction(fn)) return false;
  const name = componentName(fn);
  return !!name && returnsJsx(fn);
}

function isHookCall(call) {
  if (call.type !== 'CallExpression') return false;
  const c = unwrapTS(call.callee);
  if (c.type === 'Identifier') return isHookName(c.name);
  if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' && /^[A-Z]/.test(c.object.name)) return isHookName(c.property.name);
  return false;
}

function isReactFile(ctx) {
  for (const imp of ctx.imports().values()) if (/^(?:react|react-dom|react-native|preact)(?:\/|$)/.test(imp.source)) return true;
  return ctx.scope.hasJsx;
}

function isClassComponent(cls) {
  if (!cls || !cls.superClass) return false;
  const n = dottedName(cls.superClass);
  return !!n && /(^|\.)(Pure)?Component$/.test(n);
}

function enclosingClass(node) {
  let p = node.parent;
  while (p) {
    if (p.type === 'ClassDeclaration' || p.type === 'ClassExpression') return p;
    p = p.parent;
  }
  return null;
}

// Nearest enclosing function that is not an arrow (owner of `this`).
function thisOwner(node) {
  let p = node.parent;
  while (p) {
    if (p.type === 'FunctionDeclaration' || p.type === 'FunctionExpression') return p;
    if (p.type === 'ClassBody' || p.type === 'PropertyDefinition') return p;
    p = p.parent;
  }
  return null;
}

// Does the subtree (not entering nested functions) contain a node matching pred?
function contains(root, pred, enterFunctions) {
  let found = false;
  W.walk(root, (n) => {
    if (found) return false;
    if (n !== root && !enterFunctions && isFunction(n)) return false;
    if (pred(n)) { found = true; return false; }
    return undefined;
  });
  return found;
}

function findAll(root, pred, enterFunctions) {
  const out = [];
  W.walk(root, (n) => {
    if (n !== root && !enterFunctions && isFunction(n)) return false;
    if (pred(n)) out.push(n);
    return undefined;
  });
  return out;
}

function usesThis(fn) {
  return contains(fn.body, (n) => n.type === 'ThisExpression' || n.type === 'Super', false)
    || contains(fn.body, (n) => isFunction(n) && n.type === 'ArrowFunctionExpression' && contains(n.body, (x) => x.type === 'ThisExpression' || x.type === 'Super', false), false);
}

// Callback passed directly to a call? returns { call, index }
function callbackOf(fn) {
  const p = fn.parent;
  if (p && (p.type === 'CallExpression' || p.type === 'NewExpression')) {
    const i = p.arguments.indexOf(fn);
    if (i >= 0) return { call: p, index: i };
  }
  return null;
}

function isStatementPosition(node) {
  const p = node.parent;
  return !!p && p.type === 'ExpressionStatement';
}

// Value-consuming position? (not statement, not void, not discarded sequence part)
function isValueUsed(node) {
  let n = node;
  let p = n.parent;
  while (p && (p.type === 'ChainExpression' || p.type === 'TSAsExpression' || p.type === 'TSNonNullExpression' || p.type === 'AwaitExpression')) { n = p; p = p.parent; }
  if (!p) return false;
  if (p.type === 'ExpressionStatement') return false;
  if (p.type === 'UnaryExpression' && p.operator === 'void') return false;
  if (p.type === 'SequenceExpression' && p.expressions[p.expressions.length - 1] !== n) return false;
  if (p.type === 'ForStatement' && (p.init === n || p.update === n)) return false;
  if (p.type === 'LogicalExpression' && p.right === n) return isValueUsed(p);
  if (p.type === 'ConditionalExpression' && p.test !== n) return isValueUsed(p);
  return true;
}

function stringOf(n) {
  const v = staticValue(n);
  return v && typeof v.value === 'string' ? v.value : null;
}

function numberOf(n) {
  const v = staticValue(n);
  return v && typeof v.value === 'number' ? v.value : null;
}

// Last-resort argument lookup for options objects: call(..., { key: value })
function optionsProp(call, name) {
  for (const a of call.arguments) {
    const o = unwrapTS(a);
    if (o && o.type === 'ObjectExpression') {
      const p = W.objectProp(o, name);
      if (p) return p;
    }
  }
  return null;
}

// Value node of an object literal property, following one level of
// `const opts = {...}` indirection.
function resolveObject(ctx, node) {
  node = unwrapTS(node);
  if (!node) return null;
  if (node.type === 'ObjectExpression') return node;
  if (node.type === 'Identifier') {
    const v = ctx.varOf(node);
    if (v && v.defs.length === 1 && v.defs[0].kind === 'const' && v.defs[0].node.type === 'VariableDeclarator' && v.defs[0].node.id.type === 'Identifier') {
      const init = unwrapTS(v.defs[0].node.init);
      if (init && init.type === 'ObjectExpression') return init;
    }
  }
  return null;
}

function constValue(ctx, node) {
  const v = staticValue(node, (id) => {
    const variable = ctx.varOf(id);
    if (variable && variable.defs.length === 1 && variable.defs[0].kind === 'const' && variable.defs[0].node.type === 'VariableDeclarator' && variable.defs[0].node.id.type === 'Identifier' && variable.defs[0].node.init) {
      const init = variable.defs[0].node.init;
      if (init.type === 'Literal' || init.type === 'TemplateLiteral' || init.type === 'UnaryExpression') return staticValue(init);
    }
    return null;
  });
  return v;
}

function constString(ctx, node) {
  const v = constValue(ctx, node);
  return v && typeof v.value === 'string' ? v.value : null;
}

function isTestFile(ctx) {
  return /(^|[/\\])(__tests__|tests?|spec)[/\\]|\.(test|spec)\.[cm]?[jt]sx?$/i.test(ctx.file);
}

function m(en, ko) { return { en, ko }; }

module.exports = {
  elementName, isDomElement, attrName, attr, attrValue, hasSpreadAttr, jsxText, hasAccessibleChild,
  isComponentName, isHookName, returnsJsx, isJsx, componentName, isFunctionComponent, isHookCall, isReactFile, isClassComponent,
  enclosingClass, thisOwner, contains, findAll, usesThis, callbackOf, isStatementPosition, isValueUsed, stringOf, numberOf,
  optionsProp, resolveObject, constValue, constString, isTestFile, m,
};
