const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getInfo: () => ipcRenderer.invoke('app:getInfo'),
  home: () => ipcRenderer.invoke('fs:home'),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  scanMarkdown: (payload) => ipcRenderer.invoke('fs:scanMarkdown', payload),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readFiles: (paths) => ipcRenderer.invoke('fs:readFiles', paths),
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  saveText: (payload) => ipcRenderer.invoke('dialog:saveText', payload),
  saveBinary: (payload) => ipcRenderer.invoke('dialog:saveBinary', payload),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),
  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    close: () => ipcRenderer.invoke('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    onMaximizeChange: (cb) => {
      const h = (_e, v) => cb(v);
      ipcRenderer.on('win:maximized', h);
      return () => ipcRenderer.removeListener('win:maximized', h);
    },
  },
});
