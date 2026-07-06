import { t, applyLanguage, toTemplateLanguage, getUiLanguage } from './i18n/index.js';
import { getUiFontScaleFactor, normalizeFontScaleStep } from './ui/fontScale.js';
import { bindLogin, tryRestoreSession } from './login.js';
import { createWorkspaceTree, showPopupMenu } from './workspaceTree.js';
import { createPageTabs } from './pageTabs.js';
import { createEditorBridge } from './editorBridge.js';
import { createNavRail } from './ui/navRail.js';
import { createVerticalToolbar } from './ui/verticalToolbar.js';
import { createTitleBar } from './ui/titleBar.js';
import { createStatusBar } from './ui/statusBar.js';
import { createPanelManager, renderOutline } from './ui/panelManager.js';
import {
  showAboutDialog,
  showPreferencesDialog,
  showPageHistoryDialog,
  showDatabaseSettingsDialog,
  showUserAdminDialog,
  showEditProfileDialog,
  showChangePasswordDialog,
  showNotificationSettingsDialog,
  showExportFormatDialog,
  showWorkspaceMembersDialog,
  showEmailSettingsDialog,
  showInputDialog,
  showConfirmDialog,
  showNewPageDialog
} from './dialogs/modals.js';
import { showTableInsertPopup } from './ui/tableInsertPopup.js';
import { showApiError, showUnexpectedError } from './errors/errorDetail.js';
import { installGlobalErrorHandler } from './errors/globalErrorHandler.js';
import { createCommentsPanel } from './comments/panel.js';
import { showToast } from './ui/toast.js';
import { closePopupMenu } from './ui/popupMenu.js';
import { initSplitters } from './ui/splitters.js';
import { createEditorContextMenu } from './editorContextMenu.js';
import {
  buildFileMenu,
  buildWorkspaceMenu,
  buildViewMenu,
  buildAdminMenu,
  buildProfileMenu,
  buildSettingsMenu,
  buildOutlineMenu,
  buildCommentsMenu,
  buildTreeContextMenu
} from './ui/menus.js';

const api = window.myworkspace;

installGlobalErrorHandler();

const appShell = document.getElementById('app-shell');
const editorFrame = document.getElementById('editor-frame');
const emptyState = document.getElementById('empty-state');
const workspaceTreeEl = document.getElementById('workspace-tree');

let onPanelStateChange = () => {};
const panelManager = createPanelManager({
  onChange: () => onPanelStateChange()
});
const statusBar = createStatusBar();
const editor = createEditorBridge(editorFrame);
editor.promptLink = async () => {
  const url = await showInputDialog({
    title: '링크 삽입',
    label: 'URL'
  });
  if (!url?.trim()) {
    return null;
  }
  const text = await showInputDialog({
    title: '링크 삽입',
    label: '표시 텍스트',
    defaultValue: url.trim()
  });
  if (text == null) {
    return null;
  }
  return { url: url.trim(), text: text.trim() || url.trim() };
};
const commentsPanel = createCommentsPanel(document.getElementById('comments-panel-body'), api);

let currentUser = null;
let currentPageId = null;
let currentPageTitle = '';
let autoSaveTimer = null;
let isSaving = false;
let navRail = null;
let verticalToolbar = null;
let recentProjects = [];
let currentPageCanEdit = true;
let uiFontScaleStep = 0;

const pageTabs = createPageTabs(document.getElementById('page-tabs'), {
  onSelect: (pageId) => openPage(pageId, { activateOnly: true }),
  onClose: (pageId) => closePage(pageId)
});

const workspaceTree = createWorkspaceTree(workspaceTreeEl, {
  onSelectPage: (node) => openPage(node.id),
  onCreatePage: (workspaceId) => createPageInWorkspace(workspaceId),
  onContextMenu: async (event, node, anchor) => {
    const items = buildTreeContextMenu(await getTreeContextMenuState(node));
    showPopupMenu(items, anchor, { onAction: (_id, item) => handleMenuAction(item.id, { node }) });
  },
  onEmptyContextMenu: (event, anchor) => {
    const items = buildTreeContextMenu(getMenuState({ contextKind: null }));
    showPopupMenu(items, anchor, { onAction: (actionId) => handleMenuAction(actionId) });
  }
});

const titleBar = createTitleBar({
  onPageSearch: async (query) => {
    const results = await api.searchPages(query);
    return (results || []).map((item) => ({
      ...item,
      onSelect: () => openPage(item.pageId)
    }));
  },
  onSettingsAction: (anchor) => {
    titleBar.showSettingsMenu(buildSettingsMenu(getMenuState()), anchor, handleMenuAction);
  },
  onWindowAction: (action) => {
    if (action === 'minimize') {
      api.minimizeWindow();
    } else if (action === 'close') {
      api.closeWindow();
    }
  }
});

editor.onChanged = () => {
  if (currentPageId == null || !currentPageCanEdit) {
    return;
  }
  pageTabs.setDirty(currentPageId, true);
  statusBar.setSaveStatus('modified');
  scheduleAutoSave();
};

