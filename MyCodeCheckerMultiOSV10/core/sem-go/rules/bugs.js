'use strict';

// Bug patterns: suspicious expressions, error handling, concurrency, loops,
// standard library misuse.

const { rule, gf } = require('./core');
const A = require('../ast');
const H = require('./h');
const { PURE } = require('../stdlib');

const COMPARE_OR_LOGIC = new Set(['==', '!=', '<', '<=', '>', '>=', '&&', '||', '-', '/', '%', '^', '&^', '|', '&']);

function hasCallOrRecv(e) {
  let found = false;
  A.walk(e, (x) => { if (x.k === 'Call' || (x.k === 'Unary' && x.op === '<-')) found = true; return !found; });
  return found;
}

// ── expressions ──
rule({
  id: 'identical-operands', type: 'B', sev: 'MA', debt: 2, tags: ['suspicious'], ref: 'S1764',
  en: ['Identical expressions should not be used on both sides of a binary operator', 'x == x, a - a or b && b is always the same value and usually a typo.', 'Fix the operand that was meant to be different.'],
  ko: ['이항 연산자 양쪽에 같은 식을 쓰면 안 됩니다', 'x == x, a - a, b && b는 항상 같은 값이고 보통 오타입니다.', '달라야 했던 피연산자를 고치세요.'],
  on: {
    Binary(n, cx) {
      if (!COMPARE_OR_LOGIC.has(n.op)) return;
      const x = A.strip(n.x);
      const y = A.strip(n.y);
      if (!A.same(x, y) || hasCallOrRecv(x)) return;
      if (A.isNum(x) && (n.op === '/' || n.op === '-' || n.op === '%' || n.op === '|' || n.op === '&' || n.op === '^')) return;
      cx.report(n, `Correct one of the identical sub-expressions on both sides of operator '${n.op}'.`, `연산자 '${n.op}' 양쪽의 같은 하위 식 중 하나를 고치세요.`, { line: n.opLine || n.line, col: n.opCol || n.col });
    },
  },
  bad: gf(`
func f(a, b int) bool {
	return a == a // Noncompliant
}
`),
  good: gf(`
func f(a, b int) bool {
	return a == b
}
`),
});

rule({
  id: 'self-assignment', type: 'B', sev: 'MA', debt: 3, tags: ['suspicious'], ref: 'S1656',
  en: ['Variables should not be self-assigned', 'x = x has no effect and usually hides a mistake.', 'Assign the intended value or remove the statement.'],
  ko: ['변수를 자기 자신에게 대입하면 안 됩니다', 'x = x는 효과가 없고 보통 실수를 숨깁니다.', '의도한 값을 대입하거나 문장을 지우세요.'],
  on: {
    Assign(n, cx) {
      if (n.op !== '=' || n.lhs.length !== n.rhs.length) return;
      n.lhs.forEach((l, i) => {
        if (A.same(A.strip(l), A.strip(n.rhs[i])) && !hasCallOrRecv(l) && !A.isIdent(l, '_')) cx.report(l, `Remove or correct this useless self-assignment of '${cx.norm(l)}'.`, `'${cx.norm(l)}'을(를) 자기 자신에게 대입하는 쓸모없는 문장을 지우거나 고치세요.`);
      });
    },
  },
  bad: gf(`
type point struct{ x, y int }

func (p *point) set(x, y int) {
	p.x = p.x // Noncompliant
	p.y = y
	_ = x
}
`),
  good: gf(`
type point struct{ x, y int }

func (p *point) set(x, y int) {
	p.x = x
	p.y = y
}
`),
});

rule({
  id: 'misleading-assign-op', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S2757',
  en: ['"=+" should not be used instead of "+="', 'x =+ y assigns +y instead of adding y; the same holds for =- and =!.', 'Write the compound operator (+=, -=) or put a space after "=".'],
  ko: ['"+=" 대신 "=+"를 쓰면 안 됩니다', 'x =+ y는 y를 더하지 않고 +y를 대입합니다. =-, =!도 같습니다.', '복합 연산자(+=, -=)를 쓰거나 "=" 뒤에 공백을 두세요.'],
  on: {
    Assign(n, cx) {
      if ((n.op !== '=' && n.op !== ':=') || n.rhs.length !== 1) return;
      const r = n.rhs[0];
      if (r.k !== 'Unary' || !['+', '-', '!', '^'].includes(r.op)) return;
      const src = cx.src;
      if (src[r.pos - 1] === '=' && /\s/.test(src[r.pos + 1] || '') && /\s/.test(src[r.pos - 2] || '')) {
        cx.report(r, `Was '${r.op}=' meant instead of '=${r.op}'?`, `'=${r.op}' 대신 '${r.op}='를 의도했나요?`);
      }
    },
  },
  bad: gf(`
func f(total, x int) int {
	total =+ x // Noncompliant
	return total
}
`),
  good: gf(`
func f(total, x int) int {
	total += x
	total = -x
	return total
}
`),
});

