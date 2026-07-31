const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('IS_ELECTRON', true);

contextBridge.exposeInMainWorld('electron', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  setWindowOpacity: (value) => ipcRenderer.invoke('set-window-opacity', value),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  saveIcs: (defaultName, content) => ipcRenderer.invoke('save-ics-dialog', defaultName, content),
  onNewEventShortcut: (cb) => ipcRenderer.on('new-event-shortcut', () => cb()),
  windowControls: {
    minimize: () => ipcRenderer.invoke('win-minimize'),
    maximizeToggle: () => ipcRenderer.invoke('win-maximize-toggle'),
    close: () => ipcRenderer.invoke('win-close'),
    isMaximized: () => ipcRenderer.invoke('win-is-maximized'),
  },
});
