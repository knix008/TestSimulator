// Abbreviations shown in the GUI and what they stand for. The tooltip host
// (components/TermTip.jsx) finds them in the text under the pointer and adds
// their meaning: a label with no help of its own shows just these, one with
// help shows them under it. Keys are matched as whole words (case as written).
// [full name, explanation] per language.

export const ABBREVIATIONS = {
  AI: { ko: ['인공지능 (Artificial Intelligence)', 'AI 코드 수정은 연결한 언어 모델이 이슈를 고치는 코드를 제안합니다.'], en: ['Artificial Intelligence', 'AI CodeFix asks the connected language model for code that fixes an issue.'] },
  ALM: { ko: ['애플리케이션 수명주기 관리 (Application Lifecycle Management)', '코드 호스트(GitHub, GitLab 등)와 연결해 풀 리퀘스트에 분석 결과를 남기는 기능입니다.'], en: ['Application Lifecycle Management', 'The link to a code host (GitHub, GitLab …) that posts analysis results on pull requests.'] },
  API: { ko: ['응용 프로그램 인터페이스 (Application Programming Interface)', '다른 프로그램이 이 서비스에 요청을 보내는 방법입니다.'], en: ['Application Programming Interface', 'How other programs send requests to this service.'] },
  ASD: { ko: ['응용 프로그램 보안 및 개발 (Application Security and Development)', '미 국방정보체계국(DISA)이 낸 응용 프로그램 보안 점검 기준(STIG)의 이름입니다.'], en: ['Application Security and Development', 'The DISA STIG for application security and development.'] },
  ASVS: { ko: ['응용 프로그램 보안 검증 표준 (Application Security Verification Standard)', 'OWASP가 낸 웹 응용 프로그램 보안 요구 사항 목록입니다. L1~L3은 검증 수준입니다.'], en: ['Application Security Verification Standard', 'OWASP\'s list of web application security requirements; L1 to L3 are verification levels.'] },
  AST: { ko: ['추상 구문 트리 (Abstract Syntax Tree)', '소스 코드를 구조로 나타낸 나무 모양 자료입니다. 규칙은 이 트리를 보고 검사합니다.'], en: ['Abstract Syntax Tree', 'The source code as a tree of its structure, which the rules inspect.'] },
  AUTOSAR: { ko: ['자동차 개방형 시스템 아키텍처 (AUTomotive Open System ARchitecture)', '차량 소프트웨어 표준입니다. AUTOSAR C++14는 그 C++ 코딩 지침입니다.'], en: ['AUTomotive Open System ARchitecture', 'A vehicle software standard; AUTOSAR C++14 is its C++ coding guideline.'] },
  CERT: { ko: ['CERT 보안 코딩 표준', '카네기멜런 대학교 SEI의 CERT가 만든 C · C++ · Java 보안 코딩 규칙입니다.'], en: ['CERT secure coding standards', 'Secure coding rules for C, C++ and Java by CERT at Carnegie Mellon\'s SEI.'] },
  CI: { ko: ['지속적 통합 (Continuous Integration)', '코드가 바뀔 때마다 자동으로 빌드 · 검사하는 서버(Jenkins, GitHub Actions 등)입니다.'], en: ['Continuous Integration', 'A server that builds and checks the code on every change (Jenkins, GitHub Actions …).'] },
  CID: { ko: ['결함 식별자 (Change/Defect ID)', '정밀 결함 분석에서 같은 결함을 분석이 바뀌어도 이어서 알아보는 번호입니다.'], en: ['Defect identifier', 'The number that keeps identifying the same defect across analyses in Defect Analysis.'] },
  CIDR: { ko: ['클래스 없는 도메인 간 라우팅 표기 (Classless Inter-Domain Routing)', 'IP 주소 범위를 192.168.0.0/16처럼 적는 방법입니다.'], en: ['Classless Inter-Domain Routing', 'Writing an IP address range as 192.168.0.0/16.'] },
  CPU: { ko: ['중앙 처리 장치 (Central Processing Unit)', '이 PC의 프로세서입니다. 코어가 많을수록 병렬 분석이 빠릅니다.'], en: ['Central Processing Unit', 'This computer\'s processor; more cores make the parallel analysis faster.'] },
  CSV: { ko: ['쉼표로 구분한 값 (Comma-Separated Values)', '표를 쉼표로 나눈 텍스트 파일입니다. 엑셀에서 열 수 있습니다.'], en: ['Comma-Separated Values', 'A table as text with commas between the cells; opens in spreadsheets.'] },
  CVE: { ko: ['공개 취약점 목록 (Common Vulnerabilities and Exposures)', '알려진 보안 취약점마다 붙는 번호(CVE-2024-12345 같은)입니다.'], en: ['Common Vulnerabilities and Exposures', 'The number given to each known security vulnerability (such as CVE-2024-12345).'] },
  CWE: { ko: ['공통 약점 목록 (Common Weakness Enumeration)', '소프트웨어 보안 약점의 종류를 번호로 정리한 목록입니다(CWE-79는 XSS 등). CWE Top 25는 가장 위험한 25가지입니다.'], en: ['Common Weakness Enumeration', 'A numbered list of kinds of software weaknesses (CWE-79 is XSS …); CWE Top 25 are the most dangerous 25.'] },
  DAST: { ko: ['동적 응용 프로그램 보안 테스트 (Dynamic Application Security Testing)', '실행 중인 웹 앱에 요청을 보내 취약점을 찾는 검사입니다.'], en: ['Dynamic Application Security Testing', 'Testing a running web app by sending it requests to find vulnerabilities.'] },
  DB: { ko: ['데이터베이스 (Database)', '분석 결과를 표로 저장하는 곳입니다(MySQL, SQLite3, MariaDB, PostgreSQL, MSSQL).'], en: ['Database', 'Where analysis results are saved as tables (MySQL, SQLite3, MariaDB, PostgreSQL, MSSQL).'] },
  DISA: { ko: ['미 국방정보체계국 (Defense Information Systems Agency)', '미 국방부 정보 시스템의 보안 점검 기준(STIG)을 냅니다.'], en: ['Defense Information Systems Agency', 'The US agency that publishes the STIG security checklists.'] },
  DN: { ko: ['식별 이름 (Distinguished Name)', 'LDAP 디렉터리에서 항목의 전체 경로입니다(cn=관리자,dc=example,dc=com 같은).'], en: ['Distinguished Name', 'An entry\'s full path in an LDAP directory (such as cn=admin,dc=example,dc=com).'] },
  DSS: { ko: ['데이터 보안 표준 (Data Security Standard)', 'PCI DSS는 신용카드 정보를 다루는 시스템의 보안 표준입니다.'], en: ['Data Security Standard', 'PCI DSS is the security standard for systems that handle card data.'] },
  GB: { ko: ['기가바이트 (Gigabyte)', '메모리나 파일 크기의 단위로, 약 10억 바이트입니다.'], en: ['Gigabyte', 'A unit of memory or file size, about a billion bytes.'] },
  GCS: { ko: ['지침 준수 요약 (Guideline Compliance Summary)', 'MISRA Compliance 방식의 지침별 준수 · 위반 · 편차 요약입니다.'], en: ['Guideline Compliance Summary', 'The MISRA Compliance summary of each guideline: compliant, violated, deviated.'] },
  GHSA: { ko: ['GitHub 보안 권고 (GitHub Security Advisory)', 'GitHub가 공개한 취약점 권고 번호입니다(GHSA-xxxx-xxxx-xxxx).'], en: ['GitHub Security Advisory', 'An advisory id published by GitHub (GHSA-xxxx-xxxx-xxxx).'] },
  GRP: { ko: ['지침 재분류 계획 (Guideline Re-categorization Plan)', 'MISRA 지침의 등급(필수 · 요구 · 권고)을 프로젝트에 맞게 바꾼 계획입니다.'], en: ['Guideline Re-categorization Plan', 'The project\'s change of MISRA guideline categories (mandatory, required, advisory).'] },
  HIS: { ko: ['자동차 제조사 소프트웨어 이니셔티브 (Herstellerinitiative Software)', '독일 자동차 제조사들이 정한 소프트웨어 품질 지표(복잡도, 경로 수 등)와 한계값입니다.'], en: ['Herstellerinitiative Software', 'Software quality metrics and limits (complexity, paths …) agreed by German car makers.'] },
  HMAC: { ko: ['해시 기반 메시지 인증 코드 (Hash-based Message Authentication Code)', '웹훅 요청이 정말 이 서비스에서 왔는지 공유한 비밀값으로 확인하는 서명입니다.'], en: ['Hash-based Message Authentication Code', 'A signature with a shared secret that proves a webhook request came from this service.'] },
  HTML: { ko: ['하이퍼텍스트 마크업 언어 (HyperText Markup Language)', '웹 페이지 형식입니다. 브라우저에서 열 수 있는 보고서로 저장합니다.'], en: ['HyperText Markup Language', 'The web page format; reports saved this way open in a browser.'] },
  HTTP: { ko: ['하이퍼텍스트 전송 규약 (HyperText Transfer Protocol)', '웹 요청을 주고받는 규약입니다(GET, POST 등).'], en: ['HyperText Transfer Protocol', 'The protocol of web requests (GET, POST …).'] },
  IaC: { ko: ['코드형 인프라 (Infrastructure as Code)', '서버 · 컨테이너 설정을 파일로 관리하는 방식(Dockerfile, Kubernetes, Terraform)과 그 설정의 보안 점검입니다.'], en: ['Infrastructure as Code', 'Servers and containers described in files (Dockerfile, Kubernetes, Terraform), and the security checks of those files.'] },
  ID: { ko: ['식별자 (Identifier)', '항목을 구별하는 고유한 이름이나 번호입니다.'], en: ['Identifier', 'The unique name or number of an item.'] },
  IID: { ko: ['내부 번호 (Internal ID)', 'GitLab에서 프로젝트 안의 머지 리퀘스트 번호(!12의 12)입니다.'], en: ['Internal ID', 'A merge request\'s number within a GitLab project (the 12 of !12).'] },
  ILP32: { ko: ['ILP32 데이터 모델', 'int · long · 포인터가 모두 32비트인 32비트 플랫폼의 데이터 모델입니다. C/C++ 분석에서 타입 크기를 정합니다.'], en: ['ILP32 data model', 'int, long and pointers are all 32-bit (32-bit platforms); sets the type sizes for the C/C++ analysis.'] },
  JSON: { ko: ['자바스크립트 객체 표기 (JavaScript Object Notation)', '데이터를 이름과 값으로 적는 텍스트 형식입니다.'], en: ['JavaScript Object Notation', 'A text format of names and values.'] },
  JS: { ko: ['자바스크립트 (JavaScript)', '웹과 Node.js에서 쓰는 프로그래밍 언어입니다.'], en: ['JavaScript', 'The programming language of the web and Node.js.'] },
  KISA: { ko: ['한국인터넷진흥원 (Korea Internet & Security Agency)', '소프트웨어 보안 약점 진단 가이드 등을 내는 기관입니다.'], en: ['Korea Internet & Security Agency', 'Publishes guides such as the software security weakness diagnosis guide.'] },
  LDAP: { ko: ['경량 디렉터리 접근 규약 (Lightweight Directory Access Protocol)', '회사 계정 디렉터리(Active Directory 등)로 로그인하게 하는 규약입니다.'], en: ['Lightweight Directory Access Protocol', 'Lets users sign in with the company directory (Active Directory …).'] },
  LLP64: { ko: ['LLP64 데이터 모델', 'int · long은 32비트, long long과 포인터는 64비트입니다(64비트 Windows). C/C++ 분석에서 타입 크기를 정합니다.'], en: ['LLP64 data model', 'int and long are 32-bit, long long and pointers 64-bit (64-bit Windows); sets the type sizes for the C/C++ analysis.'] },
  LP64: { ko: ['LP64 데이터 모델', 'int는 32비트, long과 포인터는 64비트입니다(64비트 Linux · macOS). C/C++ 분석에서 타입 크기(오버플로 · 형 변환 검사)를 정합니다.'], en: ['LP64 data model', 'int is 32-bit, long and pointers 64-bit (64-bit Linux and macOS); sets the type sizes (overflow and conversion checks) for the C/C++ analysis.'] },
  MD5: { ko: ['메시지 다이제스트 5 (Message Digest 5)', '오래된 해시 함수입니다. 충돌이 쉬워 보안 용도로는 쓰면 안 됩니다.'], en: ['Message Digest 5', 'An old hash function; collisions are easy, so it must not be used for security.'] },
  MISRA: { ko: ['자동차 산업 소프트웨어 신뢰성 협회 (Motor Industry Software Reliability Association)', '안전이 중요한 C · C++ 코드의 코딩 지침입니다(MISRA C:2012/2023, MISRA C++:2023 등).'], en: ['Motor Industry Software Reliability Association', 'Coding guidelines for safety-critical C and C++ (MISRA C:2012/2023, MISRA C++:2023 …).'] },
  MOIS: { ko: ['행정안전부 (Ministry of the Interior and Safety)', '한국 행안부의 소프트웨어 보안 약점 기준(49개 항목)입니다.'], en: ['Ministry of the Interior and Safety (Korea)', 'Korea\'s software security weakness criteria (49 items).'] },
  MR: { ko: ['머지 리퀘스트 (Merge Request)', 'GitLab에서 풀 리퀘스트를 부르는 이름입니다.'], en: ['Merge Request', 'GitLab\'s name for a pull request.'] },
  MSSQL: { ko: ['Microsoft SQL Server', 'Microsoft의 데이터베이스 서버입니다.'], en: ['Microsoft SQL Server', 'Microsoft\'s database server.'] },
  OSV: { ko: ['오픈 소스 취약점 (Open Source Vulnerabilities)', '오픈 소스 패키지의 알려진 취약점 데이터베이스(osv.dev)입니다. 의존성 분석이 씁니다.'], en: ['Open Source Vulnerabilities', 'The database of known vulnerabilities in open-source packages (osv.dev), used by the dependency analysis.'] },
  OWASP: { ko: ['오픈 웹 애플리케이션 보안 프로젝트 (Open Worldwide Application Security Project)', '웹 보안 단체입니다. OWASP Top 10은 가장 흔한 웹 보안 위험 10가지입니다.'], en: ['Open Worldwide Application Security Project', 'A web security community; the OWASP Top 10 are the ten most common web security risks.'] },
  PAT: { ko: ['개인 액세스 토큰 (Personal Access Token)', '코드 호스트(GitHub 등)에 비밀번호 대신 쓰는 접근용 토큰입니다.'], en: ['Personal Access Token', 'A token used instead of a password to reach a code host (GitHub …).'] },
  PC: { ko: ['개인용 컴퓨터 (Personal Computer)', '이 프로그램이 실행 중인 컴퓨터입니다.'], en: ['Personal Computer', 'The computer this program runs on.'] },
  PCI: { ko: ['지불 카드 산업 (Payment Card Industry)', 'PCI DSS는 신용카드 정보를 다루는 시스템의 보안 표준입니다.'], en: ['Payment Card Industry', 'PCI DSS is the security standard for systems that handle card data.'] },
  PDF: { ko: ['이식 가능 문서 형식 (Portable Document Format)', '어디서나 같은 모양으로 열리는 문서 파일입니다.'], en: ['Portable Document Format', 'A document file that looks the same everywhere.'] },
  PMD: { ko: ['PMD (Java 정적 분석 도구)', '외부 도구 결과 가져오기에서 읽을 수 있는 Java 코드 검사 도구입니다.'], en: ['PMD (a Java static analyzer)', 'A Java code checker whose results can be imported.'] },
  PNG: { ko: ['포터블 네트워크 그래픽 (Portable Network Graphics)', '손실 없는 그림 파일 형식입니다.'], en: ['Portable Network Graphics', 'A lossless picture file format.'] },
  PR: { ko: ['풀 리퀘스트 (Pull Request)', '바뀐 코드를 합치기 전에 검토를 요청하는 단위입니다. PR 분석은 그 변경만 봅니다.'], en: ['Pull Request', 'A request to review changes before they are merged; PR analysis looks at those changes only.'] },
  REST: { ko: ['표현 상태 전송 (Representational State Transfer)', 'HTTP로 자원을 주고받는 웹 API 방식입니다.'], en: ['Representational State Transfer', 'A style of web API over HTTP.'] },
  SANS: { ko: ['SANS 연구소', '보안 교육 기관입니다. CWE/SANS Top 25는 가장 위험한 소프트웨어 약점 목록입니다.'], en: ['SANS Institute', 'A security training institute; CWE/SANS Top 25 lists the most dangerous software weaknesses.'] },
  SARIF: { ko: ['정적 분석 결과 교환 형식 (Static Analysis Results Interchange Format)', '여러 분석 도구의 결과를 담는 표준 JSON 형식입니다.'], en: ['Static Analysis Results Interchange Format', 'The standard JSON format for static analysis results.'] },
  SBOM: { ko: ['소프트웨어 자재 명세서 (Software Bill of Materials)', '프로그램에 들어간 라이브러리와 버전 · 라이선스 목록입니다(CycloneDX · SPDX 형식).'], en: ['Software Bill of Materials', 'The list of libraries in a program with versions and licenses (CycloneDX, SPDX).'] },
  SCA: { ko: ['소프트웨어 구성 분석 (Software Composition Analysis)', '프로그램이 쓰는 오픈 소스 의존성의 취약점과 라이선스를 검사합니다.'], en: ['Software Composition Analysis', 'Checks the open-source dependencies a program uses for vulnerabilities and licenses.'] },
  SCM: { ko: ['소스 형상 관리 (Source Control Management)', 'Git 같은 버전 관리 시스템입니다. 바뀐 줄과 작성자를 여기서 얻습니다.'], en: ['Source Control Management', 'A version control system such as Git; changed lines and authors come from it.'] },
  SEI: { ko: ['소프트웨어 공학 연구소 (Software Engineering Institute)', '카네기멜런 대학교의 연구소로 CERT 코딩 표준을 냅니다.'], en: ['Software Engineering Institute', 'Carnegie Mellon\'s institute that publishes the CERT coding standards.'] },
  SHA: { ko: ['보안 해시 알고리즘 (Secure Hash Algorithm)', '데이터의 지문을 만드는 해시 함수입니다. Git 커밋 번호도 SHA입니다.'], en: ['Secure Hash Algorithm', 'A hash function that fingerprints data; Git commit ids are SHAs.'] },
  SMTP: { ko: ['간이 우편 전송 규약 (Simple Mail Transfer Protocol)', '알림 메일을 보내는 메일 서버 규약입니다.'], en: ['Simple Mail Transfer Protocol', 'The mail server protocol used to send notification mail.'] },
  SMTPS: { ko: ['SMTP over TLS', '처음부터 암호화한 연결로 메일 서버에 보내는 방식입니다(보통 465 포트).'], en: ['SMTP over TLS', 'Sending mail over a connection encrypted from the start (usually port 465).'] },
  SPDX: { ko: ['소프트웨어 패키지 데이터 교환 (Software Package Data Exchange)', '라이선스와 SBOM을 적는 표준 형식입니다.'], en: ['Software Package Data Exchange', 'A standard format for licenses and SBOMs.'] },
  SQL: { ko: ['구조화 질의 언어 (Structured Query Language)', '데이터베이스에 질의하는 언어입니다. SQL 인젝션은 입력이 질의문에 섞여 들어가는 취약점입니다.'], en: ['Structured Query Language', 'The query language of databases; SQL injection is input that ends up inside a query.'] },
  SSL: { ko: ['보안 소켓 계층 (Secure Sockets Layer)', '통신을 암호화하는 규약으로, 지금은 TLS가 이어받았습니다.'], en: ['Secure Sockets Layer', 'The encryption protocol that TLS replaced.'] },
  STARTTLS: { ko: ['STARTTLS', '평문으로 연결한 뒤 암호화로 바꾸는 메일 서버 방식입니다(보통 587 포트).'], en: ['STARTTLS', 'Connecting in plain text and then switching to encryption (usually port 587).'] },
  STIG: { ko: ['보안 기술 구현 지침 (Security Technical Implementation Guide)', 'DISA가 낸 보안 설정 · 점검 기준입니다.'], en: ['Security Technical Implementation Guide', 'The security configuration and checking guides published by DISA.'] },
  SW: { ko: ['소프트웨어 (Software)', ''], en: ['Software', ''] },
  TLS: { ko: ['전송 계층 보안 (Transport Layer Security)', '네트워크 통신을 암호화하는 규약입니다(HTTPS 등).'], en: ['Transport Layer Security', 'The protocol that encrypts network connections (HTTPS …).'] },
  TS: { ko: ['타입스크립트 (TypeScript)', '타입을 더한 자바스크립트입니다.'], en: ['TypeScript', 'JavaScript with types.'] },
  URI: { ko: ['통합 자원 식별자 (Uniform Resource Identifier)', '자원을 가리키는 주소입니다(URL을 포함).'], en: ['Uniform Resource Identifier', 'An address of a resource (URLs are URIs).'] },
  URL: { ko: ['웹 주소 (Uniform Resource Locator)', 'http://나 https://로 시작하는 주소입니다.'], en: ['Uniform Resource Locator', 'An address starting with http:// or https://.'] },
  VOCF: { ko: ['언어 범위 (Vocabulary Frequency)', 'HIS 지표: 함수에 쓰인 연산자 · 피연산자의 반복 정도입니다. 높으면 같은 것을 되풀이하는 코드입니다.'], en: ['Vocabulary Frequency', 'HIS metric: how often operators and operands repeat in a function; high means repetitive code.'] },
  XML: { ko: ['확장 가능 마크업 언어 (eXtensible Markup Language)', '태그로 데이터를 적는 텍스트 형식입니다.'], en: ['eXtensible Markup Language', 'A text format of tagged data.'] },
  XSS: { ko: ['사이트 간 스크립팅 (Cross-Site Scripting)', '입력값이 걸러지지 않고 웹 페이지에 들어가 다른 사용자의 브라우저에서 스크립트가 실행되는 취약점입니다.'], en: ['Cross-Site Scripting', 'Unfiltered input placed in a web page runs as script in other users\' browsers.'] },
  ZIP: { ko: ['ZIP 압축 파일', '여러 파일을 하나로 묶어 압축한 파일입니다.'], en: ['ZIP archive', 'Several files packed and compressed into one.'] },
  ncloc: { ko: ['주석 아닌 코드 줄 수 (non-comment lines of code)', '빈 줄과 주석을 뺀 실제 코드 줄 수입니다.'], en: ['Non-comment lines of code', 'Lines of real code, without blank lines and comments.'] },
  SAST: { ko: ['정적 응용 프로그램 보안 테스트 (Static Application Security Testing)', '실행하지 않고 소스 코드를 읽어 보안 약점을 찾는 검사입니다.'], en: ['Static Application Security Testing', 'Finding security weaknesses by reading the source, without running it.'] },
};

const KEYS = Object.keys(ABBREVIATIONS).sort((a, b) => b.length - a.length);
const PATTERN = new RegExp(`(?<![A-Za-z0-9_])(${KEYS.map((k) => k.replace(/[+]/g, '\\+')).join('|')})(?![A-Za-z0-9_])`, 'g');

/** The abbreviations in a text, in order of appearance (each once). */
export function abbreviationsIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(PATTERN)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** "LP64 — LP64 data model: int is 32-bit …" lines for the abbreviations of a text, or ''. */
export function explainAbbreviations(text, lang) {
  return abbreviationsIn(text).map((k) => {
    const e = ABBREVIATIONS[k][lang === 'ko' ? 'ko' : 'en'];
    return `${k} — ${e[0]}${e[1] ? `: ${e[1]}` : ''}`;
  }).join('\n');
}
