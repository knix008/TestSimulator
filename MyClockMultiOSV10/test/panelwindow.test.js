'use strict';

/**
 * 설정 패널 기능 검사 — panel.html 과 진짜 panel.js 를 작은 DOM 위에서 돌린다.
 * 탭·세계 시간·알람·타이머·스톱워치·캘린더·설정(테마/사용자 색)을 확인한다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { openPanelWindow } = require('./helpers/panelwindow');
const { THEME_FAMILIES, THEMES, isLightTheme } = require('../src/js/data/themes');

test('패널을 열면 설정 탭이 켜져 있다', async () => {
  const panel = await openPanelWindow();
  assert.equal(panel.activeTab(), 'settings');
  assert.equal(panel.activePage(), 'settings');
  // 시계 창에도 지금 보고 있는 탭을 알려 준다 (메뉴 이름을 맞추기 위해).
  const told = panel.log.toClock.filter((m) => m.type === 'panel:tab-changed').at(-1);
  assert.equal(told.tab, 'settings');
});

test('설정 패널은 설정만 맡는다 (다른 탭은 저마다 창이다)', async () => {
  const panel = await openPanelWindow();
  assert.equal(panel.activeTab(), 'settings');
  assert.equal(panel.document.body.classList.contains('tool-window'), true, '탭 줄 대신 제목만 남는다');
  // 설정 패널에서는 알람·타이머 같은 탭으로 넘어갈 수 없다.
  const shown = panel.document.querySelectorAll('.tab-page').filter((page) => page.classList.contains('active'));
  assert.equal(shown.length, 1);
  assert.equal(shown[0].dataset.page, 'settings');
});

test('캘린더 창은 캘린더만 보여 준다', async () => {
  const panel = await openPanelWindow({ only: 'calendar', tool: true });
  assert.equal(panel.activeTab(), 'calendar');
  assert.equal(panel.activePage(), 'calendar');
});

test('탭 단추를 누르면 그 탭만 켜진다', async () => {
  const panel = await openPanelWindow();
  const tabs = panel.document.querySelectorAll('.tab');

  for (const tab of tabs) {
    await panel.emit(tab, 'click');
    assert.equal(panel.activeTab(), tab.dataset.tab);
    assert.equal(panel.activePage(), tab.dataset.tab);
    const on = panel.document.querySelectorAll('.tab').filter((t) => t.classList.contains('active'));
    assert.equal(on.length, 1, '켜진 탭은 늘 하나');
  }
});

test('나중에 메인 프로세스가 탭을 바꿔 달라고 해도 따라간다', async () => {
  const panel = await openPanelWindow();
  await panel.setTab('alarm');
  assert.equal(panel.activeTab(), 'alarm');
  await panel.setTab('settings');
  assert.equal(panel.activeTab(), 'settings');
});

test('Esc 를 누르면 패널을 닫는다', async () => {
  const panel = await openPanelWindow();
  panel.document.emit('keydown', { key: 'Escape' });
  await panel.flush();
  assert.equal(panel.log.panelCloses, 1);
});

test('세계 시간 — 도시마다 줄과 미니 시계를 그린다', async () => {
  const panel = await openPanelWindow();
  const items = panel.document.querySelectorAll('.world-item');

  assert.equal(items.length, 2);
  assert.equal(items[0].querySelector('.world-city').textContent, '서울');
  assert.equal(items[1].querySelector('.world-city').textContent, '뉴욕');
  assert.match(items[0].querySelector('.world-time-value').textContent, /\d{1,2}:\d{2}/);
  assert.ok(items[0].querySelector('.world-mini').canvasCalls.length > 5, '미니 시계를 그렸다');
  assert.match(panel.$('worldHeader').textContent, /^현지 /);
});

test('세계 시간 — 도시를 지우면 시계 창에 알린다', async () => {
  const panel = await openPanelWindow();
  const first = panel.document.querySelectorAll('.world-item')[0];
  await panel.emit(first.querySelector('.icon-btn'), 'click');

  const patch = panel.lastPatch();
  assert.equal(patch.worldCities.length, 1);
  assert.equal(patch.worldCities[0].city, '뉴욕');
  assert.equal(panel.document.querySelectorAll('.world-item').length, 1);
});

test('세계 시간 — 도시를 검색해 추가한다', async () => {
  const panel = await openPanelWindow();
  const search = panel.$('citySearch');

  search.value = 'Tokyo';
  await panel.emit(search, 'input');

  const hits = panel.document.querySelectorAll('.suggestion');
  assert.ok(hits.length > 0, '추천 목록이 나온다');
  assert.equal(panel.$('citySuggestions').hidden, false);

  await panel.emit(hits[0], 'mousedown');
  await panel.click('cityAddBtn');

  const patch = panel.lastPatch();
  assert.equal(patch.worldCities.length, 3);
  assert.ok(patch.worldCities.some((c) => c.zone === 'Asia/Tokyo'), '도쿄가 들어갔다');
});

test('세계 시간 창에서 24시간 표기를 켜면 시계 창에 알린다', async () => {
  const panel = await openPanelWindow({ only: 'world', tool: true });
  const check = panel.$('worldUse24h');
  check.checked = true;
  await panel.emit(check, 'change');
  assert.equal(panel.lastPatch().worldUse24h, true);
});

test('알람 — 추가 폼으로 알람을 만들어 보낸다', async () => {
  const panel = await openPanelWindow();
  await panel.click('alarmAddBtn');
  assert.equal(panel.$('alarmForm').hidden, false);

  panel.$('alarmTime').value = '06:45';
  panel.$('alarmLabel').value = '조깅';
  await panel.emit('alarmForm', 'submit');

  const sent = panel.log.toClock.filter((m) => m.type === 'alarms:set').at(-1);
  assert.equal(sent.alarms.length, 1);
  assert.equal(sent.alarms[0].time, '06:45');
  assert.equal(sent.alarms[0].label, '조깅');
  assert.equal(sent.alarms[0].isEnabled, true);
  assert.equal(panel.$('alarmForm').hidden, true, '저장하면 폼이 닫힌다');
});

test('알람 — 목록에서 켜고/끄고 지운다', async () => {
  const panel = await openPanelWindow({
    settings: {
      alarms: [
        { id: 'a1', time: '07:00', label: '기상', isEnabled: true, isRepeat: false, repeatDays: 127 },
        { id: 'a2', time: '08:30', label: '약', isEnabled: true, isRepeat: true, repeatDays: 0b0111110 }
      ]
    }
  });

  let items = panel.document.querySelectorAll('.alarm-item');
  assert.equal(items.length, 2);
  assert.equal(items[0].querySelector('.alarm-time-text').textContent, '07:00');
  assert.match(items[1].querySelector('.alarm-sub').textContent, /약/);
  assert.match(items[1].querySelector('.alarm-sub').textContent, /월|평일/, '반복 요일을 적어 준다');

  // 켜고 끄기 — 동그란 단추
  await panel.emit(items[0].querySelector('.alarm-toggle'), 'click');
  let sent = panel.log.toClock.filter((m) => m.type === 'alarms:set').at(-1);
  assert.equal(sent.alarms.find((a) => a.id === 'a1').isEnabled, false);
  items = panel.document.querySelectorAll('.alarm-item');
  assert.equal(items[0].classList.contains('off'), true, '꺼진 알람은 흐리게 보인다');

  // 편집 — 폼에 그 알람이 올라온다
  await panel.emit(items[1].querySelector('.btn-small'), 'click');
  assert.equal(panel.$('alarmForm').hidden, false);
  assert.equal(panel.$('alarmTime').value, '08:30');
  assert.equal(panel.$('alarmLabel').value, '약');
  assert.equal(panel.$('alarmRepeat').checked, true);
  await panel.click('alarmCancelBtn');
  assert.equal(panel.$('alarmForm').hidden, true);

  // 삭제
  await panel.emit(items[1].querySelector('.icon-btn'), 'click');
  sent = panel.log.toClock.filter((m) => m.type === 'alarms:set').at(-1);
  assert.equal(sent.alarms.length, 1);
  assert.equal(sent.alarms[0].id, 'a1');
  assert.equal(panel.document.querySelectorAll('.alarm-item').length, 1);
});

test('알람이 없으면 안내 글을 보여 준다', async () => {
  const panel = await openPanelWindow();
  assert.match(panel.$('alarmList').textContent, /등록된 알람이 없습니다/);
});

test('타이머 — 시/분/초를 +,- 로 고치고 시작 명령을 보낸다', async () => {
  const panel = await openPanelWindow();
  const item = panel.document.querySelector('.timer-item');
  assert.ok(item, '타이머 줄이 있다');
  assert.equal(item.querySelector('.timer-remaining').textContent, '00:05:00.00');

  const fields = item.querySelectorAll('.timer-field');
  assert.equal(fields.length, 3, '시·분·초 세 칸');
  assert.deepEqual(fields.map((f) => f.querySelector('.timer-field-label').textContent), ['시', '분', '초']);
  assert.equal(fields[1].querySelector('.timer-value').textContent, '05');

  // 분 칸의 + 를 누르면 6분으로 올려 달라고 보낸다.
  const plus = fields[1].querySelectorAll('button').at(-1);
  await panel.emit(plus, 'click');
  const field = panel.log.toClock.filter((m) => m.type === 'timer:command' && m.command === 'field').at(-1);
  assert.equal(field.field, 'minutes');
  assert.equal(field.value, 6);

  // 레이블을 고치면 그것도 보낸다.
  const label = item.querySelector('input');
  label.value = '라면';
  await panel.emit(label, 'change');
  const named = panel.log.toClock.filter((m) => m.type === 'timer:command' && m.command === 'label').at(-1);
  assert.equal(named.value, '라면');

  const start = item.querySelectorAll('button').find((b) => b.textContent === '시작');
  await panel.emit(start, 'click');
  assert.equal(panel.log.toClock.at(-1).command, 'start');
});

test('타이머 — 추가 단추가 시계 창에 새 타이머를 요청한다', async () => {
  const panel = await openPanelWindow();
  await panel.click('timerAddBtn');
  assert.equal(panel.log.toClock.at(-1).type, 'timer:add');
});

test('스톱워치 — 단추가 명령을 보내고, 받은 상태를 보여 준다', async () => {
  const panel = await openPanelWindow();

  await panel.click('swStartBtn');
  assert.deepEqual({ ...panel.log.toClock.at(-1) }, { type: 'stopwatch:command', command: 'start' });
  await panel.click('swLapBtn');
  assert.equal(panel.log.toClock.at(-1).command, 'lap');
  await panel.click('swStopBtn');
  assert.equal(panel.log.toClock.at(-1).command, 'stop');
  await panel.click('swResetBtn');
  assert.equal(panel.log.toClock.at(-1).command, 'reset');

  await panel.pushState({}, {
    stopwatch: {
      running: false,
      startedAt: 0,
      accumulated: 65432,
      elapsedMs: 65432,
      display: '00:01:05.43',
      laps: [
        { number: 2, label: '#02', display: '00:01:00.00' },
        { number: 1, label: '#01', display: '00:00:30.00' }
      ]
    }
  });

  assert.equal(panel.$('swDisplay').textContent, '00:01:05.43');
  const laps = panel.document.querySelectorAll('.lap-item');
  assert.equal(laps.length, 2);
  assert.equal(laps[0].querySelector('.lap-number').textContent, '#02');
  assert.equal(laps[0].querySelector('.lap-time').textContent, '00:01:00.00');
});

test('캘린더 — 42칸을 그리고 오늘 칸을 표시한다', async () => {
  const panel = await openPanelWindow({ tab: 'calendar' });
  const cells = panel.document.querySelectorAll('.cal-cell');
  assert.equal(cells.length, 42);
  assert.equal(cells.filter((c) => c.classList.contains('today')).length, 1);
  assert.match(panel.$('calTitle').textContent, /^\d{4}년 \d{1,2}월$/);
});

test('캘린더 — 달을 앞뒤로 넘긴다', async () => {
  const panel = await openPanelWindow({ tab: 'calendar' });
  const title = () => panel.$('calTitle').textContent;
  const first = title();

  await panel.click('calNextBtn');
  assert.notEqual(title(), first);
  await panel.click('calPrevBtn');
  assert.equal(title(), first, '한 칸 앞뒤로 움직이면 제자리');
});

test('캘린더 — 일정을 넣으면 그 날 칸과 목록에 나온다', async () => {
  const panel = await openPanelWindow({ tab: 'calendar' });

  await panel.click('eventAddBtn');
  assert.equal(panel.$('eventForm').hidden, false);

  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  panel.$('eventTitle').value = '건강검진';
  panel.$('eventDate').value = key;
  panel.$('eventStart').value = '09:00';
  panel.$('eventEnd').value = '10:00';
  panel.$('eventReminder').value = '30';
  await panel.emit('eventForm', 'submit');

  const sent = panel.log.toClock.filter((m) => m.type === 'events:set').at(-1);
  assert.equal(sent.events.length, 1);
  assert.equal(sent.events[0].title, '건강검진');
  assert.equal(sent.events[0].reminderMinutes, 30);
  assert.equal(panel.$('eventForm').hidden, true);

  const chips = panel.document.querySelectorAll('.cal-chip');
  assert.ok(chips.some((c) => c.textContent === '건강검진'), '달력 칸에 일정이 보인다');
  assert.match(panel.$('calDayEvents').textContent, /건강검진/);
});

test('설정 — 색마다 칸이 하나씩 있고 지금 테마가 켜져 있다', async () => {
  const panel = await openPanelWindow({ settings: { theme: 'ForestTheme' } });
  const tiles = panel.document.querySelectorAll('.theme-btn');

  // 색 가짓수 + 사용자 색 한 칸 (어두운/밝은 판은 위 단추로 고른다)
  assert.equal(tiles.length, THEME_FAMILIES.length + 1);
  const active = tiles.filter((t) => t.classList.contains('active'));
  assert.equal(active.length, 1);
  assert.equal(active[0].title, '포레스트');
  assert.equal(tiles.at(-1).title, THEMES.CustomTheme.label, '마지막 칸은 사용자 색');

  // 어두운 테마를 쓰고 있으니 칸도 어두운 판으로 칠해져 있다.
  const base = panel.document.querySelectorAll('#themeBaseGroup .seg-btn').find((b) => b.classList.contains('active'));
  assert.equal(base.dataset.value, 'dark');
});

test('설정 — 밝은 바탕을 고르면 같은 색의 밝은 판으로 바뀐다', async () => {
  const panel = await openPanelWindow({ settings: { theme: 'ForestTheme' } });
  const light = panel.document.querySelectorAll('#themeBaseGroup .seg-btn').find((b) => b.dataset.value === 'light');

  await panel.emit(light, 'click');

  const patch = panel.lastPatch();
  assert.equal(patch.theme, 'ForestLightTheme', '같은 색의 밝은 판');
  assert.equal(isLightTheme(patch.theme), true);
  assert.equal(panel.themeName(), 'ForestLightTheme');
  assert.equal(patch.customThemeLight, true, '사용자 색도 같은 바탕을 따라간다');

  // 칸 이름은 그대로고, 어두운 판으로 되돌릴 수도 있다.
  const tiles = panel.document.querySelectorAll('.theme-btn');
  assert.equal(tiles.length, THEME_FAMILIES.length + 1);
  assert.ok(tiles.some((t) => t.title === '포레스트' && t.classList.contains('active')));

  const dark = panel.document.querySelectorAll('#themeBaseGroup .seg-btn').find((b) => b.dataset.value === 'dark');
  await panel.emit(dark, 'click');
  assert.equal(panel.lastPatch().theme, 'ForestTheme');
});

test('설정 — 테마를 고르면 바로 적용하고 시계 창에 알린다', async () => {
  const panel = await openPanelWindow();
  const tiles = panel.document.querySelectorAll('.theme-btn');
  const mint = tiles.find((t) => t.title === THEMES.MintTheme.label);

  await panel.emit(mint, 'click');
  assert.equal(panel.lastPatch().theme, 'MintTheme');
  assert.equal(panel.themeName(), 'MintTheme');
  assert.equal(panel.themeVar('--accent'), THEMES.MintTheme.vars['--accent']);
});

test('설정 — 사용자 정의 색을 고르면 그 색 테마로 바뀐다', async () => {
  const panel = await openPanelWindow();
  const picker = panel.$('customThemeColor');

  picker.value = '#ff8800';
  await panel.emit(picker, 'input');

  const patch = panel.lastPatch();
  assert.equal(patch.customThemeColor, '#FF8800');
  assert.equal(patch.theme, 'CustomTheme', '사용자 색을 고르면 그 테마로 갈아탄다');
  assert.equal(panel.themeName(), 'CustomTheme');
  assert.equal(panel.themeVar('--accent'), '#FF8800');
  assert.equal(panel.$('customThemeColorValue').textContent, '#FF8800');

  // 테마 목록의 사용자 색 칸도 그 색으로 바뀐다.
  const tile = panel.document.querySelectorAll('.theme-btn').at(-1);
  assert.equal(tile.classList.contains('active'), true);
  assert.equal(tile.querySelector('.theme-swatch-dot').style.background, '#FF8800');
});

test('설정 — 사용자 색을 쓰는 중에 밝은 바탕을 고르면 사용자 테마가 밝아진다', async () => {
  const panel = await openPanelWindow({ settings: { theme: 'CustomTheme', customThemeColor: '#FF8800' } });
  const light = panel.document.querySelectorAll('#themeBaseGroup .seg-btn').find((b) => b.dataset.value === 'light');

  await panel.emit(light, 'click');
  const patch = panel.lastPatch();
  assert.equal(patch.customThemeLight, true);
  assert.equal(patch.theme, 'CustomTheme', '사용자 색을 쓰는 중이면 테마는 그대로');
  assert.equal(light.classList.contains('active'), true);

  const { luminance } = require('../src/js/data/themes');
  assert.ok(luminance(panel.themeVar('--window-background')) > 0.6, '바탕이 밝다');
});

test('설정 — 시계 모드·시간 형식 단추', async () => {
  const panel = await openPanelWindow();

  // 디지털일 때는 12/24시간을 고를 수 있다.
  const h24 = panel.document.querySelectorAll('#formatGroup .seg-btn').find((b) => b.dataset.value === '24');
  await panel.emit(h24, 'click');
  assert.equal(panel.lastPatch().use24h, true);

  const analog = panel.document.querySelectorAll('#modeGroup .seg-btn').find((b) => b.dataset.value === 'analog');
  await panel.emit(analog, 'click');
  assert.equal(panel.lastPatch().isDigital, false);
});

test('설정 — 밝기·볼륨 슬라이더', async () => {
  const panel = await openPanelWindow();

  const brightness = panel.$('brightnessSlider');
  brightness.value = '80';
  await panel.emit(brightness, 'input');
  assert.equal(panel.lastPatch().brightness, 80);
  assert.equal(panel.$('brightnessValue').textContent, '80%');

  const volume = panel.$('volumeSlider');
  volume.value = '30';
  await panel.emit(volume, 'input');
  assert.equal(panel.lastPatch().alarmVolume, 30);
  assert.equal(panel.$('volumeValue').textContent, '30%');
});

test('설정 — 알람음·디지털·아날로그 스타일 고르기', async () => {
  const panel = await openPanelWindow();

  const sound = panel.$('soundSelect');
  sound.value = 'Bell';
  await panel.emit(sound, 'change');
  assert.equal(panel.lastPatch().alarmSoundId, 'Bell');

  const digital = panel.$('digitalStyleSelect');
  digital.value = 'Neon';
  await panel.emit(digital, 'change');
  assert.equal(panel.lastPatch().digitalStyle, 'Neon');

  const analog = panel.$('analogStyleSelect');
  analog.value = 'Roman';
  await panel.emit(analog, 'change');
  assert.equal(panel.lastPatch().analogStyle, 'Roman');
});

test('설정 — 숫자색·오전오후색 고르기', async () => {
  const panel = await openPanelWindow();

  const digit = panel.$('digitColor');
  digit.value = '#00ff00';
  await panel.emit(digit, 'input');
  assert.equal(panel.lastPatch().digitColor, '#00FF00');

  const ampm = panel.$('amPmColor');
  ampm.value = '#ff00ff';
  await panel.emit(ampm, 'input');
  assert.equal(panel.lastPatch().amPmColor, '#FF00FF');
});

test('설정 창에는 시스템 설정이 없다 (트레이에서 다룬다)', async () => {
  const panel = await openPanelWindow();

  for (const id of ['alwaysOnTop', 'startWithSystem', 'resetBtn']) {
    assert.equal(panel.$(id), null, `#${id} 가 설정 창에 남아 있다`);
  }
  // 전체 화면은 시계 모양이므로 설정 창에 남는다.
  await panel.emit(panel.document.querySelectorAll('.sub-tab').find((t) => t.dataset.sub === 'style'), 'click');
  await panel.click('fullscreenBtn');
  assert.equal(panel.log.fullscreens, 1);
});

test('설정 — 미리듣기를 눌러도 터지지 않는다', async () => {
  const panel = await openPanelWindow();
  await panel.click('soundPreviewBtn');
  assert.ok(true);
});

test('시계 창이 보낸 상태를 그대로 그린다', async () => {
  const panel = await openPanelWindow();

  await panel.pushState({
    theme: 'SakuraTheme',
    brightness: 25,
    use24h: true,
    isDigital: false,
    alarmVolume: 10,
    digitColor: '#123456'
  });

  assert.equal(panel.themeName(), 'SakuraTheme');
  assert.equal(panel.$('brightnessSlider').value, '25');
  assert.equal(panel.$('volumeSlider').value, '10');
  assert.equal(panel.$('digitColor').value, '#123456');
  const modeOn = panel.document.querySelectorAll('#modeGroup .seg-btn').find((b) => b.classList.contains('active'));
  assert.equal(modeOn.dataset.value, 'analog');
  const formatOn = panel.document.querySelectorAll('#formatGroup .seg-btn').find((b) => b.classList.contains('active'));
  assert.equal(formatOn.dataset.value, '24');
});

test('패널이 왼쪽에 붙으면 본문에 표시를 남긴다', async () => {
  const panel = await openPanelWindow();
  panel.handlers.side(false);
  await panel.flush();
  assert.equal(panel.document.body.classList.contains('panel-left'), true);
  panel.handlers.side(true);
  await panel.flush();
  assert.equal(panel.document.body.classList.contains('panel-left'), false);
});

// ── 시계별 설정 · 탭 분리 ──────────────────────────────────────────────

const TWO_CLOCKS = [
  { id: 'c1', city: '뉴욕', zone: 'America/New_York', theme: 'OceanTheme' },
  { id: 'c2', city: '파리', zone: 'Europe/Paris', theme: 'ForestTheme', isDigital: false }
];

/** 그 시계만의 설정 창 — 시계마다 하나씩 뜬다. */
const clockPanel = (id, extra = {}) =>
  openPanelWindow({ only: 'settings', tool: true, clock: id, clocks: TWO_CLOCKS, ...extra });

