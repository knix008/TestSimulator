'use strict';

// Rule registry for sem-php. A definition:
//   rule({
//     id, type: 'B'|'V'|'S'|'H', sev: 'BL'|'CR'|'MA'|'MI'|'IN', debt, tags, ref: 'S1656',
//     checker?: 'COPY_PASTE_ERROR', category?, owasp?: ['A02'],
//     en: [name, why, fix], ko: [name, why, fix], msg?: [en, ko] with {0} {1},
//     on?: { Kind(node, cx) },          // AST handlers
//     file?(pf, cx),                    // once per file
//     project?(proj, cx),               // once per analysis (cx.reportIn(pf, ...))
//     engine?: 'flow',                  // produced by the flow engine in index.js
//     bad, good,                        // test samples ('// Noncompliant' marks lines)
//     badLines?, path?,                 // explicit expected lines / sample file path
//   })
// Catalog keys: 'sem-php:<id>'.

const RULES = [];
const BY_ID = new Map();

const TYPES = { B: 'BUG', V: 'VULNERABILITY', S: 'CODE_SMELL', H: 'SECURITY_HOTSPOT' };
const SEVS = { BL: 'BLOCKER', CR: 'CRITICAL', MA: 'MAJOR', MI: 'MINOR', IN: 'INFO' };

function rule(def) {
  if (!def.id || BY_ID.has(def.id)) throw new Error(`sem-php: duplicate or missing rule id ${def.id}`);
  if (!TYPES[def.type] || !SEVS[def.sev]) throw new Error(`sem-php: bad type/severity for ${def.id}`);
  if (!def.en || def.en.length !== 3 || !def.ko || def.ko.length !== 3) throw new Error(`sem-php: texts for ${def.id}`);
  def.tags = def.tags || [];
  def.key = `sem-php:${def.id}`;
  RULES.push(def);
  BY_ID.set(def.id, def);
  return def;
}

function fmt(tpl, args) {
  return String(tpl).replace(/\{(\d+)\}/g, (_, i) => (args && args[i] != null ? String(args[i]) : ''));
}

function message(def, args) {
  if (args && args.length === 1 && args[0] && typeof args[0] === 'object' && args[0].en) return { en: args[0].en, ko: args[0].ko };
  if (def.msg) return { en: fmt(def.msg[0], args), ko: fmt(def.msg[1], args) };
  return { en: def.en[0], ko: def.ko[0] };
}

function impactsOf(type, sev) {
  const q = type === 'BUG' ? 'RELIABILITY' : type === 'CODE_SMELL' ? 'MAINTAINABILITY' : 'SECURITY';
  const s = sev === 'BLOCKER' ? 'BLOCKER' : sev === 'CRITICAL' ? 'HIGH' : sev === 'MAJOR' ? 'MEDIUM' : sev === 'MINOR' ? 'LOW' : 'INFO';
  return [{ softwareQuality: q, severity: s }];
}

function categoryOf(def, type) {
  if (def.category) return def.category;
  if (def.engine === 'flow') return 'Data flow';
  if (type === 'VULNERABILITY' || type === 'SECURITY_HOTSPOT') return 'Security';
  if (type === 'BUG') return 'Reliability';
  return 'Maintainability';
}

function catalogEntries() {
  return RULES.map((def) => {
    const type = TYPES[def.type];
    const severity = SEVS[def.sev];
    const cwe = def.tags.filter((t) => /^cwe-\d+$/.test(t)).map((t) => 'CWE-' + t.slice(4));
    const owasp = (def.owasp || []).slice();
    const tags = Array.from(new Set(def.tags.concat(['php'], owasp.map((o) => 'owasp-' + o.toLowerCase()))));
    const entry = {
      key: def.key,
      langs: ['php'],
      type,
      severity,
      debtMin: def.debt || 5,
      tags,
      name: { en: def.en[0], ko: def.ko[0] },
      why: { en: def.en[1], ko: def.ko[1] },
      fix: { en: def.en[2], ko: def.ko[2] },
      cwe: cwe[0] || '',
      refKey: def.ref || '',
      impacts: impactsOf(type, severity),
      category: categoryOf(def, type),
      checker: def.checker || def.ref || def.id.toUpperCase().replace(/-/g, '_'),
      analysis: def.engine || 'syntax',
    };
    if (cwe.length || owasp.length) {
      entry.standards = {};
      if (cwe.length) entry.standards.cwe = cwe;
      if (owasp.length) entry.standards.owasp2021 = owasp;
    }
    return entry;
  });
}

// ── sample wrappers (tests)
const php = (code) => `<?php\n${code}\n`;
const fn = (body, params = '$a, $b, $c') => `<?php\nfunction sample(${params})\n{\n${body}\n}\n`;
const cls = (members, head = 'class Sample') => `<?php\n${head}\n{\n${members}\n}\n`;

module.exports = { RULES, BY_ID, rule, message, catalogEntries, TYPES, SEVS, fmt, php, fn, cls };
