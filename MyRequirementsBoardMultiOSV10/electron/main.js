import { app, BrowserWindow, nativeImage, shell, ipcMain, dialog, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setServerDataDir, startServer } from '../server/index.js';
import { closeDatabase } from '../server/db/index.js';
import { loadWindowState, saveWindowState } from './windowState.js';
import { loadAppPreferences, saveAppPreferences, ensureAppPreferences } from './appPreferences.js';
import { UI_MIN_HEIGHT, UI_DEFAULT_WINDOW_WIDTH, UI_DEFAULT_WINDOW_HEIGHT, UI_HEADER_MIN_WIDTH_FALLBACK } from '../config/ui-layout.mjs';

Menu.setApplicationMenu(null);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const APP_VERSION = _require('../package.json').version;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;
let pendingProjectFile = null;
let enforcedMinWidth = UI_HEADER_MIN_WIDTH_FALLBACK;
let enforcedMinHeight = UI_MIN_HEIGHT;

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

function applyMeasuredMinWidth(measuredMin, { lockToCurrentWidth = false, replaceMinimum = false } = {}) {
  const measured = Math.max(Math.ceil(Number(measuredMin) || 0), UI_HEADER_MIN_WIDTH_FALLBACK);
  const [currentWidth, currentHeight] = mainWindow.getContentSize();

  let min;
  if (lockToCurrentWidth) {
    min = Math.max(currentWidth, UI_HEADER_MIN_WIDTH_FALLBACK);
  } else if (replaceMinimum) {
    min = Math.max(measured, currentWidth, UI_HEADER_MIN_WIDTH_FALLBACK);
  } else {
    min = Math.max(measured, enforcedMinWidth);
  }

  if (min === enforcedMinWidth) {
    return { nextWidth: currentWidth, currentHeight, enforcedMinWidth: min };
  }

  enforcedMinWidth = min;
  mainWindow.setMinimumSize(min, enforcedMinHeight);

  let nextWidth = currentWidth;
  if (currentWidth < min) {
    mainWindow.setContentSize(min, currentHeight);
    nextWidth = min;
  }

  return { nextWidth, currentHeight, enforcedMinWidth: min };
}

async function lockCurrentWindowAsMinimum() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const [width, height] = mainWindow.getContentSize();
  const minWidth = Math.max(width, UI_HEADER_MIN_WIDTH_FALLBACK);
  const minHeight = Math.max(height, UI_MIN_HEIGHT);

  enforcedMinWidth = minWidth;
  enforcedMinHeight = minHeight;
  mainWindow.setMinimumSize(minWidth, minHeight);

  await saveWindowState({ width, height, minWidth, minHeight, minSizeLocked: true });
  return { width, height, minWidth, minHeight };
}

function registerWindowBoundsPersistence() {
  let resizeSaveTimer = null;

  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [width, height] = mainWindow.getContentSize();
    void saveWindowState({
      width,
      height,
      minWidth: enforcedMinWidth,
      minHeight: enforcedMinHeight,
    });
  };

  const schedulePersistBounds = () => {
    clearTimeout(resizeSaveTimer);
    resizeSaveTimer = setTimeout(persistBounds, 400);
  };

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
    if (!useExternalDevServer && process.env.NODE_ENV !== 'development') {
      process.env.NODE_ENV = 'production';
    }
    await startServer();
  } else {
    process.env.RUN_MODE = 'electron-dev';
    process.env.ELECTRON_VERSION = process.versions.electron || '';
  }

  const savedWindow = await loadWindowState();
  const initialWidth = Math.max(savedWindow?.width ?? UI_DEFAULT_WINDOW_WIDTH, UI_HEADER_MIN_WIDTH_FALLBACK);
  const initialHeight = Math.max(savedWindow?.height ?? UI_DEFAULT_WINDOW_HEIGHT, UI_MIN_HEIGHT);
  const initialMinWidth = initialWidth;
  const initialMinHeight = initialHeight;
  enforcedMinWidth = initialMinWidth;
  enforcedMinHeight = initialMinHeight;

  const windowIcon = getWindowIcon();
  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: initialMinWidth,
    minHeight: initialMinHeight,
    useContentSize: true,
    title: `MyRequirementsBoard v${APP_VERSION}`,
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

  const port = Number(process.env.PORT) || 3847;
  if (useExternalDevServer && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    await mainWindow.loadURL(`http://127.0.0.1:${port}`);
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

  ipcMain.handle('excel:save', async (_event, { base64, defaultFileName }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Excel 내보내기',
      defaultPath: defaultFileName,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
    return { canceled: false, filePath };
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
    enforcedMinHeight = nextHeight;
    mainWindow.setMinimumSize(nextWidth, nextHeight);
  });

  ipcMain.handle('window:lock-current-min-size', async () => lockCurrentWindowAsMinimum());

  ipcMain.handle('window:apply-default-size', (_event, { width }) => {
    if (!mainWindow) return;
    const nextWidth = Math.max(Number(width) || 0, enforcedMinWidth, UI_HEADER_MIN_WIDTH_FALLBACK);
    const [, currentHeight] = mainWindow.getContentSize();
    mainWindow.setContentSize(nextWidth, currentHeight);
  });

  ipcMain.handle('window:sync-header-layout', async (_event, { defaultWidth, updateMinWidth, lockToCurrentWidth, replaceMinimum }) => {
    if (!mainWindow) return { width: 0, minWidth: 0 };

    const measuredMin = Math.max(Number(defaultWidth) || 0, UI_HEADER_MIN_WIDTH_FALLBACK);

    if (updateMinWidth) {
      const { nextWidth, currentHeight } = applyMeasuredMinWidth(measuredMin, {
        lockToCurrentWidth: Boolean(lockToCurrentWidth),
        replaceMinimum: Boolean(replaceMinimum),
      });
      await saveWindowState({
        width: nextWidth,
        height: currentHeight,
        minWidth: enforcedMinWidth,
        minHeight: enforcedMinHeight,
      });
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
