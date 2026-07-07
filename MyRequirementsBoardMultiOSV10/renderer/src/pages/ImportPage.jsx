import { useRef, useState } from 'react';
import { FileDown, FileUp, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, downloadExcelExport, downloadExcelSample } from '../api/client.js';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { IconButton } from '../components/IconButton.jsx';
import { IconLink } from '../components/IconLink.jsx';
import { getDisplayProjectName } from '../lib/displayLabels.js';

export default function ImportPage() {
  const { activeProject, canEditProject } = useProject();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [generateTestCases, setGenerateTestCases] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  if (!canEditProject) {
    return <div className="container">{t('import.noEdit')}</div>;
  }

  if (!activeProject) {
    return <div className="container">{t('common.selectProject')}</div>;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t('import.selectFile'));
      return;
    }

    setBusy(true);
    setError('');
    setResult(null);
    try {
      const data = await api.importExcel(activeProject.id, file, { generateTestCases });
      setResult(data);
      if (data.created > 0 || data.updated > 0) {
        setTimeout(() => navigate('/'), 1500);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <h1>{t('import.title')}</h1>
      <p className="muted">{t('import.project', { name: getDisplayProjectName(activeProject, t) })}</p>

      <div className="card">
        <p>{t('import.instructions1')}</p>
        <p className="muted">{t('import.instructions2')}</p>

        <p>
          <IconButton
            icon={FileDown}
            className="btn-secondary"
            type="button"
            onClick={() => downloadExcelSample(activeProject.id)}
            tooltip={t('import.tipSample')}
          >
            {t('import.sample')}
          </IconButton>
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="excel-file">{t('import.fileLabel')}</label>
            <input id="excel-file" ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
          </div>
          <div className="form-row">
            <label>
              <input
                type="checkbox"
                checked={generateTestCases}
                onChange={(e) => setGenerateTestCases(e.target.checked)}
              />
              {' '}
              {t('import.autoTc')}
            </label>
          </div>
          <div className="form-actions">
            <IconButton
              icon={busy ? Loader2 : FileUp}
              className="btn-primary"
              type="submit"
              disabled={busy}
              iconClassName={busy ? 'icon-spin' : ''}
              tooltip={t('import.tipImport')}
            >
              {busy ? t('import.importing') : t('import.import')}
            </IconButton>
            <IconLink icon={FileDown} className="btn btn-secondary" to="/export" tooltip={t('import.tipExportPage')}>{t('import.exportLink')}</IconLink>
          </div>
        </form>
      </div>

      {error && <p className="error">{error}</p>}
      {result && (
        <div className="card">
          <p className="success">
            {t('import.result', { created: result.created, updated: result.updated, testCases: result.testCasesCreated })}
          </p>
          {result.warnings?.length > 0 && (
            <div>
              <strong>{t('common.notifications')}</strong>
              <ul>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          {result.errors?.length > 0 && (
            <div>
              <strong className="error">{t('common.errors')}</strong>
              <ul>{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
