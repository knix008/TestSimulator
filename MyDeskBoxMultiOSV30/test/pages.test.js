'use strict';

// 바탕화면 페이지와 배치 스냅샷.
//
// 페이지를 가는 것은 **보는 것을 바꾸는 일**이고, 파일을 옮기는 일이 아니다.
// 다른 페이지로 넘긴 박스는 창이 닫히지만 담긴 파일은 제 폴더에 그대로 있어야 한다.
// 스냅샷도 마찬가지로 자리와 모습만 적는다. 담긴 것은 적지 않는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');
const snaps = require('../src/shared/snaps');

function twoBoxes() {
  return baseState({
    fences: [
      fence({ id: 'one', title: '하나', x: 100, y: 100 }),
      fence({ id: 'two', title: '둘', x: 700, y: 100 }),
    ],
  });
}

// 지금 화면에 살아 있는 박스 창의 개수.
function openCount(electron) {
  return fenceWindows(electron).filter((win) => !win.isDestroyed()).length;
}

// ── 페이지 ────────────────────────────────────────────────────────────────

test('저장한 적이 없으면 페이지는 하나뿐이다', () => {
  const state = twoBoxes();
  const { host, electron } = loadHost(state);
  host.openAll();

  assert.equal(state.pages.length, 1);
  assert.equal(state.page, state.pages[0].id);
  assert.equal(openCount(electron), 2, '한 페이지의 박스는 모두 보인다');
  assert.equal(host.pageLabel(state.pages[0]), '첫 페이지');
});

test('페이지를 더하면 그 페이지로 가고 앞 페이지의 박스는 창을 닫는다', () => {
  const state = twoBoxes();
  const { host, electron } = loadHost(state);
  host.openAll();
  const first = state.page;

  const next = host.addPage('일감');

  assert.equal(state.pages.length, 2);
  assert.equal(state.page, next, '만든 페이지로 가지 않았다');
  assert.equal(openCount(electron), 0, '다른 페이지의 박스 창이 남아 있다');
  // 박스와 담긴 것은 그대로 있다. 창만 닫힌 것이다.
  assert.equal(state.fences.length, 2);
  assert.deepEqual(state.fences.map((one) => one.page), [first, first]);

  host.showPage(first);
  assert.equal(openCount(electron), 2, '돌아왔는데 박스가 없다');
});

test('페이지 이름을 붙이면 그 이름으로 부른다', () => {
  const state = twoBoxes();
  const { host } = loadHost(state);
  host.openAll();
  const next = host.addPage('');

  assert.equal(host.pageLabel(state.pages[1]), '페이지 2', '이름이 없으면 차례로 부른다');
  host.renamePage(next, '놀이');
  assert.equal(host.pageLabel(state.pages[1]), '놀이');
});

test('박스를 다른 페이지로 옮기면 그 페이지에서만 보인다', () => {
  const state = twoBoxes();
  const { host, electron } = loadHost(state);
  host.openAll();
  const first = state.page;
  const next = host.addPage('둘째');
  host.showPage(first);
  assert.equal(openCount(electron), 2);

  assert.equal(host.movePage('two', next), true);

  assert.equal(state.fences[1].page, next);
  assert.equal(openCount(electron), 1, '옮긴 박스의 창이 남아 있다');
  host.showPage(next);
  const shown = fenceWindows(electron).filter((win) => !win.isDestroyed());
  assert.equal(shown.length, 1);
  assert.match(shown[0].loaded.opts.query.id, /two/);
});

test('다른 페이지의 박스는 아이콘을 밀어내지 않는다', () => {
  const state = twoBoxes();
  const { host, desktop } = loadHost(state);
  host.openAll();
  for (const win of []) win.ready();
  host.refreshIcons();
  assert.equal(desktop.calls.nudged.at(-1).length, 2, '두 박스 자리를 비켜 주어야 한다');

  const next = host.addPage('빈 페이지');
  host.refreshIcons();
  assert.deepEqual(desktop.calls.nudged.at(-1), [], '빈 페이지인데 아이콘을 밀어냈다');

  host.movePage('one', next);
  host.refreshIcons();
  assert.equal(desktop.calls.nudged.at(-1).length, 1);
});

