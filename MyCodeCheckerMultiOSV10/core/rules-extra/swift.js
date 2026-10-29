'use strict';

// Swift (iOS / macOS). code quality Swift-style rules: crashes from forced
// operations, weak crypto, App Transport Security, credentials and smells.

const { maker } = require('./util');
const { namedSecretSkip } = require('./secret-values');

const R = maker('swift', ['swift']);

// ── Bugs ─────────────────────────────────────────────────────
R('force-unwrap', 'S', 'MA', 5, ['null-safety', 'crash'],
  /[\w)\]]!(?=\s*[.\[)\],;]|\s*$)(?!=)/,
  ['Force unwrapping an optional', 'x! crashes the app when the optional is nil.', 'Use if let, guard let or ?? with a default.'],
  ['옵셔널을 강제 언래핑합니다', 'x!는 옵셔널이 nil이면 앱을 중단시킵니다.', 'if let, guard let 또는 ?? 기본값을 쓰세요.'],
  'let name = user!.name', 'let name = user?.name ?? "guest"', { ns: true });
R('force-try', 'B', 'MA', 5, ['error-handling', 'crash'],
  /(?<![\w.])try!\s/,
  ['Forced try!', 'try! crashes when the call throws.', 'Use do / catch or try? and handle the failure.'],
  ['강제 try!를 씁니다', 'try!는 호출이 오류를 던지면 앱을 중단시킵니다.', 'do / catch나 try?를 쓰고 실패를 처리하세요.'],
  'let data = try! Data(contentsOf: url)', 'let data = try Data(contentsOf: url)');
R('force-cast', 'B', 'MA', 5, ['crash'],
  /\bas!\s/,
  ['Forced cast as!', 'as! crashes when the value has another type.', 'Use as? with if let or guard let.'],
  ['강제 캐스트 as!를 씁니다', 'as!는 값의 타입이 다르면 앱을 중단시킵니다.', 'as?와 if let 또는 guard let을 쓰세요.'],
  'let cell = view as! UITableViewCell', 'guard let cell = view as? UITableViewCell else { return }');
R('implicitly-unwrapped', 'S', 'MI', 5, ['null-safety'],
  /\b(?:var|let)\s+\w+\s*:\s*[\w.<>\[\]]+!(?:\s*=|\s*$)/,
  ['Implicitly unwrapped optional', 'A T! property crashes on first use if it was never set.', 'Use a normal optional or initialise it in init.'],
  ['암시적 언래핑 옵셔널입니다', 'T! 속성은 값을 넣지 않은 채 쓰면 앱이 중단됩니다.', '일반 옵셔널을 쓰거나 init에서 초기화하세요.'],
  'var session: URLSession!', 'var session: URLSession?', { skip: (raw) => /@IBOutlet/.test(raw) });
