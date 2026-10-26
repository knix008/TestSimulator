'use strict';

// MISRA C++:2008 chapter 5, rules 5-2-x to 5-19-1 — postfix, unary and other expressions.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');
const S = require('../../lib/stmt');
const CP = require('../../lib/cpp');

const { T } = U;
const X = CP.X;

// pointee / referee record of a type
const recOf = (t) => {
  const c = t && T.canonical(t);
  if (!c) return null;
  if (c.kind === 'pointer' || c.kind === 'reference') { const r = T.canonical(c.to); return r && r.kind === 'record' ? r : null; }
  return null;
};
const pointeeOf = (t) => {
  const c = t && T.canonical(t);
  return c && (c.kind === 'pointer') ? T.canonical(c.to) : null;
};

function downcasts(unit, api) {
  for (const c of U.get(unit, 'CastExpr')) {
    if (!c.arg || !c.typeName || (c.kind !== 'static_cast' && c.kind !== 'c-style')) continue;
    const to = recOf(c.typeName.ctype);
    const from = recOf(c.arg.ctype) || (T.canonical(c.arg.ctype || T.T.unknown).kind === 'record' ? T.canonical(c.arg.ctype) : null);
    if (!to || !from || X.sameRec(to, from)) continue;
    if (X.isDerivedFrom(to, from) && U.P.isPolymorphic(from)) {
      api.report(c, M(`'${X.bareName(from)}' is cast down to '${X.bareName(to)}' on a polymorphic type.`, `다형 형식 '${X.bareName(from)}'를 '${X.bareName(to)}'로 하향 캐스트했습니다.`));
    }
  }
}

function unrelatedPointers(unit, api) {
  for (const c of U.get(unit, 'CastExpr')) {
    if (!c.arg || !c.typeName || c.kind === 'dynamic_cast') continue;
    const to = pointeeOf(c.typeName.ctype);
    const from = pointeeOf(T.decay(c.arg.ctype || T.T.unknown));
    if (!to || !from) continue;
    if (to.kind === 'void' || from.kind === 'void' || to.kind === 'function' || from.kind === 'function') continue;
    if (T.isUnknown(to) || T.isUnknown(from)) continue;
    if (T.sameType(to, from, { ignoreQuals: true })) continue;
    if (to.kind === 'record' && from.kind === 'record' && (X.isDerivedFrom(to, from) || X.isDerivedFrom(from, to))) continue;
    api.report(c, M(`A pointer to '${U.tstr(from)}' is converted to a pointer to the unrelated type '${U.tstr(to)}'.`, `'${U.tstr(from)}' 포인터를 관계없는 형식 '${U.tstr(to)}'의 포인터로 변환했습니다.`));
  }
}

const OVERLOAD_RE = /^operator\s*(,|&&|\|\|)$/;
function forbiddenOverloads(unit, api) {
  const seen = new Set();
  for (const f of U.get(unit, 'FunctionDecl')) {
    const m = OVERLOAD_RE.exec(f.name || '');
    if (!m) continue;
    const k = f.symbol || f;
    if (seen.has(k)) continue;
    seen.add(k);
    api.report(f.nameLoc || f, M(`'operator${m[1]}' is overloaded.`, `'operator${m[1]}'를 오버로드했습니다.`));
  }
}

function logicalBool(unit, api) {
  const isBool = (e) => { const c = e && e.ctype && T.canonical(T.nonRef(e.ctype)); return !!c && c.kind === 'int' && c.name === 'bool'; };
  const check = (e, op) => {
    if (!e || isBool(e)) return;
    const c = e.ctype && T.canonical(T.nonRef(e.ctype));
    if (!c || T.isUnknown(c) || c.kind === 'record') return;
    api.report(e, M(`Operand '${U.code(unit, e)}' of '${op}' does not have type bool.`, `'${op}'의 피연산자 '${U.code(unit, e)}'의 형식이 bool이 아닙니다.`));
  };
  for (const b of U.get(unit, 'BinaryExpr')) if (b.op === '&&' || b.op === '||') { check(b.left, b.op); check(b.right, b.op); }
  for (const n of U.get(unit, 'UnaryExpr')) if (n.op === '!') check(n.arg, '!');
}

function sizeofEffects(unit, api) {
  for (const s of U.get(unit, 'SizeofExpr')) {
    if (!s.arg) continue;
    const fx = U.sideEffects(s.arg, unit, { intoSizeof: true });
    if (fx.length) api.report(s, M(`The operand of sizeof '${U.code(unit, s.arg)}' has a side effect that is never evaluated.`, `sizeof의 피연산자 '${U.code(unit, s.arg)}'에 평가되지 않는 부수 효과가 있습니다.`));
  }
}

