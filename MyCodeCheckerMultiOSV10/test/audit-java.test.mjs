// Java / Kotlin rule audit: realistic compliant code that used to be reported,
// next to the non-compliant form that must stay reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sem = require('../core/sem-java');
const base = require('../core/rules.js');
const extra = require('../core/rules-extra/index.js');
const { structuralIssues } = require('../core/metrics.js');
const { commentKind, ruleLangsFor } = require('../core/languages.js');

const ALL = [...base.RULES, ...extra.RULES];
const byKey = (key) => {
  const r = ALL.find((x) => x.key === key);
  assert.ok(r, key);
  return r;
};

// The line loop of core/analyze.js for one rule, with the file and the
// file's lines handed to skip (skip(rawLine, line, file, { index, lines })).
function lineHits(key, text, lang = 'java') {
  const rule = byKey(key);
  const langs = new Set(ruleLangsFor(lang));
  if (!rule.langs.some((l) => langs.has(l))) return [];
  const st = structuralIssues(text, commentKind(lang));
  const file = { path: lang === 'kt' ? 'src/T.kt' : 'src/T.java', lang };
  const hits = [];
  for (let i = 0; i < st.code.length; i++) {
    const line = st.code[i];
    if (!line || !line.trim()) continue;
    rule.re.lastIndex = 0;
    if (!rule.re.test(line)) continue;
    if (rule.skip && rule.skip(st.lines[i], line, file, { index: i, lines: st.lines })) continue;
    hits.push(i + 1);
  }
  return hits;
}

function semHits(code, rule, lang = 'java', path) {
  const file = path || (lang === 'kt' ? 'src/main/kotlin/T.kt' : 'src/main/java/T.java');
  const out = sem.analyze([{ path: file, text: code, lang }], { inactive: new Set(), root: null, options: {} });
  return (out.findings || out).filter((f) => f.rule === rule).map((f) => f.line);
}

// ── line rules ───────────────────────────────────────────────

test('java:string-eq: char literals and Kotlin == are not string reference comparisons', () => {
  assert.deepEqual(lineHits('java:string-eq', `class T {
  boolean a(char c, String s) {
    if (c == '.' || c == '"' || c == '\\'') return true;
    return s.charAt(0) == 'y';
  }
  boolean b(String s) { return s == "yes"; }
  boolean c(String s) { return "no" != s; }
}`), [6, 7]);
  assert.deepEqual(lineHits('java:string-eq', 'fun isAdmin(name: String?) = name == "admin"\n', 'kt'), []);
});

test('java line rules ignore their pattern inside string literals', () => {
  const code = `class T {
  void m(String id) {
    String a = "call Thread.stop() never";
    String b = "DocumentBuilderFactory.newInstance() is configured below";
    String c = "new Random(";
    String d = "use executeQuery(x + y) carefully";
    String e = "Runtime.getRuntime().exec(cmd)";
  }
}`;
  for (const key of ['java:thread-stop', 'java:xxe', 'java:random', 'java:sql-concat', 'java:runtime-exec']) {
    assert.deepEqual(lineHits(key, code), [], key);
  }
  assert.deepEqual(lineHits('java:xxe', 'class T { Object f = DocumentBuilderFactory.newInstance(); }'), [1]);
  assert.deepEqual(lineHits('java:random', 'class T { Object r = new Random(); }'), [1]);
});

test('java:thread-stop: only a thread receiver', () => {
  assert.deepEqual(lineHits('java:thread-stop', `class T {
  void m(javax.swing.Timer timer, javax.sound.sampled.Clip clip, Thread worker) {
    timer.stop();
    clip.stop();
    worker.stop();
    workerThread.stop();
    Thread.currentThread().stop();
  }
}`), [6, 7]);
});

test('java:sql-concat: constant concatenation is one literal', () => {
  assert.deepEqual(lineHits('java:sql-concat', `class T {
  void m(java.sql.Statement st, String id, String where) throws Exception {
    st.execute("delete from t " + "where id = 1");
    st.executeQuery("select * from t where id = " + id);
    st.executeQuery(base + where);
    st.executeUpdate("update t set a = 1 where b = '" + id + "'");
  }
}`), [4, 5, 6]);
});

