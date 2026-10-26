// Tests for the Go semantic analyzer (core/sem-go).
// Every catalog rule is exercised through the samples kept next to its
// definition: the non-compliant sample must report the rule on each line
// marked "// Noncompliant" (and nowhere else), the compliant sample must not
// report it. Parser, model and engine tests follow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sem = require('../core/sem-go');
const core = require('../core/sem-go/rules/core');
const { parseGo } = require('../core/sem-go/parser');
const { lex } = require('../core/sem-go/lexer');

function run(code, path = 'pkg/main.go', options = {}) {
  return sem.analyze([{ path, text: code, lang: 'go' }], { inactive: new Set(), root: null, options: { 'sem-go': options } });
}

function markers(code) {
  const out = [];
  code.split('\n').forEach((l, i) => { if (/\/\/ Noncompliant\b/.test(l)) out.push(i + 1); });
  return out;
}

const catalog = sem.catalog();

test('catalog: shape, unique keys and counts', () => {
  const keys = new Set();
  for (const r of catalog) {
    assert.ok(!keys.has(r.key), `duplicate ${r.key}`);
    keys.add(r.key);
    assert.match(r.key, /^sem-go:[a-z0-9-]+$/);
    assert.deepEqual(r.langs, ['go']);
    assert.ok(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].includes(r.type), r.key);
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(r.severity), r.key);
    assert.equal(typeof r.debtMin, 'number');
    assert.ok(Array.isArray(r.tags) && r.tags.includes('go'), r.key);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(r[f].en && r[f].ko, `${r.key} ${f}`);
      assert.ok(/[가-힣]/.test(r[f].ko), `${r.key} ${f} ko is Korean`);
    }
    assert.ok(Array.isArray(r.impacts) && r.impacts.length === 1, r.key);
    assert.equal(typeof r.checker, 'string');
    if (r.cwe) assert.match(r.cwe, /^CWE-\d+$/);
  }
  assert.ok(catalog.length >= 70, `rules ${catalog.length}`);
  const checkers = new Set(catalog.map((r) => r.checker));
  for (const c of ['FORWARD_NULL', 'RESOURCE_LEAK', 'CHECKED_RETURN', 'LOCK', 'DEADCODE', 'UNUSED_VALUE']) assert.ok(checkers.has(c), c);
  for (const s of ['S1066', 'S3776', 'S1067', 'S1134', 'S1135', 'S108', 'S1186', 'S1192', 'S1871', 'S1764', 'S2757', 'S1145', 'S1172', 'S1481', 'S1125', 'S3923', 'S4144', 'S100', 'S117', 'S107', 'S138', 'S1821', 'S1862', 'S2068', 'S1313', 'S4790', 'S5547', 'S4423', 'S4830', 'S2245']) {
    assert.ok(catalog.some((r) => r.refKey === s), `ref ${s}`);
  }
});

for (const def of core.RULES) {
  const key = def.key;
  test(`${key}: non-compliant sample`, () => {
    assert.ok(def.bad, 'missing non-compliant sample');
    const want = markers(def.bad);
    assert.ok(want.length, 'sample has no // Noncompliant marker');
    const got = run(def.bad).filter((f) => f.rule === key);
    const lines = [...new Set(got.map((f) => f.line))].sort((a, b) => a - b);
    assert.deepEqual(lines, want, `expected lines ${want} got ${lines}`);
    for (const f of got) {
      assert.ok(f.message && f.message.en && f.message.ko, 'message');
      assert.ok(!/undefined|\{\d\}/.test(f.message.en + f.message.ko), `bad message ${f.message.en}`);
      assert.equal(f.file, 'pkg/main.go');
    }
  });
  test(`${key}: compliant sample`, () => {
    assert.ok(def.good, 'missing compliant sample');
    const got = run(def.good).filter((f) => f.rule === key);
    assert.deepEqual(got.map((f) => f.line), []);
  });
}

