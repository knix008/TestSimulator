'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');

// 없는 파일은 박스에서 저절로 지워지므로 진짜 파일을 두고 쓴다.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-items-'));

function realItem(name) {
  const full = path.join(SANDBOX, name);
  fs.writeFileSync(full, '');
  return { name, path: full };
}

function openOne(extra) {
  const state = baseState({ fences: [fence(extra)] });
  const loaded = loadHost(state);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();
  return loaded;
}

test('숨겨 둔 상태에서 박스를 그리면 다시 보인다', () => {
  const state = baseState({ hidden: true, fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  assert.equal(fenceWindows(electron).length, 1);
  assert.equal(fenceWindows(electron).every((win) => !win.isVisible()), true, '숨김 상태에서는 박스가 보이지 않는다');

  host.finishDraw({ x: 10, y: 10, w: 300, h: 240 });

  assert.equal(state.hidden, false, '박스를 그리면 숨김이 풀린다');
  assert.equal(state.fences.length, 2);
  const shown = fenceWindows(electron);
  assert.equal(shown.length, 2, '새 박스 창이 생긴다');
  assert.equal(shown.every((win) => win.isVisible()), true, '기존 박스도 함께 다시 보인다');
});

test('너무 작게 그리면 박스를 만들지 않고 숨김도 건드리지 않는다', () => {
  const state = baseState({ hidden: true });
  const { host } = loadHost(state);
  assert.equal(host.finishDraw({ x: 0, y: 0, w: 20, h: 20 }), null);
  assert.equal(state.fences.length, 0);
  assert.equal(state.hidden, true);
});

test('숨기면 창이 사라지고 다시 보이면 돌아온다', () => {
  const { host, electron, desktop } = openOne();
  const win = fenceWindows(electron)[0];
  assert.equal(win.isVisible(), true);

  host.toggleHidden();
  assert.equal(win.isVisible(), false);

  host.toggleHidden();
  assert.equal(win.isVisible(), true);
});

test('같은 값으로 숨김을 정하면 아무 일도 하지 않는다', () => {
  const { host, electron } = openOne();
  const win = fenceWindows(electron)[0];
  const before = win.sent.length;
  host.setHidden(false);
  assert.equal(win.sent.length, before);
});

test('숨김이 바뀌면 트레이가 알 수 있게 알려 준다', () => {
  const { host } = openOne();
  let calls = 0;
  host.onChange(() => { calls += 1; });
  host.toggleHidden();
  assert.equal(calls, 1);
  host.toggleHidden();
  assert.equal(calls, 2);
});

// 담는다는 것은 그 파일을 박스의 폴더로 옮긴다는 뜻이다.
// 옮기고 나면 바탕화면 폴더에서 빠지므로 탐색기가 그 아이콘을 더 그리지 않는다.
test('박스에 담으면 파일이 박스 폴더로 옮겨 간다', async () => {
  const one = realItem('into-a.lnk');
  const from = one.path;
  const state = baseState({ fences: [fence({ title: '일감', items: [one] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  const box = state.fences[0];
  assert.equal(fs.existsSync(from), false, '담았는데 파일이 있던 자리에 그대로 있다');
  assert.equal(box.items.length, 1);
  assert.equal(path.dirname(box.items[0].path), path.join(state.settings.root, box.folder), '박스 폴더로 가지 않았다');
  assert.equal(fs.existsSync(box.items[0].path), true, '옮기는 길에 파일이 사라졌다');
  assert.equal(box.items[0].home, path.dirname(from), '담기 전 폴더를 적어 두지 않았다');
});

test('박스 폴더 이름은 박스 이름에서 딴다', () => {
  const state = baseState({ fences: [fence({ title: '보고서 모음', items: [realItem('doc-a.txt')] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  assert.equal(state.fences[0].folder, '보고서 모음');
});

test('폴더 이름으로 쓸 수 없는 글자는 걷어 낸다', () => {
  const state = baseState({ fences: [fence({ title: 'a/b:c*d', items: [realItem('odd-a.txt')] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const box = state.fences[0];
  assert.doesNotMatch(box.folder, /[/\\:*?"<>|]/, '쓸 수 없는 글자가 남았다');
  assert.equal(fs.existsSync(path.join(state.settings.root, box.folder)), true, '그 이름으로 폴더가 생기지 않았다');
});

test('담은 파일을 탐색기에서 지우면 박스에서도 빠진다', () => {
  const one = realItem('gone-a.lnk');
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  fs.rmSync(state.fences[0].items[0].path);
  host.refreshIcons();
  assert.deepEqual(state.fences[0].items, [], '폴더에서 지웠는데 박스에 남아 있다');
});

// 박스가 보여 주는 것은 그 폴더의 내용이다.
test('탐색기에서 박스 폴더에 넣은 파일도 박스에 나타난다', () => {
  const state = baseState({ fences: [fence({ title: '일감', items: [realItem('seed-a.txt')] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  const dir = path.join(state.settings.root, state.fences[0].folder);
  fs.writeFileSync(path.join(dir, '바깥에서.txt'), '');
  host.refreshIcons();

  const names = state.fences[0].items.map((item) => item.name).sort();
  assert.deepEqual(names, ['seed-a.txt', '바깥에서.txt'], '폴더에 넣은 파일이 박스에 안 보인다');
});

test('박스 이름을 바꿔도 폴더와 담긴 파일은 그대로다', () => {
  const one = realItem('rename-a.lnk');
  const state = baseState({ fences: [fence({ title: '처음', items: [one] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const box = state.fences[0];
  const folder = box.folder;
  const kept = box.items[0].path;

  host.rename('a', '나중');
  assert.equal(box.title, '나중');
  assert.equal(box.folder, folder, '이름을 바꿨다고 폴더까지 옮겼다');
  assert.equal(box.items[0].path, kept, '담긴 파일의 자리가 흔들렸다');
  assert.equal(fs.existsSync(kept), true);
});

test('박스를 숨겨도 담긴 파일은 폴더에 그대로 있다', () => {
  const one = realItem('hide-a.lnk');
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const kept = state.fences[0].items[0].path;

  host.toggleHidden();
  assert.equal(fs.existsSync(kept), true, '숨겼다고 파일을 옮기면 안 된다');
  host.toggleHidden();
  assert.equal(state.fences[0].items[0].path, kept);
});

test('바탕화면에서 끈 사각형은 물어본 뒤에 만든다', async () => {
  const state = baseState();
  const { host, electron } = loadHost(state);

  electron.setDialogAnswer(1); // 취소
  assert.equal(await host.offerFence({ x: 10, y: 10, w: 300, h: 240 }), null);
  assert.equal(state.fences.length, 0, '취소하면 만들지 않는다');

  electron.setDialogAnswer(0); // 만들기
  const made = await host.offerFence({ x: 10, y: 10, w: 300, h: 240 });
  assert.ok(made, '만들기를 고르면 박스가 생긴다');
  assert.equal(state.fences.length, 1);
  assert.deepEqual([made.x, made.y], [10, 10]);
});

test('너무 작게 끈 것은 묻지도 않는다', async () => {
  const state = baseState();
  const { host, electron } = loadHost(state);
  electron.setDialogAnswer(0);
  assert.equal(await host.offerFence({ x: 0, y: 0, w: 40, h: 30 }), null);
  assert.equal(state.fences.length, 0);
});

test('숨겨 둔 상태에서 끌어 만들면 다시 보인다', async () => {
  const state = baseState({ hidden: true, fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  electron.setDialogAnswer(0);
  await host.offerFence({ x: 10, y: 10, w: 300, h: 240 });
  assert.equal(state.hidden, false);
});

test('바탕화면을 다루는 앱은 한 번에 하나만 뜬다', () => {
  const desktop = require('../src/main/desktop');
  assert.equal(typeof desktop.claimSingleInstance, 'function', '한 대만 뜨게 하는 장치가 없다');
  // 같은 프로세스에서 두 번 물어도 처음 잡은 쪽은 계속 참이다.
  const first = desktop.claimSingleInstance();
  assert.equal(typeof first, 'boolean');
  assert.equal(desktop.claimSingleInstance(), first);
});

// 휴지통은 파일이 아니라 셸 항목이다. 폴더로 옮길 것이 없으므로 목록에만 담고,
// 바탕화면 쪽 아이콘은 감춘다. 박스 창이 대신 그리므로 두 곳에 겹쳐 보이면 안 된다.
test('휴지통을 담으면 바탕화면에서는 감춘다', () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  assert.deepEqual(desktop.calls.shell.at(-1), ['shell:RecycleBinFolder'], '휴지통을 감추지 않았다');
  assert.deepEqual(state.fences[0].items.map((item) => item.path), ['shell:RecycleBinFolder']);
});

test('담지 않은 셸 항목은 바탕화면에 그대로 둔다', () => {
  const state = baseState({ fences: [fence({ items: [] })] });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  assert.deepEqual(desktop.calls.shell.at(-1), [], '담지도 않은 것을 감췄다');
});

test('박스를 숨기면 휴지통을 바탕화면에 되살린다', () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  host.toggleHidden();
  assert.deepEqual(desktop.calls.shell.at(-1), [], '박스를 숨겼는데 휴지통도 사라진 채로 둔다');
});

test('휴지통을 꺼내면 바탕화면에 되살린다', async () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  await host.eject('a', 'shell:RecycleBinFolder');

  assert.deepEqual(state.fences[0].items, [], '박스에서 빠지지 않았다');
  assert.deepEqual(desktop.calls.shell.at(-1), [], '꺼냈는데 바탕화면에 되살리지 않았다');
});

// 꺼내기는 파일을 담기 전 폴더로 돌려보내는 일이다.
test('박스에서 꺼내면 파일이 담기 전 폴더로 돌아간다', async () => {
  const one = realItem('out-a.lnk');
  const home = path.dirname(one.path);
  const state = baseState({ fences: [fence({ title: '일감', items: [one] })] });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  assert.notEqual(held, one.path, '담기지 않았다');

  await host.eject('a', held);

  assert.deepEqual(state.fences[0].items, [], '박스에서 빠지지 않았다');
  assert.equal(fs.existsSync(held), false, '박스 폴더에 그대로 남았다');
  assert.equal(fs.existsSync(path.join(home, 'out-a.lnk')), true, '담기 전 폴더로 돌아가지 않았다');
  assert.deepEqual(desktop.calls.homed.at(-1), ['out-a.lnk'], '아이콘을 제자리에 놓지 않았다');
});

// 박스를 지우면 안에 든 것이 하나도 빠짐없이 돌아와야 한다.
test('박스를 지우면 담긴 파일이 모두 돌아오고 폴더도 치운다', async () => {
  const items = ['del-a.txt', 'del-b.txt'].map(realItem);
  const home = path.dirname(items[0].path);
  const state = baseState({ fences: [fence({ title: '지울 것', items })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const folder = path.join(state.settings.root, state.fences[0].folder);
  assert.equal(fs.readdirSync(folder).length, 2);

  electron.setDialogAnswer(0); // 삭제
  await host.removeFence('a');

  assert.equal(state.fences.length, 0, '박스가 지워지지 않았다');
  for (const item of items) {
    assert.equal(fs.existsSync(path.join(home, path.basename(item.path))), true, `${item.name} 이 돌아오지 않았다`);
  }
  assert.equal(fs.existsSync(folder), false, '빈 박스 폴더가 남았다');
});

test('박스 지우기를 취소하면 담긴 파일은 그대로다', async () => {
  const one = realItem('keep-a.txt');
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;

  electron.setDialogAnswer(1); // 취소
  await host.removeFence('a');

  assert.equal(state.fences.length, 1);
  assert.equal(fs.existsSync(held), true, '취소했는데 파일을 옮겼다');
});

// 트레이의 '바탕화면으로 모두 돌려주기'. 박스는 남고 안의 것만 비운다.
test('모두 돌려주면 박스는 남고 파일만 바탕화면으로 간다', async () => {
  const items = ['back-a.txt', 'back-b.txt'].map(realItem);
  const home = path.dirname(items[0].path);
  const state = baseState({ fences: [fence({ items: [items[0]] }), fence({ id: 'b', x: 600, items: [items[1]] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  const count = await host.returnAll();

  assert.equal(count, 2, '돌려준 개수가 맞지 않는다');
  assert.equal(state.fences.length, 2, '박스까지 없앴다');
  for (const fenceRow of state.fences) assert.deepEqual(fenceRow.items, []);
  for (const item of items) {
    assert.equal(fs.existsSync(path.join(home, path.basename(item.path))), true, `${item.name} 이 돌아오지 않았다`);
  }
});

// 박스가 깔고 앉은 자리의 아이콘은 밖으로 비켜야 한다. 우선 순위는 박스다.
test('박스 자리의 바탕화면 아이콘을 밀어낸다', () => {
  const state = baseState({ fences: [fence({ x: 100, y: 100, w: 400, h: 300 })] });
  const { host, desktop, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();

  const walls = desktop.calls.nudged.at(-1);
  assert.ok(walls && walls.length === 1, '박스 자리를 알려 주지 않았다');
  assert.deepEqual(
    { x: walls[0].x, y: walls[0].y },
    { x: 100, y: 100 },
    '밀어낼 자리가 박스 자리와 다르다'
  );
});

test('박스를 숨기면 밀어낸 아이콘을 제자리로 돌려준다', () => {
  const state = baseState({ fences: [fence()] });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.toggleHidden();
  assert.deepEqual(desktop.calls.release.at(-1), [], '숨길 때 아이콘을 돌려주지 않았다');
});

// 박스는 칸 경계 가까이에서만 붙는다. 칸의 배수로 묶어 두지는 않는다.
test('칸 경계 가까이에 그린 박스는 딱 맞게 붙는다', () => {
  const state = baseState();
  const { host, desktop } = loadHost(state);
  desktop.useGrid({ x0: 20, y0: 30, dx: 80, dy: 100 });

  const made = host.finishDraw({ x: 105, y: 135, w: 316, h: 292 });

  assert.deepEqual([made.x, made.y], [100, 130], '칸 경계에 붙지 않았다');
  assert.deepEqual([made.w, made.h], [320, 300], '칸에 붙지 않았다');
});

test('칸 사이에 그린 박스는 그린 대로 둔다', () => {
  const state = baseState();
  const { host, desktop } = loadHost(state);
  desktop.useGrid({ x0: 20, y0: 30, dx: 80, dy: 100 });

  const made = host.finishDraw({ x: 140, y: 180, w: 360, h: 340 });

  assert.deepEqual([made.x, made.y, made.w, made.h], [140, 180, 360, 340], '원하는 크기로 만들 수 없다');
});

test('격자를 잴 수 없으면 그린 자리를 그대로 쓴다', () => {
  const state = baseState();
  const { host } = loadHost(state);
  const made = host.finishDraw({ x: 105, y: 135, w: 300, h: 240 });
  assert.deepEqual([made.x, made.y], [105, 135]);
});

// 박스에서 박스로. 파일은 새 박스의 폴더로 가고, 집은 처음 온 자리 그대로다.
test('박스에서 박스로 옮기면 폴더도 따라 바뀐다', async () => {
  const one = realItem('move-a.txt');
  const home = path.dirname(one.path);
  const state = baseState({
    fences: [fence({ id: 'a', title: '첫 박스', items: [one] }), fence({ id: 'b', title: '둘째 박스', x: 700 })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;

  // 둘째 박스 자리에서 손을 뗀 것으로 한다.
  const target = fenceWindows(electron)[1].getBounds();
  await host.transfer('a', held, target.x + 30, target.y + 60);

  assert.deepEqual(state.fences[0].items, [], '첫 박스에서 빠지지 않았다');
  assert.equal(state.fences[1].items.length, 1, '둘째 박스로 가지 않았다');
  const moved = state.fences[1].items[0];
  assert.equal(path.dirname(moved.path), path.join(state.settings.root, state.fences[1].folder));
  assert.equal(fs.existsSync(moved.path), true, '옮기는 길에 파일이 사라졌다');
  assert.equal(fs.existsSync(held), false, '앞 박스 폴더에 그대로 남았다');

  // 꺼내면 앞 박스가 아니라 처음 있던 자리로 간다.
  await host.eject('b', moved.path);
  assert.equal(fs.existsSync(path.join(home, 'move-a.txt')), true, '처음 있던 자리로 돌아가지 않았다');
});

test('박스 밖에 놓으면 바탕화면으로 돌아간다', async () => {
  const one = realItem('outside-a.txt');
  const home = path.dirname(one.path);
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;

  // 박스에서 멀리 떨어진 자리.
  await host.transfer('a', held, 1800, 1000);

  assert.deepEqual(state.fences[0].items, []);
  assert.equal(fs.existsSync(path.join(home, 'outside-a.txt')), true, '바탕화면으로 돌아가지 않았다');
});

test('바탕화면에서 박스로 끌어다 놓으면 담긴다', async () => {
  const one = realItem('indrop-a.txt');
  const state = baseState({ fences: [fence({ title: '받는 박스' })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  const bounds = fenceWindows(electron)[0].getBounds();
  await host.acceptDesktopDrop(one, { x: bounds.x + 20, y: bounds.y + 50 });

  assert.equal(state.fences[0].items.length, 1, '박스에 담기지 않았다');
  assert.equal(fs.existsSync(one.path), false, '바탕화면에 그대로 남았다');
  assert.equal(path.dirname(state.fences[0].items[0].path), path.join(state.settings.root, state.fences[0].folder));
});

// 끄는 동안 아이콘이 눈에서 사라지면 안 된다.
// 커서 아래의 박스는 놓을 자리를 비우고, 박스 밖에서는 따라다니는 창이 그린다.
test('끄는 동안 어느 박스 위인지 알려 준다', () => {
  const one = realItem('drag-a.txt');
  const state = baseState({ fences: [fence({ id: 'a', items: [one] }), fence({ id: 'b', x: 700 })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  host.refreshIcons();
  const held = state.fences[0].items[0].path;
  const [first, second] = fenceWindows(electron);

  const where = second.getBounds();
  host.hover(held, where.x + 40, where.y + 50, 'data:image/png;base64,끌기');

  const toSecond = second.messages('fence:hover').at(-1);
  assert.ok(toSecond, '커서 아래의 박스에 알리지 않았다');
  assert.equal(toSecond.filePath, held);
  assert.equal(first.messages('fence:hover').at(-1), null, '다른 박스의 빈자리를 거두지 않았다');

  // 박스 밖에서는 따라다니는 창이 아이콘을 그린다.
  host.hover(held, 1800, 1000, 'data:image/png;base64,끌기');
  const ghost = electron.windows.find((win) => win.loaded && /ghost\.html$/.test(win.loaded.file));
  assert.ok(ghost, '따라다니는 창이 없다');
  assert.equal(ghost.isVisible(), true, '박스 밖에서 아이콘이 사라졌다');

  host.clearHover();
  assert.equal(ghost.isVisible(), false, '손을 뗐는데 그림이 남았다');
  for (const win of [first, second]) {
    assert.equal(win.messages('fence:hover').at(-1), null, '손을 뗐는데 빈자리가 남았다');
  }
});

// 박스는 사용자가 놓은 자리에 머물러야 한다. 저 혼자 걸어 다니면 안 된다.
test('같은 자리를 되풀이해 놓아도 박스가 흘러가지 않는다', () => {
  const state = baseState({ fences: [fence({ x: 300, y: 200, w: 320, h: 300 })] });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 20, y0: 30, dx: 80, dy: 100 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  const box = state.fences[0];
  host.applyBounds('a', { x: box.x, y: box.y, w: box.w, h: box.h }, true);
  const settled = { x: box.x, y: box.y, w: box.w, h: box.h };

  for (let turn = 0; turn < 6; turn += 1) {
    host.applyBounds('a', { x: box.x, y: box.y, w: box.w, h: box.h }, true);
  }

  assert.deepEqual({ x: box.x, y: box.y, w: box.w, h: box.h }, settled, '박스가 저 혼자 움직였다');
});

// 박스끼리는 겹치지 않는다.
test('다른 박스 위에 놓으면 옆으로 비킨다', () => {
  const state = baseState({
    fences: [
      fence({ id: 'a', x: 500, y: 300, w: 400, h: 400 }),
      fence({ id: 'b', x: 1200, y: 300, w: 300, h: 300 }),
    ],
  });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 0, y0: 0, dx: 80, dy: 100 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  // b 를 a 위에 겹쳐 놓는다.
  host.applyBounds('b', { x: 600, y: 350, w: 300, h: 300 }, true);

  const [a, b] = state.fences;
  const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  assert.equal(overlap, false, `박스가 겹친 채로 놓였다: a=${a.x},${a.y} b=${b.x},${b.y}`);
});

// 켤 때는 박스를 그대로 둔다. 어제 놓아 둔 자리에 오늘도 있어야 한다.
test('켠다고 박스를 옮기지 않는다', () => {
  const state = baseState({ fences: [fence({ x: 613, y: 297, w: 321, h: 243 })] });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  const box = state.fences[0];
  assert.deepEqual([box.x, box.y, box.w, box.h], [613, 297, 321, 243], '켜면서 박스를 손봤다');
});

// 겹친 채로 저장된 박스도 켤 때는 그대로 둔다. 손이 움직였을 때만 비킨다.
test('겹친 채로 저장된 박스를 켤 때 밀어내지 않는다', () => {
  const state = baseState({
    fences: [
      fence({ id: 'a', x: 100, y: 100, w: 400, h: 400 }),
      fence({ id: 'b', x: 200, y: 200, w: 400, h: 400 }),
    ],
  });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  assert.deepEqual([state.fences[1].x, state.fences[1].y], [200, 200], '켜면서 박스를 밀어냈다');
});

test('아이콘이 밀려나도 박스 자리는 흔들리지 않는다', () => {
  const state = baseState({ fences: [fence({ x: 300, y: 200, w: 320, h: 300 })] });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 20, y0: 30, dx: 80, dy: 100 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  const box = state.fences[0];
  host.applyBounds('a', { x: box.x, y: box.y, w: box.w, h: box.h }, true);
  const settled = { x: box.x, y: box.y, w: box.w, h: box.h };

  // 아이콘을 밀어내면서 격자의 '맨 앞 아이콘'이 바뀐 경우를 흉내 낸다.
  // 격자가 흔들리지 않으면 박스도 그대로여야 한다.
  desktop.useGrid({ x0: 100, y0: 130, dx: 80, dy: 100 });
  host.applyBounds('a', { x: box.x, y: box.y, w: box.w, h: box.h }, true);

  assert.deepEqual({ x: box.x, y: box.y, w: box.w, h: box.h }, settled, '격자가 움직이자 박스가 따라갔다');
});

// 박스가 차지한 칸만 비켜 주면 된다. 바탕화면 전체를 다시 정렬하지 않는다.
test('박스 자리만 비우고 나머지 아이콘은 건드리지 않는다', () => {
  const deskgrid = require('../src/shared/deskgrid');
  const area = { x: 0, y: 0, width: 1920, height: 1000 };
  const metrics = { x0: 0, y0: 0, dx: 80, dy: 100, phaseX: 0, phaseY: 0 };
  // 세 줄에 걸친 아이콘 아홉 개.
  const icons = [];
  let n = 0;
  for (let col = 0; col < 3; col += 1) {
    for (let row = 0; row < 3; row += 1) {
      icons.push({ index: n, x: col * 80, y: row * 100 });
      n += 1;
    }
  }
  // 가운데 칸 하나만 덮는 박스.
  const blocks = [{ x: 80, y: 100, width: 80, height: 100 }];
  const moves = deskgrid.relocate(icons, blocks, area, metrics);

  assert.equal(moves.length, 1, '가린 아이콘 하나만 옮겨야 한다');
  assert.equal(moves[0].index, 4, '엉뚱한 아이콘을 옮겼다');
});

// 크기만 바꿨을 때 박스가 옆으로 뛰면 안 된다.
test('크기만 바꾸면 박스 자리는 그대로다', () => {
  const state = baseState({ fences: [fence({ x: 613, y: 297, w: 320, h: 300 })] });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  const box = state.fences[0];
  // 켤 때 한 번 줄을 맞춘 자리에서 시작한다.
  const at = { x: box.x, y: box.y };

  host.applyBounds('a', { x: box.x, y: box.y, w: 420, h: 380 }, true);

  assert.deepEqual({ x: box.x, y: box.y }, at, '크기만 바꿨는데 자리가 움직였다');
  assert.ok(box.w >= 400 && box.h >= 360, `크기가 엉뚱하다: ${box.w}x${box.h}`);
});

// 가장자리에 붙여 놓으면 그대로 붙어 있어야 한다.
test('화면 왼쪽 끝에 붙여 놓으면 되튀지 않는다', () => {
  const state = baseState({ fences: [fence({ x: 600, y: 300, w: 320, h: 300 })] });
  const { host, desktop, electron } = loadHost(state);
  // 아이콘 격자는 화면 끝에서 14px 들어와 시작한다.
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  // 손으로 끌어다 왼쪽 위 끝에 붙인다.
  host.applyBounds('a', { x: 0, y: 0, w: 320, h: 300 }, true);

  const box = state.fences[0];
  assert.deepEqual([box.x, box.y], [0, 0], `가장자리에서 되튀었다: ${box.x},${box.y}`);
});

// 크기를 키우다 옆 박스에 닿으면 자리를 옮기지 말고 닿은 데서 멈춘다.
test('크기를 키워 옆 박스에 닿으면 거기서 멈춘다', () => {
  const state = baseState({
    fences: [
      fence({ id: 'a', x: 200, y: 200, w: 300, h: 300 }),
      fence({ id: 'b', x: 700, y: 200, w: 300, h: 300 }),
    ],
  });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();
  const [a, b] = state.fences;
  const at = { x: a.x, y: a.y };

  // a 를 오른쪽으로 크게 키운다. b 와 겹칠 만큼.
  host.applyBounds('a', { x: a.x, y: a.y, w: 700, h: a.h }, true);

  assert.deepEqual({ x: a.x, y: a.y }, at, '크기를 키웠는데 박스가 옮겨졌다');
  const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  assert.equal(overlap, false, '옆 박스를 덮었다');
  assert.ok(a.x + a.w <= b.x, `옆 박스에 닿은 데서 멈추지 않았다: ${a.x + a.w} > ${b.x}`);
});

// 바탕화면에서는 그림 파일이 미리 보기로 보인다. 박스에서도 같아야 한다.
test('그림 파일은 종류 그림 대신 그림 자체를 보여 준다', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'fences.js'), 'utf8');
  assert.match(source, /const PICTURE = .*png.*jpe\?g/, '그림 파일을 가려내지 않는다');
  assert.match(source, /function pictureOf\(filePath\)[\s\S]*?createFromPath\(filePath\)/, '그림을 읽지 않는다');
  assert.match(source, /function pictureOf\(filePath\)[\s\S]*?resize\(/, '큰 그림을 줄이지 않는다');
  // 셸 그림보다 먼저 본다. 뒤에 두면 종류 그림이 먼저 잡힌다.
  assert.match(
    source,
    /async function iconOf\(filePath\)[\s\S]*?pictureOf\(filePath\)[\s\S]*?desktop\.fileIcon/,
    '종류 그림을 먼저 집는다'
  );
  // 아주 큰 그림까지 읽으면 박스를 그리다 멈춘다.
  assert.match(source, /PICTURE_MAX/, '큰 그림을 가려내지 않는다');
});

// 끌고 가다 다른 박스에 닿으면 거기서 멈춘다. 손을 뗀 뒤에 뛰면 안 된다.
test('끄는 동안 다른 박스를 파고들지 않는다', () => {
  const state = baseState({
    fences: [
      fence({ id: 'a', x: 100, y: 300, w: 200, h: 200 }),
      fence({ id: 'b', x: 500, y: 300, w: 300, h: 300 }),
    ],
  });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  // a 를 b 쪽으로 쭉 끈다(아직 손을 떼지 않았다).
  host.applyBounds('a', { x: 600, y: 300, w: 200, h: 200 }, false);

  const [a, b] = state.fences;
  assert.equal(a.x, 300, `벽에 붙어 멈추지 않았다: ${a.x}`);
  const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  assert.equal(overlap, false, '끄는 동안 박스를 파고들었다');
});

test('손을 떼도 끄는 동안 보이던 자리에 그대로 놓인다', () => {
  const state = baseState({
    fences: [
      fence({ id: 'a', x: 100, y: 300, w: 200, h: 200 }),
      fence({ id: 'b', x: 500, y: 300, w: 300, h: 300 }),
    ],
  });
  const { host, desktop, electron } = loadHost(state);
  desktop.useGrid({ x0: 14, y0: 2, dx: 76, dy: 98 });
  host.openAll();
  for (const win of fenceWindows(electron)) win.ready();

  host.applyBounds('a', { x: 600, y: 300, w: 200, h: 200 }, false);
  const shown = { x: state.fences[0].x, y: state.fences[0].y };
  host.applyBounds('a', { x: 600, y: 300, w: 200, h: 200 }, true);

  const a = state.fences[0];
  assert.ok(Math.abs(a.x - shown.x) <= 2 && Math.abs(a.y - shown.y) <= 2,
    `손을 떼자 박스가 뛰었다: ${shown.x},${shown.y} -> ${a.x},${a.y}`);
});

// 박스 이름과 달리 항목 이름은 박스 폴더 안의 파일 이름을 실제로 바꾸는 일이다.
test('박스에 담긴 항목의 이름을 바꾼다', async () => {
  const state = baseState({ fences: [fence({ title: '일감', items: [realItem('바꿀 것.txt')] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const before = state.fences[0].items[0].path;

  await host.renameItem('a', before, '새 이름.txt');

  const item = state.fences[0].items[0];
  assert.equal(item.name, '새 이름.txt');
  assert.equal(item.path, path.join(path.dirname(before), '새 이름.txt'), '박스 폴더를 벗어났다');
  assert.equal(fs.existsSync(before), false, '예전 이름이 그대로 남아 있다');
  assert.equal(fs.existsSync(item.path), true, '바꾼 이름의 파일이 없다');
});

// 탐색기가 확장자를 감추고 있으면 박스에도 감춘 이름이 적힌다.
// 그 이름을 고쳐 준 것이므로 확장자는 우리가 다시 붙여 준다.
test('확장자를 감춘 항목은 확장자를 그대로 이어 준다', async () => {
  const state = baseState({ fences: [fence({ items: [realItem('바로가기.lnk')] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const before = state.fences[0].items[0].path;

  await host.renameItem('a', before, '새 바로가기');

  assert.equal(state.fences[0].items[0].name, '새 바로가기.lnk', '확장자를 잃었다');
});

test('셸 항목과 쓸 수 없는 이름은 바꾸지 않는다', async () => {
  const bin = { name: '휴지통', path: 'shell:RecycleBinFolder' };
  const state = baseState({ fences: [fence({ items: [realItem('그대로.txt'), bin] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const at = state.fences[0].items.find((item) => item.name === '그대로.txt').path;

  // 폴더를 가리키는 글자가 든 이름, 빈 이름은 받지 않는다.
  await host.renameItem('a', at, 'a/b');
  await host.renameItem('a', at, '   ');
  assert.equal(fs.existsSync(at), true, '쓸 수 없는 이름에 파일을 잃었다');
  assert.equal(state.fences[0].items.find((item) => item.path === at).name, '그대로.txt');

  // 휴지통은 바꿀 파일이 없다.
  await host.renameItem('a', 'shell:RecycleBinFolder', '새 휴지통');
  assert.equal(state.fences[0].items.find((item) => item.path === bin.path).name, '휴지통');
});

test('바꾸려는 이름이 박스에 이미 있으면 대체할지 묻는다', async () => {
  const state = baseState({
    fences: [fence({ items: [realItem('먼저.txt'), realItem('나중.txt')] })],
  });
  const { host, electron, asks } = loadHost(state);
  host.openAll();
  host.refreshIcons();
  const [first, second] = state.fences[0].items.map((item) => item.path);

  // 기본 답은 '아니오'. 그러면 아무것도 바뀌지 않는다.
  await host.renameItem('a', second, '먼저.txt');
  assert.equal(asks.calls.length, 1, '대체할지 묻지 않았다');
  assert.equal(fs.existsSync(second), true, '대체하지 않겠다고 했는데 이름을 바꿨다');
  assert.equal(state.fences[0].items.length, 2);

  electron.setDialogAnswer(0); // 대체를 고른다
  await host.renameItem('a', second, '먼저.txt');
  assert.deepEqual(electron.shell.trashed, [first], '박스에 있던 것을 휴지통으로 보내지 않았다');
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['먼저.txt'], '박스에 둘이 남았다');
});

// 바탕화면에도 박스에도 이름이 같은 항목이 따로 있을 수 있다.
// 담으면 자리가 부딪히므로 몰래 번호를 붙이지 않고 먼저 묻는다.
test('박스에 같은 이름이 있으면 담을 때 대체할지 묻는다', async () => {
  const state = baseState({ fences: [fence({ title: '일감' })] });
  const { host, electron, asks } = loadHost(state);
  host.openAll();
  const mine = path.join(SANDBOX, 'clash-먼저');
  fs.mkdirSync(mine, { recursive: true });
  const first = path.join(mine, '보고서.txt');
  fs.writeFileSync(first, '먼저');

  await host.dropFiles('a', [first], 0);
  assert.equal(asks.calls.length, 0, '부딪힐 것이 없는데 물었다');
  assert.equal(state.fences[0].items.length, 1);

  const other = path.join(SANDBOX, 'clash-나중');
  fs.mkdirSync(other, { recursive: true });
  const second = path.join(other, '보고서.txt');
  fs.writeFileSync(second, '나중');

  await host.dropFiles('a', [second], 0);
  assert.equal(asks.calls.length, 1, '대체할지 묻지 않았다');
  assert.equal(fs.existsSync(second), true, '담지 않겠다고 했는데 파일을 옮겼다');
  assert.equal(state.fences[0].items.length, 1, '묻고 거절했는데 하나 더 담았다');

  electron.setDialogAnswer(0); // 대체를 고른다
  await host.dropFiles('a', [second], 0);
  assert.equal(electron.shell.trashed.length, 1, '박스에 있던 것을 휴지통으로 보내지 않았다');
  assert.equal(fs.existsSync(second), false, '새로 담을 파일이 옮겨 가지 않았다');
  assert.equal(state.fences[0].items.length, 1, '대체했는데 둘이 되었다');
  // 비운 자리의 이름을 그대로 쓴다. 번호를 붙여 몰래 늘리지 않는다.
  assert.equal(state.fences[0].items[0].name, '보고서.txt');
  assert.equal(fs.readFileSync(state.fences[0].items[0].path, 'utf8'), '나중', '담은 것이 새 파일이 아니다');
});
