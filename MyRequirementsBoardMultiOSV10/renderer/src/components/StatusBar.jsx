import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useUndoHistory } from '../context/UndoHistoryContext.jsx';
import { useExcelDialogs } from '../context/ExcelDialogContext.jsx';
import { useStatusBar } from '../context/StatusBarContext.jsx';
import { useAiRefine } from '../context/AiRefineContext.jsx';
import { useBackendMonitor } from '../hooks/useBackendMonitor.js';
import { getRefineProgressMessage } from '../lib/runBulkAiRefine.js';
import { getStatusBarViewKey } from '../lib/statusBarView.js';
import { getDisplayProjectName, getDisplayRoleLabel } from '../lib/displayLabels.js';

function StatusIndicator({ ok, label, title, unknownLabel }) {
  const state = ok === null ? 'unknown' : ok ? 'ok' : 'error';
  return (
    <span
      className={`app-status-bar__indicator app-status-bar__indicator--${state}`}
      title={title || label}
    >
      <span className="app-status-bar__dot" aria-hidden="true" />
      <span className="app-status-bar__indicator-label">
        {ok === null ? unknownLabel : label}
      </span>
    </span>
  );
}

export default function StatusBar() {
  const location = useLocation();
  const { user } = useAuth();
  const { activeProject, canEditProject, loading: projectsLoading } = useProject();
  const { t } = useLanguage();
  const { canUndo, canRedo } = useUndoHistory();
  const { importOpen, exportOpen } = useExcelDialogs();
  const { activeReport } = useStatusBar();
  const { jobs } = useAiRefine();
  const { serverOk, ollamaOk, ollamaModel } = useBackendMonitor({ enabled: true });

  const globalRefineActivities = useMemo(() => {
    const entries = [];
    if (jobs.requirements.refining) {
      const msg = getRefineProgressMessage(t, jobs.requirements.progress);
      entries.push(msg
        ? `${t('statusBar.aiRefineRequirements')}: ${msg}`
        : t('statusBar.aiRefineRequirements'));
    }
    if (jobs.testCases.refining) {
      const msg = getRefineProgressMessage(t, jobs.testCases.progress);
      entries.push(msg
        ? `${t('statusBar.aiRefineTestCases')}: ${msg}`
        : t('statusBar.aiRefineTestCases'));
    }
    return entries;
  }, [jobs, t]);

  const viewKey = getStatusBarViewKey(location.pathname, { isAuthenticated: Boolean(user) });
  const viewLabel = t(viewKey);
  const activity = activeReport?.activity;
  const activityKind = activeReport?.activityKind || 'info';
  const pageHint = activeReport?.hint;
  const pageMessage = activeReport?.message;

  const excelLabel = importOpen
    ? t('statusBar.excelImportOpen')
    : exportOpen
      ? t('statusBar.excelExportOpen')
      : '';

  const projectLabel = user && activeProject
    ? getDisplayProjectName(activeProject, t)
    : user && projectsLoading
      ? t('statusBar.projectLoading')
      : user
        ? t('statusBar.noProject')
        : '';

  const roleLabel = user ? getDisplayRoleLabel(user.role, t) : '';

  const ollamaTitle = ollamaOk && ollamaModel
    ? t('statusBar.ollamaConnectedModel', { model: ollamaModel })
    : ollamaOk
      ? t('statusBar.ollamaConnected')
      : t('statusBar.ollamaDisconnected');

  return (
    <footer className="app-status-bar" role="status" aria-live="polite" aria-label={t('statusBar.ariaLabel')}>
      <div className="app-status-bar__section app-status-bar__section--start">
        <span className="app-status-bar__view">{viewLabel}</span>
        {pageHint && (
          <>
            <span className="app-status-bar__sep" aria-hidden="true">|</span>
            <span className="app-status-bar__hint">{pageHint}</span>
          </>
        )}
        {pageMessage && (
          <>
            <span className="app-status-bar__sep" aria-hidden="true">|</span>
            <span className={`app-status-bar__message app-status-bar__message--${pageMessage.kind || 'info'}`}>
              {pageMessage.text}
            </span>
          </>
        )}
      </div>

      <div className="app-status-bar__section app-status-bar__section--center">
        {excelLabel && (
          <span className="app-status-bar__activity app-status-bar__activity--busy">
            {excelLabel}
          </span>
        )}
        {!excelLabel && globalRefineActivities.length > 0 && (
          <span className="app-status-bar__activity app-status-bar__activity--busy">
            <Loader2 size={13} strokeWidth={2} className="icon-spin app-status-bar__spinner" aria-hidden="true" />
            {globalRefineActivities.join(' · ')}
          </span>
        )}
        {!excelLabel && globalRefineActivities.length === 0 && activity && (
          <span className={`app-status-bar__activity app-status-bar__activity--${activityKind}`}>
            {activityKind === 'busy' && (
              <Loader2 size={13} strokeWidth={2} className="icon-spin app-status-bar__spinner" aria-hidden="true" />
            )}
            {activity}
          </span>
        )}
      </div>

      <div className="app-status-bar__section app-status-bar__section--end">
        {user && activeProject && (
          <span
            className={`app-status-bar__mode${canEditProject ? '' : ' app-status-bar__mode--readonly'}`}
            title={canEditProject ? t('statusBar.editMode') : t('statusBar.readOnlyMode')}
          >
            {canEditProject ? t('statusBar.editMode') : t('statusBar.readOnlyMode')}
          </span>
        )}
        {user && (canUndo || canRedo) && (
          <span className="app-status-bar__undo" title={t('statusBar.undoRedoHint')}>
            {canUndo ? t('statusBar.undoAvailable') : ''}
            {canUndo && canRedo ? ' · ' : ''}
            {canRedo ? t('statusBar.redoAvailable') : ''}
          </span>
        )}
        <StatusIndicator
          ok={serverOk}
          label={t('statusBar.server')}
          unknownLabel={t('statusBar.checking')}
          title={serverOk ? t('statusBar.serverOk') : serverOk === false ? t('statusBar.serverFail') : t('statusBar.checking')}
        />
        <StatusIndicator
          ok={ollamaOk}
          label={t('statusBar.ai')}
          unknownLabel={t('statusBar.checking')}
          title={ollamaTitle}
        />
        {projectLabel && (
          <span className="app-status-bar__project" title={t('statusBar.activeProject')}>
            {projectLabel}
          </span>
        )}
        {roleLabel && (
          <span className="app-status-bar__role">{roleLabel}</span>
        )}
      </div>
    </footer>
  );
}
