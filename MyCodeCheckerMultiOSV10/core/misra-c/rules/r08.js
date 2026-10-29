'use strict';

// MISRA C:2012 / 2023 chapter 8: declarations and definitions.

const U = require('../lib/a-util');
const F = require('../lib/a-flow');
const { cf, T, meta, msg } = U;

const where = (n) => (n && (n.nameLoc || n.loc)) || n;
const at = (n) => { const l = n && n.loc; return l ? `${l.file}:${l.line}` : '?'; };

// ------------------------------------------------------------------ 8.1 / 8.2

function r81(unit, api) {
  for (const n of U.nodes(unit, 'FunctionDecl', 'VarDecl', 'ParamDecl', 'FieldDecl')) {
    if (!n.implicitInt) continue;
    const what = n.type === 'FunctionDecl' ? ['return type of function', '함수의 반환 타입'] : ['type of', '타입'];
    api.report(where(n), msg(`The ${what[0]} '${n.name || '?'}' is implicitly int.`, `'${n.name || '?'}'의 ${what[1]}이 암시적으로 int입니다.`));
  }
  // K&R parameters without a declaration
  for (const fn of U.nodes(unit, 'FunctionDecl')) {
    if (!fn.oldStyle || !fn.params) continue;
    const declared = new Set();
    for (const d of fn.krDecls || []) for (const x of d.declarators || []) if (x.name) declared.add(x.name);
    for (const p of fn.params) {
      if (p.krIdentifier && p.name && !declared.has(p.name)) {
        api.report(where(p), msg(`K&R parameter '${p.name}' of '${fn.name}' has no declared type (implicitly int).`, `'${fn.name}'의 K&R 매개변수 '${p.name}'에 선언된 타입이 없습니다(암시적 int).`));
      }
    }
  }
}

function r82(unit, api) {
  for (const fd of U.nodes(unit, 'FunctionDeclarator')) {
    if (cf.enclosing(fd, ['TypeName', 'CastExpr', 'SizeofExpr'])) continue;
    const owner = cf.enclosing(fd, ['FunctionDecl', 'VarDecl', 'ParamDecl', 'FieldDecl', 'TypedefDecl']);
    const name = owner && owner.name ? owner.name : '<function type>';
    if (fd.noPrototype) {
      api.report(fd, msg(`Function type of '${name}' has no prototype: write '(void)' for no parameters.`, `'${name}'의 함수 타입에 원형이 없습니다. 매개변수가 없으면 '(void)'를 쓰세요.`));
      continue;
    }
    if (fd.krIdentifiers) {
      api.report(fd, msg(`Function '${name}' uses an old-style (K&R) parameter list.`, `함수 '${name}'가 옛 방식(K&R) 매개변수 목록을 씁니다.`));
      continue;
    }
    for (const p of fd.params || []) {
      if (p.name) continue;
      api.report(p, msg(`A parameter of '${name}' has no name ('${U.typeStr(p.declaredType || p.ctype)}').`, `'${name}'의 매개변수에 이름이 없습니다('${U.typeStr(p.declaredType || p.ctype)}').`));
    }
  }
}

// ------------------------------------------------------------------ declaration sets

// Each function/object entity with every declaration node (deduplicated by location).
function entities(project) {
  const m = new Map();
  for (const u of project.units) {
    for (const s of u.symbols) {
      if ((s.kind !== 'function' && s.kind !== 'variable') || !U.isUserSym(s)) continue;
      if (s.scope && s.scope.kind !== 'file' && s.linkage === 'none') continue;
      const k = s.linkage === 'external' ? `ext|${s.qname}` : U.symKey(s);
      let e = m.get(k);
      if (!e) m.set(k, (e = { name: s.name, kind: s.kind, linkage: s.linkage, decls: [], keys: new Set(), syms: [] }));
      e.syms.push({ unit: u, sym: s });
      for (const d of s.decls || []) {
        if (!d.loc || U.isBuiltin(d.loc.file)) continue;
        const dk = U.locKey(d.loc);
        if (e.keys.has(dk)) continue;
        e.keys.add(dk);
        e.decls.push(d);
      }
    }
  }
  const rank = (d) => (isDefinitionNode(d) ? 1 : 0);
  for (const e of m.values()) e.decls.sort((a, b) => rank(a) - rank(b) || (a.loc.file === b.loc.file ? a.loc.start - b.loc.start : a.loc.file < b.loc.file ? -1 : 1));
  return m;
}
const ENT = new WeakMap();
function entitiesOf(project) {
  let e = ENT.get(project);
  if (!e) ENT.set(project, (e = entities(project)));
  return e;
}

