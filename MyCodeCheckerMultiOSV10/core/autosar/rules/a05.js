'use strict';

// AUTOSAR C++14 chapter 5 — expressions (evaluation order, conditions,
// literals, lambdas, casts, pointer use, operators) and MISRA C++:2008 M5
// rules (underlying-type conversions of cvalues).

const { A, M } = require('../lib/meta');
const { D } = require('../lib/delegate');
const U = require('../lib/util');
const conv = require('../../misra-cpp/lib/conv');
const { cf, T } = U;

const ARITH = new Set(['+', '-', '*', '/', '%', '<<', '>>', '&', '|', '^']);
const BITWISE = new Set(['&', '|', '^']);

function ess(e, unit) {
  try { return cf.essentialType(e, { target: unit.target }); } catch (err) { return null; }
}
const isInt = (et) => !!et && (et.category === 'signed' || et.category === 'unsigned');
const isFloat = (et) => !!et && et.category === 'floating';
const isBoolE = (e, unit) => {
  const et = ess(e, unit);
  if (et && et.category === 'boolean') return true;
  const c = e && e.ctype ? U.nonRef(e.ctype) : null;
  return !!(c && c.kind === 'int' && c.name === 'bool');
};
const typeEss = (t, unit) => { try { return cf.essentialTypeOfType(t, { target: unit.target }); } catch (err) { return null; } };
const sizeOfT = (t, unit) => U.sizeOf(t, unit.target);

// "cvalue" (MISRA C++:2008): a composite arithmetic expression.
function isCvalue(e) {
  e = U.strip(e);
  if (!e) return false;
  if (e.type === 'BinaryExpr' && ARITH.has(e.op)) return true;
  if (e.type === 'UnaryExpr' && (e.op === '-' || e.op === '~' || e.op === '+')) return true;
  // `c ? -1 : 0`: a constant branch (`-1`) is not a composite expression
  if (e.type === 'ConditionalExpr') return [e.consequent, e.alternate].some((b) => isCvalue(b) && !U.constInt(b, null, true));
  return false;
}

const isIce = (e, unit) => !!U.constInt(e, unit, true);
const isNumericDst = (t) => { const c = t ? U.nonRef(t) : null; return !!(c && (c.kind === 'int' || c.kind === 'float') && c.name !== 'bool'); };

// Explicit numeric casts: [{ node, src, dst }]
function numericCasts(unit) {
  return U.memo(unit, 'autosar.casts', () => {
    const out = [];
    for (const c of U.ix(unit).get('CastExpr')) {
      if (!c.arg || c.kind === 'dynamic_cast' || c.kind === 'const_cast' || c.kind === 'reinterpret_cast') continue;
      if (!isNumericDst(c.ctype)) continue;
      out.push({ node: c, src: c.arg, dst: c.ctype });
    }
    return out;
  });
}

function lambdaHasParamList(unit, l) {
  const s = cf.sourceText(unit, l) || '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        const rest = s.slice(i + 1).replace(/^\s+/, '');
        return rest.startsWith('(') || rest.startsWith('<');
      }
    }
  }
  return true;
}

const capturesByRef = (l) => l.captureDefault === '&' || (l.captures || []).some((c) => c.byRef && c.kind !== 'this');

// Literal contexts accepted by A5-1-1 (type initialization and constants).
function literalAllowed(lit) {
  if (lit.value === 0n || lit.value === 1n || lit.value === 0 || lit.value === 1) return true;
  for (const a of cf.ancestors(lit)) {
    switch (a.type) {
      case 'VarDecl': case 'FieldDecl': case 'EnumConstant': case 'ArrayDeclarator': case 'TemplateParam': case 'StaticAssert':
      case 'CtorInit': case 'TypeName': case 'CaseStmt': case 'NamedType': case 'ParamDecl': case 'AlignasSpec':
        return true;
      case 'FunctionDecl': case 'CompoundStmt': case 'LambdaExpr':
        return false;
      default:
    }
  }
  return true;
}

// Simple straight-line null tracking inside one compound statement.
function nullDerefs(block) {
  const out = [];
  const isNullExpr = (e) => { e = U.strip(e); return !!(e && (e.type === 'NullptrLiteral' || (e.type === 'IntegerLiteral' && e.value === 0n && e.ctype))); };
  const nulls = new Set();
  for (const st of block.body || []) {
    // dereferences first (in this statement), then updates
    cf.walk(st, (n) => {
      if (n.type === 'LambdaExpr') return cf.walk.SKIP;
      let base = null;
      if (n.type === 'UnaryExpr' && n.op === '*') base = n.arg;
      else if (n.type === 'MemberExpr' && n.arrow) base = n.object;
      else if (n.type === 'IndexExpr') base = n.object;
      base = U.strip(base);
      if (base && base.type === 'Identifier' && base.symbol && nulls.has(base.symbol)) out.push({ node: n, name: base.name });
      if (base && base.type === 'NullptrLiteral') out.push({ node: n, name: 'nullptr' });
      return undefined;
    });
    cf.walk(st, (n) => {
      if (n.type === 'VarDecl' && n.symbol && U.canon(n.symbol.type).kind === 'pointer') {
        if (n.init && isNullExpr(n.init)) nulls.add(n.symbol); else nulls.delete(n.symbol);
      }
      if (n.type === 'Identifier' && n.symbol && nulls.has(n.symbol)) {
        const w = U.writeKind(n);
        const { p, key } = U.upParens(n);
        if (w === 'assign') { if (!isNullExpr(p.right)) nulls.delete(n.symbol); } else if (w) nulls.delete(n.symbol);
        else if (p && p.type === 'CallExpr' && key === 'args') nulls.delete(n.symbol);
      }
      return undefined;
    });
    if (st.type !== 'ExprStmt' && st.type !== 'Declaration') {
      // control flow: forget everything written below this statement
      cf.walk(st, (n) => { if (n.type === 'Identifier' && n.symbol && U.writeKind(n)) nulls.delete(n.symbol); return undefined; });
    }
  }
  return out;
}

