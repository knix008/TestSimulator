'use strict';

// Reliability rules (PHP reference analyzer bug family) plus the data-flow rules produced
// by the flow engine (dead stores, constant conditions, unreachable code).

const { rule, php, fn, cls } = require('./core');
const A = require('../ast');
const H = require('./h');

const pure = (e) => !A.hasSideEffects(e);

// ── self assignment
rule({
  id: 'self-assignment', ref: 'S1656', type: 'B', sev: 'MA', debt: 3, tags: ['pitfall'], checker: 'COPY_PASTE_ERROR',
  en: ['Variables should not be self-assigned', 'Assigning a variable to itself has no effect; a property prefix or another name is usually missing.', 'Assign the intended value, for example $this->name = $name.'],
  ko: ['변수를 자기 자신에게 대입하면 안 됩니다', '변수를 자신에게 대입하면 아무 효과가 없습니다. 보통 속성 접두어나 다른 이름이 빠졌습니다.', '의도한 값을 대입합니다. 예: $this->name = $name.'],
  msg: ['Remove or correct this useless self-assignment of "{0}".', '"{0}"의 쓸모없는 자기 대입을 지우거나 고칩니다.'],
  on: {
    Assign(n, cx) {
      if (n.op !== '=' || n.byRef) return;
      const l = n.l;
      const r = A.unparen(n.r);
      if (!['Var', 'Prop', 'Index', 'SProp'].includes(l.k)) return;
      if (!A.same(l, r) || !pure(l)) return;
      cx.report(n, cx.short(l));
    },
  },
  bad: php('function f($x)\n{\n    $x = $x; // Noncompliant\n    return $x;\n}'),
  good: php('class P\n{\n    private $x;\n    public function __construct($x)\n    {\n        $this->x = $x;\n    }\n}'),
});

// ── identical operands
const IDENT_OPS = new Set(['==', '!=', '===', '!==', '<>', '<', '>', '<=', '>=', '&&', '||', 'and', 'or', 'xor', '&', '|', '^', '-', '/', '%', '<=>', '??']);
rule({
  id: 'identical-operands', ref: 'S1764', type: 'B', sev: 'MA', debt: 2, tags: ['pitfall'], checker: 'COPY_PASTE_ERROR',
  en: ['Identical expressions should not be used on both sides of a binary operator', 'The same expression on both sides always gives the same result and is almost always a copy-paste mistake.', 'Correct the operand that was meant to be different.'],
  ko: ['이항 연산자 양쪽에 같은 식을 쓰면 안 됩니다', '양쪽에 같은 식을 쓰면 결과가 항상 같고 대부분 복사-붙여넣기 실수입니다.', '달라야 할 피연산자를 고칩니다.'],
  msg: ['Correct one of the identical sub-expressions on both sides of operator "{0}".', '연산자 "{0}" 양쪽의 같은 하위 식 중 하나를 고칩니다.'],
  on: {
    Bin(n, cx) {
      if (!IDENT_OPS.has(n.op)) return;
      const l = A.unparen(n.l);
      const r = A.unparen(n.r);
      if (l.k === 'Lit' || !A.same(l, r) || !pure(l)) return;
      cx.report(n, n.op);
    },
  },
  bad: fn('    if ($a == $a) { // Noncompliant\n        return 1;\n    }\n    return $b - $b; // Noncompliant'),
  good: fn('    if ($a == $b) {\n        return 1;\n    }\n    return $b - $c + $a * $a;'),
});

// ── if / else-if chains
function ifChain(n) {
  const conds = [];
  const branches = [];
  let cur = n;
  while (cur && cur.k === 'If') {
    conds.push(cur.cond);
    branches.push(cur.then);
    if (cur.else && cur.else.k === 'If') { cur = cur.else; continue; }
    if (cur.else) branches.push(cur.else);
    return { conds, branches, hasElse: !!cur.else };
  }
  return { conds, branches, hasElse: false };
}
const isChainHead = (n) => !(n.parent && n.parent.k === 'If' && n.parent.else === n);
const stmtCount = (b) => (b && b.k === 'Block' ? b.stmts.length : b ? 1 : 0);
const bodyKey = (b) => (b && b.k === 'Block' && b.stmts.length === 1 ? b.stmts[0] : b && b.k === 'Block' ? b.stmts : b);
const caseBody = (c) => {
  const s = c.body.slice();
  if (s.length && s[s.length - 1].k === 'Break') s.pop();
  return s;
};

rule({
  id: 'duplicate-condition', ref: 'S1862', type: 'B', sev: 'MA', debt: 10, tags: ['pitfall', 'unused'], checker: 'COPY_PASTE_ERROR',
  en: ['Related "if/elseif" conditions and "case" labels should not be duplicated', 'A repeated condition in an if/elseif chain, switch or match can never select its second branch.', 'Fix the condition or merge the branches.'],
  ko: ['관련된 if/elseif 조건과 case 레이블이 중복되면 안 됩니다', 'if/elseif 사슬, switch, match에서 조건이 반복되면 두 번째 분기는 선택되지 않습니다.', '조건을 고치거나 분기를 합칩니다.'],
  msg: ['This branch duplicates the condition on line {0}.', '이 분기는 {0}행의 조건과 같습니다.'],
  on: {
    If(n, cx) {
      if (!isChainHead(n)) return;
      const { conds } = ifChain(n);
      for (let i = 1; i < conds.length; i++) {
        for (let j = 0; j < i; j++) {
          if (A.same(conds[i], conds[j]) && pure(conds[i])) { cx.report(conds[i], conds[j].line); break; }
        }
      }
    },
    Switch(n, cx) {
      const seen = [];
      for (const c of n.cases) {
        if (!c.test) continue;
        const prev = seen.find((p) => A.same(p, c.test));
        if (prev && pure(c.test)) cx.report(c.test, prev.line); else seen.push(c.test);
      }
    },
    Match(n, cx) {
      const seen = [];
      for (const a of n.arms) for (const c of a.conds || []) {
        const prev = seen.find((p) => A.same(p, c));
        if (prev && pure(c)) cx.report(c, prev.line); else seen.push(c);
      }
    },
  },
  bad: fn('    if ($a == 1) {\n        echo 1;\n    } elseif ($a == 1) { // Noncompliant\n        echo 2;\n    }\n    switch ($b) {\n        case 1:\n            break;\n        case 1: // Noncompliant\n            break;\n    }'),
  good: fn('    if ($a == 1) {\n        echo 1;\n    } elseif ($a == 2) {\n        echo 2;\n    }\n    return match ($b) { 1 => \'one\', 2 => \'two\', default => \'many\' };'),
});

function allSame(list) {
  return list.length > 1 && list.every((b) => A.same(bodyKey(b), bodyKey(list[0])));
}

rule({
  id: 'identical-branches', ref: 'S1871', type: 'S', sev: 'MA', debt: 10, tags: ['design', 'suspicious'], checker: 'COPY_PASTE_ERROR',
  en: ['Two branches in a conditional structure should not have exactly the same implementation', 'Identical branches are either a copy-paste error or should be merged into one condition.', 'Merge the conditions or change one of the branches.'],
  ko: ['조건 구조의 두 분기가 완전히 같은 구현을 가지면 안 됩니다', '같은 분기는 복사-붙여넣기 오류이거나 하나의 조건으로 합쳐야 합니다.', '조건을 합치거나 한 분기를 고칩니다.'],
  msg: ['This branch has the same implementation as the one on line {0}.', '이 분기는 {0}행의 분기와 구현이 같습니다.'],
  on: {
    If(n, cx) {
      if (!isChainHead(n)) return;
      const { branches, hasElse } = ifChain(n);
      if (hasElse && allSame(branches)) return;
      for (let i = 1; i < branches.length; i++) {
        if (stmtCount(branches[i]) < 2 && !hasElse) continue;
        for (let j = 0; j < i; j++) {
          if (stmtCount(branches[i]) && A.same(bodyKey(branches[i]), bodyKey(branches[j]))) { cx.report(branches[i], branches[j].line); break; }
        }
      }
    },
    Switch(n, cx) {
      const bodies = n.cases.map(caseBody);
      const hasDefault = n.cases.some((c) => !c.test);
      if (hasDefault && n.cases.length > 1 && bodies.every((b) => A.same(b, bodies[0]))) return;
      for (let i = 1; i < n.cases.length; i++) {
        if (bodies[i].length < 1 || (bodies[i].length < 2 && !hasDefault)) continue;
        for (let j = 0; j < i; j++) {
          if (A.same(bodies[i], bodies[j])) { cx.report(n.cases[i], n.cases[j].line); break; }
        }
      }
    },
  },
  bad: fn('    if ($a > 1) {\n        foo();\n        bar();\n    } elseif ($a > 0) { // Noncompliant\n        foo();\n        bar();\n    } else {\n        baz();\n    }'),
  good: fn('    if ($a > 1 || $a > 0) {\n        foo();\n        bar();\n    } else {\n        baz();\n    }'),
});

