'use strict';

// Project model: parsed files, project-wide types (partial classes merged,
// inheritance resolved by name), and per-function symbol binding.

const { parse } = require('./parser');
const { indexUnit, forEachChild, attrNamed } = require('./ast');

let symId = 1;

class TypeInfo {
  constructor(name, ns, kind, outer) {
    this.name = name;
    this.ns = ns;
    this.kind = kind;
    this.outer = outer || null;
    this.decls = [];
    this.files = new Set();
    this.members = new Map();
    this.baseTypes = [];
    this.baseInfo = null;
    this.ifaceInfos = [];
    this.externalBases = [];
    this.derived = [];
    this.nested = [];
    this.broken = false;
    this.mods = new Set();
    this.arity = 0;
    this.primaryParams = null;
    this.usedNames = null;
  }

  get fullName() {
    const outer = this.outer ? `${this.outer.fullName}.` : (this.ns ? `${this.ns}.` : '');
    return `${outer}${this.name}`;
  }

  isClassLike() { return this.kind === 'class' || this.kind === 'record'; }

  memberEntries(name) { return this.members.get(name) || null; }

  // members by name walking the project base chain; `external` set when a base is unknown
  lookup(name, seen = new Set()) {
    if (seen.has(this)) return null;
    seen.add(this);
    const m = this.members.get(name);
    if (m) return m;
    if (this.baseInfo) { const r = this.baseInfo.lookup(name, seen); if (r) return r; }
    for (const i of this.ifaceInfos) { const r = i.lookup(name, seen); if (r) return r; }
    return null;
  }

  hasExternalBase(seen = new Set()) {
    if (seen.has(this)) return false;
    seen.add(this);
    if (this.externalBases.some((b) => !IGNORABLE_BASES.has(b))) return true;
    if (this.baseInfo && this.baseInfo.hasExternalBase(seen)) return true;
    return false;
  }

  inheritsFrom(name, seen = new Set()) {
    if (seen.has(this)) return false;
    seen.add(this);
    if (this.externalBases.includes(name)) return true;
    for (const b of this.baseTypes) if (b.name === name) return true;
    if (this.baseInfo && (this.baseInfo.name === name || this.baseInfo.inheritsFrom(name, seen))) return true;
    for (const i of this.ifaceInfos) if (i.name === name || i.inheritsFrom(name, seen)) return true;
    return false;
  }

  depth(seen = new Set()) {
    if (seen.has(this)) return 0;
    seen.add(this);
    if (this.baseInfo) return 1 + this.baseInfo.depth(seen);
    const ext = this.externalBases.find((b) => !b.startsWith('I') || !/^I[A-Z]/.test(b));
    if (ext) return 1 + (KNOWN_DEPTH[ext] || 1);
    return 1;
  }
}

// interfaces / bases that do not hide members relevant to "unused" checks
const IGNORABLE_BASES = new Set(['IDisposable', 'IAsyncDisposable', 'IEquatable', 'IComparable', 'ICloneable', 'IEnumerable', 'IEnumerator',
  'IComparer', 'IEqualityComparer', 'IFormattable', 'object', 'Object', 'Exception', 'EventArgs', 'Attribute']);
const KNOWN_DEPTH = { Form: 6, UserControl: 6, Control: 4, Window: 7, Page: 7, MonoBehaviour: 3, Exception: 1, Panel: 5, Component: 2 };

class Symbol {
  constructor(name, kind, props) {
    this.id = symId++;
    this.name = name;
    this.kind = kind; // local | param | foreach | catch | pattern | out | range | localfunc
    this.refs = [];
    this.reads = 0;
    this.writes = [];
    this.nameofRefs = 0;
    this.captured = false;
    this.capturedWrite = false;
    this.byRef = false;
    this.type = null;
    this.init = null;
    this.decl = null;
    this.isConst = false;
    this.isUsing = false;
    this.depth = 0;
    this.func = null;
    if (props) Object.assign(this, props);
  }
}

class Scope {
  constructor(parent, boundary) {
    this.parent = parent;
    this.vars = new Map();
    this.depth = parent ? parent.depth + (boundary ? 1 : 0) : 0;
  }
  child(boundary) { return new Scope(this, boundary); }
  lookup(name) {
    for (let s = this; s; s = s.parent) {
      const v = s.vars.get(name);
      if (v) return v;
    }
    return null;
  }
}

