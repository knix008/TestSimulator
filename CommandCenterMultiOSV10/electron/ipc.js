// IPC bridge: exposes core/api.js to the renderer and pushes job updates and
// directory-change notifications to it.
const { ipcMain, BrowserWindow, screen } = require('electron');
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
    if (winArgs.has(String(w.id))) {
      // The window already existed: give it the new arguments (a different file to view, another folder to search …).
      winArgs.set(String(w.id), args || {});
      w.webContents.send('win:message', { type: 'replaceArgs', id: String(w.id), kind });
    } else {
      winArgs.set(String(w.id), args || {});
      w.on('closed', () => winArgs.delete(String(w.id)));
    }
    return { ok: true, data: { id: w.id } };
  });
  ipcMain.handle('win:args', (event, { id }) => ({ ok: true, data: winArgs.get(String(id)) || winArgs.get(String(event.sender.id)) || {} }));
  ipcMain.on('win:close', (event) => { const w = BrowserWindow.fromWebContents(event.sender); if (w && !w.isDestroyed()) w.close(); });
  ipcMain.on('win:message', (_event, msg) => send('win:message', msg));
  // The resize grip at the bottom-right of the main window.
  ipcMain.handle('win:size', (event) => { const w = BrowserWindow.fromWebContents(event.sender); const [width, height] = w ? w.getSize() : [0, 0]; return { ok: true, data: { width, height } }; });
  ipcMain.on('win:resize', (event, { width, height }) => { const w = BrowserWindow.fromWebContents(event.sender); if (w && !w.isDestroyed() && !w.isMaximized()) w.setSize(Math.max(200, Math.round(width)), Math.max(150, Math.round(height))); });

  // A window sizing itself to its content: the settings window measures every tab and asks for the height
  // of the tallest, so it needs no scrollbar. `resizable:false` blocks setContentSize, so it is lifted for
  // the call; the height is kept within the screen the window is on.
  ipcMain.on('win:fit', (event, { height }) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w || w.isDestroyed() || w.isMaximized()) return;
    const want = Math.round(Number(height) || 0);
    if (!Number.isFinite(want) || want < 200) return;
    const area = screen.getDisplayNearestPoint(w.getBounds()).workArea;
    const chrome = w.getBounds().height - w.getContentBounds().height;
    const h = Math.max(200, Math.min(want, area.height - chrome));
    if (Math.abs(w.getContentBounds().height - h) < 2) return;
    const wasResizable = w.isResizable();
    if (!wasResizable) w.setResizable(true);
    w.setContentSize(w.getContentBounds().width, h);
    if (!wasResizable) w.setResizable(false);
    // Keep it on screen after growing downwards.
    const b = w.getBounds();
    if (b.y + b.height > area.y + area.height) w.setPosition(b.x, Math.max(area.y, area.y + area.height - b.height));
  });

  // ── Menu popup (see main.js) ──
  // A menu is drawn in its own frameless window, so it is never cut off by the
  // app window: menu:popup sends the items, the popup page answers with the
  // size it needs (menu:size) and the pick travels back as menu:picked.
  ipcMain.handle('menu:popup', (event, spec) => {
    if (!windows.showMenuPopup) return { ok: false, error: { code: 'UNSUPPORTED', message: 'no menu popup' } };
    return { ok: true, data: windows.showMenuPopup(spec || {}, BrowserWindow.fromWebContents(event.sender)) };
  });
  ipcMain.on('menu:size', (_event, { width, height, seq }) => { if (windows.placeMenuPopup) windows.placeMenuPopup(width, height, seq); });
  ipcMain.on('menu:pick', (_event, { id, seq }) => { if (windows.menuPopupPick) windows.menuPopupPick(id, seq); });
  ipcMain.on('menu:close', (_event, { seq } = {}) => { if (windows.hideMenuPopup) windows.hideMenuPopup('close', seq); });
}

module.exports = { registerIpc };
