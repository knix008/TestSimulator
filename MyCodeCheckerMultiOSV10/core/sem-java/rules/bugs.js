'use strict';

// Bug rules (AST + light types). Kotlin variants where the defect exists there.

const { rule, jm, jc, km, kc } = require('./core');
const A = require('../ast');
const H = require('./h');
const T = require('../types');

const BOXED = ['Integer', 'Long', 'Short', 'Byte', 'Character', 'Boolean', 'Double', 'Float'];
const VALUE_TYPES = ['String', 'Integer', 'Long', 'Short', 'Byte', 'Character', 'Boolean', 'Double', 'Float', 'BigDecimal', 'BigInteger'];

function pure(e) {
  return !A.find(e, (x) => x.k === 'Call' || x.k === 'Assign' || x.k === 'New' || (x.k === 'Un' && (x.op === '++' || x.op === '--')) || x.k === 'Lambda');
}

// ── equality ──
rule({
  id: 'string-reference-equality', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'], ref: 'S4973',
  en: ['Strings and boxed types should be compared using "equals()"', '== on String or boxed values compares references; equal values in different objects compare unequal.', 'Use equals() or Objects.equals(); unbox explicitly for numbers.'],
  ko: ['문자열과 박싱 타입은 equals()로 비교해야 합니다', 'String이나 박싱 값에 ==를 쓰면 참조를 비교해 같은 값이라도 다른 객체면 다르다고 나옵니다.', 'equals()나 Objects.equals()를 쓰고 숫자는 명시적으로 언박싱하세요.'],
  msg: ['Strings and boxed types should be compared using "equals()"; "{0}" compares references.', '문자열과 박싱 타입은 equals()로 비교하세요. "{0}"은(는) 참조를 비교합니다.'],
  on: {
    Bin(n, cx) {
      if (n.op !== '==' && n.op !== '!=') return;
      if (A.isNull(n.l) || A.isNull(n.r)) return;
      const tl = cx.typeOf(n.l);
      const tr = cx.typeOf(n.r);
      if (!tl || !tr) return;
      const ref = (t) => t === 'String' || BOXED.includes(t);
      if (!(ref(tl) && ref(tr))) return;
      if (A.isStrLit(n.l) && A.isStrLit(n.r)) return;
      if (tl !== tr && !(tl === 'String' || tr === 'String')) return;
      cx.report({ line: n.opLine || n.line, col: n.opCol || n.col }, [cx.short(n)]);
    },
  },
  bad: { java: jm(`    String a = s.trim();
    if (a == s) { n++; } // Noncompliant
    Integer x = Integer.valueOf(n), y = Integer.valueOf(1000);
    boolean same = x != y; // Noncompliant`) },
  good: { java: jm(`    String a = s.trim();
    if (a.equals(s) || a == null) { n++; }
    int x = n;
    boolean same = x == 3;`) },
});

rule({
  id: 'identical-operands', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 2, tags: ['suspicious'], ref: 'S1764', ktRef: 'S1764',
  en: ['Identical expressions should not be used on both sides of a binary operator', 'Using the same expression on both sides is either a copy-paste error or always gives the same result.', 'Fix the operand that should differ, or simplify the expression.'],
  ko: ['이항 연산자 양쪽에 같은 식을 쓰면 안 됩니다', '양쪽이 같은 식이면 복사-붙여넣기 실수이거나 결과가 항상 같습니다.', '달라야 할 피연산자를 고치거나 식을 단순화하세요.'],
  msg: ['Correct one of the identical sub-expressions on both sides of operator "{0}".', '연산자 "{0}" 양쪽의 같은 하위 식 중 하나를 고치세요.'],
  on: {
    Bin(n, cx) {
      if (!['==', '!=', '<', '>', '<=', '>=', '&&', '||', '-', '/', '%', '^', '&', '|', '===', '!==', '?:'].includes(n.op)) return;
      if (!A.eq(n.l, n.r) || !pure(n.l)) return;
      const l = A.strip(n.l);
      if (l.k === 'Lit') return;
      if ((n.op === '!=' || n.op === '==') && /^(float|double|Float|Double)$/.test(cx.typeOf(n.l) || '')) return;
      cx.report({ line: n.opLine || n.line, col: n.opCol || n.col }, [n.op]);
    },
  },
  bad: { java: jm(`    if (s.length() > 0 && n == n) { n++; } // Noncompliant`), kt: km(`    if (n > 0 && s == s) println(n) // Noncompliant`) },
  good: { java: jm(`    if (s.length() > 0 && n == s.length()) { n++; }
    double d = n; boolean nan = d != d;`), kt: km(`    if (n > 0 && s == o) println(n)`) },
});

rule({
  id: 'self-assignment', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 3, tags: ['suspicious'], ref: 'S1656', ktRef: 'S1656',
  en: ['Variables should not be self-assigned', 'Assigning a variable to itself has no effect; usually "this." or a parameter is missing.', 'Assign the intended value, e.g. this.name = name.'],
  ko: ['변수를 자기 자신에게 대입하면 안 됩니다', '자기 대입은 효과가 없으며 보통 this.나 매개변수가 빠진 것입니다.', '의도한 값을 대입하세요. 예: this.name = name.'],
  msg: ['Remove or correct this useless self-assignment of "{0}".', '"{0}"의 쓸모없는 자기 대입을 지우거나 고치세요.'],
  on: {
    Assign(n, cx) {
      if (n.op !== '=' || !A.eq(n.t, n.v) || !pure(n.t)) return;
      cx.report(n, [cx.short(n.t)]);
    },
  },
  bad: { java: jc(`  private String name;
  void setName(String nm) {
    name = name; // Noncompliant
  }`), kt: kc(`  private var name = ""
  fun rename(nm: String) {
    name = name // Noncompliant
  }`) },
  good: { java: jc(`  private String name;
  void setName(String name) {
    this.name = name;
  }`), kt: kc(`  private var name = ""
  fun rename(nm: String) {
    name = nm
  }`) },
});

rule({
  id: 'silly-equality', type: 'B', sev: 'MA', debt: 15, tags: ['suspicious'], ref: 'S2159',
  en: ['Silly equality checks should not be made', 'Comparing values of unrelated types with equals() is always false.', 'Compare values of the same type, converting one side first.'],
  ko: ['의미 없는 동등 비교를 하면 안 됩니다', '관련 없는 타입끼리 equals()로 비교하면 항상 false입니다.', '한쪽을 변환해 같은 타입끼리 비교하세요.'],
  msg: ['Remove this call to "equals"; comparisons between unrelated types "{0}" and "{1}" always return false.', '이 equals 호출을 지우세요. 관련 없는 "{0}"와(과) "{1}"의 비교는 항상 false입니다.'],
  on: {
    Call(n, cx) {
      let a;
      let b;
      if (n.id === 'equals' && n.o && n.args.length === 1) { a = n.o; b = n.args[0]; } else if (n.id === 'equals' && A.dotted(n.o) === 'Objects' && n.args.length === 2) { a = n.args[0]; b = n.args[1]; } else return;
      const ta = cx.typeOf(a);
      const tb = cx.typeOf(b);
      const norm = (t) => (T.primOf(t) ? { int: 'Integer', long: 'Long', short: 'Short', byte: 'Byte', char: 'Character', boolean: 'Boolean', float: 'Float', double: 'Double' }[T.primOf(t)] : t);
      const x = norm(ta);
      const y = norm(tb);
      if (!x || !y || x === y) return;
      if (!VALUE_TYPES.includes(x) || !VALUE_TYPES.includes(y)) return;
      cx.report(n, [x, y]);
    },
  },
  bad: { java: jm(`    String id = "42";
    Integer num = Integer.valueOf(42);
    if (id.equals(num)) { n++; } // Noncompliant`) },
  good: { java: jm(`    String id = "42";
    Integer num = Integer.valueOf(42);
    if (id.equals(String.valueOf(num))) { n++; }`) },
});

rule({
  id: 'equals-null', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'],
  en: ['"equals(null)" should not be used', 'x.equals(null) is always false for a correct equals(), and throws when x is null.', 'Test x == null instead.'],
  ko: ['equals(null)을 쓰면 안 됩니다', '올바른 equals()라면 x.equals(null)은 항상 false이고 x가 null이면 예외가 납니다.', 'x == null로 검사하세요.'],
  on: { Call(n, cx) { if (n.id === 'equals' && n.o && n.args.length === 1 && A.isNull(n.args[0])) cx.report(n); } },
  bad: { java: jm(`    if (s.equals(null)) { n++; } // Noncompliant`) },
  good: { java: jm(`    if (s == null) { n++; }`) },
});

rule({
  id: 'array-hashcode-tostring', langs: ['java'], type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S2116',
  en: ['"hashCode" and "toString" should not be called on array instances', 'Arrays inherit identity hashCode() and toString(), which ignore the contents.', 'Use Arrays.hashCode(arr) / Arrays.toString(arr).'],
  ko: ['배열 인스턴스에 hashCode와 toString을 호출하면 안 됩니다', '배열은 내용을 무시하는 식별 기반 hashCode()와 toString()을 물려받습니다.', 'Arrays.hashCode(arr) / Arrays.toString(arr)를 쓰세요.'],
  msg: ['Use "Arrays.{0}(array)" instead.', '대신 "Arrays.{0}(array)"를 쓰세요.'],
  on: {
    Call(n, cx) {
      if ((n.id !== 'hashCode' && n.id !== 'toString') || !n.o || n.args.length) return;
      const t = cx.typeOf(n.o);
      if (t && t.endsWith('[]')) cx.report(n, [n.id]);
    },
  },
  bad: { java: jm(`    String[] parts = s.split(",");
    String text = parts.toString(); // Noncompliant`) },
  good: { java: jm(`    String[] parts = s.split(",");
    String text = java.util.Arrays.toString(parts);`) },
});

rule({
  id: 'array-equals', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'],
  en: ['Arrays should not be compared with "equals()"', 'equals() on an array compares references, not contents.', 'Use Arrays.equals(a, b) or Arrays.deepEquals.'],
  ko: ['배열을 equals()로 비교하면 안 됩니다', '배열의 equals()는 내용이 아니라 참조를 비교합니다.', 'Arrays.equals(a, b)나 Arrays.deepEquals를 쓰세요.'],
  on: {
    Call(n, cx) {
      if (n.id !== 'equals' || !n.o || n.args.length !== 1) return;
      const t = cx.typeOf(n.o);
      if (t && t.endsWith('[]')) cx.report(n);
    },
  },
  bad: { java: jm(`    byte[] a = s.getBytes();
    if (a.equals(s.getBytes())) { n++; } // Noncompliant`) },
  good: { java: jm(`    byte[] a = s.getBytes();
    if (java.util.Arrays.equals(a, s.getBytes())) { n++; }`) },
});

rule({
  id: 'equals-without-hashcode', langs: ['java', 'kt'], type: 'B', sev: 'MI', debt: 10, tags: ['cwe-581'], ref: 'S1206', ktRef: 'S1206',
  en: ['"equals(Object)" and "hashCode()" should be overridden in pairs', 'Objects that are equal must have equal hash codes, or hash-based collections misbehave.', 'Override both methods together.'],
  ko: ['equals(Object)와 hashCode()는 함께 재정의해야 합니다', '같은 객체는 해시 코드도 같아야 하며 아니면 해시 컬렉션이 오동작합니다.', '두 메서드를 함께 재정의하세요.'],
  msg: ['This class overrides "{0}()" and should therefore also override "{1}()".', '이 클래스는 "{0}()"을(를) 재정의하므로 "{1}()"도 재정의해야 합니다.'],
  on: {
    Class(n, cx) {
      if (n.kind === 'interface' || n.kind === 'record') return;
      const eq = H.classMethods(n).find((m) => m.name === 'equals' && m.params.length === 1 && /^(Object|Any)$/.test(A.typeName(m.params[0].type)));
      const hc = H.findMethod(n, 'hashCode', 0);
      if (eq && !hc) cx.report({ line: eq.nameLine || eq.line, col: eq.nameCol || 1 }, ['equals', 'hashCode']);
      if (hc && !eq && !(n.mods && n.mods.has('data'))) cx.report({ line: hc.nameLine || hc.line, col: hc.nameCol || 1 }, ['hashCode', 'equals']);
    },
  },
  bad: {
    java: jc(`  int id;
  @Override public boolean equals(Object o) { // Noncompliant
    return o instanceof T && ((T) o).id == id;
  }`),
    kt: kc(`  val id = 1
  override fun equals(other: Any?): Boolean = other is T && other.id == id // Noncompliant`),
  },
  good: {
    java: jc(`  int id;
  @Override public boolean equals(Object o) { return o instanceof T && ((T) o).id == id; }
  @Override public int hashCode() { return id; }`),
    kt: kc(`  val id = 1
  override fun equals(other: Any?): Boolean = other is T && other.id == id
  override fun hashCode(): Int = id`),
  },
});

rule({
  id: 'equals-overload', type: 'B', sev: 'MA', debt: 10, tags: ['pitfall'], ref: 'S1201',
  en: ['"equals" method overrides should accept "Object" parameters', 'equals(MyType) overloads instead of overriding equals(Object), so collections never call it.', 'Declare equals(Object) and check the type inside.'],
  ko: ['equals 재정의는 Object 매개변수를 받아야 합니다', 'equals(MyType)은 equals(Object)를 재정의하지 않고 오버로드해 컬렉션이 호출하지 않습니다.', 'equals(Object)로 선언하고 안에서 타입을 검사하세요.'],
  on: {
    Method(n, cx) {
      if (n.name !== 'equals' || n.params.length !== 1 || n.lang === 'kt') return;
      const t = A.typeName(n.params[0].type);
      if (t === 'Object' || !n.ret || A.typeName(n.ret) !== 'boolean') return;
      cx.report({ line: n.nameLine || n.line, col: n.nameCol || 1 });
    },
  },
  bad: { java: jc(`  int id;
  public boolean equals(T other) { // Noncompliant
    return other.id == id;
  }`) },
  good: { java: jc(`  int id;
  @Override public boolean equals(Object other) { return other instanceof T && ((T) other).id == id; }
  @Override public int hashCode() { return id; }`) },
});

