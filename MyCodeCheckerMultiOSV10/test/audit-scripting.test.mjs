// Python / Go / PHP / Ruby rule audit: realistic compliant code that used to
// be reported, next to the non-compliant form that must stay reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const base = require('../core/rules.js');
const extra = require('../core/rules-extra/index.js');
const { structuralIssues } = require('../core/metrics.js');
const { commentKind, ruleLangsFor } = require('../core/languages.js');
const ENGINES = {
  py: require('../core/sem-py'),
  go: require('../core/sem-go'),
  php: require('../core/sem-php'),
  rb: require('../core/sem-rb'),
};

const ALL = [...base.RULES, ...extra.RULES];
const byKey = (key) => {
  const r = ALL.find((x) => x.key === key);
  assert.ok(r, key);
  return r;
};

// The line loop of core/analyze.js for one rule; skip gets the file and the
// file's lines (skip(rawLine, line, file, { index, lines })).
function lineHits(key, text, lang, path = `src/sample.${lang}`) {
  const rule = byKey(key);
  const langs = new Set(ruleLangsFor(lang));
  if (!rule.langs.some((l) => langs.has(l))) return [];
  const st = structuralIssues(text, commentKind(lang));
  const file = { path, lang };
  const hits = [];
  const src = rule.scope === 'any' ? st.lines : st.code;
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    if (!line || !line.trim()) continue;
    if (rule.scope !== 'any' && st.commentOnly[i] && line.trim() === '') continue;
    rule.re.lastIndex = 0;
    if (!rule.re.test(line)) continue;
    if (rule.skip && rule.skip(st.lines[i], line, file, { index: i, lines: st.lines })) continue;
    hits.push(i + 1);
  }
  return hits;
}

// Findings of one semantic rule: [line, ...]
function semHits(lang, rule, files) {
  const list = Array.isArray(files) ? files : [{ path: `src/sample.${lang}`, text: files }];
  const out = ENGINES[lang].analyze(list.map((f) => ({ ...f, lang })), { inactive: new Set(), root: null, options: {} });
  return out.filter((f) => f.rule === rule).map((f) => f.line).sort((a, b) => a - b);
}
const semMessages = (lang, rule, text) => ENGINES[lang].analyze([{ path: `src/sample.${lang}`, text, lang }], { inactive: new Set(), root: null, options: {} })
  .filter((f) => f.rule === rule).map((f) => f.message.en);

const L = (...lines) => lines.join('\n') + '\n';

// ── Python line rules ───────────────────────────────────────

test('py:eval: model.eval() and a method named eval are not the builtin', () => {
  assert.deepEqual(lineHits('py:eval', L('model = build_model(5).eval()', 'net.eval()', 'def eval(self, x):', '    return df.eval("a + b")'), 'py'), []);
  assert.deepEqual(lineHits('py:eval', L('value = eval(text)', 'exec(code, {})', 'builtins.eval(src)'), 'py'), [1, 2, 3]);
});

test('py:bind-all: comparing with 0.0.0.0 binds nothing', () => {
  assert.deepEqual(lineHits('py:bind-all', L('assert parse_addr(":8080") == ("0.0.0.0", 8080)', 'if host in ("0.0.0.0", "::"):'), 'py'), []);
  assert.deepEqual(lineHits('py:bind-all', L("app.run(host='0.0.0.0', port=5000)"), 'py'), [1]);
});

test('py:lambda-assignment: a keyword argument spread over lines is not an assignment', () => {
  assert.deepEqual(lineHits('py:lambda-assignment', L('out = tf.cond(', '    pred,', '    true_fn = lambda: tf.argmax(x, axis=1),', '    false_fn = lambda: tf.zeros([]))'), 'py'), []);
  assert.deepEqual(lineHits('py:lambda-assignment', L('square = lambda x: x * x'), 'py'), [1]);
});

test('py:assert and py:print-debug: test files are the place for assert and print', () => {
  const code = L('def test_sum():', '    print("checking")', '    assert add(1, 2) == 3');
  for (const path of ['tests/test_math.py', 'pkg/test_math.py', 'pkg/math_test.py', 'conftest.py', 'test/helpers.py']) {
    assert.deepEqual(lineHits('py:assert', code, 'py', path), [], path);
    assert.deepEqual(lineHits('py:print-debug', code, 'py', path), [], path);
  }
  assert.deepEqual(lineHits('py:assert', code, 'py', 'pkg/math.py'), [3]);
  assert.deepEqual(lineHits('py:print-debug', code, 'py', 'pkg/math.py'), [2]);
});

