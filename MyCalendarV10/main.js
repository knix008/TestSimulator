const { app, BrowserWindow, shell, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Remove default menu bar
Menu.setApplicationMenu(null);

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 480,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'MyCalendar',
    show: false,
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icons/512x512.png')
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) {
    const { startServer } = require('./server');
    startServer().then(port => createWindow(port));
  }
});
