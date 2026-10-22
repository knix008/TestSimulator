'use strict';

// Scopes and symbols (LEGB). Module, class, function, lambda and
// comprehension scopes; global / nonlocal declarations; walrus targets bind
// in the nearest non-comprehension scope; the first comprehension iterable,
// decorators, defaults, annotations and class bases are evaluated in the
// enclosing scope. Every Name node gets `sym` (a Symbol, BUILTIN or null).

const { walkLocal, targetNames, children } = require('./ast');

const BUILTINS = new Set(('abs aiter all anext any ascii bin bool breakpoint bytearray bytes callable chr classmethod compile complex ' +
  'copyright credits delattr dict dir divmod enumerate eval exec exit filter float format frozenset getattr globals hasattr hash help hex id ' +
  'input int isinstance issubclass iter len license list locals map max memoryview min next object oct open ord pow print property quit ' +
  'range repr reversed round set setattr slice sorted staticmethod str sum super tuple type vars zip __import__ __build_class__ ' +
  'None True False Ellipsis NotImplemented __debug__ __name__ __file__ __doc__ __builtins__ __spec__ __loader__ __package__ __path__ ' +
  '__annotations__ __dict__ __cached__ reveal_type reveal_locals _IncompleteInputError __annotate__ __conditional_annotations__ ' +
  'BaseException BaseExceptionGroup Exception ExceptionGroup GeneratorExit KeyboardInterrupt SystemExit ArithmeticError AssertionError ' +
  'AttributeError BufferError EOFError ImportError LookupError MemoryError NameError OSError ReferenceError RuntimeError StopAsyncIteration ' +
  'StopIteration SyntaxError SystemError TypeError ValueError Warning FloatingPointError OverflowError ZeroDivisionError BytesWarning ' +
  'DeprecationWarning EncodingWarning FutureWarning ImportWarning PendingDeprecationWarning ResourceWarning RuntimeWarning SyntaxWarning ' +
  'UnicodeWarning UserWarning BlockingIOError ChildProcessError ConnectionError BrokenPipeError ConnectionAbortedError ConnectionRefusedError ' +
  'ConnectionResetError FileExistsError FileNotFoundError InterruptedError IsADirectoryError NotADirectoryError PermissionError ' +
  'ProcessLookupError TimeoutError IndentationError TabError ModuleNotFoundError IndexError KeyError UnboundLocalError NotImplementedError ' +
  'RecursionError PythonFinalizationError UnicodeError UnicodeDecodeError UnicodeEncodeError UnicodeTranslateError EnvironmentError IOError WindowsError').split(/\s+/));

const BUILTIN = { builtin: true };

class Scope {
  constructor(kind, node, parent) {
    this.kind = kind; // module | class | function | lambda | comprehension
    this.node = node;
    this.parent = parent;
    this.symbols = new Map();
    this.children = [];
    this.globals = new Map(); // name -> Global node
    this.nonlocals = new Map();
    this.dynamic = false; // uses locals()/vars()/exec/eval
    this.starImport = false;
    if (parent) parent.children.push(this);
    if (node) node.scope = this;
  }

  isFunctionLike() { return this.kind === 'function' || this.kind === 'lambda'; }
}

class Symbol {
  constructor(name, scope) {
    this.name = name;
    this.scope = scope;
    this.bindings = []; // { node, kind, stmt }
    this.uses = []; // Name nodes (Load / Del / AugAssign target)
    this.captured = false; // read from a nested scope
    this.nonlocalAssigned = false; // rebound from a nested scope via nonlocal
    this.globalAssigned = false; // rebound from a function via global
  }
  get isParam() { return this.bindings.some((b) => b.kind === 'param'); }
  get isImport() { return this.bindings.length > 0 && this.bindings.every((b) => b.kind === 'import'); }
}

function stmtOf(n) {
  let p = n;
  while (p && p.parent && !/^(?:FunctionDef|AsyncFunctionDef|ClassDef|Return|Delete|Assign|AugAssign|AnnAssign|TypeAlias|For|AsyncFor|While|If|With|AsyncWith|Match|Raise|Try|TryStar|Assert|Import|ImportFrom|Global|Nonlocal|Expr|Pass|Break|Continue|ExceptHandler|match_case|comprehension)$/.test(p.type)) p = p.parent;
  return p;
}

