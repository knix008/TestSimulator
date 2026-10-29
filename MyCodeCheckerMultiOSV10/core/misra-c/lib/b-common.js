'use strict';

// Shared helpers for the MISRA C rule modules of chapters 13-23 (part B):
// rule metadata builder, cached per-unit node index, side-effect and
// purity analysis, small expression utilities.

const cf = require('../../cfamily');

const T = cf.types;

// ---------------------------------------------------------------------------
// Metadata

const SEVERITY_BY_CAT = { Mandatory: 'CRITICAL', Required: 'MAJOR', Advisory: 'MINOR' };

// def: { id, cat, cat2012?, type?, sev?, debt?, decidable, cwe?, cert?, amd?, tags?,
//        name: [en, ko], why: [en, ko], fix: [en, ko], check?, project?, manual? }
function rule(def) {
  const cwe = def.cwe || '';
  const tags = ['misra-c2012', 'misra-c2023', 'misra'];
  if (cwe) tags.push(cwe.toLowerCase());
  for (const t of def.tags || []) if (!tags.includes(t)) tags.push(t);
  const standards = { misraC2012: `Rule ${def.id}`, misraC2023: `Rule ${def.id}` };
  if (cwe) standards.cwe = [cwe];
  if (def.cert) standards.certC = def.cert;
  const meta = {
    key: `misra-c:${def.id}`,
    langs: ['c'],
    type: def.type || 'CODE_SMELL',
    severity: def.sev || SEVERITY_BY_CAT[def.cat] || 'MAJOR',
    debtMin: def.debt || 10,
    tags,
    name: { en: def.name[0], ko: def.name[1] },
    why: { en: def.why[0], ko: def.why[1] },
    fix: { en: def.fix[0], ko: def.fix[1] },
    cwe,
    cert: def.cert ? `CERT ${def.cert}` : '',
    standards,
    misraCategory: def.cat,
    decidable: !!def.decidable,
  };
  if (def.cat2012 && def.cat2012 !== def.cat) meta.misraCategory2012 = def.cat2012;
  if (def.amd) meta.amendment = def.amd;
  if (def.manual) meta.manualReview = true;
  const out = { meta };
  if (def.check) out.check = def.check;
  if (def.project) out.project = def.project;
  if (!def.check && !def.project) out.check = () => {};
  return out;
}

const msg = (en, ko) => ({ en, ko });

// ---------------------------------------------------------------------------
// Node index (one walk per unit, user code only)

const INDEX = new WeakMap();

function isUserLoc(loc) {
  return !!(loc && loc.file && !loc.file.startsWith('<'));
}
function isUser(node) {
  return !!(node && isUserLoc(node.loc));
}

function index(unit) {
  let ix = INDEX.get(unit);
  if (ix) return ix;
  ix = new Map();
  cf.walk(unit.ast, (n) => {
    if (n.loc && n.loc.file && n.loc.file.startsWith('<')) return cf.walk.SKIP;
    let list = ix.get(n.type);
    if (!list) { list = []; ix.set(n.type, list); }
    list.push(n);
    return undefined;
  });
  INDEX.set(unit, ix);
  return ix;
}

// nodes(unit, 'CallExpr') or nodes(unit, ['IfStmt', 'WhileStmt'])
function nodes(unit, types) {
  const ix = index(unit);
  if (!Array.isArray(types)) return ix.get(types) || [];
  const out = [];
  for (const t of types) for (const n of ix.get(t) || []) out.push(n);
  return out;
}

function functions(unit) {
  return nodes(unit, 'FunctionDecl').filter((f) => f.body && f.body.type === 'CompoundStmt');
}

// ---------------------------------------------------------------------------
// Expression helpers

const skipParens = (e) => cf.skipParens(e);

// strip parentheses and casts
function stripCasts(e) {
  let x = e;
  for (;;) {
    if (!x) return x;
    if (x.type === 'ParenExpr') x = x.expr;
    else if (x.type === 'CastExpr' && x.arg) x = x.arg;
    else return x;
  }
}

function calleeName(call) {
  const c = call && skipParens(call.callee);
  if (!c) return null;
  if (c.type === 'Identifier') return c.name;
  return null;
}

