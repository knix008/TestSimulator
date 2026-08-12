const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

/** @type {Electron.BrowserWindow | null} */
let previewWin = null;
let lastHint = null;

function ensurePreviewWindow() {
  if (previewWin && !previewWin.isDestroyed()) return previewWin;

  previewWin = new BrowserWindow({
    width: 640,
    height: 420,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    thickFrame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  previewWin.setIgnoreMouseEvents(true, { forward: true });
  previewWin.setMenuBarVisibility(false);
  lastHint = null;

  previewWin.on('closed', () => {
    previewWin = null;
    lastHint = null;
  });

  return previewWin;
}

function showDetachPreview(options = {}) {
  const width = Math.max(360, Math.round(options.width || 640));
  const height = Math.max(240, Math.round(options.height || 420));
  const x = Math.round(Number.isFinite(options.x) ? options.x : 0);
  const y = Math.round(Number.isFinite(options.y) ? options.y : 0);
  const hint = typeof options.hint === 'string' ? options.hint : '';

  const win = ensurePreviewWindow();
  if (hint !== lastHint) {
    lastHint = hint;
    win.loadFile(path.join(__dirname, '../renderer/detach-preview.html'), {
      query: hint ? { hint } : {},
    });
  }

  win.setBounds({ x, y, width, height });
  if (!win.isVisible()) win.showInactive();
  return true;
}

function moveDetachPreview(options = {}) {
  if (!previewWin || previewWin.isDestroyed()) return false;
  const b = previewWin.getBounds();
  const x = Number.isFinite(options.x) ? Math.round(options.x) : b.x;
  const y = Number.isFinite(options.y) ? Math.round(options.y) : b.y;
  previewWin.setPosition(x, y);
  return true;
}

function hideDetachPreview() {
  if (!previewWin || previewWin.isDestroyed()) return false;
  previewWin.hide();
  return true;
}

function destroyDetachPreview() {
  if (!previewWin || previewWin.isDestroyed()) {
    previewWin = null;
    lastHint = null;
    return;
  }
  previewWin.destroy();
  previewWin = null;
  lastHint = null;
}

function registerDetachPreviewIpc() {
  ipcMain.handle('detachPreview:show', (_e, options) => showDetachPreview(options || {}));
  ipcMain.on('detachPreview:move', (_e, options) => moveDetachPreview(options || {}));
  ipcMain.handle('detachPreview:hide', () => hideDetachPreview());
}

module.exports = {
  registerDetachPreviewIpc,
  showDetachPreview,
  moveDetachPreview,
  hideDetachPreview,
  destroyDetachPreview,
};
