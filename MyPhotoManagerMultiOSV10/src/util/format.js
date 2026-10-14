// Display formats for sizes and dates.
import { getLanguage } from '../i18n.js';

export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

const locale = () => (getLanguage() === 'ko' ? 'ko-KR' : 'en-US');

export function formatDateTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(locale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(ms, options = { year: 'numeric', month: 'short', day: 'numeric' }) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(locale(), options);
}

export function formatMonth(year, month) {
  return new Date(year, month, 1).toLocaleDateString(locale(), { year: 'numeric', month: 'long' });
}

export function weekdayNames() {
  const base = new Date(2024, 0, 7); // a Sunday
  return Array.from({ length: 7 }, (_, i) => new Date(base.getFullYear(), 0, 7 + i).toLocaleDateString(locale(), { weekday: 'narrow' }));
}

export function formatDims(width, height) {
  if (!width || !height) return '';
  const mp = (width * height) / 1e6;
  return `${width} × ${height}${mp >= 0.5 ? ` (${mp >= 10 ? Math.round(mp) : mp.toFixed(1)} MP)` : ''}`;
}

export function formatNumber(n) {
  return Number(n ?? 0).toLocaleString(locale());
}

export function formatDuration(seconds) {
  if (!seconds) return '';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
