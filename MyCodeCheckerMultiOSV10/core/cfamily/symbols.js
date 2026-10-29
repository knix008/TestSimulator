'use strict';

// Semantic analysis of one translation unit: scopes, symbol table (linkage,
// storage duration, declarations vs definitions, tentative definitions),
// types of declarations and expressions (node.ctype), identifier resolution
// (Identifier.symbol). See AST.md "Symbols".
//
// analyzeUnit(ast, opts) -> { fileScope, symbols, externals, unresolved, diagnostics, lookup(name) }

const Ty = require('./types');
const { T } = Ty;
const { directFunction, declLeaf } = require('./parser');

let SYMBOL_ID = 0;

class Scope {
  constructor(kind, parent, node, name) {
    this.kind = kind; // 'file' | 'namespace' | 'class' | 'function' | 'block' | 'prototype' | 'template' | 'enum'
    this.parent = parent || null;
    this.node = node || null;
    this.name = name || null;
    this.names = new Map();
    this.tags = new Map();
    this.labels = kind === 'function' ? new Map() : null;
    this.usings = [];
    this.children = new Map();
    this.record = null;
    this.anonymous = false;
  }
  qualifiedName() {
    const parts = [];
    let s = this;
    while (s) {
      if ((s.kind === 'namespace' || s.kind === 'class' || s.kind === 'enum') && s.name) parts.unshift(s.name);
      s = s.parent;
    }
    return parts.join('::');
  }
}

const NORETURN_NAMES = new Set(['exit', 'abort', '_Exit', 'quick_exit', 'longjmp', '_longjmp', 'siglongjmp', '__assert_fail', '__builtin_unreachable', '__builtin_trap', 'pthread_exit', 'thrd_exit', '_exit', 'std::exit', 'std::abort', 'std::terminate', 'terminate', 'std::quick_exit', 'std::_Exit', 'std::unreachable', 'ExitProcess', 'err', 'errx', '__cxa_throw']);

function knownTypedefs(target) {
  const tg = Ty.resolveTarget(target);
  const L8 = tg.long === 8;
  const P8 = tg.pointer === 8;
  const m = {
    int8_t: T.schar, uint8_t: T.uchar, int16_t: T.short, uint16_t: T.ushort, int32_t: T.int, uint32_t: T.uint,
    int64_t: L8 ? T.long : T.llong, uint64_t: L8 ? T.ulong : T.ullong,
    int_least8_t: T.schar, uint_least8_t: T.uchar, int_least16_t: T.short, uint_least16_t: T.ushort,
    int_least32_t: T.int, uint_least32_t: T.uint, int_least64_t: L8 ? T.long : T.llong, uint_least64_t: L8 ? T.ulong : T.ullong,
    size_t: Ty.sizeTType(tg), ssize_t: Ty.ptrdiffTType(tg), ptrdiff_t: Ty.ptrdiffTType(tg),
    intptr_t: P8 ? (L8 ? T.long : T.llong) : T.int, uintptr_t: P8 ? (L8 ? T.ulong : T.ullong) : T.uint,
    intmax_t: L8 ? T.long : T.llong, uintmax_t: L8 ? T.ulong : T.ullong, wint_t: T.uint, char16_t: T.ushort, char32_t: T.uint,
  };
  const out = new Map();
  for (const [k, v] of Object.entries(m)) {
    out.set(k, v);
    out.set('std::' + k, v);
  }
  return out;
}

class Sema {
  constructor(opts = {}) {
    this.opts = opts;
    this.cpp = opts.lang === 'cpp';
    this.target = Ty.resolveTarget(opts.target);
    this.file = opts.file || '<input>';
    this.diagnostics = [];
    this.symbols = [];
    this.unresolved = [];
    this.fileScope = new Scope('file', null, null, null);
    this.fnStack = [];
    this.classStack = [];
    this.known = knownTypedefs(this.target);
    this.externC = 0;
    this.booleanTypedefs = new Set(opts.booleanTypedefs || []);
    this.deferred = [];
  }

  diag(severity, code, message, node) {
    const l = node && node.loc;
    this.diagnostics.push({ severity, code, message, file: l ? l.file : this.file, line: l ? l.line : 0, col: l ? l.col : 0 });
  }

  newSymbol(props) {
    const s = {
      id: ++SYMBOL_ID, name: props.name, qname: props.qname || props.name, kind: props.kind, type: props.type || T.unknown,
      linkage: props.linkage || 'none', storage: props.storage || 'none', scope: props.scope || null,
      decls: [], definition: null, tentative: [], uses: [], file: props.file || this.file,
      isStatic: false, isExtern: false, isInline: false, member: false, value: null, ...props,
    };
    if (!s.decls) s.decls = [];
    this.symbols.push(s);
    return s;
  }

  // nearest scope that can own a declaration (template scopes are transparent)
  declScope(scope) {
    let s = scope;
    while (s && s.kind === 'template') s = s.parent;
    return s || this.fileScope;
  }

  isFileLevel(scope) {
    const s = this.declScope(scope);
    return s.kind === 'file' || s.kind === 'namespace';
  }

  inAnonymousNamespace(scope) {
    for (let s = scope; s; s = s.parent) if (s.kind === 'namespace' && s.anonymous) return true;
    return false;
  }

  // ------------------------------------------------------------ lookup

  lookup(name, scope, opts = {}) {
    const seen = opts.seen || new Set();
    for (let s = scope; s; s = s.parent) {
      const r = this.lookupIn(s, name, opts, seen);
      if (r) return r;
    }
    return null;
  }

  lookupIn(s, name, opts, seen) {
    if (seen.has(s)) return null;
    seen.add(s);
    const map = opts.tag && !this.cpp ? s.tags : s.names;
    let r = map.get(name);
    if (!r && opts.tag && this.cpp) r = s.tags.get(name);
    if (r && opts.typeOnly && !isTypeSymbol(r)) {
      // a constructor (or another non-type member) hides the class name in its scope:
      // a type lookup sees the tag or, inside the class, the injected class name.
      r = s.tags.get(name) || null;
      if (r && !isTypeSymbol(r)) r = null;
      if (!r && s.kind === 'class' && s.record && s.record.decl && s.record.decl.name === name && s.record.decl.symbol) r = s.record.decl.symbol;
    }
    if (r) return r;
    if (s.kind === 'class' && s.record && s.record.bases) {
      for (const b of s.record.bases) {
        const bt = Ty.canonical(b);
        if (bt.kind === 'record' && bt.scope) {
          const x = this.lookupIn(bt.scope, name, opts, seen);
          if (x) return x;
        }
      }
    }
    for (const u of s.usings) {
      const x = this.lookupIn(u, name, opts, seen);
      if (x) return x;
    }
    seen.delete(s);
    return null;
  }

