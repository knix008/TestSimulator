'use strict';

// Rule catalog of the taint engine: one rule per vulnerability class.

const LANGS = ['js', 'ts', 'py', 'java', 'kt', 'cs', 'php', 'go', 'rb'];

// [vuln, key suffix, severity, cwe, owasp, cweTop25, Sonar rule, Coverity checker, name, why, fix]
const DEFS = [
  ['sqli', 'sqli', 'BLOCKER', 'CWE-89', 'A03', true, 'S3649', 'SQLI',
    { en: 'SQL queries should not be built from user-controlled data', ko: '사용자 입력으로 SQL 쿼리를 만들면 안 됩니다' },
    { en: 'Tainted data reaches a SQL statement. An attacker can change the query, read or delete data.', ko: '외부 입력이 SQL 문에 그대로 들어갑니다. 공격자가 쿼리를 바꿔 데이터를 읽거나 지울 수 있습니다.' },
    { en: 'Use parameterized queries or prepared statements with bound values.', ko: '매개변수화 쿼리나 바인딩한 prepared statement를 쓰세요.' }],
  ['nosqli', 'nosqli', 'CRITICAL', 'CWE-943', 'A03', false, 'S5147', 'NOSQL_QUERY_INJECTION',
    { en: 'NoSQL queries should not be built from user-controlled data', ko: '사용자 입력으로 NoSQL 쿼리를 만들면 안 됩니다' },
    { en: 'Request data reaches a document-database query. Objects such as {"$ne": null} or $where code change its meaning.', ko: '요청 데이터가 문서 DB 쿼리에 들어갑니다. {"$ne": null} 같은 객체나 $where 코드로 의미가 바뀝니다.' },
    { en: 'Cast values to strings, validate types, or sanitize operators before querying.', ko: '쿼리 전에 문자열로 바꾸거나 형식을 검증하고 연산자를 걸러 내세요.' }],
  ['cmdi', 'cmdi', 'BLOCKER', 'CWE-78', 'A03', true, 'S2076', 'OS_CMD_INJECTION',
    { en: 'OS commands should not be built from user-controlled data', ko: '사용자 입력으로 OS 명령을 만들면 안 됩니다' },
    { en: 'Tainted data reaches a shell or process launch. An attacker can run arbitrary commands.', ko: '외부 입력이 셸이나 프로세스 실행에 들어갑니다. 공격자가 임의 명령을 실행할 수 있습니다.' },
    { en: 'Avoid the shell, pass arguments as a list and validate them against an allowlist.', ko: '셸을 쓰지 말고 인자를 목록으로 넘기며 허용 목록으로 검증하세요.' }],
  ['code', 'code', 'BLOCKER', 'CWE-94', 'A03', true, 'S5334', 'CODE_INJECTION',
    { en: 'Dynamic code execution should not use user-controlled data', ko: '사용자 입력으로 코드를 동적으로 실행하면 안 됩니다' },
    { en: 'Tainted data is evaluated as code (eval, Function, exec, script engines, dynamic require).', ko: '외부 입력이 코드로 실행됩니다 (eval, Function, exec, 스크립트 엔진, 동적 require).' },
    { en: 'Never evaluate input. Map input to a fixed set of operations instead.', ko: '입력을 실행하지 마세요. 정해진 동작 목록에 대응시키세요.' }],
  ['path', 'path', 'CRITICAL', 'CWE-22', 'A01', true, 'S2083', 'PATH_MANIPULATION',
    { en: 'File paths should not be built from user-controlled data', ko: '사용자 입력으로 파일 경로를 만들면 안 됩니다' },
    { en: 'Tainted data reaches a file-system call. "../" sequences can read or overwrite files outside the intended folder.', ko: '외부 입력이 파일 시스템 호출에 들어갑니다. "../"로 의도한 폴더 밖 파일을 읽거나 덮어쓸 수 있습니다.' },
    { en: 'Normalize the path and check it stays inside the base folder, or keep only the file name.', ko: '경로를 정규화하고 기준 폴더 안인지 확인하거나 파일 이름만 쓰세요.' }],
  ['xss', 'xss', 'CRITICAL', 'CWE-79', 'A03', true, 'S5131', 'XSS',
    { en: 'HTML output should not contain unescaped user-controlled data', ko: '이스케이프하지 않은 사용자 입력을 HTML로 내보내면 안 됩니다' },
    { en: 'Tainted data is written into an HTML response or the DOM. An attacker can run script in the victim\'s browser.', ko: '외부 입력이 HTML 응답이나 DOM에 들어갑니다. 공격자가 피해자 브라우저에서 스크립트를 실행할 수 있습니다.' },
    { en: 'Escape for the output context, use textContent or a template engine with auto-escaping.', ko: '출력 위치에 맞게 이스케이프하거나 textContent, 자동 이스케이프 템플릿을 쓰세요.' }],
  ['ssrf', 'ssrf', 'CRITICAL', 'CWE-918', 'A10', true, 'S5144', 'SSRF',
    { en: 'Server-side requests should not use user-controlled URLs', ko: '사용자 입력 URL로 서버 측 요청을 보내면 안 됩니다' },
    { en: 'Tainted data chooses the target of an outgoing request. An attacker can reach internal services or cloud metadata.', ko: '외부 입력이 나가는 요청의 대상을 정합니다. 공격자가 내부 서비스나 클라우드 메타데이터에 접근할 수 있습니다.' },
    { en: 'Allow only known hosts and schemes; never forward raw URLs from the request.', ko: '알려진 호스트와 스킴만 허용하고 요청의 URL을 그대로 쓰지 마세요.' }],
  ['redirect', 'redirect', 'CRITICAL', 'CWE-601', 'A01', false, 'S5146', 'OPEN_REDIRECT',
    { en: 'Redirects should not use user-controlled URLs', ko: '사용자 입력 URL로 리다이렉트하면 안 됩니다' },
    { en: 'Tainted data chooses a redirect target. Attackers use it for phishing through a trusted domain.', ko: '외부 입력이 리다이렉트 대상을 정합니다. 신뢰받는 도메인을 거친 피싱에 쓰입니다.' },
    { en: 'Redirect only to relative paths or to an allowlist of hosts.', ko: '상대 경로나 허용된 호스트로만 리다이렉트하세요.' }],
  ['ldap', 'ldap', 'CRITICAL', 'CWE-90', 'A03', false, 'S2078', 'LDAP_INJECTION',
    { en: 'LDAP queries should not be built from user-controlled data', ko: '사용자 입력으로 LDAP 쿼리를 만들면 안 됩니다' },
    { en: 'Tainted data reaches an LDAP filter or DN. Characters like * ( ) | change the query.', ko: '외부 입력이 LDAP 필터나 DN에 들어갑니다. * ( ) | 같은 문자로 쿼리가 바뀝니다.' },
    { en: 'Escape filter values with the LDAP encoder of your library.', ko: '라이브러리의 LDAP 인코더로 필터 값을 이스케이프하세요.' }],
  ['xpath', 'xpath', 'CRITICAL', 'CWE-643', 'A03', false, 'S2091', 'XPATH_INJECTION',
    { en: 'XPath expressions should not be built from user-controlled data', ko: '사용자 입력으로 XPath 식을 만들면 안 됩니다' },
    { en: 'Tainted data reaches an XPath expression and can select other nodes.', ko: '외부 입력이 XPath 식에 들어가 다른 노드를 고를 수 있습니다.' },
    { en: 'Use XPath variables or escape the value.', ko: 'XPath 변수를 쓰거나 값을 이스케이프하세요.' }],
  ['xxe', 'xxe', 'CRITICAL', 'CWE-611', 'A05', false, 'S2755', 'XML_EXTERNAL_ENTITY',
    { en: 'XML parsers that resolve external entities should not parse user-controlled data', ko: '외부 엔티티를 해석하는 XML 파서로 사용자 입력을 파싱하면 안 됩니다' },
    { en: 'Tainted XML is parsed with DTDs or entity expansion enabled. It can read local files or reach internal hosts.', ko: 'DTD나 엔티티 확장을 켠 채 외부 XML을 파싱합니다. 로컬 파일을 읽거나 내부 호스트에 접근할 수 있습니다.' },
    { en: 'Disable DOCTYPE declarations and external entities, or use a hardened parser (defusedxml).', ko: 'DOCTYPE과 외부 엔티티를 끄거나 강화된 파서(defusedxml)를 쓰세요.' }],
  ['deser', 'deser', 'CRITICAL', 'CWE-502', 'A08', true, 'S5135', 'UNSAFE_DESERIALIZATION',
    { en: 'User-controlled data should not be deserialized into objects', ko: '사용자 입력을 객체로 역직렬화하면 안 됩니다' },
    { en: 'Tainted bytes reach a native deserializer (pickle, ObjectInputStream, BinaryFormatter, unserialize, Marshal).', ko: '외부 데이터가 네이티브 역직렬화기(pickle, ObjectInputStream, BinaryFormatter, unserialize, Marshal)에 들어갑니다.' },
    { en: 'Use a data-only format such as JSON, or restrict allowed classes.', ko: 'JSON 같은 데이터 전용 형식을 쓰거나 허용 클래스를 제한하세요.' }],
  ['log', 'log', 'MINOR', 'CWE-117', 'A09', false, 'S5145', 'LOG_INJECTION',
    { en: 'Log messages should not contain raw user-controlled data', ko: '로그에 사용자 입력을 그대로 쓰면 안 됩니다' },
    { en: 'Tainted data is logged unchanged. Line breaks let an attacker forge log entries.', ko: '외부 입력을 그대로 로그에 씁니다. 줄바꿈으로 가짜 로그를 만들 수 있습니다.' },
    { en: 'Strip CR/LF or encode the value before logging.', ko: '로그 전에 CR/LF를 지우거나 인코딩하세요.' }],
  ['header', 'header', 'MAJOR', 'CWE-113', 'A03', false, 'S5167', 'HEADER_INJECTION',
    { en: 'HTTP headers should not contain raw user-controlled data', ko: 'HTTP 헤더에 사용자 입력을 그대로 넣으면 안 됩니다' },
    { en: 'Tainted data is written into a response header or cookie. CR/LF splits the response.', ko: '외부 입력이 응답 헤더나 쿠키에 들어갑니다. CR/LF로 응답을 나눌 수 있습니다.' },
    { en: 'Reject or strip CR/LF, or URL-encode the value.', ko: 'CR/LF를 거부하거나 지우고, 아니면 URL 인코딩하세요.' }],
  ['regex', 'regex', 'MAJOR', 'CWE-1333', 'A03', false, 'S2631', 'REGEX_INJECTION',
    { en: 'Regular expressions should not be built from user-controlled data', ko: '사용자 입력으로 정규식을 만들면 안 됩니다' },
    { en: 'A tainted pattern can cause catastrophic backtracking (ReDoS) or match more than intended.', ko: '외부 입력 패턴은 과도한 백트래킹(ReDoS)을 일으키거나 의도보다 많이 일치할 수 있습니다.' },
    { en: 'Escape the input (re.escape, Pattern.quote, escapeRegExp) before compiling.', ko: '컴파일 전에 입력을 이스케이프하세요 (re.escape, Pattern.quote, escapeRegExp).' }],
  ['ssti', 'ssti', 'CRITICAL', 'CWE-1336', 'A03', false, 'S5496', 'TEMPLATE_INJECTION',
    { en: 'Templates should not be compiled from user-controlled data', ko: '사용자 입력으로 템플릿을 컴파일하면 안 됩니다' },
    { en: 'Tainted data is used as template source. Template expressions can run code on the server.', ko: '외부 입력이 템플릿 원본으로 쓰입니다. 템플릿 식으로 서버에서 코드를 실행할 수 있습니다.' },
    { en: 'Keep templates static and pass input only as template variables.', ko: '템플릿은 고정하고 입력은 템플릿 변수로만 넘기세요.' }],
  ['reflection', 'reflection', 'CRITICAL', 'CWE-470', 'A03', false, 'S6173', 'UNSAFE_REFLECTION',
    { en: 'Reflection should not use user-controlled class or method names', ko: '사용자 입력으로 클래스나 메서드를 리플렉션하면 안 됩니다' },
    { en: 'Tainted data selects a class, module or method to load or call.', ko: '외부 입력이 불러오거나 호출할 클래스, 모듈, 메서드를 고릅니다.' },
    { en: 'Map input to an allowlist of known names.', ko: '입력을 정해진 이름 목록에 대응시키세요.' }],
  ['proto', 'proto', 'CRITICAL', 'CWE-1321', 'A08', false, 'S6230', 'PROTOTYPE_POLLUTION',
    { en: 'Object keys from user input should not reach recursive property writes', ko: '사용자 입력 키로 객체 속성을 재귀적으로 쓰면 안 됩니다' },
    { en: 'A tainted key such as "__proto__" or "constructor" modifies Object.prototype for the whole process.', ko: '"__proto__"나 "constructor" 같은 외부 키가 프로세스 전체의 Object.prototype을 바꿉니다.' },
    { en: 'Reject __proto__/constructor/prototype keys, use Map or Object.create(null).', ko: '__proto__/constructor/prototype 키를 거부하고 Map이나 Object.create(null)을 쓰세요.' }],
];

function catalog(langsByVuln) {
  return DEFS.map(([vuln, id, severity, cwe, owasp, top25, sonar, checker, name, why, fix]) => {
    const langs = (langsByVuln && langsByVuln[vuln] && langsByVuln[vuln].length) ? langsByVuln[vuln] : LANGS;
    const tags = ['taint', 'injection', 'security', cwe.toLowerCase(), 'owasp-' + owasp.toLowerCase()];
    if (top25) tags.push('cwe-top25');
    return {
      key: 'taint:' + id,
      langs,
      type: 'VULNERABILITY',
      severity,
      debtMin: severity === 'MINOR' ? 10 : 30,
      tags,
      name, why, fix,
      category: 'Security',
      checker,
      cwe,
      cert: '',
      sonar: sonar,
      standards: { cwe: [cwe], owasp2021: [owasp], cweTop25: top25 },
      vuln,
    };
  });
}

const VULNS = DEFS.map((d) => d[0]);
const KEY_OF = Object.fromEntries(DEFS.map((d) => [d[0], 'taint:' + d[1]]));
const NAME_OF = Object.fromEntries(DEFS.map((d) => [d[0], d[8]]));

module.exports = { catalog, VULNS, KEY_OF, NAME_OF, LANGS };
