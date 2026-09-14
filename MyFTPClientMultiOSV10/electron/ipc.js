// IPC bridge: exposes core/api.js to the renderer and pushes job updates
// (connect progress, transfer progress, conflict questions) to it.
const { ipcMain } = require('electron');
const { serializeError } = require('../core/api');

function registerIpc(api, getWindow) {
  const send = (channel, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  ipcMain.handle('api', async (_event, name, args) => {
    try {
      return { ok: true, data: await api.call(name, args) };
    } catch (err) {
      return { ok: false, error: serializeError(err) };
    }
  });

  api.jobs.on('update', (snap) => send('job:update', snap));

  // Window buttons of the frameless window (toolbar).
  ipcMain.on('win:control', (_event, action) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
    else if (action === 'close') win.close();
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

  ipcMain.on('app:quit', () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.close();
  });
}

module.exports = { registerIpc };
