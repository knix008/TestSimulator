'use strict';

// Scope and symbol resolution: declarations (with hoisting), references
// (read / write / type), closures, imports and exports.

const { patternIds } = require('./walk');

class Scope {
  constructor(type, node, parent) {
    this.type = type;
    this.node = node;
    this.parent = parent;
    this.vars = new Map();
    this.refs = [];
    this.children = [];
    // fn: the scope that owns `var` declarations and closures
    this.fn = (type === 'function' || type === 'module' || type === 'global' || type === 'class' || type === 'static' || type === 'tsmodule') ? this : parent.fn;
    if (parent) parent.children.push(this);
  }
  varScope() {
    let s = this;
    while (s.type !== 'function' && s.type !== 'module' && s.type !== 'global' && s.type !== 'static' && s.type !== 'tsmodule') s = s.parent;
    return s;
  }
}

class Variable {
  constructor(name, scope) {
    this.name = name;
    this.scope = scope;
    this.defs = [];
    this.refs = [];
    this.exported = false;
    this.captured = false;
    this.writtenInClosure = false;
  }
  get kind() { return this.defs.length ? this.defs[0].kind : 'implicit'; }
  isTypeOnly() { return this.defs.length > 0 && this.defs.every((d) => TYPE_KINDS.has(d.kind)); }
  reads() { return this.refs.filter((r) => r.read); }
  writes() { return this.refs.filter((r) => r.write); }
}

const TYPE_KINDS = new Set(['type', 'interface']);

class ScopeManager {
  constructor(ast, opts) {
    this.ast = ast;
    this.isModule = !!opts.module;
    this.scopes = [];
    this.byNode = new Map();
    this.allRefs = [];
    this.through = [];
    this.globalScope = this.newScope(this.isModule ? 'module' : 'global', ast, null);
    this.hasJsx = false;
    this.hasEval = new Set(); // function scopes containing direct eval / with
  }

  newScope(type, node, parent) {
    const s = new Scope(type, node, parent);
    this.scopes.push(s);
    if (!this.byNode.has(node)) this.byNode.set(node, s);
    return s;
  }

  declare(scope, id, kind, node, extra) {
    if (!id || id.type !== 'Identifier') return null;
    let v = scope.vars.get(id.name);
    if (!v) { v = new Variable(id.name, scope); scope.vars.set(id.name, v); }
    v.defs.push({ kind, id, node, ...(extra || {}) });
    id._var = v;
    return v;
  }

  declarePattern(scope, pattern, kind, node, extra) {
    for (const id of patternIds(pattern)) this.declare(scope, id, kind, node, extra);
  }

  ref(scope, id, flags) {
    const r = { id, scope, read: !!flags.read, write: !!flags.write, init: !!flags.init, writeExpr: flags.writeExpr || null, type: !!flags.type, compound: !!flags.compound, pattern: !!flags.pattern, exported: !!flags.exported, forIn: !!flags.forIn, resolved: null };
    scope.refs.push(r);
    this.allRefs.push(r);
    id._ref = r;
    return r;
  }
}

function analyzeScopes(ast, opts = {}) {
  const sm = new ScopeManager(ast, opts);
  const V = new Visitor(sm);
  V.program(ast);
  resolve(sm);
  return sm;
}

class Visitor {
  constructor(sm) { this.sm = sm; }

  program(ast) {
    const s = this.sm.globalScope;
    for (const st of ast.body) this.visit(st, s);
  }

