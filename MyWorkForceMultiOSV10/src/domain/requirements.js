// Requirements traceability and test management, kept inside the ordinary issue model.
//
//   requirement  a "shall" statement (issue type 'requirement'); issue.req holds its category, source,
//                verification method, acceptance criteria, rationale and an external ID (ReqIF / CSV).
//   testcase     how something is checked (issue type 'testcase'); issue.test holds the level, manual or
//                automated, the precondition and the steps (action, data, expected result).
//   testexec     one pass over test cases on a version (issue type 'testexec'); issue.exec holds the
//                version and one run per test case (pass, fail, blocked, not run) with a note and defects.
//
// The trace is made of issue links:
//   story / task / …  "implements"  requirement
//   testcase          "verifies"    requirement
//   requirement       "refines"     parent requirement
//   testcase / exec   "found"       bug
// A requirement's coverage comes from the latest result of every test case that verifies it. A requirement
// whose text changed after its last passing result is "suspect": the tests should be run again.
import { allowed } from './permissions.js';
import { byId, clone, nowIso, uid } from './util.js';

export const QUALITY_TYPES = [
  { id: 'requirement', ko: '요구 사항', en: 'Requirement', color: '#b45309' },
  { id: 'testcase', ko: '테스트 케이스', en: 'Test case', color: '#0891b2' },
  { id: 'testexec', ko: '테스트 실행', en: 'Test execution', color: '#4f46e5' },
];

export const QUALITY_LINKS = [
  { id: 'implements', ko: '구현함', en: 'implements', inverseKo: '다음으로 구현됨', inverseEn: 'is implemented by' },
  { id: 'verifies', ko: '검증함', en: 'verifies', inverseKo: '다음으로 검증됨', inverseEn: 'is verified by' },
  { id: 'refines', ko: '세분화함', en: 'refines', inverseKo: '다음으로 세분화됨', inverseEn: 'is refined by' },
  { id: 'found', ko: '결함 발견', en: 'found', inverseKo: '다음에서 발견됨', inverseEn: 'was found by' },
];

export const REQ_CATEGORIES = [
  { id: 'functional', ko: '기능', en: 'Functional' },
  { id: 'performance', ko: '성능', en: 'Performance' },
  { id: 'interface', ko: '인터페이스', en: 'Interface' },
  { id: 'security', ko: '보안', en: 'Security' },
  { id: 'safety', ko: '안전', en: 'Safety' },
  { id: 'usability', ko: '사용성', en: 'Usability' },
  { id: 'reliability', ko: '신뢰성', en: 'Reliability' },
  { id: 'regulatory', ko: '규제', en: 'Regulatory' },
  { id: 'constraint', ko: '제약', en: 'Constraint' },
];

/** The four classic verification methods (IADT). */
export const VERIFY_METHODS = [
  { id: 'test', ko: '시험', en: 'Test' },
  { id: 'inspection', ko: '검사', en: 'Inspection' },
  { id: 'analysis', ko: '분석', en: 'Analysis' },
  { id: 'demonstration', ko: '시연', en: 'Demonstration' },
];

export const TEST_LEVELS = [
  { id: 'unit', ko: '단위', en: 'Unit' },
  { id: 'integration', ko: '통합', en: 'Integration' },
  { id: 'system', ko: '시스템', en: 'System' },
  { id: 'acceptance', ko: '인수', en: 'Acceptance' },
  { id: 'regression', ko: '회귀', en: 'Regression' },
];

export const TEST_KINDS = [
  { id: 'manual', ko: '수동', en: 'Manual' },
  { id: 'automated', ko: '자동', en: 'Automated' },
];

export const RESULTS = [
  { id: 'notrun', ko: '실행 안 함', en: 'Not run', color: '#64748b' },
  { id: 'pass', ko: '통과', en: 'Pass', color: '#30a46c' },
  { id: 'fail', ko: '실패', en: 'Fail', color: '#e5484d' },
  { id: 'blocked', ko: '막힘', en: 'Blocked', color: '#f5a524' },
];

/** What a requirement's tests say about it, worst first. */
export const COVERAGE = [
  { id: 'failed', ko: '실패', en: 'Failed', color: '#e5484d' },
  { id: 'blocked', ko: '막힘', en: 'Blocked', color: '#f5a524' },
  { id: 'uncovered', ko: '테스트 없음', en: 'Not covered', color: '#94a3b8' },
  { id: 'notrun', ko: '실행 전', en: 'Not run', color: '#64748b' },
  { id: 'partial', ko: '일부 통과', en: 'Partly passed', color: '#3a6cf0' },
  { id: 'passed', ko: '통과', en: 'Passed', color: '#30a46c' },
  { id: 'other', ko: '시험 외 검증', en: 'Verified otherwise', color: '#7c3aed' },
];

const QUALITY_TYPE_IDS = new Set(QUALITY_TYPES.map((type) => type.id));
const pick = (list, value, fallback) => (list.some((item) => item.id === value) ? value : fallback);
const text = (value) => String(value ?? '');

export const isRequirement = (issue) => issue?.typeId === 'requirement';
export const isTestCase = (issue) => issue?.typeId === 'testcase';
export const isTestExec = (issue) => issue?.typeId === 'testexec';
export const isQualityType = (typeId) => QUALITY_TYPE_IDS.has(typeId);

// ── Shapes ──

export function normalizeReq(req = {}) {
  return {
    externalId: text(req.externalId).trim(),
    category: pick(REQ_CATEGORIES, req.category, 'functional'),
    source: text(req.source),
    method: pick(VERIFY_METHODS, req.method, 'test'),
    criteria: text(req.criteria),
    rationale: text(req.rationale),
    baseline: text(req.baseline),
  };
}

export function normalizeStep(step = {}) {
  return { id: step.id || uid('st'), action: text(step.action), data: text(step.data), expected: text(step.expected) };
}

export function normalizeTest(test = {}) {
  return {
    externalId: text(test.externalId).trim(),
    level: pick(TEST_LEVELS, test.level, 'system'),
    kind: pick(TEST_KINDS, test.kind, 'manual'),
    precondition: text(test.precondition),
    steps: Array.isArray(test.steps) ? test.steps.map(normalizeStep) : [],
    script: text(test.script),
  };
}

export function normalizeRun(run = {}) {
  return {
    testId: text(run.testId),
    result: pick(RESULTS, run.result, 'notrun'),
    note: text(run.note),
    at: text(run.at),
    by: text(run.by),
    defectIds: Array.isArray(run.defectIds) ? run.defectIds.map(String) : [],
  };
}

