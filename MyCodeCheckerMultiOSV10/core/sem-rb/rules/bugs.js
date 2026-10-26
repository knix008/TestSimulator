'use strict';

// Reliability rules and Ruby pitfalls: suspicious operators, constant
// conditions, flow-based dead stores, error handling, debugging leftovers.

const { rule } = require('./core');
const A = require('../ast');
const H = require('./h');

const kw = (n, word) => ({ line: n.line, col: n.col, endLine: n.line, endCol: n.col + word.length, parent: n });

// ── operators / expressions ────────────────────────────────
const SAME_OPS = new Set(['==', '!=', '===', '<', '>', '<=', '>=', '&&', '||', 'and', 'or', '-', '/', '%', '^', '|', '&', '<=>', '=~', '!~', 'eql?']);

rule({
  id: 'identical-operands', type: 'B', sev: 'MA', debt: 2, ref: 'S1764', tags: ['suspicious'],
  en: ['Identical expressions should not be used on both sides of a binary operator', 'Comparing or combining an expression with itself is either useless or a copy-paste mistake.', 'Fix one of the operands, or simplify the expression.'],
  ko: ['이항 연산자 양쪽에 같은 식을 쓰지 않아야 합니다', '식을 자기 자신과 비교하거나 결합하는 것은 쓸모없거나 복사-붙여넣기 실수입니다.', '한쪽 피연산자를 고치거나 식을 단순하게 합니다.'],
  msg: ['Correct one of the identical sub-expressions on both sides of operator "{0}".', '연산자 "{0}" 양쪽의 같은 하위 식 중 하나를 고칩니다.'],
  on: {
    Bin(n, cx) {
      if (!SAME_OPS.has(n.op)) return;
      if (!H.pure(n.l) || !A.same(n.l, n.r)) return;
      if ((n.l.type === 'Int' || n.l.type === 'Float') && n.op !== '==' && n.op !== '!=') return;
      cx.report(n.r, [n.op]);
    },
  },
  bad: `def same?(a, b)
  a.size == a.size # Noncompliant
end
def both(x) = x && x # Noncompliant
`,
  good: `def same?(a, b)
  a.size == b.size
end
def shift = 1 << 1
`,
});

rule({
  id: 'self-assignment', type: 'B', sev: 'MA', debt: 3, ref: 'S1656', tags: ['suspicious'],
  en: ['Variables should not be self-assigned', 'Assigning a variable to itself has no effect and usually means the wrong name was used.', 'Assign the intended value, or remove the statement.'],
  ko: ['변수를 자기 자신에게 대입하지 않아야 합니다', '변수를 자기 자신에게 대입해도 아무 효과가 없고 대개 이름을 잘못 쓴 것입니다.', '의도한 값을 대입하거나 문장을 지웁니다.'],
  msg: ['Remove or correct this useless self-assignment of "{0}".', '"{0}"의 쓸모없는 자기 대입을 지우거나 고칩니다.'],
  on: {
    Assign(n, cx) {
      if (n.op !== '=') return;
      const t = n.target;
      if (!['Ident', 'IVar', 'CVar', 'GVar'].includes(t.type) && !(t.type === 'Call' && t.recv)) return;
      if (t.type === 'Call' && !H.pure(t)) return;
      if (A.same(t, n.value)) cx.report(n, [cx.slice(t)]);
    },
  },
  bad: `class Point
  def initialize(x)
    @x = @x # Noncompliant
  end
end
`,
  good: `class Point
  def initialize(x)
    @x = x
  end
end
`,
});

rule({
  id: 'constant-condition', type: 'B', sev: 'MA', debt: 2, ref: 'S1145', tags: ['suspicious', 'cwe-571', 'cwe-570'],
  en: ['Conditions should not be boolean literals', 'An if or unless on true or false always takes the same branch; the other branch is dead code.', 'Remove the condition and keep the branch that runs, or use the intended expression.'],
  ko: ['조건에 불리언 리터럴을 쓰지 않아야 합니다', 'true나 false에 대한 if나 unless는 항상 같은 분기로 가며 다른 분기는 죽은 코드입니다.', '조건을 지우고 실행되는 분기만 남기거나 의도한 식을 씁니다.'],
  msg: ['Remove this condition: it is always {0}.', '항상 {0}인 이 조건을 지웁니다.'],
  on: {
    If(n, cx) {
      const c = A.strip(n.cond);
      if (A.isBoolLit(c)) cx.report(c, [c.type === 'True' ? 'true' : 'false']);
    },
  },
  bad: `def flags(x)
  if true # Noncompliant
    x
  end
  y = 1 unless false # Noncompliant
  y
end
`,
  good: `def flags(x)
  if x
    x
  end
  loop do
    break
  end
end
`,
});

