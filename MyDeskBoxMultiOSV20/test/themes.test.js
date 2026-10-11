'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const themes = require('../src/main/themes');

test('corner radius is clamped to pixels within the allowed range', () => {
  assert.equal(themes.cornerRadius(9.6), 10);
  assert.equal(themes.cornerRadius(-4), 0);
  assert.equal(themes.cornerRadius(80), themes.MAX_CORNER);
  assert.equal(themes.cornerRadius('soft'), 9);
  assert.equal(themes.cornerRadius('없는이름'), themes.DEFAULT_CORNER);
  assert.equal(themes.cornerRadius(undefined), themes.DEFAULT_CORNER);
});

test('picks the corner name closest to a pixel value', () => {
  assert.equal(themes.cornerName(0), 'square');
  assert.equal(themes.cornerName(8), 'soft');
  assert.equal(themes.cornerName(20), 'round');
});

test('a single legacy color migrates to the closest theme', () => {
  assert.equal(themes.themeForColor('#2563eb'), 'ocean');
  assert.equal(themes.themeForColor('#2563EC'), 'ocean');
  assert.equal(themes.themeForColor(''), themes.DEFAULT_THEME);
  assert.equal(themes.themeForColor('not-a-color'), themes.DEFAULT_THEME);
  const near = themes.themeForColor('#102030');
  assert.equal(themes.themeOf(near).id, near);
});

test('an unknown theme name falls back to the default theme', () => {
  assert.equal(themes.themeOf('없는테마').id, themes.DEFAULT_THEME);
  assert.equal(themes.themeOf('night').id, 'night');
});

test('uses dark text on light backgrounds and white text on dark backgrounds', () => {
  assert.equal(themes.autoText('#ffffff'), '#0f172a');
  assert.equal(themes.autoText('#020617'), '#ffffff');
  assert.equal(themes.brightness('#000000'), 0);
});

test('custom colors take precedence over the theme', () => {
  const picked = themes.resolve({ theme: 'custom', custom: { bg: '#112233', bar: '#001122' } });
  assert.equal(picked.bg, '#112233');
  assert.equal(picked.bar, '#001122');
  assert.equal(picked.text, '#ffffff');
  const fallback = themes.resolve({ theme: 'gold' });
  assert.equal(fallback.id, 'gold');
});

test('an empty title bar color is derived by darkening the background', () => {
  const picked = themes.customTheme({ bg: '#ffffff' });
  assert.equal(picked.bar, themes.darken('#ffffff', 0.55));
  assert.notEqual(picked.bar, '#ffffff');
  assert.equal(themes.parseHex('#abc'), null);
  assert.deepEqual(themes.parseHex('#aabbcc'), [170, 187, 204]);
});

test('theme labels follow the selected language', () => {
  const ocean = themes.themeOf('ocean');
  assert.equal(themes.themeLabel(ocean, 'ko'), '바다');
  assert.equal(themes.themeLabel(ocean, 'en'), 'Ocean');
  assert.equal(themes.themeLabel(ocean, 'fr'), '바다');
});
