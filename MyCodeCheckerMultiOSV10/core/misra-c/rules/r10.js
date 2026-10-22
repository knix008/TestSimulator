'use strict';

// MISRA C:2012 / 2023 chapter 10: the essential type model.

const U = require('../lib/a-util');
const E = require('../lib/a-essential');
const { cf, T, meta, msg } = U;

const BASE = { cat: 'R', type: 'CODE_SMELL', sev: 'MAJOR', debt: 10, dec: true, cwe: ['CWE-704'] };

// ------------------------------------------------------------------ 10.1

const BAD = {
  index: ['boolean', 'character', 'floating'],
  uplus: ['boolean', 'character', 'enum'],
  uminus: ['boolean', 'character', 'enum', 'unsigned'],
  addsub: ['boolean', 'enum'],
  incdec: ['boolean', 'enum'],
  muldiv: ['boolean', 'character', 'enum'],
  mod: ['boolean', 'character', 'enum', 'floating'],
  rel: ['boolean'],
  logical: ['character', 'enum', 'signed', 'unsigned', 'floating'],
  shiftL: ['boolean', 'character', 'enum', 'signed', 'floating'],
  shiftR: ['boolean', 'character', 'enum', 'signed', 'floating'],
  bitwise: ['boolean', 'character', 'enum', 'signed', 'floating'],
  cond: ['character', 'enum', 'signed', 'unsigned', 'floating'],
};
const GROUP_OF = {
  '+': 'addsub', '-': 'addsub', '*': 'muldiv', '/': 'muldiv', '%': 'mod',
  '<': 'rel', '>': 'rel', '<=': 'rel', '>=': 'rel', '&&': 'logical', '||': 'logical',
  '<<': 'shift', '>>': 'shift', '&': 'bitwise', '|': 'bitwise', '^': 'bitwise',
};

function reason101(cat, group) {
  if (group === 'logical' || group === 'cond') return ['a Boolean operand is expected here', '여기에는 부울 피연산자가 와야 합니다'];
  switch (cat) {
    case 'boolean': return ['a Boolean value is used as a number', '부울 값을 숫자처럼 사용합니다'];
    case 'character': return ['character data is used as a number', '문자 데이터를 숫자처럼 사용합니다'];
    case 'enum': return ['an enumeration value is used in arithmetic', '열거 값을 산술 연산에 사용합니다'];
    case 'signed': return ['bitwise and shift operations on signed values depend on the implementation', '부호 있는 값의 비트/시프트 연산은 구현에 따라 다릅니다'];
    case 'unsigned': return ['negating an unsigned value wraps around', '부호 없는 값을 음수화하면 값이 돌아갑니다'];
    case 'floating': return ['the operator is not meaningful for floating operands', '부동소수점 피연산자에는 맞지 않는 연산자입니다'];
    default: return ['inappropriate operand', '부적절한 피연산자입니다'];
  }
}

function r101(unit, api) {
  const check = (operand, opText, group, extraOk) => {
    if (!operand) return;
    const R = U.et(unit, api, operand);
    if (!R || R.category === 'other') return;
    if (!BAD[group].includes(R.category)) return;
    if (extraOk && extraOk(R)) return;
    const [ren, rko] = reason101(R.category, group);
    api.report(operand, msg(
      `Operand '${U.code(unit, operand)}' of '${opText}' has essentially ${R.category} type '${U.etName(R)}': ${ren}.`,
      `'${opText}'의 피연산자 '${U.code(unit, operand)}'의 본질 타입이 ${U.catKo(R.category)} '${U.etName(R)}'입니다: ${rko}.`));
  };
  const shiftRightOk = (R) => R.category === 'signed' && R.ice && R.value != null && R.value >= 0n;
  const binary = (op, left, right, opText) => {
    const g = GROUP_OF[op];
    if (!g) return;
    if (g === 'shift') {
      check(left, opText, 'shiftL');
      check(right, opText, 'shiftR', shiftRightOk);
      return;
    }
    check(left, opText, g);
    check(right, opText, g);
  };
  for (const b of U.nodes(unit, 'BinaryExpr')) binary(b.op, b.left, b.right, b.op);
  for (const a of U.nodes(unit, 'AssignExpr')) {
    const op = E.binOf(a.op);
    if (op) binary(op, a.left, a.right, a.op);
  }
  for (const u of U.nodes(unit, 'UnaryExpr')) {
    if (u.op === '+') check(u.arg, 'unary +', 'uplus');
    else if (u.op === '-') check(u.arg, 'unary -', 'uminus');
    else if (u.op === '~') check(u.arg, '~', 'bitwise');
    else if (u.op === '!') check(u.arg, '!', 'logical');
    else if (u.op === '++' || u.op === '--') check(u.arg, u.op, 'incdec');
  }
  for (const c of U.nodes(unit, 'ConditionalExpr')) check(c.test, '?:', 'cond');
  for (const ix of U.nodes(unit, 'IndexExpr')) {
    const objPtr = E.isPointerOperand(ix.object);
    check(objPtr ? ix.index : ix.object, '[]', 'index');
  }
}