  // resolve 'a::b' prefix to a scope
  resolveScopePath(qualifier, scope, global) {
    if (!qualifier) return global ? this.fileScope : scope;
    const parts = qualifier.split('::').filter(Boolean);
    let cur = null;
    const first = parts[0];
    const start = global ? this.fileScope : scope;
    for (let s = start; s && !cur; s = s.parent) {
      const c = s.children.get(first);
      if (c) cur = c;
      else {
        const sym = s.names.get(first) || s.tags.get(first);
        if (sym && sym.kind === 'namespace') cur = sym.nsScope;
        else if (sym && (sym.kind === 'tag' || sym.kind === 'typedef')) {
          const t = Ty.canonical(sym.type);
          if ((t.kind === 'record' || t.kind === 'enum') && t.scope) cur = t.scope;
        }
        if (!cur) for (const u of s.usings) { const c2 = u.children.get(first); if (c2) { cur = c2; break; } }
      }
      if (global) break;
    }
    if (!cur) return null;
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      let n = cur.children.get(p);
      if (!n) {
        const sym = cur.names.get(p) || cur.tags.get(p);
        if (sym && (sym.kind === 'tag' || sym.kind === 'typedef')) {
          const t = Ty.canonical(sym.type);
          if (t.scope) n = t.scope;
        }
        if (!n) for (const u of cur.usings) { const c2 = u.children.get(p); if (c2) { n = c2; break; } }
      }
      if (!n) return null;
      cur = n;
    }
    return cur;
  }

  // `A::f` defined where class/namespace A is not declared (missing header):
  // a placeholder scope (kind 'namespace', `unresolvedQualifier: true`) keeps
  // the qualifier in the qname and stops the member merging with `owner::f`.
  placeholderScope(qualifier, owner) {
    let cur = owner;
    for (const part of qualifier.replace(/^::/, '').split('::').filter(Boolean)) {
      let n = cur.children.get(part);
      if (!n) {
        n = new Scope('namespace', cur, null, part.replace(/<.*$/, ''));
        n.unresolvedQualifier = true;
        cur.children.set(part, n);
      }
      cur = n;
    }
    return cur;
  }

  lookupQualified(node, scope, opts = {}) {
    const qualifier = node.qualifier || '';
    if (!qualifier && !node.global) return this.lookup(node.name, scope, opts);
    const s = this.resolveScopePath(qualifier, scope, node.global);
    if (!s) return null;
    return this.lookupIn(s, node.name, opts, new Set());
  }

  // ------------------------------------------------------------ entry

  run(ast) {
    for (const d of ast.decls) {
      try {
        this.visitTop(d, this.fileScope);
      } catch (e) {
        if (!(e instanceof RangeError)) throw e;
        this.fnStack.length = 0;
        this.classStack.length = 0;
        this.templateDepth = 0;
        this.pendingBodies = null;
        this.diag('error', 'sema-too-deep', 'Nesting too deep for semantic analysis; declaration partly analysed', d);
      }
    }
    for (const job of this.deferred) job();
    this.deferred = [];
    // tentative definitions become definitions at the end of the unit
    for (const s of this.symbols) {
      const first = s.definition || s.decls[0];
      if (first && first.loc && first.loc.file) s.file = first.loc.file;
      s.system = typeof s.file === 'string' && s.file.startsWith('<');
      if (s.kind === 'variable' && !s.definition && s.tentative.length) {
        s.definition = s.tentative[0];
        s.tentativeDefinition = true;
      }
    }
    return this;
  }

  visitTop(d, scope) {
    if (!d) return;
    switch (d.type) {
      case 'Declaration': return this.visitDeclaration(d, scope, scope.kind === 'class' ? 'class' : 'file');
      case 'NamespaceDecl': return this.visitNamespace(d, scope);
      case 'LinkageSpec':
        if (d.language === 'C') this.externC++;
        for (const x of d.decls) this.visitTop(x, scope);
        if (d.language === 'C') this.externC--;
        return;
      case 'TemplateDecl': return this.visitTemplate(d, scope);
      case 'UsingDirective': return this.visitUsingDirective(d, scope);
      case 'UsingDecl': return this.visitUsingDecl(d, scope);
      case 'AliasDecl': return this.visitAlias(d, scope);
      case 'NamespaceAlias': {
        const target = this.resolveScopePath(d.target, scope, false);
        if (target) scope.children.set(d.name, target);
        return;
      }
      case 'StaticAssert': return this.visitStaticAssert(d, scope);
      default: return;
    }
  }

  visitNamespace(d, scope) {
    const owner = this.declScope(scope);
    if (d.anonymous) {
      const ns = new Scope('namespace', owner, d, null);
      ns.anonymous = true;
      owner.usings.push(ns);
      d.scope = ns;
      for (const x of d.decls) this.visitTop(x, ns);
      return;
    }
    let cur = owner;
    for (const part of d.name.split('::')) {
      let ns = cur.children.get(part);
      if (!ns) {
        ns = new Scope('namespace', cur, d, part);
        cur.children.set(part, ns);
        const sym = this.newSymbol({ name: part, qname: ns.qualifiedName(), kind: 'namespace', scope: cur, type: T.unknown });
        sym.nsScope = ns;
        cur.names.set(part, sym);
        if (d.inline) cur.usings.push(ns);
      }
      cur = ns;
    }
    d.scope = cur;
    for (const x of d.decls) this.visitTop(x, cur);
  }

  visitUsingDirective(d, scope) {
    const s = this.resolveScopePath(d.name.replace(/^::/, ''), scope, d.name.startsWith('::'));
    if (s && !scope.usings.includes(s)) scope.usings.push(s);
  }

  visitUsingDecl(d, scope) {
    for (const qn of d.names || [d.qname]) {
      const i = qn.lastIndexOf('::');
      const node = { name: qn.slice(i + 2), qualifier: qn.slice(0, i).replace(/^::/, ''), global: qn.startsWith('::') };
      const sym = this.lookupQualified(node, scope);
      if (sym) {
        this.declScope(scope).names.set(node.name, sym);
        if (sym.kind === 'tag') this.declScope(scope).tags.set(node.name, sym);
      }
    }
  }

  visitAlias(d, scope) {
    const t = this.typeOfTypeName(d.typeName, scope);
    const sym = this.newSymbol({ name: d.name, qname: this.qual(scope, d.name), kind: 'typedef', type: t, scope: this.declScope(scope) });
    sym.decls.push(d);
    sym.definition = d;
    this.declScope(scope).names.set(d.name, sym);
    d.symbol = sym;
    d.ctype = Ty.typedefType(d.name, t, d);
  }

  visitTemplate(d, scope) {
    const ts = new Scope('template', scope, d, null);
    for (const p of d.params || []) {
      if (!p.name) continue;
      if (p.kind === 'nontype') {
        const t = p.param ? this.typeOfParam(p.param, ts) : T.int;
        const sym = this.newSymbol({ name: p.name, kind: 'templateParam', type: t, scope: ts });
        ts.names.set(p.name, sym);
      } else {
        const sym = this.newSymbol({ name: p.name, kind: 'typedef', type: { kind: 'dependent', name: p.name }, scope: ts, templateParam: true });
        ts.names.set(p.name, sym);
      }
      p.symbol = ts.names.get(p.name);
    }
    this.templateDepth = (this.templateDepth || 0) + 1;
    try {
      if (d.decl) {
        if (d.decl.type === 'ConceptDecl') return;
        this.visitTop(d.decl, ts);
        if (d.decl.type === 'Declaration') {
          for (const x of d.decl.declarators) if (x.symbol) x.symbol.template = true;
          const ts2 = d.decl.specs && d.decl.specs.typeSpec;
          if (ts2 && ts2.ctype && ts2.type === 'RecordDecl') ts2.ctype.template = true;
        }
      }
    } finally {
      this.templateDepth--;
    }
  }

  visitStaticAssert(d, scope) {
    this.expr(d.cond, scope);
    if (d.message) this.expr(d.message, scope);
    const v = Ty.constValue(d.cond, { target: this.target, allowConstVars: this.cpp });
    d.value = v ? v.value !== 0n : null;
    if (v && v.value === 0n && !this.templateDepth) this.diag('error', 'static-assert-failed', 'Static assertion failed', d);
  }

  qual(scope, name) {
    const q = this.declScope(scope).qualifiedName();
    return q ? q + '::' + name : name;
  }

  // ------------------------------------------------------------ types of specifiers / declarators

  specType(specs, scope, ctx) {
    if (!specs) return T.int;
    if (specs.ctype && ctx !== 'force') return specs.ctype;
    let t;
    const ts = specs.typeSpec;
    if (!ts) t = this.cpp ? T.int : T.int;
    else {
      switch (ts.type) {
        case 'BuiltinType': {
          let bits = 0;
          if (ts.bits) {
            this.expr(ts.bits, scope);
            const v = Ty.constValue(ts.bits, { target: this.target });
            bits = v ? Number(v.value) : 0;
          }
          t = Ty.builtinFromNames(ts.names, bits);
          break;
        }
        case 'NamedType': t = this.resolveNamedType(ts, scope); break;
        case 'RecordDecl': t = this.visitRecord(ts, scope, specs); break;
        case 'EnumDecl': t = this.visitEnum(ts, scope); break;
        case 'TypeofType': t = ts.arg && ts.arg.type === 'TypeName' ? this.typeOfTypeName(ts.arg, scope) : this.expr(ts.arg, scope); if (ts.unqual) t = Ty.unqualified(t); break;
        case 'DecltypeType': t = ts.expr ? this.declTypeOf(ts.expr, scope) : { kind: 'auto', decltype: true }; break;
        case 'AutoType': t = { kind: 'auto' }; break;
        case 'AtomicType': t = Ty.withQuals(this.typeOfTypeName(ts.typeName, scope), { atomic: true }); break;
        default: t = T.unknown;
      }
      ts.ctype = t;
    }
    const q = {};
    for (const x of specs.qualifiers) q[x] = true;
    t = Ty.withQuals(t, q);
    specs.ctype = t;
    return t;
  }

  declTypeOf(expr, scope) {
    const t = this.expr(expr, scope);
    if (expr.type === 'Identifier' || expr.type === 'MemberExpr') return t;
    const vc = Ty.valueCategory(expr, { lang: 'cpp' });
    if (vc === 'lvalue') return Ty.referenceTo(t, false);
    if (vc === 'xvalue') return Ty.referenceTo(t, true);
    return t;
  }

  resolveNamedType(nt, scope) {
    if (nt.templateArgs) for (const a of nt.templateArgs) this.templateArg(a, scope);
    let sym = this.lookupQualified(nt, scope);
    if (sym && this.cpp && !isTypeSymbol(sym)) sym = this.lookupQualified(nt, scope, { typeOnly: true }) || sym;
    if (sym) {
      nt.symbol = sym;
      if (sym.kind === 'typedef') {
        if (sym.templateParam || (sym.type && sym.type.kind === 'dependent')) return sym.type;
        if (!sym.typedefType) sym.typedefType = Ty.typedefType(sym.name, sym.type, sym.definition || sym.decls[0]);
        sym.uses.push(nt);
        return sym.typedefType;
      }
      if (sym.kind === 'tag') { sym.uses.push(nt); return sym.type; }
    }
    const k = this.known.get(nt.qname.replace(/^::/, '')) || this.known.get(nt.name);
    if (k && (!nt.qualifier || nt.qualifier === 'std')) return Ty.typedefType(nt.name, k, null);
    if (nt.qualifier && this.isDependentQualifier(nt.qualifier, scope)) return { kind: 'dependent', name: nt.qname };
    return Ty.unknownType(nt.qname);
  }

  isDependentQualifier(q, scope) {
    const first = q.split('::')[0];
    const s = this.lookup(first, scope);
    return !!(s && s.templateParam);
  }

  templateArg(a, scope) {
    if (!a) return;
    if (a.type === 'TypeName') this.typeOfTypeName(a, scope);
    else if (a.type === 'PackExpansion') this.templateArg(a.expr, scope);
    else this.expr(a, scope);
  }

  typeOfTypeName(tn, scope) {
    if (!tn) return T.unknown;
    if (tn.ctype) return tn.ctype;
    const base = this.specType(tn.specs, scope);
    const t = this.applyDeclarator(tn.declarator, base, scope, null);
    tn.ctype = t;
    return t;
  }

  typeOfParam(p, scope) {
    if (p.krIdentifier) return T.int;
    const base = this.specType(p.specs, scope);
    let t = this.applyDeclarator(p.declarator, base, scope, null);
    p.declaredType = t;
    // parameter adjustment
    const c = Ty.canonical(t);
    if (c.kind === 'array') t = Ty.withQuals(Ty.pointerTo(c.of), arrayParamQuals(p.declarator));
    else if (c.kind === 'function') t = Ty.pointerTo(t);
    p.ctype = t;
    if (p.default) this.expr(p.default, scope);
    return t;
  }

  // Apply declarator derivations to a base type (outermost node first).
  applyDeclarator(d, base, scope, owner) {
    let t = base;
    let guard = 0;
    while (d && guard++ < 500) {
      switch (d.type) {
        case 'IdentDeclarator': case 'AbstractDeclarator': case 'BindingDeclarator':
          return t;
        case 'PointerDeclarator': {
          const q = {};
          for (const x of d.quals) q[x] = true;
          t = Ty.withQuals(Ty.pointerTo(t), q);
          break;
        }
        case 'ReferenceDeclarator': t = Ty.referenceTo(t, d.rvalue); break;
        case 'MemberPointerDeclarator': t = { kind: 'memberPointer', cls: d.cls, to: t }; break;
        case 'ArrayDeclarator': {
          let size = null, vla = false;
          if (d.size) {
            this.expr(d.size, scope);
            const v = Ty.constValue(d.size, { target: this.target, allowConstVars: this.cpp });
            if (v && !v.float) {
              size = Number(v.value);
              if (v.value <= 0n && !(v.value === 0n)) this.diag('error', 'array-size-negative', 'Array size is negative', d.size);
            } else vla = !this.templateDepth;
          } else if (d.star) vla = true;
          t = Ty.arrayOf(t, size, vla ? { vla: true, sizeExpr: d.size } : (d.size ? { sizeExpr: d.size } : null));
          break;
        }
        case 'FunctionDeclarator': {
          const ps = new Scope('prototype', scope, d, null);
          const params = [];
          for (const p of d.params) {
            const pt = this.typeOfParam(p, ps);
            params.push(pt);
            if (p.name) {
              const sym = this.newSymbol({ name: p.name, kind: 'parameter', type: pt, scope: ps, storage: 'automatic' });
              ps.names.set(p.name, sym);
            }
          }
          let ret = t;
          if (d.trailingReturn) ret = this.typeOfTypeName(d.trailingReturn, ps);
          if (d.noexceptExpr) this.expr(d.noexceptExpr, ps);
          t = Ty.functionType(ret, params, d.variadic, {
            prototype: !d.noPrototype && !d.krIdentifiers,
            quals: d.quals.length ? d.quals.slice() : undefined,
            refQual: d.refQual || undefined,
            noexcept: d.noexcept || undefined,
          });
          d.ctype = t;
          break;
        }
        default: return t;
      }
      d = d.inner;
    }
    return t;
  }

  // ------------------------------------------------------------ records / enums

  visitRecord(rd, scope, specs) {
    const owner = this.declScope(scope);
    const tagKey = rd.name;
    let sym = null;
    if (tagKey) {
      if (rd.qualifier) {
        const s = this.resolveScopePath(rd.qualifier, scope, false);
        if (s) sym = s.tags.get(tagKey) || null;
      } else if (rd.isDefinition || (specs && specs.isForwardDecl)) {
        sym = owner.tags.get(tagKey) || null;
      } else {
        sym = this.lookup(tagKey, scope, { tag: true });
        if (sym && sym.kind !== 'tag') sym = null;
      }
    }
    let type;
    if (sym && Ty.canonical(sym.type).kind === 'record' && !(rd.templateArgs && !sym.type.templateArgs)) {
      type = sym.type;
    } else {
      type = { kind: 'record', tag: rd.tag, name: rd.name || null, decl: rd, fields: [], complete: false, cpp: this.cpp, id: ++SYMBOL_ID, scope: null, bases: [] };
      if (tagKey) {
        sym = this.newSymbol({ name: tagKey, qname: this.qual(owner, tagKey), kind: 'tag', type, scope: owner, tag: rd.tag });
        owner.tags.set(tagKey, sym);
        if (this.cpp && !owner.names.has(tagKey)) owner.names.set(tagKey, sym);
      }
    }
    if (rd.templateArgs) for (const a of rd.templateArgs) this.templateArg(a, scope);
    if (sym) {
      if (!sym.decls.includes(rd)) sym.decls.push(rd);
      rd.symbol = sym;
    }
    rd.ctype = type;
    if (!rd.isDefinition) return type;
    if (type.complete && type.decl !== rd) {
      this.diag('error', 'redefinition', `Redefinition of '${rd.tag} ${rd.name}'`, rd);
      type = { ...type, fields: [], complete: false, decl: rd, id: ++SYMBOL_ID };
      rd.ctype = type;
    }
    type.decl = rd;
    if (sym) sym.definition = rd;
    const cls = new Scope('class', scope, rd, rd.name || null);
    cls.record = type;
    type.scope = cls;
    if (rd.name) owner.children.set(rd.name, cls);
    type.bases = [];
    for (const b of rd.bases || []) {
      const bt = this.resolveNamedType({ name: b.name, qualifier: b.qname.includes('::') ? b.qname.slice(0, b.qname.lastIndexOf('::')).replace(/^::/, '') : '', qname: b.qname, templateArgs: b.templateArgs, global: b.qname.startsWith('::') }, scope);
      b.ctype = bt;
      type.bases.push(bt);
    }
    this.classStack.push(type);
    const bodies = [];
    try {
      for (const m of rd.members) this.visitMember(m, cls, type, bodies);
    } finally {
      this.classStack.pop();
    }
    type.complete = true;
    const run = () => {
      this.classStack.push(type);
      try {
        for (const job of bodies) job();
      } finally {
        this.classStack.pop();
      }
    };
    // member bodies see the complete class; nested classes run with the outermost
    if (this.classStack.length) this.pendingBodies = (this.pendingBodies || []).concat([run]);
    else {
      run();
      const more = this.pendingBodies || [];
      this.pendingBodies = null;
      for (const r of more) r();
    }
    return type;
  }

  visitMember(m, cls, rec, bodies) {
    switch (m.type) {
      case 'Declaration': {
        const base = this.specType(m.specs, cls);
        if (!m.declarators.length) {
          const ts = m.specs.typeSpec;
          // C11 anonymous struct/union member
          if (ts && ts.type === 'RecordDecl' && ts.anonymous && ts.isDefinition) {
            rec.fields.push({ name: null, type: base, bitWidth: null, anonymous: true, node: m });
          }
          return;
        }
        const isFriend = m.specs.functionSpecs.includes('friend');
        for (const d of m.declarators) {
          if (d.type === 'FieldDecl') this.visitField(d, base, cls, rec, m);
          else if (d.type === 'FunctionDecl') {
            if (isFriend) {
              this.visitFunction(d, base, this.namespaceOf(cls), m.specs, bodies, cls);
              d.friend = true;
            } else this.visitFunction(d, base, cls, m.specs, bodies, cls);
          } else if (d.type === 'TypedefDecl') this.visitTypedef(d, base, cls);
          else if (d.type === 'VarDecl') this.visitVar(d, base, cls, m.specs, 'class');
        }
        return;
      }
      case 'TemplateDecl': {
        const ts = new Scope('template', cls, m, null);
        for (const p of m.params || []) {
          if (!p.name) continue;
          const sym = p.kind === 'nontype'
            ? this.newSymbol({ name: p.name, kind: 'templateParam', type: p.param ? this.typeOfParam(p.param, ts) : T.int, scope: ts })
            : this.newSymbol({ name: p.name, kind: 'typedef', type: { kind: 'dependent', name: p.name }, scope: ts, templateParam: true });
          ts.names.set(p.name, sym);
        }
        this.templateDepth = (this.templateDepth || 0) + 1;
        try {
          if (m.decl && m.decl.type === 'Declaration') {
            this.visitMemberInTemplate(m.decl, ts, cls, rec, bodies);
          } else if (m.decl) this.visitMember(m.decl, cls, rec, bodies);
        } finally {
          this.templateDepth--;
        }
        return;
      }
      case 'AliasDecl': return this.visitAlias(m, cls);
      case 'UsingDecl': return this.visitUsingDecl(m, cls);
      case 'StaticAssert': return this.visitStaticAssert(m, cls);
      default: return;
    }
  }

  visitMemberInTemplate(decl, ts, cls, rec, bodies) {
    // like visitMember('Declaration') but types resolve through the template scope
    const base = this.specType(decl.specs, ts);
    for (const d of decl.declarators) {
      if (d.type === 'FunctionDecl') this.visitFunction(d, base, cls, decl.specs, bodies, ts);
      else if (d.type === 'FieldDecl') this.visitField(d, base, cls, rec, decl);
      else if (d.type === 'TypedefDecl') this.visitTypedef(d, base, cls);
      if (d.symbol) d.symbol.template = true;
    }
  }

  namespaceOf(scope) {
    let s = scope;
    while (s && s.kind !== 'namespace' && s.kind !== 'file') s = s.parent;
    return s || this.fileScope;
  }

  visitField(d, base, cls, rec, declNode) {
    const t = this.applyDeclarator(d.declarator, base, cls, d);
    d.ctype = t;
    let bitWidth = null;
    if (d.bitWidth) {
      this.expr(d.bitWidth, cls);
      const v = Ty.constValue(d.bitWidth, { target: this.target, allowConstVars: this.cpp });
      bitWidth = v ? Number(v.value) : null;
      d.bitWidthValue = bitWidth;
    }
    const isStatic = declNode.specs.storage.includes('static');
    if (!d.name) {
      if (bitWidth != null) rec.fields.push({ name: null, type: t, bitWidth, unnamed: true, node: d });
      return;
    }
    const sym = this.newSymbol({
      name: d.name, qname: this.qual(cls, d.name), kind: isStatic ? 'variable' : 'field', type: t, scope: cls,
      member: true, record: rec, bitWidth, access: declNode.access || null,
      storage: isStatic ? 'static' : 'none', linkage: isStatic ? 'external' : 'none', isStatic,
      mutable: declNode.specs.storage.includes('mutable'),
    });
    sym.decls.push(d);
    sym.definition = isStatic && !d.init ? null : d;
    if (isStatic && (declNode.specs.functionSpecs.includes('constexpr') || declNode.specs.functionSpecs.includes('inline'))) sym.definition = d;
    cls.names.set(d.name, sym);
    d.symbol = sym;
    if (!isStatic) rec.fields.push({ name: d.name, type: t, bitWidth, symbol: sym, node: d });
    if (d.init) {
      this.expr(d.init, cls);
      if (isStatic && Ty.canonical(t).const) sym.constInit = d.init;
    }
  }

  visitEnum(ed, scope) {
    const owner = this.declScope(scope);
    let sym = null;
    if (ed.name) {
      sym = ed.isDefinition ? owner.tags.get(ed.name) || null : this.lookup(ed.name, scope, { tag: true });
      if (sym && sym.kind !== 'tag') sym = null;
    }
    let type;
    if (sym && Ty.canonical(sym.type).kind === 'enum') type = sym.type;
    else {
      type = { kind: 'enum', name: ed.name || null, decl: ed, underlying: null, constants: [], scoped: !!ed.scoped, fixed: !!ed.underlying, id: ++SYMBOL_ID, scope: null };
      if (ed.name) {
        sym = this.newSymbol({ name: ed.name, qname: this.qual(owner, ed.name), kind: 'tag', type, scope: owner, tag: 'enum' });
        owner.tags.set(ed.name, sym);
        if (this.cpp && !owner.names.has(ed.name)) owner.names.set(ed.name, sym);
      }
    }
    if (sym) { sym.decls.push(ed); ed.symbol = sym; }
    ed.ctype = type;
    if (ed.underlying) { type.underlying = this.typeOfTypeName(ed.underlying, scope); type.fixed = true; }
    if (!ed.isDefinition) {
      if (!type.underlying && this.cpp && ed.scoped) type.underlying = T.int;
      return type;
    }
    if (sym) sym.definition = ed;
    const es = new Scope('enum', scope, ed, ed.name || null);
    type.scope = es;
    if (ed.name) owner.children.set(ed.name, es);
    let next = 0n;
    let min = 0n, max = 0n;
    const constType = this.cpp || (type.fixed && !this.cpp) ? type : T.int;
    for (const c of ed.enumerators) {
      let value = next;
      if (c.value) {
        this.expr(c.value, ed.scoped ? es : scope);
        const v = Ty.constValue(c.value, { target: this.target, allowConstVars: this.cpp });
        if (v && !v.float) value = v.value;
        else if (!this.templateDepth) this.diag('warning', 'enum-value-not-constant', `Enumerator '${c.name}' value is not an integer constant`, c);
      }
      next = value + 1n;
      if (value < min) min = value;
      if (value > max) max = value;
      const csym = this.newSymbol({ name: c.name, qname: this.qual(ed.scoped ? es : owner, c.name), kind: 'enumerator', type: constType, scope: ed.scoped ? es : owner, value, enumType: type });
      csym.decls.push(c);
      csym.definition = c;
      c.symbol = csym;
      c.ctype = constType;
      c.constValue = value;
      es.names.set(c.name, csym);
      if (!ed.scoped) {
        const prev = owner.names.get(c.name);
        if (prev && prev.scope === owner && prev.kind !== 'namespace') this.diag('error', 'redeclaration', `Redeclaration of enumerator '${c.name}'`, c);
        owner.names.set(c.name, csym);
      }
      type.constants.push({ name: c.name, value, symbol: csym });
    }
    if (!type.underlying) {
      if (!this.cpp) {
        // GCC: unsigned int when no enumerator is negative, otherwise int; wider when needed
        const tg = this.target;
        if (min >= 0n) type.underlying = Ty.fitsIn(max, T.uint, tg) ? T.uint : T.ulong;
        else type.underlying = Ty.fitsIn(min, T.int, tg) && Ty.fitsIn(max, T.int, tg) ? T.int : T.long;
      } else {
        type.underlying = Ty.fitsIn(min, T.int, this.target) && Ty.fitsIn(max, T.int, this.target) ? T.int : Ty.fitsIn(max, T.uint, this.target) && min >= 0n ? T.uint : T.llong;
      }
    }
    return type;
  }

  // ------------------------------------------------------------ declarations

  visitDeclaration(decl, scope, ctx) {
    const specs = decl.specs;
    if (!decl.declarators.length && specs.typeSpec && (specs.typeSpec.type === 'RecordDecl' || specs.typeSpec.type === 'EnumDecl') && !specs.typeSpec.isDefinition) {
      specs.isForwardDecl = true; // `struct S;` declares S in the current scope
    }
    const base = this.specType(specs, scope);
    for (const d of decl.declarators) {
      switch (d.type) {
        case 'TypedefDecl': this.visitTypedef(d, base, scope); break;
        case 'VarDecl': this.visitVar(d, base, scope, specs, ctx); break;
        case 'FieldDecl': this.visitVar(d, base, scope, specs, ctx); break;
        case 'FunctionDecl': this.visitFunction(d, base, scope, specs, null, null); break;
        case 'BindingDecl': this.visitBinding(d, base, scope); break;
        default: break;
      }
    }
  }

  visitTypedef(d, base, scope) {
    const t = this.applyDeclarator(d.declarator, base, scope, d);
    const owner = this.declScope(scope);
    if (!d.name) return;
    const prev = owner.names.get(d.name);
    let sym;
    if (prev && prev.kind === 'typedef' && prev.scope === owner) {
      sym = prev;
      if (!Ty.sameType(prev.type, t)) this.diag('error', 'typedef-redefinition', `Typedef '${d.name}' redefined with a different type`, d);
    } else {
      sym = this.newSymbol({ name: d.name, qname: this.qual(owner, d.name), kind: 'typedef', type: t, scope: owner });
      owner.names.set(d.name, sym);
    }
    sym.decls.push(d);
    if (!sym.definition) sym.definition = d;
    d.symbol = sym;
    d.ctype = Ty.typedefType(d.name, t, d);
    sym.typedefType = d.ctype;
    const ts = d.specs && d.specs.typeSpec;
    if (ts && (ts.type === 'RecordDecl' || ts.type === 'EnumDecl') && !ts.name && ts.ctype && !ts.ctype.name) ts.ctype.typedefName = d.name;
  }

  visitVar(d, base, scope, specs, ctx) {
    let t = this.applyDeclarator(d.declarator, base, scope, d);
    const owner = this.declScope(scope);
    const storage = specs.storage;
    const isExtern = storage.includes('extern');
    const isStatic = storage.includes('static');
    const isThread = storage.includes('thread_local');
    const fileLevel = owner.kind === 'file' || owner.kind === 'namespace';
    const fs = specs.functionSpecs;
    const isConstexpr = fs.includes('constexpr');
    const isInline = fs.includes('inline');
    if (!d.name) return;
    const qualified = d.qualifier && this.cpp;
    let target = owner;
    if (qualified) {
      const glob = !!(d.qname && d.qname.startsWith('::'));
      target = this.resolveScopePath(d.qualifier, scope, glob) || this.placeholderScope(d.qualifier, glob ? this.fileScope : owner);
    }
    let prev = target.names.get(d.name) || null;
    if (prev && prev.scope !== target && !qualified) prev = null;
    if (!fileLevel && isExtern) {
      // block-scope extern refers to the file-level entity
      const outer = this.lookup(d.name, scope.parent);
      if (outer && outer.linkage !== 'none') prev = outer;
    }
    let linkage = 'none';
    if (fileLevel || qualified) {
      if (isStatic) linkage = 'internal';
      else if (this.inAnonymousNamespace(target)) linkage = 'internal';
      else if (isExtern) linkage = prev && prev.linkage !== 'none' ? prev.linkage : 'external';
      else if (this.cpp && (Ty.canonical(t).const || isConstexpr) && !isInline && !(prev && prev.linkage === 'external')) linkage = 'internal';
      else linkage = prev && prev.linkage !== 'none' ? prev.linkage : 'external';
      if (prev && prev.linkage === 'internal' && !isStatic && linkage === 'external' && !isExtern) linkage = 'internal';
    } else if (isExtern) linkage = prev && prev.linkage !== 'none' ? prev.linkage : 'external';
    const storageDur = isThread ? 'thread' : (fileLevel || isStatic || isExtern || qualified) ? 'static' : 'automatic';
    // initializer (visited with the name in scope, C 6.2.1p7)
    let sym;
    if (prev && (prev.kind === 'variable') && (fileLevel || isExtern || qualified)) {
      sym = prev;
      if (prev.linkage !== linkage && !(qualified)) {
        if (prev.linkage === 'internal' && linkage === 'external' && !isExtern) { /* keep internal */ } else if (prev.linkage === 'external' && linkage === 'internal') {
          this.diag('error', 'linkage-conflict', `Static declaration of '${d.name}' follows non-static declaration`, d);
        }
      }
      if (!Ty.sameType(prev.type, t) && !Ty.isUnknown(prev.type) && !Ty.isUnknown(t)) {
        this.diag('error', 'conflicting-types', `Conflicting types for '${d.name}'`, d);
      } else if (Ty.canonical(prev.type).kind === 'array' && Ty.canonical(prev.type).size == null) prev.type = t;
    } else {
      if (prev && prev.scope === target && !isExtern) {
        if (prev.kind !== 'variable' || (!fileLevel && prev.kind === 'variable')) this.diag('error', 'redeclaration', `Redeclaration of '${d.name}'`, d);
      }
      sym = this.newSymbol({
        name: d.name, qname: this.qual(qualified ? target : owner, d.name), kind: 'variable', type: t, scope: target,
        linkage, storage: storageDur,
      });
      if (!(isExtern && !fileLevel)) target.names.set(d.name, sym);
      else owner.names.set(d.name, sym);
    }
    sym.isExtern = sym.isExtern || isExtern;
    sym.isStatic = sym.isStatic || isStatic;
    sym.isInline = sym.isInline || isInline;
    sym.isConstexpr = sym.isConstexpr || isConstexpr;
    if (this.externC) sym.externC = true;
    sym.decls.push(d);
    d.symbol = sym;
    if (d.init) {
      const it = this.initializer(d.init, t, scope);
      if (Ty.canonical(t).kind === 'auto') t = autoDeduce(t, it);
      t = completeArrayFromInit(t, d.init, this);
      if (Ty.canonical(sym.type).kind === 'auto' || (Ty.canonical(sym.type).kind === 'array' && Ty.canonical(sym.type).size == null)) sym.type = t;
      const ct = Ty.canonical(t);
      if ((ct.const || isConstexpr) && (Ty.isInteger(t) || Ty.isFloating(t)) && d.init.type !== 'InitList') sym.constInit = d.init;
    }
    d.ctype = t;
    // definition / tentative definition
    if (fileLevel || qualified) {
      if (d.init) {
        if (sym.definition && sym.definition !== d) this.diag('error', 'redefinition', `Redefinition of '${d.name}'`, d);
        sym.definition = d;
      } else if (!isExtern) {
        if (this.cpp) {
          if (sym.definition && sym.definition !== d && !sym.isInline) this.diag('error', 'redefinition', `Redefinition of '${d.name}'`, d);
          sym.definition = sym.definition || d;
        } else sym.tentative.push(d);
      }
    } else if (!isExtern) {
      sym.definition = d;
    }
  }

  visitBinding(d, base, scope) {
    const owner = this.declScope(scope);
    let it = T.unknown;
    if (d.init) it = this.initializer(d.init, base, scope);
    const rt = Ty.canonical(Ty.nonRef(it));
    d.bindings = [];
    d.names.forEach((b, i) => {
      let t = T.unknown;
      if (rt.kind === 'record' && rt.fields) {
        const named = rt.fields.filter((f) => f.name);
        if (named[i]) t = named[i].type;
      } else if (rt.kind === 'array') t = rt.of;
      const sym = this.newSymbol({ name: b.name, kind: 'variable', type: t, scope: owner, storage: this.isFileLevel(scope) ? 'static' : 'automatic', linkage: 'none', binding: true });
      sym.decls.push(d);
      sym.definition = d;
      owner.names.set(b.name, sym);
      d.bindings.push(sym);
    });
    d.ctype = it;
  }

  initializer(init, t, scope) {
    if (!init) return T.unknown;
    if (init.type === 'InitList') {
      this.initList(init, t, scope);
      init.ctype = t;
      return t;
    }
    if (init.type === 'ParenListInit') {
      for (const a of init.args) this.expr(a, scope);
      init.ctype = t;
      return init.args.length === 1 ? init.args[0].ctype : t;
    }
    return this.expr(init, scope);
  }

  initList(il, t, scope) {
    const ct = Ty.canonical(t);
    let idx = 0;
    for (const item of il.items) {
      let elemT = T.unknown;
      if (item.type === 'DesignatedInit') {
        let cur = ct;
        for (const des of item.designators) {
          if (des.kind === 'index') {
            this.expr(des.index, scope);
            if (des.high) this.expr(des.high, scope);
            const v = Ty.constValue(des.index, { target: this.target });
            if (v) des.indexValue = Number(v.value);
            cur = cur && cur.kind === 'array' ? Ty.canonical(cur.of) : T.unknown;
          } else {
            const f = cur && cur.kind === 'record' ? findField(cur, des.name) : null;
            des.field = f ? f.symbol || null : null;
            cur = f ? Ty.canonical(f.type) : T.unknown;
          }
        }
        elemT = cur;
        if (item.value.type === 'InitList') this.initList(item.value, elemT, scope);
        else this.expr(item.value, scope);
        item.ctype = elemT;
        continue;
      }
      if (ct.kind === 'array') elemT = ct.of;
      else if (ct.kind === 'record' && ct.fields) {
        const named = ct.fields.filter((f) => f.name || f.anonymous);
        elemT = named[idx] ? named[idx].type : T.unknown;
      } else elemT = ct;
      idx++;
      if (item.type === 'InitList') { this.initList(item, elemT, scope); item.ctype = elemT; } else this.expr(item, scope);
    }
  }

  visitFunction(fd, base, scope, specs, bodies, lookupScope) {
    const owner = this.declScope(scope);
    const tscope = lookupScope || scope;
    let t = this.applyDeclarator(fd.declarator, base, tscope, fd);
    const ct = Ty.canonical(t);
    if (ct.kind === 'function' && (fd.isConstructor || fd.isDestructor)) t = { ...ct, ret: T.void };
    if (ct.kind === 'function' && fd.isConversion) {
      const leaf = declLeaf(fd.declarator);
      if (leaf && leaf.conversionType) t = { ...ct, ret: this.typeOfTypeName(leaf.conversionType, tscope) };
    }
    if (ct.kind === 'function' && Ty.canonical(ct.ret).kind === 'auto' && !fd.body) { /* deduced later */ }
    fd.ctype = t;
    if (!fd.name) return;
    let target = owner;
    let qualified = false;
    if (fd.qualifier && this.cpp) {
      const glob = !!(fd.qname && fd.qname.startsWith('::'));
      const s = this.resolveScopePath(fd.qualifier, scope, glob) || this.placeholderScope(fd.qualifier, glob ? this.fileScope : owner);
      target = s; qualified = true;
    }
    const fileLevel = target.kind === 'file' || target.kind === 'namespace';
    const isStatic = specs.storage.includes('static');
    const isExtern = specs.storage.includes('extern');
    const fsx = specs.functionSpecs;
    let prev = target.names.get(fd.name) || null;
    if (!fileLevel && target.kind !== 'class' && !qualified) {
      // block-scope function declaration refers to the file-level function
      const outer = this.lookup(fd.name, scope.parent);
      if (outer && outer.kind === 'function') prev = outer;
    }
    if (prev && prev.kind !== 'function') {
      if (prev.scope === target) this.diag('error', 'redeclaration', `'${fd.name}' redeclared as a different kind of symbol`, fd);
      prev = null;
    }
    // C++ overloads: pick the declaration with the same parameter types
    if (prev && this.cpp && prev.kind === 'function') {
      const cand = [prev, ...(prev.overloads || [])];
      // a member/function template never redeclares a non-template of the same
      // signature (`T& operator=(T&&)` next to `template<class U> T& operator=(T<U>&&)`)
      const isTpl = tscope.kind === 'template' && !fd.qualifier;
      const same = cand.find((c) => sameParams(c.type, t) && (fd.qualifier || !!c.template === isTpl || (!c.template && !isTpl)));
      if (same) prev = same;
      else {
        const sym = this.makeFunctionSymbol(fd, t, target, specs, isStatic, isExtern, qualified);
        (cand[0].overloads || (cand[0].overloads = [])).push(sym);
        sym.overloadOf = cand[0];
        prev = null;
        this.finishFunction(fd, sym, specs, bodies, tscope, target);
        return;
      }
    }
    let sym;
    if (prev) {
      sym = prev;
      if (!this.cpp && !Ty.sameType(prev.type, t) && !Ty.isUnknown(t)) {
        this.diag('error', 'conflicting-types', `Conflicting types for '${fd.name}'`, fd);
      }
      if (isStatic && prev.linkage === 'external' && !prev.implicit) this.diag('error', 'linkage-conflict', `Static declaration of '${fd.name}' follows non-static declaration`, fd);
      // keep the prototype that carries the most information
      const pt = Ty.canonical(prev.type);
      if (pt.kind === 'function' && (!pt.prototype || prev.implicit) && Ty.canonical(t).prototype) sym.type = t;
      if (prev.implicit && !fd.body) prev.implicit = false;
    } else {
      sym = this.makeFunctionSymbol(fd, t, target, specs, isStatic, isExtern, qualified);
    }
    if (fsx.includes('inline') || fsx.includes('constexpr') || fsx.includes('consteval') || (target.kind === 'class' && fd.body)) sym.isInline = true;
    this.finishFunction(fd, sym, specs, bodies, tscope, target);
  }

  makeFunctionSymbol(fd, t, target, specs, isStatic, isExtern, qualified) {
    const member = target.kind === 'class';
    let linkage = 'external';
    if (isStatic && !member) linkage = 'internal';
    else if (this.inAnonymousNamespace(target)) linkage = 'internal';
    const sym = this.newSymbol({
      name: fd.name, qname: this.qual(target, fd.name), kind: 'function', type: t,
      scope: target, linkage, storage: 'none', member,
    });
    sym.isStatic = isStatic;
    sym.isExtern = isExtern;
    if (member) {
      sym.record = target.record;
      sym.isVirtual = specs.functionSpecs.includes('virtual') || fd.isOverride || fd.isFinal;
      sym.access = null;
    }
    target.names.set(fd.name, target.names.get(fd.name) && target.names.get(fd.name).kind === 'function' ? target.names.get(fd.name) : sym);
    return sym;
  }

  finishFunction(fd, sym, specs, bodies, tscope, target) {
    sym.decls.push(fd);
    fd.symbol = sym;
    if (this.externC) sym.externC = true;
    const attrs = [...(specs.attributes || []), ...(fd.attributes || [])];
    const dfn = directFunction(fd.declarator);
    if (dfn && dfn.attributes) for (const a of dfn.attributes) attrs.push(a);
    if (specs.functionSpecs.includes('_Noreturn') || attrs.some((a) => a.name === 'noreturn' || a.name === '_Noreturn') || NORETURN_NAMES.has(sym.qname)) sym.noreturn = true;
    if (fd.isDeleted) sym.deleted = true;
    if (fd.isPure) sym.pure = true;
    if (fd.access) sym.access = fd.access;
    if (fd.body) {
      if (sym.definition && sym.definition !== fd && !sym.template) this.diag('error', 'redefinition', `Redefinition of '${fd.name}'`, fd);
      sym.definition = fd;
      fd.isDefinition = true;
      let parent;
      if (target.kind === 'class' && fd.qualifier && this.cpp && tscope.kind === 'template' && tscope.parent !== target) {
        // out-of-line member of a class template: template parameters, then the class
        parent = new Scope('template', target, tscope.node, null);
        parent.names = tscope.names;
      } else if (target.kind === 'class') parent = tscope.kind === 'template' ? tscope : target;
      else parent = fd.qualifier && this.cpp ? target : tscope;
      const job = () => this.visitFunctionBody(fd, sym, parent);
      if (bodies) bodies.push(job);
      else job();
    } else if (fd.isDefault || fd.isDeleted) {
      sym.definition = sym.definition || fd;
    }
  }

  visitFunctionBody(fd, sym, parentScope) {
    const fs = new Scope('function', parentScope, fd, null);
    fd.scope = fs;
    const ft = Ty.canonical(fd.ctype);
    const frame = { fd, sym, scope: fs, ret: ft.kind === 'function' ? ft.ret : T.unknown, gotos: [], returns: [] };
    this.fnStack.push(frame);
    try {
      const dfn = directFunction(fd.declarator);
      const params = dfn ? dfn.params : [];
      // K&R parameter declarations
      const kr = new Map();
      if (fd.krDecls) {
        const ks = new Scope('prototype', fs, null, null);
        for (const d of fd.krDecls) {
          const base = this.specType(d.specs, ks);
          for (const x of d.declarators) {
            const xt = this.applyDeclarator(x.declarator, base, ks, x);
            x.ctype = xt;
            if (x.name) kr.set(x.name, { type: xt, node: x });
          }
        }
      }
      const ptypes = [];
      for (const p of params) {
        let pt = p.ctype || T.int;
        if (p.krIdentifier) {
          const k = kr.get(p.name);
          pt = k ? Ty.decay(k.type) : T.int;
          p.ctype = pt;
          if (!k) p.implicitInt = true;
        }
        ptypes.push(pt);
        if (!p.name) continue;
        const ps = this.newSymbol({ name: p.name, kind: 'parameter', type: pt, scope: fs, storage: 'automatic', linkage: 'none' });
        ps.decls.push(p);
        ps.definition = p;
        p.symbol = ps;
        fs.names.set(p.name, ps);
      }
      if (fd.krDecls && ft.kind === 'function') {
        fd.ctype = { ...ft, params: ptypes, prototype: false };
      }
      const pf = this.newSymbol({ name: '__func__', kind: 'variable', type: Ty.arrayOf(Ty.withQuals(T.char, { const: true }), fd.name.length + 1), scope: fs, storage: 'static', predefined: true });
      fs.names.set('__func__', pf);
      fs.names.set('__FUNCTION__', pf);
      fs.names.set('__PRETTY_FUNCTION__', pf);
      if (fd.ctorInits) {
        for (const ci of fd.ctorInits) {
          for (const a of ci.args) this.expr(a, fs);
          const rec = sym.record;
          if (rec) {
            const f = findField(rec, ci.name);
            if (f && f.symbol) { ci.field = f.symbol; f.symbol.uses.push(ci); }
          }
        }
      }
      const body = fd.body;
      if (body.type === 'TryStmt') {
        this.compound(body.body, fs, true);
        for (const h of body.handlers) this.stmt(h, fs);
      } else this.compound(body, fs, true);
      for (const g of frame.gotos) {
        const l = fs.labels.get(g.label);
        if (l) { g.labelSymbol = l; l.uses.push(g); } else this.diag('error', 'undeclared-label', `Label '${g.label}' used but not defined`, g);
      }
      // deduced return type
      const rt = Ty.canonical(frame.ret);
      if (rt.kind === 'auto' && frame.returns.length) {
        const first = frame.returns.find((r) => r.arg && r.arg.ctype);
        if (first && ft.kind === 'function') {
          fd.ctype = { ...Ty.canonical(fd.ctype), ret: Ty.unqualified(Ty.decay(first.arg.ctype)) };
          if (sym.definition === fd) sym.type = fd.ctype;
        }
      }
    } finally {
      this.fnStack.pop();
    }
  }

  // ------------------------------------------------------------ statements

  compound(cs, scope, reuse) {
    const s = reuse ? scope : new Scope('block', scope, cs, null);
    cs.scope = s;
    for (const st of cs.body) this.stmt(st, s);
  }

  stmt(st, scope) {
    if (!st) return;
    switch (st.type) {
      case 'CompoundStmt': return this.compound(st, scope, false);
      case 'Declaration': return this.visitDeclaration(st, scope, 'block');
      case 'ExprStmt': this.expr(st.expr, scope); return;
      case 'IfStmt': {
        const s = new Scope('block', scope, st, null);
        if (st.init) this.stmt(st.init, s);
        if (st.cond) this.cond(st.cond, s);
        this.stmt(st.then, new Scope('block', s, st.then, null));
        if (st.else) this.stmt(st.else, new Scope('block', s, st.else, null));
        return;
      }
      case 'SwitchStmt': {
        const s = new Scope('block', scope, st, null);
        if (st.init) this.stmt(st.init, s);
        this.cond(st.cond, s);
        this.stmt(st.body, s);
        return;
      }
      case 'WhileStmt': {
        const s = new Scope('block', scope, st, null);
        this.cond(st.cond, s);
        this.stmt(st.body, new Scope('block', s, st.body, null));
        return;
      }
      case 'DoStmt':
        this.stmt(st.body, new Scope('block', scope, st.body, null));
        this.expr(st.cond, scope);
        return;
      case 'ForStmt': {
        const s = new Scope('block', scope, st, null);
        if (st.init) this.stmt(st.init, s);
        if (st.cond) this.cond(st.cond, s);
        if (st.inc) this.expr(st.inc, s);
        this.stmt(st.body, new Scope('block', s, st.body, null));
        return;
      }
      case 'RangeForStmt': {
        const s = new Scope('block', scope, st, null);
        if (st.init) this.stmt(st.init, s);
        const rt = st.range.type === 'InitList' ? (this.initList(st.range, T.unknown, s), T.unknown) : this.expr(st.range, s);
        const d = st.decl;
        const base = this.specType(d.specs, s);
        const vd = d.declarators[0];
        if (vd) {
          let t = this.applyDeclarator(vd.declarator, base, s, vd);
          const rc = Ty.canonical(Ty.nonRef(rt));
          if (Ty.canonical(Ty.nonRef(t)).kind === 'auto') {
            const elem = rc.kind === 'array' ? rc.of : T.unknown;
            t = autoDeduce(t, elem);
          }
          vd.ctype = t;
          if (vd.type === 'BindingDecl') this.visitBinding(vd, base, s);
          else if (vd.name) {
            const sym = this.newSymbol({ name: vd.name, kind: 'variable', type: t, scope: s, storage: 'automatic', linkage: 'none' });
            sym.decls.push(vd);
            sym.definition = vd;
            vd.symbol = sym;
            s.names.set(vd.name, sym);
          }
        }
        this.stmt(st.body, new Scope('block', s, st.body, null));
        return;
      }
      case 'CaseStmt': {
        this.expr(st.value, scope);
        if (st.high) this.expr(st.high, scope);
        const v = Ty.constValue(st.value, { target: this.target, allowConstVars: this.cpp });
        st.constValue = v ? v.value : null;
        if (st.high) { const h = Ty.constValue(st.high, { target: this.target }); st.constHigh = h ? h.value : null; }
        this.stmt(st.body, scope);
        return;
      }
      case 'DefaultStmt': this.stmt(st.body, scope); return;
      case 'LabelStmt': {
        const f = this.fnStack[this.fnStack.length - 1];
        if (f) {
          const ls = f.scope.labels;
          if (ls.has(st.label)) this.diag('error', 'duplicate-label', `Duplicate label '${st.label}'`, st);
          else {
            const sym = this.newSymbol({ name: st.label, kind: 'label', scope: f.scope, type: T.void });
            sym.decls.push(st);
            sym.definition = st;
            ls.set(st.label, sym);
            st.symbol = sym;
          }
        }
        this.stmt(st.body, scope);
        return;
      }
      case 'GotoStmt': {
        if (st.target) { this.expr(st.target, scope); return; }
        const f = this.fnStack[this.fnStack.length - 1];
        if (f) f.gotos.push(st);
        return;
      }
      case 'ReturnStmt': {
        const f = this.fnStack[this.fnStack.length - 1];
        if (st.arg) {
          if (st.arg.type === 'InitList') this.initList(st.arg, f ? f.ret : T.unknown, scope);
          else this.expr(st.arg, scope);
        }
        if (f) { f.returns.push(st); st.functionReturnType = f.ret; }
        return;
      }
      case 'TryStmt':
        this.stmt(st.body, scope);
        for (const h of st.handlers) this.stmt(h, scope);
        return;
      case 'CatchClause': {
        const s = new Scope('block', scope, st, null);
        if (st.param) {
          const t = this.typeOfParam(st.param, s);
          if (st.param.name) {
            const sym = this.newSymbol({ name: st.param.name, kind: 'variable', type: st.param.declaredType || t, scope: s, storage: 'automatic' });
            sym.decls.push(st.param);
            sym.definition = st.param;
            st.param.symbol = sym;
            s.names.set(st.param.name, sym);
          }
        }
        this.compound(st.body, s, true);
        return;
      }
      case 'StaticAssert': return this.visitStaticAssert(st, scope);
      case 'UsingDirective': return this.visitUsingDirective(st, scope);
      case 'UsingDecl': return this.visitUsingDecl(st, scope);
      case 'AliasDecl': return this.visitAlias(st, scope);
      case 'NamespaceAlias': case 'NamespaceDecl': case 'TemplateDecl': return this.visitTop(st, scope);
      default: return;
    }
  }

  cond(c, scope) {
    if (!c) return;
    if (c.type === 'Declaration') this.visitDeclaration(c, scope, 'block');
    else this.expr(c, scope);
  }

  // ------------------------------------------------------------ expressions

  expr(e, scope) {
    if (!e) return T.unknown;
    const t = this.exprInner(e, scope) || T.unknown;
    e.ctype = t;
    return t;
  }

  boolResult() { return this.cpp ? T.bool : T.int; }

  exprInner(e, scope) {
    const tg = this.target;
    switch (e.type) {
      case 'IntegerLiteral': {
        if (e.invalid) return T.int;
        const t = Ty.integerLiteralType(e.value, e.suffix, e.base, tg, this.cpp ? 'cpp' : 'c');
        if (t.tooLarge) this.diag('warning', 'integer-literal-too-large', `Integer constant ${e.raw} is too large for its type`, e);
        return t;
      }
      case 'FloatingLiteral': {
        const s = (e.suffix || '').toLowerCase();
        return s === 'f' ? T.float : s === 'l' ? T.ldouble : T.double;
      }
      case 'CharLiteral': {
        switch (e.prefix) {
          case 'L': return T.wchar;
          case 'u': return this.cpp ? T.char16 : T.ushort;
          case 'U': return this.cpp ? T.char32 : T.uint;
          case 'u8': return this.cpp ? T.char8 : T.uchar;
          default: return this.cpp && !e.multi ? T.char : T.int;
        }
      }
      case 'StringLiteral': {
        let ch;
        switch (e.prefix) {
          case 'L': ch = T.wchar; break;
          case 'u': ch = this.cpp ? T.char16 : T.ushort; break;
          case 'U': ch = this.cpp ? T.char32 : T.uint; break;
          case 'u8': ch = this.cpp ? T.char8 : T.char; break;
          default: ch = T.char;
        }
        let n = e.length;
        if (!e.prefix || e.prefix === 'u8') {
          // byte length in UTF-8
          n = 1;
          for (const c of e.codes) n += c < 0x80 || e.escapes.length && c < 0x100 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
        } else if (e.prefix === 'u') {
          n = 1;
          for (const c of e.codes) n += c > 0xffff ? 2 : 1;
        }
        // a string-literal macro we cannot expand is part of it: size unknown
        return Ty.arrayOf(this.cpp ? Ty.withQuals(ch, { const: true }) : ch, e.incomplete ? null : n);
      }
      case 'BoolLiteral': return T.bool;
      case 'NullptrLiteral': return T.nullptr;
      case 'ThisExpr': {
        const rec = this.classStack[this.classStack.length - 1];
        return rec ? Ty.pointerTo(rec) : Ty.pointerTo(T.unknown);
      }
      case 'Identifier': return this.identifier(e, scope);
      case 'ParenExpr': {
        const t = this.expr(e.expr, scope);
        if (e.expr && e.expr.bitField != null) e.bitField = e.expr.bitField;
        return t;
      }
      case 'UnaryExpr': {
        const a = this.expr(e.arg, scope);
        switch (e.op) {
          case '&':
            if (e.arg && e.arg.type === 'Identifier' && e.arg.symbol && e.arg.symbol.member && !e.arg.symbol.isStatic && this.cpp && e.arg.qualifier) return { kind: 'memberPointer', cls: e.arg.qualifier, to: a };
            return Ty.pointerTo(Ty.nonRef(a));
          case '*': {
            const p = Ty.pointee(Ty.nonRef(a));
            if (p) return p;
            if (Ty.isFunction(a)) return a;
            return T.unknown;
          }
          case '+': case '-': case '~': return Ty.isArithmetic(a) ? Ty.integerPromote(a, tg, e.arg && e.arg.bitField) : Ty.unqualified(Ty.nonRef(a));
          case '!': return this.boolResult();
          case '++': case '--': return Ty.unqualified(Ty.nonRef(a));
          case '__real__': case '__imag__': { const c = Ty.canonical(a); return c.kind === 'float' ? Ty.floatType(c.name) : a; }
          default: return T.unknown;
        }
      }
      case 'BinaryExpr': {
        // left-associative chains (a + b + c ...) are typed iteratively
        if (e.left && e.left.type === 'BinaryExpr') {
          const spine = [];
          let x = e.left;
          while (x.type === 'BinaryExpr' && x.left) { spine.push(x); x = x.left; }
          this.expr(x, scope);
          for (let i = spine.length - 1; i >= 0; i--) {
            const b = spine[i];
            b.ctype = this.binaryType(b, b.left.ctype || T.unknown, this.expr(b.right, scope)) || T.unknown;
          }
          return this.binaryType(e, e.left.ctype || T.unknown, this.expr(e.right, scope));
        }
        const l = this.expr(e.left, scope);
        const r = this.expr(e.right, scope);
        return this.binaryType(e, l, r);
      }
      case 'AssignExpr': {
        const l = this.expr(e.left, scope);
        if (e.right && e.right.type === 'InitList') this.initList(e.right, l, scope);
        else this.expr(e.right, scope);
        return Ty.unqualified(Ty.nonRef(l));
      }
      case 'ConditionalExpr': {
        this.expr(e.test, scope);
        const a = e.consequent ? this.expr(e.consequent, scope) : e.test.ctype;
        const b = this.expr(e.alternate, scope);
        if (Ty.isArithmetic(a) && Ty.isArithmetic(b)) return Ty.usualArithmetic(a, b, tg);
        const ca = Ty.canonical(Ty.decay(a)), cb = Ty.canonical(Ty.decay(b));
        if (ca.kind === 'void' || cb.kind === 'void') return T.void;
        if (ca.kind === 'pointer' && cb.kind !== 'pointer') return Ty.decay(a);
        if (cb.kind === 'pointer' && ca.kind !== 'pointer') return Ty.decay(b);
        if (ca.kind === 'pointer' && cb.kind === 'pointer') {
          if (Ty.isVoid(ca.to)) return Ty.decay(a);
          if (Ty.isVoid(cb.to)) return Ty.decay(b);
          return Ty.decay(a);
        }
        return a;
      }
      case 'CallExpr': return this.call(e, scope);
      case 'MemberExpr': return this.member(e, scope);
      case 'IndexExpr': {
        const o = this.expr(e.object, scope);
        const i = e.index && e.index.type === 'InitList' ? (this.initList(e.index, T.unknown, scope), T.unknown) : this.expr(e.index, scope);
        let p = Ty.pointee(Ty.nonRef(o));
        if (!p) p = Ty.pointee(Ty.nonRef(i));
        return p || T.unknown;
      }
      case 'CastExpr': {
        const t = this.typeOfTypeName(e.typeName, scope);
        if (e.arg) {
          if (e.arg.type === 'InitList') this.initList(e.arg, t, scope);
          else this.expr(e.arg, scope);
        }
        if (e.args) for (const a of e.args) this.expr(a, scope);
        return Ty.canonical(t).kind === 'auto' && e.arg ? Ty.decay(e.arg.ctype || T.unknown) : t;
      }
      case 'SizeofExpr': {
        if (e.typeName) this.typeOfTypeName(e.typeName, scope);
        else this.expr(e.arg, scope);
        return Ty.sizeTType(tg);
      }
      case 'SizeofPackExpr': return Ty.sizeTType(tg);
      case 'AlignofExpr': {
        if (e.typeName) this.typeOfTypeName(e.typeName, scope);
        else this.expr(e.arg, scope);
        return Ty.sizeTType(tg);
      }
      case 'CompoundLiteral': {
        let t = this.typeOfTypeName(e.typeName, scope);
        this.initList(e.init, t, scope);
        t = completeArrayFromInit(t, e.init, this);
        return t;
      }
      case 'InitList': this.initList(e, T.unknown, scope); return { kind: 'initList' };
      case 'DesignatedInit': this.expr(e.value, scope); return T.unknown;
      case 'GenericSelection': {
        const c = this.expr(e.control, scope);
        const ct = Ty.unqualified(Ty.decay(c));
        let chosen = null, def = null;
        for (const a of e.assocs) {
          const at = a.typeName ? this.typeOfTypeName(a.typeName, scope) : null;
          this.expr(a.expr, scope);
          if (!at) def = a;
          else if (!chosen && Ty.sameType(at, ct)) chosen = a;
        }
        const sel = chosen || def;
        e.selected = sel ? e.assocs.indexOf(sel) : -1;
        return sel ? sel.expr.ctype : T.unknown;
      }
      case 'StmtExpr': {
        this.compound(e.body, scope, false);
        const last = e.body.body[e.body.body.length - 1];
        return last && last.type === 'ExprStmt' ? last.expr.ctype : T.void;
      }
      case 'VaArgExpr': this.expr(e.arg, scope); return this.typeOfTypeName(e.typeName, scope);
      case 'OffsetofExpr': {
        const t = this.typeOfTypeName(e.typeName, scope);
        for (const d of e.designators) if (d.index) this.expr(d.index, scope);
        e.offset = offsetOf(t, e.designators, tg);
        return Ty.sizeTType(tg);
      }
      case 'NewExpr': {
        for (const a of e.placement || []) this.expr(a, scope);
        const t = this.typeOfTypeName(e.typeName, scope);
        if (e.init) {
          if (e.init.type === 'InitList') this.initList(e.init, t, scope);
          else for (const a of e.init.args) this.expr(a, scope);
        }
        const c = Ty.canonical(t);
        if (c.kind === 'array') return Ty.pointerTo(c.of);
        return Ty.pointerTo(t);
      }
      case 'DeleteExpr': this.expr(e.arg, scope); return T.void;
      case 'ThrowExpr': if (e.arg) this.expr(e.arg, scope); return T.void;
      case 'TypeidExpr':
        if (e.typeName) this.typeOfTypeName(e.typeName, scope); else this.expr(e.arg, scope);
        return Ty.withQuals(Ty.unknownType('std::type_info'), { const: true });
      case 'NoexceptExpr': this.expr(e.arg, scope); return T.bool;
      case 'LambdaExpr': return this.lambda(e, scope);
      case 'PackExpansion': return this.expr(e.expr, scope);
      case 'FoldExpr': if (e.left) this.expr(e.left, scope); if (e.right) this.expr(e.right, scope); return T.unknown;
      case 'AddrLabelExpr': return Ty.pointerTo(T.void);
      case 'ParenListInit': for (const a of e.args) this.expr(a, scope); return T.unknown;
      default: return T.unknown;
    }
  }

  binaryType(e, l, r) {
    const tg = this.target;
    const op = e.op;
    switch (op) {
      case ',': return r;
      case '&&': case '||': case '<': case '>': case '<=': case '>=': case '==': case '!=': return this.boolResult();
      case '<=>': return Ty.unknownType('std::strong_ordering');
      case '<<': case '>>': return Ty.isInteger(l) ? Ty.integerPromote(l, tg, e.left && e.left.bitField) : T.unknown;
      case '+': case '-': {
        const dl = Ty.canonical(Ty.decay(Ty.nonRef(l))), dr = Ty.canonical(Ty.decay(Ty.nonRef(r)));
        if (dl.kind === 'pointer' && dr.kind === 'pointer' && op === '-') return Ty.ptrdiffTType(tg);
        if (dl.kind === 'pointer' && Ty.isInteger(dr)) return Ty.unqualified(dl);
        if (dr.kind === 'pointer' && Ty.isInteger(dl) && op === '+') return Ty.unqualified(dr);
        return this.arith(e, l, r);
      }
      case '.*': case '->*': { const c = Ty.canonical(r); return c.kind === 'memberPointer' ? c.to : T.unknown; }
      default: return this.arith(e, l, r);
    }
  }

  arith(e, l, r) {
    if (Ty.isArithmetic(l) && Ty.isArithmetic(r)) {
      const lb = e.left && e.left.bitField, rb = e.right && e.right.bitField;
      const L = lb != null ? Ty.integerPromote(l, this.target, lb) : l;
      const R = rb != null ? Ty.integerPromote(r, this.target, rb) : r;
      return Ty.usualArithmetic(L, R, this.target);
    }
    if (Ty.isUnknown(l)) return l;
    return Ty.isUnknown(r) ? r : T.unknown;
  }

  identifier(e, scope) {
    if (e.templateArgs) for (const a of e.templateArgs) this.templateArg(a, scope);
    let sym = this.lookupQualified(e, scope);
    if (!sym && e.predefined) {
      return Ty.arrayOf(Ty.withQuals(T.char, { const: true }), null);
    }
    if (!sym) {
      e.symbol = null;
      if (e.qualifier && this.isDependentQualifier(e.qualifier, scope)) return { kind: 'dependent', name: e.qname };
      this.unresolved.push(e);
      return Ty.unresolvedType(e.qname);
    }
    if (sym.kind === 'namespace' || sym.kind === 'label') { e.symbol = sym; return T.unknown; }
    e.symbol = sym;
    sym.uses.push(e);
    if (sym.kind === 'field') {
      e.implicitThis = true;
      if (sym.bitWidth != null) e.bitField = sym.bitWidth;
    }
    if (sym.kind === 'typedef' || sym.kind === 'tag') return sym.type;
    if (sym.kind === 'enumerator') return sym.type;
    return sym.type;
  }

  call(e, scope) {
    const callee = e.callee;
    let ct;
    if (callee.type === 'Identifier') {
      ct = this.identifier(callee, scope);
      callee.ctype = ct;
      if (!callee.symbol && !this.cpp && !callee.qualifier) {
        // C90 implicit function declaration
        const sym = this.newSymbol({ name: callee.name, kind: 'function', type: { ...Ty.functionType(T.int, [], false), prototype: false }, scope: this.fileScope, linkage: 'external', implicit: true });
        sym.decls.push(callee);
        this.fileScope.names.set(callee.name, sym);
        callee.symbol = sym;
        sym.uses.push(callee);
        const i = this.unresolved.indexOf(callee);
        if (i >= 0) this.unresolved.splice(i, 1);
        this.diag('warning', 'implicit-function-declaration', `Implicit declaration of function '${callee.name}'`, callee);
        ct = sym.type;
        callee.ctype = ct;
      }
    } else ct = this.expr(callee, scope);
    const argTypes = [];
    for (const a of e.args) argTypes.push(a.type === 'InitList' ? (this.initList(a, T.unknown, scope), T.unknown) : this.expr(a, scope));
    // overload selection by arity (C++)
    let sym = callee.type === 'Identifier' ? callee.symbol : callee.type === 'MemberExpr' ? callee.memberSymbol : null;
    if (sym && sym.kind === 'function' && sym.overloads && sym.overloads.length) {
      const all = [sym, ...sym.overloads];
      const viable = all.filter((s) => arityOk(s.type, e.args.length));
      let pick = viable[0] || sym, best = -Infinity;
      if (viable.length > 1) {
        for (const s of viable) {
          const sc = overloadScore(s.type, argTypes);
          if (sc > best) { best = sc; pick = s; }
        }
      }
      if (pick !== sym) {
        if (callee.type === 'Identifier') { callee.symbol = pick; pick.uses.push(callee); } else callee.memberSymbol = pick;
        sym = pick;
        ct = pick.type;
      }
    }
    if (sym && sym.kind === 'tag') {
      // constructor call T(args)
      return sym.type;
    }
    e.calleeSymbol = sym && sym.kind === 'function' ? sym : null;
    let ft = Ty.canonical(Ty.nonRef(ct));
    if (ft.kind === 'pointer') ft = Ty.canonical(ft.to);
    if (ft.kind === 'function') {
      e.refType = ft.ret;
      return Ty.nonRef(ft.ret);
    }
    if (ft.kind === 'closure') return ft.ret || T.unknown;
    return T.unknown;
  }

  member(e, scope) {
    const o = this.expr(e.object, scope);
    let t = Ty.canonical(Ty.nonRef(o));
    if (e.arrow) {
      const p = Ty.pointee(t);
      t = p ? Ty.canonical(p) : T.unknown;
    }
    if (t.kind === 'record') {
      const f = findField(t, e.member);
      if (f) {
        if (f.symbol) { e.memberSymbol = f.symbol; f.symbol.uses.push(e); }
        if (f.bitWidth != null) e.bitField = f.bitWidth;
        const q = {};
        if (t.const && !(f.symbol && f.symbol.mutable)) q.const = true;
        if (t.volatile) q.volatile = true;
        return Ty.withQuals(f.type, q);
      }
      if (t.scope) {
        const m = this.lookupIn(t.scope, e.member, {}, new Set());
        if (m) {
          e.memberSymbol = m;
          m.uses.push(e);
          return m.type;
        }
      }
      if (t.complete && !t.template && !(t.bases && t.bases.some((b) => Ty.isUnknown(b))) && !this.templateDepth) {
        this.diag('error', 'no-member', `'${t.tag} ${t.name || '<anonymous>'}' has no member named '${e.member}'`, e);
      }
    }
    return T.unknown;
  }

  lambda(e, scope) {
    for (const c of e.captures) if (c.init) this.expr(c.init, scope);
    const ls = new Scope('function', scope, e, null);
    e.scope = ls;
    const params = [];
    for (const p of e.params) {
      const pt = this.typeOfParam(p, ls);
      params.push(pt);
      if (p.name) {
        const sym = this.newSymbol({ name: p.name, kind: 'parameter', type: pt, scope: ls, storage: 'automatic' });
        sym.decls.push(p);
        sym.definition = p;
        p.symbol = sym;
        ls.names.set(p.name, sym);
      }
    }
    for (const c of e.captures) {
      if (c.kind === 'init') {
        const sym = this.newSymbol({ name: c.name, kind: 'variable', type: c.init ? c.init.ctype || T.unknown : T.unknown, scope: ls, storage: 'automatic' });
        ls.names.set(c.name, sym);
        c.symbol = sym;
      } else if (c.kind === 'name') {
        c.symbol = this.lookup(c.name, scope);
      }
    }
    let ret = e.trailingReturn ? this.typeOfTypeName(e.trailingReturn, ls) : { kind: 'auto' };
    const frame = { fd: e, sym: null, scope: ls, ret, gotos: [], returns: [] };
    this.fnStack.push(frame);
    try {
      this.compound(e.body, ls, true);
    } finally {
      this.fnStack.pop();
    }
    if (ret.kind === 'auto') {
      const r = frame.returns.find((x) => x.arg && x.arg.ctype);
      ret = r ? Ty.unqualified(Ty.decay(r.arg.ctype)) : T.void;
    }
    return { kind: 'closure', node: e, ret, params };
  }
}

