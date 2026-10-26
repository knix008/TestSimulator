'use strict';

// VB.NET. Legacy error handling and loose typing carried over from VB6,
// plus the .NET security rules (SQL, crypto, TLS, secrets). Keywords are
// case-insensitive in VB, so most patterns use the i flag.

const { maker } = require('./util');

const R = maker('vbnet', ['vbnet']);

// ── Bugs ─────────────────────────────────────────────────────
R('on-error-resume-next', 'B', 'CR', 15, ['error-handling'],
  /^\s*On\s+Error\s+Resume\s+Next\b/i,
  ['On Error Resume Next', 'Every error after this line is silently ignored and the code runs on with bad state.', 'Use Try / Catch around the code that can fail.'],
  ['On Error Resume Next를 씁니다', '이 줄 뒤의 모든 오류가 조용히 무시되고 잘못된 상태로 계속 실행됩니다.', '실패할 수 있는 코드를 Try / Catch로 감싸세요.'],
  'On Error Resume Next', 'Try');
R('on-error-goto', 'S', 'MA', 15, ['error-handling'],
  /^\s*On\s+Error\s+GoTo\s+(?!0\b)\w+/i,
  ['Unstructured On Error GoTo handler', 'On Error GoTo jumps are hard to follow and mix with Try / Catch badly.', 'Use structured Try / Catch.'],
  ['비구조적 On Error GoTo 처리기입니다', 'On Error GoTo 점프는 따라가기 어렵고 Try / Catch와 잘 섞이지 않습니다.', '구조적인 Try / Catch를 쓰세요.'],
  'On Error GoTo ErrHandler', 'Catch ex As IOException');
R('goto', 'S', 'MA', 10, ['brain-overload'],
  /^\s*GoTo\s+\w+/i,
  ['GoTo statement', 'GoTo makes control flow hard to follow.', 'Use loops, Exit or structured blocks.'],
  ['GoTo 문입니다', 'GoTo는 제어 흐름을 따라가기 어렵게 만듭니다.', '반복문, Exit 또는 구조적인 블록을 쓰세요.'],
  'GoTo Retry', 'Continue Do', { ref: 'S907' });
R('option-strict-off', 'B', 'MA', 10, ['types'],
  /^\s*Option\s+Strict\s+Off\b/i,
  ['Option Strict Off', 'Implicit narrowing conversions and late binding hide type errors until run time.', 'Use Option Strict On.'],
  ['Option Strict Off입니다', '암시적 축소 변환과 늦은 바인딩이 타입 오류를 실행 시점까지 숨깁니다.', 'Option Strict On을 쓰세요.'],
  'Option Strict Off', 'Option Strict On');
R('option-explicit-off', 'B', 'MA', 10, ['types'],
  /^\s*Option\s+Explicit\s+Off\b/i,
  ['Option Explicit Off', 'A typo in a variable name silently creates a new variable.', 'Use Option Explicit On.'],
  ['Option Explicit Off입니다', '변수 이름 오타가 조용히 새 변수를 만듭니다.', 'Option Explicit On을 쓰세요.'],
  'Option Explicit Off', 'Option Explicit On');
R('string-concat-plus', 'B', 'MI', 5, ['suspicious'],
  /"\s*\+\s*\w+|\w+\s*\+\s*"/,
  ['Strings joined with +', 'With Option Strict Off, + on a string and a number adds instead of concatenating.', 'Use & or String interpolation.'],
  ['+로 문자열을 잇습니다', 'Option Strict Off에서는 문자열과 숫자에 +를 쓰면 이어 붙이지 않고 더합니다.', '&나 문자열 보간을 쓰세요.'],
  'label.Text = "Total: " + total', 'label.Text = $"Total: {total}"', { code: /"\s*\+|\+\s*"/ });
R('empty-catch', 'S', 'MA', 5, ['error-handling'],
  /^\s*Catch\b[^:]*:\s*End\s+Try\b/i,
  ['Empty Catch block', 'The exception is silently ignored.', 'Log or handle the exception.'],
  ['빈 Catch 블록입니다', '예외를 아무 말 없이 무시합니다.', '예외를 기록하거나 처리하세요.'],
  'Catch ex As Exception : End Try', 'Catch ex As IOException : Log(ex) : End Try', { ref: 'S108' });
