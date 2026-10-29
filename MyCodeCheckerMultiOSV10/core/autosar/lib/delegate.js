'use strict';

// AUTOSAR rules whose check is the same analysis as a MISRA C++:2023 rule.
// The MISRA rule pack is reused read-only: the AUTOSAR rule runs the MISRA
// rule's check with its own api, so findings carry the AUTOSAR key.
//
//   D('A5-2-4', ['8.2.5'], { cat, enf, name, why, fix, only, ... })
//
// Name / explanation default to the MISRA rule's own (project-written) texts.

const { A } = require('./meta');

let byId = null;
function misraRules() {
  if (!byId) {
    byId = new Map();
    const engine = require('../../misra-cpp');
    for (const r of engine.rules()) byId.set(r.meta.key.replace(/^misra-cpp:/, ''), r);
  }
  return byId;
}

function D(id, misraIds, over = {}) {
  const rules = misraIds.map((m) => {
    const r = misraRules().get(m);
    if (!r) throw new Error(`AUTOSAR ${id}: unknown MISRA C++ rule ${m}`);
    return r;
  });
  const first = rules[0].meta;
  const cwe = over.cwe || (first.standards.cwe && first.standards.cwe.length ? first.standards.cwe : undefined);
  const checks = rules.filter((r) => r.check);
  const projects = rules.filter((r) => r.project);
  const spec = {
    id,
    cat: over.cat || (first.misraCategory === 'Advisory' ? 'Advisory' : 'Required'),
    enf: over.enf || (first.decidable ? 'automated' : 'partially automated'),
    type: over.type || first.type,
    sev: over.sev || first.severity,
    debt: over.debt || first.debtMin,
    misra: over.misra || misraIds[0],
    cert: over.cert || first.standards.certCpp,
    cwe,
    tags: over.tags,
    name: over.name || first.name,
    why: over.why || first.why,
    fix: over.fix || first.fix,
  };
  // over.only(message): keep only the findings of the MISRA rule that this
  // AUTOSAR rule covers (when the MISRA rule checks more than one thing)
  const wrap = over.only ? (api) => ({ ...api, report: (where, message, extra) => (over.only(message || {}) ? api.report(where, message, extra) : undefined) }) : (api) => api;
  if (checks.length) spec.check = (unit, api) => { const a = wrap(api); for (const r of checks) r.check(unit, a); };
  if (projects.length) spec.project = (project, api) => { const a = wrap(api); for (const r of projects) r.project(project, a); };
  const rule = A(spec);
  rule.meta.delegates = misraIds.map((m) => `misra-cpp:${m}`);
  return rule;
}

module.exports = { D, misraRules };
