'use strict';

// AST helpers: parent links, a per-type node index, structural equality,
// static values and small predicates shared by the rules.

function isNode(v) {
  return v !== null && typeof v === 'object' && typeof v.type === 'string';
}

// Child nodes in source order (keys are created in source order by the parser).
function children(node) {
  const out = [];
  for (const key in node) {
    if (key === 'parent' || key === 'comments' || key.charCodeAt(0) === 95 /* _ */) continue;
    const v = node[key];
    if (v === null || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      for (const x of v) if (isNode(x)) out.push(x);
    } else if (typeof v.type === 'string') out.push(v);
  }
  return out;
}

// One pass: parent pointers, depth-first order index, nodes by type.
function prepare(ast) {
  const byType = new Map();
  const order = [];
  const stack = [ast];
  ast.parent = null;
  while (stack.length) {
    const node = stack.pop();
    node._i = order.length;
    order.push(node);
    let list = byType.get(node.type);
    if (!list) { list = []; byType.set(node.type, list); }
    list.push(node);
    const kids = children(node);
    for (let i = kids.length - 1; i >= 0; i--) {
      const k = kids[i];
      k.parent = node;
      stack.push(k);
    }
  }
  return { byType, order };
}

function walk(node, enter, parent) {
  if (!node) return;
  if (enter(node, parent) === false) return;
  for (const c of children(node)) walk(c, enter, node);
}

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
function isFunction(n) {
  return !!n && FUNCTION_TYPES.has(n.type);
}

function enclosingFunction(node) {
  let p = node.parent;
  while (p) {
    if (isFunction(p)) return p;
    p = p.parent;
  }
  return null;
}

// Strip parentheses-free wrappers that do not change runtime value.
function unwrapTS(n) {
  while (n && (n.type === 'TSAsExpression' || n.type === 'TSNonNullExpression' || n.type === 'TSSatisfiesExpression' || n.type === 'TSTypeAssertion' || n.type === 'TSInstantiationExpression')) n = n.expression;
  return n;
}

const SKIP_EQ = new Set(['start', 'end', 'parent', 'parenthesized', 'parenStart', 'parenEnd', 'raw', 'comments', 'typeAnnotation', 'typeArguments', 'returnType', 'typeParameters', 'decorators', 'optional']);

// Structural equality of two subtrees ignoring positions and type annotations.
function equal(a, b) {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!equal(a[i], b[i])) return false;
    return true;
  }
  if (a.type !== b.type) return false;
  if (a.type === 'Literal') {
    if (a.regex || b.regex) return !!a.regex && !!b.regex && a.regex.pattern === b.regex.pattern && a.regex.flags === b.regex.flags;
    if (a.bigint || b.bigint) return a.bigint === b.bigint;
    return a.value === b.value || (Number.isNaN(a.value) && Number.isNaN(b.value));
  }
  for (const key in a) {
    if (SKIP_EQ.has(key) || key.charCodeAt(0) === 95) continue;
    const va = a[key];
    const vb = b[key];
    if (va === vb) continue;
    if (va === null || vb === null || typeof va !== 'object' || typeof vb !== 'object') {
      if (va !== vb && !(va == null && vb == null)) return false;
      continue;
    }
    if (!equal(va, vb)) return false;
  }
  for (const key in b) {
    if (SKIP_EQ.has(key) || key.charCodeAt(0) === 95) continue;
    if (!(key in a) && b[key] != null && b[key] !== false) return false;
  }
  return true;
}

// Compact structural hash (for grouping candidates before equal()).
function hash(n, depth = 0) {
  if (!n || typeof n !== 'object') return String(n);
  if (Array.isArray(n)) return `[${n.map((x) => hash(x, depth + 1)).join(',')}]`;
  if (depth > 6) return n.type;
  switch (n.type) {
    case 'Identifier': return `I:${n.name}`;
    case 'Literal': return `L:${n.regex ? n.raw : String(n.value)}`;
    default: {
      const parts = [n.type];
      for (const c of children(n)) parts.push(hash(c, depth + 1));
      if (n.operator) parts.push(n.operator);
      return `${parts.join('(')})`;
    }
  }
}