rule({
  id: 'equals-no-type-check', type: 'B', sev: 'MI', debt: 5, tags: ['pitfall'], ref: 'S2097',
  en: ['"equals(Object obj)" should test argument type', 'Casting the argument without checking its type throws ClassCastException for objects of other classes.', 'Check obj instanceof T or getClass() before casting.'],
  ko: ['equals(Object obj)는 인자 타입을 검사해야 합니다', '타입 검사 없이 인자를 캐스팅하면 다른 클래스 객체에서 ClassCastException이 납니다.', '캐스팅 전에 instanceof나 getClass()로 검사하세요.'],
  on: {
    Method(n, cx) {
      if (n.name !== 'equals' || n.params.length !== 1 || !n.body || n.lang === 'kt') return;
      if (A.typeName(n.params[0].type) !== 'Object') return;
      const p = n.params[0].name;
      const castNode = H.findIn(n.body, (x) => x.k === 'Cast' && A.nameOf(x.e) === p);
      if (!castNode) return;
      const checked = H.findIn(n.body, (x) => x.k === 'InstOf' || (x.k === 'Call' && (x.id === 'getClass' || x.id === 'isInstance' || x.id === 'isAssignableFrom' || x.id === 'equals' && x !== castNode)));
      if (!checked) cx.report(castNode);
    },
  },
  bad: { java: jc(`  int id;
  @Override public boolean equals(Object o) {
    T other = (T) o; // Noncompliant
    return other.id == id;
  }
  @Override public int hashCode() { return id; }`) },
  good: { java: jc(`  int id;
  @Override public boolean equals(Object o) {
    if (o == null || getClass() != o.getClass()) return false;
    T other = (T) o;
    return other.id == id;
  }
  @Override public int hashCode() { return id; }`) },
});

rule({
  id: 'equals-on-atomic', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'], ref: 'S2204',
  en: ['".equals()" should not be used to test the values of "Atomic" classes', 'Atomic classes do not override equals(); it compares references.', 'Compare get() values instead.'],
  ko: ['Atomic 클래스 값 비교에 equals()를 쓰면 안 됩니다', 'Atomic 클래스는 equals()를 재정의하지 않아 참조를 비교합니다.', 'get() 값을 비교하세요.'],
  on: {
    Call(n, cx) {
      if (n.id !== 'equals' || !n.o || n.args.length !== 1) return;
      const t = cx.typeOf(n.o);
      if (t && /^Atomic(Integer|Long|Boolean)$/.test(t)) cx.report(n);
    },
  },
  bad: { java: jm(`    java.util.concurrent.atomic.AtomicInteger a = new java.util.concurrent.atomic.AtomicInteger(1);
    java.util.concurrent.atomic.AtomicInteger b = new java.util.concurrent.atomic.AtomicInteger(1);
    if (a.equals(b)) { n++; } // Noncompliant`) },
  good: { java: jm(`    java.util.concurrent.atomic.AtomicInteger a = new java.util.concurrent.atomic.AtomicInteger(1);
    java.util.concurrent.atomic.AtomicInteger b = new java.util.concurrent.atomic.AtomicInteger(1);
    if (a.get() == b.get()) { n++; }`) },
});

rule({
  id: 'compareto-min-value', type: 'B', sev: 'MI', debt: 5, tags: ['pitfall'], ref: 'S2167',
  en: ['"compareTo" should not return "Integer.MIN_VALUE"', 'Callers often negate compareTo results, and -Integer.MIN_VALUE overflows back to MIN_VALUE.', 'Return -1 instead.'],
  ko: ['compareTo는 Integer.MIN_VALUE를 반환하면 안 됩니다', '호출자가 결과를 뒤집는 경우가 많은데 -Integer.MIN_VALUE는 다시 MIN_VALUE로 넘칩니다.', '대신 -1을 반환하세요.'],
  on: {
    Return(n, cx) {
      const m = cx.method;
      if (!m || m.name !== 'compareTo' || !n.e) return;
      if (A.dotted(n.e) === 'Integer.MIN_VALUE') cx.report(n);
    },
  },
  bad: { java: jc(`  public int compareTo(T o) {
    return Integer.MIN_VALUE; // Noncompliant
  }`) },
  good: { java: jc(`  public int compareTo(T o) {
    return -1;
  }`) },
});

// ── ignored results ──
const STRING_PURE = new Set(['trim', 'strip', 'stripLeading', 'stripTrailing', 'toUpperCase', 'toLowerCase', 'replace', 'replaceAll', 'replaceFirst',
  'substring', 'concat', 'intern', 'repeat', 'formatted', 'indent', 'uppercase', 'lowercase', 'trimEnd', 'trimStart', 'removePrefix',
  'removeSuffix', 'padStart', 'padEnd', 'capitalize', 'reversed', 'trimIndent', 'trimMargin']);
const BIG_PURE = new Set(['add', 'subtract', 'multiply', 'divide', 'negate', 'abs', 'pow', 'setScale', 'remainder', 'max', 'min', 'plus', 'round', 'movePointLeft', 'movePointRight', 'shiftLeft', 'shiftRight', 'mod', 'and', 'or', 'xor', 'not']);
const TIME_PURE = /^(plus|minus|with)\w*$/;
const KT_COLL_PURE = new Set(['map', 'filter', 'filterNot', 'sorted', 'sortedBy', 'sortedDescending', 'sortedByDescending', 'reversed', 'distinct',
  'plus', 'minus', 'take', 'drop', 'toList', 'toSet', 'toMutableList', 'mapNotNull', 'flatMap', 'filterNotNull', 'associate', 'associateBy',
  'groupBy', 'zip', 'shuffled', 'chunked', 'windowed', 'asReversed']);

rule({
  id: 'ignored-return-value', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 10, tags: ['suspicious'], ref: 'S2201', ktRef: 'S2201',
  en: ['Return values from functions without side effects should not be ignored', 'The method returns a new value and changes nothing; ignoring the result means the call does nothing.', 'Use the returned value, e.g. s = s.trim().'],
  ko: ['부수 효과 없는 함수의 반환값을 버리면 안 됩니다', '이 메서드는 새 값을 반환할 뿐 아무것도 바꾸지 않아 결과를 버리면 호출이 아무 일도 하지 않습니다.', '반환값을 사용하세요. 예: s = s.trim().'],
  msg: ['The return value of "{0}" must be used.', '"{0}"의 반환값을 사용해야 합니다.'],
  on: {
    ExprStmt(n, cx) {
      const e = A.strip(n.e);
      if (!e || e.k !== 'Call' || !e.o || !e.id) return;
      if (cx.kt && e.safe) return;
      const t = cx.typeOf(e.o);
      let bad = false;
      if (STRING_PURE.has(e.id) && (t === 'String' || A.isStrLit(e.o))) bad = true;
      else if (BIG_PURE.has(e.id) && (t === 'BigDecimal' || t === 'BigInteger')) bad = true;
      else if (TIME_PURE.test(e.id) && /^(LocalDate|LocalDateTime|LocalTime|Instant|Duration|ZonedDateTime|OffsetDateTime|Period|YearMonth)$/.test(t || '')) bad = true;
      else if (cx.kt && KT_COLL_PURE.has(e.id) && !e.lambdaDone === !e.trailing && t && /^(List|Set|Map|Collection|Iterable|Sequence)$/.test(t)) bad = true;
      else if (cx.kt && KT_COLL_PURE.has(e.id) && /^(listOf|setOf|mapOf)$/.test(A.strip(e.o).k === 'Call' ? A.strip(e.o).id : '')) bad = true;
      if (bad) cx.report(e, [e.id]);
    },
  },
  bad: { java: jm(`    String v = s;
    v.trim(); // Noncompliant
    java.math.BigDecimal b = java.math.BigDecimal.ONE;
    b.add(java.math.BigDecimal.TEN);`).replace('b.add(java.math.BigDecimal.TEN);', 'b.add(java.math.BigDecimal.TEN); // Noncompliant').replace('java.math.BigDecimal b = java.math.BigDecimal.ONE;', 'java.math.BigDecimal b = new java.math.BigDecimal(1);'),
    kt: km(`    val names = listOf("a", "b")
    names.map { it.uppercase() } // Noncompliant
    s.trim() // Noncompliant`) },
  good: { java: jm(`    String v = s;
    v = v.trim();
    StringBuilder sb = new StringBuilder();
    sb.append(v);`), kt: km(`    val names = listOf("a", "b")
    val upper = names.map { it.uppercase() }
    names.forEach { println(it) }
    val t = s.trim()`) },
});

rule({
  id: 'stream-not-consumed', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S3958',
  en: ['Intermediate Stream methods should not be left unused', 'Streams are lazy: without a terminal operation the intermediate steps never run.', 'Finish the pipeline with a terminal operation such as forEach, collect or toList.'],
  ko: ['중간 Stream 연산을 쓰지 않은 채 두면 안 됩니다', '스트림은 지연 실행이라 종단 연산이 없으면 중간 단계가 실행되지 않습니다.', 'forEach, collect, toList 같은 종단 연산으로 파이프라인을 끝내세요.'],
  msg: ['Refactor the code so this stream pipeline is used ("{0}" is lazy).', '이 스트림 파이프라인이 실제로 쓰이게 고치세요. "{0}"은(는) 지연 실행됩니다.'],
  on: {
    ExprStmt(n, cx) {
      const e = A.strip(n.e);
      if (!e || e.k !== 'Call' || !/^(filter|map|flatMap|peek|sorted|distinct|limit|skip|mapToInt|mapToObj|mapToLong|mapToDouble|boxed)$/.test(e.id || '')) return;
      const isStream = cx.typeOf(e.o) === 'Stream' || !!A.find(e.o, (x) => x.k === 'Call' && /^(stream|parallelStream|chars|lines)$/.test(x.id) || (x.k === 'Call' && x.id === 'of' && /^(Stream|IntStream)$/.test(A.dotted(x.o) || '')));
      if (isStream) cx.report(e, [e.id]);
    },
  },
  bad: { java: jm(`    list.stream().filter(x -> x.isEmpty()).peek(System.out::println); // Noncompliant`) },
  good: { java: jm(`    list.stream().filter(x -> x.isEmpty()).forEach(System.out::println);`) },
});

rule({
  id: 'read-result-ignored', type: 'B', sev: 'MI', debt: 5, tags: ['cwe-252'], ref: 'S2674',
  en: ['The value returned from a stream read should be checked', 'read(byte[]) and skip() may process fewer bytes than requested; ignoring the count loses data.', 'Use the returned count, or readFully / readNBytes.'],
  ko: ['스트림 read의 반환값을 확인해야 합니다', 'read(byte[])와 skip()은 요청보다 적게 처리할 수 있어 개수를 무시하면 데이터를 잃습니다.', '반환된 개수를 쓰거나 readFully / readNBytes를 쓰세요.'],
  msg: ['Check the return value of the "{0}" call to see how many bytes were read.', '"{0}" 호출의 반환값으로 실제로 읽은 바이트 수를 확인하세요.'],
  on: {
    ExprStmt(n, cx) {
      const e = A.strip(n.e);
      if (!e || e.k !== 'Call' || !e.o || !((e.id === 'read' && e.args.length >= 1) || (e.id === 'skip' && e.args.length === 1))) return;
      const t = cx.typeOf(e.o) || '';
      if (/(InputStream|Reader)$/.test(t) || (!t && /(^in$|Stream$|stream$|reader$|Reader$|^is$)/.test(A.dotted(e.o) || ''))) cx.report(e, [e.id]);
    },
  },
  bad: { java: jm(`    java.io.InputStream in = new java.io.ByteArrayInputStream(new byte[8]);
    byte[] buf = new byte[8];
    in.read(buf); // Noncompliant`) },
  good: { java: jm(`    java.io.InputStream in = new java.io.ByteArrayInputStream(new byte[8]);
    byte[] buf = new byte[8];
    int got = in.read(buf);`) },
});

rule({
  id: 'file-result-ignored', langs: ['java', 'kt'], type: 'B', sev: 'MI', debt: 10, tags: ['cwe-252', 'cwe-754'], ref: 'S899', ktRef: 'S899',
  en: ['Return values of file operations should be checked', 'File.delete(), mkdir(), renameTo() and similar report failure only through their boolean result.', 'Check the result, or use java.nio.file.Files which throws on failure.'],
  ko: ['파일 연산의 반환값을 확인해야 합니다', 'File.delete(), mkdir(), renameTo() 등은 실패를 불리언 반환값으로만 알립니다.', '결과를 확인하거나 실패 시 예외를 던지는 java.nio.file.Files를 쓰세요.'],
  msg: ['Do something with the "boolean" value returned by "{0}".', '"{0}"이(가) 반환한 boolean 값을 처리하세요.'],
  on: {
    ExprStmt(n, cx) {
      const e = A.strip(n.e);
      if (!e || e.k !== 'Call' || !e.o || !/^(delete|mkdir|mkdirs|createNewFile|renameTo|setReadable|setWritable|setExecutable|setLastModified|setReadOnly)$/.test(e.id || '')) return;
      if (e.safe) return;
      const t = cx.typeOf(e.o);
      if (t === 'File' || A.isCtor(e.o, 'File')) cx.report(e, [e.id]);
    },
  },
  bad: { java: jm(`    java.io.File f = new java.io.File(s);
    f.delete(); // Noncompliant`), kt: km(`    val f = java.io.File(s)
    f.delete() // Noncompliant`) },
  good: { java: jm(`    java.io.File f = new java.io.File(s);
    if (!f.delete()) { throw new java.io.IOException("cannot delete"); }`), kt: km(`    val f = java.io.File(s)
    check(f.delete()) { "cannot delete" }`) },
});

