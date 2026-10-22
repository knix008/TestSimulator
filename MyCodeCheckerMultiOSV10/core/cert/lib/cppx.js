'use strict';

// C++ helpers for the CERT C++ ERR / OOP / CON / MSC rule files: class
// hierarchy queries, exception specifications, "can this throw" summaries and
// mutex / thread pattern helpers. Built on core/cfamily (AST.md) and lib/util.

const U = require('./util');
const { cf, T } = U;

// ------------------------------------------------------------------ records
function recordOf(t, deref) {
  let c = t ? T.nonRef(t) : null;
  if (c && deref && c.kind === 'pointer') c = T.canonical(c.to);
  if (c && deref && c.kind === 'array') c = T.canonical(c.of);
  return c && c.kind === 'record' ? c : null;
}

// Record type a member function belongs to (works for out-of-class definitions).
function classOfFn(fn) {
  const s = fn && fn.symbol;
  const r = s && s.record;
  return r && r.kind === 'record' ? r : null;
}

function scopeSyms(rec, name) {
  const s = rec && rec.scope && rec.scope.names && rec.scope.names.get(name);
  if (!s) return [];
  return s.overloads && s.overloads.length ? [s, ...s.overloads.filter((o) => o !== s)] : [s];
}

function methodSyms(rec) {
  const out = [];
  if (!rec || !rec.scope || !rec.scope.names) return out;
  for (const s of rec.scope.names.values()) {
    if (s.kind !== 'function') continue;
    out.push(s);
    for (const o of s.overloads || []) if (o !== s) out.push(o);
  }
  return out;
}

const baseRecords = (rec) => (rec && rec.bases ? rec.bases.map((b) => recordOf(b)).filter(Boolean) : []);
const sameRec = (a, b) => !!a && !!b && (a === b || (a.id != null && a.id === b.id) || (a.decl && a.decl === b.decl));

function isDerivedFrom(d, b, depth = 0) {
  if (!d || !b || depth > 30) return false;
  for (const x of baseRecords(d)) if (sameRec(x, b) || isDerivedFrom(x, b, depth + 1)) return true;
  return false;
}

const memo = (fn) => {
  const m = new WeakMap();
  return (rec) => {
    if (!rec || typeof rec !== 'object') return false;
    if (m.has(rec)) return m.get(rec);
    m.set(rec, false);
    const v = fn(rec);
    m.set(rec, v);
    return v;
  };
};

const isPolymorphic = memo((rec) => methodSyms(rec).some((s) => s.isVirtual) || baseRecords(rec).some((b) => isPolymorphic(b)));

function dtorSym(rec) {
  const bare = String(rec && rec.name || '').replace(/^.*::/, '').replace(/<.*$/, '');
  return scopeSyms(rec, '~' + bare)[0] || null;
}

const hasVirtualDtor = memo((rec) => {
  const d = dtorSym(rec);
  if (d && d.isVirtual) return true;
  return baseRecords(rec).some((b) => hasVirtualDtor(b));
});

function bareName(rec) {
  return String(rec && rec.name || '').replace(/^.*::/, '').replace(/<.*$/, '');
}

// Constructors of a record (symbols).
function ctorSyms(rec) {
  return scopeSyms(rec, bareName(rec)).filter((s) => s.kind === 'function');
}

function fnDecls(sym) {
  return (sym && sym.decls ? sym.decls : []).filter((d) => d && d.type === 'FunctionDecl');
}

function userDeclared(sym) {
  const ds = fnDecls(sym);
  if (!ds.length) return false;
  return !ds.every((d) => d.isDefault);
}

