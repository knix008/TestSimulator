'use strict';

// Code smells: complexity, size, structure, naming, unused code, idioms.

const { rule } = require('./core');
const A = require('../ast');
const H = require('./h');

const NEST_TYPES = new Set(['If', 'While', 'For', 'Case', 'Begin']);
const LOGICAL = new Set(['&&', '||', 'and', 'or']);

// ── complexity / size ──────────────────────────────────────
function cognitive(def) {
  let total = 0;
  const logical = (e) => {
    const ops = [];
    const flat = (x) => {
      x = A.strip(x);
      if (x && x.type === 'Bin' && LOGICAL.has(x.op)) { flat(x.l); ops.push(x.op === 'and' ? '&&' : x.op === 'or' ? '||' : x.op); flat(x.r); }
    };
    flat(e);
    let k = 0;
    for (let i = 0; i < ops.length; i++) if (i === 0 || ops[i] !== ops[i - 1]) k++;
    return k;
  };
  const visit = (x, nest) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { for (const s of x) visit(s, nest); return; }
    switch (x.type) {
      case 'Def': case 'Class': case 'Module': case 'SClass': return;
      case 'If': {
        if (x.kind === 'elsif') return;
        total += 1 + nest;
        cond(x.cond, nest);
        if (x.mod) { visit(x.then, nest); return; }
        const ch = H.ifChain(x);
        visit(ch.branches[0].body, nest + 1);
        for (const b of ch.branches.slice(1)) { total += 1; cond(b.cond, nest); visit(b.body, nest + 1); }
        if (ch.elseBody) { total += 1; visit(ch.elseBody, nest + 1); }
        return;
      }
      case 'While': case 'For':
        total += 1 + nest;
        if (x.cond) cond(x.cond, nest);
        if (x.iter) visit(x.iter, nest);
        visit(x.body, nest + 1);
        return;
      case 'Case':
        total += 1 + nest;
        visit(x.subject, nest);
        for (const w of x.whens) { visit(w.conds, nest); visit(w.body, nest + 1); }
        for (const w of x.ins) { if (w.guard) cond(w.guard.e, nest + 1); visit(w.body, nest + 1); }
        visit(x.else, nest + 1);
        return;
      case 'Begin':
        visit(x.body, nest);
        for (const r of x.rescues) { total += 1 + nest; visit(r.body, nest + 1); }
        visit(x.elseBody, nest);
        visit(x.ensure, nest);
        return;
      case 'RescueMod':
        visit(x.expr, nest);
        total += 1 + nest;
        visit(x.rescue, nest + 1);
        return;
      case 'Block': case 'Lambda':
        visit(x.body, nest + 1);
        return;
      case 'Bin':
        if (LOGICAL.has(x.op)) { cond(x, nest); return; }
        break;
      default: break;
    }
    for (const c of A.children(x)) visit(c, nest);
  };
  const cond = (e, nest) => {
    total += logical(e);
    const leaves = [];
    const flat = (x) => { x = A.strip(x); if (x && x.type === 'Bin' && LOGICAL.has(x.op)) { flat(x.l); flat(x.r); } else leaves.push(x); };
    flat(e);
    for (const l of leaves) visit(l, nest);
  };
  visit(def.body, 0);
  return total;
}

const longIfs = (n) => {
  let s = '  if a\n';
  for (let i = 0; i < n; i++) s += `    x${i} = ${i}\n    puts x${i}\n`;
  return s + '  end\n';
};

rule({
  id: 'cognitive-complexity', type: 'S', sev: 'CR', debt: 20, ref: 'S3776', tags: ['brain-overload'],
  en: ['Cognitive Complexity of methods should not be too high', 'Methods with deeply nested and interleaved control flow are hard to read, test and change.', 'Split the method into smaller methods and flatten nested conditions with guard clauses.'],
  ko: ['메서드의 인지 복잡도가 너무 높지 않아야 합니다', '깊게 중첩되고 얽힌 제어 흐름은 읽고 테스트하고 고치기 어렵습니다.', '작은 메서드로 나누고 가드 절로 중첩 조건을 평평하게 합니다.'],
  msg: ['Refactor this method to reduce its Cognitive Complexity from {0} to the {1} allowed.', '이 메서드의 인지 복잡도를 {0}에서 허용치 {1} 이하로 줄입니다.'],
  on: {
    Def(n, cx) {
      const max = cx.opt('max', 15);
      const c = cognitive(n);
      if (c > max) cx.report(n, [c, max]);
    },
  },
  bad: `def process(items, mode) # Noncompliant
  items.each do |item|
    if item.valid?
      if mode == :fast && item.small? || item.cached?
        while item.pending?
          if item.retry?
            item.step
          elsif item.skip?
            next
          else
            break
          end
        end
      end
    end
  end
end
`,
  good: `def process(items)
  items.each do |item|
    next unless item.valid?
    handle(item)
  end
end
`,
});

rule({
  id: 'expression-complexity', type: 'S', sev: 'CR', debt: 5, ref: 'S1067', tags: ['brain-overload'],
  en: ['Expressions should not be too complex', 'Long chains of boolean operators are hard to read and easy to get wrong.', 'Extract parts of the condition into well-named methods or variables.'],
  ko: ['식이 너무 복잡하지 않아야 합니다', '불리언 연산자가 길게 이어지면 읽기 어렵고 틀리기 쉽습니다.', '조건 일부를 이름 있는 메서드나 변수로 추출합니다.'],
  msg: ['Reduce the number of conditional operators ({0}) used in the expression (maximum allowed {1}).', '이 식에 쓰인 조건 연산자 수({0})를 허용치 {1} 이하로 줄입니다.'],
  on: {
    Bin(n, cx) {
      if (!LOGICAL.has(n.op)) return;
      let p = n.parent;
      while (p && p.type === 'Paren' && p.body.length === 1) p = p.parent;
      if (p && p.type === 'Bin' && LOGICAL.has(p.op)) return;
      if (p && (p.type === 'Not') && p.parent && p.parent.type === 'Bin' && LOGICAL.has(p.parent.op)) return;
      let count = 0;
      const visit = (x) => {
        x = A.strip(x);
        if (!x) return;
        if (x.type === 'Not') { visit(x.e); return; }
        if (x.type === 'Bin' && LOGICAL.has(x.op)) { count++; visit(x.l); visit(x.r); }
      };
      visit(n);
      const max = cx.opt('max', 3);
      if (count > max) cx.report(n, [count, max]);
    },
  },
  bad: `def ok?(a, b, c, d, e)
  a && b || c && d || e # Noncompliant
end
`,
  good: `def ok?(a, b, c)
  a && b || c
end
`,
});

