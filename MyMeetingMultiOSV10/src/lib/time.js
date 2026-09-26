// Time field helpers shared by the details panel and the test suite.
// The dropdown offers a 15-minute step across a full day. Typed values are
// accepted when they match HH:MM (24-hour). The end time is also compared
// against the start time.

export const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0');
  const m = String((i % 4) * 15).padStart(2, '0');
  return `${h}:${m}`;
});

export function timeToMinutes(s) {
  const raw = String(s ?? '');
  const m = raw.trim().match(TIME_RE);
  if (!m) return null;
  const [hh, mm] = raw.trim().split(':');
  return Number(hh) * 60 + Number(mm);
}

export function isValidTime(s) {
  return TIME_RE.test(String(s ?? '').trim());
}

export function isEndBeforeStart(start, end) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  return s != null && e != null && e < s;
}
