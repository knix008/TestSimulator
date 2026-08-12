const { Tray, Menu, BrowserWindow, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');

/** @type {Electron.Tray | null} */
let tray = null;
let isQuitting = false;

function getIconPath() {
  const candidates = [
    path.join(__dirname, '../../build/icon.png'),
    path.join(__dirname, '../../assets/icons/icon.png'),
    path.join(process.resourcesPath || '', 'icons', 'icon.png'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function labels(lang) {
  if (lang === 'ko') {
    return {
      show: '열기',
      settings: '설정',
      quit: '종료',
      tooltip: 'MyTerminal',
    };
  }
  return {
    show: 'Show',
    settings: 'Settings',
    quit: 'Quit',
    tooltip: 'MyTerminal',
  };
}

function getFocusWindow(windows) {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  for (const win of windows) {
    if (!win.isDestroyed()) return win;
  }
  return null;
}

function showWindow(windows, createWindow) {
  let win = getFocusWindow(windows);
  if (!win) win = createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return win;
}

function showAndOpenSettings(windows, createWindow) {
  const win = showWindow(windows, createWindow);
  win.webContents.send('tray:openSettings');
}

function rebuildMenu(windows, createWindow, lang) {
  if (!tray) return;
  const t = labels(lang);
  const menu = Menu.buildFromTemplate([
    {
      label: t.show,
      click: () => showWindow(windows, createWindow),
    },
    {
      label: t.settings,
      click: () => showAndOpenSettings(windows, createWindow),
    },
    { type: 'separator' },
    {
      label: t.quit,
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(t.tooltip);
}

function createTray(windows, createWindow, lang = 'en') {
  destroyTray();
  const iconPath = getIconPath();
  if (!iconPath) return null;

  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return null;
  if (process.platform === 'win32') {
    image = image.resize({ width: 16, height: 16 });
  }

  tray = new Tray(image);
  rebuildMenu(windows, createWindow, lang);
  tray.on('click', () => showAndOpenSettings(windows, createWindow));
  // macOS / some platforms treat click differently; double-click also opens settings.
  tray.on('double-click', () => showAndOpenSettings(windows, createWindow));
  return tray;
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function isTrayActive() {
  return !!tray;
}

function setQuitting(value) {
  isQuitting = !!value;
}

function getIsQuitting() {
  return isQuitting;
}

module.exports = {
  createTray,
  destroyTray,
  rebuildMenu,
  isTrayActive,
  setQuitting,
  getIsQuitting,
  showWindow,
  showAndOpenSettings,
};
