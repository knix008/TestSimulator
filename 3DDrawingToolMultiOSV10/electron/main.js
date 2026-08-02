import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

// Windows taskbar grouping / icon identity
if (process.platform === 'win32') {
  app.setAppUserModelId('com.shkwon.3ddrawingtool');
}

function resolveAppIcon() {
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(__dirname, 'assets', 'icon.ico'),
          path.join(__dirname, '../build/icon.ico'),
          path.join(__dirname, 'assets', 'icon.png'),
          path.join(__dirname, '../build/icon.png'),
        ]
      : [
          path.join(__dirname, 'assets', 'icon.png'),
          path.join(__dirname, '../build/icon.png'),
          path.join(__dirname, 'assets', 'icon.ico'),
        ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function loadAppIcon() {
  const iconPath = resolveAppIcon();
  if (!iconPath) return undefined;
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? undefined : image;
}

let mainWindow = null;

function createWindow() {
  const icon = loadAppIcon();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    frame: false,
    titleBarStyle: 'hidden',
    title: '3D Drawing Tool',
    backgroundColor: '#0f1419',
    show: false,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // No developer / code inspection window
      devTools: false,
    },
  });

  if (icon) {
    // Re-apply after creation — Windows taskbar caches the first icon
    mainWindow.setIcon(icon);
    // Force title used by some shells
    mainWindow.setTitle('3D Drawing Tool');
  }

  // Block common DevTools shortcuts (F12, Ctrl+Shift+I/J/C)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = input.key?.toLowerCase();
    if (input.type !== 'keyDown') return;
    if (key === 'f12') {
      event.preventDefault();
      return;
    }
    if (input.control && input.shift && ['i', 'j', 'c'].includes(key)) {
      event.preventDefault();
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (icon) mainWindow?.setIcon(icon);
    // Ensure any leftover DevTools from older runs are closed
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    }
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Also set dock icon on macOS
  const icon = loadAppIcon();
  if (process.platform === 'darwin' && icon && app.dock) {
    app.dock.setIcon(icon);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

ipcMain.handle('dialog:saveProject', async (_event, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: 'untitled.3ddraw',
    filters: [{ name: '3D Drawing Project', extensions: ['3ddraw', 'json'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, data, 'utf-8');
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('dialog:openProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    filters: [{ name: '3D Drawing Project', extensions: ['3ddraw', 'json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
  const filePath = result.filePaths[0];
  const data = fs.readFileSync(filePath, 'utf-8');
  return { canceled: false, filePath, data };
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  await shell.openExternal(url);
});
