'use strict';

// Maintainability rules: unused code, complexity and size, simplifications,
// exception handling style, risky constructs.

const { rule, php, fn, cls } = require('./core');
const A = require('../ast');
const H = require('./h');
const { ifChain, isChainHead } = require('./bugs');

const nameAt = (n) => ({ line: n.nameLine || n.line, col: n.nameCol || n.col });
const fnDisplay = (n) => (n.k === 'FuncDecl' || n.k === 'Method' ? n.name : 'function');
const LOOPS = new Set(['While', 'DoWhile', 'For', 'Foreach']);

// ── unused code
rule({
  id: 'unused-local-variable', ref: 'S1481', type: 'S', sev: 'MI', debt: 5, tags: ['unused'], checker: 'UNUSED_VALUE',
  en: ['Unused local variables should be removed', 'A local variable that is assigned but never read is dead code.', 'Remove the variable or use it.'],
  ko: ['쓰지 않는 지역 변수는 지워야 합니다', '대입만 되고 읽히지 않는 지역 변수는 죽은 코드입니다.', '변수를 지우거나 사용합니다.'],
  msg: ['Remove this unused "${0}" local variable.', '쓰지 않는 지역 변수 "${0}"를 지웁니다.'],
  on: {
    FuncDecl: unusedLocals, Method: unusedLocals, Closure: unusedLocals,
  },
  bad: fn('    $unused = compute(); // Noncompliant\n    return $a;'),
  good: fn('    $used = compute();\n    foreach ($b as $key => $value) {\n        echo $value;\n    }\n    [$x, $y] = $c;\n    return $used + $x + $y;'),
});
function unusedLocals(n, cx) {
  const sc = n.scope;
  if (!sc || sc.dynamic || !n.body) return;
  for (const s of sc.vars.values()) {
    if (s.kind !== 'local' || s.reads > 0 || s.alias || !s.decl || s.name.startsWith('_')) continue;
    if (s.decl.destruct) continue;
    cx.report(s.decl, s.name);
  }
}

rule({
  id: 'unused-parameter', ref: 'S1172', type: 'S', sev: 'MA', debt: 5, tags: ['unused'], checker: 'UNUSED_PARAM',
  en: ['Unused function parameters should be removed', 'A parameter that is never used makes the signature misleading for callers.', 'Remove the parameter or use it.'],
  ko: ['쓰지 않는 함수 매개변수는 지워야 합니다', '쓰지 않는 매개변수는 호출하는 쪽에 시그니처를 오해하게 만듭니다.', '매개변수를 지우거나 사용합니다.'],
  msg: ['Remove the unused function parameter "${0}".', '쓰지 않는 함수 매개변수 "${0}"를 지웁니다.'],
  on: {
    FuncDecl: unusedParams, Closure: unusedParams,
    Method(n, cx) { if (n.mods.has('private')) unusedParams(n, cx); },
  },
  bad: php('function area($w, $h, $unit) // Noncompliant\n{\n    return $w * $h;\n}'),
  good: php('function area($w, $h)\n{\n    return $w * $h;\n}\n$f = function ($x) {\n    return func_get_args();\n};'),
});
function unusedParams(n, cx) {
  const sc = n.scope;
  if (!sc || sc.dynamic || sc.hasFuncGetArgs || !n.body || !n.body.stmts.length) return;
  for (const s of sc.params) {
    if (s.reads > 0 || s.alias || s.name.startsWith('_') || (s.param && s.param.mods && s.param.mods.size)) continue;
    cx.report(s.param, s.name);
  }
}

rule({
  id: 'parameter-reassigned', ref: 'S1226', type: 'S', sev: 'MI', debt: 2, tags: ['pitfall'], checker: 'PARAM_OVERWRITE',
  en: ['Function parameters initial values should not be ignored', 'Overwriting a parameter before reading it discards the value passed by the caller.', 'Use a new local variable, or read the parameter first.'],
  ko: ['함수 매개변수의 초깃값을 무시하면 안 됩니다', '매개변수를 읽기 전에 덮어쓰면 호출자가 넘긴 값이 버려집니다.', '새 지역 변수를 쓰거나 매개변수를 먼저 읽습니다.'],
  msg: ['Introduce a new variable instead of reusing the parameter "${0}".', '매개변수 "${0}"를 다시 쓰지 말고 새 변수를 도입합니다.'],
  on: {
    FuncDecl: paramReassigned, Method: paramReassigned, Closure: paramReassigned,
  },
  bad: php('function greet($name)\n{\n    $name = \'guest\'; // Noncompliant\n    return $name;\n}'),
  good: php('function greet($name)\n{\n    $name = trim($name);\n    return $name;\n}'),
});
function paramReassigned(n, cx) {
  const sc = n.scope;
  if (!sc || !n.body) return;
  for (const st of n.body.stmts) {
    if (st.k !== 'ExprStmt') break;
    const e = A.unparen(st.e);
    if (e.k !== 'Assign' || e.op !== '=' || e.l.k !== 'Var') break;
    const s = e.l.sym;
    if (s && s.kind === 'param' && !s.alias && !A.contains(e.r, (x) => x.k === 'Var' && x.sym === s)) {
      const firstRef = s.refs.find((r) => r !== s.param);
      if (firstRef === e.l) cx.report(e.l, s.name);
    }
    break;
  }
}

rule({
  id: 'unused-private-method', ref: 'S1144', type: 'S', sev: 'MA', debt: 5, tags: ['unused'], checker: 'UNUSED_CODE',
  en: ['Unused private methods should be removed', 'A private method that is never called is dead code.', 'Remove the method or call it.'],
  ko: ['쓰지 않는 private 메서드는 지워야 합니다', '한 번도 호출되지 않는 private 메서드는 죽은 코드입니다.', '메서드를 지우거나 호출합니다.'],
  msg: ['Remove this unused private "{0}" method.', '쓰지 않는 private 메서드 "{0}"를 지웁니다.'],
  on: {
    ClassDecl(n, cx) {
      const text = cx.text(n);
      for (const m of H.methodsOf(n)) {
        if (!m.mods.has('private') || m.name.startsWith('__')) continue;
        const re = new RegExp('(->|::|[\'"])\\s*' + m.name.replace(/[^A-Za-z0-9_]/g, '') + '\\b', 'i');
        const others = text.slice(0, m.pos - n.pos) + text.slice(m.end - n.pos);
        if (!re.test(others)) cx.reportName(m, m.name);
      }
    },
  },
  bad: cls('    private function helper() // Noncompliant\n    {\n        return 1;\n    }\n    public function run()\n    {\n        return 2;\n    }'),
  good: cls('    private function helper()\n    {\n        return 1;\n    }\n    public function run()\n    {\n        return $this->helper();\n    }'),
});