rule({
  id: 'all-branches-identical', ref: 'S3923', type: 'B', sev: 'MA', debt: 15, tags: ['pitfall'], checker: 'IDENTICAL_BRANCHES',
  en: ['All branches in a conditional structure should not have exactly the same implementation', 'When every branch does the same thing the condition is useless, which is usually a mistake.', 'Remove the condition or make the branches differ as intended.'],
  ko: ['조건 구조의 모든 분기가 같은 구현을 가지면 안 됩니다', '모든 분기가 같은 일을 하면 조건이 쓸모없고 대부분 실수입니다.', '조건을 지우거나 의도대로 분기를 다르게 만듭니다.'],
  msg: ['Remove this conditional structure or edit its code blocks so that they are not all the same.', '이 조건 구조를 지우거나 모든 블록이 같지 않도록 고칩니다.'],
  on: {
    If(n, cx) {
      if (!isChainHead(n)) return;
      const { branches, hasElse } = ifChain(n);
      if (hasElse && allSame(branches)) cx.report(n);
    },
    Ternary(n, cx) {
      if (n.t && A.same(A.unparen(n.t), A.unparen(n.f))) cx.report(n);
    },
    Switch(n, cx) {
      if (n.cases.length < 2 || !n.cases.some((c) => !c.test)) return;
      const bodies = n.cases.map(caseBody).filter((b) => b.length);
      if (bodies.length > 1 && bodies.length === n.cases.length && bodies.every((b) => A.same(b, bodies[0]))) cx.report(n);
    },
    Match(n, cx) {
      if (n.arms.length < 2 || !n.arms.some((a) => !a.conds)) return;
      if (n.arms.every((a) => A.same(a.body, n.arms[0].body))) cx.report(n);
    },
  },
  bad: fn('    if ($a) { // Noncompliant\n        foo();\n    } else {\n        foo();\n    }\n    return $b ? $c : $c; // Noncompliant'),
  good: fn('    if ($a) {\n        foo();\n    } else {\n        bar();\n    }\n    return $b ? $c : $a;'),
});

// ── =+ / =- / =!
rule({
  id: 'wrong-compound-operator', ref: 'S2757', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'], checker: 'BAD_OPERATOR',
  en: ['"=+" should not be used instead of "+="', 'Writing "=+", "=-" or "=!" assigns a signed or negated value; the compound operator was most likely intended.', 'Swap the characters to "+=" / "-=", or add a space after "=".'],
  ko: ['"+=" 대신 "=+"를 쓰면 안 됩니다', '"=+", "=-", "=!"는 부호가 붙거나 부정된 값을 대입합니다. 복합 연산자를 의도했을 가능성이 큽니다.', '"+=" / "-="로 바꾸거나 "=" 뒤에 공백을 넣습니다.'],
  msg: ['Was "{0}=" meant instead?', '"{0}="를 의도했나요?'],
  on: {
    Assign(n, cx) {
      if (n.op !== '=' || !n.opTok) return;
      const end = n.opTok.end;
      const c = cx.src[end];
      if (c !== '+' && c !== '-' && c !== '!') return;
      if (cx.src[end + 1] === c || cx.src[end + 1] === '=') return;
      if (!n.opTok.sp) return;
      if (!/\s/.test(cx.src[end + 1] || '')) return;
      cx.report({ line: n.opLine, col: n.opCol }, c);
    },
  },
  bad: fn('    $a =+ $b; // Noncompliant\n    $c =- $b; // Noncompliant\n    return $a + $c;'),
  good: fn('    $a += $b;\n    $c = -$b;\n    $d = !$a;\n    return $a + $c + $d;'),
});

// ── if (true)
rule({
  id: 'constant-if', ref: 'S1145', type: 'B', sev: 'MA', debt: 2, tags: ['bad-practice', 'unused'], checker: 'DEADCODE',
  en: ['Useless "if(true) {...}" and "if(false){...}" blocks should be removed', 'A literal condition means one of the branches is dead code, often left over from debugging.', 'Remove the condition and keep the branch that is really executed.'],
  ko: ['쓸모없는 if(true)와 if(false) 블록은 지워야 합니다', '리터럴 조건이면 한 분기는 죽은 코드이며 디버깅 흔적인 경우가 많습니다.', '조건을 지우고 실제로 실행되는 분기만 남깁니다.'],
  msg: ['Remove this "if" statement; its condition is always {0}.', '조건이 항상 {0}이므로 이 if 문을 지웁니다.'],
  on: {
    If(n, cx) {
      const c = A.unparen(n.cond);
      if (c.k === 'Lit' && c.kind === 'bool') cx.report(n.cond, c.value ? 'true' : 'false');
    },
  },
  bad: fn('    if (true) { // Noncompliant\n        foo();\n    }\n    if (false) { // Noncompliant\n        bar();\n    }'),
  good: fn('    if ($a) {\n        foo();\n    }'),
});

// ── ignored return of pure functions
const PURE = new Set(['strlen', 'mb_strlen', 'trim', 'ltrim', 'rtrim', 'str_replace', 'str_ireplace', 'substr', 'mb_substr', 'strtolower', 'strtoupper', 'mb_strtolower', 'mb_strtoupper', 'ucfirst', 'lcfirst', 'ucwords', 'sprintf', 'implode', 'join', 'explode', 'array_merge', 'array_map', 'array_filter', 'array_slice', 'array_keys', 'array_values', 'array_reverse', 'array_unique', 'array_flip', 'array_combine', 'array_fill', 'array_pad', 'array_diff', 'array_intersect', 'array_column', 'array_chunk', 'count', 'sizeof', 'in_array', 'array_key_exists', 'array_search', 'is_array', 'is_string', 'is_int', 'is_null', 'is_numeric', 'intval', 'floatval', 'strval', 'boolval', 'json_encode', 'htmlspecialchars', 'htmlentities', 'nl2br', 'number_format', 'str_pad', 'str_repeat', 'strrev', 'base64_encode', 'base64_decode', 'urlencode', 'rawurlencode', 'abs', 'max', 'min', 'round', 'floor', 'ceil', 'sqrt', 'pow', 'strpos', 'stripos', 'strrpos', 'str_contains', 'str_starts_with', 'str_ends_with', 'preg_quote', 'preg_replace', 'preg_split', 'range', 'strcmp', 'strcasecmp', 'wordwrap', 'addslashes', 'stripslashes', 'strip_tags', 'array_sum', 'array_product']);
rule({
  id: 'ignored-return', ref: 'S2201', type: 'B', sev: 'MA', debt: 10, tags: ['suspicious'], checker: 'CHECKED_RETURN',
  en: ['Return values from functions without side effects should not be ignored', 'Functions such as trim() or str_replace() only return a new value; calling them without using the result does nothing.', 'Use or assign the returned value, or remove the call.'],
  ko: ['부작용 없는 함수의 반환값을 무시하면 안 됩니다', 'trim()이나 str_replace() 같은 함수는 새 값을 반환할 뿐이므로 결과를 쓰지 않으면 아무 일도 하지 않습니다.', '반환값을 쓰거나 대입하고, 아니면 호출을 지웁니다.'],
  msg: ['The return value of "{0}" is ignored; use it or remove the call.', '"{0}"의 반환값이 무시됩니다. 값을 쓰거나 호출을 지웁니다.'],
  on: {
    ExprStmt(n, cx) {
      const e = A.unparen(n.e);
      if (H.isCall(e, PURE)) cx.report(e, A.callName(e));
    },
  },
  bad: fn('    trim($a); // Noncompliant\n    str_replace(\'a\', \'b\', $b); // Noncompliant\n    return $a;'),
  good: fn('    $a = trim($a);\n    echo str_replace(\'a\', \'b\', $b);\n    return $a;'),
});

