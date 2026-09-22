const { contextBridge, ipcRenderer } = require('electron');

// The only bridge between the renderer and Node. Everything is an explicit,
// narrow call — the renderer never sees `require`, `fs` or `ipcRenderer`.
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  getInfo: () => ipcRenderer.invoke('app:getInfo'),
  takePendingOpen: () => ipcRenderer.invoke('app:takePendingOpen'),
  onOpenPath: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on('app:openPath', h);
    return () => ipcRenderer.removeListener('app:openPath', h);
  },

  home: () => ipcRenderer.invoke('fs:home'),
  exists: (p) => ipcRenderer.invoke('fs:exists', p),
  stat: (p) => ipcRenderer.invoke('fs:stat', p),
  readDir: (p) => ipcRenderer.invoke('fs:readDir', p),
  readBinary: (payload) => ipcRenderer.invoke('fs:readBinary', payload),
  readText: (p) => ipcRenderer.invoke('fs:readText', p),
  writeText: (payload) => ipcRenderer.invoke('fs:writeText', payload),

  openPdfDialog: (payload) => ipcRenderer.invoke('dialog:openPdf', payload),
  pickDirectory: (payload) => ipcRenderer.invoke('dialog:pickDirectory', payload),
  saveText: (payload) => ipcRenderer.invoke('dialog:saveText', payload),
  saveBinary: (payload) => ipcRenderer.invoke('dialog:saveBinary', payload),
  pickSavePath: (payload) => ipcRenderer.invoke('dialog:pickSavePath', payload),
  writeBinary: (payload) => ipcRenderer.invoke('fs:writeBinary', payload),

  download: (payload) => ipcRenderer.invoke('net:download', payload),

  printPages: (payload) => ipcRenderer.invoke('print:pages', payload),

  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  writeClipboardImage: (dataUrl) => ipcRenderer.invoke('clipboard:writeImage', dataUrl),

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),

  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),

  // Progress ticks for long-running reads / writes / downloads.
  onProgress: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on('task:progress', h);
    return () => ipcRenderer.removeListener('task:progress', h);
  },

  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    close: () => ipcRenderer.invoke('win:close'),
    forceClose: () => ipcRenderer.invoke('win:forceClose'),
    onCloseRequest: (cb) => {
      const h = () => cb();
      ipcRenderer.on('win:close-request', h);
      return () => ipcRenderer.removeListener('win:close-request', h);
    },
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    setTitle: (t) => ipcRenderer.invoke('win:setTitle', t),
    setMinWidth: (w) => ipcRenderer.invoke('win:setMinWidth', w),
    getSize: () => ipcRenderer.invoke('win:getSize'),
    setSize: (payload) => ipcRenderer.invoke('win:setSize', payload),
    onMaximizeChange: (cb) => {
      const h = (_e, v) => cb(v);
      ipcRenderer.on('win:maximized', h);
      return () => ipcRenderer.removeListener('win:maximized', h);
    },
    getContentBounds: () => ipcRenderer.invoke('win:getContentBounds'),
    openThemePopup: (payload) => ipcRenderer.invoke('win:openThemePopup', payload),
    setPopupSize: (payload) => ipcRenderer.invoke('win:setPopupSize', payload),
    pickTheme: (id) => ipcRenderer.invoke('win:pickTheme', id),
    onThemePicked: (cb) => {
      const h = (_e, id) => cb(id);
      ipcRenderer.on('theme:picked', h);
      return () => ipcRenderer.removeListener('theme:picked', h);
    },
  },
});