const ternaryOkParent = (p, key) => {
  if (!p) return true;
  if (p.type === 'VarDecl' || p.type === 'FieldDecl' || p.type === 'ReturnStmt' || p.type === 'ExprStmt' || p.type === 'CtorInit' || p.type === 'InitList' || p.type === 'ParenListInit') return true;
  if (p.type === 'AssignExpr' && key === 'right') return true;
  if (p.type === 'CallExpr' && key === 'args') return true;
  return false;
};

module.exports = [
  D('A5-0-1', ['4.6.1'], { name: ['The value of an expression shall be the same under any order of evaluation the standard permits', '식의 값은 표준이 허용하는 어떤 평가 순서에서도 같아야 합니다'] }),
  A({
    id: 'A5-0-2', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['The condition of an if-statement and of an iteration statement shall have type bool', 'if 문과 반복문의 조건은 bool 형식이어야 합니다'],
    why: ['Implicit conversion of an integer or pointer to bool hides the comparison that is really meant.', '정수나 포인터를 bool 로 암시적으로 바꾸면 실제로 의도한 비교가 가려집니다.'],
    fix: ['Write an explicit comparison, e.g. (n != 0) or (p != nullptr).', '(n != 0) 이나 (p != nullptr) 처럼 비교를 명시하세요.'],
    check(unit, api) {
      for (const { e, ctx } of conv.boolContexts(unit)) {
        if (ctx !== 'if condition' && ctx !== 'loop condition') continue;
        if (!e.ctype || U.unknownT(e.ctype) || isBoolE(e, unit) || U.recordOf(e.ctype)) continue;
        api.report(e, M(`The ${ctx} has type '${U.tstr(e.ctype)}', not bool.`, `${ctx === 'if condition' ? 'if 조건' : '반복 조건'} 의 형식이 bool 이 아니라 '${U.tstr(e.ctype)}' 입니다.`));
      }
    },
  }),
  D('A5-0-3', ['11.3.2']),
  A({
    id: 'A5-0-4', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 10,
    name: ['Pointer arithmetic shall not be used with pointers to non-final classes', 'final 이 아닌 클래스의 포인터에는 포인터 산술을 쓰면 안 됩니다'],
    why: ['If the pointer actually points to an array of a derived class, the element stride is wrong.', '포인터가 실제로 파생 클래스 배열을 가리키면 원소 간격이 틀립니다.'],
    fix: ['Use a container of the class or mark the class final.', '클래스를 담는 컨테이너를 쓰거나 클래스를 final 로 표시하세요.'],
    check(unit, api) {
      const nonFinalPointee = (e) => {
        const c = e && e.ctype ? U.nonRef(e.ctype) : null;
        if (!c || c.kind !== 'pointer') return null;
        const r = U.canon(c.to);
        return r.kind === 'record' && r.decl && !r.decl.isFinal && r.tag !== 'union' ? r : null;
      };
      const rep = (n, r) => {
        const name = r.name || r.typedefName || '<anonymous>'; // typedef struct { ... } T;
        api.report(n, M(`Pointer arithmetic is applied to a pointer to the non-final class '${name}'.`, `final 이 아닌 클래스 '${name}' 의 포인터에 포인터 산술을 씁니다.`));
      };
      const x = U.ix(unit);
      for (const b of x.get('BinaryExpr')) if (b.op === '+' || b.op === '-') { const r = nonFinalPointee(b.left) || nonFinalPointee(b.right); if (r) rep(b, r); }
      for (const i of x.get('IndexExpr')) { const r = nonFinalPointee(i.object); if (r) rep(i, r); }
      for (const u of x.get('UnaryExpr')) if (u.op === '++' || u.op === '--') { const r = nonFinalPointee(u.arg); if (r) rep(u, r); }
      for (const a of x.get('AssignExpr')) if (a.op === '+=' || a.op === '-=') { const r = nonFinalPointee(a.left); if (r) rep(a, r); }
    },
  }),
  A({
    id: 'A5-1-1', cat: 'Required', enf: 'partially automated', sev: 'MINOR', debt: 5,
    name: ['Literal values shall not be used apart from type initialization; use symbolic names instead', '리터럴 값은 형식 초기화 외에는 쓰지 말고 기호 이름을 써야 합니다'],
    why: ['Magic numbers scattered through expressions hide their meaning and must be changed in many places.', '식 곳곳에 흩어진 매직 넘버는 뜻을 가리고 여러 곳에서 바꿔야 합니다.'],
    fix: ['Introduce a named constexpr constant and use it.', '이름 있는 constexpr 상수를 만들어 쓰세요.'],
    check(unit, api) {
      for (const l of U.ix(unit).get('IntegerLiteral', 'FloatingLiteral')) {
        if (l.loc.macro || literalAllowed(l)) continue;
        api.report(l, M(`The literal '${l.raw}' is used in an expression; give it a symbolic name.`, `리터럴 '${l.raw}' 을(를) 식에서 씁니다. 기호 이름을 주세요.`));
      }
    },
  }),
  D('A5-1-2', ['8.1.2'], { cat: 'Required', name: ['Variables shall not be implicitly captured in a lambda expression', '람다 식에서 변수를 암시적으로 캡처하면 안 됩니다'] }),
  A({
    id: 'A5-1-3', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 1,
    name: ['A parameter list (possibly empty) shall be included in every lambda expression', '모든 람다 식에는 (비어 있더라도) 매개변수 목록을 써야 합니다'],
    why: ['Without (), a lambda is easily confused with other bracketed constructs such as attributes or array subscripts.', '() 가 없으면 람다를 속성이나 배열 첨자 같은 다른 대괄호 구문과 혼동하기 쉽습니다.'],
    fix: ['Add an explicit () after the capture list.', '캡처 목록 뒤에 () 를 쓰세요.'],
    check(unit, api) {
      for (const l of U.ix(unit).get('LambdaExpr')) if (!lambdaHasParamList(unit, l)) api.report(l, M('This lambda expression has no parameter list.', '이 람다 식에는 매개변수 목록이 없습니다.'));
    },
  }),
  A({
    id: 'A5-1-4', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'CRITICAL', debt: 15, cwe: 'CWE-562',
    name: ['A lambda expression object shall not outlive any of its reference-captured objects', '람다 객체가 참조로 캡처한 객체보다 오래 살면 안 됩니다'],
    why: ['Returning a lambda that captures locals by reference leaves it with dangling references.', '지역 변수를 참조로 캡처한 람다를 반환하면 댕글링 참조를 가진 람다가 남습니다.'],
    fix: ['Capture by value (or move) when the lambda leaves the scope.', '람다가 범위를 벗어난다면 값(또는 이동)으로 캡처하세요.'],
    check(unit, api) {
      for (const r of U.ix(unit).get('ReturnStmt')) {
        let e = U.strip(r.arg);
        if (!e) continue;
        if (e.type === 'CastExpr' && e.arg) e = U.strip(e.arg);
        if (e.type === 'CallExpr' && e.args && e.args.length === 1) e = U.strip(e.args[0]);
        let lam = null;
        if (e && e.type === 'LambdaExpr') lam = e;
        else if (e && e.type === 'Identifier' && e.symbol && e.symbol.storage === 'automatic') {
          const d = e.symbol.decls && e.symbol.decls[0];
          const init = d && d.init ? U.strip(d.init) : null;
          if (init && init.type === 'LambdaExpr') lam = init;
        }
        if (lam && capturesByRef(lam) && U.fnOf(r) !== lam) api.report(r, M('A lambda that captures local objects by reference is returned.', '지역 객체를 참조로 캡처한 람다를 반환합니다.'));
      }
    },
  }),
  A({
    id: 'A5-1-6', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['The return type of a non-void lambda expression should be explicitly specified', 'void 가 아닌 람다 식은 반환 형식을 명시해야 합니다'],
    why: ['A deduced lambda return type can silently change when the body changes.', '추론된 람다 반환 형식은 본문이 바뀌면 조용히 바뀔 수 있습니다.'],
    fix: ['Add a trailing return type: [](int x) -> int { ... }.', '후행 반환 형식을 쓰세요: [](int x) -> int { ... }.'],
    check(unit, api) {
      for (const l of U.ix(unit).get('LambdaExpr')) {
        if (l.trailingReturn) continue;
        let returnsValue = false;
        cf.walk(l.body, (n) => {
          if (n.type === 'LambdaExpr' || n.type === 'RecordDecl') return cf.walk.SKIP;
          if (n.type === 'ReturnStmt' && n.arg) returnsValue = true;
          return undefined;
        });
        if (returnsValue) api.report(l, M('This lambda returns a value but does not declare its return type.', '이 람다는 값을 반환하지만 반환 형식을 선언하지 않습니다.'));
      }
    },
  }),
  A({
    id: 'A5-1-7', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['A lambda shall not be an operand of decltype or typeid', '람다를 decltype 이나 typeid 의 피연산자로 쓰면 안 됩니다'],
    why: ['Every lambda has its own unique closure type, so decltype/typeid of it is rarely what the author expects.', '람다마다 고유한 클로저 형식을 가지므로 decltype/typeid 결과가 작성자의 기대와 다르기 쉽습니다.'],
    fix: ['Use std::function or a named function object type.', 'std::function 이나 이름 있는 함수 객체 형식을 쓰세요.'],
    check(unit, api) {
      const isClosure = (e) => { e = U.strip(e); if (!e) return false; if (e.type === 'LambdaExpr') return true; const c = e.ctype ? U.nonRef(e.ctype) : null; return !!(c && c.kind === 'closure'); };
      for (const t of U.ix(unit).get('TypeidExpr')) if (t.arg && isClosure(t.arg)) api.report(t, M('A lambda is the operand of typeid.', '람다가 typeid 의 피연산자입니다.'));
      for (const d of U.ix(unit).get('DecltypeType')) if (d.expr && isClosure(d.expr)) api.report(d, M('A lambda is the operand of decltype.', '람다가 decltype 의 피연산자입니다.'));
    },
  }),
  A({
    id: 'A5-1-8', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['Lambda expressions should not be defined inside another lambda expression', '람다 식 안에서 다른 람다 식을 정의하지 않아야 합니다'],
    why: ['Nested lambdas are hard to read and to reason about their captures.', '중첩된 람다는 읽기 어렵고 캡처를 따지기도 어렵습니다.'],
    fix: ['Move the inner lambda out or turn it into a named function.', '안쪽 람다를 밖으로 빼거나 이름 있는 함수로 바꾸세요.'],
    check(unit, api) {
      for (const l of U.ix(unit).get('LambdaExpr')) if (cf.ancestors(l).some((a) => a.type === 'LambdaExpr')) api.report(l, M('This lambda is defined inside another lambda.', '이 람다는 다른 람다 안에서 정의됩니다.'));
    },
  }),
  A({
    id: 'A5-1-9', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['Identical unnamed lambda expressions should be replaced with a named function or lambda', '똑같은 이름 없는 람다 식은 이름 있는 함수나 람다로 바꿔야 합니다'],
    why: ['Duplicated lambda bodies must be kept in sync by hand.', '중복된 람다 본문은 손으로 맞춰 고쳐야 합니다.'],
    fix: ['Define the lambda once with a name and reuse it.', '람다를 이름을 붙여 한 번 정의하고 다시 쓰세요.'],
    check(unit, api) {
      const seen = new Map();
      for (const l of U.ix(unit).get('LambdaExpr')) {
        const { p } = U.upParens(l);
        if (p && (p.type === 'VarDecl' || p.type === 'FieldDecl' || p.type === 'AssignExpr')) continue; // named
        const text = (cf.sourceText(unit, l) || '').replace(/\s+/g, ' ').trim();
        if (text.length < 8) continue;
        const prev = seen.get(text);
        if (prev) api.report(l, M(`This unnamed lambda is identical to the one on line ${prev.loc.line}.`, `이 이름 없는 람다는 ${prev.loc.line} 행의 람다와 똑같습니다.`));
        else seen.set(text, l);
      }
    },
  }),
  A({
    id: 'A5-2-1', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 10,
    name: ['dynamic_cast should not be used', 'dynamic_cast 는 쓰지 않아야 합니다'],
    why: ['dynamic_cast has a run-time cost of unknown bound and usually indicates a design that should use virtual functions.', 'dynamic_cast 는 실행 비용의 상한을 알 수 없고, 대개 가상 함수를 써야 할 설계를 뜻합니다.'],
    fix: ['Use virtual functions or another polymorphic design.', '가상 함수나 다른 다형 설계를 쓰세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CastExpr')) if (c.kind === 'dynamic_cast') api.report(c, M('dynamic_cast is used.', 'dynamic_cast 를 씁니다.'));
    },
  }),
  D('A5-2-2', ['8.2.2'], { name: ['Traditional C-style casts shall not be used', 'C 스타일 캐스트는 쓰면 안 됩니다'] }),
  D('A5-2-3', ['8.2.3'], { name: ['A cast shall not remove any const or volatile qualification from the type of a pointer or reference', '캐스트로 포인터나 참조 형식의 const/volatile 한정을 없애면 안 됩니다'] }),
  D('A5-2-4', ['8.2.5']),
  A({
    id: 'A5-2-5', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'CRITICAL', debt: 10, cwe: 'CWE-119', cert: 'CTR50-CPP',
    name: ['An array or container shall not be accessed beyond its range', '배열이나 컨테이너를 범위 밖에서 접근하면 안 됩니다'],
    why: ['Accessing an element outside the bounds is undefined behaviour and a common source of memory corruption.', '범위 밖 원소에 접근하는 것은 정의되지 않은 동작이며 메모리 손상의 흔한 원인입니다.'],
    fix: ['Check the index against the size, or use at() / a range-based for loop.', '인덱스를 크기와 비교하거나 at() 이나 범위 기반 for 문을 쓰세요.'],
    check(unit, api) {
      for (const i of U.ix(unit).get('IndexExpr')) {
        const t = i.object && i.object.ctype ? U.nonRef(i.object.ctype) : null;
        if (!t || t.kind !== 'array' || typeof t.size !== 'number') continue;
        const v = U.constInt(i.index, unit);
        if (!v) continue;
        const n = Number(v.value);
        if (n < 0 || n >= t.size) api.report(i, M(`Index ${n} is outside the bounds of an array of ${t.size} elements.`, `인덱스 ${n} 이(가) 원소 ${t.size}개 배열의 범위를 벗어납니다.`));
      }
    },
  }),
  A({
    id: 'A5-2-6', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['The operands of a logical && or || shall be parenthesized if they contain binary operators', '논리 && 와 || 의 피연산자에 이항 연산자가 있으면 괄호로 묶어야 합니다'],
    why: ['Parentheses make the grouping of a compound condition explicit and avoid precedence mistakes.', '괄호를 쓰면 복합 조건의 묶음이 분명해지고 우선순위 실수를 막습니다.'],
    fix: ['Wrap each operand that contains an operator in parentheses: (a > b) && (c < d).', '연산자를 포함한 피연산자를 괄호로 묶으세요: (a > b) && (c < d).'],
    check(unit, api) {
      for (const b of U.ix(unit).get('BinaryExpr')) {
        if (b.op !== '&&' && b.op !== '||') continue;
        for (const o of [b.left, b.right]) {
          if (!o) continue;
          const plain = o.type === 'BinaryExpr' || o.type === 'ConditionalExpr' || o.type === 'AssignExpr';
          if (plain && !(o.type === 'BinaryExpr' && o.op === b.op)) api.report(o, M(`An operand of '${b.op}' containing '${o.op || '?:'}' is not parenthesized.`, `'${o.op || '?:'}' 를 포함한 '${b.op}' 의 피연산자를 괄호로 묶지 않았습니다.`));
        }
      }
    },
  }),
  A({
    id: 'A5-3-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['The operand of typeid shall not contain side effects', 'typeid 의 피연산자에 부작용이 있으면 안 됩니다'],
    why: ['Whether the operand of typeid is evaluated depends on its type, so side effects may or may not happen.', 'typeid 피연산자를 평가할지는 형식에 따라 달라서 부작용이 일어날 수도 안 일어날 수도 있습니다.'],
    fix: ['Perform the side effect in a separate statement.', '부작용은 별도의 문장에서 수행하세요.'],
    check(unit, api) {
      for (const t of U.ix(unit).get('TypeidExpr')) if (t.arg && U.hasSideEffects(t.arg)) api.report(t, M('The operand of typeid has side effects.', 'typeid 의 피연산자에 부작용이 있습니다.'));
    },
  }),
  A({
    id: 'A5-3-2', cat: 'Required', enf: 'partially automated', type: 'BUG', sev: 'CRITICAL', debt: 10, cwe: 'CWE-476',
    name: ['Null pointers shall not be dereferenced', '널 포인터를 역참조하면 안 됩니다'],
    why: ['Dereferencing a null pointer is undefined behaviour and usually crashes the program.', '널 포인터 역참조는 정의되지 않은 동작이며 대개 프로그램을 멈추게 합니다.'],
    fix: ['Check the pointer against nullptr before use, or assign a valid object first.', '쓰기 전에 nullptr 인지 확인하거나 먼저 올바른 객체를 대입하세요.'],
    check(unit, api) {
      for (const b of U.ix(unit).get('CompoundStmt')) {
        for (const d of nullDerefs(b)) api.report(d.node, M(`'${d.name}' is dereferenced while it is a null pointer.`, `널 포인터인 '${d.name}' 를 역참조합니다.`));
      }
    },
  }),
  D('A5-3-3', ['21.6.5']),
  A({
    id: 'A5-6-1', cat: 'Required', enf: 'partially automated', type: 'BUG', sev: 'CRITICAL', debt: 5, cwe: 'CWE-369',
    name: ['The right-hand operand of the integer division or remainder operators shall not be equal to zero', '정수 나눗셈과 나머지 연산자의 오른쪽 피연산자는 0 이면 안 됩니다'],
    why: ['Integer division by zero is undefined behaviour.', '정수를 0 으로 나누는 것은 정의되지 않은 동작입니다.'],
    fix: ['Check the divisor before dividing.', '나누기 전에 제수를 확인하세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      const zero = (e) => { const v = U.constInt(e, unit); return !!(v && v.value === 0n); };
      const intOp = (e) => { const c = e && e.ctype ? U.nonRef(e.ctype) : null; return !!(c && (c.kind === 'int' || c.kind === 'enum')); };
      for (const b of x.get('BinaryExpr')) if ((b.op === '/' || b.op === '%') && intOp(b.left) && zero(b.right)) api.report(b, M(`The divisor of '${b.op}' is zero.`, `'${b.op}' 의 제수가 0 입니다.`));
      for (const a of x.get('AssignExpr')) if ((a.op === '/=' || a.op === '%=') && intOp(a.left) && zero(a.right)) api.report(a, M(`The divisor of '${a.op}' is zero.`, `'${a.op}' 의 제수가 0 입니다.`));
    },
  }),
  D('A5-10-1', ['13.3.4']),
  A({
    id: 'A5-16-1', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 5,
    name: ['The ternary conditional operator shall not be used as a sub-expression', '삼항 조건 연산자를 하위 식으로 쓰면 안 됩니다'],
    why: ['A conditional operator buried inside a larger expression is hard to read and its precedence is easily misjudged.', '더 큰 식 안에 묻힌 조건 연산자는 읽기 어렵고 우선순위를 잘못 판단하기 쉽습니다.'],
    fix: ['Compute the conditional value into a named variable first.', '조건 값을 먼저 이름 있는 변수에 계산해 두세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('ConditionalExpr')) {
        const { p, key } = U.upParens(c);
        if (!ternaryOkParent(p, key)) api.report(c, M('The conditional operator is used as a sub-expression.', '조건 연산자를 하위 식으로 씁니다.'));
      }
    },
  }),
  // ------------------------------------------------------- MISRA C++:2008 M5
  D('M5-0-2', ['8.0.1']),
  A({
    id: 'M5-0-3', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['A cvalue expression shall not be implicitly converted to a different underlying type', '복합 산술식(cvalue)을 다른 기반 형식으로 암시적으로 변환하면 안 됩니다'],
    why: ['The arithmetic is done in the operands\' type; converting the result afterwards suggests a wider or different computation that did not happen.', '산술은 피연산자 형식으로 수행되므로, 결과를 나중에 변환하면 일어나지 않은 더 넓거나 다른 계산을 했다고 착각하게 됩니다.'],
    fix: ['Cast an operand to the target type before the operation.', '연산 전에 피연산자를 목표 형식으로 변환하세요.'],
    check(unit, api) {
      for (const c of conv.conversions(unit)) {
        if (!isCvalue(c.src) || !isNumericDst(c.dst) || isIce(c.src, unit)) continue;
        const s = ess(c.src, unit);
        const d = typeEss(c.dst, unit);
        if (!s || !d || !(isInt(s) || isFloat(s))) continue;
        if (s.category !== d.category || s.size !== d.size) api.report(c.src, M(`A ${s.name} cvalue is implicitly converted to '${U.tstr(c.dst)}'.`, `${s.name} 복합 식을 '${U.tstr(c.dst)}' 로 암시적으로 변환합니다.`));
      }
    },
  }),
  D('M5-0-4', ['7.0.5']),
  A({
    id: 'M5-0-5', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['There shall be no implicit floating-integral conversions', '부동소수점과 정수 사이의 암시적 변환이 없어야 합니다'],
    why: ['Converting between floating and integral types loses the fraction or the precision silently.', '부동소수점과 정수 형식 사이의 변환은 소수부나 정밀도를 조용히 잃습니다.'],
    fix: ['Use static_cast to make the conversion explicit.', 'static_cast 로 변환을 명시하세요.'],
    check(unit, api) {
      for (const c of conv.conversions(unit)) {
        const s = ess(c.src, unit);
        const d = typeEss(c.dst, unit);
        if (!s || !d || !isNumericDst(c.dst)) continue;
        if ((isFloat(s) && isInt(d)) || (isInt(s) && isFloat(d))) api.report(c.src, M(`'${s.name}' is implicitly converted to '${U.tstr(c.dst)}'.`, `'${s.name}' 을(를) '${U.tstr(c.dst)}' 로 암시적으로 변환합니다.`));
      }
    },
  }),
  A({
    id: 'M5-0-6', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 5, cwe: 'CWE-197',
    name: ['An implicit integral or floating-point conversion shall not reduce the size of the underlying type', '암시적 정수/부동소수점 변환이 기반 형식의 크기를 줄이면 안 됩니다'],
    why: ['A narrowing implicit conversion can silently drop significant bits.', '좁히는 암시적 변환은 의미 있는 비트를 조용히 잃을 수 있습니다.'],
    fix: ['Use a target type that is wide enough, or cast explicitly after checking the range.', '충분히 넓은 목표 형식을 쓰거나 범위를 확인한 뒤 명시적으로 변환하세요.'],
    check(unit, api) {
      for (const c of conv.conversions(unit)) {
        if (isIce(c.src, unit)) continue;
        const s = ess(c.src, unit);
        const d = typeEss(c.dst, unit);
        if (!s || !d || !isNumericDst(c.dst)) continue;
        const sameKind = (isInt(s) && isInt(d)) || (isFloat(s) && isFloat(d));
        if (sameKind && d.size < s.size) api.report(c.src, M(`'${s.name}' is implicitly narrowed to '${U.tstr(c.dst)}'.`, `'${s.name}' 을(를) '${U.tstr(c.dst)}' 로 암시적으로 좁힙니다.`));
      }
    },
  }),
  A({
    id: 'M5-0-7', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['There shall be no explicit floating-integral conversions of a cvalue expression', '복합 산술식(cvalue)을 부동소수점과 정수 사이에서 명시적으로 변환하면 안 됩니다'],
    why: ['Casting the result of an arithmetic expression between floating and integral types suggests the arithmetic was done in the target type.', '산술식 결과를 부동소수점과 정수 사이에서 변환하면 산술이 목표 형식으로 수행되었다고 착각하게 합니다.'],
    fix: ['Cast the operands, not the result.', '결과가 아니라 피연산자를 변환하세요.'],
    check(unit, api) {
      for (const { node, src, dst } of numericCasts(unit)) {
        if (!isCvalue(src)) continue;
        const s = ess(src, unit);
        const d = typeEss(dst, unit);
        if (s && d && ((isFloat(s) && isInt(d)) || (isInt(s) && isFloat(d)))) api.report(node, M(`A ${s.name} cvalue is cast to '${U.tstr(dst)}'.`, `${s.name} 복합 식을 '${U.tstr(dst)}' 로 변환합니다.`));
      }
    },
  }),
  A({
    id: 'M5-0-8', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['An explicit integral or floating-point conversion shall not increase the size of the underlying type of a cvalue expression', '명시적 변환으로 복합 산술식(cvalue)의 기반 형식 크기를 늘리면 안 됩니다'],
    why: ['Widening the result does not recover bits already lost by the narrower arithmetic.', '결과를 넓혀도 좁은 산술에서 이미 잃은 비트는 돌아오지 않습니다.'],
    fix: ['Cast an operand to the wider type before the operation.', '연산 전에 피연산자를 넓은 형식으로 변환하세요.'],
    check(unit, api) {
      for (const { node, src, dst } of numericCasts(unit)) {
        if (!isCvalue(src) || isIce(src, unit)) continue;
        const s = ess(src, unit);
        const d = typeEss(dst, unit);
        const sameKind = s && d && ((isInt(s) && isInt(d)) || (isFloat(s) && isFloat(d)));
        if (sameKind && d.size > s.size) api.report(node, M(`A ${s.name} cvalue is cast to the wider type '${U.tstr(dst)}'.`, `${s.name} 복합 식을 더 넓은 '${U.tstr(dst)}' 로 변환합니다.`));
      }
    },
  }),
  A({
    id: 'M5-0-9', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['An explicit integral conversion shall not change the signedness of the underlying type of a cvalue expression', '명시적 정수 변환으로 복합 산술식(cvalue)의 부호성을 바꾸면 안 됩니다'],
    why: ['Changing the signedness of an arithmetic result reinterprets a value whose computation may already have wrapped.', '산술 결과의 부호성을 바꾸면 계산 중에 이미 순환되었을 수 있는 값을 다르게 해석합니다.'],
    fix: ['Convert the operands to the intended signedness before the operation.', '연산 전에 피연산자를 의도한 부호성으로 변환하세요.'],
    check(unit, api) {
      for (const { node, src, dst } of numericCasts(unit)) {
        if (!isCvalue(src) || isIce(src, unit)) continue;
        const s = ess(src, unit);
        const d = typeEss(dst, unit);
        if (s && d && isInt(s) && isInt(d) && s.category !== d.category) api.report(node, M(`A ${s.name} cvalue is cast to '${U.tstr(dst)}' of different signedness.`, `${s.name} 복합 식을 부호성이 다른 '${U.tstr(dst)}' 로 변환합니다.`));
      }
    },
  }),
  A({
    id: 'M5-0-10', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'MAJOR', debt: 5,
    name: ['If ~ or << is applied to an operand of type unsigned char or unsigned short, the result shall be cast immediately to the operand\'s underlying type', 'unsigned char/short 에 ~ 나 << 를 쓰면 결과를 바로 그 기반 형식으로 변환해야 합니다'],
    why: ['The operand is promoted to int first, so the high bits of the result are not what the narrow type suggests.', '피연산자가 먼저 int 로 승격되므로 결과의 상위 비트가 좁은 형식에서 기대하는 값과 다릅니다.'],
    fix: ['Wrap the operation in static_cast<the operand type>(...).', '연산을 static_cast<피연산자 형식>(...) 로 감싸세요.'],
    check(unit, api) {
      const x = U.ix(unit);
      const narrowUnsigned = (e) => { const s = ess(e, unit); return s && s.category === 'unsigned' && s.size < sizeOfT(T.T.int, unit) && !s.ice ? s : null; };
      const castOk = (n, s) => {
        const { p } = U.upParens(n);
        if (!p || p.type !== 'CastExpr') return false;
        const d = typeEss(p.ctype, unit);
        return !!(d && d.category === 'unsigned' && d.size === s.size);
      };
      for (const u of x.get('UnaryExpr')) if (u.op === '~') { const s = narrowUnsigned(u.arg); if (s && !castOk(u, s)) api.report(u, M(`The result of ~ on '${s.name}' is not cast back to that type.`, `'${s.name}' 에 대한 ~ 결과를 그 형식으로 다시 변환하지 않습니다.`)); }
      for (const b of x.get('BinaryExpr')) if (b.op === '<<') { const s = narrowUnsigned(b.left); if (s && !castOk(b, s)) api.report(b, M(`The result of << on '${s.name}' is not cast back to that type.`, `'${s.name}' 에 대한 << 결과를 그 형식으로 다시 변환하지 않습니다.`)); }
    },
  }),
  D('M5-0-11', ['7.0.3'], { name: ['The plain char type shall only be used for the storage and use of character values', 'plain char 형식은 문자 값의 저장과 사용에만 써야 합니다'] }),
  A({
    id: 'M5-0-12', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['signed char and unsigned char shall only be used for the storage and use of numeric values', 'signed char 와 unsigned char 는 수치 값의 저장과 사용에만 써야 합니다'],
    why: ['Storing character data in explicitly signed or unsigned char mixes up text and numbers.', '문자 데이터를 signed/unsigned char 에 저장하면 텍스트와 숫자가 뒤섞입니다.'],
    fix: ['Use plain char for characters.', '문자에는 plain char 를 쓰세요.'],
    check(unit, api) {
      for (const c of conv.conversions(unit)) {
        const s = U.strip(c.src);
        const d = c.dst ? U.nonRef(c.dst) : null;
        if (s && s.type === 'CharLiteral' && !s.prefix && d && d.kind === 'int' && (d.name === 'signed char' || d.name === 'unsigned char')) api.report(c.src, M(`A character literal is stored in '${U.tstr(c.dst)}'.`, `문자 리터럴을 '${U.tstr(c.dst)}' 에 저장합니다.`));
      }
    },
  }),
  A({
    id: 'M5-0-14', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['The first operand of a conditional operator shall have type bool', '조건 연산자의 첫 피연산자는 bool 형식이어야 합니다'],
    why: ['An implicit conversion of an integer or pointer to bool hides the comparison that is meant.', '정수나 포인터를 bool 로 암시적으로 바꾸면 의도한 비교가 가려집니다.'],
    fix: ['Write an explicit comparison as the condition.', '조건에 비교를 명시하세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('ConditionalExpr')) {
        if (!c.test || !c.test.ctype || U.unknownT(c.test.ctype) || isBoolE(c.test, unit)) continue;
        api.report(c.test, M(`The condition of ?: has type '${U.tstr(c.test.ctype)}', not bool.`, `?: 의 조건 형식이 bool 이 아니라 '${U.tstr(c.test.ctype)}' 입니다.`));
      }
    },
  }),
  A({
    id: 'M5-0-15', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['Array indexing shall be the only form of pointer arithmetic', '포인터 산술은 배열 첨자 형태로만 해야 합니다'],
    why: ['Explicit pointer arithmetic (p + n, ++p) is harder to check against the array bounds than indexing.', '명시적 포인터 산술(p + n, ++p)은 첨자보다 배열 경계를 확인하기 어렵습니다.'],
    fix: ['Use p[n] instead of *(p + n), and an index variable instead of ++p.', '*(p + n) 대신 p[n] 을, ++p 대신 인덱스 변수를 쓰세요.'],
    check(unit, api) {
      const ptr = (e) => { const c = e && e.ctype ? U.nonRef(e.ctype) : null; return !!(c && c.kind === 'pointer'); };
      const intE = (e) => { const c = e && e.ctype ? U.nonRef(e.ctype) : null; return !!(c && (c.kind === 'int' || c.kind === 'enum')); };
      const x = U.ix(unit);
      const rep = (n) => api.report(n, M('Pointer arithmetic is used instead of array indexing.', '배열 첨자 대신 포인터 산술을 씁니다.'));
      for (const b of x.get('BinaryExpr')) if ((b.op === '+' || b.op === '-') && ((ptr(b.left) && intE(b.right)) || (intE(b.left) && ptr(b.right)))) rep(b);
      for (const u of x.get('UnaryExpr')) if ((u.op === '++' || u.op === '--') && ptr(u.arg)) rep(u);
      for (const a of x.get('AssignExpr')) if ((a.op === '+=' || a.op === '-=') && ptr(a.left)) rep(a);
    },
  }),
  D('M5-0-16', ['8.7.1']),
  D('M5-0-17', ['8.7.2']),
  D('M5-0-18', ['8.9.1']),
  A({
    id: 'M5-0-20', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 5,
    name: ['Non-constant operands to a binary bitwise operator shall have the same underlying type', '이항 비트 연산자의 상수가 아닌 피연산자는 기반 형식이 같아야 합니다'],
    why: ['Mixing operand widths in &, | or ^ silently extends the narrower one, which is rarely intended for bit masks.', '&, |, ^ 에서 피연산자 폭을 섞으면 좁은 쪽이 조용히 확장되며, 비트 마스크에서는 거의 의도한 일이 아닙니다.'],
    fix: ['Convert one operand so both have the same type.', '두 피연산자가 같은 형식이 되도록 하나를 변환하세요.'],
    check(unit, api) {
      for (const b of conv.binops(unit)) {
        if (!BITWISE.has(b.op)) continue;
        if (isIce(b.l, unit) || isIce(b.r, unit)) continue;
        const l = ess(b.l, unit);
        const r = ess(b.r, unit);
        if (!l || !r || !isInt(l) || !isInt(r)) continue;
        if (l.category !== r.category || l.size !== r.size) api.report(b.node, M(`The operands of '${b.op}' have different underlying types ('${l.name}' and '${r.name}').`, `'${b.op}' 의 피연산자 기반 형식이 다릅니다('${l.name}', '${r.name}').`));
      }
    },
  }),
  D('M5-0-21', ['7.0.4']),
  D('M5-2-2', ['8.2.1']),
  A({
    id: 'M5-2-3', cat: 'Advisory', enf: 'automated', sev: 'MINOR', debt: 10,
    name: ['Casts from a base class to a derived class should not be performed on polymorphic types', '다형 형식에서 기반 클래스를 파생 클래스로 캐스트하지 않아야 합니다'],
    why: ['A downcast relies on knowing the dynamic type; virtual functions express the same intent safely.', '다운캐스트는 동적 형식을 안다는 가정에 기대며, 가상 함수가 같은 의도를 안전하게 표현합니다.'],
    fix: ['Use a virtual function instead of the downcast.', '다운캐스트 대신 가상 함수를 쓰세요.'],
    check(unit, api) {
      const recOf = (t) => { if (!t) return null; let c = U.nonRef(t); if (c.kind === 'pointer') c = U.canon(c.to); return c.kind === 'record' ? c : null; };
      for (const c of U.ix(unit).get('CastExpr')) {
        if (!c.arg) continue;
        const to = recOf(c.ctype);
        const from = recOf(c.arg.ctype);
        if (!to || !from || to === from || to.decl === from.decl || !U.isPolymorphic(from)) continue;
        if ([...U.allBases(to).keys()].some((b) => b === from || (b.decl && b.decl === from.decl))) api.report(c, M(`The polymorphic base '${from.name}' is cast to the derived class '${to.name}'.`, `다형 기반 클래스 '${from.name}' 을(를) 파생 클래스 '${to.name}' 로 캐스트합니다.`));
      }
    },
  }),
  D('M5-2-6', ['8.2.4']),
  D('M5-2-8', ['8.2.6']),
  D('M5-2-9', ['8.2.7'], { cat: 'Required' }),
  A({
    id: 'M5-2-10', cat: 'Required', enf: 'automated', sev: 'MINOR', debt: 2,
    name: ['The increment and decrement operators shall not be mixed with other operators in an expression', '증감 연산자를 식에서 다른 연산자와 섞어 쓰면 안 됩니다'],
    why: ['++ and -- inside a larger expression make the order of side effects hard to see.', '더 큰 식 안의 ++ 와 -- 는 부작용의 순서를 알아보기 어렵게 합니다.'],
    fix: ['Do the increment or decrement in its own statement.', '증감은 별도의 문장에서 하세요.'],
    check(unit, api) {
      for (const u of U.ix(unit).get('UnaryExpr')) {
        if (u.op !== '++' && u.op !== '--') continue;
        const { p, key } = U.upParens(u);
        if (!p || p.type === 'ExprStmt' || (p.type === 'ForStmt' && key === 'inc')) continue;
        if (p.type === 'BinaryExpr' && p.op === ',') continue;
        api.report(u, M(`'${u.op}' is mixed with other operators in this expression.`, `이 식에서 '${u.op}' 를 다른 연산자와 섞어 씁니다.`));
      }
    },
  }),
  D('M5-2-11', ['16.5.1']),
  D('M5-2-12', ['7.11.2']),
  A({
    id: 'M5-3-1', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['Each operand of the ! operator, the logical && or the logical || operators shall have type bool', '! , &&, || 의 각 피연산자는 bool 형식이어야 합니다'],
    why: ['Logical operators on integers or pointers rely on implicit conversion to bool and hide the real test.', '정수나 포인터에 논리 연산자를 쓰면 bool 로의 암시적 변환에 기대어 실제 검사를 가립니다.'],
    fix: ['Compare explicitly, e.g. (n != 0) && (p != nullptr).', '(n != 0) && (p != nullptr) 처럼 비교를 명시하세요.'],
    check(unit, api) {
      for (const { e, ctx } of conv.boolContexts(unit)) {
        if (!ctx.startsWith('operand of')) continue;
        if (!e || !e.ctype || U.unknownT(e.ctype) || isBoolE(e, unit) || U.recordOf(e.ctype)) continue;
        api.report(e, M(`The ${ctx} has type '${U.tstr(e.ctype)}', not bool.`, `${ctx.replace('operand of', '').trim()} 의 피연산자 형식이 bool 이 아니라 '${U.tstr(e.ctype)}' 입니다.`));
      }
    },
  }),
  D('M5-3-2', ['8.3.1']),
  D('M5-3-3', ['16.5.2']),
  A({
    id: 'M5-3-4', cat: 'Required', enf: 'automated', sev: 'MAJOR', debt: 2,
    name: ['Evaluation of the operand to the sizeof operator shall not contain side effects', 'sizeof 피연산자의 평가에는 부작용이 없어야 합니다'],
    why: ['The operand of sizeof is not evaluated, so the side effect silently never happens.', 'sizeof 의 피연산자는 평가되지 않으므로 부작용이 조용히 일어나지 않습니다.'],
    fix: ['Move the side effect out of the sizeof expression.', '부작용을 sizeof 식 밖으로 옮기세요.'],
    check(unit, api) {
      for (const s of U.ix(unit).get('SizeofExpr')) if (s.arg && U.hasSideEffects(s.arg)) api.report(s, M('The operand of sizeof has side effects that are never evaluated.', 'sizeof 피연산자에 평가되지 않는 부작용이 있습니다.'));
    },
  }),
  A({
    id: 'M5-8-1', cat: 'Required', enf: 'automated', type: 'BUG', sev: 'CRITICAL', debt: 5, cwe: 'CWE-1335',
    name: ['The right-hand operand of a shift operator shall lie between zero and one less than the width of the left-hand operand', '시프트 연산자의 오른쪽 피연산자는 0 이상, 왼쪽 피연산자 비트 폭 미만이어야 합니다'],
    why: ['Shifting by a negative amount or by the width of the type or more is undefined behaviour.', '음수만큼 또는 형식 폭 이상 시프트하는 것은 정의되지 않은 동작입니다.'],
    fix: ['Keep the shift count within the width of the (promoted) left operand.', '시프트 횟수를 (승격된) 왼쪽 피연산자 폭 안으로 유지하세요.'],
    check(unit, api) {
      for (const b of conv.binops(unit)) {
        if (b.op !== '<<' && b.op !== '>>') continue;
        const v = U.constInt(b.r, unit);
        if (!v) continue;
        let width = null;
        try { width = T.intBits(T.integerPromote(U.nonRef(b.l.ctype), unit.target), unit.target); } catch (e) { width = null; }
        if (!width) continue;
        const n = Number(v.value);
        if (n < 0 || n >= width) api.report(b.node, M(`The shift count ${n} is outside 0..${width - 1}.`, `시프트 횟수 ${n} 이(가) 0..${width - 1} 범위를 벗어납니다.`));
      }
    },
  }),
  D('M5-14-1', ['8.14.1']),
  D('M5-18-1', ['8.19.1']),
  D('M5-19-1', ['8.20.1']),
];
