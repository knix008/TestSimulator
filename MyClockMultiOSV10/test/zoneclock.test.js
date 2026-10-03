'use strict';

/**
 * 추가 시계 창 — 시계마다 다른 시간대·테마·모양을 갖는지, 도시 이름이 보이는지.
 * 진짜 zoneclock.js 를 가짜 DOM·IPC 위에서 돌린다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { openZoneClockWindow } = require('./helpers/zoneclockwindow');
const { THEMES } = require('../src/js/data/themes');
const { zonedParts } = require('../src/js/zone-time');

const pad2 = (n) => String(n).padStart(2, '0');

test('창에 그 시계의 도시 이름이 보인다', async () => {
  const win = await openZoneClockWindow({ clock: { city: '뉴욕', zone: 'America/New_York' } });
  assert.equal(win.element('cityName').textContent, '뉴욕');
});

test('도시 이름을 숨길 수 있다', async () => {
  const win = await openZoneClockWindow({ clock: { showCity: false } });
  assert.equal(win.element('cityName').textContent, '');

  await win.pushConfig({ showCity: true, city: '파리' });
  assert.equal(win.element('cityName').textContent, '파리');
});

test('도시 이름이 없으면 시간대 이름을 대신 보여 준다', async () => {
  const win = await openZoneClockWindow({ clock: { city: '', zone: 'Europe/Paris' } });
  assert.equal(win.element('cityName').textContent, 'Europe/Paris');
});

test('그 도시의 시각을 그린다 (이 컴퓨터 시각이 아니라)', async () => {
  const win = await openZoneClockWindow({ clock: { zone: 'Asia/Tokyo', use24h: true } });
  win.draw();

  const parts = zonedParts(new Date(), 'Asia/Tokyo');
  // 7세그먼트는 캔버스에 그리므로, 머리글 줄의 날짜로 그 지역 날짜를 확인한다.
  assert.match(win.element('headerDate').textContent, new RegExp(`${pad2(parts.month)}월 ${pad2(parts.day)}일`));
  assert.ok(win.element('digitalCanvas').calls.length > 50, '숫자를 그렸다');
});

test('날짜가 다른 시간대면 +1일 / -1일을 알려 준다', async () => {
  // 하루 차이가 나는 두 지역 중 하나는 반드시 차이가 난다.
  const pacific = await openZoneClockWindow({ clock: { zone: 'Pacific/Apia' } });
  const hawaii = await openZoneClockWindow({ clock: { zone: 'Pacific/Honolulu' } });
  pacific.draw();
  hawaii.draw();

  const texts = [pacific.element('headerDate').textContent, hawaii.element('headerDate').textContent];
  assert.ok(
    texts.some((text) => /\([+-]\d+일\)/.test(text)),
    `날짜 차이 표시가 없다: ${texts.join(' / ')}`
  );
});

test('글꼴로 그리는 스타일은 그 지역 시각을 글자로 넣는다', async () => {
  const win = await openZoneClockWindow({
    clock: { zone: 'Europe/London', digitalStyle: 'LcdText', use24h: true }
  });
  win.draw();

  const parts = zonedParts(new Date(), 'Europe/London');
  assert.equal(win.element('textTime').textContent, `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`);
  assert.equal(win.element('canvasDigital').hidden, true);
  assert.equal(win.element('textClockBox').hidden, false);
});

test('시계마다 테마가 따로 적용된다', async () => {
  const ocean = await openZoneClockWindow({ clock: { theme: 'OceanTheme' } });
  const forest = await openZoneClockWindow({ clock: { theme: 'ForestLightTheme' } });

  assert.equal(ocean.documentElement.dataset.theme, 'OceanTheme');
  assert.equal(ocean.themeVars.get('--accent'), THEMES.OceanTheme.vars['--accent']);
  assert.equal(forest.documentElement.dataset.theme, 'ForestLightTheme');
  assert.equal(forest.themeVars.get('--accent'), THEMES.ForestLightTheme.vars['--accent']);
});

test('시계마다 사용자 색도 따로 만든다', async () => {
  const win = await openZoneClockWindow({
    clock: { theme: 'CustomTheme', customThemeColor: '#FF8800' }
  });
  assert.equal(win.documentElement.dataset.theme, 'CustomTheme');
  assert.equal(win.themeVars.get('--accent'), '#FF8800');
});

test('아날로그로 바꾸면 문자판을 그리고 사각형 배경을 깔지 않는다', async () => {
  const win = await openZoneClockWindow({ clock: { isDigital: false } });
  assert.equal(win.element('analogCanvas').hidden, false);
  assert.equal(win.element('digitalPanel').hidden, true);
  assert.equal(win.element('root').classList.contains('analog-mode'), true);

  await win.emit('root', 'mouseenter');
  assert.equal(win.element('chromeBackground').hidden, true);
  assert.equal(win.element('chromeToolbar').hidden, false);

  win.draw();
  assert.ok(win.element('analogCanvas').calls.length > 50);
});

test('모드 전환 단추는 이 시계의 설정만 바꾼다', async () => {
  const win = await openZoneClockWindow();
  await win.emit('modeToggleBtn', 'click');

  const update = win.log.updates.at(-1);
  assert.equal(update.id, 'clock-1');
  assert.deepEqual({ ...update.patch }, { isDigital: false });
  assert.equal(win.element('analogCanvas').hidden, false);
});

test('휠을 굴리면 이 시계의 밝기만 바뀐다', async () => {
  const win = await openZoneClockWindow({ clock: { brightness: 50 } });
  await win.emit('root', 'wheel', { deltaY: -100 });

  assert.deepEqual({ ...win.log.updates.at(-1).patch }, { brightness: 55 });
  assert.equal(win.element('digitalPanel').style.opacity, '0.55');
});

test('⚙ 단추는 패널을 이 시계 설정으로 열고, ✕ 는 창을 닫는다', async () => {
  const win = await openZoneClockWindow();

  await win.emit('settingsBtn', 'click');
  assert.equal(win.log.settingsOpened, 1);

  await win.emit('closeBtn', 'click');
  assert.equal(win.log.closed, 1);
});

test('우클릭 메뉴에는 이 시계에 대한 항목만 있다', async () => {
  const win = await openZoneClockWindow();
  await win.emit('root', 'contextmenu');

  const menu = win.log.menus.at(-1);
  const ids = [...menu.items].filter((item) => !item.separator).map((item) => item.id);
  assert.deepEqual(ids, ['settings', 'mode', 'city', 'newclock', 'close']);
  // 알람·타이머·스톱워치·캘린더는 앱이 하나로 들고 있으므로 여기에 없다.
  for (const absent of ['alarm', 'timer', 'stopwatch', 'calendar', 'quit', 'tray']) {
    assert.ok(!ids.includes(absent), `${absent} 는 추가 시계 메뉴에 없어야 한다`);
  }
  assert.equal(menu.theme, 'DarkTheme', '메뉴도 이 시계의 테마를 쓴다');
});

test('메뉴에서 도시 이름 보이기/숨기기를 고를 수 있다', async () => {
  const win = await openZoneClockWindow();
  await win.chooseMenu('city');
  assert.deepEqual({ ...win.log.updates.at(-1).patch }, { showCity: false });
  assert.equal(win.element('cityName').textContent, '');
});

test('메뉴의 닫기는 창을 닫는다', async () => {
  const win = await openZoneClockWindow();
  await win.chooseMenu('close');
  assert.equal(win.log.closed, 1);
});

test('패널에서 바꾼 설정이 바로 반영된다', async () => {
  const win = await openZoneClockWindow();

  await win.pushConfig({ theme: 'SunsetTheme', zone: 'Europe/Paris', city: '파리', use24h: true });

  assert.equal(win.documentElement.dataset.theme, 'SunsetTheme');
  assert.equal(win.element('cityName').textContent, '파리');
  win.draw();
  assert.equal(win.element('amPmText').textContent, '', '24시간 표기에는 오전/오후가 없다');
});

test('창 최소 크기에 도시 이름 줄을 더해 알려 준다', async () => {
  const withCity = await openZoneClockWindow({ clock: { showCity: true } });
  const withoutCity = await openZoneClockWindow({ clock: { showCity: false } });

  const a = withCity.log.minSizes.at(-1);
  const b = withoutCity.log.minSizes.at(-1);
  assert.ok(a.height > b.height, `${a.height} > ${b.height} 이어야 한다`);
});

test('디지털에서는 도시·오전/오후·날짜가 숫자 바로 위 한 줄에 함께 있다', async () => {
  const win = await openZoneClockWindow({ clock: { city: '뉴욕', zone: 'America/New_York' } });
  await win.emit('root', 'mouseenter');
  win.draw();

  assert.equal(win.element('cityName').textContent, '뉴욕');
  assert.match(win.element('amPmText').textContent, /^(오전|오후)$/);
  assert.match(win.element('headerDate').textContent, /\d{2}월 \d{2}일/);
  // 셋 다 같은 머리글 줄에 있고, 날짜만 호버에 따라 나타난다.
  assert.equal(win.element('headerDate').hidden, false);
});

test('아날로그에서는 도시 이름을 문자판 안에 그린다', async () => {
  const win = await openZoneClockWindow({ clock: { city: '뉴욕', isDigital: false } });
  win.draw();

  const texts = win.element('analogCanvas').calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
  assert.ok(texts.includes('뉴욕'), `문자판 안에 도시 이름이 없다: ${texts.join(',')}`);
  assert.ok(
    texts.some((t) => t === '오전' || t === '오후'),
    '문자판 안에 오전/오후가 없다'
  );

  // 도시 이름을 숨기면 문자판 안에도 적지 않는다.
  await win.pushConfig({ showCity: false });
  win.element('analogCanvas').calls.length = 0;
  win.draw();
  const after = win.element('analogCanvas').calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
  assert.ok(!after.includes('뉴욕'));
});

test('긴 도시 이름은 문자판 안에 들어가도록 줄인다', async () => {
  const win = await openZoneClockWindow({
    clock: { city: '아주아주긴도시이름입니다그리고더깁니다', isDigital: false }
  });
  win.draw();

  const texts = win.element('analogCanvas').calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
  const label = texts.find((t) => t.startsWith('아주'));
  assert.ok(label, '도시 이름을 그리지 않았다');
  assert.ok(label.endsWith('…'), `줄이지 않았다: ${label}`);
});

test('추가 시계 메뉴에서도 시계를 더 둘 수 있다', async () => {
  const win = await openZoneClockWindow();
  await win.chooseMenu('newclock');
  assert.deepEqual([...win.log.toolsOpened], ['world'], '세계 시간 창에서 도시를 고르게 한다');
});

