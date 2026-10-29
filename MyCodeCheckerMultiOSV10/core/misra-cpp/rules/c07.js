'use strict';

// MISRA C++:2023 chapter 7 — standard conversions.

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const C = require('../lib/conv');
const { cf } = U;

const cat = (e, unit) => U.numCat(e && U.strip(e) ? U.strip(e).ctype : null, unit.target);
const catT = (t, unit) => U.numCat(t, unit.target);
const tname = (t) => U.tstr(U.nonRef(t));
const src = (unit, e) => U.nodeText(unit, e);

const isNullConst = (e) => {
  e = U.strip(e);
  return !!(e && e.type === 'IntegerLiteral' && e.value === 0n);
};

// Is the constant value of e representable in type t?
function constFits(e, t, unit) {
  const v = U.constInt(e, unit);
  if (!v) return false;
  const c = U.nonRef(t);
  if (c.kind === 'float') return true;
  if (c.kind !== 'int' && c.kind !== 'enum') return false;
  try { return U.T.fitsIn(v.value, c.kind === 'enum' ? c.underlying : c, unit.target); } catch (e2) { return false; }
}

const smallUnsigned = (e, unit) => {
  const t = U.strip(e) && U.strip(e).ctype;
  if (catT(t, unit) !== 'unsigned') return false;
  const s = U.sizeOf(t, unit.target);
  return s !== null && s < (unit.target.int || 4);
};

