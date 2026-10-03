'use strict';

/**
 * 시계 창 기능 검사 — 진짜 clock.js 를 가짜 DOM·IPC 위에서 돌린다.
 * 알람·일정 알림·모드 전환·테마·밝기·메뉴·패널 명령을 실제 코드로 확인한다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { openClockWindow } = require('./helpers/clockwindow');

/** 특정 시각으로 Date 를 고정한 채 한 번 돌린다. */
function at(win, y, mon, d, h, min, s) {
  const RealDate = Date;
  const fixed = new RealDate(y, mon - 1, d, h, min, s);
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) return new RealDate(fixed.getTime());
      return new RealDate(...args);
    }
    static now() {
      return fixed.getTime();
    }
  }
  win.context.Date = FrozenDate;
  try {
    win.tick();
  } finally {
    win.context.Date = RealDate;
  }
  return fixed;
}

test('창을 띄우면 설정대로 테마·시계 모드를 맞춘다', async () => {
  const win = await openClockWindow({ settings: { theme: 'OceanTheme', brightness: 70 } });

  assert.equal(win.documentElement.dataset.theme, 'OceanTheme');
  assert.equal(win.themeVars.get('--accent'), '#64FFDA');
  assert.equal(win.element('digitalPanel').style.opacity, '0.7', '밝기가 투명도로 들어간다');
  assert.equal(win.element('digitalPanel').hidden, false);
  assert.equal(win.element('analogCanvas').hidden, true);
  assert.deepEqual(win.log.alwaysOnTop, [false]);
  assert.ok(win.log.minSizes.length > 0, '창 최소 크기를 알려 준다');
  assert.equal(win.intervals.length, 1, '메인 루프가 하나 돈다');
});

test('디지털 시계가 날짜와 시각을 그린다', async () => {
  const win = await openClockWindow();
  at(win, 2026, 10, 2, 10, 8, 42);

  assert.equal(win.element('headerDate').textContent, '2026년 10월 02일  금');
  assert.equal(win.element('amPmText').textContent, '오전');
  assert.ok(win.element('digitalCanvas').calls.length > 100, '7세그먼트를 그렸다');
  assert.ok(win.log.tooltips.includes('10:08'), '트레이 풍선말에 시각을 넣는다');
  assert.ok(win.log.trayIcons > 0, '트레이 아이콘을 다시 그린다');
});

test('오후에는 오전/오후 표시가 바뀌고, 24시간 표기에서는 사라진다', async () => {
  const win = await openClockWindow();
  at(win, 2026, 10, 2, 15, 0, 0);
  assert.equal(win.element('amPmText').textContent, '오후');

  await win.fromPanel({ type: 'settings:patch', patch: { use24h: true } });
  at(win, 2026, 10, 2, 15, 0, 0);
  assert.equal(win.element('amPmText').textContent, '');
});

test('글꼴로 그리는 디지털 스타일은 글자를 넣는다 (한글 스타일)', async () => {
  const win = await openClockWindow({ settings: { digitalStyle: 'Korean' } });
  at(win, 2026, 10, 2, 9, 7, 5);

  assert.equal(win.element('canvasDigital').hidden, true);
  assert.equal(win.element('textClockBox').hidden, false);
  assert.equal(win.element('textTime').textContent, '아홉시:칠분:오초');
  // 오전/오후는 스타일과 상관없이 숫자 바로 위 한 줄에 있다.
  assert.equal(win.element('amPmText').textContent, '오전');
});

