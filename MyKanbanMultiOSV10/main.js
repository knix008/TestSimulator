const { app, BrowserWindow, shell, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let pendingKprjFile = null;
let lastOpenDir = null;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'kanban-ui.json');
}

function loadUiConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
    lastOpenDir = cfg.lastOpenDir || null;
  } catch {}
}

function saveLastOpenDir(dir) {
  lastOpenDir = dir;
  try {
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')); } catch {}
    cfg.lastOpenDir = dir;
    fs.writeFileSync(getConfigPath(), JSON.stringify(cfg), 'utf8');
  } catch {}
}

function findKprjArg() {
  return process.argv.slice(1).find(a => typeof a === 'string' && a.toLowerCase().endsWith('.kprj')) || null;
}

// Remove default menu bar
Menu.setApplicationMenu(null);

// Handle 'open-file' on macOS
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (filePath.toLowerCase().endsWith('.kprj')) {
    pendingKprjFile = filePath;
    if (mainWindow) sendKprjToRenderer(filePath);
  }
});

function sendKprjToRenderer(filePath) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('open-kprj', filePath);
  }
}

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'MyKanban',
    show: false,
    backgroundColor: '#F1F5F9',
    icon: path.join(__dirname, 'assets', 'icon.ico')
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (pendingKprjFile) {
      setTimeout(() => sendKprjToRenderer(pendingKprjFile), 1500);
      pendingKprjFile = null;
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// IPC: renderer asks for the pending .kprj file path
ipcMain.handle('get-open-file', () => {
  const f = pendingKprjFile;
  pendingKprjFile = null;
  return f;
});

// IPC: renderer asks to read a .kprj file from disk
ipcMain.handle('read-kprj-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// IPC: renderer asks to save a report file (Markdown / Word / PDF)
ipcMain.handle('save-report-dialog', async (event, defaultName, base64Content, mime) => {
  const extFromMime = {
    'text/markdown;charset=utf-8': 'md',
    'text/markdown': 'md',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  };
  const ext = extFromMime[mime] || path.extname(defaultName).replace('.', '') || 'bin';
  const defaultPath = defaultName.endsWith('.' + ext) ? defaultName : `${defaultName}.${ext}`;
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Report',
    defaultPath,
    filters: [{ name: 'Report', extensions: [ext] }],
  });
  if (canceled || !filePath) return { ok: false, cancelled: true };
  try {
    fs.writeFileSync(filePath, Buffer.from(base64Content, 'base64'));
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// IPC: renderer asks to save a .kprj file
ipcMain.handle('save-kprj-dialog', async (event, defaultName, jsonContent) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '프로젝트 내보내기',
    defaultPath: defaultName + '.kprj',
    filters: [{ name: 'MyKanban 프로젝트', extensions: ['kprj'] }]
  });
  if (!filePath) return { ok: false, cancelled: true };
  try {
    fs.writeFileSync(filePath, jsonContent, 'utf8');
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// IPC: renderer asks to open a .kprj file via dialog
// startDir: optional starting directory (defaults to lastOpenDir or Documents)
ipcMain.handle('open-kprj-dialog', async (event, startDir) => {
  const defaultPath = startDir || lastOpenDir || app.getPath('documents');
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '프로젝트 열기',
    defaultPath,
    filters: [{ name: 'MyKanban 프로젝트', extensions: ['kprj'] }],
    properties: ['openFile']
  });
  if (!filePaths || filePaths.length === 0) return { ok: false, cancelled: true };
  const filePath = filePaths[0];
  saveLastOpenDir(path.dirname(filePath));
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { ok: true, content, filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// IPC: renderer asks to pick a SQLite database file
ipcMain.handle('open-sqlite-dialog', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'SQLite DB 파일 선택',
    defaultPath: app.getPath('userData'),
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths?.length) return { ok: false, cancelled: true };
  return { ok: true, filePath: filePaths[0] };
});

// IPC: show native context menu (Electron)
ipcMain.handle('show-context-menu', async (event, items) => {
  return new Promise((resolve) => {
    const menuTemplate = items.map(item => {
      if (item.type === 'separator') return { type: 'separator' };
      return {
        label: item.label,
        enabled: item.enabled !== false,
        click: () => resolve(item.id)
      };
    });
    menuTemplate.push({ type: 'separator' }, { label: '취소', click: () => resolve(null) });
    const menu = Menu.buildFromTemplate(menuTemplate);
    menu.popup({ window: mainWindow, callback: () => resolve(null) });
  });
});

// IPC: get directory of bundled sample.kprj (used as default path for open dialog)
ipcMain.handle('get-sample-dir', () => path.join(__dirname, 'sample'));

// IPC: get app version
ipcMain.handle('get-app-version', () => app.getVersion());

// IPC: get app info for About dialog
ipcMain.handle('get-electron-info', () => {
  const { getAppInfo } = require('./src/api/app-info');
  return { ...getAppInfo(), version: app.getVersion() };
});

app.whenReady().then(async () => {
  try {
    process.env.KANBAN_DATA_PATH = app.getPath('userData');
    loadUiConfig();
    pendingKprjFile = findKprjArg();
    const { startServer } = require('./server');
    const port = await startServer();
    await createWindow(port);
  } catch (err) {
    console.error('MyKanban startup failed:', err);
    dialog.showErrorBox('MyKanban', `시작 중 오류가 발생했습니다.\n\n${err.message || err}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) {
    const { startServer } = require('./server');
    startServer().then(port => createWindow(port));
  }
});
