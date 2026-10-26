'use strict';

// Extra code quality measures the core engine does not compute yet: remediation
// efforts, effort to reach maintainability A, branch (condition) coverage from
// lcov BRDA records, new-code coverage on changed lines, test metrics, the
// file/directory component tree, language distribution and the "software
// quality" impacts model (MQR mode).

const { isClosed, normPath } = require('./util');

const DEV_MIN_PER_LINE = 30;

/**
 * Remediation effort (minutes) by type, overall and on new code.
 * @param {object[]} issues
 * @returns {{reliability_remediation_effort:number, security_remediation_effort:number, sqale_index:number,
 *   new_reliability_remediation_effort:number, new_security_remediation_effort:number, new_technical_debt:number}}
 */
function remediationEfforts(issues) {
  const sum = (type, onlyNew) => (issues || []).filter((i) => i.type === type && !isClosed(i) && (!onlyNew || i.isNew)).reduce((n, i) => n + (Number(i.debtMin) || 0), 0);
  return {
    reliability_remediation_effort: sum('BUG'),
    security_remediation_effort: sum('VULNERABILITY'),
    sqale_index: sum('CODE_SMELL'),
    new_reliability_remediation_effort: sum('BUG', true),
    new_security_remediation_effort: sum('VULNERABILITY', true),
    new_technical_debt: sum('CODE_SMELL', true),
  };
}

/**
 * Minutes of debt to remove to reach maintainability A (debt ratio <= 5%).
 * code quality's `effort_to_reach_maintainability_rating_a`.
 */
function effortToReachMaintainabilityA(debtMin, ncloc, devMinPerLine = DEV_MIN_PER_LINE) {
  const allowed = 0.05 * (Number(ncloc) || 0) * devMinPerLine;
  return Math.max(0, Math.ceil((Number(debtMin) || 0) - allowed));
}

/**
 * Parse lcov with line (DA) and branch (BRDA) data.
 * @param {string} textIn lcov.info text
 * @param {{root?:string}} [opts] absolute SF paths under root become root-relative
 * @returns {{files: Record<string,{lines:Record<number,number>, branches:Record<number,{total:number,covered:number}>}>}}
 */
function parseLcovFull(textIn, opts = {}) {
  const files = {};
  const root = opts.root ? normPath(opts.root).toLowerCase() : null;
  let cur = null;
  for (const raw of String(textIn || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('SF:')) {
      let p = normPath(line.slice(3));
      if (root && p.toLowerCase().startsWith(`${root}/`)) p = p.slice(root.length + 1);
      cur = files[p] || (files[p] = { lines: {}, branches: {} });
    } else if (cur && line.startsWith('DA:')) {
      const [n, hits] = line.slice(3).split(',');
      cur.lines[Number(n)] = Math.max(cur.lines[Number(n)] || 0, Number(hits) || 0);
    } else if (cur && line.startsWith('BRDA:')) {
      const [n, , , taken] = line.slice(5).split(',');
      const b = cur.branches[Number(n)] || (cur.branches[Number(n)] = { total: 0, covered: 0 });
      b.total += 1;
      if (taken !== '-' && Number(taken) > 0) b.covered += 1;
    } else if (line === 'end_of_record') cur = null;
  }
  return { files };
}

function coverageNumbers(fileRecs, include) {
  let linesToCover = 0; let uncoveredLines = 0; let conditions = 0; let uncoveredConditions = 0;
  for (const [file, rec] of Object.entries(fileRecs)) {
    for (const [n, hits] of Object.entries(rec.lines)) {
      if (include && !include(file, Number(n))) continue;
      linesToCover += 1;
      if (!hits) uncoveredLines += 1;
    }
    for (const [n, b] of Object.entries(rec.branches)) {
      if (include && !include(file, Number(n))) continue;
      conditions += b.total;
      uncoveredConditions += b.total - b.covered;
    }
  }
  const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);
  return {
    lines_to_cover: linesToCover,
    uncovered_lines: uncoveredLines,
    conditions_to_cover: conditions,
    uncovered_conditions: uncoveredConditions,
    line_coverage: pct(linesToCover - uncoveredLines, linesToCover),
    branch_coverage: pct(conditions - uncoveredConditions, conditions),
    // code quality: coverage = (covered conditions + covered lines) / (conditions + lines to cover)
    coverage: pct(conditions - uncoveredConditions + linesToCover - uncoveredLines, conditions + linesToCover),
  };
}

