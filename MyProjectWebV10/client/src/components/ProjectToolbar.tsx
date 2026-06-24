import { useEffect, useRef, useState } from 'react';
import type { DatabaseConfigInfo, ProjectSummary } from '../types/project';
import type { ProjectExportFormat } from '../api/client';
import { useToolbarMinWidth } from '../hooks/useToolbarMinWidth';
import { useTranslation, useLanguage } from '../i18n';
import { getDateLocaleTag } from '../i18n/translate';
import { ToolbarButton } from './ToolbarButton';
import './ProjectToolbar.css';



interface ProjectToolbarProps {

  dbConfig: DatabaseConfigInfo | null;

  projects: ProjectSummary[];

  currentProjectId: number | null;

  loading: boolean;

  isAdmin: boolean;

  canModify: boolean;

  canRead: boolean;

  username: string | null;

  linkMode: boolean;

  saveStatus: 'idle' | 'saving' | 'saved' | 'error';

  hasUnsavedChanges?: boolean;

  onSaveSchedule?: () => void;

  scheduleRevision: {

    updatedUtc: string;

    updatedBy: string | null;

    version: string;

  } | null;

  onSelectProject: (id: number) => void;

  onCreateProject: () => void;

  onDeleteProject?: () => void;

  canDeleteProject?: boolean;

  onRefresh: () => void;

  onLogout: () => void;

  onOpenDatabaseSettings: () => void;

  onOpenUserManagement: () => void;

  onOpenMyAccount: () => void;

  onOpenProjectSettings: () => void;

  onToggleLinkMode: () => void;

  onAddTask?: () => void;

  onAddSubtask?: () => void;

  onAddNote?: () => void;

  canAddNote?: boolean;

  onDeleteTask?: () => void;

  canDeleteTask?: boolean;

  onIndentTask?: () => void;

  onOutdentTask?: () => void;

  canIndentTask?: boolean;

  canOutdentTask?: boolean;

  showCriticalPath?: boolean;

  onToggleCriticalPath?: () => void;

  onGoToToday?: () => void;

  canGoToToday?: boolean;

  onExport?: (format: ProjectExportFormat) => void;

  onImportExcel?: (file: File) => void;

  exportImportBusy?: boolean;
}



