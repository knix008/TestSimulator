'use strict';

// Rule factory for the MISRA C++:2023 pack.
//
//   R({ id: '0.0.1', cat: 'Required', type, sev, debt, dec, autosar, cert, cwe,
//       name: [en, ko], why: [en, ko], fix: [en, ko], check(unit, api) | project(project, api) })
//
// Directives use `dir: true` (key `misra-cpp:dir-<id>`). `manual: true` marks a
// guideline that needs a human reviewer (empty check).

const SEVERITY_BY_CAT = { Mandatory: 'CRITICAL', Required: 'MAJOR', Advisory: 'MINOR' };

function txt(pair) {
  if (!pair) return { en: '', ko: '' };
  if (Array.isArray(pair)) return { en: pair[0], ko: pair[1] };
  return pair;
}

function R(spec) {
  const id = spec.id;
  const key = spec.dir ? `misra-cpp:dir-${id}` : `misra-cpp:${id}`;
  const cwes = spec.cwe ? [].concat(spec.cwe) : [];
  const standards = { misraCpp2023: `${spec.dir ? 'Dir' : 'Rule'} ${id}` };
  if (spec.autosar) standards.autosar = spec.autosar;
  if (spec.cert) standards.certCpp = spec.cert;
  if (cwes.length) standards.cwe = cwes;
  const tags = ['misra-cpp2023', 'misra', ...cwes.map((c) => c.toLowerCase())];
  if (spec.tags) for (const t of spec.tags) tags.push(t);
  const meta = {
    key,
    langs: ['cpp'],
    type: spec.type || 'CODE_SMELL',
    severity: spec.sev || SEVERITY_BY_CAT[spec.cat] || 'MAJOR',
    debtMin: spec.debt || 10,
    tags,
    name: txt(spec.name),
    why: txt(spec.why),
    fix: txt(spec.fix),
    cwe: cwes[0] || '',
    cert: spec.cert ? `CERT ${spec.cert}` : '',
    standards,
    misraCategory: spec.cat,
    decidable: !!spec.dec,
  };
  if (spec.manual) meta.manualReview = true;
  const rule = { meta };
  if (spec.check) rule.check = spec.check;
  if (spec.project) rule.project = spec.project;
  if (!spec.check && !spec.project) rule.check = () => {};
  return rule;
}

// Message helper: M('en text', 'ko text') -> { en, ko }
function M(en, ko) { return { en, ko }; }

module.exports = { R, M };
