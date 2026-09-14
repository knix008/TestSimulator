const { contextBridge, ipcRenderer, webUtils } = require('electron');

// The only bridge between the renderer and Node. Every entry is an explicit,
// narrow call — the renderer never sees `require`, `fs` or `ipcRenderer`.
function listen(channel, cb) {
  const h = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
}

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Absolute path of a File dropped onto the window (File.path is gone in
  // newer Electron; webUtils is the supported way).
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return file && file.path ? file.path : null; }
  },

  getInfo: () => ipcRenderer.invoke('app:getInfo'),
  takePendingOpen: () => ipcRenderer.invoke('app:takePendingOpen'),
  takeInstallCheck: () => ipcRenderer.invoke('app:takeInstallCheck'),
  resolveInstallCheck: (wipe) => ipcRenderer.invoke('app:resolveInstallCheck', { wipe }),
  quit: () => ipcRenderer.invoke('app:quit'),
  onOpenPath: (cb) => listen('app:openPath', cb),
  onCloseRequested: (cb) => listen('app:closeRequested', cb),

  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),

  fs: {
    exists: (p) => ipcRenderer.invoke('fs:exists', p),
    stat: (p) => ipcRenderer.invoke('fs:stat', p),
    readBinary: (payload) => ipcRenderer.invoke('fs:readBinary', payload),
    readText: (payload) => ipcRenderer.invoke('fs:readText', payload),
    writeBinary: (payload) => ipcRenderer.invoke('fs:writeBinary', payload),
    writeText: (payload) => ipcRenderer.invoke('fs:writeText', payload),
    copyFile: (payload) => ipcRenderer.invoke('fs:copyFile', payload),
    tempPath: (ext) => ipcRenderer.invoke('fs:tempPath', ext),
    remove: (p) => ipcRenderer.invoke('fs:remove', p),
  },

  dialog: {
    openFile: (payload) => ipcRenderer.invoke('dialog:openFile', payload),
    pickDirectory: (payload) => ipcRenderer.invoke('dialog:pickDirectory', payload),
    pickSavePath: (payload) => ipcRenderer.invoke('dialog:pickSavePath', payload),
  },

  download: (payload) => ipcRenderer.invoke('net:download', payload),
  printImages: (payload) => ipcRenderer.invoke('print:images', payload),

  clipboard: {
    writeText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
    readText: () => ipcRenderer.invoke('clipboard:readText'),
    writeImage: (dataUrl) => ipcRenderer.invoke('clipboard:writeImage', dataUrl),
    readImage: () => ipcRenderer.invoke('clipboard:readImage'),
  },

  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  },

  capture: {
    listSources: (opts) => ipcRenderer.invoke('capture:listSources', opts),
    grabScreen: (sourceId) => ipcRenderer.invoke('capture:grabScreen', sourceId),
    displays: () => ipcRenderer.invoke('capture:displays'),
    cursorDisplay: () => ipcRenderer.invoke('capture:cursorDisplay'),
    hideApp: () => ipcRenderer.invoke('capture:hideApp'),
    showApp: () => ipcRenderer.invoke('capture:showApp'),
    minimizeApp: () => ipcRenderer.invoke('capture:minimizeApp'),
    restoreApp: () => ipcRenderer.invoke('capture:restoreApp'),
  },

  rec: {
    open: (filePath) => ipcRenderer.invoke('rec:open', { filePath }),
    append: (id, data) => ipcRenderer.invoke('rec:append', { id, data }),
    close: (id) => ipcRenderer.invoke('rec:close', { id }),
    discard: (id) => ipcRenderer.invoke('rec:discard', { id }),
  },

  // Dialog windows (see electron/dialogs.js).
  dialogs: {
    open: (name, payload) => ipcRenderer.invoke('dialog:openWindow', { name, payload }),
    getPayload: () => ipcRenderer.invoke('dialog:getPayload'),
    update: (name, payload) => ipcRenderer.invoke('dialog:update', { name, payload }),
    submit: (name, data, keepOpen) => ipcRenderer.invoke('dialog:submit', { name, data, keepOpen }),
    close: (name) => ipcRenderer.invoke('dialog:closeWindow', name),
    closeSelf: () => ipcRenderer.invoke('dialog:closeSelf'),
    ready: () => ipcRenderer.invoke('dialog:ready'),
    isOpen: (name) => ipcRenderer.invoke('dialog:isOpen', name),
    broadcastAppearance: (appearance) => ipcRenderer.invoke('dialog:broadcastAppearance', appearance),
    setSize: (width, height) => ipcRenderer.invoke('dialog:setSize', { width, height }),
    onResult: (cb) => listen('dialog:result', cb),
    onClosed: (cb) => listen('dialog:closed', cb),
    onPayload: (cb) => listen('dialog:payload', cb),
    onAppearance: (cb) => listen('dialog:appearance', cb),
  },

  // Progress ticks for long-running reads / writes / downloads.
  onProgress: (cb) => listen('task:progress', cb),

  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    close: () => ipcRenderer.invoke('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    setTitle: (t) => ipcRenderer.invoke('win:setTitle', t),
    setOpacity: (v) => ipcRenderer.invoke('win:setOpacity', v),
    setMinWidth: (w) => ipcRenderer.invoke('win:setMinWidth', w),
    getSize: () => ipcRenderer.invoke('win:getSize'),
    setSize: (payload) => ipcRenderer.invoke('win:setSize', payload),
    onMaximizeChange: (cb) => listen('win:maximized', cb),
  },
});
