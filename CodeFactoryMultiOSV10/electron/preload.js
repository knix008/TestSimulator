const { contextBridge, ipcRenderer } = require('electron');

// The only surface the renderer sees. Everything here maps 1:1 onto an
// ipcMain.handle in electron/main.js; the web build supplies the same shape
// from src/platform/webAdapter.js.
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  getInfo: () => ipcRenderer.invoke('app:getInfo'),

  pickDirectory: (defaultPath) => ipcRenderer.invoke('dialog:pickDirectory', defaultPath),
  scanDirectories: (payload) => ipcRenderer.invoke('fs:scanDirectories', payload),
  listSourceFiles: (payload) => ipcRenderer.invoke('fs:listSourceFiles', payload),
  readFiles: (paths) => ipcRenderer.invoke('fs:readFiles', paths),
  readText: (path) => ipcRenderer.invoke('fs:readText', path),
  exists: (path) => ipcRenderer.invoke('fs:exists', path),
  gitChurn: (payload) => ipcRenderer.invoke('fs:gitChurn', payload),

  openFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
  saveText: (payload) => ipcRenderer.invoke('dialog:saveText', payload),
  saveBinary: (payload) => ipcRenderer.invoke('dialog:saveBinary', payload),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),

  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),

  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    close: () => ipcRenderer.invoke('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    onMaximizedChange: (callback) => {
      const handler = (_event, isMaximized) => callback(isMaximized);
      ipcRenderer.on('win:maximized', handler);
      return () => ipcRenderer.removeListener('win:maximized', handler);
    },
  },

  // Dialogs are separate OS windows; these are the two sides of that channel.
  dialogs: {
    open: (name, payload) => ipcRenderer.invoke('dialog:openWindow', { name, payload }),
    getPayload: () => ipcRenderer.invoke('dialog:getPayload'),
    submit: (name, data) => ipcRenderer.invoke('dialog:submit', { name, data }),
    close: (name) => ipcRenderer.invoke('dialog:closeWindow', name),
    closeSelf: () => ipcRenderer.invoke('dialog:closeSelf'),
    broadcastAppearance: (appearance) => ipcRenderer.invoke('dialog:broadcastAppearance', appearance),
    onResult: (callback) => {
      const handler = (_event, message) => callback(message);
      ipcRenderer.on('dialog:result', handler);
      return () => ipcRenderer.removeListener('dialog:result', handler);
    },
    onPayload: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('dialog:payload', handler);
      return () => ipcRenderer.removeListener('dialog:payload', handler);
    },
    onAppearance: (callback) => {
      const handler = (_event, appearance) => callback(appearance);
      ipcRenderer.on('dialog:appearance', handler);
      return () => ipcRenderer.removeListener('dialog:appearance', handler);
    },
  },

  showItem: (path) => ipcRenderer.invoke('shell:showItem', path),
  openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
