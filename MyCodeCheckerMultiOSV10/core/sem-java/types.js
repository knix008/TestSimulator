'use strict';

// Light type model: project class index (inheritance inside the project),
// method-local symbol tables and a best-effort typeOf(expr) that returns a
// simple type name ('String', 'int', 'List', 'Optional', ...) or null.

const A = require('./ast');

const PRIM = new Set(['int', 'long', 'short', 'byte', 'char', 'boolean', 'float', 'double']);
const KT_PRIM = { Int: 'int', Long: 'long', Short: 'short', Byte: 'byte', Char: 'char', Boolean: 'boolean', Float: 'float', Double: 'double' };
const BOXED = { Integer: 'int', Long: 'long', Short: 'short', Byte: 'byte', Character: 'char', Boolean: 'boolean', Float: 'float', Double: 'double' };
const INTEGRAL = new Set(['int', 'long', 'short', 'byte', 'char']);
const COLLECTIONS = new Set(['List', 'ArrayList', 'LinkedList', 'Set', 'HashSet', 'TreeSet', 'LinkedHashSet', 'Collection', 'Map', 'HashMap',
  'TreeMap', 'LinkedHashMap', 'ConcurrentHashMap', 'Queue', 'Deque', 'ArrayDeque', 'Vector', 'Stack', 'SortedSet', 'SortedMap', 'Iterable',
  'MutableList', 'MutableSet', 'MutableMap', 'CopyOnWriteArrayList', 'PriorityQueue', 'EnumSet', 'EnumMap', 'NavigableMap', 'NavigableSet']);