// ── void result used
function returnsNothing(f) {
  if (!f.body || f.byRef) return false;
  const rt = f.ret && f.ret.names.length === 1 ? f.ret.names[0].toLowerCase() : '';
  if (rt === 'void') return true;
  if (f.ret) return false;
  let value = false;
  A.walk(f.body, (x) => {
    if ((x.k === 'Return' && x.e) || x.k === 'Yield' || x.k === 'YieldFrom') value = true;
  });
  return !value;
}
rule({
  id: 'void-result-used', ref: 'S3699', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'], checker: 'USELESS_CALL',
  en: ['The output of functions that do not return anything should not be used', 'A function without a return value always yields null, so using its result is a logic error.', 'Call the function as a statement, or make it return the value you need.'],
  ko: ['아무것도 반환하지 않는 함수의 결과를 쓰면 안 됩니다', '반환값이 없는 함수는 항상 null을 내므로 결과를 쓰면 논리 오류입니다.', '함수를 문장으로 호출하거나 필요한 값을 반환하도록 고칩니다.'],
  msg: ['Remove this use of the output from "{0}"; "{0}" does not return anything.', '"{0}"의 결과 사용을 지웁니다. "{0}"는 아무것도 반환하지 않습니다.'],
  on: {
    Call(n, cx) {
      if (!n.callee || n.callee.k !== 'Name') return;
      const p = n.parent;
      if (!p || p.k === 'ExprStmt' || p.k === 'Paren' || p.k === 'ArrowFn' || (p.k === 'Return' && false)) return;
      const list = cx.proj.functions.get(A.shortName(n.callee.name).toLowerCase());
      if (!list || list.length !== 1) return;
      if (returnsNothing(list[0].node)) cx.report(n, list[0].node.name);
    },
    MCall(n, cx) {
      const obj = A.unparen(n.obj);
      if (!(obj.k === 'Var' && obj.name === 'this') || typeof n.name !== 'string') return;
      const p = n.parent;
      if (!p || p.k === 'ExprStmt' || p.k === 'Paren' || p.k === 'ArrowFn') return;
      const c = A.enclosingClass(n);
      if (!c) return;
      const m = H.methodsOf(c).find((x) => x.name.toLowerCase() === n.name.toLowerCase());
      if (m && !m.mods.has('abstract') && returnsNothing(m)) cx.report(n, m.name);
    },
  },
  bad: php('function log_it($m): void\n{\n    echo $m;\n}\nfunction f()\n{\n    $r = log_it(\'x\'); // Noncompliant\n    return $r;\n}'),
  good: php('function log_it($m): void\n{\n    echo $m;\n}\nfunction f()\n{\n    log_it(\'x\');\n    return 1;\n}'),
});

// ── unused labels
rule({
  id: 'unused-label', ref: 'S1065', type: 'S', sev: 'MA', debt: 2, tags: ['unused'], checker: 'UNUSED_LABEL',
  en: ['Unused labels should be removed', 'A label that no goto jumps to is dead code and confuses readers.', 'Remove the label.'],
  ko: ['쓰지 않는 레이블은 지워야 합니다', 'goto가 가리키지 않는 레이블은 죽은 코드이며 읽는 사람을 헷갈리게 합니다.', '레이블을 지웁니다.'],
  msg: ['Remove the unused label "{0}".', '쓰지 않는 레이블 "{0}"를 지웁니다.'],
  file(pf, cx) {
    const used = new Set((pf.byKind.get('Goto') || []).map((g) => g.name.toLowerCase()));
    for (const l of pf.byKind.get('Label') || []) if (!used.has(l.name.toLowerCase())) cx.report(l, l.name);
  },
  bad: fn('    skip: // Noncompliant\n    echo $a;'),
  good: fn('    retry:\n    if ($a-- > 0) {\n        goto retry;\n    }'),
});

// ── swapped arguments
function paramNames(f) { return (f.params || []).map((p) => p.name); }
rule({
  id: 'swapped-arguments', ref: 'S2234', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], checker: 'SWAPPED_ARGUMENTS',
  en: ['Parameters should be passed in the correct order', 'Variables named like the parameters but passed in another order are almost certainly swapped.', 'Pass the arguments in the declared order.'],
  ko: ['매개변수는 올바른 순서로 넘겨야 합니다', '매개변수와 같은 이름의 변수를 다른 순서로 넘기면 거의 확실히 뒤바뀐 것입니다.', '선언된 순서대로 인수를 넘깁니다.'],
  msg: ['Arguments "{0}" and "{1}" of "{2}" look swapped.', '"{2}"의 인수 "{0}"와 "{1}"가 뒤바뀐 것 같습니다.'],
  on: {
    Call(n, cx) {
      if (!n.callee || n.callee.k !== 'Name') return;
      const list = cx.proj.functions.get(A.shortName(n.callee.name).toLowerCase());
      if (!list || list.length !== 1) return;
      check(n, paramNames(list[0].node), list[0].node.name, cx);
    },
    MCall(n, cx) {
      const obj = A.unparen(n.obj);
      if (!(obj.k === 'Var' && obj.name === 'this') || typeof n.name !== 'string') return;
      const c = A.enclosingClass(n);
      const m = c && H.methodsOf(c).find((x) => x.name.toLowerCase() === n.name.toLowerCase());
      if (m) check(n, paramNames(m), m.name, cx);
    },
  },
  bad: php('function divide($dividend, $divisor)\n{\n    return $dividend / $divisor;\n}\nfunction g($divisor, $dividend)\n{\n    return divide($divisor, $dividend); // Noncompliant\n}'),
  good: php('function divide($dividend, $divisor)\n{\n    return $dividend / $divisor;\n}\nfunction g($divisor, $dividend)\n{\n    return divide($dividend, $divisor);\n}'),
});
function check(n, params, name, cx) {
  const args = n.args || [];
  if (args.some((a) => a.name || a.spread)) return;
  const names = args.map((a) => { const e = A.unparen(a.e); return e.k === 'Var' ? e.name : null; });
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (!names[i] || !names[j] || names[i] === names[j]) continue;
      if (names[i] === params[j] && names[j] === params[i]) { cx.report(n, '$' + names[i], '$' + names[j], name); return; }
    }
  }
}