test('다른 페이지로 넘긴 박스의 파일은 그대로 있다', async () => {
  const desk = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-pages-'));
  const onDesk = path.join(desk, '담긴것.txt');
  fs.writeFileSync(onDesk, 'mine');
  const state = baseState({ fences: [fence()] });
  const { host, desktop } = loadHost(state);
  desktop.useDesktop(desk);
  host.openAll();
  host.refreshIcons();
  await host.dropFiles('a', [onDesk]);
  const held = state.fences[0].items[0].path;

  const next = host.addPage('다른 곳');
  host.movePage('a', next);

  assert.equal(state.fences[0].items.length, 1, '페이지를 옮기면서 목록이 비었다');
  assert.equal(fs.existsSync(held), true, '페이지를 옮기면서 파일을 잃었다');
  assert.equal(fs.existsSync(onDesk), false, '페이지를 옮기면서 파일이 바탕화면으로 갔다');
});

test('페이지를 지우면 그 박스는 첫 페이지로 온다', () => {
  const state = twoBoxes();
  const { host, electron } = loadHost(state);
  host.openAll();
  const first = state.page;
  const next = host.addPage('잠깐');
  host.movePage('two', next);

  assert.equal(host.removePage(next), true);

  assert.equal(state.pages.length, 1);
  assert.equal(state.page, first, '지운 페이지를 보고 있다');
  assert.deepEqual(state.fences.map((one) => one.page), [first, first]);
  assert.equal(state.fences.length, 2, '박스를 말없이 지웠다');
  assert.equal(openCount(electron), 2);
});

test('페이지가 하나뿐이면 지울 수 없다', () => {
  const state = twoBoxes();
  const { host } = loadHost(state);
  host.openAll();
  assert.equal(host.removePage(state.page), false);
  assert.equal(state.pages.length, 1);
});

test('없어진 페이지를 가리키는 박스는 첫 페이지로 데려온다', () => {
  const state = twoBoxes();
  state.fences[1].page = '없는페이지';
  const { host, electron } = loadHost(state);
  host.openAll();

  assert.equal(state.fences[1].page, state.pages[0].id);
  assert.equal(openCount(electron), 2, '보이지 않는 박스가 남았다');
});

test('트레이 메뉴에서 페이지를 갈 수 있다', () => {
  const state = twoBoxes();
  const { host, electron, installTray } = loadHost(state);
  host.openAll();
  host.addPage('둘째');
  installTray();

  const pages = electron.menus.at(-1).find((item) => item.label === '페이지');
  assert.ok(pages && Array.isArray(pages.submenu), '트레이에 페이지 메뉴가 없다');
  const rows = pages.submenu.filter((item) => item.type === 'radio');
  assert.deepEqual(rows.map((item) => item.label), ['첫 페이지', '둘째']);
  assert.equal(rows[1].checked, true, '지금 보는 페이지에 표시가 없다');

  rows[0].click();
  assert.equal(state.page, state.pages[0].id);
});

// ── 스냅샷 ────────────────────────────────────────────────────────────────

test('스냅샷은 자리와 모습만 적고 담긴 것은 적지 않는다', () => {
  const state = baseState({ fences: [fence({ items: [{ name: 'a.txt', path: 'C:/x/a.txt' }] })] });
  const snap = snaps.capture(state, '처음', 1000);

  assert.equal(snap.boxes.length, 1);
  assert.equal(snap.boxes[0].items, undefined, '담긴 것을 적었다');
  assert.equal(snap.boxes[0].folder, undefined, '박스 폴더를 적었다');
  assert.deepEqual(
    [snap.boxes[0].x, snap.boxes[0].y, snap.boxes[0].w, snap.boxes[0].h],
    [100, 100, 400, 300]
  );
  assert.equal(snap.name, '처음');
  assert.equal(snap.at, 1000);
});