function declTypeString(d) {
  const t = d.ctype;
  return t ? U.typeStr(t) : '?';
}
function paramNames(d) {
  if (d.type !== 'FunctionDecl' || d.oldStyle) return null;
  return (d.params || []).map((p) => p.name || null);
}
function sameIgnoringArraySize(a, b) {
  const ca = U.canon(a), cb = U.canon(b);
  if (ca && cb && ca.kind === 'array' && cb.kind === 'array' && (ca.size == null || cb.size == null)) {
    return U.typeStr(ca.of) === U.typeStr(cb.of);
  }
  return false;
}

function r83(project, api) {
  for (const e of entitiesOf(project).values()) {
    if (e.decls.length < 2) continue;
    const first = e.decls[0];
    const ft = declTypeString(first);
    const fp = paramNames(first);
    for (const d of e.decls.slice(1)) {
      const dt = declTypeString(d);
      if (dt !== ft && !(first.ctype && d.ctype && sameIgnoringArraySize(first.ctype, d.ctype))) {
        api.report(where(d), msg(
          `Declaration of '${e.name}' has type '${dt}' but the one at ${at(first)} has '${ft}'.`,
          `'${e.name}'의 선언 타입은 '${dt}'인데 ${at(first)}의 선언은 '${ft}'입니다.`));
        continue;
      }
      const dp = paramNames(d);
      if (fp && dp && fp.length === dp.length) {
        for (let i = 0; i < fp.length; i++) {
          if (fp[i] && dp[i] && fp[i] !== dp[i]) {
            api.report(where(d), msg(
              `Parameter ${i + 1} of '${e.name}' is named '${dp[i]}' here but '${fp[i]}' at ${at(first)}.`,
              `'${e.name}'의 ${i + 1}번째 매개변수 이름이 여기서는 '${dp[i]}', ${at(first)}에서는 '${fp[i]}'입니다.`));
            break;
          }
        }
      }
    }
  }
}

function isDefinitionNode(d) {
  if (d.type === 'FunctionDecl') return !!d.body;
  if (d.type === 'VarDecl') {
    const st = (d.specs && d.specs.storage) || [];
    return !!d.init || !st.includes('extern');
  }
  return false;
}

// A unit that did not find all its headers, defining an entity that a project
// header declares: that header is most likely the one it failed to include.
function declaredInUnfoundHeader(unit, api, s) {
  if (!U.hasMissingHeaders(unit)) return false;
  const g = api.project && api.project.globalSymbols && api.project.globalSymbols.get(s.qname || s.name);
  return !!(g && (g.decls || []).some((d) => !d.isDefinition && d.file && cf.isHeader(d.file) && !U.isBuiltin(d.file)));
}

