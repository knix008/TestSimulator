'use strict';

// Rules reported by the symbolic-execution engine (se.js) and the liveness
// pass (flow.js). Detection lives there; this file holds metadata + samples.

const { rule, jm, jc, km, kc } = require('./core');

rule({
  id: 'null-dereference', engine: 'se', type: 'B', sev: 'MA', debt: 10, tags: ['cwe-476', 'symbolic-execution'], sonar: 'S2259',
  en: ['Null pointers should not be dereferenced', 'On at least one execution path the value is null when it is dereferenced, which throws NullPointerException.', 'Check the value for null on every path before using it, or make sure it can never be null.'],
  ko: ['null 포인터를 역참조하면 안 됩니다', '적어도 한 실행 경로에서 역참조 시점에 값이 null이라 NullPointerException이 납니다.', '모든 경로에서 사용 전에 null을 검사하거나 null이 될 수 없게 하세요.'],
  msg: ['A "NullPointerException" could be thrown; "{0}" is nullable here.', '"{0}"이(가) 여기서 null일 수 있어 NullPointerException이 날 수 있습니다.'],
  bad: {
    java: jm(`    String v = null;
    if (n > 0) { v = s; }
    v.length(); // Noncompliant`),
  },
  good: {
    java: jm(`    String v = null;
    if (n > 0) { v = s; }
    if (v != null) { v.length(); }
    String w = s == null ? "" : s;
    w.length();`),
  },
});

rule({
  id: 'optional-get-without-check', engine: 'se', type: 'B', sev: 'MA', debt: 10, tags: ['symbolic-execution'], sonar: 'S3655',
  en: ['Optional value should only be accessed after calling isPresent()', 'Optional.get() throws NoSuchElementException when the value is absent.', 'Check isPresent() first, or use orElse / orElseGet / orElseThrow / ifPresent.'],
  ko: ['Optional 값은 isPresent() 확인 후에만 꺼내야 합니다', '값이 없으면 Optional.get()은 NoSuchElementException을 던집니다.', '먼저 isPresent()로 확인하거나 orElse / orElseGet / orElseThrow / ifPresent를 쓰세요.'],
  msg: ['Call "{0}.isPresent()" or "!{0}.isEmpty()" before accessing the value.', '값을 꺼내기 전에 "{0}.isPresent()"나 "!{0}.isEmpty()"로 확인하세요.'],
  bad: {
    java: jm(`    java.util.Optional<String> opt = java.util.Optional.ofNullable(s);
    String x = opt.get(); // Noncompliant`),
  },
  good: {
    java: jm(`    java.util.Optional<String> opt = java.util.Optional.ofNullable(s);
    if (opt.isPresent()) { String x = opt.get(); }
    String y = opt.orElse("");`),
  },
});

rule({
  id: 'resource-leak', engine: 'se', langs: ['java', 'kt'], type: 'B', sev: 'BL', debt: 10, tags: ['cwe-459', 'cwe-772', 'symbolic-execution'], sonar: 'S2095', ktSonar: 'S2095',
  en: ['Resources should be closed', 'A stream, connection or file opened here is not closed on every path, which leaks file handles and connections.', 'Use try-with-resources (Kotlin: use { }) or close the resource in a finally block.'],
  ko: ['리소스는 닫아야 합니다', '여기서 연 스트림·연결·파일이 모든 경로에서 닫히지 않아 핸들과 연결이 샙니다.', 'try-with-resources(Kotlin은 use { })를 쓰거나 finally에서 닫으세요.'],
  msg: ['Use try-with-resources or close this "{0}" in a "finally" clause.', '이 "{0}"을(를) try-with-resources로 쓰거나 finally에서 닫으세요.'],
  bad: {
    java: jm(`    java.io.FileInputStream in = new java.io.FileInputStream(s); // Noncompliant
    if (n > 0) { return; }
    in.close();`),
    kt: km(`    val r = java.io.File(s).bufferedReader() // Noncompliant
    if (n > 0) return
    r.close()`),
  },
  good: {
    java: jm(`    try (java.io.FileInputStream in = new java.io.FileInputStream(s)) { in.read(); }
    java.io.FileInputStream b = new java.io.FileInputStream(s);
    try { b.read(); } finally { b.close(); }`),
    kt: km(`    java.io.File(s).bufferedReader().use { it.readLine() }
    val r = java.io.FileInputStream(s)
    r.use { it.read() }`),
  },
});

