'use strict';

// Bugs: comparisons, collections, signatures, async, misc.

const { define } = require('./def');
const { FUNC_TYPES, dotted, same, sameList, isPure, walkLocal, short, numValue, children, isNone, targetNames, arg: astArg } = require('../ast');
const { BUILTIN, BUILTINS } = require('../scope');
const { EXC_BUILTINS } = require('../project');
const U = require('./util');
const { operandType, endsInRaise } = require('./bugs');

const RULES = [];
const R = define(RULES);

const FAMILY = { int: 'num', float: 'num', complex: 'num', bool: 'num', str: 'str', bytes: 'bytes', bytearray: 'bytes', list: 'list', tuple: 'tuple', dict: 'dict', set: 'set', frozenset: 'set', NoneType: 'none', range: 'range' };

R('self-assignment', 'B', 'MA', 3, ['pitfall'], 'S1656',
  ['Variable assigned to itself', '변수를 자기 자신에게 대입합니다'],
  ['Assigning an expression to itself has no effect and usually hides a typo.', '식을 자기 자신에게 대입해도 아무 효과가 없고 보통 오타를 숨깁니다.'],
  ['Assign the intended value or remove the statement.', '의도한 값을 대입하거나 문장을 지우세요.'],
  {
    on: {
      Assign(n, c, r) {
        if (n.targets.length !== 1) return;
        const t = n.targets[0];
        if (!['Name', 'Attribute', 'Subscript', 'Tuple', 'List'].includes(t.type)) return;
        if ((t.type === 'Tuple' || t.type === 'List') && t.elts.some((e) => e.type === 'Starred')) return;
        if (!same(t, n.value) || !isPure(n.value)) return;
        // x = x in a class body copies the outer name into the class namespace
        if (t.type === 'Name' && c.scopeOf(n) && c.scopeOf(n).kind !== 'function') return;
        r.report(n, `'${short(c.slice(t), 30)}' is assigned to itself.`, `'${short(c.slice(t), 30)}'를 자기 자신에게 대입합니다.`);
      },
    },
  });

// pure, or calls only side-effect-free builtins (len(x) < len(x)) on pure arguments
const STABLE_CALLS = new Set(['len', 'abs', 'round', 'min', 'max', 'sum', 'str', 'int', 'float', 'bool', 'repr', 'hash', 'isinstance', 'issubclass', 'callable', 'chr', 'ord', 'hex', 'oct', 'bin', 'divmod', 'pow', 'ascii', 'type', 'id']);
function stableExpr(e) {
  if (!e) return true;
  if (e.type === 'Call') {
    if (!(e.func.type === 'Name' && e.func.sym === BUILTIN && STABLE_CALLS.has(e.func.id))) return false;
    return e.args.every(stableExpr) && e.keywords.every((k) => stableExpr(k.value));
  }
  if (e.type === 'Await' || e.type === 'Yield' || e.type === 'YieldFrom' || e.type === 'NamedExpr') return false;
  return children(e).every(stableExpr);
}

R('identical-operands', 'B', 'MA', 3, ['pitfall'], 'S1764',
  ['Identical expressions on both sides of an operator', '연산자 양쪽 식이 같습니다'],
  ['Using the same expression on both sides of a comparison, subtraction, division or boolean operator always gives the same result.', '비교, 뺄셈, 나눗셈, 불리언 연산의 양쪽에 같은 식을 쓰면 결과가 항상 같습니다.'],
  ['Fix the operand that was meant to differ (use math.isnan for NaN checks).', '달라야 할 피연산자를 고치세요(NaN 검사는 math.isnan).'],
  {
    on: {
      BinOp(n, c, r) {
        if (!['Sub', 'Div', 'FloorDiv', 'Mod', 'BitXor', 'BitAnd', 'BitOr'].includes(n.op)) return;
        if (same(n.left, n.right) && stableExpr(n.left) && n.left.type !== 'Constant') r.report(n, `Both operands of this '${short(c.slice(n), 30)}' are identical.`, `'${short(c.slice(n), 30)}'의 두 피연산자가 같습니다.`);
      },
      Compare(n, c, r) {
        if (n.ops.length !== 1 || n.ops[0] === 'NotEq' || n.ops[0] === 'Eq') {
          if (n.ops.length === 1 && n.ops[0] === 'Eq' && same(n.left, n.comparators[0]) && isPure(n.left) && n.left.type !== 'Constant' && n.left.type !== 'Name' && n.left.type !== 'Attribute' && n.left.type !== 'Subscript') {
            r.report(n, `Both sides of '${short(c.slice(n), 30)}' are identical.`, `'${short(c.slice(n), 30)}'의 양쪽이 같습니다.`);
          }
          return;
        }
        if (same(n.left, n.comparators[0]) && stableExpr(n.left) && n.left.type !== 'Constant') r.report(n, `Both sides of '${short(c.slice(n), 30)}' are identical.`, `'${short(c.slice(n), 30)}'의 양쪽이 같습니다.`);
      },
      BoolOp(n, c, r) {
        for (let i = 1; i < n.values.length; i++) {
          for (let j = 0; j < i; j++) {
            if (same(n.values[i], n.values[j]) && isPure(n.values[i])) {
              r.report(n.values[i], `'${short(c.slice(n.values[i]), 30)}' appears twice in this '${n.op === 'And' ? 'and' : 'or'}' expression.`, `'${short(c.slice(n.values[i]), 30)}'가 이 '${n.op === 'And' ? 'and' : 'or'}' 식에 두 번 나옵니다.`);
              return;
            }
          }
        }
      },
    },
  });

function isLiteralForIdentity(e) {
  if (!e) return false;
  if (e.type === 'Constant') return ['str', 'bytes', 'int', 'float', 'complex'].includes(e.kind);
  if (e.type === 'UnaryOp' && e.op === 'USub' && e.operand.type === 'Constant') return ['int', 'float', 'complex'].includes(e.operand.kind);
  if (e.type === 'JoinedStr') return true;
  return false;
}
function isNewObject(e) {
  if (!e) return false;
  if (['List', 'Dict', 'Set', 'ListComp', 'DictComp', 'SetComp', 'GeneratorExp', 'Lambda'].includes(e.type)) return true;
  if (e.type === 'Tuple' && e.elts.length) return true;
  if (e.type === 'Call' && e.func.type === 'Name' && e.func.sym === BUILTIN && ['list', 'dict', 'set', 'bytearray', 'object'].includes(e.func.id)) return true;
  return false;
}

R('identity-with-literal', 'B', 'MA', 2, ['pitfall'], 'S5795',
  ['Identity comparison with a literal', '리터럴과 동일성 비교를 합니다'],
  ['"is" compares object identity; whether two equal numbers or strings are the same object is an implementation detail (CPython even warns).', '"is"는 객체 동일성을 비교하며, 같은 숫자나 문자열이 같은 객체인지는 구현 세부사항입니다(CPython도 경고합니다).'],
  ['Use == or != to compare values.', '값 비교에는 == 또는 != 를 쓰세요.'],
  {
    on: {
      Compare(n, c, r) {
        n.ops.forEach((op, i) => {
          if (op !== 'Is' && op !== 'IsNot') return;
          const l = i === 0 ? n.left : n.comparators[i - 1];
          const rt = n.comparators[i];
          if (isLiteralForIdentity(l) || isLiteralForIdentity(rt)) r.report(n, `Replace '${op === 'Is' ? 'is' : 'is not'}' with '${op === 'Is' ? '==' : '!='}' to compare with a literal.`, `리터럴과 비교하려면 '${op === 'Is' ? 'is' : 'is not'}'를 '${op === 'Is' ? '==' : '!='}'로 바꾸세요.`);
        });
      },
    },
  });

R('identity-with-new-object', 'B', 'MA', 2, ['pitfall'], 'S5796',
  ['Identity comparison with a new object', '새 객체와 동일성 비교를 합니다'],
  ['A freshly created list, dict, set or tuple is never the same object as anything else, so "is" is always False ("is not" always True).', '새로 만든 list, dict, set, tuple은 다른 어떤 것과도 같은 객체가 아니라 "is"는 항상 False("is not"은 항상 True)입니다.'],
  ['Use == to compare contents, or compare with an existing object.', '내용 비교에는 ==를 쓰거나 기존 객체와 비교하세요.'],
  {
    on: {
      Compare(n, c, r) {
        n.ops.forEach((op, i) => {
          if (op !== 'Is' && op !== 'IsNot') return;
          const l = i === 0 ? n.left : n.comparators[i - 1];
          const rt = n.comparators[i];
          if (isNewObject(l) || isNewObject(rt)) r.report(n, `This '${op === 'Is' ? 'is' : 'is not'}' compares with a new object and is always ${op === 'Is' ? 'False' : 'True'}.`, `이 '${op === 'Is' ? 'is' : 'is not'}'는 새 객체와 비교해 항상 ${op === 'Is' ? 'False' : 'True'}입니다.`);
        });
      },
    },
  });

function isNan(c, e) {
  if (!e) return false;
  if (e.type === 'Call' && U.isBuiltinName(e.func, 'float') && e.args[0] && U.strValue(e.args[0]) != null && /^\s*[+-]?nan\s*$/i.test(U.strValue(e.args[0]))) return true;
  const q = c.q(e) || '';
  return /^(?:math|numpy|cmath)\.nan$/.test(q) || q === 'numpy.NaN' || q === 'numpy.NAN';
}

R('nan-comparison', 'B', 'MA', 5, ['pitfall'], 'S6725',
  ['Comparison with NaN', 'NaN과 비교합니다'],
  ['NaN is not equal to anything, itself included, and every ordering comparison with it is False.', 'NaN은 자기 자신을 포함해 어떤 값과도 같지 않고, 순서 비교도 모두 False입니다.'],
  ['Use math.isnan(), numpy.isnan() or pandas isna().', 'math.isnan(), numpy.isnan(), pandas isna()를 쓰세요.'],
  {
    on: {
      Compare(n, c, r) {
        const all = [n.left, ...n.comparators];
        n.ops.forEach((op, i) => {
          if (op === 'Is' || op === 'IsNot' || op === 'In' || op === 'NotIn') return;
          if (isNan(c, all[i]) || isNan(c, all[i + 1])) r.report(n, 'Comparisons with NaN are always False (!= always True); use isnan().', 'NaN과의 비교는 항상 False(!=는 항상 True)입니다. isnan()을 쓰세요.');
        });
      },
    },
  });

R('silly-equality', 'B', 'MA', 5, ['pitfall'], 'S2159',
  ['Equality test between incompatible types', '호환되지 않는 타입 사이의 동등 비교'],
  ['Values of these builtin types are never equal (for example "1" == 1, [] == ()), so the comparison is constant.', '이 내장 타입들의 값은 결코 같지 않아("1" == 1, [] == () 등) 비교 결과가 상수입니다.'],
  ['Convert one side, or compare with a value of the same type.', '한쪽을 변환하거나 같은 타입의 값과 비교하세요.'],
  {
    on: {
      Compare(n, c, r) {
        const all = [n.left, ...n.comparators];
        n.ops.forEach((op, i) => {
          if (op !== 'Eq' && op !== 'NotEq') return;
          const a = operandType(c, all[i]);
          const b = operandType(c, all[i + 1]);
          if (!a || !b) return;
          if (a === 'NoneType' || b === 'NoneType') return; // style rule territory
          if (FAMILY[a] && FAMILY[b] && FAMILY[a] !== FAMILY[b]) {
            r.report(n, `'${a}' and '${b}' values are never equal; this is always ${op === 'Eq' ? 'False' : 'True'}.`, `'${a}'와 '${b}' 값은 결코 같지 않아 항상 ${op === 'Eq' ? 'False' : 'True'}입니다.`);
          }
        });
      },
    },
  });