// ── loops that run at most once
function exits(s) {
  if (!s) return false;
  if (s.k === 'Return' || s.k === 'Break') return true;
  if (s.k === 'ExprStmt') { const e = A.unparen(s.e); return e.k === 'Throw' || e.k === 'Exit'; }
  if (s.k === 'Block') return s.stmts.some(exits);
  if (s.k === 'If') return !!s.else && exits(s.then) && exits(s.else);
  return false;
}
function hasContinue(body) {
  let found = false;
  const visit = (x, depth) => {
    if (found) return;
    if (x.k === 'Continue' && x.levels >= depth) { found = true; return; }
    if (x.k === 'Goto') { found = true; return; }
    if (A.FUNC_KINDS.has(x.k) || x.k === 'ClassDecl') return;
    const d = ['While', 'DoWhile', 'For', 'Foreach', 'Switch'].includes(x.k) ? depth + 1 : depth;
    A.forEachChild(x, (c) => visit(c, d));
  };
  visit(body, 1);
  return found;
}
rule({
  id: 'loop-executes-once', ref: 'S1751', type: 'B', sev: 'MA', debt: 10, tags: ['confusing'], checker: 'LOOP_ONCE',
  en: ['Loops with at most one iteration should be refactored', 'A loop whose body always ends with break, return or throw runs at most once, which is rarely intended.', 'Replace the loop with an if, or fix the jump statement.'],
  ko: ['최대 한 번만 도는 루프는 고쳐야 합니다', '본문이 항상 break, return, throw로 끝나는 루프는 최대 한 번만 돌며 의도한 경우가 드뭅니다.', '루프를 if로 바꾸거나 점프 문을 고칩니다.'],
  msg: ['Refactor this loop to do more than one iteration.', '이 루프가 두 번 이상 돌도록 고칩니다.'],
  on: {
    While: loopOnce, DoWhile: loopOnce, For: loopOnce, Foreach: loopOnce,
  },
  bad: fn('    foreach ($a as $x) { // Noncompliant\n        echo $x;\n        break;\n    }'),
  good: fn('    foreach ($a as $x) {\n        if ($x > 1) {\n            break;\n        }\n        echo $x;\n    }'),
});
function loopOnce(n, cx) {
  const b = n.body;
  if (!b || b.k !== 'Block' || !b.stmts.length) return;
  if (!exits(b) || hasContinue(b)) return;
  cx.report(n);
}

// ── count() >= 0
const SIZE_FNS = new Set(['count', 'sizeof', 'strlen', 'mb_strlen']);
rule({
  id: 'size-check-non-negative', ref: 'S3981', type: 'B', sev: 'MA', debt: 2, tags: ['pitfall'], checker: 'CONSTANT_EXPRESSION_RESULT',
  en: ['Collection sizes and string lengths comparisons should make sense', 'count() and strlen() are never negative, so ">= 0" is always true and "< 0" is always false.', 'Compare against the size you really mean, for example "> 0".'],
  ko: ['크기와 길이 비교는 의미가 있어야 합니다', 'count()와 strlen()은 음수가 아니므로 ">= 0"은 항상 참이고 "< 0"은 항상 거짓입니다.', '실제로 의도한 크기와 비교합니다. 예: "> 0".'],
  msg: ['The result of "{0}" is never negative; this comparison is always {1}.', '"{0}"의 결과는 음수가 아니므로 이 비교는 항상 {1}입니다.'],
  on: {
    Bin(n, cx) {
      const l = A.unparen(n.l);
      const r = A.unparen(n.r);
      const zero = (e) => e.k === 'Lit' && e.kind === 'int' && e.value === 0;
      if (H.isCall(l, SIZE_FNS) && zero(r) && (n.op === '>=' || n.op === '<')) cx.report(n, A.callName(l) + '()', n.op === '>=' ? 'true' : 'false');
      else if (H.isCall(r, SIZE_FNS) && zero(l) && (n.op === '<=' || n.op === '>')) cx.report(n, A.callName(r) + '()', n.op === '<=' ? 'true' : 'false');
    },
  },
  bad: fn('    if (count($a) >= 0) { // Noncompliant\n        echo 1;\n    }'),
  good: fn('    if (count($a) > 0) {\n        echo 1;\n    }'),
});

// ── return $i++
rule({
  id: 'useless-increment', ref: 'S2123', type: 'B', sev: 'MA', debt: 1, tags: ['unused'], checker: 'UNUSED_VALUE',
  en: ['Values should not be uselessly incremented', 'A postfix increment of a local variable that is returned or re-assigned at once is lost.', 'Use a prefix increment or "+ 1", or remove the operator.'],
  ko: ['값을 쓸모없이 증가시키면 안 됩니다', '바로 반환되거나 다시 대입되는 지역 변수의 후위 증가는 사라집니다.', '전위 증가나 "+ 1"을 쓰거나 연산자를 지웁니다.'],
  msg: ['Remove this "{0}" or correct the code not to waste it.', '이 "{0}"를 지우거나 값이 버려지지 않도록 고칩니다.'],
  on: {
    Incr(n, cx) {
      if (n.prefix) return;
      const v = A.unparen(n.e);
      if (v.k !== 'Var' || !v.sym || v.sym.alias || v.sym.kind === 'global' || v.sym.kind === 'static' || v.sym.scope.isTop) return;
      const p = n.parent;
      if (p.k === 'Return') cx.report(n, n.op);
      else if (p.k === 'Assign' && p.op === '=' && p.r === n && p.l.k === 'Var' && p.l.name === v.name) cx.report(n, n.op);
    },
  },
  bad: php('function next_id($i)\n{\n    return $i++; // Noncompliant\n}'),
  good: php('function next_id($i)\n{\n    return ++$i;\n}'),
});

// ── instanceof that is always true / false
rule({
  id: 'instanceof-always', ref: 'S1850', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], checker: 'CONSTANT_EXPRESSION_RESULT',
  en: ['"instanceof" operators that always return true or false should be removed', 'A literal on the left of instanceof is never an object, and a fresh "new X" is always an X.', 'Remove the check or test the variable that was meant.'],
  ko: ['항상 참이나 거짓인 instanceof 연산은 지워야 합니다', 'instanceof 왼쪽의 리터럴은 객체가 아니고, 방금 만든 "new X"는 항상 X입니다.', '검사를 지우거나 의도한 변수를 검사합니다.'],
  msg: ['This "instanceof" check always returns {0}.', '이 instanceof 검사는 항상 {0}를 돌려줍니다.'],
  on: {
    Instanceof(n, cx) {
      const e = A.unparen(n.e);
      if (e.k === 'Lit' || e.k === 'Arr' || e.k === 'Interp') cx.report(n, 'false');
      else if (e.k === 'New' && e.cls && e.cls.k === 'Name' && n.cls && n.cls.k === 'Name' && A.same(e.cls, n.cls)) cx.report(n, 'true');
    },
  },
  bad: fn('    if (\'abc\' instanceof Foo) { // Noncompliant\n        echo 1;\n    }'),
  good: fn('    if ($a instanceof Foo) {\n        echo 1;\n    }'),
});

// ── switch
function caseFallsThrough(c) {
  const body = c.body.filter((s) => s.k !== 'Nop');
  if (!body.length) return false;
  const last = body[body.length - 1];
  return !A.terminates(last) && !(last.k === 'Block' && A.terminates(last));
}
rule({
  id: 'switch-fallthrough', ref: 'S128', type: 'S', sev: 'BL', debt: 10, tags: ['cwe-484', 'suspicious'], checker: 'MISSING_BREAK',
  en: ['Switch cases should end with an unconditional "break" statement', 'A non-empty case without break falls through into the next one, which is a classic source of bugs.', 'End the case with break, return or throw, or document the intent with a "fall through" comment.'],
  ko: ['switch case는 무조건 break로 끝나야 합니다', '비어 있지 않은 case에 break가 없으면 다음 case로 넘어가며 대표적인 버그 원인입니다.', 'case를 break, return, throw로 끝내거나 "fall through" 주석으로 의도를 밝힙니다.'],
  msg: ['End this switch case with an unconditional break, continue, return or throw statement.', '이 case를 무조건 break, continue, return, throw로 끝냅니다.'],
  on: {
    Switch(n, cx) {
      for (let i = 0; i < n.cases.length - 1; i++) {
        const c = n.cases[i];
        if (!caseFallsThrough(c)) continue;
        const next = n.cases[i + 1];
        if (H.commentsIn(cx.pf, c.pos, next.pos).some((x) => /fall(s|ing)?[\s-]*through/i.test(x.text))) continue;
        cx.report(c);
      }
    },
  },
  bad: fn('    switch ($a) {\n        case 1: // Noncompliant\n            foo();\n        case 2:\n            bar();\n            break;\n    }'),
  good: fn('    switch ($a) {\n        case 0:\n        case 1:\n            foo();\n            break;\n        case 2:\n            bar();\n            // fall through\n        default:\n            baz();\n    }'),
});

