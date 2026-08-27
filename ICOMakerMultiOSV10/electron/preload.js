const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getInfo: () => ipcRenderer.invoke('app:getInfo'),
  home: () => ipcRenderer.invoke('fs:home'),
  drives: () => ipcRenderer.invoke('fs:drives'),
  listDir: (dirPath) => ipcRenderer.invoke('fs:listDir', dirPath),
  readImage: (filePath) => ipcRenderer.invoke('fs:readImage', filePath),
  openImages: () => ipcRenderer.invoke('dialog:openImages'),
  saveBinary: (payload) => ipcRenderer.invoke('dialog:saveBinary', payload),
  saveFiles: (files) => ipcRenderer.invoke('dialog:saveFiles', files),
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