function constantConditionProblem(c, e) {
  if (!e) return null;
  if (e.type === 'Constant') {
    if (e.kind === 'str' || e.kind === 'bytes') return 'a string literal';
    if ((e.kind === 'int' || e.kind === 'float') && e.value !== 0 && e.value !== 1) return 'a number literal';
    if (e.kind === 'complex') return 'a number literal';
    return null;
  }
  if (e.type === 'JoinedStr') return 'an f-string';
  if (['List', 'Dict', 'Set', 'ListComp', 'DictComp', 'SetComp'].includes(e.type)) return 'a collection literal';
  if (e.type === 'Tuple' && e.elts.length) return 'a non-empty tuple';
  if (e.type === 'GeneratorExp') return 'a generator';
  if (e.type === 'Lambda') return 'a lambda';
  if (e.type === 'Name' && e.sym && e.sym !== BUILTIN) {
    const b = e.sym.bindings;
    if (b.length === 1 && (b[0].kind === 'def') && !e.sym.scope.starImport) return `function '${e.id}' (missing call parentheses?)`;
    if (b.length === 1 && b[0].kind === 'class') return `class '${e.id}'`;
  }
  if (e.type === 'Attribute' && e.value.type === 'Name' && e.value.id === 'self') {
    const fn = U.enclosingDef(e);
    const cls = fn && fn.info && fn.info.cls;
    if (cls && !cls.instanceAttrs.has(e.attr) && !cls.attrs.has(e.attr)) {
      const m = cls.methods.get(e.attr);
      if (m && m.kind === 'method' && !m.redefined && m.decorators.length === 0) return `method 'self.${e.attr}' (missing call parentheses?)`;
    }
  }
  return null;
}

R('constant-condition-literal', 'B', 'MA', 5, ['pitfall', 'cwe-570'], 'S5797',
  ['Constant used as a condition', '상수를 조건으로 씁니다'],
  ['A literal, collection, lambda or function object used as a condition always has the same truth value; often a call or comparison is missing (for example "if x == 1 or 2").', '리터럴, 컬렉션, 람다, 함수 객체를 조건으로 쓰면 참거짓이 항상 같습니다. 호출이나 비교가 빠진 경우가 많습니다(예: "if x == 1 or 2").'],
  ['Write the intended comparison or call the function.', '의도한 비교를 쓰거나 함수를 호출하세요.'],
  {
    on: {
      'If|While|IfExp|Assert'(n, c, r) {
        const test = n.test;
        const check = (e) => {
          const what = constantConditionProblem(c, e);
          if (what) r.report(e, `This condition uses ${what}, so it is always ${what === 'a collection literal' && isEmptyDisplay(e) ? 'false' : 'true'}.`, `이 조건은 ${what}을(를) 써서 항상 같은 값입니다.`);
        };
        if (n.type === 'Assert' && test.type === 'Tuple') return; // assert-on-tuple
        if (test.type === 'BoolOp') { for (const v of test.values) check(v); return; }
        if (test.type === 'UnaryOp' && test.op === 'Not') { check(test.operand); return; }
        check(test);
      },
      comprehension(n, c, r) {
        for (const e of n.ifs) {
          const what = constantConditionProblem(c, e);
          if (what) r.report(e, `This condition uses ${what}, so it is constant.`, `이 조건은 ${what}을(를) 써서 상수입니다.`);
        }
      },
    },
  });
function isEmptyDisplay(e) { return (e.elts && !e.elts.length) || (e.keys && !e.keys.length); }

function ifChain(n) {
  // [ {test, body} ..., else body or null ]
  const branches = [];
  let cur = n;
  for (;;) {
    branches.push({ test: cur.test, body: cur.body, node: cur });
    if (cur.orelse.length === 1 && cur.orelse[0].type === 'If' && cur.orelse[0].isElif) { cur = cur.orelse[0]; continue; }
    return { branches, orelse: cur.orelse.length ? cur.orelse : null };
  }
}

R('all-branches-identical', 'B', 'MA', 10, ['suspicious'], 'S3923',
  ['All branches of a conditional are identical', '조건문의 모든 분기가 같습니다'],
  ['Every branch does exactly the same thing, so the condition is pointless or a branch was meant to differ.', '모든 분기가 똑같은 일을 해서 조건이 쓸모없거나 한 분기가 달라야 했습니다.'],
  ['Remove the conditional or fix the branch that should differ.', '조건문을 지우거나 달라야 할 분기를 고치세요.'],
  {
    on: {
      If(n, c, r) {
        if (n.isElif) return;
        const { branches, orelse } = ifChain(n);
        if (!orelse) return;
        const bodies = [...branches.map((b) => b.body), orelse];
        if (bodies.every((b) => sameList(b, bodies[0]))) r.report(n, 'All branches of this if statement are identical.', '이 if 문의 모든 분기가 같습니다.');
      },
      IfExp(n, c, r) {
        if (same(n.body, n.orelse)) r.report(n, 'Both results of this conditional expression are identical.', '이 조건식의 두 결과가 같습니다.');
      },
      Match(n, c, r) {
        if (n.cases.length < 2) return;
        const last = n.cases[n.cases.length - 1];
        if (!(last.pattern.type === 'MatchAs' && !last.pattern.pattern) || last.guard) return;
        if (n.cases.every((cs) => sameList(cs.body, n.cases[0].body))) r.report(n, 'All cases of this match statement are identical.', '이 match 문의 모든 case가 같습니다.');
      },
    },
  });

R('duplicate-condition', 'B', 'MA', 5, ['suspicious'], 'S1862',
  ['Same condition repeated in an if/elif chain', 'if/elif 연쇄에서 같은 조건이 반복됩니다'],
  ['A later elif with the same condition can never run because the earlier branch already caught it.', '같은 조건의 뒤쪽 elif는 앞 분기가 이미 처리해서 실행될 수 없습니다.'],
  ['Fix the condition or merge the branches.', '조건을 고치거나 분기를 합치세요.'],
  {
    on: {
      If(n, c, r) {
        if (n.isElif) return;
        const { branches } = ifChain(n);
        for (let i = 1; i < branches.length; i++) {
          for (let j = 0; j < i; j++) {
            if (same(branches[i].test, branches[j].test) && isPure(branches[i].test)) {
              r.report(branches[i].test, `This condition duplicates the one on line ${branches[j].test.line}; the branch can never run.`, `이 조건은 ${branches[j].test.line}행 조건과 같아 분기가 실행될 수 없습니다.`);
              break;
            }
          }
        }
      },
    },
  });

function constKey(e) {
  if (!e) return null;
  if (e.type === 'Constant') {
    if (e.kind === 'str') return 's:' + e.value;
    if (e.kind === 'bytes') return 'b:' + e.value;
    if (e.kind === 'int' || e.kind === 'float' || e.kind === 'bool') return 'n:' + Number(e.value);
    if (e.kind === 'None') return 'None';
    return null;
  }
  if (e.type === 'UnaryOp' && e.op === 'USub') { const v = numValue(e); return v == null ? null : 'n:' + v; }
  if (e.type === 'Name' || e.type === 'Attribute') { const d = dotted(e); return d ? 'id:' + d : null; }
  if (e.type === 'Tuple' && e.elts.every((x) => constKey(x))) return 't:(' + e.elts.map(constKey).join(',') + ')';
  return null;
}

R('duplicate-dict-key', 'B', 'MA', 5, ['suspicious'], 'S5781',
  ['Duplicate key in a dict literal', 'dict 리터럴에 중복 키가 있습니다'],
  ['The later entry silently overwrites the earlier one (1, 1.0 and True are the same key).', '뒤 항목이 앞 항목을 조용히 덮어씁니다(1, 1.0, True는 같은 키입니다).'],
  ['Remove or rename the duplicate key.', '중복 키를 지우거나 이름을 바꾸세요.'],
  {
    on: {
      Dict(n, c, r) {
        const seen = new Map();
        n.keys.forEach((k) => {
          const key = constKey(k);
          if (!key) return;
          if (seen.has(key)) r.report(k, `Key '${short(c.slice(k), 30)}' is already defined on line ${seen.get(key).line}.`, `키 '${short(c.slice(k), 30)}'는 이미 ${seen.get(key).line}행에 있습니다.`);
          else seen.set(key, k);
        });
      },
    },
  });

R('duplicate-set-element', 'B', 'MA', 5, ['suspicious'], 'S5781',
  ['Duplicate element in a set literal', 'set 리터럴에 중복 원소가 있습니다'],
  ['The duplicate is dropped silently, which usually means a different value was intended.', '중복 원소는 조용히 버려지며, 보통 다른 값을 의도한 것입니다.'],
  ['Remove the duplicate or fix the value.', '중복을 지우거나 값을 고치세요.'],
  {
    on: {
      Set(n, c, r) {
        const seen = new Map();
        for (const e of n.elts) {
          const key = constKey(e);
          if (!key) continue;
          if (seen.has(key)) r.report(e, `'${short(c.slice(e), 30)}' is already in this set (line ${seen.get(key).line}).`, `'${short(c.slice(e), 30)}'는 이미 이 집합에 있습니다(${seen.get(key).line}행).`);
          else seen.set(key, e);
        }
      },
    },
  });

R('duplicate-argument', 'B', 'BL', 5, ['syntax'], 'S5549',
  ['Duplicate parameter or keyword argument', '매개변수나 키워드 인자가 중복됩니다'],
  ['A function cannot declare the same parameter twice and a call cannot pass the same keyword twice; Python rejects the code.', '함수는 같은 매개변수를 두 번 선언할 수 없고 호출은 같은 키워드를 두 번 넘길 수 없어 Python이 코드를 거부합니다.'],
  ['Rename or remove the duplicate.', '중복을 이름 바꾸거나 지우세요.'],
  {
    on: {
      Call(n, c, r) {
        const seen = new Set();
        for (const k of n.keywords) {
          if (!k.arg) continue;
          if (seen.has(k.arg)) r.report(k, `Keyword argument '${k.arg}' is repeated.`, `키워드 인자 '${k.arg}'가 반복됩니다.`);
          seen.add(k.arg);
        }
      },
      'FunctionDef|AsyncFunctionDef|Lambda'(n, c, r) {
        const a = n.args;
        const seen = new Set();
        for (const p of [...a.posonlyargs, ...a.args, a.vararg, ...a.kwonlyargs, a.kwarg]) {
          if (!p) continue;
          if (seen.has(p.arg)) r.report(p, `Parameter '${p.arg}' is declared twice.`, `매개변수 '${p.arg}'가 두 번 선언됩니다.`);
          seen.add(p.arg);
        }
      },
    },
  });

function isLenCall(e) { return e && e.type === 'Call' && U.isBuiltinName(e.func, 'len') && e.args.length === 1; }

R('collection-size-comparison', 'B', 'MA', 2, ['pitfall'], 'S3981',
  ['Collection size compared with zero in a constant way', '컬렉션 크기를 0과 상수로 비교합니다'],
  ['len() is never negative, so "len(x) >= 0" is always True and "len(x) < 0" always False.', 'len()은 음수가 될 수 없어 "len(x) >= 0"은 항상 True, "len(x) < 0"은 항상 False입니다.'],
  ['Compare with > 0 or == 0 as intended.', '의도에 맞게 > 0 이나 == 0 으로 비교하세요.'],
  {
    on: {
      Compare(n, c, r) {
        if (n.ops.length !== 1) return;
        const l = n.left;
        const rt = n.comparators[0];
        const op = n.ops[0];
        let always = null;
        if (isLenCall(l) && numValue(rt) === 0) { if (op === 'GtE') always = true; if (op === 'Lt') always = false; }
        if (isLenCall(rt) && numValue(l) === 0) { if (op === 'LtE') always = true; if (op === 'Gt') always = false; }
        if (isLenCall(l) && numValue(rt) != null && numValue(rt) < 0 && (op === 'Gt' || op === 'GtE' || op === 'NotEq')) always = true;
        if (always !== null) r.report(n, `This size comparison is always ${always ? 'True' : 'False'}.`, `이 크기 비교는 항상 ${always ? 'True' : 'False'}입니다.`);
      },
    },
  });

