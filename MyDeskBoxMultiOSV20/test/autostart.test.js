'use strict';

// Linux 에는 Electron 이 맡아 주는 로그인 항목이 없다.
// 그래서 ~/.config/autostart 에 .desktop 파일을 손으로 둔다. 그 길만 따로 본다.
//
// 이 파일은 운영체제와 electron 을 둘 다 흉내 낸다. 다른 검사와 섞이지 않게
// 파일 하나를 통째로 쓴다.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOM = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-xdg-'));
process.env.XDG_CONFIG_HOME = ROOM;
Object.defineProperty(process, 'platform', { value: 'linux' });

const KEY = ' electron';
const fake = { app: { isPackaged: true } };
const original = Module._resolveFilename;
Module._resolveFilename = function resolve(request, parent, ...rest) {
  if (request === 'electron') return KEY;
  return original.call(this, request, parent, ...rest);
};
require.cache[KEY] = { id: KEY, filename: KEY, loaded: true, exports: fake };

const autostart = require('../src/main/autostart');

test('켜면 autostart 폴더에 .desktop 파일을 둔다', () => {
  assert.equal(autostart.apply(true, 'MyDeskBox'), true);

  const file = autostart.desktopFile();
  assert.equal(file, path.join(ROOM, 'autostart', 'mydeskbox.desktop'));
  const body = fs.readFileSync(file, 'utf8');
  assert.match(body, /^\[Desktop Entry\]$/m);
  assert.match(body, /^Type=Application$/m);
  assert.match(body, /^Name=MyDeskBox$/m);
  assert.ok(body.includes(process.execPath), '무엇을 켤지 적혀 있지 않다');
  assert.match(body, /^X-GNOME-Autostart-enabled=true$/m);
  assert.equal(autostart.enabled(), true);
});

test('끄면 그 파일을 치운다', () => {
  autostart.apply(true, 'MyDeskBox');
  assert.equal(autostart.apply(false, 'MyDeskBox'), true);
  assert.equal(fs.existsSync(autostart.desktopFile()), false);
  assert.equal(autostart.enabled(), false);
});

test('이미 없으면 끄는 길로 아무것도 하지 않는다', () => {
  autostart.apply(false, 'MyDeskBox');
  assert.equal(autostart.sync(false, 'MyDeskBox'), false, '없는 것을 또 지운다');
});

test('켤 때마다 지금 자리로 다시 적는다', () => {
  autostart.apply(false, 'MyDeskBox');
  assert.equal(autostart.sync(true, 'MyDeskBox'), true);
  assert.equal(fs.existsSync(autostart.desktopFile()), true, '지웠던 것이 되살아나지 않는다');
});

test('개발 중에 띄운 것은 등록하지 않는다', () => {
  autostart.apply(false, 'MyDeskBox');
  fake.app.isPackaged = false;
  try {
    assert.equal(autostart.apply(true, 'MyDeskBox'), false);
    assert.equal(fs.existsSync(autostart.desktopFile()), false);
  } finally {
    fake.app.isPackaged = true;
  }
});

test('AppImage 는 껍데기 경로를 적는다', () => {
  // 안쪽 실행 파일은 켤 때마다 자리가 바뀐다. 그것을 적어 두면 다음 로그인에 없다.
  const shell = '/home/me/Apps/My Desk Box.AppImage';
  process.env.APPIMAGE = shell;
  try {
    autostart.apply(true, 'MyDeskBox');
    const body = fs.readFileSync(autostart.desktopFile(), 'utf8');
    // 빈칸이 든 경로는 따옴표로 감싸야 한 낱말로 읽힌다.
    assert.match(body, /^Exec="\/home\/me\/Apps\/My Desk Box\.AppImage"$/m);
    assert.ok(!body.includes(process.execPath), '안쪽 실행 파일을 적었다');
  } finally {
    delete process.env.APPIMAGE;
  }
});

test('빈칸 없는 경로는 따옴표를 붙이지 않는다', () => {
  process.env.APPIMAGE = '/opt/mydeskbox/MyDeskBox';
  try {
    autostart.apply(true, 'MyDeskBox');
    assert.match(fs.readFileSync(autostart.desktopFile(), 'utf8'), /^Exec=\/opt\/mydeskbox\/MyDeskBox$/m);
  } finally {
    delete process.env.APPIMAGE;
  }
});

test('이름을 주지 않아도 사람이 읽을 이름으로 적는다', () => {
  autostart.apply(true);
  assert.match(fs.readFileSync(autostart.desktopFile(), 'utf8'), /^Name=MyDeskBox$/m);
});

test('.desktop 은 창을 띄우지 않고 목록에도 보이지 않는다', () => {
  autostart.apply(true, 'MyDeskBox');
  const body = fs.readFileSync(autostart.desktopFile(), 'utf8');
  assert.match(body, /^Terminal=false$/m, '터미널 창이 함께 뜬다');
  assert.match(body, /^NoDisplay=true$/m, '프로그램 목록에 하나 더 보인다');
  assert.ok(body.endsWith('\n'), '마지막 줄이 끝나지 않았다');
});

test('켜고 또 켜도 한 벌만 남는다', () => {
  autostart.apply(true, 'MyDeskBox');
  autostart.apply(true, 'MyDeskBox');
  const dir = path.dirname(autostart.desktopFile());
  assert.deepEqual(fs.readdirSync(dir), ['mydeskbox.desktop']);
});
