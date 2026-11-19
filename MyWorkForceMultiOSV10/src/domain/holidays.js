// Public holidays by country, and the main days of the lunar calendar, for the planner and for working days.
//
//   holidaysOf(country, year)  → [{ day, ko, en, substitute? }]   (day = UTC-midnight time value)
//   lunarDaysOf(year)          → [{ day, ko, en, lunar }]          설날, 정월대보름, 단오, 칠석, 추석 …
//   isHoliday(country, day)    → the holiday on that day, or null
//
// Countries: KR (Korea, with 대체공휴일), US (federal, observed on Friday / Monday), JP (振替休日 and 国民の休日),
// CN (statutory days; the yearly adjusted working days are not included), GB (England and Wales bank holidays).
// Korean lunar days are counted in UTC+9, Chinese ones in UTC+8 (lunar.js).
import { fromLunar, lunarMonthLength, solarTermDay } from './lunar.js';

const DAY = 86_400_000;
const D = (y, m, d) => Date.UTC(y, m - 1, d);
const weekday = (day) => new Date(day).getUTCDay();

export const HOLIDAY_COUNTRIES = [
  { id: 'KR', ko: '대한민국', en: 'Korea', tz: 9 },
  { id: 'US', ko: '미국', en: 'United States', tz: -5 },
  { id: 'JP', ko: '일본', en: 'Japan', tz: 9 },
  { id: 'CN', ko: '중국', en: 'China', tz: 8 },
  { id: 'GB', ko: '영국', en: 'United Kingdom', tz: 0 },
  { id: 'none', ko: '공휴일 없음', en: 'No public holidays', tz: 9 },
];

/** The n-th (1-based; −1 = last) given weekday (0 = Sunday) of a month. */
function nthWeekday(year, month, dow, n) {
  if (n < 0) {
    let day = D(year, month + 1, 0);
    while (weekday(day) !== dow) day -= DAY;
    return day;
  }
  let day = D(year, month, 1);
  while (weekday(day) !== dow) day += DAY;
  return day + (n - 1) * 7 * DAY;
}

/** Easter Sunday (Gregorian, anonymous algorithm). */
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return D(year, month, day);
}

const H = (day, ko, en, extra = {}) => ({ day, ko, en, ...extra });

// ── Korea ──

