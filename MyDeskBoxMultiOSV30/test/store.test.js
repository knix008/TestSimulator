'use strict';

// 저장해 둔 것을 그대로 다시 읽어 오는지.
//
// store.js 는 electron 의 app 에게 설정 폴더를 묻는다. 여기서는 임시 폴더를 주는
// 가짜를 끼운다. 이 파일은 진짜 electron 을 쓰지 않으므로 끼운 채로 끝까지 간다.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOM = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-store-'));
const KEY = ' electron';

const original = Module._resolveFilename;
Module._resolveFilename = function resolve(request, parent, ...rest) {
  if (request === 'electron') return KEY;
  return original.call(this, request, parent, ...rest);
};
require.cache[KEY] = {
  id: KEY,
  filename: KEY,
  loaded: true,
  exports: { app: { getLocale: () => 'ko-KR', getPath: () => ROOM } },
};

const store = require('../src/main/store');

// 저장본이 놓이는 자리.
function file() {
  return path.join(ROOM, 'layout.json');
}

test('설정을 저장한 적이 없으면 시작할 때 실행이 켜져 있다', () => {
  // 설치하고 시스템을 다시 켜면 스스로 돌아와 있어야 한다.
  assert.equal(store.defaults().settings.openAtLogin, true);
});

test('저장한 자리와 설정을 그대로 다시 읽는다', () => {
  const saved = store.defaults();
  saved.didWelcome = true;
  saved.hidden = true;
  saved.settings.lang = 'en';
  saved.settings.openAtLogin = false;
  saved.settings.opacity = 0.4;
  saved.settings.openWith = 'single';
  saved.settings.shadow = true;
  saved.fences = [store.normalizeFence({
    id: 'a', title: '일감', x: 321, y: 234, w: 420, h: 360, corner: 20, collapsed: true, folder: 'work',
  })];
  store.save(saved);

  const back = store.load();
  assert.equal(back.hidden, true, '숨겨 둔 채로 끝냈으면 숨긴 채로 시작한다');
  assert.deepEqual(back.settings, saved.settings, '설정이 그대로다');
  const box = back.fences[0];
  assert.deepEqual(
    [box.id, box.title, box.x, box.y, box.w, box.h, box.collapsed, box.folder],
    ['a', '일감', 321, 234, 420, 360, true, 'work'],
    '박스의 자리와 크기, 접힘, 폴더가 그대로다'
  );
});

test('한 번 끄기로 한 사람에게는 다시 켜 주지 않는다', () => {
  const saved = store.defaults();
  saved.settings.openAtLogin = false;
  store.save(saved);
  assert.equal(store.load().settings.openAtLogin, false);
});

test('설정 파일이 없으면 기본값으로 시작한다', () => {
  fs.rmSync(path.join(ROOM, 'layout.json'), { force: true });
  const back = store.load();
  assert.equal(back.settings.openAtLogin, true);
  assert.equal(back.fences.length, 0);
  assert.equal(back.didWelcome, false);
});

test('시작할 때 실행이 적혀 있지 않은 예전 저장본은 켠 것으로 본다', () => {
  // 그 값을 저장하지 않던 판에서 올라온 경우. 설치한 사람이 고른 적이 없으니 기본값을 따른다.
  fs.writeFileSync(file(), JSON.stringify({
    version: 1,
    didWelcome: true,
    settings: { lang: 'ko', theme: 'ocean' },
    fences: [],
  }));
  const back = store.load();
  assert.equal(back.settings.openAtLogin, true);
  assert.equal(back.settings.theme, 'ocean', '적혀 있던 값은 그대로 둔다');
});

test('불리언이 아닌 값이 적혀 있어도 참·거짓으로 읽는다', () => {
  for (const [written, wanted] of [['yes', true], [0, false], [null, false], [1, true]]) {
    fs.writeFileSync(file(), JSON.stringify({ settings: { openAtLogin: written } }));
    assert.equal(store.load().settings.openAtLogin, wanted, `${JSON.stringify(written)} 을 잘못 읽는다`);
  }
});

test('저장본이 깨져 있으면 기본값으로 시작한다', () => {
  fs.writeFileSync(file(), '{ 여기서 끊겼다');
  const back = store.load();
  assert.equal(back.settings.openAtLogin, true);
  assert.equal(back.fences.length, 0);
});

