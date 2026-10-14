// Every ACDSee feature in test/features.mjs is checked by at least one test,
// the IDs the tests name all exist, and the gap document lists every ID.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { FEATURE_IDS, FEATURES, ID_PATTERN } from '../features.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const self = fileURLToPath(import.meta.url);

function testFiles() {
  const out = [];
  for (const dir of ['test/unit', 'test/static', 'test/e2e']) {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      const full = path.join(root, dir, name);
      if (full === self) continue;
      if (/\.test\.js$/.test(name) || /\.suite\.mjs$/.test(name)) out.push(full);
    }
  }
  return out;
}

const idsIn = (text) => new Set(text.match(ID_PATTERN) ?? []);

test('feature catalog: IDs are unique', () => {
  assert.equal(FEATURE_IDS.size, FEATURES.length);
});

test('every ACDSee feature is checked by a test', () => {
  const covered = new Map();
  for (const file of testFiles()) {
    for (const id of idsIn(fs.readFileSync(file, 'utf8'))) {
      if (!covered.has(id)) covered.set(id, []);
      covered.get(id).push(path.relative(root, file));
    }
  }
  const missing = FEATURES.filter((f) => !covered.has(f.id)).map((f) => `${f.id} (${f.title})`);
  assert.deepEqual(missing, [], 'features without a test');
  const unknown = [...covered.keys()].filter((id) => !FEATURE_IDS.has(id));
  assert.deepEqual(unknown, [], 'IDs in tests that are not in test/features.mjs');
});

test('the gap document lists every feature ID', () => {
  const doc = idsIn(fs.readFileSync(path.join(root, 'docs', 'ACDSee-gap.md'), 'utf8'));
  assert.deepEqual(FEATURES.filter((f) => !doc.has(f.id)).map((f) => f.id), []);
  assert.deepEqual([...doc].filter((id) => !FEATURE_IDS.has(id)), []);
});
