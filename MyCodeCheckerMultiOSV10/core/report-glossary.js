'use strict';

// Report glossary: the "Glossary / 용어 설명" section at the end of a report
// (Reports › Include a glossary of terms, settings.reports.glossary). Only the
// terms that appear in that report are listed, each with its name, full name
// and a short explanation in the report's language.
//
//   termsIn(text, lang)          -> [{ key, term, full, text }]  (glossary order)
//   glossaryOfHtml(html, lang)   -> the same for the visible text of report HTML
//   addGlossaryHtml(html, lang)  -> report HTML with the section before </body>
//   addGlossaryCsv(csv, entries, lang) -> CSV with the glossary as a last table
//
// The texts of measures and defect terms are those of the GUI term tooltips
// (src/lib/terms.js) and the abbreviations those of src/lib/abbrev.js;
// test/report-glossary.test.mjs keeps the copies here equal to them.

const { decodeEntities } = require('./export/model');

// Copied from src/lib/terms.js: { key: { ko: [name, text], en: [name, text] } }.
const TERM_TEXTS = {
  quality_gate: { ko: ['품질 게이트', '분석 결과가 통과해야 하는 조건 목록입니다. 기본 게이트는 지금의 코드 전체로 판정하며 설정 › 품질 게이트에서 조정합니다.'], en: ['Quality gate', 'The conditions an analysis has to pass. The default gate judges the whole code as it is now; adjust it in Settings › Quality gate.'] },
  pr_threshold: { ko: ['기준', '조건의 연산자와 기준값입니다. GT 0이면 0보다 클 때, LT 80이면 80보다 작을 때 실패합니다.'], en: ['Threshold', 'The condition’s operator and limit: GT 0 fails above 0, LT 80 fails below 80.'] },
  new_code: { ko: ['새 코드', '새 코드 기준(직전 분석 · 일 수 · 버전 · 브랜치) 이후 바뀌거나 추가된 코드입니다. 설정 › 새 코드에서 정합니다.'], en: ['New code', 'Code changed or added since the new-code baseline (previous analysis, days, version, branch). Set in Settings › New code.'] },
  reliability_rating: { ko: ['신뢰성 등급', '남은 버그 가운데 가장 심각한 것으로 정합니다. A 버그 없음, B 경미, C 주요, D 심각, E 차단.'], en: ['Reliability rating', 'From the worst open bug: A none, B minor, C major, D critical, E blocker.'] },
  security_rating: { ko: ['보안 등급', '남은 취약점 가운데 가장 심각한 것으로 정합니다. A 취약점 없음, B 경미, C 주요, D 심각, E 차단.'], en: ['Security rating', 'From the worst open vulnerability: A none, B minor, C major, D critical, E blocker.'] },
  maintainability_rating: { ko: ['유지보수성 등급', '기술 부채 비율로 정합니다. A ≤ 5%, B ≤ 10%, C ≤ 20%, D ≤ 50%, E > 50%.'], en: ['Maintainability rating', 'From the technical debt ratio: A ≤ 5%, B ≤ 10%, C ≤ 20%, D ≤ 50%, E > 50%.'] },
  security_review_rating: { ko: ['보안 검토 등급', '검토한 핫스팟 비율로 정합니다. A ≥ 80%, B ≥ 70%, C ≥ 50%, D ≥ 30%, E < 30%.'], en: ['Security review rating', 'From the share of reviewed hotspots: A ≥ 80%, B ≥ 70%, C ≥ 50%, D ≥ 30%, E < 30%.'] },
  bugs: { ko: ['버그', '잘못 동작하거나 실행 중 오류를 낼 수 있는 코드입니다(널 참조, 범위 밖 접근, 잘못된 비교 등). 신뢰성 등급을 정합니다.'], en: ['Bugs', 'Code that can behave wrongly or fail at run time (null dereference, out-of-bounds access, wrong comparison …). Sets the reliability rating.'] },
  vulnerabilities: { ko: ['취약점', '공격에 악용될 수 있는 코드입니다(SQL 주입, 경로 조작, 하드코딩된 비밀번호 등). 보안 등급을 정합니다.'], en: ['Vulnerabilities', 'Code an attacker can exploit (SQL injection, path traversal, hard-coded passwords …). Sets the security rating.'] },
  code_smells: { ko: ['코드 스멜', '당장 오류는 아니지만 읽고 고치기 어렵게 만드는 코드입니다(긴 함수, 중복, 복잡한 조건 등). 고치는 데 드는 시간이 기술 부채가 됩니다.'], en: ['Code smells', 'Code that is not wrong yet but hard to read and change (long functions, duplication, complex conditions …). The time to fix them is the technical debt.'] },
  security_hotspots: { ko: ['보안 핫스팟', '보안상 민감해 사람이 검토해야 하는 코드입니다(암호화, 쿠키, 정규식, 권한 등). 문제인지 아닌지는 검토 결과로 정합니다.'], en: ['Security hotspots', 'Security-sensitive code a person has to review (cryptography, cookies, regular expressions, permissions …). Review decides whether it is a problem.'] },
  security_hotspots_reviewed: { ko: ['검토한 핫스팟 %', '보안 핫스팟 가운데 검토를 마친(안전 · 수정됨 · 확인) 비율입니다.'], en: ['Hotspots reviewed %', 'The share of security hotspots that have been reviewed (safe, fixed, acknowledged).'] },
  sqale_index: { ko: ['기술 부채', '남은 코드 스멜을 모두 고치는 데 드는 예상 시간(분)입니다. 하루는 8시간으로 셉니다.'], en: ['Technical debt', 'The estimated time (minutes) to fix every open code smell; a day counts as 8 hours.'] },
  sqale_debt_ratio: { ko: ['부채 비율', '기술 부채 ÷ 코드를 새로 쓰는 데 드는 시간(코드 줄 × 30분)입니다. 유지보수성 등급을 정합니다.'], en: ['Debt ratio', 'Technical debt / the time to write the code again (lines of code × 30 minutes). Sets the maintainability rating.'] },
  coverage: { ko: ['커버리지', '테스트가 실행한 코드 줄의 비율입니다. 커버리지 보고서(LCOV, Cobertura, JaCoCo …)를 연결해야 계산됩니다.'], en: ['Coverage', 'The share of code lines the tests ran. Needs a coverage report (LCOV, Cobertura, JaCoCo …).'] },
  duplicated_lines_density: { ko: ['중복 줄 %', '다른 곳과 같은 코드 덩어리(복사 · 붙여넣기)에 속한 줄의 비율입니다.'], en: ['Duplicated lines %', 'The share of lines in blocks of code that also appear elsewhere (copy and paste).'] },
  ncloc: { ko: ['코드 줄', '빈 줄과 주석을 뺀 실제 코드 줄 수입니다(NCLOC).'], en: ['Lines of code', 'Lines with code, without blank lines and comments (NCLOC).'] },
  complexity: { ko: ['복잡도', '순환 복잡도(분기 수 + 1)의 합입니다. 클수록 시험할 경로가 많습니다.'], en: ['Complexity', 'The sum of cyclomatic complexity (decisions + 1). Higher means more paths to test.'] },
  comment_density: { ko: ['주석 밀도', '주석 줄 ÷ (코드 줄 + 주석 줄)입니다.'], en: ['Comment density', 'Comment lines / (code lines + comment lines).'] },
  severity: { ko: ['심각도', '이슈가 미치는 영향의 크기입니다. 차단 > 심각 > 주요 > 경미 > 정보.'], en: ['Severity', 'How serious an issue is: Blocker > Critical > Major > Minor > Info.'] },
  impact: { ko: ['영향', '결함이 일으킬 수 있는 피해의 크기(높음 · 보통 · 낮음)입니다.'], en: ['Impact', 'How much harm the defect can do (High, Medium, Low).'] },
  cid: { ko: ['CID · 결함 식별자', '분석이 바뀌어도 같은 결함을 같은 번호로 추적하는 식별자입니다. 스냅숏끼리 CID로 새 결함과 고쳐진 결함을 비교합니다.'], en: ['CID · defect identifier', 'Keeps the same number for the same defect across analyses; snapshots are compared by CID.'] },
  checker: { ko: ['체커', '결함을 찾은 검사 규칙의 이름입니다(예: NULL_RETURNS, RESOURCE_LEAK).'], en: ['Checker', 'The name of the check that found the defect (e.g. NULL_RETURNS, RESOURCE_LEAK).'] },
  outstanding: { ko: ['미해결', '고치지도 기각하지도 않은 결함입니다.'], en: ['Outstanding', 'Defects neither fixed nor dismissed.'] },
  dismissed: { ko: ['기각', '오탐(False Positive) 또는 의도됨(Intentional)으로 분류한 결함입니다.'], en: ['Dismissed', 'Defects classified as False Positive or Intentional.'] },
};