// operator@ overloaded without operator@= for the same class (or the other way round)
const BINOPS = ['+', '-', '*', '/', '%', '&', '|', '^', '<<', '>>'];
function assignFormEquivalence(unit, api) {
  const byRec = new Map();
  const add = (rec, op, fd) => {
    if (!rec) return;
    const k = rec.decl || rec;
    if (!byRec.has(k)) byRec.set(k, { rec, ops: new Map() });
    byRec.get(k).ops.set(op, fd);
  };
  for (const f of U.get(unit, 'FunctionDecl')) {
    const m = /^operator\s*(.+)$/.exec(f.name || '');
    if (!m) continue;
    const op = m[1].trim();
    const base = op.endsWith('=') ? op.slice(0, -1) : op;
    if (!BINOPS.includes(base) || ['<=', '>=', '=='].includes(op)) continue;
    let rec = CP.ownerOf(unit, f);
    const params = f.params || [];
    if (!rec) {
      if (params.length !== 2) continue;
      rec = X.recordOf(params[0].ctype);
    } else if (params.length !== 1) continue;
    add(rec, op, f);
  }
  for (const { rec, ops } of byRec.values()) {
    for (const op of BINOPS) {
      const a = ops.get(op), b = ops.get(`${op}=`);
      if (!!a === !!b) continue;
      const f = a || b;
      const missing = a ? `${op}=` : op;
      api.report(f.nameLoc || f, M(`'${X.bareName(rec)}' defines '${f.name}' but not 'operator${missing}', so the two forms may not be equivalent.`, `'${X.bareName(rec)}'가 '${f.name}'는 정의하지만 'operator${missing}'는 정의하지 않아 두 형식이 동등하지 않을 수 있습니다.`));
    }
  }
}