test('py:except-base-exception: a handler that re-raises swallows nothing', () => {
  const good = L(
    'try:',
    '    chunks = encode(value)',
    'except BaseException as exc:',
    '    exc.add_note("while encoding")',
    '    raise',
    'try:',
    '    run()',
    'except BaseException as exc:',
    '    cleanup()',
    '    raise Failed("run") from exc',
  );
  assert.deepEqual(lineHits('py:except-base-exception', good, 'py'), []);
  assert.deepEqual(lineHits('py:except-base-exception', L('try:', '    run()', 'except BaseException:', '    log.exception("x")', 'print("after")'), 'py'), [3]);
});

test('py:fstring-no-placeholder: escapes and implicit concatenation are not empty f-strings', () => {
  const good = L(
    "ESC = {'b': '\\b', 'f': '\\f', 'n': '\\n'}",
    "raise TypeError(f'Object of type {obj.__class__.__name__} '",
    "                f'is not JSON serializable')",
  );
  assert.deepEqual(lineHits('py:fstring-no-placeholder', good, 'py'), []);
  assert.deepEqual(lineHits('py:fstring-no-placeholder', L("msg = f'done'"), 'py'), [1]);
});

// ── Python semantic rules ───────────────────────────────────

test('sem-py:unused-import: noqa on the first line of a parenthesised import', () => {
  const good = L('from kws.archs import (  # noqa: F401  re-exported', '    ARCHS,', '    DSCNN,', ')');
  assert.deepEqual(semHits('py', 'sem-py:unused-import', good), []);
  assert.deepEqual(semHits('py', 'sem-py:unused-import', L('from kws.archs import (', '    ARCHS,', ')')), [2]);
});

test('sem-py:duplicated-string-literal: an existing constant is named, not asked for', () => {
  const code = L('CARD = "#ffffff"', '', '', 'def paint(w):', '    w.configure(bg="#ffffff" if w.active else CARD)', '    return ["#ffffff", w]');
  const msgs = semMessages('py', 'sem-py:duplicated-string-literal', code);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Use the constant 'CARD'/);
  assert.deepEqual(semHits('py', 'sem-py:duplicated-string-literal', code), [5]);
});

test('sem-py:method-naming: overrides through a project base class of a foreign class', () => {
  const code = L(
    'from PySide6.QtWidgets import QWidget',
    '',
    '',
    'class PaintedButton(QWidget):',
    '    def paintEvent(self, e):',
    '        pass',
    '',
    '',
    'class ToolButton(PaintedButton):',
    '    def paintEvent(self, e):',
    '        return None',
    '',
    '',
    'class Plain:',
    '    def doWork(self):',
    '        return 1',
  );
  assert.deepEqual(semHits('py', 'sem-py:method-naming', code), [15]);
});

test('sem-py:dead-store: a store in a finally body read after the try', () => {
  const good = L(
    'def flatten(self, msg):',
    '    old = self._fp',
    '    try:',
    '        self._munge = None',
    '        self._dispatch(msg)',
    '    finally:',
    '        self._fp = old',
    '        munge = self._munge',
    '        del self._munge',
    '    if munge:',
    '        return munge',
    '    return None',
  );
  assert.deepEqual(semHits('py', 'sem-py:dead-store', good), []);
  const bad = L('def f(g):', '    try:', '        g()', '    finally:', '        m = g.a()', '        m = g.b()', '    return m');
  assert.deepEqual(semHits('py', 'sem-py:dead-store', bad), [5]);
});

// ── Go line rules ───────────────────────────────────────────

test('go:error-string-capitalized: a first word that is an identifier', () => {
  assert.deepEqual(lineHits('go:error-string-capitalized', L('return errors.New("ReverseProxy must have a Director")', 'return nil, errors.New("Request.URL is nil")', 'return fmt.Errorf("HTTP %d", c)'), 'go'), []);
  assert.deepEqual(lineHits('go:error-string-capitalized', L('return errors.New("Not found")'), 'go'), [1]);
});

