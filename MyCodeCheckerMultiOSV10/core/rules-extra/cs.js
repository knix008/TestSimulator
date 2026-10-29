'use strict';

// C#.

const { maker, nestedTernary, blankStrings } = require('./util');

const make = maker('cs', ['cs']);
// The patterns describe code, so a match must survive blanking the string
// literals ("async void" in a message is not async void). A rule that reads
// string contents itself passes { strings: true }.
function R(id, type, sev, debtMin, tags, re, en, ko, bad, good, opts = {}) {
  return make(id, type, sev, debtMin, tags, re, en, ko, bad, good, opts.strings ? opts : { ns: true, ...opts });
}
R.rules = make.rules;

const IF_PAREN = String.raw`\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)`;
const MODS = String.raw`(?:(?:static|virtual|override|async|sealed|new|unsafe|extern|readonly)\s+)*`;

// `while (cond);` / `for (init; cond; step);` whose condition itself does the
// work (++, --, an assignment or a call) is a deliberate empty loop.
function loopDoesWork(line) {
  const m = /^\s*(while|for)\s*\((.*)\)\s*;\s*$/.exec(blankStrings(line));
  if (!m) return false;
  let cond = m[2];
  if (m[1] === 'for') {
    const parts = cond.split(';');
    if (parts.length !== 3) return false;
    cond = parts[1];
  }
  return /\+\+|--|[^=!<>]=(?!=)|[\w\])]\s*\(/.test(cond);
}

// ── Bugs ─────────────────────────────────────────────────────
R('self-assignment', 'B', 'MA', 5, ['pitfall'],
  /^\s*([A-Za-z_][\w.]*)\s*=(?![=>])\s*\1\s*;/,
  ['Variable is assigned to itself', 'A self-assignment does nothing; in a constructor this. is usually missing.', 'Assign the parameter: this.name = name;.'],
  ['변수를 자기 자신에게 대입합니다', '자기 대입은 아무 일도 하지 않으며 생성자에서는 보통 this.가 빠진 것입니다.', '매개변수를 대입하세요: this.name = name;.'],
  'name = name;', 'this.name = name;');