const STRING_METHODS = {
  length: 'int', charAt: 'char', indexOf: 'int', lastIndexOf: 'int', compareTo: 'int', compareToIgnoreCase: 'int', hashCode: 'int',
  codePointAt: 'int', equals: 'boolean', equalsIgnoreCase: 'boolean', isEmpty: 'boolean', isBlank: 'boolean', startsWith: 'boolean',
  endsWith: 'boolean', contains: 'boolean', matches: 'boolean', contentEquals: 'boolean', substring: 'String', trim: 'String', strip: 'String',
  toUpperCase: 'String', toLowerCase: 'String', replace: 'String', replaceAll: 'String', replaceFirst: 'String', concat: 'String',
  intern: 'String', repeat: 'String', formatted: 'String', stripLeading: 'String', stripTrailing: 'String', indent: 'String',
  translateEscapes: 'String', toString: 'String', split: 'String[]', toCharArray: 'char[]', getBytes: 'byte[]', lines: 'Stream',
  chars: 'IntStream', uppercase: 'String', lowercase: 'String', trimEnd: 'String', trimStart: 'String', capitalize: 'String',
  removePrefix: 'String', removeSuffix: 'String', padStart: 'String', padEnd: 'String', reversed: 'String', take: 'String', drop: 'String',
  format: 'String', toInt: 'Int', toLong: 'Long', toDouble: 'Double', toIntOrNull: 'Int?', isNotEmpty: 'boolean', isNotBlank: 'boolean',
};
const STATIC_RET = {
  'String.valueOf': 'String', 'String.format': 'String', 'String.join': 'String', 'Integer.parseInt': 'int', 'Integer.valueOf': 'Integer',
  'Long.parseLong': 'long', 'Long.valueOf': 'Long', 'Double.parseDouble': 'double', 'Double.valueOf': 'Double', 'Boolean.parseBoolean': 'boolean',
  'Boolean.valueOf': 'Boolean', 'Integer.toString': 'String', 'Long.toString': 'String', 'Objects.toString': 'String', 'Arrays.asList': 'List',
  'Arrays.toString': 'String', 'List.of': 'List', 'Set.of': 'Set', 'Map.of': 'Map', 'Optional.of': 'Optional', 'Optional.ofNullable': 'Optional',
  'Optional.empty': 'Optional', 'Collections.emptyList': 'List', 'Collections.emptyMap': 'Map', 'Collections.emptySet': 'Set',
  'Collections.unmodifiableList': 'List', 'System.currentTimeMillis': 'long', 'System.nanoTime': 'long', 'System.getProperty': 'String',
  'System.getenv': 'String', 'Math.abs': 'num', 'Math.max': 'num', 'Math.min': 'num', 'Math.round': 'long', 'Math.random': 'double',
  'Math.floor': 'double', 'Math.ceil': 'double', 'Math.sqrt': 'double', 'Math.pow': 'double', 'Stream.of': 'Stream', 'IntStream.range': 'IntStream',
  'Pattern.compile': 'Pattern', 'LocalDate.now': 'LocalDate', 'Instant.now': 'Instant', 'Paths.get': 'Path', 'Path.of': 'Path',
  'Files.lines': 'Stream', 'Files.list': 'Stream', 'Files.walk': 'Stream', 'Files.readAllLines': 'List', 'Files.readString': 'String',
  'Thread.currentThread': 'Thread', 'Executors.newFixedThreadPool': 'ExecutorService', 'Executors.newCachedThreadPool': 'ExecutorService',
  'BigDecimal.valueOf': 'BigDecimal', 'BigInteger.valueOf': 'BigInteger', 'UUID.randomUUID': 'UUID', 'Integer.compare': 'int',
};
const KT_FUN_RET = {
  listOf: 'List', mutableListOf: 'MutableList', arrayListOf: 'ArrayList', emptyList: 'List', setOf: 'Set', mutableSetOf: 'MutableSet',
  hashSetOf: 'HashSet', mapOf: 'Map', mutableMapOf: 'MutableMap', hashMapOf: 'HashMap', emptyMap: 'Map', emptySet: 'Set',
  arrayOf: 'Array', intArrayOf: 'IntArray', byteArrayOf: 'ByteArray', buildString: 'String', println: 'Unit', sequenceOf: 'Sequence',
  lazy: 'Lazy', require: 'Unit', check: 'Unit', error: 'Nothing', TODO: 'Nothing', minOf: 'num', maxOf: 'num', Regex: 'Regex',
};
const ANY_RET = { toString: 'String', hashCode: 'int', equals: 'boolean', getClass: 'Class', size: 'int', isEmpty: 'boolean',
  stream: 'Stream', iterator: 'Iterator', compareTo: 'int', contains: 'boolean', containsKey: 'boolean', length: 'int',
  name: 'String', ordinal: 'int', getName: 'String', getMessage: 'String', getSimpleName: 'String', toUpperCase: 'String',
  toLowerCase: 'String', trim: 'String', substring: 'String', isPresent: 'boolean', count: 'long', anyMatch: 'boolean',
  allMatch: 'boolean', noneMatch: 'boolean', keySet: 'Set', values: 'Collection', entrySet: 'Set', toList: 'List', uppercase: 'String', lowercase: 'String' };
const STREAM_RET = { findFirst: 'Optional', findAny: 'Optional', min: 'Optional', max: 'Optional', map: 'Stream', filter: 'Stream',
  sorted: 'Stream', distinct: 'Stream', peek: 'Stream', limit: 'Stream', skip: 'Stream', flatMap: 'Stream', boxed: 'Stream',
  mapToObj: 'Stream', count: 'long', toList: 'List', reduce: 'Optional', takeWhile: 'Stream', dropWhile: 'Stream' };
const OPTIONAL_RET = { map: 'Optional', filter: 'Optional', flatMap: 'Optional', or: 'Optional', isPresent: 'boolean', isEmpty: 'boolean', stream: 'Stream' };

function normType(name) {
  const s = A.simpleName(name || '');
  if (KT_PRIM[s]) return s;
  return s;
}

// Java-equivalent primitive name for int/Int/Integer..., or null.
function primOf(t) {
  if (!t) return null;
  if (PRIM.has(t)) return t;
  if (KT_PRIM[t]) return KT_PRIM[t];
  return null;
}
function unboxed(t) {
  return primOf(t) || BOXED[t] || null;
}
function isIntegral(t) {
  const p = primOf(t);
  return !!p && INTEGRAL.has(p);
}
function isNumeric(t) {
  const p = primOf(t);
  return !!p && p !== 'boolean' && p !== 'char' || t === 'num';
}
function isBoxed(t) {
  return !!BOXED[t];
}
function isString(t) {
  return t === 'String';
}
function isCollection(t) {
  return COLLECTIONS.has(t);
}

