'use strict';

// Kotlin idioms, null safety and coroutines (Kotlin reference analyzer scope), plus a few
// general rules that apply to Java and Kotlin alike (S106, S112, S1135 ...).

const { rule, jm, jc, km, kc } = require('./core');
const A = require('../ast');
const H = require('./h');

const KT = ['kt'];
const JK = ['java', 'kt'];
const PRIM_ARRAYS = { Int: 'IntArray', Long: 'LongArray', Short: 'ShortArray', Byte: 'ByteArray', Char: 'CharArray', Boolean: 'BooleanArray', Float: 'FloatArray', Double: 'DoubleArray' };
const COROUTINE_BUILDERS = ['launch', 'async', 'withContext', 'runBlocking', 'flowOn', 'produce', 'actor', 'CoroutineScope', 'launchIn', 'future', 'promise'];

function opPos(n) {
  return { line: n.opLine || n.line, col: n.opCol || n.col };
}

function namePos(n) {
  return { line: n.nameLine || n.line, col: n.nameCol || n.col };
}

function isSuspend(m) {
  return !!(m && m.mods && m.mods.has('suspend'));
}

// Inside a suspend function or a coroutine builder lambda?
function inCoroutine(cx) {
  for (let i = cx.stack.length - 2; i >= 0; i--) {
    const x = cx.stack[i];
    if (x.k === 'Lambda') {
      const p = cx.stack[i - 1];
      if (p && p.k === 'Call' && ['launch', 'async', 'withContext', 'coroutineScope', 'supervisorScope', 'flow', 'channelFlow', 'produce', 'runTest'].includes(p.id)) return p.id;
      continue;
    }
    if (x.k === 'Method' || x.k === 'LocalFun') return isSuspend(x.fn || x) ? 'suspend fun' : null;
    if (x.k === 'Class') return null;
  }
  return null;
}

// Kotlin expression whose static type is certainly non-null.
function nonNull(cx, e) {
  e = A.strip(e);
  if (!e) return false;
  if (e.k === 'Lit') return e.t !== 'null';
  if (e.k === 'Tmpl' || e.k === 'This') return true;
  if (e.k === 'Call' && A.ctorType(e) && !e.safe) return true;
  if (e.k === 'Call' && !e.o && /^(listOf|mutableListOf|setOf|mutableSetOf|mapOf|mutableMapOf|arrayOf|emptyList|emptyMap|emptySet|buildString|buildList)$/.test(e.id)) return true;
  if (e.k !== 'Name') return false;
  const l = cx.env.locals.get(e.id);
  if (!l) return false;
  if (l.kind === 'param') return !!(l.type && !l.type.nullable && l.decl && l.decl.k === 'Param' && !l.decl.varargs && cx.method && (cx.method.params || []).includes(l.decl));
  if (l.kind === 'local' && l.decl && l.decl.k === 'Var') {
    if (l.type) return !l.type.nullable;
    if (!cx.method || !cx.method.body) return false;
    const loc = cx.method && A.find(cx.method.body, (x) => x.k === 'Local' && x.vars.includes(l.decl));
    if (!loc || loc.delegate) return false;
    if (loc.mutable && A.find(cx.method.body, (x) => x.k === 'Assign' && A.varKey(x.t) === e.id)) return false;
    return !!l.init && nonNull(cx, l.init);
  }
  return false;
}

// ── null safety ──
rule({
  id: 'not-null-assertion', langs: KT, type: 'S', sev: 'MA', debt: 5, tags: ['null-safety'],
  en: ['The not-null assertion operator "!!" should not be used', '"!!" turns a nullable value into a NullPointerException at run time and gives up the compile-time null safety Kotlin provides.', 'Handle null explicitly with ?., ?:, let, requireNotNull(...) with a message, or make the value non-nullable.'],
  ko: ['널 아님 단언 연산자 !!를 쓰면 안 됩니다', '!!는 널 가능 값을 실행 시점의 NullPointerException으로 바꿔 Kotlin이 주는 컴파일 시점 널 안전성을 포기합니다.', '?., ?:, let, 메시지를 준 requireNotNull(...)로 null을 명시적으로 처리하거나 값을 널 불가 타입으로 만드세요.'],
  msg: ['Remove this "!!" on "{0}" and handle the null case.', '"{0}"의 !!를 없애고 null인 경우를 처리하세요.'],
  on: {
    Un(n, cx) {
      if (n.op !== '!!' || nonNull(cx, n.e)) return;
      cx.report(opPos(n), [cx.short(n.e, 30)]);
    },
  },
  bad: { kt: km(`    val name: String? = o as? String
    println(name!!.length) // Noncompliant`) },
  good: { kt: km(`    val name: String? = o as? String
    println(name?.length ?: 0)`) },
});

rule({
  id: 'useless-null-check', langs: KT, type: 'S', sev: 'MA', debt: 2, tags: ['null-safety', 'redundant'], ref: 'S6619',
  en: ['Null checks should not be made on non-nullable values', 'Using ?., ?:, !! or a null comparison on a value whose type is not nullable has no effect and suggests a misunderstanding of the types.', 'Remove the null handling, or change the type to nullable if null is really possible.'],
  ko: ['널이 될 수 없는 값에 null 검사를 하면 안 됩니다', '널 불가 타입의 값에 ?., ?:, !!, null 비교를 쓰면 효과가 없고 타입을 잘못 이해한 것으로 보입니다.', 'null 처리를 지우거나 정말 null일 수 있다면 타입을 널 가능으로 바꾸세요.'],
  msg: ['"{0}" is not nullable; remove this useless "{1}".', '"{0}"은(는) 널이 될 수 없습니다. 쓸모없는 "{1}"을(를) 지우세요.'],
  on: {
    Sel(n, cx) { if (n.safe && nonNull(cx, n.o)) cx.report(n, [cx.short(n.o, 30), '?.']); },
    Call(n, cx) { if (n.safe && n.o && nonNull(cx, n.o)) cx.report(n, [cx.short(n.o, 30), '?.']); },
    Bin(n, cx) {
      if (n.op === '?:' && nonNull(cx, n.l)) { cx.report(opPos(n), [cx.short(n.l, 30), '?:']); return; }
      if ((n.op === '==' || n.op === '!=') && (A.isNull(n.r) || A.isNull(n.l))) {
        const v = A.isNull(n.r) ? n.l : n.r;
        if (nonNull(cx, v)) cx.report(opPos(n), [cx.short(v, 30), n.op + ' null']);
      }
    },
    Un(n, cx) { if (n.op === '!!' && nonNull(cx, n.e)) cx.report(opPos(n), [cx.short(n.e, 30), '!!']); },
  },
  bad: { kt: km(`    val len = s?.length // Noncompliant
    val name = "fixed"
    val shown = name ?: "none" // Noncompliant
    if (s != null) println(s) // Noncompliant`) },
  good: { kt: km(`    val len = s.length
    val other = o as? String
    val shown = other ?: "none"
    if (o != null) println(o)`) },
});

function enumConsts(cx, name) {
  const info = cx.proj.info(name);
  return info && info.kind === 'enum' ? (info.decl.enumConsts || []).map((c) => c.name) : null;
}