test('시계마다 자기 설정 창을 갖는다 (창 안에서 시계를 고르지 않는다)', async () => {
  const panel = await clockPanel('c1');

  assert.equal(panel.target(), '뉴욕 시계 설정', '제목이 그 시계를 가리킨다');
  assert.equal(panel.$('clockTarget'), null, '시계 고르개는 없다');
  assert.match(panel.$('clockScopeHint').textContent, /뉴욕 시계의 설정입니다/);

  const other = await clockPanel('c2');
  assert.equal(other.target(), '파리 시계 설정');
});

test('메인 시계의 설정 창에는 공용 설정이, 시계 설정 창에는 그 시계 설정이 보인다', async () => {
  const main = await openPanelWindow({ clocks: TWO_CLOCKS });
  assert.equal(main.target(), '메인 시계 설정');
  assert.ok(main.document.querySelectorAll('[data-scope="main"]').every((n) => !n.hidden), '공용 설정이 보인다');
  assert.ok(main.document.querySelectorAll('[data-scope="clock"]').every((n) => n.hidden));

  const clock = await clockPanel('c1');
  assert.ok(clock.document.querySelectorAll('[data-scope="main"]').every((n) => n.hidden), '공용 설정은 숨는다');
  assert.ok(clock.document.querySelectorAll('[data-scope="clock"]').every((n) => !n.hidden));
  assert.equal(clock.$('clockZone').value, 'America/New_York');
  assert.equal(clock.$('clockShowCity').checked, true);
});

