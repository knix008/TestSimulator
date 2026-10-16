// Working-time calendars and the arithmetic the scheduler needs: moving a
// moment forward or backward by an amount of working time, and measuring the
// working time between two moments.
//
// calendar = {
//   id, name, base: null | id of the calendar it is based on,
//   week: { 0: [[480, 720], [780, 1020]], …, 6: [] }   weekday → working periods (minutes of the day),
//           a missing weekday means "same as the base calendar",
//   exceptions: [{ id, name, start: 'YYYY-MM-DD', finish: 'YYYY-MM-DD', working: false, periods: [[…]] }],
// }
import { MINUTES_PER_DAY, dayFromIso, dayOf, dayStart, weekdayOfDay } from './time.js';

const STANDARD_DAY = [[8 * 60, 12 * 60], [13 * 60, 17 * 60]];
const NIGHT = { start: [[23 * 60, 24 * 60]], middle: [[0, 3 * 60], [4 * 60, 8 * 60], [23 * 60, 24 * 60]], end: [[0, 3 * 60], [4 * 60, 8 * 60]] };

export function standardCalendar(name = 'Standard') {
  return { id: 'standard', name, base: null, week: { 0: [], 1: STANDARD_DAY, 2: STANDARD_DAY, 3: STANDARD_DAY, 4: STANDARD_DAY, 5: STANDARD_DAY, 6: [] }, exceptions: [] };
}

export function allDayCalendar(name = '24 Hours') {
  const all = [[0, MINUTES_PER_DAY]];
  return { id: '24hours', name, base: null, week: { 0: all, 1: all, 2: all, 3: all, 4: all, 5: all, 6: all }, exceptions: [] };
}

export function nightShiftCalendar(name = 'Night Shift') {
  // Monday 23:00 … Saturday 08:00, with a one-hour break at 03:00.
  return { id: 'night', name, base: null, week: { 0: [], 1: NIGHT.start, 2: NIGHT.middle, 3: NIGHT.middle, 4: NIGHT.middle, 5: NIGHT.middle, 6: NIGHT.end }, exceptions: [] };
}

export const defaultCalendars = (names = {}) => [standardCalendar(names.standard), allDayCalendar(names.allDay), nightShiftCalendar(names.night)];

