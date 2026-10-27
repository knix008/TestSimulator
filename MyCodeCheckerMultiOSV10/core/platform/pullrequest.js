'use strict';

// Pull-request analysis: issues on changed lines, a quality gate on that new
// code, a markdown summary, and decoration payloads for GitHub (check run),
// GitLab (Code Quality / CodeClimate JSON), Azure DevOps (PR threads + status)
// and Bitbucket (Code Insights report + annotations). No network calls: the
// caller posts the payloads.

const crypto = require('crypto');
const { rate } = require('../ratings');
const { NEW_CODE_CONDITIONS, evaluateGate, metricLabel } = require('../qualitygate');
const { isClosed, normPath, text } = require('./util');
const { newCodeCoverage } = require('./measures');

/** Default PR gate: the new-code conditions. */
const PR_GATE = { id: 'pr-way', name: 'Pull request', conditions: NEW_CODE_CONDITIONS.map((c) => ({ ...c })) };

function changedFiles(changed) {
  return (changed && changed.files) || changed || {};
}

/** Whether an issue sits on a changed line (or in a new file). Issues with event lines on changed lines count too (defect analysis). */
function onChangedLine(issue, files) {
  const e = files[normPath(issue.file)];
  if (!e || e.status === 'D') return false;
  if (e.isNew) return true;
  const inRange = (n) => (e.ranges || []).some(([a, b]) => n >= a && n <= b);
  if (issue.line && inRange(issue.line)) return true;
  return false;
}

/**
 * PR analysis.
 * @param {object} analysis full branch analysis (issues, files, duplications)
 * @param {object} changed changedLines() result or its .files map
 * @param {{gate?:object, coverage?:object, key?:string, branch?:string, base?:string, title?:string}} [opts]
 *   coverage: measures.parseLcovFull() output for new-code coverage on changed lines
 * @returns {{issues:object[], measures:object, ratings:object, qualityGate:object, changedFiles:number, changedLines:number}}
 */
function analyzePullRequest(analysis, changed, opts = {}) {
  const files = changedFiles(changed);
  const all = (analysis && analysis.issues) || [];
  const issues = all.filter((i) => onChangedLine(i, files)).map((i) => ({ ...i, isNew: true }));
  const open = issues.filter((i) => !isClosed(i) && i.type !== 'SECURITY_HOTSPOT');
  const hotspots = issues.filter((i) => i.type === 'SECURITY_HOTSPOT');
  const debt = open.filter((i) => i.type === 'CODE_SMELL').reduce((n, i) => n + (Number(i.debtMin) || 0), 0);
  let changedLineCount = 0;
  const nclocByFile = new Map(((analysis && analysis.files) || []).map((f) => [normPath(f.path), f.ncloc || 0]));
  for (const [file, e] of Object.entries(files)) {
    if (e.status === 'D') continue;
    changedLineCount += e.isNew ? (nclocByFile.get(file) || 0) : (e.ranges || []).reduce((n, [a, b]) => n + (b - a + 1), 0);
  }
  const r = rate(open, hotspots, debt, Math.max(changedLineCount, open.length ? 1 : 0));
  const cov = opts.coverage ? newCodeCoverage(opts.coverage, files) : null;
  // Duplications on changed lines.
  const dupSeen = new Set();
  for (const block of (analysis && analysis.duplications) || []) {
    for (const part of block.instances || block.parts || []) {
      const f = normPath(part.path || part.file);
      const e = files[f];
      if (!e || e.status === 'D') continue;
      const start = part.start || part.line || 0;
      const end = part.end || start;
      for (let n = start; n <= end; n++) if (e.isNew || (e.ranges || []).some(([a, b]) => n >= a && n <= b)) dupSeen.add(`${f}:${n}`);
    }
  }
  const dupLines = dupSeen.size;
  const measures = {
    new_lines: changedLineCount,
    new_bugs: open.filter((i) => i.type === 'BUG').length,
    new_vulnerabilities: open.filter((i) => i.type === 'VULNERABILITY').length,
    new_code_smells: open.filter((i) => i.type === 'CODE_SMELL').length,
    new_security_hotspots: hotspots.length,
    new_security_hotspots_reviewed: r.hotspotsReviewed,
    new_technical_debt: debt,
    new_maintainability_rating: r.maintainabilityValue,
    new_reliability_rating: r.reliabilityValue,
    new_security_rating: r.securityValue,
    new_security_review_rating: r.securityReviewValue,
    new_coverage: cov ? cov.new_coverage : null,
    new_line_coverage: cov ? cov.new_line_coverage : null,
    new_lines_to_cover: cov ? cov.new_lines_to_cover : null,
    new_uncovered_lines: cov ? cov.new_uncovered_lines : null,
    new_conditions_to_cover: cov ? cov.new_conditions_to_cover : null,
    new_uncovered_conditions: cov ? cov.new_uncovered_conditions : null,
    new_duplicated_lines: dupLines,
    new_duplicated_lines_density: changedLineCount ? Math.round((dupLines / changedLineCount) * 1000) / 10 : 0,
  };
  const qualityGate = evaluateGate(opts.gate || PR_GATE, measures);
  return {
    key: opts.key || null, branch: opts.branch || null, base: opts.base || (changed && changed.base) || null, title: opts.title || '',
    issues, measures,
    ratings: { reliability: r.reliability, security: r.security, maintainability: r.maintainability, securityReview: r.securityReview },
    qualityGate,
    changedFiles: Object.values(files).filter((e) => e.status !== 'D').length,
    changedLines: changedLineCount,
  };
}

