'use strict';

// Objective-C (.m / .mm). C runtime pitfalls that Objective-C inherits,
// Foundation / Security framework misuse and memory-management hints.

const { maker } = require('./util');

const R = maker('objc', ['objc']);

// ── Vulnerabilities ──────────────────────────────────────────
R('strcpy', 'V', 'CR', 15, ['cwe-120', 'memory', 'owasp-a03'],
  /(?<![\w.])(?:strcpy|strcat|gets|wcscpy|wcscat)\s*\(/,
  ['Unbounded string copy', 'strcpy, strcat and gets write past the buffer when the input is long.', 'Use strlcpy / strlcat with the buffer size, or NSString.'],
  ['길이 제한 없는 문자열 복사입니다', 'strcpy, strcat, gets는 입력이 길면 버퍼를 넘어 씁니다.', '버퍼 크기와 함께 strlcpy / strlcat을 쓰거나 NSString을 쓰세요.'],
  'strcpy(buffer, input);', 'strlcpy(buffer, input, sizeof(buffer));');
R('sprintf', 'V', 'MA', 10, ['cwe-120', 'memory'],
  /(?<![\w.])(?:sprintf|vsprintf)\s*\(/,
  ['sprintf without a size limit', 'sprintf writes past the buffer when the formatted text is long.', 'Use snprintf or stringWithFormat:.'],
  ['크기 제한 없는 sprintf입니다', 'sprintf는 서식 결과가 길면 버퍼를 넘어 씁니다.', 'snprintf나 stringWithFormat:을 쓰세요.'],
  'sprintf(path, "%s/%s", dir, name);', 'snprintf(path, sizeof(path), "%s/%s", dir, name);');
R('format-string', 'V', 'CR', 15, ['cwe-134', 'owasp-a03'],
  /\b(?:NSLog|stringWithFormat:|appendFormat:|initWithFormat:)\s*\(?\s*(?!@")[A-Za-z_]\w*\s*[\])]/,
  ['Non-literal format string', 'A user-controlled format string can read or write memory.', 'Pass a literal format such as @"%@" and the value as an argument.'],
  ['리터럴이 아닌 서식 문자열입니다', '사용자가 고른 서식 문자열은 메모리를 읽거나 쓸 수 있습니다.', '@"%@" 같은 리터럴 서식을 쓰고 값은 인자로 넘기세요.'],
  'NSLog(message);', 'NSLog(@"%@", message);');
R('weak-hash', 'V', 'CR', 15, ['crypto', 'cwe-328', 'owasp-a02'],
  /\bCC_(?:MD2|MD4|MD5|SHA1)\s*\(/,
  ['Weak hash algorithm', 'MD5 and SHA-1 collisions are practical.', 'Use CC_SHA256 or stronger.'],
  ['약한 해시 알고리즘입니다', 'MD5와 SHA-1은 충돌을 실제로 만들 수 있습니다.', 'CC_SHA256 이상을 쓰세요.'],
  'CC_MD5(data.bytes, (CC_LONG)data.length, digest);', 'CC_SHA256(data.bytes, (CC_LONG)data.length, digest);', { ref: 'S4790' });
R('weak-cipher', 'V', 'CR', 15, ['crypto', 'cwe-327', 'owasp-a02'],
  /\bkCCAlgorithm(?:DES|3DES|RC4|RC2|CAST|Blowfish)\b/,
  ['Weak cipher algorithm', 'DES, 3DES, RC2, RC4 and Blowfish are broken or too weak.', 'Use kCCAlgorithmAES with an authenticated mode.'],
  ['약한 암호 알고리즘입니다', 'DES, 3DES, RC2, RC4, Blowfish는 깨졌거나 너무 약합니다.', '인증 모드와 함께 kCCAlgorithmAES를 쓰세요.'],
  'CCCrypt(kCCEncrypt, kCCAlgorithmDES, 0, key, 8, NULL, in, len, out, outLen, &moved);', 'CCCrypt(kCCEncrypt, kCCAlgorithmAES, 0, key, 32, iv, in, len, out, outLen, &moved);', { ref: 'S5547' });
R('ecb-mode', 'V', 'CR', 15, ['crypto', 'cwe-327'],
  /\bkCCOptionECBMode\b/,
  ['ECB cipher mode', 'ECB leaks patterns of the plaintext.', 'Use CBC with a random IV plus a MAC, or GCM.'],
  ['ECB 암호 모드입니다', 'ECB는 평문의 패턴을 드러냅니다.', '무작위 IV와 MAC을 붙인 CBC나 GCM을 쓰세요.'],
  'CCCrypt(kCCEncrypt, kCCAlgorithmAES, kCCOptionECBMode, key, 32, NULL, in, len, out, outLen, &moved);', 'CCCrypt(kCCEncrypt, kCCAlgorithmAES, kCCOptionPKCS7Padding, key, 32, iv, in, len, out, outLen, &moved);', { ref: 'S5542' });
R('http-url', 'H', 'MI', 5, ['tls', 'cwe-319'],
  /@"http:\/\/(?!localhost|127\.0\.0\.1)[\w.-]+/,
  ['Clear-text HTTP URL', 'Traffic over http:// can be read and changed on the network.', 'Use https://.'],
  ['평문 HTTP URL입니다', 'http:// 트래픽은 네트워크에서 읽고 바꿀 수 있습니다.', 'https://를 쓰세요.'],
  'NSURL *url = [NSURL URLWithString:@"http://api.example.com"];', 'NSURL *url = [NSURL URLWithString:@"https://api.example.com"];', { ref: 'S5332' });
R('arbitrary-loads', 'V', 'CR', 10, ['tls', 'cwe-319', 'owasp-a02'],
  /\bNSAllowsArbitraryLoads\b/,
  ['App Transport Security disabled', 'NSAllowsArbitraryLoads lets the app load plain HTTP.', 'Remove it and allow only narrow exception domains.'],
  ['App Transport Security를 끕니다', 'NSAllowsArbitraryLoads는 앱이 평문 HTTP를 불러오게 합니다.', '지우고 꼭 필요한 예외 도메인만 허용하세요.'],
  'ats[@"NSAllowsArbitraryLoads"] = @YES;', 'ats[@"NSExceptionDomains"] = domains;', { scope: 'any' });
R('nslog-sensitive', 'V', 'MA', 10, ['cwe-532', 'logging'],
  /\bNSLog\s*\(\s*@"[^"]*(?:password|passwd|token|secret|ssn|credit)/i,
  ['Sensitive data written to NSLog', 'NSLog output lands in the device log that other tools can read.', 'Do not log secrets; use os_log with private redaction.'],
  ['민감한 데이터를 NSLog로 씁니다', 'NSLog 출력은 다른 도구가 읽을 수 있는 기기 로그에 남습니다.', '비밀은 기록하지 말고 os_log의 private 가림을 쓰세요.'],
  'NSLog(@"password=%@", password);', 'os_log(log, "login for %{private}@", user);');
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b\w*(?:password|passwd|pwd|secret|apiKey|token)\w*\s*=\s*@"[^"\s]{4,}"/i,
  ['Hard-coded credential', 'Anyone with the binary can extract the secret.', 'Load it from the Keychain or a server.'],
  ['자격 증명을 코드에 적었습니다', '바이너리를 가진 누구나 비밀을 꺼낼 수 있습니다.', 'Keychain이나 서버에서 불러오세요.'],
  'NSString *password = @"hunter22";', 'NSString *password = [keychain stringForKey:@"password"];', { ref: 'S2068' });
R('trust-all-certs', 'V', 'CR', 30, ['tls', 'cwe-295', 'owasp-a07'],
  /\ballowsAnyHTTPSCertificate|\bsetAllowsAnyHTTPSCertificate\s*:\s*YES|\bcredentialForTrust\s*:\s*challenge\.protectionSpace\.serverTrust\b/,
  ['Server certificate accepted without evaluation', 'Accepting any certificate allows man-in-the-middle attacks.', 'Evaluate the trust with SecTrustEvaluateWithError or pin the key.'],
  ['서버 인증서를 검증 없이 받아들입니다', '아무 인증서나 받으면 중간자 공격을 허용합니다.', 'SecTrustEvaluateWithError로 검증하거나 키를 고정하세요.'],
  'NSURLCredential *c = [NSURLCredential credentialForTrust:challenge.protectionSpace.serverTrust];', 'completionHandler(NSURLSessionAuthChallengePerformDefaultHandling, nil);', { ref: 'S4830' });
R('weak-random', 'H', 'MI', 10, ['cwe-338', 'crypto'],
  /(?<![\w.])(?:rand|random|srand|srandom|drand48)\s*\(/,
  ['Non-cryptographic random generator', 'rand() and random() are predictable.', 'Use SecRandomCopyBytes or arc4random_buf.'],
  ['암호용이 아닌 난수 생성기입니다', 'rand()와 random()은 예측할 수 있습니다.', 'SecRandomCopyBytes나 arc4random_buf를 쓰세요.'],
  'int token = rand();', 'SecRandomCopyBytes(kSecRandomDefault, sizeof(bytes), bytes);', { ref: 'S2245' });
R('keychain-accessible-always', 'V', 'MA', 10, ['cwe-311', 'storage'],
  /\bkSecAttrAccessibleAlways(?:ThisDeviceOnly)?\b/,
  ['Keychain item readable while the device is locked', 'kSecAttrAccessibleAlways exposes the secret on a locked or stolen device.', 'Use kSecAttrAccessibleWhenUnlockedThisDeviceOnly.'],
  ['기기가 잠겨 있어도 Keychain 항목을 읽을 수 있습니다', 'kSecAttrAccessibleAlways는 잠기거나 도난당한 기기에서 비밀을 드러냅니다.', 'kSecAttrAccessibleWhenUnlockedThisDeviceOnly를 쓰세요.'],
  'query[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleAlways;', 'query[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly;');
R('userdefaults-secret', 'V', 'MA', 15, ['cwe-312', 'storage'],
  /\bNSUserDefaults\b.*\bsetObject\s*:[^\]]*forKey\s*:\s*@"\w*(?:password|token|secret|pin)\w*"/i,
  ['Secret stored in NSUserDefaults', 'NSUserDefaults is a plain property list readable from backups.', 'Store secrets in the Keychain.'],
  ['비밀을 NSUserDefaults에 저장합니다', 'NSUserDefaults는 백업에서 읽을 수 있는 평문 plist입니다.', '비밀은 Keychain에 저장하세요.'],
  '[[NSUserDefaults standardUserDefaults] setObject:token forKey:@"authToken"];', '[keychain setString:token forKey:@"authToken"];');
R('sql-format', 'V', 'CR', 20, ['sql', 'cwe-89', 'owasp-a03'],
  /\bstringWithFormat\s*:\s*@"\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^"]*%@/i,
  ['SQL built with stringWithFormat:', 'Formatted values can change the SQL statement.', 'Use ? placeholders and sqlite3_bind_*.'],
  ['stringWithFormat:으로 SQL을 만듭니다', '서식으로 넣은 값이 SQL 문을 바꿀 수 있습니다.', '? 자리표시자와 sqlite3_bind_*를 쓰세요.'],
  'NSString *sql = [NSString stringWithFormat:@"SELECT * FROM users WHERE name = \'%@\'", name];', 'const char *sql = "SELECT * FROM users WHERE name = ?";', { ref: 'S2077' });
R('uiwebview', 'V', 'MA', 30, ['webview', 'deprecated', 'cwe-79'],
  /\bUIWebView\b/,
  ['UIWebView is deprecated', 'UIWebView has known security problems and is rejected by the App Store.', 'Use WKWebView.'],
  ['UIWebView는 지원이 끝났습니다', 'UIWebView는 알려진 보안 문제가 있고 App Store에서 거부됩니다.', 'WKWebView를 쓰세요.'],
  'UIWebView *web = [[UIWebView alloc] initWithFrame:frame];', 'WKWebView *web = [[WKWebView alloc] initWithFrame:frame configuration:config];');

// ── Bugs ─────────────────────────────────────────────────────
R('strong-delegate', 'B', 'MA', 5, ['memory', 'retain-cycle'],
  /@property\s*\((?=[^)]*\b(?:strong|retain)\b)[^)]*\)\s*id\s*<\s*\w*Delegate\s*>/,
  ['Delegate property declared strong', 'A strong delegate forms a retain cycle with its owner.', 'Declare it weak.'],
  ['delegate 속성을 strong으로 선언합니다', 'strong delegate는 소유자와 순환 참조를 만듭니다.', 'weak로 선언하세요.'],
  '@property (nonatomic, strong) id<LoginDelegate> delegate;', '@property (nonatomic, weak) id<LoginDelegate> delegate;');