rule({
  id: 'when-without-else', langs: KT, type: 'S', sev: 'MA', debt: 5, tags: ['cert'], ref: 'S131',
  en: ['"when" statements should have an "else" branch', 'A "when" statement over values that are not covered exhaustively silently does nothing for the missing cases, which hides new or unexpected values.', 'Add an else branch, even if it only throws or logs.'],
  ko: ['when 문에는 else 분기가 있어야 합니다', '모든 값을 다루지 않는 when 문은 빠진 경우에 조용히 아무것도 하지 않아 새 값이나 예상 밖의 값을 감춥니다.', '예외를 던지거나 기록만 하더라도 else 분기를 추가하세요.'],
  on: {
    Switch(n, cx) {
      if (!n.kt || n.expr || !n.sel || n.cases.some((c) => c.dflt)) return;
      const labels = [].concat(...n.cases.map((c) => c.labels));
      if (!labels.length || labels.some((l) => l.k === 'IsPat')) return;
      const t = (cx.typeOf(n.sel) || '').replace(/\?$/, '');
      if (t === 'Boolean') return;
      let report = labels.every((l) => A.isLit(l) || l.k === 'Tmpl' || l.k === 'InPat') || /^(Int|Long|Short|Byte|Char|String)$/.test(t);
      if (!report) {
        const names = labels.map((l) => (A.strip(l).k === 'Sel' ? A.strip(l).id : A.strip(l).k === 'Name' ? A.strip(l).id : null));
        if (names.some((x) => !x)) return;
        const owner = t || (A.strip(labels[0]).k === 'Sel' ? A.simpleName(A.dotted(A.strip(labels[0]).o) || '') : '');
        const all = owner && enumConsts(cx, owner);
        report = !!all && all.some((c) => !names.includes(c));
      }
      if (report) cx.report(n);
    },
  },
  bad: { kt: `enum class Color { RED, GREEN, BLUE }
fun f(c: Color, code: Int) {
  when (c) { // Noncompliant
    Color.RED -> println("r")
    Color.GREEN -> println("g")
  }
  when (code) { // Noncompliant
    1 -> println("one")
  }
}
` },
  good: { kt: `enum class Color { RED, GREEN, BLUE }
fun f(c: Color, code: Int) {
  when (c) {
    Color.RED -> println("r")
    Color.GREEN -> println("g")
    Color.BLUE -> println("b")
  }
  when (code) {
    1 -> println("one")
    else -> println("other")
  }
}
` },
});

rule({
  id: 'var-could-be-val', langs: KT, type: 'S', sev: 'MI', debt: 2, tags: ['convention'],
  en: ['Local variables that are never reassigned should be declared "val"', 'A "var" that is assigned only once suggests that it changes; "val" documents and enforces that it does not.', 'Declare the variable with "val".'],
  ko: ['다시 대입하지 않는 지역 변수는 val로 선언해야 합니다', '한 번만 대입하는 var는 바뀌는 것처럼 보이게 합니다. val은 바뀌지 않음을 드러내고 강제합니다.', '변수를 val로 선언하세요.'],
  msg: ['Replace the keyword "var" with "val" for "{0}".', '"{0}"의 var를 val로 바꾸세요.'],
  on: {
    Local(n, cx) {
      if (!n.mutable || n.delegate || !cx.method || !cx.method.body) return;
      for (const v of n.vars) {
        if (!v.init) continue;
        const name = v.name;
        const written = A.find(cx.method.body, (x) => (x.k === 'Assign' && A.varKey(x.t) === name) || (x.k === 'Un' && (x.op === '++' || x.op === '--') && A.varKey(x.e) === name));
        if (!written) cx.report(v, [name]);
      }
    },
  },
  bad: { kt: km(`    var total = n * 2 // Noncompliant
    println(total)`) },
  good: { kt: km(`    var total = n * 2
    total += 1
    val label = "x"
    var count = 0
    list.forEach { count++ }
    println(total + count + label.length)`) },
});

rule({
  id: 'data-class-array-property', langs: KT, type: 'B', sev: 'MA', debt: 10, tags: ['pitfall'], ref: 'S6218',
  en: ['Data classes with array properties should override equals, hashCode and toString', 'The generated methods of a data class compare and print arrays by identity, so two instances with equal contents are not equal.', 'Override equals/hashCode/toString using contentEquals/contentHashCode/contentToString, or use a List.'],
  ko: ['배열 속성이 있는 data class는 equals, hashCode, toString을 재정의해야 합니다', 'data class가 만드는 메서드는 배열을 식별자로 비교하고 출력해 내용이 같은 두 인스턴스가 같지 않다고 나옵니다.', 'contentEquals/contentHashCode/contentToString으로 equals/hashCode/toString을 재정의하거나 List를 쓰세요.'],
  msg: ['Override "equals", "hashCode" and "toString" to take the array property "{0}" into account.', '배열 속성 "{0}"을(를) 반영하도록 equals, hashCode, toString을 재정의하세요.'],
  on: {
    Class(n, cx) {
      if (!(n.mods && n.mods.has('data'))) return;
      if (H.findMethod(n, 'equals', 1) && H.findMethod(n, 'hashCode', 0)) return;
      for (const p of n.params) {
        const t = A.typeName(p.type);
        if (p.prop && (t === 'Array' || Object.values(PRIM_ARRAYS).includes(t))) cx.report(p, [p.name]);
      }
    },
  },
  bad: { kt: `data class Packet(val id: Int, val payload: ByteArray) // Noncompliant
` },
  good: { kt: `data class Packet(val id: Int, val payload: List<Byte>)
data class Frame(val bytes: ByteArray) {
  override fun equals(other: Any?) = other is Frame && bytes.contentEquals(other.bytes)
  override fun hashCode() = bytes.contentHashCode()
}
` },
});

rule({
  id: 'data-class-mutable-property', langs: KT, type: 'S', sev: 'MI', debt: 5, tags: ['design'],
  en: ['Data class properties should be immutable', 'Mutating a property of a data class changes its hashCode, which corrupts hash-based collections that contain it, and makes copies share confusing state.', 'Declare the properties with "val" and use copy() to derive changed instances.'],
  ko: ['data class 속성은 불변이어야 합니다', 'data class 속성을 바꾸면 hashCode가 바뀌어 이를 담은 해시 컬렉션이 망가지고 복사본 사이의 상태가 헷갈립니다.', '속성을 val로 선언하고 바뀐 인스턴스는 copy()로 만드세요.'],
  msg: ['Make the data class property "{0}" a "val".', 'data class 속성 "{0}"을(를) val로 만드세요.'],
  on: {
    Class(n, cx) {
      if (!(n.mods && n.mods.has('data'))) return;
      for (const p of n.params) if (p.prop === 'var') cx.report(p, [p.name]);
    },
  },
  bad: { kt: `data class User(val id: Long, var name: String) // Noncompliant
` },
  good: { kt: `data class User(val id: Long, val name: String)
` },
});

// ── coroutines ──
rule({
  id: 'global-scope', langs: KT, type: 'S', sev: 'CR', debt: 10, tags: ['coroutines'], ref: 'S6311',
  en: ['"GlobalScope" should not be used', 'Coroutines started in GlobalScope are not bound to any lifecycle; they are never cancelled with their caller and leak work and resources.', 'Launch in a scope tied to a lifecycle (viewModelScope, lifecycleScope, an injected CoroutineScope) or use coroutineScope { }.'],
  ko: ['GlobalScope를 쓰면 안 됩니다', 'GlobalScope에서 시작한 코루틴은 어떤 생명주기에도 묶이지 않아 호출자와 함께 취소되지 않고 작업과 자원이 샙니다.', '생명주기에 묶인 범위(viewModelScope, lifecycleScope, 주입한 CoroutineScope)에서 시작하거나 coroutineScope { }를 쓰세요.'],
  on: { Call(n, cx) { if (n.o && A.dotted(n.o) === 'GlobalScope') cx.report(n); } },
  bad: { kt: km(`    GlobalScope.launch { println(s) } // Noncompliant`) },
  good: { kt: `class Loader(private val scope: CoroutineScope) {
  fun load(s: String) { scope.launch { println(s) } }
}
` },
});

rule({
  id: 'run-blocking-in-coroutine', langs: KT, type: 'B', sev: 'MA', debt: 5, tags: ['coroutines'], ref: 'S6307',
  en: ['"runBlocking" should not be used inside coroutines', 'runBlocking blocks the current thread until its body completes; inside a suspend function or another coroutine it wastes a thread and can deadlock a single-threaded dispatcher.', 'Call the suspending code directly, or use coroutineScope / withContext.'],
  ko: ['코루틴 안에서 runBlocking을 쓰면 안 됩니다', 'runBlocking은 본문이 끝날 때까지 현재 스레드를 막아 suspend 함수나 다른 코루틴 안에서는 스레드를 낭비하고 단일 스레드 디스패처를 교착시킬 수 있습니다.', '중단 코드를 직접 호출하거나 coroutineScope / withContext를 쓰세요.'],
  msg: ['Remove "runBlocking" from this {0}.', '이 {0}에서 runBlocking을 없애세요.'],
  on: {
    Call(n, cx) {
      if (n.id !== 'runBlocking' || n.o) return;
      const where = inCoroutine(cx);
      if (where) cx.report(n, [where]);
    },
  },
  bad: { kt: `suspend fun load(api: Api): String {
  return runBlocking { api.fetch() } // Noncompliant
}
` },
  good: { kt: `suspend fun load(api: Api): String {
  return api.fetch()
}
fun main() {
  runBlocking { println("start") }
}
` },
});

