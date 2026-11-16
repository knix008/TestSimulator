// Schedule triggers of deployed agents (ARCHITECTURE.md §8). Checked every 20 s; a missed time (the app was
// closed) is not caught up. Times are this computer's local time.
import { AppError } from './errors.js';

function parseField(text, min, max) {
  const out = new Set();
  for (const part of String(text).split(',')) {
    const [range, stepText] = part.split('/');
    const step = stepText ? Number(stepText) : 1;
    let lo = min;
    let hi = max;
    if (range !== '*') {
      const [a, b] = range.split('-').map(Number);
      lo = a; hi = b ?? (stepText ? max : a);
    }
    if (![lo, hi, step].every(Number.isInteger) || lo < min || hi > max || lo > hi || step < 1) throw new AppError('BAD_CRON', `Bad cron field "${text}"`, 400);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** "m h dom mon dow" → matcher. Sunday is 0 (7 also allowed). */
export function parseCron(expr) {
  const f = String(expr ?? '').trim().split(/\s+/);
  if (f.length !== 5) throw new AppError('BAD_CRON', 'A cron expression has 5 fields: minute hour day month weekday', 400);
  const [mi, h, dom, mon, dowRaw] = f;
  const dow = parseField(dowRaw.replace(/7/g, '0'), 0, 6);
  const sets = { mi: parseField(mi, 0, 59), h: parseField(h, 0, 23), dom: parseField(dom, 1, 31), mon: parseField(mon, 1, 12), dow };
  const domAny = dom === '*';
  const dowAny = dowRaw === '*';
  return (d) => sets.mi.has(d.getMinutes()) && sets.h.has(d.getHours()) && sets.mon.has(d.getMonth() + 1)
    && (domAny || dowAny ? sets.dom.has(d.getDate()) && sets.dow.has(d.getDay()) : sets.dom.has(d.getDate()) || sets.dow.has(d.getDay()));
}

/** The next time (ms) a schedule node fires after `from`. */
export function nextFire(config, from = Date.now()) {
  const mode = config?.mode ?? 'interval';
  if (mode === 'interval') {
    const step = Math.max(1, Number(config.minutes) || 60) * 60000;
    return Math.floor(from / step) * step + step;
  }
  let match;
  if (mode === 'cron') match = parseCron(config.cron);
  else {
    const [hh, mm] = String(config.time ?? '09:00').split(':').map(Number);
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) throw new AppError('BAD_TIME', `Bad time "${config.time}"`, 400);
    match = (d) => d.getHours() === hh && d.getMinutes() === mm && (mode !== 'weekly' || d.getDay() === Number(config.weekday ?? 1));
  }
  const d = new Date(from);
  d.setSeconds(0, 0);
  for (let i = 0; i < 60 * 24 * 370; i += 1) {
    d.setMinutes(d.getMinutes() + 1);
    if (match(d)) return d.getTime();
  }
  return null;
}

export function createScheduler(core, { interval = 20000 } = {}) {
  const next = new Map(); // `${agentId}:${nodeId}` → ms
  let timer = null;

  function plan() {
    const now = Date.now();
    const seen = new Set();
    for (const agent of core.store.agents.all()) {
      if (!agent.deployed) continue;
      for (const node of agent.nodes ?? []) {
        if (node.type !== 'trigger.schedule' || node.disabled) continue;
        const key = `${agent.id}:${node.id}`;
        seen.add(key);
        const sig = JSON.stringify(node.config ?? {});
        const cur = next.get(key);
        if (!cur || cur.sig !== sig) {
          try { next.set(key, { at: nextFire(node.config, now), sig, agentId: agent.id, nodeId: node.id }); } catch (err) { next.set(key, { at: null, sig, error: err.message, agentId: agent.id, nodeId: node.id }); }
        }
      }
    }
    for (const key of [...next.keys()]) if (!seen.has(key)) next.delete(key);
  }

  function tick() {
    // folder watches look on the same beat
    try { core.fileWatch?.tick(); } catch (err) { console.error('[folder watch]', err.message); }
    plan();
    const now = Date.now();
    for (const [key, entry] of next) {
      if (!entry.at || entry.at > now) continue;
      try {
        core.engine.start(entry.agentId, { kind: 'schedule', nodeId: entry.nodeId, payload: { firedAt: new Date(entry.at).toISOString(), scheduled: true } });
      } catch (err) {
        console.error('[scheduler]', err.message);
      }
      const agent = core.store.agents.get(entry.agentId);
      const node = agent?.nodes?.find((n) => n.id === entry.nodeId);
      try { next.set(key, { ...entry, at: node ? nextFire(node.config, now) : null }); } catch { next.delete(key); }
    }
  }

  return {
    start() { if (!timer) { timer = setInterval(tick, interval); timer.unref?.(); plan(); } },
    stop() { clearInterval(timer); timer = null; },
    tick,
    /** For the UI: [{ agentId, nodeId, at, error }]. */
    upcoming() { plan(); return [...next.values()].map(({ sig, ...e }) => e).sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity)); },
  };
}