// ---------------------------------------------------------------- helpers

function arrayParamQuals(d) {
  // C99: int a[const static 10] -> int *const a
  let x = d;
  while (x && x.inner && x.type !== 'ArrayDeclarator') x = x.inner;
  const q = {};
  if (x && x.type === 'ArrayDeclarator') for (const k of x.quals || []) q[k] = true;
  return q;
}

// Rough overload ranking (exact > same category > unknown; a pointer never
// binds to an arithmetic parameter or the reverse, except a null constant).
function overloadScore(ft, argTypes) {
  const f = Ty.canonical(ft);
  if (!f || f.kind !== 'function') return 0;
  let score = 0;
  for (let i = 0; i < argTypes.length && i < f.params.length; i++) {
    const p = Ty.unqualified(Ty.nonRef(f.params[i]));
    const a0 = Ty.unqualified(Ty.nonRef(argTypes[i] || T.unknown));
    const a = a0.kind === 'array' || a0.kind === 'function' ? Ty.decay(a0) : a0;
    if (Ty.isUnknown(p) || Ty.isUnknown(a)) { score += 1; continue; }
    if (Ty.sameType(p, a, { ignoreQuals: true })) { score += 4; continue; }
    const pp = p.kind === 'pointer' || p.kind === 'nullptr', ap = a.kind === 'pointer' || a.kind === 'nullptr';
    if (pp && ap) { score += 2; continue; }
    if (Ty.isArithmetic(p) && Ty.isArithmetic(a)) { score += (Ty.isInteger(p) === Ty.isInteger(a)) ? 3 : 2; continue; }
    if (p.kind === 'record' && a.kind === 'record') { score += p.name === a.name ? 3 : 0; continue; }
    if ((pp && Ty.isArithmetic(a)) || (ap && Ty.isArithmetic(p))) { score -= 10; continue; }
    score += 0;
  }
  return score;
}

