import { ToolbarButton } from '@web/components/ToolbarButton';
import { useTranslation, useLanguage } from '@web/i18n';
import type { RefObject } from 'react';
import { DesktopDependencyTypeSelector } from './DesktopDependencyTypeSelector';
import { DesktopLineEndStyleSelector } from './DesktopLineEndStyleSelector';
import './DesktopToolbar.css';

interface DesktopToolbarProps {
  toolbarRef?: RefObject<HTMLElement | null>;
  actionsRef?: RefObject<HTMLDivElement | null>;
  filePath: string | null;
  projectName: string;
  isModified: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  linkMode: boolean;
  showCriticalPath: boolean;
  calendarView: boolean;
  propertiesPanelVisible: boolean;
  canGoToToday: boolean;
  canDeleteTask: boolean;
  canIndentTask: boolean;
  canOutdentTask: boolean;
  canAddNote: boolean;
  canOpenTaskProperties: boolean;
  canToggleExpandCollapse: boolean;
  canUndo: boolean;
  canRedo: boolean;
  defaultDependencyType: import('@web/types/project').GanttViewSettings['defaultDependencyType'];
  startLineEnd: import('@web/types/project').GanttViewSettings['startLineEnd'];
  endLineEnd: import('@web/types/project').GanttViewSettings['endLineEnd'];
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
  onOpenTaskProperties: () => void;
  onToggleExpandCollapse: () => void;
  onToggleCriticalPath: () => void;
  onToggleCalendarView: () => void;
  onGoToToday: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTogglePropertiesPanel: () => void;
  onOpenProjectSettings: () => void;
  onPrint: () => void;
  onDependencyTypeChange: (type: import('@web/types/project').GanttViewSettings['defaultDependencyType']) => void;
  onStartLineEndChange: (style: import('@web/types/project').GanttViewSettings['startLineEnd']) => void;
  onEndLineEndChange: (style: import('@web/types/project').GanttViewSettings['endLineEnd']) => void;
  isAdmin?: boolean;
  username?: string | null;
  onOpenUserManagement?: () => void;
  onOpenMyAccount?: () => void;
  onLogout?: () => void;
}

export function DesktopToolbar({
  toolbarRef,
  actionsRef,
  filePath,
  projectName,
  isModified,
  saveStatus,
  linkMode,
  showCriticalPath,
  calendarView,
  propertiesPanelVisible,
  canGoToToday,
  canDeleteTask,
  canIndentTask,
  canOutdentTask,
  canAddNote,
  canOpenTaskProperties,
  canToggleExpandCollapse,
  canUndo,
  canRedo,
  defaultDependencyType,
  startLineEnd,
  endLineEnd,
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
  onOpenTaskProperties,
  onToggleExpandCollapse,
  onToggleCriticalPath,
  onToggleCalendarView,
  onGoToToday,
  onZoomIn,
  onZoomOut,
  onTogglePropertiesPanel,
  onOpenProjectSettings,
  onPrint,
  onDependencyTypeChange,
  onStartLineEndChange,
  onEndLineEndChange,
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
      ? {
          open: 'Open',
          saveAs: 'Save As',
          link: 'Link',
          unlink: 'Unlink',
          undo: 'Undo',
          redo: 'Redo',
          zoomIn: 'Zoom In',
          zoomOut: 'Zoom Out',
          properties: 'Properties',
          print: 'Print',
          calendar: 'Calendar',
          expandCollapse: 'Expand/Collapse',
        }
      : {
          open: '열기',
          saveAs: '다른 이름으로 저장',
          link: '연결',
          unlink: '연결 해제',
          undo: '실행 취소',
          redo: '다시 실행',
          zoomIn: '확대',
          zoomOut: '축소',
          properties: '속성',
          print: '인쇄',
          calendar: '캘린더',
          expandCollapse: '펼치기/접기',
        };
  const title = filePath ? filePath.split(/[/\\]/).pop() : projectName;
  const modifiedMark = isModified ? ' *' : '';

  return (
    <header className="desktop-toolbar" ref={toolbarRef}>
      <div className="desktop-toolbar__actions" ref={actionsRef}>
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

        <ToolbarButton icon="undo" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">
          {labels.undo}
        </ToolbarButton>
        <ToolbarButton icon="redo" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y">
          {labels.redo}
        </ToolbarButton>

        <ToolbarButton icon="addTask" onClick={onAddTask} title="Insert">
          {t('toolbar.addTask')}
        </ToolbarButton>
        <ToolbarButton icon="addSubtask" onClick={onAddSubtask} title={t('toolbar.addSubtaskTitle')}>
          {t('toolbar.addSubtask')}
        </ToolbarButton>
        <ToolbarButton
          icon="taskProps"
          onClick={onOpenTaskProperties}
          disabled={!canOpenTaskProperties}
          title="F2"
        >
          {t('taskProps.title')}
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
          icon="expand"
          onClick={onToggleExpandCollapse}
          disabled={!canToggleExpandCollapse}
          title={labels.expandCollapse}
        >
          {labels.expandCollapse}
        </ToolbarButton>
        <ToolbarButton
          icon="criticalPath"
          className={showCriticalPath ? 'toolbar-active' : undefined}
          onClick={onToggleCriticalPath}
          title={t('toolbar.criticalPathTitle')}
        >
          {t('toolbar.criticalPath')}
        </ToolbarButton>
        <ToolbarButton
          icon="link"
          className={linkMode ? 'toolbar-active' : undefined}
          onClick={onToggleLinkMode}
          title="Ctrl+L"
        >
          {linkMode ? t('toolbar.linking') : labels.link}
        </ToolbarButton>
        <ToolbarButton icon="unlink" onClick={onUnlink} disabled={!linkMode} title={labels.unlink}>
          {labels.unlink}
        </ToolbarButton>

        <DesktopDependencyTypeSelector value={defaultDependencyType} onChange={onDependencyTypeChange} />
        <DesktopLineEndStyleSelector
          startLineEnd={startLineEnd}
          endLineEnd={endLineEnd}
          onStartLineEndChange={onStartLineEndChange}
          onEndLineEndChange={onEndLineEndChange}
        />

        <ToolbarButton
          icon="calendar"
          className={calendarView ? 'toolbar-active' : undefined}
          onClick={onToggleCalendarView}
        >
          {labels.calendar}
        </ToolbarButton>
        <ToolbarButton icon="zoomIn" onClick={onZoomIn} title="Ctrl++">
          {labels.zoomIn}
        </ToolbarButton>
        <ToolbarButton icon="zoomOut" onClick={onZoomOut} title="Ctrl+-">
          {labels.zoomOut}
        </ToolbarButton>
        <ToolbarButton icon="today" onClick={onGoToToday} disabled={!canGoToToday} title={t('toolbar.goToTodayTitle')}>
          {t('toolbar.goToToday')}
        </ToolbarButton>
        <ToolbarButton
          icon="propertiesPanel"
          className={propertiesPanelVisible ? 'toolbar-active' : undefined}
          onClick={onTogglePropertiesPanel}
        >
          {labels.properties}
        </ToolbarButton>
        <ToolbarButton icon="settings" onClick={onOpenProjectSettings}>
          {t('toolbar.projectSettings')}
        </ToolbarButton>
        <ToolbarButton icon="print" onClick={onPrint} title="Ctrl+P">
          {labels.print}
        </ToolbarButton>
        <ToolbarButton icon="deleteTask" onClick={onDeleteTask} disabled={!canDeleteTask} title="Delete">
          {t('toolbar.deleteTask')}
        </ToolbarButton>

        <span className="desktop-toolbar__fill" aria-hidden="true" />

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
