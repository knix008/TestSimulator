const { contextBridge, ipcRenderer } = require('electron');
let webUtils = null;
try {
  webUtils = require('electron').webUtils;
} catch (_) {
  webUtils = null;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Resolve OS path from a dropped File
  getPathForFile: (file) => {
    try {
      if (file && webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file) || '';
      }
    } catch (_) {}
    return (file && file.path) || '';
  },

  // File system
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  listDrives: () => ipcRenderer.invoke('list-drives'),
  pathAncestors: (targetPath) => ipcRenderer.invoke('path-ancestors', targetPath),
  getFileStats: (filePath) => ipcRenderer.invoke('get-file-stats', filePath),
  readImageMeta: (filePath) => ipcRenderer.invoke('read-image-meta', filePath),
  readMediaMeta: (filePath) => ipcRenderer.invoke('read-media-meta', filePath),
  getFileUrl: (filePath) => ipcRenderer.invoke('get-file-url', filePath),
  readFileBase64: (filePath) => ipcRenderer.invoke('read-file-base64', filePath),
  readFileBytes:  (filePath) => ipcRenderer.invoke('read-file-bytes', filePath),
  convertToPng: (filePath) => ipcRenderer.invoke('convert-to-png', filePath),
  rembgRemove: (opts) => ipcRenderer.invoke('rembg-remove', opts),
  onRembgProgress: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('rembg-progress', handler);
    return () => ipcRenderer.removeListener('rembg-progress', handler);
  },
  onOpenProgress: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('open-progress', handler);
    return () => ipcRenderer.removeListener('open-progress', handler);
  },
  decodeDicom:  (filePath) => ipcRenderer.invoke('decode-dicom', filePath),
  saveFile: (data) => ipcRenderer.invoke('save-file', data),
  showSaveDialog: (data) => ipcRenderer.invoke('show-save-dialog', data),
  printImage: (data) => ipcRenderer.invoke('print-image', data),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  writeFile: (data) => ipcRenderer.invoke('write-file', data),

  // Dialogs
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  openSubtitleDialog: (videoPath) => ipcRenderer.invoke('open-subtitle-dialog', videoPath),
  setLastOpenDir: (dirPath) => ipcRenderer.invoke('set-last-open-dir', dirPath),
  getLastOpenDir: () => ipcRenderer.invoke('get-last-open-dir'),
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),

  // System
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  getPathSep: () => ipcRenderer.invoke('get-path-sep'),
  pathJoin: (...parts) => ipcRenderer.invoke('path-join', parts),
  pathDirname: (p) => ipcRenderer.invoke('path-dirname', p),
  pathBasename: (p) => ipcRenderer.invoke('path-basename', p),

  // Menu
  updateMenu: (data) => ipcRenderer.invoke('update-menu', data),

  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowSetMinSize: (width, height) => ipcRenderer.invoke('window-set-min-size', width, height),
  windowGetBounds: () => ipcRenderer.invoke('window-get-bounds'),
  windowApplySize: (opts) => ipcRenderer.invoke('window-apply-size', opts),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  toggleFullscreen: () => ipcRenderer.invoke('window-toggle-fullscreen'),
  onMaximizeChange: (cb) => {
    const handler = (_, maximized) => cb(maximized);
    ipcRenderer.on('maximize-change', handler);
    return () => ipcRenderer.removeListener('maximize-change', handler);
  },

  // Events from main process
  onOpenFile: (cb) => ipcRenderer.on('open-file', (_, p) => cb(p)),
  getLaunchFile: () => ipcRenderer.invoke('get-launch-file'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  onOpenFolder: (cb) => ipcRenderer.on('open-folder', (_, p) => cb(p)),
  onMenuAction: (cb) => ipcRenderer.on('menu-action', (_, action) => cb(action)),

  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  transferIntoDir: (opts) => ipcRenderer.invoke('transfer-into-dir', opts),
  pickDirectory: (opts) => ipcRenderer.invoke('pick-directory', opts),
  startDrag: (filePathOrPaths) => ipcRenderer.send('start-drag', filePathOrPaths),
  setUnsavedChanges: (value) => ipcRenderer.invoke('set-unsaved-changes', value),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  watchDirectory: (dirPath) => ipcRenderer.invoke('watch-directory', dirPath),
  unwatchDirectory: (dirPath) => ipcRenderer.invoke('unwatch-directory', dirPath),
  watchFile: (filePath) => ipcRenderer.invoke('watch-file', filePath),
  unwatchFile: (filePath) => ipcRenderer.invoke('unwatch-file', filePath),
  onDirectoryChanged: (cb) => ipcRenderer.on('directory-changed', (_, p) => cb(p)),
  onFileChanged: (cb) => ipcRenderer.on('file-changed', (_, p) => cb(p)),
  removeListener: (channel, cb) => ipcRenderer.removeListener(channel, cb),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  platform: process.platform,
});