// ── lexer ──
test('lexer: automatic semicolons, raw strings, runes and numbers', () => {
  const src = 'x := `a\nb`\ny := \'\\n\'\nz := 0x1F_u\nreturn\n}\n';
  const { tokens } = lex(src);
  const semis = tokens.filter((t) => t.v === ';' && t.auto).map((t) => t.line);
  assert.deepEqual(semis, [2, 3, 4, 5, 6]);
  const raw = tokens.find((t) => t.t === 'str');
  assert.equal(raw.s, 'a\nb');
  assert.equal(raw.endLine, 2);
  const rune = tokens.find((t) => t.t === 'char');
  assert.equal(rune.s, '\n');
  const nums = lex('1_000 0b1010 0o17 1.5e3 2i .5 0x1p-2').tokens.filter((t) => t.t !== 'op' && t.t !== 'eof').map((t) => t.t);
  assert.deepEqual(nums, ['int', 'int', 'int', 'float', 'imag', 'float', 'float']);
});

test('lexer: a multi-line block comment ends a statement', () => {
  const { tokens, comments } = lex('a := 1 /* one\n two */ b := 2');
  assert.ok(tokens.some((t) => t.v === ';' && t.auto && t.line === 1));
  assert.equal(comments.length, 1);
  assert.equal(comments[0].endLine, 2);
});

// ── parser ──
test('parser: modern Go (generics, type sets, range over int) parses without errors', () => {
  const r = parseGo(`package main

import (
	"fmt"
	m "math"
)

type Number interface {
	~int | ~int64 | ~float64
}

type List[T any] struct {
	next *List[T]
	val  T
	buf  [4]byte
	fmt.Stringer
	*Other \`json:"o"\`
}

type Pair[K comparable, V any] struct{ k K; v V }
type Grid [3][3]int
type Alias = List[int]

func Sum[T Number](xs ...T) (s T) {
	for _, x := range xs {
		s += x
	}
	return
}

func (l *List[T]) Push(v T) { l.next = &List[T]{val: v} }

func Map[S ~[]E, E, R any](s S, f func(E) R) []R {
	out := make([]R, 0, len(s))
	for _, e := range s {
		out = append(out, f(e))
	}
	return out
}

func main() {
	if v, ok := map[string]int{"a": 1}["a"]; ok {
		fmt.Println(v)
	}
	switch y := interface{}(1).(type) {
	case int, string:
		_ = y
	}
	ch := make(chan<- int, 1)
	var recv <-chan int
	select {
	case v, ok := <-recv:
		_, _ = v, ok
	case ch <- 1:
	default:
	}
	p := Pair[string, int]{k: "a"}
	if p == (Pair[string, int]{}) {
	}
	for i := range 10 {
		_ = i
	}
	arr := [...]int{1, 2, 3}
	_ = arr[1:2:3]
	_ = Sum[int](1, 2) + int(m.Pi)
	_ = Map([]int{1}, func(i int) string { return fmt.Sprint(i) })
	func() { defer func() { recover() }() }()
L:
	for {
		break L
	}
	goto L
}
`);
  assert.deepEqual(r.errors, []);
  const names = r.file.decls.filter((d) => d.k === 'FuncDecl').map((d) => d.name.name);
  assert.deepEqual(names, ['Sum', 'Push', 'Map', 'main']);
  const ts = r.file.decls.filter((d) => d.k === 'GenDecl' && d.kw === 'type').map((d) => d.specs[0]);
  assert.equal(ts.find((s) => s.name.name === 'Grid').type.k, 'ArrayType');
  assert.equal(ts.find((s) => s.name.name === 'Pair').tparams.length, 2);
  assert.ok(ts.find((s) => s.name.name === 'Alias').alias);
});

test('parser: composite literals are not confused with blocks in headers', () => {
  const r = parseGo(`package p
type T struct{ a int }
func f(x T) bool {
	for _, v := range []T{{1}, {2}} {
		if v == x {
			return true
		}
	}
	switch x {
	}
	return x == T{}
}
`);
  assert.deepEqual(r.errors, []);
});

test('parser: tolerant, keeps going after broken declarations', () => {
  const r = parseGo(`package p
func ok() int { return 1 }
func broken() { x := ; if { }
func ok2() int { return 2 }
var = 3
func ok3() {}
`);
  assert.ok(r.errors.length >= 1);
  const names = r.file.decls.filter((d) => d.k === 'FuncDecl').map((d) => d.name.name);
  assert.ok(names.includes('ok') && names.includes('ok2') && names.includes('ok3'), names.join(','));
});