export function normalizeExec(exec = {}) {
  const runs = Array.isArray(exec.runs) ? exec.runs.map(normalizeRun).filter((run) => run.testId) : [];
  const seen = new Set();
  return { versionId: text(exec.versionId), runs: runs.filter((run) => !seen.has(run.testId) && seen.add(run.testId)) };
}

/** Gives a quality issue its structured part (called from upgradeIssue). Other issues are left alone. */
export function upgradeQualityIssue(issue) {
  if (isRequirement(issue)) issue.req = normalizeReq(issue.req);
  if (isTestCase(issue)) issue.test = normalizeTest(issue.test);
  if (isTestExec(issue)) issue.exec = normalizeExec(issue.exec);
  return issue;
}

/**
 * A project that tracks requirements or tests gets the three issue types (once; renamed types are kept).
 * `force` adds them anyway (making a requirement or importing a specification in any project).
 */
export function ensureQualityTypes(project, force = false) {
  const methods = project.methods || [];
  if (!force && !methods.includes('requirements') && !methods.includes('testing')) return project;
  project.issueTypes = project.issueTypes || [];
  for (const type of QUALITY_TYPES) if (!project.issueTypes.some((item) => item.id === type.id)) project.issueTypes.push(clone(type));
  return project;
}

// ── Reading the trace ──

const linked = (project, issue, type, direction) => (issue.links || [])
  .filter((link) => link.type === type && link.direction === direction)
  .map((link) => project.issues.find((item) => item.id === link.otherId)).filter(Boolean);

const isDone = (project, issue) => byId(project.statuses, issue.statusId)?.category === 'done';

/** Latest result of every test case across all executions: Map testId → { result, at, exec, note }. */
export function latestResults(project) {
  const latest = new Map();
  for (const exec of project.issues) {
    if (!isTestExec(exec)) continue;
    for (const run of exec.exec?.runs || []) {
      if (run.result === 'notrun') continue;
      const before = latest.get(run.testId);
      if (!before || String(run.at) >= String(before.at)) latest.set(run.testId, { result: run.result, at: run.at, exec, note: run.note });
    }
  }
  return latest;
}

/** Every run of one test case, newest first. */
export function testHistory(project, test) {
  const rows = [];
  for (const exec of project.issues) {
    if (!isTestExec(exec)) continue;
    const run = (exec.exec?.runs || []).find((item) => item.testId === test.id);
    if (run) rows.push({ ...run, exec });
  }
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

function coverageState(req, tests, results) {
  if (!tests.length) return req.req?.method && req.req.method !== 'test' ? 'other' : 'uncovered';
  const states = tests.map((test) => results.get(test.id)?.result || 'notrun');
  if (states.includes('fail')) return 'failed';
  if (states.includes('blocked')) return 'blocked';
  if (states.every((state) => state === 'pass')) return 'passed';
  if (states.includes('pass')) return 'partial';
  return 'notrun';
}

/** Whether the requirement's wording changed after the newest passing result of its tests. */
function suspectOf(req, tests, results) {
  const passes = tests.map((test) => results.get(test.id)).filter((hit) => hit?.result === 'pass').map((hit) => String(hit.at));
  if (!passes.length) return false;
  const lastPass = passes.sort().pop();
  return (req.history || []).some((entry) => ['summary', 'description', 'req'].includes(entry.field) && String(entry.at) > lastPass);
}

/** A parent requirement without tests of its own is as good as the requirements that refine it. */
function rollUp(states) {
  if (states.includes('failed')) return 'failed';
  if (states.includes('blocked')) return 'blocked';
  if (states.every((state) => state === 'passed' || state === 'other')) return 'passed';
  if (states.some((state) => ['passed', 'partial', 'other'].includes(state))) return 'partial';
  if (states.includes('notrun')) return 'notrun';
  return 'uncovered';
}

/** Everything the trace knows about one requirement. */
export function traceOf(project, req, results = latestResults(project), seen = new Set()) {
  const implementedBy = linked(project, req, 'implements', 'in');
  const tests = linked(project, req, 'verifies', 'in').filter(isTestCase);
  const parents = linked(project, req, 'refines', 'out').filter(isRequirement);
  const children = linked(project, req, 'refines', 'in').filter(isRequirement);
  const defects = new Map();
  for (const test of tests) for (const bug of linked(project, test, 'found', 'out')) defects.set(bug.id, bug);
  for (const bug of linked(project, req, 'relates', 'out').concat(linked(project, req, 'relates', 'in'))) if (bug.typeId === 'bug') defects.set(bug.id, bug);
  const doneImpl = implementedBy.filter((issue) => isDone(project, issue)).length;
  seen.add(req.id);
  let coverage = coverageState(req, tests, results);
  const kids = children.filter((child) => !seen.has(child.id));
  if (!tests.length && kids.length) coverage = rollUp(kids.map((child) => traceOf(project, child, results, seen).coverage));
  return {
    requirement: req,
    implementedBy,
    tests,
    parents,
    children,
    defects: [...defects.values()],
    openDefects: [...defects.values()].filter((bug) => !isDone(project, bug)),
    results: tests.map((test) => ({ test, ...(results.get(test.id) || { result: 'notrun', at: '', exec: null, note: '' }) })),
    coverage,
    rolledUp: !tests.length && kids.length > 0,
    implementation: !implementedBy.length ? 'none' : doneImpl === implementedBy.length ? 'done' : doneImpl ? 'partial' : 'open',
    suspect: suspectOf(req, tests, results),
  };
}

/** Requirements in document order: parents first, each followed by the requirements that refine it. */
export function requirementTree(project) {
  const reqs = project.issues.filter(isRequirement).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.key.localeCompare(b.key, undefined, { numeric: true }));
  const ids = new Set(reqs.map((req) => req.id));
  const parentOf = new Map();
  for (const req of reqs) {
    const parent = (req.links || []).find((link) => link.type === 'refines' && link.direction === 'out' && ids.has(link.otherId));
    if (parent) parentOf.set(req.id, parent.otherId);
  }
  const out = [];
  const seen = new Set();
  const walk = (req, depth, number) => {
    if (seen.has(req.id)) return;
    seen.add(req.id);
    out.push({ req, depth, number });
    reqs.filter((child) => parentOf.get(child.id) === req.id).forEach((child, index) => walk(child, depth + 1, `${number}.${index + 1}`));
  };
  reqs.filter((req) => !parentOf.has(req.id)).forEach((req, index) => walk(req, 0, String(index + 1)));
  reqs.forEach((req) => walk(req, 0, '?'));
  return out;
}