R('catch-exception', 'S', 'MI', 5, ['error-handling', 'cwe-396'],
  /^\s*Catch\s+\w+\s+As\s+(?:System\.)?Exception\b/i,
  ['Catching System.Exception', 'A broad catch hides programming errors.', 'Catch the specific exceptions you expect.'],
  ['System.Exception을 잡습니다', '넓은 catch는 프로그래밍 오류를 숨깁니다.', '예상하는 구체적인 예외를 잡으세요.'],
  'Catch ex As Exception', 'Catch ex As FileNotFoundException');
R('self-assignment', 'B', 'MA', 5, ['suspicious'],
  /^\s*((?:Me\.)?\w+)\s*=\s*\1\s*$/i,
  ['Variable assigned to itself', 'x = x does nothing and usually hides a typo.', 'Assign the intended value.'],
  ['변수를 자기 자신에 대입합니다', 'x = x는 아무 일도 하지 않으며 보통 오타를 숨깁니다.', '의도한 값을 대입하세요.'],
  'total = total', 'Me.total = total', { ref: 'S1656' });
R('end-statement', 'B', 'CR', 10, ['suspicious'],
  /^\s*End\s*$/i,
  ['End statement', 'End stops the process at once, skipping Finally blocks and Dispose.', 'Return from Main or call Application.Exit.'],
  ['End 문을 씁니다', 'End는 Finally 블록과 Dispose를 건너뛰고 바로 프로세스를 멈춥니다.', 'Main에서 돌아오거나 Application.Exit을 호출하세요.'],
  'End', 'Application.Exit()');

// ── Vulnerabilities and hotspots ─────────────────────────────
R('sql-concat', 'V', 'CR', 20, ['sql', 'cwe-89', 'owasp-a03'],
  /"\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^"]*"\s*&/i,
  ['SQL built by concatenation', 'Concatenated values can change the SQL statement.', 'Use parameters such as cmd.Parameters.AddWithValue("@id", id).'],
  ['문자열을 이어 SQL을 만듭니다', '이어 붙인 값이 SQL 문을 바꿀 수 있습니다.', 'cmd.Parameters.AddWithValue("@id", id) 같은 매개변수를 쓰세요.'],
  'Dim sql = "SELECT * FROM Users WHERE Name = \'" & name & "\'"', 'Dim sql = "SELECT * FROM Users WHERE Name = @name"', { ref: 'S2077' });
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b\w*(?:password|passwd|pwd|secret|apikey|token)\w*\s*(?:As\s+String\s*)?=\s*"[^"\s]{4,}"/i,
  ['Hard-coded credential', 'Anyone with the source or assembly can read the secret.', 'Read it from protected configuration or a secret store.'],
  ['자격 증명을 코드에 적었습니다', '소스나 어셈블리를 가진 누구나 비밀을 읽을 수 있습니다.', '보호된 설정이나 비밀 저장소에서 읽으세요.'],
  'Dim password As String = "Admin123!"', 'Dim password As String = config("DbPassword")', { ref: 'S2068' });
R('connection-string-password', 'V', 'BL', 30, ['cwe-798', 'secrets'],
  /"[^"]*\b(?:Password|Pwd)\s*=\s*[^;"\s]+/i,
  ['Password inside a connection string', 'The database password is stored in the code.', 'Use integrated security or read the string from protected configuration.'],
  ['연결 문자열에 비밀번호가 있습니다', '데이터베이스 비밀번호가 코드에 저장됩니다.', '통합 인증을 쓰거나 보호된 설정에서 문자열을 읽으세요.'],
  'Dim cs = "Server=db;User Id=sa;Password=Secret1;"', 'Dim cs = ConfigurationManager.ConnectionStrings("Main").ConnectionString');
