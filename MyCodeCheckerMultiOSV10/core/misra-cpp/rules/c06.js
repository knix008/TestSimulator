'use strict';

// MISRA C++:2023 chapter 6 — basic concepts (declarations, ODR, scope,
// linkage, storage duration, lifetime, types).

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const { cf } = U;

const at = (n) => (n && n.nameLoc ? { ...n.nameLoc, file: n.loc.file } : n);
const inAnonNs = (n) => cf.ancestors(n).some((a) => a.type === 'NamespaceDecl' && a.anonymous);
const inTemplate = (n) => cf.ancestors(n).some((a) => a.type === 'TemplateDecl');
const isInlineSpec = (n) => { const s = U.specsOf(n); return !!(s && (s.functionSpecs.includes('inline') || s.functionSpecs.includes('constexpr') || s.functionSpecs.includes('consteval'))); };
const storageOf = (n) => { const s = U.specsOf(n); return (s && s.storage) || []; };

function isLocalAuto(sym) {
  return sym && (sym.kind === 'variable' || sym.kind === 'parameter') && sym.storage === 'automatic' && U.canon(sym.type).kind !== 'reference';
}

// Scope nesting: is `outer` an ancestor (or equal) of `inner`?
function scopeEncloses(outer, inner) {
  for (let s = inner; s; s = s.parent) if (s === outer) return true;
  return false;
}

// Declarations of record / enum definitions across the project, keyed by qname.
function typeDefinitions(project) {
  const map = new Map();
  for (const u of project.units) {
    cf.walk(u.ast, (n) => {
      if (n.type === 'FunctionDecl' && n.body) return cf.walk.SKIP;
      if (n.type === 'NamespaceDecl' && n.anonymous) return cf.walk.SKIP;
      if ((n.type === 'RecordDecl' && n.isDefinition && n.members && n.name && !n.anonymous) || (n.type === 'EnumDecl' && n.isDefinition && n.name)) {
        if (!U.user(n) || inTemplate(n)) return undefined;
        const ns = cf.ancestors(n).filter((a) => a.type === 'NamespaceDecl' || a.type === 'RecordDecl').map((a) => a.name || '').reverse();
        const q = [...ns, n.name].join('::');
        const key = `${n.loc.file}:${n.loc.line}:${n.loc.col}`;
        let e = map.get(q);
        if (!e) map.set(q, (e = new Map()));
        if (!e.has(key)) e.set(key, { node: n, unit: u, text: cf.sourceText(u, n).replace(/\s+/g, ' ').trim() });
      }
      return undefined;
    });
  }
  return map;
}

function returnsOf(fn) {
  const out = [];
  cf.walk(fn.body, (n) => {
    if (n.type === 'LambdaExpr' && n !== fn) return cf.walk.SKIP;
    if (n.type === 'RecordDecl') return cf.walk.SKIP;
    if (n.type === 'ReturnStmt') out.push(n);
    return undefined;
  });
  return out;
}

function retType(fn) {
  if (fn.type === 'LambdaExpr') return fn.ctype && fn.ctype.ret;
  const t = fn.ctype ? U.canon(fn.ctype) : null;
  return t && t.kind === 'function' ? t.ret : null;
}

// Expression denotes (the address of) an automatic local object of fn.
function autoObject(e, wantAddress) {
  e = U.strip(e);
  if (!e) return null;
  if (wantAddress) {
    if (e.type === 'UnaryExpr' && e.op === '&') {
      const r = U.rootIdent(e.arg);
      const a = U.strip(e.arg);
      if (r && isLocalAuto(r.symbol) && (a.type === 'Identifier' || a.type === 'MemberExpr' || a.type === 'IndexExpr') && !(a.type === 'MemberExpr' && a.arrow)) return r;
      return null;
    }
    if (e.type === 'Identifier' && isLocalAuto(e.symbol) && U.canon(e.symbol.type).kind === 'array') return e;
    return null;
  }
  if (e.type === 'Identifier' && isLocalAuto(e.symbol)) return e;
  if (e.type === 'MemberExpr' && !e.arrow) { const r = U.rootIdent(e); if (r && isLocalAuto(r.symbol) && U.strip(e.object).type === 'Identifier') return r; }
  return null;
}

const paramsPart = (ts) => { const s = String(ts || ''); const i = s.indexOf('('); return i < 0 ? s : s.slice(i); };

