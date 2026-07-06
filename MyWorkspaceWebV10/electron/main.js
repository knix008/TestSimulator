const { app, BrowserWindow, ipcMain, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// Packaged Chromium loads icudtl.dat from the executable directory; set explicitly
// so child processes find it when cwd or install-time launch differs from exe path.
if (app.isPackaged) {
  app.commandLine.appendSwitch('icu-data-dir', path.dirname(process.execPath));
}
const { loadConfig, getUserDataPaths } = require('../src/main/config');
const { openDatabase, closeDatabase } = require('../src/main/db/connection');
const { registerIpcHandlers } = require('../src/main/ipc/handlers');
const {
  tryGetAssetBytes,
  resolveAssetFromCache,
  guessContentType
} = require('../src/main/services/pageAssetService');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'page-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true
    }
  }
]);

const isDev = process.argv.includes('--dev');
let mainWindow = null;
let db = null;
let sessionUser = null;
let config = null;

function reloadConfig() {
  config = loadConfig();
  return config;
}

function reconnectDatabase() {
  closeDatabase(db);
  config = loadConfig();
  db = openDatabase(config);
  return db;
}

function getBuildIconPath() {
  const buildDir = path.join(__dirname, '..', 'build');
  const icoPath = path.join(buildDir, 'icon.ico');
  const pngPath = path.join(buildDir, 'icon.png');
  const packagedIco = path.join(process.resourcesPath, 'icon.ico');
  const packagedPng = path.join(process.resourcesPath, 'icon.png');

  if (process.platform === 'win32') {
    if (app.isPackaged && fs.existsSync(packagedIco)) {
      return packagedIco;
    }
    if (fs.existsSync(icoPath)) {
      return icoPath;
    }
  }

  if (app.isPackaged && fs.existsSync(packagedPng)) {
    return packagedPng;
  }
  if (fs.existsSync(pngPath)) {
    return pngPath;
  }
  return undefined;
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.shkwon.myworkspace');
}

function getPreloadPath() {
  return path.join(__dirname, 'preload.js');
}

function getRendererPath() {
  return path.join(__dirname, '..', 'src', 'renderer', 'index.html');
}

function attachRendererDiagnostics(webContents) {
  webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      const tag = level >= 3 ? 'ERROR' : 'WARN';
      console.error(`[renderer:${tag}] ${message} (${sourceId}:${line})`);
    }
  });

  webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] render process gone:', details);
  });

  webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[renderer] did-fail-load:', errorCode, errorDescription, validatedURL);
  });
}

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1384,
    height: 921,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'MyWorkspace',
    icon: getBuildIconPath(),
    backgroundColor: '#f6f8fa',
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 12, y: 10 } : undefined,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(getRendererPath());
  attachRendererDiagnostics(mainWindow.webContents);

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized-changed', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized-changed', false);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function registerWindowHandlers() {
  ipcMain.on('renderer:error', (_event, payload) => {
    console.error('[renderer:error]', payload?.message || payload);
    if (payload?.stack) {
      console.error(payload.stack);
    }
    if (payload?.source) {
      console.error(`  at ${payload.source}${payload.line ? `:${payload.line}` : ''}`);
    }
  });

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) {
      return false;
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);

  ipcMain.handle('app:quit', () => {
    app.quit();
  });
}

function ensureAppDirectories() {
  const paths = getUserDataPaths();
  for (const dir of [paths.root, paths.pageAssets, paths.templates]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function registerPageAssetProtocol() {
  protocol.handle('page-asset', async (request) => {
    try {
      const url = new URL(request.url);
      const pageId = Number.parseInt(url.hostname, 10);
      const fileName = decodeURIComponent(url.pathname.replace(/^\//, ''));
      if (!Number.isFinite(pageId) || !fileName) {
        return new Response('Bad Request', { status: 400 });
      }

      let bytes = null;
      if (sessionUser && db) {
        bytes = tryGetAssetBytes(db, sessionUser, pageId, fileName);
      }
      if (!bytes) {
        bytes = resolveAssetFromCache(pageId, fileName);
      }
      if (!bytes) {
        return new Response('Not Found', { status: 404 });
      }

      return new Response(bytes, {
        headers: {
          'Content-Type': guessContentType(fileName)
        }
      });
    } catch {
      return new Response('Internal Server Error', { status: 500 });
    }
  });
}

function bootstrap() {
  ensureAppDirectories();
  config = loadConfig();
  db = openDatabase(config);
  registerPageAssetProtocol();
  registerWindowHandlers();
  registerIpcHandlers({
    getDb: () => db,
    getSessionUser: () => sessionUser,
    setSessionUser: (user) => {
      sessionUser = user;
    },
    getConfig: () => config || loadConfig(),
    reloadConfig,
    reconnectDatabase,
    getMainWindow: () => mainWindow
  });
}

app.whenReady().then(() => {
  bootstrap();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  closeDatabase(db);
  db = null;
});

module.exports = { isDev };
