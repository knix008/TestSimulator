'use strict';

/**
 * 설정 저장소 — legacy-wpf/Models/SettingsManager.cs 와 AppSettings.cs 의 이식.
 * 저장 위치: app.getPath('userData')/settings.json
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { WIN_TO_IANA } = require('./win-timezones');

const DEFAULT_WORLD_CITIES = [
  { city: '서울', region: '대한민국', zone: 'Asia/Seoul' },
  { city: '도쿄', region: '일본', zone: 'Asia/Tokyo' },
  { city: '베이징', region: '중국', zone: 'Asia/Shanghai' },
  { city: '싱가포르', region: '싱가포르', zone: 'Asia/Singapore' },
  { city: '두바이', region: 'UAE', zone: 'Asia/Dubai' },
  { city: '모스크바', region: '러시아', zone: 'Europe/Moscow' },
  { city: '파리', region: '프랑스', zone: 'Europe/Paris' },
  { city: '런던', region: '영국', zone: 'Europe/London' },
  { city: '뉴욕', region: '미국 동부', zone: 'America/New_York' },
  { city: '시카고', region: '미국 중부', zone: 'America/Chicago' },
  { city: '로스앤젤레스', region: '미국 서부', zone: 'America/Los_Angeles' },
  { city: '시드니', region: '호주', zone: 'Australia/Sydney' },
  { city: '호놀룰루', region: '미국 하와이', zone: 'Pacific/Honolulu' }
];

const DEFAULT_SETTINGS = {
  alwaysOnTop: false,
  use24h: false,
  worldUse24h: false,
  theme: 'DarkTheme',
  brightness: 50,
  digitColor: '#58A6FF',
  amPmColor: '#89B4FA',
  isDigital: true,
  digitalStyle: 'SevenSegment',
  analogStyle: 'Classic',
  windowLeft: null,
  windowTop: null,
  windowWidth: 300,
  windowHeight: 300,
  digitalWindowWidth: null,
  digitalWindowHeight: null,
  digitalWindowLeft: null,
  digitalWindowTop: null,
  analogWindowWidth: null,
  analogWindowHeight: null,
  analogWindowLeft: null,
  analogWindowTop: null,
  alarms: [],
  worldCities: null,
  timers: [{ label: '', hours: 0, minutes: 5, seconds: 0 }],
  alarmSoundId: 'Marimba',
  alarmVolume: 50,
  startWithSystem: false
};

const SETTINGS_FILE = 'settings.json';
const EVENTS_FILE = 'calendar_events.json';

function filePath(name) {
  return path.join(app.getPath('userData'), name);
}

function readJson(name, fallback) {
  try {
    const file = filePath(name);
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  const file = filePath(name);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 크기 값 전용 — 0 이하는 저장되지 않은 것으로 본다. */
function nullablePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hex(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function normalizeAlarm(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const time = typeof src.time === 'string' && /^\d{1,2}:\d{2}$/.test(src.time) ? src.time : '07:00';
  const [h, m] = time.split(':').map(Number);
  return {
    id: typeof src.id === 'string' && src.id ? src.id : `alarm-${Math.random().toString(36).slice(2, 10)}`,
    time: `${String(clamp(h, 0, 23)).padStart(2, '0')}:${String(clamp(m, 0, 59)).padStart(2, '0')}`,
    label: typeof src.label === 'string' ? src.label : '',
    isEnabled: src.isEnabled !== false,
    isRepeat: src.isRepeat === true,
    // 비트 0 = 일요일 … 비트 6 = 토요일 (JS Date.getDay 순서)
    repeatDays: clamp(num(src.repeatDays, 0b1111111), 0, 0b1111111)
  };
}

function normalizeTimer(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    label: typeof src.label === 'string' ? src.label : '',
    hours: clamp(num(src.hours, 0), 0, 99),
    minutes: clamp(num(src.minutes, 5), 0, 59),
    seconds: clamp(num(src.seconds, 0), 0, 59)
  };
}

function normalizeCity(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  if (typeof src.zone !== 'string' || !src.zone) return null;
  return {
    city: typeof src.city === 'string' ? src.city : '',
    region: typeof src.region === 'string' ? src.region : '',
    zone: src.zone
  };
}