const MUTATORS = new Set(['append', 'extend', 'insert', 'remove', 'pop', 'clear', 'add', 'discard', 'update', 'popitem', 'setdefault']);

R('modified-while-iterating', 'B', 'MA', 15, ['pitfall'], null,
  ['Collection modified while iterating over it', '반복 중인 컬렉션을 수정합니다'],
  ['Adding or removing items of a list, dict or set inside a loop over it skips elements or raises RuntimeError ("changed size during iteration").', '반복 중인 list, dict, set에 항목을 추가하거나 지우면 원소를 건너뛰거나 RuntimeError("changed size during iteration")가 납니다.'],
  ['Iterate over a copy (list(x), x.copy()) or build a new collection.', '복사본(list(x), x.copy())을 반복하거나 새 컬렉션을 만드세요.'],
  {
    on: {
      For(n, c, r) {
        let it = n.iter;
        if (it.type === 'Call' && it.func.type === 'Attribute' && ['keys', 'values', 'items'].includes(it.func.attr) && !it.args.length) it = it.func.value;
        if (!(it.type === 'Name' || (it.type === 'Attribute' && dotted(it)))) return;
        if (!isPure(it)) return;
        if (it.type === 'Name' && it.id === 'self') return;
        if (it.type === 'Attribute') { const t = c.type(it); if (!t || t.k !== 'inst' || t.cls || !['list', 'dict', 'set'].includes(t.name)) return; }
        // the name is rebound inside the loop: mutations go to another object
        if (it.type === 'Name' && U.containsNode({ type: 'Module', body: n.body }, (m) => m.type === 'Name' && m.id === it.id && m.ctx === 'Store')) return;
        let hit = null;
        const followedByExit = (node) => {
          let st = node;
          while (st && st.parent && !Array.isArray(st.parent.body)) st = st.parent;
          for (let p = node; p && p !== n; p = p.parent) {
            const par = p.parent;
            if (!par) break;
            for (const key of ['body', 'orelse', 'finalbody']) {
              const list = par[key];
              if (Array.isArray(list) && list.includes(p)) {
                const rest = list.slice(list.indexOf(p) + 1);
                if (rest.some((s) => s.type === 'Break' || s.type === 'Return' || s.type === 'Raise')) return true;
                if (p.type === 'Expr' || p.type === 'Delete' || p.type === 'Assign') { /* keep climbing to the loop */ }
              }
            }
            if (par === n) break;
          }
          void st;
          return false;
        };
        for (const s of n.body) {
          walkLocal(s, (m) => {
            if (hit) return false;
            if (m.type === 'Call' && m.func.type === 'Attribute' && MUTATORS.has(m.func.attr) && same(m.func.value, it)) { if (!followedByExit(m)) hit = m; return false; }
            if (m.type === 'Delete') for (const t of m.targets) if (t.type === 'Subscript' && same(t.value, it) && !followedByExit(m)) hit = m;
            return true;
          }, true);
          if (hit) break;
        }
        if (hit) r.report(hit, `'${short(c.slice(it), 30)}' is modified while the loop on line ${n.line} iterates over it.`, `${n.line}행 반복이 순회하는 중에 '${short(c.slice(it), 30)}'를 수정합니다.`, { events: [{ line: n.line, tag: 'path', text: { en: 'iteration starts here', ko: '여기서 반복을 시작합니다' }, main: false }] });
      },
    },
  });

const STR_PURE = new Set(['strip', 'lstrip', 'rstrip', 'lower', 'upper', 'title', 'capitalize', 'casefold', 'replace', 'format', 'join', 'split', 'rsplit',
  'splitlines', 'startswith', 'endswith', 'encode', 'zfill', 'center', 'ljust', 'rjust', 'swapcase', 'expandtabs', 'removeprefix', 'removesuffix',
  'translate', 'partition', 'rpartition', 'find', 'rfind', 'count', 'isdigit', 'isalpha', 'isalnum', 'isspace', 'islower', 'isupper', 'decode', 'hex']);
const PURE_BUILTINS = new Set(['sorted', 'len', 'abs', 'round', 'min', 'max', 'sum', 'str', 'int', 'float', 'bool', 'repr', 'list', 'tuple', 'dict', 'set',
  'frozenset', 'reversed', 'map', 'filter', 'zip', 'enumerate', 'any', 'all', 'hash', 'isinstance', 'issubclass', 'callable', 'chr', 'ord', 'hex', 'oct',
  'bin', 'format', 'divmod', 'pow', 'bytes', 'ascii']);

R('return-value-ignored', 'B', 'MA', 5, ['pitfall'], 'S2201',
  ['Return value of a side-effect-free call is ignored', '부수 효과 없는 호출의 반환값을 버립니다'],
  ['The call does nothing but compute a result (strings are immutable, sorted() returns a new list, map() is lazy), so ignoring the result means the work is lost.', '이 호출은 결과만 계산하므로(문자열은 불변, sorted()는 새 리스트 반환, map()은 지연 평가) 결과를 버리면 작업이 사라집니다.'],
  ['Use the result (assign it), or call the in-place variant (list.sort()).', '결과를 사용(대입)하거나 제자리 버전(list.sort())을 호출하세요.'],
  {
    on: {
      Expr(n, c, r) {
        if (c.lineMap) return;
        const v = n.value;
        if (v.type !== 'Call') return;
        if (U.caughtBy(n, ['Exception', 'BaseException', 'ValueError', 'TypeError', 'KeyError', 'IndexError', 'AttributeError', 'LookupError', 'OverflowError', 'UnicodeError', 'UnicodeDecodeError', 'UnicodeEncodeError'])) return;
        const f = v.func;
        if (f.type === 'Name' && f.sym === BUILTIN && PURE_BUILTINS.has(f.id)) {
          r.report(v, `The result of '${f.id}()' is ignored.`, `'${f.id}()'의 결과를 버립니다.`);
          return;
        }
        if (f.type === 'Attribute' && STR_PURE.has(f.attr)) {
          const t = c.type(f.value);
          if (t && t.k === 'inst' && !t.cls && (t.name === 'str' || t.name === 'bytes')) r.report(v, `The result of '${f.attr}()' is ignored; ${t.name} values are immutable.`, `'${f.attr}()'의 결과를 버립니다. ${t.name} 값은 불변입니다.`);
        }
      },
    },
  });

R('strange-operator', 'B', 'MA', 2, ['pitfall'], 'S2757',
  ['"=+" or "=-" instead of "+=" or "-="', '"+=" 나 "-=" 대신 "=+" 나 "=-"를 씁니다'],
  ['"x =+ 1" assigns +1 instead of incrementing x; the operator characters are reversed.', '"x =+ 1"은 x를 늘리지 않고 +1을 대입합니다. 연산자 문자 순서가 바뀌었습니다.'],
  ['Write "x += 1" or, for a unary sign, "x = +1".', '"x += 1"로 쓰거나 부호라면 "x = +1"로 쓰세요.'],
  {
    module(c, r) {
      const toks = c.tokens;
      for (let i = 1; i + 2 < toks.length; i++) {
        const t = toks[i];
        const o = toks[i + 1];
        const nx = toks[i + 2];
        if (t.t !== 'OP' || t.v !== '=' || o.t !== 'OP' || (o.v !== '+' && o.v !== '-')) continue;
        if (o.line !== t.line || o.col !== t.col + 1) continue;
        const pv = toks[i - 1];
        if (pv.line !== t.line || pv.endCol >= t.col) continue; // need a space before '='
        if (nx.line !== o.line || nx.col <= o.col + 1) continue; // need a space after the sign
        r.report({ line: t.line, col: t.col, endLine: o.line, endCol: o.col + 1 }, `Was '${o.v}=' meant instead of '=${o.v}'?`, `'=${o.v}' 대신 '${o.v}='를 의도했나요?`);
      }
    },
  });

R('implicit-string-concatenation', 'B', 'MA', 5, ['pitfall'], 'S5799',
  ['Implicit string concatenation in a collection or call', '컬렉션이나 호출에서 문자열이 암묵적으로 이어집니다'],
  ['Two adjacent string literals inside a list, tuple, set or argument list are joined into one; usually a comma is missing.', 'list, tuple, set, 인자 목록 안에서 붙은 두 문자열 리터럴은 하나로 합쳐집니다. 보통 쉼표가 빠졌습니다.'],
  ['Add the missing comma, or wrap an intended concatenation in parentheses.', '빠진 쉼표를 넣거나 의도한 연결이면 괄호로 감싸세요.'],
  {
    on: {
      'Constant|JoinedStr'(n, c, r) {
        if (!n.implicitConcat || n.parenthesized) return;
        const p = n.parent;
        if (!p || !(((p.type === 'List' || p.type === 'Tuple' || p.type === 'Set') && p.elts.length > 1) || (p.type === 'Call' && p.args.includes(n) && p.args.length > 1))) return;
        const parts = n.implicitConcat;
        for (let i = 1; i < parts.length; i++) {
          if (parts[i].line === parts[i - 1].endLine) {
            r.report(n, 'Add a comma or parentheses: these adjacent string literals are concatenated implicitly.', '쉼표나 괄호를 넣으세요. 붙은 문자열 리터럴이 암묵적으로 이어집니다.');
            return;
          }
        }
      },
    },
  });

R('assert-on-tuple', 'B', 'MA', 2, ['pitfall'], 'S5905',
  ['Assert on a tuple', '튜플에 assert를 씁니다'],
  ['A non-empty tuple is always true, so "assert (cond, msg)" never fails.', '비어 있지 않은 튜플은 항상 참이라 "assert (cond, msg)"는 실패하지 않습니다.'],
  ['Remove the parentheses: assert cond, msg', '괄호를 빼세요: assert cond, msg'],
  {
    on: {
      Assert(n, c, r) {
        if (n.test.type === 'Tuple' && n.test.elts.length) r.report(n, 'This assert is on a non-empty tuple and always passes.', '이 assert는 비어 있지 않은 튜플이라 항상 통과합니다.');
      },
    },
  });

const MUTABLE_DEFAULT_CALLS = /^(?:list|dict|set|bytearray|collections\.defaultdict|collections\.deque|collections\.OrderedDict|collections\.Counter|defaultdict|deque|OrderedDict|Counter)$/;
const PARAM_MUTATORS = new Set([...MUTATORS, 'sort', 'reverse', '__setitem__', '__delitem__', 'appendleft', 'extendleft', 'popleft']);