function typeStr(ty) {
  if (!ty) return null;
  let s = normType(ty.name);
  if (ty.dims) s += '[]'.repeat(ty.dims);
  return s;
}

// ── project index ───────────────────────────────────────────
class Project {
  constructor() {
    this.classes = new Map(); // simple name -> [ClassInfo]
    this.byDecl = new Map();
    this.consts = new Map(); // 'Class.NAME' / 'NAME' -> value (static finals)
  }

  add(unit, file) {
    const visit = (c, outer) => {
      const info = this.makeInfo(c, unit, file, outer);
      for (const m of c.members) if (m.k === 'Class') visit(m, info);
    };
    for (const t of unit.types) visit(t, null);
  }

  makeInfo(c, unit, file, outer) {
    const info = {
      decl: c, unit, file, outer, name: c.name, kind: c.kind,
      fqn: (unit.pkg ? unit.pkg + '.' : '') + (outer ? outer.fqn.slice(unit.pkg ? unit.pkg.length + 1 : 0) + '.' : '') + c.name,
      superName: c.ext ? A.typeName(c.ext) : null,
      ifaces: (c.impls || []).map((t) => A.typeName(t)),
      fields: new Map(), methods: new Map(),
    };
    for (const p of c.params || []) {
      if (c.kind === 'record' || p.prop) info.fields.set(p.name, { type: p.type, decl: p, final: c.kind === 'record' || p.prop === 'val', mods: p.mods });
    }
    for (const m of c.members) {
      if (m.k === 'Field') {
        for (const v of m.vars) info.fields.set(v.name, { type: v.type || m.type, decl: v, field: m, final: !!m.fin, mods: m.mods, init: v.init });
      } else if (m.k === 'Method') {
        if (!info.methods.has(m.name)) info.methods.set(m.name, []);
        info.methods.get(m.name).push(m);
      } else if (m.k === 'Class' && m.companion) {
        for (const cm of m.members) {
          if (cm.k === 'Field') for (const v of cm.vars) info.fields.set(v.name, { type: v.type || cm.type, decl: v, field: cm, final: !!cm.fin, mods: cm.mods, init: v.init, isStatic: true });
          if (cm.k === 'Method') { if (!info.methods.has(cm.name)) info.methods.set(cm.name, []); info.methods.get(cm.name).push(cm); }
        }
      }
    }
    for (const ec of c.enumConsts || []) info.fields.set(ec.name, { type: { k: 'Type', name: c.name, args: [], dims: 0 }, decl: ec, final: true, isStatic: true });
    if (!this.classes.has(c.name)) this.classes.set(c.name, []);
    this.classes.get(c.name).push(info);
    this.byDecl.set(c, info);
    // constants
    for (const [name, f] of info.fields) {
      const isConst = f.final && (f.isStatic || (f.mods && (f.mods.has('static') || f.mods.has('const'))) || c.kind === 'interface' || c.kind === 'object');
      if (isConst && f.init) {
        const v = A.constValue(f.init, null);
        if (v !== undefined) {
          this.consts.set(c.name + '.' + name, v);
          if (!this.consts.has(name)) this.consts.set(name, v);
          else if (this.consts.get(name) !== v) this.consts.set(name, undefined);
        }
      }
    }
    return info;
  }

  info(name) {
    const l = this.classes.get(A.simpleName(name || ''));
    return l && l.length ? l[0] : null;
  }

  infoOf(decl) {
    return this.byDecl.get(decl) || null;
  }

  // In-project superclasses and interfaces, nearest first (cycle safe).
  supers(info) {
    const out = [];
    const seen = new Set([info]);
    const queue = [info];
    while (queue.length) {
      const x = queue.shift();
      const names = [];
      if (x.superName) names.push(x.superName);
      for (const n of x.ifaces) names.push(n);
      for (const n of names) {
        const s = this.info(n);
        if (s && !seen.has(s)) { seen.add(s); out.push(s); queue.push(s); }
      }
    }
    return out;
  }

