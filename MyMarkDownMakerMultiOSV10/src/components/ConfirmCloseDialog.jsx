import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconInfo, IconMd, IconX } from './Icons';

// Asked before the app exits while the merged document has changes that have
// not been exported yet. Cancel is the safe default (Esc / clicking outside).
export default function ConfirmCloseDialog({ open, busy, onSave, onDiscard, onCancel }) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <span className="mh-icon"><IconInfo size={18} /></span>
            <h2>{t('closeDlg.title')}</h2>
          </div>
          <button className="iconbtn" disabled={busy} onClick={onCancel} title={t('closeDlg.cancel')}>
            <IconX />
          </button>
        </div>

        <div className="modal-body">
          <p>{t('closeDlg.message')}</p>
          <p className="muted">{t('closeDlg.hint')}</p>
        </div>

        <div className="modal-foot">
          <button className="btn" disabled={busy} onClick={onCancel}>{t('closeDlg.cancel')}</button>
          <button className="btn danger" disabled={busy} onClick={onDiscard}>{t('closeDlg.discard')}</button>
          <button className="btn primary" disabled={busy} onClick={onSave}>
            <IconMd size={16} /> {busy ? t('closeDlg.saving') : t('closeDlg.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
