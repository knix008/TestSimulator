import { useEffect } from 'react';
import { FileDown, FileUp, X } from 'lucide-react';
import { downloadExcelExport } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useExcelDialogs } from '../context/ExcelDialogContext.jsx';
import { IconButton } from './IconButton.jsx';
import { getDisplayProjectName } from '../lib/displayLabels.js';

export default function ExcelExportDialog() {
  const { hasRole } = useAuth();
  const { activeProject } = useProject();
  const { t } = useLanguage();
  const { exportOpen, exportSelectedIds, closeExport, openImport } = useExcelDialogs();

  useEffect(() => {
    if (!exportOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeExport();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exportOpen, closeExport]);

  if (!exportOpen) return null;

  const handleExport = () => {
    if (!activeProject) return;
    downloadExcelExport(activeProject.id, exportSelectedIds?.length ? exportSelectedIds : null);
  };

  return (
    <div className="modal-overlay" onClick={closeExport} role="presentation">
      <div
        className="modal-dialog excel-dialog"
        role="dialog"
        aria-labelledby="excel-export-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="excel-dialog__header">
          <h2 id="excel-export-title">{t('export.title')}</h2>
          <button type="button" className="modal-close" onClick={closeExport} aria-label={t('common.close')}>
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
        </div>

        <footer className="excel-dialog__footer">
          {activeProject && (
            <IconButton
              icon={FileDown}
              className="btn-primary"
              type="button"
              onClick={handleExport}
              tooltip={t('export.tipDownload')}
            >
              {exportSelectedIds?.length
                ? t('export.exportSelected', { count: exportSelectedIds.length })
                : t('export.exportAll')}
            </IconButton>
          )}
          {hasRole('EDITOR') && (
            <IconButton
              icon={FileUp}
              className="btn-secondary"
              type="button"
              onClick={() => openImport()}
              tooltip={t('export.tipImportDialog')}
            >
              {t('export.importLink')}
            </IconButton>
          )}
          <button type="button" className="btn btn-secondary" onClick={closeExport}>
            {t('common.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}
