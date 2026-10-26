'use strict';

// Visual Basic 6 / VBA (.bas .frm .ctl). Error handling, loose typing and
// the classic security mistakes of COM-era code.

const { maker } = require('./util');

const R = maker('vb6', ['vb6']);

R('on-error-resume-next', 'B', 'CR', 15, ['error-handling'],
  /^\s*On\s+Error\s+Resume\s+Next\b/i,
  ['On Error Resume Next', 'Every later error is silently ignored and the code runs on with bad state.', 'Use On Error GoTo with a handler that reports the error, and turn it off with On Error GoTo 0.'],
  ['On Error Resume Next를 씁니다', '이후 모든 오류가 조용히 무시되고 잘못된 상태로 계속 실행됩니다.', '오류를 알리는 처리기로 On Error GoTo를 쓰고 On Error GoTo 0으로 끄세요.'],
  'On Error Resume Next', 'On Error GoTo ErrHandler');
R('goto', 'S', 'MA', 10, ['brain-overload'],
  /^\s*(?:GoTo|GoSub)\s+\w+/i,
  ['GoTo / GoSub statement', 'GoTo and GoSub make control flow hard to follow.', 'Use loops, Exit or separate procedures.'],
  ['GoTo / GoSub 문입니다', 'GoTo와 GoSub는 제어 흐름을 따라가기 어렵게 만듭니다.', '반복문, Exit 또는 별도 프로시저를 쓰세요.'],
  'GoTo Retry', 'Call Retry', { ref: 'S907' });
R('variant', 'S', 'MI', 5, ['types'],
  /\b(?:Dim|Private|Public|Static)\s+\w+(?:\s*\(\s*\))?\s*(?:$|,|As\s+Variant\b)/i,
  ['Variable declared as Variant', 'An untyped or Variant variable hides type errors and is slower.', 'Declare an explicit type such as As Long or As String.'],
  ['변수를 Variant로 선언합니다', '타입 없는 변수나 Variant는 타입 오류를 숨기고 더 느립니다.', 'As Long, As String 같은 명시적 타입을 선언하세요.'],
  'Dim count As Variant', 'Dim count As Long');
R('multi-dim-untyped', 'B', 'MA', 5, ['types'],
  /\bDim\s+\w+\s*,\s*\w+(?:\s*,\s*\w+)*\s+As\s+\w+/i,
  ['Several variables with one As clause', 'In VB6 only the last variable gets the type; the others become Variant.', 'Give each variable its own As clause.'],
  ['여러 변수에 As 절을 하나만 씁니다', 'VB6에서는 마지막 변수만 타입을 받고 나머지는 Variant가 됩니다.', '변수마다 As 절을 따로 다세요.'],
  'Dim i, j As Long', 'Dim i As Long, j As Long');
R('sql-concat', 'V', 'CR', 20, ['sql', 'cwe-89', 'owasp-a03'],
  /"\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^"]*"\s*&/i,
  ['SQL built by concatenation', 'Concatenated values can change the SQL statement.', 'Use an ADODB.Command with parameters.'],
  ['문자열을 이어 SQL을 만듭니다', '이어 붙인 값이 SQL 문을 바꿀 수 있습니다.', '매개변수가 있는 ADODB.Command를 쓰세요.'],
  'rs.Open "SELECT * FROM Users WHERE Name = \'" & txtName.Text & "\'", cn', 'cmd.CommandText = "SELECT * FROM Users WHERE Name = ?"', { ref: 'S2077' });
R('hardcoded-password', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  /\b\w*(?:password|passwd|pwd|secret)\w*\s*=\s*"[^"\s]{4,}"|"[^"]*\b(?:Password|Pwd)\s*=\s*[^;"\s]+/i,
  ['Hard-coded credential', 'Anyone with the source or executable can read the secret.', 'Use Windows authentication or read it from protected storage.'],
  ['자격 증명을 코드에 적었습니다', '소스나 실행 파일을 가진 누구나 비밀을 읽을 수 있습니다.', 'Windows 인증을 쓰거나 보호된 저장소에서 읽으세요.'],
  'cn.Open "Provider=SQLOLEDB;Data Source=db;User ID=sa;Password=Secret1;"', 'cn.Open "Provider=SQLOLEDB;Data Source=db;Integrated Security=SSPI;"', { ref: 'S2068' });
R('shell-concat', 'V', 'CR', 20, ['cwe-78', 'owasp-a03'],
  /(?<![\w.])Shell\s*\(?[^)]*&/i,
  ['Shell command built by concatenation', 'Values joined into a command line can run other commands.', 'Validate the value strictly or avoid the shell.'],
  ['문자열을 이어 Shell 명령을 만듭니다', '명령줄에 이어 붙인 값이 다른 명령을 실행할 수 있습니다.', '값을 엄격히 검증하거나 셸을 피하세요.'],
  'Shell "cmd /c del " & fileName', 'Kill fileName');
R('weak-random', 'H', 'MI', 10, ['cwe-338', 'crypto'],
  /(?<![\w.])Rnd\s*(?:\(|$)/i,
  ['Rnd used for random values', 'Rnd is predictable and must not produce tokens or passwords.', 'Use CryptGenRandom through the Windows API.'],
  ['Rnd로 난수를 만듭니다', 'Rnd는 예측할 수 있어 토큰이나 비밀번호를 만들면 안 됩니다.', 'Windows API의 CryptGenRandom을 쓰세요.'],
  'token = Int(Rnd() * 1000000)', 'token = SecureRandomToken()', { ref: 'S2245' });
R('end-statement', 'B', 'CR', 10, ['suspicious'],
  /^\s*End\s*$/i,
  ['End statement', 'End stops the program at once without unloading forms or releasing objects.', 'Unload the forms and let the program finish.'],
  ['End 문을 씁니다', 'End는 폼을 내리거나 객체를 놓지 않고 바로 프로그램을 멈춥니다.', '폼을 Unload하고 프로그램이 끝나게 두세요.'],
  'End', 'Unload Me');
R('debug-print', 'S', 'MI', 2, ['debug'],
  /^\s*(?:Debug\.Print|MsgBox)\b/i,
  ['Debug.Print or MsgBox debug output', 'Debug output is noise in production and MsgBox blocks unattended runs.', 'Write to a log file.'],
  ['Debug.Print나 MsgBox 디버그 출력입니다', '디버그 출력은 운영에서 잡음이고 MsgBox는 무인 실행을 막습니다.', '로그 파일에 쓰세요.'],
  'Debug.Print "value=" & value', 'LogWrite "value=" & value', { ref: 'S106' });
R('implicit-type-suffix', 'S', 'MI', 2, ['types'],
  /\b(?:Dim|Private|Public)\s+\w+[$%&!#@]\s*(?:$|,)/i,
  ['Type declaration character', 'Suffixes such as $ and % are cryptic.', 'Use an As clause.'],
  ['타입 선언 문자를 씁니다', '$, % 같은 접미사는 알아보기 어렵습니다.', 'As 절을 쓰세요.'],
  'Dim name$', 'Dim name As String');
R('exit-sub', 'S', 'MI', 5, ['brain-overload'],
  /^\s*Exit\s+(?:Sub|Function|Property)\b/i,
  ['Exit Sub / Exit Function', 'Many early exits make a procedure hard to follow.', 'Restructure the conditions so the procedure has one exit.'],
  ['Exit Sub / Exit Function을 씁니다', '일찍 나가는 곳이 많으면 프로시저를 따라가기 어렵습니다.', '조건을 다시 짜서 나가는 곳을 하나로 만드세요.'],
  'Exit Sub', 'End If');

module.exports = { RULES: R.rules };