function r84(unit, api) {
  for (const s of unit.symbols) {
    if ((s.kind !== 'function' && s.kind !== 'variable') || s.linkage !== 'external' || !U.isUserSym(s)) continue;
    if (s.name === 'main') continue;
    const decls = (s.decls || []).filter((d) => d.loc);
    const def = decls.find((d) => isDefinitionNode(d));
    if (!def || !U.userLoc(def)) continue;
    if (def.type === 'VarDecl' && !(def.symbol && def.symbol.scope && def.symbol.scope.kind === 'file') && cf.enclosing(def, 'FunctionDecl')) continue;
    const prior = decls.slice(0, decls.indexOf(def)).filter((d) => d !== def);
    if (!prior.length) {
      if (declaredInUnfoundHeader(unit, api, s)) continue;
      api.report(where(def), msg(
        `'${s.name}' is defined with external linkage but no earlier declaration is visible.`,
        `'${s.name}'를 외부 링크로 정의했지만 앞서 보이는 선언이 없습니다.`));
      continue;
    }
    const incompatible = prior.find((p) => p.ctype && def.ctype && !U.mentionsUnknown(p.ctype) && !U.mentionsUnknown(def.ctype) && !U.sameType(p.ctype, def.ctype));
    if (incompatible) {
      api.report(where(def), msg(
        `Definition of '${s.name}' ('${declTypeString(def)}') is not compatible with its declaration at ${at(incompatible)} ('${declTypeString(incompatible)}').`,
        `'${s.name}'의 정의('${declTypeString(def)}')가 ${at(incompatible)}의 선언('${declTypeString(incompatible)}')과 호환되지 않습니다.`));
    }
  }
}

function r85(project, api) {
  for (const e of entitiesOf(project).values()) {
    if (e.linkage !== 'external') continue;
    const pure = e.decls.filter((d) => !isDefinitionNode(d) && !cf.enclosing(d, 'FunctionDecl'));
    if (pure.length < 2) continue;
    const first = pure[0];
    for (const d of pure.slice(1)) {
      api.report(where(d), msg(
        `'${e.name}' is declared again here; it is already declared at ${at(first)}. Declare it once, in one header.`,
        `'${e.name}'가 여기서 다시 선언됩니다. 이미 ${at(first)}에 선언되어 있습니다. 한 헤더에 한 번만 선언하세요.`));
    }
  }
}

function r86(project, api) {
  for (const g of project.globalSymbols.values()) {
    if (g.system || (g.kind !== 'function' && g.kind !== 'variable')) continue;
    const userDecls = g.decls.filter((d) => !U.isBuiltin(d.file));
    if (!userDecls.length) continue;
    if (g.symbols.every((x) => x.symbol.implicit)) continue;
    const defs = [];
    const keys = new Set();
    for (const d of g.definitions) if (!keys.has(d.key)) { keys.add(d.key); defs.push(d); }
    if (defs.length > 1) {
      if (g.symbols.some((x) => x.symbol.isInline)) continue;
      for (const d of defs.slice(1)) {
        api.report({ file: d.file, line: d.line, col: d.col }, msg(
          `'${g.name}' has more than one external definition (also at ${defs[0].file}:${defs[0].line}).`,
          `'${g.name}'의 외부 정의가 둘 이상입니다(${defs[0].file}:${defs[0].line}에도 있음).`));
      }
    } else if (!defs.length) {
      const used = g.symbols.some((x) => x.symbol.uses && x.symbol.uses.length);
      if (!used) continue;
      const d = userDecls[0];
      api.report({ file: d.file, line: d.line, col: d.col }, msg(
        `'${g.name}' is used but has no external definition in the project.`,
        `'${g.name}'를 사용하지만 프로젝트에 외부 정의가 없습니다.`));
    }
  }
}

function r87(project, api) {
  for (const g of project.globalSymbols.values()) {
    if (g.system || !g.defined || g.name === 'main' || (g.kind !== 'function' && g.kind !== 'variable')) continue;
    const def = g.definitions[0];
    if (!def || U.isBuiltin(def.file)) continue;
    const users = new Set(g.symbols.filter((s) => s.symbol.uses && s.symbol.uses.length).map((s) => s.unit));
    if ([...users].some((u) => u !== def.unit)) continue;
    const inHeader = g.decls.some((d) => cf.isHeader(d.file) && !d.isDefinition);
    if (!users.size && inHeader) continue;
    api.report({ file: def.file, line: def.line, col: def.col }, msg(
      `'${g.name}' has external linkage but is ${users.size ? 'referenced only in its own translation unit' : 'never referenced'}; make it static.`,
      `'${g.name}'는 외부 링크인데 ${users.size ? '자기 번역 단위에서만 참조됩니다' : '참조되지 않습니다'}. static으로 만드세요.`));
  }
}