rule({
  id: 'boolean-literal', type: 'S', sev: 'MI', debt: 5, ref: 'S1125', tags: ['clumsy'],
  en: ['Boolean literals should not be redundant', 'Comparing to true or false, or returning them from a ternary, adds noise.', 'Use the boolean expression directly, negating it if needed.'],
  ko: ['불리언 리터럴을 군더더기로 쓰지 않아야 합니다', 'true나 false와 비교하거나 삼항식으로 돌려주는 것은 잡음만 늘립니다.', '불리언 식을 바로 쓰고, 필요하면 부정합니다.'],
  msg: ['Remove the unnecessary boolean literal.', '불필요한 불리언 리터럴을 지웁니다.'],
  on: {
    Bin(n, cx) {
      if (!['==', '!=', '&&', '||', 'and', 'or'].includes(n.op)) return;
      const lit = A.isBoolLit(A.strip(n.l)) ? n.l : A.isBoolLit(A.strip(n.r)) ? n.r : null;
      if (lit) cx.report(lit);
    },
    Not(n, cx) {
      if (A.isBoolLit(A.strip(n.e))) cx.report(n.e);
    },
    If(n, cx) {
      if (!n.ternary) return;
      const a = n.then[0];
      const b = n.else && n.else[0];
      if (A.isBoolLit(a) && A.isBoolLit(b)) cx.report(a);
    },
  },
  bad: `def ok?(x, y)
  return 1 if x == true # Noncompliant
  y.empty? ? true : false # Noncompliant
end
`,
  good: `def ok?(x, y)
  return 1 if x
  y.empty?
end
`,
});

rule({
  id: 'inverted-boolean-check', type: 'S', sev: 'MI', debt: 2, ref: 'S1940', tags: ['pitfall'],
  en: ['Boolean checks should not be inverted', 'Negating a comparison is harder to read than using the opposite operator.', 'Use the opposite comparison operator.'],
  ko: ['불리언 검사를 뒤집지 않아야 합니다', '비교를 부정하는 것은 반대 연산자를 쓰는 것보다 읽기 어렵습니다.', '반대 비교 연산자를 씁니다.'],
  msg: ['Use the opposite operator ("{0}") instead.', '대신 반대 연산자("{0}")를 씁니다.'],
  on: {
    Not(n, cx) {
      const e = A.strip(n.e);
      const opp = { '==': '!=', '!=': '==', '<': '>=', '>': '<=', '<=': '>', '>=': '<' };
      if (e && e.type === 'Bin' && opp[e.op] && n.e.type === 'Paren') cx.report(n, [opp[e.op]]);
    },
  },
  bad: `def differ?(a, b)
  !(a == b) # Noncompliant
end
`,
  good: `def differ?(a, b)
  a != b
end
`,
});

rule({
  id: 'non-existent-operator', type: 'B', sev: 'MA', debt: 5, ref: 'S2757', tags: ['pitfall'],
  en: ['Non-existent operators like "=+" should not be used', '"x =+ 1" assigns +1 instead of adding; the swapped characters are almost always a typo.', 'Write "+=", "-=" or put a space between "=" and the unary operator.'],
  ko: ['"=+" 같은 없는 연산자를 쓰지 않아야 합니다', '"x =+ 1"은 더하지 않고 +1을 대입하며, 순서가 바뀐 문자는 거의 항상 오타입니다.', '"+=", "-="로 쓰거나 "="와 단항 연산자 사이를 띄웁니다.'],
  msg: ['Was "{0}=" meant instead?', '"{0}="를 쓰려던 것인가요?'],
  on: {
    Assign(n, cx) {
      if (n.op !== '=' || !n.opSp) return;
      const v = n.value;
      if (!v || v.line !== n.opLine || v.col !== n.opCol + 1) return;
      let op = null;
      if (v.type === 'Unary' && (v.op === '-' || v.op === '+')) op = v.op;
      else if (v.type === 'Not' && !v.kw) op = '!';
      else if ((v.type === 'Int' || v.type === 'Float') && String(v.value).startsWith('-')) op = '-';
      if (!op) return;
      const after = cx.lines[v.line - 1][v.col] || '';
      if (after !== ' ' && op !== '-') return;
      if (op === '-' && v.type !== 'Unary' && after !== ' ') return;
      cx.report(v, [op]);
    },
  },
  bad: `def bump(x)
  target = 0
  target =- x # Noncompliant
  target =+ x # Noncompliant
  target
end
`,
  good: `def bump(x)
  target = 0
  target -= x
  target = -x
  target
end
`,
});

