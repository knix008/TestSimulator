'use strict';

// 바탕화면에 새로 만든 것과 박스에 담긴 것의 이름이 부딪힐 때.
//
// 담긴 파일은 박스 폴더에 있어 탐색기 눈에 보이지 않는다. 그래서 탐색기는
// 같은 이름으로 새 폴더나 새 문서를 아무 말 없이 만들어 버린다.
// 그때 대체할지 그대로 둘지 묻고, 대체하겠다면 박스로 옮겨 담는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadHost, fence, baseState } = require('./helpers/fakes');

function deskDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-desk-'));
}

// 미뤄 둔 물음은 따로 돌아간다. 바라는 모습이 될 때까지 잠깐 기다린다.
async function waitFor(check, what) {
  for (let turn = 0; turn < 60; turn += 1) {
    if (check()) return;
    await new Promise((done) => setTimeout(done, 10));
  }
  assert.fail(what);
}

// 보관함 모듈은 하나뿐이라, 앞 검사의 뒷일이 남아 있으면 다음 검사의 폴더를 건드린다.
// 검사를 끝내기 전에 하던 일이 끝나기를 기다린다.
function settle() {
  return new Promise((done) => setTimeout(done, 40));
}

// 바탕화면 폴더를 가진 박스 하나를 띄우고, 그 안에 파일 하나를 담아 둔다.
async function withHeld(name, text) {
  const desk = deskDir();
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.desktop.useDesktop(desk);
  loaded.host.openAll();

  const onDesk = path.join(desk, name);
  fs.writeFileSync(onDesk, text);
  // 담기 전에 한 번 본다. 이것이 '이미 있던 것' 이 된다.
  loaded.host.refreshIcons();
  await loaded.host.dropFiles('a', [onDesk], 0);

  assert.equal(state.fences[0].items.length, 1, '박스가 하나를 들고 있다');
  assert.equal(fs.existsSync(onDesk), false, '담은 것은 바탕화면에서 빠진다');
  return { ...loaded, desk, state, held: state.fences[0].items[0].path };
}

test('박스에 있는 이름으로 새로 만들면 대체할지 묻는다', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  const again = path.join(room.desk, '메모.txt');
  fs.writeFileSync(again, '새로 만든 것');

  // 0 이 아니면 '아니오'. 무엇을 묻는지만 보고 그대로 둔다.
  room.electron.setDialogAnswer(1);
  room.host.refreshIcons();

  await waitFor(() => room.asks.calls.length > 0, '묻지 않았다');
  await settle();
  const asked = room.asks.calls[0];
  assert.ok(asked.title.includes('메모.txt'), `무엇을 묻는지 이름이 없다: ${asked.title}`);
  assert.ok(asked.detail.includes(room.state.fences[0].title), '어느 박스인지 알려 주지 않는다');
  assert.equal(asked.cancel, '새로 만들기', '그대로 두는 쪽도 고를 수 있다');
});

test('대체하겠다면 새로 만든 것이 박스로 들어가고 있던 것은 휴지통으로 간다', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  const again = path.join(room.desk, '메모.txt');
  fs.writeFileSync(again, '새로 만든 것');

  room.electron.setDialogAnswer(0);
  room.host.refreshIcons();

  await waitFor(() => room.electron.shell.trashed.length > 0, '있던 것이 휴지통으로 가지 않았다');
  assert.deepEqual(room.electron.shell.trashed, [room.held], '박스에 있던 것만 버린다');

  await waitFor(() => room.state.fences[0].items.length === 1, '박스가 비거나 둘이 됐다');
  const now = room.state.fences[0].items[0].path;
  assert.equal(fs.existsSync(now), true, '담긴 파일이 자리에 있다');
  assert.equal(fs.readFileSync(now, 'utf8'), '새로 만든 것', '새로 만든 것이 담겼다');
  assert.equal(fs.existsSync(again), false, '바탕화면에는 남지 않는다');
  await settle();
});

