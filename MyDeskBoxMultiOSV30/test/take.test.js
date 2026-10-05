'use strict';

// 담기 방식.
//
// 기본은 **그대로 두기** 다. 담아도 파일은 있는 자리에 남고, 바탕화면 아이콘은 박스 칸으로 옮겨 간다.
// 파일을 다른 폴더로 옮기지는 않고, 숨김 속성도 붙이지 않는다. 탐색기는 그 파일을 그대로 보여 준다.
// 박스를 옮기면 그 칸의 아이콘이 함께 간다. 박스에서 바탕화면으로 빼면 아이콘이 다시 보인다.
//
// 그래서 여기서 보는 것은 거의 모두 '파일이 움직이지 않았는지' 다. 담을 때, 꺼낼 때,
// 박스를 지울 때, 프로그램을 끝낼 때 — 어느 길로도 사람의 파일이 옮겨 가면 안 된다.
//
// 옮기기 방식은 예전부터 있던 길이고 다른 검사 파일들이 그쪽을 본다(fakes 의 baseState
// 가 옮기기로 못 박아 둔다). 이 파일만 그대로 두기를 본다.
//
// 기본값이 그대로 두기인지는 test/store.test.js 가 본다. 이 파일에서 src/main 모듈을
// 직접 require 하면 끼워 둔 가짜 electron 이 깨져 파일 전체가 죽는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadHost, fence, baseState, tempRoot, fenceWindows } = require('./helpers/fakes');

function deskDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-take-'));
}

// 그대로 두기로 켠 박스 하나와 바탕화면 폴더.
function room(extra) {
  const desk = deskDir();
  const state = baseState({
    fences: [fence(extra)],
    settings: { takeWith: 'keep' },
  });
  const loaded = loadHost(state);
  loaded.desktop.useDesktop(desk);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();
  loaded.host.refreshIcons();
  return { ...loaded, state, desk };
}

function onDesk(desk, name, text) {
  const at = path.join(desk, name);
  fs.writeFileSync(at, text === undefined ? name : text);
  return at;
}

test('담아도 파일은 바탕화면에 그대로 있다', async () => {
  const place = room();
  const at = onDesk(place.desk, '보고서.txt', '내용');

  await place.host.dropFiles('a', [at]);

  const item = place.state.fences[0].items[0];
  assert.ok(item, '박스가 담지 않았다');
  assert.equal(item.path, at, '박스가 가리키는 자리가 원래 자리가 아니다');
  assert.equal(item.keep, true, '가리키고만 있다는 표시가 없다');
  assert.equal(fs.existsSync(at), true, '바탕화면에서 파일이 사라졌다');
  assert.equal(fs.readFileSync(at, 'utf8'), '내용');
  // 보관함 폴더를 만들지도, 쓰지도 않는다.
  assert.equal(item.home, undefined, '담기 전 폴더를 적어 두었다');
});

test('보관함에 있던 항목은 바탕화면으로 돌아와 탐색기에 보인다', () => {
  const place = room({ folder: '박스' });
  const dir = path.join(place.state.settings.root, '박스');
  fs.mkdirSync(dir, { recursive: true });
  const stored = path.join(dir, '메모.txt');
  fs.writeFileSync(stored, '내용');
  place.state.fences[0].items.push({ name: '메모.txt', path: stored, home: place.desk });

  place.host.refreshIcons();

  const back = path.join(place.desk, '메모.txt');
  assert.equal(fs.existsSync(stored), false, '보관함에 그대로 남았다');
  assert.equal(fs.existsSync(back), true, '탐색기가 보는 바탕화면에 없다');
  assert.equal(fs.readFileSync(back, 'utf8'), '내용');
  const item = place.state.fences[0].items[0];
  assert.equal(item.path, back, '박스가 바탕화면 자리를 가리키지 않는다');
  assert.equal(item.keep, true, '가리킴 표시가 없다');
  assert.ok(place.desktop.module.desktopEntries().some((one) => one.path === back), '탐색기 목록에 없다');
});