R('mutable-default-argument', 'B', 'CR', 10, ['pitfall'], 'S5717',
  ['Mutable default argument is modified', '가변 기본 인자를 수정합니다'],
  ['The default value is created once when the function is defined and shared by every call, so changes leak from one call to the next.', '기본값은 함수 정의 시 한 번만 만들어져 모든 호출이 공유하므로, 변경이 다음 호출로 새어 나갑니다.'],
  ['Default to None and create the object inside the function.', '기본값을 None으로 두고 함수 안에서 객체를 만드세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        const a = n.args;
        const pairs = [];
        const pos = [...a.posonlyargs, ...a.args];
        a.defaults.forEach((d, i) => pairs.push([pos[pos.length - a.defaults.length + i], d]));
        a.kwonlyargs.forEach((p, i) => { if (a.kw_defaults[i]) pairs.push([p, a.kw_defaults[i]]); });
        for (const [p, d] of pairs) {
          const mutable = ['List', 'Dict', 'Set', 'ListComp', 'DictComp', 'SetComp'].includes(d.type) || (d.type === 'Call' && MUTABLE_DEFAULT_CALLS.test(c.q(d.func) || dotted(d.func) || ''));
          if (!mutable || !p || p.arg.startsWith('_') || /cache|memo|registry|seen/i.test(p.arg)) continue;
          const sym = n.scope && n.scope.symbols.get(p.arg);
          if (!sym || sym.bindings.length !== 1) continue; // reassigned: the default is replaced
          let how = null;
          for (const u of sym.uses) {
            const par = u.parent;
            if (!par) continue;
            if (par.type === 'Attribute' && par.value === u && PARAM_MUTATORS.has(par.attr) && par.parent && par.parent.type === 'Call' && par.parent.func === par) { how = `'${p.arg}.${par.attr}()'`; break; }
            if (par.type === 'Subscript' && par.value === u && par.ctx !== 'Load') { how = `item assignment on '${p.arg}'`; break; }
            if (par.type === 'AugAssign' && par.target === u) { how = `'${p.arg} ${'+='}'`; break; }
            if (u.augUse) { how = `'${p.arg} +='`; break; }
          }
          if (how) r.report(d, `The default value of '${p.arg}' is shared between calls and is modified here by ${how}.`, `'${p.arg}'의 기본값은 호출 간에 공유되는데 ${how}로 수정됩니다.`);
        }
      },
    },
  });

R('init-return-value', 'B', 'BL', 5, ['pitfall'], 'S2734',
  ['__init__ returns a value or is a generator', '__init__가 값을 반환하거나 제너레이터입니다'],
  ['__init__ must return None; returning a value or yielding raises TypeError when the object is created.', '__init__는 None을 반환해야 하며, 값을 반환하거나 yield하면 객체 생성 시 TypeError가 납니다.'],
  ['Remove the return value / yield from __init__.', '__init__에서 반환값이나 yield를 지우세요.'],
  {
    on: {
      FunctionDef(n, c, r) {
        if (n.name !== '__init__' || !n.info || !n.info.cls) return;
        walkLocal(n, (m) => {
          if (m.type === 'Return' && m.value && !isNone(m.value)) r.report(m, '__init__ should not return a value.', '__init__는 값을 반환하면 안 됩니다.');
          if (m.type === 'Yield' || m.type === 'YieldFrom') r.report(m, '__init__ should not be a generator.', '__init__는 제너레이터이면 안 됩니다.');
          return true;
        });
      },
    },
  });

const DUNDER_ARITY = {
  __del__: [0, 0], __repr__: [0, 0], __str__: [0, 0], __bytes__: [0, 0], __format__: [1, 1], __lt__: [1, 1], __le__: [1, 1], __eq__: [1, 1],
  __ne__: [1, 1], __gt__: [1, 1], __ge__: [1, 1], __hash__: [0, 0], __bool__: [0, 0], __getattr__: [1, 1], __getattribute__: [1, 1], __setattr__: [2, 2],
  __delattr__: [1, 1], __dir__: [0, 0], __get__: [1, 2], __set__: [2, 2], __delete__: [1, 1], __set_name__: [2, 2], __instancecheck__: [1, 1],
  __subclasscheck__: [1, 1], __len__: [0, 0], __length_hint__: [0, 0], __getitem__: [1, 1], __setitem__: [2, 2], __delitem__: [1, 1], __missing__: [1, 1],
  __iter__: [0, 0], __reversed__: [0, 0], __contains__: [1, 1], __neg__: [0, 0], __pos__: [0, 0], __abs__: [0, 0], __invert__: [0, 0], __complex__: [0, 0],
  __int__: [0, 0], __float__: [0, 0], __index__: [0, 0], __round__: [0, 1], __trunc__: [0, 0], __floor__: [0, 0], __ceil__: [0, 0], __enter__: [0, 0],
  __exit__: [3, 3], __await__: [0, 0], __aiter__: [0, 0], __anext__: [0, 0], __aenter__: [0, 0], __aexit__: [3, 3], __pow__: [1, 2], __rpow__: [1, 2],
  __reduce__: [0, 0], __reduce_ex__: [1, 1], __getstate__: [0, 0], __setstate__: [1, 1], __copy__: [0, 0], __deepcopy__: [1, 1], __sizeof__: [0, 0],
  __fspath__: [0, 0], __next__: [0, 0], __getnewargs__: [0, 0], __getnewargs_ex__: [0, 0],
};
for (const op of ['add', 'sub', 'mul', 'matmul', 'truediv', 'floordiv', 'mod', 'divmod', 'lshift', 'rshift', 'and', 'xor', 'or']) {
  DUNDER_ARITY[`__${op}__`] = [1, 1];
  DUNDER_ARITY[`__r${op}__`] = [1, 1];
  DUNDER_ARITY[`__i${op}__`] = [1, 1];
}
DUNDER_ARITY.__ipow__ = [1, 2];

R('special-method-signature', 'B', 'BL', 10, ['pitfall'], 'S5722',
  ['Special method has the wrong number of parameters', '특수 메서드의 매개변수 개수가 잘못됐습니다'],
  ['Python calls special methods (__eq__, __exit__, __getitem__, ...) with a fixed number of arguments; a different signature raises TypeError when the protocol is used.', 'Python은 특수 메서드(__eq__, __exit__, __getitem__ 등)를 정해진 개수의 인자로 호출하므로, 시그니처가 다르면 프로토콜 사용 시 TypeError가 납니다.'],
  ['Declare the parameters the protocol expects.', '프로토콜이 기대하는 매개변수를 선언하세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        const ar = DUNDER_ARITY[n.name];
        if (!ar || !n.info || !n.info.cls || n.info.kind !== 'method') return;
        if (n.info.decorators.length) return;
        const a = n.args;
        const pos = [...a.posonlyargs, ...a.args];
        if (!pos.length) return; // method-missing-self
        const params = pos.slice(1);
        const requiredKw = a.kwonlyargs.filter((p, i) => !a.kw_defaults[i]).length;
        const min = params.length - a.defaults.length;
        const max = a.vararg ? Infinity : params.length;
        if (requiredKw || ar[1] < min || ar[0] > max) {
          const exp = ar[0] === ar[1] ? `${ar[0]}` : `${ar[0]} to ${ar[1]}`;
          r.report(n, `'${n.name}' should take ${exp} parameter${ar[1] === 1 ? '' : 's'} besides self.`, `'${n.name}'는 self 외에 매개변수 ${exp}개를 받아야 합니다.`);
        }
      },
    },
  });

R('property-accessor-signature', 'B', 'BL', 5, ['pitfall'], 'S5724',
  ['Property getter, setter or deleter has the wrong parameters', '프로퍼티 getter/setter/deleter의 매개변수가 잘못됐습니다'],
  ['A getter and deleter receive only self, a setter receives self and the value; other signatures raise TypeError on access.', 'getter와 deleter는 self만, setter는 self와 값을 받으며, 다른 시그니처는 접근 시 TypeError가 납니다.'],
  ['Fix the parameter list.', '매개변수 목록을 고치세요.'],
  {
    on: {
      FunctionDef(n, c, r) {
        // a redefined name (the setter/deleter of a property) gets no FunctionInfo
        let d;
        if (n.info && n.info.cls) d = n.info.decorators;
        else if (!n.info && n.parent && n.parent.type === 'ClassDef') d = n.decorator_list.map((x) => dotted(x.type === 'Call' ? x.func : x) || '?');
        else return;
        let want = null;
        if (d.includes('property')) want = 1;
        else if (d.some((x) => x.endsWith('.setter'))) want = 2;
        else if (d.some((x) => x.endsWith('.deleter') || x.endsWith('.getter'))) want = 1;
        if (!want) return;
        const a = n.args;
        const pos = [...a.posonlyargs, ...a.args];
        const required = pos.length - a.defaults.length;
        if ((required > want || (pos.length < want && !a.vararg)) && !(want === 1 && pos.length === 0 && a.vararg)) {
          r.report(n, `This property ${want === 2 ? 'setter' : 'accessor'} should take ${want === 2 ? 'self and a value' : 'only self'}.`, `이 프로퍼티 ${want === 2 ? 'setter' : '접근자'}는 ${want === 2 ? 'self와 값' : 'self만'}을 받아야 합니다.`);
        }
      },
    },
  });

R('method-missing-self', 'B', 'BL', 5, ['pitfall'], 'S5719',
  ['Instance method without a self parameter', 'self 매개변수가 없는 인스턴스 메서드'],
  ['Calling the method on an instance passes the instance as first argument; with no parameter for it, the call raises TypeError.', '인스턴스에서 메서드를 호출하면 인스턴스가 첫 인자로 전달되는데, 받을 매개변수가 없어 TypeError가 납니다.'],
  ['Add self as first parameter, or decorate the method with @staticmethod.', 'self를 첫 매개변수로 추가하거나 @staticmethod로 꾸미세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        if (!n.info || !n.info.cls || n.info.kind !== 'method') return;
        if (n.info.decorators.some((d) => !/(?:^|\.)abstractmethod$|(?:^|\.)override$/.test(d))) return;
        if (n.name === '__init_subclass__' || n.name === '__class_getitem__' || n.name === '__new__') return;
        const a = n.args;
        if (a.posonlyargs.length || a.args.length || a.vararg) return;
        const clsNode = n.parent;
        if (U.containsNode(clsNode, (m) => (m.type === 'Attribute' && m.value.type === 'Name' && (m.value.id === 'cls' || m.value.id === clsNode.name) && m.attr === n.name) || (m.type === 'Call' && U.isBuiltinName(m.func, 'getattr') && m.args[0] && m.args[0].type === 'Name' && (m.args[0].id === 'cls' || m.args[0].id === clsNode.name)))) return;
        r.report(n, `Add 'self' as the first parameter of '${n.name}', or make it a staticmethod.`, `'${n.name}'의 첫 매개변수로 'self'를 추가하거나 staticmethod로 만드세요.`);
      },
    },
  });

R('open-invalid-mode', 'B', 'BL', 5, ['pitfall'], 'S5828',
  ['Invalid mode in open()', 'open()의 모드가 잘못됐습니다'],
  ['The mode must contain exactly one of r, w, x, a, at most one +, and not both b and t; otherwise open() raises ValueError.', '모드에는 r, w, x, a 중 정확히 하나, + 는 최대 하나가 있어야 하고 b와 t를 함께 쓸 수 없으며, 아니면 open()이 ValueError를 냅니다.'],
  ['Use a valid mode such as "r", "wb", "a+" or "rt".', '"r", "wb", "a+", "rt" 같은 올바른 모드를 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        const q = U.callName(c, n);
        if (q !== 'open' && q !== 'io.open') return;
        const m = astArg(n, 1, 'mode');
        const mode = U.strValue(m);
        if (mode == null) return;
        const ok = /^[rwxabt+]+$/.test(mode) && (mode.match(/[rwxa]/g) || []).length === 1 && (mode.match(/\+/g) || []).length <= 1 && !(mode.includes('b') && mode.includes('t')) && new Set(mode).size === mode.length;
        if (!ok) r.report(m, `'${mode}' is not a valid file mode.`, `'${mode}'는 올바른 파일 모드가 아닙니다.`);
      },
    },
  });