// Full names of those terms in English reports (Korean reports show the English name).
const TERM_FULL_EN = {
  quality_gate: 'Pass / fail conditions of an analysis', pr_threshold: 'Operator and limit of a condition', new_code: 'Code changed since the baseline',
  reliability_rating: 'Rating A–E from bugs', security_rating: 'Rating A–E from vulnerabilities', maintainability_rating: 'Rating A–E from the debt ratio',
  security_review_rating: 'Rating A–E from reviewed hotspots', bugs: 'Reliability issues (BUG)', vulnerabilities: 'Security issues (VULNERABILITY)',
  code_smells: 'Maintainability issues (CODE_SMELL)', security_hotspots: 'Code to review (SECURITY_HOTSPOT)', security_hotspots_reviewed: 'Share of reviewed hotspots',
  sqale_index: 'Remediation effort', sqale_debt_ratio: 'Technical debt ratio', coverage: 'Line coverage by tests', duplicated_lines_density: 'Duplicated lines density',
  ncloc: 'Non-comment lines of code (NCLOC)', complexity: 'Cyclomatic complexity', comment_density: 'Share of comment lines', severity: 'Issue severity',
  impact: 'Defect impact', cid: 'Defect identifier', checker: 'Defect checker', outstanding: 'Open defects', dismissed: 'Dismissed defects',
};

