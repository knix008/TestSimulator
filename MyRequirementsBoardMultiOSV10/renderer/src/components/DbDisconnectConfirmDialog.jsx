import { useEffect } from 'react';
import { Database, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function DbDisconnectConfirmDialog({ open, onConfirm, onCancel }) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-overlay import-result-overlay" onClick={onCancel} role="presentation">
      <div
        className="modal-dialog excel-result-dialog"
        role="alertdialog"
        aria-labelledby="db-disconnect-confirm-title"
        aria-describedby="db-disconnect-confirm-body"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="excel-result-dialog__header">
          <div className="excel-result-dialog__title-wrap">
            <Database size={22} strokeWidth={2} aria-hidden="true" className="excel-result-dialog__icon" />
            <h2 id="db-disconnect-confirm-title">{t('settings.disconnectConfirmTitle')}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onCancel} aria-label={t('common.close')}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="excel-result-dialog__body" id="db-disconnect-confirm-body">
          <p>{t('settings.disconnectConfirm')}</p>
          <p className="muted">{t('settings.disconnectConfirmNote')}</p>
        </div>

        <footer className="excel-result-dialog__footer ai-refine-confirm-dialog__footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} autoFocus>
            {t('common.confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
}
