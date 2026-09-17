const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('myTerminal', {
  platform: process.platform,
  isElectron: true,

  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  setWindowOpacity: (value) => ipcRenderer.invoke('window:setOpacity', value),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  getWindowBounds: () => ipcRenderer.invoke('window:getBounds'),
  setMinSize: (size) => ipcRenderer.invoke('window:setMinSize', size || {}),
  resizeWindowBy: (delta) => ipcRenderer.invoke('window:resizeBy', delta || {}),
  onMaximized: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },

  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  clipboardWriteText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  clipboardReadText: () => ipcRenderer.invoke('clipboard:readText'),
  reportError: (info) => ipcRenderer.invoke('app:reportError', info || {}),
  onAppError: (cb) => {
    const handler = (_e, info) => cb(info);
    ipcRenderer.on('app:error', handler);
    return () => ipcRenderer.removeListener('app:error', handler);
  },
  onOpenSettings: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('tray:openSettings', handler);
    return () => ipcRenderer.removeListener('tray:openSettings', handler);
  },

  openPopup: (options) => ipcRenderer.invoke('popup:open', options || {}),
  closePopup: (id) => ipcRenderer.invoke('popup:close', id),
  focusPopup: (id) => ipcRenderer.invoke('popup:focus', id),
  showPopup: (id) => ipcRenderer.invoke('popup:show', id),
  fitPopup: (payload) => ipcRenderer.invoke('popup:fit', payload || {}),
  setPopupResizable: (id, resizable) =>
    ipcRenderer.invoke('popup:setResizable', { id, resizable: resizable !== false }),
  popupSend: (id, message) => ipcRenderer.invoke('popup:send', { id, message }),
  popupGetId: () => ipcRenderer.invoke('popup:getId'),
  onPopupEvent: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('popup:event', handler);
    return () => ipcRenderer.removeListener('popup:event', handler);
  },
  onPopupMessage: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('popup:message', handler);
    return () => ipcRenderer.removeListener('popup:message', handler);
  },
  pickBackgroundImage: () => ipcRenderer.invoke('background:pick'),
  listBackgroundImages: () => ipcRenderer.invoke('background:list'),
  selectBackgroundImage: (id) => ipcRenderer.invoke('background:select', id),
  removeBackgroundImage: (id) => ipcRenderer.invoke('background:remove', id),
  loadBackgroundImage: () => ipcRenderer.invoke('background:load'),
  clearBackgroundImage: () => ipcRenderer.invoke('background:clear'),
  pickDirectory: (options) => ipcRenderer.invoke('dialog:pickDirectory', options || {}),

  ptyStart: (options) => ipcRenderer.invoke('pty:start', options),
  ptyWrite: (sessionId, data) => ipcRenderer.invoke('pty:write', { sessionId, data }),
  ptyResize: (sessionId, cols, rows) =>
    ipcRenderer.invoke('pty:resize', { sessionId, cols, rows }),
  ptyKill: (sessionId) => ipcRenderer.invoke('pty:kill', { sessionId }),
  onPtyData: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('pty:data', handler);
    return () => ipcRenderer.removeListener('pty:data', handler);
  },
  onPtyExit: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('pty:exit', handler);
    return () => ipcRenderer.removeListener('pty:exit', handler);
  },

  getPromptPresets: () => ipcRenderer.invoke('prompt:getPresets'),
  listShells: (options) => ipcRenderer.invoke('shells:list', options || {}),
  setPrompt: (template) => ipcRenderer.invoke('prompt:set', template),

  sshConnect: (config) => ipcRenderer.invoke('ssh:connect', config),
  sshDisconnect: (payload) => ipcRenderer.invoke('ssh:disconnect', payload || {}),
  sshStatus: (payload) => ipcRenderer.invoke('ssh:status', payload || {}),
  onSshDisconnected: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('ssh:disconnected', handler);
    return () => ipcRenderer.removeListener('ssh:disconnected', handler);
  },

  detachSession: (payload) => ipcRenderer.invoke('session:detach', payload),
  attachSession: (payload) => ipcRenderer.invoke('session:attach', payload),
  takeAdopt: (sessionId) => ipcRenderer.invoke('session:takeAdopt', sessionId),
  findWindowAtPoint: (point) => ipcRenderer.invoke('window:findAtPoint', point || {}),
  destroyEmptyWindow: () => ipcRenderer.invoke('window:destroyEmpty'),
  showMergePreview: (payload) => ipcRenderer.send('session:mergePreview', payload || {}),
  clearMergePreview: () => ipcRenderer.send('session:mergePreviewClear'),
  onMergePreview: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('session:mergePreview', handler);
    return () => ipcRenderer.removeListener('session:mergePreview', handler);
  },
  onMergePreviewClear: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('session:mergePreviewClear', handler);
    return () => ipcRenderer.removeListener('session:mergePreviewClear', handler);
  },
  onSessionDetached: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('session:detached', handler);
    return () => ipcRenderer.removeListener('session:detached', handler);
  },
  onSessionAdopt: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('session:adopt', handler);
    return () => ipcRenderer.removeListener('session:adopt', handler);
  },

  showDetachPreview: (options) => ipcRenderer.invoke('detachPreview:show', options || {}),
  moveDetachPreview: (options) => ipcRenderer.send('detachPreview:move', options || {}),
  hideDetachPreview: () => ipcRenderer.invoke('detachPreview:hide'),
});