// ── concurrency ──
rule({
  id: 'wait-notify-outside-sync', type: 'B', sev: 'MA', debt: 20, tags: ['multi-threading'], ref: 'S2273',
  en: ['"wait", "notify" and "notifyAll" should only be called when a lock is obviously held', 'Calling these without holding the monitor throws IllegalMonitorStateException.', 'Call them inside a synchronized block on the same object.'],
  ko: ['wait, notify, notifyAll은 잠금을 쥔 곳에서만 호출해야 합니다', '모니터를 쥐지 않고 호출하면 IllegalMonitorStateException이 납니다.', '같은 객체에 대한 synchronized 블록 안에서 호출하세요.'],
  msg: ['Make this call to "{0}()" only inside a synchronized block.', '"{0}()" 호출은 synchronized 블록 안에서만 하세요.'],
  on: {
    Call(n, cx) {
      if (!/^(wait|notify|notifyAll)$/.test(n.id || '')) return;
      if (n.id === 'wait' ? n.args.length > 2 : n.args.length) return;
      if (n.o && (cx.typeOf(n.o) === 'Condition' || /^(Thread|CountDownLatch)$/.test(cx.typeOf(n.o) || ''))) return;
      if (H.inSync(cx)) return;
      cx.report(n, [n.id]);
    },
  },
  bad: { java: jc(`  private final Object lock = new Object();
  void m() throws InterruptedException {
    lock.wait(); // Noncompliant
  }`) },
  good: { java: jc(`  private final Object lock = new Object();
  void m() throws InterruptedException {
    synchronized (lock) { while (!ready()) { lock.wait(); } }
  }
  boolean ready() { return true; }`) },
});

rule({
  id: 'wait-not-in-loop', type: 'B', sev: 'CR', debt: 5, tags: ['multi-threading'], ref: 'S2274',
  en: ['"Object.wait()" and "Condition.await()" should be called inside a "while" loop', 'Threads can wake up spuriously; a single if-check lets the code run with the condition still false.', 'Re-check the condition in a while loop around wait().'],
  ko: ['Object.wait()와 Condition.await()는 while 루프 안에서 호출해야 합니다', '스레드는 이유 없이 깨어날 수 있어 if로 한 번만 검사하면 조건이 거짓인 채로 진행합니다.', 'wait()를 감싸는 while 루프에서 조건을 다시 검사하세요.'],
  msg: ['Remove this call to "{0}" or move it into a "while" loop.', '이 "{0}" 호출을 지우거나 while 루프 안으로 옮기세요.'],
  on: {
    Call(n, cx) {
      if (!((n.id === 'wait' && n.args.length <= 2) || (n.id === 'await' && n.args.length === 0 && cx.typeOf(n.o) === 'Condition'))) return;
      if (n.id === 'wait' && n.o && /^(Thread|Process|CompletableFuture)$/.test(cx.typeOf(n.o) || '')) return;
      if (n.id === 'wait' && n.args.length && !H.inSync(cx)) return;
      if (H.inLoopWithin(cx)) return;
      cx.report(n, [n.id + '()']);
    },
  },
  bad: { java: jc(`  private final Object lock = new Object();
  private boolean ready;
  void m() throws InterruptedException {
    synchronized (lock) {
      if (!ready) { lock.wait(); } // Noncompliant
    }
  }`) },
  good: { java: jc(`  private final Object lock = new Object();
  private boolean ready;
  void m() throws InterruptedException {
    synchronized (lock) {
      while (!ready) { lock.wait(); }
    }
  }`) },
});

rule({
  id: 'sleep-while-locked', type: 'B', sev: 'MA', debt: 5, tags: ['multi-threading', 'performance'], ref: 'S2276',
  en: ['"wait(...)" should be used instead of "Thread.sleep(...)" when a lock is held', 'Thread.sleep keeps the monitor, blocking every other thread that needs it.', 'Use lock.wait(timeout), or sleep outside the synchronized block.'],
  ko: ['잠금을 쥔 상태에서는 Thread.sleep 대신 wait(...)를 써야 합니다', 'Thread.sleep은 모니터를 쥔 채 잠들어 그 모니터가 필요한 다른 스레드를 모두 막습니다.', 'lock.wait(timeout)을 쓰거나 synchronized 밖에서 잠드세요.'],
  on: { Call(n, cx) { if (n.id === 'sleep' && A.dotted(n.o) === 'Thread' && H.inSync(cx)) cx.report(n); } },
  bad: { java: jc(`  synchronized void m() throws InterruptedException {
    Thread.sleep(100); // Noncompliant
  }`) },
  good: { java: jc(`  void m() throws InterruptedException {
    Thread.sleep(100);
  }`) },
});

rule({
  id: 'double-checked-locking', type: 'B', sev: 'BL', debt: 5, tags: ['multi-threading', 'cwe-609'], ref: 'S2168',
  en: ['Double-checked locking should not be used', 'Without volatile, another thread can see the field set before the object is fully constructed.', 'Make the field volatile, or use the holder-class idiom / an enum singleton.'],
  ko: ['이중 검사 잠금을 쓰면 안 됩니다', 'volatile이 없으면 다른 스레드가 객체 생성이 끝나기 전에 필드가 설정된 것을 볼 수 있습니다.', '필드를 volatile로 하거나 홀더 클래스 / enum 싱글턴을 쓰세요.'],
  msg: ['Remove this dangerous instance of double-checked locking on "{0}".', '"{0}"에 대한 위험한 이중 검사 잠금을 없애세요.'],
  on: {
    If(n, cx) {
      const c = A.strip(n.c);
      if (!c || c.k !== 'Bin' || c.op !== '==' || !A.isNull(c.r)) return;
      const name = A.varKey(c.l);
      if (!name) return;
      const fname = name.replace(/^this\./, '');
      const info = cx.clsInfo;
      const f = info && info.fields.get(fname);
      if (!f || (f.mods && f.mods.has('volatile'))) return;
      const sync = A.blockStmts(n.t).find((s) => s.k === 'Sync');
      if (!sync) return;
      const inner = A.find(sync.body, (x) => x.k === 'If' && A.strip(x.c).k === 'Bin' && A.eq(A.strip(x.c).l, c.l) && A.isNull(A.strip(x.c).r));
      if (inner) cx.report(n, [fname]);
    },
  },
  bad: { java: jc(`  private static Object instance;
  static Object get() {
    if (instance == null) { // Noncompliant
      synchronized (T.class) {
        if (instance == null) { instance = new Object(); }
      }
    }
    return instance;
  }`) },
  good: { java: jc(`  private static volatile Object instance;
  static Object get() {
    if (instance == null) {
      synchronized (T.class) {
        if (instance == null) { instance = new Object(); }
      }
    }
    return instance;
  }`) },
});

rule({
  id: 'sync-on-value-object', type: 'B', sev: 'MA', debt: 15, tags: ['multi-threading'], ref: 'S1860',
  en: ['Synchronization should not be done on instances of value-based classes', 'String literals and boxed values are shared/interned, so unrelated code may lock the same object.', 'Synchronize on a private final Object dedicated to the lock.'],
  ko: ['값 기반 클래스 인스턴스로 동기화하면 안 됩니다', '문자열 리터럴과 박싱 값은 공유·인턴되어 관련 없는 코드가 같은 객체를 잠글 수 있습니다.', '잠금 전용 private final Object로 동기화하세요.'],
  on: {
    Sync(n, cx) {
      const l = A.strip(n.lock);
      const t = cx.typeOf(l);
      if (A.isStrLit(l) || (t && (BOXED.includes(t) || (t === 'String' && l.k === 'Name')))) cx.report(n);
    },
  },
  bad: { java: jc(`  private final String lock = "LOCK";
  void m() {
    synchronized (lock) { } // Noncompliant
  }`) },
  good: { java: jc(`  private final Object lock = new Object();
  void m() {
    synchronized (lock) { }
  }`) },
});

rule({
  id: 'sync-on-getclass', type: 'B', sev: 'MA', debt: 5, tags: ['multi-threading'], ref: 'S3067',
  en: ['"getClass" should not be used for synchronization', 'getClass() returns the runtime subclass, so subclasses lock a different object.', 'Synchronize on MyClass.class or a dedicated lock.'],
  ko: ['동기화에 getClass를 쓰면 안 됩니다', 'getClass()는 실제 하위 클래스를 반환해 하위 클래스마다 다른 객체를 잠급니다.', 'MyClass.class나 전용 잠금 객체로 동기화하세요.'],
  on: { Sync(n, cx) { const l = A.strip(n.lock); if (l.k === 'Call' && l.id === 'getClass' && l.args.length === 0) cx.report(n); } },
  bad: { java: jc(`  void m() {
    synchronized (getClass()) { } // Noncompliant
  }`) },
  good: { java: jc(`  void m() {
    synchronized (T.class) { }
  }`) },
});

rule({
  id: 'sync-on-mutable-field', type: 'B', sev: 'MA', debt: 15, tags: ['multi-threading'], ref: 'S2445',
  en: ['Blocks should be synchronized on "private final" fields', 'If the field is reassigned, threads lock different objects and the block is no longer exclusive.', 'Synchronize on a private final field.'],
  ko: ['블록은 private final 필드로 동기화해야 합니다', '필드가 다시 대입되면 스레드마다 다른 객체를 잠가 블록이 더는 배타적이지 않습니다.', 'private final 필드로 동기화하세요.'],
  msg: ['"{0}" is not "private final", and should not be used for synchronization.', '"{0}"은(는) private final이 아니므로 동기화에 쓰면 안 됩니다.'],
  on: {
    Sync(n, cx) {
      const key = A.varKey(n.lock);
      if (!key) return;
      const name = key.replace(/^this\./, '');
      if (!key.startsWith('this.') && cx.env.locals.has(name)) return;
      const info = cx.clsInfo;
      const f = info && info.fields.get(name);
      if (!f || f.final) return;
      cx.report(n, [name]);
    },
  },
  bad: { java: jc(`  private Object lock = new Object();
  void m() {
    synchronized (lock) { } // Noncompliant
  }`) },
  good: { java: jc(`  private final Object lock = new Object();
  void m() {
    synchronized (lock) { }
  }`) },
});

rule({
  id: 'thread-run-called', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 5, tags: ['multi-threading'], ref: 'S1217', ktRef: 'S1217',
  en: ['"Thread.run()" should not be called directly', 'run() executes the code on the current thread; no new thread is started.', 'Call start().'],
  ko: ['Thread.run()을 직접 호출하면 안 됩니다', 'run()은 현재 스레드에서 코드를 실행할 뿐 새 스레드를 시작하지 않습니다.', 'start()를 호출하세요.'],
  on: {
    Call(n, cx) {
      if (n.id !== 'run' || !n.o || n.args.length) return;
      const o = A.strip(n.o);
      if (cx.typeOf(o) === 'Thread' || A.isCtor(o, 'Thread')) cx.report(n);
    },
  },
  bad: { java: jm(`    Thread t = new Thread(() -> System.out.println("x"));
    t.run(); // Noncompliant`), kt: km(`    val t = Thread { println("x") }
    t.run() // Noncompliant`) },
  good: { java: jm(`    Thread t = new Thread(() -> System.out.println("x"));
    t.start();`), kt: km(`    val t = Thread { println("x") }
    t.start()`) },
});

rule({
  id: 'static-date-format', type: 'B', sev: 'MA', debt: 15, tags: ['multi-threading'], ref: 'S2885',
  en: ['Non-thread-safe fields should not be static', 'SimpleDateFormat, Calendar and similar classes are not thread-safe; a shared static instance corrupts results.', 'Use java.time (DateTimeFormatter), a ThreadLocal, or a local instance.'],
  ko: ['스레드 안전하지 않은 필드를 static으로 두면 안 됩니다', 'SimpleDateFormat, Calendar 등은 스레드 안전하지 않아 공유 static 인스턴스가 결과를 망가뜨립니다.', 'java.time(DateTimeFormatter), ThreadLocal, 지역 인스턴스를 쓰세요.'],
  msg: ['Make "{0}" an instance variable.', '"{0}"을(를) 인스턴스 변수로 바꾸세요.'],
  on: {
    Field(n, cx) {
      if (!H.isStatic(n) || !n.type) return;
      if (!/^(SimpleDateFormat|DateFormat|Calendar|GregorianCalendar|MessageFormat|DecimalFormat|NumberFormat|ChoiceFormat)$/.test(A.typeName(n.type))) return;
      for (const v of n.vars) cx.report(v, [v.name]);
    },
  },
  bad: { java: jc(`  private static final java.text.SimpleDateFormat FMT = new java.text.SimpleDateFormat("yyyy-MM-dd"); // Noncompliant`) },
  good: { java: jc(`  private static final java.time.format.DateTimeFormatter FMT = java.time.format.DateTimeFormatter.ISO_DATE;`) },
});

rule({
  id: 'getter-setter-sync-mismatch', type: 'B', sev: 'MA', debt: 5, tags: ['multi-threading'], ref: 'S2886',
  en: ['Getters and setters should be synchronized in pairs', 'A synchronized setter with an unsynchronized getter lets readers see stale or partly written values.', 'Synchronize both, or make the field volatile/atomic.'],
  ko: ['getter와 setter는 함께 동기화해야 합니다', 'setter만 동기화하고 getter를 동기화하지 않으면 읽는 쪽이 오래되었거나 덜 쓴 값을 봅니다.', '둘 다 동기화하거나 필드를 volatile/atomic으로 하세요.'],
  msg: ['Synchronize this method to match the synchronization on "{0}".', '"{0}"의 동기화에 맞춰 이 메서드도 동기화하세요.'],
  on: {
    Class(n, cx) {
      const ms = H.classMethods(n);
      for (const g of ms) {
        const mm = /^(get|is)([A-Z]\w*)$/.exec(g.name);
        if (!mm || g.params.length || !g.body) continue;
        const s = ms.find((x) => x.name === 'set' + mm[2] && x.params.length === 1);
        if (!s) continue;
        const gs = g.mods.has('synchronized');
        const ss = s.mods.has('synchronized');
        if (gs !== ss) {
          const unsync = gs ? s : g;
          cx.report({ line: unsync.nameLine || unsync.line, col: unsync.nameCol || 1 }, [gs ? g.name : s.name]);
        }
      }
    },
  },
  bad: { java: jc(`  private String name;
  public String getName() { return name; } // Noncompliant
  public synchronized void setName(String n) { name = n; }`) },
  good: { java: jc(`  private String name;
  public synchronized String getName() { return name; }
  public synchronized void setName(String n) { name = n; }`) },
});

