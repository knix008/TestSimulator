'use strict';

// MISRA C++:2008 chapter 3 — basic concepts; chapter 4 — standard conversions.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');
const S = require('../../lib/stmt');

const { T } = U;

function arraysWithoutSize(unit, api) {
  for (const v of U.get(unit, 'VarDecl', 'FieldDecl')) {
    const c = v.ctype && T.canonical(v.ctype);
    if (!c || c.kind !== 'array' || c.size != null || v.init) continue;
    api.report(v.nameLoc || v, M(`Array '${v.name}' is declared without an explicit size.`, `배열 '${v.name}'를 명시적 크기 없이 선언했습니다.`));
  }
}

const tOf = (e) => (e && e.ctype ? T.canonical(T.nonRef(e.ctype)) : null);
const isBool = (e) => { const c = tOf(e); return !!c && c.kind === 'int' && c.name === 'bool'; };
const isEnum = (e) => { const c = tOf(e); return !!c && c.kind === 'enum' && !c.scoped; };
const isCharW = (e) => { const c = tOf(e); return !!c && c.kind === 'int' && (c.name === 'char' || c.name === 'wchar_t'); };

// Operands of a given kind used with operators outside the allowed set.
function operandUse(unit, api, test, allowedBin, allowedUn, what) {
  const say = (n, op, o) => api.report(n, M(`The ${what[0]} operand '${U.code(unit, o)}' is used with '${op}'.`, `${what[1]} 피연산자 '${U.code(unit, o)}'를 '${op}'와 함께 사용했습니다.`));
  for (const b of U.get(unit, 'BinaryExpr')) {
    if (allowedBin.has(b.op)) continue;
    if (b.op === ',') continue;
    for (const o of [b.left, b.right]) if (test(o)) { say(b, b.op, o); break; }
  }
  for (const a of U.get(unit, 'AssignExpr')) {
    if (a.op === '=') continue;
    for (const o of [a.left, a.right]) if (test(o)) { say(a, a.op, o); break; }
  }
  for (const n of U.get(unit, 'UnaryExpr')) if (!allowedUn.has(n.op) && test(n.arg)) say(n, n.op, n.arg);
}

const ptrT = (t) => { const c = t && T.canonical(T.nonRef(t)); return !!c && (c.kind === 'pointer' || c.kind === 'memberPointer' || c.kind === 'nullptr'); };
const isZeroLit = (e) => { const x = U.strip(e); return !!x && x.type === 'IntegerLiteral' && x.value === 0n; };

// [{ lit, pointer: bool }] for every 0 literal in a pointer / non-pointer context
function zeroContexts(unit) {
  const out = [];
  for (const s of U.C.conversions(unit)) if (isZeroLit(s.src)) out.push({ lit: U.strip(s.src), pointer: ptrT(s.dst) });
  for (const b of U.get(unit, 'BinaryExpr')) {
    if (!['==', '!=', '<', '>', '<=', '>=', '+', '-', '*', '/', '%', '&', '|', '^'].includes(b.op)) continue;
    if (isZeroLit(b.left)) out.push({ lit: U.strip(b.left), pointer: ptrT(b.right && b.right.ctype) });
    if (isZeroLit(b.right)) out.push({ lit: U.strip(b.right), pointer: ptrT(b.left && b.left.ctype) });
  }
  for (const c of U.get(unit, 'ConditionalExpr')) {
    if (!c.consequent) continue;
    if (isZeroLit(c.consequent)) out.push({ lit: U.strip(c.consequent), pointer: ptrT(c.alternate && c.alternate.ctype) });
    if (isZeroLit(c.alternate)) out.push({ lit: U.strip(c.alternate), pointer: ptrT(c.consequent && c.consequent.ctype) });
  }
  return out;
}