test('다시 만들겠다면 바탕화면에 그대로 두고 박스도 건드리지 않는다', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  const again = path.join(room.desk, '메모.txt');
  fs.writeFileSync(again, '새로 만든 것');

  // 0 이 아니면 '아니오'. 여기서는 '새로 만들기'다.
  room.electron.setDialogAnswer(1);
  room.host.refreshIcons();

  await waitFor(() => room.asks.calls.length > 0, '묻지 않았다');
  await new Promise((done) => setTimeout(done, 30));

  assert.deepEqual(room.electron.shell.trashed, [], '아무것도 버리지 않는다');
  assert.equal(fs.existsSync(again), true, '새로 만든 것은 바탕화면에 남는다');
  assert.deepEqual(room.state.fences[0].items.map((item) => item.path), [room.held], '박스는 그대로다');
  assert.equal(fs.readFileSync(room.held, 'utf8'), '묵은 것');
});

test('한 번 물은 것은 다시 묻지 않는다', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  fs.writeFileSync(path.join(room.desk, '메모.txt'), '새로 만든 것');

  room.electron.setDialogAnswer(1);
  room.host.refreshIcons();
  await waitFor(() => room.asks.calls.length > 0, '묻지 않았다');

  room.host.refreshIcons();
  room.host.refreshIcons();
  await new Promise((done) => setTimeout(done, 30));

  assert.equal(room.asks.calls.length, 1, `${room.asks.calls.length}번 물었다`);
});

test('부딪히는 이름이 없으면 묻지 않는다', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  fs.writeFileSync(path.join(room.desk, '다른 것.txt'), '새로 만든 것');

  room.electron.setDialogAnswer(0);
  room.host.refreshIcons();
  await new Promise((done) => setTimeout(done, 30));

  assert.deepEqual(room.asks.calls, [], '가만히 둬야 할 때 물었다');
  assert.deepEqual(room.electron.shell.trashed, [], '아무것도 버리지 않는다');
});

test('켤 때 바탕화면에 있던 것을 하나씩 묻지 않는다', async () => {
  const desk = deskDir();
  const room = path.join(desk, '메모.txt');
  fs.writeFileSync(room, '처음부터 있던 것');

  const state = baseState({ fences: [fence({ items: [{ name: '메모.txt', path: room }] })] });
  const loaded = loadHost(state);
  loaded.desktop.useDesktop(desk);
  loaded.electron.setDialogAnswer(0);
  loaded.host.openAll();
  await new Promise((done) => setTimeout(done, 30));

  assert.deepEqual(loaded.asks.calls, [], '켜자마자 물었다');
});

test('대체해도 박스 안의 자리는 그대로다', async () => {
  const desk = deskDir();
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.desktop.useDesktop(desk);
  loaded.host.openAll();

  // 셋을 담아 두고 가운데 것을 대체한다.
  const names = ['하나.txt', '둘.txt', '셋.txt'];
  for (const name of names) fs.writeFileSync(path.join(desk, name), name);
  loaded.host.refreshIcons();
  await loaded.host.dropFiles('a', names.map((name) => path.join(desk, name)), 0);
  assert.deepEqual(state.fences[0].items.map((item) => item.name), names, '담은 차례대로 들어간다');

  fs.writeFileSync(path.join(desk, '둘.txt'), '새로 만든 것');
  loaded.electron.setDialogAnswer(0);
  loaded.host.refreshIcons();

  await waitFor(() => loaded.electron.shell.trashed.length > 0, '대체하지 않았다');
  await waitFor(() => state.fences[0].items.length === 3, '박스의 개수가 달라졌다');
  assert.deepEqual(
    state.fences[0].items.map((item) => item.name),
    names,
    '대체한 것이 뒤로 밀려났다'
  );
  const middle = state.fences[0].items[1].path;
  assert.equal(fs.readFileSync(middle, 'utf8'), '새로 만든 것');
  await settle();
});

test('새로 만든 것이 여럿이면 하나씩 차례로 묻는다', async () => {
  const desk = deskDir();
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.desktop.useDesktop(desk);
  loaded.host.openAll();

  const names = ['하나.txt', '둘.txt'];
  for (const name of names) fs.writeFileSync(path.join(desk, name), '묵은 것');
  loaded.host.refreshIcons();
  await loaded.host.dropFiles('a', names.map((name) => path.join(desk, name)), 0);

  for (const name of names) fs.writeFileSync(path.join(desk, name), '새로 만든 것');
  loaded.electron.setDialogAnswer(0);
  loaded.host.refreshIcons();

  await waitFor(() => loaded.asks.calls.length === 2, '둘을 다 묻지 않았다');
  await waitFor(() => loaded.electron.shell.trashed.length === 2, '둘을 다 대체하지 않았다');
  assert.equal(state.fences[0].items.length, 2, '박스에 둘이 남는다');
  for (const item of state.fences[0].items) {
    assert.equal(fs.readFileSync(item.path, 'utf8'), '새로 만든 것');
  }
  // 물은 이름이 서로 다르다. 같은 것을 두 번 묻지 않았다.
  assert.equal(new Set(loaded.asks.calls.map((call) => call.title)).size, 2);
  await settle();
});

