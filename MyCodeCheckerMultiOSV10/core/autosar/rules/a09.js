'use strict';

// AUTOSAR C++14 chapter 9 — classes (member functions, unions, bit-fields)
// and MISRA C++:2008 M9 rules.

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const { cf } = U;

// Member function definitions with their owner class: [{ f, rec }]
function memberFns(unit) {
  return U.memo(unit, 'autosar.memberFns', () => {
    const out = [];
    for (const f of U.fnDefs(unit)) {
      if (!f.body || f.isConstructor || f.isDestructor) continue;
      const rec = U.ownerRecord(unit, f);
      if (rec && rec.kind === 'record' && rec.decl) out.push({ f, rec });
    }
    return out;
  });
}

const isFieldSym = (s) => !!(s && s.kind === 'field');
const fieldAccess = (s) => (s && s.access) || null;

// Field returned by a return expression (m, this->m, &m, &this->m): { sym, address }
function returnedField(e) {
  e = U.strip(e);
  let address = false;
  if (e && e.type === 'UnaryExpr' && e.op === '&') { address = true; e = U.strip(e.arg); }
  if (!e) return null;
  if (e.type === 'Identifier' && isFieldSym(e.symbol)) return { sym: e.symbol, address };
  if (e.type === 'MemberExpr' && U.strip(e.object) && U.strip(e.object).type === 'ThisExpr' && isFieldSym(e.memberSymbol)) return { sym: e.memberSymbol, address };
  return null;
}

const retKind = (f) => {
  const t = f.ctype ? U.canon(f.ctype) : null;
  const r = t && t.kind === 'function' ? U.canon(t.ret) : null;
  if (!r || (r.kind !== 'reference' && r.kind !== 'pointer')) return null;
  return { kind: r.kind, constTarget: !!U.canon(r.to).const };
};

