import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeSources } from '../core/analyze.js';

const require = createRequire(import.meta.url);

// Many findings of the same few rules in each file.
function noisy(files = 3, lines = 200) {
  const out = [];
  for (let f = 0; f < files; f++) {
    const body = Array.from({ length: lines }, (_, i) => `  eval(input${i}); // TODO fix ${i}`).join('\n');
    out.push({ path: `src/f${f}.js`, text: `function run(input) {\n${body}\n}\n` });
  }
  return out;
}

const total = (a) => a.issues.reduce((n, i) => n + 1 + (i.folded || 0), 0);

test('every issue is kept while the result fits its budget', () => {
  const a = analyzeSources(noisy());
  assert.ok(a.issues.length > 500);
  assert.ok(!a.issues.some((i) => i.folded));
  assert.ok(!a.warnings.some((w) => w.engine === 'limits'));
});

test('beyond the budget repeated issues are counted, not kept, and the analysis still finishes', () => {
  const all = analyzeSources(noisy());
  const budget = 100;
  const a = analyzeSources(noisy(), { issueBudget: budget });
  assert.ok(a.issues.length <= budget * 1.25, `${a.issues.length} issues kept`);
  const folded = a.issues.filter((i) => i.folded);
  assert.ok(folded.length > 0, 'repeats are folded into the first issue of their rule and file');
  const warning = a.warnings.find((w) => w.engine === 'limits');
  assert.ok(warning, 'the result says that issues were folded');
  assert.equal(warning.folded + warning.dropped + a.issues.length >= total(all) - 5, true, 'kept + counted covers the findings');
  const msg = folded[0].message;
  assert.match(typeof msg === 'object' ? msg.en : msg, /\+\d+ more in this file/);
  if (typeof msg === 'object') assert.match(msg.ko, /건 더 있음/);
  const keys = a.issues.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(typeof a.issues.add, 'undefined', 'the result is a plain array');
});

test('project.issues pages the most severe issues first for a window that cannot hold them all', async () => {
  const { createApi } = require('../core/api.js');
  const api = createApi({ configDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-order-')) });
  const { project } = await api.call('project.scan', { path: path.resolve('samples/demo') });
  const page = (args) => api.call('project.issues', { projectId: project.id, branch: 'main', ...args });
  const plain = await page({ offset: 0, limit: 50000 });
  const first = await page({ offset: 0, limit: 7, order: 'severity' });
  const rest = await page({ offset: 7, limit: 50000, order: 'severity' });
  const sorted = [...first.issues, ...rest.issues];
  assert.equal(sorted.length, plain.total);
  assert.deepEqual(sorted.map((i) => i.key).sort(), plain.issues.map((i) => i.key).sort());
  const rank = { BLOCKER: 0, CRITICAL: 1, MAJOR: 2, MINOR: 3, INFO: 4 };
  for (let n = 1; n < sorted.length; n++) assert.ok((rank[sorted[n - 1].severity] ?? 5) <= (rank[sorted[n].severity] ?? 5));
});
