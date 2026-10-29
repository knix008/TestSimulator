'use strict';

// Check groups the user turns on and off in Settings › Analysis
// (settings.checks: { <id>: false } for a group that is off). A group is a set
// of engines (core/engines.js) or, for the core rules and engines that cover
// several standards, rule-key prefixes. A group that is off is not run when
// all of its engine's groups are off, and its findings are left out otherwise.

const CHECK_GROUPS = [
  { id: 'quality', ko: '코드 품질 기본 규칙', en: 'Core code quality rules', hint: { ko: '버그 · 취약점 · 코드 스멜 · 핫스팟 · 비밀 정보(언어별 줄 규칙)', en: 'Bugs, vulnerabilities, code smells, hotspots, secrets (per-language line rules)' } },
  { id: 'defects', ko: '정밀 결함 분석', en: 'Defect Analysis', prefixes: ['defect:'], hint: { ko: '널 역참조 · 자원 누수 · 해제 후 사용 등 경로 결함', en: 'Null dereference, resource leaks, use after free and other path defects' } },
  { id: 'semantic', ko: '언어별 의미 분석', en: 'Semantic analysis per language', engines: ['sem-js', 'sem-java', 'sem-cs', 'sem-py', 'sem-go', 'sem-php', 'sem-rb'], hint: { ko: 'JavaScript · Java · C# · Python · Go · PHP · Ruby', en: 'JavaScript, Java, C#, Python, Go, PHP, Ruby' } },
  { id: 'taint', ko: '오염 데이터 흐름(테인트)', en: 'Taint flow', engines: ['taint'], hint: { ko: '입력에서 위험한 호출까지의 데이터 흐름', en: 'Data flow from inputs to dangerous calls' } },
  { id: 'krSecure', ko: '보안 약점 점검', en: 'Security Weakness', engines: ['kr-secure'], hint: { ko: '행정안전부 SW 보안약점 기준', en: 'Korean software security weakness rules' } },
  { id: 'misraC2012', ko: 'MISRA C:2012/2023', en: 'MISRA C:2012/2023', engines: ['misra-c'] },
  { id: 'misraC2004', ko: 'MISRA C:2004', en: 'MISRA C:2004', engines: ['misra-legacy'], prefixes: ['misra-c2004'] },
  { id: 'misraCpp2023', ko: 'MISRA C++:2023', en: 'MISRA C++:2023', engines: ['misra-cpp'] },
  { id: 'misraCpp2008', ko: 'MISRA C++:2008', en: 'MISRA C++:2008', engines: ['misra-legacy'], prefixes: ['misra-cpp2008'] },
  { id: 'cert', ko: 'CERT C/C++', en: 'CERT C/C++', engines: ['cert'] },
  { id: 'autosar', ko: 'AUTOSAR C++14', en: 'AUTOSAR C++14', engines: ['autosar'] },
  { id: 'absint', ko: '런타임 오류(추상 해석)', en: 'Runtime errors (abstract interpretation)', engines: ['absint'], hint: { ko: '0 나누기 · 넘침 · 배열 범위 등', en: 'Division by zero, overflow, array bounds and more' } },
  { id: 'his', ko: 'HIS 메트릭', en: 'HIS metrics', engines: ['his'] },
  { id: 'arch', ko: '아키텍처 규칙', en: 'Architecture rules', engines: ['arch'] },
  { id: 'sca', ko: '의존성(SCA)', en: 'Dependencies (SCA)', engines: ['sca'], hint: { ko: '알려진 취약 라이브러리 · 라이선스', en: 'Vulnerable libraries and licenses' } },
  { id: 'iac', ko: '인프라 코드(IaC)', en: 'Infrastructure as code (IaC)', engines: ['iac'], hint: { ko: 'Docker · Kubernetes · Terraform · CloudFormation', en: 'Docker, Kubernetes, Terraform, CloudFormation' } },
];

const BY_ENGINE = new Map();
for (const g of CHECK_GROUPS) for (const e of g.engines || []) BY_ENGINE.set(e, [...(BY_ENGINE.get(e) || []), g]);

/** The group of one finding: by engine (and rule prefix), else core rules by prefix. */
function groupOf(issue) {
  const rule = String((issue && issue.rule) || '');
  const engine = issue && issue.engine;
  const groups = engine ? BY_ENGINE.get(engine) : null;
  if (groups) return (groups.length === 1 ? groups[0] : groups.find((g) => (g.prefixes || []).some((p) => rule.startsWith(p))) || groups[0]).id;
  if (rule.startsWith('defect:')) return 'defects';
  return 'quality';
}

/**
 * Ids of the groups that are off: the project's own choice (project.checks,
 * set in Project settings; a group it does not name is on), else the
 * workspace's (settings.checks).
 */
function disabledChecks(settings, project) {
  const own = project && project.checks && typeof project.checks === 'object' ? project.checks : null;
  const checks = own || (settings && settings.checks) || {};
  return CHECK_GROUPS.filter((g) => checks[g.id] === false).map((g) => g.id);
}

/** The languages a project does not analyze at all (quality profile "none"). */
const NO_PROFILE = 'none';
function skippedLanguages(project) {
  return Object.entries((project && project.profiles) || {}).filter(([, v]) => v === NO_PROFILE).map(([lang]) => lang);
}

/** An engine runs unless every group it reports for is off. */
function engineOff(engineId, off) {
  const groups = BY_ENGINE.get(engineId);
  return !!groups && groups.every((g) => off.has(g.id));
}

/** The list for the Settings screen. */
function listChecks() {
  return CHECK_GROUPS.map(({ id, ko, en, hint, engines }) => ({ id, label: { ko, en }, hint: hint || null, engines: engines || [] }));
}

module.exports = { CHECK_GROUPS, NO_PROFILE, groupOf, disabledChecks, skippedLanguages, engineOff, listChecks };
