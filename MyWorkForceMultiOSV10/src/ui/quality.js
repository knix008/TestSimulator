// Screens for requirements traceability and test management (domain in src/domain/requirements.js):
// Requirements, Traceability matrix, Test cases, Test runs, and the structured part of the issue editor
// for a requirement, a test case and a test execution.
import {
  COVERAGE, execProgress, isRequirement, isTestCase, isTestExec, ISSUE_FORMATS, latestResults, normalizeExec, normalizeReq,
  normalizeTest, REQ_CATEGORIES, RESULTS, TEST_KINDS, TEST_LEVELS, testHistory, traceGaps, traceMatrix, traceOf,
  verifiedBy, VERIFY_METHODS,
} from '../domain/requirements.js';
import { badge, byId, empty, esc, formatWhen, icon, L, nameOf, options, pageHead, person } from './bits.js';
import { finderBar, matchesText, screenFind } from './finder.js';

const coverageBadge = (id) => { const item = byId(COVERAGE, id); return badge(nameOf(item) || id, item?.color); };
const resultBadge = (id) => { const item = byId(RESULTS, id || 'notrun'); return badge(nameOf(item), item?.color); };
const keyButton = (issue, glyph = 'issues') => (issue ? `<button type="button" class="key" data-action="open-issue" data-id="${esc(issue.id)}" title="${esc(issue.summary)}">${icon(glyph)}${esc(issue.key)}</button>` : '');
const keyList = (list, glyph) => list.map((issue) => keyButton(issue, glyph)).join(' ');
const facetOptions = (list) => list.map((item) => ({ id: item.id, label: nameOf(item) }));
const suspectMark = () => `<span class="q-suspect" title="${esc(L('요구 사항이 마지막 통과 뒤에 바뀌었습니다. 다시 시험하세요.', 'The requirement changed after its last pass. Test it again.'))}">${icon('alert')}${esc(L('재검증', 'Suspect'))}</span>`;