test('설정 창에 그 시계의 값이 나온다', async () => {
  const panel = await openPanelWindow({
    only: 'settings',
    tool: true,
    clock: 'c1',
    clocks: [{ id: 'c1', city: '뉴욕', zone: 'America/New_York', theme: 'OceanTheme', brightness: 80, use24h: true, isDigital: false }]
  });

  assert.equal(panel.$('brightnessSlider').value, '80');
  const mode = panel.document.querySelectorAll('#modeGroup .seg-btn').find((b) => b.classList.contains('active'));
  assert.equal(mode.dataset.value, 'analog');
  const theme = panel.document.querySelectorAll('.theme-btn').find((t) => t.classList.contains('active'));
  assert.equal(theme.title, '오션');
});

test('시계 설정 창에서 바꾼 것은 그 시계에만 간다', async () => {
  const panel = await clockPanel('c2');
  const before = panel.log.toClock.length;

  const brightness = panel.$('brightnessSlider');
  brightness.value = '70';
  await panel.emit(brightness, 'input');

  const update = panel.lastClockPatch();
  assert.equal(update.id, 'c2');
  assert.deepEqual({ ...update.patch }, { brightness: 70 });
  assert.equal(panel.log.toClock.length, before, '메인 시계에는 아무것도 보내지 않는다');
});