R('self-in-block', 'S', 'MI', 10, ['memory', 'retain-cycle'],
  /\^\s*(?:\([^)]*\))?\s*\{[^}]*(?<![\w])self\s*(?:\.|\s+\w)/,
  ['self captured strongly inside a block', 'A block stored by self that captures self creates a retain cycle.', 'Capture __weak typeof(self) weakSelf and use it inside the block.'],
  ['블록 안에서 self를 강하게 캡처합니다', 'self가 보관하는 블록이 self를 캡처하면 순환 참조가 생깁니다.', '__weak typeof(self) weakSelf를 캡처해 블록 안에서 쓰세요.'],
  'self.handler = ^{ [self reload]; };', 'self.handler = ^{ [weakSelf reload]; };',
  { skip: (raw) => /dispatch_(?:async|sync|after)|enumerate|animateWithDuration/.test(raw) });
R('nsstring-assign', 'B', 'MA', 5, ['memory'],
  /@property\s*\((?=[^)]*\bassign\b)[^)]*\)\s*(?:NSString|NSArray|NSDictionary|NSData|NSObject|id)\b/,
  ['Object property declared assign', 'assign does not retain the object, so the pointer dangles after release.', 'Use strong, copy or weak.'],
  ['객체 속성을 assign으로 선언합니다', 'assign은 객체를 붙잡지 않아 해제 뒤 포인터가 허공을 가리킵니다.', 'strong, copy 또는 weak를 쓰세요.'],
  '@property (nonatomic, assign) NSString *title;', '@property (nonatomic, copy) NSString *title;');