// Copied from src/lib/abbrev.js: { ABBR: { ko: [full name, text], en: [full name, text] } }.
const ABBREV_TEXTS = {
  CWE: { ko: ['공통 약점 목록 (Common Weakness Enumeration)', '소프트웨어 보안 약점의 종류를 번호로 정리한 목록입니다(CWE-79는 XSS 등). CWE Top 25는 가장 위험한 25가지입니다.'], en: ['Common Weakness Enumeration', 'A numbered list of kinds of software weaknesses (CWE-79 is XSS …); CWE Top 25 are the most dangerous 25.'] },
  OWASP: { ko: ['오픈 웹 애플리케이션 보안 프로젝트 (Open Worldwide Application Security Project)', '웹 보안 단체입니다. OWASP Top 10은 가장 흔한 웹 보안 위험 10가지입니다.'], en: ['Open Worldwide Application Security Project', 'A web security community; the OWASP Top 10 are the ten most common web security risks.'] },
  ASVS: { ko: ['응용 프로그램 보안 검증 표준 (Application Security Verification Standard)', 'OWASP가 낸 웹 응용 프로그램 보안 요구 사항 목록입니다. L1~L3은 검증 수준입니다.'], en: ['Application Security Verification Standard', 'OWASP\'s list of web application security requirements; L1 to L3 are verification levels.'] },
  CERT: { ko: ['CERT 보안 코딩 표준', '카네기멜런 대학교 SEI의 CERT가 만든 C · C++ · Java 보안 코딩 규칙입니다.'], en: ['CERT secure coding standards', 'Secure coding rules for C, C++ and Java by CERT at Carnegie Mellon\'s SEI.'] },
  MISRA: { ko: ['자동차 산업 소프트웨어 신뢰성 협회 (Motor Industry Software Reliability Association)', '안전이 중요한 C · C++ 코드의 코딩 지침입니다(MISRA C:2012/2023, MISRA C++:2023 등).'], en: ['Motor Industry Software Reliability Association', 'Coding guidelines for safety-critical C and C++ (MISRA C:2012/2023, MISRA C++:2023 …).'] },
  AUTOSAR: { ko: ['자동차 개방형 시스템 아키텍처 (AUTomotive Open System ARchitecture)', '차량 소프트웨어 표준입니다. AUTOSAR C++14는 그 C++ 코딩 지침입니다.'], en: ['AUTomotive Open System ARchitecture', 'A vehicle software standard; AUTOSAR C++14 is its C++ coding guideline.'] },
  HIS: { ko: ['자동차 제조사 소프트웨어 이니셔티브 (Herstellerinitiative Software)', '독일 자동차 제조사들이 정한 소프트웨어 품질 지표(복잡도, 경로 수 등)와 한계값입니다.'], en: ['Herstellerinitiative Software', 'Software quality metrics and limits (complexity, paths …) agreed by German car makers.'] },
  SANS: { ko: ['SANS 연구소', '보안 교육 기관입니다. CWE/SANS Top 25는 가장 위험한 소프트웨어 약점 목록입니다.'], en: ['SANS Institute', 'A security training institute; CWE/SANS Top 25 lists the most dangerous software weaknesses.'] },
  PCI: { ko: ['지불 카드 산업 (Payment Card Industry)', 'PCI DSS는 신용카드 정보를 다루는 시스템의 보안 표준입니다.'], en: ['Payment Card Industry', 'PCI DSS is the security standard for systems that handle card data.'] },
  DSS: { ko: ['데이터 보안 표준 (Data Security Standard)', 'PCI DSS는 신용카드 정보를 다루는 시스템의 보안 표준입니다.'], en: ['Data Security Standard', 'PCI DSS is the security standard for systems that handle card data.'] },
  KISA: { ko: ['한국인터넷진흥원 (Korea Internet & Security Agency)', '소프트웨어 보안 약점 진단 가이드 등을 내는 기관입니다.'], en: ['Korea Internet & Security Agency', 'Publishes guides such as the software security weakness diagnosis guide.'] },
  MOIS: { ko: ['행정안전부 (Ministry of the Interior and Safety)', '한국 행안부의 소프트웨어 보안 약점 기준(49개 항목)입니다.'], en: ['Ministry of the Interior and Safety (Korea)', 'Korea\'s software security weakness criteria (49 items).'] },
  STIG: { ko: ['보안 기술 구현 지침 (Security Technical Implementation Guide)', 'DISA가 낸 보안 설정 · 점검 기준입니다.'], en: ['Security Technical Implementation Guide', 'The security configuration and checking guides published by DISA.'] },
  DISA: { ko: ['미 국방정보체계국 (Defense Information Systems Agency)', '미 국방부 정보 시스템의 보안 점검 기준(STIG)을 냅니다.'], en: ['Defense Information Systems Agency', 'The US agency that publishes the STIG security checklists.'] },
  ASD: { ko: ['응용 프로그램 보안 및 개발 (Application Security and Development)', '미 국방정보체계국(DISA)이 낸 응용 프로그램 보안 점검 기준(STIG)의 이름입니다.'], en: ['Application Security and Development', 'The DISA STIG for application security and development.'] },
  SAST: { ko: ['정적 응용 프로그램 보안 테스트 (Static Application Security Testing)', '실행하지 않고 소스 코드를 읽어 보안 약점을 찾는 검사입니다.'], en: ['Static Application Security Testing', 'Finding security weaknesses by reading the source, without running it.'] },
  DAST: { ko: ['동적 응용 프로그램 보안 테스트 (Dynamic Application Security Testing)', '실행 중인 웹 앱에 요청을 보내 취약점을 찾는 검사입니다.'], en: ['Dynamic Application Security Testing', 'Testing a running web app by sending it requests to find vulnerabilities.'] },
  IaC: { ko: ['코드형 인프라 (Infrastructure as Code)', '서버 · 컨테이너 설정을 파일로 관리하는 방식(Dockerfile, Kubernetes, Terraform)과 그 설정의 보안 점검입니다.'], en: ['Infrastructure as Code', 'Servers and containers described in files (Dockerfile, Kubernetes, Terraform), and the security checks of those files.'] },
  XSS: { ko: ['사이트 간 스크립팅 (Cross-Site Scripting)', '입력값이 걸러지지 않고 웹 페이지에 들어가 다른 사용자의 브라우저에서 스크립트가 실행되는 취약점입니다.'], en: ['Cross-Site Scripting', 'Unfiltered input placed in a web page runs as script in other users\' browsers.'] },
  SBOM: { ko: ['소프트웨어 자재 명세서 (Software Bill of Materials)', '프로그램에 들어간 라이브러리와 버전 · 라이선스 목록입니다(CycloneDX · SPDX 형식).'], en: ['Software Bill of Materials', 'The list of libraries in a program with versions and licenses (CycloneDX, SPDX).'] },
  SCA: { ko: ['소프트웨어 구성 분석 (Software Composition Analysis)', '프로그램이 쓰는 오픈 소스 의존성의 취약점과 라이선스를 검사합니다.'], en: ['Software Composition Analysis', 'Checks the open-source dependencies a program uses for vulnerabilities and licenses.'] },
  CVE: { ko: ['공개 취약점 목록 (Common Vulnerabilities and Exposures)', '알려진 보안 취약점마다 붙는 번호(CVE-2024-12345 같은)입니다.'], en: ['Common Vulnerabilities and Exposures', 'The number given to each known security vulnerability (such as CVE-2024-12345).'] },
  GHSA: { ko: ['GitHub 보안 권고 (GitHub Security Advisory)', 'GitHub가 공개한 취약점 권고 번호입니다(GHSA-xxxx-xxxx-xxxx).'], en: ['GitHub Security Advisory', 'An advisory id published by GitHub (GHSA-xxxx-xxxx-xxxx).'] },
  OSV: { ko: ['오픈 소스 취약점 (Open Source Vulnerabilities)', '오픈 소스 패키지의 알려진 취약점 데이터베이스(osv.dev)입니다. 의존성 분석이 씁니다.'], en: ['Open Source Vulnerabilities', 'The database of known vulnerabilities in open-source packages (osv.dev), used by the dependency analysis.'] },
  SPDX: { ko: ['소프트웨어 패키지 데이터 교환 (Software Package Data Exchange)', '라이선스와 SBOM을 적는 표준 형식입니다.'], en: ['Software Package Data Exchange', 'A standard format for licenses and SBOMs.'] },
  GCS: { ko: ['지침 준수 요약 (Guideline Compliance Summary)', 'MISRA Compliance 방식의 지침별 준수 · 위반 · 편차 요약입니다.'], en: ['Guideline Compliance Summary', 'The MISRA Compliance summary of each guideline: compliant, violated, deviated.'] },
  GRP: { ko: ['지침 재분류 계획 (Guideline Re-categorization Plan)', 'MISRA 지침의 등급(필수 · 요구 · 권고)을 프로젝트에 맞게 바꾼 계획입니다.'], en: ['Guideline Re-categorization Plan', 'The project\'s change of MISRA guideline categories (mandatory, required, advisory).'] },
};

