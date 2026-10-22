// Tests for the Java / Kotlin semantic analyzer (core/sem-java).
// Every catalog rule is exercised through the samples kept next to its
// definition: the non-compliant sample must report the rule on each line
// marked "// Noncompliant" (and nowhere else), the compliant sample must not
// report it. Engine-specific tests follow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sem = require('../core/sem-java');
const core = require('../core/sem-java/rules/core');
const { parseJava } = require('../core/sem-java/jparser');
const { parseKotlin } = require('../core/sem-java/kparser');

function run(code, lang = 'java', path) {
  const file = path || (lang === 'kt' ? 'src/main/kotlin/T.kt' : 'src/main/java/T.java');
  return sem.analyze([{ path: file, text: code, lang }], { inactive: new Set(), root: null, options: {} });
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
    assert.match(r.key, /^sem-java:[a-z0-9-]+$/);
    assert.ok(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].includes(r.type), r.key);
    assert.ok(['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].includes(r.severity), r.key);
    for (const f of ['name', 'why', 'fix']) {
      assert.ok(r[f].en && r[f].ko, `${r.key} ${f}`);
    }
    assert.ok(Array.isArray(r.impacts) && r.impacts.length === 1, r.key);
  }
  const java = catalog.filter((r) => r.langs[0] === 'java').length;
  const kt = catalog.filter((r) => r.langs[0] === 'kt').length;
  assert.ok(java >= 200, `java rules ${java}`);
  assert.ok(kt >= 60, `kotlin rules ${kt}`);
});

for (const def of core.RULES) {
  for (const lang of def.langs) {
    const key = core.keyFor(def, lang);
    const bad = def.bad && def.bad[lang];
    const good = def.good && def.good[lang];
    const path = def.samplePath && def.samplePath[lang];
    test(`${key}: non-compliant sample`, () => {
      assert.ok(bad, `missing non-compliant ${lang} sample`);
      const want = markers(bad);
      assert.ok(want.length, 'sample has no // Noncompliant marker');
      const got = run(bad, lang, path).filter((f) => f.rule === key);
      const lines = [...new Set(got.map((f) => f.line))].sort((a, b) => a - b);
      assert.deepEqual(lines, want, `expected lines ${want} got ${lines}`);
      for (const f of got) {
        assert.ok(f.message && f.message.en && f.message.ko, 'message');
        assert.ok(!/\{\d\}/.test(f.message.en + f.message.ko), `unfilled placeholder in ${f.message.en}`);
      }
    });
    test(`${key}: compliant sample`, () => {
      assert.ok(good, `missing compliant ${lang} sample`);
      const got = run(good, lang, path).filter((f) => f.rule === key);
      assert.deepEqual(got.map((f) => f.line), []);
    });
  }
}

// ── parser ──
test('java parser: modern syntax parses without errors', () => {
  const u = parseJava(`package a.b;
import java.util.*;
sealed interface Shape permits Circle, Square {}
record Circle(double r) implements Shape {
  Circle { if (r < 0) throw new IllegalArgumentException(); }
}
final class Square implements Shape { int side; }
enum Color { RED, GREEN { @Override String hex() { return "0f0"; } }; String hex() { return ""; } }
@interface Marker { String value() default ""; int[] ids() default {1, 2}; }
class Main<T extends Comparable<? super T>> {
  static <K, V extends List<? extends K>> Map<K, V> f(Map<K, V> m) { return m; }
  String describe(Object o) {
    var text = """
        hello
          world
        """;
    int[][] grid = new int[3][];
    Runnable r = () -> {};
    java.util.function.Function<String, Integer> len = String::length;
    Object x = switch (o) {
      case Circle c when c.r() > 1 -> "big";
      case Circle(double rr) -> "circle " + rr;
      case null, default -> { yield "?"; }
    };
    if (o instanceof String s && !s.isEmpty()) return s;
    label: for (int i = 0, j = 10; i < j; i++, j--) { if (i == 3) continue label; }
    int shifted = 8 >>> 1 >> 1;
    List<List<String>> nested = new ArrayList<>();
    return (String) x + text + grid.length + len.apply("a") + shifted + nested;
  }
}`);
  assert.equal(u.errors, 0, u.errorList.join('; '));
  assert.equal(u.types.length, 6);
});

