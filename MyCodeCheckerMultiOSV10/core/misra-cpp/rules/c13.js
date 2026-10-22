'use strict';

// MISRA C++:2023 chapters 13 (derived classes) and 14 (member access control).

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const { cf } = U;

const recs = (unit) => U.ix(unit).records.filter((r) => r.ctype).map((r) => ({ rd: r, rec: U.canon(r.ctype) }));
const rname = (rd) => rd.name || '<anonymous>';

function defaultText(unit, p) {
  return p && p.default ? (cf.sourceText(unit, p.default) || '').replace(/\s+/g, '') : null;
}

// Declarations of a function symbol in user code (FunctionDecl nodes).
function fnDecls(sym) {
  return (sym && sym.decls ? sym.decls : []).filter((d) => d.type === 'FunctionDecl' && U.user(d));
}

function isVirtualFnPtrExpr(e) {
  e = U.strip(e);
  if (!e) return false;
  if (e.type === 'UnaryExpr' && e.op === '&') {
    const a = U.strip(e.arg);
    if (a && a.type === 'Identifier' && a.qualifier && a.symbol && a.symbol.kind === 'function') {
      const s = a.symbol;
      if (s.isVirtual) return true;
      return fnDecls(s).some((d) => U.isVirtualDecl(d) || d.isOverride || d.isFinal);
    }
    return false;
  }
  const t = e.ctype ? U.canon(e.ctype) : null;
  if (t && t.kind === 'memberPointer' && U.canon(t.to).kind === 'function') {
    const cls = typeof t.cls === 'object' ? U.canon(t.cls) : null;
    return !cls || cls.kind !== 'record' || U.isPolymorphic(cls);
  }
  return false;
}