editor.onHeadingsChanged = (headings) => {
  renderOutline(
    headings.map((heading) => ({
      ...heading,
      onClick: () => editor.scrollToHeading(heading.id)
    })),
    { pageKey: currentPageId }
  );
};

editor.onAssetInsertRequested = async (command) => {
  if (currentPageId == null) {
    return;
  }
  await importAssetIntoEditor(currentPageId, command === 'image');
};

editor.onFileDrop = async (message) => {
  if (currentPageId == null || !currentPageCanEdit) {
    return;
  }

  const dropPoint =
    message?.x != null && message?.y != null ? { x: message.x, y: message.y } : null;

  if (Array.isArray(message?.files) && message.files.length > 0) {
    await importDroppedFiles(currentPageId, message.files, dropPoint);
    return;
  }

  if (message?.dataUri) {
    await importDroppedFiles(
      currentPageId,
      [{ dataUri: message.dataUri, fileName: message.fileName || 'image.png' }],
      dropPoint
    );
  }
};

editor.onOpenResource = async (href) => {
  if (!href) {
    return;
  }
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
    await api.openExternal(href);
    return;
  }
  const assetMatch = /^page-asset:\/\/(\d+)\/([^?#]+)/i.exec(href);
  if (assetMatch) {
    await api.openPageAsset(Number.parseInt(assetMatch[1], 10), decodeURIComponent(assetMatch[2]));
  }
};

editor.onPasteRequested = async () => {
  if (currentPageId == null || !currentPageCanEdit) {
    return;
  }
  const clip = await api.readClipboard();
  if (!clip.ok) {
    return;
  }
  const html = clip.html || '';
  if (html && /page-asset:/i.test(html)) {
    const cloned = await api.clonePastedHtml(currentPageId, html);
    if (cloned.ok) {
      await editor.insertHtml(cloned.html);
      editor.onChanged?.();
    }
    return;
  }
  if (html) {
    await editor.insertHtml(html);
    editor.onChanged?.();
    return;
  }
  if (clip.text) {
    await editor.insertPlainText(clip.text);
    editor.onChanged?.();
  }
};

async function insertTableWithPicker(options = {}) {
  if (currentPageId == null || !currentPageCanEdit) {
    return;
  }
  const size = await showTableInsertPopup(options);
  if (!size) {
    return;
  }
  await editor.focus();
  await editor.insertTable(size.rows, size.cols);
  editor.onChanged?.();
}

const editorContextMenu = createEditorContextMenu({
  editor,
  editorFrame,
  t,
  getState: () => ({
    loggedIn: Boolean(currentUser),
    hasOpenPage: currentPageId != null,
    canEdit: currentPageCanEdit,
    outlinePanelVisible: panelManager.getState().outlinePanelVisible,
    onError: showUnexpectedError
  }),
  onCommentQuote: (quote) => {
    if (!quote?.trim() || currentPageId == null || !currentUser) {
      return;
    }
    if (!panelManager.getState().commentsPanelVisible) {
      panelManager.toggleCommentsPanel();
      refreshNavRailState();
    }
    commentsPanel.composeWithQuote(quote.trim());
  },
  onToggleOutline: () => {
    panelManager.toggleOutlinePanel();
    refreshNavRailState();
  },
  onImportImage: async ({ replace = false } = {}) => {
    if (currentPageId == null || !currentPageCanEdit) {
      return;
    }
    await importAssetIntoEditor(currentPageId, true, { replace });
  },
  onImportAttach: async () => {
    if (currentPageId == null || !currentPageCanEdit) {
      return;
    }
    await importAssetIntoEditor(currentPageId, false);
  },
  onInsertTable: async (point) => {
    await insertTableWithPicker(point || {});
  },
  onInsertLink: async () => {
    if (currentPageId == null || !currentPageCanEdit) {
      return;
    }
    await editor.focus();
    await editor.insertLink();
    editor.onChanged?.();
  },
  onOpenResource: (href) => editor.onOpenResource?.(href)
});

editor.onContextMenuRequested = ({ x, y }) => {
  editorContextMenu.showAt(x, y);
};

editor.onEditorPointerDown = () => {
  closePopupMenu();
};

editor.onClonePastedHtml = async (html) => {
  if (currentPageId == null || !currentPageCanEdit || !html) {
    return;
  }
  const cloned = await api.clonePastedHtml(currentPageId, html);
  if (cloned.ok) {
    await editor.insertHtml(cloned.html);
    editor.onChanged?.();
  }
};

window.addEventListener('message', (event) => {
  if (event.source !== editorFrame.contentWindow) {
    return;
  }
  if (event.data?.type === 'editor:save-requested') {
    saveCurrentPage();
  }
});

const login = bindLogin({
  onSuccess: async (user) => {
    await enterApp(user);
  }
});

function getMenuState(extra = {}) {
  const selection = workspaceTree.getSelection();
  return {
    loggedIn: Boolean(currentUser),
    isAdmin: currentUser?.role === 'Admin',
    hasOpenPage: currentPageId != null,
    selectedWorkspaceId:
      selection?.kind === 'Workspace'
        ? selection.id
        : selection?.kind === 'Page'
          ? selection.workspaceId
          : extra.contextWorkspaceId,
    selectedTreeItem: selection?.kind === 'FavoritesRoot' ? null : selection,
    recentProjects,
    ...panelManager.getState(),
    ...extra
  };
}

async function getTreeContextMenuState(node) {
  const base = getMenuState({
    contextKind: node?.kind,
    contextWorkspaceId: node?.kind === 'Workspace' ? node.id : node?.workspaceId
  });

  if (node?.kind === 'Workspace') {
    const [favoriteResult, lockResult] = await Promise.all([
      api.getWorkspaceFavorite(node.id),
      api.getWorkspaceLockState(node.id)
    ]);
    return {
      ...base,
      isFavorite: favoriteResult.ok && favoriteResult.isFavorite,
      canFavorite: true,
      canLockWorkspace: lockResult.ok && lockResult.canLock,
      canUnlockWorkspace: lockResult.ok && lockResult.canUnlock
    };
  }

  if (node?.kind === 'Page') {
    const lockResult = await api.getPageLockState(node.id);
    return {
      ...base,
      canLockPage: lockResult.ok && lockResult.canLock,
      canUnlockPage: lockResult.ok && lockResult.canUnlock
    };
  }

  return base;
}

async function loadRecentProjects() {
  try {
    recentProjects = (await api.getRecentProjects()) || [];
  } catch {
    recentProjects = [];
  }
}

function rebuildNavRail() {
  const state = getMenuState();
  const entries = {
    main: [
      { id: 'file', icon: 'file', tooltip: t.menuFile, items: buildFileMenu(state) },
      {
        id: 'workspace',
        icon: 'folder_plus_workspace',
        tooltip: t.menuWorkspace,
        items: buildWorkspaceMenu(state)
      },
      { id: 'view', icon: 'workspace', tooltip: t.tipMenuWorkspacePanel, items: buildViewMenu(state) },
      {
        id: 'outline',
        icon: 'document_structure',
        tooltip: t.tipMenuOutline,
        items: buildOutlineMenu(state)
      },
      { id: 'comments', icon: 'comments', tooltip: t.tipMenuComments, items: buildCommentsMenu(state) },
      { id: 'admin', icon: 'users', tooltip: t.menuAdmin, items: buildAdminMenu(state) }
    ],
    bottom: [
      { id: 'profile', icon: 'profile', tooltip: t.menuProfile, items: buildProfileMenu(state) },
      { id: 'logout', icon: 'logout', tooltip: t.menuLogout, items: [] }
    ]
  };

  if (!navRail) {
    navRail = createNavRail(document.getElementById('nav-rail'), entries, {
      onAction: (_menuId, actionId) => {
        handleMenuAction(actionId);
      }
    });
  } else {
    navRail.updateEntries(entries);
  }

  refreshNavRailState();
}

function refreshNavRailState() {
  const state = getMenuState();
  navRail?.setVisible('workspace', state.loggedIn);
  navRail?.setVisible('view', state.loggedIn);
  navRail?.setVisible('outline', state.loggedIn);
  navRail?.setVisible('comments', state.loggedIn);
  navRail?.setVisible('admin', state.loggedIn && state.isAdmin);
  navRail?.setVisible('profile', state.loggedIn);
  navRail?.setVisible('logout', state.loggedIn);
  navRail?.setPressed('view', state.workspacePanelVisible);
  navRail?.setPressed('outline', state.outlinePanelVisible);
  navRail?.setPressed('comments', state.commentsPanelVisible);
}

onPanelStateChange = refreshNavRailState;

function applyUiAppearance({ theme, language, fontScaleStep } = {}) {
  if (language != null) {
    applyLanguage(language);
  }
  if (theme != null) {
    document.body.dataset.theme = theme.toLowerCase() === 'dark' ? 'dark' : 'light';
  }
  if (fontScaleStep != null) {
    uiFontScaleStep = normalizeFontScaleStep(fontScaleStep);
    document.documentElement.style.setProperty('--ui-font-scale', String(getUiFontScaleFactor(uiFontScaleStep)));
  }
}

function refreshLocalizedUi() {
  document.querySelector('.login-subtitle')?.replaceChildren(document.createTextNode(t.loginSubtitle));
  const loginLabels = document.querySelectorAll('#login-form > label');
  if (loginLabels[0]?.firstChild?.nodeType === Node.TEXT_NODE) {
    loginLabels[0].firstChild.textContent = t.loginUserId;
  }
  if (loginLabels[1]?.firstChild?.nodeType === Node.TEXT_NODE) {
    loginLabels[1].firstChild.textContent = t.loginPassword;
  }
  const loginButton = document.querySelector('#login-form button[type="submit"]');
  if (loginButton) {
    loginButton.textContent = t.loginButton;
  }
  document.querySelector('.login-hint')?.replaceChildren(document.createTextNode(t.loginHint));

  document.getElementById('btn-settings-mark')?.setAttribute('title', t.settingsTooltip);
  document.getElementById('btn-settings-mark')?.setAttribute('aria-label', t.settingsTooltip);
  document.getElementById('page-search')?.setAttribute('placeholder', t.titleBarPageSearchPlaceholder);
  document.getElementById('btn-minimize')?.setAttribute('title', t.windowMinimize);
  document.getElementById('btn-minimize')?.setAttribute('aria-label', t.windowMinimize);
  document.getElementById('btn-maximize')?.setAttribute('title', t.windowMaximize);
  document.getElementById('btn-maximize')?.setAttribute('aria-label', t.windowMaximize);
  document.getElementById('btn-close')?.setAttribute('title', t.windowClose);
  document.getElementById('btn-close')?.setAttribute('aria-label', t.windowClose);
  document.getElementById('nav-rail')?.setAttribute('aria-label', t.navRailAria);
  document.querySelector('#outline-panel .panel-title')?.replaceChildren(document.createTextNode(t.labelOutline));
  document.querySelector('#comments-panel .panel-title')?.replaceChildren(document.createTextNode(t.commentsTitle));
  document.querySelector('#empty-state p')?.replaceChildren(document.createTextNode(t.emptyEditor));
  document.querySelector('#comments-panel-body .comments-placeholder')?.replaceChildren(
    document.createTextNode(t.commentsSelectPage)
  );
  document.getElementById('vertical-toolbar')?.setAttribute('aria-label', t.verticalToolbarAria);
  document.getElementById('status-left')?.replaceChildren();

  panelManager.refresh();
  initToolbar();
  rebuildNavRail();

  if (currentUser) {
    titleBar.setCaption(t.appTitleLoggedIn(currentUser.username));
    statusBar.setUser(currentUser, currentPageTitle || null);
  } else {
    statusBar.setLoginRequired();
  }
}

function initToolbar() {
  verticalToolbar = createVerticalToolbar(document.getElementById('vertical-toolbar'), t, {
    onCommand: async (item, anchor) => {
    if (item.command === 'about') {
      showAboutDialog();
      return;
    }
    if (item.command === 'toggle-outline') {
      panelManager.toggleOutlinePanel();
      refreshNavRailState();
      return;
    }
    if (currentPageId == null) {
      showToast(t.selectPageToEdit);
      return;
    }
    if (!currentPageCanEdit) {
      showToast(t.pageLockedCannotEdit);
      return;
    }
    try {
      if (item.command === 'table') {
        await insertTableWithPicker({ anchor });
        return;
      }
      await editor.focus();
      await editor.runCommand(item);
    } catch (error) {
      showUnexpectedError('편집 명령', error);
    }
    }
  });
}

async function handleMenuAction(actionId, context = {}) {
  try {
    switch (actionId) {
      case 'save-page':
        await saveCurrentPage();
        break;
      case 'refresh-tree':
        await refreshWorkspaceTree();
        break;
      case 'login':
        login.show();
        break;
      case 'logout':
        if (!(await showConfirmDialog({
          title: t.menuLogout,
          message: t.logoutConfirm,
          confirmLabel: t.menuLogout
        }))) {
          break;
        }
        await saveCurrentPageIfDirty();
        await api.logout();
        await leaveApp();
        break;
      case 'about':
        showAboutDialog();
        break;
      case 'exit':
        await api.quitApp();
        break;
      case 'new-root-workspace':
        await promptCreateWorkspace(null);
        break;
      case 'new-sub-workspace':
        await promptCreateWorkspace(context.node?.id || getMenuState().selectedWorkspaceId);
        break;
      case 'new-page':
        if (!context.node?.id && !getMenuState().selectedWorkspaceId) {
          showToast(t.selectWorkspace);
          break;
        }
        await createPageInWorkspace(context.node?.id || getMenuState().selectedWorkspaceId);
        break;
      case 'rename':
        await promptRename(context.node || getMenuState().selectedTreeItem);
        break;
      case 'delete':
        await promptDelete(context.node || getMenuState().selectedTreeItem);
        break;
      case 'toggle-outline-panel':
        panelManager.toggleOutlinePanel();
        refreshNavRailState();
        break;
      case 'toggle-comments-panel':
        panelManager.toggleCommentsPanel();
        refreshNavRailState();
        break;
      case 'toggle-workspace-panel':
        panelManager.toggleWorkspacePanel();
        refreshNavRailState();
        break;
      case 'toggle-page-search':
        panelManager.togglePageSearch();
        rebuildNavRail();
        break;
      case 'preferences':
        await showPreferencesDialog(api, async ({ theme, language, fontScaleStep }) => {
          applyUiAppearance({ theme, language, fontScaleStep });
          refreshLocalizedUi();
          await editor.applyAppearance({
            theme: theme?.toLowerCase() === 'dark' ? 'dark' : 'light',
            fontScaleStep
          });
        });
        break;
      case 'page-history':
        if (currentPageId != null) {
          await showPageHistoryDialog(api, currentPageId, currentPageTitle, async (page) => {
            await openPage(page.id, { activateOnly: true });
            await editor.loadMarkdown(page.content);
          });
        }
        break;
    case 'export-page':
      if (currentPageId != null) {
        await exportCurrentPage();
      }
      break;
    case 'export-workspace': {
      const workspaceId =
        context.node?.kind === 'Workspace' ? context.node.id : getMenuState().selectedWorkspaceId;
      if (workspaceId) {
        await exportWorkspaceById(workspaceId);
      }
      break;
    }
      case 'new-project': {
        const name = await showInputDialog({
          title: t.newProjectTitle,
          label: t.newProjectNameLabel
        });
        if (!name?.trim()) {
          break;
        }
        const result = await api.newProject(name.trim());
        if (result.ok) {
          showToast(`프로젝트 생성: ${result.filePath}`);
          await refreshWorkspaceTree();
        } else {
          showApiError('새 프로젝트', result);
        }
        break;
      }
      case 'save-project': {
        const workspaceId = getMenuState().selectedWorkspaceId;
        if (!workspaceId) {
          showToast(t.selectWorkspaceToSave);
          break;
        }
        const result = await api.saveProject(workspaceId);
        if (result.ok) {
          showToast(`프로젝트 저장: ${result.filePath}`);
          await loadRecentProjects();
          rebuildNavRail();
        } else {
          showApiError('프로젝트 저장', result);
        }
        break;
      }
      case 'load-project': {
        const result = await api.loadProject();
        if (result.ok) {
          showToast(`프로젝트 열기: ${result.pageCount} Page`);
          await refreshWorkspaceTree();
          await loadRecentProjects();
          rebuildNavRail();
        } else {
          showApiError('프로젝트 열기', result);
        }
        break;
      }
      case 'admin-database':
        showDatabaseSettingsDialog();
        break;
      case 'admin-users':
        await showUserAdminDialog(api);
        break;
    case 'admin-email':
      await showEmailSettingsDialog(api);
      break;
      case 'edit-profile':
        await showEditProfileDialog(api, async (user) => {
          currentUser = user;
          titleBar.setCaption(t.appTitleLoggedIn(user.username));
          statusBar.setUser(user, currentPageTitle);
        });
        break;
      case 'change-password':
        await showChangePasswordDialog(api);
        break;
      case 'notification-settings':
        await showNotificationSettingsDialog(api, (user) => {
          currentUser = user;
        });
        break;
    case 'workspace-members': {
      const workspaceId =
        context.node?.kind === 'Workspace' ? context.node.id : getMenuState().selectedWorkspaceId;
      if (workspaceId) {
        await showWorkspaceMembersDialog(api, workspaceId);
      } else {
        showToast(t.selectWorkspace);
      }
      break;
    }
      case 'toggle-favorite': {
        const workspaceId = context.node?.kind === 'Workspace' ? context.node.id : null;
        if (!workspaceId) {
          break;
        }
        const favoriteResult = await api.getWorkspaceFavorite(workspaceId);
        const nextFavorite = !(favoriteResult.ok && favoriteResult.isFavorite);
        const result = await api.setWorkspaceFavorite(workspaceId, nextFavorite);
        if (!result.ok) {
          showApiError('즐겨찾기', result);
          break;
        }
        await refreshWorkspaceTree();
        break;
      }
      case 'lock-workspace':
        if (context.node?.kind === 'Workspace') {
          const result = await api.lockWorkspace(context.node.id);
          if (!result.ok) {
            showApiError('Workspace 잠금', result);
          } else {
            await refreshWorkspaceTree();
            if (currentPageId != null) {
              await openPage(currentPageId, { activateOnly: true });
            }
          }
        }
        break;
      case 'unlock-workspace':
        if (context.node?.kind === 'Workspace') {
          const result = await api.unlockWorkspace(context.node.id);
          if (!result.ok) {
            showApiError('Workspace 잠금 해제', result);
          } else {
            await refreshWorkspaceTree();
            if (currentPageId != null) {
              await openPage(currentPageId, { activateOnly: true });
            }
          }
        }
        break;
      case 'lock-page':
        if (context.node?.kind === 'Page') {
          const result = await api.lockPage(context.node.id);
          if (!result.ok) {
            showApiError('Page 잠금', result);
          } else {
            await refreshWorkspaceTree();
            if (currentPageId === context.node.id) {
              await openPage(currentPageId, { activateOnly: true });
            }
          }
        }
        break;
      case 'unlock-page':
        if (context.node?.kind === 'Page') {
          const result = await api.unlockPage(context.node.id);
          if (!result.ok) {
            showApiError('Page 잠금 해제', result);
          } else {
            await refreshWorkspaceTree();
            if (currentPageId === context.node.id) {
              await openPage(currentPageId, { activateOnly: true });
            }
          }
        }
        break;
      default:
        if (actionId.startsWith('recent-project:')) {
          const index = Number.parseInt(actionId.split(':')[1], 10);
          const filePath = recentProjects[index];
          if (filePath) {
            const result = await api.openProject(filePath);
            if (result.ok) {
              showToast(`프로젝트 열기: ${result.pageCount} Page`);
              await refreshWorkspaceTree();
              await loadRecentProjects();
              rebuildNavRail();
            } else {
              showApiError('프로젝트 열기', result);
            }
          }
        }
        break;
    }
  } catch (error) {
    showUnexpectedError('작업 오류', error);
  }
}

async function exportCurrentPage() {
  const format = await showExportFormatDialog('Page 내보내기');
  if (!format) {
    return;
  }
  const result = await api.exportPage(currentPageId, format);
  if (result.ok) {
    showToast(`내보내기 완료: ${result.filePath}`);
  } else {
    showApiError('Page 내보내기', result);
  }
}

async function exportWorkspaceById(workspaceId) {
  const format = await showExportFormatDialog('Workspace 내보내기');
  if (!format) {
    return;
  }
  const result = await api.exportWorkspace(workspaceId, format);
  if (result.ok) {
    const target = result.filePath || result.folder;
    showToast(`내보내기 완료: ${target}`);
  } else {
    showApiError('Workspace 내보내기', result);
  }
}

let shellInitialized = false;
let cachedUiConfig = null;

async function ensureAppShellReady(config = cachedUiConfig) {
  if (shellInitialized) {
    return;
  }

  if (config) {
    cachedUiConfig = config;
  } else if (!cachedUiConfig) {
    cachedUiConfig = await api.getUiConfig();
  }

  shellInitialized = true;
  initSplitters();
  initEditorHostFileDrop();
  appShell.classList.remove('hidden');
  verticalToolbar?.setEnabled(false);
  void editor.applyAppearance({
    theme: cachedUiConfig.theme?.toLowerCase() === 'dark' ? 'dark' : 'light',
    fontScaleStep: cachedUiConfig.fontScaleStep
  });
  void loadRecentProjects();
}

async function bootstrap() {
  login.show();

  cachedUiConfig = await api.getUiConfig();
  applyUiAppearance({
    theme: cachedUiConfig.theme,
    language: cachedUiConfig.language,
    fontScaleStep: cachedUiConfig.fontScaleStep
  });
  refreshLocalizedUi();
  statusBar.setLoginRequired();

  const restored = await tryRestoreSession(enterApp);
  if (!restored) {
    login.show();
  }
}

async function enterApp(user) {
  await ensureAppShellReady();
  currentUser = user;
  appShell.classList.remove('hidden');
  login.hide();
  titleBar.setCaption(t.appTitleLoggedIn(user.username));
  statusBar.setUser(user);
  await loadRecentProjects();
  rebuildNavRail();
  panelManager.refresh();
  verticalToolbar?.setEnabled(false);
  await refreshWorkspaceTree();
}

async function leaveApp() {
  currentUser = null;
  currentPageId = null;
  currentPageTitle = '';
  for (const pageId of [...pageTabs.getOpenIds()]) {
    pageTabs.close(pageId);
  }
  workspaceTree.clearSelection();
  emptyState.classList.remove('hidden');
  editorFrame.classList.add('hidden');
  titleBar.setCaption(t.appName);
  statusBar.setLoginRequired();
  commentsPanel.setPage(null);
  rebuildNavRail();
  panelManager.refresh();
  verticalToolbar?.setEnabled(false);
  login.show();
}

function renderWorkspaceEmptyState() {
  const existing = workspaceTreeEl.querySelector('.workspace-empty-actions');
  if (existing) {
    existing.remove();
  }

  const wrap = document.createElement('div');
  wrap.className = 'workspace-empty-actions';
  wrap.innerHTML = '<p>Workspace가 없습니다. 새 Workspace를 만들어 시작하세요.</p>';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-primary';
  button.textContent = t.menuNewRootWorkspace;
  button.addEventListener('click', () => promptCreateWorkspace(null));
  wrap.appendChild(button);
  workspaceTreeEl.appendChild(wrap);
}

async function refreshWorkspaceTree() {
  const tree = await api.getWorkspaceTree();
  workspaceTree.render(tree || []);
  if (!tree?.length) {
    renderWorkspaceEmptyState();
  }
  rebuildNavRail();
}

async function promptCreateWorkspace(parentId) {
  const name = await showInputDialog({
    title: parentId ? t.menuNewSubWorkspace : t.menuNewRootWorkspace,
    label: 'Workspace 이름'
  });
  if (!name?.trim()) {
    return;
  }
  const result = await api.createWorkspace({ name: name.trim(), parentId });
  if (!result.ok) {
    showApiError('Workspace 생성', result);
    return;
  }
  await refreshWorkspaceTree();
  showToast(`Workspace 생성: ${result.workspace.name}`);
}

async function promptRename(node) {
  if (!node) {
    showToast(t.selectItem);
    return;
  }

  const isWorkspace = node.kind === 'Workspace';
  const currentName = node.name || '';
  const title = await showInputDialog({
    title: isWorkspace ? 'Workspace 이름 변경' : 'Page 제목 변경',
    label: isWorkspace ? 'Workspace 이름' : 'Page 제목',
    defaultValue: currentName
  });
  if (title == null || !title.trim()) {
    return;
  }

  const result = isWorkspace
    ? await api.renameWorkspace(node.id, title.trim())
    : await api.renamePage(node.id, title.trim());

  if (!result.ok) {
    showApiError(isWorkspace ? 'Workspace 이름 변경' : 'Page 제목 변경', result);
    return;
  }

  if (!isWorkspace && currentPageId === node.id) {
    currentPageTitle = result.page.title;
    pageTabs.setTitle(node.id, result.page.title);
    statusBar.setUser(currentUser, currentPageTitle);
  }

  await refreshWorkspaceTree();
}

async function promptDelete(node) {
  if (!node) {
    showToast(t.selectItem);
    return;
  }

  const isWorkspace = node.kind === 'Workspace';
  const confirmed = await showConfirmDialog({
    title: isWorkspace ? 'Workspace 삭제' : 'Page 삭제',
    message: isWorkspace
      ? `"${node.name}" Workspace와 포함된 Page를 삭제할까요?`
      : `"${node.name}" Page를 삭제할까요?`,
    confirmLabel: '삭제',
    danger: true
  });
  if (!confirmed) {
    return;
  }

  const result = isWorkspace
    ? await api.deleteWorkspace(node.id, true)
    : await api.deletePage(node.id, true);

  if (!result.ok) {
    showApiError(isWorkspace ? 'Workspace 삭제' : 'Page 삭제', result);
    return;
  }

  if (!isWorkspace && pageTabs.has(node.id)) {
    await closePage(node.id);
  }

  await refreshWorkspaceTree();
}

async function openPage(pageId, { activateOnly = false } = {}) {
  if (currentPageId != null && currentPageId !== pageId && !activateOnly) {
    await saveCurrentPageIfDirty();
  }

  const result = await api.getPage(pageId);
  if (!result.ok) {
    showApiError('Page 열기', result);
    return;
  }

  currentPageId = pageId;
  currentPageTitle = result.page.title;
  currentPageCanEdit = result.page.canEdit !== false;
  emptyState.classList.add('hidden');
  editorFrame.classList.remove('hidden');
  verticalToolbar?.setEnabled(currentPageCanEdit);

  if (!pageTabs.has(pageId)) {
    pageTabs.open(result.page);
  } else {
    pageTabs.setActive(pageId);
  }

  await editor.loadMarkdown(result.page.content);
  await editor.focus();
  statusBar.setUser(currentUser, currentPageTitle);
  statusBar.setSaveStatus('saved');
  commentsPanel.setPage(pageId);
  rebuildNavRail();
}

async function closePage(pageId) {
  if (pageTabs.getActiveId() === pageId) {
    await saveCurrentPageIfDirty();
  }
  pageTabs.close(pageId);

  const remaining = pageTabs.getOpenIds();
  if (remaining.length === 0) {
    currentPageId = null;
    currentPageTitle = '';
    emptyState.classList.remove('hidden');
    editorFrame.classList.add('hidden');
    verticalToolbar?.setEnabled(false);
    statusBar.setUser(currentUser);
    statusBar.setSaveStatus('none');
    renderOutline([], { pageKey: null, resetExpansion: true });
    commentsPanel.setPage(null);
    rebuildNavRail();
    return;
  }

  await openPage(remaining[remaining.length - 1], { activateOnly: true });
}

async function createPageInWorkspace(workspaceId) {
  if (!workspaceId) {
    showToast(t.selectWorkspace);
    return;
  }

  const templateLanguage = toTemplateLanguage(getUiLanguage());
  const form = await showNewPageDialog(api, templateLanguage);
  if (!form) {
    return;
  }

  const built = await api.buildPageFromTemplate(form.templateId, form.title, templateLanguage);
  if (!built.ok) {
    showApiError(t.errPageTemplates, built);
    return;
  }

  const result = await api.createPage({
    workspaceId,
    title: form.title.trim() || t.untitledPageTitle,
    content: built.content
  });
  if (!result.ok) {
    showApiError('Page 생성', result);
    return;
  }
  await refreshWorkspaceTree();
  await openPage(result.page.id);
}

async function importAssetIntoEditor(pageId, imageOnly, { replace = false } = {}) {
  const result = await api.pickAndImportAsset(pageId, imageOnly);
  if (!result.ok) {
    showApiError(imageOnly ? '이미지 삽입' : '파일 첨부', result);
    return;
  }

  if (replace && imageOnly) {
    try {
      const frameApi = editorFrame.contentWindow?.editorApi;
      const alt = result.asset.displayName || result.asset.fileName?.replace(/\.[^.]+$/, '') || '';
      if (frameApi?.replaceSelectedImage?.(result.asset.uri, alt)) {
        frameApi.refreshEditorBlocks?.();
        editor.onChanged?.();
        return;
      }
    } catch (error) {
      showUnexpectedError('이미지 바꾸기', error);
      return;
    }
  }

  await insertAssetIntoEditor(result.asset);
}

function readFileAsDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}

function isExternalFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function toIframePoint(clientX, clientY) {
  const frameRect = editorFrame.getBoundingClientRect();
  return {
    x: clientX - frameRect.left,
    y: clientY - frameRect.top
  };
}

async function importDroppedFiles(pageId, files, dropPoint) {
  let useDropPoint = Boolean(dropPoint);

  for (const fileEntry of files) {
    const dataUri = fileEntry.dataUri || (fileEntry instanceof File ? await readFileAsDataUri(fileEntry) : '');
    const fileName = fileEntry.fileName || fileEntry.name || 'file.bin';
    if (!dataUri) {
      continue;
    }

    const result = await api.importAssetDataUri(pageId, dataUri, fileName);
    if (!result.ok) {
      showApiError('파일 삽입', result);
      continue;
    }

    const point = useDropPoint ? dropPoint : null;
    await insertAssetIntoEditor(result.asset, point);
    useDropPoint = false;
  }
}

function initEditorHostFileDrop() {
  const host = document.querySelector('.editor-host');
  if (!host) {
    return;
  }

  host.addEventListener('dragover', (event) => {
    if (!isExternalFileDrag(event) || currentPageId == null || !currentPageCanEdit) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });

  host.addEventListener('drop', async (event) => {
    if (!isExternalFileDrag(event) || currentPageId == null || !currentPageCanEdit) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) {
      return;
    }

    const dropPoint = toIframePoint(event.clientX, event.clientY);
    try {
      await importDroppedFiles(currentPageId, files, dropPoint);
    } catch (error) {
      showUnexpectedError('파일 드롭', error);
    }
  });
}

