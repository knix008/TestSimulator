'use strict';

// PHP.

const { maker, nestedTernary } = require('./util');

const R = maker('php', ['php']);

const IF_PAREN = String.raw`\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)`;
const INPUT = String.raw`\$_(?:GET|POST|REQUEST|COOKIE|FILES)\b`;

// ── Bugs ─────────────────────────────────────────────────────
R('self-assignment', 'B', 'MA', 5, ['pitfall'],
  /^\s*(\$\w+(?:->\w+)*)\s*=(?![=>])\s*\1\s*;/,
  ['Variable is assigned to itself', 'A self-assignment does nothing; in a constructor $this-> is usually missing.', 'Assign the parameter: $this->name = $name;.'],
  ['변수를 자기 자신에게 대입합니다', '자기 대입은 아무 일도 하지 않으며 생성자에서는 보통 $this->가 빠진 것입니다.', '매개변수를 대입하세요: $this->name = $name;.'],
  '$name = $name;', '$this->name = $name;');
R('identical-operands', 'B', 'MA', 5, ['pitfall'],
  /(?<![\w$>])(?<![=!<>+\-*\/%&|.]\s*)(\$\w+(?:->\w+)*)\s*(?:===|!==|==|!=|<=|>=|&&|\|\|)\s*\1(?![\w\->(\[])(?=\s*(?:[);,?:]|&&|\|\||$))/,
  ['Identical expressions on both sides of an operator', 'Comparing or combining an expression with itself always gives the same result.', 'Fix the operand that was meant to differ; use is_nan for NaN checks.'],
  ['연산자 양쪽 식이 같습니다', '같은 식끼리 비교하거나 묶으면 결과가 항상 같습니다.', '달라야 할 피연산자를 고치세요. NaN 검사는 is_nan을 쓰세요.'],
  'if ($a->id === $a->id) {', ['if ($a->id === $b->id) {', 'if ($n >= $max || $max === 0) {'], { ns: true });
R('loose-comparison', 'B', 'MA', 5, ['pitfall', 'cwe-597'],
  /[^=!<>]==[^=]|!=[^=]|<>/,
  ['Loose comparison', '== juggles types: "abc" == 0 was true before PHP 8 and "1e3" == "1000" is still true.', 'Use === and !==.'],
  ['느슨한 비교입니다', '==는 타입을 바꿉니다. PHP 8 이전에는 "abc" == 0이 참이었고 "1e3" == "1000"은 지금도 참입니다.', '=== 와 !== 를 쓰세요.'],
  'if ($token == $expected) {', 'if (hash_equals($expected, $token)) {',
  { ns: true, skip: (raw, line) => !/[^=!<>]==[^=]|!=[^=]|<>/.test(String(line).replace(/===|!==/g, '')) });
R('float-equality', 'B', 'MI', 5, ['pitfall'],
  /[=!]==?\s*-?\d+\.\d+(?![\d.])/,
  ['Equality test on a floating-point literal', 'Floating-point results are rarely exactly equal to a literal.', 'Compare with a tolerance: abs($a - $b) < PHP_FLOAT_EPSILON.'],
  ['부동소수점 리터럴과 동등 비교합니다', '부동소수점 결과는 리터럴과 정확히 같은 경우가 드뭅니다.', '오차 범위로 비교하세요: abs($a - $b) < PHP_FLOAT_EPSILON.'],
  'if ($total === 0.3) {', 'if (abs($total - 0.3) < 1e-9) {', { ns: true });
R('empty-statement-after-control', 'B', 'MA', 5, ['pitfall'],
  new RegExp(String.raw`^\s*(?:if|for|foreach|while)\s*${IF_PAREN}\s*;\s*$`),
  ['Semicolon right after if / for / while', 'The semicolon is the whole body, so the next block always runs.', 'Remove the semicolon.'],
  ['if / for / while 바로 뒤에 세미콜론이 있습니다', '세미콜론이 본문 전체가 되어 다음 블록이 항상 실행됩니다.', '세미콜론을 지우세요.'],
  'if ($count > 0);', ['if ($count > 0) run();', '} while ($running);']);
R('nested-ternary', 'B', 'MA', 5, ['confusing'],
  /[\s)\]]\?\s.*[\s)\]]\?\s/,
  ['Nested ternary operator', 'Unparenthesized nested ternaries are a fatal error in PHP 8, and nested ones are hard to read anyway.', 'Use if / else or match.'],
  ['중첩된 삼항 연산자입니다', '괄호 없는 중첩 삼항은 PHP 8에서 치명적 오류이고 중첩 자체도 읽기 어렵습니다.', 'if / else나 match를 쓰세요.'],
  "$s = $a ? 'x' : $b ? 'y' : 'z';", ["$s = $a ? 'x' : 'z';", "$t = ($a ? 1 : 2) + ($b ? 3 : 4);"], { skip: (raw, line) => !nestedTernary(line) });