test('같은 항목이 바탕화면과 박스에 함께 보인다', async () => {
  const place = room();
  const at = onDesk(place.desk, '사진.png');
  await place.host.dropFiles('a', [at]);

  // 박스는 그 항목을 그린다.
  await place.host.push('a');
  const shown = fenceWindows(place.electron).at(-1).messages('fence:state').at(-1);
  assert.deepEqual(shown.items.map((one) => one.path), [at]);

  // 바탕화면 폴더에도 그대로 있다. 탐색기가 계속 그린다.
  assert.deepEqual(place.desktop.module.desktopEntries().map((one) => one.path), [at]);
});

test('가리키는 항목은 박스 칸으로 옮기고 파일은 그 자리에 둔다', async () => {
  const place = room();
  const at = onDesk(place.desk, '가릴것.txt');
  await place.host.dropFiles('a', [at]);
  place.host.refreshIcons();

  assert.equal(fs.existsSync(at), true, '칸으로 옮기면서 파일을 옮겼다');
  const seated = place.desktop.calls.seated.at(-1);
  assert.ok(seated.some((spot) => spot.name === '가릴것.txt'), '바탕화면 아이콘을 박스 칸으로 옮기지 않았다');
  assert.equal(place.desktop.concealed.has(at), false, '파일을 숨김으로 만들었다');

  await place.host.eject('a', at);
  place.host.refreshIcons();
  const back = place.desktop.calls.seated.at(-1);
  assert.equal(back.some((spot) => spot.name === '가릴것.txt'), false, '박스에서 뺐는데 칸에 남아 있다');
  assert.ok(place.desktop.calls.homed.some((names) => names.includes('가릴것.txt')), '바탕화면으로 돌려주지 않았다');
  assert.equal(fs.existsSync(at), true, '꺼내면서 파일을 옮겼다');
});

test('가리키는 셸 항목은 박스 칸으로 옮긴다', async () => {
  const place = room();
  await place.host.dropFiles('a', [{ name: '휴지통', path: 'shell:RecycleBinFolder' }]);
  place.host.refreshIcons();

  assert.deepEqual(place.desktop.calls.shell.at(-1), [], '휴지통을 숨김으로 감췄다');
  const seated = place.desktop.calls.seated.at(-1);
  assert.ok(seated.some((spot) => spot.name === '휴지통'), '휴지통을 박스 칸으로 옮기지 않았다');
});

test('박스가 덮은 자리의 바탕화면 아이콘은 그대로 밀어낸다', async () => {
  const place = room();
  const at = onDesk(place.desk, '메모.txt');
  await place.host.dropFiles('a', [at]);
  place.host.refreshIcons();

  // 파일을 옮기지 않으므로 아이콘이 박스 밑에 깔린다. 비켜 주는 일은 그대로 한다.
  assert.equal(place.desktop.calls.nudged.at(-1).length, 1, '박스 자리를 비켜 주지 않았다');
});

test('꺼내면 목록에서만 빠지고 파일은 움직이지 않는다', async () => {
  const place = room();
  const at = onDesk(place.desk, '꺼낼것.txt');
  await place.host.dropFiles('a', [at]);

  await place.host.eject('a', at);

  assert.deepEqual(place.state.fences[0].items, [], '박스에서 빠지지 않았다');
  assert.equal(fs.existsSync(at), true, '꺼내면서 파일을 옮겼다');
});

test('박스를 지워도 파일은 그대로 있다', async () => {
  const place = room();
  const at = onDesk(place.desk, '남을것.txt');
  await place.host.dropFiles('a', [at]);

  place.electron.setDialogAnswer(0); // 삭제
  await place.host.removeFence('a');

  assert.equal(place.state.fences.length, 0);
  assert.equal(fs.existsSync(at), true, '박스를 지우면서 파일을 잃었다');
});

test('끝내도 파일을 옮기지 않는다', async () => {
  const place = room();
  const at = onDesk(place.desk, '그대로.txt', '끝까지');
  await place.host.dropFiles('a', [at]);

  place.host.putBack();

  assert.equal(fs.existsSync(at), true, '끝내면서 파일을 옮겼다');
  assert.equal(fs.readFileSync(at, 'utf8'), '끝까지');
});

