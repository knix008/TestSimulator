'use strict';

// Helpers for the CERT C++ rule modules (cpp-*.js): class shape queries,
// std:: container / smart pointer recognition by declared type name, and a
// cheap straight-line "next use after an event" scan.
//
// The front end does not emulate the C++ standard library: std::vector & co.
// have `unknown` ctype and their members do not resolve, so everything here
// works from declared type names (NamedType.qname) and member-call names.

const U = require('./util');
const { cf, T } = U;

// ------------------------------------------------------------------- records
const recType = (t) => {
  const c = t ? T.nonRef(t) : null;
  return c && c.kind === 'record' ? c : null;
};

// Pointee record of a pointer type (or the record of an array element).
function pointeeRec(t) {
  const c = t ? T.nonRef(t) : null;
  if (!c) return null;
  if (c.kind === 'pointer') return recType(c.to);
  if (c.kind === 'array') return recType(c.of);
  return null;
}

// RecordDecl with members for a record type (the definition, not a forward declaration).
function recDef(rt) {
  if (!rt) return null;
  const d = rt.decl;
  if (d && d.members) return d;
  const s = d && d.symbol;
  for (const x of (s && s.decls) || []) if (x && x.type === 'RecordDecl' && x.members) return x;
  return null;
}

// Member entities of a class definition: { methods: FunctionDecl[], fields: FieldDecl[] (non-static), statics, access per field }
const SHAPE = new WeakMap();
function shape(rd) {
  if (!rd) return null;
  let s = SHAPE.get(rd);
  if (s) return s;
  s = { methods: [], fields: [], statics: [], fieldAccess: [], hasCtor: false, hasDtor: null, userCopy: false, virtual: false };
  let access = rd.tag === 'class' ? 'private' : 'public';
  for (let m of rd.members || []) {
    if (m.type === 'AccessSpec') { access = m.access; continue; }
    if (m.type === 'TemplateDecl') m = m.decl;
    if (!m || m.type !== 'Declaration') continue;
    const fs = (m.specs && m.specs.functionSpecs) || [];
    const storage = (m.specs && m.specs.storage) || [];
    for (const d of m.declarators || []) {
      if (d.type === 'FunctionDecl') {
        s.methods.push(d);
        if (fs.includes('virtual') || d.isOverride || d.isPure || d.isFinal) s.virtual = true;
        if (d.isConstructor || d.name === rd.name) {
          if (!d.isDefault && !d.isDeleted) {
            s.hasCtor = true;
            const p = d.params || [];
            if (p.length === 1 && p[0].ctype && T.nonRef(p[0].ctype) && recType(p[0].ctype) === rd.ctype) s.userCopy = true;
          }
        }
        if (d.isDestructor) s.hasDtor = d;
        if (d.name === 'operator=' && !d.isDefault && !d.isDeleted) s.userCopy = true;
      } else if (d.type === 'FieldDecl') {
        if (storage.includes('static') || (d.symbol && d.symbol.kind === 'variable')) s.statics.push(d);
        else { s.fields.push(d); s.fieldAccess.push(access); }
      }
    }
  }
  SHAPE.set(rd, s);
  return s;
}

function bases(rt) {
  const rd = recDef(rt);
  return rd ? (rd.bases || []) : [];
}

function isPolymorphic(rt, seen = new Set()) {
  if (!rt || seen.has(rt)) return false;
  seen.add(rt);
  const rd = recDef(rt);
  if (!rd) return false;
  if (shape(rd).virtual) return true;
  for (const b of rd.bases || []) {
    if (b.virtual) return true;
    if (isPolymorphic(recType(b.ctype), seen)) return true;
  }
  return false;
}

function derivesFrom(d, b, seen = new Set()) {
  if (!d || !b || seen.has(d)) return false;
  if (d === b) return true;
  seen.add(d);
  for (const x of bases(d)) {
    const r = recType(x.ctype);
    if (r === b || (r && b && r.name && r.name === b.name) || derivesFrom(r, b, seen)) return true;
  }
  return false;
}

