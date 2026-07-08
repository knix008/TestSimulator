import { useState } from 'react';
import {
  AppWindow,
  ClipboardList,
  FileDown,
  FileText,
  FileUp,
  FolderKanban,
  FolderOpen,
  HelpCircle,
  Info,
  ListChecks,
  LogOut,
  Maximize2,
  Minimize2,
  Pencil,
  Redo2,
  Save,
  Settings,
  Sparkles,
  Undo2,
  Users,
  Eye,
  RectangleHorizontal,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useProject } from '../context/ProjectContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useUndoHistory } from '../context/UndoHistoryContext.jsx';
import { useExcelDialogs } from '../context/ExcelDialogContext.jsx';
import { api } from '../api/client.js';
import {
  defaultProjectFileName,
  pickProjectFileContent,
  saveProjectFileContent,
} from '../lib/projectFileActions.js';
import { MenuDropdown } from './MenuDropdown.jsx';
import LogoutConfirmDialog from './LogoutConfirmDialog.jsx';
import { getDisplayProjectName } from '../lib/displayLabels.js';
import { ROUTES } from '../lib/routes.js';

export default function AppMenuBar({ onShowInfo }) {
  const navigate = useNavigate();
  const { logout, hasRole } = useAuth();
  const { activeProject, canEditProject, refreshProjects, selectProject } = useProject();
  const { t } = useLanguage();
  const { undo, redo, canUndo, canRedo } = useUndoHistory();
  const { openImport, openExport } = useExcelDialogs();
  const isElectron = Boolean(window.electronAPI?.isElectron);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const handleUndo = async () => {
    try {
      await undo();
    } catch (err) {
      window.alert(err.message || t('menu.undoFailed'));
    }
  };

  const handleRedo = async () => {
    try {
      await redo();
    } catch (err) {
      window.alert(err.message || t('menu.redoFailed'));
    }
  };

  const handleOpenProject = async () => {
    try {
      const payload = await pickProjectFileContent();
      if (!payload) return;
      const result = await api.openReqtproj(payload);
      await refreshProjects();
      selectProject(result.project);
      navigate(ROUTES.requirements);
    } catch (err) {
      window.alert(err.message);
    }
  };

  const handleSaveProject = async () => {
    if (!activeProject) return;
    try {
      const payload = await api.exportReqtproj(activeProject.id);
      await saveProjectFileContent(payload, defaultProjectFileName(getDisplayProjectName(activeProject, t)));
    } catch (err) {
      window.alert(err.message);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.login);
  };

  const fileItems = [
    {
      id: 'open',
      icon: FolderOpen,
      labelKey: 'menu.openProject',
      tooltipKey: 'menu.tipOpenProject',
      onClick: handleOpenProject,
    },
    {
      id: 'save',
      icon: Save,
      labelKey: 'menu.saveProject',
      tooltipKey: 'menu.tipSaveProject',
      disabled: !activeProject,
      onClick: handleSaveProject,
    },
    { id: 'sep1', type: 'separator' },
  ];

  if (canEditProject) {
    fileItems.push({
      id: 'import',
      icon: FileUp,
      labelKey: 'menu.importExcel',
      tooltipKey: 'menu.tipImport',
      onClick: openImport,
    });
  }

  fileItems.push({
    id: 'export',
    icon: FileDown,
    labelKey: 'menu.exportExcel',
    tooltipKey: 'menu.tipExport',
    onClick: () => openExport(),
  });

  fileItems.push(
    { id: 'sep2', type: 'separator' },
    {
      id: 'settings',
      icon: Settings,
      labelKey: 'nav.settings',
      tooltipKey: 'nav.tipSettings',
      onClick: () => navigate('/settings'),
    },
    { id: 'sep3', type: 'separator' },
    {
      id: 'logout',
      icon: LogOut,
      labelKey: 'nav.logout',
      tooltipKey: 'nav.tipLogout',
      onClick: () => setLogoutConfirmOpen(true),
    },
  );

  if (isElectron) {
    fileItems.push({
      id: 'exit',
      icon: LogOut,
      labelKey: 'menu.exit',
      tooltipKey: 'menu.tipExit',
      onClick: () => window.electronAPI?.quitApp?.(),
    });
  }

  const editItems = [
    {
      id: 'undo',
      icon: Undo2,
      labelKey: 'menu.undo',
      tooltipKey: 'menu.tipUndo',
      disabled: !canUndo || !canEditProject,
      onClick: handleUndo,
    },
    {
      id: 'redo',
      icon: Redo2,
      labelKey: 'menu.redo',
      tooltipKey: 'menu.tipRedo',
      disabled: !canRedo || !canEditProject,
      onClick: handleRedo,
    },
  ];

  const viewItems = [
    {
      id: 'requirements',
      icon: ClipboardList,
      labelKey: 'nav.requirements',
      tooltipKey: 'nav.tipRequirements',
      onClick: () => navigate(ROUTES.requirements),
    },
    {
      id: 'testCases',
      icon: ListChecks,
      labelKey: 'nav.testCases',
      tooltipKey: 'nav.tipTestCases',
      onClick: () => navigate('/test-cases'),
    },
    {
      id: 'projects',
      icon: FolderKanban,
      labelKey: 'nav.projects',
      tooltipKey: 'nav.tipProjects',
      onClick: () => navigate('/projects'),
    },
  ];

  if (hasRole('EDITOR')) {
    viewItems.push({
      id: 'ollama',
      icon: Sparkles,
      labelKey: 'nav.ollama',
      tooltipKey: 'nav.tipOllama',
      onClick: () => navigate('/ollama'),
    });
  }

  if (hasRole('ADMIN')) {
    viewItems.push({
      id: 'users',
      icon: Users,
      labelKey: 'nav.users',
      tooltipKey: 'nav.tipUsers',
      onClick: () => navigate('/users'),
    });
  }

  const windowItems = [];

  if (isElectron) {
    windowItems.push(
      {
        id: 'minimize',
        icon: Minimize2,
        labelKey: 'menu.minimize',
        tooltipKey: 'menu.tipMinimize',
        onClick: () => window.electronAPI?.minimizeWindow?.(),
      },
      {
        id: 'fullscreen',
        icon: Maximize2,
        labelKey: 'menu.toggleFullscreen',
        tooltipKey: 'menu.tipToggleFullscreen',
        onClick: () => window.electronAPI?.toggleFullscreen?.(),
      },
      {
        id: 'lockMinSize',
        icon: RectangleHorizontal,
        labelKey: 'menu.lockCurrentMinSize',
        tooltipKey: 'menu.tipLockCurrentMinSize',
        onClick: () => { void window.electronAPI?.lockCurrentWindowMinimum?.(); },
      },
    );
  }

  const helpItems = [
    {
      id: 'info',
      icon: Info,
      labelKey: 'menu.appInfo',
      tooltipKey: 'menu.tipAppInfo',
      onClick: onShowInfo,
    },
  ];

  return (
    <>
      <div className="app-menu-bar">
        <MenuDropdown labelKey="menu.file" icon={FileText} items={fileItems} showChevron={false} />
        <MenuDropdown labelKey="menu.edit" icon={Pencil} items={editItems} showChevron={false} />
        <MenuDropdown labelKey="menu.view" icon={Eye} items={viewItems} showChevron={false} />
        {windowItems.length > 0 && (
          <MenuDropdown labelKey="menu.window" icon={AppWindow} items={windowItems} showChevron={false} />
        )}
        <MenuDropdown labelKey="menu.help" icon={HelpCircle} items={helpItems} showChevron={false} />
      </div>

      <LogoutConfirmDialog
        open={logoutConfirmOpen}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          void handleLogout();
        }}
      />
    </>
  );
}
