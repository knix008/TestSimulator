const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getInfo: () => ipcRenderer.invoke('app:getInfo'),
  home: () => ipcRenderer.invoke('fs:home'),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  scanMarkdown: (payload) => ipcRenderer.invoke('fs:scanMarkdown', payload),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readFiles: (paths) => ipcRenderer.invoke('fs:readFiles', paths),
  embedImage: (payload) => ipcRenderer.invoke('fs:embedImage', payload),
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  openTextFile: (payload) => ipcRenderer.invoke('dialog:openTextFile', payload),
  saveText: (payload) => ipcRenderer.invoke('dialog:saveText', payload),
  saveBinary: (payload) => ipcRenderer.invoke('dialog:saveBinary', payload),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  paginate: (html) => ipcRenderer.invoke('export:paginate', html),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  openAbout: () => ipcRenderer.invoke('about:open'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),
  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
  popupMenu: (template) => ipcRenderer.invoke('menu:popup', template),
  onOpenFile: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on('file:open', h);
    return () => ipcRenderer.removeListener('file:open', h);
  },
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
