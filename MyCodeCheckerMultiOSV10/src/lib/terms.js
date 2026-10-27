// Explanations of the terms the views show, for the term tooltips
// (components/TermTip.jsx): an element with data-term="<key>" shows the name
// and text of TERMS[key] on hover or focus. Metric keys (bugs, sqale_index …)
// match the measure names; "new_<metric>" falls back to <metric> and says
// that it counts new code only.

export const TERMS = {
  bugs: {
    ko: ['버그', '잘못 동작하거나 실행 중 오류를 낼 수 있는 코드입니다(널 참조, 범위 밖 접근, 잘못된 비교 등). 신뢰성 등급을 정합니다.'],
    en: ['Bugs', 'Code that can behave wrongly or fail at run time (null dereference, out-of-bounds access, wrong comparison …). Sets the reliability rating.'],
  },
  vulnerabilities: {
    ko: ['취약점', '공격에 악용될 수 있는 코드입니다(SQL 주입, 경로 조작, 하드코딩된 비밀번호 등). 보안 등급을 정합니다.'],
    en: ['Vulnerabilities', 'Code an attacker can exploit (SQL injection, path traversal, hard-coded passwords …). Sets the security rating.'],
  },
  code_smells: {
    ko: ['코드 스멜', '당장 오류는 아니지만 읽고 고치기 어렵게 만드는 코드입니다(긴 함수, 중복, 복잡한 조건 등). 고치는 데 드는 시간이 기술 부채가 됩니다.'],
    en: ['Code smells', 'Code that is not wrong yet but hard to read and change (long functions, duplication, complex conditions …). The time to fix them is the technical debt.'],
  },
  security_hotspots: {
    ko: ['보안 핫스팟', '보안상 민감해 사람이 검토해야 하는 코드입니다(암호화, 쿠키, 정규식, 권한 등). 문제인지 아닌지는 검토 결과로 정합니다.'],
    en: ['Security hotspots', 'Security-sensitive code a person has to review (cryptography, cookies, regular expressions, permissions …). Review decides whether it is a problem.'],
  },
  security_hotspots_reviewed: {
    ko: ['검토한 핫스팟 %', '보안 핫스팟 가운데 검토를 마친(안전 · 수정됨 · 확인) 비율입니다.'],
    en: ['Hotspots reviewed %', 'The share of security hotspots that have been reviewed (safe, fixed, acknowledged).'],
  },
  reliability_rating: {
    ko: ['신뢰성 등급', '남은 버그 가운데 가장 심각한 것으로 정합니다. A 버그 없음, B 경미, C 주요, D 심각, E 차단.'],
    en: ['Reliability rating', 'From the worst open bug: A none, B minor, C major, D critical, E blocker.'],
  },
  security_rating: {
    ko: ['보안 등급', '남은 취약점 가운데 가장 심각한 것으로 정합니다. A 취약점 없음, B 경미, C 주요, D 심각, E 차단.'],
    en: ['Security rating', 'From the worst open vulnerability: A none, B minor, C major, D critical, E blocker.'],
  },
  maintainability_rating: {
    ko: ['유지보수성 등급', '기술 부채 비율로 정합니다. A ≤ 5%, B ≤ 10%, C ≤ 20%, D ≤ 50%, E > 50%.'],
    en: ['Maintainability rating', 'From the technical debt ratio: A ≤ 5%, B ≤ 10%, C ≤ 20%, D ≤ 50%, E > 50%.'],
  },
  security_review_rating: {
    ko: ['보안 검토 등급', '검토한 핫스팟 비율로 정합니다. A ≥ 80%, B ≥ 70%, C ≥ 50%, D ≥ 30%, E < 30%.'],
    en: ['Security review rating', 'From the share of reviewed hotspots: A ≥ 80%, B ≥ 70%, C ≥ 50%, D ≥ 30%, E < 30%.'],
  },
  sqale_index: {
    ko: ['기술 부채', '남은 코드 스멜을 모두 고치는 데 드는 예상 시간(분)입니다. 하루는 8시간으로 셉니다.'],
    en: ['Technical debt', 'The estimated time (minutes) to fix every open code smell; a day counts as 8 hours.'],
  },
  sqale_debt_ratio: {
    ko: ['부채 비율', '기술 부채 ÷ 코드를 새로 쓰는 데 드는 시간(코드 줄 × 30분)입니다. 유지보수성 등급을 정합니다.'],
    en: ['Debt ratio', 'Technical debt / the time to write the code again (lines of code × 30 minutes). Sets the maintainability rating.'],
  },
  coverage: {
    ko: ['커버리지', '테스트가 실행한 코드 줄의 비율입니다. 커버리지 보고서(LCOV, Cobertura, JaCoCo …)를 연결해야 계산됩니다.'],
    en: ['Coverage', 'The share of code lines the tests ran. Needs a coverage report (LCOV, Cobertura, JaCoCo …).'],
  },
  duplicated_lines_density: {
    ko: ['중복 줄 %', '다른 곳과 같은 코드 덩어리(복사 · 붙여넣기)에 속한 줄의 비율입니다.'],
    en: ['Duplicated lines %', 'The share of lines in blocks of code that also appear elsewhere (copy and paste).'],
  },
  duplicated_lines: { ko: ['중복 줄', '중복 덩어리에 속한 줄 수입니다.'], en: ['Duplicated lines', 'Lines in duplicated blocks.'] },
  ncloc: {
    ko: ['코드 줄', '빈 줄과 주석을 뺀 실제 코드 줄 수입니다(NCLOC).'],
    en: ['Lines of code', 'Lines with code, without blank lines and comments (NCLOC).'],
  },
  complexity: {
    ko: ['복잡도', '순환 복잡도(분기 수 + 1)의 합입니다. 클수록 시험할 경로가 많습니다.'],
    en: ['Complexity', 'The sum of cyclomatic complexity (decisions + 1). Higher means more paths to test.'],
  },
  comment_density: {
    ko: ['주석 밀도', '주석 줄 ÷ (코드 줄 + 주석 줄)입니다.'],
    en: ['Comment density', 'Comment lines / (code lines + comment lines).'],
  },
  new_code: {
    ko: ['새 코드', '새 코드 기준(직전 분석 · 일 수 · 버전 · 브랜치) 이후 바뀌거나 추가된 코드입니다. 설정 › 새 코드에서 정합니다.'],
    en: ['New code', 'Code changed or added since the new-code baseline (previous analysis, days, version, branch). Set in Settings › New code.'],
  },
  quality_gate: {
    ko: ['품질 게이트', '분석 결과가 통과해야 하는 조건 목록입니다. 기본 게이트는 지금의 코드 전체로 판정하며 설정 › 품질 게이트에서 조정합니다.'],
    en: ['Quality gate', 'The conditions an analysis has to pass. The default gate judges the whole code as it is now; adjust it in Settings › Quality gate.'],
  },
  ca: {
    ko: ['Ca · 구심 결합', '이 모듈을 가져다 쓰는(이 모듈에 의존하는) 다른 모듈의 수입니다. 클수록 많은 곳이 기대고 있어 바꾸기 조심스럽습니다.'],
    en: ['Ca · afferent coupling', 'How many other modules use (depend on) this module. High means much relies on it.'],
  },
  ce: {
    ko: ['Ce · 원심 결합', '이 모듈이 가져다 쓰는 다른 모듈의 수입니다. 클수록 다른 모듈이 바뀔 때 영향을 받습니다.'],
    en: ['Ce · efferent coupling', 'How many other modules this module uses. High means changes elsewhere affect it.'],
  },
  instability: {
    ko: ['I · 불안정도', 'I = Ce ÷ (Ca + Ce), 0~1. 0에 가까우면 안정, 1에 가까우면 불안정입니다. 의존은 I가 작은 쪽으로 향하는 것이 좋습니다.'],
    en: ['I · instability', 'I = Ce / (Ca + Ce), 0 to 1. Near 0 is stable, near 1 unstable. Dependencies should point towards lower I.'],
  },
  cycle: {
    ko: ['순환 의존', '모듈들이 서로를 거쳐 다시 자기 자신에게 돌아오는 의존입니다(그래프의 빨간 선). 끊는 것이 좋습니다.'],
    en: ['Dependency cycle', 'Modules depending on each other in a loop (red edges in the graph); best broken.'],
  },
  cid: {
    ko: ['CID · 결함 식별자', '분석이 바뀌어도 같은 결함을 같은 번호로 추적하는 식별자입니다. 스냅숏끼리 CID로 새 결함과 고쳐진 결함을 비교합니다.'],
    en: ['CID · defect identifier', 'Keeps the same number for the same defect across analyses; snapshots are compared by CID.'],
  },
  impact: {
    ko: ['영향', '결함이 일으킬 수 있는 피해의 크기(높음 · 보통 · 낮음)입니다.'],
    en: ['Impact', 'How much harm the defect can do (High, Medium, Low).'],
  },
  checker: {
    ko: ['체커', '결함을 찾은 검사 규칙의 이름입니다(예: NULL_RETURNS, RESOURCE_LEAK).'],
    en: ['Checker', 'The name of the check that found the defect (e.g. NULL_RETURNS, RESOURCE_LEAK).'],
  },
  outstanding: { ko: ['미해결', '고치지도 기각하지도 않은 결함입니다.'], en: ['Outstanding', 'Defects neither fixed nor dismissed.'] },
  dismissed: { ko: ['기각', '오탐(False Positive) 또는 의도됨(Intentional)으로 분류한 결함입니다.'], en: ['Dismissed', 'Defects classified as False Positive or Intentional.'] },
  pr_target: {
    ko: ['대상 브랜치', 'PR이 합쳐질 브랜치(예: main)입니다. 이 브랜치와 비교해 바뀐 파일과 줄을 git으로 구합니다.'],
    en: ['Target branch', 'The branch the pull request merges into (e.g. main); changed files and lines come from git against it.'],
  },
  pr_base: {
    ko: ['기준 커밋', '이 브랜치가 대상 브랜치에서 갈라진 커밋(merge-base)입니다. 이 커밋 이후 바뀐 줄만 봅니다.'],
    en: ['Base commit', 'The commit where this branch split from the target (merge base); only lines changed since it are reviewed.'],
  },
  pr_changed: {
    ko: ['바뀐 파일 · 줄', '대상 브랜치와 비교해 추가 · 수정된 파일과 줄의 수입니다(커밋 안 한 변경 포함). PR 분석은 이 줄의 이슈만 셉니다.'],
    en: ['Changed files, lines', 'Files and lines added or modified against the target branch (uncommitted changes included); the PR counts issues on these lines only.'],
  },
  pr_gate: {
    ko: ['PR 게이트', 'PR에 쓰는 품질 게이트입니다. 바뀐 줄(새 코드)의 버그 · 취약점 · 핫스팟 검토율 · 커버리지 · 중복률 · 등급으로 판정합니다.'],
    en: ['PR gate', 'The quality gate for pull requests: judges the changed lines (new code) by bugs, vulnerabilities, hotspots reviewed, coverage, duplication and ratings.'],
  },
  pr_threshold: {
    ko: ['기준', '조건의 연산자와 기준값입니다. GT 0이면 0보다 클 때, LT 80이면 80보다 작을 때 실패합니다.'],
    en: ['Threshold', 'The condition’s operator and limit: GT 0 fails above 0, LT 80 fails below 80.'],
  },
  pr_actual: { ko: ['값', '이 PR의 바뀐 줄에서 잰 실제 값입니다.'], en: ['Actual', 'The value measured on this pull request’s changed lines.'] },
  pr_decoration: {
    ko: ['장식(데코레이션)', '코드 호스트가 PR 화면에 결과(상태 · 요약 · 줄별 주석)를 표시하도록 보내는 JSON 본문입니다. GitHub Checks, GitLab Code Quality, Azure DevOps 스레드, Bitbucket Code Insights 형식입니다.'],
    en: ['Decoration', 'The JSON the code host uses to show results on a pull request (status, summary, line comments): GitHub Checks, GitLab Code Quality, Azure DevOps threads, Bitbucket Code Insights.'],
  },
  pr_head_sha: {
    ko: ['헤드 커밋 SHA', 'PR의 마지막 커밋 해시입니다. 커밋에 결과를 붙이는 호스트(GitHub Checks)에 필요하며, 비우면 지금 커밋을 씁니다.'],
    en: ['Head commit SHA', 'The hash of the pull request’s last commit, needed by hosts that attach results to a commit (GitHub Checks); empty uses the current commit.'],
  },
  pr_dirty: { ko: ['커밋 안 한 변경', '작업 폴더에 커밋하지 않은 변경이 있습니다. 바뀐 줄 계산에 함께 들어갑니다.'], en: ['Uncommitted changes', 'The working folder has uncommitted changes; they count as changed lines.'] },
  severity: {
    ko: ['심각도', '이슈가 미치는 영향의 크기입니다. 차단 > 심각 > 주요 > 경미 > 정보.'],
    en: ['Severity', 'How serious an issue is: Blocker > Critical > Major > Minor > Info.'],
  },
};

/** [name, text] of a term in a language, or null. */
export function termOf(key, lang) {
  if (!key) return null;
  const k = String(key);
  const hit = TERMS[k] || (k.startsWith('new_') ? TERMS[k.slice(4)] : null);
  if (!hit) return null;
  const [name, text] = hit[lang] || hit.en;
  if (TERMS[k]) return [name, text];
  return lang === 'ko' ? [`새 코드 · ${name}`, `${text} (새 코드만 셉니다.)`] : [`New code · ${name}`, `${text} (Counts new code only.)`];
}
