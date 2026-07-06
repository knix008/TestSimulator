const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { login } = require('../services/authService');
const {
  getWorkspaceTree,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  setFavorite,
  isFavorite,
  canEditWorkspaceContent,
  canFavoriteWorkspace,
  canLockWorkspace,
  canUnlockWorkspace,
  lockWorkspace,
  unlockWorkspace,
  getAccessibleWorkspaceIds
} = require('../services/workspaceService');
const {
  getPage,
  createPage,
  savePage,
  renamePage,
  deletePage,
  searchPages,
  canLockPage,
  canUnlockPage,
  lockPage,
  unlockPage,
  isPageLocked,
  canEditPageContent
} = require('../services/pageService');
const {
  exportWorkspace: exportWorkspaceArchive,
  saveArchive,
  loadArchive,
  importWorkspace
} = require('../services/workspaceArchiveService');
const {
  getVersions,
  getVersion,
  restoreVersion
} = require('../services/pageVersionService');
const {
  exportPage,
  exportWorkspace: exportWorkspaceDocument,
  exportPageMarkdown,
  exportWorkspaceMarkdown,
  getExportExtension,
  getExportFilter,
  sanitizeFileName: sanitizeExportFileName
} = require('../services/pageExportService');
const {
  getComments,
  addComment,
  updateComment,
  deleteComment
} = require('../services/pageCommentService');
const {
  importFileFromPath,
  importImageBytes,
  importAssetBytes,
  tryGetAssetBytes,
  resolveAssetFromCache,
  cloneEmbeddedPageAssetHtml
} = require('../services/pageAssetService');
const {
  getAllUsers,
  createUser,
  updateUser,
  updateOwnProfile,
  updateNotificationSettings,
  changePassword,
  deleteUser,
  getUserById
} = require('../services/userService');
const {
  getMembers,
  addMember,
  removeMember,
  updateMemberRole,
  getAvailableUsers
} = require('../services/workspaceMemberService');
const {
  getEmailConfig,
  saveEmailConfig,
  testEmailConnection
} = require('../services/emailService');
const { showOpenDialog, showSaveDialog, showOpenDirectoryDialog } = require('./dialogs');
const { saveLocalConfig, getUserDataPaths } = require('../config');
const { success, failure, wrapHandler } = require('../utils/ipcResult');
const { listTemplates, buildContent, normalizeTemplateLanguage } = require('../services/pageTemplateService');
const { clipboard, shell } = require('electron');