rule({
  id: 'hardcoded-dispatcher', langs: KT, type: 'S', sev: 'MI', debt: 10, tags: ['coroutines', 'tests'], ref: 'S6310',
  en: ['Dispatchers should be injected', 'A dispatcher hard-coded in coroutine builders cannot be replaced by a test dispatcher, which makes the code slow and non-deterministic to test.', 'Inject the CoroutineDispatcher (with a default value if needed) and use the injected one.'],
  ko: ['디스패처는 주입해야 합니다', '코루틴 빌더에 디스패처를 하드코딩하면 테스트 디스패처로 바꿀 수 없어 테스트가 느리고 비결정적이 됩니다.', 'CoroutineDispatcher를 주입하고(필요하면 기본값과 함께) 주입한 것을 쓰세요.'],
  msg: ['Avoid hardcoded dispatcher "Dispatchers.{0}"; inject it instead.', '하드코딩한 디스패처 "Dispatchers.{0}" 대신 주입한 것을 쓰세요.'],
  on: {
    Sel(n, cx) {
      if (A.dotted(n.o) !== 'Dispatchers' || !/^(IO|Default|Unconfined)$/.test(n.id)) return;
      const p = cx.parent(1);
      if (p && p.k === 'Call' && COROUTINE_BUILDERS.includes(p.id) && p.args.includes(n)) cx.report(n, [n.id]);
    },
  },
  bad: { kt: `class Repo(private val api: Api) {
  suspend fun load() = withContext(Dispatchers.IO) { api.fetch() } // Noncompliant
}
` },
  good: { kt: `class Repo(private val api: Api, private val io: CoroutineDispatcher = Dispatchers.IO) {
  suspend fun load() = withContext(io) { api.fetch() }
}
` },
});

rule({
  id: 'suspend-returning-flow', langs: KT, type: 'S', sev: 'MA', debt: 5, tags: ['coroutines'], ref: 'S6309',
  en: ['Functions returning "Flow" should not be suspending', 'A Flow is cold and only does work when collected; making its factory function suspend forces callers into a coroutine for nothing and hints at work done eagerly outside the flow.', 'Remove the suspend modifier and move the suspending work inside the flow builder.'],
  ko: ['Flow를 돌려주는 함수는 suspend이면 안 됩니다', 'Flow는 수집할 때만 동작하는 차가운 스트림이라 이를 만드는 함수를 suspend로 하면 호출자가 괜히 코루틴에 들어가야 하고 흐름 밖에서 미리 일하는 것처럼 보입니다.', 'suspend를 지우고 중단 작업은 flow 빌더 안으로 옮기세요.'],
  on: {
    Method(n, cx) {
      if (isSuspend(n) && n.ret && /^(Flow|StateFlow|SharedFlow|MutableStateFlow|MutableSharedFlow)$/.test(A.typeName(n.ret))) cx.report(namePos(n));
    },
  },
  bad: { kt: `suspend fun prices(): Flow<Int> = flow { emit(1) } // Noncompliant
` },
  good: { kt: `fun prices(): Flow<Int> = flow { emit(1) }
` },
});

rule({
  id: 'coroutine-scope-receiver-suspend', langs: KT, type: 'S', sev: 'MA', debt: 5, tags: ['coroutines'], ref: 'S6312',
  en: ['"CoroutineScope" extension functions should not be suspending', 'A CoroutineScope extension launches work in the scope and returns immediately; also declaring it suspend mixes two conventions and confuses callers about when the work completes.', 'Either make it a suspend function without the CoroutineScope receiver (using coroutineScope { }), or a non-suspending scope extension.'],
  ko: ['CoroutineScope 확장 함수는 suspend이면 안 됩니다', 'CoroutineScope 확장 함수는 범위에서 작업을 시작하고 바로 돌아오는데 suspend까지 붙이면 두 관례가 섞여 작업이 언제 끝나는지 헷갈립니다.', 'CoroutineScope 수신자 없는 suspend 함수(coroutineScope { } 사용)나 suspend 아닌 확장 함수 중 하나로 만드세요.'],
  on: {
    Method(n, cx) { if (isSuspend(n) && n.recv && A.typeName(n.recv) === 'CoroutineScope') cx.report(namePos(n)); },
  },
  bad: { kt: `suspend fun CoroutineScope.refresh(api: Api) { // Noncompliant
  launch { api.fetch() }
}
` },
  good: { kt: `fun CoroutineScope.refresh(api: Api) {
  launch { api.fetch() }
}
suspend fun refreshAll(api: Api) = coroutineScope { launch { api.fetch() } }
` },
});

rule({
  id: 'async-result-unused', langs: KT, type: 'B', sev: 'MA', debt: 5, tags: ['coroutines'],
  en: ['The result of "async" should be awaited', 'async returns a Deferred whose exception is only rethrown by await(); when the result is dropped, failures are lost and "launch" was meant.', 'Call await() on the Deferred, or use launch for fire-and-forget work.'],
  ko: ['async의 결과는 await해야 합니다', 'async는 await()에서만 예외를 다시 던지는 Deferred를 돌려주므로 결과를 버리면 실패가 사라지며 실제로는 launch가 맞습니다.', 'Deferred에 await()를 호출하거나 결과가 필요 없으면 launch를 쓰세요.'],
  on: {
    ExprStmt(n, cx) {
      const e = A.strip(n.e);
      if (!e || e.k !== 'Call' || e.id !== 'async' || !e.trailing) return;
      const p = cx.parent(1);
      if (p && p.k === 'Block') {
        const lam = cx.parent(2);
        if (lam && lam.k === 'Lambda' && p.stmts[p.stmts.length - 1] === n) return;
      }
      cx.report(e);
    },
  },
  bad: { kt: `class Sync(private val scope: CoroutineScope) {
  fun run(api: Api) {
    scope.async { api.upload() } // Noncompliant
  }
}
` },
  good: { kt: `class Sync(private val scope: CoroutineScope) {
  fun run(api: Api) {
    scope.launch { api.upload() }
  }
  suspend fun both(api: Api) = coroutineScope {
    val a = async { api.fetch() }
    a.await()
  }
}
` },
});

rule({
  id: 'job-passed-to-builder', langs: KT, type: 'B', sev: 'MA', debt: 5, tags: ['coroutines'],
  en: ['"Job" or "SupervisorJob" should not be passed to coroutine builders', 'Passing a new Job() to launch, async or withContext breaks structured concurrency: the coroutine is no longer a child of its scope, so it is not cancelled with it and failures are not propagated.', 'Remove the Job argument; use supervisorScope { } or a dedicated scope when different failure handling is needed.'],
  ko: ['Job이나 SupervisorJob을 코루틴 빌더에 넘기면 안 됩니다', 'launch, async, withContext에 새 Job()을 넘기면 구조적 동시성이 깨져 코루틴이 범위의 자식이 아니게 되므로 함께 취소되지 않고 실패도 전파되지 않습니다.', 'Job 인자를 지우고 다른 실패 처리가 필요하면 supervisorScope { }나 별도 범위를 쓰세요.'],
  on: {
    Call(n, cx) {
      if (!['launch', 'async', 'withContext'].includes(n.id)) return;
      const bad = n.args.some((a) => A.find(a, (x) => x.k === 'Call' && !x.o && (x.id === 'Job' || x.id === 'SupervisorJob'), { noLambda: true }));
      if (bad) cx.report(n);
    },
  },
  bad: { kt: `class Sync(private val scope: CoroutineScope) {
  fun run(api: Api) {
    scope.launch(SupervisorJob()) { api.upload() } // Noncompliant
  }
}
` },
  good: { kt: `class Sync(private val scope: CoroutineScope) {
  fun run(api: Api) {
    scope.launch { supervisorScope { api.upload() } }
  }
}
` },
});

