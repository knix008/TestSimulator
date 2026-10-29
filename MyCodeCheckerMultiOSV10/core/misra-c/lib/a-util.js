'use strict';

// Shared helpers for the MISRA C rule modules of part A (directives and
// rules 1-12): rule metadata, a per-unit node index, small type helpers,
// "assignment-like" conversion sites and an initializer walker.

const cf = require('../../cfamily');
const T = cf.types;

// ------------------------------------------------------------------ metadata

const CATS = { M: 'Mandatory', R: 'Required', A: 'Advisory' };

function txt(v) {
  if (!v) return { en: '', ko: '' };
  if (Array.isArray(v)) return { en: v[0], ko: v[1] };
  return v;
}

// rule('10.1', { cat:'R', type, sev, debt, dec, cwe:['CWE-704'], cert:'INT31-C', name:[en,ko], why, fix, manual, dir })
function meta(id, o) {
  const dir = !!o.dir;
  const key = dir ? `misra-c:dir-${id}` : `misra-c:${id}`;
  const label = dir ? `Dir ${id}` : `Rule ${id}`;
  const cwes = [].concat(o.cwe || []);
  const tags = ['misra-c2012', 'misra-c2023', 'misra'];
  for (const c of cwes) tags.push(c.toLowerCase());
  for (const t of o.tags || []) if (!tags.includes(t)) tags.push(t);
  const standards = {};
  if (o.c2012 !== false) standards.misraC2012 = label;
  if (o.c2023 !== false) standards.misraC2023 = label;
  if (cwes.length) standards.cwe = cwes;
  if (o.cert) standards.certC = o.cert;
  const m = {
    key,
    langs: ['c'],
    type: o.type || 'CODE_SMELL',
    severity: o.sev || 'MAJOR',
    debtMin: o.debt || 5,
    tags,
    name: txt(o.name),
    why: txt(o.why),
    fix: txt(o.fix),
    category: 'MISRA C',
    cwe: cwes[0] || '',
    cert: o.cert ? `CERT ${o.cert}` : '',
    standards,
    misraCategory: CATS[o.cat] || o.cat,
    decidable: !!o.dec,
  };
  if (o.manual) m.manualReview = true;
  if (o.amendment) m.misraAmendment = o.amendment;
  return m;
}

function msg(en, ko) { return { en, ko }; }

// ------------------------------------------------------------------ files / nodes

function isBuiltin(file) { return typeof file !== 'string' || file.startsWith('<'); }
function userLoc(node) { const l = node && (node.loc || node); return !!(l && l.line && !isBuiltin(l.file)); }

const IDX = new WeakMap();
// Map<type, Node[]> of every AST node spelled in a user file of the unit.
function index(unit) {
  let ix = IDX.get(unit);
  if (ix) return ix;
  ix = new Map();
  cf.walk(unit.ast, (n) => {
    if (n.loc && isBuiltin(n.loc.file)) return cf.walk.SKIP;
    let a = ix.get(n.type);
    if (!a) ix.set(n.type, (a = []));
    a.push(n);
    return undefined;
  });
  IDX.set(unit, ix);
  return ix;
}
function nodes(unit, ...types) {
  const ix = index(unit);
  if (types.length === 1) return ix.get(types[0]) || [];
  const out = [];
  for (const t of types) for (const n of ix.get(t) || []) out.push(n);
  return out;
}

// Source text of a node, whitespace collapsed and shortened.
function code(unit, node, max = 40) {
  let s = '';
  try { s = cf.sourceText(unit, node) || ''; } catch (_) { s = ''; }
  s = s.replace(/\s+/g, ' ').trim();
  if (!s && node) {
    if (node.type === 'Identifier') s = node.name;
    else if (node.type === 'IntegerLiteral' || node.type === 'FloatingLiteral') s = node.raw;
  }
  if (s.length > max) s = s.slice(0, max - 3) + '...';
  return s || '<expr>';
}

function skip(e) {
  let x = e;
  while (x && x.type === 'ParenExpr') x = x.expr;
  return x;
}

function callName(call) {
  const c = skip(call && call.callee);
  return c && c.type === 'Identifier' ? c.name : null;
}

// Callee is a library function (declared only in a built-in header, or implicitly declared).
function isLibraryCall(call) {
  const s = call.calleeSymbol || (skip(call.callee) && skip(call.callee).symbol);
  if (!s) return true;
  if (s.system || s.implicit) return true;
  return !(s.decls || []).some((d) => d.loc && !isBuiltin(d.loc.file) && d.body);
}

function enclosingFn(node) { return cf.enclosing(node, 'FunctionDecl'); }

