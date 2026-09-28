'use strict';

// 폴더 포털.
//
// 포털은 디스크에 이미 있는 폴더를 그대로 비추는 박스다. **파일을 옮기지 않는다.**
// 보통 박스와 가장 다른 점이 이것이라, 여기서 보는 것도 대부분 '파일이 그 자리에
// 그대로 있는지' 다. 박스를 지워도, 프로그램을 끝내도 남의 폴더는 남아 있어야 한다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadHost, fence, baseState, tempRoot, fenceWindows } = require('./helpers/fakes');
const portal = require('../src/main/portal');

// 비출 폴더를 하나 만들고 안에 파일을 둔다.
function folderWith(...names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-portal-'));
  for (const name of names) {
    if (name.endsWith('/')) fs.mkdirSync(path.join(dir, name.slice(0, -1)));
    else fs.writeFileSync(path.join(dir, name), name);
  }
  return dir;
}

test('폴더 안의 항목을 폴더 먼저, 이름 차례로 읽는다', () => {
  const dir = folderWith('나중.txt', '가운데.txt', 'zz/', 'aa/');
  const found = portal.entries(dir).map((entry) => entry.name);
  assert.deepEqual(found, ['aa', 'zz', '가운데.txt', '나중.txt']);
  assert.deepEqual(portal.entries(dir).map((entry) => entry.directory), [true, true, false, false]);
});

test('숨김 파일과 desktop.ini 는 보여 주지 않는다', () => {
  const dir = folderWith('보임.txt', '.숨김', 'desktop.ini', 'Thumbs.db');
  assert.deepEqual(portal.entries(dir).map((entry) => entry.name), ['보임.txt']);
});

test('없는 폴더를 가리키면 빈 목록이다', () => {
  assert.deepEqual(portal.entries(path.join(os.tmpdir(), 'mydeskbox-없는폴더')), []);
  assert.equal(portal.usable(''), false);
  assert.equal(portal.watch('', () => {})(), undefined);
});

