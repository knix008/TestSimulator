// IPC bridge: exposes core/api.js to the renderer and pushes job updates and
// directory-change notifications to it.
const { ipcMain, BrowserWindow } = require('electron');
const fs = require('fs');
const { serializeError } = require('../core/api');

function registerIpc(api, getWindow, dialogs = {}, windows = {}) {
  // Pushed to every window: a tool window (the search window, say) follows its own jobs.
  const send = (channel, payload) => {
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };

  ipcMain.handle('api', async (_event, name, args) => {
    try {
      return { ok: true, data: await api.call(name, args) };
    } catch (err) {
      return { ok: false, error: serializeError(err) };
    }
  });

  api.jobs.on('update', (snap) => send('job:update', snap));

  // Native dialogs (only the folder picker so far).
  ipcMain.handle('dialog', async (event, kind, opts) => {
    try {
      if (!dialogs[kind]) throw new Error(`Unknown dialog: ${kind}`);
      return { ok: true, data: await dialogs[kind](opts || {}, BrowserWindow.fromWebContents(event.sender)) };
    } catch (err) {
      return { ok: false, error: serializeError(err) };
    }
  });

  // ── Directory watching (one watcher per panel) ──
  const watchers = new Map();
  ipcMain.on('watch:start', (_event, { id, path: dir }) => {
    stopWatch(id);
    try {
      const w = fs.watch(dir, { persistent: false }, () => send('dir:changed', { id, path: dir }));
      w.on('error', () => stopWatch(id));
      watchers.set(id, w);
    } catch { /* unwatchable (permissions, network share) — the UI still refreshes after its own operations */ }
  });
  ipcMain.on('watch:stop', (_event, { id }) => stopWatch(id));
  function stopWatch(id) {
    const w = watchers.get(id);
    if (w) { try { w.close(); } catch { /* ignore */ } watchers.delete(id); }
  }

  ipcMain.on('app:quit', () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.close();
  });

  // ── Tool windows ──
  // win:open creates one and parks its arguments until the new page asks for
  // them (win:args); win:message is relayed to every window, which is how a
  // tool window talks back to the main window (refresh, rename done, …).
  const winArgs = new Map();
  ipcMain.handle('win:open', (_event, { kind, args, title, width, height }) => {
    if (!windows.openToolWindow) return { ok: false, error: { code: 'UNSUPPORTED', message: 'no tool windows' } };
    const w = windows.openToolWindow({ kind, title, width, height });
    winArgs.set(String(w.id), args || {});
    w.on('closed', () => winArgs.delete(String(w.id)));
    return { ok: true, data: { id: w.id } };
  });
  ipcMain.handle('win:args', (event, { id }) => ({ ok: true, data: winArgs.get(String(id)) || winArgs.get(String(event.sender.id)) || {} }));
  ipcMain.on('win:close', (event) => { const w = BrowserWindow.fromWebContents(event.sender); if (w && !w.isDestroyed()) w.close(); });
  ipcMain.on('win:message', (_event, msg) => send('win:message', msg));
}

module.exports = { registerIpc };