rule({
  id: 'blocking-sleep-in-coroutine', langs: KT, type: 'B', sev: 'MA', debt: 5, tags: ['coroutines', 'performance'],
  en: ['"Thread.sleep" should not be called in coroutines', 'Thread.sleep blocks the dispatcher thread, so other coroutines sharing it cannot run, and the wait cannot be cancelled.', 'Use the suspending delay() instead.'],
  ko: ['코루틴에서 Thread.sleep을 호출하면 안 됩니다', 'Thread.sleep은 디스패처 스레드를 막아 이를 공유하는 다른 코루틴이 실행되지 못하고 대기도 취소할 수 없습니다.', '중단 함수 delay()를 쓰세요.'],
  on: { Call(n, cx) { if (A.isCall(n, 'sleep', 'Thread') && inCoroutine(cx)) cx.report(n); } },
  bad: { kt: `suspend fun poll(api: Api) {
  while (!api.ready()) Thread.sleep(100) // Noncompliant
}
` },
  good: { kt: `suspend fun poll(api: Api) {
  while (!api.ready()) delay(100)
}
` },
});

rule({
  id: 'cancellation-exception-swallowed', langs: KT, type: 'B', sev: 'CR', debt: 5, tags: ['coroutines', 'error-handling'],
  en: ['"CancellationException" should not be swallowed', 'Coroutines are cancelled by throwing CancellationException; catching it without rethrowing keeps a cancelled coroutine running.', 'Rethrow the exception, or catch a narrower exception type.'],
  ko: ['CancellationException을 삼키면 안 됩니다', '코루틴은 CancellationException을 던져 취소되므로 이를 잡고 다시 던지지 않으면 취소된 코루틴이 계속 실행됩니다.', '예외를 다시 던지거나 더 좁은 예외 타입을 잡으세요.'],
  on: {
    Catch(n, cx) {
      if (!n.types.some((t) => A.typeName(t) === 'CancellationException')) return;
      if (A.find(n.body, (x) => x.k === 'Throw')) return;
      cx.report(n);
    },
  },
  bad: { kt: `suspend fun load(api: Api) {
  try {
    api.fetch()
  } catch (e: CancellationException) { // Noncompliant
    println("cancelled")
  }
}
` },
  good: { kt: `suspend fun load(api: Api) {
  try {
    api.fetch()
  } catch (e: CancellationException) {
    println("cancelled")
    throw e
  }
}
` },
});

// ── collections and idioms ──
function sizeExpr(cx, e) {
  e = A.strip(e);
  if (!e) return null;
  if (e.k === 'Call' && e.o && e.args.length === 0) {
    if (e.id === 'size' && !cx.kt) return 'size()';
    if (e.id === 'length' && !cx.kt && cx.typeOf(e.o) === 'String') return 'length()';
    if (e.id === 'count' && cx.kt && !e.trailing) return 'count()';
  }
  if (e.k === 'Sel' && cx.kt && (e.id === 'size' || e.id === 'length')) return e.id;
  return null;
}

rule({
  id: 'size-compared-to-zero', langs: JK, type: 'S', sev: 'MI', debt: 2, tags: ['clumsy'], ref: 'S1155', ktRef: 'S1155',
  en: ['"isEmpty()" should be used to test for emptiness', 'Comparing the size or length with 0 is less readable than isEmpty()/isNotEmpty(), and size() of some collections is not constant time.', 'Use isEmpty() (Kotlin: isEmpty() / isNotEmpty()).'],
  ko: ['비어 있는지는 isEmpty()로 검사해야 합니다', '크기나 길이를 0과 비교하면 isEmpty()/isNotEmpty()보다 읽기 어렵고 어떤 컬렉션은 size()가 상수 시간이 아닙니다.', 'isEmpty()(Kotlin은 isEmpty() / isNotEmpty())를 쓰세요.'],
  msg: ['Use "{0}" instead of comparing "{1}" with 0.', '"{1}"을(를) 0과 비교하지 말고 "{0}"을(를) 쓰세요.'],
  on: {
    Bin(n, cx) {
      if (!['==', '!=', '>', '<', '>=', '<='].includes(n.op)) return;
      let s = sizeExpr(cx, n.l);
      let lit = n.r;
      let op = n.op;
      if (!s) { s = sizeExpr(cx, n.r); lit = n.l; op = { '>': '<', '<': '>', '>=': '<=', '<=': '>=' }[n.op] || n.op; }
      if (!s || !A.isNumLit(lit)) return;
      const v = A.strip(lit).v;
      let empty = null;
      if (v === 0 && (op === '==' || op === '<=')) empty = true;
      else if (v === 0 && (op === '!=' || op === '>')) empty = false;
      else if (v === 1 && op === '<') empty = true;
      else if (v === 1 && op === '>=') empty = false;
      if (empty === null) return;
      cx.report(opPos(n), [empty ? 'isEmpty()' : (cx.kt ? 'isNotEmpty()' : '!isEmpty()'), s]);
    },
  },
  bad: {
    java: jm(`    if (list.size() == 0) { n++; } // Noncompliant
    boolean any = s.length() > 0; // Noncompliant`),
    kt: km(`    if (list.size == 0) println() // Noncompliant
    val any = s.length >= 1 // Noncompliant`),
  },
  good: {
    java: jm(`    if (list.isEmpty()) { n++; }
    boolean many = list.size() > 3;`),
    kt: km(`    if (list.isEmpty()) println()
    val any = s.isNotEmpty()`),
  },
});

const FILTER_TERMINALS = ['first', 'firstOrNull', 'last', 'lastOrNull', 'single', 'singleOrNull', 'count', 'any', 'none'];

rule({
  id: 'filter-then-terminal', langs: KT, type: 'S', sev: 'MI', debt: 2, tags: ['performance', 'clumsy'],
  en: ['"filter { }" followed by a terminal operation should be merged', 'filter { }.first() builds an intermediate list of every match only to keep one element or a count.', 'Pass the predicate to the terminal operation: first { }, count { }, any { }, none { } ...'],
  ko: ['filter { } 뒤에 오는 종단 연산은 합쳐야 합니다', 'filter { }.first()는 하나의 요소나 개수만 쓰면서 모든 일치 항목의 중간 리스트를 만듭니다.', '조건을 종단 연산에 넘기세요: first { }, count { }, any { }, none { } ...'],
  msg: ['Merge "filter { }" into "{0} { }".', '"filter { }"를 "{0} { }"로 합치세요.'],
  on: {
    Call(n, cx) {
      if (!FILTER_TERMINALS.includes(n.id) || n.args.length || !n.o) return;
      const f = A.strip(n.o);
      if (f.k === 'Call' && f.id === 'filter' && f.args.length === 1 && A.strip(f.args[0]).k === 'Lambda') cx.report(n, [n.id]);
    },
  },
  bad: { kt: km(`    val firstLong = list.filter { it.length > 3 }.first() // Noncompliant
    val longOnes = list.filter { it.length > 3 }.count() // Noncompliant`) },
  good: { kt: km(`    val firstLong = list.first { it.length > 3 }
    val longOnes = list.count { it.length > 3 }
    val all = list.filter { it.length > 3 }`) },
});

rule({
  id: 'map-then-filter-not-null', langs: KT, type: 'S', sev: 'MI', debt: 2, tags: ['clumsy'],
  en: ['"map { }.filterNotNull()" should be replaced by "mapNotNull { }"', 'Mapping then filtering out nulls walks the collection twice and allocates an intermediate list.', 'Use mapNotNull { }.'],
  ko: ['map { }.filterNotNull()은 mapNotNull { }로 바꿔야 합니다', 'map 뒤에 null을 걸러 내면 컬렉션을 두 번 돌고 중간 리스트를 만듭니다.', 'mapNotNull { }을 쓰세요.'],
  on: {
    Call(n, cx) {
      if (n.id !== 'filterNotNull' || n.args.length || !n.o) return;
      const m = A.strip(n.o);
      if (m.k === 'Call' && m.id === 'map' && m.args.length === 1) cx.report(n);
    },
  },
  bad: { kt: km(`    val nums = list.map { it.toIntOrNull() }.filterNotNull() // Noncompliant`) },
  good: { kt: km(`    val nums = list.mapNotNull { it.toIntOrNull() }`) },
});