test('포털 박스는 가리키는 폴더의 내용을 그대로 보여 준다', async () => {
  const dir = folderWith('보고서.txt', '사진.png');
  const state = baseState({ fences: [fence({ portal: dir })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['보고서.txt', '사진.png']);
  // 파일은 그 폴더에 그대로 있다. 보관함으로 옮기지 않는다.
  for (const name of ['보고서.txt', '사진.png']) {
    assert.equal(fs.existsSync(path.join(dir, name)), true, `${name} 이 폴더에서 사라졌다`);
  }
  assert.equal(host.isPortal(state.fences[0]), true);

  // 탐색기에서 폴더에 넣은 것도 다음에 맞출 때 드러난다.
  fs.writeFileSync(path.join(dir, '새 메모.txt'), '');
  host.refreshIcons();
  assert.ok(state.fences[0].items.some((item) => item.name === '새 메모.txt'), '폴더에 넣은 것이 박스에 없다');

  // 폴더에서 지운 것은 박스에서도 빠진다.
  fs.rmSync(path.join(dir, '사진.png'));
  host.refreshIcons();
  assert.equal(state.fences[0].items.some((item) => item.name === '사진.png'), false);
});

test('포털 박스의 차례는 우리가 적어 둔 대로 둔다', () => {
  const dir = folderWith('a.txt', 'b.txt', 'c.txt');
  const state = baseState({ fences: [fence({ portal: dir })] });
  const { host } = loadHost(state);
  host.openAll();

  // 사람이 순서를 바꿔 두었다.
  const items = state.fences[0].items;
  state.fences[0].items = [items[2], items[0], items[1]];
  host.refreshIcons();
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['c.txt', 'a.txt', 'b.txt']);
});

test('포털에 끌어다 놓으면 그 폴더로 옮겨 간다', async () => {
  const dir = folderWith();
  const room = tempRoot();
  const from = path.join(room, '가져온.txt');
  fs.writeFileSync(from, 'hello');
  const state = baseState({ fences: [fence({ portal: dir })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  await host.dropFiles('a', [from]);

  assert.equal(fs.existsSync(from), false, '온 자리에 파일이 남았다');
  assert.equal(fs.readFileSync(path.join(dir, '가져온.txt'), 'utf8'), 'hello');
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['가져온.txt']);
  // 포털에 든 것은 '담기 전 폴더' 를 적어 두지 않는다. 그 폴더가 제자리이기 때문이다.
  assert.equal(state.fences[0].items[0].home, undefined);
});

test('포털에 같은 이름이 있으면 대체할지 묻는다', async () => {
  const dir = folderWith('겹침.txt');
  fs.writeFileSync(path.join(dir, '겹침.txt'), '먼저');
  const room = tempRoot();
  const from = path.join(room, '겹침.txt');
  fs.writeFileSync(from, '나중');
  const state = baseState({ fences: [fence({ portal: dir })] });
  const { host, electron, asks } = loadHost(state);
  host.openAll();

  electron.setDialogAnswer(1); // 취소
  await host.dropFiles('a', [from]);
  assert.equal(asks.calls.length, 1, '묻지 않고 지나갔다');
  assert.equal(fs.readFileSync(path.join(dir, '겹침.txt'), 'utf8'), '먼저', '취소했는데 바뀌었다');
  assert.equal(fs.existsSync(from), true, '취소했는데 온 자리에서 없어졌다');

  electron.setDialogAnswer(0); // 대체
  await host.dropFiles('a', [from]);
  assert.equal(fs.readFileSync(path.join(dir, '겹침.txt'), 'utf8'), '나중');
  assert.equal(fs.existsSync(from), false);
});

test('포털 박스를 지워도 폴더와 파일은 그대로 남는다', async () => {
  const dir = folderWith('남을것.txt');
  const state = baseState({ fences: [fence({ portal: dir })] });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  electron.setDialogAnswer(0); // 삭제
  await host.removeFence('a');

  assert.equal(state.fences.length, 0, '박스가 사라진다');
  assert.equal(fs.existsSync(dir), true, '비추던 폴더가 사라졌다');
  assert.equal(fs.readFileSync(path.join(dir, '남을것.txt'), 'utf8'), '남을것.txt');
  assert.deepEqual(desktop.calls.homed, [], '남의 폴더 파일을 바탕화면으로 보냈다');
});

test('끝낼 때도 포털의 파일은 옮기지 않는다', () => {
  const dir = folderWith('그대로.txt');
  const state = baseState({ fences: [fence({ portal: dir })] });
  const { host } = loadHost(state);
  host.openAll();
  assert.equal(state.fences[0].items.length, 1);

  host.putBack();

  assert.equal(fs.existsSync(path.join(dir, '그대로.txt')), true, '끝내면서 파일을 옮겼다');
  assert.equal(state.fences[0].items.length, 0, '끝내면 목록은 비운다');
});

test('포털에서 꺼내면 파일이 바탕화면으로 간다', async () => {
  const dir = folderWith('꺼낼것.txt');
  const desk = tempRoot();
  const state = baseState({ fences: [fence({ portal: dir })] });
  const { host, desktop } = loadHost(state);
  desktop.useDesktop(desk);
  host.openAll();

  await host.eject('a', path.join(dir, '꺼낼것.txt'));

  assert.equal(fs.existsSync(path.join(desk, '꺼낼것.txt')), true, '바탕화면으로 가지 않았다');
  assert.equal(fs.existsSync(path.join(dir, '꺼낼것.txt')), false, '폴더에 그대로 남았다');
});

test('폴더를 고르면 그 폴더 이름으로 포털 박스가 생긴다', async () => {
  const dir = folderWith('하나.txt');
  const state = baseState();
  const { host, electron } = loadHost(state);
  host.openAll();

  electron.pickFolder(dir);
  const made = await host.createPortal();

  assert.ok(made, '박스를 만들지 않았다');
  assert.equal(made.portal, dir);
  assert.equal(made.title, path.basename(dir), '폴더 이름을 제목으로 쓰지 않았다');
  assert.deepEqual(made.items.map((item) => item.name), ['하나.txt']);
  assert.equal(fenceWindows(electron).length, 1);
});

test('폴더 고르기를 취소하면 박스를 만들지 않는다', async () => {
  const state = baseState();
  const { host, electron } = loadHost(state);
  host.openAll();

  electron.pickFolder('');
  assert.equal(await host.createPortal(), null);
  assert.equal(state.fences.length, 0);
});

test('담아 둔 박스를 포털로 바꾸면 담긴 것을 먼저 돌려준다', async () => {
  const dir = folderWith('폴더것.txt');
  const desk = tempRoot();
  const held = path.join(desk, '담긴것.txt');
  fs.writeFileSync(held, 'mine');
  const state = baseState({ fences: [fence()] });
  const { host, electron, desktop, asks } = loadHost(state);
  desktop.useDesktop(desk);
  host.openAll();
  await host.dropFiles('a', [held]);
  assert.equal(fs.existsSync(held), false, '담으면 바탕화면에서 빠진다');

  electron.pickFolder(dir);
  electron.setDialogAnswer(0); // 바꾸기
  assert.equal(await host.makePortal('a'), true);

  assert.ok(asks.calls.length >= 1, '담긴 것이 있는데 묻지 않았다');
  assert.equal(state.fences[0].portal, dir);
  assert.equal(fs.existsSync(held), true, '담겨 있던 파일이 바탕화면으로 돌아오지 않았다');
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['폴더것.txt']);
});

test('포털을 그만두면 폴더는 그대로 두고 빈 박스가 된다', async () => {
  const dir = folderWith('남는다.txt');
  const state = baseState({ fences: [fence({ portal: dir })] });
  const { host } = loadHost(state);
  host.openAll();

  assert.equal(await host.dropPortal('a'), true);

  assert.equal(state.fences[0].portal, '');
  assert.deepEqual(state.fences[0].items, []);
  assert.equal(fs.existsSync(path.join(dir, '남는다.txt')), true, '폴더의 파일을 건드렸다');
});

test('박스 메뉴에 포털을 만들고 그만두는 길이 있다', () => {
  const dir = folderWith();
  const state = baseState({ fences: [fence({ portal: dir })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  host.showMenu('a', null);
  const labels = electron.menus.at(-1).map((item) => item.label);
  assert.ok(labels.includes('비출 폴더 바꾸기'), '포털 박스인데 바꾸기가 없다');
  assert.ok(labels.includes('포털 그만두기'), '포털을 그만둘 길이 없다');
  assert.ok(labels.includes('비추는 폴더 열기'), '폴더를 열 길이 없다');

  state.fences[0].portal = '';
  host.showMenu('a', null);
  const plain = electron.menus.at(-1).map((item) => item.label);
  assert.ok(plain.includes('폴더 포털로 바꾸기'));
  assert.equal(plain.includes('포털 그만두기'), false, '보통 박스에 그만두기가 있다');
});