test('java parser: tolerant, keeps going after a broken member', () => {
  const u = parseJava(`class A {
  void ok() { int x = 1; }
  void broken() { int = ; }
  void ok2() { return; }
}`);
  const names = u.types[0].members.map((m) => m.name);
  assert.ok(names.includes('ok') && names.includes('ok2'));
  assert.ok(u.errors >= 1);
});

test('kotlin parser: modern syntax parses without errors', () => {
  const u = parseKotlin(`@file:JvmName("X")
package a.b
import kotlinx.coroutines.*
import java.io.File as JFile
sealed class Expr { data class Num(val v: Int) : Expr(); object Zero : Expr() }
enum class Dir(val dx: Int) { LEFT(-1), RIGHT(1); fun flip() = if (this == LEFT) RIGHT else LEFT }
fun interface Op { fun apply(a: Int): Int }
inline fun <reified T> Any?.isA(): Boolean = this is T
val String.lastChar: Char get() = this[length - 1]
class Box<out T : Any>(private val v: T) {
  lateinit var label: String
  val size by lazy { 1 }
  companion object { const val MAX = 10; fun of(x: Int) = Box(x) }
  constructor(v: T, l: String) : this(v) { label = l }
}
suspend fun work(scope: CoroutineScope, xs: List<Int>?): Int {
  val total = xs?.filter { it > 0 }?.sumOf { it * 2 } ?: return -1
  val name = when (val e: Expr = Expr.Zero) { is Expr.Num -> "n\${e.v}"; Expr.Zero -> "zero" }
  for ((i, x) in (xs ?: emptyList()).withIndex()) if (x !in 0 until 10) println("$i \${x}")
  val r = try { JFile("a").readText() } catch (e: Exception) { "" } finally { println() }
  scope.launch(Dispatchers.IO) { delay(10) }.join()
  outer@ for (a in 1..3) { for (b in 1..3) { if (b == 2) continue@outer } }
  return total + name.length + r.length + (xs!!.size shl 1)
}`);
  assert.equal(u.errors, 0, u.errorList.join('; '));
  assert.equal(u.funcs.length, 2);
});

// ── engine behaviour ──
test('null dereference: path events and @CheckForNull methods', () => {
  const code = `class T {
  @javax.annotation.CheckForNull String find(int k) { return k > 0 ? "a" : null; }
  int m(int k) {
    String v = find(k);
    return v.length();
  }
}`;
  const got = run(code).filter((f) => f.rule === 'sem-java:null-dereference');
  assert.equal(got.length, 1);
  assert.equal(got[0].line, 5);
  assert.ok(got[0].events.some((e) => e.main && e.line === 5));
});

test('null dereference: no report after requireNonNull, early return or instanceof', () => {
  const code = `class T {
  int a(String s) { java.util.Objects.requireNonNull(s); return s.length(); }
  int b(String s) { if (s == null) { throw new IllegalArgumentException(); } return s.length(); }
  int c(Object o) { if (o instanceof String) { return o.hashCode(); } return 0; }
  int d(String s) { if (s == null || s.isEmpty()) { return 0; } return s.length(); }
  int e(String s) { while (s != null) { s = s.trim(); if (s.isEmpty()) break; } return 1; }
}`;
  assert.deepEqual(run(code).filter((f) => f.rule === 'sem-java:null-dereference'), []);
});

test('null dereference: finally and catch paths are modeled', () => {
  const code = `class T {
  void m(String p) throws Exception {
    java.io.InputStream in = null;
    try {
      in = new java.io.FileInputStream(p);
      in.read();
    } finally {
      if (in != null) { in.close(); }
    }
  }
}`;
  const got = run(code).filter((f) => /null-dereference|resource-leak|condition-always/.test(f.rule));
  assert.deepEqual(got.map((f) => f.rule), []);
});

