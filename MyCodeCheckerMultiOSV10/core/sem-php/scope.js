'use strict';

// Function scopes and local variable symbols. PHP variables are function
// scoped: every FuncDecl / Method / Closure / ArrowFn and the top-level script
// get one Scope. Closures see outer variables only through `use (...)`; arrow
// functions capture outer variables by value automatically.

const { forEachChild, FUNC_KINDS, strVal, callName, unparen } = require('./ast');

const SUPERGLOBALS = new Set(['GLOBALS', '_SERVER', '_GET', '_POST', '_FILES', '_COOKIE', '_SESSION', '_REQUEST', '_ENV', 'this', 'http_response_header', 'argc', 'argv', 'php_errormsg', 'HTTP_RAW_POST_DATA']);
const DYNAMIC_CALLS = new Set(['extract', 'get_defined_vars', 'eval', 'parse_str', 'func_get_args', 'func_get_arg', 'mb_parse_str']);

class Sym {
  constructor(name, scope, kind) {
    this.name = name;
    this.scope = scope;
    this.kind = kind; // param | local | global | static | use | catch | foreach
    this.reads = 0;
    this.writes = 0;
    this.defs = [];
    this.refs = [];
    this.alias = false;
    this.decl = null;
  }
}

class Scope {
  constructor(node, parent) {
    this.node = node;
    this.parent = parent;
    this.vars = new Map();
    this.dynamic = false;
    this.isTop = node.k === 'Program';
    this.hasGoto = false;
    this.hasFuncGetArgs = false;
    this.params = [];
    this.children = [];
  }
  get(name, kind) {
    let s = this.vars.get(name);
    if (!s) { s = new Sym(name, this, kind || 'local'); this.vars.set(name, s); }
    return s;
  }
}

function role(v) {
  // 'w' write, 'rw' read+write, 'r' read, 'alias'
  let n = v;
  let p = n.parent;
  let destruct = false;
  while (p && (p.k === 'Item' && p.value === n) && p.parent && (p.parent.k === 'Arr' || p.parent.k === 'ListX')) {
    if (p.byRef) return 'alias';
    n = p.parent;
    p = n.parent;
    destruct = true;
  }
  if (!p) return 'r';
  if (p.k === 'Assign' && p.l === n) {
    if (p.byRef) return 'alias';
    if (destruct || p.op === '=') return destruct ? 'wd' : 'w';
    return 'rw';
  }
  if (p.k === 'Assign' && p.r === n && p.byRef) return 'alias';
  if (p.k === 'Foreach' && (p.value === n || p.key === n)) {
    if (p.byRef && p.value === n) return 'alias';
    return 'wf';
  }
  if (destruct) return 'r';
  if (p.k === 'Catch') return 'wc';
  if (p.k === 'Incr') return 'rw';
  if (p.k === 'Unary' && p.op === '&') return 'alias';
  if (p.k === 'Unset') return 'r';
  return 'r';
}

