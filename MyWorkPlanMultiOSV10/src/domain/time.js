// Dates and times without time zones. A moment is a whole number of minutes
// since 1970-01-01 00:00 on the wall clock ("naive" time, computed with UTC so
// daylight-saving changes never shift a schedule). Files store moments as
// "YYYY-MM-DDTHH:mm".

export const MINUTES_PER_DAY = 1440;

const pad = (n, width = 2) => String(n).padStart(width, '0');

/** "2026-10-19T08:00" (or "2026-10-19", or a Date) → minutes; null when invalid. */
export function toMin(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  if (value instanceof Date) return Math.round(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes()) / 60000);
  const match = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(value));
  if (!match) return null;
  const [year, month, day, hour = 0, minute = 0] = match.slice(1, 6).map((part) => Number(part ?? 0));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 24 || minute > 59) return null;
  const ms = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCDate() !== day) return null;
  return Math.round(ms / 60000);
}

export function fromMin(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const date = new Date(minutes * 60000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** Day number (days since 1970-01-01) of a moment. */
export const dayOf = (minutes) => Math.floor(minutes / MINUTES_PER_DAY);
export const dayStart = (day) => day * MINUTES_PER_DAY;
/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday. */
export const weekdayOfDay = (day) => (((day + 4) % 7) + 7) % 7;
export const weekday = (minutes) => weekdayOfDay(dayOf(minutes));

/** "YYYY-MM-DD" of a day number. */
export function isoDay(day) {
  const date = new Date(dayStart(day) * 60000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export const dayFromIso = (text) => {
  const minutes = toMin(text);
  return minutes == null ? null : dayOf(minutes);
};

export function parts(minutes) {
  const date = new Date(minutes * 60000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes(), weekday: date.getUTCDay() };
}

export const fromParts = (year, month, day, hour = 0, minute = 0) => Math.round(Date.UTC(year, month, day, hour, minute) / 60000);

/** The current moment on this computer's wall clock. */
export const nowMin = () => toMin(new Date());
export const todayDay = () => dayOf(nowMin());

/** "HH:mm" ↔ minutes of the day. */
export function clockToMin(text) {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(text ?? ''));
  if (!match) return null;
  const value = Number(match[1]) * 60 + Number(match[2]);
  return value >= 0 && value <= MINUTES_PER_DAY && Number(match[2]) < 60 ? value : null;
}
export const minToClock = (value) => `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;

/** Adds calendar months, keeping the day of the month where possible. */
export function addMonths(minutes, count) {
  const p = parts(minutes);
  const last = new Date(Date.UTC(p.year, p.month + count + 1, 0)).getUTCDate();
  return fromParts(p.year, p.month + count, Math.min(p.day, last), p.hour, p.minute);
}

/** Start of the week (weekStart 0 = Sunday, 1 = Monday) containing `day`. */
export const weekStartDay = (day, weekStart = 1) => day - ((weekdayOfDay(day) - weekStart + 7) % 7);

/** ISO-8601 week number. */
export function isoWeek(day) {
  const thursday = day - ((weekdayOfDay(day) + 6) % 7) + 3;
  const yearStart = dayOf(fromParts(parts(dayStart(thursday)).year, 0, 1));
  return Math.floor((thursday - yearStart) / 7) + 1;
}

/** Display helpers. `format` is 'iso' (2026-10-19), 'ko' (2026. 10. 19.), 'us' (10/19/2026), 'eu' (19/10/2026). */
export function formatDay(minutes, format = 'iso', withTime = false) {
  if (minutes == null) return '';
  const p = parts(minutes);
  const time = withTime ? ` ${pad(p.hour)}:${pad(p.minute)}` : '';
  switch (format) {
    case 'ko': return `${p.year}. ${p.month + 1}. ${p.day}.${time}`;
    case 'us': return `${p.month + 1}/${p.day}/${p.year}${time}`;
    case 'eu': return `${pad(p.day)}/${pad(p.month + 1)}/${p.year}${time}`;
    default: return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}${time}`;
  }
}

/** Parses a typed date in the display format (or ISO), optionally with "HH:mm". */
export function parseDay(text, format = 'iso') {
  const value = String(text ?? '').trim();
  if (!value) return null;
  const time = /(\d{1,2}):(\d{2})\s*$/.exec(value);
  const datePart = time ? value.slice(0, time.index).trim() : value;
  let year; let month; let day;
  let match = /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?$/.exec(datePart);
  if (match) [year, month, day] = match.slice(1).map(Number);
  else if ((match = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$/.exec(datePart))) {
    const [a, b, y] = match.slice(1).map(Number);
    year = y;
    if (format === 'eu' || a > 12) [day, month] = [a, b];
    else [month, day] = [a, b];
  } else return null;
  const result = toMin(`${year}-${pad(month)}-${pad(day)}`);
  if (result == null) return null;
  if (!time) return result;
  // An impossible clock ("25:00", "12:75") is not a date either (it used to roll into the next day).
  const clock = clockToMin(`${time[1]}:${time[2]}`);
  return clock == null ? null : result + clock;
}