  // ---- patterns used as assignment targets (writes)
  target(p, scope, flags) {
    if (!p) return;
    switch (p.type) {
      case 'Identifier': this.sm.ref(scope, p, flags); break;
      case 'MemberExpression': this.visit(p, scope); break;
      case 'ObjectPattern':
        for (const prop of p.properties) {
          if (prop.type === 'RestElement') this.target(prop.argument, scope, { ...flags, pattern: true });
          else {
            if (prop.computed) this.visit(prop.key, scope);
            this.target(prop.value, scope, { ...flags, pattern: true });
          }
        }
        break;
      case 'ArrayPattern':
        for (const e of p.elements) this.target(e, scope, { ...flags, pattern: true });
        break;
      case 'RestElement': this.target(p.argument, scope, { ...flags, pattern: true }); break;
      case 'AssignmentPattern':
        this.visit(p.right, scope);
        this.target(p.left, scope, { ...flags, pattern: true });
        break;
      case 'TSAsExpression': case 'TSNonNullExpression': case 'TSSatisfiesExpression': case 'TSTypeAssertion':
        this.target(p.expression, scope, flags);
        break;
      default: this.visit(p, scope); break;
    }
    if (p.typeAnnotation) this.visit(p.typeAnnotation, scope);
  }

  // Defaults and computed keys inside a binding pattern (declarations).
  patternExprs(p, scope) {
    if (!p) return;
    switch (p.type) {
      case 'ObjectPattern':
        for (const prop of p.properties) {
          if (prop.type === 'RestElement') this.patternExprs(prop.argument, scope);
          else { if (prop.computed) this.visit(prop.key, scope); this.patternExprs(prop.value, scope); }
        }
        break;
      case 'ArrayPattern': for (const e of p.elements) this.patternExprs(e, scope); break;
      case 'RestElement': this.patternExprs(p.argument, scope); if (p.typeAnnotation) this.visit(p.typeAnnotation, scope); break;
      case 'AssignmentPattern': this.patternExprs(p.left, scope); this.visit(p.right, scope); break;
      case 'TSParameterProperty': this.patternExprs(p.parameter, scope); break;
      default: break;
    }
    if (p.typeAnnotation && p.type !== 'RestElement') this.visit(p.typeAnnotation, scope);
    if (p.decorators) for (const d of p.decorators) this.visit(d, scope);
  }

  // Writes of a declaration's binding identifiers.
  declWrites(p, scope, init, flags) {
    for (const id of patternIds(p)) {
      this.sm.ref(scope, id, { write: true, init: true, writeExpr: p.type === 'Identifier' ? init : null, pattern: p.type !== 'Identifier', ...flags });
    }
  }

  fn(node, scope) {
    let outer = scope;
    if (node.type === 'FunctionExpression' && node.id) {
      outer = this.sm.newScope('function-name', node, scope);
      this.sm.declare(outer, node.id, 'function-name', node);
    }
    const fs = this.sm.newScope('function', node, outer);
    this.sm.byNode.set(node, fs);
    fs.isArrow = node.type === 'ArrowFunctionExpression';
    for (const p of node.params) {
      const param = p.type === 'TSParameterProperty' ? p.parameter : p;
      this.sm.declarePattern(fs, param, 'param', node);
    }
    for (const p of node.params) {
      this.patternExprs(p, fs);
      if (p.type === 'Identifier' || p.type === 'AssignmentPattern' || p.type === 'RestElement' || p.type === 'TSParameterProperty' || p.type === 'ObjectPattern' || p.type === 'ArrayPattern') {
        const param = p.type === 'TSParameterProperty' ? p.parameter : p;
        for (const id of patternIds(param)) this.sm.ref(fs, id, { write: true, init: true, pattern: true });
      }
    }
    if (node.typeParameters) this.visit(node.typeParameters, fs);
    if (node.returnType) this.visit(node.returnType, fs);
    if (!node.body) return;
    if (node.body.type === 'BlockStatement') {
      this.sm.byNode.set(node.body, fs);
      for (const st of node.body.body) this.visit(st, fs);
    } else this.visit(node.body, fs);
  }