test('go:panic-call / go:http-no-timeout / go:math-rand: _test.go files', () => {
  const code = L('func TestX(t *testing.T) {', '	res, _ := http.Get(ts.URL)', '	n := rand.Intn(5)', '	panic("unused")', '}');
  assert.deepEqual(lineHits('go:panic-call', code, 'go', 'pkg/x_test.go'), []);
  assert.deepEqual(lineHits('go:http-no-timeout', code, 'go', 'pkg/x_test.go'), []);
  assert.deepEqual(lineHits('go:math-rand', code, 'go', 'pkg/x_test.go'), []);
  assert.deepEqual(lineHits('go:panic-call', code, 'go', 'pkg/x.go'), [4]);
  assert.deepEqual(lineHits('go:http-no-timeout', code, 'go', 'pkg/x.go'), [2]);
  assert.deepEqual(lineHits('go:math-rand', code, 'go', 'pkg/x.go'), [3]);
});

test('go:math-rand: crypto/rand.Read and rand.Int(rand.Reader, max) are the secure ones', () => {
  assert.deepEqual(lineHits('go:math-rand', L('import "crypto/rand"', 'if _, err := rand.Read(b); err != nil {', 'n, err := rand.Int(rand.Reader, max)'), 'go'), []);
  assert.deepEqual(lineHits('go:math-rand', L('import "math/rand"', 'n := rand.Int()'), 'go'), [1, 2]);
});

test('go:sql-concat: a + in the SQL text or among the parameters', () => {
  const good = L('db.Exec("UPDATE t SET n = n + 1 WHERE id = ?", id)', 'db.QueryRow("SELECT name FROM t WHERE id = ?", id+1)', 'db.QueryContext(ctx, "SELECT 1 WHERE a = $1", a+b)');
  assert.deepEqual(lineHits('go:sql-concat', good, 'go'), []);
  const bad = L('db.Query("select * from t " + id)', 'db.Exec(fmt.Sprintf("DELETE FROM %s", table))', 'db.QueryContext(ctx, base + where)');
  assert.deepEqual(lineHits('go:sql-concat', bad, 'go'), [1, 2, 3]);
});

// ── Go semantic rules ───────────────────────────────────────

const goFile = (body, imports = []) => `package sample\n\n${imports.length ? `import (\n${imports.map((i) => `\t"${i}"`).join('\n')}\n)\n\n` : ''}${body}`;

test('sem-go: if seen[k] { opens the block, not a composite literal', () => {
  const code = goFile(L(
    'func keep(all []string, parent map[string]bool) []string {',
    '	out := make([]string, 0, len(all))',
    '	for _, r := range all {',
    '		if !parent[r] {',
    '			out = append(out, r)',
    '		}',
    '	}',
    '	return out',
    '}',
  ));
  assert.deepEqual(semHits('go', 'sem-go:empty-block', code), []);
  assert.deepEqual(semHits('go', 'sem-go:empty-block', goFile(L('func f(m map[string]bool, k string) {', '	if m[k] {', '	}', '}'))), [4]);
});

test('sem-go:error-compare-eq: io.EOF straight from Read is the documented idiom', () => {
  const good = goFile(L(
    'func drain(r io.Reader) error {',
    '	buf := make([]byte, 512)',
    '	for {',
    '		_, err := r.Read(buf)',
    '		if err == io.EOF {',
    '			return nil',
    '		}',
    '		if err != nil {',
    '			return err',
    '		}',
    '	}',
    '}',
  ), ['io']);
  assert.deepEqual(semHits('go', 'sem-go:error-compare-eq', good), []);
  const bad = goFile(L(
    'func run(f func() error) bool {',
    '	err := f()',
    '	return err == io.EOF',
    '}',
  ), ['io']);
  assert.equal(semHits('go', 'sem-go:error-compare-eq', bad).length, 1);
});

test('sem-go:err-shadow: the outer err is assigned again before it is read', () => {
  const good = goFile(L(
    'func save(path string, data []byte) error {',
    '	dir, err := clean(path)',
    '	if err != nil {',
    '		return err',
    '	}',
    '	if err := os.MkdirAll(dir, 0o755); err != nil {',
    '		return err',
    '	}',
    '	out, err := encode(data)',
    '	if err != nil {',
    '		return err',
    '	}',
    '	return os.WriteFile(path, out, 0o644)',
    '}',
    'func clean(p string) (string, error) { return p, nil }',
    'func encode(b []byte) ([]byte, error) { return b, nil }',
  ), ['os']);
  assert.deepEqual(semHits('go', 'sem-go:err-shadow', good), []);
  const bad = goFile(L(
    'func load(p string) error {',
    '	err := check(p)',
    '	if p != "" {',
    '		err := check(p + "x")',
    '		_ = err',
    '	}',
    '	return err',
    '}',
    'func check(p string) error { return nil }',
  ));
  assert.equal(semHits('go', 'sem-go:err-shadow', bad).length, 1);
});