test('아날로그 모드로 바꾸면 문자판만 그리고 바깥에는 글자를 적지 않는다', async () => {
  const win = await openClockWindow();
  await win.fromPanel({ type: 'settings:patch', patch: { isDigital: false } });

  assert.equal(win.element('analogCanvas').hidden, false);
  assert.equal(win.element('digitalPanel').hidden, true);
  assert.equal(win.element('root').classList.contains('analog-mode'), true);
  assert.equal(win.stored().isDigital, false, '설정에 저장된다');

  at(win, 2026, 10, 2, 13, 5, 6);
  // 오전/오후와 날짜는 문자판 안에 그려지므로 상태 줄은 비어 있다.
  assert.equal(win.element('clockStatus').textContent, '');
  assert.equal(win.element('clockStatus').hidden, true);
  assert.ok(win.element('analogCanvas').calls.length > 50);

  // 문자판 안에 오전/오후와 날짜를 적는다.
  const texts = win.element('analogCanvas').calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
  assert.ok(texts.includes('오후'), `문자판 안에 오전/오후가 없다: ${texts.join(',')}`);
  assert.ok(texts.includes('02'), '문자판 안에 날짜가 없다');
});

test('아날로그에서는 마우스를 올려도 사각형 배경을 깔지 않는다', async () => {
  const win = await openClockWindow({ settings: { isDigital: false } });
  const background = win.element('chromeBackground');

  await win.emit('root', 'mouseenter');
  assert.equal(background.hidden, true, '아날로그에는 배경이 없다');
  assert.equal(win.element('chromeToolbar').hidden, false, '단추는 보인다');
  assert.equal(win.element('headerDate').hidden, false);

  // 디지털로 바꾸면 그때는 배경이 보인다.
  await win.fromPanel({ type: 'settings:patch', patch: { isDigital: true } });
  await win.emit('root', 'mouseenter');
  assert.equal(background.hidden, false);

  // 다시 아날로그로 — 올라와 있는 동안 바뀌어도 배경이 남지 않는다.
  await win.fromPanel({ type: 'settings:patch', patch: { isDigital: false } });
  assert.equal(background.hidden, true);
});

test('알람 — 정한 시각 0초에 한 번 울리고, 한 번뿐인 알람은 스스로 꺼진다', async () => {
  const win = await openClockWindow({
    settings: { alarms: [{ id: 'a1', time: '07:30', label: '기상', isEnabled: true, isRepeat: false, repeatDays: 127 }] }
  });

  at(win, 2026, 10, 2, 7, 29, 59);
  assert.equal(win.log.alarms.length, 0, '아직 시각이 아니다');

  at(win, 2026, 10, 2, 7, 30, 0);
  assert.equal(win.log.alarms.length, 1);
  assert.equal(win.log.alarms[0].label, '기상');
  assert.equal(win.log.alarms[0].header, '알람');
  assert.equal(win.log.alarms[0].soundId, 'Marimba');
  assert.equal(win.log.alarms[0].volume, 0.5);

  at(win, 2026, 10, 2, 7, 30, 1);
  assert.equal(win.log.alarms.length, 1, '같은 분에 두 번 울리지 않는다');

  const saved = win.stored().alarms.find((a) => a.id === 'a1');
  assert.equal(saved.isEnabled, false, '한 번뿐인 알람은 울린 뒤 꺼진다');
});

test('알람 — 꺼진 알람은 울리지 않는다', async () => {
  const win = await openClockWindow({
    settings: { alarms: [{ id: 'a1', time: '07:30', label: '', isEnabled: false, isRepeat: false, repeatDays: 127 }] }
  });
  at(win, 2026, 10, 2, 7, 30, 0);
  assert.equal(win.log.alarms.length, 0);
});

test('알람 — 반복 알람은 고른 요일에만 울리고 꺼지지 않는다', async () => {
  // 2026-10-02 는 금요일(비트 5), 2026-10-03 은 토요일(비트 6).
  const onlyFriday = 1 << 5;
  const win = await openClockWindow({
    settings: { alarms: [{ id: 'a1', time: '08:00', label: '출근', isEnabled: true, isRepeat: true, repeatDays: onlyFriday }] }
  });

  at(win, 2026, 10, 3, 8, 0, 0);
  assert.equal(win.log.alarms.length, 0, '토요일에는 울리지 않는다');

  at(win, 2026, 10, 2, 8, 0, 0);
  assert.equal(win.log.alarms.length, 1, '금요일에는 울린다');
  assert.equal(win.stored().alarms?.[0]?.isEnabled ?? true, true, '반복 알람은 그대로 켜져 있다');
});

