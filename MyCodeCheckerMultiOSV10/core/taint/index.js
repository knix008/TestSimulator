'use strict';

// Security taint-analysis engine (contract: core/ENGINE_CONTRACT.md).
// Tracks untrusted data from sources (HTTP input, CLI, env, files) through
// assignments, calls and returns, across functions and files, into sinks
// (SQL, shell, eval, file system, HTML, URLs, LDAP, XPath, XML, deserializers,
// logs, headers, regexes, templates, reflection, object keys).

const { catalog: ruleCatalog, LANGS } = require('./rules');
const { defaultModels } = require('./models');
const { normalizeUserModels, MODEL_LANGS } = require('./resolve');
const { run } = require('./engine');

const SUPPORTED = new Set(LANGS);
const id = 'taint';

function langsByVuln() {
  const out = {};
  for (const m of defaultModels()) {
    if (m.kind !== 'sink') continue;
    const langs = m.lang === 'js' ? ['js', 'ts'] : m.lang === 'java' ? ['java', 'kt'] : [m.lang];
    if (!out[m.vuln]) out[m.vuln] = [];
    for (const l of langs) if (!out[m.vuln].includes(l)) out[m.vuln].push(l);
  }
  for (const v of Object.keys(out)) out[v].sort((a, b) => LANGS.indexOf(a) - LANGS.indexOf(b));
  return out;
}

let cachedCatalog = null;
function catalog() {
  if (!cachedCatalog) cachedCatalog = ruleCatalog(langsByVuln());
  return cachedCatalog.map((r) => Object.assign({}, r, { langs: r.langs.slice(), tags: r.tags.slice(), standards: Object.assign({}, r.standards) }));
}

function analyze(files, ctx) {
  const context = ctx || {};
  const options = context.options || {};
  const inactive = context.inactive instanceof Set ? context.inactive : new Set(context.inactive || []);
  const keys = catalog().map((r) => r.key);
  if (keys.every((k) => inactive.has(k))) return [];
  const input = [];
  for (const f of files || []) {
    if (!f || !SUPPORTED.has(f.lang) || !MODEL_LANGS[f.lang]) continue;
    const text = String(f.text == null ? '' : f.text);
    if (text.length > (options.taintMaxBytes || 1500000)) continue;
    input.push({ path: String(f.path).replace(/\\/g, '/'), text, lang: f.lang });
  }
  if (!input.length) return [];
  const models = options.taintDefaults === false ? [] : defaultModels();
  models.push(...normalizeUserModels(options.taintModels));
  let findings = [];
  try {
    findings = run(input, { models, lowTrust: !!options.taintLowTrust, inactive });
  } catch {
    findings = [];
  }
  findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.rule < b.rule ? -1 : 1)));
  return findings;
}

module.exports = { id, catalog, analyze, defaultModels };