function registerIpcHandlers(deps) {
  const db = () => deps.getDb();
  const user = () => requireUser(deps);
  const window = () => deps.getMainWindow();

  const access = {
    canAccessWorkspace: (u, workspaceId) => getAccessibleWorkspaceIds(db(), u).includes(workspaceId),
    canEditWorkspaceContent,
    getPageWorkspaceId: (pageId) => {
      const row = db().prepare('SELECT workspace_id FROM pages WHERE id = ?').get(pageId);
      return row?.workspace_id ?? null;
    }
  };

  ipcMain.handle(
    'auth:login',
    wrapHandler(async (_event, { username, password }) => {
      const result = login(db(), username, password);
      if (result.ok) {
        deps.setSessionUser(result.user);
      } else if (!result.details) {
        result.details = result.message;
      }
      return result;
    })
  );

  ipcMain.handle('auth:logout', () => {
    deps.setSessionUser(null);
    return success();
  });

  ipcMain.handle('auth:session', () => {
    const current = deps.getSessionUser();
    return current ? success({ user: current }) : { ok: false };
  });

  ipcMain.handle('app:uiConfig', () => {
    const config = deps.getConfig();
    return success({
      theme: config?.Ui?.Theme || 'Light',
      language: config?.Ui?.Language || 'Korean',
      fontScaleStep: Number.parseInt(config?.Ui?.FontScaleStep, 10) || 0
    });
  });

  ipcMain.handle('app:getInfo', () => {
    const pkg = require(path.join(__dirname, '..', '..', '..', 'package.json'));
    return success({
      version: pkg.version || '0.1.0',
      productName: 'MyWorkspace'
    });
  });

  ipcMain.handle(
    'app:saveUiConfig',
    wrapHandler(async (_event, partial) => {
      saveLocalConfig({ Ui: partial });
      return success();
    })
  );

  ipcMain.handle(
    'workspace:getTree',
    wrapHandler(async () => getWorkspaceTree(db(), user()))
  );

  ipcMain.handle(
    'workspace:create',
    wrapHandler(async (_event, payload) => {
      const workspace = createWorkspace(db(), user(), payload);
      return success({ workspace });
    })
  );

  ipcMain.handle(
    'workspace:rename',
    wrapHandler(async (_event, { workspaceId, name }) => {
      const workspace = renameWorkspace(db(), user(), workspaceId, name);
      return success({ workspace });
    })
  );

  ipcMain.handle(
    'workspace:delete',
    wrapHandler(async (_event, { workspaceId, confirmed }) => {
      deleteWorkspace(db(), user(), workspaceId, confirmed);
      return success();
    })
  );

  ipcMain.handle(
    'workspace:setFavorite',
    wrapHandler(async (_event, { workspaceId, isFavorite: favorite }) => {
      setFavorite(db(), user(), workspaceId, favorite);
      return success({ isFavorite: favorite });
    })
  );

  ipcMain.handle(
    'workspace:getFavorite',
    wrapHandler(async (_event, { workspaceId }) => {
      return success({ isFavorite: isFavorite(db(), user(), workspaceId) });
    })
  );

  ipcMain.handle(
    'workspace:lock',
    wrapHandler(async (_event, { workspaceId }) => {
      lockWorkspace(db(), user(), workspaceId);
      return success();
    })
  );

  ipcMain.handle(
    'workspace:unlock',
    wrapHandler(async (_event, { workspaceId }) => {
      unlockWorkspace(db(), user(), workspaceId);
      return success();
    })
  );

  ipcMain.handle(
    'workspace:getLockState',
    wrapHandler(async (_event, { workspaceId }) => {
      return success({
        canLock: canLockWorkspace(db(), user(), workspaceId),
        canUnlock: canUnlockWorkspace(db(), user(), workspaceId),
        isLocked: require('../services/workspaceService').isWorkspaceLocked(db(), workspaceId)
      });
    })
  );

  ipcMain.handle(
    'workspace:getMembers',
    wrapHandler(async (_event, { workspaceId }) => {
      const members = getMembers(db(), user(), workspaceId);
      const availableUsers = getAvailableUsers(db(), user(), workspaceId);
      return success({ members, availableUsers });
    })
  );

  ipcMain.handle(
    'workspace:addMember',
    wrapHandler(async (_event, { workspaceId, userId, role }) => {
      addMember(db(), user(), workspaceId, userId, role);
      return success();
    })
  );

  ipcMain.handle(
    'workspace:removeMember',
    wrapHandler(async (_event, { workspaceId, userId }) => {
      removeMember(db(), user(), workspaceId, userId);
      return success();
    })
  );

  ipcMain.handle(
    'workspace:updateMemberRole',
    wrapHandler(async (_event, { workspaceId, userId, role }) => {
      updateMemberRole(db(), user(), workspaceId, userId, role);
      return success();
    })
  );

  ipcMain.handle('app:getEmailConfig', () => success({ config: getEmailConfig() }));

  ipcMain.handle(
    'app:saveEmailConfig',
    wrapHandler(async (_event, partial) => {
      const config = saveEmailConfig(partial);
      return success({ config });
    })
  );

  ipcMain.handle(
    'app:testEmailConfig',
    wrapHandler(async (_event, config) => {
      await testEmailConnection(config || getEmailConfig());
      return success();
    })
  );

  ipcMain.handle(
    'page:get',
    wrapHandler(async (_event, { pageId }) => {
      const page = getPage(db(), user(), pageId);
      if (!page) {
        return failure('Page를 찾을 수 없습니다.');
      }
      return success({ page });
    })
  );

  ipcMain.handle(
    'page:create',
    wrapHandler(async (_event, payload) => {
      const page = createPage(db(), user(), payload);
      return success({ page });
    })
  );

  ipcMain.handle('page:listTemplates', wrapHandler(async (_event, { language } = {}) => {
    return success({ templates: listTemplates(normalizeTemplateLanguage(language)) });
  }));

  ipcMain.handle(
    'page:buildFromTemplate',
    wrapHandler(async (_event, { templateId, title, language }) => {
      return success({
        content: buildContent(templateId, title, normalizeTemplateLanguage(language))
      });
    })
  );

  ipcMain.handle(
    'page:lock',
    wrapHandler(async (_event, { pageId }) => {
      lockPage(db(), user(), pageId);
      return success();
    })
  );

  ipcMain.handle(
    'page:unlock',
    wrapHandler(async (_event, { pageId }) => {
      unlockPage(db(), user(), pageId);
      return success();
    })
  );

  ipcMain.handle(
    'page:getLockState',
    wrapHandler(async (_event, { pageId }) => {
      return success({
        canLock: canLockPage(db(), user(), pageId),
        canUnlock: canUnlockPage(db(), user(), pageId),
        isLocked: isPageLocked(db(), pageId),
        canEdit: canEditPageContent(db(), user(), pageId)
      });
    })
  );

  ipcMain.handle(
    'page:clonePastedHtml',
    wrapHandler(async (_event, { pageId, html }) => {
      const rewritten = cloneEmbeddedPageAssetHtml(db(), user(), html, pageId);
      return success({ html: rewritten });
    })
  );

  ipcMain.handle('clipboard:read', () =>
    success({
      html: clipboard.readHTML(),
      text: clipboard.readText()
    })
  );

  ipcMain.handle('app:openExternal', wrapHandler(async (_event, { url }) => {
    if (url) {
      await shell.openExternal(url);
    }
    return success();
  }));

  ipcMain.handle('app:openPageAsset', wrapHandler(async (_event, { pageId, fileName }) => {
    const bytes = tryGetAssetBytes(db(), user(), pageId, fileName);
    if (!bytes) {
      throw new Error('첨부 파일을 찾을 수 없습니다.');
    }
    const folder = path.join(getUserDataPaths().pageAssets, String(pageId));
    fs.mkdirSync(folder, { recursive: true });
    const targetPath = path.join(folder, fileName);
    fs.writeFileSync(targetPath, bytes);
    await shell.openPath(targetPath);
    return success();
  }));

  ipcMain.handle(
    'page:save',
    wrapHandler(async (_event, payload) => {
      const page = savePage(db(), user(), payload);
      return success({ page });
    })
  );

  ipcMain.handle(
    'page:rename',
    wrapHandler(async (_event, { pageId, title }) => {
      const page = renamePage(db(), user(), pageId, title);
      return success({ page });
    })
  );

  ipcMain.handle(
    'page:delete',
    wrapHandler(async (_event, { pageId, confirmed }) => {
      deletePage(db(), user(), pageId, confirmed);
      return success();
    })
  );

  ipcMain.handle(
    'page:search',
    wrapHandler(async (_event, { query }) => searchPages(db(), user(), query))
  );

  ipcMain.handle(
    'page:getVersions',
    wrapHandler(async (_event, { pageId }) => {
      const versions = getVersions(db(), user(), pageId, access);
      return success({ versions });
    })
  );

  ipcMain.handle(
    'page:getVersion',
    wrapHandler(async (_event, { versionId }) => {
      const version = getVersion(db(), user(), versionId, access);
      if (!version) {
        return failure('버전을 찾을 수 없습니다.');
      }
      return success({ version });
    })
  );

  ipcMain.handle(
    'page:restoreVersion',
    wrapHandler(async (_event, { versionId }) => {
      const page = restoreVersion(db(), user(), versionId, {
        ...access,
        savePage
      });
      return success({ page });
    })
  );

  ipcMain.handle(
    'comment:list',
    wrapHandler(async (_event, { pageId }) => {
      const comments = getComments(db(), user(), pageId);
      return success({ comments });
    })
  );

  ipcMain.handle(
    'comment:add',
    wrapHandler(async (_event, { pageId, content, quotedText }) => {
      const comment = addComment(db(), user(), pageId, content, quotedText);
      return success({ comment });
    })
  );

  ipcMain.handle(
    'comment:update',
    wrapHandler(async (_event, { commentId, content }) => {
      const comment = updateComment(db(), user(), commentId, content);
      return success({ comment });
    })
  );

  ipcMain.handle(
    'comment:delete',
    wrapHandler(async (_event, { commentId }) => {
      deleteComment(db(), user(), commentId);
      return success();
    })
  );

  ipcMain.handle(
    'asset:pickAndImport',
    wrapHandler(async (_event, { pageId, imageOnly }) => {
      const filters = imageOnly
        ? [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'] }]
        : [{ name: 'All Files', extensions: ['*'] }];
      const filePath = await showOpenDialog(window(), {
        title: imageOnly ? '이미지 선택' : '파일 선택',
        filters
      });
      if (!filePath) {
        return { ok: false, cancelled: true };
      }
      const asset = importFileFromPath(db(), user(), pageId, filePath, { imageOnly });
      return success({ asset });
    })
  );

  ipcMain.handle(
    'asset:importDataUri',
    wrapHandler(async (_event, { pageId, dataUri, fileName }) => {
      const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri || '');
      if (!match) {
        throw new Error('유효하지 않은 파일 데이터입니다.');
      }
      const extension = guessExtensionFromMime(match[1], fileName);
      const content = Buffer.from(match[2], 'base64');
      const asset = importAssetBytes(db(), user(), pageId, content, extension, fileName);
      return success({ asset });
    })
  );

  ipcMain.handle(
    'asset:getBytes',
    wrapHandler(async (_event, { pageId, fileName }) => {
      let bytes =
        tryGetAssetBytes(db(), user(), pageId, fileName) ||
        resolveAssetFromCache(pageId, fileName);
      if (!bytes) {
        return failure('Page asset을 찾을 수 없습니다.');
      }
      return success({ bytes: bytes.toString('base64'), mime: guessMimeFromFileName(fileName) });
    })
  );

  ipcMain.handle(
    'user:list',
    wrapHandler(async () => {
      if (user().role !== 'Admin') {
        throw new Error('관리자 권한이 필요합니다.');
      }
      return success({ users: getAllUsers(db()) });
    })
  );

  ipcMain.handle(
    'user:create',
    wrapHandler(async (_event, payload) => {
      if (user().role !== 'Admin') {
        throw new Error('관리자 권한이 필요합니다.');
      }
      const created = createUser(db(), payload.username, payload.password, payload.role || 'User');
      return success({ user: created });
    })
  );

  ipcMain.handle(
    'user:update',
    wrapHandler(async (_event, payload) => {
      if (user().role !== 'Admin') {
        throw new Error('관리자 권한이 필요합니다.');
      }
      const updated = updateUser(
        db(),
        payload.id,
        payload.username,
        payload.role,
        payload.newPassword
      );
      return success({ user: updated });
    })
  );

  ipcMain.handle(
    'user:delete',
    wrapHandler(async (_event, { id }) => {
      if (user().role !== 'Admin') {
        throw new Error('관리자 권한이 필요합니다.');
      }
      deleteUser(db(), id);
      return success();
    })
  );

  ipcMain.handle(
    'user:updateProfile',
    wrapHandler(async (_event, { username }) => {
      const updated = updateOwnProfile(db(), user().id, username);
      deps.setSessionUser(updated);
      return success({ user: updated });
    })
  );

  ipcMain.handle(
    'user:changePassword',
    wrapHandler(async (_event, { currentPassword, newPassword }) => {
      changePassword(db(), user().id, currentPassword, newPassword);
      return success();
    })
  );

  ipcMain.handle(
    'user:updateNotifications',
    wrapHandler(async (_event, payload) => {
      const updated = updateNotificationSettings(
        db(),
        user().id,
        payload.email,
        payload.notifyOnPageUpdate,
        payload.notifyOnWorkspaceChange
      );
      deps.setSessionUser(updated);
      return success({ user: updated });
    })
  );

  ipcMain.handle(
    'user:getProfile',
    wrapHandler(async () => {
      const profile = getUserById(db(), user().id);
      return success({ user: profile });
    })
  );

  ipcMain.handle(
    'archive:saveProject',
    wrapHandler(async (_event, { workspaceId }) => {
      const filePath = await showSaveDialog(window(), {
        title: '프로젝트 저장',
        defaultPath: 'MyWorkspace.wsp',
        filters: [{ name: 'MyWorkspace Project', extensions: ['wsp'] }]
      });
      if (!filePath) {
        return { ok: false, cancelled: true };
      }

      const document = exportWorkspaceArchive(db(), user(), workspaceId, access);
      saveArchive(filePath.endsWith('.wsp') ? filePath : `${filePath}.wsp`, document);
      addRecentProject(filePath);
      return success({ filePath });
    })
  );

  ipcMain.handle(
    'archive:loadProject',
    wrapHandler(async () => {
      const filePath = await showOpenDialog(window(), {
        title: '프로젝트 열기',
        filters: [{ name: 'MyWorkspace Project', extensions: ['wsp'] }]
      });
      if (!filePath) {
        return { ok: false, cancelled: true };
      }

      const { document, assets } = loadArchive(filePath);
      const result = importWorkspace(db(), user(), document, assets, {
        createWorkspace,
        createPage,
        updatePage: (_db, u, pageId, title, content) => savePage(_db, u, { pageId, title, content })
      });
      addRecentProject(filePath);
      return success({ ...result, filePath });
    })
  );

  ipcMain.handle(
    'archive:newProject',
    wrapHandler(async (_event, { name }) => {
      const trimmed = (name || '').trim();
      if (!trimmed) {
        throw new Error('프로젝트 이름을 입력하세요.');
      }
      const workspace = createWorkspace(db(), user(), { name: trimmed, parentId: null });
      const paths = getUserDataPaths();
      const projectsDir = path.join(paths.root, 'Projects');
      fs.mkdirSync(projectsDir, { recursive: true });
      const filePath = path.join(projectsDir, `${sanitizeFileName(trimmed)}.wsp`);
      const document = exportWorkspaceArchive(db(), user(), workspace.id, access);
      saveArchive(filePath, document);
      addRecentProject(filePath);
      return success({ workspace, filePath });
    })
  );

  ipcMain.handle(
    'archive:openProject',
    wrapHandler(async (_event, { filePath }) => {
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error('프로젝트 파일을 찾을 수 없습니다.');
      }
      const { document, assets } = loadArchive(filePath);
      const result = importWorkspace(db(), user(), document, assets, {
        createWorkspace,
        createPage,
        updatePage: (_db, u, pageId, title, content) => savePage(_db, u, { pageId, title, content })
      });
      addRecentProject(filePath);
      return success({ ...result, filePath });
    })
  );

  ipcMain.handle(
    'export:page',
    wrapHandler(async (_event, { pageId, format = 'markdown' }) => {
      const page = getPage(db(), user(), pageId);
      if (!page) {
        throw new Error('Page를 찾을 수 없습니다.');
      }
      const extension = getExportExtension(format);
      const filePath = await showSaveDialog(window(), {
        title: 'Page 내보내기',
        defaultPath: `${sanitizeExportFileName(page.title)}${extension}`,
        filters: getExportFilter(format)
      });
      if (!filePath) {
        return { ok: false, cancelled: true };
      }
      const normalizedPath = filePath.endsWith(extension) ? filePath : `${filePath}${extension}`;
      await exportPage(db(), user(), pageId, normalizedPath, format, { getPage });
      return success({ filePath: normalizedPath });
    })
  );

  ipcMain.handle(
    'export:pageMarkdown',
    wrapHandler(async (_event, { pageId }) => {
      const page = getPage(db(), user(), pageId);
      if (!page) {
        throw new Error('Page를 찾을 수 없습니다.');
      }
      const filePath = await showSaveDialog(window(), {
        title: 'Page Markdown 내보내기',
        defaultPath: `${sanitizeExportFileName(page.title)}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      });
      if (!filePath) {
        return { ok: false, cancelled: true };
      }
      exportPageMarkdown(db(), user(), pageId, filePath, { getPage });
      return success({ filePath });
    })
  );

  ipcMain.handle(
    'export:workspace',
    wrapHandler(async (_event, { workspaceId, format = 'markdown' }) => {
      const workspace = db().prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId);
      if (!workspace) {
        throw new Error('Workspace를 찾을 수 없습니다.');
      }

      if (format === 'markdown') {
        const targetDir = await showOpenDirectoryDialog(window(), {
          title: 'Workspace Markdown 내보내기 폴더 선택'
        });
        if (!targetDir) {
          return { ok: false, cancelled: true };
        }
        const folder = path.join(targetDir, sanitizeExportFileName(workspace.name));
        exportWorkspaceMarkdown(db(), user(), workspaceId, folder, access);
        return success({ folder });
      }

      const extension = getExportExtension(format);
      const filePath = await showSaveDialog(window(), {
        title: 'Workspace 내보내기',
        defaultPath: `${sanitizeExportFileName(workspace.name)}${extension}`,
        filters: getExportFilter(format)
      });
      if (!filePath) {
        return { ok: false, cancelled: true };
      }
      const normalizedPath = filePath.endsWith(extension) ? filePath : `${filePath}${extension}`;
      await exportWorkspaceDocument(db(), user(), workspaceId, normalizedPath, format, access);
      return success({ filePath: normalizedPath });
    })
  );

  ipcMain.handle(
    'export:workspaceMarkdown',
    wrapHandler(async (_event, { workspaceId }) => {
      const workspace = db().prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId);
      if (!workspace) {
        throw new Error('Workspace를 찾을 수 없습니다.');
      }
      const targetDir = await showOpenDirectoryDialog(window(), {
        title: 'Workspace Markdown 내보내기 폴더 선택'
      });
      if (!targetDir) {
        return { ok: false, cancelled: true };
      }
      const folder = path.join(targetDir, sanitizeExportFileName(workspace.name));
      exportWorkspaceMarkdown(db(), user(), workspaceId, folder, access);
      return success({ folder });
    })
  );

  ipcMain.handle('app:getRecentProjects', () => readRecentProjects());
}

function requireUser(deps) {
  const current = deps.getSessionUser();
  if (!current) {
    throw new Error('로그인이 필요합니다.');
  }
  return current;
}

function sanitizeFileName(name) {
  return String(name).replace(/[<>:"/\\|?*]/g, '_').trim() || 'untitled';
}

function readRecentProjects() {
  const paths = getUserDataPaths();
  const filePath = path.join(paths.root, 'recent-projects.json');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
}

function addRecentProject(filePath) {
  const paths = getUserDataPaths();
  const storePath = path.join(paths.root, 'recent-projects.json');
  const normalized = path.resolve(filePath);
  const list = readRecentProjects().filter((item) => path.resolve(item) !== normalized);
  list.unshift(normalized);
  fs.mkdirSync(paths.root, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(list.slice(0, 10), null, 2), 'utf8');
}

function guessExtensionFromMime(mime, fileName) {
  const fromName = path.extname(fileName || '');
  if (fromName) {
    return fromName;
  }
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/markdown': '.md'
  };
  return map[String(mime || '').toLowerCase()] || '.bin';
}

function guessMimeFromFileName(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf'
  };
  return map[ext] || 'application/octet-stream';
}

module.exports = {
  registerIpcHandlers
};
