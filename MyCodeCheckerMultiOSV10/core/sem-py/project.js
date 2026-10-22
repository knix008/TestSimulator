'use strict';

// Project index (modules, classes, functions across files), qualified names
// of imported symbols, and a light type inference: literals, constructors,
// annotations, common builtin / stdlib returns and project classes.

const { walk, walkLocal, dotted, isNone, docstring, FUNC_TYPES } = require('./ast');
const { BUILTIN, BUILTINS } = require('./scope');

const EXC_BUILTINS = new Set(['BaseException', 'BaseExceptionGroup', 'Exception', 'ExceptionGroup', 'GeneratorExit', 'KeyboardInterrupt', 'SystemExit',
  'ArithmeticError', 'AssertionError', 'AttributeError', 'BufferError', 'EOFError', 'ImportError', 'LookupError', 'MemoryError', 'NameError',
  'OSError', 'ReferenceError', 'RuntimeError', 'StopAsyncIteration', 'StopIteration', 'SyntaxError', 'SystemError', 'TypeError', 'ValueError',
  'Warning', 'FloatingPointError', 'OverflowError', 'ZeroDivisionError', 'BytesWarning', 'DeprecationWarning', 'EncodingWarning', 'FutureWarning',
  'ImportWarning', 'PendingDeprecationWarning', 'ResourceWarning', 'RuntimeWarning', 'SyntaxWarning', 'UnicodeWarning', 'UserWarning',
  'BlockingIOError', 'ChildProcessError', 'ConnectionError', 'BrokenPipeError', 'ConnectionAbortedError', 'ConnectionRefusedError',
  'ConnectionResetError', 'FileExistsError', 'FileNotFoundError', 'InterruptedError', 'IsADirectoryError', 'NotADirectoryError',
  'PermissionError', 'ProcessLookupError', 'TimeoutError', 'IndentationError', 'TabError', 'ModuleNotFoundError', 'IndexError', 'KeyError',
  'UnboundLocalError', 'NotImplementedError', 'RecursionError', 'UnicodeError', 'UnicodeDecodeError', 'UnicodeEncodeError',
  'UnicodeTranslateError', 'EnvironmentError', 'IOError', 'WindowsError', 'PythonFinalizationError']);

// builtin types and the special members we care about
const BUILTIN_TYPES = {
  object: [],
  int: ['__add__', '__index__', '__int__', '__float__', '__bool__', '__hash__'],
  float: ['__add__', '__float__', '__bool__', '__hash__'],
  complex: ['__add__', '__bool__', '__hash__'],
  bool: ['__add__', '__index__', '__int__', '__bool__', '__hash__'],
  str: ['__iter__', '__getitem__', '__len__', '__contains__', '__add__', '__hash__'],
  bytes: ['__iter__', '__getitem__', '__len__', '__contains__', '__add__', '__hash__'],
  bytearray: ['__iter__', '__getitem__', '__setitem__', '__len__', '__contains__', '__add__'],
  list: ['__iter__', '__getitem__', '__setitem__', '__delitem__', '__len__', '__contains__', '__add__'],
  tuple: ['__iter__', '__getitem__', '__len__', '__contains__', '__add__', '__hash__'],
  dict: ['__iter__', '__getitem__', '__setitem__', '__delitem__', '__len__', '__contains__'],
  set: ['__iter__', '__len__', '__contains__'],
  frozenset: ['__iter__', '__len__', '__contains__', '__hash__'],
  range: ['__iter__', '__getitem__', '__len__', '__contains__', '__hash__'],
  generator: ['__iter__', '__next__'],
  iterator: ['__iter__', '__next__'],
  function: ['__call__', '__hash__'],
  NoneType: ['__bool__', '__hash__'],
  ellipsis: [],
  file: ['__iter__', '__enter__', '__exit__', '__next__'],
  type: ['__call__', '__hash__'],
};

const NUMERIC = new Set(['int', 'float', 'complex', 'bool']);

const T = {
  none: { k: 'none' },
  inst: (name, cls) => ({ k: 'inst', name, cls: cls || null }),
  cls: (name, cls) => ({ k: 'class', name, cls: cls || null }),
  func: (fn, name) => ({ k: 'func', fn: fn || null, name }),
  module: (name) => ({ k: 'module', name }),
  optional: { k: 'optional' },
};

