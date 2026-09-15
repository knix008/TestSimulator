// IPC bridge: exposes core/api.js to the renderer, the native dialogs and the
// frameless-window controls.
const { ipcMain, BrowserWindow } = require('electron');
const { serializeError } = require('../core/api');

function registerIpc(api, getWindow, { dialogs, onRendererReady, openPopup, printHtml } = {}) {
  // The window a message came from (a popup or the main window).
  const senderWin = (event) => { const w = BrowserWindow.fromWebContents(event.sender); return w && !w.isDestroyed() ? w : getWindow(); };
  ipcMain.handle('api', async (_event, name, args) => {
    try {
      return { ok: true, data: await api.call(name, args) };
    } catch (err) {
      return { ok: false, error: serializeError(err) };
    }
  });

  // Native file dialogs (the web version draws its own — src/dialogs/FileDialog.jsx).
  ipcMain.handle('dialog', async (_event, kind, opts) => {
    try {
      if (!dialogs || !dialogs[kind]) throw new Error(`Unknown dialog: ${kind}`);
      return { ok: true, data: await dialogs[kind](opts || {}) };
    } catch (err) {
      return { ok: false, error: serializeError(err) };
    }
  });

  ipcMain.on('renderer:ready', () => { if (onRendererReady) onRendererReady(); });

  // Window buttons of the frameless window (menu bar).
  ipcMain.on('win:control', (event, action) => {
    const win = senderWin(event);
    if (!win || win.isDestroyed()) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
    else if (action === 'close') win.close();
    else if (action === 'fullscreen') win.setFullScreen(!win.isFullScreen());
  });
  // The renderer asked the user about unsaved documents and now allows the close.
  ipcMain.on('win:close-reply', (_event, allow) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    if (allow && win.approveClose) win.approveClose();
  });
  // Size grip (bottom-right of the status bar): the renderer sends the
  // window size it wants while the grip is dragged.
  ipcMain.handle('win:getSize', () => { const win = getWindow(); return win && !win.isDestroyed() ? win.getSize() : [0, 0]; });
  ipcMain.on('win:setSize', (_event, w, h) => {
    const win = getWindow();
    if (!win || win.isDestroyed() || win.isMaximized()) return;
    const [minW, minH] = win.getMinimumSize();
    win.setSize(Math.max(minW, Math.round(w)), Math.max(minH, Math.round(h)));
  });
  ipcMain.handle('win:isMaximized', () => { const win = getWindow(); return !!(win && !win.isDestroyed() && win.isMaximized()); });
  ipcMain.on('win:setTitle', (_event, title) => { const win = getWindow(); if (win && !win.isDestroyed()) win.setTitle(title || 'My Editor'); });

  // Separate windows for settings / info / shortcuts.
  ipcMain.on('popup:open', (_event, kind) => { if (openPopup) openPopup(kind); });
  ipcMain.on('print:html', (_event, html, title) => { if (printHtml) printHtml(String(html || ''), title); });
  // A settings change in one window reaches every other window.
  ipcMain.on('settings:patch', (event, patch) => {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.webContents !== event.sender) w.webContents.send('settings:patch', patch);
  });

  ipcMain.on('app:quit', () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.close();
  });
}

module.exports = { registerIpc };
