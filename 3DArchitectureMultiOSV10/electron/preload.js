const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveScreenshot: (dataUrl) => ipcRenderer.invoke('dialog:saveScreenshot', dataUrl),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  aiServerUrl: 'http://127.0.0.1:5001',
});