rule({
  id: 'method-too-long', type: 'S', sev: 'MA', debt: 20, ref: 'S138', tags: ['brain-overload'],
  en: ['Methods should not have too many lines of code', 'Very long methods do several things at once and are hard to understand.', 'Split the method into smaller, focused methods.'],
  ko: ['메서드의 코드 줄 수가 너무 많지 않아야 합니다', '아주 긴 메서드는 여러 일을 한꺼번에 하고 이해하기 어렵습니다.', '작고 한 가지 일만 하는 메서드로 나눕니다.'],
  msg: ['This method "{0}" has {1} lines of code, which is greater than the {2} authorized. Split it into smaller methods.', '메서드 "{0}"의 코드가 {1}줄로 허용치 {2}줄보다 깁니다. 작은 메서드로 나눕니다.'],
  on: {
    Def(n, cx) {
      const max = cx.opt('max', 100);
      let loc = 0;
      for (let l = n.line + 1; l < n.endLine; l++) {
        const t = (cx.lines[l - 1] || '').trim();
        if (t && !t.startsWith('#')) loc++;
      }
      if (loc > max) cx.report(n, [n.name, loc, max]);
    },
  },
  bad: `def long_method # Noncompliant\n${'  step\n'.repeat(101)}end\n`,
  good: `def short_method\n${'  step\n'.repeat(20)}end\n`,
});

rule({
  id: 'too-many-parameters', type: 'S', sev: 'MA', debt: 20, ref: 'S107', tags: ['brain-overload'],
  en: ['Methods should not have too many parameters', 'A long parameter list is hard to call correctly and usually means the method does too much.', 'Group related parameters into an object or a keyword hash.'],
  ko: ['메서드의 매개변수가 너무 많지 않아야 합니다', '매개변수 목록이 길면 올바르게 호출하기 어렵고 메서드가 너무 많은 일을 한다는 뜻입니다.', '관련 매개변수를 객체나 키워드 해시로 묶습니다.'],
  msg: ['Method "{0}" has {1} parameters, which is greater than the {2} authorized.', '메서드 "{0}"의 매개변수가 {1}개로 허용치 {2}개보다 많습니다.'],
  on: {
    Def(n, cx) {
      const max = cx.opt('max', 7);
      const count = n.params.filter((p) => p.kind !== 'block' && p.kind !== 'fwd').length;
      if (count > max) cx.report(n, [n.name, count, max]);
    },
  },
  bad: `def build(a, b, c, d, e, f, g, h) # Noncompliant
  [a, b, c, d, e, f, g, h]
end
`,
  good: `def build(a, b, c, **opts)
  [a, b, c, opts]
end
`,
});

rule({
  id: 'file-too-long', type: 'S', sev: 'MA', debt: 60, ref: 'S104', tags: ['brain-overload'],
  en: ['Files should not have too many lines of code', 'Very large files usually hold several responsibilities and are hard to navigate.', 'Split the file into smaller classes or modules.'],
  ko: ['파일의 코드 줄 수가 너무 많지 않아야 합니다', '아주 큰 파일은 여러 책임을 담고 있어 살펴보기 어렵습니다.', '더 작은 클래스나 모듈로 나눕니다.'],
  msg: ['This file has {0} lines of code, which is greater than {1} authorized. Split it into smaller files.', '이 파일의 코드가 {0}줄로 허용치 {1}줄보다 깁니다. 더 작은 파일로 나눕니다.'],
  file(cx) {
    const max = cx.opt('max', 1000);
    let loc = 0;
    for (const l of cx.lines) { const t = l.trim(); if (t && !t.startsWith('#')) loc++; }
    if (loc > max) cx.report({ line: 1, col: 1 }, [loc, max]);
  },
  bad: `x = 1 # Noncompliant\n${'puts x\n'.repeat(1000)}`,
  good: `x = 1\n${'puts x\n'.repeat(50)}`,
});

