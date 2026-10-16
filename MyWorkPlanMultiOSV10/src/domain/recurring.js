// Recurring tasks (Task › Recurring Task): a summary task with one
// occurrence per meeting, each pinned to its day with a "start no earlier
// than" constraint, like MS Project.
import { insertTask, newId } from './project.js';
import { addMonths, dayOf, dayStart, fromMin, parts, toMin, weekdayOfDay } from './time.js';

export const PATTERNS = ['daily', 'weekly', 'monthly', 'yearly'];
export const MAX_OCCURRENCES = 500;

/**
 * The days (day numbers) of the occurrences.
 * pattern = { kind: 'daily' | 'weekly' | 'monthly' | 'yearly', every: n, weekdays: [1, 3] (weekly),
 *             dayOfMonth: 15 (monthly), workdaysOnly: true (daily), start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' | null, count: n | null }
 */
export function occurrences(pattern, isWorkingDay = () => true) {
  const startMin = toMin(pattern.start);
  if (startMin == null) return [];
  const first = dayOf(startMin);
  const endMin = toMin(pattern.end);
  const last = endMin != null ? dayOf(endMin) : first + 366 * 5;
  const limit = Math.min(MAX_OCCURRENCES, pattern.count ? Math.max(1, Math.round(pattern.count)) : MAX_OCCURRENCES);
  const every = Math.max(1, Math.round(pattern.every || 1));
  const out = [];
  const push = (day) => { if (day >= first && day <= last && out.length < limit) out.push(day); };
  if (pattern.kind === 'daily' && pattern.workdaysOnly) {
    // "Every n working days": count working days only. (Stepping by calendar
    // days used to put occurrences on weekends whenever n > 1.)
    for (let day = first, n = 0; day <= last && out.length < limit; day++) {
      if (!isWorkingDay(day)) continue;
      if (n % every === 0) push(day);
      n += 1;
    }
  } else if (pattern.kind === 'daily') {
    for (let day = first; day <= last && out.length < limit; day += every) push(day);
  } else if (pattern.kind === 'weekly') {
    // Weeks run Monday to Sunday, so Sunday (0) sorts last; sorting by the
    // weekday number put Sunday first and the occurrences out of date order.
    const days = (pattern.weekdays?.length ? pattern.weekdays : [weekdayOfDay(first)]).map(Number).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const weekStart = first - ((weekdayOfDay(first) + 6) % 7); // Monday of the first week
    for (let week = weekStart; week <= last && out.length < limit; week += 7 * every) {
      for (const wd of days) push(week + ((wd + 6) % 7));
    }
  } else if (pattern.kind === 'monthly' || pattern.kind === 'yearly') {
    const step = pattern.kind === 'yearly' ? 12 * every : every;
    const p = parts(dayStart(first) );
    const dom = Math.max(1, Math.min(31, Math.round(pattern.dayOfMonth || p.day)));
    for (let i = 0; i < 1200 && out.length < limit; i++) {
      const monthStart = addMonths(toMin(`${p.year}-${String(p.month + 1).padStart(2, '0')}-01`), i * step);
      const q = parts(monthStart);
      const lastDay = new Date(Date.UTC(q.year, q.month + 1, 0)).getUTCDate();
      const day = dayOf(monthStart) + Math.min(dom, lastDay) - 1;
      if (day > last) break;
      push(day);
    }
  }
  return out;
}

/** Inserts the recurring task at row `index`; returns the summary task. */
export function insertRecurring(project, index, { name, duration, durationUnit = 'h', pattern, startTime = 480 }, isWorkingDay) {
  const days = occurrences(pattern, isWorkingDay);
  if (!days.length) return null;
  const groupId = newId('rec');
  const summary = insertTask(project, index, { name, duration: 0, recurring: { groupId, pattern, summary: true }, estimated: false });
  summary.outlineLevel = Math.max(1, summary.outlineLevel);
  days.forEach((day, i) => {
    const task = insertTask(project, index + 1 + i, {
      name: `${name} ${i + 1}`, duration, durationUnit, estimated: false, outlineLevel: summary.outlineLevel + 1,
      constraint: { type: 'SNET', date: fromMin(dayStart(day) + startTime) }, recurring: { groupId },
    });
    task.outlineLevel = summary.outlineLevel + 1;
  });
  return summary;
}

export const isRecurringSummary = (task) => Boolean(task?.recurring?.summary);
