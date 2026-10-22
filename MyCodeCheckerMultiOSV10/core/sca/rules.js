'use strict';

// Rule catalog for the SCA engine (ENGINE_CONTRACT RuleMeta).

const { t } = require('./util');

const RULES = [
  {
    key: 'sca:vulnerable-dependency', type: 'VULNERABILITY', severity: 'CRITICAL', debtMin: 30,
    tags: ['sca', 'cve', 'owasp-a06', 'cwe-1395'], cwe: 'CWE-1395', checker: 'SCA_VULNERABLE_COMPONENT', category: 'Software composition',
    standards: { cwe: ['CWE-1395', 'CWE-937'], owasp2021: ['A06'] },
    name: t('Dependencies should not have known vulnerabilities', '알려진 취약점이 있는 의존성을 쓰지 않아야 합니다'),
    why: t('A declared or transitive package version is listed in a published security advisory (CVE / GHSA / OSV). Attackers scan for exactly these versions.',
      '선언했거나 간접으로 들어온 패키지 버전이 공개 보안 권고(CVE / GHSA / OSV)에 올라 있습니다. 공격자는 바로 이런 버전을 찾습니다.'),
    fix: t('Upgrade to the suggested minimal fixed version (or a later one). For a transitive dependency, upgrade the direct dependency that pulls it in or add an override / resolution.',
      '제안한 최소 수정 버전 이상으로 올리세요. 간접 의존성이면 그것을 끌어오는 직접 의존성을 올리거나 override / resolution 을 추가하세요.'),
  },
  {
    key: 'sca:malicious', type: 'VULNERABILITY', severity: 'BLOCKER', debtMin: 60,
    tags: ['sca', 'malware', 'supply-chain', 'cwe-506'], cwe: 'CWE-506', checker: 'SCA_MALICIOUS_PACKAGE', category: 'Software composition',
    standards: { cwe: ['CWE-506'], owasp2021: ['A08'] },
    name: t('Known malicious or hijacked packages must not be used', '악성이거나 탈취된 패키지를 쓰면 안 됩니다'),
    why: t('The package (or this exact release) is a known typosquat, hijacked release or sabotage. Installing it can run attacker code on developer and build machines.',
      '이 패키지(또는 이 릴리스)는 알려진 타이포스쿼팅, 탈취 릴리스 또는 고의 훼손입니다. 설치만 해도 개발·빌드 머신에서 공격자 코드가 실행될 수 있습니다.'),
    fix: t('Remove the package, rotate any secrets present on machines where it was installed, and depend on the genuine package or a clean version.',
      '패키지를 제거하고, 설치된 머신의 비밀 값을 교체한 뒤 진짜 패키지나 깨끗한 버전을 쓰세요.'),
  },
  {
    key: 'sca:license-denied', type: 'CODE_SMELL', severity: 'CRITICAL', debtMin: 60,
    tags: ['sca', 'license', 'compliance'], checker: 'SCA_LICENSE_POLICY', category: 'License compliance',
    name: t('Dependencies should not use licenses denied by the policy', '정책이 금지한 라이선스의 의존성을 쓰지 않아야 합니다'),
    why: t('The license (for example a network copyleft or non-commercial license) is denied by the license policy and may impose obligations the product cannot meet.',
      '이 라이선스(예: 네트워크 카피레프트, 비상업 라이선스)는 라이선스 정책에서 금지되어 있고 제품이 지킬 수 없는 의무를 지울 수 있습니다.'),
    fix: t('Replace the dependency, obtain a commercial license, or record an approved exception in the policy.',
      '의존성을 바꾸거나, 상용 라이선스를 받거나, 정책에 승인된 예외를 기록하세요.'),
  },
  {
    key: 'sca:license-review', type: 'CODE_SMELL', severity: 'MINOR', debtMin: 15,
    tags: ['sca', 'license', 'compliance', 'copyleft'], checker: 'SCA_LICENSE_POLICY', category: 'License compliance',
    name: t('Copyleft licenses should be reviewed', '카피레프트 라이선스는 검토해야 합니다'),
    why: t('Weak or strong copyleft licenses carry distribution obligations (source offer, notices, relinking) that need legal review.',
      '약한/강한 카피레프트 라이선스에는 배포 의무(소스 제공, 고지, 재링크)가 있어 법무 검토가 필요합니다.'),
    fix: t('Check how the component is linked and distributed, then mark the license allowed or denied in the policy.',
      '구성 요소의 링크·배포 방식을 확인한 뒤 정책에서 허용 또는 금지로 정하세요.'),
  },
  {
    key: 'sca:license-unknown', type: 'CODE_SMELL', severity: 'MINOR', debtMin: 15,
    tags: ['sca', 'license', 'compliance'], checker: 'SCA_LICENSE_UNKNOWN', category: 'License compliance',
    name: t('Dependency licenses should be identifiable', '의존성 라이선스를 식별할 수 있어야 합니다'),
    why: t('The declared license is not a recognised SPDX id or expression (or is missing), so compliance cannot be verified.',
      '선언된 라이선스가 SPDX id/식으로 인식되지 않거나 없어서 준수 여부를 확인할 수 없습니다.'),
    fix: t('Look up the real license, declare it as an SPDX expression, or add a LicenseRef to the policy.',
      '실제 라이선스를 확인해 SPDX 식으로 선언하거나 정책에 LicenseRef 를 추가하세요.'),
  },
  {
    key: 'sca:unpinned', type: 'SECURITY_HOTSPOT', severity: 'MINOR', debtMin: 5,
    tags: ['sca', 'supply-chain', 'cwe-1357'], cwe: 'CWE-1357', checker: 'SCA_UNPINNED_VERSION', category: 'Software composition',
    standards: { cwe: ['CWE-1357', 'CWE-829'], owasp2021: ['A08'] },
    name: t('Dependency versions should be pinned or bounded', '의존성 버전은 고정하거나 상한을 두어야 합니다'),
    why: t('A wildcard, "latest", open-ended (">=") or unpinned VCS version lets any future release - including a compromised one - into the build.',
      '와일드카드, "latest", 상한 없는(">=") 범위, 고정되지 않은 VCS 버전은 앞으로 나올 어떤 릴리스(탈취된 것 포함)도 빌드에 들어오게 합니다.'),
    fix: t('Use an exact version or a bounded range and commit the lockfile; pin VCS dependencies to a commit hash.',
      '정확한 버전이나 상한이 있는 범위를 쓰고 lockfile 을 커밋하세요. VCS 의존성은 커밋 해시로 고정하세요.'),
  },
  {
    key: 'sca:dependency-confusion', type: 'SECURITY_HOTSPOT', severity: 'MAJOR', debtMin: 30,
    tags: ['sca', 'supply-chain', 'cwe-427'], cwe: 'CWE-427', checker: 'SCA_DEPENDENCY_CONFUSION', category: 'Software composition',
    standards: { cwe: ['CWE-427'], owasp2021: ['A08'] },
    name: t('Internal packages should not be resolvable from public registries', '내부 패키지가 공개 레지스트리에서 받아지면 안 됩니다'),
    why: t('An internal-looking package name (per the configured patterns) is unscoped, resolved from a public registry, or fetched with an extra index. An attacker can publish the same name publicly with a higher version.',
      '설정한 패턴상 내부 패키지로 보이는 이름이 scope 가 없거나, 공개 레지스트리에서 받아졌거나, extra index 로 받아집니다. 공격자가 같은 이름을 더 높은 버전으로 공개할 수 있습니다.'),
    fix: t('Use a scope/namespace you own, configure the private registry as the only source for that scope, avoid --extra-index-url, and reserve the name on the public registry.',
      '소유한 scope/namespace 를 쓰고, 그 scope 의 소스를 사설 레지스트리 하나로 정하고, --extra-index-url 을 피하고, 공개 레지스트리에 이름을 선점하세요.'),
  },
  {
    key: 'sca:deprecated', type: 'CODE_SMELL', severity: 'MAJOR', debtMin: 30,
    tags: ['sca', 'maintainability', 'cwe-1104'], cwe: 'CWE-1104', checker: 'SCA_DEPRECATED_PACKAGE', category: 'Software composition',
    standards: { cwe: ['CWE-1104'] },
    name: t('Deprecated or abandoned packages should be replaced', '지원 중단되거나 버려진 패키지는 바꿔야 합니다'),
    why: t('The package is deprecated, abandoned or end-of-life. It will not receive security fixes.',
      '이 패키지는 지원 중단, 방치 또는 수명 종료 상태라 보안 수정을 받지 못합니다.'),
    fix: t('Migrate to the suggested replacement.', '제안한 대체 패키지로 옮기세요.'),
  },
  {
    key: 'sca:outdated', type: 'CODE_SMELL', severity: 'MINOR', debtMin: 10,
    tags: ['sca', 'maintainability', 'cwe-1104'], cwe: 'CWE-1104', checker: 'SCA_OUTDATED', category: 'Software composition',
    standards: { cwe: ['CWE-1104'] },
    name: t('Dependencies should not lag major versions behind', '의존성이 메이저 버전 뒤처지면 안 됩니다'),
    why: t('The used version is at least one major version behind the latest known release (from options.latest), so fixes may no longer be backported.',
      '사용 버전이 알려진 최신 릴리스(options.latest)보다 메이저 버전이 하나 이상 뒤처져 수정이 더 이상 백포트되지 않을 수 있습니다.'),
    fix: t('Plan an upgrade to the current major version.', '현재 메이저 버전으로 올리는 계획을 세우세요.'),
  },
  {
    key: 'sca:duplicate', type: 'CODE_SMELL', severity: 'MINOR', debtMin: 10,
    tags: ['sca', 'maintainability'], checker: 'SCA_DUPLICATE_VERSIONS', category: 'Software composition',
    name: t('A package should not be resolved in several versions', '한 패키지가 여러 버전으로 들어오면 안 됩니다'),
    why: t('Several versions of the same package bloat the build and mean that a security fix in one copy may not reach the others.',
      '같은 패키지의 여러 버전은 빌드를 키우고, 한 사본의 보안 수정이 다른 사본에 반영되지 않을 수 있습니다.'),
    fix: t('Align the dependents on one version (dedupe, overrides, resolutions, dependencyManagement).',
      '의존하는 쪽을 한 버전으로 맞추세요(dedupe, overrides, resolutions, dependencyManagement).'),
  },
  {
    key: 'sca:manifest-error', type: 'CODE_SMELL', severity: 'INFO', debtMin: 5,
    tags: ['sca'], checker: 'SCA_PARSE_ERROR', category: 'Software composition',
    name: t('Dependency manifests should be parseable', '의존성 매니페스트는 해석할 수 있어야 합니다'),
    why: t('The manifest or lockfile could not be parsed, so its dependencies were not analysed.',
      '매니페스트나 lockfile 을 해석하지 못해 의존성을 분석하지 못했습니다.'),
    fix: t('Fix the syntax error or regenerate the lockfile.', '문법 오류를 고치거나 lockfile 을 다시 만드세요.'),
  },
];

for (const r of RULES) r.langs = ['*'];

function catalog() {
  return RULES.map((r) => ({ ...r, tags: [...r.tags], langs: [...r.langs] }));
}

module.exports = { RULES, catalog };