function locKey(l) { return l ? `${l.file}:${l.line}:${l.col}` : ''; }
function symKey(s) {
  const d = s && s.decls && s.decls[0];
  return d && d.loc ? `${s.kind}|${s.name}|${locKey(d.loc)}` : `${s.kind}|${s.name}|${s.id}`;
}
function symLoc(s) {
  const d = s.definition || (s.decls && s.decls[0]);
  return d ? d.nameLoc || d.loc : null;
}
function isUserSym(s) {
  if (!s || s.system || s.predefined || s.implicit) return false;
  const d = s.decls && s.decls[0];
  return !!(d && d.loc && !isBuiltin(d.loc.file));
}

// ------------------------------------------------------------------ types

function canon(t) { return t ? T.canonical(t) : null; }
function typeStr(t) { try { return t ? T.typeToString(t) : '?'; } catch (_) { return '?'; } }
function isPtr(t) { const c = canon(t); return !!c && c.kind === 'pointer'; }
function pointee(t) { const c = canon(t); return c && c.kind === 'pointer' ? c.to : null; }
function isAggregate(t) { const c = canon(t); return !!c && (c.kind === 'array' || c.kind === 'record'); }
function isConstQ(t) {
  // qualifiers along a typedef chain count
  let x = t;
  let g = 0;
  while (x && g++ < 50) {
    if (x.const) return true;
    if (x.kind !== 'typedef') break;
    x = x.target;
  }
  return false;
}
function quals(t) {
  const q = { const: false, volatile: false, atomic: false };
  let x = t;
  let g = 0;
  while (x && g++ < 50) {
    if (x.const) q.const = true;
    if (x.volatile) q.volatile = true;
    if (x.atomic) q.atomic = true;
    if (x.kind !== 'typedef') break;
    x = x.target;
  }
  return q;
}
// the converted (decayed) type of an operand
// unit (optional): `c ? p : NULL` has the type of p (C11 6.5.15p6), not void *.
function valueType(e, unit) {
  if (!e || !e.ctype) return null;
  const x = unit ? skip(e) : null;
  if (x && x.type === 'ConditionalExpr') {
    const a = x.consequent || x.test, b = x.alternate;
    const ptr = (n) => n && n.ctype && isPtr(valueType(n, unit));
    if (ptr(a) && ptr(b)) {
      if (isNullPtrConst(unit, b) && !isNullPtrConst(unit, a)) return valueType(a, unit);
      if (isNullPtrConst(unit, a) && !isNullPtrConst(unit, b)) return valueType(b, unit);
    }
  }
  try { return T.decay(e.ctype); } catch (_) { return e.ctype; }
}

function constOf(unit, e) {
  try { return T.constValue(e, { target: unit.target }); } catch (_) { return null; }
}
function iceValue(unit, e) {
  const v = constOf(unit, e);
  return v && !v.float && !v.invalid && typeof v.value === 'bigint' ? v.value : null;
}

// An integer null pointer constant (0 of integer type) or (void *)0.
function isNullPtrConst(unit, e) {
  const x = skip(e);
  if (!x) return false;
  if (x.type === 'CastExpr' && x.arg) {
    const tt = canon(x.typeName && x.typeName.ctype);
    if (tt && tt.kind === 'pointer' && canon(tt.to).kind === 'void') return isIntZero(unit, x.arg);
    return false;
  }
  return isIntZero(unit, x);
}
function isIntZero(unit, e) {
  const t = canon(e && e.ctype);
  if (!t || !T.isInteger(t)) return false;
  return iceValue(unit, e) === 0n;
}

// ------------------------------------------------------------------ essential types

function etOpts(unit, api) {
  const o = { target: unit.target };
  const bt = api && api.options && api.options.misra && api.options.misra.booleanTypedefs;
  if (bt) o.booleanTypedefs = bt;
  return o;
}
// Does a type mention a name the front end could not resolve (a type from a
// header that was not found)? Two declarations of one entity then cannot be
// compared.
function mentionsUnknown(t, depth = 0) {
  if (!t || depth > 20) return false;
  let c;
  try { c = canon(t); } catch (_) { return true; }
  if (!c || T.isUnknown(c)) return true;
  switch (c.kind) {
    case 'pointer': case 'reference': return mentionsUnknown(c.to, depth + 1);
    case 'array': return mentionsUnknown(c.of, depth + 1);
    case 'function': return mentionsUnknown(c.ret, depth + 1) || (c.params || []).some((p) => mentionsUnknown(p, depth + 1));
    default: return false;
  }
}

