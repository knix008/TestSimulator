'use strict';

// Security and coding-standard compliance reports computed from an analysis's
// issues and the rule catalog. Everything maps through CWE numbers (from the
// issue, its tags, or the rule's `cwe`/`standards.cwe`/tags); a rule can also
// name its categories directly (standards.owasp2021: ['A03'] ...), which wins.
//
// MISRA follows the MISRA Compliance:2020 model: a guideline recategorization
// plan, deviation records and permits, per-guideline status, the Guideline
// Compliance Summary (GCS), the Guideline Enforcement Plan (GEP) and an
// overall verdict.
//
// Category titles are our own short wording. Only identifiers (A01, CWE-79,
// 6.5.1, Rule 10.1 ...) come from the standards.

const { ruleIndex, cwesOf, isClosed, glob, ratingFromWorst, text } = require('./util');

// ---------------------------------------------------------------------------
// CWE Top 25 (MITRE). Ranked lists, rank 1 first.

/** CWE Top 25 Most Dangerous Software Weaknesses, 2023 edition (ranked). */
const CWE_TOP25_2023 = [787, 79, 89, 416, 78, 20, 125, 22, 352, 434, 862, 476, 287, 190, 502, 77, 119, 798, 918, 306, 362, 269, 94, 863, 276];
/** CWE Top 25 Most Dangerous Software Weaknesses, 2024 edition (ranked). */
const CWE_TOP25_2024 = [79, 787, 89, 352, 22, 125, 78, 416, 862, 434, 94, 20, 77, 287, 269, 502, 200, 863, 918, 119, 476, 798, 190, 400, 306];

const CWE_NAMES = {
  20: 'Improper input validation', 22: 'Path traversal', 77: 'Command injection', 78: 'OS command injection',
  79: 'Cross-site scripting', 89: 'SQL injection', 94: 'Code injection', 119: 'Buffer bounds violation',
  120: 'Classic buffer overflow', 125: 'Out-of-bounds read', 131: 'Incorrect buffer size calculation', 134: 'Format string',
  190: 'Integer overflow', 200: 'Sensitive information exposure', 250: 'Unnecessary privileges', 269: 'Improper privilege management',
  276: 'Incorrect default permissions', 287: 'Improper authentication', 295: 'Improper certificate validation',
  306: 'Missing authentication', 307: 'Unlimited authentication attempts', 311: 'Missing encryption', 319: 'Cleartext transmission',
  327: 'Broken cryptography', 330: 'Weak randomness', 338: 'Weak PRNG', 352: 'CSRF', 362: 'Race condition', 400: 'Uncontrolled resource consumption',
  401: 'Memory leak', 415: 'Double free', 416: 'Use after free', 434: 'Unrestricted file upload', 476: 'NULL pointer dereference',
  494: 'Download without integrity check', 502: 'Unsafe deserialization', 532: 'Sensitive data in logs', 601: 'Open redirect',
  611: 'XXE', 676: 'Dangerous function', 732: 'Incorrect permission assignment', 759: 'Hash without salt', 787: 'Out-of-bounds write',
  798: 'Hard-coded credentials', 807: 'Untrusted input in security decision', 829: 'Untrusted functionality inclusion',
  862: 'Missing authorization', 863: 'Incorrect authorization', 918: 'SSRF', 95: 'Eval injection', 117: 'Log injection',
  369: 'Divide by zero', 457: 'Uninitialized variable', 908: 'Uninitialized resource', 772: 'Resource leak', 404: 'Improper resource shutdown',
};

// SANS Top 25 as Sonar reports it: the CWE/SANS 2011 list in its three groups.
const SANS_TOP25 = {
  'insecure-interaction': { title: { en: 'Insecure interaction between components', ko: '구성 요소 간 안전하지 않은 상호작용' }, cwes: [89, 78, 79, 434, 352, 601] },
  'risky-resource': { title: { en: 'Risky resource management', ko: '위험한 자원 관리' }, cwes: [120, 22, 494, 829, 676, 131, 134, 190] },
  'porous-defenses': { title: { en: 'Porous defenses', ko: '허술한 방어' }, cwes: [306, 862, 798, 311, 807, 250, 863, 732, 327, 307, 759] },
};

// OWASP Top 10 2021 by CWE (from the OWASP mapping, trimmed to CWEs code analysis can see).
const OWASP_2021 = {
  A01: { title: { en: 'Broken access control', ko: '취약한 접근 제어' }, cwes: [22, 23, 35, 59, 200, 201, 219, 264, 275, 276, 284, 285, 352, 359, 377, 402, 425, 441, 497, 538, 540, 548, 552, 566, 601, 639, 651, 668, 706, 862, 863, 913, 922, 1275] },
  A02: { title: { en: 'Cryptographic failures', ko: '암호화 실패' }, cwes: [259, 261, 296, 310, 319, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 335, 336, 337, 338, 340, 347, 523, 720, 757, 759, 760, 780, 818, 916] },
  A03: { title: { en: 'Injection', ko: '인젝션' }, cwes: [20, 74, 75, 77, 78, 79, 80, 83, 87, 88, 89, 90, 91, 93, 94, 95, 96, 97, 98, 99, 113, 116, 138, 184, 470, 471, 564, 610, 643, 644, 652, 917] },
  A04: { title: { en: 'Insecure design', ko: '안전하지 않은 설계' }, cwes: [73, 183, 209, 213, 235, 256, 257, 266, 269, 280, 311, 312, 313, 316, 419, 430, 434, 444, 451, 472, 501, 522, 525, 539, 579, 598, 602, 642, 646, 650, 653, 656, 657, 799, 807, 840, 841, 927, 1021, 1173] },
  A05: { title: { en: 'Security misconfiguration', ko: '보안 설정 오류' }, cwes: [2, 11, 13, 15, 16, 260, 315, 520, 526, 537, 541, 547, 611, 614, 756, 776, 942, 1004, 1032, 1174] },
  A06: { title: { en: 'Vulnerable and outdated components', ko: '취약하고 오래된 구성 요소' }, cwes: [937, 1035, 1104, 1395] },
  A07: { title: { en: 'Identification and authentication failures', ko: '식별 및 인증 실패' }, cwes: [255, 259, 287, 288, 290, 294, 295, 297, 300, 302, 304, 306, 307, 346, 384, 521, 613, 620, 640, 798, 940, 1216] },
  A08: { title: { en: 'Software and data integrity failures', ko: '소프트웨어 및 데이터 무결성 실패' }, cwes: [345, 353, 426, 494, 502, 565, 784, 829, 830, 915] },
  A09: { title: { en: 'Security logging and monitoring failures', ko: '보안 로깅 및 모니터링 실패' }, cwes: [117, 223, 532, 778] },
  A10: { title: { en: 'Server-side request forgery', ko: '서버 측 요청 위조' }, cwes: [918] },
};

