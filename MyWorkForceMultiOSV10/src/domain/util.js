let counter = 0;

export function uid(prefix = 'id') {
  counter = (counter + 1) % 1_000_000;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${time}-${counter.toString(36)}-${rand}`;
}

export const nowIso = () => new Date().toISOString();

export function clone(value) {
  return structuredClone(value);
}

export function byId(list, id) {
  return (list || []).find((item) => item.id === id) || null;
}

export function formatWhen(iso, lang = 'ko') {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-CA' : 'ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function formatStamp(iso, lang = 'ko') {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function ago(iso, lang = 'ko', now = Date.now()) {
  const delta = now - Date.parse(iso);
  if (!Number.isFinite(delta)) return '';
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return lang === 'en' ? 'just now' : '방금';
  if (minutes < 60) return lang === 'en' ? `${minutes}m ago` : `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return lang === 'en' ? `${hours}h ago` : `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days < 14) return lang === 'en' ? `${days}d ago` : `${days}일 전`;
  return formatWhen(iso, lang);
}

/** A bare number is minutes. `1h 30m`, `1.5h`, `2d` (a day is 8 hours), `30분`. */
export function parseDuration(text) {
  const raw = String(text ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw));
  let minutes = 0;
  let matched = false;
  for (const hit of raw.matchAll(/(\d+(?:\.\d+)?)\s*(d|h|m|일|시간|분)/g)) {
    matched = true;
    const amount = Number(hit[1]);
    const unit = hit[2];
    if (unit === 'd' || unit === '일') minutes += amount * 8 * 60;
    else if (unit === 'h' || unit === '시간') minutes += amount * 60;
    else minutes += amount;
  }
  return matched ? Math.round(minutes) : null;
}

export function formatDuration(minutes, lang = 'ko') {
  if (minutes == null || minutes === '') return '';
  const value = Math.round(Number(minutes));
  if (!Number.isFinite(value)) return '';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  if (lang === 'en') {
    if (hours && rest) return `${sign}${hours}h ${rest}m`;
    if (hours) return `${sign}${hours}h`;
    return `${sign}${rest}m`;
  }
  if (hours && rest) return `${sign}${hours}시간 ${rest}분`;
  if (hours) return `${sign}${hours}시간`;
  return `${sign}${rest}분`;
}

export function dateInputValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fromDateInput(value) {
  if (!value) return '';
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

export function shiftIso(now, days, hours = 12) {
  return new Date(now + days * 86400000 + hours * 3600000).toISOString();
}
