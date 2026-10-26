'use strict';

// Rule registry for sem-rb. A definition:
//   rule({
//     id, type: 'B'|'V'|'S'|'H', sev: 'BL'|'CR'|'MA'|'MI'|'IN', debt, tags, sonar?,
//     en: [name, why, fix], ko: [name, why, fix], msg?: [en, ko] with {0} {1},
//     on?: { 'Type|Type2'(node, cx) {...} },   // AST handlers
//     file?(cx),                                // once per file
//     bad, good, samplePath?,                   // test samples ('# Noncompliant' marks lines)
//   })
// Catalog keys: 'sem-rb:<id>'.

const RULES = [];
const BY_ID = new Map();

const TYPES = { B: 'BUG', V: 'VULNERABILITY', S: 'CODE_SMELL', H: 'SECURITY_HOTSPOT' };
const SEVS = { BL: 'BLOCKER', CR: 'CRITICAL', MA: 'MAJOR', MI: 'MINOR', IN: 'INFO' };

function rule(def) {
  if (!def.id || BY_ID.has(def.id)) throw new Error(`sem-rb: duplicate or missing rule id ${def.id}`);
  if (!TYPES[def.type] || !SEVS[def.sev]) throw new Error(`sem-rb: bad type/severity for ${def.id}`);
  if (!def.en || def.en.length !== 3 || !def.ko || def.ko.length !== 3) throw new Error(`sem-rb: texts for ${def.id}`);
  def.tags = def.tags || [];
  def.key = `sem-rb:${def.id}`;
  RULES.push(def);
  BY_ID.set(def.id, def);
  return def;
}

function fmt(tpl, args) {
  return String(tpl).replace(/\{(\d+)\}/g, (_, i) => (args && args[i] != null ? String(args[i]) : ''));
}

function message(def, args) {
  if (def.msg) return { en: fmt(def.msg[0], args), ko: fmt(def.msg[1], args) };
  return { en: def.en[0], ko: def.ko[0] };
}

function impactsOf(type, sev) {
  const q = type === 'BUG' ? 'RELIABILITY' : type === 'CODE_SMELL' ? 'MAINTAINABILITY' : 'SECURITY';
  const s = sev === 'BLOCKER' ? 'BLOCKER' : sev === 'CRITICAL' ? 'HIGH' : sev === 'MAJOR' ? 'MEDIUM' : sev === 'MINOR' ? 'LOW' : 'INFO';
  return [{ softwareQuality: q, severity: s }];
}

function categoryOf(def, type) {
  if (def.tags.includes('rails')) return type === 'CODE_SMELL' ? 'Rails' : 'Rails security';
  if (type === 'VULNERABILITY' || type === 'SECURITY_HOTSPOT') return 'Security';
  if (type === 'BUG') return 'Reliability';
  return 'Maintainability';
}

function catalogEntries() {
  return RULES.map((def) => {
    const type = TYPES[def.type];
    const severity = SEVS[def.sev];
    const cwe = def.tags.filter((t) => /^cwe-\d+$/.test(t)).map((t) => 'CWE-' + t.slice(4));
    const owasp = def.tags.filter((t) => /^owasp-a\d\d$/.test(t)).map((t) => t.slice(6).toUpperCase());
    const tags = Array.from(new Set(['ruby', ...def.tags]));
    const entry = {
      key: def.key,
      langs: ['rb'],
      type,
      severity,
      debtMin: def.debt || 5,
      tags,
      name: { en: def.en[0], ko: def.ko[0] },
      why: { en: def.en[1], ko: def.ko[1] },
      fix: { en: def.en[2], ko: def.ko[2] },
      cwe: cwe[0] || '',
      impacts: impactsOf(type, severity),
      category: def.category || categoryOf(def, type),
      checker: def.sonar ? `ruby:${def.sonar}` : '',
    };
    if (def.sonar) entry.sonarKey = def.sonar;
    if (cwe.length || owasp.length) {
      entry.standards = {};
      if (cwe.length) entry.standards.cwe = cwe;
      if (owasp.length) entry.standards.owasp2021 = owasp;
    }
    return entry;
  });
}

module.exports = { RULES, BY_ID, rule, message, catalogEntries, TYPES, SEVS, fmt };