// OWASP Top 10 2017 by CWE.
const OWASP_2017 = {
  A1: { title: { en: 'Injection', ko: '인젝션' }, cwes: [77, 78, 88, 89, 90, 91, 94, 95, 564, 643, 652, 917, 943] },
  A2: { title: { en: 'Broken authentication', ko: '취약한 인증' }, cwes: [256, 262, 263, 287, 306, 307, 384, 521, 522, 613, 620, 640, 798] },
  A3: { title: { en: 'Sensitive data exposure', ko: '민감한 데이터 노출' }, cwes: [200, 202, 213, 311, 312, 319, 321, 326, 327, 328, 330, 338, 523, 759, 760, 916] },
  A4: { title: { en: 'XML external entities', ko: 'XML 외부 개체(XXE)' }, cwes: [611, 776] },
  A5: { title: { en: 'Broken access control', ko: '취약한 접근 제어' }, cwes: [22, 23, 35, 59, 284, 285, 352, 425, 601, 639, 862, 863, 918] },
  A6: { title: { en: 'Security misconfiguration', ko: '보안 설정 오류' }, cwes: [2, 16, 215, 388, 489, 614, 756, 942, 1004] },
  A7: { title: { en: 'Cross-site scripting', ko: '크로스 사이트 스크립팅' }, cwes: [79, 80, 83, 87] },
  A8: { title: { en: 'Insecure deserialization', ko: '안전하지 않은 역직렬화' }, cwes: [502] },
  A9: { title: { en: 'Using components with known vulnerabilities', ko: '알려진 취약점이 있는 구성 요소 사용' }, cwes: [937, 1035, 1104] },
  A10: { title: { en: 'Insufficient logging and monitoring', ko: '불충분한 로깅 및 모니터링' }, cwes: [117, 223, 532, 778] },
};

