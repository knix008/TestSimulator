'use strict';

// A quality gate is a list of conditions. A condition fails when the measure
// breaks the operator (coverage LT 80 fails when coverage is under 80).
// Missing coverage does not fail a coverage condition: there is nothing to judge.

const SONAR_WAY = {
  id: 'checker-way',
  name: 'Checker way',
  isDefault: true,
  conditions: [
    { id: 'c1', metric: 'new_bugs', op: 'GT', threshold: 0, on: 'new' },
    { id: 'c2', metric: 'new_vulnerabilities', op: 'GT', threshold: 0, on: 'new' },
    { id: 'c3', metric: 'new_security_hotspots_reviewed', op: 'LT', threshold: 100, on: 'new' },
    { id: 'c4', metric: 'new_coverage', op: 'LT', threshold: 80, on: 'new' },
    { id: 'c5', metric: 'new_duplicated_lines_density', op: 'GT', threshold: 3, on: 'new' },
    { id: 'c6', metric: 'new_maintainability_rating', op: 'GT', threshold: 1, on: 'new' },
    { id: 'c7', metric: 'new_reliability_rating', op: 'GT', threshold: 1, on: 'new' },
    { id: 'c8', metric: 'new_security_rating', op: 'GT', threshold: 1, on: 'new' },
  ],
};

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

module.exports = { SONAR_WAY, METRICS, metricLabel, compare, evaluateGate };
