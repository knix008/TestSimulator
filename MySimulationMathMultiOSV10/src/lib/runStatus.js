// The line a script run ends with: done or stopped by an error, how long it took, and when.

/** { ok, time, clock } for t('cw_run_done' | 'cw_run_failed'): time as 0.42 s / 3.1 s / 2 min 5 s. */
export function runDoneInfo(res, ms, now) {
  const ok = !(res && res.ok === false);
  const s = Math.max(0, ms) / 1000;
  const time = s < 1 ? `${Math.round(s * 1000)} ms` : s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  const p = (n) => String(n).padStart(2, '0');
  const clock = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  return { ok, time, clock };
}
