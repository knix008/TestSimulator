'use strict';

// Java. These rules also run on Kotlin and Groovy files (see
// languages.ruleLangsFor), so the patterns stay inside syntax that is either
// Java-only or means the same thing in those languages.

const { maker, nestedTernary, blankStrings } = require('./util');

const R = maker('java', ['java']);

const IF_PAREN = String.raw`\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)`;

// ── Bugs ─────────────────────────────────────────────────────
R('self-assignment', 'B', 'MA', 5, ['pitfall'],
  /^\s*([A-Za-z_][\w.]*)\s*=(?!=)\s*\1\s*;/,
  ['Variable is assigned to itself', 'A self-assignment does nothing; in a constructor it usually means this. is missing on one side.', 'Assign the parameter: this.name = name;.'],
  ['변수를 자기 자신에게 대입합니다', '자기 대입은 아무 일도 하지 않으며 생성자에서는 보통 한쪽에 this.가 빠진 것입니다.', '매개변수를 대입하세요: this.name = name;.'],
  'name = name;', 'this.name = name;');
R('identical-operands', 'B', 'MA', 5, ['pitfall'],
  /(?<![\w.])(?<![=!<>+\-*\/%&|]\s*)([A-Za-z_][\w.]*)\s*(?:==|!=|<=|>=|&&|\|\|)\s*\1(?![\w.(\[])(?=\s*(?:[);,?:]|&&|\|\||$))/,
  ['Identical expressions on both sides of an operator', 'Comparing or combining an expression with itself always gives the same result.', 'Fix the operand that was meant to differ; use Double.isNaN for NaN checks.'],
  ['연산자 양쪽 식이 같습니다', '같은 식끼리 비교하거나 묶으면 결과가 항상 같습니다.', '달라야 할 피연산자를 고치세요. NaN 검사는 Double.isNaN을 쓰세요.'],
  'if (a.size == a.size) {', ['if (a.size == b.size) {', 'if (n >= max || max == 0) {'], { ns: true });
R('nan-comparison', 'B', 'CR', 5, ['pitfall'],
  /[=!]=\s*(?:Double|Float)\.NaN\b|\b(?:Double|Float)\.NaN\s*[=!]=/,
  ['Comparison with NaN', 'NaN is not equal to anything, itself included.', 'Use Double.isNaN(x).'],
  ['NaN과 비교합니다', 'NaN은 자기 자신을 포함해 어떤 값과도 같지 않습니다.', 'Double.isNaN(x)를 쓰세요.'],
  'if (x == Double.NaN) {', 'if (Double.isNaN(x)) {');
R('float-equality', 'B', 'MI', 5, ['pitfall'],
  /[=!]=\s*-?\d+\.\d+[fFdD]?(?![\w.])/,
  ['Equality test on a floating-point literal', 'Floating-point results are rarely exactly equal to a literal.', 'Compare with a tolerance, or use BigDecimal for exact values.'],
  ['부동소수점 리터럴과 동등 비교합니다', '부동소수점 결과는 리터럴과 정확히 같은 경우가 드뭅니다.', '오차 범위로 비교하거나 정확한 값에는 BigDecimal을 쓰세요.'],
  'if (total == 0.3) {', 'if (Math.abs(total - 0.3) < 1e-9) {', { ns: true });
R('empty-statement-after-control', 'B', 'MA', 5, ['pitfall'],
  new RegExp(String.raw`^\s*(?:if|for|while)\s*${IF_PAREN}\s*;\s*$`),
  ['Semicolon right after if / for / while', 'The semicolon is the whole body, so the next block always runs.', 'Remove the semicolon.'],
  ['if / for / while 바로 뒤에 세미콜론이 있습니다', '세미콜론이 본문 전체가 되어 다음 블록이 항상 실행됩니다.', '세미콜론을 지우세요.'],
  'if (count > 0);', ['if (count > 0) run();', '} while (running);']);
R('assignment-in-condition', 'B', 'MA', 5, ['pitfall', 'cwe-481'],
  /\bif\s*\(\s*[\w.]+\s*=(?!=)\s*(?:true|false)\s*\)/,
  ['Boolean assigned inside if', 'if (done = true) assigns and is always true.', 'Use == or test the variable directly.'],
  ['if 안에서 불리언을 대입합니다', 'if (done = true)는 대입이며 항상 참입니다.', '==를 쓰거나 변수를 직접 검사하세요.'],
  'if (done = true) {', 'if (done) {');
R('bigdecimal-double', 'B', 'MA', 5, ['pitfall'],
  /\bnew\s+BigDecimal\s*\(\s*-?\d+\.\d+[dDfF]?\s*\)/,
  ['BigDecimal built from a double literal', 'new BigDecimal(0.1) keeps the binary error: 0.1000000000000000055511...', 'Use BigDecimal.valueOf(0.1) or new BigDecimal("0.1").'],
  ['double 리터럴로 BigDecimal을 만듭니다', 'new BigDecimal(0.1)은 이진 오차 0.1000000000000000055511...을 그대로 담습니다.', 'BigDecimal.valueOf(0.1)이나 new BigDecimal("0.1")을 쓰세요.'],
  'BigDecimal rate = new BigDecimal(0.1);', 'BigDecimal rate = new BigDecimal("0.1");');
R('integer-division-to-double', 'B', 'MA', 5, ['pitfall', 'cwe-682'],
  /\b(?:double|float)\s+\w+\s*=\s*-?\d+\s*\/\s*-?\d+\s*;/,
  ['Integer division stored in a floating type', '1 / 2 is integer division and gives 0 before the conversion.', 'Make one operand floating: 1.0 / 2.'],
  ['정수 나눗셈을 실수 변수에 담습니다', '1 / 2는 변환 전에 정수 나눗셈으로 0이 됩니다.', '한쪽을 실수로 만드세요: 1.0 / 2.'],
  'double half = 1 / 2;', 'double half = 1.0 / 2;');
R('thread-run', 'B', 'MA', 5, ['concurrency'],
  /\b\w*[tT]hread\w*\.run\s*\(\s*\)\s*;/,
  ['Thread.run() called directly', 'run() executes on the current thread; nothing starts in parallel.', 'Call start().'],
  ['Thread.run()을 직접 호출합니다', 'run()은 현재 스레드에서 실행되어 병렬로 시작되지 않습니다.', 'start()를 호출하세요.'],
  'worker.thread.run();', 'workerThread.start();');
R('week-year-pattern', 'B', 'MA', 5, ['pitfall'],
  /(?:SimpleDateFormat|ofPattern)\s*\(\s*"(?=[^"]*Y)(?![^"]*w)[^"]*"/,
  ['Week-based year YYYY in a date pattern', 'YYYY is the week year, which differs from the calendar year around New Year.', 'Use yyyy (or uuuu) for the calendar year.'],
  ['날짜 패턴에 주 기준 연도 YYYY를 씁니다', 'YYYY는 주 기준 연도라 새해 무렵 달력 연도와 다릅니다.', '달력 연도에는 yyyy(또는 uuuu)를 쓰세요.'],
  'new SimpleDateFormat("YYYY-MM-dd")', 'new SimpleDateFormat("yyyy-MM-dd")');
R('collection-size-zero', 'S', 'MI', 2, ['clumsy'],
  /\.size\s*\(\s*\)\s*(?:==|!=|>)\s*0\b|\.length\s*\(\s*\)\s*(?:==|!=|>)\s*0\b/,
  ['size() / length() compared with zero', 'isEmpty() states the intent and is O(1) for every collection.', 'Use isEmpty().'],
  ['size() / length()를 0과 비교합니다', 'isEmpty()가 의도를 드러내고 모든 컬렉션에서 O(1)입니다.', 'isEmpty()를 쓰세요.'],
  'if (list.size() == 0) {', 'if (list.isEmpty()) {');
R('catch-npe', 'S', 'MA', 10, ['error-handling', 'cwe-395'],
  /catch\s*\(\s*(?:final\s+)?(?:java\.lang\.)?NullPointerException\b/,
  ['NullPointerException caught', 'Catching NPE hides the bug that produced the null.', 'Check for null before dereferencing.'],
  ['NullPointerException을 잡습니다', 'NPE를 잡으면 null을 만든 버그가 숨겨집니다.', '역참조 전에 null을 검사하세요.'],
  'catch (NullPointerException e) {', 'catch (IOException e) {');
R('throws-generic', 'S', 'MA', 5, ['error-handling', 'cwe-397'],
  /\bthrows\s+(?:[\w.]+\s*,\s*)*(?:Exception|Throwable)\b(?!\w)/,
  ['Method declares throws Exception', 'Callers cannot tell which failures to expect.', 'Declare the specific checked exceptions.'],
  ['메서드가 throws Exception을 선언합니다', '호출자가 어떤 실패를 예상할지 알 수 없습니다.', '구체적인 검사 예외를 선언하세요.'],
  'public void load() throws Exception {', ['public void load() throws IOException {', 'public static void main(String[] args) throws Exception {'],
  { skip: (raw) => /\bvoid\s+main\s*\(/.test(raw) });
R('throw-generic', 'S', 'MA', 5, ['error-handling', 'cwe-397'],
  /\bthrow\s+new\s+(?:java\.lang\.)?(?:Exception|Throwable|RuntimeException|Error)\s*\(/,
  ['Generic exception thrown', 'A plain Exception or RuntimeException forces callers to catch everything.', 'Throw a specific exception such as IllegalArgumentException.'],
  ['일반 예외를 던집니다', '일반 Exception이나 RuntimeException은 호출자가 모든 것을 잡게 만듭니다.', 'IllegalArgumentException 같은 구체적인 예외를 던지세요.'],
  'throw new RuntimeException("bad id");', 'throw new IllegalArgumentException("bad id");');
R('finalize', 'S', 'MA', 10, ['deprecated'],
  /\bvoid\s+finalize\s*\(\s*\)|\.finalize\s*\(\s*\)\s*;|\bSystem\.runFinalization\s*\(/,
  ['finalize() used', 'Finalization is deprecated for removal and runs at unpredictable times.', 'Use try-with-resources or java.lang.ref.Cleaner.'],
  ['finalize()를 씁니다', '종료자는 제거 예정이며 예측할 수 없는 시점에 실행됩니다.', 'try-with-resources나 java.lang.ref.Cleaner를 쓰세요.'],
  'protected void finalize() {', 'public void close() {');
R('gc-call', 'S', 'MA', 5, ['performance'],
  /\bSystem\.gc\s*\(\s*\)|\bRuntime\.getRuntime\s*\(\s*\)\.gc\s*\(/,
  ['Explicit garbage collection', 'System.gc() can stall the whole application and is usually ignored or harmful.', 'Remove the call and tune the collector if needed.'],
  ['명시적으로 가비지 컬렉션을 부릅니다', 'System.gc()는 애플리케이션 전체를 멈출 수 있고 보통 무시되거나 해롭습니다.', '호출을 지우고 필요하면 수집기를 조정하세요.'],
  'System.gc();', 'cache.clear();');
R('wildcard-import', 'S', 'MI', 2, ['convention'],
  /^\s*import\s+(?:static\s+)?[\w.]+\.\*\s*;?\s*$/,
  ['Wildcard import', 'import x.* hides where names come from and can break when a package adds a class.', 'Import the classes you use.'],
  ['와일드카드 import입니다', 'import x.*는 이름의 출처를 숨기고 패키지에 클래스가 늘면 깨질 수 있습니다.', '쓰는 클래스를 import하세요.'],
  'import java.util.*;', 'import java.util.List;');
R('empty-method', 'S', 'MI', 5, ['suspicious'],
  /\b(?:public|private|protected)\s+(?:static\s+|final\s+|synchronized\s+)*(?!(?:record|class|interface|enum)\b)[\w<>\[\],? ]+\s+\w+\s*\([^)]*\)\s*(?:throws\s+[\w.,\s]+)?\{\s*\}/,
  ['Empty method', 'An empty method is unfinished, or should explain why it does nothing.', 'Implement it, throw UnsupportedOperationException, or add a comment.'],
  ['빈 메서드입니다', '빈 메서드는 미완성이거나 왜 아무 일도 안 하는지 설명해야 합니다.', '구현하거나 UnsupportedOperationException을 던지거나 주석을 다세요.'],
  'public void onStop() {}', ['public void onStop() { save(); }', 'public Foo() {}', 'public record Point(int x, int y) { }', 'public void onStop() { /* nothing to release */ }'],
  // A comment between the braces is the explanation the rule asks for.
  { skip: (raw) => /\{\s*(?:\/\*|\/\/)/.test(raw) });
R('class-naming', 'S', 'MI', 2, ['convention'],
  /\b(?:class|interface|enum|record)\s+[a-z]\w*\s*[{<(]|\b(?:class|interface|enum|record)\s+[a-z]\w*\s+(?:extends|implements)\b/,
  ['Type name not in PascalCase', 'Java types start with an upper-case letter.', 'Rename the type to PascalCase.'],
  ['타입 이름이 PascalCase가 아닙니다', 'Java 타입 이름은 대문자로 시작합니다.', '타입 이름을 PascalCase로 바꾸세요.'],
  'public class orderService {', 'public class OrderService {', { ns: true });
R('constant-naming', 'S', 'MI', 2, ['convention'],
  /\bstatic\s+final\s+(?!class\b)[\w<>\[\],? ]+\s+[a-z][a-zA-Z0-9]*\s*=/,
  ['Constant not in UPPER_SNAKE_CASE', 'static final fields are constants and are named like MAX_SIZE.', 'Rename the constant.'],
  ['상수가 UPPER_SNAKE_CASE가 아닙니다', 'static final 필드는 상수이며 MAX_SIZE처럼 이름 짓습니다.', '상수 이름을 바꾸세요.'],
  'private static final int maxSize = 10;', ['private static final int MAX_SIZE = 10;', 'private static final long serialVersionUID = 1L;', 'private static final Logger log = LoggerFactory.getLogger(A.class);'],
  { skip: (raw) => /\b(?:serialVersionUID|log|logger|LOG|LOGGER)\s*=/.test(raw) });
R('redundant-boolean', 'S', 'MI', 2, ['clumsy'],
  /[=!]=\s*(?:true|false)\b|\b(?:true|false)\s*[=!]=/,
  ['Comparison with a boolean literal', 'x == true is just x.', 'Use the expression directly, or negate it.'],
  ['불리언 리터럴과 비교합니다', 'x == true는 그냥 x입니다.', '식을 그대로 쓰거나 부정하세요.'],
  'if (valid == true) {', 'if (valid) {',
  // Kotlin files run this rule too, where flag == true is the idiom for a Boolean? (null counts as false).
  { skip: (raw, line, file) => (file && file.lang === 'kt') || !/[=!]=\s*(?:true|false)\b|\b(?:true|false)\s*[=!]=/.test(blankStrings(line)) });
R('boolean-ternary', 'S', 'MI', 2, ['clumsy'],
  /\?\s*true\s*:\s*false\b|\?\s*false\s*:\s*true\b/,
  ['Ternary returning true / false', 'cond ? true : false is just cond.', 'Use the condition or its negation.'],
  ['true / false를 돌려주는 삼항입니다', 'cond ? true : false는 cond 그대로입니다.', '조건이나 그 부정을 쓰세요.'],
  'return count > 0 ? true : false;', 'return count > 0;');
R('nested-ternary', 'S', 'MA', 5, ['confusing'],
  /[\s)\]]\?\s.*[\s)\]]\?\s/,
  ['Nested ternary operator', 'Chained ?: expressions are hard to read.', 'Use if / else or a switch expression.'],
  ['중첩된 삼항 연산자입니다', '이어진 ?: 식은 읽기 어렵습니다.', 'if / else나 switch 식을 쓰세요.'],
  'String s = a ? "x" : b ? "y" : "z";', ['String s = a ? "x" : "z";', 'String t = (e ? "-" : h) + (f ? "" : g);', 'List<?> items = ready ? all : none;'],
  { skip: (raw, line) => !nestedTernary(line) });
R('lowercase-long-suffix', 'S', 'MI', 2, ['convention'],
  /(?<![\w.])\d+l\b/,
  ['Long literal with lower-case l', '10l looks like 101.', 'Use an upper-case L: 10L.'],
  ['소문자 l 접미사 long 리터럴입니다', '10l은 101처럼 보입니다.', '대문자 L을 쓰세요: 10L.'],
  'long timeout = 30l;', 'long timeout = 30L;', { ns: true });
R('wrapper-constructor', 'S', 'MA', 5, ['deprecated'],
  /\bnew\s+(?:Boolean|Integer|Long|Short|Byte|Character|Double|Float)\s*\(/,
  ['Boxed-primitive constructor', 'These constructors are deprecated for removal and bypass the value cache.', 'Use valueOf or autoboxing.'],
  ['박싱 래퍼 생성자를 씁니다', '이 생성자들은 제거 예정이며 값 캐시를 우회합니다.', 'valueOf나 자동 박싱을 쓰세요.'],
  'Integer n = new Integer(5);', 'Integer n = Integer.valueOf(5);');
R('string-constructor', 'S', 'MI', 2, ['performance'],
  /\bnew\s+String\s*\(\s*"/,
  ['new String("literal")', 'Wrapping a literal creates a needless copy.', 'Use the literal.'],
  ['new String("리터럴")', '리터럴을 감싸면 쓸데없는 복사본이 생깁니다.', '리터럴을 그대로 쓰세요.'],
  'String s = new String("ok");', 'String s = "ok";');
R('legacy-collection', 'S', 'MI', 5, ['performance'],
  /\bnew\s+(?:Vector|Hashtable|Stack)\s*[<(]/,
  ['Synchronized legacy collection', 'Vector, Hashtable and Stack lock on every call.', 'Use ArrayList, HashMap / ConcurrentHashMap or ArrayDeque.'],
  ['동기화된 예전 컬렉션입니다', 'Vector, Hashtable, Stack은 호출마다 잠급니다.', 'ArrayList, HashMap / ConcurrentHashMap, ArrayDeque를 쓰세요.'],
  'List<String> names = new Vector<>();', 'List<String> names = new ArrayList<>();');
R('string-buffer', 'S', 'MI', 2, ['performance'],
  /\bnew\s+StringBuffer\s*\(/,
  ['StringBuffer in new code', 'StringBuffer synchronizes every append.', 'Use StringBuilder.'],
  ['새 코드에 StringBuffer를 씁니다', 'StringBuffer는 append마다 동기화합니다.', 'StringBuilder를 쓰세요.'],
  'StringBuffer sb = new StringBuffer();', 'StringBuilder sb = new StringBuilder();');
R('literal-equals-order', 'S', 'MI', 2, ['pitfall'],
  /\b[a-z]\w*\.equals(?:IgnoreCase)?\s*\(\s*"[^"]*"\s*\)/,
  ['Literal on the right of equals', 'name.equals("x") throws if name is null; "x".equals(name) does not.', 'Put the literal first, or use Objects.equals.'],
  ['equals 오른쪽에 리터럴이 있습니다', 'name이 null이면 name.equals("x")는 예외를 던지지만 "x".equals(name)은 아닙니다.', '리터럴을 앞에 두거나 Objects.equals를 쓰세요.'],
  'if (mode.equals("edit")) {', 'if ("edit".equals(mode)) {');
R('android-log', 'S', 'MI', 2, ['debug', 'android'],
  /\bLog\.[dv]\s*\(/,
  ['Android debug / verbose log', 'Debug logs ship in release builds and can leak data to logcat.', 'Strip them with R8 rules or guard them with BuildConfig.DEBUG.'],
  ['Android debug / verbose 로그입니다', '디버그 로그가 릴리스 빌드에 남아 logcat으로 데이터가 샐 수 있습니다.', 'R8 규칙으로 지우거나 BuildConfig.DEBUG로 감싸세요.'],
  'Log.d(TAG, "token=" + token);', 'Log.w(TAG, "sync failed");');

// ── Vulnerabilities and hotspots ─────────────────────────────
R('weak-hash-other', 'H', 'CR', 15, ['cwe-328', 'owasp-a02', 'crypto'],
  /\bMessageDigest\.getInstance\s*\(\s*"(?:MD2|MD4)"|\bDigestUtils\.(?:md2|md5|sha|sha1)(?:Hex)?\s*\(|\bHashing\.(?:md5|sha1)\s*\(/,
  ['Weak hash algorithm', 'MD2, MD4, MD5 and SHA-1 have practical collisions.', 'Use SHA-256 or stronger.'],
  ['약한 해시 알고리즘입니다', 'MD2, MD4, MD5, SHA-1은 실제 충돌이 있습니다.', 'SHA-256 이상을 쓰세요.'],
  'String h = DigestUtils.md5Hex(data);', 'String h = DigestUtils.sha256Hex(data);');
R('ecb-mode', 'V', 'CR', 30, ['cwe-327', 'owasp-a02', 'crypto'],
  /\bCipher\.getInstance\s*\(\s*"(?:[A-Za-z0-9]+\/ECB\/[^"]*|AES|DES|DESede)"\s*\)/,
  ['ECB cipher mode', 'ECB, also the default for "AES", leaks patterns of the plaintext.', 'Use "AES/GCM/NoPadding" with a random IV.'],
  ['ECB 암호 모드입니다', '"AES"의 기본값이기도 한 ECB는 평문 패턴을 드러냅니다.', '무작위 IV와 함께 "AES/GCM/NoPadding"을 쓰세요.'],
  'Cipher c = Cipher.getInstance("AES/ECB/PKCS5Padding");', 'Cipher c = Cipher.getInstance("AES/GCM/NoPadding");');
R('rsa-no-padding', 'V', 'CR', 20, ['cwe-780', 'owasp-a02', 'crypto'],
  /\bCipher\.getInstance\s*\(\s*"RSA(?:\/[^"\/]*\/(?:NoPadding|PKCS1Padding))?"\s*\)/,
  ['RSA without OAEP padding', 'Raw or PKCS#1 v1.5 RSA encryption is open to padding-oracle attacks.', 'Use "RSA/ECB/OAEPWithSHA-256AndMGF1Padding".'],
  ['OAEP 패딩 없는 RSA입니다', '패딩 없는 RSA나 PKCS#1 v1.5 암호화는 패딩 오라클 공격에 취약합니다.', '"RSA/ECB/OAEPWithSHA-256AndMGF1Padding"을 쓰세요.'],
  'Cipher c = Cipher.getInstance("RSA/ECB/PKCS1Padding");', 'Cipher c = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding");');
R('weak-tls', 'V', 'CR', 15, ['cwe-326', 'owasp-a02', 'tls'],
  /\bSSLContext\.getInstance\s*\(\s*"(?:SSL|SSLv2|SSLv3|TLSv1|TLSv1\.1)"/,
  ['Outdated SSL / TLS protocol', 'SSL and TLS 1.0 / 1.1 have known attacks.', 'Use "TLSv1.3" or "TLSv1.2".'],
  ['낡은 SSL / TLS 프로토콜입니다', 'SSL과 TLS 1.0 / 1.1에는 알려진 공격이 있습니다.', '"TLSv1.3"이나 "TLSv1.2"를 쓰세요.'],
  'SSLContext ctx = SSLContext.getInstance("TLSv1");', 'SSLContext ctx = SSLContext.getInstance("TLSv1.3");');
R('trust-all-certificates', 'V', 'BL', 30, ['cwe-295', 'owasp-a07', 'tls'],
  /\bcheck(?:Server|Client)Trusted\s*\([^)]*\)\s*(?:throws\s+[\w.]+\s*)?\{\s*\}/,
  ['TrustManager accepts every certificate', 'An empty checkServerTrusted trusts any server, allowing man-in-the-middle.', 'Use the default TrustManager or pin the expected certificate.'],
  ['TrustManager가 모든 인증서를 받아들입니다', '빈 checkServerTrusted는 아무 서버나 믿어 중간자 공격을 허용합니다.', '기본 TrustManager를 쓰거나 기대 인증서를 고정하세요.'],
  'public void checkServerTrusted(X509Certificate[] c, String a) {}', 'public void checkServerTrusted(X509Certificate[] c, String a) throws CertificateException { delegate.checkServerTrusted(c, a); }');
R('hostname-verifier', 'V', 'CR', 20, ['cwe-297', 'owasp-a07', 'tls'],
  /\bverify\s*\(\s*String\s+\w+\s*,\s*SSLSession\s+\w+\s*\)\s*\{\s*return\s+true|\bALLOW_ALL_HOSTNAME_VERIFIER\b|\bNoopHostnameVerifier\b|\(\s*\w+\s*,\s*\w+\s*\)\s*->\s*true/,
  ['Host name verification disabled', 'Accepting any host name lets a valid certificate for another site impersonate yours.', 'Use the default HostnameVerifier.'],
  ['호스트 이름 검증을 끕니다', '아무 호스트 이름이나 받으면 다른 사이트의 유효한 인증서로 사칭할 수 있습니다.', '기본 HostnameVerifier를 쓰세요.'],
  ['conn.setHostnameVerifier(NoopHostnameVerifier.INSTANCE);', 'conn.setHostnameVerifier((host, session) -> true);'],
  ['conn.setHostnameVerifier(HttpsURLConnection.getDefaultHostnameVerifier());', 'map.merge(key, value, (a, b) -> true);', 'BiPredicate<String, String> any = (a, b) -> true;'],
  // An (a, b) -> true lambda counts only where a host name verifier is set or declared.
  { skip: (raw, line) => !/\bverify\s*\(\s*String|\bALLOW_ALL_HOSTNAME_VERIFIER\b|\bNoopHostnameVerifier\b/.test(line) && !/HostnameVerifier/.test(line) });
R('cookie-not-secure', 'H', 'MA', 5, ['cwe-614', 'owasp-a05', 'cookie'],
  /\.setSecure\s*\(\s*false\s*\)/,
  ['Cookie without the Secure flag', 'The cookie is also sent over plain HTTP.', 'Call setSecure(true).'],
  ['Secure 속성이 없는 쿠키입니다', '쿠키가 평문 HTTP로도 전송됩니다.', 'setSecure(true)를 호출하세요.'],
  'cookie.setSecure(false);', 'cookie.setSecure(true);');
R('cookie-not-httponly', 'H', 'MA', 5, ['cwe-1004', 'owasp-a05', 'cookie'],
  /\.setHttpOnly\s*\(\s*false\s*\)/,
  ['Cookie readable from script', 'Without HttpOnly an injected script can steal the cookie.', 'Call setHttpOnly(true).'],
  ['스크립트가 읽을 수 있는 쿠키입니다', 'HttpOnly가 없으면 주입된 스크립트가 쿠키를 훔칠 수 있습니다.', 'setHttpOnly(true)를 호출하세요.'],
  'cookie.setHttpOnly(false);', 'cookie.setHttpOnly(true);');
R('cors-any-origin', 'H', 'MA', 10, ['cwe-942', 'owasp-a05'],
  /"Access-Control-Allow-Origin"\s*,\s*"\*"|\ballowedOrigins\s*\(\s*"\*"\s*\)|\baddAllowedOrigin\s*\(\s*"\*"\s*\)|@CrossOrigin\s*(?:\(\s*\)|\(\s*(?:origins\s*=\s*)?"\*"|$)/,
  ['CORS allows any origin', 'Any site can read responses meant for your front end.', 'List the allowed origins.'],
  ['CORS가 모든 origin을 허용합니다', '아무 사이트나 프런트엔드용 응답을 읽을 수 있습니다.', '허용할 origin을 나열하세요.'],
  'registry.addMapping("/**").allowedOrigins("*");', 'registry.addMapping("/**").allowedOrigins("https://app.example.com");');
R('csrf-disabled', 'H', 'MA', 10, ['cwe-352', 'owasp-a01'],
  /\.csrf\s*\(\s*\)\s*\.disable\s*\(|\.csrf\s*\(\s*(?:AbstractHttpConfigurer::disable|\w+\s*->\s*\w+\.disable\s*\(\s*\))/,
  ['CSRF protection disabled', 'Browser sessions can be driven by another site to change state.', 'Keep CSRF on for cookie-based sessions.'],
  ['CSRF 보호를 끕니다', '다른 사이트가 브라우저 세션으로 상태를 바꿀 수 있습니다.', '쿠키 기반 세션에서는 CSRF를 켜 두세요.'],
  'http.csrf().disable();', 'http.csrf(Customizer.withDefaults());');
R('xxe-factories', 'H', 'MA', 15, ['cwe-611', 'owasp-a05', 'xml'],
  /\b(?:SAXParserFactory|XMLInputFactory|TransformerFactory|SchemaFactory|XMLReaderFactory|SAXTransformerFactory)\.(?:newInstance|newFactory|newDefaultFactory|createXMLReader)\s*\(|\bnew\s+(?:SAXReader|SAXBuilder)\s*\(/,
  ['XML parser that may resolve external entities', 'Unless DTDs and external entities are disabled, input can read local files (XXE).', 'Set FEATURE_SECURE_PROCESSING and disallow DOCTYPE declarations.'],
  ['외부 엔티티를 해석할 수 있는 XML 파서입니다', 'DTD와 외부 엔티티를 끄지 않으면 입력이 로컬 파일을 읽을 수 있습니다(XXE).', 'FEATURE_SECURE_PROCESSING을 켜고 DOCTYPE 선언을 금지하세요.'],
  'SAXParserFactory f = SAXParserFactory.newInstance();', 'SAXParserFactory f = secureSaxFactory();');
R('ldap-injection', 'V', 'CR', 20, ['cwe-90', 'owasp-a03'],
  /\.search\s*\([^;]*"\s*\(\s*\w+\s*=\s*"\s*\+/,
  ['LDAP filter built by concatenation', 'Input with * or ) changes the filter and can bypass authentication.', 'Use a parameterized filter with {0} arguments, or escape the value.'],
  ['문자열 연결로 LDAP 필터를 만듭니다', '* 나 )가 든 입력은 필터를 바꿔 인증을 우회할 수 있습니다.', '{0} 인자를 쓰는 매개변수 필터를 쓰거나 값을 이스케이프하세요.'],
  'ctx.search(base, "(uid=" + user + ")", controls);', 'ctx.search(base, "(uid={0})", new Object[] { user }, controls);');
R('xpath-injection', 'V', 'CR', 20, ['cwe-643', 'owasp-a03'],
  /\bxpath\w*\.(?:compile|evaluate)\s*\(\s*"[^"]*"\s*\+/i,
  ['XPath expression built by concatenation', 'Input can change the query and read other nodes.', 'Use XPathVariableResolver with variables.'],
  ['문자열 연결로 XPath 식을 만듭니다', '입력이 질의를 바꿔 다른 노드를 읽을 수 있습니다.', '변수와 XPathVariableResolver를 쓰세요.'],
  'xpath.compile("//user[@name=\'" + name + "\']");', 'xpath.compile("//user[@name=$name]");');
R('path-from-request', 'V', 'CR', 20, ['cwe-22', 'owasp-a01'],
  /\b(?:new\s+File(?:InputStream|OutputStream|Reader|Writer)?|Paths\.get|Path\.of)\s*\([^;]*\brequest\.getParameter\s*\(/,
  ['File path from a request parameter', 'A path built from input can use ../ to reach any file.', 'Normalize the path and check it stays inside the base folder.'],
  ['요청 매개변수로 파일 경로를 만듭니다', '입력으로 만든 경로는 ../로 아무 파일에나 닿을 수 있습니다.', '경로를 정규화하고 기준 폴더 안인지 확인하세요.'],
  'File f = new File(base, request.getParameter("name"));', 'File f = new File(base, safeName(name));');
R('open-redirect', 'V', 'CR', 20, ['cwe-601', 'owasp-a01'],
  /\.sendRedirect\s*\(\s*request\.getParameter\s*\(/,
  ['Redirect to a request parameter', 'Redirecting to a user-supplied URL sends victims to phishing sites.', 'Redirect only to known paths.'],
  ['요청 매개변수로 리다이렉트합니다', '사용자가 준 URL로 보내면 피싱 사이트로 유도됩니다.', '알려진 경로로만 보내세요.'],
  'response.sendRedirect(request.getParameter("next"));', 'response.sendRedirect("/home");');
R('reflected-xss', 'V', 'CR', 20, ['cwe-79', 'owasp-a03', 'xss'],
  /\bgetWriter\s*\(\s*\)\s*\.(?:print|println|write|append)\s*\([^;]*\brequest\.getParameter\s*\(/,
  ['Request parameter written to the response', 'Echoing input unescaped is reflected XSS.', 'Escape with an encoder such as OWASP Java Encoder.'],
  ['요청 매개변수를 응답에 씁니다', '이스케이프 없이 입력을 되돌리면 반사형 XSS입니다.', 'OWASP Java Encoder 같은 인코더로 이스케이프하세요.'],
  'response.getWriter().println(request.getParameter("q"));', 'response.getWriter().println(Encode.forHtml(q));');
// Every ObjectInputStream is reported whatever the stream's origin: a place to review (hotspot).
R('unsafe-deserialization', 'H', 'CR', 30, ['cwe-502', 'owasp-a08'],
  /\bnew\s+(?:ObjectInputStream|XMLDecoder)\s*\(|\bxstream\.fromXML\s*\(/i,
  ['Java deserialization of a stream', 'Deserializing untrusted bytes can run gadget-chain code.', 'Use a data format such as JSON, or an ObjectInputFilter allow list.'],
  ['스트림을 Java 역직렬화합니다', '신뢰할 수 없는 바이트를 역직렬화하면 가젯 체인 코드가 실행될 수 있습니다.', 'JSON 같은 데이터 형식이나 ObjectInputFilter 허용 목록을 쓰세요.'],
  'ObjectInputStream in = new ObjectInputStream(socket.getInputStream());', 'Order o = mapper.readValue(body, Order.class);');
R('expression-injection', 'H', 'CR', 20, ['cwe-917', 'owasp-a03'],
  /\.parseExpression\s*\(\s*(?!")[\w.]+/,
  ['Expression language parsed from a variable', 'SpEL / EL evaluated from input can call any method.', 'Never parse expressions from input; use SimpleEvaluationContext if you must.'],
  ['변수로 표현 언어를 파싱합니다', '입력으로 평가한 SpEL / EL은 아무 메서드나 호출할 수 있습니다.', '입력으로 식을 파싱하지 말고 꼭 필요하면 SimpleEvaluationContext를 쓰세요.'],
  'parser.parseExpression(userInput).getValue(ctx);', 'parser.parseExpression("price * 2").getValue(ctx);');
R('script-engine', 'H', 'MA', 15, ['cwe-95', 'owasp-a03'],
  /\bgetEngineByName\s*\(|\bgetEngineByExtension\s*\(/,
  ['Script engine evaluation', 'A script engine fed with data runs that data as code.', 'Avoid evaluating scripts built from input.'],
  ['스크립트 엔진으로 평가합니다', '데이터를 넣은 스크립트 엔진은 그 데이터를 코드로 실행합니다.', '입력으로 만든 스크립트를 평가하지 마세요.'],
  'ScriptEngine js = manager.getEngineByName("nashorn");', 'Calculator calc = new Calculator();');
R('reflection-class-name', 'H', 'MA', 15, ['cwe-470', 'owasp-a03'],
  /\bClass\.forName\s*\(\s*(?!")[\w.]+/,
  ['Class loaded by a computed name', 'Choosing a class from input can instantiate unexpected types.', 'Map allowed names to classes explicitly.'],
  ['계산된 이름으로 클래스를 불러옵니다', '입력으로 클래스를 고르면 예상치 못한 타입이 만들어질 수 있습니다.', '허용할 이름을 클래스에 명시적으로 대응시키세요.'],
  'Class<?> c = Class.forName(typeName);', 'Class<?> c = Class.forName("org.h2.Driver");');
R('predictable-seed', 'V', 'MA', 10, ['cwe-335', 'owasp-a02', 'crypto'],
  /\bnew\s+SecureRandom\s*\(\s*(?:"|\w+\.getBytes|new\s+byte)|\.setSeed\s*\(\s*(?:\d|"|System\.currentTimeMillis)/,
  ['SecureRandom seeded with a fixed or guessable value', 'A known seed makes the output predictable.', 'Use new SecureRandom() without a seed.'],
  ['고정되었거나 추측 가능한 값으로 SecureRandom을 시드합니다', '알려진 시드는 출력을 예측 가능하게 만듭니다.', '시드 없이 new SecureRandom()을 쓰세요.'],
  'random.setSeed(42);', 'SecureRandom random = new SecureRandom();');
R('weak-key-size', 'V', 'CR', 15, ['cwe-326', 'owasp-a02', 'crypto'],
  /\.initialize\s*\(\s*(?:512|768|1024)\s*[,)]|\bKeyGenerator\b[^;]*\.init\s*\(\s*(?:40|56|64)\s*\)/,
  ['Key size too small', 'RSA / DSA / DH keys of 1024 bits or less can be broken.', 'Use 2048 bits or more, or an elliptic curve.'],
  ['키 크기가 너무 작습니다', '1024비트 이하 RSA / DSA / DH 키는 깨질 수 있습니다.', '2048비트 이상이나 타원 곡선을 쓰세요.'],
  'kpg.initialize(1024);', 'kpg.initialize(3072);');
R('pbe-iterations', 'V', 'MA', 10, ['cwe-916', 'owasp-a02', 'crypto'],
  /\bnew\s+PBEKeySpec\s*\([^;]*,\s*(?:\d{1,3}|[1-9]\d{3})\s*,/,
  ['Password key derivation with too few iterations', 'Fewer than 10,000 iterations make password guessing cheap.', 'Use at least 600,000 iterations for PBKDF2-SHA256.'],
  ['반복 횟수가 적은 비밀번호 키 유도입니다', '1만 회 미만 반복은 비밀번호 추측을 싸게 만듭니다.', 'PBKDF2-SHA256 기준 최소 60만 회를 쓰세요.'],
  'new PBEKeySpec(pw, salt, 1000, 256);', 'new PBEKeySpec(pw, salt, 600000, 256);');
R('static-iv', 'V', 'CR', 15, ['cwe-329', 'owasp-a02', 'crypto'],
  /\bnew\s+IvParameterSpec\s*\(\s*(?:new\s+byte\s*\[\s*\d+\s*\]|new\s+byte\s*\[\s*\]\s*\{|"[^"]*"\s*\.getBytes)/,
  ['Fixed initialization vector', 'Reusing a constant IV makes equal plaintexts encrypt the same way.', 'Generate a random IV with SecureRandom for each message.'],
  ['고정된 초기화 벡터입니다', '상수 IV를 재사용하면 같은 평문이 같게 암호화됩니다.', '메시지마다 SecureRandom으로 무작위 IV를 만드세요.'],
  'IvParameterSpec iv = new IvParameterSpec(new byte[16]);', 'IvParameterSpec iv = new IvParameterSpec(randomIv);');
R('world-permissions', 'V', 'MA', 10, ['cwe-732', 'owasp-a01'],
  /\bPosixFilePermissions\.fromString\s*\(\s*"[r-][w-][x-][r-][w-][x-][r-]w[x-]"|\bPosixFilePermission\.OTHERS_WRITE\b|\.set(?:Readable|Writable|Executable)\s*\(\s*true\s*,\s*false\s*\)/,
  ['File writable by everyone', 'Other users on the machine can change the file.', 'Grant owner-only permissions such as rw-------.'],
  ['모두가 쓸 수 있는 파일입니다', '기계의 다른 사용자가 파일을 바꿀 수 있습니다.', 'rw------- 같은 소유자 전용 권한을 주세요.'],
  'Files.setPosixFilePermissions(p, PosixFilePermissions.fromString("rwxrwxrwx"));', 'Files.setPosixFilePermissions(p, PosixFilePermissions.fromString("rw-------"));');
R('temp-file', 'H', 'MI', 5, ['cwe-377', 'owasp-a01'],
  /\bFile\.createTempFile\s*\(/,
  ['File.createTempFile', 'The file is created with default permissions in a shared folder.', 'Use Files.createTempFile with owner-only PosixFilePermissions.'],
  ['File.createTempFile을 씁니다', '공유 폴더에 기본 권한으로 파일이 만들어집니다.', '소유자 전용 PosixFilePermissions와 함께 Files.createTempFile을 쓰세요.'],
  'File tmp = File.createTempFile("x", ".tmp");', 'Path tmp = Files.createTempFile("x", ".tmp", ownerOnly);');
R('jwt-unverified', 'V', 'CR', 20, ['cwe-347', 'owasp-a02', 'jwt'],
  /\bJWT\.decode\s*\(|\bJwts\.parser\s*\(\s*\)\s*\.parse\s*\(|\.parseUnsecuredClaims\s*\(|\.parseClaimsJwt\s*\(/,
  ['JWT read without signature check', 'Claims from an unverified token can be forged.', 'Verify with the key, for example JWT.require(alg).build().verify(token).'],
  ['서명 확인 없이 JWT를 읽습니다', '검증하지 않은 토큰의 클레임은 위조될 수 있습니다.', '키로 검증하세요. 예: JWT.require(alg).build().verify(token).'],
  'DecodedJWT jwt = JWT.decode(token);', 'DecodedJWT jwt = verifier.verify(token);');
R('hardcoded-db-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\bDriverManager\.getConnection\s*\([^;]*,\s*"[^"]*"\s*,\s*"[^"]+"\s*\)/,
  ['Database password in the source', 'Anyone with the code or the binary has the password.', 'Read credentials from the environment or a vault.'],
  ['소스에 데이터베이스 비밀번호가 있습니다', '코드나 바이너리를 가진 누구나 비밀번호를 압니다.', '자격 증명을 환경이나 금고에서 읽으세요.'],
  'DriverManager.getConnection(url, "app", "s3cret");', 'DriverManager.getConnection(url, user, password);');
R('prepare-concat', 'V', 'CR', 20, ['cwe-89', 'owasp-a03', 'sql'],
  /\bprepare(?:Statement|Call)\s*\(\s*"[^"]*"\s*\+|\b(?:rawQuery|execSQL)\s*\(\s*"[^"]*"\s*\+/,
  ['SQL built by concatenation', 'Concatenating values into SQL defeats the prepared statement and allows injection.', 'Use ? placeholders and bind the values.'],
  ['문자열 연결로 SQL을 만듭니다', '값을 SQL에 이어 붙이면 준비된 문장이 무력해져 주입이 가능합니다.', '? 자리표시자를 쓰고 값을 바인딩하세요.'],
  'conn.prepareStatement("select * from t where id=" + id);', 'conn.prepareStatement("select * from t where id = ?");');
R('webview-javascript', 'H', 'MA', 10, ['cwe-79', 'android'],
  /\bsetJavaScriptEnabled\s*\(\s*true\s*\)|\baddJavascriptInterface\s*\(/,
  ['WebView JavaScript enabled', 'Script in a WebView can reach exposed Java objects and local data.', 'Enable it only for trusted content and limit exposed interfaces.'],
  ['WebView JavaScript를 켭니다', 'WebView의 스크립트가 노출된 Java 객체와 로컬 데이터에 닿을 수 있습니다.', '신뢰한 콘텐츠에만 켜고 노출 인터페이스를 줄이세요.'],
  'settings.setJavaScriptEnabled(true);', 'settings.setJavaScriptEnabled(false);');
R('webview-file-access', 'V', 'MA', 10, ['cwe-200', 'android'],
  /\bsetAllow(?:FileAccess|FileAccessFromFileURLs|UniversalAccessFromFileURLs|ContentAccess)\s*\(\s*true\s*\)/,
  ['WebView file access enabled', 'Pages loaded in the WebView can read local files.', 'Turn file access off.'],
  ['WebView 파일 접근을 켭니다', 'WebView에 로드된 페이지가 로컬 파일을 읽을 수 있습니다.', '파일 접근을 끄세요.'],
  'settings.setAllowUniversalAccessFromFileURLs(true);', 'settings.setAllowFileAccess(false);');
R('world-readable-mode', 'V', 'MA', 10, ['cwe-732', 'android'],
  /\bMODE_WORLD_(?:READABLE|WRITEABLE)\b/,
  ['World-readable / writable Android file', 'Every app on the device can read or change the file.', 'Use MODE_PRIVATE and share through a ContentProvider.'],
  ['모두가 읽고 쓸 수 있는 Android 파일입니다', '기기의 모든 앱이 파일을 읽거나 바꿀 수 있습니다.', 'MODE_PRIVATE를 쓰고 ContentProvider로 공유하세요.'],
  'openFileOutput("prefs", MODE_WORLD_READABLE);', 'openFileOutput("prefs", MODE_PRIVATE);');

module.exports = { RULES: R.rules };
