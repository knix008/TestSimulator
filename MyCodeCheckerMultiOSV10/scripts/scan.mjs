#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const compat = require('../core/compat/index.js');
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
const { DEFAULT_GATE } = require('../core/qualitygate');
const { compliance, reports } = require('../core/platform');
const sca = require('../core/sca');

const USAGE = `Usage: node scripts/scan.mjs --path <folder> [options]
  --format json|sarif|html|csv|badge|cyclonedx|spdx|spdx-tv   output format (default json)
  --report executive|security|misra|integrity|defect-security|weakness|sbom
                                    write a report instead (--csv for the CSV variant)
  --standard <id>                   keep only rules of a standard: misra-c, misra-cpp, cert, cwe-top25, owasp
                                    (security reports: owasp2021, cweTop25, pciDss40, ...)
  --misra-plan <file.json>          MISRA Compliance:2020 plan (recategorization, deviations)
  --misra-gate                      exit 1 when the MISRA verdict is not compliant
  --include <dir>  --define NAME=V  C/C++ include folder and macro (repeatable)
  --target lp64|ilp32|llp64         C/C++ data model
  --osv <folder|all.zip>            offline OSV advisory database
  --coverage <file>                 coverage report (lcov, Cobertura, JaCoCo, Clover, OpenCover, Go, generic XML); repeatable
  --exclude <glob>                  skip matching files (repeatable; also mcc.exclusions)
  --workspace [config folder]       use the app's workspace: quality profiles, gate, exclusions and issue states
                                    (default folder: the app's data folder; the workspace is not changed)
  --out <file>  --lang ko|en        with --report, --out x.pdf / x.docx / x.xlsx writes that format
  --server <url> --token <user token> --project-key <key> [--branch <name>]
                                    upload to a MyCodeChecker server and wait for its quality gate
                                    (also read from mcc-project.properties: mcc.host.url, mcc.token,
                                    mcc.projectKey, mcc.projectName, mcc.sources, mcc.exclusions,
                                    mcc.branch.name)`;

const props = compat.normalizeProperties(readProperties(arg('properties', '') || compat.PROPERTY_FILES.find((f) => fs.existsSync(f)) || compat.PROPERTY_FILE));
const folder = arg('path') || (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '') || (Object.keys(props).length ? '.' : '');
if (!folder) {
  console.error(USAGE);
  process.exit(2);
}
const format = arg('format', 'json');
const lang = arg('lang', 'ko');
const standard = arg('standard', '');
const root = path.resolve(folder);

const server = arg('server', props['mcc.host.url'] || '');
if (server) {
  process.exit(await upload());
}

const defines = {};
for (const d of args('define')) {
  const [name, ...rest] = d.split('=');
  defines[name] = rest.length ? rest.join('=') : '1';
}
const scaOptions = {};
if (arg('osv')) scaOptions.advisoryDb = sca.importOsvDatabase(path.resolve(arg('osv')), { includeBundled: true }).db;

const catalog = listRules();
const inactive = standard ? catalog.filter((r) => !inStandard(r, standard)).map((r) => r.key) : [];
const exclusions = [...args('exclude'), ...String(props['mcc.exclusions'] || '').split(',').map((s) => s.trim()).filter(Boolean)];
const coverageReports = args('coverage').length ? args('coverage') : (props['mcc.coverageReportPaths'] || props['mcc.javascript.lcov.reportPaths'] || '').split(',').map((s) => s.trim()).filter(Boolean);
let analysis;
if (process.argv.includes('--workspace')) {
  // The desktop app's workspace: its quality profiles, gate, exclusions and
  // issue states (false positives, accepted issues). It runs on a temporary
  // copy, so the workspace itself is never changed.
  const os = require('os');
  const { createApi } = require('../core/api');
  const { createStore } = require('../core/store');
  const source = createStore(arg('workspace') ? path.resolve(arg('workspace')) : undefined);
  if (!fs.existsSync(source.file)) {
    console.error(`No workspace at ${source.file}`);
    process.exit(2);
  }
  const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-cli-'));
  source.copyTo(copyDir);
  const api = createApi({ configDir: copyDir });
  const res = await api.call('project.scan', { path: root, branch: arg('branch'), commit: false, exclusions, coverageReports: coverageReports.length ? coverageReports : undefined });
  analysis = res.analysis;
} else {
  analysis = analyzePath(root, {
    gate: DEFAULT_GATE,
    inactive,
    exclusions,
    coverageReports,
    sca: scaOptions,
    cfamily: { includeDirs: args('include').map((d) => path.resolve(root, d)), defines, target: arg('target') },
  });
}