// ------------------------------------------------------------------ 10.2

function r102(unit, api) {
  const num = (c) => c === 'signed' || c === 'unsigned';
  const test = (node, op, left, right) => {
    const L = U.et(unit, api, left), R = U.et(unit, api, right);
    if (!L || !R) return;
    if (L.category !== 'character' && R.category !== 'character') return;
    let bad = false;
    if (op === '+') {
      if (L.category === 'character' && R.category === 'character') bad = true;
      else if (L.category === 'character' && !num(R.category) && R.category !== 'other') bad = true;
      else if (R.category === 'character' && !num(L.category) && L.category !== 'other') bad = true;
    } else {
      if (L.category === 'character' && !(num(R.category) || R.category === 'character') && R.category !== 'other') bad = true;
      else if (R.category === 'character' && L.category !== 'character') bad = true;
    }
    if (L.category === 'other' && R.category === 'character' && op === '+') bad = false;
    if (!bad) return;
    api.report(node, msg(
      `Character operand in '${U.code(unit, node)}': '${op}' combines essentially ${L.category} '${U.etName(L)}' and ${R.category} '${U.etName(R)}'.`,
      `'${U.code(unit, node)}'의 문자 피연산자: '${op}'가 ${U.catKo(L.category)} '${U.etName(L)}'와 ${U.catKo(R.category)} '${U.etName(R)}'를 섞습니다.`));
  };
  for (const b of U.nodes(unit, 'BinaryExpr')) if (b.op === '+' || b.op === '-') test(b, b.op, b.left, b.right);
  for (const a of U.nodes(unit, 'AssignExpr')) if (a.op === '+=' || a.op === '-=') test(a, a.op[0], a.left, a.right);
}

// ------------------------------------------------------------------ 10.3

function fits(unit, value, t) {
  const c = U.canon(t);
  try { return !!c && c.kind === 'int' && T.fitsIn(value, c, unit.target); } catch (_) { return false; }
}

function narrowingIssue(unit, L, R, toType) {
  if (!L || !R || L.category === 'other' || R.category === 'other') return null;
  if (L.category !== R.category) {
    if (R.category === 'signed' && L.category === 'unsigned' && R.ice && R.value != null && R.value >= 0n && fits(unit, R.value, L.type || toType)) return null;
    return 'category';
  }
  if (L.category === 'enum') return (L.enumName || '') === (R.enumName || '') ? null : 'enum';
  if (L.size != null && R.size != null && R.size > L.size) return 'narrower';
  return null;
}

