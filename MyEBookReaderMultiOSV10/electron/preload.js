'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The only bridge between the renderer and Node. Everything is an explicit,
// narrow call — the renderer never sees `require`, `fs` or `ipcRenderer`.
//
// The same preload serves the main window and every popup window, so a menu or
// dialog window gets exactly the same, deliberately small surface.
const subscribe = (channel, cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  getInfo: () => ipcRenderer.invoke('app:getInfo'),
  takePendingOpen: () => ipcRenderer.invoke('app:takePendingOpen'),
  onOpenPath: (cb) => subscribe('app:openPath', cb),

  home: () => ipcRenderer.invoke('fs:home'),
  exists: (p) => ipcRenderer.invoke('fs:exists', p),
  stat: (p) => ipcRenderer.invoke('fs:stat', p),
  readDir: (p) => ipcRenderer.invoke('fs:readDir', p),
  readBinary: (payload) => ipcRenderer.invoke('fs:readBinary', payload),
  readText: (p) => ipcRenderer.invoke('fs:readText', p),
  writeText: (payload) => ipcRenderer.invoke('fs:writeText', payload),

  openBookDialog: (payload) => ipcRenderer.invoke('dialog:openBook', payload),
  openImageDialog: (payload) => ipcRenderer.invoke('dialog:openImage', payload),
  pickDirectory: (payload) => ipcRenderer.invoke('dialog:pickDirectory', payload),
  saveText: (payload) => ipcRenderer.invoke('dialog:saveText', payload),
  saveBinary: (payload) => ipcRenderer.invoke('dialog:saveBinary', payload),

  download: (payload) => ipcRenderer.invoke('net:download', payload),

  printHtml: (payload) => ipcRenderer.invoke('print:html', payload),
  printImages: (payload) => ipcRenderer.invoke('print:images', payload),

  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  readClipboardText: () => ipcRenderer.invoke('clipboard:readText'),
  writeClipboardImage: (dataUrl) => ipcRenderer.invoke('clipboard:writeImage', dataUrl),

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),

  gallery: {
    load: () => ipcRenderer.invoke('gallery:load'),
    save: (text) => ipcRenderer.invoke('gallery:save', text),
    loadPositions: () => ipcRenderer.invoke('gallery:loadPositions'),
    savePositions: (text) => ipcRenderer.invoke('gallery:savePositions', text),
    putCover: (name, base64) => ipcRenderer.invoke('gallery:putCover', name, base64),
    clear: () => ipcRenderer.invoke('gallery:clear'),
  },

  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),

  // Progress ticks for long-running reads / writes / downloads.
  onProgress: (cb) => subscribe('task:progress', cb),

  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    close: () => ipcRenderer.invoke('win:close'),
    forceClose: () => ipcRenderer.invoke('win:forceClose'),
    onCloseRequest: (cb) => subscribe('win:close-request', cb),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    setTitle: (title) => ipcRenderer.invoke('win:setTitle', title),
    setMinWidth: (width) => ipcRenderer.invoke('win:setMinWidth', width),
    getSize: () => ipcRenderer.invoke('win:getSize'),
    setSize: (payload) => ipcRenderer.invoke('win:setSize', payload),
    getContentBounds: () => ipcRenderer.invoke('win:getContentBounds'),
    onMaximizeChange: (cb) => subscribe('win:maximized', cb),
  },

  // ── Menus, shown in their own window ──
  menu: {
    open: (payload, anchor) => ipcRenderer.invoke('menu:open', payload, anchor),
    close: () => ipcRenderer.invoke('menu:close'),
    payload: () => ipcRenderer.invoke('menu:payload'),
    reportSize: (size) => ipcRenderer.invoke('menu:size', size),
    choose: (commandId) => ipcRenderer.invoke('menu:choose', commandId),
    onPayload: (cb) => subscribe('menu:payload', cb),
    onChosen: (cb) => subscribe('menu:chosen', cb),
  },

  // ── Dialogs, shown in their own window ──
  dialog: {
    open: (name, payload) => ipcRenderer.invoke('dialog:open', name, payload),
    close: (name) => ipcRenderer.invoke('dialog:close', name),
    closeAll: () => ipcRenderer.invoke('dialog:close-all'),
    payload: () => ipcRenderer.invoke('dialog:payload'),
    send: (name, result) => ipcRenderer.invoke('dialog:result', name, result),
    reportSize: (size) => ipcRenderer.invoke('dialog:size', size),
    onPayload: (cb) => subscribe('dialog:payload', cb),
    onResult: (cb) => subscribe('dialog:result', cb),
    onClosed: (cb) => subscribe('dialog:closed', cb),
  },
});