rule({
  id: 'lazy-static-init', type: 'B', sev: 'CR', debt: 15, tags: ['multi-threading'], ref: 'S2444',
  en: ['Lazy initialization of "static" fields should be "synchronized"', 'Two threads can both see null and create two instances, breaking singletons and caches.', 'Synchronize the method, use a holder class, or initialize eagerly.'],
  ko: ['static 필드의 지연 초기화는 synchronized여야 합니다', '두 스레드가 모두 null을 보고 인스턴스를 둘 만들어 싱글턴과 캐시가 깨질 수 있습니다.', '메서드를 동기화하거나 홀더 클래스를 쓰거나 미리 초기화하세요.'],
  msg: ['Synchronize this lazy initialization of "{0}".', '"{0}"의 지연 초기화를 동기화하세요.'],
  on: {
    If(n, cx) {
      const m = cx.method;
      if (!m || H.inSync(cx) || !H.isStatic(m)) return;
      const c = A.strip(n.c);
      if (!c || c.k !== 'Bin' || c.op !== '==' || !A.isNull(c.r) || A.strip(c.l).k !== 'Name') return;
      const name = A.strip(c.l).id;
      const info = cx.clsInfo;
      const f = info && info.fields.get(name);
      if (!f || !(f.mods && f.mods.has('static')) || f.mods.has('volatile') || f.final) return;
      if (cx.env.locals.has(name)) return;
      const assigns = A.find(n.t, (x) => x.k === 'Assign' && A.nameOf(x.t) === name);
      if (assigns) cx.report(n, [name]);
    },
  },
  bad: { java: jc(`  private static java.util.Map<String, String> cache;
  static java.util.Map<String, String> cache() {
    if (cache == null) { // Noncompliant
      cache = new java.util.HashMap<>();
    }
    return cache;
  }`) },
  good: { java: jc(`  private static java.util.Map<String, String> cache;
  static synchronized java.util.Map<String, String> cache() {
    if (cache == null) {
      cache = new java.util.HashMap<>();
    }
    return cache;
  }`) },
});

// ── arithmetic ──
rule({
  id: 'shift-out-of-range', type: 'B', sev: 'MI', debt: 5, tags: ['pitfall'], ref: 'S2183',
  en: ['Ints and longs should not be shifted by zero or more than their number of bits', 'Java masks the shift distance (mod 32 for int, mod 64 for long), so large shifts do not do what they look like.', 'Use a distance within range, or widen the operand to long.'],
  ko: ['int와 long을 비트 수 이상으로 시프트하면 안 됩니다', 'Java는 시프트 거리를 마스킹(int는 32, long은 64로 나머지)해 큰 시프트가 보이는 대로 동작하지 않습니다.', '범위 안의 거리를 쓰거나 피연산자를 long으로 넓히세요.'],
  msg: ['Either use a "long" or correct this shift by {0}.', 'long을 쓰거나 {0}만큼의 이 시프트를 고치세요.'],
  on: {
    Bin(n, cx) {
      if (!['<<', '>>', '>>>'].includes(n.op)) return;
      const r = A.strip(n.r);
      if (!r || r.k !== 'Lit' || r.t !== 'int') return;
      const lt = cx.typeOf(n.l);
      const isLong = lt === 'long' || lt === 'Long' || (A.strip(n.l).k === 'Lit' && A.strip(n.l).t === 'long');
      const bits = isLong ? 64 : 32;
      if (!lt && !A.isNumLit(n.l)) return;
      if (r.v >= bits || r.v < 0) cx.report({ line: n.opLine || n.line, col: n.opCol || n.col }, [r.v]);
    },
  },
  bad: { java: jm(`    int x = n << 32; // Noncompliant`) },
  good: { java: jm(`    long x = ((long) n) << 32;
    int y = n << 4;`) },
});

rule({
  id: 'int-math-widened', type: 'B', sev: 'MI', debt: 5, tags: ['cwe-190', 'pitfall'], ref: 'S2184',
  en: ['Math operands should be cast before assignment', 'The arithmetic runs in int and only the (possibly overflowed or truncated) result is widened.', 'Cast one operand to long/double before the operation.'],
  ko: ['산술 피연산자는 대입 전에 캐스팅해야 합니다', '계산은 int로 수행되고 (넘쳤거나 잘린) 결과만 넓혀집니다.', '연산 전에 피연산자 하나를 long/double로 캐스팅하세요.'],
  msg: ['Cast one of the operands of this {0} operation to a "{1}".', '이 {0} 연산의 피연산자 하나를 "{1}"(으)로 캐스팅하세요.'],
  on: {
    Local(n, cx) { for (const v of n.vars) check(cx, n.type, v.init); },
    Field(n, cx) { for (const v of n.vars) check(cx, n.type, v.init); },
  },
  bad: { java: jm(`    int a = n, b = n + 1;
    long product = a * b; // Noncompliant
    double ratio = a / b; // Noncompliant`) },
  good: { java: jm(`    int a = n, b = n + 1;
    long product = (long) a * b;
    double ratio = (double) a / b;
    double half = 1 / 2;`) },
});
function check(cx, ty, init) {
  if (!ty || !init) return;
  const target = A.typeName(ty);
  const e = A.strip(init);
  if (!e || e.k !== 'Bin') return;
  if (A.isNumLit(e.l) && A.isNumLit(e.r)) return;
  const tl = cx.typeOf(e.l);
  const tr = cx.typeOf(e.r);
  if (!(T.primOf(tl) === 'int' && T.primOf(tr) === 'int')) return;
  if ((target === 'long' || target === 'Long') && (e.op === '*' || e.op === '+' || e.op === '<<')) cx.report(e, [e.op === '*' ? 'multiplication' : e.op === '+' ? 'addition' : 'shift', 'long']);
  else if (/^(double|float|Double|Float)$/.test(target) && e.op === '/') cx.report(e, ['division', target.toLowerCase()]);
}

rule({
  id: 'int-overflow-constant', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 5, tags: ['cwe-190'], ref: 'S2184', ktRef: 'S2184',
  en: ['Constant integer arithmetic should not overflow', 'The constant expression exceeds the int range and silently wraps around.', 'Use long literals (e.g. 1000L * ...).'],
  ko: ['정수 상수 연산이 넘치면 안 됩니다', '상수 식이 int 범위를 넘어 조용히 값이 돌아갑니다.', 'long 리터럴을 쓰세요(예: 1000L * ...).'],
  msg: ['This constant expression overflows "int" ({0}); use a long literal.', '이 상수 식은 int를 넘칩니다({0}). long 리터럴을 쓰세요.'],
  on: {
    Bin(n, cx) {
      if (n.op !== '*' && n.op !== '+' && n.op !== '-' && n.op !== '<<') return;
      const p = cx.parent();
      if (p && p.k === 'Bin' && (p.op === '*' || p.op === '+' || p.op === '-')) return; // report the outermost
      const v = intConst(n);
      if (v === null) return;
      if (v > 2147483647 || v < -2147483648) cx.report(n, [String(v)]);
    },
  },
  bad: { java: jm(`    long yearMs = 1000 * 60 * 60 * 24 * 365; // Noncompliant`), kt: km(`    val yearMs: Long = 1000 * 60 * 60 * 24 * 365 // Noncompliant`) },
  good: { java: jm(`    long yearMs = 1000L * 60 * 60 * 24 * 365;
    int dayMs = 1000 * 60 * 60 * 24;`), kt: km(`    val yearMs = 1000L * 60 * 60 * 24 * 365
    val dayMs = 1000 * 60 * 60 * 24`) },
});
// exact value of a pure int-literal expression (null when not int-only)
function intConst(e) {
  e = A.strip(e);
  if (!e) return null;
  if (e.k === 'Lit') return e.t === 'int' && Number.isFinite(e.v) && !/[xXbB]/.test(e.raw || '') ? e.v : null;
  if (e.k === 'Bin') {
    const l = intConst(e.l);
    if (l === null) return null;
    const r = intConst(e.r);
    if (r === null) return null;
    if (l < -2147483648 || l > 2147483647 || r < -2147483648 || r > 2147483647) return null;
    if (e.op === '*') return l * r;
    if (e.op === '+') return l + r;
    if (e.op === '-') return l - r;
    if (e.op === '<<') return r >= 0 && r < 31 ? l * Math.pow(2, r) : null;
    return null;
  }
  return null;
}

rule({
  id: 'abs-of-random', langs: ['java', 'kt'], type: 'B', sev: 'MI', debt: 15, tags: ['pitfall'], ref: 'S2676', ktRef: 'S2676',
  en: ['Neither "Math.abs" nor negation should be used on numbers that could be "MIN_VALUE"', 'Math.abs(Integer.MIN_VALUE) is still negative; random ints and hash codes can be MIN_VALUE.', 'Use nextInt(bound) / Math.floorMod(hash, n).'],
  ko: ['MIN_VALUE일 수 있는 수에 Math.abs나 부호 반전을 쓰면 안 됩니다', 'Math.abs(Integer.MIN_VALUE)는 여전히 음수이며 난수와 해시 코드는 MIN_VALUE일 수 있습니다.', 'nextInt(bound)나 Math.floorMod(hash, n)을 쓰세요.'],
  on: {
    Call(n, cx) {
      if (n.id !== 'abs' || n.args.length !== 1) return;
      const r = A.dotted(n.o);
      if (n.o && r !== 'Math' && r !== 'StrictMath' && !(cx.kt && r === 'kotlin.math')) return;
      if (!n.o && !cx.kt) return;
      const a = A.strip(n.args[0]);
      if (a.k === 'Call' && /^(nextInt|nextLong|hashCode)$/.test(a.id) && a.args.length === 0) cx.report(n);
    },
  },
  bad: { java: jm(`    int bucket = Math.abs(s.hashCode()) % 16; // Noncompliant`), kt: km(`    val bucket = kotlin.math.abs(s.hashCode()) % 16 // Noncompliant`) },
  good: { java: jm(`    int bucket = Math.floorMod(s.hashCode(), 16);`), kt: km(`    val bucket = Math.floorMod(s.hashCode(), 16)`) },
});

rule({
  id: 'silly-math', type: 'B', sev: 'MA', debt: 15, tags: ['suspicious'], ref: 'S2185',
  en: ['Silly math should not be performed', 'Rounding or ceiling an integral value does nothing; it usually means an earlier integer division lost precision.', 'Do the math in floating point (cast before dividing), or drop the call.'],
  ko: ['의미 없는 수학 연산을 하면 안 됩니다', '정수 값을 반올림·올림해도 변하지 않으며 보통 앞선 정수 나눗셈에서 정밀도를 잃은 것입니다.', '나누기 전에 캐스팅해 실수로 계산하거나 호출을 지우세요.'],
  msg: ['Remove this silly call to "Math.{0}"; its argument is already integral.', '의미 없는 "Math.{0}" 호출을 지우세요. 인자가 이미 정수입니다.'],
  on: {
    Call(n, cx) {
      if (!/^(round|ceil|floor|rint)$/.test(n.id || '') || A.dotted(n.o) !== 'Math' || n.args.length !== 1) return;
      const a = A.strip(n.args[0]);
      let t = cx.typeOf(a);
      if (a.k === 'Cast' && /^(double|float)$/.test(A.typeName(a.type))) t = cx.typeOf(a.e);
      if (T.isIntegral(t)) cx.report(n, [n.id]);
    },
  },
  bad: { java: jm(`    int total = n * 3;
    double pages = Math.ceil(total / 10); // Noncompliant`) },
  good: { java: jm(`    int total = n * 3;
    double pages = Math.ceil(total / 10.0);`) },
});

rule({
  id: 'size-never-negative', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 2, tags: ['suspicious'], ref: 'S3981', ktRef: 'S3981',
  en: ['Collection sizes and array length comparisons should make sense', 'A size or length is never negative, so this comparison is always true or always false.', 'Compare against 0 with > or ==, or use isEmpty().'],
  ko: ['컬렉션 크기와 배열 길이 비교는 의미가 있어야 합니다', '크기와 길이는 음수가 될 수 없어 이 비교는 항상 참이거나 항상 거짓입니다.', '0과 > 또는 ==로 비교하거나 isEmpty()를 쓰세요.'],
  msg: ['The "{0}" is always non-negative; this test is always {1}.', '"{0}"은(는) 항상 0 이상이라 이 검사는 항상 {1}입니다.'],
  on: {
    Bin(n, cx) {
      if (!['>=', '<'].includes(n.op)) return;
      const r = A.strip(n.r);
      if (!r || r.k !== 'Lit' || r.v !== 0 || r.t !== 'int') return;
      const l = A.strip(n.l);
      const isSize = (l.k === 'Call' && (l.id === 'size' || l.id === 'length') && l.args.length === 0) || (l.k === 'Sel' && (l.id === 'length' || (cx.kt && (l.id === 'size' || l.id === 'length'))));
      if (!isSize) return;
      cx.report({ line: n.opLine || n.line, col: n.opCol || n.col }, [l.k === 'Call' ? l.id + '()' : l.id, n.op === '>=' ? 'true' : 'false']);
    },
  },
  bad: { java: jm(`    if (list.size() >= 0) { n++; } // Noncompliant`), kt: km(`    if (list.size < 0) println("never") // Noncompliant`) },
  good: { java: jm(`    if (list.size() > 0) { n++; }`), kt: km(`    if (list.size > 0) println("some")`) },
});

rule({
  id: 'ternary-mixed-boxing', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'], ref: 'S2154',
  en: ['Dissimilar primitive wrappers should not be used with the ternary operator without explicit casts', 'Mixing Integer and Double in ?: unboxes and promotes both, which surprises and can throw NullPointerException.', 'Cast both branches to the same wrapper type.'],
  ko: ['서로 다른 래퍼 타입을 캐스팅 없이 삼항 연산자에 섞으면 안 됩니다', '?:에 Integer와 Double을 섞으면 둘 다 언박싱·승격되어 예상과 다르고 NullPointerException이 날 수 있습니다.', '두 분기를 같은 래퍼 타입으로 캐스팅하세요.'],
  on: {
    Cond(n, cx) {
      const a = cx.typeOf(n.a);
      const b = cx.typeOf(n.b);
      const nums = ['Integer', 'Long', 'Short', 'Byte', 'Double', 'Float'];
      if (a && b && a !== b && nums.includes(a) && nums.includes(b)) cx.report(n);
    },
  },
  bad: { java: jm(`    Integer i = Integer.valueOf(n);
    Double d = Double.valueOf(2.5);
    Number x = n > 0 ? i : d; // Noncompliant`) },
  good: { java: jm(`    Integer i = Integer.valueOf(n);
    Double d = Double.valueOf(2.5);
    Number x = n > 0 ? (Number) i : (Number) d;`) },
});

