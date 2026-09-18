// Progress popup for a long job (print preview, hex, a large open / save).
// Shown by withProgress() in lib/progress.js; the host sits above other dialogs.
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { getProgress, subscribeProgress } from '../lib/progress';
import { Dialog } from './Dialogs';

export function ProgressDialog({ title, message, detail, value, onCancel }) {
  useLanguage();
  const pct = value != null && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value * 100))) : null;
  const cancellable = typeof onCancel === 'function';
  return (
    <Dialog title={title || t('prog_title')} icon="clock" kind="info" className="progress-dlg" width={420}
      closable={cancellable} onClose={() => { if (cancellable) onCancel(); }}
      footer={cancellable ? <button className="btn" onClick={onCancel}>{t('cancel')}</button> : null}>
      <div className="prog">
        <div className="inst-head">
          <span className="inst-spinner" />
          <span>{message || t('prog_working')}</span>
        </div>
        {detail ? <div className="muted small ellipsis" title={detail}>{detail}</div> : null}
        <div className={`prog-bar${pct == null ? ' indet' : ''}`}>
          <span style={pct != null ? { width: `${pct}%`, left: 0, animation: 'none' } : undefined} />
        </div>
        {pct != null && <div className="muted small prog-pct">{t('prog_pct', { n: pct })}</div>}
      </div>
    </Dialog>
  );
}

export function ProgressHost() {
  const [p, setP] = useState(getProgress);
  useEffect(() => subscribeProgress(setP), []);
  if (!p) return null;
  return <ProgressDialog title={p.title} message={p.message} detail={p.detail} value={p.value} onCancel={p.cancellable ? p.onCancel : null} />;
}

export default ProgressDialog;