function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const cities = Array.isArray(src.worldCities)
    ? src.worldCities.map(normalizeCity).filter(Boolean)
    : null;
  return {
    alwaysOnTop: src.alwaysOnTop === true,
    use24h: src.use24h === true,
    worldUse24h: src.worldUse24h === true,
    theme: typeof src.theme === 'string' && src.theme ? src.theme : DEFAULT_SETTINGS.theme,
    brightness: clamp(num(src.brightness, DEFAULT_SETTINGS.brightness), 0, 100),
    digitColor: hex(src.digitColor, DEFAULT_SETTINGS.digitColor),
    amPmColor: hex(src.amPmColor, DEFAULT_SETTINGS.amPmColor),
    isDigital: src.isDigital !== false,
    digitalStyle: typeof src.digitalStyle === 'string' ? src.digitalStyle : DEFAULT_SETTINGS.digitalStyle,
    analogStyle: typeof src.analogStyle === 'string' ? src.analogStyle : DEFAULT_SETTINGS.analogStyle,
    windowLeft: nullableNum(src.windowLeft),
    windowTop: nullableNum(src.windowTop),
    windowWidth: clamp(num(src.windowWidth, DEFAULT_SETTINGS.windowWidth), 140, 4000),
    windowHeight: clamp(num(src.windowHeight, DEFAULT_SETTINGS.windowHeight), 50, 4000),
    digitalWindowWidth: nullablePositive(src.digitalWindowWidth),
    digitalWindowHeight: nullablePositive(src.digitalWindowHeight),
    digitalWindowLeft: nullableNum(src.digitalWindowLeft),
    digitalWindowTop: nullableNum(src.digitalWindowTop),
    analogWindowWidth: nullablePositive(src.analogWindowWidth),
    analogWindowHeight: nullablePositive(src.analogWindowHeight),
    analogWindowLeft: nullableNum(src.analogWindowLeft),
    analogWindowTop: nullableNum(src.analogWindowTop),
    alarms: Array.isArray(src.alarms) ? src.alarms.map(normalizeAlarm) : [],
    worldCities: cities && cities.length ? cities : null,
    timers: Array.isArray(src.timers) && src.timers.length
      ? src.timers.map(normalizeTimer)
      : DEFAULT_SETTINGS.timers.map(normalizeTimer),
    alarmSoundId: typeof src.alarmSoundId === 'string' ? src.alarmSoundId : DEFAULT_SETTINGS.alarmSoundId,
    alarmVolume: clamp(num(src.alarmVolume, DEFAULT_SETTINGS.alarmVolume), 0, 100),
    startWithSystem: src.startWithSystem === true
  };
}

function loadSettings() {
  return normalizeSettings(readJson(SETTINGS_FILE, null));
}

function saveSettings(patch) {
  const next = normalizeSettings({ ...loadSettings(), ...(patch || {}) });
  writeJson(SETTINGS_FILE, next);
  return next;
}

function defaults() {
  return normalizeSettings(null);
}

function normalizeEvent(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  if (typeof src.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(src.date)) return null;
  return {
    id: typeof src.id === 'string' && src.id ? src.id : `evt-${Math.random().toString(36).slice(2, 10)}`,
    title: typeof src.title === 'string' ? src.title : '',
    date: src.date,
    endDate: typeof src.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.endDate) ? src.endDate : null,
    startTime: typeof src.startTime === 'string' ? src.startTime : '09:00',
    endTime: typeof src.endTime === 'string' ? src.endTime : '10:00',
    isAllDay: src.isAllDay === true,
    description: typeof src.description === 'string' ? src.description : '',
    reminderMinutes: Number.isFinite(Number(src.reminderMinutes)) ? Number(src.reminderMinutes) : null,
    recurrence: ['None', 'Daily', 'Weekly', 'Monthly', 'Yearly'].includes(src.recurrence)
      ? src.recurrence
      : 'None',
    color: hex(src.color, '#4A90D9')
  };
}

function loadEvents() {
  const raw = readJson(EVENTS_FILE, []);
  return Array.isArray(raw) ? raw.map(normalizeEvent).filter(Boolean) : [];
}

function saveEvents(events) {
  const list = Array.isArray(events) ? events.map(normalizeEvent).filter(Boolean) : [];
  writeJson(EVENTS_FILE, list);
  return list;
}

// ── WPF 판(MyClockWinV10) 설정 가져오기 ────────────────────────────────
//
// 두 앱은 저장 폴더가 다르다. 처음 실행할 때 옛 폴더가 있으면 한 번만 읽어오고,
// 원본은 건드리지 않는다 (WPF 판을 계속 쓰더라도 설정이 그대로 남도록).

/** "HH:MM:SS" 또는 .NET TimeSpan 문자열 → "HH:MM" */
function legacyTime(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!match) return '07:00';
  return `${String(Number(match[1]) % 24).padStart(2, '0')}:${match[2]}`;
}

function legacySettingsPath() {
  // Windows: %AppData%\MyClock — WPF 판이 쓰던 위치
  return path.join(app.getPath('appData'), 'MyClock', 'settings.json');
}

