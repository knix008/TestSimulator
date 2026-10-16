// The timescale above the Gantt chart and the usage grids: two tiers whose
// units follow the zoom (pixels per day), and the mapping between moments and
// x positions.
import { MINUTES_PER_DAY, addMonths, dayOf, dayStart, fromParts, isoWeek, parts, weekStartDay, weekdayOfDay } from '../domain/time.js';

const MONTHS = {
  ko: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const WEEKDAYS = { ko: ['일', '월', '화', '수', '목', '금', '토'], en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] };
const WEEKDAYS_LONG = { ko: ['일', '월', '화', '수', '목', '금', '토'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };

/** Tier units for a zoom level. */
export function tiersFor(pxPerDay) {
  if (pxPerDay >= 120) return ['day', 'hour'];
  if (pxPerDay >= 16) return ['week', 'day'];
  if (pxPerDay >= 6) return ['month', 'week'];
  if (pxPerDay >= 2.5) return ['quarter', 'month'];
  return ['year', 'quarter'];
}

export class Timescale {
  constructor({ fromDay, toDay, pxPerDay, weekStart = 1, language = 'ko' }) {
    // A margin before the start and after the finish, starting on a week boundary.
    const pad = Math.max(7, Math.ceil(120 / pxPerDay));
    this.originDay = weekStartDay(fromDay - pad, weekStart);
    this.endDay = toDay + pad * 3 + 30;
    this.px = pxPerDay;
    this.weekStart = weekStart;
    this.language = language === 'en' ? 'en' : 'ko';
    this.width = Math.ceil((this.endDay - this.originDay) * pxPerDay);
    [this.topUnit, this.bottomUnit] = tiersFor(pxPerDay);
  }

  x(minutes) {
    return ((minutes - dayStart(this.originDay)) / MINUTES_PER_DAY) * this.px;
  }

  minutesAt(x) {
    return dayStart(this.originDay) + Math.round((x / this.px) * MINUTES_PER_DAY);
  }

  dayAt(x) {
    return this.originDay + Math.floor(x / this.px);
  }

  /** Cells of a tier between x0 and x1: [{ x, width, label, title, weekend }]. */
  cells(unit, x0, x1) {
    const out = [];
    const startDay = Math.max(this.originDay, this.dayAt(Math.max(0, x0)) - 1);
    const endDay = Math.min(this.endDay, this.dayAt(x1) + 1);
    const L = this.language;
    const push = (fromMin, toMin, label, title = label, extra = {}) => out.push({ x: this.x(fromMin), width: this.x(toMin) - this.x(fromMin), label, title, ...extra });
    if (unit === 'hour') {
      for (let day = startDay; day <= endDay; day++) {
        for (let h = 0; h < 24; h += 6) push(dayStart(day) + h * 60, dayStart(day) + (h + 6) * 60, `${String(h).padStart(2, '0')}`, `${h}:00`);
      }
    } else if (unit === 'day') {
      for (let day = startDay; day <= endDay; day++) {
        const p = parts(dayStart(day));
        const wd = weekdayOfDay(day);
        const label = this.px >= 120 ? `${p.month + 1}/${p.day} (${WEEKDAYS_LONG[L][wd]})` : this.px >= 26 ? `${WEEKDAYS[L][wd]} ${p.day}` : WEEKDAYS[L][wd];
        push(dayStart(day), dayStart(day + 1), label, `${p.year}-${p.month + 1}-${p.day} (${WEEKDAYS_LONG[L][wd]})`, { weekend: wd === 0 || wd === 6 });
      }
    } else if (unit === 'week') {
      for (let day = weekStartDay(startDay, this.weekStart); day <= endDay; day += 7) {
        const p = parts(dayStart(day));
        const label = L === 'ko'
          ? this.px >= 16 ? `${p.year}년 ${p.month + 1}월 ${p.day}일` : `${p.month + 1}/${p.day}`
          : this.px >= 16 ? `${MONTHS.en[p.month]} ${p.day}, ${p.year}` : `${MONTHS.en[p.month]} ${p.day}`;
        push(dayStart(day), dayStart(day + 7), label, `W${isoWeek(day)} · ${p.year}-${p.month + 1}-${p.day}`);
      }
    } else if (unit === 'month' || unit === 'quarter' || unit === 'year') {
      const step = unit === 'month' ? 1 : unit === 'quarter' ? 3 : 12;
      const first = parts(dayStart(startDay));
      let month = unit === 'month' ? first.month : unit === 'quarter' ? first.month - (first.month % 3) : 0;
      let m = fromParts(first.year, month, 1);
      for (let guard = 0; guard < 2000 && dayOf(m) <= endDay; guard++) {
        const next = addMonths(m, step);
        const p = parts(m);
        let label;
        if (unit === 'month') label = L === 'ko' ? (this.px >= 6 ? `${p.year}년 ${p.month + 1}월` : `${p.month + 1}월`) : (this.px >= 6 ? `${MONTHS.en[p.month]} ${p.year}` : MONTHS.en[p.month]);
        else if (unit === 'quarter') label = L === 'ko' ? `${p.year}년 ${Math.floor(p.month / 3) + 1}분기` : `Q${Math.floor(p.month / 3) + 1} ${p.year}`;
        else label = String(p.year);
        push(m, next, label);
        m = next;
        month += step;
      }
    }
    return out.filter((cell) => cell.x + cell.width >= x0 - 2 && cell.x <= x1 + 2);
  }

  /** Non-working days (by the calendar) between x0 and x1, for shading. */
  nonWorking(calendar, x0, x1) {
    const out = [];
    if (this.px < 6) return out;
    for (let day = this.dayAt(Math.max(0, x0)); day <= this.dayAt(x1) + 1; day++) {
      if (!calendar.isWorkingDay(day)) out.push({ x: this.x(dayStart(day)), width: this.px });
    }
    return out;
  }
}
