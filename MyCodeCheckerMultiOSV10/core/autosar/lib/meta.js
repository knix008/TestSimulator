'use strict';

// Rule factory for the AUTOSAR C++14 pack.
//
//   A({ id: 'A5-0-1', cat: 'Required', enf: 'automated', type, sev, debt,
//       misra: '8.2.5', cert: 'EXP50-CPP', cwe: 'CWE-480',
//       name: [en, ko], why: [en, ko], fix: [en, ko], check(unit, api) | project(project, api) })
//
// `enf` is the AUTOSAR enforcement class: 'automated', 'partially automated'
// or 'non-automated'. `decidable` is true only for 'automated' rules.

const SEVERITY_BY_CAT = { Required: 'MAJOR', Advisory: 'MINOR' };
const ENFORCEMENTS = new Set(['automated', 'partially automated', 'non-automated']);

function txt(pair) {
  if (!pair) return { en: '', ko: '' };
  if (Array.isArray(pair)) return { en: pair[0], ko: pair[1] };
  return { en: pair.en, ko: pair.ko };
}

function A(spec) {
  const id = spec.id;
  if (!/^[AM]\d+-\d+-\d+$/.test(id)) throw new Error(`bad AUTOSAR id ${id}`);
  const enf = spec.enf || 'automated';
  if (!ENFORCEMENTS.has(enf)) throw new Error(`bad enforcement for ${id}`);
  const cwes = spec.cwe ? [].concat(spec.cwe) : [];
  const standards = { autosar: id };
  if (spec.misra) standards.misraCpp2023 = String(spec.misra).startsWith('dir-') ? `Dir ${String(spec.misra).slice(4)}` : `Rule ${spec.misra}`;
  if (spec.cert) standards.certCpp = spec.cert;
  if (cwes.length) standards.cwe = cwes;
  const tags = ['autosar', 'autosar-cpp14', id.startsWith('M') ? 'misra-cpp2008' : null, ...cwes.map((c) => c.toLowerCase())].filter(Boolean);
  if (spec.tags) for (const t of spec.tags) if (!tags.includes(t)) tags.push(String(t).toLowerCase());
  const cat = spec.cat === 'Advisory' ? 'Advisory' : 'Required';
  const meta = {
    key: `autosar:${id}`,
    langs: ['cpp'],
    type: spec.type || 'CODE_SMELL',
    severity: spec.sev || SEVERITY_BY_CAT[cat],
    debtMin: spec.debt || 10,
    tags,
    name: txt(spec.name),
    why: txt(spec.why),
    fix: txt(spec.fix),
    cwe: cwes[0] || '',
    cert: spec.cert ? `CERT ${spec.cert}` : '',
    standards,
    misraCategory: cat,
    autosarCategory: cat,
    enforcement: enf,
    decidable: enf === 'automated',
  };
  const rule = { meta };
  if (spec.check) rule.check = spec.check;
  if (spec.project) rule.project = spec.project;
  if (!spec.check && !spec.project) throw new Error(`rule ${id} has no check`);
  return rule;
}

// Message helper: M('en text', 'ko text') -> { en, ko }
function M(en, ko) { return { en, ko }; }

module.exports = { A, M, ENFORCEMENTS };
