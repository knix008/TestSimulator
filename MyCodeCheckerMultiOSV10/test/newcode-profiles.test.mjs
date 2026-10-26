// Line-based new code and per-project quality profiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { analyzeSources } = require('../core/analyze.js');
const profiles = require('../core/profiles.js');
const { createApi } = require('../core/api.js');

const OLD = 'function add(a, b) {\n  return a + b;\n}\neval(input);\n';
const NEW = 'function add(a, b) {\n  return a + b;\n}\neval(input);\nfunction mul(a, b) {\n  return a * b;\n}\neval(other);\n';

test('new code is the lines that are not in the baseline', () => {
  const first = analyzeSources([{ path: 'a.js', text: OLD }]);
  const second = analyzeSources([{ path: 'a.js', text: NEW }], { previousKeys: first.keys, hasBaseline: true, previousLineHashes: first.lineHashes });
  const evals = second.issues.filter((i) => i.rule === 'js:eval');
  assert.deepEqual(evals.map((i) => [i.line, i.isNew]), [[4, false], [8, true]]);
  assert.equal(second.measures.new_lines, 4);
  assert.equal(second.measures.new_ncloc, 4);
  assert.equal(second.newCodeMode, 'hash');
});

test('moving unchanged code is not new code', () => {
  const first = analyzeSources([{ path: 'a.js', text: OLD }]);
  const moved = '\n\n' + OLD;
  const second = analyzeSources([{ path: 'a.js', text: moved }], { previousKeys: first.keys, hasBaseline: true, previousLineHashes: first.lineHashes });
  assert.equal(second.measures.new_lines, 0);
  assert.equal(second.measures.new_vulnerabilities, 0);
});

test('new coverage counts only covered new lines', () => {
  const first = analyzeSources([{ path: 'a.js', text: OLD }]);
  const coverage = { format: 'lcov', linesToCover: 4, coveredLines: 3, lineCoverage: 75, files: { 'a.js': { lines: { 2: true, 4: true, 6: false, 8: true }, covered: 3, toCover: 4 } } };
  const second = analyzeSources([{ path: 'a.js', text: NEW }], { previousKeys: first.keys, hasBaseline: true, previousLineHashes: first.lineHashes, coverage });
  assert.equal(second.measures.coverage, 75);
  assert.equal(second.measures.new_lines_to_cover, 2);
  assert.equal(second.measures.new_uncovered_lines, 1);
  assert.equal(second.measures.new_coverage, 50);
});

test('SCM changed lines decide new code when given', () => {
  const res = analyzeSources([{ path: 'a.js', text: NEW }], { previousKeys: [], hasBaseline: true, isNewLine: (file, line) => line === 4 });
  const evals = res.issues.filter((i) => i.rule === 'js:eval');
  assert.deepEqual(evals.map((i) => i.isNew), [true, false]);
  assert.equal(res.newCodeMode, 'scm');
});

// ── profiles ──

const RULES = [
  { key: 'js:a', langs: ['js'], severity: 'MAJOR' },
  { key: 'js:b', langs: ['js'], severity: 'MAJOR' },
  { key: 'both:c', langs: ['js', 'ts'], severity: 'MINOR' },
  { key: 'py:d', langs: ['py'], severity: 'MAJOR' },
];

function ws() {
  return {
    profiles: [
      { id: 'js-way', name: 'Way', language: 'js', isDefault: true, inactive: [], overrides: {} },
      { id: 'js-strict', name: 'Strict', language: 'js', isDefault: false, parentId: 'js-way', inactive: ['js:a', 'both:c'], overrides: { 'js:b': 'BLOCKER' } },
      { id: 'js-child', name: 'Child', language: 'js', isDefault: false, parentId: 'js-strict', inactive: [], activated: ['js:a'], overrides: {} },
      { id: 'ts-way', name: 'Way', language: 'ts', isDefault: true, inactive: [], overrides: {} },
      { id: 'py-lax', name: 'Lax', language: 'py', isDefault: true, inactive: ['py:d'], overrides: {} },
    ],
  };
}

