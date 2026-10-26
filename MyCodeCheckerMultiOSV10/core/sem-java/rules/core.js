'use strict';

// Rule registry for sem-java. A definition:
//   rule({
//     id, langs: ['java'] | ['kt'] | ['java','kt'], type: 'B'|'V'|'S'|'H', sev: 'BL'|'CR'|'MA'|'MI'|'IN',
//     debt, tags, ref: 'S2259', ktRef?, en: [name, why, fix], ko: [...], msg?: [en, ko] with {0} {1},
//     on?: { Kind(node, cx) {...}, 'Kind:exit'(node, cx) {...} },  // AST handlers
//     engine?: 'se' | 'flow',                                       // reported by se.js / flow.js
//     bad: { java?, kt? }, good: { java?, kt? },                   // test samples ('// Noncompliant' marks lines)
//   })
// Catalog keys: 'sem-java:<id>' for Java, 'sem-java:kt-<id>' for Kotlin.

const RULES = [];
const BY_ID = new Map();

const TYPES = { B: 'BUG', V: 'VULNERABILITY', S: 'CODE_SMELL', H: 'SECURITY_HOTSPOT' };
const SEVS = { BL: 'BLOCKER', CR: 'CRITICAL', MA: 'MAJOR', MI: 'MINOR', IN: 'INFO' };

function rule(def) {
  if (!def.id || BY_ID.has(def.id)) throw new Error(`sem-java: duplicate or missing rule id ${def.id}`);
  if (!def.langs) def.langs = ['java'];
  if (!TYPES[def.type] || !SEVS[def.sev]) throw new Error(`sem-java: bad type/severity for ${def.id}`);
  if (!def.en || def.en.length !== 3 || !def.ko || def.ko.length !== 3) throw new Error(`sem-java: texts for ${def.id}`);
  def.tags = def.tags || [];
  RULES.push(def);
  BY_ID.set(def.id, def);
  return def;
}

function keyFor(def, lang) {
  return lang === 'kt' ? `sem-java:kt-${def.id}` : `sem-java:${def.id}`;
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

function catalogEntries() {
  const out = [];
  for (const def of RULES) {
    for (const lang of def.langs) {
      const type = TYPES[def.type];
      const severity = SEVS[def.sev];
      const cweTags = def.tags.filter((t) => /^cwe-\d+$/.test(t));
      const cwe = cweTags.map((t) => 'CWE-' + t.slice(4));
      const tags = Array.from(new Set(def.tags.concat([lang === 'kt' ? 'kotlin' : 'java'])));
      const entry = {
        key: keyFor(def, lang),
        langs: [lang],
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
        checker: (lang === 'kt' ? (def.ktRef || def.ref) : def.ref) || '',
      };
      if (cwe.length || def.owasp) {
        entry.standards = {};
        if (cwe.length) entry.standards.cwe = cwe;
        if (def.owasp) entry.standards.owasp2021 = def.owasp;
      }
      out.push(entry);
    }
  }
  return out;
}

function categoryOf(def, type) {
  if (def.engine === 'se') return 'Symbolic execution';
  if (type === 'VULNERABILITY' || type === 'SECURITY_HOTSPOT') return 'Security';
  if (type === 'BUG') return 'Reliability';
  return 'Maintainability';
}

// ── sample wrappers (tests) ──
function jm(body) {
  return `class T {\n  void m(Object o, String s, java.util.List<String> list, int n) throws Exception {\n${body}\n  }\n}\n`;
}
function jc(members) {
  return `class T {\n${members}\n}\n`;
}
function km(body) {
  return `fun test(o: Any?, s: String, list: List<String>, n: Int) {\n${body}\n}\n`;
}
function kc(members) {
  return `class T {\n${members}\n}\n`;
}

module.exports = { RULES, BY_ID, rule, keyFor, message, catalogEntries, TYPES, SEVS, jm, jc, km, kc, fmt };