function buildProject(files) {
  const project = {
    files: [],
    types: new Map(),
    typesByName: new Map(),
    namespaces: new Set(),
    extMethods: new Map(),
    allTypeInfos: [],
    nameUse: new Map(), // identifier -> count across project
  };
  for (const f of files) {
    const pf = { path: f.path, text: f.text, lang: f.lang, unit: null, lex: null, errors: [], byKind: new Map(), usings: [], types: [], funcs: [] };
    try {
      const r = parse(f.text);
      pf.lex = r.lex;
      pf.errors = r.errors;
      if (!r.fatal && r.unit) {
        pf.unit = r.unit;
        pf.byKind = indexUnit(r.unit);
      }
    } catch (e) {
      pf.errors = [String(e && e.message)];
      pf.unit = null;
    }
    project.files.push(pf);
  }
  for (const pf of project.files) if (pf.unit) collectTypes(project, pf);
  resolveBases(project);
  for (const pf of project.files) {
    if (!pf.unit) continue;
    try {
      bindFile(project, pf);
    } catch (e) {
      pf.bindError = String(e && e.message);
      if (process.env.SEMCS_DEBUG) throw e;
    }
  }
  return project;
}

function collectTypes(project, pf) {
  const visit = (members, ns, outer, usings) => {
    for (const m of members) {
      if (m.k === 'Namespace') {
        const inner = ns ? `${ns}.${m.name}` : m.name;
        project.namespaces.add(inner);
        // namespaces' parents too
        const parts = inner.split('.');
        for (let i = 1; i < parts.length; i++) project.namespaces.add(parts.slice(0, i).join('.'));
        pf.usings.push(...m.usings.map((u) => ({ ...u, ns: inner })));
        visit(m.members, inner, null, usings.concat(m.usings));
      } else if (m.k === 'TypeDecl' || m.k === 'Delegate') {
        registerType(project, pf, m, ns, outer);
      }
    }
  };
  pf.usings.push(...pf.unit.usings);
  visit(pf.unit.members, '', null, pf.unit.usings);
}

function registerType(project, pf, decl, ns, outerInfo) {
  const kind = decl.k === 'Delegate' ? 'delegate' : decl.kind;
  const arity = (decl.typeParams || []).length;
  const key = `${outerInfo ? outerInfo.fullName : ns}.${decl.name}\`${arity}`;
  let info = project.types.get(key);
  if (!info) {
    info = new TypeInfo(decl.name, ns, kind, outerInfo);
    info.arity = arity;
    info.key = key;
    project.types.set(key, info);
    project.allTypeInfos.push(info);
    let arr = project.typesByName.get(decl.name);
    if (!arr) { arr = []; project.typesByName.set(decl.name, arr); }
    arr.push(info);
    if (outerInfo) outerInfo.nested.push(info);
  }
  info.decls.push(decl);
  info.files.add(pf.path);
  decl.typeInfo = info;
  decl.file = pf;
  pf.types.push(decl);
  for (const md of decl.mods || []) info.mods.add(md);
  if (decl.broken) info.broken = true;
  if (decl.k === 'Delegate') return info;
  for (const b of decl.bases || []) info.baseTypes.push(b);
  if (decl.params) {
    info.primaryParams = decl.params;
  }
  const defaultAccess = kind === 'interface' ? 'public' : 'private';
  const add = (name, entry) => {
    let arr = info.members.get(name);
    if (!arr) { arr = []; info.members.set(name, arr); }
    entry.info = info;
    const mods = entry.node.mods && entry.node.mods.has ? entry.node.mods : new Set();
    entry.access = entry.positional ? 'public' : accessOf(mods, defaultAccess, entry.node);
    entry.isStatic = !!(mods.has('static') || entry.node.isConst);
    arr.push(entry);
  };
  for (const m of decl.members) {
    switch (m.k) {
      case 'Field':
        for (const v of m.vars) add(v.name, { kind: m.isConst ? 'const' : 'field', node: m, v, type: m.type, name: v.name });
        break;
      case 'Event':
        if (m.fieldLike) for (const v of m.vars) add(v.name, { kind: 'event', node: m, v, type: m.type, name: v.name });
        else add(m.name, { kind: 'event', node: m, type: m.type, name: m.name });
        break;
      case 'Property': add(m.name, { kind: 'property', node: m, type: m.type, name: m.name }); break;
      case 'Indexer': add('this[]', { kind: 'indexer', node: m, type: m.type, name: 'this[]' }); break;
      case 'Method': add(m.name, { kind: 'method', node: m, type: m.retType, name: m.name }); break;
      case 'Ctor': add('.ctor', { kind: 'ctor', node: m, name: '.ctor' }); break;
      case 'Destructor': add('.dtor', { kind: 'dtor', node: m, name: '.dtor' }); break;
      case 'Operator': case 'Conversion': add(m.name, { kind: 'operator', node: m, type: m.retType, name: m.name }); break;
      case 'EnumMember': add(m.name, { kind: 'enum', node: m, name: m.name }); break;
      case 'TypeDecl': case 'Delegate': {
        const ni = registerType(project, pf, m, ns, info);
        add(m.name, { kind: 'type', node: m, name: m.name, typeInfo: ni });
        break;
      }
      default: break;
    }
    // extension methods
    if (m.k === 'Method' && m.params.length && m.params[0].mods.includes('this') && decl.mods.has('static')) {
      let arr = project.extMethods.get(m.name);
      if (!arr) { arr = []; project.extMethods.set(m.name, arr); }
      arr.push({ ns, method: m });
    }
  }
  if (decl.params && (kind === 'record' || kind === 'record struct')) {
    for (const p of decl.params) add(p.name, { kind: 'property', node: p, type: p.type, name: p.name, positional: true });
  }
  return info;
}

