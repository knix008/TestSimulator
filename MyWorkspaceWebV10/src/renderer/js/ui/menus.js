import { t } from '../i18n/index.js';



function menuIcon(name) {

  return name;

}



export function buildFileMenu(state) {

  const loggedIn = state.loggedIn;

  return [

    { id: 'save-page', label: t.menuSavePage, iconName: menuIcon('save'), shortcut: 'Ctrl+S', visible: loggedIn, disabled: !state.hasOpenPage },

    {

      id: 'export',

      label: t.menuExport,

      iconName: menuIcon('export'),

      visible: loggedIn,

      submenu: [

        { id: 'export-page', label: t.menuExportPage, iconName: menuIcon('export') },

        { id: 'export-workspace', label: t.menuExportWorkspace, iconName: menuIcon('export') }

      ]

    },

    { id: 'page-history', label: t.menuPageHistory, iconName: menuIcon('history'), visible: loggedIn, disabled: !state.hasOpenPage },

    { id: 'refresh-tree', label: t.menuRefreshTree, iconName: menuIcon('refresh'), shortcut: 'F5', visible: loggedIn },

    { type: 'separator', visible: loggedIn },

    { id: 'new-project', label: t.menuNewProject, iconName: menuIcon('page_plus'), visible: loggedIn },

    { id: 'save-project', label: t.menuSaveWorkspace, iconName: menuIcon('export'), visible: loggedIn },

    { id: 'load-project', label: t.menuLoadWorkspace, iconName: menuIcon('folder_plus_workspace'), visible: loggedIn },

    {

      id: 'recent-projects',

      label: t.menuRecentProjects,

      iconName: menuIcon('history'),

      visible: loggedIn,

      submenu:

        state.recentProjects?.length > 0

          ? state.recentProjects.map((filePath, index) => ({

              id: `recent-project:${index}`,

              label: filePath.split(/[/\\]/).pop() || filePath,

              iconName: menuIcon('file')

            }))

          : [{ id: 'recent-empty', label: t.menuRecentProjectsEmpty, disabled: true, iconName: menuIcon('file') }]

    },

    { type: 'separator' },

    loggedIn

      ? { id: 'logout', label: t.menuLogout, iconName: menuIcon('logout') }

      : { id: 'login', label: t.menuLogin, iconName: menuIcon('login') },

    { type: 'separator' },

    { id: 'about', label: t.menuAbout, iconName: menuIcon('info') },

    { id: 'exit', label: t.menuExit, iconName: menuIcon('exit') }

  ];

}



export function buildWorkspaceMenu(state) {

  if (!state.loggedIn) {

    return [];

  }

  return [

    { id: 'new-root-workspace', label: t.menuNewRootWorkspace, iconName: menuIcon('folder_plus_workspace') },

    { id: 'new-sub-workspace', label: t.menuNewSubWorkspace, iconName: menuIcon('folder_plus_sub'), disabled: !state.selectedWorkspaceId },

    { id: 'new-page', label: t.menuNewPage, iconName: menuIcon('page_plus'), disabled: !state.selectedWorkspaceId },

    { type: 'separator' },

    { id: 'rename', label: t.menuRename, iconName: menuIcon('rename'), disabled: !state.selectedTreeItem },

    { id: 'delete', label: t.menuDelete, iconName: menuIcon('delete'), disabled: !state.selectedTreeItem },

    { type: 'separator' },

    { id: 'workspace-members', label: t.menuWorkspaceMembers, iconName: menuIcon('members'), disabled: !state.selectedWorkspaceId }

  ];

}



export function buildViewMenu(state) {

  if (!state.loggedIn) {

    return [];

  }

  return [

    { id: 'toggle-workspace-panel', label: t.menuWorkspacePanel, iconName: menuIcon('workspace'), checked: state.workspacePanelVisible }

  ];

}



export function buildAdminMenu(state) {

  if (!state.loggedIn || !state.isAdmin) {

    return [];

  }

  return [

    { id: 'admin-users', label: t.menuAdminUsers, iconName: menuIcon('users') }

  ];

}



export function buildProfileMenu(state) {

  if (!state.loggedIn) {

    return [];

  }

  return [

    { id: 'edit-profile', label: t.menuEditProfile, iconName: menuIcon('profile') },

    { id: 'change-password', label: t.menuChangePassword, iconName: menuIcon('password') },

    { type: 'separator' },

    { id: 'notification-settings', label: t.menuNotificationSettings, iconName: menuIcon('bell') }

  ];

}



