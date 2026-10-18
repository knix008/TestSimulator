// Calendar arithmetic for Gantt charts and timelines: dates as day numbers
// (days since 1970-01-01, UTC), closed days (week days and dates), working-day
// durations, and the schedule of a Gantt chart (each task starts on its own
// date, or when its predecessors end, or when the project starts). Pure.

const DAY = 86400000;
export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' (or YYYY/MM/DD, YYYY.MM.DD, YYYY-MM) → day number, or null. */
export function parseDate(text) {
  const m = /^\s*(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 1)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCMonth() !== mo - 1) return null;
  return Math.round(t / DAY);
}
/** day number → 'YYYY-MM-DD'. */
export function formatDate(day) {
  const d = new Date(Math.round(day) * DAY);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
/** { y, m (0–11), d, w (0 = Sunday) } of a day number. */
export function dateParts(day) {
  const d = new Date(Math.round(day) * DAY);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay() };
}
/** First day of the month after the one `day` is in. */
export function nextMonth(day) {
  const { y, m } = dateParts(day);
  return Math.round(Date.UTC(y, m + 1, 1) / DAY);
}

/** Closed days: "saturday,sunday" week days and "2026-03-01, 2026-03-10 to 2026-03-12" dates. Returns day → bool. */
export function closedTest(closedDays = '', closedDates = '') {
  const weekdays = new Set(String(closedDays ?? '').toLowerCase().split(/[\s,;]+/).map((w) => WEEKDAYS.findIndex((x) => x.startsWith(w.slice(0, 3)) && w.length >= 3)).filter((i) => i >= 0));
  const dates = new Set();
  for (const part of String(closedDates ?? '').split(/[,;]+/)) {
    const range = /^\s*(\S+)\s+(?:to|~|-)\s+(\S+)\s*$/.exec(part);
    const a = parseDate(range ? range[1] : part);
    const b = range ? parseDate(range[2]) : a;
    if (a === null || b === null) continue;
    for (let d = a; d <= b && d - a < 400; d += 1) dates.add(d);
  }
  return (day) => weekdays.has(dateParts(day).w) || dates.has(day);
}

/** The first open day at or after `day`. */
export function openFrom(day, isClosed) {
  let d = day;
  for (let i = 0; i < 400 && isClosed(d); i += 1) d += 1;
  return d;
}
/** End (exclusive) of `duration` working days starting at `start`. */
export function addWorkdays(start, duration, isClosed) {
  let d = openFrom(start, isClosed);
  let left = Math.max(0, Math.round(Number(duration) || 0));
  if (!left) return d;
  for (let i = 0; i < 4000 && left > 0; i += 1) { if (!isClosed(d)) left -= 1; d += 1; }
  return d;
}
/** Working days in [a, b). */
export function workdaysBetween(a, b, isClosed) {
  let n = 0;
  for (let d = a; d < b && d - a < 4000; d += 1) if (!isClosed(d)) n += 1;
  return n;
}

/**
 * The schedule of a Gantt chart.
 *   items: [{ id, milestone, start (text), end (text), duration }]
 *   links: [[fromId, toId]]   (to starts when from ends)
 * Returns { at: Map id → { start, end } (end exclusive; a milestone has start = end), first, last }.
 */
export function schedule(items, links, { projectStart = null, isClosed = () => false } = {}) {
  const preds = new Map(items.map((i) => [i.id, []]));
  for (const [a, b] of links) if (preds.has(a) && preds.has(b) && a !== b) preds.get(b).push(a);
  const own = items.map((i) => parseDate(i.start)).filter((d) => d !== null);
  const base = projectStart ?? (own.length ? Math.min(...own) : parseDate('2026-01-05'));
  const at = new Map();
  const busy = new Set();
  const byId = new Map(items.map((i) => [i.id, i]));
  const place = (id) => {
    if (at.has(id)) return at.get(id);
    const item = byId.get(id);
    if (busy.has(id)) return { start: base, end: base };
    busy.add(id);
    let start = parseDate(item.start);
    if (start === null) {
      const ends = preds.get(id).map((p) => place(p).end);
      start = ends.length ? Math.max(...ends) : base;
    }
    let end;
    if (item.milestone) end = start;
    else {
      const fixedEnd = parseDate(item.end);
      if (fixedEnd !== null && !(Number(item.duration) > 0)) end = Math.max(start + 1, fixedEnd + 1);
      else {
        start = openFrom(start, isClosed);
        end = addWorkdays(start, Math.max(1, Number(item.duration) || 1), isClosed);
      }
    }
    busy.delete(id);
    const out = { start, end };
    at.set(id, out);
    return out;
  };
  for (const item of items) place(item.id);
  const all = [...at.values()];
  return { at, first: all.length ? Math.min(base, ...all.map((x) => x.start)) : base, last: all.length ? Math.max(...all.map((x) => x.end)) : base + 7 };
}