module.exports = [
  R({
    id: '13.1.1', cat: 'Advisory', dec: true, autosar: 'M10-1-1', sev: 'MINOR', debt: 10,
    name: ['Classes should not be inherited virtually', '클래스는 가상 상속하지 않아야 합니다'],
    why: ['Virtual inheritance complicates construction order and object layout.', '가상 상속은 생성 순서와 객체 배치를 복잡하게 합니다.'],
    fix: ['Restructure the hierarchy to avoid virtual bases.', '가상 기반 클래스가 없도록 계층을 다시 구성하세요.'],
    check(unit, api) {
      for (const b of U.ix(unit).get('BaseSpecifier')) {
        if (b.virtual) api.report(b, M(`'${b.name}' is inherited virtually.`, `'${b.name}' 를 가상 상속합니다.`));
      }
    },
  }),
  R({
    id: '13.1.2', cat: 'Required', dec: true, autosar: 'M10-1-3', sev: 'MAJOR', debt: 15,
    name: ['An accessible base class shall not be both virtual and non-virtual in the same hierarchy', '같은 계층에서 접근 가능한 기반 클래스가 가상이면서 비가상이면 안 됩니다'],
    why: ['The derived object then contains several copies of the base sub-object, which makes member access ambiguous.', '그러면 파생 객체 안에 기반 부분 객체가 여러 개 생겨 멤버 접근이 모호해집니다.'],
    fix: ['Inherit the base consistently (all virtual or all non-virtual).', '기반 클래스를 일관되게 (모두 가상이나 모두 비가상으로) 상속하세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        for (const [b, e] of U.allBases(rec)) {
          if (e.virtualPaths && e.nonVirtualPaths) api.report(rd.nameLoc ? { ...rd.nameLoc, file: rd.loc.file } : rd, M(`Base '${b.name}' of '${rname(rd)}' is inherited both virtually and non-virtually.`, `'${rname(rd)}' 의 기반 '${b.name}' 를 가상과 비가상으로 모두 상속합니다.`));
        }
      }
    },
  }),
  R({
    id: '13.3.1', cat: 'Required', dec: true, autosar: 'A10-3-1', sev: 'MAJOR', debt: 5,
    name: ['User-declared member functions shall use the virtual, override and final specifiers appropriately', '사용자 선언 멤버 함수는 virtual, override, final 지정자를 알맞게 써야 합니다'],
    why: ['An override written without override/final silently stops overriding when the base signature changes; redundant specifiers obscure intent.', 'override/final 없이 쓴 재정의는 기반 시그니처가 바뀌면 조용히 재정의가 아니게 되고, 중복 지정자는 의도를 흐립니다.'],
    fix: ['Use exactly one of virtual (new virtual function), override or final (overrides).', '새 가상 함수에는 virtual, 재정의에는 override 나 final 중 정확히 하나만 쓰세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        for (const m of U.methods(rec)) {
          const f = m.node;
          if (f.isDestructor || f.isConstructor) continue;
          const virt = U.isVirtualDecl(f);
          const n = (virt ? 1 : 0) + (f.isOverride ? 1 : 0) + (f.isFinal ? 1 : 0);
          if (n > 1) { api.report(f, M(`'${f.name}' combines ${[virt && 'virtual', f.isOverride && 'override', f.isFinal && 'final'].filter(Boolean).join(', ')}.`, `'${f.name}' 가 ${[virt && 'virtual', f.isOverride && 'override', f.isFinal && 'final'].filter(Boolean).join(', ')} 를 함께 씁니다.`)); continue; }
          if (!f.isOverride && !f.isFinal && U.overridden(rec, f)) api.report(f, M(`'${rname(rd)}::${f.name}' overrides a base-class function without override or final.`, `'${rname(rd)}::${f.name}' 가 override 나 final 없이 기반 클래스 함수를 재정의합니다.`));
        }
      }
    },
  }),
  R({
    id: '13.3.2', cat: 'Required', dec: true, autosar: 'M8-3-1', sev: 'MAJOR', debt: 5,
    name: ['Parameters in an overriding virtual function shall not specify different default arguments', '재정의하는 가상 함수의 매개변수는 다른 기본 인자를 지정하면 안 됩니다'],
    why: ['Default arguments are bound statically, so the value used depends on the static type of the call, not on the function that runs.', '기본 인자는 정적으로 결정되므로, 실제 실행되는 함수가 아니라 호출식의 정적 타입에 따라 값이 달라집니다.'],
    fix: ['Repeat the base default argument exactly, or omit it in the override.', '기반의 기본 인자를 똑같이 쓰거나 재정의에서는 생략하세요.'],
    check(unit, api) {
      for (const { rec } of recs(unit)) {
        for (const m of U.methods(rec)) {
          const f = m.node;
          const b = U.overridden(rec, f);
          if (!b) continue;
          (f.params || []).forEach((p, i) => {
            const mine = defaultText(unit, p);
            if (mine === null) return;
            const theirs = defaultText(unit, (b.params || [])[i]);
            if (mine !== theirs) api.report(p, M(`Default argument '${mine}' of '${f.name}' differs from the overridden function's (${theirs === null ? 'none' : `'${theirs}'`}).`, `'${f.name}' 의 기본 인자 '${mine}' 가 재정의된 함수의 것(${theirs === null ? '없음' : `'${theirs}'`})과 다릅니다.`));
          });
        }
      }
    },
  }),
  R({
    id: '13.3.3', cat: 'Required', dec: true, autosar: 'M8-4-2', sev: 'MAJOR', debt: 5,
    name: ['The parameters in all declarations or overrides of a function shall either be unnamed or have identical names', '함수의 모든 선언과 재정의에서 매개변수는 이름이 없거나 같은 이름이어야 합니다'],
    why: ['Different parameter names across declarations suggest swapped arguments and confuse readers.', '선언마다 매개변수 이름이 다르면 인자가 뒤바뀐 것처럼 보이고 독자를 혼란스럽게 합니다.'],
    fix: ['Use the same names in every declaration and override.', '모든 선언과 재정의에서 같은 이름을 쓰세요.'],
    check(unit, api) {
      const cmp = (f, g, what, ko) => {
        (f.params || []).forEach((p, i) => {
          const q = (g.params || [])[i];
          if (p.name && q && q.name && p.name !== q.name) api.report(p, M(`Parameter ${i + 1} of '${f.name}' is named '${p.name}' but '${q.name}' in the ${what} at line ${q.loc.line}.`, `'${f.name}' 의 ${i + 1}번째 매개변수 이름이 '${p.name}' 인데 ${q.loc.line}행의 ${ko}에서는 '${q.name}' 입니다.`));
        });
      };
      const seen = new Set();
      for (const f of U.ix(unit).get('FunctionDecl')) {
        const s = f.symbol;
        if (!s || seen.has(s)) continue;
        seen.add(s);
        const ds = fnDecls(s).filter((d) => d.params && d.params.length === (f.params || []).length);
        for (let i = 1; i < ds.length; i++) cmp(ds[i], ds[0], 'declaration', '선언');
      }
      for (const { rec } of recs(unit)) {
        for (const m of U.methods(rec)) {
          const b = U.overridden(rec, m.node);
          if (b) cmp(m.node, b, 'overridden function', '재정의된 함수');
        }
      }
    },
  }),
  R({
    id: '13.3.4', cat: 'Required', dec: true, autosar: 'A5-10-1', type: 'BUG', sev: 'MAJOR', debt: 5,
    name: ['A comparison of a potentially virtual pointer to member function shall only be with nullptr', '가상일 수 있는 멤버 함수 포인터는 nullptr 와만 비교해야 합니다'],
    why: ['The result of comparing pointers to virtual member functions is unspecified.', '가상 멤버 함수 포인터끼리 비교한 결과는 명시되지 않았습니다.'],
    fix: ['Only compare such pointers with nullptr.', '이런 포인터는 nullptr 와만 비교하세요.'],
    check(unit, api) {
      for (const b of U.ix(unit).get('BinaryExpr')) {
        if (b.op !== '==' && b.op !== '!=') continue;
        const l = U.strip(b.left); const r = U.strip(b.right);
        const isNull = (e) => e && (e.type === 'NullptrLiteral' || (U.constInt(e, unit) && U.constInt(e, unit).value === 0n));
        if ((isVirtualFnPtrExpr(l) && !isNull(r)) || (isVirtualFnPtrExpr(r) && !isNull(l))) api.report(b, M('A pointer to a (potentially) virtual member function is compared with something other than nullptr.', '(가상일 수 있는) 멤버 함수 포인터를 nullptr 가 아닌 값과 비교합니다.'));
      }
    },
  }),
  R({
    id: '14.1.1', cat: 'Advisory', dec: true, autosar: 'M11-0-1', sev: 'MINOR', debt: 10,
    name: ['Non-static data members should be either all private or all public', '비정적 데이터 멤버는 모두 private 이거나 모두 public 이어야 합니다'],
    why: ['Mixing access levels gives a class neither the simplicity of an aggregate nor the protection of an encapsulated type.', '접근 수준을 섞으면 집합체의 단순함도, 캡슐화된 타입의 보호도 얻지 못합니다.'],
    fix: ['Make all data members private (with accessors) or all public (plain aggregate).', '데이터 멤버를 모두 private (접근자 제공) 이나 모두 public (단순 집합체) 으로 만드세요.'],
    check(unit, api) {
      for (const { rd, rec } of recs(unit)) {
        if (rd.tag === 'union') continue;
        const fs = U.fields(rec);
        if (!fs.length) continue;
        const acc = new Set(fs.map((f) => f.access));
        if (acc.size > 1 || acc.has('protected')) {
          const odd = fs.find((f) => f.access === 'protected') || fs.find((f) => f.access !== fs[0].access) || fs[0];
          api.report(odd.node, M(`'${rname(rd)}' mixes ${[...acc].join('/')} data members ('${odd.node.name}' is ${odd.access}).`, `'${rname(rd)}' 가 ${[...acc].join('/')} 데이터 멤버를 섞어 씁니다 ('${odd.node.name}' 는 ${odd.access}).`));
        }
      }
    },
  }),
];
