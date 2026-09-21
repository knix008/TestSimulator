// Availability rules that the per-checker cases in lint-cases.test.mjs assume.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { formatLintReport } from './lint-report.mjs';

const require = createRequire(import.meta.url);
const { lintTools } = require('../core/lint');

test('pyflakes is listed as installable, not as a synonym for python', () => {
  const py = lintTools().Python.find((t) => t.id === 'pyflakes');
  assert.ok(py);
  assert.equal(py.installable, true);
});

test('built-in checkers are always available', () => {
  const tools = lintTools();
  assert.equal(tools.JSON.find((t) => t.id === 'json').available, true);
  assert.equal(tools.YAML.find((t) => t.id === 'yaml').available, true);
  assert.equal(tools.YAML.find((t) => t.id === 'kube').available, true);
});

test('lint report table groups by language and totals', () => {
  const text = formatLintReport([
    { language: 'Python', tool: 'ruff', status: 'ok', detail: 'F821' },
    { language: 'Python', tool: 'pyflakes', status: 'ok', detail: 'undefined' },
    { language: 'PHP', tool: 'php', status: 'skip', detail: '설치되어 있지 않음' },
  ], { color: false });
  assert.match(text, /검사기 테스트 결과/);
  assert.match(text, /통과 2/);
  assert.match(text, /실패 0/);
  assert.match(text, /건너뜀 1/);
  assert.match(text, /전체 3/);
  assert.match(text, /건너뛴 이유/);
  assert.match(text, /PHP/);
  assert.match(text, /php/);
});
