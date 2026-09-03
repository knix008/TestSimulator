import React from 'react';
import { useTranslation } from 'react-i18next';
import { isElectron, api } from '../lib/platform';
import { IconCheck, IconX, IconFolder } from './Icons';

// Popup dialog shown after an export finishes — shows format, location and,
// on the desktop, an "open folder" action.
export default function ExportResultDialog({ result, onClose }) {
  const { t } = useTranslation();
  if (!result) return null;

  const ok = result.status === 'success';
  const canReveal = ok && isElectron && !!result.path;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <span className="mh-icon" style={{ color: ok ? 'var(--accent)' : 'var(--danger)' }}>
              {ok ? <IconCheck size={18} /> : <IconX size={18} />}
            </span>
            <h2>{ok ? t('exportDlg.titleSuccess') : t('exportDlg.titleError')}</h2>
          </div>
          <button className="iconbtn" onClick={onClose} title={t('about.close')}><IconX /></button>
        </div>

        <div className="modal-body" style={{ textAlign: 'left' }}>
          <dl className="about-grid">
            <dt>{t('exportDlg.format')}</dt><dd>{result.fmt}</dd>
            {ok
              ? (<><dt>{t('exportDlg.location')}</dt><dd className="export-path">{result.path}</dd></>)
              : (<><dt>{t('exportDlg.error')}</dt><dd className="export-path">{result.message}</dd></>)}
          </dl>
          {result.note && <p className="muted" style={{ marginTop: 12 }}>{result.note}</p>}
        </div>

        <div className="modal-foot">
          {canReveal && (
            <button className="btn" onClick={() => api.showItem(result.path)}>
              <IconFolder size={16} /> {t('exportDlg.openFolder')}
            </button>
          )}
          <button className="btn primary" onClick={onClose}>{t('settings.ok')}</button>
        </div>
      </div>
    </div>
  );
}