// Trivially copyable std:: names (anything else from std:: is treated as non-trivial).
const STD_TRIVIAL = new Set(['size_t', 'ptrdiff_t', 'byte', 'nullptr_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'intptr_t', 'uintptr_t', 'max_align_t']);

function fieldTypeNonTrivial(t, nameHint) {
  let c = t ? T.canonical(t) : null;
  while (c && c.kind === 'array') c = T.canonical(c.of);
  if (!c) return false;
  if (c.kind === 'record') return isNonTrivial(c);
  if (c.kind === 'reference') return false;
  if (c.kind === 'unknown') {
    const n = String(c.name || nameHint || '');
    if (/^(::)?std::/.test(n)) return !STD_TRIVIAL.has(n.replace(/^(::)?std::/, ''));
  }
  return false;
}

// Non-trivial class: user-declared ctor/dtor/copy assignment, virtual
// functions or bases, or members / bases that are themselves non-trivial
// (std:: library classes count as non-trivial).
const isNonTrivial = memo((rec) => nonTrivialReason(rec) != null);

function nonTrivialReason(rec) {
  if (!rec) return null;
  for (const s of methodSyms(rec)) {
    if (s.isVirtual) return [`virtual function '${s.name}'`, `가상 함수 '${s.name}'`];
  }
  const bare = bareName(rec);
  for (const s of ctorSyms(rec)) if (userDeclared(s)) return ['a user-declared constructor', '사용자 선언 생성자'];
  const d = dtorSym(rec);
  if (d && userDeclared(d)) return ['a user-declared destructor', '사용자 선언 소멸자'];
  for (const s of scopeSyms(rec, 'operator=')) if (userDeclared(s)) return ['a user-declared copy assignment', '사용자 선언 복사 대입'];
  for (const f of rec.fields || []) {
    const decl = f.node;
    if (decl && decl.specs && decl.specs.storage && decl.specs.storage.includes('static')) continue;
    if (fieldTypeNonTrivial(f.type, decl && U.declTypeName(decl))) return [`member '${f.name}' of non-trivial type ${U.typeName(f.type) || ''}`.trim(), `비자명 형식 ${U.typeName(f.type) || ''} 의 멤버 '${f.name}'`];
  }
  for (const b of rec.bases || []) {
    const r = recordOf(b);
    if (r ? isNonTrivial(r) : fieldTypeNonTrivial(b)) return [`base '${U.typeName(b)}'`, `기반 '${U.typeName(b)}'`];
  }
  if (rec.decl && rec.decl.bases && rec.decl.bases.some((b) => b.virtual)) return ['a virtual base', '가상 기반'];
  void bare;
  return null;
}

// ------------------------------------------------------- exception specs
const STD_EXC_PARENT = {
  exception: null, bad_alloc: 'exception', bad_array_new_length: 'bad_alloc', bad_cast: 'exception', bad_typeid: 'exception',
  bad_exception: 'exception', bad_function_call: 'exception', bad_weak_ptr: 'exception', bad_optional_access: 'exception',
  bad_variant_access: 'exception', bad_any_cast: 'bad_cast',
  logic_error: 'exception', domain_error: 'logic_error', invalid_argument: 'logic_error', length_error: 'logic_error',
  out_of_range: 'logic_error', future_error: 'logic_error',
  runtime_error: 'exception', range_error: 'runtime_error', overflow_error: 'runtime_error', underflow_error: 'runtime_error',
  system_error: 'runtime_error', regex_error: 'runtime_error', ios_base_failure: 'system_error', format_error: 'runtime_error',
};

// Names a type is catchable as: its own name and every base (std:: hierarchy included).
function catchNames(t) {
  const out = new Set();
  const addStd = (n) => {
    let b = n.replace(/^(::)?std::/, '');
    while (b && Object.prototype.hasOwnProperty.call(STD_EXC_PARENT, b)) { out.add('std::' + b); b = STD_EXC_PARENT[b]; }
    out.add(n.replace(/^::/, ''));
  };
  const visit = (ty, depth) => {
    if (!ty || depth > 30) return;
    const c = T.nonRef(ty);
    if (!c) return;
    if (c.kind === 'record') {
      out.add(c.name);
      for (const b of c.bases || []) visit(b, depth + 1);
      return;
    }
    if (c.kind === 'unknown' || c.kind === 'dependent') { if (c.name) addStd(c.name); return; }
    if (c.kind === 'pointer') { out.add(T.typeToString(T.unqualified(c))); return; }
    out.add(T.typeToString(T.unqualified(c)));
  };
  visit(t, 0);
  return out;
}

function thrownType(th) {
  if (!th || !th.arg) return null;
  const a = U.skip(th.arg);
  return a && a.ctype ? a.ctype : null;
}

function handlerType(h) {
  return h && h.param ? (h.param.ctype || h.param.declaredType) : null;
}

// Does handler list catch a thrown type? Unknown thrown types (and rethrows) are
// assumed to be caught by any handler.
function handlersCatch(handlers, thrown, { requireCatchAll } = {}) {
  if (!handlers || !handlers.length) return false;
  if (handlers.some((h) => h.catchAll)) return true;
  if (requireCatchAll) return false;
  if (!thrown) return true;
  const c = T.nonRef(thrown);
  if (!c || T.isUnknown(c) && !c.name) return true;
  const names = catchNames(thrown);
  for (const h of handlers) {
    const ht = handlerType(h);
    if (!ht) return true;
    const hc = T.nonRef(ht);
    if (!hc || (T.isUnknown(hc) && !hc.name)) return true;
    for (const n of catchNames(ht)) { if (names.has(n)) return true; break; }
    // pointer to class: compare pointees
    if (hc.kind === 'pointer' && c.kind === 'pointer') {
      const pn = catchNames(T.canonical(c.to));
      const hn = U.typeName(T.canonical(hc.to));
      if (pn.has(hn)) return true;
    }
  }
  return false;
}

const FN_TYPES = ['FunctionDecl', 'LambdaExpr'];

// Is `node` (a throw or a call) caught inside `fn`? Function-try-blocks of
// constructors/destructors rethrow, so they never count.
function caughtIn(node, fn, thrown, opts = {}) {
  let n = node;
  let p = cf.parentOf(n);
  while (p && p !== fn) {
    if (FN_TYPES.includes(p.type)) return true; // belongs to a nested function: not ours
    if (p.type === 'TryStmt' && cf.parentKey(n) === 'body') {
      const ctorTry = p.functionTry && (fn.isConstructor || fn.isDestructor);
      if (!ctorTry && handlersCatch(p.handlers, opts.isCall ? null : thrown, opts)) return true;
    }
    n = p;
    p = cf.parentOf(n);
  }
  return false;
}

function ownNodes(fn, type) {
  const root = fn.body;
  if (!root) return [];
  return cf.findAll(root, type).filter((x) => U.enclosingFn(x) === fn);
}

// Exception specification of a function (looks at every declaration).
// -> { kind: 'noexcept' | 'throw()' | 'dynamic' | 'none', types?: string[] }
function exceptionSpec(fn) {
  if (!fn) return { kind: 'none' };
  const decls = fn.symbol ? fnDecls(fn.symbol) : [];
  if (!decls.includes(fn)) decls.push(fn);
  let explicitFalse = false;
  for (const d of decls) {
    const fd = d.declarator ? cf.directFunction(d.declarator) : null;
    if (!fd) continue;
    if (fd.noexcept) {
      if (fd.noexceptExpr) {
        const e = U.skip(fd.noexceptExpr);
        const v = e && e.type === 'BoolLiteral' ? e.value : U.constInt(null, e) != null ? U.constInt(null, e) !== 0n : null;
        if (v === false) { explicitFalse = true; continue; }
        if (v == null) continue;
      }
      return { kind: 'noexcept' };
    }
    if (fd.throwSpec === '') return { kind: 'throw()' };
    if (typeof fd.throwSpec === 'string' && fd.throwSpec) {
      return { kind: 'dynamic', types: fd.throwSpec.split(',').map((x) => x.trim().replace(/\s*&$/, '').replace(/^const\s+/, '')) };
    }
  }
  if (!explicitFalse && (fn.isDestructor || /^operator delete/.test(fn.name || ''))) return { kind: 'noexcept', implicit: true };
  return { kind: 'none' };
}

const isNoexcept = (fn) => { const k = exceptionSpec(fn).kind; return k === 'noexcept' || k === 'throw()'; };

// Summary: the first escaping throw (or call to a throwing user function) of fn.
// -> null | { node, kind: 'throw' | 'call', callee?, type? }
function throwSummary(project) {
  const memoMap = new Map();
  function escaping(fn, opts = {}) {
    if (!fn || !fn.body) return [];
    const out = [];
    for (const th of ownNodes(fn, 'ThrowExpr')) {
      const t = thrownType(th);
      if (!caughtIn(th, fn, t, opts)) out.push({ node: th, kind: 'throw', type: t });
    }
    for (const c of ownNodes(fn, 'CallExpr')) {
      const d = U.calleeDef(c, project);
      if (!d || d === fn || isNoexcept(d)) continue;
      if (caughtIn(c, fn, null, { ...opts, isCall: true })) continue;
      const s = canThrow(d);
      if (s) out.push({ node: c, kind: 'call', callee: d, inner: s });
    }
    return out;
  }
  function canThrow(fn) {
    if (!fn) return null;
    if (memoMap.has(fn)) return memoMap.get(fn);
    memoMap.set(fn, null);
    const e = escaping(fn);
    const v = e.length ? e[0] : null;
    memoMap.set(fn, v);
    return v;
  }
  return { canThrow, escaping };
}

const SUMMARIES = new WeakMap();
function summaryFor(project) {
  const key = project || SUMMARIES;
  if (typeof key !== 'object') return throwSummary(project);
  let s = SUMMARIES.get(key);
  if (!s) { s = throwSummary(project); SUMMARIES.set(key, s); }
  return s;
}

function describeThrow(unit, e) {
  if (!e) return '';
  if (e.kind === 'throw') return `throw ${e.node.arg ? U.src(unit, e.node.arg) : '(rethrow)'}`.slice(0, 80);
  return `call to '${label(e.callee)}' that can throw`;
}

function describeThrowKo(unit, e) {
  if (!e) return '';
  if (e.kind === 'throw') return `throw ${e.node.arg ? U.src(unit, e.node.arg) : '(다시 던지기)'}`.slice(0, 80);
  return `예외를 던질 수 있는 '${label(e.callee)}' 호출`;
}

// --------------------------------------------------------------- functions
function label(fn) {
  if (!fn) return '<function>';
  if (fn.type === 'LambdaExpr') return '<lambda>';
  return (fn.symbol && fn.symbol.qname) || fn.qname || fn.name || '<function>';
}

// Function definition or lambda named by an expression.
function handlerFn(e, project) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'LambdaExpr') return e;
  if (e.type === 'UnaryExpr' && e.op === '&') e = U.strip(e.arg);
  if (e && e.type === 'Identifier' && e.symbol && e.symbol.kind === 'variable') {
    const d = e.symbol.definition || (e.symbol.decls || [])[0];
    const init = d && d.init ? U.strip(d.init) : null;
    if (init && init.type === 'LambdaExpr') return init;
    return null;
  }
  return U.fnFromExpr(e, project);
}

