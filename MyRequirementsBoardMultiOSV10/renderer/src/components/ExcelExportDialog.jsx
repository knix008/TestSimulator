import { useState, useEffect } from 'react';
import { CheckCircle2, FileDown, Loader2, X } from 'lucide-react';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useExcelDialogs } from '../context/ExcelDialogContext.jsx';
import { IconButton } from './IconButton.jsx';
import { getDisplayProjectName } from '../lib/displayLabels.js';
import { exportExcelToFile } from '../lib/excelFileActions.js';

export default function ExcelExportDialog() {
  const { activeProject } = useProject();
  const { t } = useLanguage();
  const { exportOpen, exportSelectedIds, closeExport } = useExcelDialogs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!exportOpen) {
      setBusy(false);
      setError('');
      setResult(null);
    }
  }, [exportOpen]);

  useEffect(() => {
    if (!exportOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) closeExport();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exportOpen, busy, closeExport]);

  if (!exportOpen) return null;

  const handleExport = async () => {
    if (!activeProject) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const exported = await exportExcelToFile(
        activeProject.id,
        exportSelectedIds?.length ? exportSelectedIds : null,
      );
      if (exported) {
        setResult(exported);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (!busy) closeExport();
  };

  if (result) {
    return (
      <div className="modal-overlay import-result-overlay" onClick={handleClose} role="presentation">
        <div
          className="modal-dialog excel-result-dialog excel-result-dialog--success"
          role="alertdialog"
          aria-labelledby="excel-export-result-title"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="excel-result-dialog__header">
            <div className="excel-result-dialog__title-wrap">
              <CheckCircle2 size={22} strokeWidth={2} aria-hidden="true" className="excel-result-dialog__icon excel-result-dialog__icon--success" />
              <h2 id="excel-export-result-title">{t('export.successTitle')}</h2>
            </div>
            <button type="button" className="modal-close" onClick={handleClose} aria-label={t('common.close')}>
              <X size={18} strokeWidth={2} />
            </button>
          </header>
          <div className="excel-result-dialog__body">
            <p className="success">{t('export.successMessage', { fileName: result.fileName })}</p>
            {result.filePath && (
              <p className="muted excel-export-result__path">{result.filePath}</p>
            )}
          </div>
          <footer className="excel-result-dialog__footer">
            <button type="button" className="btn btn-primary" onClick={handleClose} autoFocus>
              {t('common.confirm')}
            </button>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={handleClose} role="presentation">
      <div
        className="modal-dialog excel-dialog"
        role="dialog"
        aria-labelledby="excel-export-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="excel-dialog__header">
          <h2 id="excel-export-title">{t('export.title')}</h2>
          <button type="button" className="modal-close" onClick={handleClose} disabled={busy} aria-label={t('common.close')}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="excel-dialog__body">
          {!activeProject && (
            <p className="muted">{t('common.selectProject')}</p>
          )}
          {activeProject && (
            <>
              <p className="muted">{t('export.project', { name: getDisplayProjectName(activeProject, t) })}</p>
              <p>{t('export.description')}</p>
              {exportSelectedIds?.length ? (
                <p className="muted">{t('export.selected', { count: exportSelectedIds.length })}</p>
              ) : (
                <p className="muted">{t('export.all')}</p>
              )}
            </>
          )}
          {error && <p className="error">{error}</p>}
        </div>

        <footer className="excel-dialog__footer">
          {activeProject && (
            <IconButton
              icon={busy ? Loader2 : FileDown}
              className="btn-primary"
              type="button"
              onClick={handleExport}
              disabled={busy}
              iconClassName={busy ? 'icon-spin' : ''}
              tooltip={t('export.tipDownload')}
            >
              {busy
                ? t('export.exporting')
                : exportSelectedIds?.length
                  ? t('export.exportSelected', { count: exportSelectedIds.length })
                  : t('export.exportAll')}
            </IconButton>
          )}
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={busy}>
            {t('common.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}