test('다른 물음이 떠 있으면 미뤘다가 다음 훑기에 묻는다', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  fs.writeFileSync(path.join(room.desk, '메모.txt'), '새로 만든 것');

  // 박스를 만들지 묻는 창을 띄워 두고 답하지 않는다. 그 동안 다른 물음은 뜨지 않아야 한다.
  let answer = () => {};
  room.asks.hold = new Promise((done) => {
    answer = done;
  });
  const offered = room.host.offerFence({ x: 1200, y: 40, w: 300, h: 240 });
  await waitFor(() => room.asks.calls.length === 1, '박스를 만들지 묻지 않았다');

  // 이 훑기는 묻지 못하고 미뤄 둔다.
  room.host.refreshIcons();
  await new Promise((done) => setTimeout(done, 20));
  assert.equal(room.asks.calls.length, 1, '앞의 물음 위에 또 물었다');

  // 박스는 만들지 않고, 미뤄 둔 것도 '새로 만들기' 로 둔다.
  room.asks.hold = null;
  room.electron.setDialogAnswer(1);
  answer();
  assert.equal(await offered, null, '만들지 않기로 했는데 박스가 생겼다');
  assert.equal(room.state.fences.length, 1);

  room.host.refreshIcons();
  await waitFor(() => room.asks.calls.length === 2, '미뤄 둔 물음이 사라졌다');
  assert.ok(room.asks.calls[1].title.includes('메모.txt'), '미뤄 둔 것을 묻지 않았다');
  await settle();
});

test('휴지통을 담은 박스는 같은 이름의 새 항목과 부딪히지 않는다', async () => {
  // 부딪힘은 파일 이름으로만 본다. 셸 항목의 경로는 'shell:' 접두사가 붙어 있어
  // 어떤 파일 이름과도 같아질 수 없다. 보이는 이름('휴지통')으로 견주면 사람이
  // 바탕화면에 만든 '휴지통' 폴더 때문에 진짜 휴지통을 버리려 들게 된다.
  const desk = deskDir();
  const state = baseState({ fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })] });
  const loaded = loadHost(state);
  loaded.desktop.useDesktop(desk);
  loaded.host.openAll();

  for (const name of ['휴지통', 'RecycleBinFolder', 'shell꞉RecycleBinFolder']) {
    fs.writeFileSync(path.join(desk, name), '새로 만든 것');
  }
  loaded.electron.setDialogAnswer(0);
  loaded.host.refreshIcons();
  await new Promise((done) => setTimeout(done, 30));

  assert.deepEqual(loaded.asks.calls, [], '셸 항목을 두고 물었다');
  assert.deepEqual(loaded.electron.shell.trashed, [], '버릴 수 없는 것을 버리려 들었다');
  assert.equal(state.fences[0].items.length, 1, '박스에 있던 휴지통이 흔들렸다');
  assert.equal(state.fences[0].items[0].path, 'shell:RecycleBinFolder');
});

test('휴지통으로 보내지 못하면 아무것도 바꾸지 않는다', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  const again = path.join(room.desk, '메모.txt');
  fs.writeFileSync(again, '새로 만든 것');
  room.electron.shell.trashItem = async () => {
    throw new Error('휴지통이 막혔다');
  };

  room.electron.setDialogAnswer(0);
  room.host.refreshIcons();

  await waitFor(() => room.asks.calls.length > 0, '묻지 않았다');
  await settle();

  assert.equal(fs.existsSync(again), true, '새로 만든 것이 바탕화면에서 사라졌다');
  assert.deepEqual(room.state.fences[0].items.map((item) => item.path), [room.held], '박스가 흔들렸다');
  assert.equal(fs.readFileSync(room.held, 'utf8'), '묵은 것', '박스에 있던 것이 바뀌었다');
});

