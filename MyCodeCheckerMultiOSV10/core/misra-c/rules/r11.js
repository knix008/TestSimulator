'use strict';

// MISRA C:2012 / 2023 chapter 11: pointer type conversions.

const U = require('../lib/a-util');
const { T, meta, msg } = U;

function cls(t) {
  const c = U.canon(t);
  if (!c) return null;
  if (c.kind === 'pointer') {
    const p = U.canon(c.to);
    if (!p) return 'objptr';
    if (p.kind === 'function') return 'fnptr';
    if (p.kind === 'void') return 'voidptr';
    if (T.isUnknown(p)) return 'unknownptr';
    if (!T.isComplete(p) && p.kind !== 'array') return 'incptr';
    return 'objptr';
  }
  if (c.kind === 'function') return 'fnptr';
  if (T.isInteger(c)) return 'int';
  if (T.isFloating(c)) return 'float';
  if (c.kind === 'void') return 'void';
  if (T.isUnknown(c)) return null;
  return 'other';
}

// Every pointer-related conversion: explicit casts and implicit assignment-like conversions.
const CONV = new WeakMap();
function conversions(unit) {
  let out = CONV.get(unit);
  if (out) return out;
  out = [];
  for (const c of U.nodes(unit, 'CastExpr')) {
    if (!c.arg || !c.typeName || !c.typeName.ctype) continue;
    // the int result of an undeclared function is not its real type
    if (U.guessedType(unit, c.arg)) continue;
    out.push({ node: c, value: c.arg, from: U.valueType(c.arg, unit), to: c.typeName.ctype, explicit: true });
  }
  for (const s of U.conversionSites(unit)) {
    const from = U.valueType(s.value, unit);
    if (!from || !s.to || U.guessedType(unit, s.value)) continue;
    const fc = cls(from), tc = cls(s.to);
    if (!fc || !tc) continue;
    if (!/ptr/.test(fc) && !/ptr/.test(tc)) continue;
    if (U.canon(s.to).kind === 'array') continue;
    out.push({ node: s.value, value: s.value, from, to: s.to, explicit: false, kind: s.kind });
  }
  CONV.set(unit, out);
  return out;
}

function say(api, unit, cv, en, ko) {
  api.report(cv.node, msg(
    `${cv.explicit ? 'Cast' : 'Implicit conversion'} of '${U.code(unit, cv.value)}' from '${U.typeStr(cv.from)}' to '${U.typeStr(cv.to)}': ${en}.`,
    `'${U.code(unit, cv.value)}'를 '${U.typeStr(cv.from)}'에서 '${U.typeStr(cv.to)}'로 ${cv.explicit ? '캐스트' : '암시적 변환'}합니다: ${ko}.`));
}

function each(unit, fn) {
  for (const cv of conversions(unit)) {
    const fc = cls(cv.from), tc = cls(cv.to);
    if (!fc || !tc) continue;
    fn(cv, fc, tc);
  }
}

function sameTarget(a, b) {
  try { return U.sameType(U.canon(a).to, U.canon(b).to, { ignoreQuals: true }); } catch (_) { return false; }
}

function r111(unit, api) {
  each(unit, (cv, fc, tc) => {
    if (fc !== 'fnptr' && tc !== 'fnptr') return;
    if (tc === 'void') return;
    if (fc === 'fnptr' && tc === 'fnptr') {
      const f = U.canon(cv.from), t = U.canon(cv.to);
      const fFn = f.kind === 'function' ? f : U.canon(f.to);
      const tFn = U.canon(t.to);
      try { if (U.sameType(fFn, tFn)) return; } catch (_) { return; }
      say(api, unit, cv, 'the function pointer types are incompatible', '함수 포인터 타입이 호환되지 않습니다');
      return;
    }
    if (tc === 'fnptr' && U.isNullPtrConst(unit, cv.value)) return;
    say(api, unit, cv, 'function pointers must not be converted to or from other types', '함수 포인터를 다른 타입과 변환하면 안 됩니다');
  });
}

function r112(unit, api) {
  each(unit, (cv, fc, tc) => {
    if (fc !== 'incptr' && tc !== 'incptr') return;
    if (tc === 'void') return;
    if (tc === 'incptr' && U.isNullPtrConst(unit, cv.value)) return;
    if (fc === 'incptr' && tc === 'incptr' && sameTarget(cv.from, cv.to)) return;
    say(api, unit, cv, 'a pointer to an incomplete type must not be converted', '불완전 타입 포인터를 변환하면 안 됩니다');
  });
}

