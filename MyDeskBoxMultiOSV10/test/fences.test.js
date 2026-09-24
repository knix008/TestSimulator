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
  assert.equal(desktop.calls.release.length, 1, '숨기면 바탕화면 아이콘을 되돌린다');

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

test('박스에 담긴 항목은 늘 바탕화면에서 치운다', () => {
  const one = realItem('gather-a.lnk');
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host, desktop } = loadHost(state);
  host.openAll();

  assert.equal(desktop.calls.gather.length >= 1, true, '박스를 열면 곧바로 거둔다');
  assert.deepEqual(desktop.calls.gather.at(-1), [one.path]);
  assert.equal(desktop.calls.release.length, 0, '보이는 동안에는 되돌리지 않는다');
});

test('박스를 숨기면 항목이 바탕화면으로 돌아간다', () => {
  const one = realItem('hide-a.lnk');
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host, desktop } = loadHost(state);
  host.openAll();

  host.toggleHidden();
  assert.deepEqual(desktop.calls.release.at(-1), [one.path]);

  host.toggleHidden();
  assert.deepEqual(desktop.calls.gather.at(-1), [one.path], '다시 보이면 또 거둔다');
});

test('여러 박스의 항목을 한꺼번에 거둔다', () => {
  const one = realItem('both-a.lnk');
  const two = realItem('both-b.lnk');
  const state = baseState({
    fences: [fence({ id: 'a', items: [one] }), fence({ id: 'b', items: [two] })],
  });
  const { host, desktop } = loadHost(state);
  host.openAll();
  assert.deepEqual(desktop.calls.gather.at(-1).sort(), [one.path, two.path].sort());
});

test('박스가 차지한 자리를 바탕화면 쪽에 알려 준다', () => {
  const state = baseState({ fences: [fence({ id: 'a', x: 100, y: 200, w: 300, h: 240 })] });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  const blocks = desktop.calls.blocks.at(-1);
  assert.equal(blocks.length, 1, '박스 자리를 하나 넘긴다');
  assert.deepEqual(blocks[0], { x: 100, y: 200, width: 300, height: 240 });
});

test('숨긴 동안에는 자리를 차지하지 않는다', () => {
  const state = baseState({ fences: [fence()] });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.toggleHidden();
  host.toggleHidden();
  assert.equal(desktop.calls.blocks.at(-1).length, 1);

  host.toggleHidden();
  assert.equal(desktop.calls.release.length >= 1, true, '숨기면 아이콘을 되돌린다');
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