  cls(node, scope) {
    for (const d of node.decorators || []) this.visit(d, scope);
    if (node.superClass) this.visit(node.superClass, scope);
    if (node.superTypeArguments) this.visit(node.superTypeArguments, scope);
    for (const i of node.implements || []) this.visit(i, scope);
    const cs = this.sm.newScope('class', node, scope);
    if (node.id) this.sm.declare(cs, node.id, 'class-name', node);
    if (node.typeParameters) this.visit(node.typeParameters, cs);
    for (const m of node.body.body) {
      for (const d of m.decorators || []) this.visit(d, cs);
      if (m.computed) this.visit(m.key, cs);
      if (m.type === 'MethodDefinition') this.fn(m.value, cs);
      else if (m.type === 'PropertyDefinition') {
        if (m.typeAnnotation) this.visit(m.typeAnnotation, cs);
        if (m.value) this.visit(m.value, cs);
      } else if (m.type === 'StaticBlock') {
        const ss = this.sm.newScope('static', m, cs);
        for (const st of m.body) this.visit(st, ss);
      } else this.visit(m, cs);
    }
  }

  typeRef(name, scope) {
    // leftmost identifier of an entity name
    let n = name;
    while (n && n.type === 'TSQualifiedName') n = n.left;
    if (n && n.type === 'Identifier' && n.name !== 'this') this.sm.ref(scope, n, { read: true, type: true });
  }

  visitAll(list, scope) {
    for (const x of list) if (x) this.visit(x, scope);
  }

  visitChildren(node, scope) {
    for (const key in node) {
      if (key === 'parent' || key === 'comments' || key.charCodeAt(0) === 95) continue;
      const v = node[key];
      if (v === null || typeof v !== 'object') continue;
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') this.visit(x, scope); } else if (typeof v.type === 'string') this.visit(v, scope);
    }
  }

