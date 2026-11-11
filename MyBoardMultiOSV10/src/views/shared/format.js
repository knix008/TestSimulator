// Formatting shared by the workspace views (board, backlog, detail, reports): dates, durations, relative
// times, due-date state. Pure functions (no DOM), so node tests can import them.
//
// Dates: the API sends pure dates as 'YYYY-MM-DD' text and times as epoch milliseconds (ARCHITECTURE.md §2).
// Durations: seconds; 1d = 8h, 1w = 5d (the core's worklog rules).

export const DAY_MS = 86400000;
export const HOUR_S = 3600;
export const DAY_S = 8 * HOUR_S;
export const WEEK_S = 5 * DAY_S;

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' of a Date / ms (local time). */
export function isoDate(value = Date.now()) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A Date at local midnight from 'YYYY-MM-DD' (or ms / Date); null when not a date. */
export function toDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const locale = (lang) => (lang === 'en' ? 'en-US' : 'ko-KR');

/** Short date: '11월 12일' / 'Nov 12' (with the year when it is not this year). */
export function formatDate(value, lang = 'ko', now = Date.now()) {
  const d = toDate(value);
  if (!d) return '';
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(locale(lang), sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Date and time: '2026. 11. 12. 오후 3:04' / 'Nov 12, 2026, 3:04 PM'. */
export function formatDateTime(value, lang = 'ko') {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleString(locale(lang), { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** '방금' / '5분 전' / '3시간 전' / '2일 전' (en: 'just now', '5 min ago', …); future times say 'in …'. */
export function relativeTime(value, lang = 'ko', now = Date.now()) {
  const d = toDate(value);
  if (!d) return '';
  const diff = now - d.getTime();
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  const en = lang === 'en';
  if (s < 45) return en ? 'just now' : '방금';
  const [n, ko, enUnit] = s < 3600 ? [Math.round(s / 60), '분', 'min'] : s < 86400 ? [Math.round(s / 3600), '시간', 'h'] : s < 86400 * 30 ? [Math.round(s / 86400), '일', n1('day', Math.round(s / 86400))] : s < 86400 * 365 ? [Math.round(s / 86400 / 30), '개월', n1('month', Math.round(s / 86400 / 30))] : [Math.round(s / 86400 / 365), '년', n1('year', Math.round(s / 86400 / 365))];
  if (en) return future ? `in ${n} ${enUnit}` : `${n} ${enUnit} ago`;
  return future ? `${n}${ko} 후` : `${n}${ko} 전`;
}
const n1 = (word, n) => (n === 1 ? word : `${word}s`);

/** Whole days from `value` to `now` (0 = today). */
export function daysSince(value, now = Date.now()) {
  const d = toDate(value);
  if (!d) return null;
  return Math.max(0, Math.floor((now - d.getTime()) / DAY_MS));
}

/**
 * Due-date state: 'overdue' (before today, not resolved), 'today', 'soon' (within `soonDays`), 'later', or null
 * (no due date). Resolved issues are never overdue ('done').
 */
export function dueState(dueDate, { now = Date.now(), resolved = false, soonDays = 3 } = {}) {
  const d = toDate(dueDate);
  if (!d) return null;
  if (resolved) return 'done';
  const today = toDate(isoDate(now)).getTime();
  const days = Math.round((d.getTime() - today) / DAY_MS);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= soonDays) return 'soon';
  return 'later';
}

/** Seconds → '1w 2d 3h 30m' (ko: '1주 2일 3시간 30분'); 0 / null → ''. */
export function formatDuration(seconds, lang = 'ko') {
  let s = Math.round(Number(seconds) || 0);
  if (s <= 0) return '';
  const parts = [];
  const units = lang === 'en' ? ['w', 'd', 'h', 'm'] : ['주', '일', '시간', '분'];
  for (const [size, unit] of [[WEEK_S, units[0]], [DAY_S, units[1]], [HOUR_S, units[2]], [60, units[3]]]) {
    const n = Math.floor(s / size);
    if (n) { parts.push(lang === 'en' ? `${n}${unit}` : `${n}${unit}`); s -= n * size; }
  }
  return parts.join(' ') || (lang === 'en' ? '<1m' : '1분 미만');
}

/**
 * '1w 2d 3h 30m', '1.5h', '90m', '2d', '1주 2일 3시간 30분' → seconds. A bare number counts as hours.
 * Returns null for empty text, NaN for text that is not a duration.
 */
export function parseDuration(text) {
  const value = String(text ?? '').trim().toLowerCase();
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value) * HOUR_S);
  const re = /(\d+(?:\.\d+)?)\s*(w|wk|weeks?|주|d|days?|일|h|hrs?|hours?|시간|m|mins?|minutes?|분)/g;
  let total = 0;
  let matched = '';
  for (const m of value.matchAll(re)) {
    const n = Number(m[1]);
    const u = m[2];
    total += n * (/^(w|wk|week|weeks|주)$/.test(u) ? WEEK_S : /^(d|day|days|일)$/.test(u) ? DAY_S : /^(h|hr|hrs|hour|hours|시간)$/.test(u) ? HOUR_S : 60);
    matched += m[0];
  }
  if (!matched || value.replace(/\s+/g, '') !== matched.replace(/\s+/g, '')) return Number.NaN;
  return Math.round(total);
}

/** Story points as text ('3', '0.5', '' for none). */
export const formatPoints = (value) => (value == null || value === '' ? '' : String(Number(value)));

/** A stable colour (hsl) for a text (labels, users without an avatar). */
export function hashColor(text, { s = 55, l = 50 } = {}) {
  let h = 0;
  for (const ch of String(text ?? '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `hsl(${h % 360} ${s}% ${l}%)`;
}

/** Up to two initials of a name ('Kim Minsu' → 'KM', '김민수' → '민수'). */
export function initials(name) {
  const text = String(name ?? '').trim();
  if (!text) return '?';
  const words = text.split(/\s+/).filter(Boolean);
  if (/[ㄱ-힝]/.test(text)) return (words.length > 1 ? words[0][0] + words[1][0] : text.slice(-2));
  return (words.length > 1 ? words[0][0] + words.at(-1)[0] : text.slice(0, 2)).toUpperCase();
}
