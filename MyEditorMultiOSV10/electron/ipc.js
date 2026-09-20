// IPC bridge: exposes core/api.js to the renderer, the native dialogs and the
// frameless-window controls.
const { ipcMain, BrowserWindow, Menu, nativeImage } = require('electron');
const { serializeError } = require('../core/api');

function registerIpc(api, getWindow, { dialogs, onRendererReady, openPopup, openPrint, takePrintJob, listPrinters, printHtml, printRun } = {}) {
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
  // The renderer measures what the menu bar / icon toolbar need to show every
  // control on one line; that becomes the minimum width (never below the
  // small fallback the window was created with). A narrower window is widened.
  ipcMain.on('win:setMinWidth', (_event, w) => {
    const win = getWindow();
    if (!win || win.isDestroyed() || !Number.isFinite(w)) return;
    if (win.baseMinWidth == null) win.baseMinWidth = win.getMinimumSize()[0];
    const frame = win.getSize()[0] - win.getContentSize()[0];
    const [, minH] = win.getMinimumSize();
    const minW = Math.max(win.baseMinWidth, Math.ceil(w) + frame);
    if (minW !== win.getMinimumSize()[0]) win.setMinimumSize(minW, minH);
    if (!win.isMaximized() && !win.isFullScreen() && win.getSize()[0] < minW) win.setSize(minW, win.getSize()[1]);
  });
  ipcMain.handle('win:isMaximized', () => { const win = getWindow(); return !!(win && !win.isDestroyed() && win.isMaximized()); });
  ipcMain.on('win:setTitle', (_event, title) => { const win = getWindow(); if (win && !win.isDestroyed()) win.setTitle(title || 'My Editor'); });

  // Separate windows for settings / info / shortcuts.
  ipcMain.on('popup:open', (_event, kind, tab) => { if (openPopup) openPopup(kind, tab); });

  // The menu bar's dropdowns as native OS menus (they may extend beyond the window, unlike an HTML
  // popup). The renderer sends its item list ({ id, label, checked, radio, disabled, shortcut, meta,
  // sep, header }) and the position under the menu title; the answer is the picked item's id, or
  // null when the menu was dismissed. Shortcuts are shown through `accelerator` (display only in a
  // popup menu); an accelerator Electron cannot parse is shown in the label instead.
  ipcMain.handle('menu:popup', (event, items, pos) => new Promise((resolve) => {
    const win = senderWin(event);
    if (!win) return resolve(null);
    let picked = null;
    // 'Ctrl+…' as Electron writes it; a label with a symbol (⌘ on macOS) or a key it cannot name is shown in the label instead.
    const accel = (s) => { const a = String(s).replace(/^Ctrl\+/, 'CmdOrCtrl+').replace(/\+\+$/, '+Plus'); if (!/^[ -~]+$/.test(a)) throw new Error('not an accelerator'); return a; };
    const build = (withAccel) => Menu.buildFromTemplate((items || []).map((it) => {
      if (it.sep) return { type: 'separator' };
      if (it.header) return { label: String(it.header), enabled: false };
      const label = `${it.label}${it.meta ? `  (${it.meta})` : ''}${!withAccel && it.shortcut ? `\t${it.shortcut}` : ''}`;
      let icon;
      if (it.png) { try { icon = nativeImage.createFromBuffer(Buffer.from(it.png, 'base64'), { scaleFactor: Number(it.scale) || 1 }); } catch { icon = undefined; } }
      return {
        label, enabled: !it.disabled, ...(icon ? { icon } : {}),
        type: it.radio ? 'radio' : it.checked !== undefined && !it.iconOnly ? 'checkbox' : 'normal',
        checked: !!it.checked,
        ...(withAccel && it.shortcut ? { accelerator: accel(it.shortcut) } : {}),
        click: () => { picked = it.id; },
      };
    }));
    let menu;
    try { menu = build(true); } catch { menu = build(false); }
    menu.popup({ window: win, x: Math.round(pos && pos.x || 0), y: Math.round(pos && pos.y || 0), callback: () => resolve(picked) });
    if (pos && pos.autoClose) setTimeout(() => { try { menu.closePopup(win); } catch { /* gone */ } }, pos.autoClose);   // the smoke test: pop up, then close by itself
  }));
  ipcMain.on('print:open', (_event, job) => { if (openPrint) openPrint(job); });
  ipcMain.handle('print:takeJob', () => (takePrintJob ? takePrintJob() : null));
  ipcMain.handle('print:printers', async () => {
    try { return listPrinters ? await listPrinters() : []; } catch { return []; }
  });
  ipcMain.handle('print:html', (_event, html, title, labels, opts) => (printHtml ? printHtml(String(html || ''), title, labels && typeof labels === 'object' ? labels : undefined, opts && typeof opts === 'object' ? opts : undefined) : { success: false, failureReason: 'unavailable' }));
  ipcMain.handle('print:run', (event, opts) => (printRun ? printRun(event, opts && typeof opts === 'object' ? opts : {}) : { success: false, failureReason: 'unavailable' }));
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
