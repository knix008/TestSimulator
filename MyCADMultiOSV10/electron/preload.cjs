const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('mycad', {
  isElectron: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('get-version'),
  listFonts: () => ipcRenderer.invoke('list-fonts'),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  openFile: (opts) => ipcRenderer.invoke('open-file', opts),
  readPath: (filePath) => ipcRenderer.invoke('read-path', filePath),
  supportedExtensions: () => ipcRenderer.invoke('supported-extensions'),
  setMinSize: (width, height) => ipcRenderer.invoke('set-min-size', width, height),
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', { filePath, content }),
  showMenu: (payload) => ipcRenderer.invoke('show-menu', payload),
  openPopup: (payload) => ipcRenderer.invoke('open-popup', payload),
  syncState: (payload) => ipcRenderer.send('sync-state', payload),
  onSyncState: (cb) => {
    const listener = (_event, payload) => cb(payload)
    ipcRenderer.on('sync-state', listener)
    return () => ipcRenderer.removeListener('sync-state', listener)
  },
  print: () => ipcRenderer.invoke('print'),
  download: (url) => ipcRenderer.invoke('download', url),
  onDownloadProgress: (cb) => {
    const listener = (_event, progress) => cb(progress)
    ipcRenderer.on('download-progress', listener)
    return () => ipcRenderer.removeListener('download-progress', listener)
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onRequestClose: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('request-close', listener)
    return () => ipcRenderer.removeListener('request-close', listener)
  },
  confirmClose: (allow) => ipcRenderer.send('confirm-close', allow),
  resizeBy: (dx, dy) => ipcRenderer.send('resize-by', dx, dy),
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file) } catch { return file.name || '' }
  },
  onOpenPath: (cb) => {
    const listener = (_event, filePath) => cb(filePath)
    ipcRenderer.on('open-path', listener)
    return () => ipcRenderer.removeListener('open-path', listener)
  }
})