function r113(unit, api) {
  each(unit, (cv, fc, tc) => {
    if (fc !== 'objptr' || tc !== 'objptr') return;
    if (sameTarget(cv.from, cv.to)) return;
    const tp = U.canon(U.pointee(cv.to));
    if (tp && tp.kind === 'int' && (tp.name === 'char' || tp.name === 'signed char' || tp.name === 'unsigned char')) return;
    say(api, unit, cv, 'the pointed-to object types differ', '가리키는 객체 타입이 다릅니다');
  });
}

function r114(unit, api) {
  each(unit, (cv, fc, tc) => {
    const ptrSide = fc === 'objptr' || tc === 'objptr';
    const intSide = fc === 'int' || tc === 'int';
    if (!ptrSide || !intSide) return;
    if (tc === 'objptr' && U.isNullPtrConst(unit, cv.value)) return;
    say(api, unit, cv, 'object pointers and integers should not be converted into each other', '객체 포인터와 정수를 서로 변환하지 않아야 합니다');
  });
}

function r115(unit, api) {
  each(unit, (cv, fc, tc) => {
    if (fc !== 'voidptr' || tc !== 'objptr') return;
    if (U.isNullPtrConst(unit, cv.value)) return;
    say(api, unit, cv, 'a pointer to void should not become a pointer to an object', 'void 포인터를 객체 포인터로 바꾸지 않아야 합니다');
  });
}

function r116(unit, api) {
  each(unit, (cv, fc, tc) => {
    const v = fc === 'voidptr' || tc === 'voidptr';
    const a = fc === 'int' || fc === 'float' || tc === 'int' || tc === 'float';
    if (!v || !a) return;
    if (tc === 'voidptr' && U.isIntZero(unit, cv.value)) return;
    say(api, unit, cv, 'a pointer to void must not be converted to or from an arithmetic type', 'void 포인터를 산술 타입과 변환하면 안 됩니다');
  });
}

function r117(unit, api) {
  each(unit, (cv, fc, tc) => {
    const p = fc === 'objptr' || tc === 'objptr';
    if (!p) return;
    let cat = null;
    if (fc === 'float' || tc === 'float') cat = 'floating';
    else if (fc === 'int') {
      const c = U.et(unit, api, cv.value).category;
      if (c !== 'signed' && c !== 'unsigned') cat = c;
    } else if (tc === 'int') {
      const c = U.etOfType(unit, api, cv.to).category;
      if (c !== 'signed' && c !== 'unsigned') cat = c;
    }
    if (!cat) return;
    if (tc === 'objptr' && U.isNullPtrConst(unit, cv.value)) return;
    say(api, unit, cv, `object pointers must not be converted to or from a non-integer (${cat}) type`, `객체 포인터를 정수가 아닌(${U.catKo(cat)}) 타입과 변환하면 안 됩니다`);
  });
}

function r118(unit, api) {
  each(unit, (cv, fc, tc) => {
    if (!/ptr/.test(fc) || !/ptr/.test(tc)) return;
    const fp = U.canon(cv.from).kind === 'pointer' ? U.canon(cv.from).to : null;
    const tp = U.pointee(cv.to);
    if (!fp || !tp) return;
    const fq = U.quals(fp), tq = U.quals(tp);
    const lost = ['const', 'volatile', 'atomic'].filter((q) => fq[q] && !tq[q]);
    if (!lost.length) return;
    say(api, unit, cv, `the '${lost.map((q) => (q === 'atomic' ? '_Atomic' : q)).join("', '")}' qualification of the pointed-to type is removed`, `가리키는 타입의 '${lost.map((q) => (q === 'atomic' ? '_Atomic' : q)).join("', '")}' 한정자가 사라집니다`);
  });
}

function zeroNotNull(unit, e) {
  const x = U.skip(e);
  if (!x || !U.isIntZero(unit, x)) return false;
  if (x.loc && x.loc.macro === 'NULL') return false;
  return true;
}

