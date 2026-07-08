import { useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';

const MESSAGE_KEYS = {
  requirements: {
    selected: 'requirements.aiRefineConfirmSelected',
    all: 'requirements.aiRefineConfirmAll',
  },
  testCases: {
    selected: 'testCasesPage.aiRefineConfirmSelected',
    all: 'testCasesPage.aiRefineConfirmAll',
  },
};

export default function AiRefineConfirmDialog({
  open,
  count,
  selected,
  entity = 'requirements',
  onConfirm,
  onCancel,
}) {
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

  const messageKey = MESSAGE_KEYS[entity]?.[selected ? 'selected' : 'all']
    ?? MESSAGE_KEYS.requirements[selected ? 'selected' : 'all'];

  return (
    <div className="modal-overlay import-result-overlay" onClick={onCancel} role="presentation">
      <div
        className="modal-dialog excel-result-dialog"
        role="alertdialog"
        aria-labelledby="ai-refine-confirm-title"
        aria-describedby="ai-refine-confirm-body"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="excel-result-dialog__header">
          <div className="excel-result-dialog__title-wrap">
            <Sparkles
              size={22}
              strokeWidth={2}
              aria-hidden="true"
              className="excel-result-dialog__icon excel-result-dialog__icon--accent"
            />
            <h2 id="ai-refine-confirm-title">{t('common.aiRefineConfirmTitle')}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onCancel} aria-label={t('common.close')}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="excel-result-dialog__body" id="ai-refine-confirm-body">
          <p>{t(messageKey, { count })}</p>
          <p className="muted">{t('common.aiRefineConfirmDescription')}</p>
        </div>

        <footer className="excel-result-dialog__footer ai-refine-confirm-dialog__footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} autoFocus>
            {t('common.aiRefineConfirmStart')}
          </button>
        </footer>
      </div>
    </div>
  );
}
