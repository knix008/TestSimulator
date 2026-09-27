'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const themes = require('../src/main/themes');

test('모서리는 정해 둔 범위 안의 픽셀로 맞춘다', () => {
  assert.equal(themes.cornerRadius(9.6), 10);
  assert.equal(themes.cornerRadius(-4), 0);
  assert.equal(themes.cornerRadius(80), themes.MAX_CORNER);
  assert.equal(themes.cornerRadius('soft'), 9);
  assert.equal(themes.cornerRadius('없는이름'), themes.DEFAULT_CORNER);
  assert.equal(themes.cornerRadius(undefined), themes.DEFAULT_CORNER);
});

test('픽셀에 가장 가까운 모서리 이름을 고른다', () => {
  assert.equal(themes.cornerName(0), 'square');
  assert.equal(themes.cornerName(8), 'soft');
  assert.equal(themes.cornerName(20), 'round');
});

test('예전 색 하나만 있으면 가장 가까운 테마로 옮긴다', () => {
  assert.equal(themes.themeForColor('#2563eb'), 'ocean');
  assert.equal(themes.themeForColor('#2563EC'), 'ocean');
  assert.equal(themes.themeForColor(''), themes.DEFAULT_THEME);
  assert.equal(themes.themeForColor('not-a-color'), themes.DEFAULT_THEME);
  const near = themes.themeForColor('#102030');
  assert.equal(themes.themeOf(near).id, near);
});

test('없는 테마 이름은 기본 테마가 된다', () => {
  assert.equal(themes.themeOf('없는테마').id, themes.DEFAULT_THEME);
  assert.equal(themes.themeOf('night').id, 'night');
});

test('밝은 바탕에는 어두운 글씨, 어두운 바탕에는 흰 글씨를 쓴다', () => {
  assert.equal(themes.autoText('#ffffff'), '#0f172a');
  assert.equal(themes.autoText('#020617'), '#ffffff');
  assert.equal(themes.brightness('#000000'), 0);
});

test('직접 고른 색이 있으면 그 색이 테마보다 앞선다', () => {
  const picked = themes.resolve({ theme: 'custom', custom: { bg: '#112233', bar: '#001122' } });
  assert.equal(picked.bg, '#112233');
  assert.equal(picked.bar, '#001122');
  assert.equal(picked.text, '#ffffff');
  const fallback = themes.resolve({ theme: 'gold' });
  assert.equal(fallback.id, 'gold');
});

test('제목 줄 색을 비우면 바탕을 어둡게 만든다', () => {
  const picked = themes.customTheme({ bg: '#ffffff' });
  assert.equal(picked.bar, themes.darken('#ffffff', 0.55));
  assert.notEqual(picked.bar, '#ffffff');
  assert.equal(themes.parseHex('#abc'), null);
  assert.deepEqual(themes.parseHex('#aabbcc'), [170, 187, 204]);
});

test('테마 이름은 고른 언어를 따른다', () => {
  const ocean = themes.themeOf('ocean');
  assert.equal(themes.themeLabel(ocean, 'ko'), '바다');
  assert.equal(themes.themeLabel(ocean, 'en'), 'Ocean');
  assert.equal(themes.themeLabel(ocean, 'fr'), '바다');
});