rule({
  id: 'size-comparison', type: 'B', sev: 'MA', debt: 2, ref: 'S3981', tags: ['suspicious'],
  en: ['Collection sizes comparisons should make sense', 'A size or length is never negative, so "size >= 0" is always true and "size < 0" always false.', 'Compare with the intended bound, or use empty? / any?.'],
  ko: ['컬렉션 크기 비교는 말이 되어야 합니다', '크기나 길이는 음수가 될 수 없어 "size >= 0"은 항상 참, "size < 0"은 항상 거짓입니다.', '의도한 경계와 비교하거나 empty? / any?를 씁니다.'],
  msg: ['The size of "{0}" is always ">=0", so fix this test to get the real expected behavior.', '"{0}"의 크기는 항상 0 이상이므로 원래 의도한 동작이 되도록 이 검사를 고칩니다.'],
  on: {
    Bin(n, cx) {
      const isSize = (x) => x && x.type === 'Call' && x.recv && !x.args.length && /^(size|length|count)$/.test(x.name);
      const zero = (x) => x && x.type === 'Int' && Number(x.value) === 0;
      let call = null;
      if (isSize(n.l) && zero(n.r) && (n.op === '<' || n.op === '>=')) call = n.l;
      else if (zero(n.l) && isSize(n.r) && (n.op === '>' || n.op === '<=')) call = n.r;
      if (call) cx.report(n, [cx.slice(call.recv)]);
    },
  },
  bad: `def any_items?(items)
  items.size >= 0 # Noncompliant
end
`,
  good: `def any_items?(items)
  items.size > 0
end
`,
});

rule({
  id: 'float-equality', type: 'B', sev: 'MA', debt: 5, ref: 'S1244', tags: ['pitfall'],
  en: ['Floating point numbers should not be tested for equality', 'Floating point arithmetic is not exact, so "==" on floats often fails unexpectedly.', 'Compare the difference against a tolerance, or use BigDecimal / Rational.'],
  ko: ['부동소수점 수를 같음으로 비교하지 않아야 합니다', '부동소수점 연산은 정확하지 않아 실수에 "=="를 쓰면 뜻밖에 실패하곤 합니다.', '차이를 허용 오차와 비교하거나 BigDecimal / Rational을 씁니다.'],
  msg: ['Do not test floating point numbers with the "{0}" operator.', '부동소수점 수를 "{0}" 연산자로 비교하지 않습니다.'],
  on: {
    Bin(n, cx) {
      if (n.op !== '==' && n.op !== '!=') return;
      const isF = (x) => x && x.type === 'Float' && !/^-?0\.0$/.test(x.value);
      if (isF(n.l) || isF(n.r)) cx.report(n, [n.op]);
    },
  },
  bad: `def tenth?(x)
  x * 3 == 0.3 # Noncompliant
end
`,
  good: `def tenth?(x)
  (x * 3 - 0.3).abs < 1e-9
end
`,
});

rule({
  id: 'equal-on-literal', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'],
  en: ['"equal?" should not be used to compare with a new literal', '"equal?" checks object identity; a string, array, hash or float literal creates a new object, so the result is almost always false.', 'Use "==" (value equality) or "eql?" instead.'],
  ko: ['새 리터럴과 비교할 때 "equal?"을 쓰지 않아야 합니다', '"equal?"은 객체 동일성을 검사하며, 문자열·배열·해시·실수 리터럴은 새 객체를 만들어 결과가 거의 항상 거짓입니다.', '대신 "=="(값 비교)나 "eql?"를 씁니다.'],
  msg: ['Use "==" instead of "equal?" to compare with this literal.', '이 리터럴과 비교할 때 "equal?" 대신 "=="를 씁니다.'],
  on: {
    Call(n, cx) {
      if (n.name !== 'equal?' || n.args.length !== 1 || !n.recv) return;
      const lit = (x) => x && ((x.type === 'Str' && !x.parent.frozenLit) || x.type === 'Array' || x.type === 'Hash' || x.type === 'Float' || x.type === 'Range');
      if (lit(n.args[0]) || lit(n.recv)) cx.report(n);
    },
  },
  bad: `def admin?(role)
  role.equal?("admin") # Noncompliant
end
`,
  good: `def admin?(role)
  role == "admin" || role.equal?(:admin)
end
`,
});