/**
 * Overall coverage measures with condition coverage.
 * @param {{files:object}} cov output of parseLcovFull()
 */
function coverageMeasures(cov) {
  return coverageNumbers((cov && cov.files) || {});
}

/**
 * New-code coverage restricted to changed lines (map from scm.changedLines().files or
 * pullrequest changed map). Keys are prefixed `new_`.
 */
function newCodeCoverage(cov, changed) {
  const files = (changed && changed.files) || changed || {};
  const include = (file, line) => {
    const e = files[file];
    if (!e || e.status === 'D') return false;
    if (e.isNew) return true;
    return (e.ranges || []).some(([a, b]) => line >= a && line <= b);
  };
  const base = coverageNumbers((cov && cov.files) || {}, include);
  const out = {};
  for (const [k, v] of Object.entries(base)) out[`new_${k}`] = v;
  return out;
}

/**
 * Test metrics from an external.js test report ({suites|files, tests:[{status,duration}]})
 * or plain totals. Duration in ms.
 * @returns {{tests:number, test_failures:number, test_errors:number, skipped_tests:number, test_execution_time:number, test_success_density:number|null}}
 */
function testMetrics(report) {
  const r = report || {};
  let tests = 0; let failures = 0; let errors = 0; let skipped = 0; let duration = 0;
  if (Array.isArray(r.tests)) {
    for (const t of r.tests) {
      tests += 1;
      if (t.status === 'failure' || t.status === 'failed') failures += 1;
      else if (t.status === 'error') errors += 1;
      else if (t.status === 'skipped') skipped += 1;
      duration += Number(t.duration) || 0;
    }
  } else {
    tests = Number(r.tests) || 0; failures = Number(r.failures) || 0; errors = Number(r.errors) || 0; skipped = Number(r.skipped) || 0; duration = Number(r.duration) || 0;
  }
  const executed = tests - skipped;
  return {
    tests,
    test_failures: failures,
    test_errors: errors,
    skipped_tests: skipped,
    test_execution_time: Math.round(duration),
    test_success_density: executed > 0 ? Math.round(((executed - failures - errors) / executed) * 1000) / 10 : null,
  };
}

/**
 * code quality software-quality impacts for a legacy type/severity.
 * BUG -> RELIABILITY, VULNERABILITY -> SECURITY, CODE_SMELL -> MAINTAINABILITY.
 * BLOCKER -> BLOCKER, CRITICAL -> HIGH, MAJOR -> MEDIUM, MINOR -> LOW, INFO -> INFO.
 * Hotspots carry no impact.
 * @returns {{softwareQuality:string, severity:string}[]}
 */
function impactsOf(issue) {
  if (issue && Array.isArray(issue.impacts) && issue.impacts.length) return issue.impacts;
  const quality = { BUG: 'RELIABILITY', VULNERABILITY: 'SECURITY', CODE_SMELL: 'MAINTAINABILITY' }[issue && issue.type];
  if (!quality) return [];
  const severity = { BLOCKER: 'BLOCKER', CRITICAL: 'HIGH', MAJOR: 'MEDIUM', MINOR: 'LOW', INFO: 'INFO' }[issue.severity] || 'MEDIUM';
  return [{ softwareQuality: quality, severity }];
}

/** Legacy type/severity back from an impact (for external issues that only carry impacts). */
function legacyFromImpact(impact) {
  const type = { RELIABILITY: 'BUG', SECURITY: 'VULNERABILITY', MAINTAINABILITY: 'CODE_SMELL' }[impact && impact.softwareQuality] || 'CODE_SMELL';
  const severity = { BLOCKER: 'BLOCKER', HIGH: 'CRITICAL', MEDIUM: 'MAJOR', LOW: 'MINOR', INFO: 'INFO' }[impact && impact.severity] || 'MAJOR';
  return { type, severity };
}

const IMPACT_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'BLOCKER'];

/**
 * Software-quality breakdown and MQR-mode ratings (A = none, B = Low, C = Medium, D = High, E = Blocker;
 * Info does not lower the rating). Maintainability rating stays the debt-ratio one when ncloc is given.
 * @param {object[]} issues
 * @param {{ncloc?:number, newCodeOnly?:boolean}} [opts]
 */