test('a non-default profile only applies to projects that select it', () => {
  const w = ws();
  const plain = profiles.resolveForProject(w, { id: 'p1' }, RULES);
  assert.deepEqual(plain.inactive.sort(), ['py:d']);
  const strict = profiles.resolveForProject(w, { id: 'p2', profiles: { js: 'js-strict' } }, RULES);
  assert.deepEqual(strict.inactive.sort(), ['js:a', 'py:d']);
  assert.equal(strict.overrides['js:b'], 'BLOCKER');
  assert.equal(strict.used.js, 'js-strict');
});

test('a rule shared by two languages stays on while one profile keeps it', () => {
  const w = ws();
  w.profiles.find((p) => p.id === 'ts-way').inactive = ['both:c'];
  const r = profiles.resolveForProject(w, { id: 'p', profiles: { js: 'js-strict' } }, RULES);
  assert.ok(r.inactive.includes('both:c'));
  const r2 = profiles.resolveForProject(w, { id: 'p' }, RULES);
  assert.ok(!r2.inactive.includes('both:c'));
});

test('inheritance: child starts from the parent and can re-activate', () => {
  const w = ws();
  const eff = profiles.effective(w, w.profiles.find((p) => p.id === 'js-child'));
  assert.deepEqual([...eff.inactive], ['both:c']);
  assert.equal(eff.overrides['js:b'], 'BLOCKER');
  w.profiles.find((p) => p.id === 'js-way').parentId = 'js-child';
  assert.ok(profiles.chain(w, w.profiles.find((p) => p.id === 'js-child')).length <= 3, 'a cycle is cut');
});

test('compare, backup and restore', () => {
  const w = ws();
  const d = profiles.compare(w, 'js-way', 'js-strict', RULES);
  assert.deepEqual(d.onlyA.sort(), ['both:c', 'js:a']);
  assert.deepEqual(d.severity, [{ key: 'js:b', a: 'MAJOR', b: 'BLOCKER' }]);
  const data = profiles.backup(w, 'js-strict');
  assert.equal(data.parentName, 'Way');
  const w2 = { profiles: [ws().profiles[0]] };
  const restored = profiles.restore(w2, JSON.parse(JSON.stringify(data)));
  assert.equal(restored.parentId, 'js-way');
  assert.deepEqual(restored.inactive, ['js:a', 'both:c']);
  assert.throws(() => profiles.restore(w2, { name: 'x' }));
});

test('saving profiles writes a changelog', () => {
  const before = ws().profiles;
  const after = before.map((p) => (p.id === 'js-way' ? { ...p, inactive: ['js:b'], overrides: { 'js:a': 'INFO' } } : p));
  const stamped = profiles.stampChanges(before, after, 'admin');
  const log = stamped.find((p) => p.id === 'js-way').changelog;
  assert.deepEqual(log.map((c) => [c.action, c.rule, c.by]), [['deactivate', 'js:b', 'admin'], ['severity', 'js:a', 'admin']]);
  assert.equal(stamped.find((p) => p.id === 'py-lax').changelog, undefined);
});

test('the API scans with the project profile and keeps line hashes out of the analysis', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-prof-'));
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-src-'));
  fs.writeFileSync(path.join(src, 'a.js'), OLD);
  const api = createApi({ configDir: dir });
  const first = await api.call('project.scan', { path: src });
  assert.equal(first.analysis.lineHashes, undefined);
  const w = api.store.load();
  const js = w.profiles.find((p) => p.language === 'js' && p.isDefault);
  w.profiles.push({ ...js, id: 'js-noeval', name: 'No eval', isDefault: false, inactive: ['js:eval'], overrides: {} });
  w.projects[0].profiles = { js: 'js-noeval' };
  api.store.save(w);
  assert.ok(api.store.load().projects[0].branches.main.lineHashes['a.js']);
  fs.writeFileSync(path.join(src, 'a.js'), NEW);
  const second = await api.call('project.scan', { path: src });
  assert.equal(second.analysis.issues.filter((i) => i.rule === 'js:eval').length, 0);
  assert.equal(second.analysis.measures.new_lines, 4);
  const eff = await api.call('profile.effective', { projectId: w.projects[0].id });
  assert.equal(eff.used.js, 'js-noeval');
});
