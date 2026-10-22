'use strict';

// Compact rule factory for the CERT pack.
//
//   rule('STR31-C', {
//     langs: ['c', 'cpp'],          // default: C rules ['c','cpp'] (CERT C applies to C++ too), -CPP rules ['cpp']
//     risk: 'HLM',                  // CERT risk assessment: severity H/M/L, likelihood L(ikely)/P(robable)/U(nlikely), cost H/M/L
//     cwe: ['CWE-120'],             // first one becomes meta.cwe
//     sec: true,                    // security relevant -> VULNERABILITY (rules); default BUG
//     type: 'BUG',                  // explicit override
//     debt: 10,                     // remediation minutes (default from severity)
//     approx: true,                 // partial / heuristic check
//     deep: 'absint:OVERRUN',       // the abstract interpreter owns the value analysis
//     owasp: ['A03'],               // extra OWASP 2021 ids (some are derived from the CWE list)
//     tags: ['injection'],          // extra tags
//     name: ['en', 'ko'], why: ['en', 'ko'], fix: ['en', 'ko'],
//   }, { check(unit, api) {} } | { project(project, api) {} })
//
// Recommendations (IDs 00-29 in C, e.g. MSC24-C) are CODE_SMELL.

// 2024 CWE Top 25 Most Dangerous Software Weaknesses.
const CWE_TOP25_2024 = new Set([
  'CWE-79', 'CWE-787', 'CWE-89', 'CWE-352', 'CWE-22', 'CWE-125', 'CWE-78', 'CWE-416', 'CWE-862',
  'CWE-434', 'CWE-94', 'CWE-20', 'CWE-77', 'CWE-287', 'CWE-269', 'CWE-502', 'CWE-200', 'CWE-863',
  'CWE-918', 'CWE-119', 'CWE-476', 'CWE-798', 'CWE-190', 'CWE-400', 'CWE-306',
]);

// OWASP Top 10 2021 categories for the CWEs CERT rules map to.
const OWASP_OF_CWE = {
  'CWE-77': ['A03'], 'CWE-78': ['A03'], 'CWE-88': ['A03'], 'CWE-134': ['A03'], 'CWE-89': ['A03'],
  'CWE-20': ['A03'], 'CWE-94': ['A03'], 'CWE-74': ['A03'],
  'CWE-22': ['A01'], 'CWE-59': ['A01'], 'CWE-200': ['A01'], 'CWE-276': ['A01'], 'CWE-377': ['A01'],
  'CWE-379': ['A01'], 'CWE-732': ['A01'], 'CWE-275': ['A01'],
  'CWE-327': ['A02'], 'CWE-330': ['A02'], 'CWE-331': ['A02'], 'CWE-335': ['A02'], 'CWE-337': ['A02'],
  'CWE-338': ['A02'], 'CWE-310': ['A02'], 'CWE-311': ['A02'],
  'CWE-250': ['A04'], 'CWE-269': ['A04'], 'CWE-367': ['A04'], 'CWE-362': ['A04'], 'CWE-209': ['A04'],
  'CWE-272': ['A04'], 'CWE-273': ['A04'],
  'CWE-676': ['A06'], 'CWE-477': ['A06'], 'CWE-1104': ['A06'],
  'CWE-426': ['A08'], 'CWE-427': ['A08'], 'CWE-502': ['A08'], 'CWE-829': ['A08'],
  'CWE-117': ['A09'], 'CWE-778': ['A09'], 'CWE-391': ['A09'],
};

const SEV = { H: 3, M: 2, L: 1 };
const LIKE = { L: 3, P: 2, U: 1 };
const COST = { L: 3, M: 2, H: 1 };
const SEV_NAME = { H: 'High', M: 'Medium', L: 'Low' };
const LIKE_NAME = { L: 'Likely', P: 'Probable', U: 'Unlikely' };
const COST_NAME = { L: 'Low', M: 'Medium', H: 'High' };