function accessOf(mods, def, node) {
  if (!mods || !mods.size) return node && node.iface ? 'public' : def;
  if (mods.has('public')) return 'public';
  if (mods.has('protected') && mods.has('internal')) return 'protected internal';
  if (mods.has('private') && mods.has('protected')) return 'private protected';
  if (mods.has('protected')) return 'protected';
  if (mods.has('internal')) return 'internal';
  if (mods.has('private')) return 'private';
  if (mods.has('file')) return 'internal';
  return node && node.iface ? 'public' : def;
}

function findType(project, name, arity, fromNs) {
  const arr = project.typesByName.get(name);
  if (!arr || !arr.length) return null;
  const cands = arity == null ? arr : arr.filter((t) => t.arity === arity);
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  if (fromNs) {
    const same = cands.find((t) => t.ns === fromNs);
    if (same) return same;
  }
  return cands[0];
}

function resolveBases(project) {
  for (const info of project.allTypeInfos) {
    for (const b of info.baseTypes) {
      const t = findType(project, b.name, (b.args || []).length, info.ns);
      if (t && t !== info) {
        if (t.kind === 'interface') info.ifaceInfos.push(t);
        else if (!info.baseInfo && (info.kind === 'class' || info.kind === 'record')) info.baseInfo = t;
        if (!t.derived.includes(info)) t.derived.push(info);
      } else if (!t) info.externalBases.push(b.name);
    }
  }
}

// ───────────────────────────────────────────── binding

function bindFile(project, pf) {
  const topScope = new Scope(null, false);
  const globals = pf.unit.members.filter((m) => m.k === 'GlobalStatement');
  if (globals.length) {
    const fn = { k: 'TopLevel', stmts: globals.map((g) => g.stmt), line: globals[0].line, col: globals[0].col, file: pf, parent: pf.unit };
    pf.topLevel = fn;
    const sc = topScope.child(true);
    const ctx = makeCtx(project, pf, null, fn);
    // local functions at top level are visible everywhere in the file
    for (const st of fn.stmts) if (st.k === 'LocalFunc') declareLocalFunc(st, sc, ctx);
    for (const st of fn.stmts) bind(st, sc, ctx, 'read');
    pf.funcs.push(fn);
  }
  for (const td of pf.types) bindType(project, pf, td, topScope);
}

function makeCtx(project, pf, info, fn) {
  return { project, pf, info, fn, symbols: fn ? (fn.symbols = fn.symbols || []) : [] };
}

