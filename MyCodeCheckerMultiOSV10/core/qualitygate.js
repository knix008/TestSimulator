'use strict';

// A quality gate is a list of conditions. A condition fails when the measure
// breaks the operator (coverage LT 80 fails when coverage is under 80).
// Missing coverage does not fail a coverage condition: there is nothing to judge.
// A condition with enabled: false is shown but not judged.

// The new-code conditions (the pull-request gate, and the default gate of
// older versions).
const NEW_CODE_CONDITIONS = [
  { id: 'c1', metric: 'new_bugs', op: 'GT', threshold: 0, on: 'new' },
  { id: 'c2', metric: 'new_vulnerabilities', op: 'GT', threshold: 0, on: 'new' },
  { id: 'c3', metric: 'new_security_hotspots_reviewed', op: 'LT', threshold: 100, on: 'new' },
  { id: 'c4', metric: 'new_coverage', op: 'LT', threshold: 80, on: 'new' },
  { id: 'c5', metric: 'new_duplicated_lines_density', op: 'GT', threshold: 3, on: 'new' },
  { id: 'c6', metric: 'new_maintainability_rating', op: 'GT', threshold: 1, on: 'new' },
  { id: 'c7', metric: 'new_reliability_rating', op: 'GT', threshold: 1, on: 'new' },
  { id: 'c8', metric: 'new_security_rating', op: 'GT', threshold: 1, on: 'new' },
];

// The default gate judges the whole code as it is now (not only what changed
// since the last analysis), so it always tells the current state.
const DEFAULT_CONDITIONS = [
  { id: 'c1', metric: 'bugs', op: 'GT', threshold: 0, on: 'overall', enabled: true },
  { id: 'c2', metric: 'vulnerabilities', op: 'GT', threshold: 0, on: 'overall', enabled: true },
  { id: 'c3', metric: 'security_hotspots_reviewed', op: 'LT', threshold: 100, on: 'overall', enabled: true },
  { id: 'c4', metric: 'coverage', op: 'LT', threshold: 80, on: 'overall', enabled: true },
  { id: 'c5', metric: 'duplicated_lines_density', op: 'GT', threshold: 3, on: 'overall', enabled: true },
  { id: 'c6', metric: 'maintainability_rating', op: 'GT', threshold: 1, on: 'overall', enabled: true },
  { id: 'c7', metric: 'reliability_rating', op: 'GT', threshold: 1, on: 'overall', enabled: true },
  { id: 'c8', metric: 'security_rating', op: 'GT', threshold: 1, on: 'overall', enabled: true },
];

const DEFAULT_GATE = {
  id: 'checker-way',
  name: 'Checker way',
  isDefault: true,
  conditions: DEFAULT_CONDITIONS,
};

const sameConditions = (a, b) => Array.isArray(a) && a.length === b.length
  && a.every((c, i) => c.metric === b[i].metric && c.op === b[i].op && Number(c.threshold) === Number(b[i].threshold));

/**
 * The built-in gate saved by an older version (new-code conditions only, never
 * edited) becomes the current default. A gate the user changed is kept.
 */
function upgradeGates(gates) {
  if (!Array.isArray(gates)) return gates;
  let changed = false;
  const out = gates.map((g) => {
    if (!g || g.id !== DEFAULT_GATE.id || !sameConditions(g.conditions, NEW_CODE_CONDITIONS)) return g;
    changed = true;
    return { ...g, conditions: DEFAULT_CONDITIONS.map((c) => ({ ...c })) };
  });
  return changed ? out : gates;
}

const METRICS = {
  bugs: { ko: '버그', en: 'Bugs', kind: 'count' },
  vulnerabilities: { ko: '취약점', en: 'Vulnerabilities', kind: 'count' },
  code_smells: { ko: '코드 스멜', en: 'Code smells', kind: 'count' },
  security_hotspots: { ko: '보안 핫스팟', en: 'Security hotspots', kind: 'count' },
  security_hotspots_reviewed: { ko: '검토한 핫스팟 %', en: 'Hotspots reviewed %', kind: 'percent' },
  coverage: { ko: '커버리지', en: 'Coverage', kind: 'percent' },
  duplicated_lines_density: { ko: '중복 줄 %', en: 'Duplicated lines %', kind: 'percent' },
  ncloc: { ko: '코드 줄', en: 'Lines of code', kind: 'count' },
  sqale_index: { ko: '기술 부채(분)', en: 'Technical debt (min)', kind: 'count' },
  sqale_debt_ratio: { ko: '부채 비율', en: 'Debt ratio', kind: 'percent' },
  complexity: { ko: '복잡도', en: 'Complexity', kind: 'count' },
  reliability_rating: { ko: '신뢰성 등급', en: 'Reliability rating', kind: 'rating' },
  security_rating: { ko: '보안 등급', en: 'Security rating', kind: 'rating' },
  maintainability_rating: { ko: '유지보수성 등급', en: 'Maintainability rating', kind: 'rating' },
  security_review_rating: { ko: '보안 검토 등급', en: 'Security review rating', kind: 'rating' },
  duplicated_lines: { ko: '중복 줄', en: 'Duplicated lines', kind: 'count' },
  comment_density: { ko: '주석 밀도', en: 'Comment density', kind: 'percent' },
  files: { ko: '파일', en: 'Files', kind: 'count' },
};