test('resource leak: wrapped streams report once and escapes are not leaks', () => {
  const code = `class T {
  java.io.Reader keep;
  void a(String p) throws Exception {
    java.io.BufferedReader r = new java.io.BufferedReader(new java.io.FileReader(p));
    r.readLine();
  }
  java.io.InputStream b(String p) throws Exception { return new java.io.FileInputStream(p); }
  void c(String p) throws Exception { keep = new java.io.FileReader(p); }
  void d(String p, java.util.List<java.io.InputStream> all) throws Exception { all.add(new java.io.FileInputStream(p)); }
  void e(byte[] data) throws Exception { java.io.InputStream in = new java.io.ByteArrayInputStream(data); in.read(); }
}`;
  const got = run(code).filter((f) => f.rule === 'sem-java:resource-leak');
  assert.deepEqual(got.map((f) => f.line), [4]);
});

test('constant condition: finally duplicates and loops do not cause false positives', () => {
  const code = `class T {
  void a() {
    boolean ok = false;
    try { work(); ok = true; } finally { if (!ok) { rollback(); } }
  }
  int b(java.util.List<String> xs) {
    int count = 0;
    for (String x : xs) { if (x.isEmpty()) { count++; } }
    if (count == 0) { return -1; }
    return count;
  }
  void c() {
    boolean done = false;
    while (!done) { done = poll(); }
  }
  void work() {}
  void rollback() {}
  boolean poll() { return true; }
}`;
  const got = run(code).filter((f) => /condition-always|gratuitous/.test(f.rule));
  assert.deepEqual(got.map((f) => f.line), []);
});

test('kotlin: elvis with return proves non-null; lambdas that assign vars are not tracked', () => {
  const code = `fun f(x: String?, xs: List<Int>): Int {
    val y = x ?: return 0
    var found = false
    xs.forEach { if (it > 2) found = true }
    if (found) return 1
    return y.length
}`;
  const got = run(code, 'kt').filter((f) => /condition-always|gratuitous|null-assertion/.test(f.rule));
  assert.deepEqual(got.map((f) => f.rule), []);
});

test('inactive rules are not reported', () => {
  const code = jmBad();
  const all = run(code).filter((f) => f.rule === 'sem-java:null-dereference');
  assert.ok(all.length > 0);
  const off = sem.analyze([{ path: 'T.java', text: code, lang: 'java' }], { inactive: new Set(['sem-java:null-dereference']), root: null, options: {} });
  assert.equal(off.filter((f) => f.rule === 'sem-java:null-dereference').length, 0);
});

function jmBad() {
  return core.jm('    String v = null;\n    v.length();');
}

test('garbage input never throws', () => {
  const junk = ['class {{{{', 'fun (((( ->', '"unterminated', '@@@', 'package', '', 'class A { void m() { if ( } }', '}}}}', 'val x = """'];
  for (const j of junk) {
    assert.doesNotThrow(() => run(j, 'java'));
    assert.doesNotThrow(() => run(j, 'kt'));
  }
});

test('performance: 20k lines in well under 2 s', () => {
  const method = (i) => `  int m${i}(String s, java.util.List<String> xs) {
    int total = 0;
    for (String x : xs) {
      if (x == null || x.isEmpty()) { continue; }
      total += x.length();
    }
    String t = s == null ? "" : s.trim();
    if (t.isEmpty()) { return total; }
    try (java.io.BufferedReader r = new java.io.BufferedReader(new java.io.StringReader(t))) {
      total += r.readLine().length();
    } catch (java.io.IOException e) {
      throw new IllegalStateException(e);
    }
    return total;
  }
`;
  const files = [];
  let lines = 0;
  for (let f = 0; lines < 20000; f++) {
    let body = `package p;\nclass C${f} {\n`;
    for (let i = 0; i < 40; i++) body += method(i);
    body += '}\n';
    lines += body.split('\n').length;
    files.push({ path: `src/C${f}.java`, text: body, lang: 'java' });
  }
  const t0 = Date.now();
  sem.analyze(files, { inactive: new Set(), root: null, options: {} });
  const ms = Date.now() - t0;
  assert.ok(ms < 2000, `took ${ms} ms for ${lines} lines`);
});
