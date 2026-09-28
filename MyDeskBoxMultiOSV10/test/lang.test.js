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

test('두 언어가 같은 이름표를 모두 갖고 있다', () => {
  const ko = Object.keys(i18n.TEXT.ko).sort();
  const en = Object.keys(i18n.TEXT.en).sort();
  assert.deepEqual(en, ko, '한쪽에만 있는 글이 있다');
  for (const key of ko) {
    assert.ok(i18n.TEXT.ko[key].trim(), `${key} 의 한국어가 비었다`);
    assert.ok(i18n.TEXT.en[key].trim(), `${key} 의 영어가 비었다`);
  }
});

test('빈 곳을 채워 넣는다', () => {
  assert.equal(i18n.t('ko', 'dialog.remove', { title: '일감' }), "'일감' 박스를 지울까요?");
  assert.equal(i18n.t('en', 'dialog.remove', { title: 'Work' }), "Delete the box 'Work'?");
  assert.equal(i18n.t('ko', 'box.nth', { n: 3 }), '새 박스 3');
});

test('모르는 언어나 이름표는 안전하게 넘어간다', () => {
  assert.equal(i18n.langOf('fr'), 'ko');
  assert.equal(i18n.t('fr', 'tray.quit'), '종료');
  assert.equal(i18n.t('en', '없는.이름표'), '없는.이름표');
});

test('시스템 언어를 보고 처음 언어를 고른다', () => {
  assert.equal(i18n.guessLang('ko-KR'), 'ko');
  assert.equal(i18n.guessLang('ko'), 'ko');
  assert.equal(i18n.guessLang('en-US'), 'en');
  assert.equal(i18n.guessLang(''), 'en');
});

test('테마 이름도 두 언어를 모두 갖는다', () => {
  for (const theme of THEMES) {
    assert.ok(theme.label.ko, `${theme.id} 의 한국어 이름이 없다`);
    assert.ok(theme.label.en, `${theme.id} 의 영어 이름이 없다`);
  }
  assert.equal(themeLabel(THEMES[0], 'en'), 'Ocean');
  assert.equal(themeLabel(THEMES[0], 'ko'), '바다');
});

test('국기 그림이 언어마다 있다', () => {
  for (const lang of i18n.LANGS) {
    for (const suffix of ['', '@2x']) {
      const file = path.join(ASSETS, 'menu', `lang-${lang.id}${suffix}.png`);
      assert.ok(fs.existsSync(file), `${lang.label} 국기(${suffix || '1배'})가 없다`);
    }
  }
});

test('트레이 메뉴에 국기와 언어 이름이 함께 나온다', () => {
  const { installTray, electron } = openOne('ko');
  installTray();
  const items = flatten(electron.menus.at(-1));

  const korean = items.find((item) => item.label === '한국어');
  const english = items.find((item) => item.label === 'English');
  assert.ok(korean, '한국어 항목이 있다');
  assert.ok(english, 'English 항목이 있다');
  assert.match(korean.icon.path, /lang-ko\.png$/);
  assert.match(english.icon.path, /lang-en\.png$/);
  assert.equal(korean.type, 'radio');
  assert.equal(korean.checked, true, '지금 쓰는 언어에 표시가 있다');
  assert.equal(english.checked, false);
});

test('언어를 바꾸면 트레이 글이 영어로 바뀐다', () => {
  const { host, installTray, electron } = openOne('ko');
  installTray();
  assert.ok(flatten(electron.menus.at(-1)).some((item) => item.label === '박스 그리기'));

  host.setLang('en');

  const items = flatten(electron.menus.at(-1));
  assert.ok(items.some((item) => item.label === 'New Box'), '박스 그리기가 영어가 된다');
  assert.ok(items.some((item) => item.label === 'Settings'));
  assert.ok(items.some((item) => item.label === 'Quit'));
  assert.ok(items.some((item) => item.label === 'Ocean'), '테마 이름도 영어가 된다');
  const english = items.find((item) => item.label === 'English');
  assert.equal(english.checked, true, '고른 언어로 표시가 옮겨 간다');
});

test('언어를 바꾸면 박스 메뉴도 함께 바뀐다', () => {
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

test('새 박스 이름도 고른 언어를 따른다', () => {
  const state = baseState({ settings: { lang: 'en', openAtLogin: false, theme: 'ocean', opacity: 0.52 } });
  const { host } = loadHost(state);
  assert.equal(host.finishDraw({ x: 0, y: 0, w: 300, h: 240 }).title, 'New Box');
  assert.equal(host.finishDraw({ x: 0, y: 0, w: 300, h: 240 }).title, 'New Box 2');

  host.setLang('ko');
  assert.equal(host.finishDraw({ x: 0, y: 0, w: 300, h: 240 }).title, '새 박스 3');
});

test('언어를 바꾸면 창에도 알려 준다', async () => {
  const { host, electron } = openOne('ko');
  host.setLang('en');
  await host.push('a');
  const sent = fenceWindows(electron)[0].messages('fence:state').at(-1);
  assert.equal(sent.lang, 'en');
});

test('같은 언어로 다시 정하면 아무 일도 하지 않는다', () => {
  const { host } = openOne('ko');
  let calls = 0;
  host.onChange(() => { calls += 1; });
  host.setLang('ko');
  assert.equal(calls, 0);
  host.setLang('en');
  assert.equal(calls, 1);
});

test('언어를 바꾸면 모든 박스에 함께 적용된다', async () => {
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
    assert.equal(sent.lang, 'en', '박스 하나가 예전 언어로 남았다');
  }
});
