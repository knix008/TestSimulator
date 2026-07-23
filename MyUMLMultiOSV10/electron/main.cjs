const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const isSourceRun = process.env.MY_UML_SOURCE_RUN === '1';

if (isSourceRun) {
  app.setPath('userData', path.join(app.getPath('appData'), 'MyUML Source'));
}

app.setAppUserModelId('com.shkwon.myumlmultios');

const appIconPath = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.svg');
const appHtmlPath = path.join(__dirname, '..', 'dist', 'app', 'index.html');
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

let mainWindow;
let pendingProjectPath = findProjectPath(process.argv);

function findProjectPath(argv) {
  return argv.find((argument) => argument.toLowerCase().endsWith('.umlprj'));
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

function rememberDirectory(filePath, kind = 'project') {
  if (!filePath || typeof filePath !== 'string') {
    return;
  }

  try {
    const directory = path.dirname(filePath);
    if (!directory) {
      return;
    }
    const settings = readSettings();
    settings.lastDirectory = directory;
    if (kind === 'image') {
      settings.lastImageDirectory = directory;
    } else {
      settings.lastProjectDirectory = directory;
    }
    writeSettings(settings);
  } catch {
    // ignore persistence failures
  }
}

function rememberProjectDirectory(filePath) {
  rememberDirectory(filePath, 'project');
}

function firstExistingDirectory(...candidates) {
  for (const directory of candidates) {
    if (typeof directory === 'string' && directory && fs.existsSync(directory)) {
      return directory;
    }
  }
  return app.getPath('documents');
}

function lastProjectDirectory() {
  const settings = readSettings();
  return firstExistingDirectory(
    settings.lastProjectDirectory,
    settings.lastDirectory,
    settings.lastImageDirectory
  );
}

function lastImageDirectory() {
  const settings = readSettings();
  return firstExistingDirectory(
    settings.lastImageDirectory,
    settings.lastDirectory,
    settings.lastProjectDirectory
  );
}

function sendProjectToRenderer(filePath) {
  if (!mainWindow || !filePath) {
    return;
  }

  try {
    const projectData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    rememberProjectDirectory(filePath);
    const detail = {
      project: projectData,
      filePath
    };
    const serialized = JSON.stringify(detail).replaceAll('<', '\\u003c');

    mainWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('my-uml-open-project', { detail: ${serialized} }));`).catch(() => undefined);
  } catch {
    mainWindow.webContents.executeJavaScript(`window.alert('Unable to open UML project file.');`).catch(() => undefined);
  }
}

function reloadMainWindowFromDisk() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  // Source runs rebuild dist/ before launch; always pick up the latest bundle.
  mainWindow.loadFile(appHtmlPath);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: 'MyUML v0.0.1',
    width: 1440,
    height: 940,
    minWidth: 1320,
    minHeight: 820,
    backgroundColor: '#f2f0e7',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(appHtmlPath);
  mainWindow.webContents.once('did-finish-load', () => {
    sendProjectToRenderer(pendingProjectPath);
    pendingProjectPath = undefined;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', async (event) => {
    let hasUnsaved = false;
    try {
      hasUnsaved = await mainWindow.webContents.executeJavaScript(
        'typeof window.__myuml_has_unsaved_changes === "function" ? window.__myuml_has_unsaved_changes() : false'
      );
    } catch {
      // renderer not ready — allow close
    }

    if (!hasUnsaved) {
      return;
    }

    event.preventDefault();

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Unsaved Changes',
      message: 'Do you want to save changes before closing?',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2
    });

    if (response === 2) {
      // Cancel — do nothing
      return;
    }

    if (response === 1) {
      // Don't Save — close without saving
      mainWindow.destroy();
      return;
    }

    // Save — attempt save then close if successful
    let saved = false;
    try {
      saved = await mainWindow.webContents.executeJavaScript(
        'typeof window.__myuml_save_project === "function" ? window.__myuml_save_project() : Promise.resolve(false)'
      );
    } catch {
      // ignore
    }

    if (saved) {
      mainWindow.destroy();
    }
  });
}

ipcMain.handle('project:open', async () => {
  if (!mainWindow) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open project',
    defaultPath: lastProjectDirectory(),
    filters: [
      { name: 'MyUML project', extensions: ['umlprj', 'json'] },
      { name: 'All files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const filePath = result.filePaths[0];
  rememberProjectDirectory(filePath);

  return {
    filePath,
    contents: fs.readFileSync(filePath, 'utf8')
  };
});

ipcMain.handle('project:save', async (_event, payload = {}) => {
  if (!mainWindow) {
    return null;
  }

  const suggestedName = typeof payload.suggestedName === 'string' && payload.suggestedName.trim()
    ? payload.suggestedName.trim()
    : 'my-uml-project.umlprj';
  const contents = typeof payload.contents === 'string' ? payload.contents : '';
  let targetPath = typeof payload.existingPath === 'string' && payload.existingPath.trim()
    ? payload.existingPath.trim()
    : undefined;

  if (!targetPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save project',
      defaultPath: path.join(lastProjectDirectory(), suggestedName),
      filters: [
        { name: 'MyUML project', extensions: ['umlprj', 'json'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    targetPath = result.filePath.endsWith('.umlprj') || result.filePath.endsWith('.json')
      ? result.filePath
      : `${result.filePath}.umlprj`;
  }

  fs.writeFileSync(targetPath, contents, 'utf8');
  rememberProjectDirectory(targetPath);

  return { filePath: targetPath };
});

ipcMain.handle('image:save', async (_event, payload = {}) => {
  if (!mainWindow) {
    return null;
  }

  const format = typeof payload.format === 'string' && payload.format.trim()
    ? payload.format.trim().toLowerCase()
    : 'png';
  const extension = format === 'jpeg' ? 'jpg' : format;
  const suggestedName = typeof payload.suggestedName === 'string' && payload.suggestedName.trim()
    ? payload.suggestedName.trim()
    : `diagram.${extension}`;
  const dataBase64 = typeof payload.dataBase64 === 'string' ? payload.dataBase64 : '';
  if (!dataBase64) {
    return null;
  }

  const filterByFormat = {
    png: { name: 'PNG image', extensions: ['png'] },
    jpg: { name: 'JPEG image', extensions: ['jpg', 'jpeg'] },
    jpeg: { name: 'JPEG image', extensions: ['jpg', 'jpeg'] },
    gif: { name: 'GIF image', extensions: ['gif'] },
    webp: { name: 'WebP image', extensions: ['webp'] }
  };
  const primaryFilter = filterByFormat[extension] ?? filterByFormat.png;

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save diagram image',
    defaultPath: path.join(lastImageDirectory(), suggestedName),
    filters: [
      primaryFilter,
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  let targetPath = result.filePath;
  const lower = targetPath.toLowerCase();
  if (!primaryFilter.extensions.some((ext) => lower.endsWith(`.${ext}`))) {
    targetPath = `${targetPath}.${extension}`;
  }

  fs.writeFileSync(targetPath, Buffer.from(dataBase64, 'base64'));
  rememberDirectory(targetPath, 'image');

  return { filePath: targetPath };
});

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const projectPath = findProjectPath(argv);

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();

      if (isSourceRun) {
        pendingProjectPath = projectPath;
        mainWindow.webContents.once('did-finish-load', () => {
          sendProjectToRenderer(pendingProjectPath);
          pendingProjectPath = undefined;
        });
        reloadMainWindowFromDisk();
      } else {
        sendProjectToRenderer(projectPath);
      }
    } else {
      pendingProjectPath = projectPath;
    }
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady() && mainWindow) {
    sendProjectToRenderer(filePath);
  } else {
    pendingProjectPath = filePath;
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
