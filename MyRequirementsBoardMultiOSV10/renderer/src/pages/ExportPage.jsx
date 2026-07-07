import { FileDown } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { downloadExcelExport } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { IconButton } from '../components/IconButton.jsx';
import { IconLink } from '../components/IconLink.jsx';
import { getDisplayProjectName } from '../lib/displayLabels.js';

export default function ExportPage() {
  const { hasRole } = useAuth();
  const { activeProject } = useProject();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const idsParam = searchParams.get('ids');
  const selectedIds = idsParam
    ? idsParam.split(',').map((v) => Number(v.trim())).filter((n) => !Number.isNaN(n) && n > 0)
    : null;

  if (!activeProject) {
    return <div className="container">{t('common.selectProject')}</div>;
  }

  const handleExport = () => {
    downloadExcelExport(activeProject.id, selectedIds?.length ? selectedIds : null);
  };

  return (
    <div className="container">
      <h1>{t('export.title')}</h1>
      <p className="muted">{t('export.project', { name: getDisplayProjectName(activeProject, t) })}</p>

      <div className="card">
        <p>{t('export.description')}</p>
        {selectedIds?.length ? (
          <p className="muted">{t('export.selected', { count: selectedIds.length })}</p>
        ) : (
          <p className="muted">{t('export.all')}</p>
        )}

        <div className="form-actions">
          <IconButton
            icon={FileDown}
            className="btn-primary"
            type="button"
            onClick={handleExport}
            tooltip={t('export.tipDownload')}
          >
            {selectedIds?.length ? t('export.exportSelected', { count: selectedIds.length }) : t('export.exportAll')}
          </IconButton>
          {hasRole('EDITOR') && (
            <IconLink icon={FileDown} className="btn btn-secondary" to="/import" tooltip={t('export.tipImportPage')}>{t('export.importLink')}</IconLink>
          )}
        </div>
      </div>
    </div>
  );
}