test('시계 설정 창에서 테마를 고르면 그 시계만 바뀐다', async () => {
  const panel = await clockPanel('c1', { settings: { theme: 'DarkTheme' } });

  const sakura = panel.document.querySelectorAll('.theme-btn').find((t) => t.title === '사쿠라');
  await panel.emit(sakura, 'click');

  assert.equal(panel.lastClockPatch().id, 'c1');
  assert.equal(panel.lastClockPatch().patch.theme, 'SakuraTheme');
  assert.equal(panel.themeName(), 'DarkTheme', '설정 창 자신의 색은 메인 테마를 따른다');
});

test('시계의 테마를 바꾸면 그 시계의 숫자 색도 따라간다', async () => {
  const panel = await clockPanel('c1');

  const sunset = panel.document.querySelectorAll('.theme-btn').find((t) => t.title === '선셋');
  await panel.emit(sunset, 'click');

  const { patch } = panel.lastClockPatch();
  assert.equal(patch.theme, 'SunsetTheme');
  assert.equal(patch.digitColor, THEMES.SunsetTheme.vars['--digital-text'], '숫자 색이 테마를 따라가지 않는다');
  assert.equal(patch.amPmColor, THEMES.SunsetTheme.vars['--accent']);
});

test('시계 설정 창에서 사용자 색을 고르면 그 시계의 색만 바뀐다', async () => {
  const panel = await clockPanel('c1');

  const picker = panel.$('customThemeColor');
  picker.value = '#00ddff';
  await panel.emit(picker, 'input');

  const update = panel.lastClockPatch();
  assert.equal(update.id, 'c1');
  assert.equal(update.patch.customThemeColor, '#00DDFF');
  assert.equal(update.patch.theme, 'CustomTheme');
});

