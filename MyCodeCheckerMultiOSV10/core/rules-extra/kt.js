'use strict';

// Kotlin. Kotlin files also run the Java rules (languages.ruleLangsFor), so
// this file holds what is specific to Kotlin syntax and libraries.

const { maker } = require('./util');

const R = maker('kt', ['kt']);

// skip(rawLine, line, file, ctx): ctx { index, lines } gives the file's lines
// when the caller passes them; without it only the line itself is known.
const TEST_PATH = /(^|[\\/])(test|tests|androidTest|testFixtures)[\\/]|(Test|Tests|Spec)\.kts?$/;

// The declaration lines just above lines[index] (annotations, modifiers).
function annotationsAbove(ctx, max = 4) {
  if (!ctx || !Array.isArray(ctx.lines) || ctx.index == null) return '';
  const out = [];
  for (let i = ctx.index - 1; i >= 0 && out.length < max; i--) {
    const s = String(ctx.lines[i]).trim();
    if (!s.startsWith('@')) break;
    out.push(s);
  }
  return out.join(' ');
}

// Name of the nearest function declared at or above lines[index] (a guess by
// indentation: the closest "fun" line indented less than the statement).
function enclosingFun(ctx, raw) {
  const own = /\bfun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)\s*\(/.exec(String(raw));
  if (own) return { name: own[1], annos: annotationsAbove(ctx) + ' ' + raw };
  if (!ctx || !Array.isArray(ctx.lines) || ctx.index == null) return null;
  const indent = (s) => /^\s*/.exec(s)[0].length;
  const mine = indent(String(ctx.lines[ctx.index]));
  for (let i = ctx.index - 1; i >= 0 && i > ctx.index - 400; i--) {
    const s = String(ctx.lines[i]);
    if (!s.trim() || indent(s) >= mine) continue;
    const m = /\bfun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)\s*\(/.exec(s);
    if (m) return { name: m[1], annos: annotationsAbove({ lines: ctx.lines, index: i }) + ' ' + s };
    if (/^\s*(?:[\w@]+\s+)*(?:class|object|interface)\b/.test(s)) return null;
  }
  return null;
}

const inMainOrTest = (raw, file, ctx) => {
  if (file && TEST_PATH.test(String(file.path || ''))) return true;
  const f = enclosingFun(ctx, raw);
  return !!f && (f.name === 'main' || /@(?:Test|ParameterizedTest|BeforeEach|BeforeTest|Before)\b/.test(f.annos));
};

R('not-null-assertion', 'S', 'MA', 5, ['null-safety'],
  /[\w)\]]!!(?=\s*[.\[)?:,;]|\s*$)/,
  ['Not-null assertion !!', '!! turns a null into a NullPointerException at run time.', 'Use ?. with ?: or check for null first.'],
  ['not-null 단언 !!을 씁니다', '!!는 실행 중 null을 NullPointerException으로 바꿉니다.', '?.와 ?:를 쓰거나 먼저 null을 검사하세요.'],
  'val n = user!!.name', 'val n = user?.name ?: "guest"', { ns: true });
