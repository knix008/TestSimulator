'use strict';

// MISRA C:2012 / 2023 chapter 9: initialization.

const U = require('../lib/a-util');
const F = require('../lib/a-flow');
const { cf, meta, msg } = U;

function r91(unit, api) {
  for (const fn of cf.functionsOf(unit)) {
    if (!U.userLoc(fn)) continue;
    for (const { sym, node } of F.readsBeforeSet(unit, fn)) {
      api.report(node, msg(
        `'${sym.name}' may be read before it has been given a value in function '${fn.name}'.`,
        `함수 '${fn.name}'에서 '${sym.name}'에 값이 설정되기 전에 읽힐 수 있습니다.`));
    }
  }
}

// every top-level braced initializer with its declared type
function initializers(unit) {
  const out = [];
  for (const v of U.nodes(unit, 'VarDecl')) if (v.init && v.init.type === 'InitList') out.push({ type: v.ctype, list: v.init, decl: v, name: v.name });
  for (const c of U.nodes(unit, 'CompoundLiteral')) if (c.init && c.init.type === 'InitList') out.push({ type: c.typeName && c.typeName.ctype, list: c.init, decl: null, name: '(compound literal)' });
  return out;
}

function r92(unit, api) {
  const visit = (type, list, name) => {
    if (!type || (U.isZeroInit(unit, list) && U.isAggregate(type))) return;
    for (const e of U.initEntries(type, list)) {
      if (!e.sub) continue;
      if (e.elided) {
        api.report(e.value, msg(
          `Initializer '${U.code(unit, e.value)}' of '${name}' fills sub-object of type '${U.typeStr(e.sub)}' without its own braces.`,
          `'${name}'의 초기화 값 '${U.code(unit, e.value)}'가 '${U.typeStr(e.sub)}' 타입 하위 객체를 중괄호 없이 채웁니다.`));
        return;
      }
      if (e.value.type === 'InitList') visit(e.sub, e.value, name);
    }
  };
  for (const i of initializers(unit)) visit(i.type, i.list, i.name);
}

function r93(unit, api) {
  const visit = (type, list, name) => {
    const c = U.canon(type);
    if (!c || (U.isZeroInit(unit, list) && U.isAggregate(type))) return;
    const ents = U.initEntries(type, list);
    if (ents.some((e) => e.elided)) return;
    if (c.kind === 'array' && c.size != null && !c.vla) {
      if (!(ents.length && ents.every((e) => e.designated))) {
        const covered = new Set(ents.map((e) => e.pos));
        if (covered.size < c.size) {
          api.report(list, msg(
            `Array '${name}' of ${c.size} elements is only partly initialized (${covered.size} given).`,
            `요소 ${c.size}개인 배열 '${name}'가 일부(${covered.size}개)만 초기화되었습니다.`));
        }
      }
    }
    for (const e of ents) if (e.sub && e.value.type === 'InitList') visit(e.sub, e.value, name);
  };
  for (const i of initializers(unit)) visit(i.type, i.list, i.name);
}

function r94(unit, api) {
  const visit = (type, list, name) => {
    if (!type) return;
    const seen = new Set();
    for (const e of U.initEntries(type, list)) {
      if (e.pos != null && seen.has(e.pos) && e.chain <= 1) {
        api.report(e.item, msg(
          `Element ${typeof e.pos === 'number' ? `[${e.pos}]` : `'${e.pos}'`} of '${name}' is initialized more than once.`,
          `'${name}'의 요소 ${typeof e.pos === 'number' ? `[${e.pos}]` : `'${e.pos}'`}가 두 번 이상 초기화됩니다.`));
      }
      if (e.pos != null) seen.add(e.pos);
      if (e.sub && e.value && e.value.type === 'InitList') visit(e.sub, e.value, name);
    }
  };
  for (const i of initializers(unit)) visit(i.type, i.list, i.name);
}

function topDeclarator(d) {
  let x = d;
  for (let g = 0; x && x.inner && x.inner.type !== 'IdentDeclarator' && g < 50; g++) x = x.inner;
  return x;
}

function r95(unit, api) {
  for (const v of U.nodes(unit, 'VarDecl')) {
    if (!v.init || v.init.type !== 'InitList') continue;
    const top = topDeclarator(v.declarator);
    if (!top || top.type !== 'ArrayDeclarator' || top.size || top.star) continue;
    const hasIdx = v.init.items.some((it) => it.type === 'DesignatedInit' && it.designators[0] && it.designators[0].kind === 'index');
    if (!hasIdx) continue;
    api.report(v.nameLoc || v.loc, msg(
      `Array '${v.name}' uses designated initializers but its size is implied (${U.typeStr(v.ctype)}).`,
      `배열 '${v.name}'가 지정 초기화를 쓰면서 크기를 암시적으로 정합니다(${U.typeStr(v.ctype)}).`));
  }
}

function r96(unit, api) {
  for (const l of U.nodes(unit, 'InitList')) {
    const chained = l.items.some((it) => it.type === 'DesignatedInit' && it.designators.length > 1);
    if (!chained) continue;
    const plain = l.items.find((it) => it.type !== 'DesignatedInit');
    if (!plain) continue;
    api.report(plain, msg(
      `Initializer '${U.code(unit, plain)}' has no designator although the list uses chained designators.`,
      `목록이 연쇄 지정자를 쓰는데 초기화 값 '${U.code(unit, plain)}'에는 지정자가 없습니다.`));
  }
}