rule({
  id: 'and-or-assignment', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'],
  en: ['"and" / "or" should not be combined with an assignment of a value', '"and" and "or" bind more loosely than "=", so "x = a or b" assigns a and only then evaluates b.', 'Use "&&" / "||", or add parentheses around the intended expression.'],
  ko: ['값 대입에 "and" / "or"를 섞지 않아야 합니다', '"and"와 "or"는 "="보다 약하게 묶여서 "x = a or b"는 a를 대입한 뒤에야 b를 계산합니다.', '"&&" / "||"를 쓰거나 의도한 식을 괄호로 묶습니다.'],
  msg: ['"{0}" binds looser than "=": "{1}" is assigned before "{0}" runs.', '"{0}"는 "="보다 약하게 묶여 "{0}"보다 먼저 "{1}"에 대입됩니다.'],
  on: {
    Bin(n, cx) {
      if (!n.kw || (n.op !== 'and' && n.op !== 'or')) return;
      const l = n.l;
      if (!l || l.type !== 'Assign' || l.op !== '=') return;
      const r = A.strip(n.r);
      if (!r) return;
      if (['Return', 'Break', 'Next', 'Redo', 'Retry'].includes(r.type) || H.isRaise(r)) return;
      if (r.type === 'Call' && /^(raise|fail|throw|abort|exit|redirect_to|render|head)$/.test(r.name)) return;
      if (r.type === 'Call' && r.name && /!$/.test(r.name)) return;
      cx.report(n, [n.op, cx.slice(l.target)]);
    },
  },
  bad: `def ready?(a, b)
  ok = a and b # Noncompliant
  ok
end
`,
  good: `def ready?(a, b)
  ok = a && b
  user = find_user or raise ArgumentError
  [ok, user]
end
`,
});

const PURE_METHODS = new Set(['strip', 'lstrip', 'rstrip', 'upcase', 'downcase', 'capitalize', 'swapcase', 'chomp', 'chop', 'squeeze', 'reverse', 'gsub', 'sub', 'tr', 'succ', 'compact', 'flatten', 'uniq', 'sort', 'sort_by', 'merge', 'reject', 'select', 'filter', 'map', 'collect', 'except', 'slice', 'transform_values', 'transform_keys']);

rule({
  id: 'ignored-return-value', type: 'B', sev: 'MA', debt: 5, ref: 'S2201', tags: ['suspicious'],
  en: ['Return values of non-mutating methods should not be ignored', 'Methods such as strip, upcase, merge or sort return a new object; calling them as a statement has no effect.', 'Use the result, or call the bang variant (strip!, merge!, sort!) to change the receiver.'],
  ko: ['값을 바꾸지 않는 메서드의 반환값을 버리지 않아야 합니다', 'strip, upcase, merge, sort 같은 메서드는 새 객체를 돌려주므로 문장으로만 호출하면 효과가 없습니다.', '결과를 쓰거나, 수신자를 바꾸려면 느낌표 버전(strip!, merge!, sort!)을 호출합니다.'],
  msg: ['The return value of "{0}" is ignored; use it or call "{0}!".', '"{0}"의 반환값을 버리고 있습니다. 값을 쓰거나 "{0}!"를 호출합니다.'],
  on: {
    Call(n, cx) {
      if (!n.recv || !PURE_METHODS.has(n.name)) return;
      if (n.block && (n.name === 'map' || n.name === 'select' || n.name === 'reject' || n.name === 'filter' || n.name === 'collect' || n.name === 'sort_by')) {
        // block may have side effects (each-like misuse); still a smell but not reported
        return;
      }
      const p = n.parent;
      if (!p) return;
      const lists = H.stmtLists(p);
      for (const list of lists) {
        const i = list.indexOf(n);
        if (i >= 0 && i < list.length - 1) { cx.report(n, [n.name]); return; }
      }
    },
  },
  bad: `def clean(name)
  name.strip # Noncompliant
  name
end
`,
  good: `def clean(name)
  name.strip!
  name.strip
end
`,
});

// ── flow ───────────────────────────────────────────────────
const TRIVIAL = (v) => {
  v = A.strip(v);
  if (!v) return true;
  if (v.type === 'Nil' || v.type === 'True' || v.type === 'False') return true;
  if (v.type === 'Int' && ['0', '1', '-1'].includes(v.value)) return true;
  if (v.type === 'Str' && v.value === '') return true;
  if ((v.type === 'Array' && !v.elems.length && !v.implicit) || (v.type === 'Hash' && !v.pairs.length)) return true;
  return false;
};

function dynamicScope(s) {
  for (let x = s; x; x = x.parent) { if (x.dynamic) return true; if (x.hard) break; }
  return false;
}

