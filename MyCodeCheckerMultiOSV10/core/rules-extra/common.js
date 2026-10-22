'use strict';

// Rules shared by several programming languages. C and C++ are left out on
// purpose (their catalog lives elsewhere). 'java' also covers Kotlin and
// Groovy, and 'js' also covers TypeScript (languages.ruleLangsFor).

const { maker, blankStrings } = require('./util');

const CODE = ['js', 'py', 'java', 'cs', 'go', 'rs', 'php', 'rb'];
const R = maker('common', CODE);

const LOOPBACK_OR_DOC = /^(?:127\.|0\.0\.0\.0$|255\.255\.255\.255$|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|169\.254\.169\.254$)/;

R('hardcoded-ip', 'H', 'MI', 5, ['cwe-547'],
  /['"`](?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:\/[^'"`\s]*)?['"`]/,
  ['Hard-coded IP address', 'Fixed addresses break when the network changes and reveal internal topology.', 'Read the address from configuration or use a host name.'],
  ['하드코딩된 IP 주소입니다', '고정 주소는 네트워크가 바뀌면 깨지고 내부 구성을 드러냅니다.', '설정에서 주소를 읽거나 호스트 이름을 쓰세요.'],
  'const db = "10.20.30.40";', ['const db = config.dbHost;', 'const local = "127.0.0.1";', 'const version = "1.2.3.4";', 'const doc = "192.0.2.10";', "  '6.2.4.1': { title: 'Injection' },"],
  {
    skip: (raw) => {
      const m = /['"`]((?:\d{1,3}\.){3}\d{1,3})/.exec(raw);
      if (!m) return true;
      const octets = m[1].split('.').map(Number);
      if (octets.some((o) => o > 255)) return true;
      // Section and version numbers such as '6.2.4.1' are all single digits.
      if (octets.every((o) => o < 10)) return true;
      if (LOOPBACK_OR_DOC.test(m[1])) return true;
      return /\b(?:version|ver|semver|release|build|oid|useragent|user_agent|assemblyversion|fileversion)\b/i.test(raw);
    },
  });
