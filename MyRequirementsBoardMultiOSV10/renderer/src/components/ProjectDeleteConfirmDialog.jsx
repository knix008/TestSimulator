import { useEffect } from 'react';
import { Trash2, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function ProjectDeleteConfirmDialog({ open, count = 1, onConfirm, onCancel }) {
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

  const isBulk = Number(count) > 1;
  const message = isBulk
    ? t('projects.bulkDeleteConfirm', { count })
    : t('projects.deleteConfirm');

  return (
    <div className="modal-overlay import-result-overlay" onClick={onCancel} role="presentation">
      <div
        className="modal-dialog excel-result-dialog"
        role="alertdialog"
        aria-labelledby="project-delete-confirm-title"
        aria-describedby="project-delete-confirm-body"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="excel-result-dialog__header">
          <div className="excel-result-dialog__title-wrap">
            <Trash2
              size={22}
              strokeWidth={2}
              aria-hidden="true"
              className="excel-result-dialog__icon"
            />
            <h2 id="project-delete-confirm-title">{t('projects.deleteConfirmTitle')}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onCancel} aria-label={t('common.close')}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="excel-result-dialog__body" id="project-delete-confirm-body">
          <p>{message}</p>
          <p className="muted">{t('projects.deleteConfirmDescription')}</p>
        </div>

        <footer className="excel-result-dialog__footer ai-refine-confirm-dialog__footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} autoFocus>
            {t('common.delete')}
          </button>
        </footer>
      </div>
    </div>
  );
}