// Static value of simple constant expressions. Returns { value } or null.
function staticValue(n, scopeLookup) {
  n = unwrapTS(n);
  if (!n) return null;
  switch (n.type) {
    case 'Literal':
      if (n.regex) return null;
      if (n.bigint != null) return { value: BigInt(n.bigint) };
      return { value: n.value };
    case 'TemplateLiteral': {
      let s = '';
      for (let i = 0; i < n.quasis.length; i++) {
        if (n.quasis[i].value.cooked == null) return null;
        s += n.quasis[i].value.cooked;
        if (i < n.expressions.length) {
          const v = staticValue(n.expressions[i], scopeLookup);
          if (!v) return null;
          s += String(v.value);
        }
      }
      return { value: s };
    }
    case 'UnaryExpression': {
      const v = staticValue(n.argument, scopeLookup);
      if (!v) return null;
      switch (n.operator) {
        case '-': return typeof v.value === 'bigint' ? { value: -v.value } : { value: -v.value };
        case '+': return typeof v.value === 'bigint' ? null : { value: +v.value };
        case '!': return { value: !v.value };
        case '~': return typeof v.value === 'number' ? { value: ~v.value } : null;
        case 'typeof': return { value: v.value === null ? 'object' : typeof v.value };
        case 'void': return { value: undefined };
        default: return null;
      }
    }
    case 'BinaryExpression': {
      const l = staticValue(n.left, scopeLookup);
      if (!l) return null;
      const r = staticValue(n.right, scopeLookup);
      if (!r) return null;
      const a = l.value;
      const b = r.value;
      if (typeof a === 'bigint' || typeof b === 'bigint') {
        if (typeof a !== typeof b) return null;
      }
      try {
        switch (n.operator) {
          case '+': return { value: a + b };
          case '-': return { value: a - b };
          case '*': return { value: a * b };
          case '/': return { value: a / b };
          case '%': return { value: a % b };
          case '**': return { value: a ** b };
          case '|': return { value: a | b };
          case '&': return { value: a & b };
          case '^': return { value: a ^ b };
          case '<<': return { value: a << b };
          case '>>': return { value: a >> b };
          case '>>>': return { value: a >>> b };
          case '===': return { value: a === b };
          case '!==': return { value: a !== b };
          case '==': return { value: a == b }; // eslint-disable-line eqeqeq
          case '!=': return { value: a != b }; // eslint-disable-line eqeqeq
          case '<': return { value: a < b };
          case '>': return { value: a > b };
          case '<=': return { value: a <= b };
          case '>=': return { value: a >= b };
          default: return null;
        }
      } catch {
        return null;
      }
    }
    case 'LogicalExpression': {
      const l = staticValue(n.left, scopeLookup);
      if (!l) return null;
      if (n.operator === '&&') return l.value ? staticValue(n.right, scopeLookup) : l;
      if (n.operator === '||') return l.value ? l : staticValue(n.right, scopeLookup);
      return l.value == null ? staticValue(n.right, scopeLookup) : l;
    }
    case 'Identifier':
      if (n.name === 'undefined') return { value: undefined };
      if (n.name === 'NaN') return { value: NaN };
      if (n.name === 'Infinity') return { value: Infinity };
      if (scopeLookup) return scopeLookup(n);
      return null;
    default:
      return null;
  }
}

function stringValue(n) {
  const v = staticValue(n);
  return v && typeof v.value === 'string' ? v.value : null;
}

function isLiteral(n, value) {
  n = unwrapTS(n);
  return !!n && n.type === 'Literal' && !n.regex && (arguments.length < 2 || n.value === value);
}

function isUndefined(n) {
  n = unwrapTS(n);
  return !!n && ((n.type === 'Identifier' && n.name === 'undefined') || (n.type === 'UnaryExpression' && n.operator === 'void' && isLiteral(n.argument)));
}

function isNullish(n) {
  return isLiteral(n, null) || isUndefined(n);
}

// Name of a non-computed / string-literal member property.
function propName(m) {
  if (!m) return null;
  if (m.type === 'MemberExpression' || m.type === 'Property' || m.type === 'MethodDefinition' || m.type === 'PropertyDefinition' || m.type === 'TSPropertySignature' || m.type === 'TSMethodSignature') {
    const k = m.type === 'MemberExpression' ? m.property : m.key;
    if (!m.computed) {
      if (k.type === 'Identifier' || k.type === 'PrivateIdentifier') return k.type === 'PrivateIdentifier' ? `#${k.name}` : k.name;
      if (k.type === 'Literal') return String(k.value);
      return null;
    }
    const v = staticValue(k);
    return v && (typeof v.value === 'string' || typeof v.value === 'number') ? String(v.value) : null;
  }
  return null;
}

function keyName(k, computed) {
  if (!k) return null;
  if (!computed) {
    if (k.type === 'Identifier') return k.name;
    if (k.type === 'PrivateIdentifier') return `#${k.name}`;
    if (k.type === 'Literal') return String(k.value);
    return null;
  }
  const v = staticValue(k);
  return v && (typeof v.value === 'string' || typeof v.value === 'number') ? String(v.value) : null;
}