let body;
const reportKind = arg('report', '');
const plan = arg('misra-plan') ? JSON.parse(fs.readFileSync(arg('misra-plan'), 'utf8')) : null;
const misraStandard = (plan && plan.standard) || (standard === 'misra-cpp' ? 'misraCpp2023' : 'misraC2012');
if (reportKind) {
  const opts = { catalog, lang, standard: standard || undefined, plan: plan || compliance.defaultMisraPlan(misraStandard) };
  if (reportKind === 'sbom') opts.sca = sca.scanDependencies(root, scaOptions);
  const built = reports.build(reportKind, analysis, opts);
  body = process.argv.includes('--csv') ? built.csv : built.html;
  // --out report.pdf / .docx / .xlsx writes a native file.
  const ext = path.extname(arg('out', '')).slice(1).toLowerCase();
  if (['pdf', 'docx', 'xlsx'].includes(ext)) {
    const ex = require('../core/export');
    body = ex.exportWithInfo(ex.fromHtml(built.html), ext, { lang, csv: built.csv, creator: 'MyCodeChecker' }).buffer;
  }
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

// mcc-project.properties (key=value, # comments, \ line continuation).
function readProperties(file) {
  const out = {};
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return out; }
  const lines = text.replace(/\\\r?\n\s*/g, '').split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('!')) continue;
    const m = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(t);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

// Upload the sources to a server, which analyzes them with its own profiles,
// gate and history (code-quality scanner flow). Exit 1 when the gate fails.
// Monorepo: mcc.modules=a,b uploads each module as its own project
// (a.mcc.projectKey, a.mcc.projectName, a.mcc.projectBaseDir, a.mcc.sources).
async function upload() {
  const modules = String(props['mcc.modules'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!modules.length) return uploadOne(root, props);
  let worst = 0;
  for (const m of modules) {
    const sub = { ...props };
    for (const [k, v] of Object.entries(props)) if (k.startsWith(`${m}.ref.`)) sub[k.slice(m.length + 1)] = v;
    sub['mcc.projectKey'] = props[`${m}.mcc.projectKey`] || `${props['mcc.projectKey'] || path.basename(root)}:${m}`;
    sub['mcc.projectName'] = props[`${m}.mcc.projectName`] || m;
    if (!props[`${m}.mcc.sources`]) sub['mcc.sources'] = '.';
    const code = await uploadOne(path.resolve(root, props[`${m}.mcc.projectBaseDir`] || m), sub);
    worst = Math.max(worst, code);
  }
  return worst;
}

// http(s).request without keep-alive: undici's fetch leaves sockets that make
// process.exit abort on Windows (libuv UV_HANDLE_CLOSING assertion).
function postJson(url, body, headers) {
  const u = new URL(url);
  const mod = require(u.protocol === 'https:' ? 'https' : 'http');
  const data = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method: 'POST', agent: false, headers: { 'content-type': 'application/json', 'content-length': data.length, connection: 'close', ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(600000, () => req.destroy(new Error('timeout')));
    req.end(data);
  });
}

async function uploadOne(base, conf) {
  const { walk } = require('../core/analyze');
  const key = conf === props ? arg('project-key', conf['mcc.projectKey'] || path.basename(base)) : conf['mcc.projectKey'];
  const token = arg('token', compat.tokenFromEnv() || conf['mcc.token'] || conf['mcc.login'] || '');
  const exclusions = [...args('exclude'), ...String(conf['mcc.exclusions'] || '').split(',').map((s) => s.trim()).filter(Boolean)];
  const sources = String(conf['mcc.sources'] || '.').split(',').map((s) => path.resolve(base, s.trim() || '.'));
  const files = [];
  // Exclusion patterns are relative to the project base directory, as in code quality.
  for (const full of walk(base, { exclusions })) {
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (!sources.some((dir) => full === dir || full.startsWith(dir + path.sep))) continue;
    files.push({ path: rel, text: fs.readFileSync(full, 'utf8') });
  }
  const body = { key, name: conf['mcc.projectName'] || key, branch: arg('branch', conf['mcc.branch.name'] || undefined), files };
  const url = `${server.replace(/\/+$/, '')}/api/project.submit`;
  console.error(`MyCodeChecker upload ${files.length} files of ${key} → ${server}`);
  let res;
  try {
    res = await postJson(url, body, token ? { 'x-mcc-user-token': token } : {});
  } catch (err) {
    console.error(`Cannot reach ${server}: ${err.message}`);
    return 2;
  }
  let json = null;
  try { json = JSON.parse(res.body); } catch { json = null; }
  if (!json || !json.ok) {
    console.error(`Upload failed (HTTP ${res.status}): ${json && json.error ? json.error.message : 'no response'}`);
    return 2;
  }
  const r = json.data;
  const m = r.measures || {};
  console.error(`MyCodeChecker ${r.qualityGate.status}  project=${r.projectKey} branch=${r.branch} bugs=${m.bugs} vulnerabilities=${m.vulnerabilities} smells=${m.code_smells} new_coverage=${m.new_coverage ?? '-'}`);
  for (const c of (r.qualityGate.conditions || []).filter((x) => x.status === 'ERROR')) console.error(`  failed: ${c.metric} ${c.op} ${c.threshold} (actual ${c.actual})`);
  return r.qualityGate.status === 'OK' ? 0 : 1;
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
