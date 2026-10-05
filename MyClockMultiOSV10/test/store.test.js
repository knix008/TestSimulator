'use strict';

/** 설정 저장소 — 기본값, 값 다듬기, 저장/불러오기, 일정, WPF 판 가져오기. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadStore } = require('./helpers/fakes');

test('기본 설정 — 처음 실행하면 다크 테마 디지털 시계로 시작한다', () => {
  const { store } = loadStore();
  const s = store.defaults();

  assert.equal(s.theme, 'DarkTheme');
  assert.equal(s.isDigital, true);
  assert.equal(s.use24h, false);
  assert.equal(s.brightness, 50);
  assert.equal(s.digitalStyle, 'SevenSegment');
  assert.equal(s.analogStyle, 'Classic');
  assert.equal(s.alarmSoundId, 'Marimba');
  assert.equal(s.alarmVolume, 50);
  assert.deepEqual(s.alarms, []);
  assert.equal(s.timers.length, 1, '타이머 한 칸은 늘 있다');
  assert.deepEqual(s.timers[0], { label: '', hours: 0, minutes: 5, seconds: 0 });
});

test('기본 설정 — 사용자 정의 테마 색이 들어 있다', () => {
  const { store } = loadStore();
  const s = store.defaults();
  assert.match(s.customThemeColor, /^#[0-9A-F]{6}$/);
  assert.equal(s.customThemeLight, false);
});

test('사용자 정의 테마 색은 #RRGGBB 만 받고 대문자로 적는다', () => {
  const { store } = loadStore();
  assert.equal(store.saveSettings({ customThemeColor: '#a1b2c3' }).customThemeColor, '#A1B2C3');
  // 색 글자가 깨져 있으면 기본 색으로 되돌린다 (다른 색 설정과 같은 규칙).
  assert.equal(store.saveSettings({ customThemeColor: 'green' }).customThemeColor, store.defaults().customThemeColor);
  assert.equal(store.saveSettings({ customThemeLight: 'yes' }).customThemeLight, false, 'true 가 아니면 거짓');
  assert.equal(store.saveSettings({ customThemeLight: true }).customThemeLight, true);
});

test('범위를 벗어난 값은 잘라서 저장한다', () => {
  const { store } = loadStore();
  const s = store.saveSettings({
    brightness: 900,
    alarmVolume: -50,
    windowWidth: 10,
    windowHeight: 99999
  });
  assert.equal(s.brightness, 100);
  assert.equal(s.alarmVolume, 0);
  assert.equal(s.windowWidth, 140, '디지털 최소 너비보다 작게는 저장되지 않는다');
  assert.equal(s.windowHeight, 4000);
});

test('저장한 설정은 다시 불러도 그대로다', () => {
  const { store, settingsFile } = loadStore();
  store.saveSettings({ theme: 'CustomTheme', customThemeColor: '#FF8800', use24h: true, brightness: 80 });

  assert.ok(fs.existsSync(settingsFile), '설정 파일이 만들어진다');
  const loaded = store.loadSettings();
  assert.equal(loaded.theme, 'CustomTheme');
  assert.equal(loaded.customThemeColor, '#FF8800');
  assert.equal(loaded.use24h, true);
  assert.equal(loaded.brightness, 80);
});

test('설정 파일이 깨져 있으면 기본값으로 시작한다', () => {
  const { store, settingsFile } = loadStore();
  fs.writeFileSync(settingsFile, '{ 이건 JSON 이 아니다');
  const loaded = store.loadSettings();
  assert.equal(loaded.theme, 'DarkTheme');
  assert.equal(loaded.brightness, 50);
});

test('알람 — 시간 형식을 바로잡고 반복 요일 비트를 지킨다', () => {
  const { store } = loadStore();
  const s = store.saveSettings({
    alarms: [
      { time: '7:05', label: '기상' },
      { time: '엉뚱', isEnabled: false },
      { time: '09:30', isRepeat: true, repeatDays: 999 }
    ]
  });

  assert.equal(s.alarms.length, 3);
  assert.equal(s.alarms[0].time, '07:05');
  assert.equal(s.alarms[0].label, '기상');
  assert.equal(s.alarms[0].isEnabled, true, '따로 적지 않으면 켜진 알람');
  assert.equal(s.alarms[1].time, '07:00', '읽을 수 없는 시간은 07:00');
  assert.equal(s.alarms[1].isEnabled, false);
  assert.equal(s.alarms[2].repeatDays, 0b1111111, '일~토 일곱 비트를 넘지 않는다');
  assert.ok(s.alarms.every((a) => typeof a.id === 'string' && a.id));
  assert.equal(new Set(s.alarms.map((a) => a.id)).size, 3, '알람마다 다른 이름표');
});

test('타이머 — 시/분/초 한계를 지킨다', () => {
  const { store } = loadStore();
  const s = store.saveSettings({ timers: [{ hours: 200, minutes: 90, seconds: -3, label: '면' }] });
  assert.deepEqual(s.timers, [{ label: '면', hours: 99, minutes: 59, seconds: 0 }]);
});

test('세계 시간 도시 — 시간대 없는 항목은 버린다', () => {
  const { store } = loadStore();
  const s = store.saveSettings({
    worldCities: [
      { city: '서울', region: '대한민국', zone: 'Asia/Seoul' },
      { city: '엉뚱' },
      null
    ]
  });
  assert.equal(s.worldCities.length, 1);
  assert.equal(s.worldCities[0].zone, 'Asia/Seoul');

  // 모두 버려져 빈 목록이 되면 null — 그때 기본 도시 목록을 쓴다.
  assert.equal(store.saveSettings({ worldCities: [] }).worldCities, null);
  assert.ok(store.DEFAULT_WORLD_CITIES.length >= 10);
});

test('일정 — 날짜 없는 항목은 버리고 되풀이·색을 다듬는다', () => {
  const { store } = loadStore();
  const saved = store.saveEvents([
    { title: '회의', date: '2026-10-02', startTime: '10:00', endTime: '11:00' },
    { title: '날짜 없음' },
    { title: '생일', date: '2026-12-25', recurrence: '매년', color: 'blue', isAllDay: true }
  ]);

  assert.equal(saved.length, 2);
  assert.equal(saved[0].title, '회의');
  assert.equal(saved[0].isAllDay, false);
  assert.equal(saved[1].recurrence, 'None', '모르는 되풀이는 없음으로');
  assert.equal(saved[1].color, '#4A90D9', '모르는 색은 기본 색으로');
  assert.equal(saved[1].isAllDay, true);
  assert.deepEqual(store.loadEvents().map((e) => e.title), ['회의', '생일']);
});

test('WPF 판 설정 가져오기 — 처음 실행할 때 한 번만, 원본은 그대로', () => {
  const { store, legacyDir, settingsFile } = loadStore();
  fs.mkdirSync(legacyDir, { recursive: true });
  const legacyFile = path.join(legacyDir, 'settings.json');
  fs.writeFileSync(
    legacyFile,
    JSON.stringify({
      Theme: 'OceanTheme',
      Use24h: true,
      Brightness: 70,
      DigitColor: '#64FFDA',
      Alarms: [{ Time: '06:30:00', Label: '출근', IsEnabled: true }]
    })
  );

  const result = store.migrateFromWpfIfNeeded();
  assert.ok(result && result.settings === true, '가져왔다고 알려 준다');

  const loaded = store.loadSettings();
  assert.equal(loaded.theme, 'OceanTheme');
  assert.equal(loaded.use24h, true);
  assert.equal(loaded.brightness, 70);
  assert.equal(loaded.alarms[0].time, '06:30');
  assert.equal(loaded.alarms[0].label, '출근');

  assert.ok(fs.existsSync(legacyFile), 'WPF 판 설정은 건드리지 않는다');
  assert.ok(fs.existsSync(settingsFile));
  assert.equal(store.migrateFromWpfIfNeeded(), null, '두 번째부터는 가져오지 않는다');
});

test('추가 시계 — 시간대가 없는 항목은 버리고 나머지는 기본값으로 채운다', () => {
  const { store } = loadStore();
  const s = store.saveSettings({
    extraClocks: [
      { zone: 'Asia/Tokyo', city: '도쿄', theme: 'OceanTheme', isDigital: false, brightness: 300 },
      { city: '시간대 없음' },
      null
    ]
  });

  assert.equal(s.extraClocks.length, 1);
  const clock = s.extraClocks[0];
  assert.equal(clock.zone, 'Asia/Tokyo');
  assert.equal(clock.city, '도쿄');
  assert.equal(clock.theme, 'OceanTheme');
  assert.equal(clock.isDigital, false);
  assert.equal(clock.brightness, 100, '밝기는 10~100 으로 자른다');
  assert.equal(clock.showCity, true, '창에 도시 이름을 보이는 것이 기본');
  assert.ok(clock.id.startsWith('clock-'), '시계마다 이름표를 갖는다');
  for (const key of ['digitalStyle', 'analogStyle', 'use24h', 'digitColor', 'amPmColor', 'customThemeColor']) {
    assert.ok(key in clock, `${key} 가 없다`);
  }
});

test('추가 시계 — 시계마다 설정이 따로 저장된다', () => {
  const { store } = loadStore();
  const saved = store.saveSettings({
    extraClocks: [
      { id: 'c1', zone: 'Asia/Seoul', city: '서울', theme: 'ForestTheme', isDigital: true, use24h: true },
      { id: 'c2', zone: 'America/New_York', city: '뉴욕', theme: 'SepiaTheme', isDigital: false, use24h: false }
    ]
  });

  assert.deepEqual(saved.extraClocks.map((c) => c.theme), ['ForestTheme', 'SepiaTheme']);
  assert.deepEqual(saved.extraClocks.map((c) => c.use24h), [true, false]);
  // 메인 시계의 설정은 그대로다.
  assert.equal(saved.theme, 'DarkTheme');

  const loaded = store.loadSettings();
  assert.deepEqual(loaded.extraClocks.map((c) => c.id), ['c1', 'c2']);
  assert.equal(loaded.extraClocks[1].city, '뉴욕');
});

test('추가 시계 — 알람·타이머는 시계별로 갖지 않는다 (앱이 하나로 들고 있다)', () => {
  const { store } = loadStore();
  const saved = store.saveSettings({
    extraClocks: [{ zone: 'Asia/Seoul', alarms: [{ time: '07:00' }], timers: [{ minutes: 3 }], worldCities: [] }]
  });
  const clock = saved.extraClocks[0];
  for (const key of ['alarms', 'timers', 'worldCities', 'alarmSoundId']) {
    assert.ok(!(key in clock), `${key} 는 시계별 설정이 아니다`);
  }
});

test('분리한 탭 창의 위치·크기를 기억한다', () => {
  const { store } = loadStore();
  const saved = store.saveSettings({
    toolWindows: { alarm: { x: 100, y: 200, width: 420, height: 600 }, 엉뚱: 'x' }
  });
  assert.deepEqual(saved.toolWindows.alarm, { x: 100, y: 200, width: 420, height: 600 });
  assert.ok(!('엉뚱' in saved.toolWindows));
});

test('기본 설정에는 추가 시계가 없다', () => {
  const { store } = loadStore();
  assert.deepEqual(store.defaults().extraClocks, []);
  assert.deepEqual(store.defaults().toolWindows, {});
});

test('메인 시계의 도시 — 비워 두면 이 컴퓨터 시간', () => {
  const { store } = loadStore();
  const d = store.defaults();
  assert.equal(d.zone, null);
  assert.equal(d.city, '');
  assert.equal(d.showCity, true);

  const saved = store.saveSettings({ zone: 'Asia/Tokyo', city: '도쿄' });
  assert.equal(saved.zone, 'Asia/Tokyo');
  assert.equal(saved.city, '도쿄');
  assert.equal(store.saveSettings({ zone: '' }).zone, null, '빈 값은 이 컴퓨터 시간');
});

test('기본값으로 초기화해도 추가한 시계와 창 자리는 남는다', () => {
  const { store } = loadStore();
  store.saveSettings({
    theme: 'SunsetTheme',
    extraClocks: [{ id: 'c1', zone: 'Asia/Tokyo', city: '도쿄', theme: 'ForestTheme' }],
    toolWindows: { alarm: { x: 10, y: 20, width: 420, height: 600 } }
  });

  // 메인 프로세스의 초기화와 같은 방식 — 시계·창 자리는 지금 것을 남긴다.
  const current = store.loadSettings();
  const fresh = store.defaults();
  fresh.extraClocks = current.extraClocks;
  fresh.toolWindows = current.toolWindows;
  const after = store.saveSettings(fresh);

  assert.equal(after.theme, 'DarkTheme', '설정은 처음 상태로');
  assert.equal(after.extraClocks.length, 1, '추가한 시계는 그대로');
  assert.equal(after.extraClocks[0].theme, 'ForestTheme');
  assert.deepEqual(after.toolWindows.alarm, { x: 10, y: 20, width: 420, height: 600 });
});

