#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// CI scanner — the local stand-in for a quality-gate step.
//   node scripts/scan.mjs --path samples/demo --format sarif --out report.sarif
// Exit code 1 when the quality gate fails.
'use strict';

const fs = require('fs');
const path = require('path');
const { analyzePath } = require('../core/analyze');
const { toJson, toSarif, toHtml, toCsv, badge } = require('../core/report');
const { SONAR_WAY } = require('../core/qualitygate');

const folder = arg('path') || process.argv[2];
if (!folder || folder.startsWith('--')) {
  console.error('Usage: node scripts/scan.mjs --path <folder> [--format json|sarif|html|csv|badge] [--out file] [--lang ko|en]');
  process.exit(2);
}
const format = arg('format', 'json');
const lang = arg('lang', 'ko');
const analysis = analyzePath(path.resolve(folder), { gate: SONAR_WAY });
let body = toJson(analysis);
if (format === 'sarif') body = toSarif(analysis);
else if (format === 'html') body = toHtml(analysis, lang);
else if (format === 'csv') body = toCsv(analysis, lang);
else if (format === 'badge') body = badge(analysis.qualityGate.status);
const out = arg('out', '');
if (out) fs.writeFileSync(out, body);
else process.stdout.write(body + (format === 'json' || format === 'sarif' ? '\n' : ''));
const gate = analysis.qualityGate.status;
const m = analysis.measures;
console.error(`MyCodeChecker ${gate}  bugs=${m.bugs} vulnerabilities=${m.vulnerabilities} smells=${m.code_smells} hotspots=${m.security_hotspots} files=${m.files} ncloc=${m.ncloc}`);
process.exit(gate === 'OK' ? 0 : 1);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return fallback;
}
