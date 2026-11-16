// The start-page background: the curtain scene was replaced by rain on a window, and a saved
// 'curtains' choice opens as that scene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATIONS, normalizeSettings } from '../../src/domain/settings.js';
import { AnimatedBackground } from '../../src/ui/background.js';
import { hasIcon } from '../../src/icons.js';
import ko from '../../src/i18n/ko.js';
import en from '../../src/i18n/en.js';

test('a saved curtain background becomes rain on the window', () => {
  assert.ok(ANIMATIONS.includes('rain'));
  assert.equal(ANIMATIONS.includes('curtains'), false);
  assert.equal(normalizeSettings({ animation: 'curtains', language: 'ko' }).animation, 'rain');
  assert.equal(normalizeSettings({ animation: 'rain', language: 'en' }).animation, 'rain');
  assert.ok(ko['animation.rain']);
  assert.ok(en['animation.rain']);
  assert.equal(ko['animation.curtains'], undefined);
  assert.equal(en['animation.curtains'], undefined);
  assert.equal(hasIcon('animRain'), true);
  assert.equal(hasIcon('animCurtains'), false);
});

test('the rain background draws a window and falling streaks', () => {
  const calls = [];
  const gradient = () => ({ addColorStop() {} });
  const ctx = {
    createLinearGradient: () => gradient(),
    fillRect() { calls.push('fill'); },
    beginPath() { calls.push('path'); },
    moveTo() { calls.push('move'); },
    lineTo() { calls.push('line'); },
    stroke() { calls.push('stroke'); },
    strokeRect() { calls.push('frame'); },
    fillStyle: '', strokeStyle: '', lineCap: '', lineWidth: 1,
  };
  const colors = { bg: '#f4efe6', accent: '#8a6a3b', text: '#3a342c', dark: false };
  AnimatedBackground.prototype.rain.call({}, ctx, 640, 360, 1.5, colors);
  assert.ok(calls.includes('frame'), 'a window frame');
  assert.ok(calls.filter((c) => c === 'line').length >= 40, 'a streak for each drop');
  assert.equal(typeof AnimatedBackground.prototype.curtains, 'undefined');
});