// std:: class names whose objects are not trivially copyable.
const STD_NONTRIVIAL = new Set(['string', 'wstring', 'u16string', 'u32string', 'u8string', 'basic_string', 'vector', 'list', 'deque',
  'map', 'set', 'multimap', 'multiset', 'unordered_map', 'unordered_set', 'unordered_multimap', 'unordered_multiset', 'unique_ptr',
  'shared_ptr', 'weak_ptr', 'function', 'any', 'optional', 'variant', 'thread', 'mutex', 'fstream', 'ifstream', 'ofstream',
  'stringstream', 'istringstream', 'ostringstream', 'queue', 'stack', 'priority_queue', 'forward_list', 'regex', 'locale']);

function stdBare(name) {
  const n = String(name || '');
  if (!/^(::)?std::/.test(n)) return null;
  return n.replace(/^(::)?std::(__\w+::)?/, '');
}

// Is a field / type non-trivial (user ctor/dtor/copy, virtual, std:: class member)?
function isNonTrivial(rt, seen = new Set()) {
  if (!rt || seen.has(rt)) return false;
  seen.add(rt);
  const rd = recDef(rt);
  if (!rd) return false;
  const s = shape(rd);
  if (s.virtual || s.hasCtor || s.userCopy || (s.hasDtor && !s.hasDtor.isDefault)) return true;
  for (const b of rd.bases || []) if (b.virtual || isNonTrivial(recType(b.ctype), seen)) return true;
  for (const f of s.fields) if (fieldNonTrivial(f, seen)) return true;
  return false;
}

function fieldNonTrivial(f, seen) {
  const bare = stdBare(U.declTypeName(f));
  if (bare && STD_NONTRIVIAL.has(bare.replace(/<.*$/, ''))) return true;
  let t = f.ctype && T.canonical(f.ctype);
  while (t && t.kind === 'array') t = T.canonical(t.of);
  if (t && t.kind === 'unknown' && stdBare(t.name) && STD_NONTRIVIAL.has(stdBare(t.name))) return true;
  return !!(t && t.kind === 'record' && isNonTrivial(t, seen));
}

// The non-trivial part of a class, for messages: 'virtual functions', "member 'name' of type std::string" ...
function nonTrivialReason(rt) {
  const rd = recDef(rt);
  if (!rd) return null;
  const s = shape(rd);
  if (isPolymorphic(rt)) return M2('virtual functions', '가상 함수');
  for (const f of s.fields) if (fieldNonTrivial(f, new Set([rt]))) return M2(`member '${f.name}' of non-trivial type ${U.declTypeName(f) || U.tstr(f.ctype)}`, `비자명한 형식 ${U.declTypeName(f) || U.tstr(f.ctype)} 의 멤버 '${f.name}'`);
  if (s.hasCtor || s.userCopy) return M2('a user-provided constructor', '사용자 정의 생성자');
  if (s.hasDtor) return M2('a user-provided destructor', '사용자 정의 소멸자');
  return isNonTrivial(rt) ? M2('a non-trivial base class', '비자명한 기반 클래스') : null;
}
const M2 = (en, ko) => ({ en, ko });

// Approximate standard-layout test.
function isStandardLayout(rt, seen = new Set()) {
  if (!rt || seen.has(rt)) return true;
  seen.add(rt);
  const rd = recDef(rt);
  if (!rd) return true;
  if (isPolymorphic(rt)) return false;
  const s = shape(rd);
  if (new Set(s.fieldAccess).size > 1) return false;
  for (const f of s.fields) {
    const c = f.ctype && T.canonical(f.ctype);
    if (c && c.kind === 'reference') return false;
    if (fieldNonTrivial(f, new Set()) && stdBare(U.declTypeName(f))) return false;
    let e = c;
    while (e && e.kind === 'array') e = T.canonical(e.of);
    if (e && e.kind === 'record' && !isStandardLayout(e, seen)) return false;
  }
  let dataInBase = 0;
  for (const b of rd.bases || []) {
    const br = recType(b.ctype);
    if (!isStandardLayout(br, seen)) return false;
    const bd = recDef(br);
    if (bd && shape(bd).fields.length) dataInBase++;
  }
  if (dataInBase && (s.fields.length || dataInBase > 1)) return false;
  return true;
}

