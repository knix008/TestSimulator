'use strict';

// 박스마다의 꾸미기.
//
// 테마는 바탕과 제목 줄의 색을 정한다. 그 위에 박스마다 글씨 색과 아이콘 크기를
// 따로 정할 수 있다. **적지 않은 값은 테마가 정한 대로**여야 한다. 그래야 테마를
// 바꾸면 따라 바뀌고, 박스마다 모든 값을 적어 두지 않아도 된다.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');
const themes = require('../src/main/themes');
const arrange = require('../src/shared/arrange');

// 창에 보낸 마지막 그림 값. 창이 요청할 때 보내는 것이라 검사에서 직접 부른다.
async function shown(host, electron, id = 'a') {
  await host.push(id);
  const win = fenceWindows(electron).at(-1);
  return win.messages('fence:state').at(-1);
}

test('적지 않은 글씨 색은 테마가 고른 색이 된다', async () => {
  const light = themes.THEMES.find((theme) => theme.text !== '#ffffff');
  const state = baseState({ fences: [fence({ theme: light.id })] });
  const { host, electron } = loadHost(state);
  host.openAll();

  const look = (await shown(host, electron)).look;
  assert.equal(look.text, light.text, '밝은 테마인데 글씨가 테마 색이 아니다');
  assert.equal(look.bar, light.text);
  assert.deepEqual(state.fences[0].look, themes.LOOK, '아무것도 적지 않았는데 값이 적혀 있다');
});

test('박스마다 이름 색과 제목 색을 따로 정한다', async () => {
  const state = baseState({ fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();

  host.changeBox('a', { look: { text: '#ff0000' } });
  assert.equal(state.fences[0].look.text, '#ff0000');
  // 한쪽만 정했으면 다른 쪽은 그대로 테마를 따른다.
  assert.equal(state.fences[0].look.bar, '');
  assert.equal((await shown(host, electron)).look.bar, themes.resolve(state.fences[0]).text);

  host.changeBox('a', { look: { bar: '#00ff00' } });
  assert.deepEqual(
    [state.fences[0].look.text, state.fences[0].look.bar],
    ['#ff0000', '#00ff00'],
    '뒤에 정한 것이 앞에 정한 것을 지웠다'
  );

  // 빈 글자를 보내면 다시 테마가 고른 색으로 돌아간다.
  host.changeBox('a', { look: { text: '', bar: '' } });
  assert.deepEqual([state.fences[0].look.text, state.fences[0].look.bar], ['', '']);
  assert.equal((await shown(host, electron)).look.text, themes.resolve(state.fences[0]).text);
});

test('색이 아닌 값은 받지 않는다', () => {
  const state = baseState({ fences: [fence()] });
  const { host } = loadHost(state);
  host.openAll();

  host.changeBox('a', { look: { text: '빨강', bar: '#12' } });
  assert.deepEqual([state.fences[0].look.text, state.fences[0].look.bar], ['', '']);
});

test('아이콘을 키우면 칸도 함께 커진다', async () => {
  const state = baseState({ fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();

  // 적어 두지 않으면 기본 크기다.
  assert.deepEqual(arrange.cellOf(state.fences[0].look), { w: arrange.CELL_W, h: arrange.CELL_H });

  host.changeBox('a', { look: { icon: 64 } });

  assert.equal(state.fences[0].look.icon, 64);
  const grid = arrange.gridOf(400, 300, false, state.fences[0].look);
  assert.equal(grid.icon, 64);
  assert.equal(grid.cellW, 64 + (arrange.CELL_W - arrange.ICON));
  assert.equal(grid.cellH, 64 + (arrange.CELL_H - arrange.ICON));
  // 칸이 커지면 한 줄에 들어가는 개수가 줄어든다.
  assert.ok(grid.cols < arrange.gridOf(400, 300, false, null).cols, '칸이 커졌는데 줄당 개수가 같다');
  // 창은 받은 박스에서 스스로 칸을 셈한다. 그래서 박스에 그 값이 실려 가야 한다.
  assert.equal((await shown(host, electron)).fence.look.icon, 64, '창에 알려 주지 않았다');
});

test('그림과 글씨 크기는 정해 둔 범위를 넘지 않는다', () => {
  const state = baseState({ fences: [fence()] });
  const { host } = loadHost(state);
  host.openAll();

  host.changeBox('a', { look: { icon: 9999, font: 9999 } });
  assert.equal(arrange.iconSize(state.fences[0].look), arrange.MAX_ICON);
  assert.equal(arrange.fontSize(state.fences[0].look), arrange.MAX_FONT);

  host.changeBox('a', { look: { icon: 1, font: 1 } });
  assert.equal(arrange.iconSize(state.fences[0].look), arrange.MIN_ICON);
  assert.equal(arrange.fontSize(state.fences[0].look), arrange.MIN_FONT);

  // 0 은 '기본 크기' 를 뜻한다.
  host.changeBox('a', { look: { icon: 0, font: 0 } });
  assert.equal(arrange.iconSize(state.fences[0].look), arrange.ICON);
  assert.equal(arrange.fontSize(state.fences[0].look), arrange.FONT);
});

test('기본값 단추는 박스마다 정한 꾸미기까지 놓는다', () => {
  const state = baseState({ fences: [fence()] });
  const { host } = loadHost(state);
  host.openAll();
  host.changeBox('a', { look: { text: '#ff0000', icon: 64, font: 14 } });
  assert.notDeepEqual(state.fences[0].look, themes.LOOK, '정한 값이 적히지 않았다');

  host.resetBox('a');

  assert.deepEqual(state.fences[0].look, themes.LOOK, '꾸미기가 남았다');
  assert.equal(state.fences[0].theme, state.settings.theme);
});

test('박스 설정 창에 지금 값과 고를 범위가 함께 온다', async () => {
  const state = baseState({ fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();
  host.openSettings('a');
  const win = electron.windows.find((one) => one.loaded && /settings\.html$/.test(one.loaded.file));
  assert.ok(win, '박스 설정 창이 열리지 않았다');
  await host.pushSettings('a');

  const payload = win.messages('box:state').at(-1);
  assert.deepEqual(payload.mine, themes.normalizeLook(null), '적어 둔 값이 그대로 오지 않았다');
  assert.equal(payload.shown.text, themes.resolve(state.fences[0]).text);
  assert.deepEqual(payload.iconSize, { value: arrange.ICON, min: arrange.MIN_ICON, max: arrange.MAX_ICON });
  assert.deepEqual(payload.fontSize, { value: arrange.FONT, min: arrange.MIN_FONT, max: arrange.MAX_FONT });
  assert.equal(payload.portal, '', '포털이 아닌데 폴더가 적혀 있다');
  assert.equal(payload.page, state.page);
  assert.equal(payload.pages.length, 1);
});
