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
});