// printf-style directives
function printfDirectives(s) {
  const re = /%(?:\(([^)]*)\))?([#0\- +]*)(\*|\d+)?(?:\.(\*|\d+))?[hlL]?(.?)/g;
  const out = { count: 0, names: [], invalid: null, mixed: false };
  let m;
  while ((m = re.exec(s))) {
    const conv = m[5];
    if (conv === '%' && !m[1] && !m[2] && !m[3] && !m[4]) continue;
    if (!/[diouxXeEfFgGcrsab%]/.test(conv) || conv === '') { out.invalid = conv || 'end of string'; return out; }
    if (m[1] != null) out.names.push(m[1]);
    else out.count += 1 + (m[3] === '*' ? 1 : 0) + (m[4] === '*' ? 1 : 0);
  }
  if (out.names.length && out.count) out.mixed = true;
  return out;
}

function formatFields(s) {
  const out = { auto: 0, indexes: [], names: [], invalid: false, mixed: false };
  const scan = (str, depth) => {
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '{') {
        if (str[i + 1] === '{' && depth === 0) { i++; continue; }
        let j = i + 1;
        let d = 1;
        while (j < str.length && d > 0) { if (str[j] === '{') d++; else if (str[j] === '}') d--; if (d) j++; }
        if (d) { out.invalid = true; return; }
        const body = str.slice(i + 1, j);
        const m = /^([^!:]*)(?:![rsa])?(?::(.*))?$/s.exec(body);
        const field = m ? m[1] : body;
        const head = field.split(/[.[]/)[0];
        if (head === '') out.auto++;
        else if (/^\d+$/.test(head)) out.indexes.push(Number(head));
        else out.names.push(head);
        if (m && m[2] && depth < 1) scan(m[2], depth + 1);
        i = j;
      } else if (ch === '}') {
        if (str[i + 1] === '}' && depth === 0) { i++; continue; }
        if (depth === 0) { out.invalid = true; return; }
      }
    }
  };
  scan(s, 0);
  if (out.auto && out.indexes.length) out.mixed = true;
  return out;
}

R('string-format-mismatch', 'B', 'BL', 10, ['pitfall'], 'S2275',
  ['Format string does not match its arguments', '포맷 문자열이 인자와 맞지 않습니다'],
  ['The number or names of placeholders in a %-format or str.format() string differ from the arguments, which raises TypeError / KeyError / IndexError or silently drops values.', '%-포맷이나 str.format() 문자열의 자리표시자 개수나 이름이 인자와 달라 TypeError/KeyError/IndexError가 나거나 값이 조용히 버려집니다.'],
  ['Make the placeholders and the arguments agree.', '자리표시자와 인자를 맞추세요.'],
  {
    on: {
      BinOp(n, c, r) {
        if (n.op !== 'Mod') return;
        const s = n.left.type === 'Constant' && n.left.kind === 'str' ? n.left.value : null;
        if (s == null) return;
        const d = printfDirectives(s);
        if (d.invalid) { r.report(n.left, `Invalid conversion '%${d.invalid}' in format string.`, `포맷 문자열의 변환 '%${d.invalid}'가 잘못됐습니다.`); return; }
        if (d.mixed) { r.report(n.left, 'Format string mixes named and positional placeholders.', '포맷 문자열에 이름 있는 자리표시자와 위치 자리표시자가 섞여 있습니다.'); return; }
        const rhs = n.right;
        if (d.names.length) {
          if (rhs.type === 'Dict' && rhs.keys.every((k) => k && k.type === 'Constant' && k.kind === 'str')) {
            const keys = new Set(rhs.keys.map((k) => k.value));
            const miss = d.names.filter((x) => !keys.has(x));
            if (miss.length) r.report(n, `Key '${miss[0]}' is missing from the format mapping.`, `포맷 매핑에 키 '${miss[0]}'가 없습니다.`);
          } else if (rhs.type === 'Tuple' || rhs.type === 'List' || (rhs.type === 'Constant' && rhs.kind !== 'None')) {
            r.report(n, 'Named placeholders need a mapping on the right of %.', '이름 있는 자리표시자에는 % 오른쪽에 매핑이 필요합니다.');
          }
          return;
        }
        let given = null;
        if (rhs.type === 'Tuple') { if (rhs.elts.some((e) => e.type === 'Starred')) return; given = rhs.elts.length; } else if (['Constant', 'JoinedStr', 'List', 'Dict', 'Set', 'ListComp', 'Compare'].includes(rhs.type)) given = rhs.type === 'Dict' ? (d.count <= 1 ? 1 : 0) : 1;
        else {
          const t = c.type(rhs);
          if (t && t.k === 'inst' && !t.cls && ['str', 'int', 'float', 'bool', 'list', 'bytes', 'set'].includes(t.name)) given = 1;
        }
        if (given == null || given === d.count) return;
        r.report(n, `Format string expects ${d.count} argument${d.count === 1 ? '' : 's'} but ${given} ${given === 1 ? 'is' : 'are'} given.`, `포맷 문자열은 인자 ${d.count}개를 기대하는데 ${given}개를 넘깁니다.`);
      },
      Call(n, c, r) {
        const f = n.func;
        if (f.type !== 'Attribute' || f.attr !== 'format' || !(f.value.type === 'Constant' && f.value.kind === 'str')) return;
        const d = formatFields(f.value.value);
        if (d.invalid) { r.report(f.value, 'Unbalanced braces in format string.', '포맷 문자열의 중괄호 짝이 맞지 않습니다.'); return; }
        if (d.mixed) { r.report(f.value, 'Format string mixes automatic and manual field numbering.', '포맷 문자열에 자동 필드 번호와 수동 필드 번호가 섞여 있습니다.'); return; }
        const star = n.args.some((a) => a.type === 'Starred');
        const kwSplat = n.keywords.some((k) => k.arg === null);
        if (!star) {
          const need = d.auto || (d.indexes.length ? Math.max(...d.indexes) + 1 : 0);
          if (need > n.args.length) { r.report(n, `Format string needs ${need} positional argument${need === 1 ? '' : 's'} but ${n.args.length} ${n.args.length === 1 ? 'is' : 'are'} given.`, `포맷 문자열은 위치 인자 ${need}개가 필요한데 ${n.args.length}개를 넘깁니다.`); return; }
          if (n.args.length > need && !d.names.length) { r.report(n, `${n.args.length - need} positional argument${n.args.length - need === 1 ? ' is' : 's are'} not used by the format string.`, `위치 인자 ${n.args.length - need}개를 포맷 문자열이 쓰지 않습니다.`); return; }
        }
        if (!kwSplat) {
          const kws = new Set(n.keywords.map((k) => k.arg));
          const miss = d.names.filter((x) => !kws.has(x));
          if (miss.length) r.report(n, `Keyword '${miss[0]}' used in the format string is not passed.`, `포맷 문자열에 쓴 키워드 '${miss[0]}'를 넘기지 않습니다.`);
        }
      },
    },
  });

function asyncRule(id, sonar, names, qnames, en, ko, why, fix) {
  R(id, 'S', 'MA', 10, ['async', 'performance'], sonar, [en, ko], why, fix, {
    on: {
      Call(n, c, r) {
        if (!U.inAsync(n)) return;
        const q = c.q(n.func);
        if (!q) return;
        if (!(qnames.includes(q) || names.some((p) => q.startsWith(p)))) return;
        r.report(n, `'${q}' blocks the event loop inside an async function.`, `async 함수 안의 '${q}'는 이벤트 루프를 막습니다.`);
      },
    },
  });
}
asyncRule('async-time-sleep', 'S7493', [], ['time.sleep'], 'time.sleep() in an async function', 'async 함수에서 time.sleep()을 씁니다',
  ['time.sleep blocks the whole event loop, freezing every other task.', 'time.sleep은 이벤트 루프 전체를 막아 다른 모든 작업을 멈춥니다.'],
  ['Use await asyncio.sleep(...).', 'await asyncio.sleep(...)을 쓰세요.']);
asyncRule('async-sync-http', 'S7499', ['requests.', 'urllib.request.urlopen', 'urllib3.'], ['httpx.get', 'httpx.post', 'httpx.put', 'httpx.delete', 'httpx.request', 'http.client.HTTPConnection'],
  'Synchronous HTTP call in an async function', 'async 함수에서 동기 HTTP 호출을 합니다',
  ['A blocking HTTP request stalls the event loop for the whole round trip.', '블로킹 HTTP 요청은 왕복하는 동안 이벤트 루프를 멈춥니다.'],
  ['Use an async client (httpx.AsyncClient, aiohttp) or run it in a thread with asyncio.to_thread.', '비동기 클라이언트(httpx.AsyncClient, aiohttp)를 쓰거나 asyncio.to_thread로 스레드에서 실행하세요.']);
asyncRule('async-sync-subprocess', 'S7487', [], ['subprocess.run', 'subprocess.call', 'subprocess.check_call', 'subprocess.check_output', 'subprocess.getoutput', 'subprocess.getstatusoutput', 'os.system', 'os.popen', 'os.waitpid'],
  'Blocking subprocess call in an async function', 'async 함수에서 블로킹 서브프로세스를 호출합니다',
  ['Waiting for a child process synchronously blocks the event loop.', '자식 프로세스를 동기로 기다리면 이벤트 루프가 막힙니다.'],
  ['Use asyncio.create_subprocess_exec / create_subprocess_shell.', 'asyncio.create_subprocess_exec / create_subprocess_shell을 쓰세요.']);
asyncRule('async-input', 'S7501', [], ['input'], 'input() in an async function', 'async 함수에서 input()을 씁니다',
  ['input() blocks the event loop until the user types something.', 'input()은 사용자가 입력할 때까지 이벤트 루프를 막습니다.'],
  ['Read stdin asynchronously or run input() with asyncio.to_thread.', 'stdin을 비동기로 읽거나 asyncio.to_thread로 input()을 실행하세요.']);

R('asyncio-task-not-saved', 'B', 'MA', 5, ['async'], 'S7502',
  ['Result of asyncio.create_task() is discarded', 'asyncio.create_task() 결과를 버립니다'],
  ['The event loop keeps only a weak reference to tasks; a task nobody references can be garbage-collected before it finishes.', '이벤트 루프는 작업을 약하게만 참조해서, 아무도 참조하지 않는 작업은 끝나기 전에 가비지 컬렉션될 수 있습니다.'],
  ['Keep a reference (for example in a set) until the task is done, or use a TaskGroup.', '작업이 끝날 때까지 참조를 유지(예: set에 보관)하거나 TaskGroup을 쓰세요.'],
  {
    on: {
      Expr(n, c, r) {
        const v = n.value;
        if (v.type !== 'Call') return;
        const q = c.q(v.func) || '';
        const d = dotted(v.func) || '';
        if (q === 'asyncio.create_task' || q === 'asyncio.ensure_future' || /(?:^|\.)loop\.create_task$/.test(d) || (/\.create_task$/.test(d) && /loop/i.test(d))) {
          r.report(v, 'Save a reference to this task; otherwise it may be garbage-collected before it completes.', '이 작업의 참조를 보관하세요. 아니면 끝나기 전에 가비지 컬렉션될 수 있습니다.');
        }
      },
    },
  });