rule({
  id: 'default-position', ref: 'S4524', type: 'S', sev: 'CR', debt: 5, tags: ['convention'], checker: 'S4524',
  en: ['"default" clauses should be first or last', 'A default clause in the middle of the cases is easy to overlook.', 'Move the default clause to the beginning or the end of the switch.'],
  ko: ['default 절은 처음이나 마지막에 있어야 합니다', 'case들 가운데에 있는 default 절은 놓치기 쉽습니다.', 'default 절을 switch의 처음이나 끝으로 옮깁니다.'],
  msg: ['Move this "default" clause to the beginning or end of this "switch" statement.', '이 default 절을 switch 문의 처음이나 끝으로 옮깁니다.'],
  on: {
    Switch(n, cx) {
      n.cases.forEach((c, i) => { if (!c.test && i > 0 && i < n.cases.length - 1) cx.report(c); });
    },
  },
  bad: fn('    switch ($a) {\n        case 1:\n            break;\n        default: // Noncompliant\n            break;\n        case 2:\n            break;\n    }'),
  good: fn('    switch ($a) {\n        case 1:\n            break;\n        case 2:\n            break;\n        default:\n            break;\n    }'),
});

// ── finally
function jumpsOutOfFinally(fin, kinds, cb) {
  const visit = (x, loopDepth) => {
    if (A.FUNC_KINDS.has(x.k) || x.k === 'ClassDecl') return;
    if (kinds.includes(x.k)) {
      if (x.k === 'Return' || x.k === 'Throw') cb(x);
      else if (x.levels > loopDepth) cb(x);
    }
    const d = ['While', 'DoWhile', 'For', 'Foreach', 'Switch'].includes(x.k) ? loopDepth + 1 : loopDepth;
    A.forEachChild(x, (c) => visit(c, d));
  };
  visit(fin, 0);
}
rule({
  id: 'jump-in-finally', ref: 'S1143', type: 'B', sev: 'CR', debt: 30, tags: ['cwe-584', 'error-handling'], checker: 'FINALLY_JUMP',
  en: ['Jump statements should not occur in "finally" blocks', 'return, break or continue in a finally block discards any exception being thrown and overrides the try result.', 'Move the jump out of the finally block.'],
  ko: ['finally 블록에 점프 문이 있으면 안 됩니다', 'finally의 return, break, continue는 던져지는 예외를 버리고 try의 결과를 덮어씁니다.', '점프 문을 finally 밖으로 옮깁니다.'],
  msg: ['Remove this "{0}" statement from the "finally" block.', 'finally 블록에서 이 {0} 문을 지웁니다.'],
  on: {
    Try(n, cx) {
      if (n.fin) jumpsOutOfFinally(n.fin, ['Return', 'Break', 'Continue'], (x) => cx.report(x, x.k.toLowerCase()));
    },
  },
  bad: fn('    try {\n        return foo();\n    } finally {\n        return 0; // Noncompliant\n    }'),
  good: fn('    try {\n        return foo();\n    } finally {\n        cleanup();\n    }'),
});

rule({
  id: 'throw-in-finally', ref: 'S1163', type: 'S', sev: 'CR', debt: 30, tags: ['error-handling', 'suspicious'], checker: 'FINALLY_THROW',
  en: ['Exceptions should not be thrown in "finally" blocks', 'Throwing from finally hides the original exception, which makes failures hard to diagnose.', 'Handle the problem without throwing, or move the throw out of finally.'],
  ko: ['finally 블록에서 예외를 던지면 안 됩니다', 'finally에서 예외를 던지면 원래 예외가 가려져 원인 파악이 어렵습니다.', '던지지 않고 처리하거나 throw를 finally 밖으로 옮깁니다.'],
  msg: ['Refactor this code to not throw exceptions in "finally" blocks.', 'finally 블록에서 예외를 던지지 않도록 고칩니다.'],
  on: {
    Try(n, cx) {
      if (!n.fin) return;
      const visit = (x) => {
        if (A.FUNC_KINDS.has(x.k) || x.k === 'ClassDecl' || x.k === 'Try') return;
        if (x.k === 'Throw') cx.report(x);
        A.forEachChild(x, visit);
      };
      visit(n.fin);
    },
  },
  bad: fn('    try {\n        foo();\n    } finally {\n        throw new LogicException(\'x\'); // Noncompliant\n    }'),
  good: fn('    try {\n        foo();\n    } finally {\n        cleanup();\n    }'),
});

// ── $this in static context
rule({
  id: 'this-in-static', ref: 'S2014', type: 'B', sev: 'BL', debt: 5, tags: ['pitfall'], checker: 'STATIC_THIS',
  en: ['"$this" should not be used in a static context', 'There is no instance inside a static method, so $this causes a fatal error.', 'Use self:: / static:: or make the method non-static.'],
  ko: ['정적 문맥에서 $this를 쓰면 안 됩니다', '정적 메서드 안에는 인스턴스가 없으므로 $this는 치명적 오류를 일으킵니다.', 'self:: / static::을 쓰거나 메서드를 비정적으로 바꿉니다.'],
  msg: ['Remove this use of "$this".', '이 $this 사용을 지웁니다.'],
  on: {
    Var(n, cx) {
      if (n.name !== 'this') return;
      for (let p = n.parent; p; p = p.parent) {
        if (p.k === 'Closure' || p.k === 'ArrowFn') { if (p.static) break; continue; }
        if (p.k === 'FuncDecl' || p.k === 'ClassDecl') return;
        if (p.k === 'Method') { if (p.mods.has('static')) cx.report(n); return; }
      }
      for (let p = n.parent; p; p = p.parent) if (p.k === 'Closure' || p.k === 'ArrowFn') { if (p.static) cx.report(n); return; }
    },
  },
  bad: cls('    private $x = 1;\n    public static function f()\n    {\n        return $this->x; // Noncompliant\n    }', 'class Holder'),
  good: cls('    private static $x = 1;\n    public static function f()\n    {\n        return self::$x;\n    }', 'class Holder'),
});

// ── objects dropped
rule({
  id: 'object-dropped', ref: 'S1848', type: 'B', sev: 'MA', debt: 5, tags: ['bad-practice'], checker: 'UNUSED_VALUE',
  en: ['Objects should not be created to be dropped immediately without being used', 'Creating an object without keeping it usually means a missing assignment or a misplaced "throw".', 'Assign or use the object, or throw it if it is an exception.'],
  ko: ['만들자마자 쓰지 않고 버리는 객체를 만들면 안 됩니다', '객체를 만들고 보관하지 않으면 보통 대입이나 throw가 빠진 것입니다.', '객체를 대입하거나 쓰고, 예외라면 던집니다.'],
  msg: ['Either remove this useless object instantiation of "{0}" or use it.', '쓸모없는 "{0}" 객체 생성을 지우거나 객체를 사용합니다.'],
  on: {
    ExprStmt(n, cx) {
      const e = A.unparen(n.e);
      if (e.k === 'New' && e.cls && e.cls.k === 'Name') cx.report(e, e.cls.name);
    },
  },
  bad: fn('    new InvalidArgumentException(\'bad\'); // Noncompliant'),
  good: fn('    throw new InvalidArgumentException(\'bad\');'),
});