R('fatal-error', 'S', 'MA', 10, ['crash'],
  /(?<![\w.])fatalError\s*\(/,
  ['fatalError call', 'fatalError terminates the app in release builds as well.', 'Throw an error or return a failure value.'],
  ['fatalError를 호출합니다', 'fatalError는 릴리스 빌드에서도 앱을 종료합니다.', '오류를 던지거나 실패 값을 돌려주세요.'],
  'fatalError("unexpected state")', 'throw StoreError.unexpectedState',
  { skip: (raw) => /init\s*\(\s*coder/.test(raw) });
R('self-assignment', 'B', 'MA', 5, ['suspicious'],
  /^\s*((?:self\.)?\w+)\s*=\s*\1\s*$/,
  ['Variable assigned to itself', 'x = x does nothing and usually hides a typo.', 'Assign the intended value.'],
  ['변수를 자기 자신에 대입합니다', 'x = x는 아무 일도 하지 않으며 보통 오타를 숨깁니다.', '의도한 값을 대입하세요.'],
  'name = name', 'self.name = name', { ref: 'S1656' });
R('identical-operands', 'B', 'MA', 5, ['suspicious'],
  /(?<![\w.])(\w+(?:\.\w+)*)\s*(?:==|!=|&&|\|\|)\s*\1\b(?![.(\w])/,
  ['Identical expressions on both sides of an operator', 'a == a is always true and usually a copy-paste error.', 'Compare the intended expressions.'],
  ['연산자 양쪽 식이 같습니다', 'a == a는 항상 참이며 보통 복사-붙여넣기 실수입니다.', '의도한 식끼리 비교하세요.'],
  'if count == count {', ['if count == limit {', 'return self.name == name && self.id == id'], { ref: 'S1764', ns: true });
R('unowned-self', 'S', 'MI', 5, ['crash', 'memory'],
  /\[\s*unowned\s+self\s*\]/,
  ['[unowned self] capture', 'Accessing an unowned self after it is released crashes.', 'Capture [weak self] and unwrap it.'],
  ['[unowned self]로 캡처합니다', '해제된 뒤 unowned self에 접근하면 앱이 중단됩니다.', '[weak self]로 캡처하고 언래핑하세요.'],
  'api.load { [unowned self] data in', 'api.load { [weak self] data in');
R('strong-delegate', 'B', 'MA', 5, ['memory', 'retain-cycle'],
  /^\s*(?:public\s+|internal\s+|private\s+)?var\s+delegate\s*:/,
  ['Delegate property held strongly', 'A strong delegate usually forms a retain cycle with its owner.', 'Declare it weak var delegate.'],
  ['delegate 속성을 강하게 참조합니다', '강한 delegate는 보통 소유자와 순환 참조를 만듭니다.', 'weak var delegate로 선언하세요.'],
  'var delegate: LoginDelegate?', ['weak var delegate: LoginDelegate?', 'var delegate: LoginDelegate? { get set }'],
  { skip: (raw) => /\{\s*get\b/.test(raw) });
R('empty-catch', 'S', 'MA', 5, ['error-handling'],
  /\bcatch\s*(?:let\s+\w+\s*)?\{\s*\}/,
  ['Empty catch block', 'The error is silently ignored.', 'Log or handle the error.'],
  ['빈 catch 블록입니다', '오류를 아무 말 없이 무시합니다.', '오류를 기록하거나 처리하세요.'],
  '} catch { }', '} catch { logger.error("\\(error)") }', { ref: 'S108' });

// ── Vulnerabilities and hotspots ─────────────────────────────
R('weak-hash', 'V', 'CR', 15, ['crypto', 'cwe-328', 'owasp-a02'],
  /\b(?:CC_MD5|CC_MD4|CC_MD2|CC_SHA1)\s*\(|\bInsecure\.(?:MD5|SHA1)\b/,
  ['Weak hash algorithm', 'MD5 and SHA-1 collisions are practical.', 'Use SHA256 from CryptoKit or CC_SHA256.'],
  ['약한 해시 알고리즘입니다', 'MD5와 SHA-1은 충돌을 실제로 만들 수 있습니다.', 'CryptoKit의 SHA256이나 CC_SHA256을 쓰세요.'],
  'let digest = Insecure.MD5.hash(data: data)', 'let digest = SHA256.hash(data: data)', { ref: 'S4790' });
R('weak-cipher', 'V', 'CR', 15, ['crypto', 'cwe-327', 'owasp-a02'],
  /\bkCCAlgorithm(?:DES|3DES|RC4|RC2|CAST|Blowfish)\b/,
  ['Weak cipher algorithm', 'DES, 3DES, RC2, RC4 and Blowfish are broken or too weak.', 'Use AES.GCM or ChaChaPoly from CryptoKit.'],
  ['약한 암호 알고리즘입니다', 'DES, 3DES, RC2, RC4, Blowfish는 깨졌거나 너무 약합니다.', 'CryptoKit의 AES.GCM이나 ChaChaPoly를 쓰세요.'],
  'CCCrypt(op, CCAlgorithm(kCCAlgorithmDES), options, key, keyLen, iv, data, len, out, outLen, &moved)', 'let box = try AES.GCM.seal(data, using: key)', { ref: 'S5547' });
R('ecb-mode', 'V', 'CR', 15, ['crypto', 'cwe-327', 'owasp-a02'],
  /\bkCCOptionECBMode\b/,
  ['ECB cipher mode', 'ECB leaks patterns of the plaintext.', 'Use an authenticated mode such as AES.GCM.'],
  ['ECB 암호 모드입니다', 'ECB는 평문의 패턴을 드러냅니다.', 'AES.GCM 같은 인증 모드를 쓰세요.'],
  'let options = CCOptions(kCCOptionECBMode)', 'let sealed = try AES.GCM.seal(data, using: key)', { ref: 'S5542' });
R('arbitrary-loads', 'V', 'CR', 10, ['tls', 'cwe-319', 'owasp-a02'],
  /\bNSAllowsArbitraryLoads\b/,
  ['App Transport Security disabled', 'NSAllowsArbitraryLoads lets the app load plain HTTP.', 'Remove it and add narrow NSExceptionDomains only where unavoidable.'],
  ['App Transport Security를 끕니다', 'NSAllowsArbitraryLoads는 앱이 평문 HTTP를 불러오게 합니다.', '지우고 꼭 필요한 곳만 NSExceptionDomains로 좁게 허용하세요.'],
  'info["NSAllowsArbitraryLoads"] = true', 'info["NSAppTransportSecurity"] = [:]', { scope: 'any' });
R('http-url', 'H', 'MI', 5, ['tls', 'cwe-319'],
  /["']http:\/\/(?!localhost|127\.0\.0\.1|\[::1\])[\w.-]+/,
  ['Clear-text HTTP URL', 'Traffic over http:// can be read and changed on the network.', 'Use https://.'],
  ['평문 HTTP URL입니다', 'http:// 트래픽은 네트워크에서 읽고 바꿀 수 있습니다.', 'https://를 쓰세요.'],
  'let url = URL(string: "http://api.example.com/v1")', 'let url = URL(string: "https://api.example.com/v1")', { ref: 'S5332' });
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b(?:let|var)\s+\w*(?:password|passwd|pwd|secret|apiKey|token)\w*\s*(?::\s*String\s*)?=\s*"[^"\s]{4,}"/i,
  ['Hard-coded credential', 'Anyone with the binary or source can read the secret.', 'Load it from the Keychain or a server.'],
  ['자격 증명을 코드에 적었습니다', '바이너리나 소스를 가진 누구나 비밀을 읽을 수 있습니다.', 'Keychain이나 서버에서 불러오세요.'],
  'let password = "s3cr3tPass"', ['let password = try keychain.read("password")', 'static let tokenKey = "auth_token"', 'let passwordLabel = "Password"'],
  { ref: 'S2068', skip: (raw, line, file) => namedSecretSkip(raw, file) });
R('server-trust-bypass', 'V', 'CR', 30, ['tls', 'cwe-295', 'owasp-a07'],
  /completionHandler\s*\(\s*\.useCredential\s*,\s*URLCredential\s*\(\s*trust\s*:/,
  ['Server certificate accepted without evaluation', 'Trusting every server certificate allows man-in-the-middle attacks.', 'Evaluate the trust with SecTrustEvaluateWithError or pin the key.'],
  ['서버 인증서를 검증 없이 받아들입니다', '모든 서버 인증서를 믿으면 중간자 공격을 허용합니다.', 'SecTrustEvaluateWithError로 검증하거나 키를 고정하세요.'],
  'completionHandler(.useCredential, URLCredential(trust: challenge.protectionSpace.serverTrust!))', 'completionHandler(.performDefaultHandling, nil)', { ref: 'S4830' });
R('weak-random', 'H', 'MI', 10, ['cwe-338', 'crypto'],
  /(?<![\w.])(?:arc4random|random|rand|drand48)\s*\(\s*\)/,
  ['Non-cryptographic random generator', 'rand() and random() are predictable.', 'Use SecRandomCopyBytes or SystemRandomNumberGenerator.'],
  ['암호용이 아닌 난수 생성기입니다', 'rand()와 random()은 예측할 수 있습니다.', 'SecRandomCopyBytes나 SystemRandomNumberGenerator를 쓰세요.'],
  'let nonce = rand()', 'let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)', { ref: 'S2245' });
R('keychain-accessible-always', 'V', 'MA', 10, ['cwe-311', 'storage'],
  /\bkSecAttrAccessibleAlways(?:ThisDeviceOnly)?\b/,
  ['Keychain item readable while the device is locked', 'kSecAttrAccessibleAlways exposes the secret on a locked or stolen device.', 'Use kSecAttrAccessibleWhenUnlockedThisDeviceOnly.'],
  ['기기가 잠겨 있어도 Keychain 항목을 읽을 수 있습니다', 'kSecAttrAccessibleAlways는 잠기거나 도난당한 기기에서 비밀을 드러냅니다.', 'kSecAttrAccessibleWhenUnlockedThisDeviceOnly를 쓰세요.'],
  'query[kSecAttrAccessible] = kSecAttrAccessibleAlways', 'query[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly');
R('userdefaults-secret', 'V', 'MA', 15, ['cwe-312', 'storage'],
  /\bUserDefaults\b.*\.set\s*\([^)]*,\s*forKey\s*:\s*"\w*(?:password|token|secret|pin)\w*"/i,
  ['Secret stored in UserDefaults', 'UserDefaults is a plain property list readable from backups.', 'Store secrets in the Keychain.'],
  ['비밀을 UserDefaults에 저장합니다', 'UserDefaults는 백업에서 읽을 수 있는 평문 plist입니다.', '비밀은 Keychain에 저장하세요.'],
  'UserDefaults.standard.set(token, forKey: "authToken")', 'try keychain.save(token, account: "authToken")');
R('sql-interpolation', 'V', 'CR', 20, ['sql', 'cwe-89', 'owasp-a03'],
  /\bsqlite3_(?:exec|prepare(?:_v2|_v3)?)\s*\([^,]+,\s*"[^"]*\\\(/,
  ['SQL built by string interpolation', 'Interpolated values can change the SQL statement.', 'Use ? placeholders with sqlite3_bind_*.'],
  ['문자열 보간으로 SQL을 만듭니다', '보간한 값이 SQL 문을 바꿀 수 있습니다.', '? 자리표시자와 sqlite3_bind_*를 쓰세요.'],
  'sqlite3_exec(db, "DELETE FROM users WHERE id = \\(id)", nil, nil, nil)', 'sqlite3_prepare_v2(db, "DELETE FROM users WHERE id = ?", -1, &stmt, nil)', { ref: 'S2077' });
R('webview-js-file-access', 'H', 'MA', 10, ['webview', 'cwe-79'],
  /allowFileAccessFromFileURLs|allowUniversalAccessFromFileURLs/,
  ['Web view file access from file URLs', 'Local pages can read other local files and send them out.', 'Leave these preferences off.'],
  ['웹 뷰가 file URL에서 파일에 접근합니다', '로컬 페이지가 다른 로컬 파일을 읽어 밖으로 보낼 수 있습니다.', '이 설정을 끈 채로 두세요.'],
  'config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")', 'config.preferences.javaScriptEnabled = false');

// ── Code smells ──────────────────────────────────────────────
R('print', 'S', 'MI', 2, ['debug'],
  /^\s*(?:print|debugPrint|dump|NSLog)\s*\(/,
  ['print left in the code', 'Console output ships in release builds and may leak data.', 'Use os.Logger with an appropriate privacy level.'],
  ['print가 남아 있습니다', '콘솔 출력이 릴리스 빌드에 남아 데이터를 흘릴 수 있습니다.', '알맞은 privacy 수준으로 os.Logger를 쓰세요.'],
  'print("token: \\(token)")', 'logger.debug("loaded \\(count, privacy: .public) items")', { ref: 'S106' });
R('todo', 'S', 'IN', 5, ['unfinished'],
  /\b(?:TODO|FIXME)\b/,
  ['TODO / FIXME comment', 'The comment marks unfinished work.', 'Finish the work or open a tracked issue.'],
  ['TODO / FIXME 주석입니다', '주석이 끝나지 않은 일을 표시합니다.', '작업을 끝내거나 추적하는 이슈를 여세요.'],
  '// TODO: handle offline mode', '// Offline mode is handled by SyncQueue.', { scope: 'any', ref: 'S1135' });
R('empty-function', 'S', 'MI', 5, ['suspicious'],
  /\bfunc\s+\w+\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?:throws\s+)?(?:->\s*\w+\s*)?\{\s*\}/,
  ['Empty function', 'An empty body is unfinished or should say why it does nothing.', 'Implement it or add a comment.'],
  ['빈 함수입니다', '빈 본문은 미완성이거나 왜 아무 일도 안 하는지 설명해야 합니다.', '구현하거나 주석을 다세요.'],
  'func refresh() {}', 'func refresh() { store.reload() }', { ref: 'S1186' });
R('any-object-cast', 'S', 'MI', 5, ['types'],
  /:\s*\[?\s*(?:Any|AnyObject)\s*\]?\s*(?:[=,)]|$)/,
  ['Value typed as Any', 'Any hides the real type and pushes checks to run time.', 'Use a concrete type, a protocol or a generic.'],
  ['값의 타입이 Any입니다', 'Any는 실제 타입을 숨기고 검사를 실행 시점으로 미룹니다.', '구체 타입, 프로토콜 또는 제네릭을 쓰세요.'],
  'func handle(payload: Any) {', ['func handle(payload: Payload) {', 'let json: [String: Any] = [:]', 'func decode(_ dict: [String: Any]) {'],
  { skip: (raw, line) => !/:\s*\[?\s*(?:Any|AnyObject)\s*\]?\s*(?:[=,)]|$)/.test(line.replace(/\[\s*[\w.]+\s*:\s*(?:Any|AnyObject)\??\s*\]/g, '[Dict]')) });
R('nested-closure-depth', 'S', 'MI', 10, ['brain-overload'],
  /\{[^{}]*\bin\b[^{}]*\{[^{}]*\bin\b[^{}]*\{[^{}]*\bin\b/,
  ['Closures nested three deep on one line', 'Deep closure nesting is hard to read.', 'Extract named functions or use async / await.'],
  ['클로저가 한 줄에 세 겹으로 중첩됩니다', '깊은 클로저 중첩은 읽기 어렵습니다.', '이름 있는 함수로 빼거나 async / await를 쓰세요.'],
  'a { x in b { y in c { z in go(z) } } }', 'let z = try await c(b(a()))');
R('sleep-main', 'S', 'MA', 10, ['performance'],
  /(?<![\w.])(?:sleep|usleep)\s*\(|\bThread\.sleep\s*\(/,
  ['Thread sleep', 'Sleeping blocks the thread; on the main thread it freezes the UI.', 'Use Task.sleep or a timer.'],
  ['스레드를 잠재웁니다', 'sleep은 스레드를 막고 메인 스레드라면 UI를 멈춥니다.', 'Task.sleep이나 타이머를 쓰세요.'],
  'Thread.sleep(forTimeInterval: 2)', 'try await Task.sleep(nanoseconds: 2_000_000_000)');

module.exports = { RULES: R.rules };