test('sem-go:unused-unexported: build-constrained variants and iota members', () => {
  const files = [
    { path: 'cmd/setup/main.go', text: goFile(L('func main() {', '	println(defaultTarget(), modeA)', '}')) },
    { path: 'cmd/setup/install_unix.go', text: '//go:build !windows\n\n' + goFile(L('func defaultTarget() string { return "/usr/local" }')) },
    { path: 'cmd/setup/install_windows.go', text: goFile(L('func defaultTarget() string { return "C:\\\\Program Files" }')) },
    { path: 'cmd/setup/modes.go', text: goFile(L('const (', '	modeA = iota', '	modeB', ')', '', 'func helper() int { return 1 }')) },
  ];
  const hits = ENGINES.go.analyze(files.map((f) => ({ ...f, lang: 'go' })), { inactive: new Set(), root: null, options: {} })
    .filter((f) => f.rule === 'sem-go:unused-unexported').map((f) => `${f.file}:${f.line}`);
  assert.deepEqual(hits, ['cmd/setup/modes.go:8']);
});

test('sem-go:unused-local: a variable passed to a call in _ = f(x) is used', () => {
  const good = goFile(L('func link(dir, name string) {', '	p := filepath.Join(dir, name)', '	_ = os.Remove(p)', '}'), ['os', 'path/filepath']);
  assert.deepEqual(semHits('go', 'sem-go:unused-local', good), []);
  const bad = goFile(L('func f(xs []int) int {', '	seen := 0', '	for range xs {', '		seen++', '	}', '	_ = seen', '	return len(xs)', '}'));
  assert.deepEqual(semHits('go', 'sem-go:unused-local', bad), [4]);
});

test('sem-go:identical-functions: same-name methods of different types and platform files', () => {
  const body = (recv) => L(`func (b *${recv}) SetPalette(p *Palette) {`, '	b.pal = p', '	b.Refresh()', '	b.count++', '}');
  const code = goFile(L('type Palette struct{}', 'type Key struct{ pal *Palette; count int }', 'type Tool struct{ pal *Palette; count int }',
    'func (b *Key) Refresh()  {}', 'func (b *Tool) Refresh() {}', body('Key'), body('Tool')));
  assert.deepEqual(semHits('go', 'sem-go:identical-functions', code), []);
  const twin = (name) => L(`func ${name}(xs []int) int {`, '	total := 0', '	for _, x := range xs {', '		total += x', '	}', '	return total', '}');
  const files = [
    { path: 'p/a.go', text: goFile(twin('sumA')) },
    { path: 'p/b.go', text: goFile(twin('sumB')) },
  ];
  const out = ENGINES.go.analyze(files.map((f) => ({ ...f, lang: 'go' })), { inactive: new Set(), root: null, options: {} })
    .filter((f) => f.rule === 'sem-go:identical-functions');
  assert.equal(out.length, 1);
  assert.match(out[0].message.en, /a\.go:3/);
});

test('sem-go:identical-branches: one-line switch cases are a lookup table', () => {
  const good = goFile(L(
    'func color(name string, p *P) int {',
    '	switch name {',
    '	case "bg":',
    '		return p.Wnd',
    '	case "muted":',
    '		return p.Muted',
    '	case "scroll":',
    '		return p.Muted',
    '	}',
    '	return 0',
    '}',
    'type P struct{ Wnd, Muted int }',
  ));
  assert.deepEqual(semHits('go', 'sem-go:identical-branches', good), []);
});

test('sem-go:resource-leak: closeErr := f.Close() closes the file', () => {
  const good = goFile(L(
    'func copyTo(dest string, src io.Reader) error {',
    '	f, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE, 0o644)',
    '	if err != nil {',
    '		return err',
    '	}',
    '	_, copyErr := io.Copy(f, src)',
    '	closeErr := f.Close()',
    '	if copyErr != nil {',
    '		return copyErr',
    '	}',
    '	return closeErr',
    '}',
    'func write(dest string) error {',
    '	f, err := os.Create(dest)',
    '	if err != nil {',
    '		return err',
    '	}',
    '	return f.Close()',
    '}',
  ), ['io', 'os']);
  assert.deepEqual(semHits('go', 'sem-go:resource-leak', good), []);
});