R('weak-hash', 'V', 'CR', 15, ['crypto', 'cwe-328', 'owasp-a02'],
  /\b(?:MD5|SHA1)(?:CryptoServiceProvider|Managed|Cng)?\.Create\s*\(|\bNew\s+(?:MD5|SHA1)(?:CryptoServiceProvider|Managed|Cng)\b/i,
  ['Weak hash algorithm', 'MD5 and SHA-1 collisions are practical.', 'Use SHA256 or stronger.'],
  ['약한 해시 알고리즘입니다', 'MD5와 SHA-1은 충돌을 실제로 만들 수 있습니다.', 'SHA256 이상을 쓰세요.'],
  'Using md5 = MD5.Create()', 'Using sha = SHA256.Create()', { ref: 'S4790' });
R('weak-cipher', 'V', 'CR', 15, ['crypto', 'cwe-327', 'owasp-a02'],
  /\b(?:DES|TripleDES|RC2)(?:CryptoServiceProvider)?\.Create\s*\(|\bNew\s+(?:DES|TripleDES|RC2)CryptoServiceProvider\b|\bCipherMode\.ECB\b/i,
  ['Weak cipher or ECB mode', 'DES, 3DES and RC2 are too weak and ECB leaks patterns.', 'Use AesGcm.'],
  ['약한 암호 또는 ECB 모드입니다', 'DES, 3DES, RC2는 너무 약하고 ECB는 패턴을 드러냅니다.', 'AesGcm을 쓰세요.'],
  'Dim des = New DESCryptoServiceProvider()', 'Dim aes = New AesGcm(key)', { ref: 'S5547' });
R('cert-validation-off', 'V', 'CR', 30, ['tls', 'cwe-295', 'owasp-a07'],
  /ServerCertificateValidationCallback\s*=.*\bTrue\b|ServerCertificateCustomValidationCallback\s*=.*\bTrue\b/i,
  ['TLS certificate validation turned off', 'Accepting every certificate allows man-in-the-middle attacks.', 'Remove the callback, or validate and pin the certificate.'],
  ['TLS 인증서 검증을 끕니다', '모든 인증서를 받으면 중간자 공격을 허용합니다.', '콜백을 지우거나 인증서를 검증하고 고정하세요.'],
  'ServicePointManager.ServerCertificateValidationCallback = Function(s, c, ch, e) True', 'handler.ServerCertificateCustomValidationCallback = AddressOf ValidatePinned', { ref: 'S4830' });
R('weak-tls', 'V', 'CR', 15, ['tls', 'cwe-327', 'owasp-a02'],
  /\bSecurityProtocolType\.(?:Ssl3|Tls|Tls11)\b/,
  ['Old TLS / SSL protocol enabled', 'SSL 3, TLS 1.0 and 1.1 are broken or deprecated.', 'Use TLS 1.2 or later, or leave the system default.'],
  ['오래된 TLS / SSL 프로토콜을 켭니다', 'SSL 3, TLS 1.0, 1.1은 깨졌거나 지원이 끝났습니다.', 'TLS 1.2 이상을 쓰거나 시스템 기본값을 두세요.'],
  'ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls', 'ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12', { ref: 'S4423' });
R('weak-random', 'H', 'MI', 10, ['cwe-338', 'crypto'],
  /\bNew\s+Random\s*\(|(?<![\w.])Rnd\s*\(/i,
  ['Non-cryptographic random generator', 'Random and Rnd are predictable.', 'Use RandomNumberGenerator for tokens and keys.'],
  ['암호용이 아닌 난수 생성기입니다', 'Random과 Rnd는 예측할 수 있습니다.', '토큰과 키에는 RandomNumberGenerator를 쓰세요.'],
  'Dim token = New Random().Next()', 'Dim token = RandomNumberGenerator.GetInt32(Integer.MaxValue)', { ref: 'S2245' });
R('process-start-concat', 'V', 'CR', 20, ['cwe-78', 'owasp-a03'],
  /\b(?:Process\.Start|Shell)\s*\([^)]*&/i,
  ['OS command built by concatenation', 'Values joined into a command line can run other commands.', 'Pass arguments through ProcessStartInfo.ArgumentList.'],
  ['문자열을 이어 OS 명령을 만듭니다', '명령줄에 이어 붙인 값이 다른 명령을 실행할 수 있습니다.', 'ProcessStartInfo.ArgumentList로 인자를 넘기세요.'],
  'Process.Start("cmd.exe", "/c dir " & folder)', 'psi.ArgumentList.Add(folder)');
R('http-url', 'H', 'MI', 5, ['tls', 'cwe-319'],
  /"http:\/\/(?!localhost|127\.0\.0\.1)[\w.-]+/i,
  ['Clear-text HTTP URL', 'Traffic over http:// can be read and changed on the network.', 'Use https://.'],
  ['평문 HTTP URL입니다', 'http:// 트래픽은 네트워크에서 읽고 바꿀 수 있습니다.', 'https://를 쓰세요.'],
  'Dim url = "http://api.example.com/v1"', 'Dim url = "https://api.example.com/v1"', { ref: 'S5332' });
R('binary-formatter', 'V', 'CR', 30, ['cwe-502', 'owasp-a08'],
  /\bNew\s+(?:BinaryFormatter|SoapFormatter|NetDataContractSerializer|LosFormatter)\b/i,
  ['Insecure deserializer', 'BinaryFormatter and similar can run code from untrusted data.', 'Use System.Text.Json or a data-only serializer.'],
  ['안전하지 않은 역직렬화기입니다', 'BinaryFormatter 등은 믿을 수 없는 데이터에서 코드를 실행할 수 있습니다.', 'System.Text.Json 같은 데이터 전용 직렬화기를 쓰세요.'],
  'Dim f = New BinaryFormatter()', 'Dim user = JsonSerializer.Deserialize(Of User)(json)');

// ── Code smells ──────────────────────────────────────────────
R('object-type', 'S', 'MI', 5, ['types'],
  /\bDim\s+\w+(?:\s*,\s*\w+)*\s*(?:$|As\s+Object\b)/i,
  ['Variable without a type or typed Object', 'Late-bound Object variables hide type errors until run time.', 'Declare the concrete type.'],
  ['타입이 없거나 Object인 변수입니다', '늦은 바인딩 Object 변수는 타입 오류를 실행 시점까지 숨깁니다.', '구체적인 타입을 선언하세요.'],
  'Dim item As Object', 'Dim item As Customer');
R('console-writeline', 'S', 'MI', 2, ['debug'],
  /^\s*(?:Console\.Write(?:Line)?|Debug\.Print|MsgBox)\s*\(/i,
  ['Console or MsgBox debug output', 'Debug output is not a log and cannot be filtered.', 'Use a logger.'],
  ['Console이나 MsgBox 디버그 출력입니다', '디버그 출력은 로그가 아니라 거를 수 없습니다.', '로거를 쓰세요.'],
  'Console.WriteLine("value=" & value)', 'logger.LogDebug("value={Value}", value)', { ref: 'S106' });
R('legacy-vb-functions', 'S', 'MI', 5, ['legacy'],
  /(?<![\w.])(?:Left|Right|Mid|Len|InStr|UCase|LCase|CStr|CInt)\s*\(/,
  ['Legacy VB runtime function', 'Microsoft.VisualBasic helpers duplicate String methods and behave differently with Nothing.', 'Use String methods such as Substring, Length and ToUpper.'],
  ['예전 VB 런타임 함수입니다', 'Microsoft.VisualBasic 도우미는 String 메서드와 겹치고 Nothing에서 다르게 동작합니다.', 'Substring, Length, ToUpper 같은 String 메서드를 쓰세요.'],
  'Dim prefix = Left(name, 3)', 'Dim prefix = name.Substring(0, 3)');
R('exit-sub', 'S', 'MI', 5, ['brain-overload'],
  /^\s*Exit\s+(?:Sub|Function|Property)\b/i,
  ['Exit Sub / Exit Function', 'Early exits through Exit make the flow harder to follow than Return.', 'Use Return, or restructure the condition.'],
  ['Exit Sub / Exit Function을 씁니다', 'Exit로 일찍 나가면 Return보다 흐름을 따라가기 어렵습니다.', 'Return을 쓰거나 조건을 다시 짜세요.'],
  'Exit Sub', 'Return');
R('todo', 'S', 'IN', 5, ['unfinished'],
  /\b(?:TODO|FIXME)\b/,
  ['TODO / FIXME comment', 'The comment marks unfinished work.', 'Finish the work or open a tracked issue.'],
  ['TODO / FIXME 주석입니다', '주석이 끝나지 않은 일을 표시합니다.', '작업을 끝내거나 추적하는 이슈를 여세요.'],
  '\' TODO: validate input', '\' Input is validated by the binder.', { scope: 'any', ref: 'S1135' });
R('empty-sub', 'S', 'MI', 5, ['suspicious'],
  /^\s*(?:(?:Public|Private|Protected|Friend|Shared|Overrides)\s+)*Sub\s+\w+\s*\([^)]*\)\s*:\s*End\s+Sub\b/i,
  ['Empty Sub', 'An empty body is unfinished or should say why it does nothing.', 'Implement it or add a comment.'],
  ['빈 Sub입니다', '빈 본문은 미완성이거나 왜 아무 일도 안 하는지 설명해야 합니다.', '구현하거나 주석을 다세요.'],
  'Private Sub Reload() : End Sub', 'Private Sub Reload() : grid.Refresh() : End Sub', { ref: 'S1186' });

module.exports = { RULES: R.rules };