// A call to a standard library function `names` (Set or array): matched by
// name unless the project defines a function of that name itself.
function isLibCall(call, names) {
  const n = calleeName(call);
  if (!n) return false;
  if (!(names instanceof Set ? names.has(n) : names.includes(n))) return false;
  const sym = call.calleeSymbol || (skipParens(call.callee).symbol);
  if (sym && sym.definition && sym.definition.body && isUser(sym.definition)) return false;
  return true;
}

function libCalls(unit, names) {
  return nodes(unit, 'CallExpr').filter((c) => isLibCall(c, names));
}

// Identifier uses (calls, address-of, …) of standard library names.
function libUses(unit, names) {
  const set = names instanceof Set ? names : new Set(names);
  return nodes(unit, 'Identifier').filter((id) => {
    if (!set.has(id.name)) return false;
    const s = id.symbol;
    if (s && s.kind !== 'function' && s.kind !== 'variable') return false;
    if (s && s.definition && s.definition.body && isUser(s.definition)) return false;
    if (s && !s.system && s.kind === 'variable' && s.decls.some((d) => isUser(d))) return false;
    return true;
  });
}

function text(unit, node, max = 40) {
  let s = '';
  try { s = cf.sourceText(unit, node) || ''; } catch (e) { s = ''; }
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > max) s = s.slice(0, max - 1) + '…';
  return s;
}

function constInt(e, unit) {
  if (!e) return null;
  const r = T.constValue(e, { target: unit && unit.target });
  if (!r || r.invalid || r.float) return null;
  return r.value;
}

function isVolatileType(t) {
  if (!t) return false;
  if (t.volatile) return true;
  let x = t;
  for (let i = 0; i < 20 && x && x.kind === 'typedef'; i++) { x = x.target; if (x && x.volatile) return true; }
  return false;
}

function canon(t) {
  return t ? T.canonical(t) : null;
}

function isPointerType(t) {
  const c = canon(t);
  return !!(c && c.kind === 'pointer');
}
function isArrayType(t) {
  const c = canon(t);
  return !!(c && c.kind === 'array');
}
function isFunctionType(t) {
  const c = canon(t);
  return !!(c && c.kind === 'function');
}

// Name of the typedef chain of t that is in `names`, or the unknown type name.
function typedefNameIn(t, names) {
  let x = t;
  for (let i = 0; i < 20 && x; i++) {
    if ((x.kind === 'typedef' || x.kind === 'unknown') && names.has(x.name)) return x.name;
    if (x.kind !== 'typedef') break;
    x = x.target;
  }
  return null;
}

// Base symbol of an lvalue designating (part of) an object without going
// through a pointer: x, x.f, x[i] (x an array).
function lvalueBase(e) {
  let x = skipParens(e);
  for (let i = 0; i < 50 && x; i++) {
    if (x.type === 'Identifier') return x.symbol || null;
    if (x.type === 'MemberExpr' && !x.arrow) { x = skipParens(x.object); continue; }
    if (x.type === 'IndexExpr' && isArrayType(x.object.ctype)) { x = skipParens(x.object); continue; }
    return null;
  }
  return null;
}

function isLocalSym(s) {
  return !!(s && (s.kind === 'variable' || s.kind === 'parameter') && s.storage === 'automatic');
}

// The object symbol a pointer expression points into, when it is obvious:
// &x, &x.f, &a[i], a (array decay), a + k, p (pointer variable initialised once).
function pointerBase(e, depth = 0) {
  const x = stripCasts(e);
  if (!x || depth > 8) return null;
  if (x.type === 'UnaryExpr' && x.op === '&') return lvalueBase(x.arg);
  if (x.type === 'Identifier' && x.symbol) {
    if (isArrayType(x.symbol.type) && x.symbol.kind !== 'parameter') return x.symbol;
    if (isPointerType(x.symbol.type)) {
      const d = singleDefinition(x.symbol);
      if (d) return pointerBase(d, depth + 1);
    }
    return null;
  }
  if (x.type === 'BinaryExpr' && (x.op === '+' || x.op === '-')) {
    if (isPointerType(x.left.ctype) || isArrayType(x.left.ctype)) return pointerBase(x.left, depth + 1);
    if (x.op === '+' && (isPointerType(x.right.ctype) || isArrayType(x.right.ctype))) return pointerBase(x.right, depth + 1);
  }
  if (x.type === 'MemberExpr' && !x.arrow && isArrayType(x.ctype)) return lvalueBase(x);
  return null;
}

