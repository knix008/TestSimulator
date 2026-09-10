const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { registerIpcHandlers, closeAllDialogWindows, MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT } = require('./ipc');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';

app.commandLine.appendSwitch('disable-features', 'Autofill');

const PRODUCT = 'CodeFactory';

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    backgroundColor: '#12161c',
    autoHideMenuBar: true,
    show: false,
    title: PRODUCT,
    // No OS title bar: the app draws its own controls at the right of the
    // toolbar, so the chrome matches the theme the user picked.
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    icon: path.join(__dirname, '..', 'build', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());

  // The renderer draws the maximize/restore glyph, so it needs to know when the
  // state changes by any route — double-click, Win+Up, a window manager.
  const sendMaximized = () => win.webContents.send('win:maximized', win.isMaximized());
  win.on('maximize', sendMaximized);
  win.on('unmaximize', sendMaximized);

  // The dialogs are separate windows, but they are not a separate application:
  // when the window that opened them goes, they go with it. Electron destroys
  // child windows with their parent, but a dialog whose opener was already gone
  // would otherwise keep the process alive with no way to reach it.
  win.on('close', () => closeAllDialogWindows());

  // External links open in the user's browser, never inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL('http://localhost:5183');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  return win;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
