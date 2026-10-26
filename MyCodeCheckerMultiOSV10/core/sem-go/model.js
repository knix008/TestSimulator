'use strict';

// Project model: parse files, group them into packages (one directory + one
// package clause), build scopes and symbols, resolve identifier references
// and infer a light-weight type string for every variable ('*os.File',
// 'error', 'string', 'map[string]int', ...).

const A = require('./ast');
const { parseGo } = require('./parser');
const { STD_RESULTS, STD_METHODS, CTOR_TYPES } = require('./stdlib');

const BUILTIN_TYPES = new Set(['bool', 'byte', 'complex64', 'complex128', 'error', 'float32', 'float64', 'int', 'int8', 'int16', 'int32', 'int64', 'rune', 'string', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr', 'any', 'comparable']);
const BUILTIN_FUNCS = new Set(['append', 'cap', 'clear', 'close', 'complex', 'copy', 'delete', 'imag', 'len', 'make', 'max', 'min', 'new', 'panic', 'print', 'println', 'real', 'recover']);
const BUILTIN_CONSTS = new Set(['true', 'false', 'iota', 'nil']);
const INT_TYPES = new Set(['int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr', 'byte', 'rune']);

class Scope {
  constructor(parent, kind, node) {
    this.parent = parent;
    this.kind = kind;
    this.node = node;
    this.names = new Map();
  }
  lookup(name) {
    for (let s = this; s; s = s.parent) { const v = s.names.get(name); if (v) return v; }
    return null;
  }
}

let SYM_ID = 0;
function mkSym(name, kind, node, extra) {
  const s = { id: ++SYM_ID, name, kind, node, type: null, tstr: '', init: null, fn: null, reads: 0, writes: 0, refs: [], addrTaken: false, captured: false, capturedWrite: false, local: false };
  if (extra) Object.assign(s, extra);
  return s;
}

const UNIVERSE = new Scope(null, 'universe', null);
for (const n of BUILTIN_TYPES) UNIVERSE.names.set(n, mkSym(n, 'type', null, { builtin: true, tstr: n }));
for (const n of BUILTIN_FUNCS) UNIVERSE.names.set(n, mkSym(n, 'builtin', null, { builtin: true }));
for (const n of BUILTIN_CONSTS) UNIVERSE.names.set(n, mkSym(n, 'const', null, { builtin: true, tstr: n === 'nil' ? 'nil' : (n === 'iota' ? 'int' : 'bool') }));

function importName(path) {
  const parts = String(path).split('/');
  let last = parts[parts.length - 1] || path;
  if (/^v\d+$/.test(last) && parts.length > 1) last = parts[parts.length - 2];
  last = last.replace(/\.v\d+$/, '').replace(/^go-/, '').replace(/[-.]go$/, '').replace(/[^A-Za-z0-9_]/g, '');
  return last;
}

function dirOf(p) {
  const i = String(p).lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

function buildProject(files) {
  const project = { files: [], packages: [] };
  const pkgMap = new Map();
  for (const f of files) {
    const res = parseGo(f.text);
    const pf = {
      path: f.path,
      src: res.src,
      ast: res.file,
      errors: res.errors,
      comments: res.comments,
      tokens: res.tokens,
      imports: new Map(),
      importNodes: [],
      funcs: [],
      byKind: new Map(),
      isTest: /_test\.go$/.test(f.path),
      generated: /^\s*\/\/\s*Code generated .* DO NOT EDIT\.?\s*$/m.test(res.src.slice(0, 2000)),
    };
    for (const imp of res.file.imports) {
      const local = imp.name ? imp.name.name : importName(imp.path);
      pf.imports.set(local, imp.path);
      pf.importNodes.push({ local, path: imp.path, node: imp });
    }
    const pkgName = res.file.pkg ? res.file.pkg.name : '';
    const key = `${dirOf(f.path)}|${pkgName.replace(/_test$/, '')}`;
    let pkg = pkgMap.get(key);
    if (!pkg) {
      pkg = { key, name: pkgName, dir: dirOf(f.path), files: [], scope: new Scope(UNIVERSE, 'package', null), funcs: new Map(), methods: new Map(), types: new Map(), syms: [] };
      pkgMap.set(key, pkg);
      project.packages.push(pkg);
    }
    pkg.files.push(pf);
    pf.pkg = pkg;
    project.files.push(pf);
  }
  for (const pkg of project.packages) declarePackage(pkg);
  for (const pkg of project.packages) for (const pf of pkg.files) resolveFile(pf, pkg);
  return project;
}

function recvTypeName(fn) {
  if (!fn.recv || !fn.recv.length) return null;
  let t = A.strip(fn.recv[0].type);
  if (t && t.k === 'Star') t = A.strip(t.x);
  if (t && t.k === 'Index') t = t.x;
  return t && t.k === 'Ident' ? t.name : null;
}

function declarePackage(pkg) {
  const sc = pkg.scope;
  for (const pf of pkg.files) {
    for (const d of pf.ast.decls) {
      if (d.k === 'FuncDecl') {
        const rt = recvTypeName(d);
        if (rt) {
          if (!pkg.methods.has(rt)) pkg.methods.set(rt, new Map());
          pkg.methods.get(rt).set(d.name.name, d);
          continue;
        }
        if (d.name.name === 'init' || d.name.name === '_') continue;
        const s = mkSym(d.name.name, 'func', d.name, { decl: d, file: pf });
        pkg.funcs.set(d.name.name, d);
        sc.names.set(d.name.name, s);
        pkg.syms.push(s);
      } else if (d.k === 'GenDecl') {
        for (const sp of d.specs) {
          if (sp.k === 'TypeSpec') {
            const s = mkSym(sp.name.name, 'type', sp.name, { decl: sp, file: pf, tstr: sp.name.name });
            sc.names.set(sp.name.name, s);
            pkg.types.set(sp.name.name, sp);
            pkg.syms.push(s);
          } else if (sp.k === 'VarSpec') {
            sp.names.forEach((nm, i) => {
              if (nm.name === '_') return;
              const s = mkSym(nm.name, sp.kw === 'const' ? 'const' : 'var', nm, { decl: sp, file: pf, type: sp.type, init: sp.values[i] || null, initIndex: sp.values.length === 1 && sp.names.length > 1 ? i : -1 });
              sc.names.set(nm.name, s);
              pkg.syms.push(s);
            });
          }
        }
      }
    }
  }
  // types of package-level variables (after all declarations)
  for (const s of pkg.syms) {
    if (s.kind !== 'var' && s.kind !== 'const') continue;
    if (s.type) s.tstr = A.typeStr(s.type);
  }
}

// ── resolution ──
class Resolver {
  constructor(pf, pkg) {
    this.pf = pf;
    this.pkg = pkg;
    this.fileScope = new Scope(pkg.scope, 'file', pf.ast);
    for (const imp of pf.importNodes) {
      if (imp.local === '_' || imp.local === '.') continue;
      this.fileScope.names.set(imp.local, mkSym(imp.local, 'pkg', imp.node, { path: imp.path }));
    }
    this.fn = null;
    this.parentMap = true;
  }
  index(n, parent) {
    if (n._ix) return;
    n._ix = true;
    n.parent = parent || null;
    let arr = this.pf.byKind.get(n.k);
    if (!arr) { arr = []; this.pf.byKind.set(n.k, arr); }
    arr.push(n);
  }
  declare(scope, ident, kind, extra) {
    if (!ident || ident.k !== 'Ident' || ident.name === '_') return null;
    const s = mkSym(ident.name, kind, ident, extra);
    s.fn = this.fn;
    s.local = !!this.fn;
    s.scope = scope;
    if (this.fn) {
      // shadowing of a variable declared in an enclosing scope of the same or outer function
      const outer = scope.parent ? scope.parent.lookup(ident.name) : null;
      if (outer && outer.local && (outer.kind === 'var' || outer.kind === 'param' || outer.kind === 'result')) s.shadows = outer;
      this.fn.syms.push(s);
    }
    scope.names.set(ident.name, s);
    ident.sym = s;
    ident.isDecl = true;
    return s;
  }
  ref(ident, scope, mode) {
    if (ident.name === '_') { ident.blank = true; return null; }
    const s = scope.lookup(ident.name);
    if (!s) return null;
    ident.sym = s;
    s.refs.push(ident);
    if (mode === 'w') s.writes++;
    else if (mode === 'rw') { s.writes++; s.reads++; s.selfReads = (s.selfReads || 0) + 1; } else s.reads++;
    if (s.local && s.fn && this.fn && s.fn !== this.fn) {
      s.captured = true;
      if (mode === 'w' || mode === 'rw') s.capturedWrite = true;
    }
    return s;
  }
  run() {
    const file = this.pf.ast;
    this.index(file, null);
    for (const d of file.decls) this.topDecl(d, file);
  }
  topDecl(d, parent) {
    this.index(d, parent);
    if (d.k === 'FuncDecl') {
      this.func(d, this.fileScope);
      return;
    }
    if (d.k === 'GenDecl') {
      for (const sp of d.specs) {
        this.index(sp, d);
        if (sp.k === 'VarSpec') {
          for (const v of sp.values) this.expr(v, this.fileScope, sp);
          if (sp.type) this.type(sp.type, this.fileScope, sp);
          sp.names.forEach((nm) => { this.index(nm, sp); const s = this.pkg.scope.names.get(nm.name); if (s && s.node === nm) nm.sym = s; nm.isDecl = true; });
          for (const nm of sp.names) { const s = nm.sym; if (s && !s.tstr) s.tstr = inferAt(sp.values, sp.names.indexOf(nm), sp.names.length, this); }
        } else if (sp.k === 'TypeSpec') {
          this.index(sp.name, sp);
          sp.name.isDecl = true;
          const sc = new Scope(this.fileScope, 'type', sp);
          for (const tp of sp.tparams) { this.index(tp, sp); this.declare(sc, tp.names[0], 'type'); this.type(tp.type, sc, tp); }
          this.type(sp.type, sc, sp);
        }
      }
    }
  }
  func(fn, outer) {
    const prevFn = this.fn;
    const sc = new Scope(outer, 'func', fn);
    fn.syms = [];
    fn.parentFn = prevFn;
    fn.scope = sc;
    this.pf.funcs.push(fn);
    const ft = fn.k === 'FuncLit' ? fn.type : fn;
    if (fn.k === 'FuncLit') this.index(ft, fn);
    // types of parameters are resolved in the outer function context
    const fields = [];
    const add = (list, kind) => { for (const f of list || []) fields.push([f, kind]); };
    add(fn.k === 'FuncDecl' ? fn.recv : null, 'recv');
    add(ft.tparams, 'tparam');
    add(ft.params, 'param');
    add(ft.results, 'result');
    this.fn = fn;
    for (const [f] of fields) if (f.type) this.type(f.type, sc, f);
    for (const [f, kind] of fields) {
      this.index(f, ft);
      for (const nm of f.names) {
        this.index(nm, f);
        const s = this.declare(sc, nm, kind === 'tparam' ? 'type' : kind, { type: f.type, tstr: kind === 'tparam' ? '' : A.typeStr(f.type), field: f });
        if (s) s.paramIndex = (fn.k === 'FuncLit' ? fn.type.params : fn.params).indexOf(f);
      }
    }
    if (fn.body) { this.index(fn.body, fn); this.stmts(fn.body.stmts, sc, fn.body); }
    this.fn = prevFn;
  }
  type(t, scope, parent) {
    if (!t) return;
    A.walk(t, (n, p) => {
      this.index(n, p || parent);
      if (n.k === 'Ident') { this.ref(n, scope, 't'); return false; }
      if (n.k === 'Selector') { this.index(n.sel, n); const x = A.strip(n.x); if (x.k === 'Ident') { this.index(x, n); this.ref(x, scope, 't'); return false; } return true; }
      if (n.k === 'Field') { for (const nm of n.names) { this.index(nm, n); nm.isField = true; } return true; }
      if (n.k === 'FuncType') {
        for (const list of [n.params, n.results]) for (const f of list) { this.index(f, n); for (const nm of f.names) { this.index(nm, f); nm.isDecl = true; } if (f.type) this.type(f.type, scope, f); }
        return false;
      }
      if (n.k === 'ArrayType' && n.len) { this.expr(n.len, scope, n); if (n.elt) this.type(n.elt, scope, n); return false; }
      if (n.k === 'Index') { this.type(n.x, scope, n); for (const ix of n.indices) if (ix) this.type(ix, scope, n); return false; }
      return true;
    }, parent);
  }
  stmts(list, scope, parent) {
    for (const s of list) this.stmt(s, scope, parent);
  }
  block(b, scope, parent) {
    if (!b) return;
    this.index(b, parent);
    const sc = new Scope(scope, 'block', b);
    this.stmts(b.stmts, sc, b);
  }
  stmt(s, scope, parent) {
    if (!s) return;
    this.index(s, parent);
    s.fn = this.fn;
    switch (s.k) {
      case 'Block': { const sc = new Scope(scope, 'block', s); this.stmts(s.stmts, sc, s); return; }
      case 'ExprStmt': this.expr(s.x, scope, s); return;
      case 'Assign': this.assign(s, scope); return;
      case 'IncDec': this.lvalue(s.x, scope, s, 'rw'); return;
      case 'Send': this.expr(s.ch, scope, s); this.expr(s.val, scope, s); return;
      case 'DeclStmt': this.declStmt(s.decl, scope, s); return;
      case 'Go': case 'Defer': this.expr(s.call, scope, s); return;
      case 'Return':
        for (const r of s.results) this.expr(r, scope, s);
        if (!s.results.length && this.fn) { s.naked = true; for (const sym of this.fn.syms) if (sym.kind === 'result') sym.reads++; }
        return;
      case 'Branch': if (s.label) this.index(s.label, s); return;
      case 'Labeled': this.index(s.label, s); this.stmt(s.stmt, scope, s); return;
      case 'If': {
        const sc = new Scope(scope, 'if', s);
        if (s.init) this.stmt(s.init, sc, s);
        if (s.cond) this.expr(s.cond, sc, s);
        this.block(s.then, sc, s);
        if (s.els) { if (s.els.k === 'If') this.stmt(s.els, sc, s); else this.block(s.els, sc, s); }
        return;
      }
      case 'For': {
        const sc = new Scope(scope, 'for', s);
        if (s.init) this.stmt(s.init, sc, s);
        if (s.cond) this.expr(s.cond, sc, s);
        if (s.post) this.stmt(s.post, sc, s);
        this.block(s.body, sc, s);
        return;
      }
      case 'Range': {
        const sc = new Scope(scope, 'for', s);
        this.expr(s.x, scope, s);
        const xt = typeOfExpr(s.x, this);
        for (const [v, i] of [[s.key, 0], [s.value, 1]]) {
          if (!v) continue;
          if (s.tok === ':=') {
            this.index(v, s);
            const sym = v.k === 'Ident' ? this.declare(sc, v, 'var', { rangeVar: true, loop: s }) : null;
            if (sym) sym.tstr = rangeElemType(xt, i);
          } else this.lvalue(v, scope, s, 'w');
        }
        this.block(s.body, sc, s);
        return;
      }
      case 'Switch': {
        const sc = new Scope(scope, 'switch', s);
        if (s.init) this.stmt(s.init, sc, s);
        if (s.tag) { if (s.tag.k === 'Assign' || s.tag.k === 'ExprStmt') this.stmt(s.tag, sc, s); else this.expr(s.tag, sc, s); }
        for (const c of s.cases) {
          this.index(c, s);
          const cs = new Scope(sc, 'case', c);
          for (const e of c.list || []) this.expr(e, sc, c);
          this.stmts(c.body, cs, c);
        }
        return;
      }
      case 'TypeSwitch': {
        const sc = new Scope(scope, 'switch', s);
        if (s.init) this.stmt(s.init, sc, s);
        this.index(s.assign, s);
        this.expr(s.x, sc, s.assign);
        if (s.bind) this.index(s.bind, s.assign);
        let bindSyms = [];
        for (const c of s.cases) {
          this.index(c, s);
          const cs = new Scope(sc, 'case', c);
          for (const e of c.list || []) this.type(e, sc, c);
          if (s.bind && s.bind.k === 'Ident' && s.bind.name !== '_') {
            const sym = mkSym(s.bind.name, 'var', s.bind, { fn: this.fn, local: true, scope: cs, typeSwitchBind: true });
            sym.tstr = c.list && c.list.length === 1 ? A.typeStr(c.list[0]) : '';
            cs.names.set(s.bind.name, sym);
            if (this.fn) this.fn.syms.push(sym);
            bindSyms.push(sym);
          }
          this.stmts(c.body, cs, c);
        }
        if (s.bind) { s.bind.isDecl = true; s.bindSyms = bindSyms; }
        return;
      }
      case 'Select': {
        for (const c of s.cases) {
          this.index(c, s);
          const cs = new Scope(scope, 'case', c);
          if (c.comm) this.stmt(c.comm, cs, c);
          this.stmts(c.body, cs, c);
        }
        return;
      }
      case 'Empty': return;
      default: return;
    }
  }
  declStmt(d, scope, parent) {
    this.index(d, parent);
    for (const sp of d.specs) {
      this.index(sp, d);
      if (sp.k === 'VarSpec') {
        for (const v of sp.values) this.expr(v, scope, sp);
        if (sp.type) this.type(sp.type, scope, sp);
        sp.names.forEach((nm, i) => {
          this.index(nm, sp);
          const sym = this.declare(scope, nm, sp.kw === 'const' ? 'const' : 'var', { type: sp.type, init: sp.values[i] || (sp.values.length === 1 ? sp.values[0] : null), declSpec: sp });
          if (sym) {
            sym.tstr = sp.type ? A.typeStr(sp.type) : inferAt(sp.values, i, sp.names.length, this);
            if (!sp.values.length) sym.zeroInit = true;
          }
        });
      } else if (sp.k === 'TypeSpec') {
        this.index(sp.name, sp);
        this.declare(scope, sp.name, 'type', { tstr: sp.name.name, decl: sp });
        this.type(sp.type, scope, sp);
      }
    }
  }
  assign(s, scope) {
    for (const r of s.rhs) this.expr(r, scope, s);
    if (s.op === ':=') {
      s.lhs.forEach((l, i) => {
        this.index(l, s);
        if (l.k !== 'Ident') { this.lvalue(l, scope, s, 'w'); return; }
        if (l.name === '_') { l.blank = true; return; }
        const existing = scope.names.get(l.name);
        if (existing) {
          this.ref(l, scope, 'w');
          return;
        }
        const sym = this.declare(scope, l, 'var', { init: s.rhs.length === s.lhs.length ? s.rhs[i] : s.rhs[0], defineStmt: s, defineIndex: i });
        if (sym) sym.tstr = inferAt(s.rhs, i, s.lhs.length, this) || (i === s.lhs.length - 1 && /^err|Err$/.test(l.name) && s.rhs.length === 1 && s.rhs[0].k === 'Call' ? 'error' : '');
      });
      return;
    }
    const mode = s.op === '=' ? 'w' : 'rw';
    for (const l of s.lhs) this.lvalue(l, scope, s, mode);
  }
  lvalue(e, scope, parent, mode) {
    const x = A.strip(e);
    if (x && x.k === 'Ident') {
      if (x !== e) this.index(e, parent);
      this.index(x, x === e ? parent : e);
      x.lhs = true;
      this.ref(x, scope, mode);
      return;
    }
    this.expr(e, scope, parent);
    if (x && (x.k === 'Index' || x.k === 'Selector' || x.k === 'Star')) x.lhsTarget = true;
  }
  expr(e, scope, parent) {
    if (!e) return;
    A.walk(e, (n, p) => {
      this.index(n, p || parent);
      switch (n.k) {
        case 'Ident': this.ref(n, scope, 'r'); return false;
        case 'Selector': {
          this.index(n.sel, n);
          n.sel.isSel = true;
          const x = A.strip(n.x);
          if (x && x.k === 'Ident') {
            this.index(x, n);
            const s = this.ref(x, scope, 'r');
            if (s && s.kind === 'pkg') n.pkgPath = s.path;
            return false;
          }
          return true;
        }
        case 'FuncLit': this.func(n, scope); return false;
        case 'Unary':
          if (n.op === '&') { const x = A.strip(n.x); if (x && x.k === 'Ident') { const s = scope.lookup(x.name); if (s) s.addrTaken = true; } }
          return true;
        case 'CompositeLit': {
          if (n.type) this.type(n.type, scope, n);
          const keyed = isKeyedByExpr(n.type, this);
          for (const el of n.elts) {
            if (el.k === 'KeyValue') {
              this.index(el, n);
              const k = el.key;
              if (k.k === 'Ident' && !keyed) { this.index(k, el); k.isField = true; } else this.expr(k, scope, el);
              this.expr(el.value, scope, el);
            } else this.expr(el, scope, n);
          }
          return false;
        }
        case 'TypeAssert': this.expr(n.x, scope, n); if (n.type) this.type(n.type, scope, n); return false;
        case 'ArrayType': case 'MapType': case 'ChanType': case 'FuncType': case 'StructType': case 'InterfaceType':
          this.type(n, scope, p || parent);
          return false;
        case 'Call': {
          const f = A.strip(n.fun);
          if (f && f.k === 'Ident' && (f.name === 'new' || f.name === 'make') && n.args.length) {
            this.expr(n.fun, scope, n);
            this.type(n.args[0], scope, n);
            for (let i = 1; i < n.args.length; i++) this.expr(n.args[i], scope, n);
            return false;
          }
          return true;
        }
        default: return true;
      }
    }, parent);
  }
}

function isKeyedByExpr(t, r) {
  t = A.strip(t);
  if (!t) return false;
  if (t.k === 'MapType' || t.k === 'ArrayType') return true;
  if (t.k === 'Ident') {
    const ts = r.pkg.types.get(t.name);
    if (ts) { const tt = A.strip(ts.type); return !!tt && (tt.k === 'MapType' || tt.k === 'ArrayType'); }
  }
  return false;
}

function rangeElemType(xt, i) {
  if (!xt) return '';
  if (xt === 'string') return i === 0 ? 'int' : 'rune';
  if (/^\[\d*\]/.test(xt)) return i === 0 ? 'int' : xt.replace(/^\[\d*\]/, '');
  const m = /^map\[([^\]]*)\](.*)$/.exec(xt);
  if (m) return i === 0 ? m[1] : m[2];
  if (/^chan /.test(xt)) return i === 0 ? xt.slice(5) : '';
  if (INT_TYPES.has(xt)) return i === 0 ? xt : '';
  return '';
}

// Type string of the i-th value of a (possibly tuple-valued) right-hand side.
function inferAt(rhs, i, nLhs, r) {
  if (!rhs || !rhs.length) return '';
  if (rhs.length === nLhs) return typeOfExpr(rhs[i], r);
  if (rhs.length === 1) {
    const e = A.strip(rhs[0]);
    if (e.k === 'Call') { const rs = resultTypes(e, r); return rs && rs[i] ? rs[i] : ''; }
    if (e.k === 'Index' && i === 1) return 'bool';
    if (e.k === 'TypeAssert' && i === 1) return 'bool';
    if (e.k === 'TypeAssert' && i === 0) return A.typeStr(e.type);
    if (e.k === 'Unary' && e.op === '<-' && i === 1) return 'bool';
  }
  return '';
}

function resolveTypeName(t, r) {
  t = A.strip(t);
  if (!t) return '';
  return A.typeStr(t);
}

function typeOfExpr(e, r) {
  e = A.strip(e);
  if (!e) return '';
  switch (e.k) {
    case 'BasicLit':
      return e.kind === 'string' ? 'string' : e.kind === 'int' ? 'int' : e.kind === 'float' ? 'float64' : e.kind === 'char' ? 'rune' : 'complex128';
    case 'Ident':
      if (e.sym) {
        if (e.sym.kind === 'const' && e.sym.builtin) return e.sym.tstr;
        if (e.sym.kind === 'var' || e.sym.kind === 'param' || e.sym.kind === 'result' || e.sym.kind === 'recv' || e.sym.kind === 'const') return e.sym.tstr || '';
        if (e.sym.kind === 'func') return 'func';
      }
      return '';
    case 'CompositeLit': return resolveTypeName(e.type, r);
    case 'Unary':
      if (e.op === '&') { const x = A.strip(e.x); if (x && x.k === 'CompositeLit') return `*${resolveTypeName(x.type, r)}`; const t = typeOfExpr(x, r); return t ? `*${t}` : ''; }
      if (e.op === '!') return 'bool';
      if (e.op === '<-') { const t = typeOfExpr(e.x, r); return /^chan /.test(t) ? t.slice(5) : ''; }
      return typeOfExpr(e.x, r);
    case 'Star': { const t = typeOfExpr(e.x, r); return t.startsWith('*') ? t.slice(1) : ''; }
    case 'Binary':
      if (['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(e.op)) return 'bool';
      if (e.op === '<<' || e.op === '>>') return typeOfExpr(e.x, r);
      { const a = typeOfExpr(e.x, r); const b = typeOfExpr(e.y, r); if (A.isNum(e.x) && b) return b; return a || b; }
    case 'Call': {
      const rs = resultTypes(e, r);
      return rs && rs.length >= 1 ? rs[0] : '';
    }
    case 'FuncLit': return 'func';
    case 'Index': {
      const t = typeOfExpr(e.x, r);
      if (/^\[\d*\]/.test(t)) return t.replace(/^\[\d*\]/, '');
      const m = /^map\[[^\]]*\](.*)$/.exec(t);
      if (m) return m[1];
      if (t === 'string') return 'byte';
      return '';
    }
    case 'Slice': return typeOfExpr(e.x, r);
    case 'TypeAssert': return e.type ? A.typeStr(e.type) : '';
    case 'Selector': return '';
    default: return '';
  }
}

// Result types of a call when known: local functions/methods, conversions,
// builtins and a table of standard library functions.
function resultTypes(call, r) {
  const f = A.strip(call.fun);
  if (!f) return null;
  if (f.k === 'Ident') {
    const s = f.sym;
    if (s && s.kind === 'builtin') {
      if (f.name === 'len' || f.name === 'cap' || f.name === 'copy') return ['int'];
      if (f.name === 'make' && call.args[0]) return [A.typeStr(call.args[0])];
      if (f.name === 'new' && call.args[0]) return [`*${A.typeStr(call.args[0])}`];
      if (f.name === 'append' && call.args[0]) return [typeOfExpr(call.args[0], r)];
      if (f.name === 'recover') return ['any'];
      if (f.name === 'min' || f.name === 'max') return [typeOfExpr(call.args[0], r)];
      return [];
    }
    if (s && s.kind === 'type') return [s.tstr || f.name];
    if (s && s.kind === 'func' && s.decl) return s.decl.results.map((x) => A.typeStr(x.type));
    if (s && (s.kind === 'var' || s.kind === 'param') && s.type && A.strip(s.type).k === 'FuncType') return A.strip(s.type).results.map((x) => A.typeStr(x.type));
    if (s && s.init && A.strip(s.init).k === 'FuncLit') return A.strip(s.init).type.results.map((x) => A.typeStr(x.type));
    return null;
  }
  if (f.k === 'Selector') {
    const x = A.strip(f.x);
    if (x.k === 'Ident' && x.sym && x.sym.kind === 'pkg') {
      const q = `${x.name}.${f.sel.name}`;
      const full = `${x.sym.path}.${f.sel.name}`;
      if (STD_RESULTS[full]) return STD_RESULTS[full];
      if (CTOR_TYPES[full]) return [CTOR_TYPES[full]];
      void q;
      return null;
    }
    const rt = typeOfExpr(x, r).replace(/^\*/, '');
    if (rt) {
      const ms = r.pkg.methods.get(rt);
      if (ms && ms.has(f.sel.name)) return ms.get(f.sel.name).results.map((y) => A.typeStr(y.type));
      const full = typeOfExpr(x, r);
      const tbl = STD_METHODS[full] || STD_METHODS[rt] || STD_METHODS[`*${rt}`];
      if (tbl && tbl[f.sel.name]) return tbl[f.sel.name];
      if (STD_METHODS.error && rt === 'error' && f.sel.name === 'Error') return ['string'];
    }
    return null;
  }
  if (f.k === 'ArrayType' || f.k === 'MapType' || f.k === 'ChanType' || f.k === 'FuncType' || f.k === 'InterfaceType') return [A.typeStr(f)];
  if (f.k === 'Index') {
    const g = A.strip(f.x);
    if (g.k === 'Ident' && g.sym && g.sym.kind === 'func' && g.sym.decl) return g.sym.decl.results.map((x) => A.typeStr(x.type));
  }
  if (f.k === 'FuncLit') return f.type.results.map((x) => A.typeStr(x.type));
  return null;
}

function resolveFile(pf, pkg) {
  const r = new Resolver(pf, pkg);
  r.run();
  pf.resolver = r;
}

// helpers for rules
function enclosingFn(n) {
  for (let p = n.parent; p; p = p.parent) if (p.k === 'FuncDecl' || p.k === 'FuncLit') return p;
  return null;
}
function ancestors(n, stopAtFn = true) {
  const out = [];
  for (let p = n.parent; p; p = p.parent) {
    out.push(p);
    if (stopAtFn && (p.k === 'FuncDecl' || p.k === 'FuncLit')) break;
  }
  return out;
}
function inLoop(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (p.k === 'FuncDecl' || p.k === 'FuncLit') return null;
    if (p.k === 'For' || p.k === 'Range') return p;
  }
  return null;
}
function pkgPathOf(e) {
  e = A.strip(e);
  if (!e) return null;
  if (e.k === 'Ident' && e.sym && e.sym.kind === 'pkg') return e.sym.path;
  return null;
}
// 'crypto/md5.New' style name of a package-qualified call / selector
function qualified(e) {
  e = A.strip(e);
  if (!e) return null;
  if (e.k === 'Call') e = A.strip(e.fun);
  if (e && e.k === 'Index') e = A.strip(e.x);
  if (!e || e.k !== 'Selector') return null;
  const p = pkgPathOf(e.x);
  return p ? `${p}.${e.sel.name}` : null;
}

module.exports = { buildProject, typeOfExpr, resultTypes, enclosingFn, ancestors, inLoop, qualified, pkgPathOf, INT_TYPES, BUILTIN_TYPES, importName, Scope };