// OWASP ASVS 4.0.3 requirements that code analysis can evidence, with the
// lowest level that requires them (an L1 item applies to L1, L2 and L3).
const ASVS_4 = [
  { id: 'V2.1.1', level: 1, chapter: 'V2', cwes: [521], title: { en: 'Password length policy', ko: '비밀번호 길이 정책' } },
  { id: 'V2.4.1', level: 2, chapter: 'V2', cwes: [916, 759, 760], title: { en: 'Passwords stored with a slow salted hash', ko: '느린 솔트 해시로 비밀번호 저장' } },
  { id: 'V2.10.4', level: 2, chapter: 'V2', cwes: [798, 259, 321], title: { en: 'No hard-coded secrets or credentials', ko: '하드코딩된 비밀·자격 증명 없음' } },
  { id: 'V3.4.1', level: 1, chapter: 'V3', cwes: [614], title: { en: 'Cookies carry the Secure attribute', ko: '쿠키에 Secure 속성' } },
  { id: 'V3.4.2', level: 1, chapter: 'V3', cwes: [1004], title: { en: 'Cookies carry the HttpOnly attribute', ko: '쿠키에 HttpOnly 속성' } },
  { id: 'V3.2.1', level: 1, chapter: 'V3', cwes: [384, 613], title: { en: 'New session token on authentication', ko: '인증 시 새 세션 토큰' } },
  { id: 'V4.1.3', level: 1, chapter: 'V4', cwes: [285, 284, 862, 863], title: { en: 'Least privilege access control', ko: '최소 권한 접근 제어' } },
  { id: 'V4.2.1', level: 1, chapter: 'V4', cwes: [639], title: { en: 'Protection against direct object reference', ko: '직접 객체 참조 방지' } },
  { id: 'V4.2.2', level: 1, chapter: 'V4', cwes: [352], title: { en: 'Anti-CSRF protection', ko: 'CSRF 방어' } },
  { id: 'V5.1.3', level: 1, chapter: 'V5', cwes: [20], title: { en: 'Positive input validation', ko: '허용 목록 입력 검증' } },
  { id: 'V5.1.5', level: 1, chapter: 'V5', cwes: [601], title: { en: 'Safe redirects and forwards', ko: '안전한 리다이렉트' } },
  { id: 'V5.2.4', level: 1, chapter: 'V5', cwes: [95, 94], title: { en: 'No eval or dynamic code execution', ko: 'eval·동적 코드 실행 없음' } },
  { id: 'V5.3.3', level: 1, chapter: 'V5', cwes: [79, 80], title: { en: 'Context-aware output escaping (XSS)', ko: '문맥별 출력 이스케이프(XSS)' } },
  { id: 'V5.3.4', level: 1, chapter: 'V5', cwes: [89, 564], title: { en: 'Parameterized queries (SQL injection)', ko: '매개변수화 쿼리(SQL 인젝션)' } },
  { id: 'V5.3.7', level: 1, chapter: 'V5', cwes: [90], title: { en: 'LDAP injection protection', ko: 'LDAP 인젝션 방어' } },
  { id: 'V5.3.8', level: 1, chapter: 'V5', cwes: [78, 77], title: { en: 'OS command injection protection', ko: 'OS 명령 인젝션 방어' } },
  { id: 'V5.3.10', level: 1, chapter: 'V5', cwes: [643], title: { en: 'XPath injection protection', ko: 'XPath 인젝션 방어' } },
  { id: 'V5.4.1', level: 2, chapter: 'V5', cwes: [119, 120, 125, 787, 131, 416, 415, 476, 401], title: { en: 'Memory-safe string and pointer handling', ko: '메모리 안전한 문자열·포인터 처리' } },
  { id: 'V5.4.2', level: 2, chapter: 'V5', cwes: [134], title: { en: 'Format strings not attacker-controlled', ko: '공격자가 형식 문자열을 제어하지 못함' } },
  { id: 'V5.4.3', level: 2, chapter: 'V5', cwes: [190, 191, 369], title: { en: 'Integer overflow and sign checks', ko: '정수 오버플로·부호 검사' } },
  { id: 'V5.5.1', level: 2, chapter: 'V5', cwes: [502], title: { en: 'Integrity checks on serialized objects', ko: '직렬화 객체 무결성 검사' } },
  { id: 'V5.5.2', level: 1, chapter: 'V5', cwes: [611, 776], title: { en: 'XML parsers without external entities', ko: '외부 개체를 막은 XML 파서' } },
  { id: 'V5.5.3', level: 1, chapter: 'V5', cwes: [502], title: { en: 'No deserialization of untrusted data', ko: '신뢰할 수 없는 데이터 역직렬화 금지' } },
  { id: 'V6.2.1', level: 1, chapter: 'V6', cwes: [310, 311, 326], title: { en: 'Cryptographic modules fail securely', ko: '안전하게 실패하는 암호 모듈' } },
  { id: 'V6.2.2', level: 2, chapter: 'V6', cwes: [327, 328], title: { en: 'Approved algorithms only', ko: '승인된 알고리즘만 사용' } },
  { id: 'V6.3.1', level: 2, chapter: 'V6', cwes: [330, 338], title: { en: 'Cryptographically secure random numbers', ko: '암호학적으로 안전한 난수' } },
  { id: 'V7.1.1', level: 1, chapter: 'V7', cwes: [532, 200], title: { en: 'No credentials in logs', ko: '로그에 자격 증명 없음' } },
  { id: 'V7.3.1', level: 2, chapter: 'V7', cwes: [117], title: { en: 'Log injection protection', ko: '로그 인젝션 방어' } },
  { id: 'V7.4.1', level: 1, chapter: 'V7', cwes: [209, 210], title: { en: 'Generic error messages', ko: '일반화된 오류 메시지' } },
  { id: 'V8.3.4', level: 1, chapter: 'V8', cwes: [200, 359], title: { en: 'Sensitive data identified and protected', ko: '민감 데이터 식별·보호' } },
  { id: 'V9.1.1', level: 1, chapter: 'V9', cwes: [319], title: { en: 'TLS for all client connections', ko: '모든 연결에 TLS' } },
  { id: 'V9.2.1', level: 2, chapter: 'V9', cwes: [295, 297], title: { en: 'Trusted TLS certificates', ko: '신뢰할 수 있는 TLS 인증서' } },
  { id: 'V11.1.6', level: 2, chapter: 'V11', cwes: [367, 362], title: { en: 'Time-of-check / time-of-use safety', ko: '검사-사용 시점 경쟁 안전' } },
  { id: 'V12.1.1', level: 1, chapter: 'V12', cwes: [400, 770], title: { en: 'Limits on resource consumption', ko: '자원 소비 제한' } },
  { id: 'V12.2.1', level: 2, chapter: 'V12', cwes: [434], title: { en: 'Uploaded file type checks', ko: '업로드 파일 형식 검사' } },
  { id: 'V12.3.1', level: 1, chapter: 'V12', cwes: [22, 23, 73], title: { en: 'Path traversal protection', ko: '경로 순회 방어' } },
  { id: 'V12.6.1', level: 1, chapter: 'V12', cwes: [918], title: { en: 'SSRF protection', ko: 'SSRF 방어' } },
  { id: 'V14.2.1', level: 1, chapter: 'V14', cwes: [1026, 1104, 937], title: { en: 'Components up to date', ko: '최신 구성 요소' } },
  { id: 'V14.3.2', level: 1, chapter: 'V14', cwes: [497, 489, 215], title: { en: 'Debug modes disabled in production', ko: '운영에서 디버그 모드 끔' } },
];

// PCI DSS 3.2.1 requirement 6.5.x by CWE.
const PCI_DSS_321 = {
  '6.5.1': { title: { en: 'Injection flaws', ko: '인젝션 결함' }, cwes: [77, 78, 88, 89, 90, 91, 94, 95, 564, 643, 652, 917, 943] },
  '6.5.2': { title: { en: 'Buffer overflows', ko: '버퍼 오버플로' }, cwes: [119, 120, 121, 122, 125, 131, 787, 805] },
  '6.5.3': { title: { en: 'Insecure cryptographic storage', ko: '안전하지 않은 암호화 저장' }, cwes: [311, 312, 321, 326, 327, 328, 759, 916] },
  '6.5.4': { title: { en: 'Insecure communications', ko: '안전하지 않은 통신' }, cwes: [295, 297, 319] },
  '6.5.5': { title: { en: 'Improper error handling', ko: '부적절한 오류 처리' }, cwes: [209, 248, 390, 391, 396, 397, 754, 755] },
  '6.5.6': { title: { en: 'High-risk vulnerabilities', ko: '고위험 취약점' }, cwes: [], highRisk: true },
  '6.5.7': { title: { en: 'Cross-site scripting', ko: '크로스 사이트 스크립팅' }, cwes: [79, 80, 83, 87] },
  '6.5.8': { title: { en: 'Improper access control', ko: '부적절한 접근 제어' }, cwes: [22, 23, 284, 285, 425, 601, 639, 862, 863] },
  '6.5.9': { title: { en: 'Cross-site request forgery', ko: '크로스 사이트 요청 위조' }, cwes: [352] },
  '6.5.10': { title: { en: 'Broken authentication and sessions', ko: '취약한 인증·세션' }, cwes: [287, 306, 307, 384, 521, 613, 798] },
};