rule({
  id: 'dead-store', type: 'S', sev: 'MA', debt: 15, ref: 'S1854', tags: ['cwe-563', 'unused'],
  en: ['Unused assignments should be removed', 'A value that is overwritten or never read before the method ends is wasted work and often a logic error.', 'Remove the assignment, or use the value where it was intended.'],
  ko: ['쓰지 않는 대입은 지워야 합니다', '덮어쓰이거나 메서드가 끝날 때까지 읽히지 않는 값은 헛일이며 논리 오류인 경우가 많습니다.', '대입을 지우거나 원래 쓰려던 곳에서 값을 씁니다.'],
  msg: ['Remove this useless assignment to local variable "{0}".', '지역 변수 "{0}"에 대한 쓸모없는 대입을 지웁니다.'],
  on: {
    Def(n, cx) {
      const s = cx.scopeOf(n);
      if (!s || dynamicScope(s)) return;
      const f = cx.flow(n);
      if (!f) return;
      for (const d of f.dead) {
        const v = d.v;
        if (v.scope !== s || v.captured || v.name.startsWith('_') || d.dead) continue;
        if (v.kind !== 'local' && v.kind !== 'param') continue;
        if (!v.reads.filter((r) => !(r.parent && r.parent.type === 'Assign' && r.parent.target === r)).length && v.kind === 'local') continue;
        const w = d.node;
        const asg = w.parent && w.parent.type === 'Assign' && w.parent.target === w ? w.parent : null;
        if (!asg) continue;
        if (asg.op === '=' && TRIVIAL(asg.value)) continue;
        cx.report(asg, [v.name]);
      }
    },
  },
  bad: `def price(qty)
  total = qty * 10 # Noncompliant
  total = qty * 12
  total
end
`,
  good: `def price(qty)
  total = nil
  total = qty * 10 if qty
  total
end
`,
});

rule({
  id: 'parameter-reassigned', type: 'S', sev: 'MA', debt: 5, ref: 'S1226', tags: ['pitfall'],
  en: ['Method parameters should not be overwritten before they are read', 'Overwriting a parameter before using it ignores what the caller passed in.', 'Use the parameter value, or introduce a new local variable.'],
  ko: ['메서드 매개변수를 읽기 전에 덮어쓰지 않아야 합니다', '매개변수를 쓰기 전에 덮어쓰면 호출자가 넘긴 값을 무시하게 됩니다.', '매개변수 값을 쓰거나 새 지역 변수를 만듭니다.'],
  msg: ['Introduce a new variable instead of reusing the parameter "{0}".', '매개변수 "{0}"를 재사용하지 말고 새 변수를 만듭니다.'],
  on: {
    Def(n, cx) {
      const s = cx.scopeOf(n);
      if (!s || dynamicScope(s) || s.zsuper) return;
      const f = cx.flow(n);
      if (!f) return;
      const liveAtEntry = f.live.liveIn[f.g.entry.id];
      for (const p of n.params) {
        const v = p._var;
        if (!v || v.captured || !v.writes.length || p.name.startsWith('_')) continue;
        if (!['req', 'opt', 'key', 'keyreq'].includes(p.kind)) continue;
        if (liveAtEntry.has(v)) continue;
        const w = v.writes[0];
        if (!v.reads.length) continue;
        cx.report(w.parent && w.parent.type === 'Assign' ? w.parent : w, [p.name]);
      }
    },
  },
  bad: `def label(name)
  name = "default" # Noncompliant
  name.upcase
end
`,
  good: `def label(name)
  name = "default" if name.nil?
  name.upcase
end
`,
});

// ── exceptions ─────────────────────────────────────────────
rule({
  id: 'rescue-exception', type: 'B', sev: 'CR', debt: 10, tags: ['error-handling', 'cwe-396'],
  en: ['"Exception" should not be rescued', 'Rescuing Exception also catches SignalException, SystemExit and NoMemoryError, so Ctrl-C and exit stop working.', 'Rescue StandardError (a bare "rescue") or the specific errors you expect.'],
  ko: ['"Exception"을 rescue하지 않아야 합니다', 'Exception을 잡으면 SignalException, SystemExit, NoMemoryError까지 잡아서 Ctrl-C와 exit가 듣지 않습니다.', 'StandardError(빈 "rescue")나 예상하는 구체적인 오류만 잡습니다.'],
  msg: ['Rescue StandardError or a more specific class instead of "Exception".', '"Exception" 대신 StandardError나 더 구체적인 클래스를 잡습니다.'],
  on: {
    Rescue(n, cx) {
      for (const c of n.classes) if (A.constPath(c) === 'Exception' || (c.type === 'Const' && c.top && c.name === 'Exception')) cx.report(c);
    },
  },
  bad: `def safe
  work
rescue Exception => e # Noncompliant
  log(e)
end
`,
  good: `def safe
  work
rescue StandardError => e
  log(e)
end
`,
});

