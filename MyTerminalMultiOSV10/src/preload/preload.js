const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('myTerminal', {
  platform: process.platform,
  isElectron: true,

  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  getWindowBounds: () => ipcRenderer.invoke('window:getBounds'),
  setMinSize: (size) => ipcRenderer.invoke('window:setMinSize', size || {}),
  onMaximized: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },

  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  onOpenSettings: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('tray:openSettings', handler);
    return () => ipcRenderer.removeListener('tray:openSettings', handler);
  },

  openPopup: (options) => ipcRenderer.invoke('popup:open', options || {}),
  closePopup: (id) => ipcRenderer.invoke('popup:close', id),
  fitPopup: (payload) => ipcRenderer.invoke('popup:fit', payload || {}),
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
  loadBackgroundImage: () => ipcRenderer.invoke('background:load'),
  clearBackgroundImage: () => ipcRenderer.invoke('background:clear'),

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
  takeAdopt: (sessionId) => ipcRenderer.invoke('session:takeAdopt', sessionId),
  onSessionDetached: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('session:detached', handler);
    return () => ipcRenderer.removeListener('session:detached', handler);
  },

  showDetachPreview: (options) => ipcRenderer.invoke('detachPreview:show', options || {}),
  moveDetachPreview: (options) => ipcRenderer.send('detachPreview:move', options || {}),
  hideDetachPreview: () => ipcRenderer.invoke('detachPreview:hide'),
});
