const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

/** @type {Map<string, { win: Electron.BrowserWindow, ownerId: number, kind: string }>} */
const popups = new Map();
let nextId = 1;

function getIconPath() {
  const candidates = [
    path.join(__dirname, '../../build/icon.png'),
    path.join(__dirname, '../../assets/icons/icon.png'),
    path.join(process.resourcesPath || '', 'icons', 'icon.png'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function centerNearOwner(owner, width, height) {
  try {
    const bounds = owner?.getBounds?.();
    if (!bounds) {
      const display = screen.getPrimaryDisplay().workArea;
      return {
        x: Math.round(display.x + (display.width - width) / 2),
        y: Math.round(display.y + (display.height - height) / 2),
      };
    }
    return {
      x: Math.round(bounds.x + (bounds.width - width) / 2),
      y: Math.round(bounds.y + Math.max(40, (bounds.height - height) / 2)),
    };
  } catch (_) {
    return undefined;
  }
}

function createPopupWindow(owner, options = {}) {
  const width = Math.max(360, options.width || 520);
  const height = Math.max(240, options.height || 560);
  const pos = centerNearOwner(owner, width, height);
  const id = `popup-${nextId++}`;

  const win = new BrowserWindow({
    width,
    height,
    minWidth: options.minWidth || 360,
    minHeight: options.minHeight || 220,
    x: pos?.x,
    y: pos?.y,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: false,
    backgroundColor: options.backgroundColor || '#252526',
    resizable: options.resizable !== false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    show: false,
    parent: options.modal ? owner : undefined,
    modal: !!options.modal,
    alwaysOnTop: false,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  let shown = false;
  const showWin = () => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    win.show();
    win.focus();
  };

  popups.set(id, {
    win,
    ownerId: owner?.webContents?.id,
    kind: options.kind || 'generic',
    show: showWin,
  });

  const q = new URLSearchParams({
    id,
    kind: options.kind || 'generic',
  });
  win.loadFile(path.join(__dirname, '../renderer/popup.html'), {
    query: Object.fromEntries(q),
  });

  win.once('ready-to-show', () => {
    // Prefer showing only after the renderer has mounted + sized the content
    // (via popup:show) to avoid a resize/reposition flicker. This timer is a
    // safety net so the window can never get stuck hidden.
    setTimeout(showWin, 1500);
  });

  win.on('closed', () => {
    const entry = popups.get(id);
    popups.delete(id);
    if (entry?.ownerId) {
      const ownerWin = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.id === entry.ownerId
      );
      ownerWin?.webContents.send('popup:event', {
        id,
        kind: entry.kind,
        type: 'closed',
      });
    }
  });

  return { id, win };
}

function getPopup(id) {
  return popups.get(id) || null;
}

/** Close every popup owned by a window (its settings / SSH / About dialogs). */
function closePopupsForOwner(ownerWebContentsId) {
  for (const [id, entry] of [...popups]) {
    if (entry.ownerId !== ownerWebContentsId) continue;
    popups.delete(id);
    if (!entry.win.isDestroyed()) entry.win.destroy();
  }
}

/** Close every popup (app quit). */
function closeAllPopups() {
  for (const [id, entry] of [...popups]) {
    popups.delete(id);
    if (!entry.win.isDestroyed()) entry.win.destroy();
  }
}

function closePopup(id) {
  const entry = popups.get(id);
  if (!entry || entry.win.isDestroyed()) return false;
  entry.win.close();
  return true;
}

function fitPopup(id, size = {}) {
  const entry = popups.get(id);
  if (!entry || entry.win.isDestroyed()) return null;
  const display = screen.getDisplayMatching(entry.win.getBounds()).workArea;
  let width = Math.max(360, Math.ceil(size.width || entry.win.getSize()[0]));
  let height = Math.max(220, Math.ceil(size.height || entry.win.getSize()[1]));
  // Clamp to work area so the detached popup stays usable without inner scroll.
  width = Math.min(width, Math.max(360, display.width - 16));
  height = Math.min(height, Math.max(220, display.height - 16));
  const [cw, ch] = entry.win.getSize();
  entry.win.setContentSize(width, height);
  const b = entry.win.getBounds();
  let x = b.x;
  let y = b.y;
  if (x + b.width > display.x + display.width) {
    x = display.x + display.width - b.width;
  }
  if (y + b.height > display.y + display.height) {
    y = display.y + display.height - b.height;
  }
  if (x < display.x) x = display.x;
  if (y < display.y) y = display.y;
  entry.win.setPosition(Math.round(x), Math.round(y));
  return { width, height, prev: { cw, ch } };
}

function registerPopupIpc() {
  ipcMain.handle('popup:open', (event, options = {}) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const { id, win } = createPopupWindow(owner, options || {});
    return { id, kind: options.kind || 'generic' };
  });

  ipcMain.handle('popup:close', (_e, id) => closePopup(id));

  // A toolbar button pressed while its dialog is already open: bring it to the front.
  ipcMain.handle('popup:focus', (_e, id) => {
    const entry = popups.get(id);
    if (!entry || entry.win.isDestroyed()) return false;
    if (entry.win.isMinimized()) entry.win.restore();
    entry.show?.();
    entry.win.show();
    entry.win.moveTop();
    entry.win.focus();
    return true;
  });

  ipcMain.handle('popup:show', (_e, id) => {
    const entry = popups.get(id);
    if (!entry || entry.win.isDestroyed()) return false;
    entry.show?.();
    return true;
  });

  ipcMain.handle('popup:fit', (_e, payload = {}) =>
    fitPopup(payload.id, { width: payload.width, height: payload.height })
  );

  // Fixed-size popups (settings) lock the frame once their content is measured.
  ipcMain.handle('popup:setResizable', (_e, payload = {}) => {
    const entry = popups.get(payload.id);
    if (!entry || entry.win.isDestroyed()) return false;
    entry.win.setResizable(payload.resizable !== false);
    return true;
  });

  ipcMain.handle('popup:send', (event, payload = {}) => {
    const { id, message } = payload;
    const entry = popups.get(id);
    if (!entry || entry.win.isDestroyed()) return false;
    // Owner -> popup
    if (event.sender.id === entry.ownerId) {
      entry.win.webContents.send('popup:message', message || {});
      return true;
    }
    // Popup -> owner
    if (event.sender.id === entry.win.webContents.id) {
      const ownerWin = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.id === entry.ownerId
      );
      ownerWin?.webContents.send('popup:event', {
        id,
        kind: entry.kind,
        ...(message || {}),
      });
      return true;
    }
    return false;
  });

  ipcMain.handle('popup:getId', (event) => {
    for (const [id, entry] of popups) {
      if (entry.win.webContents.id === event.sender.id) return id;
    }
    return null;
  });
}

module.exports = {
  registerPopupIpc,
  closePopupsForOwner,
  closeAllPopups,
  createPopupWindow,
  closePopup,
  fitPopup,
  getPopup,
};
