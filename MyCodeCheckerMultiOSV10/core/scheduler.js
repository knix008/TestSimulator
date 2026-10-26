'use strict';

// Scheduled analyses (SAST project scans and DAST scans). A schedule is
//   { id, name, kind: 'scan' | 'dast', projectId | path, branch, target?,
//     cron: 'min hour day month weekday', enabled, lastRun, lastStatus, nextRun }
// The server process ticks every 30 s and runs what is due, one at a time.

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'weekday', min: 0, max: 7 },
];

const ALIASES = { '@hourly': '0 * * * *', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@weekly': '0 0 * * 0', '@monthly': '0 0 1 * *', '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *' };

/** Parse a 5-field cron expression into sets. Throws on bad syntax. */
function parseCron(expr) {
  const src = ALIASES[String(expr || '').trim()] || String(expr || '').trim();
  const parts = src.split(/\s+/);
  if (parts.length !== 5) throw new Error(`Cron needs 5 fields (minute hour day month weekday): "${expr}"`);
  const sets = parts.map((part, i) => {
    const f = FIELDS[i];
    const set = new Set();
    for (const item of part.split(',')) {
      const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(item);
      if (!m) throw new Error(`Bad cron ${f.name} field: "${item}"`);
      let lo = f.min;
      let hi = f.max;
      if (m[1] !== '*') {
        const [a, b] = m[1].split('-').map(Number);
        lo = a;
        hi = b === undefined ? (m[2] ? f.max : a) : b;
      }
      const step = m[2] ? Number(m[2]) : 1;
      if (lo < f.min || hi > f.max || lo > hi || step < 1) throw new Error(`Cron ${f.name} out of range: "${item}"`);
      for (let v = lo; v <= hi; v += step) set.add(i === 4 && v === 7 ? 0 : v);
    }
    return set;
  });
  return { minute: sets[0], hour: sets[1], day: sets[2], month: sets[3], weekday: sets[4], dayStar: parts[2] === '*', weekdayStar: parts[4] === '*' };
}

function matches(c, d) {
  if (!c.minute.has(d.getMinutes()) || !c.hour.has(d.getHours()) || !c.month.has(d.getMonth() + 1)) return false;
  const dom = c.day.has(d.getDate());
  const dow = c.weekday.has(d.getDay());
  // Classic cron: when both day fields are restricted, either may match.
  if (!c.dayStar && !c.weekdayStar) return dom || dow;
  return dom && dow;
}

/** The first time strictly after `from` (local time) that matches; null within ~4 years. */
function nextRun(expr, from = new Date()) {
  const c = parseCron(expr);
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = from.getTime() + 4 * 366 * 86400000;
  while (d.getTime() <= limit) {
    if (!c.month.has(d.getMonth() + 1)) { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0, 0); continue; }
    if (!(c.dayStar && c.weekdayStar) && !matches({ ...c, minute: new Set([d.getMinutes()]), hour: new Set([d.getHours()]) }, d)) { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); continue; }
    if (!c.hour.has(d.getHours())) { d.setHours(d.getHours() + 1, 0, 0, 0); continue; }
    if (matches(c, d)) return d;
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

function normalize(s, now = new Date()) {
  if (!s || !['scan', 'dast'].includes(s.kind)) throw new Error('A schedule needs kind "scan" or "dast"');
  if (s.kind === 'scan' && !s.projectId && !s.path) throw new Error('A scan schedule needs a project or a folder');
  if (s.kind === 'dast' && !s.target) throw new Error('A DAST schedule needs a target URL');
  parseCron(s.cron);
  const id = s.id || `sch-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const next = s.enabled === false ? null : nextRun(s.cron, now);
  return { name: s.name || (s.kind === 'dast' ? 'DAST' : 'Scan'), enabled: s.enabled !== false, branch: s.branch || null, history: [], ...s, id, nextRun: next ? next.toISOString() : null };
}

/**
 * Runner. `run(schedule)` performs one job and resolves to { status, summary };
 * `load()` / `save(list)` read and write the schedule list.
 */
function createScheduler({ load, save, run, now = () => new Date(), tickMs = 30000 }) {
  let timer = null;
  let busy = false;

  async function tick() {
    if (busy) return [];
    busy = true;
    const done = [];
    try {
      const list = load() || [];
      const t = now();
      for (const s of list) {
        if (!s.enabled || !s.nextRun || Date.parse(s.nextRun) > t.getTime()) continue;
        const started = new Date();
        let result;
        try { result = await run(s); } catch (err) { result = { status: 'FAILED', summary: err.message }; }
        const fresh = load() || [];
        const cur = fresh.find((x) => x.id === s.id);
        if (!cur) continue;
        cur.lastRun = started.toISOString();
        cur.lastStatus = result.status;
        cur.lastSummary = result.summary || '';
        cur.history = [{ at: cur.lastRun, status: result.status, summary: result.summary || '' }, ...(cur.history || [])].slice(0, 20);
        const next = nextRun(cur.cron, now());
        cur.nextRun = next ? next.toISOString() : null;
        save(fresh);
        done.push({ id: s.id, ...result });
      }
    } finally {
      busy = false;
    }
    return done;
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => { tick().catch(() => {}); }, tickMs);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { tick, start, stop };
}

module.exports = { parseCron, nextRun, normalize, createScheduler };