module.exports = [
  R({
    id: '6.0.1', cat: 'Required', dec: true, autosar: 'M3-1-2', sev: 'MAJOR', debt: 5,
    name: ['Block scope declarations shall not be visually ambiguous', '블록 범위 선언은 보기에 모호하면 안 됩니다'],
    why: ['A function declared inside a block (for example "T x();") is easily mistaken for an object definition.', '블록 안에서 선언한 함수(예: "T x();") 는 객체 정의로 착각하기 쉽습니다.'],
    fix: ['Declare functions at namespace scope; use braces to define objects (T x{};).', '함수는 네임스페이스 범위에서 선언하고, 객체는 중괄호로 정의하세요 (T x{};).'],
    check(unit, api) {
      for (const d of U.ix(unit).get('Declaration')) {
        const p = U.parent(d);
        if (!p || p.type !== 'CompoundStmt') continue;
        for (const f of d.declarators) if (f.type === 'FunctionDecl') api.report(at(f), M(`'${f.name}' is a function declared at block scope.`, `'${f.name}' 은(는) 블록 범위에서 선언된 함수입니다.`));
      }
    },
  }),
  R({
    id: '6.0.2', cat: 'Advisory', dec: true, autosar: 'A3-1-4', sev: 'MINOR', debt: 2,
    name: ['When an array with external linkage is declared, its size should be explicitly specified', '외부 링키지 배열을 선언할 때는 크기를 명시해야 합니다'],
    why: ['Without an explicit size, other translation units cannot check their accesses against the bound.', '크기를 명시하지 않으면 다른 번역 단위에서 접근 범위를 확인할 수 없습니다.'],
    fix: ['Give the array an explicit size in every declaration.', '모든 선언에 배열 크기를 명시하세요.'],
    check(unit, api) {
      for (const v of U.ix(unit).get('VarDecl')) {
        if (!v.symbol || v.symbol.linkage !== 'external') continue;
        let d = v.declarator;
        let unsized = false;
        while (d) { if (d.type === 'ArrayDeclarator' && !d.size) { unsized = true; break; } d = d.inner; }
        if (unsized) api.report(at(v), M(`The external array '${v.name}' is declared without an explicit size.`, `외부 배열 '${v.name}' 이(가) 크기 없이 선언되었습니다.`));
      }
    },
  }),
  R({
    id: '6.0.3', cat: 'Advisory', dec: true, autosar: 'M7-3-1', sev: 'MINOR', debt: 5,
    name: ['The only declarations in the global namespace should be main, namespace declarations and extern "C" declarations', '전역 네임스페이스에는 main, 네임스페이스 선언, extern "C" 선언만 두어야 합니다'],
    why: ['Names in the global namespace can collide with names from any other library.', '전역 네임스페이스의 이름은 다른 어떤 라이브러리의 이름과도 충돌할 수 있습니다.'],
    fix: ['Move the declaration into a named namespace.', '선언을 이름 있는 네임스페이스로 옮기세요.'],
    check(unit, api) {
      for (const d of unit.ast.decls) {
        if (!U.user(d)) continue;
        const rep = (n, name) => api.report(at(n), M(`'${name}' is declared in the global namespace.`, `'${name}' 이(가) 전역 네임스페이스에 선언되었습니다.`));
        let decl = d;
        if (d.type === 'TemplateDecl') decl = d.decl;
        if (!decl) continue;
        if (decl.type === 'Declaration') {
          if (!decl.declarators.length) {
            const ts = decl.specs && decl.specs.typeSpec;
            if (ts && (ts.type === 'RecordDecl' || ts.type === 'EnumDecl') && ts.name && !ts.qualifier) rep(ts, ts.name);
            continue;
          }
          for (const x of decl.declarators) {
            if (x.qualifier) continue; // out-of-line member / namespace member definition
            if (x.type === 'FunctionDecl' && (x.name === 'main' || /^operator (new|delete)/.test(x.name || ''))) continue;
            rep(x, x.name || (x.names ? x.names.map((n) => n.name).join(',') : '?'));
          }
        } else if (decl.type === 'AliasDecl' || decl.type === 'ConceptDecl') rep(decl, decl.name);
      }
    },
  }),
  R({
    id: '6.0.4', cat: 'Required', dec: true, autosar: 'M7-3-2', sev: 'MAJOR', debt: 5,
    name: ['The identifier main shall not be used for a function other than the global function main', 'main 이라는 이름은 전역 main 함수에만 써야 합니다'],
    why: ['Another function called main is confusing and may be mistaken for the program entry point.', 'main 이라는 다른 함수는 혼란을 주고 프로그램 진입점으로 착각될 수 있습니다.'],
    fix: ['Rename the function.', '함수 이름을 바꾸세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).get('FunctionDecl')) {
        if (f.name !== 'main') continue;
        const inside = cf.ancestors(f).some((a) => a.type === 'NamespaceDecl' || a.type === 'RecordDecl');
        if (inside || f.qualifier) api.report(at(f), M(`A function other than the global main is named 'main'.`, `전역 main 이 아닌 함수의 이름이 'main' 입니다.`));
      }
    },
  }),
  R({
    id: '6.2.1', cat: 'Required', dec: false, type: 'BUG', autosar: 'M3-2-2', cwe: 'CWE-758', sev: 'CRITICAL', debt: 20,
    name: ['The one-definition rule shall not be violated', '단일 정의 규칙(ODR) 을 어기면 안 됩니다'],
    why: ['Multiple, differing definitions of one entity give undefined behaviour that the linker often cannot diagnose.', '한 개체에 서로 다른 정의가 여럿 있으면 정의되지 않은 동작이 되며 링커가 진단하지 못하는 경우가 많습니다.'],
    fix: ['Keep exactly one definition, shared through a header where it must be visible in several units.', '정의를 하나만 두고 여러 단위에서 보여야 하면 헤더로 공유하세요.'],
    project(project, api) {
      for (const g of project.globalSymbols.values()) {
        if (!g.multipleDefinitions || g.system) continue;
        // C++ overloads share a qname in globalSymbols: only compare definitions of the same type,
        // and ignore deleted/defaulted members.
        const all = (g.definitions || []).filter((d) => !(d.node && (d.node.isDeleted || d.node.isDefault)));
        const defs = all.filter((d, i) => d.typeString === all[0].typeString && all.findIndex((o) => o.file === d.file && o.line === d.line && o.col === d.col) === i);
        if (defs.length < 2) continue;
        for (const d of defs.slice(1)) api.report(d, M(`'${g.name}' is defined more than once (also at ${defs[0].file}:${defs[0].line}).`, `'${g.name}' 이(가) 두 번 이상 정의되었습니다 (${defs[0].file}:${defs[0].line} 에도 있음).`));
      }
      for (const [q, defs] of typeDefinitions(project)) {
        const list = [...defs.values()];
        const files = new Set(list.map((d) => d.node.loc.file));
        if (files.size < 2) continue;
        const texts = new Set(list.map((d) => d.text));
        if (texts.size < 2) continue;
        const first = list[0].node;
        for (const d of list.slice(1)) if (d.text !== list[0].text) api.report(d.node, M(`'${q}' is defined differently here and at ${first.loc.file}:${first.loc.line}.`, `'${q}' 가 여기와 ${first.loc.file}:${first.loc.line} 에서 다르게 정의되었습니다.`));
      }
    },
  }),
  R({
    id: '6.2.2', cat: 'Required', dec: false, type: 'BUG', autosar: 'M3-2-1', cwe: 'CWE-843', sev: 'MAJOR', debt: 10,
    name: ['All declarations of a variable or function shall have the same type', '변수나 함수의 모든 선언은 같은 타입이어야 합니다'],
    why: ['Incompatible declarations of one entity make calls and accesses use the wrong type.', '한 개체의 선언 타입이 다르면 호출이나 접근이 잘못된 타입을 쓰게 됩니다.'],
    fix: ['Declare the entity once in a header and include it everywhere.', '개체를 헤더에서 한 번 선언하고 모든 곳에서 포함하세요.'],
    project(project, api) {
      for (const g of project.globalSymbols.values()) {
        if (!g.typeMismatch || g.system) continue;
        const first = g.decls[0];
        for (const d of g.decls.slice(1)) {
          if (d.typeString === first.typeString) continue;
          // different parameter lists are overloads, not conflicting declarations
          if (g.kind === 'function' && paramsPart(d.typeString) !== paramsPart(first.typeString)) continue;
          api.report(d, M(`'${g.name}' is declared as '${d.typeString}' here but as '${first.typeString}' at ${first.file}:${first.line}.`, `'${g.name}' 이(가) 여기서는 '${d.typeString}', ${first.file}:${first.line} 에서는 '${first.typeString}' 로 선언되었습니다.`));
        }
      }
    },
  }),
  R({
    id: '6.2.3', cat: 'Required', dec: true, autosar: 'M3-2-3', sev: 'MAJOR', debt: 10,
    name: ['The source code used to implement an entity shall appear only once', '한 개체를 구현하는 소스 코드는 한 곳에만 있어야 합니다'],
    why: ['Copies of the same definition in several source files drift apart over time and then violate the ODR.', '같은 정의를 여러 소스 파일에 복사해 두면 시간이 지나며 달라져 ODR 위반이 됩니다.'],
    fix: ['Move the definition into a header and include it.', '정의를 헤더로 옮기고 포함하세요.'],
    project(project, api) {
      for (const [q, defs] of typeDefinitions(project)) {
        const list = [...defs.values()].filter((d) => !U.isHeaderFile(d.node.loc.file));
        const files = new Set(list.map((d) => d.node.loc.file));
        if (files.size < 2) continue;
        const first = list[0].node;
        for (const d of list.slice(1)) if (d.text === list[0].text) api.report(d.node, M(`'${q}' is defined again here (same code as ${first.loc.file}:${first.loc.line}).`, `'${q}' 가 여기서 다시 정의되었습니다 (${first.loc.file}:${first.loc.line} 와 같은 코드).`));
      }
      for (const g of project.globalSymbols.values()) {
        if (g.kind !== 'function' || g.system) continue;
        const defs = (g.definitions || []).filter((d) => !U.isHeaderFile(d.file) && isInlineSpec(d.node));
        if (new Set(defs.map((d) => d.file)).size > 1) for (const d of defs.slice(1)) api.report(d, M(`The inline function '${g.name}' is implemented again here (also at ${defs[0].file}:${defs[0].line}).`, `inline 함수 '${g.name}' 가 여기서 다시 구현되었습니다 (${defs[0].file}:${defs[0].line} 에도 있음).`));
      }
    },
  }),
  R({
    id: '6.2.4', cat: 'Required', dec: true, autosar: 'A3-1-1', sev: 'MAJOR', debt: 10,
    name: ['A header file shall not contain definitions of functions or objects that are non-inline and have external linkage', '헤더에 외부 링키지를 가진 inline 이 아닌 함수/객체 정의를 두면 안 됩니다'],
    why: ['Including such a header in two units defines the entity twice and breaks the ODR.', '그런 헤더를 두 단위에서 포함하면 개체가 두 번 정의되어 ODR 을 어깁니다.'],
    fix: ['Declare it in the header and define it in one source file, or make it inline.', '헤더에서는 선언만 하고 한 소스 파일에서 정의하거나 inline 으로 만드세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      for (const f of x.funcs) {
        if (!U.isHeaderFile(f.loc.file) || isInlineSpec(f) || inTemplate(f) || f.isDefault || f.isDeleted) continue;
        if (cf.enclosing(f, 'RecordDecl') || !f.symbol || f.symbol.linkage !== 'external') continue;
        if (cf.enclosing(f, ['FunctionDecl', 'LambdaExpr'])) continue;
        api.report(at(f), M(`The header defines the non-inline function '${f.name}' with external linkage.`, `헤더가 외부 링키지를 가진 inline 이 아닌 함수 '${f.name}' 를 정의합니다.`));
      }
      for (const v of x.get('VarDecl')) {
        if (!U.isHeaderFile(v.loc.file) || !v.symbol || v.symbol.linkage !== 'external' || inTemplate(v)) continue;
        const st = storageOf(v);
        const s = U.specsOf(v);
        if (s && s.functionSpecs.includes('inline')) continue;
        if (st.includes('extern') && !v.init) continue;
        if (v.symbol.scope && v.symbol.scope.kind !== 'file' && v.symbol.scope.kind !== 'namespace') continue;
        api.report(at(v), M(`The header defines the object '${v.name}' with external linkage.`, `헤더가 외부 링키지를 가진 객체 '${v.name}' 를 정의합니다.`));
      }
    },
  }),
  R({
    id: '6.4.1', cat: 'Required', dec: true, autosar: 'A2-10-1', sev: 'MAJOR', debt: 5,
    name: ['A variable declared in an inner scope shall not hide a variable declared in an outer scope', '안쪽 범위의 변수가 바깥 범위의 변수를 가리면 안 됩니다'],
    why: ['Hiding makes it unclear which object a name refers to.', '이름이 가려지면 어느 객체를 가리키는지 알기 어렵습니다.'],
    fix: ['Rename the inner variable.', '안쪽 변수의 이름을 바꾸세요.'],
    check(unit, api) {
      for (const v of U.ix(unit).get('VarDecl', 'ParamDecl')) {
        const s = v.symbol;
        if (!s || !v.name || (s.kind !== 'variable' && s.kind !== 'parameter') || !s.scope) continue;
        if (v.type === 'ParamDecl' && (!s.scope || s.scope.kind === 'prototype')) continue;
        for (let sc = s.scope.parent; sc; sc = sc.parent) {
          if (sc.kind === 'class' || sc.kind === 'prototype' || sc.kind === 'template') continue;
          const o = sc.names.get(v.name);
          if (!o || o === s || (o.kind !== 'variable' && o.kind !== 'parameter') || o.predefined) continue;
          const od = o.decls && o.decls[0];
          if (!od || !od.loc || (od.loc.file === v.loc.file && od.loc.start > v.loc.start)) continue;
          api.report(at(v), M(`'${v.name}' hides the ${o.kind} declared at line ${od.loc.line}.`, `'${v.name}' 가 ${od.loc.line}행에 선언된 ${o.kind === 'parameter' ? '매개변수' : '변수'}를 가립니다.`));
          break;
        }
      }
    },
  }),
  R({
    id: '6.4.2', cat: 'Required', dec: true, autosar: 'A10-2-1', sev: 'MAJOR', debt: 10,
    name: ['Derived classes shall not conceal functions that are inherited from their bases', '파생 클래스가 기반 클래스에서 물려받은 함수를 가리면 안 됩니다'],
    why: ['A derived member with the same name hides every base overload, so calls silently pick a different function.', '같은 이름의 파생 멤버는 기반의 모든 오버로드를 가려 호출이 조용히 다른 함수로 갑니다.'],
    fix: ['Bring the base overloads in with a using-declaration, override them, or rename the function.', 'using 선언으로 기반 오버로드를 들여오거나, 재정의하거나, 이름을 바꾸세요.'],
    check(unit, api) {
      for (const rd of U.ix(unit).records) {
        const rec = rd.ctype && U.canon(rd.ctype);
        if (!rec || rec.kind !== 'record' || !U.bases(rec).length) continue;
        const mine = U.methods(rec).filter((m) => !m.node.isConstructor && !m.node.isDestructor && m.node.name !== 'operator=');
        const usings = new Set(U.members(rec).filter((m) => m.node.type === 'UsingDecl').map((m) => m.node.name));
        const reported = new Set();
        const visit = (base, depth) => {
          if (!base || depth > 10) return;
          for (const bm of U.methods(base)) {
            const b = bm.node;
            if (bm.access === 'private' || usings.has(b.name)) continue;
            const same = mine.filter((m) => m.node.name === b.name);
            if (!same.length) continue;
            const virt = U.isVirtualDecl(b) || b.isOverride || b.isFinal;
            const overrides = same.some((m) => U.paramCount(m.node) === U.paramCount(b) && virt);
            if (overrides) continue;
            for (const m of same) {
              if (reported.has(m.node)) continue;
              reported.add(m.node);
              api.report(at(m.node), M(`'${rec.name}::${m.node.name}' conceals the inherited '${base.name}::${b.name}'.`, `'${rec.name}::${m.node.name}' 가 물려받은 '${base.name}::${b.name}' 를 가립니다.`));
            }
          }
          for (const bb of U.bases(base)) visit(bb.rec, depth + 1);
        };
        for (const b of U.bases(rec)) visit(b.rec, 0);
      }
    },
  }),
  R({
    id: '6.4.3', cat: 'Required', dec: true, autosar: 'M14-6-1', sev: 'MAJOR', debt: 5,
    name: ['A name that is present in a dependent base shall not be resolved by unqualified lookup', '종속 기반 클래스에 있는 이름을 한정 없는 조회로 찾으면 안 됩니다'],
    why: ['Unqualified names are not looked up in dependent bases, so the code may bind to a different (global) entity.', '한정 없는 이름은 종속 기반에서 찾지 않으므로 다른(전역) 개체에 묶일 수 있습니다.'],
    fix: ['Qualify the name with this-> or Base<T>::.', '이름 앞에 this-> 나 Base<T>:: 를 붙이세요.'],
    check(unit, api) {
      for (const td of U.ix(unit).get('TemplateDecl')) {
        const decl = td.decl;
        const rd = decl && decl.type === 'Declaration' && decl.specs && decl.specs.typeSpec && decl.specs.typeSpec.type === 'RecordDecl' ? decl.specs.typeSpec : null;
        if (!rd || !rd.bases || !rd.bases.length) continue;
        const pnames = new Set(td.params.map((p) => p.name).filter(Boolean));
        const depBases = rd.bases.filter((b) => pnames.has(b.name) || (b.templateArgs && b.templateArgs.length));
        if (!depBases.length) continue;
        const own = rd.ctype ? U.canon(rd.ctype) : null;
        cf.walk(rd, (n) => {
          if (n.type !== 'Identifier' || !n.implicitThis || !n.symbol || n.qualifier) return undefined;
          const s = n.symbol;
          const ownerScope = s.scope;
          if (own && own.scope && ownerScope === own.scope) return undefined;
          api.report(n, M(`'${n.name}' comes from a dependent base and is found by unqualified lookup.`, `'${n.name}' 은(는) 종속 기반 클래스의 이름인데 한정 없이 조회됩니다.`));
          return undefined;
        });
      }
    },
  }),
  R({
    id: '6.5.1', cat: 'Advisory', dec: true, autosar: 'A3-3-1', sev: 'MINOR', debt: 5,
    name: ['A function or object with external linkage should be introduced in a header file', '외부 링키지 함수나 객체는 헤더 파일에서 선언해야 합니다'],
    why: ['Declaring a shared entity locally in several source files lets the declarations drift apart unchecked.', '공유 개체를 여러 소스 파일에서 따로 선언하면 선언이 서로 어긋나도 검사되지 않습니다.'],
    fix: ['Declare the entity in a header included by its users and by the defining file.', '사용하는 파일과 정의하는 파일이 함께 포함하는 헤더에 선언하세요.'],
    project(project, api) {
      for (const g of project.globalSymbols.values()) {
        if (g.system || g.name === 'main') continue;
        const decls = g.decls.filter((d) => !U.isBuiltin(d.file));
        if (!decls.length || decls.some((d) => U.isHeaderFile(d.file))) continue;
        const syms = g.symbols.map((s) => s.symbol);
        if (syms.some((s) => s.member || s.externC || s.template)) continue;
        const local = decls.find((d) => !d.isDefinition) || null;
        if (g.units.size < 2 && !local) continue;
        const d = local || decls[0];
        api.report(d, M(`'${g.name}' has external linkage but is not declared in a header file.`, `'${g.name}' 은(는) 외부 링키지인데 헤더 파일에 선언되어 있지 않습니다.`));
      }
    },
  }),
  R({
    id: '6.5.2', cat: 'Advisory', dec: true, sev: 'MINOR', debt: 5,
    name: ['Internal linkage should be specified appropriately', '내부 링키지는 알맞게 지정해야 합니다'],
    why: ['Entities used in only one translation unit should not be visible to others, and redundant static in an unnamed namespace adds noise.', '한 번역 단위에서만 쓰는 개체는 다른 단위에 보이지 않아야 하며, 이름 없는 네임스페이스 안의 static 은 군더더기입니다.'],
    fix: ['Give file-local entities internal linkage (unnamed namespace) and drop redundant static.', '파일 내부 개체에는 내부 링키지(이름 없는 네임스페이스) 를 주고 불필요한 static 은 지우세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      for (const d of x.get('Declaration')) {
        if (!d.specs || !d.specs.storage.includes('static')) continue;
        const p = U.parent(d);
        if (!p || p.type !== 'NamespaceDecl' || !p.anonymous) continue;
        for (const v of d.declarators) api.report(at(v), M(`'static' is redundant for '${v.name}' inside an unnamed namespace.`, `이름 없는 네임스페이스 안의 '${v.name}' 에는 'static' 이 필요 없습니다.`));
      }
    },
    project(project, api) {
      for (const g of project.globalSymbols.values()) {
        if (g.system || g.name === 'main' || g.units.size !== 1 || !g.defined) continue;
        const decls = g.decls.filter((d) => !U.isBuiltin(d.file));
        if (!decls.length || decls.some((d) => U.isHeaderFile(d.file))) continue;
        const syms = g.symbols.map((s) => s.symbol);
        if (syms.some((s) => s.member || s.externC || s.template || (s.decls || []).some((n) => inTemplate(n)))) continue;
        if (decls.some((d) => !d.isDefinition)) continue; // reported by 6.5.1
        const d = g.definitions[0];
        api.report(d, M(`'${g.name}' is only used in this file; give it internal linkage.`, `'${g.name}' 은(는) 이 파일에서만 쓰이므로 내부 링키지로 만드세요.`));
      }
    },
  }),
  R({
    id: '6.7.1', cat: 'Required', dec: true, sev: 'MAJOR', debt: 10,
    name: ['Local variables shall not have static storage duration', '지역 변수는 정적 저장 기간을 가지면 안 됩니다'],
    why: ['A static local keeps hidden state between calls and makes the function non-reentrant.', '정적 지역 변수는 호출 사이에 숨은 상태를 남겨 함수를 재진입 불가능하게 만듭니다.'],
    fix: ['Pass the state explicitly or make the variable constexpr.', '상태를 명시적으로 넘기거나 변수를 constexpr 로 만드세요.'],
    check(unit, api) {
      for (const v of U.ix(unit).get('VarDecl')) {
        const s = v.symbol;
        if (!s || s.storage !== 'static' || !s.scope || (s.scope.kind !== 'function' && s.scope.kind !== 'block')) continue;
        if (s.isConstexpr || storageOf(v).includes('extern') || s.predefined) continue;
        const sp = U.specsOf(v);
        if (sp && sp.functionSpecs.includes('constexpr')) continue;
        api.report(at(v), M(`The local variable '${v.name}' has static storage duration.`, `지역 변수 '${v.name}' 이(가) 정적 저장 기간을 가집니다.`));
      }
    },
  }),
  R({
    id: '6.7.2', cat: 'Required', dec: true, sev: 'MAJOR', debt: 15,
    name: ['Global variables shall not be used', '전역 변수를 쓰면 안 됩니다'],
    why: ['Mutable global state couples distant code, hinders testing and invites data races.', '변경 가능한 전역 상태는 멀리 떨어진 코드를 묶고 시험을 어렵게 하며 데이터 경쟁을 부릅니다.'],
    fix: ['Make the variable constexpr/const, or move the state into an object that is passed around.', '변수를 constexpr/const 로 만들거나 상태를 객체로 옮겨 넘기세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      const isConst = (n) => { const t = U.canon(n.ctype); return !!(t.const || (t.kind === 'array' && U.canon(t.of).const)) || (U.specsOf(n) && U.specsOf(n).functionSpecs.includes('constexpr')); };
      for (const v of x.get('VarDecl')) {
        const s = v.symbol;
        if (!s || !s.scope || (s.scope.kind !== 'file' && s.scope.kind !== 'namespace') || s.predefined) continue;
        if (s.storage !== 'static' && s.storage !== 'thread') continue;
        if (isConst(v) || (s.definition && s.definition !== v && s.decls[0] !== v)) continue;
        if (v.qualifier) continue;
        api.report(at(v), M(`'${v.name}' is a global variable.`, `'${v.name}' 은(는) 전역 변수입니다.`));
      }
      for (const f of x.get('FieldDecl')) {
        const sp = U.specsOf(f);
        if (!sp || !sp.storage.includes('static') || isConst(f)) continue;
        api.report(at(f), M(`The static data member '${f.name}' is global state.`, `정적 데이터 멤버 '${f.name}' 은(는) 전역 상태입니다.`));
      }
    },
  }),
  R({
    id: '6.8.1', cat: 'Required', dec: false, type: 'BUG', cert: 'EXP54-CPP', cwe: 'CWE-416', sev: 'CRITICAL', debt: 20,
    name: ['An object shall not be accessed outside of its lifetime', '수명이 끝난 객체에 접근하면 안 됩니다'],
    why: ['Using an object after it was deleted or destroyed is undefined behaviour and a classic security hole.', '삭제되거나 파괴된 객체를 쓰는 것은 정의되지 않은 동작이며 전형적인 보안 취약점입니다.'],
    fix: ['Do not use the pointer after delete; reset it or restructure ownership.', 'delete 뒤에는 포인터를 쓰지 말고, 초기화하거나 소유 구조를 바꾸세요.'],
    check(unit, api) {
      for (const del of U.ix(unit).get('DeleteExpr')) {
        const id = U.strip(del.arg);
        if (!id || id.type !== 'Identifier' || !id.symbol) continue;
        const stmt = U.upParens(del).p;
        if (!stmt || stmt.type !== 'ExprStmt') continue;
        const block = U.parent(stmt);
        if (!block || block.type !== 'CompoundStmt') continue;
        const i = block.body.indexOf(stmt);
        let done = false;
        for (const s of block.body.slice(i + 1)) {
          if (done) break;
          cf.walk(s, (n) => {
            if (done) return cf.walk.STOP;
            if (n.type === 'Identifier' && n.symbol === id.symbol) {
              if (U.writeKind(n) === 'assign') { done = true; return cf.walk.STOP; }
              api.report(n, M(`'${id.name}' is used after the object it points to was deleted.`, `'${id.name}' 가 가리키는 객체가 삭제된 뒤에 사용됩니다.`));
              done = true;
              return cf.walk.STOP;
            }
            return undefined;
          });
          if (s.type === 'ReturnStmt' || s.type === 'BreakStmt' || s.type === 'ContinueStmt' || s.type === 'GotoStmt') break;
        }
      }
    },
  }),
  R({
    id: '6.8.2', cat: 'Mandatory', dec: false, type: 'BUG', autosar: 'M7-5-1', cwe: 'CWE-562', sev: 'CRITICAL', debt: 15,
    name: ['A function must not return a reference or a pointer to a local variable with automatic storage duration', '함수는 자동 저장 기간 지역 변수의 참조나 포인터를 돌려주면 안 됩니다'],
    why: ['The local object is destroyed when the function returns, leaving the caller with a dangling reference.', '함수가 반환하면 지역 객체가 파괴되어 호출자는 허상 참조를 갖게 됩니다.'],
    fix: ['Return by value, or return a reference to an object that outlives the call.', '값으로 반환하거나 호출보다 오래 사는 객체의 참조를 반환하세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      for (const fn of [...x.funcs, ...x.get('LambdaExpr')]) {
        const rt = retType(fn);
        if (!rt) continue;
        const k = U.canon(rt).kind;
        if (k !== 'pointer' && k !== 'reference') continue;
        for (const r of returnsOf(fn)) {
          if (!r.arg) continue;
          const obj = autoObject(r.arg, k === 'pointer');
          if (!obj || !obj.symbol) continue;
          const decl = obj.symbol.decls && obj.symbol.decls[0];
          if (!decl || !cf.ancestors(decl).includes(fn) && !(fn.params || []).includes(decl)) continue;
          api.report(r, M(`A ${k === 'pointer' ? 'pointer' : 'reference'} to the local '${obj.name}' is returned.`, `지역 변수 '${obj.name}' 의 ${k === 'pointer' ? '포인터' : '참조'}를 반환합니다.`));
        }
      }
    },
  }),
  R({
    id: '6.8.3', cat: 'Required', dec: false, type: 'BUG', autosar: 'M7-5-2', cwe: 'CWE-562', sev: 'CRITICAL', debt: 15,
    name: ['An assignment operator shall not assign the address of an object with automatic storage duration to an object with a greater lifetime', '자동 저장 기간 객체의 주소를 더 오래 사는 객체에 대입하면 안 됩니다'],
    why: ['The longer-lived pointer dangles as soon as the local object goes out of scope.', '지역 객체가 범위를 벗어나는 순간 더 오래 사는 포인터는 허상이 됩니다.'],
    fix: ['Store the address only in objects with the same or shorter lifetime.', '수명이 같거나 짧은 객체에만 주소를 저장하세요.'],
    check(unit, api) {
      for (const a of U.ix(unit).get('AssignExpr')) {
        if (a.op !== '=') continue;
        const obj = autoObject(a.right, true);
        if (!obj || !obj.symbol) continue;
        const L = U.strip(a.left);
        const root = U.rootIdent(L);
        let longer = false;
        if (L && L.type === 'MemberExpr' && U.strip(L.object).type === 'ThisExpr') longer = true;
        else if (root && root.implicitThis) longer = true;
        else if (root && root.symbol) {
          const ls = root.symbol;
          if (ls.storage === 'static' || ls.storage === 'thread' || ls.kind === 'field') longer = true;
          else if (ls.kind === 'parameter' && L !== root) longer = true; // *out = &local, out->p = &local
          else if (ls.scope && obj.symbol.scope && ls.scope !== obj.symbol.scope && scopeEncloses(ls.scope, obj.symbol.scope) && U.canon(ls.type).kind !== 'reference') longer = true;
        }
        if (longer) api.report(a, M(`The address of the local '${obj.name}' is stored in '${cf.sourceText(unit, a.left)}', which lives longer.`, `지역 변수 '${obj.name}' 의 주소를 더 오래 사는 '${cf.sourceText(unit, a.left)}' 에 저장합니다.`));
      }
    },
  }),
  R({
    id: '6.8.4', cat: 'Advisory', dec: true, sev: 'MINOR', debt: 5,
    name: ['Member functions returning references to their object should be ref-qualified appropriately', '자기 객체의 참조를 돌려주는 멤버 함수에는 알맞은 참조 한정자를 붙여야 합니다'],
    why: ['Without a ref-qualifier the function can be called on a temporary and return a reference into a dead object.', '참조 한정자가 없으면 임시 객체에 대해 호출되어 이미 소멸한 객체 안을 가리키는 참조를 돌려줄 수 있습니다.'],
    fix: ['Add & (and a deleted or by-value && overload) to the member function.', '멤버 함수에 & 를 붙이고(필요하면 && 오버로드는 삭제하거나 값 반환) 하세요.'],
    check(unit, api) {
      for (const f of U.ix(unit).funcs) {
        const d = U.fdecl(f);
        if (!d || d.refQual || f.isConstructor || f.isDestructor || f.name === 'operator=' || /^operator.*=$/.test(f.name || '')) continue;
        const owner = U.ownerRecord(unit, f);
        if (!owner) continue;
        const sp = U.specsOf(f);
        if (sp && sp.storage.includes('static')) continue;
        const rt = retType(f);
        if (!rt) continue;
        const k = U.canon(rt).kind;
        if (k !== 'reference' && k !== 'pointer') continue;
        const intoObject = (e) => {
          e = U.strip(e);
          if (!e) return false;
          if (e.type === 'UnaryExpr' && e.op === '*' && U.strip(e.arg).type === 'ThisExpr') return true;
          if (e.type === 'ThisExpr') return k === 'pointer';
          if (e.type === 'UnaryExpr' && e.op === '&') return intoObject(e.arg) && k === 'pointer';
          if (e.type === 'Identifier' && e.implicitThis && e.symbol && e.symbol.kind === 'field') return true;
          if (e.type === 'MemberExpr' && U.strip(e.object).type === 'ThisExpr') return true;
          if (e.type === 'IndexExpr') return intoObject(e.object);
          return false;
        };
        if (returnsOf(f).some((r) => intoObject(r.arg))) api.report(at(f), M(`'${f.name}' returns a reference into its object but has no ref-qualifier.`, `'${f.name}' 은(는) 자기 객체 안을 가리키는 참조를 돌려주지만 참조 한정자가 없습니다.`));
      }
    },
  }),
  R({
    id: '6.9.1', cat: 'Required', dec: true, sev: 'MINOR', debt: 5,
    name: ['The same type aliases shall be used in all declarations of the same entity', '같은 개체의 모든 선언에는 같은 타입 별칭을 써야 합니다'],
    why: ['Mixing a typedef and its underlying type across declarations hides intent and breaks when the alias changes.', '선언마다 typedef 와 실제 타입을 섞어 쓰면 의도가 흐려지고 별칭이 바뀌면 깨집니다.'],
    fix: ['Spell the types the same way in every declaration.', '모든 선언에서 타입을 같은 방식으로 쓰세요.'],
    check(unit, api) {
      const seen = new Set();
      for (const s of unit.symbols) {
        if ((s.kind !== 'function' && s.kind !== 'variable') || seen.has(s) || !s.decls || s.decls.length < 2) continue;
        seen.add(s);
        const decls = s.decls.filter((d) => d.ctype && d.loc && (d.type === 'FunctionDecl' || d.type === 'VarDecl'));
        if (decls.length < 2 || !decls.some(U.user)) continue;
        const first = decls[0];
        const t0 = U.tstr(first.ctype);
        for (const d of decls.slice(1)) {
          if (!U.user(d)) continue;
          const t = U.tstr(d.ctype);
          if (t !== t0 && U.T.sameType(first.ctype, d.ctype)) api.report(at(d), M(`'${s.name}' is declared as '${t}' here but as '${t0}' at line ${first.loc.line}.`, `'${s.name}' 이(가) 여기서는 '${t}', ${first.loc.line}행에서는 '${t0}' 로 선언되었습니다.`));
        }
      }
    },
  }),
  R({
    id: '6.9.2', cat: 'Advisory', dec: true, autosar: 'A3-9-1', sev: 'MINOR', debt: 2,
    name: ['The names of the standard signed integer types and standard unsigned integer types should not be used', '표준 부호 있는/없는 정수 타입의 이름은 직접 쓰지 않아야 합니다'],
    why: ['The width of int, long and friends varies between platforms; fixed-width aliases make the size explicit.', 'int, long 등의 폭은 플랫폼마다 다르므로 고정 폭 별칭으로 크기를 드러내야 합니다.'],
    fix: ['Use std::int32_t, std::uint16_t and similar aliases.', 'std::int32_t, std::uint16_t 같은 별칭을 쓰세요.'],
    check(unit, api) {
      const INT_WORDS = new Set(['int', 'short', 'long', 'signed', 'unsigned']);
      for (const b of U.ix(unit).get('BuiltinType')) {
        if (!b.names.some((w) => INT_WORDS.has(w))) continue;
        const anc = cf.ancestors(b);
        if (anc.some((a) => a.type === 'AliasDecl' || (a.type === 'Declaration' && a.specs && a.specs.storage.includes('typedef')))) continue;
        const ds = anc.find((a) => a.type === 'Declaration');
        if (ds && ds.declarators.some((d) => d.type === 'FunctionDecl' && d.name === 'main') && U.parent(b) === ds.specs) continue;
        const pd = anc.find((a) => a.type === 'ParamDecl');
        if (pd) {
          const fd = anc.find((a) => a.type === 'FunctionDecl');
          if (fd && (fd.name === 'main' || ((fd.name === 'operator++' || fd.name === 'operator--') && !pd.name))) continue;
          if (fd && /^operator\s*""/.test(fd.name || '')) continue;
        }
        api.report(b, M(`The standard integer type '${b.names.join(' ')}' is used directly.`, `표준 정수 타입 '${b.names.join(' ')}' 를 직접 씁니다.`));
      }
    },
  }),
];