test('sem-go:missing-unlock: an Unlock / Lock cycle under a deferred Unlock', () => {
  const good = goFile(L(
    'type set struct {',
    '	mu   sync.Mutex',
    '	list []int',
    '}',
    'func (s *set) wait() {',
    '	s.mu.Lock()',
    '	defer s.mu.Unlock()',
    '	for i := range s.list {',
    '		if i != 0 {',
    '			s.mu.Unlock()',
    '			time.Sleep(time.Millisecond)',
    '			s.mu.Lock()',
    '			continue',
    '		}',
    '	}',
    '}',
  ), ['sync', 'time']);
  assert.deepEqual(semHits('go', 'sem-go:missing-unlock', good), []);
  const branch = goFile(L(
    'type sig struct {',
    '	mu   sync.Mutex',
    '	rerr error',
    '}',
    'func (es *sig) read(err error) error {',
    '	if err != nil {',
    '		es.mu.Lock()',
    '		defer es.mu.Unlock()',
    '		es.rerr = err',
    '	}',
    '	return err',
    '}',
  ), ['sync']);
  assert.deepEqual(semHits('go', 'sem-go:missing-unlock', branch), []);
  const bad = goFile(L('type set struct{ mu sync.Mutex }', 'func (s *set) f(x int) int {', '	s.mu.Lock()', '	if x > 0 {', '		return x', '	}', '	s.mu.Unlock()', '	return 0', '}'), ['sync']);
  assert.equal(semHits('go', 'sem-go:missing-unlock', bad).length, 1);
});

test('sem-go:unreachable-code: the body after t.Skip is disabled on purpose', () => {
  const code = goFile(L('func TestLarge(t *testing.T) {', '	t.Skip("too large")', '	run(t)', '}', 'func run(t *testing.T) {}'), ['testing']);
  assert.deepEqual(semHits('go', 'sem-go:unreachable-code', [{ path: 'p/large_test.go', text: code }]), []);
});

test('sem-go: test fixtures are not clear-text or hard-coded IP hotspots', () => {
  const code = goFile(L('func TestAddr(t *testing.T) {', '	req.RemoteAddr = "1.2.3.4:1234"', '	u := "http://foo.com/path"', '	_ = u', '}', 'var req struct{ RemoteAddr string }'), ['testing']);
  assert.deepEqual(semHits('go', 'sem-go:clear-text-url', [{ path: 'p/a_test.go', text: code }]), []);
  assert.deepEqual(semHits('go', 'sem-go:hardcoded-ip', [{ path: 'p/a_test.go', text: code }]), []);
  assert.equal(semHits('go', 'sem-go:clear-text-url', [{ path: 'p/a.go', text: code }]).length, 1);
  assert.equal(semHits('go', 'sem-go:hardcoded-ip', [{ path: 'p/a.go', text: code }]).length, 1);
});

test('sem-go:error-string-style: Request.URL starts with an identifier', () => {
  assert.deepEqual(semHits('go', 'sem-go:error-string-style', goFile(L('var errNoURL = errors.New("Request.URL is nil")'), ['errors'])), []);
  assert.equal(semHits('go', 'sem-go:error-string-style', goFile(L('var errX = errors.New("Hijack failed")'), ['errors'])).length, 1);
});

// ── PHP ─────────────────────────────────────────────────────

test('php:eval / php:shell: methods and expression asserts run no PHP or shell', () => {
  const good = L('<?php', "$redis->eval('return 1', [], 0);", 'assert(is_array($settings));', "$pdo->exec('DELETE FROM log');", 'function exec($cmd) { return $cmd; }');
  assert.deepEqual(lineHits('php:eval', good, 'php'), []);
  assert.deepEqual(lineHits('php:shell', good, 'php'), []);
  const bad = L('<?php', 'eval($code);', "assert('$x > 0');", 'exec("ls " . $dir);', 'system($cmd);');
  assert.deepEqual(lineHits('php:eval', bad, 'php'), [2, 3]);
  assert.deepEqual(lineHits('php:shell', bad, 'php'), [4, 5]);
});