async function insertAssetIntoEditor(asset, dropMessage) {
  try {
    const frameApi = editorFrame.contentWindow?.editorApi;
    if (!frameApi) {
      throw new Error('편집기가 준비되지 않았습니다.');
    }

    const displayName = asset.displayName || asset.fileName || 'file';
    const isImage = asset.isImage ?? /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(asset.fileName || asset.uri || '');

    if (
      dropMessage?.x != null &&
      dropMessage?.y != null &&
      frameApi.insertImageAtDropPoint &&
      isImage
    ) {
      frameApi.insertImageAtDropPoint(dropMessage.x, dropMessage.y, asset.uri, displayName);
    } else if (isImage && frameApi.insertImage) {
      frameApi.insertImage(asset.uri, displayName);
    } else if (frameApi.insertFileAttachment) {
      frameApi.insertFileAttachment(asset.uri, displayName);
    } else if (frameApi.insertHtml) {
      frameApi.insertHtml(
        `<a class="editor-file-attachment" contenteditable="false" href="${asset.uri}">${displayName}</a><p><br></p>`
      );
    }

    frameApi.refreshEditorBlocks?.();
    frameApi.finalizeImageSizes?.();
    editor.onChanged?.();
  } catch (error) {
    showUnexpectedError('에셋 삽입', error);
  }
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveCurrentPage({ auto: true }).catch((error) => {
      statusBar.setSaveStatus('error', error.message);
      showUnexpectedError('자동 저장', error);
    });
  }, 2000);
}

