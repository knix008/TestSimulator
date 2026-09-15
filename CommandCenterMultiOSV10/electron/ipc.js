// IPC bridge: exposes core/api.js to the renderer and pushes job updates and
// directory-change notifications to it.
const { ipcMain } = require('electron');
const fs = require('fs');
const { serializeError } = require('../core/api');

function registerIpc(api, getWindow, dialogs = {}) {
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

  // Native dialogs (only the folder picker so far).
  ipcMain.handle('dialog', async (_event, kind, opts) => {
    try {
      if (!dialogs[kind]) throw new Error(`Unknown dialog: ${kind}`);
      return { ok: true, data: await dialogs[kind](opts || {}) };
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
}

module.exports = { registerIpc };
