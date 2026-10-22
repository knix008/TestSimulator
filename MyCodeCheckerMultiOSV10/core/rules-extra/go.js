'use strict';

// Go.

const { maker } = require('./util');

const R = maker('go', ['go']);

// ── Bugs ─────────────────────────────────────────────────────
R('self-assignment', 'B', 'MA', 5, ['pitfall'],
  /^\s*([A-Za-z_][\w.]*)\s*=\s*\1\s*$/,
  ['Variable is assigned to itself', 'A self-assignment does nothing and usually hides a typo.', 'Assign the intended value or delete the line.'],
  ['변수를 자기 자신에게 대입합니다', '자기 대입은 아무 일도 하지 않고 보통 오타를 숨깁니다.', '의도한 값을 대입하거나 줄을 지우세요.'],
  'c.name = c.name', 'c.name = name');
R('identical-operands', 'B', 'MA', 5, ['pitfall'],
  /(?<![\w.])(?<![=!<>+\-*\/%&|]\s*)([A-Za-z_][\w.]*)\s*(?:==|!=|<=|>=|&&|\|\|)\s*\1(?![\w.(\[])(?=\s*(?:[);,{]|&&|\|\||$))/,
  ['Identical expressions on both sides of an operator', 'Comparing or combining an expression with itself always gives the same result.', 'Fix the operand that was meant to differ; use math.IsNaN for NaN checks.'],
  ['연산자 양쪽 식이 같습니다', '같은 식끼리 비교하거나 묶으면 결과가 항상 같습니다.', '달라야 할 피연산자를 고치세요. NaN 검사는 math.IsNaN을 쓰세요.'],
  'if a.Len == a.Len {', ['if a.Len == b.Len {', 'if n >= max || max == 0 {'], { ns: true });
R('nan-comparison', 'B', 'CR', 5, ['pitfall'],
  /[=!]=\s*math\.NaN\s*\(\s*\)|\bmath\.NaN\s*\(\s*\)\s*[=!]=/,
  ['Comparison with math.NaN()', 'NaN is not equal to anything, itself included.', 'Use math.IsNaN(x).'],
  ['math.NaN()과 비교합니다', 'NaN은 자기 자신을 포함해 어떤 값과도 같지 않습니다.', 'math.IsNaN(x)를 쓰세요.'],
  'if x == math.NaN() {', 'if math.IsNaN(x) {');
R('float-equality', 'B', 'MI', 5, ['pitfall'],
  /[=!]=\s*-?\d+\.\d+(?![\d.])/,
  ['Equality test on a floating-point literal', 'Floating-point results are rarely exactly equal to a literal.', 'Compare with a tolerance: math.Abs(a-b) < eps.'],
  ['부동소수점 리터럴과 동등 비교합니다', '부동소수점 결과는 리터럴과 정확히 같은 경우가 드뭅니다.', '오차 범위로 비교하세요: math.Abs(a-b) < eps.'],
  'if ratio == 0.3 {', 'if math.Abs(ratio-0.3) < 1e-9 {', { ns: true });
R('append-to-other', 'B', 'MA', 5, ['pitfall'],
  /^\s*(\w+)\s*=\s*append\s*\(\s*(?!\1\b)[\w.]+\s*,/,
  ['append result stored in a different slice', 'x = append(y, v) may share y\'s backing array, so later writes to one change the other.', 'Append to the same slice (y = append(y, v)) or copy first.'],
  ['append 결과를 다른 슬라이스에 담습니다', 'x = append(y, v)는 y의 배열을 공유할 수 있어 한쪽을 쓰면 다른 쪽이 바뀝니다.', '같은 슬라이스에 붙이거나(y = append(y, v)) 먼저 복사하세요.'],
  'out = append(base, item)', 'out = append(out, item)');
R('defer-in-loop', 'B', 'MA', 10, ['resource'],
  /^\s*for\b[^{]*\{\s*defer\b/,
  ['defer inside a loop', 'Deferred calls run only when the function returns, so resources pile up across iterations.', 'Move the loop body into a function, or close explicitly.'],
  ['반복문 안의 defer입니다', 'defer 호출은 함수가 끝날 때만 실행되어 반복마다 리소스가 쌓입니다.', '반복 본문을 함수로 빼거나 명시적으로 닫으세요.'],
  'for _, p := range paths { defer os.Remove(p) }', 'defer cleanup(paths)');
R('error-string-capitalized', 'S', 'MI', 2, ['convention'],
  /\b(?:errors\.New|fmt\.Errorf)\s*\(\s*"[A-Z][a-z]/,
  ['Error string starts with a capital letter', 'Error strings are wrapped into longer messages, so they start lower-case.', 'Start the message lower-case.'],
  ['오류 문자열이 대문자로 시작합니다', '오류 문자열은 더 긴 메시지에 감싸이므로 소문자로 시작합니다.', '메시지를 소문자로 시작하세요.'],
  'return errors.New("Not found")', ['return errors.New("not found")', 'return errors.New("HTTP failed")']);
R('error-string-punctuation', 'S', 'MI', 2, ['convention'],
  /\b(?:errors\.New|fmt\.Errorf)\s*\(\s*"[^"]*[.!:\n]"\s*[,)]/,
  ['Error string ends with punctuation', 'Wrapped errors read badly with a period in the middle.', 'Drop the trailing punctuation.'],
  ['오류 문자열이 문장 부호로 끝납니다', '감싼 오류 중간에 마침표가 있으면 읽기 어렵습니다.', '끝의 문장 부호를 지우세요.'],
  'return errors.New("disk full.")', 'return errors.New("disk full")');
R('errorf-without-verbs', 'S', 'MI', 2, ['clumsy'],
  /\bfmt\.Errorf\s*\(\s*"[^"%]*"\s*\)/,
  ['fmt.Errorf without format verbs', 'Errorf with a constant string is errors.New with extra work.', 'Use errors.New.'],
  ['포맷 동사 없는 fmt.Errorf입니다', '상수 문자열의 Errorf는 일을 더 하는 errors.New입니다.', 'errors.New를 쓰세요.'],
  'return fmt.Errorf("timeout")', 'return fmt.Errorf("timeout after %s", d)');
R('errorf-v-instead-of-w', 'S', 'MI', 5, ['error-handling'],
  /\bfmt\.Errorf\s*\(\s*"[^"]*%v[^"]*"\s*,[^)]*\berr\s*\)/,
  ['Error wrapped with %v', '%v flattens the error, so errors.Is / errors.As can no longer see the cause.', 'Use %w.'],
  ['%v로 오류를 감쌉니다', '%v는 오류를 평평하게 만들어 errors.Is / errors.As가 원인을 볼 수 없습니다.', '%w를 쓰세요.'],
  'return fmt.Errorf("open config: %v", err)', 'return fmt.Errorf("open config: %w", err)');
R('builtin-print', 'S', 'MI', 2, ['debug'],
  /(?<![\w.])(?:println|print)\s*\(/,
  ['Built-in print / println', 'The built-ins write to stderr, are unbuffered and may be removed.', 'Use fmt or log.'],
  ['내장 print / println을 씁니다', '내장 함수는 stderr로 쓰고 버퍼가 없으며 제거될 수 있습니다.', 'fmt나 log를 쓰세요.'],
  'println("value", v)', 'log.Printf("value %v", v)');
R('panic-call', 'S', 'IN', 5, ['error-handling'],
  /(?<![\w.])panic\s*\(/,
  ['panic in code', 'A panic crashes the program unless recovered; libraries should return errors.', 'Return an error.'],
  ['코드에서 panic을 부릅니다', 'panic은 recover하지 않으면 프로그램을 죽입니다. 라이브러리는 오류를 돌려줘야 합니다.', '오류를 돌려주세요.'],
  'panic("unreachable")', 'return fmt.Errorf("unexpected state %d", s)');
R('context-todo', 'S', 'IN', 2, ['unfinished'],
  /\bcontext\.TODO\s*\(\s*\)/,
  ['context.TODO()', 'TODO marks a context that should be passed in from the caller.', 'Accept a ctx parameter and pass it down.'],
  ['context.TODO()를 씁니다', 'TODO는 호출자에게서 받아야 할 컨텍스트를 표시합니다.', 'ctx 매개변수를 받아 아래로 넘기세요.'],
  'rows, err := db.QueryContext(context.TODO(), q)', 'rows, err := db.QueryContext(ctx, q)');
R('bool-comparison', 'S', 'MI', 2, ['clumsy'],
  /[=!]=\s*(?:true|false)\b|\b(?:true|false)\s*[=!]=/,
  ['Comparison with true / false', 'x == true is just x.', 'Use the expression or its negation.'],
  ['true / false와 비교합니다', 'x == true는 그냥 x입니다.', '식이나 그 부정을 쓰세요.'],
  'if ok == true {', 'if ok {', { ns: true });
R('empty-block', 'S', 'MA', 5, ['suspicious'],
  /\bif\b[^{]*\{\s*\}\s*(?:else\b|$)|\belse\s*\{\s*\}/,
  ['Empty if / else block', 'An empty block does nothing and often marks forgotten error handling.', 'Handle the case or remove the block.'],
  ['빈 if / else 블록입니다', '빈 블록은 아무 일도 하지 않고 잊힌 오류 처리인 경우가 많습니다.', '경우를 처리하거나 블록을 지우세요.'],
  'if err != nil {}', ['if err != nil { return err }', 'if th.Font(fyne.TextStyle{}) == nil {']);
R('goto', 'S', 'MA', 10, ['confusing'],
  /\bgoto\s+\w+/,
  ['goto statement', 'goto makes the control flow hard to follow.', 'Use loops, labeled break or functions.'],
  ['goto 문입니다', 'goto는 흐름을 따라가기 어렵게 합니다.', '반복문, 레이블 break, 함수를 쓰세요.'],
  'goto retry', 'continue retry');
R('empty-interface', 'S', 'IN', 1, ['convention'],
  /\binterface\s*\{\s*\}/,
  ['interface{} instead of any', 'Since Go 1.18 any is the shorter alias.', 'Write any.'],
  ['any 대신 interface{}를 씁니다', 'Go 1.18부터 더 짧은 별칭 any가 있습니다.', 'any로 쓰세요.'],
  'func Dump(v interface{}) {', 'func Dump(v any) {');
R('receiver-this-self', 'S', 'MI', 2, ['convention'],
  /^\s*func\s*\(\s*(?:this|self)\s+\*?\w+/,
  ['Receiver named this or self', 'Go receivers use a short name derived from the type.', 'Name the receiver like c *Client.'],
  ['리시버 이름이 this 또는 self입니다', 'Go 리시버는 타입에서 딴 짧은 이름을 씁니다.', 'c *Client처럼 이름 지으세요.'],
  'func (this *Client) Close() error {', 'func (c *Client) Close() error {');
R('underscore-name', 'S', 'MI', 2, ['convention'],
  /\b(?:var\s+|func\s+(?:\([^)]*\)\s*)?)[a-z]+_[a-zA-Z]\w*/,
  ['Name with an underscore', 'Go uses MixedCaps, not snake_case.', 'Rename, for example maxRetries.'],
  ['밑줄이 있는 이름입니다', 'Go는 snake_case가 아니라 MixedCaps를 씁니다.', 'maxRetries처럼 이름을 바꾸세요.'],
  'var max_retries = 3', ['var maxRetries = 3', 'func Test_parse(t *testing.T) {']);
R('deprecated-ioutil', 'S', 'MI', 2, ['deprecated'],
  /\bioutil\.\w+\s*\(|"io\/ioutil"/,
  ['io/ioutil is deprecated', 'Its functions moved to io and os in Go 1.16.', 'Use os.ReadFile, os.WriteFile, io.ReadAll and friends.'],
  ['io/ioutil은 사용 중단됐습니다', 'Go 1.16에서 함수가 io와 os로 옮겨졌습니다.', 'os.ReadFile, os.WriteFile, io.ReadAll 등을 쓰세요.'],
  'data, err := ioutil.ReadFile(path)', 'data, err := os.ReadFile(path)');
R('http-no-timeout', 'H', 'MI', 5, ['cwe-400', 'reliability'],
  /\bhttp\.(?:Get|Post|Head|PostForm)\s*\(|&?\bhttp\.Client\s*\{\s*\}/,
  ['HTTP client without a timeout', 'The default client waits forever on a stalled server.', 'Use an http.Client with Timeout set, or a context deadline.'],
  ['시간 제한 없는 HTTP 클라이언트입니다', '기본 클라이언트는 멈춘 서버를 끝없이 기다립니다.', 'Timeout을 설정한 http.Client나 컨텍스트 마감을 쓰세요.'],
  'resp, err := http.Get(url)', 'resp, err := client.Get(url)');
R('server-no-timeout', 'H', 'MI', 5, ['cwe-400', 'reliability'],
  /\bhttp\.ListenAndServe(?:TLS)?\s*\(|&?\bhttp\.Server\s*\{\s*Addr\s*:\s*[^,}]+\s*,?\s*(?:Handler\s*:\s*[^,}]+\s*,?\s*)?\}/,
  ['HTTP server without timeouts', 'Without ReadHeaderTimeout a slow client can hold connections open (Slowloris).', 'Use an http.Server with ReadHeaderTimeout, ReadTimeout and WriteTimeout.'],
  ['시간 제한 없는 HTTP 서버입니다', 'ReadHeaderTimeout이 없으면 느린 클라이언트가 연결을 붙잡을 수 있습니다(Slowloris).', 'ReadHeaderTimeout, ReadTimeout, WriteTimeout을 설정한 http.Server를 쓰세요.'],
  'log.Fatal(http.ListenAndServe(addr, mux))', 'log.Fatal(srv.ListenAndServe())');

// ── Vulnerabilities and hotspots ─────────────────────────────
R('exec-shell', 'H', 'CR', 20, ['cwe-78', 'owasp-a03'],
  /\bexec\.Command(?:Context)?\s*\(\s*(?:ctx\s*,\s*)?"(?:sh|bash|zsh|cmd|cmd\.exe|powershell|pwsh)"\s*,\s*"(?:-c|\/c|\/C|-Command)"/,
  ['Command run through a shell', 'A shell interprets metacharacters in the command string.', 'Run the program directly with separate arguments.'],
  ['셸을 거쳐 명령을 실행합니다', '셸은 명령 문자열의 메타 문자를 해석합니다.', '인자를 나눠 프로그램을 직접 실행하세요.'],
  'cmd := exec.Command("sh", "-c", "tar xf "+name)', 'cmd := exec.Command("tar", "xf", name)');
R('exec-concat', 'V', 'CR', 20, ['cwe-78', 'owasp-a03'],
  /\bexec\.Command(?:Context)?\s*\([^)]*(?:"\s*\+|\+\s*"|fmt\.Sprintf\s*\()/,
  ['Command argument built by concatenation', 'Concatenated data can add options or, with a shell, commands.', 'Pass each value as its own argument.'],
  ['문자열 연결로 명령 인자를 만듭니다', '이어 붙인 데이터는 옵션이나 셸에서는 명령을 더할 수 있습니다.', '값마다 별도 인자로 넘기세요.'],
  'exec.Command("git", "log "+ref)', 'exec.Command("git", "log", ref)');
R('template-unescaped', 'H', 'MA', 10, ['cwe-79', 'owasp-a03', 'xss'],
  /\btemplate\.(?:HTML|JS|JSStr|URL|HTMLAttr|CSS|Srcset)\s*\(/,
  ['Value marked as safe template content', 'Converting data to template.HTML disables escaping and allows XSS.', 'Pass plain strings and let html/template escape them.'],
  ['값을 안전한 템플릿 콘텐츠로 표시합니다', '데이터를 template.HTML로 바꾸면 이스케이프가 꺼져 XSS를 허용합니다.', '일반 문자열을 넘겨 html/template이 이스케이프하게 하세요.'],
  'data := template.HTML(comment)', 'data := comment');
R('text-template-html', 'H', 'MA', 10, ['cwe-79', 'owasp-a03', 'xss'],
  /^\s*(?:import\s+)?(?:\w+\s+)?"text\/template"/,
  ['text/template imported', 'text/template does not escape HTML; using it for pages allows XSS.', 'Use html/template for HTML output.'],
  ['text/template를 import합니다', 'text/template은 HTML을 이스케이프하지 않아 페이지에 쓰면 XSS를 허용합니다.', 'HTML 출력에는 html/template을 쓰세요.'],
  '    "text/template"', '    "html/template"');
R('weak-cipher', 'V', 'CR', 30, ['cwe-327', 'owasp-a02', 'crypto'],
  /\bdes\.New(?:TripleDES)?Cipher\s*\(|\brc4\.NewCipher\s*\(|\bblowfish\.NewCipher\s*\(/,
  ['Weak cipher algorithm', 'DES, 3DES, RC4 and Blowfish are broken or too small.', 'Use AES-GCM or ChaCha20-Poly1305.'],
  ['약한 암호 알고리즘입니다', 'DES, 3DES, RC4, Blowfish는 깨졌거나 너무 작습니다.', 'AES-GCM이나 ChaCha20-Poly1305를 쓰세요.'],
  'block, err := des.NewCipher(key)', 'block, err := aes.NewCipher(key)');
R('weak-hash-other', 'H', 'CR', 15, ['cwe-328', 'owasp-a02', 'crypto'],
  /\bmd4\.New\s*\(|\bripemd160\.New\s*\(|\bmd5\.Sum\s*\(|\bsha1\.Sum\s*\(/,
  ['Weak hash algorithm', 'MD4, MD5, RIPEMD-160 and SHA-1 are not collision resistant.', 'Use crypto/sha256 or stronger.'],
  ['약한 해시 알고리즘입니다', 'MD4, MD5, RIPEMD-160, SHA-1은 충돌에 강하지 않습니다.', 'crypto/sha256 이상을 쓰세요.'],
  'sum := md5.Sum(data)', 'sum := sha256.Sum256(data)');
R('weak-rsa-key', 'V', 'CR', 15, ['cwe-326', 'owasp-a02', 'crypto'],
  /\brsa\.GenerateKey\s*\([^,]+,\s*(?:512|768|1024)\s*\)/,
  ['RSA key shorter than 2048 bits', 'Keys of 1024 bits or less can be factored with enough resources.', 'Use at least 2048 bits.'],
  ['2048비트보다 짧은 RSA 키입니다', '1024비트 이하 키는 충분한 자원으로 인수분해할 수 있습니다.', '최소 2048비트를 쓰세요.'],
  'key, err := rsa.GenerateKey(rand.Reader, 1024)', 'key, err := rsa.GenerateKey(rand.Reader, 3072)');
R('tls-min-version', 'V', 'CR', 15, ['cwe-326', 'owasp-a02', 'tls'],
  /\bMinVersion\s*:\s*tls\.Version(?:SSL30|TLS10|TLS11)\b|\bMaxVersion\s*:\s*tls\.Version(?:SSL30|TLS10|TLS11)\b/,
  ['TLS minimum version below 1.2', 'TLS 1.0 / 1.1 and SSL 3 have known attacks.', 'Set MinVersion: tls.VersionTLS12 or higher.'],
  ['TLS 최소 버전이 1.2보다 낮습니다', 'TLS 1.0 / 1.1과 SSL 3에는 알려진 공격이 있습니다.', 'MinVersion: tls.VersionTLS12 이상으로 두세요.'],
  'cfg := &tls.Config{MinVersion: tls.VersionTLS10}', 'cfg := &tls.Config{MinVersion: tls.VersionTLS12}');
R('ssh-insecure-host-key', 'V', 'CR', 20, ['cwe-295', 'owasp-a07'],
  /\bssh\.InsecureIgnoreHostKey\s*\(\s*\)/,
  ['SSH host key not checked', 'Any server can impersonate the host and capture credentials.', 'Use knownhosts.New or ssh.FixedHostKey.'],
  ['SSH 호스트 키를 확인하지 않습니다', '아무 서버나 호스트를 사칭해 자격 증명을 가로챌 수 있습니다.', 'knownhosts.New나 ssh.FixedHostKey를 쓰세요.'],
  'HostKeyCallback: ssh.InsecureIgnoreHostKey(),', 'HostKeyCallback: hostKeyCallback,');
R('file-permissions', 'V', 'MA', 10, ['cwe-732', 'owasp-a01'],
  /\b(?:os|ioutil)\.(?:WriteFile|OpenFile|Mkdir|MkdirAll|Chmod)\s*\([^)]*\b0o?(?:777|776|766|666)\b/,
  ['World-writable file permissions', 'Mode 0777 / 0666 lets every local user change the file.', 'Use 0600 / 0700 or 0644 / 0755.'],
  ['모두가 쓸 수 있는 파일 권한입니다', '0777 / 0666 권한은 모든 로컬 사용자가 파일을 바꾸게 합니다.', '0600 / 0700이나 0644 / 0755를 쓰세요.'],
  'os.WriteFile(path, data, 0666)', 'os.WriteFile(path, data, 0600)');
R('path-from-request', 'V', 'CR', 20, ['cwe-22', 'owasp-a01'],
  /\b(?:filepath\.Join|path\.Join|os\.(?:Open|ReadFile|Create|Remove|OpenFile)|http\.ServeFile)\s*\([^)]*\br\.(?:URL\.Query\(\)\.Get|FormValue|PostFormValue|URL\.Path)\b/,
  ['File path from the request', 'A path from input can use ../ to reach any file.', 'Clean the path and check it stays inside the base folder, or use http.FS.'],
  ['요청으로 파일 경로를 만듭니다', '입력으로 만든 경로는 ../로 아무 파일에나 닿을 수 있습니다.', '경로를 정리하고 기준 폴더 안인지 확인하거나 http.FS를 쓰세요.'],
  'f, err := os.Open(filepath.Join(root, r.URL.Query().Get("f")))', 'f, err := root.Open(name)');
R('open-redirect', 'V', 'CR', 20, ['cwe-601', 'owasp-a01'],
  /\bhttp\.Redirect\s*\([^,]+,[^,]+,\s*r\.(?:URL\.Query\(\)\.Get|FormValue)\b/,
  ['Redirect to a request value', 'Redirecting to a user-supplied URL sends victims to phishing sites.', 'Redirect only to known local paths.'],
  ['요청 값으로 리다이렉트합니다', '사용자가 준 URL로 보내면 피싱 사이트로 유도됩니다.', '알려진 로컬 경로로만 보내세요.'],
  'http.Redirect(w, r, r.FormValue("next"), http.StatusFound)', 'http.Redirect(w, r, "/home", http.StatusFound)');
R('reflected-xss', 'V', 'CR', 20, ['cwe-79', 'owasp-a03', 'xss'],
  /\b(?:fmt\.Fprint(?:f|ln)?|io\.WriteString)\s*\(\s*w\s*,[^)]*\br\.(?:URL\.Query\(\)\.Get|FormValue)\b|\bw\.Write\s*\(\s*\[\]byte\s*\(\s*r\.(?:URL\.Query\(\)\.Get|FormValue)\b/,
  ['Request value written to the response', 'Echoing input unescaped is reflected XSS.', 'Render through html/template or escape with html.EscapeString.'],
  ['요청 값을 응답에 씁니다', '이스케이프 없이 입력을 되돌리면 반사형 XSS입니다.', 'html/template로 그리거나 html.EscapeString으로 이스케이프하세요.'],
  'fmt.Fprintf(w, "Hello %s", r.FormValue("name"))', 'fmt.Fprintf(w, "Hello %s", html.EscapeString(name))');
R('cors-any-origin', 'H', 'MA', 10, ['cwe-942', 'owasp-a05'],
  /"Access-Control-Allow-Origin"\s*,\s*"\*"|\bAllowAllOrigins\s*:\s*true\b|\bAllowedOrigins\s*:\s*\[\]string\s*\{\s*"\*"/,
  ['CORS allows any origin', 'Any site can read responses meant for your front end.', 'List the allowed origins.'],
  ['CORS가 모든 origin을 허용합니다', '아무 사이트나 프런트엔드용 응답을 읽을 수 있습니다.', '허용할 origin을 나열하세요.'],
  'w.Header().Set("Access-Control-Allow-Origin", "*")', 'w.Header().Set("Access-Control-Allow-Origin", origin)');
R('cookie-not-secure', 'H', 'MA', 5, ['cwe-614', 'owasp-a05', 'cookie'],
  /\bSecure\s*:\s*false\b/,
  ['Cookie without the Secure flag', 'The cookie is also sent over plain HTTP.', 'Set Secure: true.'],
  ['Secure 속성이 없는 쿠키입니다', '쿠키가 평문 HTTP로도 전송됩니다.', 'Secure: true를 설정하세요.'],
  'http.SetCookie(w, &http.Cookie{Name: "sid", Value: id, Secure: false})', 'http.SetCookie(w, &http.Cookie{Name: "sid", Value: id, Secure: true})');
R('cookie-not-httponly', 'H', 'MA', 5, ['cwe-1004', 'owasp-a05', 'cookie'],
  /\bHttpOnly\s*:\s*false\b/,
  ['Cookie readable from script', 'Without HttpOnly an injected script can steal the cookie.', 'Set HttpOnly: true.'],
  ['스크립트가 읽을 수 있는 쿠키입니다', 'HttpOnly가 없으면 주입된 스크립트가 쿠키를 훔칠 수 있습니다.', 'HttpOnly: true를 설정하세요.'],
  'c := &http.Cookie{Name: "sid", HttpOnly: false}', 'c := &http.Cookie{Name: "sid", HttpOnly: true}');
R('jwt-unverified', 'V', 'CR', 20, ['cwe-347', 'owasp-a02', 'jwt'],
  /\bjwt\.SigningMethodNone\b|\bjwt\.UnsafeAllowNoneSignatureType\b|\.ParseUnverified\s*\(/,
  ['JWT accepted without a signature check', 'Unsigned or unverified tokens can be forged.', 'Parse with a key func and check token.Method.'],
  ['서명 확인 없이 JWT를 받아들입니다', '서명 없거나 검증하지 않은 토큰은 위조될 수 있습니다.', '키 함수로 파싱하고 token.Method를 확인하세요.'],
  'tok, _, err := parser.ParseUnverified(raw, claims)', 'tok, err := jwt.ParseWithClaims(raw, claims, keyFunc)');
R('bind-all-interfaces', 'H', 'MI', 5, ['cwe-668'],
  /\b(?:Listen|ListenAndServe(?:TLS)?|ListenPacket)\s*\(\s*(?:"(?:tcp|tcp4|tcp6|udp)"\s*,\s*)?"0\.0\.0\.0:/,
  ['Server bound to all interfaces', '0.0.0.0 exposes the port on every network the machine is on.', 'Bind to 127.0.0.1 unless the service must be public.'],
  ['서버가 모든 인터페이스에 바인딩합니다', '0.0.0.0은 기계가 속한 모든 네트워크에 포트를 엽니다.', '공개해야 하는 서비스가 아니면 127.0.0.1에 바인딩하세요.'],
  'ln, err := net.Listen("tcp", "0.0.0.0:8080")', 'ln, err := net.Listen("tcp", "127.0.0.1:8080")');
R('pprof-exposed', 'H', 'MA', 10, ['cwe-489', 'owasp-a05'],
  /^\s*_\s+"net\/http\/pprof"/,
  ['net/http/pprof imported', 'The import registers /debug/pprof on the default mux, exposing profiles and memory.', 'Serve pprof on a separate, private listener.'],
  ['net/http/pprof를 import합니다', '이 import는 기본 mux에 /debug/pprof를 등록해 프로파일과 메모리를 노출합니다.', 'pprof는 별도의 비공개 리스너에서 제공하세요.'],
  '    _ "net/http/pprof"', '    "net/http"');
R('unsafe-package', 'H', 'MI', 10, ['cwe-242'],
  /\bunsafe\.(?:Pointer|Slice|String|StringData|SliceData|Add)\b/,
  ['unsafe package used', 'unsafe bypasses Go\'s type and memory safety.', 'Keep unsafe in a small, reviewed helper.'],
  ['unsafe 패키지를 씁니다', 'unsafe는 Go의 타입과 메모리 안전을 우회합니다.', 'unsafe는 검토된 작은 도우미 안에만 두세요.'],
  'p := (*int)(unsafe.Pointer(&b[0]))', 'n := binary.LittleEndian.Uint32(b)');
R('gin-debug-mode', 'H', 'MI', 5, ['cwe-489', 'owasp-a05'],
  /\bgin\.SetMode\s*\(\s*gin\.DebugMode\s*\)/,
  ['Gin debug mode', 'Debug mode logs routes and details that do not belong in production.', 'Use gin.ReleaseMode in production.'],
  ['Gin 디버그 모드입니다', '디버그 모드는 운영에 맞지 않는 경로와 세부 정보를 기록합니다.', '운영에서는 gin.ReleaseMode를 쓰세요.'],
  'gin.SetMode(gin.DebugMode)', 'gin.SetMode(gin.ReleaseMode)');
R('decompression-bomb', 'H', 'MA', 10, ['cwe-409'],
  /\bio\.(?:Copy|ReadAll)\s*\(\s*(?:[\w.]+\s*,\s*)?(?:gzip|zlib|flate|bzip2|zstd|zr|gz|gzr)\w*\s*\)/,
  ['Decompressed data read without a limit', 'A small archive can expand to fill memory or disk.', 'Wrap the reader in io.LimitReader.'],
  ['압축 해제 데이터를 제한 없이 읽습니다', '작은 압축 파일이 메모리나 디스크를 채울 만큼 늘어날 수 있습니다.', '리더를 io.LimitReader로 감싸세요.'],
  'io.Copy(out, gzr)', 'io.Copy(out, io.LimitReader(gzr, maxSize))');
R('integer-parse-truncation', 'B', 'MA', 10, ['cwe-190'],
  /\bint(?:8|16|32)?\s*\(\s*\w+\s*\)/,
  ['Narrowing conversion of a parsed integer', 'strconv.Atoi / ParseInt results converted to a smaller type can wrap around.', 'Parse with the target bit size, for example strconv.ParseInt(s, 10, 32).'],
  ['파싱한 정수를 좁은 타입으로 변환합니다', 'strconv.Atoi / ParseInt 결과를 작은 타입으로 바꾸면 값이 돌아갈 수 있습니다.', '목표 비트 크기로 파싱하세요. 예: strconv.ParseInt(s, 10, 32).'],
  'n, _ := strconv.Atoi(s); small := int16(n)', 'v, err := strconv.ParseInt(s, 10, 16)',
  { skip: (raw) => !/\bstrconv\.(?:Atoi|ParseInt|ParseUint)\b/.test(raw) || !/\bint(?:8|16|32)\s*\(/.test(raw) });

module.exports = { RULES: R.rules };
