const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

/** @type {{ win: Electron.BrowserWindow, ownerId: number, menuId: string, x: number, y: number } | null} */
let dropdown = null;

function notifyOwner(entry, message) {
  if (!entry?.ownerId) return;
  const owner = BrowserWindow.getAllWindows().find((w) => w.webContents.id === entry.ownerId);
  owner?.webContents.send('dropdown:event', { menuId: entry.menuId, ...(message || {}) });
}

function closeDropdown() {
  const entry = dropdown;
  dropdown = null;
  if (!entry) return;
  if (entry.win && !entry.win.isDestroyed()) {
    try {
      entry.win.removeAllListeners('blur');
      if (!entry.win.isDestroyed()) entry.win.close();
    } catch (_) {
      /* ignore */
    }
  }
  notifyOwner(entry, { type: 'closed' });
}

function closeDropdownForOwner(ownerWebContentsId) {
  if (dropdown?.ownerId === ownerWebContentsId) closeDropdown();
}

function clampToDisplay(x, y, width, height) {
  const display = screen.getDisplayNearestPoint({ x, y }).workArea;
  let nextX = x;
  let nextY = y;
  if (nextX + width > display.x + display.width) nextX = display.x + display.width - width;
  if (nextY + height > display.y + display.height) nextY = y - 6 - height;
  if (nextY < display.y) nextY = display.y;
  if (nextX < display.x) nextX = display.x;
  return {
    x: Math.round(nextX),
    y: Math.round(nextY),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function registerDropdownIpc() {
  ipcMain.handle('dropdown:open', (event, payload = {}) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) return false;
    closeDropdown();

    const cb = owner.getContentBounds();
    const anchor = payload.anchor || {};
    const x = Math.round(cb.x + Number(anchor.left || 0));
    const y = Math.round(cb.y + Number(anchor.bottom || 0) + 6);
    const bg = payload.colors?.toolbarBg || '#252526';

    const win = new BrowserWindow({
      width: 280,
      height: 80,
      x,
      y,
      frame: false,
      titleBarStyle: 'hidden',
      transparent: false,
      backgroundColor: bg,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      show: false,
      parent: undefined,
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    dropdown = {
      win,
      ownerId: owner.webContents.id,
      menuId: String(payload.menuId || ''),
      x,
      y,
    };

    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.loadFile(path.join(__dirname, '../renderer/dropdown.html'));
    win.webContents.once('did-finish-load', () => {
      if (!dropdown || dropdown.win !== win || win.isDestroyed()) return;
      win.webContents.send('dropdown:init', {
        html: payload.html || '',
        colors: payload.colors || {},
        menuId: dropdown.menuId,
      });
    });
    win.once('blur', () => {
      setTimeout(() => {
        if (dropdown?.win === win) closeDropdown();
      }, 80);
    });
    win.on('closed', () => {
      if (dropdown?.win === win) {
        const entry = dropdown;
        dropdown = null;
        notifyOwner(entry, { type: 'closed' });
      }
    });
    return true;
  });

  ipcMain.handle('dropdown:fit', (event, payload = {}) => {
    if (!dropdown || dropdown.win.isDestroyed()) return null;
    if (event.sender.id !== dropdown.win.webContents.id) return null;
    const width = Math.max(160, Math.ceil(Number(payload.width) || 160));
    const height = Math.max(40, Math.ceil(Number(payload.height) || 40));
    const bounds = clampToDisplay(dropdown.x, dropdown.y, width, height);
    dropdown.win.setBounds(bounds);
    if (!dropdown.win.isVisible()) dropdown.win.show();
    dropdown.win.focus();
    return bounds;
  });

  ipcMain.handle('dropdown:pick', (event, payload = {}) => {
    if (!dropdown || dropdown.win.isDestroyed()) return false;
    if (event.sender.id !== dropdown.win.webContents.id) return false;
    const entry = dropdown;
    notifyOwner(entry, { type: 'pick', dataset: payload.dataset || {} });
    closeDropdown();
    return true;
  });

  ipcMain.handle('dropdown:close', () => {
    closeDropdown();
    return true;
  });
}

module.exports = {
  registerDropdownIpc,
  closeDropdown,
  closeDropdownForOwner,
};
