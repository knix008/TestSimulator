// Preload: the only bridge between the sandboxed renderer and the main process.
// src/lib/backend.js uses `window.commandCenter` when it exists (desktop app)
// and falls back to HTTP against server/server.js otherwise (web version).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('commandCenter', {
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

  watchDir: (id, path) => ipcRenderer.send('watch:start', { id, path }),
  unwatchDir: (id) => ipcRenderer.send('watch:stop', { id }),
  onDirChanged: (cb) => {
    const handler = (_e, info) => cb(info);
    ipcRenderer.on('dir:changed', handler);
    return () => ipcRenderer.removeListener('dir:changed', handler);
  },

  dialog: (kind, opts) => ipcRenderer.invoke('dialog', kind, opts),
  quit: () => ipcRenderer.send('app:quit'),

  // Tool windows (see ipc.js): open one, fetch this window's arguments, close
  // this window, and the message bus between all windows of the app.
  openWindow: (spec) => ipcRenderer.invoke('win:open', spec),
  windowArgs: (id) => ipcRenderer.invoke('win:args', { id }),
  closeWindow: () => ipcRenderer.send('win:close'),
  // Resize grip: the current outer size, and a new size while dragging.
  windowSize: () => ipcRenderer.invoke('win:size'),
  resizeWindow: (width, height) => ipcRenderer.send('win:resize', { width, height }),
  postMessage: (msg) => ipcRenderer.send('win:message', msg),
  onMessage: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('win:message', handler);
    return () => ipcRenderer.removeListener('win:message', handler);
  },
});