function r97(unit, api) {
  for (const v of U.nodes(unit, 'VarDecl')) {
    const s = v.symbol;
    if (!s || s.storage !== 'automatic' || v.init || !U.quals(s.type).atomic) continue;
    const uses = [...(s.uses || [])].filter((u) => u.loc).sort((a, b) => a.loc.start - b.loc.start);
    const first = uses[0];
    if (!first) continue;
    const p = cf.parentOf(first);
    const call = p && p.type === 'UnaryExpr' && p.op === '&' ? cf.parentOf(p) : null;
    if (call && call.type === 'CallExpr' && U.callName(call) === 'atomic_init' && call.args[0] === p) continue;
    api.report(first, msg(
      `Atomic object '${s.name}' is accessed before it has been initialized (no initializer or atomic_init).`,
      `atomic 객체 '${s.name}'가 초기화(초기화 값 또는 atomic_init) 전에 접근됩니다.`));
  }
}

module.exports = [
  { meta: meta('9.1', { cat: 'M', type: 'BUG', sev: 'CRITICAL', debt: 10, dec: false, cwe: ['CWE-457'], cert: 'EXP33-C', name: ['Automatic object read before it is set', '자동 객체를 설정 전에 읽음'],
    why: ['An uninitialized automatic object has an indeterminate value; reading it is undefined behaviour.', '초기화하지 않은 자동 객체의 값은 정해지지 않아 읽으면 미정의 동작입니다.'],
    fix: ['Give the object a value on every path before it is read, ideally at its declaration.', '읽기 전에 모든 경로에서 값을 주고, 가능하면 선언에서 초기화하세요.'] }), check: r91 },
  { meta: meta('9.2', { cat: 'R', sev: 'MINOR', debt: 2, dec: true, name: ['Aggregate initializers shall be braced', '집합체 초기화는 중괄호로 묶어야 함'],
    why: ['Relying on brace elision makes it unclear which sub-object each value initializes.', '중괄호 생략에 기대면 각 값이 어느 하위 객체를 초기화하는지 불분명합니다.'],
    fix: ['Put each sub-aggregate initializer in its own braces (or use { 0 }).', '각 하위 집합체 초기화를 별도의 중괄호로 묶거나 { 0 }을 쓰세요.'] }), check: r92 },
  { meta: meta('9.3', { cat: 'R', sev: 'MINOR', debt: 2, dec: true, name: ['Arrays shall not be partially initialized', '배열을 일부만 초기화하지 않아야 함'],
    why: ['A partial list hides whether the missing elements were meant to be zero or were forgotten.', '일부만 쓴 목록은 나머지가 의도적으로 0인지 빠뜨린 것인지 알 수 없게 합니다.'],
    fix: ['Initialize every element, use { 0 }, or use designated initializers only.', '모든 요소를 초기화하거나 { 0 } 또는 지정 초기화만 쓰세요.'] }), check: r93 },
  { meta: meta('9.4', { cat: 'R', type: 'BUG', sev: 'MAJOR', debt: 2, dec: true, name: ['Element initialized more than once', '요소를 두 번 이상 초기화'],
    why: ['When an element is initialized twice the first value is silently discarded, which is usually a mistake.', '요소를 두 번 초기화하면 앞의 값이 조용히 버려지며 대개 실수입니다.'],
    fix: ['Remove the duplicate initializer.', '중복된 초기화 값을 없애세요.'] }), check: r94 },
  { meta: meta('9.5', { cat: 'R', sev: 'MINOR', debt: 2, dec: true, name: ['Designated array initializer with implied size', '크기가 암시된 배열의 지정 초기화'],
    why: ['With designators the array size depends on the largest index, which is easy to get wrong.', '지정자를 쓰면 배열 크기가 가장 큰 인덱스에 따라 정해져 틀리기 쉽습니다.'],
    fix: ['Declare the array size explicitly.', '배열 크기를 명시하세요.'] }), check: r95 },
  { meta: meta('9.6', { cat: 'R', sev: 'MINOR', debt: 2, dec: true, amendment: 'AMD3', name: ['Chained designators mixed with positional initializers', '연쇄 지정자와 위치 기반 초기화의 혼용'],
    why: ['After a chained designator, which sub-object a plain initializer refers to is hard to see.', '연쇄 지정자 뒤의 일반 초기화 값이 어느 하위 객체를 가리키는지 알기 어렵습니다.'],
    fix: ['Give every initializer in the list a designator.', '목록의 모든 초기화 값에 지정자를 붙이세요.'] }), check: r96 },
  { meta: meta('9.7', { cat: 'M', type: 'BUG', sev: 'CRITICAL', debt: 10, dec: false, cwe: ['CWE-665'], amendment: 'AMD4', name: ['Atomic object accessed before initialization', '초기화 전에 접근한 atomic 객체'],
    why: ['Using an uninitialized atomic object is undefined behaviour.', '초기화하지 않은 atomic 객체를 사용하는 것은 미정의 동작입니다.'],
    fix: ['Initialize atomic objects at declaration or with atomic_init before any other access.', 'atomic 객체를 선언에서 초기화하거나 다른 접근 전에 atomic_init을 호출하세요.'] }), check: r97 },
];
