'use strict';

// SEI CERT C — FLP: floating point.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/expr');
const { M, T, cf } = U;

const fnBase = (name) => name.replace(/[fl]$/, '');

// Domain checks for constant arguments: returns a reason string or null.
const DOMAIN = {
  sqrt: (x) => (x < 0 ? 'a negative argument' : null),
  log: (x) => (x < 0 ? 'a negative argument' : x === 0 ? 'zero (pole error)' : null),
  log10: (x) => DOMAIN.log(x),
  log2: (x) => DOMAIN.log(x),
  log1p: (x) => (x < -1 ? 'an argument below -1' : x === -1 ? '-1 (pole error)' : null),
  acos: (x) => (x < -1 || x > 1 ? 'an argument outside [-1, 1]' : null),
  asin: (x) => DOMAIN.acos(x),
  acosh: (x) => (x < 1 ? 'an argument below 1' : null),
  atanh: (x) => (x < -1 || x > 1 ? 'an argument outside [-1, 1]' : null),
};
const NAMES = new Set();
for (const k of Object.keys(DOMAIN)) { NAMES.add(k); NAMES.add(k + 'f'); NAMES.add(k + 'l'); }
for (const k of ['pow', 'powf', 'powl', 'fmod', 'fmodf', 'fmodl']) NAMES.add(k);
const UNCHECKED = new Set(['sqrt', 'log', 'log10', 'log2', 'acos', 'asin']);