// 이것이 가장 비싼 잘못이다. 바탕화면이 아닌 폴더에서 끌어 온 것을 끝낼 때
// '집으로 돌려준다' 고 바탕화면으로 옮기면, 사람의 작업 폴더가 헐어진다.
test('바탕화면이 아닌 폴더에서 가리킨 파일도 그 자리에 남는다', async () => {
  const place = room();
  const work = tempRoot();
  const at = path.join(work, '작업물.docx');
  fs.writeFileSync(at, 'x');

  await place.host.dropFiles('a', [at]);
  assert.equal(place.state.fences[0].items[0].path, at);

  place.host.putBack();

  assert.equal(fs.existsSync(at), true, '남의 폴더에서 파일을 꺼내 갔다');
  assert.equal(fs.existsSync(path.join(place.desk, '작업물.docx')), false, '바탕화면으로 끌어왔다');
});

// 담을 때의 방식은 항목에 새겨 둔다. 설정만 보고 판단하면 이 길에서 파일이 움직인다.
test('그대로 두기로 담은 뒤 옮기기로 바꿔도 그 항목은 건드리지 않는다', async () => {
  const place = room();
  const work = tempRoot();
  const at = path.join(work, '조심.txt');
  fs.writeFileSync(at, 'x');
  await place.host.dropFiles('a', [at]);

  place.host.setTakeWith('move');
  assert.equal(place.state.settings.takeWith, 'move');

  place.host.putBack();

  assert.equal(fs.existsSync(at), true, '방식을 바꾸자 담아 둔 파일이 옮겨 갔다');
});

test('방식을 바꾼 뒤에 담은 것은 새 방식을 따른다', async () => {
  const place = room();
  const first = onDesk(place.desk, '먼저.txt');
  await place.host.dropFiles('a', [first]);

  place.host.setTakeWith('move');
  const later = onDesk(place.desk, '나중.txt');
  await place.host.dropFiles('a', [later]);

  const items = place.state.fences[0].items;
  assert.equal(items.length, 2);
  const kept = items.find((one) => one.name === '먼저.txt');
  const moved = items.find((one) => one.name === '나중.txt');
  assert.equal(kept.keep, true, '먼저 담은 것의 표시가 지워졌다');
  assert.equal(fs.existsSync(first), true, '먼저 담은 것이 옮겨 갔다');
  assert.equal(moved.keep, undefined, '나중에 담은 것에 가리킴 표시가 붙었다');
  assert.equal(fs.existsSync(later), false, '옮기기로 바꿨는데 옮기지 않았다');
});

test('같은 것을 두 번 끌어다 놓아도 하나만 담긴다', async () => {
  const place = room();
  const at = onDesk(place.desk, '한번만.txt');

  await place.host.dropFiles('a', [at]);
  await place.host.dropFiles('a', [at]);

  assert.equal(place.state.fences[0].items.length, 1);
});

test('이름을 바꾸면 바탕화면의 파일 이름이 바뀐다', async () => {
  const place = room();
  const at = onDesk(place.desk, '옛이름.txt', 'x');
  await place.host.dropFiles('a', [at]);

  // 박스에 확장자가 보이고 있었으므로 사람이 적은 그대로가 온 이름이다.
  await place.host.renameItem('a', at, '새이름.txt');

  assert.equal(fs.existsSync(path.join(place.desk, '새이름.txt')), true, '파일 이름이 바뀌지 않았다');
  assert.equal(fs.existsSync(at), false, '옛 이름이 남았다');
  assert.equal(place.state.fences[0].items[0].name, '새이름.txt');
  assert.equal(place.state.fences[0].items[0].keep, true, '이름을 바꾸자 가리킴 표시가 지워졌다');
});

test('지우면 파일이 휴지통으로 간다', async () => {
  const place = room();
  const at = onDesk(place.desk, '버릴것.txt');
  await place.host.dropFiles('a', [at]);

  await place.host.trashItem('a', at);

  assert.deepEqual(place.electron.shell.trashed, [at]);
  assert.deepEqual(place.state.fences[0].items, []);
});