function korea(year) {
  const list = [];
  const lunar = (month, day) => fromLunar(year, month, day, false, 9);
  const seollal = lunar(1, 1);
  const eve = seollal != null ? seollal - DAY : null;
  const chuseok = lunar(8, 15);
  const buddha = lunar(4, 8);
  list.push(H(D(year, 1, 1), '신정', "New Year's Day"));
  if (seollal != null) list.push(H(eve, '설날 연휴', 'Seollal holiday', { group: 'seollal' }), H(seollal, '설날', 'Seollal (Lunar New Year)', { group: 'seollal' }), H(seollal + DAY, '설날 연휴', 'Seollal holiday', { group: 'seollal' }));
  list.push(H(D(year, 3, 1), '삼일절', 'Independence Movement Day', { sub: year >= 2022 ? 'weekend' : '' }));
  list.push(H(D(year, 5, 5), '어린이날', "Children's Day", { sub: year >= 2015 ? 'weekend' : '' }));
  if (buddha != null) list.push(H(buddha, '부처님오신날', "Buddha's Birthday", { sub: year >= 2023 ? 'weekend' : '' }));
  list.push(H(D(year, 6, 6), '현충일', 'Memorial Day'));
  list.push(H(D(year, 8, 15), '광복절', 'Liberation Day', { sub: year >= 2021 ? 'weekend' : '' }));
  if (chuseok != null) list.push(H(chuseok - DAY, '추석 연휴', 'Chuseok holiday', { group: 'chuseok' }), H(chuseok, '추석', 'Chuseok', { group: 'chuseok' }), H(chuseok + DAY, '추석 연휴', 'Chuseok holiday', { group: 'chuseok' }));
  list.push(H(D(year, 10, 3), '개천절', 'National Foundation Day', { sub: year >= 2021 ? 'weekend' : '' }));
  list.push(H(D(year, 10, 9), '한글날', 'Hangul Day', { sub: year >= 2021 ? 'weekend' : '' }));
  list.push(H(D(year, 12, 25), '성탄절', 'Christmas Day', { sub: year >= 2023 ? 'weekend' : '' }));
  // 대체공휴일: 설날·추석 연휴가 일요일이나 다른 공휴일과 겹치면, 그 밖의 공휴일은 토·일요일(또는 다른 공휴일)과
  // 겹치면 그다음 첫 평일을 쉽니다 (2014년부터 설날·추석·어린이날, 2021~2023년 사이 나머지 국경일·부처님오신날·성탄절).
  const taken = (day) => list.some((item) => item.day === day);
  const nextFree = (from) => {
    let day = from + DAY;
    while (weekday(day) === 0 || weekday(day) === 6 || taken(day)) day += DAY;
    return day;
  };
  const extra = [];
  if (year >= 2014) {
    for (const group of ['seollal', 'chuseok']) {
      const days = list.filter((item) => item.group === group);
      if (!days.length) continue;
      const overlaps = days.filter((item) => weekday(item.day) === 0 || list.some((other) => other !== item && other.day === item.day && other.group !== group)).length;
      let last = days[days.length - 1].day;
      for (let n = 0; n < overlaps; n += 1) {
        const free = nextFree(last);
        extra.push(H(free, `대체공휴일(${group === 'seollal' ? '설날' : '추석'})`, `Substitute holiday (${group === 'seollal' ? 'Seollal' : 'Chuseok'})`, { substitute: true }));
        list.push(extra[extra.length - 1]);
        last = free;
      }
    }
  }
  // One substitute per day: two holidays on one day (2025: 어린이날 and 부처님오신날) give a single day off, and
  // a day that is part of 설날 or 추석 was counted above already.
  const days = [...new Set(list.filter((entry) => entry.sub === 'weekend').map((entry) => entry.day))].sort((a, b) => a - b);
  for (const day of days) {
    const here = list.filter((other) => other.day === day && !other.substitute);
    if (here.some((other) => other.group)) continue;
    const weekend = weekday(day) === 0 || weekday(day) === 6;
    if (!weekend && here.length < 2) continue;
    const named = here.find((other) => other.sub === 'weekend');
    const sub = H(nextFree(day), `대체공휴일(${named.ko})`, `Substitute holiday (${named.en})`, { substitute: true });
    extra.push(sub);
    list.push(sub);
  }
  return list;
}

// ── United States (federal) ──

function unitedStates(year) {
  const fixed = (day, ko, en) => {
    const out = [H(day, ko, en)];
    if (weekday(day) === 6) out.push(H(day - DAY, `${ko} (대체)`, `${en} (observed)`, { substitute: true }));
    if (weekday(day) === 0) out.push(H(day + DAY, `${ko} (대체)`, `${en} (observed)`, { substitute: true }));
    return out;
  };
  return [
    ...fixed(D(year, 1, 1), '새해 첫날', "New Year's Day"),
    H(nthWeekday(year, 1, 1, 3), '마틴 루서 킹 데이', 'Martin Luther King Jr. Day'),
    H(nthWeekday(year, 2, 1, 3), '대통령의 날', "Washington's Birthday"),
    H(nthWeekday(year, 5, 1, -1), '현충일', 'Memorial Day'),
    ...(year >= 2021 ? fixed(D(year, 6, 19), '준틴스', 'Juneteenth') : []),
    ...fixed(D(year, 7, 4), '독립기념일', 'Independence Day'),
    H(nthWeekday(year, 9, 1, 1), '노동절', 'Labor Day'),
    H(nthWeekday(year, 10, 1, 2), '콜럼버스 데이', 'Columbus Day'),
    ...fixed(D(year, 11, 11), '재향군인의 날', 'Veterans Day'),
    H(nthWeekday(year, 11, 4, 4), '추수감사절', 'Thanksgiving Day'),
    ...fixed(D(year, 12, 25), '크리스마스', 'Christmas Day'),
  ];
}

// ── Japan ──