// Report-only terms: { ko: [term, full name, text], en: [term, full name, text] }.
const EXTRA_TEXTS = {
  gate_status: {
    ko: ['OK / ERROR', '품질 게이트 조건 상태', '게이트 조건 하나의 판정입니다. 잰 값이 기준을 만족하면 OK, 아니면 ERROR이며, ERROR가 하나라도 있으면 게이트는 실패합니다.'],
    en: ['OK / ERROR', 'Quality gate condition status', 'The result of one gate condition: OK when the measured value meets the threshold, ERROR when it does not. One ERROR fails the gate.'],
  },
  rating: {
    ko: ['등급 A–E', 'Ratings A–E', '모든 등급은 A(가장 좋음)부터 E(가장 나쁨)까지의 문자입니다. 신뢰성 · 보안은 가장 심각한 남은 이슈, 유지보수성은 부채 비율, 보안 검토는 검토한 핫스팟 비율로 정합니다.'],
    en: ['Ratings A–E', 'Letter grades', 'Every rating is a letter from A (best) to E (worst). Reliability and security come from the worst open issue, maintainability from the debt ratio, security review from the share of reviewed hotspots.'],
  },
  kloc: {
    ko: ['KLOC', '천 줄 단위 코드 (Kilo Lines Of Code)', '코드 줄 수를 1,000으로 나눈 값입니다. KLOC당 결함 수 같은 밀도에 씁니다.'],
    en: ['KLOC', 'Thousand lines of code', 'Lines of code divided by 1,000; densities such as defects per KLOC use it.'],
  },
  blocker: {
    ko: ['BLOCKER', '차단', '곧바로 고쳐야 하는 이슈입니다. 프로그램을 멈추게 하거나 바로 공격에 쓰일 수 있습니다(유출된 비밀 등).'],
    en: ['BLOCKER', 'Blocker severity', 'Must be fixed at once: the issue can stop the program or be used for an attack right away (a leaked secret …).'],
  },
  critical: {
    ko: ['CRITICAL', '심각', '잘못된 동작이나 보안 구멍으로 이어질 가능성이 큰 이슈입니다. 빨리 고칩니다.'],
    en: ['CRITICAL', 'Critical severity', 'Likely to cause wrong behaviour or a security hole; fix it soon.'],
  },
  major: {
    ko: ['MAJOR', '주요', '품질이나 동작에 눈에 띄는 영향을 줄 수 있는 이슈입니다. 고칠 계획을 세웁니다.'],
    en: ['MAJOR', 'Major severity', 'Can noticeably hurt quality or behaviour; plan to fix it.'],
  },
  minor: {
    ko: ['MINOR', '경미', '품질에 주는 영향이 작은 이슈입니다. 그 코드를 손볼 때 고칩니다.'],
    en: ['MINOR', 'Minor severity', 'Small impact on quality; fix it when you touch the code.'],
  },
  info: {
    ko: ['INFO', '정보', '그 자체로 문제는 아닌 참고용 알림입니다.'],
    en: ['INFO', 'Info severity', 'Not a problem by itself; a note for information.'],
  },
  compliant: {
    ko: ['준수 / 준수하지 않음', 'Compliant / Not compliant', '지침이나 규칙에 남은 위반이 없으면(또는 모든 위반에 승인된 편차가 있으면) 준수, 아니면 준수하지 않음입니다.'],
    en: ['Compliant / Not compliant', 'Compliance status', 'Compliant means no open violation of the guideline or rule (or an approved deviation for every one); otherwise it is not compliant.'],
  },
  compliance_rate: {
    ko: ['준수율', 'Compliance rate', '검사한 규칙 가운데 위반이 없는 규칙의 비율입니다.'],
    en: ['Compliance rate', 'Share of rules without violations', 'The share of the checked rules that have no violation.'],
  },
  misra_category: {
    ko: ['Mandatory / Required / Advisory', '필수 / 요구 / 권고 (MISRA 지침 분류)', '필수 지침은 어떤 경우에도 위반할 수 없고, 요구 지침은 기록한 편차가 있을 때만 위반할 수 있으며, 권고 지침은 권장 사항입니다. 재분류 계획(GRP)으로 더 엄격하게 바꿀 수 있습니다.'],
    en: ['Mandatory / Required / Advisory', 'MISRA guideline categories', 'Mandatory guidelines may never be violated, Required ones only with a recorded deviation, and Advisory ones are recommendations. A re-categorization plan (GRP) can make a category stricter.'],
  },
  deviation: {
    ko: ['편차', 'Deviation', '요구(Required) 지침 위반을 허용하는 승인된 예외 기록입니다. 근거 · 범위 · 승인자를 적습니다.'],
    en: ['Deviation', 'Deviation record', 'An approved, documented exception that allows a violation of a Required guideline, with its justification, scope and approver.'],
  },
  disapplied: {
    ko: ['Disapplied', '적용 제외', '프로젝트가 적용하지 않기로 한 권고(Advisory) 지침입니다. 위반을 세지 않습니다.'],
    en: ['Disapplied', 'Guideline not applied', 'An Advisory guideline the project chose not to apply; its violations are not counted.'],
  },
  decidable: {
    ko: ['결정 가능 (Decidable)', 'Decidable / Undecidable', '결정 가능한 지침은 도구가 항상 정확히 판정할 수 있고, 결정 불가능한 지침은 근사적으로만 검사할 수 있어 사람의 검토가 필요합니다.'],
    en: ['Decidable', 'Decidable / Undecidable', 'A decidable guideline can always be checked exactly by a tool; an undecidable one only approximately, so it needs review.'],
  },
  GEP: {
    ko: ['GEP', '지침 적용 계획 (Guideline Enforcement Plan)', '지침마다 어떻게 검사하는지(이 도구 · 다른 도구 · 검토)를 적은 계획입니다.'],
    en: ['GEP', 'Guideline Enforcement Plan', 'How each guideline is checked: by this tool, by another tool or by review.'],
  },
  defect_density: {
    ko: ['결함 밀도', 'Defect density', '코드 1,000줄(KLOC)당 미해결 결함 수입니다. 무결성 보고서는 목표값과 비교합니다.'],
    en: ['Defect density', 'Defects per KLOC', 'Outstanding defects per 1,000 lines of code (KLOC); the integrity report compares it with a target.'],
  },
  snapshot: {
    ko: ['스냅숏', 'Snapshot', '스트림의 분석 결과 하나를 보관한 것입니다. 스냅숏끼리 비교해 새 결함과 고쳐진 결함을 찾습니다.'],
    en: ['Snapshot', 'Stored analysis', 'One stored analysis result of a stream; snapshots are compared to find new and fixed defects.'],
  },
  stream: {
    ko: ['스트림', 'Stream', '한 프로젝트 · 브랜치의 분석을 이어서 쌓는 단위입니다. 그 스냅숏을 시간에 따라 비교합니다.'],
    en: ['Stream', 'Line of analyses', 'The analyses of one project and branch kept one after another, whose snapshots are compared over time.'],
  },
  triage: {
    ko: ['트리아지', 'Triage', '결함을 어떻게 처리할지 정하는 일입니다. 분류(버그 · 오탐 · 의도됨 …), 조치, 심각도, 담당자를 정합니다.'],
    en: ['Triage', 'Deciding on a defect', 'Deciding what to do with a defect: its classification (Bug, False Positive, Intentional …), action, severity and owner.'],
  },
  component: {
    ko: ['구성 요소', 'Component', '경로 패턴으로 묶은 파일 모음입니다. 결함 수를 나누어 보고 담당자를 정할 때 씁니다.'],
    en: ['Component', 'Group of files', 'A named group of files (by path pattern) used to split defect counts and assign owners.'],
  },
  security_score: {
    ko: ['보안 점수', 'Security score (CWE weighted)', '결함마다 CWE 가중치(CWE Top 25 1위 = 25 … 25위 = 1, 나머지 CWE 0.5)에 영향 계수(높음 3, 보통 2, 낮음 1)를 곱해 더한 값입니다. 낮을수록 좋습니다.'],
    en: ['Security score', 'CWE-weighted score', 'The sum over defects of the CWE weight (CWE Top 25 rank 1 = 25 … rank 25 = 1, other CWEs 0.5) times the impact factor (High 3, Medium 2, Low 1). Lower is better.'],
  },
  CVSS: {
    ko: ['CVSS', '공통 취약점 점수 체계 (Common Vulnerability Scoring System)', '알려진 취약점의 심각도를 0~10점으로 나타냅니다(9.0 이상 심각, 7.0 이상 높음, 4.0 이상 보통).'],
    en: ['CVSS', 'Common Vulnerability Scoring System', 'A 0–10 score of how severe a known vulnerability is (9.0 and up critical, 7.0 high, 4.0 medium).'],
  },
};

