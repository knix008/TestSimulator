import type { ToolbarIconName } from '@web/components/ToolbarIcons';
import type { GanttViewSettings } from '@web/types/project';

export interface DesktopAppActions {
  newProject: () => void;
  openProject: () => void;
  openRecentFile: (filePath: string) => void;
  saveProject: () => void;
  saveProjectAs: () => void;
  openProjectSettings: () => void;
  openPreferences: () => void;
  exportMsProject: () => void;
  exitApp: () => void;
  undo: () => void;
  redo: () => void;
  addTask: () => void;
  addSubtask: () => void;
  deleteTask: () => void;
  indentTask: () => void;
  outdentTask: () => void;
  linkTask: () => void;
  unlinkTask: () => void;
  setDependencyType: (type: GanttViewSettings['defaultDependencyType']) => void;
  openTaskProperties: () => void;
  toggleExpandCollapse: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  goToToday: () => void;
  togglePropertiesPanel: () => void;
  toggleCriticalPath: () => void;
  toggleCalendarView: () => void;
  exportExcel: () => void;
  exportHtml: () => void;
  exportWord: () => void;
  exportMarkdown: () => void;
  exportGanttImage: () => void;
  exportPdf: () => void;
  print: () => void;
  showAbout: () => void;
  addNote: () => void;
  openUserManagement: () => void;
  openMyAccount: () => void;
  logout: () => void;
}

export interface DesktopMenuItemDef {
  id: string;
  label: string;
  icon?: ToolbarIconName;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  onClick?: () => void;
}

export interface DesktopMenuSeparator {
  type: 'separator';
}

export interface DesktopMenuSubmenu {
  id: string;
  label: string;
  icon?: ToolbarIconName;
  items: DesktopMenuEntry[];
}

export type DesktopMenuEntry = DesktopMenuItemDef | DesktopMenuSeparator | DesktopMenuSubmenu;

export interface DesktopMenuGroup {
  id: string;
  label: string;
  icon: ToolbarIconName;
  items: DesktopMenuEntry[];
  align?: 'start' | 'end';
}

export function isMenuSeparator(entry: DesktopMenuEntry): entry is DesktopMenuSeparator {
  return 'type' in entry && entry.type === 'separator';
}

export function isMenuSubmenu(entry: DesktopMenuEntry): entry is DesktopMenuSubmenu {
  return 'items' in entry && !('type' in entry);
}