test('시계의 시간대를 바꾸면 도시 이름도 함께 바뀐다', async () => {
  const panel = await clockPanel('c1');

  const zone = panel.$('clockZone');
  zone.value = 'Asia/Tokyo';
  await panel.emit(zone, 'change');

  const update = panel.lastClockPatch();
  assert.equal(update.id, 'c1');
  assert.equal(update.patch.zone, 'Asia/Tokyo');
  assert.equal(update.patch.city, '도쿄');
});

test('도시 이름 표시를 끌 수 있고, 시계를 닫으면 설정 창도 닫힌다', async () => {
  const panel = await clockPanel('c1');

  const check = panel.$('clockShowCity');
  check.checked = false;
  await panel.emit(check, 'change');
  assert.deepEqual({ ...panel.lastClockPatch().patch }, { showCity: false });

  await panel.click('clockCloseBtn');
  assert.deepEqual(panel.log.clocksClosed, ['c1']);

  // 메인 프로세스가 "그 시계가 없어졌다"고 알리면 이 창도 스스로 닫는다.
  panel.handlers.clocksChanged(panel.clocks().filter((clock) => clock.id !== 'c1'));
  await panel.flush();
  assert.equal(panel.log.selfClosed, 1);
});

test('시계 설정 창에는 공용 설정 갈래가 아예 보이지 않는다', async () => {
  const clock = await clockPanel('c1');
  const sound = clock.document.querySelectorAll('.sub-tab').find((t) => t.dataset.sub === 'sound');
  assert.equal(sound.hidden, true, '소리 갈래는 공용이라 시계 설정 창에 없다');
  const visible = clock.document.querySelectorAll('.sub-tab').filter((t) => !t.hidden).map((t) => t.dataset.sub);
  assert.deepEqual(visible, ['look', 'color', 'clock', 'style']);
});