// ── model ──
test('model: types are inferred for locals and resolved across files of a package', () => {
  const { buildProject } = sem._internals;
  const p = buildProject([
    { path: 'a/x.go', text: 'package a\nimport "os"\nfunc open(p string) (*os.File, error) { return os.Open(p) }\n' },
    { path: 'a/y.go', text: 'package a\nfunc use() { f, err := open("x"); m := map[string]int{}; s := "" ; _, _, _, _ = f, err, m, s }\n' },
    { path: 'b/z.go', text: 'package b\nfunc open() {}\n' },
  ]);
  assert.equal(p.packages.length, 2);
  const fn = p.files[1].funcs[0];
  const types = Object.fromEntries(fn.syms.map((s) => [s.name, s.tstr]));
  assert.deepEqual(types, { f: '*os.File', err: 'error', m: 'map[string]int', s: 'string' });
});

// ── engines ──
test('nil: refinement through && and early returns avoids false positives', () => {
  const code = `package main

type node struct{ next *node; v int }

func a(n *node) int {
	if n == nil || n.next == nil {
		return 0
	}
	return n.next.v
}

func b(n *node) int {
	if n != nil {
		return n.v
	}
	n = &node{}
	return n.v
}

func c(n *node) int {
	for n != nil {
		n = n.next
	}
	return 0
}
`;
  const got = run(code).filter((f) => /nil-/.test(f.rule));
  assert.deepEqual(got.map((f) => `${f.rule}:${f.line}`), []);
});

test('nil: path events point at the check and the dereference', () => {
  const code = `package main

type node struct{ v int }

func a(n *node) int {
	if n == nil {
		println("nil")
	}
	return n.v
}
`;
  const got = run(code).filter((f) => f.rule === 'sem-go:nil-deref-after-check');
  assert.equal(got.length, 1);
  assert.equal(got[0].line, 9);
  assert.equal(got[0].function, 'a');
  assert.deepEqual(got[0].events.map((e) => e.line), [6, 9]);
  assert.ok(got[0].events.some((e) => e.main));
});

test('resource leak: escapes and non-owning helpers', () => {
  const code = `package main

import (
	"bufio"
	"os"
)

type holder struct{ f *os.File }

func a(p string) (*holder, error) {
	f, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	return &holder{f: f}, nil
}

func b(p string, out chan *os.File) {
	f, err := os.Open(p)
	if err != nil {
		return
	}
	out <- f
}

func c(p string) int {
	f, err := os.Open(p)
	if err != nil {
		return 0
	}
	s := bufio.NewScanner(f)
	n := 0
	for s.Scan() {
		n++
	}
	return n
}

func d(p string) error {
	f, err := os.Create(p)
	if err != nil {
		return err
	}
	defer func() {
		_ = f.Close()
	}()
	return nil
}
`;
  const got = run(code).filter((f) => f.rule === 'sem-go:resource-leak');
  assert.deepEqual(got.map((f) => f.line), [27]);
  assert.ok(got[0].events.some((e) => e.tag === 'leak' && e.line === 36));
});

test('dead store: loops and closures do not cause false positives', () => {
  const code = `package main

func a(xs []int) int {
	last := -1
	for _, x := range xs {
		if x > 0 {
			last = x
		}
	}
	return last
}

func b() int {
	n := 5
	f := func() { n = 7 }
	f()
	return n
}

func c(xs []int) (total int) {
	total = 10
	for _, x := range xs {
		total += x
	}
	return
}
`;
  const got = run(code).filter((f) => f.rule === 'sem-go:dead-store' || f.rule === 'sem-go:err-unchecked');
  assert.deepEqual(got.map((f) => f.line), []);
});

test('goroutine loop variable: not reported when go.mod targets Go 1.22+', () => {
  const def = core.BY_ID.get('goroutine-loop-var');
  const old = run(def.bad).filter((f) => f.rule === def.key);
  assert.equal(old.length, 1);
  const modern = run(def.bad, 'pkg/main.go', { goVersion: '1.22' }).filter((f) => f.rule === def.key);
  assert.equal(modern.length, 0);
});