R('string-compare-eq', 'B', 'MA', 5, ['suspicious'],
  /(?:==|!=)\s*@"/,
  ['NSString compared with ==', '== compares pointers, not the text.', 'Use isEqualToString:.'],
  ['NSString을 ==로 비교합니다', '==는 글자가 아니라 포인터를 비교합니다.', 'isEqualToString:을 쓰세요.'],
  'if (name == @"admin") {', 'if ([name isEqualToString:@"admin"]) {');
R('empty-catch', 'S', 'MA', 5, ['error-handling'],
  /@catch\s*\([^)]*\)\s*\{\s*\}/,
  ['Empty @catch block', 'The exception is silently ignored.', 'Log or handle the exception.'],
  ['빈 @catch 블록입니다', '예외를 아무 말 없이 무시합니다.', '예외를 기록하거나 처리하세요.'],
  '@catch (NSException *e) {}', '@catch (NSException *e) { [self report:e]; }', { ref: 'S108' });
R('self-assignment', 'B', 'MA', 5, ['suspicious'],
  /^\s*((?:self\.)?\w+)\s*=\s*\1\s*;/,
  ['Variable assigned to itself', 'x = x does nothing and usually hides a typo.', 'Assign the intended value.'],
  ['변수를 자기 자신에 대입합니다', 'x = x는 아무 일도 하지 않으며 보통 오타를 숨깁니다.', '의도한 값을 대입하세요.'],
  'count = count;', 'self.count = count;', { ref: 'S1656' });