  visit(node, scope) {
    if (!node) return;
    const sm = this.sm;
    switch (node.type) {
      case 'Identifier':
        sm.ref(scope, node, { read: true });
        if (node.typeAnnotation) this.visit(node.typeAnnotation, scope);
        return;
      case 'VariableDeclaration': {
        const target = node.kind === 'var' ? scope.varScope() : scope;
        for (const d of node.declarations) {
          sm.declarePattern(target, d.id, node.kind, d, { declare: !!node.declare });
          this.patternExprs(d.id, scope);
          if (d.init) this.visit(d.init, scope);
          const p = node.parent;
          const loopHead = p && (p.type === 'ForInStatement' || p.type === 'ForOfStatement') && p.left === node;
          if (d.init || loopHead) this.declWrites(d.id, scope, d.init, { forIn: loopHead });
        }
        return;
      }
      case 'FunctionDeclaration':
        if (node.id) sm.declare(scope, node.id, 'function', node);
        this.fn(node, scope);
        return;
      case 'TSDeclareFunction':
        if (node.id) sm.declare(scope, node.id, 'function', node, { overload: true });
        {
          const fs = sm.newScope('function', node, scope);
          for (const p of node.params) {
            sm.declarePattern(fs, p.type === 'TSParameterProperty' ? p.parameter : p, 'param', node);
            this.patternExprs(p, fs);
          }
          if (node.returnType) this.visit(node.returnType, fs);
          if (node.typeParameters) this.visit(node.typeParameters, fs);
        }
        return;
      case 'FunctionExpression': case 'ArrowFunctionExpression':
        this.fn(node, scope);
        return;
      case 'ClassDeclaration':
        if (node.id) sm.declare(scope, node.id, 'class', node, { declare: !!node.declare });
        this.cls(node, scope);
        return;
      case 'ClassExpression':
        this.cls(node, scope);
        return;
      case 'BlockStatement': {
        const bs = sm.newScope('block', node, scope);
        for (const st of node.body) this.visit(st, bs);
        return;
      }
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const head = node.type === 'ForStatement' ? node.init : node.left;
        let s = scope;
        if (head && head.type === 'VariableDeclaration' && head.kind !== 'var') s = sm.newScope('for', node, scope);
        if (node.type === 'ForStatement') {
          if (node.init) this.visit(node.init, s);
          if (node.test) this.visit(node.test, s);
          if (node.update) this.visit(node.update, s);
        } else {
          this.visit(node.right, s);
          if (head.type === 'VariableDeclaration') this.visit(head, s);
          else this.target(head, s, { write: true, forIn: true });
        }
        this.visit(node.body, s);
        return;
      }
      case 'SwitchStatement': {
        this.visit(node.discriminant, scope);
        const ss = sm.newScope('switch', node, scope);
        for (const c of node.cases) {
          if (c.test) this.visit(c.test, ss);
          for (const st of c.consequent) this.visit(st, ss);
        }
        return;
      }
      case 'CatchClause': {
        const cs = sm.newScope('catch', node, scope);
        if (node.param) {
          sm.declarePattern(cs, node.param, 'catch', node);
          this.patternExprs(node.param, cs);
          for (const id of patternIds(node.param)) sm.ref(cs, id, { write: true, init: true, pattern: true });
        }
        this.visit(node.body, cs);
        return;
      }
      case 'MemberExpression':
        this.visit(node.object, scope);
        if (node.computed) this.visit(node.property, scope);
        return;
      case 'Property':
        if (node.computed) this.visit(node.key, scope);
        if (node.parent && node.parent.type === 'ObjectPattern') { this.target(node.value, scope, { write: true, pattern: true }); return; }
        this.visit(node.value, scope);
        return;
      case 'LabeledStatement': this.visit(node.body, scope); return;
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'MetaProperty': case 'Super': case 'ThisExpression': case 'Literal': case 'PrivateIdentifier': case 'TemplateElement': return;
      case 'AssignmentExpression': {
        const compound = node.operator !== '=';
        this.visit(node.right, scope);
        if (node.left.type === 'Identifier') {
          sm.ref(scope, node.left, { write: true, read: compound, compound, writeExpr: node.right });
        } else this.target(node.left, scope, { write: true, read: compound });
        return;
      }
      case 'UpdateExpression':
        if (node.argument.type === 'Identifier') sm.ref(scope, node.argument, { read: true, write: true, compound: true });
        else this.visit(node.argument, scope);
        return;
      case 'ImportDeclaration':
        for (const sp of node.specifiers) sm.declare(scope, sp.local, 'import', sp, { importKind: node.importKind === 'type' || sp.importKind === 'type' ? 'type' : 'value', source: node.source.value });
        return;
      case 'TSImportEqualsDeclaration':
        sm.declare(scope, node.id, 'import', node, { importKind: node.importKind, source: node.moduleReference.type === 'TSExternalModuleReference' ? node.moduleReference.expression.value : null });
        if (node.moduleReference.type !== 'TSExternalModuleReference') this.typeRef(node.moduleReference, scope);
        return;
      case 'ExportNamedDeclaration':
        if (node.declaration) {
          this.visit(node.declaration, scope);
          markExported(node.declaration, scope);
        } else if (!node.source) {
          for (const sp of node.specifiers) {
            if (sp.local.type === 'Identifier') sm.ref(scope, sp.local, { read: true, exported: true, type: sp.exportKind === 'type' || node.exportKind === 'type' });
          }
        }
        return;
      case 'ExportDefaultDeclaration': {
        const d = node.declaration;
        if (d.type === 'Identifier') { sm.ref(scope, d, { read: true, exported: true }); return; }
        this.visit(d, scope);
        if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration' || d.type === 'TSInterfaceDeclaration') && d.id) {
          const v = scope.vars.get(d.id.name);
          if (v) v.exported = true;
        }
        return;
      }
      case 'ExportAllDeclaration': return;
      case 'TSExportAssignment':
        if (node.expression.type === 'Identifier') sm.ref(scope, node.expression, { read: true, exported: true });
        else this.visit(node.expression, scope);
        return;
      case 'JSXElement': {
        sm.hasJsx = true;
        const name = node.openingElement.name;
        if (name.type === 'JSXIdentifier') {
          if (/^[A-Z_$]/.test(name.name) || name.name.includes('$')) this.jsxRef(name, scope);
        } else if (name.type === 'JSXMemberExpression') {
          let o = name;
          while (o.type === 'JSXMemberExpression') o = o.object;
          this.jsxRef(o, scope);
        }
        for (const a of node.openingElement.attributes) {
          if (a.type === 'JSXSpreadAttribute') this.visit(a.argument, scope);
          else if (a.value) this.visit(a.value, scope);
        }
        this.visitAll(node.children, scope);
        return;
      }
      case 'JSXFragment':
        sm.hasJsx = true;
        this.visitAll(node.children, scope);
        return;
      case 'JSXExpressionContainer': case 'JSXSpreadChild':
        this.visit(node.expression, scope);
        return;
      case 'JSXText': case 'JSXEmptyExpression': case 'JSXIdentifier': case 'JSXMemberExpression': case 'JSXNamespacedName': return;
      case 'CallExpression':
        if (node.callee.type === 'Identifier' && node.callee.name === 'eval') sm.hasEval.add(scope.fn);
        this.visitChildren(node, scope);
        return;
      case 'WithStatement':
        sm.hasEval.add(scope.fn);
        this.visitChildren(node, scope);
        return;
      // ---- TypeScript
      case 'TSTypeReference':
        this.typeRef(node.typeName, scope);
        if (node.typeArguments) this.visit(node.typeArguments, scope);
        return;
      case 'TSTypeQuery': {
        let n = node.exprName;
        while (n && n.type === 'TSQualifiedName') n = n.left;
        if (n && n.type === 'Identifier') sm.ref(scope, n, { read: true });
        else if (n) this.visit(n, scope);
        if (node.typeArguments) this.visit(node.typeArguments, scope);
        return;
      }
      case 'TSClassImplements': case 'TSInterfaceHeritage':
        this.typeRef(node.expression, scope);
        if (node.typeArguments) this.visit(node.typeArguments, scope);
        return;
      case 'TSInterfaceDeclaration':
        sm.declare(scope, node.id, 'interface', node);
        if (node.typeParameters) this.visit(node.typeParameters, scope);
        this.visitAll(node.extends || [], scope);
        this.visit(node.body, scope);
        return;
      case 'TSTypeAliasDeclaration':
        sm.declare(scope, node.id, 'type', node);
        if (node.typeParameters) this.visit(node.typeParameters, scope);
        this.visit(node.typeAnnotation, scope);
        return;
      case 'TSEnumDeclaration': {
        sm.declare(scope, node.id, 'enum', node, { declare: !!node.declare });
        const es = sm.newScope('block', node, scope);
        for (const m of node.members) if (m.id.type === 'Identifier') sm.declare(es, m.id, 'enum-member', m);
        for (const m of node.members) {
          if (m.initializer) this.visit(m.initializer, es);
          if (m.id.type !== 'Identifier' && m.id.type !== 'Literal') this.visit(m.id, es);
        }
        return;
      }
      case 'TSModuleDeclaration': {
        if (node.id.type === 'Identifier' && node.kind !== 'global') sm.declare(scope, node.id, 'namespace', node, { declare: !!node.declare });
        else if (node.id.type === 'TSQualifiedName') {
          let n = node.id;
          while (n.type === 'TSQualifiedName') n = n.left;
          sm.declare(scope, n, 'namespace', node);
        }
        if (node.body) {
          const ms = sm.newScope('tsmodule', node, scope);
          for (const st of node.body.body) this.visit(st, ms);
        }
        return;
      }
      case 'TSPropertySignature':
        if (node.computed) this.visit(node.key, scope);
        if (node.typeAnnotation) this.visit(node.typeAnnotation, scope);
        return;
      case 'TSMethodSignature': case 'TSCallSignatureDeclaration': case 'TSConstructSignatureDeclaration': case 'TSFunctionType': case 'TSConstructorType':
        if (node.computed) this.visit(node.key, scope);
        if (node.typeParameters) this.visit(node.typeParameters, scope);
        for (const p of node.params || []) this.typeParam(p, scope);
        if (node.returnType) this.visit(node.returnType, scope);
        return;
      case 'TSIndexSignature':
        for (const p of node.parameters) this.typeParam(p, scope);
        if (node.typeAnnotation) this.visit(node.typeAnnotation, scope);
        return;
      case 'TSTypeParameter':
        if (node.constraint) this.visit(node.constraint, scope);
        if (node.default) this.visit(node.default, scope);
        return;
      case 'TSTypePredicate':
        if (node.typeAnnotation) this.visit(node.typeAnnotation, scope);
        return;
      case 'TSEnumMember': return;
      case 'TSNamedTupleMember': this.visit(node.elementType, scope); return;
      case 'TSImportType':
        if (node.typeArguments) this.visit(node.typeArguments, scope);
        return;
      case 'TSQualifiedName': this.typeRef(node, scope); return;
      case 'TSMappedType':
        if (node.typeParameter && node.typeParameter.constraint) this.visit(node.typeParameter.constraint, scope);
        if (node.nameType) this.visit(node.nameType, scope);
        if (node.typeAnnotation) this.visit(node.typeAnnotation, scope);
        return;
      case 'TSInferType':
        if (node.typeParameter.constraint) this.visit(node.typeParameter.constraint, scope);
        return;
      case 'TSParameterProperty': this.visit(node.parameter, scope); return;
      default:
        this.visitChildren(node, scope);
    }
  }

  typeParam(p, scope) {
    if (!p) return;
    if (p.type === 'AssignmentPattern') { this.typeParam(p.left, scope); return; }
    if (p.type === 'TSParameterProperty') { this.typeParam(p.parameter, scope); return; }
    if (p.typeAnnotation) this.visit(p.typeAnnotation, scope);
  }

  jsxRef(name, scope) {
    const id = { type: 'Identifier', name: name.name, start: name.start, end: name.end, parent: name.parent, _jsx: name };
    // the element name carries the reference too, so flow analysis sees <L /> as a read of L
    name._ref = this.sm.ref(scope, id, { read: true });
  }
}

