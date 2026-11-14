import test from 'node:test';
import assert from 'node:assert/strict';
import { nextAskSession, shouldShowWelcome } from '../src/lib/tutorialSettings.js';

test('the tutorial question opens only on the start screen, once per launch', () => {
  assert.equal(nextAskSession('pending', { onStart: true, enabled: true }), 'open');
  assert.equal(nextAskSession('pending', { onStart: false, enabled: true }), 'closed');
  assert.equal(nextAskSession('open', { onStart: false, enabled: true }), 'closed');
  assert.equal(nextAskSession('closed', { onStart: true, enabled: true }), 'closed');
  assert.equal(nextAskSession('open', { onStart: true, enabled: false }), 'closed');
  assert.equal(nextAskSession('pending', { onStart: true, enabled: false }), 'closed');
});

test('a missing switch still asks, and an explicit off does not', () => {
  assert.equal(shouldShowWelcome({}), true);
  assert.equal(shouldShowWelcome({ tutorial: { showAtStart: false } }), false);
  assert.equal(shouldShowWelcome({ tutorial: { showAtStart: true } }), true);
});
