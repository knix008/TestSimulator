// The feature checklist is proved by tests: every entry of src/core/features.js names the tests that exercise it
// (test/features.map.js), and every test named there exists. `npm run test:features` runs them all and reports per feature.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { FEATURES } from '../../src/core/features.js';
import { splitRef, titleMatches, writtenTitles } from '../feature-titles.mjs';
import { FEATURE_TESTS } from '../features.map.js';

describe('feature checklist proved by tests', () => {
  const titles = writtenTitles();
  test('every feature names at least one test, and only features of the checklist are named', () => {
    const ids = new Set(FEATURES.map((f) => f.id));
    for (const f of FEATURES) assert.ok(FEATURE_TESTS[f.id]?.length, `${f.id} names no test`);
    for (const id of Object.keys(FEATURE_TESTS)) assert.ok(ids.has(id), `${id} is not on the checklist`);
  });
  test('every test a feature names is written in that file', () => {
    const missing = [];
    for (const [id, refs] of Object.entries(FEATURE_TESTS)) {
      for (const ref of refs) {
        const [where, title] = splitRef(ref);
        const set = titles.get(where);
        if (!set?.has(title)) missing.push(`${id}: ${ref}`);
      }
    }
    assert.deepEqual(missing, []);
  });
  test('a done feature is proved by a test of its own code, not by the existence checks alone', () => {
    for (const f of FEATURES.filter((x) => x.status === 'done')) {
      const own = FEATURE_TESTS[f.id].filter((ref) => !/every (operator|modifier) (in the table|is reachable|, module function)/.test(ref));
      assert.ok(own.length, f.id);
    }
  });
  test('template titles match the names they make, and only those', () => {
    assert.ok(titleMatches('${name}: Korean and English have the same structure', 'UsersGuide: Korean and English have the same structure'));
    assert.ok(!titleMatches('${name}: Korean and English have the same structure', 'UsersGuide: something else'));
    assert.ok(titleMatches('plain', 'plain'));
    assert.ok(!titleMatches('plain', 'plainer'));
  });
});
