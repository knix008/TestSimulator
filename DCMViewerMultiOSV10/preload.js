/* Bridge between the sandboxed renderer and main.js (see src/js/platform.js for the web counterpart). */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (cb) => {
  const handler = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  appInfo: () => ipcRenderer.invoke('app-info'),
  settingsGet: () => ipcRenderer.invoke('settings-get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings-set', patch),
  defaultDir: () => ipcRenderer.invoke('default-dir'),
  homeDir: () => ipcRenderer.invoke('home-dir'),
  listDrives: () => ipcRenderer.invoke('list-drives'),

  pathJoin: (...parts) => ipcRenderer.invoke('path-join', parts),
  pathDirname: (p) => ipcRenderer.invoke('path-dirname', p),
  pathBasename: (p) => ipcRenderer.invoke('path-basename', p),
  pathSep: () => ipcRenderer.invoke('path-sep'),

  readDir: (dir) => ipcRenderer.invoke('read-dir', dir),
  stat: (p) => ipcRenderer.invoke('stat', p),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  readFileHead: (p, n) => ipcRenderer.invoke('read-file-head', p, n),
  writeFile: (p, data) => ipcRenderer.invoke('write-file', p, data),
  mkdir: (p) => ipcRenderer.invoke('mkdir', p),
  uniqueDir: (base) => ipcRenderer.invoke('unique-dir', base),
  trash: (p) => ipcRenderer.invoke('trash', p),
  copyInto: (sources, destDir, move) => ipcRenderer.invoke('copy-into', sources, destDir, !!move),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return file && file.path; } },

  openFileDialog: (opts) => ipcRenderer.invoke('dialog-open-file', opts),
  openFolderDialog: (opts) => ipcRenderer.invoke('dialog-open-folder', opts),
  saveDialog: (opts) => ipcRenderer.invoke('dialog-save', opts),
  messageBox: (opts) => ipcRenderer.invoke('dialog-message', opts),

  toggleFullscreen: () => ipcRenderer.invoke('window-fullscreen'),
  setMinSize: (w, h) => ipcRenderer.invoke('window-min-size', w, h),
  toggleDevTools: () => ipcRenderer.invoke('window-devtools'),
  printHtml: (html, opts) => ipcRenderer.invoke('print-html', html, opts || {}),
  clipboardWriteImage: (dataUrl) => ipcRenderer.invoke('clipboard-write-image', dataUrl),
  clipboardWriteText: (text) => ipcRenderer.invoke('clipboard-write-text', text),

  watchDir: (dir) => ipcRenderer.invoke('watch-dir', dir),
  unwatchDir: (dir) => ipcRenderer.invoke('unwatch-dir', dir),

  // Popup windows
  popupOpen: (opts) => ipcRenderer.invoke('popup-open', opts),
  popupSend: (kind, event, data) => ipcRenderer.invoke('popup-send', { kind, event, data }),
  popupClose: (kind) => ipcRenderer.invoke('popup-close', kind),
  onPopupEvent: on('popup-event'),
  // inside a popup
  popupReady: (info) => ipcRenderer.invoke('popup-ready', info),
  popupResize: (size) => ipcRenderer.invoke('popup-resize', size),
  popupEmit: (msg) => ipcRenderer.invoke('popup-emit', msg),
  onPopupInit: on('popup-init'),
  onPopupSend: on('popup-send'),

  onOpenPath: on('open-path'),
  onMenuAction: on('menu-action'),
  onDirChanged: on('dir-changed'),
});
