// The built-in quality gate's conditions (same as core/qualitygate.js
// DEFAULT_CONDITIONS): the whole code as it is now. Settings › Quality gate
// resets to these.
export const DEFAULT_GATE_CONDITIONS = [
  { id: 'c1', metric: 'bugs', op: 'GT', threshold: 0, on: 'overall', enabled: true },
  { id: 'c2', metric: 'vulnerabilities', op: 'GT', threshold: 0, on: 'overall', enabled: true },
  { id: 'c3', metric: 'security_hotspots_reviewed', op: 'LT', threshold: 100, on: 'overall', enabled: true },
  { id: 'c4', metric: 'coverage', op: 'LT', threshold: 80, on: 'overall', enabled: true },
  { id: 'c5', metric: 'duplicated_lines_density', op: 'GT', threshold: 3, on: 'overall', enabled: true },
  { id: 'c6', metric: 'maintainability_rating', op: 'GT', threshold: 1, on: 'overall', enabled: true },
  { id: 'c7', metric: 'reliability_rating', op: 'GT', threshold: 1, on: 'overall', enabled: true },
  { id: 'c8', metric: 'security_rating', op: 'GT', threshold: 1, on: 'overall', enabled: true },
];

// Metrics a condition can use: the whole code, then new code.
export const GATE_METRICS = [
  'bugs', 'vulnerabilities', 'code_smells', 'security_hotspots', 'security_hotspots_reviewed', 'coverage', 'duplicated_lines_density',
  'reliability_rating', 'security_rating', 'maintainability_rating', 'security_review_rating', 'sqale_index', 'sqale_debt_ratio', 'complexity',
  'new_bugs', 'new_vulnerabilities', 'new_code_smells', 'new_security_hotspots_reviewed', 'new_coverage', 'new_duplicated_lines_density',
  'new_reliability_rating', 'new_security_rating', 'new_maintainability_rating',
];

/** The gate the settings edit: the default one (★), else the first. */
export function defaultGateOf(gates) {
  const list = Array.isArray(gates) ? gates : [];
  return list.find((g) => g && g.isDefault) || list[0] || { id: 'checker-way', name: 'Checker way', isDefault: true, conditions: DEFAULT_GATE_CONDITIONS };
}
