'use strict';

// Extra line rules toward SonarQube-style per-language coverage (bugs,
// vulnerabilities, code smells, security hotspots). Same shape as
// core/rules.js RULES, so the lead can concatenate the two arrays.
// C and C++ are covered elsewhere (MISRA / CERT).

const { EXAMPLES } = require('./util');

const FILES = [
  'js', 'py', 'java', 'kt', 'cs', 'go', 'rs', 'php', 'rb', 'sh', 'ps1', 'sql',
  'html', 'css', 'xml', 'yaml', 'docker', 'tf', 'json', 'secrets', 'common',
  'swift', 'objc', 'scala', 'dart', 'vbnet', 'vb6', 'cobol', 'plsql',
  'abap', 'apex',
];

const BY_FILE = {};
const RULES = [];
for (const name of FILES) {
  const rules = require(`./${name}`).RULES;
  BY_FILE[name] = rules;
  RULES.push(...rules);
}

function ruleMeta(rule) {
  const { re, skip, ...rest } = rule;
  return rest;
}

function catalog() {
  return RULES.map(ruleMeta);
}

// Sample lines per rule key: { bad: string[], good: string[], lang }.
function examples(key) {
  return EXAMPLES.get(key) || null;
}

module.exports = { RULES, BY_FILE, catalog, ruleMeta, examples, EXAMPLES };
