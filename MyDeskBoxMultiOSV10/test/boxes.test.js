'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');
const { THEMES, DEFAULT_THEME } = require('../src/main/themes');

test('박스는 여러 개를 만들 수 있고 저마다 창을 가진다', () => {
  const state = baseState();
  const { host, electron } = loadHost(state);
  host.openAll();

  const first = host.finishDraw({ x: 10, y: 10, w: 300, h: 240 });
  const second = host.finishDraw({ x: 400, y: 20, w: 260, h: 200 });
  const third = host.finishDraw({ x: 80, y: 400, w: 320, h: 280 });

  assert.equal(state.fences.length, 3);
  const ids = new Set([first.id, second.id, third.id]);
  assert.equal(ids.size, 3, '박스마다 다른 이름표를 갖는다');
  assert.equal(fenceWindows(electron).length, 3, '박스마다 창이 하나씩 열린다');

  const titles = state.fences.map((entry) => entry.title);
  assert.equal(new Set(titles).size, 3, `제목이 겹친다: ${titles.join(', ')}`);

  // 자리도 그린 그대로다.
  assert.deepEqual(
    state.fences.map((entry) => [entry.x, entry.y]),
    [[10, 10], [400, 20], [80, 400]]
  );
});

test('박스를 지우면 안에 있던 항목이 바탕화면으로 돌아간다', async () => {
  const items = [
    { name: 'a.lnk', path: 'C:/Desktop/a.lnk' },
    { name: 'b.lnk', path: 'C:/Desktop/b.lnk' },
  ];
  const state = baseState({ fences: [fence({ items })] });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  electron.setDialogAnswer(0); // 삭제를 고른다
  await host.removeFence('a');

  assert.equal(state.fences.length, 0, '박스가 사라진다');
  assert.deepEqual(
    desktop.calls.moved.map((entry) => entry.path).sort(),
    ['C:/Desktop/a.lnk', 'C:/Desktop/b.lnk'],
    '들어 있던 항목을 모두 바탕화면으로 돌려보낸다'
  );
  for (const move of desktop.calls.moved) {
    assert.equal(move.point, null, '원래 있던 자리로 돌려보낸다');
  }
  assert.equal(fenceWindows(electron)[0].isDestroyed(), true, '창도 닫는다');
});

test('삭제를 취소하면 박스도 항목도 그대로다', async () => {
  const items = [{ name: 'a.lnk', path: 'C:/Desktop/a.lnk' }];
  const state = baseState({ fences: [fence({ items })] });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();

  electron.setDialogAnswer(1); // 취소
  await host.removeFence('a');

  assert.equal(state.fences.length, 1);
  assert.equal(desktop.calls.moved.length, 0);
});