function bindType(project, pf, td, topScope) {
  if (td.k !== 'TypeDecl') return;
  const info = td.typeInfo;
  let tscope = topScope.child(false);
  if (td.params) {
    for (const p of td.params) {
      const sym = new Symbol(p.name, 'param', { decl: p, type: p.type, primary: true, depth: 0 });
      tscope.vars.set(p.name, sym);
      p.sym = sym;
      info.primarySyms = info.primarySyms || [];
      info.primarySyms.push(sym);
    }
  }
  const funcOf = (m, fnNode) => {
    pf.funcs.push(fnNode);
    return makeCtx(project, pf, info, fnNode);
  };
  if (td.baseArgs) { const ctx = funcOf(td, td); for (const a of td.baseArgs) bind(a, tscope.child(true), ctx, 'read'); }
  for (const m of td.members) {
    try {
      bindMember(project, pf, td, info, m, tscope, funcOf);
    } catch (e) {
      if (process.env.SEMCS_DEBUG) throw e;
      m.bindError = true;
      td.broken = true;
      info.broken = true;
    }
  }
}

function declareParams(params, sc, ctx, fnNode) {
  for (const p of params || []) {
    if (!p.name) continue;
    const sym = new Symbol(p.name, 'param', { decl: p, type: p.type, depth: sc.depth, func: fnNode, refKind: p.mods.find((x) => x === 'ref' || x === 'out' || x === 'in') || null });
    if (p.mods.includes('out')) sym.outParam = true;
    p.sym = sym;
    sc.vars.set(p.name, sym);
    ctx.symbols.push(sym);
  }
}

function bindMember(project, pf, td, info, m, tscope, funcOf) {
  switch (m.k) {
    case 'Method': case 'Ctor': case 'Destructor': case 'Operator': case 'Conversion': {
      const ctx = funcOf(m, m);
      const sc = tscope.child(true);
      declareParams(m.params, sc, ctx, m);
      if (m.init) for (const a of m.init.args) bind(a, sc, ctx, 'read');
      if (m.body) bind(m.body, sc, ctx, 'read');
      if (m.exprBody) bind(m.exprBody, sc, ctx, 'read');
      break;
    }
    case 'Property': case 'Indexer': case 'Event': {
      if (m.exprBody) {
        const ctx = funcOf(m, m);
        const sc = tscope.child(true);
        if (m.k === 'Indexer') declareParams(m.params, sc, ctx, m);
        bind(m.exprBody, sc, ctx, 'read');
      }
      for (const acc of m.accessors || []) {
        acc.member = m;
        const ctx = funcOf(acc, acc);
        const sc = tscope.child(true);
        if (m.k === 'Indexer') declareParams(m.params, sc, ctx, acc);
        if (acc.kind !== 'get') {
          const sym = new Symbol('value', 'param', { decl: acc, type: m.type, depth: sc.depth, func: acc, implicitValue: true });
          sc.vars.set('value', sym);
          ctx.symbols.push(sym);
          acc.valueSym = sym;
        }
        if (acc.body) bind(acc.body, sc, ctx, 'read');
        if (acc.exprBody) bind(acc.exprBody, sc, ctx, 'read');
      }
      if (m.init) { const ctx = funcOf(m, { k: 'Initializer', member: m, line: m.line, col: m.col, parent: m }); bind(m.init, tscope.child(true), ctx, 'read'); }
      if (m.vars) for (const v of m.vars) if (v.init) { const ctx = funcOf(m, { k: 'Initializer', member: m, line: v.line, col: v.col, parent: m }); bind(v.init, tscope.child(true), ctx, 'read'); }
      break;
    }
    case 'Field':
      for (const v of m.vars) {
        if (v.init) {
          const fn = { k: 'Initializer', member: m, v, line: v.line, col: v.col, parent: m };
          const ctx = funcOf(m, fn);
          bind(v.init, tscope.child(true), ctx, 'read');
        }
      }
      break;
    case 'EnumMember':
      if (m.value) { const ctx = makeCtx(project, pf, info, null); bind(m.value, tscope.child(true), ctx, 'read'); }
      break;
    case 'TypeDecl':
      bindType(project, pf, m, tscope);
      break;
    default: break;
  }
}

