'use strict';

// Helpers shared by the AST rules.

const { FUNC_TYPES, dotted, children, isNone, walkLocal } = require('../ast');
const { BUILTIN } = require('../scope');
const { EXC_BUILTINS } = require('../project');

// call target name: qualified when imported, dotted otherwise
function callName(c, call) {
  if (!call || call.type !== 'Call') return null;
  return c.q(call.func) || dotted(call.func);
}

// qualified name when resolvable, else null
function qcall(c, call) {
  if (!call || call.type !== 'Call') return null;
  return c.q(call.func);
}

function lastPart(name) {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  return i < 0 ? name : name.slice(i + 1);
}

function enclosingFn(n) {
  let p = n.parent;
  while (p) {
    if (FUNC_TYPES.has(p.type)) return p;
    if (p.type === 'Lambda' || p.type === 'ClassDef' || p.type === 'Module') return p.type === 'Lambda' ? p : null;
    p = p.parent;
  }
  return null;
}

// nearest FunctionDef (skipping lambdas)
function enclosingDef(n) {
  let p = n.parent;
  while (p) {
    if (FUNC_TYPES.has(p.type)) return p;
    if (p.type === 'ClassDef' || p.type === 'Module') return null;
    p = p.parent;
  }
  return null;
}

function inAsync(n) {
  const f = enclosingFn(n);
  return !!f && f.type === 'AsyncFunctionDef';
}

function within(n, anc) {
  for (let p = n; p; p = p.parent) if (p === anc) return true;
  return false;
}

// literal string value (Constant str/bytes or f-string without fields)
function strValue(e) {
  if (!e) return null;
  if (e.type === 'Constant' && (e.kind === 'str' || e.kind === 'bytes')) return e.value;
  if (e.type === 'JoinedStr' && !e.values.some((v) => v.type === 'FormattedValue')) return e.values.map((v) => v.value).join('');
  return null;
}

// true when the node sits in a try body whose handlers catch one of `names`
function caughtBy(n, names) {
  let child = n;
  let p = n.parent;
  while (p && !FUNC_TYPES.has(p.type) && p.type !== 'Lambda' && p.type !== 'Module') {
    if ((p.type === 'Try' || p.type === 'TryStar') && p.body.includes(child)) {
      for (const h of p.handlers) {
        if (!h.etype) return true;
        const ts = h.etype.type === 'Tuple' ? h.etype.elts : [h.etype];
        for (const t of ts) if (names.includes(lastPart(dotted(t) || ''))) return true;
      }
    }
    if ((p.type === 'With' || p.type === 'AsyncWith') && p.items.some((it) => it.context_expr.type === 'Call' && /(?:^|\.)(?:raises|assertRaises|assertRaisesRegex|suppress)$/.test(dotted(it.context_expr.func) || ''))) return true;
    child = p;
    p = p.parent;
  }
  return false;
}

function insideTypeContext(n) {
  // annotations and typing subscripts
  let child = n;
  let p = n.parent;
  while (p) {
    if (p.type === 'arg' && p.annotation === child) return true;
    if ((p.type === 'FunctionDef' || p.type === 'AsyncFunctionDef') && p.returns === child) return true;
    if (p.type === 'AnnAssign' && p.annotation === child) return true;
    if (p.type === 'TypeAlias') return true;
    if (FUNC_TYPES.has(p.type) || p.type === 'ClassDef' || p.type === 'Module') return false;
    child = p;
    p = p.parent;
  }
  return false;
}

function isBuiltinName(e, name) {
  return e && e.type === 'Name' && e.sym === BUILTIN && (!name || e.id === name);
}

function nameOfExc(e) {
  return lastPart(dotted(e.type === 'Call' ? e.func : e) || '');
}

// statements of a body ignoring docstring
function bodyNoDoc(body) {
  const f = body[0];
  if (f && f.type === 'Expr' && f.value.type === 'Constant' && f.value.kind === 'str') return body.slice(1);
  return body;
}

function isEmptyBody(body) {
  const b = bodyNoDoc(body);
  return b.length === 0 || b.every((s) => s.type === 'Pass' || (s.type === 'Expr' && s.value.type === 'Constant' && s.value.kind === 'Ellipsis'));
}

// comment lines strictly inside a node's span (or on its first line after code)
function hasCommentIn(c, node) {
  for (const cm of c.comments) if (cm.line >= node.line && cm.line <= (node.endLine || node.line)) return true;
  return false;
}

function containsNode(root, pred) {
  let hit = false;
  const visit = (n) => {
    if (hit || !n) return;
    if (pred(n)) { hit = true; return; }
    for (const ch of children(n)) visit(ch);
  };
  visit(root);
  return hit;
}

function containsLocal(root, pred) {
  let hit = false;
  walkLocal(root, (n) => { if (hit) return false; if (pred(n)) { hit = true; return false; } return true; }, true);
  return hit;
}

function fnParams(fn) {
  const a = fn.args;
  return [...a.posonlyargs, ...a.args];
}

module.exports = {
  callName, qcall, lastPart, enclosingFn, enclosingDef, inAsync, within, strValue, caughtBy, insideTypeContext, isBuiltinName, nameOfExc,
  bodyNoDoc, isEmptyBody, hasCommentIn, containsNode, containsLocal, fnParams, EXC_BUILTINS, isNone, dotted,
};