// 'a.b.c' for identifier / this member chains, else null.
function dottedName(n) {
  n = unwrapTS(n);
  if (!n) return null;
  if (n.type === 'Identifier') return n.name;
  if (n.type === 'ThisExpression') return 'this';
  if (n.type === 'Super') return 'super';
  if (n.type === 'MemberExpression') {
    const o = dottedName(n.object);
    const p = propName(n);
    if (o == null || p == null) return null;
    return `${o}.${p}`;
  }
  if (n.type === 'ChainExpression') return dottedName(n.expression);
  return null;
}

function calleeName(call) {
  return call && (call.type === 'CallExpression' || call.type === 'NewExpression') ? dottedName(call.callee) : null;
}

// Last segment of the callee: foo() -> foo, a.b.foo() -> foo.
function calleeProp(call) {
  if (!call || (call.type !== 'CallExpression' && call.type !== 'NewExpression')) return null;
  const c = unwrapTS(call.callee);
  if (!c) return null;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression') return propName(c);
  return null;
}

function objectProp(obj, name) {
  obj = unwrapTS(obj);
  if (!obj || obj.type !== 'ObjectExpression') return null;
  for (let i = obj.properties.length - 1; i >= 0; i--) {
    const p = obj.properties[i];
    if (p.type === 'Property' && propName(p) === name) return p;
  }
  return null;
}

function hasSpread(obj) {
  return obj && obj.type === 'ObjectExpression' && obj.properties.some((p) => p.type === 'SpreadElement');
}

// Identifiers bound by a pattern.
function patternIds(p, out = []) {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.push(p); break;
    case 'ObjectPattern': for (const prop of p.properties) patternIds(prop.type === 'RestElement' ? prop.argument : prop.value, out); break;
    case 'ArrayPattern': for (const e of p.elements) patternIds(e, out); break;
    case 'RestElement': patternIds(p.argument, out); break;
    case 'AssignmentPattern': patternIds(p.left, out); break;
    case 'TSParameterProperty': patternIds(p.parameter, out); break;
    default: break;
  }
  return out;
}

function isInLoop(node, stopAtFunction = true) {
  let p = node.parent;
  let child = node;
  while (p) {
    if (stopAtFunction && isFunction(p)) return false;
    if ((p.type === 'ForStatement' && (child === p.body || child === p.test || child === p.update))
      || ((p.type === 'ForInStatement' || p.type === 'ForOfStatement') && child === p.body)
      || p.type === 'WhileStatement' || p.type === 'DoWhileStatement') return true;
    child = p;
    p = p.parent;
  }
  return false;
}

// Does the statement list / statement always complete abruptly?
function alwaysJumps(s) {
  if (!s) return false;
  switch (s.type) {
    case 'ReturnStatement': case 'ThrowStatement': case 'BreakStatement': case 'ContinueStatement': return true;
    case 'BlockStatement': return s.body.some(alwaysJumps);
    case 'IfStatement': return !!s.alternate && alwaysJumps(s.consequent) && alwaysJumps(s.alternate);
    case 'TryStatement':
      if (s.finalizer && alwaysJumps(s.finalizer)) return true;
      return alwaysJumps(s.block) && (!s.handler || alwaysJumps(s.handler.body));
    default: return false;
  }
}

function lastStatement(s) {
  if (!s) return null;
  if (s.type === 'BlockStatement') return s.body.length ? lastStatement(s.body[s.body.length - 1]) : null;
  return s;
}

function isStringLike(n) {
  n = unwrapTS(n);
  return !!n && ((n.type === 'Literal' && typeof n.value === 'string') || n.type === 'TemplateLiteral');
}

// Strict / function body statements.
function functionBody(fn) {
  if (!fn || !fn.body) return [];
  return fn.body.type === 'BlockStatement' ? fn.body.body : null;
}

function functionName(fn) {
  if (!fn) return null;
  if (fn.id) return fn.id.name;
  const p = fn.parent;
  if (!p) return null;
  if (p.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name;
  if (p.type === 'MethodDefinition' || p.type === 'Property' || p.type === 'PropertyDefinition') return keyName(p.key, p.computed);
  if (p.type === 'AssignmentExpression') return dottedName(p.left);
  return null;
}

module.exports = {
  isNode, children, prepare, walk, isFunction, enclosingFunction, unwrapTS, equal, hash, staticValue, stringValue,
  isLiteral, isUndefined, isNullish, propName, keyName, dottedName, calleeName, calleeProp, objectProp, hasSpread,
  patternIds, isInLoop, alwaysJumps, lastStatement, isStringLike, functionBody, functionName, FUNCTION_TYPES,
};