rule({
  id: 'unused-private-field', ref: 'S1068', type: 'S', sev: 'MA', debt: 5, tags: ['unused'], checker: 'UNUSED_CODE',
  en: ['Unused private fields should be removed', 'A private property that is never read is dead code.', 'Remove the property or use it.'],
  ko: ['쓰지 않는 private 필드는 지워야 합니다', '한 번도 읽히지 않는 private 속성은 죽은 코드입니다.', '속성을 지우거나 사용합니다.'],
  msg: ['Remove this unused "${0}" private field.', '쓰지 않는 private 필드 "${0}"를 지웁니다.'],
  on: {
    ClassDecl(n, cx) {
      const text = cx.text(n);
      if (/__get|__set|get_object_vars|compact\(|\$this->\{|\$this->\$/.test(text)) return;
      for (const p of H.propsOf(n)) {
        if (!p.mods.has('private')) continue;
        for (const it of p.props) {
          const nm = it.name.replace(/[^A-Za-z0-9_]/g, '');
          const re = new RegExp('(->|::\\$)' + nm + '\\b');
          if (!re.test(text)) cx.report(it, it.name);
        }
      }
    },
  },
  bad: cls('    private $cache; // Noncompliant\n    private $name;\n    public function name()\n    {\n        return $this->name;\n    }'),
  good: cls('    private $name;\n    public function name()\n    {\n        return $this->name;\n    }'),
});

rule({
  id: 'unused-import', ref: 'S1128', type: 'S', sev: 'MI', debt: 2, tags: ['unused'], checker: 'UNUSED_CODE',
  en: ['Unnecessary imports should be removed', 'A "use" import that is never referenced is clutter and may hide a missing dependency.', 'Remove the unused import.'],
  ko: ['불필요한 import는 지워야 합니다', '참조되지 않는 use 가져오기는 잡동사니이며 빠진 의존성을 가릴 수 있습니다.', '쓰지 않는 import를 지웁니다.'],
  msg: ['Remove this unused "{0}" import.', '쓰지 않는 "{0}" import를 지웁니다.'],
  on: {
    Use(n, cx) {
      if (n.parent && n.parent.k !== 'Program' && n.parent.k !== 'Namespace') return;
      const src = cx.src;
      const rest = src.slice(0, n.pos) + ' '.repeat(n.end - n.pos) + src.slice(n.end);
      for (const it of n.items) {
        const alias = (it.alias || A.shortName(it.name)).replace(/[^A-Za-z0-9_]/g, '');
        if (!alias) continue;
        const re = new RegExp('(^|[^A-Za-z0-9_$\\\\])' + alias + '(?![A-Za-z0-9_])', n.kind === 'const' ? '' : 'i');
        if (!re.test(rest)) cx.report(it, it.name);
      }
    },
  },
  bad: php('namespace App;\nuse Foo\\Bar;\nuse Foo\\Unused; // Noncompliant\nfunction make()\n{\n    return new Bar();\n}'),
  good: php('namespace App;\nuse Foo\\Bar;\nuse Foo\\Baz as Qux;\nfunction make(Qux $q)\n{\n    return new Bar($q);\n}'),
});

// ── complexity and size
function cognitive(fnNode) {
  let total = 0;
  const LOGIC = new Set(['&&', '||', 'and', 'or']);
  const logical = (e) => {
    const ops = [];
    const flat = (x) => {
      x = A.unparen(x);
      if (x && x.k === 'Bin' && LOGIC.has(x.op)) { flat(x.l); ops.push(x.op === 'and' ? '&&' : x.op === 'or' ? '||' : x.op); flat(x.r); }
    };
    flat(e);
    let n = 0;
    for (let i = 0; i < ops.length; i++) if (i === 0 || ops[i] !== ops[i - 1]) n++;
    return n;
  };
  const visit = (x, nest) => {
    if (!x || typeof x !== 'object') return;
    switch (x.k) {
      case 'FuncDecl': case 'Method': case 'ClassDecl': return;
      case 'Closure': case 'ArrowFn': A.forEachChild(x, (c) => visit(c, nest + 1)); return;
      case 'If': {
        total += 1 + nest;
        visit(x.cond, nest);
        visit(x.then, nest + 1);
        let f = x.else;
        while (f && f.k === 'If') { total += 1; visit(f.cond, nest); visit(f.then, nest + 1); f = f.else; }
        if (f) { total += 1; visit(f, nest + 1); }
        return;
      }
      case 'While': case 'DoWhile': case 'For': case 'Foreach': case 'Switch': case 'Match':
        total += 1 + nest;
        A.forEachChild(x, (c, key) => visit(c, key === 'body' || key === 'cases' || key === 'arms' ? nest + 1 : nest));
        return;
      case 'Try':
        visit(x.block, nest);
        for (const c of x.catches) { total += 1 + nest; visit(c.body, nest + 1); }
        if (x.fin) visit(x.fin, nest);
        return;
      case 'Ternary':
        total += 1 + nest;
        A.forEachChild(x, (c) => visit(c, nest + 1));
        return;
      case 'Bin':
        if (LOGIC.has(x.op)) {
          const p = x.parent;
          const pp = p && p.k === 'Paren' ? p.parent : p;
          if (!(pp && pp.k === 'Bin' && LOGIC.has(pp.op))) total += logical(x);
        }
        break;
      case 'Break': case 'Continue': if (x.levels > 1) total += 1; break;
      case 'Goto': total += 1; break;
      default: break;
    }
    A.forEachChild(x, (c) => visit(c, nest));
  };
  if (fnNode.body) visit(fnNode.body, 0);
  return total;
}

rule({
  id: 'cognitive-complexity', ref: 'S3776', type: 'S', sev: 'CR', debt: 10, tags: ['brain-overload'], checker: 'COMPLEXITY',
  en: ['Cognitive Complexity of functions should not be too high', 'Deeply nested and branching code is hard to read, test and change.', 'Extract parts of the function into smaller well-named functions.'],
  ko: ['함수의 인지 복잡도가 너무 높으면 안 됩니다', '깊게 중첩되고 분기가 많은 코드는 읽고 시험하고 바꾸기 어렵습니다.', '함수의 일부를 이름이 분명한 작은 함수로 분리합니다.'],
  msg: ['Refactor this function to reduce its Cognitive Complexity from {0} to the {1} allowed.', '이 함수의 인지 복잡도를 {0}에서 허용치 {1} 이하로 줄이도록 고칩니다.'],
  on: {
    FuncDecl: cogn, Method: cogn,
  },
  bad: fn(`    if ($a) { // Noncompliant
        foreach ($b as $x) {
            if ($x && $c || $a) {
                while ($c) {
                    if ($x > 1) {
                        echo 1;
                    } elseif ($x < 0) {
                        echo 2;
                    } else {
                        echo 3;
                    }
                }
            }
        }
    }`).replace('function sample($a, $b, $c) // Noncompliant', 'function sample($a, $b, $c)').replace('    if ($a) { // Noncompliant', '    if ($a) {').replace('function sample($a, $b, $c)', 'function sample($a, $b, $c) // Noncompliant'),
  good: fn('    if ($a) {\n        foreach ($b as $x) {\n            echo $x;\n        }\n    }'),
});
function cogn(n, cx) {
  if (!n.body) return;
  const max = cx.opt('threshold', 15);
  const c = cognitive(n);
  if (c > max) cx.reportName(n, c, max);
}

function cyclomatic(fnNode) {
  let c = 1;
  A.walk(fnNode.body, (x) => {
    if (x === fnNode.body) return;
    if (x.k === 'Closure' || x.k === 'ArrowFn') return false;
    if (['If', 'While', 'DoWhile', 'For', 'Foreach', 'Catch', 'Ternary'].includes(x.k)) c++;
    else if (x.k === 'Case' && x.test) c++;
    else if (x.k === 'MatchArm' && x.conds) c++;
    else if (x.k === 'Bin' && ['&&', '||', 'and', 'or', '??'].includes(x.op)) c++;
    return undefined;
  });
  return c;
}
rule({
  id: 'cyclomatic-complexity', ref: 'S1541', type: 'S', sev: 'CR', debt: 10, tags: ['brain-overload'], checker: 'COMPLEXITY',
  en: ['Functions should not be too complex', 'A high number of independent paths makes a function hard to test completely.', 'Split the function into smaller ones.'],
  ko: ['함수가 너무 복잡하면 안 됩니다', '독립 경로가 많으면 함수를 완전히 시험하기 어렵습니다.', '함수를 더 작은 함수로 나눕니다.'],
  msg: ['The Cyclomatic Complexity of this function is {0} which is greater than {1} authorized.', '이 함수의 순환 복잡도는 {0}로 허용치 {1}보다 큽니다.'],
  on: {
    FuncDecl: cyclo, Method: cyclo,
  },
  bad: fn(Array.from({ length: 20 }, (_, i) => `    if ($a == ${i}) {\n        echo ${i};\n    }`).join('\n')).replace('function sample($a, $b, $c)', 'function sample($a, $b, $c) // Noncompliant'),
  good: fn('    if ($a) {\n        echo 1;\n    }'),
});
function cyclo(n, cx) {
  if (!n.body) return;
  const max = cx.opt('threshold', 20);
  const c = cyclomatic(n);
  if (c > max) cx.reportName(n, c, max);
}

rule({
  id: 'function-too-long', ref: 'S138', type: 'S', sev: 'MA', debt: 20, tags: ['brain-overload'], checker: 'SIZE',
  en: ['Functions should not have too many lines of code', 'Very long functions do too many things and are hard to understand.', 'Split the function into smaller ones.'],
  ko: ['함수의 코드 줄 수가 너무 많으면 안 됩니다', '아주 긴 함수는 너무 많은 일을 하며 이해하기 어렵습니다.', '함수를 더 작은 함수로 나눕니다.'],
  msg: ['This function has {0} lines, which is greater than the {1} lines authorized. Split it into smaller functions.', '이 함수는 {0}줄로 허용치 {1}줄보다 깁니다. 더 작은 함수로 나눕니다.'],
  on: {
    FuncDecl: fnLen, Method: fnLen,
  },
  bad: fn(Array.from({ length: 150 }, () => '    $a++;').join('\n')).replace('function sample($a, $b, $c)', 'function sample($a, $b, $c) // Noncompliant'),
  good: fn('    $a++;\n    return $a;'),
});
function fnLen(n, cx) {
  if (!n.body) return;
  const max = cx.opt('max', 150);
  const lines = n.body.endLine - n.line + 1;
  if (lines > max) cx.reportName(n, lines, max);
}

rule({
  id: 'too-many-parameters', ref: 'S107', type: 'S', sev: 'MA', debt: 20, tags: ['brain-overload'], checker: 'SIZE',
  en: ['Functions should not have too many parameters', 'A long parameter list is hard to use correctly and suggests the function does too much.', 'Group related parameters into an object or split the function.'],
  ko: ['함수의 매개변수가 너무 많으면 안 됩니다', '긴 매개변수 목록은 바르게 쓰기 어렵고 함수가 너무 많은 일을 한다는 신호입니다.', '관련 매개변수를 객체로 묶거나 함수를 나눕니다.'],
  msg: ['This function has {0} parameters, which is greater than the {1} authorized.', '이 함수의 매개변수는 {0}개로 허용치 {1}개보다 많습니다.'],
  on: {
    FuncDecl: tooManyParams, Method: tooManyParams,
  },
  bad: php('function f($a, $b, $c, $d, $e, $f, $g, $h) // Noncompliant\n{\n    return $a . $b . $c . $d . $e . $f . $g . $h;\n}'),
  good: php('function f($a, $b, $c)\n{\n    return $a . $b . $c;\n}\nclass Point\n{\n    public function __construct(public int $a, public int $b, public int $c, public int $d, public int $e, public int $f, public int $g, public int $h)\n    {\n    }\n}'),
});
function tooManyParams(n, cx) {
  const max = cx.opt('max', 7);
  if (n.k === 'Method' && n.name.toLowerCase() === '__construct' && n.params.some((p) => p.mods && p.mods.size)) return;
  if (n.params.length > max) cx.reportName(n, n.params.length, max);
}

rule({
  id: 'too-many-returns', ref: 'S1142', type: 'S', sev: 'MA', debt: 20, tags: ['brain-overload'], checker: 'SIZE',
  en: ['Functions should not contain too many return statements', 'Many exit points make the flow of a function hard to follow.', 'Restructure the function to have fewer returns.'],
  ko: ['함수에 return 문이 너무 많으면 안 됩니다', '종료 지점이 많으면 함수의 흐름을 따라가기 어렵습니다.', 'return이 적어지도록 함수를 재구성합니다.'],
  msg: ['This function has {0} returns, which is more than the {1} allowed.', '이 함수의 return은 {0}개로 허용치 {1}개보다 많습니다.'],
  on: {
    FuncDecl: returns, Method: returns,
  },
  bad: fn('    if ($a) {\n        return 1;\n    }\n    if ($b) {\n        return 2;\n    }\n    if ($c) {\n        return 3;\n    }\n    return 4;').replace('function sample($a, $b, $c)', 'function sample($a, $b, $c) // Noncompliant'),
  good: fn('    if ($a) {\n        return 1;\n    }\n    return $b ? 2 : 3;'),
});
function returns(n, cx) {
  if (!n.body) return;
  let c = 0;
  A.walk(n.body, (x) => { if (x.k === 'Return') c++; });
  const max = cx.opt('max', 3);
  if (c > max) cx.reportName(n, c, max);
}

const NEST_KINDS = new Set(['If', 'While', 'DoWhile', 'For', 'Foreach', 'Switch', 'Try', 'Match']);
rule({
  id: 'nesting-too-deep', ref: 'S134', type: 'S', sev: 'CR', debt: 10, tags: ['brain-overload'], checker: 'COMPLEXITY',
  en: ['Control flow statements should not be nested too deeply', 'Deeply nested if/for/while/switch/try code is hard to read.', 'Extract the inner part into a function or return early.'],
  ko: ['제어 흐름 문을 너무 깊게 중첩하면 안 됩니다', '깊게 중첩된 if/for/while/switch/try 코드는 읽기 어렵습니다.', '안쪽 부분을 함수로 분리하거나 일찍 반환합니다.'],
  msg: ['Refactor this code to not nest more than {0} control flow statements.', '제어 흐름 문이 {0}단계를 넘게 중첩되지 않도록 고칩니다.'],
  on: {
    If: nest, While: nest, DoWhile: nest, For: nest, Foreach: nest, Switch: nest, Try: nest,
  },
  bad: fn('    if ($a) {\n        foreach ($b as $x) {\n            while ($c) {\n                if ($x) { // Noncompliant\n                    echo 1;\n                }\n            }\n        }\n    }'),
  good: fn('    if ($a) {\n        foreach ($b as $x) {\n            while ($c) {\n                echo $x;\n            }\n        }\n    } elseif ($b) {\n        echo 2;\n    } elseif ($c) {\n        echo 3;\n    }'),
});
function nest(n, cx) {
  if (n.k === 'If' && !isChainHead(n)) return;
  const max = cx.opt('max', 3);
  let depth = 1;
  for (let p = n.parent; p; p = p.parent) {
    if (A.FUNC_KINDS.has(p.k) || p.k === 'ClassDecl') break;
    if (NEST_KINDS.has(p.k) && !(p.k === 'If' && p.else === n)) {
      if (p.k === 'If' && !isChainHead(p)) continue;
      depth++;
    }
  }
  if (depth === max + 1) cx.report(n, max);
}

rule({
  id: 'file-too-long', ref: 'S104', type: 'S', sev: 'MA', debt: 60, tags: ['brain-overload'], checker: 'SIZE',
  en: ['Files should not have too many lines of code', 'A very long file usually holds several responsibilities.', 'Split the file into smaller, focused files.'],
  ko: ['파일의 코드 줄 수가 너무 많으면 안 됩니다', '아주 긴 파일은 보통 여러 책임을 함께 가집니다.', '파일을 작고 집중된 파일로 나눕니다.'],
  msg: ['This file has {0} lines, which is greater than {1} authorized. Split it into smaller files.', '이 파일은 {0}줄로 허용치 {1}줄보다 깁니다. 더 작은 파일로 나눕니다.'],
  file(pf, cx) {
    const max = cx.opt('max', 1000);
    const n = pf.lines.length - (pf.lines[pf.lines.length - 1] === '' ? 1 : 0);
    if (n > max) cx.report({ line: 1, col: 1 }, n, max);
  },
  bad: '<?php // Noncompliant\n' + Array.from({ length: 1000 }, (_, i) => `$v${i} = ${i};`).join('\n') + '\n',
  good: php('$a = 1;'),
});

rule({
  id: 'class-too-long', ref: 'S2042', type: 'S', sev: 'MA', debt: 60, tags: ['brain-overload'], checker: 'SIZE',
  en: ['Classes should not have too many lines of code', 'A very long class usually has several responsibilities.', 'Split the class into smaller classes.'],
  ko: ['클래스의 코드 줄 수가 너무 많으면 안 됩니다', '아주 긴 클래스는 보통 여러 책임을 함께 가집니다.', '클래스를 더 작은 클래스로 나눕니다.'],
  msg: ['This class has {0} lines, which is greater than the {1} authorized. Split it into smaller classes.', '이 클래스는 {0}줄로 허용치 {1}줄보다 깁니다. 더 작은 클래스로 나눕니다.'],
  on: {
    ClassDecl(n, cx) {
      if (n.anon) return;
      const max = cx.opt('max', 200);
      const lines = n.endLine - n.line + 1;
      if (lines > max) cx.reportName(n, lines, max);
    },
  },
  bad: php('class Big // Noncompliant\n{\n' + Array.from({ length: 200 }, (_, i) => `    public $p${i};`).join('\n') + '\n}'),
  good: cls('    public $p;'),
});

rule({
  id: 'too-many-methods', ref: 'S1448', type: 'S', sev: 'MA', debt: 30, tags: ['brain-overload'], checker: 'SIZE',
  en: ['Classes should not have too many methods', 'A class with many methods tends to have too many responsibilities.', 'Split the class into smaller ones.'],
  ko: ['클래스의 메서드가 너무 많으면 안 됩니다', '메서드가 많은 클래스는 책임이 너무 많아지기 쉽습니다.', '클래스를 더 작은 클래스로 나눕니다.'],
  msg: ['Class "{0}" has {1} methods, which is greater than {2} authorized. Split it into smaller classes.', '클래스 "{0}"의 메서드는 {1}개로 허용치 {2}개보다 많습니다. 더 작은 클래스로 나눕니다.'],
  on: {
    ClassDecl(n, cx) {
      const max = cx.opt('max', 20);
      const c = H.methodsOf(n).length;
      if (c > max) cx.reportName(n, n.name || 'anonymous', c, max);
    },
  },
  bad: php('class Wide // Noncompliant\n{\n' + Array.from({ length: 21 }, (_, i) => `    public function m${i}()\n    {\n        return ${i};\n    }`).join('\n') + '\n}'),
  good: cls('    public function m()\n    {\n        return 1;\n    }'),
});

rule({
  id: 'too-many-fields', ref: 'S1820', type: 'S', sev: 'MA', debt: 30, tags: ['brain-overload'], checker: 'SIZE',
  en: ['Classes should not have too many fields', 'Many fields indicate a class that holds too much state.', 'Group related fields into separate classes.'],
  ko: ['클래스의 필드가 너무 많으면 안 됩니다', '필드가 많으면 클래스가 너무 많은 상태를 가진다는 뜻입니다.', '관련 필드를 별도 클래스로 묶습니다.'],
  msg: ['Refactor this class so it has no more than {0} fields, rather than the {1} it currently has.', '이 클래스의 필드가 현재 {1}개가 아닌 {0}개 이하가 되도록 고칩니다.'],
  on: {
    ClassDecl(n, cx) {
      const max = cx.opt('max', 20);
      const c = H.propsOf(n).reduce((a, p) => a + p.props.length, 0);
      if (c > max) cx.reportName(n, max, c);
    },
  },
  bad: php('class Fat // Noncompliant\n{\n' + Array.from({ length: 21 }, (_, i) => `    public $f${i};`).join('\n') + '\n}'),
  good: cls('    public $f;'),
});

rule({
  id: 'too-many-cases', ref: 'S1479', type: 'S', sev: 'MA', debt: 30, tags: ['brain-overload'], checker: 'SIZE',
  en: ['"switch" statements should not have too many "case" clauses', 'A huge switch is hard to read; a lookup table or polymorphism is usually clearer.', 'Replace the switch with an array lookup or separate classes.'],
  ko: ['switch 문에 case 절이 너무 많으면 안 됩니다', '거대한 switch는 읽기 어렵고 보통 조회 표나 다형성이 더 분명합니다.', 'switch를 배열 조회나 별도 클래스로 바꿉니다.'],
  msg: ['Reduce the number of switch cases from {0} to at most {1}.', 'switch case 수를 {0}개에서 {1}개 이하로 줄입니다.'],
  on: {
    Switch(n, cx) {
      const max = cx.opt('max', 30);
      if (n.cases.length > max) cx.report(n, n.cases.length, max);
    },
  },
  bad: fn('    switch ($a) { // Noncompliant\n' + Array.from({ length: 31 }, (_, i) => `        case ${i}:\n            return ${i};`).join('\n') + '\n    }'),
  good: fn('    switch ($a) {\n        case 1:\n            return 1;\n        case 2:\n            return 2;\n        default:\n            return 0;\n    }'),
});

rule({
  id: 'small-switch', ref: 'S1301', type: 'S', sev: 'MI', debt: 5, tags: ['bad-practice'], checker: 'S1301',
  en: ['"switch" statements should have at least 3 "case" clauses', 'A switch with one or two cases is more readable as an if statement.', 'Replace the switch with an if / else.'],
  ko: ['switch 문에는 case 절이 3개 이상 있어야 합니다', 'case가 한두 개인 switch는 if 문이 더 읽기 쉽습니다.', 'switch를 if / else로 바꿉니다.'],
  msg: ['Replace this "switch" statement with "if" statements to increase readability.', '가독성을 위해 이 switch 문을 if 문으로 바꿉니다.'],
  on: {
    Switch(n, cx) { if (n.cases.length > 0 && n.cases.length < 3) cx.report(n); },
  },
  bad: fn('    switch ($a) { // Noncompliant\n        case 1:\n            return 1;\n        default:\n            return 0;\n    }'),
  good: fn('    if ($a == 1) {\n        return 1;\n    }\n    return 0;'),
});

rule({
  id: 'duplicate-string', ref: 'S1192', type: 'S', sev: 'CR', debt: 2, tags: ['design'], checker: 'DUPLICATE_LITERAL',
  en: ['String literals should not be duplicated', 'Repeating the same literal makes changes error-prone.', 'Define a constant and use it everywhere.'],
  ko: ['문자열 리터럴을 중복하면 안 됩니다', '같은 리터럴을 반복하면 바꿀 때 실수하기 쉽습니다.', '상수를 정의해 모든 곳에서 씁니다.'],
  msg: ['Define a constant instead of duplicating this literal "{0}" {1} times.', '리터럴 "{0}"를 {1}번 반복하지 말고 상수를 정의합니다.'],
  file(pf, cx) {
    const min = cx.opt('threshold', 3);
    const groups = new Map();
    for (const l of pf.byKind.get('Lit') || []) {
      if (l.kind !== 'str' || l.value.length < 5 || !/\S/.test(l.value) || /^[\w-]+$/.test(l.value) && l.value.length < 5) continue;
      const p = l.parent;
      if (p && p.k === 'Item' && p.key === l) continue;
      if (p && (p.k === 'ConstItem' || p.k === 'Index' && p.idx === l)) continue;
      if (A.enclosing(l, ['Use', 'Declare'])) continue;
      if (!groups.has(l.value)) groups.set(l.value, []);
      groups.get(l.value).push(l);
    }
    for (const [v, list] of groups) if (list.length >= min) cx.report(list[0], v.length > 40 ? v.slice(0, 37) + '...' : v, list.length);
  },
  bad: fn('    echo \'Not found\'; // Noncompliant\n    log_msg(\'Not found\');\n    return \'Not found\';'),
  good: fn('    echo self::NOT_FOUND;\n    log_msg(\'Not found\');\n    return $a[\'Not found\'];'),
});

// ── empty code
function hasComment(pf, node) { return H.commentsIn(pf, node.pos, node.end).length > 0; }
rule({
  id: 'empty-function', ref: 'S1186', type: 'S', sev: 'CR', debt: 5, tags: ['suspicious'], checker: 'EMPTY_FUNCTION',
  en: ['Functions should not be empty', 'An empty function body is either unfinished work or needs an explanation.', 'Implement the function, throw an exception, or add a comment explaining why it is empty.'],
  ko: ['함수가 비어 있으면 안 됩니다', '빈 함수 본문은 미완성이거나 설명이 필요합니다.', '함수를 구현하거나 예외를 던지거나, 비어 있는 이유를 주석으로 남깁니다.'],
  msg: ['Add a nested comment explaining why this function is empty, or complete the implementation.', '이 함수가 비어 있는 이유를 주석으로 남기거나 구현을 완성합니다.'],
  on: {
    FuncDecl: emptyFn, Method: emptyFn,
  },
  bad: php('function todo_later() // Noncompliant\n{\n}'),
  good: php('function noop()\n{\n    // intentionally empty: used as a default callback\n}\nclass P\n{\n    public function __construct(private int $x)\n    {\n    }\n}'),
});
function emptyFn(n, cx) {
  if (!n.body || n.body.stmts.length || hasComment(cx.pf, n.body)) return;
  if (n.k === 'Method' && n.params.some((p) => p.mods && p.mods.size)) return;
  if (n.k === 'Method' && n.mods.has('private') && n.name.toLowerCase() === '__construct') return;
  cx.reportName(n);
}

rule({
  id: 'empty-block', ref: 'S108', type: 'S', sev: 'MA', debt: 5, tags: ['suspicious'], checker: 'EMPTY_BLOCK',
  en: ['Nested blocks of code should not be left empty', 'An empty block usually means missing code.', 'Add the missing code or remove the block.'],
  ko: ['중첩 블록을 비워 두면 안 됩니다', '빈 블록은 보통 코드가 빠졌다는 뜻입니다.', '빠진 코드를 넣거나 블록을 지웁니다.'],
  msg: ['Either remove or fill this block of code.', '이 코드 블록을 지우거나 채웁니다.'],
  on: {
    Block(n, cx) {
      if (n.stmts.length || n.alt || hasComment(cx.pf, n)) return;
      const p = n.parent;
      if (!p || ['FuncDecl', 'Method', 'Closure', 'Catch', 'Program', 'Namespace', 'Declare'].includes(p.k)) return;
      if (p.k === 'While' && A.hasSideEffects(p.cond)) return;
      cx.report(n);
    },
  },
  bad: fn('    if ($a) {} // Noncompliant\n    for ($i = 0; $i < 3; $i++) {} // Noncompliant'),
  good: fn('    if ($a) {\n        // nothing to do yet\n    }\n    while (next_item()) {\n    }'),
});

rule({
  id: 'empty-statement', ref: 'S1116', type: 'S', sev: 'MI', debt: 2, tags: ['unused'], checker: 'S1116',
  en: ['Empty statements should be removed', 'A stray semicolon is dead code and may hide a loop or if with no body.', 'Remove the extra semicolon.'],
  ko: ['빈 문장은 지워야 합니다', '불필요한 세미콜론은 죽은 코드이며 본문 없는 루프나 if를 숨길 수 있습니다.', '여분의 세미콜론을 지웁니다.'],
  msg: ['Remove this empty statement.', '이 빈 문장을 지웁니다.'],
  on: {
    Nop(n, cx) { if (!n.closeTag) cx.report(n); },
  },
  bad: fn('    echo $a;; // Noncompliant\n    return $b;'),
  good: fn('    echo $a;\n    return $b;'),
});

// ── simplifications
const isBoolLit = (e) => { e = A.unparen(e); return e && e.k === 'Lit' && e.kind === 'bool'; };
rule({
  id: 'redundant-boolean', ref: 'S1125', type: 'S', sev: 'MI', debt: 5, tags: ['clumsy'], checker: 'S1125',
  en: ['Boolean literals should not be redundant', 'Comparing with true/false or combining with a boolean literal adds noise.', 'Simplify the expression by removing the literal.'],
  ko: ['불리언 리터럴을 불필요하게 쓰면 안 됩니다', 'true/false와 비교하거나 불리언 리터럴과 결합하면 군더더기가 됩니다.', '리터럴을 지워 식을 단순하게 만듭니다.'],
  msg: ['Remove the unnecessary boolean literal.', '불필요한 불리언 리터럴을 지웁니다.'],
  on: {
    Bin(n, cx) {
      if (!['==', '!=', '&&', '||', 'and', 'or'].includes(n.op)) return;
      if (isBoolLit(n.l) || isBoolLit(n.r)) cx.report(n);
    },
    Unary(n, cx) { if (n.op === '!' && isBoolLit(n.e)) cx.report(n); },
    Ternary(n, cx) { if (n.t && isBoolLit(n.t) && isBoolLit(n.f)) cx.report(n); },
  },
  bad: fn('    if ($a == true) { // Noncompliant\n        echo 1;\n    }\n    return $b ? true : false; // Noncompliant'),
  good: fn('    if ($a) {\n        echo 1;\n    }\n    return (bool) $b || strpos($c, \'x\') === false;'),
});

function boolReturn(s) {
  const list = A.stmtsOf(s);
  if (list.length !== 1 || list[0].k !== 'Return' || !list[0].e) return null;
  const e = A.unparen(list[0].e);
  return e.k === 'Lit' && e.kind === 'bool' ? e.value : null;
}
rule({
  id: 'return-boolean-directly', ref: 'S1126', type: 'S', sev: 'MI', debt: 2, tags: ['clumsy'], checker: 'S1126',
  en: ['Return of boolean expressions should not be wrapped into an "if-then-else" statement', 'Returning true in one branch and false in the other is just returning the condition.', 'Return the condition directly (cast with (bool) if needed).'],
  ko: ['불리언 식의 반환을 if-then-else로 감싸면 안 됩니다', '한 분기에서 true, 다른 분기에서 false를 반환하는 것은 조건을 그대로 반환하는 것과 같습니다.', '조건을 바로 반환합니다(필요하면 (bool)로 변환).'],
  msg: ['Replace this if-then-else statement by a single return statement.', '이 if-then-else 문을 return 문 하나로 바꿉니다.'],
  on: {
    If(n, cx) {
      if (!isChainHead(n) || n.k !== 'If') return;
      const a = boolReturn(n.then);
      if (a === null) return;
      let b = null;
      if (n.else) { if (n.else.k !== 'If') b = boolReturn(n.else); }
      else {
        const p = n.parent;
        const list = p && (p.stmts || (p.k === 'Case' ? p.body : null));
        if (list) {
          const i = list.indexOf(n);
          if (i >= 0 && list[i + 1]) b = boolReturn(list[i + 1]);
        }
      }
      if (b !== null && a !== b) cx.report(n);
    },
  },
  bad: fn('    if ($a > 1) { // Noncompliant\n        return true;\n    } else {\n        return false;\n    }'),
  good: fn('    if ($a > 1) {\n        return true;\n    }\n    return $b;'),
});

rule({
  id: 'collapsible-if', ref: 'S1066', type: 'S', sev: 'MA', debt: 5, tags: ['clumsy'], checker: 'S1066',
  en: ['Mergeable "if" statements should be combined', 'An if whose only statement is another if without else can use a single combined condition.', 'Merge the two conditions with &&.'],
  ko: ['합칠 수 있는 if 문은 합쳐야 합니다', 'else 없는 if 하나만 담은 if는 조건 하나로 합칠 수 있습니다.', '두 조건을 &&로 합칩니다.'],
  msg: ['Merge this if statement with the enclosing one.', '이 if 문을 바깥 if 문과 합칩니다.'],
  on: {
    If(n, cx) {
      if (n.else || !isChainHead(n)) return;
      const inner = A.stmtsOf(n.then);
      if (inner.length !== 1 || inner[0].k !== 'If' || inner[0].else) return;
      cx.report(inner[0]);
    },
  },
  bad: fn('    if ($a) {\n        if ($b) { // Noncompliant\n            echo 1;\n        }\n    }'),
  good: fn('    if ($a && $b) {\n        echo 1;\n    }\n    if ($c) {\n        if ($b) {\n            echo 1;\n        }\n        echo 2;\n    }'),
});

rule({
  id: 'expression-complexity', ref: 'S1067', type: 'S', sev: 'CR', debt: 5, tags: ['brain-overload'], checker: 'COMPLEXITY',
  en: ['Expressions should not be too complex', 'Many && / || / ?: operators in one expression make it hard to read.', 'Extract parts of the expression into well-named variables or functions.'],
  ko: ['식이 너무 복잡하면 안 됩니다', '한 식에 && / || / ?: 연산자가 많으면 읽기 어렵습니다.', '식의 일부를 이름 있는 변수나 함수로 분리합니다.'],
  msg: ['Reduce the number of conditional operators ({0}) used in the expression (maximum allowed {1}).', '식에 쓴 조건 연산자 수({0})를 줄입니다(최대 {1}).'],
  on: {
    Bin: exprCx, Ternary: exprCx,
  },
  bad: fn('    return $a && $b || $c && $a || $b && $c; // Noncompliant'),
  good: fn('    $x = $a && $b;\n    $y = $c && $a;\n    return $x || $y || ($b && $c);'),
});
const COND_OPS = new Set(['&&', '||', 'and', 'or']);
const isCondOp = (x) => (x.k === 'Bin' && COND_OPS.has(x.op)) || x.k === 'Ternary';
function exprCx(n, cx) {
  if (!isCondOp(n)) return;
  let p = n.parent;
  while (p && p.k === 'Paren') p = p.parent;
  if (p && isCondOp(p)) return;
  let c = 0;
  const visit = (x) => {
    if (A.FUNC_KINDS.has(x.k)) return;
    if (isCondOp(x)) c++;
    A.forEachChild(x, visit);
  };
  visit(n);
  const max = cx.opt('max', 3);
  if (c > max) cx.report(n, c, max);
}

rule({
  id: 'immediately-returned-variable', ref: 'S1488', type: 'S', sev: 'MI', debt: 2, tags: ['clumsy'], checker: 'S1488',
  en: ['Local variables should not be declared and then immediately returned', 'Assigning a value to a variable only to return it on the next line adds noise.', 'Return the expression directly.'],
  ko: ['지역 변수를 선언하고 바로 반환하면 안 됩니다', '값을 변수에 대입하고 다음 줄에서 바로 반환하면 군더더기가 됩니다.', '식을 바로 반환합니다.'],
  msg: ['Immediately return this expression instead of assigning it to the temporary variable "${0}".', '임시 변수 "${0}"에 대입하지 말고 식을 바로 반환합니다.'],
  on: {
    Block(n, cx) {
      const s = n.stmts;
      for (let i = 1; i < s.length; i++) {
        const r = s[i];
        const a = s[i - 1];
        if (r.k !== 'Return' || !r.e || a.k !== 'ExprStmt') continue;
        const rv = A.unparen(r.e);
        const e = A.unparen(a.e);
        if (rv.k !== 'Var' || e.k !== 'Assign' || e.op !== '=' || e.l.k !== 'Var' || e.l.name !== rv.name) continue;
        const sym = rv.sym;
        if (!sym || sym.kind !== 'local' || sym.alias || sym.reads !== 1 || sym.writes !== 1) continue;
        if (/@var\b/.test(cx.src.slice(Math.max(0, a.pos - 200), a.pos).split(/[;{}]/).pop())) continue;
        cx.report(e.r, rv.name);
      }
    },
  },
  bad: fn('    $sum = $a + $b; // Noncompliant\n    return $sum;'),
  good: fn('    $sum = $a + $b;\n    log_msg($sum);\n    return $sum;'),
});

rule({
  id: 'nested-ternary', ref: 'S3358', type: 'S', sev: 'MA', debt: 5, tags: ['confusing'], checker: 'S3358',
  en: ['Ternary operators should not be nested', 'Nested ternaries are hard to read and, without parentheses, are an error in PHP 8.', 'Use if / else or match instead.'],
  ko: ['삼항 연산자를 중첩하면 안 됩니다', '중첩 삼항식은 읽기 어렵고 괄호가 없으면 PHP 8에서는 오류입니다.', 'if / else나 match를 씁니다.'],
  msg: ['Extract this nested ternary operation into an independent statement.', '이 중첩 삼항 연산을 별도 문장으로 분리합니다.'],
  on: {
    Ternary(n, cx) {
      let p = n.parent;
      while (p && p.k === 'Paren') p = p.parent;
      if (p && p.k === 'Ternary') cx.report(n);
    },
  },
  bad: fn('    return $a ? 1 : ($b ? 2 : 3); // Noncompliant'),
  good: fn('    return match (true) { $a => 1, $b => 2, default => 3 };'),
});

rule({
  id: 'redundant-parentheses', ref: 'S1110', type: 'S', sev: 'MA', debt: 1, tags: ['confusing'], checker: 'S1110',
  en: ['Redundant pairs of parentheses should be removed', 'Doubled parentheses add nothing and suggest a misunderstanding of precedence.', 'Remove the extra pair.'],
  ko: ['불필요한 괄호 쌍은 지워야 합니다', '겹친 괄호는 아무 의미가 없으며 우선순위를 잘못 이해했다는 신호입니다.', '여분의 괄호 쌍을 지웁니다.'],
  msg: ['Remove these useless parentheses.', '이 쓸모없는 괄호를 지웁니다.'],
  on: {
    Paren(n, cx) { if (n.e && n.e.k === 'Paren') cx.report(n); },
  },
  bad: fn('    return (($a + $b)); // Noncompliant'),
  good: fn('    return ($a + $b) * $c;'),
});

const INVERT = { '==': '!=', '!=': '==', '===': '!==', '!==': '===', '<': '>=', '>': '<=', '<=': '>', '>=': '<' };
rule({
  id: 'boolean-inversion', ref: 'S1940', type: 'S', sev: 'MI', debt: 2, tags: ['pitfall'], checker: 'S1940',
  en: ['Boolean checks should not be inverted', 'Negating a whole comparison is harder to read than using the opposite operator.', 'Use the opposite comparison operator.'],
  ko: ['불리언 검사를 뒤집어 쓰면 안 됩니다', '비교 전체를 부정하면 반대 연산자를 쓰는 것보다 읽기 어렵습니다.', '반대 비교 연산자를 씁니다.'],
  msg: ['Use the opposite operator ("{0}") instead.', '대신 반대 연산자("{0}")를 씁니다.'],
  on: {
    Unary(n, cx) {
      if (n.op !== '!' || !n.e || n.e.k !== 'Paren') return;
      const b = A.unparen(n.e);
      if (b.k === 'Bin' && INVERT[b.op]) cx.report(n, INVERT[b.op]);
    },
  },
  bad: fn('    if (!($a == 2)) { // Noncompliant\n        echo 1;\n    }'),
  good: fn('    if ($a != 2) {\n        echo 1;\n    }\n    return !($a && $b);'),
});

rule({
  id: 'assignment-in-subexpression', ref: 'S1121', type: 'S', sev: 'MA', debt: 5, tags: ['cwe-481', 'suspicious'], checker: 'S1121',
  en: ['Assignments should not be made from within sub-expressions', 'An assignment hidden inside a condition or argument is easy to miss and is often a mistyped comparison.', 'Move the assignment to its own statement.'],
  ko: ['하위 식 안에서 대입하면 안 됩니다', '조건이나 인수 안에 숨은 대입은 놓치기 쉽고 비교를 잘못 쓴 경우가 많습니다.', '대입을 별도 문장으로 옮깁니다.'],
  msg: ['Extract the assignment of "{0}" from this expression.', '이 식에서 "{0}"의 대입을 분리합니다.'],
  on: {
    Assign(n, cx) {
      let x = n;
      let p = n.parent;
      while (p && p.k === 'Paren') { x = p; p = p.parent; }
      if (!p) return;
      if (p.k === 'ExprStmt' || p.k === 'Assign' || p.k === 'ArrowFn' || p.k === 'Unary' && p.op === '@') return;
      if (p.k === 'For') return;
      for (let q = p; q; q = q.parent) {
        if ((q.k === 'While' || q.k === 'DoWhile') && A.contains(q.cond, (y) => y === n, true)) return;
        if (A.FUNC_KINDS.has(q.k) || q.k === 'Block') break;
      }
      if (p.k === 'Bin' && (p.op === 'or' || p.op === 'and' || p.op === '||' || p.op === '&&') && p.parent && p.parent.k === 'ExprStmt') return;
      void x;
      cx.report(n, cx.short(n.l));
    },
  },
  bad: fn('    if ($x = compute($a)) { // Noncompliant\n        echo $x;\n    }'),
  good: fn('    $x = compute($a);\n    if ($x) {\n        echo $x;\n    }\n    while ($line = fgets($b)) {\n        echo $line;\n    }\n    $c = $d = 0;'),
});

rule({
  id: 'for-as-while', ref: 'S1264', type: 'S', sev: 'MI', debt: 5, tags: ['clumsy'], checker: 'S1264',
  en: ['A "while" loop should be used instead of a "for" loop', 'A for loop with only a condition is a while loop in disguise.', 'Replace it with a while loop.'],
  ko: ['for 루프 대신 while 루프를 써야 합니다', '조건만 있는 for 루프는 사실상 while 루프입니다.', 'while 루프로 바꿉니다.'],
  msg: ['Replace this "for" loop with a "while" loop.', '이 for 루프를 while 루프로 바꿉니다.'],
  on: {
    For(n, cx) { if (!n.init.length && !n.step.length && n.cond.length) cx.report(n); },
  },
  bad: fn('    for (; $a < 10;) { // Noncompliant\n        $a = next_value($a);\n    }'),
  good: fn('    while ($a < 10) {\n        $a = next_value($a);\n    }\n    for ($i = 0; $i < 3; $i++) {\n        echo $i;\n    }'),
});

rule({
  id: 'elseif-without-else', ref: 'S126', type: 'S', sev: 'CR', debt: 5, tags: ['cert'], checker: 'S126',
  en: ['"if ... elseif" constructs should end with "else" clauses', 'A final else documents that all remaining cases were considered.', 'Add a final else clause, even if it only throws or logs.'],
  ko: ['if ... elseif 구조는 else 절로 끝나야 합니다', '마지막 else는 나머지 경우를 모두 고려했다는 것을 보여 줍니다.', '예외를 던지거나 기록만 하더라도 마지막 else 절을 추가합니다.'],
  msg: ['Add the missing "else" clause.', '빠진 else 절을 추가합니다.'],
  on: {
    If(n, cx) {
      if (!isChainHead(n)) return;
      let last = n;
      let count = 0;
      while (last.else && last.else.k === 'If') { last = last.else; count++; }
      if (count && !last.else) cx.report(last);
    },
  },
  bad: fn('    if ($a == 1) {\n        echo 1;\n    } elseif ($a == 2) { // Noncompliant\n        echo 2;\n    }'),
  good: fn('    if ($a == 1) {\n        echo 1;\n    } elseif ($a == 2) {\n        echo 2;\n    } else {\n        echo 0;\n    }'),
});

rule({
  id: 'loop-counter-modified', ref: 'S127', type: 'S', sev: 'MA', debt: 5, tags: ['pitfall'], checker: 'S127',
  en: ['"for" loop stop conditions should be invariant', 'Changing the loop counter inside the body makes the number of iterations hard to predict.', 'Use a while loop, or do not change the counter in the body.'],
  ko: ['for 루프 종료 조건은 변하지 않아야 합니다', '본문에서 루프 카운터를 바꾸면 반복 횟수를 예측하기 어렵습니다.', 'while 루프를 쓰거나 본문에서 카운터를 바꾸지 않습니다.'],
  msg: ['Do not update the loop counter "${0}" within the loop body.', '루프 본문에서 루프 카운터 "${0}"를 바꾸지 않습니다.'],
  on: {
    For(n, cx) {
      const counters = new Set();
      for (const e of n.step) {
        A.walk(e, (x) => {
          if (x.k === 'Incr' && A.unparen(x.e).k === 'Var') counters.add(A.unparen(x.e).name);
          if (x.k === 'Assign' && x.l.k === 'Var') counters.add(x.l.name);
        });
      }
      if (!counters.size) return;
      A.walk(n.body, (x) => {
        if (x.k === 'Incr' && A.unparen(x.e).k === 'Var' && counters.has(A.unparen(x.e).name)) cx.report(x, A.unparen(x.e).name);
        if (x.k === 'Assign' && x.l.k === 'Var' && counters.has(x.l.name)) cx.report(x, x.l.name);
      });
    },
  },
  bad: fn('    for ($i = 0; $i < 10; $i++) {\n        $i = $i + 2; // Noncompliant\n    }'),
  good: fn('    for ($i = 0; $i < 10; $i++) {\n        $j = $i + 2;\n        echo $j;\n    }'),
});

// ── exceptions
rule({
  id: 'useless-catch', ref: 'S2737', type: 'S', sev: 'MI', debt: 5, tags: ['clumsy', 'error-handling'], checker: 'S2737',
  en: ['"catch" clauses should do more than rethrow', 'A catch that only rethrows the same exception adds nothing.', 'Remove the try/catch, or handle the exception.'],
  ko: ['catch 절은 다시 던지는 것 이상을 해야 합니다', '같은 예외를 다시 던지기만 하는 catch는 아무 의미가 없습니다.', 'try/catch를 지우거나 예외를 처리합니다.'],
  msg: ['Add logic to this catch clause or eliminate it and rethrow the exception automatically.', '이 catch 절에 처리를 넣거나 catch를 지워 예외가 자동으로 전달되게 합니다.'],
  on: {
    Try(n, cx) {
      if (n.fin || !n.catches.length) return;
      const rethrowOnly = (c) => {
        const s = c.body.stmts;
        if (s.length !== 1 || s[0].k !== 'ExprStmt' || !c.v) return false;
        const t = A.unparen(s[0].e);
        return t.k === 'Throw' && A.unparen(t.e).k === 'Var' && A.unparen(t.e).name === c.v.name;
      };
      if (n.catches.every(rethrowOnly)) for (const c of n.catches) cx.report(c);
    },
  },
  bad: fn('    try {\n        foo();\n    } catch (RuntimeException $e) { // Noncompliant\n        throw $e;\n    }'),
  good: fn('    try {\n        foo();\n    } catch (RuntimeException $e) {\n        log_error($e);\n        throw $e;\n    }'),
});

const GENERIC_EX = new Set(['exception', 'errorexception', 'runtimeexception']);
rule({
  id: 'generic-exception', ref: 'S112', type: 'S', sev: 'MA', debt: 20, tags: ['cwe-397', 'error-handling'], checker: 'S112',
  en: ['Generic exceptions ErrorException, RuntimeException and Exception should not be thrown', 'Throwing a generic exception forces callers to catch everything to handle a specific failure.', 'Throw a dedicated, specific exception class.'],
  ko: ['일반 예외 ErrorException, RuntimeException, Exception을 던지면 안 됩니다', '일반 예외를 던지면 호출자는 특정 실패를 처리하려고 모든 예외를 잡아야 합니다.', '전용의 구체적인 예외 클래스를 던집니다.'],
  msg: ['Define and throw a dedicated exception instead of using a generic one.', '일반 예외 대신 전용 예외를 정의해 던집니다.'],
  on: {
    Throw(n, cx) {
      const e = A.unparen(n.e);
      if (e.k === 'New' && e.cls && e.cls.k === 'Name' && GENERIC_EX.has(A.shortName(e.cls.name).toLowerCase())) cx.report(e);
    },
  },
  bad: fn('    throw new Exception(\'failed\'); // Noncompliant'),
  good: fn('    throw new InvalidArgumentException(\'failed\');'),
});

rule({
  id: 'functions-nested-too-deeply', ref: 'S2004', type: 'S', sev: 'CR', debt: 10, tags: ['brain-overload'], checker: 'COMPLEXITY',
  en: ['Functions should not be nested too deeply', 'Closures nested in closures quickly become unreadable.', 'Extract inner functions into named functions or methods.'],
  ko: ['함수를 너무 깊게 중첩하면 안 됩니다', '클로저 안의 클로저는 금방 읽기 어려워집니다.', '안쪽 함수를 이름 있는 함수나 메서드로 분리합니다.'],
  msg: ['Refactor this code to not nest functions more than {0} levels deep.', '함수가 {0}단계를 넘게 중첩되지 않도록 고칩니다.'],
  on: {
    Closure: deepFn, ArrowFn: deepFn, FuncDecl: deepFn,
  },
  bad: php('$f = function () {\n    return function () {\n        return function () {\n            return function () { // Noncompliant\n                return 1;\n            };\n        };\n    };\n};'),
  good: php('$f = function () {\n    return function () {\n        return 1;\n    };\n};'),
});
function deepFn(n, cx) {
  const max = cx.opt('max', 3);
  let depth = 1;
  for (let p = n.parent; p; p = p.parent) if (A.FUNC_KINDS.has(p.k)) depth++;
  if (depth === max + 1) cx.report(n, max);
}

rule({
  id: 'useless-override', ref: 'S1185', type: 'S', sev: 'MI', debt: 5, tags: ['redundant'], checker: 'S1185',
  en: ['Overriding methods should do more than simply call the same method in the parent class', 'A method that only forwards to parent:: with the same arguments is redundant.', 'Remove the method.'],
  ko: ['재정의 메서드는 부모의 같은 메서드를 호출하는 것 이상을 해야 합니다', '같은 인수로 parent::에 넘기기만 하는 메서드는 불필요합니다.', '메서드를 지웁니다.'],
  msg: ['Remove this method "{0}" to simply inherit it.', '메서드 "{0}"를 지워 그냥 상속받습니다.'],
  on: {
    Method(n, cx) {
      if (!n.body || n.body.stmts.length !== 1 || n.attrs) return;
      const s = n.body.stmts[0];
      const e = A.unparen(s.k === 'Return' ? s.e : s.k === 'ExprStmt' ? s.e : null);
      if (!e || e.k !== 'SCall' || !e.cls || e.cls.k !== 'Name' || e.cls.name.toLowerCase() !== 'parent') return;
      if (typeof e.name !== 'string' || e.name.toLowerCase() !== n.name.toLowerCase()) return;
      if (e.args.length !== n.params.length) return;
      if (!e.args.every((a, i) => { const v = A.unparen(a.e); return !a.name && v.k === 'Var' && v.name === n.params[i].name && !!a.spread === !!n.params[i].variadic; })) return;
      cx.reportName(n, n.name);
    },
  },
  bad: php('class Child extends Base\n{\n    public function save($x) // Noncompliant\n    {\n        return parent::save($x);\n    }\n}'),
  good: php('class Child extends Base\n{\n    public function save($x)\n    {\n        return parent::save(trim($x));\n    }\n}'),
});

rule({
  id: 'inconsistent-return', ref: 'S3801', type: 'S', sev: 'MA', debt: 10, tags: ['design'], checker: 'MISSING_RETURN',
  en: ['Functions should use "return" consistently', 'Mixing "return value;" and bare "return;" makes callers guess what null means.', 'Return a value on every path, or never.'],
  ko: ['함수는 return을 일관되게 써야 합니다', '"return 값;"과 값 없는 "return;"을 섞으면 호출자가 null의 의미를 추측해야 합니다.', '모든 경로에서 값을 반환하거나 아예 반환하지 않습니다.'],
  msg: ['Refactor this function to use "return" consistently.', 'return을 일관되게 쓰도록 이 함수를 고칩니다.'],
  on: {
    FuncDecl: consistentReturn, Method: consistentReturn, Closure: consistentReturn,
  },
  bad: php('function find($a) // Noncompliant\n{\n    if ($a) {\n        return 1;\n    }\n    return;\n}'),
  good: php('function find($a)\n{\n    if ($a) {\n        return 1;\n    }\n    return null;\n}'),
});
function consistentReturn(n, cx) {
  if (!n.body) return;
  let withValue = false;
  let bare = false;
  A.walk(n.body, (x) => { if (x.k === 'Return') { if (x.e) withValue = true; else bare = true; } });
  if (withValue && bare) cx.reportName(n);
}

rule({
  id: 'identical-methods', ref: 'S4144', type: 'S', sev: 'MA', debt: 15, tags: ['confusing', 'duplicate'], checker: 'COPY_PASTE_ERROR',
  en: ['Methods should not have identical implementations', 'Two methods with the same body are duplicated code or a copy-paste error.', 'Make one method call the other, or fix the copy.'],
  ko: ['메서드의 구현이 같으면 안 됩니다', '본문이 같은 두 메서드는 중복 코드이거나 복사-붙여넣기 오류입니다.', '한 메서드가 다른 메서드를 호출하게 하거나 복사본을 고칩니다.'],
  msg: ['Update this method so that its implementation is not identical to "{0}" on line {1}.', '이 메서드가 {1}행의 "{0}"와 구현이 같지 않도록 고칩니다.'],
  on: {
    ClassDecl(n, cx) {
      const ms = H.methodsOf(n).filter((m) => m.body && m.body.stmts.length >= 2);
      for (let i = 1; i < ms.length; i++) {
        for (let j = 0; j < i; j++) {
          if (A.same(ms[i].params, ms[j].params) && A.same(ms[i].body, ms[j].body)) { cx.reportName(ms[i], ms[j].name, ms[j].nameLine); break; }
        }
      }
    },
  },
  bad: cls('    public function a($x)\n    {\n        $y = $x * 2;\n        return $y + 1;\n    }\n    public function b($x) // Noncompliant\n    {\n        $y = $x * 2;\n        return $y + 1;\n    }'),
  good: cls('    public function a($x)\n    {\n        $y = $x * 2;\n        return $y + 1;\n    }\n    public function b($x)\n    {\n        return $this->a($x);\n    }'),
});

rule({
  id: 'switch-without-default', ref: 'S131', type: 'S', sev: 'CR', debt: 5, tags: ['cwe-478'], checker: 'MISSING_DEFAULT',
  en: ['"switch" statements should have "default" clauses', 'A default clause makes the handling of unexpected values explicit.', 'Add a default clause, even if it only throws.'],
  ko: ['switch 문에는 default 절이 있어야 합니다', 'default 절은 예상하지 못한 값의 처리를 분명하게 합니다.', '예외만 던지더라도 default 절을 추가합니다.'],
  msg: ['Add a "default" clause to this "switch" statement.', '이 switch 문에 default 절을 추가합니다.'],
  on: {
    Switch(n, cx) { if (!n.cases.some((c) => !c.test)) cx.report(n); },
  },
  bad: fn('    switch ($a) { // Noncompliant\n        case 1:\n            return 1;\n        case 2:\n            return 2;\n        case 3:\n            return 3;\n    }'),
  good: fn('    switch ($a) {\n        case 1:\n            return 1;\n        case 2:\n            return 2;\n        default:\n            return 0;\n    }'),
});

// ── risky constructs
rule({
  id: 'global-variables', ref: 'S2011', type: 'S', sev: 'MA', debt: 20, tags: ['design'], checker: 'S2011',
  en: ['Global variables should not be used', 'Functions that read and write globals are coupled to hidden state and hard to test.', 'Pass the value as a parameter or inject a service.'],
  ko: ['전역 변수를 쓰면 안 됩니다', '전역 변수를 읽고 쓰는 함수는 숨은 상태에 묶여 시험하기 어렵습니다.', '값을 매개변수로 넘기거나 서비스를 주입합니다.'],
  msg: ['Do not use global variables.', '전역 변수를 쓰지 않습니다.'],
  on: {
    Global(n, cx) { cx.report(n); },
    Var(n, cx) { if (n.name === 'GLOBALS') cx.report(n); },
  },
  bad: php('function counter()\n{\n    global $count; // Noncompliant\n    return $GLOBALS[\'total\'] + $count; // Noncompliant\n}'),
  good: php('function counter($count, $total)\n{\n    return $total + $count;\n}'),
});

rule({
  id: 'sleep-call', ref: 'S2964', type: 'S', sev: 'MA', debt: 5, tags: ['bad-practice'], checker: 'S2964',
  en: ['"sleep" should not be called', 'Sleeping blocks a web worker and hides timing problems instead of fixing them.', 'Use a proper scheduling or retry mechanism.'],
  ko: ['sleep을 호출하면 안 됩니다', 'sleep은 웹 작업자를 막고 타이밍 문제를 고치지 않고 감춥니다.', '알맞은 예약이나 재시도 방식을 씁니다.'],
  msg: ['Remove this call to "{0}".', '"{0}" 호출을 지웁니다.'],
  on: {
    Call(n, cx) { if (H.isCall(n, ['sleep', 'usleep', 'time_nanosleep', 'time_sleep_until'])) cx.report(n, A.callName(n)); },
  },
  bad: fn('    sleep(5); // Noncompliant\n    return $a;'),
  good: fn('    $queue->later(5, $a);\n    return $a;'),
});

rule({
  id: 'variable-variables', ref: 'S1599', type: 'S', sev: 'MA', debt: 5, tags: ['confusing'], checker: 'S1599',
  en: ['Variable variables should not be used', 'Variable names built at run time ($$name) are hard to follow and defeat static analysis.', 'Use an array with explicit keys instead.'],
  ko: ['가변 변수를 쓰면 안 됩니다', '실행 중에 만드는 변수 이름($$name)은 따라가기 어렵고 정적 분석을 무력하게 합니다.', '명시적 키를 가진 배열을 씁니다.'],
  msg: ['Remove the use of this variable variable.', '이 가변 변수 사용을 지웁니다.'],
  on: {
    VarVar(n, cx) { if (!(n.parent && n.parent.k === 'VarVar')) cx.report(n); },
  },
  bad: fn('    $name = \'total\';\n    return $$name; // Noncompliant'),
  good: fn('    $values = [\'total\' => 1];\n    return $values[\'total\'];'),
});

rule({
  id: 'php4-constructor', ref: 'S1603', type: 'S', sev: 'MA', debt: 5, tags: ['obsolete'], checker: 'S1603',
  en: ['PHP 4 constructor declarations should not be used', 'A method named like its class is no longer a constructor in PHP 8 and was deprecated before.', 'Rename the method to __construct.'],
  ko: ['PHP 4 방식 생성자 선언을 쓰면 안 됩니다', '클래스 이름과 같은 메서드는 PHP 8에서 더 이상 생성자가 아니며 그 전에도 폐기 예정이었습니다.', '메서드 이름을 __construct로 바꿉니다.'],
  msg: ['Replace this function name "{0}" with "__construct".', '함수 이름 "{0}"를 "__construct"로 바꿉니다.'],
  on: {
    ClassDecl(n, cx) {
      if (!n.name || n.kind !== 'class') return;
      const ms = H.methodsOf(n);
      if (ms.some((m) => m.name.toLowerCase() === '__construct')) return;
      const m = ms.find((x) => x.name.toLowerCase() === n.name.toLowerCase());
      if (m) cx.reportName(m, m.name);
    },
  },
  bad: php('class Car\n{\n    public function Car() // Noncompliant\n    {\n        echo 1;\n    }\n}'),
  good: php('class Car\n{\n    public function __construct()\n    {\n        echo 1;\n    }\n}'),
});

rule({
  id: 'exit-die', ref: 'S1799', type: 'S', sev: 'MA', debt: 5, tags: ['pitfall'], checker: 'S1799',
  en: ['"exit(...)" and "die(...)" statements should not be used', 'Stopping the script inside a function bypasses callers, destructors and frameworks.', 'Throw an exception or return an error value instead.'],
  ko: ['exit(...)와 die(...) 문을 쓰면 안 됩니다', '함수 안에서 스크립트를 멈추면 호출자, 소멸자, 프레임워크를 건너뜁니다.', '대신 예외를 던지거나 오류 값을 반환합니다.'],
  msg: ['Remove this "{0}()" call or ensure it is really required.', '이 "{0}()" 호출을 지우거나 정말 필요한지 확인합니다.'],
  on: {
    Exit(n, cx) {
      if (A.enclosing(n, A.FUNC_KINDS)) cx.report(n, n.kind);
    },
  },
  bad: fn('    if (!$a) {\n        die(\'no input\'); // Noncompliant\n    }\n    return $a;'),
  good: php('if (!$argv) {\n    exit(1);\n}\nfunction f($a)\n{\n    if (!$a) {\n        throw new InvalidArgumentException(\'no input\');\n    }\n    return $a;\n}'),
});

rule({
  id: 'non-strict-search', ref: '', type: 'S', sev: 'MA', debt: 2, tags: ['pitfall'], checker: 'BAD_COMPARE',
  en: ['in_array() and array_search() should be called in strict mode', 'Without the strict flag the needle is compared loosely, so "abc", 0 and null can match unexpected elements.', 'Pass true as the third argument.'],
  ko: ['in_array()와 array_search()는 엄격 모드로 호출해야 합니다', '엄격 플래그가 없으면 느슨하게 비교되어 "abc", 0, null이 뜻밖의 요소와 일치할 수 있습니다.', '세 번째 인수로 true를 넘깁니다.'],
  msg: ['Pass "true" as the third argument of "{0}".', '"{0}"의 세 번째 인수로 true를 넘깁니다.'],
  on: {
    Call(n, cx) {
      if (!H.isCall(n, ['in_array', 'array_search']) || n.args.length !== 2) return;
      const needle = A.unparen(H.arg(n, 0));
      const hay = A.unparen(H.arg(n, 1));
      if ((needle && needle.k === 'Lit') || (hay && hay.k === 'Arr')) cx.report(n, A.callName(n));
    },
  },
  bad: fn('    return in_array(\'0\', $a); // Noncompliant'),
  good: fn('    return in_array(\'0\', $a, true) || in_array($b, $c);'),
});

rule({
  id: 'loose-comparison', ref: '', type: 'S', sev: 'MI', debt: 2, tags: ['pitfall'], checker: 'BAD_COMPARE',
  en: ['Strict comparison should be used with null, 0 and empty strings', 'With == these values match many others through type juggling ("" == null, "abc" == 0 before PHP 8).', 'Use === or !==.'],
  ko: ['null, 0, 빈 문자열과는 엄격 비교를 써야 합니다', '==를 쓰면 형 변환 때문에 이 값들이 많은 다른 값과 같아집니다("" == null, PHP 8 이전의 "abc" == 0).', '=== 또는 !==를 씁니다.'],
  msg: ['Use "{0}" to compare with {1}.', '{1}와 비교할 때 "{0}"를 씁니다.'],
  on: {
    Bin(n, cx) {
      if (!['==', '!=', '<>'].includes(n.op)) return;
      const tricky = (e) => { e = A.unparen(e); return e.k === 'Lit' && (e.kind === 'null' || (e.kind === 'int' && e.value === 0) || (e.kind === 'str' && (e.value === '' || e.value === '0'))); };
      const lit = tricky(n.l) ? n.l : tricky(n.r) ? n.r : null;
      if (lit) cx.report(n, n.op === '==' ? '===' : '!==', cx.text(lit));
    },
  },
  bad: fn('    if ($a == null) { // Noncompliant\n        return 0;\n    }\n    return $b != \'\'; // Noncompliant'),
  good: fn('    if ($a === null) {\n        return 0;\n    }\n    return $b !== \'\' && $c == 1;'),
});

module.exports = { cognitive, cyclomatic };

void nameAt; void fnDisplay; void LOOPS;