R('cleartext-protocol', 'H', 'MA', 10, ['cwe-319', 'owasp-a02'],
  /['"`](?:ftp|telnet|ldap|smtp|imap|pop3|mqtt|nntp|gopher|tftp):\/\/(?!localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)/i,
  ['Clear-text protocol URL', 'FTP, Telnet, LDAP, SMTP and similar URLs send data and credentials unencrypted.', 'Use the TLS variant: ftps, ldaps, smtps, imaps, mqtts or SSH.'],
  ['평문 프로토콜 URL입니다', 'FTP, Telnet, LDAP, SMTP 같은 URL은 데이터와 자격 증명을 암호화하지 않고 보냅니다.', 'TLS 판을 쓰세요: ftps, ldaps, smtps, imaps, mqtts, SSH.'],
  'url = "ftp://files.example.com/drop"', ['url = "sftp://files.example.com/drop"', 'url = "ldaps://dc.example.com"']);
R('cleartext-http', 'H', 'MI', 5, ['cwe-319', 'owasp-a02'],
  /['"`]http:\/\/(?!localhost\b|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|(?:[\w-]+\.)*(?:example\.(?:com|org|net)|w3\.org|xmlsoap\.org|apache\.org|json-schema\.org|purl\.org|xml\.org|openxmlformats\.org|springframework\.org|java\.sun\.com|jcp\.org|android\.com)\b|schemas\.|xmlns\.|javax\.xml\.)/,
  ['URL over plain HTTP', 'Requests to this URL can be read and changed on the network.', 'Use https.'],
  ['평문 HTTP URL입니다', '이 URL로 가는 요청은 네트워크에서 읽히고 바뀔 수 있습니다.', 'https를 쓰세요.'],
  'API = "http://api.payments.io/v1"', ['API = "https://api.payments.io/v1"', 'NS = "http://www.w3.org/2001/XMLSchema"', 'f.setFeature("http://xml.org/sax/features/external-general-entities", false);'],
  { langs: ['py', 'java', 'cs', 'go', 'rs', 'php', 'rb'], lang: 'py' });
R('tmp-path', 'H', 'MI', 5, ['cwe-377', 'owasp-a01'],
  /['"`]\/tmp\/[\w.-]/,
  ['Fixed path in /tmp', 'Another local user can create or link the file first.', 'Create temporary files with the platform API (mkstemp, createTempFile, os.CreateTemp).'],
  ['/tmp의 고정 경로입니다', '다른 로컬 사용자가 먼저 파일을 만들거나 링크할 수 있습니다.', '플랫폼 API로 임시 파일을 만드세요(mkstemp, createTempFile, os.CreateTemp).'],
  'const out = "/tmp/report.csv";', 'const out = path.join(os.tmpdir(), randomName());');

// A group made only of character-class atoms, at least one of them repeated,
// and repeated again: (a+)+, (\w+\s?)*, ([a-z]*)+, (.*)*
const ATOM = String.raw`(?:\\[wWdDsS.]|\.|\[(?:[^\]\\]|\\.)*\]|[A-Za-z0-9])`;
const NESTED = new RegExp(String.raw`\((?:\?:)?(?=[^)]*[+*])(?:${ATOM}[+*?]?){1,6}\)(?:[+*]|\{\d+,\d*\})`);
R('regex-nested-quantifier', 'H', 'MA', 10, ['cwe-1333', 'redos'],
  new RegExp(String.raw`['"\x60/].*?${NESTED.source}`),
  ['Regular expression with nested quantifiers', 'Patterns like (a+)+ backtrack exponentially on crafted input (ReDoS).', 'Remove the nested quantifier, use atomic groups or a linear-time engine.'],
  ['중첩 수량자가 있는 정규식입니다', '(a+)+ 같은 패턴은 조작된 입력에서 지수적으로 역추적합니다(ReDoS).', '중첩 수량자를 없애거나 원자 그룹, 선형 시간 엔진을 쓰세요.'],
  ['const re = /^(\\w+\\s?)*$/;', 're = re.compile(r"^(a+)+$")'],
  ['const re = /^\\w+(\\s\\w+)?$/;', 'x = (i++)*2;', 'const m = /^\\s*(?:unsigned\\s+|static\\s+)*(int|char)\\s+/;']);
R('long-line', 'S', 'IN', 2, ['convention'],
  /^.{251,}$/,
  ['Line longer than 250 characters', 'Very long lines are hard to read and review side by side.', 'Break the line.'],
  ['250자보다 긴 줄입니다', '아주 긴 줄은 읽기 어렵고 나란히 검토하기 힘듭니다.', '줄을 나누세요.'],
  'const x = ' + '1 + '.repeat(70) + '1;', ['const x = 1 + 2;', 'const data = "' + 'a'.repeat(300) + '";'],
  { langs: [...CODE, 'sh', 'ps1', 'sql', 'tf'], skip: (raw, line) => blankStrings(line).replace(/(['"\x60]) +\1/g, '""').length <= 250 });
R('bidi-control-character', 'V', 'CR', 15, ['cwe-1007', 'trojan-source'],
  /[\u202A-\u202E\u2066-\u2069]/,
  ['Unicode bidirectional control character', 'Bidi controls make code display differently from how it compiles (Trojan Source).', 'Remove the control character, or escape it inside strings.'],
  ['유니코드 양방향 제어 문자입니다', '양방향 제어 문자는 코드가 컴파일되는 것과 다르게 보이게 합니다(Trojan Source).', '제어 문자를 지우거나 문자열 안에서는 이스케이프하세요.'],
  'if (isAdmin) { /* \u202E } \u2066 if (isAdmin) \u2069 \u2066 begin admins only */', 'if (isAdmin) { grant(); }',
  { scope: 'any', langs: ['*'] });
R('invisible-character', 'B', 'MA', 5, ['cwe-1007'],
  /(?<=[\w$])[\u200B-\u200D\u2060\uFEFF](?=[\w$])/,
  ['Invisible character inside a name', 'Zero-width characters make two identifiers look equal when they are not.', 'Delete the invisible character.'],
  ['이름 안에 보이지 않는 문자가 있습니다', '폭 없는 문자는 서로 다른 두 식별자를 같아 보이게 합니다.', '보이지 않는 문자를 지우세요.'],
  'const user\u200BName = 1;', ['const userName = 1;', '\uFEFFconst first = 1;', "const s = text.replace(/^\uFEFF/, '');"],
  { langs: [...CODE, 'sh', 'ps1', 'sql', 'yaml', 'json', 'tf', 'docker'] });

module.exports = { RULES: R.rules };
