// IPC bridge: exposes core/api.js to the renderer and pushes the server's
// live events (log lines, client counts, transfer statistics) to it.
const { ipcMain } = require('electron');
const { MIN_WIDTH, MIN_HEIGHT } = require('./window-size');
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

  api.log.on('line', (line) => send('server:log', line));
  api.manager.on('update', (snap) => send('server:update', snap));

  // Window buttons of the frameless window (toolbar).
  ipcMain.on('win:control', (_event, action) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
    else if (action === 'close') win.close();
  });
  ipcMain.handle('win:getSize', () => { const win = getWindow(); return win && !win.isDestroyed() ? win.getSize() : [0, 0]; });
  ipcMain.on('win:setSize', (_event, w, h) => {
    const win = getWindow();
    if (!win || win.isDestroyed() || win.isMaximized()) return;
    const [minW, minH] = win.getMinimumSize();
    win.setSize(Math.max(minW, Math.round(w)), Math.max(minH, Math.round(h)));
  });
  // The renderer measures the widest single-line strips (toolbar, control
  // bar) and raises the minimum so they never wrap or get clipped.
  ipcMain.on('win:setMinSize', (_event, w, h) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    const minW = Math.max(MIN_WIDTH, Math.round(w) || 0);
    const minH = Math.max(MIN_HEIGHT, Math.round(h) || 0);
    win.setMinimumSize(minW, minH);
    if (win.isMaximized() || win.isFullScreen()) return;
    const [cw, ch] = win.getSize();
    if (cw < minW || ch < minH) win.setSize(Math.max(cw, minW), Math.max(ch, minH));
  });
  ipcMain.handle('win:isMaximized', () => { const win = getWindow(); return !!(win && !win.isDestroyed() && win.isMaximized()); });

  ipcMain.on('app:quit', () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.close();
  });
}

module.exports = { registerIpc };