module.exports = [
  CPP08({
    id: '5-2-1', cat: 'R', dec: true,
    name: ['Each operand of && and || shall be a postfix expression', '&&와 ||의 각 피연산자는 후위 식이어야 합니다'],
    why: ['Parenthesised operands make the grouping obvious.', '괄호로 묶은 피연산자는 묶음을 분명히 합니다.'],
    fix: ['Parenthesise each operand that is not a postfix expression.', '후위 식이 아닌 피연산자를 괄호로 묶으세요.'],
    check(unit, api) { S.logicalOperands(unit, api, true); },
  }),
  CPP08({
    id: '5-2-2', cat: 'R', dec: true, type: 'BUG', cpp2023: '8.2.1',
    name: ['A virtual base shall only be cast to a derived class with dynamic_cast', '가상 기반 클래스는 dynamic_cast로만 파생 클래스로 캐스트해야 합니다'],
    why: ['Other casts from a virtual base give undefined behaviour.', '가상 기반에서 다른 캐스트를 쓰면 정의되지 않은 동작입니다.'],
    fix: ['Use dynamic_cast.', 'dynamic_cast를 사용하세요.'],
    reuse: 'misra-cpp:8.2.1',
  }),
  CPP08({
    id: '5-2-3', cat: 'A', dec: true,
    name: ['Casts from base to derived should not be used on polymorphic types', '다형 형식에서 기반에서 파생으로의 캐스트를 하지 않아야 합니다'],
    why: ['A downcast bypasses virtual dispatch and may be wrong for the dynamic type.', '하향 캐스트는 가상 디스패치를 우회하며 동적 형식에 맞지 않을 수 있습니다.'],
    fix: ['Use a virtual function instead of the downcast.', '하향 캐스트 대신 가상 함수를 사용하세요.'],
    check: downcasts,
  }),
  CPP08({
    id: '5-2-4', cat: 'R', dec: true, cpp2023: '8.2.2',
    name: ['C-style and functional casts shall not be used', 'C 스타일 캐스트와 함수형 캐스트를 사용하지 않아야 합니다'],
    why: ['These casts can perform any conversion and are hard to find.', '이 캐스트는 어떤 변환이든 할 수 있고 찾기 어렵습니다.'],
    fix: ['Use static_cast, const_cast or reinterpret_cast; (void) casts are allowed.', 'static_cast, const_cast, reinterpret_cast를 사용하세요. (void) 캐스트는 허용됩니다.'],
    reuse: 'misra-cpp:8.2.2',
  }),
  CPP08({
    id: '5-2-5', cat: 'R', dec: true, type: 'BUG', cpp2023: '8.2.3', c2012: '11.8',
    name: ['A cast shall not remove const or volatile', '캐스트로 const나 volatile을 제거하지 않아야 합니다'],
    why: ['Modifying a const object through the result is undefined behaviour.', '결과를 통해 const 객체를 수정하면 정의되지 않은 동작입니다.'],
    fix: ['Keep the qualifiers.', '한정자를 유지하세요.'],
    reuse: 'misra-cpp:8.2.3',
  }),
  CPP08({
    id: '5-2-6', cat: 'R', dec: true, type: 'BUG', cpp2023: '8.2.4', c2012: '11.1',
    name: ['A function pointer shall not be converted to another pointer type', '함수 포인터를 다른 포인터 형식으로 변환하지 않아야 합니다'],
    why: ['Calling through a converted function pointer is undefined behaviour.', '변환된 함수 포인터로 호출하면 정의되지 않은 동작입니다.'],
    fix: ['Keep function pointers in their own type.', '함수 포인터는 원래 형식으로 유지하세요.'],
    reuse: 'misra-cpp:8.2.4',
  }),
  CPP08({
    id: '5-2-7', cat: 'R', dec: true, c2012: '11.3', cwe: 'CWE-704',
    name: ['A pointer shall not be converted to an unrelated pointer type', '포인터를 관계없는 포인터 형식으로 변환하지 않아야 합니다'],
    why: ['Accessing an object through an unrelated type breaks aliasing and alignment rules.', '관계없는 형식으로 객체에 접근하면 별칭과 정렬 규칙이 깨집니다.'],
    fix: ['Use the original type, or copy the bytes with std::memcpy.', '원래 형식을 쓰거나 std::memcpy로 바이트를 복사하세요.'],
    check: unrelatedPointers,
  }),
  CPP08({
    id: '5-2-8', cat: 'R', dec: true, cpp2023: '8.2.6', c2012: '11.5',
    name: ['Integers and void pointers shall not be converted to object pointers', '정수와 void 포인터를 객체 포인터로 변환하지 않아야 합니다'],
    why: ['The resulting pointer may be misaligned or invalid.', '결과 포인터가 정렬이 어긋나거나 유효하지 않을 수 있습니다.'],
    fix: ['Keep the object pointer type throughout.', '객체 포인터 형식을 끝까지 유지하세요.'],
    reuse: 'misra-cpp:8.2.6',
  }),
  CPP08({
    id: '5-2-9', cat: 'A', dec: true, cpp2023: '8.2.7', c2012: '11.4',
    name: ['A cast should not convert a pointer to an integral type', '캐스트로 포인터를 정수 형식으로 변환하지 않아야 합니다'],
    why: ['The value depends on the pointer size and address layout.', '값이 포인터 크기와 주소 배치에 따라 달라집니다.'],
    fix: ['Avoid the conversion or isolate it in documented low-level code.', '변환을 피하거나 문서화된 저수준 코드에 격리하세요.'],
    reuse: 'misra-cpp:8.2.7',
  }),
  CPP08({
    id: '5-2-10', cat: 'A', dec: true, c2012: '13.3',
    name: ['++ and -- should not be mixed with other operators', '++와 --를 다른 연산자와 섞지 않아야 합니다'],
    why: ['Increments inside larger expressions hide their side effects.', '큰 식 안의 증감은 부수 효과를 숨깁니다.'],
    fix: ['Put the increment in its own statement.', '증가를 별도의 문으로 쓰세요.'],
    reuse: 'misra-c:13.3',
  }),
  CPP08({
    id: '5-2-11', cat: 'R', dec: true, cpp2023: '16.5.1',
    name: ['The comma, && and || operators shall not be overloaded', '쉼표, &&, || 연산자를 오버로드하지 않아야 합니다'],
    why: ['Overloads lose the built-in sequencing and short-circuit behaviour.', '오버로드는 기본 제공 순서와 단락 평가 동작을 잃습니다.'],
    fix: ['Use a named function instead.', '대신 이름 있는 함수를 사용하세요.'],
    check: forbiddenOverloads,
  }),
  CPP08({
    id: '5-2-12', cat: 'R', dec: true, cpp2023: '7.11.2',
    name: ['An array argument shall not decay to a pointer', '배열 인수가 포인터로 붕괴하면 안 됩니다'],
    why: ['The callee loses the array size.', '호출된 함수는 배열 크기를 잃습니다.'],
    fix: ['Pass the array by reference or pass a container.', '배열을 참조로 전달하거나 컨테이너를 전달하세요.'],
    reuse: 'misra-cpp:7.11.2',
  }),
  CPP08({
    id: '5-3-1', cat: 'R', dec: true, cpp2023: '7.0.2', c2012: '10.1',
    name: ['Operands of !, && and || shall have type bool', '!, &&, ||의 피연산자는 bool 형식이어야 합니다'],
    why: ['Implicit conversion to bool hides the comparison being made.', 'bool로의 암시적 변환은 어떤 비교를 하는지 숨깁니다.'],
    fix: ['Compare explicitly, for example (p != NULL).', '명시적으로 비교하세요. 예: (p != NULL).'],
    check: logicalBool,
  }),
  CPP08({
    id: '5-3-2', cat: 'R', dec: true, cpp2023: '8.3.1', c2012: '10.1',
    name: ['Unary minus shall not be applied to unsigned expressions', '부호 없는 식에 단항 마이너스를 적용하지 않아야 합니다'],
    why: ['Negating an unsigned value wraps around.', '부호 없는 값을 음수화하면 순환합니다.'],
    fix: ['Convert to a signed type first.', '먼저 부호 있는 형식으로 변환하세요.'],
    check: S.unaryMinusUnsigned,
  }),
  CPP08({
    id: '5-3-3', cat: 'R', dec: true, cpp2023: '16.5.2',
    name: ['The unary & operator shall not be overloaded', '단항 & 연산자를 오버로드하지 않아야 합니다'],
    why: ['Taking the address of an incomplete type whose & is overloaded is undefined.', '&가 오버로드된 불완전 형식의 주소를 얻는 것은 정의되지 않습니다.'],
    fix: ['Remove the overload.', '오버로드를 없애세요.'],
    reuse: 'misra-cpp:16.5.2',
  }),
  CPP08({
    id: '5-3-4', cat: 'R', dec: true, c2012: '13.6',
    name: ['The operand of sizeof shall not have side effects', 'sizeof의 피연산자에 부수 효과가 없어야 합니다'],
    why: ['The operand is not evaluated, so the side effect never happens.', '피연산자가 평가되지 않으므로 부수 효과가 일어나지 않습니다.'],
    fix: ['Move the side effect out of sizeof.', '부수 효과를 sizeof 밖으로 옮기세요.'],
    check: sizeofEffects,
  }),
  CPP08({
    id: '5-8-1', cat: 'R', dec: true, type: 'BUG', c2012: '12.2', cwe: 'CWE-1335',
    name: ['The shift amount shall be less than the width of the left operand', '이동 크기는 왼쪽 피연산자의 폭보다 작아야 합니다'],
    why: ['Shifting by a negative amount or by the width or more is undefined.', '음수나 폭 이상의 크기로 이동하면 정의되지 않습니다.'],
    fix: ['Keep the shift amount in range.', '이동 크기를 범위 안에 두세요.'],
    check: S.shiftRange,
  }),
  CPP08({
    id: '5-14-1', cat: 'R', dec: false, cpp2023: '8.14.1', c2012: '13.5',
    name: ['The right operand of && or || shall have no side effects', '&& 또는 ||의 오른쪽 피연산자에 부수 효과가 없어야 합니다'],
    why: ['The right operand is evaluated only conditionally.', '오른쪽 피연산자는 조건에 따라서만 평가됩니다.'],
    fix: ['Evaluate the side effect in a separate statement.', '부수 효과를 별도의 문에서 평가하세요.'],
    reuse: 'misra-cpp:8.14.1',
  }),
  CPP08({
    id: '5-17-1', cat: 'R', dec: false,
    name: ['A binary operator and its assignment form shall be equivalent', '이항 연산자와 그 대입 형식은 동등해야 합니다'],
    why: ['Users expect a = a + b and a += b to do the same thing.', '사용자는 a = a + b와 a += b가 같은 일을 한다고 기대합니다.'],
    fix: ['Provide both forms and implement one in terms of the other.', '두 형식을 모두 제공하고 하나를 다른 하나로 구현하세요.'],
    check: assignFormEquivalence,
  }),
  CPP08({
    id: '5-18-1', cat: 'R', dec: true, cpp2023: '8.19.1', c2012: '12.3',
    name: ['The comma operator shall not be used', '쉼표 연산자를 사용하지 않아야 합니다'],
    why: ['The comma operator makes code harder to read.', '쉼표 연산자는 코드를 읽기 어렵게 합니다.'],
    fix: ['Write separate statements.', '별도의 문으로 쓰세요.'],
    reuse: 'misra-cpp:8.19.1',
  }),
  CPP08({
    id: '5-19-1', cat: 'A', dec: true, cpp2023: '8.20.1', c2012: '12.4',
    name: ['Constant unsigned expressions should not wrap around', '상수 부호 없는 식이 순환하지 않아야 합니다'],
    why: ['A wrapping constant expression is usually a mistake.', '순환하는 상수 식은 대개 실수입니다.'],
    fix: ['Rewrite the constant so it stays in range.', '범위 안에 머물도록 상수를 다시 쓰세요.'],
    reuse: 'misra-cpp:8.20.1',
  }),
];
