const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronFileApi', {
  openFiles: (options) => ipcRenderer.invoke('files:open', options),
  saveFile: (options) => ipcRenderer.invoke('files:save', options),
  writeFile: (options) => ipcRenderer.invoke('files:write', options),
})

contextBridge.exposeInMainWorld('electronWindowApi', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  forceClose: () => ipcRenderer.invoke('window:force-close'),
  onCloseRequest: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('window:close-request', listener)
    return () => ipcRenderer.removeListener('window:close-request', listener)
  },
})

// Menu dropdowns live in their own always-on-top window so a long menu can
// overhang the app instead of being clipped by it.
contextBridge.exposeInMainWorld('electronMenuApi', {
  open: (payload, anchor) => ipcRenderer.invoke('menu:open', payload, anchor),
  close: () => ipcRenderer.invoke('menu:close'),
  // Called from inside the popup:
  payload: () => ipcRenderer.invoke('menu:payload'),
  reportSize: (size) => ipcRenderer.invoke('menu:size', size),
  choose: (commandId) => ipcRenderer.invoke('menu:choose', commandId),
  // Called from the main window:
  onChosen: (callback) => {
    const listener = (_event, commandId) => callback(commandId)
    ipcRenderer.on('menu:chosen', listener)
    return () => ipcRenderer.removeListener('menu:chosen', listener)
  },
})

// Every dialog is its own movable window, owned by the main window.
contextBridge.exposeInMainWorld('electronDialogApi', {
  open: (name, payload) => ipcRenderer.invoke('dialog:open', name, payload),
  close: (name) => ipcRenderer.invoke('dialog:close', name),
  closeAll: () => ipcRenderer.invoke('dialog:close-all'),
  // Called from inside a dialog window:
  payload: () => ipcRenderer.invoke('dialog:payload'),
  send: (name, result) => ipcRenderer.invoke('dialog:result', name, result),
  onPayload: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('dialog:payload', listener)
    return () => ipcRenderer.removeListener('dialog:payload', listener)
  },
  // Called from the main window:
  onResult: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('dialog:result', listener)
    return () => ipcRenderer.removeListener('dialog:result', listener)
  },
  onClosed: (callback) => {
    const listener = (_event, name) => callback(name)
    ipcRenderer.on('dialog:closed', listener)
    return () => ipcRenderer.removeListener('dialog:closed', listener)
  },
})