function declare(sc, name, sym, ctx) {
  if (!name || name === '_') return null;
  sym.depth = sc.depth;
  sym.func = ctx.fn;
  sc.vars.set(name, sym);
  ctx.symbols.push(sym);
  return sym;
}

function declareDesignation(d, sc, ctx, kind, node) {
  if (!d) return;
  if (d.k === 'SingleDesignation') {
    if (d.discard) return;
    const sym = declare(sc, d.name, new Symbol(d.name, kind, { decl: d, declNode: node }), ctx);
    d.sym = sym;
    if (sym) { sym.writes.push(d); }
  } else if (d.k === 'ParenDesignation') {
    for (const x of d.items) declareDesignation(x, sc, ctx, kind, node);
  }
}

function declareLocalFunc(lf, sc, ctx) {
  const sym = new Symbol(lf.name, 'localfunc', { decl: lf, type: lf.retType });
  declare(sc, lf.name, sym, ctx);
  lf.sym = sym;
}

function predeclare(stmts, sc, ctx) {
  for (const st of stmts) if (st.k === 'LocalFunc') declareLocalFunc(st, sc, ctx);
}

function resolveName(node, sc, ctx, mode) {
  const sym = sc.lookup(node.name);
  if (sym) {
    node.sym = sym;
    sym.refs.push(node);
    if (mode === 'write') { sym.writes.push(node); node.isWrite = true; }
    else if (mode === 'rw') { sym.writes.push(node); sym.reads++; node.isWrite = true; node.isRead = true; }
    else if (mode === 'nameof') { sym.nameofRefs++; }
    else { sym.reads++; node.isRead = true; }
    if (sc.depth > sym.depth) {
      sym.captured = true;
      if (mode === 'write' || mode === 'rw') sym.capturedWrite = true;
    }
    return;
  }
  if (ctx.info) {
    const entries = lookupMemberFrom(ctx.info, node.name);
    if (entries) {
      node.msym = entries;
      if (mode === 'write' || mode === 'rw') node.isWrite = true;
      if (mode !== 'write') node.isRead = true;
    }
  }
}

function lookupMemberFrom(info, name) {
  for (let t = info; t; t = t.outer) {
    const r = t.lookup(name);
    if (r) return r;
  }
  return null;
}