test('일정 — 미리 알림 시각에 한 번 알린다', async () => {
  const win = await openClockWindow({
    events: [
      {
        id: 'e1',
        title: '치과',
        date: '2026-10-02',
        startTime: '14:00',
        endTime: '15:00',
        isAllDay: false,
        reminderMinutes: 30,
        recurrence: 'None',
        color: '#4A90D9',
        description: ''
      }
    ]
  });

  at(win, 2026, 10, 2, 13, 29, 0);
  assert.equal(win.log.alarms.length, 0);

  at(win, 2026, 10, 2, 13, 30, 0);
  assert.equal(win.log.alarms.length, 1);
  assert.equal(win.log.alarms[0].header, '일정 알림');
  assert.equal(win.log.alarms[0].label, '치과');
  assert.match(win.log.alarms[0].time, /10월 2일 14:00/);

  at(win, 2026, 10, 2, 13, 30, 30);
  assert.equal(win.log.alarms.length, 1, '같은 분에 두 번 알리지 않는다');
});

test('일정 — 미리 알림이 없으면 알리지 않는다', async () => {
  const win = await openClockWindow({
    events: [
      {
        id: 'e1',
        title: '메모',
        date: '2026-10-02',
        startTime: '14:00',
        endTime: '15:00',
        isAllDay: false,
        reminderMinutes: null,
        recurrence: 'None',
        color: '#4A90D9',
        description: ''
      }
    ]
  });
  at(win, 2026, 10, 2, 14, 0, 0);
  assert.equal(win.log.alarms.length, 0);
});

test('타이머 — 돌아가는 동안 시계 자리에 남은 시간이 나오고, 끝나면 알린다', async () => {
  const win = await openClockWindow({ settings: { timers: [{ label: '라면', hours: 0, minutes: 3, seconds: 0 }] } });

  const { timers } = await win.state();
  await win.fromPanel({ type: 'timer:command', id: timers[0].id, command: 'start' });
  at(win, 2026, 10, 2, 10, 0, 0);
  assert.equal(win.element('amPmText').textContent, '타이머');
  assert.equal(win.element('clockStatus').textContent, '타이머');

  // 3분 뒤로 시계를 돌려 "다 지난" 상태를 만든다.
  win.tickAt(Date.now() + 3 * 60 * 1000 + 1000);
  await win.flush();

  assert.equal(win.log.alarms.length, 1);
  assert.equal(win.log.alarms[0].header, '타이머 완료');
  assert.equal(win.log.alarms[0].label, '라면');
});

test('타이머 — 일시정지하면 머리글이 바뀐다', async () => {
  const win = await openClockWindow();
  const id = (await win.state()).timers[0].id;
  await win.fromPanel({ type: 'timer:command', id, command: 'start' });
  await win.fromPanel({ type: 'timer:command', id, command: 'pause' });
  at(win, 2026, 10, 2, 10, 0, 0);
  assert.equal(win.element('amPmText').textContent, '일시정지');
});

test('스톱워치 — 패널에서 보낸 명령을 처리하고 상태를 돌려준다', async () => {
  const win = await openClockWindow();
  win.log.toPanel.length = 0;

  await win.fromPanel({ type: 'stopwatch:command', command: 'start' });
  await win.fromPanel({ type: 'stopwatch:command', command: 'lap' });
  await win.fromPanel({ type: 'stopwatch:command', command: 'lap' });

  const last = win.log.toPanel.at(-1);
  assert.equal(last.type, 'state');
  assert.equal(last.stopwatch.running, true);
  assert.equal(last.stopwatch.laps.length, 2);

  await win.fromPanel({ type: 'stopwatch:command', command: 'reset' });
  assert.equal(win.log.toPanel.at(-1).stopwatch.running, false);
  assert.deepEqual([...win.log.toPanel.at(-1).stopwatch.laps], []);
});

