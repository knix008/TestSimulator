import { useEffect } from 'react';
import { Eraser, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function ClearClassificationConfirmDialog({ open, count = 0, onConfirm, onCancel }) {
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
        aria-labelledby="clear-classification-confirm-title"
        aria-describedby="clear-classification-confirm-body"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="excel-result-dialog__header">
          <div className="excel-result-dialog__title-wrap">
            <Eraser size={22} strokeWidth={2} aria-hidden="true" className="excel-result-dialog__icon" />
            <h2 id="clear-classification-confirm-title">{t('requirements.clearClassificationConfirmTitle')}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onCancel} aria-label={t('common.close')}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="excel-result-dialog__body" id="clear-classification-confirm-body">
          <p>{t('requirements.clearClassificationConfirm', { count })}</p>
          <p className="muted">{t('requirements.clearClassificationConfirmNote')}</p>
        </div>

        <footer className="excel-result-dialog__footer ai-refine-confirm-dialog__footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} autoFocus>
            {t('requirements.clearClassification')}
          </button>
        </footer>
      </div>
    </div>
  );
}
