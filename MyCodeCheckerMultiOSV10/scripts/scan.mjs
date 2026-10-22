#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// CI scanner — the local stand-in for a quality-gate step.
//   node scripts/scan.mjs --path samples/demo --format sarif --out report.sarif
//   node scripts/scan.mjs --path src --standard misra-c --misra-gate --report misra --out misra.html
//   node scripts/scan.mjs --path . --format cyclonedx --out bom.json
// Exit code 1 when the quality gate fails (or, with --misra-gate, when the
// project is not MISRA compliant).
'use strict';

const fs = require('fs');
const path = require('path');
const { analyzePath, listRules } = require('../core/analyze');
const { toJson, toSarif, toHtml, toCsv, badge } = require('../core/report');
const { SONAR_WAY } = require('../core/qualitygate');
const { compliance, reports } = require('../core/platform');
const sca = require('../core/sca');

const USAGE = `Usage: node scripts/scan.mjs --path <folder> [options]
  --format json|sarif|html|csv|badge|cyclonedx|spdx|spdx-tv   output format (default json)
  --report executive|security|misra|integrity|coverity-security|sparrow|sbom
                                    write a report instead (--csv for the CSV variant)
  --standard <id>                   keep only rules of a standard: misra-c, misra-cpp, cert, cwe-top25, owasp
                                    (security reports: owasp2021, cweTop25, pciDss40, ...)
  --misra-plan <file.json>          MISRA Compliance:2020 plan (recategorization, deviations)
  --misra-gate                      exit 1 when the MISRA verdict is not compliant
  --include <dir>  --define NAME=V  C/C++ include folder and macro (repeatable)
  --target lp64|ilp32|llp64         C/C++ data model
  --osv <folder|all.zip>            offline OSV advisory database
  --out <file>  --lang ko|en`;

const folder = arg('path') || (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '');
if (!folder) {
  console.error(USAGE);
  process.exit(2);
}
const format = arg('format', 'json');
const lang = arg('lang', 'ko');
const standard = arg('standard', '');
const root = path.resolve(folder);

const defines = {};
for (const d of args('define')) {
  const [name, ...rest] = d.split('=');
  defines[name] = rest.length ? rest.join('=') : '1';
}
const scaOptions = {};
if (arg('osv')) scaOptions.advisoryDb = sca.importOsvDatabase(path.resolve(arg('osv')), { includeBundled: true }).db;

const catalog = listRules();
const inactive = standard ? catalog.filter((r) => !inStandard(r, standard)).map((r) => r.key) : [];
const analysis = analyzePath(root, {
  gate: SONAR_WAY,
  inactive,
  sca: scaOptions,
  cfamily: { includeDirs: args('include').map((d) => path.resolve(root, d)), defines, target: arg('target') },
});

let body;
const reportKind = arg('report', '');
const plan = arg('misra-plan') ? JSON.parse(fs.readFileSync(arg('misra-plan'), 'utf8')) : null;
const misraStandard = (plan && plan.standard) || (standard === 'misra-cpp' ? 'misraCpp2023' : 'misraC2012');
if (reportKind) {
  const opts = { catalog, lang, standard: standard || undefined, plan: plan || compliance.defaultMisraPlan(misraStandard) };
  if (reportKind === 'sbom') opts.sca = sca.scanDependencies(root, scaOptions);
  const built = reports.build(reportKind, analysis, opts);
  body = process.argv.includes('--csv') ? built.csv : built.html;
} else if (['cyclonedx', 'spdx', 'spdx-tv'].includes(format)) {
  const deps = sca.scanDependencies(root, scaOptions);
  const meta = { name: path.basename(root) };
  if (format === 'spdx') body = JSON.stringify(sca.toSpdx(deps, meta), null, 2);
  else if (format === 'spdx-tv') body = sca.toSpdxTagValue(deps, meta);
  else body = JSON.stringify(sca.toCycloneDx(deps, meta), null, 2);
} else if (format === 'sarif') body = toSarif(analysis);
else if (format === 'html') body = toHtml(analysis, lang);
else if (format === 'csv') body = toCsv(analysis, lang);
else if (format === 'badge') body = badge(analysis.qualityGate.status);
else body = toJson(analysis);

const out = arg('out', '');
if (out) fs.writeFileSync(out, body);
else process.stdout.write(body + (body.endsWith('\n') ? '' : '\n'));

const gate = analysis.qualityGate.status;
const m = analysis.measures;
console.error(`MyCodeChecker ${gate}  bugs=${m.bugs} vulnerabilities=${m.vulnerabilities} smells=${m.code_smells} hotspots=${m.security_hotspots} files=${m.files} ncloc=${m.ncloc}`);
let failed = gate !== 'OK';
if (process.argv.includes('--misra-gate')) {
  const verdict = compliance.misraCompliance(analysis.issues, catalog, plan || compliance.defaultMisraPlan(misraStandard));
  const ok = verdict && (verdict.compliant === true || verdict.verdict === 'Compliant');
  console.error(`MISRA ${misraStandard} ${ok ? 'COMPLIANT' : 'NOT COMPLIANT'}`);
  failed = failed || !ok;
}
for (const w of analysis.warnings || []) console.error(`warning: ${w.engine || w.rule || ''} ${w.message}`);
process.exit(failed ? 1 : 0);

function inStandard(rule, id) {
  const s = rule.standards || {};
  const key = String(rule.key || '');
  if (id === 'misra-c') return key.startsWith('misra-c:');
  if (id === 'misra-cpp') return key.startsWith('misra-cpp:');
  if (id === 'misra') return key.startsWith('misra-');
  if (id === 'cert') return key.startsWith('cert:') || !!(s.certC || s.certCpp || rule.cert);
  if (id === 'cwe-top25') return !!s.cweTop25;
  if (id === 'owasp') return !!(s.owasp2021 && s.owasp2021.length);
  return true; // a security-report id: keep every rule, the report filters
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return fallback;
}

function args(name) {
  const out = [];
  process.argv.forEach((v, i) => {
    if (v === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}