test('테마를 고르면 디지털 숫자 색도 그 테마 색으로 따라온다', async () => {
  const win = await openClockWindow();
  await win.fromPanel({ type: 'settings:patch', patch: { theme: 'GreenTheme' } });

  assert.equal(win.documentElement.dataset.theme, 'GreenTheme');
  assert.equal(win.stored().digitColor, '#00E676');
  assert.equal(win.themeVars.get('--digital-text-color'), '#00E676');
});

test('직접 고른 숫자 색은 테마 색을 덮어쓴다', async () => {
  const win = await openClockWindow();
  await win.fromPanel({ type: 'settings:patch', patch: { digitColor: '#FF00FF' } });
  assert.equal(win.stored().digitColor, '#FF00FF');
  assert.equal(win.themeVars.get('--digital-text-color'), '#FF00FF');
});

test('사용자 정의 색을 보내면 그 색으로 만든 테마가 적용된다', async () => {
  const win = await openClockWindow();
  await win.fromPanel({
    type: 'settings:patch',
    patch: { theme: 'CustomTheme', customThemeColor: '#FF8800' }
  });

  assert.equal(win.documentElement.dataset.theme, 'CustomTheme');
  assert.equal(win.themeVars.get('--accent'), '#FF8800');
  assert.equal(win.stored().customThemeColor, '#FF8800');
  assert.equal(win.stored().digitColor, '#FF8800', '디지털 숫자도 그 색이 된다');

  // 색만 다시 고쳐도 바로 따라온다.
  await win.fromPanel({ type: 'settings:patch', patch: { theme: 'CustomTheme', customThemeColor: '#00AAFF' } });
  assert.equal(win.themeVars.get('--accent'), '#00AAFF');
  assert.equal(win.stored().digitColor, '#00AAFF');
});

test('밝기 — 시계 위에서 휠을 굴리면 5%씩 움직이고 상태 줄에 뜬다', async () => {
  const win = await openClockWindow({ settings: { brightness: 50 } });

  await win.emit('root', 'wheel', { deltaY: -100 });
  assert.equal(win.element('digitalPanel').style.opacity, '0.55');
  assert.equal(win.element('clockStatus').textContent, '밝기 55%');

  await win.emit('root', 'wheel', { deltaY: 100 });
  await win.emit('root', 'wheel', { deltaY: 100 });
  assert.equal(win.element('digitalPanel').style.opacity, '0.45');
});

test('밝기 — 10% 아래·100% 위로는 가지 않는다', async () => {
  const win = await openClockWindow({ settings: { brightness: 95 } });
  await win.emit('root', 'wheel', { deltaY: -100 });
  await win.emit('root', 'wheel', { deltaY: -100 });
  assert.equal(win.element('digitalPanel').style.opacity, '1');
});

test('컨텍스트 메뉴 — 항목과 이름이 상황에 따라 바뀐다', async () => {
  const win = await openClockWindow();
  await win.emit('root', 'contextmenu');

  const menu = win.log.menus.at(-1);
  // 샌드박스에서 온 배열이므로 검사 쪽 배열로 옮겨 담아 비교한다.
  const ids = [...menu.items].filter((i) => !i.separator).map((i) => i.id);
  assert.deepEqual(ids, [
    'settings',
    'world',
    'alarm',
    'timer',
    'stopwatch',
    'calendar',
    'newclock',
    'mode',
    'fullscreen',
    'maximize',
    'tray',
    'about',
    'quit'
  ]);
  assert.equal(menu.theme, 'DarkTheme');
  assert.equal(menu.customThemeColor, '#89B4FA', '메뉴 창도 사용자 정의 색을 받는다');

  const label = (id) => [...menu.items].find((i) => i.id === id).label;
  assert.equal(label('settings'), '설정...');
  assert.equal(label('mode'), '아날로그 시계로 전환');
  assert.equal(label('maximize'), '최대화');
});