rule({
  id: 'sort-to-find-extreme', langs: KT, type: 'S', sev: 'MI', debt: 2, tags: ['performance'],
  en: ['Sorting should not be used to find the minimum or maximum', 'sorted().first() sorts the whole collection (O(n log n)) and copies it only to read one element.', 'Use min(), max(), minBy { } or maxBy { } (or their OrNull variants).'],
  ko: ['최솟값이나 최댓값을 찾으려고 정렬하면 안 됩니다', 'sorted().first()는 원소 하나를 읽으려고 전체를 정렬(O(n log n))하고 복사합니다.', 'min(), max(), minBy { }, maxBy { }(또는 OrNull 형태)를 쓰세요.'],
  msg: ['Use "{0}" instead of sorting.', '정렬 대신 "{0}"을(를) 쓰세요.'],
  on: {
    Call(n, cx) {
      if (!['first', 'firstOrNull', 'last', 'lastOrNull'].includes(n.id) || n.args.length || !n.o) return;
      const s = A.strip(n.o);
      if (s.k !== 'Call' || !/^(sorted|sortedDescending|sortedBy|sortedByDescending)$/.test(s.id)) return;
      const desc = /Descending/.test(s.id) !== /^last/.test(n.id);
      const by = /By/.test(s.id) ? 'By { }' : '()';
      cx.report(n, [(desc ? 'max' : 'min') + (by === '()' ? (/OrNull/.test(n.id) ? 'OrNull()' : '()') : (/OrNull/.test(n.id) ? 'ByOrNull { }' : 'By { }'))]);
    },
  },
  bad: { kt: km(`    val shortest = list.sortedBy { it.length }.first() // Noncompliant
    val top = list.sorted().last() // Noncompliant`) },
  good: { kt: km(`    val shortest = list.minBy { it.length }
    val top = list.max()
    val ordered = list.sorted()`) },
});

rule({
  id: 'indexed-access-operator', langs: KT, type: 'S', sev: 'MI', debt: 1, tags: ['convention'], ref: 'S6518',
  en: ['Indexed access operators should be used instead of "get" and "set"', 'Kotlin maps x.get(i) and x.set(i, v) to the operators x[i] and x[i] = v; calling the methods directly is noisier.', 'Write x[i] and x[i] = v.'],
  ko: ['get과 set 대신 인덱스 접근 연산자를 써야 합니다', 'Kotlin은 x.get(i)와 x.set(i, v)를 x[i]와 x[i] = v 연산자로 쓰므로 메서드를 직접 부르면 장황합니다.', 'x[i]와 x[i] = v로 쓰세요.'],
  msg: ['Replace "{0}" with the indexed access operator.', '"{0}"을(를) 인덱스 접근 연산자로 바꾸세요.'],
  on: {
    Call(n, cx) {
      if (!n.o || n.safe || n.trailing || n.o.k === 'Super') return;
      if ((n.id === 'get' && n.args.length === 1) || (n.id === 'set' && n.args.length === 2)) {
        if (n.args.some((a) => a.argName || a.spread)) return;
        cx.report(n, [n.id + '()']);
      }
    },
  },
  bad: { kt: km(`    val first = list.get(0) // Noncompliant
    val m = mutableMapOf<String, Int>()
    m.set("a", 1) // Noncompliant`) },
  good: { kt: km(`    val first = list[0]
    val m = mutableMapOf<String, Int>()
    m["a"] = 1
    val v = m.getOrDefault("b", 0)`) },
});

function boxedArrayType(t) {
  return t && A.typeName(t) === 'Array' && t.args && t.args.length === 1 && !t.args[0].nullable && PRIM_ARRAYS[A.typeName(t.args[0])] ? PRIM_ARRAYS[A.typeName(t.args[0])] : null;
}

rule({
  id: 'boxed-primitive-array', langs: KT, type: 'S', sev: 'MI', debt: 5, tags: ['performance'],
  en: ['Primitive arrays should be used instead of arrays of boxed primitives', 'Array<Int> stores boxed Integer objects, costing an allocation and an indirection per element compared with IntArray.', 'Use IntArray, LongArray, DoubleArray ... (intArrayOf(...)).'],
  ko: ['박싱된 기본형 배열 대신 기본형 배열을 써야 합니다', 'Array<Int>는 박싱된 Integer 객체를 담아 IntArray보다 원소마다 할당과 간접 참조가 더 듭니다.', 'IntArray, LongArray, DoubleArray 등(intArrayOf(...))을 쓰세요.'],
  msg: ['Use "{0}" instead of this array of boxed values.', '박싱된 값의 배열 대신 "{0}"을(를) 쓰세요.'],
  on: {
    Param(n, cx) { const t = boxedArrayType(n.type); if (t) cx.report(n, [t]); },
    Field(n, cx) { const t = boxedArrayType(n.type); if (t) cx.report(n.vars[0] || n, [t]); },
    Local(n, cx) { for (const v of n.vars) { const t = boxedArrayType(v.type || n.type); if (t) cx.report(v, [t]); } },
    Method(n, cx) { const t = boxedArrayType(n.ret); if (t) cx.report(namePos(n), [t]); },
  },
  bad: { kt: `fun sum(values: Array<Int>): Int = values.sum() // Noncompliant
` },
  good: { kt: `fun sum(values: IntArray): Int = values.sum()
fun names(values: Array<String>): Int = values.size
` },
});

function usesIt(body) {
  return !!A.find(body, (x) => x.k === 'Name' && x.id === 'it', { noLambda: true, noClass: true });
}

rule({
  id: 'nested-implicit-it', langs: KT, type: 'S', sev: 'MI', debt: 2, tags: ['confusing'],
  en: ['Implicit "it" parameters should not be nested', 'When a lambda using "it" sits inside another lambda that also uses "it", the inner one shadows the outer one and readers cannot tell which value is meant.', 'Name the parameter of at least one of the lambdas.'],
  ko: ['암묵적 it 매개변수를 중첩하면 안 됩니다', 'it을 쓰는 람다가 역시 it을 쓰는 다른 람다 안에 있으면 안쪽이 바깥쪽을 가려 어느 값인지 알 수 없습니다.', '적어도 한 람다의 매개변수에 이름을 붙이세요.'],
  on: {
    Lambda(n, cx) {
      if (!n.implicitIt || !usesIt(n.body)) return;
      for (let i = cx.stack.length - 2; i >= 0; i--) {
        const x = cx.stack[i];
        if (x.k === 'Method' || x.k === 'Class') return;
        if (x.k === 'Lambda') {
          if (x.implicitIt && usesIt(x.body)) cx.report(n);
          return;
        }
      }
    },
  },
  bad: { kt: `fun f(groups: List<List<String>>) {
  groups.forEach {
    println(it.size)
    it.forEach { println(it) } // Noncompliant
  }
}
` },
  good: { kt: `fun f(groups: List<List<String>>) {
  groups.forEach { group ->
    println(group.size)
    group.forEach { println(it) }
  }
}
` },
});

rule({
  id: 'redundant-it-parameter', langs: KT, type: 'S', sev: 'MI', debt: 1, tags: ['redundant'],
  en: ['Lambda parameters should not be explicitly named "it"', 'Declaring "it ->" repeats what Kotlin does implicitly for single-parameter lambdas.', 'Remove "it ->", or choose a descriptive name.'],
  ko: ['람다 매개변수 이름을 명시적으로 it이라고 하면 안 됩니다', '"it ->" 선언은 단일 매개변수 람다에서 Kotlin이 암묵적으로 하는 일을 반복합니다.', '"it ->"를 지우거나 의미 있는 이름을 쓰세요.'],
  on: {
    Lambda(n, cx) { if (n.kt && n.params.length === 1 && n.params[0].name === 'it' && !n.params[0].type) cx.report(n.params[0]); },
  },
  bad: { kt: km(`    val lengths = list.map { it -> it.length } // Noncompliant`) },
  good: { kt: km(`    val lengths = list.map { it.length }
    val upper = list.map { word -> word.uppercase() }`) },
});

