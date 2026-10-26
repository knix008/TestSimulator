// Coverage report formats and configured report paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const cov = require('../core/coverage.js');
const { analyzePath } = require('../core/analyze.js');

const CLOVER = `<?xml version="1.0"?><coverage generated="1"><project timestamp="1">
<file name="a.php" path="/r/src/a.php"><line num="2" type="method" count="1"/><line num="3" type="stmt" count="4"/><line num="4" type="stmt" count="0"/><line num="5" type="cond" truecount="1" falsecount="0"/></file>
</project></coverage>`;
const OPENCOVER = `<CoverageSession><Modules><Module><Files><File uid="1" fullPath="/r/src/A.cs"/></Files>
<Classes><Class><Methods><Method><SequencePoints><SequencePoint vc="2" sl="10" el="11" fileid="1"/><SequencePoint vc="0" sl="12" el="12" fileid="1"/></SequencePoints></Method></Methods></Class></Classes></Module></Modules></CoverageSession>`;
const GO = 'mode: set\nexample.com/app/pkg/a.go:3.10,5.2 2 1\nexample.com/app/pkg/a.go:7.10,7.20 1 0\n';
const GENERIC = '<coverage version="1"><file path="src/b.js"><lineToCover lineNumber="1" covered="true"/><lineToCover lineNumber="2" covered="false"/></file></coverage>';

test('Clover: statements and conditions count, method lines do not', () => {
  const c = cov.parseAny(CLOVER, '/r');
  assert.equal(c.format, 'clover');
  assert.deepEqual(c.files['src/a.php'].lines, { 3: true, 4: false, 5: true });
  assert.equal(c.lineCoverage, 66.7);
});

test('OpenCover sequence points spread over their lines', () => {
  const c = cov.parseAny(OPENCOVER, '/r');
  assert.equal(c.format, 'opencover');
  assert.deepEqual(c.files['src/A.cs'].lines, { 10: true, 11: true, 12: false });
});

test('Go cover profile blocks and suffix matching of module paths', () => {
  const c = cov.parseAny(GO, '/r');
  assert.equal(c.format, 'go');
  assert.equal(c.linesToCover, 4);
  assert.ok(cov.coverageFor(c, 'pkg/a.go'));
});

test('generic coverage XML', () => {
  const c = cov.parseAny(GENERIC, '/r');
  assert.equal(c.format, 'generic');
  assert.equal(c.lineCoverage, 50);
});

test('configured reports are merged and override auto-detection', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-cov-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'b.js'), 'const a = 1;\nconst b = 2;\n');
  fs.writeFileSync(path.join(dir, 'lcov.info'), 'SF:src/b.js\nDA:1,0\nDA:2,0\nend_of_record\n');
  fs.mkdirSync(path.join(dir, 'reports'));
  fs.writeFileSync(path.join(dir, 'reports', 'unit.xml'), GENERIC);
  fs.writeFileSync(path.join(dir, 'reports', 'it.xml'), '<coverage version="1"><file path="src/b.js"><lineToCover lineNumber="2" covered="true"/></file></coverage>');
  assert.equal(analyzePath(dir, {}).measures.coverage, 0, 'auto-detected lcov');
  const merged = analyzePath(dir, { coverageReports: ['reports/unit.xml', 'reports/it.xml', 'missing.xml'] });
  assert.equal(merged.measures.coverage, 100);
  assert.match(merged.coverage.format, /generic\+generic/);
});
