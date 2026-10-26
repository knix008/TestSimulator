'use strict';

// Naming, idioms and performance smells specific to Go.

const { rule, gf } = require('./core');
const A = require('../ast');
const H = require('./h');

// ── naming ──
rule({
  id: 'func-naming', type: 'S', sev: 'MI', debt: 5, tags: ['convention'], ref: 'S100',
  en: ['Function names should comply with a naming convention', 'Go names use MixedCaps; underscores and ALL_CAPS look foreign and break tooling conventions.', 'Rename the function using mixedCaps / MixedCaps.'],
  ko: ['함수 이름은 명명 규칙을 따라야 합니다', 'Go 이름은 MixedCaps를 씁니다. 밑줄과 ALL_CAPS는 어색하고 도구 관례에도 어긋납니다.', 'mixedCaps / MixedCaps로 함수 이름을 바꾸세요.'],
  on: {
    FuncDecl(fn, cx) {
      const name = fn.name.name;
      if (name === '_' || /^[A-Za-z][A-Za-z0-9]*$/.test(name)) return;
      if (cx.pf.isTest && /^(Test|Benchmark|Example|Fuzz)[A-Za-z0-9_]*$/.test(name)) return;
      cx.report(fn.name, `Rename function '${name}' to match the regular expression ^[A-Za-z][A-Za-z0-9]*$.`, `함수 '${name}'의 이름을 정규식 ^[A-Za-z][A-Za-z0-9]*$에 맞게 바꾸세요.`);
    },
  },
  bad: gf(`
func load_config() int { // Noncompliant
	return 1
}
`),
  good: gf(`
func loadConfig() int {
	return 1
}
`),
});

rule({
  id: 'var-naming', type: 'S', sev: 'MI', debt: 2, tags: ['convention'], ref: 'S117',
  en: ['Local variable and parameter names should comply with a naming convention', 'snake_case and ALL_CAPS names are not idiomatic Go.', 'Use mixedCaps.'],
  ko: ['지역 변수와 매개변수 이름은 명명 규칙을 따라야 합니다', 'snake_case와 ALL_CAPS 이름은 Go답지 않습니다.', 'mixedCaps를 쓰세요.'],
  on: {
    Ident(n, cx) {
      const s = n.sym;
      if (!s || !n.isDecl || s.node !== n || !s.local || !['var', 'param', 'result'].includes(s.kind)) return;
      if (/^(_|[A-Za-z][A-Za-z0-9]*)$/.test(n.name) && !/^[A-Z0-9]{2,}$/.test(n.name)) return;
      if (/^[A-Z]{2,5}$/.test(n.name)) return; // acronyms such as ID, URL
      cx.report(n, `Rename '${n.name}' to match the regular expression ^(_|[a-zA-Z][a-zA-Z0-9]*)$.`, `'${n.name}'의 이름을 정규식 ^(_|[a-zA-Z][a-zA-Z0-9]*)$에 맞게 바꾸세요.`);
    },
  },
  bad: gf(`
func total(item_count int) int { // Noncompliant
	unit_price := 3 // Noncompliant
	return item_count * unit_price
}
`),
  good: gf(`
func total(itemCount int) int {
	unitPrice := 3
	ID := 1
	return itemCount*unitPrice + ID
}
`),
});

rule({
  id: 'receiver-name', type: 'S', sev: 'MI', debt: 2, tags: ['convention'], ref: '',
  en: ['Method receivers should not be named "this" or "self"', 'Go receivers are short names that reflect the type; this/self are habits from other languages.', 'Use a one or two letter abbreviation of the type, consistently.'],
  ko: ['메서드 리시버 이름을 "this"나 "self"로 하면 안 됩니다', 'Go 리시버는 타입을 나타내는 짧은 이름을 씁니다. this/self는 다른 언어의 습관입니다.', '타입을 줄인 한두 글자 이름을 일관되게 쓰세요.'],
  on: {
    FuncDecl(fn, cx) {
      if (!fn.recv || !fn.recv.length) return;
      const nm = fn.recv[0].names[0];
      if (nm && (nm.name === 'this' || nm.name === 'self')) cx.report(nm, `Rename receiver '${nm.name}' to a short name derived from the type.`, `리시버 '${nm.name}'을(를) 타입에서 따온 짧은 이름으로 바꾸세요.`);
    },
  },
  bad: gf(`
type user struct{ name string }

func (this *user) Name() string { // Noncompliant
	return this.name
}
`),
  good: gf(`
type user struct{ name string }

func (u *user) Name() string {
	return u.name
}
`),
});

