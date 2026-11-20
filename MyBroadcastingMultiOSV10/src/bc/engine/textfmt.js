// What a text source shows: its own text, a file's, a clock, a date, a countdown or a stopwatch.
// Pure (node tests): the runtime passes the time.

const pad = (n, w = 2) => String(Math.floor(Math.abs(n))).padStart(w, '0');

/** HH, H, hh (12 h), mm, ss, SSS, A (AM/PM), YYYY, YY, MM, DD, ddd (weekday), as in the formats people know. */
export function formatClock(date, format = 'HH:mm:ss', { weekdays = ['일', '월', '화', '수', '목', '금', '토'] } = {}) {
  const d = date instanceof Date ? date : new Date(date);
  const h = d.getHours();
  const tokens = {
    YYYY: String(d.getFullYear()), YY: pad(d.getFullYear() % 100), MM: pad(d.getMonth() + 1), DD: pad(d.getDate()),
    HH: pad(h), H: String(h), hh: pad(h % 12 || 12), h: String(h % 12 || 12), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()),
    SSS: pad(d.getMilliseconds(), 3), A: h < 12 ? 'AM' : 'PM', ddd: weekdays[d.getDay()],
  };
  return String(format).replace(/YYYY|YY|MM|DD|HH|H|hh|h|mm|ss|SSS|A|ddd/g, (t) => tokens[t]);
}

/** 01:02:03 (hours shown only when there are any). */
export function formatDuration(ms, { tenths = false } = {}) {
  const total = Math.max(0, ms);
  const s = Math.floor(total / 1000);
  const h = Math.floor(s / 3600);
  const body = `${h ? `${pad(h)}:` : ''}${pad((s / 60) % 60)}:${pad(s % 60)}`;
  return tenths ? `${body}.${Math.floor((total % 1000) / 100)}` : body;
}

/** The text of a text source at this moment. */
export function textOf(s, { now = Date.now(), elapsed = 0, fileText = '' } = {}) {
  switch (s.text_mode) {
    case 'clock': return formatClock(now, s.clock_format || 'HH:mm:ss');
    case 'date': return formatClock(now, s.clock_format && s.clock_format !== 'HH:mm:ss' ? s.clock_format : 'YYYY-MM-DD ddd');
    case 'countdown': {
      const left = s.countdown_seconds * 1000 - elapsed;
      return left <= 0 && s.countdown_end_text ? s.countdown_end_text : formatDuration(Math.ceil(Math.max(0, left) / 1000) * 1000);
    }
    case 'stopwatch': return formatDuration(elapsed, { tenths: true });
    default: return s.read_from_file ? fileText : s.text ?? '';
  }
}
