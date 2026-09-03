import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconExport } from './Icons';

// Blocking popup shown while an export is in progress (indeterminate progress).
export default function ExportProgressDialog({ open, label }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 360 }}>
        <div className="modal-body" style={{ textAlign: 'center' }}>
          <div className="mh-icon" style={{ color: 'var(--accent)', justifyContent: 'center', display: 'flex', marginBottom: 10 }}>
            <IconExport size={28} />
          </div>
          <p style={{ margin: '0 0 14px' }}>{t('status.exporting', { fmt: label })}</p>
          <div className="progress-bar"><span /></div>
        </div>
      </div>
    </div>
  );
}