function r103(unit, api) {
  const say = (where, kind, val, L, R, issue) => {
    const what = issue === 'narrower'
      ? ['a narrower essential type', '더 좁은 본질 타입']
      : issue === 'enum' ? ['a different enumeration', '다른 열거 타입'] : ['a different essential type category', '다른 본질 타입 범주'];
    api.report(where, msg(
      `${U.siteEn(kind)[0].toUpperCase()}${U.siteEn(kind).slice(1)} of '${U.code(unit, val)}' (essentially ${R.category} '${U.etName(R)}') to ${what[0]} (${L.category} '${U.etName(L)}').`,
      `'${U.code(unit, val)}'(본질 타입 ${U.catKo(R.category)} '${U.etName(R)}')를 ${what[1]}(${U.catKo(L.category)} '${U.etName(L)}')으로 ${U.siteKo(kind)}합니다.`));
  };
  for (const s of U.conversionSites(unit)) {
    const L = s.toExpr ? U.et(unit, api, s.toExpr) : U.etOfType(unit, api, s.to);
    const R = U.et(unit, api, s.value);
    const issue = narrowingIssue(unit, L, R, s.to);
    if (issue) say(s.kind === 'init' && s.decl && s.node === s.decl ? s.value : s.node, s.kind, s.value, L, R, issue);
  }
  // case labels are converted to the type of the controlling expression
  for (const c of U.nodes(unit, 'CaseStmt')) {
    const sw = cf.enclosing(c, 'SwitchStmt');
    if (!sw || !sw.cond || sw.cond.type === 'Declaration') continue;
    const L = U.et(unit, api, sw.cond);
    const R = U.et(unit, api, c.value);
    const issue = narrowingIssue(unit, L, R, sw.cond.ctype);
    if (issue) say(c.value, 'case', c.value, L, R, issue);
  }
}

// ------------------------------------------------------------------ 10.4

function r104(unit, api) {
  const num = (c) => c === 'signed' || c === 'unsigned';
  for (const app of E.uacApplications(unit)) {
    if (E.isPointerOperand(app.left) || E.isPointerOperand(app.right)) continue;
    const L = U.et(unit, api, app.left), R = U.et(unit, api, app.right);
    if (!L || !R || L.category === 'other' || R.category === 'other') continue;
    if (app.op === '+' && ((L.category === 'character' && num(R.category)) || (R.category === 'character' && num(L.category)))) continue;
    if (app.op === '-' && L.category === 'character' && num(R.category)) continue;
    if (E.sameEssential(L, R)) continue;
    const opText = app.compound ? app.node.op : app.op;
    api.report(app.node, msg(
      `Operands of '${opText}' have different essential types: '${U.code(unit, app.left)}' is ${L.category} '${U.etName(L)}', '${U.code(unit, app.right)}' is ${R.category} '${U.etName(R)}'.`,
      `'${opText}'의 피연산자 본질 타입이 다릅니다: '${U.code(unit, app.left)}'는 ${U.catKo(L.category)} '${U.etName(L)}', '${U.code(unit, app.right)}'는 ${U.catKo(R.category)} '${U.etName(R)}'입니다.`));
  }
}

// ------------------------------------------------------------------ 10.5

function badCast(from, to) {
  const f = from.category, t = to.category;
  if (f === 'other' || t === 'other') return false;
  if (t === 'boolean') return f !== 'boolean';
  if (t === 'character') return f === 'boolean' || f === 'floating';
  if (t === 'enum') return f !== 'enum' || (from.enumName || '') !== (to.enumName || '');
  if (t === 'signed' || t === 'unsigned') return f === 'boolean';
  if (t === 'floating') return f === 'boolean' || f === 'character';
  return false;
}

function r105(unit, api) {
  for (const c of U.nodes(unit, 'CastExpr')) {
    if (!c.arg || !c.typeName) continue;
    const toT = c.typeName.ctype;
    if (!toT || T.isVoid(U.canon(toT))) continue;
    const to = U.etOfType(unit, api, toT);
    const from = U.et(unit, api, c.arg);
    if (!badCast(from, to)) continue;
    if (to.category === 'boolean' && from.ice && (from.value === 0n || from.value === 1n)) continue;
    api.report(c, msg(
      `Cast of '${U.code(unit, c.arg)}' from essentially ${from.category} '${U.etName(from)}' to ${to.category} '${U.etName(to)}' is not appropriate.`,
      `'${U.code(unit, c.arg)}'를 본질 타입 ${U.catKo(from.category)} '${U.etName(from)}'에서 ${U.catKo(to.category)} '${U.etName(to)}'로 캐스트하는 것은 부적절합니다.`));
  }
}

// ------------------------------------------------------------------ 10.6

