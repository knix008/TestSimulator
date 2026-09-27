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

// 화면 왼쪽이나 위쪽 가장자리에 붙인 박스는 자리가 0 이다. 0 도 자리다.
test('화면 모서리에 붙여 둔 박스는 다시 켜도 그 모서리에 있다', () => {
  const saved = store.defaults();
  saved.fences = [
    store.normalizeFence({ id: 'corner', title: '폴더', x: 0, y: 0, w: 456, h: 160 }),
    store.normalizeFence({ id: 'left', title: '프로그램', x: 0, y: 160, w: 456, h: 427 }),
    store.normalizeFence({ id: 'top', title: '기타', x: 500, y: 0, w: 456, h: 160 }),
  ];
  store.save(saved);

  const back = store.load();
  assert.deepEqual(
    back.fences.map((box) => [box.id, box.x, box.y]),
    [['corner', 0, 0], ['left', 0, 160], ['top', 500, 0]],
    '모서리에 붙인 박스가 다른 자리로 옮겨졌다'
  );
});

test('왼쪽이나 위쪽 화면에 둔 박스의 음수 자리도 그대로 읽는다', () => {
  const box = store.normalizeFence({ id: 'a', x: -1920, y: -300 });
  assert.deepEqual([box.x, box.y], [-1920, -300]);
});

test('자리가 적혀 있지 않거나 숫자가 아니면 기본 자리에 둔다', () => {
  for (const [x, y] of [[undefined, undefined], [null, null], ['abc', {}], [NaN, Infinity], ['', '']]) {
    const box = store.normalizeFence({ id: 'a', x, y });
    assert.deepEqual([box.x, box.y], [80, 80], `${String(x)}, ${String(y)} 을 자리로 받았다`);
  }
  const text = store.normalizeFence({ id: 'a', x: '0', y: '12' });
  assert.deepEqual([text.x, text.y], [0, 12], '글로 적힌 숫자를 읽지 못한다');
});

test('박스가 화면 밖 값으로 적혀 있어도 최소 크기는 지킨다', () => {
  const box = store.normalizeFence({ id: 'a', w: 10, h: 10, opacity: 9, corner: -5 });
  assert.ok(box.w >= 180 && box.h >= 160, '너무 작은 박스를 그대로 받았다');
  assert.ok(box.opacity <= 0.9 && box.opacity >= 0.15, '투명도가 범위를 넘었다');
  assert.ok(box.corner >= 0, '모서리가 음수다');
});
