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
  overForeign: (screenX, screenY) => ipcRenderer.sendSync('fence:over-foreign', { screenX, screenY }),
  dragOut: (filePath) => ipcRenderer.sendSync('fence:drag-out', filePath),
  // 마우스 메시지가 끝난 뒤에 넘긴다. 그 안에서 넘기면 운영체제가 끌기를 곧 끝낸다.
  dragOutLater: (filePath) => ipcRenderer.send('fence:drag-out-later', filePath),
  scrolled: (id, top) => ipcRenderer.send('fence:scroll', { id, top }),
  collapse: (id, collapsed) => ipcRenderer.invoke('fence:collapse', { id, collapsed }),
  transfer: (payload) => ipcRenderer.invoke('fence:transfer', payload),
  dropFiles: (payload) => ipcRenderer.invoke('fence:drop', payload),
  copyItem: (id, filePath) => ipcRenderer.invoke('fence:copy', { id, filePath }),
  cutItem: (id, filePath) => ipcRenderer.invoke('fence:cut', { id, filePath }),
  paste: (id) => ipcRenderer.invoke('fence:paste', id),
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
  prefsClose: () => ipcRenderer.send('prefs:close'),
  // 큰 오류 창. 글 전체를 클립보드로 보내거나 창을 닫는다.
  fatalCopy: () => ipcRenderer.send('fatal:copy'),
  fatalClose: () => ipcRenderer.send('fatal:close'),
  onFatalCopied: (handler) => on('fatal:copied', handler),
});