function metricLabel(key, lang) {
  const base = key.replace(/^new_/, '');
  const meta = METRICS[base];
  const name = meta ? meta[lang] || meta.en : base;
  if (key.startsWith('new_')) return lang === 'ko' ? `새 코드 · ${name}` : `New code · ${name}`;
  return name;
}

function compare(actual, op, threshold) {
  if (actual == null || Number.isNaN(actual)) return false;
  if (op === 'GT') return actual > threshold;
  if (op === 'LT') return actual < threshold;
  if (op === 'GTE') return actual >= threshold;
  if (op === 'LTE') return actual <= threshold;
  if (op === 'EQ') return actual === threshold;
  if (op === 'NE') return actual !== threshold;
  return false;
}

function evaluateGate(gate, measures) {
  const conditions = (gate && gate.conditions ? gate.conditions : []).map((c) => {
    if (c.enabled === false) return { ...c, actual: measures[c.metric] ?? null, status: 'OFF' };
    const actual = measures[c.metric];
    const missing = actual == null || Number.isNaN(actual);
    const coverageLike = /coverage/.test(c.metric);
    const skipped = missing && coverageLike;
    const failed = !skipped && !missing && compare(actual, c.op, Number(c.threshold));
    const noData = missing && !coverageLike;
    return {
      ...c,
      actual: missing ? null : actual,
      status: skipped || noData ? 'NO_DATA' : failed ? 'ERROR' : 'OK',
    };
  });
  // A gate with only NO_DATA coverage still passes. Any ERROR fails the gate.
  const status = conditions.some((c) => c.status === 'ERROR') ? 'ERROR' : 'OK';
  return { id: gate && gate.id, name: gate && gate.name, status, conditions };
}

// Issue-based measures recomputed from the issues as they are now (after
// false positives, accepted issues, reviewed hotspots), so the gate shows the
// current state without a new analysis. File-based measures (lines,
// duplication, coverage) stay as analyzed.
function currentMeasures(analysis) {
  const { rate, countOpen, isClosed } = require('./ratings');
  const m = { ...((analysis && analysis.measures) || {}) };
  const issues = (analysis && analysis.issues) || [];
  const plain = issues.filter((i) => i.type !== 'SECURITY_HOTSPOT');
  const hotspots = issues.filter((i) => i.type === 'SECURITY_HOTSPOT');
  const debt = (list) => list.filter((i) => i.type === 'CODE_SMELL' && !isClosed(i)).reduce((n, i) => n + (i.debtMin || 0), 0);
  const all = rate(plain, hotspots, debt(plain), m.ncloc || 0);
  Object.assign(m, {
    bugs: countOpen(plain, 'BUG'), vulnerabilities: countOpen(plain, 'VULNERABILITY'), code_smells: countOpen(plain, 'CODE_SMELL'),
    security_hotspots: hotspots.filter((h) => !h.resolution).length, security_hotspots_reviewed: all.hotspotsReviewed,
    sqale_index: debt(plain), sqale_debt_ratio: all.debtRatio,
    reliability_rating: all.reliabilityValue, security_rating: all.securityValue, maintainability_rating: all.maintainabilityValue, security_review_rating: all.securityReviewValue,
  });
  const fresh = issues.filter((i) => i.isNew);
  const freshPlain = fresh.filter((i) => i.type !== 'SECURITY_HOTSPOT');
  const next = rate(freshPlain, fresh.filter((i) => i.type === 'SECURITY_HOTSPOT'), debt(freshPlain), m.new_ncloc || 0);
  Object.assign(m, {
    new_bugs: countOpen(freshPlain, 'BUG'), new_vulnerabilities: countOpen(freshPlain, 'VULNERABILITY'), new_code_smells: countOpen(freshPlain, 'CODE_SMELL'),
    new_security_hotspots_reviewed: next.hotspotsReviewed,
    new_reliability_rating: next.reliabilityValue, new_security_rating: next.securityValue, new_maintainability_rating: next.maintainabilityValue,
  });
  return m;
}

module.exports = { DEFAULT_GATE, DEFAULT_CONDITIONS, NEW_CODE_CONDITIONS, METRICS, metricLabel, compare, evaluateGate, upgradeGates, currentMeasures };