function legacyCalendarPath() {
  return path.join(app.getPath('appData'), 'MyClock', 'calendar.json');
}

function readLegacyJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** WPF 판의 PascalCase 설정을 이 앱의 형식으로 옮긴다. */
function convertLegacySettings(raw) {
  const pick = (...names) => {
    for (const name of names) {
      if (raw[name] !== undefined) return raw[name];
    }
    return undefined;
  };

  const cities = pick('WorldCities', 'worldCities');
  const alarmList = pick('Alarms', 'alarms');
  const timerList = pick('Timers', 'timers');

  return {
    alwaysOnTop: pick('AlwaysOnTop') === true,
    use24h: pick('Use24h') === true,
    worldUse24h: pick('WorldUse24h') === true,
    theme: pick('Theme'),
    brightness: pick('Brightness'),
    digitColor: pick('DigitColor'),
    amPmColor: pick('AmPmColor'),
    isDigital: pick('IsDigital') !== false,
    digitalStyle: pick('DigitalStyleName'),
    analogStyle: pick('AnalogStyleName'),
    windowWidth: pick('WindowWidth'),
    windowHeight: pick('WindowHeight'),
    windowLeft: pick('WindowLeft'),
    windowTop: pick('WindowTop'),
    alarmSoundId: pick('AlarmSoundId'),
    alarmVolume: pick('AlarmVolume'),
    alarms: Array.isArray(alarmList)
      ? alarmList.map((a) => ({
          time: legacyTime(a.Time ?? a.time),
          label: a.Label ?? a.label ?? '',
          isEnabled: (a.IsEnabled ?? a.isEnabled) !== false,
          isRepeat: (a.IsRepeat ?? a.isRepeat) === true,
          repeatDays: a.RepeatDays ?? a.repeatDays
        }))
      : [],
    timers: Array.isArray(timerList)
      ? timerList.map((t) => ({
          label: t.Label ?? t.label ?? '',
          hours: t.Hours ?? t.hours ?? 0,
          minutes: t.Minutes ?? t.minutes ?? 5,
          seconds: t.Seconds ?? t.seconds ?? 0
        }))
      : undefined,
    worldCities: Array.isArray(cities)
      ? cities
          .map((c) => {
            const winZone = c.TimeZoneId ?? c.timeZoneId ?? c.zone;
            const zone = WIN_TO_IANA[winZone] || winZone;
            if (!zone || !zone.includes('/')) return null;
            return { city: c.City ?? c.city ?? '', region: c.Region ?? c.region ?? '', zone };
          })
          .filter(Boolean)
      : undefined
  };
}

/** WPF 판의 캘린더 일정을 이 앱의 형식으로 옮긴다. */
function convertLegacyEvents(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      const date = String(e.Date ?? e.date ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      const endDate = String(e.EndDate ?? e.endDate ?? '').slice(0, 10);
      const reminder = e.ReminderMinutes ?? e.reminderMinutes;
      return {
        title: e.Title ?? e.title ?? '',
        date,
        endDate: /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : null,
        startTime: legacyTime(e.StartTime ?? e.startTime ?? '09:00'),
        endTime: legacyTime(e.EndTime ?? e.endTime ?? '10:00'),
        isAllDay: (e.IsAllDay ?? e.isAllDay) === true,
        description: e.Description ?? e.description ?? '',
        reminderMinutes: reminder == null ? null : Number(reminder),
        recurrence: e.Recurrence ?? e.recurrence ?? 'None',
        color: e.Color ?? e.color ?? '#4A90D9'
      };
    })
    .filter(Boolean);
}

/** 설정 파일이 아직 없을 때 한 번만 실행 — 가져온 항목 수를 돌려준다. */
function migrateFromWpfIfNeeded() {
  if (fs.existsSync(filePath(SETTINGS_FILE))) return null;

  const legacySettings = readLegacyJson(legacySettingsPath());
  const legacyEvents = readLegacyJson(legacyCalendarPath());
  if (!legacySettings && !legacyEvents) return null;

  const result = { settings: false, events: 0 };
  if (legacySettings) {
    saveSettings(convertLegacySettings(legacySettings));
    result.settings = true;
  }
  if (legacyEvents && !fs.existsSync(filePath(EVENTS_FILE))) {
    result.events = saveEvents(convertLegacyEvents(legacyEvents)).length;
  }
  return result;
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_WORLD_CITIES,
  defaults,
  loadSettings,
  saveSettings,
  loadEvents,
  saveEvents,
  migrateFromWpfIfNeeded
};