rule({
  id: 'package-naming', type: 'S', sev: 'MI', debt: 5, tags: ['convention'], ref: '',
  en: ['Package names should be lower case without underscores', 'Package names are part of every qualified identifier; mixedCase and underscores make them awkward.', 'Use a short, lower-case, single-word name.'],
  ko: ['패키지 이름은 밑줄 없는 소문자여야 합니다', '패키지 이름은 모든 한정 식별자에 들어가므로 대소문자 혼용과 밑줄은 어색합니다.', '짧은 소문자 한 단어 이름을 쓰세요.'],
  file(pf, cx) {
    const p = pf.ast.pkg;
    if (!p) return;
    const name = p.name.replace(/_test$/, '');
    if (!/^[a-z][a-z0-9]*$/.test(name)) cx.report(p, `Rename package '${p.name}' to a lower-case name without underscores.`, `패키지 '${p.name}'의 이름을 밑줄 없는 소문자로 바꾸세요.`);
  },
  bad: 'package user_store // Noncompliant\n\nvar x = 1\n',
  good: 'package userstore\n\nvar x = 1\n',
});

// ── errors ──
rule({
  id: 'error-string-style', type: 'S', sev: 'MI', debt: 2, tags: ['convention', 'error-handling'], ref: '',
  en: ['Error strings should not be capitalised or end with punctuation', 'Errors are usually wrapped into longer messages ("open config: no such file"), so capitals and trailing dots read badly.', 'Start with a lower-case letter and drop the trailing punctuation.'],
  ko: ['오류 문자열은 대문자로 시작하거나 문장 부호로 끝나면 안 됩니다', '오류는 보통 더 긴 메시지("open config: no such file")에 감싸지므로 대문자와 끝의 마침표는 어색합니다.', '소문자로 시작하고 끝의 문장 부호를 지우세요.'],
  on: {
    Call(n, cx) {
      const q = H.q(n);
      if ((q !== 'errors.New' && q !== 'fmt.Errorf') || !n.args.length) return;
      const s = A.strip(n.args[0]);
      if (!A.isStr(s)) return;
      const v = s.s || '';
      const capital = /^[A-Z][a-z]/.test(v) && !/^[A-Z][a-z]+[A-Z]/.test(v);
      const punct = /[.!:\n]$/.test(v);
      if (capital || punct) cx.report(s, `Error strings should not ${capital ? 'be capitalised' : 'end with punctuation or a newline'}.`, `오류 문자열은 ${capital ? '대문자로 시작하면' : '문장 부호나 줄바꿈으로 끝나면'} 안 됩니다.`);
    },
  },
  bad: gf(`
import "errors"

var errClosed = errors.New("Connection closed.") // Noncompliant
`),
  good: gf(`
import "errors"

var errClosed = errors.New("connection closed")
var errHTTP = errors.New("HTTP status 500")
`),
});

rule({
  id: 'errors-new-sprintf', type: 'S', sev: 'MI', debt: 2, tags: ['clumsy'], ref: '',
  en: ['errors.New(fmt.Sprintf(...)) should be replaced by fmt.Errorf(...)', 'fmt.Errorf does the same in one call and supports %w wrapping.', 'Use fmt.Errorf.'],
  ko: ['errors.New(fmt.Sprintf(...))는 fmt.Errorf(...)로 바꿔야 합니다', 'fmt.Errorf는 한 번의 호출로 같은 일을 하고 %w 감싸기도 지원합니다.', 'fmt.Errorf를 쓰세요.'],
  on: {
    Call(n, cx) {
      if (H.q(n) !== 'errors.New' || n.args.length !== 1) return;
      if (H.q(A.strip(n.args[0])) === 'fmt.Sprintf') cx.report(n, 'Replace errors.New(fmt.Sprintf(...)) with fmt.Errorf(...).', 'errors.New(fmt.Sprintf(...))를 fmt.Errorf(...)로 바꾸세요.');
    },
  },
  bad: gf(`
import (
	"errors"
	"fmt"
)

func bad(id int) error {
	return errors.New(fmt.Sprintf("no item %d", id)) // Noncompliant
}
`),
  good: gf(`
import "fmt"

func bad(id int) error {
	return fmt.Errorf("no item %d", id)
}
`),
});