rule({
  id: 'redundant-unit-return-type', langs: KT, type: 'S', sev: 'MI', debt: 1, tags: ['redundant'],
  en: ['Redundant "Unit" return types should be removed', 'A block-bodied function returns Unit by default; writing ": Unit" adds nothing.', 'Remove ": Unit".'],
  ko: ['불필요한 Unit 반환 타입은 지워야 합니다', '블록 본문 함수는 기본적으로 Unit을 돌려주므로 ": Unit"은 의미가 없습니다.', '": Unit"을 지우세요.'],
  on: {
    Method(n, cx) {
      if (!n.ret || A.typeName(n.ret) !== 'Unit' || n.exprBody || !n.body || n.ctor || n.accessor) return;
      cx.report(namePos(n));
    },
  },
  bad: { kt: `fun log(msg: String): Unit { // Noncompliant
  println(msg)
}
` },
  good: { kt: `fun log(msg: String) {
  println(msg)
}
fun noop(): Unit = Unit
` },
});

// ── strings ──
rule({
  id: 'string-concat-instead-of-template', langs: KT, type: 'S', sev: 'MI', debt: 2, tags: ['convention'],
  en: ['String templates should be used instead of concatenation', 'Concatenating literals and values with "+" is harder to read than a string template and creates intermediate strings.', 'Use a template: "Hello, $name!".'],
  ko: ['문자열 연결 대신 문자열 템플릿을 써야 합니다', '리터럴과 값을 +로 연결하면 문자열 템플릿보다 읽기 어렵고 중간 문자열을 만듭니다.', '템플릿을 쓰세요: "Hello, $name!".'],
  on: {
    Bin(n, cx) {
      if (n.op !== '+') return;
      const p = cx.parent(1);
      if (p && p.k === 'Bin' && p.op === '+') return;
      const parts = [];
      const flat = (e) => { e = A.strip(e); if (e && e.k === 'Bin' && e.op === '+') { flat(e.l); flat(e.r); } else parts.push(e); };
      flat(n);
      const lits = parts.filter((x) => A.isStrLit(x) || (x && x.k === 'Tmpl'));
      if (!lits.length || lits.length === parts.length) return;
      if (parts.some((x) => x && A.isStrLit(x) && /\n/.test(String(x.raw || '')))) return;
      if (!A.isStrLit(parts[0]) && !(parts[0] && parts[0].k === 'Tmpl') && !A.isStrLit(parts[1])) return;
      cx.report(opPos(n));
    },
  },
  bad: { kt: km(`    val msg = "Hello, " + s + "!" // Noncompliant`) },
  good: { kt: km(`    val msg = "Hello, $s!"
    val sum = n + 1`) },
});

rule({
  id: 'redundant-template-braces', langs: KT, type: 'S', sev: 'MI', debt: 1, tags: ['redundant'],
  en: ['Curly braces should be omitted around simple names in string templates', '"${name}" is equivalent to "$name" when the name is not followed by an identifier character.', 'Write "$name".'],
  ko: ['문자열 템플릿의 단순 이름에는 중괄호를 생략해야 합니다', '이름 뒤에 식별자 문자가 오지 않으면 "${name}"은 "$name"과 같습니다.', '"$name"으로 쓰세요.'],
  msg: ['Remove the curly braces around "{0}".', '"{0}"을(를) 감싼 중괄호를 지우세요.'],
  on: {
    Tmpl(n, cx) {
      const m = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}(?![A-Za-z0-9_])/.exec(String(n.raw || ''));
      if (m) cx.report(n, [m[1]]);
    },
  },
  bad: { kt: km(`    val msg = "user: \${s} (\${n})" // Noncompliant`) },
  good: { kt: km(`    val msg = "user: $s (\${n}th) \${s.length}"`) },
});

rule({
  id: 'tostring-in-template', langs: KT, type: 'S', sev: 'MI', debt: 1, tags: ['redundant'],
  en: ['"toString()" should not be called in string templates', 'A string template already converts its expressions with toString().', 'Remove the explicit .toString() call.'],
  ko: ['문자열 템플릿 안에서 toString()을 호출하면 안 됩니다', '문자열 템플릿은 이미 식을 toString()으로 바꿉니다.', '명시적인 .toString() 호출을 지우세요.'],
  on: {
    Tmpl(n, cx) {
      for (const p of n.parts || []) {
        const e = p && typeof p === 'object' ? A.strip(p) : null;
        if (e && e.k === 'Call' && e.id === 'toString' && e.args.length === 0 && e.o && !e.safe) { cx.report(e); return; }
      }
    },
  },
  bad: { kt: km(`    val msg = "count: \${n.toString()}" // Noncompliant`) },
  good: { kt: km(`    val msg = "count: $n \${o?.toString()}"`) },
});

rule({
  id: 'equals-instead-of-operator', langs: KT, type: 'S', sev: 'MI', debt: 1, tags: ['convention'],
  en: ['"==" should be used instead of "equals"', 'In Kotlin == calls equals() and also handles null on both sides; calling equals() directly is noisier and fails on a null receiver.', 'Write a == b (and a != b instead of !a.equals(b)).'],
  ko: ['equals 대신 ==를 써야 합니다', 'Kotlin의 ==는 equals()를 호출하면서 양쪽 null도 처리하는데 equals()를 직접 부르면 장황하고 수신자가 null이면 실패합니다.', 'a == b로 쓰고 !a.equals(b) 대신 a != b를 쓰세요.'],
  on: {
    Call(n, cx) {
      if (n.id !== 'equals' || !n.o || n.safe || n.args.length !== 1 || n.args[0].argName || n.o.k === 'Super') return;
      cx.report(n);
    },
  },
  bad: { kt: km(`    if (s.equals("x")) println() // Noncompliant`) },
  good: { kt: km(`    if (s == "x") println()
    if (s.equals("X", ignoreCase = true)) println()`) },
});

rule({
  id: 'val-could-be-const', langs: KT, type: 'S', sev: 'MI', debt: 2, tags: ['performance', 'convention'],
  en: ['Top-level and object properties initialized with a literal should be "const"', 'A "const val" is inlined at compile time and documents a true constant; a plain "val" generates a field and a getter.', 'Add the const modifier.'],
  ko: ['리터럴로 초기화한 최상위·object 속성은 const여야 합니다', 'const val은 컴파일 시점에 인라인되어 진짜 상수임을 드러내지만 일반 val은 필드와 getter를 만듭니다.', 'const 수식어를 추가하세요.'],
  msg: ['Make "{0}" a "const val".', '"{0}"을(를) const val로 만드세요.'],
  on: {
    Field(n, cx) {
      if (n.mutable || !n.fin || (n.mods && (n.mods.has('const') || n.mods.has('override') || n.mods.has('open') || n.mods.has('lateinit'))) || n.getter || n.delegate || (n.annos && n.annos.length)) return;
      const p = cx.parent(1);
      if (!p || !(p.k === 'Unit' || (p.k === 'Class' && (p.kind === 'object' || p.companion)))) return;
      for (const v of n.vars) {
        const i = A.strip(v.init);
        if (i && i.k === 'Lit' && i.t !== 'null') cx.report(v, [v.name]);
      }
    },
  },
  bad: { kt: `val MAX_RETRIES = 3 // Noncompliant
object Config {
  val baseUrl = "https://api.example.com" // Noncompliant
}
` },
  good: { kt: `const val MAX_RETRIES = 3
val started = System.currentTimeMillis()
object Config {
  const val BASE_URL = "https://api.example.com"
}
` },
});

