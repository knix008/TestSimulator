'use strict';

// 글자는 src/shared/i18n.js 한 곳에만 있다. 박스 창이 그대로 읽고, Rust 쪽은 빌드할 때 같은 파일을 옮겨 담는다.
// 언어를 바꿨을 때 트레이·메뉴·박스가 따라오는지는 src-tauri/src/host/tests_lang.rs 가 본다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('../src/shared/i18n');
const { THEMES } = require('../src/shared/themes.json');

const ASSETS = path.join(__dirname, '..', 'src', 'assets');

test('both languages have the same set of keys', () => {
  const ko = Object.keys(i18n.TEXT.ko).sort();
  const en = Object.keys(i18n.TEXT.en).sort();
  assert.deepEqual(en, ko, 'some text exists in only one language');
  for (const key of ko) {
    assert.ok(i18n.TEXT.ko[key].trim(), `${key} has empty Korean text`);
    assert.ok(i18n.TEXT.en[key].trim(), `${key} has empty English text`);
  }
});

test('fills in placeholders', () => {
  assert.equal(i18n.t('ko', 'dialog.remove', { title: '일감' }), "'일감' 박스를 지울까요?");
  assert.equal(i18n.t('en', 'dialog.remove', { title: 'Work' }), "Delete the box 'Work'?");
  assert.equal(i18n.t('ko', 'box.nth', { n: 3 }), '새 박스 3');
});

test('unknown languages and keys fall back safely', () => {
  assert.equal(i18n.langOf('fr'), 'ko');
  assert.equal(i18n.t('fr', 'tray.quit'), '종료');
  assert.equal(i18n.t('en', '없는.이름표'), '없는.이름표');
});

test('picks the initial language from the system locale', () => {
  assert.equal(i18n.guessLang('ko-KR'), 'ko');
  assert.equal(i18n.guessLang('ko'), 'ko');
  assert.equal(i18n.guessLang('en-US'), 'en');
  assert.equal(i18n.guessLang(''), 'en');
});

test('theme names exist in both languages', () => {
  for (const theme of THEMES) {
    assert.ok(theme.label.ko, `${theme.id} is missing a Korean name`);
    assert.ok(theme.label.en, `${theme.id} is missing an English name`);
  }
  assert.equal(THEMES[0].label.en, 'Ocean');
  assert.equal(THEMES[0].label.ko, '바다');
});

test('each language has a flag image', () => {
  for (const lang of i18n.LANGS) {
    for (const suffix of ['', '@2x']) {
      const file = path.join(ASSETS, 'menu', `lang-${lang.id}${suffix}.png`);
      assert.ok(fs.existsSync(file), `${lang.label} flag (${suffix || '1x'}) is missing`);
    }
  }
});