// Padding bytes of a record (null when unknown).
function paddingOf(rt, target) {
  try {
    const L = T.layout(rt, target);
    if (!L || !L.size) return null;
    let used = 0;
    for (const f of L.fields || []) {
      if (f.bitWidth != null) used += f.bitWidth / 8;
      else used += f.size || 0;
    }
    const pad = L.size - Math.ceil(used);
    return pad > 0 ? pad : 0;
  } catch (_) {
    return null;
  }
}

// alignas() requested on a class (`struct alignas(32) S`) or on its fields. The
// front end drops the class-level alignas, so it is read from the source text.
function requestedAlign(unit, rt) {
  const rd = recDef(rt);
  if (!rd) return 0;
  let a = 0;
  const head = U.src(unit, rd).split('{')[0];
  const m = /alignas\s*\(\s*(\d+)\s*\)/.exec(head);
  if (m) a = Math.max(a, Number(m[1]));
  for (const d of rd.members || []) {
    if (d.type !== 'Declaration' || !d.specs) continue;
    for (const al of d.specs.alignas || []) {
      const v = U.constInt(unit, al.arg);
      if (v != null) a = Math.max(a, Number(v));
    }
  }
  for (const b of rd.bases || []) a = Math.max(a, requestedAlign(unit, recType(b.ctype)));
  return a;
}

function classHasMethod(rt, names) {
  for (let r = rt, guard = 0; r && guard < 20; guard++) {
    const rd = recDef(r);
    if (!rd) return false;
    if (shape(rd).methods.some((m) => names.includes(m.name))) return true;
    const b = (rd.bases || [])[0];
    r = b ? recType(b.ctype) : null;
  }
  return false;
}

// ------------------------------------------------------------ std:: by name
// Bare std name of the declared type of a symbol / declaration ('vector', 'string', ...).
function symStd(sym) {
  if (!sym) return null;
  const d = (sym.decls || [])[0] || sym.definition;
  if (!d) return null;
  const n = U.declTypeName(d);
  return stdBare(n);
}

function declTemplateArgs(decl) {
  const spec = decl && (decl.specs || (decl.declarator && decl.declarator.specs));
  const ts = spec && spec.typeSpec;
  return ts && ts.type === 'NamedType' ? (ts.templateArgs || []) : [];
}

function symTemplateArgs(sym) {
  const d = sym && ((sym.decls || [])[0] || sym.definition);
  return declTemplateArgs(d);
}

// Std name of an expression's type: variables by declared type name, otherwise from the ctype name.
function exprStd(e) {
  e = U.skip(e);
  if (!e) return null;
  const s = U.idSym(e);
  if (s) { const b = symStd(s); if (b) return b; }
  if (e.type === 'MemberExpr' && e.memberSymbol) { const b = symStd(e.memberSymbol); if (b) return b; }
  if (e.type === 'CastExpr' && e.kind === 'functional' && e.typeName) {
    const ts = e.typeName.specs && e.typeName.specs.typeSpec;
    if (ts && ts.type === 'NamedType') return stdBare(ts.qname || ts.name);
  }
  return e.ctype ? stdBare(U.typeName(e.ctype)) : null;
}

const STRINGS = new Set(['string', 'wstring', 'u16string', 'u32string', 'u8string', 'basic_string', 'pmr::string']);
const SEQ = new Set(['vector', 'deque', 'list', 'forward_list', 'array', ...STRINGS, 'map', 'set', 'multimap', 'multiset',
  'unordered_map', 'unordered_set', 'unordered_multimap', 'unordered_multiset', 'span', 'string_view', 'valarray']);
const SMART = new Set(['unique_ptr', 'shared_ptr']);

const isString = (b) => !!b && STRINGS.has(b);
const isContainer = (b) => !!b && SEQ.has(b);

// Is `call` a member call `obj.name(...)`; returns obj or null.
function memberObj(call, names) {
  if (!call || call.type !== 'CallExpr' || !U.isMemberCall(call)) return null;
  const n = U.callName(call);
  if (names && !(names instanceof Set ? names.has(n) : names.includes(n))) return null;
  return U.skip(U.skip(call.callee).object);
}

