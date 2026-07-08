import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function AiRefineResultDialog({ open, summary, onClose }) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !summary) return null;

  const hasFailures = summary.failed > 0;
  const hasUpdates = summary.updated > 0;
  const isCancelled = Boolean(summary.cancelled);
  const title = isCancelled
    ? t('common.aiRefineStoppedTitle')
    : hasFailures && summary.updated === 0 && summary.skipped === 0
      ? t('common.aiRefineCompleteTitleError')
      : t('common.aiRefineCompleteTitle');

  return (
    <div className="modal-overlay import-result-overlay" onClick={onClose} role="presentation">
      <div
        className={`modal-dialog excel-result-dialog${hasFailures ? ' excel-result-dialog--error' : ' excel-result-dialog--success'}`}
        role="alertdialog"
        aria-labelledby="ai-refine-result-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="excel-result-dialog__header">
          <div className="excel-result-dialog__title-wrap">
            {hasFailures ? (
              <AlertCircle size={22} strokeWidth={2} aria-hidden="true" className="excel-result-dialog__icon excel-result-dialog__icon--error" />
            ) : (
              <CheckCircle2 size={22} strokeWidth={2} aria-hidden="true" className="excel-result-dialog__icon excel-result-dialog__icon--success" />
            )}
            <h2 id="ai-refine-result-title">{title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="excel-result-dialog__body">
          <p className={hasFailures && !hasUpdates && !isCancelled ? 'error' : isCancelled ? undefined : 'success'}>
            {isCancelled ? (
              t('common.aiRefineStoppedBody', {
                processed: summary.processed ?? (summary.updated + summary.skipped + summary.failed),
                total: summary.total,
                updated: summary.updated,
                skipped: summary.skipped,
              })
            ) : (
              <>
                {t('common.aiRefineCompleteBody', {
                  total: summary.total,
                  updated: summary.updated,
                  skipped: summary.skipped,
                })}
                {summary.failed > 0 && (
                  <>
                    {' '}
                    {t('common.aiRefineCompleteBodyFailed', { failed: summary.failed })}
                  </>
                )}
              </>
            )}
          </p>

          {summary.failures?.length > 0 && (
            <div className="excel-result-dialog__section">
              <strong className="error">{t('common.errors')}</strong>
              <ul>
                {summary.failures.map((entry) => (
                  <li key={`${entry.code}-${entry.message}`}>{entry.code}: {entry.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="excel-result-dialog__footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('common.confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
}