function japan(year) {
  const shift = year - 1980;
  const spring = D(year, 3, Math.floor(20.8431 + 0.242194 * shift - Math.floor(shift / 4)));
  const autumn = D(year, 9, Math.floor(23.2488 + 0.242194 * shift - Math.floor(shift / 4)));
  const list = [
    H(D(year, 1, 1), '설날 (元日)', "New Year's Day"),
    H(nthWeekday(year, 1, 1, 2), '성인의 날', 'Coming of Age Day'),
    H(D(year, 2, 11), '건국기념일', 'National Foundation Day'),
    ...(year >= 2020 ? [H(D(year, 2, 23), '천황탄생일', "Emperor's Birthday")] : []),
    H(spring, '춘분의 날', 'Vernal Equinox Day'),
    H(D(year, 4, 29), '쇼와의 날', 'Showa Day'),
    H(D(year, 5, 3), '헌법기념일', 'Constitution Memorial Day'),
    H(D(year, 5, 4), '녹색의 날', 'Greenery Day'),
    H(D(year, 5, 5), '어린이날', "Children's Day"),
    H(nthWeekday(year, 7, 1, 3), '바다의 날', 'Marine Day'),
    H(D(year, 8, 11), '산의 날', 'Mountain Day'),
    H(nthWeekday(year, 9, 1, 3), '경로의 날', 'Respect for the Aged Day'),
    H(autumn, '추분의 날', 'Autumnal Equinox Day'),
    H(nthWeekday(year, 10, 1, 2), '스포츠의 날', 'Sports Day'),
    H(D(year, 11, 3), '문화의 날', 'Culture Day'),
    H(D(year, 11, 23), '근로감사의 날', 'Labor Thanksgiving Day'),
  ];
  const taken = (day) => list.some((item) => item.day === day);
  // 国民の休日: a weekday between two holidays.
  for (const item of [...list]) {
    const middle = item.day + DAY;
    if (!taken(middle) && taken(middle + DAY) && weekday(middle) !== 0) list.push(H(middle, '국민의 휴일', "Citizens' Holiday"));
  }
  // 振替休日: a holiday on Sunday moves to the next day that is not a holiday.
  for (const item of list.filter((entry) => weekday(entry.day) === 0)) {
    let day = item.day + DAY;
    while (taken(day)) day += DAY;
    list.push(H(day, `대체 휴일(${item.ko})`, `Substitute holiday (${item.en})`, { substitute: true }));
  }
  return list;
}

// ── China ──

function china(year) {
  const lunar = (month, day) => fromLunar(year, month, day, false, 8);
  const spring = lunar(1, 1);
  const eveYear = year - 1;
  const lastMonth = lunarMonthLength(eveYear, 12, false, 8);
  const eve = lastMonth ? fromLunar(eveYear, 12, lastMonth, false, 8) : null;
  const list = [H(D(year, 1, 1), '위안단 (元旦)', "New Year's Day")];
  if (year >= 2025 && eve != null) list.push(H(eve, '춘절 전야 (除夕)', 'Spring Festival Eve'));
  if (spring != null) for (let i = 0; i < (year >= 2025 ? 3 : 3); i += 1) list.push(H(spring + i * DAY, '춘절 (春节)', 'Spring Festival'));
  list.push(H(solarTermDay(year, 15, 8), '청명절 (清明)', 'Qingming Festival'));
  list.push(H(D(year, 5, 1), '노동절 (劳动节)', 'Labour Day'));
  if (year >= 2025) list.push(H(D(year, 5, 2), '노동절 (劳动节)', 'Labour Day'));
  const dragon = lunar(5, 5);
  if (dragon != null) list.push(H(dragon, '단오절 (端午)', 'Dragon Boat Festival'));
  const moon = lunar(8, 15);
  if (moon != null) list.push(H(moon, '중추절 (中秋)', 'Mid-Autumn Festival'));
  for (let i = 0; i < 3; i += 1) list.push(H(D(year, 10, 1) + i * DAY, '국경절 (国庆)', 'National Day'));
  return list;
}

// ── United Kingdom (England and Wales) ──