/** The whole matrix: one row per requirement, plus totals. */
export function traceMatrix(project) {
  const results = latestResults(project);
  const rows = requirementTree(project).map(({ req, depth, number }) => ({ depth, number, ...traceOf(project, req, results) }));
  const count = (state) => rows.filter((row) => row.coverage === state).length;
  const total = rows.length;
  const covered = rows.filter((row) => row.tests.length || row.coverage === 'other' || (row.rolledUp && row.coverage !== 'uncovered')).length;
  const passed = count('passed') + count('other');
  return {
    rows,
    totals: {
      total,
      covered,
      passed,
      failed: count('failed'),
      blocked: count('blocked'),
      uncovered: count('uncovered'),
      suspect: rows.filter((row) => row.suspect).length,
      implemented: rows.filter((row) => row.implementation === 'done').length,
      coveredPct: total ? Math.round((covered / total) * 100) : 0,
      passedPct: total ? Math.round((passed / total) * 100) : 0,
    },
  };
}

/** Pass / fail / blocked / not-run counts of one execution. */
export function execProgress(exec) {
  const counts = { pass: 0, fail: 0, blocked: 0, notrun: 0 };
  for (const run of exec.exec?.runs || []) counts[run.result] = (counts[run.result] || 0) + 1;
  const total = (exec.exec?.runs || []).length;
  return { ...counts, total, donePct: total ? Math.round(((total - counts.notrun) / total) * 100) : 0, passPct: total ? Math.round((counts.pass / total) * 100) : 0 };
}

/** Requirements a test case verifies. */
export function verifiedBy(project, test) {
  return linked(project, test, 'verifies', 'out').filter(isRequirement);
}

/** Test cases with no requirement to verify and requirements with no test: the gaps a review asks about. */
export function traceGaps(project) {
  const results = latestResults(project);
  return {
    untestedRequirements: project.issues.filter((issue) => isRequirement(issue) && traceOf(project, issue, results).coverage === 'uncovered'),
    orphanTests: project.issues.filter((issue) => isTestCase(issue) && !verifiedBy(project, issue).length),
    neverRun: project.issues.filter((issue) => isTestCase(issue) && !results.has(issue.id)),
  };
}

// ── Changing ──

function mustEdit(ws, project, actorId) {
  if (actorId && !allowed(ws, project, actorId, 'edit')) throw new Error('permission');
}

function record(issue, actorId, field, before, after) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  issue.history = issue.history || [];
  issue.history.push({ id: uid('h'), at: nowIso(), actorId: actorId || '', field, from: clone(before), to: clone(after) });
  issue.updated = nowIso();
}

/** Sets one field of a requirement (category, source, method, criteria, rationale, baseline, externalId). */
export function setRequirementField(ws, project, issue, key, value, actorId) {
  mustEdit(ws, project, actorId);
  if (!isRequirement(issue)) throw new Error('not-found');
  const before = normalizeReq(issue.req);
  issue.req = normalizeReq({ ...before, [key]: value });
  record(issue, actorId, 'req', before, issue.req);
  return issue.req;
}

/** Sets one field of a test case (level, kind, precondition, script, externalId). */
export function setTestField(ws, project, issue, key, value, actorId) {
  mustEdit(ws, project, actorId);
  if (!isTestCase(issue)) throw new Error('not-found');
  const before = normalizeTest(issue.test);
  issue.test = normalizeTest({ ...before, [key]: value });
  record(issue, actorId, 'test', before, issue.test);
  return issue.test;
}

export function addStep(ws, project, issue, step = {}, actorId) {
  mustEdit(ws, project, actorId);
  if (!isTestCase(issue)) throw new Error('not-found');
  const before = normalizeTest(issue.test);
  issue.test = normalizeTest({ ...before, steps: [...before.steps, normalizeStep(step)] });
  record(issue, actorId, 'test', before, issue.test);
  return issue.test.steps.at(-1);
}

export function updateStep(ws, project, issue, stepId, patch, actorId) {
  mustEdit(ws, project, actorId);
  const before = normalizeTest(issue.test);
  const steps = before.steps.map((step) => (step.id === stepId ? normalizeStep({ ...step, ...patch, id: step.id }) : step));
  issue.test = normalizeTest({ ...before, steps });
  record(issue, actorId, 'test', before, issue.test);
}

export function removeStep(ws, project, issue, stepId, actorId) {
  mustEdit(ws, project, actorId);
  const before = normalizeTest(issue.test);
  issue.test = normalizeTest({ ...before, steps: before.steps.filter((step) => step.id !== stepId) });
  record(issue, actorId, 'test', before, issue.test);
}

export function moveStep(ws, project, issue, stepId, delta, actorId) {
  mustEdit(ws, project, actorId);
  const before = normalizeTest(issue.test);
  const steps = [...before.steps];
  const at = steps.findIndex((step) => step.id === stepId);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= steps.length) return;
  [steps[at], steps[to]] = [steps[to], steps[at]];
  issue.test = normalizeTest({ ...before, steps });
  record(issue, actorId, 'test', before, issue.test);
}

/** Puts test cases into an execution by ID or key; returns the ones added. */
export function addExecTests(ws, project, exec, refs, actorId) {
  mustEdit(ws, project, actorId);
  if (!isTestExec(exec)) throw new Error('not-found');
  const before = normalizeExec(exec.exec);
  const have = new Set(before.runs.map((run) => run.testId));
  const added = [];
  for (const ref of refs) {
    const key = String(ref || '').trim().toLowerCase();
    if (!key) continue;
    const test = project.issues.find((item) => isTestCase(item) && (item.id === ref || item.key.toLowerCase() === key));
    if (!test) throw new Error('not-found');
    if (have.has(test.id)) continue;
    have.add(test.id);
    added.push(test);
  }
  exec.exec = normalizeExec({ ...before, runs: [...before.runs, ...added.map((test) => ({ testId: test.id }))] });
  if (added.length) record(exec, actorId, 'exec', before, exec.exec);
  return added;
}

export function removeExecTest(ws, project, exec, testId, actorId) {
  mustEdit(ws, project, actorId);
  const before = normalizeExec(exec.exec);
  exec.exec = normalizeExec({ ...before, runs: before.runs.filter((run) => run.testId !== testId) });
  record(exec, actorId, 'exec', before, exec.exec);
}

/** The version an execution tests. */
export function setExecVersion(ws, project, exec, versionId, actorId) {
  mustEdit(ws, project, actorId);
  if (!isTestExec(exec)) throw new Error('not-found');
  if (versionId && !(project.versions || []).some((version) => version.id === versionId)) throw new Error('not-found');
  const before = normalizeExec(exec.exec);
  exec.exec = normalizeExec({ ...before, versionId: versionId || '' });
  record(exec, actorId, 'exec', before, exec.exec);
}