/** A whole word (letters and digits around it do not count as part of it). */
function word(w, flags = '') {
  return new RegExp(`(?<![A-Za-z0-9])${w}(?![A-Za-z0-9])`, flags);
}

/** A finder for a term that only counts when the report also matches `context`. */
function withGate(re, context) { return (s) => context.test(s) && re.test(s); }

// Reports of Defect Analysis (integrity, CWE-weighted security): impact, component
// and stream mean defect terms there, not the words in rule names elsewhere.
const DEFECTS_EN = /\bOutstanding\b|\bSnapshot\b|CWE weighted|Defect density|\bCID\b/;
const DEFECTS_KO = /미해결|스냅숏|CWE 가중|결함 밀도|\bCID\b/;

// Glossary order: [key, source, finder in English reports, finder in Korean reports];
// a finder is a RegExp or a function of the text.
// source 'term' = TERM_TEXTS, 'abbr' = ABBREV_TEXTS, 'extra' = EXTRA_TEXTS.
const ENTRIES = [
  ['quality_gate', 'term', /Quality gate/i, /품질 게이트/],
  ['gate_status', 'extra', withGate(word('ERROR'), /Quality gate/i), withGate(word('ERROR'), /품질 게이트/)],
  ['pr_threshold', 'term', withGate(/\bThreshold\b/, /Quality gate/i), withGate(/(^|\s)기준(\s|$)/, /품질 게이트/)],
  ['new_code', 'term', /New code/, /새 코드/],
  ['rating', 'extra', /\b[Rr]atings?\b/, /등급/],
  ['reliability_rating', 'term', /Reliability/i, /신뢰성/],
  ['security_rating', 'term', /Security rating/i, /보안 등급/],
  ['maintainability_rating', 'term', /Maintainability/i, /유지보수성/],
  ['security_review_rating', 'term', /Security review/i, /보안 검토/],
  ['bugs', 'term', /\bBugs?\b|\bBUG\b/, /버그|\bBUG\b/],
  ['vulnerabilities', 'term', /vulnerabilit|\bVULNERABILITY\b/i, /취약점|\bVULNERABILITY\b/],
  ['code_smells', 'term', /Code smells?|\bCODE_SMELL\b/i, /코드 스멜|\bCODE_SMELL\b/],
  ['security_hotspots', 'term', /hotspots?\b|\bSECURITY_HOTSPOT\b/i, /핫스팟|\bSECURITY_HOTSPOT\b/],
  ['security_hotspots_reviewed', 'term', /Hotspots reviewed/i, /검토한 핫스팟/],
  ['sqale_index', 'term', /Technical debt/i, /기술 부채/],
  ['sqale_debt_ratio', 'term', /Debt ratio/i, /부채 비율/],
  ['coverage', 'term', /coverage/i, /커버리지/],
  ['duplicated_lines_density', 'term', /Duplicated lines|Duplications/i, /중복/],
  ['ncloc', 'term', /Lines of code|\bNCLOC\b/i, /코드 줄|\bNCLOC\b/],
  ['kloc', 'extra', word('KLOC'), word('KLOC')],
  ['complexity', 'term', /\b[Cc]omplexity\b/, /복잡도/],
  ['comment_density', 'term', /Comment density/i, /주석 밀도/],
  ['severity', 'term', /\bSeverity\b/i, /심각도/],
  ['blocker', 'extra', word('BLOCKER'), word('BLOCKER')],
  ['critical', 'extra', word('CRITICAL'), word('CRITICAL')],
  ['major', 'extra', word('MAJOR'), word('MAJOR')],
  ['minor', 'extra', word('MINOR'), word('MINOR')],
  ['info', 'extra', word('INFO'), word('INFO')],
  ['compliant', 'extra', /\bCompliant\b|Not compliant/, /준수|\bCompliant\b/],
  ['compliance_rate', 'extra', /Compliance rate/i, /준수율/],
  ['misra_category', 'extra', word('(Mandatory|Required|Advisory)'), word('(Mandatory|Required|Advisory)')],
  ['deviation', 'extra', /\bDeviations?\b/, /편차|\bDeviations?\b/],
  ['disapplied', 'extra', /\bDisapplied\b/, /\bDisapplied\b|적용 제외/],
  ['decidable', 'extra', /\b(Un)?[Dd]ecidable\b/, /결정 가능|\b(Un)?[Dd]ecidable\b/],
  ['GCS', 'abbr', /\bGCS\b|Guideline Compliance Summary/, /\bGCS\b/],
  ['GEP', 'extra', /\bGEP\b|Guideline Enforcement Plan/, /\bGEP\b/],
  ['GRP', 'abbr', /\bGRP\b|Guideline Re-categorization Plan/, /\bGRP\b/],
  ['cid', 'term', word('CID'), word('CID')],
  ['checker', 'term', /\b[Cc]heckers?\b/, /검사기|체커/],
  ['impact', 'term', withGate(/\bimpact\b/i, DEFECTS_EN), withGate(/영향/, DEFECTS_KO)],
  ['outstanding', 'term', /\bOutstanding\b/i, /미해결/],
  ['dismissed', 'term', /\bDismissed\b/i, /기각/],
  ['defect_density', 'extra', /Defect density/i, /결함 밀도/],
  ['snapshot', 'extra', /\bSnapshots?\b/i, /스냅숏/],
  ['stream', 'extra', withGate(/\bStreams?\b/, DEFECTS_EN), withGate(/스트림/, DEFECTS_KO)],
  ['triage', 'extra', /\btriage\b|\bClassification\b/i, /트리아지/],
  ['component', 'extra', withGate(/\bComponents?\b/, DEFECTS_EN), withGate(/구성 요소/, DEFECTS_KO)],
  ['security_score', 'extra', /Security score/i, /보안 점수/],
  ['CWE', 'abbr', word('CWE'), word('CWE')],
  ['OWASP', 'abbr', word('OWASP'), word('OWASP')],
  ['ASVS', 'abbr', word('ASVS'), word('ASVS')],
  ['CERT', 'abbr', word('CERT'), word('CERT')],
  ['MISRA', 'abbr', word('MISRA'), word('MISRA')],
  ['AUTOSAR', 'abbr', word('AUTOSAR'), word('AUTOSAR')],
  ['HIS', 'abbr', word('HIS'), word('HIS')],
  ['SANS', 'abbr', word('SANS'), word('SANS')],
  ['PCI', 'abbr', word('PCI'), word('PCI')],
  ['DSS', 'abbr', word('DSS'), word('DSS')],
  ['KISA', 'abbr', word('KISA'), word('KISA')],
  ['MOIS', 'abbr', word('MOIS'), word('MOIS')],
  ['STIG', 'abbr', word('STIG'), word('STIG')],
  ['DISA', 'abbr', word('DISA'), word('DISA')],
  ['ASD', 'abbr', word('ASD'), word('ASD')],
  ['SAST', 'abbr', word('SAST'), word('SAST')],
  ['DAST', 'abbr', word('DAST'), word('DAST')],
  ['IaC', 'abbr', word('IaC'), word('IaC')],
  ['XSS', 'abbr', word('XSS'), word('XSS')],
  ['SBOM', 'abbr', /\bSBOM\b|bill of materials/i, /\bSBOM\b|자재 명세서/],
  ['SCA', 'abbr', /\bSCA\b|\bsca:/, /\bSCA\b|\bsca:/],
  ['CVE', 'abbr', word('CVE'), word('CVE')],
  ['CVSS', 'extra', word('CVSS'), word('CVSS')],
  ['GHSA', 'abbr', word('GHSA'), word('GHSA')],
  ['OSV', 'abbr', word('OSV'), word('OSV')],
  ['SPDX', 'abbr', word('SPDX'), word('SPDX')],
];

