// Date values and date functions. Day boundaries use the local time of the process; weeks start Monday.
import { JqlError } from './errors.js';

const UNIT_MS = { w: 7 * 86400000, d: 86400000, h: 3600000, m: 60000 };

/**
 * Parse a relative duration "-7d", "1w", "-1w 2d", "+3h", "30m" → milliseconds, or null if not a duration.
 * A sign on the first part applies to following unsigned parts.
 */
export function parseDuration(s) {
  const str = String(s).trim();
  if (!/^([+-]?\d+[wdhm])(\s*[+-]?\d+[wdhm])*$/i.test(str)) return null;
  let total = 0;
  let sign = 1;
  let first = true;
  for (const m of str.matchAll(/([+-]?)(\d+)([wdhm])/gi)) {
    if (m[1]) sign = m[1] === '-' ? -1 : 1;
    else if (first) sign = 1;
    first = false;
    total += sign * Number(m[2]) * UNIT_MS[m[3].toLowerCase()];
  }
  return total;
}

/** Local midnight of the day containing `ms`. */
export function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

/** 'YYYY-MM-DD' of `ms` in local time. */
export function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parse an absolute date value: 'YYYY-MM-DD' / 'YYYY/MM/DD' → { day: true, start, end, date }
 * 'YYYY-MM-DD HH:mm[:ss]' → { day: false, ms }. Returns null when not a date.
 */
export function parseAbsolute(s) {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s).trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (m[4] !== undefined) {
    const ms = new Date(y, mo - 1, d, Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
    return { day: false, ms };
  }
  const start = new Date(y, mo - 1, d).getTime();
  const end = new Date(y, mo - 1, d + 1).getTime();
  return { day: true, start, end, date: localDate(start) };
}

const FUNCS = {
  startofday: ['day', 'start'], endofday: ['day', 'end'],
  startofweek: ['week', 'start'], endofweek: ['week', 'end'],
  startofmonth: ['month', 'start'], endofmonth: ['month', 'end'],
  startofyear: ['year', 'start'], endofyear: ['year', 'end'],
};

export const DATE_FUNCTIONS = ['now', 'startOfDay', 'endOfDay', 'startOfWeek', 'endOfWeek', 'startOfMonth', 'endOfMonth', 'startOfYear', 'endOfYear'];

/** True when `name` is a date function. */
export const isDateFunction = (name) => name.toLowerCase() === 'now' || name.toLowerCase() in FUNCS;

/** Start of the period (day/week/month/year) containing `ms`, shifted by `n` periods. */
function periodStart(unit, ms, n) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  if (unit === 'day') d.setDate(d.getDate() + n);
  else if (unit === 'week') { const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow + 7 * n); }
  else if (unit === 'month') { d.setDate(1); d.setMonth(d.getMonth() + n); }
  else { d.setMonth(0, 1); d.setFullYear(d.getFullYear() + n); }
  return d.getTime();
}

/**
 * Evaluate a date function → epoch ms.
 * endOf… returns the last millisecond of the period.
 * @param {{ name: string, args: string[], pos: number, end: number }} fn
 * @param {number} now
 */
export function evalDateFunction(fn, now) {
  const name = fn.name.toLowerCase();
  if (name === 'now') {
    if (fn.args.length) throw new JqlError('JQL_BAD_VALUE', 'now() takes no arguments', fn.pos, fn.end - fn.pos);
    return now;
  }
  const spec = FUNCS[name];
  if (!spec) throw new JqlError('JQL_UNKNOWN_FUNCTION', `Unknown function ${fn.name}()`, fn.pos, fn.end - fn.pos);
  if (fn.args.length > 1) throw new JqlError('JQL_BAD_VALUE', `${fn.name}() takes at most one argument`, fn.pos, fn.end - fn.pos);
  let base = now;
  let n = 0;
  if (fn.args.length) {
    const a = String(fn.args[0]).trim();
    if (/^[+-]?\d+$/.test(a)) n = Number(a);
    else {
      const dur = parseDuration(a);
      if (dur === null) throw new JqlError('JQL_BAD_VALUE', `Bad argument '${a}' for ${fn.name}(): use a number like -1 or a duration like -1w`, fn.pos, fn.end - fn.pos);
      base = now + dur;
    }
  }
  const [unit, which] = spec;
  return which === 'start' ? periodStart(unit, base, n) : periodStart(unit, base, n + 1) - 1;
}