function r88(unit, api) {
  for (const s of unit.symbols) {
    if ((s.kind !== 'function' && s.kind !== 'variable') || s.linkage !== 'internal' || !U.isUserSym(s)) continue;
    for (const d of s.decls || []) {
      if (!U.userLoc(d)) continue;
      const st = (d.specs && d.specs.storage) || [];
      if (st.includes('static')) continue;
      api.report(where(d), msg(
        `Declaration of '${s.name}' omits 'static' although '${s.name}' has internal linkage.`,
        `'${s.name}'는 내부 링크인데 이 선언에서 'static'이 빠졌습니다.`));
    }
  }
}

function r89(project, api) {
  for (const e of entitiesOf(project).values()) {
    if (e.kind !== 'variable') continue;
    const fns = new Set();
    let fileScopeUse = false;
    let any = false;
    let def = null;
    for (const { sym } of e.syms) {
      if (!sym.scope || sym.scope.kind !== 'file') { fileScopeUse = true; continue; }
      if (sym.definition && !def) def = sym.definition;
      for (const u of sym.uses || []) {
        any = true;
        const fn = U.enclosingFn(u);
        if (!fn) fileScopeUse = true;
        else fns.add(`${fn.loc.file}:${fn.loc.start}`);
      }
    }
    if (!any || fileScopeUse || fns.size !== 1 || !def || !U.userLoc(def)) continue;
    api.report(where(def), msg(
      `Object '${e.name}' is only used in a single function; define it at block scope there.`,
      `객체 '${e.name}'는 한 함수에서만 사용됩니다. 그 함수의 블록 범위에 정의하세요.`));
  }
}

function r810(unit, api) {
  for (const fn of U.nodes(unit, 'FunctionDecl')) {
    const fs = (fn.specs && fn.specs.functionSpecs) || [];
    if (!fs.includes('inline')) continue;
    const s = fn.symbol;
    if (!s || s.linkage !== 'external') continue;
    api.report(where(fn), msg(`Inline function '${fn.name}' is not declared static.`, `인라인 함수 '${fn.name}'가 static으로 선언되지 않았습니다.`));
  }
}

function topDeclarator(d) {
  let x = d;
  for (let g = 0; x && x.inner && x.inner.type !== 'IdentDeclarator' && g < 50; g++) x = x.inner;
  return x;
}

function r811(unit, api) {
  for (const v of U.nodes(unit, 'VarDecl')) {
    const s = v.symbol;
    if (!s || s.linkage !== 'external' || v.init) continue;
    const top = topDeclarator(v.declarator);
    if (!top || top.type !== 'ArrayDeclarator' || top.size) continue;
    api.report(where(v), msg(`External array '${v.name}' is declared without an explicit size.`, `외부 배열 '${v.name}'를 크기 없이 선언했습니다.`));
  }
}

function r812(unit, api) {
  for (const en of U.nodes(unit, 'EnumDecl')) {
    const list = en.enumerators || [];
    for (const c of list) {
      if (c.value || c.constValue == null) continue;
      const dup = list.find((o) => o !== c && o.constValue === c.constValue);
      if (!dup) continue;
      api.report(c, msg(
        `Implicit value ${c.constValue} of enumerator '${c.name}' duplicates '${dup.name}'.`,
        `열거자 '${c.name}'의 암시적 값 ${c.constValue}가 '${dup.name}'와 같습니다.`));
    }
  }
}

// ------------------------------------------------------------------ 8.13

