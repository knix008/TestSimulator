// Session log for the bottom panel: status-bar messages kept as a transcript.
import React, { useEffect, useRef } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

function clock(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function LogPanel({ entries, onClear }) {
  useLanguage();
  const endRef = useRef(null);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: 'end' }); }, [entries]);
  if (!entries.length) {
    return <div className="sb-empty"><Icon name="log" size={26} /><p>{t('log_empty')}</p></div>;
  }
  return (
    <div className="log-panel">
      <div className="lint-meta">
        <span>{t('log_tab')}</span>
        <span className="spacer" />
        <button className="btn small" onClick={onClear}>{t('log_clear')}</button>
      </div>
      <pre className="log-out selectable">
        {entries.map((e, i) => (
          <div key={i} className={`log-line log-${e.kind || 'info'}`}>
            <span className="log-time">{clock(e.t)}</span>
            {e.msg}
          </div>
        ))}
        <div ref={endRef} />
      </pre>
    </div>
  );
}

export default LogPanel;