// PCI DSS 4.0 requirement 6.2.4 (attack families) plus 6.3.x, by CWE.
const PCI_DSS_40 = {
  '6.2.4.1': { title: { en: 'Injection attacks', ko: '인젝션 공격' }, cwes: [77, 78, 79, 80, 88, 89, 90, 91, 94, 95, 564, 643, 652, 917, 943] },
  '6.2.4.2': { title: { en: 'Attacks on data and data structures', ko: '데이터·자료구조 공격' }, cwes: [119, 120, 121, 122, 125, 131, 134, 190, 416, 415, 476, 787, 502, 611, 776] },
  '6.2.4.3': { title: { en: 'Attacks on cryptography usage', ko: '암호 사용 공격' }, cwes: [295, 297, 310, 311, 312, 319, 321, 326, 327, 328, 330, 338, 759, 916] },
  '6.2.4.4': { title: { en: 'Attacks on business logic', ko: '비즈니스 로직 공격' }, cwes: [352, 362, 367, 601, 840, 841, 918, 434] },
  '6.2.4.5': { title: { en: 'Attacks on access control', ko: '접근 제어 공격' }, cwes: [22, 23, 284, 285, 287, 306, 307, 384, 425, 613, 639, 798, 862, 863] },
  '6.2.4.6': { title: { en: 'Other high-risk vulnerabilities', ko: '기타 고위험 취약점' }, cwes: [], highRisk: true },
  '6.3.2': { title: { en: 'Inventory of components (SCA)', ko: '구성 요소 목록(SCA)' }, cwes: [937, 1035, 1104, 1395] },
};

// DISA Application Security and Development STIG V5R3. Best-effort mapping by
// CWE to the STIG IDs that code analysis can evidence. CAT I is the most severe.
const STIG_ASD_V5R3 = {
  'V-222602': { cat: 'CAT I', title: { en: 'Protect against cross-site scripting', ko: 'XSS 방어' }, cwes: [79, 80] },
  'V-222603': { cat: 'CAT II', title: { en: 'Protect against CSRF', ko: 'CSRF 방어' }, cwes: [352] },
  'V-222604': { cat: 'CAT I', title: { en: 'Protect against command injection', ko: '명령 인젝션 방어' }, cwes: [77, 78, 88] },
  'V-222605': { cat: 'CAT II', title: { en: 'Protect against canonical representation (path) attacks', ko: '정규 표현(경로) 공격 방어' }, cwes: [22, 23, 41, 73] },
  'V-222606': { cat: 'CAT I', title: { en: 'Validate all input', ko: '모든 입력 검증' }, cwes: [20, 1284] },
  'V-222607': { cat: 'CAT I', title: { en: 'Protect against SQL injection', ko: 'SQL 인젝션 방어' }, cwes: [89, 564, 943] },
  'V-222608': { cat: 'CAT II', title: { en: 'Protect against XML-oriented attacks', ko: 'XML 공격 방어' }, cwes: [611, 776, 91, 643] },
  'V-222609': { cat: 'CAT I', title: { en: 'No input handling vulnerabilities', ko: '입력 처리 취약점 없음' }, cwes: [94, 95, 134, 502, 470] },
  'V-222610': { cat: 'CAT II', title: { en: 'Error messages reveal nothing exploitable', ko: '악용 가능한 오류 메시지 없음' }, cwes: [209, 210, 497] },
  'V-222612': { cat: 'CAT I', title: { en: 'Not vulnerable to overflow attacks', ko: '오버플로 공격에 취약하지 않음' }, cwes: [119, 120, 121, 122, 125, 131, 190, 787, 805] },
  'V-222642': { cat: 'CAT I', title: { en: 'No embedded authentication data', ko: '내장 인증 데이터 없음' }, cwes: [798, 259, 321] },
  'V-222543': { cat: 'CAT I', title: { en: 'Passwords transmitted only encrypted', ko: '암호화된 비밀번호 전송' }, cwes: [319, 523] },
  'V-222542': { cat: 'CAT I', title: { en: 'Passwords stored only as salted hashes', ko: '솔트 해시로만 비밀번호 저장' }, cwes: [256, 257, 759, 760, 916] },
  'V-222570': { cat: 'CAT I', title: { en: 'Approved cryptography for signing', ko: '승인된 서명 암호' }, cwes: [327, 328, 347] },
  'V-222571': { cat: 'CAT I', title: { en: 'Approved cryptography for hashing', ko: '승인된 해시 암호' }, cwes: [326, 328] },
  'V-222596': { cat: 'CAT II', title: { en: 'Protect transmitted information', ko: '전송 정보 보호' }, cwes: [295, 297, 311] },
  'V-222579': { cat: 'CAT II', title: { en: 'Unique session identifiers', ko: '고유한 세션 식별자' }, cwes: [330, 338, 384] },
  'V-222425': { cat: 'CAT I', title: { en: 'Enforce approved authorizations', ko: '승인된 권한 부여 적용' }, cwes: [284, 285, 639, 862, 863] },
  'V-222578': { cat: 'CAT II', title: { en: 'Invalidate session on logout', ko: '로그아웃 시 세션 무효화' }, cwes: [613] },
  'V-222667': { cat: 'CAT II', title: { en: 'Protect against race conditions', ko: '경쟁 조건 방어' }, cwes: [362, 367] },
  'V-222644': { cat: 'CAT III', title: { en: 'Prevent sensitive data in logs', ko: '로그에 민감 데이터 금지' }, cwes: [532, 117] },
};

