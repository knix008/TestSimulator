import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function ExcelImportResultDialog({ open, mode, message, result, onClose, onConfirm }) {
  const { t } = useLanguage();
  const isError = mode === 'error';

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasChanges = Boolean(
    result && (result.created > 0 || result.updated > 0 || result.testCasesCreated > 0),
  );
  const title = isError
    ? t('import.resultErrorTitle')
    : hasChanges
      ? t('import.resultSuccessTitle')
      : t('import.resultCompleteTitle');

  return (
    <div className="modal-overlay import-result-overlay" onClick={onClose} role="presentation">
      <div
        className={`modal-dialog excel-result-dialog${isError ? ' excel-result-dialog--error' : ' excel-result-dialog--success'}`}
        role="alertdialog"
        aria-labelledby="excel-import-result-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="excel-result-dialog__header">
          <div className="excel-result-dialog__title-wrap">
            {isError ? (
              <AlertCircle size={22} strokeWidth={2} aria-hidden="true" className="excel-result-dialog__icon excel-result-dialog__icon--error" />
            ) : (
              <CheckCircle2 size={22} strokeWidth={2} aria-hidden="true" className="excel-result-dialog__icon excel-result-dialog__icon--success" />
            )}
            <h2 id="excel-import-result-title">{title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="excel-result-dialog__body">
          {message && <p className={isError ? 'error' : undefined}>{message}</p>}

          {result && (
            <>
              <p className={isError && !hasChanges ? 'error' : 'success'}>
                {t('import.result', {
                  created: result.created ?? 0,
                  updated: result.updated ?? 0,
                  testCases: result.testCasesCreated ?? 0,
                })}
              </p>
              {!hasChanges && !isError && (
                <p className="muted">{t('import.resultNoChanges')}</p>
              )}
            </>
          )}

          {result?.warnings?.length > 0 && (
            <div className="excel-result-dialog__section">
              <strong>{t('common.notifications')}</strong>
              <ul>{result.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}

          {result?.errors?.length > 0 && (
            <div className="excel-result-dialog__section">
              <strong className="error">{t('common.errors')}</strong>
              <ul>{result.errors.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
        </div>

        <footer className="excel-result-dialog__footer">
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            {t('common.confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
}