test('options: thresholds can be configured', () => {
  const def = core.BY_ID.get('too-many-params');
  assert.equal(run(def.bad, 'pkg/main.go', { maxParams: 10 }).filter((f) => f.rule === def.key).length, 0);
  assert.equal(run(def.good.replace('o opts', 'a, b, c int'), 'pkg/main.go', { maxParams: 2 }).filter((f) => f.rule === def.key).length, 1);
});

// ── robustness ──
test('inactive rules are not reported', () => {
  const def = core.BY_ID.get('nil-map-write');
  assert.ok(run(def.bad).some((f) => f.rule === def.key));
  const off = sem.analyze([{ path: 'pkg/main.go', text: def.bad, lang: 'go' }], { inactive: new Set([def.key]), root: null, options: {} });
  assert.equal(off.filter((f) => f.rule === def.key).length, 0);
  const allOff = sem.analyze([{ path: 'pkg/main.go', text: def.bad, lang: 'go' }], { inactive: new Set(catalog.map((r) => r.key)), root: null, options: {} });
  assert.deepEqual(allOff, []);
});

test('non-Go files are ignored', () => {
  const def = core.BY_ID.get('nil-map-write');
  assert.deepEqual(sem.analyze([{ path: 'src/a.java', text: def.bad, lang: 'java' }, { path: 'x.py', text: 'x = 1', lang: 'py' }], { inactive: new Set(), root: null, options: {} }), []);
  assert.deepEqual(sem.analyze([], {}), []);
  assert.deepEqual(sem.analyze([{ path: 'a.go', text: null, lang: 'go' }], {}), []);
});

test('generated files are skipped', () => {
  const def = core.BY_ID.get('nil-map-write');
  const code = `// Code generated by protoc-gen-go. DO NOT EDIT.\n\n${def.bad}`;
  assert.deepEqual(run(code).filter((f) => f.rule === def.key), []);
});

test('garbage input never throws', () => {
  const junk = [
    '', 'package', 'package main\nfunc {{{{', 'func (((( ->', '"unterminated', '`raw', "'x", '@@@ ### $$$',
    'package p\nfunc f() { if ( } }', '}}}}', 'package p\ntype T[ struct', 'package p\nfunc f[T any(x T) {}',
    'package p\nvar x = []int{1, 2,', 'package p\nfunc f() { for range { select { case <- } } }',
    'package p\nfunc f() { x := map[string]func(){ "a": func() { go } } }', '\u0000\u0001\u0002',
    `package p\nfunc f() {${'('.repeat(2000)}}`, `package p\nfunc f() {${'{'.repeat(2000)}}`,
    `package p\nvar x = ${'-'.repeat(3000)}1`,
  ];
  for (const j of junk) {
    assert.doesNotThrow(() => run(j), j.slice(0, 40));
    assert.doesNotThrow(() => parseGo(j));
  }
  for (const def of core.RULES) {
    const src = def.bad;
    for (let cut = 10; cut < src.length; cut += Math.max(7, Math.floor(src.length / 9))) {
      assert.doesNotThrow(() => run(src.slice(0, cut)), `${def.id} cut ${cut}`);
    }
  }
});

test('performance: 20k lines in well under 3 s', () => {
  const fn = (i) => `func f${i}(xs []string, m map[string]int) (int, error) {
	total := 0
	for _, x := range xs {
		if x == "" {
			continue
		}
		v, ok := m[x]
		if !ok {
			return 0, fmt.Errorf("missing %s", x)
		}
		total += v
	}
	f, err := os.Open(xs[0])
	if err != nil {
		return 0, err
	}
	defer f.Close()
	return total, nil
}
`;
  const files = [];
  let lines = 0;
  for (let k = 0; lines < 20000; k++) {
    let body = 'package p\n\nimport (\n\t"fmt"\n\t"os"\n)\n\n';
    for (let i = 0; i < 40; i++) body += fn(i);
    lines += body.split('\n').length;
    files.push({ path: `p${k}/f.go`, text: body, lang: 'go' });
  }
  const t0 = Date.now();
  sem.analyze(files, { inactive: new Set(), root: null, options: {} });
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, `took ${ms} ms for ${lines} lines`);
});
