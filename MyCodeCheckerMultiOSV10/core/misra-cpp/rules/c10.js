'use strict';

// MISRA C++:2023 chapter 10 — declarations.

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const { cf } = U;

const qualsOf = (t) => (t ? U.T.qualsOf(t) : {});

// Unscoped enumeration without a fixed underlying type.
function looseEnum(t) {
  if (!t) return null;
  const c = U.nonRef(t);
  return c.kind === 'enum' && !c.scoped && !c.fixed ? c : null;
}

// Does any use of parameter `sym` (pointer or lvalue reference) possibly
// modify the referenced object or let it escape as non-const?
function targetMayBeModified(fn, sym, isPointer) {
  for (const id of U.usesIn(fn.body, sym)) {
    let e = id;
    let up = U.upParens(e);
    if (isPointer) {
      // the pointer value itself: compared / tested is fine, anything else escapes
      const p = up.p;
      if (p && p.type === 'UnaryExpr' && p.op === '*') e = p;
      else if (p && p.type === 'IndexExpr' && up.key === 'object') e = p;
      else if (p && p.type === 'MemberExpr' && p.arrow && up.key === 'object') e = p;
      else {
        if (p && p.type === 'BinaryExpr' && ['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(p.op)) continue;
        if (p && p.type === 'UnaryExpr' && p.op === '!') continue;
        if (p && (p.type === 'IfStmt' || p.type === 'WhileStmt' || p.type === 'DoStmt' || p.type === 'ForStmt') && up.key === 'cond') continue;
        if (p && p.type === 'ConditionalExpr' && up.key === 'test') continue;
        return true;
      }
      up = U.upParens(e);
    }
    // e is an lvalue designating (part of) the target object; climb member/index accesses
    for (let i = 0; i < 20; i++) {
      const p = up.p;
      if (p && p.type === 'MemberExpr' && !p.arrow && up.key === 'object') {
        const pp = U.upParens(p);
        if (pp.p && pp.p.type === 'CallExpr' && pp.key === 'callee') {
          const ms = p.memberSymbol;
          const d = ms && ms.decls && ms.decls[0];
          if (!d || !U.isConstMethod(d)) return true;
          e = pp.p; up = U.upParens(e);
          break;
        }
        e = p; up = pp; continue;
      }
      if (p && p.type === 'IndexExpr' && up.key === 'object' && U.canon(e.ctype || U.T.T.unknown).kind === 'array') { e = p; up = U.upParens(p); continue; }
      break;
    }
    const p = up.p;
    if (!p) return true;
    if (p.type === 'AssignExpr') { if (up.key === 'left') return true; continue; }
    if (p.type === 'UnaryExpr') { if (['++', '--', '&'].includes(p.op)) return true; continue; }
    if (p.type === 'BinaryExpr' || p.type === 'ConditionalExpr') continue;
    if (p.type === 'IfStmt' || p.type === 'WhileStmt' || p.type === 'DoStmt' || p.type === 'SwitchStmt' || p.type === 'ForStmt') continue;
    if (p.type === 'ExprStmt') continue;
    if (p.type === 'CastExpr') { const k = U.canon((p.typeName && p.typeName.ctype) || p.ctype || U.T.T.unknown).kind; if (k === 'reference' || k === 'pointer' || k === 'unknown') return true; continue; }
    if (p.type === 'VarDecl') { const k = U.canon(p.ctype || U.T.T.unknown); if (k.kind === 'reference' && !qualsOf(k.to).const) return true; if (k.kind === 'auto' || k.kind === 'unknown') return true; continue; }
    if (p.type === 'ReturnStmt') { const fr = fn.ctype && U.canon(fn.ctype).kind === 'function' ? U.canon(U.canon(fn.ctype).ret) : null; if (!fr || fr.kind === 'reference' || fr.kind === 'pointer') return true; continue; }
    if (p.type === 'CallExpr') {
      if (up.key === 'callee') return true;
      const ft = p.callee && p.callee.ctype ? U.canon(p.callee.ctype) : null;
      const fp = ft && ft.kind === 'pointer' ? U.canon(ft.to) : ft;
      const idx = p.args.indexOf(up.c);
      const pt = fp && fp.kind === 'function' ? fp.params[idx] : null;
      if (!pt) return true;
      const c = U.canon(pt);
      if (c.kind === 'reference' && !qualsOf(c.to).const) return true;
      continue;
    }
    if (p.type === 'IndexExpr' && up.key === 'index') continue;
    return true;
  }
  return false;
}

const isVolatile = (t) => !!(t && U.T.qualsOf(U.canon(t)).volatile);

module.exports = [
  R({
    id: '10.0.1', cat: 'Advisory', dec: true, autosar: 'A7-1-7', sev: 'MINOR', debt: 2,
    name: ['A declaration should not declare more than one variable or member variable', '하나의 선언은 변수나 멤버 변수를 하나만 선언해야 합니다'],
    why: ['Several declarators in one declaration are easy to misread, especially with pointers and references.', '한 선언에 선언자가 여럿이면, 특히 포인터와 참조가 섞일 때 잘못 읽기 쉽습니다.'],
    fix: ['Declare each variable in its own declaration.', '변수마다 별도의 선언을 쓰세요.'],
    check(unit, api) {
      for (const d of U.ix(unit).get('Declaration')) {
        const vs = (d.declarators || []).filter((x) => x.type === 'VarDecl' || x.type === 'FieldDecl');
        if (vs.length > 1) api.report(vs[1], M(`The declaration declares ${vs.length} variables (${vs.map((v) => `'${v.name}'`).join(', ')}).`, `한 선언이 변수 ${vs.length}개(${vs.map((v) => `'${v.name}'`).join(', ')})를 선언합니다.`));
      }
    },
  }),
  R({
    id: '10.1.1', cat: 'Advisory', dec: true, autosar: 'M7-1-2', sev: 'MINOR', debt: 5,
    name: ['The target type of a pointer or lvalue reference parameter should be const-qualified appropriately', '포인터·좌값 참조 매개변수가 가리키는 타입은 알맞게 const 여야 합니다'],
    why: ['A parameter that is only read through should say so; const documents the contract and prevents accidental writes.', '읽기만 하는 매개변수는 그렇게 선언해야 합니다. const 는 계약을 문서화하고 실수로 쓰는 것을 막습니다.'],
    fix: ['Add const to the pointed-to or referenced type.', '가리키거나 참조하는 타입에 const 를 붙이세요.'],
    check(unit, api) {
      for (const fn of U.ix(unit).funcs) {
        if (fn.isDefault || fn.isDeleted || fn.name === 'main' || fn.isOperator) continue;
        if (U.isVirtualDecl(fn) || fn.isOverride || fn.isFinal || (fn.symbol && fn.symbol.isVirtual)) continue;
        if (cf.enclosing(fn, 'TemplateDecl')) continue;
        for (const p of fn.params || []) {
          if (!p.name || !p.symbol) continue;
          const t = U.canon(p.declaredType || p.ctype || U.T.T.unknown);
          let to = null; let isPtr = false;
          if (t.kind === 'pointer') { to = U.canon(t.to); isPtr = true; } else if (t.kind === 'reference' && !t.rvalue) to = U.canon(t.to);
          if (!to || to.const || to.kind === 'function' || to.kind === 'void' || U.unknownT(to) || to.kind === 'pointer') continue;
          if (U.canon(p.declaredType || p.ctype).kind === 'array') continue;
          if (!U.usesIn(fn.body, p.symbol).length) continue;
          if (targetMayBeModified(fn, p.symbol, isPtr)) continue;
          api.report(p, M(`Parameter '${p.name}' is only read through but its target type '${U.tstr(to)}' is not const.`, `매개변수 '${p.name}' 는 읽기만 하는데 대상 타입 '${U.tstr(to)}' 가 const 가 아닙니다.`));
        }
      }
    },
  }),
  R({
    id: '10.1.2', cat: 'Required', dec: true, sev: 'MAJOR', debt: 5,
    name: ['The volatile qualifier shall be used appropriately', 'volatile 한정자는 알맞게 써야 합니다'],
    why: ['volatile on locals, parameters, return types or structured bindings has no meaningful hardware-access semantics and usually signals a misunderstanding.', '지역 변수, 매개변수, 반환 타입, 구조적 바인딩의 volatile 은 하드웨어 접근 의미가 없고 대개 오해에서 비롯됩니다.'],
    fix: ['Remove volatile, or use it only on objects that are really accessed outside the program\'s control.', 'volatile 을 없애거나, 프로그램 밖에서 실제로 접근되는 객체에만 쓰세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      for (const v of x.get('VarDecl')) {
        if (v.symbol && v.symbol.storage === 'automatic' && isVolatile(v.ctype)) api.report(v, M(`Local variable '${v.name}' is declared volatile.`, `지역 변수 '${v.name}' 가 volatile 로 선언되었습니다.`));
      }
      for (const b of x.get('BindingDecl')) {
        const s = b.specs;
        if (s && s.qualifiers && s.qualifiers.includes('volatile')) api.report(b, M('A structured binding is declared volatile.', '구조적 바인딩이 volatile 로 선언되었습니다.'));
      }
      for (const fd of x.get('FunctionDecl')) {
        const ft = fd.ctype && U.canon(fd.ctype);
        if (ft && ft.kind === 'function' && ft.ret && isVolatile(ft.ret) && U.canon(ft.ret).kind !== 'pointer') api.report(fd, M(`The return type of '${fd.name}' is volatile-qualified.`, `'${fd.name}' 의 반환 타입이 volatile 입니다.`));
        for (const p of fd.params || []) {
          const t = p.declaredType || p.ctype;
          if (t && isVolatile(t) && U.canon(t).kind !== 'reference') api.report(p, M(`Parameter '${p.name || '?'}' is declared volatile.`, `매개변수 '${p.name || '?'}' 가 volatile 로 선언되었습니다.`));
        }
      }
    },
  }),
  R({
    id: '10.2.1', cat: 'Required', dec: true, autosar: 'A7-2-2', sev: 'MAJOR', debt: 2,
    name: ['An enumeration shall be defined with an explicit underlying type', '열거형은 명시적인 기반 타입으로 정의해야 합니다'],
    why: ['Without a fixed underlying type the size and signedness of the enumeration are implementation-defined.', '기반 타입을 고정하지 않으면 열거형의 크기와 부호가 구현 정의가 됩니다.'],
    fix: ['Add an underlying type, for example "enum class Mode : std::uint8_t".', '"enum class Mode : std::uint8_t" 처럼 기반 타입을 붙이세요.'],
    check(unit, api) {
      api = U.cppOnlyFix(api); // a header shared with C must stay C
      for (const e of U.ix(unit).get('EnumDecl')) {
        if (e.isDefinition && !e.underlying) api.report(e, M(`Enumeration '${e.name || '<anonymous>'}' has no explicit underlying type.`, `열거형 '${e.name || '<익명>'}' 에 명시적 기반 타입이 없습니다.`));
      }
    },
  }),
  R({
    id: '10.2.2', cat: 'Advisory', dec: true, autosar: 'A7-2-3', sev: 'MINOR', debt: 5,
    name: ['Unscoped enumerations should not be declared', '범위 없는 열거형은 선언하지 않아야 합니다'],
    why: ['Unscoped enumerators leak into the enclosing scope and convert implicitly to integers.', '범위 없는 열거자는 바깥 범위로 새어 나가고 정수로 암시적 변환됩니다.'],
    fix: ['Use "enum class" (or declare the enumeration inside a class).', '"enum class" 를 쓰세요 (또는 클래스 안에 선언하세요).'],
    check(unit, api) {
      api = U.cppOnlyFix(api); // a header shared with C must stay C
      for (const e of U.ix(unit).get('EnumDecl')) {
        if (!e.isDefinition || e.scoped) continue;
        const rd = cf.enclosing(e, ['RecordDecl', 'FunctionDecl']);
        if (rd && rd.type === 'RecordDecl') continue; // class-scope enums are allowed
        api.report(e, M(`Enumeration '${e.name || '<anonymous>'}' is unscoped.`, `열거형 '${e.name || '<익명>'}' 이 범위 없는 열거형입니다.`));
      }
    },
  }),
  R({
    id: '10.2.3', cat: 'Required', dec: true, sev: 'MAJOR', debt: 5,
    name: ['The numeric value of an unscoped enumeration with no fixed underlying type shall not be used', '기반 타입이 고정되지 않은 범위 없는 열거형의 수치 값은 쓰면 안 됩니다'],
    why: ['The underlying type of such an enumeration is implementation-defined, so arithmetic on it or conversion to integers is not portable.', '이런 열거형의 기반 타입은 구현 정의라서 산술이나 정수 변환이 이식성이 없습니다.'],
    fix: ['Fix the underlying type, or only compare enumerators of the same enumeration for equality and switch on them.', '기반 타입을 고정하거나, 같은 열거형끼리 같음 비교와 switch 에만 쓰세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      const rep = (n, en, ko) => api.report(n, M(en, ko));
      for (const b of x.get('BinaryExpr')) {
        const l = looseEnum(U.strip(b.left).ctype);
        const r = looseEnum(U.strip(b.right).ctype);
        if (!l && !r) continue;
        if (['==', '!=', '<', '>', '<=', '>='].includes(b.op) && l && r && (l === r || l.name === r.name)) continue;
        if (['&&', '||', ','].includes(b.op)) continue;
        const e = l || r;
        rep(b, `The numeric value of enumeration '${e.name || '<anonymous>'}' (no fixed underlying type) is used with operator '${b.op}'.`, `기반 타입이 고정되지 않은 열거형 '${e.name || '<익명>'}' 의 수치 값이 '${b.op}' 연산에 쓰입니다.`);
      }
      for (const u of x.get('UnaryExpr')) {
        const e = ['-', '+', '~', '++', '--'].includes(u.op) ? looseEnum(U.strip(u.arg).ctype) : null;
        if (e) rep(u, `The numeric value of enumeration '${e.name || '<anonymous>'}' is used with operator '${u.op}'.`, `열거형 '${e.name || '<익명>'}' 의 수치 값이 '${u.op}' 연산에 쓰입니다.`);
      }
      const toNum = (tt) => { const k = U.numCat(tt, unit.target); return k === 'signed' || k === 'unsigned' || k === 'float' || k === 'char' || k === 'bool'; };
      for (const c of x.get('CastExpr')) {
        const e = c.arg && looseEnum(U.strip(c.arg).ctype);
        if (e && toNum((c.typeName && c.typeName.ctype) || c.ctype)) rep(c, `Enumeration '${e.name || '<anonymous>'}' is converted to '${U.tstr((c.typeName && c.typeName.ctype) || c.ctype)}'.`, `열거형 '${e.name || '<익명>'}' 이 '${U.tstr((c.typeName && c.typeName.ctype) || c.ctype)}' 로 변환됩니다.`);
      }
      for (const v of x.get('VarDecl', 'FieldDecl')) {
        const init = v.init && v.init.type !== 'InitList' && v.init.type !== 'ParenListInit' ? v.init : null;
        const e = init && looseEnum(U.strip(init).ctype);
        if (e && toNum(v.ctype)) rep(v, `Enumeration '${e.name || '<anonymous>'}' initialises the numeric object '${v.name}'.`, `열거형 '${e.name || '<익명>'}' 이 수치 객체 '${v.name}' 를 초기화합니다.`);
      }
      for (const a of x.get('AssignExpr')) {
        const e = a.op === '=' && looseEnum(U.strip(a.right).ctype);
        if (e && toNum(U.strip(a.left).ctype)) rep(a, `Enumeration '${e.name || '<anonymous>'}' is assigned to a numeric object.`, `열거형 '${e.name || '<익명>'}' 이 수치 객체에 대입됩니다.`);
      }
      for (const ix of x.get('IndexExpr')) {
        const e = looseEnum(U.strip(ix.index).ctype);
        if (e) rep(ix, `Enumeration '${e.name || '<anonymous>'}' is used as an array index.`, `열거형 '${e.name || '<익명>'}' 이 배열 첨자로 쓰입니다.`);
      }
    },
  }),
  R({
    id: '10.3.1', cat: 'Advisory', dec: true, autosar: 'M7-3-3', sev: 'MINOR', debt: 5,
    name: ['There should be no unnamed namespaces in header files', '헤더 파일에는 이름 없는 네임스페이스가 없어야 합니다'],
    why: ['Each translation unit that includes the header gets its own copy of the entities, which wastes space and breaks identity.', '헤더를 포함하는 번역 단위마다 개체의 사본이 생겨 공간을 낭비하고 동일성이 깨집니다.'],
    fix: ['Move the unnamed namespace to the source file or give the namespace a name.', '이름 없는 네임스페이스를 소스 파일로 옮기거나 이름을 붙이세요.'],
    check(unit, api) {
      for (const n of U.ix(unit).get('NamespaceDecl')) {
        if (n.anonymous && U.isHeaderFile(n.loc.file)) api.report(n, M(`Header '${n.loc.file}' contains an unnamed namespace.`, `헤더 '${n.loc.file}' 에 이름 없는 네임스페이스가 있습니다.`));
      }
    },
  }),
  R({
    id: '10.4.1', cat: 'Required', dec: true, autosar: 'A7-4-1', sev: 'MAJOR', debt: 10,
    name: ['The asm declaration shall not be used', 'asm 선언은 쓰면 안 됩니다'],
    why: ['Inline assembly is implementation-defined and bypasses the language\'s guarantees.', '인라인 어셈블리는 구현 정의이고 언어의 보장을 우회합니다.'],
    fix: ['Encapsulate assembly in a separate, documented module or use compiler intrinsics.', '어셈블리를 별도의 문서화된 모듈로 감싸거나 컴파일러 내장 함수를 쓰세요.'],
    check(unit, api) {
      for (const a of U.ix(unit).get('AsmDecl', 'AsmStmt')) api.report(a, M('An asm declaration is used.', 'asm 선언을 씁니다.'));
    },
  }),
];