const STANDARDS = {
  owasp2017: { title: 'OWASP Top 10 2017', categories: OWASP_2017, stdKey: 'owasp2017' },
  owasp2021: { title: 'OWASP Top 10 2021', categories: OWASP_2021, stdKey: 'owasp2021' },
  pciDss321: { title: 'PCI DSS 3.2.1', categories: PCI_DSS_321, stdKey: 'pciDss321' },
  pciDss40: { title: 'PCI DSS 4.0', categories: PCI_DSS_40, stdKey: 'pciDss40' },
  stigAsdV5R3: { title: 'DISA STIG ASD V5R3', categories: STIG_ASD_V5R3, stdKey: 'stig' },
  sansTop25: { title: 'SANS Top 25', categories: SANS_TOP25, stdKey: 'sansTop25' },
  cweTop25_2023: { title: 'CWE Top 25 2023', list: CWE_TOP25_2023 },
  cweTop25_2024: { title: 'CWE Top 25 2024', list: CWE_TOP25_2024 },
  asvs4: { title: 'OWASP ASVS 4.0', requirements: ASVS_4 },
};

/** Ids of every standard this module can report. */
function standardIds() {
  return [...Object.keys(STANDARDS), 'certC', 'certCpp', 'misraC2012', 'misraC2023', 'misraCpp2023'];
}

// ---------------------------------------------------------------------------
// Shared tallies

function emptyTally() {
  return { total: 0, vulnerabilities: 0, hotspots: 0, hotspotsToReview: 0, bugs: 0, codeSmells: 0, rating: 'A', issueKeys: [], rules: [] };
}

function addTo(tally, issue, bucket) {
  tally.total += 1;
  if (issue.type === 'VULNERABILITY') tally.vulnerabilities += 1;
  else if (issue.type === 'SECURITY_HOTSPOT') {
    tally.hotspots += 1;
    if (!issue.status || issue.status === 'TO_REVIEW') tally.hotspotsToReview += 1;
  } else if (issue.type === 'BUG') tally.bugs += 1;
  else tally.codeSmells += 1;
  if (issue.key) tally.issueKeys.push(issue.key);
  if (!tally.rules.includes(issue.rule)) tally.rules.push(issue.rule);
  bucket.push(issue);
}

function finishTally(tally, bucket) {
  // Security rating per category follows the worst vulnerability (bugs count when there is none, as Sonar CWE reports do).
  const vulns = bucket.filter((i) => i.type === 'VULNERABILITY');
  tally.rating = ratingFromWorst(vulns.length ? vulns : bucket.filter((i) => i.type !== 'SECURITY_HOTSPOT' && i.type !== 'CODE_SMELL'));
  tally.issueKeys = tally.issueKeys.slice(0, 1000);
  return tally;
}

function openIssues(issues, opts) {
  return (issues || []).filter((i) => {
    if (!opts.includeClosed && isClosed(i)) return false;
    if (opts.newCodeOnly && !i.isNew) return false;
    return true;
  });
}

function isHighRisk(issue) {
  return (issue.type === 'VULNERABILITY' || issue.type === 'BUG') && (issue.severity === 'BLOCKER' || issue.severity === 'CRITICAL');
}

/** The categories of `standardId` an issue falls into. */
function categoriesFor(issue, rule, standardId) {
  const std = STANDARDS[standardId];
  if (!std || !std.categories) return [];
  const direct = rule && rule.standards && std.stdKey && rule.standards[std.stdKey];
  if (Array.isArray(direct) && direct.length) return direct.map(String).filter((id) => std.categories[id]);
  const cwes = cwesOf(issue, rule);
  const out = [];
  for (const [id, cat] of Object.entries(std.categories)) {
    if (cat.highRisk ? isHighRisk(issue) && !cwes.some((c) => Object.values(std.categories).some((o) => !o.highRisk && o.cwes.includes(c))) : cat.cwes.some((c) => cwes.includes(c))) out.push(id);
  }
  return out;
}

/**
 * Category report for OWASP 2017/2021, PCI DSS 3.2.1/4.0, STIG ASD V5R3 or SANS Top 25.
 * @param {object[]} issues analysis.issues
 * @param {object[]|Map} catalog rule catalog
 * @param {string} standardId one of standardIds()
 * @param {{lang?:string, newCodeOnly?:boolean, includeClosed?:boolean}} [opts]
 * @returns {{standard:string,title:string,categories:object[],totals:object,unmapped:number}}
 */
function categoryReport(issues, catalog, standardId, opts = {}) {
  const std = STANDARDS[standardId];
  if (!std || !std.categories) throw new Error(`Unknown category standard: ${standardId}`);
  const rules = ruleIndex(catalog);
  const lang = opts.lang || 'en';
  const rows = new Map(Object.keys(std.categories).map((id) => [id, { tally: emptyTally(), bucket: [] }]));
  let unmapped = 0;
  const totals = emptyTally();
  const totalBucket = [];
  for (const issue of openIssues(issues, opts)) {
    if (issue.type === 'CODE_SMELL') continue;
    const cats = categoriesFor(issue, rules.get(issue.rule), standardId);
    if (!cats.length) { unmapped += 1; continue; }
    addTo(totals, issue, totalBucket);
    for (const id of cats) addTo(rows.get(id).tally, issue, rows.get(id).bucket);
  }
  const categories = [...rows.entries()].map(([id, { tally, bucket }]) => {
    const meta = std.categories[id];
    return { id, title: text(meta.title, lang), cat: meta.cat || undefined, cwes: meta.cwes.slice(), ...finishTally(tally, bucket) };
  });
  return { standard: standardId, title: std.title, categories, totals: finishTally(totals, totalBucket), unmapped };
}

/**
 * CWE Top 25 report (2023 or 2024 list), ranked.
 * @param {object[]} issues
 * @param {object[]|Map} catalog
 * @param {2023|2024|'2023'|'2024'} [year]
 * @param {{newCodeOnly?:boolean, includeClosed?:boolean}} [opts]
 */