// ── Code smells ──────────────────────────────────────────────
R('nslog', 'S', 'MI', 2, ['debug'],
  /^\s*NSLog\s*\(/,
  ['NSLog left in the code', 'NSLog is slow and writes to the shared device log.', 'Use os_log, or remove it.'],
  ['NSLog가 남아 있습니다', 'NSLog는 느리고 공유 기기 로그에 씁니다.', 'os_log를 쓰거나 지우세요.'],
  'NSLog(@"loaded %lu items", count);', 'os_log_debug(log, "loaded %lu items", count);', { ref: 'S106' });
R('goto', 'S', 'MA', 10, ['brain-overload'],
  /(?<![\w.])goto\s+\w+\s*;/,
  ['goto statement', 'goto makes control flow hard to follow.', 'Use structured control flow.'],
  ['goto 문입니다', 'goto는 제어 흐름을 따라가기 어렵게 만듭니다.', '구조적인 제어 흐름을 쓰세요.'],
  'goto fail;', 'return NO;', { ref: 'S907' });
R('todo', 'S', 'IN', 5, ['unfinished'],
  /\b(?:TODO|FIXME)\b/,
  ['TODO / FIXME comment', 'The comment marks unfinished work.', 'Finish the work or open a tracked issue.'],
  ['TODO / FIXME 주석입니다', '주석이 끝나지 않은 일을 표시합니다.', '작업을 끝내거나 추적하는 이슈를 여세요.'],
  '// TODO: retry on failure', '// Failures are retried by RetryPolicy.', { scope: 'any', ref: 'S1135' });
R('release-in-arc', 'S', 'MI', 5, ['memory'],
  /\[\s*\w+\s+(?:release|autorelease|retain)\s*\]/,
  ['Manual retain / release call', 'Manual reference counting is error-prone and invalid under ARC.', 'Enable ARC and drop the calls.'],
  ['수동 retain / release 호출입니다', '수동 참조 계수는 실수하기 쉽고 ARC에서는 쓸 수 없습니다.', 'ARC를 켜고 호출을 지우세요.'],
  '[buffer release];', 'buffer = nil;');

module.exports = { RULES: R.rules };