/** Sorted, merged, clipped periods; invalid ones dropped. */
export function normalizePeriods(periods) {
  const list = (Array.isArray(periods) ? periods : [])
    .map((p) => [Math.round(Number(p?.[0])), Math.round(Number(p?.[1]))])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .map(([s, e]) => [Math.max(0, s), Math.min(MINUTES_PER_DAY, e)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const period of list) {
    const last = merged[merged.length - 1];
    if (last && period[0] <= last[1]) last[1] = Math.max(last[1], period[1]);
    else merged.push([...period]);
  }
  return merged;
}

export const periodMinutes = (periods) => periods.reduce((sum, [s, e]) => sum + e - s, 0);

/** Working time of a calendar on one day (day number): the periods of that day. */
export class CalendarEngine {
  constructor(calendars, id) {
    this.calendars = calendars;
    this.calendar = calendars.find((item) => item.id === id) ?? calendars[0] ?? standardCalendar();
    this.cache = new Map();
    // Exceptions by day, own ones over the base calendar's.
    this.exceptions = new Map();
    const chain = [];
    for (let cal = this.calendar, guard = 0; cal && guard < 10; cal = calendars.find((item) => item.id === cal.base), guard += 1) chain.unshift(cal);
    this.chain = chain;
    for (const cal of chain) {
      for (const exception of cal.exceptions ?? []) {
        const from = dayFromIso(exception.start);
        const to = dayFromIso(exception.finish ?? exception.start) ?? from;
        if (from == null) continue;
        const periods = exception.working ? normalizePeriods(exception.periods) : [];
        for (let day = from; day <= to && day - from < 3660; day++) this.exceptions.set(day, periods);
      }
    }
    // Weekly pattern: the nearest calendar in the chain that defines the weekday.
    this.week = [];
    for (let wd = 0; wd < 7; wd++) {
      let periods = [];
      for (const cal of chain) if (cal.week && Array.isArray(cal.week[wd])) periods = normalizePeriods(cal.week[wd]);
      this.week.push(periods);
    }
    this.hasWork = this.week.some((periods) => periods.length) || [...this.exceptions.values()].some((periods) => periods.length);
  }

  periods(day) {
    let periods = this.cache.get(day);
    if (!periods) {
      periods = this.exceptions.get(day) ?? this.week[weekdayOfDay(day)];
      this.cache.set(day, periods);
    }
    return periods;
  }

  isWorkingDay(day) {
    return this.periods(day).length > 0;
  }

  dayMinutes(day) {
    return periodMinutes(this.periods(day));
  }

  /** The working moment at or after `t` (a task start never lands in a break). */
  snapForward(t) {
    let day = dayOf(t);
    for (let guard = 0; guard < 366 * 20; guard++, day++) {
      const base = dayStart(day);
      for (const [s, e] of this.periods(day)) {
        if (t < base + e) return Math.max(t, base + s);
      }
    }
    throw new CalendarError();
  }

  /** The working moment at or before `t` (a task finish ends at the end of work, 17:00). */
  snapBackward(t) {
    let day = dayOf(t - 1);
    for (let guard = 0; guard < 366 * 20; guard++, day--) {
      const base = dayStart(day);
      const periods = this.periods(day);
      for (let i = periods.length - 1; i >= 0; i--) {
        const [s, e] = periods[i];
        if (t > base + s) return Math.min(t, base + e);
      }
    }
    throw new CalendarError();
  }

  /**
   * `t` moved by `amount` minutes of working time (negative: backwards).
   * Forward from a break or the end of a day starts at the next working moment;
   * a result that falls exactly on the end of a period stays there.
   */
  add(t, amount) {
    if (!this.hasWork) throw new CalendarError();
    if (amount < 0) return this.subtract(t, -amount);
    if (amount === 0) return t;
    let remaining = amount;
    let day = dayOf(t);
    for (let guard = 0; guard < 366 * 200; guard++, day++) {
      const base = dayStart(day);
      for (const [s, e] of this.periods(day)) {
        const from = Math.max(t, base + s);
        const to = base + e;
        if (from >= to) continue;
        if (to - from >= remaining) return from + remaining;
        remaining -= to - from;
      }
    }
    throw new CalendarError();
  }

  subtract(t, amount) {
    if (!this.hasWork) throw new CalendarError();
    if (amount === 0) return t;
    let remaining = amount;
    let day = dayOf(t - 1);
    for (let guard = 0; guard < 366 * 200; guard++, day--) {
      const base = dayStart(day);
      const periods = this.periods(day);
      for (let i = periods.length - 1; i >= 0; i--) {
        const [s, e] = periods[i];
        const to = Math.min(t, base + e);
        const from = base + s;
        if (to <= from) continue;
        if (to - from >= remaining) return to - remaining;
        remaining -= to - from;
      }
    }
    throw new CalendarError();
  }

  /** Working minutes from `a` to `b` (negative when b is before a). */
  between(a, b) {
    if (a == null || b == null) return 0;
    if (b < a) return -this.between(b, a);
    let total = 0;
    const last = dayOf(b - 1);
    for (let day = dayOf(a); day <= last; day++) {
      const base = dayStart(day);
      for (const [s, e] of this.periods(day)) {
        const from = Math.max(a, base + s);
        const to = Math.min(b, base + e);
        if (to > from) total += to - from;
      }
    }
    return total;
  }

  /** Working periods (absolute minutes) of the days from `a` to `b`, clipped. */
  *workingSpans(a, b) {
    const last = dayOf(b - 1);
    for (let day = dayOf(a); day <= last; day++) {
      const base = dayStart(day);
      for (const [s, e] of this.periods(day)) {
        const from = Math.max(a, base + s);
        const to = Math.min(b, base + e);
        if (to > from) yield [from, to];
      }
    }
  }
}

export class CalendarError extends Error {
  constructor() {
    super('calendar.noWorkingTime');
    this.code = 'calendar.noWorkingTime';
  }
}

/** A calendar engine per calendar id, shared during one scheduling run. */
export class CalendarSet {
  constructor(calendars) {
    this.calendars = calendars?.length ? calendars : defaultCalendars();
    this.engines = new Map();
  }

  get(id) {
    const key = this.calendars.some((cal) => cal.id === id) ? id : this.calendars[0].id;
    let engine = this.engines.get(key);
    if (!engine) {
      engine = new CalendarEngine(this.calendars, key);
      this.engines.set(key, engine);
    }
    return engine;
  }
}

/** Calendars that use `id` as their base (directly or indirectly). */
export function dependents(calendars, id) {
  const out = new Set();
  let added = true;
  while (added) {
    added = false;
    for (const cal of calendars) {
      if (!out.has(cal.id) && (cal.base === id || out.has(cal.base))) { out.add(cal.id); added = true; }
    }
  }
  return [...out];
}

/** Working hours per week of a calendar's weekly pattern (for the calendar editor). */
export function weeklyHours(calendars, id) {
  const engine = new CalendarEngine(calendars, id);
  return engine.week.reduce((sum, periods) => sum + periodMinutes(periods), 0) / 60;
}