function cweTop25Report(issues, catalog, year = 2024, opts = {}) {
  const list = String(year) === '2023' ? CWE_TOP25_2023 : CWE_TOP25_2024;
  const rules = ruleIndex(catalog);
  const rows = list.map((cwe, n) => ({ rank: n + 1, cwe: `CWE-${cwe}`, title: CWE_NAMES[cwe] || '', tally: emptyTally(), bucket: [] }));
  const byCwe = new Map(list.map((c, n) => [c, rows[n]]));
  const totals = emptyTally();
  const totalBucket = [];
  for (const issue of openIssues(issues, opts)) {
    if (issue.type === 'CODE_SMELL') continue;
    const hits = cwesOf(issue, rules.get(issue.rule)).filter((c) => byCwe.has(c));
    if (!hits.length) continue;
    addTo(totals, issue, totalBucket);
    for (const c of hits) addTo(byCwe.get(c).tally, issue, byCwe.get(c).bucket);
  }
  return {
    standard: `cweTop25_${String(year) === '2023' ? 2023 : 2024}`,
    title: `CWE Top 25 ${String(year) === '2023' ? 2023 : 2024}`,
    categories: rows.map(({ rank, cwe, title, tally, bucket }) => ({ id: cwe, rank, title, ...finishTally(tally, bucket) })),
    totals: finishTally(totals, totalBucket),
  };
}

/**
 * OWASP ASVS 4.0 report at a level (1-3). A requirement passes when no open
 * issue maps to it; requirements above the level are left out.
 * @param {object[]} issues
 * @param {object[]|Map} catalog
 * @param {1|2|3} [level]
 * @param {{lang?:string, newCodeOnly?:boolean, includeClosed?:boolean}} [opts]
 */
function asvsReport(issues, catalog, level = 1, opts = {}) {
  const lvl = Math.min(3, Math.max(1, Number(level) || 1));
  const rules = ruleIndex(catalog);
  const lang = opts.lang || 'en';
  const reqs = ASVS_4.filter((r) => r.level <= lvl).map((r) => ({ ...r, title: text(r.title, lang), tally: emptyTally(), bucket: [] }));
  const open = openIssues(issues, opts).filter((i) => i.type !== 'CODE_SMELL');
  for (const issue of open) {
    const cwes = cwesOf(issue, rules.get(issue.rule));
    for (const req of reqs) if (req.cwes.some((c) => cwes.includes(c))) addTo(req.tally, issue, req.bucket);
  }
  const requirements = reqs.map(({ tally, bucket, ...r }) => ({ ...r, ...finishTally(tally, bucket), status: tally.total ? 'FAILED' : 'PASSED' }));
  const failed = requirements.filter((r) => r.status === 'FAILED').length;
  const chapters = {};
  for (const r of requirements) {
    const c = chapters[r.chapter] || (chapters[r.chapter] = { chapter: r.chapter, requirements: 0, failed: 0 });
    c.requirements += 1;
    if (r.status === 'FAILED') c.failed += 1;
  }
  return {
    standard: 'asvs4', title: `OWASP ASVS 4.0 L${lvl}`, level: lvl, requirements, chapters: Object.values(chapters),
    passed: requirements.length - failed, failed, compliant: failed === 0,
  };
}

/**
 * CERT C or CERT C++ summary by rule and section (EXP, ARR, MEM ...).
 * The CERT id comes from rule.standards.certC / certCpp, rule.cert or issue.cert ('CERT ARR30-C').
 * @param {object[]} issues
 * @param {object[]|Map} catalog
 * @param {'certC'|'certCpp'} [which]
 */
function certReport(issues, catalog, which = 'certC', opts = {}) {
  const rules = ruleIndex(catalog);
  const suffix = which === 'certCpp' ? /-CPP$/i : /-C$/i;
  const idOf = (issue, rule) => {
    const std = rule && rule.standards;
    const cand = [std && std[which], rule && rule.cert, issue.cert].filter(Boolean).map((s) => String(s).replace(/^CERT\s+/i, '').trim());
    return cand.find((c) => suffix.test(c)) || null;
  };
  const byRule = new Map();
  const covered = new Set();
  for (const rule of rules.values()) { const id = idOf({}, rule); if (id) covered.add(id); }
  for (const issue of openIssues(issues, opts)) {
    const id = idOf(issue, rules.get(issue.rule));
    if (!id) continue;
    const row = byRule.get(id) || { id, section: id.slice(0, 3).toUpperCase(), tally: emptyTally(), bucket: [] };
    addTo(row.tally, issue, row.bucket);
    byRule.set(id, row);
    covered.add(id);
  }
  const rows = [...byRule.values()].map(({ tally, bucket, ...r }) => ({ ...r, ...finishTally(tally, bucket) })).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const sections = {};
  for (const r of rows) {
    const s = sections[r.section] || (sections[r.section] = { section: r.section, rules: 0, issues: 0 });
    s.rules += 1;
    s.issues += r.total;
  }
  return {
    standard: which, title: which === 'certCpp' ? 'SEI CERT C++' : 'SEI CERT C',
    rules: rows, sections: Object.values(sections).sort((a, b) => a.section.localeCompare(b.section)),
    checkedRules: [...covered].sort(), violatedRules: rows.length, issues: rows.reduce((n, r) => n + r.total, 0),
  };
}

/**
 * Run every security standard at once (used by the security report page).
 * @returns {Record<string, object>}
 */
function securityReports(issues, catalog, opts = {}) {
  const out = {};
  for (const id of ['owasp2017', 'owasp2021', 'pciDss321', 'pciDss40', 'stigAsdV5R3', 'sansTop25']) out[id] = categoryReport(issues, catalog, id, opts);
  out.cweTop25_2023 = cweTop25Report(issues, catalog, 2023, opts);
  out.cweTop25_2024 = cweTop25Report(issues, catalog, 2024, opts);
  out.asvs4 = asvsReport(issues, catalog, opts.asvsLevel || 1, opts);
  out.certC = certReport(issues, catalog, 'certC', opts);
  out.certCpp = certReport(issues, catalog, 'certCpp', opts);
  return out;
}

/**
 * Dispatch one report by id (category standards, cweTop25_2023/2024, asvs4[:level], certC/certCpp, misra*).
 * @param {string} standardId
 */