test('묻는 사이에 새로 만든 것이 없어지면 박스를 건드리지 않는다', async () => {
  const room = await withHeld('메모.txt', '묵은 것');
  const again = path.join(room.desk, '메모.txt');
  fs.writeFileSync(again, '새로 만든 것');

  // 답을 고르는 사이에 사람이 그것을 지운 경우.
  room.asks.before = () => fs.rmSync(again, { force: true });
  room.electron.setDialogAnswer(0);
  room.host.refreshIcons();

  await waitFor(() => room.asks.calls.length > 0, '묻지 않았다');
  await settle();

  assert.deepEqual(room.electron.shell.trashed, [], '바꿔 놓을 것도 없이 있던 것을 버렸다');
  assert.deepEqual(room.state.fences[0].items.map((item) => item.path), [room.held], '박스가 비었다');
  assert.equal(fs.readFileSync(room.held, 'utf8'), '묵은 것');
});

test('박스에서 꺼낸 것을 두고 다시 묻지 않는다', async () => {
  const room = await withHeld('메모.txt', '묵은 것');

  // 꺼내면 파일이 바탕화면으로 돌아오지만, 그 박스는 이제 들고 있지 않다.
  await room.host.eject('a', room.held);
  await waitFor(() => room.state.fences[0].items.length === 0, '꺼내지지 않았다');
  room.host.refreshIcons();
  await new Promise((done) => setTimeout(done, 30));

  assert.deepEqual(room.asks.calls, [], '제가 돌려준 것을 두고 물었다');
  assert.equal(fs.existsSync(path.join(room.desk, '메모.txt')), true, '꺼낸 것이 바탕화면에 없다');
});

test('Windows 에서는 대소문자가 달라도 같은 이름으로 본다', { skip: process.platform !== 'win32' }, async () => {
  const room = await withHeld('Memo.txt', '묵은 것');
  fs.writeFileSync(path.join(room.desk, 'MEMO.TXT'), '새로 만든 것');

  room.electron.setDialogAnswer(1);
  room.host.refreshIcons();

  await waitFor(() => room.asks.calls.length > 0, '대소문자가 다르다고 그냥 넘어갔다');
  await settle();
});

test('박스 폴더에서 바탕화면으로 옮겨 온 파일을 두고 대체할지 묻지 않는다', async () => {
  const room = await withHeld('메모.txt', '하나뿐인 것');
  const back = path.join(room.desk, '메모.txt');

  // 탐색기로 박스 폴더의 파일을 바탕화면에 끌어다 놓았다. 새로 만든 것이 아니라 옮겨 온 것이고,
  // 세상에 그 파일 하나뿐이다. 박스 목록에는 아직 들고 있는 것으로 적혀 있다.
  fs.renameSync(room.held, back);
  room.host.refreshIcons();
  await settle();

  assert.deepEqual(room.asks.calls, [], '하나뿐인 것을 두고 대체할지 물었다');
  assert.deepEqual(room.state.fences[0].items, [], '없는 파일을 아직 들고 있다');
  assert.equal(fs.existsSync(back), true, '옮겨 온 파일이 없어졌다');

  // 그것을 다시 박스에 담을 때에도 부딪히는 것이 없다.
  await room.host.dropFiles('a', [back], 0);
  await settle();
  assert.deepEqual(room.asks.calls, [], '다시 담을 때 대체할지 물었다');
  assert.equal(room.state.fences[0].items.length, 1, '다시 담기지 않았다');
  assert.equal(fs.readFileSync(room.state.fences[0].items[0].path, 'utf8'), '하나뿐인 것');
});

test('박스가 들고 있다고 적힌 파일이 없어졌으면 새로 만든 것을 두고 묻지 않는다', async () => {
  const room = await withHeld('메모.txt', '묵은 것');

  // 박스 폴더의 파일을 탐색기로 지웠다. 박스 목록만 남아 있다.
  fs.rmSync(room.held);
  fs.writeFileSync(path.join(room.desk, '메모.txt'), '새로 만든 것');
  room.host.refreshIcons();
  await settle();

  assert.deepEqual(room.asks.calls, [], '버릴 것도 없이 대체할지 물었다');
});
