const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  onOpenProjectFile: (callback) => {
    const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on('open-project-file', handler);
    return () => ipcRenderer.removeListener('open-project-file', handler);
  },
  saveProjectFile: (content, defaultPath) => ipcRenderer.invoke('project:save', { content, defaultPath }),
  openProjectFile: () => ipcRenderer.invoke('project:open'),
  readProjectFile: (filePath) => ipcRenderer.invoke('project:read', { filePath }),
  openExcelFile: () => ipcRenderer.invoke('excel:open'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  quitApp: () => ipcRenderer.invoke('window:quit'),
  setMinimumSize: (width, height) => ipcRenderer.invoke('window:set-minimum-size', { width, height }),
  applyDefaultWindowSize: (width) => ipcRenderer.invoke('window:apply-default-size', { width }),
  syncHeaderLayout: (payload) => ipcRenderer.invoke('window:sync-header-layout', payload),
  getPreferences: () => ipcRenderer.invoke('preferences:get'),
  ensurePreferences: (localFallback) => ipcRenderer.invoke('preferences:ensure', localFallback),
  savePreferences: (partial) => ipcRenderer.invoke('preferences:save', partial),
});