function cfgOf(fn) {
  try { return fn.type === 'LambdaExpr' ? cf.buildCFG(fn) : cf.getCFG(fn); } catch (_) { return null; }
}

// Edges by which control reaches the end of fn normally (fall off / return).
function normalExits(fn) {
  const g = cfgOf(fn);
  if (!g) return [];
  const R = g.reachable();
  return g.exit.preds.filter((e) => R.has(e.from) && (e.kind === 'normal' || e.kind === 'return'));
}

// Front-end quirk: inside its own class body the class name used in a member
// declaration resolves to the constructor, giving an 'unknown' type named
// like the class. Treat that as the class itself.
function isOwnClass(t, rec) {
  const c = t ? T.canonical(t) : null;
  if (!c) return false;
  if (c.kind === 'record') return sameRec(c, rec);
  return c.kind === 'unknown' && !!c.name && c.name === bareName(rec);
}

function isCopyParam(p, rec, { allowValue } = {}) {
  const t = p && (p.declaredType || p.ctype);
  if (!t) return false;
  const c = T.canonical(t);
  if (c.kind === 'reference' && !c.rvalue) return isOwnClass(c.to, rec);
  if (allowValue) return isOwnClass(c, rec);
  return false;
}

// Copy constructor / copy assignment: one parameter T& / const T& of its own class.
function copyKind(fn) {
  const rec = classOfFn(fn);
  if (!rec || !fn.params || fn.params.length < 1) return null;
  const extra = fn.params.slice(1).every((p) => p.default);
  if (!extra) return null;
  if (!isCopyParam(fn.params[0], rec)) return null;
  if (fn.isConstructor) return 'ctor';
  if (fn.name === 'operator=' || /::operator=$/.test(fn.qname || '')) return 'assign';
  return null;
}