function bind(node, sc, ctx, mode) {
  if (!node || typeof node !== 'object') return;
  switch (node.k) {
    case 'Block': {
      const s2 = sc.child(false);
      predeclare(node.stmts, s2, ctx);
      for (const st of node.stmts) bind(st, s2, ctx, 'read');
      return;
    }
    case 'LocalDecl': {
      for (const v of node.vars) {
        if (v.init) bind(v.init, sc, ctx, 'read');
        if (v.size) bind(v.size, sc, ctx, 'read');
        const sym = declare(sc, v.name, new Symbol(v.name, 'local', { decl: v, declStmt: node, type: node.type, init: v.init, isConst: node.isConst, isUsing: node.isUsing, isRef: !!(node.mods && node.mods.has && node.mods.has('ref')) }), ctx);
        v.sym = sym;
        if (sym && v.init) sym.writes.push(v);
      }
      if (node.designation) {
        bind(node.deconInit, sc, ctx, 'read');
        declareDesignation(node.designation, sc, ctx, 'local', node);
      }
      return;
    }
    case 'LocalFunc': {
      if (!node.sym) declareLocalFunc(node, sc, ctx);
      const s2 = sc.child(true);
      const fctx = { ...ctx, fn: ctx.fn };
      declareParams(node.params, s2, fctx, node);
      node.parentFn = ctx.fn;
      if (node.body) bind(node.body, s2, fctx, 'read');
      if (node.exprBody) bind(node.exprBody, s2, fctx, 'read');
      return;
    }
    case 'Lambda': {
      const s2 = sc.child(true);
      declareParams(node.params, s2, ctx, node);
      bind(node.body, s2, ctx, 'read');
      return;
    }
    case 'Foreach': {
      bind(node.expr, sc, ctx, 'read');
      const s2 = sc.child(false);
      if (node.name) {
        const sym = declare(s2, node.name, new Symbol(node.name, 'foreach', { decl: node, type: node.type }), ctx);
        node.sym = sym;
      } else if (node.designation) {
        if (node.designation.k === 'ParenDesignation' || node.designation.k === 'SingleDesignation') declareDesignation(node.designation, s2, ctx, 'foreach', node);
        else bind(node.designation, s2, ctx, 'write');
      }
      bind(node.body, s2, ctx, 'read');
      return;
    }
    case 'For': {
      const s2 = sc.child(false);
      for (const x of node.init) bind(x, s2, ctx, 'read');
      if (node.cond) bind(node.cond, s2, ctx, 'read');
      for (const x of node.step) bind(x, s2, ctx, 'read');
      bind(node.body, s2, ctx, 'read');
      return;
    }
    case 'Using': case 'Fixed': {
      const s2 = sc.child(false);
      if (node.decl) bind(node.decl, s2, ctx, 'read');
      if (node.expr) bind(node.expr, s2, ctx, 'read');
      bind(node.body, s2, ctx, 'read');
      return;
    }
    case 'Try': {
      bind(node.block, sc, ctx, 'read');
      for (const c of node.catches) {
        const s2 = sc.child(false);
        if (c.name) { const sym = declare(s2, c.name, new Symbol(c.name, 'catch', { decl: c, type: c.type }), ctx); c.sym = sym; }
        if (c.when) bind(c.when, s2, ctx, 'read');
        bind(c.block, s2, ctx, 'read');
      }
      if (node.fin) bind(node.fin, sc, ctx, 'read');
      return;
    }
    case 'Switch': {
      bind(node.expr, sc, ctx, 'read');
      const s2 = sc.child(false);
      for (const sec of node.sections) {
        const s3 = s2.child(false);
        for (const lab of sec.labels) {
          if (lab.pattern) bind(lab.pattern, s3, ctx, 'read');
          if (lab.when) bind(lab.when, s3, ctx, 'read');
        }
        predeclare(sec.stmts, s3, ctx);
        for (const st of sec.stmts) bind(st, s3, ctx, 'read');
      }
      return;
    }
    case 'SwitchExpr': {
      bind(node.expr, sc, ctx, 'read');
      for (const arm of node.arms) {
        const s2 = sc.child(false);
        bind(arm.pattern, s2, ctx, 'read');
        if (arm.when) bind(arm.when, s2, ctx, 'read');
        bind(arm.expr, s2, ctx, 'read');
      }
      return;
    }
    case 'Query': {
      const s2 = sc.child(true);
      node.clauses.forEach((cl, i) => {
        switch (cl.k) {
          case 'QFrom': case 'QJoin':
            bind(cl.expr, i === 0 ? sc : s2, ctx, 'read');
            if (cl.on) bind(cl.on, s2, ctx, 'read');
            cl.sym = declare(s2, cl.name, new Symbol(cl.name, 'range', { decl: cl, type: cl.type }), ctx);
            if (cl.equals) bind(cl.equals, s2, ctx, 'read');
            if (cl.into) declare(s2, cl.into, new Symbol(cl.into, 'range', { decl: cl }), ctx);
            break;
          case 'QLet':
            bind(cl.expr, s2, ctx, 'read');
            cl.sym = declare(s2, cl.name, new Symbol(cl.name, 'range', { decl: cl }), ctx);
            break;
          case 'QInto':
            cl.sym = declare(s2, cl.name, new Symbol(cl.name, 'range', { decl: cl }), ctx);
            break;
          case 'QOrderBy':
            for (const k of cl.keys) bind(k.expr, s2, ctx, 'read');
            break;
          case 'QGroup':
            bind(cl.expr, s2, ctx, 'read'); bind(cl.by, s2, ctx, 'read');
            break;
          default:
            if (cl.expr) bind(cl.expr, s2, ctx, 'read');
        }
      });
      return;
    }
    case 'DeclExpr': {
      if (node.designation) declareDesignation(node.designation, sc, ctx, 'out', node);
      return;
    }
    case 'DeclPattern': {
      if (node.name && node.name !== '_') {
        const sym = declare(sc, node.name, new Symbol(node.name, 'pattern', { decl: node, type: node.type }), ctx);
        node.sym = sym;
        if (sym) sym.writes.push(node);
      }
      return;
    }
    case 'VarPattern': declareDesignation(node.designation, sc, ctx, 'pattern', node); return;
    case 'RecursivePattern': {
      for (const sp of node.positional || []) bind(sp.pattern, sc, ctx, 'read');
      for (const pp of node.props || []) bind(pp.pattern, sc, ctx, 'read');
      if (node.name && node.name !== '_') { const sym = declare(sc, node.name, new Symbol(node.name, 'pattern', { decl: node, type: node.type }), ctx); node.sym = sym; if (sym) sym.writes.push(node); }
      return;
    }
    case 'ListPattern': {
      for (const p of node.items) bind(p, sc, ctx, 'read');
      if (node.name) { const sym = declare(sc, node.name, new Symbol(node.name, 'pattern', { decl: node }), ctx); node.sym = sym; if (sym) sym.writes.push(node); }
      return;
    }
    case 'ConstPattern': bind(node.expr, sc, ctx, 'read'); return;
    case 'Assign':
      bind(node.left, sc, ctx, node.op === '=' ? 'write' : 'rw');
      bind(node.right, sc, ctx, 'read');
      return;
    case 'Unary':
      bind(node.operand, sc, ctx, node.op === '++' || node.op === '--' ? 'rw' : 'read');
      return;
    case 'Arg':
      if (node.refKind === 'out') bind(node.expr, sc, ctx, 'write');
      else if (node.refKind === 'ref') { bind(node.expr, sc, ctx, 'rw'); markByRef(node.expr); }
      else bind(node.expr, sc, ctx, 'read');
      return;
    case 'Name': resolveName(node, sc, ctx, mode); return;
    case 'Member':
      bind(node.expr, sc, ctx, 'read');
      if (mode === 'write' || mode === 'rw') node.anyWrite = true;
      if (mode === 'rw') node.anyRead = true;
      if (ctx.info && (node.expr.k === 'This' || node.expr.k === 'Base')) {
        const entries = lookupMemberFrom(ctx.info, node.name);
        if (entries) node.msym = entries;
        if (mode === 'write' || mode === 'rw') node.isWrite = true;
        if (mode !== 'write') node.isRead = true;
      }
      return;
    case 'Paren': case 'SuppressNull': bind(node.expr, sc, ctx, mode); return;
    case 'Tuple': for (const e of node.elems) bind(e.expr, sc, ctx, mode === 'write' ? 'write' : 'read'); return;
    case 'TupleArg': bind(node.expr, sc, ctx, mode); return;
    case 'Invocation': {
      const callee = node.expr;
      if (callee.k === 'Name' && callee.name === 'nameof' && !sc.lookup('nameof')) {
        for (const a of node.args) bindNameof(a.expr, sc, ctx);
        return;
      }
      bind(callee, sc, ctx, 'read');
      for (const a of node.args) bind(a, sc, ctx, 'read');
      return;
    }
    case 'MemberInit': bind(node.value, sc, ctx, 'read'); return;
    case 'Type': case 'Typeof': case 'Sizeof': case 'Default': case 'PredefType': case 'TypeParam': case 'Attribute': return;
    case 'Cast': bind(node.expr, sc, ctx, 'read'); return;
    case 'As': bind(node.expr, sc, ctx, 'read'); return;
    case 'DeclPatternType': return;
    case 'TypePattern': return;
    default:
      forEachChild(node, (c) => {
        if (c.k === 'Type') return;
        bind(c, sc, ctx, 'read');
      });
  }
}

function bindNameof(e, sc, ctx) {
  if (!e) return;
  if (e.k === 'Name') { resolveName(e, sc, ctx, 'nameof'); return; }
  if (e.k === 'Member') { bindNameof(e.expr, sc, ctx); }
}

function markByRef(e) {
  while (e && e.k === 'Paren') e = e.expr;
  if (e && e.k === 'Name' && e.sym) e.sym.byRef = true;
}

function hasAttr(node, names) { return !!attrNamed(node && node.attrs, names); }

module.exports = { buildProject, TypeInfo, Symbol, findType, lookupMemberFrom, hasAttr };