rule({
  id: 'line-too-long', type: 'S', sev: 'MI', debt: 1, ref: 'S103', tags: ['convention'],
  en: ['Lines should not be too long', 'Long lines force horizontal scrolling and hide code in reviews.', 'Break the line, for example after a comma or before a method chain.'],
  ko: ['한 줄이 너무 길지 않아야 합니다', '긴 줄은 가로 스크롤을 만들고 리뷰에서 코드를 가립니다.', '쉼표 뒤나 메서드 체인 앞에서 줄을 나눕니다.'],
  msg: ['Split this {0} characters long line (which is greater than {1} authorized).', '{0}자인 이 줄을 나눕니다(허용치 {1}자).'],
  file(cx) {
    const max = cx.opt('max', 120);
    cx.lines.forEach((l, i) => {
      if (l.length > max && !/^\s*#.*https?:\/\//.test(l)) cx.report({ line: i + 1, col: 1 }, [l.length, max]);
    });
  },
  bad: `value = compute(${'argument_number_one, '.repeat(6)}last) # Noncompliant\n`,
  good: `value = compute(first,\n                second)\n`,
});

rule({
  id: 'nesting-depth', type: 'S', sev: 'CR', debt: 10, ref: 'S134', tags: ['brain-overload'],
  en: ['Control flow statements should not be nested too deeply', 'Deeply nested if / while / case / begin blocks are hard to follow.', 'Use guard clauses or extract the inner logic into methods.'],
  ko: ['제어 흐름 문이 너무 깊게 중첩되지 않아야 합니다', '깊게 중첩된 if / while / case / begin 블록은 따라가기 어렵습니다.', '가드 절을 쓰거나 안쪽 로직을 메서드로 추출합니다.'],
  msg: ['Refactor this code to not nest more than {0} control flow statements.', '제어 흐름 문이 {0}단계를 넘지 않도록 이 코드를 고칩니다.'],
  on: {
    'If|While|For|Case|Begin'(n, cx) {
      if (!counts(n)) return;
      const max = cx.opt('max', 3);
      let depth = 0;
      for (let p = n.parent; p; p = p.parent) {
        if (p.type === 'Def' || p.type === 'Class' || p.type === 'Module' || p.type === 'Program') break;
        if (counts(p)) depth++;
      }
      if (depth === max) cx.report(kw(n, n.type === 'If' ? n.kind : n.type === 'While' ? (n.until ? 'until' : 'while') : n.type.toLowerCase()), [max]);
    },
  },
  bad: `def walk(a, b, c, d)
  if a
    while b
      case c
      when 1
        if d # Noncompliant
          go
        end
      end
    end
  end
end
`,
  good: `def walk(a, b)
  return unless a
  while b
    go if ready?
  end
end
`,
});

function counts(n) {
  if (!NEST_TYPES.has(n.type)) return false;
  if (n.type === 'If') return !n.mod && !n.ternary && n.kind !== 'elsif';
  if (n.type === 'While') return !n.mod;
  if (n.type === 'Begin') return !n.implicit && n.rescues && n.rescues.length > 0;
  return true;
}

// ── empty code ─────────────────────────────────────────────
rule({
  id: 'empty-block', type: 'S', sev: 'MA', debt: 5, ref: 'S108', tags: ['suspicious'],
  en: ['Nested blocks of code should not be left empty', 'An empty branch or block is usually unfinished code or a leftover.', 'Add the missing code, remove the block, or explain with a comment why it is empty.'],
  ko: ['중첩된 코드 블록을 비워 두지 않아야 합니다', '빈 분기나 블록은 대개 덜 끝난 코드이거나 남은 흔적입니다.', '빠진 코드를 넣거나 블록을 지우거나, 비어 있는 이유를 주석으로 남깁니다.'],
  msg: ['Either remove or fill this block of code.', '이 코드 블록을 지우거나 채웁니다.'],
  on: {
    If(n, cx) {
      if (n.mod || n.ternary) return;
      const nextLine = (n.else && n.else.length && n.else[0].kind === 'elsif') ? n.else[0].line : (n.elseLine || n.endLine);
      if (!n.then.length && !H.hasCommentIn(cx, n.line, nextLine)) cx.report(kw(n, n.kind));
      if (n.else && !n.else.length && n.elseLine && !H.hasCommentIn(cx, n.elseLine, n.endLine)) cx.report({ line: n.elseLine, col: cx.lines[n.elseLine - 1].indexOf('else') + 1 });
    },
    'While|For'(n, cx) {
      if (n.mod) return;
      if (!n.body.length && !H.hasCommentIn(cx, n.line, n.endLine)) cx.report(kw(n, n.type === 'For' ? 'for' : n.until ? 'until' : 'while'));
    },
    When(n, cx) {
      const c = n.parent;
      const list = c.whens;
      const i = list.indexOf(n);
      const next = i + 1 < list.length ? list[i + 1].line : (c.elseLine || c.endLine);
      if (!n.body.length && !H.hasCommentIn(cx, n.line, next)) cx.report(kw(n, 'when'));
    },
    Begin(n, cx) {
      if (n.implicit || n.hook) return;
      const stop = n.rescues.length ? n.rescues[0].line : n.endLine;
      if (!n.body.length && !H.hasCommentIn(cx, n.line, stop)) cx.report(kw(n, 'begin'));
    },
    Block(n, cx) {
      if (n.body.length || H.hasCommentIn(cx, n.line, n.endLine)) return;
      const call = n.parent;
      if (call && call.type === 'Call' && /^(loop|define_method|let|let!|subject|before|after|it|specify|lambda|proc|new|tap|then|catch|trap|at_exit)$/.test(call.name)) return;
      if (call && call.type === 'Call' && call.recv && A.constPath(call.recv) === 'Class') return;
      cx.report(kw(n, n.brace ? '{' : 'do'));
    },
  },
  bad: `def check(x, list)
  if x # Noncompliant
  end
  while x.busy? # Noncompliant
  end
  list.each do |i| # Noncompliant
  end
end
`,
  good: `def check(x, list)
  if x
    # intentionally empty: x is validated elsewhere
  end
  list.each { |i| puts i }
end
`,
});

function kw(n, word) {
  return { line: n.line, col: n.col, endLine: n.line, endCol: n.col + word.length, parent: n };
}

rule({
  id: 'empty-method', type: 'S', sev: 'CR', debt: 5, ref: 'S1186', tags: ['suspicious'],
  en: ['Methods should not be empty', 'An empty method is surprising for callers: it may be unfinished or intentionally a no-op.', 'Implement the method, raise NotImplementedError, or add a comment explaining why it is empty.'],
  ko: ['메서드를 비워 두지 않아야 합니다', '빈 메서드는 호출하는 쪽을 놀라게 합니다. 미완성인지 의도한 빈 동작인지 알 수 없습니다.', '메서드를 구현하거나 NotImplementedError를 발생시키거나, 비어 있는 이유를 주석으로 남깁니다.'],
  msg: ['Add a nested comment explaining why method "{0}" is empty, or complete the implementation.', '메서드 "{0}"가 비어 있는 이유를 주석으로 남기거나 구현을 완성합니다.'],
  on: {
    Def(n, cx) {
      if (n.endless || !A.isEmptyBody(n.body)) return;
      if (H.hasCommentIn(cx, n.line, n.endLine)) return;
      cx.report(n, [n.name]);
    },
  },
  bad: `class Job
  def run # Noncompliant
  end
end
`,
  good: `class Job
  def run
    # no-op: subclasses override this hook
  end

  def stop
    raise NotImplementedError
  end
end
`,
});

// ── duplication ────────────────────────────────────────────
rule({
  id: 'duplicated-string', type: 'S', sev: 'CR', debt: 2, ref: 'S1192', tags: ['design'],
  en: ['String literals should not be duplicated', 'The same literal repeated in several places must be changed everywhere at once.', 'Define a constant for the literal and use it everywhere.'],
  ko: ['문자열 리터럴을 중복하지 않아야 합니다', '같은 리터럴이 여러 곳에 있으면 바꿀 때 모두 함께 바꿔야 합니다.', '리터럴을 상수로 정의하고 그 상수를 씁니다.'],
  msg: ['Define a constant instead of duplicating this literal "{0}" {1} times.', '리터럴 "{0}"를 {1}번 중복하지 말고 상수를 정의합니다.'],
  file(cx) {
    const threshold = cx.opt('threshold', 3);
    const groups = new Map();
    for (const n of cx.all) {
      if (n.type !== 'Str' || n.interp || n.value == null || n.heredoc || n.q === '%w' || n.q === '?') continue;
      if (n.value.length < 5 || /^\w$/.test(n.value)) continue;
      const p = n.parent;
      if (p && p.type === 'Call' && /^(require|require_relative|load|gem|autoload)$/.test(p.name)) continue;
      if (p && p.type === 'Pair' && p.key === n) continue;
      if (!groups.has(n.value)) groups.set(n.value, []);
      groups.get(n.value).push(n);
    }
    for (const [v, list] of groups) {
      if (list.length >= threshold) cx.report(list[0], [v.length > 40 ? v.slice(0, 37) + '...' : v, list.length]);
    }
  },
  bad: `def labels
  a = "action-required" # Noncompliant
  b = "action-required"
  c = "action-required"
  [a, b, c]
end
`,
  good: `ACTION = "action-required"
def labels
  [ACTION, ACTION, "other-label"]
end
`,
});

rule({
  id: 'identical-branches', type: 'S', sev: 'MA', debt: 10, ref: 'S1871', tags: ['design', 'suspicious'],
  en: ['Two branches in a conditional structure should not have exactly the same implementation', 'Duplicated branches are either a copy-paste mistake or should be merged.', 'Merge the conditions or change one of the branches.'],
  ko: ['조건 구조의 두 분기가 완전히 같은 구현이면 안 됩니다', '같은 분기는 복사-붙여넣기 실수이거나 합쳐야 할 코드입니다.', '조건을 합치거나 한쪽 분기를 고칩니다.'],
  msg: ['This branch\'s code block is the same as the block for the branch on line {0}.', '이 분기의 코드가 {0}번 줄 분기와 같습니다.'],
  on: {
    If(n, cx) {
      if (n.kind === 'elsif' || n.mod || n.ternary) return;
      const ch = H.ifChain(n);
      const bodies = ch.branches.map((b) => ({ body: b.body, node: b.node, line: b.node.line }));
      if (ch.elseBody) bodies.push({ body: ch.elseBody, node: null, line: ch.elseLine });
      check(bodies, !!ch.elseBody, cx);
    },
    Case(n, cx) {
      const bodies = n.whens.map((w) => ({ body: w.body, node: w, line: w.line }));
      if (n.else) bodies.push({ body: n.else, node: null, line: n.elseLine });
      check(bodies, !!n.else, cx);
    },
  },
  bad: `def pick(x)
  if x == 1
    log(x)
    :one
  elsif x == 2
    log(x) # Noncompliant
    :one
  else
    :other
  end
end
`,
  good: `def pick(x)
  if x == 1
    log(x)
    :one
  elsif x == 2
    log(x)
    :two
  else
    :other
  end
end
`,
});

function check(bodies, hasElse, cx) {
  if (bodies.length < 2) return;
  const fps = bodies.map((b) => (b.body && b.body.length ? A.fp(b.body) : null));
  if (hasElse && fps.every((f) => f && f === fps[0])) return; // all-branches-same
  for (let i = 1; i < bodies.length; i++) {
    if (!fps[i]) continue;
    if (!hasElse && bodies[i].body.length === 1) continue;
    for (let j = 0; j < i; j++) {
      if (fps[j] === fps[i]) {
        const first = bodies[i].body[0];
        cx.report(first, [bodies[j].body[0].line]);
        break;
      }
    }
  }
}

rule({
  id: 'all-branches-same', type: 'B', sev: 'MA', debt: 15, ref: 'S3923', tags: ['suspicious'],
  en: ['All branches in a conditional structure should not have exactly the same implementation', 'When every branch does the same thing the condition is useless, which is usually a mistake.', 'Remove the condition or fix the branch that should differ.'],
  ko: ['조건 구조의 모든 분기가 같은 구현이면 안 됩니다', '모든 분기가 같은 일을 하면 조건이 쓸모없으며 대개 실수입니다.', '조건을 없애거나 달라야 할 분기를 고칩니다.'],
  msg: ['Remove this conditional structure or edit its code blocks so that they are not all the same.', '이 조건 구조를 없애거나 분기 코드가 모두 같지 않도록 고칩니다.'],
  on: {
    If(n, cx) {
      if (n.kind === 'elsif' || n.mod) return;
      const ch = H.ifChain(n);
      if (!ch.elseBody || !ch.elseBody.length) return;
      const f = A.fp(ch.elseBody);
      if (ch.branches.every((b) => b.body.length && A.fp(b.body) === f)) cx.report(n.ternary ? n : kw(n, n.kind));
    },
    Case(n, cx) {
      if (!n.else || !n.else.length || !n.whens.length) return;
      const f = A.fp(n.else);
      if (n.whens.every((w) => w.body.length && A.fp(w.body) === f)) cx.report(kw(n, 'case'));
    },
  },
  bad: `def size_of(x)
  if x > 10 # Noncompliant
    :big
  else
    :big
  end
end
def label(y) = y ? "a" : "a" # Noncompliant
`,
  good: `def size_of(x)
  if x > 10
    :big
  else
    :small
  end
end
`,
});

rule({
  id: 'duplicated-condition', type: 'B', sev: 'MA', debt: 10, ref: 'S1862', tags: ['suspicious'],
  en: ['Related "if/elsif" conditions and "when" values should not be the same', 'A repeated condition makes its second branch unreachable.', 'Fix the condition so that every branch can run, or remove the duplicate.'],
  ko: ['연관된 "if/elsif" 조건과 "when" 값이 같으면 안 됩니다', '같은 조건이 반복되면 두 번째 분기는 실행되지 않습니다.', '모든 분기가 실행될 수 있도록 조건을 고치거나 중복을 지웁니다.'],
  msg: ['This condition duplicates the one on line {0}.', '이 조건은 {0}번 줄의 조건과 같습니다.'],
  on: {
    If(n, cx) {
      if (n.kind === 'elsif' || n.mod || n.ternary) return;
      const ch = H.ifChain(n);
      const seen = new Map();
      for (const b of ch.branches) {
        const f = A.fp(b.cond);
        if (seen.has(f)) cx.report(b.cond, [seen.get(f)]);
        else seen.set(f, b.cond.line);
      }
    },
    Case(n, cx) {
      const seen = new Map();
      for (const w of n.whens) {
        for (const c of w.conds) {
          if (!A.isLiteral(c) && c.type !== 'Const') continue;
          const f = A.fp(c);
          if (seen.has(f)) cx.report(c, [seen.get(f)]);
          else seen.set(f, c.line);
        }
      }
    },
  },
  bad: `def kind(x)
  if x == 1
    :a
  elsif x == 1 # Noncompliant
    :b
  end
  case x
  when 1, 2 then :c
  when 2 then :d # Noncompliant
  end
end
`,
  good: `def kind(x)
  if x == 1
    :a
  elsif x == 2
    :b
  end
end
`,
});

rule({
  id: 'identical-methods', type: 'S', sev: 'MA', debt: 15, ref: 'S4144', tags: ['confusing', 'duplicate'],
  en: ['Methods should not have identical implementations', 'Two methods with the same body are duplicated code; a change to one is easily forgotten in the other.', 'Make one method call the other, or use alias_method.'],
  ko: ['메서드의 구현이 서로 같으면 안 됩니다', '본문이 같은 두 메서드는 중복 코드라서 한쪽만 고치기 쉽습니다.', '한 메서드가 다른 메서드를 호출하게 하거나 alias_method를 씁니다.'],
  msg: ['Update this method so that its implementation is not identical to "{0}" on line {1}.', '이 메서드의 구현이 {1}번 줄의 "{0}"와 같지 않도록 고칩니다.'],
  on: {
    'Class|Module|SClass'(n, cx) {
      const defs = A.stmtsOf(n.body).filter((s) => s.type === 'Def');
      const seen = new Map();
      for (const d of defs) {
        const body = A.stmtsOf(d.body);
        if (body.length < 2) continue;
        const f = A.fp(d.params) + '|' + A.fp(d.body) + '|' + (d.singleton ? 's' : 'i');
        if (seen.has(f)) { const o = seen.get(f); cx.report(d, [o.name, o.nameLine]); }
        else seen.set(f, d);
      }
    },
  },
  bad: `class Report
  def title
    prepare
    render(:title)
  end

  def heading # Noncompliant
    prepare
    render(:title)
  end
end
`,
  good: `class Report
  def title
    prepare
    render(:title)
  end

  alias heading title
end
`,
});

// ── structure ──────────────────────────────────────────────
rule({
  id: 'collapsible-if', type: 'S', sev: 'MA', debt: 5, ref: 'S1066', tags: ['clumsy'],
  en: ['Mergeable "if" statements should be combined', 'An "if" whose only content is another "if" without "else" adds nesting for nothing.', 'Merge both conditions with "&&".'],
  ko: ['합칠 수 있는 "if" 문은 합쳐야 합니다', '"else" 없는 다른 "if"만 담은 "if"는 쓸데없이 중첩을 늘립니다.', '두 조건을 "&&"로 합칩니다.'],
  msg: ['Merge this if statement with the enclosing one.', '이 if 문을 바깥 if 문과 합칩니다.'],
  on: {
    If(n, cx) {
      if (n.kind !== 'if' || n.mod || n.ternary || n.else) return;
      if (n.then.length !== 1) return;
      const inner = n.then[0];
      if (inner.type !== 'If' || inner.kind !== 'if' || inner.mod || inner.ternary || inner.else) return;
      cx.report(kw(inner, 'if'));
    },
  },
  bad: `def go(a, b)
  if a
    if b # Noncompliant
      run
    end
  end
end
`,
  good: `def go(a, b)
  if a && b
    run
  end
  if a
    run if b
    stop
  end
end
`,
});

rule({
  id: 'nested-case', type: 'S', sev: 'CR', debt: 10, ref: 'S1821', tags: ['brain-overload'],
  en: ['"case" statements should not be nested', 'A case inside another case is hard to read.', 'Move the inner case into its own method.'],
  ko: ['"case" 문을 중첩하지 않아야 합니다', 'case 안의 case는 읽기 어렵습니다.', '안쪽 case를 별도 메서드로 옮깁니다.'],
  msg: ['Refactor the code to eliminate this nested "case".', '중첩된 "case"가 없도록 코드를 고칩니다.'],
  on: {
    Case(n, cx) {
      for (let p = n.parent; p; p = p.parent) {
        if (p.type === 'Def' || p.type === 'Class' || p.type === 'Module' || p.type === 'Block' || p.type === 'Lambda') return;
        if (p.type === 'Case') { cx.report(kw(n, 'case')); return; }
      }
    },
  },
  bad: `def route(a, b)
  case a
  when :x
    case b # Noncompliant
    when 1 then :x1
    else :x2
    end
  else
    :y
  end
end
`,
  good: `def route(a, b)
  case a
  when :x then route_x(b)
  else :y
  end
end
`,
});

rule({
  id: 'case-too-few-clauses', type: 'S', sev: 'MI', debt: 5, ref: 'S1301', tags: ['bad-practice'],
  en: ['"case" statements should have at least 3 clauses', 'A case with one or two branches reads better as an if/else.', 'Replace the case with an if statement.'],
  ko: ['"case" 문은 절이 3개 이상이어야 합니다', '분기가 한두 개인 case는 if/else로 쓰는 편이 읽기 쉽습니다.', 'case를 if 문으로 바꿉니다.'],
  msg: ['Replace this "case" statement by "if" statements to increase readability.', '읽기 쉽도록 이 "case" 문을 "if" 문으로 바꿉니다.'],
  on: {
    Case(n, cx) {
      if (n.pattern) return;
      if (n.whens.length + (n.else ? 1 : 0) < 3) cx.report(kw(n, 'case'));
    },
  },
  bad: `def flag(x)
  case x # Noncompliant
  when 1 then :one
  else :other
  end
end
`,
  good: `def flag(x)
  case x
  when 1 then :one
  when 2 then :two
  else :other
  end
end
`,
});

rule({
  id: 'nested-ternary', type: 'S', sev: 'MA', debt: 5, ref: 'S3358', tags: ['confusing'],
  en: ['Ternary operators should not be nested', 'Nested ternaries are hard to read and their grouping is easy to misjudge.', 'Use an if/elsif/else or a case expression instead.'],
  ko: ['삼항 연산자를 중첩하지 않아야 합니다', '중첩된 삼항 연산자는 읽기 어렵고 묶임을 잘못 보기 쉽습니다.', '대신 if/elsif/else나 case 식을 씁니다.'],
  msg: ['Extract this nested ternary operation into an independent statement.', '이 중첩 삼항 연산을 별도 문장으로 뽑아냅니다.'],
  on: {
    If(n, cx) {
      if (!n.ternary) return;
      for (let p = n.parent; p; p = p.parent) {
        if (p.type === 'If' && p.ternary) { cx.report(n); return; }
        if (p.type === 'Def' || p.type === 'Block' || p.type === 'Lambda' || p.type === 'Program') return;
      }
    },
  },
  bad: `def sign(x)
  x > 0 ? 1 : (x < 0 ? -1 : 0) # Noncompliant
end
`,
  good: `def sign(x)
  return 1 if x > 0
  x < 0 ? -1 : 0
end
`,
});

rule({
  id: 'if-elsif-without-else', type: 'S', sev: 'CR', debt: 5, ref: 'S126', tags: ['cert'],
  en: ['"if ... elsif" constructs should end with "else" clauses', 'Without a final else the case where no condition matches is silently ignored.', 'Add an else clause, even if it only raises or documents the default.'],
  ko: ['"if ... elsif" 구조는 "else" 절로 끝나야 합니다', '마지막 else가 없으면 어떤 조건에도 맞지 않는 경우를 조용히 넘깁니다.', '예외를 던지거나 기본 동작을 설명하더라도 else 절을 넣습니다.'],
  msg: ['Add the missing "else" clause.', '빠진 "else" 절을 넣습니다.'],
  on: {
    If(n, cx) {
      if (n.kind !== 'if' || n.mod || n.ternary) return;
      const ch = H.ifChain(n);
      if (ch.branches.length < 2 || ch.elseBody) return;
      const last = ch.branches[ch.branches.length - 1].node;
      cx.report(kw(last, 'elsif'));
    },
  },
  bad: `def tone(x)
  if x > 0
    :up
  elsif x < 0 # Noncompliant
    :down
  end
end
`,
  good: `def tone(x)
  if x > 0
    :up
  elsif x < 0
    :down
  else
    :flat
  end
end
`,
});

rule({
  id: 'case-without-else', type: 'S', sev: 'CR', debt: 5, ref: 'S131', tags: ['cert'],
  en: ['"case" statements should have "else" clauses', 'A case without else silently returns nil for unexpected values.', 'Add an else clause that handles or rejects unexpected values.'],
  ko: ['"case" 문에는 "else" 절이 있어야 합니다', 'else 없는 case는 예상하지 못한 값에 대해 조용히 nil을 돌려줍니다.', '예상하지 못한 값을 처리하거나 거부하는 else 절을 넣습니다.'],
  msg: ['Add an "else" clause to this "case" statement.', '이 "case" 문에 "else" 절을 넣습니다.'],
  on: {
    Case(n, cx) {
      if (n.pattern || n.else) return;
      cx.report(kw(n, 'case'));
    },
  },
  bad: `def color(x)
  case x # Noncompliant
  when :r then "red"
  when :g then "green"
  when :b then "blue"
  end
end
`,
  good: `def color(x)
  case x
  when :r then "red"
  when :g then "green"
  else raise ArgumentError, "bad color"
  end
end
`,
});

rule({
  id: 'unless-else', type: 'S', sev: 'MI', debt: 2, tags: ['confusing'],
  en: ['"unless" should not be used with "else"', 'An unless/else forces the reader to negate the condition twice.', 'Use "if" and swap the branches.'],
  ko: ['"unless"에 "else"를 함께 쓰지 않아야 합니다', 'unless/else는 읽는 사람이 조건을 두 번 뒤집어 생각하게 합니다.', '"if"를 쓰고 분기를 맞바꿉니다.'],
  msg: ['Use "if" with swapped branches instead of "unless ... else".', '"unless ... else" 대신 분기를 바꾼 "if"를 씁니다.'],
  on: {
    If(n, cx) {
      if (n.kind === 'unless' && !n.mod && n.else) cx.report(kw(n, 'unless'));
    },
  },
  bad: `def state(ok)
  unless ok # Noncompliant
    :bad
  else
    :good
  end
end
`,
  good: `def state(ok)
  if ok
    :good
  else
    :bad
  end
end
`,
});

rule({
  id: 'negated-unless', type: 'S', sev: 'MI', debt: 2, tags: ['confusing'],
  en: ['"unless" should not be used with a negated condition', 'A double negative such as "unless !x" is hard to read.', 'Use "if" with the positive condition.'],
  ko: ['"unless"에 부정 조건을 쓰지 않아야 합니다', '"unless !x" 같은 이중 부정은 읽기 어렵습니다.', '긍정 조건으로 "if"를 씁니다.'],
  msg: ['Replace "unless" with "if" and remove the negation.', '"unless"를 "if"로 바꾸고 부정을 없앱니다.'],
  on: {
    If(n, cx) {
      if (n.kind !== 'unless') return;
      const c = A.strip(n.cond);
      if (c && (c.type === 'Not' || (c.type === 'Bin' && c.op === '!='))) cx.report(c);
    },
  },
  bad: `def run(job)
  start unless !job.ready? # Noncompliant
end
`,
  good: `def run(job)
  start if job.ready?
end
`,
});

rule({
  id: 'unreachable-code', type: 'B', sev: 'MA', debt: 5, ref: 'S1763', tags: ['cert', 'unused'],
  en: ['All code should be reachable', 'Statements after return, raise, break, next or redo never run.', 'Remove the dead statements or fix the control flow.'],
  ko: ['모든 코드에 도달할 수 있어야 합니다', 'return, raise, break, next, redo 뒤의 문장은 실행되지 않습니다.', '죽은 문장을 지우거나 제어 흐름을 고칩니다.'],
  msg: ['Remove this unreachable code.', '도달할 수 없는 이 코드를 지웁니다.'],
  on: {
    'Program|Def|Block|Lambda|If|While|For|When|InClause|Rescue|Begin|Case'(n, cx) {
      for (const list of H.stmtLists(n)) {
        for (let i = 0; i < list.length - 1; i++) {
          if (H.terminates(list[i])) { cx.report(list[i + 1]); break; }
        }
      }
    },
  },
  bad: `def total(x)
  return x * 2
  puts "done" # Noncompliant
end
`,
  good: `def total(x)
  return 0 if x.nil?
  x * 2
end
`,
});

// ── naming ─────────────────────────────────────────────────
rule({
  id: 'method-naming', type: 'S', sev: 'MI', debt: 5, ref: 'S100', tags: ['convention'],
  en: ['Method names should comply with a naming convention', 'Ruby methods are written in snake_case; other styles look like constants or foreign code.', 'Rename the method in snake_case.'],
  ko: ['메서드 이름은 명명 규칙을 따라야 합니다', 'Ruby 메서드는 snake_case로 쓰며 다른 형식은 상수나 낯선 코드처럼 보입니다.', '메서드 이름을 snake_case로 바꿉니다.'],
  msg: ['Rename method "{0}" to match the regular expression {1}.', '메서드 "{0}"의 이름을 정규식 {1}에 맞게 바꿉니다.'],
  on: {
    Def(n, cx) {
      const fmt = cx.opt('format', '^(_|[a-z_][a-z0-9_]*)$');
      const base = n.name.replace(/[?!=]$/, '');
      if (!/^[A-Za-z_]/.test(n.name)) return;
      if (!new RegExp(fmt).test(base)) cx.report(n, [n.name, fmt]);
    },
  },
  bad: `def computeTotal # Noncompliant
  1
end
`,
  good: `def compute_total
  1
end
def valid? = true
def <=>(other) = 0
`,
});

rule({
  id: 'class-naming', type: 'S', sev: 'MI', debt: 5, ref: 'S101', tags: ['convention'],
  en: ['Class and module names should comply with a naming convention', 'Ruby classes and modules use CamelCase.', 'Rename the class or module in CamelCase.'],
  ko: ['클래스와 모듈 이름은 명명 규칙을 따라야 합니다', 'Ruby 클래스와 모듈은 CamelCase를 씁니다.', '클래스나 모듈 이름을 CamelCase로 바꿉니다.'],
  msg: ['Rename "{0}" to match the regular expression {1}.', '"{0}"의 이름을 정규식 {1}에 맞게 바꿉니다.'],
  on: {
    'Class|Module'(n, cx) {
      const fmt = cx.opt('format', '^[A-Z][a-zA-Z0-9]*$');
      const last = n.path && n.path.name;
      if (last && !new RegExp(fmt).test(last)) cx.report(n, [last, fmt]);
    },
  },
  bad: `class Http_client # Noncompliant
end
module API_v1 # Noncompliant
end
`,
  good: `class HttpClient
end
module Api::V1
end
`,
});

rule({
  id: 'variable-naming', type: 'S', sev: 'MI', debt: 2, ref: 'S117', tags: ['convention'],
  en: ['Local variable and parameter names should comply with a naming convention', 'Ruby locals and parameters are written in snake_case.', 'Rename the variable in snake_case.'],
  ko: ['지역 변수와 매개변수 이름은 명명 규칙을 따라야 합니다', 'Ruby 지역 변수와 매개변수는 snake_case로 씁니다.', '변수 이름을 snake_case로 바꿉니다.'],
  msg: ['Rename this {0} "{1}" to match the regular expression {2}.', '이 {0} "{1}"의 이름을 정규식 {2}에 맞게 바꿉니다.'],
  file(cx) {
    const fmt = cx.opt('format', '^(_|[a-z_][a-z0-9_]*)$');
    const re = new RegExp(fmt);
    for (const s of cx.scopes.all) {
      for (const v of s.vars.values()) {
        if (re.test(v.name) || /[^\x00-\x7f]/.test(v.name)) continue;
        const isParam = v.kind === 'param' || v.kind === 'blockparam';
        cx.report(v.decl, [isParam ? 'parameter' : 'local variable', v.name, fmt], { message: { en: `Rename this ${isParam ? 'parameter' : 'local variable'} "${v.name}" to match the regular expression ${fmt}.`, ko: `이 ${isParam ? '매개변수' : '지역 변수'} "${v.name}"의 이름을 정규식 ${fmt}에 맞게 바꿉니다.` } });
      }
    }
  },
  bad: `def area(myWidth) # Noncompliant
  totalArea = myWidth * 2 # Noncompliant
  totalArea
end
`,
  good: `def area(my_width)
  total_area = my_width * 2
  total_area
end
`,
});

// ── unused code ────────────────────────────────────────────
function dynamicScope(s) {
  for (let x = s; x; x = x.parent) { if (x.dynamic) return true; if (x.hard) break; }
  return false;
}

rule({
  id: 'unused-local-variable', type: 'S', sev: 'MI', debt: 5, ref: 'S1481', tags: ['unused'],
  en: ['Unused local variables should be removed', 'A variable that is assigned but never read is dead code and may hide a mistake.', 'Remove the variable, or prefix it with "_" if it must stay.'],
  ko: ['쓰지 않는 지역 변수는 지워야 합니다', '값만 넣고 읽지 않는 변수는 죽은 코드이며 실수를 숨길 수 있습니다.', '변수를 지우거나, 남겨야 한다면 이름 앞에 "_"를 붙입니다.'],
  msg: ['Remove this unused "{0}" local variable.', '쓰지 않는 지역 변수 "{0}"를 지웁니다.'],
  file(cx) {
    for (const s of cx.scopes.all) {
      const t = s.node.type;
      if (t !== 'Def' && t !== 'Block' && t !== 'Lambda') continue;
      if (dynamicScope(s)) continue;
      for (const v of s.vars.values()) {
        if (v.kind !== 'local' || v.reads.length || !v.writes.length || v.name.startsWith('_')) continue;
        const w = v.writes[0];
        if (w.parent && w.parent.type === 'Splat') continue;
        cx.report(w, [v.name]);
      }
    }
  },
  bad: `def load(path)
  data = File.read(path)
  unused = data.size # Noncompliant
  data
end
`,
  good: `def load(path)
  data = File.read(path)
  _size = data.size
  first, = data.split
  [data, first]
end
`,
});

rule({
  id: 'unused-parameter', type: 'S', sev: 'MA', debt: 5, ref: 'S1172', tags: ['unused'],
  en: ['Unused method parameters should be removed', 'A parameter that is never used misleads callers about what the method needs.', 'Remove the parameter, or prefix it with "_" if the signature must stay.'],
  ko: ['쓰지 않는 메서드 매개변수는 지워야 합니다', '쓰지 않는 매개변수는 메서드에 무엇이 필요한지 호출자를 헷갈리게 합니다.', '매개변수를 지우거나, 시그니처를 유지해야 한다면 이름 앞에 "_"를 붙입니다.'],
  msg: ['Remove the unused method parameter "{0}".', '쓰지 않는 메서드 매개변수 "{0}"를 지웁니다.'],
  on: {
    Def(n, cx) {
      const s = cx.scopeOf(n);
      if (!s || s.dynamic || s.zsuper) return;
      const body = A.stmtsOf(n.body);
      if (!body.length) return;
      if (body.length === 1 && H.isRaise(body[0])) return;
      // Hook methods whose signature Ruby fixes (deconstruct_keys(keys) is the pattern-matching protocol).
      if (/^(method_missing|respond_to_missing\?|initialize_copy|coerce|deconstruct_keys)$/.test(n.name)) return;
      for (const p of n.params) {
        if (!p.name || p.kind === 'block' || p.name.startsWith('_') || p.kind === 'local') continue;
        const v = p._var;
        if (v && !v.reads.length) cx.report(p, [p.name]);
      }
    },
  },
  bad: `def greet(name, title) # Noncompliant
  "Hello #{name}"
end
`,
  good: `def greet(name, _title)
  "Hello #{name}"
end
def child(name)
  super
end
`,
});

const PRIVATE_KEEP = new Set(['initialize', 'method_missing', 'respond_to_missing?', 'initialize_copy', 'to_s', 'inspect']);

rule({
  id: 'unused-private-method', type: 'S', sev: 'MA', debt: 5, ref: 'S1144', tags: ['unused'],
  en: ['Unused private methods should be removed', 'A private method that is never called is dead code.', 'Remove the method, or call it where it was meant to be used.'],
  ko: ['쓰지 않는 private 메서드는 지워야 합니다', '호출되지 않는 private 메서드는 죽은 코드입니다.', '메서드를 지우거나, 쓰려던 곳에서 호출합니다.'],
  msg: ['Remove the unused private method "{0}".', '쓰지 않는 private 메서드 "{0}"를 지웁니다.'],
  file(cx) {
    const used = new Set();
    for (const n of cx.all) {
      if (n.type === 'Call') { used.add(n.name); if (n.parent && n.parent.type === 'Assign' && n.parent.target === n) used.add(n.name + '='); }
      else if (n.type === 'Ident' && !n.lvar) used.add(n.name);
      else if (n.type === 'Sym') used.add(n.name);
      else if (n.type === 'Str' && n.value && /^[a-z_]\w*[?!=]?$/.test(n.value)) used.add(n.value);
      else if (n.type === 'Alias') used.add(n.from);
      else if (n.type === 'Interp') for (const m of (n.code || '').matchAll(/[a-z_]\w*[?!]?/g)) used.add(m[0]);
    }
    for (const cls of cx.all) {
      if (cls.type !== 'Class') continue;
      let priv = false;
      const privates = [];
      const named = new Set();
      for (const s of A.stmtsOf(cls.body)) {
        if (A.isVcall(s, 'private')) { priv = true; continue; }
        if (A.isVcall(s, 'public') || A.isVcall(s, 'protected')) { priv = false; continue; }
        if (s.type === 'Call' && !s.recv && s.name === 'private' && s.args.length) {
          for (const a of s.args) {
            if (a.type === 'Def' && !a.singleton) privates.push(a);
            else if (A.symOrStr(a)) named.add(A.symOrStr(a));
          }
          continue;
        }
        if (s.type === 'Def' && !s.singleton && priv) privates.push(s);
      }
      if (named.size) for (const s of A.stmtsOf(cls.body)) if (s.type === 'Def' && !s.singleton && named.has(s.name)) privates.push(s);
      for (const d of privates) {
        if (PRIVATE_KEEP.has(d.name) || !/^[a-z_]/.test(d.name)) continue;
        if (!used.has(d.name)) cx.report(d, [d.name]);
      }
    }
  },
  bad: `class Invoice
  def total
    subtotal + tax
  end

  private

  def subtotal = 10
  def tax = 2
  def legacy_rounding # Noncompliant
    0
  end
end
`,
  good: `class Invoice
  before_save :normalize

  def total
    subtotal
  end

  private

  def subtotal = 10
  def normalize = nil
end
`,
});

// ── comments ───────────────────────────────────────────────
function tagRule(id, ref, word, sev, en, ko) {
  const re = new RegExp(`(?:^|[^A-Za-z0-9_])${word}(?![A-Za-z0-9_])`, 'i');
  rule({
    id, type: 'S', sev, debt: 0, ref, tags: ['cwe-546'],
    en, ko,
    msg: [`Take the required action to complete this "${word}" comment.`, `이 "${word}" 주석이 가리키는 작업을 마칩니다.`],
    file(cx) {
      for (const c of cx.comments) {
        const lines = c.text.split('\n');
        lines.forEach((t, i) => {
          if (re.test(t.replace(/^\s*#/, ' '))) cx.report({ line: c.line + i, col: i === 0 && c.col ? c.col : 1 });
        });
      }
    },
    bad: `def pay\n  # ${word} handle refunds # Noncompliant\n  charge\nend\n`,
    good: `def pay\n  # refunds are handled by RefundJob\n  charge\nend\n`,
  });
}

tagRule('fixme-tag', 'S1134', 'FIXME', 'MA',
  ['Track uses of "FIXME" tags', 'FIXME comments mark known defects that are easy to forget.', 'Fix the problem and remove the comment, or move it to the issue tracker.'],
  ['"FIXME" 태그 사용을 추적합니다', 'FIXME 주석은 잊기 쉬운 알려진 결함을 표시합니다.', '문제를 고치고 주석을 지우거나 이슈 트래커로 옮깁니다.']);
tagRule('todo-tag', 'S1135', 'TODO', 'IN',
  ['Track uses of "TODO" tags', 'TODO comments mark unfinished work that is easy to forget.', 'Finish the work and remove the comment, or move it to the issue tracker.'],
  ['"TODO" 태그 사용을 추적합니다', 'TODO 주석은 잊기 쉬운 미완성 작업을 표시합니다.', '작업을 마치고 주석을 지우거나 이슈 트래커로 옮깁니다.']);

module.exports = { cognitive };