rule({
  id: 'empty-rescue', type: 'B', sev: 'MA', debt: 10, ref: 'S2486', tags: ['error-handling', 'cwe-391'],
  en: ['Exceptions should not be silently swallowed', 'An empty rescue hides failures, which makes bugs very hard to diagnose.', 'Handle the error, log it, re-raise it, or explain with a comment why it is ignored.'],
  ko: ['예외를 조용히 삼키지 않아야 합니다', '빈 rescue는 실패를 숨겨서 버그를 찾기 아주 어렵게 만듭니다.', '오류를 처리하거나 기록하거나 다시 발생시키고, 무시한다면 그 이유를 주석으로 남깁니다.'],
  msg: ['Handle this exception or don\'t catch it at all.', '이 예외를 처리하거나 아예 잡지 않습니다.'],
  on: {
    Rescue(n, cx) {
      if (n.body.length) return;
      const owner = n.parent;
      let next = owner.endLine;
      const i = owner.rescues.indexOf(n);
      if (i + 1 < owner.rescues.length) next = owner.rescues[i + 1].line;
      else if (owner.elseBody && owner.elseBody.length) next = owner.elseBody[0].line;
      else if (owner.ensure && owner.ensure.length) next = owner.ensure[0].line;
      if (H.hasCommentIn(cx, n.line, next)) return;
      cx.report(kw(n, 'rescue'));
    },
  },
  bad: `def fetch
  call_api
rescue Timeout::Error # Noncompliant
end
`,
  good: `def fetch
  call_api
rescue Timeout::Error
  # the cache below is good enough when the API is slow
  cached
end
`,
});

rule({
  id: 'rescue-modifier', type: 'S', sev: 'MA', debt: 5, tags: ['error-handling'],
  en: ['The "rescue" modifier should not be used', '"expr rescue value" silently swallows every StandardError raised by expr, including NoMethodError from typos.', 'Use a begin/rescue block that names the errors you expect.'],
  ko: ['"rescue" 수식어를 쓰지 않아야 합니다', '"식 rescue 값"은 식에서 나는 모든 StandardError를 조용히 삼키며, 오타로 생긴 NoMethodError도 마찬가지입니다.', '예상하는 오류를 명시한 begin/rescue 블록을 씁니다.'],
  msg: ['Avoid using "rescue" in its modifier form.', '"rescue"를 수식어 형태로 쓰지 않습니다.'],
  on: {
    RescueMod(n, cx) {
      cx.report(n);
    },
  },
  bad: `def age(s)
  Integer(s) rescue 0 # Noncompliant
end
`,
  good: `def age(s)
  Integer(s)
rescue ArgumentError
  0
end
`,
});

rule({
  id: 'return-in-ensure', type: 'B', sev: 'CR', debt: 5, ref: 'S1143', tags: ['error-handling'],
  en: ['"return" should not be used in an "ensure" block', 'A return inside ensure discards any exception in flight and overrides the normal return value.', 'Move the return out of the ensure block.'],
  ko: ['"ensure" 블록에서 "return"을 쓰지 않아야 합니다', 'ensure 안의 return은 진행 중인 예외를 버리고 정상 반환값도 덮어씁니다.', 'return을 ensure 블록 밖으로 옮깁니다.'],
  msg: ['Remove this "return" from the "ensure" block.', '"ensure" 블록에서 이 "return"을 지웁니다.'],
  on: {
    Return(n, cx) {
      let child = n;
      for (let p = n.parent; p; child = p, p = p.parent) {
        if (p.type === 'Def' || p.type === 'Lambda' || p.type === 'Block' || p.type === 'Program') return;
        if (p.type === 'Begin' && p.ensure && p.ensure.includes(child)) { cx.report(kw(n, 'return')); return; }
      }
    },
  },
  bad: `def read
  File.read("x")
ensure
  return nil # Noncompliant
end
`,
  good: `def read
  File.read("x")
ensure
  cleanup
end
`,
});

