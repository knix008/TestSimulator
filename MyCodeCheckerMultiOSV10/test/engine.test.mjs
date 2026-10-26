import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { analyzeSources } from '../core/analyze.js';
import { toSarif, toHtml, badge } from '../core/report.js';
import { evaluateGate, DEFAULT_GATE } from '../core/qualitygate.js';
import { maintainability } from '../core/ratings.js';

const require = createRequire(import.meta.url);

test('ratings follow the published debt-ratio bands', () => {
  assert.equal(maintainability(0, 100).letter, 'A');
  assert.equal(maintainability(6 * 30, 100).letter, 'B'); // 6%
  assert.equal(maintainability(11 * 30, 100).letter, 'C');
  assert.equal(maintainability(21 * 30, 100).letter, 'D');
  assert.equal(maintainability(51 * 30, 100).letter, 'E');
});

test('finds vulnerabilities from several analyzers and fails the gate', () => {
  const dup = Array.from({ length: 10 }, (_, i) => `  value += ${i};`).join('\n');
  const result = analyzeSources([
    { path: 'src/app.js', text: 'const password = "hunter2secret";\neval(input);\nif (a == b) { console.log(a); }\n' },
    { path: 'src/app.py', text: 'import pickle\npickle.loads(data)\nsubprocess.run(cmd, shell=True)\n' },
    { path: 'src/App.java', text: 'class App {\n  void query(String id) {\n    stmt.executeQuery("select * from t " + id);\n  }\n}\n' },
    { path: 'src/main.go', text: 'package main\nfunc q(id string) {\n  db.Query("select * from t " + id)\n}\n' },
    { path: 'src/lib.rs', text: 'fn run(v: Option<i32>) {\n  let _x = v.unwrap();\n}\n' },
    { path: 'src/a.c', text: 'void copy(char *d, char *s) { strcpy(d, s); }\n' },
    { path: 'web/index.html', text: '<img src="a.png"><a href="https://example.com" target="_blank">x</a>\n' },
    { path: 'Dockerfile', text: 'FROM ubuntu:latest\nENV API_SECRET=shh\n' },
    { path: 'k8s/deploy.yaml', text: 'spec:\n  privileged: true\n' },
    { path: 'main.tf', text: 'cidr = "0.0.0.0/0"\n' },
    { path: 'dup/a.js', text: `function fill() {\n${dup}\n  return value;\n}\n` },
    { path: 'dup/b.js', text: `function fillAgain() {\n${dup}\n  return value;\n}\n` },
  ]);
  const rules = new Set(result.issues.map((i) => i.rule));
  for (const key of [
    'secrets:hardcoded-password', 'js:eval', 'js:eqeq', 'py:pickle', 'py:shell-true',
    'java:sql-concat', 'go:sql-concat', 'rs:unwrap', 'c:strcpy', 'html:img-alt',
    'docker:latest', 'docker:secret-env', 'yaml:privileged', 'tf:open-cidr',
  ]) {
    assert.ok(rules.has(key), `missing ${key}`);
  }
  assert.ok(result.duplications.length >= 1, 'expected a duplicated block');
  assert.equal(result.qualityGate.status, 'ERROR');
  assert.ok(result.measures.bugs + result.measures.vulnerabilities > 0);
  const sarif = JSON.parse(toSarif(result));
  assert.equal(sarif.version, '2.1.0');
  assert.ok(sarif.runs[0].results.length > 0);
  assert.match(toHtml(result, 'ko'), /품질 게이트/);
  assert.match(badge('ERROR'), /failed/);
});

test('NOMCC suppresses the line and a clean file passes the gate', () => {
  const noisy = analyzeSources([{ path: 'a.js', text: 'eval(input); // NOMCC\n' }]);
  assert.equal(noisy.issues.filter((i) => i.rule === 'js:eval').length, 0);
  const clean = analyzeSources([{ path: 'ok.js', text: 'function add(left, right) {\n  return left + right;\n}\n' }]);
  assert.equal(clean.qualityGate.status, 'OK');
  assert.equal(clean.measures.bugs, 0);
  assert.equal(clean.measures.vulnerabilities, 0);
});

test('a second scan treats known issues as not new', () => {
  const first = analyzeSources([{ path: 'a.js', text: 'eval(input);\n' }]);
  const second = analyzeSources([{ path: 'a.js', text: 'eval(input);\n' }], { previousKeys: first.keys, hasBaseline: true });
  assert.equal(second.issues[0].isNew, false);
  assert.equal(second.measures.new_vulnerabilities, 0);
});

test('exclusions drop generated files', () => {
  const result = analyzeSources([
    { path: 'src/app.js', text: 'eval(input);\n' },
    { path: 'vendor/lib.min.js', text: 'eval(input);\n' },
  ], { root: 'C:/work/app', exclusions: ['**/*.min.js', '**/vendor/**'] });
  assert.ok(result.issues.some((i) => i.file.endsWith('src/app.js')));
  assert.equal(result.issues.some((i) => i.file.includes('vendor')), false);
});

test('coverage from lcov is a measure and a gate can read it', () => {
  const { parseLcov } = require('../core/coverage.js');
  const coverage = parseLcov('SF:src/ok.js\nDA:1,1\nDA:2,0\nend_of_record\n', '');
  const result = analyzeSources([{ path: 'src/ok.js', text: 'function add(left, right) {\n  return left + right;\n}\n' }], { coverage });
  assert.equal(result.measures.coverage, 50);
  const gate = evaluateGate(DEFAULT_GATE, { ...result.measures, new_coverage: 50 });
  assert.equal(gate.conditions.find((c) => c.metric === 'new_coverage').status, 'ERROR');
});
