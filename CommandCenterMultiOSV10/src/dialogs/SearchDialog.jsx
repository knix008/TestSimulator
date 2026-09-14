// Non-modal search window (F9): name pattern + optional content match under
// the active panel's folder. Double-clicking a hit navigates that panel to the
// hit's folder, like the GTK version.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { runJob, cancelJob } from '../lib/backend';
import { Icon } from '../components/Icons';

export function SearchDialog({ root, onClose, onPick }) {
  useLanguage();
  const [pattern, setPattern] = useState('*');
  const [matchContent, setMatchContent] = useState(false);
  const [content, setContent] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState(t('search_hint'));
  const [running, setRunning] = useState(false);
  const jobId = useRef(null);
  const patternRef = useRef(null);

  useEffect(() => { if (patternRef.current) patternRef.current.focus(); }, []);
  useEffect(() => () => { if (jobId.current) cancelJob(jobId.current).catch(() => {}); }, []);

  const start = async (e) => {
    if (e) e.preventDefault();
    if (running) return;
    setResults([]);
    setRunning(true);
    setStatus(t('searching', { n: 0, path: '' }));
    try {
      const final = await runJob('search.start', { root, pattern: pattern || '*', content, matchContent }, (snap) => {
        jobId.current = snap.id;
        if (snap.status === 'running') setStatus(t('searching', { n: (snap.result && snap.result.count) || 0, path: snap.detail || '' }));
      });
      jobId.current = null;
      const found = (final.result && final.result.found) || [];
      setResults(found);
      if (final.status === 'done') setStatus(t('search_done', { n: found.length }));
      else if (final.status === 'cancelled') setStatus(t('search_cancelled', { n: found.length }));
      else setStatus(t('panel_error', { msg: final.error }));
    } catch (err) {
      setStatus(t('panel_error', { msg: err.message }));
    } finally {
      setRunning(false);
    }
  };

  const stop = () => { if (jobId.current) cancelJob(jobId.current).catch(() => {}); };
  const clear = () => { setResults([]); setStatus(t('search_cleared')); };

  return (
    <div className="search-window" role="dialog" aria-label={t('search_title', { root })} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); e.stopPropagation(); }}>
      <div className="dlg-title">
        <Icon name="search" />
        <span className="ellipsis" title={root}>{t('search_title', { root })}</span>
        <button className="dlg-x" onClick={onClose} title={t('close')}><Icon name="close" /></button>
      </div>
      <div className="dlg-body">
        <form onSubmit={start} className="form-grid">
          <label>{t('lbl_pattern')}</label>
          <input ref={patternRef} value={pattern} onChange={(e) => setPattern(e.target.value)} spellCheck={false} />
          <label className="check"><input type="checkbox" checked={matchContent} onChange={(e) => setMatchContent(e.target.checked)} /> {t('lbl_content')}</label>
          <input value={content} onChange={(e) => setContent(e.target.value)} disabled={!matchContent} spellCheck={false} />
        </form>
        <div className="row" style={{ marginTop: 8 }}>
          {running
            ? <button className="btn" onClick={stop}>{t('search_stop')}</button>
            : <button className="btn primary" onClick={start}>{t('search_start')}</button>}
          <button className="btn" onClick={clear} disabled={running}>{t('search_clear')}</button>
        </div>
        <div className="search-results">
          <table>
            <thead><tr><th>{t('col_path')}</th></tr></thead>
            <tbody>
              {results.map((p) => (
                <tr key={p} onDoubleClick={() => { onPick(p); onClose(); }} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') { onPick(p); onClose(); } }}>
                  <td className="mono ellipsis" title={p}>{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="search-status ellipsis" title={status}>{status}</div>
      </div>
      <div className="dlg-footer"><button className="btn close-btn" onClick={onClose}>{t('close')}</button></div>
    </div>
  );
}