R('identical-operands', 'B', 'MA', 5, ['pitfall'],
  /(?<![\w.])(?<![=!<>+\-*\/%&|]\s*)([A-Za-z_][\w.]*)\s*(?:==|!=|<=|>=|&&|\|\|)\s*\1(?![\w.(\[])(?=\s*(?:[);,?:]|&&|\|\||$))/,
  ['Identical expressions on both sides of an operator', 'Comparing or combining an expression with itself always gives the same result.', 'Fix the operand that was meant to differ; use double.IsNaN for NaN checks.'],
  ['연산자 양쪽 식이 같습니다', '같은 식끼리 비교하거나 묶으면 결과가 항상 같습니다.', '달라야 할 피연산자를 고치세요. NaN 검사는 double.IsNaN을 쓰세요.'],
  'if (a.Count == a.Count) {', ['if (a.Count == b.Count) {', 'if (n >= max || max == 0) {'], { ns: true });
R('nan-comparison', 'B', 'CR', 5, ['pitfall'],
  /[=!]=\s*(?:double|float|Double|Single)\.NaN\b|\b(?:double|float|Double|Single)\.NaN\s*[=!]=/,
  ['Comparison with NaN', 'NaN is not equal to anything, itself included.', 'Use double.IsNaN(x).'],
  ['NaN과 비교합니다', 'NaN은 자기 자신을 포함해 어떤 값과도 같지 않습니다.', 'double.IsNaN(x)를 쓰세요.'],
  'if (x == double.NaN) {', 'if (double.IsNaN(x)) {');
R('float-equality', 'B', 'MI', 5, ['pitfall'],
  /[=!]=\s*-?\d+\.\d+[fFdDmM]?(?![\w.])/,
  ['Equality test on a floating-point literal', 'Floating-point results are rarely exactly equal to a literal.', 'Compare with a tolerance, or use decimal for exact values.'],
  ['부동소수점 리터럴과 동등 비교합니다', '부동소수점 결과는 리터럴과 정확히 같은 경우가 드뭅니다.', '오차 범위로 비교하거나 정확한 값에는 decimal을 쓰세요.'],
  'if (ratio == 0.3) {', 'if (Math.Abs(ratio - 0.3) < 1e-9) {', { ns: true, skip: (raw) => /\d[mM]\b/.test(raw) });
R('empty-statement-after-control', 'B', 'MA', 5, ['pitfall'],
  new RegExp(String.raw`^\s*(?:if|for|foreach|while)\s*${IF_PAREN}\s*;\s*$`),
  ['Semicolon right after if / for / while', 'The semicolon is the whole body, so the next block always runs.', 'Remove the semicolon.'],
  ['if / for / while 바로 뒤에 세미콜론이 있습니다', '세미콜론이 본문 전체가 되어 다음 블록이 항상 실행됩니다.', '세미콜론을 지우세요.'],
  'if (count > 0);', ['if (count > 0) Run();', '} while (running);', 'while (--k >= 0 && ++iv[k] == 0) ;', 'for (i = 0; i < n && Step(i); i++);'],
  { skip: (raw, line) => loopDoesWork(line) });
R('assignment-in-condition', 'B', 'MA', 5, ['pitfall', 'cwe-481'],
  /\bif\s*\(\s*[\w.]+\s*=(?![=>])\s*(?:true|false)\s*\)/,
  ['Boolean assigned inside if', 'if (done = true) assigns and is always true.', 'Use == or test the variable directly.'],
  ['if 안에서 불리언을 대입합니다', 'if (done = true)는 대입이며 항상 참입니다.', '==를 쓰거나 변수를 직접 검사하세요.'],
  'if (done = true) {', 'if (done) {');
R('lock-on-public', 'B', 'MA', 10, ['concurrency'],
  /\block\s*\(\s*(?:this|typeof\s*\(|"[^"]*"|nameof\s*\()/,
  ['lock on this, a type or a string', 'Other code can take the same lock and deadlock with you.', 'Lock on a private readonly object.'],
  ['this, 타입, 문자열에 lock을 겁니다', '다른 코드가 같은 잠금을 잡아 교착 상태가 될 수 있습니다.', 'private readonly 객체에 lock을 거세요.'],
  'lock (this) {', 'lock (_sync) {');
R('sync-over-async', 'B', 'MA', 10, ['async'],
  // .Wait() only on a call result or a task-named variable: SemaphoreSlim,
  // ManualResetEventSlim, CountdownEvent and Barrier have a Wait() of their own.
  /\.GetAwaiter\s*\(\s*\)\s*\.GetResult\s*\(\s*\)|(?:\)|\b\w*[Tt]ask\w*)\s*\.Wait\s*\(\s*\)\s*;/,
  ['Blocking on a task', 'Waiting synchronously on async work can deadlock on a synchronization context and wastes threads.', 'await the task.'],
  ['작업을 동기적으로 기다립니다', '비동기 작업을 동기적으로 기다리면 동기화 컨텍스트에서 교착되고 스레드를 낭비합니다.', '작업을 await하세요.'],
  ['var data = LoadAsync().GetAwaiter().GetResult();', 'SaveAsync().Wait();', 'uploadTask.Wait();'], ['var data = await LoadAsync();', '_semaphore.Wait();', '_ready.Wait();']);
R('rethrow-loses-stack', 'B', 'MA', 5, ['error-handling'],
  /\bthrow\s+(?:ex|e|exc|exception|err|error)\s*;/,
  ['throw ex resets the stack trace', 'Rethrowing the caught variable loses where the error came from.', 'Use throw; to rethrow.'],
  ['throw ex는 스택 추적을 지웁니다', '잡은 변수를 다시 던지면 오류의 출처가 사라집니다.', '다시 던질 때는 throw;를 쓰세요.'],
  'throw ex;', 'throw;');
R('string-case-compare', 'S', 'MI', 5, ['performance', 'pitfall'],
  /\.To(?:Lower|Upper)(?:Invariant)?\s*\(\s*\)\s*[=!]=/,
  ['Case-insensitive compare through ToLower / ToUpper', 'Allocates a copy and fails for some cultures (the Turkish i).', 'Use string.Equals(a, b, StringComparison.OrdinalIgnoreCase).'],
  ['ToLower / ToUpper로 대소문자 무시 비교를 합니다', '복사본을 만들고 일부 문화권(터키어 i)에서 틀립니다.', 'string.Equals(a, b, StringComparison.OrdinalIgnoreCase)를 쓰세요.'],
  'if (name.ToLower() == "admin") {', 'if (string.Equals(name, "admin", StringComparison.OrdinalIgnoreCase)) {');

// ── Code smells ──────────────────────────────────────────────
R('gc-collect', 'S', 'MA', 5, ['performance'],
  /\bGC\.Collect\s*\(/,
  ['GC.Collect called', 'Forcing a collection stalls the process and is rarely useful.', 'Remove the call and dispose resources properly.'],
  ['GC.Collect를 호출합니다', '강제 수집은 프로세스를 멈추고 쓸모가 거의 없습니다.', '호출을 지우고 리소스를 제대로 해제하세요.'],
  'GC.Collect();', 'cache.Clear();');
R('catch-null-reference', 'S', 'MA', 10, ['error-handling', 'cwe-395'],
  /catch\s*\(\s*(?:System\.)?NullReferenceException\b/,
  ['NullReferenceException caught', 'Catching it hides the bug that produced the null.', 'Check for null, or use ?. and ??.'],
  ['NullReferenceException을 잡습니다', '이 예외를 잡으면 null을 만든 버그가 숨겨집니다.', 'null을 검사하거나 ?.와 ??를 쓰세요.'],
  'catch (NullReferenceException) {', 'catch (IOException ex) {');
R('catch-general', 'S', 'IN', 5, ['error-handling', 'cwe-396'],
  /\bcatch\s*\(\s*(?:System\.)?Exception(?:\s+\w+)?\s*\)(?!\s*when\b)|\bcatch\s*(?:\{|$)/,
  ['General exception caught', 'catch (Exception) also hides programming errors and cancellation.', 'Catch specific types, or add a when filter.'],
  ['일반 예외를 잡습니다', 'catch (Exception)은 프로그래밍 오류와 취소까지 숨깁니다.', '구체적인 타입을 잡거나 when 필터를 다세요.'],
  'catch (Exception ex)', ['catch (IOException ex)', 'catch (Exception ex) when (Log(ex))']);
R('throw-generic', 'S', 'MA', 5, ['error-handling', 'cwe-397'],
  /\bthrow\s+new\s+(?:System\.)?(?:Exception|SystemException|ApplicationException)\s*\(/,
  ['Generic exception thrown', 'Callers have to catch everything to handle it.', 'Throw a specific exception such as ArgumentException or InvalidOperationException.'],
  ['일반 예외를 던집니다', '호출자가 처리하려면 모든 것을 잡아야 합니다.', 'ArgumentException이나 InvalidOperationException 같은 구체적인 예외를 던지세요.'],
  'throw new Exception("bad id");', 'throw new ArgumentException("bad id", nameof(id));');
R('not-implemented', 'S', 'IN', 5, ['unfinished'],
  /\bthrow\s+new\s+(?:System\.)?NotImplementedException\s*\(/,
  ['NotImplementedException left in code', 'The member fails whenever it is called.', 'Implement it, or throw NotSupportedException if it is intentionally unsupported.'],
  ['NotImplementedException이 남아 있습니다', '멤버를 호출할 때마다 실패합니다.', '구현하거나 의도적으로 지원하지 않으면 NotSupportedException을 던지세요.'],
  'throw new NotImplementedException();', 'throw new NotSupportedException();');
R('empty-method', 'S', 'MI', 5, ['suspicious'],
  new RegExp(String.raw`\b(?:public|private|protected|internal)\s+${MODS}[\w<>\[\],?]+\s+\w+\s*\([^)]*\)\s*\{\s*\}`),
  ['Empty method', 'An empty method is unfinished or should explain why it does nothing.', 'Implement it, or add a comment.'],
  ['빈 메서드입니다', '빈 메서드는 미완성이거나 왜 아무 일도 안 하는지 설명해야 합니다.', '구현하거나 주석을 다세요.'],
  'public void Stop() {}', ['public void Stop() { _timer.Dispose(); }', 'protected override void OnInit() {}', 'public Widget() {}'],
  { skip: (raw) => /\b(?:override|virtual|abstract|partial)\b/.test(raw) });
R('type-naming', 'S', 'MI', 2, ['convention'],
  /\b(?:class|struct|interface|enum|record)\s+(?!(?:struct|class)\b)[a-z]\w*/,
  ['Type name not in PascalCase', 'C# types start with an upper-case letter.', 'Rename the type to PascalCase.'],
  ['타입 이름이 PascalCase가 아닙니다', 'C# 타입 이름은 대문자로 시작합니다.', '타입 이름을 PascalCase로 바꾸세요.'],
  'public class orderService', ['public class OrderService', 'public readonly record struct ThemePalette(string Text);'], { ns: true, skip: (raw) => /where\s+\w+\s*:\s*(?:class|struct)\b/.test(raw) });
R('interface-prefix', 'S', 'MI', 2, ['convention'],
  /\binterface\s+(?!I[A-Z])[A-Z]\w*/,
  ['Interface name without the I prefix', '.NET interfaces are named IThing.', 'Rename the interface with an I prefix.'],
  ['I 접두사 없는 인터페이스 이름입니다', '.NET 인터페이스는 IThing처럼 이름 짓습니다.', 'I 접두사를 붙여 이름을 바꾸세요.'],
  'public interface Repository', 'public interface IRepository', { ns: true });
R('method-naming', 'S', 'MI', 2, ['convention'],
  new RegExp(String.raw`\b(?:public|protected|internal)\s+${MODS}[\w<>\[\],?]+\s+[a-z]\w*\s*\(`),
  ['Public method not in PascalCase', '.NET public members are PascalCase.', 'Rename the method.'],
  ['public 메서드가 PascalCase가 아닙니다', '.NET 공개 멤버 이름은 PascalCase입니다.', '메서드 이름을 바꾸세요.'],
  'public void loadData()', ['public void LoadData()', 'public static implicit operator Money(decimal d)', 'public static extern int memcpy(IntPtr dst, IntPtr src, int n);'],
  // extern (P/Invoke) and override names are dictated by native code or the base type
  { skip: (raw) => /\b(?:extern|override)\b/.test(raw) });
R('console-output', 'S', 'IN', 2, ['debug'],
  /\bConsole\.Write(?:Line)?\s*\(/,
  ['Console output in code', 'Console writes are not structured logs and are lost in services.', 'Use ILogger.'],
  ['코드에서 콘솔에 출력합니다', '콘솔 출력은 구조화된 로그가 아니며 서비스에서는 사라집니다.', 'ILogger를 쓰세요.'],
  'Console.WriteLine(result);', '_logger.LogInformation("Result {Result}", result);');
R('goto', 'S', 'MA', 10, ['confusing'],
  /\bgoto\s+(?!case\b|default\b)\w+\s*;/,
  ['goto statement', 'goto makes the control flow hard to follow.', 'Use loops, methods or early returns.'],
  ['goto 문입니다', 'goto는 흐름을 따라가기 어렵게 합니다.', '반복문, 메서드, 이른 반환을 쓰세요.'],
  'goto retry;', 'goto case 2;');
R('obsolete-web-client', 'S', 'MA', 10, ['deprecated'],
  /\bnew\s+WebClient\s*\(|\bWebRequest\.Create(?:Http)?\s*\(|\bnew\s+HttpWebRequest\b/,
  ['Obsolete WebClient / WebRequest', 'These APIs are obsolete in .NET 6+.', 'Use HttpClient through IHttpClientFactory.'],
  ['사용 중단된 WebClient / WebRequest', '이 API는 .NET 6 이상에서 사용 중단됐습니다.', 'IHttpClientFactory로 HttpClient를 쓰세요.'],
  'using var wc = new WebClient();', 'var client = _factory.CreateClient();');
R('httpclient-per-call', 'B', 'MA', 10, ['performance', 'reliability'],
  /\busing\s*\(\s*(?:var\s+\w+\s*=\s*)?new\s+HttpClient\s*\(|\busing\s+var\s+\w+\s*=\s*new\s+HttpClient\s*\(/,
  ['HttpClient created and disposed per call', 'Disposing HttpClient per request exhausts sockets under load.', 'Reuse one HttpClient or use IHttpClientFactory.'],
  ['호출마다 HttpClient를 만들고 해제합니다', '요청마다 HttpClient를 해제하면 부하에서 소켓이 고갈됩니다.', 'HttpClient 하나를 재사용하거나 IHttpClientFactory를 쓰세요.'],
  'using (var client = new HttpClient()) {', 'var client = _factory.CreateClient();');
R('count-any', 'S', 'MI', 2, ['performance'],
  /\.Count\s*\(\s*\)\s*(?:>\s*0|!=\s*0|==\s*0|>=\s*1)(?!\d)/,
  ['Count() used to test for elements', 'Count() walks the whole sequence; Any() stops at the first element.', 'Use Any() or !Any().'],
  ['요소 유무를 Count()로 검사합니다', 'Count()는 시퀀스 전체를 돌지만 Any()는 첫 요소에서 멈춥니다.', 'Any()나 !Any()를 쓰세요.'],
  'if (orders.Count() > 0) {', 'if (orders.Any()) {');
R('pragma-warning-disable', 'S', 'IN', 2, ['convention'],
  /^\s*#pragma\s+warning\s+disable\b/,
  ['Compiler warning disabled', 'Disabled warnings hide real problems.', 'Fix the cause or restore the warning right after the line.'],
  ['컴파일러 경고를 끕니다', '꺼진 경고는 실제 문제를 숨깁니다.', '원인을 고치거나 해당 줄 뒤에 경고를 다시 켜세요.'],
  '#pragma warning disable CS0618', '#pragma warning restore CS0618');
R('boolean-ternary', 'S', 'MI', 2, ['clumsy'],
  /\?\s*true\s*:\s*false\b|\?\s*false\s*:\s*true\b/,
  ['Ternary returning true / false', 'cond ? true : false is just cond.', 'Use the condition or its negation.'],
  ['true / false를 돌려주는 삼항입니다', 'cond ? true : false는 cond 그대로입니다.', '조건이나 그 부정을 쓰세요.'],
  'return count > 0 ? true : false;', 'return count > 0;');
R('nested-ternary', 'S', 'MA', 5, ['confusing'],
  /[\s)\]]\?\s.*[\s)\]]\?\s/,
  ['Nested ternary operator', 'Chained ?: expressions are hard to read.', 'Use if / else or a switch expression.'],
  ['중첩된 삼항 연산자입니다', '이어진 ?: 식은 읽기 어렵습니다.', 'if / else나 switch 식을 쓰세요.'],
  'var s = a ? "x" : b ? "y" : "z";', ['var s = a ? "x" : "z";', 'int? n = ok ? 1 : 0;'], { skip: (raw, line) => !nestedTernary(line) });
R('debugger-break', 'S', 'MA', 5, ['debug'],
  /\bDebugger\.(?:Break|Launch)\s*\(/,
  ['Debugger.Break / Launch left in', 'The process stops or prompts for a debugger in production.', 'Remove it before shipping.'],
  ['Debugger.Break / Launch가 남아 있습니다', '운영에서 프로세스가 멈추거나 디버거를 요청합니다.', '배포 전에 지우세요.'],
  'Debugger.Break();', 'Debug.Assert(ok);');

// ── Vulnerabilities and hotspots ─────────────────────────────
R('weak-cipher', 'V', 'CR', 30, ['cwe-327', 'owasp-a02', 'crypto'],
  /\b(?:DES|TripleDES|RC2)\.Create\s*\(|\bnew\s+(?:DES|TripleDES|RC2)CryptoServiceProvider\s*\(/,
  ['Weak cipher algorithm', 'DES, 3DES and RC2 are broken or have too small a block.', 'Use Aes with GCM (AesGcm).'],
  ['약한 암호 알고리즘입니다', 'DES, 3DES, RC2는 깨졌거나 블록이 너무 작습니다.', 'GCM과 함께 Aes(AesGcm)를 쓰세요.'],
  'using var des = DES.Create();', 'using var aes = new AesGcm(key);');
R('ecb-mode', 'V', 'CR', 30, ['cwe-327', 'owasp-a02', 'crypto'],
  /\bCipherMode\.ECB\b/,
  ['ECB cipher mode', 'ECB encrypts equal blocks the same way and leaks patterns.', 'Use AesGcm, or CBC with an HMAC.'],
  ['ECB 암호 모드입니다', 'ECB는 같은 블록을 같게 암호화해 패턴이 드러납니다.', 'AesGcm이나 HMAC을 붙인 CBC를 쓰세요.'],
  'aes.Mode = CipherMode.ECB;', 'aes.Mode = CipherMode.CBC;');
R('rsa-weak-padding', 'V', 'CR', 20, ['cwe-780', 'owasp-a02', 'crypto'],
  /\bRSAEncryptionPadding\.Pkcs1\b|\.Encrypt\s*\([^,()]+,\s*false\s*\)/,
  ['RSA without OAEP padding', 'PKCS#1 v1.5 encryption padding is open to padding-oracle attacks.', 'Use RSAEncryptionPadding.OaepSHA256.'],
  ['OAEP 패딩 없는 RSA입니다', 'PKCS#1 v1.5 암호화 패딩은 패딩 오라클 공격에 취약합니다.', 'RSAEncryptionPadding.OaepSHA256을 쓰세요.'],
  'rsa.Encrypt(data, RSAEncryptionPadding.Pkcs1);', 'rsa.Encrypt(data, RSAEncryptionPadding.OaepSHA256);');
R('weak-rsa-key', 'V', 'CR', 15, ['cwe-326', 'owasp-a02', 'crypto'],
  /\bnew\s+(?:RSA|DSA)CryptoServiceProvider\s*\(\s*(?:512|768|1024)\s*\)|\b(?:RSA|DSA)\.Create\s*\(\s*(?:512|768|1024)\s*\)|\bKeySize\s*=\s*(?:512|768|1024)\b/,
  ['Key shorter than 2048 bits', 'RSA / DSA keys of 1024 bits or less can be broken.', 'Use 2048 bits or more.'],
  ['2048비트보다 짧은 키입니다', '1024비트 이하 RSA / DSA 키는 깨질 수 있습니다.', '2048비트 이상을 쓰세요.'],
  'using var rsa = RSA.Create(1024);', 'using var rsa = RSA.Create(3072);');
R('insecure-random', 'H', 'MA', 10, ['cwe-330', 'owasp-a02'],
  /\bnew\s+Random\s*\(|\bRandom\.Shared\b/,
  ['Non-cryptographic random generator', 'System.Random is predictable and must not create tokens or keys.', 'Use RandomNumberGenerator.'],
  ['암호학적이지 않은 난수 생성기입니다', 'System.Random은 예측 가능해 토큰이나 키를 만들면 안 됩니다.', 'RandomNumberGenerator를 쓰세요.'],
  'var rng = new Random();', 'var bytes = RandomNumberGenerator.GetBytes(32);');
R('certificate-validation-disabled', 'V', 'BL', 30, ['cwe-295', 'owasp-a07', 'tls'],
  /ServerCertificate(?:Custom)?ValidationCallback\s*\+?=\s*(?:\([^)]*\)|\w+)\s*=>\s*true\b|\bDangerousAcceptAnyServerCertificateValidator\b|RemoteCertificateValidationCallback\s*\(\s*\([^)]*\)\s*=>\s*true/,
  ['TLS certificate validation disabled', 'Accepting every certificate allows man-in-the-middle.', 'Remove the callback, or validate the chain and the expected thumbprint.'],
  ['TLS 인증서 검증을 끕니다', '모든 인증서를 받아들이면 중간자 공격을 허용합니다.', '콜백을 지우거나 체인과 기대 지문을 검증하세요.'],
  'handler.ServerCertificateCustomValidationCallback = (m, c, ch, e) => true;', 'handler.ServerCertificateCustomValidationCallback = ValidatePinned;');
R('weak-tls', 'V', 'CR', 15, ['cwe-326', 'owasp-a02', 'tls'],
  /\bSecurityProtocolType\.(?:Ssl3|Tls|Tls11)\b|\bSslProtocols\.(?:Ssl2|Ssl3|Tls|Tls11)\b/,
  ['Outdated SSL / TLS protocol', 'SSL 3 and TLS 1.0 / 1.1 have known attacks.', 'Let the OS choose, or require Tls12 / Tls13.'],
  ['낡은 SSL / TLS 프로토콜입니다', 'SSL 3과 TLS 1.0 / 1.1에는 알려진 공격이 있습니다.', 'OS에 맡기거나 Tls12 / Tls13을 요구하세요.'],
  'ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls;', 'ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;');
R('xxe', 'V', 'CR', 20, ['cwe-611', 'owasp-a05', 'xml'],
  /\bDtdProcessing\s*=\s*DtdProcessing\.Parse\b|\bXmlResolver\s*=\s*new\s+XmlUrlResolver\b|\bProhibitDtd\s*=\s*false\b/,
  ['XML parser resolves external entities', 'DTD processing with a resolver lets a document read local files (XXE).', 'Use DtdProcessing.Prohibit and XmlResolver = null.'],
  ['XML 파서가 외부 엔티티를 해석합니다', '리졸버와 DTD 처리는 문서가 로컬 파일을 읽게 합니다(XXE).', 'DtdProcessing.Prohibit와 XmlResolver = null을 쓰세요.'],
  'settings.DtdProcessing = DtdProcessing.Parse;', 'settings.DtdProcessing = DtdProcessing.Prohibit;');
R('unsafe-deserializer', 'V', 'CR', 30, ['cwe-502', 'owasp-a08'],
  /\b(?:NetDataContractSerializer|SoapFormatter|LosFormatter|ObjectStateFormatter)\b|\bTypeNameHandling\s*=\s*TypeNameHandling\.(?:All|Auto|Objects|Arrays)\b|\bnew\s+JavaScriptSerializer\s*\(\s*new\s+SimpleTypeResolver/,
  ['Deserializer that trusts type names', 'Type names in the payload let an attacker instantiate dangerous classes.', 'Use System.Text.Json with known types and TypeNameHandling.None.'],
  ['타입 이름을 믿는 역직렬화기입니다', '페이로드의 타입 이름으로 공격자가 위험한 클래스를 만들 수 있습니다.', '알려진 타입과 System.Text.Json, TypeNameHandling.None을 쓰세요.'],
  'TypeNameHandling = TypeNameHandling.All,', 'TypeNameHandling = TypeNameHandling.None,');
R('process-start-concat', 'H', 'MA', 20, ['cwe-78', 'owasp-a03'],
  /\bProcess\.Start\s*\([^;]*(?:\+|\$")|\bArguments\s*=\s*(?:\$"|"[^"]*"\s*\+)/,
  ['Process command line built from data', 'Data concatenated into arguments can add options or commands.', 'Use ProcessStartInfo.ArgumentList.'],
  ['데이터로 프로세스 명령줄을 만듭니다', '인자에 이어 붙인 데이터는 옵션이나 명령을 추가할 수 있습니다.', 'ProcessStartInfo.ArgumentList를 쓰세요.'],
  'Process.Start("cmd.exe", "/c dir " + folder);', 'psi.ArgumentList.Add(folder);');
R('path-from-request', 'V', 'CR', 20, ['cwe-22', 'owasp-a01'],
  /\b(?:File\.(?:ReadAllText|ReadAllBytes|Open|OpenRead|OpenWrite|Delete|WriteAllText|WriteAllBytes)|Path\.Combine|PhysicalFile)\s*\([^;]*\bRequest\.(?:Query|Form|QueryString|RouteValues)/,
  ['File path from the request', 'A path from input can use ../ to reach any file.', 'Use Path.GetFileName and check the full path stays inside the base folder.'],
  ['요청으로 파일 경로를 만듭니다', '입력으로 만든 경로는 ../로 아무 파일에나 닿을 수 있습니다.', 'Path.GetFileName을 쓰고 전체 경로가 기준 폴더 안인지 확인하세요.'],
  'var text = File.ReadAllText(Path.Combine(root, Request.Query["f"]));', 'var text = File.ReadAllText(Path.Combine(root, Path.GetFileName(name)));');
R('open-redirect', 'V', 'CR', 20, ['cwe-601', 'owasp-a01'],
  /\bRedirect(?:Permanent)?\s*\(\s*Request\.(?:Query|QueryString|Form)/,
  ['Redirect to a request value', 'Redirecting to a user-supplied URL sends victims to phishing sites.', 'Use LocalRedirect or check Url.IsLocalUrl.'],
  ['요청 값으로 리다이렉트합니다', '사용자가 준 URL로 보내면 피싱 사이트로 유도됩니다.', 'LocalRedirect를 쓰거나 Url.IsLocalUrl을 확인하세요.'],
  'return Redirect(Request.Query["returnUrl"]);', 'return LocalRedirect(returnUrl);');
R('html-raw', 'H', 'MA', 10, ['cwe-79', 'owasp-a03', 'xss'],
  /@?\bHtml\.Raw\s*\(|\bnew\s+HtmlString\s*\(|\bMarkupString\s*\)\s*\w/,
  ['Raw HTML output', 'Html.Raw and HtmlString skip encoding, so data in them can run script.', 'Let Razor encode the value, or sanitize it first.'],
  ['HTML을 그대로 출력합니다', 'Html.Raw와 HtmlString은 인코딩을 건너뛰어 데이터가 스크립트를 실행할 수 있습니다.', 'Razor가 인코딩하게 두거나 먼저 정화하세요.'],
  'var body = Html.Raw(Model.Comment);', 'var body = Model.Comment;');
R('request-validation-off', 'V', 'MA', 10, ['cwe-79', 'owasp-a03'],
  /\[\s*ValidateInput\s*\(\s*false\s*\)\s*\]|\[\s*AllowHtml\s*\]/,
  ['Request validation disabled', 'HTML and script in the input are accepted without checks.', 'Keep validation on and encode output.'],
  ['요청 검증을 끕니다', '입력의 HTML과 스크립트를 검사 없이 받아들입니다.', '검증을 켜 두고 출력을 인코딩하세요.'],
  '[ValidateInput(false)]', '[ValidateAntiForgeryToken]');
R('antiforgery-ignored', 'H', 'MA', 10, ['cwe-352', 'owasp-a01'],
  /\[\s*IgnoreAntiforgeryToken\b/,
  ['Antiforgery check ignored', 'A state-changing action without CSRF checks can be triggered from another site.', 'Remove IgnoreAntiforgeryToken.'],
  ['위조 방지 검사를 무시합니다', 'CSRF 검사가 없는 상태 변경 동작은 다른 사이트에서 실행될 수 있습니다.', 'IgnoreAntiforgeryToken을 지우세요.'],
  '[IgnoreAntiforgeryToken]', '[ValidateAntiForgeryToken]');
R('cors-any-origin', 'H', 'MA', 10, ['cwe-942', 'owasp-a05'],
  /\.AllowAnyOrigin\s*\(\s*\)|"Access-Control-Allow-Origin"\s*,\s*"\*"|\[\s*EnableCors\s*\(\s*(?:origins\s*:\s*)?"\*"/,
  ['CORS allows any origin', 'Any site can read responses meant for your front end.', 'Use WithOrigins with the real origins.'],
  ['CORS가 모든 origin을 허용합니다', '아무 사이트나 프런트엔드용 응답을 읽을 수 있습니다.', '실제 origin으로 WithOrigins를 쓰세요.'],
  'policy.AllowAnyOrigin().AllowAnyHeader();', 'policy.WithOrigins("https://app.example.com");', { strings: true });
R('cookie-not-secure', 'H', 'MA', 5, ['cwe-614', 'owasp-a05', 'cookie'],
  /\bSecure\s*=\s*false\b|\bSecurePolicy\s*=\s*CookieSecurePolicy\.(?:None|SameAsRequest)\b/,
  ['Cookie without the Secure flag', 'The cookie is also sent over plain HTTP.', 'Set Secure = true or CookieSecurePolicy.Always.'],
  ['Secure 속성이 없는 쿠키입니다', '쿠키가 평문 HTTP로도 전송됩니다.', 'Secure = true 또는 CookieSecurePolicy.Always를 쓰세요.'],
  'Secure = false,', 'Secure = true,');
R('cookie-not-httponly', 'H', 'MA', 5, ['cwe-1004', 'owasp-a05', 'cookie'],
  /\bHttpOnly\s*=\s*false\b|\bHttpOnly\s*=\s*HttpOnlyPolicy\.None\b/,
  ['Cookie readable from script', 'Without HttpOnly an injected script can steal the cookie.', 'Set HttpOnly = true.'],
  ['스크립트가 읽을 수 있는 쿠키입니다', 'HttpOnly가 없으면 주입된 스크립트가 쿠키를 훔칠 수 있습니다.', 'HttpOnly = true를 설정하세요.'],
  'HttpOnly = false,', 'HttpOnly = true,');
R('developer-exception-page', 'H', 'MA', 10, ['cwe-489', 'owasp-a05'],
  /\bUseDeveloperExceptionPage\s*\(\s*\)/,
  ['Developer exception page enabled', 'Detailed error pages show code and configuration to users.', 'Enable it only when env.IsDevelopment().'],
  ['개발자 예외 페이지를 켭니다', '자세한 오류 페이지는 코드와 설정을 사용자에게 보여 줍니다.', 'env.IsDevelopment()일 때만 켜세요.'],
  'app.UseDeveloperExceptionPage();', ['app.UseExceptionHandler("/error");', 'if (env.IsDevelopment()) app.UseDeveloperExceptionPage();'],
  { skip: (raw) => /IsDevelopment/.test(raw) });
R('sql-dynamic', 'V', 'CR', 20, ['cwe-89', 'owasp-a03', 'sql'],
  /\b(?:new\s+(?:Sql|Npgsql|MySql|Sqlite|OleDb|Odbc)Command|ExecuteSqlRaw(?:Async)?|FromSqlRaw|SqlQueryRaw)\s*\(\s*(?:\$"|"[^"]*"\s*\+)|\bCommandText\s*=\s*(?:\$"|"[^"]*"\s*\+)/,
  ['SQL built with concatenation or interpolation', 'Values in the SQL text allow injection.', 'Use parameters, or FromSql / ExecuteSql with an interpolated FormattableString.'],
  ['연결이나 보간으로 SQL을 만듭니다', 'SQL 텍스트 안의 값은 주입을 허용합니다.', '매개변수를 쓰거나 보간 FormattableString과 FromSql / ExecuteSql을 쓰세요.'],
  'var cmd = new SqlCommand("select * from t where id = " + id, conn);',
  ['var cmd = new SqlCommand("select * from t where id = @id", conn);', 'cmd.CommandText = "PRAGMA table_info(" + QuoteIdent(name) + ");";'],
  { skip: (raw) => /\+\s*(?:Quote|Escape)\w*\s*\(/.test(raw) });
R('ldap-injection', 'V', 'CR', 20, ['cwe-90', 'owasp-a03'],
  /\.Filter\s*=\s*(?:\$"|"[^"]*"\s*\+)|\bnew\s+DirectorySearcher\s*\([^;]*(?:\$"|"[^"]*"\s*\+)/,
  ['LDAP filter built from data', 'Input with * or ) changes the filter and can bypass checks.', 'Escape the value per RFC 4515 before building the filter.'],
  ['데이터로 LDAP 필터를 만듭니다', '* 나 )가 든 입력은 필터를 바꿔 검사를 우회할 수 있습니다.', '필터를 만들기 전에 RFC 4515에 따라 값을 이스케이프하세요.'],
  'searcher.Filter = "(sAMAccountName=" + user + ")";', 'searcher.Filter = "(sAMAccountName=" + LdapEscape(user) + ")";',
  { skip: (raw) => /Escape\w*\s*\(/.test(raw) });
R('regex-no-timeout', 'H', 'MI', 5, ['cwe-1333', 'redos'],
  /\bnew\s+Regex\s*\(/,
  ['Regex without a match timeout', 'A crafted input can make backtracking run for a very long time.', 'Pass a TimeSpan timeout or use RegexOptions.NonBacktracking.'],
  ['일치 시간 제한 없는 Regex입니다', '조작된 입력이 역추적을 아주 오래 돌릴 수 있습니다.', 'TimeSpan 시간 제한을 넘기거나 RegexOptions.NonBacktracking을 쓰세요.'],
  ['var re = new Regex(pattern);', 'static readonly Regex Ws = new Regex("\\s+(a|b)", RegexOptions.Compiled);'],
  ['var re = new Regex(pattern, RegexOptions.None, TimeSpan.FromSeconds(1));', 'regex = new Regex(pattern, options, RegexTimeout);'],
  { code: /\bnew\s+Regex\s*\(\s*[^,;()]+(?:,\s*[^,;()]+)?\s*\)/, skip: (raw) => /NonBacktracking/.test(raw) });
R('weak-key-derivation', 'V', 'MA', 10, ['cwe-916', 'owasp-a02', 'crypto'],
  /\bnew\s+Rfc2898DeriveBytes\s*\(\s*[^,;)]+,\s*[^,;)]+\s*\)|\bnew\s+Rfc2898DeriveBytes\s*\((?:[^,;]+,){2}\s*(?:\d{1,3}|[1-9]\d{3})\s*[,)]|\bnew\s+PasswordDeriveBytes\s*\(/,
  ['Password key derivation with too few iterations', 'The default 1,000 iterations make password guessing cheap.', 'Use Rfc2898DeriveBytes.Pbkdf2 with at least 600,000 iterations and SHA-256.'],
  ['반복 횟수가 적은 비밀번호 키 유도입니다', '기본 1,000회 반복은 비밀번호 추측을 싸게 만듭니다.', 'SHA-256과 최소 60만 회로 Rfc2898DeriveBytes.Pbkdf2를 쓰세요.'],
  'var kdf = new Rfc2898DeriveBytes(password, salt);', 'var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, 600000, HashAlgorithmName.SHA256, 32);');
R('temp-file-name', 'H', 'MI', 5, ['cwe-377', 'owasp-a01'],
  /\bPath\.GetTempFileName\s*\(/,
  ['Path.GetTempFileName', 'The file is created in a shared folder with a guessable name.', 'Create a random name in a private folder with FileOptions.DeleteOnClose.'],
  ['Path.GetTempFileName을 씁니다', '공유 폴더에 추측 가능한 이름으로 파일이 만들어집니다.', '개인 폴더에 무작위 이름으로 FileOptions.DeleteOnClose와 함께 만드세요.'],
  'var tmp = Path.GetTempFileName();', 'var tmp = Path.Combine(privateDir, Path.GetRandomFileName());');
R('jwt-validation-disabled', 'V', 'CR', 20, ['cwe-347', 'owasp-a07', 'jwt'],
  /\bValidate(?:Issuer|Audience|Lifetime|IssuerSigningKey)\s*=\s*false\b|\bRequire(?:SignedTokens|ExpirationTime)\s*=\s*false\b/,
  ['JWT validation turned off', 'Tokens from any issuer, audience or time, or without a signature, are accepted.', 'Keep every Validate* option true.'],
  ['JWT 검증을 끕니다', '아무 발급자, 대상, 시간 또는 서명 없는 토큰까지 받아들입니다.', 'Validate* 옵션을 모두 true로 두세요.'],
  'ValidateLifetime = false,', 'ValidateLifetime = true,');
R('assembly-load', 'H', 'MA', 10, ['cwe-470', 'owasp-a08'],
  /\bAssembly\.(?:Load|LoadFrom|LoadFile|UnsafeLoadFrom)\s*\(\s*(?!")/,
  ['Assembly loaded from a computed path', 'Loading an assembly chosen at run time can run untrusted code.', 'Load only signed assemblies from a fixed folder.'],
  ['계산된 경로로 어셈블리를 불러옵니다', '실행 중 고른 어셈블리를 불러오면 신뢰할 수 없는 코드가 실행될 수 있습니다.', '고정 폴더의 서명된 어셈블리만 불러오세요.'],
  'var asm = Assembly.LoadFrom(pluginPath);', 'var asm = typeof(Plugin).Assembly;');

module.exports = { RULES: R.rules };