R('removed-function', 'B', 'CR', 10, ['deprecated'],
  /(?<![\w$>:])(?:each|ereg|eregi|ereg_replace|eregi_replace|split|spliti|money_format|get_magic_quotes_gpc|create_function|mysql_\w+)\s*\(/,
  ['Function removed from PHP', 'each, ereg*, split, create_function, money_format and mysql_* no longer exist in PHP 7 / 8.', 'Use foreach, preg_*, explode, closures, NumberFormatter and PDO / mysqli.'],
  ['PHP에서 제거된 함수입니다', 'each, ereg*, split, create_function, money_format, mysql_*는 PHP 7 / 8에 없습니다.', 'foreach, preg_*, explode, 클로저, NumberFormatter, PDO / mysqli를 쓰세요.'],
  '$parts = split(",", $line);', '$parts = explode(",", $line);');
R('parse-str-one-arg', 'B', 'CR', 10, ['cwe-621', 'deprecated'],
  /\bparse_str\s*\(\s*[^,()]+\)/,
  ['parse_str without a result array', 'With one argument parse_str created variables from the query string; PHP 8 requires the second argument.', 'Pass an array: parse_str($q, $params).'],
  ['결과 배열 없는 parse_str입니다', '인자가 하나면 parse_str가 쿼리 문자열로 변수를 만들었고 PHP 8은 두 번째 인자를 요구합니다.', '배열을 넘기세요: parse_str($q, $params).'],
  'parse_str($_SERVER["QUERY_STRING"]);', 'parse_str($query, $params);');
R('loose-in-array', 'S', 'MI', 2, ['pitfall'],
  /\b(?:in_array|array_search|array_keys)\s*\(\s*[^,()]+,\s*[^,()]+\)/,
  ['in_array / array_search without strict mode', 'The default loose comparison matches "1abc" against 1 and similar.', 'Pass true as the third argument.'],
  ['strict 모드 없는 in_array / array_search입니다', '기본 느슨한 비교는 "1abc"를 1과 같게 보는 식으로 일치시킵니다.', '세 번째 인자로 true를 넘기세요.'],
  'if (in_array($role, $allowed)) {', 'if (in_array($role, $allowed, true)) {');

// ── Code smells ──────────────────────────────────────────────
R('debug-output', 'S', 'MA', 5, ['debug'],
  /\b(?:var_dump|print_r|var_export|debug_zval_dump|debug_print_backtrace|dd|dump)\s*\(/,
  ['Debug output left in', 'var_dump and print_r leak internals to the page.', 'Use a logger.'],
  ['디버그 출력이 남아 있습니다', 'var_dump와 print_r는 내부 정보를 페이지에 흘립니다.', '로거를 쓰세요.'],
  'var_dump($user);', ['$log->debug("user", ["id" => $id]);', '$text = print_r($data, true);'],
  { skip: (raw) => /\b(?:print_r|var_export)\s*\([^;]*,\s*true\s*\)/.test(raw) });
R('exit-die', 'S', 'MI', 5, ['design'],
  /(?<![\w$>:])(?:die|exit)\s*(?:\(|;)/,
  ['exit / die in code', 'Ending the script abruptly skips cleanup and is hard to test.', 'Throw an exception or return a response.'],
  ['코드에서 exit / die를 씁니다', '스크립트를 갑자기 끝내면 정리를 건너뛰고 테스트하기 어렵습니다.', '예외를 던지거나 응답을 반환하세요.'],
  'die("db error");', 'throw new RuntimeException("db error");');
R('error-suppression', 'S', 'MA', 5, ['error-handling'],
  /(?<![\w@.'"])@(?:\$\w+|[a-z_]\w*\s*\()/,
  ['Error suppression operator @', '@ hides warnings that point at real failures.', 'Check the result and handle the error.'],
  ['오류 억제 연산자 @를 씁니다', '@는 실제 실패를 가리키는 경고를 숨깁니다.', '결과를 확인하고 오류를 처리하세요.'],
  '$data = @file_get_contents($path);', '$data = file_get_contents($path);', { ns: true });
R('variable-variables', 'S', 'MA', 5, ['confusing'],
  /\$\$\w+|\$\{\s*\$\w+\s*\}/,
  ['Variable variable', '$$name makes it impossible to see which variable is read or written.', 'Use an array.'],
  ['가변 변수입니다', '$$name은 어떤 변수를 읽고 쓰는지 알 수 없게 만듭니다.', '배열을 쓰세요.'],
  '$$field = $value;', '$data[$field] = $value;', { ns: true });
R('global-statement', 'S', 'MA', 5, ['design'],
  /^\s*global\s+\$/,
  ['global statement', 'Globals make functions depend on hidden state.', 'Pass values in, or inject a service.'],
  ['global 문입니다', '전역은 함수를 숨은 상태에 의존하게 만듭니다.', '값을 넘기거나 서비스를 주입하세요.'],
  '    global $db;', '    $db = $this->db;');
R('empty-function', 'S', 'MI', 5, ['suspicious'],
  /\bfunction\s+\w+\s*\([^)]*\)\s*(?::\s*\??[\w\\]+\s*)?\{\s*\}/,
  ['Empty function', 'An empty body is unfinished or should explain why it does nothing.', 'Implement it or add a comment.'],
  ['빈 함수입니다', '빈 본문은 미완성이거나 왜 아무 일도 안 하는지 설명해야 합니다.', '구현하거나 주석을 다세요.'],
  'public function boot() {}', ['public function boot() { $this->load(); }', 'public function __construct(private Db $db) {}'],
  { skip: (raw) => /function\s+__construct\s*\(/.test(raw) });
R('class-naming', 'S', 'MI', 2, ['convention'],
  /^\s*(?:(?:abstract|final|readonly)\s+)*(?:class|interface|trait|enum)\s+[a-z]\w*/,
  ['Type name not in PascalCase', 'PSR-1 names classes in StudlyCaps.', 'Rename the type.'],
  ['타입 이름이 PascalCase가 아닙니다', 'PSR-1은 클래스 이름을 StudlyCaps로 씁니다.', '타입 이름을 바꾸세요.'],
  'class user_repository {', 'class UserRepository {');
R('else-if', 'S', 'IN', 1, ['convention'],
  /\belse\s+if\b/,
  ['else if instead of elseif', 'PSR-12 uses elseif so that the structure reads as one statement.', 'Write elseif.'],
  ['elseif 대신 else if를 씁니다', 'PSR-12는 한 문장으로 읽히도록 elseif를 씁니다.', 'elseif로 쓰세요.'],
  '} else if ($b) {', '} elseif ($b) {');
R('goto', 'S', 'MA', 10, ['confusing'],
  /\bgoto\s+\w+\s*;/,
  ['goto statement', 'goto makes the control flow hard to follow.', 'Use loops, functions or early returns.'],
  ['goto 문입니다', 'goto는 흐름을 따라가기 어렵게 합니다.', '반복문, 함수, 이른 반환을 쓰세요.'],
  'goto retry;', 'continue;');
R('error-reporting-off', 'S', 'MA', 5, ['error-handling'],
  /\berror_reporting\s*\(\s*0\s*\)|\bini_set\s*\(\s*['"]error_reporting['"]\s*,\s*['"]?0/,
  ['Error reporting switched off', 'Turning off error reporting hides problems instead of logging them.', 'Keep E_ALL and set display_errors off, log_errors on.'],
  ['오류 보고를 끕니다', '오류 보고를 끄면 문제를 기록하지 않고 숨깁니다.', 'E_ALL을 유지하고 display_errors는 끄고 log_errors는 켜세요.'],
  'error_reporting(0);', 'error_reporting(E_ALL);');
R('short-open-tag', 'S', 'MI', 2, ['convention'],
  /<\?(?!php\b|=|xml\b)/,
  ['Short open tag <?', 'short_open_tag may be off on the server, which then prints the code.', 'Use <?php or <?=.'],
  ['짧은 여는 태그 <?', '서버에서 short_open_tag가 꺼져 있으면 코드가 그대로 출력됩니다.', '<?php나 <?=를 쓰세요.'],
  '<? echo $title; ?>', '<?php echo $title; ?>');
R('redundant-boolean', 'S', 'MI', 2, ['clumsy'],
  /[=!]==\s*(?:true|false)\b|\b(?:true|false)\s*[=!]==/i,
  ['Strict comparison with a boolean literal', '$x === true is just $x when $x is a bool.', 'Test the value directly.'],
  ['불리언 리터럴과 엄격 비교합니다', '$x가 bool이면 $x === true는 그냥 $x입니다.', '값을 직접 검사하세요.'],
  'if ($valid === true) {', ['if ($valid) {', 'if (strpos($s, "x") !== false) {'],
  { ns: true, skip: (raw) => /\b(?:strpos|stripos|strrpos|array_search|file_get_contents|fopen|preg_match|json_decode|mb_strpos|readdir|fgets|curl_exec)\s*\(/.test(raw) });

// ── Vulnerabilities and hotspots ─────────────────────────────
R('display-errors', 'V', 'MA', 10, ['cwe-489', 'owasp-a05'],
  /\bini_set\s*\(\s*['"]display_errors['"]\s*,\s*['"]?(?:1|on|true)\b/i,
  ['display_errors switched on', 'Errors shown to users reveal paths, queries and versions.', 'Log errors and keep display_errors off in production.'],
  ['display_errors를 켭니다', '사용자에게 보이는 오류는 경로, 질의, 버전을 드러냅니다.', '오류는 기록하고 운영에서는 display_errors를 끄세요.'],
  "ini_set('display_errors', '1');", "ini_set('display_errors', '0');");
R('phpinfo', 'V', 'MA', 10, ['cwe-200', 'owasp-a05'],
  /\bphpinfo\s*\(/,
  ['phpinfo() call', 'phpinfo prints configuration, paths and environment variables.', 'Remove it.'],
  ['phpinfo() 호출입니다', 'phpinfo는 설정, 경로, 환경 변수를 출력합니다.', '지우세요.'],
  'phpinfo();', 'echo PHP_VERSION_ID > 80000 ? "ok" : "old";');
R('weak-hash', 'H', 'CR', 15, ['cwe-328', 'owasp-a02', 'crypto'],
  /(?<![\w$>:])(?:md5|sha1|crc32|md5_file|sha1_file)\s*\(|\bhash\s*\(\s*['"](?:md2|md4|md5|sha1|crc32b?|adler32)['"]/i,
  ['Weak hash function', 'MD5, SHA-1 and CRC32 are not collision resistant.', 'Use hash("sha256", ...) or password_hash for passwords.'],
  ['약한 해시 함수입니다', 'MD5, SHA-1, CRC32는 충돌에 강하지 않습니다.', 'hash("sha256", ...)을 쓰고 비밀번호에는 password_hash를 쓰세요.'],
  '$sig = sha1($payload);', "$sig = hash('sha256', $payload);",
  { skip: (raw) => /\bmd5\s*\(\s*\$(?:password|passwd|pwd)/i.test(raw) });
R('crypt-call', 'V', 'MA', 10, ['cwe-916', 'owasp-a02', 'crypto'],
  /(?<![\w$>:])crypt\s*\(/,
  ['crypt() for password hashing', 'crypt with a hand-made salt often falls back to weak DES or MD5 schemes.', 'Use password_hash and password_verify.'],
  ['비밀번호 해시에 crypt()를 씁니다', '직접 만든 솔트의 crypt는 약한 DES나 MD5 방식으로 떨어지기 쉽습니다.', 'password_hash와 password_verify를 쓰세요.'],
  '$hash = crypt($password, $salt);', '$hash = password_hash($password, PASSWORD_DEFAULT);');
R('mcrypt', 'V', 'CR', 20, ['cwe-327', 'owasp-a02', 'crypto', 'deprecated'],
  /\bmcrypt_\w+\s*\(/,
  ['mcrypt extension', 'mcrypt is unmaintained, removed in PHP 7.2 and defaults to unsafe modes.', 'Use sodium_crypto_secretbox or openssl with AES-256-GCM.'],
  ['mcrypt 확장입니다', 'mcrypt는 관리되지 않고 PHP 7.2에서 제거됐으며 기본 모드가 안전하지 않습니다.', 'sodium_crypto_secretbox나 AES-256-GCM의 openssl을 쓰세요.'],
  '$c = mcrypt_encrypt(MCRYPT_RIJNDAEL_128, $k, $d, MCRYPT_MODE_ECB);', '$c = sodium_crypto_secretbox($d, $nonce, $k);');
R('openssl-weak-cipher', 'V', 'CR', 20, ['cwe-327', 'owasp-a02', 'crypto'],
  /\bopenssl_(?:encrypt|decrypt)\s*\([^,]+,\s*['"](?:des|des-[\w-]+|rc4[\w-]*|rc2[\w-]*|bf[\w-]*|[\w-]*-ecb)['"]/i,
  ['Weak openssl cipher or ECB mode', 'DES, RC4, RC2, Blowfish and ECB mode are broken or leak patterns.', 'Use aes-256-gcm.'],
  ['약한 openssl 암호나 ECB 모드입니다', 'DES, RC4, RC2, Blowfish, ECB 모드는 깨졌거나 패턴을 드러냅니다.', 'aes-256-gcm을 쓰세요.'],
  "openssl_encrypt($data, 'aes-128-ecb', $key);", "openssl_encrypt($data, 'aes-256-gcm', $key, 0, $iv, $tag);");
R('insecure-random', 'H', 'MA', 10, ['cwe-330', 'owasp-a02'],
  /(?<![\w$>:])(?:rand|mt_rand|lcg_value|uniqid|mt_srand|srand)\s*\(/,
  ['Non-cryptographic random value', 'rand, mt_rand and uniqid are predictable and must not create tokens.', 'Use random_bytes or random_int.'],
  ['암호학적이지 않은 난수입니다', 'rand, mt_rand, uniqid는 예측 가능해 토큰을 만들면 안 됩니다.', 'random_bytes나 random_int를 쓰세요.'],
  '$token = md5(uniqid());', '$token = bin2hex(random_bytes(32));');
R('ssl-verify-disabled', 'V', 'CR', 15, ['cwe-295', 'owasp-a07', 'tls'],
  /CURLOPT_SSL_VERIFY(?:PEER|HOST)\s*,\s*(?:false|0)\b|['"]verify_peer(?:_name)?['"]\s*=>\s*false\b|['"]verify['"]\s*=>\s*false\b/i,
  ['TLS certificate check disabled', 'Without verification any certificate is accepted, allowing man-in-the-middle.', 'Keep verification on and set CURLOPT_CAINFO if needed.'],
  ['TLS 인증서 검사를 끕니다', '검증하지 않으면 아무 인증서나 받아들여 중간자 공격을 허용합니다.', '검증을 켜 두고 필요하면 CURLOPT_CAINFO를 설정하세요.'],
  'curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);', 'curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);');
R('sql-interpolation', 'V', 'CR', 20, ['cwe-89', 'owasp-a03', 'sql'],
  /\b(?:mysqli_query|mysqli_multi_query|pg_query|sqlite_query|->query|->exec|->prepare|->rawQuery|DB::(?:select|statement|raw|unprepared)|->whereRaw|->selectRaw|->orderByRaw)\s*\([^;]*(?:"[^"]*\$\w|['"]\s*\.\s*\$)/i,
  ['SQL built with variables', 'Values interpolated or concatenated into SQL allow injection.', 'Use prepared statements with bound parameters.'],
  ['변수로 SQL을 만듭니다', 'SQL에 끼워 넣거나 이어 붙인 값은 주입을 허용합니다.', '바인딩 매개변수가 있는 준비된 문장을 쓰세요.'],
  '$db->query("SELECT * FROM users WHERE id = $id");', '$stmt = $db->prepare("SELECT * FROM users WHERE id = ?");');
R('file-from-input', 'V', 'CR', 20, ['cwe-22', 'owasp-a01'],
  new RegExp(String.raw`\b(?:file_get_contents|fopen|readfile|file|unlink|file_put_contents|copy|rename|move_uploaded_file|opendir|scandir)\s*\([^;]*${INPUT}`),
  ['File path from request input', 'A path from input can use ../ or a URL wrapper to reach other files.', 'Use basename and check the path against an allowed folder.'],
  ['요청 입력으로 파일 경로를 만듭니다', '입력으로 만든 경로는 ../나 URL 래퍼로 다른 파일에 닿을 수 있습니다.', 'basename을 쓰고 허용 폴더로 경로를 확인하세요.'],
  "readfile('/var/data/' . $_GET['f']);", "readfile('/var/data/' . basename($name));",
  { skip: (raw) => /\bbasename\s*\(/.test(raw) && !/move_uploaded_file/.test(raw) });
R('open-redirect', 'V', 'CR', 20, ['cwe-601', 'owasp-a01'],
  new RegExp(String.raw`\bheader\s*\(\s*['"]Location:\s*['"]?\s*\.\s*${INPUT}|\bheader\s*\(\s*"Location:\s*\{?${INPUT}|->redirect(?:To)?\s*\(\s*${INPUT}`, 'i'),
  ['Redirect to request input', 'Redirecting to a user-supplied URL sends victims to phishing sites.', 'Redirect only to known local paths.'],
  ['요청 입력으로 리다이렉트합니다', '사용자가 준 URL로 보내면 피싱 사이트로 유도됩니다.', '알려진 로컬 경로로만 보내세요.'],
  "header('Location: ' . $_GET['next']);", "header('Location: /home');");
R('reflected-xss', 'V', 'CR', 20, ['cwe-79', 'owasp-a03', 'xss'],
  new RegExp(String.raw`\b(?:print|printf|echo)\b[^;]*(?:${INPUT}|\$_SERVER\[['"](?:PHP_SELF|REQUEST_URI|QUERY_STRING|HTTP_REFERER|HTTP_USER_AGENT)['"]\])`),
  ['Request input printed without escaping', 'Echoing input unescaped is reflected XSS.', 'Wrap the value in htmlspecialchars($v, ENT_QUOTES).'],
  ['요청 입력을 이스케이프 없이 출력합니다', '이스케이프 없이 입력을 되돌리면 반사형 XSS입니다.', 'htmlspecialchars($v, ENT_QUOTES)로 감싸세요.'],
  'echo "Hello " . $_POST["name"];', 'echo "Hello " . htmlspecialchars($_POST["name"], ENT_QUOTES);',
  { skip: (raw) => /htmlspecialchars|htmlentities|intval\s*\(|\(int\)|filter_var|strip_tags|e\s*\(/.test(raw) || /\becho\s+\$_(?:GET|POST|REQUEST|COOKIE)\b/.test(raw) });
R('preg-replace-eval', 'V', 'CR', 30, ['cwe-95', 'owasp-a03'],
  /\bpreg_replace\s*\(\s*(['"])([\/#~!|@%]).*?\2[imsxuADSUXJ]*e[imsxuADSUXJ]*\1/,
  ['preg_replace with the /e modifier', 'The /e modifier evaluates the replacement as PHP code.', 'Use preg_replace_callback.'],
  ['/e 수정자가 있는 preg_replace입니다', '/e 수정자는 치환 문자열을 PHP 코드로 평가합니다.', 'preg_replace_callback을 쓰세요.'],
  "preg_replace('/(\\w+)/e', 'strtoupper(\"$1\")', $s);", "preg_replace_callback('/(\\w+)/', fn($m) => strtoupper($m[1]), $s);");
R('shell-backticks', 'V', 'CR', 30, ['cwe-78', 'owasp-a03'],
  /`[^`]*\$\w+[^`]*`/,
  ['Shell command in backticks with a variable', 'Backticks run the string in a shell, so the variable can inject commands.', 'Use escapeshellarg, or avoid the shell.'],
  ['변수가 든 백틱 셸 명령입니다', '백틱은 문자열을 셸에서 실행하므로 변수가 명령을 주입할 수 있습니다.', 'escapeshellarg를 쓰거나 셸을 피하세요.'],
  '$out = `ls $dir`;', '$out = shell_exec("ls " . escapeshellarg($dir));',
  { skip: (raw) => /escapeshellarg/.test(raw) });
R('session-fixation', 'V', 'MA', 10, ['cwe-384', 'owasp-a07'],
  new RegExp(String.raw`\bsession_id\s*\(\s*${INPUT}`),
  ['Session id taken from the request', 'An attacker can fix the victim\'s session id before login.', 'Call session_regenerate_id(true) after login and never accept ids from input.'],
  ['요청에서 세션 id를 가져옵니다', '공격자가 로그인 전에 피해자의 세션 id를 고정할 수 있습니다.', '로그인 뒤 session_regenerate_id(true)를 부르고 입력의 id를 받지 마세요.'],
  "session_id($_GET['sid']);", 'session_regenerate_id(true);');
R('cookie-insecure', 'H', 'MA', 5, ['cwe-614', 'owasp-a05', 'cookie'],
  /\bsetcookie\s*\(\s*[^,()]+,\s*[^,()]+(?:,\s*[^,()]+)?\s*\)|\bini_set\s*\(\s*['"]session\.cookie_(?:secure|httponly)['"]\s*,\s*['"]?(?:0|off|false)\b/i,
  ['Cookie without Secure / HttpOnly', 'Short setcookie calls leave out the secure and httponly flags.', 'Pass the options array with secure, httponly and samesite.'],
  ['Secure / HttpOnly 없는 쿠키입니다', '짧은 setcookie 호출은 secure와 httponly 플래그를 빠뜨립니다.', 'secure, httponly, samesite가 든 옵션 배열을 넘기세요.'],
  "setcookie('sid', $id);", "setcookie('sid', $id, ['secure' => true, 'httponly' => true, 'samesite' => 'Lax']);");
R('cors-any-origin', 'H', 'MA', 10, ['cwe-942', 'owasp-a05'],
  /\bheader\s*\(\s*['"]Access-Control-Allow-Origin:\s*\*/i,
  ['CORS allows any origin', 'Any site can read responses meant for your front end.', 'Echo back only allowed origins.'],
  ['CORS가 모든 origin을 허용합니다', '아무 사이트나 프런트엔드용 응답을 읽을 수 있습니다.', '허용한 origin만 돌려주세요.'],
  "header('Access-Control-Allow-Origin: *');", "header('Access-Control-Allow-Origin: https://app.example.com');");
R('xxe', 'V', 'CR', 20, ['cwe-611', 'owasp-a05', 'xml'],
  /\blibxml_disable_entity_loader\s*\(\s*false\s*\)|\bLIBXML_NOENT\b|\bLIBXML_DTDLOAD\b|\bLIBXML_DTDATTR\b/,
  ['XML parser loads external entities', 'Entity substitution lets a document read local files (XXE).', 'Do not pass LIBXML_NOENT / LIBXML_DTDLOAD for untrusted XML.'],
  ['XML 파서가 외부 엔티티를 불러옵니다', '엔티티 치환은 문서가 로컬 파일을 읽게 합니다(XXE).', '신뢰할 수 없는 XML에는 LIBXML_NOENT / LIBXML_DTDLOAD를 넘기지 마세요.'],
  '$doc->loadXML($xml, LIBXML_NOENT);', '$doc->loadXML($xml, LIBXML_NONET);');
R('allow-url-include', 'V', 'CR', 20, ['cwe-98', 'owasp-a03'],
  /\bini_set\s*\(\s*['"]allow_url_(?:include|fopen)['"]\s*,\s*['"]?(?:1|on|true)\b/i,
  ['allow_url_include / allow_url_fopen turned on', 'Remote URLs in include or fopen let an attacker load remote code.', 'Keep both off.'],
  ['allow_url_include / allow_url_fopen을 켭니다', 'include나 fopen의 원격 URL은 공격자가 원격 코드를 불러오게 합니다.', '둘 다 꺼 두세요.'],
  "ini_set('allow_url_include', '1');", "ini_set('allow_url_include', '0');");
R('temp-file-name', 'H', 'MI', 5, ['cwe-377', 'owasp-a01'],
  /\btempnam\s*\(/,
  ['tempnam() temporary file', 'tempnam returns a name in a shared folder with default permissions.', 'Use tmpfile() or create the file with restricted permissions.'],
  ['tempnam() 임시 파일입니다', 'tempnam은 공유 폴더의 이름을 기본 권한으로 돌려줍니다.', 'tmpfile()을 쓰거나 제한된 권한으로 파일을 만드세요.'],
  '$tmp = tempnam(sys_get_temp_dir(), "up");', '$fh = tmpfile();');
R('world-permissions', 'V', 'MA', 10, ['cwe-732', 'owasp-a01'],
  /\b(?:chmod|mkdir)\s*\([^,]+,\s*0?777\b|\bumask\s*\(\s*0+\s*\)/,
  ['World-writable permissions', 'Mode 0777 lets every local user change the file or folder.', 'Use 0755 / 0644 or tighter.'],
  ['모두가 쓸 수 있는 권한입니다', '0777 권한은 모든 로컬 사용자가 파일이나 폴더를 바꾸게 합니다.', '0755 / 0644 이하로 쓰세요.'],
  'mkdir($dir, 0777, true);', 'mkdir($dir, 0755, true);');
R('jwt-none', 'V', 'BL', 30, ['cwe-347', 'owasp-a02', 'jwt'],
  /\bJWT::decode\s*\([^)]*['"]none['"]|['"]alg['"]\s*=>\s*['"]none['"]/i,
  ['JWT "none" algorithm', 'An unsigned token can be forged by anyone.', 'Decode with a Key object and the expected algorithm.'],
  ['JWT "none" 알고리즘입니다', '서명 없는 토큰은 누구나 위조할 수 있습니다.', 'Key 객체와 기대하는 알고리즘으로 디코딩하세요.'],
  "$claims = JWT::decode($jwt, $key, ['none']);", "$claims = JWT::decode($jwt, new Key($key, 'HS256'));");
R('unserialize-input', 'V', 'BL', 30, ['cwe-502', 'owasp-a08'],
  new RegExp(String.raw`\b(?:unserialize|yaml_parse)\s*\([^;]*(?:${INPUT}|base64_decode\s*\(\s*${INPUT})`),
  ['Request input unserialized', 'Unserializing input can call magic methods of any class (object injection).', 'Use json_decode for data from clients.'],
  ['요청 입력을 unserialize합니다', '입력을 unserialize하면 아무 클래스의 매직 메서드가 호출될 수 있습니다(객체 주입).', '클라이언트 데이터에는 json_decode를 쓰세요.'],
  "$cart = unserialize($_COOKIE['cart']);", "$cart = json_decode($cartJson, true);");
R('ldap-injection', 'V', 'CR', 20, ['cwe-90', 'owasp-a03'],
  /\bldap_(?:search|list|read)\s*\([^;]*(?:"[^"]*\$\w|['"]\s*\.\s*\$)/,
  ['LDAP filter built from variables', 'Input with * or ) changes the filter.', 'Escape with ldap_escape($v, "", LDAP_ESCAPE_FILTER).'],
  ['변수로 LDAP 필터를 만듭니다', '* 나 )가 든 입력은 필터를 바꿉니다.', 'ldap_escape($v, "", LDAP_ESCAPE_FILTER)로 이스케이프하세요.'],
  'ldap_search($ds, $base, "(uid=$user)");', 'ldap_search($ds, $base, "(uid=" . ldap_escape($user, "", LDAP_ESCAPE_FILTER) . ")");',
  { skip: (raw) => /ldap_escape/.test(raw) });
R('header-injection', 'V', 'MA', 10, ['cwe-113', 'owasp-a03'],
  new RegExp(String.raw`\bheader\s*\(\s*(?:"[^"]*\{?\$_(?:GET|POST|REQUEST|COOKIE)|['"][^'"]*['"]\s*\.\s*${INPUT})`),
  ['HTTP header built from request input', 'New lines in the value can add headers or split the response.', 'Validate the value against an allow list.'],
  ['요청 입력으로 HTTP 헤더를 만듭니다', '값의 줄바꿈이 헤더를 더하거나 응답을 쪼갤 수 있습니다.', '허용 목록으로 값을 검증하세요.'],
  "header('X-Lang: ' . $_GET['lang']);", "header('X-Lang: ' . $lang);",
  { skip: (raw) => /Location:/i.test(raw) });
R('extract-superglobal', 'V', 'CR', 20, ['cwe-621', 'owasp-a03'],
  /\bimport_request_variables\s*\(|\bmb_parse_str\s*\(\s*[^,()]+\)/,
  ['Request variables imported into scope', 'Importing input as variables lets a request overwrite any local variable.', 'Read values from $_GET / $_POST explicitly.'],
  ['요청 변수를 스코프로 가져옵니다', '입력을 변수로 가져오면 요청이 어떤 지역 변수든 덮어쓸 수 있습니다.', '$_GET / $_POST에서 값을 명시적으로 읽으세요.'],
  'mb_parse_str($query);', 'mb_parse_str($query, $params);');

module.exports = { RULES: R.rules };
