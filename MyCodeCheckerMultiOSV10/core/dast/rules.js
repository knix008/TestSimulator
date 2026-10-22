'use strict';

// DAST rule catalog. Keys are 'dast:*' and never change once published.
// langs is ['*'] (DAST is language-agnostic — it tests a running app).
// Strings are { en, ko }; Korean is short 해요/합니다 체.

function R(key, o) {
  return {
    key,
    langs: ['*'],
    type: o.type,
    severity: o.severity,
    debtMin: o.debtMin || 15,
    tags: o.tags || [],
    name: o.name,
    why: o.why,
    fix: o.fix,
    cwe: (o.standards && o.standards.cwe && o.standards.cwe[0]) || '',
    standards: o.standards || {},
    category: o.category || 'DAST',
  };
}

const RULES = [
  // ---- Passive: security headers --------------------------------------
  R('dast:missing-csp', {
    type: 'SECURITY_HOTSPOT', severity: 'MAJOR', tags: ['dast', 'headers', 'cwe-693', 'owasp-a05'],
    name: { en: 'Missing Content-Security-Policy', ko: 'Content-Security-Policy 헤더 없음' },
    why: { en: 'Without a CSP the browser applies no injection defence-in-depth, so any reflected/stored XSS runs freely.', ko: 'CSP가 없으면 주입 공격에 대한 2차 방어가 없어 XSS가 그대로 실행돼요.' },
    fix: { en: 'Send a restrictive Content-Security-Policy; avoid unsafe-inline/unsafe-eval and wildcards.', ko: '제한적인 CSP를 보내고 unsafe-inline/unsafe-eval·와일드카드는 피하세요.' },
    standards: { cwe: ['CWE-693'], owasp2021: ['A05'] },
  }),
  R('dast:csp-unsafe-inline', {
    type: 'SECURITY_HOTSPOT', severity: 'MAJOR', tags: ['dast', 'headers', 'cwe-693', 'owasp-a05'],
    name: { en: "CSP allows 'unsafe-inline'", ko: "CSP가 'unsafe-inline' 허용" },
    why: { en: "script-src 'unsafe-inline' lets injected inline scripts execute, defeating the CSP.", ko: "script-src 'unsafe-inline'은 주입된 인라인 스크립트를 실행시켜 CSP를 무력화해요." },
    fix: { en: 'Use nonces or hashes instead of unsafe-inline.', ko: 'unsafe-inline 대신 nonce나 hash를 쓰세요.' },
    standards: { cwe: ['CWE-693'], owasp2021: ['A05'] },
  }),
  R('dast:csp-unsafe-eval', {
    type: 'SECURITY_HOTSPOT', severity: 'MAJOR', tags: ['dast', 'headers', 'cwe-693', 'owasp-a05'],
    name: { en: "CSP allows 'unsafe-eval'", ko: "CSP가 'unsafe-eval' 허용" },
    why: { en: "'unsafe-eval' permits eval()/new Function(), a common XSS sink.", ko: "'unsafe-eval'은 eval()/new Function()을 허용해 XSS 통로가 돼요." },
    fix: { en: 'Remove unsafe-eval and refactor code that uses eval().', ko: 'unsafe-eval을 없애고 eval() 사용 코드를 고치세요.' },
    standards: { cwe: ['CWE-693'], owasp2021: ['A05'] },
  }),
  R('dast:csp-wildcard', {
    type: 'SECURITY_HOTSPOT', severity: 'MAJOR', tags: ['dast', 'headers', 'cwe-693', 'owasp-a05'],
    name: { en: 'CSP uses a wildcard source', ko: 'CSP에 와일드카드 소스 사용' },
    why: { en: "A '*' or scheme-wildcard source lets scripts load from anywhere, weakening the policy.", ko: "'*'나 스킴 와일드카드는 아무 곳에서나 스크립트를 불러오게 해 정책을 약화시켜요." },
    fix: { en: 'List exact trusted origins instead of wildcards.', ko: '와일드카드 대신 신뢰하는 정확한 origin만 나열하세요.' },
    standards: { cwe: ['CWE-693'], owasp2021: ['A05'] },
  }),
  R('dast:missing-hsts', {
    type: 'SECURITY_HOTSPOT', severity: 'MAJOR', tags: ['dast', 'headers', 'tls', 'cwe-319', 'owasp-a02'],
    name: { en: 'Missing Strict-Transport-Security', ko: 'Strict-Transport-Security 헤더 없음' },
    why: { en: 'Without HSTS a user can be downgraded to HTTP and have traffic intercepted.', ko: 'HSTS가 없으면 HTTP로 다운그레이드돼 통신이 가로채질 수 있어요.' },
    fix: { en: 'Send Strict-Transport-Security with a long max-age on HTTPS responses.', ko: 'HTTPS 응답에 긴 max-age의 HSTS 헤더를 보내세요.' },
    standards: { cwe: ['CWE-319'], owasp2021: ['A02'] },
  }),
  R('dast:missing-x-content-type-options', {
    type: 'SECURITY_HOTSPOT', severity: 'MINOR', tags: ['dast', 'headers', 'cwe-693'],
    name: { en: 'Missing X-Content-Type-Options', ko: 'X-Content-Type-Options 헤더 없음' },
    why: { en: 'Without nosniff the browser may MIME-sniff responses, enabling content-type confusion attacks.', ko: 'nosniff가 없으면 브라우저가 MIME을 추측해 콘텐츠 타입 혼동 공격이 가능해요.' },
    fix: { en: 'Send X-Content-Type-Options: nosniff.', ko: 'X-Content-Type-Options: nosniff를 보내세요.' },
    standards: { cwe: ['CWE-693'], owasp2021: ['A05'] },
  }),
  R('dast:missing-frame-protection', {
    type: 'SECURITY_HOTSPOT', severity: 'MAJOR', tags: ['dast', 'headers', 'clickjacking', 'cwe-1021', 'owasp-a05'],
    name: { en: 'Clickjacking: no X-Frame-Options / frame-ancestors', ko: '클릭재킹: X-Frame-Options·frame-ancestors 없음' },
    why: { en: 'The page can be framed by any site, enabling clickjacking/UI-redress attacks.', ko: '어떤 사이트든 이 페이지를 프레임에 넣을 수 있어 클릭재킹이 가능해요.' },
    fix: { en: "Send X-Frame-Options: DENY/SAMEORIGIN or CSP frame-ancestors 'self'.", ko: "X-Frame-Options: DENY/SAMEORIGIN 또는 CSP frame-ancestors 'self'를 보내세요." },
    standards: { cwe: ['CWE-1021'], owasp2021: ['A05'] },
  }),
  R('dast:missing-referrer-policy', {
    type: 'SECURITY_HOTSPOT', severity: 'MINOR', tags: ['dast', 'headers', 'cwe-200'],
    name: { en: 'Missing Referrer-Policy', ko: 'Referrer-Policy 헤더 없음' },
    why: { en: 'Full referrer may leak URLs (with tokens) to third parties.', ko: '전체 referrer가 토큰 포함 URL을 외부로 흘릴 수 있어요.' },
    fix: { en: 'Send Referrer-Policy such as strict-origin-when-cross-origin.', ko: 'strict-origin-when-cross-origin 같은 Referrer-Policy를 보내세요.' },
    standards: { cwe: ['CWE-200'], owasp2021: ['A05'] },
  }),
  R('dast:missing-permissions-policy', {
    type: 'SECURITY_HOTSPOT', severity: 'INFO', tags: ['dast', 'headers'],
    name: { en: 'Missing Permissions-Policy', ko: 'Permissions-Policy 헤더 없음' },
    why: { en: 'Powerful features (camera, geolocation…) are not explicitly restricted.', ko: '카메라·위치 등 강력한 기능이 명시적으로 제한돼 있지 않아요.' },
    fix: { en: 'Send a Permissions-Policy disabling features you do not use.', ko: '쓰지 않는 기능을 끄는 Permissions-Policy를 보내세요.' },
    standards: { cwe: ['CWE-693'], owasp2021: ['A05'] },
  }),

  // ---- Passive: cookies ------------------------------------------------
  R('dast:cookie-no-secure', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'cookie', 'cwe-614', 'owasp-a05'],
    name: { en: 'Cookie without Secure flag', ko: 'Secure 플래그 없는 쿠키' },
    why: { en: 'A cookie without Secure can be sent over plain HTTP and intercepted.', ko: 'Secure가 없는 쿠키는 평문 HTTP로 전송돼 가로채질 수 있어요.' },
    fix: { en: 'Set the Secure attribute on all cookies.', ko: '모든 쿠키에 Secure 속성을 설정하세요.' },
    standards: { cwe: ['CWE-614'], owasp2021: ['A05'] },
  }),
  R('dast:cookie-no-httponly', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'cookie', 'cwe-1004', 'owasp-a05'],
    name: { en: 'Cookie without HttpOnly flag', ko: 'HttpOnly 플래그 없는 쿠키' },
    why: { en: 'Without HttpOnly, JavaScript (and thus XSS) can read the cookie.', ko: 'HttpOnly가 없으면 JS(및 XSS)가 쿠키를 읽을 수 있어요.' },
    fix: { en: 'Set HttpOnly on session/auth cookies.', ko: '세션·인증 쿠키에 HttpOnly를 설정하세요.' },
    standards: { cwe: ['CWE-1004'], owasp2021: ['A05'] },
  }),
  R('dast:cookie-no-samesite', {
    type: 'SECURITY_HOTSPOT', severity: 'MINOR', tags: ['dast', 'cookie', 'csrf', 'cwe-1275'],
    name: { en: 'Cookie without SameSite attribute', ko: 'SameSite 속성 없는 쿠키' },
    why: { en: 'Missing SameSite weakens CSRF defence-in-depth.', ko: 'SameSite가 없으면 CSRF 방어가 약해져요.' },
    fix: { en: 'Set SameSite=Lax or Strict as appropriate.', ko: '상황에 맞게 SameSite=Lax 또는 Strict를 설정하세요.' },
    standards: { cwe: ['CWE-1275'], owasp2021: ['A05'] },
  }),

  // ---- Passive: CORS ---------------------------------------------------
  R('dast:cors-reflected-origin', {
    type: 'VULNERABILITY', severity: 'CRITICAL', tags: ['dast', 'cors', 'cwe-942', 'owasp-a05'],
    name: { en: 'CORS reflects arbitrary Origin with credentials', ko: '임의 Origin을 반사하며 credentials 허용하는 CORS' },
    why: { en: 'Reflecting any Origin together with Allow-Credentials lets any site read authenticated responses.', ko: '임의 Origin을 반사하면서 credentials를 허용하면 어느 사이트든 인증된 응답을 읽을 수 있어요.' },
    fix: { en: 'Allowlist exact origins; never reflect the request Origin with credentials.', ko: '정확한 origin만 허용하고 credentials와 함께 요청 Origin을 반사하지 마세요.' },
    standards: { cwe: ['CWE-942'], owasp2021: ['A05'] },
  }),
  R('dast:cors-wildcard-credentials', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'cors', 'cwe-942', 'owasp-a05'],
    name: { en: 'CORS wildcard with credentials', ko: '와일드카드 + credentials CORS' },
    why: { en: 'Access-Control-Allow-Origin: * with credentials is invalid and often indicates a misconfigured proxy.', ko: 'Allow-Origin: * 와 credentials 조합은 잘못된 설정 신호예요.' },
    fix: { en: 'Do not combine wildcard origin with Allow-Credentials.', ko: '와일드카드 origin과 Allow-Credentials를 함께 쓰지 마세요.' },
    standards: { cwe: ['CWE-942'], owasp2021: ['A05'] },
  }),
  R('dast:cors-null-origin', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'cors', 'cwe-942', 'owasp-a05'],
    name: { en: 'CORS allows null origin', ko: 'CORS가 null origin 허용' },
    why: { en: "Allowing 'null' lets sandboxed iframes and local files read responses.", ko: "'null' 허용은 샌드박스 iframe·로컬 파일이 응답을 읽게 해요." },
    fix: { en: "Never allow the 'null' origin.", ko: "'null' origin은 절대 허용하지 마세요." },
    standards: { cwe: ['CWE-942'], owasp2021: ['A05'] },
  }),

  // ---- Passive: information disclosure --------------------------------
  R('dast:server-version', {
    type: 'SECURITY_HOTSPOT', severity: 'INFO', tags: ['dast', 'disclosure', 'cwe-200'],
    name: { en: 'Server/technology version disclosed', ko: '서버·기술 버전 노출' },
    why: { en: 'Server or X-Powered-By version banners help attackers target known CVEs.', ko: 'Server·X-Powered-By 버전 배너는 알려진 CVE 공격의 단서가 돼요.' },
    fix: { en: 'Suppress version details in Server/X-Powered-By headers.', ko: 'Server·X-Powered-By 헤더의 버전 정보를 감추세요.' },
    standards: { cwe: ['CWE-200'], owasp2021: ['A05'] },
  }),
  R('dast:stack-trace', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'disclosure', 'cwe-209', 'owasp-a04'],
    name: { en: 'Stack trace / debug output exposed', ko: '스택 트레이스·디버그 출력 노출' },
    why: { en: 'Stack traces leak framework internals, file paths and query fragments.', ko: '스택 트레이스는 프레임워크 내부·파일 경로·쿼리 조각을 노출해요.' },
    fix: { en: 'Return generic error pages; log details server-side only.', ko: '일반 오류 페이지를 반환하고 상세는 서버에만 기록하세요.' },
    standards: { cwe: ['CWE-209'], owasp2021: ['A04'] },
  }),
  R('dast:internal-ip', {
    type: 'SECURITY_HOTSPOT', severity: 'MINOR', tags: ['dast', 'disclosure', 'cwe-200'],
    name: { en: 'Internal IP address disclosed', ko: '내부 IP 주소 노출' },
    why: { en: 'Internal RFC1918 addresses reveal network topology.', ko: '내부 RFC1918 주소는 네트워크 구조를 드러내요.' },
    fix: { en: 'Avoid returning internal IPs in responses/headers.', ko: '응답·헤더에 내부 IP를 노출하지 마세요.' },
    standards: { cwe: ['CWE-200'], owasp2021: ['A05'] },
  }),
  R('dast:source-map-exposed', {
    type: 'SECURITY_HOTSPOT', severity: 'MINOR', tags: ['dast', 'disclosure', 'cwe-540'],
    name: { en: 'Source map exposed', ko: '소스맵 노출' },
    why: { en: 'Published .map files reveal original (often commented) source code.', ko: '공개된 .map 파일은 원본 소스 코드를 드러내요.' },
    fix: { en: 'Do not deploy source maps to production, or restrict access.', ko: '소스맵을 운영에 배포하지 말거나 접근을 제한하세요.' },
    standards: { cwe: ['CWE-540'], owasp2021: ['A05'] },
  }),
  R('dast:directory-listing', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'disclosure', 'cwe-548'],
    name: { en: 'Directory listing enabled', ko: '디렉터리 목록 노출' },
    why: { en: 'Auto-indexing exposes files not meant to be enumerated.', ko: '자동 인덱싱은 나열되면 안 되는 파일을 노출해요.' },
    fix: { en: 'Disable auto-indexing on the web server.', ko: '웹 서버의 자동 인덱싱을 끄세요.' },
    standards: { cwe: ['CWE-548'], owasp2021: ['A05'] },
  }),
  R('dast:sensitive-file', {
    type: 'VULNERABILITY', severity: 'CRITICAL', tags: ['dast', 'disclosure', 'cwe-538', 'owasp-a05'],
    name: { en: 'Sensitive file exposed (.git/.env/…)', ko: '민감 파일 노출(.git/.env 등)' },
    why: { en: 'Exposed .git/.env/backup files can leak source, secrets and credentials.', ko: '노출된 .git/.env/백업 파일은 소스·비밀·자격증명을 흘릴 수 있어요.' },
    fix: { en: 'Block access to VCS/config/backup paths at the web server.', ko: '웹 서버에서 VCS·설정·백업 경로 접근을 차단하세요.' },
    standards: { cwe: ['CWE-538'], owasp2021: ['A05'] },
  }),

  // ---- Passive: transport / content ----------------------------------
  R('dast:mixed-content', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'tls', 'cwe-319', 'owasp-a02'],
    name: { en: 'Mixed content on HTTPS page', ko: 'HTTPS 페이지의 혼합 콘텐츠' },
    why: { en: 'HTTP sub-resources on an HTTPS page can be tampered with in transit.', ko: 'HTTPS 페이지의 HTTP 하위 리소스는 전송 중 변조될 수 있어요.' },
    fix: { en: 'Load all sub-resources over HTTPS.', ko: '모든 하위 리소스를 HTTPS로 불러오세요.' },
    standards: { cwe: ['CWE-319'], owasp2021: ['A02'] },
  }),
  R('dast:insecure-form-action', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'tls', 'cwe-319', 'owasp-a02'],
    name: { en: 'Form submits over HTTP', ko: 'HTTP로 전송되는 폼' },
    why: { en: 'An http:// form action sends submitted data in clear text.', ko: 'http:// 폼 action은 입력 데이터를 평문으로 전송해요.' },
    fix: { en: 'Point the form action at an https:// URL.', ko: '폼 action을 https:// URL로 지정하세요.' },
    standards: { cwe: ['CWE-319'], owasp2021: ['A02'] },
  }),
  R('dast:password-autocomplete', {
    type: 'SECURITY_HOTSPOT', severity: 'INFO', tags: ['dast', 'cwe-522'],
    name: { en: 'Password field allows autocomplete', ko: '비밀번호 필드 자동완성 허용' },
    why: { en: 'Cached passwords on shared machines can be recovered.', ko: '공용 PC에 저장된 비밀번호가 복원될 수 있어요.' },
    fix: { en: 'Consider autocomplete="off"/"new-password" on password fields.', ko: '비밀번호 필드에 autocomplete="off"/"new-password"를 고려하세요.' },
    standards: { cwe: ['CWE-522'], owasp2021: ['A07'] },
  }),
  R('dast:cache-sensitive', {
    type: 'SECURITY_HOTSPOT', severity: 'MINOR', tags: ['dast', 'cwe-525'],
    name: { en: 'Cacheable authenticated response', ko: '캐시 가능한 인증 응답' },
    why: { en: 'Authenticated pages without no-store may be cached by proxies/browsers.', ko: 'no-store 없는 인증 페이지는 프록시·브라우저에 캐시될 수 있어요.' },
    fix: { en: 'Send Cache-Control: no-store on authenticated responses.', ko: '인증 응답에 Cache-Control: no-store를 보내세요.' },
    standards: { cwe: ['CWE-525'], owasp2021: ['A05'] },
  }),
  R('dast:tls-cert-expired', {
    type: 'VULNERABILITY', severity: 'CRITICAL', tags: ['dast', 'tls', 'cwe-295', 'owasp-a02'],
    name: { en: 'TLS certificate expired or not yet valid', ko: 'TLS 인증서 만료·미유효' },
    why: { en: 'An expired/not-yet-valid cert breaks trust and may be ignored by users.', ko: '만료·미유효 인증서는 신뢰를 깨고 사용자가 무시하게 만들어요.' },
    fix: { en: 'Renew the certificate and automate renewal.', ko: '인증서를 갱신하고 자동 갱신을 설정하세요.' },
    standards: { cwe: ['CWE-295'], owasp2021: ['A02'] },
  }),
  R('dast:tls-self-signed', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'tls', 'cwe-295', 'owasp-a02'],
    name: { en: 'TLS certificate not trusted (self-signed)', ko: '신뢰되지 않는 TLS 인증서(자가서명)' },
    why: { en: 'A self-signed/untrusted chain cannot be verified, enabling MITM.', ko: '자가서명·미신뢰 체인은 검증이 안 돼 중간자 공격이 가능해요.' },
    fix: { en: 'Use a certificate from a trusted CA.', ko: '신뢰된 CA 인증서를 쓰세요.' },
    standards: { cwe: ['CWE-295'], owasp2021: ['A02'] },
  }),
  R('dast:tls-hostname-mismatch', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'tls', 'cwe-297', 'owasp-a02'],
    name: { en: 'TLS certificate hostname mismatch', ko: 'TLS 인증서 호스트명 불일치' },
    why: { en: 'The certificate does not cover the requested host.', ko: '인증서가 요청한 호스트를 포함하지 않아요.' },
    fix: { en: 'Issue a certificate whose SAN covers the hostname.', ko: 'SAN에 호스트명을 포함하는 인증서를 발급하세요.' },
    standards: { cwe: ['CWE-297'], owasp2021: ['A02'] },
  }),
  R('dast:tls-weak-protocol', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'tls', 'cwe-327', 'owasp-a02'],
    name: { en: 'Weak TLS protocol version', ko: '약한 TLS 프로토콜 버전' },
    why: { en: 'TLS 1.0/1.1 (and SSLv3) have known cryptographic weaknesses.', ko: 'TLS 1.0/1.1(및 SSLv3)은 알려진 암호 취약점이 있어요.' },
    fix: { en: 'Require TLS 1.2+ (prefer 1.3).', ko: 'TLS 1.2 이상(가능하면 1.3)만 허용하세요.' },
    standards: { cwe: ['CWE-327'], owasp2021: ['A02'] },
  }),
  R('dast:no-https-redirect', {
    type: 'SECURITY_HOTSPOT', severity: 'MAJOR', tags: ['dast', 'tls', 'cwe-319', 'owasp-a02'],
    name: { en: 'HTTP not redirected to HTTPS', ko: 'HTTP가 HTTPS로 리다이렉트 안 됨' },
    why: { en: 'Serving over HTTP without redirect allows plaintext access.', ko: '리다이렉트 없이 HTTP로 제공하면 평문 접근이 가능해요.' },
    fix: { en: 'Redirect all HTTP to HTTPS (301) and add HSTS.', ko: '모든 HTTP를 HTTPS로 301 리다이렉트하고 HSTS를 더하세요.' },
    standards: { cwe: ['CWE-319'], owasp2021: ['A02'] },
  }),
  R('dast:jwt-in-url', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'disclosure', 'cwe-598', 'owasp-a01'],
    name: { en: 'JWT present in URL', ko: 'URL에 JWT 포함' },
    why: { en: 'Tokens in URLs leak via logs, referrers and browser history.', ko: 'URL의 토큰은 로그·referrer·히스토리로 새요.' },
    fix: { en: 'Carry tokens in headers or cookies, not URLs.', ko: '토큰은 URL이 아닌 헤더·쿠키로 전달하세요.' },
    standards: { cwe: ['CWE-598'], owasp2021: ['A01'] },
  }),
  R('dast:sensitive-data-in-url', {
    type: 'SECURITY_HOTSPOT', severity: 'MINOR', tags: ['dast', 'disclosure', 'cwe-598', 'owasp-a01'],
    name: { en: 'Sensitive data in URL query', ko: 'URL 쿼리에 민감 데이터' },
    why: { en: 'Passwords/keys/tokens in the query string are logged and cached.', ko: '쿼리의 비밀번호·키·토큰은 로그·캐시에 남아요.' },
    fix: { en: 'Move sensitive parameters out of the URL.', ko: '민감 파라미터를 URL 밖으로 옮기세요.' },
    standards: { cwe: ['CWE-598'], owasp2021: ['A01'] },
  }),
  R('dast:open-redirect-param', {
    type: 'SECURITY_HOTSPOT', severity: 'MINOR', tags: ['dast', 'redirect', 'cwe-601', 'owasp-a01'],
    name: { en: 'Potential open-redirect parameter', ko: '오픈 리다이렉트 의심 파라미터' },
    why: { en: 'Redirect-like params (next, url, return…) are common open-redirect sinks.', ko: 'next·url·return 같은 리다이렉트 파라미터는 오픈 리다이렉트 통로가 되기 쉬워요.' },
    fix: { en: 'Validate redirect targets against an allowlist.', ko: '리다이렉트 대상을 허용목록으로 검증하세요.' },
    standards: { cwe: ['CWE-601'], owasp2021: ['A01'] },
  }),
  R('dast:outdated-js-library', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'sca', 'cwe-1104', 'owasp-a06'],
    name: { en: 'Outdated JavaScript library', ko: '오래된 JavaScript 라이브러리' },
    why: { en: 'A known-vulnerable client library version is in use.', ko: '알려진 취약 버전의 클라이언트 라이브러리를 쓰고 있어요.' },
    fix: { en: 'Upgrade the library to a fixed version.', ko: '라이브러리를 수정된 버전으로 올리세요.' },
    standards: { cwe: ['CWE-1104'], owasp2021: ['A06'] },
  }),

  // ---- Active safe probes ---------------------------------------------
  R('dast:xss-reflected', {
    type: 'VULNERABILITY', severity: 'CRITICAL', tags: ['dast', 'xss', 'cwe-79', 'owasp-a03'],
    name: { en: 'Reflected cross-site scripting (XSS)', ko: '반사형 XSS' },
    why: { en: 'A unique marker was reflected unescaped into HTML/attribute/script context, so injected markup would execute.', ko: '고유 마커가 이스케이프 없이 HTML·속성·스크립트 문맥에 반사돼 주입 마크업이 실행될 수 있어요.' },
    fix: { en: 'Context-encode output and apply a strict CSP.', ko: '출력을 문맥에 맞게 인코딩하고 엄격한 CSP를 적용하세요.' },
    standards: { cwe: ['CWE-79'], owasp2021: ['A03'] },
  }),
  R('dast:sqli-error', {
    type: 'VULNERABILITY', severity: 'BLOCKER', tags: ['dast', 'sqli', 'cwe-89', 'owasp-a03'],
    name: { en: 'SQL injection (error-based)', ko: 'SQL 인젝션(오류 기반)' },
    why: { en: 'A quote/arithmetic probe triggered a database error signature, indicating unsanitized SQL.', ko: '따옴표·산술 탐침이 DB 오류 시그니처를 일으켜 정제되지 않은 SQL을 가리켜요.' },
    fix: { en: 'Use parameterized queries / prepared statements.', ko: '매개변수화 쿼리·프리페어드 스테이트먼트를 쓰세요.' },
    standards: { cwe: ['CWE-89'], owasp2021: ['A03'] },
  }),
  R('dast:sqli-boolean', {
    type: 'VULNERABILITY', severity: 'BLOCKER', tags: ['dast', 'sqli', 'cwe-89', 'owasp-a03'],
    name: { en: 'SQL injection (boolean-based)', ko: 'SQL 인젝션(불리언 기반)' },
    why: { en: "A true vs false condition (AND 1=1 / AND 1=2) changed the response, indicating SQL injection.", ko: 'AND 1=1 / AND 1=2 조건에 따라 응답이 달라져 SQL 인젝션을 가리켜요.' },
    fix: { en: 'Use parameterized queries / prepared statements.', ko: '매개변수화 쿼리·프리페어드 스테이트먼트를 쓰세요.' },
    standards: { cwe: ['CWE-89'], owasp2021: ['A03'] },
  }),
  R('dast:path-traversal', {
    type: 'VULNERABILITY', severity: 'BLOCKER', tags: ['dast', 'traversal', 'cwe-22', 'owasp-a01'],
    name: { en: 'Path traversal', ko: '경로 순회' },
    why: { en: 'A ../ probe returned a benign known-file signature, indicating the parameter reaches the filesystem.', ko: '../ 탐침이 알려진 파일 시그니처를 반환해 파라미터가 파일시스템에 닿음을 가리켜요.' },
    fix: { en: 'Canonicalize and allowlist file paths; never pass user input to the filesystem.', ko: '파일 경로를 정규화·허용목록화하고 사용자 입력을 파일시스템에 직접 넘기지 마세요.' },
    standards: { cwe: ['CWE-22'], owasp2021: ['A01'] },
  }),
  R('dast:open-redirect', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'redirect', 'cwe-601', 'owasp-a01'],
    name: { en: 'Open redirect', ko: '오픈 리다이렉트' },
    why: { en: 'A redirect parameter sent the Location header to an external marker domain.', ko: '리다이렉트 파라미터가 Location 헤더를 외부 마커 도메인으로 보냈어요.' },
    fix: { en: 'Validate redirect targets against an allowlist.', ko: '리다이렉트 대상을 허용목록으로 검증하세요.' },
    standards: { cwe: ['CWE-601'], owasp2021: ['A01'] },
  }),
  R('dast:ssti', {
    type: 'VULNERABILITY', severity: 'BLOCKER', tags: ['dast', 'ssti', 'cwe-1336', 'owasp-a03'],
    name: { en: 'Server-side template injection (SSTI)', ko: '서버 측 템플릿 인젝션' },
    why: { en: 'An arithmetic marker ({{7*7}}-style) was evaluated to its product in the response.', ko: '산술 마커({{7*7}} 형태)가 응답에서 곱으로 계산됐어요.' },
    fix: { en: 'Never render user input as a template; use a sandboxed/logic-less engine.', ko: '사용자 입력을 템플릿으로 렌더링하지 말고 샌드박스·로직리스 엔진을 쓰세요.' },
    standards: { cwe: ['CWE-1336'], owasp2021: ['A03'] },
  }),
  R('dast:command-injection', {
    type: 'VULNERABILITY', severity: 'BLOCKER', tags: ['dast', 'cmdi', 'cwe-78', 'owasp-a03'],
    name: { en: 'OS command injection (echo-marker)', ko: 'OS 명령 인젝션(echo 마커)' },
    why: { en: 'An echo-marker payload produced its unique output in the response, indicating command execution.', ko: 'echo 마커 페이로드의 고유 출력이 응답에 나타나 명령 실행을 가리켜요.' },
    fix: { en: 'Never pass user input to a shell; use argument arrays and allowlists.', ko: '사용자 입력을 셸에 넘기지 말고 인자 배열·허용목록을 쓰세요.' },
    standards: { cwe: ['CWE-78'], owasp2021: ['A03'] },
  }),
  R('dast:crlf-injection', {
    type: 'VULNERABILITY', severity: 'MAJOR', tags: ['dast', 'crlf', 'cwe-113', 'owasp-a03'],
    name: { en: 'CRLF / HTTP header injection', ko: 'CRLF·HTTP 헤더 인젝션' },
    why: { en: 'A CRLF marker produced an injected response header, indicating header splitting.', ko: 'CRLF 마커가 주입된 응답 헤더를 만들어 헤더 분리를 가리켜요.' },
    fix: { en: 'Strip CR/LF from values placed into headers.', ko: '헤더에 넣는 값에서 CR/LF를 제거하세요.' },
    standards: { cwe: ['CWE-113'], owasp2021: ['A03'] },
  }),
  R('dast:http-trace', {
    type: 'SECURITY_HOTSPOT', severity: 'MINOR', tags: ['dast', 'methods', 'cwe-693'],
    name: { en: 'HTTP TRACE method enabled', ko: 'HTTP TRACE 메서드 허용' },
    why: { en: 'TRACE enables Cross-Site Tracing (XST) and should be disabled.', ko: 'TRACE는 XST를 가능케 하므로 꺼야 해요.' },
    fix: { en: 'Disable the TRACE method on the server.', ko: '서버에서 TRACE 메서드를 끄세요.' },
    standards: { cwe: ['CWE-693'], owasp2021: ['A05'] },
  }),
  R('dast:http-options', {
    type: 'SECURITY_HOTSPOT', severity: 'INFO', tags: ['dast', 'methods'],
    name: { en: 'Allowed HTTP methods disclosed', ko: '허용 HTTP 메서드 노출' },
    why: { en: 'OPTIONS Allow header lists enabled methods (informational).', ko: 'OPTIONS Allow 헤더가 허용 메서드를 알려줘요(정보).' },
    fix: { en: 'Restrict to the methods each endpoint needs.', ko: '각 엔드포인트가 필요한 메서드만 허용하세요.' },
    standards: { cwe: ['CWE-16'], owasp2021: ['A05'] },
  }),
];

const BY_KEY = new Map(RULES.map((r) => [r.key, r]));

function catalog() {
  return RULES.map((r) => ({ ...r }));
}

function rule(key) {
  return BY_KEY.get(key);
}

module.exports = { catalog, rule, RULES };