function report(issues, catalog, standardId, opts = {}) {
  if (STANDARDS[standardId] && STANDARDS[standardId].categories) return categoryReport(issues, catalog, standardId, opts);
  if (standardId === 'cweTop25_2023') return cweTop25Report(issues, catalog, 2023, opts);
  if (standardId === 'cweTop25_2024' || standardId === 'cweTop25') return cweTop25Report(issues, catalog, 2024, opts);
  if (/^asvs4/.test(standardId)) return asvsReport(issues, catalog, Number(standardId.split(':')[1]) || opts.level || 1, opts);
  if (standardId === 'certC' || standardId === 'certCpp') return certReport(issues, catalog, standardId, opts);
  if (MISRA_STANDARDS[standardId]) return misraCompliance(issues, catalog, { ...(opts.plan || {}), standard: standardId }, opts);
  throw new Error(`Unknown standard: ${standardId}`);
}

// ---------------------------------------------------------------------------
// MISRA Compliance:2020

const MISRA_STANDARDS = {
  misraC2012: { title: 'MISRA C:2012', key: 'misraC2012' },
  misraC2023: { title: 'MISRA C:2023', key: 'misraC2023' },
  misraCpp2023: { title: 'MISRA C++:2023', key: 'misraCpp2023' },
};

const CATEGORIES = ['Mandatory', 'Required', 'Advisory', 'Disapplied'];
const CAT_RANK = { Disapplied: 0, Advisory: 1, Required: 2, Mandatory: 3 };

/**
 * Whether a guideline may move from `from` to `to` under MISRA Compliance:2020:
 * Mandatory stays Mandatory; Required may only rise to Mandatory; Advisory may
 * rise to Required/Mandatory or be Disapplied.
 */
function canRecategorize(from, to) {
  if (!CATEGORIES.includes(to) || !CATEGORIES.includes(from)) return false;
  if (from === to) return true;
  if (from === 'Mandatory') return false;
  if (from === 'Required') return to === 'Mandatory';
  if (from === 'Advisory') return true;
  return false;
}

/** Normalize 'rule 10.1' / '10.1' / 'Dir 4.1' to 'Rule 10.1' / 'Dir 4.1'. */
function normGuideline(g) {
  const s = String(g || '').trim();
  const m = s.match(/^(rule|dir|directive)?\s*([\d.]+)$/i);
  if (!m) return s;
  return `${m[1] && /^dir/i.test(m[1]) ? 'Dir' : 'Rule'} ${m[2]}`;
}

function guidelineSort(a, b) {
  const ka = a.startsWith('Dir') ? 0 : 1;
  const kb = b.startsWith('Dir') ? 0 : 1;
  if (ka !== kb) return ka - kb;
  return a.localeCompare(b, 'en', { numeric: true });
}

/**
 * Validate a deviation record. A valid record names the rule, a scope, a
 * justification and an approver with a date, is not against a Mandatory
 * guideline, is not expired and (if it cites a permit) the permit exists and covers the rule.
 * @returns {{valid:boolean, problems:string[]}}
 */
function validateDeviation(dev, category, permits = [], now = Date.now()) {
  const problems = [];
  if (!dev || !dev.rule) problems.push('missing-rule');
  if (!dev || !String(dev.justification || '').trim()) problems.push('missing-justification');
  if (!dev || !String(dev.approver || '').trim()) problems.push('missing-approver');
  if (!dev || !dev.date || Number.isNaN(Date.parse(dev.date))) problems.push('missing-date');
  if (category === 'Mandatory') problems.push('mandatory-not-deviable');
  if (dev && dev.expires && Date.parse(dev.expires) < now) problems.push('expired');
  if (dev && dev.permit) {
    const permit = permits.find((p) => p.id === dev.permit);
    if (!permit) problems.push('unknown-permit');
    else if (permit.rules && permit.rules.length && !permit.rules.map(normGuideline).includes(normGuideline(dev.rule))) problems.push('permit-does-not-cover-rule');
  }
  return { valid: problems.length === 0, problems };
}

/** Deviation scope: glob(s) over the file, optional line range and function. */
function deviationCovers(dev, issue) {
  const scopes = [].concat(dev.scope || '**');
  if (!scopes.some((s) => glob(issue.file, s))) return false;
  if (dev.lines && issue.line) {
    const [a, b] = dev.lines;
    if (issue.line < a || issue.line > (b || a)) return false;
  }
  if (dev.function && issue.function && dev.function !== issue.function) return false;
  return true;
}

/**
 * MISRA Compliance:2020 evaluation.
 * @param {object[]} issues analysis.issues
 * @param {object[]|Map} catalog rule catalog (rules with standards.misraC2012/... , misraCategory, decidable)
 * @param {object} plan
 * @param {'misraC2012'|'misraC2023'|'misraCpp2023'} plan.standard
 * @param {Record<string,string>} [plan.recategorization] guideline -> new category
 * @param {object[]} [plan.deviations] {id, rule, scope (glob|glob[]), lines?, function?, justification, approver, date, expires?, permit?}
 * @param {object[]} [plan.permits] {id, rules[], description}
 * @param {object[]} [plan.guidelines] full guideline list {id, category, decidable} (otherwise taken from the catalog)
 * @param {string[]} [plan.manualReview] guidelines enforced by manual review
 * @param {string[]} [plan.inactive] rule keys switched off in the profile
 * @param {{now?:number, lang?:string}} [opts]
 */
