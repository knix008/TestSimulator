import { ToolbarButton } from '@web/components/ToolbarButton';
import { useTranslation, useLanguage } from '@web/i18n';
import { DesktopDependencyTypeSelector } from './DesktopDependencyTypeSelector';
import './DesktopToolbar.css';

interface DesktopToolbarProps {
  filePath: string | null;
  projectName: string;
  isModified: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  linkMode: boolean;
  showCriticalPath: boolean;
  propertiesPanelVisible: boolean;
  canGoToToday: boolean;
  canDeleteTask: boolean;
  canIndentTask: boolean;
  canOutdentTask: boolean;
  canAddNote: boolean;
  canUndo: boolean;
  canRedo: boolean;
  defaultDependencyType: import('@web/types/project').GanttViewSettings['defaultDependencyType'];
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleLinkMode: () => void;
  onUnlink: () => void;
  onAddTask: () => void;
  onAddSubtask: () => void;
  onAddNote: () => void;
  onDeleteTask: () => void;
  onIndentTask: () => void;
  onOutdentTask: () => void;
  onToggleCriticalPath: () => void;
  onGoToToday: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTogglePropertiesPanel: () => void;
  onOpenProjectSettings: () => void;
  onPrint: () => void;
  onDependencyTypeChange: (type: import('@web/types/project').GanttViewSettings['defaultDependencyType']) => void;
  isAdmin?: boolean;
  username?: string | null;
  onOpenUserManagement?: () => void;
  onOpenMyAccount?: () => void;
  onLogout?: () => void;
}