async function saveCurrentPageIfDirty() {
  if (currentPageId == null) {
    return;
  }
  const activeTab = document.querySelector('.page-tab.is-active span');
  if (!activeTab?.textContent?.includes('*')) {
    return;
  }
  await saveCurrentPage();
}

async function saveCurrentPage({ auto = false } = {}) {
  if (currentPageId == null || isSaving) {
    return;
  }

  isSaving = true;
  statusBar.setSaveStatus('saving');

  try {
    const snapshot = await editor.readContent(t.untitledPageTitle);
    const result = await api.savePage({
      pageId: currentPageId,
      title: snapshot.title,
      content: snapshot.markdown
    });

    if (!result.ok) {
      showApiError(auto ? '자동 저장' : 'Page 저장', result);
      throw new Error(result.message);
    }

    currentPageTitle = result.page.title;
    pageTabs.setTitle(currentPageId, result.page.title);
    pageTabs.setDirty(currentPageId, false);
    statusBar.setUser(currentUser, currentPageTitle);
    statusBar.setSaveStatus(auto ? 'autosaved' : 'saved');
    await refreshWorkspaceTree();
  } catch (error) {
    statusBar.setSaveStatus('error', error.message);
    if (!auto) {
      showUnexpectedError('Page 저장', error);
    }
    throw error;
  } finally {
    isSaving = false;
  }
}

document.addEventListener('keydown', async (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === 's' && currentPageId != null) {
    event.preventDefault();
    await saveCurrentPage();
  }
  if (event.key === 'F5' && currentUser) {
    event.preventDefault();
    await refreshWorkspaceTree();
  }
  if (event.key === 'Escape') {
    closePopupMenu();
  }
  if (
    event.key === 'Delete' &&
    currentUser &&
    document.activeElement?.closest('#workspace-tree') &&
    !document.activeElement?.matches('input, textarea, [contenteditable="true"]')
  ) {
    const selection = workspaceTree.getSelection();
    if (selection?.kind === 'Workspace' || selection?.kind === 'Page') {
      event.preventDefault();
      await promptDelete(selection);
    }
  }
});

bootstrap().catch((error) => {
  window.__mwHandleFatalError?.(error, { type: 'bootstrap' });
});
