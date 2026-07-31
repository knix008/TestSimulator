const { app, BrowserWindow, shell, ipcMain, dialog, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null;
let isQuitting = false;

// Remove default menu bar
Menu.setApplicationMenu(null);

function trayIconPath() {
  return path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icons/32x32.png');
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  try {
    tray = new Tray(trayIconPath());
  } catch (err) {
    console.warn('트레이 생성 실패:', err.message);
    return;
  }
  tray.setToolTip('MyCalendar');
  const menu = Menu.buildFromTemplate([
    { label: '열기 (Show)', click: showWindow },
    { type: 'separator' },
    { label: '종료 (Quit)', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  // single click (or double-click on Windows) restores the window
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
}

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 900,
    minWidth: 760,
    minHeight: 520,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'MyCalendar',
    show: false,
    frame: false,            // no OS title bar — custom controls live in the toolbar
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icons/512x512.png')
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Closing the window hides it to the system tray instead of quitting.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  createTray();

  // Keyboard shortcuts forwarded to renderer
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
    const key = input.key?.toLowerCase();
    if (key === 'n') {
      event.preventDefault();
      mainWindow.webContents.send('new-event-shortcut');
    }
  });

  // Open external links in the system browser (needed for Google OAuth consent)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// IPC: open a URL externally (Google OAuth consent page)
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
  return { ok: true };
});

// IPC: set window transparency (0.4 – 1.0). Uses OS-level layered-window alpha,
// which is reliable across Windows/macOS unlike CSS-only transparency.
ipcMain.handle('set-window-opacity', (event, value) => {
  const v = Math.min(1, Math.max(0.4, Number(value) || 1));
  if (mainWindow) mainWindow.setOpacity(v);
  return { ok: true };
});

// IPC: app version for the About dialog
ipcMain.handle('get-app-version', () => app.getVersion());

// IPC: custom window controls (frameless window)
ipcMain.handle('win-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.handle('win-maximize-toggle', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) { mainWindow.unmaximize(); return false; }
  mainWindow.maximize(); return true;
});
ipcMain.handle('win-close', () => { if (mainWindow) mainWindow.close(); });
ipcMain.handle('win-is-maximized', () => !!(mainWindow && mainWindow.isMaximized()));

// IPC: export calendar (.ics) via native save dialog
ipcMain.handle('save-ics-dialog', async (event, defaultName, content) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: '캘린더 내보내기',
    defaultPath: (defaultName || 'calendar') + '.ics',
    filters: [{ name: 'iCalendar', extensions: ['ics'] }]
  });
  if (canceled || !filePath) return { ok: false, cancelled: true };
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Single instance lock — avoids two servers fighting for the same DB
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      process.env.CALENDAR_DATA_PATH = app.getPath('userData');
      const { startServer } = require('./server');
      const port = await startServer();
      await createWindow(port);
    } catch (err) {
      console.error('MyCalendar startup failed:', err);
      dialog.showErrorBox('MyCalendar', `시작 중 오류가 발생했습니다.\n\n${err.message || err}`);
      app.quit();
    }
  });
}

// Any explicit quit (tray menu, Cmd+Q, etc.) should tear down for real.
app.on('before-quit', () => { isQuitting = true; });

// With a tray icon the app keeps running when the window is closed/hidden,
// so don't auto-quit on window-all-closed (the tray "Quit" is the exit path).
app.on('window-all-closed', () => {
  // intentionally no-op: use the tray "종료 (Quit)" menu to exit
});

app.on('activate', () => {
  if (mainWindow) showWindow();
  else {
    const { startServer } = require('./server');
    startServer().then(port => createWindow(port));
  }
});