rule({
  id: 'range-to-indices', langs: KT, type: 'S', sev: 'MI', debt: 2, tags: ['clumsy'],
  en: ['"indices" should be used to iterate over collection indexes', '0 until list.size and 0..list.size - 1 restate what list.indices expresses directly and are easy to get off by one.', 'Iterate over list.indices (or use withIndex()).'],
  ko: ['컬렉션 인덱스를 돌 때는 indices를 써야 합니다', '0 until list.size와 0..list.size - 1은 list.indices가 바로 표현하는 것을 반복하며 하나 차이 실수가 쉽습니다.', 'list.indices를 돌거나 withIndex()를 쓰세요.'],
  msg: ['Use "{0}.indices" instead of this range.', '이 범위 대신 "{0}.indices"를 쓰세요.'],
  on: {
    ForEach(n, cx) {
      const it = A.strip(n.iter);
      if (!it) return;
      const sizeOf = (e) => { e = A.strip(e); return e && e.k === 'Sel' && (e.id === 'size' || e.id === 'length') ? A.dotted(e.o) : null; };
      let recv = null;
      if (it.k === 'Call' && it.id === 'until' && A.isNumLit(it.o) && A.strip(it.o).v === 0 && it.args.length === 1) recv = sizeOf(it.args[0]);
      else if (it.k === 'Bin' && it.op === '..<' && A.isNumLit(it.l) && A.strip(it.l).v === 0) recv = sizeOf(it.r);
      else if (it.k === 'Bin' && it.op === '..' && A.isNumLit(it.l) && A.strip(it.l).v === 0) {
        const r = A.strip(it.r);
        if (r && r.k === 'Bin' && r.op === '-' && A.isNumLit(r.r) && A.strip(r.r).v === 1) recv = sizeOf(r.l);
      }
      if (recv) cx.report(it, [recv]);
    },
  },
  bad: { kt: km(`    for (i in 0 until list.size) println(list[i]) // Noncompliant
    for (j in 0..list.size - 1) println(j) // Noncompliant`) },
  good: { kt: km(`    for (i in list.indices) println(list[i])
    for (j in 0 until n) println(j)`) },
});

rule({
  id: 'trim-then-is-empty', langs: JK, type: 'S', sev: 'MI', debt: 2, tags: ['clumsy'],
  en: ['"isBlank()" should be used instead of "trim().isEmpty()"', 'Trimming creates a new string only to check whether anything but whitespace is left; isBlank() checks it directly (Java 11+, Kotlin).', 'Use isBlank() / isNotBlank().'],
  ko: ['trim().isEmpty() 대신 isBlank()를 써야 합니다', 'trim은 공백 말고 남는 것이 있는지 보려고 새 문자열을 만듭니다. isBlank()는 바로 확인합니다(Java 11+, Kotlin).', 'isBlank() / isNotBlank()를 쓰세요.'],
  msg: ['Use "{0}" instead.', '대신 "{0}"을(를) 쓰세요.'],
  on: {
    Call(n, cx) {
      if (!['isEmpty', 'isNotEmpty'].includes(n.id) || n.args.length || !n.o) return;
      const t = A.strip(n.o);
      if (t.k === 'Call' && (t.id === 'trim' || t.id === 'strip') && t.args.length === 0 && t.o) cx.report(n, [n.id === 'isEmpty' ? 'isBlank()' : 'isNotBlank()']);
    },
  },
  bad: {
    java: jm(`    if (s.trim().isEmpty()) { n++; } // Noncompliant`),
    kt: km(`    if (s.trim().isNotEmpty()) println(s) // Noncompliant`),
  },
  good: {
    java: jm(`    if (s.isBlank()) { n++; }`),
    kt: km(`    if (s.isNotBlank()) println(s)`),
  },
});

function caseChanged(e) {
  e = A.strip(e);
  return !!e && e.k === 'Call' && /^(toLowerCase|toUpperCase|lowercase|uppercase)$/.test(e.id) && e.args.length === 0 && !!e.o;
}

rule({
  id: 'case-insensitive-comparison', langs: JK, type: 'S', sev: 'MI', debt: 5, tags: ['clumsy'], ref: 'S1157', ktRef: 'S1157',
  en: ['Case insensitive string comparisons should be made without intermediate upper or lower casing', 'Converting both sides to upper or lower case allocates new strings and is locale-sensitive; equalsIgnoreCase does the comparison directly.', 'Use equalsIgnoreCase() (Kotlin: equals(other, ignoreCase = true)).'],
  ko: ['대소문자를 무시한 문자열 비교에 중간 대소문자 변환을 쓰면 안 됩니다', '양쪽을 대문자나 소문자로 바꾸면 새 문자열을 만들고 로캘에 따라 달라집니다. equalsIgnoreCase는 바로 비교합니다.', 'equalsIgnoreCase()(Kotlin은 equals(other, ignoreCase = true))를 쓰세요.'],
  on: {
    Call(n, cx) {
      if (n.id !== 'equals' || !n.o || n.args.length !== 1) return;
      if ((caseChanged(n.o) && (caseChanged(n.args[0]) || A.isStrLit(n.args[0]))) || (caseChanged(n.args[0]) && A.isStrLit(n.o))) cx.report(n);
    },
    Bin(n, cx) {
      if (!cx.kt || (n.op !== '==' && n.op !== '!=')) return;
      if ((caseChanged(n.l) && (caseChanged(n.r) || A.isStrLit(n.r))) || (caseChanged(n.r) && A.isStrLit(n.l))) cx.report(opPos(n));
    },
  },
  bad: {
    java: jm(`    if (s.toLowerCase().equals(o.toString().toLowerCase())) { n++; } // Noncompliant
    boolean yes = s.toUpperCase().equals("YES"); // Noncompliant`),
    kt: km(`    if (s.lowercase() == "yes") println() // Noncompliant`),
  },
  good: {
    java: jm(`    if (s.equalsIgnoreCase(o.toString())) { n++; }
    String key = s.toLowerCase();`),
    kt: km(`    if (s.equals("yes", ignoreCase = true)) println()`),
  },
});

// ── general (Java and Kotlin) ──
rule({
  id: 'standard-output', langs: JK, type: 'S', sev: 'MA', debt: 10, tags: ['bad-practice'], ref: 'S106', ktRef: 'S106',
  en: ['Standard outputs should not be used directly to log anything', 'System.out / println bypass the logging configuration: messages cannot be filtered, routed or correlated and may leak to places nobody reads.', 'Use a logger (SLF4J, java.util.logging, kotlin-logging).'],
  ko: ['기록에 표준 출력을 직접 쓰면 안 됩니다', 'System.out / println은 로깅 설정을 우회해 메시지를 거르거나 보내거나 연결할 수 없고 아무도 보지 않는 곳으로 샐 수 있습니다.', '로거(SLF4J, java.util.logging, kotlin-logging)를 쓰세요.'],
  on: {
    Call(n, cx) {
      if (cx.isTestClass()) return;
      if (cx.kt) {
        if (!n.o && (n.id === 'println' || n.id === 'print')) cx.report(n);
        else if (n.o && /^System\.(out|err)$/.test(A.dotted(n.o) || '')) cx.report(n);
        return;
      }
      if (n.o && /^(java\.lang\.)?System\.(out|err)$/.test(A.dotted(n.o) || '')) cx.report(n);
    },
  },
  bad: {
    java: jc(`  void m(String s) {
    System.out.println("value " + s); // Noncompliant
  }`),
    kt: km(`    println(s) // Noncompliant`),
  },
  good: {
    java: jc(`  static final java.util.logging.Logger LOG = java.util.logging.Logger.getLogger("T");
  void m(String s) {
    LOG.info(s);
  }`),
    kt: km(`    logger.info { s }`),
  },
});

const GENERIC_EX = ['Exception', 'RuntimeException', 'Throwable', 'Error'];

rule({
  id: 'generic-exception-thrown', langs: JK, type: 'S', sev: 'MA', debt: 20, tags: ['cwe-397', 'error-handling'], ref: 'S112', ktRef: 'S112',
  en: ['Generic exceptions should never be thrown', 'Throwing Exception, RuntimeException, Error or Throwable forces callers to catch everything to handle this one case and hides what actually went wrong.', 'Throw a specific standard exception (IllegalArgumentException, IllegalStateException ...) or a dedicated one.'],
  ko: ['일반 예외를 던지면 안 됩니다', 'Exception, RuntimeException, Error, Throwable을 던지면 호출자가 이 경우를 처리하려고 모든 것을 잡아야 하고 실제 문제가 무엇인지 감춰집니다.', '구체적인 표준 예외(IllegalArgumentException, IllegalStateException 등)나 전용 예외를 던지세요.'],
  msg: ['Define and throw a dedicated exception instead of using a generic one ("{0}").', '일반 예외("{0}") 대신 전용 예외를 정의해 던지세요.'],
  on: {
    Throw(n, cx) {
      const t = A.ctorType(n.e);
      if (t && GENERIC_EX.includes(t)) cx.report(n, [t]);
    },
  },
  bad: {
    java: jm(`    if (n < 0) throw new RuntimeException("negative"); // Noncompliant`),
    kt: km(`    if (n < 0) throw Exception("negative") // Noncompliant`),
  },
  good: {
    java: jm(`    if (n < 0) throw new IllegalArgumentException("negative");`),
    kt: km(`    if (n < 0) throw IllegalArgumentException("negative")`),
  },
});