// ── control flow ──
rule({
  id: 'jump-in-finally', langs: ['java', 'kt'], type: 'B', sev: 'CR', debt: 30, tags: ['cwe-584', 'error-handling'], ref: 'S1143', ktRef: 'S1143',
  en: ['Jump statements should not occur in "finally" blocks', 'return, throw, break or continue in finally discards any exception or return value from the try block.', 'Move the jump out of the finally block.'],
  ko: ['finally 블록에 점프 문이 있으면 안 됩니다', 'finally의 return, throw, break, continue는 try 블록의 예외나 반환값을 버립니다.', '점프 문을 finally 밖으로 옮기세요.'],
  msg: ['Remove this "{0}" statement from this "finally" block.', '이 finally 블록에서 "{0}" 문을 지우세요.'],
  on: {
    Try(n, cx) {
      if (!n.fin) return;
      const loops = [];
      const visit = (x, inLoop) => {
        if (!x || typeof x !== 'object') return;
        if (x.k === 'Lambda' || x.k === 'Class' || x.k === 'LocalClass' || x.k === 'LocalFun' || (x.k === 'New' && x.body)) return;
        if (x.k === 'Return' || x.k === 'Throw') { loops.push(x); return; }
        if ((x.k === 'Break' || x.k === 'Continue') && !inLoop && !x.label) { loops.push(x); return; }
        if (x.k === 'Try' && x !== n) {
          // throws inside a nested try with catch are handled there
          visit(x.fin, inLoop);
          for (const c of x.catches) visit(c.body, inLoop);
          if (!x.catches.length) visit(x.body, inLoop);
          return;
        }
        const loop = x.k === 'While' || x.k === 'Do' || x.k === 'For' || x.k === 'ForEach' || x.k === 'Switch';
        A.eachChild(x, (c) => visit(c, inLoop || loop));
      };
      visit(n.fin, false);
      for (const j of loops) cx.report(j, [j.k.toLowerCase()]);
    },
  },
  bad: { java: jm(`    try { n = s.length(); }
    finally {
      return; // Noncompliant
    }`), kt: km(`    try { println(s) }
    finally {
      return // Noncompliant
    }`) },
  good: { java: jm(`    try { n = s.length(); }
    finally {
      for (String x : list) { if (x.isEmpty()) break; }
    }`), kt: km(`    try { println(s) }
    finally {
      println("done")
    }`) },
});

rule({
  id: 'interrupted-exception-swallowed', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 15, tags: ['multi-threading', 'error-handling'], ref: 'S2142', ktRef: 'S2142',
  en: ['"InterruptedException" and "ThreadDeath" should not be ignored', 'Swallowing InterruptedException clears the interrupt flag, so callers can no longer stop the thread.', 'Re-interrupt with Thread.currentThread().interrupt() or rethrow.'],
  ko: ['InterruptedException과 ThreadDeath를 무시하면 안 됩니다', 'InterruptedException을 삼키면 인터럽트 플래그가 지워져 호출자가 스레드를 멈출 수 없습니다.', 'Thread.currentThread().interrupt()로 다시 인터럽트하거나 다시 던지세요.'],
  msg: ['Either re-interrupt this method or rethrow the "{0}" that can be caught here.', '이 메서드를 다시 인터럽트하거나 여기서 잡히는 "{0}"을(를) 다시 던지세요.'],
  on: {
    Catch(n, cx) {
      const t = n.types.map((x) => A.typeName(x)).find((x) => x === 'InterruptedException' || x === 'ThreadDeath');
      if (!t) return;
      const handled = A.find(n.body, (x) => x.k === 'Throw' || (x.k === 'Call' && (x.id === 'interrupt' || x.id === 'currentThread' && false)));
      if (!handled) cx.report(n, [t]);
    },
  },
  bad: { java: jm(`    try { Thread.sleep(10); }
    catch (InterruptedException e) { // Noncompliant
      System.out.println("woke");
    }`), kt: km(`    try { Thread.sleep(10) }
    catch (e: InterruptedException) { // Noncompliant
      println("woke")
    }`) },
  good: { java: jm(`    try { Thread.sleep(10); }
    catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }`), kt: km(`    try { Thread.sleep(10) }
    catch (e: InterruptedException) {
      Thread.currentThread().interrupt()
    }`) },
});

rule({
  id: 'exception-not-thrown', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 2, tags: ['error-handling'], ref: 'S3984', ktRef: 'S3984',
  en: ['Exceptions should not be created without being thrown', 'The exception object is created and dropped; the intended throw is missing.', 'Add "throw".'],
  ko: ['예외를 만들기만 하고 던지지 않으면 안 됩니다', '예외 객체를 만들고 버려 의도한 throw가 빠져 있습니다.', 'throw를 붙이세요.'],
  msg: ['Throw this "{0}" or remove this useless statement.', '이 "{0}"을(를) 던지거나 쓸모없는 문을 지우세요.'],
  on: {
    ExprStmt(n, cx) {
      const e = A.strip(n.e);
      const t = A.ctorType(e);
      if (t && /(Exception|Error)$/.test(t) && !(e.k === 'New' && e.body)) cx.report(e, [t]);
    },
  },
  bad: { java: jm(`    if (n < 0) { new IllegalArgumentException("negative"); } // Noncompliant`), kt: km(`    if (n < 0) IllegalArgumentException("negative") // Noncompliant`) },
  good: { java: jm(`    if (n < 0) { throw new IllegalArgumentException("negative"); }`), kt: km(`    if (n < 0) throw IllegalArgumentException("negative")`) },
});

rule({
  id: 'object-created-and-dropped', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S1848',
  en: ['Objects should not be created to be dropped immediately without being used', 'Creating an object only for the side effects of its constructor hides behaviour and is often a forgotten assignment.', 'Assign the object, or move the side effect into a method.'],
  ko: ['만든 객체를 쓰지 않고 바로 버리면 안 됩니다', '생성자의 부수 효과만을 위해 객체를 만들면 동작이 숨고 대개 대입을 잊은 것입니다.', '객체를 변수에 담거나 부수 효과를 메서드로 옮기세요.'],
  msg: ['Either remove this useless object instantiation of class "{0}" or use it.', '쓸모없는 "{0}" 객체 생성을 지우거나 사용하세요.'],
  on: {
    ExprStmt(n, cx) {
      const e = A.strip(n.e);
      if (!e || e.k !== 'New' || e.array || e.body) return;
      const t = A.typeName(e.type);
      if (/(Exception|Error)$/.test(t)) return;
      cx.report(e, [t]);
    },
  },
  bad: { java: jm(`    new StringBuilder(s); // Noncompliant`) },
  good: { java: jm(`    StringBuilder sb = new StringBuilder(s);
    new Thread(() -> {}).start();`) },
});

rule({
  id: 'for-loop-wrong-direction', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S2251',
  en: ['A "for" loop update clause should move the counter in the right direction', 'The counter moves away from the stop condition, so the loop never ends or never runs as intended.', 'Increment for < / <= conditions, decrement for > / >=.'],
  ko: ['for 루프 갱신절은 카운터를 올바른 방향으로 움직여야 합니다', '카운터가 종료 조건에서 멀어져 루프가 끝나지 않거나 의도대로 돌지 않습니다.', '< / <= 조건이면 증가, > / >=이면 감소시키세요.'],
  msg: ['"{0}" is incremented and will never reach "stop condition".', '"{0}"이(가) 잘못된 방향으로 바뀌어 종료 조건에 닿지 않습니다.'],
  on: {
    For(n, cx) {
      const c = A.strip(n.c);
      if (!c || c.k !== 'Bin' || !['<', '<=', '>', '>='].includes(c.op) || n.upd.length !== 1) return;
      const v = A.nameOf(c.l);
      if (!v) return;
      const u = A.strip(n.upd[0]);
      let dir = 0;
      if (u.k === 'Un' && A.nameOf(u.e) === v) dir = u.op === '++' ? 1 : u.op === '--' ? -1 : 0;
      else if (u.k === 'Assign' && A.nameOf(u.t) === v && A.isNumLit(u.v)) {
        const k = A.strip(u.v).v;
        if (u.op === '+=') dir = Math.sign(k); else if (u.op === '-=') dir = -Math.sign(k);
      }
      if (!dir) return;
      const up = c.op === '<' || c.op === '<=';
      if ((up && dir < 0) || (!up && dir > 0)) cx.report(n, [v]);
    },
  },
  bad: { java: jm(`    for (int i = 0; i < n; i--) { System.out.println(i); } // Noncompliant`) },
  good: { java: jm(`    for (int i = 0; i < n; i++) { System.out.println(i); }
    for (int j = n; j > 0; j--) { System.out.println(j); }`) },
});

rule({
  id: 'switch-fallthrough', type: 'S', sev: 'BL', debt: 10, tags: ['cwe-484', 'suspicious'], ref: 'S128',
  en: ['Switch cases should end with an unconditional "break" statement', 'Falling through to the next case is usually a missing break.', 'Add break (or return/throw), or comment the intentional fall-through.'],
  ko: ['switch case는 무조건 break로 끝나야 합니다', '다음 case로 이어지는 것은 대개 break를 빠뜨린 것입니다.', 'break(또는 return/throw)를 넣거나 의도한 fall-through에 주석을 다세요.'],
  on: {
    Switch(n, cx) {
      if (n.arrow || n.kt) return;
      for (let i = 0; i < n.cases.length - 1; i++) {
        const c = n.cases[i];
        if (!c.body.length) continue;
        const last = c.body[c.body.length - 1];
        if (!A.canComplete(last) || !A.canComplete({ k: 'Block', stmts: c.body })) continue;
        const next = n.cases[i + 1];
        if (cx.hasComment(last.el || last.line, next.line)) continue;
        cx.report(c);
      }
    },
  },
  bad: { java: jm(`    switch (n) {
      case 1: // Noncompliant
        System.out.println("one");
      case 2:
        System.out.println("two");
        break;
      default:
        break;
    }`) },
  good: { java: jm(`    switch (n) {
      case 0:
      case 1:
        System.out.println("small");
        break;
      case 2:
        System.out.println("two");
        // fall through
      default:
        break;
    }`) },
});

rule({
  id: 'duplicate-condition', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 10, tags: ['suspicious', 'unused'], ref: 'S1862', ktRef: 'S1862',
  en: ['Related "if/else if" statements and "when" branches should not have the same condition', 'The same condition is tested twice in one chain, so the second branch can never run.', 'Fix the copy-pasted condition or remove the dead branch.'],
  ko: ['연결된 if/else if와 when 분기는 같은 조건을 가지면 안 됩니다', '한 체인에서 같은 조건을 두 번 검사해 두 번째 분기는 실행될 수 없습니다.', '복사한 조건을 고치거나 죽은 분기를 지우세요.'],
  msg: ['This branch can not be reached because the condition duplicates a previous condition in the same sequence (line {0}).', '조건이 같은 체인의 앞선 조건(줄 {0})과 같아 이 분기에 도달할 수 없습니다.'],
  on: {
    If(n, cx) {
      const p = cx.parent();
      if (p && p.k === 'If' && p.f === n) return; // only chain heads
      const conds = [];
      for (let x = n; x && x.k === 'If'; x = x.f) conds.push(x.c);
      for (let i = 1; i < conds.length; i++) {
        for (let j = 0; j < i; j++) {
          if (A.eq(conds[i], conds[j]) && pure(conds[i])) { cx.report(conds[i], [conds[j].line]); break; }
        }
      }
    },
    Switch(n, cx) {
      if (!n.kt) return;
      const seen = [];
      for (const c of n.cases) {
        for (const lab of c.labels) {
          if (!pure(lab)) continue;
          const prev = seen.find((x) => A.eq(x, lab) || (x.k === 'IsPat' && lab.k === 'IsPat' && A.typeName(x.type) === A.typeName(lab.type) && x.neg === lab.neg));
          if (prev) cx.report(lab, [prev.line]); else seen.push(lab);
        }
      }
    },
  },
  bad: { java: jm(`    if (n == 1) { System.out.println("a"); }
    else if (n == 2) { System.out.println("b"); }
    else if (n == 1) { System.out.println("c"); } // Noncompliant`), kt: km(`    when {
        n == 1 -> println("a")
        n == 1 -> println("b") // Noncompliant
        else -> println("c")
    }`) },
  good: { java: jm(`    if (n == 1) { System.out.println("a"); }
    else if (n == 2) { System.out.println("b"); }
    else if (n == 3) { System.out.println("c"); }`), kt: km(`    when {
        n == 1 -> println("a")
        n == 2 -> println("b")
        else -> println("c")
    }`) },
});