  allSuperNames(info) {
    const names = new Set();
    const queue = [info];
    const seen = new Set();
    while (queue.length) {
      const x = queue.shift();
      if (seen.has(x)) continue;
      seen.add(x);
      if (x.superName) names.add(x.superName);
      for (const n of x.ifaces) names.add(n);
      for (const n of [x.superName, ...x.ifaces]) { const s = n && this.info(n); if (s) queue.push(s); }
    }
    return names;
  }

  isSubtype(info, name) {
    if (!info) return false;
    if (info.name === name) return true;
    return this.allSuperNames(info).has(name);
  }

  findField(info, name) {
    for (let x = info, n = 0; x && n < 20; n++) {
      const f = x.fields.get(name);
      if (f) return { field: f, owner: x };
      const s = x.superName ? this.info(x.superName) : null;
      if (!s || s === x) break;
      x = s;
    }
    return null;
  }

  findMethods(info, name) {
    const out = [];
    if (!info) return out;
    const own = info.methods.get(name);
    if (own) out.push(...own);
    for (const s of this.supers(info)) {
      const m = s.methods.get(name);
      if (m) out.push(...m);
    }
    return out;
  }

  constLookup(clsInfo) {
    return (dotted) => {
      if (clsInfo) {
        const f = clsInfo.fields.get(dotted);
        if (f && f.final && f.init && (f.isStatic || (f.mods && (f.mods.has('static') || f.mods.has('const'))) || clsInfo.kind === 'interface' || clsInfo.kind === 'object')) {
          const v = A.constValue(f.init, null);
          if (v !== undefined) return v;
        }
      }
      if (this.consts.has(dotted)) return this.consts.get(dotted);
      return undefined;
    };
  }
}

// ── method scope ────────────────────────────────────────────
// Collects params, locals, foreach vars, catch params, pattern bindings and
// lambda params of a method (nested classes excluded).
function collectLocals(method) {
  const locals = new Map();
  const add = (name, type, decl, kind) => {
    if (!name || locals.has(name)) return;
    locals.set(name, { name, type: type || null, decl, kind, init: decl && decl.init });
  };
  for (const p of method.params || []) add(p.name, p.type, p, 'param');
  if (method.lambdaParams) for (const p of method.lambdaParams) add(p.name, p.type, p, 'param');
  if (!method.body) return locals;
  A.forEach(method.body, (n) => {
    switch (n.k) {
      case 'Local':
        for (const v of n.vars) add(v.name, v.type || n.type, v, 'local');
        break;
      case 'ForEach':
        for (const v of n.vars) add(v.name, v.type || n.type, v, 'foreach');
        break;
      case 'Catch': add(n.name, n.types[0], n, 'catch'); break;
      case 'InstOf': if (n.bind) add(n.bind, n.type, n, 'pattern'); break;
      case 'TypePat': add(n.name, n.type, n, 'pattern'); break;
      case 'Lambda': for (const p of n.params) add(p.name, p.type, p, 'lambda'); break;
      case 'Switch': if (n.selVar) add(n.selVar.name, n.selVar.type, n.selVar, 'local'); break;
      default: break;
    }
    return !(n.k === 'Class' || n.k === 'LocalClass');
  }, { noClass: true });
  return locals;
}

// Type environment used by typeOf.
class Env {
  constructor(proj, cls, method, lang) {
    this.proj = proj;
    this.cls = cls; // ClassInfo or null
    this.method = method;
    this.lang = lang;
    this.locals = method ? collectLocals(method) : new Map();
    this.cache = new Map();
  }

  localType(name) {
    const l = this.locals.get(name);
    if (!l) return undefined;
    if (l.type && A.typeName(l.type) !== 'var') return typeStr(l.type);
    if (l.init && l.kind === 'local') {
      if (this.cache.has(name)) return this.cache.get(name);
      this.cache.set(name, null);
      const t = this.typeOf(l.init);
      this.cache.set(name, t);
      return t;
    }
    return null;
  }