rule({
  id: 'error-last-result', type: 'S', sev: 'MI', debt: 5, tags: ['convention', 'error-handling'], ref: '',
  en: ['error should be the last result of a function', 'By convention callers expect the error last; other orders are easy to misuse.', 'Move the error to the last result.'],
  ko: ['error는 함수의 마지막 결과여야 합니다', '관례상 호출하는 쪽은 오류가 마지막에 오기를 기대하므로 다른 순서는 잘못 쓰기 쉽습니다.', '오류를 마지막 결과로 옮기세요.'],
  on: {
    FuncDecl(fn, cx) {
      const rs = fn.results.map((r) => A.typeStr(r.type));
      const i = rs.indexOf('error');
      if (i >= 0 && i !== rs.length - 1 && rs[rs.length - 1] !== 'error') cx.report(fn.name, `'${fn.name.name}' should return error as its last result.`, `'${fn.name.name}'은(는) error를 마지막 결과로 반환해야 합니다.`);
    },
  },
  bad: gf(`
func parse(s string) (error, int) { // Noncompliant
	return nil, len(s)
}
`),
  good: gf(`
func parse(s string) (int, error) {
	return len(s), nil
}
`),
});

rule({
  id: 'context-first-param', type: 'S', sev: 'MI', debt: 5, tags: ['convention', 'context'], ref: '',
  en: ['context.Context should be the first parameter', 'By convention a Context is passed first so that it is easy to find and thread through calls.', 'Move ctx context.Context to the first position.'],
  ko: ['context.Context는 첫 번째 매개변수여야 합니다', '관례상 Context는 처음에 넘겨야 찾기 쉽고 호출마다 넘기기 쉽습니다.', 'ctx context.Context를 첫 자리로 옮기세요.'],
  on: {
    FuncDecl(fn, cx) {
      const ps = fn.params.map((p) => A.typeStr(p.type));
      const i = ps.indexOf('context.Context');
      if (i > 0 && ps[0] !== 'context.Context') cx.report(fn.params[i].names[0] || fn.name, `Make the context.Context parameter the first parameter of '${fn.name.name}'.`, `context.Context 매개변수를 '${fn.name.name}'의 첫 매개변수로 옮기세요.`);
    },
  },
  bad: gf(`
import "context"

func fetch(id int, ctx context.Context) error { // Noncompliant
	return ctx.Err()
}
`),
  good: gf(`
import "context"

func fetch(ctx context.Context, id int) error {
	return ctx.Err()
}
`),
});

rule({
  id: 'naked-return', type: 'S', sev: 'MI', debt: 5, tags: ['confusing'], ref: '',
  en: ['Naked returns should not be used in long functions', 'In a long function a bare return hides which values are returned.', 'Return the values explicitly.'],
  ko: ['긴 함수에서 이름만 있는 return을 쓰면 안 됩니다', '긴 함수에서 값 없는 return은 무엇을 반환하는지 숨깁니다.', '값을 명시해서 반환하세요.'],
  on: {
    Return(n, cx) {
      if (n.results.length) return;
      const fn = H.fnOf(n);
      if (!fn || !H.resultFields(fn).some((f) => f.names.length)) return;
      const max = Number(cx.opts.maxNakedReturnLines) || 30;
      if (A.lineCount(fn) > max) cx.report(n, `Return the results of '${A.funcName(fn)}' explicitly: the function is longer than ${max} lines.`, `'${A.funcName(fn)}'의 결과를 명시해서 반환하세요. 함수가 ${max}줄보다 깁니다.`);
    },
  },
  bad: gf(`func stats(xs []int) (sum, n int) {\n${'\tsum += len(xs)\n'.repeat(30)}\tn = len(xs)\n\treturn // Noncompliant\n}\n`),
  good: gf(`func stats(xs []int) (sum, n int) {\n\tn = len(xs)\n\treturn\n}\n`),
});

rule({
  id: 'else-after-return', type: 'S', sev: 'MI', debt: 2, tags: ['clumsy'], ref: '',
  en: ['"else" should be dropped after a block that returns', 'When the if block ends with return, the else block can be outdented, keeping the normal path at the left.', 'Remove the else and outdent its block.'],
  ko: ['return으로 끝나는 블록 뒤의 "else"는 없애야 합니다', 'if 블록이 return으로 끝나면 else 블록을 내어 써서 정상 경로를 왼쪽에 둘 수 있습니다.', 'else를 지우고 그 블록을 내어 쓰세요.'],
  on: {
    If(n, cx) {
      if (!n.els || n.els.k !== 'Block' || n.init) return;
      if (n.parent && n.parent.k === 'If' && n.parent.els === n) return;
      const last = n.then.stmts[n.then.stmts.length - 1];
      if (!last || last.k !== 'Return') return;
      cx.report(n.els, 'Remove this "else" and outdent its block: the if block ends with a return.', '이 "else"를 지우고 블록을 내어 쓰세요. if 블록이 return으로 끝납니다.', { line: n.then.endLine, col: n.then.endCol });
    },
  },
  bad: gf(`
func sign(x int) int {
	if x < 0 {
		return -1
	} else { // Noncompliant
		return 1
	}
}
`),
  good: gf(`
func sign(x int) int {
	if x < 0 {
		return -1
	}
	return 1
}
`),
});

