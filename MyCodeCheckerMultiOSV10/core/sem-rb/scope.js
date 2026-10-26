'use strict';

// Local-variable resolution. Hard scopes: Program, Def, Class, Module, SClass.
// Soft scopes: Block, Lambda (see the enclosing locals). Every variable gets
//   { name, kind: 'param'|'local'|'blockparam'|'bind'|'rescue'|'for', decl, writes, reads, scope, captured }
// `captured` is true when the variable is used inside a block/lambda that is
// nested below the scope that declares it.

const { children } = require('./ast');

const HARD = new Set(['Program', 'Def', 'Class', 'Module', 'SClass']);
const SOFT = new Set(['Block', 'Lambda']);
const DYNAMIC = new Set(['binding', 'local_variables', 'eval', 'instance_eval', 'local_variable_get', 'local_variable_set']);

class VScope {
  constructor(node, parent) {
    this.node = node;
    this.parent = parent;
    this.hard = HARD.has(node.type);
    this.vars = new Map();
    this.children = [];
    this.dynamic = false; // uses binding / eval
    if (parent) parent.children.push(this);
  }
  lookup(name) {
    for (let s = this; s; s = s.parent) {
      if (s.vars.has(name)) return s.vars.get(name);
      if (s.hard) return null;
    }
    return null;
  }
  hardScope() { let s = this; while (s && !s.hard) s = s.parent; return s; }
}

function buildScopes(program) {
  const root = new VScope(program, null);
  const all = [root];
  const byNode = new Map([[program, root]]);

  const define = (scope, name, kind, decl) => {
    const v = { name, kind, decl, writes: [], reads: [], scope, captured: false };
    scope.vars.set(name, v);
    return v;
  };
  const write = (scope, ident, kind = 'local') => {
    if (!ident || ident.type !== 'Ident') return null;
    let v = scope.lookup(ident.name);
    if (!v) v = define(scope, ident.name, kind, ident);
    v.writes.push(ident);
    ident._var = v;
    if (v.scope !== scope) markCaptured(scope, v);
    return v;
  };
  const read = (scope, ident) => {
    const v = scope.lookup(ident.name);
    if (!v) return null;
    v.reads.push(ident);
    ident._var = v;
    if (v.scope !== scope) markCaptured(scope, v);
    return v;
  };
  const markCaptured = (scope, v) => {
    for (let s = scope; s && s !== v.scope; s = s.parent) if (!s.hard && SOFT.has(s.node.type)) { v.captured = true; return; }
  };

  const params = (scope, list, kind) => {
    for (const p of list || []) {
      if (p.kind === 'destructure') { params(scope, p.inner, kind); continue; }
      if (p.name) {
        const v = define(scope, p.name, kind, p);
        v.paramKind = p.kind;
        p._var = v;
      }
    }
  };
  const paramDefaults = (scope, list) => {
    for (const p of list || []) {
      if (p.default) visit(p.default, scope);
      if (p.inner) paramDefaults(scope, p.inner);
    }
  };

  const target = (t, scope, kind) => {
    if (!t) return;
    if (t.type === 'Ident') write(scope, t, kind);
    else if (t.type === 'Splat') target(t.e, scope, kind);
    else if (t.type === 'Mlhs') for (const x of t.targets) target(x, scope, kind);
    else visit(t, scope); // ivar / attr / index targets: visit receivers
  };

  function visit(n, scope) {
    if (!n || typeof n !== 'object') return;
    switch (n.type) {
      case 'Def': case 'Class': case 'Module': case 'SClass': case 'Program': {
        if (n.type === 'Class' && n.superclass) visit(n.superclass, scope);
        if (n.type === 'SClass') visit(n.target, scope);
        if (n.type === 'Def' && n.singleton) visit(n.singleton, scope);
        const s = new VScope(n, scope);
        all.push(s);
        byNode.set(n, s);
        if (n.type === 'Def') { params(s, n.params, 'param'); paramDefaults(s, n.params); }
        for (const st of n.body || []) visit(st, s);
        return;
      }
      case 'Block': case 'Lambda': {
        const s = new VScope(n, scope);
        all.push(s);
        byNode.set(n, s);
        params(s, n.params, 'blockparam');
        paramDefaults(s, n.params);
        for (const st of n.body || []) visit(st, s);
        return;
      }
      case 'Ident':
        if (n.bind) { write(scope, n, 'bind'); return; }
        if (n.lvar || scope.lookup(n.name)) read(scope, n);
        else if (DYNAMIC.has(n.name)) markDynamic(scope);
        return;
      case 'Call':
        if (!n.recv && DYNAMIC.has(n.name)) markDynamic(scope);
        if (n.recv) visit(n.recv, scope);
        for (const a of n.args) visit(a, scope);
        if (n.block) visit(n.block, scope);
        return;
      case 'ZSuper':
        markZsuper(scope);
        if (n.block) visit(n.block, scope);
        return;
      case 'Assign':
        if (n.target.type === 'Ident') {
          if (n.op !== '=') {
            const v = scope.lookup(n.target.name);
            if (v) { v.reads.push(n.target); n.target._readToo = true; }
          }
          // Ruby declares the local before evaluating the right-hand side (x = x is nil)
          if (!scope.lookup(n.target.name)) define(scope, n.target.name, 'local', n.target);
          visit(n.value, scope);
          write(scope, n.target);
          return;
        }
        visit(n.target, scope);
        visit(n.value, scope);
        return;
      case 'MultiAssign':
        visit(n.value, scope);
        for (const t of n.targets) target(t, scope);
        return;
      case 'For':
        visit(n.iter, scope);
        for (const t of n.vars) target(t, scope, 'for');
        for (const st of n.body) visit(st, scope);
        return;
      case 'Rescue':
        for (const c of n.classes) visit(c, scope);
        if (n.var) target(n.var, scope, 'rescue');
        for (const st of n.body) visit(st, scope);
        return;
      default:
        for (const c of children(n)) visit(c, scope);
    }
  }

  function markDynamic(scope) { for (let s = scope; s; s = s.parent) { s.dynamic = true; if (s.hard) break; } }
  function markZsuper(scope) { const h = scope.hardScope(); if (h) h.zsuper = true; }

  for (const st of program.body) visit(st, root);
  return { root, all, byNode };
}

module.exports = { buildScopes, VScope };