test('공용 설정은 메인 시계의 설정 창에만 있다', async () => {
  const clock = await clockPanel('c1');
  // 알람음·시스템 설정은 시계 설정 창에서 숨어 있다 (앱 전체가 함께 쓰므로).
  for (const id of ['soundSelect', 'volumeSlider']) {
    const node = clock.$(id);
    assert.ok(node, `${id} 가 문서에서 사라졌다`);
    assert.ok(node.closest('[data-scope="main"]').hidden, `${id} 가 시계 설정 창에 보인다`);
  }

  const main = await openPanelWindow();
  const volume = main.$('volumeSlider');
  volume.value = '20';
  await main.emit(volume, 'input');
  assert.equal(main.lastPatch().alarmVolume, 20);
});

test('세계 시간 목록의 시계 단추가 그 도시의 시계를 연다', async () => {
  const panel = await openPanelWindow();
  const first = panel.document.querySelectorAll('.world-item')[0];
  const button = first.querySelectorAll('button').find((b) => b.textContent === '시계');

  await panel.emit(button, 'click');

  assert.equal(panel.log.clocksAdded.length, 1);
  assert.equal(panel.log.clocksAdded[0].zone, 'Asia/Seoul');
});

test('설정 패널은 떠 있는 창으로 떼어낼 수 있다', async () => {
  const panel = await openPanelWindow();
  await panel.click('panelDetachBtn');

  assert.deepEqual(panel.log.toolsOpened, ['settings']);
  assert.equal(panel.log.panelCloses, 1, '떼어내면 붙어 있던 패널은 닫는다');
});

test('기능 창은 그 기능만 보여 주고 분리 단추를 감춘다', async () => {
  const panel = await openPanelWindow({ only: 'timer', tool: true });

  assert.equal(panel.activeTab(), 'timer');
  assert.equal(panel.activePage(), 'timer');
  assert.equal(panel.document.body.classList.contains('tool-window'), true);
  assert.equal(panel.$('panelDetachBtn').hidden, true);

  // 알람·타이머는 앱이 하나로 들고 있으므로, 분리한 창도 같은 명령을 보낸다.
  await panel.click('timerAddBtn');
  assert.equal(panel.log.toClock.at(-1).type, 'timer:add');
});