module.exports = [
  rule('FLP30-C', {
    risk: 'LPL', cwe: ['CWE-834'],
    name: ['Do not use floating-point variables as loop counters', '부동소수점 변수를 반복문 카운터로 쓰지 마세요'],
    why: ['Floating-point increments accumulate rounding error, so the number of iterations differs across platforms and may be off by one.', '부동소수점 증분은 반올림 오차가 쌓여 반복 횟수가 환경마다 달라지고 하나씩 어긋날 수 있습니다.'],
    fix: ['Use an integer counter and compute the floating value from it.', '정수 카운터를 쓰고 부동소수점 값은 그로부터 계산하세요.'],
  }, {
    check(unit, api) {
      for (const f of U.nodes(unit, 'ForStmt')) {
        if (!f.inc) continue;
        const mods = cf.findAll(f.inc, (n) => n.type === 'AssignExpr' || (n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--')));
        for (const m of mods) {
          const tgt = m.type === 'AssignExpr' ? m.left : m.arg;
          const s = U.idSym(tgt);
          if (!s || !X.isFloatType(s.type)) continue;
          if (f.cond && !U.refersTo(f.cond, s)) continue;
          api.report(f, M(`Loop counter '${s.name}' has floating type ${U.tstr(s.type)}.`, `반복문 카운터 '${s.name}' 가 부동소수점 형 ${U.tstr(s.type)} 입니다.`));
          break;
        }
      }
    },
  }),

  rule('FLP32-C', {
    risk: 'MPM', cwe: ['CWE-682'], approx: true,
    name: ['Prevent or detect domain and range errors in math functions', '수학 함수의 정의역·치역 오류를 막거나 감지하세요'],
    why: ['sqrt() of a negative number, log() of zero or a negative number and acos() outside [-1, 1] are domain errors that produce NaN or raise errors.', '음수의 sqrt(), 0 이나 음수의 log(), [-1, 1] 밖의 acos() 는 정의역 오류로 NaN 이나 오류를 냅니다.'],
    fix: ['Validate the argument before calling the function (e.g. if (x < 0) handle the error).', '함수 호출 전에 인수를 검사하세요(예: if (x < 0) 오류 처리).'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, NAMES)) {
        const name = U.callName(c);
        const base = fnBase(name);
        if (base === 'pow' || base === 'fmod') {
          const x = X.floatConst(unit, c.args[0]), y = X.floatConst(unit, c.args[1]);
          let why = null;
          if (base === 'pow' && x === 0 && y != null && y < 0) why = 'zero raised to a negative power (pole error)';
          else if (base === 'pow' && x != null && x < 0 && y != null && !Number.isInteger(y)) why = 'a negative base with a non-integer exponent';
          else if (base === 'fmod' && y === 0) why = 'a zero divisor';
          if (why) api.report(c, M(`${name}(${U.src(unit, c.args[0])}, ${U.src(unit, c.args[1])}) is called with ${why}.`, `${name}(${U.src(unit, c.args[0])}, ${U.src(unit, c.args[1])}) 를 정의역 밖의 인수로 호출합니다.`));
          continue;
        }
        const chk = DOMAIN[base];
        if (!chk || !c.args[0]) continue;
        const v = X.floatConst(unit, c.args[0]);
        if (v != null) {
          const why = chk(v);
          if (why) api.report(c, M(`${name}(${U.src(unit, c.args[0])}) is called with ${why}.`, `${name}(${U.src(unit, c.args[0])}) 를 정의역 밖의 인수로 호출합니다.`));
          continue;
        }
        if (!UNCHECKED.has(base)) continue;
        const s = U.idSym(c.args[0]);
        if (!s || (s.kind !== 'parameter' && s.kind !== 'variable')) continue;
        const t = s.type && T.canonical(s.type);
        if (!t || !(T.isFloating(t) || (T.isInteger(t) && T.isSigned(t, unit.target)))) continue;
        const fn = U.enclosingFn(c);
        if (s.kind !== 'parameter') continue;
        if (X.checkedBefore(s, fn, c) || U.inCondition(c)) continue;
        api.report(c, M(`${name}(${s.name}) is called without checking that '${s.name}' is in the domain of ${base}().`, `'${s.name}' 가 ${base}() 의 정의역에 있는지 확인하지 않고 ${name}(${s.name}) 를 호출합니다.`));
      }
    },
  }),

  rule('FLP34-C', {
    risk: 'LUL', cwe: ['CWE-681', 'CWE-197'], approx: true, deep: 'absint:FLOAT_CONVERSION',
    name: ['Ensure that floating-point conversions are within range of the new type', '부동소수점 변환 값이 새 형의 범위 안에 있게 하세요'],
    why: ['Converting a floating value whose integral part does not fit the integer type (or NaN / infinity) is undefined behavior.', '정수 부분이 정수형에 맞지 않는 부동소수점 값(또는 NaN / 무한대)을 변환하면 정의되지 않은 동작입니다.'],
    fix: ['Check the value against the integer type\'s limits before converting.', '변환 전에 값을 정수형의 한계와 비교하세요.'],
  }, {
    check(unit, api) {
      const sites = X.conversions(unit).map((cv) => ({ e: cv.expr, to: cv.to, node: cv.node, what: cv.what, whatKo: cv.whatKo }));
      for (const c of U.nodes(unit, 'CastExpr')) if (c.arg && c.typeName) sites.push({ e: c.arg, to: c.typeName.ctype, node: c, what: 'the cast', whatKo: '캐스트' });
      for (const s of sites) {
        const to = s.to && T.canonical(T.nonRef(s.to));
        const e = U.skip(s.e);
        if (!to || !T.isInteger(to) || T.isBool(to) || !e || !X.isFloatType(e.ctype)) continue;
        const v = X.floatConst(unit, e);
        if (v == null) continue;
        let rg;
        try { rg = T.intRange(to, unit.target); } catch (_) { continue; }
        const ok = Number.isFinite(v) && Math.trunc(v) >= Number(rg.min) && Math.trunc(v) <= Number(rg.max) && !(Math.trunc(v) === Number(rg.max) && BigInt(Math.trunc(v)) > rg.max);
        if (ok) continue;
        api.report(s.node, M(`Floating value ${v} is out of range of ${U.tstr(s.to)} (${rg.min}..${rg.max}) in ${s.what}.`, `${s.whatKo} 에서 부동소수점 값 ${v} 가 ${U.tstr(s.to)} 범위(${rg.min}..${rg.max})를 벗어납니다.`));
      }
    },
  }),

  rule('FLP36-C', {
    risk: 'LUM', cwe: ['CWE-681'], approx: true,
    name: ['Preserve precision when converting integral values to floating-point type', '정수를 부동소수점으로 변환할 때 정밀도를 보존하세요'],
    why: ['A float holds 24 significant bits and a double 53; larger integers lose their low digits when converted.', 'float 은 유효 비트가 24, double 은 53 이라 더 큰 정수는 변환 시 하위 자릿수를 잃습니다.'],
    fix: ['Keep the value in an integer type, use a wider floating type, or check that the value is exactly representable.', '정수형으로 유지하거나 더 넓은 부동소수점 형을 쓰거나 정확히 표현되는지 확인하세요.'],
  }, {
    check(unit, api) {
      const mant = (t) => {
        const c = T.canonical(t);
        if (!c || c.kind !== 'float' || c.complex) return null;
        if (c.name === 'float') return 24;
        if (c.name === 'double') return 53;
        if (c.name === 'long double') return (unit.target.longdouble || 16) >= 12 ? 64 : 53;
        return null;
      };
      for (const cv of X.conversions(unit)) {
        const m = mant(T.nonRef(cv.to));
        const e = U.skip(cv.expr);
        if (!m || !e || e.type === 'CastExpr' || !e.ctype || !X.isIntType(e.ctype)) continue;
        const et = T.canonical(T.nonRef(e.ctype));
        if (T.isBool(et) || et.kind === 'enum') continue;
        const r = X.constOf(unit, e);
        if (r && typeof r.value === 'bigint') {
          let v = r.value < 0n ? -r.value : r.value;
          while (v > 0n && (v & 1n) === 0n) v >>= 1n;
          if (v.toString(2).length > m) api.report(cv.node, M(`Integer constant ${r.value} cannot be represented exactly in ${U.tstr(cv.to)} (${m} significant bits) for ${cv.what}.`, `정수 상수 ${r.value} 는 ${cv.whatKo} 의 형 ${U.tstr(cv.to)}(유효 비트 ${m})에서 정확히 표현되지 않습니다.`));
          continue;
        }
        const bits = T.intBits(et, unit.target);
        const valueBits = T.isSigned(et, unit.target) ? bits - 1 : bits;
        if (bits >= 64 && valueBits > m) {
          api.report(cv.node, M(`${U.tstr(e.ctype)} value '${U.src(unit, e)}' is converted to ${U.tstr(cv.to)} (${m} significant bits) for ${cv.what} and may lose precision.`, `${U.tstr(e.ctype)} 값 '${U.src(unit, e)}' 가 ${cv.whatKo} 에서 ${U.tstr(cv.to)}(유효 비트 ${m})로 변환되어 정밀도를 잃을 수 있습니다.`));
        }
      }
    },
  }),

  rule('FLP37-C', {
    risk: 'LUL', cwe: ['CWE-1077'],
    name: ['Do not use object representations to compare floating-point values', '부동소수점 값을 객체 표현으로 비교하지 마세요'],
    why: ['memcmp() compares bit patterns: +0.0 and -0.0 compare unequal and NaN payloads compare equal, unlike ==.', 'memcmp() 는 비트 패턴을 비교해 == 와 달리 +0.0 과 -0.0 은 다르고 같은 NaN 은 같다고 나옵니다.'],
    fix: ['Compare the floating members with == (or a tolerance) one by one.', '부동소수점 멤버를 == (또는 허용 오차)로 하나씩 비교하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['memcmp', 'bcmp']))) {
        for (const i of [0, 1]) {
          const a = U.strip(c.args[i]);
          if (!a || !a.ctype) continue;
          let t = T.decay(T.nonRef(a.ctype));
          t = t && t.kind === 'pointer' ? T.canonical(t.to) : null;
          if (!t) continue;
          const rec = t.kind === 'record' ? t : null;
          if (T.isFloating(t) || (rec && X.hasFloat(rec))) {
            api.report(c, M(`${U.callName(c)}() compares the representation of '${U.src(unit, a)}', which ${rec ? 'contains' : 'is'} floating-point data.`, `${U.callName(c)}() 가 부동소수점 데이터${rec ? '를 포함한' : '인'} '${U.src(unit, a)}' 의 표현을 비교합니다.`));
            break;
          }
        }
      }
    },
  }),
];
