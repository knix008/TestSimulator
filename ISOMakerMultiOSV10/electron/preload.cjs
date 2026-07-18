'use strict'

const { contextBridge, ipcRenderer, webUtils } = require('electron')

const api = {
  getEngineInfo: () => ipcRenderer.invoke('engine:info'),
  openFile: (filters, hintPath, title) =>
    ipcRenderer.invoke('dialog:openFile', filters, hintPath, title),
  openFiles: (filters, hintPath, title) =>
    ipcRenderer.invoke('dialog:openFiles', filters, hintPath, title),
  openDirectory: (hintPath, title) =>
    ipcRenderer.invoke('dialog:openDirectory', hintPath, title),
  saveFile: (defaultPath, hintPath, title) =>
    ipcRenderer.invoke('dialog:saveFile', defaultPath, hintPath, title),
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
  extractIso: (options) => ipcRenderer.invoke('iso:extract', options),
  createIso: (options) => ipcRenderer.invoke('iso:create', options),
  createBootableIso: (options) => ipcRenderer.invoke('iso:createBootable', options),
  mountIso: (isoPath) => ipcRenderer.invoke('iso:mount', isoPath),
  unmountIso: (target) => ipcRenderer.invoke('iso:unmount', target),
  listIsoTree: (isoPath) => ipcRenderer.invoke('iso:listTree', isoPath),

  openEditSession: (isoPath) => ipcRenderer.invoke('session:open', isoPath),
  getEditSession: () => ipcRenderer.invoke('session:get'),
  closeEditSession: () => ipcRenderer.invoke('session:close'),
  addPathsToSession: (destDir, filePaths) =>
    ipcRenderer.invoke('session:addPaths', destDir, filePaths),
  removeFromSession: (entryPath) => ipcRenderer.invoke('session:remove', entryPath),
  removeManyFromSession: (entryPaths) => ipcRenderer.invoke('session:removeMany', entryPaths),
  mkdirInSession: (dirPath, name) => ipcRenderer.invoke('session:mkdir', dirPath, name),
  renameInSession: (entryPath, newName) =>
    ipcRenderer.invoke('session:rename', entryPath, newName),
  exportFileFromSession: (entryPath, outputPath) =>
    ipcRenderer.invoke('session:exportFile', entryPath, outputPath),
  exportFilesToDirectory: (entryPaths, outputDir) =>
    ipcRenderer.invoke('session:exportFilesToDir', entryPaths, outputDir),
  prepareDragOut: (entryPath) => ipcRenderer.invoke('session:prepareDragOut', entryPath),
  prepareDragOutMany: (entryPaths) =>
    ipcRenderer.invoke('session:prepareDragOutMany', entryPaths),
  saveEditSession: (outputPath) => ipcRenderer.invoke('session:save', outputPath),
  isEditDirty: () => ipcRenderer.invoke('session:isDirty'),
  startDrag: (filePathOrPaths) => ipcRenderer.send('ondragstart', filePathOrPaths),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return file?.path || ''
    }
  },

  setLocale: (locale) => ipcRenderer.invoke('prefs:setLocale', locale),
  onProgress: (handler) => {
    const listener = (_event, progress) => {
      handler(progress)
    }
    ipcRenderer.on('job:progress', listener)
    return () => {
      ipcRenderer.removeListener('job:progress', listener)
    }
  },
  onNavigate: (handler) => {
    const listener = (_event, tab) => {
      handler(tab)
    }
    ipcRenderer.on('menu:navigate', listener)
    return () => {
      ipcRenderer.removeListener('menu:navigate', listener)
    }
  },
  onPrefs: (handler) => {
    const listener = (_event, prefs) => {
      handler(prefs)
    }
    ipcRenderer.on('menu:prefs', listener)
    return () => {
      ipcRenderer.removeListener('menu:prefs', listener)
    }
  },
  onSessionUpdated: (handler) => {
    const listener = (_event, snap) => {
      handler(snap)
    }
    ipcRenderer.on('session:updated', listener)
    return () => {
      ipcRenderer.removeListener('session:updated', listener)
    }
  },
  onCloseRequest: (handler) => {
    const listener = () => {
      handler()
    }
    ipcRenderer.on('app:close-request', listener)
    return () => {
      ipcRenderer.removeListener('app:close-request', listener)
    }
  },
  ackCloseRequest: () => ipcRenderer.invoke('app:close-ack'),
  decideClose: (decision) => ipcRenderer.invoke('app:close-decision', decision),
}

contextBridge.exposeInMainWorld('isoMaker', api)