function markExported(decl, scope) {
  const ids = [];
  if (decl.type === 'VariableDeclaration') for (const d of decl.declarations) ids.push(...patternIds(d.id));
  else if (decl.id && decl.id.type === 'Identifier') {
    // a class id's _var points at the inner class-name binding; mark the outer one too
    const outer = scope.vars.get(decl.id.name);
    if (outer) outer.exported = true;
    ids.push(decl.id);
  }
  for (const id of ids) if (id._var) id._var.exported = true;
}

function resolve(sm) {
  for (const r of sm.allRefs) {
    let s = r.scope;
    let found = null;
    const name = r.id.name;
    while (s) {
      const v = s.vars.get(name);
      if (v) {
        // value references skip type-only declarations
        if (!r.type && v.isTypeOnly()) { s = s.parent; continue; }
        found = v;
        break;
      }
      if (name === 'arguments' && s.type === 'function' && !s.isArrow) {
        found = new Variable('arguments', s);
        found.implicit = true;
        s.vars.set('arguments', found);
        break;
      }
      s = s.parent;
    }
    if (found) {
      r.resolved = found;
      found.refs.push(r);
      if (r.scope.fn !== found.scope.fn && !r.init) {
        found.captured = true;
        if (r.write) found.writtenInClosure = true;
      }
      if (r.exported) found.exported = true;
    } else {
      sm.through.push(r);
    }
  }
}

module.exports = { analyzeScopes, Scope, Variable, ScopeManager };