const BEGINS = new Set(['begin', 'cbegin', 'rbegin', 'crbegin']);
const ENDS = new Set(['end', 'cend', 'rend', 'crend']);
// `c.begin()` / std::begin(c) -> { obj, kind: 'begin'|'end' }
function iterCall(e) {
  e = U.strip(e);
  if (!e || e.type !== 'CallExpr') return null;
  const n = U.callName(e);
  if (U.isMemberCall(e)) {
    if (BEGINS.has(n) || ENDS.has(n)) return { obj: memberObj(e), kind: BEGINS.has(n) ? 'begin' : 'end', name: n };
    return null;
  }
  if ((BEGINS.has(n) || ENDS.has(n)) && e.args.length === 1 && (U.calleeQualifier(e) === 'std' || !e.calleeSymbol)) {
    return { obj: U.skip(e.args[0]), kind: BEGINS.has(n) ? 'begin' : 'end', name: n };
  }
  return null;
}

// Simple name of a std:: call (std::move, std::sort ...) — qualified or unqualified, not a member call.
function stdCall(call, names) {
  if (!call || call.type !== 'CallExpr' || U.isMemberCall(call)) return null;
  const n = U.callName(call);
  if (!n || !(names instanceof Set ? names.has(n) : names.includes(n))) return null;
  const q = U.calleeQualifier(call);
  if (q && q !== 'std' && q !== '::std') return null;
  const s = call.calleeSymbol || (U.skip(call.callee) && U.skip(call.callee).symbol);
  if (s && !s.system && s.definition && s.definition.body && !q) return null;
  return n;
}

// ----------------------------------------------------- straight-line scans
const JUMPS = new Set(['ReturnStmt', 'BreakStmt', 'ContinueStmt', 'GotoStmt']);
const isThrowStmt = (s) => s && s.type === 'ExprStmt' && U.skip(s.expr) && U.skip(s.expr).type === 'ThrowExpr';

// First node after `event` (in its block and the blocks enclosing it, in
// source order) for which `classify(node)` returns 'use'; scanning stops at
// 'kill'. classify gets every node of the following statements in walk order
// and returns 'use' | 'kill' | undefined. Kills that sit at an assignment are
// applied at the end of the assignment (p = p->next reads p first).
function scanAfter(event, classify, opts = {}) {
  let stmt = U.stmtOf(event);
  if (!stmt) return null;
  const up = opts.up !== false;
  for (let depth = 0; stmt && depth < 8; depth++) {
    for (const st of U.following(stmt)) {
      const hits = [];
      cf.walk(st, (n) => {
        if (n.type === 'LambdaExpr') return cf.walk.SKIP;
        const k = classify(n);
        if (k === 'use') hits.push({ n, at: n.loc.start, kind: 'use' });
        else if (k === 'kill') {
          const p = U.parent(n);
          const at = p && p.type === 'AssignExpr' && U.pkey(n) === 'left' ? p.loc.end : n.loc.start;
          hits.push({ n, at, kind: 'kill' });
        } else if (k === 'skip') return cf.walk.SKIP;
        return undefined;
      });
      hits.sort((a, b) => a.at - b.at);
      if (hits.length) return hits[0].kind === 'use' ? hits[0].n : null;
      if (JUMPS.has(st.type) || isThrowStmt(st)) return null;
    }
    if (!up) return null;
    // climb to the enclosing statement, but never out of a loop/branch body
    // into code that does not always follow (else-branches are siblings, not followers).
    const block = U.parent(stmt);
    if (!block || block.type !== 'CompoundStmt') return null;
    const owner = U.parent(block);
    if (!owner) return null;
    if (owner.type === 'CompoundStmt') stmt = block;
    else if (owner.type === 'IfStmt' && opts.branches !== false) stmt = U.stmtOf(owner);
    else return null;
  }
  return null;
}