test('컨텍스트 메뉴 — 설정을 고르면 설정 탭으로 열고, 보고 있으면 닫는다', async () => {
  const win = await openClockWindow();

  await win.chooseMenu('settings');
  assert.deepEqual(win.log.panelToggles, ['settings'], '설정 탭을 지정해 연다');

  // 패널이 열려 설정 탭을 보고 있다고 알려 준다.
  win.setPanelOpen(true);
  await win.fromPanel({ type: 'panel:tab-changed', tab: 'settings' });
  await win.chooseMenu('settings');
  assert.equal(win.log.panelCloses, 1, '같은 탭을 보고 있으면 닫는다');

  // 다른 탭을 보고 있으면 설정 탭으로 바꿔 준다.
  await win.fromPanel({ type: 'panel:tab-changed', tab: 'world' });
  await win.chooseMenu('settings');
  assert.deepEqual(win.log.panelToggles, ['settings', 'settings']);
});

test('컨텍스트 메뉴 — 설정이 열려 있으면 이름이 "설정 닫기" 가 된다', async () => {
  const win = await openClockWindow();
  win.setPanelOpen(true);
  await win.fromPanel({ type: 'panel:tab-changed', tab: 'settings' });

  await win.emit('root', 'contextmenu');
  const menu = win.log.menus.at(-1);
  const label = (id) => [...menu.items].find((i) => i.id === id).label;
  assert.equal(label('settings'), '설정 닫기');
  assert.equal(label('calendar'), '캘린더');
});

test('패널이 닫히면 다음에 열릴 탭은 다시 설정 탭이다', async () => {
  const win = await openClockWindow();

  win.setPanelOpen(true);
  await win.fromPanel({ type: 'panel:tab-changed', tab: 'calendar' });
  win.setPanelOpen(false);

  // 닫힌 뒤 설정을 고르면 (닫기가 아니라) 설정 탭으로 연다.
  await win.chooseMenu('settings');
  assert.deepEqual(win.log.panelToggles, ['settings']);
  assert.equal(win.log.panelCloses, 0);
});

test('컨텍스트 메뉴 — 기능들은 저마다 창으로 열리고, 창 명령도 동작한다', async () => {
  const win = await openClockWindow();

  // 알람·타이머·스톱워치·캘린더·세계 시간은 설정 패널이 아니라 각자의 창이다.
  for (const tab of ['world', 'alarm', 'timer', 'stopwatch', 'calendar']) {
    await win.chooseMenu(tab);
  }
  assert.deepEqual([...win.log.toolsOpened], ['world', 'alarm', 'timer', 'stopwatch', 'calendar']);
  assert.deepEqual(win.log.panelToggles, [], '설정 패널은 건드리지 않는다');

  await win.chooseMenu('fullscreen');
  assert.equal(win.log.fullscreens, 1);

  await win.chooseMenu('maximize');
  assert.equal(win.log.maximizeToggles, 1);

  await win.chooseMenu('tray');
  assert.equal(win.log.hidesToTray, 1);

  await win.chooseMenu('quit');
  assert.equal(win.log.quits, 1);

  await win.chooseMenu('mode');
  assert.equal(win.stored().isDigital, false, '모드 전환이 저장된다');
});

test('툴바의 설정 단추는 설정 탭을 연다', async () => {
  const win = await openClockWindow();
  await win.emit('settingsBtn', 'click');
  assert.deepEqual(win.log.panelToggles, ['settings']);
});

test('모드 전환 — 아날로그는 정사각형에 가깝게 창을 잡는다', async () => {
  const win = await openClockWindow({ settings: { windowWidth: 400, windowHeight: 150 } });
  await win.emit('modeToggleBtn', 'click');

  const size = win.log.sizes.at(-1);
  assert.ok(size.height >= size.width * 0.75, `아날로그 창: ${size.width}x${size.height}`);
});