function isTypeSymbol(s) {
  return !!s && (s.kind === 'tag' || s.kind === 'typedef' || s.kind === 'namespace');
}

function sameParams(a, b) {
  const A = Ty.canonical(a), B = Ty.canonical(b);
  if (A.kind !== 'function' || B.kind !== 'function') return false;
  if (A.params.length !== B.params.length || A.variadic !== B.variadic) return false;
  for (let i = 0; i < A.params.length; i++) if (!Ty.sameType(A.params[i], B.params[i], { ignoreQuals: true })) return false;
  const qa = (A.quals || []).join(), qb = (B.quals || []).join();
  return qa === qb && (A.refQual || '') === (B.refQual || '');
}

function arityOk(t, n) {
  const c = Ty.canonical(t);
  if (c.kind !== 'function') return false;
  return n === c.params.length || (c.variadic && n >= c.params.length);
}

function autoDeduce(declT, initT) {
  const it = Ty.unqualified(Ty.decay(Ty.nonRef(initT || T.unknown)));
  const c = Ty.canonical(declT);
  if (c.kind === 'auto') return Ty.withQuals(it, Ty.qualsOf(c));
  if (c.kind === 'reference' && Ty.canonical(c.to).kind === 'auto') return Ty.referenceTo(Ty.withQuals(Ty.nonRef(initT || T.unknown), Ty.qualsOf(Ty.canonical(c.to))), c.rvalue);
  if (c.kind === 'pointer' && Ty.canonical(c.to).kind === 'auto') return Ty.withQuals(it, Ty.qualsOf(c));
  return declT;
}

