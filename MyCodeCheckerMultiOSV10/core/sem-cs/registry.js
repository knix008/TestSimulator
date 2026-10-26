'use strict';

// Rule registry. A rule is declared once with metadata and an implementation:
//   impl.kinds: { NodeKind(node, cx) }   called for every node of that kind
//   impl.file(pf, cx)                     called once per file
//   impl.project(project, cx)             called once per analysis
//   impl.engine: 'se' | 'flow'            produced by the flow engines
// cx.report(node, en, ko, extra) emits a finding for the rule.

const TYPES = { B: 'BUG', V: 'VULNERABILITY', S: 'CODE_SMELL', H: 'SECURITY_HOTSPOT' };
const SEVS = { BL: 'BLOCKER', CR: 'CRITICAL', MA: 'MAJOR', MI: 'MINOR', IN: 'INFO' };
const IMPACT_SEV = { BLOCKER: 'BLOCKER', CRITICAL: 'HIGH', MAJOR: 'MEDIUM', MINOR: 'LOW', INFO: 'INFO' };
const QUALITY = { BUG: 'RELIABILITY', VULNERABILITY: 'SECURITY', SECURITY_HOTSPOT: 'SECURITY', CODE_SMELL: 'MAINTAINABILITY' };

const RULES = [];
const BY_KEY = new Map();

// R(id, refKey, type, severity, debtMin, tags, [nameEn, whyEn, fixEn], [nameKo, whyKo, fixKo], impl, extra)
function R(id, ref, type, sev, debt, tags, en, ko, impl, extra = {}) {
  const key = `sem-cs:${id}`;
  if (BY_KEY.has(key)) throw new Error(`duplicate rule ${key}`);
  const t = TYPES[type] || type;
  const severity = SEVS[sev] || sev;
  const cwes = tags.filter((x) => /^cwe-\d+$/.test(x)).map((x) => `CWE-${x.slice(4)}`);
  const rule = {
    key, id, ref, type: t, severity, debtMin: debt,
    tags: [...new Set(['csharp', ...tags])],
    name: { en: en[0], ko: ko[0] }, why: { en: en[1], ko: ko[1] }, fix: { en: en[2], ko: ko[2] },
    cwe: cwes[0] || '',
    impl: impl || {},
    extra,
    qualities: extra.qualities || [QUALITY[t]],
  };
  RULES.push(rule);
  BY_KEY.set(key, rule);
  return rule;
}

function meta(rule) {
  const m = {
    key: rule.key,
    langs: ['cs'],
    type: rule.type,
    severity: rule.severity,
    debtMin: rule.debtMin,
    tags: rule.tags,
    name: rule.name,
    why: rule.why,
    fix: rule.fix,
    cwe: rule.cwe,
    refKey: rule.ref || '',
    impacts: rule.qualities.map((q) => ({ softwareQuality: q, severity: IMPACT_SEV[rule.severity] })),
    engine: rule.impl.engine || 'syntax',
  };
  const std = {};
  const cwes = rule.tags.filter((x) => /^cwe-\d+$/.test(x)).map((x) => `CWE-${x.slice(4)}`);
  if (cwes.length) std.cwe = cwes;
  const owasp = rule.tags.filter((x) => /^owasp-a\d+$/.test(x)).map((x) => x.slice(6).toUpperCase());
  if (owasp.length) std.owasp2021 = owasp;
  if (Object.keys(std).length) m.standards = std;
  if (rule.extra.category) m.category = rule.extra.category;
  return m;
}

module.exports = { R, RULES, BY_KEY, meta };
