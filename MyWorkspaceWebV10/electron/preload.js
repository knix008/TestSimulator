const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('myworkspace', {
  login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSession: () => ipcRenderer.invoke('auth:session'),
  getUiConfig: () => ipcRenderer.invoke('app:uiConfig'),
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getPathForFile: (file) => {
    if (!file) {
      return '';
    }
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return typeof file.path === 'string' ? file.path : '';
    }
  },
  saveUiConfig: (partial) => ipcRenderer.invoke('app:saveUiConfig', partial),
  getDatabaseConfig: () => ipcRenderer.invoke('app:getDatabaseConfig'),
  testDatabaseConfig: (config) => ipcRenderer.invoke('app:testDatabaseConfig', config),
  saveDatabaseConfig: (config) => ipcRenderer.invoke('app:saveDatabaseConfig', config),
  disconnectDatabase: () => ipcRenderer.invoke('app:disconnectDatabase'),
  browseSqliteFile: () => ipcRenderer.invoke('db:browseSqlite'),
  getWorkspaceTree: () => ipcRenderer.invoke('workspace:getTree'),
  createWorkspace: (payload) => ipcRenderer.invoke('workspace:create', payload),
  renameWorkspace: (workspaceId, name) => ipcRenderer.invoke('workspace:rename', { workspaceId, name }),
  deleteWorkspace: (workspaceId, confirmed) =>
    ipcRenderer.invoke('workspace:delete', { workspaceId, confirmed }),
  setWorkspaceFavorite: (workspaceId, isFavorite) =>
    ipcRenderer.invoke('workspace:setFavorite', { workspaceId, isFavorite }),
  getWorkspaceFavorite: (workspaceId) =>
    ipcRenderer.invoke('workspace:getFavorite', { workspaceId }),
  lockWorkspace: (workspaceId) => ipcRenderer.invoke('workspace:lock', { workspaceId }),
  unlockWorkspace: (workspaceId) => ipcRenderer.invoke('workspace:unlock', { workspaceId }),
  getWorkspaceLockState: (workspaceId) =>
    ipcRenderer.invoke('workspace:getLockState', { workspaceId }),
  createPage: (payload) => ipcRenderer.invoke('page:create', payload),
  importMarkdownFiles: (workspaceId, paths) =>
    ipcRenderer.invoke('page:importMarkdownFiles', { workspaceId, paths }),
  importMarkdownTexts: (workspaceId, items) =>
    ipcRenderer.invoke('page:importMarkdownTexts', { workspaceId, items }),
  listPageTemplates: (language) => ipcRenderer.invoke('page:listTemplates', { language }),
  buildPageFromTemplate: (templateId, title, language) =>
    ipcRenderer.invoke('page:buildFromTemplate', { templateId, title, language }),
  lockPage: (pageId) => ipcRenderer.invoke('page:lock', { pageId }),
  unlockPage: (pageId) => ipcRenderer.invoke('page:unlock', { pageId }),
  getPageLockState: (pageId) => ipcRenderer.invoke('page:getLockState', { pageId }),
  clonePastedHtml: (pageId, html) => ipcRenderer.invoke('page:clonePastedHtml', { pageId, html }),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', { url }),
  openPageAsset: (pageId, fileName) => ipcRenderer.invoke('app:openPageAsset', { pageId, fileName }),
  renamePage: (pageId, title) => ipcRenderer.invoke('page:rename', { pageId, title }),
  deletePage: (pageId, confirmed) => ipcRenderer.invoke('page:delete', { pageId, confirmed }),
  getPage: (pageId) => ipcRenderer.invoke('page:get', { pageId }),
  savePage: (payload) => ipcRenderer.invoke('page:save', payload),
  searchPages: (query) => ipcRenderer.invoke('page:search', { query }),
  getPageVersions: (pageId) => ipcRenderer.invoke('page:getVersions', { pageId }),
  getPageVersion: (versionId) => ipcRenderer.invoke('page:getVersion', { versionId }),
  restorePageVersion: (versionId) => ipcRenderer.invoke('page:restoreVersion', { versionId }),
  getComments: (pageId) => ipcRenderer.invoke('comment:list', { pageId }),
  addComment: (pageId, content, quotedText) =>
    ipcRenderer.invoke('comment:add', { pageId, content, quotedText }),
  updateComment: (commentId, content) => ipcRenderer.invoke('comment:update', { commentId, content }),
  deleteComment: (commentId) => ipcRenderer.invoke('comment:delete', { commentId }),
  pickAndImportAsset: (pageId, imageOnly) =>
    ipcRenderer.invoke('asset:pickAndImport', { pageId, imageOnly }),
  importAssetDataUri: (pageId, dataUri, fileName) =>
    ipcRenderer.invoke('asset:importDataUri', { pageId, dataUri, fileName }),
  getAssetBytes: (pageId, fileName) =>
    ipcRenderer.invoke('asset:getBytes', { pageId, fileName }),
  getUsers: () => ipcRenderer.invoke('user:list'),
  createUser: (payload) => ipcRenderer.invoke('user:create', payload),
  updateUser: (payload) => ipcRenderer.invoke('user:update', payload),
  deleteUser: (id) => ipcRenderer.invoke('user:delete', { id }),
  getProfile: () => ipcRenderer.invoke('user:getProfile'),
  updateProfile: (username) => ipcRenderer.invoke('user:updateProfile', { username }),
  changePassword: (currentPassword, newPassword) =>
    ipcRenderer.invoke('user:changePassword', { currentPassword, newPassword }),
  updateNotificationSettings: (payload) => ipcRenderer.invoke('user:updateNotifications', payload),
  saveProject: (workspaceId) => ipcRenderer.invoke('archive:saveProject', { workspaceId }),
  loadProject: () => ipcRenderer.invoke('archive:loadProject'),
  newProject: (name) => ipcRenderer.invoke('archive:newProject', { name }),
  exportPage: (pageId, format) => ipcRenderer.invoke('export:page', { pageId, format }),
  exportPageMarkdown: (pageId) => ipcRenderer.invoke('export:pageMarkdown', { pageId }),
  exportWorkspace: (workspaceId, format) =>
    ipcRenderer.invoke('export:workspace', { workspaceId, format }),
  exportWorkspaceMarkdown: (workspaceId) =>
    ipcRenderer.invoke('export:workspaceMarkdown', { workspaceId }),
  openProject: (filePath) => ipcRenderer.invoke('archive:openProject', { filePath }),
  getWorkspaceMembers: (workspaceId) =>
    ipcRenderer.invoke('workspace:getMembers', { workspaceId }),
  addWorkspaceMember: (workspaceId, userId, role) =>
    ipcRenderer.invoke('workspace:addMember', { workspaceId, userId, role }),
  removeWorkspaceMember: (workspaceId, userId) =>
    ipcRenderer.invoke('workspace:removeMember', { workspaceId, userId }),
  updateWorkspaceMemberRole: (workspaceId, userId, role) =>
    ipcRenderer.invoke('workspace:updateMemberRole', { workspaceId, userId, role }),
  getEmailConfig: () => ipcRenderer.invoke('app:getEmailConfig'),
  saveEmailConfig: (partial) => ipcRenderer.invoke('app:saveEmailConfig', partial),
  testEmailConfig: (config) => ipcRenderer.invoke('app:testEmailConfig', config),
  getRecentProjects: () => ipcRenderer.invoke('app:getRecentProjects'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  reportRendererError: (payload) => ipcRenderer.send('renderer:error', payload),
  onWindowMaximizedChanged: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on('window:maximized-changed', listener);
    return () => ipcRenderer.removeListener('window:maximized-changed', listener);
  }
});