// Classifier for "uses / reassignments of symbol `sym`".
function symClassifier(sym, extraKill) {
  return (n) => {
    if (extraKill && extraKill(n)) return 'kill';
    if (n.type === 'Identifier' && n.symbol === sym) {
      const p = U.parent(n);
      if (p && p.type === 'AssignExpr' && p.op === '=' && U.pkey(n) === 'left') return 'kill';
      if (p && p.type === 'UnaryExpr' && p.op === '&') {
        const pp = U.parent(p);
        if (pp && pp.type === 'CallExpr') return 'kill';
      }
      return 'use';
    }
    if (n.type === 'SizeofExpr' || n.type === 'AlignofExpr' || n.type === 'DecltypeType') return 'skip';
    return undefined;
  };
}

// Is `node` inside a loop that is itself inside fn and does not contain `outer`?
function inLoopBetween(node, outer) {
  let p = U.parent(node);
  while (p && p !== outer) {
    if (['ForStmt', 'WhileStmt', 'DoStmt', 'RangeForStmt'].includes(p.type)) return p;
    if (p.type === 'FunctionDecl' || p.type === 'LambdaExpr') return null;
    p = U.parent(p);
  }
  return null;
}

// Values a local variable receives (init + plain assignments) inside its function.
function assignedValues(sym) {
  const out = [];
  if (!sym) return out;
  for (const d of sym.decls || []) {
    if (d.init) out.push({ node: d, value: initExpr(d.init) });
  }
  for (const u of sym.uses || []) {
    const p = U.parent(u);
    if (p && p.type === 'AssignExpr' && p.op === '=' && U.pkey(u) === 'left') out.push({ node: p, value: U.skip(p.right) });
  }
  return out;
}

function initExpr(init) {
  if (!init) return null;
  if (init.type === 'ParenListInit') return init.args.length === 1 ? U.skip(init.args[0]) : null;
  if (init.type === 'InitList') return init.items.length === 1 ? U.skip(init.items[0]) : null;
  return U.skip(init);
}

function initArgs(init) {
  if (!init) return [];
  if (init.type === 'ParenListInit') return init.args;
  if (init.type === 'InitList') return init.items;
  return [init];
}

// Was `sym` compared / tested anywhere in `root`?
function testedIn(root, sym) {
  if (!root || !sym) return false;
  return !!cf.findFirst(root, (n) => n.type === 'Identifier' && n.symbol === sym && (U.inCondition(n) || inAssertLike(n)));
}

function inAssertLike(n) {
  for (let p = U.parent(n), i = 0; p && i < 8; p = U.parent(p), i++) {
    if (p.type === 'CallExpr') {
      const c = U.callName(p);
      if (/assert|check|expect|require|verify|min|max|clamp/i.test(c || '')) return true;
    }
    if (p.loc && p.loc.macro && /assert|check|expect|require|verify/i.test(p.loc.macro)) return true;
    if (p.type === 'ConditionalExpr') return true;
    if (p.type === 'ExprStmt' || p.type === 'CompoundStmt') break;
  }
  return false;
}

// Locals of a function: declared inside fn (parameters included), automatic storage, not references.
function isLocalOf(sym, fn) {
  if (!sym || !fn) return false;
  if (sym.kind !== 'variable' && sym.kind !== 'parameter') return false;
  if (sym.storage && sym.storage !== 'automatic') return false;
  const d = (sym.decls || [])[0];
  if (!d) return false;
  if (U.enclosingFn(d) !== fn && !(d.type === 'ParamDecl' && (fn.params || []).includes(d))) return false;
  const t = sym.type && T.canonical(sym.type);
  if (t && t.kind === 'reference') return false;
  return true;
}

function isHeaderFile(file) {
  return cf.isHeader ? cf.isHeader(file) : /\.(h|hh|hpp|hxx|inl|ipp|tpp)$/i.test(file || '');
}

module.exports = {
  recType, pointeeRec, recDef, shape, bases, isPolymorphic, derivesFrom, isNonTrivial, nonTrivialReason, isStandardLayout,
  paddingOf, requestedAlign, classHasMethod, stdBare, symStd, symTemplateArgs, declTemplateArgs, exprStd, isString, isContainer,
  STRINGS, SEQ, SMART, memberObj, iterCall, stdCall, scanAfter, symClassifier, inLoopBetween, assignedValues, initExpr, initArgs,
  testedIn, isLocalOf, isHeaderFile, JUMPS,
};
