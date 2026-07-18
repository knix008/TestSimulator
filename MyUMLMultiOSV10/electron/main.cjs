const { app, BrowserWindow, Menu, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let mainWindow;
let pendingProjectPath = findProjectPath(process.argv);

function findProjectPath(argv) {
  return argv.find((argument) => argument.toLowerCase().endsWith('.umlprj'));
}

function sendProjectToRenderer(filePath) {
  if (!mainWindow || !filePath) {
    return;
  }

  try {
    const projectData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const serialized = JSON.stringify(projectData).replaceAll('<', '\\u003c');

    mainWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('my-uml-open-project', { detail: ${serialized} }));`).catch(() => undefined);
  } catch {
    mainWindow.webContents.executeJavaScript(`window.alert('Unable to open UML project file.');`).catch(() => undefined);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1180,
    minHeight: 820,
    backgroundColor: '#f2f0e7',
    icon: path.join(__dirname, '..', 'assets', 'app-icon.svg'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'app', 'index.html'));
  mainWindow.webContents.once('did-finish-load', () => {
    sendProjectToRenderer(pendingProjectPath);
    pendingProjectPath = undefined;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

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
      sendProjectToRenderer(projectPath);
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