// ── overwritten array keys
rule({
  id: 'overwritten-key', ref: 'S4143', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], checker: 'OVERWRITE_VALUE',
  en: ['Map values should not be replaced unconditionally', 'Writing the same array key twice in a row loses the first value, which is usually a copy-paste error.', 'Fix the key of one of the assignments or remove the first one.'],
  ko: ['배열 값을 무조건 덮어쓰면 안 됩니다', '같은 배열 키에 연달아 두 번 쓰면 첫 값이 사라지며 대부분 복사-붙여넣기 오류입니다.', '한 대입의 키를 고치거나 첫 대입을 지웁니다.'],
  msg: ['Verify this is the key that was intended; it was already set on line {0}.', '의도한 키인지 확인합니다. 이 키는 이미 {0}행에서 설정되었습니다.'],
  on: {
    Block: overwrite, Program: overwrite,
  },
  bad: fn('    $arr[\'a\'] = 1;\n    $arr[\'a\'] = 2; // Noncompliant\n    return $arr;'),
  good: fn('    $arr[\'a\'] = 1;\n    $arr[\'b\'] = 2;\n    return $arr;'),
});
function overwrite(n, cx) {
  const list = n.stmts || [];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1];
    const b = list[i];
    if (a.k !== 'ExprStmt' || b.k !== 'ExprStmt') continue;
    const ea = A.unparen(a.e);
    const eb = A.unparen(b.e);
    if (ea.k !== 'Assign' || eb.k !== 'Assign' || ea.op !== '=' || eb.op !== '=') continue;
    if (ea.l.k !== 'Index' || !ea.l.idx || !A.same(ea.l, eb.l) || !pure(ea.l)) continue;
    const idx = A.unparen(ea.l.idx);
    if (idx.k !== 'Lit' && idx.k !== 'Var') continue;
    if (A.contains(eb.r, (x) => A.same(x, ea.l) || (x.k === 'Var' && ea.l.obj.k === 'Var' && x.name === ea.l.obj.name))) continue;
    cx.report(eb.l, ea.line);
  }
}

// ── duplicate keys in array literals
rule({
  id: 'duplicate-array-key', ref: '', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], checker: 'DUPLICATE_KEY',
  en: ['Array literals should not contain duplicate keys', 'With a duplicated key PHP silently keeps only the last value.', 'Remove the duplicate entry or fix its key.'],
  ko: ['배열 리터럴에 중복 키가 있으면 안 됩니다', '키가 중복되면 PHP는 조용히 마지막 값만 남깁니다.', '중복 항목을 지우거나 키를 고칩니다.'],
  msg: ['Key "{0}" is already defined on line {1}.', '키 "{0}"는 이미 {1}행에 정의되어 있습니다.'],
  on: {
    Arr(n, cx) {
      const seen = new Map();
      for (const it of n.items) {
        if (!it || !it.key) continue;
        const k = A.unparen(it.key);
        if (k.k !== 'Lit' || (k.kind !== 'str' && k.kind !== 'int')) continue;
        let key = String(k.value);
        if (k.kind === 'str' && /^(0|-?[1-9][0-9]*)$/.test(key)) key = String(Number(key));
        if (seen.has(key)) cx.report(k, k.value, seen.get(key).line); else seen.set(key, k);
      }
    },
  },
  bad: fn('    return [\'a\' => 1, \'b\' => 2,\n        \'a\' => 3]; // Noncompliant'),
  good: fn('    return [\'a\' => 1, \'b\' => 2, \'c\' => 3];'),
});

// ── strpos() used as a boolean
const POS_FNS = new Set(['strpos', 'stripos', 'strrpos', 'strripos', 'mb_strpos', 'mb_stripos', 'array_search']);
rule({
  id: 'strpos-as-boolean', ref: '', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'], checker: 'BAD_COMPARE',
  en: ['Results of strpos() and array_search() should be compared strictly with false', 'These functions return 0 for a match at the first position, which is falsy, so a loose test misses it.', 'Compare with "!== false" or use str_contains().'],
  ko: ['strpos()와 array_search()의 결과는 false와 엄격히 비교해야 합니다', '이 함수들은 첫 위치에서 찾으면 0을 돌려주는데 0은 거짓으로 취급되어 느슨한 검사가 놓칩니다.', '"!== false"로 비교하거나 str_contains()를 씁니다.'],
  msg: ['Compare the result of "{0}" strictly with false.', '"{0}"의 결과를 false와 엄격히 비교합니다.'],
  on: {
    Call(n, cx) {
      if (!H.isCall(n, POS_FNS)) return;
      let x = n;
      let p = n.parent;
      while (p && p.k === 'Paren') { x = p; p = p.parent; }
      if (!p) return;
      const condCtx = (p.k === 'If' && p.cond === x) || (p.k === 'While' && p.cond === x) || (p.k === 'Ternary' && p.c === x) || (p.k === 'Unary' && p.op === '!')
        || (p.k === 'Bin' && ['&&', '||', 'and', 'or'].includes(p.op));
      let loose = false;
      if (p.k === 'Bin' && ['==', '!=', '<>'].includes(p.op)) {
        const other = A.unparen(p.l === x ? p.r : p.l);
        loose = other.k === 'Lit' && (other.kind === 'bool' || (other.kind === 'int' && other.value === 0) || other.kind === 'null');
      }
      if (condCtx || loose) cx.report(n, A.callName(n));
    },
  },
  bad: fn('    if (strpos($a, \'x\')) { // Noncompliant\n        echo 1;\n    }\n    return strpos($a, \'y\') == false; // Noncompliant'),
  good: fn('    if (strpos($a, \'x\') !== false) {\n        echo 1;\n    }\n    return strpos($a, \'y\') === false;'),
});

// ── "+" used to concatenate strings
const isNumericStr = (s) => /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(s);
rule({
  id: 'string-plus', ref: '', type: 'B', sev: 'MA', debt: 2, tags: ['pitfall'], checker: 'BAD_OPERATOR',
  en: ['"+" should not be used to concatenate strings', 'In PHP "+" is arithmetic: a non-numeric string operand gives a warning or a TypeError instead of a concatenation.', 'Use the "." operator to concatenate.'],
  ko: ['문자열을 이을 때 "+"를 쓰면 안 됩니다', 'PHP에서 "+"는 산술 연산이므로 숫자가 아닌 문자열은 연결되지 않고 경고나 TypeError가 납니다.', '문자열 연결에는 "." 연산자를 씁니다.'],
  msg: ['Use "." instead of "+" to concatenate strings.', '문자열 연결에는 "+" 대신 "."를 씁니다.'],
  on: {
    Bin(n, cx) {
      if (n.op !== '+') return;
      const isStr = (e) => { e = A.unparen(e); return e.k === 'Interp' || (e.k === 'Lit' && e.kind === 'str' && !isNumericStr(e.value)); };
      if (isStr(n.l) || isStr(n.r)) cx.report({ line: n.opLine, col: n.opCol });
    },
  },
  bad: fn('    return \'Hello \' + $a; // Noncompliant'),
  good: fn('    return \'Hello \' . $a . (\'5\' + 1);'),
});

// ── string / array confusion
const STR_FNS = new Set(['strlen', 'mb_strlen', 'strtolower', 'strtoupper', 'trim', 'substr', 'str_split', 'ucfirst']);
rule({
  id: 'string-array-confusion', ref: '', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'], checker: 'BAD_TYPE',
  en: ['Array functions should not be applied to strings and string functions to arrays', 'count() on a string or strlen() on an array is a type error in PHP 8 and a logic error before.', 'Use strlen() for strings and count() for arrays.'],
  ko: ['문자열에 배열 함수를, 배열에 문자열 함수를 쓰면 안 됩니다', '문자열에 count()나 배열에 strlen()을 쓰면 PHP 8에서는 타입 오류이고 그 전에는 논리 오류입니다.', '문자열에는 strlen(), 배열에는 count()를 씁니다.'],
  msg: ['"{0}" is applied to {1}.', '"{0}"를 {1}에 적용했습니다.'],
  msgKo: null,
  on: {
    Call(n, cx) {
      const a0 = A.unparen(H.arg(n, 0));
      if (!a0) return;
      const isStr = a0.k === 'Interp' || (a0.k === 'Lit' && a0.kind === 'str');
      if (H.isCall(n, ['count', 'sizeof', 'array_keys', 'array_values', 'in_array']) && isStr && A.callName(n) !== 'in_array') cx.report(n, { en: `"${A.callName(n)}" is applied to a string.`, ko: `"${A.callName(n)}"를 문자열에 적용했습니다.` });
      else if (H.isCall(n, STR_FNS) && a0.k === 'Arr') cx.report(n, { en: `"${A.callName(n)}" is applied to an array.`, ko: `"${A.callName(n)}"를 배열에 적용했습니다.` });
    },
  },
  bad: fn('    $n = count(\'abc\'); // Noncompliant\n    return $n + strlen([1, 2]); // Noncompliant'),
  good: fn('    $n = strlen(\'abc\');\n    return $n + count([1, 2]);'),
});

