// What a calendar day shows beside its date: the lunar date, the main lunar days, the solar terms and the public
// holidays of a country — following the person's calendar settings (설정 → 달력):
//   calendarLunar (on)  calendarLunarDays (on)  calendarSolarTerms (off)  calendarHolidays (on)
//   calendarPrimary ('solar' | 'lunar')        holidayCountry ('auto' = the work calendar's country)
import { HOLIDAY_COUNTRIES, holidaysOf, lunarDaysOf } from '../domain/holidays.js';
import { lunarLabel, solarTerms, toLunar } from '../domain/lunar.js';
import { calendarOf } from '../domain/services.js';
import { getLanguage } from '../i18n.js';

const lunarDayCache = new Map();
const termCache = new Map();

function byDay(list) {
  const map = new Map();
  for (const item of list) map.set(item.day, [...(map.get(item.day) || []), item]);
  return map;
}

/** The calendar options with their defaults. */
export function calendarOptions(ctx) {
  const settings = ctx.settings || {};
  const chosen = settings.holidayCountry && settings.holidayCountry !== 'auto' ? settings.holidayCountry : '';
  const work = calendarOf(ctx.ws)?.country;
  const country = chosen || work || (getLanguage() === 'en' ? 'US' : 'KR');
  return {
    lunar: settings.calendarLunar !== false,
    lunarDays: settings.calendarLunarDays !== false,
    terms: settings.calendarSolarTerms === true,
    holidays: settings.calendarHolidays !== false,
    primary: settings.calendarPrimary === 'lunar' ? 'lunar' : 'solar',
    country: HOLIDAY_COUNTRIES.some((item) => item.id === country) ? country : 'KR',
  };
}

/**
 * A function giving a day's marks: { lunar: '10.11' | '', lunarFull: '음 10.11', holiday: name | '', red: bool,
 * lunarDay: name | '', term: name | '' }.
 */
export function dayMarks(ctx) {
  const options = calendarOptions(ctx);
  const en = getLanguage() === 'en';
  const years = new Map();
  const forYear = (year) => {
    if (!years.has(year)) {
      if (!lunarDayCache.has(year)) lunarDayCache.set(year, byDay(lunarDaysOf(year)));
      if (!termCache.has(year)) termCache.set(year, byDay(solarTerms(year, 9)));
      years.set(year, {
        holidays: byDay(options.holidays ? holidaysOf(options.country, year) : []),
        lunarDays: options.lunarDays ? lunarDayCache.get(year) : new Map(),
        terms: options.terms ? termCache.get(year) : new Map(),
      });
    }
    return years.get(year);
  };
  return (day) => {
    const year = new Date(day).getUTCFullYear();
    const tables = forYear(year);
    const holiday = (tables.holidays.get(day) || [])[0];
    const lunarDay = (tables.lunarDays.get(day) || [])[0];
    const term = (tables.terms.get(day) || [])[0];
    const lunar = options.lunar || options.primary === 'lunar' ? toLunar(day, 9) : null;
    const short = lunar ? `${lunar.leap ? (en ? 'L' : '윤') : ''}${lunar.month}.${lunar.day}` : '';
    return {
      lunar: short,
      lunarFull: lunarLabel(lunar, en ? 'en' : 'ko'),
      lunarFirst: Boolean(lunar && lunar.day === 1),
      holiday: holiday ? (en ? holiday.en : holiday.ko) : '',
      red: Boolean(holiday),
      lunarDay: lunarDay && (!holiday || !(en ? holiday.en : holiday.ko).includes(en ? lunarDay.en : lunarDay.ko)) ? (en ? lunarDay.en : lunarDay.ko) : '',
      term: term ? (en ? term.en : term.ko) : '',
      primary: options.primary,
    };
  };
}