module.exports = [
  R({
    id: '7.0.1', cat: 'Required', dec: true, autosar: 'M4-5-1', sev: 'MAJOR', debt: 5,
    name: ['There shall be no conversion from type bool', 'bool 타입에서 다른 타입으로 변환하면 안 됩니다'],
    why: ['Treating true/false as numbers hides intent and allows meaningless arithmetic on truth values.', 'true/false 를 숫자로 다루면 의도가 흐려지고 진릿값에 의미 없는 산술을 허용합니다.'],
    fix: ['Use a conditional (b ? 1 : 0) or keep the value as bool.', '조건식(b ? 1 : 0) 을 쓰거나 값을 bool 로 유지하세요.'],
    check(unit, api) {
      for (const b of C.binops(unit)) {
        const lb = cat(b.l, unit) === 'bool';
        const rb = cat(b.r, unit) === 'bool';
        if (!lb && !rb) continue;
        if ((C.EQ_OPS.has(b.op) || C.BIT_OPS.has(b.op)) && lb && rb) continue;
        api.report(b.node, M(`A bool operand is converted by the '${b.op}' operator.`, `'${b.op}' 연산자가 bool 피연산자를 변환합니다.`));
      }
      for (const u of U.ix(unit).get('UnaryExpr')) {
        if (!['-', '+', '~'].includes(u.op) || cat(u.arg, unit) !== 'bool') continue;
        api.report(u, M(`A bool operand is converted by unary '${u.op}'.`, `단항 '${u.op}' 가 bool 피연산자를 변환합니다.`));
      }
      for (const c of C.conversions(unit)) {
        if (cat(c.src, unit) !== 'bool') continue;
        const d = catT(c.dst, unit);
        if (!d || d === 'bool' || d === 'record' || d === 'pointer') continue;
        api.report(c.node, M(`The bool value '${src(unit, c.src)}' is converted to '${tname(c.dst)}'.`, `bool 값 '${src(unit, c.src)}' 가 '${tname(c.dst)}' 로 변환됩니다.`));
      }
    },
  }),
  R({
    id: '7.0.2', cat: 'Required', dec: true, autosar: 'M5-0-13', sev: 'MAJOR', debt: 5,
    name: ['There shall be no conversion to type bool', '다른 타입에서 bool 로 변환하면 안 됩니다'],
    why: ['Implicitly testing a number for non-zero hides what is being checked.', '숫자를 암묵적으로 0 이 아닌지 검사하면 무엇을 확인하는지 드러나지 않습니다.'],
    fix: ['Write the comparison explicitly, for example (n != 0).', '(n != 0) 처럼 비교를 명시하세요.'],
    check(unit, api) {
      for (const { e, ctx } of C.boolContexts(unit)) {
        const c = cat(e, unit);
        if (!c || c === 'bool' || c === 'record' || c === 'pointer') continue;
        if (U.unknownT(U.strip(e).ctype)) continue;
        api.report(e, M(`'${src(unit, e)}' of type '${tname(U.strip(e).ctype)}' is converted to bool in the ${ctx}.`, `${ctx} 에서 '${tname(U.strip(e).ctype)}' 타입의 '${src(unit, e)}' 가 bool 로 변환됩니다.`));
      }
      for (const c of C.conversions(unit)) {
        if (catT(c.dst, unit) !== 'bool') continue;
        const s = cat(c.src, unit);
        if (!s || s === 'bool' || s === 'record') continue;
        api.report(c.node, M(`'${src(unit, c.src)}' is converted to bool.`, `'${src(unit, c.src)}' 가 bool 로 변환됩니다.`));
      }
    },
  }),
  R({
    id: '7.0.3', cat: 'Required', dec: true, autosar: 'M5-0-11', sev: 'MAJOR', debt: 5,
    name: ['The numerical value of a character shall not be used', '문자의 숫자 값을 쓰면 안 됩니다'],
    why: ['The numeric codes of characters depend on the character set, so arithmetic on them is not portable.', '문자의 숫자 코드는 문자 집합에 따라 다르므로 그 값으로 하는 산술은 이식성이 없습니다.'],
    fix: ['Compare characters with characters, and use library facilities (std::from_chars, a lookup table) for conversions.', '문자는 문자끼리 비교하고, 변환에는 라이브러리 기능(std::from_chars, 조회 표) 을 쓰세요.'],
    check(unit, api) {
      for (const b of C.binops(unit)) {
        const lc = cat(b.l, unit) === 'char';
        const rc = cat(b.r, unit) === 'char';
        if (!lc && !rc) continue;
        if ((C.EQ_OPS.has(b.op) || C.REL_OPS.has(b.op)) && lc && rc) continue;
        api.report(b.node, M(`The numerical value of a character is used by '${b.op}'.`, `'${b.op}' 가 문자의 숫자 값을 사용합니다.`));
      }
      for (const c of C.conversions(unit)) {
        const s = cat(c.src, unit);
        const d = catT(c.dst, unit);
        if (!s || !d || s === d) continue;
        if (s === 'char' && (U.isNumericCat(d) || d === 'enum')) api.report(c.node, M(`The character '${src(unit, c.src)}' is converted to the number type '${tname(c.dst)}'.`, `문자 '${src(unit, c.src)}' 가 숫자 타입 '${tname(c.dst)}' 로 변환됩니다.`));
        else if (d === 'char' && U.isNumericCat(s) && !isNullConst(c.src)) api.report(c.node, M(`The number '${src(unit, c.src)}' is converted to the character type '${tname(c.dst)}'.`, `숫자 '${src(unit, c.src)}' 가 문자 타입 '${tname(c.dst)}' 로 변환됩니다.`));
      }
    },
  }),
  R({
    id: '7.0.4', cat: 'Required', dec: true, autosar: 'M5-0-21', sev: 'MAJOR', debt: 5,
    name: ['The operands of bitwise operators and shift operators shall be appropriate', '비트 연산자와 시프트 연산자의 피연산자는 알맞아야 합니다'],
    why: ['Bitwise operations on signed values depend on the representation, and shifting by an out-of-range amount is undefined.', '부호 있는 값의 비트 연산은 표현 방식에 의존하고, 범위를 벗어난 시프트는 정의되지 않습니다.'],
    fix: ['Use unsigned operands, and shift by a constant smaller than the operand width.', '부호 없는 피연산자를 쓰고, 피연산자 폭보다 작은 상수만큼 시프트하세요.'],
    check(unit, api) {
      const okOperand = (e) => {
        const c = cat(e, unit);
        if (c === 'unsigned') return true;
        if (c === 'signed') { const v = U.constInt(e, unit); return !!(v && v.value >= 0n); }
        return false;
      };
      for (const b of C.binops(unit)) {
        if (C.BIT_OPS.has(b.op)) {
          for (const e of [b.l, b.r]) {
            if (!okOperand(e)) { api.report(b.node, M(`The operand '${src(unit, e)}' of '${b.op}' is not of unsigned type.`, `'${b.op}' 의 피연산자 '${src(unit, e)}' 가 부호 없는 타입이 아닙니다.`)); break; }
          }
        } else if (C.SHIFT_OPS.has(b.op)) {
          if (!okOperand(b.l)) { api.report(b.node, M(`The left operand '${src(unit, b.l)}' of '${b.op}' is not of unsigned type.`, `'${b.op}' 의 왼쪽 피연산자 '${src(unit, b.l)}' 가 부호 없는 타입이 아닙니다.`)); continue; }
          const v = U.constInt(b.r, unit);
          const lt = U.strip(b.l).ctype;
          let bits = null;
          try { bits = U.T.intBits(U.T.integerPromote(U.nonRef(lt), unit.target), unit.target); } catch (e) { bits = null; }
          if (v && bits && (v.value < 0n || v.value >= BigInt(bits))) api.report(b.node, M(`The shift amount ${v.value} is outside 0..${bits - 1}.`, `시프트 양 ${v.value} 가 0..${bits - 1} 범위를 벗어납니다.`));
        }
      }
      for (const u of U.ix(unit).get('UnaryExpr')) {
        if (u.op !== '~' || !U.numCat(u.arg && u.arg.ctype, unit.target) || cat(u.arg, unit) === 'record') continue;
        if (!okOperand(u.arg)) api.report(u, M(`The operand '${src(unit, u.arg)}' of '~' is not of unsigned type.`, `'~' 의 피연산자 '${src(unit, u.arg)}' 가 부호 없는 타입이 아닙니다.`));
      }
    },
  }),
  R({
    id: '7.0.5', cat: 'Required', dec: true, autosar: 'M5-0-4', sev: 'MAJOR', debt: 5,
    name: ['Integral promotion and the usual arithmetic conversions shall not change the signedness or the type category of an operand', '정수 승격과 일반 산술 변환이 피연산자의 부호나 타입 범주를 바꾸면 안 됩니다'],
    why: ['Mixing signed and unsigned (or integer and floating) operands silently converts one of them, e.g. -1 becomes a huge unsigned value.', '부호 있는/없는 (또는 정수/부동소수점) 피연산자를 섞으면 한쪽이 조용히 변환되어, 예를 들어 -1 이 아주 큰 부호 없는 값이 됩니다.'],
    fix: ['Cast one operand explicitly so both have the same signedness and category.', '한쪽을 명시적으로 캐스트해 두 피연산자의 부호와 범주를 맞추세요.'],
    check(unit, api) {
      for (const b of C.binops(unit)) {
        if (C.SHIFT_OPS.has(b.op)) continue;
        const l = cat(b.l, unit);
        const r = cat(b.r, unit);
        if (!U.isNumericCat(l) || !U.isNumericCat(r)) continue;
        if (l !== r) {
          const intFloat = (l === 'float') !== (r === 'float');
          const constSide = constFits(b.l, U.strip(b.r).ctype, unit) || constFits(b.r, U.strip(b.l).ctype, unit);
          if (constSide) continue;
          api.report(b.node, M(intFloat
            ? `'${b.op}' mixes integral and floating operands ('${tname(U.strip(b.l).ctype)}' and '${tname(U.strip(b.r).ctype)}').`
            : `'${b.op}' mixes signed and unsigned operands ('${tname(U.strip(b.l).ctype)}' and '${tname(U.strip(b.r).ctype)}').`,
          intFloat ? `'${b.op}' 가 정수와 부동소수점 피연산자를 섞습니다 ('${tname(U.strip(b.l).ctype)}', '${tname(U.strip(b.r).ctype)}').`
            : `'${b.op}' 가 부호 있는/없는 피연산자를 섞습니다 ('${tname(U.strip(b.l).ctype)}', '${tname(U.strip(b.r).ctype)}').`));
        } else if (l === 'unsigned' && !b.compound && smallUnsigned(b.l, unit) && smallUnsigned(b.r, unit) && !C.EQ_OPS.has(b.op) && !C.REL_OPS.has(b.op)) {
          api.report(b.node, M(`Both operands of '${b.op}' are promoted from a small unsigned type to signed int.`, `'${b.op}' 의 두 피연산자가 작은 부호 없는 타입에서 signed int 로 승격됩니다.`));
        }
      }
      for (const c of U.ix(unit).get('ConditionalExpr')) {
        if (!c.consequent || !c.alternate) continue;
        const l = cat(c.consequent, unit);
        const r = cat(c.alternate, unit);
        if (U.isNumericCat(l) && U.isNumericCat(r) && l !== r && !constFits(c.consequent, U.strip(c.alternate).ctype, unit) && !constFits(c.alternate, U.strip(c.consequent).ctype, unit)) {
          api.report(c, M(`The branches of '?:' have different numeric types ('${tname(U.strip(c.consequent).ctype)}' and '${tname(U.strip(c.alternate).ctype)}').`, `'?:' 의 두 갈래가 서로 다른 숫자 타입입니다 ('${tname(U.strip(c.consequent).ctype)}', '${tname(U.strip(c.alternate).ctype)}').`));
        }
      }
    },
  }),
  R({
    id: '7.0.6', cat: 'Required', dec: true, autosar: 'A4-7-1', sev: 'MAJOR', debt: 5,
    name: ['Assignment between numeric types shall be appropriate', '숫자 타입 사이의 대입은 알맞아야 합니다'],
    why: ['Implicit narrowing, signedness changes and integer/floating conversions can lose information silently.', '암묵적인 축소, 부호 변경, 정수/부동소수점 변환은 정보를 조용히 잃을 수 있습니다.'],
    fix: ['Use a type that can hold the value, or convert explicitly with static_cast after checking the range.', '값을 담을 수 있는 타입을 쓰거나, 범위를 확인한 뒤 static_cast 로 명시적으로 변환하세요.'],
    check(unit, api) {
      for (const c of C.conversions(unit)) {
        const s = cat(c.src, unit);
        const d = catT(c.dst, unit);
        if (!U.isNumericCat(s) || !U.isNumericCat(d)) continue;
        if (constFits(c.src, c.dst, unit)) continue;
        const st = U.strip(c.src).ctype;
        const ss = U.sizeOf(st, unit.target);
        const ds = U.sizeOf(c.dst, unit.target);
        let why = null;
        if ((s === 'float') !== (d === 'float')) why = ['changes between integral and floating types', '정수와 부동소수점 타입 사이를 바꿉니다'];
        else if (s !== d) why = ['changes signedness', '부호를 바꿉니다'];
        else if (ss !== null && ds !== null && ds < ss) why = ['narrows the value', '값을 축소합니다'];
        if (!why) continue;
        api.report(c.node, M(`Converting '${src(unit, c.src)}' ('${tname(st)}') to '${tname(c.dst)}' for the ${c.ctx === 'arg' ? c.name : c.ctx === 'return' ? 'return value' : `'${c.name || '?'}'`} ${why[0]}.`, `'${src(unit, c.src)}' ('${tname(st)}') 를 '${tname(c.dst)}' 로 바꾸는 변환이 ${why[1]}.`));
      }
    },
  }),
  R({
    id: '7.11.1', cat: 'Required', dec: true, autosar: 'A4-10-1', sev: 'MAJOR', debt: 2,
    name: ['nullptr shall be the only form of the null-pointer-constant', '널 포인터 상수로는 nullptr 만 써야 합니다'],
    why: ['0 and NULL are integers, which can pick the wrong overload or hide the pointer meaning.', '0 과 NULL 은 정수라서 잘못된 오버로드를 고르거나 포인터라는 뜻을 숨길 수 있습니다.'],
    fix: ['Write nullptr.', 'nullptr 를 쓰세요.'],
    check(unit, api) {
      api = U.cppOnlyFix(api); // a header shared with C must stay C
      const rep = (e) => api.report(e, M(`'${src(unit, e)}' is used as a null pointer constant; use nullptr.`, `'${src(unit, e)}' 를 널 포인터 상수로 씁니다. nullptr 를 쓰세요.`));
      for (const c of C.conversions(unit)) {
        const d = U.canon(U.nonRef(c.dst)).kind;
        if ((d === 'pointer' || d === 'memberPointer') && isNullConst(c.src)) rep(U.strip(c.src));
      }
      for (const b of U.ix(unit).get('BinaryExpr')) {
        if (!C.EQ_OPS.has(b.op)) continue;
        const lp = U.canon(U.nonRef(b.left.ctype || U.T.T.unknown)).kind === 'pointer';
        const rp = U.canon(U.nonRef(b.right.ctype || U.T.T.unknown)).kind === 'pointer';
        if (lp && isNullConst(b.right)) rep(U.strip(b.right));
        if (rp && isNullConst(b.left)) rep(U.strip(b.left));
      }
    },
  }),
  R({
    id: '7.11.2', cat: 'Required', dec: true, autosar: 'M5-2-12', cwe: 'CWE-119', sev: 'MAJOR', debt: 5,
    name: ['An array passed as a function argument shall not decay to a pointer', '함수 인자로 넘기는 배열이 포인터로 붕괴하면 안 됩니다'],
    why: ['Once an array decays, its size is lost and the callee cannot check its bounds.', '배열이 붕괴하면 크기 정보가 사라져 호출된 함수가 범위를 확인할 수 없습니다.'],
    fix: ['Pass std::array, std::span or a reference to the array, or pass the size alongside.', 'std::array, std::span, 배열 참조를 넘기거나 크기를 함께 넘기세요.'],
    check(unit, api) {
      for (const call of U.ix(unit).get('CallExpr')) {
        const ft = C.fnTypeOfCallee(call);
        (call.args || []).forEach((a, i) => {
          const e = U.strip(a);
          // __func__ / __FUNCTION__ are string literals in all but name (the exception for literals applies)
          if (!e || e.type === 'StringLiteral' || (e.type === 'Identifier' && (e.predefined || (e.symbol && e.symbol.predefined))) || !e.ctype || U.canon(e.ctype).kind !== 'array') return;
          const pt = ft && ft.params[i];
          if (pt && U.canon(pt).kind === 'reference') return;
          if (!ft && !(U.callName(call) || {}).name) return;
          // inside a macro argument the source text of the node is the whole macro call
          const name = e.loc && e.loc.macro ? (e.type === 'Identifier' ? e.name : (e.type === 'MemberExpr' ? e.member : null)) : src(unit, e);
          api.report(e, name
            ? M(`The array '${name}' decays to a pointer when passed as argument ${i + 1}.`, `배열 '${name}' 가 ${i + 1}번째 인자로 넘겨지며 포인터로 붕괴합니다.`)
            : M(`An array decays to a pointer when passed as argument ${i + 1}.`, `배열이 ${i + 1}번째 인자로 넘겨지며 포인터로 붕괴합니다.`));
        });
      }
    },
  }),
  R({
    id: '7.11.3', cat: 'Required', dec: true, sev: 'MAJOR', debt: 5,
    name: ['A conversion from function type to pointer-to-function type shall only occur in appropriate contexts', '함수 타입에서 함수 포인터로의 변환은 알맞은 곳에서만 일어나야 합니다'],
    why: ['Using a function name as a value in a test or comparison is almost always a forgotten call.', '조건이나 비교에서 함수 이름을 값으로 쓰는 것은 거의 언제나 호출을 빠뜨린 것입니다.'],
    fix: ['Call the function, or take its address explicitly with & where a pointer is intended.', '함수를 호출하거나, 포인터가 필요한 곳에서는 & 로 주소를 명시하세요.'],
    check(unit, api) {
      for (const id of U.ix(unit).get('Identifier')) {
        const s = id.symbol;
        if (!s || s.kind !== 'function' || s.member) continue;
        const { p, key } = U.upParens(id);
        if (!p) continue;
        if (p.type === 'CallExpr') continue;
        if (p.type === 'UnaryExpr' && p.op === '&') continue;
        if (p.type === 'VarDecl' || p.type === 'FieldDecl' || p.type === 'ReturnStmt' || p.type === 'InitList' || p.type === 'ParenListInit' || p.type === 'LambdaCapture') continue;
        if (p.type === 'AssignExpr' && key === 'right') continue;
        if (p.type === 'CastExpr' && U.isFnPtr(p.ctype)) continue;
        // an argument of a constructor (`std::thread(fn)`), like a call argument
        if (p.type === 'CastExpr' && p.kind === 'functional' && (U.unknownT(p.ctype) || U.canon(p.ctype).kind === 'record')) continue;
        if (p.type === 'NewExpr') continue;
        if (p.type === 'TemplateDecl' || p.type === 'NamedType' || p.type === 'DecltypeType' || p.type === 'SizeofExpr' || p.type === 'NoexceptExpr' || p.type === 'UsingDecl') continue;
        if (p.type === 'MemberExpr' || p.type === 'TypeName') continue;
        api.report(id, M(`The function '${id.name}' is converted to a pointer here; call it or use '&${id.name}'.`, `함수 '${id.name}' 가 여기서 포인터로 변환됩니다. 호출하거나 '&${id.name}' 를 쓰세요.`));
      }
    },
  }),
];