test('java:empty-printstack: printing to a chosen writer is not stderr', () => {
  assert.deepEqual(lineHits('java:empty-printstack', `class T {
  void m(Exception e, java.io.PrintWriter pw) {
    e.printStackTrace(pw);
    e.printStackTrace();
    e.printStackTrace(System.err);
  }
}`), [4, 5]);
});

test('java:serial-uid: a class that declares serialVersionUID in its body is compliant', () => {
  const text = `import java.io.Serializable;
public class Order implements Serializable {
    private static final long serialVersionUID = 1L;
    private String id;
}
class Line implements Serializable {
    private String sku;
    static class Inner { private static final long serialVersionUID = 2L; }
}
enum Color implements Serializable { RED }
record Point(int x, int y) implements Serializable { }
`;
  assert.deepEqual(lineHits('java:serial-uid', text), [6]);
});

test('java:empty-method: records and commented no-op bodies are not empty methods', () => {
  assert.deepEqual(lineHits('java:empty-method', `class T {
  public record CreateOrder(long id, java.util.List<String> items) { }
  public void onStop() { /* nothing to release */ }
  public void onPause() {}
}`), [4]);
});

test('java:redundant-boolean: Kotlin nullable Boolean == true is the idiom', () => {
  assert.deepEqual(lineHits('java:redundant-boolean', 'fun f(enabled: Boolean?) { if (enabled == true) run() }\n', 'kt'), []);
  assert.deepEqual(lineHits('java:redundant-boolean', 'class T { void f(boolean ok) { if (ok == true) run(); } }'), [1]);
  assert.deepEqual(lineHits('java:redundant-boolean', 'class T { String s = "x == true"; }'), []);
});

test('java:hostname-verifier: any two-argument lambda returning true is not a verifier', () => {
  assert.deepEqual(lineHits('java:hostname-verifier', `class T {
  void m(java.util.Map<String, Boolean> map, javax.net.ssl.HttpsURLConnection conn) {
    map.merge("k", true, (a, b) -> true);
    conn.setHostnameVerifier((host, session) -> true);
  }
}`), [4]);
});

test('process execution and deserialization line rules are hotspots', () => {
  assert.equal(byKey('java:runtime-exec').type, 'SECURITY_HOTSPOT');
  assert.equal(byKey('java:unsafe-deserialization').type, 'SECURITY_HOTSPOT');
});

// ── sem-java ─────────────────────────────────────────────────

test('method-named-like-object-method: a real toString override is not reported', () => {
  const code = `class T {
  @Override public String toString() { return "T"; }
  public String tostring() { return "t"; }
}`;
  assert.deepEqual(semHits(code, 'sem-java:method-named-like-object-method'), [3]);
});

test('field-could-be-local: JPA entity fields and constructor-only fields are object state', () => {
  const entity = `@Entity
class Order {
  @Id private Long id;
  private java.time.Instant createdAt;
  Order(String n) { this.createdAt = java.time.Instant.now(); }
  void touch() { createdAt = java.time.Instant.now(); }
}`;
  assert.deepEqual(semHits(entity, 'sem-java:field-could-be-local'), []);
  const ctorOnly = `class Dialog {
  private final Object titleBar;
  Dialog() { titleBar = new Object(); }
}`;
  assert.deepEqual(semHits(ctorOnly, 'sem-java:field-could-be-local'), []);
  const bad = `class T {
  private int total;
  int sum(int[] xs) {
    total = 0;
    for (int x : xs) { total += x; }
    return total;
  }
}`;
  assert.deepEqual(semHits(bad, 'sem-java:field-could-be-local'), [2]);
});

test('inner-class-could-be-static: JUnit 5 @Nested classes must stay inner', () => {
  const code = `import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
class OrderTest {
  @Nested
  class WhenEmpty {
    @Test void noLines() { org.junit.jupiter.api.Assertions.assertTrue(true); }
  }
  class Plain { int x; }
}`;
  assert.deepEqual(semHits(code, 'sem-java:inner-class-could-be-static', 'java', 'src/test/java/OrderTest.java'), [8]);
});

