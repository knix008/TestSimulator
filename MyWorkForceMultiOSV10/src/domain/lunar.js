// The Korean (and Chinese) lunisolar calendar, worked out from the sky: new moons (Meeus, Astronomical
// Algorithms ch. 49) and the Sun's longitude (ch. 25), in the country's own time zone — Korea counts days in
// UTC+9, China in UTC+8, which is why the two sometimes start a month on different days (2027: 설날 is
// February 7 in Korea, 春节 February 6 in China).
//
// Rules: a month starts on the day of a new moon; the month holding the winter solstice is the 11th; in a year
// of thirteen months (solstice to solstice) the first month without a principal solar term (a multiple of 30°
// of solar longitude) is the leap month, numbered like the month before it.
//
// Days are handled as UTC midnight time values (the same as schedule.js dayOf), meaning that calendar day.

const DAY = 86_400_000;
const RAD = Math.PI / 180;
const sin = (deg) => Math.sin(deg * RAD);

/** TT − UT in seconds (NASA polynomial fits by Espenak & Meeus). */
function deltaT(year) {
  const t = year - 2000;
  if (year >= 2005 && year < 2050) return 62.92 + 0.32217 * t + 0.005589 * t * t;
  if (year >= 1986 && year < 2005) return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5;
  if (year >= 2050 && year < 2150) return -20 + 32 * ((year - 1820) / 100) ** 2 - 0.5628 * (2150 - year);
  if (year >= 1961 && year < 1986) { const u = year - 1975; return 45.45 + 1.067 * u - u * u / 260 - u ** 3 / 718; }
  if (year >= 1941 && year < 1961) { const u = year - 1950; return 29.07 + 0.407 * u - u * u / 233 + u ** 3 / 2547; }
  if (year >= 1920 && year < 1941) { const u = year - 1920; return 21.2 + 0.84493 * u - 0.0761 * u * u + 0.0020936 * u ** 3; }
  if (year >= 1900 && year < 1920) { const u = year - 1900; return -2.79 + 1.494119 * u - 0.0598939 * u * u + 0.0061966 * u ** 3 - 0.000197 * u ** 4; }
  const u = (year - 1820) / 100;
  return -20 + 32 * u * u;
}

const jdToMs = (jd) => (jd - 2440587.5) * DAY;
const msToJd = (ms) => ms / DAY + 2440587.5;

/** The new moon with lunation number k (k = 0 near 2000-01-06), as a UT Julian day. */
function newMoon(k) {
  const T = k / 1236.85;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T * T - 0.00000011 * T ** 3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T ** 3 - 0.000000058 * T ** 4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T ** 3 + 0.000000011 * T ** 4;
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T ** 3;
  jde += -0.4072 * sin(Mp) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * Mp) + 0.01039 * sin(2 * F)
    + 0.00739 * E * sin(Mp - M) - 0.00514 * E * sin(Mp + M) + 0.00208 * E * E * sin(2 * M)
    - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M)
    - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
    - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(O) - 0.00007 * sin(Mp + 2 * M)
    + 0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F)
    + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F) + 0.00003 * sin(Mp - M + 2 * F)
    - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
  const A = [
    [299.77 + 0.107408 * k - 0.009173 * T * T, 0.000325], [251.88 + 0.016321 * k, 0.000165], [251.83 + 26.651886 * k, 0.000164],
    [349.42 + 36.412478 * k, 0.000126], [84.66 + 18.206239 * k, 0.00011], [141.74 + 53.303771 * k, 0.000062],
    [207.14 + 2.453732 * k, 0.00006], [154.84 + 7.30686 * k, 0.000056], [34.52 + 27.261239 * k, 0.000047],
    [207.19 + 0.121824 * k, 0.000042], [291.34 + 1.844379 * k, 0.00004], [161.72 + 24.198154 * k, 0.000037],
    [239.56 + 25.513099 * k, 0.000035], [331.55 + 3.592518 * k, 0.000023],
  ];
  for (const [angle, c] of A) jde += c * sin(angle);
  const year = 2000 + k / 12.3685;
  return jde - deltaT(year) / 86400;
}

/** The Sun's apparent longitude in degrees at a UT Julian day (about 0.01°). */
export function sunLongitude(jdUt) {
  const year = 2000 + (jdUt - 2451545) / 365.25;
  const T = (jdUt + deltaT(year) / 86400 - 2451545) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * sin(omega);
  return ((lambda % 360) + 360) % 360;
}

/** The UT Julian day when the Sun reaches a longitude, searched near `jdGuess`. */
function sunAt(target, jdGuess) {
  let jd = jdGuess;
  for (let i = 0; i < 12; i += 1) {
    let diff = target - sunLongitude(jd);
    diff = ((diff + 540) % 360) - 180;
    jd += (diff / 360) * 365.2422;
    if (Math.abs(diff) < 1e-6) break;
  }
  return jd;
}

/** The local calendar day (UTC-midnight time value) of a UT Julian day in a zone `tz` hours east of UTC. */
const localDay = (jd, tz) => Math.floor((jdToMs(jd) + tz * 3600000) / DAY) * DAY;

/** The UT Julian day of local midnight starting a local day. */
const dayStartJd = (day, tz) => msToJd(day - tz * 3600000);

/** The day of the solar term at `longitude` degrees in a Gregorian year (e.g. 270 = winter solstice). */
export function solarTermDay(year, longitude, tz = 9) {
  // The Sun is at about 280° on January 1: every term of the year is found from there, inside that year.
  const guess = msToJd(Date.UTC(year, 0, 1)) + ((((longitude - 280) % 360) + 360) % 360) / 360 * 365.2422;
  return localDay(sunAt(longitude, guess), tz);
}