function stats(totals) {
  const tile = (value, label, tone = '') => `<div class="q-stat${tone ? ` ${tone}` : ''}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  return `<div class="q-stats">
    ${tile(totals.total, L('요구 사항', 'Requirements'))}
    ${tile(`${totals.coveredPct}%`, L('테스트 커버리지', 'Test coverage'))}
    ${tile(`${totals.passedPct}%`, L('통과', 'Passed'), 'good')}
    ${tile(totals.failed, L('실패', 'Failed'), totals.failed ? 'bad' : '')}
    ${tile(totals.uncovered, L('테스트 없음', 'Not covered'), totals.uncovered ? 'warn' : '')}
    ${tile(totals.suspect, L('재검증 필요', 'Suspect'), totals.suspect ? 'warn' : '')}
  </div>`;
}

/** A stacked bar: [[count, color, label], …]. */
export function stackBar(parts) {
  const total = parts.reduce((sum, [count]) => sum + count, 0) || 1;
  return `<span class="q-bar">${parts.filter(([count]) => count).map(([count, color, label]) => `<i style="width:${(count / total) * 100}%;background:${color}" title="${esc(`${label} ${count}`)}"></i>`).join('')}</span>`;
}

function exportButtons(kinds) {
  const labels = { 'req-csv': ['CSV', 'CSV'], reqif: ['ReqIF', 'ReqIF'], 'test-csv': ['CSV', 'CSV'], 'trace-csv': ['CSV', 'CSV'], 'trace-md': ['Markdown', 'Markdown'] };
  return kinds.map((kind) => `<button type="button" class="button" data-action="quality-export" data-kind="${kind}" title="${esc(L('내보내기', 'Export'))}">${icon('download')}<span>${esc(L(labels[kind][0], labels[kind][1]))}</span></button>`).join('');
}

const importButton = (kind) => `<button type="button" class="button" data-action="quality-import" data-kind="${kind}">${icon('folder')}<span>${L('가져오기', 'Import')}</span></button>`;
const newButton = (type, ko, en) => `<button type="button" class="button primary" data-action="new-quality" data-type="${type}">${icon('plus')}<span>${L(ko, en)}</span></button>`;

// ── Requirements ──

export function requirementsView(ctx) {
  const project = ctx.project;
  const find = screenFind(ctx);
  const { rows, totals } = traceMatrix(project);
  const body = rows.filter((row) => {
    const req = row.requirement;
    if (!matchesText(find.q, req.key, req.summary, req.description, req.req?.externalId, req.req?.source)) return false;
    if (find.category && req.req?.category !== find.category) return false;
    if (find.coverage && row.coverage !== find.coverage) return false;
    if (find.method && req.req?.method !== find.method) return false;
    return true;
  }).map((row) => {
    const req = row.requirement;
    const r = normalizeReq(req.req);
    const impl = { none: ['—', '#94a3b8'], open: [L('진행 전', 'Open'), '#64748b'], partial: [L('일부 완료', 'Partly done'), '#3a6cf0'], done: [L('완료', 'Done'), '#30a46c'] }[row.implementation];
    return `<tr class="${req.id === ctx.ui.issueId ? 'active' : ''}">
      <td class="muted">${esc(row.number)}</td>
      <td>${keyButton(req, 'flag')}</td>
      <td class="summary"><span class="q-indent" style="--depth:${row.depth}">${esc(r.externalId ? `${r.externalId} · ` : '')}${esc(req.summary)}</span></td>
      <td>${esc(nameOf(byId(REQ_CATEGORIES, r.category)))}</td>
      <td>${esc(nameOf(byId(VERIFY_METHODS, r.method)))}</td>
      <td>${badge(impl[0], impl[1])}</td>
      <td>${row.tests.length || ''}</td>
      <td>${coverageBadge(row.coverage)} ${row.suspect ? suspectMark() : ''}</td>
      <td>${row.openDefects.length ? badge(String(row.openDefects.length), '#e5484d') : ''}</td>
    </tr>`;
  }).join('');
  const head = [L('번호', 'No.'), L('키', 'Key'), L('요구 사항', 'Requirement'), L('분류', 'Category'), L('검증', 'Verification'), L('구현', 'Work'), L('테스트', 'Tests'), L('커버리지', 'Coverage'), L('결함', 'Defects')];
  return `<div class="page q-page">${pageHead(L('요구 사항', 'Requirements'), `${importButton('req')}${exportButtons(['req-csv', 'reqif'])}${newButton('requirement', '요구 사항', 'Requirement')}`, 'requirements')}
    ${stats(totals)}
    ${finderBar(ctx, [
      { id: 'category', label: L('분류', 'Category'), options: facetOptions(REQ_CATEGORIES) },
      { id: 'method', label: L('검증', 'Verification'), options: facetOptions(VERIFY_METHODS) },
      { id: 'coverage', label: L('커버리지', 'Coverage'), options: facetOptions(COVERAGE) },
    ])}
    ${rows.length ? `<div class="table-wrap"><table class="data q-table"><tr>${head.map((label) => `<th>${esc(label)}</th>`).join('')}</tr>${body}</table></div>` : empty(L('요구 사항이 없습니다. 새로 만들거나 CSV·ReqIF 파일을 가져오세요.', 'No requirements yet. Add one or import a CSV or ReqIF file.'))}
  </div>`;
}

// ── Traceability matrix ──

export function traceView(ctx) {
  const project = ctx.project;
  const mode = ctx.ui.traceMode === 'grid' ? 'grid' : 'list';
  const find = screenFind(ctx);
  const { rows, totals } = traceMatrix(project);
  const shown = rows.filter((row) => matchesText(find.q, row.requirement.key, row.requirement.summary, row.requirement.req?.externalId, ...row.tests.map((test) => test.key), ...row.implementedBy.map((issue) => issue.key))
    && (!find.coverage || row.coverage === find.coverage));
  const modeButtons = `<span class="segmented">${[['list', 'list', L('목록', 'List')], ['grid', 'table', L('격자', 'Grid')]].map(([id, glyph, label]) => `<button type="button" class="small-button${mode === id ? ' active' : ''}" data-action="trace-mode" data-id="${id}">${icon(glyph)}<span>${label}</span></button>`).join('')}</span>`;
  let table = '';
  if (mode === 'grid') {
    const tests = project.issues.filter(isTestCase);
    const results = latestResults(project);
    const symbol = { pass: '✓', fail: '✗', blocked: '!', notrun: '○' };
    table = `<div class="table-wrap q-grid"><table class="data"><tr><th>${esc(L('요구 사항', 'Requirement'))}</th>${tests.map((test) => `<th class="q-vert"><button type="button" data-action="open-issue" data-id="${esc(test.id)}" title="${esc(test.summary)}"><span>${esc(test.key)}</span></button></th>`).join('')}<th>${esc(L('커버리지', 'Coverage'))}</th></tr>
      ${shown.map((row) => `<tr><td class="summary"><span class="q-indent" style="--depth:${row.depth}">${keyButton(row.requirement, 'flag')} ${esc(row.requirement.summary)}</span></td>${tests.map((test) => {
        if (!row.tests.includes(test)) return '<td class="q-cell"></td>';
        const result = results.get(test.id)?.result || 'notrun';
        return `<td class="q-cell q-${result}" title="${esc(nameOf(byId(RESULTS, result)))}">${symbol[result]}</td>`;
      }).join('')}<td>${coverageBadge(row.coverage)}</td></tr>`).join('')}
    </table></div>`;
  } else {
    table = `<div class="table-wrap"><table class="data q-table"><tr>${[L('번호', 'No.'), L('요구 사항', 'Requirement'), L('구현 이슈', 'Implemented by'), L('테스트 케이스와 결과', 'Test cases and results'), L('열린 결함', 'Open defects'), L('커버리지', 'Coverage')].map((label) => `<th>${esc(label)}</th>`).join('')}</tr>
      ${shown.map((row) => `<tr class="${row.requirement.id === ctx.ui.issueId ? 'active' : ''}">
        <td class="muted">${esc(row.number)}</td>
        <td class="summary"><span class="q-indent" style="--depth:${row.depth}">${keyButton(row.requirement, 'flag')} ${esc(row.requirement.summary)}</span></td>
        <td class="q-keys">${keyList(row.implementedBy)}</td>
        <td class="q-keys">${row.results.map((hit) => `<span class="q-hit">${keyButton(hit.test, 'check')}${resultBadge(hit.result)}</span>`).join(' ')}</td>
        <td class="q-keys">${keyList(row.openDefects, 'bug')}</td>
        <td>${coverageBadge(row.coverage)} ${row.suspect ? suspectMark() : ''}</td>
      </tr>`).join('')}
    </table></div>`;
  }
  const gaps = traceGaps(project);
  const gapBlock = (title, list, glyph) => `<div class="q-gap"><h3>${icon(glyph)}<span>${esc(title)}</span><small class="nav-count">${list.length}</small></h3>${list.length ? `<div class="q-keys">${keyList(list, glyph)}</div>` : `<p class="muted">${esc(L('없음', 'None'))}</p>`}</div>`;
  return `<div class="page q-page">${pageHead(L('추적 매트릭스', 'Traceability matrix'), `${modeButtons}${exportButtons(['trace-csv', 'trace-md'])}<button type="button" class="button" data-action="export-view">${icon('download')}<span>${L('내보내기', 'Export')}</span></button>`, 'trace')}
    ${stats(totals)}
    ${finderBar(ctx, [{ id: 'coverage', label: L('커버리지', 'Coverage'), options: facetOptions(COVERAGE) }])}
    ${rows.length ? table : empty(L('요구 사항이 없습니다.', 'There are no requirements.'))}
    <div class="q-gaps">
      ${gapBlock(L('테스트가 없는 요구 사항', 'Requirements without a test'), gaps.untestedRequirements, 'flag')}
      ${gapBlock(L('요구 사항이 없는 테스트', 'Tests without a requirement'), gaps.orphanTests, 'check')}
      ${gapBlock(L('한 번도 실행하지 않은 테스트', 'Tests never run'), gaps.neverRun, 'play')}
    </div>
  </div>`;
}

// ── Test cases ──

export function testsView(ctx) {
  const project = ctx.project;
  const find = screenFind(ctx);
  const results = latestResults(project);
  const tests = project.issues.filter(isTestCase).filter((test) => {
    const t = test.test || {};
    if (!matchesText(find.q, test.key, test.summary, test.description, t.externalId, ...(t.steps || []).map((step) => `${step.action} ${step.expected}`))) return false;
    if (find.level && t.level !== find.level) return false;
    if (find.kind && t.kind !== find.kind) return false;
    if (find.result && (results.get(test.id)?.result || 'notrun') !== find.result) return false;
    return true;
  });
  const counts = { pass: 0, fail: 0, blocked: 0, notrun: 0 };
  for (const test of project.issues.filter(isTestCase)) counts[results.get(test.id)?.result || 'notrun'] += 1;
  const body = tests.map((test) => {
    const t = normalizeTest(test.test);
    const last = results.get(test.id);
    return `<tr class="${test.id === ctx.ui.issueId ? 'active' : ''}">
      <td>${keyButton(test, 'check')}</td>
      <td class="summary">${esc(t.externalId ? `${t.externalId} · ` : '')}${esc(test.summary)}</td>
      <td>${esc(nameOf(byId(TEST_LEVELS, t.level)))}</td>
      <td>${esc(nameOf(byId(TEST_KINDS, t.kind)))}</td>
      <td>${t.steps.length}</td>
      <td class="q-keys">${keyList(verifiedBy(project, test), 'flag')}</td>
      <td>${resultBadge(last?.result)}</td>
      <td class="muted">${last?.at ? esc(formatWhen(last.at)) : ''}</td>
    </tr>`;
  }).join('');
  const head = [L('키', 'Key'), L('테스트 케이스', 'Test case'), L('수준', 'Level'), L('방식', 'Kind'), L('단계', 'Steps'), L('검증 대상', 'Verifies'), L('최근 결과', 'Last result'), L('실행', 'Run at')];
  const runAll = `<button type="button" class="button" data-action="exec-new-all">${icon('play')}<span>${L('전체 실행 만들기', 'Run all')}</span></button>`;
  return `<div class="page q-page">${pageHead(L('테스트 케이스', 'Test cases'), `${importButton('tests')}${exportButtons(['test-csv'])}${runAll}${newButton('testcase', '테스트 케이스', 'Test case')}`, 'tests')}
    <div class="q-summary">${stackBar(RESULTS.map((item) => [counts[item.id], item.color, nameOf(item)]))}<span>${RESULTS.map((item) => `${resultBadge(item.id)} ${counts[item.id]}`).join(' ')}</span></div>
    ${finderBar(ctx, [
      { id: 'level', label: L('수준', 'Level'), options: facetOptions(TEST_LEVELS) },
      { id: 'kind', label: L('방식', 'Kind'), options: facetOptions(TEST_KINDS) },
      { id: 'result', label: L('최근 결과', 'Last result'), options: facetOptions(RESULTS) },
    ])}
    ${project.issues.some(isTestCase) ? `<div class="table-wrap"><table class="data q-table"><tr>${head.map((label) => `<th>${esc(label)}</th>`).join('')}</tr>${body}</table></div>` : empty(L('테스트 케이스가 없습니다. 새로 만들거나 CSV 파일을 가져오세요.', 'No test cases yet. Add one or import a CSV file.'))}
  </div>`;
}

// ── Test runs ──

export function executionsView(ctx) {
  const project = ctx.project;
  const find = screenFind(ctx);
  const execs = project.issues.filter(isTestExec).filter((exec) => matchesText(find.q, exec.key, exec.summary, exec.environment))
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const cards = execs.map((exec) => {
    const progress = execProgress(exec);
    const version = byId(project.versions, exec.exec?.versionId);
    const status = byId(project.statuses, exec.statusId);
    return `<button type="button" class="q-exec${exec.id === ctx.ui.issueId ? ' active' : ''}" data-action="open-issue" data-id="${esc(exec.id)}">
      <span class="q-exec-head"><span class="key">${icon('play')}${esc(exec.key)}</span><b>${esc(exec.summary)}</b>${badge(nameOf(status), status?.color)}</span>
      <span class="q-exec-meta">${version ? `${icon('release')}${esc(version.name)}` : ''}${exec.environment ? ` · ${esc(exec.environment)}` : ''} · ${esc(formatWhen(exec.updated))}</span>
      ${stackBar(RESULTS.map((item) => [progress[item.id], item.color, nameOf(item)]))}
      <span class="q-exec-count">${RESULTS.filter((item) => item.id !== 'notrun').map((item) => `${esc(nameOf(item))} ${progress[item.id]}`).join(' · ')} · ${esc(L('진행', 'Done'))} ${progress.donePct}%</span>
    </button>`;
  }).join('');
  return `<div class="page q-page">${pageHead(L('테스트 실행', 'Test runs'), newButton('testexec', '테스트 실행', 'Test run'), 'executions')}
    ${finderBar(ctx)}
    ${cards ? `<div class="q-execs">${cards}</div>` : empty(L('테스트 실행이 없습니다.', 'There are no test runs.'))}
  </div>`;
}

// ── The issue editor's structured part ──

const field = (label, control, wide = false) => `<label class="prop${wide ? ' wide' : ''}"><span>${esc(label)}</span>${control}</label>`;
const select = (attr, list, value) => `<select ${attr}>${options(list, value)}</select>`;

function requirementBlock(ctx, issue) {
  const r = normalizeReq(issue.req);
  const trace = traceOf(ctx.project, issue);
  const section = (title, glyph, list, extra = '') => `<div class="q-trace-row"><span class="q-trace-label">${icon(glyph)}${esc(title)}</span><span class="q-keys">${list || `<span class="muted">${esc(L('없음', 'None'))}</span>`}</span>${extra}</div>`;
  return `<section class="q-block">
    <h3>${icon('flag')}<span>${L('요구 사항 속성', 'Requirement')}</span>${coverageBadge(trace.coverage)}${trace.suspect ? suspectMark() : ''}</h3>
    <div class="q-fields">
      ${field(L('외부 ID', 'External ID'), `<input data-req="externalId" value="${esc(r.externalId)}" placeholder="SRS-1">`)}
      ${field(L('분류', 'Category'), select('data-req="category"', REQ_CATEGORIES, r.category))}
      ${field(L('검증 방법', 'Verification'), select('data-req="method"', VERIFY_METHODS, r.method))}
      ${field(L('출처', 'Source'), `<input data-req="source" value="${esc(r.source)}">`)}
      ${field(L('기준선', 'Baseline'), `<input data-req="baseline" value="${esc(r.baseline)}" placeholder="1.0">`)}
      ${field(L('수용 기준', 'Acceptance criteria'), `<textarea data-req="criteria" rows="3">${esc(r.criteria)}</textarea>`, true)}
      ${field(L('근거', 'Rationale'), `<textarea data-req="rationale" rows="2">${esc(r.rationale)}</textarea>`, true)}
    </div>
    <h3>${icon('link')}<span>${L('추적', 'Trace')}</span></h3>
    ${trace.suspect ? `<p class="banner bad">${icon('alert')}<span>${esc(L('이 요구 사항은 마지막 통과 뒤에 바뀌었습니다. 테스트를 다시 실행하세요.', 'This requirement changed after its last pass. Run its tests again.'))}</span></p>` : ''}
    ${section(L('상위 요구 사항', 'Refines'), 'flag', keyList(trace.parents, 'flag'))}
    ${section(L('세분화한 요구 사항', 'Refined by'), 'flag', keyList(trace.children, 'flag'), `<button type="button" class="small-button" data-action="req-new-child">${icon('plus')}<span>${L('하위 요구 사항', 'Child requirement')}</span></button>`)}
    ${section(L('구현 이슈', 'Implemented by'), 'issues', keyList(trace.implementedBy), `<span class="inline"><input id="req-impl-key" placeholder="${esc(ctx.project.key)}-1"><button type="button" class="small-button" data-action="req-link" data-type="implements">${icon('link')}<span>${L('연결', 'Link')}</span></button></span>`)}
    ${section(L('테스트 케이스', 'Test cases'), 'check', trace.results.map((hit) => `<span class="q-hit">${keyButton(hit.test, 'check')}${resultBadge(hit.result)}</span>`).join(' '), `<span class="inline"><input id="req-test-key" placeholder="${esc(ctx.project.key)}-2"><button type="button" class="small-button" data-action="req-link" data-type="verifies">${icon('link')}<span>${L('연결', 'Link')}</span></button><button type="button" class="small-button" data-action="req-new-test">${icon('plus')}<span>${L('새 테스트', 'New test')}</span></button></span>`)}
    ${section(L('결함', 'Defects'), 'bug', keyList(trace.defects, 'bug'))}
  </section>`;
}

function testCaseBlock(ctx, issue) {
  const t = normalizeTest(issue.test);
  const steps = t.steps.map((step, index) => `<tr>
    <td class="muted">${index + 1}</td>
    <td><textarea data-step="${esc(step.id)}" data-step-field="action" rows="2">${esc(step.action)}</textarea></td>
    <td><textarea data-step="${esc(step.id)}" data-step-field="data" rows="2">${esc(step.data)}</textarea></td>
    <td><textarea data-step="${esc(step.id)}" data-step-field="expected" rows="2">${esc(step.expected)}</textarea></td>
    <td class="q-step-tools"><button type="button" class="icon-button" data-action="move-step" data-id="${esc(step.id)}" data-delta="-1" title="${esc(L('위로', 'Up'))}">↑</button><button type="button" class="icon-button" data-action="move-step" data-id="${esc(step.id)}" data-delta="1" title="${esc(L('아래로', 'Down'))}">↓</button><button type="button" class="icon-button" data-action="remove-step" data-id="${esc(step.id)}" title="${esc(L('삭제', 'Delete'))}">${icon('trash')}</button></td>
  </tr>`).join('');
  const history = testHistory(ctx.project, issue).slice(0, 12).map((run) => `<div class="link-row">${resultBadge(run.result)}${keyButton(run.exec, 'play')}<span>${esc(run.exec.summary)}</span><small>${run.at ? esc(formatWhen(run.at)) : ''}</small><span class="muted">${esc(run.note || '')}</span></div>`).join('');
  const reqs = verifiedBy(ctx.project, issue);
  return `<section class="q-block">
    <h3>${icon('check')}<span>${L('테스트 케이스 속성', 'Test case')}</span></h3>
    <div class="q-fields">
      ${field(L('외부 ID', 'External ID'), `<input data-test="externalId" value="${esc(t.externalId)}" placeholder="TC-1">`)}
      ${field(L('수준', 'Level'), select('data-test="level"', TEST_LEVELS, t.level))}
      ${field(L('방식', 'Kind'), select('data-test="kind"', TEST_KINDS, t.kind))}
      ${t.kind === 'automated' ? field(L('스크립트', 'Script'), `<input data-test="script" value="${esc(t.script)}" placeholder="npm test -- …">`) : ''}
      ${field(L('전제 조건', 'Precondition'), `<textarea data-test="precondition" rows="2">${esc(t.precondition)}</textarea>`, true)}
    </div>
    <h3>${icon('list')}<span>${L('단계', 'Steps')}</span><small class="nav-count">${t.steps.length}</small></h3>
    <div class="table-wrap"><table class="data q-steps"><tr><th>#</th><th>${esc(L('동작', 'Action'))}</th><th>${esc(L('데이터', 'Data'))}</th><th>${esc(L('기대 결과', 'Expected result'))}</th><th></th></tr>${steps}</table></div>
    <div class="page-actions page-actions-left"><button type="button" class="small-button" data-action="add-step">${icon('plus')}<span>${L('단계 추가', 'Add a step')}</span></button><button type="button" class="small-button" data-action="exec-new-for" data-id="${esc(issue.id)}">${icon('play')}<span>${L('이 테스트 실행', 'Run this test')}</span></button></div>
    <h3>${icon('flag')}<span>${L('검증 대상 요구 사항', 'Verifies')}</span></h3>
    <div class="q-trace-row"><span class="q-keys">${keyList(reqs, 'flag') || `<span class="muted">${esc(L('없음', 'None'))}</span>`}</span><span class="inline"><input id="test-req-key" placeholder="${esc(ctx.project.key)}-1"><button type="button" class="small-button" data-action="test-link-req">${icon('link')}<span>${L('연결', 'Link')}</span></button></span></div>
    <h3>${icon('chart')}<span>${L('실행 기록', 'Run history')}</span></h3>
    ${history || `<p class="muted">${esc(L('아직 실행하지 않았습니다.', 'Not run yet.'))}</p>`}
  </section>`;
}

function execBlock(ctx, issue) {
  const project = ctx.project;
  const e = normalizeExec(issue.exec);
  const progress = execProgress(issue);
  const rows = e.runs.map((run, index) => {
    const test = project.issues.find((item) => item.id === run.testId);
    if (!test) return '';
    const t = normalizeTest(test.test);
    const seg = RESULTS.map((item) => `<button type="button" class="q-res${run.result === item.id ? ' active' : ''}" style="--res:${item.color}" data-action="run-result" data-id="${esc(test.id)}" data-result="${item.id}" title="${esc(nameOf(item))}">${esc(nameOf(item))}</button>`).join('');
    const defects = run.defectIds.map((id) => project.issues.find((item) => item.id === id)).filter(Boolean);
    const steps = t.steps.length ? `<details class="q-run-steps"><summary>${esc(L('단계', 'Steps'))} ${t.steps.length}</summary>${t.precondition ? `<p class="muted">${esc(L('전제 조건', 'Precondition'))}: ${esc(t.precondition)}</p>` : ''}<ol>${t.steps.map((step) => `<li><b>${esc(step.action)}</b>${step.data ? ` <code>${esc(step.data)}</code>` : ''}${step.expected ? ` → ${esc(step.expected)}` : ''}</li>`).join('')}</ol></details>` : '';
    return `<tr>
      <td class="muted">${index + 1}</td>
      <td class="summary">${keyButton(test, 'check')} ${esc(test.summary)}${steps}</td>
      <td class="q-keys">${keyList(verifiedBy(project, test), 'flag')}</td>
      <td><span class="q-seg">${seg}</span>${run.at ? `<small class="q-run-by">${esc(person(ctx.ws, run.by)?.name || '')} · ${esc(formatWhen(run.at))}</small>` : ''}</td>
      <td><input data-run-note="${esc(test.id)}" value="${esc(run.note)}" placeholder="${esc(L('메모', 'Note'))}"></td>
      <td class="q-keys">${keyList(defects, 'bug')}${run.result === 'fail' || run.result === 'blocked' ? `<button type="button" class="small-button" data-action="exec-defect" data-id="${esc(test.id)}">${icon('bug')}<span>${L('결함 등록', 'Log a defect')}</span></button>` : ''}</td>
      <td><button type="button" class="icon-button" data-action="exec-remove" data-id="${esc(test.id)}" title="${esc(L('빼기', 'Remove'))}">${icon('trash')}</button></td>
    </tr>`;
  }).join('');
  return `<section class="q-block">
    <h3>${icon('play')}<span>${L('테스트 실행', 'Test run')}</span></h3>
    <div class="q-fields">
      ${field(L('대상 버전', 'Version'), `<select data-exec-version>${options(project.versions || [], e.versionId, L('없음', 'None'))}</select>`)}
      ${field(L('환경', 'Environment'), `<input data-field="environment" data-live value="${esc(issue.environment || '')}" placeholder="${esc(L('빌드, 장비, 브라우저', 'Build, device, browser'))}">`)}
    </div>
    <div class="q-summary">${stackBar(RESULTS.map((item) => [progress[item.id], item.color, nameOf(item)]))}<span>${RESULTS.map((item) => `${resultBadge(item.id)} ${progress[item.id]}`).join(' ')} · ${esc(L('진행', 'Done'))} ${progress.donePct}% · ${esc(L('통과율', 'Pass rate'))} ${progress.passPct}%</span></div>
    <div class="table-wrap"><table class="data q-runs"><tr><th>#</th><th>${esc(L('테스트 케이스', 'Test case'))}</th><th>${esc(L('검증 대상', 'Verifies'))}</th><th>${esc(L('결과', 'Result'))}</th><th>${esc(L('메모', 'Note'))}</th><th>${esc(L('결함', 'Defects'))}</th><th></th></tr>${rows}</table></div>
    ${e.runs.length ? '' : `<p class="muted">${esc(L('테스트 케이스를 넣으세요.', 'Add test cases to this run.'))}</p>`}
    <div class="page-actions page-actions-left">
      <span class="inline"><input id="exec-test-keys" placeholder="${esc(`${project.key}-5 ${project.key}-6`)}"><button type="button" class="small-button" data-action="exec-add-tests">${icon('plus')}<span>${L('넣기', 'Add')}</span></button></span>
      <button type="button" class="small-button" data-action="exec-add-all">${icon('check')}<span>${L('모든 테스트', 'All tests')}</span></button>
      <button type="button" class="small-button" data-action="exec-add-open">${icon('redo')}<span>${L('실패·미실행 테스트', 'Failed and not-run tests')}</span></button>
    </div>
  </section>`;
}

/** The structured part shown above the description in the issue editor, or ''. */
export function qualityBlock(ctx, issue) {
  if (isRequirement(issue)) return requirementBlock(ctx, issue);
  if (isTestCase(issue)) return testCaseBlock(ctx, issue);
  if (isTestExec(issue)) return execBlock(ctx, issue);
  return '';
}

/** The format picker of the "New issue" dialog. */
export function formatPicker(selected = '') {
  return `<select name="format" data-issue-format><option value="">${esc(L('없음 (빈 이슈)', 'None (blank issue)'))}</option>${ISSUE_FORMATS.map((format) => `<option value="${esc(format.id)}"${format.id === selected ? ' selected' : ''} title="${esc(L(format.aboutKo, format.aboutEn))}">${esc(L(format.ko, format.en))}</option>`).join('')}</select>`;
}