function isRecommendation(id) {
  const m = /^[A-Z]{3}(\d\d)-(C|CPP)$/.exec(id);
  if (!m) return false;
  const n = Number(m[1]);
  return m[2] === 'C' ? n < 30 : n < 50;
}

function riskOf(risk) {
  const r = String(risk || 'MPM').toUpperCase();
  const s = SEV[r[0]] || 2, l = LIKE[r[1]] || 2, c = COST[r[2]] || 2;
  const p = s * l * c;
  const level = p >= 12 ? 'L1' : p >= 6 ? 'L2' : 'L3';
  return {
    priority: p, level,
    severity: SEV_NAME[r[0]] || 'Medium', likelihood: LIKE_NAME[r[1]] || 'Probable', cost: COST_NAME[r[2]] || 'Medium',
  };
}

function severityOf(risk, rec) {
  const r = String(risk || 'MPM').toUpperCase();
  let sev = r[0] === 'H' ? (r[1] === 'L' ? 'BLOCKER' : 'CRITICAL') : r[0] === 'M' ? 'MAJOR' : 'MINOR';
  if (rec && sev === 'BLOCKER') sev = 'CRITICAL';
  return sev;
}

const pair = (v, what, id) => {
  if (!Array.isArray(v) || v.length !== 2 || !v[0] || !v[1]) throw new Error(`cert ${id}: ${what} needs [en, ko]`);
  return { en: v[0], ko: v[1] };
};

function rule(id, spec, impl) {
  const cpp = id.endsWith('-CPP');
  const rec = isRecommendation(id);
  const risk = riskOf(spec.risk);
  const cwe = (spec.cwe || []).slice();
  const type = spec.type || (rec ? 'CODE_SMELL' : spec.sec ? 'VULNERABILITY' : 'BUG');
  const severity = spec.severity || severityOf(spec.risk, rec);
  const standards = { [cpp ? 'certCpp' : 'certC']: id };
  if (cwe.length) standards.cwe = cwe;
  const owasp = new Set(spec.owasp || []);
  if (type === 'VULNERABILITY' || type === 'SECURITY_HOTSPOT') for (const c of cwe) for (const o of OWASP_OF_CWE[c] || []) owasp.add(o);
  if (owasp.size) standards.owasp2021 = [...owasp].sort();
  if (cwe.some((c) => CWE_TOP25_2024.has(c))) standards.cweTop25 = true;
  const tags = ['cert', ...(spec.tags || []), ...cwe.map((c) => c.toLowerCase())];
  if (rec) tags.push('cert-recommendation');
  const meta = {
    key: `cert:${id}`,
    langs: spec.langs || (cpp ? ['cpp'] : ['c', 'cpp']),
    type,
    severity,
    debtMin: spec.debt || (severity === 'BLOCKER' || severity === 'CRITICAL' ? 20 : severity === 'MAJOR' ? 10 : 5),
    tags: [...new Set(tags)],
    name: pair(spec.name, 'name', id),
    why: pair(spec.why, 'why', id),
    fix: pair(spec.fix, 'fix', id),
    category: spec.category || (cpp ? 'SEI CERT C++' : 'SEI CERT C'),
    cwe: cwe[0] || '',
    cert: `CERT ${id}`,
    standards,
    certPriority: risk.level,
    certLevel: risk.level,
    certRisk: { severity: risk.severity, likelihood: risk.likelihood, remediationCost: risk.cost, priority: `P${risk.priority}` },
    certKind: rec ? 'recommendation' : 'rule',
  };
  if (spec.checker) meta.checker = spec.checker;
  if (spec.approx) meta.approximation = true;
  meta.decidable = !spec.approx && !spec.deep;
  if (spec.deep) meta.deepAnalysis = spec.deep;
  const out = { meta };
  if (impl && impl.check) out.check = impl.check;
  if (impl && impl.project) out.project = impl.project;
  if (typeof impl === 'function') out.check = impl;
  if (!out.check && !out.project) throw new Error(`cert ${id}: no check/project`);
  return out;
}

module.exports = { rule, riskOf, severityOf, isRecommendation, CWE_TOP25_2024, OWASP_OF_CWE };
