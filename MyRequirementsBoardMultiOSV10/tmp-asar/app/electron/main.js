import { app, BrowserWindow, nativeImage, shell, ipcMain, dialog, Menu } from 'electron';import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setServerDataDir, startServer } from '../server/index.js';
import { closeDatabase } from '../server/db/index.js';
import { loadWindowState, saveWindowState } from './windowState.js';
import { loadAppPreferences, saveAppPreferences, ensureAppPreferences } from './appPreferences.js';
import { UI_MIN_HEIGHT, UI_DEFAULT_WINDOW_WIDTH, UI_DEFAULT_WINDOW_HEIGHT, UI_HEADER_MIN_WIDTH_FALLBACK } from '../config/ui-layout.mjs';

Menu.setApplicationMenu(null);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;
let pendingProjectFile = null;
let enforcedMinWidth = UI_HEADER_MIN_WIDTH_FALLBACK;

function stripNativeWindowMenu(win) {
  if (!win || win.isDestroyed()) return;
  win.setMenu(null);
  win.setMenuBarVisibility(false);
}

function removeNativeApplicationMenu() {
  Menu.setApplicationMenu(null);
}

function resolveAsset(...segments) {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '..', 'assets');
  return path.join(base, ...segments);
}

function getWindowIcon() {
  const iconPath = process.platform === 'win32'
    ? resolveAsset('icon.ico')
    : resolveAsset('icon.png');
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? undefined : image;
}

function getProjectFileFromArgv(argv) {
  return argv.find((arg) => {
    if (!arg || arg.startsWith('-')) return false;
    return path.extname(arg).toLowerCase() === '.reqtproj';
  });
}

function sendProjectFileToRenderer(filePath) {
  if (!filePath || !mainWindow?.webContents) return;
  mainWindow.webContents.send('open-project-file', filePath);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function getRendererUrl() {
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }
  return `file://${path.join(__dirname, '../dist-renderer/index.html')}`;
}

function applyMeasuredMinWidth(measuredMin) {
  const measured = Math.max(Math.ceil(Number(measuredMin) || 0), UI_HEADER_MIN_WIDTH_FALLBACK);
  const [currentWidth, currentHeight] = mainWindow.getContentSize();
  const min = Math.max(measured, enforcedMinWidth);

  enforcedMinWidth = min;
  mainWindow.setMinimumSize(min, UI_MIN_HEIGHT);

  let nextWidth = currentWidth;
  if (currentWidth < min) {
    mainWindow.setContentSize(min, currentHeight);
    nextWidth = min;
  }

  return { nextWidth, currentHeight, enforcedMinWidth: min };
}

function registerWindowBoundsPersistence() {
  let resizeSaveTimer = null;

  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [width, height] = mainWindow.getContentSize();
    void saveWindowState({ width, height, minWidth: enforcedMinWidth });
  };

  const schedulePersistBounds = () => {
    clearTimeout(resizeSaveTimer);
    resizeSaveTimer = setTimeout(persistBounds, 400);
  };

  mainWindow.on('will-resize', (event, newBounds) => {
    if (newBounds.width < enforcedMinWidth) {
      event.preventDefault();
      const [, height] = mainWindow.getContentSize();
      mainWindow.setContentSize(enforcedMinWidth, height);
    }
  });

  mainWindow.on('resize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    schedulePersistBounds();
  });

  mainWindow.on('close', persistBounds);
}