// The single value ever stored into a local pointer variable (its initializer,
// with no assignment and no address taken), else null.
const SINGLE = new WeakMap();
function singleDefinition(sym) {
  if (SINGLE.has(sym)) return SINGLE.get(sym);
  let res = null;
  if (sym.kind === 'variable' && sym.storage === 'automatic') {
    const d = sym.decls.find((x) => x.type === 'VarDecl' && x.init && x.init.type !== 'InitList');
    if (d) {
      let ok = true;
      for (const u of sym.uses) {
        const p = cf.parentOf(u);
        if (!p) continue;
        if (p.type === 'AssignExpr' && p.left === u) ok = false;
        else if (p.type === 'UnaryExpr' && (p.op === '++' || p.op === '--' || p.op === '&')) ok = false;
        if (!ok) break;
      }
      if (ok) res = d.init;
    }
  }
  SINGLE.set(sym, res);
  return res;
}

// ---------------------------------------------------------------------------
// Side effects

// Library functions without persistent side effects (no errno, no I/O).
const PURE_LIB = new Set([
  'strlen', 'strnlen', 'strcmp', 'strncmp', 'strchr', 'strrchr', 'strstr', 'strspn', 'strcspn', 'strpbrk',
  'memcmp', 'memchr', 'abs', 'labs', 'llabs', 'div', 'ldiv', 'fabs', 'fabsf', 'isalnum', 'isalpha', 'isblank',
  'iscntrl', 'isdigit', 'isgraph', 'islower', 'isprint', 'ispunct', 'isspace', 'isupper', 'isxdigit',
  'tolower', 'toupper', 'isnan', 'isinf', 'isfinite', 'floor', 'ceil', 'trunc', 'round', 'fmin', 'fmax',
  '__builtin_offsetof', '__builtin_expect', 'wcslen', 'wcscmp',
]);

const PURITY = new WeakMap();