// The built-in element type of a wide string literal (L"", u"", U"") and the
// typedef the C headers give it (wchar_t is int on most targets).
const WIDE = { wchar_t: ['int', 'unsigned int', 'unsigned short', 'short', 'long', 'unsigned long'], char16_t: ['unsigned short'], char32_t: ['unsigned int'] };
function charLike(A, B) { return !!WIDE[A.name] && WIDE[A.name].includes(B.name); }

// types.sameType, also for a struct, union or enum without a tag seen through
// a qualified copy of its type (`const T *` with `typedef struct { ... } T`):
// the copies are told apart by the record's id, not by its (absent) name.
function sameType(a, b, opts = {}) {
  if (T.sameType(a, b, opts)) return true;
  const A = canon(a), B = canon(b);
  if (!A || !B || A.kind !== B.kind) return false;
  if (!opts.ignoreQuals && (!!A.const !== !!B.const || !!A.volatile !== !!B.volatile)) return false;
  switch (A.kind) {
    case 'record': case 'enum': return A.id != null && A.id === B.id;
    case 'int': return charLike(A, B) || charLike(B, A);
    case 'pointer': return sameType(A.to, B.to);
    case 'array': return (A.size == null || B.size == null || A.size === B.size) && sameType(A.of, B.of);
    case 'function': {
      if (!sameType(A.ret, B.ret)) return false;
      if (!A.prototype || !B.prototype) return true;
      if ((A.params || []).length !== (B.params || []).length || A.variadic !== B.variadic) return false;
      return A.params.every((p, i) => sameType(p, B.params[i], { ignoreQuals: true }));
    }
    default: return false;
  }
}

// The type of an expression is only a guess when it comes from a call to an
// implicitly declared function in a unit that did not find all its headers:
// the function is then most likely declared, with its real type, in one of them.
function hasMissingHeaders(unit) {
  return !!unit && (unit.includes || []).some((i) => i.kind === 'missing');
}
const GUESS_OPS = new Set(['*', '/', '%', '+', '-', '<<', '>>', '&', '|', '^']);
function guessedType(unit, e) {
  if (!hasMissingHeaders(unit)) return false;
  const walk = (n, depth) => {
    const x = skip(n);
    if (!x || depth > 30) return false;
    if (x.type === 'CallExpr') {
      const s = x.calleeSymbol || (skip(x.callee) && skip(x.callee).symbol);
      return !!(s && s.implicit);
    }
    if (x.type === 'BinaryExpr' && GUESS_OPS.has(x.op)) return walk(x.left, depth + 1) || walk(x.right, depth + 1);
    if (x.type === 'ConditionalExpr') return walk(x.consequent || x.test, depth + 1) || walk(x.alternate, depth + 1);
    if (x.type === 'UnaryExpr' && (x.op === '-' || x.op === '+' || x.op === '~')) return walk(x.arg, depth + 1);
    return false;
  };
  return walk(e, 0);
}
const UNKNOWN_ET = Object.freeze({ category: 'other', type: T.T.unknown, name: '?', size: null, ice: false, value: null });
function et(unit, api, e) { return guessedType(unit, e) ? UNKNOWN_ET : cf.essentialType(e, etOpts(unit, api)); }
function etOfType(unit, api, t) { return cf.essentialTypeOfType(t, etOpts(unit, api)); }
function etName(r) {
  if (!r) return '?';
  if (r.category === 'enum') return `enum ${r.enumName || '<anonymous>'}`;
  return r.typedefName ? `${r.typedefName} (${r.name})` : r.name;
}
const CAT_KO = { boolean: '부울', character: '문자', signed: '부호 있는', unsigned: '부호 없는', enum: '열거', floating: '부동소수점', other: '기타' };
function catKo(c) { return CAT_KO[c] || c; }

// ------------------------------------------------------------------ function types / calls

function fnTypeOfCall(call) {
  let t = null;
  const s = call.calleeSymbol;
  if (s && s.type) t = canon(s.type);
  if (!t || t.kind !== 'function') {
    const c = canon(call.callee && call.callee.ctype);
    if (c && c.kind === 'pointer') t = canon(c.to);
    else t = c;
  }
  return t && t.kind === 'function' ? t : null;
}
function paramTypeAt(call, i) {
  const ft = fnTypeOfCall(call);
  if (!ft || ft.prototype === false) return null;
  return i < ft.params.length ? ft.params[i] : null;
}

// ------------------------------------------------------------------ initializers

function findField(rec, name) {
  for (const f of rec.fields || []) {
    if (f.name === name) return f;
  }
  for (const f of rec.fields || []) {
    if (f.anonymous || !f.name) {
      const c = canon(f.type);
      if (c && c.kind === 'record') {
        const g = findField(c, name);
        if (g) return g;
      }
    }
  }
  return null;
}