function misraCompliance(issues, catalog, plan = {}, opts = {}) {
  const stdId = plan.standard || 'misraC2012';
  const std = MISRA_STANDARDS[stdId];
  if (!std) throw new Error(`Unknown MISRA standard: ${stdId}`);
  const rules = ruleIndex(catalog);
  const inactive = new Set(plan.inactive || []);
  const now = opts.now || Date.now();
  const permits = plan.permits || [];

  // Guideline universe: the plan's list plus everything the catalog implements.
  const guidelines = new Map();
  for (const g of plan.guidelines || []) {
    const id = normGuideline(g.id);
    guidelines.set(id, { id, category: g.category || 'Required', decidable: g.decidable !== false, toolRules: [] });
  }
  for (const rule of rules.values()) {
    const ref = rule.standards && rule.standards[std.key];
    if (!ref) continue;
    const id = normGuideline(ref);
    const g = guidelines.get(id) || { id, category: rule.misraCategory || 'Required', decidable: rule.decidable !== false, toolRules: [] };
    if (!plan.guidelines && rule.misraCategory) g.category = rule.misraCategory;
    if (!inactive.has(rule.key)) g.toolRules.push(rule.key);
    guidelines.set(id, g);
  }

  // Recategorization plan (GRP).
  const recat = [];
  for (const [rawId, to] of Object.entries(plan.recategorization || {})) {
    const id = normGuideline(rawId);
    const g = guidelines.get(id);
    const from = g ? g.category : null;
    const ok = !!g && canRecategorize(from, to);
    recat.push({ guideline: id, from, to, applied: ok, reason: ok ? '' : (!g ? 'unknown-guideline' : 'downgrade-not-allowed') });
    if (ok) g.effective = to;
  }
  for (const g of guidelines.values()) if (!g.effective) g.effective = g.category;

  // Deviations.
  const deviations = (plan.deviations || []).map((d) => {
    const id = normGuideline(d.rule);
    const g = guidelines.get(id);
    const check = validateDeviation(d, g ? g.effective : null, permits, now);
    return { ...d, rule: id, valid: check.valid && !!g, problems: g ? check.problems : [...check.problems, 'unknown-guideline'], covers: 0 };
  });

  // Assign findings to guidelines.
  const findings = new Map();
  for (const issue of issues || []) {
    if (isClosed(issue) && issue.resolution !== 'WONTFIX') continue;
    const rule = rules.get(issue.rule);
    const ref = rule && rule.standards && rule.standards[std.key];
    if (!ref) continue;
    const id = normGuideline(ref);
    if (!guidelines.has(id)) continue;
    (findings.get(id) || findings.set(id, []).get(id)).push(issue);
  }

  const manual = new Set((plan.manualReview || []).map(normGuideline));
  const rows = [];
  for (const g of [...guidelines.values()].sort((a, b) => guidelineSort(a.id, b.id))) {
    const list = findings.get(g.id) || [];
    let violations = 0;
    let deviated = 0;
    const violationKeys = [];
    for (const issue of list) {
      const dev = deviations.find((d) => d.valid && d.rule === g.id && deviationCovers(d, issue));
      if (dev && g.effective !== 'Mandatory') { dev.covers += 1; deviated += 1; } else { violations += 1; if (issue.key) violationKeys.push(issue.key); }
    }
    const checked = g.toolRules.length > 0 || manual.has(g.id);
    let status;
    if (g.effective === 'Disapplied') status = 'Disapplied';
    else if (!checked) status = 'Not checked';
    else if (violations) status = 'Violations';
    else if (deviated) status = 'Deviations';
    else status = 'Compliant';
    rows.push({
      guideline: g.id, category: g.category, effectiveCategory: g.effective, decidable: g.decidable,
      status, violations, deviations: deviated, violationKeys: violationKeys.slice(0, 200),
      enforcement: g.toolRules.length ? (manual.has(g.id) ? 'Tool + manual review' : 'Tool') : (manual.has(g.id) ? 'Manual review' : 'None'),
      toolRules: g.toolRules,
    });
  }

  const blocking = rows.filter((r) => (r.effectiveCategory === 'Mandatory' || r.effectiveCategory === 'Required') && r.status === 'Violations');
  const unchecked = rows.filter((r) => (r.effectiveCategory === 'Mandatory' || r.effectiveCategory === 'Required') && r.status === 'Not checked');
  const invalidDeviations = deviations.filter((d) => !d.valid);
  const summary = {};
  for (const s of ['Compliant', 'Deviations', 'Violations', 'Disapplied', 'Not checked']) summary[s] = rows.filter((r) => r.status === s).length;
  const compliant = blocking.length === 0 && unchecked.length === 0;
  return {
    standard: stdId,
    title: std.title,
    framework: 'MISRA Compliance:2020',
    compliant,
    verdict: compliant ? 'Compliant' : 'Not compliant',
    reasons: [
      ...blocking.map((r) => ({ guideline: r.guideline, reason: 'violations', count: r.violations })),
      ...unchecked.map((r) => ({ guideline: r.guideline, reason: 'not-checked' })),
    ],
    summary,
    gcs: rows.map(({ guideline, category, effectiveCategory, status, violations, deviations: d }) => ({ guideline, category, effectiveCategory, status, violations, deviations: d })),
    gep: rows.map(({ guideline, effectiveCategory, decidable, enforcement, toolRules }) => ({ guideline, category: effectiveCategory, decidable, enforcement, toolRules })),
    grp: recat,
    guidelines: rows,
    deviations,
    invalidDeviations,
    permits,
    advisoryViolations: rows.filter((r) => r.effectiveCategory === 'Advisory' && r.status === 'Violations').reduce((n, r) => n + r.violations, 0),
  };
}

/** A starter compliance plan for a MISRA standard. */
function defaultMisraPlan(standard = 'misraC2012') {
  return { standard, recategorization: {}, deviations: [], permits: [], manualReview: [], guidelines: null };
}

module.exports = {
  CWE_TOP25_2023, CWE_TOP25_2024, CWE_NAMES, SANS_TOP25, OWASP_2017, OWASP_2021, ASVS_4, PCI_DSS_321, PCI_DSS_40,
  STIG_ASD_V5R3, STANDARDS, MISRA_STANDARDS, CATEGORIES, CAT_RANK,
  standardIds, categoriesFor, categoryReport, cweTop25Report, asvsReport, certReport, securityReports, report,
  canRecategorize, normGuideline, validateDeviation, deviationCovers, misraCompliance, defaultMisraPlan,
};
