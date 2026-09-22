const { contextBridge, ipcRenderer, webUtils } = require('electron')

function subscribe(channel, callback) {
  const listener = (_event, ...args) => callback(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('electronFileApi', {
  openFiles: (options) => ipcRenderer.invoke('files:open', options),
  readFile: (options) => ipcRenderer.invoke('files:read', options),
  exists: (filePath) => ipcRenderer.invoke('files:exists', filePath),
  saveFile: (options) => ipcRenderer.invoke('files:save', options),
  writeFile: (options) => ipcRenderer.invoke('files:write', options),
  chooseDirectory: (options) => ipcRenderer.invoke('files:choose-directory', options),
  showInFolder: (filePath) => ipcRenderer.invoke('files:show-in-folder', filePath),
  openExternal: (url) => ipcRenderer.invoke('files:open-external', url),
  openPath: (target) => ipcRenderer.invoke('files:open-path', target),
  // Files the OS asked us to open: a double-clicked .mdcv, "Open with", a second instance.
  onOpenPaths: (callback) => subscribe('files:open-paths', callback),
  // The path behind a File dropped onto the window, so it can be saved back and remembered.
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
})

contextBridge.exposeInMainWorld('electronUrlApi', {
  fetch: (id, url) => ipcRenderer.invoke('url:fetch', id, url),
  cancel: (id) => ipcRenderer.invoke('url:cancel', id),
  onProgress: (callback) => subscribe('url:progress', callback),
})

contextBridge.exposeInMainWorld('electronFontApi', {
  list: () => ipcRenderer.invoke('fonts:list'),
})

contextBridge.exposeInMainWorld('electronPrintApi', {
  printers: () => ipcRenderer.invoke('print:printers'),
  print: (options) => ipcRenderer.invoke('print:job', options),
  pdf: (options) => ipcRenderer.invoke('print:pdf', options),
})

contextBridge.exposeInMainWorld('electronWindowApi', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  close: () => ipcRenderer.invoke('window:close'),
  forceClose: () => ipcRenderer.invoke('window:force-close'),
  setMinimumWidth: (width) => ipcRenderer.invoke('window:min-width', width),
  setTitle: (title) => ipcRenderer.invoke('window:set-title', title),
  ready: () => ipcRenderer.invoke('window:ready'),
  onCloseRequest: (callback) => subscribe('window:close-request', callback),
})

contextBridge.exposeInMainWorld('electronAppApi', {
  versions: () => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
  }),
  paths: () => ipcRenderer.invoke('app:paths'),
})

// Menu dropdowns live in their own always-on-top window so a long menu can
// overhang the app instead of being clipped by it.
contextBridge.exposeInMainWorld('electronMenuApi', {
  open: (payload, anchor) => ipcRenderer.invoke('menu:open', payload, anchor),
  close: () => ipcRenderer.invoke('menu:close'),
  payload: () => ipcRenderer.invoke('menu:payload'),
  reportSize: (size) => ipcRenderer.invoke('menu:size', size),
  choose: (commandId) => ipcRenderer.invoke('menu:choose', commandId),
  onPayload: (callback) => subscribe('menu:payload', callback),
  onChosen: (callback) => subscribe('menu:chosen', callback),
})

// Every dialog is its own movable window, owned by the main window.
contextBridge.exposeInMainWorld('electronDialogApi', {
  open: (name, payload) => ipcRenderer.invoke('dialog:open', name, payload),
  close: (name) => ipcRenderer.invoke('dialog:close', name),
  closeAll: () => ipcRenderer.invoke('dialog:close-all'),
  payload: () => ipcRenderer.invoke('dialog:payload'),
  send: (name, result) => ipcRenderer.invoke('dialog:result', name, result),
  onPayload: (callback) => subscribe('dialog:payload', callback),
  onResult: (callback) => subscribe('dialog:result', callback),
  onClosed: (callback) => subscribe('dialog:closed', callback),
  reportSize: (size) => ipcRenderer.invoke('dialog:size', size),
  reportError: (report) => ipcRenderer.invoke('dialog:error', report),
  onError: (callback) => subscribe('dialog:error', callback),
})