export function buildSettingsMenu(state) {

  const items = [

    { id: 'preferences', label: t.menuPreferences, iconName: menuIcon('preferences') },

    {

      id: 'toggle-page-search',

      label: t.menuTitleBarPageSearch,

      iconName: menuIcon('search'),

      checked: state.pageSearchVisible,

      visible: state.loggedIn

    }

  ];

  if (state.loggedIn && state.isAdmin) {

    items.push(

      { type: 'separator' },

      { id: 'admin-database', label: t.menuAdminDatabase, iconName: menuIcon('database') },

      { id: 'admin-email', label: t.menuAdminEmail, iconName: menuIcon('email') }

    );

  }

  items.push(

    { type: 'separator' },

    { id: 'about', label: t.menuAbout, iconName: menuIcon('info') }

  );

  return items;

}



export function buildOutlineMenu(state) {

  if (!state.loggedIn) {

    return [];

  }

  return [{

    id: 'toggle-outline-panel',

    label: t.menuDocumentStructure,

    iconName: menuIcon('document_structure'),

    checked: state.outlinePanelVisible

  }];

}



export function buildCommentsMenu(state) {

  if (!state.loggedIn) {

    return [];

  }

  return [{

    id: 'toggle-comments-panel',

    label: t.menuComments,

    iconName: menuIcon('comments'),

    checked: state.commentsPanelVisible

  }];

}



export function buildTreeContextMenu(state) {

  if (!state.loggedIn) {

    return [];

  }

  const isWorkspace = state.contextKind === 'Workspace';

  const isPage = state.contextKind === 'Page';

  const isFavoritesRoot = state.contextKind === 'FavoritesRoot';

  const showFavorite = isWorkspace && state.canFavorite;

  const showWorkspaceLock = isWorkspace && (state.canLockWorkspace || state.canUnlockWorkspace);

  const showPageLock = isPage && (state.canLockPage || state.canUnlockPage);



  return [

    {

      id: 'new-root-workspace',

      label: t.menuNewRootWorkspace,

      iconName: menuIcon('folder_plus_workspace'),

      visible: !state.contextKind || isFavoritesRoot

    },

    {

      id: 'new-sub-workspace',

      label: t.ctxNewSubWorkspace,

      iconName: menuIcon('folder_plus_sub'),

      visible: isWorkspace,

      disabled: !state.contextWorkspaceId

    },

    {

      id: 'new-page',

      label: t.ctxNewPage,

      iconName: menuIcon('page_plus'),

      visible: isWorkspace,

      disabled: !state.contextWorkspaceId

    },

    { type: 'separator', visible: isWorkspace || !state.contextKind || isFavoritesRoot },

    {

      id: 'rename',

      label: t.menuRename,

      iconName: menuIcon('rename'),

      visible: Boolean(state.contextKind) && !isFavoritesRoot,

      disabled: !state.contextKind || isFavoritesRoot

    },

    {

      id: 'delete',

      label: t.menuDelete,

      iconName: menuIcon('delete'),

      visible: Boolean(state.contextKind) && !isFavoritesRoot,

      disabled: !state.contextKind || isFavoritesRoot

    },

    { type: 'separator', visible: showFavorite },

    {

      id: 'toggle-favorite',

      label: state.isFavorite ? t.ctxToggleFavoriteRemove : t.ctxToggleFavoriteAdd,

      iconName: menuIcon('star'),

      visible: showFavorite

    },

    { type: 'separator', visible: showWorkspaceLock || showPageLock },

    {

      id: state.canUnlockWorkspace ? 'unlock-workspace' : 'lock-workspace',

      label: state.canUnlockWorkspace ? t.ctxUnlockWorkspace : t.ctxLockWorkspace,

      iconName: menuIcon(state.canUnlockWorkspace ? 'unlock' : 'lock'),

      visible: showWorkspaceLock,

      disabled: !state.canLockWorkspace && !state.canUnlockWorkspace

    },

    {

      id: state.canUnlockPage ? 'unlock-page' : 'lock-page',

      label: state.canUnlockPage ? t.ctxUnlockPage : t.ctxLockPage,

      iconName: menuIcon(state.canUnlockPage ? 'unlock' : 'lock'),

      visible: showPageLock,

      disabled: !state.canLockPage && !state.canUnlockPage

    },

    { type: 'separator', visible: isWorkspace },

    {

      id: 'workspace-members',

      label: t.menuWorkspaceMembers,

      iconName: menuIcon('members'),

      visible: isWorkspace,

      disabled: !state.contextWorkspaceId

    }

  ];

}


