// The guided tour (src/lib/tourSteps.js): every step is written in both
// languages, ids are unique, and every action a step runs (enter, leave and
// the "직접 보기" demo) is a command the app actually handles in runAction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOUR_STEPS } from '../src/lib/tourSteps.js';

const app = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'App.jsx'), 'utf8');
const cases = new Set([...app.matchAll(/case '([^']+)':/g)].map((m) => m[1]));
const prefixes = [...app.matchAll(/id\.startsWith\('([^']+)'\)/g)].map((m) => m[1]);
const handled = (id) => cases.has(id) || prefixes.some((p) => id.startsWith(p));

test('every tour step has a title and a text in Korean and English, and a unique id', () => {
  assert.ok(TOUR_STEPS.length >= 15, `steps: ${TOUR_STEPS.length}`);
  const ids = new Set();
  for (const s of TOUR_STEPS) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`);
    ids.add(s.id);
    for (const k of ['title', 'text']) {
      assert.equal(s[k].length, 2, `${s.id}.${k}`);
      assert.ok(s[k][0].trim() && s[k][1].trim(), `${s.id}.${k} empty`);
    }
  }
  assert.equal(TOUR_STEPS[0].target, undefined, 'the first card is centred (a welcome)');
  assert.equal(TOUR_STEPS[TOUR_STEPS.length - 1].target, undefined, 'the last card is centred');
});

test('every action a tour step runs is a command of the app', () => {
  const missing = [];
  for (const s of TOUR_STEPS) for (const k of ['enter', 'leave', 'demo']) if (s[k] && !handled(s[k])) missing.push(`${s.id}.${k} = ${s[k]}`);
  assert.deepEqual(missing, []);
  assert.ok(TOUR_STEPS.filter((s) => s.demo).length >= 10, 'most steps can show their feature');
});

test('the tutorial starts by itself only until it has been seen once', () => {
  assert.match(app, /if \(!s\.tutorialDone\)/);
  assert.match(app, /applySettings\(\{ tutorialDone: true \}\)/);
});