function r119(unit, api) {
  const say9 = (e) => api.report(e, msg(
    `Integer constant '${U.code(unit, e)}' is used as a null pointer; use NULL.`,
    `정수 상수 '${U.code(unit, e)}'를 널 포인터로 사용합니다. NULL을 쓰세요.`));
  for (const s of U.conversionSites(unit)) {
    if (U.isPtr(s.to) && zeroNotNull(unit, s.value)) say9(U.skip(s.value));
  }
  for (const c of U.nodes(unit, 'CastExpr')) {
    if (!c.arg || !c.typeName || !U.isPtr(c.typeName.ctype)) continue;
    const p = U.canon(U.pointee(c.typeName.ctype));
    if (p && p.kind === 'void') continue;
    if (zeroNotNull(unit, c.arg)) say9(U.skip(c.arg));
  }
  for (const b of U.nodes(unit, 'BinaryExpr')) {
    if (b.op !== '==' && b.op !== '!=') continue;
    if (U.isPtr(U.valueType(b.left)) && zeroNotNull(unit, b.right)) say9(U.skip(b.right));
    if (U.isPtr(U.valueType(b.right)) && zeroNotNull(unit, b.left)) say9(U.skip(b.left));
  }
  for (const c of U.nodes(unit, 'ConditionalExpr')) {
    if (!c.consequent) continue;
    if (U.isPtr(U.valueType(c.consequent)) && zeroNotNull(unit, c.alternate)) say9(U.skip(c.alternate));
    if (U.isPtr(U.valueType(c.alternate)) && zeroNotNull(unit, c.consequent)) say9(U.skip(c.consequent));
  }
}

function hasAtomicVoid(t, depth = 0) {
  if (!t || depth > 30) return false;
  if (t.kind === 'void' && t.atomic) return true;
  if (t.kind === 'typedef') return (t.atomic && U.canon(t).kind === 'void') || hasAtomicVoid(t.target, depth + 1);
  if (t.kind === 'pointer' || t.kind === 'reference') return hasAtomicVoid(t.to, depth + 1);
  if (t.kind === 'array') return hasAtomicVoid(t.of, depth + 1);
  if (t.kind === 'function') return hasAtomicVoid(t.ret, depth + 1) || (t.params || []).some((p) => hasAtomicVoid(p, depth + 1));
  return false;
}

function r1110(unit, api) {
  for (const n of U.nodes(unit, 'VarDecl', 'ParamDecl', 'FieldDecl', 'TypeName', 'TypedefDecl', 'FunctionDecl')) {
    const t = n.type === 'ParamDecl' ? n.declaredType || n.ctype : n.ctype;
    if (!hasAtomicVoid(t)) continue;
    api.report(n.nameLoc || n.loc, msg(
      `'${n.name || U.code(unit, n)}' uses the _Atomic qualifier on void ('${U.typeStr(t)}').`,
      `'${n.name || U.code(unit, n)}'에서 void에 _Atomic 한정자를 붙였습니다('${U.typeStr(t)}').`));
  }
}

