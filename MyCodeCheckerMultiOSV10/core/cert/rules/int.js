'use strict';

// SEI CERT C — INT: integers.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/expr');
const { M, T, cf } = U;

const ARITH = new Set(['+', '-', '*', '<<']);

// Maximal constant expression nodes (whose parent is not itself folded as an integer expression).
function outermostConst(unit, n) {
  const p = U.parent(n);
  if (!p) return true;
  if (p.type === 'ParenExpr' || p.type === 'BinaryExpr' || p.type === 'UnaryExpr' || p.type === 'CastExpr' || p.type === 'ConditionalExpr') {
    const r = X.constOf(unit, p);
    if (r && (r.overflow || r.wrapped)) return false;
  }
  return true;
}

function inPreprocessorOrStatic(n) {
  return !!cf.enclosing(n, ['StaticAssert', 'EnumConstant', 'ArrayDeclarator', 'CaseStmt']);
}

// Smallest/largest value of a type, as BigInt.
function rangeOf(unit, t) {
  try { return T.intRange(T.canonical(t), unit.target); } catch (_) { return null; }
}

const isUnsignedT = (unit, t) => { const c = t && T.nonRef(t); return !!c && T.isInteger(c) && !T.isBool(c) && T.isUnsigned(c, unit.target); };

module.exports = [
  rule('INT30-C', {
    risk: 'HLH', cwe: ['CWE-190', 'CWE-131'], sec: true, approx: true, deep: 'absint:INTEGER_OVERFLOW', checker: 'INTEGER_OVERFLOW',
    name: ['Ensure that unsigned integer operations do not wrap', '부호 없는 정수 연산이 순환하지 않도록 하세요'],
    why: ['Unsigned arithmetic silently wraps modulo 2^N; a wrapped size passed to an allocation function yields a buffer that is too small.', '부호 없는 산술은 2^N 으로 조용히 순환합니다. 순환된 크기를 할당 함수에 넘기면 버퍼가 너무 작아집니다.'],
    fix: ['Check the operands before the operation (e.g. if (n > SIZE_MAX / size) fail) or use calloc().', '연산 전에 피연산자를 검사하거나(예: if (n > SIZE_MAX / size) 실패) calloc() 을 쓰세요.'],
  }, {
    check(unit, api) {
      for (const b of U.nodes(unit, ['BinaryExpr', 'UnaryExpr'])) {
        if (b.type === 'BinaryExpr' ? !ARITH.has(b.op) : b.op !== '-') continue;
        if (!isUnsignedT(unit, b.ctype)) continue;
        const r = X.constOf(unit, b);
        if (!r || !r.wrapped || !outermostConst(unit, b) || inPreprocessorOrStatic(b)) continue;
        if (b.type === 'UnaryExpr' || (b.op === '-' && X.constOf(unit, b.left) && X.constOf(unit, b.left).value === 0n)) continue; // -1u / 0u - 1 idioms
        api.report(b, M(`Unsigned constant expression '${U.src(unit, b)}' wraps around (result ${r.value}).`, `부호 없는 상수식 '${U.src(unit, b)}' 가 순환합니다(결과 ${r.value}).`));
      }
      for (const c of U.libCalls(unit, new Set(['malloc', 'realloc', 'alloca', 'aligned_alloc']))) {
        const name = U.callName(c);
        const sz = U.strip(c.args[name === 'realloc' || name === 'aligned_alloc' ? 1 : 0]);
        if (!sz || sz.type !== 'BinaryExpr' || sz.op !== '*') continue;
        if (X.constOf(unit, sz)) continue;
        const fn = U.enclosingFn(c);
        const vars = cf.findAll(sz, 'Identifier').filter((i) => i.symbol && (i.symbol.kind === 'variable' || i.symbol.kind === 'parameter') && !X.unevaluated(i, sz));
        if (!vars.length) continue;
        if (vars.some((v) => X.checkedBefore(v.symbol, fn, c))) continue;
        api.report(c, M(`Size '${U.src(unit, sz)}' passed to ${name}() may wrap; '${U.src(unit, U.strip(sz.left) && X.constOf(unit, sz.left) ? sz.right : sz.left)}' is not checked against SIZE_MAX first.`, `${name}() 에 넘긴 크기 '${U.src(unit, sz)}' 가 순환할 수 있습니다. '${U.src(unit, U.strip(sz.left) && X.constOf(unit, sz.left) ? sz.right : sz.left)}' 를 먼저 SIZE_MAX 와 비교하지 않습니다.`));
      }
    },
  }),

  rule('INT31-C', {
    risk: 'HPH', cwe: ['CWE-192', 'CWE-197', 'CWE-681'], sec: true, approx: true, deep: 'absint:INTEGER_OVERFLOW',
    name: ['Ensure that integer conversions do not result in lost or misinterpreted data', '정수 변환으로 데이터가 손실되거나 잘못 해석되지 않게 하세요'],
    why: ['Converting a value that does not fit the destination type truncates it or changes its sign; a negative value passed as size_t becomes huge.', '대상 형에 맞지 않는 값을 변환하면 잘리거나 부호가 바뀝니다. size_t 로 넘긴 음수는 매우 큰 값이 됩니다.'],
    fix: ['Check the range before converting, and use types wide enough for the values involved.', '변환 전에 범위를 검사하고 값에 맞는 충분히 넓은 형을 쓰세요.'],
  }, {
    check(unit, api) {
      for (const cv of X.conversions(unit)) {
        const to = cv.to && T.canonical(T.nonRef(cv.to));
        if (!to || !T.isInteger(to) || T.isBool(to) || to.kind === 'enum') continue;
        const e = U.skip(cv.expr);
        if (!e || e.type === 'CastExpr' || e.type === 'CharLiteral' || !e.ctype || !T.isInteger(T.canonical(e.ctype))) continue;
        const r = X.constOf(unit, e);
        if (!r || typeof r.value !== 'bigint') continue;
        const rg = rangeOf(unit, to);
        if (!rg || (r.value >= rg.min && r.value <= rg.max)) continue;
        if (r.value === -1n && T.isUnsigned(to, unit.target)) continue; // all-bits-set idiom
        api.report(cv.node, M(`Constant ${r.value} does not fit ${U.tstr(cv.to)} (range ${rg.min}..${rg.max}) when assigned to ${cv.what}.`, `상수 ${r.value} 는 ${cv.whatKo} 의 형 ${U.tstr(cv.to)}(범위 ${rg.min}..${rg.max})에 맞지 않습니다.`));
      }
      for (const b of U.nodes(unit, 'BinaryExpr')) {
        if (!['<', '>', '<=', '>=', '==', '!='].includes(b.op)) continue;
        for (const [a, o] of [[b.left, b.right], [b.right, b.left]]) {
          const ac = U.skip(a);
          if (!ac || !ac.ctype || !isUnsignedT(unit, ac.ctype)) continue;
          const pt = T.integerPromote(T.canonical(ac.ctype), unit.target);
          if (!isUnsignedT(unit, pt)) continue;
          const oc = U.skip(o);
          if (!oc || oc.type === 'CastExpr') continue;
          const r = X.constOf(unit, oc);
          if (!r || typeof r.value !== 'bigint' || r.value >= 0n) continue;
          api.report(b, M(`'${U.src(unit, ac)}' is unsigned, so ${r.value} in '${U.src(unit, b)}' is converted to a large unsigned value.`, `'${U.src(unit, ac)}' 가 부호 없는 형이라 '${U.src(unit, b)}' 의 ${r.value} 가 큰 부호 없는 값으로 변환됩니다.`));
          break;
        }
      }
      for (const c of U.nodes(unit, 'CallExpr')) {
        const ft = X.paramTypes(c);
        if (!ft || !ft.params) continue;
        ft.params.forEach((pt, i) => {
          const a = c.args[i];
          if (!a || !pt || !isUnsignedT(unit, pt)) return;
          const s = U.skip(a);
          if (!s || s.type === 'CastExpr') return;
          const r = X.constOf(unit, s);
          if (!r || typeof r.value !== 'bigint' || r.value >= 0n) return;
          api.report(a, M(`Negative constant ${r.value} is passed to parameter ${i + 1} of ${U.callName(c) || 'the function'}(), which is unsigned (${U.tstr(pt)}).`, `음수 상수 ${r.value} 를 ${U.callName(c) || '함수'}() 의 부호 없는(${U.tstr(pt)}) 매개변수 ${i + 1} 에 넘깁니다.`));
        });
      }
    },
  }),

  rule('INT32-C', {
    risk: 'HLH', cwe: ['CWE-190', 'CWE-191', 'CWE-680'], sec: true, approx: true, deep: 'absint:INTEGER_OVERFLOW', checker: 'INTEGER_OVERFLOW',
    name: ['Ensure that operations on signed integers do not result in overflow', '부호 있는 정수 연산이 오버플로하지 않게 하세요'],
    why: ['Signed integer overflow is undefined behavior; compilers assume it never happens and may remove the very checks meant to catch it.', '부호 있는 정수 오버플로는 정의되지 않은 동작입니다. 컴파일러는 이것이 일어나지 않는다고 가정해 검사 코드를 없앨 수 있습니다.'],
    fix: ['Check the operands against INT_MAX / INT_MIN before the operation, or use a wider type.', '연산 전에 피연산자를 INT_MAX / INT_MIN 과 비교하거나 더 넓은 형을 쓰세요.'],
  }, {
    check(unit, api) {
      for (const b of U.nodes(unit, ['BinaryExpr', 'UnaryExpr'])) {
        if (b.type === 'BinaryExpr' ? !['+', '-', '*', '/', '%', '<<'].includes(b.op) : b.op !== '-') continue;
        const t = b.ctype && T.canonical(b.ctype);
        if (!t || !T.isInteger(t) || !T.isSigned(t, unit.target)) continue;
        const r = X.constOf(unit, b);
        if (!r || !r.overflow || !outermostConst(unit, b)) continue;
        api.report(b, M(`Signed constant expression '${U.src(unit, b)}' overflows ${U.tstr(b.ctype)}.`, `부호 있는 상수식 '${U.src(unit, b)}' 가 ${U.tstr(b.ctype)} 범위를 넘칩니다.`));
      }
      const MIN = { abs: 'int', labs: 'long', llabs: 'long long', imaxabs: 'long' };
      for (const c of U.libCalls(unit, new Set(Object.keys(MIN)))) {
        const r = X.constOf(unit, c.args[0]);
        if (!r || typeof r.value !== 'bigint') continue;
        const rg = rangeOf(unit, T.intType(MIN[U.callName(c)]));
        if (rg && r.value === rg.min) api.report(c, M(`${U.callName(c)}(${U.src(unit, c.args[0])}) overflows: the minimum ${MIN[U.callName(c)]} has no positive counterpart.`, `${U.callName(c)}(${U.src(unit, c.args[0])}) 는 오버플로합니다: ${MIN[U.callName(c)]} 의 최솟값은 양수로 표현할 수 없습니다.`));
      }
    },
  }),

  rule('INT33-C', {
    risk: 'LLM', cwe: ['CWE-369'], approx: true, deep: 'absint:DIVIDE_BY_ZERO', checker: 'DIVIDE_BY_ZERO',
    name: ['Ensure that division and remainder operations do not result in divide-by-zero errors', '나눗셈과 나머지 연산에서 0 으로 나누지 않게 하세요'],
    why: ['Integer division or remainder by zero is undefined behavior and traps on most platforms.', '정수를 0 으로 나누거나 나머지를 구하면 정의되지 않은 동작이며 대부분의 환경에서 예외가 납니다.'],
    fix: ['Check the divisor against zero before dividing.', '나누기 전에 제수가 0 인지 검사하세요.'],
  }, {
    check(unit, api) {
      for (const b of U.nodes(unit, ['BinaryExpr', 'AssignExpr'])) {
        const op = b.op;
        if (op !== '/' && op !== '%' && op !== '/=' && op !== '%=') continue;
        const t = b.ctype && T.canonical(T.nonRef(b.ctype));
        if (!t || !T.isInteger(t)) continue;
        const d = U.skip(b.right);
        const r = X.constOf(unit, d);
        if (r && typeof r.value === 'bigint') {
          if (r.value === 0n && !cf.findFirst(d, (n) => n.type === 'SizeofExpr' || n.type === 'AlignofExpr')) api.report(b, M(`'${U.src(unit, b)}' divides by the constant zero.`, `'${U.src(unit, b)}' 가 상수 0 으로 나눕니다.`));
          continue;
        }
        const s = U.idSym(d);
        if (!s || s.kind !== 'parameter') continue;
        const fn = U.enclosingFn(b);
        if (X.checkedBefore(s, fn, b) || U.inCondition(b)) continue;
        // a guard in an enclosing ?: or && is handled by inCondition / checkedBefore
        api.report(b, M(`Divisor '${s.name}' in '${U.src(unit, b)}' is a parameter that is never checked against zero.`, `'${U.src(unit, b)}' 의 제수 '${s.name}' 는 0 인지 검사하지 않은 매개변수입니다.`));
      }
    },
  }),

  rule('INT34-C', {
    risk: 'LUL', cwe: ['CWE-682', 'CWE-758'], approx: true, deep: 'absint:BAD_SHIFT', checker: 'BAD_SHIFT',
    name: ['Do not shift an expression by a negative number of bits or by greater than or equal to the number of bits that exist in the operand', '음수나 피연산자 비트 수 이상으로 시프트하지 마세요'],
    why: ['A shift by a negative amount or by at least the width of the promoted left operand, and a left shift of a negative value, are undefined behavior.', '음수만큼 또는 승격된 왼쪽 피연산자 폭 이상으로 시프트하거나 음수를 왼쪽으로 시프트하면 정의되지 않은 동작입니다.'],
    fix: ['Check the shift amount against the operand width and shift unsigned values.', '시프트 양을 피연산자 폭과 비교하고 부호 없는 값을 시프트하세요.'],
  }, {
    check(unit, api) {
      for (const b of U.nodes(unit, ['BinaryExpr', 'AssignExpr'])) {
        const op = b.op;
        if (op !== '<<' && op !== '>>' && op !== '<<=' && op !== '>>=') continue;
        const lt = b.left && b.left.ctype && T.canonical(T.nonRef(b.left.ctype));
        if (!lt || !T.isInteger(lt) || X.fromImplicit(b.left)) continue;
        const pt = T.integerPromote(lt, unit.target);
        const bits = T.intBits(pt, unit.target);
        const r = X.constOf(unit, b.right);
        if (r && typeof r.value === 'bigint' && (r.value < 0n || r.value >= BigInt(bits))) {
          api.report(b, M(`Shift amount ${r.value} in '${U.src(unit, b)}' is ${r.value < 0n ? 'negative' : `not less than the ${bits}-bit width of ${U.tstr(pt)}`}.`, `'${U.src(unit, b)}' 의 시프트 양 ${r.value} 가 ${r.value < 0n ? '음수입니다' : `${U.tstr(pt)} 의 폭 ${bits} 비트 이상입니다`}.`));
          continue;
        }
        if (op === '<<' || op === '<<=') {
          const l = X.constOf(unit, b.left);
          if (l && typeof l.value === 'bigint' && l.value < 0n) api.report(b, M(`Left shift of the negative value ${l.value} in '${U.src(unit, b)}'.`, `'${U.src(unit, b)}' 에서 음수 ${l.value} 를 왼쪽으로 시프트합니다.`));
        }
      }
    },
  }),

  rule('INT35-C', {
    risk: 'LUM', cwe: ['CWE-190'], approx: true,
    name: ['Use correct integer precisions', '정수의 정밀도를 올바르게 사용하세요'],
    why: ['sizeof(T) * CHAR_BIT counts padding bits too, so it can overstate the precision (number of value bits) of the type used as a shift or range limit.', 'sizeof(T) * CHAR_BIT 는 패딩 비트까지 세어 시프트나 범위 한계로 쓸 형의 정밀도(값 비트 수)를 과대평가할 수 있습니다.'],
    fix: ['Compute the precision from the type\'s maximum value (popcount of UINT_MAX) or use the *_WIDTH macros.', '형의 최댓값으로 정밀도를 계산하거나(UINT_MAX 의 popcount) *_WIDTH 매크로를 쓰세요.'],
  }, {
    check(unit, api) {
      for (const b of U.nodes(unit, 'BinaryExpr')) {
        if (b.op !== '*') continue;
        const [s, o] = U.skip(b.left) && U.skip(b.left).type === 'SizeofExpr' ? [U.skip(b.left), b.right] : [U.skip(b.right), b.left];
        if (!s || s.type !== 'SizeofExpr') continue;
        const oc = U.skip(o);
        const isBits = (oc && oc.loc && oc.loc.macro === 'CHAR_BIT') || /CHAR_BIT/.test(U.src(unit, oc)) || X.constOf(unit, oc) && X.constOf(unit, oc).value === 8n;
        if (!isBits) continue;
        // used as a bit count: shift amount or comparison
        let n = b, p = U.parent(n);
        while (p && (p.type === 'ParenExpr' || (p.type === 'BinaryExpr' && (p.op === '-' || p.op === '+')))) { n = p; p = U.parent(n); }
        const asShift = p && (p.type === 'BinaryExpr' || p.type === 'AssignExpr') && (p.op === '<<' || p.op === '>>' || p.op === '<<=' || p.op === '>>=') && U.pkey(n) === 'right';
        const asCmp = p && p.type === 'BinaryExpr' && ['<', '>', '<=', '>='].includes(p.op);
        if (!asShift && !asCmp) continue;
        api.report(b, M(`'${U.src(unit, b)}' uses the storage size as the number of value bits; padding bits make the precision smaller.`, `'${U.src(unit, b)}' 는 저장 크기를 값 비트 수로 사용합니다. 패딩 비트가 있으면 정밀도가 더 작습니다.`));
      }
    },
  }),

  rule('INT36-C', {
    risk: 'LPH', cwe: ['CWE-587', 'CWE-704'], approx: true,
    name: ['Converting a pointer to integer or integer to pointer', '포인터와 정수 사이의 변환에 주의하세요'],
    why: ['A pointer converted to an integer type narrower than intptr_t loses address bits; an integer converted implicitly to a pointer is implementation-defined and may be misaligned or a trap representation.', 'intptr_t 보다 좁은 정수형으로 바꾼 포인터는 주소 비트를 잃고, 정수를 포인터로 암시적으로 바꾸면 구현 정의이며 정렬이 맞지 않을 수 있습니다.'],
    fix: ['Use intptr_t / uintptr_t for pointer-integer round trips, and make deliberate integer-to-pointer conversions explicit.', '포인터-정수 변환에는 intptr_t / uintptr_t 를 쓰고, 의도적인 정수→포인터 변환은 명시적으로 쓰세요.'],
  }, {
    check(unit, api) {
      const psize = unit.target.pointer || 8;
      for (const c of U.nodes(unit, 'CastExpr')) {
        if (!c.arg || !c.typeName) continue;
        const to = T.canonical(c.typeName.ctype);
        const from = c.arg.ctype && T.decay(T.nonRef(c.arg.ctype));
        if (!to || !from || from.kind !== 'pointer' || !T.isInteger(to) || T.isBool(to)) continue;
        const sz = T.sizeOf(to, unit.target);
        if (sz && sz < psize) api.report(c, M(`Pointer '${U.src(unit, c.arg)}' is converted to ${U.tstr(c.typeName.ctype)} (${sz} bytes), narrower than a pointer (${psize} bytes).`, `포인터 '${U.src(unit, c.arg)}' 를 포인터(${psize} 바이트)보다 좁은 ${U.tstr(c.typeName.ctype)}(${sz} 바이트)로 변환합니다.`));
      }
      for (const cv of X.conversions(unit)) {
        const to = cv.to && T.canonical(T.nonRef(cv.to));
        const e = U.skip(cv.expr);
        if (!to || !e || e.type === 'CastExpr' || !e.ctype) continue;
        const from = T.decay(T.nonRef(e.ctype));
        if (to.kind === 'pointer' && T.isInteger(from)) {
          const r = X.constOf(unit, e);
          if (r && r.value === 0n) continue;
          api.report(cv.node, M(`Integer '${U.src(unit, e)}' is implicitly converted to pointer ${U.tstr(cv.to)} for ${cv.what}.`, `정수 '${U.src(unit, e)}' 가 ${cv.whatKo} 에서 포인터 ${U.tstr(cv.to)} 로 암시적으로 변환됩니다.`));
        } else if (from.kind === 'pointer' && T.isInteger(to) && !T.isBool(to)) {
          api.report(cv.node, M(`Pointer '${U.src(unit, e)}' is implicitly converted to integer ${U.tstr(cv.to)} for ${cv.what}.`, `포인터 '${U.src(unit, e)}' 가 ${cv.whatKo} 에서 정수 ${U.tstr(cv.to)} 로 암시적으로 변환됩니다.`));
        }
      }
    },
  }),

  rule('INT07-C', {
    risk: 'MPM', cwe: ['CWE-704'], approx: true,
    name: ['Use only explicitly signed or unsigned char type for numeric values', '숫자 값에는 signed 또는 unsigned 를 명시한 char 만 쓰세요'],
    why: ['Whether plain char is signed is implementation-defined, so a numeric value such as 200 stored in it may become negative.', '일반 char 의 부호 여부는 구현 정의라서 200 같은 숫자 값을 저장하면 음수가 될 수 있습니다.'],
    fix: ['Declare the variable as signed char or unsigned char (or use int8_t / uint8_t).', '변수를 signed char 나 unsigned char(또는 int8_t / uint8_t)로 선언하세요.'],
  }, {
    check(unit, api) {
      const plainChar = (t) => { const c = t && T.canonical(T.nonRef(t)); return !!c && c.kind === 'int' && c.name === 'char'; };
      for (const cv of X.conversions(unit)) {
        if (!plainChar(cv.to)) continue;
        const e = U.skip(cv.expr);
        if (!e || (e.type !== 'IntegerLiteral' && !(e.type === 'UnaryExpr' && e.op === '-' && U.skip(e.arg).type === 'IntegerLiteral'))) continue;
        if (e.loc.macro) continue;
        const r = X.constOf(unit, e);
        if (!r || r.value === 0n) continue;
        api.report(cv.node, M(`Plain char ${cv.what} holds the numeric value ${r.value}; its signedness is implementation-defined.`, `일반 char 인 ${cv.whatKo} 가 숫자 값 ${r.value} 를 담습니다. 부호 여부는 구현 정의입니다.`));
      }
      for (const b of U.nodes(unit, ['BinaryExpr', 'AssignExpr'])) {
        if (!['*', '/', '%', '*=', '/=', '%='].includes(b.op)) continue;
        for (const o of [b.left, b.right]) {
          const s = U.idSym(o);
          if (s && (s.kind === 'variable' || s.kind === 'parameter') && plainChar(s.type)) {
            api.report(b, M(`Plain char '${s.name}' is used as a number in '${U.src(unit, b)}'; declare it signed char or unsigned char.`, `일반 char '${s.name}' 가 '${U.src(unit, b)}' 에서 숫자로 쓰입니다. signed char 나 unsigned char 로 선언하세요.`));
            break;
          }
        }
      }
    },
  }),
];
