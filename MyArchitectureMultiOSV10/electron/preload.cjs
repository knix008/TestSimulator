// The only bridge between the page and the operating system. src/ui/platform.js
// wraps it so the same UI code also runs as a plain web page.
const { contextBridge, ipcRenderer, webUtils } = require('electron')

function subscribe(channel, cb) {
  const listener = (_event, payload) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('myarch', {
  isElectron: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('get-version'),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  openFile: (opts) => ipcRenderer.invoke('open-file', opts || {}),
  readPath: (filePath, opts) => ipcRenderer.invoke('read-path', filePath, opts || {}),
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts || {}),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', { filePath, content }),
  print: () => ipcRenderer.invoke('print'),
  printToPDF: (opts) => ipcRenderer.invoke('print-to-pdf', opts || {}),
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  printSheets: (opts) => ipcRenderer.invoke('print-sheets', opts || {}),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openManual: (lang) => ipcRenderer.invoke('open-manual', lang),
  setZoom: (factor) => ipcRenderer.invoke('set-zoom', factor),
  versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, v8: process.versions.v8 },
  arch: process.arch,
  onOpenPath: (cb) => subscribe('open-path', cb),
  onRequestClose: (cb) => subscribe('request-close', () => cb()),
  confirmClose: (allow) => ipcRenderer.send('confirm-close', !!allow),
  setMinSize: (width, height) => ipcRenderer.invoke('set-min-size', width, height),
  windowSize: () => ipcRenderer.invoke('window-size'),
  resizeWindow: (width, height) => ipcRenderer.send('window-resize', width, height),
  onWindowState: (cb) => subscribe('window-state', cb),
  setTitleBar: (colors) => ipcRenderer.invoke('set-title-bar', colors || {}),
  listSamples: () => ipcRenderer.invoke('list-samples'),
  readSample: (file) => ipcRenderer.invoke('read-sample', file),
  // Path of a File dropped onto the window (drag & drop from the file manager).
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file) } catch { return '' }
  }
})
