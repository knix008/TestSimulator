'use strict';

// Rule definition helper. A rule is
//   { id, type, severity, debt, tags, sonar, name, why, fix, on?, module?, flow? }
// `on` maps AST node types to handlers (node, c, r); `module(c, r)` runs once
// per file; flow rules are driven by rules/flow.js.

const TYPES = { B: 'BUG', V: 'VULNERABILITY', S: 'CODE_SMELL', H: 'SECURITY_HOTSPOT' };
const SEVS = { BL: 'BLOCKER', CR: 'CRITICAL', MA: 'MAJOR', MI: 'MINOR', IN: 'INFO' };

function define(list) {
  return (id, type, sev, debt, tags, sonar, name, why, fix, impl = {}) => {
    const rule = {
      id,
      type: TYPES[type] || type,
      severity: SEVS[sev] || sev,
      debt,
      tags,
      sonar,
      name: { en: name[0], ko: name[1] },
      why: { en: why[0], ko: why[1] },
      fix: { en: fix[0], ko: fix[1] },
      ...impl,
    };
    list.push(rule);
    return rule;
  };
}

const QUALITY = { BUG: 'RELIABILITY', VULNERABILITY: 'SECURITY', CODE_SMELL: 'MAINTAINABILITY' };
const IMPACT_SEV = { BLOCKER: 'BLOCKER', CRITICAL: 'HIGH', MAJOR: 'MEDIUM', MINOR: 'LOW', INFO: 'INFO' };

function toMeta(rule) {
  const tags = [...new Set(['python', ...rule.tags.map((t) => String(t).toLowerCase())])];
  const cwes = tags.filter((t) => /^cwe-\d+$/.test(t)).map((t) => t.toUpperCase());
  const owasp = tags.filter((t) => /^owasp-a\d\d$/.test(t)).map((t) => t.slice(6).toUpperCase());
  const standards = {};
  if (cwes.length) standards.cwe = cwes;
  if (owasp.length) standards.owasp2021 = owasp;
  const meta = {
    key: `sem-py:${rule.id}`,
    langs: ['py'],
    type: rule.type,
    severity: rule.severity,
    debtMin: rule.debt,
    tags,
    name: rule.name,
    why: rule.why,
    fix: rule.fix,
    cwe: cwes[0] || '',
    standards,
    category: rule.category || categoryOf(rule),
    checker: rule.sonar ? `python:${rule.sonar}` : '',
  };
  if (rule.sonar) meta.sonarKey = rule.sonar;
  if (QUALITY[rule.type]) {
    meta.impacts = [{ softwareQuality: QUALITY[rule.type], severity: IMPACT_SEV[rule.severity] }];
    if (rule.alsoImpacts) meta.impacts.push(...rule.alsoImpacts);
  }
  return meta;
}

function categoryOf(rule) {
  if (rule.type === 'VULNERABILITY' || rule.type === 'SECURITY_HOTSPOT') return 'Security';
  if (rule.tags.includes('data-science')) return 'Data science';
  if (rule.type === 'BUG') return 'Reliability';
  return 'Maintainability';
}

module.exports = { define, toMeta, TYPES, SEVS };