test('알람 목록·일정 변경을 패널에서 받아 저장한다', async () => {
  const win = await openClockWindow();

  await win.fromPanel({
    type: 'alarms:set',
    alarms: [{ id: 'a9', time: '06:00', label: '새 알람', isEnabled: true, isRepeat: false, repeatDays: 127 }]
  });
  assert.equal(win.stored().alarms.length, 1);
  assert.equal(win.stored().alarms[0].label, '새 알람');

  await win.fromPanel({
    type: 'events:set',
    events: [{ id: 'e9', title: '회의', date: '2026-10-05', startTime: '09:00', endTime: '10:00', isAllDay: false, reminderMinutes: null, recurrence: 'None', color: '#4A90D9', description: '' }]
  });
  assert.equal(win.events().length, 1);
  assert.equal(win.events()[0].title, '회의');
});

test('기본값으로 초기화하면 테마·알람·창 크기가 처음 상태로 돌아간다', async () => {
  const win = await openClockWindow({
    settings: { theme: 'RedTheme', alarms: [{ id: 'a1', time: '05:00', label: '', isEnabled: true, isRepeat: false, repeatDays: 127 }] }
  });

  await win.fromPanel({ type: 'settings:reset' });

  assert.equal(win.documentElement.dataset.theme, 'DarkTheme');
  assert.deepEqual(win.stored().alarms, []);
  assert.ok(win.log.sizes.length > 0, '창 크기를 되돌린다');
  assert.ok(win.stored().worldCities.length > 0, '기본 도시 목록을 되살린다');
});

test('패널이 상태를 달라고 하면 지금 상태를 한 벌 보낸다', async () => {
  const win = await openClockWindow();
  win.log.toPanel.length = 0;

  await win.fromPanel({ type: 'request:state' });
  const state = win.log.toPanel.at(-1);

  assert.equal(state.type, 'state');
  for (const key of ['settings', 'alarms', 'timers', 'stopwatch', 'events']) {
    assert.ok(key in state, `상태에 ${key} 가 없다`);
  }
  assert.equal(state.settings.theme, 'DarkTheme');
});

test('알 수 없는 패널 명령은 조용히 무시한다', async () => {
  const win = await openClockWindow();
  assert.doesNotThrow(() => win.fromPanel({ type: '없는명령' }));
  assert.doesNotThrow(() => win.fromPanel(null));
  assert.doesNotThrow(() => win.fromPanel({}));
});

test('메뉴에서 시계를 추가할 수 있다', async () => {
  const win = await openClockWindow({
    settings: {
      worldCities: [
        { city: '서울', region: '대한민국', zone: 'Asia/Seoul' },
        { city: '뉴욕', region: '미국 동부', zone: 'America/New_York' }
      ]
    }
  });

  // "시계 추가..." 를 고르면 도시 목록이 메뉴로 이어서 뜬다.
  await win.chooseMenu('newclock');
  const menu = win.log.menus.at(-1);
  const items = [...menu.items].filter((item) => !item.separator);
  assert.deepEqual(
    items.map((item) => item.label),
    ['서울 · 대한민국', '뉴욕 · 미국 동부', '다른 도시 찾기...']
  );
  assert.deepEqual(items.map((item) => item.id), ['addclock:0', 'addclock:1', 'world']);

  // 도시를 고르면 그 도시의 시계가 하나 더 열린다.
  await win.chooseMenu('addclock:1');
  assert.equal(win.log.clocksAdded.length, 1);
  assert.equal(win.log.clocksAdded[0].zone, 'America/New_York');
  assert.equal(win.log.clocksAdded[0].city, '뉴욕');
});

test('메뉴의 "다른 도시 찾기"는 세계 시간 창을 연다', async () => {
  const win = await openClockWindow();
  await win.chooseMenu('newclock');
  await win.chooseMenu('world');

  assert.deepEqual([...win.log.toolsOpened], ['world']);
  assert.equal(win.log.clocksAdded.length, 0);
});

test('도시 목록이 비어 있어도 메뉴는 "다른 도시 찾기"를 보여 준다', async () => {
  const win = await openClockWindow({ settings: { worldCities: [] } });
  await win.chooseMenu('newclock');

  const items = [...win.log.menus.at(-1).items].filter((item) => !item.separator);
  assert.deepEqual(items.map((item) => item.id), ['world']);
});

