// npm run test:features — is every feature of the checklist really implemented? Runs the tests each feature names in
// test/features.map.js (all JS unit tests, and the web E2E) and reports feature by feature:
//   PROVED    done, and every test it names passed
//   PARTIAL   every test it names passed, but the checklist lists parts of it as missing (shown under it)
//   FAILING   a test it names failed, or did not run
//
//   npm run test:features                  unit tests and the web E2E
//   npm run test:features -- --no-e2e      unit tests only; E2E results are taken from the last web run (test-results/web)
//   npm run test:features -- --strict      also fail while any feature is only partial
// The table is also written to test-results/features.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, coverage } from '../src/core/features.js';
import { splitRef, titleMatches } from '../test/feature-titles.mjs';
import { FEATURE_TESTS } from '../test/features.map.js';
import { c, heading, padEnd, padStart } from '../test/e2e/report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const withE2E = !args.includes('--no-e2e');

const run = (cmd, list, opts = {}) => new Promise((resolve) => {
  const child = spawn(cmd, list, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], ...opts });
  let out = '';
  child.stdout.on('data', (d) => { out += d; opts.echo?.(String(d)); });
  child.on('close', (code) => resolve({ code, out }));
});

// Unit tests, through the JSON-line reporter.
console.log(heading('Running the unit tests'));
const unitFiles = fs.readdirSync(path.join(root, 'test', 'unit')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('test', 'unit', f));
const unit = await run(process.execPath, ['--test', '--test-reporter=./test/feature-reporter.mjs', ...unitFiles]);
const ran = [];
for (const lineText of unit.out.split('\n')) { try { if (lineText.trim()) ran.push(JSON.parse(lineText)); } catch { /* other output */ } }
console.log(`  ${ran.filter((r) => r.ok).length} passed, ${ran.filter((r) => !r.ok && !r.skip).length} failed, ${ran.filter((r) => r.skip).length} skipped`);

// The web E2E writes its own results.
if (withE2E) {
  console.log(heading('Running the web E2E'));
  await run(process.execPath, ['test/e2e/web.mjs'], { echo: (s) => process.stdout.write(s) });
}
const webFile = path.join(root, 'test-results', 'web', 'results.json');
const web = fs.existsSync(webFile) ? JSON.parse(fs.readFileSync(webFile, 'utf8')) : [];
for (const r of web) ran.push({ file: 'web', name: r.name, ok: r.ok, skip: false });

// Each feature's verdict.
const rows = [];
for (const f of FEATURES) {
  const refs = FEATURE_TESTS[f.id] ?? [];
  const tests = refs.map((ref) => {
    const [where, title] = splitRef(ref);
    const hits = ran.filter((r) => r.file === where && titleMatches(title, r.name));
    return { ref, ran: hits.length, ok: hits.length > 0 && hits.every((h) => h.ok) };
  });
  const allPass = tests.length > 0 && tests.every((t) => t.ok);
  const verdict = !allPass ? 'FAILING' : f.status === 'done' ? 'PROVED' : 'PARTIAL';
  rows.push({ id: f.id, area: f.area, name: f.en, status: f.status, verdict, missing: f.missing ?? [], tests });
}

console.log(heading('Features'));
const tint = { PROVED: c.green, PARTIAL: c.yellow, FAILING: c.red };
let area = '';
for (const r of rows) {
  if (r.area !== area) { area = r.area; console.log(`\n  ${c.bold(c.blue(area))}`); }
  const passed = r.tests.filter((t) => t.ok).length;
  console.log(`  ${tint[r.verdict](padEnd(r.verdict, 8))} ${padEnd(r.id, 22)} ${c.dim(padStart(`${passed}/${r.tests.length}`, 5))}  ${r.name}`);
  if (r.verdict === 'PARTIAL') console.log(`  ${' '.repeat(32)}${c.dim(`missing: ${r.missing.join('; ')}`)}`);
  for (const t of r.tests.filter((x) => !x.ok)) console.log(`  ${' '.repeat(32)}${c.red(t.ran ? 'failed' : 'did not run')}  ${t.ref}`);
}
const count = (v) => rows.filter((r) => r.verdict === v).length;
const cov = coverage();
console.log(`\n  ${c.bold('Features')}  ${c.green(`${count('PROVED')} proved`)}  ${c.yellow(`${count('PARTIAL')} partial`)}  ${count('FAILING') ? c.red(`${count('FAILING')} failing`) : c.dim('0 failing')}  of ${rows.length}  (${cov.percent}% of the checklist)`);
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results', 'features.json'), JSON.stringify(rows, null, 2));
const bad = count('FAILING') > 0 || (strict && count('PARTIAL') > 0);
process.exit(bad ? 1 : 0);