test('박스마다 테마를 따로 정할 수 있다', async () => {
  const state = baseState({ fences: [fence({ id: 'a' }), fence({ id: 'b' })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  host.restyle('a', { theme: 'sunset' });
  host.restyle('b', { theme: 'night' });

  assert.equal(state.fences[0].theme, 'sunset');
  assert.equal(state.fences[1].theme, 'night');

  // 화면에도 고른 테마의 색이 그대로 전달된다.
  await host.push('a');
  const sent = fenceWindows(electron)[0].messages('fence:state').at(-1);
  assert.equal(sent.theme.id, 'sunset');
  assert.equal(sent.theme.bg, THEMES.find((t) => t.id === 'sunset').bg);
});

test('모르는 테마를 주면 기본 테마로 둔다', () => {
  const state = baseState({ fences: [fence()] });
  const { host } = loadHost(state);
  host.restyle('a', { theme: '없는테마' });
  assert.equal(state.fences[0].theme, DEFAULT_THEME);
});

test('투명도는 너무 흐리거나 너무 진해지지 않는다', () => {
  const state = baseState({ fences: [fence()] });
  const { host } = loadHost(state);
  host.restyle('a', { opacity: 5 });
  assert.ok(state.fences[0].opacity <= 0.9);
  host.restyle('a', { opacity: -1 });
  assert.ok(state.fences[0].opacity >= 0.15);
});

test('삭제는 우리 창으로 묻고, 되돌릴 수 없는 일이라 빨갛게 보여 준다', async () => {
  const state = baseState({ fences: [fence({ title: '일감' })] });
  const { host, electron, asks } = loadHost(state);
  host.openAll();

  electron.setDialogAnswer(0);
  await host.removeFence('a');

  const asked = asks.calls.at(-1);
  assert.ok(asked, '묻는 창을 띄운다');
  assert.match(asked.title, /일감/, '어느 박스인지 알려 준다');
  assert.ok(asked.detail, '무슨 일이 일어나는지 알려 준다');
  assert.equal(asked.danger, true, '되돌릴 수 없는 일임을 표시한다');
  assert.ok(asked.icon, '그림도 함께 보여 준다');
  assert.ok(asked.confirm && asked.cancel, '두 단추의 글이 있다');
});

test('박스 만들기도 우리 창으로 묻는다', async () => {
  const state = baseState();
  const { host, electron, asks } = loadHost(state);
  electron.setDialogAnswer(0);
  await host.offerFence({ x: 0, y: 0, w: 300, h: 240 });

  const asked = asks.calls.at(-1);
  assert.ok(asked);
  assert.notEqual(asked.danger, true, '만드는 일은 위험하지 않다');
  assert.ok(asked.icon);
});

test('묻는 창의 글은 고른 언어를 따른다', async () => {
  const state = baseState({ settings: { lang: 'en', openAtLogin: false, theme: 'ocean', opacity: 0.52 } });
  const { host, electron, asks } = loadHost(state);
  electron.setDialogAnswer(1);
  await host.offerFence({ x: 0, y: 0, w: 300, h: 240 });
  assert.equal(asks.calls.at(-1).confirm, 'Create');
  assert.equal(asks.calls.at(-1).cancel, 'Cancel');
});

test('다른 박스 위로 끌 때도 아이콘이 계속 보인다', () => {
  const one = { name: 'a.lnk', path: 'C:/Desktop/a.lnk' };
  const state = baseState({
    fences: [
      fence({ id: 'a', x: 0, y: 0, w: 300, h: 240, items: [one] }),
      fence({ id: 'b', x: 400, y: 0, w: 300, h: 240 }),
    ],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  const ghost = electron.windows.find((win) => win.loaded && /ghost\.html$/.test(win.loaded.file));
  assert.ok(ghost, '따라다니는 그림 창이 있다');

  // 원래 박스 위: 그 박스가 직접 그리므로 따라다니는 그림은 숨는다
  host.hover(one.path, 100, 100, 'data:image/png;base64,x');
  assert.equal(ghost.isVisible(), false);

  // 다른 박스 위: 따라다니는 그림이 계속 보여야 한다
  host.hover(one.path, 500, 100, 'data:image/png;base64,x');
  assert.equal(ghost.isVisible(), true, '다른 박스 위에서 아이콘이 사라졌다');

  // 바탕화면 위에서도 보인다
  host.hover(one.path, 900, 600, 'data:image/png;base64,x');
  assert.equal(ghost.isVisible(), true);
});

test('바탕화면에서 끌어 온 휴지통은 그 박스에 담긴다', async () => {
  const state = baseState({ fences: [fence({ x: 100, y: 100, w: 400, h: 300 })] });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  await host.acceptDesktopDrop(
    { name: '휴지통', path: 'shell:RecycleBinFolder' },
    { x: 180, y: 180 }
  );

  assert.deepEqual(
    state.fences[0].items.map((item) => item.path),
    ['shell:RecycleBinFolder']
  );
  assert.ok(
    desktop.calls.gather.at(-1).includes('shell:RecycleBinFolder'),
    '담은 뒤 바탕화면에서 휴지통을 거둔다'
  );
});

test('박스 밖에 놓은 휴지통은 담지 않는다', async () => {
  const state = baseState({ fences: [fence({ x: 100, y: 100, w: 200, h: 160 })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  await host.acceptDesktopDrop(
    { name: '휴지통', path: 'shell:RecycleBinFolder' },
    { x: 900, y: 900 }
  );

  assert.equal(state.fences[0].items.length, 0);
});

test('휴지통처럼 끌어 넣을 수 없는 항목은 메뉴로 담는다', async () => {
  const state = baseState({ fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  host.showMenu('a', null);
  const template = electron.menus.at(-1);
  const special = template.find((item) => item.label === '바탕화면 항목 담기');
  assert.ok(special, '메뉴에 바탕화면 항목 담기가 있다');
  assert.ok(special.icon, '머리 항목에 그림이 있다');

  const bin = special.submenu.find((item) => item.label === '휴지통');
  assert.ok(bin, '휴지통이 목록에 있다');
  assert.ok(bin.icon, '휴지통에도 그림이 있다');

  await bin.click();
  assert.deepEqual(
    state.fences[0].items.map((item) => item.path),
    ['shell:RecycleBinFolder'],
    '고르면 박스에 담긴다'
  );
});

test('이미 담은 바탕화면 항목은 메뉴에 다시 나오지 않는다', () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  host.showMenu('a', null);
  const special = electron.menus.at(-1).find((item) => item.label === '바탕화면 항목 담기');
  assert.equal(special, undefined, '담을 것이 없으면 메뉴도 나오지 않는다');
});

test('셸 항목은 파일이 없다고 지워지지 않는다', async () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  await host.push('a');
  assert.equal(state.fences[0].items.length, 1, '셸 항목이 살아남는다');
});