R('cancelled-error-swallowed', 'B', 'MA', 10, ['async', 'error-handling'], 'S7497',
  ['asyncio.CancelledError caught and not re-raised', 'asyncio.CancelledError를 잡고 다시 던지지 않습니다'],
  ['Swallowing CancelledError breaks task cancellation: the task keeps running and awaiting code (timeouts, TaskGroup) misbehaves.', 'CancelledError를 삼키면 작업 취소가 깨져 작업이 계속 돌고 기다리는 코드(타임아웃, TaskGroup)가 오동작합니다.'],
  ['Re-raise the exception after cleanup.', '정리한 뒤 예외를 다시 던지세요.'],
  {
    on: {
      ExceptHandler(n, c, r) {
        if (!n.etype || !U.inAsync(n)) return;
        const ts = n.etype.type === 'Tuple' ? n.etype.elts : [n.etype];
        if (!ts.some((t) => (c.q(t) || dotted(t) || '') === 'asyncio.CancelledError' || (c.q(t) || '') === 'asyncio.exceptions.CancelledError')) return;
        const reraises = U.containsLocal({ type: 'Module', body: n.body }, (m) => m.type === 'Raise');
        if (!reraises) r.report(n.etype, 'Re-raise asyncio.CancelledError after cleanup.', '정리한 뒤 asyncio.CancelledError를 다시 던지세요.');
      },
    },
  });

R('loop-else-without-break', 'S', 'MA', 5, ['confusing'], 'S2836',
  ['Loop else clause without break', 'break 없는 반복문의 else 절'],
  ['The else block of a loop runs when the loop ends without break; with no break in the loop it always runs, which is misleading.', '반복문의 else 블록은 break 없이 끝날 때 실행되는데, break가 없으면 항상 실행되어 오해를 부릅니다.'],
  ['Move the else body after the loop, or add the missing break.', 'else 본문을 반복문 뒤로 옮기거나 빠진 break를 추가하세요.'],
  {
    on: {
      'For|While|AsyncFor'(n, c, r) {
        if (!n.orelse.length) return;
        let found = false;
        const visit = (s, depth) => {
          if (found || !s) return;
          if (s.type === 'Break' && depth === 0) { found = true; return; }
          if (FUNC_TYPES.has(s.type) || s.type === 'ClassDef' || s.type === 'Lambda') return;
          const loop = s.type === 'For' || s.type === 'While' || s.type === 'AsyncFor';
          for (const ch of children(s)) {
            if (loop && s.orelse.includes(ch)) visit(ch, depth); else visit(ch, depth + (loop ? 1 : 0));
          }
        };
        for (const s of n.body) visit(s, 0);
        if (!found) r.report(n.orelse[0], "This 'else' always runs: the loop has no 'break'.", "이 'else'는 항상 실행됩니다. 반복문에 'break'가 없습니다.");
      },
    },
  });

R('statement-no-effect', 'B', 'MA', 5, ['suspicious'], 'S905',
  ['Statement has no effect', '효과가 없는 문장'],
  ['The expression is evaluated and thrown away (a comparison instead of an assignment, a bare name, arithmetic), so the statement does nothing.', '식을 계산하고 버리므로(대입 대신 비교, 맨 이름, 산술) 문장이 아무 일도 하지 않습니다.'],
  ['Turn it into an assignment, a call or remove it.', '대입이나 호출로 바꾸거나 지우세요.'],
  {
    on: {
      Expr(n, c, r) {
        if (c.lineMap) return;
        const v = n.value;
        let what = null;
        const noCalls = () => !U.containsNode(v, (m) => m.type === 'Call' || m.type === 'Await' || m.type === 'Yield' || m.type === 'YieldFrom' || m.type === 'NamedExpr');
        if (v.type === 'Compare' && noCalls()) what = 'comparison';
        else if (v.type === 'BinOp' && noCalls()) what = 'expression';
        else if (v.type === 'UnaryOp' && noCalls()) what = 'expression';
        else if (v.type === 'Name') what = 'name';
        else if (v.type === 'Constant' && (v.kind === 'int' || v.kind === 'float' || v.kind === 'bytes' || v.kind === 'bool' || v.kind === 'None' || v.kind === 'complex')) what = 'literal';
        else if ((v.type === 'List' || v.type === 'Tuple' || v.type === 'Set' || v.type === 'Dict') && noCalls()) what = 'collection literal';
        else if (v.type === 'Lambda') what = 'lambda';
        if (!what) return;
        if (U.caughtBy(n, ['Exception', 'BaseException', 'NameError', 'TypeError', 'ValueError', 'AttributeError', 'KeyError', 'IndexError', 'LookupError', 'ZeroDivisionError', 'ArithmeticError', 'OverflowError', 'UnboundLocalError', 'RecursionError', 'MemoryError', 'AssertionError', 'NotImplementedError', 'RuntimeError', 'ImportError', 'SyntaxError'])) return;
        if (v.type === 'Name' && (v.id === '__all__' || v.id === '__doc__')) return;
        if (c.isTest && (v.type === 'Name' || v.type === 'Compare')) return;
        r.report(n, `This ${what} statement has no effect.`, `이 ${what === 'comparison' ? '비교' : what === 'name' ? '이름' : what === 'literal' ? '리터럴' : what === 'lambda' ? '람다' : '식'} 문장은 효과가 없습니다.`);
      },
    },
  });

const IMMEDIATE = /^(?:sorted|min|max|map|filter|any|all|sum|reduce|functools\.reduce|itertools\.groupby|groupby|next|list|tuple|set|dict|enumerate|zip|apply|heapq\.\w+|bisect\.\w+|re\.sub|.*\.sort|.*\.apply|.*\.map|.*\.agg|.*\.transform|.*\.applymap|.*\.pipe|.*\.filter|.*\.sub|.*\.replace|.*\.groupby|.*\.sort_values|.*\.key)$/;

R('loop-variable-closure', 'B', 'MA', 10, ['pitfall'], 'S1515',
  ['Function or lambda captures a loop variable', '함수나 람다가 반복 변수를 캡처합니다'],
  ['Closures look the variable up when they run, not when they are created, so every callback created in the loop sees the last value.', '클로저는 만들어질 때가 아니라 실행될 때 변수를 찾아서, 반복문에서 만든 모든 콜백이 마지막 값을 봅니다.'],
  ['Bind the current value with a default argument (lambda i=i: ...) or functools.partial.', '기본 인자(lambda i=i: ...)나 functools.partial로 현재 값을 묶으세요.'],
  {
    on: {
      'Lambda|FunctionDef|AsyncFunctionDef'(n, c, r) {
        // find an enclosing loop in the same function
        let loop = null;
        let p = n.parent;
        let child = n;
        while (p && !FUNC_TYPES.has(p.type) && p.type !== 'Lambda' && p.type !== 'Module' && p.type !== 'ClassDef') {
          if ((p.type === 'For' || p.type === 'AsyncFor' || p.type === 'While') && p.body.includes(child)) { loop = p; break; }
          if (/^(?:ListComp|SetComp|DictComp|GeneratorExp)$/.test(p.type)) return;
          child = p;
          p = p.parent;
        }
        if (!loop || loop.type === 'While') return;
        const loopSyms = new Set(targetNames(loop.target).map((t) => t.sym).filter(Boolean));
        if (!loopSyms.size) return;
        const scope = n.scope;
        if (!scope) return;
        let hit = null;
        const visit = (m) => {
          if (hit || !m) return;
          if (m.type === 'Name' && m.ctx === 'Load' && m.sym && loopSyms.has(m.sym)) { hit = m; return; }
          for (const ch of children(m)) visit(ch);
        };
        if (n.type === 'Lambda') visit(n.body); else for (const s of n.body) visit(s);
        if (!hit) return;
        // immediately consumed?
        const par = n.parent;
        if (par && par.type === 'Call' && par.func === n) return;
        if (par && par.type === 'keyword' && par.arg === 'key') return;
        const call = par && par.type === 'keyword' ? par.parent : par;
        if (call && call.type === 'Call' && (call.args.includes(n) || call.keywords.some((k) => k.value === n))) {
          const name = c.q(call.func) || dotted(call.func) || '';
          if (IMMEDIATE.test(name)) return;
          if (call.parent && call.parent.type === 'Call' && call.parent.func === call) return;
        }
        if (n.type !== 'Lambda') {
          // a nested def is a problem only if it escapes the iteration
          const sym = n.sym;
          if (!sym || !sym.uses.some((u) => u.parent && !(u.parent.type === 'Call' && u.parent.func === u))) return;
        }
        r.report(hit, `'${hit.id}' is the loop variable of line ${loop.line}; this closure will see its last value.`, `'${hit.id}'는 ${loop.line}행의 반복 변수라 이 클로저는 마지막 값을 봅니다.`);
      },
    },
  });

R('pytz-tzinfo', 'B', 'MA', 5, ['datetime'], 'S6887',
  ['pytz time zone passed as tzinfo', 'pytz 시간대를 tzinfo로 넘깁니다'],
  ['pytz zones must be attached with localize(); passing them as tzinfo uses the zone\'s first historic offset (LMT), giving times off by minutes.', 'pytz 시간대는 localize()로 붙여야 하며, tzinfo로 넘기면 첫 역사적 오프셋(LMT)을 써서 시간이 몇 분씩 어긋납니다.'],
  ['Use tz.localize(datetime(...)) or zoneinfo.ZoneInfo.', 'tz.localize(datetime(...))나 zoneinfo.ZoneInfo를 쓰세요.'],
  {
    on: {
      keyword(n, c, r) {
        if (n.arg !== 'tzinfo') return;
        const v = n.value;
        if (v.type === 'Call' && /^pytz\.timezone$/.test(c.q(v.func) || '')) r.report(v, 'Do not pass a pytz time zone as tzinfo; use localize().', 'pytz 시간대를 tzinfo로 넘기지 말고 localize()를 쓰세요.');
      },
    },
  });

function annotationBuiltin(a) {
  if (!a) return null;
  if (a.type === 'Name' && a.sym === BUILTIN && FAMILY[a.id] && a.id !== 'NoneType') return a.id;
  return null;
}
function typeFits(ann, val) {
  if (ann === val) return true;
  if (ann === 'float' && (val === 'int' || val === 'bool')) return true;
  if (ann === 'complex' && (val === 'int' || val === 'float' || val === 'bool')) return true;
  if (ann === 'int' && val === 'bool') return true;
  if (ann === 'bytes' && val === 'bytearray') return true;
  return false;
}

R('annotation-type-mismatch', 'B', 'MA', 5, ['typing'], 'S5890',
  ['Assigned value does not match the type hint', '대입한 값이 타입 힌트와 맞지 않습니다'],
  ['The variable is annotated with one builtin type but receives a literal of another, so the hint is wrong or the value is.', '변수에 내장 타입 하나를 지정했는데 다른 타입의 리터럴을 받아 힌트나 값 중 하나가 잘못됐습니다.'],
  ['Fix the annotation or the value.', '타입 힌트나 값을 고치세요.'],
  {
    on: {
      AnnAssign(n, c, r) {
        if (!n.value) return;
        const ann = annotationBuiltin(n.annotation);
        if (!ann) return;
        const val = operandType(c, n.value);
        if (!val || val === 'NoneType') return;
        if (!typeFits(ann, val)) r.report(n.value, `A '${val}' value is assigned to '${short(c.slice(n.target), 30)}' annotated as '${ann}'.`, `'${ann}'로 지정한 '${short(c.slice(n.target), 30)}'에 '${val}' 값을 대입합니다.`);
      },
    },
  });

