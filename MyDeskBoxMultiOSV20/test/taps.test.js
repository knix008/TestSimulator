'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaps, DOUBLE_MS } = require('../src/shared/taps');

// Use a fake clock and advance time manually.
function fake() {
  let now = 1000;
  const taps = createTaps(DOUBLE_MS, () => now);
  return { taps, wait: (ms) => { now += ms; } };
}

test('quickly tapping the same icon twice launches it', () => {
  const { taps, wait } = fake();
  assert.equal(taps.tap('a.lnk'), false, 'a single tap must not launch');
  wait(120);
  assert.equal(taps.tap('a.lnk'), true);
});

test('two slow taps do not launch', () => {
  const { taps, wait } = fake();
  taps.tap('a.lnk');
  wait(DOUBLE_MS + 1);
  assert.equal(taps.tap('a.lnk'), false);
});

test('tapping a different icon next does not launch', () => {
  const { taps, wait } = fake();
  taps.tap('a.lnk');
  wait(50);
  assert.equal(taps.tap('b.lnk'), false);
  wait(50);
  assert.equal(taps.tap('b.lnk'), true, 'two taps on b count as a double tap');
});

test('three taps launch only once', () => {
  const { taps, wait } = fake();
  assert.equal(taps.tap('a.lnk'), false);
  wait(80);
  assert.equal(taps.tap('a.lnk'), true);
  wait(80);
  assert.equal(taps.tap('a.lnk'), false, 'the third tap starts a new count');
  wait(80);
  assert.equal(taps.tap('a.lnk'), true);
});

test('no icon is pending before any tap', () => {
  const { taps } = fake();
  assert.equal(taps.pending(), null);
  taps.tap('a.lnk');
  assert.equal(taps.pending(), 'a.lnk');
  taps.forget();
  assert.equal(taps.pending(), null);
});

test('an empty target does not launch even when tapped twice', () => {
  const { taps, wait } = fake();
  assert.equal(taps.tap(null), false);
  wait(40);
  assert.equal(taps.tap(null), false);
});

test('a tap after dragging does not count as a double tap', () => {
  const { taps, wait } = fake();
  taps.tap('a.lnk');
  taps.forget();
  wait(50);
  assert.equal(taps.tap('a.lnk'), false);
  assert.equal(taps.pending(), 'a.lnk');
});