test('utility-class-constructor: a private nested class has no public constructor', () => {
  const code = `class Frame {
  private static final class Icons {
    static Object load() { return null; }
  }
  static final class Util {
    static int twice(int x) { return x * 2; }
  }
}`;
  assert.deepEqual(semHits(code, 'sem-java:utility-class-constructor'), [5]);
});

test('wrong-loop-variable: an update that moves the tested counter inside a call is fine', () => {
  const code = `class T {
  int m(String p, int pos) {
    for (char c = p.charAt(pos); pos < p.length(); c = Character.toUpperCase(p.charAt(pos++))) {
      if (c == 'A') return pos;
    }
    for (int i = 0, j = 0; i < p.length(); j++) { System.out.println(i); }
    return -1;
  }
}`;
  assert.deepEqual(semHits(code, 'sem-java:wrong-loop-variable'), [6]);
});

test('resource-leak: close() in finally guarded by its own try/catch closes the resource', () => {
  const code = `import java.io.*;
class T {
  int m(String f) throws IOException {
    int ret = 0;
    RandomAccessFile g = new RandomAccessFile(f, "r");
    try {
      ret = (int) g.length();
    } finally {
      try { g.close(); } catch (IOException e) { ret = -1; }
    }
    return ret;
  }
  int bad(String f, int n) throws IOException {
    FileInputStream in = new FileInputStream(f);
    if (n > 0) { return 1; }
    in.close();
    return 0;
  }
}`;
  assert.deepEqual(semHits(code, 'sem-java:resource-leak'), [14]);
});

test('type tables: identifiers such as constructor or valueOf do not resolve to Object.prototype', () => {
  const code = `class T {
  String m(java.util.stream.Stream<String> s, String x) {
    Object a = s.constructor();
    Object b = x.valueOf();
    return a.toString() + b;
  }
}`;
  // No crash and no type-driven report from a function-valued "type".
  const out = sem.analyze([{ path: 'src/main/java/T.java', text: code, lang: 'java' }], { inactive: new Set(), root: null, options: {} });
  assert.ok(Array.isArray(out.findings || out));
});

test('wait-notify-outside-sync: a project method named wait(String) is not Object.wait', () => {
  const code = `class Cache {
  void wait(String why) { }
}
class T {
  private final Cache cache = new Cache();
  private final Object lock = new Object();
  void m() throws InterruptedException {
    cache.wait("idle");
    lock.wait();
  }
}`;
  assert.deepEqual(semHits(code, 'sem-java:wait-notify-outside-sync'), [9]);
});

test('Kotlin line rules: main, tests, @Composable above, factories and commented bodies', () => {
  const app = [
    'fun main() {',
    '    val code = run()',
    '    exitProcess(code)',
    '}',
    'class Service {',
    '    fun stop() {',
    '        exitProcess(1)',
    '    }',
    '    fun load() = runBlocking { api.user() }',
    '    fun noop() { /* nothing to release */ }',
    '    fun empty() {}',
    '}',
    '@Composable',
    '@Preview',
    'fun UserCard(user: User) {',
    '}',
    'fun Money(cents: Long): Money = MoneyImpl(cents)',
    'fun LoadUser(id: Long) {',
    '}',
  ].join('\n');
  assert.deepEqual(lineHits('kt:exit-process', app, 'kt'), [7]);
  assert.deepEqual(lineHits('kt:run-blocking', app, 'kt'), [9]);
  assert.deepEqual(lineHits('kt:empty-function', app, 'kt'), [11]);
  assert.deepEqual(lineHits('kt:function-naming', app, 'kt'), [18]);
  assert.deepEqual(lineHits('java:empty-method', 'class T {\n    public fun noop() {}\n}\n', 'kt'), []);
  const test = [
    'class UserTest {',
    '    @Test',
    '    fun loads() = runBlocking {',
    '        assertEquals(1, repo.count())',
    '    }',
    '}',
  ].join('\n');
  assert.deepEqual(lineHits('kt:run-blocking', test, 'kt'), []);
});