function resolveDesignators(type, designators) {
  let t = type;
  for (const d of designators) {
    const c = canon(t);
    if (!c) return null;
    if (d.kind === 'field') {
      if (c.kind !== 'record') return null;
      const f = findField(c, d.name);
      if (!f) return null;
      t = f.type;
    } else {
      if (c.kind !== 'array') return null;
      t = c.of;
    }
  }
  return t;
}

function isStringFor(val, sub) {
  const v = skip(val);
  const c = canon(sub);
  return !!(v && v.type === 'StringLiteral' && c && c.kind === 'array');
}

// Entries of one braced initializer for an object of `type`:
// [{ item, value, sub, pos, designated, chain, elided }]
//   pos: array index (number) or field name; chain: number of designators
//   elided: the value is a plain expression for an aggregate sub-object (brace elision)
function initEntries(type, list) {
  const out = [];
  const c = canon(type);
  if (!list || list.type !== 'InitList' || !c) return out;
  if (c.kind === 'array') {
    let i = 0;
    let lost = false;
    for (const it of list.items) {
      let value = it, sub = c.of, designated = false, chain = 0;
      if (it.type === 'DesignatedInit') {
        designated = true;
        chain = it.designators.length;
        const d0 = it.designators[0];
        if (d0 && d0.kind === 'index' && d0.indexValue != null) i = Number(d0.indexValue);
        sub = resolveDesignators(c.of, it.designators.slice(1));
        value = it.value;
      }
      if (designated) lost = chain > 1; else if (lost) { sub = null; }
      out.push({ item: it, value, sub, pos: !designated && lost ? null : i, designated, chain, elided: isElided(value, sub) });
      i++;
    }
  } else if (c.kind === 'record') {
    const fields = (c.fields || []).filter((f) => !f.unnamed);
    let fi = 0;
    let lost = false;
    for (const it of list.items) {
      let value = it, sub = null, designated = false, chain = 0, pos = null;
      if (it.type === 'DesignatedInit') {
        designated = true;
        chain = it.designators.length;
        const d0 = it.designators[0];
        if (d0 && d0.kind === 'field') {
          const k = fields.findIndex((f) => f.name === d0.name);
          if (k >= 0) fi = k;
          const f = k >= 0 ? fields[k] : findField(c, d0.name);
          sub = f ? resolveDesignators(f.type, it.designators.slice(1)) : null;
          pos = d0.name;
        }
        value = it.value;
      } else {
        const f = fields[fi];
        if (c.tag === 'union' && fi > 0) sub = null;
        else sub = f ? f.type : null;
        pos = f ? f.name : fi;
      }
      if (designated) lost = chain > 1; else if (lost) { sub = null; pos = null; }
      out.push({ item: it, value, sub, pos, designated, chain, elided: isElided(value, sub) });
      fi++;
    }
  } else if (list.items.length) {
    out.push({ item: list.items[0], value: list.items[0], sub: type, pos: 0, designated: false, chain: 0, elided: false });
  }
  return out;
}

function isElided(value, sub) {
  if (!value || !sub || value.type === 'InitList') return false;
  if (!isAggregate(sub)) return false;
  if (isStringFor(value, sub)) return false;
  const vt = value.ctype;
  if (vt && sameType(vt, sub, { ignoreQuals: true })) return false;
  return true;
}

// Is the braced list exactly `{ 0 }`?
function isZeroInit(unit, list) {
  if (!list || list.type !== 'InitList' || list.items.length !== 1) return false;
  const it = list.items[0];
  if (it.type === 'InitList' || it.type === 'DesignatedInit') return false;
  return iceValue(unit, it) === 0n;
}

// Every scalar initializer value with the type it initialises (stops at brace elision).
function walkInit(unit, type, init, cb) {
  if (!init) return;
  if (init.type !== 'InitList') { cb(init, type); return; }
  if (isZeroInit(unit, init) && isAggregate(type)) return;
  for (const e of initEntries(type, init)) {
    if (!e.sub) continue;
    if (e.elided) return;
    if (e.value.type === 'InitList') walkInit(unit, e.sub, e.value, cb);
    else cb(e.value, e.sub);
  }
}

// ------------------------------------------------------------------ conversion sites

