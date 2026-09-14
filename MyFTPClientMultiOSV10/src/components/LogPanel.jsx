// "로그 (Log)" — the dark, monospaced log at the bottom: one time-stamped
// line per event, auto-scrolled to the newest. The horizontal splitter
// above it resizes the log area.
import React, { useEffect, useRef } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

export function LogPanel({ lines, onClear, onCopy, height, onResizeStart }) {
  useLanguage();
  const bodyRef = useRef(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);
  return (
    <>
      <div className="h-splitter" onMouseDown={(e) => { if (e.button === 0) onResizeStart(e); }} />
      <div className="log-panel" style={{ height }}>
        <div className="log-head">
          <span className="panel-title">{t('log')}</span>
          <span className="spacer" />
          <button className="icon-btn" title={t('log_copy')} onClick={onCopy}><Icon name="copy" size={14} /></button>
          <button className="icon-btn" title={t('log_clear')} onClick={onClear}><Icon name="eraser" size={14} /></button>
        </div>
        <div className="log-body mono" ref={bodyRef}>
          {lines.map((l, i) => <div key={i} className={`log-line ${l.level || ''}`}>[{l.time}]&nbsp; {l.text}</div>)}
        </div>
      </div>
    </>
  );
}

export default LogPanel;