R('return-type-mismatch', 'B', 'MA', 5, ['typing'], 'S5886',
  ['Returned value does not match the return type hint', '반환값이 반환 타입 힌트와 맞지 않습니다'],
  ['The function declares a builtin return type but returns a literal of another type (or None).', '함수가 내장 반환 타입을 선언했는데 다른 타입(또는 None)의 리터럴을 반환합니다.'],
  ['Fix the return type hint or the returned value.', '반환 타입 힌트나 반환값을 고치세요.'],
  {
    on: {
      Return(n, c, r) {
        const fn = U.enclosingFn(n);
        if (!fn || !FUNC_TYPES.has(fn.type) || !fn.info || fn.info.isGenerator || fn.info.isOverload || fn.info.isAbstract) return;
        const ann = annotationBuiltin(fn.returns);
        if (!ann || fn.type === 'AsyncFunctionDef' && false) return;
        const val = n.value ? operandType(c, n.value) : 'NoneType';
        if (!val) return;
        if (!typeFits(ann, val)) r.report(n, `'${fn.name}' is annotated to return '${ann}' but returns '${val === 'NoneType' ? 'None' : val}' here.`, `'${fn.name}'는 '${ann}'을 반환한다고 지정했는데 여기서 '${val === 'NoneType' ? 'None' : val}'을 반환합니다.`);
      },
    },
  });

function badIsinstanceType(c, e) {
  if (!e) return null;
  if (e.type === 'Tuple') { for (const x of e.elts) { const b = badIsinstanceType(c, x); if (b) return b; } return null; }
  if (e.type === 'Constant' && e.kind !== 'None') return 'a literal';
  if (e.type === 'JoinedStr') return 'a literal';
  if (e.type === 'Subscript') {
    const d = c.q(e.value) || dotted(e.value) || '';
    if (/^(?:list|dict|set|tuple|frozenset|type|typing\.\w+|List|Dict|Set|Tuple|Optional|Union|Sequence|Mapping|Iterable|collections\.abc\.\w+)$/.test(d)) return `the parameterized generic '${short(c.slice(e), 30)}'`;
  }
  return null;
}

R('isinstance-invalid-type', 'B', 'BL', 5, ['pitfall', 'typing'], 'S5864',
  ['Invalid type in isinstance / issubclass', 'isinstance / issubclass에 잘못된 타입을 씁니다'],
  ['The second argument must be a class, a tuple of classes or a union; a literal or a parameterized generic such as list[int] raises TypeError.', '두 번째 인자는 클래스, 클래스 튜플 또는 유니언이어야 하며, 리터럴이나 list[int] 같은 매개변수화 제네릭은 TypeError가 납니다.'],
  ['Pass the plain class (list instead of list[int]).', '일반 클래스(list[int] 대신 list)를 넘기세요.'],
  {
    on: {
      Call(n, c, r) {
        if (!(U.isBuiltinName(n.func, 'isinstance') || U.isBuiltinName(n.func, 'issubclass')) || n.args.length !== 2) return;
        const what = badIsinstanceType(c, n.args[1]);
        if (what) r.report(n.args[1], `${n.func.id}() cannot use ${what}; this raises TypeError.`, `${n.func.id}()에는 ${what}을(를) 쓸 수 없어 TypeError가 납니다.`);
      },
    },
  });

R('test-assertion-incompatible-types', 'B', 'CR', 5, ['tests'], 'S5845',
  ['Test assertion compares incompatible types', '테스트 단언이 호환되지 않는 타입을 비교합니다'],
  ['assertEqual / assertIs between values of different builtin types always fails (or always passes for the negated form).', '서로 다른 내장 타입 값 사이의 assertEqual / assertIs는 항상 실패합니다(부정형은 항상 통과).'],
  ['Compare values of the same type.', '같은 타입의 값을 비교하세요.'],
  {
    on: {
      Call(n, c, r) {
        const f = n.func;
        if (f.type !== 'Attribute' || !/^(?:assertEqual|assertNotEqual|assertIs|assertIsNot|assertEquals)$/.test(f.attr) || n.args.length < 2) return;
        const a = operandType(c, n.args[0]);
        const b = operandType(c, n.args[1]);
        if (!a || !b || a === 'NoneType' || b === 'NoneType') return;
        if (FAMILY[a] !== FAMILY[b]) r.report(n, `'${f.attr}' compares a '${a}' with a '${b}'; the assertion is constant.`, `'${f.attr}'가 '${a}'와 '${b}'를 비교해 단언 결과가 상수입니다.`);
      },
    },
  });

R('redefined-function', 'B', 'MA', 5, ['suspicious'], null,
  ['Function or class redefined without being used', '함수나 클래스를 쓰지 않고 다시 정의합니다'],
  ['A second definition with the same name in the same block replaces the first one, which is then dead code.', '같은 블록에서 같은 이름으로 다시 정의하면 첫 정의가 대체되어 죽은 코드가 됩니다.'],
  ['Rename one of the definitions or remove the dead one.', '정의 하나의 이름을 바꾸거나 죽은 정의를 지우세요.'],
  {
    on: {
      'Module|ClassDef|FunctionDef|AsyncFunctionDef'(n, c, r) {
        const body = n.body;
        const last = new Map();
        for (let i = 0; i < body.length; i++) {
          const s = body[i];
          if (FUNC_TYPES.has(s.type) || s.type === 'ClassDef') {
            const prev = last.get(s.name);
            if (prev != null && !body[prev].decorator_list.length && !s.decorator_list.length) {
              // used in between?
              let used = false;
              for (let j = prev + 1; j < i && !used; j++) used = U.containsNode(body[j], (m) => m.type === 'Name' && m.id === s.name && m.ctx === 'Load');
              if (!used) r.report(s, `'${s.name}' redefines the ${body[prev].type === 'ClassDef' ? 'class' : 'function'} from line ${body[prev].nameLine || body[prev].line} without using it.`, `'${s.name}'가 ${body[prev].nameLine || body[prev].line}행의 정의를 쓰지 않고 다시 정의합니다.`);
            }
            last.set(s.name, i);
          } else if (s.type === 'Assign' || s.type === 'AnnAssign' || s.type === 'Import' || s.type === 'ImportFrom') {
            const names = s.type === 'Import' || s.type === 'ImportFrom' ? s.names.map((a) => a.bound) : (s.targets || [s.target]).flatMap((t) => targetNames(t).map((x) => x.id));
            for (const nm of names) last.delete(nm);
          }
        }
      },
    },
  });

R('overwritten-before-use', 'B', 'MA', 5, ['suspicious'], 'S4143',
  ['Item or attribute overwritten right after being set', '항목이나 속성을 설정하자마자 덮어씁니다'],
  ['Two consecutive assignments to the same key or attribute: the first value is lost, usually a copy-paste error.', '같은 키나 속성에 연속으로 두 번 대입해 첫 값이 사라집니다. 보통 복사-붙여넣기 실수입니다.'],
  ['Fix the key / attribute of one assignment or remove the first one.', '한 대입의 키/속성을 고치거나 첫 대입을 지우세요.'],
  {
    on: {
      'Module|FunctionDef|AsyncFunctionDef|If|For|While|With|Try'(n, c, r) {
        const lists = [n.body, n.orelse, n.finalbody].filter(Array.isArray);
        for (const list of lists) {
          for (let i = 1; i < list.length; i++) {
            const a = list[i - 1];
            const b = list[i];
            if (a.type !== 'Assign' || b.type !== 'Assign' || a.targets.length !== 1 || b.targets.length !== 1) continue;
            const t = a.targets[0];
            if (!(t.type === 'Subscript' || t.type === 'Attribute') || !same(t, b.targets[0]) || !isPure(t)) continue;
            if (t.type === 'Subscript' && t.slice.type === 'Slice') continue;
            const base = t.value;
            const refs = U.containsNode(b.value, (m) => same(m, t) || (t.type === 'Subscript' && same(m, t.value) && m.type !== 'Constant') || (m.type === 'Call' && U.containsNode(m, (k) => same(k, base))));
            if (refs) continue;
            r.report(b, `'${short(c.slice(t), 40)}' is overwritten right after being assigned on line ${a.line}.`, `'${short(c.slice(t), 40)}'를 ${a.line}행에서 대입하자마자 덮어씁니다.`);
          }
        }
      },
    },
  });

R('unpacking-count-mismatch', 'B', 'BL', 5, ['pitfall'], null,
  ['Unpacking a literal of the wrong length', '길이가 맞지 않는 리터럴을 언패킹합니다'],
  ['The number of targets differs from the number of values, which raises ValueError.', '대상 개수가 값 개수와 달라 ValueError가 납니다.'],
  ['Make the number of targets and values agree (or use a starred target).', '대상과 값의 개수를 맞추거나 별표 대상을 쓰세요.'],
  {
    on: {
      Assign(n, c, r) {
        const v = n.value;
        if (!(v.type === 'Tuple' || v.type === 'List') || v.elts.some((e) => e.type === 'Starred')) return;
        for (const t of n.targets) {
          if (!(t.type === 'Tuple' || t.type === 'List') || t.elts.some((e) => e.type === 'Starred')) continue;
          if (t.elts.length !== v.elts.length) r.report(t, `${t.elts.length} targets but ${v.elts.length} values to unpack.`, `대상은 ${t.elts.length}개인데 언패킹할 값은 ${v.elts.length}개입니다.`);
        }
      },
    },
  });

R('division-by-zero', 'B', 'BL', 5, ['pitfall', 'cwe-369'], 'S3518',
  ['Division by literal zero', '리터럴 0으로 나눕니다'],
  ['Dividing (or taking the modulo) by the literal 0 always raises ZeroDivisionError.', '리터럴 0으로 나누거나 나머지를 구하면 항상 ZeroDivisionError가 납니다.'],
  ['Fix the divisor.', '나누는 값을 고치세요.'],
  {
    on: {
      'BinOp|AugAssign'(n, c, r) {
        if (!['Div', 'FloorDiv', 'Mod'].includes(n.op)) return;
        const rt = n.type === 'BinOp' ? n.right : n.value;
        if (numValue(rt) !== 0 || rt.type === 'Constant' && rt.kind === 'bool') return;
        if (n.type === 'BinOp' && n.left.type === 'Constant' && n.left.kind === 'str') return;
        if (U.caughtBy(n, ['ZeroDivisionError', 'ArithmeticError', 'Exception', 'BaseException'])) return;
        r.report(n, 'Division by zero always raises ZeroDivisionError.', '0으로 나누면 항상 ZeroDivisionError가 납니다.');
      },
    },
  });

R('infinite-loop', 'B', 'BL', 15, ['pitfall', 'cwe-835'], 'S2189',
  ['Loop condition never changes', '반복 조건이 바뀌지 않습니다'],
  ['None of the variables in the while condition is updated in the loop and nothing leaves the loop, so it never ends.', 'while 조건의 변수가 반복문에서 하나도 갱신되지 않고 빠져나가는 것도 없어 끝나지 않습니다.'],
  ['Update the loop variable or add a break.', '반복 변수를 갱신하거나 break를 추가하세요.'],
  {
    on: {
      While(n, c, r) {
        const test = n.test;
        if (test.type !== 'Compare') return;
        const names = [];
        let pure = true;
        U.containsNode(test, (m) => {
          if (m.type === 'Call' || m.type === 'Attribute' || m.type === 'Subscript' || m.type === 'Await' || m.type === 'NamedExpr' || m.type === 'Lambda') pure = false;
          if (m.type === 'Name') names.push(m);
          return false;
        });
        if (!pure || !names.length) return;
        const fn = U.enclosingDef(n);
        if (!fn || !fn.scope) return;
        const syms = new Set();
        for (const nm of names) {
          if (nm.sym === BUILTIN) continue;
          if (!nm.sym || nm.sym.scope !== fn.scope || nm.sym.captured || nm.sym.nonlocalAssigned || nm.sym.globalAssigned || fn.scope.dynamic) return;
          syms.add(nm.sym);
        }
        if (!syms.size) return;
        let escapes = false;
        for (const s of n.body) {
          walkLocal(s, (m) => {
            if (escapes) return false;
            if (m.type === 'Break' || m.type === 'Return' || m.type === 'Raise' || m.type === 'Yield' || m.type === 'YieldFrom' || m.type === 'Await') escapes = true;
            if (m.type === 'Name' && m.sym && syms.has(m.sym) && (m.ctx !== 'Load' || m.augUse)) escapes = true;
            if (m.type === 'Name' && m.sym && syms.has(m.sym) && m.parent && (m.parent.type === 'Call' || (m.parent.type === 'Attribute' && m.parent.value === m) || m.parent.type === 'Starred' || m.parent.type === 'keyword')) escapes = true;
            if (m.type === 'Expr' && m.value.type === 'Call' && /^(?:sys\.exit|exit|quit|os\._exit)$/.test(dotted(m.value.func) || '')) escapes = true;
            if (m.type === 'AugAssign' && m.target.type === 'Name' && syms.has(m.target.sym)) escapes = true;
            return true;
          }, true);
        }
        if (escapes) return;
        r.report(test, `The variables of '${short(c.slice(test), 40)}' never change inside the loop, so it never ends.`, `'${short(c.slice(test), 40)}'의 변수가 반복문 안에서 바뀌지 않아 끝나지 않습니다.`);
      },
    },
  });