// Use of `this` in a member function body: { usesThis, modifies }
function thisUse(f) {
  return U.memo(f, 'autosar.thisUse', () => {
    let usesThis = false;
    let modifies = false;
    const isMemberRoot = (e) => {
      const r = U.rootIdent(e);
      if (r && r.implicitThis) return true;
      let x = U.strip(e);
      while (x && (x.type === 'MemberExpr' || x.type === 'IndexExpr')) x = U.strip(x.object);
      return !!(x && x.type === 'ThisExpr');
    };
    cf.walk(f.body, (n) => {
      if (n.type === 'RecordDecl') return cf.walk.SKIP;
      if (n.type === 'ThisExpr') {
        usesThis = true;
        const { p, key } = U.upParens(n);
        if (!(p && p.type === 'MemberExpr' && key === 'object')) modifies = true; // this escapes
      }
      if (n.type === 'LambdaExpr' && ((n.captures || []).some((c) => c.kind === 'this') || n.captureDefault)) { usesThis = true; modifies = true; }
      if (n.type === 'Identifier' && n.implicitThis) {
        usesThis = true;
        const s = n.symbol;
        const { p, key } = U.upParens(n);
        if (s && s.kind === 'function') {
          if (p && p.type === 'CallExpr' && key === 'callee') {
            const d = (s.decls || []).find((x) => x.type === 'FunctionDecl');
            if (!(d && U.isConstMethod(d)) && !(s.decls || []).some((x) => U.hasStorage(x, 'static'))) modifies = true;
          } else modifies = true;
        }
      }
      if (n.type === 'AssignExpr' && isMemberRoot(n.left)) modifies = true;
      if (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--' || n.op === '&') && isMemberRoot(n.arg)) modifies = true;
      if (n.type === 'CallExpr') {
        const c = U.strip(n.callee);
        if (c && c.type === 'MemberExpr' && isMemberRoot(c.object)) modifies = true; // member object's method: constness unknown
        for (const a of n.args || []) if (a && a.type !== 'InitList' && isMemberRoot(a) && U.recordOf(a.ctype)) modifies = true;
        for (const a of n.args || []) if (a && a.type !== 'InitList' && isMemberRoot(a) && U.canon(a.ctype || U.T.T.unknown).kind === 'array') modifies = true;
      }
      if (n.type === 'ReturnStmt' && n.arg && returnedField(n.arg)) { const rk = retKind(f); if (rk && !rk.constTarget) modifies = true; }
      if (n.type === 'VarDecl' && n.init && n.ctype && U.canon(n.ctype).kind === 'reference' && !U.canon(U.canon(n.ctype).to).const && isMemberRoot(n.init)) modifies = true;
      return undefined;
    });
    return { usesThis, modifies };
  });
}

module.exports = [
  A({
    id: 'A9-3-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 10, cwe: 'CWE-767',
    name: ['Member functions shall not return non-const raw pointers or references to private or protected data owned by the class', '멤버 함수가 클래스가 소유한 private/protected 데이터의 비 const 원시 포인터나 참조를 반환하면 안 됩니다'],
    why: ['Handing out a modifiable handle to private data breaks encapsulation and the class invariants.', '비공개 데이터를 수정할 수 있는 핸들을 내주면 캡슐화와 클래스 불변식이 깨집니다.'],
    fix: ['Return by value or a const reference, or provide a dedicated modifier function.', '값이나 const 참조로 반환하거나 전용 수정 함수를 제공하세요.'],
    check(unit, api) {
      for (const { f } of memberFns(unit)) {
        const rk = retKind(f);
        if (!rk || rk.constTarget) continue;
        cf.walk(f.body, (n) => {
          if (n.type === 'LambdaExpr' || n.type === 'RecordDecl') return cf.walk.SKIP;
          if (n.type !== 'ReturnStmt' || !n.arg) return undefined;
          const r = returnedField(n.arg);
          if (!r || (rk.kind === 'pointer' && !r.address) || (rk.kind === 'reference' && r.address)) return undefined;
          const acc = fieldAccess(r.sym);
          if (acc === 'private' || acc === 'protected') api.report(n, M(`'${f.name}' returns a non-const ${rk.kind} to the ${acc} member '${r.sym.name}'.`, `'${f.name}' 이(가) ${acc} 멤버 '${r.sym.name}' 의 비 const ${rk.kind === 'pointer' ? '포인터' : '참조'}를 반환합니다.`));
          return undefined;
        });
      }
    },
  }),
  D('A9-5-1', ['12.3.1'], { cat: 'Required', name: ['Unions shall not be used', '공용체(union)는 쓰면 안 됩니다'] }),
  D('A9-6-1', ['12.2.2'], { name: ['Data types used for interfacing with hardware or protocols shall be trivial, standard-layout and with explicit-size bit-fields', '하드웨어나 프로토콜과 맞닿는 데이터 형식은 크기가 명시된 비트 필드를 가진 단순 표준 배치 형식이어야 합니다'] }),
  D('A9-6-2', ['12.2.1'], { cat: 'Required', enf: 'partially automated', name: ['Bit-fields shall be used only when interfacing to hardware or conforming to communication protocols', '비트 필드는 하드웨어 연동이나 통신 규약을 따를 때만 써야 합니다'] }),
  // ------------------------------------------------------- MISRA C++:2008 M9
  A({
    id: 'M9-3-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['const member functions shall not return non-const pointers or references to class data', 'const 멤버 함수가 클래스 데이터의 비 const 포인터나 참조를 반환하면 안 됩니다'],
    why: ['It lets callers modify an object through a function that promises not to modify it.', '수정하지 않겠다고 약속한 함수를 통해 호출자가 객체를 수정할 수 있게 됩니다.'],
    fix: ['Return a pointer or reference to const.', 'const 를 가리키는 포인터나 참조를 반환하세요.'],
    check(unit, api) {
      for (const { f } of memberFns(unit)) {
        if (!U.isConstMethod(f)) continue;
        const rk = retKind(f);
        if (!rk || rk.constTarget) continue;
        cf.walk(f.body, (n) => {
          if (n.type === 'LambdaExpr' || n.type === 'RecordDecl') return cf.walk.SKIP;
          if (n.type === 'ReturnStmt' && n.arg && returnedField(n.arg)) api.report(n, M(`The const member function '${f.name}' returns a non-const ${rk.kind} to class data.`, `const 멤버 함수 '${f.name}' 이(가) 클래스 데이터의 비 const ${rk.kind === 'pointer' ? '포인터' : '참조'}를 반환합니다.`));
          return undefined;
        });
      }
    },
  }),
  A({
    id: 'M9-3-3', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['If a member function can be made static it shall be made static, otherwise if it can be made const it shall be made const', '멤버 함수는 static 으로 만들 수 있으면 static 으로, 아니면 const 로 만들 수 있으면 const 로 해야 합니다'],
    why: ['static and const tell the reader (and the compiler) which functions cannot change the object.', 'static 과 const 는 어떤 함수가 객체를 바꿀 수 없는지 읽는 사람(과 컴파일러)에게 알려 줍니다.'],
    fix: ['Add static (no use of this) or const (no modification of members).', 'static(this 를 쓰지 않음) 이나 const(멤버를 바꾸지 않음) 를 붙이세요.'],
    check(unit, api) {
      for (const { f } of memberFns(unit)) {
        if (f.isOperator || f.isConversion || f.isPure || U.isVirtualDecl(f) || f.isOverride || f.isFinal || U.inTemplate(f)) continue;
        const decls = (f.symbol && f.symbol.decls) || [f];
        if (decls.some((d) => U.hasStorage(d, 'static'))) continue;
        if (decls.some((d) => d.type === 'FunctionDecl' && (U.isVirtualDecl(d) || d.isOverride || d.isFinal))) continue;
        if (!f.body || f.body.type !== 'CompoundStmt' || !f.body.body.length) continue;
        const { usesThis, modifies } = thisUse(f);
        if (!usesThis) api.report(U.at(f), M(`The member function '${f.name}' does not use the object and can be made static.`, `멤버 함수 '${f.name}' 은(는) 객체를 쓰지 않으므로 static 으로 만들 수 있습니다.`));
        else if (!U.isConstMethod(f) && !modifies) api.report(U.at(f), M(`The member function '${f.name}' does not modify the object and can be made const.`, `멤버 함수 '${f.name}' 은(는) 객체를 바꾸지 않으므로 const 로 만들 수 있습니다.`));
      }
    },
  }),
  D('M9-6-4', ['12.2.3'], { cat: 'Required', name: ['Named bit-fields with signed integer type shall have a length of more than one bit', '부호 있는 정수 형식의 이름 있는 비트 필드는 길이가 1비트보다 커야 합니다'] }),
];
