'use strict';

// Code smells: complexity, size, unused code, naming, simplifications,
// exception handling style, API usage.

const { rule, jm, jc, km, kc } = require('./core');
const A = require('../ast');
const H = require('./h');
const T = require('../types');
const flow = require('../flow');

const nameLoc = (m) => ({ line: m.nameLine || m.line, col: m.nameCol || 1 });
const isTestMethod = (m) => A.hasAnno(m, ['Test', 'ParameterizedTest', 'RepeatedTest', 'TestFactory', 'TestTemplate', 'Before', 'After', 'BeforeEach', 'AfterEach', 'BeforeAll', 'AfterAll', 'BeforeClass', 'AfterClass']);

// ── complexity / size ──
function cognitive(method) {
  let total = 0;
  const logical = (e) => {
    // count sequences of like && / || operators
    const ops = [];
    const flat = (x) => {
      x = A.strip(x);
      if (x && x.k === 'Bin' && (x.op === '&&' || x.op === '||')) { flat(x.l); ops.push(x.op); flat(x.r); }
    };
    flat(e);
    let n = 0;
    for (let i = 0; i < ops.length; i++) if (i === 0 || ops[i] !== ops[i - 1]) n++;
    return n;
  };
  const visit = (x, nest) => {
    if (!x || typeof x !== 'object') return;
    switch (x.k) {
      case 'Class': case 'LocalClass': case 'LocalFun': return;
      case 'If': case 'IfX': {
        total += 1 + nest;
        visitCond(x.c, nest);
        visit(x.t, nest + 1);
        let f = x.f;
        while (f && (f.k === 'If' || f.k === 'IfX' || (f.k === 'ExprStmt' && A.strip(f.e).k === 'IfX'))) {
          if (f.k === 'ExprStmt') f = A.strip(f.e);
          total += 1;
          visitCond(f.c, nest);
          visit(f.t, nest + 1);
          f = f.f;
        }
        if (f) { total += 1; visit(f, nest + 1); }
        return;
      }
      case 'While': case 'Do': case 'For': case 'ForEach':
        total += 1 + nest;
        if (x.c) visitCond(x.c, nest);
        if (x.iter) visit(x.iter, nest);
        visit(x.body, nest + 1);
        return;
      case 'Switch':
        total += 1 + nest;
        visit(x.sel, nest);
        for (const c of x.cases) { for (const l of c.labels) visit(l, nest + 1); for (const s of c.body) visit(s, nest + 1); }
        return;
      case 'Try':
        for (const r of x.res) visit(r, nest);
        visit(x.body, nest);
        for (const c of x.catches) { total += 1 + nest; visit(c.body, nest + 1); }
        visit(x.fin, nest);
        return;
      case 'TryX': visit(x.t, nest); return;
      case 'Cond':
        total += 1 + nest;
        visitCond(x.c, nest);
        visit(x.a, nest + 1);
        visit(x.b, nest + 1);
        return;
      case 'Lambda': visit(x.body, nest + 1); return;
      case 'New': for (const a of x.args) visit(a, nest); if (x.body) for (const m of x.body.members) if (m.body) visit(m.body, nest + 1); return;
      case 'Break': case 'Continue': if (x.label) total += 1; return;
      case 'Bin':
        if (x.op === '&&' || x.op === '||') { visitCond(x, nest); return; }
        break;
      default: break;
    }
    A.eachChild(x, (c) => visit(c, nest));
  };
  const visitCond = (c, nest) => {
    total += logical(c);
    const walkOps = (e) => {
      e = A.strip(e);
      if (e && e.k === 'Bin' && (e.op === '&&' || e.op === '||')) { walkOps(e.l); walkOps(e.r); } else visit(e, nest);
    };
    walkOps(c);
  };
  visit(method.body, 0);
  return total;
}

rule({
  id: 'cognitive-complexity', langs: ['java', 'kt'], type: 'S', sev: 'CR', debt: 10, tags: ['brain-overload'], ref: 'S3776', ktRef: 'S3776',
  en: ['Cognitive Complexity of methods should not be too high', 'Deeply nested and branching code is hard to read, test and change.', 'Extract parts into well-named methods and flatten the nesting.'],
  ko: ['메서드의 인지 복잡도가 너무 높으면 안 됩니다', '깊게 중첩되고 갈래가 많은 코드는 읽기·테스트·수정이 어렵습니다.', '일부를 이름 있는 메서드로 빼고 중첩을 줄이세요.'],
  msg: ['Refactor this method to reduce its Cognitive Complexity from {0} to the 15 allowed.', '이 메서드의 인지 복잡도를 {0}에서 허용치 15 이하로 줄이세요.'],
  on: {
    Method(n, cx) {
      if (!n.body) return;
      const c = cognitive(n);
      if (c > 15) cx.report(nameLoc(n), [c]);
    },
  },
  bad: { java: jc(`  int f(int a, int b, int c) { // Noncompliant
    int r = 0;
    for (int i = 0; i < a; i++) {
      if (i % 2 == 0) {
        for (int j = 0; j < b; j++) {
          if (j > c && i > c || j == i) { r++; } else if (j < 0) { r--; } else { r += 2; }
          while (r > 100) { if (r % 3 == 0) { r /= 3; } else { r--; } }
        }
      }
    }
    return r;
  }`), kt: kc(`  fun f(a: Int, b: Int, c: Int): Int { // Noncompliant
    var r = 0
    for (i in 0 until a) {
      if (i % 2 == 0) {
        for (j in 0 until b) {
          if (j > c && i > c || j == i) { r++ } else if (j < 0) { r-- } else { r += 2 }
          while (r > 100) { if (r % 3 == 0) { r /= 3 } else { r-- } }
        }
      }
    }
    return r
  }`) },
  good: { java: jc(`  int f(int a, int b) {
    int r = 0;
    for (int i = 0; i < a; i++) { if (i > b) { r++; } }
    return r;
  }`), kt: kc(`  fun f(a: Int, b: Int): Int {
    var r = 0
    for (i in 0 until a) { if (i > b) r++ }
    return r
  }`) },
});

rule({
  id: 'too-many-parameters', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 20, tags: ['brain-overload'], ref: 'S107', ktRef: 'S107',
  en: ['Methods should not have too many parameters', 'A long parameter list is hard to call correctly and usually means the method does too much.', 'Group related parameters into an object or split the method.'],
  ko: ['메서드의 매개변수가 너무 많으면 안 됩니다', '매개변수 목록이 길면 올바르게 호출하기 어렵고 대개 메서드가 너무 많은 일을 합니다.', '관련 매개변수를 객체로 묶거나 메서드를 나누세요.'],
  msg: ['This method has {0} parameters, which is greater than the 7 authorized.', '이 메서드의 매개변수는 {0}개로 허용치 7개보다 많습니다.'],
  on: {
    Method(n, cx) {
      if (n.params.length <= 7 || H.isOverride(n) || A.hasAnno(n, ['Inject', 'Autowired', 'JsonCreator', 'Composable'])) return;
      cx.report(nameLoc(n), [n.params.length]);
    },
  },
  bad: { java: jc(`  void f(int a, int b, int c, int d, int e, int f, int g, int h) { } // Noncompliant`), kt: kc(`  fun f(a: Int, b: Int, c: Int, d: Int, e: Int, f: Int, g: Int, h: Int) {} // Noncompliant`) },
  good: { java: jc(`  void f(int a, int b, int c) { }`), kt: kc(`  fun f(a: Int, b: Int, c: Int) {}`) },
});

function lines(n) { return (n.el || n.line) - n.line + 1; }

rule({
  id: 'method-too-long', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 20, tags: ['brain-overload'], ref: 'S138', ktRef: 'S138',
  en: ['Methods should not have too many lines', 'Very long methods are hard to understand and usually do several things.', 'Split the method into smaller ones.'],
  ko: ['메서드가 너무 길면 안 됩니다', '아주 긴 메서드는 이해하기 어렵고 대개 여러 일을 합니다.', '메서드를 작게 나누세요.'],
  msg: ['This method has {0} lines, which is greater than the {1} lines authorized. Split it into smaller methods.', '이 메서드는 {0}줄로 허용치 {1}줄보다 깁니다. 작은 메서드로 나누세요.'],
  on: {
    Method(n, cx) {
      if (!n.body) return;
      const max = cx.kt ? 100 : 75;
      const len = lines(n.body);
      if (len > max) cx.report(nameLoc(n), [len, max]);
    },
  },
  bad: { java: jc(`  void f() { // Noncompliant\n${'    System.out.println(1);\n'.repeat(80)}  }`), kt: kc(`  fun f() { // Noncompliant\n${'    println(1)\n'.repeat(105)}  }`) },
  good: { java: jc(`  void f() {\n${'    System.out.println(1);\n'.repeat(10)}  }`), kt: kc(`  fun f() {\n${'    println(1)\n'.repeat(10)}  }`) },
});

rule({
  id: 'too-many-methods', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 60, tags: ['brain-overload'], ref: 'S1448', ktRef: 'S1448',
  en: ['Classes should not have too many methods', 'A class with dozens of methods usually has more than one responsibility.', 'Split the class by responsibility.'],
  ko: ['클래스의 메서드가 너무 많으면 안 됩니다', '메서드가 수십 개인 클래스는 대개 책임이 둘 이상입니다.', '책임별로 클래스를 나누세요.'],
  msg: ['Class "{0}" has {1} methods, which is greater than the 35 authorized.', '"{0}" 클래스의 메서드는 {1}개로 허용치 35개보다 많습니다.'],
  on: {
    Class(n, cx) {
      if (n.anon) return;
      const c = H.classMethods(n).length;
      if (c > 35) cx.report({ line: n.nameLine || n.line, col: n.col }, [n.name, c]);
    },
  },
  bad: { java: `class Big { // Noncompliant\n${Array.from({ length: 36 }, (_, i) => `  void m${i}() { }`).join('\n')}\n}\n`, kt: `class Big { // Noncompliant\n${Array.from({ length: 36 }, (_, i) => `  fun m${i}() {}`).join('\n')}\n}\n` },
  good: { java: `class Small {\n  void a() { }\n}\n`, kt: `class Small {\n  fun a() {}\n}\n` },
});

rule({
  id: 'file-too-long', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 60, tags: ['brain-overload'], ref: 'S104', ktRef: 'S104',
  en: ['Files should not have too many lines of code', 'Very large source files are hard to navigate and usually hold several responsibilities.', 'Split the file into smaller units.'],
  ko: ['파일의 코드 줄이 너무 많으면 안 됩니다', '아주 큰 소스 파일은 탐색하기 어렵고 대개 여러 책임을 담습니다.', '파일을 작은 단위로 나누세요.'],
  msg: ['This file has {0} lines, which is greater than 1000 authorized. Split it into smaller files.', '이 파일은 {0}줄로 허용치 1000줄보다 깁니다. 작은 파일로 나누세요.'],
  on: {
    Unit(n, cx) {
      let count = 0;
      for (const l of cx.src.split('\n')) if (l.trim() && !/^\s*(\/\/|\*|\/\*)/.test(l)) count++;
      if (count > 1000) cx.report(1, [count]);
    },
  },
  bad: { java: `class Big { // Noncompliant\n${'  int f;\n'.repeat(1001)}}\n`, kt: `class Big { // Noncompliant\n${'  val f = 1\n'.repeat(1001)}}\n` },
  good: { java: 'class Small { }\n', kt: 'class Small\n' },
});

rule({
  id: 'nesting-too-deep', langs: ['java', 'kt'], type: 'S', sev: 'CR', debt: 10, tags: ['brain-overload'], ref: 'S134', ktRef: 'S134',
  en: ['Control flow statements should not be nested too deeply', 'More than three levels of if/for/while/switch/try nesting make code hard to follow.', 'Extract inner blocks into methods or return early.'],
  ko: ['제어문을 너무 깊게 중첩하면 안 됩니다', 'if/for/while/switch/try를 3단계보다 깊게 중첩하면 따라가기 어렵습니다.', '안쪽 블록을 메서드로 빼거나 일찍 반환하세요.'],
  msg: ['Refactor this code to not nest more than 3 control flow statements.', '제어문이 3단계보다 깊게 중첩되지 않도록 코드를 고치세요.'],
  on: {
    Method(n, cx) {
      if (!n.body) return;
      const visit = (x, depth) => {
        if (!x || typeof x !== 'object') return;
        if (x.k === 'Class' || x.k === 'LocalClass' || x.k === 'Lambda' || x.k === 'LocalFun' || (x.k === 'New' && x.body)) return;
        const ctl = x.k === 'If' || x.k === 'While' || x.k === 'Do' || x.k === 'For' || x.k === 'ForEach' || x.k === 'Switch' || x.k === 'Try';
        if (ctl) {
          if (depth >= 3) { cx.report(x); return; }
          if (x.k === 'If') {
            visit(x.c, depth);
            visit(x.t, depth + 1);
            let f = x.f;
            while (f && f.k === 'If') { visit(f.t, depth + 1); f = f.f; }
            if (f) visit(f, depth + 1);
            return;
          }
          A.eachChild(x, (c) => visit(c, depth + 1));
          return;
        }
        A.eachChild(x, (c) => visit(c, depth));
      };
      visit(n.body, 0);
    },
  },
  bad: { java: jm(`    if (n > 0) {
      for (String x : list) {
        while (n > 1) {
          if (x.isEmpty()) { n--; } // Noncompliant
          n--;
        }
      }
    }`), kt: km(`    if (n > 0) {
        for (x in list) {
            while (n > 1) {
                if (x.isEmpty()) println(x) // Noncompliant
            }
        }
    }`) },
  good: { java: jm(`    if (n > 0) {
      for (String x : list) {
        if (x.isEmpty()) { n--; } else if (n > 2) { n++; }
      }
    }`), kt: km(`    if (n > 0) {
        for (x in list) {
            if (x.isEmpty()) println(x)
        }
    }`) },
});

rule({
  id: 'too-many-returns', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 20, tags: ['brain-overload'], ref: 'S1142', ktRef: 'S1142',
  en: ['Methods should not have too many return statements', 'Many exit points make the control flow of a method hard to follow.', 'Reduce the number of returns, e.g. by computing a result variable.'],
  ko: ['메서드에 return 문이 너무 많으면 안 됩니다', '나가는 지점이 많으면 메서드의 흐름을 따라가기 어렵습니다.', '결과 변수를 계산하는 식으로 return 수를 줄이세요.'],
  msg: ['This method has {0} returns, which is more than the 3 allowed.', '이 메서드의 return은 {0}개로 허용치 3개보다 많습니다.'],
  on: {
    Method(n, cx) {
      if (!n.body || n.exprBody) return;
      let c = 0;
      H.noNested(n.body, (x) => { if (x.k === 'Return' && !x.label) c++; });
      if (c > 3) cx.report(nameLoc(n), [c]);
    },
  },
  bad: { java: jc(`  int f(int x) { // Noncompliant
    if (x == 1) { return 10; }
    if (x == 2) { return 20; }
    if (x == 3) { return 30; }
    return 0;
  }`), kt: kc(`  fun f(x: Int): Int { // Noncompliant
    if (x == 1) return 10
    if (x == 2) return 20
    if (x == 3) return 30
    return 0
  }`) },
  good: { java: jc(`  int f(int x) {
    if (x == 1) { return 10; }
    return 0;
  }`), kt: kc(`  fun f(x: Int): Int {
    if (x == 1) return 10
    return 0
  }`) },
});

rule({
  id: 'too-many-break-continue', type: 'S', sev: 'MI', debt: 20, tags: ['brain-overload'], ref: 'S135',
  en: ['Loops should not contain more than a single "break" or "continue" statement', 'Several jumps out of one loop make its termination hard to reason about.', 'Restructure the loop condition or extract a method.'],
  ko: ['루프에 break나 continue가 둘 이상 있으면 안 됩니다', '한 루프에서 여러 번 빠져나가면 종료 조건을 판단하기 어렵습니다.', '루프 조건을 고치거나 메서드로 빼세요.'],
  msg: ['Reduce the total number of "break" and "continue" statements in this loop to use at most one.', '이 루프의 break와 continue를 합쳐 하나 이하로 줄이세요.'],
  on: {
    ['For'](n, cx) { loopJumps(n, cx); },
    ForEach(n, cx) { loopJumps(n, cx); },
    While(n, cx) { loopJumps(n, cx); },
    Do(n, cx) { loopJumps(n, cx); },
  },
  bad: { java: jm(`    for (String x : list) { // Noncompliant
      if (x.isEmpty()) { continue; }
      if (x.equals("end")) { break; }
      n++;
    }`) },
  good: { java: jm(`    for (String x : list) {
      if (x.equals("end")) { break; }
      n++;
    }`) },
});
function loopJumps(n, cx) {
  let c = 0;
  const visit = (x, inner) => {
    if (!x || typeof x !== 'object') return;
    if (x.k === 'Lambda' || x.k === 'Class' || (x.k === 'New' && x.body)) return;
    if ((x.k === 'Break' || x.k === 'Continue') && !inner && !x.label) { c++; return; }
    const loop = x.k === 'While' || x.k === 'Do' || x.k === 'For' || x.k === 'ForEach' || (x.k === 'Switch');
    A.eachChild(x, (ch) => visit(ch, inner || (loop && !(x.k === 'Switch' && false))));
  };
  visit(n.body, false);
  if (c > 1) cx.report(n);
}

// ── unused code ──
function collectIdents(unit) {
  const ids = new Set();
  A.forEach(unit, (x) => {
    if (x.k === 'Name') ids.add(x.id);
    else if (x.k === 'Sel' || x.k === 'Call' || x.k === 'MRef') { if (x.id) ids.add(x.id); }
    else if (x.k === 'Type') { for (const p of String(x.name).split('.')) ids.add(p); }
    else if (x.k === 'Anno') { for (const p of String(x.name).split('.')) ids.add(p); }
    else if (x.k === 'Tmpl') { for (const p of x.parts) if (p && typeof p === 'object') A.forEach(p, (y) => { if (y.k === 'Name') ids.add(y.id); if ((y.k === 'Sel' || y.k === 'Call') && y.id) ids.add(y.id); }); }
    return x.k !== 'Import';
  }, { withTypes: true });
  return ids;
}

const KT_OPERATOR_NAMES = new Set(['getValue', 'setValue', 'provideDelegate', 'invoke', 'plus', 'minus', 'times', 'div', 'rem', 'contains',
  'get', 'set', 'compareTo', 'iterator', 'next', 'hasNext', 'unaryMinus', 'unaryPlus', 'not', 'inc', 'dec', 'plusAssign', 'minusAssign',
  'timesAssign', 'divAssign', 'remAssign', 'rangeTo', 'rangeUntil', 'equals', 'component1', 'component2', 'component3', 'component4', 'component5']);