const PRINTF = {
  'fmt.Printf': 0, 'fmt.Sprintf': 0, 'fmt.Errorf': 0, 'fmt.Fprintf': 1, 'fmt.Appendf': 1,
  'log.Printf': 0, 'log.Fatalf': 0, 'log.Panicf': 0,
};
const PRINTF_METHODS = new Set(['Printf', 'Errorf', 'Fatalf', 'Logf', 'Infof', 'Warnf', 'Warningf', 'Debugf', 'Panicf', 'Skipf', 'Tracef']);
function formatIndex(call) {
  const q = H.q(call);
  if (q && PRINTF[q] !== undefined) return PRINTF[q];
  const f = A.strip(call.fun);
  if (!q && f && f.k === 'Selector' && PRINTF_METHODS.has(f.sel.name)) {
    const x = A.strip(f.x);
    if (x && x.k === 'Ident' && x.sym && x.sym.kind === 'pkg') return -1;
    return 0;
  }
  return -1;
}
function literalString(e) {
  e = A.strip(e);
  if (!e) return null;
  if (e.k === 'BasicLit' && e.kind === 'string') return e.s;
  if (e.k === 'Binary' && e.op === '+') { const a = literalString(e.x); const b = literalString(e.y); return a != null && b != null ? a + b : null; }
  return null;
}
// number of arguments a format string consumes, or -1 when it uses explicit indexes
function countVerbs(fmt) {
  let n = 0;
  for (let i = 0; i < fmt.length; i++) {
    if (fmt[i] !== '%') continue;
    i++;
    if (fmt[i] === '%') continue;
    while (i < fmt.length && '+-# 0'.includes(fmt[i])) i++;
    if (fmt[i] === '[') return -1;
    if (fmt[i] === '*') { n++; i++; } else while (i < fmt.length && /[0-9]/.test(fmt[i])) i++;
    if (fmt[i] === '.') {
      i++;
      if (fmt[i] === '[') return -1;
      if (fmt[i] === '*') { n++; i++; } else while (i < fmt.length && /[0-9]/.test(fmt[i])) i++;
    }
    if (fmt[i] === '[') return -1;
    if (i < fmt.length) n++;
  }
  return n;
}
rule({
  id: 'printf-mismatch', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: '', checker: 'PRINTF_ARGS',
  en: ['Printf-style format strings should match their arguments', 'A different number of verbs and arguments prints %!d(MISSING) or %!(EXTRA ...) instead of the intended text.', 'Make the verbs and the arguments agree.'],
  ko: ['Printf 형식 문자열은 인수와 맞아야 합니다', '형식 지정자와 인수 개수가 다르면 의도한 글 대신 %!d(MISSING)이나 %!(EXTRA ...)가 출력됩니다.', '형식 지정자와 인수를 맞추세요.'],
  on: {
    Call(n, cx) {
      const idx = formatIndex(n);
      if (idx < 0 || n.ellipsis || n.args.length <= idx) return;
      const fmt = literalString(n.args[idx]);
      if (fmt == null) return;
      const want = countVerbs(fmt);
      if (want < 0) return;
      const got = n.args.length - idx - 1;
      if (want !== got) {
        const name = A.dotted(n.fun) || 'printf';
        cx.report(n, `'${name}' format reads ${want} argument(s) but ${got} are given.`, `'${name}'의 형식은 인수 ${want}개를 읽지만 ${got}개를 넘깁니다.`);
      }
    },
  },
  bad: gf(`
import "fmt"

func f(name string, n int) string {
	return fmt.Sprintf("%s has %d items in %s", name, n) // Noncompliant
}
`),
  good: gf(`
import "fmt"

func f(name string, n int) string {
	return fmt.Sprintf("%s has %d items (100%%) %*d", name, n, 4, n)
}
`),
});

