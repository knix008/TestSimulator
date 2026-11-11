// Small helpers of the issue detail view: escaping, dates, durations, users, errors.
import { getLanguage, t, formatBytes } from '../../i18n.js';
import { renderIconRef, colorFor } from '../../ui/iconref.js';

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export { formatBytes };

const locale = () => (getLanguage() === 'en' ? 'en-US' : 'ko-KR');

/** 'YYYY-MM-DD' (or epoch ms) → a short local date. */
export function fmtDate(value) {
  if (value == null || value === '') return '';
  const d = typeof value === 'number' ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(ms) {
  if (ms == null) return '';
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "3 minutes ago" style, falls back to the date after a week. */
export function relTime(ms, now = Date.now()) {
  if (ms == null) return '';
  const s = Math.round((now - Number(ms)) / 1000);
  if (s < 45) return t('detail.time.now');
  const m = Math.round(s / 60);
  if (m < 60) return t('detail.time.minutes', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('detail.time.hours', { n: h });
  const d = Math.round(h / 24);
  if (d < 7) return t('detail.time.days', { n: d });
  return fmtDate(Number(ms));
}

/** Local 'YYYY-MM-DD' of a Date. */
export const isoDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const UNIT = { w: 5 * 8 * 3600, d: 8 * 3600, h: 3600, m: 60, s: 1 };

/** '1w 2d 3h 30m' → seconds (1d = 8h, 1w = 5d like the core); a plain number is hours. null when empty, NaN when invalid. */
export function parseDuration(text) {
  const s = String(text ?? '').trim().toLowerCase().replace(/(\d)\s+(?=[wdhms])/g, '$1');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 3600);
  let total = 0;
  let consumed = '';
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)([wdhms])/g)) { total += Number(m[1]) * UNIT[m[2]]; consumed += m[0]; }
  if (!consumed || s.replace(/\s+/g, '') !== consumed) return NaN;
  return Math.round(total);
}

/** seconds → '1d 3h 30m' (localised unit letters stay w/d/h/m, readable in both languages). */
export function fmtDuration(seconds) {
  if (seconds == null || seconds === '') return '';
  let left = Math.max(0, Math.round(Number(seconds)));
  if (!left) return '0m';
  const parts = [];
  for (const [unit, size] of [['w', UNIT.w], ['d', UNIT.d], ['h', UNIT.h], ['m', UNIT.m]]) {
    const n = Math.floor(left / size);
    if (n) { parts.push(`${n}${unit}`); left -= n * size; }
  }
  return parts.join(' ') || `${left}s`;
}

/** Hours with at most 2 decimals (the steppers show estimates in hours). */
export const hoursOf = (seconds) => (seconds == null ? '' : Math.round((Number(seconds) / 3600) * 100) / 100);

export function userName(users, id, fallback = '') {
  if (!id) return fallback;
  const u = users?.get?.(id);
  return u?.displayName || u?.username || fallback || t('detail.unknownUser');
}

/** A user's avatar: their IconRef, else letters on a stable colour. */
export function avatarHtml(user, size = 20, title = '') {
  if (!user) return renderIconRef('b:user', { size, title, className: 'dt-avatar none' });
  const name = user.displayName || user.username || '?';
  const letters = name.split(/\s+/).map((w) => [...w][0] ?? '').join('').slice(0, 2) || '?';
  return renderIconRef(user.avatar || '', { size, title: title || name, className: 'dt-avatar', fallback: `l:${letters}${colorFor(name)}` });
}

/** An API error → a translated message (by code), with the core's message as a fallback. */
export function errorText(error) {
  const code = String(error?.code ?? '').toLowerCase();
  if (code) {
    for (const key of [`detail.err.${code}`, `error.code.${code}`]) { const text = t(key); if (text !== key) return text; }
    if (code.startsWith('condition_')) return t('detail.err.condition_other');
    if (code.startsWith('validator_')) return t('detail.err.validator_other');
    if (code.startsWith('invalid_')) return t('detail.err.invalid_other');
  }
  return String(error?.message ?? error ?? '');
}

export function debounce(fn, ms) {
  let timer = 0;
  const run = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  run.cancel = () => clearTimeout(timer);
  return run;
}

/** Reads a File/Blob as base64 (no data: prefix). */
export function fileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const isImage = (mime) => /^image\/(png|jpeg|gif|webp|bmp|avif)$/i.test(String(mime ?? ''));

/** Same value? (arrays compared as sorted sets, objects as JSON). */
export function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
  if (a && typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return (a ?? null) === (b ?? null);
}
