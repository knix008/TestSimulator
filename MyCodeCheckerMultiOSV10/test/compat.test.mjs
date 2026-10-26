// Compatible formats: the legacy spellings are still read. This file and
// test/fixtures/compat/ are the only tests that spell out those names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const compat = require('../core/compat/index.js');
const { analyzeSources, defectAnnotations } = require('../core/analyze.js');
const cli = require('../core/defect-cli.js');
const external = require('../core/platform/external.js');
const webhooks = require('../core/platform/webhooks.js');
const { suppressionEdit } = require('../core/lsp/fixes.js');

test('legacy suppression comments still suppress issues', () => {
  for (const marker of ['// NOSONAR', '// sparrow-ignore', '// NOMCC', '// mcc-ignore']) {
    const r = analyzeSources([{ path: 'a.js', text: `eval(input); ${marker}\n` }]);
    assert.equal(r.issues.filter((i) => i.line === 1).length, 0, marker);
  }
});

test('legacy checker annotations suppress like ours', () => {
  const legacy = defectAnnotations('// coverity[FORWARD_NULL]\n\nx = *p;\n');
  const ours = defectAnnotations('// mcc[FORWARD_NULL]\n\nx = *p;\n');
  assert.deepEqual([...legacy.entries()].map(([k, v]) => [k, [...v]]), [...ours.entries()].map(([k, v]) => [k, [...v]]));
  assert.ok(legacy.size > 0);
});

test('the quick fix writes our marker and sees a legacy one', () => {
  assert.equal(suppressionEdit({ rule: 'js:var', line: 1, file: 'a.js' }, ['var a = 1;'], 'a.js').text, ' // NOMCC');
  assert.equal(suppressionEdit({ rule: 'js:var', line: 1, file: 'a.js' }, ['var a = 1; // NOSONAR'], 'a.js'), null);
});

test('legacy model primitives are read as ours', () => {
  const src = 'void *pool_get(int n) { return __coverity_alloc__(n); }\nvoid run(char *c) { __coverity_os_cmd_sink__(c); }\n';
  const { models } = cli.makeLibrary(src);
  assert.deepEqual(models.map((m) => [m.name, m.kind]), [['pool_get', 'allocator'], ['run', 'sink']]);
  assert.deepEqual(cli.makeLibrary(compat.normalizeModelSource(src)).models, models);
});

test('legacy project properties map onto mcc.* keys, ours win', () => {
  assert.deepEqual(compat.PROPERTY_FILES, ['mcc-project.properties', 'sonar-project.properties']);
  const props = compat.normalizeProperties({
    'sonar.projectKey': 'old', 'mcc.projectKey': 'new', 'sonar.sources': 'src', 'web.sonar.sources': 'web/src', other: 'x',
  });
  assert.deepEqual(props, { 'mcc.projectKey': 'new', other: 'x', 'mcc.sources': 'src', 'web.mcc.sources': 'web/src' });
  assert.equal(compat.tokenFromEnv({ SONAR_TOKEN: 'legacy' }), 'legacy');
  assert.equal(compat.tokenFromEnv({ SONAR_TOKEN: 'legacy', MCC_TOKEN: 'ours' }), 'ours');
});

test('scan.mjs reads a legacy property file when ours is missing', () => {
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-compat-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'eval(x);\n');
    fs.writeFileSync(path.join(dir, 'sonar-project.properties'), 'sonar.projectKey=legacy\nsonar.sources=src\n');
    const out = path.join(dir, 'report.json');
    const res = spawnSync(process.execPath, [path.resolve('scripts/scan.mjs'), '--format', 'json', '--out', out], { cwd: dir, encoding: 'utf8' });
    assert.ok(fs.existsSync(out), res.stderr || res.stdout);
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.ok(JSON.stringify(report).includes('src/a.js') || JSON.stringify(report).includes('a.js'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy importer format ids are aliases of ours', () => {
  assert.equal(compat.normalizeFormat('sonar'), 'generic-issues');
  assert.equal(compat.normalizeFormat('coverity'), 'defect-json');
  assert.equal(compat.normalizeFormat('sonar-tests'), 'generic-tests');
  const doc = { issues: [{ engineId: 'e', ruleId: 'x', type: 'BUG', severity: 'MINOR', primaryLocation: { message: 'm', filePath: 'a.c' } }] };
  assert.equal(external.importExternal(doc, { format: 'sonar' }).format, 'generic-issues');
  const defects = JSON.stringify({ type: 'Coverity issues', formatVersion: 8, issues: [{ checkerName: 'NULL_RETURNS', mainEventLineNumber: 1, strippedMainEventFilePathname: 'a.c', events: [] }] });
  assert.equal(external.detectFormat(defects, 'x.json'), 'defect-json');
  const r = external.importExternal(defects, { format: 'coverity' });
  assert.equal(r.format, 'defect-json');
  assert.equal(r.findings[0].rule, 'external_defect:NULL_RETURNS');
  const tests = external.importTests('<testExecutions version="1"><file path="t.js"><testCase name="a" duration="1"/></file></testExecutions>', { format: 'sonar-tests' });
  assert.equal(tests.format, 'generic-tests');
});

test('renamed rule-key prefixes hash with their legacy spelling', () => {
  assert.equal(compat.hashRuleKey('defect:DEADCODE'), 'cov:DEADCODE');
  assert.equal(compat.hashRuleKey('external_defect:X'), 'external_coverity:X');
  assert.equal(compat.hashRuleKey('js:eval'), 'js:eval');
  assert.equal(compat.currentRuleKey('cov:UNINIT'), 'defect:UNINIT');
});

test('outgoing webhooks sign with our header only; legacy coverage names are probed', () => {
  assert.equal(webhooks.SIGNATURE_HEADER, 'X-MCC-Webhook-HMAC-SHA256');
  assert.ok(!/sonar/i.test(webhooks.SIGNATURE_HEADER));
  assert.ok(compat.COVERAGE_FILES.includes('sonar-coverage.xml'));
  assert.equal(compat.LEGACY_GATE_ID, 'sonar-way');
});
