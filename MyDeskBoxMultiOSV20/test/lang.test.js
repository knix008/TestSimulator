'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('../src/shared/i18n');
const { THEMES, themeLabel } = require('../src/main/themes');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');

const ASSETS = path.join(__dirname, '..', 'assets');

function flatten(template, trail = '') {
  const out = [];
  for (const item of template) {
    if (item.type === 'separator') continue;
    const where = `${trail}${item.label}`;
    out.push({ ...item, where });
    if (Array.isArray(item.submenu)) out.push(...flatten(item.submenu, `${where} > `));
  }
  return out;
}

function openOne(lang) {
  const state = baseState({ fences: [fence()], settings: { lang, openAtLogin: false, theme: 'ocean', opacity: 0.52 } });
  const loaded = loadHost(state);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();
  return loaded;
}

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
  assert.equal(themeLabel(THEMES[0], 'en'), 'Ocean');
  assert.equal(themeLabel(THEMES[0], 'ko'), '바다');
});

test('each language has a flag image', () => {
  for (const lang of i18n.LANGS) {
    for (const suffix of ['', '@2x']) {
      const file = path.join(ASSETS, 'menu', `lang-${lang.id}${suffix}.png`);
      assert.ok(fs.existsSync(file), `${lang.label} flag (${suffix || '1x'}) is missing`);
    }
  }
});

test('tray menu shows the flag together with the language name', () => {
  const { installTray, electron } = openOne('ko');
  installTray();
  const items = flatten(electron.menus.at(-1));

  const korean = items.find((item) => item.label === '한국어');
  const english = items.find((item) => item.label === 'English');
  assert.ok(korean, 'Korean item exists');
  assert.ok(english, 'English item exists');
  assert.match(korean.icon.path, /lang-ko\.png$/);
  assert.match(english.icon.path, /lang-en\.png$/);
  assert.equal(korean.type, 'radio');
  assert.equal(korean.checked, true, 'current language is checked');
  assert.equal(english.checked, false);
});

test('switching language changes tray text to English', () => {
  const { host, installTray, electron } = openOne('ko');
  installTray();
  assert.ok(flatten(electron.menus.at(-1)).some((item) => item.label === '박스 그리기'));

  host.setLang('en');

  const items = flatten(electron.menus.at(-1));
  assert.ok(items.some((item) => item.label === 'New Box'), 'New Box item becomes English');
  assert.ok(items.some((item) => item.label === 'Settings'));
  assert.ok(items.some((item) => item.label === 'Quit'));
  assert.ok(items.some((item) => item.label === 'Ocean'), 'theme names become English too');
  const english = items.find((item) => item.label === 'English');
  assert.equal(english.checked, true, 'check mark moves to the selected language');
});

test('switching language also changes the box menu', () => {
  const { host, electron } = openOne('en');
  host.showMenu('a', 'C:/x/a.lnk');
  const items = flatten(electron.menus.at(-1)).map((item) => item.label);
  assert.ok(items.includes('Open'));
  assert.ok(items.includes('Move to Desktop'));
  assert.ok(items.includes('Delete Box'));

  host.setLang('ko');
  host.showMenu('a', 'C:/x/a.lnk');
  const korean = flatten(electron.menus.at(-1)).map((item) => item.label);
  assert.ok(korean.includes('열기'));
  assert.ok(korean.includes('박스 삭제'));
});

test('new box names follow the selected language', () => {
  const state = baseState({ settings: { lang: 'en', openAtLogin: false, theme: 'ocean', opacity: 0.52 } });
  const { host } = loadHost(state);
  assert.equal(host.finishDraw({ x: 0, y: 0, w: 300, h: 240 }).title, 'New Box');
  assert.equal(host.finishDraw({ x: 0, y: 0, w: 300, h: 240 }).title, 'New Box 2');

  host.setLang('ko');
  assert.equal(host.finishDraw({ x: 0, y: 0, w: 300, h: 240 }).title, '새 박스 3');
});

test('switching language notifies the windows', async () => {
  const { host, electron } = openOne('ko');
  host.setLang('en');
  await host.push('a');
  const sent = fenceWindows(electron)[0].messages('fence:state').at(-1);
  assert.equal(sent.lang, 'en');
});

test('setting the same language again does nothing', () => {
  const { host } = openOne('ko');
  let calls = 0;
  host.onChange(() => { calls += 1; });
  host.setLang('ko');
  assert.equal(calls, 0);
  host.setLang('en');
  assert.equal(calls, 1);
});

test('switching language applies to all boxes', async () => {
  const state = baseState({
    settings: { lang: 'ko', openAtLogin: false, theme: 'ocean', opacity: 0.52, corner: 20 },
    fences: [fence({ id: 'a' }), fence({ id: 'b' }), fence({ id: 'c' })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  host.setLang('en');
  for (const id of ['a', 'b', 'c']) await host.push(id);

  const boxes = fenceWindows(electron);
  assert.equal(boxes.length, 3);
  for (const win of boxes) {
    const sent = win.messages('fence:state').at(-1);
    assert.equal(sent.lang, 'en', 'a box was left in the old language');
  }
});
