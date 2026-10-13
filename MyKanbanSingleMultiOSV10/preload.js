const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('IS_ELECTRON', true);

contextBridge.exposeInMainWorld('electron', {
  getOpenFile: () => ipcRenderer.invoke('get-open-file'),
  saveKprj: (defaultName, jsonContent) => ipcRenderer.invoke('save-kprj-dialog', defaultName, jsonContent),
  saveReportFile: (defaultName, base64Content, mime) => ipcRenderer.invoke('save-report-dialog', defaultName, base64Content, mime),
  openKprjDialog: (startDir) => ipcRenderer.invoke('open-kprj-dialog', startDir),
  openSqliteDialog: () => ipcRenderer.invoke('open-sqlite-dialog'),
  openAttachment: (filename) => ipcRenderer.invoke('open-attachment', filename),
  onOpenKprj: (callback) => { ipcRenderer.on('open-kprj', (event, filePath) => callback(filePath)); },
  showContextMenu: (items) => ipcRenderer.invoke('show-context-menu', items),
  getElectronInfo: () => ipcRenderer.invoke('get-electron-info'),
  getSampleDir: () => ipcRenderer.invoke('get-sample-dir'),
  onSaveShortcut: (callback) => { ipcRenderer.on('save-shortcut', () => callback()); },
  onUndoShortcut: (callback) => { ipcRenderer.on('undo-shortcut', () => callback()); },
  onRedoShortcut: (callback) => { ipcRenderer.on('redo-shortcut', () => callback()); },
});