// ── leftovers ──────────────────────────────────────────────
rule({
  id: 'debugger-statement', type: 'B', sev: 'MA', debt: 2, ref: 'S4507', tags: ['debug', 'cwe-489'],
  en: ['Debugger calls should not be left in code', 'binding.pry, byebug, debugger and binding.irb stop the process waiting for input in production.', 'Remove the debugger call.'],
  ko: ['디버거 호출을 코드에 남기지 않아야 합니다', 'binding.pry, byebug, debugger, binding.irb는 운영 환경에서 입력을 기다리며 프로세스를 멈춥니다.', '디버거 호출을 지웁니다.'],
  msg: ['Remove this debugger call "{0}".', '디버거 호출 "{0}"를 지웁니다.'],
  on: {
    'Call|Ident'(n, cx) {
      if (n.type === 'Ident' && n.lvar) return;
      if (n.type === 'Call' && n.recv) {
        const r = n.recv;
        if ((A.isVcall(r, 'binding') && /^(pry|irb|remote_pry|pry_remote|b)$/.test(n.name)) || (A.constPath(r) === 'Pry' && n.name === 'start') || (A.constPath(r) === 'Byebug' && n.name === 'start')) cx.report(n, [cx.slice(n)]);
        return;
      }
      const name = n.name;
      if ((name === 'byebug' || name === 'debugger' || name === 'remote_byebug') && (n.type === 'Ident' || !n.args.length)) cx.report(n, [name]);
    },
  },
  bad: `def charge(order)
  binding.pry # Noncompliant
  byebug # Noncompliant
  order.pay
end
`,
  good: `def charge(order)
  logger.debug("charging")
  order.pay
end
`,
});

rule({
  id: 'debug-output', type: 'S', sev: 'MI', debt: 2, ref: 'S106', tags: ['debug'],
  en: ['Debug output should not be left in application code', 'puts, print, p and pp in application code write to stdout instead of the log and are usually debugging leftovers.', 'Use the application logger, or remove the statement.'],
  ko: ['디버그 출력을 애플리케이션 코드에 남기지 않아야 합니다', '애플리케이션 코드의 puts, print, p, pp는 로그 대신 표준 출력에 쓰며 대개 디버깅 흔적입니다.', '애플리케이션 로거를 쓰거나 문장을 지웁니다.'],
  msg: ['Replace this "{0}" call by a logger call, or remove it.', '"{0}" 호출을 로거 호출로 바꾸거나 지웁니다.'],
  samplePath: 'app/models/order.rb',
  on: {
    Call(n, cx) {
      if (n.recv || n.block || cx.isTest) return;
      if (/(?:^|\/)(?:bin|exe|script|scripts|db|tasks)\/|\.rake$|Rakefile$|\.gemspec$/i.test(cx.path)) return;
      const appCode = /(?:^|\/)(?:app|lib)\//.test(cx.path);
      if ((n.name === 'p' || n.name === 'pp') && n.args.length) cx.report(n, [n.name]);
      else if (appCode && (n.name === 'puts' || n.name === 'print') && n.args.length) cx.report(n, [n.name]);
    },
  },
  bad: `class Order
  def pay
    puts "paying #{id}" # Noncompliant
    p self # Noncompliant
  end
end
`,
  good: `class Order
  def pay
    Rails.logger.info("paying #{id}")
  end
end
`,
});

// ── classes / methods ──────────────────────────────────────
const GLOBAL_OK = new Set(['$stdout', '$stderr', '$stdin', '$PROGRAM_NAME', '$VERBOSE', '$DEBUG', '$LOAD_PATH', '$LOADED_FEATURES', '$0', '$,', '$/', '$;', '$\\', '$!', '$@', '$~', '$_', '$*', '$:', '$"', '$<', '$>', '$.']);

rule({
  id: 'global-variable', type: 'S', sev: 'MA', debt: 10, tags: ['design'],
  en: ['Global variables should not be defined', 'Custom global variables create hidden coupling between unrelated parts of the program.', 'Use a constant, a module-level accessor or dependency injection instead.'],
  ko: ['전역 변수를 정의하지 않아야 합니다', '직접 만든 전역 변수는 관계없는 코드 사이에 숨은 결합을 만듭니다.', '대신 상수, 모듈 수준 접근자, 의존성 주입을 씁니다.'],
  msg: ['Do not introduce the global variable "{0}".', '전역 변수 "{0}"를 만들지 않습니다.'],
  on: {
    Assign(n, cx) {
      if (n.target.type === 'GVar' && !GLOBAL_OK.has(n.target.name)) cx.report(n.target, [n.target.name]);
    },
  },
  bad: `$counter = 0 # Noncompliant
def tick = $counter += 1 # Noncompliant
`,
  good: `$stdout.sync = true
COUNTER = [0].freeze
`,
});

rule({
  id: 'class-variable', type: 'S', sev: 'MA', debt: 10, tags: ['design', 'pitfall'],
  en: ['Class variables should not be used', 'Class variables (@@x) are shared with every subclass, so a subclass silently changes the parent\'s value.', 'Use a class-level instance variable with an accessor, or a constant.'],
  ko: ['클래스 변수를 쓰지 않아야 합니다', '클래스 변수(@@x)는 모든 하위 클래스와 공유되어 하위 클래스가 부모 값을 몰래 바꿉니다.', '접근자를 둔 클래스 수준 인스턴스 변수나 상수를 씁니다.'],
  msg: ['Replace the class variable "{0}" by a class instance variable.', '클래스 변수 "{0}"를 클래스 인스턴스 변수로 바꿉니다.'],
  on: {
    Assign(n, cx) {
      if (n.target.type === 'CVar' && n.op === '=') cx.report(n.target, [n.target.name]);
    },
  },
  bad: `class Cache
  @@store = {} # Noncompliant
end
`,
  good: `class Cache
  @store = {}
  class << self
    attr_reader :store
  end
end
`,
});