const STR = {
  en: { heading: 'Glossary', intro: 'The terms used in this report.', columns: ['Term', 'Full name', 'Explanation'], his: 'HIS metric' },
  ko: { heading: '용어 설명', intro: '이 보고서에 나온 용어입니다.', columns: ['용어', '전체 이름', '설명'], his: 'HIS 지표' },
};

function strOf(lang) { return STR[lang === 'ko' ? 'ko' : 'en']; }

/** [term, full name, text] of an entry in a language. */
function entryText(key, source, lang) {
  const l = lang === 'ko' ? 'ko' : 'en';
  if (source === 'term') {
    const [name, text] = TERM_TEXTS[key][l];
    // Korean terms show the English name as their full name.
    return [name, l === 'ko' ? TERM_TEXTS[key].en[0] : TERM_FULL_EN[key], text];
  }
  if (source === 'abbr') {
    const [full, text] = ABBREV_TEXTS[key][l];
    return [key, full, text];
  }
  return EXTRA_TEXTS[key][l].slice();
}

// HIS metrics: one entry per rule key his:<ID> that the report names.
let hisCache = null;
function hisEntries() {
  if (hisCache) return hisCache;
  let rules = [];
  try { rules = require('./his').catalog(); } catch { rules = []; }
  hisCache = rules.map((r) => {
    const id = r.key.slice(4);
    const short = (lang) => { const m = /^HIS\s+([^:]+):/.exec((r.name && r.name[lang]) || ''); return m ? m[1].trim() : id; };
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { key: r.key, find: new RegExp(`\\bhis:${esc}(?![A-Za-z0-9_])|\\bHIS_${esc}\\b`), name: short, why: r.why || {} };
  });
  return hisCache;
}