function softwareQualities(issues, opts = {}) {
  const out = {};
  for (const q of ['SECURITY', 'RELIABILITY', 'MAINTAINABILITY']) out[q] = { total: 0, INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 0, BLOCKER: 0, effort: 0, rating: 'A' };
  for (const issue of issues || []) {
    if (isClosed(issue) || (opts.newCodeOnly && !issue.isNew)) continue;
    for (const imp of impactsOf(issue)) {
      const row = out[imp.softwareQuality];
      if (!row) continue;
      row.total += 1;
      row[imp.severity] = (row[imp.severity] || 0) + 1;
      row.effort += Number(issue.debtMin) || 0;
    }
  }
  for (const [q, row] of Object.entries(out)) {
    let worst = 0;
    for (let n = 1; n < IMPACT_SEVERITIES.length; n++) if (row[IMPACT_SEVERITIES[n]]) worst = n;
    row.rating = ['A', 'B', 'C', 'D', 'E'][worst];
    if (q === 'MAINTAINABILITY' && opts.ncloc) {
      const ratio = (row.effort / (opts.ncloc * DEV_MIN_PER_LINE)) * 100;
      row.debtRatio = Math.round(ratio * 10) / 10;
      row.rating = ratio > 50 ? 'E' : ratio > 20 ? 'D' : ratio > 10 ? 'C' : ratio > 5 ? 'B' : 'A';
    }
  }
  return out;
}

/**
 * Component tree for drill-down: directories aggregate their files.
 * @param {object} analysis needs .files [{path, language, ncloc, lines, complexity, coverage}] and .issues
 * @param {{coverage?:{files:object}}} [opts] parseLcovFull() output gives exact per-directory coverage
 * @returns {{key:string, name:string, qualifier:'DIR'|'FIL', path:string, measures:object, children:object[]}}
 */
function componentTree(analysis, opts = {}) {
  const make = (p, qualifier) => ({
    key: p || '.', name: p ? p.split('/').pop() : '.', qualifier, path: p,
    measures: { files: 0, ncloc: 0, lines: 0, complexity: 0, bugs: 0, vulnerabilities: 0, code_smells: 0, security_hotspots: 0, sqale_index: 0, lines_to_cover: 0, uncovered_lines: 0, coverage: null },
    children: [],
  });
  const root = make('', 'DIR');
  const dirs = new Map([['', root]]);
  const dirFor = (dirPath) => {
    if (dirs.has(dirPath)) return dirs.get(dirPath);
    const parentPath = dirPath.includes('/') ? dirPath.slice(0, dirPath.lastIndexOf('/')) : '';
    const node = make(dirPath, 'DIR');
    dirFor(parentPath).children.push(node);
    dirs.set(dirPath, node);
    return node;
  };
  const byFile = new Map();
  for (const issue of (analysis && analysis.issues) || []) {
    if (isClosed(issue)) continue;
    const f = normPath(issue.file);
    const m = byFile.get(f) || { bugs: 0, vulnerabilities: 0, code_smells: 0, security_hotspots: 0, sqale_index: 0 };
    if (issue.type === 'BUG') m.bugs += 1;
    else if (issue.type === 'VULNERABILITY') m.vulnerabilities += 1;
    else if (issue.type === 'SECURITY_HOTSPOT') m.security_hotspots += 1;
    else { m.code_smells += 1; m.sqale_index += Number(issue.debtMin) || 0; }
    byFile.set(f, m);
  }
  const covFiles = (opts.coverage && opts.coverage.files) || {};
  for (const row of (analysis && analysis.files) || []) {
    const p = normPath(row.path);
    const dirPath = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    const node = make(p, 'FIL');
    node.language = row.language || row.lang || null;
    const m = node.measures;
    m.files = 1; m.ncloc = row.ncloc || 0; m.lines = row.lines || 0; m.complexity = row.complexity || 0;
    Object.assign(m, byFile.get(p) || {});
    const rec = covFiles[p];
    if (rec) {
      const c = coverageNumbers({ [p]: rec });
      m.lines_to_cover = c.lines_to_cover; m.uncovered_lines = c.uncovered_lines; m.coverage = c.coverage;
    } else if (row.coverage != null) {
      m.coverage = row.coverage;
      m.lines_to_cover = m.ncloc; m.uncovered_lines = Math.round(m.ncloc * (1 - row.coverage / 100));
    }
    dirFor(dirPath).children.push(node);
  }
  const roll = (node) => {
    if (node.qualifier === 'FIL') return node.measures;
    const m = node.measures;
    for (const child of node.children) {
      const c = roll(child);
      for (const k of ['files', 'ncloc', 'lines', 'complexity', 'bugs', 'vulnerabilities', 'code_smells', 'security_hotspots', 'sqale_index', 'lines_to_cover', 'uncovered_lines']) m[k] += c[k] || 0;
    }
    m.coverage = m.lines_to_cover ? Math.round(((m.lines_to_cover - m.uncovered_lines) / m.lines_to_cover) * 1000) / 10 : null;
    node.children.sort((a, b) => (a.qualifier === b.qualifier ? a.name.localeCompare(b.name) : a.qualifier === 'DIR' ? -1 : 1));
    return m;
  };
  roll(root);
  return root;
}