test('기능 창의 닫기는 패널이 아니라 그 창을 닫는다', async () => {
  const panel = await openPanelWindow({ only: 'calendar', tool: true });

  await panel.click('panelCloseBtn');
  assert.equal(panel.log.selfClosed, 1);
  assert.equal(panel.log.panelCloses, 0);

  panel.document.emit('keydown', { key: 'Escape' });
  await panel.flush();
  assert.equal(panel.log.selfClosed, 2, 'Esc 도 그 창을 닫는다');
});

test('시계 창의 ⚙ 로 연 설정 창은 그 시계의 것이다', async () => {
  const panel = await clockPanel('c2');
  assert.equal(panel.target(), '파리 시계 설정');
  assert.equal(panel.$('clockZone').value, 'Europe/Paris');
});

test('설정 창은 내용에 맞는 크기를 알려 준다 (스크롤 없이 보이도록)', async () => {
  const main = await openPanelWindow();
  assert.ok(main.log.fits.length > 0, '패널이 크기를 알려 주지 않는다');
  const fit = main.log.fits.at(-1);
  assert.ok(fit.width >= 300 && fit.height >= 420, `요청한 크기: ${fit.width}x${fit.height}`);

  // 떼어낸 창·시계 설정 창은 자기 창 크기를 직접 바꾼다.
  const clock = await clockPanel('c1');
  assert.ok(clock.log.sizes.length > 0, '시계 설정 창이 크기를 맞추지 않는다');
});

// ── 설정 창의 갈래 탭 ──────────────────────────────────────────────────

test('설정은 갈래 탭으로 나뉘고 한 번에 하나만 보인다', async () => {
  const panel = await openPanelWindow();
  const tabs = panel.document.querySelectorAll('.sub-tab');

  assert.deepEqual(tabs.map((t) => t.dataset.sub), ['look', 'color', 'clock', 'style', 'sound']);
  assert.equal(panel.document.body.classList.contains('settings-window'), true, '스크롤 없는 설정 창');

  const open = () => panel.document.querySelectorAll('.sub-page').filter((p) => p.classList.contains('active'));
  assert.equal(open().length, 1, '한 번에 한 갈래만');
  assert.equal(open()[0].dataset.subPage, 'look', '열면 테마가 먼저 보인다');
  assert.ok(panel.document.querySelectorAll('.theme-btn').length > 20, '테마 칸이 바로 보인다');

  for (const tab of tabs) {
    await panel.emit(tab, 'click');
    assert.equal(open().length, 1);
    assert.equal(open()[0].dataset.subPage, tab.dataset.sub);
    assert.equal(tab.classList.contains('active'), true);
  }
});

test('갈래마다 들어갈 설정이 제자리에 있다', async () => {
  const panel = await openPanelWindow();
  const page = (name) => panel.document.querySelectorAll('.sub-page').find((p) => p.dataset.subPage === name);
  const has = (name, id) => !!page(name).querySelector(`#${id}`);

  assert.ok(has('clock', 'clockZone') && has('clock', 'clockShowCity') && has('clock', 'modeGroup'));
  assert.ok(has('clock', 'formatGroup') && has('clock', 'brightnessSlider') && has('clock', 'clockCloseBtn'));
  assert.ok(has('look', 'themeBaseGroup') && has('look', 'themeGrid'), '테마 갈래');
  assert.ok(has('color', 'customThemeColor') && has('color', 'digitColor') && has('color', 'amPmColor'), '색 갈래');
  assert.ok(has('style', 'digitalStyleSelect') && has('style', 'analogStyleSelect') && has('style', 'fullscreenBtn'));
  assert.ok(has('sound', 'soundSelect') && has('sound', 'volumeSlider') && has('sound', 'soundPreviewBtn'));
});

test('갈래를 옮겨 다녀도 설정은 그대로 동작한다', async () => {
  const panel = await openPanelWindow();
  const tab = (name) => panel.document.querySelectorAll('.sub-tab').find((t) => t.dataset.sub === name);

  await panel.emit(tab('look'), 'click');
  const mint = panel.document.querySelectorAll('.theme-btn').find((t) => t.title === '민트');
  await panel.emit(mint, 'click');
  assert.equal(panel.lastPatch().theme, 'MintTheme');

  await panel.emit(tab('sound'), 'click');
  const volume = panel.$('volumeSlider');
  volume.value = '15';
  await panel.emit(volume, 'input');
  assert.equal(panel.lastPatch().alarmVolume, 15);
});

test('설정 항목마다 아이콘이 붙어 있다', async () => {
  const panel = await openPanelWindow();
  const titles = panel.document.querySelectorAll('.tab-page[data-page="settings"] .section-title');

  assert.ok(titles.length >= 10, `설정 항목 수: ${titles.length}`);
  for (const title of titles) {
    const icon = title.querySelector('.section-icon');
    assert.ok(icon, `"${title.textContent}" 에 아이콘이 없다`);
    assert.ok(icon.textContent.trim().length > 0, `"${title.textContent}" 아이콘이 비어 있다`);
  }
  // 갈래 탭에도 아이콘이 있다.
  for (const tab of panel.document.querySelectorAll('.sub-tab')) {
    assert.ok(tab.querySelector('.sub-icon'), `${tab.dataset.sub} 탭에 아이콘이 없다`);
  }
});