R('todo-call', 'B', 'MA', 10, ['unfinished'],
  /(?<![\w.])TODO\s*\(/,
  ['TODO() left in code', 'TODO() always throws NotImplementedError when reached.', 'Implement the branch.'],
  ['TODO()가 코드에 남아 있습니다', 'TODO()는 도달하면 항상 NotImplementedError를 던집니다.', '분기를 구현하세요.'],
  'override fun load(): Data = TODO("later")', 'override fun load(): Data = repository.load()');
R('println-debug', 'S', 'MI', 2, ['debug'],
  /^\s*(?:println|print)\s*\(/,
  ['println left in the code', 'Console output is not a log and cannot be filtered.', 'Use a logger.'],
  ['println이 남아 있습니다', '콘솔 출력은 로그가 아니라 거를 수 없습니다.', '로거를 쓰세요.'],
  'println(result)', 'logger.debug { "result=$result" }');
R('global-scope', 'S', 'MA', 10, ['coroutines'],
  /\bGlobalScope\.(?:launch|async)\b/,
  ['GlobalScope coroutine', 'Coroutines in GlobalScope are not cancelled with their owner and leak.', 'Launch in a lifecycle-bound or injected CoroutineScope.'],
  ['GlobalScope 코루틴입니다', 'GlobalScope 코루틴은 소유자와 함께 취소되지 않아 샙니다.', '생명주기에 묶인 스코프나 주입한 CoroutineScope에서 실행하세요.'],
  'GlobalScope.launch { sync() }', 'viewModelScope.launch { sync() }');
R('run-blocking', 'S', 'MA', 10, ['coroutines'],
  /\brunBlocking\s*(?:<[^>]*>)?\s*[({]/,
  ['runBlocking outside main or tests', 'runBlocking blocks the calling thread, which freezes UI or request threads.', 'Make the caller suspend or use a scope.'],
  ['main이나 테스트 밖의 runBlocking입니다', 'runBlocking은 호출 스레드를 막아 UI나 요청 스레드를 멈춥니다.', '호출자를 suspend로 만들거나 스코프를 쓰세요.'],
  'val user = runBlocking { api.user() }', ['val user = api.user()', 'fun main() = runBlocking {', '@Test fun loads() = runBlocking {'],
  { skip: (raw, line, file, ctx) => /fun\s+main\s*\(|@Test/.test(raw) || inMainOrTest(raw, file, ctx) });
R('thread-sleep-coroutine', 'S', 'MI', 5, ['coroutines'],
  /\bsuspend\s+fun\b.*\bThread\.sleep\s*\(/,
  ['Thread.sleep in a suspend function', 'Sleeping blocks the dispatcher thread instead of suspending.', 'Use delay().'],
  ['suspend 함수에서 Thread.sleep을 씁니다', 'sleep은 일시 중단 대신 디스패처 스레드를 막습니다.', 'delay()를 쓰세요.'],
  'suspend fun poll() { Thread.sleep(500) }', 'suspend fun poll() { delay(500) }');
R('broad-catch', 'S', 'MI', 5, ['error-handling', 'cwe-396'],
  /\bcatch\s*\(\s*\w+\s*:\s*(?:Exception|Throwable|java\.lang\.Exception)\s*\)/,
  ['Catching Exception or Throwable', 'A broad catch also swallows CancellationException and programming errors.', 'Catch the specific exceptions you expect.'],
  ['Exception이나 Throwable을 잡습니다', '넓은 catch는 CancellationException과 프로그래밍 오류까지 삼킵니다.', '예상하는 구체적인 예외를 잡으세요.'],
  'catch (e: Exception) {', 'catch (e: IOException) {');
R('empty-function', 'S', 'MI', 5, ['suspicious'],
  /\bfun\s+(?:<[^>]*>\s*)?[\w.]+\s*\([^)]*\)\s*(?::\s*[\w<>?, ]+\s*)?\{\s*\}/,
  ['Empty function', 'An empty body is unfinished or should explain why it does nothing.', 'Implement it or add a comment.'],
  ['빈 함수입니다', '빈 본문은 미완성이거나 왜 아무 일도 안 하는지 설명해야 합니다.', '구현하거나 주석을 다세요.'],
  'fun onStop() {}', ['fun onStop() { save() }', 'fun onStop() { /* nothing to release */ }'],
  // A comment between the braces is the explanation the rule asks for.
  { skip: (raw) => /\{\s*(?:\/\*|\/\/)/.test(raw) });
R('class-naming', 'S', 'MI', 2, ['convention'],
  /\b(?:class|interface|object)\s+[a-z]\w*(?=\s*[({:<]|\s*$)/,
  ['Type name not in PascalCase', 'Kotlin types start with an upper-case letter.', 'Rename the type.'],
  ['타입 이름이 PascalCase가 아닙니다', 'Kotlin 타입 이름은 대문자로 시작합니다.', '타입 이름을 바꾸세요.'],
  'class userRepository(private val db: Db) {', 'class UserRepository(private val db: Db) {', { ns: true });
R('function-naming', 'S', 'MI', 2, ['convention'],
  /\bfun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?[A-Z][a-z]\w*\s*\(/,
  ['Function name starts with a capital letter', 'Kotlin functions are named in camelCase (Composable functions excepted).', 'Rename the function.'],
  ['함수 이름이 대문자로 시작합니다', 'Kotlin 함수 이름은 camelCase입니다(Composable 함수 제외).', '함수 이름을 바꾸세요.'],
  'fun LoadUser(id: Long) {', ['fun loadUser(id: Long) {', '@Composable fun UserCard(user: User) {', 'fun Money(cents: Long): Money = MoneyImpl(cents)'],
  // @Composable may sit on the lines above; a factory function may take its type's name (Kotlin conventions).
  { skip: (raw, line, file, ctx) => /@Composable/.test(raw) || /@Composable/.test(annotationsAbove(ctx)) || /\bfun\s+(?:<[^>]*>\s*)?(\w+)\s*\(.*\)\s*:\s*\1\b/.test(raw) });
R('deprecated-case-functions', 'S', 'MI', 2, ['deprecated'],
  /\.(?:toUpperCase|toLowerCase|capitalize|decapitalize)\s*\(\s*\)/,
  ['Deprecated case conversion', 'toUpperCase / capitalize are deprecated and locale-sensitive.', 'Use uppercase() / lowercase() / replaceFirstChar.'],
  ['사용 중단된 대소문자 변환입니다', 'toUpperCase / capitalize는 사용 중단됐고 로캘에 따라 다릅니다.', 'uppercase() / lowercase() / replaceFirstChar를 쓰세요.'],
  'val k = key.toUpperCase()', 'val k = key.uppercase()');
R('redundant-string-template', 'S', 'IN', 1, ['clumsy'],
  /"\$\{[A-Za-z_]\w*\}"|\$\{[A-Za-z_]\w*\}(?![\w(.\[])/,
  ['Braces around a simple template name', '"${name}" can be written "$name".', 'Drop the braces.'],
  ['단순 템플릿 이름에 중괄호를 씁니다', '"${name}"은 "$name"으로 쓸 수 있습니다.', '중괄호를 지우세요.'],
  'val s = "Hello ${name}!"', ['val s = "Hello $name!"', 'val s = "${user.name}"', 'val s = "${n}th"']);
R('suppress-warnings', 'S', 'IN', 2, ['convention'],
  /@Suppress\s*\(\s*"(?:UNCHECKED_CAST|DEPRECATION|ALL|unused)"/,
  ['Warning suppressed', 'Suppressed warnings hide casts and deprecated calls that may break later.', 'Fix the cause, or narrow the suppression to one expression.'],
  ['경고를 억제합니다', '억제된 경고는 나중에 깨질 캐스트와 사용 중단 호출을 숨깁니다.', '원인을 고치거나 억제 범위를 한 식으로 좁히세요.'],
  '@Suppress("UNCHECKED_CAST")', '@Suppress("MagicNumber")');
R('exit-process', 'S', 'MA', 5, ['design'],
  /\bexitProcess\s*\(/,
  ['exitProcess called', 'Exiting the JVM from library or app code skips cleanup and is hard to test.', 'Return an error to the caller or throw.'],
  ['exitProcess를 호출합니다', '라이브러리나 앱 코드에서 JVM을 끝내면 정리를 건너뛰고 테스트하기 어렵습니다.', '호출자에게 오류를 돌려주거나 예외를 던지세요.'],
  'exitProcess(1)', ['throw IllegalStateException("config missing")', 'fun main() { exitProcess(run()) }'],
  { skip: (raw, line, file, ctx) => /fun\s+main\s*\(/.test(raw) || (enclosingFun(ctx, raw) || {}).name === 'main' });
R('kotlin-random', 'H', 'MA', 10, ['cwe-330', 'owasp-a02'],
  /(?<![\w.])Random\.(?:nextInt|nextLong|nextBytes|nextDouble|Default)\b|(?<![\w.])Random\s*\(\s*\d*\s*\)/,
  ['Non-cryptographic random generator', 'kotlin.random.Random is predictable and must not create tokens or keys.', 'Use java.security.SecureRandom.'],
  ['암호학적이지 않은 난수 생성기입니다', 'kotlin.random.Random은 예측 가능해 토큰이나 키를 만들면 안 됩니다.', 'java.security.SecureRandom을 쓰세요.'],
  'val token = Random.nextLong()', 'val token = SecureRandom().nextLong()');
R('sql-template', 'V', 'CR', 20, ['cwe-89', 'owasp-a03', 'sql'],
  /\b(?:rawQuery|execSQL|executeQuery|executeUpdate|prepareStatement|createQuery|createNativeQuery)\s*\(\s*"[^"]*\$\{?[A-Za-z_]/,
  ['SQL built with a string template', 'Values interpolated into SQL allow injection.', 'Use ? placeholders and bind arguments.'],
  ['문자열 템플릿으로 SQL을 만듭니다', 'SQL에 끼워 넣은 값은 주입을 허용합니다.', '? 자리표시자를 쓰고 인자를 바인딩하세요.'],
  'db.rawQuery("select * from users where id = $id", null)', 'db.rawQuery("select * from users where id = ?", arrayOf(id))');
R('webview-javascript', 'H', 'MA', 10, ['cwe-79', 'android'],
  /\bjavaScriptEnabled\s*=\s*true\b/,
  ['WebView JavaScript enabled', 'Script in a WebView can reach exposed interfaces and local data.', 'Enable it only for trusted content.'],
  ['WebView JavaScript를 켭니다', 'WebView의 스크립트가 노출된 인터페이스와 로컬 데이터에 닿을 수 있습니다.', '신뢰한 콘텐츠에만 켜세요.'],
  'webView.settings.javaScriptEnabled = true', 'webView.settings.javaScriptEnabled = false');
R('webview-file-access', 'V', 'MA', 10, ['cwe-200', 'android'],
  /\ballow(?:FileAccess|FileAccessFromFileURLs|UniversalAccessFromFileURLs|ContentAccess)\s*=\s*true\b/,
  ['WebView file access enabled', 'Pages in the WebView can read local files.', 'Turn file access off.'],
  ['WebView 파일 접근을 켭니다', 'WebView의 페이지가 로컬 파일을 읽을 수 있습니다.', '파일 접근을 끄세요.'],
  'settings.allowFileAccess = true', 'settings.allowFileAccess = false');
R('trust-all-lambda', 'V', 'BL', 30, ['cwe-297', 'owasp-a07', 'tls'],
  /\bhostnameVerifier\s*\{\s*_\s*,\s*_\s*->\s*true\s*\}|\bHostnameVerifier\s*\{\s*_\s*,\s*_\s*->\s*true\s*\}/,
  ['Host name verifier always returns true', 'Any certificate host is accepted, allowing impersonation.', 'Remove the custom verifier.'],
  ['호스트 이름 검증기가 항상 true를 돌려줍니다', '어떤 인증서 호스트도 받아들여 사칭을 허용합니다.', '사용자 검증기를 지우세요.'],
  'builder.hostnameVerifier { _, _ -> true }', 'builder.certificatePinner(pinner)');
R('cleartext-okhttp', 'V', 'MA', 10, ['cwe-319', 'owasp-a02'],
  /\bConnectionSpec\.CLEARTEXT\b/,
  ['OkHttp clear-text connection spec', 'CLEARTEXT allows unencrypted HTTP traffic.', 'Use ConnectionSpec.MODERN_TLS.'],
  ['OkHttp 평문 연결 사양입니다', 'CLEARTEXT는 암호화되지 않은 HTTP 통신을 허용합니다.', 'ConnectionSpec.MODERN_TLS를 쓰세요.'],
  'connectionSpecs(listOf(ConnectionSpec.CLEARTEXT))', 'connectionSpecs(listOf(ConnectionSpec.MODERN_TLS))');
R('shared-prefs-secret', 'V', 'MA', 10, ['cwe-312', 'android'],
  /\.(?:putString)\s*\(\s*"[^"]*(?:token|password|secret|apikey|api_key)[^"]*"/i,
  ['Secret stored in plain SharedPreferences', 'SharedPreferences are an unencrypted XML file readable on rooted devices and in backups.', 'Use EncryptedSharedPreferences or the Android Keystore.'],
  ['평문 SharedPreferences에 비밀 값을 저장합니다', 'SharedPreferences는 루팅 기기와 백업에서 읽히는 암호화되지 않은 XML 파일입니다.', 'EncryptedSharedPreferences나 Android Keystore를 쓰세요.'],
  'prefs.edit().putString("auth_token", token).apply()', 'securePrefs.edit().putString("theme", theme).apply()',
  { skip: (raw) => /\b(?:encrypted|secure)\w*\.edit/i.test(raw) });

module.exports = { RULES: R.rules };
