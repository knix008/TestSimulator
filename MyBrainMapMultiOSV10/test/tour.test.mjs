// The guided tour (src/lib/tourSteps.js): every step is written in both
// languages, ids are unique, and every action a step runs (enter, leave and
// each move of the demo it plays) is a command the app actually handles in runAction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOUR_STEPS } from '../src/lib/tourSteps.js';

const app = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'App.jsx'), 'utf8');
const cases = new Set([...app.matchAll(/case '([^']+)':/g)].map((m) => m[1]));
const prefixes = [...app.matchAll(/id\.startsWith\('([^']+)'\)/g)].map((m) => m[1]).filter((p) => p !== 'tour:');
// a tour demo action ("tour:sel:0/3") is handled by name in the tour block of runAction
const handled = (id) => cases.has(id) || prefixes.some((p) => id.startsWith(p)) || (id.startsWith('tour:') && cases.has(id.split(':')[1]));

test('every tour step has a title and a text in Korean and English, and a unique id', () => {
  assert.ok(TOUR_STEPS.length >= 30, `steps: ${TOUR_STEPS.length}`);
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
  for (const s of TOUR_STEPS) {
    for (const k of ['enter', 'leave']) if (s[k] && !handled(s[k])) missing.push(`${s.id}.${k} = ${s[k]}`);
    for (const it of s.play || []) if (typeof it === 'string' && !handled(it)) missing.push(`${s.id}.play: ${it}`);
  }
  assert.deepEqual(missing, []);
});

test('most steps show their feature working, move by move, and say what each move does', () => {
  const playing = TOUR_STEPS.filter((s) => s.play && s.play.length);
  assert.ok(playing.length >= 20, `steps with a demo: ${playing.length}`);
  for (const s of playing) {
    const items = s.play;
    assert.ok(items.every((it) => typeof it === 'string' || (typeof it === 'number' && it > 0 && it <= 5000) || (it && (typeof it.spot === 'string' || (Array.isArray(it.say) && it.say.length === 2 && it.say.every((x) => x.trim()))))), `${s.id}: a bad demo item`);
    assert.ok(items.some((it) => it && it.say), `${s.id}: the demo never says what it does`);
    assert.ok(items.some((it) => typeof it === 'string'), `${s.id}: the demo does nothing`);
    // a demo that changes the map says so, so the map is put back when the step is left
    const changes = items.some((it) => typeof it === 'string' && /^(tour:(add|rename|nudge|icon|subLayout|summary|callout|floating)|layout:|style:|redraw:|shape:|priority:|progress:|bold|growFont|boundary|relationship|detachFloating|arrange|toggleFold|collapseAll|nextTheme)/.test(it));
    if (changes) assert.equal(s.edits, true, `${s.id}: changes the map but is not marked edits`);
  }
  const ms = playing.map((s) => s.play.reduce((t, it) => t + (typeof it === 'number' ? it : typeof it === 'string' ? 120 : 0), 0));
  assert.ok(ms.every((x) => x <= 20000), `no demo longer than 20 s: ${Math.max(...ms)}`);
});

test('the tutorial starts by itself only until it has been seen once', () => {
  assert.match(app, /if \(!s\.tutorialDone\)/);
  assert.match(app, /applySettings\(\{ tutorialDone: true \}\)/);
});
