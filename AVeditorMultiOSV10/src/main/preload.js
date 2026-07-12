'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, minimal API to the renderer via window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  // ── File system ──────────────────────────────────────────────────────
  getDrives: () => ipcRenderer.invoke('get-drives'),
  listDrives: () => ipcRenderer.invoke('get-drives'),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  pathAncestors: (targetPath) => ipcRenderer.invoke('path-ancestors', targetPath),
  getPathSep: () => ipcRenderer.invoke('get-path-sep'),
  getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath),
  getMediaInfo: (filePath) => ipcRenderer.invoke('get-media-info', filePath),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  getSpecialFolders: () => ipcRenderer.invoke('get-special-folders'),

  // ── Dialogs ──────────────────────────────────────────────────────────
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  saveProjectDialog: () => ipcRenderer.invoke('save-project-dialog'),
  openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),
  exportDialog: () => ipcRenderer.invoke('export-dialog'),
  showMessageBox: (opts) => ipcRenderer.invoke('show-message-box', opts),

  // ── Project file I/O ─────────────────────────────────────────────────
  saveProjectFile: (filePath, data) => ipcRenderer.invoke('save-project-file', filePath, data),
  loadProjectFile: (filePath) => ipcRenderer.invoke('load-project-file', filePath),

  // ── FFmpeg export ────────────────────────────────────────────────────
  exportMedia: (opts) => ipcRenderer.invoke('export-media', opts),
  cancelExport: () => ipcRenderer.invoke('cancel-export'),

  // ── Menu action events (main → renderer) ─────────────────────────────
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (_event, action) => callback(action));
  },
  removeMenuActionListener: () => {
    ipcRenderer.removeAllListeners('menu-action');
  },

  // ── Export progress (main → renderer) ───────────────────────────────
  onExportProgress: (callback) => {
    ipcRenderer.on('export-progress', (_event, progress) => callback(progress));
  },

  // ── Platform / shell ─────────────────────────────────────────────────
  platform: process.platform,
  showItemInFolder: (targetPath) => ipcRenderer.invoke('show-item-in-folder', targetPath),
  setMenuLocale: (locale) => ipcRenderer.invoke('set-menu-locale', locale),
});