function britain(year) {
  const list = [];
  const newYear = D(year, 1, 1);
  list.push(H(newYear, '새해 첫날', "New Year's Day"));
  if (weekday(newYear) === 6 || weekday(newYear) === 0) list.push(H(newYear + (weekday(newYear) === 6 ? 2 : 1) * DAY, '새해 첫날 (대체)', "New Year's Day (substitute)", { substitute: true }));
  const sunday = easter(year);
  list.push(H(sunday - 2 * DAY, '성금요일', 'Good Friday'), H(sunday + DAY, '부활절 월요일', 'Easter Monday'));
  list.push(H(nthWeekday(year, 5, 1, 1), '5월 초 공휴일', 'Early May bank holiday'));
  list.push(H(nthWeekday(year, 5, 1, -1), '봄 공휴일', 'Spring bank holiday'));
  list.push(H(nthWeekday(year, 8, 1, -1), '여름 공휴일', 'Summer bank holiday'));
  const christmas = D(year, 12, 25);
  list.push(H(christmas, '크리스마스', 'Christmas Day'), H(christmas + DAY, '박싱 데이', 'Boxing Day'));
  // Christmas or Boxing Day on a weekend: the next weekdays are taken instead.
  const w = weekday(christmas);
  if (w === 6) list.push(H(christmas + 2 * DAY, '크리스마스 (대체)', 'Christmas Day (substitute)', { substitute: true }), H(christmas + 3 * DAY, '박싱 데이 (대체)', 'Boxing Day (substitute)', { substitute: true }));
  if (w === 0) list.push(H(christmas + 2 * DAY, '크리스마스 (대체)', 'Christmas Day (substitute)', { substitute: true }));
  if (w === 5) list.push(H(christmas + 3 * DAY, '박싱 데이 (대체)', 'Boxing Day (substitute)', { substitute: true }));
  return list;
}

const MAKERS = { KR: korea, US: unitedStates, JP: japan, CN: china, GB: britain };
const yearCache = new Map();

/** The public holidays of a country in a year, in date order (one entry per day; names joined if two fall together). */
export function holidaysOf(country, year) {
  const key = `${country}:${year}`;
  if (yearCache.has(key)) return yearCache.get(key);
  const make = MAKERS[country];
  const merged = new Map();
  for (const item of make ? make(year) : []) {
    if (new Date(item.day).getUTCFullYear() !== year) continue;
    const same = merged.get(item.day);
    if (!same) merged.set(item.day, { day: item.day, ko: item.ko, en: item.en, substitute: Boolean(item.substitute) });
    else if (!same.ko.split(' · ').includes(item.ko)) { same.ko = `${same.ko} · ${item.ko}`; same.en = `${same.en} · ${item.en}`; same.substitute = same.substitute && Boolean(item.substitute); }
  }
  const list = [...merged.values()].sort((a, b) => a.day - b.day);
  yearCache.set(key, list);
  return list;
}

/** The holiday on a day in a country, or null. */
export function isHoliday(country, day) {
  if (!country || country === 'none') return null;
  return holidaysOf(country, new Date(day).getUTCFullYear()).find((item) => item.day === day) || null;
}

/** The main days of the Korean lunar calendar in a Gregorian year (and 한식, 동지 from the solar terms). */
export function lunarDaysOf(year) {
  const out = [];
  for (const lunarYear of [year - 1, year]) {
    const at = (month, day) => fromLunar(lunarYear, month, day, false, 9);
    const add = (day, ko, en, lunar) => { if (day != null && new Date(day).getUTCFullYear() === year) out.push({ day, ko, en, lunar }); };
    add(at(1, 1), '설날', 'Seollal', '1.1');
    add(at(1, 15), '정월대보름', 'First full moon', '1.15');
    add(at(3, 3), '삼짇날', 'Samjinnal', '3.3');
    add(at(4, 8), '부처님오신날', "Buddha's Birthday", '4.8');
    add(at(5, 5), '단오', 'Dano', '5.5');
    add(at(6, 15), '유두', 'Yudu', '6.15');
    add(at(7, 7), '칠석', 'Chilseok', '7.7');
    add(at(7, 15), '백중', 'Baekjung', '7.15');
    add(at(8, 15), '추석', 'Chuseok', '8.15');
    add(at(9, 9), '중양절', 'Jungyangjeol', '9.9');
    const last = lunarMonthLength(lunarYear, 12, false, 9);
    if (last) add(fromLunar(lunarYear, 12, last, false, 9), '섣달그믐', "Lunar New Year's Eve", `12.${last}`);
  }
  const winter = solarTermDay(year, 270, 9);
  out.push({ day: winter, ko: '동지', en: 'Winter solstice', lunar: '' });
  // 한식: 105 days after the previous winter solstice.
  out.push({ day: solarTermDay(year - 1, 270, 9) + 105 * DAY, ko: '한식', en: 'Hansik', lunar: '' });
  return out.filter((item) => new Date(item.day).getUTCFullYear() === year).sort((a, b) => a.day - b.day);
}
