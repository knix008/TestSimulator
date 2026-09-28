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

// 담는다는 것은 그 아이콘을 박스 자리로 모은다는 뜻이다.
// 파일은 옮기지도, 감추지도 않는다. 바탕화면 폴더의 내용은 그대로여야 한다.
test('박스에 담아도 파일은 있던 자리에 그대로 있다', () => {
  const one = realItem('into-a.lnk');
  const from = one.path;
  const state = baseState({ fences: [fence({ title: '일감', items: [one] })] });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  const box = state.fences[0];
  assert.equal(fs.existsSync(from), true, '파일이 제자리에서 사라졌다');
  assert.equal(box.items[0].path, from, '박스가 딴 자리를 가리킨다');
  assert.equal(desktop.calls.hidden.length, 0, '파일을 감췄다');
  // 아이콘 자리만 바꾼다. 그 일은 layoutGroups 가 한다.
  assert.equal(desktop.calls.grouped.length > 0, true, '아이콘을 박스 자리로 모으지 않았다');
  const last = desktop.calls.grouped.at(-1);
  assert.deepEqual(last.map((group) => group.names), [['into-a.lnk']]);
});

test('바탕화면에서 사라진 항목은 박스에서도 빠진다', () => {
  const one = realItem('gone-a.lnk');
  const state = baseState({ fences: [fence({ items: [one] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  fs.rmSync(one.path);
  host.refreshIcons();
  assert.deepEqual(state.fences[0].items, [], '바탕화면에서 지웠는데 박스에 남아 있다');
});

test('박스 이름을 바꿔도 담긴 것은 그대로다', () => {
  const one = realItem('rename-a.lnk');
  const state = baseState({ fences: [fence({ title: '처음', items: [one] })] });
  const { host } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  host.rename('a', '나중');
  const box = state.fences[0];
  assert.equal(box.title, '나중');
  assert.equal(box.items[0].path, one.path, '이름을 바꿨다고 파일이 움직였다');
  assert.equal(fs.existsSync(one.path), true);
});

test('박스를 숨겨도 담긴 파일은 그대로 있다', () => {
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

// 휴지통도 바탕화면 목록에 든 아이콘이다. 다른 것처럼 박스 자리로 모으면 된다.
// 레지스트리로 감추면 탐색기에서도 사라지므로 그렇게 하지 않는다.
test('셸 항목도 감추지 않고 박스 자리로 모은다', () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  assert.deepEqual(desktop.calls.shell.at(-1), [], '셸 아이콘을 감추라고 알렸다');
  assert.deepEqual(desktop.calls.grouped.at(-1).map((group) => group.names), [['휴지통']]);
});

// 꺼내기는 그 아이콘을 박스 밖 원래 자리로 돌려놓는 일이다. 파일은 움직이지 않는다.
test('박스에서 꺼내면 아이콘만 제자리로 돌아간다', async () => {
  const one = realItem('out-a.lnk');
  const state = baseState({ fences: [fence({ title: '일감', items: [one] })] });
  const { host, desktop } = loadHost(state);
  host.openAll();
  host.refreshIcons();

  await host.eject('a', one.path);

  assert.deepEqual(state.fences[0].items, [], '박스에서 빠지지 않았다');
  assert.equal(fs.existsSync(one.path), true, '파일이 움직였다');
  assert.deepEqual(desktop.calls.homed.at(-1), ['out-a.lnk'], '제자리로 돌려놓지 않았다');
});