class ScopeBuilder {
  constructor(module) {
    this.module = module;
    this.root = new Scope('module', module, null);
    this.refs = [];
    this.undefined = [];
    this.allScopes = [this.root];
    this.deferred = [];
  }

  build() {
    this.prescan(this.root, this.module.body);
    for (const s of this.module.body) this.visit(s, this.root);
    for (const d of this.deferred) {
      const sym = this.lookupNonlocal(d.scope, d.name) || this.symbol(d.scope, d.name);
      sym.bindings.push({ node: d.node, kind: d.kind, stmt: d.stmt, fromScope: d.scope });
      if (sym.scope !== d.scope) sym.nonlocalAssigned = true;
      d.node.sym = sym;
    }
    for (const [node, scope] of this.refs) this.resolveRef(node, scope);
    return this.root;
  }

  newScope(kind, node, parent) {
    const s = new Scope(kind, node, parent);
    this.allScopes.push(s);
    return s;
  }

  prescan(scope, body) {
    const visitor = (n) => {
      if (n.type === 'Global') for (const name of n.names) scope.globals.set(name, n);
      else if (n.type === 'Nonlocal') for (const name of n.names) scope.nonlocals.set(name, n);
      else if (n.type === 'Call' && n.func.type === 'Name' && (n.func.id === 'locals' || n.func.id === 'exec' || n.func.id === 'eval' || (n.func.id === 'vars' && !n.args.length))) scope.dynamic = true;
      return true;
    };
    for (const s of body) walkLocal(s, visitor, true);
  }

  symbol(scope, name) {
    let s = scope.symbols.get(name);
    if (!s) { s = new Symbol(name, scope); scope.symbols.set(name, s); }
    return s;
  }

  // bind `name` in `scope`, honoring global / nonlocal declarations
  bind(scope, name, node, kind) {
    const stmt = stmtOf(node);
    if (scope.kind !== 'module' && scope.globals.has(name)) {
      const sym = this.symbol(this.root, name);
      sym.bindings.push({ node, kind, stmt, fromScope: scope });
      sym.globalAssigned = true;
      node.sym = sym;
      return sym;
    }
    if (scope.nonlocals.has(name)) {
      this.deferred.push({ scope, name, node, kind, stmt });
      return null;
    }
    const sym = this.symbol(scope, name);
    sym.bindings.push({ node, kind, stmt });
    node.sym = sym;
    return sym;
  }

  lookupNonlocal(scope, name) {
    let p = scope.parent;
    while (p) {
      if (p.isFunctionLike() && p.symbols.has(name) && !p.nonlocals.has(name)) return p.symbols.get(name);
      p = p.parent;
    }
    return null;
  }

  ref(node, scope) { this.refs.push([node, scope]); }

  resolve(name, scope) {
    if (scope.kind !== 'module' && scope.globals.has(name)) return this.root.symbols.get(name) || null;
    if (scope.nonlocals.has(name)) return this.lookupNonlocal(scope, name);
    if (scope.symbols.has(name)) return scope.symbols.get(name);
    let p = scope.parent;
    while (p) {
      if (p.kind !== 'class') {
        if (p.kind !== 'module' && p.globals.has(name)) return this.root.symbols.get(name) || null;
        if (p.symbols.has(name)) return p.symbols.get(name);
      }
      p = p.parent;
    }
    return null;
  }

  resolveRef(node, scope) {
    const sym = this.resolve(node.id, scope);
    if (sym) {
      sym.uses.push(node);
      node.sym = sym;
      if (sym.scope !== scope) {
        // reads across a function boundary make it a closure variable
        let p = scope;
        while (p && p !== sym.scope) { if (p.kind !== 'comprehension') { sym.captured = true; break; } p = p.parent; }
      }
      return;
    }
    if (BUILTINS.has(node.id)) { node.sym = BUILTIN; return; }
    node.sym = null;
    this.undefined.push({ node, scope });
  }

  visitTarget(t, scope, kind) {
    if (!t) return;
    switch (t.type) {
      case 'Name': this.bind(scope, t.id, t, kind); break;
      case 'Tuple': case 'List': for (const e of t.elts) this.visitTarget(e, scope, kind === 'assign' ? 'unpack' : kind); break;
      case 'Starred': this.visitTarget(t.value, scope, kind); break;
      default: this.visit(t, scope); break; // Attribute / Subscript: loads inside
    }
  }