test('저장은 통째로 바뀌고 임시 파일을 남기지 않는다', () => {
  const saved = store.defaults();
  saved.fences = [store.normalizeFence({ id: 'a', title: '일감', x: 10, y: 20 })];
  store.save(saved);
  const left = fs.readdirSync(ROOM).filter((name) => name.startsWith('layout.json'));
  assert.deepEqual(left, ['layout.json'], `임시 파일이 남았다: ${left.join(', ')}`);
});

test('박스가 화면 밖 값으로 적혀 있어도 최소 크기는 지킨다', () => {
  const box = store.normalizeFence({ id: 'a', w: 10, h: 10, opacity: 9, corner: -5 });
  assert.ok(box.w >= 180 && box.h >= 160, '너무 작은 박스를 그대로 받았다');
  assert.ok(box.opacity <= 0.9 && box.opacity >= 0.15, '투명도가 범위를 넘었다');
  assert.ok(box.corner >= 0, '모서리가 음수다');
});

test('페이지와 규칙과 스냅샷도 그대로 다시 읽는다', () => {
  const saved = store.defaults();
  saved.pages = [{ id: 'main', name: '' }, { id: 'p2', name: '놀이' }];
  saved.page = 'p2';
  saved.settings.autoSort = true;
  saved.settings.rules = [{ id: 'r1', kind: 'ext', value: 'pdf', fence: 'a', on: true }];
  saved.snaps = [{ id: 's1', name: '어제', at: 123, page: 'main', pages: saved.pages, boxes: [{ id: 'a', x: 10, y: 20 }] }];
  saved.fences = [store.normalizeFence({
    id: 'a', title: '포털', page: 'p2', portal: 'C:/Work', look: { text: '#ff0000', icon: 64 },
  })];
  store.save(saved);

  const back = store.load();
  assert.deepEqual(back.pages, saved.pages, '페이지 목록이 다르다');
  assert.equal(back.page, 'p2', '보고 있던 페이지가 다르다');
  assert.equal(back.settings.autoSort, true);
  assert.deepEqual(back.settings.rules, saved.settings.rules);
  assert.equal(back.snaps.length, 1);
  assert.deepEqual([back.snaps[0].id, back.snaps[0].name, back.snaps[0].boxes.length], ['s1', '어제', 1]);
  assert.equal(back.fences[0].page, 'p2');
  assert.equal(back.fences[0].portal, 'C:/Work');
  assert.deepEqual(back.fences[0].look, { text: '#ff0000', bar: '', icon: 64, font: 0 });
});

test('페이지가 없던 예전 저장본의 박스는 첫 페이지에 선다', () => {
  fs.writeFileSync(file(), JSON.stringify({
    version: 1,
    didWelcome: true,
    settings: { lang: 'ko' },
    fences: [{ id: 'a', title: '옛 박스', x: 10, y: 20 }],
  }));
  const back = store.load();
  assert.equal(back.pages.length, 1);
  assert.equal(back.fences[0].page, back.pages[0].id);
  assert.equal(back.page, back.pages[0].id);
  // 포털도 규칙도 없던 판이다. 비어 있는 것으로 읽는다.
  assert.equal(back.fences[0].portal, '');
  assert.deepEqual(back.settings.rules, []);
  assert.equal(back.settings.autoSort, false);
});

test('없어진 페이지를 가리키는 박스는 읽을 때 첫 페이지로 온다', () => {
  fs.writeFileSync(file(), JSON.stringify({
    pages: [{ id: 'main', name: '' }],
    page: '없는것',
    fences: [{ id: 'a', page: '사라진페이지' }],
  }));
  const back = store.load();
  assert.equal(back.fences[0].page, 'main');
  assert.equal(back.page, 'main');
});

test('규칙과 스냅샷에 쓰레기가 섞여 있으면 걸러 낸다', () => {
  fs.writeFileSync(file(), JSON.stringify({
    settings: { rules: [null, 'nope', { id: 'r1', kind: '엉뚱', value: 'pdf', fence: 'a' }] },
    snaps: [null, { name: '이름만' }],
    pages: [null, { name: 'id 가 없다' }],
  }));
  const back = store.load();
  assert.equal(back.settings.rules.length, 1);
  assert.equal(back.settings.rules[0].kind, 'ext', '모르는 갈래는 기본값으로 둔다');
  assert.equal(back.snaps.length, 1);
  assert.deepEqual(back.snaps[0].boxes, []);
  assert.equal(back.pages.length, 1, '쓸 수 있는 페이지가 없으면 첫 페이지를 둔다');
});