function completeArrayFromInit(t, init, sema) {
  const c = Ty.canonical(t);
  if (c.kind !== 'array' || c.size != null || !init) return t;
  let n = null;
  if (init.type === 'StringLiteral') n = Ty.canonical(init.ctype).size;
  else if (init.type === 'InitList') {
    if (init.items.length === 1 && init.items[0].type === 'StringLiteral' && Ty.isCharType(c.of)) n = Ty.canonical(init.items[0].ctype).size;
    else {
      let idx = 0, max = 0;
      for (const it of init.items) {
        if (it.type === 'DesignatedInit' && it.designators[0] && it.designators[0].kind === 'index' && it.designators[0].indexValue != null) {
          idx = it.designators[0].indexValue;
        }
        idx++;
        if (idx > max) max = idx;
      }
      n = max;
    }
  }
  void sema;
  if (n == null) return t;
  return { ...c, size: n };
}

// Find a field (searching anonymous members and C++ bases).
function findField(rec, name, depth = 0) {
  if (!rec || depth > 20) return null;
  const r = Ty.canonical(rec);
  if (r.kind !== 'record') return null;
  for (const f of r.fields || []) {
    if (f.name === name) return f;
    if (f.anonymous) {
      const x = findField(f.type, name, depth + 1);
      if (x) return x;
    }
  }
  for (const b of r.bases || []) {
    const x = findField(b, name, depth + 1);
    if (x) return x;
  }
  return null;
}