// Does this use of pointer `p` modify or leak write access to what p points to?
function writesThrough(unit, id, depth = 0) {
  if (depth > 20) return true;
  let node = id;
  let p = cf.parentOf(node);
  while (p && p.type === 'ParenExpr') { node = p; p = cf.parentOf(p); }
  if (!p) return false;
  const key = cf.parentKey(node);
  switch (p.type) {
    case 'UnaryExpr':
      if (p.op === '*') return lvalueModified(unit, p, depth);
      if (p.op === '++' || p.op === '--') return writesThrough(unit, p, depth + 1);
      if (p.op === '&') return true;
      return false;
    case 'IndexExpr':
      if (key === 'object' || (key === 'index' && U.isPtr(U.valueType(p.index)))) return lvalueModified(unit, p, depth);
      return false;
    case 'MemberExpr':
      return p.arrow ? lvalueModified(unit, p, depth) : false;
    case 'BinaryExpr':
      if ((p.op === '+' || p.op === '-') && U.isPtr(U.valueType(p))) return writesThrough(unit, p, depth + 1);
      if (p.op === ',' && key === 'right') return writesThrough(unit, p, depth + 1);
      return false;
    case 'ConditionalExpr':
      return key === 'test' ? false : writesThrough(unit, p, depth + 1);
    case 'AssignExpr':
      if (key === 'left') return false;
      return toNonConst(p.left && p.left.ctype);
    case 'VarDecl':
      return toNonConst(p.ctype);
    case 'CallExpr': {
      if (key === 'callee') return false;
      const i = p.args.indexOf(node);
      const pt = U.paramTypeAt(p, i);
      return pt ? toNonConst(pt) : true;
    }
    case 'ReturnStmt': {
      const fn = U.enclosingFn(p);
      const ft = fn && U.canon(fn.ctype);
      return ft && ft.kind === 'function' ? toNonConst(ft.ret) : true;
    }
    case 'CastExpr':
      return toNonConst(p.typeName && p.typeName.ctype) || !U.isPtr(p.typeName && p.typeName.ctype);
    case 'InitList': case 'DesignatedInit': case 'CompoundLiteral':
      return true;
    default:
      return false;
  }
}
function toNonConst(t) {
  const c = U.canon(t);
  if (!c) return true;
  if (c.kind !== 'pointer') return c.kind !== 'int' && c.kind !== 'bool';
  return !U.isConstQ(c.to);
}
// the pointee lvalue `lv` is modified (or its address/array escapes)
function lvalueModified(unit, lv, depth) {
  let node = lv;
  let p = cf.parentOf(node);
  for (let g = 0; p && g < 50; g++) {
    if (p.type === 'ParenExpr') { node = p; p = cf.parentOf(p); continue; }
    if (p.type === 'MemberExpr' && !p.arrow && cf.parentKey(node) === 'object') { node = p; p = cf.parentOf(p); continue; }
    if (p.type === 'IndexExpr' && cf.parentKey(node) === 'object') {
      const t = U.canon(node.ctype);
      if (t && t.kind === 'array') { node = p; p = cf.parentOf(p); continue; }
    }
    break;
  }
  if (!p) return false;
  const key = cf.parentKey(node);
  if (p.type === 'AssignExpr' && key === 'left') return true;
  if (p.type === 'UnaryExpr' && (p.op === '++' || p.op === '--')) return true;
  if (p.type === 'UnaryExpr' && p.op === '&') return writesThrough(unit, p, depth + 1);
  const t = U.canon(node.ctype);
  if (t && t.kind === 'array') return writesThrough(unit, node, depth + 1);
  if (t && t.kind === 'pointer' && p.type !== 'AssignExpr') return false;
  return false;
}

function r813(unit, api) {
  const consider = (sym, decl, fnName) => {
    const t = U.canon(sym.type);
    if (!t || t.kind !== 'pointer') return;
    const pt = U.canon(t.to);
    if (!pt || pt.kind === 'function' || T.isUnknown(pt) || U.isConstQ(t.to)) return;
    if (pt.kind === 'record' && !pt.complete) return;
    for (const u of sym.uses || []) if (writesThrough(unit, u)) return;
    api.report(where(decl), msg(
      `'${sym.name}' in '${fnName}' points to '${U.typeStr(t.to)}' but is never used to modify it; point to const instead.`,
      `'${fnName}'의 '${sym.name}'는 '${U.typeStr(t.to)}'를 가리키지만 수정하는 데 쓰이지 않습니다. const를 가리키게 하세요.`));
  };
  for (const fn of cf.functionsOf(unit)) {
    if (!U.userLoc(fn)) continue;
    for (const p of fn.params || []) if (p.symbol && p.name) consider(p.symbol, p, fn.name);
    for (const s of F.trackedLocals(fn)) {
      const d = s.decls && s.decls[0];
      if (d) consider(s, d, fn.name);
    }
  }
}