// ── preg_* with invalid pattern
const PREG = new Set(['preg_match', 'preg_match_all', 'preg_replace', 'preg_replace_callback', 'preg_split', 'preg_grep', 'preg_filter']);
const PAIRS = { '(': ')', '[': ']', '{': '}', '<': '>' };
function regexProblem(p) {
  if (!p.length) return 'empty pattern';
  const d = p[0];
  if (/[A-Za-z0-9\\\s]/.test(d)) return `invalid delimiter "${d}"`;
  const close = PAIRS[d] || d;
  const end = p.lastIndexOf(close);
  if (end <= 0) return 'missing ending delimiter';
  const mods = p.slice(end + 1);
  if (/[^imsxuADSUXJne]/.test(mods)) return `unknown modifier in "${mods}"`;
  const body = p.slice(1, end);
  let depth = 0;
  let inClass = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']' && body[i - 1] !== '[' && body[i - 1] !== '^') inClass = false; continue; }
    if (c === '[') inClass = true;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth < 0) return 'unmatched ")"'; }
  }
  if (inClass) return 'missing "]"';
  if (depth > 0) return 'missing ")"';
  return null;
}
rule({
  id: 'invalid-regex', ref: 'S5856', type: 'B', sev: 'CR', debt: 5, tags: ['regex'], checker: 'BAD_REGEX',
  en: ['Regular expressions should be syntactically valid', 'An invalid PCRE pattern makes preg_* return false with a warning instead of matching.', 'Fix the delimiters, modifiers and groups of the pattern.'],
  ko: ['정규식은 문법적으로 올발라야 합니다', '잘못된 PCRE 패턴이면 preg_* 함수는 일치시키지 않고 경고와 함께 false를 돌려줍니다.', '패턴의 구분자, 수정자, 그룹을 고칩니다.'],
  msg: ['Fix this regular expression: {0}.', '이 정규식을 고칩니다: {0}.'],
  on: {
    Call(n, cx) {
      if (!H.isCall(n, PREG)) return;
      const p = H.strConst(H.arg(n, 0));
      if (p == null) return;
      const prob = regexProblem(p);
      if (prob) cx.report(H.arg(n, 0), prob);
    },
  },
  bad: fn('    preg_match(\'abc\', $a); // Noncompliant\n    return preg_match(\'/(a/\', $b); // Noncompliant'),
  good: fn('    preg_match(\'/abc/i\', $a);\n    return preg_match(\'#a(b)[)]c#u\', $b);'),
});

// ── PHPUnit
function inTestClass(n) { return H.isTestClass(A.enclosingClass(n)); }
function thisCall(n, names) {
  if (n.k === 'MCall' && typeof n.name === 'string') {
    const o = A.unparen(n.obj);
    if (o.k === 'Var' && o.name === 'this' && names.includes(n.name.toLowerCase())) return true;
  }
  if (n.k === 'SCall' && typeof n.name === 'string' && n.cls && n.cls.k === 'Name' && ['self', 'static', 'parent'].includes(n.cls.name.toLowerCase()) && names.includes(n.name.toLowerCase())) return true;
  return false;
}
const EQ_ASSERTS = ['assertequals', 'assertsame', 'assertnotequals', 'assertnotsame'];

rule({
  id: 'test-class-without-tests', ref: 'S2187', type: 'B', sev: 'BL', debt: 5, tags: ['tests'], checker: 'S2187',
  en: ['Test classes should contain at least one test case', 'A PHPUnit class without test methods runs nothing and gives a false sense of coverage.', 'Add test methods or make the class abstract.'],
  ko: ['테스트 클래스에는 테스트 케이스가 하나 이상 있어야 합니다', '테스트 메서드가 없는 PHPUnit 클래스는 아무것도 실행하지 않아 잘못된 안심을 줍니다.', '테스트 메서드를 추가하거나 클래스를 abstract로 만듭니다.'],
  msg: ['Add some tests to class "{0}".', '클래스 "{0}"에 테스트를 추가합니다.'],
  on: {
    ClassDecl(n, cx) {
      if (!H.isTestClass(n) || n.mods.has('abstract') || !n.name) return;
      if (H.methodsOf(n).some((m) => H.isTestMethod(cx.pf, m))) return;
      cx.reportName(n, n.name);
    },
  },
  bad: php('use PHPUnit\\Framework\\TestCase;\nclass UserTest extends TestCase // Noncompliant\n{\n    public function helper()\n    {\n        return 1;\n    }\n}'),
  good: php('use PHPUnit\\Framework\\TestCase;\nclass UserTest extends TestCase\n{\n    public function testName()\n    {\n        $this->assertSame(1, 1);\n    }\n}'),
});

rule({
  id: 'test-without-assertion', ref: 'S2699', type: 'B', sev: 'BL', debt: 10, tags: ['tests'], checker: 'S2699',
  en: ['Tests should include assertions', 'A test without any assertion passes as long as nothing crashes and verifies nothing.', 'Add at least one assertion or expectation.'],
  ko: ['테스트에는 단언이 있어야 합니다', '단언이 없는 테스트는 중단만 없으면 통과하며 아무것도 검증하지 않습니다.', '단언이나 기대를 하나 이상 추가합니다.'],
  msg: ['Add at least one assertion to this test case.', '이 테스트 케이스에 단언을 하나 이상 추가합니다.'],
  on: {
    Method(n, cx) {
      if (!n.body || !inTestClass(n) || !H.isTestMethod(cx.pf, n)) return;
      const has = A.contains(n.body, (x) => {
        const nm = (x.k === 'MCall' || x.k === 'SCall') && typeof x.name === 'string' ? x.name.toLowerCase() : x.k === 'Call' ? A.callName(x) : '';
        return /^(assert|expect|fail|verify|markTest|should)/i.test(nm) || nm === 'expects';
      }, true);
      if (!has) cx.reportName(n);
    },
  },
  bad: php('use PHPUnit\\Framework\\TestCase;\nclass CartTest extends TestCase\n{\n    public function testAdd() // Noncompliant\n    {\n        $cart = new Cart();\n        $cart->add(1);\n    }\n}'),
  good: php('use PHPUnit\\Framework\\TestCase;\nclass CartTest extends TestCase\n{\n    public function testAdd()\n    {\n        $cart = new Cart();\n        $cart->add(1);\n        $this->assertCount(1, $cart->items());\n    }\n}'),
});

rule({
  id: 'assertion-argument-order', ref: 'S3415', type: 'B', sev: 'MA', debt: 5, tags: ['tests'], checker: 'S3415',
  en: ['Assertion arguments should be passed in the correct order', 'PHPUnit expects the expected value first; swapped arguments produce misleading failure messages.', 'Pass the expected literal first and the actual value second.'],
  ko: ['단언 인수는 올바른 순서로 넘겨야 합니다', 'PHPUnit은 기대값을 먼저 받으므로 뒤바뀐 인수는 오해를 부르는 실패 메시지를 만듭니다.', '기대 리터럴을 먼저, 실제 값을 두 번째로 넘깁니다.'],
  msg: ['Swap these 2 arguments so they are in the correct order: expected value, actual value.', '두 인수를 바꿔 기대값, 실제 값 순서로 넘깁니다.'],
  on: {
    MCall(n, cx) { order(n, cx); }, SCall(n, cx) { order(n, cx); },
  },
  bad: php('use PHPUnit\\Framework\\TestCase;\nclass MathTest extends TestCase\n{\n    public function testSum()\n    {\n        $result = 40 + 2;\n        $this->assertEquals($result, 42); // Noncompliant\n    }\n}'),
  good: php('use PHPUnit\\Framework\\TestCase;\nclass MathTest extends TestCase\n{\n    public function testSum()\n    {\n        $result = 40 + 2;\n        $this->assertEquals(42, $result);\n    }\n}'),
});
function order(n, cx) {
  if (!thisCall(n, EQ_ASSERTS)) return;
  const a = A.unparen(H.arg(n, 0));
  const b = A.unparen(H.arg(n, 1));
  if (!a || !b) return;
  const lit = (e) => e.k === 'Lit' || (e.k === 'Arr' && !A.contains(e, (x) => x.k === 'Var'));
  if (!lit(a) && lit(b)) cx.report(n);
}