const B = { cat: 'R', type: 'CODE_SMELL', sev: 'MAJOR', debt: 10, dec: true };
module.exports = [
  { meta: meta('11.1', { ...B, type: 'BUG', sev: 'CRITICAL', cwe: ['CWE-704'], cert: 'EXP37-C', name: ['Function pointers converted to or from other types', '함수 포인터와 다른 타입 간 변환'],
    why: ['Calling a function through a pointer of another type is undefined behaviour.', '다른 타입의 포인터로 함수를 호출하는 것은 미정의 동작입니다.'],
    fix: ['Keep function pointers in their own exact type; use a union or a wrapper instead of casts.', '함수 포인터는 정확한 타입으로 유지하고 캐스트 대신 래퍼를 쓰세요.'] }), check: r111 },
  { meta: meta('11.2', { ...B, type: 'BUG', cwe: ['CWE-704'], name: ['Pointer to incomplete type converted', '불완전 타입 포인터 변환'],
    why: ['Converting pointers to incomplete types can break alignment and defeats the purpose of an opaque type.', '불완전 타입 포인터를 변환하면 정렬이 깨질 수 있고 불투명 타입의 의미가 사라집니다.'],
    fix: ['Use the opaque pointer type only with the functions of its module.', '불투명 포인터는 해당 모듈의 함수와만 사용하세요.'] }), check: r112 },
  { meta: meta('11.3', { ...B, type: 'BUG', cwe: ['CWE-704', 'CWE-843'], cert: 'EXP39-C', name: ['Cast between pointers to different object types', '다른 객체 타입 포인터 간 캐스트'],
    why: ['The resulting pointer may be misaligned, and accessing the object through it breaks the aliasing rules.', '결과 포인터의 정렬이 어긋날 수 있고, 이를 통한 접근은 별칭 규칙을 어깁니다.'],
    fix: ['Use the right type, a union, or memcpy; converting to a character pointer is allowed.', '맞는 타입이나 union, memcpy를 쓰세요. 문자 포인터로의 변환은 허용됩니다.'] }), check: r113 },
  { meta: meta('11.4', { ...B, cat: 'A', sev: 'MINOR', cwe: ['CWE-587'], cert: 'INT36-C', name: ['Conversion between object pointer and integer', '객체 포인터와 정수 간 변환'],
    why: ['The result is implementation-defined and may be misaligned or not representable.', '결과가 구현 정의이며 정렬이 어긋나거나 표현할 수 없을 수 있습니다.'],
    fix: ['Avoid the conversion; when needed for hardware access, isolate and document it.', '변환을 피하고, 하드웨어 접근에 꼭 필요하면 격리해 문서화하세요.'] }), check: r114 },
  { meta: meta('11.5', { ...B, cat: 'A', sev: 'MINOR', cwe: ['CWE-704'], name: ['Conversion from pointer to void into object pointer', 'void 포인터에서 객체 포인터로 변환'],
    why: ['The void pointer may not be suitably aligned for the object type.', 'void 포인터가 객체 타입에 맞게 정렬되어 있지 않을 수 있습니다.'],
    fix: ['Keep the original object type where possible.', '가능하면 원래 객체 타입을 유지하세요.'] }), check: r115 },
  { meta: meta('11.6', { ...B, type: 'BUG', cwe: ['CWE-704'], name: ['Cast between pointer to void and arithmetic type', 'void 포인터와 산술 타입 간 캐스트'],
    why: ['The result is undefined or implementation-defined.', '결과가 미정의이거나 구현 정의입니다.'],
    fix: ['Do not convert void pointers to numbers or back.', 'void 포인터를 숫자로 또는 그 반대로 바꾸지 마세요.'] }), check: r116 },
  { meta: meta('11.7', { ...B, type: 'BUG', cwe: ['CWE-704'], name: ['Cast between object pointer and non-integer arithmetic type', '객체 포인터와 정수가 아닌 산술 타입 간 캐스트'],
    why: ['Converting pointers to Boolean, character, enum or floating values has no defined meaning.', '포인터를 부울·문자·열거·부동소수점 값과 변환하는 것은 정의된 의미가 없습니다.'],
    fix: ['Remove the conversion.', '변환을 없애세요.'] }), check: r117 },
  { meta: meta('11.8', { ...B, type: 'BUG', sev: 'CRITICAL', cwe: ['CWE-704'], cert: 'EXP40-C', name: ['Conversion removes const, volatile or _Atomic from the pointed-to type', '가리키는 타입의 const/volatile/_Atomic 한정자 제거'],
    why: ['Writing to a const object or accessing a volatile object without the qualifier is undefined behaviour.', 'const 객체에 쓰거나 volatile 객체에 한정자 없이 접근하는 것은 미정의 동작입니다.'],
    fix: ['Keep the qualifiers; change the target pointer type instead.', '한정자를 유지하고 대상 포인터 타입을 바꾸세요.'] }), check: r118 },
  { meta: meta('11.9', { ...B, sev: 'MINOR', name: ['Null pointer written as an integer constant', '정수 상수로 쓴 널 포인터'],
    why: ['Using NULL makes it clear that a pointer is meant, not a number.', 'NULL을 쓰면 숫자가 아니라 포인터임이 분명해집니다.'],
    fix: ['Replace the 0 with NULL.', '0을 NULL로 바꾸세요.'] }), check: r119 },
  { meta: meta('11.10', { ...B, type: 'BUG', name: ['_Atomic applied to void', 'void에 _Atomic 적용'], amendment: 'AMD3',
    why: ['An atomic void type is meaningless and not portable.', 'atomic void 타입은 의미가 없고 이식성이 없습니다.'],
    fix: ['Use _Atomic only with object types.', '_Atomic은 객체 타입에만 쓰세요.'] }), check: r1110 },
];
