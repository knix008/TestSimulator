'use strict';

// Rule registry for sem-go. A definition:
//   rule({
//     id, type: 'B'|'V'|'S'|'H', sev: 'BL'|'CR'|'MA'|'MI'|'IN', debt, tags,
//     ref: 'S1066' | '', checker: 'FORWARD_NULL' | '' (defect-analysis id, defaults to the reference key),
//     en: [name, why, fix], ko: [name, why, fix],
//     on?: { Kind(node, cx) },         // AST handlers, Kind = node kind
//     file?(pf, cx), project?(project, cx),
//     engine?: 'se' | 'flow',          // reported by se.js / flow.js through index.js
//     bad, good,                       // test samples ('// Noncompliant' marks lines)
//   })
// Catalog keys: 'sem-go:<id>'.

const RULES = [];
const BY_ID = new Map();

const TYPES = { B: 'BUG', V: 'VULNERABILITY', S: 'CODE_SMELL', H: 'SECURITY_HOTSPOT' };
const SEVS = { BL: 'BLOCKER', CR: 'CRITICAL', MA: 'MAJOR', MI: 'MINOR', IN: 'INFO' };

function rule(def) {
  if (!def.id || BY_ID.has(def.id)) throw new Error(`sem-go: duplicate or missing rule id ${def.id}`);
  if (!TYPES[def.type] || !SEVS[def.sev]) throw new Error(`sem-go: bad type/severity for ${def.id}`);
  if (!def.en || def.en.length !== 3 || !def.ko || def.ko.length !== 3) throw new Error(`sem-go: texts for ${def.id}`);
  def.tags = def.tags || [];
  def.key = `sem-go:${def.id}`;
  RULES.push(def);
  BY_ID.set(def.id, def);
  return def;
}

function impactsOf(type, sev) {
  const q = type === 'BUG' ? 'RELIABILITY' : type === 'CODE_SMELL' ? 'MAINTAINABILITY' : 'SECURITY';
  const s = sev === 'BLOCKER' ? 'BLOCKER' : sev === 'CRITICAL' ? 'HIGH' : sev === 'MAJOR' ? 'MEDIUM' : sev === 'MINOR' ? 'LOW' : 'INFO';
  return [{ softwareQuality: q, severity: s }];
}

function categoryOf(def, type) {
  if (def.category) return def.category;
  if (def.engine === 'se') return 'Path-sensitive analysis';
  if (type === 'VULNERABILITY' || type === 'SECURITY_HOTSPOT') return 'Security';
  if (type === 'BUG') return 'Reliability';
  return 'Maintainability';
}

function catalogEntries() {
  return RULES.map((def) => {
    const type = TYPES[def.type];
    const severity = SEVS[def.sev];
    const cwe = def.tags.filter((t) => /^cwe-\d+$/.test(t)).map((t) => `CWE-${t.slice(4)}`);
    const owasp = def.tags.filter((t) => /^owasp-a\d+$/.test(t)).map((t) => t.slice(6).toUpperCase());
    const entry = {
      key: def.key,
      langs: ['go'],
      type,
      severity,
      debtMin: def.debt || 5,
      tags: Array.from(new Set(def.tags.concat(['go']))),
      name: { en: def.en[0], ko: def.ko[0] },
      why: { en: def.en[1], ko: def.ko[1] },
      fix: { en: def.en[2], ko: def.ko[2] },
      cwe: cwe[0] || '',
      refKey: def.ref || '',
      impacts: impactsOf(type, severity),
      category: categoryOf(def, type),
      checker: def.checker || def.ref || '',
      engine: def.engine || 'syntax',
    };
    if (cwe.length || owasp.length) {
      entry.standards = {};
      if (cwe.length) entry.standards.cwe = cwe;
      if (owasp.length) entry.standards.owasp2021 = owasp;
    }
    return entry;
  });
}

// sample helper: a file in package main
function gf(body) {
  return `package main\n\n${body.replace(/^\n/, '')}`;
}

module.exports = { RULES, BY_ID, rule, catalogEntries, TYPES, SEVS, gf };