rule({
  id: 'catch-throwable-or-error', langs: JK, type: 'S', sev: 'MA', debt: 20, tags: ['cwe-396', 'error-handling'], ref: 'S1181', ktRef: 'S1181',
  en: ['Throwable and Error should not be caught', 'Errors such as OutOfMemoryError or StackOverflowError signal problems an application cannot recover from; catching them hides the failure and leaves the JVM in a bad state.', 'Catch Exception or the specific exception types the code can handle.'],
  ko: ['Throwable과 Error를 잡으면 안 됩니다', 'OutOfMemoryError나 StackOverflowError 같은 Error는 애플리케이션이 회복할 수 없는 문제를 알리므로 잡으면 실패를 감추고 JVM을 나쁜 상태로 둡니다.', 'Exception이나 처리할 수 있는 구체적인 예외 타입을 잡으세요.'],
  msg: ['Catch Exception instead of {0}.', '{0} 대신 Exception을 잡으세요.'],
  on: {
    Catch(n, cx) {
      if (cx.isTestClass()) return;
      const t = n.types.map((x) => A.typeName(x)).find((x) => x === 'Throwable' || x === 'Error');
      if (t) cx.report(n, [t]);
    },
  },
  bad: {
    java: jm(`    try { o.wait(); } catch (Throwable t) { n++; } // Noncompliant`),
    kt: km(`    try { println(s) } catch (e: Throwable) { println(e) } // Noncompliant`),
  },
  good: {
    java: jm(`    try { o.wait(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }`),
    kt: km(`    try { println(s) } catch (e: java.io.IOException) { println(e) }`),
  },
});

rule({
  id: 'nested-ternary', type: 'S', sev: 'MA', debt: 5, tags: ['confusing'], ref: 'S3358',
  en: ['Ternary operators should not be nested', 'Nested conditional operators are hard to read and the grouping of the branches is easy to misjudge.', 'Use if/else statements, a switch expression or a helper method.'],
  ko: ['삼항 연산자를 중첩하면 안 됩니다', '중첩된 조건 연산자는 읽기 어렵고 분기의 묶음을 잘못 판단하기 쉽습니다.', 'if/else 문, switch 식, 보조 메서드를 쓰세요.'],
  on: {
    Cond(n, cx) {
      for (let i = cx.stack.length - 2; i >= 0; i--) {
        const x = cx.stack[i];
        if (x.k === 'Paren') continue;
        if (x.k === 'Cond') cx.report(n);
        return;
      }
    },
  },
  bad: { java: jm(`    String size = n > 100 ? "big"
        : n > 10 ? "medium" : "small"; // Noncompliant`) },
  good: { java: jm(`    String size;
    if (n > 100) { size = "big"; } else { size = n > 10 ? "medium" : "small"; }`) },
});

function commentRule(id, ref, word, en, ko) {
  const re = new RegExp('(^|[^A-Za-z0-9_])' + word + '([^A-Za-z0-9_]|$)');
  rule({
    id, langs: JK, type: 'S', sev: id === 'fixme-comment' ? 'MA' : 'IN', debt: 0, tags: ['cwe-546'], ref, ktRef: ref,
    en, ko,
    on: {
      Unit(n, cx) {
        for (const c of n.comments || []) {
          const lines = String(c.text || '').split('\n');
          lines.forEach((l, i) => { if (re.test(l)) cx.report({ line: c.line + i, col: 1 }); });
        }
      },
    },
    bad: {
      java: jm(`    // ${word}: handle negative values // Noncompliant
    n++;`),
      kt: km(`    // ${word} remove after migration // Noncompliant
    println(n)`),
    },
    good: {
      java: jm(`    // negative values are rejected by the caller
    n++;`),
      kt: km(`    // kept for the old clients
    println(n)`),
    },
  });
}

commentRule('todo-comment', 'S1135', 'TODO',
  ['Track uses of "TODO" tags', 'TODO comments mark unfinished work that is easily forgotten once the code is merged.', 'Finish the work or move it to the issue tracker and remove the comment.'],
  ['TODO 태그 사용을 추적해야 합니다', 'TODO 주석은 병합 후 잊히기 쉬운 미완성 작업을 표시합니다.', '작업을 끝내거나 이슈 추적기로 옮기고 주석을 지우세요.']);

commentRule('fixme-comment', 'S1134', 'FIXME',
  ['Track uses of "FIXME" tags', 'FIXME comments mark code that is known to be wrong and still waiting for a fix.', 'Fix the problem and remove the comment.'],
  ['FIXME 태그 사용을 추적해야 합니다', 'FIXME 주석은 잘못된 것으로 알려진 채 수정을 기다리는 코드를 표시합니다.', '문제를 고치고 주석을 지우세요.']);

rule({
  id: 'lateinit-never-assigned', langs: KT, type: 'B', sev: 'MA', debt: 5, tags: ['pitfall'],
  en: ['Private "lateinit" properties should be assigned', 'A private lateinit property that is never assigned in its class throws UninitializedPropertyAccessException on first read.', 'Assign the property (for example in init or a set-up method), or remove it.'],
  ko: ['private lateinit 속성은 대입되어야 합니다', '클래스 안에서 한 번도 대입하지 않는 private lateinit 속성은 처음 읽을 때 UninitializedPropertyAccessException을 던집니다.', '속성을 대입하거나(init이나 준비 메서드 등) 지우세요.'],
  msg: ['"{0}" is never assigned.', '"{0}"은(는) 대입되지 않습니다.'],
  on: {
    Field(n, cx) {
      const c = cx.cls;
      if (!c || !(n.mods && n.mods.has('lateinit') && n.mods.has('private')) || (n.annos && n.annos.length)) return;
      for (const v of n.vars) {
        const assigned = A.find(c, (x) => (x.k === 'Assign' && A.varKey(x.t) && A.varKey(x.t).replace(/^this\./, '') === v.name) ||
          (x.k === 'MRef' && x.id === v.name));
        if (!assigned) cx.report(v, [v.name]);
      }
    },
  },
  bad: { kt: `class Screen {
  private lateinit var title: String // Noncompliant
  fun show() = println(title)
}
` },
  good: { kt: `class Screen {
  private lateinit var title: String
  fun setUp(t: String) { title = t }
  fun show() = println(title)
}
` },
});

rule({
  id: 'negated-is-empty', langs: KT, type: 'S', sev: 'MI', debt: 1, tags: ['clumsy'],
  en: ['"isNotEmpty()" should be used instead of "!isEmpty()"', 'Kotlin provides isNotEmpty() / isNotBlank(); negating isEmpty() is easy to overlook.', 'Use isNotEmpty() or isNotBlank().'],
  ko: ['!isEmpty() 대신 isNotEmpty()를 써야 합니다', 'Kotlin에는 isNotEmpty() / isNotBlank()가 있으며 isEmpty()의 부정은 놓치기 쉽습니다.', 'isNotEmpty()나 isNotBlank()를 쓰세요.'],
  msg: ['Use "{0}" instead.', '대신 "{0}"을(를) 쓰세요.'],
  on: {
    Un(n, cx) {
      if (n.op !== '!') return;
      const c = A.strip(n.e);
      if (c && c.k === 'Call' && (c.id === 'isEmpty' || c.id === 'isBlank') && c.args.length === 0 && c.o) cx.report(n, [c.id === 'isEmpty' ? 'isNotEmpty()' : 'isNotBlank()']);
    },
  },
  bad: { kt: km(`    if (!list.isEmpty()) println(list) // Noncompliant`) },
  good: { kt: km(`    if (list.isNotEmpty()) println(list)`) },
});

module.exports = { nonNull, inCoroutine };