function r106(unit, api) {
  for (const s of U.conversionSites(unit)) {
    if (!E.isComposite(unit, s.value)) continue;
    const L = s.toExpr ? U.et(unit, api, s.toExpr) : U.etOfType(unit, api, s.to);
    const R = U.et(unit, api, s.value);
    if (!E.NUMERIC.has(L.category) || L.category !== R.category) continue;
    if (L.size == null || R.size == null || L.size <= R.size) continue;
    api.report(s.kind === 'init' && s.decl && s.node === s.decl ? s.value : s.node, msg(
      `Composite expression '${U.code(unit, s.value)}' (essentially '${U.etName(R)}') is widened to '${U.etName(L)}' by ${U.siteEn(s.kind)}; the arithmetic is still done in the narrower type.`,
      `복합 식 '${U.code(unit, s.value)}'(본질 타입 '${U.etName(R)}')가 ${U.siteKo(s.kind)}로 '${U.etName(L)}'로 넓어집니다. 연산은 여전히 좁은 타입에서 이루어집니다.`));
  }
}

// ------------------------------------------------------------------ 10.7

function r107(unit, api) {
  for (const app of E.uacApplications(unit)) {
    if (app.op === '?:') continue;
    if (E.isPointerOperand(app.left) || E.isPointerOperand(app.right)) continue;
    const L = U.et(unit, api, app.left), R = U.et(unit, api, app.right);
    const sides = [[app.right, R, app.left, L]];
    if (!app.compound) sides.push([app.left, L, app.right, R]);
    for (const [comp, C, other, O] of sides) {
      if (!E.isComposite(unit, comp)) continue;
      if (!E.NUMERIC.has(C.category) || C.category !== O.category) continue;
      if (C.size == null || O.size == null || O.size <= C.size) continue;
      const opText = app.compound ? app.node.op : app.op;
      api.report(comp, msg(
        `Composite operand '${U.code(unit, comp)}' (essentially '${U.etName(C)}') of '${opText}' is converted to the wider '${U.etName(O)}' of '${U.code(unit, other)}'.`,
        `'${opText}'의 복합 피연산자 '${U.code(unit, comp)}'(본질 타입 '${U.etName(C)}')가 '${U.code(unit, other)}'의 더 넓은 '${U.etName(O)}'로 변환됩니다.`));
    }
  }
}

// ------------------------------------------------------------------ 10.8

function r108(unit, api) {
  for (const c of U.nodes(unit, 'CastExpr')) {
    if (!c.arg || !c.typeName || !E.isComposite(unit, c.arg)) continue;
    const toT = c.typeName.ctype;
    if (!toT || T.isVoid(U.canon(toT))) continue;
    const to = U.etOfType(unit, api, toT);
    const from = U.et(unit, api, c.arg);
    if (!E.NUMERIC.has(from.category) || to.category === 'other') continue;
    let why = null;
    if (to.category !== from.category) why = ['a different essential type category', '다른 본질 타입 범주'];
    else if (to.size != null && from.size != null && to.size > from.size) why = ['a wider essential type', '더 넓은 본질 타입'];
    if (!why) continue;
    api.report(c, msg(
      `Composite expression '${U.code(unit, c.arg)}' (essentially ${from.category} '${U.etName(from)}') is cast to ${why[0]} '${U.etName(to)}'.`,
      `복합 식 '${U.code(unit, c.arg)}'(본질 타입 ${U.catKo(from.category)} '${U.etName(from)}')를 ${why[1]} '${U.etName(to)}'로 캐스트합니다.`));
  }
}