rule({
  id: 'lock-not-released', engine: 'se', langs: ['java', 'kt'], type: 'B', sev: 'CR', debt: 15, tags: ['cwe-667', 'multi-threading', 'symbolic-execution'], sonar: 'S2222',
  en: ['Locks should be released on all paths', 'A lock acquired here is still held on some path out of the method, which can deadlock other threads.', 'Release the lock in a finally block (Kotlin: withLock { }).'],
  ko: ['잠금은 모든 경로에서 풀어야 합니다', '여기서 얻은 잠금이 메서드를 나가는 어떤 경로에서 그대로 남아 다른 스레드를 교착시킬 수 있습니다.', 'finally에서 잠금을 푸세요(Kotlin은 withLock { }).'],
  msg: ['Unlock "{0}" on all paths, preferably in a "finally" block.', '모든 경로에서 "{0}"의 잠금을 푸세요. finally 블록이 좋습니다.'],
  bad: {
    java: `import java.util.concurrent.locks.*;
class T {
  private final Lock lock = new ReentrantLock();
  void m(boolean b) {
    lock.lock(); // Noncompliant
    if (b) { return; }
    lock.unlock();
  }
}
`,
    kt: `import java.util.concurrent.locks.ReentrantLock
class T {
    private val lock = ReentrantLock()
    fun m(b: Boolean) {
        lock.lock() // Noncompliant
        if (b) return
        lock.unlock()
    }
}
`,
  },
  good: {
    java: `import java.util.concurrent.locks.*;
class T {
  private final Lock lock = new ReentrantLock();
  void m(boolean b) {
    lock.lock();
    try { if (b) { return; } } finally { lock.unlock(); }
  }
}
`,
    kt: `import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
class T {
    private val lock = ReentrantLock()
    fun m(b: Boolean) {
        lock.withLock { if (b) return }
    }
}
`,
  },
});

rule({
  id: 'condition-always-constant', engine: 'se', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 15, tags: ['cwe-570', 'cwe-571', 'symbolic-execution'], sonar: 'S2583', ktSonar: 'S2583',
  en: ['Conditionally executed code should be reachable', 'This condition has the same value on every path that reaches it, so one branch is dead code or the check is redundant.', 'Fix the logic so the condition can vary, or remove the useless test.'],
  ko: ['조건부 코드는 실행될 수 있어야 합니다', '이 조건은 도달하는 모든 경로에서 값이 같아 한쪽 분기는 죽은 코드이거나 검사가 쓸모없습니다.', '조건이 달라질 수 있게 논리를 고치거나 쓸모없는 검사를 지우세요.'],
  msg: ['Change this condition so that it does not always evaluate to "{0}".', '이 조건이 항상 "{0}"이(가) 되지 않도록 고치세요.'],
  bad: {
    java: jm(`    String v = s;
    if (v == null) { return; }
    if (v == null) { n++; } // Noncompliant`),
    kt: km(`    var v: String? = null
    if (n > 0) return
    if (v == null) { println("none") } // Noncompliant`),
  },
  good: {
    java: jm(`    String v = s;
    if (v == null) { return; }
    if (n > 3) { n++; }
    boolean first = true;
    for (String x : list) { if (!first) { n++; } first = false; }`),
    kt: km(`    var v: String? = null
    if (n > 0) v = s
    if (v == null) { println("none") }`),
  },
});