test('php:sql-interpolation: bound values and WordPress table names', () => {
  const good = L('<?php',
    "$rows = DB::select('SELECT id FROM t WHERE a = ? AND b LIKE ?', [$id, '%' . $term . '%']);",
    '$row = $wpdb->get_row($wpdb->prepare("SELECT v FROM {$wpdb->postmeta} WHERE post_id = %d", $id));',
    '$n = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = \'page\'");');
  assert.deepEqual(lineHits('php:sql-interpolation', good, 'php'), []);
  const bad = L('<?php', '$db->query("SELECT * FROM users WHERE id = $id");', "mysqli_query($conn, 'SELECT * FROM t WHERE a = ' . $a);", '$wpdb->get_results("SELECT * FROM t WHERE id = $id");');
  assert.deepEqual(lineHits('php:sql-interpolation', bad, 'php'), [2, 3, 4]);
});

test('php:removed-function / php:debug-output / php:shell-backticks: look-alikes', () => {
  assert.deepEqual(lineHits('php:removed-function', L('<?php', 'public function each(array $rows, callable $fn): void', '$items->each(fn ($i) => $i->save());'), 'php'), []);
  assert.deepEqual(lineHits('php:removed-function', L('<?php', '$parts = split(",", $line);'), 'php'), [2]);
  assert.deepEqual(lineHits('php:debug-output', L('<?php', '$yaml = $dumper->dump($config);', 'public function dump(): array'), 'php'), []);
  assert.deepEqual(lineHits('php:debug-output', L('<?php', 'var_dump($user);', 'dd($request);'), 'php'), [2, 3]);
  assert.deepEqual(lineHits('php:shell-backticks', L('<?php', '$sql = "SELECT * FROM `{$table}` WHERE `id` = ?";'), 'php'), []);
  assert.deepEqual(lineHits('php:shell-backticks', L('<?php', '$out = `ls $dir`;'), 'php'), [2]);
});

test('sem-php:unused-parameter: named callbacks and positional closure parameters', () => {
  const good = L('<?php',
    "add_action('save_post', 'notes_save', 10, 2);",
    'function notes_save($post_id, $post)',
    '{',
    '    update_post_meta($post_id, "_n", 1);',
    '}',
    '$out = array_filter($names, function ($v, $k) {',
    '    return $k !== 0;',
    '}, ARRAY_FILTER_USE_BOTH);');
  assert.deepEqual(semHits('php', 'sem-php:unused-parameter', good), []);
  assert.deepEqual(semHits('php', 'sem-php:unused-parameter', L('<?php', 'function area($w, $h, $unit)', '{', '    return $w * $h;', '}')), [2]);
});

// ── Ruby ────────────────────────────────────────────────────

test('rb:eval: block forms evaluate no text', () => {
  const good = L('class_eval do', '  def x; end', 'end', 'instance_eval(&block)', 'Order.class_exec { attr_reader :a }', 'respond_to?(:eval)');
  assert.deepEqual(lineHits('rb:eval', good, 'rb'), []);
  assert.deepEqual(lineHits('rb:eval', L('eval(params[:code])', 'Foo.class_eval "def #{name}; end"', 'binding.eval(src)'), 'rb'), [1, 2, 3]);
});

test('rb:html-safe / rb:skip-auth / rb:shell-interpolation: look-alikes', () => {
  assert.deepEqual(lineHits('rb:html-safe', L('canvas.draw(items)', 'def draw(canvas)'), 'rb'), []);
  assert.deepEqual(lineHits('rb:html-safe', L('<%= raw(@body) %>', 'name.html_safe'), 'rb'), [1, 2]);
  assert.deepEqual(lineHits('rb:skip-auth', L('skip_before_action :set_locale, only: :export'), 'rb'), []);
  assert.deepEqual(lineHits('rb:skip-auth', L('skip_before_action :authenticate_user!, only: :show', 'skip_before_action :verify_authenticity_token'), 'rb'), [1, 2]);
  assert.deepEqual(lineHits('rb:shell-interpolation', L('conn.exec("SELECT * FROM t WHERE id = #{conn.escape(id)}")'), 'rb'), []);
  assert.deepEqual(lineHits('rb:shell-interpolation', L('system("tar xf #{path}")'), 'rb'), [1]);
});