const BUILTIN_CALL_TYPES = {
  int: 'int', float: 'float', complex: 'complex', str: 'str', bytes: 'bytes', bytearray: 'bytearray', bool: 'bool', list: 'list', dict: 'dict',
  set: 'set', frozenset: 'frozenset', tuple: 'tuple', len: 'int', repr: 'str', ascii: 'str', format: 'str', chr: 'str', hex: 'str', oct: 'str',
  bin: 'str', ord: 'int', hash: 'int', id: 'int', input: 'str', sorted: 'list', range: 'range', isinstance: 'bool', issubclass: 'bool',
  callable: 'bool', hasattr: 'bool', open: 'file', enumerate: 'iterator', zip: 'iterator', map: 'iterator', filter: 'iterator',
  reversed: 'iterator', iter: 'iterator', divmod: 'tuple', any: 'bool', all: 'bool', object: 'object',
};

const STDLIB_RETURNS = {
  'os.path.join': 'str', 'os.path.basename': 'str', 'os.path.dirname': 'str', 'os.path.abspath': 'str', 'os.path.realpath': 'str',
  'os.path.normpath': 'str', 'os.path.expanduser': 'str', 'os.path.exists': 'bool', 'os.path.isfile': 'bool', 'os.path.isdir': 'bool',
  'os.path.splitext': 'tuple', 'os.path.split': 'tuple', 'os.getcwd': 'str', 'os.listdir': 'list', 'os.path.getsize': 'int',
  'json.dumps': 'str', 'json.loads': null, 'json.load': null, 'time.time': 'float', 'time.monotonic': 'float', 'time.perf_counter': 'float',
  're.compile': 'Pattern', 're.findall': 'list', 're.split': 'list', 're.sub': 'str', 're.escape': 'str', 'str.join': 'str',
  'math.sqrt': 'float', 'math.floor': 'int', 'math.ceil': 'int', 'random.random': 'float', 'random.randint': 'int', 'uuid.uuid4': 'UUID',
  'shutil.which': 'optional', 're.match': 'optional', 're.search': 'optional', 're.fullmatch': 'optional', 'os.environ.get': 'optional',
  'os.getenv': 'optional', 'shlex.split': 'list', 'glob.glob': 'list', 'subprocess.check_output': null, 'textwrap.dedent': 'str',
  'datetime.datetime.now': 'datetime', 'datetime.date.today': 'date', 'pathlib.Path': 'Path', 'collections.OrderedDict': 'dict',
  'collections.defaultdict': 'dict', 'collections.Counter': 'dict', 'collections.deque': 'list', 'copy.copy': null, 'copy.deepcopy': null,
  'tempfile.mkdtemp': 'str', 'tempfile.gettempdir': 'str', 'platform.system': 'str', 'socket.gethostname': 'str', 'getpass.getuser': 'str',
};

// methods of builtin types that return None (in place mutation)
const NONE_METHODS = {
  list: new Set(['append', 'extend', 'insert', 'remove', 'sort', 'reverse', 'clear']),
  dict: new Set(['update', 'clear']),
  set: new Set(['add', 'discard', 'update', 'clear', 'difference_update', 'intersection_update', 'symmetric_difference_update']),
  bytearray: new Set(['append', 'extend', 'insert', 'remove', 'reverse', 'clear']),
};
const STR_METHODS_STR = new Set(['strip', 'lstrip', 'rstrip', 'lower', 'upper', 'title', 'capitalize', 'casefold', 'replace', 'format', 'join',
  'zfill', 'center', 'ljust', 'rjust', 'swapcase', 'expandtabs', 'removeprefix', 'removesuffix', 'translate']);