rule({
  id: 'gratuitous-expression', engine: 'se', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 10, tags: ['cwe-570', 'cwe-571', 'redundant', 'symbolic-execution'], sonar: 'S2589', ktSonar: 'S2589',
  en: ['Boolean expressions should not be gratuitous', 'Part of this boolean expression always has the same value, so it adds nothing or hides a logic error.', 'Remove the gratuitous part or fix the logic.'],
  ko: ['불리언 식에 쓸모없는 부분이 있으면 안 됩니다', '이 불리언 식의 일부는 항상 값이 같아 의미가 없거나 논리 오류를 숨깁니다.', '쓸모없는 부분을 지우거나 논리를 고치세요.'],
  msg: ['Remove this expression which always evaluates to "{0}".', '항상 "{0}"인 이 식을 지우세요.'],
  bad: {
    java: jm(`    if (s == null) { return; }
    if (n > 0 && s != null) { n++; } // Noncompliant`),
    kt: km(`    val v: String? = if (n > 2) s else null
    if (v == null) return
    if (n > 0 && v != null) println(v) // Noncompliant`),
  },
  good: {
    java: jm(`    if (s == null) { return; }
    if (n > 0 && s.isEmpty()) { n++; }`),
    kt: km(`    val v: String? = if (n > 2) s else null
    if (n > 0 && v != null) println(v)`),
  },
});

rule({
  id: 'division-by-zero', engine: 'se', langs: ['java', 'kt'], type: 'B', sev: 'CR', debt: 5, tags: ['cwe-369', 'symbolic-execution'], sonar: 'S3518', ktSonar: 'S3518',
  en: ['Zero should not be a possible denominator', 'On some path the divisor is zero, which throws ArithmeticException for integer division.', 'Check the divisor before dividing.'],
  ko: ['0이 나눗수가 될 수 있으면 안 됩니다', '어떤 경로에서 나눗수가 0이라 정수 나눗셈이 ArithmeticException을 던집니다.', '나누기 전에 나눗수를 검사하세요.'],
  msg: ['Make sure "{0}" cannot be zero before dividing.', '나누기 전에 "{0}"이(가) 0이 될 수 없게 하세요.'],
  bad: {
    java: jm(`    int d = 0;
    if (n > 5) { d = n; }
    int r = 100 / d; // Noncompliant`),
    kt: km(`    var d = 0
    if (n > 5) d = n
    val r = 100 / d // Noncompliant`),
  },
  good: {
    java: jm(`    int d = 0;
    if (n > 5) { d = n; }
    if (d != 0) { int r = 100 / d; }`),
    kt: km(`    var d = 0
    if (n > 5) d = n
    if (d != 0) println(100 / d)`),
  },
});

rule({
  id: 'nonnull-param-passed-null', engine: 'se', type: 'B', sev: 'MA', debt: 10, tags: ['cwe-476', 'symbolic-execution'], sonar: 'S4449',
  en: ['Nullness of parameters should be guaranteed', 'null is passed to a parameter that is declared non-null.', 'Pass a non-null value or relax the annotation.'],
  ko: ['매개변수의 null 여부 계약을 지켜야 합니다', 'non-null로 선언한 매개변수에 null을 넘깁니다.', 'null이 아닌 값을 넘기거나 어노테이션을 고치세요.'],
  msg: ['"{0}" is marked non-null but null is passed to "{1}".', '"{0}"은(는) non-null인데 "{1}"에 null을 넘깁니다.'],
  bad: {
    java: jc(`  void use(@javax.annotation.Nonnull String v) { v.length(); }
  void m() {
    String x = null;
    use(x); // Noncompliant
  }`),
  },
  good: {
    java: jc(`  void use(@javax.annotation.Nonnull String v) { v.length(); }
  void m() {
    String x = "a";
    use(x);
  }`),
  },
});

