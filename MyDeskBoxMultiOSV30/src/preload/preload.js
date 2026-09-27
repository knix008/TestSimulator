'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

function on(channel, handler) {
  const wrapped = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('desk', {
  ready: (id) => ipcRenderer.send('fence:ready', id),
  onState: (handler) => on('fence:state', handler),
  onHover: (handler) => on('fence:hover', handler),
  onResize: (handler) => on('fence:resize', handler),
  onRename: (handler) => on('fence:rename', handler),
  onRenameItem: (handler) => on('fence:rename-item', handler),
  move: (rect) => ipcRenderer.send('fence:bounds', rect),
  saveBounds: (rect) => ipcRenderer.send('fence:bounds-save', rect),
  hover: (payload) => ipcRenderer.send('fence:hover', payload),
  scrolled: (id, top) => ipcRenderer.send('fence:scroll', { id, top }),
  collapse: (id, collapsed) => ipcRenderer.invoke('fence:collapse', { id, collapsed }),
  transfer: (payload) => ipcRenderer.invoke('fence:transfer', payload),
  dropFiles: (payload) => ipcRenderer.invoke('fence:drop', payload),
  open: (filePath) => ipcRenderer.invoke('fence:open', filePath),
  menu: (id, filePath) => ipcRenderer.invoke('fence:menu', { id, filePath }),
  rename: (id, title) => ipcRenderer.invoke('fence:rename', { id, title }),
  renameItem: (id, filePath, name) => ipcRenderer.invoke('fence:rename-item', { id, filePath, name }),
  pathForFile: (file) => webUtils.getPathForFile(file),
  finishDraw: (rect) => ipcRenderer.invoke('draw:finish', rect),
  cancelDraw: () => ipcRenderer.invoke('draw:cancel'),
  onGhost: (handler) => on('ghost:icon', handler),
  answer: (id, ok) => ipcRenderer.send('ask:answer', { id, ok }),
  askSize: (id, height) => ipcRenderer.send('ask:size', { id, height }),
  settings: (id) => ipcRenderer.send('box:open', id),
  boxReady: (id) => ipcRenderer.send('box:ready', id),
  onBoxSettings: (handler) => on('box:state', handler),
  boxChange: (id, patch) => ipcRenderer.send('box:change', { id, patch }),
  boxReset: (id) => ipcRenderer.send('box:reset', id),
  boxSize: (id, height) => ipcRenderer.send('box:size', { id, height }),
  boxClose: (id) => ipcRenderer.send('box:close', id),
  // 프로그램 전체 설정 창
  prefsReady: () => ipcRenderer.send('prefs:ready'),
  onPrefs: (handler) => on('prefs:state', handler),
  prefsChange: (patch) => ipcRenderer.send('prefs:change', patch),
  prefsOpen: (what) => ipcRenderer.invoke('prefs:action', what),
  // 규칙·페이지·스냅샷 고치기
  prefsEdit: (payload) => ipcRenderer.invoke('prefs:edit', payload),
  prefsClose: () => ipcRenderer.send('prefs:close'),
});