export function DesktopToolbar({
  filePath,
  projectName,
  isModified,
  saveStatus,
  linkMode,
  showCriticalPath,
  propertiesPanelVisible,
  canGoToToday,
  canDeleteTask,
  canIndentTask,
  canOutdentTask,
  canAddNote,
  canUndo,
  canRedo,
  defaultDependencyType,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  onToggleLinkMode,
  onUnlink,
  onAddTask,
  onAddSubtask,
  onAddNote,
  onDeleteTask,
  onIndentTask,
  onOutdentTask,
  onToggleCriticalPath,
  onGoToToday,
  onZoomIn,
  onZoomOut,
  onTogglePropertiesPanel,
  onOpenProjectSettings,
  onPrint,
  onDependencyTypeChange,
  isAdmin = false,
  username,
  onOpenUserManagement,
  onOpenMyAccount,
  onLogout,
}: DesktopToolbarProps) {
  const t = useTranslation();
  const { locale } = useLanguage();
  const labels =
    locale === 'en'
      ? { open: 'Open', saveAs: 'Save As', link: 'Link' }
      : { open: '열기', saveAs: '다른 이름으로 저장', link: '연결' };
  const title = filePath ? filePath.split(/[/\\]/).pop() : projectName;
  const modifiedMark = isModified ? ' *' : '';

  return (
    <header className="desktop-toolbar">
      <div className="desktop-toolbar__group">
        <ToolbarButton icon="undo" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">
          {locale === 'en' ? 'Undo' : '실행 취소'}
        </ToolbarButton>
        <ToolbarButton icon="redo" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y">
          {locale === 'en' ? 'Redo' : '다시 실행'}
        </ToolbarButton>
      </div>

      <div className="desktop-toolbar__sep" aria-hidden="true" />

      <div className="desktop-toolbar__group">
        <ToolbarButton icon="newProject" onClick={onNew} title="Ctrl+N">
          {t('toolbar.newProject')}
        </ToolbarButton>
        <ToolbarButton icon="open" onClick={onOpen} title="Ctrl+O">
          {labels.open}
        </ToolbarButton>
        <ToolbarButton icon="save" onClick={onSave} title="Ctrl+S">
          {t('common.save')}
        </ToolbarButton>
        <ToolbarButton icon="saveAs" onClick={onSaveAs} title="Ctrl+Shift+S">
          {labels.saveAs}
        </ToolbarButton>
        <span className="desktop-toolbar__title" title={filePath ?? projectName}>
          {title}
          {modifiedMark}
        </span>
        {saveStatus === 'saving' && <span className="desktop-toolbar__status">{t('common.saving')}</span>}
        {saveStatus === 'saved' && (
          <span className="desktop-toolbar__status desktop-toolbar__status--ok">{t('common.saved')}</span>
        )}
        {saveStatus === 'error' && (
          <span className="desktop-toolbar__status desktop-toolbar__status--error">{t('common.saveFailed')}</span>
        )}
      </div>

      <div className="desktop-toolbar__sep" aria-hidden="true" />

      <div className="desktop-toolbar__group">
        <ToolbarButton icon="addTask" onClick={onAddTask} title="Insert">
          {t('toolbar.addTask')}
        </ToolbarButton>
        <ToolbarButton icon="addSubtask" onClick={onAddSubtask} title={t('toolbar.addSubtaskTitle')}>
          {t('toolbar.addSubtask')}
        </ToolbarButton>
        <ToolbarButton icon="deleteTask" onClick={onDeleteTask} disabled={!canDeleteTask} title="Delete">
          {t('toolbar.deleteTask')}
        </ToolbarButton>
        <ToolbarButton icon="addNote" onClick={onAddNote} disabled={!canAddNote} title={t('toolbar.addNoteTitle')}>
          {t('toolbar.addNote')}
        </ToolbarButton>
        <ToolbarButton icon="indent" onClick={onIndentTask} disabled={!canIndentTask} title={t('toolbar.indentTitle')}>
          {t('toolbar.indent')}
        </ToolbarButton>
        <ToolbarButton icon="outdent" onClick={onOutdentTask} disabled={!canOutdentTask} title={t('toolbar.outdentTitle')}>
          {t('toolbar.outdent')}
        </ToolbarButton>
        <ToolbarButton
          icon="link"
          className={linkMode ? 'toolbar-active' : undefined}
          onClick={onToggleLinkMode}
          title="Ctrl+L"
        >
          {linkMode ? t('toolbar.linking') : labels.link}
        </ToolbarButton>
        <ToolbarButton icon="unlink" onClick={onUnlink} disabled={!linkMode} title={locale === 'en' ? 'Unlink' : '연결 해제'}>
          {locale === 'en' ? 'Unlink' : '연결 해제'}
        </ToolbarButton>
        <DesktopDependencyTypeSelector value={defaultDependencyType} onChange={onDependencyTypeChange} />
      </div>

      <div className="desktop-toolbar__sep" aria-hidden="true" />

      <div className="desktop-toolbar__group">
        <ToolbarButton
          icon="criticalPath"
          className={showCriticalPath ? 'toolbar-active' : undefined}
          onClick={onToggleCriticalPath}
          title={t('toolbar.criticalPathTitle')}
        >
          {t('toolbar.criticalPath')}
        </ToolbarButton>
        <ToolbarButton icon="today" onClick={onGoToToday} disabled={!canGoToToday} title={t('toolbar.goToTodayTitle')}>
          {t('toolbar.goToToday')}
        </ToolbarButton>
        <ToolbarButton icon="zoomIn" onClick={onZoomIn} title="Ctrl++">
          {locale === 'en' ? 'Zoom In' : '확대'}
        </ToolbarButton>
        <ToolbarButton icon="zoomOut" onClick={onZoomOut} title="Ctrl+-">
          {locale === 'en' ? 'Zoom Out' : '축소'}
        </ToolbarButton>
        <ToolbarButton
          icon="propertiesPanel"
          className={propertiesPanelVisible ? 'toolbar-active' : undefined}
          onClick={onTogglePropertiesPanel}
        >
          {locale === 'en' ? 'Properties' : '속성'}
        </ToolbarButton>
        <ToolbarButton icon="settings" onClick={onOpenProjectSettings}>
          {t('toolbar.projectSettings')}
        </ToolbarButton>
        <ToolbarButton icon="print" onClick={onPrint} title="Ctrl+P">
          {locale === 'en' ? 'Print' : '인쇄'}
        </ToolbarButton>
      </div>

      <div className="desktop-toolbar__sep" aria-hidden="true" />

      <div className="desktop-toolbar__group desktop-toolbar__group--account">
        {isAdmin && onOpenUserManagement && (
          <ToolbarButton icon="users" onClick={onOpenUserManagement}>
            {t('toolbar.userManagement')}
          </ToolbarButton>
        )}
        {onOpenMyAccount && (
          <ToolbarButton icon="account" onClick={onOpenMyAccount}>
            {t('toolbar.myAccount')}
          </ToolbarButton>
        )}
        {onLogout && (
          <ToolbarButton icon="logout" onClick={onLogout}>
            {t('toolbar.logout')} ({username ?? ''})
          </ToolbarButton>
        )}
      </div>
    </header>
  );
}