/** Records a result (and optionally a note) for one test case in an execution. */
export function recordResult(ws, project, exec, testId, patch, actorId) {
  mustEdit(ws, project, actorId);
  if (!isTestExec(exec)) throw new Error('not-found');
  const before = normalizeExec(exec.exec);
  if (!before.runs.some((run) => run.testId === testId)) throw new Error('not-found');
  const runs = before.runs.map((run) => {
    if (run.testId !== testId) return run;
    const next = { ...run, ...patch };
    if (patch.result != null && patch.result !== run.result) { next.at = nowIso(); next.by = actorId || ''; }
    return normalizeRun(next);
  });
  exec.exec = normalizeExec({ ...before, runs });
  record(exec, actorId, 'exec', before, exec.exec);
  return exec.exec.runs.find((run) => run.testId === testId);
}

/** Notes a defect found while running a test: the run lists it and the test case gets a "found" link. */
export function attachDefect(project, exec, testId, bug) {
  const run = exec.exec?.runs?.find((item) => item.testId === testId);
  if (run && !run.defectIds.includes(bug.id)) run.defectIds.push(bug.id);
  const test = project.issues.find((item) => item.id === testId);
  if (test && !(test.links || []).some((link) => link.type === 'found' && link.otherId === bug.id)) {
    const id = uid('l');
    test.links.push({ id, type: 'found', direction: 'out', otherId: bug.id });
    bug.links.push({ id, type: 'found', direction: 'in', otherId: test.id });
  }
}

// ── Issue formats: ready-made shapes for the "New issue" dialog ──

const F = (id, typeId, glyph, name, about, description, extra = {}) => ({ id, typeId, glyph, ko: name[0], en: name[1], aboutKo: about[0], aboutEn: about[1], description, ...extra });

export const ISSUE_FORMATS = [
  F('req-functional', 'requirement', 'flag', ['기능 요구 사항', 'Functional requirement'], ['"시스템은 …해야 한다" 형식과 수용 기준', 'A "shall" statement with acceptance criteria'], [
    '## 요구 사항\n시스템은 [조건]일 때 [대상]에 대해 [동작]해야 한다.\n\n## 배경\n…\n\n## 수용 기준\n- Given …\n- When …\n- Then …',
    '## Requirement\nThe system shall [action] [object] when [condition].\n\n## Background\n…\n\n## Acceptance criteria\n- Given …\n- When …\n- Then …',
  ], { req: { category: 'functional', method: 'test' } }),
  F('req-performance', 'requirement', 'clock', ['성능 요구 사항', 'Performance requirement'], ['측정 항목, 목표값, 측정 조건', 'Metric, target and measuring conditions'], [
    '## 요구 사항\n시스템은 [조건]에서 [측정 항목]을 [목표값] 이내로 유지해야 한다.\n\n| 항목 | 목표 | 측정 조건 |\n| --- | --- | --- |\n| 응답 시간 (p95) | 500 ms | 동시 사용자 200명 |',
    '## Requirement\nThe system shall keep [metric] within [target] under [condition].\n\n| Metric | Target | Conditions |\n| --- | --- | --- |\n| Response time (p95) | 500 ms | 200 concurrent users |',
  ], { req: { category: 'performance', method: 'test' } }),
  F('req-interface', 'requirement', 'link', ['인터페이스 요구 사항', 'Interface requirement'], ['주고받는 시스템, 형식, 오류 처리', 'Systems, message format and error handling'], [
    '## 요구 사항\n시스템은 [외부 시스템]과 [프로토콜]로 [데이터]를 주고받아야 한다.\n\n## 메시지 형식\n| 필드 | 형식 | 필수 |\n| --- | --- | --- |\n| id | 문자열 | 예 |\n\n## 오류 처리\n…',
    '## Requirement\nThe system shall exchange [data] with [external system] over [protocol].\n\n## Message format\n| Field | Type | Required |\n| --- | --- | --- |\n| id | string | yes |\n\n## Error handling\n…',
  ], { req: { category: 'interface', method: 'test' } }),
  F('req-security', 'requirement', 'shield', ['보안 요구 사항', 'Security requirement'], ['위협, 통제, 검증 방법', 'Threat, control and how it is checked'], [
    '## 요구 사항\n시스템은 [자산]을 [위협]으로부터 보호하기 위해 [통제]를 적용해야 한다.\n\n## 위협\n…\n\n## 수용 기준\n- …',
    '## Requirement\nThe system shall apply [control] to protect [asset] from [threat].\n\n## Threat\n…\n\n## Acceptance criteria\n- …',
  ], { req: { category: 'security', method: 'test' } }),
  F('req-regulatory', 'requirement', 'book', ['규제 요구 사항', 'Regulatory requirement'], ['근거 조항, 해석, 증빙', 'Clause, interpretation and evidence'], [
    '## 요구 사항\n[규격/법령] [조항]에 따라 시스템은 …해야 한다.\n\n## 근거\n…\n\n## 증빙\n- 검사 기록\n- 분석 보고서',
    '## Requirement\nPer [standard] [clause], the system shall …\n\n## Basis\n…\n\n## Evidence\n- Inspection record\n- Analysis report',
  ], { req: { category: 'regulatory', method: 'inspection' } }),
  F('test-manual', 'testcase', 'list', ['수동 테스트 케이스', 'Manual test case'], ['전제 조건과 단계별 기대 결과', 'Precondition and expected result per step'], [
    '## 목적\n이 테스트가 확인하는 것을 한 문장으로 적습니다.',
    '## Purpose\nOne sentence on what this test checks.',
  ], { test: { level: 'system', kind: 'manual', precondition: '', steps: [{ action: '', data: '', expected: '' }] } }),
  F('test-acceptance', 'testcase', 'check', ['인수 테스트 (Given/When/Then)', 'Acceptance test (Given/When/Then)'], ['수용 기준을 그대로 시험합니다', 'Turns acceptance criteria into a test'], [
    '## 시나리오\nGiven …\nWhen …\nThen …',
    '## Scenario\nGiven …\nWhen …\nThen …',
  ], { test: { level: 'acceptance', kind: 'manual', steps: [{ action: 'Given …', expected: '' }, { action: 'When …', expected: '' }, { action: '', expected: 'Then …' }] } }),
  F('test-automated', 'testcase', 'code', ['자동 테스트 케이스', 'Automated test case'], ['실행할 스크립트와 판정 기준', 'Script to run and how it is judged'], [
    '## 목적\n…\n\n## 판정\n종료 코드 0이면 통과입니다.',
    '## Purpose\n…\n\n## Verdict\nExit code 0 means pass.',
  ], { test: { level: 'integration', kind: 'automated', script: 'npm test -- --grep "…"' } }),
  F('exec-regression', 'testexec', 'play', ['회귀 테스트 실행', 'Regression test run'], ['출시 전 전체 테스트를 한 번 돌립니다', 'One full pass before a release'], [
    '## 범위\n이번 실행에 넣은 테스트 케이스와 빌드를 적습니다.\n\n## 환경\n- 빌드:\n- 장비:\n\n## 결론\n…',
    '## Scope\nThe test cases and build in this run.\n\n## Environment\n- Build:\n- Device:\n\n## Conclusion\n…',
  ], { exec: {} }),
  F('bug-from-test', 'bug', 'bug', ['테스트에서 발견한 결함', 'Defect found by a test'], ['재현 단계, 기대 결과, 실제 결과', 'Steps to reproduce, expected and actual result'], [
    '## 재현 단계\n1. …\n2. …\n\n## 기대 결과\n…\n\n## 실제 결과\n…\n\n## 발견한 테스트\n테스트 케이스 키:',
    '## Steps to reproduce\n1. …\n2. …\n\n## Expected result\n…\n\n## Actual result\n…\n\n## Found by\nTest case key:',
  ]),
];