function moduleNameOf(path) {
  let p = String(path).replace(/\\/g, '/').replace(/\.pyi?$/, '');
  p = p.replace(/^(?:\.\/)+/, '').replace(/^src\//, '');
  if (p.endsWith('/__init__')) p = p.slice(0, -9);
  return p.split('/').filter(Boolean).join('.');
}

class FunctionInfo {
  constructor(node, mod, cls) {
    this.node = node;
    this.name = node.name;
    this.mod = mod;
    this.cls = cls;
    this.decorators = node.decorator_list.map((d) => dotted(d.type === 'Call' ? d.func : d) || '?');
    this.isAsync = node.type === 'AsyncFunctionDef';
    let kind = cls ? 'method' : 'function';
    if (this.decorators.some((d) => d === 'staticmethod')) kind = 'staticmethod';
    else if (this.decorators.some((d) => d === 'classmethod')) kind = 'classmethod';
    else if (this.decorators.some((d) => d === 'property' || d.endsWith('.setter') || d.endsWith('.getter') || d.endsWith('.deleter') || d === 'cached_property' || d === 'functools.cached_property')) kind = 'property';
    this.kind = kind;
    let yields = false;
    let returnsValue = false;
    let returnsNone = false;
    walkLocal(node, (n) => {
      if (n.type === 'Yield' || n.type === 'YieldFrom') yields = true;
      else if (n.type === 'Return') { if (n.value && !isNone(n.value)) returnsValue = true; else returnsNone = true; }
      return true;
    });
    this.isGenerator = yields;
    this.returnsValue = returnsValue;
    this.returnsNone = returnsNone;
    this.isStub = isStubBody(node.body);
    this.isAbstract = this.decorators.some((d) => /(?:^|\.)abstract(?:method|property|classmethod|staticmethod)$/.test(d));
    this.isOverload = this.decorators.some((d) => /(?:^|\.)overload$/.test(d));
  }

  // decorators that keep the call signature
  get plainDecorators() {
    return this.decorators.every((d) => /^(?:staticmethod|classmethod|abstractmethod|abc\.abstractmethod|override|typing\.override|typing_extensions\.override|functools\.cache|functools\.lru_cache|lru_cache|cache|functools\.wraps)$/.test(d));
  }

  params() {
    const a = this.node.args;
    return { pos: [...a.posonlyargs, ...a.args], posonly: a.posonlyargs.length, ndefaults: a.defaults.length, vararg: a.vararg, kwonly: a.kwonlyargs, kwDefaults: a.kw_defaults, kwarg: a.kwarg };
  }
}

function isStubBody(body) {
  const rest = docstring(body) ? body.slice(1) : body;
  if (!rest.length) return true;
  return rest.every((s) => s.type === 'Pass' || (s.type === 'Expr' && s.value.type === 'Constant' && (s.value.kind === 'Ellipsis' || s.value.kind === 'str')) ||
    (s.type === 'Raise' && s.exc && /NotImplemented(?:Error)?$/.test(dotted(s.exc.type === 'Call' ? s.exc.func : s.exc) || '')));
}

class ClassInfo {
  constructor(node, mod) {
    this.node = node;
    this.name = node.name;
    this.mod = mod;
    this.methods = new Map();
    this.attrs = new Set(); // class-level names
    this.instanceAttrs = new Set(); // self.x assignments
    this.decorators = node.decorator_list.map((d) => dotted(d.type === 'Call' ? d.func : d) || '?');
    this.metaclass = node.keywords.some((k) => k.arg === 'metaclass');
    for (const s of node.body) {
      if (FUNC_TYPES.has(s.type)) {
        if (this.methods.has(s.name)) this.methods.get(s.name).redefined = true;
        else this.methods.set(s.name, new FunctionInfo(s, mod, this));
      } else if (s.type === 'Assign') {
        for (const t of s.targets) for (const n of namesOf(t)) this.attrs.add(n);
      } else if (s.type === 'AnnAssign' && s.target.type === 'Name') this.attrs.add(s.target.id);
      else if (s.type === 'ClassDef') this.attrs.add(s.name);
      else if (s.type === 'If' || s.type === 'Try' || s.type === 'For' || s.type === 'While' || s.type === 'With') this.dynamicBody = true;
      else if (s.type === 'Import' || s.type === 'ImportFrom') this.dynamicBody = true;
    }
    for (const m of this.methods.values()) {
      walk(m.node, (n) => {
        if (n.type === 'Attribute' && n.ctx === 'Store' && n.value.type === 'Name' && (n.value.id === 'self' || n.value.id === 'cls')) this.instanceAttrs.add(n.attr);
        if (n.type === 'Call' && n.func.type === 'Name' && n.func.id === 'setattr') this.dynamicAttrs = true;
        return true;
      });
    }
    this._bases = null;
  }

  // resolved bases: [{ cls } | { builtin: name } | { unknown: true, name }]
  bases(project) {
    if (this._bases) return this._bases;
    this._bases = [];
    for (const b of this.node.bases) {
      let e = b;
      if (e.type === 'Subscript') e = e.value; // Generic[T]
      const r = project.resolveClassExpr(e, this.mod);
      this._bases.push(r);
    }
    return this._bases;
  }

  get special() {
    const d = this.decorators.join(' ');
    return this.metaclass || /dataclass|attr\.s|attrs\.define|define|frozen|total_ordering|pydantic/.test(d);
  }
}

function namesOf(t, out = []) {
  if (t.type === 'Name') out.push(t.id);
  else if (t.type === 'Tuple' || t.type === 'List') for (const e of t.elts) namesOf(e, out);
  else if (t.type === 'Starred') namesOf(t.value, out);
  return out;
}

class ModuleInfo {
  constructor(file, parsed, scopes) {
    this.path = file.path;
    this.name = moduleNameOf(file.path);
    this.parsed = parsed;
    this.module = parsed.module;
    this.scope = scopes.root;
    this.scopes = scopes;
    this.functions = new Map();
    this.classes = new Map();
    this.allClasses = [];
    this.allFunctions = [];
    this.isPackageInit = /(?:^|\/)__init__\.pyi?$/.test(file.path);
    this.isStub = /\.pyi$/.test(file.path);
    parsed.module.modInfo = this;
  }

  index() {
    const visit = (body, cls) => {
      for (const s of body) {
        if (s.type === 'ClassDef') {
          const ci = new ClassInfo(s, this);
          s.info = ci;
          this.allClasses.push(ci);
          if (!cls && !this.classes.has(s.name)) this.classes.set(s.name, ci);
          visit(s.body, ci);
          for (const m of ci.methods.values()) { m.node.info = m; this.allFunctions.push(m); visitNested(m.node.body); }
        } else if (FUNC_TYPES.has(s.type)) {
          if (cls) continue;
          const fi = new FunctionInfo(s, this, null);
          s.info = fi;
          this.allFunctions.push(fi);
          if (this.functions.has(s.name)) this.functions.get(s.name).redefined = true;
          else this.functions.set(s.name, fi);
          visitNested(s.body);
        } else if (s.type === 'If' || s.type === 'Try' || s.type === 'With' || s.type === 'For' || s.type === 'While') {
          // conditional definitions: index but mark as conditional
          const subs = [s.body || [], s.orelse || [], s.finalbody || [], ...(s.handlers || []).map((h) => h.body)];
          for (const b of subs) visitCond(b, cls);
        }
      }
    };
    const visitCond = (body, cls) => {
      for (const s of body) {
        if (s.type === 'ClassDef' || FUNC_TYPES.has(s.type)) {
          if (s.type === 'ClassDef') {
            const ci = new ClassInfo(s, this);
            ci.conditional = true;
            s.info = ci;
            this.allClasses.push(ci);
            visit(s.body, ci);
            for (const m of ci.methods.values()) { m.node.info = m; this.allFunctions.push(m); visitNested(m.node.body); }
          } else if (!cls) {
            const fi = new FunctionInfo(s, this, null);
            fi.conditional = true;
            s.info = fi;
            this.allFunctions.push(fi);
            visitNested(s.body);
          }
        } else if (s.body || s.handlers) {
          const subs = [s.body || [], s.orelse || [], s.finalbody || [], ...(s.handlers || []).map((h) => h.body), ...(s.cases || []).map((c) => c.body)];
          for (const b of subs) visitCond(b, cls);
        }
      }
    };
    const visitNested = (body) => {
      walk({ type: 'Module', body }, (n) => {
        if (n.type === 'ClassDef' && !n.info) {
          const ci = new ClassInfo(n, this);
          ci.nested = true;
          n.info = ci;
          this.allClasses.push(ci);
          for (const m of ci.methods.values()) { m.node.info = m; this.allFunctions.push(m); }
        } else if (FUNC_TYPES.has(n.type) && !n.info) {
          const fi = new FunctionInfo(n, this, null);
          fi.nested = true;
          n.info = fi;
          this.allFunctions.push(fi);
        }
        return true;
      });
    };
    visit(this.module.body, null);
  }
}

class Project {
  constructor() {
    this.modules = [];
    this.byName = new Map();
    this.bySuffix = new Map();
  }

  add(mod) {
    this.modules.push(mod);
    this.byName.set(mod.name, mod);
    const parts = mod.name.split('.');
    for (let i = 1; i < parts.length; i++) {
      const suf = parts.slice(i).join('.');
      if (!this.bySuffix.has(suf)) this.bySuffix.set(suf, []);
      this.bySuffix.get(suf).push(mod);
    }
  }

  findModule(name, fromMod, level) {
    let full = name || '';
    if (level) {
      const base = fromMod.name.split('.');
      const pkg = fromMod.isPackageInit ? base : base.slice(0, -1);
      const up = pkg.slice(0, Math.max(0, pkg.length - (level - 1)));
      full = [...up, ...(name ? [name] : [])].join('.');
    }
    if (this.byName.has(full)) return this.byName.get(full);
    const s = this.bySuffix.get(full);
    if (s && s.length === 1) return s[0];
    return null;
  }

  // Qualified name of an expression's imported origin ('hashlib.md5',
  // 'open'); null for locals / unknown.
  qname(e) {
    if (!e) return null;
    if (e.type === 'Name') {
      const sym = e.sym;
      if (sym === BUILTIN) return e.id;
      if (!sym) return null;
      const imp = sym.bindings.find((b) => b.kind === 'import');
      if (!imp || sym.bindings.some((b) => b.kind !== 'import' && b.kind !== 'del')) return null;
      const a = imp.node;
      const stmt = imp.stmt;
      if (stmt.type === 'Import') return a.asname ? a.name : a.name.split('.')[0];
      if (stmt.type === 'ImportFrom') return `${'.'.repeat(stmt.level)}${stmt.module ? stmt.module : ''}${stmt.module || stmt.level ? '.' : ''}${a.name}`.replace(/^\.+(?=\.)/, '.');
      return null;
    }
    if (e.type === 'Attribute') {
      const b = this.qname(e.value);
      return b ? `${b}.${e.attr}` : null;
    }
    return null;
  }

  // Resolves an expression naming a class (for bases / raise / except).
  resolveClassExpr(e, mod) {
    if (e.type === 'Name') {
      const sym = e.sym;
      if (sym === BUILTIN) {
        if (EXC_BUILTINS.has(e.id) || BUILTIN_TYPES[e.id]) return { builtin: e.id };
        return { unknown: true, name: e.id };
      }
      if (!sym) return { unknown: true, name: e.id };
      if (sym.bindings.length === 1) {
        const b = sym.bindings[0];
        if (b.kind === 'class' && b.node.info) return { cls: b.node.info };
        if (b.kind === 'import') {
          const target = this.importTarget(b, mod);
          if (target) return target;
        }
      }
      return { unknown: true, name: e.id };
    }
    if (e.type === 'Attribute') {
      const q = this.qname(e);
      if (q) {
        const i = q.lastIndexOf('.');
        const m = this.findModule(q.slice(0, i), mod, 0);
        if (m && m.classes.has(q.slice(i + 1))) return { cls: m.classes.get(q.slice(i + 1)) };
        if (q === 'builtins.object') return { builtin: 'object' };
      }
      return { unknown: true, name: dotted(e) || '?' };
    }
    return { unknown: true, name: '?' };
  }

  importTarget(binding, mod) {
    const stmt = binding.stmt;
    const a = binding.node;
    if (stmt.type !== 'ImportFrom') return null;
    const m = this.findModule(stmt.module, mod, stmt.level);
    if (!mod || !m || m === mod) return null;
    if (m.classes.has(a.name)) return { cls: m.classes.get(a.name) };
    if (m.functions.has(a.name)) return { fn: m.functions.get(a.name) };
    return null;
  }

  // true / false / null(unknown)
  isException(cls, seen = new Set()) {
    if (seen.has(cls)) return null;
    seen.add(cls);
    let unknown = false;
    for (const b of cls.bases(this)) {
      if (b.builtin) { if (EXC_BUILTINS.has(b.builtin)) return true; continue; }
      if (b.cls) { const r = this.isException(b.cls, seen); if (r) return true; if (r === null) unknown = true; continue; }
      if (b.unknown && /(?:Error|Exception|Exit|Warning|Interrupt)$/.test(b.name)) return true;
      unknown = true;
    }
    if (cls.metaclass) return null;
    return unknown ? null : false;
  }

  // member lookup: returns { found: true, where } / { found: false } / null (unknown)
  hasMember(cls, name, seen = new Set()) {
    if (seen.has(cls)) return null;
    seen.add(cls);
    if (cls.methods.has(name) || cls.attrs.has(name)) return true;
    if (cls.dynamicBody || cls.metaclass || cls.dynamicAttrs) return null;
    if (cls.decorators.length) return null;
    let unknown = false;
    for (const b of cls.bases(this)) {
      if (b.builtin) { const m = BUILTIN_TYPES[b.builtin]; if (!m) { if (EXC_BUILTINS.has(b.builtin)) continue; unknown = true; continue; } if (m.includes(name)) return true; continue; }
      if (b.cls) { const r = this.hasMember(b.cls, name, seen); if (r) return true; if (r === null) unknown = true; continue; }
      unknown = true;
    }
    return unknown ? null : false;
  }

  findMethod(cls, name, seen = new Set()) {
    if (seen.has(cls)) return undefined;
    seen.add(cls);
    if (cls.methods.has(name)) return cls.methods.get(name);
    if (cls.attrs.has(name) || cls.instanceAttrs.has(name)) return undefined;
    if (cls.dynamicBody || cls.metaclass) return undefined;
    for (const b of cls.bases(this)) {
      if (b.cls) { const r = this.findMethod(b.cls, name, seen); if (r !== null) return r; continue; }
      if (b.builtin && (b.builtin === 'object' || b.builtin === 'Generic')) continue;
      return undefined; // unknown or builtin base: give up
    }
    return null; // not found anywhere (all bases known)
  }

  // ── types ────────────────────────────────────────────────
  typeOf(e, depth = 0) {
    if (!e || depth > 6) return null;
    switch (e.type) {
      case 'Constant':
        switch (e.kind) {
          case 'None': return T.none;
          case 'bool': return T.inst('bool');
          case 'int': return T.inst('int');
          case 'float': return T.inst('float');
          case 'complex': return T.inst('complex');
          case 'str': return T.inst('str');
          case 'bytes': return T.inst('bytes');
          case 'Ellipsis': return T.inst('ellipsis');
          default: return null;
        }
      case 'JoinedStr': return T.inst('str');
      case 'List': case 'ListComp': return T.inst('list');
      case 'Tuple': return T.inst('tuple');
      case 'Dict': case 'DictComp': return T.inst('dict');
      case 'Set': case 'SetComp': return T.inst('set');
      case 'GeneratorExp': return T.inst('generator');
      case 'Lambda': return T.func(null, 'lambda');
      case 'Compare': {
        if (e.ops.every((o) => o === 'Is' || o === 'IsNot' || o === 'In' || o === 'NotIn')) return T.inst('bool');
        const ts = [e.left, ...e.comparators].map((x) => this.typeOf(x, depth + 1));
        return ts.every((t) => t && (t.k === 'none' || (t.k === 'inst' && !t.cls && BUILTIN_TYPES[t.name]))) ? T.inst('bool') : null;
      }
      case 'UnaryOp':
        if (e.op === 'Not') return T.inst('bool');
        { const t = this.typeOf(e.operand, depth + 1); return t && t.k === 'inst' && NUMERIC.has(t.name) ? T.inst(t.name === 'bool' ? 'int' : t.name) : null; }
      case 'BinOp': {
        const l = this.typeOf(e.left, depth + 1);
        const r = this.typeOf(e.right, depth + 1);
        if (!l || !r || l.k !== 'inst' || r.k !== 'inst') {
          if (l && l.k === 'inst' && l.name === 'str' && e.op === 'Mod') return T.inst('str');
          return null;
        }
        if (e.op === 'Mod' && l.name === 'str') return T.inst('str');
        if (NUMERIC.has(l.name) && NUMERIC.has(r.name)) {
          if (e.op === 'Div') return T.inst(l.name === 'complex' || r.name === 'complex' ? 'complex' : 'float');
          if (l.name === 'complex' || r.name === 'complex') return T.inst('complex');
          if (l.name === 'float' || r.name === 'float') return T.inst('float');
          if (['Add', 'Sub', 'Mult', 'FloorDiv', 'Mod', 'Pow', 'LShift', 'RShift', 'BitAnd', 'BitOr', 'BitXor'].includes(e.op)) return T.inst('int');
          return null;
        }
        if (e.op === 'Add' && l.name === r.name && ['str', 'bytes', 'list', 'tuple'].includes(l.name)) return T.inst(l.name);
        if (e.op === 'Mult' && ['str', 'bytes', 'list', 'tuple'].includes(l.name) && (r.name === 'int' || r.name === 'bool')) return T.inst(l.name);
        return null;
      }
      case 'Call': return this.callType(e, depth);
      case 'Name': return this.nameType(e, depth);
      case 'Attribute': {
        const q = this.qname(e);
        if (q) {
          const parts = q.split('.');
          const m = this.findModule(parts.slice(0, -1).join('.'), null, 0);
          if (m) {
            const last = parts[parts.length - 1];
            if (m.classes.has(last)) return T.cls(last, m.classes.get(last));
            if (m.functions.has(last)) return T.func(m.functions.get(last), last);
          }
        }
        return null;
      }
      default: return null;
    }
  }

  nameType(e, depth) {
    const sym = e.sym;
    if (sym === BUILTIN) {
      if (e.id === 'None') return T.none;
      if (BUILTIN_TYPES[e.id] || EXC_BUILTINS.has(e.id)) return T.cls(e.id);
      if (BUILTINS.has(e.id) && /^[a-z][a-z_]*$/.test(e.id)) return T.func(null, e.id);
      return null;
    }
    if (!sym || sym.bindings.length !== 1 || sym.nonlocalAssigned || sym.globalAssigned || sym.scope.dynamic || sym.scope.starImport) return null;
    const b = sym.bindings[0];
    switch (b.kind) {
      case 'def': return b.node.info && b.node.info.plainDecorators ? T.func(b.node.info, b.node.name) : null;
      case 'class': return b.node.info && !b.node.info.decorators.some((d) => !/^(?:dataclass|dataclasses.dataclass|total_ordering|functools.total_ordering|final|typing.final)$/.test(d)) ? T.cls(b.node.name, b.node.info) : null;
      case 'import': {
        if (b.stmt.type === 'Import') return T.module(b.node.asname ? b.node.name : b.node.name.split('.')[0]);
        const target = this.importTarget(b, rootModule(sym.scope));
        if (target && target.cls) return T.cls(target.cls.name, target.cls);
        if (target && target.fn) return T.func(target.fn, target.fn.name);
        return null;
      }
      case 'assign': {
        const st = b.stmt;
        if (st && st.type === 'Assign' && st.targets.length === 1 && st.targets[0] === b.node) return this.typeOf(st.value, depth + 1);
        if (st && st.type === 'AnnAssign' && st.target === b.node) return this.annotationType(st.annotation) || (st.value ? this.typeOf(st.value, depth + 1) : null);
        return null;
      }
      case 'param': {
        const p = b.node;
        const fa = p.parent;
        if (fa && fa.vararg === p) return T.inst('tuple');
        if (fa && fa.kwarg === p) return T.inst('dict');
        if (p.annotation) return this.annotationType(p.annotation);
        return null;
      }
      default: return null;
    }
  }

  annotationType(a) {
    if (!a) return null;
    if (isNone(a)) return T.none;
    if (a.type === 'Name') {
      if (a.sym === BUILTIN && BUILTIN_TYPES[a.id] && a.id !== 'object') return T.inst(a.id);
      const r = a.sym && a.sym !== BUILTIN && a.sym.bindings.length === 1 && a.sym.bindings[0].kind === 'class' ? a.sym.bindings[0].node.info : null;
      if (r) return T.inst(r.name, r);
      return null;
    }
    if (a.type === 'Subscript') {
      const base = dotted(a.value) || '';
      const map = { List: 'list', 'typing.List': 'list', list: 'list', Dict: 'dict', 'typing.Dict': 'dict', dict: 'dict', Set: 'set', set: 'set', Tuple: 'tuple', tuple: 'tuple', 'typing.Tuple': 'tuple', 'typing.Set': 'set' };
      if (map[base]) return T.inst(map[base]);
      return null;
    }
    return null;
  }

  callType(e, depth) {
    const f = e.func;
    if (f.type === 'Name' && f.sym === BUILTIN && BUILTIN_CALL_TYPES[f.id]) return T.inst(BUILTIN_CALL_TYPES[f.id]);
    const q = this.qname(f);
    if (q && Object.prototype.hasOwnProperty.call(STDLIB_RETURNS, q)) {
      const r = STDLIB_RETURNS[q];
      if (!r) return null;
      if (r === 'optional') return T.optional;
      return T.inst(r);
    }
    if (f.type === 'Attribute') {
      const recv = this.typeOf(f.value, depth + 1);
      if (recv && recv.k === 'inst') {
        if (recv.name === 'str' && STR_METHODS_STR.has(f.attr)) return T.inst('str');
        if (recv.name === 'str' && (f.attr === 'split' || f.attr === 'splitlines' || f.attr === 'rsplit')) return T.inst('list');
        if (recv.name === 'str' && (f.attr === 'startswith' || f.attr === 'endswith' || /^is/.test(f.attr))) return T.inst('bool');
        if (recv.name === 'str' && (f.attr === 'find' || f.attr === 'count' || f.attr === 'index')) return T.inst('int');
        if (recv.name === 'str' && f.attr === 'encode') return T.inst('bytes');
        if (recv.name === 'bytes' && f.attr === 'decode') return T.inst('str');
        if (NONE_METHODS[recv.name] && NONE_METHODS[recv.name].has(f.attr)) return T.none;
        if (recv.name === 'dict' && (f.attr === 'keys' || f.attr === 'values' || f.attr === 'items')) return T.inst('iterator');
        if (recv.name === 'dict' && f.attr === 'get' && e.args.length < 2 && !e.keywords.length) return T.optional;
        if (recv.name === 'list' && f.attr === 'copy') return T.inst('list');
        if (recv.name === 'list' && f.attr === 'index') return T.inst('int');
      }
    }
    const callee = this.typeOf(f, depth + 1);
    if (callee && callee.k === 'class') {
      if (callee.cls) return T.inst(callee.name, callee.cls);
      if (BUILTIN_TYPES[callee.name] || EXC_BUILTINS.has(callee.name)) return T.inst(callee.name);
    }
    if (callee && callee.k === 'func' && callee.fn) {
      const fn = callee.fn;
      if (fn.node.returns) {
        const t = this.annotationType(fn.node.returns);
        if (t) return t;
        return null;
      }
      if (fn.isGenerator) return T.inst('generator');
      if (fn.isAsync) return T.inst('coroutine');
      if (!fn.returnsValue && !fn.isStub && fn.plainDecorators && !fn.redefined && fn.kind === 'function') return T.none;
    }
    return null;
  }
}

function rootModule(scope) {
  let s = scope;
  while (s.parent) s = s.parent;
  return s.node && s.node.modInfo;
}

function typeName(t) {
  if (!t) return '?';
  if (t.k === 'none') return 'None';
  if (t.k === 'inst') return t.name;
  if (t.k === 'class') return `class ${t.name}`;
  if (t.k === 'func') return 'function';
  if (t.k === 'module') return 'module';
  return '?';
}

module.exports = { Project, ModuleInfo, ClassInfo, FunctionInfo, moduleNameOf, T, typeName, EXC_BUILTINS, BUILTIN_TYPES, NUMERIC, isStubBody, NONE_METHODS };
