// Preload: the only bridge between the sandboxed renderer and the main process.
// src/lib/backend.js uses `window.myFtpServer` when it exists (desktop app)
// and falls back to HTTP against server/server.js otherwise (web version).
const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('myFtpServer', {
  host: 'electron',
  platform: process.platform,

  // Every core API method → { ok, data } | { ok: false, error: {code, message, …} }.
  // The renderer rebuilds the Error itself: one thrown across the context
  // bridge would lose everything but its message.
  call: (name, args) => ipcRenderer.invoke('api', name, args),

  onLog: listen('server:log'),
  onUpdate: listen('server:update'),

  // Frameless window: minimize / maximize (toggle) / close, size grip.
  windowControl: (action) => ipcRenderer.send('win:control', action),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  getWindowSize: () => ipcRenderer.invoke('win:getSize'),
  setWindowSize: (w, h) => ipcRenderer.send('win:setSize', w, h),
  setMinWindowSize: (w, h) => ipcRenderer.send('win:setMinSize', w, h),
  onMaximized: listen('win:maximized'),

  quit: () => ipcRenderer.send('app:quit'),
});