test('스냅샷으로 되돌리면 자리와 크기가 그대로 돌아온다', async () => {
  const state = baseState({ fences: [fence({ id: 'a', x: 100, y: 100, w: 400, h: 300 })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  const id = host.saveSnap('처음 자리');
  assert.equal(state.snaps.length, 1);

  host.applyBounds('a', { x: 800, y: 500, w: 260, h: 200 }, true);
  assert.deepEqual([state.fences[0].x, state.fences[0].y], [800, 500]);

  assert.equal(await host.applySnap(id), 1);

  assert.deepEqual(
    [state.fences[0].x, state.fences[0].y, state.fences[0].w, state.fences[0].h],
    [100, 100, 400, 300]
  );
  const win = fenceWindows(electron).find((one) => !one.isDestroyed());
  assert.deepEqual([win.bounds.x, win.bounds.y], [100, 100], '창이 따라오지 않았다');
});

test('되돌려도 담긴 파일은 건드리지 않는다', async () => {
  const desk = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-snap-'));
  const onDesk = path.join(desk, '메모.txt');
  fs.writeFileSync(onDesk, 'x');
  const state = baseState({ fences: [fence()] });
  const { host, desktop } = loadHost(state);
  desktop.useDesktop(desk);
  host.openAll();

  const id = host.saveSnap('빈 박스일 때');
  host.refreshIcons();
  await host.dropFiles('a', [onDesk]);
  const held = state.fences[0].items[0].path;

  await host.applySnap(id);

  assert.equal(state.fences[0].items.length, 1, '되돌리면서 목록을 비웠다');
  assert.equal(fs.existsSync(held), true, '되돌리면서 파일을 옮겼다');
});

test('스냅샷을 찍은 뒤에 만든 박스는 건드리지 않는다', async () => {
  const state = baseState({ fences: [fence({ id: 'a' })] });
  const { host } = loadHost(state);
  host.openAll();
  const id = host.saveSnap('하나일 때');

  const made = host.finishDraw({ x: 900, y: 40, w: 300, h: 240 });
  assert.equal(await host.applySnap(id), 1, '적어 둔 박스만 되돌려야 한다');
  assert.deepEqual([made.x, made.y], [900, 40], '뒤에 만든 박스를 건드렸다');
});

test('이름을 붙이지 않은 스냅샷은 적어 둔 때로 부른다', () => {
  const state = baseState({ fences: [fence()] });
  const { host } = loadHost(state);
  host.openAll();

  host.saveSnap('');
  assert.match(state.snaps[0].name, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test('스냅샷은 스무 개까지 두고 오래된 것부터 버린다', () => {
  const state = baseState({ fences: [fence()] });
  const { host } = loadHost(state);
  host.openAll();

  for (let n = 0; n < 23; n += 1) host.saveSnap(`저장 ${n}`);

  assert.equal(state.snaps.length, 20);
  assert.equal(state.snaps[0].name, '저장 22', '새 것이 위에 오지 않았다');
  assert.equal(state.snaps.at(-1).name, '저장 3', '오래된 것을 버리지 않았다');
});

test('스냅샷을 지운다', () => {
  const state = baseState({ fences: [fence()] });
  const { host } = loadHost(state);
  host.openAll();
  const id = host.saveSnap('하나');

  assert.equal(host.removeSnap(id), true);
  assert.deepEqual(state.snaps, []);
  assert.equal(host.removeSnap(id), false);
});

test('스냅샷이 쓰던 페이지가 없어졌으면 다시 만들어 둔다', () => {
  const state = baseState({ fences: [fence({ id: 'a' })] });
  const snap = snaps.normalizeSnap({
    id: 's1',
    name: '옛것',
    at: 1,
    page: 'gone',
    pages: [{ id: 'gone', name: '없어진 페이지' }],
    boxes: [{ id: 'a', x: 50, y: 60, w: 300, h: 200, page: 'gone' }],
  });
  snaps.apply(state, snap);

  assert.ok(state.pages.some((page) => page.id === 'gone'), '페이지를 다시 만들지 않았다');
  assert.equal(state.page, 'gone');
  assert.equal(state.fences[0].page, 'gone');
});