rule({
  id: 'deprecated-ioutil', type: 'S', sev: 'MI', debt: 5, tags: ['obsolete'], ref: 'S1874',
  en: ['Deprecated packages and functions should not be used', 'io/ioutil is deprecated since Go 1.16 and strings.Title since Go 1.18.', 'Use the io and os equivalents (os.ReadFile, io.ReadAll...) and golang.org/x/text/cases.'],
  ko: ['더 이상 쓰지 않는 패키지와 함수를 쓰면 안 됩니다', 'io/ioutil은 Go 1.16부터, strings.Title은 Go 1.18부터 쓰지 않습니다.', 'io와 os의 대체 함수(os.ReadFile, io.ReadAll...)와 golang.org/x/text/cases를 쓰세요.'],
  file(pf, cx) {
    for (const imp of pf.importNodes) if (imp.path === 'io/ioutil') cx.report(imp.node, "Replace the deprecated package 'io/ioutil' with 'io' and 'os'.", "더 이상 쓰지 않는 패키지 'io/ioutil'을 'io'와 'os'로 바꾸세요.");
  },
  on: {
    Call(n, cx) {
      if (H.q(n) === 'strings.Title') cx.report(n, "'strings.Title' is deprecated; use golang.org/x/text/cases.", "'strings.Title'은 더 이상 쓰지 않습니다. golang.org/x/text/cases를 쓰세요.");
    },
  },
  bad: gf(`
import (
	"io/ioutil" // Noncompliant
	"strings"
)

func read(p string) (string, error) {
	b, err := ioutil.ReadFile(p)
	return strings.Title(string(b)), err // Noncompliant
}
`),
  good: gf(`
import "os"

func read(p string) (string, error) {
	b, err := os.ReadFile(p)
	return string(b), err
}
`),
});

// ── performance ──
rule({
  id: 'string-concat-loop', type: 'S', sev: 'MI', debt: 5, tags: ['performance'], ref: '',
  en: ['Strings should not be concatenated in loops', 'Each += copies the whole string, which is quadratic in the number of iterations.', 'Use a strings.Builder or collect parts and strings.Join them.'],
  ko: ['반복문 안에서 문자열을 이어 붙이면 안 됩니다', '+=를 할 때마다 문자열 전체를 복사하므로 반복 횟수의 제곱만큼 느려집니다.', 'strings.Builder를 쓰거나 조각을 모아 strings.Join하세요.'],
  on: {
    Assign(n, cx) {
      if (n.op !== '+=' || n.lhs.length !== 1) return;
      const l = A.strip(n.lhs[0]);
      if (!l || l.k !== 'Ident' || !l.sym || l.sym.tstr !== 'string') return;
      const loop = H.loopOf(n);
      if (!loop) return;
      const decl = l.sym.node;
      if (decl && decl.line >= loop.line && decl.line <= loop.endLine) return;
      cx.report(n, `'${l.name}' is concatenated in a loop; use a strings.Builder.`, `'${l.name}'을(를) 반복문 안에서 이어 붙입니다. strings.Builder를 쓰세요.`);
    },
  },
  bad: gf(`
func join(xs []string) string {
	s := ""
	for _, x := range xs {
		s += x + "," // Noncompliant
	}
	return s
}
`),
  good: gf(`
import "strings"

func join(xs []string) string {
	var b strings.Builder
	for _, x := range xs {
		b.WriteString(x)
	}
	return b.String()
}
`),
});