// Set of user FunctionDecl names (by symbol) that have no persistent side effects.
function pureFunctions(unit) {
  let res = PURITY.get(unit);
  if (res) return res;
  res = new Set();
  const fns = cf.functionsOf(unit).filter((f) => f.symbol);
  const cand = new Set(fns.map((f) => f.symbol));
  const bodies = new Map(fns.map((f) => [f.symbol, f]));
  let changed = true;
  const impureBody = (f) => {
    let bad = false;
    cf.walk(f.body, (n) => {
      if (bad) return cf.walk.STOP;
      if (n.type === 'SizeofExpr' || n.type === 'AlignofExpr') return cf.walk.SKIP;
      if (n.type === 'AssignExpr' || (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--'))) {
        const target = n.type === 'AssignExpr' ? n.left : n.arg;
        const b = lvalueBase(target);
        if (!isLocalSym(b)) bad = true;
      } else if (n.type === 'CallExpr') {
        const s = n.calleeSymbol;
        const nm = calleeName(n);
        if (s && cand.has(s)) return undefined;
        if (nm && PURE_LIB.has(nm) && !(s && bodies.has(s))) return undefined;
        bad = true;
      } else if ((n.type === 'Identifier' || n.type === 'MemberExpr' || n.type === 'IndexExpr' || (n.type === 'UnaryExpr' && n.op === '*')) && isVolatileType(n.ctype)) {
        bad = true;
      } else if (n.type === 'AsmStmt' || n.type === 'StmtExpr') bad = true;
      else if (n.type === 'VarDecl' && n.symbol && n.symbol.storage === 'static') bad = true;
      return undefined;
    });
    return bad;
  };
  while (changed) {
    changed = false;
    for (const s of [...cand]) {
      if (impureBody(bodies.get(s))) { cand.delete(s); changed = true; }
    }
  }
  res = cand;
  PURITY.set(unit, res);
  return res;
}

// Pure functions across the units of a project (a pure getter defined in
// another file): Set of keys, see funcKey.
const PROJECT_PURITY = new WeakMap();
const funcKey = (s) => (s.linkage === 'external' ? `ext:${s.qname || s.name}` : s);
function projectPureFunctions(project) {
  const units = project && project.units;
  if (!units || !units.length) return new Set();
  let res = PROJECT_PURITY.get(units);
  if (res) return res;
  const bodies = new Map();
  for (const u of units) {
    for (const f of cf.functionsOf(u)) {
      if (!f.symbol || !f.body) continue;
      const k = funcKey(f.symbol);
      if (!bodies.has(k)) bodies.set(k, f);
    }
  }
  const cand = new Set(bodies.keys());
  const impure = (f) => {
    let bad = false;
    cf.walk(f.body, (n) => {
      if (bad) return cf.walk.STOP;
      if (n.type === 'SizeofExpr' || n.type === 'AlignofExpr') return cf.walk.SKIP;
      if (n.type === 'AssignExpr' || (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--'))) {
        if (!isLocalSym(lvalueBase(n.type === 'AssignExpr' ? n.left : n.arg))) bad = true;
      } else if (n.type === 'CallExpr') {
        const s = n.calleeSymbol;
        const nm = calleeName(n);
        if (s && cand.has(funcKey(s))) return undefined;
        if (nm && PURE_LIB.has(nm) && !(s && bodies.has(funcKey(s)))) return undefined;
        bad = true;
      } else if ((n.type === 'Identifier' || n.type === 'MemberExpr' || n.type === 'IndexExpr' || (n.type === 'UnaryExpr' && n.op === '*')) && isVolatileType(n.ctype)) {
        bad = true;
      } else if (n.type === 'AsmStmt' || n.type === 'StmtExpr') bad = true;
      else if (n.type === 'VarDecl' && n.symbol && n.symbol.storage === 'static') bad = true;
      return undefined;
    });
    return bad;
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const k of [...cand]) if (impure(bodies.get(k))) { cand.delete(k); changed = true; }
  }
  res = cand;
  PROJECT_PURITY.set(units, res);
  return res;
}

// project (optional): also judge functions defined in other units of the project.
function callIsPure(call, unit, project) {
  const s = call.calleeSymbol;
  const nm = calleeName(call);
  if (s && unit && pureFunctions(unit).has(s)) return true;
  if (s && project && s.linkage === 'external' && projectPureFunctions(project).has(funcKey(s))) return true;
  if (nm && PURE_LIB.has(nm) && !(s && s.definition && s.definition.body && isUser(s.definition))) return true;
  return false;
}

// Potential (persistent) side effects of an expression, in source order.
// [{ node, kind: 'assign' | 'incdec' | 'call' | 'volatile' }]
// opts.intoSizeof: also look into sizeof / _Alignof operands.
// opts.project: calls of pure functions defined in other units are no side effect.
function sideEffects(expr, unit, opts = {}) {
  const out = [];
  if (!expr) return out;
  cf.walk(expr, (n, parent, key) => {
    if (!opts.intoSizeof && (n.type === 'SizeofExpr' || n.type === 'AlignofExpr' || n.type === 'OffsetofExpr')) {
      if (n.type === 'SizeofExpr' && n.arg && isVlaType(n.arg.ctype)) return undefined;
      return cf.walk.SKIP;
    }
    if (n.type === 'GenericSelection') {
      // only the selected association is evaluated
      const sel = n.assocs[n.selected];
      if (sel && sel.expr) for (const e of sideEffects(sel.expr, unit, opts)) out.push(e);
      return cf.walk.SKIP;
    }
    if (n.type === 'LambdaExpr') return cf.walk.SKIP;
    if (n.type === 'AssignExpr') out.push({ node: n, kind: 'assign' });
    else if (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--')) out.push({ node: n, kind: 'incdec' });
    else if (n.type === 'CallExpr') { if (!callIsPure(n, unit, opts.project)) out.push({ node: n, kind: 'call' }); }
    else if (n.type === 'StmtExpr') { out.push({ node: n, kind: 'call' }); return cf.walk.SKIP; }
    else if ((n.type === 'Identifier' || n.type === 'MemberExpr' || n.type === 'IndexExpr' || (n.type === 'UnaryExpr' && n.op === '*')) && isVolatileType(n.ctype)) {
      // innermost volatile designator only
      if (!(parent && (parent.type === 'MemberExpr' || parent.type === 'IndexExpr') && key === 'object' && isVolatileType(parent.ctype))) out.push({ node: n, kind: 'volatile' });
    }
    return undefined;
  });
  return out;
}

function isVlaType(t) {
  const c = canon(t);
  if (!c) return false;
  if (c.kind === 'array') return !!(c.vla || (c.size == null && c.sizeExpr)) || isVlaType(c.of);
  return false;
}

function describeEffect(unit, e) {
  switch (e.kind) {
    case 'assign': return msg(`assignment '${text(unit, e.node)}'`, `대입 '${text(unit, e.node)}'`);
    case 'incdec': return msg(`'${e.node.op}' in '${text(unit, e.node)}'`, `'${text(unit, e.node)}'의 '${e.node.op}'`);
    case 'call': return msg(`call '${text(unit, e.node)}'`, `호출 '${text(unit, e.node)}'`);
    default: return msg(`volatile access '${text(unit, e.node)}'`, `volatile 접근 '${text(unit, e.node)}'`);
  }
}

// Full expressions of a unit: [{ expr, owner }]
const FULL = new WeakMap();
function fullExpressions(unit) {
  let res = FULL.get(unit);
  if (res) return res;
  res = [];
  const add = (expr, owner) => {
    if (!expr || typeof expr !== 'object' || expr.type === 'Declaration') return;
    if (expr.type === 'InitList') {
      for (const it of expr.items) add(it.type === 'DesignatedInit' ? it.value : it, owner);
      return;
    }
    res.push({ expr, owner });
  };
  for (const s of nodes(unit, 'ExprStmt')) add(s.expr, s);
  for (const s of nodes(unit, ['IfStmt', 'WhileStmt', 'DoStmt', 'SwitchStmt'])) add(s.cond, s);
  for (const s of nodes(unit, 'ForStmt')) { add(s.cond, s); add(s.inc, s); }
  for (const s of nodes(unit, 'ReturnStmt')) add(s.arg, s);
  for (const d of nodes(unit, 'VarDecl')) add(d.init, d);
  FULL.set(unit, res);
  return res;
}

// Is `node` part of a context whose value is discarded (expression statement,
// for init/increment, left operand of a comma, void cast)?
function valueDiscarded(node) {
  let n = node;
  for (let i = 0; i < 50; i++) {
    const p = cf.parentOf(n);
    if (!p) return false;
    if (p.type === 'ParenExpr') { n = p; continue; }
    if (p.type === 'ExprStmt') return true;
    if (p.type === 'ForStmt' && cf.parentKey(n) === 'inc') return true;
    if (p.type === 'BinaryExpr' && p.op === ',') {
      if (p.left === n) return true;
      n = p;
      continue;
    }
    if (p.type === 'CastExpr' && T.isVoid(canon(p.ctype))) return true;
    return false;
  }
  return false;
}

// Is the value of a function designator `id` used other than for a call?
function enclosingFunction(node) {
  return cf.enclosing(node, 'FunctionDecl');
}

function lineOf(n) {
  return n && n.loc ? n.loc.line : 0;
}

function before(a, b) {
  return a.loc.start < b.loc.start;
}

// Includes of a header by name (any unit file).
function includesHeader(unit, names) {
  const set = names instanceof Set ? names : new Set([].concat(names));
  return unit.includes.filter((i) => isUserLoc(i) && set.has(i.name));
}

// An implicitly declared function (C) whose declaration may sit in a header
// the unit includes but that was not found: the call is then not known to
// be undeclared. Functions defined in the project, and units that found all
// their headers, are judged as they are.
function maybeDeclaredInMissingHeader(unit, project, sym) {
  if (!(unit.includes || []).some((i) => i.kind === 'missing')) return false;
  const g = project && project.globalSymbols && project.globalSymbols.get(sym.qname || sym.name);
  if (g && (g.definitions || []).some((d) => d.file && !String(d.file).startsWith('<'))) return false;
  return !(sym.decls || []).some((d) => d && d.type === 'FunctionDecl' && d.body);
}

// Strings: plain-char string literal or char array?
function isPlainCharType(t) {
  const c = canon(t);
  return !!(c && c.kind === 'int' && c.name === 'char');
}

module.exports = {
  cf, T, rule, msg, index, nodes, functions, isUser, isUserLoc, skipParens, stripCasts, calleeName,
  isLibCall, libCalls, libUses, text, constInt, isVolatileType, canon, isPointerType, isArrayType,
  isFunctionType, typedefNameIn, lvalueBase, isLocalSym, pointerBase, singleDefinition, PURE_LIB,
  pureFunctions, callIsPure, sideEffects, isVlaType, describeEffect, fullExpressions, valueDiscarded,
  enclosingFunction, lineOf, before, includesHeader, isPlainCharType, maybeDeclaredInMissingHeader,
};