  fieldType(name, info) {
    const ci = info || this.cls;
    if (!ci) return undefined;
    const f = this.proj.findField(ci, name);
    if (!f) {
      // outer classes
      if (!info && ci.outer) return this.fieldType(name, ci.outer);
      return undefined;
    }
    if (f.field.type) return typeStr(f.field.type);
    if (f.field.init) return this.typeOf(f.field.init);
    return null;
  }

  nameType(name) {
    const lt = this.localType(name);
    if (lt !== undefined) return lt;
    const ft = this.fieldType(name);
    if (ft !== undefined) return ft;
    return null;
  }

  typeOf(e) {
    e = A.strip(e);
    if (!e) return null;
    switch (e.k) {
      case 'Lit':
        switch (e.t) {
          case 'str': return 'String';
          case 'int': return this.lang === 'kt' ? 'Int' : 'int';
          case 'long': return this.lang === 'kt' ? 'Long' : 'long';
          case 'double': return this.lang === 'kt' ? 'Double' : 'double';
          case 'float': return this.lang === 'kt' ? 'Float' : 'float';
          case 'char': return this.lang === 'kt' ? 'Char' : 'char';
          case 'bool': return this.lang === 'kt' ? 'Boolean' : 'boolean';
          case 'null': return 'null';
          default: return null;
        }
      case 'Tmpl': return 'String';
      case 'Name': return this.nameType(e.id);
      case 'This': return this.cls ? this.cls.name : null;
      case 'Sel': {
        if (e.o && e.o.k === 'This' && !e.o.q) { const t = this.fieldType(e.id); return t === undefined ? null : t; }
        if (e.id === 'length') { const ot = this.typeOf(e.o); if (ot && ot.endsWith('[]')) return 'int'; if (ot === 'String') return 'Int'; }
        if (this.lang === 'kt' && e.id === 'size') return 'Int';
        const ot = this.typeOf(e.o);
        if (ot) {
          const ci = this.proj.info(ot.replace(/\?$/, ''));
          if (ci) { const t = this.fieldType(e.id, ci); if (t !== undefined) return t; }
        }
        const d = A.dotted(e);
        if (d) {
          const head = d.split('.')[0];
          if (/^[A-Z]/.test(head)) {
            const ci = this.proj.info(head);
            if (ci) { const t = this.fieldType(e.id, ci); if (t !== undefined) return t; }
          }
        }
        return null;
      }
      case 'New': {
        const t = typeStr(e.type);
        if (e.array) return t;
        return t;
      }
      case 'ArrInit': return null;
      case 'Cast': return e.safe ? typeStr(e.type) + '?' : typeStr(e.type);
      case 'Cond': {
        const a = this.typeOf(e.a);
        const b = this.typeOf(e.b);
        return a === b ? a : (a === 'null' ? b : (b === 'null' ? a : null));
      }
      case 'Bin': {
        if (['==', '!=', '<', '>', '<=', '>=', '&&', '||', 'instanceof', '===', '!==', 'in', '!in'].includes(e.op)) return this.lang === 'kt' ? 'Boolean' : 'boolean';
        const l = this.typeOf(e.l);
        const r = this.typeOf(e.r);
        if (e.op === '+' && (l === 'String' || r === 'String')) return 'String';
        if (e.op === '?:') return l && l !== 'null' ? l.replace(/\?$/, '') : r;
        if (['+', '-', '*', '/', '%', '&', '|', '^', '<<', '>>', '>>>'].includes(e.op)) {
          const pl = unboxed(l);
          const pr = unboxed(r);
          if (!pl || !pr) return null;
          const rank = ['byte', 'short', 'char', 'int', 'long', 'float', 'double'];
          if (pl === 'boolean' || pr === 'boolean') return this.lang === 'kt' ? 'Boolean' : 'boolean';
          const k = Math.max(3, rank.indexOf(pl), rank.indexOf(pr));
          const j = rank[k];
          if (this.lang === 'kt') return j[0].toUpperCase() + j.slice(1).replace('int', 'nt');
          return j;
        }
        return null;
      }
      case 'Un':
        if (e.op === '!') return this.lang === 'kt' ? 'Boolean' : 'boolean';
        if (e.op === '!!') { const t = this.typeOf(e.e); return t ? t.replace(/\?$/, '') : null; }
        return this.typeOf(e.e);
      case 'Assign': return this.typeOf(e.t);
      case 'InstOf': return this.lang === 'kt' ? 'Boolean' : 'boolean';
      case 'Call': return this.callType(e);
      case 'Idx': {
        const t = this.typeOf(e.o);
        if (t && t.endsWith('[]')) return t.slice(0, -2);
        return null;
      }
      default: return null;
    }
  }

