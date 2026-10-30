// Preload: the only bridge between the sandboxed renderer and the main process.
// src/lib/backend.js uses `window.myFtpClient` when it exists (desktop app)
// and falls back to HTTP against server/server.js otherwise (web version).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('myFtpClient', {
  host: 'electron',
  platform: process.platform,

  // Every core API method → { ok, data } | { ok: false, error: {code, message, path, stack} }.
  // The renderer turns the error object into an Error itself: an Error thrown
  // across the context bridge would lose everything but its message.
  call: (name, args) => ipcRenderer.invoke('api', name, args),

  onJobUpdate: (cb) => {
    const handler = (_e, snap) => cb(snap);
    ipcRenderer.on('job:update', handler);
    return () => ipcRenderer.removeListener('job:update', handler);
  },
  onTerminalData: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },
  onTerminalExit: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },

  // Frameless window: minimize / maximize (toggle) / close, and the
  // maximized state for the toolbar button icon.
  windowControl: (action) => ipcRenderer.send('win:control', action),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  getWindowSize: () => ipcRenderer.invoke('win:getSize'),
  setWindowSize: (w, h) => ipcRenderer.send('win:setSize', w, h),
  onMaximized: (cb) => {
    const handler = (_e, v) => cb(v);
    ipcRenderer.on('win:maximized', handler);
    return () => ipcRenderer.removeListener('win:maximized', handler);
  },

  quit: () => ipcRenderer.send('app:quit'),

  // Detached dialog windows (settings, about, errors, …).
  openDialog: (name, payload) => ipcRenderer.invoke('dialog:openWindow', { name, payload }),
  getDialogPayload: () => ipcRenderer.invoke('dialog:getPayload'),
  submitDialog: (name, data, keepOpen) => ipcRenderer.invoke('dialog:submit', { name, data, keepOpen }),
  closeDialog: (name) => ipcRenderer.invoke('dialog:closeWindow', name),
  closeSelf: () => ipcRenderer.invoke('dialog:closeSelf'),
  dialogReady: () => ipcRenderer.invoke('dialog:ready'),
  dialogSetSize: (width, height) => ipcRenderer.invoke('dialog:setSize', { width, height }),
  broadcastAppearance: (appearance) => ipcRenderer.invoke('dialog:broadcastAppearance', appearance),
  onDialogPayload: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('dialog:payload', handler);
    return () => ipcRenderer.removeListener('dialog:payload', handler);
  },
  onDialogResult: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('dialog:result', handler);
    return () => ipcRenderer.removeListener('dialog:result', handler);
  },
  onDialogClosed: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('dialog:closed', handler);
    return () => ipcRenderer.removeListener('dialog:closed', handler);
  },
  onDialogAppearance: (cb) => {
    const handler = (_e, appearance) => cb(appearance);
    ipcRenderer.on('dialog:appearance', handler);
    return () => ipcRenderer.removeListener('dialog:appearance', handler);
  },
});
