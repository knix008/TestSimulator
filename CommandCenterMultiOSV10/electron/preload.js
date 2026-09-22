// Preload: the only bridge between the sandboxed renderer and the main process.
// src/lib/backend.js uses `window.commandCenter` when it exists (desktop app)
// and falls back to HTTP against server/server.js otherwise (web version).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
  // Prints a self-contained HTML document through the system print dialog (see ipc.js print:html).
  printHtml: (spec) => ipcRenderer.invoke('print:html', spec),
  quit: () => ipcRenderer.send('app:quit'),

  // Drag & drop with the desktop (src/lib/dragdrop.js): the path behind a File dropped from
  // Explorer / Finder, and a native drag of files out of a panel (ipc.js drag:start) that
  // resolves once the drag is over.
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return (file && file.path) || ''; } },
  startDrag: (paths) => ipcRenderer.invoke('drag:start', { paths }),

  // Tool windows (see ipc.js): open one, fetch this window's arguments, close
  // this window, and the message bus between all windows of the app.
  openWindow: (spec) => ipcRenderer.invoke('win:open', spec),
  windowArgs: (id) => ipcRenderer.invoke('win:args', { id }),
  closeWindow: () => ipcRenderer.send('win:close'),
  // Resize grip: the current outer size, and a new size while dragging.
  windowSize: () => ipcRenderer.invoke('win:size'),
  resizeWindow: (width, height) => ipcRenderer.send('win:resize', { width, height }),
  // Size this window to the content height it asks for (a fixed-size window such as the settings one
  // measures itself, so nothing in it ever scrolls or is cut off).
  fitWindow: (height) => ipcRenderer.send('win:fit', { height }),
  // Menu popup: a menu is drawn in its own frameless window so it can extend
  // past the app window's edge. The owner window calls popupMenu and listens
  // for the pick; the popup page (?win=menu) uses the onMenuShow / menuSize
  // side and reports what the user picked.
  popupMenu: (spec) => ipcRenderer.invoke('menu:popup', spec),
  closeMenuPopup: (seq) => ipcRenderer.send('menu:close', { seq }),
  onMenuPicked: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('menu:picked', handler);
    return () => ipcRenderer.removeListener('menu:picked', handler);
  },
  onMenuShown: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('menu:shown', handler);
    return () => ipcRenderer.removeListener('menu:shown', handler);
  },
  onMenuClosed: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('menu:closed', handler);
    return () => ipcRenderer.removeListener('menu:closed', handler);
  },
  onMenuShow: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('menu:show', handler);
    return () => ipcRenderer.removeListener('menu:show', handler);
  },
  menuSize: (width, height, seq) => ipcRenderer.send('menu:size', { width, height, seq }),
  menuPick: (id, seq) => ipcRenderer.send('menu:pick', { id, seq }),

  postMessage: (msg) => ipcRenderer.send('win:message', msg),
  onMessage: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('win:message', handler);
    return () => ipcRenderer.removeListener('win:message', handler);
  },
});