async function createWindow() {
  const useExternalDevServer = isDev && (
    process.env.USE_EXTERNAL_SERVER === '1'
    || Boolean(process.env.VITE_DEV_SERVER_URL)
  );

  if (!useExternalDevServer) {
    const dataDir = path.join(app.getPath('userData'), 'data');
    setServerDataDir(dataDir);
    process.env.RUN_MODE = 'electron';
    process.env.ELECTRON_VERSION = process.versions.electron || '';
    await startServer();
  } else {
    process.env.RUN_MODE = 'electron-dev';
    process.env.ELECTRON_VERSION = process.versions.electron || '';
  }

  const savedWindow = await loadWindowState();
  const initialWidth = savedWindow?.width ?? UI_DEFAULT_WINDOW_WIDTH;
  const initialHeight = savedWindow?.height ?? UI_DEFAULT_WINDOW_HEIGHT;
  const initialMinWidth = Math.max(
    savedWindow?.minWidth ?? UI_HEADER_MIN_WIDTH_FALLBACK,
    initialWidth,
  );
  enforcedMinWidth = initialMinWidth;

  const windowIcon = getWindowIcon();
  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: initialMinWidth,
    minHeight: UI_MIN_HEIGHT,
    useContentSize: true,
    title: 'MyRequirementsBoard',
    icon: windowIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin' && windowIcon) {
    app.dock?.setIcon(windowIcon);
  }

  stripNativeWindowMenu(mainWindow);
  removeNativeApplicationMenu();
  registerWindowBoundsPersistence();

  const url = getRendererUrl();
  if (isDev) {
    await mainWindow.loadURL(url);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    await mainWindow.loadURL('http://127.0.0.1:3847');
  }

  stripNativeWindowMenu(mainWindow);
  removeNativeApplicationMenu();

  mainWindow.webContents.on('did-finish-load', () => {
    stripNativeWindowMenu(mainWindow);
    removeNativeApplicationMenu();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  mainWindow.on('focus', () => {
    stripNativeWindowMenu(mainWindow);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (pendingProjectFile) {
    sendProjectFileToRenderer(pendingProjectFile);
    pendingProjectFile = null;
  } else {
    const startupFile = getProjectFileFromArgv(process.argv);
    if (startupFile) sendProjectFileToRenderer(startupFile);
  }
}

function registerProjectFileHandlers() {
  ipcMain.handle('project:save', async (_event, { content, defaultPath }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [{ name: 'Requirements Project', extensions: ['reqtproj'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    await fs.writeFile(filePath, content, 'utf8');
    return { canceled: false, filePath };
  });

  ipcMain.handle('project:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Requirements Project', extensions: ['reqtproj'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.length) return { canceled: true };
    const content = await fs.readFile(filePaths[0], 'utf8');
    return { canceled: false, filePath: filePaths[0], content };
  });

  ipcMain.handle('project:read', async (_event, { filePath }) => {
    const content = await fs.readFile(filePath, 'utf8');
    return { content, filePath };
  });

  ipcMain.handle('excel:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Excel 파일 선택',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.length) return { canceled: true };

    const filePath = filePaths[0];
    const buffer = await fs.readFile(filePath);
    return {
      canceled: false,
      filePath,
      fileName: path.basename(filePath),
      base64: buffer.toString('base64'),
    };
  });
}

function registerWindowHandlers() {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:toggle-fullscreen', () => {
    if (!mainWindow) return false;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow.isFullScreen();
  });

  ipcMain.handle('window:quit', () => {
    app.quit();
  });

  ipcMain.handle('window:set-minimum-size', (_event, { width, height }) => {
    if (!mainWindow) return;
    const nextWidth = Math.max(Number(width) || 0, UI_HEADER_MIN_WIDTH_FALLBACK);
    const nextHeight = Math.max(Number(height) || 0, UI_MIN_HEIGHT);
    enforcedMinWidth = nextWidth;
    mainWindow.setMinimumSize(nextWidth, nextHeight);
  });

  ipcMain.handle('window:apply-default-size', (_event, { width }) => {
    if (!mainWindow) return;
    const nextWidth = Math.max(Number(width) || 0, enforcedMinWidth, UI_HEADER_MIN_WIDTH_FALLBACK);
    const [, currentHeight] = mainWindow.getContentSize();
    mainWindow.setContentSize(nextWidth, currentHeight);
  });

  ipcMain.handle('window:sync-header-layout', async (_event, { defaultWidth, updateMinWidth }) => {
    if (!mainWindow) return { width: 0, minWidth: 0 };

    const measuredMin = Math.max(Number(defaultWidth) || 0, UI_HEADER_MIN_WIDTH_FALLBACK);

    if (updateMinWidth) {
      const { nextWidth, currentHeight, enforcedMinWidth: enforced } = applyMeasuredMinWidth(measuredMin);
      await saveWindowState({ width: nextWidth, height: currentHeight, minWidth: enforced });
    }

    const [width] = mainWindow.getContentSize();
    return { width, minWidth: enforcedMinWidth };
  });

  ipcMain.handle('preferences:get', () => loadAppPreferences());

  ipcMain.handle('preferences:ensure', (_event, localFallback) => ensureAppPreferences(localFallback));

  ipcMain.handle('preferences:save', async (_event, partial) => saveAppPreferences(partial));
}

removeNativeApplicationMenu();

app.on('browser-window-created', (_event, win) => {
  stripNativeWindowMenu(win);
  removeNativeApplicationMenu();
  win.webContents.on('did-finish-load', () => {
    stripNativeWindowMenu(win);
    removeNativeApplicationMenu();
  });
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = getProjectFileFromArgv(argv);
    if (filePath) {
      sendProjectFileToRenderer(filePath);
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on('open-file', (event, filePath) => {
  if (path.extname(filePath).toLowerCase() !== '.reqtproj') return;
  event.preventDefault();
  if (mainWindow) {
    sendProjectFileToRenderer(filePath);
  } else {
    pendingProjectFile = filePath;
  }
});

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(getWindowIcon());
  }
  removeNativeApplicationMenu();
  registerProjectFileHandlers();
  registerWindowHandlers();
  return createWindow();
}).catch((err) => {
  console.error('[electron] startup failed:', err);
  if (app.isReady()) {
    dialog.showErrorBox(
      'MyRequirementsBoard',
      `앱을 시작할 수 없습니다.\n\n${err?.message || err}`,
    );
  }
  app.exit(1);
});
app.on('window-all-closed', () => {
  closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  closeDatabase();
});