module.exports = [
  CPP08({
    id: '3-1-1', cat: 'R', dec: true, cpp2023: '6.2.4',
    name: ['Headers shall be includable in several translation units without breaking the ODR', '헤더는 여러 번역 단위에 포함해도 ODR을 어기지 않아야 합니다'],
    why: ['A non-inline definition with external linkage in a header is defined once per includer.', '헤더의 외부 연결 비인라인 정의는 포함하는 파일마다 한 번씩 정의됩니다.'],
    fix: ['Keep only declarations, inline functions and templates in headers.', '헤더에는 선언, 인라인 함수, 템플릿만 두세요.'],
    reuse: 'misra-cpp:6.2.4',
  }),
  CPP08({
    id: '3-1-2', cat: 'R', dec: true,
    name: ['Functions shall not be declared at block scope', '함수를 블록 범위에서 선언하지 않아야 합니다'],
    why: ['A block-scope function declaration is often a mistaken object definition (most vexing parse).', '블록 범위 함수 선언은 객체 정의를 잘못 쓴 경우(most vexing parse)가 많습니다.'],
    fix: ['Declare the function at namespace scope.', '함수를 네임스페이스 범위에서 선언하세요.'],
    check: S.blockScopeFunctions,
  }),
  CPP08({
    id: '3-1-3', cat: 'R', dec: true, cpp2023: '6.0.2', c2012: '8.11',
    name: ['Array declarations shall state or initialise the size', '배열 선언은 크기를 명시하거나 초기화로 정해야 합니다'],
    why: ['An array of unknown size cannot be checked against its uses.', '크기를 모르는 배열은 사용과 비교해 검사할 수 없습니다.'],
    fix: ['State the size explicitly.', '크기를 명시하세요.'],
    check: arraysWithoutSize,
  }),
  CPP08({
    id: '3-2-1', cat: 'R', dec: true, type: 'BUG', cpp2023: '6.2.2', c2012: '8.4',
    name: ['All declarations of an object or function shall have compatible types', '객체나 함수의 모든 선언은 호환되는 형식이어야 합니다'],
    why: ['Incompatible declarations of one entity are undefined behaviour.', '한 개체의 호환되지 않는 선언은 정의되지 않은 동작입니다.'],
    fix: ['Declare the entity once in a header.', '개체를 헤더에서 한 번 선언하세요.'],
    reuse: 'misra-cpp:6.2.2',
  }),
  CPP08({
    id: '3-2-2', cat: 'R', dec: false, type: 'BUG', cpp2023: '6.2.1',
    name: ['The one definition rule shall not be violated', 'ODR(단일 정의 규칙)을 어기지 않아야 합니다'],
    why: ['Different definitions of one entity in several units are undefined behaviour.', '여러 단위에서 한 개체를 다르게 정의하면 정의되지 않은 동작입니다.'],
    fix: ['Define each entity once, or identically in a shared header.', '각 개체를 한 번만, 또는 공유 헤더에서 동일하게 정의하세요.'],
    reuse: 'misra-cpp:6.2.1',
  }),
  CPP08({
    id: '3-2-3', cat: 'R', dec: true, c2012: '8.5',
    name: ['An entity used in several units shall be declared in one file only', '여러 단위에서 쓰는 개체는 한 파일에서만 선언해야 합니다'],
    why: ['Several declarations of one entity can drift apart.', '한 개체의 여러 선언은 서로 달라질 수 있습니다.'],
    fix: ['Declare it once in a header file.', '헤더 파일에서 한 번만 선언하세요.'],
    reuse: 'misra-c:8.5',
  }),
  CPP08({
    id: '3-2-4', cat: 'R', dec: true, type: 'BUG', c2012: '8.6',
    name: ['An identifier with external linkage shall have exactly one definition', '외부 연결 식별자는 정의가 정확히 하나여야 합니다'],
    why: ['A missing or duplicated definition breaks the program at link time.', '정의가 없거나 중복되면 링크 시 프로그램이 깨집니다.'],
    fix: ['Provide exactly one definition.', '정확히 하나의 정의를 제공하세요.'],
    reuse: 'misra-c:8.6',
  }),
  CPP08({
    id: '3-3-1', cat: 'R', dec: true, cpp2023: '6.5.1',
    name: ['Objects and functions with external linkage shall be declared in a header', '외부 연결 객체와 함수는 헤더에서 선언해야 합니다'],
    why: ['Without a header declaration the users cannot be checked against the definition.', '헤더 선언이 없으면 사용처를 정의와 비교해 검사할 수 없습니다.'],
    fix: ['Declare the entity in a header, or give it internal linkage.', '개체를 헤더에서 선언하거나 내부 연결로 만드세요.'],
    reuse: 'misra-cpp:6.5.1',
  }),
  CPP08({
    id: '3-3-2', cat: 'R', dec: true, c2012: '8.8',
    name: ['Redeclarations of an internal-linkage function shall include static', '내부 연결 함수의 재선언에는 static을 포함해야 합니다'],
    why: ['A redeclaration without static hides the internal linkage.', 'static 없는 재선언은 내부 연결을 숨깁니다.'],
    fix: ['Repeat static on every declaration.', '모든 선언에 static을 반복하세요.'],
    reuse: 'misra-c:8.8',
  }),
  CPP08({
    id: '3-4-1', cat: 'R', dec: true, c2012: '8.9',
    name: ['Objects and types shall be defined in the block that minimises their visibility', '객체와 형식은 가시 범위를 최소화하는 블록에서 정의해야 합니다'],
    why: ['Wider visibility than needed invites accidental use.', '필요 이상의 가시 범위는 실수로 사용될 여지를 줍니다.'],
    fix: ['Move the definition into the only function that uses it.', '정의를 그것을 쓰는 유일한 함수 안으로 옮기세요.'],
    reuse: 'misra-c:8.9',
  }),
  CPP08({
    id: '3-9-1', cat: 'R', dec: true, cpp2023: '6.9.1', c2012: '8.3',
    name: ['Types shall be token-for-token identical in all declarations', '모든 선언에서 형식은 토큰 단위로 동일해야 합니다'],
    why: ['Using different type aliases for one entity hides inconsistencies.', '한 개체에 다른 형식 별칭을 쓰면 불일치가 숨습니다.'],
    fix: ['Spell the types the same way in every declaration.', '모든 선언에서 형식을 같은 방식으로 쓰세요.'],
    reuse: 'misra-cpp:6.9.1',
  }),
  CPP08({
    id: '3-9-2', cat: 'A', dec: true, cpp2023: '6.9.2', c2012: 'dir-4.6',
    name: ['Typedefs showing size and signedness should replace basic numeric types', '기본 숫자 형식 대신 크기와 부호를 나타내는 typedef를 사용해야 합니다'],
    why: ['The size of int, short and long varies between targets.', 'int, short, long의 크기는 대상마다 다릅니다.'],
    fix: ['Use std::int32_t, std::uint16_t and similar types.', 'std::int32_t, std::uint16_t 같은 형식을 사용하세요.'],
    reuse: 'misra-cpp:6.9.2',
  }),
  CPP08({
    id: '3-9-3', cat: 'R', dec: true,
    name: ['The bit representation of floating-point values shall not be used', '부동소수점 값의 비트 표현을 사용하지 않아야 합니다'],
    why: ['The layout of floating-point values is implementation-defined.', '부동소수점 값의 배치는 구현 정의입니다.'],
    fix: ['Use the arithmetic value or <cmath> functions.', '산술 값이나 <cmath> 함수를 사용하세요.'],
    check: S.floatBits,
  }),
  // ---------------------------------------------------------------- chapter 4
  CPP08({
    id: '4-5-1', cat: 'R', dec: true, cpp2023: '7.0.1',
    name: ['bool operands shall only be used with logical, equality, assignment and ?: operators', 'bool 피연산자는 논리, 같음, 대입, ?: 연산자에만 사용해야 합니다'],
    why: ['Arithmetic or ordering on bool values has no clear meaning.', 'bool 값에 대한 산술이나 대소 비교는 의미가 분명하지 않습니다.'],
    fix: ['Keep bool values in logical expressions.', 'bool 값은 논리식에서만 사용하세요.'],
    check(unit, api) { operandUse(unit, api, isBool, new Set(['&&', '||', '==', '!=']), new Set(['!', '&']), ['bool', 'bool']); },
  }),
  CPP08({
    id: '4-5-2', cat: 'R', dec: true, cpp2023: '10.2.3',
    name: ['Enum operands shall only be used with [], =, ==, !=, relational and unary & operators', '열거형 피연산자는 [], =, ==, !=, 관계, 단항 & 연산자에만 사용해야 합니다'],
    why: ['Arithmetic on enumerators can produce values that are not enumerators.', '열거자에 대한 산술은 열거자가 아닌 값을 만들 수 있습니다.'],
    fix: ['Convert explicitly to an integer type before arithmetic.', '산술 전에 정수 형식으로 명시적으로 변환하세요.'],
    check(unit, api) { operandUse(unit, api, isEnum, new Set(['==', '!=', '<', '>', '<=', '>=']), new Set(['&']), ['enum', '열거형']); },
  }),
  CPP08({
    id: '4-5-3', cat: 'R', dec: true, cpp2023: '7.0.3',
    name: ['char and wchar_t operands shall only be used with =, ==, != and unary &', 'char와 wchar_t 피연산자는 =, ==, !=, 단항 &에만 사용해야 합니다'],
    why: ['The numeric values of characters depend on the character set.', '문자의 숫자 값은 문자 집합에 따라 달라집니다.'],
    fix: ['Compare characters only for equality, or use the <cctype>/<locale> facilities.', '문자는 같음만 비교하거나 <cctype>/<locale> 기능을 사용하세요.'],
    check(unit, api) { operandUse(unit, api, isCharW, new Set(['==', '!=']), new Set(['&']), ['character', '문자']); },
  }),
  CPP08({
    id: '4-10-1', cat: 'R', dec: true, cpp2023: '7.11.1',
    name: ['NULL shall not be used as an integer value', 'NULL을 정수 값으로 사용하지 않아야 합니다'],
    why: ['NULL is meant for pointers; as an integer it hides the intent.', 'NULL은 포인터용이며 정수로 쓰면 의도가 숨습니다.'],
    fix: ['Use 0 for integers and NULL only for pointers.', '정수에는 0을, 포인터에는 NULL만 사용하세요.'],
    check(unit, api) {
      for (const z of zeroContexts(unit)) if (!z.pointer && z.lit.loc.macro === 'NULL') api.report(z.lit, M("NULL is used as an integer value.", 'NULL을 정수 값으로 사용했습니다.'));
    },
  }),
  CPP08({
    id: '4-10-2', cat: 'R', dec: true, cpp2023: '7.11.1', c2012: '11.9',
    name: ['Literal zero shall not be used as the null pointer constant', '리터럴 0을 널 포인터 상수로 사용하지 않아야 합니다'],
    why: ['A plain 0 does not show that a pointer is meant.', '그냥 0은 포인터를 뜻한다는 것을 보여 주지 않습니다.'],
    fix: ['Use NULL (or nullptr) for null pointers.', '널 포인터에는 NULL(또는 nullptr)을 사용하세요.'],
    check(unit, api) {
      for (const z of zeroContexts(unit)) if (z.pointer && !z.lit.loc.macro) api.report(z.lit, M('Literal 0 is used as a null pointer constant.', '리터럴 0을 널 포인터 상수로 사용했습니다.'));
    },
  }),
];