// ---------------------------------------------------------------- mutexes
const MUTEX_RE = /^(::)?std::(recursive_|timed_|recursive_timed_|shared_|shared_timed_)?mutex$/;
const isMutexName = (n) => MUTEX_RE.test(String(n || '')) || /^(::)?std::mutex$/.test(String(n || ''));

function exprTypeName(e) {
  e = U.strip(e);
  if (!e) return '';
  const s = e.type === 'Identifier' ? e.symbol : e.type === 'MemberExpr' ? e.memberSymbol : null;
  if (s && s.decls && s.decls[0]) {
    const n = U.declTypeName(s.decls[0]);
    if (n) return n;
  }
  return U.typeName(e.ctype);
}

function isMutexExpr(e) {
  return isMutexName(exprTypeName(e));
}
const isRecursiveMutexExpr = (e) => /recursive/.test(exprTypeName(e));

// Identity of a mutex / condition variable expression.
function objKey(unit, e) {
  e = U.strip(e);
  if (!e) return null;
  if (e.type === 'UnaryExpr' && e.op === '*') return objKey(unit, e.arg);
  return U.key(unit, e) || U.src(unit, e).replace(/\s+/g, '');
}

// Member call on a mutex-like object: { obj, name } or null.
function memberCallOn(call) {
  const c = U.skip(call && call.callee);
  if (!c || c.type !== 'MemberExpr') return null;
  return { obj: c.object, name: c.member };
}