rule({
  id: 'regexp-compile-in-loop', type: 'S', sev: 'MA', debt: 5, tags: ['performance'], ref: '',
  en: ['Regular expressions should not be compiled inside loops', 'Compiling the same pattern on every iteration wastes CPU and memory.', 'Compile once into a package-level variable.'],
  ko: ['반복문 안에서 정규식을 컴파일하면 안 됩니다', '반복할 때마다 같은 패턴을 컴파일하면 CPU와 메모리를 낭비합니다.', '패키지 수준 변수에 한 번만 컴파일하세요.'],
  on: {
    Call(n, cx) {
      const q = H.q(n);
      if (!q || !/^regexp\.(MustCompile|Compile|MatchString|Match)$/.test(q) || !n.args.length || !A.isStr(n.args[0])) return;
      if (H.loopOf(n)) cx.report(n, `'${q}' compiles the same pattern on every iteration; compile it once outside the loop.`, `'${q}'은(는) 반복할 때마다 같은 패턴을 컴파일합니다. 반복문 밖에서 한 번만 컴파일하세요.`);
    },
  },
  bad: gf(`
import "regexp"

func count(lines []string) int {
	n := 0
	for _, l := range lines {
		if regexp.MustCompile("^#").MatchString(l) { // Noncompliant
			n++
		}
	}
	return n
}
`),
  good: gf(`
import "regexp"

var comment = regexp.MustCompile("^#")

func count(lines []string) int {
	n := 0
	for _, l := range lines {
		if comment.MatchString(l) {
			n++
		}
	}
	return n
}
`),
});

rule({
  id: 'redundant-nil-check', type: 'S', sev: 'MI', debt: 2, tags: ['clumsy'], ref: '',
  en: ['nil checks before len() on slices and maps should be omitted', 'len() of a nil slice or map is 0, so the nil check adds nothing.', 'Keep only the len() condition.'],
  ko: ['슬라이스와 맵의 len() 앞 nil 검사는 빼야 합니다', 'nil 슬라이스나 맵의 len()은 0이므로 nil 검사는 의미가 없습니다.', 'len() 조건만 남기세요.'],
  on: {
    Binary(n, cx) {
      if (n.op !== '&&') return;
      const a = A.strip(n.x);
      const b = A.strip(n.y);
      if (!a || a.k !== 'Binary' || a.op !== '!=' || !A.isNil(a.y)) return;
      const v = A.strip(a.x);
      if (!v || v.k !== 'Ident' || !v.sym) return;
      const t = v.sym.tstr || '';
      if (!t.startsWith('[]') && !t.startsWith('map[')) return;
      if (!b || b.k !== 'Binary') return;
      const l = A.strip(b.x);
      if (!l || l.k !== 'Call' || !A.isIdent(l.fun, 'len') || !l.args.length || !A.isIdent(l.args[0], v.name)) return;
      cx.report(a, `Remove the nil check on '${v.name}': len() of a nil ${t.startsWith('map') ? 'map' : 'slice'} is 0.`, `'${v.name}'의 nil 검사를 지우세요. nil ${t.startsWith('map') ? '맵' : '슬라이스'}의 len()은 0입니다.`);
    },
  },
  bad: gf(`
func any(xs []int) bool {
	return xs != nil && len(xs) > 0 // Noncompliant
}
`),
  good: gf(`
func any(xs []int) bool {
	return len(xs) > 0
}
`),
});

rule({
  id: 'struct-tag-syntax', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: '',
  en: ['Struct tags should be well formed', 'reflect.StructTag.Get ignores malformed tags, so json/xml/db options are silently lost.', 'Write tags as key:"value" pairs separated by single spaces.'],
  ko: ['구조체 태그는 형식이 올발라야 합니다', 'reflect.StructTag.Get은 잘못된 태그를 무시하므로 json/xml/db 옵션이 조용히 사라집니다.', '태그를 한 칸 공백으로 구분한 key:"value" 쌍으로 쓰세요.'],
  on: {
    Field(n, cx) {
      if (!n.tag) return;
      const t = n.tag.s;
      if (t === '' || /^[^\s:"\x00-\x1f]+:"(?:[^"\\]|\\.)*"(?: [^\s:"\x00-\x1f]+:"(?:[^"\\]|\\.)*")*$/.test(t)) return;
      cx.report({ line: n.tag.line, col: n.tag.col }, `Malformed struct tag ${n.tag.raw}: use key:"value" pairs separated by spaces.`, `구조체 태그 ${n.tag.raw}의 형식이 잘못되었습니다. 공백으로 구분한 key:"value" 쌍을 쓰세요.`);
    },
  },
  bad: gf(`
type user struct {
	Name string \`json: "name"\` // Noncompliant
	Age  int    \`json:"age",xml:"age"\` // Noncompliant
}
`),
  good: gf(`
type user struct {
	Name string \`json:"name" xml:"name"\`
	Age  int    \`json:"age,omitempty"\`
}
`),
});