const LETTER = ['', 'A', 'B', 'C', 'D', 'E'];

/**
 * Markdown summary, GitHub-check / PR-comment style.
 * @param {object} pr analyzePullRequest() result
 * @param {{lang?:string, maxIssues?:number, url?:string}} [opts]
 */
function summaryMarkdown(pr, opts = {}) {
  const lang = opts.lang || 'en';
  const ko = lang === 'ko';
  const ok = pr.qualityGate.status === 'OK';
  const m = pr.measures;
  const out = [];
  out.push(`## ${ok ? '✅' : '❌'} ${ko ? '품질 게이트' : 'Quality Gate'} ${ok ? (ko ? '통과' : 'passed') : (ko ? '실패' : 'failed')}`);
  out.push('');
  const failed = pr.qualityGate.conditions.filter((c) => c.status === 'ERROR');
  if (failed.length) {
    out.push(ko ? '**실패한 조건**' : '**Failed conditions**');
    for (const c of failed) out.push(`- ${metricLabel(c.metric, lang)}: ${fmt(c.actual, c.metric)} (${c.op} ${fmt(c.threshold, c.metric)})`);
    out.push('');
  }
  out.push(`| ${ko ? '항목' : 'Measure'} | ${ko ? '값' : 'Value'} |`);
  out.push('|---|---|');
  out.push(`| ${ko ? '새 버그' : 'New bugs'} | ${m.new_bugs} (${LETTER[m.new_reliability_rating]}) |`);
  out.push(`| ${ko ? '새 취약점' : 'New vulnerabilities'} | ${m.new_vulnerabilities} (${LETTER[m.new_security_rating]}) |`);
  out.push(`| ${ko ? '새 코드 스멜' : 'New code smells'} | ${m.new_code_smells} (${LETTER[m.new_maintainability_rating]}) |`);
  out.push(`| ${ko ? '보안 핫스팟' : 'Security hotspots'} | ${m.new_security_hotspots} |`);
  out.push(`| ${ko ? '새 코드 커버리지' : 'Coverage on new code'} | ${m.new_coverage == null ? '—' : `${m.new_coverage}%`} |`);
  out.push(`| ${ko ? '새 코드 중복' : 'Duplication on new code'} | ${m.new_duplicated_lines_density}% |`);
  out.push(`| ${ko ? '바뀐 줄' : 'Changed lines'} | ${pr.changedLines} (${pr.changedFiles} ${ko ? '파일' : 'files'}) |`);
  const max = opts.maxIssues == null ? 20 : opts.maxIssues;
  const shown = pr.issues.filter((i) => !isClosed(i)).slice(0, max);
  if (shown.length) {
    out.push('');
    out.push(ko ? '**새 이슈**' : '**New issues**');
    for (const i of shown) out.push(`- \`${i.file}:${i.line}\` ${i.severity} ${i.type} — ${text(i.message, lang)} (\`${i.rule}\`)`);
    const rest = pr.issues.filter((i) => !isClosed(i)).length - shown.length;
    if (rest > 0) out.push(ko ? `- … 외 ${rest}개` : `- … and ${rest} more`);
  }
  if (opts.url) { out.push(''); out.push(`[${ko ? '자세히 보기' : 'See analysis details'}](${opts.url})`); }
  return out.join('\n');
}