rule({
  id: 'unused-import', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 2, tags: ['unused'], ref: 'S1128', ktRef: 'S1128',
  en: ['Unnecessary imports should be removed', 'Unused, duplicate or redundant imports clutter the file and hide real dependencies.', 'Remove the import.'],
  ko: ['불필요한 임포트는 지워야 합니다', '쓰지 않거나 중복·불필요한 임포트는 파일을 어지럽히고 실제 의존성을 숨깁니다.', '임포트를 지우세요.'],
  msg: ['Remove this {0} import \'{1}\'.', '{0} 임포트 \'{1}\'을(를) 지우세요.'],
  on: {
    Unit(n, cx) {
      if (!n.imports.length) return;
      const ids = collectIdents(n);
      const docRefs = new Set();
      for (const c of n.comments) {
        const re = /[{@](?:link|linkplain|see|throws|exception|value)\s+#?([A-Za-z_$][\w$.]*)/g;
        let m;
        while ((m = re.exec(c.text))) for (const p of m[1].split(/[.#]/)) docRefs.add(p);
        const re2 = /@(?:see|throws|exception)\s+([A-Za-z_$][\w$.]*)/g;
        while ((m = re2.exec(c.text))) for (const p of m[1].split('.')) docRefs.add(p);
      }
      const seen = new Set();
      for (const imp of n.imports) {
        if (imp.star) continue;
        const simple = imp.alias || A.simpleName(imp.name);
        const key = (imp.static ? 's:' : '') + imp.name + (imp.alias ? ' as ' + imp.alias : '');
        if (seen.has(key)) { cx.report(imp, ['duplicated', imp.name]); continue; }
        seen.add(key);
        if (!cx.kt && !imp.static) {
          const pkg = imp.name.slice(0, imp.name.lastIndexOf('.'));
          if (pkg === 'java.lang' || (n.pkg && pkg === n.pkg)) { cx.report(imp, ['redundant', imp.name]); continue; }
        }
        if (ids.has(simple) || docRefs.has(simple)) continue;
        if (cx.kt && KT_OPERATOR_NAMES.has(simple)) continue;
        cx.report(imp, ['unused', imp.name]);
      }
    },
  },
  bad: { java: `import java.util.List;
import java.util.Map; // Noncompliant
import java.lang.String; // Noncompliant
class T { List<String> names; }
`, kt: `import java.io.File
import java.util.UUID // Noncompliant
class T { val f = File("a") }
` },
  good: { java: `import java.util.List;
import java.util.Map;
/** Uses {@link java.util.Set} and {@link Map}. */
class T { List<String> names; }
`, kt: `import java.io.File
import androidx.compose.runtime.getValue
import kotlin.properties.Delegates.notNull as nn
class T { val f = File("a"); var x: Int by nn() }
` },
});

rule({
  id: 'unused-private-field', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 5, tags: ['unused'], ref: 'S1068', ktRef: 'S1068',
  en: ['Unused "private" fields should be removed', 'A private field that is never read is dead code or a sign of a bug.', 'Remove the field, or use it.'],
  ko: ['쓰지 않는 private 필드는 지워야 합니다', '읽히지 않는 private 필드는 죽은 코드이거나 버그의 신호입니다.', '필드를 지우거나 사용하세요.'],
  msg: ['Remove this unused "{0}" private field.', '쓰지 않는 private 필드 "{0}"을(를) 지우세요.'],
  on: {
    Class(n, cx) {
      if (n.anon || A.hasAnno(n, ['Data', 'Getter', 'Setter', 'Value', 'Entity', 'Embeddable', 'Serializable', 'Parcelize', 'Builder', 'AllArgsConstructor', 'Document', 'Table'])) return;
      const outer = topClass(cx, n);
      if (outer !== n) return; // inner classes are checked with their top-level class
      const candidates = [];
      const collect = (c) => {
        for (const m of c.members) {
          if (m.k === 'Field' && H.isPrivate(m) && !m.annos.length && !m.delegate && !m.getter && !m.setter) {
            for (const v of m.vars) if (v.name !== 'serialVersionUID' && v.name !== 'Companion' && !/^_/.test(v.name)) candidates.push(v);
          }
          if (m.k === 'Class') collect(m);
        }
        for (const p of c.params || []) if (p.prop && H.isPrivate(p) && !p.annos.length) candidates.push(p);
      };
      collect(n);
      if (!candidates.length) return;
      const reads = new Set();
      A.forEach(n, (x) => {
        if (x.k === 'Name') reads.add(x.id);
        if (x.k === 'Sel' || x.k === 'MRef') reads.add(x.id);
        if (x.k === 'Tmpl') for (const p of x.parts) if (p && typeof p === 'object') A.forEach(p, (y) => { if (y.k === 'Name') reads.add(y.id); if (y.k === 'Sel') reads.add(y.id); });
        return true;
      });
      for (const v of candidates) if (!reads.has(v.name)) cx.report(v.nameLine ? { line: v.nameLine, col: v.nameCol } : v, [v.name]);
    },
  },
  bad: { java: jc(`  private int count; // Noncompliant
  private int used = 1;
  int get() { return used; }`), kt: kc(`  private val cache = mutableMapOf<String, Int>() // Noncompliant
  private val used = 1
  fun get() = used`) },
  good: { java: jc(`  private static final long serialVersionUID = 1L;
  private int used = 1;
  int get() { return used; }`), kt: kc(`  private val used = 1
  fun get() = used`) },
});
function topClass(cx, n) {
  for (let i = 0; i < cx.stack.length; i++) if (cx.stack[i].k === 'Class') return cx.stack[i];
  return n;
}

rule({
  id: 'unused-private-method', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 5, tags: ['unused'], ref: 'S1144', ktRef: 'S1144',
  en: ['Unused "private" methods should be removed', 'A private method that is never called is dead code.', 'Remove it, or call it where intended.'],
  ko: ['쓰지 않는 private 메서드는 지워야 합니다', '호출되지 않는 private 메서드는 죽은 코드입니다.', '지우거나 의도한 곳에서 호출하세요.'],
  msg: ['Remove this unused private "{0}" method.', '쓰지 않는 private 메서드 "{0}"을(를) 지우세요.'],
  on: {
    Unit(n, cx) {
      const used = new Set();
      A.forEach(n, (x) => {
        if (x.k === 'Call' || x.k === 'MRef') used.add(x.id);
        if (x.k === 'Name') used.add(x.id);
        if (x.k === 'Lit' && x.t === 'str') used.add(x.v);
        return true;
      });
      const visitCls = (c) => {
        for (const m of c.members) {
          if (m.k === 'Class') { visitCls(m); continue; }
          if (m.k !== 'Method' || !H.isPrivate(m) || m.ctor || m.accessor || m.annos.length) continue;
          if (/^(writeObject|readObject|readObjectNoData|readResolve|writeReplace)$/.test(m.name)) continue;
          if (m.mods.has('operator') || m.mods.has('override')) continue;
          if (!used.has(m.name)) cx.report(nameLoc(m), [m.name]);
        }
      };
      for (const t of n.types) visitCls(t);
      for (const f of n.funcs) if (H.isPrivate(f) && !f.annos.length && !f.mods.has('operator') && !used.has(f.name)) cx.report(nameLoc(f), [f.name]);
    },
  },
  bad: { java: jc(`  private void helper() { } // Noncompliant
  void run() { }`), kt: kc(`  private fun helper() {} // Noncompliant
  fun run() {}`) },
  good: { java: jc(`  private void helper() { }
  void run() { helper(); }`), kt: kc(`  private fun helper() {}
  fun run() = helper()`) },
});

rule({
  id: 'unused-local-variable', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 5, tags: ['unused'], ref: 'S1481', ktRef: 'S1481',
  en: ['Unused local variables should be removed', 'A local variable that is never read is dead code or a forgotten use.', 'Remove the variable (keep the call if it has side effects).'],
  ko: ['쓰지 않는 지역 변수는 지워야 합니다', '읽히지 않는 지역 변수는 죽은 코드이거나 사용을 잊은 것입니다.', '변수를 지우세요(부수 효과가 있는 호출은 남기세요).'],
  msg: ['Remove this unused "{0}" local variable.', '쓰지 않는 지역 변수 "{0}"을(를) 지우세요.'],
  on: {
    Method(n, cx) {
      if (!n.body) return;
      checkLocals(n, cx);
    },
  },
  bad: { java: jm(`    int unusedCount = list.size(); // Noncompliant
    System.out.println(s);`), kt: km(`    val extra = list.size // Noncompliant
    println(s)`) },
  good: { java: jm(`    int count = list.size();
    System.out.println(count);
    try (java.io.Closeable ignored = () -> {}) { n++; }`), kt: km(`    val count = list.size
    println(count)
    val (a, _) = Pair(1, 2)
    println(a)`) },
});
function checkLocals(m, cx) {
  const twr = new Set();
  A.forEach(m.body, (x) => {
    if (x.k === 'Try') for (const r of x.res) if (r.k === 'Local') for (const v of r.vars) twr.add(v);
    return !(x.k === 'Class' || x.k === 'LocalClass');
  });
  A.forEach(m.body, (x) => {
    if (x.k === 'Class' || x.k === 'LocalClass') return false;
    if (x.k === 'LocalFun') return false;
    if (x.k !== 'Local' || x.destructure) return true;
    for (const v of x.vars) {
      if (twr.has(v) || v.synthetic) continue;
      if (/^(_+|ignored|ignore|unused|expected|dummy)$/i.test(v.name)) continue;
      if (!flow.usedAsRead(m, v.name)) cx.report(v, [v.name]);
    }
    return true;
  });
}

rule({
  id: 'unused-parameter', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 5, tags: ['unused'], ref: 'S1172', ktRef: 'S1172',
  en: ['Unused method parameters should be removed', 'A parameter that the (non-overridable) method never reads misleads callers.', 'Remove the parameter, or use it.'],
  ko: ['쓰지 않는 메서드 매개변수는 지워야 합니다', '(재정의할 수 없는) 메서드가 읽지 않는 매개변수는 호출자를 오도합니다.', '매개변수를 지우거나 사용하세요.'],
  msg: ['Remove this unused method parameter "{0}".', '쓰지 않는 메서드 매개변수 "{0}"을(를) 지우세요.'],
  on: {
    Method(n, cx) {
      if (!n.body || !H.isPrivate(n) || n.annos.length || n.ctor) return;
      if (/^(writeObject|readObject|readObjectNoData)$/.test(n.name)) return;
      const throwsOnly = n.body.stmts.length === 1 && (n.body.stmts[0].k === 'Throw' || (n.body.stmts[0].k === 'Return' && n.exprBody && A.strip(n.body.stmts[0].e).k === 'Throw'));
      if (!n.body.stmts.length || throwsOnly) return;
      // passed as a method reference: signature is imposed
      for (const p of n.params) {
        if (p.annos.length || /^(_+|ignored|unused)$/.test(p.name)) continue;
        if (!flow.usedAsRead(n, p.name)) cx.report(p.nameLine ? { line: p.nameLine, col: p.nameCol } : p, [p.name]);
      }
    },
  },
  bad: { java: jc(`  private int twice(int a, int b) { // Noncompliant
    return a * 2;
  }
  int use() { return twice(1, 2); }`), kt: kc(`  private fun twice(a: Int, b: Int): Int { // Noncompliant
    return a * 2
  }
  fun use() = twice(1, 2)`) },
  good: { java: jc(`  private int twice(int a) {
    return a * 2;
  }
  int use() { return twice(1); }`), kt: kc(`  private fun twice(a: Int): Int {
    return a * 2
  }
  fun use() = twice(1)`) },
});

rule({
  id: 'empty-block', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S108', ktRef: 'S108',
  en: ['Nested blocks of code should not be left empty', 'An empty block does nothing; it is either unfinished or hides an ignored condition or exception.', 'Add the missing code, or a comment explaining why nothing is done.'],
  ko: ['중첩 블록을 비워 두면 안 됩니다', '빈 블록은 아무 일도 하지 않으며 미완성이거나 무시한 조건·예외를 숨깁니다.', '빠진 코드를 넣거나 아무것도 하지 않는 이유를 주석으로 남기세요.'],
  msg: ['Either remove or fill this block of code.', '이 코드 블록을 지우거나 채우세요.'],
  on: {
    Block(n, cx) {
      if (n.stmts.length) return;
      const p = cx.parent();
      if (!p) return;
      if (p.k === 'Method' || p.k === 'Lambda' || p.k === 'LocalFun' || p.k === 'Init' && false) return;
      if (p.k === 'Catch' && /^(ignored|ignore|expected|_)$/i.test(p.name || '')) return;
      if (p.k === 'Case' || p.k === 'Switch') return;
      if (cx.unit.comments.some((c) => c.pos > n.s && c.pos < n.en)) return;
      if (p.k === 'While' || p.k === 'Do' || p.k === 'For' || p.k === 'ForEach') {
        // busy-wait loops with side effects in the header are a separate concern
        if (p.c && A.find(p.c, (x) => x.k === 'Call' || x.k === 'Assign' || x.k === 'Un' && (x.op === '++' || x.op === '--'))) return;
      }
      cx.report(n);
    },
  },
  bad: { java: jm(`    try { n = s.length(); }
    catch (RuntimeException e) { } // Noncompliant`), kt: km(`    if (n > 0) { } // Noncompliant`) },
  good: { java: jm(`    try { n = s.length(); }
    catch (RuntimeException ignored) { }
    if (n > 0) {
      // nothing to do: already counted
    }`), kt: km(`    if (n > 0) {
        // intentionally empty
    }`) },
});

// ── naming ──
function namingRule(id, langs, ref, what, re, enDesc, koDesc, kinds) {
  rule({
    id, langs, type: 'S', sev: 'MI', debt: 2, tags: ['convention'], ref, ktRef: ref,
    en: [`${enDesc[0]} should comply with a naming convention`, `Consistent ${enDesc[1]} names make the code easier to read.`, `Rename it to match ${re}.`],
    ko: [`${koDesc} 이름은 명명 규칙을 따라야 합니다`, `일관된 ${koDesc} 이름은 코드를 읽기 쉽게 합니다.`, `${re} 형식에 맞게 이름을 바꾸세요.`],
    msg: [`Rename this ${what} "{0}" to match the regular expression '${re}'.`, `${koDesc} "{0}"의 이름을 정규식 '${re}'에 맞게 바꾸세요.`],
    on: kinds,
    bad: kinds.__bad, good: kinds.__good,
  });
}

{
  const re = '^[a-z][a-zA-Z0-9]*$';
  const kinds = {
    Method(n, cx) {
      if (n.ctor || H.isOverride(n) || isTestMethod(n) || n.accessor || n.lang === 'kt') return;
      if (!new RegExp(re).test(n.name)) cx.report(nameLoc(n), [n.name]);
    },
  };
  rule({
    id: 'method-naming', type: 'S', sev: 'MI', debt: 5, tags: ['convention'], ref: 'S100',
    en: ['Method names should comply with a naming convention', 'Consistent method names (camelCase) make code easier to read.', `Rename the method to match ${re}.`],
    ko: ['메서드 이름은 명명 규칙을 따라야 합니다', '일관된 메서드 이름(camelCase)은 코드를 읽기 쉽게 합니다.', `${re} 형식에 맞게 메서드 이름을 바꾸세요.`],
    msg: [`Rename this method name "{0}" to match the regular expression '${re}'.`, `메서드 이름 "{0}"을(를) 정규식 '${re}'에 맞게 바꾸세요.`],
    on: kinds,
    bad: { java: jc(`  void Do_Work() { } // Noncompliant`) },
    good: { java: jc(`  void doWork() { }
  @org.junit.jupiter.api.Test void should_work() { }`) },
  });
}

rule({
  id: 'field-naming', type: 'S', sev: 'MI', debt: 2, tags: ['convention'], ref: 'S116',
  en: ['Field names should comply with a naming convention', 'Consistent field names (camelCase) make code easier to read.', 'Rename the field to match ^[a-z][a-zA-Z0-9]*$.'],
  ko: ['필드 이름은 명명 규칙을 따라야 합니다', '일관된 필드 이름(camelCase)은 코드를 읽기 쉽게 합니다.', '^[a-z][a-zA-Z0-9]*$ 형식에 맞게 필드 이름을 바꾸세요.'],
  msg: ["Rename this field \"{0}\" to match the regular expression '^[a-z][a-zA-Z0-9]*$'.", "필드 \"{0}\"의 이름을 정규식 '^[a-z][a-zA-Z0-9]*$'에 맞게 바꾸세요."],
  on: {
    Field(n, cx) {
      if (n.lang === 'kt' || H.isStatic(n) || !cx.cls || cx.cls.kind === 'interface') return;
      for (const v of n.vars) if (!/^[a-z][a-zA-Z0-9]*$/.test(v.name) && v.name !== 'serialVersionUID') cx.report(v, [v.name]);
    },
  },
  bad: { java: jc(`  private int my_count; // Noncompliant`) },
  good: { java: jc(`  private int myCount;
  private static final int MAX_COUNT = 3;`) },
});

rule({
  id: 'static-mutable-field-naming', type: 'S', sev: 'MI', debt: 2, tags: ['convention'], ref: 'S3008',
  en: ['Static non-final field names should comply with a naming convention', 'Static mutable fields are variables, not constants, and should look like variables.', 'Rename it to match ^[a-z][a-zA-Z0-9]*$.'],
  ko: ['static이면서 final이 아닌 필드 이름은 명명 규칙을 따라야 합니다', 'static 가변 필드는 상수가 아니라 변수이므로 변수처럼 보여야 합니다.', '^[a-z][a-zA-Z0-9]*$ 형식에 맞게 이름을 바꾸세요.'],
  msg: ["Rename this field \"{0}\" to match the regular expression '^[a-z][a-zA-Z0-9]*$'.", "필드 \"{0}\"의 이름을 정규식 '^[a-z][a-zA-Z0-9]*$'에 맞게 바꾸세요."],
  on: {
    Field(n, cx) {
      if (n.lang === 'kt' || !H.isStatic(n) || n.fin) return;
      for (const v of n.vars) if (!/^[a-z][a-zA-Z0-9]*$/.test(v.name)) cx.report(v, [v.name]);
    },
  },
  bad: { java: jc(`  private static int INSTANCE_COUNT; // Noncompliant`) },
  good: { java: jc(`  private static int instanceCount;`) },
});

rule({
  id: 'local-variable-naming', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 2, tags: ['convention'], ref: 'S117', ktRef: 'S117',
  en: ['Local variable and method parameter names should comply with a naming convention', 'Consistent camelCase names for locals and parameters make code easier to read.', 'Rename it to match ^[a-z][a-zA-Z0-9]*$.'],
  ko: ['지역 변수와 매개변수 이름은 명명 규칙을 따라야 합니다', '지역 변수와 매개변수를 일관되게 camelCase로 지으면 코드를 읽기 쉽습니다.', '^[a-z][a-zA-Z0-9]*$ 형식에 맞게 이름을 바꾸세요.'],
  msg: ["Rename this local variable \"{0}\" to match the regular expression '^[a-z][a-zA-Z0-9]*$'.", "지역 변수 \"{0}\"의 이름을 정규식 '^[a-z][a-zA-Z0-9]*$'에 맞게 바꾸세요."],
  on: {
    Local(n, cx) {
      if (n.fin && !cx.kt) return;
      if (cx.kt && n.mods && n.mods.has('const')) return;
      for (const v of n.vars) if (!/^[a-z][a-zA-Z0-9]*$/.test(v.name) && !/^_+$/.test(v.name)) cx.report(v, [v.name]);
    },
    Param(n, cx) {
      const p = cx.parent();
      if (!p || p.k !== 'Method' || H.isOverride(p)) return;
      if (n.name && !/^[a-z][a-zA-Z0-9]*$/.test(n.name) && !/^_+$/.test(n.name) && n.name !== 'this') cx.report(n.nameLine ? { line: n.nameLine, col: n.nameCol } : n, [n.name]);
    },
  },
  bad: { java: jm(`    int Total_Count = n; // Noncompliant
    System.out.println(Total_Count);`), kt: km(`    val Total_Count = n // Noncompliant
    println(Total_Count)`) },
  good: { java: jm(`    int totalCount = n;
    System.out.println(totalCount);`), kt: km(`    val totalCount = n
    println(totalCount)`) },
});

rule({
  id: 'type-parameter-naming', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 10, tags: ['convention'], ref: 'S119', ktRef: 'S119',
  en: ['Type parameter names should comply with a naming convention', 'Single upper-case letters (optionally a digit) make type parameters stand out from types.', 'Rename it to match ^[A-Z][0-9]?$.'],
  ko: ['타입 매개변수 이름은 명명 규칙을 따라야 합니다', '대문자 한 글자(숫자 하나 허용)로 지으면 타입 매개변수가 일반 타입과 구별됩니다.', '^[A-Z][0-9]?$ 형식에 맞게 이름을 바꾸세요.'],
  msg: ["Rename this generic name \"{0}\" to match the regular expression '^[A-Z][0-9]?$'.", "제네릭 이름 \"{0}\"을(를) 정규식 '^[A-Z][0-9]?$'에 맞게 바꾸세요."],
  on: {
    Class(n, cx) { for (const p of n.tparams || []) if (!/^[A-Z][0-9]?$/.test(p.name)) cx.report(p.line, [p.name]); },
    Method(n, cx) { for (const p of n.tparams || []) if (!/^[A-Z][0-9]?$/.test(p.name)) cx.report(p.line, [p.name]); },
  },
  bad: { java: jc(`  <Element> Element first(java.util.List<Element> xs) { // Noncompliant
    return xs.get(0);
  }`), kt: kc(`  fun <Element> first(xs: List<Element>): Element { // Noncompliant
    return xs[0]
  }`) },
  good: { java: jc(`  <E> E first(java.util.List<E> xs) {
    return xs.get(0);
  }`), kt: kc(`  fun <E> first(xs: List<E>): E {
    return xs[0]
  }`) },
});

rule({
  id: 'package-naming', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 10, tags: ['convention'], ref: 'S120', ktRef: 'S120',
  en: ['Package names should comply with a naming convention', 'Lower-case package names avoid clashes with class names and case-insensitive file systems.', 'Rename the package to match ^[a-z_]+(\\.[a-z_][a-z0-9_]*)*$.'],
  ko: ['패키지 이름은 명명 규칙을 따라야 합니다', '소문자 패키지 이름은 클래스 이름이나 대소문자를 구분하지 않는 파일 시스템과의 충돌을 막습니다.', '^[a-z_]+(\\.[a-z_][a-z0-9_]*)*$ 형식에 맞게 패키지 이름을 바꾸세요.'],
  msg: ["Rename this package name \"{0}\" to match the regular expression '^[a-z_]+(\\.[a-z_][a-z0-9_]*)*$'.", "패키지 이름 \"{0}\"을(를) 정규식 '^[a-z_]+(\\.[a-z_][a-z0-9_]*)*$'에 맞게 바꾸세요."],
  on: { Unit(n, cx) { if (n.pkg && !/^[a-z_]+(\.[a-z_][a-z0-9_]*)*$/.test(n.pkg)) cx.report(n.pkgLine, [n.pkg]); } },
  bad: { java: 'package com.Example.App; // Noncompliant\nclass T { }\n', kt: 'package com.Example.App // Noncompliant\nclass T\n' },
  good: { java: 'package com.example.app;\nclass T { }\n', kt: 'package com.example.app\nclass T\n' },
});

// ── magic numbers / literals ──
rule({
  id: 'magic-number', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 5, tags: ['brain-overload'], ref: 'S109', ktRef: 'S109',
  en: ['Magic numbers should not be used', 'An unexplained number hides its meaning and is easy to change inconsistently.', 'Replace it with a named constant.'],
  ko: ['매직 넘버를 쓰면 안 됩니다', '설명 없는 숫자는 의미를 숨기고 일관되지 않게 바뀌기 쉽습니다.', '이름 있는 상수로 바꾸세요.'],
  msg: ['Assign this magic number {0} to a well-named constant, and use the constant instead.', '매직 넘버 {0}을(를) 이름 있는 상수에 담아 그 상수를 쓰세요.'],
  on: {
    Lit(n, cx) {
      if (!(n.t === 'int' || n.t === 'long' || n.t === 'double' || n.t === 'float')) return;
      if ([0, 1, -1, 2].includes(n.v) || cx.isTestClass()) return;
      if (/^0[xXbB]/.test(n.raw.replace(/^-/, ''))) return;
      const m = cx.method;
      if (!m || m.name === 'hashCode' || m.ctor && false) return;
      for (let i = cx.stack.length - 2; i >= 0; i--) {
        const x = cx.stack[i];
        if (x.k === 'Anno' || x.k === 'EnumConst' || x.k === 'Case' || x.k === 'Field' || x.k === 'IsPat' || x.k === 'InPat') return;
        if (x.k === 'Local' && (x.fin || (x.mods && x.mods.has('const')))) return;
        if (x.k === 'Method' || x.k === 'Class') break;
      }
      const p = cx.parent();
      if (p && p.k === 'New' && p.array) return;
      if (p && p.k === 'Call' && /^(of|ofSeconds|ofMillis|ofMinutes|ofHours|ofDays|plusDays|minusDays|withDayOfMonth|sleep|delay|setTimeout|ofPattern|valueOf|get|set|substring|charAt)$/.test(p.id || '')) return;
      cx.report(n, [n.raw]);
    },
  },
  bad: { java: jm(`    if (s.length() > 42) { n++; } // Noncompliant`), kt: km(`    if (s.length > 42) println(s) // Noncompliant`) },
  good: { java: `class T {
  private static final int LIMIT = 42;
  void m(String s, int n) { if (s.length() > LIMIT) { n++; } }
}
`, kt: `class T {
  companion object { const val LIMIT = 42 }
  fun m(s: String) { if (s.length > LIMIT) println(s) }
}
` },
});

rule({
  id: 'duplicated-string-literal', langs: ['java', 'kt'], type: 'S', sev: 'CR', debt: 2, tags: ['design'], ref: 'S1192', ktRef: 'S1192',
  en: ['String literals should not be duplicated', 'The same literal repeated in many places is easy to update inconsistently.', 'Extract the literal into a constant.'],
  ko: ['문자열 리터럴을 중복하면 안 됩니다', '같은 리터럴이 여러 곳에 반복되면 일관되지 않게 바뀌기 쉽습니다.', '리터럴을 상수로 빼세요.'],
  msg: ['Define a constant instead of duplicating this literal "{0}" {1} times.', '리터럴 "{0}"을(를) {1}번 반복하지 말고 상수를 정의하세요.'],
  on: {
    Unit(n, cx) {
      const occ = new Map();
      const visit = (x, skip) => {
        if (!x || typeof x !== 'object') return;
        if (x.k === 'Anno') return;
        if (x.k === 'Field' && x.fin && (H.isStatic(x) || x.mods.has('const'))) return;
        if (x.k === 'Lit' && x.t === 'str' && !skip) {
          const v = x.v;
          if (v.length >= 3 && /[A-Za-z]/.test(v) && !/^\s*$/.test(v) && v.length + 2 >= 5) {
            if (!occ.has(v)) occ.set(v, []);
            occ.get(v).push(x);
          }
          return;
        }
        A.eachChild(x, (c) => visit(c, skip));
      };
      visit(n, false);
      for (const [v, list] of occ) {
        if (list.length >= 3) cx.report(list[0], [v.length > 30 ? v.slice(0, 27) + '...' : v, list.length]);
      }
    },
  },
  bad: { java: jc(`  void a() { System.out.println("action failed"); } // Noncompliant
  void b() { System.out.println("action failed"); }
  void c() { System.out.println("action failed"); }`), kt: kc(`  fun a() = println("action failed") // Noncompliant
  fun b() = println("action failed")
  fun c() = println("action failed")`) },
  good: { java: jc(`  private static final String FAILED = "action failed";
  void a() { System.out.println(FAILED); }
  void b() { System.out.println(FAILED); }`), kt: kc(`  fun a() = println(FAILED)
  fun b() = println(FAILED)
  companion object { const val FAILED = "action failed" }`) },
});

// ── deprecation ──
const JDK_DEPRECATED = [
  { recv: 'Class', id: 'newInstance', argc: 0, typed: true },
  { recv: 'URLEncoder', id: 'encode', argc: 1 },
  { recv: 'URLDecoder', id: 'decode', argc: 1 },
  { recv: 'Thread', id: 'suspend', argc: 0, typed: true },
  { recv: 'Thread', id: 'resume', argc: 0, typed: true },
  { recv: 'Runtime', id: 'runFinalization', argc: 0, typed: true },
  { recv: 'Date', id: /^(getYear|getMonth|getDay|getHours|getMinutes|getSeconds|setYear|setMonth|setDate|setHours|setMinutes|setSeconds|toLocaleString|toGMTString)$/, argc: -1, typed: true },
  { recv: 'Character', id: /^(isJavaLetter|isJavaLetterOrDigit|isSpace)$/, argc: 1 },
];
rule({
  id: 'deprecated-api', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 15, tags: ['obsolete', 'cwe-477'], ref: 'S1874', ktRef: 'S1874',
  en: ['Deprecated code should not be used', 'Deprecated APIs may be removed and often have known problems.', 'Use the documented replacement.'],
  ko: ['폐기된 코드를 쓰면 안 됩니다', '폐기된 API는 제거될 수 있고 알려진 문제가 있는 경우가 많습니다.', '문서에 나온 대체 API를 쓰세요.'],
  msg: ['Remove this use of "{0}"; it is deprecated.', '폐기된 "{0}"의 사용을 지우세요.'],
  on: {
    Call(n, cx) {
      if (!n.id) return;
      const rs = A.simpleName(A.dotted(n.o) || '');
      const rt = n.o ? cx.typeOf(n.o) : null;
      for (const d of JDK_DEPRECATED) {
        const idOk = typeof d.id === 'string' ? n.id === d.id : d.id.test(n.id);
        if (!idOk || (d.argc >= 0 && n.args.length !== d.argc)) continue;
        if (d.typed ? rt === d.recv : rs === d.recv) { cx.report(n, [n.id]); return; }
      }
      // in-project @Deprecated methods
      const info = cx.clsInfo;
      let target = null;
      if (!n.o || A.strip(n.o).k === 'This') target = info;
      else if (rt) target = cx.proj.info(rt.replace(/\?$/, ''));
      else if (/^[A-Z]/.test(rs)) target = cx.proj.info(rs);
      if (!target) return;
      const ms = cx.proj.findMethods(target, n.id).filter((m) => m.params.length === n.args.length);
      if (ms.length && ms.every((m) => A.hasAnno(m, 'Deprecated')) && !A.hasAnno(cx.method, 'Deprecated')) cx.report(n, [n.id]);
    },
    New(n, cx) {
      const t = A.typeName(n.type);
      if (t === 'Date' && n.args.length >= 3) { cx.report(n, ['Date(int, int, int)']); return; }
      const info = cx.proj.info(t);
      if (info && A.hasAnno(info.decl, 'Deprecated') && !A.hasAnno(cx.cls, 'Deprecated')) cx.report(n, [t]);
    },
  },
  bad: { java: jc(`  @Deprecated void old() { }
  void m() {
    old(); // Noncompliant
    String q = java.net.URLEncoder.encode("a b"); // Noncompliant
  }`), kt: kc(`  @Deprecated("use fresh") fun old() {}
  fun fresh() {}
  fun m() {
    old() // Noncompliant
  }`) },
  good: { java: jc(`  void fresh() { }
  void m() {
    fresh();
    String q = java.net.URLEncoder.encode("a b", java.nio.charset.StandardCharsets.UTF_8);
  }`), kt: kc(`  fun fresh() {}
  fun m() {
    fresh()
  }`) },
});

rule({
  id: 'deprecated-code', langs: ['java', 'kt'], type: 'S', sev: 'IN', debt: 10, tags: ['obsolete'], ref: 'S1133', ktRef: 'S1133',
  en: ['Deprecated code should be removed', 'Deprecated declarations are meant to disappear; keeping them forever adds maintenance cost.', 'Plan the removal once callers have migrated.'],
  ko: ['폐기된 코드는 지워야 합니다', '폐기 표시한 선언은 사라질 예정이며 계속 두면 유지 비용이 듭니다.', '호출자가 옮겨 가면 제거를 계획하세요.'],
  msg: ['Do not forget to remove this deprecated code someday.', '이 폐기된 코드를 언젠가 지우는 것을 잊지 마세요.'],
  on: {
    Method(n, cx) { if (A.hasAnno(n, 'Deprecated')) cx.report(nameLoc(n)); },
    Class(n, cx) { if (A.hasAnno(n, 'Deprecated')) cx.report({ line: n.nameLine || n.line, col: n.col }); },
    Field(n, cx) { if (A.hasAnno(n, 'Deprecated')) cx.report(n.vars[0] || n); },
  },
  bad: { java: jc(`  @Deprecated
  void old() { } // Noncompliant`), kt: kc(`  @Deprecated("use other")
  fun old() {} // Noncompliant`) },
  good: { java: jc(`  void current() { }`), kt: kc(`  fun current() {}`) },
});

rule({
  id: 'deprecated-javadoc-mismatch', type: 'S', sev: 'MA', debt: 5, tags: ['obsolete'], ref: 'S1123',
  en: ['Deprecated elements should have both the annotation and the Javadoc tag', 'Without the @deprecated Javadoc tag users do not learn what to use instead; without the annotation the compiler does not warn.', 'Add the missing @Deprecated annotation or @deprecated tag with the replacement.'],
  ko: ['폐기 요소에는 어노테이션과 Javadoc 태그가 모두 있어야 합니다', '@deprecated Javadoc 태그가 없으면 대체 수단을 알 수 없고 어노테이션이 없으면 컴파일러가 경고하지 않습니다.', '빠진 @Deprecated 어노테이션이나 대체 수단을 적은 @deprecated 태그를 넣으세요.'],
  msg: ['Add the missing {0}.', '빠진 {0}을(를) 넣으세요.'],
  on: {
    Method(n, cx) { depMismatch(n, cx, nameLoc(n)); },
    Class(n, cx) { depMismatch(n, cx, { line: n.nameLine || n.line, col: n.col }); },
  },
  bad: { java: jc(`  @Deprecated
  void old() { } // Noncompliant`) },
  good: { java: jc(`  /**
   * Old.
   * @deprecated use {@link #current()}
   */
  @Deprecated
  void old() { }
  void current() { }`) },
});
function depMismatch(n, cx, loc) {
  if (n.lang === 'kt') return;
  const ann = A.hasAnno(n, 'Deprecated');
  const startLine = n.annos && n.annos.length ? n.annos[0].line : n.line;
  const doc = cx.unit.comments.find((c) => c.doc && c.endLine < startLine && c.endLine >= startLine - 2);
  const tag = !!doc && /@deprecated\b/.test(doc.text);
  if (ann && !tag) cx.report(loc, ['@deprecated Javadoc tag']);
  else if (!ann && tag) cx.report(loc, ['@Deprecated annotation']);
}

rule({
  id: 'commented-out-code', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 5, tags: ['unused'], ref: 'S125', ktRef: 'S125',
  en: ['Sections of code should not be commented out', 'Commented-out code rots, confuses readers and is preserved by version control anyway.', 'Delete it.'],
  ko: ['코드를 주석으로 막아 두면 안 됩니다', '주석 처리한 코드는 낡고 읽는 사람을 헷갈리게 하며 어차피 버전 관리에 남습니다.', '지우세요.'],
  msg: ['This block of commented-out lines of code should be removed.', '주석으로 막은 코드 줄들을 지우세요.'],
  on: {
    Unit(n, cx) {
      let prevLine = -10;
      for (const c of n.comments) {
        if (c.doc) continue;
        const parts = c.block ? c.text.split('\n').map((l) => l.replace(/^\s*\*?/, '')) : [c.text];
        const codeLike = parts.filter((l) => looksLikeCode(l, cx.kt)).length;
        const nonEmpty = parts.filter((l) => l.trim()).length;
        if (!codeLike || codeLike * 2 < nonEmpty) { if (!c.block && c.line === prevLine + 1) { /* keep group */ } continue; }
        if (!c.block && c.line === prevLine + 1) { prevLine = c.line; continue; }
        prevLine = c.endLine;
        cx.report(c.line);
      }
    },
  },
  bad: { java: jm(`    n++;
    // n = compute(n, s);
    // if (n > 3) { reset(); }
    System.out.println(n);`).replace('    // n = compute(n, s);', '    // n = compute(n, s); // Noncompliant'),
    kt: km(`    var x = n
    // val y = compute(x, s) // Noncompliant
    println(x)`) },
  good: { java: jm(`    n++;
    // Increment before printing so the first value is 1.
    System.out.println(n);`), kt: km(`    var x = n
    // Counts start at one.
    println(x)`) },
});
function looksLikeCode(l, kt) {
  const t = l.trim();
  if (!t || t.length < 6) return false;
  if (/^(TODO|FIXME|NOTE|XXX|HACK|NOMCC|@|e\.g\.|i\.e\.|http)/i.test(t)) return false;
  if (/^[A-Z][a-z]+( [a-z]+){3,}/.test(t) && !/[;{}]$/.test(t)) return false;
  if (/;\s*(\/\/.*)?$/.test(t) && /[=(.]/.test(t) && !/^[A-Za-z ,']+;$/.test(t)) return true;
  if (/^(if|for|while|switch|return|throw|try|catch)\s*[({]/.test(t)) return true;
  if (/^(public|private|protected|static|final)\s+[\w<>[\], ]+\s+\w+\s*[(=;]/.test(t)) return true;
  if (/^[}{]\s*$/.test(t)) return false;
  if (/\)\s*\{\s*$/.test(t) && /\(/.test(t)) return true;
  if (kt && /^(val|var|fun)\s+\w+.*[=({]/.test(t)) return true;
  if (/^[a-z_$][\w$]*(\.[a-z_$][\w$]*)*\s*\([^)]*\)\s*;?$/.test(t) && /[a-z]\(/.test(t) && t.length < 120 && !/\s{2,}/.test(t)) return /;$/.test(t) || kt;
  return false;
}

// ── simplifications ──
rule({
  id: 'collapsible-if', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 5, tags: ['clumsy'], ref: 'S1066', ktRef: 'S1066',
  en: ['Mergeable "if" statements should be combined', 'An if whose only content is another if without else can be one condition.', 'Merge the conditions with &&.'],
  ko: ['합칠 수 있는 if 문은 합쳐야 합니다', 'else 없는 if 하나만 담은 if는 조건 하나로 합칠 수 있습니다.', '조건을 &&로 합치세요.'],
  msg: ['Merge this if statement with the enclosing one.', '이 if 문을 바깥 if 문과 합치세요.'],
  on: {
    If(n, cx) {
      if (n.f) return;
      const inner = A.blockStmts(n.t);
      if (inner.length !== 1 || inner[0].k !== 'If' || inner[0].f) return;
      const p = cx.parent();
      if (p && p.k === 'If' && p.f === n) return;
      cx.report(inner[0]);
    },
  },
  bad: { java: jm(`    if (n > 0) {
      if (s != null) { n++; } // Noncompliant
    }`), kt: km(`    if (n > 0) {
        if (s.isNotEmpty()) println(s) // Noncompliant
    }`) },
  good: { java: jm(`    if (n > 0 && s != null) { n++; }
    if (n > 0) {
      if (s != null) { n++; } else { n--; }
    }`), kt: km(`    if (n > 0 && s.isNotEmpty()) println(s)`) },
});

rule({
  id: 'if-return-boolean', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 2, tags: ['clumsy'], ref: 'S1126', ktRef: 'S1126',
  en: ['Return of boolean expressions should not be wrapped into an "if-then-else" statement', '"if (c) return true; else return false;" is just "return c;".', 'Return the condition directly.'],
  ko: ['불리언 식의 반환을 if-then-else로 감싸면 안 됩니다', '"if (c) return true; else return false;"는 "return c;"와 같습니다.', '조건을 바로 반환하세요.'],
  msg: ['Replace this if-then-else statement by a single return statement.', '이 if-then-else 문을 return 문 하나로 바꾸세요.'],
  on: {
    If(n, cx) {
      const t = A.blockStmts(n.t);
      let f = n.f ? A.blockStmts(n.f) : null;
      if (!f) {
        const p = cx.parent();
        if (p && p.k === 'Block') {
          const i = p.stmts.indexOf(n);
          if (i >= 0 && p.stmts[i + 1]) f = [p.stmts[i + 1]];
        }
      }
      if (t.length !== 1 || !f || f.length !== 1) return;
      const bt = boolRet(t[0]);
      const bf = boolRet(f[0]);
      if (bt !== null && bf !== null && bt !== bf) cx.report(n);
    },
    IfX(n, cx) {
      const a = A.blockStmts(n.t);
      const b = n.f ? A.blockStmts(n.f) : [];
      const v = (s) => (s.length === 1 && s[0].k === 'ExprStmt' && A.isBoolLit(s[0].e) ? A.strip(s[0].e).v : null);
      if (v(a) !== null && v(b) !== null && v(a) !== v(b)) cx.report(n);
    },
  },
  bad: { java: jc(`  boolean big(int n) {
    if (n > 10) { return true; } // Noncompliant
    else { return false; }
  }`), kt: kc(`  fun big(n: Int): Boolean {
    return if (n > 10) true else false // Noncompliant
  }`) },
  good: { java: jc(`  boolean big(int n) {
    return n > 10;
  }`), kt: kc(`  fun big(n: Int): Boolean {
    return n > 10
  }`) },
});
function boolRet(s) {
  if (s && s.k === 'Return' && A.isBoolLit(s.e)) return A.strip(s.e).v;
  return null;
}

rule({
  id: 'redundant-cast', type: 'S', sev: 'MI', debt: 5, tags: ['redundant'], ref: 'S1905',
  en: ['Redundant casts should not be used', 'Casting an expression to the type it already has adds noise.', 'Remove the cast.'],
  ko: ['불필요한 캐스팅을 쓰면 안 됩니다', '이미 그 타입인 식을 캐스팅하면 잡음만 늘어납니다.', '캐스팅을 지우세요.'],
  msg: ['Remove this unnecessary cast to "{0}".', '"{0}"(으)로의 불필요한 캐스팅을 지우세요.'],
  on: {
    Cast(n, cx) {
      if (cx.kt || n.types) return;
      const t = T.typeStr(n.type);
      if (!t || n.type.prim || n.type.args && n.type.args.length) return;
      const et = cx.typeOf(n.e);
      if (et && et === t && et !== 'null' && !T.primOf(et)) cx.report(n, [t]);
    },
  },
  bad: { java: jm(`    String t = (String) s.trim(); // Noncompliant`) },
  good: { java: jm(`    String t = s.trim();
    long w = (long) n;`) },
});

rule({
  id: 'redundant-parentheses', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 1, tags: ['confusing'], ref: 'S1110', ktRef: 'S1110',
  en: ['Redundant pairs of parentheses should be removed', 'Doubled parentheses add nothing and make readers look for a hidden meaning.', 'Remove the extra pair.'],
  ko: ['불필요한 괄호 쌍은 지워야 합니다', '겹친 괄호는 의미가 없고 읽는 사람이 숨은 뜻을 찾게 만듭니다.', '여분의 괄호 쌍을 지우세요.'],
  msg: ['Remove these useless parentheses.', '이 쓸모없는 괄호를 지우세요.'],
  on: { Paren(n, cx) { if (n.e && n.e.k === 'Paren') cx.report(n); } },
  bad: { java: jm(`    int x = ((n + 1)); // Noncompliant`), kt: km(`    val x = ((n + 1)) // Noncompliant`) },
  good: { java: jm(`    int x = (n + 1) * 2;`), kt: km(`    val x = (n + 1) * 2`) },
});

rule({
  id: 'string-concat-in-loop', type: 'S', sev: 'MI', debt: 10, tags: ['performance'], ref: 'S1643',
  en: ['Strings should not be concatenated using "+" in a loop', 'Each += copies the whole string, making the loop quadratic.', 'Use a StringBuilder (or String.join / Collectors.joining).'],
  ko: ['루프에서 +로 문자열을 이어 붙이면 안 됩니다', '+=마다 문자열 전체를 복사해 루프가 제곱 시간이 됩니다.', 'StringBuilder(또는 String.join / Collectors.joining)를 쓰세요.'],
  msg: ['Use a StringBuilder instead of concatenating "{0}" in a loop.', '루프에서 "{0}"을(를) 이어 붙이지 말고 StringBuilder를 쓰세요.'],
  on: {
    Assign(n, cx) {
      const loop = H.inLoopWithin(cx);
      if (!loop) return;
      const name = A.nameOf(n.t);
      if (!name || cx.typeOf(n.t) !== 'String') return;
      const isConcat = n.op === '+=' || (n.op === '=' && A.strip(n.v).k === 'Bin' && A.strip(n.v).op === '+' && A.nameOf(A.strip(n.v).l) === name);
      if (!isConcat) return;
      // declared outside the loop?
      const declInLoop = A.find(loop.body, (x) => x.k === 'Local' && x.vars.some((v) => v.name === name));
      if (!declInLoop) cx.report(n, [name]);
    },
  },
  bad: { java: jm(`    String out = "";
    for (String x : list) {
      out += x; // Noncompliant
    }
    System.out.println(out);`) },
  good: { java: jm(`    StringBuilder out = new StringBuilder();
    for (String x : list) {
      out.append(x);
    }
    System.out.println(out);`) },
});

rule({
  id: 'tostring-on-string', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 5, tags: ['clumsy'], ref: 'S1858', ktRef: 'S1858',
  en: ['"toString()" should never be called on a String object', 'Calling toString() on a String returns the same object and adds noise.', 'Remove the call.'],
  ko: ['String 객체에 toString()을 호출하면 안 됩니다', 'String에 toString()을 부르면 같은 객체가 나와 잡음만 늘어납니다.', '호출을 지우세요.'],
  msg: ['There\'s no need to call "toString()" on a string.', '문자열에는 toString()을 부를 필요가 없습니다.'],
  on: { Call(n, cx) { if (n.id === 'toString' && n.o && n.args.length === 0 && !n.safe && (cx.typeOf(n.o) === 'String' || A.isStrLit(n.o))) cx.report(n); } },
  bad: { java: jm(`    String t = s.toString(); // Noncompliant`), kt: km(`    val t = s.toString() // Noncompliant`) },
  good: { java: jm(`    String t = s;
    String u = o.toString();`), kt: km(`    val t = s
    val u = o.toString()`) },
});

rule({
  id: 'collections-empty-constants', type: 'S', sev: 'MI', debt: 2, tags: ['pitfall'], ref: 'S1596',
  en: ['"Collections.EMPTY_LIST", "EMPTY_MAP", and "EMPTY_SET" should not be used', 'These constants are raw types and lose type safety.', 'Use Collections.emptyList() / emptyMap() / emptySet() or List.of().'],
  ko: ['Collections.EMPTY_LIST, EMPTY_MAP, EMPTY_SET을 쓰면 안 됩니다', '이 상수들은 raw 타입이라 타입 안전성을 잃습니다.', 'Collections.emptyList() / emptyMap() / emptySet()이나 List.of()를 쓰세요.'],
  msg: ['Replace "Collections.{0}" by "Collections.{1}()".', '"Collections.{0}"을(를) "Collections.{1}()"(으)로 바꾸세요.'],
  on: {
    Sel(n, cx) {
      const m = { EMPTY_LIST: 'emptyList', EMPTY_MAP: 'emptyMap', EMPTY_SET: 'emptySet' }[n.id];
      if (m && A.simpleName(A.dotted(n.o) || '') === 'Collections') cx.report(n, [n.id, m]);
    },
  },
  bad: { java: jm(`    java.util.List<String> xs = java.util.Collections.EMPTY_LIST; // Noncompliant`) },
  good: { java: jm(`    java.util.List<String> xs = java.util.Collections.emptyList();`) },
});

rule({
  id: 'abstract-class-public-ctor', type: 'S', sev: 'MA', debt: 5, tags: ['design'], ref: 'S5993',
  en: ['Constructors of an "abstract" class should not be declared "public"', 'An abstract class cannot be instantiated, so a public constructor misleads.', 'Make the constructor protected.'],
  ko: ['abstract 클래스의 생성자를 public으로 선언하면 안 됩니다', 'abstract 클래스는 인스턴스로 만들 수 없어 public 생성자는 오해를 부릅니다.', '생성자를 protected로 하세요.'],
  msg: ['Change the visibility of this constructor to "protected".', '이 생성자의 가시성을 protected로 바꾸세요.'],
  on: { Method(n, cx) { if (n.ctor && n.mods.has('public') && cx.cls && cx.cls.mods.has('abstract') && n.lang !== 'kt') cx.report(nameLoc(n)); } },
  bad: { java: `abstract class Shape {
  public Shape() { } // Noncompliant
}
` },
  good: { java: `abstract class Shape {
  protected Shape() { }
}
` },
});

rule({
  id: 'utility-class-constructor', type: 'S', sev: 'MA', debt: 30, tags: ['design'], ref: 'S1118',
  en: ['Utility classes should not have public constructors', 'A class with only static members is not meant to be instantiated.', 'Add a private constructor (or make it an enum / final class with a private constructor).'],
  ko: ['유틸리티 클래스에 public 생성자가 있으면 안 됩니다', 'static 멤버만 있는 클래스는 인스턴스로 만들 의도가 아닙니다.', 'private 생성자를 넣으세요.'],
  msg: ['Add a private constructor to hide the implicit public one.', '숨겨진 public 생성자를 가리도록 private 생성자를 넣으세요.'],
  on: {
    Class(n, cx) {
      if (n.lang === 'kt' || n.kind !== 'class' || n.anon || n.mods.has('abstract') || n.ext) return;
      const members = n.members.filter((m) => m.k === 'Method' || m.k === 'Field');
      if (!members.length) return;
      if (!members.every((m) => H.isStatic(m) || m.ctor)) return;
      if (members.some((m) => m.k === 'Method' && m.name === 'main')) return;
      const ctors = members.filter((m) => m.ctor);
      if (ctors.some((c) => c.mods.has('private'))) return;
      if (!members.some((m) => m.k === 'Method' && !m.ctor)) return;
      const p = cx.parent();
      if (p && p.k === 'Class' && !n.mods.has('static')) return;
      cx.report({ line: n.nameLine || n.line, col: n.col });
    },
  },
  bad: { java: `class StringUtil { // Noncompliant
  static String twice(String s) { return s + s; }
}
` },
  good: { java: `final class StringUtil {
  private StringUtil() { }
  static String twice(String s) { return s + s; }
}
` },
});

rule({
  id: 'constant-interface', type: 'S', sev: 'CR', debt: 30, tags: ['design'], ref: 'S1214',
  en: ['Constants should not be defined in interfaces', 'Implementing an interface just to get constants leaks them into the public API of every implementer.', 'Move the constants to a final class or an enum.'],
  ko: ['인터페이스에 상수를 정의하면 안 됩니다', '상수만 얻으려고 인터페이스를 구현하면 모든 구현체의 공개 API로 상수가 새어 나갑니다.', '상수를 final 클래스나 enum으로 옮기세요.'],
  msg: ['Move constants defined in this interface to another class or enum.', '이 인터페이스의 상수를 다른 클래스나 enum으로 옮기세요.'],
  on: {
    Class(n, cx) {
      if (n.kind !== 'interface' || n.lang === 'kt') return;
      const fields = n.members.filter((m) => m.k === 'Field');
      const methods = n.members.filter((m) => m.k === 'Method');
      if (fields.length && !methods.length) cx.report({ line: n.nameLine || n.line, col: n.col });
    },
  },
  bad: { java: `interface Limits { // Noncompliant
  int MAX = 10;
}
` },
  good: { java: `final class Limits {
  static final int MAX = 10;
  private Limits() { }
}
` },
});

rule({
  id: 'field-hides-parent-field', type: 'S', sev: 'MA', debt: 5, tags: ['pitfall'], ref: 'S2387',
  en: ['Child class fields should not shadow parent class fields', 'A field with the same name as an inherited field hides it, and code in each class uses a different value.', 'Rename the field or use the inherited one.'],
  ko: ['하위 클래스 필드가 상위 클래스 필드를 가리면 안 됩니다', '상속받은 필드와 같은 이름의 필드는 그것을 가려 클래스마다 다른 값을 쓰게 됩니다.', '필드 이름을 바꾸거나 상속받은 필드를 쓰세요.'],
  msg: ['"{0}" is the name of a field in "{1}".', '"{0}"은(는) "{1}"의 필드 이름입니다.'],
  on: {
    Field(n, cx) {
      if (H.isStatic(n) || n.lang === 'kt' || !cx.cls) return;
      const info = cx.clsInfo;
      if (!info || !info.superName) return;
      const sup = cx.proj.info(info.superName);
      if (!sup) return;
      for (const v of n.vars) {
        const f = cx.proj.findField(sup, v.name);
        if (f && !(f.field.mods && (f.field.mods.has('private') || f.field.mods.has('static')))) cx.report(v, [v.name, f.owner.name]);
      }
    },
  },
  bad: { java: `class Base { protected int count; }
class Child extends Base {
  int count; // Noncompliant
}
` },
  good: { java: `class Base { protected int count; }
class Child extends Base {
  int childCount;
}
` },
});

rule({
  id: 'local-shadows-field', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 5, tags: ['pitfall'], ref: 'S1117', ktRef: 'S1117',
  en: ['Local variables should not shadow class fields', 'A local with the same name as a field makes it unclear which one later code uses.', 'Rename the local variable.'],
  ko: ['지역 변수가 클래스 필드를 가리면 안 됩니다', '필드와 같은 이름의 지역 변수는 뒤 코드가 어느 것을 쓰는지 헷갈리게 합니다.', '지역 변수 이름을 바꾸세요.'],
  msg: ['Rename "{0}" which hides the field declared at line {1}.', '{1}행에 선언한 필드를 가리는 "{0}"의 이름을 바꾸세요.'],
  on: {
    Local(n, cx) {
      const m = cx.method;
      const cls = cx.cls;
      if (!m || !cls || (m.mods && m.mods.has('static'))) return;
      if (cx.enclosing(['Lambda'])) return;
      for (const v of n.vars) {
        const f = H.classFields(cls).find((x) => x.name === v.name);
        if (f && !(f.field && H.isStatic(f.field))) cx.report(v, [v.name, (f.v || f.param).line]);
      }
    },
  },
  bad: { java: jc(`  private int count;
  void m() {
    int count = 3; // Noncompliant
    System.out.println(count);
  }`), kt: kc(`  private var count = 0
  fun m() {
    val count = 3 // Noncompliant
    println(count)
  }`) },
  good: { java: jc(`  private int count;
  void m() {
    int localCount = 3;
    System.out.println(localCount + count);
  }`), kt: kc(`  private var count = 0
  fun m() {
    val localCount = 3
    println(localCount + count)
  }`) },
});

rule({
  id: 'parameter-reassigned', type: 'S', sev: 'MA', debt: 5, tags: ['pitfall'], ref: 'S1226',
  en: ['Method parameters, caught exceptions and foreach variables\' initial values should not be ignored', 'Overwriting a parameter before reading it discards what the caller passed.', 'Use a new local variable instead.'],
  ko: ['매개변수, 잡은 예외, foreach 변수의 초기값을 무시하면 안 됩니다', '매개변수를 읽기 전에 덮어쓰면 호출자가 넘긴 값을 버립니다.', '새 지역 변수를 쓰세요.'],
  msg: ['Introduce a new variable instead of reusing the parameter "{0}".', '매개변수 "{0}"을(를) 재사용하지 말고 새 변수를 만드세요.'],
  on: {
    Method(n, cx) {
      if (!n.body || n.lang === 'kt') return;
      for (const p of n.params) {
        let first = null;
        const visit = (x) => {
          if (first || !x || typeof x !== 'object') return;
          if (x.k === 'Lambda' || x.k === 'Class' || (x.k === 'New' && x.body)) return;
          if (x.k === 'Assign') {
            visit(x.v);
            if (!first && A.nameOf(x.t) === p.name) first = x.op === '=' ? x : 'read';
            if (!first) visit(x.t);
            return;
          }
          if (x.k === 'Name' && x.id === p.name) { first = 'read'; return; }
          if (x.k === 'If' || x.k === 'While' || x.k === 'For' || x.k === 'Switch' || x.k === 'Try' || x.k === 'ForEach' || x.k === 'Do') {
            // conditional writes are fine; only straight-line code counts
            if (A.find(x, (y) => y.k === 'Name' && y.id === p.name)) first = 'read';
            return;
          }
          A.eachChild(x, visit);
        };
        visit(n.body);
        if (first && first !== 'read') cx.report(first, [p.name]);
      }
    },
  },
  bad: { java: jc(`  int f(int value) {
    value = 10; // Noncompliant
    return value;
  }`) },
  good: { java: jc(`  int f(int value) {
    int v = value + 10;
    value = v * 2;
    return value;
  }`) },
});

rule({
  id: 'array-designator-on-name', type: 'S', sev: 'MI', debt: 5, tags: ['convention'], ref: 'S1197',
  en: ['Array designators "[]" should be on the type, not the variable', 'int x[] splits the type and confuses readers; int[] x keeps the type together.', 'Move the brackets to the type.'],
  ko: ['배열 표시 []는 변수가 아니라 타입에 붙여야 합니다', 'int x[]는 타입을 쪼개 헷갈리게 하며 int[] x가 타입을 한데 둡니다.', '대괄호를 타입 쪽으로 옮기세요.'],
  msg: ['Move the array designators "[]" to the type.', '배열 표시 []를 타입으로 옮기세요.'],
  on: {
    Var(n, cx) { if (n.dims > 0 && !cx.kt) cx.report(n); },
    Param(n, cx) { if (n.cdims && !cx.kt) cx.report(n); },
  },
  bad: { java: jm(`    int counts[] = new int[3]; // Noncompliant`) },
  good: { java: jm(`    int[] counts = new int[3];`) },
});

const MOD_ORDER = ['public', 'protected', 'private', 'abstract', 'default', 'static', 'sealed', 'non-sealed', 'final', 'transient', 'volatile', 'synchronized', 'native', 'strictfp'];
rule({
  id: 'modifier-order', type: 'S', sev: 'MI', debt: 2, tags: ['convention'], ref: 'S1124',
  en: ['Modifiers should be declared in the correct order', 'The Java Language Specification recommends a fixed order; following it makes declarations easy to scan.', 'Reorder: public protected private abstract default static final transient volatile synchronized native strictfp.'],
  ko: ['한정자는 올바른 순서로 선언해야 합니다', 'Java 언어 명세가 권하는 순서를 따르면 선언을 훑어보기 쉽습니다.', '순서를 바꾸세요: public protected private abstract default static final transient volatile synchronized native strictfp.'],
  msg: ['Reorder the modifiers to comply with the Java Language Specification.', 'Java 언어 명세에 맞게 한정자 순서를 바꾸세요.'],
  on: {
    Method(n, cx) { modOrder(n, cx, nameLoc(n)); },
    Field(n, cx) { modOrder(n, cx, n); },
    Class(n, cx) { modOrder(n, cx, { line: n.nameLine || n.line, col: n.col }); },
  },
  bad: { java: jc(`  final static int MAX = 3; // Noncompliant`) },
  good: { java: jc(`  static final int MAX = 3;`) },
});
function modOrder(n, cx, loc) {
  if (cx.kt || !n.mods) return;
  const idx = [...n.mods].map((m) => MOD_ORDER.indexOf(m)).filter((i) => i >= 0);
  for (let i = 1; i < idx.length; i++) if (idx[i] < idx[i - 1]) { cx.report(loc); return; }
}

rule({
  id: 'redundant-modifier', type: 'S', sev: 'MI', debt: 2, tags: ['redundant'], ref: 'S2333',
  en: ['Redundant modifiers should not be used', 'Interface members are implicitly public (and fields static final); nested interfaces and enums are implicitly static.', 'Remove the redundant modifier.'],
  ko: ['불필요한 한정자를 쓰면 안 됩니다', '인터페이스 멤버는 암묵적으로 public(필드는 static final)이고 중첩 인터페이스와 enum은 암묵적으로 static입니다.', '불필요한 한정자를 지우세요.'],
  msg: ['"{0}" is redundant in this context.', '이 문맥에서 "{0}"은(는) 불필요합니다.'],
  on: {
    Method(n, cx) {
      const c = cx.cls;
      if (!c || c.kind !== 'interface' || cx.kt) return;
      for (const m of ['public', 'abstract']) if (n.mods.has(m)) { cx.report(nameLoc(n), [m]); return; }
    },
    Field(n, cx) {
      const c = cx.cls;
      if (!c || c.kind !== 'interface' || cx.kt) return;
      for (const m of ['public', 'static', 'final']) if (n.mods.has(m)) { cx.report(n.vars[0] || n, [m]); return; }
    },
    Class(n, cx) {
      const p = cx.parent();
      if (cx.kt || !p || p.k !== 'Class') return;
      if ((n.kind === 'interface' || n.kind === 'enum' || n.kind === 'record') && n.mods.has('static')) cx.report({ line: n.nameLine || n.line, col: n.col }, ['static']);
    },
  },
  bad: { java: `interface Shape {
  public double area(); // Noncompliant
}
` },
  good: { java: `interface Shape {
  double area();
}
` },
});

rule({
  id: 'missing-override', type: 'S', sev: 'MA', debt: 5, tags: ['bad-practice'], ref: 'S1161',
  en: ['"@Override" should be used on overriding and implementing methods', 'Without @Override a typo in the name or signature silently creates a new method instead of overriding.', 'Add @Override.'],
  ko: ['재정의·구현 메서드에는 @Override를 써야 합니다', '@Override가 없으면 이름이나 시그니처 오타가 재정의 대신 새 메서드를 조용히 만듭니다.', '@Override를 붙이세요.'],
  msg: ['Add the "@Override" annotation above this method signature.', '이 메서드 시그니처 위에 @Override를 붙이세요.'],
  on: {
    Method(n, cx) {
      if (cx.kt || n.ctor || H.isStatic(n) || H.isPrivate(n) || A.hasAnno(n, 'Override') || !cx.cls) return;
      const sig = n.params.map((p) => A.typeName(p.type)).join(',');
      const objectSigs = { equals: 'Object', hashCode: '', toString: '', clone: '', finalize: '' };
      if (Object.prototype.hasOwnProperty.call(objectSigs, n.name) && objectSigs[n.name] === sig && cx.cls.kind !== 'interface') { cx.report(nameLoc(n)); return; }
      const info = cx.clsInfo;
      if (!info) return;
      for (const s of cx.proj.supers(info)) {
        const ms = s.methods.get(n.name) || [];
        if (ms.some((m) => !H.isStatic(m) && !H.isPrivate(m) && m.params.map((p) => A.typeName(p.type)).join(',') === sig)) { cx.report(nameLoc(n)); return; }
      }
    },
  },
  bad: { java: jc(`  public String toString() { // Noncompliant
    return "T";
  }`) },
  good: { java: jc(`  @Override
  public String toString() {
    return "T";
  }`) },
});

rule({
  id: 'octal-literal', type: 'S', sev: 'MA', debt: 5, tags: ['pitfall'], ref: 'S1314',
  en: ['Octal values should not be used', 'A leading zero makes the literal octal: 010 is 8, not 10.', 'Remove the leading zero (or write the value in decimal/hex).'],
  ko: ['8진수 값을 쓰면 안 됩니다', '앞에 0이 붙으면 8진수가 되어 010은 10이 아니라 8입니다.', '앞의 0을 지우세요(또는 10진수/16진수로 쓰세요).'],
  msg: ['Use decimal values instead of octal ones.', '8진수 대신 10진수 값을 쓰세요.'],
  on: { Lit(n, cx) { if (n.octal && n.v !== 0 && !cx.kt) cx.report(n); } },
  bad: { java: jm(`    int mode = 0755; // Noncompliant`) },
  good: { java: jm(`    int mode = 493;
    int zero = 0;`) },
});

rule({
  id: 'redundant-jump', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 1, tags: ['redundant'], ref: 'S3626', ktRef: 'S3626',
  en: ['Jump statements should not be redundant', 'A return at the end of a void method or a continue at the end of a loop body does nothing.', 'Remove the jump.'],
  ko: ['불필요한 점프 문을 쓰면 안 됩니다', 'void 메서드 끝의 return이나 루프 본문 끝의 continue는 아무 일도 하지 않습니다.', '점프 문을 지우세요.'],
  msg: ['Remove this redundant jump.', '이 불필요한 점프를 지우세요.'],
  on: {
    Method(n, cx) {
      if (!n.body || n.exprBody || n.body.stmts.length < 2) return;
      const voidRet = !n.ret || A.typeName(n.ret) === 'void' || A.typeName(n.ret) === 'Unit';
      const last = n.body.stmts[n.body.stmts.length - 1];
      if (voidRet && last.k === 'Return' && !last.e && !last.label) cx.report(last);
    },
    ForEach(n, cx) { loopEndContinue(n, cx); },
    While(n, cx) { loopEndContinue(n, cx); },
    For(n, cx) { loopEndContinue(n, cx); },
  },
  bad: { java: jc(`  void f(int n) {
    System.out.println(n);
    return; // Noncompliant
  }`), kt: kc(`  fun f(n: Int) {
    println(n)
    return // Noncompliant
  }`) },
  good: { java: jc(`  void f(int n) {
    if (n < 0) { return; }
    System.out.println(n);
  }`), kt: kc(`  fun f(n: Int) {
    if (n < 0) return
    println(n)
  }`) },
});
function loopEndContinue(n, cx) {
  if (!n.body || n.body.k !== 'Block' || n.body.stmts.length < 2) return;
  const last = n.body.stmts[n.body.stmts.length - 1];
  if (last.k === 'Continue' && !last.label) cx.report(last);
}

rule({
  id: 'immediately-returned-variable', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 2, tags: ['clumsy'], ref: 'S1488', ktRef: 'S1488',
  en: ['Local variables should not be declared and then immediately returned or thrown', 'A variable that is only returned on the next line adds noise.', 'Return the expression directly.'],
  ko: ['지역 변수를 선언하자마자 반환하거나 던지면 안 됩니다', '다음 줄에서 반환만 하는 변수는 잡음만 늘립니다.', '식을 바로 반환하세요.'],
  msg: ['Immediately {0} this expression instead of assigning it to the temporary variable "{1}".', '임시 변수 "{1}"에 담지 말고 이 식을 바로 {0}하세요.'],
  on: {
    Block(n, cx) {
      for (let i = 0; i + 1 < n.stmts.length; i++) {
        const a = n.stmts[i];
        const b = n.stmts[i + 1];
        if (a.k !== 'Local' || a.vars.length !== 1 || !a.vars[0].init || (a.annos && a.annos.length) || a.destructure) continue;
        const name = a.vars[0].name;
        if ((b.k === 'Return' || b.k === 'Throw') && b.e && A.nameOf(b.e) === name) {
          cx.report(a.vars[0].init, [b.k === 'Return' ? 'return' : 'throw', name]);
        }
      }
    },
  },
  bad: { java: jc(`  int f(int n) {
    int result = n * 2; // Noncompliant
    return result;
  }`), kt: kc(`  fun f(n: Int): Int {
    val result = n * 2 // Noncompliant
    return result
  }`) },
  good: { java: jc(`  int f(int n) {
    return n * 2;
  }`), kt: kc(`  fun f(n: Int): Int {
    return n * 2
  }`) },
});

rule({
  id: 'lambda-block-single-statement', type: 'S', sev: 'MI', debt: 2, tags: ['java8'], ref: 'S1602',
  en: ['Lambdas containing only one statement should not nest this statement in a block', 'Braces and return around a single expression add noise.', 'Use an expression lambda.'],
  ko: ['문장 하나만 있는 람다는 블록으로 감싸면 안 됩니다', '식 하나를 중괄호와 return으로 감싸면 잡음만 늘어납니다.', '식 람다로 쓰세요.'],
  msg: ['Remove useless curly braces around statement.', '문장을 감싼 쓸모없는 중괄호를 지우세요.'],
  on: {
    Lambda(n, cx) {
      if (cx.kt || n.kt || !n.body || n.body.k !== 'Block' || n.body.stmts.length !== 1) return;
      const s = n.body.stmts[0];
      if ((s.k === 'Return' && s.e) || s.k === 'ExprStmt') cx.report(n);
    },
  },
  bad: { java: jm(`    list.forEach(x -> { System.out.println(x); }); // Noncompliant`) },
  good: { java: jm(`    list.forEach(x -> System.out.println(x));`) },
});

rule({
  id: 'lambda-to-method-reference', type: 'S', sev: 'MI', debt: 2, tags: ['java8'], ref: 'S1612',
  en: ['Lambdas should be replaced with method references', 'A lambda that only forwards its parameters to one method reads better as a method reference.', 'Use the method reference (Type::method).'],
  ko: ['람다는 메서드 참조로 바꿔야 합니다', '매개변수를 메서드 하나로 넘기기만 하는 람다는 메서드 참조가 더 읽기 좋습니다.', '메서드 참조(Type::method)를 쓰세요.'],
  msg: ['Replace this lambda with method reference "{0}".', '이 람다를 메서드 참조 "{0}"(으)로 바꾸세요.'],
  on: {
    Lambda(n, cx) {
      if (cx.kt || n.kt) return;
      let body = n.body;
      if (body && body.k === 'Block') {
        if (body.stmts.length !== 1) return;
        const s = body.stmts[0];
        body = s.k === 'Return' ? s.e : s.k === 'ExprStmt' ? s.e : null;
      }
      body = A.strip(body);
      if (!body) return;
      const ps = n.params.map((p) => p.name);
      if (body.k === 'Call' && body.id && !body.callee) {
        const args = body.args.map((a) => A.nameOf(a));
        // x -> x.m()
        if (ps.length === 1 && body.o && A.nameOf(body.o) === ps[0] && body.args.length === 0) { cx.report(n, ['::' + body.id]); return; }
        // x -> foo(x) / x -> Recv.foo(x)
        if (body.args.length === ps.length && args.every((a, i) => a === ps[i])) {
          if (body.o && A.find(body.o, (y) => y.k === 'Name' && ps.includes(y.id))) return;
          if (body.o && !(A.dotted(body.o))) return;
          cx.report(n, [(A.dotted(body.o) || 'this') + '::' + body.id]);
        }
      } else if (body.k === 'New' && !body.body && !body.array && body.args.length === ps.length && body.args.every((a, i) => A.nameOf(a) === ps[i])) {
        cx.report(n, [A.typeName(body.type) + '::new']);
      }
    },
  },
  bad: { java: jm(`    list.stream().map(x -> x.trim()).forEach(System.out::println); // Noncompliant`) },
  good: { java: jm(`    list.stream().map(String::trim).forEach(System.out::println);
    list.stream().map(x -> x.substring(1)).forEach(System.out::println);`) },
});

const FUNCTIONAL = new Set(['Runnable', 'Callable', 'Comparator', 'Supplier', 'Consumer', 'BiConsumer', 'Function', 'BiFunction', 'Predicate',
  'BiPredicate', 'UnaryOperator', 'BinaryOperator', 'ActionListener', 'ThreadFactory', 'FileFilter', 'FilenameFilter', 'IntPredicate',
  'IntFunction', 'ToIntFunction', 'PrivilegedAction', 'ChangeListener', 'EventHandler']);
rule({
  id: 'anonymous-class-to-lambda', type: 'S', sev: 'MA', debt: 5, tags: ['java8'], ref: 'S1604',
  en: ['Anonymous inner classes containing only one method should become lambdas', 'A lambda expresses a single-method implementation with far less boilerplate.', 'Replace the anonymous class with a lambda.'],
  ko: ['메서드 하나만 있는 익명 내부 클래스는 람다로 바꿔야 합니다', '메서드 하나짜리 구현은 람다가 훨씬 적은 상용구로 표현합니다.', '익명 클래스를 람다로 바꾸세요.'],
  msg: ['Make this anonymous inner class a lambda.', '이 익명 내부 클래스를 람다로 바꾸세요.'],
  on: {
    New(n, cx) {
      if (cx.kt || !n.body || n.objExpr) return;
      if (!FUNCTIONAL.has(A.typeName(n.type))) return;
      const mem = n.body.members;
      if (mem.length !== 1 || mem[0].k !== 'Method' || !mem[0].body) return;
      if (A.find(mem[0].body, (x) => x.k === 'This' || (x.k === 'Super'))) return;
      cx.report(n);
    },
  },
  bad: { java: jm(`    Runnable r = new Runnable() { // Noncompliant
      @Override public void run() { System.out.println("run"); }
    };`) },
  good: { java: jm(`    Runnable r = () -> System.out.println("run");`) },
});

rule({
  id: 'collect-to-list', type: 'S', sev: 'MI', debt: 2, tags: ['java16'], ref: 'S6204',
  en: ['"Stream.toList()" should be used instead of "collectors" when unmodifiable list needed', 'Stream.toList() (Java 16+) is shorter and returns an unmodifiable list.', 'Use .toList() when the result is not modified.'],
  ko: ['수정하지 않을 리스트에는 collectors 대신 Stream.toList()를 써야 합니다', 'Stream.toList()(Java 16+)가 더 짧고 수정 불가 리스트를 반환합니다.', '결과를 수정하지 않는다면 .toList()를 쓰세요.'],
  msg: ['Replace this usage of "Stream.collect(Collectors.toList())" with "Stream.toList()".', '"Stream.collect(Collectors.toList())"를 "Stream.toList()"로 바꾸세요.'],
  on: {
    Call(n, cx) {
      if (n.id !== 'collect' || n.args.length !== 1) return;
      const a = A.strip(n.args[0]);
      if (a.k === 'Call' && (a.id === 'toUnmodifiableList' || a.id === 'toList') && A.simpleName(A.dotted(a.o) || '') === 'Collectors' && a.id === 'toUnmodifiableList') cx.report(n);
      if (a.k === 'Call' && a.id === 'toList' && A.simpleName(A.dotted(a.o) || '') === 'Collectors') {
        // result must not be modified: only flag when it is returned or passed on directly
        const p = cx.parent();
        if (p && (p.k === 'Return' || (p.k === 'Var' && false))) cx.report(n);
      }
    },
  },
  bad: { java: jc(`  java.util.List<String> names(java.util.List<String> xs) {
    return xs.stream().map(String::trim).collect(java.util.stream.Collectors.toList()); // Noncompliant
  }`) },
  good: { java: jc(`  java.util.List<String> names(java.util.List<String> xs) {
    return xs.stream().map(String::trim).toList();
  }`) },
});

rule({
  id: 'switch-too-few-cases', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 5, tags: ['bad-practice'], ref: 'S1301', ktRef: 'S1301',
  en: ['"switch" statements should have at least 3 "case" clauses', 'A switch (or when) with one or two branches is an if/else in disguise.', 'Use if/else.'],
  ko: ['switch 문에는 case가 셋 이상 있어야 합니다', '분기가 한두 개인 switch(또는 when)는 if/else와 다를 바 없습니다.', 'if/else를 쓰세요.'],
  msg: ['Replace this "{0}" statement by "if" statements to increase readability.', '가독성을 위해 이 "{0}" 문을 if 문으로 바꾸세요.'],
  on: {
    Switch(n, cx) {
      if (n.expr && !n.kt) return;
      if (n.cases.some((c) => c.labels.some((l) => l.k === 'TypePat' || l.k === 'RecPat' || l.k === 'IsPat'))) return;
      if (n.kt && !n.sel) return;
      const p = cx.parent();
      if (n.kt && n.expr && p && p.k !== 'ExprStmt') return;
      const labels = n.cases.reduce((k, c) => k + Math.max(1, c.labels.length), 0);
      if (labels < 3) cx.report(n, [n.kt ? 'when' : 'switch']);
    },
  },
  bad: { java: jm(`    switch (n) { // Noncompliant
      case 1: System.out.println("one"); break;
      default: break;
    }`), kt: km(`    when (n) { // Noncompliant
        1 -> println("one")
        else -> println("other")
    }`) },
  good: { java: jm(`    switch (n) {
      case 1: System.out.println("one"); break;
      case 2: System.out.println("two"); break;
      default: break;
    }`), kt: km(`    when (n) {
        1 -> println("one")
        2 -> println("two")
        else -> println("other")
    }`) },
});

rule({
  id: 'instanceof-pattern', type: 'S', sev: 'MI', debt: 5, tags: ['java16'], ref: 'S6201',
  en: ['Pattern Matching for "instanceof" operator should be used instead of simple "instanceof" + cast', 'Testing a type and then casting repeats the type and the variable.', 'Use "if (x instanceof Foo f)".'],
  ko: ['단순 instanceof + 캐스팅 대신 instanceof 패턴 매칭을 써야 합니다', '타입을 검사한 뒤 캐스팅하면 타입과 변수를 반복합니다.', '"if (x instanceof Foo f)"를 쓰세요.'],
  msg: ['Replace this instanceof check and cast with \'instanceof {0} {1}\'.', '이 instanceof 검사와 캐스팅을 \'instanceof {0} {1}\'(으)로 바꾸세요.'],
  on: {
    If(n, cx) {
      const c = A.strip(n.c);
      if (!c || c.k !== 'InstOf' || c.bind || c.pat || cx.kt) return;
      const v = A.nameOf(c.e);
      if (!v) return;
      const cast = A.find(n.t, (x) => x.k === 'Cast' && A.nameOf(x.e) === v && A.typeName(x.type) === A.typeName(c.type));
      if (cast) cx.report(c, [A.typeName(c.type), 'x']);
    },
  },
  bad: { java: jm(`    if (o instanceof String) { // Noncompliant
      String t = (String) o;
      System.out.println(t);
    }`) },
  good: { java: jm(`    if (o instanceof String t) {
      System.out.println(t);
    }`) },
});

rule({
  id: 'wildcard-return-type', type: 'S', sev: 'CR', debt: 20, tags: ['generics'], ref: 'S1452',
  en: ['Generic wildcard types should not be used in return types', 'Wildcards in return types force every caller to deal with them.', 'Return a concrete type argument.'],
  ko: ['반환 타입에 제네릭 와일드카드를 쓰면 안 됩니다', '반환 타입의 와일드카드는 모든 호출자가 그것을 다루게 만듭니다.', '구체적인 타입 인자를 반환하세요.'],
  msg: ['Remove usage of generic wildcard type.', '제네릭 와일드카드 타입의 사용을 지우세요.'],
  on: {
    Method(n, cx) {
      if (cx.kt || !n.ret || H.isPrivate(n) || H.isOverride(n)) return;
      if ((n.ret.args || []).some((a) => a.wildcard && a.wildcard !== '?')) cx.report(nameLoc(n));
    },
  },
  bad: { java: jc(`  public java.util.List<? extends Number> values() { // Noncompliant
    return java.util.List.of(1);
  }`) },
  good: { java: jc(`  public java.util.List<Number> values() {
    return java.util.List.of(1);
  }`) },
});

const GENERIC_JDK = new Set(['List', 'ArrayList', 'LinkedList', 'Map', 'HashMap', 'TreeMap', 'LinkedHashMap', 'Set', 'HashSet', 'TreeSet',
  'LinkedHashSet', 'Collection', 'Iterator', 'Iterable', 'Optional', 'Comparator', 'Comparable', 'Queue', 'Deque', 'ArrayDeque', 'Stack',
  'Vector', 'Hashtable', 'Enumeration', 'Future', 'Callable', 'Supplier', 'Consumer', 'Function', 'Predicate', 'ThreadLocal', 'Class']);
rule({
  id: 'raw-type', type: 'S', sev: 'MA', debt: 5, tags: ['generics'], ref: 'S3740',
  en: ['Raw types should not be used', 'Raw generic types bypass compile-time type checks and lead to ClassCastException later.', 'Add the type arguments (or <?>).'],
  ko: ['raw 타입을 쓰면 안 됩니다', 'raw 제네릭 타입은 컴파일 시 타입 검사를 건너뛰어 나중에 ClassCastException을 일으킵니다.', '타입 인자(또는 <?>)를 붙이세요.'],
  msg: ['Provide the parametrized type for this generic "{0}".', '제네릭 "{0}"에 타입 인자를 지정하세요.'],
  on: {
    Local(n, cx) { rawCheck(n.type, cx); },
    Field(n, cx) { rawCheck(n.type, cx); },
    Param(n, cx) { const p = cx.parent(); if (p && p.k === 'Method' && !H.isOverride(p)) rawCheck(n.type, cx); },
    Method(n, cx) { if (!H.isOverride(n)) rawCheck(n.ret, cx); },
  },
  bad: { java: jm(`    java.util.List names = new java.util.ArrayList<String>(); // Noncompliant`) },
  good: { java: jm(`    java.util.List<String> names = new java.util.ArrayList<>();`) },
});
function rawCheck(t, cx) {
  if (cx.kt || !t || t.prim || t.dims) return;
  const nm = A.typeName(t);
  if (!GENERIC_JDK.has(nm) || (t.args && t.args.length) || t.name === 'var') return;
  if (nm !== t.name && !/^java\.(util|lang)\./.test(t.name)) return;
  if (cx.proj.info(nm)) return;
  cx.report(t, [nm]);
}

rule({
  id: 'diamond-operator', type: 'S', sev: 'MI', debt: 1, tags: ['clumsy'], ref: 'S2293',
  en: ['The diamond operator ("<>") should be used', 'Repeating the type arguments on the right-hand side adds noise.', 'Use new ArrayList<>().'],
  ko: ['다이아몬드 연산자(<>)를 써야 합니다', '오른쪽에서 타입 인자를 반복하면 잡음만 늘어납니다.', 'new ArrayList<>()로 쓰세요.'],
  msg: ['Replace the type specification in this constructor call with the diamond operator ("<>").', '이 생성자 호출의 타입 지정을 다이아몬드 연산자(<>)로 바꾸세요.'],
  on: {
    Local(n, cx) { diamond(n.type, n.vars, cx); },
    Field(n, cx) { diamond(n.type, n.vars, cx); },
  },
  bad: { java: jm(`    java.util.List<String> names = new java.util.ArrayList<String>(); // Noncompliant`) },
  good: { java: jm(`    java.util.List<String> names = new java.util.ArrayList<>();`) },
});
function diamond(t, vars, cx) {
  if (cx.kt || !t || !t.args || !t.args.length) return;
  for (const v of vars) {
    const e = A.strip(v.init);
    if (e && e.k === 'New' && !e.body && !e.array && e.type.args && e.type.args.length && !e.type.args.diamond) cx.report(e);
  }
}

const IMPL_TYPES = /^(ArrayList|LinkedList|HashMap|TreeMap|LinkedHashMap|HashSet|TreeSet|LinkedHashSet|Vector|Hashtable|ConcurrentHashMap)$/;
rule({
  id: 'implementation-type-in-signature', type: 'S', sev: 'MI', debt: 5, tags: ['design'], ref: 'S1319',
  en: ['Declarations should use Java collection interfaces such as "List" rather than specific implementation classes', 'Exposing ArrayList/HashMap in a public signature ties callers to one implementation.', 'Declare List, Map, Set or Collection instead.'],
  ko: ['선언에는 구체 구현 클래스 대신 List 같은 컬렉션 인터페이스를 써야 합니다', '공개 시그니처에 ArrayList/HashMap을 드러내면 호출자가 한 구현에 묶입니다.', '대신 List, Map, Set, Collection으로 선언하세요.'],
  msg: ['The type of "{0}" should be an interface such as "{1}" rather than the implementation "{2}".', '"{0}"의 타입은 구현 "{2}" 대신 "{1}" 같은 인터페이스여야 합니다.'],
  on: {
    Method(n, cx) {
      if (cx.kt || H.isPrivate(n) || H.isOverride(n)) return;
      const iface = (t) => (/Map$/.test(t) ? 'Map' : /Set$/.test(t) ? 'Set' : /List$|Vector/.test(t) ? 'List' : 'Collection');
      if (n.ret && IMPL_TYPES.test(A.typeName(n.ret))) cx.report(n.ret, [n.name, iface(A.typeName(n.ret)), A.typeName(n.ret)]);
      for (const p of n.params) if (p.type && IMPL_TYPES.test(A.typeName(p.type))) cx.report(p.type, [p.name, iface(A.typeName(p.type)), A.typeName(p.type)]);
    },
  },
  bad: { java: jc(`  public java.util.ArrayList<String> names() { // Noncompliant
    return new java.util.ArrayList<>();
  }`) },
  good: { java: jc(`  public java.util.List<String> names() {
    return new java.util.ArrayList<>();
  }`) },
});

rule({
  id: 'nested-try', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 10, tags: ['confusing'], ref: 'S1141', ktRef: 'S1141',
  en: ['Try-catch blocks should not be nested', 'Nested try blocks make it hard to see which handler deals with which exception.', 'Extract the inner try into its own method.'],
  ko: ['try-catch 블록을 중첩하면 안 됩니다', '중첩된 try는 어느 처리기가 어떤 예외를 다루는지 알기 어렵게 합니다.', '안쪽 try를 별도 메서드로 빼세요.'],
  msg: ['Extract this nested try block into a separate method.', '이 중첩 try 블록을 별도 메서드로 빼세요.'],
  on: {
    Try(n, cx) {
      if (!n.catches.length) return;
      for (let i = cx.stack.length - 2; i >= 0; i--) {
        const x = cx.stack[i];
        if (x.k === 'Method' || x.k === 'Lambda' || x.k === 'Class') return;
        if (x.k === 'Try' && x.catches.length && A.find(x.body, (y) => y === n)) { cx.report(n); return; }
      }
    },
  },
  bad: { java: jm(`    try {
      try { n = Integer.parseInt(s); } // Noncompliant
      catch (NumberFormatException e) { n = 0; }
    } catch (RuntimeException e) { n = -1; }`), kt: km(`    try {
        try { println(s.toInt()) } // Noncompliant
        catch (e: NumberFormatException) { println(0) }
    } catch (e: IllegalStateException) { println(-1) }`) },
  good: { java: jm(`    try { n = Integer.parseInt(s); }
    catch (NumberFormatException e) { n = 0; }`), kt: km(`    try { println(s.toInt()) }
    catch (e: NumberFormatException) { println(0) }`) },
});

rule({
  id: 'catch-rethrow-only', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 5, tags: ['clumsy', 'error-handling'], ref: 'S2737', ktRef: 'S2737',
  en: ['"catch" clauses should do more than rethrow', 'A catch that only rethrows the same exception adds nothing.', 'Remove the catch clause, or handle the exception.'],
  ko: ['catch 절은 다시 던지는 것 이상을 해야 합니다', '같은 예외를 다시 던지기만 하는 catch는 의미가 없습니다.', 'catch 절을 지우거나 예외를 처리하세요.'],
  msg: ['Add logic to this catch clause or eliminate it and rethrow the exception automatically.', '이 catch 절에 처리 로직을 넣거나 절을 지워 예외가 자동으로 전달되게 하세요.'],
  on: {
    Try(n, cx) {
      n.catches.forEach((c, i) => {
        const st = c.body.stmts;
        if (st.length !== 1 || st[0].k !== 'Throw' || A.nameOf(st[0].e) !== c.name) return;
        // a later broader catch would change behaviour if removed
        if (n.catches.slice(i + 1).length) return;
        cx.report(c);
      });
    },
  },
  bad: { java: jm(`    try { n = Integer.parseInt(s); }
    catch (NumberFormatException e) { throw e; } // Noncompliant`), kt: km(`    try { println(s.toInt()) }
    catch (e: NumberFormatException) { throw e } // Noncompliant`) },
  good: { java: jm(`    try { n = Integer.parseInt(s); }
    catch (NumberFormatException e) { throw new IllegalArgumentException("bad number: " + s, e); }`), kt: km(`    try { println(s.toInt()) }
    catch (e: NumberFormatException) { throw IllegalArgumentException("bad: $s", e) }`) },
});

rule({
  id: 'log-and-rethrow', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 10, tags: ['error-handling', 'logging'], ref: 'S2139', ktRef: 'S2139',
  en: ['Exceptions should be either logged or rethrown but not both', 'Logging and rethrowing makes the same error appear several times in the logs.', 'Either log and handle, or rethrow (with context) and let the top level log.'],
  ko: ['예외는 기록하거나 다시 던지되 둘 다 하면 안 됩니다', '기록하고 다시 던지면 같은 오류가 로그에 여러 번 남습니다.', '기록하고 처리하거나, 맥락을 붙여 다시 던지고 최상위에서 기록하세요.'],
  msg: ['Either log this exception and handle it, or rethrow it with some contextual information.', '이 예외를 기록하고 처리하거나 맥락 정보를 붙여 다시 던지세요.'],
  on: {
    Catch(n, cx) {
      const logged = H.findIn(n.body, (x) => x.k === 'Call' && /^(error|warn|warning|info|debug|severe|log|trace)$/.test(x.id || '') && x.o && /log/i.test(A.dotted(x.o) || '') && x.args.some((a) => A.nameOf(a) === n.name));
      if (!logged) return;
      const rethrow = H.findIn(n.body, (x) => x.k === 'Throw' && (A.nameOf(x.e) === n.name || (A.ctorType(x.e) && A.ctorArgs(x.e).some((a) => A.nameOf(a) === n.name))));
      if (rethrow) cx.report(n);
    },
  },
  bad: { java: jc(`  private static final java.util.logging.Logger LOG = java.util.logging.Logger.getLogger("T");
  void m(String s) {
    try { Integer.parseInt(s); }
    catch (NumberFormatException e) { // Noncompliant
      LOG.log(java.util.logging.Level.SEVERE, "bad", e);
      throw e;
    }
  }`), kt: kc(`  private val log = org.slf4j.LoggerFactory.getLogger("T")
  fun m(s: String) {
    try { s.toInt() }
    catch (e: NumberFormatException) { // Noncompliant
      log.error("bad", e)
      throw e
    }
  }`) },
  good: { java: jc(`  private static final java.util.logging.Logger LOG = java.util.logging.Logger.getLogger("T");
  void m(String s) {
    try { Integer.parseInt(s); }
    catch (NumberFormatException e) {
      LOG.log(java.util.logging.Level.SEVERE, "bad", e);
    }
  }`), kt: kc(`  private val log = org.slf4j.LoggerFactory.getLogger("T")
  fun m(s: String) {
    try { s.toInt() }
    catch (e: NumberFormatException) {
      log.error("bad", e)
    }
  }`) },
});

rule({
  id: 'exception-cause-lost', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 10, tags: ['error-handling', 'cwe-778'], ref: 'S1166', ktRef: 'S1166',
  en: ['Exception handlers should preserve the original exceptions', 'Throwing a new exception without the caught one as cause loses the stack trace that explains the failure.', 'Pass the caught exception as the cause: new X("context", e).'],
  ko: ['예외 처리기는 원래 예외를 보존해야 합니다', '잡은 예외를 원인으로 넘기지 않고 새 예외를 던지면 실패를 설명하는 스택 추적을 잃습니다.', '잡은 예외를 원인으로 넘기세요: new X("맥락", e).'],
  msg: ['Either log or rethrow this exception; pass "{0}" as the cause.', '이 예외를 기록하거나 다시 던지세요. "{0}"을(를) 원인으로 넘기세요.'],
  on: {
    Catch(n, cx) {
      if (/^(ignored|expected|_)$/.test(n.name)) return;
      const throws = [];
      H.noNested(n.body, (x) => { if (x.k === 'Throw') throws.push(x); });
      if (!throws.length) return;
      const usesE = (e) => !!A.find(e, (y) => y.k === 'Name' && y.id === n.name && !(isMsgOnly(y, e)));
      for (const t of throws) {
        const ct = A.ctorType(t.e);
        if (!ct) continue;
        if (usesE(t.e)) continue;
        // initCause / addSuppressed elsewhere in the handler
        if (H.findIn(n.body, (x) => x.k === 'Call' && (x.id === 'initCause' || x.id === 'addSuppressed'))) continue;
        if (H.findIn(n.body, (x) => x.k === 'Call' && /^(error|warn|warning|log|severe)$/.test(x.id || '') && x.args.some((a) => A.nameOf(a) === n.name))) continue;
        cx.report(t, [n.name]);
      }
    },
  },
  bad: { java: jm(`    try { n = Integer.parseInt(s); }
    catch (NumberFormatException e) {
      throw new IllegalStateException(e.getMessage()); // Noncompliant
    }`), kt: km(`    try { println(s.toInt()) }
    catch (e: NumberFormatException) {
        throw IllegalStateException("bad number") // Noncompliant
    }`) },
  good: { java: jm(`    try { n = Integer.parseInt(s); }
    catch (NumberFormatException e) {
      throw new IllegalStateException("bad number " + s, e);
    }`), kt: km(`    try { println(s.toInt()) }
    catch (e: NumberFormatException) {
        throw IllegalStateException("bad number", e)
    }`) },
});
// e.getMessage() / e.toString() / e.getLocalizedMessage() only uses the message
function isMsgOnly(nameNode, root) {
  let found = false;
  A.forEach(root, (x) => {
    if ((x.k === 'Call' || x.k === 'Sel') && x.o === nameNode && /^(getMessage|toString|getLocalizedMessage|message|localizedMessage)$/.test(x.id)) found = true;
    return !found;
  });
  return found;
}

rule({
  id: 'exception-class-naming', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 5, tags: ['convention', 'error-handling'], ref: 'S2166', ktRef: 'S2166',
  en: ['Classes named like "Exception" should extend "Exception" or a subclass', 'A class named ...Exception that is not throwable misleads readers.', 'Extend an exception class or rename the class.'],
  ko: ['Exception처럼 이름 지은 클래스는 Exception이나 그 하위 클래스를 상속해야 합니다', '...Exception이라는 이름인데 던질 수 없는 클래스는 읽는 사람을 오도합니다.', '예외 클래스를 상속하거나 클래스 이름을 바꾸세요.'],
  msg: ['Rename this class to remove "Exception" or correct its inheritance.', '이 클래스 이름에서 Exception을 빼거나 상속 관계를 고치세요.'],
  on: {
    Class(n, cx) {
      if (!/Exception$/.test(n.name) || n.kind !== 'class') return;
      if (n.ext || (n.supers && n.supers.length)) return;
      cx.report({ line: n.nameLine || n.line, col: n.col });
    },
  },
  bad: { java: 'class ParseException { // Noncompliant\n  String detail;\n}\n', kt: 'class ParseException { // Noncompliant\n  val detail = ""\n}\n' },
  good: { java: 'class ParseException extends Exception {\n  ParseException(String m) { super(m); }\n}\n', kt: 'class ParseException(m: String) : Exception(m)\n' },
});

rule({
  id: 'return-null-collection', type: 'S', sev: 'MA', debt: 30, tags: ['cwe-476'], ref: 'S1168',
  en: ['Empty arrays and collections should be returned instead of null', 'Returning null for "no elements" forces every caller to add a null check, and one will forget.', 'Return an empty array or collection.'],
  ko: ['null 대신 빈 배열과 컬렉션을 반환해야 합니다', '"요소 없음"에 null을 반환하면 모든 호출자가 null 검사를 해야 하고 누군가는 잊습니다.', '빈 배열이나 컬렉션을 반환하세요.'],
  msg: ['Return an empty {0} instead of null.', 'null 대신 빈 {0}을(를) 반환하세요.'],
  on: {
    Return(n, cx) {
      const m = cx.method;
      if (!m || !m.ret || !A.isNull(n.e) || cx.enclosing(['Lambda']) || m.lang === 'kt') return;
      if (A.hasAnno(m, ['Nullable', 'CheckForNull'])) return;
      if (m.ret.dims) { cx.report(n, ['array']); return; }
      if (/^(List|Set|Map|Collection|Iterable|ArrayList|HashMap|HashSet|SortedSet|SortedMap|Queue|Deque)$/.test(A.typeName(m.ret))) cx.report(n, ['collection']);
    },
  },
  bad: { java: jc(`  java.util.List<String> names(boolean b) {
    if (b) { return java.util.List.of("a"); }
    return null; // Noncompliant
  }`) },
  good: { java: jc(`  java.util.List<String> names(boolean b) {
    if (b) { return java.util.List.of("a"); }
    return java.util.Collections.emptyList();
  }`) },
});

rule({
  id: 'boolean-method-returns-null', type: 'S', sev: 'CR', debt: 5, tags: ['pitfall'], ref: 'S2447',
  en: ['Null should not be returned from a "Boolean" method', 'Callers use the result in conditions, where null unboxing throws NullPointerException.', 'Return true/false, or Optional<Boolean> if "unknown" is needed.'],
  ko: ['Boolean 메서드는 null을 반환하면 안 됩니다', '호출자가 결과를 조건에 쓰는데 null을 언박싱하면 NullPointerException이 납니다.', 'true/false를 반환하고 "알 수 없음"이 필요하면 Optional<Boolean>을 쓰세요.'],
  on: {
    Return(n, cx) {
      const m = cx.method;
      if (!m || !m.ret || !A.isNull(n.e) || cx.enclosing(['Lambda']) || m.lang === 'kt') return;
      if (A.typeName(m.ret) === 'Boolean' && !A.hasAnno(m, ['Nullable', 'CheckForNull'])) cx.report(n);
    },
  },
  bad: { java: jc(`  Boolean valid(String s) {
    if (s == null) { return null; } // Noncompliant
    return !s.isEmpty();
  }`) },
  good: { java: jc(`  boolean valid(String s) {
    if (s == null) { return false; }
    return !s.isEmpty();
  }`) },
});

rule({
  id: 'inner-class-could-be-static', type: 'S', sev: 'MI', debt: 15, tags: ['performance'], ref: 'S2694',
  en: ['Inner classes which do not reference their owning classes should be "static"', 'A non-static inner class keeps a hidden reference to the outer instance, wasting memory and risking leaks.', 'Make the nested class static.'],
  ko: ['바깥 클래스를 참조하지 않는 내부 클래스는 static이어야 합니다', 'static이 아닌 내부 클래스는 바깥 인스턴스에 대한 숨은 참조를 쥐어 메모리를 낭비하고 누수 위험이 있습니다.', '중첩 클래스를 static으로 하세요.'],
  msg: ['Make this a "static" inner class.', '이것을 static 내부 클래스로 하세요.'],
  on: {
    Class(n, cx) {
      if (cx.kt || n.kind !== 'class' || n.anon || n.mods.has('static')) return;
      const outer = cx.parent();
      if (!outer || outer.k !== 'Class' || outer.kind === 'interface') return;
      if (n.ext && cx.proj.info(A.typeName(n.ext)) && !cx.proj.info(A.typeName(n.ext)).decl.mods.has('static') && cx.proj.info(A.typeName(n.ext)).outer) return;
      const outerNames = new Set();
      for (const m of outer.members) {
        if (m.k === 'Field' && !H.isStatic(m)) for (const v of m.vars) outerNames.add(v.name);
        if (m.k === 'Method' && !H.isStatic(m)) outerNames.add(m.name);
      }
      const own = new Set();
      for (const m of n.members) {
        if (m.k === 'Field') for (const v of m.vars) own.add(v.name);
        if (m.k === 'Method') own.add(m.name);
      }
      let uses = false;
      A.forEach(n, (x) => {
        if (uses) return false;
        if (x.k === 'This' && x.q) uses = true;
        if (x.k === 'Name' && outerNames.has(x.id) && !own.has(x.id)) uses = true;
        if (x.k === 'Call' && !x.o && outerNames.has(x.id) && !own.has(x.id)) uses = true;
        if (x.k === 'New' && x.type && cx.proj.info(A.typeName(x.type)) && cx.proj.info(A.typeName(x.type)).outer && !cx.proj.info(A.typeName(x.type)).decl.mods.has('static')) uses = true;
        return true;
      });
      if (!uses) cx.report({ line: n.nameLine || n.line, col: n.col });
    },
  },
  bad: { java: jc(`  class Point { // Noncompliant
    int x, y;
  }`) },
  good: { java: jc(`  private int scale = 2;
  static class Point { int x, y; }
  class Scaled { int value() { return scale * 3; } }`) },
});

rule({
  id: 'field-could-be-local', type: 'S', sev: 'MI', debt: 5, tags: ['pitfall'], ref: 'S1450',
  en: ['Private fields only used as local variables in methods should become local variables', 'A field that one method always writes before reading is really a local variable, and it makes the class non-reentrant.', 'Turn it into a local variable.'],
  ko: ['메서드 안에서 지역 변수처럼만 쓰는 private 필드는 지역 변수로 바꿔야 합니다', '한 메서드가 항상 쓰고 나서 읽는 필드는 사실 지역 변수이며 클래스를 재진입 불가로 만듭니다.', '지역 변수로 바꾸세요.'],
  msg: ['Remove the "{0}" field and declare it as a local variable in the relevant methods.', '"{0}" 필드를 지우고 해당 메서드의 지역 변수로 선언하세요.'],
  on: {
    Class(n, cx) {
      if (cx.kt || n.anon) return;
      for (const m of n.members) {
        if (m.k !== 'Field' || !H.isPrivate(m) || H.isStatic(m) || m.annos.length || m.vars.length !== 1 || m.vars[0].init) continue;
        const name = m.vars[0].name;
        const users = n.members.filter((x) => (x.k === 'Method' || x.k === 'Init') && x.body && A.find(x.body, (y) => (y.k === 'Name' && y.id === name) || (y.k === 'Sel' && y.id === name && A.strip(y.o).k === 'This')));
        if (users.length !== 1) continue;
        const meth = users[0];
        if (meth.k !== 'Method') continue;
        if (A.find(meth.body, (y) => (y.k === 'Lambda' || (y.k === 'New' && y.body)) && A.find(y, (z) => z.k === 'Name' && z.id === name))) continue;
        if (n.members.some((x) => x.k === 'Class' && A.find(x, (y) => y.k === 'Name' && y.id === name))) continue;
        // first statement-level reference must be a plain assignment
        const firstStmt = meth.body.stmts.find((s) => A.find(s, (y) => (y.k === 'Name' && y.id === name) || (y.k === 'Sel' && y.id === name)));
        const e = firstStmt && firstStmt.k === 'ExprStmt' ? A.strip(firstStmt.e) : null;
        if (e && e.k === 'Assign' && e.op === '=' && A.varKey(e.t) && A.varKey(e.t).replace(/^this\./, '') === name && !A.find(e.v, (y) => y.k === 'Name' && y.id === name)) {
          cx.report(m.vars[0], [name]);
        }
      }
    },
  },
  bad: { java: jc(`  private int total; // Noncompliant
  int sum(int[] xs) {
    total = 0;
    for (int x : xs) { total += x; }
    return total;
  }`) },
  good: { java: jc(`  private int total;
  void add(int x) { total += x; }
  int get() { return total; }`) },
});

rule({
  id: 'lambda-too-long', type: 'S', sev: 'MI', debt: 20, tags: ['brain-overload'], ref: 'S5612',
  en: ['Lambdas should not have too many lines', 'Long lambdas hide logic inside an expression and cannot be reused or tested on their own.', 'Move the body into a named method and use a method reference.'],
  ko: ['람다가 너무 길면 안 됩니다', '긴 람다는 로직을 식 안에 숨기고 따로 재사용·테스트할 수 없습니다.', '본문을 이름 있는 메서드로 옮기고 메서드 참조를 쓰세요.'],
  msg: ['Reduce this lambda expression number of lines from {0} to at most 10.', '이 람다 식의 줄 수를 {0}에서 10 이하로 줄이세요.'],
  on: { Lambda(n, cx) { if (cx.kt || n.kt) return; const l = (n.el || n.line) - n.line + 1; if (l > 10) cx.report(n, [l]); } },
  bad: { java: jm(`    Runnable r = () -> { // Noncompliant\n${'      System.out.println(1);\n'.repeat(11)}    };`) },
  good: { java: jm(`    Runnable r = () -> System.out.println(1);`) },
});

rule({
  id: 'anonymous-class-too-long', type: 'S', sev: 'MA', debt: 20, tags: ['brain-overload'], ref: 'S1188',
  en: ['Anonymous classes should not have too many lines', 'Long anonymous classes are hard to read in place and cannot be reused.', 'Turn it into a named (nested) class.'],
  ko: ['익명 클래스가 너무 길면 안 됩니다', '긴 익명 클래스는 그 자리에서 읽기 어렵고 재사용할 수 없습니다.', '이름 있는 (중첩) 클래스로 바꾸세요.'],
  msg: ['Reduce this anonymous class number of lines from {0} to at most 20, or make it a named class.', '이 익명 클래스의 줄 수를 {0}에서 20 이하로 줄이거나 이름 있는 클래스로 만드세요.'],
  on: { New(n, cx) { if (cx.kt || !n.body) return; const l = (n.body.el || n.body.line) - n.body.line + 1; if (l > 20) cx.report(n, [l]); } },
  bad: { java: jm(`    Runnable r = new Runnable() { // Noncompliant
      public void run() {\n${'        System.out.println(1);\n'.repeat(20)}      }
    };`) },
  good: { java: jm(`    Runnable r = new Runnable() {
      public void run() { System.out.println(1); }
    };`) },
});

rule({
  id: 'boolean-expression-too-complex', langs: ['java', 'kt'], type: 'S', sev: 'CR', debt: 5, tags: ['brain-overload'], ref: 'S1067', ktRef: 'S1067',
  en: ['Expressions should not be too complex', 'More than three && / || operators in one expression are hard to understand and test.', 'Extract parts into well-named variables or methods.'],
  ko: ['식이 너무 복잡하면 안 됩니다', '한 식에 && / ||가 셋보다 많으면 이해하고 테스트하기 어렵습니다.', '일부를 이름 있는 변수나 메서드로 빼세요.'],
  msg: ['Reduce the number of conditional operators ({0}) used in the expression (maximum allowed 3).', '식의 조건 연산자 수({0})를 줄이세요(최대 3).'],
  on: {
    Bin(n, cx) {
      if (n.op !== '&&' && n.op !== '||') return;
      const p = cx.parent();
      if (p && (p.k === 'Bin' && (p.op === '&&' || p.op === '||') || p.k === 'Paren' || p.k === 'Un')) {
        // only the outermost condition expression
        for (let i = cx.stack.length - 2; i >= 0; i--) {
          const x = cx.stack[i];
          if (x.k === 'Bin' && (x.op === '&&' || x.op === '||')) return;
          if (x.k !== 'Paren' && x.k !== 'Un') break;
        }
      }
      let c = 0;
      A.forEach(n, (x) => { if (x.k === 'Lambda' || x.k === 'Call') return x === n; if (x.k === 'Bin' && (x.op === '&&' || x.op === '||')) c++; return true; });
      if (c > 3) cx.report(n, [c]);
    },
  },
  bad: { java: jm(`    if (n > 0 && n < 10 || n == 20 && s != null || s.isEmpty()) { n++; } // Noncompliant`), kt: km(`    if (n > 0 && n < 10 || n == 20 && s.isNotEmpty() || s.isEmpty()) println(s) // Noncompliant`) },
  good: { java: jm(`    boolean small = n > 0 && n < 10;
    if (small || n == 20) { n++; }`), kt: km(`    val small = n > 0 && n < 10
    if (small || n == 20) println(s)`) },
});

rule({
  id: 'multiple-variables-per-declaration', type: 'S', sev: 'MI', debt: 2, tags: ['convention'], ref: 'S1659',
  en: ['Multiple variables should not be declared on the same line', 'Declaring several variables at once hides their types and initial values.', 'Declare one variable per statement.'],
  ko: ['한 줄에 여러 변수를 선언하면 안 됩니다', '여러 변수를 한꺼번에 선언하면 타입과 초기값이 잘 보이지 않습니다.', '문장마다 변수 하나씩 선언하세요.'],
  msg: ['Declare "{0}" on a separate line.', '"{0}"을(를) 다른 줄에 선언하세요.'],
  on: {
    Local(n, cx) { if (cx.kt || n.vars.length < 2) return; const p = cx.parent(); if (p && (p.k === 'For' || p.k === 'Try')) return; cx.report(n.vars[1], [n.vars[1].name]); },
    Field(n, cx) { if (cx.kt || n.vars.length < 2) return; cx.report(n.vars[1], [n.vars[1].name]); },
  },
  bad: { java: jm(`    int a = 1, b = 2; // Noncompliant
    System.out.println(a + b);`) },
  good: { java: jm(`    int a = 1;
    int b = 2;
    System.out.println(a + b);
    for (int i = 0, j = 2; i < j; i++) { n++; }`) },
});

rule({
  id: 'multiple-statements-per-line', type: 'S', sev: 'MA', debt: 1, tags: ['convention'], ref: 'S122',
  en: ['Statements should be on separate lines', 'Several statements on one line are easy to overlook when reading or debugging.', 'Put each statement on its own line.'],
  ko: ['문장은 줄을 나눠 써야 합니다', '한 줄에 여러 문장이 있으면 읽거나 디버깅할 때 놓치기 쉽습니다.', '문장마다 줄을 나누세요.'],
  msg: ['Reformat the code to have only one statement per line.', '한 줄에 문장 하나만 오도록 코드를 고치세요.'],
  on: {
    Block(n, cx) {
      if (cx.kt) return;
      if (n.line === n.el) return; // one-line blocks such as { a(); b(); } in lambdas
      for (let i = 1; i < n.stmts.length; i++) {
        const a = n.stmts[i - 1];
        const b = n.stmts[i];
        if (b.line === (a.el || a.line) && a.k !== 'Empty' && b.k !== 'Empty') { cx.report(b); break; }
      }
    },
  },
  bad: { java: jm(`    n++;
    n += 2; System.out.println(n); // Noncompliant`) },
  good: { java: jm(`    n++;
    n += 2;
    System.out.println(n);`) },
});

rule({
  id: 'missing-braces', type: 'S', sev: 'CR', debt: 2, tags: ['pitfall'], ref: 'S121',
  en: ['Control structures should use curly braces', 'Without braces, a statement added later looks like part of the branch but is not.', 'Always wrap bodies of if/else/for/while/do in braces.'],
  ko: ['제어 구조에는 중괄호를 써야 합니다', '중괄호가 없으면 나중에 추가한 문장이 분기의 일부처럼 보이지만 아닙니다.', 'if/else/for/while/do 본문을 항상 중괄호로 감싸세요.'],
  msg: ['Add curly braces around the nested statement(s) in this "{0}" block.', '이 "{0}" 블록의 중첩 문장을 중괄호로 감싸세요.'],
  on: {
    If(n, cx) {
      if (cx.kt) return;
      if (n.t && n.t.k !== 'Block' && n.t.k !== 'Empty') { cx.report(n, ['if']); return; }
      if (n.f && n.f.k !== 'Block' && n.f.k !== 'If' && n.f.k !== 'Empty') cx.report({ line: n.elseLine || n.f.line, col: 1 }, ['else']);
    },
    For(n, cx) { if (!cx.kt && n.body && n.body.k !== 'Block' && n.body.k !== 'Empty') cx.report(n, ['for']); },
    ForEach(n, cx) { if (!cx.kt && n.body && n.body.k !== 'Block' && n.body.k !== 'Empty') cx.report(n, ['for']); },
    While(n, cx) { if (!cx.kt && n.body && n.body.k !== 'Block' && n.body.k !== 'Empty') cx.report(n, ['while']); },
    Do(n, cx) { if (!cx.kt && n.body && n.body.k !== 'Block') cx.report(n, ['do']); },
  },
  bad: { java: jm(`    if (n > 0) // Noncompliant
      n++;`) },
  good: { java: jm(`    if (n > 0) {
      n++;
    } else if (n < 0) {
      n--;
    }`) },
});

rule({
  id: 'parse-or-unbox', type: 'S', sev: 'MI', debt: 5, tags: ['performance', 'clumsy'], ref: 'S2130',
  en: ['Parsing should be used to convert "Strings" to primitives', 'Integer.valueOf(s).intValue() boxes needlessly; Integer.parseInt(s) returns the primitive directly.', 'Use the parseXxx method.'],
  ko: ['String을 기본형으로 바꿀 때는 파싱 메서드를 써야 합니다', 'Integer.valueOf(s).intValue()는 불필요하게 박싱하며 Integer.parseInt(s)가 바로 기본형을 반환합니다.', 'parseXxx 메서드를 쓰세요.'],
  msg: ['Use "{0}.{1}" for this string-to-{2} conversion.', '이 문자열→{2} 변환에는 "{0}.{1}"을(를) 쓰세요.'],
  on: {
    Call(n, cx) {
      if (!/^(intValue|longValue|doubleValue|floatValue|shortValue|byteValue|booleanValue)$/.test(n.id || '') || !n.o || n.args.length) return;
      const o = A.strip(n.o);
      const box = o.k === 'Call' && o.id === 'valueOf' ? A.simpleName(A.dotted(o.o) || '') : A.ctorType(o);
      if (!box || !/^(Integer|Long|Double|Float|Short|Byte|Boolean)$/.test(box) || A.ctorArgs(o).length !== 1) return;
      const at = cx.typeOf(A.ctorArgs(o)[0]);
      if (at !== 'String' && !A.isStrLit(A.ctorArgs(o)[0])) return;
      const parse = { Integer: 'parseInt', Long: 'parseLong', Double: 'parseDouble', Float: 'parseFloat', Short: 'parseShort', Byte: 'parseByte', Boolean: 'parseBoolean' }[box];
      cx.report(n, [box, parse, n.id.replace('Value', '')]);
    },
  },
  bad: { java: jm(`    int v = Integer.valueOf(s).intValue(); // Noncompliant`) },
  good: { java: jm(`    int v = Integer.parseInt(s);`) },
});

rule({
  id: 'valueof-in-concat', type: 'S', sev: 'MI', debt: 5, tags: ['clumsy'], ref: 'S1153',
  en: ['String.valueOf() should not be appended to a String', 'String concatenation already converts its operands; String.valueOf/toString adds noise.', 'Concatenate the value directly.'],
  ko: ['String.valueOf()를 문자열에 이어 붙이면 안 됩니다', '문자열 연결은 이미 피연산자를 변환하므로 String.valueOf/toString은 잡음입니다.', '값을 바로 이어 붙이세요.'],
  msg: ['Directly append the argument of String.valueOf().', 'String.valueOf()의 인자를 바로 이어 붙이세요.'],
  on: {
    Bin(n, cx) {
      if (n.op !== '+') return;
      const isStr = (e) => H.stringish(cx, e);
      for (const [side, other] of [[n.r, n.l], [n.l, n.r]]) {
        const s = A.strip(side);
        if (s.k === 'Call' && s.id === 'valueOf' && A.simpleName(A.dotted(s.o) || '') === 'String' && s.args.length === 1 && isStr(other)) {
          const at = cx.typeOf(s.args[0]);
          if (at === 'char[]') continue;
          cx.report(s);
        }
      }
    },
  },
  bad: { java: jm(`    String msg = "count: " + String.valueOf(n); // Noncompliant`) },
  good: { java: jm(`    String msg = "count: " + n;`) },
});

rule({
  id: 'keyset-then-get', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 5, tags: ['performance'], ref: 'S2864', ktRef: 'S2864',
  en: ['"entrySet()" should be iterated when both the key and value are needed', 'Iterating keySet() and calling get(key) does a second lookup for every entry.', 'Iterate entrySet() (Kotlin: for ((k, v) in map)).'],
  ko: ['키와 값이 모두 필요하면 entrySet()을 순회해야 합니다', 'keySet()을 돌며 get(key)를 부르면 항목마다 조회를 한 번 더 합니다.', 'entrySet()을 순회하세요(Kotlin은 for ((k, v) in map)).'],
  msg: ['Iterate over the "entrySet" instead of the "keySet".', 'keySet 대신 entrySet을 순회하세요.'],
  on: {
    ForEach(n, cx) {
      const it = A.strip(n.iter);
      let map = null;
      if (it.k === 'Call' && it.id === 'keySet' && it.args.length === 0) map = it.o;
      else if (it.k === 'Sel' && it.id === 'keys' && cx.kt) map = it.o;
      if (!map || !A.varKey(map) || n.vars.length !== 1) return;
      const k = n.vars[0].name;
      const get = A.find(n.body, (x) => (x.k === 'Call' && x.id === 'get' && x.args.length === 1 && A.nameOf(x.args[0]) === k && A.eq(x.o, map)) || (x.k === 'Idx' && A.eq(x.o, map) && A.nameOf(x.i) === k));
      if (get) cx.report(n);
    },
  },
  bad: { java: jm(`    java.util.Map<String, Integer> m = new java.util.HashMap<>();
    for (String k : m.keySet()) { // Noncompliant
      System.out.println(k + m.get(k));
    }`), kt: km(`    val m = mapOf("a" to 1)
    for (k in m.keys) { // Noncompliant
        println(k + m[k])
    }`) },
  good: { java: jm(`    java.util.Map<String, Integer> m = new java.util.HashMap<>();
    for (java.util.Map.Entry<String, Integer> e : m.entrySet()) {
      System.out.println(e.getKey() + e.getValue());
    }`), kt: km(`    val m = mapOf("a" to 1)
    for ((k, v) in m) {
        println(k + v)
    }`) },
});

rule({
  id: 'replaceall-literal', type: 'S', sev: 'CR', debt: 2, tags: ['performance', 'regex'], ref: 'S5361',
  en: ['"String#replace" should be preferred to "String#replaceAll"', 'replaceAll compiles a regular expression; with a plain literal, replace() does the same faster.', 'Use replace().'],
  ko: ['String#replaceAll보다 String#replace를 써야 합니다', 'replaceAll은 정규식을 컴파일하며 평범한 리터럴이면 replace()가 같은 일을 더 빨리 합니다.', 'replace()를 쓰세요.'],
  msg: ['Replace this call to "replaceAll()" by a call to the "replace()" method.', '이 replaceAll() 호출을 replace() 호출로 바꾸세요.'],
  on: {
    Call(n, cx) {
      if (n.id !== 'replaceAll' || n.args.length !== 2 || !A.isStrLit(n.args[0])) return;
      if (cx.typeOf(n.o) !== 'String') return;
      const re = A.strip(n.args[0]).v;
      const rep = A.strip(n.args[1]);
      if (/[\\^$.|?*+()[\]{}]/.test(re)) return;
      if (rep.k === 'Lit' && /[$\\]/.test(rep.v)) return;
      cx.report(n);
    },
  },
  bad: { java: jm(`    String t = s.replaceAll("abc", "x"); // Noncompliant`) },
  good: { java: jm(`    String t = s.replace("abc", "x");
    String u = s.replaceAll("\\\\s+", " ");`) },
});

rule({
  id: 'stream-peek', type: 'S', sev: 'MA', debt: 5, tags: ['java8'], ref: 'S3864',
  en: ['"Stream.peek" should be used with caution', 'peek() exists for debugging; its action may run partially or not at all depending on the terminal operation.', 'Do side effects in forEach or map instead.'],
  ko: ['Stream.peek는 조심해서 써야 합니다', 'peek()은 디버깅용이며 종단 연산에 따라 동작이 일부만 실행되거나 전혀 실행되지 않을 수 있습니다.', '부수 효과는 forEach나 map에서 하세요.'],
  msg: ['Remove this use of "Stream.peek".', '이 Stream.peek 사용을 지우세요.'],
  on: { Call(n, cx) { if (n.id === 'peek' && n.args.length === 1 && n.o && (cx.typeOf(n.o) === 'Stream' || A.find(n.o, (x) => x.k === 'Call' && /^(stream|parallelStream)$/.test(x.id)))) cx.report(n); } },
  bad: { java: jm(`    long c = list.stream().peek(System.out::println).count(); // Noncompliant`) },
  good: { java: jm(`    list.stream().forEach(System.out::println);`) },
});

rule({
  id: 'stream-anymatch', type: 'S', sev: 'MI', debt: 5, tags: ['java8', 'performance'], ref: 'S4034',
  en: ['"Stream" call chains should be simplified when possible', 'filter(...).findFirst().isPresent() and count() > 0 can be expressed with anyMatch, which stops early.', 'Use anyMatch / noneMatch.'],
  ko: ['가능하면 Stream 호출 체인을 단순화해야 합니다', 'filter(...).findFirst().isPresent()와 count() > 0은 일찍 멈추는 anyMatch로 표현할 수 있습니다.', 'anyMatch / noneMatch를 쓰세요.'],
  msg: ['Use "anyMatch" instead of this chain.', '이 체인 대신 anyMatch를 쓰세요.'],
  on: {
    Call(n, cx) {
      if ((n.id === 'isPresent' || n.id === 'isEmpty') && n.args.length === 0) {
        const f = A.strip(n.o);
        if (f && f.k === 'Call' && (f.id === 'findFirst' || f.id === 'findAny') && A.strip(f.o).k === 'Call' && A.strip(f.o).id === 'filter') cx.report(n);
      }
    },
    Bin(n, cx) {
      if (!['>', '!=', '=='].includes(n.op) || !A.isLit(n.r) || A.strip(n.r).v !== 0) return;
      const l = A.strip(n.l);
      if (l.k === 'Call' && l.id === 'count' && l.args.length === 0 && A.strip(l.o).k === 'Call' && A.strip(l.o).id === 'filter') cx.report(n);
    },
  },
  bad: { java: jm(`    boolean any = list.stream().filter(String::isEmpty).findFirst().isPresent(); // Noncompliant`) },
  good: { java: jm(`    boolean any = list.stream().anyMatch(String::isEmpty);`) },
});

rule({
  id: 'indexof-positive-check', langs: ['java', 'kt'], type: 'S', sev: 'CR', debt: 2, tags: ['suspicious'], ref: 'S2692', ktRef: 'S2692',
  en: ['"indexOf" checks should not be for positive numbers', 'indexOf(x) > 0 misses a match at position 0.', 'Use >= 0, or contains().'],
  ko: ['indexOf 검사는 양수인지로 하면 안 됩니다', 'indexOf(x) > 0은 위치 0의 일치를 놓칩니다.', '>= 0이나 contains()를 쓰세요.'],
  msg: ['0 is a valid index, but this check ignores it.', '0도 유효한 인덱스인데 이 검사는 그것을 무시합니다.'],
  on: {
    Bin(n, cx) {
      if (n.op !== '>' || !A.isLit(n.r) || A.strip(n.r).v !== 0) return;
      const l = A.strip(n.l);
      if (l.k === 'Call' && l.id === 'indexOf' && l.args.length === 1) cx.report(n);
    },
  },
  bad: { java: jm(`    if (s.indexOf("x") > 0) { n++; } // Noncompliant`), kt: km(`    if (s.indexOf("x") > 0) println(s) // Noncompliant`) },
  good: { java: jm(`    if (s.indexOf("x") >= 0) { n++; }`), kt: km(`    if (s.contains("x")) println(s)`) },
});

rule({
  id: 'method-named-like-object-method', type: 'S', sev: 'MA', debt: 10, tags: ['pitfall'], ref: 'S1221',
  en: ['Methods should not be named "tostring", "hashcode" or "equal"', 'These look like the Object methods but do not override them, so they are never called by collections or string conversion.', 'Rename the method or fix the case/signature to override.'],
  ko: ['메서드 이름을 tostring, hashcode, equal로 지으면 안 됩니다', 'Object 메서드처럼 보이지만 재정의하지 않아 컬렉션이나 문자열 변환에서 호출되지 않습니다.', '이름을 바꾸거나 대소문자/시그니처를 고쳐 재정의하세요.'],
  msg: ['Either override "{1}" or rename this method "{0}".', '"{1}"을(를) 재정의하거나 이 메서드 "{0}"의 이름을 바꾸세요.'],
  on: {
    Method(n, cx) {
      if (cx.kt) return;
      const m = { tostring: 'toString', hashcode: 'hashCode' }[n.name] || (n.name === 'equal' && n.params.length === 1 ? 'equals' : null);
      if (m && n.name !== m) cx.report(nameLoc(n), [n.name, m]);
    },
  },
  bad: { java: jc(`  public int hashcode() { return 1; } // Noncompliant`) },
  good: { java: jc(`  @Override public int hashCode() { return 1; }
  @Override public boolean equals(Object o) { return o == this; }`) },
});

rule({
  id: 'method-named-like-class', type: 'S', sev: 'MA', debt: 5, tags: ['confusing'], ref: 'S1223',
  en: ['Non-constructor methods should not have the same name as the enclosing class', 'A method named like its class looks like a constructor but is not.', 'Rename the method, or remove the return type if it should be a constructor.'],
  ko: ['생성자가 아닌 메서드가 클래스와 같은 이름이면 안 됩니다', '클래스와 같은 이름의 메서드는 생성자처럼 보이지만 아닙니다.', '메서드 이름을 바꾸거나 생성자라면 반환 타입을 지우세요.'],
  msg: ['Rename this method; it has the same name as its class.', '클래스와 이름이 같은 이 메서드의 이름을 바꾸세요.'],
  on: { Method(n, cx) { if (!n.ctor && cx.cls && n.name === cx.cls.name && !cx.kt) cx.report(nameLoc(n)); } },
  bad: { java: jc(`  void T() { } // Noncompliant`) },
  good: { java: jc(`  T() { }`) },
});

rule({
  id: 'override-only-calls-super', langs: ['java', 'kt'], type: 'S', sev: 'MI', debt: 5, tags: ['redundant'], ref: 'S1185', ktRef: 'S1185',
  en: ['Overriding methods should do more than simply call the same method in the super class', 'An override that only delegates to super adds code and changes nothing.', 'Remove the override.'],
  ko: ['재정의 메서드는 상위 클래스의 같은 메서드를 호출하는 것 이상을 해야 합니다', 'super에 위임만 하는 재정의는 코드만 늘리고 아무것도 바꾸지 않습니다.', '재정의를 지우세요.'],
  msg: ['Remove this method to simply inherit it.', '이 메서드를 지워 그대로 상속받으세요.'],
  on: {
    Method(n, cx) {
      if (!n.body || n.body.stmts.length !== 1 || !H.isOverride(n)) return;
      if (n.annos.some((a) => A.annoName(a) !== 'Override') || n.mods.has('final') || n.mods.has('synchronized')) return;
      if (cx.unit.comments.some((c) => c.doc && c.endLine === (n.annos.length ? n.annos[0].line : n.line) - 1)) return;
      const s = n.body.stmts[0];
      const e = s.k === 'Return' ? A.strip(s.e) : s.k === 'ExprStmt' ? A.strip(s.e) : null;
      if (!e || e.k !== 'Call' || e.id !== n.name || !e.o || A.strip(e.o).k !== 'Super') return;
      if (e.args.length !== n.params.length || !e.args.every((a, i) => A.nameOf(a) === n.params[i].name)) return;
      cx.report(nameLoc(n));
    },
  },
  bad: { java: `class Base { void run(int x) { } }
class T extends Base {
  @Override
  void run(int x) { // Noncompliant
    super.run(x);
  }
}
`, kt: `open class Base { open fun run(x: Int) {} }
class T : Base() {
  override fun run(x: Int) { // Noncompliant
    super.run(x)
  }
}
` },
  good: { java: `class Base { void run(int x) { } }
class T extends Base {
  @Override
  void run(int x) {
    super.run(x + 1);
  }
}
`, kt: `open class Base { open fun run(x: Int) {} }
class T : Base() {
  override fun run(x: Int) {
    super.run(x + 1)
  }
}
` },
});

rule({
  id: 'notify-instead-of-notifyall', type: 'S', sev: 'MA', debt: 5, tags: ['multi-threading'], ref: 'S2446',
  en: ['"notifyAll()" should be used instead of "notify()"', 'notify() wakes one arbitrary thread, which may not be the one able to proceed, leading to stalls.', 'Use notifyAll().'],
  ko: ['notify() 대신 notifyAll()을 써야 합니다', 'notify()는 임의의 스레드 하나만 깨워 진행할 수 있는 스레드가 아니면 멈춤이 생깁니다.', 'notifyAll()을 쓰세요.'],
  msg: ['"notify" may not wake up the appropriate thread.', 'notify는 알맞은 스레드를 깨우지 못할 수 있습니다.'],
  on: { Call(n, cx) { if (n.id === 'notify' && n.args.length === 0 && !cx.kt) cx.report(n); } },
  bad: { java: jc(`  synchronized void done() {
    notify(); // Noncompliant
  }`) },
  good: { java: jc(`  synchronized void done() {
    notifyAll();
  }`) },
});

rule({
  id: 'thread-start-in-constructor', type: 'S', sev: 'CR', debt: 5, tags: ['multi-threading'], ref: 'S2693',
  en: ['Threads should not be started in constructors', 'The new thread may see the object before construction finishes, including in subclasses.', 'Start the thread from a separate start() method or factory.'],
  ko: ['생성자에서 스레드를 시작하면 안 됩니다', '새 스레드가 생성이 끝나기 전의 객체(하위 클래스 포함)를 볼 수 있습니다.', '별도의 start() 메서드나 팩터리에서 스레드를 시작하세요.'],
  msg: ['Move this "start" call to another method.', '이 start 호출을 다른 메서드로 옮기세요.'],
  on: {
    Call(n, cx) {
      if (n.id !== 'start' || n.args.length || !n.o || cx.kt) return;
      const m = cx.method;
      if (!m || !m.ctor || cx.enclosing(['Lambda']) || (cx.cls && cx.cls.mods.has('final'))) return;
      const o = A.strip(n.o);
      if (cx.typeOf(o) === 'Thread' || A.isCtor(o, 'Thread')) cx.report(n);
    },
  },
  bad: { java: jc(`  T() {
    new Thread(() -> { }).start(); // Noncompliant
  }`) },
  good: { java: jc(`  T() { }
  void start() { new Thread(() -> { }).start(); }`) },
});

rule({
  id: 'overridable-call-in-constructor', type: 'S', sev: 'CR', debt: 10, tags: ['pitfall'], ref: 'S1699',
  en: ['Constructors should only call non-overridable methods', 'A subclass override runs before the subclass fields are initialized.', 'Make the method private, final or static, or move the call out of the constructor.'],
  ko: ['생성자는 재정의할 수 없는 메서드만 호출해야 합니다', '하위 클래스의 재정의가 하위 클래스 필드 초기화 전에 실행됩니다.', '메서드를 private, final, static으로 하거나 호출을 생성자 밖으로 옮기세요.'],
  msg: ['Remove this call from a constructor to the overridable "{0}" method.', '생성자에서 재정의 가능한 "{0}" 메서드 호출을 지우세요.'],
  on: {
    Call(n, cx) {
      const m = cx.method;
      const cls = cx.cls;
      if (!m || !m.ctor || !cls || cls.mods.has('final') || cls.kind === 'enum' || cls.kind === 'record' || cx.kt) return;
      if (n.o && A.strip(n.o).k !== 'This') return;
      if (cx.enclosing(['Lambda']) || cx.enclosing(['New']) && cx.enclosing(['New']).body) return;
      const target = H.classMethods(cls).filter((x) => x.name === n.id && x.params.length === n.args.length);
      if (target.length && target.every((t) => !H.isPrivate(t) && !H.isFinal(t) && !H.isStatic(t))) cx.report(n, [n.id]);
    },
  },
  bad: { java: jc(`  T() {
    init(); // Noncompliant
  }
  void init() { }`) },
  good: { java: jc(`  T() {
    init();
  }
  private void init() { }`) },
});

rule({
  id: 'clone-without-super', type: 'S', sev: 'MI', debt: 5, tags: ['pitfall'], ref: 'S1182',
  en: ['Classes that override "clone" should be "Cloneable" and call "super.clone()"', 'Without super.clone() the copy has the wrong runtime class for subclasses.', 'Call super.clone() and implement Cloneable (or prefer a copy constructor).'],
  ko: ['clone을 재정의하는 클래스는 Cloneable이어야 하고 super.clone()을 불러야 합니다', 'super.clone()을 부르지 않으면 하위 클래스에서 복사본의 런타임 클래스가 틀립니다.', 'super.clone()을 부르고 Cloneable을 구현하세요(복사 생성자를 권장합니다).'],
  msg: ['Use super.clone() to create and seed the cloned instance to be returned.', 'super.clone()으로 반환할 복제 인스턴스를 만드세요.'],
  on: {
    Method(n, cx) {
      if (n.name !== 'clone' || n.params.length || !n.body || cx.kt) return;
      if (!A.find(n.body, (x) => x.k === 'Call' && x.id === 'clone' && x.o && A.strip(x.o).k === 'Super')) cx.report(nameLoc(n));
    },
  },
  bad: { java: jc(`  int v;
  @Override public T clone() { // Noncompliant
    T t = new T();
    t.v = v;
    return t;
  }`) },
  good: { java: `class T implements Cloneable {
  int v;
  @Override public T clone() throws CloneNotSupportedException {
    return (T) super.clone();
  }
}
` },
});

rule({
  id: 'clone-override', type: 'S', sev: 'BL', debt: 30, tags: ['design'], ref: 'S2975',
  en: ['"clone" should not be overridden', 'Object.clone is a broken mechanism (shallow copies, no constructors, Cloneable marker).', 'Provide a copy constructor or a copy factory method instead.'],
  ko: ['clone을 재정의하면 안 됩니다', 'Object.clone은 얕은 복사, 생성자 우회, Cloneable 마커 등 문제가 많은 메커니즘입니다.', '대신 복사 생성자나 복사 팩터리 메서드를 제공하세요.'],
  msg: ['Remove this "clone" implementation; use a copy constructor or copy factory instead.', '이 clone 구현을 지우고 복사 생성자나 복사 팩터리를 쓰세요.'],
  on: { Method(n, cx) { if (n.name === 'clone' && n.params.length === 0 && n.body && !cx.kt && cx.cls && cx.cls.kind === 'class') cx.report(nameLoc(n)); } },
  bad: { java: `class T implements Cloneable {
  @Override public T clone() throws CloneNotSupportedException { // Noncompliant
    return (T) super.clone();
  }
}
` },
  good: { java: `class T {
  int v;
  T(T other) { this.v = other.v; }
}
` },
});

rule({
  id: 'serializable-without-uid', type: 'S', sev: 'MA', debt: 5, tags: ['serialization'], ref: 'S2057',
  en: ['Every class implementing Serializable should declare a static final serialVersionUID', 'Without it the computed UID changes with compiler and code changes, breaking deserialization of stored objects.', 'Declare private static final long serialVersionUID = 1L;.'],
  ko: ['Serializable을 구현하는 클래스는 static final serialVersionUID를 선언해야 합니다', '없으면 계산된 UID가 컴파일러와 코드 변경에 따라 바뀌어 저장된 객체를 역직렬화할 수 없습니다.', 'private static final long serialVersionUID = 1L;을 선언하세요.'],
  msg: ['Add a "static final long serialVersionUID" field to this class.', '이 클래스에 "static final long serialVersionUID" 필드를 넣으세요.'],
  on: {
    Class(n, cx) {
      if (cx.kt || n.kind !== 'class' || n.anon || n.mods.has('abstract')) return;
      if (!(n.impls || []).some((t) => /^(Serializable|java\.io\.Serializable)$/.test(t.name))) return;
      const uid = n.members.find((m) => m.k === 'Field' && m.vars.some((v) => v.name === 'serialVersionUID'));
      if (!uid) cx.report({ line: n.nameLine || n.line, col: n.col });
    },
  },
  bad: { java: `class T implements java.io.Serializable { // Noncompliant
  int v;
}
` },
  good: { java: `class T implements java.io.Serializable {
  private static final long serialVersionUID = 1L;
  int v;
}
` },
});

rule({
  id: 'instance-writes-static-field', type: 'S', sev: 'CR', debt: 20, tags: ['multi-threading'], ref: 'S2696',
  en: ['Instance methods should not write to "static" fields', 'Every instance shares the static field, so concurrent instances race on it.', 'Make the method static, or the field an instance field.'],
  ko: ['인스턴스 메서드가 static 필드에 쓰면 안 됩니다', '모든 인스턴스가 static 필드를 공유해 동시에 쓰는 인스턴스끼리 경쟁합니다.', '메서드를 static으로 하거나 필드를 인스턴스 필드로 하세요.'],
  msg: ['Make the enclosing method "static" or remove this set of "{0}".', '감싼 메서드를 static으로 하거나 "{0}"에 대한 이 대입을 지우세요.'],
  on: {
    Assign(n, cx) {
      const m = cx.method;
      if (!m || m.k !== 'Method' || H.isStatic(m) || m.ctor || cx.kt || m.mods.has('synchronized')) return;
      if (cx.enclosing(['Sync'])) return;
      const t = A.strip(n.t);
      let name = null;
      if (t.k === 'Name' && !cx.env.locals.has(t.id)) name = t.id;
      else if (t.k === 'Sel' && cx.cls && A.dotted(t.o) === cx.cls.name) name = t.id;
      if (!name) return;
      const info = cx.clsInfo;
      const f = info && info.fields.get(name);
      if (f && f.mods && f.mods.has('static') && !f.final) cx.report(n, [name]);
    },
  },
  bad: { java: jc(`  private static int counter;
  void hit() {
    counter = counter + 1; // Noncompliant
  }`) },
  good: { java: jc(`  private int counter;
  void hit() {
    counter = counter + 1;
  }`) },
});

rule({
  id: 'volatile-array', type: 'S', sev: 'MI', debt: 20, tags: ['multi-threading'], ref: 'S3077',
  en: ['Non-primitive fields should not be "volatile"', 'volatile on an array only makes the reference volatile, not the elements.', 'Use AtomicIntegerArray / AtomicReferenceArray or proper locking.'],
  ko: ['기본형이 아닌 필드를 volatile로 하면 안 됩니다', '배열에 volatile을 붙이면 참조만 volatile이고 요소는 아닙니다.', 'AtomicIntegerArray / AtomicReferenceArray나 적절한 잠금을 쓰세요.'],
  msg: ['Use a thread-safe type; adding "volatile" is not enough to make this field thread-safe.', '스레드 안전 타입을 쓰세요. volatile만으로는 이 필드가 스레드 안전해지지 않습니다.'],
  on: { Field(n, cx) { if (!cx.kt && n.mods.has('volatile') && n.type && (n.type.dims || n.vars.some((v) => v.dims))) for (const v of n.vars) cx.report(v); } },
  bad: { java: jc(`  private volatile int[] counts; // Noncompliant`) },
  good: { java: jc(`  private final java.util.concurrent.atomic.AtomicIntegerArray counts = new java.util.concurrent.atomic.AtomicIntegerArray(4);`) },
});

rule({
  id: 'empty-statement', type: 'S', sev: 'MI', debt: 2, tags: ['unused'], ref: 'S1116',
  en: ['Empty statements should be removed', 'A stray semicolon is noise and can hide a mistake.', 'Remove it.'],
  ko: ['빈 문장은 지워야 합니다', '남는 세미콜론은 잡음이고 실수를 숨길 수 있습니다.', '지우세요.'],
  msg: ['Remove this empty statement.', '이 빈 문장을 지우세요.'],
  on: {
    Empty(n, cx) {
      if (cx.kt) return;
      const p = cx.parent();
      if (!p || p.k !== 'Block') return;
      cx.report(n);
    },
  },
  bad: { java: jm(`    n++;; // Noncompliant`) },
  good: { java: jm(`    n++;
    for (int i = 0; i < 3; i++);`) },
});

rule({
  id: 'switch-without-default', type: 'S', sev: 'CR', debt: 5, tags: ['cwe-478'], ref: 'S131',
  en: ['"switch" statements should have "default" clauses', 'Without default, unexpected values are silently ignored.', 'Add a default clause (throw for impossible values).'],
  ko: ['switch 문에는 default 절이 있어야 합니다', 'default가 없으면 예상치 못한 값을 조용히 무시합니다.', 'default 절을 넣으세요(불가능한 값이면 예외를 던지세요).'],
  msg: ['Add a default case to this switch.', '이 switch에 default case를 넣으세요.'],
  on: {
    Switch(n, cx) {
      if (cx.kt || n.expr || n.cases.some((c) => c.dflt)) return;
      if (n.cases.some((c) => c.labels.some((l) => l.k === 'TypePat' || l.k === 'RecPat'))) return;
      const labels = n.cases.flatMap((c) => c.labels);
      if (labels.length && labels.every((l) => A.strip(l).k === 'Name' && /^[A-Z][A-Z0-9_]*$/.test(A.strip(l).id))) return; // enum switch
      const st = cx.typeOf(n.sel);
      if (st && cx.proj.info(st) && cx.proj.info(st).kind === 'enum') return;
      cx.report(n);
    },
  },
  bad: { java: jm(`    switch (n) { // Noncompliant
      case 1: System.out.println("a"); break;
      case 2: System.out.println("b"); break;
    }`) },
  good: { java: jm(`    switch (n) {
      case 1: System.out.println("a"); break;
      case 2: System.out.println("b"); break;
      default: throw new IllegalStateException("unexpected " + n);
    }`) },
});

rule({
  id: 'switch-default-not-last', type: 'S', sev: 'CR', debt: 5, tags: ['convention'], ref: 'S4524',
  en: ['"default" clauses should be first or last', 'A default in the middle of the cases is easy to overlook.', 'Move default to the end.'],
  ko: ['default 절은 처음이나 마지막에 있어야 합니다', 'case 중간의 default는 놓치기 쉽습니다.', 'default를 끝으로 옮기세요.'],
  msg: ['Move this default to the end of the switch.', '이 default를 switch 끝으로 옮기세요.'],
  on: {
    Switch(n, cx) {
      if (cx.kt) return;
      const i = n.cases.findIndex((c) => c.dflt);
      if (i > 0 && i < n.cases.length - 1) cx.report(n.cases[i]);
    },
  },
  bad: { java: jm(`    switch (n) {
      case 1: System.out.println("a"); break;
      default: break; // Noncompliant
      case 2: System.out.println("b"); break;
    }`) },
  good: { java: jm(`    switch (n) {
      case 1: System.out.println("a"); break;
      case 2: System.out.println("b"); break;
      default: break;
    }`) },
});

rule({
  id: 'single-iteration-loop', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 10, tags: ['suspicious'], ref: 'S1751', ktRef: 'S1751',
  en: ['Loops with at most one iteration should be refactored', 'The loop body always ends with return/break/throw, so it runs at most once.', 'Use an if statement, or fix the misplaced jump.'],
  ko: ['최대 한 번만 도는 루프는 고쳐야 합니다', '루프 본문이 항상 return/break/throw로 끝나 많아야 한 번만 실행됩니다.', 'if 문을 쓰거나 잘못 놓인 점프를 고치세요.'],
  msg: ['Refactor this loop to do more than one iteration.', '두 번 이상 돌도록 이 루프를 고치세요.'],
  on: {
    While(n, cx) { singleIter(n, cx); },
    For(n, cx) { singleIter(n, cx); },
    Do(n, cx) { singleIter(n, cx); },
    ForEach(n, cx) { singleIter(n, cx); },
  },
  bad: { java: jm(`    for (String x : list) { // Noncompliant
      System.out.println(x);
      break;
    }`), kt: km(`    for (x in list) { // Noncompliant
        println(x)
        return
    }`) },
  good: { java: jm(`    for (String x : list) {
      if (x.isEmpty()) { break; }
      System.out.println(x);
    }`), kt: km(`    for (x in list) {
        if (x.isEmpty()) return
        println(x)
    }`) },
});
function singleIter(n, cx) {
  if (!n.body || n.body.k !== 'Block' || !n.body.stmts.length) return;
  const last = n.body.stmts[n.body.stmts.length - 1];
  if (!(last.k === 'Break' || last.k === 'Return' || last.k === 'Throw') || last.label) return;
  const hasContinue = A.find(n.body, (x) => x.k === 'Continue', { noLambda: true, noClass: true });
  if (hasContinue) return;
  cx.report(n);
}

rule({
  id: 'loop-counter-modified', type: 'S', sev: 'MA', debt: 5, tags: ['pitfall'], ref: 'S127',
  en: ['"for" loop stop conditions should be invariant', 'Changing the loop counter inside the body makes the number of iterations hard to predict.', 'Use a while loop, or leave the counter to the update clause.'],
  ko: ['for 루프의 종료 조건은 불변이어야 합니다', '본문에서 루프 카운터를 바꾸면 반복 횟수를 예측하기 어렵습니다.', 'while 루프를 쓰거나 카운터는 갱신절에만 맡기세요.'],
  msg: ['Refactor the code in order to not assign to this loop counter from within the loop body.', '루프 본문에서 이 루프 카운터에 대입하지 않도록 코드를 고치세요.'],
  on: {
    For(n, cx) {
      if (!n.upd.length) return;
      const counters = new Set();
      for (const u of n.upd) { const x = A.strip(u); const k = x.k === 'Un' ? A.nameOf(x.e) : x.k === 'Assign' ? A.nameOf(x.t) : null; if (k) counters.add(k); }
      if (!counters.size) return;
      H.noNested(n.body, (x) => {
        if (x.k === 'Assign' && counters.has(A.nameOf(x.t))) cx.report(x);
        if (x.k === 'Un' && (x.op === '++' || x.op === '--') && counters.has(A.nameOf(x.e))) cx.report(x);
      });
    },
  },
  bad: { java: jm(`    for (int i = 0; i < n; i++) {
      if (i == 3) { i++; } // Noncompliant
    }`) },
  good: { java: jm(`    for (int i = 0; i < n; i++) {
      System.out.println(i);
    }`) },
});

rule({
  id: 'wrong-loop-variable', type: 'B', sev: 'CR', debt: 5, tags: ['suspicious'], ref: 'S1994',
  en: ['"for" loop increment clauses should modify the loops\' counters', 'The update clause changes a different variable than the one tested in the condition.', 'Update the tested counter.'],
  ko: ['for 루프의 증가절은 루프 카운터를 바꿔야 합니다', '갱신절이 조건에서 검사하는 변수와 다른 변수를 바꿉니다.', '검사하는 카운터를 갱신하세요.'],
  msg: ['This loop\'s stop condition tests "{0}" but the incrementer updates "{1}".', '이 루프의 종료 조건은 "{0}"을(를) 검사하는데 증가절은 "{1}"을(를) 바꿉니다.'],
  on: {
    For(n, cx) {
      const c = A.strip(n.c);
      if (!c || c.k !== 'Bin' || n.upd.length !== 1) return;
      const tested = new Set();
      A.forEach(c, (x) => { if (x.k === 'Name') tested.add(x.id); return x.k !== 'Call'; });
      const u = A.strip(n.upd[0]);
      const upd = u.k === 'Un' ? A.nameOf(u.e) : u.k === 'Assign' ? A.nameOf(u.t) : null;
      if (!upd || tested.has(upd)) return;
      const cond = A.nameOf(c.l);
      if (cond) cx.report(n, [cond, upd]);
    },
  },
  bad: { java: jm(`    for (int i = 0, j = 0; i < n; j++) { // Noncompliant
      System.out.println(i);
    }`) },
  good: { java: jm(`    for (int i = 0; i < n; i++) {
      System.out.println(i);
    }`) },
});

rule({
  id: 'boolean-literal-condition', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 2, tags: ['redundant'], ref: 'S1145', ktRef: 'S1145',
  en: ['Useless "if(true) {...}" and "if(false){...}" blocks should be removed', 'A literal condition makes the if pointless: the branch always or never runs.', 'Remove the if (keep the code that runs).'],
  ko: ['쓸모없는 if(true)와 if(false) 블록은 지워야 합니다', '리터럴 조건이면 if가 의미 없어 분기가 항상 실행되거나 전혀 실행되지 않습니다.', 'if를 지우세요(실행되는 코드는 남기세요).'],
  msg: ['Remove this "if" statement whose condition is always {0}.', '조건이 항상 {0}인 이 if 문을 지우세요.'],
  on: { If(n, cx) { if (A.isBoolLit(n.c)) cx.report(n, [String(A.strip(n.c).v)]); } },
  bad: { java: jm(`    if (true) { n++; } // Noncompliant`), kt: km(`    if (false) println(s) // Noncompliant`) },
  good: { java: jm(`    if (n > 0) { n++; }`), kt: km(`    if (n > 0) println(s)`) },
});

rule({
  id: 'assignment-in-subexpression', type: 'S', sev: 'MA', debt: 5, tags: ['cwe-481', 'suspicious'], ref: 'S1121',
  en: ['Assignments should not be made from within sub-expressions', 'An assignment buried in a larger expression is easy to miss and to confuse with ==.', 'Assign in a separate statement.'],
  ko: ['하위 식 안에서 대입하면 안 됩니다', '큰 식에 묻힌 대입은 놓치기 쉽고 ==와 헷갈리기 쉽습니다.', '별도 문장에서 대입하세요.'],
  msg: ['Extract the assignment out of this expression.', '이 식에서 대입을 빼내세요.'],
  on: {
    Assign(n, cx) {
      if (cx.kt) return;
      const p = cx.parent();
      if (!p) return;
      if (p.k === 'ExprStmt' || p.k === 'Lambda' || p.k === 'For' || (p.k === 'Assign' && p.v === n)) return;
      // while ((line = reader.readLine()) != null) idiom
      for (let i = cx.stack.length - 2; i >= 0; i--) {
        const x = cx.stack[i];
        if (x.k === 'While' || x.k === 'Do' || x.k === 'For') return;
        if (x.k === 'Block' || x.k === 'Method') break;
      }
      if (p.k === 'If' && A.isBoolLit(n.v)) return;
      if (p.k === 'Paren') {
        const pp = cx.parent(2);
        if (pp && (pp.k === 'ExprStmt')) return;
      }
      cx.report(n);
    },
  },
  bad: { java: jm(`    int a;
    if ((a = s.length()) > 3) { n++; } // Noncompliant`) },
  good: { java: jm(`    int a = s.length();
    if (a > 3) { n++; }
    String line;
    java.io.BufferedReader r = null;
    while ((line = r.readLine()) != null) { n++; }`) },
});

rule({
  id: 'comparable-without-equals', type: 'S', sev: 'MI', debt: 15, tags: ['pitfall'], ref: 'S1210',
  en: ['"equals(Object obj)" should be overridden along with the "compareTo(T obj)" method', 'Sorted collections use compareTo while others use equals; when they disagree, behaviour differs between collections.', 'Override equals (and hashCode) consistently with compareTo.'],
  ko: ['compareTo(T obj)와 함께 equals(Object obj)도 재정의해야 합니다', '정렬 컬렉션은 compareTo를, 나머지는 equals를 써서 둘이 다르면 컬렉션마다 동작이 달라집니다.', 'compareTo와 일관되게 equals(와 hashCode)를 재정의하세요.'],
  msg: ['Override "equals(Object obj)" to comply with the contract of the "compareTo(T o)" method.', 'compareTo(T o)의 계약에 맞게 equals(Object obj)를 재정의하세요.'],
  on: {
    Class(n, cx) {
      if (cx.kt || n.kind !== 'class' || n.anon) return;
      if (!(n.impls || []).some((t) => A.typeName(t) === 'Comparable')) return;
      const cmp = H.findMethod(n, 'compareTo', 1);
      if (cmp && !H.findMethod(n, 'equals', 1)) cx.report(nameLoc(cmp));
    },
  },
  bad: { java: `class Version implements Comparable<Version> {
  int major;
  public int compareTo(Version o) { // Noncompliant
    return Integer.compare(major, o.major);
  }
}
` },
  good: { java: `class Version implements Comparable<Version> {
  int major;
  public int compareTo(Version o) { return Integer.compare(major, o.major); }
  @Override public boolean equals(Object o) { return o instanceof Version && ((Version) o).major == major; }
  @Override public int hashCode() { return major; }
}
` },
});

rule({
  id: 'labeled-statement', type: 'S', sev: 'MA', debt: 30, tags: ['confusing'], ref: 'S1119',
  en: ['Labels should not be used', 'Labeled break/continue act like goto and make loops hard to follow.', 'Extract the inner loop into a method and return from it.'],
  ko: ['레이블을 쓰면 안 됩니다', '레이블 있는 break/continue는 goto처럼 동작해 루프를 따라가기 어렵게 합니다.', '안쪽 루프를 메서드로 빼서 return하세요.'],
  msg: ['Refactor the code to remove this label and the need for it.', '이 레이블과 그것이 필요한 이유를 없애도록 코드를 고치세요.'],
  on: { Labeled(n, cx) { if (!cx.kt) cx.report(n); } },
  bad: { java: jm(`    outer: // Noncompliant
    for (String x : list) {
      for (char c : x.toCharArray()) { if (c == 'q') { break outer; } }
    }`) },
  good: { java: jm(`    for (String x : list) {
      if (x.indexOf('q') >= 0) { break; }
    }`) },
});

rule({
  id: 'unused-label', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 2, tags: ['unused'], ref: 'S1065', ktRef: 'S1065',
  en: ['Unused labels should be removed', 'A label that no break or continue refers to is noise.', 'Remove the label.'],
  ko: ['쓰지 않는 레이블은 지워야 합니다', 'break나 continue가 가리키지 않는 레이블은 잡음입니다.', '레이블을 지우세요.'],
  msg: ['Remove this unused label "{0}".', '쓰지 않는 레이블 "{0}"을(를) 지우세요.'],
  on: {
    Labeled(n, cx) {
      const used = A.find(n.body, (x) => (x.k === 'Break' || x.k === 'Continue' || x.k === 'Return' || x.k === 'This') && x.label === n.label);
      if (!used) cx.report(n, [n.label]);
    },
  },
  bad: { java: jm(`    loop: // Noncompliant
    for (String x : list) { System.out.println(x); }`), kt: km(`    loop@ for (x in list) { // Noncompliant
        println(x)
    }`) },
  good: { java: jm(`    for (String x : list) { System.out.println(x); }`), kt: km(`    loop@ for (x in list) {
        for (c in x) { if (c == 'q') break@loop }
    }`) },
});

module.exports = { cognitive, looksLikeCode };