  visitFunctionHeader(n, scope) {
    for (const d of n.decorator_list) this.visit(d, scope);
    const a = n.args;
    for (const d of a.defaults) this.visit(d, scope);
    for (const d of a.kw_defaults) if (d) this.visit(d, scope);
    for (const p of [...a.posonlyargs, ...a.args, a.vararg, ...a.kwonlyargs, a.kwarg]) if (p && p.annotation) this.visit(p.annotation, scope);
    if (n.returns) this.visit(n.returns, scope);
  }

  visit(n, scope) {
    if (!n) return;
    switch (n.type) {
      case 'FunctionDef':
      case 'AsyncFunctionDef': {
        this.visitFunctionHeader(n, scope);
        this.bind(scope, n.name, n, 'def');
        const fs = this.newScope('function', n, scope);
        for (const tp of n.type_params) { this.bind(fs, tp.name, tp, 'typeparam'); if (tp.bound) this.visit(tp.bound, fs); }
        this.prescan(fs, n.body);
        const a = n.args;
        for (const p of [...a.posonlyargs, ...a.args, a.vararg, ...a.kwonlyargs, a.kwarg]) if (p) this.bind(fs, p.arg, p, 'param');
        for (const s of n.body) this.visit(s, fs);
        return;
      }
      case 'Lambda': {
        const a = n.args;
        for (const d of a.defaults) this.visit(d, scope);
        for (const d of a.kw_defaults) if (d) this.visit(d, scope);
        const ls = this.newScope('lambda', n, scope);
        for (const p of [...a.posonlyargs, ...a.args, a.vararg, ...a.kwonlyargs, a.kwarg]) if (p) this.bind(ls, p.arg, p, 'param');
        this.visit(n.body, ls);
        return;
      }
      case 'ClassDef': {
        for (const d of n.decorator_list) this.visit(d, scope);
        for (const b of n.bases) this.visit(b, scope);
        for (const k of n.keywords) this.visit(k.value, scope);
        this.bind(scope, n.name, n, 'class');
        const cs = this.newScope('class', n, scope);
        for (const tp of n.type_params) this.bind(cs, tp.name, tp, 'typeparam');
        this.prescan(cs, n.body);
        for (const s of n.body) this.visit(s, cs);
        return;
      }
      case 'ListComp': case 'SetComp': case 'GeneratorExp': case 'DictComp': {
        this.visit(n.generators[0].iter, scope);
        const cs = this.newScope('comprehension', n, scope);
        n.generators.forEach((g, i) => {
          if (i > 0) this.visit(g.iter, cs);
          this.visitTarget(g.target, cs, 'comprehension');
          for (const c of g.ifs) this.visit(c, cs);
        });
        if (n.type === 'DictComp') { this.visit(n.key, cs); this.visit(n.value, cs); } else this.visit(n.elt, cs);
        return;
      }
      case 'NamedExpr': {
        this.visit(n.value, scope);
        let s = scope;
        while (s.kind === 'comprehension' && s.parent) s = s.parent;
        this.bind(s, n.target.id, n.target, 'walrus');
        return;
      }
      case 'Name':
        if (n.ctx === 'Store') this.bind(scope, n.id, n, 'assign');
        else if (n.ctx === 'Del') { this.ref(n, scope); this.bind(scope, n.id, n, 'del'); } else this.ref(n, scope);
        return;
      case 'Assign':
        this.visit(n.value, scope);
        for (const t of n.targets) this.visitTarget(t, scope, 'assign');
        return;
      case 'AugAssign':
        this.visit(n.value, scope);
        if (n.target.type === 'Name') {
          const use = { ...n.target, ctx: 'Load', augUse: true, parent: n };
          n.target.augUse = use;
          this.ref(use, scope);
          this.bind(scope, n.target.id, n.target, 'augassign');
        } else this.visit(n.target, scope);
        return;
      case 'AnnAssign':
        this.visit(n.annotation, scope);
        if (n.value) this.visit(n.value, scope);
        if (n.target.type === 'Name') this.bind(scope, n.target.id, n.target, n.value ? 'assign' : 'annotation');
        else this.visit(n.target, scope);
        return;
      case 'For': case 'AsyncFor':
        this.visit(n.iter, scope);
        this.visitTarget(n.target, scope, 'for');
        for (const s of n.body) this.visit(s, scope);
        for (const s of n.orelse) this.visit(s, scope);
        return;
      case 'With': case 'AsyncWith':
        for (const it of n.items) {
          this.visit(it.context_expr, scope);
          if (it.optional_vars) this.visitTarget(it.optional_vars, scope, 'with');
        }
        for (const s of n.body) this.visit(s, scope);
        return;
      case 'ExceptHandler':
        if (n.etype) this.visit(n.etype, scope);
        if (n.name) {
          const pseudo = { type: 'Name', id: n.name, ctx: 'Store', line: n.nameLine || n.line, col: n.nameCol || n.col, endLine: n.nameLine || n.line, endCol: (n.nameCol || n.col) + n.name.length, parent: n, handlerName: true };
          n.nameNode = pseudo;
          this.bind(scope, n.name, pseudo, 'except');
        }
        for (const s of n.body) this.visit(s, scope);
        return;
      case 'Import':
        for (const a of n.names) {
          const name = a.asname || a.name.split('.')[0];
          a.bound = name;
          this.bind(scope, name, a, 'import');
        }
        return;
      case 'ImportFrom':
        for (const a of n.names) {
          if (a.name === '*') { scope.starImport = true; continue; }
          a.bound = a.asname || a.name;
          this.bind(scope, a.bound, a, 'import');
        }
        return;
      case 'TypeAlias':
        this.bind(scope, n.name.id, n.name, 'typealias');
        this.visit(n.value, scope);
        return;
      case 'MatchAs':
        if (n.pattern) this.visit(n.pattern, scope);
        if (n.name) { const pseudo = n.nameNode || { type: 'Name', id: n.name, ctx: 'Store', line: n.line, col: n.col, endLine: n.endLine, endCol: n.endCol, parent: n }; n.nameNode = pseudo; this.bind(scope, n.name, pseudo, 'match'); }
        return;
      case 'MatchStar':
        if (n.name) { const pseudo = { type: 'Name', id: n.name, ctx: 'Store', line: n.line, col: n.col, endLine: n.endLine, endCol: n.endCol, parent: n }; n.nameNode = pseudo; this.bind(scope, n.name, pseudo, 'match'); }
        return;
      case 'MatchMapping':
        for (const k of n.keys) this.visit(k, scope);
        for (const p of n.patterns) this.visit(p, scope);
        if (n.rest) { const pseudo = { type: 'Name', id: n.rest, ctx: 'Store', line: n.line, col: n.col, endLine: n.line, endCol: n.col, parent: n }; n.restNode = pseudo; this.bind(scope, n.rest, pseudo, 'match'); }
        return;
      case 'Global': case 'Nonlocal':
        return;
      default: {
        for (const c of children(n)) this.visit(c, scope);
      }
    }
  }
}

function buildScopes(module) {
  const b = new ScopeBuilder(module);
  const root = b.build();
  return { root, undefined: b.undefined, scopes: b.allScopes };
}

// Scope that a node is evaluated in (walks up to the nearest scope node).
function scopeOf(n) {
  let p = n.parent;
  let child = n;
  while (p) {
    if (p.scope) {
      // parts of a function/class header are evaluated in the enclosing scope
      if ((p.type === 'FunctionDef' || p.type === 'AsyncFunctionDef') && !p.body.includes(child)) { child = p; p = p.parent; continue; }
      if (p.type === 'ClassDef' && !p.body.includes(child)) { child = p; p = p.parent; continue; }
      if (p.type === 'Lambda' && child !== p.body) { child = p; p = p.parent; continue; }
      if (p.generators && p.generators[0] && child === p.generators[0] && containsIter(p.generators[0], n)) { child = p; p = p.parent; continue; }
      return p.scope;
    }
    child = p;
    p = p.parent;
  }
  return null;
}

function containsIter(gen, n) {
  let q = n;
  while (q && q !== gen) { if (q === gen.iter) return true; q = q.parent; }
  return false;
}

module.exports = { buildScopes, scopeOf, BUILTINS, BUILTIN, Scope, Symbol, targetNames };
