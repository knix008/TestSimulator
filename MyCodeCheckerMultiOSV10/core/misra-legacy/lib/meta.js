'use strict';

// Rule factories for the legacy MISRA packs.
//
//   C04({ id: '17.4', cat: 'R'|'A', type, sev, debt, dec, cwe, c2012: '18.4' | 'dir-4.4',
//         name: [en, ko], why: [en, ko], fix: [en, ko],
//         reuse: 'misra-c:18.4' | ['misra-c:7.1', ...], check?, project?, manual? })
//   CPP08({ id: '5-0-3', cat: 'R'|'A'|'D', cpp2023: '7.0.5', c2012, ... })
//
// `reuse` runs the check of an existing MISRA C:2012 / C++:2023 rule under the
// legacy key (see ./reuse.js). `check` and `reuse` can be combined.

const { reused, langProject } = require('./reuse');

const CATS = { R: 'Required', A: 'Advisory', D: 'Document', M: 'Mandatory' };
const SEVERITY_BY_CAT = { Required: 'MAJOR', Advisory: 'MINOR', Document: 'INFO', Mandatory: 'CRITICAL' };

function txt(v) {
  if (!v) return { en: '', ko: '' };
  if (Array.isArray(v)) return { en: v[0], ko: v[1] };
  return v;
}

function label(id) {
  if (!id) return null;
  const s = String(id);
  return s.startsWith('dir-') ? `Dir ${s.slice(4)}` : `Rule ${s}`;
}

function build(std, spec) {
  const c04 = std === 'c2004';
  const key = `${c04 ? 'misra-c2004' : 'misra-cpp2008'}:${spec.id}`;
  const cwes = [].concat(spec.cwe || []);
  const tags = [c04 ? 'misra-c2004' : 'misra-cpp2008', 'misra'];
  for (const c of cwes) tags.push(c.toLowerCase());
  for (const t of spec.tags || []) if (!tags.includes(t)) tags.push(t);
  const standards = {};
  if (c04) standards.misraC2004 = `Rule ${spec.id}`;
  else standards.misraCpp2008 = `Rule ${spec.id}`;
  if (spec.c2012) standards.misraC2012 = label(spec.c2012);
  if (spec.cpp2023) standards.misraCpp2023 = label(spec.cpp2023);
  if (spec.autosar) standards.autosar = spec.autosar;
  if (cwes.length) standards.cwe = cwes;
  const cat = CATS[spec.cat] || spec.cat;
  const meta = {
    key,
    langs: [c04 ? 'c' : 'cpp'],
    type: spec.type || 'CODE_SMELL',
    severity: spec.sev || SEVERITY_BY_CAT[cat] || 'MAJOR',
    debtMin: spec.debt || 10,
    tags,
    name: txt(spec.name),
    why: txt(spec.why),
    fix: txt(spec.fix),
    category: c04 ? 'MISRA C:2004' : 'MISRA C++:2008',
    cwe: cwes[0] || '',
    cert: '',
    standards,
    misraCategory: cat,
    decidable: !!spec.dec,
  };
  const rule = { meta };
  if (spec.manual) {
    meta.manual = true;
    meta.manualReview = true;
    return rule;
  }
  if (spec.reuse) rule.reuse = [].concat(spec.reuse);
  if (spec.check || spec.project) rule.own = true;
  const parts = [];
  const projectParts = [];
  for (const k of [].concat(spec.reuse || [])) {
    const r = reused(k, key, meta.langs);
    if (r.check) parts.push(r.check);
    if (r.project) projectParts.push(r.project);
  }
  if (spec.check) parts.push(spec.check);
  if (spec.project) projectParts.push((project, api) => { const view = langProject(project, meta.langs); spec.project(view, { ...api, project: view }); });
  if (parts.length) rule.check = parts.length === 1 ? parts[0] : (unit, api) => { for (const p of parts) p(unit, api); };
  if (projectParts.length) rule.project = projectParts.length === 1 ? projectParts[0] : (project, api) => { for (const p of projectParts) p(project, api); };
  if (!rule.check && !rule.project) throw new Error(`${key}: no check`);
  return rule;
}

const C04 = (spec) => build('c2004', spec);
const CPP08 = (spec) => build('cpp2008', spec);
const M = (en, ko) => ({ en, ko });

module.exports = { C04, CPP08, M };