/** The glossary entries whose terms appear in a text: [{ key, term, full, text }] in glossary order. */
function termsIn(text, lang = 'en') {
  const s = String(text == null ? '' : text);
  const l = lang === 'ko' ? 'ko' : 'en';
  const out = [];
  for (const [key, source, findEn, findKo] of ENTRIES) {
    const find = l === 'ko' ? findKo : findEn;
    if (!(typeof find === 'function' ? find(s) : find.test(s))) continue;
    const [term, full, explanation] = entryText(key, source, l);
    out.push({ key, term, full, text: explanation });
  }
  for (const h of hisEntries()) {
    if (!h.find.test(s)) continue;
    out.push({ key: h.key, term: h.name(l), full: `${strOf(l).his} · ${h.key}`, text: h.why[l] || h.why.en || '' });
  }
  return out;
}

/** Visible text of report HTML: no head, styles, scripts, SVG or tags; entities decoded. */
function visibleText(html) {
  return decodeEntities(String(html == null ? '' : html)
    .replace(/<(head|style|script|svg|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ');
}

function glossaryOfHtml(html, lang = 'en') {
  return termsIn(visibleText(html), lang);
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** The glossary section as report HTML (page break, heading, intro, table). '' without entries. */
function glossaryHtml(entries, lang = 'en') {
  if (!entries || !entries.length) return '';
  const tr = strOf(lang);
  const rows = entries.map((e) => `<tr><td><strong>${escHtml(e.term)}</strong></td><td>${escHtml(e.full || '—')}</td><td>${escHtml(e.text)}</td></tr>`).join('');
  return `<div class="pagebreak" style="break-before:page"></div><h2 class="glossary" id="glossary">${escHtml(tr.heading)}</h2><p class="small">${escHtml(tr.intro)}</p>`
    + `<table class="glossary"><thead><tr>${tr.columns.map((c, i) => `<th${i < 2 ? ` style="width:${i ? 24 : 18}%"` : ''}>${escHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** Report HTML with the glossary of its own terms at the end (unchanged when no term appears). */
function addGlossaryHtml(html, lang = 'en', entries = glossaryOfHtml(html, lang)) {
  const section = glossaryHtml(entries, lang);
  if (!section) return String(html);
  const s = String(html);
  const at = s.search(/<\/body>/i);
  return at < 0 ? `${s}${section}` : `${s.slice(0, at)}${section}\n${s.slice(at)}`;
}

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** CSV with the glossary as a last table (blank line, title row, header, rows). */
function addGlossaryCsv(csv, entries, lang = 'en') {
  if (!entries || !entries.length) return String(csv);
  const tr = strOf(lang);
  const lines = [csvCell(tr.heading), tr.columns.map(csvCell).join(','), ...entries.map((e) => [e.term, e.full || '', e.text].map(csvCell).join(','))];
  const base = String(csv).replace(/(\r?\n)+$/, '');
  return `${base}\r\n\r\n${lines.join('\r\n')}\r\n`;
}

module.exports = {
  TERM_TEXTS, ABBREV_TEXTS, EXTRA_TEXTS, ENTRIES, HEADING: { en: STR.en.heading, ko: STR.ko.heading },
  termsIn, visibleText, glossaryOfHtml, glossaryHtml, addGlossaryHtml, addGlossaryCsv,
};