function buildScopes(program) {
  const scopes = [];
  const top = new Scope(program, null);
  scopes.push(top);

  function visitBody(scope, root) {
    const visit = (n) => {
      if (n !== root) {
        if (n.k === 'FuncDecl' || n.k === 'Method') { fnScope(n, scope); return; }
        if (n.k === 'ClassDecl') { forEachChild(n, visit); return; }
        if (n.k === 'Closure') { closureScope(n, scope); return; }
        if (n.k === 'ArrowFn') { arrowScope(n, scope); return; }
      }
      if (n.k === 'Var') { useVar(scope, n); }
      else if (n.k === 'VarVar') scope.dynamic = true;
      else if (n.k === 'Goto' || n.k === 'Label') scope.hasGoto = true;
      else if (n.k === 'Include' && !scope.isTop) scope.dynamic = true;
      else if (n.k === 'Global') { for (const v of n.vars) if (v.k === 'Var') { const s = scope.get(v.name, 'global'); s.alias = true; s.kind = 'global'; v.sym = s; s.refs.push(v); } return; }
      else if (n.k === 'StaticVar') {
        if (n.v && n.v.k === 'Var') { const s = scope.get(n.v.name, 'static'); s.alias = true; s.kind = 'static'; n.v.sym = s; s.refs.push(n.v); s.writes++; }
        if (n.init) visit(n.init);
        return;
      } else if (n.k === 'Call') {
        const name = callName(n);
        if (DYNAMIC_CALLS.has(name)) {
          if (name === 'func_get_args' || name === 'func_get_arg') scope.hasFuncGetArgs = true;
          else if (name === 'parse_str' || name === 'mb_parse_str') { if ((n.args || []).length < 2) scope.dynamic = true; }
          else scope.dynamic = true;
        } else if (name === 'compact') {
          for (const a of n.args || []) {
            const names = [];
            const e = unparen(a.e);
            if (e.k === 'Lit' && e.kind === 'str') names.push(e.value);
            else if (e.k === 'Arr') { for (const it of e.items) { const s = it && strVal(it.value); if (s != null) names.push(s); else scope.dynamic = true; } }
            else scope.dynamic = true;
            for (const nm of names) { const s = scope.get(nm); s.reads++; }
          }
        } else if (n.callee && n.callee.k !== 'Name') {
          // $fn() could be anything
        }
      }
      forEachChild(n, visit);
    };
    visit(root);
  }

  function useVar(scope, v) {
    if (SUPERGLOBALS.has(v.name)) return;
    const r = role(v);
    const s = scope.get(v.name);
    v.sym = s;
    s.refs.push(v);
    if (r === 'w' || r === 'wd' || r === 'wf' || r === 'wc') {
      s.writes++;
      s.defs.push(v);
      if (!s.decl) { s.decl = v; if (r === 'wf') s.kind = s.kind === 'local' ? 'foreach' : s.kind; if (r === 'wc') s.kind = s.kind === 'local' ? 'catch' : s.kind; }
      if (r === 'wd') v.destruct = true;
    } else if (r === 'rw') { s.reads++; s.writes++; }
    else if (r === 'alias') { s.alias = true; s.reads++; s.writes++; }
    else s.reads++;
  }

  function addParams(scope, fn) {
    for (const p of fn.params || []) {
      const s = scope.get(p.name, 'param');
      s.kind = 'param';
      s.decl = p;
      s.param = p;
      if (p.byRef) s.alias = true;
      p.sym = s;
      scope.params.push(s);
      if (p.def) visitBody(scope, p.def);
    }
  }

  function fnScope(fn, parent) {
    const scope = new Scope(fn, parent);
    scopes.push(scope);
    parent.children.push(scope);
    fn.scope = scope;
    addParams(scope, fn);
    if (fn.body) visitBody(scope, fn.body);
  }

  function closureScope(fn, parent) {
    const scope = new Scope(fn, parent);
    scopes.push(scope);
    parent.children.push(scope);
    fn.scope = scope;
    for (const u of fn.uses) {
      if (!SUPERGLOBALS.has(u.name)) {
        const outer = parent.get(u.name);
        outer.reads++;
        outer.refs.push(u);
        u.outer = outer;
        if (u.byRef) { outer.alias = true; outer.writes++; }
        const s = scope.get(u.name, 'use');
        s.kind = 'use';
        s.decl = u;
        s.writes++;
        if (u.byRef) s.alias = true;
        u.sym = s;
      }
    }
    addParams(scope, fn);
    visitBody(scope, fn.body);
  }

  function arrowScope(fn, parent) {
    const scope = new Scope(fn, parent);
    scopes.push(scope);
    parent.children.push(scope);
    fn.scope = scope;
    scope.arrow = true;
    addParams(scope, fn);
    const local = new Set((fn.params || []).map((p) => p.name));
    const visit = (n) => {
      if (n.k === 'ArrowFn' && n !== fn) {
        // nested arrow: its own params shadow, other names resolve outward
        arrowScope(n, scope);
        return;
      }
      if (n.k === 'Closure') { closureScope(n, scope); return; }
      if (n.k === 'ClassDecl') return;
      if (n.k === 'Var') {
        if (SUPERGLOBALS.has(n.name)) return;
        if (local.has(n.name) || role(n) !== 'r') useVar(scope, n);
        else {
          // captured by value from the enclosing scope
          const outer = parent.get(n.name);
          outer.reads++;
          outer.refs.push(n);
          n.sym = outer;
          n.captured = true;
        }
        return;
      }
      forEachChild(n, visit);
    };
    visit(fn.body);
  }

  visitBody(top, program);
  return scopes;
}

module.exports = { buildScopes, Scope, Sym, SUPERGLOBALS };

void FUNC_KINDS;