rule({
  id: 'nonnull-return-null', engine: 'se', type: 'B', sev: 'MA', debt: 10, tags: ['cwe-476', 'symbolic-execution'], sonar: 'S2637',
  en: ['Non-null methods should not return null', 'The method is annotated non-null but returns null on some path.', 'Return a real value, an empty object or Optional, or drop the annotation.'],
  ko: ['non-null 메서드는 null을 반환하면 안 됩니다', 'non-null로 표시한 메서드가 어떤 경로에서 null을 반환합니다.', '실제 값이나 빈 객체, Optional을 반환하거나 어노테이션을 지우세요.'],
  msg: ['This method "{0}" is marked non-null but returns null.', 'non-null인 "{0}" 메서드가 null을 반환합니다.'],
  bad: {
    java: jc(`  @javax.annotation.Nonnull
  String name(int n) {
    String v = null;
    if (n > 0) { v = "x"; }
    return v; // Noncompliant
  }`),
  },
  good: {
    java: jc(`  @javax.annotation.Nonnull
  String name(int n) {
    String v = "";
    if (n > 0) { v = "x"; }
    return v;
  }`),
  },
});

rule({
  id: 'stream-reused', engine: 'se', type: 'B', sev: 'MA', debt: 10, tags: ['symbolic-execution'], sonar: 'S3959',
  en: ['Consumed streams should not be reused', 'A Stream can be traversed only once; a second operation throws IllegalStateException.', 'Create a new stream for each pipeline.'],
  ko: ['소비한 스트림을 다시 쓰면 안 됩니다', 'Stream은 한 번만 순회할 수 있어 두 번째 연산은 IllegalStateException을 던집니다.', '파이프라인마다 새 스트림을 만드세요.'],
  msg: ['Refactor this code so that "{0}" is not consumed twice.', '"{0}"을(를) 두 번 소비하지 않도록 코드를 고치세요.'],
  bad: {
    java: jm(`    java.util.stream.Stream<String> st = list.stream();
    long c = st.count();
    java.util.List<String> l = st.toList(); // Noncompliant`),
  },
  good: {
    java: jm(`    long c = list.stream().count();
    java.util.List<String> l = list.stream().toList();`),
  },
});

rule({
  id: 'null-assertion-on-null', engine: 'se', langs: ['kt'], type: 'B', sev: 'MA', debt: 10, tags: ['cwe-476', 'symbolic-execution'], ktSonar: 'S6615',
  en: ['"!!" should not be applied to a value that is null', 'On this path the value is always null, so the !! assertion always throws NullPointerException.', 'Handle the null case before asserting, or remove the assertion.'],
  ko: ['null인 값에 "!!"를 쓰면 안 됩니다', '이 경로에서 값이 항상 null이라 !! 단언이 항상 NullPointerException을 던집니다.', '단언 전에 null인 경우를 처리하거나 단언을 지우세요.'],
  msg: ['"{0}" is always null here; "!!" will throw.', '여기서 "{0}"은(는) 항상 null이라 "!!"가 예외를 던집니다.'],
  bad: {
    kt: km(`    var v: String? = null
    if (n > 3) println("x")
    println(v!!.length) // Noncompliant`),
  },
  good: {
    kt: km(`    var v: String? = null
    if (n > 3) v = s else v = "x"
    println(v!!.length)`),
  },
});

rule({
  id: 'dead-store', engine: 'flow', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 15, tags: ['cwe-563', 'unused'], sonar: 'S1854', ktSonar: 'S1854',
  en: ['Unused assignments should be removed', 'The value written here is overwritten or never read, so the computation is wasted or the wrong variable is used.', 'Remove the assignment or use the value.'],
  ko: ['쓰지 않는 대입은 지워야 합니다', '여기서 쓴 값은 덮어써지거나 읽히지 않아 계산이 낭비되거나 다른 변수를 써야 했던 것입니다.', '대입을 지우거나 값을 사용하세요.'],
  msg: ['Remove this useless assignment to local variable "{0}".', '지역 변수 "{0}"에 대한 쓸모없는 대입을 지우세요.'],
  bad: {
    java: jm(`    int total = n * 2; // Noncompliant
    total = n + 1;
    System.out.println(total);`),
    kt: km(`    var total = n * 2 // Noncompliant
    total = n + 1
    println(total)`),
  },
  good: {
    java: jm(`    int total = 0;
    total = n + 1;
    System.out.println(total);
    int k = n * 2;
    if (n > 0) { k = 4; }
    System.out.println(k);`),
    kt: km(`    var total = n * 2
    if (n > 3) total = n + 1
    println(total)`),
  },
});