const GUARDS = new Set(['lock_guard', 'unique_lock', 'scoped_lock', 'shared_lock']);
function guardKind(decl) {
  const n = U.declTypeName(decl) || '';
  const m = /^(::)?std::(\w+)$/.exec(n);
  return m && GUARDS.has(m[2]) ? m[2] : null;
}

function initArgs(decl) {
  const i = decl && decl.init;
  if (!i) return [];
  if (i.type === 'ParenListInit') return i.args || [];
  if (i.type === 'InitList') return i.items || [];
  return [i];
}

const isTag = (e, name) => {
  e = U.strip(e);
  return !!e && e.type === 'Identifier' && e.name === name;
};

module.exports = {
  recordOf, classOfFn, scopeSyms, methodSyms, baseRecords, sameRec, isDerivedFrom, isPolymorphic, dtorSym,
  hasVirtualDtor, bareName, ctorSyms, fnDecls, userDeclared, isNonTrivial, nonTrivialReason, fieldTypeNonTrivial,
  catchNames, thrownType, handlerType, handlersCatch, caughtIn, ownNodes, exceptionSpec, isNoexcept, summaryFor,
  describeThrow, describeThrowKo, label, handlerFn, cfgOf, normalExits, copyKind, isCopyParam, isOwnClass, isMutexName, isMutexExpr, isRecursiveMutexExpr,
  exprTypeName, objKey, memberCallOn, guardKind, initArgs, isTag, STD_EXC_PARENT,
};
