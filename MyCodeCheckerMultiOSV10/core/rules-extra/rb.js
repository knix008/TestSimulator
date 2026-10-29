'use strict';

// Ruby. Ruby uses '#' for comments and for "#{}" interpolation; the shared
// line classifier cuts lines at '#', so rules that need interpolation look at
// the raw line (raw: true) and skip comment-only lines.

const { maker } = require('./util');

const R = maker('rb', ['rb']);

R('self-assignment', 'B', 'MA', 5, ['pitfall'],
  /^\s*(@{0,2}[A-Za-z_]\w*)\s*=(?![=~>])\s*\1\s*$/,
  ['Variable is assigned to itself', 'A self-assignment does nothing and usually hides a typo.', 'Assign the intended value or delete the line.'],
  ['변수를 자기 자신에게 대입합니다', '자기 대입은 아무 일도 하지 않고 보통 오타를 숨깁니다.', '의도한 값을 대입하거나 줄을 지우세요.'],
  '@name = @name', '@name = name');
R('identical-operands', 'B', 'MA', 5, ['pitfall'],
  /(?<![\w.@])(?<![=!<>+\-*\/%&|]\s*)(@{0,2}[A-Za-z_][\w.]*)\s*(?:==|!=|<=|>=|&&|\|\|)\s*\1(?![\w.(\[?!])(?=\s*(?:[),]|&&|\|\||then\b|$))/,
  ['Identical expressions on both sides of an operator', 'Comparing or combining an expression with itself always gives the same result.', 'Fix the operand that was meant to differ; use nan? for NaN checks.'],
  ['연산자 양쪽 식이 같습니다', '같은 식끼리 비교하거나 묶으면 결과가 항상 같습니다.', '달라야 할 피연산자를 고치세요. NaN 검사는 nan?을 쓰세요.'],
  'if a.size == a.size', ['if a.size == b.size', 'if n >= max || max == 0']);
R('float-equality', 'B', 'MI', 5, ['pitfall'],
  /[=!]=\s*-?\d+\.\d+(?![\d.])/,
  ['Equality test on a floating-point literal', 'Floating-point results are rarely exactly equal to a literal.', 'Compare with a tolerance, or use BigDecimal / Rational.'],
  ['부동소수점 리터럴과 동등 비교합니다', '부동소수점 결과는 리터럴과 정확히 같은 경우가 드뭅니다.', '오차 범위로 비교하거나 BigDecimal / Rational을 쓰세요.'],
  'if ratio == 0.3', 'if (ratio - 0.3).abs < 1e-9', { ns: true });
R('rescue-exception', 'B', 'MA', 10, ['error-handling', 'cwe-396'],
  /\brescue\s+(?:::)?Exception\b/,
  ['rescue Exception', 'Rescuing Exception also catches SignalException, SystemExit and NoMemoryError.', 'Rescue StandardError or a narrower class.'],
  ['Exception을 rescue합니다', 'Exception을 잡으면 SignalException, SystemExit, NoMemoryError까지 잡습니다.', 'StandardError나 더 좁은 클래스를 rescue하세요.'],
  'rescue Exception => e', 'rescue StandardError => e');
R('rescue-modifier-nil', 'S', 'MA', 5, ['error-handling'],
  /\S\s+rescue\s+nil\b/,
  ['rescue nil modifier', 'The modifier swallows every StandardError and returns nil.', 'Rescue the specific error and handle it.'],
  ['rescue nil 수식어입니다', '이 수식어는 모든 StandardError를 삼키고 nil을 돌려줍니다.', '구체적인 오류를 rescue해서 처리하세요.'],
  'value = Integer(text) rescue nil', 'value = Integer(text, exception: false)');
R('removed-exists', 'B', 'CR', 5, ['deprecated'],
  /\b(?:File|Dir|FileTest)\.exists\?/,
  ['File.exists? / Dir.exists?', 'These aliases were removed in Ruby 3.2.', 'Use File.exist? / Dir.exist?.'],
  ['File.exists? / Dir.exists?를 씁니다', '이 별칭은 Ruby 3.2에서 제거됐습니다.', 'File.exist? / Dir.exist?를 쓰세요.'],
  'if File.exists?(path)', 'if File.exist?(path)');
R('debugger', 'S', 'MA', 5, ['debug'],
  /\b(?:binding\.pry|binding\.irb|byebug|debugger)\b/,
  ['Debugger call left in', 'A breakpoint stops the process waiting for console input.', 'Remove it before committing.'],
  ['디버거 호출이 남아 있습니다', '중단점은 콘솔 입력을 기다리며 프로세스를 멈춥니다.', '커밋 전에 지우세요.'],
  'binding.pry', 'Rails.logger.debug(state)');
R('puts-debug', 'S', 'IN', 2, ['debug'],
  /^\s*(?:puts|p|pp|print)\s+(?![=+\-*\/])\S/,
  ['puts / p left in the code', 'Console output is not a log and cannot be filtered.', 'Use a Logger.'],
  ['puts / p가 남아 있습니다', '콘솔 출력은 로그가 아니라 거를 수 없습니다.', 'Logger를 쓰세요.'],
  'p user', 'logger.debug(user.inspect)');
R('global-variable', 'S', 'MA', 5, ['design'],
  /(?<![\w"'$])\$[a-z_]\w*\s*=(?!=)/,
  ['Global variable assigned', 'Globals are shared by the whole process and hard to test.', 'Use a constant, a configuration object or dependency injection.'],
  ['전역 변수에 대입합니다', '전역은 프로세스 전체가 공유해 테스트하기 어렵습니다.', '상수, 설정 객체, 의존성 주입을 쓰세요.'],
  '$counter = 0', 'COUNTER_START = 0');
R('class-variable', 'S', 'MI', 5, ['design'],
  /(?<![\w@])@@\w+/,
  ['Class variable @@', 'Class variables are shared with every subclass and surprise readers.', 'Use a class-level instance variable.'],
  ['클래스 변수 @@를 씁니다', '클래스 변수는 모든 하위 클래스와 공유되어 독자를 놀라게 합니다.', '클래스 수준 인스턴스 변수를 쓰세요.'],
  '@@instances += 1', '@instances += 1');
R('method-naming', 'S', 'MI', 2, ['convention'],
  /^\s*def\s+(?:self\.)?[a-z]+[A-Z]\w*/,
  ['Method name in camelCase', 'Ruby methods are snake_case.', 'Rename the method.'],
  ['메서드 이름이 camelCase입니다', 'Ruby 메서드 이름은 snake_case입니다.', '메서드 이름을 바꾸세요.'],
  'def loadUser(id)', 'def load_user(id)');
R('class-naming', 'S', 'MI', 2, ['convention'],
  /^\s*(?:class|module)\s+[a-z]\w*/,
  ['Class or module name not in CamelCase', 'Ruby constants for classes and modules are CamelCase.', 'Rename it.'],
  ['클래스나 모듈 이름이 CamelCase가 아닙니다', 'Ruby 클래스와 모듈 상수는 CamelCase입니다.', '이름을 바꾸세요.'],
  'class user_store', ['class UserStore', 'class << self']);
R('and-or-in-condition', 'S', 'MI', 2, ['pitfall'],
  /^\s*(?:if|unless|while|until|elsif)\b.*\s(?:and|or)\s/,
  ['and / or in a condition', 'and / or bind weaker than = and ||, which surprises readers.', 'Use && and ||.'],
  ['조건에 and / or를 씁니다', 'and / or는 =와 ||보다 약하게 묶여 독자를 놀라게 합니다.', '&& 와 ||를 쓰세요.'],
  'if user and user.admin?', 'if user && user.admin?');
R('open-pipe', 'V', 'CR', 30, ['cwe-78', 'owasp-a03'],
  /(?<![\w.])(?:Kernel\.)?open\s*\(\s*(?:params\[|["']\|)|\bURI\.open\s*\(\s*params\[/,
  ['Kernel#open with user input', 'open runs a command when the argument starts with |.', 'Use File.open or URI(...).open explicitly.'],
  ['사용자 입력으로 Kernel#open을 씁니다', 'open은 인자가 |로 시작하면 명령을 실행합니다.', 'File.open이나 URI(...).open을 명시적으로 쓰세요.'],
  'data = open(params[:url]).read', 'data = File.read(safe_path)');
R('send-user-input', 'V', 'CR', 20, ['cwe-470', 'owasp-a03'],
  /\.(?:send|public_send|__send__|try)\s*\(\s*params\[/,
  ['Method chosen from request input', 'send with a parameter can call any method, including private ones.', 'Map allowed values to methods explicitly.'],
  ['요청 입력으로 메서드를 고릅니다', '매개변수로 send하면 private을 포함해 아무 메서드나 부를 수 있습니다.', '허용 값을 메서드에 명시적으로 대응시키세요.'],
  'user.send(params[:field])', 'user.public_send(ALLOWED.fetch(field))');
R('constantize-input', 'V', 'CR', 20, ['cwe-470', 'owasp-a03'],
  /\bparams\[[^\]]+\]\s*(?:\.to_s)?\s*\.(?:safe_)?constantize\b|\b(?:Object\.)?const_get\s*\(\s*params\[/,
  ['Class name taken from request input', 'Instantiating a class named by the user can create dangerous objects.', 'Use an explicit allow list.'],
  ['요청 입력으로 클래스 이름을 받습니다', '사용자가 이름 붙인 클래스를 만들면 위험한 객체가 생길 수 있습니다.', '명시적인 허용 목록을 쓰세요.'],
  'klass = params[:type].constantize', 'klass = TYPES.fetch(params[:type])');
R('permit-all', 'V', 'CR', 20, ['cwe-915', 'owasp-a08'],
  /\.permit!/,
  ['All parameters permitted', 'permit! allows mass assignment of every attribute, including admin flags.', 'List the permitted attributes.'],
  ['모든 매개변수를 허용합니다', 'permit!는 관리자 플래그를 포함한 모든 속성의 일괄 대입을 허용합니다.', '허용할 속성을 나열하세요.'],
  'User.create(params.require(:user).permit!)', 'User.create(params.require(:user).permit(:name, :email))');
R('mass-assignment', 'V', 'CR', 20, ['cwe-915', 'owasp-a08'],
  /\.(?:new|create!?|update!?|update_attributes!?|assign_attributes|insert_all|upsert)\s*\(\s*params\s*\)/,
  ['Raw params passed to a model', 'Passing params directly allows mass assignment of any attribute.', 'Use strong parameters.'],
  ['모델에 params를 그대로 넘깁니다', 'params를 그대로 넘기면 아무 속성이나 일괄 대입할 수 있습니다.', 'strong parameters를 쓰세요.'],
  'User.new(params)', 'User.new(user_params)');
R('sql-interpolation', 'V', 'CR', 20, ['cwe-89', 'owasp-a03', 'sql'],
  /\.(?:order|group|having|select|joins|pluck|from|exists\?|calculate|lock|reorder|count|delete_all|update_all|execute|exec_query|select_all|select_value)\s*\(\s*"[^"]*#\{/,
  ['SQL fragment built with interpolation', 'Interpolated values in SQL fragments allow injection.', 'Use placeholders or hash conditions.'],
  ['보간으로 SQL 조각을 만듭니다', 'SQL 조각에 보간한 값은 주입을 허용합니다.', '자리표시자나 해시 조건을 쓰세요.'],
  'User.order("#{params[:sort]} ASC")', 'User.order(sort_column => :asc)', { raw: true });
R('order-from-params', 'V', 'MA', 10, ['cwe-89', 'owasp-a03', 'sql'],
  /\.(?:order|reorder|group|pluck|select)\s*\(\s*params\[/,
  ['Column chosen from request input', 'Raw params in order / group / pluck become SQL.', 'Check the value against an allow list of column names.'],
  ['요청 입력으로 열을 고릅니다', 'order / group / pluck의 params는 그대로 SQL이 됩니다.', '허용 열 이름 목록으로 값을 확인하세요.'],
  'User.order(params[:sort])', 'User.order(SORTS.fetch(params[:sort], :id))');
R('open-redirect', 'V', 'CR', 20, ['cwe-601', 'owasp-a01'],
  /\bredirect_to\s*\(?\s*params\[|\bredirect_to\s*\(?\s*request\.referr?er\b/,
  ['Redirect to request input', 'Redirecting to a user-supplied URL sends victims to phishing sites.', 'Redirect to known paths, or use allow_other_host: false.'],
  ['요청 입력으로 리다이렉트합니다', '사용자가 준 URL로 보내면 피싱 사이트로 유도됩니다.', '알려진 경로로 보내거나 allow_other_host: false를 쓰세요.'],
  'redirect_to params[:return_to]', 'redirect_to root_path');
R('render-inline', 'V', 'CR', 20, ['cwe-94', 'owasp-a03'],
  /\brender\s*\(?\s*inline:|\brender\s*\(?\s*(?:file|template|partial):\s*params\[/,
  ['render inline or a user-chosen template', 'Inline ERB from data runs Ruby code; a template path from params reads other files.', 'Render fixed templates.'],
  ['inline이나 사용자가 고른 템플릿을 render합니다', '데이터로 만든 inline ERB는 Ruby 코드를 실행하고 params의 템플릿 경로는 다른 파일을 읽습니다.', '고정된 템플릿을 render하세요.'],
  'render inline: params[:template]', 'render :show');
R('file-from-params', 'V', 'CR', 20, ['cwe-22', 'owasp-a01'],
  /\b(?:send_file|send_data)\s*\(?\s*params\[|\bFile\.(?:read|open|new|write|delete|binread)\s*\(\s*params\[|\bRails\.root\.join\s*\([^)]*params\[/,
  ['File path from request input', 'A path from input can use ../ to reach any file.', 'Use File.basename and an allowed folder.'],
  ['요청 입력으로 파일 경로를 만듭니다', '입력으로 만든 경로는 ../로 아무 파일에나 닿을 수 있습니다.', 'File.basename과 허용 폴더를 쓰세요.'],
  'send_file params[:path]', 'send_file Rails.root.join("exports", File.basename(name))');
R('csrf-disabled', 'H', 'MA', 10, ['cwe-352', 'owasp-a01'],
  /\bskip_forgery_protection\b|\bprotect_from_forgery\s+with:\s*:null_session\b/,
  ['CSRF protection weakened', 'Without forgery protection another site can submit forms as the user.', 'Use protect_from_forgery with: :exception.'],
  ['CSRF 보호를 약하게 합니다', '위조 방지가 없으면 다른 사이트가 사용자로 폼을 제출할 수 있습니다.', 'protect_from_forgery with: :exception을 쓰세요.'],
  'skip_forgery_protection', 'protect_from_forgery with: :exception');
R('ssl-verify-none', 'V', 'CR', 15, ['cwe-295', 'owasp-a07', 'tls'],
  /\bOpenSSL::SSL::VERIFY_NONE\b|\bssl_verify(?:_mode)?:\s*(?:false|:none)\b|\bverify_ssl:\s*false\b/,
  ['TLS certificate check disabled', 'Without verification any certificate is accepted, allowing man-in-the-middle.', 'Use OpenSSL::SSL::VERIFY_PEER.'],
  ['TLS 인증서 검사를 끕니다', '검증하지 않으면 아무 인증서나 받아들여 중간자 공격을 허용합니다.', 'OpenSSL::SSL::VERIFY_PEER를 쓰세요.'],
  'http.verify_mode = OpenSSL::SSL::VERIFY_NONE', 'http.verify_mode = OpenSSL::SSL::VERIFY_PEER');
R('weak-hash', 'H', 'CR', 15, ['cwe-328', 'owasp-a02', 'crypto'],
  /\b(?:OpenSSL::)?Digest::(?:MD5|SHA1|MD4|RMD160)\b/,
  ['Weak hash algorithm', 'MD5, MD4 and SHA-1 are not collision resistant.', 'Use Digest::SHA256 or stronger; bcrypt for passwords.'],
  ['약한 해시 알고리즘입니다', 'MD5, MD4, SHA-1은 충돌에 강하지 않습니다.', 'Digest::SHA256 이상을 쓰고 비밀번호에는 bcrypt를 쓰세요.'],
  'sig = Digest::MD5.hexdigest(body)', 'sig = Digest::SHA256.hexdigest(body)');
R('weak-cipher', 'V', 'CR', 30, ['cwe-327', 'owasp-a02', 'crypto'],
  /\bOpenSSL::Cipher(?:::\w+)?\.new\s*\(\s*['"](?:des|des3|des-ede[\w-]*|rc4[\w-]*|rc2[\w-]*|bf[\w-]*|[\w-]*-ecb)['"]/i,
  ['Weak cipher or ECB mode', 'DES, RC4, RC2, Blowfish and ECB are broken or leak patterns.', 'Use aes-256-gcm.'],
  ['약한 암호나 ECB 모드입니다', 'DES, RC4, RC2, Blowfish, ECB는 깨졌거나 패턴을 드러냅니다.', 'aes-256-gcm을 쓰세요.'],
  "cipher = OpenSSL::Cipher.new('des-ede3-cbc')", "cipher = OpenSSL::Cipher.new('aes-256-gcm')");
R('insecure-random', 'H', 'MA', 10, ['cwe-330', 'owasp-a02'],
  /(?<![\w.:])(?:rand|srand)\s*[(\s]\s*\d|\bRandom\.(?:rand|new|new_seed)\b|\bKernel\.rand\b/,
  ['Non-cryptographic random value', 'rand and Random are predictable and must not create tokens.', 'Use SecureRandom.'],
  ['암호학적이지 않은 난수입니다', 'rand와 Random은 예측 가능해 토큰을 만들면 안 됩니다.', 'SecureRandom을 쓰세요.'],
  'token = Random.rand(10**12)', 'token = SecureRandom.hex(16)');
R('cookie-flags-off', 'H', 'MA', 5, ['cwe-614', 'owasp-a05', 'cookie'],
  /\b(?:secure|httponly):\s*false\b/,
  ['Cookie Secure / HttpOnly turned off', 'The cookie is sent over HTTP or readable from script.', 'Set secure: true and httponly: true.'],
  ['쿠키 Secure / HttpOnly를 끕니다', '쿠키가 HTTP로 전송되거나 스크립트가 읽을 수 있습니다.', 'secure: true와 httponly: true를 설정하세요.'],
  'cookies[:sid] = { value: id, httponly: false }', 'cookies[:sid] = { value: id, httponly: true, secure: true }');
R('cors-any-origin', 'H', 'MA', 10, ['cwe-942', 'owasp-a05'],
  /\borigins\s+['"]\*['"]|\borigins\s*\(\s*['"]\*['"]\s*\)/,
  ['CORS allows any origin', 'Any site can read responses meant for your front end.', 'List the allowed origins.'],
  ['CORS가 모든 origin을 허용합니다', '아무 사이트나 프런트엔드용 응답을 읽을 수 있습니다.', '허용할 origin을 나열하세요.'],
  "origins '*'", "origins 'https://app.example.com'");
R('world-permissions', 'V', 'MA', 10, ['cwe-732', 'owasp-a01'],
  /\b(?:File|FileUtils)\.chmod\s*\(\s*0o?777\b|\.chmod\s*\(\s*0o?777\b|\bFileUtils\.mkdir_p\s*\([^)]*mode:\s*0o?777\b/,
  ['World-writable permissions', 'Mode 0777 lets every local user change the file.', 'Use 0644 / 0600.'],
  ['모두가 쓸 수 있는 권한입니다', '0777 권한은 모든 로컬 사용자가 파일을 바꾸게 합니다.', '0644 / 0600을 쓰세요.'],
  'File.chmod(0777, path)', 'File.chmod(0600, path)');
R('jwt-unverified', 'V', 'CR', 20, ['cwe-347', 'owasp-a02', 'jwt'],
  /\bJWT\.decode\s*\([^)]*,\s*(?:nil|['"][^'"]*['"]|\w+)\s*,\s*false\b|\bJWT\.decode\s*\([^)]*algorithm:\s*['"]none['"]/,
  ['JWT decoded without verification', 'Passing false (or alg none) skips the signature check, so claims can be forged.', 'Decode with verify true and the expected algorithm.'],
  ['검증 없이 JWT를 디코딩합니다', 'false(또는 alg none)를 넘기면 서명 검사를 건너뛰어 클레임을 위조할 수 있습니다.', 'verify true와 기대하는 알고리즘으로 디코딩하세요.'],
  'payload = JWT.decode(token, nil, false)', "payload = JWT.decode(token, key, true, algorithm: 'HS256')");
R('shell-interpolation', 'V', 'CR', 30, ['cwe-78', 'owasp-a03'],
  // Kernel#spawn / #system / #exec, not conn.exec("SELECT ... #{id}") (a database call)
  /(?:\b(?:Open3\.\w+|IO\.popen)|(?<![\w.:])(?:spawn|system|exec)|\b(?:Kernel|Process)\.(?:spawn|system|exec))\s*\(?\s*"[^"]*#\{|%x\{[^}]*#\{/,
  ['Shell command with interpolation', 'Interpolated values in a shell string can inject commands.', 'Pass the program and arguments separately: system("tar", "xf", path).'],
  ['보간이 든 셸 명령입니다', '셸 문자열에 보간한 값은 명령을 주입할 수 있습니다.', '프로그램과 인자를 따로 넘기세요: system("tar", "xf", path).'],
  'Open3.capture2("convert #{src} #{dst}")', ['Open3.capture2("convert", src, dst)', 'conn.exec("SELECT * FROM t WHERE id = #{conn.escape(id)}")'], { raw: true });

module.exports = { RULES: R.rules };