/** The fields a format puts into a new issue. */
export function formatPatch(id, lang = 'ko') {
  const format = ISSUE_FORMATS.find((item) => item.id === id);
  if (!format) return null;
  const patch = { typeId: format.typeId, description: format.description[lang === 'en' ? 1 : 0] };
  if (format.req) patch.req = normalizeReq(format.req);
  if (format.test) patch.test = normalizeTest(format.test);
  if (format.exec) patch.exec = normalizeExec(format.exec);
  return patch;
}

// ── Files: CSV, Markdown and ReqIF ──

const nameIn = (list, id, lang) => { const item = byId(list, id); return item ? (lang === 'en' ? item.en : item.ko) : ''; };

function csvCell(value) {
  const body = String(value ?? '');
  return /[",\r\n]/.test(body) ? `"${body.replace(/"/g, '""')}"` : body;
}
const csvLine = (cells) => cells.map(csvCell).join(',');

/** Header names of the requirement CSV format (English names are what import reads; Korean also works). */
export const REQ_CSV = ['ID', 'Key', 'Summary', 'Description', 'Category', 'Verification', 'Source', 'Acceptance criteria', 'Rationale', 'Parent', 'Status', 'Priority'];
export const TEST_CSV = ['ID', 'Key', 'Summary', 'Level', 'Kind', 'Precondition', 'Step', 'Action', 'Data', 'Expected', 'Verifies', 'Last result'];

export function requirementsCsv(project) {
  const lines = [csvLine(REQ_CSV)];
  for (const { req } of requirementTree(project)) {
    const r = normalizeReq(req.req);
    const parent = (req.links || []).find((link) => link.type === 'refines' && link.direction === 'out');
    lines.push(csvLine([
      r.externalId, req.key, req.summary, req.description, r.category, r.method, r.source, r.criteria, r.rationale,
      parent ? (() => { const up = project.issues.find((item) => item.id === parent.otherId); return up?.req?.externalId || up?.key || ''; })() : '', req.statusId, req.priorityId,
    ]));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** One row per step (the test's own columns only on its first row), the usual shape for test case sheets. */
export function testCasesCsv(project) {
  const results = latestResults(project);
  const lines = [csvLine(TEST_CSV)];
  for (const test of project.issues.filter(isTestCase)) {
    const t = normalizeTest(test.test);
    const verifies = verifiedBy(project, test).map((req) => req.req?.externalId || req.key).join(' ');
    const steps = t.steps.length ? t.steps : [normalizeStep()];
    steps.forEach((step, index) => {
      const head = index === 0
        ? [t.externalId, test.key, test.summary, t.level, t.kind, t.precondition]
        : ['', '', '', '', '', ''];
      lines.push(csvLine([...head, index + 1, step.action, step.data, step.expected, index === 0 ? verifies : '', index === 0 ? results.get(test.id)?.result || 'notrun' : '']));
    });
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function traceCsv(project, lang = 'ko') {
  const head = lang === 'en'
    ? ['No.', 'Requirement', 'Summary', 'Category', 'Verification', 'Implemented by', 'Test cases', 'Results', 'Open defects', 'Coverage', 'Suspect']
    : ['번호', '요구 사항', '요약', '분류', '검증 방법', '구현 이슈', '테스트 케이스', '결과', '열린 결함', '커버리지', '재검증 필요'];
  const lines = [csvLine(head)];
  for (const row of traceMatrix(project).rows) {
    const r = normalizeReq(row.requirement.req);
    lines.push(csvLine([
      row.number, row.requirement.key, row.requirement.summary, nameIn(REQ_CATEGORIES, r.category, lang), nameIn(VERIFY_METHODS, r.method, lang),
      row.implementedBy.map((issue) => issue.key).join(' '), row.tests.map((test) => test.key).join(' '),
      row.results.map((hit) => `${hit.test.key}:${hit.result}`).join(' '), row.openDefects.map((bug) => bug.key).join(' '),
      nameIn(COVERAGE, row.coverage, lang), row.suspect ? (lang === 'en' ? 'yes' : '예') : '',
    ]));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

const mdCell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function traceMarkdown(project, lang = 'ko') {
  const en = lang === 'en';
  const { rows, totals } = traceMatrix(project);
  const out = [
    `# ${en ? 'Traceability matrix' : '요구 사항 추적 매트릭스'} — ${project.name} (${project.key})`, '',
    en
      ? `${totals.total} requirements · ${totals.coveredPct}% covered by tests · ${totals.passedPct}% passed · ${totals.failed} failed · ${totals.suspect} suspect`
      : `요구 사항 ${totals.total}개 · 테스트 커버리지 ${totals.coveredPct}% · 통과 ${totals.passedPct}% · 실패 ${totals.failed} · 재검증 필요 ${totals.suspect}`, '',
    `| ${(en ? ['No.', 'Requirement', 'Implemented by', 'Test cases (result)', 'Open defects', 'Coverage'] : ['번호', '요구 사항', '구현 이슈', '테스트 케이스 (결과)', '열린 결함', '커버리지']).join(' | ')} |`,
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    out.push(`| ${row.number} | ${mdCell(`${row.requirement.key} ${row.requirement.summary}`)} | ${row.implementedBy.map((issue) => issue.key).join(', ')} | ${row.results.map((hit) => `${hit.test.key} (${nameIn(RESULTS, hit.result, lang)})`).join(', ')} | ${row.openDefects.map((bug) => bug.key).join(', ')} | ${nameIn(COVERAGE, row.coverage, lang)}${row.suspect ? (en ? ' ⚠ suspect' : ' ⚠ 재검증') : ''} |`);
  }
  return `${out.join('\n')}\n`;
}

const xml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r?\n/g, '&#10;');

const REQIF_ATTRS = [
  ['AD-ID', 'ReqIF.ForeignID', (req) => req.req.externalId || req.key],
  ['AD-NAME', 'ReqIF.Name', (req) => req.summary],
  ['AD-TEXT', 'ReqIF.Text', (req) => req.description],
  ['AD-CATEGORY', 'Category', (req) => req.req.category],
  ['AD-METHOD', 'VerificationMethod', (req) => req.req.method],
  ['AD-SOURCE', 'Source', (req) => req.req.source],
  ['AD-CRITERIA', 'AcceptanceCriteria', (req) => req.req.criteria],
  ['AD-RATIONALE', 'Rationale', (req) => req.req.rationale],
  ['AD-STATUS', 'Status', (req) => req.statusId],
  ['AD-PRIORITY', 'Priority', (req) => req.priorityId],
  ['AD-KEY', 'MyWorkForce.Key', (req) => req.key],
];

/** Requirements as a ReqIF 1.2 document (OMG Requirements Interchange Format), with their hierarchy. */
export function toReqIF(project, now = new Date().toISOString()) {
  const stamp = xml(now);
  const ident = (issue) => `SO-${issue.key}`;
  const tree = requirementTree(project);
  const objects = tree.map(({ req }) => {
    const r = { ...req, req: normalizeReq(req.req) };
    const values = REQIF_ATTRS.map(([id, , get]) => `            <ATTRIBUTE-VALUE-STRING THE-VALUE="${xml(get(r))}"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>${id}</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>`).join('\n');
    return `        <SPEC-OBJECT IDENTIFIER="${xml(ident(req))}" LAST-CHANGE="${xml(req.updated || now)}">\n          <VALUES>\n${values}\n          </VALUES>\n          <TYPE><SPEC-OBJECT-TYPE-REF>SOT-REQ</SPEC-OBJECT-TYPE-REF></TYPE>\n        </SPEC-OBJECT>`;
  }).join('\n');
  const hierarchy = (depth, start, end, pad) => {
    const out = [];
    for (let at = start; at < end; at += 1) {
      if (tree[at].depth !== depth) continue;
      let stop = at + 1;
      while (stop < end && tree[stop].depth > depth) stop += 1;
      const inner = hierarchy(depth + 1, at + 1, stop, `${pad}    `);
      out.push(`${pad}<SPEC-HIERARCHY IDENTIFIER="SH-${xml(tree[at].req.key)}" LAST-CHANGE="${stamp}"><OBJECT><SPEC-OBJECT-REF>${xml(ident(tree[at].req))}</SPEC-OBJECT-REF></OBJECT>${inner ? `\n${pad}  <CHILDREN>\n${inner}\n${pad}  </CHILDREN>\n${pad}` : ''}</SPEC-HIERARCHY>`);
    }
    return out.join('\n');
  };
  const attrDefs = REQIF_ATTRS.map(([id, name]) => `            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="${id}" LONG-NAME="${xml(name)}" LAST-CHANGE="${stamp}"><TYPE><DATATYPE-DEFINITION-STRING-REF>DT-STRING</DATATYPE-DEFINITION-STRING-REF></TYPE></ATTRIBUTE-DEFINITION-STRING>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <THE-HEADER>
    <REQ-IF-HEADER IDENTIFIER="H-${xml(project.key)}">
      <CREATION-TIME>${stamp}</CREATION-TIME>
      <REQ-IF-TOOL-ID>MyWorkForce</REQ-IF-TOOL-ID>
      <REQ-IF-VERSION>1.0</REQ-IF-VERSION>
      <SOURCE-TOOL-ID>MyWorkForce</SOURCE-TOOL-ID>
      <TITLE>${xml(project.name)}</TITLE>
    </REQ-IF-HEADER>
  </THE-HEADER>
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <DATATYPES>
        <DATATYPE-DEFINITION-STRING IDENTIFIER="DT-STRING" LONG-NAME="String" MAX-LENGTH="65535" LAST-CHANGE="${stamp}"/>
      </DATATYPES>
      <SPEC-TYPES>
        <SPEC-OBJECT-TYPE IDENTIFIER="SOT-REQ" LONG-NAME="Requirement" LAST-CHANGE="${stamp}">
          <SPEC-ATTRIBUTES>
${attrDefs}
          </SPEC-ATTRIBUTES>
        </SPEC-OBJECT-TYPE>
        <SPECIFICATION-TYPE IDENTIFIER="ST-DOC" LONG-NAME="Requirements specification" LAST-CHANGE="${stamp}"/>
      </SPEC-TYPES>
      <SPEC-OBJECTS>
${objects}
      </SPEC-OBJECTS>
      <SPEC-RELATIONS/>
      <SPECIFICATIONS>
        <SPECIFICATION IDENTIFIER="SPEC-${xml(project.key)}" LONG-NAME="${xml(project.name)}" LAST-CHANGE="${stamp}">
          <TYPE><SPECIFICATION-TYPE-REF>ST-DOC</SPECIFICATION-TYPE-REF></TYPE>
          <CHILDREN>
${hierarchy(0, 0, tree.length, '            ')}
          </CHILDREN>
        </SPECIFICATION>
      </SPECIFICATIONS>
    </REQ-IF-CONTENT>
  </CORE-CONTENT>
</REQ-IF>
`;
}

// A small XML reader: enough for ReqIF (elements, attributes, text, CDATA; comments and declarations skipped).
function unescapeXml(value) {
  return String(value).replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (all, code) => {
    if (code === 'amp') return '&';
    if (code === 'lt') return '<';
    if (code === 'gt') return '>';
    if (code === 'quot') return '"';
    if (code === 'apos') return "'";
    const n = code[1] === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : all;
  });
}

export function parseXml(source) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let match;
  while ((match = re.exec(String(source)))) {
    const top = stack[stack.length - 1];
    if (match[1] != null) top.text += match[1];
    else if (match[2]) {
      const name = match[2];
      while (stack.length > 1 && stack[stack.length - 1].name !== name) stack.pop();
      if (stack.length > 1) stack.pop();
    } else if (match[3]) {
      const attrs = {};
      for (const pair of match[4].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[pair[1]] = unescapeXml(pair[2] ?? pair[3]);
      const node = { name: match[3], attrs, children: [], text: '' };
      top.children.push(node);
      if (!match[5]) stack.push(node);
    } else if (match[6] != null) top.text += unescapeXml(match[6]);
  }
  return root;
}

const local = (name) => String(name).replace(/^.*:/, '');
function* walk(node) {
  yield node;
  for (const child of node.children) yield* walk(child);
}
const find = (node, name) => node.children.find((child) => local(child.name) === name);
const textOf = (node) => (node ? node.text + node.children.map(textOf).join(local(node.name) === 'p' || local(node.name) === 'div' || local(node.name) === 'br' ? '\n' : '') : '');

const FIELD_NAMES = {
  externalId: ['reqif.foreignid', 'id', 'foreignid', 'identifier', 'req id', 'requirement id'],
  summary: ['reqif.name', 'name', 'title', 'reqif.chaptername', 'heading', 'summary'],
  description: ['reqif.text', 'text', 'description', 'object text', 'reqif.description'],
  category: ['category', 'type', 'requirement type', 'kind'],
  method: ['verificationmethod', 'verification method', 'verification'],
  source: ['source', 'origin'],
  criteria: ['acceptancecriteria', 'acceptance criteria'],
  rationale: ['rationale'],
  key: ['myworkforce.key'],
  status: ['status'],
  priority: ['priority'],
};

function fieldFor(longName) {
  const name = String(longName || '').trim().toLowerCase();
  return Object.keys(FIELD_NAMES).find((field) => FIELD_NAMES[field].includes(name)) || '';
}

const CATEGORY_WORDS = { 기능: 'functional', 성능: 'performance', 인터페이스: 'interface', 보안: 'security', 안전: 'safety', 사용성: 'usability', 신뢰성: 'reliability', 규제: 'regulatory', 제약: 'constraint', 'non-functional': 'performance', nonfunctional: 'performance' };
const METHOD_WORDS = { 시험: 'test', 테스트: 'test', 검사: 'inspection', 분석: 'analysis', 시연: 'demonstration', t: 'test', i: 'inspection', a: 'analysis', d: 'demonstration' };
const LEVEL_WORDS = { 단위: 'unit', 통합: 'integration', 시스템: 'system', 인수: 'acceptance', 회귀: 'regression' };
const KIND_WORDS = { 수동: 'manual', 자동: 'automated', auto: 'automated', automatic: 'automated' };

const word = (map, list, value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (list.some((item) => item.id === raw)) return raw;
  const named = list.find((item) => item.ko.toLowerCase() === raw || item.en.toLowerCase() === raw);
  return named?.id || map[raw] || '';
};

function firstLine(value) {
  const line = String(value || '').split(/\r?\n/).map((item) => item.trim()).find(Boolean) || '';
  return line.length > 90 ? `${line.slice(0, 89)}…` : line;
}

/**
 * Reads a ReqIF document into requirement rows: { externalId, key, summary, description, req, parentRef }.
 * parentRef is the externalId of the requirement one level up in the specification's hierarchy.
 */
export function parseReqIF(source) {
  const root = parseXml(source);
  const nodes = [...walk(root)];
  if (!nodes.some((node) => local(node.name) === 'REQ-IF')) throw new Error('file-invalid');
  const defs = new Map();
  const enums = new Map();
  for (const node of nodes) {
    const name = local(node.name);
    if (name.startsWith('ATTRIBUTE-DEFINITION-')) defs.set(node.attrs.IDENTIFIER, node.attrs['LONG-NAME'] || node.attrs.IDENTIFIER);
    if (name === 'ENUM-VALUE') enums.set(node.attrs.IDENTIFIER, node.attrs['LONG-NAME'] || '');
  }
  const objects = new Map();
  for (const node of nodes) {
    if (local(node.name) !== 'SPEC-OBJECT') continue;
    const row = { identifier: node.attrs.IDENTIFIER, externalId: '', key: '', summary: '', description: '', req: {}, status: '', priority: '', parentRef: '' };
    const values = find(node, 'VALUES');
    for (const value of values?.children || []) {
      const kind = local(value.name);
      const defRef = [...walk(value)].find((child) => /^ATTRIBUTE-DEFINITION-.*-REF$/.test(local(child.name)));
      const field = fieldFor(defs.get(defRef?.text.trim()) || defRef?.text.trim());
      if (!field) continue;
      let content = value.attrs['THE-VALUE'] ?? '';
      if (kind === 'ATTRIBUTE-VALUE-XHTML') content = textOf(find(value, 'THE-VALUE')).replace(/\n{3,}/g, '\n\n').trim();
      if (kind === 'ATTRIBUTE-VALUE-ENUMERATION') content = [...walk(value)].filter((child) => local(child.name) === 'ENUM-VALUE-REF').map((ref) => enums.get(ref.text.trim()) || '').join(', ');
      if (field === 'externalId') row.externalId = content.trim();
      else if (field === 'summary') row.summary = content.trim();
      else if (field === 'description') row.description = content;
      else if (field === 'key') row.key = content.trim();
      else if (field === 'status') row.status = content.trim();
      else if (field === 'priority') row.priority = content.trim();
      else if (field === 'category') row.req.category = word(CATEGORY_WORDS, REQ_CATEGORIES, content);
      else if (field === 'method') row.req.method = word(METHOD_WORDS, VERIFY_METHODS, content);
      else row.req[field] = content;
    }
    row.externalId = row.externalId || row.identifier;
    row.summary = row.summary || firstLine(row.description) || row.externalId;
    row.req = normalizeReq({ ...row.req, externalId: row.externalId });
    objects.set(row.identifier, row);
  }
  const order = [];
  const visit = (node, parent) => {
    for (const child of node.children) {
      if (local(child.name) !== 'SPEC-HIERARCHY') { if (local(child.name) === 'CHILDREN') visit(child, parent); continue; }
      const ref = [...walk(find(child, 'OBJECT') || { children: [], text: '' })].find((item) => local(item.name) === 'SPEC-OBJECT-REF');
      const row = objects.get(ref?.text.trim());
      if (row && !order.includes(row)) {
        row.parentRef = parent?.externalId || '';
        order.push(row);
      }
      const kids = find(child, 'CHILDREN');
      if (kids) visit(kids, row || parent);
    }
  };
  for (const spec of nodes.filter((node) => local(node.name) === 'SPECIFICATION')) visit(find(spec, 'CHILDREN') || { children: [] }, null);
  for (const row of objects.values()) if (!order.includes(row)) order.push(row);
  return order;
}

/** RFC 4180 CSV (quoted fields may hold commas and line breaks); a leading BOM is ignored. */
export function parseCsvTable(source) {
  const textIn = String(source || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let at = 0; at < textIn.length; at += 1) {
    const ch = textIn[at];
    if (quoted) {
      if (ch === '"' && textIn[at + 1] === '"') { cell += '"'; at += 1; } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && textIn[at + 1] === '\n') at += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const filled = rows.filter((cells) => cells.some((value) => value.trim()));
  if (!filled.length) return [];
  const head = filled[0].map((name) => name.trim().toLowerCase());
  return filled.slice(1).map((cells) => Object.fromEntries(head.map((name, index) => [name, cells[index] ?? ''])));
}

const col = (row, ...names) => {
  for (const name of names) {
    const value = row[name.toLowerCase()];
    if (value != null && String(value).trim() !== '') return String(value);
  }
  return '';
};

/** Reads the requirement CSV format (English or Korean headers). */
export function parseRequirementCsv(source) {
  return parseCsvTable(source).map((row) => {
    const externalId = col(row, 'ID', '식별자', 'Requirement ID', '요구 사항 ID').trim();
    const description = col(row, 'Description', '설명', 'Text', '내용');
    return {
      externalId,
      key: col(row, 'Key', '키').trim(),
      summary: col(row, 'Summary', '요약', 'Name', '이름', 'Title', '제목').trim() || firstLine(description),
      description,
      req: normalizeReq({
        externalId,
        category: word(CATEGORY_WORDS, REQ_CATEGORIES, col(row, 'Category', '분류', 'Type')),
        method: word(METHOD_WORDS, VERIFY_METHODS, col(row, 'Verification', '검증 방법', 'Verification method')),
        source: col(row, 'Source', '출처'),
        criteria: col(row, 'Acceptance criteria', '수용 기준'),
        rationale: col(row, 'Rationale', '근거'),
      }),
      parentRef: col(row, 'Parent', '상위').trim(),
      status: col(row, 'Status', '상태').trim().toLowerCase(),
      priority: col(row, 'Priority', '우선순위').trim().toLowerCase(),
    };
  }).filter((row) => row.summary);
}

/**
 * Reads the test case CSV format. A row with a summary starts a test case; following rows without one add
 * steps to it. "Verifies" lists requirement keys or IDs separated by spaces or commas.
 */
export function parseTestCaseCsv(source) {
  const tests = [];
  for (const row of parseCsvTable(source)) {
    const summary = col(row, 'Summary', '요약', 'Name', '이름', 'Title', '제목').trim();
    const step = { action: col(row, 'Action', '동작', '단계 동작'), data: col(row, 'Data', '데이터', '시험 데이터'), expected: col(row, 'Expected', 'Expected result', '기대 결과') };
    if (summary) {
      const externalId = col(row, 'ID', '식별자', 'Test ID').trim();
      tests.push({
        externalId,
        key: col(row, 'Key', '키').trim(),
        summary,
        description: col(row, 'Description', '설명'),
        test: normalizeTest({
          externalId,
          level: word(LEVEL_WORDS, TEST_LEVELS, col(row, 'Level', '수준', '단계')),
          kind: word(KIND_WORDS, TEST_KINDS, col(row, 'Kind', '방식', 'Type')),
          precondition: col(row, 'Precondition', '전제 조건'),
          script: col(row, 'Script', '스크립트'),
          steps: [],
        }),
        verifies: col(row, 'Verifies', '검증 대상', 'Requirement', '요구 사항').split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean),
      });
    }
    const current = tests[tests.length - 1];
    if (current && (step.action || step.data || step.expected)) current.test.steps.push(normalizeStep(step));
  }
  return tests;
}

/**
 * Brings requirement or test case rows into a project. A row whose external ID (or key) matches an existing
 * issue updates it instead of adding a copy, so a specification can be imported again after it changes.
 * `create(partial)` and `link(fromId, type, toId)` are the store's own operations.
 */
export function importQualityRows(project, rows, kind, { create, update, link }) {
  const typeId = kind === 'tests' ? 'testcase' : 'requirement';
  const byRef = new Map();
  for (const issue of project.issues) {
    if (issue.typeId !== typeId && !(kind === 'tests' && isRequirement(issue))) continue;
    const ext = (issue.req?.externalId || issue.test?.externalId || '').toLowerCase();
    if (ext) byRef.set(ext, issue);
    byRef.set(issue.key.toLowerCase(), issue);
  }
  const touched = [];
  let added = 0;
  let changed = 0;
  for (const row of rows) {
    const ref = (row.externalId || row.key || '').toLowerCase();
    const existing = (row.key && byRef.get(row.key.toLowerCase())) || (ref && byRef.get(ref));
    const part = kind === 'tests' ? { test: row.test } : { req: row.req };
    let issue = existing && existing.typeId === typeId ? existing : null;
    if (issue) {
      update(issue, { summary: row.summary, description: row.description || issue.description, ...part });
      changed += 1;
    } else {
      const statusOk = row.status && (project.statuses || []).some((status) => status.id === row.status);
      const priorityOk = row.priority && (project.priorities || []).some((priority) => priority.id === row.priority);
      issue = create({ typeId, summary: row.summary, description: row.description || '', statusId: statusOk ? row.status : undefined, priorityId: priorityOk ? row.priority : undefined, ...part });
      added += 1;
    }
    if (row.externalId) byRef.set(row.externalId.toLowerCase(), issue);
    byRef.set(issue.key.toLowerCase(), issue);
    touched.push({ row, issue });
  }
  let linked = 0;
  for (const { row, issue } of touched) {
    const targets = kind === 'tests' ? row.verifies : row.parentRef ? [row.parentRef] : [];
    for (const target of targets) {
      const other = byRef.get(String(target).toLowerCase()) || project.issues.find((item) => isRequirement(item) && ((item.req?.externalId || '').toLowerCase() === String(target).toLowerCase() || item.key.toLowerCase() === String(target).toLowerCase()));
      if (!other || other.id === issue.id) continue;
      const type = kind === 'tests' ? 'verifies' : 'refines';
      if ((issue.links || []).some((item) => item.type === type && item.direction === 'out' && item.otherId === other.id)) continue;
      link(issue.id, type, other.id);
      linked += 1;
    }
  }
  return { added, changed, linked };
}