function r814(unit, api) {
  for (const ds of U.nodes(unit, 'DeclSpec')) {
    if ((ds.qualifiers || []).includes('restrict')) api.report(ds, msg("The 'restrict' type qualifier is used.", "'restrict' 타입 한정자를 사용합니다."));
  }
  for (const d of U.nodes(unit, 'PointerDeclarator', 'ArrayDeclarator')) {
    if ((d.quals || []).includes('restrict')) api.report(d, msg("The 'restrict' type qualifier is used.", "'restrict' 타입 한정자를 사용합니다."));
  }
}

// ------------------------------------------------------------------ alignment (8.15 - 8.17)

function alignValue(unit, spec) {
  if (!spec || !spec.arg) return null;
  if (spec.arg.type === 'TypeName') {
    try { const a = T.alignOf(spec.arg.ctype, unit.target); return a == null ? null : BigInt(a); } catch (_) { return null; }
  }
  return U.iceValue(unit, spec.arg);
}
function alignOfDecl(unit, d) {
  const specs = d && d.specs && d.specs.alignas;
  if (!specs || !specs.length) return null;
  let best = 0n;
  for (const s of specs) { const v = alignValue(unit, s); if (v != null && v > best) best = v; }
  return best;
}

function r815(project, api) {
  for (const e of entitiesOf(project).values()) {
    if (e.kind !== 'variable' || e.decls.length < 2) continue;
    const unitOf = (d) => (e.syms.find((x) => (x.sym.decls || []).includes(d)) || e.syms[0]).unit;
    const vals = e.decls.map((d) => alignOfDecl(unitOf(d), d));
    if (vals.every((v) => v == null)) continue;
    const ref = vals.find((v) => v != null);
    const refDecl = e.decls[vals.indexOf(ref)];
    e.decls.forEach((d, i) => {
      if (vals[i] === ref) return;
      api.report(where(d), msg(
        `Declaration of '${e.name}' has ${vals[i] == null ? 'no alignment specifier' : `alignment ${vals[i]}`}, but ${at(refDecl)} specifies ${ref}.`,
        `'${e.name}'의 이 선언은 ${vals[i] == null ? '정렬 지정자가 없지만' : `정렬이 ${vals[i]}이지만`} ${at(refDecl)}은 ${ref}을 지정합니다.`));
    });
  }
}

function r816(unit, api) {
  for (const a of U.nodes(unit, 'AlignasSpec')) {
    if (!a.arg || a.arg.type === 'TypeName') continue;
    if (U.iceValue(unit, a.arg) !== 0n) continue;
    api.report(a, msg('An alignment specification of zero is used.', '정렬 지정 값 0을 사용합니다.'));
  }
}

function r817(unit, api) {
  for (const d of U.nodes(unit, 'Declaration')) {
    const specs = d.specs && d.specs.alignas;
    if (!specs || specs.length < 2) continue;
    const names = (d.declarators || []).map((x) => x.name).filter(Boolean).join(', ') || '?';
    api.report(specs[1], msg(`Declaration of '${names}' has ${specs.length} alignment specifiers.`, `'${names}'의 선언에 정렬 지정자가 ${specs.length}개 있습니다.`));
  }
}