rule({
  id: 'method-missing-without-respond-to', type: 'B', sev: 'MA', debt: 10, tags: ['pitfall'],
  en: ['"method_missing" should be paired with "respond_to_missing?"', 'Without respond_to_missing?, respond_to? and method() lie about the dynamic methods the object supports.', 'Define respond_to_missing? that answers true for the names method_missing handles.'],
  ko: ['"method_missing"에는 "respond_to_missing?"을 함께 정의해야 합니다', 'respond_to_missing?이 없으면 respond_to?와 method()가 객체가 지원하는 동적 메서드를 잘못 알려 줍니다.', 'method_missing이 처리하는 이름에 true를 돌려주는 respond_to_missing?을 정의합니다.'],
  msg: ['Define "respond_to_missing?" together with "method_missing".', '"method_missing"과 함께 "respond_to_missing?"을 정의합니다.'],
  on: {
    'Class|Module'(n, cx) {
      const defs = A.stmtsOf(n.body).filter((s) => s.type === 'Def' || (s.type === 'Call' && s.args[0] && s.args[0].type === 'Def')).map((s) => (s.type === 'Def' ? s : s.args[0]));
      const mm = defs.find((d) => d.name === 'method_missing' && !d.singleton);
      if (mm && !defs.some((d) => d.name === 'respond_to_missing?')) cx.report(mm);
    },
  },
  bad: `class Proxy
  def method_missing(name, *args) # Noncompliant
    target.public_send(name, *args)
  end
end
`,
  good: `class Proxy
  def method_missing(name, *args)
    target.respond_to?(name) ? target.public_send(name, *args) : super
  end

  def respond_to_missing?(name, include_private = false)
    target.respond_to?(name, include_private) || super
  end
end
`,
});

rule({
  id: 'nested-method-definition', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'],
  en: ['Methods should not be defined inside other methods', 'A def inside a method body defines (or redefines) an instance method on the class every time the outer method runs.', 'Move the inner method to the class body, or use a lambda.'],
  ko: ['메서드 안에서 다른 메서드를 정의하지 않아야 합니다', '메서드 본문 안의 def는 바깥 메서드가 실행될 때마다 클래스에 인스턴스 메서드를 (다시) 정의합니다.', '안쪽 메서드를 클래스 본문으로 옮기거나 람다를 씁니다.'],
  msg: ['Move the definition of "{0}" out of the method "{1}".', '"{0}"의 정의를 메서드 "{1}" 밖으로 옮깁니다.'],
  on: {
    Def(n, cx) {
      for (let p = n.parent; p; p = p.parent) {
        if (p.type === 'Class' || p.type === 'Module' || p.type === 'SClass' || p.type === 'Block' || p.type === 'Lambda') return;
        if (p.type === 'Def') { if (!n.singleton) cx.report(n, [n.name, p.name]); return; }
      }
    },
  },
  bad: `class Builder
  def build
    def helper # Noncompliant
      1
    end
    helper
  end
end
`,
  good: `class Builder
  def build
    helper
  end

  def helper
    1
  end
end
`,
});

rule({
  id: 'redundant-to-s-interpolation', type: 'S', sev: 'MI', debt: 1, tags: ['clumsy'],
  en: ['"to_s" should not be called inside string interpolation', 'Interpolation already calls to_s on the value.', 'Remove the explicit to_s call.'],
  ko: ['문자열 보간 안에서 "to_s"를 호출하지 않아야 합니다', '보간은 이미 값에 to_s를 호출합니다.', '명시적인 to_s 호출을 지웁니다.'],
  msg: ['Remove the redundant "to_s" in this interpolation.', '이 보간의 불필요한 "to_s"를 지웁니다.'],
  on: {
    Interp(n, cx) {
      if (n.body.length !== 1) return;
      const e = n.body[0];
      if (e.type === 'Call' && e.name === 'to_s' && e.recv && !e.args.length && !e.block) cx.report(e);
    },
  },
  bad: `def tag(id)
  "item-#{id.to_s}" # Noncompliant
end
`,
  good: `def tag(id)
  "item-#{id}"
end
`,
});

module.exports = {};