// Assignment-like conversions of a value to a declared type:
// [{ kind: 'assign'|'init'|'arg'|'return', value, to (Type), node, call?, index? }]
const SITES = new WeakMap();
function conversionSites(unit) {
  let out = SITES.get(unit);
  if (out) return out;
  out = [];
  for (const a of nodes(unit, 'AssignExpr')) {
    if (a.op === '=') out.push({ kind: 'assign', value: a.right, to: a.left.ctype, toExpr: a.left, node: a });
  }
  for (const v of nodes(unit, 'VarDecl')) {
    if (!v.init) continue;
    if (v.init.type === 'InitList') walkInit(unit, v.ctype, v.init, (val, ty) => out.push({ kind: 'init', value: val, to: ty, node: val, decl: v }));
    else if (v.init.type !== 'ParenListInit') out.push({ kind: 'init', value: v.init, to: v.ctype, node: v, decl: v });
  }
  for (const cl of nodes(unit, 'CompoundLiteral')) {
    if (cl.init) walkInit(unit, cl.typeName && cl.typeName.ctype, cl.init, (val, ty) => out.push({ kind: 'init', value: val, to: ty, node: val }));
  }
  for (const c of nodes(unit, 'CallExpr')) {
    const ft = fnTypeOfCall(c);
    if (!ft || ft.prototype === false) continue;
    c.args.forEach((arg, i) => {
      if (i < ft.params.length && arg && arg.type !== 'InitList' && arg.type !== 'PackExpansion') out.push({ kind: 'arg', value: arg, to: ft.params[i], node: arg, call: c, index: i });
    });
  }
  for (const r of nodes(unit, 'ReturnStmt')) {
    if (!r.arg || r.arg.type === 'InitList') continue;
    const fn = enclosingFn(r);
    const ft = fn && canon(fn.ctype);
    if (ft && ft.kind === 'function' && !T.isVoid(ft.ret)) out.push({ kind: 'return', value: r.arg, to: ft.ret, node: r.arg, fn });
  }
  SITES.set(unit, out);
  return out;
}

const SITE_KO = { assign: '대입', init: '초기화', arg: '인수 전달', return: '반환', case: 'case 레이블' };
function siteKo(k) { return SITE_KO[k] || k; }
const SITE_EN = { assign: 'assignment', init: 'initialization', arg: 'argument passing', return: 'return', case: 'case label' };
function siteEn(k) { return SITE_EN[k] || k; }

// ------------------------------------------------------------------ raw sources

// [file, LexResult] of every user source file that contributed to the unit
function userSources(unit) {
  const out = [];
  for (const [file, src] of unit.sources || []) if (!isBuiltin(file)) out.push([file, src]);
  return out;
}

const LINEINFO = new WeakMap();
// { skipped(file,line), directive(file,line) -> Directive|null }
function lineInfo(unit) {
  let li = LINEINFO.get(unit);
  if (li) return li;
  const skipped = new Map();
  for (const s of unit.skipped || []) {
    let a = skipped.get(s.file);
    if (!a) skipped.set(s.file, (a = []));
    a.push(s);
  }
  const dirs = new Map();
  for (const d of unit.directives || []) {
    for (let l = d.line; l <= (d.endLine || d.line); l++) dirs.set(`${d.file}:${l}`, d);
  }
  li = {
    skipped(file, line) { return (skipped.get(file) || []).some((s) => line >= s.startLine && line <= s.endLine); },
    directive(file, line) { return dirs.get(`${file}:${line}`) || null; },
  };
  LINEINFO.set(unit, li);
  return li;
}

// true the first time a rule scans a given file within one project analysis
const ONCE = new WeakMap();
function firstScan(api, ruleId, file) {
  const p = api && api.project;
  if (!p || typeof p !== 'object') return true;
  let s = ONCE.get(p);
  if (!s) ONCE.set(p, (s = new Set()));
  const k = `${ruleId}|${file}`;
  if (s.has(k)) return false;
  s.add(k);
  return true;
}

// ------------------------------------------------------------------ options

function misraOpts(api) { return (api && api.options && api.options.misra) || {}; }

module.exports = {
  cf, T, meta, msg, isBuiltin, userLoc, index, nodes, code, skip, callName, isLibraryCall, enclosingFn,
  locKey, symKey, symLoc, isUserSym, canon, typeStr, isPtr, pointee, isAggregate, isConstQ, quals, valueType,
  constOf, iceValue, isNullPtrConst, isIntZero, etOpts, et, etOfType, etName, catKo, fnTypeOfCall, paramTypeAt,
  initEntries, isZeroInit, walkInit, resolveDesignators, isStringFor, conversionSites, siteKo, siteEn, misraOpts,
  userSources, lineInfo, firstScan, hasMissingHeaders, guessedType, sameType, mentionsUnknown,
};