rule({
  id: 'all-branches-identical', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 10, tags: ['suspicious'], ref: 'S3923', ktRef: 'S3923',
  en: ['All branches in a conditional structure should not have exactly the same implementation', 'Every branch does the same thing, so the condition is pointless or a branch was not updated.', 'Remove the condition or fix the branch that should differ.'],
  ko: ['조건 구조의 모든 분기가 완전히 같은 구현이면 안 됩니다', '모든 분기가 같은 일을 해 조건이 의미 없거나 한 분기를 고치지 않은 것입니다.', '조건을 지우거나 달라야 할 분기를 고치세요.'],
  msg: ['Remove this conditional structure or edit its code blocks so that they\'re not all the same.', '이 조건 구조를 지우거나 분기들이 모두 같지 않도록 고치세요.'],
  on: {
    If(n, cx) {
      const p = cx.parent();
      if (p && p.k === 'If' && p.f === n) return;
      const branches = [];
      let x = n;
      for (; x && x.k === 'If'; x = x.f) branches.push(x.t);
      if (!x) return; // needs a final else
      branches.push(x);
      if (branches.every((b) => A.eqStmt(b, branches[0])) && !isEmptyStmt(branches[0])) cx.report(n);
    },
    Cond(n, cx) { if (A.eq(n.a, n.b)) cx.report(n); },
    IfX(n, cx) { if (n.f && A.eqStmt(n.t, n.f) && !isEmptyStmt(n.t)) cx.report(n); },
    Switch(n, cx) {
      if (!n.cases.some((c) => c.dflt) || n.cases.length < 2) return;
      const bodies = n.cases.map((c) => ({ k: 'Block', stmts: c.body.filter((s) => s.k !== 'Break') }));
      if (bodies.every((b) => A.eqStmt(b, bodies[0])) && bodies[0].stmts.length) cx.report(n);
    },
  },
  bad: { java: jm(`    if (n > 0) { System.out.println(s); } // Noncompliant
    else { System.out.println(s); }`), kt: km(`    val v = if (n > 0) s.length else s.length // Noncompliant`) },
  good: { java: jm(`    if (n > 0) { System.out.println(s); }
    else { System.out.println(n); }`), kt: km(`    val v = if (n > 0) s.length else 0`) },
});
function isEmptyStmt(s) {
  return !s || s.k === 'Empty' || (s.k === 'Block' && s.stmts.length === 0);
}

rule({
  id: 'reflexive-collection-call', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S2114', ktRef: 'S2114',
  en: ['Collections should not be passed as arguments to their own methods', 'list.addAll(list) and similar calls either fail or have pointless results.', 'Pass the intended other collection.'],
  ko: ['컬렉션을 자기 메서드의 인자로 넘기면 안 됩니다', 'list.addAll(list) 같은 호출은 실패하거나 결과가 무의미합니다.', '의도한 다른 컬렉션을 넘기세요.'],
  msg: ['Remove or correct this "{0}" call.', '이 "{0}" 호출을 지우거나 고치세요.'],
  on: {
    Call(n, cx) {
      if (!/^(addAll|removeAll|retainAll|containsAll|equals)$/.test(n.id || '') || !n.o || n.args.length !== 1) return;
      if (n.id === 'equals') return;
      if (A.eq(n.o, n.args[0]) && pure(n.o)) cx.report(n, [n.id]);
    },
  },
  bad: { java: jm(`    list.addAll(list); // Noncompliant`), kt: km(`    val m = mutableListOf(1)
    m.addAll(m) // Noncompliant`) },
  good: { java: jm(`    java.util.List<String> copy = new java.util.ArrayList<>();
    copy.addAll(list);`), kt: km(`    val m = mutableListOf(1)
    m.addAll(listOf(2))`) },
});

rule({
  id: 'collection-arg-type-mismatch', type: 'B', sev: 'CR', debt: 15, tags: ['suspicious'], ref: 'S2175',
  en: ['Inappropriate "Collection" calls should not be made', 'Looking up or removing a value of an unrelated type never matches anything in the collection.', 'Convert the argument to the element type.'],
  ko: ['부적절한 Collection 호출을 하면 안 됩니다', '관련 없는 타입의 값으로 조회·삭제하면 컬렉션의 어떤 요소와도 일치하지 않습니다.', '인자를 요소 타입으로 변환하세요.'],
  msg: ['A "{0}<{1}>" cannot contain a "{2}".', '"{0}<{1}>"에는 "{2}"이(가) 들어 있을 수 없습니다.'],
  on: {
    Call(n, cx) {
      if (!/^(contains|remove|indexOf|lastIndexOf|get|containsKey|containsValue)$/.test(n.id || '') || !n.o || n.args.length !== 1) return;
      const rt = cx.typeOf(n.o);
      if (!rt) return;
      const args = cx.env.declaredArgs(n.o);
      if (!args) return;
      let elem;
      if (/Map$/.test(rt)) elem = n.id === 'containsValue' ? args[1] : (n.id === 'get' || n.id === 'containsKey' || n.id === 'remove') ? args[0] : null;
      else if (/(List|Set|Collection|Queue|Deque)$/.test(rt) && n.id !== 'get' && n.id !== 'containsKey' && n.id !== 'containsValue') elem = args[0];
      if (!elem || !VALUE_TYPES.includes(elem)) return;
      if (/List$/.test(rt) && n.id === 'remove') return; // remove(int) by index
      let at = cx.typeOf(n.args[0]);
      const prim = T.primOf(at);
      if (prim) at = { int: 'Integer', long: 'Long', short: 'Short', byte: 'Byte', char: 'Character', boolean: 'Boolean', float: 'Float', double: 'Double' }[prim];
      if (!at || !VALUE_TYPES.includes(at) || at === elem) return;
      cx.report(n, [rt, elem, at]);
    },
  },
  bad: { java: jm(`    java.util.Set<String> ids = new java.util.HashSet<>();
    Integer key = Integer.valueOf(n);
    if (ids.contains(key)) { n++; } // Noncompliant`) },
  good: { java: jm(`    java.util.Set<String> ids = new java.util.HashSet<>();
    Integer key = Integer.valueOf(n);
    if (ids.contains(String.valueOf(key))) { n++; }`) },
});

rule({
  id: 'optional-null', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'], ref: 'S2789',
  en: ['"null" should not be used with "Optional"', 'An Optional variable that is null defeats its purpose and causes NullPointerException in callers.', 'Return or assign Optional.empty() instead.'],
  ko: ['Optional에 null을 쓰면 안 됩니다', 'null인 Optional은 존재 이유를 없애고 호출자에서 NullPointerException을 일으킵니다.', '대신 Optional.empty()를 반환하거나 대입하세요.'],
  on: {
    Return(n, cx) {
      const m = cx.method;
      if (!m || !m.ret || !n.e || !A.isNull(n.e) || cx.enclosing(['Lambda'])) return;
      if (/^Optional/.test(A.typeName(m.ret))) cx.report(n);
    },
    Bin(n, cx) {
      if ((n.op === '==' || n.op === '!=') && (A.isNull(n.r) || A.isNull(n.l))) {
        const other = A.isNull(n.r) ? n.l : n.r;
        if (/^Optional/.test(cx.typeOf(other) || '')) cx.report(n);
      }
    },
  },
  bad: { java: jc(`  java.util.Optional<String> find(int k) {
    if (k > 0) { return java.util.Optional.of("x"); }
    return null; // Noncompliant
  }`) },
  good: { java: jc(`  java.util.Optional<String> find(int k) {
    if (k > 0) { return java.util.Optional.of("x"); }
    return java.util.Optional.empty();
  }`) },
});

rule({
  id: 'non-short-circuit', type: 'B', sev: 'MA', debt: 2, tags: ['suspicious'], ref: 'S2178',
  en: ['Short-circuit logic should be used in boolean contexts', '& and | always evaluate both sides; with a null check on the left, the right side can still throw.', 'Use && and ||.'],
  ko: ['불리언 문맥에서는 단락 평가를 써야 합니다', '&와 |는 항상 양쪽을 평가해 왼쪽에 null 검사가 있어도 오른쪽에서 예외가 날 수 있습니다.', '&&와 ||를 쓰세요.'],
  msg: ['Correct this "{0}" to "{0}{0}".', '이 "{0}"을(를) "{0}{0}"(으)로 고치세요.'],
  on: {
    Bin(n, cx) {
      if (n.op !== '&' && n.op !== '|') return;
      const p = cx.parent();
      if (!p || !((p.k === 'If' || p.k === 'While' || p.k === 'Do' || p.k === 'For' || p.k === 'Cond') && (p.c === n))) return;
      const isBool = (e) => { const t = cx.typeOf(e); return t === 'boolean' || t === 'Boolean'; };
      if (isBool(n.l) && isBool(n.r)) cx.report({ line: n.opLine || n.line, col: n.opCol || n.col }, [n.op]);
    },
  },
  bad: { java: jm(`    if (s != null & s.isEmpty()) { n++; } // Noncompliant`) },
  good: { java: jm(`    if (s != null && s.isEmpty()) { n++; }
    int mask = n & 4;`) },
});

rule({
  id: 'unary-operator-typo', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S2757', ktRef: 'S2757',
  en: ['Non-existent operators like "=+" should not be used', '"x =+ 1" assigns +1 instead of adding; the operator characters are transposed.', 'Write "+=" (or put a space: "= +1").'],
  ko: ['=+ 같은 없는 연산자를 쓰면 안 됩니다', '"x =+ 1"은 더하지 않고 +1을 대입하며 연산자 문자가 뒤바뀐 것입니다.', '"+="로 쓰세요(또는 "= +1"처럼 띄우세요).'],
  msg: ['Was "{0}=" meant instead?', '"{0}="을(를) 의도하셨나요?'],
  on: {
    Assign(n, cx) {
      if (n.op !== '=') return;
      const v = A.strip(n.v);
      if (!v) return;
      const opCh = v.k === 'Un' && !v.post ? v.op : (v.k === 'Lit' && v.neg ? '-' : null);
      if (!opCh || !['+', '-', '!'].includes(opCh)) return;
      const before = cx.src.slice(Math.max(0, n.v.s - 2), n.v.s);
      const after = cx.src.slice(n.v.s + 1, n.v.s + 2);
      if (before.endsWith('=') && /\s/.test(before[0] || ' ') && /\s/.test(after)) cx.report(n, [opCh]);
    },
  },
  bad: { java: jm(`    int total = 0;
    total =+ n; // Noncompliant
    System.out.println(total);`), kt: km(`    var total = 0
    total =- n // Noncompliant
    println(total)`) },
  good: { java: jm(`    int total = 0;
    total += n;
    total = -n;
    System.out.println(total);`), kt: km(`    var total = 0
    total -= n
    println(total)`) },
});

rule({
  id: 'increment-overwritten', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S2123',
  en: ['Values should not be uselessly incremented', 'i = i++ stores the old value back, so the increment is lost.', 'Write i++ or i = i + 1.'],
  ko: ['값을 쓸모없이 증가시키면 안 됩니다', 'i = i++는 옛 값을 다시 저장해 증가가 사라집니다.', 'i++나 i = i + 1로 쓰세요.'],
  on: {
    Assign(n, cx) {
      const v = A.strip(n.v);
      if (n.op === '=' && v && v.k === 'Un' && v.post && (v.op === '++' || v.op === '--') && A.eq(v.e, n.t)) cx.report(n);
    },
  },
  bad: { java: jm(`    int i = n;
    i = i++; // Noncompliant
    System.out.println(i);`) },
  good: { java: jm(`    int i = n;
    i++;
    System.out.println(i);`) },
});

rule({
  id: 'jdbc-index-zero', type: 'B', sev: 'BL', debt: 2, tags: ['sql'], ref: 'S2695',
  en: ['"PreparedStatement" and "ResultSet" methods should be called with valid indices', 'JDBC parameter and column indices start at 1; index 0 throws SQLException.', 'Start at 1.'],
  ko: ['PreparedStatement와 ResultSet 메서드는 유효한 인덱스로 호출해야 합니다', 'JDBC 매개변수와 컬럼 인덱스는 1부터 시작해 0이면 SQLException이 납니다.', '1부터 시작하세요.'],
  msg: ['"{0}" uses JDBC index 0; indices start at 1.', '"{0}"이(가) JDBC 인덱스 0을 씁니다. 인덱스는 1부터입니다.'],
  on: {
    Call(n, cx) {
      if (!n.o || !n.args.length || !/^(set|get|update)[A-Z]\w*$/.test(n.id || '')) return;
      const a0 = A.strip(n.args[0]);
      if (!a0 || a0.k !== 'Lit' || a0.t !== 'int' || a0.v !== 0) return;
      const t = cx.typeOf(n.o) || '';
      if (/^(PreparedStatement|CallableStatement|ResultSet)$/.test(t)) cx.report(n, [n.id]);
    },
  },
  bad: { java: jm(`    java.sql.PreparedStatement ps = null;
    ps.setString(0, s); // Noncompliant`) },
  good: { java: jm(`    java.sql.PreparedStatement ps = null;
    ps.setString(1, s);`) },
});

rule({
  id: 'infinite-recursion', langs: ['java', 'kt'], type: 'B', sev: 'BL', debt: 30, tags: ['suspicious'], ref: 'S2190', ktRef: 'S2190',
  en: ['Recursion should not be infinite', 'The method calls itself before any exit condition, so it always ends in StackOverflowError.', 'Add a base case before the recursive call.'],
  ko: ['재귀는 무한하면 안 됩니다', '메서드가 종료 조건보다 먼저 자기 자신을 호출해 항상 StackOverflowError로 끝납니다.', '재귀 호출 앞에 종료 조건을 넣으세요.'],
  on: {
    Method(n, cx) {
      if (!n.body || !n.body.stmts.length || n.ctor) return;
      const first = n.body.stmts[0];
      let e = null;
      if (first.k === 'ExprStmt') e = A.strip(first.e);
      else if (first.k === 'Return') e = A.strip(first.e);
      else if (first.k === 'Local' && first.vars.length === 1) e = A.strip(first.vars[0].init);
      if (!e) return;
      // unwrap simple arithmetic around the call: return 1 + f(x)
      while (e && e.k === 'Bin' && e.op !== '&&' && e.op !== '||' && e.op !== '?:') e = A.strip(A.strip(e.r).k === 'Call' ? e.r : e.l);
      if (!e || e.k !== 'Call' || e.id !== n.name || e.args.length !== n.params.length) return;
      if (e.o && !(A.strip(e.o).k === 'This')) return;
      if (n.params.length && e.args.some((a, i) => A.nameOf(a) !== n.params[i].name)) {
        // different arguments: still infinite (no base case), but overloads may differ — require same names
        return;
      }
      cx.report(e);
    },
  },
  bad: { java: jc(`  int depth(int x) {
    return depth(x); // Noncompliant
  }`), kt: kc(`  fun depth(x: Int): Int {
    return depth(x) // Noncompliant
  }`) },
  good: { java: jc(`  int depth(int x) {
    if (x <= 0) { return 0; }
    return 1 + depth(x - 1);
  }`), kt: kc(`  fun depth(x: Int): Int {
    if (x <= 0) return 0
    return 1 + depth(x - 1)
  }`) },
});

