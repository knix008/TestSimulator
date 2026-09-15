// Preload: the only bridge between the sandboxed renderer and the main process.
// src/lib/backend.js uses `window.myEditor` when it exists (desktop app)
// and falls back to HTTP against server/server.js otherwise (web version).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('myEditor', {
  host: 'electron',
  platform: process.platform,

  // Every core API method → { ok, data } | { ok: false, error: {code, message, path, stack} }.
  // The renderer turns the error object into an Error itself: an Error thrown
  // across the context bridge would lose everything but its message.
  call: (name, args) => ipcRenderer.invoke('api', name, args),
  dialog: (kind, opts) => ipcRenderer.invoke('dialog', kind, opts),

  // Files handed over by the OS (command line, Explorer double-click, second instance).
  onOpenFiles: on('files:open'),
  // Absolute path of a File dropped onto the window.
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return file.path || ''; } },
  rendererReady: () => ipcRenderer.send('renderer:ready'),

  // Frameless window: minimize / maximize (toggle) / close / fullscreen, and the
  // maximized state for the menu-bar button icon.
  windowControl: (action) => ipcRenderer.send('win:control', action),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  getWindowSize: () => ipcRenderer.invoke('win:getSize'),
  setWindowSize: (w, h) => ipcRenderer.send('win:setSize', w, h),
  setTitle: (title) => ipcRenderer.send('win:setTitle', title),
  onMaximized: on('win:maximized'),
  onFocus: on('win:focus'),
  // The window wants to close → the renderer checks for unsaved work and replies.
  onCloseRequest: on('win:close-request'),
  replyClose: (allow) => ipcRenderer.send('win:close-reply', allow),

  quit: () => ipcRenderer.send('app:quit'),

  // Settings / info / shortcuts as separate windows, and the settings sync between windows.
  openPopup: (kind) => ipcRenderer.send('popup:open', kind),
  printHtml: (html, title) => ipcRenderer.send('print:html', html, title),
  sendSettingsPatch: (patch) => ipcRenderer.send('settings:patch', patch),
  onSettingsPatch: on('settings:patch'),
  // The smoke test keeps the dialogs inside the main window so it can drive them.
  smoke: !!process.env.MED_SMOKE,
});