module.exports = [
  { meta: meta('10.1', { ...BASE, name: ['Operands shall have an appropriate essential type', '피연산자는 적절한 본질 타입이어야 함'],
    why: ['Using Booleans, characters, enums, signed or floating values with operators that do not suit them hides intent and invokes implementation-defined behaviour.', '부울·문자·열거·부호 있는·부동소수점 값을 맞지 않는 연산자에 쓰면 의도가 흐려지고 구현 정의 동작이 생깁니다.'],
    fix: ['Use an operand of a fitting essential type (e.g. unsigned for bitwise operations, Boolean for logical ones) or rewrite the expression.', '연산자에 맞는 본질 타입(비트 연산은 부호 없는 타입, 논리 연산은 부울)의 피연산자를 쓰거나 식을 고치세요.'] }), check: r101 },
  { meta: meta('10.2', { ...BASE, name: ['Character data used inappropriately in addition or subtraction', '덧셈/뺄셈에서 문자 데이터를 부적절하게 사용'],
    why: ['Only a few forms of arithmetic on characters (char + integer offset, char - char, char - integer) make sense; the others are probably mistakes.', '문자에 대한 산술은 문자+정수 오프셋, 문자-문자, 문자-정수처럼 몇 가지 형태만 의미가 있고 나머지는 실수일 가능성이 큽니다.'],
    fix: ['Restrict character arithmetic to the meaningful forms or convert explicitly.', '의미 있는 형태로만 문자 산술을 하거나 명시적으로 변환하세요.'] }), check: r102 },
  { meta: meta('10.3', { ...BASE, sev: 'CRITICAL', cwe: ['CWE-197', 'CWE-704'], cert: 'INT31-C', name: ['Value assigned to a narrower or different essential type', '더 좁거나 다른 본질 타입으로의 대입'],
    why: ['Implicitly converting a value to a narrower type or another type category can silently lose information or change meaning.', '값을 더 좁은 타입이나 다른 범주로 암시적으로 변환하면 정보가 소리 없이 사라지거나 의미가 바뀝니다.'],
    fix: ['Make the target and value use the same essential type category and width, or add an explicit cast after checking the range.', '대상과 값의 본질 타입 범주·폭을 맞추거나, 범위를 확인한 뒤 명시적으로 캐스트하세요.'] }), check: r103 },
  { meta: meta('10.4', { ...BASE, name: ['Operands of arithmetic conversion operators shall share an essential type category', '산술 변환 연산자의 피연산자는 같은 본질 타입 범주여야 함'],
    why: ['Mixing categories (e.g. signed with unsigned) makes the implicit conversions surprising, such as a negative value compared as a huge unsigned number.', '부호 있는 값과 없는 값처럼 범주를 섞으면 음수가 큰 부호 없는 수로 비교되는 등 암시적 변환이 예상 밖으로 일어납니다.'],
    fix: ['Convert one operand explicitly so both have the same essential type category (e.g. use a "u" suffix on constants).', '한 피연산자를 명시적으로 변환해 범주를 맞추세요(상수에는 "u" 접미사 등).'] }), check: r104 },
  { meta: meta('10.5', { ...BASE, cat: 'A', sev: 'MINOR', name: ['Cast to an inappropriate essential type', '부적절한 본질 타입으로의 캐스트'],
    why: ['Some casts, such as Boolean to number or floating to character, have no sensible meaning.', '부울을 숫자로, 부동소수점을 문자로 바꾸는 등 일부 캐스트는 의미가 없습니다.'],
    fix: ['Remove the cast or restructure the code so that the conversion is meaningful.', '캐스트를 없애거나 변환이 의미 있도록 코드를 바꾸세요.'] }), check: r105 },
  { meta: meta('10.6', { ...BASE, name: ['Composite expression assigned to a wider essential type', '복합 식을 더 넓은 본질 타입에 대입'],
    why: ['The calculation happens in the narrower type and may overflow before the result is widened, which developers often do not expect.', '연산은 좁은 타입에서 먼저 이루어져 넓어지기 전에 넘칠 수 있는데, 이를 예상하지 못하는 경우가 많습니다.'],
    fix: ['Cast one operand to the wider type before the operation.', '연산 전에 한 피연산자를 넓은 타입으로 캐스트하세요.'] }), check: r106 },
  { meta: meta('10.7', { ...BASE, name: ['Composite operand mixed with a wider operand', '복합 피연산자와 더 넓은 피연산자의 혼합'],
    why: ['The composite part is computed in its own narrower type before the conversion to the wider type of the other operand.', '복합 부분은 다른 피연산자의 넓은 타입으로 변환되기 전에 좁은 타입에서 계산됩니다.'],
    fix: ['Cast an operand of the composite expression to the wider type first.', '복합 식의 피연산자를 먼저 넓은 타입으로 캐스트하세요.'] }), check: r107 },
  { meta: meta('10.8', { ...BASE, name: ['Composite expression cast to a wider type or other category', '복합 식을 더 넓은 타입이나 다른 범주로 캐스트'],
    why: ['Casting the result does not change the type in which the operation was performed; overflow already happened.', '결과를 캐스트해도 연산이 이루어진 타입은 바뀌지 않아 이미 넘침이 일어났을 수 있습니다.'],
    fix: ['Cast the operands instead of the result.', '결과 대신 피연산자를 캐스트하세요.'] }), check: r108 },
];