rule({
  id: 'iterator-next-no-exception', langs: ['java', 'kt'], type: 'B', sev: 'MI', debt: 5, tags: ['error-handling'], ref: 'S2272', ktRef: 'S2272',
  en: ['"Iterator.next()" methods should throw "NoSuchElementException"', 'The Iterator contract requires next() to throw NoSuchElementException when there are no more elements.', 'Check hasNext() in next() and throw NoSuchElementException.'],
  ko: ['Iterator.next()는 NoSuchElementException을 던져야 합니다', 'Iterator 계약상 next()는 요소가 없으면 NoSuchElementException을 던져야 합니다.', 'next()에서 hasNext()를 확인하고 NoSuchElementException을 던지세요.'],
  on: {
    Method(n, cx) {
      if (n.name !== 'next' || n.params.length || !n.body) return;
      const cls = cx.cls;
      if (!cls) return;
      const sup = H.superNames(cx, cls);
      if (!sup.has('Iterator') && !sup.has('ListIterator') && !sup.has('MutableIterator')) return;
      const ok = A.find(n.body, (x) => (x.k === 'Throw') || (x.k === 'Call' && (x.id === 'next' || x.id === 'hasNext' || x.id === 'nextElement' || x.id === 'remove' || x.id === 'pop' || x.id === 'get' || x.id === 'poll' || x.id === 'element')) || (x.k === 'Idx'));
      if (!ok) cx.report({ line: n.nameLine || n.line, col: n.nameCol || 1 });
    },
  },
  bad: { java: `class Counter implements java.util.Iterator<Integer> {
  private int i;
  public boolean hasNext() { return i < 10; }
  public Integer next() { // Noncompliant
    return i++;
  }
}
`, kt: `class Counter : Iterator<Int> {
    private var i = 0
    override fun hasNext() = i < 10
    override fun next(): Int { // Noncompliant
        return i++
    }
}
` },
  good: { java: `class Counter implements java.util.Iterator<Integer> {
  private int i;
  public boolean hasNext() { return i < 10; }
  public Integer next() {
    if (!hasNext()) { throw new java.util.NoSuchElementException(); }
    return i++;
  }
}
`, kt: `class Counter : Iterator<Int> {
    private var i = 0
    override fun hasNext() = i < 10
    override fun next(): Int {
        if (!hasNext()) throw NoSuchElementException()
        return i++
    }
}
` },
});

rule({
  id: 'iterator-hasnext-calls-next', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S1849',
  en: ['"Iterator.hasNext()" should not call "Iterator.next()"', 'hasNext() must not change state; calling next() inside it consumes an element.', 'Track the state without consuming elements in hasNext().'],
  ko: ['Iterator.hasNext()에서 Iterator.next()를 호출하면 안 됩니다', 'hasNext()는 상태를 바꾸면 안 되는데 그 안의 next() 호출은 요소를 소비합니다.', 'hasNext()에서 요소를 소비하지 말고 상태를 따로 추적하세요.'],
  on: {
    Method(n, cx) {
      if (n.name !== 'hasNext' || n.params.length || !n.body || !cx.cls) return;
      if (!H.superNames(cx, cx.cls).has('Iterator')) return;
      const c = H.findIn(n.body, (x) => x.k === 'Call' && x.id === 'next' && x.args.length === 0 && (!x.o || A.strip(x.o).k === 'This'));
      if (c) cx.report(c);
    },
  },
  bad: { java: `abstract class It implements java.util.Iterator<String> {
  public boolean hasNext() {
    return next() != null; // Noncompliant
  }
}
` },
  good: { java: `abstract class It implements java.util.Iterator<String> {
  private int i;
  public boolean hasNext() {
    return i < 3;
  }
}
` },
});

rule({
  id: 'stringbuilder-char-ctor', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'], ref: 'S1317',
  en: ['"StringBuilder" and "StringBuffer" should not be instantiated with a character', 'A char argument is widened to int and used as the capacity, not as the initial content.', 'Pass a String: new StringBuilder("x").'],
  ko: ['StringBuilder와 StringBuffer를 문자로 생성하면 안 됩니다', 'char 인자는 int로 넓혀져 초기 내용이 아니라 용량으로 쓰입니다.', '문자열을 넘기세요: new StringBuilder("x").'],
  on: {
    New(n, cx) {
      if (!/^(StringBuilder|StringBuffer)$/.test(A.typeName(n.type)) || n.args.length !== 1) return;
      if (A.isLit(n.args[0], 'char')) cx.report(n);
    },
  },
  bad: { java: jm(`    StringBuilder sb = new StringBuilder('a'); // Noncompliant`) },
  good: { java: jm(`    StringBuilder sb = new StringBuilder("a");`) },
});

rule({
  id: 'concurrent-modification', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 10, tags: ['suspicious'], ref: 'S7xxx'.replace('S7xxx', ''),
  en: ['Collections should not be modified while they are iterated', 'Adding or removing elements inside a for-each loop over the same collection throws ConcurrentModificationException.', 'Use Iterator.remove(), removeIf(), or collect changes and apply them after the loop.'],
  ko: ['순회 중인 컬렉션을 수정하면 안 됩니다', '같은 컬렉션을 도는 for-each 안에서 요소를 추가·삭제하면 ConcurrentModificationException이 납니다.', 'Iterator.remove(), removeIf()를 쓰거나 변경을 모아 루프 뒤에 적용하세요.'],
  msg: ['"{0}" is modified while it is being iterated.', '"{0}"을(를) 순회하는 중에 수정합니다.'],
  on: {
    ForEach(n, cx) {
      const coll = A.varKey(n.iter);
      if (!coll) return;
      const hits = [];
      const visit = (x, parentBlock, idx) => {
        if (!x || typeof x !== 'object') return;
        if (x.k === 'Lambda' || x.k === 'Class' || (x.k === 'New' && x.body)) return;
        if (x.k === 'Block') { x.stmts.forEach((s, i) => visit(s, x, i)); return; }
        if (x.k === 'ExprStmt') {
          const e = A.strip(x.e);
          if (e && e.k === 'Call' && /^(add|remove|clear|addAll|removeAll|put|retainAll)$/.test(e.id || '') && A.varKey(e.o) === coll) {
            const next = parentBlock && parentBlock.stmts[idx + 1];
            if (!(next && (next.k === 'Break' || next.k === 'Return' || next.k === 'Throw'))) hits.push(e);
          }
          return;
        }
        A.eachChild(x, (c) => visit(c, null, 0));
      };
      visit(n.body, null, 0);
      for (const h of hits) cx.report(h, [coll]);
    },
  },
  bad: { java: jm(`    for (String x : list) {
      if (x.isEmpty()) { list.remove(x); } // Noncompliant
    }`), kt: km(`    val items = mutableListOf("a", "")
    for (x in items) {
        if (x.isEmpty()) items.remove(x) // Noncompliant
    }`) },
  good: { java: jm(`    for (String x : list) {
      if (x.isEmpty()) { list.remove(x); break; }
    }
    list.removeIf(String::isEmpty);`), kt: km(`    val items = mutableListOf("a", "")
    items.removeAll { it.isEmpty() }`) },
});

rule({
  id: 'assert-side-effect', type: 'B', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S3346',
  en: ['Expressions used in "assert" should not produce side effects', 'Assertions are disabled in production, so the side effect silently disappears.', 'Do the work outside the assert and assert on the result.'],
  ko: ['assert 식에 부수 효과가 있으면 안 됩니다', '운영 환경에서는 assert가 꺼져 부수 효과가 조용히 사라집니다.', '작업은 assert 밖에서 하고 결과만 검사하세요.'],
  on: {
    Assert(n, cx) {
      const se = A.find(n.c, (x) => x.k === 'Assign' || (x.k === 'Un' && (x.op === '++' || x.op === '--')) || (x.k === 'Call' && /^(add|remove|put|poll|pop|push|clear|set|next|offer|delete|addAll|removeAll|take|incrementAndGet|getAndIncrement|compareAndSet)$/.test(x.id || '')));
      if (se) cx.report(n);
    },
  },
  bad: { java: jm(`    assert list.remove("x"); // Noncompliant`) },
  good: { java: jm(`    boolean removed = list.remove("x");
    assert removed;`) },
});

rule({
  id: 'getter-setter-wrong-field', type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'], ref: 'S4275',
  en: ['Getters and setters should access the expected fields', 'getX() returns, or setX() assigns, a different field although a field named x exists — usually a copy-paste error.', 'Use the matching field.'],
  ko: ['getter와 setter는 예상한 필드를 다뤄야 합니다', 'x라는 필드가 있는데 getX()가 다른 필드를 반환하거나 setX()가 다른 필드에 대입하며 대개 복사-붙여넣기 실수입니다.', '이름이 맞는 필드를 쓰세요.'],
  msg: ['Refactor this {0} so that it actually refers to the field "{1}".', '이 {0}이(가) 실제로 "{1}" 필드를 다루도록 고치세요.'],
  on: {
    Method(n, cx) {
      if (!n.body || n.body.stmts.length !== 1 || !cx.cls) return;
      const mm = /^(get|is|set)([A-Z]\w*)$/.exec(n.name);
      if (!mm) return;
      const fname = mm[2][0].toLowerCase() + mm[2].slice(1);
      const fields = H.classFields(cx.cls).map((f) => f.name);
      if (!fields.includes(fname)) return;
      const s = n.body.stmts[0];
      if (mm[1] !== 'set' && s.k === 'Return' && n.params.length === 0) {
        const k = A.varKey(s.e);
        const nm = k && k.replace(/^this\./, '');
        if (nm && nm !== fname && fields.includes(nm)) cx.report(s, ['getter', fname]);
      } else if (mm[1] === 'set' && n.params.length === 1 && s.k === 'ExprStmt') {
        const e = A.strip(s.e);
        if (e.k !== 'Assign' || e.op !== '=') return;
        const k = A.varKey(e.t);
        const nm = k && k.replace(/^this\./, '');
        if (nm && nm !== fname && fields.includes(nm) && A.nameOf(e.v) === n.params[0].name) cx.report(s, ['setter', fname]);
      }
    },
  },
  bad: { java: jc(`  private String first;
  private String last;
  public String getLast() {
    return first; // Noncompliant
  }`) },
  good: { java: jc(`  private String first;
  private String last;
  public String getLast() {
    return last;
  }`) },
});

rule({
  id: 'catch-illegal-monitor-state', type: 'B', sev: 'MA', debt: 2, tags: ['multi-threading'], ref: 'S2235',
  en: ['IllegalMonitorStateException should not be caught', 'This exception signals a programming error (calling wait/notify without the lock); catching it hides the bug.', 'Fix the synchronization instead of catching the exception.'],
  ko: ['IllegalMonitorStateException을 잡으면 안 됩니다', '이 예외는 잠금 없이 wait/notify를 부른 프로그래밍 오류를 뜻하며 잡으면 버그를 숨깁니다.', '예외를 잡지 말고 동기화를 고치세요.'],
  on: { Catch(n, cx) { if (n.types.some((t) => A.typeName(t) === 'IllegalMonitorStateException')) cx.report(n); } },
  bad: { java: jm(`    try { o.notify(); }
    catch (IllegalMonitorStateException e) { n++; } // Noncompliant`) },
  good: { java: jm(`    synchronized (o) { o.notify(); }`) },
});

rule({
  id: 'run-finalizers-on-exit', type: 'B', sev: 'CR', debt: 15, tags: ['cwe-586'], ref: 'S2151',
  en: ['"runFinalizersOnExit" should not be called', 'It is inherently unsafe (finalizers may run on live objects while other threads use them) and was removed from Java.', 'Use shutdown hooks or try-with-resources.'],
  ko: ['runFinalizersOnExit를 호출하면 안 됩니다', '다른 스레드가 쓰는 살아 있는 객체에 종료자가 돌 수 있어 본질적으로 안전하지 않고 Java에서 제거되었습니다.', '셧다운 훅이나 try-with-resources를 쓰세요.'],
  on: { Call(n, cx) { if (n.id === 'runFinalizersOnExit') cx.report(n); } },
  bad: { java: jm(`    System.runFinalizersOnExit(true); // Noncompliant`) },
  good: { java: jm(`    Runtime.getRuntime().addShutdownHook(new Thread(() -> {}));`) },
});

rule({
  id: 'string-format-mismatch', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 10, tags: ['pitfall'], ref: 'S2275', ktRef: 'S2275',
  en: ['Printf-style format strings should not lead to unexpected behavior at runtime', 'The format string needs more arguments than are passed (or has an invalid specifier), which throws at run time.', 'Pass one argument per specifier and use valid conversions.'],
  ko: ['printf 형식 문자열이 실행 중 예외를 일으키면 안 됩니다', '형식 문자열이 넘긴 것보다 많은 인자를 요구하거나 잘못된 지정자가 있어 실행 중 예외가 납니다.', '지정자마다 인자를 하나씩 넘기고 올바른 변환을 쓰세요.'],
  msg: ['{0}', '{1}'],
  on: {
    Call(n, cx) {
      const f = formatCall(n, cx);
      if (!f) return;
      const r = analyzeFormat(f.fmt);
      if (r.invalid) cx.report(n, [`"${r.invalid}" is not a valid format specifier.`, `"${r.invalid}"은(는) 올바른 형식 지정자가 아닙니다.`]);
      else if (r.need > f.argc) cx.report(n, [`Not enough arguments: the format needs ${r.need}, ${f.argc} given.`, `인자가 부족합니다: 형식은 ${r.need}개가 필요한데 ${f.argc}개를 넘겼습니다.`]);
    },
  },
  bad: { java: jm(`    String msg = String.format("%s has %d items", s); // Noncompliant`), kt: km(`    val msg = "%s has %d items".format(s) // Noncompliant`) },
  good: { java: jm(`    String msg = String.format("%s has %d items %n%%", s, n);`), kt: km(`    val msg = "%s has %d items".format(s, n)`) },
});