/** The new-moon day on or before a day, and the lunation number. */
function newMoonOnOrBefore(day, tz) {
  let k = Math.floor((day - Date.UTC(2000, 0, 6)) / (29.530588861 * DAY));
  while (localDay(newMoon(k + 1), tz) <= day) k += 1;
  while (localDay(newMoon(k), tz) > day) k -= 1;
  return k;
}

const cache = new Map();

/**
 * The months of the "sui" ending at the winter solstice of a Gregorian year: from the 11th month that holds the
 * previous solstice to (not including) the 11th month holding this one. [{ start, end, month, leap, year }]
 */
function sui(year, tz) {
  const key = `${year}:${tz}`;
  if (cache.has(key)) return cache.get(key);
  const solstice1 = solarTermDay(year - 1, 270, tz);
  const solstice2 = solarTermDay(year, 270, tz);
  const k1 = newMoonOnOrBefore(solstice1, tz);
  const k2 = newMoonOnOrBefore(solstice2, tz);
  const starts = [];
  for (let k = k1; k <= k2; k += 1) starts.push(localDay(newMoon(k), tz));
  const count = starts.length - 1; // months from one 11th month to the next: 12, or 13 with a leap month
  const hasPrincipalTerm = (i) => {
    const a = sunLongitude(dayStartJd(starts[i], tz));
    const b = sunLongitude(dayStartJd(starts[i + 1], tz));
    // The Sun moves about 29° in a month: one crossing of a multiple of 30° at most (passing 360° is one).
    return b < a || Math.floor(a / 30) !== Math.floor(b / 30);
  };
  let leapAt = -1;
  if (count === 13) {
    for (let i = 1; i < count; i += 1) if (!hasPrincipalTerm(i)) { leapAt = i; break; }
  }
  const months = [];
  let number = 11;
  for (let i = 0; i < count; i += 1) {
    const leap = i === leapAt;
    if (i > 0 && !leap) number = number === 12 ? 1 : number + 1;
    // Months 11 and 12 (and a leap one among them) at the start belong to the lunar year before.
    const lunarYear = i < 3 && number >= 11 ? year - 1 : year;
    months.push({ start: starts[i], end: starts[i + 1], month: number, leap, year: lunarYear });
  }
  cache.set(key, months);
  return months;
}

/** The lunar date of a day: { year, month, day, leap, monthDays }. */
export function toLunar(day, tz = 9) {
  const d = new Date(day);
  const value = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  for (const year of [d.getUTCFullYear(), d.getUTCFullYear() + 1]) {
    const month = sui(year, tz).find((item) => value >= item.start && value < item.end);
    if (month) return { year: month.year, month: month.month, day: Math.round((value - month.start) / DAY) + 1, leap: month.leap, monthDays: Math.round((month.end - month.start) / DAY) };
  }
  return null;
}

/** The day of a lunar date (null when that date does not exist, e.g. a 30th in a 29-day month or no such leap month). */
export function fromLunar(year, month, day, leap = false, tz = 9) {
  const holder = month >= 11 ? year + 1 : year;
  for (const y of [holder, holder + 1]) {
    const found = sui(y, tz).find((item) => item.year === year && item.month === month && item.leap === leap);
    if (found) {
      if (day < 1 || day > Math.round((found.end - found.start) / DAY)) return null;
      return found.start + (day - 1) * DAY;
    }
  }
  return null;
}

/** The last day of a lunar month (29 or 30). */
export function lunarMonthLength(year, month, leap = false, tz = 9) {
  const start = fromLunar(year, month, 1, leap, tz);
  if (start == null) return 0;
  return toLunar(start, tz).monthDays;
}

/** The 24 solar terms: [longitude, Korean name, English name]. */
export const SOLAR_TERMS = [
  [315, '입춘', 'Start of Spring'], [330, '우수', 'Rain Water'], [345, '경칩', 'Awakening of Insects'], [0, '춘분', 'Spring Equinox'],
  [15, '청명', 'Clear and Bright'], [30, '곡우', 'Grain Rain'], [45, '입하', 'Start of Summer'], [60, '소만', 'Grain Full'],
  [75, '망종', 'Grain in Ear'], [90, '하지', 'Summer Solstice'], [105, '소서', 'Minor Heat'], [120, '대서', 'Major Heat'],
  [135, '입추', 'Start of Autumn'], [150, '처서', 'End of Heat'], [165, '백로', 'White Dew'], [180, '추분', 'Autumn Equinox'],
  [195, '한로', 'Cold Dew'], [210, '상강', 'Frost Descent'], [225, '입동', 'Start of Winter'], [240, '소설', 'Minor Snow'],
  [255, '대설', 'Major Snow'], [270, '동지', 'Winter Solstice'], [285, '소한', 'Minor Cold'], [300, '대한', 'Major Cold'],
];

/** The solar terms falling in a Gregorian year, in date order: [{ day, ko, en, longitude }]. */
export function solarTerms(year, tz = 9) {
  return SOLAR_TERMS.map(([longitude, ko, en]) => ({ day: solarTermDay(year, longitude, tz), ko, en, longitude })).sort((x, y) => x.day - y.day);
}

/** "음 3.15" / "윤 4.1" style text (lang 'ko'), or "L3/15" (lang 'en'). */
export function lunarLabel(lunar, lang = 'ko') {
  if (!lunar) return '';
  if (lang === 'en') return `${lunar.leap ? 'L+' : 'L'}${lunar.month}/${lunar.day}`;
  return `${lunar.leap ? '윤' : '음'} ${lunar.month}.${lunar.day}`;
}