export function buildDesktopMenus(
  actions: DesktopAppActions,
  state: {
    linkMode: boolean;
    showCriticalPath: boolean;
    propertiesPanelVisible: boolean;
    calendarView: boolean;
    canDeleteTask: boolean;
    canIndentTask: boolean;
    canOutdentTask: boolean;
    canLink: boolean;
    canUnlink: boolean;
    canAddNote: boolean;
    canUndo: boolean;
    canRedo: boolean;
    recentFiles: string[];
    defaultDependencyType: GanttViewSettings['defaultDependencyType'];
    locale: 'ko' | 'en';
    isAdmin: boolean;
  },
): DesktopMenuGroup[] {
  const ko = state.locale !== 'en';

  const depSubmenu = (type: GanttViewSettings['defaultDependencyType'], icon: ToolbarIconName): DesktopMenuItemDef => ({
    id: `dep-${type}`,
    label: type,
    icon,
    checked: state.defaultDependencyType === type,
    onClick: () => actions.setDependencyType(type),
  });

  const recentItems: DesktopMenuEntry[] =
    state.recentFiles.length === 0
      ? [{ id: 'recent-empty', label: ko ? '(없음)' : '(None)', disabled: true }]
      : state.recentFiles.map((filePath, index) => ({
          id: `recent-${index}`,
          label: filePath.split(/[/\\]/).pop() ?? filePath,
          icon: 'open' as const,
          onClick: () => actions.openRecentFile(filePath),
        }));

  return [
    {
      id: 'file',
      label: ko ? '파일' : 'File',
      icon: 'menuFile',
      items: [
        { id: 'new', label: ko ? '새 프로젝트' : 'New Project', icon: 'newProject', shortcut: 'Ctrl+N', onClick: actions.newProject },
        { id: 'open', label: ko ? '열기...' : 'Open...', icon: 'open', shortcut: 'Ctrl+O', onClick: actions.openProject },
        {
          id: 'recent',
          label: ko ? '최근 파일' : 'Recent Files',
          icon: 'open',
          items: recentItems,
        },
        { type: 'separator' },
        { id: 'save', label: ko ? '저장' : 'Save', icon: 'save', shortcut: 'Ctrl+S', onClick: actions.saveProject },
        { id: 'save-as', label: ko ? '다른 이름으로 저장...' : 'Save As...', icon: 'saveAs', shortcut: 'Ctrl+Shift+S', onClick: actions.saveProjectAs },
        { type: 'separator' },
        { id: 'project-settings', label: ko ? '과제 설정...' : 'Project Settings...', icon: 'settings', onClick: actions.openProjectSettings },
        { id: 'preferences', label: ko ? '환경 설정...' : 'Preferences...', icon: 'preferences', onClick: actions.openPreferences },
        { type: 'separator' },
        { id: 'export-ms', label: ko ? 'Microsoft Project로 내보내기...' : 'Export to Microsoft Project...', icon: 'msProject', onClick: actions.exportMsProject },
        { type: 'separator' },
        { id: 'exit', label: ko ? '종료' : 'Exit', icon: 'exit', shortcut: 'Alt+F4', onClick: actions.exitApp },
      ],
    },
    {
      id: 'edit',
      label: ko ? '편집' : 'Edit',
      icon: 'menuEdit',
      items: [
        { id: 'undo', label: ko ? '실행 취소' : 'Undo', icon: 'undo', shortcut: 'Ctrl+Z', disabled: !state.canUndo, onClick: actions.undo },
        { id: 'redo', label: ko ? '다시 실행' : 'Redo', icon: 'redo', shortcut: 'Ctrl+Y', disabled: !state.canRedo, onClick: actions.redo },
      ],
    },
    {
      id: 'task',
      label: ko ? '작업' : 'Task',
      icon: 'menuTask',
      items: [
        { id: 'add-task', label: ko ? '작업 추가' : 'Add Task', icon: 'addTask', shortcut: 'Insert', onClick: actions.addTask },
        { id: 'add-subtask', label: ko ? '하위 작업 추가' : 'Add Subtask', icon: 'addSubtask', shortcut: 'Ctrl+Shift+Insert', onClick: actions.addSubtask },
        { id: 'delete-task', label: ko ? '작업 삭제' : 'Delete Task', icon: 'deleteTask', shortcut: 'Delete', disabled: !state.canDeleteTask, onClick: actions.deleteTask },
        { type: 'separator' },
        { id: 'indent', label: ko ? '들여쓰기' : 'Indent', icon: 'indent', shortcut: 'Alt+→', disabled: !state.canIndentTask, onClick: actions.indentTask },
        { id: 'outdent', label: ko ? '내어쓰기' : 'Outdent', icon: 'outdent', shortcut: 'Alt+←', disabled: !state.canOutdentTask, onClick: actions.outdentTask },
        { type: 'separator' },
        { id: 'link', label: ko ? '연결' : 'Link', icon: 'link', shortcut: 'Ctrl+L', disabled: !state.canLink, onClick: actions.linkTask },
        { id: 'unlink', label: ko ? '연결 해제' : 'Unlink', icon: 'unlink', disabled: !state.canUnlink, onClick: actions.unlinkTask },
        {
          id: 'dep-type',
          label: ko ? '의존 유형' : 'Dependency Type',
          icon: 'link',
          items: [
            depSubmenu('FS', 'depFs'),
            depSubmenu('FF', 'depFf'),
            depSubmenu('SS', 'depSs'),
            depSubmenu('SF', 'depSf'),
          ],
        },
        { type: 'separator' },
        { id: 'task-props', label: ko ? '작업 속성...' : 'Task Properties...', icon: 'taskProps', shortcut: 'F2', onClick: actions.openTaskProperties },
        { id: 'expand-collapse', label: ko ? '펼치기/접기' : 'Expand/Collapse', icon: 'expand', onClick: actions.toggleExpandCollapse },
        { id: 'add-note', label: ko ? 'Gantt 메모 추가' : 'Add Gantt Note', icon: 'addNote', disabled: !state.canAddNote, onClick: actions.addNote },
      ],
    },
    {
      id: 'view',
      label: ko ? '보기' : 'View',
      icon: 'menuView',
      items: [
        { id: 'zoom-in', label: ko ? '확대' : 'Zoom In', icon: 'zoomIn', shortcut: 'Ctrl++', onClick: actions.zoomIn },
        { id: 'zoom-out', label: ko ? '축소' : 'Zoom Out', icon: 'zoomOut', shortcut: 'Ctrl+-', onClick: actions.zoomOut },
        { id: 'today', label: ko ? '오늘로 이동' : 'Go to Today', icon: 'today', shortcut: 'Ctrl+T', onClick: actions.goToToday },
        { type: 'separator' },
        { id: 'properties-panel', label: ko ? '속성 패널' : 'Properties Panel', icon: 'propertiesPanel', checked: state.propertiesPanelVisible, onClick: actions.togglePropertiesPanel },
        { id: 'critical-path', label: ko ? '주요 경로 표시' : 'Show Critical Path', icon: 'criticalPath', checked: state.showCriticalPath, onClick: actions.toggleCriticalPath },
        { id: 'calendar-view', label: ko ? '캘린더 보기' : 'Calendar View', icon: 'calendar', checked: state.calendarView, onClick: actions.toggleCalendarView },
      ],
    },
    {
      id: 'report',
      label: ko ? '보고서' : 'Report',
      icon: 'menuReport',
      items: [
        { id: 'excel', label: 'Excel (.xlsx)', icon: 'excel', onClick: actions.exportExcel },
        { id: 'html', label: 'HTML', icon: 'html', onClick: actions.exportHtml },
        { id: 'word', label: 'Word (.docx)', icon: 'word', onClick: actions.exportWord },
        { id: 'md', label: 'Markdown', icon: 'markdown', onClick: actions.exportMarkdown },
        { id: 'gantt-image', label: ko ? 'Gantt 이미지' : 'Gantt Image', icon: 'ganttImage', onClick: actions.exportGanttImage },
        { id: 'pdf', label: 'PDF', icon: 'pdf', onClick: actions.exportPdf },
        { type: 'separator' },
        { id: 'print', label: ko ? '인쇄...' : 'Print...', icon: 'print', shortcut: 'Ctrl+P', onClick: actions.print },
      ],
    },
    {
      id: 'help',
      label: ko ? '도움말' : 'Help',
      icon: 'help',
      align: 'end',
      items: [
        ...(state.isAdmin
          ? [
              {
                id: 'user-mgmt',
                label: ko ? '사용자 관리' : 'User Management',
                icon: 'users' as const,
                onClick: actions.openUserManagement,
              },
            ]
          : []),
        {
          id: 'my-account',
          label: ko ? '내 계정' : 'My Account',
          icon: 'account' as const,
          onClick: actions.openMyAccount,
        },
        {
          id: 'logout',
          label: ko ? '로그아웃' : 'Sign Out',
          icon: 'logout' as const,
          onClick: actions.logout,
        },
        { type: 'separator' as const },
        { id: 'about', label: ko ? 'MyProject 정보' : 'About MyProject', icon: 'help', onClick: actions.showAbout },
      ],
    },
  ];
}

export function notifyComingSoon(locale: 'ko' | 'en'): void {
  window.alert(locale === 'en' ? 'This feature is not available.' : '이 기능을 사용할 수 없습니다.');
}