function offsetOf(t, designators, tg) {
  let cur = Ty.canonical(t);
  let off = 0;
  for (const d of designators) {
    if (d.kind === 'field') {
      if (cur.kind !== 'record') return null;
      const lay = Ty.layout(cur, tg);
      if (!lay) return null;
      const f = lay.fields.find((x) => x.name === d.name);
      if (!f) {
        // anonymous members
        const anon = (cur.fields || []).filter((x) => x.anonymous);
        let found = false;
        for (const a of anon) {
          const idx = cur.fields.indexOf(a);
          const al = lay.fields[idx];
          const sub = offsetOf(a.type, [d], tg);
          if (sub != null && al) { off += al.offset + sub; cur = Ty.canonical(findField(a.type, d.name).type); found = true; break; }
        }
        if (!found) return null;
        continue;
      }
      off += f.offset;
      const fd = findField(cur, d.name);
      cur = Ty.canonical(fd.type);
    } else {
      if (cur.kind !== 'array') return null;
      const v = Ty.constValue(d.index, { target: tg });
      const es = Ty.sizeOf(cur.of, tg);
      if (!v || es == null) return null;
      off += Number(v.value) * es;
      cur = Ty.canonical(cur.of);
    }
  }
  return off;
}

function analyzeUnit(ast, opts = {}) {
  const s = new Sema(opts);
  try {
    s.run(ast);
  } catch (e) {
    if (e instanceof RangeError) s.diag('error', 'sema-too-deep', 'Expression nesting too deep for semantic analysis', null);
    else s.diag('error', 'sema-internal', `Internal semantic analysis error: ${e && e.message}`, null);
  }
  const externals = s.symbols.filter((x) => x.linkage === 'external' && (x.kind === 'function' || x.kind === 'variable'));
  return {
    fileScope: s.fileScope,
    symbols: s.symbols,
    externals,
    unresolved: s.unresolved,
    diagnostics: s.diagnostics,
    lookup: (name, scope) => s.lookup(name, scope || s.fileScope),
    lookupQualified: (qname, scope) => {
      const i = qname.lastIndexOf('::');
      return s.lookupQualified({ name: i < 0 ? qname : qname.slice(i + 2), qualifier: i < 0 ? '' : qname.slice(0, i).replace(/^::/, ''), global: qname.startsWith('::') }, scope || s.fileScope);
    },
  };
}

module.exports = { analyzeUnit, Scope, Sema, findField, NORETURN_NAMES, declLeaf };