test('창 제목 줄에도 아이콘이 있다', async () => {
  for (const [tab, expected] of [
    ['settings', '⚙'],
    ['alarm', '⏰'],
    ['calendar', '🗓'],
    ['world', '🌍']
  ]) {
    const panel = await openPanelWindow(tab === 'settings' ? {} : { only: tab, tool: true });
    const title = panel.document.querySelectorAll('.tab').find((t) => t.classList.contains('active'));
    const icon = title.querySelector('.tab-icon');
    assert.ok(icon, `${tab} 창 제목에 아이콘이 없다`);
    assert.equal(icon.textContent, expected);
  }
});

test('아날로그 시계에서는 12/24시간 선택이 꺼진다', async () => {
  const panel = await openPanelWindow({ settings: { isDigital: false } });
  const buttons = panel.document.querySelectorAll('#formatGroup .seg-btn');

  assert.ok(buttons.every((b) => b.disabled === true), '12/24시간 단추가 꺼져 있지 않다');
  assert.equal(panel.$('formatGroup').classList.contains('disabled'), true);
  assert.equal(panel.$('formatHint').hidden, false, '왜 꺼졌는지 알려 준다');

  // 눌러도 아무 일도 일어나지 않는다.
  const before = panel.log.toClock.length;
  await panel.emit(buttons.find((b) => b.dataset.value === '24'), 'click');
  assert.equal(panel.log.toClock.length, before);

  // 디지털로 바꾸면 다시 쓸 수 있다.
  await panel.pushState({ isDigital: true });
  assert.ok(panel.document.querySelectorAll('#formatGroup .seg-btn').every((b) => b.disabled === false));
  assert.equal(panel.$('formatHint').hidden, true);
});

test('메인 시계도 도시를 고를 수 있다 (비우면 이 컴퓨터 시간)', async () => {
  const panel = await openPanelWindow();
  const zone = panel.$('clockZone');

  // 첫 줄이 "이 컴퓨터 시간" 이고, 처음에는 그것이 골라져 있다.
  assert.equal(zone.children[0].textContent, '이 컴퓨터 시간');
  assert.equal(zone.value, '');
  assert.equal(panel.$('clockShowCity').disabled, true, '도시가 없으면 이름 표시도 쓸 수 없다');

  zone.value = 'Europe/London';
  await panel.emit(zone, 'change');
  assert.equal(panel.lastPatch().zone, 'Europe/London');
  assert.equal(panel.lastPatch().city, '런던');

  await panel.pushState({ zone: 'Europe/London', city: '런던' });
  assert.equal(panel.$('clockShowCity').disabled, false);

  zone.value = '';
  await panel.emit(zone, 'change');
  assert.equal(panel.lastPatch().zone, null, '다시 이 컴퓨터 시간으로');
  assert.equal(panel.lastPatch().city, '');
});

test('시계 설정 창에는 "이 컴퓨터 시간" 줄이 없다', async () => {
  const panel = await clockPanel('c1');
  const labels = panel.$('clockZone').children.map((option) => option.textContent);
  assert.ok(!labels.includes('이 컴퓨터 시간'), '추가 시계는 도시가 있어야 한다');
  assert.equal(panel.$('clockZone').value, 'America/New_York');
});

// ── 쓰고 있는 칸은 건드리지 않는다 ─────────────────────────────────────

test('슬라이더를 끄는 동안 다시 그려도 값이 튕기지 않는다', async () => {
  const panel = await openPanelWindow({ settings: { brightness: 50 } });
  const slider = panel.$('brightnessSlider');

  // 끌고 있는 상태 — 포커스를 쥐고 값이 바뀐 중.
  slider.focus();
  slider.value = '85';
  await panel.emit(slider, 'input');
  assert.equal(panel.lastPatch().brightness, 85);

  // 그 사이 시계 창이 옛 값(50)이 든 상태를 보내도 손에 쥔 값이 유지된다.
  await panel.pushState({ brightness: 50 });
  assert.equal(slider.value, '85', '끌던 슬라이더가 제자리로 튕겼다');

  // 손을 떼면 저장된 값으로 다시 그린다.
  slider.blur();
  await panel.pushState({ brightness: 50 });
  assert.equal(slider.value, '50');
});

test('색·선택 칸도 쓰는 중에는 다시 그리지 않는다', async () => {
  const panel = await openPanelWindow();

  const picker = panel.$('digitColor');
  picker.focus();
  picker.value = '#123456';
  await panel.pushState({ digitColor: '#FF0000' });
  assert.equal(picker.value, '#123456', '고르는 중인 색이 바뀌었다');

  picker.blur();
  await panel.pushState({ digitColor: '#FF0000' });
  assert.equal(picker.value, '#FF0000');
});

test('칸을 쓰는 동안에는 창 크기도 바꾸지 않는다', async () => {
  const panel = await openPanelWindow();
  const before = panel.log.fits.length;

  panel.$('brightnessSlider').focus();
  await panel.pushState({ brightness: 70 });
  assert.equal(panel.log.fits.length, before, '끄는 중에 창 크기를 바꾸면 손에서 빠진다');

  panel.$('brightnessSlider').blur();
  await panel.pushState({ brightness: 70 });
  assert.ok(panel.log.fits.length > before);
});

