const { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const isDev = !app.isPackaged;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#12151c' : '#f3f5f8',
    title: 'Sound Effect Studio',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    show: false
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  if (isDev) {
    // Optional: open DevTools in development
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function getAppIconPath() {
  if (process.platform === 'win32') {
    return path.join(__dirname, '..', 'build', 'icon.ico');
  }
  return path.join(__dirname, '..', 'build', 'icons', '512x512.png');
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Audio…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-audio')
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save-audio')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const AUDIO_EXTENSIONS = [
  'wav', 'wave', 'mp3', 'mp2', 'mpga', 'mpeg',
  'ogg', 'oga', 'opus', 'flac', 'aac', 'm4a', 'm4b', 'mp4',
  'webm', 'weba', 'aiff', 'aif', 'aifc', 'caf', '3gp', '3g2'
];

ipcMain.handle('dialog:openAudio', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Audio',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: AUDIO_EXTENSIONS },
      { name: 'WAVE', extensions: ['wav', 'wave'] },
      { name: 'MP3', extensions: ['mp3', 'mp2', 'mpga', 'mpeg'] },
      { name: 'AAC / M4A', extensions: ['aac', 'm4a', 'm4b', 'mp4'] },
      { name: 'OGG / Opus', extensions: ['ogg', 'oga', 'opus'] },
      { name: 'FLAC', extensions: ['flac'] },
      { name: 'AIFF', extensions: ['aiff', 'aif', 'aifc'] },
      { name: 'WebM', extensions: ['webm', 'weba'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return [];

  const files = [];
  for (const filePath of result.filePaths) {
    const data = await fsp.readFile(filePath);
    files.push({
      name: path.basename(filePath),
      path: filePath,
      buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    });
  }
  return files;
});

ipcMain.handle('dialog:saveAudio', async (_event, { defaultName, data, extension }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Audio',
    defaultPath: defaultName || `export.${extension || 'wav'}`,
    filters: [
      { name: 'WAV', extensions: ['wav'] },
      { name: 'WebM', extensions: ['webm'] }
    ]
  });
  if (result.canceled || !result.filePath) return { ok: false };

  const buffer = Buffer.from(data);
  await fsp.writeFile(result.filePath, buffer);
  return { ok: true, path: result.filePath };
});

ipcMain.handle('app:getPath', (_event, name) => app.getPath(name || 'userData'));

app.whenReady().then(() => {
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture'].includes(permission);
    callback(allowed);
  });

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