const PRINTLN = new Set(['fmt.Println', 'fmt.Print', 'fmt.Sprintln', 'fmt.Sprint', 'log.Println', 'log.Print', 'log.Fatal', 'log.Fatalln', 'log.Panic', 'log.Panicln']);
rule({
  id: 'println-format', type: 'B', sev: 'MI', debt: 2, tags: ['suspicious'], ref: '', checker: 'PRINTF_ARGS',
  en: ['Print and Println should not be given formatting directives', 'Println does not interpret %d or %s; the verbs are printed literally.', 'Use the Printf variant.'],
  ko: ['Print와 Println에 형식 지정자를 넘기면 안 됩니다', 'Println은 %d나 %s를 해석하지 않고 그대로 출력합니다.', 'Printf 계열 함수를 쓰세요.'],
  on: {
    Call(n, cx) {
      const q = H.q(n);
      if (!q || !PRINTLN.has(q) || !n.args.length) return;
      const s = literalString(n.args[0]);
      if (s != null && /%[-+# 0]*\d*(\.\d+)?[vTtbcdoOqxXUeEfFgGsp]/.test(s) && n.args.length > 1) cx.report(n, `'${q}' call has a possible formatting directive; use the 'f' variant.`, `'${q}' 호출에 형식 지정자로 보이는 것이 있습니다. 'f' 계열 함수를 쓰세요.`);
    },
  },
  bad: gf(`
import "fmt"

func f(n int) {
	fmt.Println("count: %d", n) // Noncompliant
}
`),
  good: gf(`
import "fmt"

func f(n int) {
	fmt.Printf("count: %d\\n", n)
	fmt.Println("100%", n)
}
`),
});

rule({
  id: 'int-division-to-float', type: 'B', sev: 'MI', debt: 5, tags: ['cwe-190', 'overflow'], ref: 'S2184',
  en: ['Integer division should not be converted to floating point afterwards', 'float64(a / b) divides as integers first, so the fraction is lost.', 'Convert the operands before dividing: float64(a) / float64(b).'],
  ko: ['정수 나눗셈 결과를 나중에 실수로 바꾸면 안 됩니다', 'float64(a / b)는 먼저 정수로 나누므로 소수 부분을 잃습니다.', '나누기 전에 피연산자를 바꾸세요: float64(a) / float64(b).'],
  on: {
    Call(n, cx) {
      const f = A.strip(n.fun);
      if (!f || f.k !== 'Ident' || (f.name !== 'float64' && f.name !== 'float32') || !(f.sym && f.sym.builtin) || n.args.length !== 1) return;
      const d = A.strip(n.args[0]);
      if (!d || d.k !== 'Binary' || d.op !== '/') return;
      const intish = (e) => { e = A.strip(e); if (e.k === 'BasicLit') return e.kind === 'int'; const t = H.typeOf(cx.pf, e); return H.isIntType(t); };
      if (intish(d.x) && intish(d.y)) cx.report(d, `This integer division is truncated before the conversion to ${f.name}.`, `이 정수 나눗셈은 ${f.name}(으)로 바꾸기 전에 잘립니다.`);
    },
  },
  bad: gf(`
func ratio(done, total int) float64 {
	return float64(done / total) // Noncompliant
}
`),
  good: gf(`
func ratio(done, total int) float64 {
	return float64(done) / float64(total)
}
`),
});

rule({
  id: 'index-gt-zero', type: 'B', sev: 'MI', debt: 2, tags: ['suspicious'], ref: 'S2692',
  en: ['"Index" checks should not be for positive numbers', 'strings.Index(s, x) > 0 misses a match at position 0.', 'Compare with >= 0, or use strings.Contains.'],
  ko: ['"Index" 결과를 양수인지로 검사하면 안 됩니다', 'strings.Index(s, x) > 0은 0번 위치에서 찾은 경우를 놓칩니다.', '>= 0과 비교하거나 strings.Contains를 쓰세요.'],
  on: {
    Binary(n, cx) {
      const isIdx = (e) => { const q = H.q(A.strip(e)); return !!q && /^(strings|bytes)\.(Index|IndexByte|IndexRune|IndexAny|LastIndex)$/.test(q); };
      if ((n.op === '>' && isIdx(n.x) && H.numVal(n.y) === 0) || (n.op === '<' && isIdx(n.y) && H.numVal(n.x) === 0)) cx.report(n, 'This check misses a match at index 0; use >= 0 or strings.Contains.', '이 검사는 0번 위치의 일치를 놓칩니다. >= 0이나 strings.Contains를 쓰세요.');
    },
  },
  bad: gf(`
import "strings"

func has(s string) bool {
	return strings.Index(s, "go") > 0 // Noncompliant
}
`),
  good: gf(`
import "strings"

func has(s string) bool {
	return strings.Index(s, "go") >= 0 || strings.Contains(s, "x")
}
`),
});

rule({
  id: 'len-nonnegative', type: 'B', sev: 'MA', debt: 2, tags: ['suspicious'], ref: 'S3981',
  en: ['Length and capacity comparisons should be meaningful', 'len() and cap() are never negative, so len(x) >= 0 is always true and len(x) < 0 always false.', 'Compare with > 0 or remove the check.'],
  ko: ['길이와 용량 비교는 의미가 있어야 합니다', 'len()과 cap()은 음수가 될 수 없으므로 len(x) >= 0은 항상 참, len(x) < 0은 항상 거짓입니다.', '> 0과 비교하거나 검사를 지우세요.'],
  on: {
    Binary(n, cx) {
      const isLen = (e) => { e = A.strip(e); if (!e || e.k !== 'Call') return false; const f = A.strip(e.fun); return f.k === 'Ident' && (f.name === 'len' || f.name === 'cap') && f.sym && f.sym.builtin; };
      const zero = (e) => H.numVal(e) === 0;
      let always = null;
      if (isLen(n.x) && zero(n.y)) { if (n.op === '>=') always = true; if (n.op === '<') always = false; }
      if (isLen(n.y) && zero(n.x)) { if (n.op === '<=') always = true; if (n.op === '>') always = false; }
      if (always !== null) cx.report(n, `This length comparison is always ${always}.`, `이 길이 비교는 항상 ${always ? '참' : '거짓'}입니다.`);
    },
  },
  bad: gf(`
func f(xs []int) bool {
	return len(xs) >= 0 // Noncompliant
}
`),
  good: gf(`
func f(xs []int) bool {
	return len(xs) > 0
}
`),
});

rule({
  id: 'string-from-int', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: '',
  en: ['Integers should not be converted to strings with string()', 'string(65) yields "A" (a rune), not "65".', 'Use strconv.Itoa / fmt.Sprint, or string(rune(x)) when a character is intended.'],
  ko: ['정수를 string()으로 문자열로 바꾸면 안 됩니다', 'string(65)는 "65"가 아니라 룬 "A"가 됩니다.', 'strconv.Itoa나 fmt.Sprint를 쓰고, 문자를 원하면 string(rune(x))로 쓰세요.'],
  on: {
    Call(n, cx) {
      const f = A.strip(n.fun);
      if (!f || f.k !== 'Ident' || f.name !== 'string' || !(f.sym && f.sym.builtin) || n.args.length !== 1) return;
      const t = H.typeOf(cx.pf, n.args[0]);
      if (['int', 'int8', 'int16', 'int64', 'uint', 'uint16', 'uint32', 'uint64', 'uintptr'].includes(t)) cx.report(n, `Converting the ${t} value to string yields a rune, not decimal digits.`, `${t} 값을 string으로 바꾸면 10진수 숫자가 아니라 룬이 됩니다.`);
    },
  },
  bad: gf(`
func label(n int) string {
	return "item-" + string(n) // Noncompliant
}
`),
  good: gf(`
import "strconv"

func label(n int, r rune) string {
	return "item-" + strconv.Itoa(n) + string(r)
}
`),
});

rule({
  id: 'replace-zero-count', type: 'B', sev: 'MA', debt: 2, tags: ['suspicious'], ref: '',
  en: ['strings.Replace and SplitN should not be called with a count of 0', 'A count of 0 replaces nothing / returns nil.', 'Use -1 (or ReplaceAll) for all occurrences.'],
  ko: ['strings.Replace와 SplitN을 개수 0으로 호출하면 안 됩니다', '개수가 0이면 아무것도 바꾸지 않거나 nil을 돌려줍니다.', '모두 바꾸려면 -1(또는 ReplaceAll)을 쓰세요.'],
  on: {
    Call(n, cx) {
      const q = H.q(n);
      if (!q) return;
      const at = /^(strings|bytes)\.Replace$/.test(q) ? 3 : /^(strings|bytes)\.SplitN$/.test(q) ? 2 : -1;
      if (at < 0 || n.args.length <= at) return;
      if (H.numVal(n.args[at]) === 0) cx.report(n.args[at], `'${q}' with a count of 0 has no effect.`, `개수 0으로 호출한 '${q}'은(는) 효과가 없습니다.`);
    },
  },
  bad: gf(`
import "strings"

func clean(s string) string {
	return strings.Replace(s, "a", "b", 0) // Noncompliant
}
`),
  good: gf(`
import "strings"

func clean(s string) string {
	return strings.Replace(s, "a", "b", -1)
}
`),
});

rule({
  id: 'pure-result-ignored', type: 'B', sev: 'MA', debt: 2, tags: [], ref: 'S2201', checker: 'CHECKED_RETURN',
  en: ['Return values from functions without side effects should not be ignored', 'strings.ToUpper(s) alone does nothing: strings are immutable.', 'Use the result, e.g. s = strings.ToUpper(s).'],
  ko: ['부수 효과 없는 함수의 반환값을 무시하면 안 됩니다', 'strings.ToUpper(s)만 호출하면 아무 일도 일어나지 않습니다. 문자열은 바뀌지 않습니다.', '결과를 쓰세요. 예: s = strings.ToUpper(s).'],
  on: {
    ExprStmt(n, cx) {
      const x = A.strip(n.x);
      if (!x || x.k !== 'Call') return;
      const q = H.q(x);
      if (q && PURE.has(q)) cx.report(x, `The result of '${q}' is ignored; the call has no other effect.`, `'${q}'의 결과를 버립니다. 이 호출은 다른 효과가 없습니다.`);
    },
  },
  bad: gf(`
import "strings"

func norm(s string) string {
	strings.TrimSpace(s) // Noncompliant
	return s
}
`),
  good: gf(`
import "strings"

func norm(s string) string {
	s = strings.TrimSpace(s)
	return s
}
`),
});

rule({
  id: 'append-assign', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: '',
  en: ['The result of append should be assigned to the slice that is appended to', 'a = append(b, x) usually meant b = append(b, x); it may also alias b\'s backing array.', 'Assign to the same slice, or copy explicitly.'],
  ko: ['append 결과는 덧붙인 슬라이스에 대입해야 합니다', 'a = append(b, x)는 보통 b = append(b, x)를 뜻했고, b의 배열을 공유할 수도 있습니다.', '같은 슬라이스에 대입하거나 명시적으로 복사하세요.'],
  on: {
    Assign(n, cx) {
      if (n.op !== '=' || n.lhs.length !== 1 || n.rhs.length !== 1) return;
      const r = A.strip(n.rhs[0]);
      if (!r || r.k !== 'Call' || !A.isIdent(r.fun, 'append') || !r.args.length) return;
      const l = A.strip(n.lhs[0]);
      const b = A.strip(r.args[0]);
      if (!l || l.k !== 'Ident' || !b || b.k !== 'Ident' || l.name === b.name || !l.sym || !b.sym) return;
      if (r.args.length === 1) return;
      cx.report(n, `'${l.name}' is assigned the result of appending to '${b.name}'; was '${b.name} = append(${b.name}, ...)' meant?`, `'${l.name}'에 '${b.name}'에 덧붙인 결과를 대입합니다. '${b.name} = append(${b.name}, ...)'를 의도했나요?`);
    },
  },
  bad: gf(`
func f(xs, ys []int) []int {
	ys = append(xs, 1) // Noncompliant
	return ys
}
`),
  good: gf(`
func f(xs, ys []int) []int {
	xs = append(xs, 1)
	ys = append(ys, xs...)
	return ys
}
`),
});

// ── errors ──
rule({
  id: 'error-ignored', type: 'B', sev: 'MA', debt: 5, tags: ['cwe-252', 'error-handling'], ref: '', checker: 'CHECKED_RETURN',
  en: ['Returned errors should not be discarded with the blank identifier', 'Assigning an error to _ hides failures such as a write that did not happen.', 'Handle the error, return it, or log it.'],
  ko: ['반환된 오류를 빈 식별자로 버리면 안 됩니다', '오류를 _에 대입하면 쓰기가 실패한 것 같은 문제를 숨깁니다.', '오류를 처리하거나 반환하거나 기록하세요.'],
  on: {
    Assign(n, cx) {
      if ((n.op !== '=' && n.op !== ':=') || n.rhs.length !== 1) return;
      const call = A.strip(n.rhs[0]);
      if (!call || call.k !== 'Call') return;
      const q = H.q(call) || '';
      if (/^fmt\.(Print|Fprint)/.test(q)) return;
      const rs = H.resultsOf(cx.pf, call);
      if (!rs || rs.length !== n.lhs.length) return;
      n.lhs.forEach((l, i) => {
        if (rs[i] === 'error' && A.isIdent(l, '_')) cx.report(l, `The error returned by '${A.dotted(call.fun) || 'this call'}' is discarded.`, `'${A.dotted(call.fun) || '이 호출'}'이(가) 돌려준 오류를 버립니다.`);
      });
    },
  },
  bad: gf(`
import "os"

func save(p string, data []byte) {
	_ = os.WriteFile(p, data, 0o600) // Noncompliant
	n, _ := parse(p) // Noncompliant
	println(n)
}

func parse(s string) (int, error) { return len(s), nil }
`),
  good: gf(`
import "os"

func save(p string, data []byte) error {
	if err := os.WriteFile(p, data, 0o600); err != nil {
		return err
	}
	n, err := parse(p)
	println(n)
	return err
}

func parse(s string) (int, error) { return len(s), nil }
`),
});

rule({
  id: 'unchecked-error-call', type: 'B', sev: 'MA', debt: 5, tags: ['cwe-252', 'error-handling'], ref: '', checker: 'CHECKED_RETURN',
  en: ['Errors returned by function calls should be checked', 'Calling a function that returns an error as a plain statement silently ignores failures.', 'Check the error, or assign it to _ explicitly with a comment explaining why.'],
  ko: ['함수 호출이 돌려준 오류는 확인해야 합니다', '오류를 돌려주는 함수를 단독 문장으로 호출하면 실패를 조용히 무시합니다.', '오류를 확인하거나, 이유를 주석으로 적고 명시적으로 _에 대입하세요.'],
  on: {
    ExprStmt(n, cx) {
      const call = A.strip(n.x);
      if (!call || call.k !== 'Call') return;
      const q = H.q(call) || '';
      if (/^fmt\.(Print|Fprint)|^log\./.test(q)) return;
      const rs = H.resultsOf(cx.pf, call);
      if (!rs || !rs.length || rs[rs.length - 1] !== 'error') return;
      const f = A.strip(call.fun);
      if (f && f.k === 'Selector' && /^(Close|Flush)$/.test(f.sel.name) && !q) return;
      cx.report(call, `Check the error returned by '${A.dotted(call.fun) || 'this call'}'.`, `'${A.dotted(call.fun) || '이 호출'}'이(가) 돌려준 오류를 확인하세요.`);
    },
  },
  bad: gf(`
import "os"

func cleanup(dir string) {
	os.RemoveAll(dir) // Noncompliant
	store(dir) // Noncompliant
}

func store(s string) error { return nil }
`),
  good: gf(`
import (
	"fmt"
	"os"
)

func cleanup(dir string) error {
	fmt.Println("cleaning", dir)
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	return store(dir)
}

func store(s string) error { return nil }
`),
});

rule({
  id: 'err-shadow', type: 'B', sev: 'MA', debt: 5, tags: ['error-handling', 'pitfall'], ref: '',
  en: ['Error variables should not be shadowed in nested scopes', 'err := inside a block creates a new variable, so the outer err (often the named result) is not updated.', 'Use = instead of := or rename the inner variable.'],
  ko: ['오류 변수를 안쪽 범위에서 가리면 안 됩니다', '블록 안의 err :=는 새 변수를 만들므로 바깥 err(주로 이름 있는 결과)가 바뀌지 않습니다.', ':= 대신 =를 쓰거나 안쪽 변수 이름을 바꾸세요.'],
  on: {
    Ident(n, cx) {
      const s = n.sym;
      if (!s || !n.isDecl || s.node !== n || !s.shadows || !s.defineStmt) return;
      const o = s.shadows;
      if (s.tstr !== 'error' && !(o.tstr === 'error' && /^err/.test(s.name))) return;
      if (o.tstr && o.tstr !== 'error') return;
      const scopeNode = s.scope && s.scope.node;
      const scopeEnd = scopeNode ? scopeNode.endLine : 0;
      let nakedInside = false;
      if (o.kind === 'result' && scopeNode) A.walk(scopeNode, (x) => { if (x.k === 'FuncLit') return false; if (x.k === 'Return' && !x.results.length && x.line >= n.line) nakedInside = true; return !nakedInside; });
      const laterRead = o.kind !== 'result' && o.refs.some((r) => !r.lhs && r.line > scopeEnd);
      if (nakedInside || laterRead) cx.report(n, `This '${s.name}' shadows the '${o.name}' declared at line ${o.node.line}, which is ${o.kind === 'result' ? 'returned by the bare return below' : 'read later'}.`, `이 '${s.name}'은(는) ${o.node.line}행에서 선언한 '${o.name}'을(를) 가립니다. 바깥 변수는 ${o.kind === 'result' ? '아래의 값 없는 return이 반환합니다' : '나중에 읽습니다'}.`);
    },
  },
  bad: gf(`
func load(p string) (err error) {
	if p != "" {
		_, err := open(p) // Noncompliant
		if err != nil {
			return
		}
	}
	return
}

func open(p string) (int, error) { return 0, nil }
`),
  good: gf(`
func load(p string) (err error) {
	if p != "" {
		_, err = open(p)
		if err != nil {
			return
		}
	}
	if err := check(p); err != nil {
		return err
	}
	return
}

func check(p string) error { return nil }

func open(p string) (int, error) { return 0, nil }
`),
});

rule({
  id: 'error-compare-eq', type: 'B', sev: 'MA', debt: 5, tags: ['error-handling'], ref: '',
  en: ['Errors should be compared with errors.Is', 'err == io.EOF fails when the error is wrapped with %w.', 'Use errors.Is(err, io.EOF).'],
  ko: ['오류는 errors.Is로 비교해야 합니다', 'err == io.EOF는 오류가 %w로 감싸이면 실패합니다.', 'errors.Is(err, io.EOF)를 쓰세요.'],
  on: {
    Binary(n, cx) {
      if (n.op !== '==' && n.op !== '!=') return;
      const pair = (H.isErrExpr(n.x) && H.isSentinel(n.y)) ? n.y : (H.isErrExpr(n.y) && H.isSentinel(n.x)) ? n.x : null;
      if (!pair) return;
      const fn = H.fnOf(n);
      if (fn && fn.k === 'FuncDecl' && fn.recv && fn.name.name === 'Is') return;
      cx.report(n, `Use errors.Is to compare with '${cx.norm(pair)}' so that wrapped errors match.`, `감싼 오류도 일치하도록 '${cx.norm(pair)}'과(와)의 비교에 errors.Is를 쓰세요.`);
    },
  },
  bad: gf(`
import (
	"io"
	"os"
)

func readAll(f *os.File) error {
	buf := make([]byte, 8)
	_, err := f.Read(buf)
	if err == io.EOF { // Noncompliant
		return nil
	}
	return err
}
`),
  good: gf(`
import (
	"errors"
	"io"
	"os"
)

func readAll(f *os.File) error {
	buf := make([]byte, 8)
	_, err := f.Read(buf)
	if errors.Is(err, io.EOF) || err == nil {
		return nil
	}
	return err
}
`),
});

rule({
  id: 'error-type-assert', type: 'B', sev: 'MI', debt: 5, tags: ['error-handling'], ref: '',
  en: ['Error types should be checked with errors.As', 'A type assertion on an error fails when the error is wrapped.', 'Use errors.As(err, &target).'],
  ko: ['오류 타입은 errors.As로 확인해야 합니다', '오류에 타입 단언을 쓰면 감싼 오류에서 실패합니다.', 'errors.As(err, &target)를 쓰세요.'],
  on: {
    TypeAssert(n, cx) {
      if (!H.isErrExpr(n.x)) return;
      if (n.type && A.strip(n.type).k === 'InterfaceType') return;
      cx.report(n, `Use errors.As instead of a type ${n.type ? 'assertion' : 'switch'} on '${cx.norm(n.x)}'.`, `'${cx.norm(n.x)}'에 타입 ${n.type ? '단언' : 'switch'} 대신 errors.As를 쓰세요.`);
    },
  },
  bad: gf(`
import "os"

func missing(err error) bool {
	_, ok := err.(*os.PathError) // Noncompliant
	return ok
}
`),
  good: gf(`
import (
	"errors"
	"os"
)

func missing(err error) bool {
	var pe *os.PathError
	return errors.As(err, &pe)
}
`),
});

rule({
  id: 'nil-error-return', type: 'B', sev: 'MA', debt: 5, tags: ['error-handling', 'cwe-252'], ref: '',
  en: ['A nil error should not be returned right after an error check', 'if err != nil { return nil } drops the failure and reports success.', 'Return err (wrapped if needed).'],
  ko: ['오류를 확인한 직후 nil 오류를 반환하면 안 됩니다', 'if err != nil { return nil }은 실패를 버리고 성공으로 알립니다.', 'err를 (필요하면 감싸서) 반환하세요.'],
  on: {
    If(n, cx) {
      const c = A.strip(n.cond);
      if (!c || c.k !== 'Binary' || c.op !== '!=' || !A.isNil(c.y) || !H.isErrExpr(c.x)) return;
      const errSym = A.strip(c.x).sym;
      const fn = H.fnOf(n);
      if (!fn) return;
      const rs = H.resultFields(fn);
      if (!rs.length || A.typeStr(rs[rs.length - 1].type) !== 'error') return;
      let mentions = false;
      A.walk(n.then, (x) => { if (x.k === 'Ident' && x.sym === errSym) mentions = true; return !mentions; });
      if (mentions) return;
      for (const s of n.then.stmts) {
        if (s.k === 'Return' && s.results.length === rs.length && A.isNil(s.results[s.results.length - 1])) cx.report(s, `'${errSym.name}' is not nil here but this returns a nil error.`, `여기서 '${errSym.name}'은(는) nil이 아닌데 nil 오류를 반환합니다.`);
      }
    },
  },
  bad: gf(`
func load(p string) ([]byte, error) {
	data, err := read(p)
	if err != nil {
		return nil, nil // Noncompliant
	}
	return data, nil
}

func read(p string) ([]byte, error) { return nil, nil }
`),
  good: gf(`
func load(p string) ([]byte, error) {
	data, err := read(p)
	if err != nil {
		return nil, err
	}
	return data, nil
}

func read(p string) ([]byte, error) { return nil, nil }
`),
});

rule({
  id: 'recover-not-in-defer', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'], ref: '',
  en: ['recover() should be called directly by a deferred function', 'recover only stops a panic when called by a function that is itself deferred; elsewhere it always returns nil.', 'Call recover inside a function invoked with defer.'],
  ko: ['recover()는 defer로 실행되는 함수에서 직접 호출해야 합니다', 'recover는 defer된 함수가 직접 호출할 때만 panic을 멈추고, 그 밖에서는 항상 nil을 돌려줍니다.', 'defer로 호출되는 함수 안에서 recover를 호출하세요.'],
  on: {
    Call(n, cx) {
      const f = A.strip(n.fun);
      if (!f || f.k !== 'Ident' || f.name !== 'recover' || !(f.sym && f.sym.builtin)) return;
      const fn = H.fnOf(n);
      if (!fn) return;
      if (fn.k === 'FuncLit') {
        const p = fn.parent;
        if (p && p.k === 'Call' && p.fun === fn && p.parent && p.parent.k === 'Defer') return;
        if (p && (p.k === 'Assign' || p.k === 'VarSpec' || p.k === 'Call' || p.k === 'KeyValue' || p.k === 'Return')) return;
      } else {
        const s = cx.pf.pkg.scope.names.get(fn.name.name);
        if (fn.recv) return;
        if (s && s.refs.some((r) => r.parent && (r.parent.k === 'Defer' || (r.parent.k === 'Call' && r.parent.parent && r.parent.parent.k === 'Defer') || r.parent.k !== 'Call'))) return;
      }
      cx.report(n, 'This recover() is not called directly by a deferred function, so it always returns nil.', '이 recover()는 defer된 함수가 직접 호출하지 않으므로 항상 nil을 돌려줍니다.');
    },
  },
  bad: gf(`
func safe(f func()) {
	if r := recover(); r != nil { // Noncompliant
		println("recovered")
	}
	f()
}
`),
  good: gf(`
func safe(f func()) {
	defer func() {
		if r := recover(); r != nil {
			println("recovered")
		}
	}()
	f()
}
`),
});

// ── context / time ──
rule({
  id: 'context-background-in-handler', type: 'B', sev: 'MA', debt: 5, tags: ['context'], ref: '',
  en: ['HTTP handlers should use the request context', 'context.Background() in a handler ignores client cancellation and deadlines.', 'Use r.Context().'],
  ko: ['HTTP 핸들러는 요청 컨텍스트를 써야 합니다', '핸들러에서 context.Background()를 쓰면 클라이언트 취소와 기한을 무시합니다.', 'r.Context()를 쓰세요.'],
  on: {
    Call(n, cx) {
      const q = H.q(n);
      if (q !== 'context.Background' && q !== 'context.TODO') return;
      for (let p = n.parent; p; p = p.parent) {
        if ((p.k === 'FuncDecl' || p.k === 'FuncLit') && H.isHandler(p)) {
          cx.report(n, `Use the request context instead of ${q}() in this HTTP handler.`, `이 HTTP 핸들러에서는 ${q}() 대신 요청 컨텍스트를 쓰세요.`);
          return;
        }
      }
    },
  },
  bad: gf(`
import (
	"context"
	"net/http"
)

func handle(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background() // Noncompliant
	work(ctx)
}

func work(ctx context.Context) {}
`),
  good: gf(`
import (
	"context"
	"net/http"
)

func handle(w http.ResponseWriter, r *http.Request) {
	work(r.Context())
}

func main() {
	work(context.Background())
}

func work(ctx context.Context) {}
`),
});

rule({
  id: 'time-after-in-loop', type: 'B', sev: 'MA', debt: 10, tags: ['performance', 'cwe-401'], ref: '',
  en: ['time.After should not be used inside loops', 'Each time.After call creates a timer that lives until it fires, so a busy loop accumulates timers.', 'Create one time.NewTimer / time.Ticker outside the loop and Reset it.'],
  ko: ['반복문 안에서 time.After를 쓰면 안 됩니다', 'time.After를 호출할 때마다 울릴 때까지 남는 타이머가 생기므로 바쁜 반복문에 타이머가 쌓입니다.', '반복문 밖에서 time.NewTimer나 time.Ticker를 하나 만들고 Reset하세요.'],
  on: {
    Call(n, cx) {
      if (H.q(n) !== 'time.After') return;
      if (H.loopOf(n)) cx.report(n, 'This time.After call allocates a new timer on every iteration.', '이 time.After 호출은 반복할 때마다 새 타이머를 만듭니다.');
    },
  },
  bad: gf(`
import "time"

func pump(in <-chan int) {
	for {
		select {
		case v := <-in:
			println(v)
		case <-time.After(time.Second): // Noncompliant
			return
		}
	}
}
`),
  good: gf(`
import "time"

func pump(in <-chan int) {
	t := time.NewTimer(time.Second)
	defer t.Stop()
	for {
		select {
		case v := <-in:
			println(v)
		case <-t.C:
			return
		}
	}
}
`),
});

// ── loops ──
rule({
  id: 'defer-in-loop', type: 'B', sev: 'MA', debt: 10, tags: ['cwe-404', 'performance'], ref: '',
  en: ['"defer" should not be used inside loops', 'Deferred calls run only when the function returns, so resources opened in the loop pile up.', 'Move the loop body into a function, or close explicitly.'],
  ko: ['반복문 안에서 "defer"를 쓰면 안 됩니다', 'defer한 호출은 함수가 끝날 때만 실행되므로 반복문에서 연 자원이 쌓입니다.', '반복문 본문을 함수로 옮기거나 명시적으로 닫으세요.'],
  on: {
    Defer(n, cx) {
      if (H.loopOf(n)) cx.report(n, 'This defer runs only when the function returns, not at the end of each iteration.', '이 defer는 반복할 때마다가 아니라 함수가 끝날 때만 실행됩니다.');
    },
  },
  bad: gf(`
import "os"

func sizes(paths []string) {
	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			continue
		}
		defer f.Close() // Noncompliant
	}
}
`),
  good: gf(`
import "os"

func size(p string) {
	f, err := os.Open(p)
	if err != nil {
		return
	}
	defer f.Close()
}

func sizes(paths []string) {
	for _, p := range paths {
		size(p)
	}
}
`),
});

rule({
  id: 'goroutine-loop-var', type: 'B', sev: 'CR', debt: 10, tags: ['concurrency', 'cwe-362'], ref: '',
  en: ['Loop variables should not be captured by goroutines or deferred closures', 'Before Go 1.22 the loop variable is shared by all iterations, so the closure sees the last value.', 'Pass the variable as an argument, copy it (v := v), or build with Go 1.22+.'],
  ko: ['고루틴이나 defer 클로저가 반복 변수를 잡으면 안 됩니다', 'Go 1.22 이전에는 반복 변수를 모든 반복이 함께 쓰므로 클로저가 마지막 값을 봅니다.', '변수를 인수로 넘기거나 복사(v := v)하거나 Go 1.22 이상으로 빌드하세요.'],
  on: {
    Go: (n, cx) => loopCapture(n, cx),
    Defer: (n, cx) => loopCapture(n, cx),
  },
  bad: gf(`
func run(items []string) {
	for _, it := range items {
		go func() {
			println(it) // Noncompliant
		}()
	}
}
`),
  good: gf(`
func run(items []string) {
	for _, it := range items {
		go func(s string) {
			println(s)
		}(it)
	}
}
`),
});
function loopCapture(n, cx) {
  if (cx.opts.loopVarPerIteration) return;
  const call = A.strip(n.call);
  if (!call || call.k !== 'Call') return;
  const lit = A.strip(call.fun);
  if (!lit || lit.k !== 'FuncLit') return;
  const loop = H.loopOf(n);
  if (!loop) return;
  const vars = new Set();
  for (let p = n.parent; p; p = p.parent) {
    if (p.k === 'FuncDecl' || p.k === 'FuncLit') break;
    if (p.k === 'Range' && p.tok === ':=') for (const v of [p.key, p.value]) { const x = A.strip(v); if (x && x.sym) vars.add(x.sym); }
    if (p.k === 'For' && p.init && p.init.k === 'Assign' && p.init.op === ':=') for (const v of p.init.lhs) { const x = A.strip(v); if (x && x.sym) vars.add(x.sym); }
  }
  if (!vars.size) return;
  const done = new Set();
  A.walk(lit.body, (x) => {
    if (x.k === 'Ident' && x.sym && vars.has(x.sym) && !done.has(x.sym)) {
      done.add(x.sym);
      cx.report(x, `The ${n.k === 'Go' ? 'goroutine' : 'deferred closure'} captures loop variable '${x.name}', which is shared by all iterations before Go 1.22.`, `${n.k === 'Go' ? '고루틴' : 'defer 클로저'}이(가) 반복 변수 '${x.name}'을(를) 잡습니다. Go 1.22 이전에는 모든 반복이 이 변수를 함께 씁니다.`);
    }
    return true;
  });
}

rule({
  id: 'infinite-loop', type: 'B', sev: 'BL', debt: 10, tags: ['suspicious'], ref: 'S2189', checker: 'INFINITE_LOOP',
  en: ['Loops should not be infinite', 'A loop that can neither end nor do anything observable hangs the program.', 'Fix the loop condition or add an exit.'],
  ko: ['반복문이 끝없이 돌면 안 됩니다', '끝날 수도 없고 눈에 보이는 일도 하지 않는 반복문은 프로그램을 멈추게 합니다.', '반복 조건을 고치거나 빠져나갈 길을 넣으세요.'],
  on: {
    For(n, cx) {
      if (hasExit(n)) return;
      if (!n.cond || (A.isBoolLit(n.cond) && A.strip(n.cond).name === 'true')) {
        if (hasEffect(n.body)) return;
        cx.report(n, 'Add an end condition to this loop: it never exits and has no effect.', '이 반복문에 종료 조건을 넣으세요. 끝나지 않고 효과도 없습니다.', { line: n.line, col: n.col });
        return;
      }
      const vars = [];
      let ok = true;
      A.walk(n.cond, (x) => {
        if (x.k === 'Call' || (x.k === 'Unary' && x.op === '<-') || x.k === 'Selector' || x.k === 'Index' || x.k === 'Star') { ok = false; return false; }
        if (x.k === 'Ident' && x.sym && !x.sym.builtin) { if (!x.sym.local || x.sym.addrTaken || x.sym.captured || x.sym.kind === 'const') { if (x.sym.kind !== 'const') ok = false; return false; } vars.push(x.sym); }
        return true;
      });
      if (!ok || !vars.length) return;
      const written = new Set();
      const mark = (e) => { const x = A.strip(e); if (x && x.k === 'Ident' && x.sym) written.add(x.sym); };
      for (const part of [n.body, n.post]) {
        if (!part) continue;
        A.walk(part, (x) => {
          if (x.k === 'Assign') x.lhs.forEach(mark);
          if (x.k === 'IncDec') mark(x.x);
          if (x.k === 'Range' && x.tok === '=') { mark(x.key); mark(x.value); }
          return true;
        });
      }
      if (vars.some((v) => written.has(v))) return;
      cx.report(n, `This loop never ends: ${[...new Set(vars.map((v) => `'${v.name}'`))].join(', ')} ${vars.length > 1 ? 'are' : 'is'} not updated in the loop.`, `이 반복문은 끝나지 않습니다. ${[...new Set(vars.map((v) => `'${v.name}'`))].join(', ')}을(를) 반복문 안에서 바꾸지 않습니다.`, { line: n.line, col: n.col });
    },
  },
  bad: gf(`
func wait(n int) int {
	i := 0
	for i < n { // Noncompliant
		println(i)
	}
	for { // Noncompliant
	}
}
`),
  good: gf(`
func wait(n int, ch chan int) int {
	i := 0
	for i < n {
		i++
	}
	for {
		v := <-ch
		if v > 0 {
			return v
		}
	}
}
`),
});
function hasExit(loop) {
  let found = false;
  const visit = (x, depth) => {
    if (found || !x || typeof x !== 'object') return;
    if (x.k === 'FuncLit') return;
    if (x.k === 'Return' || x.k === 'Branch' && x.tok === 'goto') { found = true; return; }
    if (x.k === 'Branch' && x.tok === 'break') { if (x.label || depth === 0) { found = true; return; } }
    if (x.k === 'ExprStmt' && A.isExitCall(x.x)) { found = true; return; }
    const inner = x !== loop && (x.k === 'For' || x.k === 'Range' || x.k === 'Switch' || x.k === 'TypeSwitch' || x.k === 'Select');
    A.eachChild(x, (c) => visit(c, depth + (inner ? 1 : 0)));
  };
  visit(loop.body, 0);
  return found;
}
function hasEffect(body) {
  let found = false;
  A.walk(body, (x) => {
    if (x.k === 'Call' || x.k === 'Send' || x.k === 'Select' || (x.k === 'Unary' && x.op === '<-') || x.k === 'Go') found = true;
    if (x.k === 'Assign' || x.k === 'IncDec') {
      const ts = x.k === 'Assign' ? x.lhs : [x.x];
      if (ts.some((t) => { const y = A.strip(t); return !(y && y.k === 'Ident' && y.sym && y.sym.local && !y.sym.captured && !y.sym.addrTaken); })) found = true;
    }
    return !found;
  });
  return found;
}

rule({
  id: 'single-iteration-loop', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S1751',
  en: ['Loops with at most one iteration should be refactored', 'A loop whose body always breaks or returns runs at most once, which is usually a bug.', 'Fix the exit statement or replace the loop with an if.'],
  ko: ['최대 한 번만 도는 반복문은 고쳐야 합니다', '본문이 항상 break나 return하는 반복문은 많아야 한 번 돌고, 보통 버그입니다.', '빠져나가는 문장을 고치거나 반복문을 if로 바꾸세요.'],
  on: {
    For(n, cx) { singleIter(n, cx, false); },
    Range(n, cx) { singleIter(n, cx, true); },
  },
  bad: gf(`
func first(xs []int) int {
	for i := 0; i < len(xs); i++ { // Noncompliant
		if xs[i] > 0 {
			println(xs[i])
		}
		break
	}
	return 0
}
`),
  good: gf(`
func first(xs []int) int {
	for i := 0; i < len(xs); i++ {
		if xs[i] > 0 {
			return xs[i]
		}
	}
	for _, x := range xs {
		return x
	}
	return 0
}
`),
});
function singleIter(n, cx, isRange) {
  const stmts = n.body.stmts;
  if (!stmts.length) return;
  const last = stmts[stmts.length - 1];
  const ends = last.k === 'Return' || (last.k === 'Branch' && last.tok === 'break' && !last.label) || (last.k === 'ExprStmt' && A.isExitCall(last.x));
  if (!ends) return;
  if (isRange && last.k !== 'Branch') return;
  let cont = false;
  const visit = (x, depth) => {
    if (cont || !x || typeof x !== 'object' || x.k === 'FuncLit') return;
    if (x.k === 'Branch' && x.tok === 'continue' && (depth === 0 || x.label)) { cont = true; return; }
    if (x.k === 'Branch' && x.tok === 'goto') { cont = true; return; }
    const inner = x.k === 'For' || x.k === 'Range';
    A.eachChild(x, (c) => visit(c, depth + (inner ? 1 : 0)));
  };
  visit(n.body, 0);
  if (!cont) cx.report(n, 'Refactor this loop to do more than one iteration.', '이 반복문이 한 번보다 많이 돌도록 고치세요.', { line: n.line, col: n.col });
}

rule({
  id: 'loop-wrong-direction', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S2251',
  en: ['A "for" loop update should move the counter in the right direction', 'for i := 0; i < n; i-- moves away from the end condition.', 'Fix the update or the condition.'],
  ko: ['"for" 반복의 갱신은 카운터를 올바른 방향으로 움직여야 합니다', 'for i := 0; i < n; i--는 종료 조건에서 멀어집니다.', '갱신식이나 조건을 고치세요.'],
  on: {
    For(n, cx) {
      if (!n.cond || !n.post) return;
      const c = A.strip(n.cond);
      if (!c || c.k !== 'Binary') return;
      const v = A.strip(c.x);
      if (!v || v.k !== 'Ident' || !v.sym) return;
      let dir = 0;
      const p = n.post;
      const pv = p.k === 'IncDec' ? A.strip(p.x) : p.k === 'Assign' ? A.strip(p.lhs[0]) : null;
      if (!pv || pv.k !== 'Ident' || pv.sym !== v.sym) return;
      if (p.k === 'IncDec') dir = p.op === '++' ? 1 : -1;
      else if (p.op === '+=' || p.op === '-=') { const k = H.numVal(p.rhs[0]); if (k == null || k === 0) return; dir = (p.op === '+=' ? 1 : -1) * Math.sign(k); }
      if (!dir) return;
      const wantUp = c.op === '<' || c.op === '<=';
      const wantDown = c.op === '>' || c.op === '>=';
      if ((wantUp && dir < 0) || (wantDown && dir > 0)) cx.report(p, `'${v.name}' is updated in the wrong direction for the condition '${cx.norm(c)}'.`, `'${v.name}'이(가) 조건 '${cx.norm(c)}'과(와) 반대 방향으로 바뀝니다.`);
    },
  },
  bad: gf(`
func f(xs []int) {
	for i := 0; i < len(xs); i-- { // Noncompliant
		println(xs[i])
	}
}
`),
  good: gf(`
func f(xs []int) {
	for i := len(xs) - 1; i >= 0; i-- {
		println(xs[i])
	}
}
`),
});

module.exports = { countVerbs, literalString };