  callType(e) {
    if (!e.id) return null;
    if (this.lang === 'kt') { const ct = A.ctorType(e); if (ct && (!e.o || /^[a-z]/.test(A.dotted(e.o) || ''))) return ct; }
    if (!e.o) {
      if (this.lang === 'kt') {
        if (KT_FUN_RET[e.id]) return KT_FUN_RET[e.id];
        if (/^[A-Z]/.test(e.id)) return e.id; // constructor
      }
      const ms = this.cls ? this.proj.findMethods(this.cls, e.id) : [];
      const m = ms.find((x) => (x.params || []).length === e.args.length) || ms[0];
      if (m && m.ret) return typeStr(m.ret);
      return null;
    }
    const d = A.dotted(e.o);
    if (d) {
      const key = A.simpleName(d) + '.' + e.id;
      if (STATIC_RET[key] && /^[A-Z]/.test(A.simpleName(d))) return STATIC_RET[key];
    }
    if (e.o.k === 'This' && !e.o.q) {
      const ms = this.cls ? this.proj.findMethods(this.cls, e.id) : [];
      if (ms[0] && ms[0].ret) return typeStr(ms[0].ret);
    }
    const ot = this.typeOf(e.o);
    if (ot === 'String' && STRING_METHODS[e.id]) {
      const r = STRING_METHODS[e.id];
      if (this.lang === 'kt' && r === 'boolean') return 'Boolean';
      if (this.lang === 'kt' && r === 'int') return 'Int';
      return r;
    }
    if (ot === 'Stream' && STREAM_RET[e.id]) return STREAM_RET[e.id];
    if (ot === 'Optional' && OPTIONAL_RET[e.id]) return OPTIONAL_RET[e.id];
    if (ot) {
      const ci = this.proj.info(ot.replace(/\?$/, ''));
      if (ci) {
        const ms = this.proj.findMethods(ci, e.id);
        if (ms[0] && ms[0].ret) return typeStr(ms[0].ret);
      }
    }
    if (ANY_RET[e.id] && e.args.length === 0) {
      const r = ANY_RET[e.id];
      if (this.lang === 'kt' && r === 'boolean') return 'Boolean';
      if (this.lang === 'kt' && r === 'int') return 'Int';
      return r;
    }
    if (e.id === 'equals' && e.args.length === 1) return this.lang === 'kt' ? 'Boolean' : 'boolean';
    return null;
  }

  // Declared generic arguments of a local/field: ['String'] for List<String>
  declaredArgs(e) {
    e = A.strip(e);
    let ty = null;
    if (e && e.k === 'Name') {
      const l = this.locals.get(e.id);
      if (l) ty = l.type;
      else if (this.cls) { const f = this.proj.findField(this.cls, e.id); if (f) ty = f.field.type; }
    } else if (e && e.k === 'Sel' && e.o.k === 'This' && this.cls) {
      const f = this.proj.findField(this.cls, e.id);
      if (f) ty = f.field.type;
    }
    if (!ty || !ty.args) return null;
    return ty.args.map((a) => (a.wildcard ? null : normType(a.name)));
  }
}

module.exports = { Project, Env, collectLocals, primOf, unboxed, isIntegral, isNumeric, isBoxed, isString, isCollection, typeStr, normType, BOXED, PRIM };