rule({
  id: 'format-extra-args', langs: ['java', 'kt'], type: 'S', sev: 'MA', debt: 10, tags: ['confusing'], ref: 'S3457', ktRef: 'S3457',
  en: ['Format strings should be used correctly', 'More arguments are passed than the format string uses; the extra values are silently dropped.', 'Remove the extra arguments or add the missing specifiers.'],
  ko: ['형식 문자열을 올바르게 써야 합니다', '형식 문자열이 쓰는 것보다 많은 인자를 넘겨 남는 값이 조용히 버려집니다.', '남는 인자를 지우거나 빠진 지정자를 넣으세요.'],
  msg: ['{0} arguments are passed but the format only uses {1}.', '인자 {0}개를 넘겼지만 형식은 {1}개만 씁니다.'],
  on: {
    Call(n, cx) {
      const f = formatCall(n, cx);
      if (!f) return;
      const r = analyzeFormat(f.fmt);
      if (!r.invalid && f.argc > r.need && !r.indexed) cx.report(n, [f.argc, r.need]);
    },
  },
  bad: { java: jm(`    String msg = String.format("%s items", s, n); // Noncompliant`), kt: km(`    val msg = "%s items".format(s, n) // Noncompliant`) },
  good: { java: jm(`    String msg = String.format("%s items", s);`), kt: km(`    val msg = "%s items".format(s)`) },
});

// format string + number of value arguments, or null
function formatCall(n, cx) {
  if (!n.id) return null;
  let fmtNode = null;
  let argc = 0;
  const rs = A.dotted(n.o);
  if ((n.id === 'format' && (A.simpleName(rs || '') === 'String' || (rs && /Formatter$/.test(cx.typeOf(n.o) || '')))) || (n.id === 'printf' && n.o) || (n.id === 'format' && n.o && /^(System\.out|System\.err)$/.test(rs || ''))) {
    let i = 0;
    if (n.args.length && !A.isStrLit(n.args[0]) && cx.typeOf(n.args[0]) === 'Locale') i = 1;
    fmtNode = n.args[i];
    argc = n.args.length - i - 1;
  } else if ((n.id === 'formatted' && n.o) || (cx.kt && n.id === 'format' && n.o && A.isStrLit(n.o))) {
    fmtNode = n.o;
    argc = n.args.length;
  } else return null;
  if (!fmtNode || !A.isStrLit(fmtNode)) return null;
  if (n.args.some((a) => a.spread)) return null;
  // a single array argument may be the varargs array
  if (argc === 1) { const t = cx.typeOf(n.args[n.args.length - 1]); if (t && t.endsWith('[]')) return null; }
  return { fmt: A.strip(fmtNode).v, argc };
}

function analyzeFormat(fmt) {
  const re = /%(\d+\$|<)?([-#+ 0,(]*)?(\d+)?(\.\d+)?([a-zA-Z%])/g;
  let need = 0;
  let maxIdx = 0;
  let ordinary = 0;
  let indexed = false;
  let invalid = null;
  let m;
  const valid = /^[bBhHsScCdoxXeEfgGaAtTn%]$/;
  // dangling % at end
  const stripped = fmt.replace(re, '');
  if (/%/.test(stripped)) invalid = '%' + (stripped.split('%')[1] || '').slice(0, 1);
  while ((m = re.exec(fmt))) {
    const conv = m[5];
    if (!valid.test(conv)) { invalid = invalid || m[0]; continue; }
    if (conv === 'n' || conv === '%') continue;
    if (conv === 't' || conv === 'T') re.lastIndex++;
    if (m[1] === '<') { indexed = true; continue; }
    if (m[1]) { indexed = true; maxIdx = Math.max(maxIdx, parseInt(m[1], 10)); continue; }
    ordinary++;
  }
  need = Math.max(ordinary, maxIdx);
  return { need, indexed, invalid };
}

rule({
  id: 'regex-syntax-error', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 10, tags: ['regex'], ref: 'S5856', ktRef: 'S5856',
  en: ['Regular expressions should be syntactically valid', 'The pattern does not compile and throws PatternSyntaxException at run time.', 'Fix the unbalanced group/class or the misplaced quantifier.'],
  ko: ['정규식은 문법적으로 올발라야 합니다', '패턴이 컴파일되지 않아 실행 중 PatternSyntaxException이 납니다.', '짝이 맞지 않는 그룹/문자 클래스나 잘못 놓인 수량자를 고치세요.'],
  msg: ['Fix the syntax error inside this regex: {0}.', '이 정규식의 문법 오류를 고치세요: {0}.'],
  on: {
    Call(n, cx) {
      const re = regexArg(n, cx);
      if (!re) return;
      const err = regexError(A.strip(re).v);
      if (err) cx.report(re, [err]);
    },
  },
  bad: { java: jm(`    java.util.regex.Pattern p = java.util.regex.Pattern.compile("(\\\\d+"); // Noncompliant`), kt: km(`    val r = Regex("[a-z") // Noncompliant`) },
  good: { java: jm(`    java.util.regex.Pattern p = java.util.regex.Pattern.compile("(\\\\d+)");`), kt: km(`    val r = Regex("[a-z]+")`) },
});

function regexArg(n, cx) {
  if (!n.id) return null;
  const rs = A.dotted(n.o);
  if (A.simpleName(rs || '') === 'Pattern' && (n.id === 'compile' || n.id === 'matches') && n.args.length >= 1 && A.isStrLit(n.args[0])) return n.args[0];
  if (n.o && /^(matches|replaceAll|replaceFirst|split)$/.test(n.id) && n.args.length >= 1 && A.isStrLit(n.args[0]) && !cx.kt) {
    const t = cx.typeOf(n.o);
    if (t === 'String' || A.isStrLit(n.o)) return n.args[0];
  }
  if (cx.kt && !n.o && n.id === 'Regex' && n.args.length >= 1 && A.isStrLit(n.args[0])) return n.args[0];
  if (cx.kt && n.id === 'toRegex' && A.isStrLit(n.o)) return n.o;
  return null;
}

function regexError(src) {
  let depth = 0;
  let inClass = false;
  let classLen = 0;
  let prevAtom = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      if (src[i + 1] === 'Q') { const e = src.indexOf('\\E', i + 2); i = e < 0 ? src.length : e + 1; prevAtom = true; continue; }
      i++;
      if (i >= src.length) return 'dangling backslash';
      prevAtom = true;
      if (inClass) classLen++;
      continue;
    }
    if (inClass) {
      if (c === ']' && classLen > 0) { inClass = false; prevAtom = true; continue; }
      if (c === '[' ) { /* nested class (Java union) */ }
      classLen++;
      continue;
    }
    if (c === '[') { inClass = true; classLen = src[i + 1] === '^' ? -1 : 0; if (src[i + 1] === '^') i++; classLen = 0; continue; }
    if (c === '(') { depth++; prevAtom = false; if (src[i + 1] === '?') { i++; } continue; }
    if (c === ')') { if (depth === 0) return 'unmatched closing parenthesis'; depth--; prevAtom = true; continue; }
    if (c === '|') { prevAtom = false; continue; }
    if (c === '*' || c === '+' || c === '?') {
      if (!prevAtom) return `dangling meta character '${c}'`;
      // lazy / possessive suffix
      if (src[i + 1] === '?' || src[i + 1] === '+') i++;
      prevAtom = false;
      continue;
    }
    if (c === '{' && /^\{\d+(,\d*)?\}/.test(src.slice(i))) {
      if (!prevAtom) return "dangling meta character '{'";
      i = src.indexOf('}', i);
      if (src[i + 1] === '?' || src[i + 1] === '+') i++;
      prevAtom = false;
      continue;
    }
    if (c === '^' || c === '$') { prevAtom = false; continue; }
    prevAtom = true;
  }
  if (inClass) return 'unclosed character class';
  if (depth > 0) return 'unclosed group';
  return null;
}

rule({
  id: 'toast-not-shown', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 2, tags: ['android'],
  en: ['"Toast.makeText()" results should be shown', 'makeText() only builds the Toast; without show() nothing appears.', 'Call .show() on the result.'],
  ko: ['Toast.makeText() 결과는 show()해야 합니다', 'makeText()는 Toast를 만들기만 해 show() 없이는 아무것도 보이지 않습니다.', '결과에 .show()를 호출하세요.'],
  on: {
    ExprStmt(n, cx) {
      const e = A.strip(n.e);
      if (e && e.k === 'Call' && e.id === 'makeText' && A.dotted(e.o) === 'Toast') cx.report(e);
    },
  },
  bad: { java: jm(`    android.widget.Toast.makeText(null, "saved", 0); // Noncompliant`).replace('android.widget.Toast.makeText', 'Toast.makeText'), kt: km(`    Toast.makeText(null, "saved", 0) // Noncompliant`) },
  good: { java: jm(`    Toast.makeText(null, "saved", 0).show();`), kt: km(`    Toast.makeText(null, "saved", 0).show()`) },
});

rule({
  id: 'prefs-edit-not-applied', langs: ['java', 'kt'], type: 'B', sev: 'MA', debt: 2, tags: ['android'],
  en: ['SharedPreferences edits should be committed', 'Changes made through edit() are discarded unless apply() or commit() is called.', 'End the chain with apply() (or commit()).'],
  ko: ['SharedPreferences 변경은 커밋해야 합니다', 'edit()로 한 변경은 apply()나 commit()을 부르지 않으면 버려집니다.', '체인을 apply()(또는 commit())로 끝내세요.'],
  on: {
    ExprStmt(n, cx) {
      const e = A.strip(n.e);
      if (!e || e.k !== 'Call' || !/^(put\w+|remove|clear)$/.test(e.id || '')) return;
      const hasEdit = A.find(e.o, (x) => x.k === 'Call' && x.id === 'edit' && x.args.length === 0);
      if (hasEdit) cx.report(e);
    },
  },
  bad: { java: jm(`    android.content.SharedPreferences prefs = null;
    prefs.edit().putString("k", s); // Noncompliant`), kt: km(`    val prefs: android.content.SharedPreferences? = null
    prefs!!.edit().putString("k", s) // Noncompliant`) },
  good: { java: jm(`    android.content.SharedPreferences prefs = null;
    prefs.edit().putString("k", s).apply();`), kt: km(`    val prefs: android.content.SharedPreferences? = null
    prefs!!.edit().putString("k", s).apply()`) },
});

rule({
  id: 'serial-methods-signature', type: 'B', sev: 'MA', debt: 5, tags: ['serialization'], ref: 'S2061',
  en: ['Custom serialization method signatures should meet requirements', 'writeObject/readObject/readObjectNoData are found by reflection only when they are private with the exact signature.', 'Declare them private void with the documented parameters.'],
  ko: ['사용자 직렬화 메서드 시그니처는 요구 사항을 지켜야 합니다', 'writeObject/readObject/readObjectNoData는 정확한 시그니처의 private일 때만 리플렉션으로 찾습니다.', '문서에 나온 매개변수로 private void로 선언하세요.'],
  msg: ['Make "{0}" "private".', '"{0}"을(를) private으로 하세요.'],
  on: {
    Method(n, cx) {
      if (!/^(writeObject|readObject|readObjectNoData)$/.test(n.name) || !cx.cls || n.lang === 'kt') return;
      const want = n.name === 'writeObject' ? 'ObjectOutputStream' : n.name === 'readObject' ? 'ObjectInputStream' : null;
      if (want ? !(n.params.length === 1 && A.typeName(n.params[0].type) === want) : n.params.length !== 0) return;
      if (!H.implementsAny(cx, cx.cls, ['Serializable'])) return;
      if (!n.mods.has('private')) cx.report({ line: n.nameLine || n.line, col: n.nameCol || 1 }, [n.name]);
    },
  },
  bad: { java: `class T implements java.io.Serializable {
  private static final long serialVersionUID = 1L;
  public void writeObject(java.io.ObjectOutputStream out) throws java.io.IOException { // Noncompliant
    out.defaultWriteObject();
  }
}
` },
  good: { java: `class T implements java.io.Serializable {
  private static final long serialVersionUID = 1L;
  private void writeObject(java.io.ObjectOutputStream out) throws java.io.IOException {
    out.defaultWriteObject();
  }
}
` },
});

rule({
  id: 'non-serializable-field', type: 'B', sev: 'CR', debt: 30, tags: ['serialization', 'cwe-594'], ref: 'S1948',
  en: ['Fields in a "Serializable" class should either be transient or serializable', 'Serializing the object fails with NotSerializableException when this field holds a non-serializable value.', 'Mark the field transient or make its type Serializable.'],
  ko: ['Serializable 클래스의 필드는 transient이거나 직렬화 가능해야 합니다', '이 필드가 직렬화할 수 없는 값을 가지면 객체 직렬화가 NotSerializableException으로 실패합니다.', '필드를 transient로 하거나 타입을 Serializable로 만드세요.'],
  msg: ['Make "{0}" transient or serializable.', '"{0}"을(를) transient로 하거나 직렬화 가능하게 하세요.'],
  on: {
    Field(n, cx) {
      const cls = cx.cls;
      if (!cls || n.lang === 'kt' || H.isStatic(n) || n.mods.has('transient') || !n.type || n.type.prim || n.type.dims) return;
      if (!H.implementsAny(cx, cls, ['Serializable'])) return;
      const t = A.typeName(n.type);
      let bad = /^(Thread|Socket|ServerSocket|InputStream|OutputStream|Reader|Writer|Connection|Statement|ResultSet|ExecutorService|Executor|Lock|ReentrantLock|Semaphore|DataSource|Logger)$/.test(t) && !(t === 'Logger' && false);
      if (!bad) {
        const info = cx.proj.info(t);
        if (info && info.kind === 'class' && info.decl.lang !== 'kt') {
          const sup = cx.proj.allSuperNames(info);
          const externalSuper = [...sup].some((s) => !cx.proj.info(s) && s !== 'Object');
          if (!sup.has('Serializable') && !sup.has('Externalizable') && !externalSuper) bad = true;
        }
      }
      if (bad) for (const v of n.vars) cx.report(v, [v.name]);
    },
  },
  bad: { java: `class Address { String city; }
class Person implements java.io.Serializable {
  private static final long serialVersionUID = 1L;
  private Address address; // Noncompliant
}
` },
  good: { java: `class Address implements java.io.Serializable { private static final long serialVersionUID = 1L; String city; }
class Person implements java.io.Serializable {
  private static final long serialVersionUID = 1L;
  private Address address;
  private transient Thread worker;
}
` },
});

module.exports = { pure, analyzeFormat, regexError, intConst };