R('lock-created-in-with', 'B', 'MA', 5, ['concurrency'], null,
  ['Lock created directly in a with statement', 'with 문에서 바로 락을 만듭니다'],
  ['A new lock object is created on every pass, so no two threads ever share it and nothing is synchronized.', '매번 새 락 객체를 만들어 스레드끼리 공유하지 않으므로 아무것도 동기화되지 않습니다.'],
  ['Create the lock once (module or instance attribute) and use it in with.', '락을 한 번(모듈이나 인스턴스 속성으로) 만들고 with에서 쓰세요.'],
  {
    on: {
      'With|AsyncWith'(n, c, r) {
        for (const it of n.items) {
          const e = it.context_expr;
          if (e.type !== 'Call') continue;
          const q = c.q(e.func) || '';
          if (/^(?:threading|multiprocessing|asyncio)\.(?:Lock|RLock|Semaphore|BoundedSemaphore|Condition)$/.test(q)) r.report(e, `A new '${q}' is created here on each pass and protects nothing.`, `여기서 매번 새 '${q}'를 만들어 아무것도 보호하지 않습니다.`);
        }
      },
    },
  });

R('super-first-arg', 'B', 'MA', 5, ['pitfall'], null,
  ['super() called with an unrelated class', 'super()를 관련 없는 클래스로 호출합니다'],
  ['The first argument of super() must be the current class (or one of its bases); another class gives TypeError or calls the wrong method.', 'super()의 첫 인자는 현재 클래스(또는 그 기반 클래스)여야 하며, 다른 클래스는 TypeError가 나거나 엉뚱한 메서드를 부릅니다.'],
  ['Use super() without arguments, or pass the enclosing class.', '인자 없는 super()를 쓰거나 감싸는 클래스를 넘기세요.'],
  {
    on: {
      Call(n, c, r) {
        if (!U.isBuiltinName(n.func, 'super') || n.args.length !== 2 || n.args[0].type !== 'Name') return;
        const fn = U.enclosingDef(n);
        const cls = fn && fn.info && fn.info.cls;
        if (!cls || n.args[0].id === cls.name) return;
        const t = c.type(n.args[0]);
        if (!t || t.k !== 'class' || !t.cls) return;
        // is it an ancestor?
        const seen = new Set();
        let unknown = false;
        const anc = (k) => {
          for (const b of k.bases(c.project)) {
            if (b.cls) { if (b.cls === t.cls) return true; if (!seen.has(b.cls)) { seen.add(b.cls); if (anc(b.cls)) return true; } } else if (!b.builtin) unknown = true;
          }
          return false;
        };
        if (anc(cls) || unknown) return;
        r.report(n.args[0], `'${n.args[0].id}' is not '${cls.name}' nor one of its bases.`, `'${n.args[0].id}'는 '${cls.name}'도 그 기반 클래스도 아닙니다.`);
      },
    },
  });

R('self-reassigned', 'B', 'MI', 5, ['confusing'], null,
  ['self or cls is reassigned', 'self나 cls를 다시 대입합니다'],
  ['Rebinding self (or cls) inside a method does not change the object; later code silently works on something else.', '메서드 안에서 self(또는 cls)를 다시 묶어도 객체는 바뀌지 않고 뒤 코드가 조용히 다른 것을 다룹니다.'],
  ['Use a new local variable name.', '새 지역 변수 이름을 쓰세요.'],
  {
    on: {
      Name(n, c, r) {
        if (n.ctx !== 'Store' || n.id !== 'self') return;
        if (!n.parent || n.parent.type !== 'Assign' || n.parent.targets.length !== 1 || n.parent.targets[0] !== n) return;
        const fn = U.enclosingDef(n);
        if (!fn || !fn.info || !fn.info.cls) return;
        const first = fn.args.posonlyargs[0] || fn.args.args[0];
        if (!first || first.arg !== n.id || !n.sym || n.sym.bindings[0].node !== first) return;
        if (n.sym.scope !== fn.scope) return;
        const st = n.parent;
        if (st && st.type === 'Assign' && (isNone(st.value) || U.containsNode(st.value, (m) => m.type === 'Name' && m.id === n.id))) return;
        r.report(n, `'${n.id}' is reassigned; this does not replace the object.`, `'${n.id}'를 다시 대입해도 객체가 바뀌지 않습니다.`);
      },
    },
  });

R('abstract-instantiation', 'B', 'BL', 10, ['pitfall'], null,
  ['Abstract class instantiated', '추상 클래스를 인스턴스화합니다'],
  ['The class declares abstract methods (ABC), so creating an instance raises TypeError.', '클래스가 추상 메서드(ABC)를 선언해서 인스턴스를 만들면 TypeError가 납니다.'],
  ['Instantiate a concrete subclass that implements the abstract methods.', '추상 메서드를 구현한 구체 하위 클래스를 인스턴스화하세요.'],
  {
    on: {
      Call(n, c, r) {
        const t = c.type(n.func);
        if (!t || t.k !== 'class' || !t.cls) return;
        const cls = t.cls;
        const abc = cls.node.bases.some((b) => /(?:^|\.)ABC$/.test(dotted(b) || '')) || cls.node.keywords.some((k) => k.arg === 'metaclass' && /(?:^|\.)ABCMeta$/.test(dotted(k.value) || ''));
        if (!abc) return;
        const abstract = [...cls.methods.values()].filter((m) => m.isAbstract);
        if (!abstract.length) return;
        r.report(n, `'${cls.name}' is abstract (abstract method '${abstract[0].name}') and cannot be instantiated.`, `'${cls.name}'는 추상 클래스(추상 메서드 '${abstract[0].name}')라 인스턴스화할 수 없습니다.`);
      },
    },
  });

R('property-without-return', 'B', 'MA', 5, ['pitfall'], null,
  ['Property getter returns nothing', '프로퍼티 getter가 아무것도 반환하지 않습니다'],
  ['A property getter without a return statement always evaluates to None.', 'return 문이 없는 프로퍼티 getter는 항상 None이 됩니다.'],
  ['Return the property value.', '프로퍼티 값을 반환하세요.'],
  {
    on: {
      FunctionDef(n, c, r) {
        const fi = n.info;
        if (!fi || !fi.cls || !fi.decorators.some((d) => /^(?:property|functools\.cached_property|cached_property|abc\.abstractproperty)$/.test(d))) return;
        if (fi.isStub || fi.isAbstract || fi.returnsValue || fi.returnsNone || fi.isGenerator || endsInRaise(n.body)) return;
        if (U.containsLocal({ type: 'Module', body: n.body }, (m) => m.type === 'Raise')) return;
        r.report(n, `Property '${n.name}' never returns a value, so it is always None.`, `프로퍼티 '${n.name}'는 값을 반환하지 않아 항상 None입니다.`);
      },
    },
  });

R('dict-iteration-unpacking', 'B', 'MA', 5, ['pitfall'], null,
  ['Unpacking keys while iterating over a dict', 'dict를 반복하면서 키를 언패킹합니다'],
  ['Iterating over a dict yields its keys only; "for k, v in d" tries to unpack each key and fails.', 'dict를 반복하면 키만 나오므로 "for k, v in d"는 각 키를 언패킹하려다 실패합니다.'],
  ['Iterate over d.items().', 'd.items()를 반복하세요.'],
  {
    on: {
      'For|comprehension'(n, c, r) {
        if (n.target.type !== 'Tuple' || n.target.elts.length !== 2) return;
        if (!(n.iter.type === 'Name' || n.iter.type === 'Dict')) return;
        const t = c.type(n.iter);
        if (t && t.k === 'inst' && !t.cls && t.name === 'dict') r.report(n.iter, `Iterate over '${short(c.slice(n.iter), 20)}.items()' to get keys and values.`, `키와 값을 얻으려면 '${short(c.slice(n.iter), 20)}.items()'를 반복하세요.`);
      },
    },
  });

R('all-invalid-entry', 'B', 'BL', 5, ['pitfall'], 'S2823',
  ['__all__ contains something that is not a string', '__all__에 문자열이 아닌 것이 있습니다'],
  ['"from module import *" requires every entry of __all__ to be a name string; anything else raises TypeError.', '"from module import *"는 __all__의 모든 항목이 이름 문자열이어야 하며, 아니면 TypeError가 납니다.'],
  ['List the names as strings.', '이름을 문자열로 나열하세요.'],
  {
    on: {
      Assign(n, c, r) {
        if (!allTarget(n)) return;
        const v = n.value;
        if (!(v.type === 'List' || v.type === 'Tuple')) return;
        for (const e of v.elts) if (!(e.type === 'Constant' && e.kind === 'str') && e.type !== 'Starred') r.report(e, `'${short(c.slice(e), 30)}' in __all__ must be a string.`, `__all__의 '${short(c.slice(e), 30)}'는 문자열이어야 합니다.`);
      },
    },
  });
function allTarget(n) { return n.targets.length === 1 && n.targets[0].type === 'Name' && n.targets[0].id === '__all__' && n.parent && n.parent.type === 'Module'; }

R('all-undefined-name', 'B', 'BL', 5, ['pitfall'], 'S5807',
  ['__all__ lists a name the module does not define', '__all__에 모듈이 정의하지 않은 이름이 있습니다'],
  ['"from module import *" fails with AttributeError when __all__ lists an undefined name.', '__all__에 정의되지 않은 이름이 있으면 "from module import *"가 AttributeError로 실패합니다.'],
  ['Define the name or remove it from __all__.', '이름을 정의하거나 __all__에서 지우세요.'],
  {
    on: {
      Assign(n, c, r) {
        if (!allTarget(n) || c.mod.isPackageInit || c.mod.scope.starImport) return;
        const v = n.value;
        if (!(v.type === 'List' || v.type === 'Tuple')) return;
        const syms = c.mod.scope.symbols;
        if (U.containsNode(c.mod.module, (m) => m.type === 'Call' && (/^(?:globals|setattr|__getattr__)$/.test(dotted(m.func) || '')))) return;
        if (syms.has('__getattr__')) return;
        for (const e of v.elts) {
          if (e.type === 'Constant' && e.kind === 'str' && !syms.has(e.value) && !BUILTINS.has(e.value)) r.report(e, `'${e.value}' is listed in __all__ but not defined in this module.`, `'${e.value}'가 __all__에 있지만 이 모듈에 정의되지 않았습니다.`);
        }
      },
    },
  });

module.exports = { RULES, FAMILY, ifChain, constKey };
void EXC_BUILTINS;
