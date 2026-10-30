// The bottom panel, two tabs: "로그" — the dark, monospaced log, one
// time-stamped line per event, auto-scrolled to the newest, with 전체 복사 /
// 로그 저장 / 지우기 and a switch for the protocol detail lines — and "접속
// 주소", the URLs clients use (AddressesPanel). The splitter above resizes it.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { timeStamp } from '../lib/format';
import { Icon } from './Icons';
import { AddressesPanel } from './AddressesPanel';

export function LogPanel({ lines, showTrace, onToggleTrace, onClear, onCopy, onSave, height, onResizeStart, logFile, settings, addresses, onCopyText, hiddenAddresses, onHideAddresses }) {
  useLanguage();
  const [tab, setTab] = useState('log');
  const bodyRef = useRef(null);
  const visible = showTrace ? lines : lines.filter((l) => l.level !== 'trace');
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length, tab]);
  const tabBtn = (id, icon, label) => (
    <button type="button" role="tab" className={`bp-tab ${tab === id ? 'active' : ''}`} aria-selected={tab === id} onClick={() => setTab(id)}>
      <Icon name={icon} size={14} /><span>{label}</span>
    </button>
  );
  return (
    <>
      <div className="h-splitter" onMouseDown={(e) => { if (e.button === 0) onResizeStart(e); }} />
      <div className="log-panel" style={{ height }}>
        <div className="log-head" role="tablist">
          {tabBtn('log', 'fileText', t('log'))}
          {tabBtn('addresses', 'link', t('addresses'))}
          {tab === 'log' && <>
            <span className="muted small ellipsis log-file" title={logFile}>{logFile ? t('log_file', { file: logFile }) : ''}</span>
            <span className="spacer" />
            <label className="check small" title={t('tip_log_trace')}><input type="checkbox" checked={showTrace} onChange={(e) => onToggleTrace(e.target.checked)} /> {t('log_trace')}</label>
            <button className="tb-btn" title={t('log_copy')} onClick={onCopy}><Icon name="copy" size={14} /><span>{t('log_copy')}</span></button>
            <button className="tb-btn" title={t('log_save')} onClick={onSave}><Icon name="save" size={14} /><span>{t('log_save')}</span></button>
            <button className="icon-btn" title={t('log_clear')} onClick={onClear}><Icon name="eraser" size={14} /></button>
          </>}
          {tab === 'addresses' && <span className="spacer" />}
        </div>
        {tab === 'log'
          ? <div className="log-body mono" ref={bodyRef}>
              {visible.map((l) => <div key={l.seq} className={`log-line ${l.level || ''}`}>[{timeStamp(l.time)}]&nbsp; {l.text}</div>)}
            </div>
          : <AddressesPanel settings={settings} addresses={addresses} onCopy={onCopyText} hidden={hiddenAddresses} onHide={onHideAddresses} />}
      </div>
    </>
  );
}

export default LogPanel;
