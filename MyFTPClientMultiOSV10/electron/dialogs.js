// Popup dialogs as their own OS windows: movable anywhere, torn down with
// the main window. Opening a dialog that is already open focuses it (and
// refreshes its payload) instead of creating a second copy.
'use strict';

const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

/** @type {Map<string, {win: BrowserWindow, payload: any, openerId: number|null, submitted: boolean, reveal?: Function}>} */
const dialogWindows = new Map();

// Popups are never user-resizable. `fit: false` keeps a designed size (settings
// tabs); the rest are sized once to their content, then locked.
const DIALOG_SPECS = {
  settings: { width: 540, height: 520, minWidth: 540, minHeight: 520, maxWidth: 540, maxHeight: 520, fit: false },
  about: { width: 520, height: 360, minWidth: 420, minHeight: 240 },
  error: { width: 580, height: 280, minWidth: 420, minHeight: 200 },
  message: { width: 520, height: 240, minWidth: 400, minHeight: 180 },
  confirm: { width: 500, height: 240, minWidth: 400, minHeight: 180 },
  prompt: { width: 460, height: 220, minWidth: 360, minHeight: 180 },
  conflict: { width: 540, height: 280, minWidth: 420, minHeight: 200 },
  profileDelete: { width: 440, height: 280, minWidth: 360, minHeight: 200 },
};

function clampToWorkArea(win, width, height) {
  const display = screen.getDisplayMatching(win.getBounds());
  const wa = display.workAreaSize;
  return {
    width: Math.min(Math.max(200, Math.round(width)), wa.width),
    height: Math.min(Math.max(120, Math.round(height)), wa.height),
  };
}

function applyLockedDialogSize(win, width, height) {
  if (!win || win.isDestroyed()) return false;
  const size = clampToWorkArea(win, width, height);
  const w = size.width;
  const h = size.height;
  try {
    win.setResizable(true);
    win.setMaximizable(true);
    win.setMaximumSize(Math.max(w, 4000), Math.max(h, 4000));
    win.setMinimumSize(1, 1);
    win.setSize(w, h);
    win.setMinimumSize(w, h);
    win.setMaximumSize(w, h);
  } finally {
    if (!win.isDestroyed()) {
      win.setResizable(false);
      win.setMaximizable(false);
    }
  }
  return true;
}