// 담긴 것이 탐색기 눈에 보이므로 탐색기가 같은 이름을 두 번 만들지 않는다.
// 그런데도 물으면, 사람이 바탕화면에 두고 쓰던 그 파일이 휴지통으로 간다.
test('가리키는 항목에는 대체할지 묻지 않는다', async () => {
  const place = room();
  const at = onDesk(place.desk, '메모.txt', '쓰던 것');
  await place.host.dropFiles('a', [at]);
  place.host.refreshIcons();

  // 같은 이름이 바탕화면에 '새로 생긴' 것처럼 한 번 더 훑는다.
  place.host.refreshIcons();
  await new Promise((done) => setTimeout(done, 40));

  assert.equal(place.asks.calls.length, 0, '묻지 않아야 하는데 물었다');
  assert.equal(fs.readFileSync(at, 'utf8'), '쓰던 것', '쓰던 파일이 바뀌었다');
  assert.deepEqual(place.electron.shell.trashed, [], '쓰던 파일을 휴지통에 넣었다');
});

test('탐색기에서 지운 파일은 박스에서도 빠진다', async () => {
  const place = room();
  const at = onDesk(place.desk, '없어질것.txt');
  await place.host.dropFiles('a', [at]);
  assert.equal(place.state.fences[0].items.length, 1);

  fs.rmSync(at);
  place.host.refreshIcons();

  assert.deepEqual(place.state.fences[0].items, []);
});

test('첫 실행 분류로 들어온 항목도 가리킴 표시를 받는다', () => {
  // 첫 실행 분류는 bringIn 을 거치지 않고 목록을 바로 만든다.
  // 표시가 없으면 끝낼 때 그 파일들이 바탕화면으로 옮겨진다.
  const desk = deskDir();
  const at = onDesk(desk, '분류된.txt');
  const state = baseState({
    fences: [fence({ items: [{ name: '분류된.txt', path: at }] })],
    settings: { takeWith: 'keep' },
  });
  const { host, desktop } = loadHost(state);
  desktop.useDesktop(desk);
  host.openAll();

  assert.equal(state.fences[0].items[0].keep, true, '가리킴 표시를 새기지 않았다');
  host.putBack();
  assert.equal(fs.existsSync(at), true, '끝내면서 파일을 옮겼다');
});

test('박스에서 박스로 옮겨도 파일은 그대로 있다', async () => {
  const desk = deskDir();
  const state = baseState({
    fences: [fence({ id: 'one' }), fence({ id: 'two', x: 700 })],
    settings: { takeWith: 'keep' },
  });
  const { host, desktop } = loadHost(state);
  desktop.useDesktop(desk);
  host.openAll();
  const at = onDesk(desk, '건너간다.txt', 'x');
  await host.dropFiles('one', [at]);

  await host.dropFiles('two', [at]);

  assert.deepEqual(state.fences[0].items, [], '앞 박스에 그대로 남았다');
  assert.deepEqual(state.fences[1].items.map((one) => one.path), [at]);
  assert.equal(state.fences[1].items[0].keep, true);
  assert.equal(fs.existsSync(at), true, '박스를 옮기면서 파일이 움직였다');
});

test('바탕화면으로 모두 돌려주기도 가리키는 것은 건드리지 않는다', async () => {
  const place = room();
  const work = tempRoot();
  const at = path.join(work, '남의것.txt');
  fs.writeFileSync(at, 'x');
  await place.host.dropFiles('a', [at]);

  const count = await place.host.returnAll();

  assert.equal(count, 0, '옮긴 적이 없는데 돌려줬다고 센다');
  assert.deepEqual(place.state.fences[0].items, [], '박스는 비워야 한다');
  assert.equal(fs.existsSync(at), true, '남의 폴더에서 파일을 꺼내 갔다');
});

test('설정 창과 트레이에서 방식을 고를 수 있다', () => {
  const place = room();
  place.host.openPrefs();
  place.host.pushPrefs();
  const prefs = place.electron.windows.find((one) => one.loaded && /prefs\.html$/.test(one.loaded.file));
  assert.equal(prefs.messages('prefs:state').at(-1).settings.takeWith, 'keep');

  place.installTray();
  const quick = place.electron.menus.at(-1).find((one) => one.label === '빠른 설정');
  const take = quick.submenu.find((one) => one.label === '박스에 담기');
  assert.ok(take && Array.isArray(take.submenu), '트레이에 담기 방식이 없다');
  assert.deepEqual(take.submenu.map((one) => one.label), ['그대로 두기', '박스 폴더로 옮기기']);
  assert.equal(take.submenu[0].checked, true, '지금 방식에 표시가 없다');

  take.submenu[1].click();
  assert.equal(place.state.settings.takeWith, 'move');
});
