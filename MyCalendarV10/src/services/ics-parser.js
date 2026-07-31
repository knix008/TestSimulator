/**
 * Minimal iCalendar (.ics) parser for VEVENTs. No external dependencies.
 * Returns [{ uid, title, description, location, start, end, allDay }].
 *
 * Notes:
 *  - Folded lines (continuation starting with space/tab) are unfolded.
 *  - DTSTART/DTEND support UTC (…Z), floating/TZID (treated as server-local),
 *    and all-day (VALUE=DATE / 8-digit).
 */
function unescapeIcs(s) {
  return String(s).replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseIcsDate(val, params) {
  const isDate = /VALUE=DATE(?!-)/i.test(params || '') || /^\d{8}$/.test(val);
  if (isDate) {
    const y = val.slice(0, 4), m = val.slice(4, 6), d = val.slice(6, 8);
    return { iso: `${y}-${m}-${d}T00:00:00`, allDay: true };
  }
  const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const dt = z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    : new Date(+y, +mo - 1, +d, +h, +mi, +s);
  return { iso: dt.toISOString(), allDay: false };
}

function parseIcs(text) {
  const unfolded = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r\n|\n|\r/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.start) {
        if (!cur.end) {
          const s = new Date(cur.start);
          s.setHours(s.getHours() + (cur.allDay ? 24 : 1));
          cur.end = s.toISOString();
        }
        events.push({
          uid: cur.uid || null,
          title: cur.summary || '(제목 없음)',
          description: cur.description || null,
          location: cur.location || null,
          start: cur.start, end: cur.end, allDay: !!cur.allDay,
        });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...paramParts] = left.split(';');
    const params = paramParts.join(';');
    switch (name.toUpperCase()) {
      case 'UID': cur.uid = value.trim(); break;
      case 'SUMMARY': cur.summary = unescapeIcs(value); break;
      case 'DESCRIPTION': cur.description = unescapeIcs(value); break;
      case 'LOCATION': cur.location = unescapeIcs(value); break;
      case 'DTSTART': { const d = parseIcsDate(value, params); if (d) { cur.start = d.iso; cur.allDay = d.allDay; } break; }
      case 'DTEND': { const d = parseIcsDate(value, params); if (d) cur.end = d.iso; break; }
    }
  }
  return events;
}

module.exports = { parseIcs, parseIcsDate, unescapeIcs };