function iconPath() {
  const dir = path.join(__dirname, '..', 'build', 'icons');
  return path.join(dir, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

function dialogUrl(name, isDev) {
  const hash = 'dialog=' + encodeURIComponent(name);
  if (isDev) return `http://localhost:5187/#${hash}`;
  return { file: path.join(__dirname, '..', 'dist', 'index.html'), hash };
}

function appearanceOf(getApi) {
  try {
    const s = getApi().session.get();
    return { theme: s.theme, language: s.language, fontSize: s.fontSize, bg: s.themeBg || '#12161c' };
  } catch {
    return { theme: 'midnight', language: 'ko', fontSize: 13, bg: '#12161c' };
  }
}

function openDialogWindow(name, payload, opener, getApi, isDev) {
  const appearance = { ...appearanceOf(getApi), ...((payload && payload.appearance) || {}) };
  const nextPayload = { ...(payload || {}), appearance };

  const existing = dialogWindows.get(name);
  if (existing && !existing.win.isDestroyed()) {
    existing.payload = nextPayload;
    existing.submitted = false;
    if (existing.win.webContents && !existing.win.webContents.isDestroyed()) {
      existing.win.webContents.send('dialog:payload', nextPayload);
    }
    if (existing.win.isMinimized()) existing.win.restore();
    existing.win.show();
    existing.win.focus();
    return true;
  }

  const spec = DIALOG_SPECS[name] || { width: 520, height: 360, minWidth: 360, minHeight: 180 };
  const parentOk = opener && !opener.isDestroyed();
  const width = spec.width;
  const height = spec.height;
  let x, y;
  if (parentOk) {
    const pb = opener.getBounds();
    x = Math.round(pb.x + (pb.width - width) / 2);
    y = Math.round(pb.y + (pb.height - height) / 2);
  }

  const win = new BrowserWindow({
    width, height, x, y,
    minWidth: spec.minWidth || 320,
    minHeight: spec.minHeight || 160,
    ...(spec.maxWidth ? { maxWidth: spec.maxWidth } : {}),
    ...(spec.maxHeight ? { maxHeight: spec.maxHeight } : {}),
    // Child of the main window: destroyed with it, but not modal so the user
    // can drag it anywhere (including onto another monitor).
    parent: parentOk ? opener : undefined,
    modal: false,
    resizable: false,
    movable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: appearance.bg || '#12161c',
    title: (payload && payload.title) || 'My FTP Client',
    icon: fs.existsSync(iconPath()) ? iconPath() : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  dialogWindows.set(name, { win, payload: nextPayload, openerId: parentOk ? opener.id : null, submitted: false });

  const reveal = () => {
    if (win.isDestroyed() || win.isVisible()) return;
    win.setOpacity(0);
    win.show();
    setTimeout(() => { if (!win.isDestroyed()) win.setOpacity(1); }, 50);
  };
  dialogWindows.get(name).reveal = reveal;
  win.once('ready-to-show', () => setTimeout(reveal, 400));

  const target = dialogUrl(name, isDev);
  if (typeof target === 'string') win.loadURL(target);
  else win.loadFile(target.file, { hash: target.hash });

  win.on('closed', () => {
    const entry = dialogWindows.get(name);
    dialogWindows.delete(name);
    const opener2 = entry && entry.openerId !== null ? BrowserWindow.fromId(entry.openerId) : null;
    if (opener2 && !opener2.isDestroyed() && opener2.webContents && !opener2.webContents.isDestroyed()) {
      try {
        if (!entry.submitted) opener2.webContents.send('dialog:result', { name, data: null });
        opener2.webContents.send('dialog:closed', { name });
      } catch { /* shutting down */ }
    }
  });
  return true;
}

function closeAllDialogWindows() {
  for (const entry of [...dialogWindows.values()]) {
    if (!entry.win.isDestroyed()) entry.win.destroy();
  }
  dialogWindows.clear();
}

function entryForSender(sender) {
  for (const [name, entry] of dialogWindows) {
    if (!entry.win.isDestroyed() && entry.win.webContents.id === sender.id) return { name, entry };
  }
  return null;
}

function registerDialogHandlers(getMain, getApi, isDev) {
  ipcMain.handle('dialog:openWindow', (event, { name, payload }) => {
    const opener = BrowserWindow.fromWebContents(event.sender) || getMain();
    return openDialogWindow(name, payload, opener, getApi, isDev);
  });

  ipcMain.handle('dialog:getPayload', (event) => {
    const found = entryForSender(event.sender);
    return found ? { name: found.name, payload: found.entry.payload } : null;
  });

  ipcMain.handle('dialog:submit', (event, { name, data, keepOpen }) => {
    const entry = dialogWindows.get(name);
    if (!entry) return false;
    if (!keepOpen) entry.submitted = true;
    const opener = entry.openerId !== null ? BrowserWindow.fromId(entry.openerId) : getMain();
    if (opener && !opener.isDestroyed() && opener.webContents && !opener.webContents.isDestroyed()) {
      opener.webContents.send('dialog:result', { name, data });
    }
    return true;
  });

  ipcMain.handle('dialog:closeWindow', (_event, name) => {
    const entry = dialogWindows.get(name);
    if (entry && !entry.win.isDestroyed()) entry.win.close();
    return true;
  });

  ipcMain.handle('dialog:ready', (event) => {
    const found = entryForSender(event.sender);
    if (found && found.entry.reveal) found.entry.reveal();
    return true;
  });

  ipcMain.handle('dialog:closeSelf', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.close();
    return true;
  });

  ipcMain.handle('dialog:broadcastAppearance', (_event, appearance) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('dialog:appearance', appearance);
    }
    return true;
  });

  ipcMain.handle('dialog:setSize', (event, { width, height }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || win.isMaximized()) return false;
    const found = entryForSender(event.sender);
    const spec = found ? DIALOG_SPECS[found.name] : null;
    if (spec && spec.fit === false) return false;
    return applyLockedDialogSize(win, width, height);
  });
}

module.exports = { registerDialogHandlers, closeAllDialogWindows, dialogWindows };
