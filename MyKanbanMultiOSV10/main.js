const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let pendingKprjFile = null; // .kprj file to open after window loads

// Find .kprj file in process arguments (Windows file association)
function findKprjArg() {
  return process.argv.slice(1).find(a => typeof a === 'string' && a.toLowerCase().endsWith('.kprj')) || null;
}

// Handle 'open-file' on macOS (before app is ready)
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
    // Send pending .kprj file after renderer is ready
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
ipcMain.handle('open-kprj-dialog', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '프로젝트 가져오기',
    filters: [{ name: 'MyKanban 프로젝트', extensions: ['kprj'] }],
    properties: ['openFile']
  });
  if (!filePaths || filePaths.length === 0) return { ok: false, cancelled: true };
  try {
    const content = fs.readFileSync(filePaths[0], 'utf8');
    return { ok: true, content, filePath: filePaths[0] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(async () => {
  process.env.KANBAN_DATA_PATH = app.getPath('userData');

  // Check for .kprj argument on startup (Windows file association)
  pendingKprjFile = findKprjArg();

  const { startServer } = require('./server');
  const port = await startServer();
  await createWindow(port);
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