function fmt(v, metric) {
  if (v == null) return '—';
  if (/rating/.test(metric)) return LETTER[v] || v;
  if (/coverage|density|reviewed/.test(metric)) return `${v}%`;
  return String(v);
}

function fingerprint(issue) {
  return crypto.createHash('md5').update(`${issue.rule}|${issue.file}|${issue.key || issue.line}`).digest('hex');
}

/**
 * GitHub check run payloads (POST /repos/{o}/{r}/check-runs, then PATCH with
 * more annotations). GitHub accepts at most 50 annotations per request, so
 * the result is a list: the first creates the run, the rest add batches.
 * @param {object} pr
 * @param {{headSha:string, name?:string, lang?:string, detailsUrl?:string}} opts
 * @returns {object[]}
 */
function githubCheckRun(pr, opts = {}) {
  const ok = pr.qualityGate.status === 'OK';
  const annotations = pr.issues.filter((i) => !isClosed(i)).map((i) => ({
    path: normPath(i.file),
    start_line: i.line || 1,
    end_line: i.endLine || i.line || 1,
    annotation_level: i.severity === 'BLOCKER' || i.severity === 'CRITICAL' ? 'failure' : i.severity === 'MAJOR' ? 'warning' : 'notice',
    title: `${i.type} ${i.severity}: ${i.rule}`.slice(0, 255),
    message: text(i.message, opts.lang || 'en').slice(0, 64000) || i.rule,
  }));
  const base = {
    name: opts.name || 'MyCodeChecker',
    head_sha: opts.headSha || '',
    status: 'completed',
    conclusion: ok ? 'success' : 'failure',
    completed_at: new Date().toISOString(),
    ...(opts.detailsUrl ? { details_url: opts.detailsUrl } : {}),
  };
  const title = ok ? 'Quality Gate passed' : 'Quality Gate failed';
  const summary = summaryMarkdown(pr, { lang: opts.lang, url: opts.detailsUrl });
  const batches = [];
  for (let n = 0; n < Math.max(1, annotations.length); n += 50) {
    batches.push({ ...base, output: { title, summary, annotations: annotations.slice(n, n + 50) } });
  }
  return batches;
}

/**
 * GitLab Code Quality report (CodeClimate JSON subset GitLab ingests as the
 * `codequality` artifact).
 * @returns {object[]}
 */
function gitlabCodeQuality(prOrIssues, opts = {}) {
  const issues = Array.isArray(prOrIssues) ? prOrIssues : prOrIssues.issues;
  const sev = { BLOCKER: 'blocker', CRITICAL: 'critical', MAJOR: 'major', MINOR: 'minor', INFO: 'info' };
  const cat = { BUG: 'Bug Risk', VULNERABILITY: 'Security', SECURITY_HOTSPOT: 'Security', CODE_SMELL: 'Style' };
  return issues.filter((i) => !isClosed(i)).map((i) => ({
    type: 'issue',
    check_name: i.rule,
    description: text(i.message, opts.lang || 'en') || i.rule,
    categories: [cat[i.type] || 'Style'],
    severity: sev[i.severity] || 'info',
    fingerprint: fingerprint(i),
    location: { path: normPath(i.file), lines: { begin: i.line || 1, end: i.endLine || i.line || 1 } },
  }));
}