export function ProjectToolbar({

  dbConfig,

  projects,

  currentProjectId,

  loading,

  isAdmin,

  canModify,

  canRead,

  username,

  linkMode,

  saveStatus,

  hasUnsavedChanges = false,

  onSaveSchedule,

  scheduleRevision,

  onSelectProject,

  onCreateProject,

  onDeleteProject,

  canDeleteProject = false,

  onRefresh,

  onLogout,

  onOpenDatabaseSettings,

  onOpenUserManagement,

  onOpenMyAccount,

  onOpenProjectSettings,

  onToggleLinkMode,

  onAddTask,

  onAddSubtask,

  onAddNote,

  canAddNote = false,

  onDeleteTask,

  canDeleteTask = false,

  onIndentTask,

  onOutdentTask,

  canIndentTask = false,

  canOutdentTask = false,

  showCriticalPath = false,

  onToggleCriticalPath,

  onGoToToday,

  canGoToToday = false,

  onExport,

  onImportExcel,

  exportImportBusy = false,

}: ProjectToolbarProps) {

  const t = useTranslation();
  const { locale } = useLanguage();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const exportMenuRef = useRef<HTMLDivElement>(null);

  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {

    if (!exportMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {

      if (!exportMenuRef.current?.contains(event.target as Node)) {

        setExportMenuOpen(false);

      }

    };

    document.addEventListener('mousedown', onPointerDown);

    return () => document.removeEventListener('mousedown', onPointerDown);

  }, [exportMenuOpen]);

  const exportFormats: Array<{ format: ProjectExportFormat; label: string }> = [

    { format: 'excel', label: 'Excel (.xlsx)' },

    { format: 'word', label: 'Word (.docx)' },

    { format: 'markdown', label: 'Markdown (.md)' },

    { format: 'pdf', label: 'PDF (.pdf)' },

  ];

  const saveLabel =

    saveStatus === 'saving'

      ? t('common.saving')

      : saveStatus === 'saved'

        ? t('common.saved')

        : saveStatus === 'error'

          ? t('common.saveFailed')

          : null;

  const { toolbarRef, actionsRef } = useToolbarMinWidth([
    loading,
    isAdmin,
    canModify,
    canRead,
    currentProjectId,
    dbConfig?.requiresAdminSetup,
    exportImportBusy,
    saveStatus,
    hasUnsavedChanges,
    linkMode,
    projects.length,
    dbConfig?.connected,
    scheduleRevision?.version,
  ]);

  return (

    <header className="project-toolbar" ref={toolbarRef}>

      <div className="toolbar-brand">

        <strong>MyProject Web</strong>

        <span className="toolbar-subtitle">{t('app.subtitle')}</span>

      </div>



      <div className="toolbar-actions" ref={actionsRef}>

        <label className="toolbar-field">

          {t('toolbar.project')}

          <select

            value={currentProjectId ?? ''}

            onChange={(e) => onSelectProject(Number(e.target.value))}

            disabled={loading || projects.length === 0 || dbConfig?.requiresAdminSetup}

          >

            {projects.length === 0 ? (

              <option value="">{t('toolbar.noProjects')}</option>

            ) : (

              projects.map((project) => (

                <option key={project.id} value={project.id}>

                  {project.name}

                </option>

              ))

            )}

          </select>

        </label>



        <ToolbarButton

          icon="newProject"

          onClick={onCreateProject}

          disabled={loading || dbConfig?.requiresAdminSetup || !canModify}

          title={t('toolbar.newProjectTitle')}

        >

          {t('toolbar.newProject')}

        </ToolbarButton>

        <ToolbarButton

          icon="deleteTask"

          onClick={onDeleteProject}

          disabled={loading || dbConfig?.requiresAdminSetup || !canDeleteProject}

          title={t('toolbar.deleteProjectTitle')}

        >

          {t('toolbar.deleteProject')}

        </ToolbarButton>

        <ToolbarButton

          icon="refresh"

          onClick={onRefresh}

          disabled={loading}

          title={t('toolbar.refreshTitle')}

        >

          {t('toolbar.refresh')}

        </ToolbarButton>



        {canRead && currentProjectId != null && !dbConfig?.requiresAdminSetup && (

          <ToolbarButton icon="settings" onClick={onOpenProjectSettings} disabled={loading}>

            {t('toolbar.projectSettings')}

          </ToolbarButton>

        )}



        {canRead && currentProjectId != null && !dbConfig?.requiresAdminSetup && onExport && (

          <div className="toolbar-export-menu" ref={exportMenuRef}>

            <ToolbarButton

              icon="export"

              onClick={() => setExportMenuOpen((open) => !open)}

              disabled={loading || exportImportBusy}

              title={t('toolbar.exportTitle')}

            >

              {exportImportBusy ? t('toolbar.exporting') : t('toolbar.export')}

            </ToolbarButton>

            {exportMenuOpen && (

              <div className="toolbar-export-dropdown" role="menu">

                {exportFormats.map(({ format, label }) => (

                  <button

                    key={format}

                    type="button"

                    role="menuitem"

                    className="toolbar-export-item"

                    onClick={() => {

                      setExportMenuOpen(false);

                      onExport(format);

                    }}

                  >

                    {label}

                  </button>

                ))}

              </div>

            )}

          </div>

        )}



        {canModify && currentProjectId != null && !dbConfig?.requiresAdminSetup && onImportExcel && (

          <>

            <input

              ref={importInputRef}

              type="file"

              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

              className="toolbar-import-input"

              onChange={(event) => {

                const file = event.target.files?.[0];

                event.target.value = '';

                if (file) onImportExcel(file);

              }}

            />

            <ToolbarButton

              icon="import"

              onClick={() => importInputRef.current?.click()}

              disabled={loading || exportImportBusy}

              title={t('toolbar.importExcelTitle')}

            >

              {t('toolbar.importExcel')}

            </ToolbarButton>

          </>

        )}



        {canRead && currentProjectId != null && !dbConfig?.requiresAdminSetup && (

          <ToolbarButton

            icon="today"

            onClick={onGoToToday}

            disabled={loading || !canGoToToday}

            title={t('toolbar.goToTodayTitle')}

          >

            {t('toolbar.goToToday')}

          </ToolbarButton>

        )}



        {canRead && currentProjectId != null && !dbConfig?.requiresAdminSetup && (

          <ToolbarButton

            icon="criticalPath"

            className={showCriticalPath ? 'toolbar-active' : ''}

            onClick={onToggleCriticalPath}

            disabled={loading}

            title={t('toolbar.criticalPathTitle')}

          >

            {t('toolbar.criticalPath')}

          </ToolbarButton>

        )}



        {canModify && currentProjectId != null && !dbConfig?.requiresAdminSetup && (

          <ToolbarButton

            icon="save"

            onClick={onSaveSchedule}

            disabled={loading || saveStatus === 'saving' || !hasUnsavedChanges}

            title={t('toolbar.saveScheduleTitle')}

          >

            {saveStatus === 'saving' ? t('common.saving') : hasUnsavedChanges ? t('common.save') : t('common.saved')}

          </ToolbarButton>

        )}



        {canModify && currentProjectId != null && !dbConfig?.requiresAdminSetup && (

          <>

            <ToolbarButton icon="addTask" onClick={onAddTask} disabled={loading} title="Insert">

              {t('toolbar.addTask')}

            </ToolbarButton>

            <ToolbarButton icon="addSubtask" onClick={onAddSubtask} disabled={loading} title={t('toolbar.addSubtaskTitle')}>

              {t('toolbar.addSubtask')}

            </ToolbarButton>

            <ToolbarButton
              icon="addNote"
              onClick={onAddNote}
              disabled={loading || !canAddNote}
              title={t('toolbar.addNoteTitle')}
            >
              {t('toolbar.addNote')}
            </ToolbarButton>

            <ToolbarButton

              icon="deleteTask"

              onClick={onDeleteTask}

              disabled={loading || !canDeleteTask}

              title="Delete"

            >

              {t('toolbar.deleteTask')}

            </ToolbarButton>

            <ToolbarButton

              icon="indent"

              onClick={onIndentTask}

              disabled={loading || !canIndentTask}

              title={t('toolbar.indentTitle')}

            >

              {t('toolbar.indent')}

            </ToolbarButton>

            <ToolbarButton

              icon="outdent"

              onClick={onOutdentTask}

              disabled={loading || !canOutdentTask}

              title={t('toolbar.outdentTitle')}

            >

              {t('toolbar.outdent')}

            </ToolbarButton>

            <ToolbarButton

              icon="link"

              className={linkMode ? 'toolbar-active' : ''}

              onClick={onToggleLinkMode}

              disabled={loading}

            >

              {linkMode ? t('toolbar.linking') : t('toolbar.linkMode')}

            </ToolbarButton>

          </>

        )}



        {saveLabel && (

          <span className={`toolbar-save-status toolbar-save-${saveStatus}`}>

            {saveLabel}

            {hasUnsavedChanges && saveStatus !== 'saving' ? t('common.unsavedChanges') : ''}

          </span>

        )}



        {isAdmin && (

          <>

            <ToolbarButton icon="database" onClick={onOpenDatabaseSettings}>

              {t('toolbar.dbSettings')}

            </ToolbarButton>

            <ToolbarButton

              icon="users"

              onClick={onOpenUserManagement}

              disabled={dbConfig?.requiresAdminSetup}

            >

              {t('toolbar.userManagement')}

            </ToolbarButton>

          </>

        )}



        <ToolbarButton icon="account" onClick={onOpenMyAccount}>

          {t('toolbar.myAccount')}

        </ToolbarButton>



        <ToolbarButton icon="logout" onClick={onLogout}>

          {t('toolbar.logout')} ({username})

        </ToolbarButton>

      </div>



      {dbConfig && (

        <div className={`toolbar-db ${dbConfig.connected ? '' : 'toolbar-db-error'}`}>

          <div>

            DB: {dbConfig.providerDisplayName} / {dbConfig.database}

            {!dbConfig.connected && t('toolbar.dbDisconnected')}

          </div>

          {scheduleRevision && dbConfig.connected && (

            <div className="toolbar-revision">

              {t('toolbar.version')} {scheduleRevision.version} ·{' '}

              {new Date(scheduleRevision.updatedUtc).toLocaleString(getDateLocaleTag(locale))}

              {scheduleRevision.updatedBy ? ` · ${scheduleRevision.updatedBy}` : ''}

            </div>

          )}

        </div>

      )}

    </header>

  );

}


