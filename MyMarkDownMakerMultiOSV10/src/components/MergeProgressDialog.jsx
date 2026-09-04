import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconMerge } from './Icons';

// Blocking popup with a determinate progress bar shown while a large merge runs.
export default function MergeProgressDialog({ open, done, total, file }) {
  const { t } = useTranslation();
  if (!open) return null;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 400 }}>
        <div className="modal-body" style={{ textAlign: 'left' }}>
          <div className="import-head">
            <span className="mh-icon" style={{ color: 'var(--accent)' }}><IconMerge size={20} /></span>
            <span className="import-title">{t('merge.title')}</span>
          </div>
          <div className="progress-track"><span style={{ width: `${pct}%` }} /></div>
          <div className="progress-meta">
            <span>{done} / {total}</span>
            <span>{pct}%</span>
          </div>
          <div className="progress-file" title={file}>{file || '…'}</div>
        </div>
      </div>
    </div>
  );
}