/** Find a node of componentTree() by path. */
function findComponent(tree, p) {
  const want = normPath(p);
  if ((tree.path || '') === want) return tree;
  for (const c of tree.children || []) {
    if (want === c.path || want.startsWith(`${c.path}/`)) { const hit = findComponent(c, want); if (hit) return hit; }
  }
  return null;
}

/**
 * Lines of code per language: [{language, ncloc, files, percent}] sorted by ncloc.
 */
function languageDistribution(analysis) {
  const by = {};
  for (const row of (analysis && analysis.files) || []) {
    const lang = row.language || row.lang || 'other';
    const r = by[lang] || (by[lang] = { language: lang, ncloc: 0, files: 0 });
    r.ncloc += row.ncloc || 0;
    r.files += 1;
  }
  const total = Object.values(by).reduce((n, r) => n + r.ncloc, 0);
  return Object.values(by).map((r) => ({ ...r, percent: total ? Math.round((r.ncloc / total) * 1000) / 10 : 0 })).sort((a, b) => b.ncloc - a.ncloc);
}

/** code quality's `ncloc_language_distribution` string, e.g. 'c=120;js=40'. */
function languageDistributionString(analysis) {
  return languageDistribution(analysis).map((r) => `${r.language}=${r.ncloc}`).join(';');
}

/**
 * Everything above in one measures object for an analysis.
 * @param {object} analysis
 * @param {{coverage?:object, changed?:object, tests?:object}} [opts]
 */
function extraMeasures(analysis, opts = {}) {
  const m = (analysis && analysis.measures) || {};
  const out = { ...remediationEfforts((analysis && analysis.issues) || []) };
  out.effort_to_reach_maintainability_rating_a = effortToReachMaintainabilityA(m.sqale_index != null ? m.sqale_index : out.sqale_index, m.ncloc || 0);
  if (opts.coverage) Object.assign(out, coverageMeasures(opts.coverage));
  if (opts.coverage && opts.changed) Object.assign(out, newCodeCoverage(opts.coverage, opts.changed));
  if (opts.tests) Object.assign(out, testMetrics(opts.tests));
  out.ncloc_language_distribution = languageDistributionString(analysis);
  const sq = softwareQualities((analysis && analysis.issues) || [], { ncloc: m.ncloc });
  out.software_quality_security_issues = sq.SECURITY.total;
  out.software_quality_reliability_issues = sq.RELIABILITY.total;
  out.software_quality_maintainability_issues = sq.MAINTAINABILITY.total;
  out.software_quality_security_rating = sq.SECURITY.rating;
  out.software_quality_reliability_rating = sq.RELIABILITY.rating;
  out.software_quality_maintainability_rating = sq.MAINTAINABILITY.rating;
  return out;
}

module.exports = {
  DEV_MIN_PER_LINE, remediationEfforts, effortToReachMaintainabilityA, parseLcovFull, coverageMeasures, newCodeCoverage,
  testMetrics, impactsOf, legacyFromImpact, softwareQualities, componentTree, findComponent, languageDistribution,
  languageDistributionString, extraMeasures,
};
