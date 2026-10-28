// The progress popup for slow work (lib/progress.js): shown after 0.6 s, with
// a bar (or a moving one when the size is unknown), counts and elapsed time.
// Three rows at most; the "n more" button opens the whole list (it scrolls).
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { subscribe } from '../lib/progress';
import { Icon } from './Chrome';

const SHOW_AFTER = 600;

export function ProgressHost() {
  useLanguage();
  const [tasks, setTasks] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [all, setAll] = useState(false);
  useEffect(() => subscribe(setTasks), []);
  useEffect(() => {
    if (!tasks.length) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [tasks.length]);
  const ready = tasks.filter((x) => now - x.started >= SHOW_AFTER);
  useEffect(() => { if (tasks.length <= 3) setAll(false); }, [tasks.length]);
  if (!ready.length) return null;
  // Counted work (issue pages) first; three rows unless the list is open.
  const sorted = [...ready].sort((a, b) => (b.total ? 1 : 0) - (a.total ? 1 : 0));
  const shown = all ? sorted : sorted.slice(0, 3);
  const more = ready.length - 3;
  return (
    <div className="progress-pop" role="status" aria-live="polite" data-testid="progress-pop">
      <div className={`pp-rows ${all ? 'open' : ''}`}>
        {shown.map((x) => {
          const pct = x.total ? Math.min(100, Math.round((x.done / x.total) * 100)) : null;
          const secs = Math.round((now - x.started) / 1000);
          return (
            <div key={x.id} className="pp-row">
              <div className="pp-head"><Icon name="spinner" size={14} /><b>{x.label}</b><span className="spacer" /><span className="small">{t('pp_elapsed', { s: secs })}</span></div>
              <div className={`pp-bar ${pct == null ? 'indeterminate' : ''}`}><i style={pct == null ? undefined : { width: `${pct}%` }} /></div>
              {x.total ? <div className="small">{t('pp_count', { done: x.done.toLocaleString(), total: x.total.toLocaleString(), pct })}</div> : null}
            </div>
          );
        })}
      </div>
      {more > 0 && (
        <button type="button" className="pp-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          <span>{all ? t('pp_less') : t('pp_more', { n: more })}</span>
          <Icon name={all ? 'chevronUp' : 'chevronDown'} size={14} />
        </button>
      )}
    </div>
  );
}
