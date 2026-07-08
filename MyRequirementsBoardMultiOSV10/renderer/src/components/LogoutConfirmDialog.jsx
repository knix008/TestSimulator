import { useEffect } from 'react';
import { LogOut, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function LogoutConfirmDialog({ open, onConfirm, onCancel }) {
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
        aria-labelledby="logout-confirm-title"
        aria-describedby="logout-confirm-body"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="excel-result-dialog__header">
          <div className="excel-result-dialog__title-wrap">
            <LogOut
              size={22}
              strokeWidth={2}
              aria-hidden="true"
              className="excel-result-dialog__icon logout-confirm-dialog__icon"
            />
            <h2 id="logout-confirm-title">{t('nav.logoutConfirmTitle')}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onCancel} aria-label={t('common.close')}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="excel-result-dialog__body" id="logout-confirm-body">
          <p>{t('nav.logoutConfirmDescription')}</p>
        </div>

        <footer className="excel-result-dialog__footer ai-refine-confirm-dialog__footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} autoFocus>
            {t('nav.logoutConfirmAction')}
          </button>
        </footer>
      </div>
    </div>
  );
}