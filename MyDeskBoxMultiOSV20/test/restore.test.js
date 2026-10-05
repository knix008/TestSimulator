'use strict';

// 프로그램을 지울 때와 다시 깔 때 지나는 복구 길.
//
// 설치 프로그램이 'MyDeskBox.exe --restore-desktop' 으로 부른다.
// 박스에 담아 둔 파일은 적어 둔 자리로, 적혀 있지 않은 것은 바탕화면으로 돌아가야 한다.
// 감춘 휴지통과 비켜 둔 아이콘 자리는 desktop.shutdown 이 되돌린다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const hold = require('../src/main/hold');
const { restoreDesktop, strayFiles } = require('../src/main/restore');

function room(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mydeskbox-${name}-`));
}

// 무엇을 불렀는지 적어 두는 가짜 바탕화면 모듈.
function fakeDesktop() {
  const calls = { init: [], refreshed: [], shutdown: 0 };
  return {
    calls,
    init: (dir) => calls.init.push(dir),
    refreshFolder: (dir) => calls.refreshed.push(dir),
    shutdown: () => {
      calls.shutdown += 1;
    },
  };
}

// 박스 하나에 파일을 담아 둔 모습을 만든다. 담는 일은 보관함 모듈이 한다.
function held(names) {
  const userDir = room('user');
  const desk = room('desk');
  const root = path.join(userDir, 'boxes');
  hold.configure({ root, desktopDir: desk, userDir });
  const fence = { id: 'a', title: '일감', folder: '', items: [] };
  const made = [];
  for (const name of names) {
    const at = path.join(desk, name);
    fs.writeFileSync(at, name);
    made.push(hold.take(fence, { name, path: at }));
  }
  return { userDir, desk, root, fence, made };
}

test('담아 둔 파일을 적어 둔 자리로 돌려보낸다', () => {
  const place = held(['노트.txt', '사진.png']);
  const desktop = fakeDesktop();

  const report = restoreDesktop({
    hold,
    desktop,
    userDir: place.userDir,
    desktopDir: place.desk,
    root: place.root,
  });

  assert.equal(report.back.length, 2, '돌려보내지 않았다');
  assert.deepEqual(report.left, [], '되돌리지 못한 것이 있다');
  assert.deepEqual(fs.readdirSync(place.desk).sort(), ['노트.txt', '사진.png']);
  for (const item of place.made) {
    assert.equal(fs.existsSync(item.path), false, '보관함에 파일이 남았다');
  }
});

test('빈 박스 폴더는 치우고, 탐색기에 알리고, 아이콘 자리도 되돌린다', () => {
  const place = held(['노트.txt']);
  const desktop = fakeDesktop();

  restoreDesktop({
    hold,
    desktop,
    userDir: place.userDir,
    desktopDir: place.desk,
    root: place.root,
  });

  assert.deepEqual(fs.readdirSync(path.join(place.root)), ['restore.json'], '빈 박스 폴더가 남았다');
  assert.deepEqual(desktop.calls.init, [place.userDir], '아이콘 자리를 읽지 않았다');
  assert.ok(desktop.calls.refreshed.includes(place.desk), '탐색기에 알리지 않았다');
  assert.equal(desktop.calls.shutdown, 1, '감춘 휴지통과 아이콘 자리를 되돌리지 않았다');
});

test('적혀 있지 않은 파일도 바탕화면으로 보낸다', () => {
  // 앱이 갑자기 끝나 기록이 빠졌거나, 사람이 박스 폴더에 직접 넣은 파일이다.
  // 보관함에 남겨 두면 어디에서도 보이지 않는다.
  const place = held(['노트.txt']);
  const box = path.join(place.root, place.fence.folder);
  fs.writeFileSync(path.join(box, '적히지않은.txt'), '기록 없음');
  const desktop = fakeDesktop();

  const report = restoreDesktop({
    hold,
    desktop,
    userDir: place.userDir,
    desktopDir: place.desk,
    root: place.root,
  });

  assert.deepEqual(report.strays.map((at) => path.basename(at)), ['적히지않은.txt']);
  assert.equal(fs.existsSync(path.join(place.desk, '적히지않은.txt')), true);
  assert.deepEqual(report.left, []);
});

test('바탕화면에 같은 이름이 있으면 번호를 붙여 둘 다 남긴다', () => {
  const place = held(['노트.txt']);
  // 담은 뒤에 같은 이름이 바탕화면에 새로 생겼다.
  fs.writeFileSync(path.join(place.desk, '노트.txt'), '새로 만든 것');
  const desktop = fakeDesktop();

  const report = restoreDesktop({
    hold,
    desktop,
    userDir: place.userDir,
    desktopDir: place.desk,
    root: place.root,
  });

  assert.equal(report.back.length, 1);
  assert.deepEqual(fs.readdirSync(place.desk).sort(), ['노트 (2).txt', '노트.txt'], '덮어썼거나 남겨 두었다');
});

test('담아 둔 것이 없으면 아무 일도 없다', () => {
  const userDir = room('user');
  const desk = room('desk');
  const desktop = fakeDesktop();

  const report = restoreDesktop({
    hold,
    desktop,
    userDir,
    desktopDir: desk,
    root: path.join(userDir, 'boxes'),
  });

  assert.deepEqual(report.back, []);
  assert.deepEqual(report.strays, []);
  assert.deepEqual(report.left, []);
  assert.equal(desktop.calls.shutdown, 1, '감춘 것이 없어도 되돌리기는 지나야 한다');
});

test('바탕화면 폴더를 모르면 아무것도 건드리지 않는다', () => {
  const place = held(['노트.txt']);
  const desktop = fakeDesktop();

  const report = restoreDesktop({ hold, desktop, userDir: place.userDir, desktopDir: '', root: place.root });

  assert.deepEqual(report.back, []);
  assert.equal(desktop.calls.shutdown, 0, '돌려보낼 자리를 모르는데 끝내는 길을 지났다');
  assert.equal(fs.existsSync(place.made[0].path), true, '돌려보낼 자리도 모르면서 파일을 옮겼다');
});

test('보관함에 남은 파일만 센다. 보관함이 쓰는 파일은 세지 않는다', () => {
  const place = held(['노트.txt']);
  const found = strayFiles(place.root);
  assert.deepEqual(found.map((at) => path.basename(at)), ['노트.txt']);
  assert.equal(found.some((at) => at.endsWith('restore.json')), false, '기록 파일을 옮기려 한다');
});
