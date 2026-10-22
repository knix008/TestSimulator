'use strict';

// Rule registry. A rule is declared with
//   rule(id, { t: 'B'|'S'|'V'|'H', s: 'BL'|'CR'|'MA'|'MI'|'IN', debt, tags, sonar, cwe, owasp, ts, react,
//              name: [en, ko], why: [en, ko], fix: [en, ko] }, run(ctx))
// and run() reports through ctx.report(node, message).

const TYPES = { B: 'BUG', V: 'VULNERABILITY', S: 'CODE_SMELL', H: 'SECURITY_HOTSPOT' };
const SEVS = { BL: 'BLOCKER', CR: 'CRITICAL', MA: 'MAJOR', MI: 'MINOR', IN: 'INFO' };
const QUALITY = { BUG: 'RELIABILITY', CODE_SMELL: 'MAINTAINABILITY', VULNERABILITY: 'SECURITY', SECURITY_HOTSPOT: 'SECURITY' };
const IMPACT = { BLOCKER: 'BLOCKER', CRITICAL: 'HIGH', MAJOR: 'MEDIUM', MINOR: 'LOW', INFO: 'INFO' };

const RULES = [];
const BY_ID = new Map();

function rule(id, meta, run) {
  if (BY_ID.has(id)) throw new Error(`duplicate sem-js rule ${id}`);
  const type = TYPES[meta.t];
  const severity = SEVS[meta.s];
  if (!type || !severity) throw new Error(`bad meta for ${id}`);
  const tags = (meta.tags || []).map((x) => x.toLowerCase());
  const cwes = [].concat(meta.cwe || []);
  for (const c of cwes) {
    const tag = c.toLowerCase();
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (meta.ts && !tags.includes('typescript')) tags.push('typescript');
  if (meta.react && !tags.includes('react')) tags.push('react');
  const r = {
    id,
    key: `sem-js:${id}`,
    type,
    severity,
    debtMin: meta.debt || 5,
    tags,
    langs: meta.ts ? ['ts'] : ['js', 'ts'],
    tsOnly: !!meta.ts,
    sonar: meta.sonar || '',
    cwe: cwes[0] || '',
    cwes,
    owasp: [].concat(meta.owasp || []),
    name: { en: meta.name[0], ko: meta.name[1] },
    why: { en: meta.why[0], ko: meta.why[1] },
    fix: { en: meta.fix[0], ko: meta.fix[1] },
    impacts: meta.impacts || { [QUALITY[type]]: IMPACT[severity] },
    needs: meta.needs || null,
    run,
  };
  RULES.push(r);
  BY_ID.set(id, r);
  return r;
}

function meta(r) {
  const standards = {};
  if (r.cwes.length) standards.cwe = r.cwes.slice();
  if (r.owasp.length) standards.owasp2021 = r.owasp.slice();
  const out = {
    key: r.key,
    langs: r.langs.slice(),
    type: r.type,
    severity: r.severity,
    debtMin: r.debtMin,
    tags: r.tags.slice(),
    name: r.name,
    why: r.why,
    fix: r.fix,
    cwe: r.cwe,
    impacts: { ...r.impacts },
    category: CATEGORY[r.type],
  };
  if (Object.keys(standards).length) out.standards = standards;
  if (r.sonar) out.sonarKey = r.sonar;
  return out;
}

const CATEGORY = { BUG: 'Reliability', CODE_SMELL: 'Maintainability', VULNERABILITY: 'Security', SECURITY_HOTSPOT: 'Security hotspot' };

function m(en, ko) { return { en, ko }; }

module.exports = { rule, RULES, BY_ID, meta, m };