/**
 * Azure DevOps: PR comment threads (POST .../pullRequests/{id}/threads) and a
 * PR status (POST .../pullRequests/{id}/statuses).
 * @returns {{threads:object[], status:object}}
 */
function azureDevOps(pr, opts = {}) {
  const threads = pr.issues.filter((i) => !isClosed(i)).slice(0, opts.maxThreads || 100).map((i) => ({
    comments: [{ parentCommentId: 0, commentType: 1, content: `**${i.severity} ${i.type}** \`${i.rule}\`\n\n${text(i.message, opts.lang || 'en')}` }],
    status: 1,
    threadContext: {
      filePath: `/${normPath(i.file)}`,
      rightFileStart: { line: i.line || 1, offset: 1 },
      rightFileEnd: { line: i.endLine || i.line || 1, offset: 1 },
    },
    properties: { mycodechecker: { $type: 'System.String', $value: fingerprint(i) } },
  }));
  const ok = pr.qualityGate.status === 'OK';
  return {
    threads,
    status: {
      state: ok ? 'succeeded' : 'failed',
      description: ok ? 'Quality Gate passed' : 'Quality Gate failed',
      context: { name: 'quality-gate', genre: 'mycodechecker' },
      ...(opts.targetUrl ? { targetUrl: opts.targetUrl } : {}),
    },
  };
}

/**
 * Bitbucket Code Insights: a report (PUT .../commits/{c}/reports/{key}) and
 * annotations (POST .../reports/{key}/annotations, max 100 per request).
 * Shapes follow Bitbucket Cloud; Server/DC accepts the same fields.
 * @returns {{report:object, annotations:object[][]}}
 */
function bitbucketCodeInsights(pr, opts = {}) {
  const ok = pr.qualityGate.status === 'OK';
  const m = pr.measures;
  const report = {
    title: opts.title || 'MyCodeChecker',
    details: ok ? 'Quality Gate passed' : 'Quality Gate failed',
    report_type: 'BUG',
    reporter: 'MyCodeChecker',
    result: ok ? 'PASSED' : 'FAILED',
    ...(opts.link ? { link: opts.link } : {}),
    data: [
      { title: 'New bugs', type: 'NUMBER', value: m.new_bugs },
      { title: 'New vulnerabilities', type: 'NUMBER', value: m.new_vulnerabilities },
      { title: 'New code smells', type: 'NUMBER', value: m.new_code_smells },
      { title: 'Coverage on new code', type: 'PERCENTAGE', value: m.new_coverage == null ? 0 : m.new_coverage },
      { title: 'Duplication on new code', type: 'PERCENTAGE', value: m.new_duplicated_lines_density },
    ],
  };
  const sev = { BLOCKER: 'CRITICAL', CRITICAL: 'HIGH', MAJOR: 'MEDIUM', MINOR: 'LOW', INFO: 'LOW' };
  const typ = { BUG: 'BUG', VULNERABILITY: 'VULNERABILITY', SECURITY_HOTSPOT: 'VULNERABILITY', CODE_SMELL: 'CODE_SMELL' };
  const all = pr.issues.filter((i) => !isClosed(i)).map((i) => ({
    external_id: fingerprint(i),
    annotation_type: typ[i.type] || 'CODE_SMELL',
    summary: (text(i.message, opts.lang || 'en') || i.rule).slice(0, 450),
    severity: sev[i.severity] || 'LOW',
    path: normPath(i.file),
    line: i.line || 1,
  }));
  const annotations = [];
  for (let n = 0; n < all.length; n += 100) annotations.push(all.slice(n, n + 100));
  return { report, annotations };
}

/** All four decorations at once. */
function decorations(pr, opts = {}) {
  return {
    github: githubCheckRun(pr, opts.github || opts),
    gitlab: gitlabCodeQuality(pr, opts),
    azure: azureDevOps(pr, opts),
    bitbucket: bitbucketCodeInsights(pr, opts),
  };
}

module.exports = {
  PR_GATE, onChangedLine, analyzePullRequest, summaryMarkdown, githubCheckRun, gitlabCodeQuality, azureDevOps,
  bitbucketCodeInsights, decorations, fingerprint,
};