rule({
  id: 'boolean-literal-assertion', ref: 'S2701', type: 'S', sev: 'CR', debt: 5, tags: ['tests'], checker: 'S2701',
  en: ['Literal boolean values should not be used in assertions', 'assertEquals(true, $x) is less readable and less strict than assertTrue($x).', 'Use assertTrue / assertFalse instead.'],
  ko: ['단언에 불리언 리터럴을 쓰면 안 됩니다', 'assertEquals(true, $x)는 assertTrue($x)보다 읽기 어렵고 덜 엄격합니다.', 'assertTrue / assertFalse를 씁니다.'],
  msg: ['Use "{0}" instead.', '대신 "{0}"를 씁니다.'],
  on: {
    MCall(n, cx) {
      if (!thisCall(n, EQ_ASSERTS)) return;
      for (const i of [0, 1]) {
        const a = A.unparen(H.arg(n, i));
        if (a && a.k === 'Lit' && a.kind === 'bool') { const neg = n.name.toLowerCase().includes('not'); cx.report(n, (a.value !== neg) ? 'assertTrue' : 'assertFalse'); return; }
      }
    },
  },
  bad: php('use PHPUnit\\Framework\\TestCase;\nclass FlagTest extends TestCase\n{\n    public function testOn()\n    {\n        $this->assertEquals(true, flag()); // Noncompliant\n    }\n}'),
  good: php('use PHPUnit\\Framework\\TestCase;\nclass FlagTest extends TestCase\n{\n    public function testOn()\n    {\n        $this->assertTrue(flag());\n    }\n}'),
});

rule({
  id: 'skipped-test', ref: 'S1607', type: 'S', sev: 'MA', debt: 5, tags: ['tests'], checker: 'S1607',
  en: ['Tests should not be skipped without a reason', 'Skipped and incomplete tests are easily forgotten and hide regressions.', 'Fix and re-enable the test, or remove it.'],
  ko: ['이유 없이 테스트를 건너뛰면 안 됩니다', '건너뛰거나 미완성인 테스트는 잊히기 쉽고 회귀를 가립니다.', '테스트를 고쳐 다시 켜거나 지웁니다.'],
  msg: ['Either remove this call to "{0}" or fix the test.', '"{0}" 호출을 지우거나 테스트를 고칩니다.'],
  on: {
    MCall(n, cx) {
      if (thisCall(n, ['marktestskipped', 'marktestincomplete']) && !H.arg(n, 0)) cx.report(n, n.name);
    },
  },
  bad: php('use PHPUnit\\Framework\\TestCase;\nclass SlowTest extends TestCase\n{\n    public function testBig()\n    {\n        $this->markTestSkipped(); // Noncompliant\n    }\n}'),
  good: php('use PHPUnit\\Framework\\TestCase;\nclass SlowTest extends TestCase\n{\n    public function testBig()\n    {\n        if (!extension_loaded(\'gmp\')) {\n            $this->markTestSkipped(\'gmp extension is required\');\n        }\n        $this->assertTrue(true);\n    }\n}'),
});

// ── flow engine rules (reported by index.js)
rule({
  id: 'dead-store', ref: 'S1854', type: 'S', sev: 'MA', debt: 15, tags: ['cwe-563', 'unused'], checker: 'UNUSED_VALUE', engine: 'flow',
  en: ['Unused assignments should be removed', 'A value written to a local variable and overwritten or never read afterwards is wasted work and often hides a bug.', 'Remove the assignment or use the value.'],
  ko: ['쓰지 않는 대입은 지워야 합니다', '지역 변수에 쓴 값이 덮어써지거나 다시 읽히지 않으면 헛일이며 버그를 숨기는 경우가 많습니다.', '대입을 지우거나 값을 사용합니다.'],
  msg: ['Remove this useless assignment to local variable "${0}".', '지역 변수 "${0}"에 대한 쓸모없는 대입을 지웁니다.'],
  bad: fn('    $x = $a * 2; // Noncompliant\n    $x = 3;\n    return $x + $b;'),
  good: fn('    $x = $a * 2;\n    if ($b) {\n        $x = 3;\n    }\n    return $x + $c;'),
});

rule({
  id: 'condition-always', ref: 'S2583', type: 'B', sev: 'MA', debt: 10, tags: ['cwe-571', 'cwe-570', 'pitfall'], checker: 'DEADCODE', engine: 'flow',
  en: ['Conditionally executed code should be reachable', 'A condition that is always true or always false makes one branch dead code; the logic is usually wrong.', 'Fix the condition or remove the dead branch.'],
  ko: ['조건부로 실행되는 코드는 도달할 수 있어야 합니다', '항상 참이거나 거짓인 조건은 한 분기를 죽은 코드로 만들며 대부분 논리가 틀렸습니다.', '조건을 고치거나 죽은 분기를 지웁니다.'],
  msg: ['Change this condition so that it does not always evaluate to "{0}".', '이 조건이 항상 "{0}"가 되지 않도록 고칩니다.'],
  bad: fn('    $x = false;\n    if ($x) { // Noncompliant\n        echo 1;\n    }'),
  good: fn('    $x = $a > 1;\n    if ($x) {\n        echo 1;\n    }\n    $done = false;\n    while (!$done) {\n        $done = poll();\n    }'),
});

rule({
  id: 'gratuitous-boolean', ref: 'S2589', type: 'S', sev: 'MA', debt: 5, tags: ['cwe-571', 'cwe-570', 'suspicious'], checker: 'CONSTANT_EXPRESSION_RESULT', engine: 'flow',
  en: ['Boolean expressions should not be gratuitous', 'An operand of && or || whose value is known in advance does not change the result and signals a logic error.', 'Remove the operand or fix the logic.'],
  ko: ['불필요한 불리언 식을 쓰면 안 됩니다', '값이 미리 정해진 && 또는 || 피연산자는 결과를 바꾸지 않으며 논리 오류의 신호입니다.', '피연산자를 지우거나 논리를 고칩니다.'],
  msg: ['Remove this expression which always evaluates to "{0}".', '항상 "{0}"가 되는 이 식을 지웁니다.'],
  bad: fn('    $ok = true;\n    if ($ok && $a) { // Noncompliant\n        echo 1;\n    }'),
  good: fn('    $ok = $b > 0;\n    if ($ok && $a) {\n        echo 1;\n    }'),
});

rule({
  id: 'unreachable-code', ref: 'S1763', type: 'B', sev: 'MA', debt: 5, tags: ['cwe-561', 'unused'], checker: 'UNREACHABLE', engine: 'flow',
  en: ['All code should be reachable', 'Statements after return, throw, exit, break or continue can never run.', 'Remove the unreachable statements or fix the jump before them.'],
  ko: ['모든 코드는 도달할 수 있어야 합니다', 'return, throw, exit, break, continue 뒤의 문장은 실행될 수 없습니다.', '도달할 수 없는 문장을 지우거나 앞의 점프를 고칩니다.'],
  msg: ['Remove this unreachable code.', '도달할 수 없는 이 코드를 지웁니다.'],
  bad: fn('    return 1;\n    echo $a; // Noncompliant'),
  good: fn('    if ($a) {\n        return 1;\n    }\n    echo $a;'),
});

module.exports = { ifChain, isChainHead, exits };