const B = { cat: 'R', sev: 'MAJOR', debt: 5, dec: true };
module.exports = [
  { meta: meta('8.1', { ...B, cwe: ['CWE-758'], cert: 'DCL31-C', name: ['Types shall be explicitly specified', '타입은 명시해야 함'],
    why: ['Implicit int is not allowed since C99 and hides the intended type.', '암시적 int는 C99부터 허용되지 않고 의도한 타입을 숨깁니다.'],
    fix: ['Write the type explicitly.', '타입을 명시하세요.'] }), check: r81 },
  { meta: meta('8.2', { ...B, cwe: ['CWE-628'], cert: 'DCL20-C', name: ['Function types in prototype form with named parameters', '이름 있는 매개변수의 원형 형식 함수 타입'],
    why: ['Without a prototype the compiler cannot check arguments; parameter names document the interface.', '원형이 없으면 컴파일러가 인수를 검사할 수 없고, 매개변수 이름은 인터페이스를 설명합니다.'],
    fix: ['Use a full prototype with names, and (void) for no parameters.', '이름을 포함한 완전한 원형을 쓰고, 매개변수가 없으면 (void)를 쓰세요.'] }), check: r82 },
  { meta: meta('8.3', { ...B, cwe: ['CWE-628'], cert: 'DCL40-C', name: ['Declarations shall use the same names and qualifiers', '선언은 같은 이름과 한정자를 사용해야 함'],
    why: ['Differences between declarations, even only in typedef or parameter names, confuse readers and can hide incompatible types.', '선언 간의 차이는 typedef나 매개변수 이름뿐이라도 혼란을 주고 호환되지 않는 타입을 숨길 수 있습니다.'],
    fix: ['Make every declaration of the entity identical.', '같은 대상의 모든 선언을 똑같이 만드세요.'] }), project: r83 },
  { meta: meta('8.4', { ...B, cwe: ['CWE-628'], cert: 'DCL40-C', name: ['Compatible declaration visible at external definition', '외부 정의 시 호환 선언이 보여야 함'],
    why: ['A declaration in a shared header lets the compiler check that users and the definition agree.', '공유 헤더의 선언이 있어야 컴파일러가 사용처와 정의가 일치하는지 검사할 수 있습니다.'],
    fix: ['Include the header that declares the function or object, or make it static.', '함수나 객체를 선언하는 헤더를 포함하거나 static으로 만드세요.'] }), check: r84 },
  { meta: meta('8.5', { ...B, name: ['External object or function declared once in one file', '외부 객체·함수는 한 파일에 한 번만 선언'],
    why: ['Several declarations can drift apart and become inconsistent.', '선언이 여러 개면 서로 어긋나 일관성이 깨질 수 있습니다.'],
    fix: ['Keep a single declaration in one header and include it.', '한 헤더에 선언을 하나만 두고 포함해 쓰세요.'] }), project: r85 },
  { meta: meta('8.6', { ...B, type: 'BUG', cwe: ['CWE-758'], name: ['Exactly one external definition', '외부 정의는 정확히 하나'],
    why: ['A missing or duplicated definition of an external identifier is undefined behaviour and a link error at best.', '외부 식별자의 정의가 없거나 중복되면 미정의 동작이며 좋아야 링크 오류입니다.'],
    fix: ['Provide exactly one definition in one source file.', '한 소스 파일에 정의를 정확히 하나 두세요.'] }), project: r86 },
  { meta: meta('8.7', { ...B, cat: 'A', sev: 'MINOR', name: ['External linkage only when needed', '필요할 때만 외부 링크 사용'],
    why: ['Limiting visibility reduces coupling and the chance of name clashes.', '가시 범위를 줄이면 결합도와 이름 충돌 가능성이 줄어듭니다.'],
    fix: ['Declare the function or object static.', '함수나 객체를 static으로 선언하세요.'] }), project: r87 },
  { meta: meta('8.8', { ...B, name: ['static on every internal-linkage declaration', '내부 링크 선언마다 static 사용'],
    why: ['Leaving out static on a redeclaration hides that the entity has internal linkage.', '재선언에서 static을 빼면 내부 링크라는 사실이 가려집니다.'],
    fix: ['Repeat the static storage class on all declarations.', '모든 선언에 static을 붙이세요.'] }), check: r88 },
  { meta: meta('8.9', { ...B, cat: 'A', sev: 'MINOR', name: ['Object used by one function should be defined in it', '한 함수만 쓰는 객체는 그 안에 정의'],
    why: ['Defining an object at block scope limits its visibility to where it is needed.', '블록 범위에 정의하면 필요한 곳으로 가시 범위가 제한됩니다.'],
    fix: ['Move the definition into the function (static if it must keep its value).', '정의를 함수 안으로 옮기세요(값을 유지해야 하면 static).'] }), project: r89 },
  { meta: meta('8.10', { ...B, type: 'BUG', cwe: ['CWE-758'], name: ['Inline function shall be static', '인라인 함수는 static이어야 함'],
    why: ['An external inline function needs an external definition elsewhere; which one is called is unspecified.', '외부 인라인 함수는 다른 곳에 외부 정의가 필요하고 어느 것이 호출될지 정해지지 않습니다.'],
    fix: ['Declare inline functions static.', '인라인 함수를 static으로 선언하세요.'] }), check: r810 },
  { meta: meta('8.11', { ...B, cat: 'A', sev: 'MINOR', cwe: ['CWE-119'], name: ['External array declared with explicit size', '외부 배열은 크기를 명시'],
    why: ['Without a size the array bounds cannot be checked where the declaration is used.', '크기가 없으면 선언을 쓰는 곳에서 배열 경계를 검사할 수 없습니다.'],
    fix: ['State the array size in the declaration.', '선언에 배열 크기를 적으세요.'] }), check: r811 },
  { meta: meta('8.12', { ...B, type: 'BUG', name: ['Implicit enumerator values shall be unique', '암시적 열거자 값은 고유해야 함'],
    why: ['An implicitly numbered enumerator that equals another one is very likely an error.', '암시적으로 번호가 매겨진 열거자가 다른 열거자와 같으면 오류일 가능성이 큽니다.'],
    fix: ['Give the values explicitly or reorder the enumerators.', '값을 명시하거나 열거자 순서를 바꾸세요.'] }), check: r812 },
  { meta: meta('8.13', { ...B, cat: 'A', sev: 'MINOR', dec: false, cert: 'DCL13-C', name: ['Pointer should point to const when possible', '가능하면 const를 가리키는 포인터 사용'],
    why: ['A pointer to const documents and enforces that the object is only read.', 'const를 가리키는 포인터는 객체를 읽기만 한다는 사실을 문서화하고 강제합니다.'],
    fix: ["Add const to the pointed-to type, e.g. 'const int *p'.", "가리키는 타입에 const를 붙이세요(예: 'const int *p')."] }), check: r813 },
  { meta: meta('8.14', { ...B, name: ["The restrict qualifier shall not be used", 'restrict 한정자를 사용하지 않아야 함'],
    why: ['Breaking the non-aliasing promise of restrict is undefined behaviour and hard to verify.', 'restrict의 비별칭 약속을 어기면 미정의 동작이며 검증하기 어렵습니다.'],
    fix: ['Remove restrict.', 'restrict를 없애세요.'] }), check: r814 },
  { meta: meta('8.15', { ...B, type: 'BUG', amendment: 'AMD3', name: ['Consistent explicit alignment on all declarations', '모든 선언에서 일관된 명시적 정렬'],
    why: ['Declarations of one object with different alignment requirements are undefined behaviour.', '한 객체의 선언들이 다른 정렬을 요구하면 미정의 동작입니다.'],
    fix: ['Use the same alignment specifier on every declaration.', '모든 선언에 같은 정렬 지정자를 쓰세요.'] }), project: r815 },
  { meta: meta('8.16', { ...B, cat: 'A', sev: 'MINOR', amendment: 'AMD3', name: ['Alignment specification of zero', '정렬 지정 값 0'],
    why: ['An alignment of zero has no effect and is probably a mistake.', '정렬 0은 효과가 없어 실수일 가능성이 큽니다.'],
    fix: ['Remove it or give a real alignment.', '지정자를 없애거나 실제 정렬 값을 주세요.'] }), check: r816 },
  { meta: meta('8.17', { ...B, cat: 'A', sev: 'MINOR', amendment: 'AMD3', name: ['At most one alignment specifier per declaration', '선언당 정렬 지정자는 하나까지'],
    why: ['Several alignment specifiers make the effective alignment hard to see.', '정렬 지정자가 여러 개면 실제 정렬을 알기 어렵습니다.'],
    fix: ['Keep a single alignment specifier.', '정렬 지정자를 하나만 두세요.'] }), check: r817 },
];
